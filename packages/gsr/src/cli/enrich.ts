// packages/gsr/src/cli/enrich.ts
import type { MikroORM } from '@mikro-orm/postgresql';
import { initOrm, closeOrm, Substance } from '@eurocomply/database';
import { gsrEntities } from '../entities/index.js';
import { PubChemEnricher } from '../seeders/pubchem.enricher.js';

export interface EnrichCommandOptions {
  batchSize: number;
  dryRun: boolean;
  onlyMissing: boolean;
}

/**
 * Initializes the ORM with GSR entities.
 */
async function getOrm(): Promise<MikroORM> {
  return initOrm({ additionalEntities: gsrEntities });
}

/**
 * Enriches substances with data from PubChem API.
 *
 * Fetches SMILES, InChIKey, IUPAC name, molecular weight, and molecular formula
 * for substances that have a CAS number.
 */
export async function enrichPubchem(options: EnrichCommandOptions): Promise<void> {
  console.log(`\nPubChem Enricher`);
  console.log(`================`);
  console.log(`Batch size: ${options.batchSize}`);
  console.log(`Only missing: ${options.onlyMissing}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  if (options.dryRun) {
    // Initialize ORM just to count
    console.log('Connecting to database...');
    const orm = await getOrm();

    try {
      const em = orm.em.fork();

      // Count substances that would be enriched
      const queryFilter: Record<string, unknown> = {};
      if (options.onlyMissing) {
        queryFilter['smiles'] = null;
      }

      const totalCount = await em.count(Substance, queryFilter);
      const withCas = await em.count(Substance, {
        ...queryFilter,
        casNumber: { $ne: null },
      });

      console.log(`\n[DRY RUN] Would process ${totalCount} substances`);
      console.log(`[DRY RUN] ${withCas} have CAS numbers and can be enriched`);
      console.log('[DRY RUN] No database changes will be made');
    } finally {
      await closeOrm();
    }
    return;
  }

  // Initialize ORM
  console.log('Connecting to database...');
  const orm = await getOrm();

  try {
    const em = orm.em.fork();
    const enricher = new PubChemEnricher(em);

    console.log('Enriching substances from PubChem...');
    console.log('(This may take a while due to API rate limits)\n');

    let lastProgressLog = 0;
    const result = await enricher.run({
      batchSize: options.batchSize,
      onlyMissing: options.onlyMissing,
      onProgress: (processed, total) => {
        // Log progress every 10 substances or at the end
        if (processed - lastProgressLog >= 10 || processed === total) {
          const percent = Math.round((processed / total) * 100);
          process.stdout.write(`\rProgress: ${processed}/${total} (${percent}%)`);
          lastProgressLog = processed;
        }
      },
    });

    // Clear the progress line
    process.stdout.write('\n');

    console.log(`\n[SUCCESS] ${result.message}`);
    console.log(`  Enriched: ${result.enrichedCount}`);
    console.log(`  Aliases created: ${result.aliasCount}`);
    console.log(`  Not found in PubChem: ${result.notFoundCount}`);
    console.log(`  Failed: ${result.failedCount}`);
    console.log(`  Skipped (already enriched): ${result.skippedCount}`);
    console.log(`  Total processed: ${result.totalProcessed}`);
    console.log(`  Version: ${result.version}`);
  } finally {
    await closeOrm();
  }
}

/**
 * Sets ECHA URLs for all substances that have EC numbers.
 *
 * Uses the format: https://echa.europa.eu/substance-information/-/substanceinfo/{ecNumber}
 */
export async function enrichEchaUrls(options: { dryRun: boolean }): Promise<void> {
  console.log(`\nECHA URL Enricher`);
  console.log(`=================`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  // Initialize ORM
  console.log('Connecting to database...');
  const orm = await getOrm();

  try {
    const em = orm.em.fork();
    const enricher = new PubChemEnricher(em);

    // Query substances with EC numbers but no ECHA URL
    const queryFilter = {
      ecNumber: { $ne: null },
      echaUrl: null,
    };

    const totalCount = await em.count(Substance, queryFilter);

    if (totalCount === 0) {
      console.log('\n[INFO] No substances need ECHA URL enrichment');
      console.log('[INFO] All substances with EC numbers already have ECHA URLs');
      return;
    }

    if (options.dryRun) {
      console.log(`\n[DRY RUN] Would set ECHA URLs for ${totalCount} substances`);
      console.log('[DRY RUN] No database changes will be made');
      return;
    }

    console.log(`Setting ECHA URLs for ${totalCount} substances...`);

    // Process in batches
    const batchSize = 500;
    let processed = 0;
    let enrichedCount = 0;

    while (processed < totalCount) {
      const substances = await em.find(Substance, queryFilter, {
        limit: batchSize,
        offset: 0, // Always 0 since we're modifying the query results
      });

      if (substances.length === 0) {
        break;
      }

      for (const substance of substances) {
        const echaUrl = enricher.generateEchaUrl(substance.ecNumber);
        if (echaUrl) {
          substance.echaUrl = echaUrl;
          enrichedCount++;
        }
      }

      await em.flush();
      processed += substances.length;

      const percent = Math.round((processed / totalCount) * 100);
      process.stdout.write(`\rProgress: ${processed}/${totalCount} (${percent}%)`);

      // Clear entity manager to prevent memory buildup
      em.clear();
    }

    // Clear the progress line
    process.stdout.write('\n');

    console.log(`\n[SUCCESS] Set ECHA URLs for ${enrichedCount} substances`);
  } finally {
    await closeOrm();
  }
}
