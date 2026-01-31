// packages/gsr/src/seeders/pubchem.enricher.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { Substance } from '@eurocomply/database';
import { PubChemClient } from '../clients/pubchem.client.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';

export interface EnricherResult {
  enriched: boolean;
  enrichedCount: number;
  failedCount: number;
  skippedCount: number;
  notFoundCount: number;
  totalProcessed: number;
  version: string;
  message: string;
}

export interface EnricherOptions {
  batchSize?: number;
  onlyMissing?: boolean;
  dryRun?: boolean;
  onProgress?: (processed: number, total: number) => void;
}

export interface BatchResult {
  enrichedCount: number;
  failedCount: number;
  notFoundCount: number;
}

/**
 * Enriches Substance records with chemical structure data from PubChem.
 *
 * Uses the PubChem PUG REST API to fetch SMILES, InChIKey, IUPAC name,
 * molecular weight, and molecular formula for substances that have a CAS number.
 */
export class PubChemEnricher {
  private readonly client: PubChemClient;
  private readonly em: EntityManager;

  constructor(em: EntityManager, client?: PubChemClient) {
    this.em = em;
    this.client = client ?? new PubChemClient();
  }

  /**
   * Enriches a single substance with PubChem data.
   *
   * @param substance - The substance to enrich
   * @returns true if enriched, false if skipped or not found
   */
  async enrichSubstance(substance: Substance): Promise<boolean> {
    // Skip if already enriched
    if (substance.smiles) {
      return false;
    }

    // Skip if no CAS number
    if (!substance.casNumber) {
      return false;
    }

    // Fetch enrichment data from PubChem
    const data = await this.client.getEnrichmentData(substance.casNumber);

    if (!data) {
      return false;
    }

    // Update substance with enrichment data
    if (data.smiles) {
      substance.smiles = data.smiles;
    }
    if (data.inchiKey) {
      substance.inchiKey = data.inchiKey;
    }
    if (data.iupacName) {
      substance.iupacName = data.iupacName;
    }
    if (data.molecularWeight !== null) {
      substance.molecularWeight = data.molecularWeight.toFixed(4);
    }
    if (data.molecularFormula) {
      substance.molecularFormula = data.molecularFormula;
    }

    return true;
  }

  /**
   * Enriches multiple substances in batch.
   *
   * @param substances - Array of substances to enrich
   * @param options - Options for batch processing
   * @returns BatchResult with counts
   */
  async enrichBatch(substances: Substance[], options?: EnricherOptions): Promise<BatchResult> {
    const { onProgress } = options ?? {};

    let enrichedCount = 0;
    let failedCount = 0;
    let notFoundCount = 0;

    for (let i = 0; i < substances.length; i++) {
      const substance = substances[i];
      if (!substance) continue;

      try {
        // Skip if already enriched
        if (substance.smiles) {
          // Still count progress even if skipped
          if (onProgress) {
            onProgress(i + 1, substances.length);
          }
          continue;
        }

        // Skip if no CAS number
        if (!substance.casNumber) {
          if (onProgress) {
            onProgress(i + 1, substances.length);
          }
          continue;
        }

        const enriched = await this.enrichSubstance(substance);

        if (enriched) {
          enrichedCount++;
        } else {
          // Not found in PubChem
          notFoundCount++;
        }
      } catch (error) {
        console.error(`Failed to enrich substance ${substance.casNumber}:`, error);
        failedCount++;
      }

      if (onProgress) {
        onProgress(i + 1, substances.length);
      }
    }

    // Flush all changes at once instead of per-substance
    await this.em.flush();

    return {
      enrichedCount,
      failedCount,
      notFoundCount,
    };
  }

  /**
   * Runs the full enrichment process for all substances.
   *
   * @param options - Options for the enrichment run
   * @returns EnricherResult with counts and status
   */
  async run(options?: EnricherOptions): Promise<EnricherResult> {
    const { batchSize = 100, onlyMissing = true, dryRun = false, onProgress } = options ?? {};

    // Get current date for version
    const now = new Date();
    const version = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Build query for substances to enrich
    const queryFilter: Record<string, unknown> = {};

    if (onlyMissing) {
      queryFilter['smiles'] = null;
    }

    // Count total substances to process
    const totalSubstances = await this.em.count(Substance, queryFilter);

    if (totalSubstances === 0) {
      return {
        enriched: false,
        enrichedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        notFoundCount: 0,
        totalProcessed: 0,
        version,
        message: 'No substances to enrich.',
      };
    }

    // If dry run, just report what would be done
    if (dryRun) {
      return {
        enriched: false,
        enrichedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        notFoundCount: 0,
        totalProcessed: 0,
        version,
        message: `[dry run] Would enrich ${totalSubstances} substances.`,
      };
    }

    // Process in batches
    let totalEnriched = 0;
    let totalFailed = 0;
    let totalNotFound = 0;
    let totalProcessed = 0;
    let skippedCount = 0;

    // If onlyMissing is true, we've already filtered out enriched ones
    // Calculate how many were skipped (already enriched)
    if (onlyMissing) {
      const allSubstanceCount = await this.em.count(Substance, {});
      skippedCount = allSubstanceCount - totalSubstances;
    }

    // When onlyMissing=true, enriched records drop out of the query (smiles becomes non-null),
    // so we always fetch with offset=0. When onlyMissing=false, we need to increment offset.
    let offset = 0;
    while (totalProcessed < totalSubstances) {
      const substances = await this.em.find(Substance, queryFilter, {
        limit: batchSize,
        offset: onlyMissing ? 0 : offset,
      });

      if (substances.length === 0) {
        break;
      }

      const batchResult = await this.enrichBatch(substances, {
        onProgress: onProgress
          ? (processed, _total) => {
              onProgress(totalProcessed + processed, totalSubstances);
            }
          : undefined,
      });

      totalEnriched += batchResult.enrichedCount;
      totalFailed += batchResult.failedCount;
      totalNotFound += batchResult.notFoundCount;
      totalProcessed += substances.length;

      // Clear entity manager to prevent memory buildup
      this.em.clear();

      // Only increment offset when not filtering by onlyMissing
      if (!onlyMissing) {
        offset += batchSize;
      }
    }

    // Update or create registry source record
    await this.updateRegistrySource(version, totalEnriched);

    return {
      enriched: totalEnriched > 0,
      enrichedCount: totalEnriched,
      failedCount: totalFailed,
      skippedCount,
      notFoundCount: totalNotFound,
      totalProcessed,
      version,
      message: `Enriched ${totalEnriched} substances from PubChem (${totalNotFound} not found, ${totalFailed} failed, ${skippedCount} skipped).`,
    };
  }

  /**
   * Updates or creates the PUBCHEM registry source record.
   */
  private async updateRegistrySource(version: string, recordCount: number): Promise<void> {
    const existing = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.PUBCHEM,
    });

    if (existing) {
      existing.version = version;
      existing.recordCount = recordCount;
      existing.lastSyncedAt = new Date();
      await this.em.persistAndFlush(existing);
    } else {
      const now = new Date();
      const source = this.em.create(RegistrySource, {
        name: RegistrySourceName.PUBCHEM,
        version,
        recordCount,
        sourceUrl: 'https://pubchem.ncbi.nlm.nih.gov/',
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await this.em.persistAndFlush(source);
    }
  }
}
