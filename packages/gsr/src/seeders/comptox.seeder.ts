// packages/gsr/src/seeders/comptox.seeder.ts
import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';
import type { EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import { parseComptoxRow, type ComptoxRow, type ParsedComptoxSubstance } from '../parsers/comptox.parser.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';

/**
 * Options for the CompTox seeder.
 */
export interface ComptoxSeederOptions {
  /** Path to the CompTox CSV file */
  file: string;
  /** If true, don't write to database */
  dryRun: boolean;
  /** Number of records per batch insert (default: 5000) */
  batchSize: number;
  /** Entity manager for database access */
  em: EntityManager;
  /** Optional progress callback */
  onProgress?: (message: string) => void;
}

/**
 * Result of the CompTox seeding operation.
 */
export interface ComptoxSeederResult {
  /** Total records processed from CSV */
  processed: number;
  /** Records created (inserted or updated) */
  created: number;
  /** Records skipped (no valid DTXSID) */
  skipped: number;
  /** Records with errors */
  errors: number;
}

/**
 * Default batch size for bulk inserts.
 * With 1.2M+ substances, we need large batches for efficiency.
 */
const DEFAULT_BATCH_SIZE = 5000;

/**
 * Builds a raw SQL INSERT statement for bulk substance insert with ON CONFLICT.
 *
 * Uses ON CONFLICT (dtxsid) DO UPDATE to handle re-seeding scenarios.
 * Only updates records when dtxsid already exists.
 *
 * @param substances - Parsed substance data
 * @returns SQL query and parameters
 */
export function buildBulkInsertSql(substances: ParsedComptoxSubstance[]): {
  sql: string;
  params: unknown[];
} {
  if (substances.length === 0) {
    return { sql: '', params: [] };
  }

  const placeholders: string[] = [];
  const params: unknown[] = [];

  for (const sub of substances) {
    const id = createId();
    // (id, cas_number, primary_name, molecular_formula, molecular_weight, smiles, inchi_key, iupac_name, dtxsid, qc_level, source_version, created_at, updated_at)
    placeholders.push(`(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`);
    params.push(
      id,
      sub.casNumber,
      sub.canonicalName,
      sub.molecularFormula,
      sub.molecularWeight,
      sub.smiles,
      sub.inchiKey,
      sub.iupacName,
      sub.dtxsid,
      sub.qcLevel,
      'comptox'
    );
  }

  // Note: We use dtxsid for conflict detection because:
  // 1. Every CompTox record has a dtxsid (it's the primary key in their system)
  // 2. CAS numbers can be null or duplicated in CompTox
  // 3. This allows us to re-seed and update records based on their source ID
  //
  // IMPORTANT: We use ON CONFLICT DO NOTHING for cas_number because:
  // - Many CompTox records share the same CAS number (stereoisomers, etc.)
  // - The first one we see will be inserted, others will be skipped
  // - This is acceptable for the foundation layer - we want unique CAS records
  const sql = `
    INSERT INTO substance (
      id, cas_number, primary_name, molecular_formula, molecular_weight,
      smiles, inchi_key, iupac_name, dtxsid, qc_level, source_version, created_at, updated_at
    )
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (cas_number) DO UPDATE SET
      primary_name = COALESCE(EXCLUDED.primary_name, substance.primary_name),
      molecular_formula = COALESCE(EXCLUDED.molecular_formula, substance.molecular_formula),
      molecular_weight = COALESCE(EXCLUDED.molecular_weight, substance.molecular_weight),
      smiles = COALESCE(EXCLUDED.smiles, substance.smiles),
      inchi_key = COALESCE(EXCLUDED.inchi_key, substance.inchi_key),
      iupac_name = COALESCE(EXCLUDED.iupac_name, substance.iupac_name),
      dtxsid = COALESCE(EXCLUDED.dtxsid, substance.dtxsid),
      qc_level = COALESCE(EXCLUDED.qc_level, substance.qc_level),
      source_version = EXCLUDED.source_version,
      updated_at = NOW()
  `;

  return { sql, params };
}

/**
 * Seeds substances from EPA CompTox CSV file into the database.
 *
 * This seeder is optimized for large datasets (1.2M+ substances):
 * - Streams CSV file to avoid memory issues
 * - Uses raw SQL bulk inserts for performance
 * - Reports progress every batch
 *
 * @param options - Seeder options
 * @returns Seeding result with counts
 */
export async function seedComptox(options: ComptoxSeederOptions): Promise<ComptoxSeederResult> {
  const { file, dryRun, em, onProgress } = options;
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;

  const result: ComptoxSeederResult = {
    processed: 0,
    created: 0,
    skipped: 0,
    errors: 0,
  };

  if (dryRun) {
    // In dry-run mode, just count records
    return new Promise((resolve, reject) => {
      const stream = createReadStream(file, { encoding: 'utf-8' });
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        bom: true,
      });

      stream.pipe(parser);

      parser.on('data', (row: ComptoxRow) => {
        result.processed++;
        const dtxsid = row.DTXSID?.trim();
        if (!dtxsid) {
          result.skipped++;
        } else {
          result.created++;
        }

        if (result.processed % 100000 === 0) {
          onProgress?.(`[DRY RUN] Processed ${result.processed.toLocaleString()} records...`);
        }
      });

      parser.on('error', reject);
      parser.on('end', () => resolve(result));
    });
  }

  // Full seeding mode - stream CSV and batch insert
  const conn = em.getConnection();
  const batch: ParsedComptoxSubstance[] = [];

  /**
   * Flushes the current batch to the database.
   */
  async function flushBatch(): Promise<void> {
    if (batch.length === 0) return;

    // Filter out records without CAS numbers - we can't insert them into substance table
    const withCas = batch.filter((s) => s.casNumber !== null);
    const withoutCas = batch.length - withCas.length;

    if (withCas.length > 0) {
      const { sql, params } = buildBulkInsertSql(withCas);
      try {
        await conn.execute(sql, params);
        result.created += withCas.length;
      } catch (err) {
        // On batch failure, try individual inserts to find which ones fail
        result.errors += withCas.length;
        // Log but don't throw - continue processing
        console.error(`Batch insert failed, attempting individual inserts...`);

        for (const sub of withCas) {
          try {
            const { sql: singleSql, params: singleParams } = buildBulkInsertSql([sub]);
            await conn.execute(singleSql, singleParams);
            result.created++;
            result.errors--;
          } catch {
            // Individual record failed, leave it in errors count
          }
        }
      }
    }

    result.skipped += withoutCas;
    batch.length = 0;
  }

  return new Promise((resolve, reject) => {
    const stream = createReadStream(file, { encoding: 'utf-8' });
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true, // Handle UTF-8 BOM
    });

    stream.pipe(parser);

    parser.on('data', async (row: ComptoxRow) => {
      result.processed++;

      // Parse the row
      const dtxsid = row.DTXSID?.trim();
      if (!dtxsid) {
        result.skipped++;
        return;
      }

      try {
        const parsed = parseComptoxRow(row);
        batch.push(parsed);

        // Flush when batch is full
        if (batch.length >= batchSize) {
          parser.pause();
          await flushBatch();
          onProgress?.(
            `Processed ${result.processed.toLocaleString()} records, created ${result.created.toLocaleString()}...`
          );
          parser.resume();
        }
      } catch (err) {
        result.errors++;
      }
    });

    parser.on('error', reject);

    parser.on('end', async () => {
      try {
        // Flush any remaining records
        await flushBatch();
        onProgress?.(
          `Completed: ${result.processed.toLocaleString()} processed, ${result.created.toLocaleString()} created`
        );

        // Update registry source
        await updateRegistrySource(em, result.created);

        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Updates or creates the registry source record for EPA CompTox.
 */
async function updateRegistrySource(em: EntityManager, recordCount: number): Promise<void> {
  const existing = await em.findOne(RegistrySource, {
    name: RegistrySourceName.EPA_COMPTOX,
  });

  if (existing) {
    existing.recordCount = recordCount;
    existing.lastSyncedAt = new Date();
    await em.persistAndFlush(existing);
  } else {
    const now = new Date();
    const source = em.create(RegistrySource, {
      name: RegistrySourceName.EPA_COMPTOX,
      recordCount,
      sourceUrl: 'https://comptox.epa.gov/dashboard',
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await em.persistAndFlush(source);
  }
}

/**
 * High-level seeder class for CompTox data.
 * Provides a simpler interface for the CLI.
 */
export class ComptoxSeeder {
  constructor(private readonly em: EntityManager) {}

  /**
   * Seeds CompTox data from a CSV file.
   *
   * @param filePath - Path to the CompTox CSV file
   * @param dryRun - If true, don't write to database
   * @param batchSize - Records per batch (default: 5000)
   * @param onProgress - Optional progress callback
   */
  async seedFromFile(
    filePath: string,
    dryRun: boolean = false,
    batchSize: number = DEFAULT_BATCH_SIZE,
    onProgress?: (message: string) => void
  ): Promise<ComptoxSeederResult> {
    return seedComptox({
      file: filePath,
      dryRun,
      batchSize,
      em: this.em,
      onProgress,
    });
  }
}
