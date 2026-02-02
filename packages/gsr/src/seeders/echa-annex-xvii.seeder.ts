// packages/gsr/src/seeders/echa-annex-xvii.seeder.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import {
  EchaAnnexXviiParser,
  type EchaAnnexXviiRecord,
  type AnnexXviiEntry,
  type AnnexXviiSubstance,
  type AnnexXviiParsedData,
} from '../parsers/echa-annex-xvii.parser.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { SubstanceGroup, SubstanceGroupMember, InheritanceType } from '../entities/SubstanceGroup.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { ThresholdOperator } from '../enums/ThresholdOperator.js';
import { Substance } from '@eurocomply/database';
import { findOrCreateSubstance } from '../utils/substance-finder.js';

export interface AnnexXviiSeederResult {
  seeded: boolean;
  skipped: boolean;
  entryCount: number;
  groupCount: number;
  skippedCount: number;
  stubsCreated: number;
  version: string;
  message: string;
}

/**
 * Generates a unique group code from entry number and substance name.
 * Used as the unique identifier for SubstanceGroup entries.
 *
 * @param entryNumber - Annex XVII entry number (e.g., "23", "63")
 * @param substanceName - Substance or group name
 * @returns Normalized group code (e.g., "ANNEX_XVII_63_LEAD_COMPOUNDS")
 */
export function generateGroupCode(entryNumber: string, substanceName: string): string {
  // Normalize substance name
  let normalizedName = substanceName.toUpperCase();

  // Common replacements for cleaner codes
  normalizedName = normalizedName.replace(/\s+AND\s+(ITS|THEIR)\s+COMPOUNDS?/gi, '_COMPOUNDS');
  normalizedName = normalizedName.replace(/\s+AND\s+(ITS|THEIR)\s+SALTS?/gi, '_SALTS');
  normalizedName = normalizedName.replace(/\s+AND\s+DERIVATIVES?/gi, '');
  normalizedName = normalizedName.replace(/[^A-Z0-9]/g, '_');
  normalizedName = normalizedName.replace(/_+/g, '_');
  normalizedName = normalizedName.replace(/^_|_$/g, '');

  // Truncate if too long
  if (normalizedName.length > 60) {
    normalizedName = normalizedName.substring(0, 60);
    // Ensure we don't cut in the middle of an underscore sequence
    normalizedName = normalizedName.replace(/_$/, '');
  }

  return `ANNEX_XVII_${entryNumber}_${normalizedName}`;
}

/**
 * Seeds REACH Annex XVII restriction entries from ECHA CSV files.
 *
 * Creates SubstanceListEntry records linking existing substances
 * to the REACH_ANNEX_XVII regulatory list. For entries covering
 * multiple substances (groups), creates SubstanceGroup records.
 */
export class EchaAnnexXviiSeeder {
  private readonly parser: EchaAnnexXviiParser;

  constructor(private readonly em: EntityManager) {
    this.parser = new EchaAnnexXviiParser();
  }

  /**
   * Seeds Annex XVII from both the entries file (with EUR-Lex URLs) and substances file (with all substances).
   * This is the recommended method for complete and robust data.
   *
   * @param entriesFilePath - Path to the entries/grouped file (has Entry numbers and EUR-Lex URLs)
   * @param substancesFilePath - Path to the substances/expanded file (has all individual substances)
   * @param version - Version identifier for this data (e.g., "2026-01")
   * @returns AnnexXviiSeederResult with counts and status
   */
  async seedFromBothFiles(
    entriesFilePath: string,
    substancesFilePath: string,
    version: string
  ): Promise<AnnexXviiSeederResult> {
    // Check if already seeded with same version
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_ANNEX_XVII,
    });

    if (existingSource?.version === version) {
      return {
        seeded: false,
        skipped: true,
        entryCount: existingSource.recordCount ?? 0,
        groupCount: 0,
        skippedCount: 0,
        stubsCreated: 0,
        version,
        message: `ECHA Annex XVII already seeded with version ${version}, skipping.`,
      };
    }

    // Parse both files
    const parsedData = await this.parser.parseBothFiles(entriesFilePath, substancesFilePath);

    if (parsedData.entries.length === 0) {
      return {
        seeded: false,
        skipped: true,
        entryCount: 0,
        groupCount: 0,
        skippedCount: 0,
        stubsCreated: 0,
        version,
        message: 'No valid entries found in entries file.',
      };
    }

    // Wrap all database operations in a transaction
    return await this.em.transactional(async (txEm) => {
      // Create or find REACH_ANNEX_XVII regulatory list
      const regulatoryList = await this.getOrCreateRegulatoryList(txEm);

      let entryCount = 0;
      let groupCount = 0;
      let skippedCount = 0;
      let stubsCreated = 0;
      let substancesLinked = 0;

      // Create SubstanceGroup for each Entry
      const entryGroups = new Map<string, SubstanceGroup>();

      for (const entry of parsedData.entries) {
        const group = await this.getOrCreateSubstanceGroupFromEntry(txEm, entry);
        entryGroups.set(entry.entryNumber, group);
        groupCount++;

        // Create SubstanceListEntry for the group with EUR-Lex URL
        await this.createGroupEntryFromEntry(txEm, group, regulatoryList, entry);
        entryCount++;
      }

      // Link substances to their Entry groups
      for (const substance of parsedData.substances) {
        const entryNumber = this.parser.findEntryForSubstance(substance, parsedData);

        if (!entryNumber) {
          console.warn(
            `Annex XVII seeder: No Entry found for substance - CAS: ${substance.casNumber ?? 'N/A'}, EC: ${substance.ecNumber ?? 'N/A'}, Name: ${substance.substanceName}, RegGroup: ${substance.regulatoryGroup ?? 'N/A'}`
          );
          skippedCount++;
          continue;
        }

        const group = entryGroups.get(entryNumber);
        if (!group) {
          console.warn(`Annex XVII seeder: Group not found for Entry ${entryNumber}`);
          skippedCount++;
          continue;
        }

        // Find or create the substance in the database
        const result = await findOrCreateSubstance(
          txEm,
          {
            casNumber: substance.casNumber,
            ecNumber: substance.ecNumber,
            name: substance.substanceName,
            description: substance.description,
          },
          'ANNEX_XVII',
          version
        );

        if (result.skipped || !result.substance) {
          console.warn(
            `Annex XVII seeder: Skipped substance - ${result.skipReason || 'Unknown reason'}`
          );
          skippedCount++;
          continue;
        }

        if (result.created) {
          stubsCreated++;
          console.log(
            `Annex XVII seeder: Created stub substance - CAS: ${substance.casNumber}, Name: ${substance.substanceName}`
          );
        }

        // Add substance to the group
        await this.addGroupMember(txEm, group, result.substance);
        substancesLinked++;
      }

      await txEm.flush();

      // Update or create registry source record
      await this.updateRegistrySource(txEm, version, substancesLinked);

      return {
        seeded: true,
        skipped: false,
        entryCount,
        groupCount,
        skippedCount,
        stubsCreated,
        version,
        message: `Seeded ${entryCount} Annex XVII entries (${groupCount} groups, ${substancesLinked} substances linked, ${stubsCreated} stubs created, ${skippedCount} skipped) from ECHA (${version}).`,
      };
    });
  }

  /**
   * Seeds Annex XVII entries from a file (CSV or XLSX format).
   * Legacy method - prefer seedFromBothFiles for complete data.
   *
   * @param filePath - Path to the file
   * @param version - Version identifier for this data (e.g., "2026-01")
   * @returns AnnexXviiSeederResult with counts and status
   */
  async seedFromFile(filePath: string, version: string): Promise<AnnexXviiSeederResult> {
    // Check if already seeded with same version
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_ANNEX_XVII,
    });

    if (existingSource?.version === version) {
      return {
        seeded: false,
        skipped: true,
        entryCount: existingSource.recordCount ?? 0,
        groupCount: 0,
        skippedCount: 0,
        stubsCreated: 0,
        version,
        message: `ECHA Annex XVII already seeded with version ${version}, skipping.`,
      };
    }

    // Parse file (supports CSV and XLSX)
    const records = await this.parser.parseFile(filePath);
    return this.seedRecords(records, version);
  }

  /**
   * Seeds Annex XVII entries from CSV content.
   *
   * @param csvContent - Raw CSV string with ECHA Annex XVII format
   * @param version - Version identifier for this data (e.g., "2026-01")
   * @returns AnnexXviiSeederResult with counts and status
   */
  async seedFromContent(csvContent: string, version: string): Promise<AnnexXviiSeederResult> {
    // Check if already seeded with same version (before transaction)
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_ANNEX_XVII,
    });

    if (existingSource?.version === version) {
      return {
        seeded: false,
        skipped: true,
        entryCount: existingSource.recordCount ?? 0,
        groupCount: 0,
        skippedCount: 0,
        stubsCreated: 0,
        version,
        message: `ECHA Annex XVII already seeded with version ${version}, skipping.`,
      };
    }

    // Parse CSV (before transaction)
    const records = await this.parser.parse(csvContent);
    return this.seedRecords(records, version);
  }

  /**
   * Seeds parsed records to the database.
   * Common logic used by both CSV and XLSX seeding methods.
   */
  private async seedRecords(records: EchaAnnexXviiRecord[], version: string): Promise<AnnexXviiSeederResult> {
    if (records.length === 0) {
      return {
        seeded: false,
        skipped: true,
        entryCount: 0,
        groupCount: 0,
        skippedCount: 0,
        stubsCreated: 0,
        version,
        message: 'No valid records found in file.',
      };
    }

    // Group records by entry number
    const groupedRecords = this.parser.groupByEntry(records);

    // Wrap all database operations in a transaction
    return await this.em.transactional(async (txEm) => {
      // Create or find REACH_ANNEX_XVII regulatory list
      const regulatoryList = await this.getOrCreateRegulatoryList(txEm);

      // Process records and create entries
      let entryCount = 0;
      let groupCount = 0;
      let skippedCount = 0;
      let stubsCreated = 0;

      for (const [entryNumber, entryRecords] of Object.entries(groupedRecords)) {
        const isGroupEntry = entryRecords.length > 1 || entryRecords[0]?.isGroupEntry;
        const firstRecord = entryRecords[0];

        if (!firstRecord) {
          continue;
        }

        if (isGroupEntry) {
          // Create SubstanceGroup for this entry
          const group = await this.getOrCreateSubstanceGroup(txEm, entryNumber, firstRecord);
          groupCount++;

          // Create entry for the group
          await this.createGroupEntry(txEm, group, regulatoryList, firstRecord, entryNumber);

          // Add substances to the group
          for (const record of entryRecords) {
            const result = await findOrCreateSubstance(
              txEm,
              {
                casNumber: record.casNumber,
                ecNumber: record.ecNumber,
                name: record.substanceName,
              },
              'ANNEX_XVII',
              version
            );

            if (result.skipped || !result.substance) {
              console.warn(
                `Annex XVII seeder: Skipped - Entry: ${entryNumber}, ${result.skipReason || 'Unknown reason'}`
              );
              skippedCount++;
              continue;
            }

            if (result.created) {
              stubsCreated++;
              console.log(
                `Annex XVII seeder: Created stub - CAS: ${record.casNumber}, Name: ${record.substanceName}`
              );
            }

            await this.addGroupMember(txEm, group, result.substance);
            entryCount++;
          }
        } else {
          // Single substance entry
          const record = firstRecord;
          const result = await findOrCreateSubstance(
            txEm,
            {
              casNumber: record.casNumber,
              ecNumber: record.ecNumber,
              name: record.substanceName,
            },
            'ANNEX_XVII',
            version
          );

          if (result.skipped || !result.substance) {
            console.warn(
              `Annex XVII seeder: Skipped - Entry: ${entryNumber}, ${result.skipReason || 'Unknown reason'}`
            );
            skippedCount++;
            continue;
          }

          if (result.created) {
            stubsCreated++;
            console.log(
              `Annex XVII seeder: Created stub - CAS: ${record.casNumber}, Name: ${record.substanceName}`
            );
          }

          // Create or update entry for the substance
          await this.createSubstanceEntry(txEm, result.substance, regulatoryList, record, entryNumber);
          entryCount++;
        }
      }

      await txEm.flush();

      // Update or create registry source record
      await this.updateRegistrySource(txEm, version, entryCount);

      return {
        seeded: true,
        skipped: false,
        entryCount,
        groupCount,
        skippedCount,
        stubsCreated,
        version,
        message: `Seeded ${entryCount} Annex XVII entries (${groupCount} groups, ${stubsCreated} stubs created, ${skippedCount} skipped) from ECHA (${version}).`,
      };
    });
  }

  /**
   * Gets or creates the REACH_ANNEX_XVII regulatory list.
   */
  private async getOrCreateRegulatoryList(txEm: EntityManager): Promise<RegulatoryList> {
    let list = await txEm.findOne(RegulatoryList, { code: 'REACH_ANNEX_XVII' });

    if (!list) {
      list = txEm.create(RegulatoryList, {
        id: createId(),
        code: 'REACH_ANNEX_XVII',
        name: 'REACH Annex XVII - Restrictions',
        jurisdiction: 'EU',
        publisher: 'ECHA',
        description: 'Restrictions on the manufacture, placing on the market and use of certain dangerous substances, mixtures and articles under REACH Regulation',
        sourceUrl: 'https://echa.europa.eu/substances-restricted-under-reach',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await txEm.persistAndFlush(list);
    }

    return list;
  }

  /**
   * Gets or creates a SubstanceGroup for a group entry.
   */
  private async getOrCreateSubstanceGroup(
    txEm: EntityManager,
    entryNumber: string,
    record: EchaAnnexXviiRecord
  ): Promise<SubstanceGroup> {
    const code = generateGroupCode(entryNumber, record.substanceName);

    let group = await txEm.findOne(SubstanceGroup, { code });

    if (!group) {
      group = txEm.create(SubstanceGroup, {
        id: createId(),
        code,
        name: record.substanceName,
        description: `REACH Annex XVII Entry ${entryNumber}: ${record.substanceName}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      txEm.persist(group);
    }

    return group;
  }

  /**
   * Gets or creates a SubstanceGroup from an AnnexXviiEntry.
   */
  private async getOrCreateSubstanceGroupFromEntry(
    txEm: EntityManager,
    entry: AnnexXviiEntry
  ): Promise<SubstanceGroup> {
    const code = generateGroupCode(entry.entryNumber, entry.entryName);

    let group = await txEm.findOne(SubstanceGroup, { code });

    if (!group) {
      group = txEm.create(SubstanceGroup, {
        id: createId(),
        code,
        name: entry.entryName,
        description: entry.description || `REACH Annex XVII Entry ${entry.entryNumber}: ${entry.entryName}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      txEm.persist(group);
    }

    return group;
  }

  /**
   * Creates or updates a SubstanceListEntry for a group from an AnnexXviiEntry.
   * Includes the EUR-Lex URL.
   */
  private async createGroupEntryFromEntry(
    txEm: EntityManager,
    group: SubstanceGroup,
    regulatoryList: RegulatoryList,
    entry: AnnexXviiEntry
  ): Promise<SubstanceListEntry> {
    const existing = await txEm.findOne(SubstanceListEntry, {
      substanceGroup: group,
      regulatoryList,
    });

    if (existing) {
      // Update existing entry
      existing.status = ListingStatus.RESTRICTED;
      existing.sourceReference = `REACH Annex XVII, Entry ${entry.entryNumber}`;
      existing.sourceUrl = entry.eurLexUrl;
      existing.updatedAt = new Date();
      return existing;
    }

    const listEntry = txEm.create(SubstanceListEntry, {
      id: createId(),
      substanceGroup: group,
      regulatoryList,
      status: ListingStatus.RESTRICTED,
      scopes: [], // Will be populated when we have restriction conditions
      sourceReference: `REACH Annex XVII, Entry ${entry.entryNumber}`,
      sourceUrl: entry.eurLexUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    txEm.persist(listEntry);
    return listEntry;
  }

  /**
   * Finds a substance by CAS or EC number from an AnnexXviiSubstance.
   */
  private async findSubstanceByIdentifiers(
    txEm: EntityManager,
    substance: AnnexXviiSubstance
  ): Promise<Substance | null> {
    // Try to find by CAS number first
    if (substance.casNumber) {
      const byCas = await txEm.findOne(Substance, { casNumber: substance.casNumber });
      if (byCas) return byCas;
    }

    // Fall back to EC number
    if (substance.ecNumber) {
      const byEc = await txEm.findOne(Substance, { ecNumber: substance.ecNumber });
      if (byEc) return byEc;
    }

    return null;
  }

  /**
   * Creates or updates a SubstanceListEntry for a group.
   */
  private async createGroupEntry(
    txEm: EntityManager,
    group: SubstanceGroup,
    regulatoryList: RegulatoryList,
    record: EchaAnnexXviiRecord,
    entryNumber: string
  ): Promise<SubstanceListEntry> {
    const existing = await txEm.findOne(SubstanceListEntry, {
      substanceGroup: group,
      regulatoryList,
    });

    if (existing) {
      // Update existing entry
      existing.status = ListingStatus.RESTRICTED;
      existing.scopes = record.scopes;
      existing.scopeRaw = record.restrictionConditions;
      existing.threshold = record.threshold;
      existing.thresholdUnit = record.thresholdUnit;
      existing.thresholdOperator = record.threshold !== undefined ? ThresholdOperator.LTE : undefined;
      existing.sourceReference = `REACH Annex XVII, Entry ${entryNumber}`;
      existing.conditions = { restrictionConditions: record.restrictionConditions };
      existing.updatedAt = new Date();
      return existing;
    }

    const entry = txEm.create(SubstanceListEntry, {
      id: createId(),
      substanceGroup: group,
      regulatoryList,
      status: ListingStatus.RESTRICTED,
      scopes: record.scopes,
      scopeRaw: record.restrictionConditions,
      threshold: record.threshold,
      thresholdUnit: record.thresholdUnit,
      thresholdOperator: record.threshold !== undefined ? ThresholdOperator.LTE : undefined,
      sourceReference: `REACH Annex XVII, Entry ${entryNumber}`,
      conditions: { restrictionConditions: record.restrictionConditions },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    txEm.persist(entry);
    return entry;
  }

  /**
   * Creates or updates a SubstanceListEntry for a single substance.
   */
  private async createSubstanceEntry(
    txEm: EntityManager,
    substance: Substance,
    regulatoryList: RegulatoryList,
    record: EchaAnnexXviiRecord,
    entryNumber: string
  ): Promise<SubstanceListEntry> {
    const existing = await txEm.findOne(SubstanceListEntry, {
      substance,
      regulatoryList,
    });

    if (existing) {
      // Update existing entry
      existing.status = ListingStatus.RESTRICTED;
      existing.scopes = record.scopes;
      existing.scopeRaw = record.restrictionConditions;
      existing.threshold = record.threshold;
      existing.thresholdUnit = record.thresholdUnit;
      existing.thresholdOperator = record.threshold !== undefined ? ThresholdOperator.LTE : undefined;
      existing.sourceReference = `REACH Annex XVII, Entry ${entryNumber}`;
      existing.conditions = { restrictionConditions: record.restrictionConditions };
      existing.updatedAt = new Date();
      return existing;
    }

    const entry = txEm.create(SubstanceListEntry, {
      id: createId(),
      substance,
      regulatoryList,
      status: ListingStatus.RESTRICTED,
      scopes: record.scopes,
      scopeRaw: record.restrictionConditions,
      threshold: record.threshold,
      thresholdUnit: record.thresholdUnit,
      thresholdOperator: record.threshold !== undefined ? ThresholdOperator.LTE : undefined,
      sourceReference: `REACH Annex XVII, Entry ${entryNumber}`,
      conditions: { restrictionConditions: record.restrictionConditions },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    txEm.persist(entry);
    return entry;
  }

  /**
   * Adds a substance to a group.
   */
  private async addGroupMember(
    txEm: EntityManager,
    group: SubstanceGroup,
    substance: Substance
  ): Promise<void> {
    const existing = await txEm.findOne(SubstanceGroupMember, {
      group,
      substance,
    });

    if (!existing) {
      const member = txEm.create(SubstanceGroupMember, {
        id: createId(),
        group,
        substance,
        inheritanceType: InheritanceType.EXPLICIT,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      txEm.persist(member);
    }
  }

  /**
   * Finds a substance by CAS number or EC number.
   */
  private async findSubstance(txEm: EntityManager, record: EchaAnnexXviiRecord): Promise<Substance | null> {
    // Try to find by CAS number first
    if (record.casNumber) {
      const byCas = await txEm.findOne(Substance, { casNumber: record.casNumber });
      if (byCas) return byCas;
    }

    // Fall back to EC number
    if (record.ecNumber) {
      const byEc = await txEm.findOne(Substance, { ecNumber: record.ecNumber });
      if (byEc) return byEc;
    }

    return null;
  }

  /**
   * Updates or creates the registry source record.
   */
  private async updateRegistrySource(txEm: EntityManager, version: string, recordCount: number): Promise<void> {
    const existing = await txEm.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_ANNEX_XVII,
    });

    if (existing) {
      existing.version = version;
      existing.recordCount = recordCount;
      existing.lastSyncedAt = new Date();
      await txEm.persistAndFlush(existing);
    } else {
      const now = new Date();
      const source = txEm.create(RegistrySource, {
        name: RegistrySourceName.ECHA_ANNEX_XVII,
        version,
        recordCount,
        sourceUrl: 'https://echa.europa.eu/substances-restricted-under-reach',
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await txEm.persistAndFlush(source);
    }
  }
}
