// packages/gsr/src/seeders/echa-pop.seeder.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import {
  EchaPopParser,
  type EchaPopRecord,
  type PopEntry,
  type PopSubstance,
  type PopParsedData,
} from '../parsers/echa-pop.parser.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { SubstanceGroup, SubstanceGroupMember, InheritanceType } from '../entities/SubstanceGroup.js';
import { ProductScope } from '../enums/ProductScope.js';
import { Substance } from '@eurocomply/database';
import { findOrCreateSubstance } from '../utils/substance-finder.js';

export interface PopSeederResult {
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
 * Generates a unique group code for a POP entry.
 *
 * @param entryName - Entry/substance name
 * @returns Normalized group code (e.g., "POP_PFAS_COMPOUNDS")
 */
export function generatePopGroupCode(entryName: string): string {
  let normalizedName = entryName.toUpperCase();

  // Common replacements for cleaner codes
  normalizedName = normalizedName.replace(/\s+AND\s+(ITS|THEIR)\s+COMPOUNDS?/gi, '_COMPOUNDS');
  normalizedName = normalizedName.replace(/\s+AND\s+(ITS|THEIR)\s+SALTS?/gi, '_SALTS');
  normalizedName = normalizedName.replace(/-RELATED\s+COMPOUNDS?/gi, '_RELATED');
  normalizedName = normalizedName.replace(/[^A-Z0-9]/g, '_');
  normalizedName = normalizedName.replace(/_+/g, '_');
  normalizedName = normalizedName.replace(/^_|_$/g, '');

  // Truncate if too long
  if (normalizedName.length > 60) {
    normalizedName = normalizedName.substring(0, 60);
    normalizedName = normalizedName.replace(/_$/, '');
  }

  return `POP_${normalizedName}`;
}

/**
 * Formats the source reference for a POP Regulation entry.
 *
 * @param annexes - Array of annex identifiers
 * @returns Formatted source reference string
 */
export function formatSourceReference(annexes: string[]): string {
  return `POP Regulation (EU 2019/1021), Annex ${annexes.join(', ')}`;
}

/**
 * Seeds EU POP Regulation (Persistent Organic Pollutants) entries from ECHA CSV files.
 *
 * Creates SubstanceListEntry records linking existing substances
 * to the POP regulatory list with:
 * - Status: BANNED for Annex I, RESTRICTED for Annex II, LISTED for others
 * - conditions: Contains exemptions and annex information
 * - scopes: ALL_PRODUCTS (POP Regulation applies broadly)
 * - sourceReference: "POP Regulation (EU 2019/1021), Annex {annexes}"
 */
export class EchaPopSeeder {
  private readonly parser: EchaPopParser;

  constructor(private readonly em: EntityManager) {
    this.parser = new EchaPopParser();
  }

  /**
   * Seeds POP from both the entries file (with regulatory data) and substances file (with all substances).
   * This is the recommended method for complete data.
   *
   * @param entriesFilePath - Path to the entries/full file (has regulatory data: annexes, dates)
   * @param substancesFilePath - Path to the substances/expanded file (has all individual substances)
   * @param version - Version identifier for this data (e.g., "2026-01")
   * @returns PopSeederResult with counts and status
   */
  async seedFromBothFiles(
    entriesFilePath: string,
    substancesFilePath: string,
    version: string
  ): Promise<PopSeederResult> {
    // Check if already seeded with same version
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_POP,
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
        message: `ECHA POP Regulation already seeded with version ${version}, skipping.`,
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
      // Create or find POP regulatory list
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
      const entryDataMap = new Map<string, PopEntry>();

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
            `POP seeder: No entry found for substance - CAS: ${substance.casNumber ?? 'N/A'}, EC: ${substance.ecNumber ?? 'N/A'}, Name: ${substance.substanceName}`
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
          'POP',
          version
        );

        if (result.skipped || !result.substance) {
          console.warn(
            `POP seeder: Skipped substance - ${result.skipReason || 'Unknown reason'}`
          );
          skippedCount++;
          continue;
        }

        if (result.created) {
          stubsCreated++;
          console.log(
            `POP seeder: Created stub - CAS: ${substance.casNumber}, Name: ${substance.substanceName}`
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
        message: `Seeded ${entryCount} POP entries (${groupCount} groups, ${substancesLinked} substances linked, ${stubsCreated} stubs created, ${skippedCount} skipped) from ECHA (${version}).`,
      };
    });
  }

  /**
   * Seeds POP Regulation entries from a file (CSV or XLSX format).
   * Legacy method - prefer seedFromBothFiles for complete data.
   *
   * @param filePath - Path to the file
   * @param version - Version identifier for this data (e.g., "2026-01")
   * @returns PopSeederResult with counts and status
   */
  async seedFromFile(filePath: string, version: string): Promise<PopSeederResult> {
    // Check if already seeded with same version
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_POP,
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
        message: `ECHA POP Regulation already seeded with version ${version}, skipping.`,
      };
    }

    // Parse file (supports CSV and XLSX)
    const records = await this.parser.parseFile(filePath);
    return this.seedRecords(records, version);
  }

  /**
   * Seeds POP Regulation entries from CSV content.
   *
   * @param csvContent - Raw CSV string with ECHA POP Regulation format
   * @param version - Version identifier for this data (e.g., "2026-01")
   * @returns PopSeederResult with counts and status
   */
  async seedFromContent(csvContent: string, version: string): Promise<PopSeederResult> {
    // Check if already seeded with same version (before transaction)
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_POP,
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
        message: `ECHA POP Regulation already seeded with version ${version}, skipping.`,
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
  private async seedRecords(records: EchaPopRecord[], version: string): Promise<PopSeederResult> {
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
      // Create or find POP regulatory list
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
          'POP',
          version
        );

        if (result.skipped || !result.substance) {
          console.warn(
            `POP seeder: Skipped - ${result.skipReason || 'Unknown reason'}`
          );
          skippedCount++;
          continue;
        }

        if (result.created) {
          stubsCreated++;
          console.log(
            `POP seeder: Created stub - CAS: ${record.casNumber}, Name: ${record.substanceName}`
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
          annexes: record.annexes,
        };
        if (record.exemptions) {
          conditions['exemptions'] = record.exemptions;
        }

        if (existingEntry) {
          // Update existing entry
          existingEntry.status = record.listingStatus;
          existingEntry.conditions = conditions;
          existingEntry.sourceReference = formatSourceReference(record.annexes);
        } else {
          // Create new entry
          const entry = txEm.create(SubstanceListEntry, {
            id: createId(),
            substance,
            regulatoryList,
            status: record.listingStatus,
            scopes: [ProductScope.ALL_PRODUCTS],
            conditions,
            sourceReference: formatSourceReference(record.annexes),
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
        message: `Seeded ${entryCount} POP Regulation entries (${stubsCreated} stubs created, ${skippedCount} skipped) from ECHA export (${version}).`,
      };
    });
  }

  /**
   * Gets or creates the POP regulatory list.
   */
  private async getOrCreateRegulatoryList(txEm: EntityManager): Promise<RegulatoryList> {
    let list = await txEm.findOne(RegulatoryList, { code: 'POP' });

    if (!list) {
      list = txEm.create(RegulatoryList, {
        id: createId(),
        code: 'POP',
        name: 'EU POP Regulation (Persistent Organic Pollutants)',
        jurisdiction: 'EU',
        publisher: 'European Commission / ECHA',
        description:
          'The EU POP Regulation (EU 2019/1021) bans or restricts persistent organic pollutants. Annex I substances are prohibited, Annex II substances are restricted.',
        sourceUrl: 'https://echa.europa.eu/list-of-substances-subject-to-pops-regulation',
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
    record: EchaPopRecord
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
      name: RegistrySourceName.ECHA_POP,
    });

    if (existing) {
      existing.version = version;
      existing.recordCount = recordCount;
      existing.lastSyncedAt = new Date();
      await txEm.persistAndFlush(existing);
    } else {
      const now = new Date();
      const source = txEm.create(RegistrySource, {
        name: RegistrySourceName.ECHA_POP,
        version,
        recordCount,
        sourceUrl: 'https://echa.europa.eu/list-of-substances-subject-to-pops-regulation',
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await txEm.persistAndFlush(source);
    }
  }

  /**
   * Gets or creates a SubstanceGroup for a POP entry.
   */
  private async getOrCreateSubstanceGroup(
    txEm: EntityManager,
    entry: PopEntry
  ): Promise<SubstanceGroup> {
    const code = generatePopGroupCode(entry.entryName);

    let group = await txEm.findOne(SubstanceGroup, { code });

    if (!group) {
      group = txEm.create(SubstanceGroup, {
        id: createId(),
        code,
        name: entry.entryName,
        description: entry.description || `POP Regulation: ${entry.entryName}`,
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
    entry: PopEntry
  ): Promise<SubstanceListEntry> {
    const existing = await txEm.findOne(SubstanceListEntry, {
      substanceGroup: group,
      regulatoryList,
    });

    // Build conditions object
    const conditions: Record<string, unknown> = {
      annexes: entry.annexes,
    };
    if (entry.regulatoryOutcome) {
      conditions['regulatoryOutcome'] = entry.regulatoryOutcome;
    }

    if (existing) {
      // Update existing entry
      existing.status = entry.listingStatus;
      existing.listingDate = entry.dateOfInclusion ?? undefined;
      existing.conditions = conditions;
      existing.sourceReference = formatSourceReference(entry.annexes);
      existing.updatedAt = new Date();
      return existing;
    }

    const listEntry = txEm.create(SubstanceListEntry, {
      id: createId(),
      substanceGroup: group,
      regulatoryList,
      status: entry.listingStatus,
      scopes: [ProductScope.ALL_PRODUCTS],
      listingDate: entry.dateOfInclusion ?? undefined,
      conditions,
      sourceReference: formatSourceReference(entry.annexes),
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
    entry: PopEntry
  ): Promise<SubstanceListEntry> {
    const existing = await txEm.findOne(SubstanceListEntry, {
      substance,
      regulatoryList,
    });

    // Build conditions object
    const conditions: Record<string, unknown> = {
      annexes: entry.annexes,
    };
    if (entry.regulatoryOutcome) {
      conditions['regulatoryOutcome'] = entry.regulatoryOutcome;
    }

    if (existing) {
      // Update existing entry
      existing.status = entry.listingStatus;
      existing.listingDate = entry.dateOfInclusion ?? undefined;
      existing.conditions = conditions;
      existing.sourceReference = formatSourceReference(entry.annexes);
      existing.updatedAt = new Date();
      return existing;
    }

    const listEntry = txEm.create(SubstanceListEntry, {
      id: createId(),
      substance,
      regulatoryList,
      status: entry.listingStatus,
      scopes: [ProductScope.ALL_PRODUCTS],
      listingDate: entry.dateOfInclusion ?? undefined,
      conditions,
      sourceReference: formatSourceReference(entry.annexes),
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
