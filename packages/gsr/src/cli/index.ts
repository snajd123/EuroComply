#!/usr/bin/env node
// packages/gsr/src/cli/index.ts
import { Command } from 'commander';
import { seedEchaInventory, seedEchaSvhc, seedEchaAnnexXvii, seedEchaAnnexXiv, seedEchaPop, seedRohs, seedAll, seedClpReference, seedClpHarmonised, type SeedCommandOptions, type ClpSeedOptions } from './seed.js';
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
  .command('echa-inventory <file>')
  .description('Seed substances from ECHA EC Inventory (supports .csv or .i6z format)')
  .option('--data-version <version>', 'Version identifier for this data (default: current month YYYY-MM)')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .action(async (file: string, options: { dataVersion?: string; dryRun: boolean }) => {
    try {
      const seedOptions: SeedCommandOptions = {
        version: options.dataVersion || '',
        dryRun: options.dryRun,
      };
      await seedEchaInventory(file, seedOptions);
      process.exit(0);
    } catch (error) {
      console.error('\n[ERROR]', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ECHA SVHC seeder
seedCommand
  .command('echa-svhc [file]')
  .description('Seed SVHC Candidate List entries. Use --entries and --substances for complete data with groups, or provide a single file for legacy mode.')
  .option('--entries <file>', 'Entries/full file with regulatory data (dates, reasons, decision URLs)')
  .option('--substances <file>', 'Substances/expanded file with all individual substances')
  .option('--data-version <version>', 'Version identifier for this data (default: current month YYYY-MM)')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .action(async (file: string | undefined, options: { entries?: string; substances?: string; dataVersion?: string; dryRun: boolean }) => {
    try {
      await seedEchaSvhc(file, {
        version: options.dataVersion || '',
        dryRun: options.dryRun,
        entries: options.entries,
        substances: options.substances,
      });
      process.exit(0);
    } catch (error) {
      console.error('\n[ERROR]', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ECHA Annex XVII seeder
seedCommand
  .command('echa-annex-xvii [file]')
  .description('Seed REACH Annex XVII restrictions. Use --entries and --substances for complete data with EUR-Lex URLs, or provide a single file for legacy mode.')
  .option('--entries <file>', 'Entries file with Entry numbers and EUR-Lex URLs (grouped export)')
  .option('--substances <file>', 'Substances file with all individual substances (expanded export)')
  .option('--data-version <version>', 'Version identifier for this data (default: current month YYYY-MM)')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .action(async (file: string | undefined, options: { entries?: string; substances?: string; dataVersion?: string; dryRun: boolean }) => {
    try {
      await seedEchaAnnexXvii(file, {
        version: options.dataVersion || '',
        dryRun: options.dryRun,
        entries: options.entries,
        substances: options.substances,
      });
      process.exit(0);
    } catch (error) {
      console.error('\n[ERROR]', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ECHA Annex XIV seeder
seedCommand
  .command('echa-annex-xiv [file]')
  .description('Seed REACH Annex XIV (Authorization List). Use --entries and --substances for complete data, or provide a single file for legacy mode.')
  .option('--entries <file>', 'Entries/full file with regulatory data (dates, reasons, exemptions)')
  .option('--substances <file>', 'Substances/expanded file with all individual substances')
  .option('--data-version <version>', 'Version identifier for this data (default: current month YYYY-MM)')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .action(async (file: string | undefined, options: { entries?: string; substances?: string; dataVersion?: string; dryRun: boolean }) => {
    try {
      await seedEchaAnnexXiv(file, {
        version: options.dataVersion || '',
        dryRun: options.dryRun,
        entries: options.entries,
        substances: options.substances,
      });
      process.exit(0);
    } catch (error) {
      console.error('\n[ERROR]', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ECHA POP Regulation seeder
seedCommand
  .command('echa-pop [file]')
  .description('Seed POP Regulation (Persistent Organic Pollutants). Use --entries and --substances for complete data with groups, or provide a single file for legacy mode.')
  .option('--entries <file>', 'Entries/full file with regulatory data (annexes, dates)')
  .option('--substances <file>', 'Substances/expanded file with all individual substances')
  .option('--data-version <version>', 'Version identifier for this data (default: current month YYYY-MM)')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .action(async (file: string | undefined, options: { entries?: string; substances?: string; dataVersion?: string; dryRun: boolean }) => {
    try {
      await seedEchaPop(file, {
        version: options.dataVersion || '',
        dryRun: options.dryRun,
        entries: options.entries,
        substances: options.substances,
      });
      process.exit(0);
    } catch (error) {
      console.error('\n[ERROR]', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// RoHS seeder (no CSV needed - hardcoded list)
seedCommand
  .command('rohs')
  .description('Seed RoHS Directive Annex II restricted substances (hardcoded list, no CSV needed)')
  .option('--data-version <version>', 'Version identifier for this data (default: current month YYYY-MM)')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .action(async (options: { dataVersion?: string; dryRun: boolean }) => {
    try {
      const seedOptions: SeedCommandOptions = {
        version: options.dataVersion || '',
        dryRun: options.dryRun,
      };
      await seedRohs(seedOptions);
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

// CLP reference seeder (hazard classes and H-statements)
seedCommand
  .command('clp-reference')
  .description('Seed CLP hazard classes and H-statements (run first before clp-harmonised)')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .action(async (options: { dryRun: boolean }) => {
    try {
      const seedOptions: SeedCommandOptions = {
        version: '',
        dryRun: options.dryRun,
      };
      await seedClpReference(seedOptions);
      process.exit(0);
    } catch (error) {
      console.error('\n[ERROR]', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// CLP harmonised seeder (classifications from ECHA XLSX)
seedCommand
  .command('clp-harmonised <file>')
  .description('Seed CLP harmonised classifications from ECHA XLSX file')
  .option('--version <version>', 'ATP version (e.g., ATP21, ATP22)', 'ATP21')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .action(async (file: string, options: { version?: string; dryRun: boolean }) => {
    try {
      const seedOptions: ClpSeedOptions = {
        version: options.version || 'ATP21',
        dryRun: options.dryRun,
      };
      await seedClpHarmonised(file, seedOptions);
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
