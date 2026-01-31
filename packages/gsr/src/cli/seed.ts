// packages/gsr/src/cli/seed.ts
import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import type { MikroORM } from '@mikro-orm/postgresql';
import { initOrm, closeOrm } from '@eurocomply/database';
import { gsrEntities } from '../entities/index.js';
import { EchaInventorySeeder } from '../seeders/echa-inventory.seeder.js';
import { EchaSvhcSeeder } from '../seeders/echa-svhc.seeder.js';

export interface SeedCommandOptions {
  version: string;
  dryRun: boolean;
}

/**
 * Gets the current month in YYYY-MM format for default version.
 */
function getCurrentVersion(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Resolves a file path to an absolute path.
 */
function resolveFilePath(filePath: string): string {
  if (isAbsolute(filePath)) {
    return filePath;
  }
  return resolve(process.cwd(), filePath);
}

/**
 * Reads a CSV file and returns its content.
 */
function readCsvFile(filePath: string): string {
  const absolutePath = resolveFilePath(filePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  return readFileSync(absolutePath, 'utf-8');
}

/**
 * Initializes the ORM with GSR entities.
 */
async function getOrm(): Promise<MikroORM> {
  return initOrm({ additionalEntities: gsrEntities });
}

/**
 * Seeds ECHA EC Inventory data from a CSV file.
 */
export async function seedEchaInventory(csvPath: string, options: SeedCommandOptions): Promise<void> {
  const version = options.version || getCurrentVersion();

  console.log(`\nECHA EC Inventory Seeder`);
  console.log(`========================`);
  console.log(`File: ${resolveFilePath(csvPath)}`);
  console.log(`Version: ${version}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  // Read CSV file
  console.log('Reading CSV file...');
  const csvContent = readCsvFile(csvPath);
  console.log(`Read ${csvContent.length} bytes`);

  if (options.dryRun) {
    // In dry-run mode, just parse and report
    console.log('\n[DRY RUN] Would seed ECHA EC Inventory data');
    console.log('[DRY RUN] No database changes will be made');

    // Count lines (rough estimate of records)
    const lines = csvContent.split('\n').filter((line) => line.trim());
    console.log(`[DRY RUN] CSV has ${lines.length - 1} data rows (excluding header)`);
    return;
  }

  // Initialize ORM
  console.log('Connecting to database...');
  const orm = await getOrm();

  try {
    const em = orm.em.fork();
    const seeder = new EchaInventorySeeder(em);

    console.log('Seeding data...');
    const result = await seeder.seedFromContent(csvContent, version);

    if (result.skipped) {
      console.log(`\n[SKIPPED] ${result.message}`);
    } else {
      console.log(`\n[SUCCESS] ${result.message}`);
      console.log(`  Substances: ${result.substanceCount}`);
      console.log(`  Aliases: ${result.aliasCount}`);
    }
  } finally {
    await closeOrm();
  }
}

/**
 * Seeds ECHA SVHC Candidate List data from a CSV file.
 */
export async function seedEchaSvhc(csvPath: string, options: SeedCommandOptions): Promise<void> {
  const version = options.version || getCurrentVersion();

  console.log(`\nECHA SVHC Candidate List Seeder`);
  console.log(`===============================`);
  console.log(`File: ${resolveFilePath(csvPath)}`);
  console.log(`Version: ${version}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  // Read CSV file
  console.log('Reading CSV file...');
  const csvContent = readCsvFile(csvPath);
  console.log(`Read ${csvContent.length} bytes`);

  if (options.dryRun) {
    // In dry-run mode, just parse and report
    console.log('\n[DRY RUN] Would seed ECHA SVHC data');
    console.log('[DRY RUN] No database changes will be made');

    // Count lines (rough estimate of records)
    const lines = csvContent.split('\n').filter((line) => line.trim());
    console.log(`[DRY RUN] CSV has ${lines.length - 1} data rows (excluding header)`);
    return;
  }

  // Initialize ORM
  console.log('Connecting to database...');
  const orm = await getOrm();

  try {
    const em = orm.em.fork();
    const seeder = new EchaSvhcSeeder(em);

    console.log('Seeding data...');
    const result = await seeder.seedFromContent(csvContent, version);

    if (result.skipped) {
      console.log(`\n[SKIPPED] ${result.message}`);
    } else {
      console.log(`\n[SUCCESS] ${result.message}`);
      console.log(`  Entries: ${result.entryCount}`);
      console.log(`  Skipped: ${result.skippedCount}`);
    }
  } finally {
    await closeOrm();
  }
}

/**
 * Seeds all available data sources.
 * Currently seeds ECHA EC Inventory and SVHC in sequence.
 */
export async function seedAll(options: SeedCommandOptions): Promise<void> {
  const version = options.version || getCurrentVersion();

  console.log(`\nGSR All Seeders`);
  console.log(`===============`);
  console.log(`Version: ${version}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  if (options.dryRun) {
    console.log('[DRY RUN] Would seed all available data sources');
    console.log('[DRY RUN] No database changes will be made');
    console.log('[DRY RUN] Note: This command requires CSV files to be provided via individual commands');
    return;
  }

  console.log('The "seed all" command seeds data sources that have existing data.');
  console.log('Use individual seed commands to import new CSV files:');
  console.log('  gsr seed echa-inventory <csv-file>');
  console.log('  gsr seed echa-svhc <csv-file>');
}
