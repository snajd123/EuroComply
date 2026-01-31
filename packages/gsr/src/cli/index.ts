#!/usr/bin/env node
// packages/gsr/src/cli/index.ts
import { Command } from 'commander';
import { seedEchaInventory, seedEchaSvhc, seedAll, type SeedCommandOptions } from './seed.js';
import { enrichPubchem, enrichEchaUrls, type EnrichCommandOptions } from './enrich.js';

// Read package.json for version
const VERSION = '0.0.1';

const program = new Command();

program
  .name('gsr')
  .description('Global Substance Registry CLI - Manage substance data and regulatory lists')
  .version(VERSION);

// Seed command group
const seedCommand = program
  .command('seed')
  .description('Seed data from various sources');

// Enrich command group
const enrichCommand = program
  .command('enrich')
  .description('Enrich substance data from external sources');

// ECHA EC Inventory seeder
seedCommand
  .command('echa-inventory <csv-file>')
  .description('Seed substances from ECHA EC Inventory CSV file')
  .option('--data-version <version>', 'Version identifier for this data (default: current month YYYY-MM)')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .action(async (csvFile: string, options: { dataVersion?: string; dryRun: boolean }) => {
    try {
      const seedOptions: SeedCommandOptions = {
        version: options.dataVersion || '',
        dryRun: options.dryRun,
      };
      await seedEchaInventory(csvFile, seedOptions);
      process.exit(0);
    } catch (error) {
      console.error('\n[ERROR]', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ECHA SVHC seeder
seedCommand
  .command('echa-svhc <csv-file>')
  .description('Seed SVHC Candidate List entries from ECHA CSV file')
  .option('--data-version <version>', 'Version identifier for this data (default: current month YYYY-MM)')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .action(async (csvFile: string, options: { dataVersion?: string; dryRun: boolean }) => {
    try {
      const seedOptions: SeedCommandOptions = {
        version: options.dataVersion || '',
        dryRun: options.dryRun,
      };
      await seedEchaSvhc(csvFile, seedOptions);
      process.exit(0);
    } catch (error) {
      console.error('\n[ERROR]', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Seed all command
seedCommand
  .command('all')
  .description('Run all seeders (requires CSV files to be provided via individual commands)')
  .option('--data-version <version>', 'Version identifier for this data (default: current month YYYY-MM)')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .action(async (options: { dataVersion?: string; dryRun: boolean }) => {
    try {
      const seedOptions: SeedCommandOptions = {
        version: options.dataVersion || '',
        dryRun: options.dryRun,
      };
      await seedAll(seedOptions);
      process.exit(0);
    } catch (error) {
      console.error('\n[ERROR]', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// PubChem enricher
enrichCommand
  .command('pubchem')
  .description('Enrich substances with chemical data from PubChem API')
  .option('--batch-size <size>', 'Number of substances to process per batch', '100')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .option('--only-missing', 'Only enrich substances missing SMILES/InChI data', true)
  .option('--all', 'Enrich all substances, not just missing ones')
  .action(async (options: { batchSize: string; dryRun: boolean; onlyMissing: boolean; all?: boolean }) => {
    try {
      const enrichOptions: EnrichCommandOptions = {
        batchSize: parseInt(options.batchSize, 10),
        dryRun: options.dryRun,
        // --all flag overrides --only-missing
        onlyMissing: options.all ? false : options.onlyMissing,
      };
      await enrichPubchem(enrichOptions);
      process.exit(0);
    } catch (error) {
      console.error('\n[ERROR]', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ECHA URL enricher
enrichCommand
  .command('echa-urls')
  .description('Set ECHA URLs for substances with EC numbers')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .action(async (options: { dryRun: boolean }) => {
    try {
      await enrichEchaUrls({ dryRun: options.dryRun });
      process.exit(0);
    } catch (error) {
      console.error('\n[ERROR]', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Parse and execute
program.parse(process.argv);
