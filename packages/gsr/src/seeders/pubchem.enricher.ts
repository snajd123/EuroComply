// packages/gsr/src/seeders/pubchem.enricher.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { Substance, SubstanceAlias, AliasType, AliasSource } from '@eurocomply/database';
import { PubChemClient } from '../clients/pubchem.client.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';

export interface EnricherResult {
  enriched: boolean;
  enrichedCount: number;
  aliasCount: number;
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
  aliasCount: number;
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
   * Generates the ECHA substance information URL for a given EC number.
   *
   * @param ecNumber - The EC number (e.g., "200-001-8")
   * @returns The ECHA URL or null if ecNumber is undefined/empty
   */
  generateEchaUrl(ecNumber: string | undefined): string | null {
    if (!ecNumber || ecNumber.trim() === '') {
      return null;
    }
    return `https://echa.europa.eu/substance-information/-/substanceinfo/${ecNumber}`;
  }

  /**
   * Enriches a single substance with PubChem data.
   *
   * @param substance - The substance to enrich
   * @returns Object with enriched status and alias count
   */
  async enrichSubstance(substance: Substance): Promise<{ enriched: boolean; aliasCount: number }> {
    // Always set ECHA URL if substance has an EC number, regardless of other enrichment
    const echaUrl = this.generateEchaUrl(substance.ecNumber);
    if (echaUrl) {
      substance.echaUrl = echaUrl;
    }

    // Skip if already enriched
    if (substance.smiles) {
      return { enriched: false, aliasCount: 0 };
    }

    // Skip if no CAS number
    if (!substance.casNumber) {
      return { enriched: false, aliasCount: 0 };
    }

    // Fetch enrichment data from PubChem
    const data = await this.client.getEnrichmentData(substance.casNumber);

    if (!data) {
      return { enriched: false, aliasCount: 0 };
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

    // Create aliases from PubChem synonyms
    let aliasCount = 0;
    if (data.synonyms && data.synonyms.length > 0) {
      aliasCount = await this.createAliases(substance, data.synonyms);
    }

    return { enriched: true, aliasCount };
  }

  /**
   * Creates SubstanceAlias records from PubChem synonyms.
   * Skips duplicates and limits to reasonable number of aliases per substance.
   */
  private async createAliases(substance: Substance, synonyms: string[]): Promise<number> {
    // Limit synonyms to prevent overwhelming the database
    // PubChem can return hundreds of synonyms for common compounds
    const MAX_ALIASES_PER_SUBSTANCE = 50;
    const limitedSynonyms = synonyms.slice(0, MAX_ALIASES_PER_SUBSTANCE);

    // Get existing aliases to avoid duplicates
    const existingAliases = await this.em.find(SubstanceAlias, {
      substance: substance,
      source: AliasSource.PUBCHEM,
    });
    const existingNames = new Set(existingAliases.map((a) => a.name.toLowerCase()));

    let created = 0;
    for (const synonym of limitedSynonyms) {
      // Skip empty or very short synonyms
      if (!synonym || synonym.trim().length < 2) {
        continue;
      }

      // Skip if already exists
      if (existingNames.has(synonym.toLowerCase())) {
        continue;
      }

      // Skip if it's the same as the primary name
      if (synonym.toLowerCase() === substance.primaryName?.toLowerCase()) {
        continue;
      }

      // Skip if it's the CAS number (PubChem includes CAS in synonyms)
      if (synonym === substance.casNumber) {
        continue;
      }

      // Determine alias type based on content
      const aliasType = this.classifySynonym(synonym);

      // Use class constructor to avoid MikroORM RequiredEntityData type issues
      const alias = new SubstanceAlias();
      alias.substance = substance;
      alias.name = synonym;
      alias.type = aliasType;
      alias.source = AliasSource.PUBCHEM;
      alias.language = 'en';
      this.em.persist(alias);
      existingNames.add(synonym.toLowerCase());
      created++;
    }

    return created;
  }

  /**
   * Attempts to classify a synonym into an alias type.
   */
  private classifySynonym(synonym: string): AliasType {
    // CAS-like patterns
    if (/^\d{1,7}-\d{2}-\d$/.test(synonym)) {
      return AliasType.SYNONYM;
    }

    // IUPAC-like names (systematic, often complex)
    if (
      synonym.includes('yl') ||
      synonym.includes('ane') ||
      synonym.includes('ene') ||
      synonym.includes('oic acid') ||
      synonym.includes('ol ')
    ) {
      return AliasType.IUPAC;
    }

    // Trade names often have ® or ™ or are ALL CAPS
    if (synonym.includes('®') || synonym.includes('™') || synonym === synonym.toUpperCase()) {
      return AliasType.TRADE;
    }

    // Default to synonym
    return AliasType.SYNONYM;
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
    let aliasCount = 0;
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

        const result = await this.enrichSubstance(substance);

        if (result.enriched) {
          enrichedCount++;
          aliasCount += result.aliasCount;
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
      aliasCount,
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
        aliasCount: 0,
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
        aliasCount: 0,
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
    let totalAliases = 0;
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

    // Track processed substance IDs to avoid re-processing "not found" substances
    const processedIds = new Set<string>();
    let offset = 0;

    while (totalProcessed < totalSubstances) {
      // For onlyMissing, we use offset to skip already-processed substances
      // that weren't found in PubChem (their SMILES stays null)
      const substances = await this.em.find(Substance, queryFilter, {
        limit: batchSize,
        offset: offset,
        orderBy: { id: 'ASC' }, // Consistent ordering for pagination
      });

      if (substances.length === 0) {
        break;
      }

      // Filter out already-processed substances (in case we're re-running)
      const toProcess = substances.filter((s) => !processedIds.has(s.id));
      if (toProcess.length === 0) {
        offset += batchSize;
        continue;
      }

      // Mark as processed before enrichment
      for (const s of toProcess) {
        processedIds.add(s.id);
      }

      const batchResult = await this.enrichBatch(toProcess, {
        onProgress: onProgress
          ? (processed, _total) => {
              onProgress(totalProcessed + processed, totalSubstances);
            }
          : undefined,
      });

      totalEnriched += batchResult.enrichedCount;
      totalAliases += batchResult.aliasCount;
      totalFailed += batchResult.failedCount;
      totalNotFound += batchResult.notFoundCount;
      totalProcessed += toProcess.length;

      // Clear entity manager to prevent memory buildup
      this.em.clear();

      // Always increment offset to move through the dataset
      offset += batchSize;
    }

    // Update or create registry source record
    await this.updateRegistrySource(version, totalEnriched);

    return {
      enriched: totalEnriched > 0,
      enrichedCount: totalEnriched,
      aliasCount: totalAliases,
      failedCount: totalFailed,
      skippedCount,
      notFoundCount: totalNotFound,
      totalProcessed,
      version,
      message: `Enriched ${totalEnriched} substances from PubChem with ${totalAliases} aliases (${totalNotFound} not found, ${totalFailed} failed, ${skippedCount} skipped).`,
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
