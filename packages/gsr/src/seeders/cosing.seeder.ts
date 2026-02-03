// packages/gsr/src/seeders/cosing.seeder.ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import { readXlsxFile } from '../utils/xlsx-reader.js';
import { IdentityLadder } from '../services/IdentityLadder.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { SubstanceCosing, CosmeticRestrictionType } from '../entities/SubstanceCosing.js';
import { UnresolvedSubstance, UnresolvedSource } from '../entities/UnresolvedSubstance.js';
import { UnresolvedStatus } from '../enums/UnresolvedStatus.js';
import {
  parseCosingAnnexII,
  parseCosingAnnexIII,
  parseCosingAnnexIV,
  parseCosingAnnexV,
  parseCosingAnnexVI,
  type CosingAnnexIIRow,
  type CosingAnnexIIIRow,
  type CosingAnnexIVRow,
  type CosingAnnexVRow,
  type CosingAnnexVIRow,
  type ParsedCosingEntry,
} from '../parsers/cosing.parser.js';

/**
 * Options for the CosIng seeder.
 */
export interface CosingSeederOptions {
  /** Directory containing XLS files */
  directory: string;
  /** If true, don't write to database */
  dryRun: boolean;
  /** Entity manager for database access */
  em: EntityManager;
  /** Optional progress callback */
  onProgress?: (message: string) => void;
}

/**
 * Result of the CosIng seeding operation.
 */
export interface CosingSeederResult {
  /** Total records processed from XLS files */
  processed: number;
  /** Records attached to Golden Record substances */
  attached: number;
  /** Records that couldn't be matched (no Golden Record found) */
  unresolved: number;
  /** Records with errors */
  errors: number;
}

/**
 * Configuration for each CosIng Annex file.
 */
interface AnnexFileConfig {
  /** Filename pattern to match */
  file: string;
  /** Parser function for this annex type */
  parser: (row: unknown) => ParsedCosingEntry | null;
}

/**
 * CosIng Annex file configurations.
 */
const ANNEX_FILES: AnnexFileConfig[] = [
  { file: 'COSING_Annex_II_v2.xls', parser: parseCosingAnnexII as (row: unknown) => ParsedCosingEntry | null },
  { file: 'COSING_Annex_III_v2.xls', parser: parseCosingAnnexIII as (row: unknown) => ParsedCosingEntry | null },
  { file: 'COSING_Annex_IV_v2.xls', parser: parseCosingAnnexIV as (row: unknown) => ParsedCosingEntry | null },
  { file: 'COSING_Annex_V_v2.xls', parser: parseCosingAnnexV as (row: unknown) => ParsedCosingEntry | null },
  { file: 'COSING_Annex_VI_v2.xls', parser: parseCosingAnnexVI as (row: unknown) => ParsedCosingEntry | null },
];

/**
 * Seeds CosIng cosmetics data from XLS files.
 *
 * Reads CosIng Annex II-VI XLS files from the specified directory,
 * parses the rows, uses Identity Ladder to match substances to Golden Records,
 * and creates SubstanceCosing persona records.
 *
 * @param options - Seeder options
 * @returns Seeding result with counts
 */
export async function seedCosing(options: CosingSeederOptions): Promise<CosingSeederResult> {
  const seeder = new CosingSeeder(options.em);
  return seeder.seedFromDirectory(options.directory, options.dryRun, options.onProgress);
}

/**
 * CosIng seeder class for seeding cosmetics substance data.
 *
 * Reads CosIng Annex XLS files, uses Identity Ladder to match substances,
 * and creates SubstanceCosing persona records linked to Golden Records.
 */
export class CosingSeeder {
  private readonly ladder: IdentityLadder;

  constructor(private readonly em: EntityManager) {
    this.ladder = new IdentityLadder(em);
  }

  /**
   * Seeds CosIng data from XLS files in a directory.
   *
   * @param directory - Directory containing CosIng XLS files
   * @param dryRun - If true, don't write to database
   * @param onProgress - Optional progress callback
   * @returns Seeding result with counts
   */
  async seedFromDirectory(
    directory: string,
    dryRun: boolean = false,
    onProgress?: (message: string) => void
  ): Promise<CosingSeederResult> {
    const result: CosingSeederResult = {
      processed: 0,
      attached: 0,
      unresolved: 0,
      errors: 0,
    };

    // Check directory exists
    if (!existsSync(directory)) {
      throw new Error(`Directory not found: ${directory}`);
    }

    // Get list of files in directory
    const files = readdirSync(directory);

    // Process each annex file
    for (const annexConfig of ANNEX_FILES) {
      const matchingFile = files.find(f => f === annexConfig.file || f.toLowerCase() === annexConfig.file.toLowerCase());

      if (!matchingFile) {
        onProgress?.(`Skipping ${annexConfig.file} (not found)`);
        continue;
      }

      const filePath = join(directory, matchingFile);
      onProgress?.(`Processing ${matchingFile}...`);

      try {
        const annexResult = await this.processAnnexFile(filePath, annexConfig.parser, dryRun, onProgress);
        result.processed += annexResult.processed;
        result.attached += annexResult.attached;
        result.unresolved += annexResult.unresolved;
        result.errors += annexResult.errors;
      } catch (error) {
        onProgress?.(`Error processing ${matchingFile}: ${error instanceof Error ? error.message : error}`);
        result.errors++;
      }
    }

    // Update registry source if not dry run
    if (!dryRun && result.attached > 0) {
      await this.updateRegistrySource(result.attached);
    }

    return result;
  }

  /**
   * Processes a single CosIng Annex XLS file.
   */
  private async processAnnexFile(
    filePath: string,
    parser: (row: unknown) => ParsedCosingEntry | null,
    dryRun: boolean,
    onProgress?: (message: string) => void
  ): Promise<CosingSeederResult> {
    const result: CosingSeederResult = {
      processed: 0,
      attached: 0,
      unresolved: 0,
      errors: 0,
    };

    // Read XLS file
    const rows = readXlsxFile<unknown>(filePath);
    onProgress?.(`  Found ${rows.length} rows`);

    for (const row of rows) {
      result.processed++;

      try {
        // Parse the row
        const parsed = parser(row);
        if (!parsed) {
          continue; // Skip invalid rows
        }

        // Try to match using Identity Ladder
        const ladderResult = await this.ladder.resolve({
          casNumber: parsed.casNumber ?? undefined,
          ecNumber: parsed.ecNumber ?? undefined,
          inciName: parsed.inciName,
          name: parsed.inciName,
        });

        if (ladderResult.status === 'FOUND' && ladderResult.substance) {
          // Check if persona already exists
          const existing = await this.em.findOne(SubstanceCosing, { cosingRef: parsed.cosingRef });

          if (existing) {
            // Skip if already seeded
            continue;
          }

          if (!dryRun) {
            // Create SubstanceCosing persona
            const cosing = this.em.create(SubstanceCosing, {
              id: createId(),
              substance: ladderResult.substance,
              cosingRef: parsed.cosingRef,
              inciName: parsed.inciName,
              inciNameNormalized: parsed.inciNameNormalized,
              restrictionType: parsed.restrictionType,
              restrictionText: parsed.restrictionText ?? undefined,
              maxConcentration: parsed.maxConcentration ?? undefined,
              concentrationUnit: parsed.concentrationUnit ?? undefined,
              sccsOpinions: parsed.sccsOpinions ? { opinions: parsed.sccsOpinions } : undefined,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            await this.em.persistAndFlush(cosing);
          }
          result.attached++;
        } else {
          // Track unresolved substance
          if (!dryRun) {
            await this.trackUnresolved(parsed);
          }
          result.unresolved++;
        }

        // Progress update every 100 rows
        if (result.processed % 100 === 0) {
          onProgress?.(`  Processed ${result.processed}/${rows.length} rows`);
        }
      } catch (error) {
        result.errors++;
        // Continue processing other rows
      }
    }

    return result;
  }

  /**
   * Tracks an unresolved CosIng substance.
   */
  private async trackUnresolved(parsed: ParsedCosingEntry): Promise<void> {
    // Check if already tracked
    const existing = await this.em.findOne(UnresolvedSubstance, {
      source: UnresolvedSource.COSING,
      rawCasNumber: parsed.casNumber ?? undefined,
      rawName: parsed.inciName,
    });

    if (existing) {
      // Increment occurrence count
      existing.occurrenceCount++;
      await this.em.persistAndFlush(existing);
    } else {
      // Create new unresolved record
      const unresolved = this.em.create(UnresolvedSubstance, {
        id: createId(),
        rawName: parsed.inciName,
        rawCasNumber: parsed.casNumber ?? undefined,
        source: UnresolvedSource.COSING,
        status: UnresolvedStatus.PENDING,
        occurrenceCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await this.em.persistAndFlush(unresolved);
    }
  }

  /**
   * Updates or creates the registry source record for CosIng.
   */
  private async updateRegistrySource(recordCount: number): Promise<void> {
    const existing = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.COSING,
    });

    if (existing) {
      existing.recordCount = (existing.recordCount ?? 0) + recordCount;
      existing.lastSyncedAt = new Date();
      await this.em.persistAndFlush(existing);
    } else {
      const now = new Date();
      const source = this.em.create(RegistrySource, {
        name: RegistrySourceName.COSING,
        recordCount,
        sourceUrl: 'https://ec.europa.eu/growth/tools-databases/cosing/',
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await this.em.persistAndFlush(source);
    }
  }

  /**
   * Gets current date in YYYY-MM format for default version.
   */
  private getCurrentVersion(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
