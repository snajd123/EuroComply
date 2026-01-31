// packages/gsr/src/seeders/echa-inventory.seeder.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import { EchaInventoryParser, type EchaInventoryRecord } from '../parsers/echa-inventory.parser.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { normalizeName } from '../utils/name-normalizer.js';

export interface SeederResult {
  seeded: boolean;
  skipped: boolean;
  substanceCount: number;
  aliasCount: number;
  version: string;
  message: string;
}

const BATCH_SIZE = 1000;

/**
 * Splits an array into chunks of specified size.
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Seeds substances from ECHA EC Inventory CSV files.
 *
 * Uses native batch inserts for performance with large datasets (106k records).
 * Supports version checking to skip if already seeded.
 * Uses UPSERT to handle re-seeding with updated data.
 */
export class EchaInventorySeeder {
  private readonly parser: EchaInventoryParser;

  constructor(private readonly em: EntityManager) {
    this.parser = new EchaInventoryParser();
  }

  /**
   * Seeds substances from CSV content.
   *
   * @param csvContent - Raw CSV string with ECHA EC Inventory format
   * @param version - Version identifier for this data (e.g., "2026-01")
   * @returns SeederResult with counts and status
   */
  async seedFromContent(csvContent: string, version: string): Promise<SeederResult> {
    // Check if already seeded with same version (before transaction)
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_EC,
    });

    if (existingSource?.version === version) {
      return {
        seeded: false,
        skipped: true,
        substanceCount: existingSource.recordCount ?? 0,
        aliasCount: 0,
        version,
        message: `ECHA EC Inventory already seeded with version ${version}, skipping.`,
      };
    }

    // Parse CSV (before transaction)
    const records = await this.parser.parse(csvContent);

    if (records.length === 0) {
      return {
        seeded: false,
        skipped: true,
        substanceCount: 0,
        aliasCount: 0,
        version,
        message: 'No valid records found in CSV content.',
      };
    }

    // Wrap all database operations in a transaction
    return await this.em.transactional(async (txEm) => {
      // Separate records with CAS numbers from those without
      const recordsWithCas = records.filter((r) => r.casNumber);
      const recordsWithoutCas = records.filter((r) => !r.casNumber);

      let substanceCount = 0;
      let aliasCount = 0;

      // Batch insert/upsert substances with CAS numbers
      if (recordsWithCas.length > 0) {
        const result = await this.batchUpsertSubstancesWithCas(txEm, recordsWithCas, version);
        substanceCount += result.substanceCount;
        aliasCount += result.aliasCount;
      }

      // Batch insert/upsert substances without CAS (by EC number)
      if (recordsWithoutCas.length > 0) {
        const result = await this.batchUpsertSubstancesWithoutCas(txEm, recordsWithoutCas, version);
        substanceCount += result.substanceCount;
        aliasCount += result.aliasCount;
      }

      // Update or create registry source record
      await this.updateRegistrySource(txEm, version, records.length);

      return {
        seeded: true,
        skipped: false,
        substanceCount: records.length,
        aliasCount,
        version,
        message: `Seeded ${substanceCount} substances with ${aliasCount} aliases from ECHA EC Inventory (${version}).`,
      };
    });
  }

  /**
   * Batch upsert substances that have CAS numbers.
   * Uses CAS number as the unique constraint for upsert.
   */
  private async batchUpsertSubstancesWithCas(
    txEm: EntityManager,
    records: EchaInventoryRecord[],
    version: string
  ): Promise<{ substanceCount: number; aliasCount: number }> {
    const batches = chunk(records, BATCH_SIZE);
    let substanceCount = 0;
    let aliasCount = 0;
    const conn = txEm.getConnection();

    for (const batch of batches) {
      // Build substance insert with UPSERT on cas_number
      // Use ? placeholders for Knex/MikroORM
      const substanceValues: string[] = [];
      const substanceParams: unknown[] = [];

      for (const record of batch) {
        const id = createId();
        substanceValues.push(`(?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`);
        substanceParams.push(
          id,
          record.casNumber,
          record.ecNumber,
          record.primaryName,
          record.molecularFormula || null,
          record.description || null,
          version
        );
      }

      // UPSERT substances by CAS number
      await conn.execute(
        `
        INSERT INTO substance (id, cas_number, ec_number, primary_name, molecular_formula, description, source_version, created_at, updated_at)
        VALUES ${substanceValues.join(', ')}
        ON CONFLICT (cas_number) DO UPDATE SET
          ec_number = EXCLUDED.ec_number,
          primary_name = EXCLUDED.primary_name,
          molecular_formula = EXCLUDED.molecular_formula,
          description = EXCLUDED.description,
          source_version = EXCLUDED.source_version,
          updated_at = NOW()
        `,
        substanceParams
      );

      substanceCount += batch.length;

      // Now create aliases for each substance
      // First, get the substance IDs for this batch
      // Use IN clause with individual placeholders since ANY(?) has issues with array params
      const casNumbers = batch.map((r) => r.casNumber);
      const casPlaceholders = casNumbers.map(() => '?').join(', ');
      const substances = await conn.execute<{ id: string; cas_number: string; primary_name: string }[]>(
        `SELECT id, cas_number, primary_name FROM substance WHERE cas_number IN (${casPlaceholders})`,
        casNumbers
      );

      // Create alias records using Map for O(1) lookup instead of O(n) find
      const recordByCas = new Map(batch.map((r) => [r.casNumber, r]));
      const aliasValues: string[] = [];
      const aliasParams: unknown[] = [];

      for (const sub of substances) {
        const record = recordByCas.get(sub.cas_number);
        if (record) {
          const aliasId = createId();
          const normalizedName = normalizeName(record.primaryName);
          aliasValues.push(`(?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`);
          aliasParams.push(
            aliasId,
            sub.id,
            record.primaryName,
            'INDEX_NAME', // AliasType.INDEX_NAME
            'en',
            normalizedName,
            'ECHA' // AliasSource.ECHA
          );
        }
      }

      if (aliasValues.length > 0) {
        // UPSERT aliases by (substance_id, name)
        await conn.execute(
          `
          INSERT INTO substance_alias (id, substance_id, name, type, language, name_normalized, source, created_at, updated_at)
          VALUES ${aliasValues.join(', ')}
          ON CONFLICT (substance_id, name) DO UPDATE SET
            type = EXCLUDED.type,
            name_normalized = EXCLUDED.name_normalized,
            source = EXCLUDED.source,
            updated_at = NOW()
          `,
          aliasParams
        );
        aliasCount += aliasValues.length;
      }
    }

    return { substanceCount, aliasCount };
  }

  /**
   * Batch upsert substances that don't have CAS numbers.
   * Uses EC number as the unique identifier.
   * Note: These won't go into the main substance table since CAS is required.
   * Instead, we track them separately or skip them.
   */
  private async batchUpsertSubstancesWithoutCas(
    _txEm: EntityManager,
    _records: EchaInventoryRecord[],
    _version: string
  ): Promise<{ substanceCount: number; aliasCount: number }> {
    // Substances without CAS numbers cannot be inserted into the substance table
    // since cas_number is a required unique field.
    // These could be tracked in UnresolvedSubstance or logged for manual review.
    // For now, we skip them as per the Substance entity design.
    return { substanceCount: 0, aliasCount: 0 };
  }

  /**
   * Updates or creates the registry source record.
   */
  private async updateRegistrySource(txEm: EntityManager, version: string, recordCount: number): Promise<void> {
    const existing = await txEm.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_EC,
    });

    if (existing) {
      existing.version = version;
      existing.recordCount = recordCount;
      existing.lastSyncedAt = new Date();
      await txEm.persistAndFlush(existing);
    } else {
      const now = new Date();
      const source = txEm.create(RegistrySource, {
        name: RegistrySourceName.ECHA_EC,
        version,
        recordCount,
        sourceUrl: 'https://echa.europa.eu/information-on-chemicals/ec-inventory',
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await txEm.persistAndFlush(source);
    }
  }
}
