// packages/gsr/src/seeders/efsa.seeder.ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import { IdentityLadder } from '../services/IdentityLadder.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { SubstanceEfsa } from '../entities/SubstanceEfsa.js';
import { UnresolvedSubstance, UnresolvedSource } from '../entities/UnresolvedSubstance.js';
import { UnresolvedStatus } from '../enums/UnresolvedStatus.js';
import { parseENumberLine, normalizeENumber, type ParsedENumber } from '../parsers/efsa.parser.js';

/**
 * Options for the EFSA seeder.
 */
export interface EfsaSeederOptions {
  /** Directory containing ENumbers.txt file */
  directory: string;
  /** If true, don't write to database */
  dryRun: boolean;
  /** Entity manager for database access */
  em: EntityManager;
  /** Optional progress callback */
  onProgress?: (message: string) => void;
}

/**
 * Result of the EFSA seeding operation.
 */
export interface EfsaSeederResult {
  /** Total records processed from ENumbers.txt (excluding groups) */
  processed: number;
  /** Records attached to Golden Record substances */
  attached: number;
  /** Records that couldn't be matched (no Golden Record found) */
  unresolved: number;
  /** Records with errors */
  errors: number;
}

/**
 * Seeds EFSA food additive data from ENumbers.txt file.
 *
 * Reads ENumbers.txt from the specified directory,
 * parses the lines, uses Identity Ladder to match substances to Golden Records,
 * and creates SubstanceEfsa persona records.
 *
 * @param options - Seeder options
 * @returns Seeding result with counts
 */
export async function seedEfsa(options: EfsaSeederOptions): Promise<EfsaSeederResult> {
  const seeder = new EfsaSeeder(options.em);
  return seeder.seedFromDirectory(options.directory, options.dryRun, options.onProgress);
}

/**
 * EFSA seeder class for seeding food additive substance data.
 *
 * Reads ENumbers.txt file, uses Identity Ladder to match substances,
 * and creates SubstanceEfsa persona records linked to Golden Records.
 */
export class EfsaSeeder {
  private readonly ladder: IdentityLadder;

  constructor(private readonly em: EntityManager) {
    this.ladder = new IdentityLadder(em);
  }

  /**
   * Seeds EFSA data from ENumbers.txt in a directory.
   *
   * @param directory - Directory containing ENumbers.txt file
   * @param dryRun - If true, don't write to database
   * @param onProgress - Optional progress callback
   * @returns Seeding result with counts
   */
  async seedFromDirectory(
    directory: string,
    dryRun: boolean = false,
    onProgress?: (message: string) => void
  ): Promise<EfsaSeederResult> {
    const result: EfsaSeederResult = {
      processed: 0,
      attached: 0,
      unresolved: 0,
      errors: 0,
    };

    // Check directory exists
    if (!existsSync(directory)) {
      throw new Error(`Directory not found: ${directory}`);
    }

    // Look for ENumbers.txt file
    const files = readdirSync(directory);
    const eNumbersFile = files.find(f => f.toLowerCase() === 'enumbers.txt');

    if (!eNumbersFile) {
      onProgress?.('ENumbers.txt not found in directory');
      return result;
    }

    const filePath = join(directory, eNumbersFile);
    onProgress?.(`Processing ${eNumbersFile}...`);

    // Read and parse file
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    onProgress?.(`  Found ${lines.length} lines`);

    for (const line of lines) {
      try {
        // Parse the line
        const parsed = parseENumberLine(line);
        if (!parsed) {
          continue; // Skip invalid lines
        }

        // Skip groups (e.g., "E210-213 Benzoates")
        if (parsed.isGroup) {
          onProgress?.(`  Skipping group: ${parsed.eNumber}`);
          continue;
        }

        result.processed++;

        // Normalize the E-number
        const normalizedENumber = normalizeENumber(parsed.eNumber);

        // Try to match using Identity Ladder
        // First try by E-number, then by name
        const ladderResult = await this.ladder.resolve({
          eNumber: normalizedENumber,
          name: parsed.name,
        });

        if (ladderResult.status === 'FOUND' && ladderResult.substance) {
          // Check if persona already exists for this E-number
          const existing = await this.em.findOne(SubstanceEfsa, { eNumber: normalizedENumber });

          if (existing) {
            // Skip if already seeded
            onProgress?.(`  Skipping existing: ${normalizedENumber}`);
            continue;
          }

          if (!dryRun) {
            // Create SubstanceEfsa persona
            const efsa = this.em.create(SubstanceEfsa, {
              id: createId(),
              substance: ladderResult.substance,
              eNumber: normalizedENumber,
              functionalClass: 'FOOD_ADDITIVE',  // Default class
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            await this.em.persistAndFlush(efsa);
          }
          result.attached++;
        } else {
          // Track unresolved substance
          if (!dryRun) {
            await this.trackUnresolved(parsed, normalizedENumber);
          }
          result.unresolved++;
        }

        // Progress update every 100 rows
        if (result.processed % 100 === 0) {
          onProgress?.(`  Processed ${result.processed}/${lines.length} lines`);
        }
      } catch (error) {
        result.errors++;
        // Continue processing other lines
        onProgress?.(`  Error processing line: ${error instanceof Error ? error.message : error}`);
      }
    }

    // Update registry source if not dry run
    if (!dryRun && result.attached > 0) {
      await this.updateRegistrySource(result.attached);
    }

    return result;
  }

  /**
   * Tracks an unresolved EFSA substance.
   */
  private async trackUnresolved(parsed: ParsedENumber, normalizedENumber: string): Promise<void> {
    // Check if already tracked
    const existing = await this.em.findOne(UnresolvedSubstance, {
      source: UnresolvedSource.EFSA,
      rawName: parsed.name,
    });

    if (existing) {
      // Increment occurrence count
      existing.occurrenceCount++;
      await this.em.persistAndFlush(existing);
    } else {
      // Create new unresolved record
      const unresolved = this.em.create(UnresolvedSubstance, {
        id: createId(),
        rawName: parsed.name,
        // Store E-number in rawCasNumber field (reusing the field for reference ID)
        rawCasNumber: normalizedENumber,
        source: UnresolvedSource.EFSA,
        status: UnresolvedStatus.PENDING,
        occurrenceCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await this.em.persistAndFlush(unresolved);
    }
  }

  /**
   * Updates or creates the registry source record for EFSA.
   */
  private async updateRegistrySource(recordCount: number): Promise<void> {
    const existing = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.EFSA,
    });

    if (existing) {
      existing.recordCount = (existing.recordCount ?? 0) + recordCount;
      existing.lastSyncedAt = new Date();
      await this.em.persistAndFlush(existing);
    } else {
      const now = new Date();
      const source = this.em.create(RegistrySource, {
        name: RegistrySourceName.EFSA,
        recordCount,
        sourceUrl: 'https://www.efsa.europa.eu/en/topics/topic/food-additives',
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await this.em.persistAndFlush(source);
    }
  }
}
