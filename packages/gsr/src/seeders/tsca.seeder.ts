// packages/gsr/src/seeders/tsca.seeder.ts
import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';
import type { EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import { parseTscaRow, type TscaRow } from '../parsers/tsca.parser.js';
import { IdentityLadder } from '../services/IdentityLadder.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { SubstanceTsca } from '../entities/SubstanceTsca.js';
import { UnresolvedSubstance, UnresolvedSource } from '../entities/UnresolvedSubstance.js';
import { UnresolvedStatus } from '../enums/UnresolvedStatus.js';

/**
 * Options for the TSCA seeder.
 */
export interface TscaSeederOptions {
  /** Path to the TSCA CSV file */
  file: string;
  /** If true, don't write to database */
  dryRun: boolean;
  /** Number of records per batch (default: 1000) */
  batchSize: number;
  /** Entity manager for database access */
  em: EntityManager;
  /** Optional progress callback */
  onProgress?: (message: string) => void;
}

/**
 * Result of the TSCA seeding operation.
 */
export interface TscaSeederResult {
  /** Total records processed from CSV */
  processed: number;
  /** Records attached to Golden Record substances */
  attached: number;
  /** Records that couldn't be matched (no Golden Record found) */
  unresolved: number;
  /** Records with errors */
  errors: number;
}

/**
 * Default batch size for processing.
 * With 70k+ substances, we need batching for efficiency.
 */
const DEFAULT_BATCH_SIZE = 1000;

/**
 * Seeds TSCA inventory data from CSV file.
 *
 * Streams the CSV file, parses rows using parseTscaRow,
 * uses Identity Ladder to match substances to Golden Records,
 * and creates SubstanceTsca persona records.
 *
 * @param options - Seeder options
 * @returns Seeding result with counts
 */
export async function seedTsca(options: TscaSeederOptions): Promise<TscaSeederResult> {
  const seeder = new TscaSeeder(options.em);
  return seeder.seedFromFile(
    options.file,
    options.dryRun,
    options.batchSize,
    options.onProgress
  );
}

/**
 * TSCA seeder class for seeding US EPA TSCA inventory data.
 *
 * Streams CSV file, uses Identity Ladder to match substances,
 * and creates SubstanceTsca persona records linked to Golden Records.
 */
export class TscaSeeder {
  private readonly ladder: IdentityLadder;

  constructor(private readonly em: EntityManager) {
    this.ladder = new IdentityLadder(em);
  }

  /**
   * Seeds TSCA data from a CSV file.
   *
   * @param filePath - Path to the TSCA CSV file
   * @param dryRun - If true, don't write to database
   * @param batchSize - Records per batch (default: 1000)
   * @param onProgress - Optional progress callback
   * @returns Seeding result with counts
   */
  async seedFromFile(
    filePath: string,
    dryRun: boolean = false,
    batchSize: number = DEFAULT_BATCH_SIZE,
    onProgress?: (message: string) => void
  ): Promise<TscaSeederResult> {
    const result: TscaSeederResult = {
      processed: 0,
      attached: 0,
      unresolved: 0,
      errors: 0,
    };

    // Batch for deferred operations
    let batchCount = 0;

    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath, { encoding: 'utf-8' });
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        bom: true,
      });

      stream.pipe(parser);

      parser.on('data', async (row: TscaRow) => {
        result.processed++;
        batchCount++;

        // Pause stream to handle async processing
        parser.pause();

        try {
          await this.processRow(row, dryRun, result);
        } catch (error) {
          result.errors++;
        }

        // Progress update every batch
        if (batchCount >= batchSize) {
          onProgress?.(
            `Processed ${result.processed.toLocaleString()} records, attached ${result.attached.toLocaleString()}...`
          );
          batchCount = 0;
        }

        parser.resume();
      });

      parser.on('error', reject);

      parser.on('end', async () => {
        try {
          // Update registry source if not dry run and we attached any records
          if (!dryRun && result.attached > 0) {
            await this.updateRegistrySource(result.attached);
          }

          onProgress?.(
            `Completed: ${result.processed.toLocaleString()} processed, ${result.attached.toLocaleString()} attached`
          );

          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Processes a single TSCA row.
   */
  private async processRow(
    row: TscaRow,
    dryRun: boolean,
    result: TscaSeederResult
  ): Promise<void> {
    // Parse the row
    const parsed = parseTscaRow(row);

    // Skip if no CAS number
    if (!parsed.tscaCas) {
      result.errors++;
      return;
    }

    // Try to match using Identity Ladder (by CAS number)
    const ladderResult = await this.ladder.resolve({
      casNumber: parsed.tscaCas,
      name: parsed.chemName,
    });

    if (ladderResult.status === 'FOUND' && ladderResult.substance) {
      // Check if persona already exists for this CAS
      const existing = await this.em.findOne(SubstanceTsca, { tscaCas: parsed.tscaCas });

      if (existing) {
        // Skip if already seeded
        return;
      }

      if (!dryRun) {
        // Create SubstanceTsca persona
        const tsca = this.em.create(SubstanceTsca, {
          id: createId(),
          substance: ladderResult.substance,
          tscaCas: parsed.tscaCas,
          inventoryStatus: parsed.inventoryStatus,
          isSection5: false,
          isSection6: false,
          isSnur: parsed.hasRestrictions, // 'S' flag indicates SNUR
          cdrFlags: parsed.flags.length > 0 ? { flags: parsed.flags, isUvcb: parsed.isUvcb } : undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await this.em.persistAndFlush(tsca);
      }
      result.attached++;
    } else {
      // Track unresolved substance
      if (!dryRun) {
        await this.trackUnresolved(parsed.tscaCas, parsed.chemName);
      }
      result.unresolved++;
    }
  }

  /**
   * Tracks an unresolved TSCA substance.
   */
  private async trackUnresolved(casNumber: string, chemName: string): Promise<void> {
    // Check if already tracked
    const existing = await this.em.findOne(UnresolvedSubstance, {
      source: UnresolvedSource.TSCA,
      rawCasNumber: casNumber,
    });

    if (existing) {
      // Increment occurrence count
      existing.occurrenceCount++;
      await this.em.persistAndFlush(existing);
    } else {
      // Create new unresolved record
      const unresolved = this.em.create(UnresolvedSubstance, {
        id: createId(),
        rawName: chemName,
        rawCasNumber: casNumber,
        source: UnresolvedSource.TSCA,
        status: UnresolvedStatus.PENDING,
        occurrenceCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await this.em.persistAndFlush(unresolved);
    }
  }

  /**
   * Updates or creates the registry source record for TSCA.
   */
  private async updateRegistrySource(recordCount: number): Promise<void> {
    const existing = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.TSCA,
    });

    if (existing) {
      existing.recordCount = (existing.recordCount ?? 0) + recordCount;
      existing.lastSyncedAt = new Date();
      await this.em.persistAndFlush(existing);
    } else {
      const now = new Date();
      const source = this.em.create(RegistrySource, {
        name: RegistrySourceName.TSCA,
        recordCount,
        sourceUrl: 'https://www.epa.gov/tsca-inventory',
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await this.em.persistAndFlush(source);
    }
  }
}
