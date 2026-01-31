// packages/gsr/src/seeders/echa-svhc.seeder.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import { EchaSvhcParser, type EchaSvhcRecord } from '../parsers/echa-svhc.parser.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { ProductScope } from '../enums/ProductScope.js';
import { Substance } from '@eurocomply/database';

export interface SvhcSeederResult {
  seeded: boolean;
  skipped: boolean;
  entryCount: number;
  skippedCount: number;
  version: string;
  message: string;
}

/**
 * Seeds SVHC Candidate List entries from ECHA CSV files.
 *
 * Creates SubstanceListEntry records linking existing substances
 * to the REACH_SVHC regulatory list.
 */
export class EchaSvhcSeeder {
  private readonly parser: EchaSvhcParser;

  constructor(private readonly em: EntityManager) {
    this.parser = new EchaSvhcParser();
  }

  /**
   * Seeds SVHC entries from CSV content.
   *
   * @param csvContent - Raw CSV string with ECHA SVHC format
   * @param version - Version identifier for this data (e.g., "2026-01")
   * @returns SvhcSeederResult with counts and status
   */
  async seedFromContent(csvContent: string, version: string): Promise<SvhcSeederResult> {
    // Check if already seeded with same version (before transaction)
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_SVHC,
    });

    if (existingSource?.version === version) {
      return {
        seeded: false,
        skipped: true,
        entryCount: existingSource.recordCount ?? 0,
        skippedCount: 0,
        version,
        message: `ECHA SVHC already seeded with version ${version}, skipping.`,
      };
    }

    // Parse CSV (before transaction)
    const records = await this.parser.parse(csvContent);

    if (records.length === 0) {
      return {
        seeded: false,
        skipped: true,
        entryCount: 0,
        skippedCount: 0,
        version,
        message: 'No valid records found in CSV content.',
      };
    }

    // Wrap all database operations in a transaction
    return await this.em.transactional(async (txEm) => {
      // Create or find REACH_SVHC regulatory list
      const regulatoryList = await this.getOrCreateRegulatoryList(txEm);

      // Process records and create entries
      let entryCount = 0;
      let skippedCount = 0;

      for (const record of records) {
        const substance = await this.findSubstance(txEm, record);

        if (!substance) {
          // Substance not found in database - skip and log
          console.warn(
            `SVHC seeder: Substance not found - CAS: ${record.casNumber ?? 'N/A'}, EC: ${record.ecNumber}, Name: ${record.substanceName}`
          );
          skippedCount++;
          continue;
        }

        // Check if entry already exists
        const existingEntry = await txEm.findOne(SubstanceListEntry, {
          substance,
          regulatoryList,
        });

        if (existingEntry) {
          // Update existing entry
          existingEntry.listingDate = record.dateOfInclusion;
          existingEntry.conditions = { reason: record.reasonForInclusion };
          existingEntry.sourceReference = 'SVHC Candidate List';
        } else {
          // Create new entry
          const entry = txEm.create(SubstanceListEntry, {
            id: createId(),
            substance,
            regulatoryList,
            status: ListingStatus.LISTED,
            scopes: [ProductScope.ALL_PRODUCTS],
            listingDate: record.dateOfInclusion,
            conditions: { reason: record.reasonForInclusion },
            sourceReference: 'SVHC Candidate List',
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
        skippedCount,
        version,
        message: `Seeded ${entryCount} SVHC entries (${skippedCount} skipped) from ECHA SVHC (${version}).`,
      };
    });
  }

  /**
   * Gets or creates the REACH_SVHC regulatory list.
   */
  private async getOrCreateRegulatoryList(txEm: EntityManager): Promise<RegulatoryList> {
    let list = await txEm.findOne(RegulatoryList, { code: 'REACH_SVHC' });

    if (!list) {
      list = txEm.create(RegulatoryList, {
        id: createId(),
        code: 'REACH_SVHC',
        name: 'SVHC Candidate List',
        jurisdiction: 'EU',
        publisher: 'ECHA',
        description: 'Substances of Very High Concern (SVHC) identified under REACH Article 57',
        sourceUrl: 'https://echa.europa.eu/candidate-list-table',
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
  private async findSubstance(txEm: EntityManager, record: EchaSvhcRecord): Promise<Substance | null> {
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
      name: RegistrySourceName.ECHA_SVHC,
    });

    if (existing) {
      existing.version = version;
      existing.recordCount = recordCount;
      existing.lastSyncedAt = new Date();
      await txEm.persistAndFlush(existing);
    } else {
      const now = new Date();
      const source = txEm.create(RegistrySource, {
        name: RegistrySourceName.ECHA_SVHC,
        version,
        recordCount,
        sourceUrl: 'https://echa.europa.eu/candidate-list-table',
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await txEm.persistAndFlush(source);
    }
  }
}
