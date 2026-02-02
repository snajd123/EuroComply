// packages/gsr/src/seeders/echa-annex-xiv.seeder.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import {
  EchaAnnexXivParser,
  type EchaAnnexXivRecord,
  type AnnexXivEntry,
  type AnnexXivSubstance,
  type AnnexXivParsedData,
} from '../parsers/echa-annex-xiv.parser.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { SubstanceGroup, SubstanceGroupMember, InheritanceType } from '../entities/SubstanceGroup.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { ProductScope } from '../enums/ProductScope.js';
import { Substance } from '@eurocomply/database';
import { findOrCreateSubstance } from '../utils/substance-finder.js';

export interface AnnexXivSeederResult {
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
 * Generates a unique group code for an Annex XIV entry.
 *
 * @param entryName - Entry/substance name
 * @returns Normalized group code (e.g., "ANNEX_XIV_CHROMIUM_TRIOXIDE")
 */
export function generateAnnexXivGroupCode(entryName: string): string {
  let normalizedName = entryName.toUpperCase();

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
    normalizedName = normalizedName.replace(/_$/, '');
  }

  return `ANNEX_XIV_${normalizedName}`;
}

/**
 * Extracts and normalizes Article 57 reason text.
 * Simply trims whitespace and returns the original text.
 *
 * @param intrinsicProperties - Raw intrinsic properties text from ECHA
 * @returns Trimmed reason text
 */
export function extractArticle57Reason(intrinsicProperties: string): string {
  return intrinsicProperties.trim();
}

/**
 * Seeds REACH Annex XIV (Authorization List) entries from ECHA CSV files.
 *
 * Creates SubstanceListEntry records linking existing substances
 * to the REACH_ANNEX_XIV regulatory list with:
 * - Status: AUTHORIZED (requires authorization to use)
 * - sunsetDate: Date after which substance cannot be used without authorization
 * - listingDate: Latest application date (deadline to apply for authorization)
 * - conditions: Contains Article 57 reason for inclusion and exempted uses
 * - scopes: ALL_PRODUCTS (authorization applies broadly)
 */
export class EchaAnnexXivSeeder {
  private readonly parser: EchaAnnexXivParser;

  constructor(private readonly em: EntityManager) {
    this.parser = new EchaAnnexXivParser();
  }

  /**
   * Seeds Annex XIV from both the entries file (with regulatory data) and substances file (with all substances).
   * This is the recommended method for complete data.
   *
   * @param entriesFilePath - Path to the entries/full file (has regulatory data: dates, reasons, exemptions)
   * @param substancesFilePath - Path to the substances/expanded file (has all individual substances)
   * @param version - Version identifier for this data (e.g., "2026-01")
   * @returns AnnexXivSeederResult with counts and status
   */
  async seedFromBothFiles(
    entriesFilePath: string,
    substancesFilePath: string,
    version: string
  ): Promise<AnnexXivSeederResult> {
    // Check if already seeded with same version
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_ANNEX_XIV,
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
        message: `ECHA Annex XIV already seeded with version ${version}, skipping.`,
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
      // Create or find REACH_ANNEX_XIV regulatory list
      const regulatoryList = await this.getOrCreateRegulatoryList(txEm);

      let entryCount = 0;
      let groupCount = 0;
      let skippedCount = 0;
      let stubsCreated = 0;
      let substancesLinked = 0;

      // Track which entries are groups (have substances linked to them)
      const entryHasChildren = new Set<string>();
      for (const substance of parsedData.substances) {
        if (substance.regulatoryGroup) {
          entryHasChildren.add(substance.regulatoryGroup);
        }
      }

      // Create SubstanceGroups for entries that have child substances
      const entryGroups = new Map<string, SubstanceGroup>();
      const entryDataMap = new Map<string, AnnexXivEntry>();

      for (const entry of parsedData.entries) {
        entryDataMap.set(entry.entryName, entry);

        if (entryHasChildren.has(entry.entryName)) {
          // This entry has children - create a SubstanceGroup
          const group = await this.getOrCreateSubstanceGroup(txEm, entry);
          entryGroups.set(entry.entryName, group);
          groupCount++;

          // Create SubstanceListEntry for the group
          await this.createGroupEntry(txEm, group, regulatoryList, entry);
          entryCount++;
        }
      }

      // Process all substances from the expanded file
      for (const substance of parsedData.substances) {
        const entryName = this.parser.findEntryForSubstance(substance, parsedData);
        const entryData = entryName ? entryDataMap.get(entryName) : undefined;

        if (!entryName || !entryData) {
          console.warn(
            `Annex XIV seeder: No entry found for substance - CAS: ${substance.casNumber ?? 'N/A'}, EC: ${substance.ecNumber ?? 'N/A'}, Name: ${substance.substanceName}`
          );
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
          'ANNEX_XIV',
          version
        );

        if (result.skipped || !result.substance) {
          console.warn(
            `Annex XIV seeder: Skipped substance - ${result.skipReason || 'Unknown reason'}`
          );
          skippedCount++;
          continue;
        }

        if (result.created) {
          stubsCreated++;
          console.log(
            `Annex XIV seeder: Created stub - CAS: ${substance.casNumber}, Name: ${substance.substanceName}`
          );
        }

        const group = entryGroups.get(entryName);
        if (group) {
          // This substance belongs to a group - add it as a member
          await this.addGroupMember(txEm, group, result.substance);
          substancesLinked++;
        } else {
          // Standalone substance - create direct SubstanceListEntry
          await this.createSubstanceEntry(txEm, result.substance, regulatoryList, entryData);
          entryCount++;
        }
      }

      await txEm.flush();

      // Update or create registry source record
      await this.updateRegistrySource(txEm, version, substancesLinked + entryCount);

      return {
        seeded: true,
        skipped: false,
        entryCount,
        groupCount,
        skippedCount,
        stubsCreated,
        version,
        message: `Seeded ${entryCount} Annex XIV entries (${groupCount} groups, ${substancesLinked} substances linked, ${stubsCreated} stubs created, ${skippedCount} skipped) from ECHA (${version}).`,
      };
    });
  }

  /**
   * Seeds Annex XIV entries from a file (CSV or XLSX format).
   * Legacy method - prefer seedFromBothFiles for complete data.
   *
   * @param filePath - Path to the file
   * @param version - Version identifier for this data (e.g., "2026-01")
   * @returns AnnexXivSeederResult with counts and status
   */
  async seedFromFile(filePath: string, version: string): Promise<AnnexXivSeederResult> {
    // Check if already seeded with same version
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_ANNEX_XIV,
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
        message: `ECHA Annex XIV already seeded with version ${version}, skipping.`,
      };
    }

    // Parse file (supports CSV and XLSX)
    const records = await this.parser.parseFile(filePath);
    return this.seedRecords(records, version);
  }

  /**
   * Seeds Annex XIV entries from CSV content.
   *
   * @param csvContent - Raw CSV string with ECHA Annex XIV format
   * @param version - Version identifier for this data (e.g., "2026-01")
   * @returns AnnexXivSeederResult with counts and status
   */
  async seedFromContent(csvContent: string, version: string): Promise<AnnexXivSeederResult> {
    // Check if already seeded with same version (before transaction)
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_ANNEX_XIV,
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
        message: `ECHA Annex XIV already seeded with version ${version}, skipping.`,
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
  private async seedRecords(records: EchaAnnexXivRecord[], version: string): Promise<AnnexXivSeederResult> {
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

    // Wrap all database operations in a transaction
    return await this.em.transactional(async (txEm) => {
      // Create or find REACH_ANNEX_XIV regulatory list
      const regulatoryList = await this.getOrCreateRegulatoryList(txEm);

      // Process records and create entries
      let entryCount = 0;
      let skippedCount = 0;
      let stubsCreated = 0;

      for (const record of records) {
        const result = await findOrCreateSubstance(
          txEm,
          {
            casNumber: record.casNumber,
            ecNumber: record.ecNumber,
            name: record.substanceName,
          },
          'ANNEX_XIV',
          version
        );

        if (result.skipped || !result.substance) {
          console.warn(
            `Annex XIV seeder: Skipped - ${result.skipReason || 'Unknown reason'}`
          );
          skippedCount++;
          continue;
        }

        if (result.created) {
          stubsCreated++;
          console.log(
            `Annex XIV seeder: Created stub - CAS: ${record.casNumber}, Name: ${record.substanceName}`
          );
        }

        const substance = result.substance;

        // Check if entry already exists
        const existingEntry = await txEm.findOne(SubstanceListEntry, {
          substance,
          regulatoryList,
        });

        // Build conditions object
        const conditions: Record<string, unknown> = {
          intrinsicProperties: extractArticle57Reason(record.intrinsicProperties),
        };
        if (record.exemptedUses) {
          conditions['exemptedUses'] = record.exemptedUses;
        }

        if (existingEntry) {
          // Update existing entry
          existingEntry.sunsetDate = record.sunsetDate ?? undefined;
          existingEntry.listingDate = record.latestApplicationDate ?? undefined;
          existingEntry.conditions = conditions;
          existingEntry.sourceReference = 'REACH Annex XIV';
        } else {
          // Create new entry
          const entry = txEm.create(SubstanceListEntry, {
            id: createId(),
            substance,
            regulatoryList,
            status: ListingStatus.AUTHORIZED,
            scopes: [ProductScope.ALL_PRODUCTS],
            sunsetDate: record.sunsetDate ?? undefined,
            listingDate: record.latestApplicationDate ?? undefined,
            conditions,
            sourceReference: 'REACH Annex XIV',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          txEm.persist(entry);
        }

        entryCount++;
      }

      await txEm.flush();

      // Update or create registry source record
      await this.updateRegistrySource(txEm, version, entryCount);

      return {
        seeded: true,
        skipped: false,
        entryCount,
        groupCount: 0, // Legacy mode doesn't create groups
        skippedCount,
        stubsCreated,
        version,
        message: `Seeded ${entryCount} Annex XIV entries (${stubsCreated} stubs created, ${skippedCount} skipped) from ECHA Authorization List (${version}).`,
      };
    });
  }

  /**
   * Gets or creates the REACH_ANNEX_XIV regulatory list.
   */
  private async getOrCreateRegulatoryList(txEm: EntityManager): Promise<RegulatoryList> {
    let list = await txEm.findOne(RegulatoryList, { code: 'REACH_ANNEX_XIV' });

    if (!list) {
      list = txEm.create(RegulatoryList, {
        id: createId(),
        code: 'REACH_ANNEX_XIV',
        name: 'REACH Authorization List (Annex XIV)',
        jurisdiction: 'EU',
        publisher: 'ECHA',
        description:
          'Substances requiring authorization under REACH. Use of these substances after the sunset date requires authorization.',
        sourceUrl: 'https://echa.europa.eu/authorisation-list',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await txEm.persistAndFlush(list);
    }

    return list;
  }

  /**
   * Finds a substance by CAS number or EC number.
   */
  private async findSubstance(
    txEm: EntityManager,
    record: EchaAnnexXivRecord
  ): Promise<Substance | null> {
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
  private async updateRegistrySource(
    txEm: EntityManager,
    version: string,
    recordCount: number
  ): Promise<void> {
    const existing = await txEm.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_ANNEX_XIV,
    });

    if (existing) {
      existing.version = version;
      existing.recordCount = recordCount;
      existing.lastSyncedAt = new Date();
      await txEm.persistAndFlush(existing);
    } else {
      const now = new Date();
      const source = txEm.create(RegistrySource, {
        name: RegistrySourceName.ECHA_ANNEX_XIV,
        version,
        recordCount,
        sourceUrl: 'https://echa.europa.eu/authorisation-list',
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await txEm.persistAndFlush(source);
    }
  }

  /**
   * Gets or creates a SubstanceGroup for an Annex XIV entry.
   */
  private async getOrCreateSubstanceGroup(
    txEm: EntityManager,
    entry: AnnexXivEntry
  ): Promise<SubstanceGroup> {
    const code = generateAnnexXivGroupCode(entry.entryName);

    let group = await txEm.findOne(SubstanceGroup, { code });

    if (!group) {
      group = txEm.create(SubstanceGroup, {
        id: createId(),
        code,
        name: entry.entryName,
        description: entry.description || `REACH Annex XIV: ${entry.entryName}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      txEm.persist(group);
    }

    return group;
  }

  /**
   * Creates or updates a SubstanceListEntry for a group.
   */
  private async createGroupEntry(
    txEm: EntityManager,
    group: SubstanceGroup,
    regulatoryList: RegulatoryList,
    entry: AnnexXivEntry
  ): Promise<SubstanceListEntry> {
    const existing = await txEm.findOne(SubstanceListEntry, {
      substanceGroup: group,
      regulatoryList,
    });

    // Build conditions object
    const conditions: Record<string, unknown> = {
      intrinsicProperties: entry.reasonForInclusion,
    };
    if (entry.exemptedUses) {
      conditions['exemptedUses'] = entry.exemptedUses;
    }

    if (existing) {
      // Update existing entry
      existing.status = ListingStatus.AUTHORIZED;
      existing.sunsetDate = entry.sunsetDate ?? undefined;
      existing.listingDate = entry.latestApplicationDate ?? undefined;
      existing.conditions = conditions;
      existing.sourceReference = 'REACH Annex XIV';
      existing.updatedAt = new Date();
      return existing;
    }

    const listEntry = txEm.create(SubstanceListEntry, {
      id: createId(),
      substanceGroup: group,
      regulatoryList,
      status: ListingStatus.AUTHORIZED,
      scopes: [ProductScope.ALL_PRODUCTS],
      sunsetDate: entry.sunsetDate ?? undefined,
      listingDate: entry.latestApplicationDate ?? undefined,
      conditions,
      sourceReference: 'REACH Annex XIV',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    txEm.persist(listEntry);
    return listEntry;
  }

  /**
   * Creates or updates a SubstanceListEntry for a standalone substance.
   */
  private async createSubstanceEntry(
    txEm: EntityManager,
    substance: Substance,
    regulatoryList: RegulatoryList,
    entry: AnnexXivEntry
  ): Promise<SubstanceListEntry> {
    const existing = await txEm.findOne(SubstanceListEntry, {
      substance,
      regulatoryList,
    });

    // Build conditions object
    const conditions: Record<string, unknown> = {
      intrinsicProperties: entry.reasonForInclusion,
    };
    if (entry.exemptedUses) {
      conditions['exemptedUses'] = entry.exemptedUses;
    }

    if (existing) {
      // Update existing entry
      existing.status = ListingStatus.AUTHORIZED;
      existing.sunsetDate = entry.sunsetDate ?? undefined;
      existing.listingDate = entry.latestApplicationDate ?? undefined;
      existing.conditions = conditions;
      existing.sourceReference = 'REACH Annex XIV';
      existing.updatedAt = new Date();
      return existing;
    }

    const listEntry = txEm.create(SubstanceListEntry, {
      id: createId(),
      substance,
      regulatoryList,
      status: ListingStatus.AUTHORIZED,
      scopes: [ProductScope.ALL_PRODUCTS],
      sunsetDate: entry.sunsetDate ?? undefined,
      listingDate: entry.latestApplicationDate ?? undefined,
      conditions,
      sourceReference: 'REACH Annex XIV',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    txEm.persist(listEntry);
    return listEntry;
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
}
