// packages/gsr/src/cli/seed.ts
import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { detectFileFormat } from '../utils/xlsx-reader.js';
import type { MikroORM } from '@mikro-orm/postgresql';
import { initOrm, closeOrm } from '@eurocomply/database';
import { gsrEntities } from '../entities/index.js';
import { EchaInventorySeeder } from '../seeders/echa-inventory.seeder.js';
import { EchaSvhcSeeder } from '../seeders/echa-svhc.seeder.js';
import { EchaAnnexXviiSeeder } from '../seeders/echa-annex-xvii.seeder.js';
import { EchaAnnexXivSeeder } from '../seeders/echa-annex-xiv.seeder.js';
import { EchaPopSeeder } from '../seeders/echa-pop.seeder.js';
import { RohsSeeder } from '../seeders/rohs.seeder.js';
import { HazardReferenceSeeder } from '../seeders/hazard-reference.seeder.js';
import { ClpHarmonisedSeeder } from '../seeders/clp-harmonised.seeder.js';
import { ComptoxSeeder } from '../seeders/comptox.seeder.js';
import { CosingSeeder } from '../seeders/cosing.seeder.js';
import { EfsaSeeder } from '../seeders/efsa.seeder.js';
import { TscaSeeder } from '../seeders/tsca.seeder.js';

export interface SeedCommandOptions {
  version?: string;
  dryRun: boolean;
}

export interface ClpSeedOptions extends SeedCommandOptions {
  version?: string;
}

export interface ComptoxSeedOptions extends SeedCommandOptions {
  batchSize: number;
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
 * Checks if a file exists at the given path.
 */
function checkFileExists(filePath: string): void {
  const absolutePath = resolveFilePath(filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
}

/**
 * Detects inventory file format based on extension.
 */
function detectInventoryFormat(filePath: string): 'csv' | 'i6z' {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.i6z')) {
    return 'i6z';
  }
  return 'csv';
}

/**
 * Initializes the ORM with GSR entities.
 */
async function getOrm(): Promise<MikroORM> {
  return initOrm({ additionalEntities: gsrEntities });
}

/**
 * Seeds ECHA EC Inventory data from a file (CSV or i6z format).
 */
export async function seedEchaInventory(filePath: string, options: SeedCommandOptions): Promise<void> {
  const version = options.version || getCurrentVersion();
  const absolutePath = resolveFilePath(filePath);
  const format = detectInventoryFormat(filePath);

  console.log(`\nECHA EC Inventory Seeder`);
  console.log(`========================`);
  console.log(`File: ${absolutePath}`);
  console.log(`Format: ${format.toUpperCase()}`);
  console.log(`Version: ${version}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  // Check file exists
  checkFileExists(filePath);

  if (options.dryRun) {
    // In dry-run mode, just report
    console.log('\n[DRY RUN] Would seed ECHA EC Inventory data');
    console.log('[DRY RUN] No database changes will be made');

    if (format === 'csv') {
      const csvContent = readCsvFile(filePath);
      const lines = csvContent.split('\n').filter((line) => line.trim());
      console.log(`[DRY RUN] CSV has ${lines.length - 1} data rows (excluding header)`);
    } else {
      console.log(`[DRY RUN] i6z file will be extracted and parsed`);
      console.log(`[DRY RUN] Expected: ~106,000 substances from full EC Inventory`);
    }
    return;
  }

  // Initialize ORM
  console.log('Connecting to database...');
  const orm = await getOrm();

  try {
    const em = orm.em.fork();
    const seeder = new EchaInventorySeeder(em);

    console.log(`Seeding data from ${format.toUpperCase()} file...`);

    // Progress callback for i6z parsing
    const onProgress = (message: string) => {
      process.stdout.write(`\r${message}    `);
    };

    const result = await seeder.seedFromFile(absolutePath, version, onProgress);

    // Clear progress line
    if (format === 'i6z') {
      console.log('');
    }

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
 * Seeds ECHA SVHC Candidate List data.
 *
 * Supports two modes:
 * 1. Two-file mode (recommended): --entries and --substances files for complete data with groups
 * 2. Single-file mode (legacy): Single file for basic seeding
 */
export async function seedEchaSvhc(
  filePathOrOptions: string | undefined,
  options: SvhcSeedOptions
): Promise<void> {
  const version = options.version || getCurrentVersion();

  // Determine which mode we're in
  const hasBothFiles = options.entries && options.substances;
  const hasSingleFile = filePathOrOptions && !options.entries && !options.substances;

  if (!hasBothFiles && !hasSingleFile) {
    console.error('\nError: You must provide either:');
    console.error('  --entries <file> --substances <file>  (recommended, complete data with groups)');
    console.error('  <file>                                (legacy, single file mode)');
    process.exit(1);
  }

  console.log(`\nECHA SVHC Candidate List Seeder`);
  console.log(`===============================`);

  if (hasBothFiles) {
    const entriesPath = resolveFilePath(options.entries!);
    const substancesPath = resolveFilePath(options.substances!);

    console.log(`Mode: Two-file (complete with groups)`);
    console.log(`Entries file: ${entriesPath}`);
    console.log(`Substances file: ${substancesPath}`);
    console.log(`Version: ${version}`);
    console.log(`Dry run: ${options.dryRun}`);
    console.log('');

    // Check files exist
    checkFileExists(options.entries!);
    checkFileExists(options.substances!);

    if (options.dryRun) {
      console.log('\n[DRY RUN] Would seed ECHA SVHC data from both files');
      console.log('[DRY RUN] No database changes will be made');
      return;
    }

    // Initialize ORM
    console.log('Connecting to database...');
    const orm = await getOrm();

    try {
      const em = orm.em.fork();
      const seeder = new EchaSvhcSeeder(em);

      console.log('Seeding data from both files...');
      const result = await seeder.seedFromBothFiles(entriesPath, substancesPath, version);

      if (result.skipped) {
        console.log(`\n[SKIPPED] ${result.message}`);
      } else {
        console.log(`\n[SUCCESS] ${result.message}`);
        console.log(`  Entries: ${result.entryCount}`);
        console.log(`  Groups: ${result.groupCount}`);
        if (result.stubsCreated > 0) {
          console.log(`  Stubs created: ${result.stubsCreated}`);
        }
        console.log(`  Skipped: ${result.skippedCount}`);
      }
    } finally {
      await closeOrm();
    }
  } else {
    // Legacy single-file mode
    const absolutePath = resolveFilePath(filePathOrOptions!);
    const format = detectFileFormat(filePathOrOptions!);

    console.log(`Mode: Single-file (legacy)`);
    console.log(`File: ${absolutePath}`);
    console.log(`Format: ${format.toUpperCase()}`);
    console.log(`Version: ${version}`);
    console.log(`Dry run: ${options.dryRun}`);
    console.log('');

    // Check file exists
    checkFileExists(filePathOrOptions!);

    if (options.dryRun) {
      console.log('\n[DRY RUN] Would seed ECHA SVHC data');
      console.log('[DRY RUN] No database changes will be made');
      return;
    }

    // Initialize ORM
    console.log('Connecting to database...');
    const orm = await getOrm();

    try {
      const em = orm.em.fork();
      const seeder = new EchaSvhcSeeder(em);

      console.log('Seeding data...');
      const result = await seeder.seedFromFile(absolutePath, version);

      if (result.skipped) {
        console.log(`\n[SKIPPED] ${result.message}`);
      } else {
        console.log(`\n[SUCCESS] ${result.message}`);
        console.log(`  Entries: ${result.entryCount}`);
        console.log(`  Groups: ${result.groupCount}`);
        if (result.stubsCreated > 0) {
          console.log(`  Stubs created: ${result.stubsCreated}`);
        }
        console.log(`  Skipped: ${result.skippedCount}`);
      }
    } finally {
      await closeOrm();
    }
  }
}

export interface AnnexXviiSeedOptions extends SeedCommandOptions {
  entries?: string;
  substances?: string;
}

export interface AnnexXivSeedOptions extends SeedCommandOptions {
  entries?: string;
  substances?: string;
}

export interface SvhcSeedOptions extends SeedCommandOptions {
  entries?: string;
  substances?: string;
}

export interface PopSeedOptions extends SeedCommandOptions {
  entries?: string;
  substances?: string;
}

/**
 * Seeds ECHA REACH Annex XVII restriction data.
 *
 * Supports two modes:
 * 1. Two-file mode (recommended): --entries and --substances files for complete data with EUR-Lex URLs
 * 2. Single-file mode (legacy): Single file for basic seeding
 */
export async function seedEchaAnnexXvii(
  filePathOrOptions: string | undefined,
  options: AnnexXviiSeedOptions
): Promise<void> {
  const version = options.version || getCurrentVersion();

  // Determine which mode we're in
  const hasBothFiles = options.entries && options.substances;
  const hasSingleFile = filePathOrOptions && !options.entries && !options.substances;

  if (!hasBothFiles && !hasSingleFile) {
    console.error('\nError: You must provide either:');
    console.error('  --entries <file> --substances <file>  (recommended, complete data with EUR-Lex URLs)');
    console.error('  <file>                                (legacy, single file mode)');
    process.exit(1);
  }

  console.log(`\nECHA REACH Annex XVII Seeder`);
  console.log(`============================`);

  if (hasBothFiles) {
    const entriesPath = resolveFilePath(options.entries!);
    const substancesPath = resolveFilePath(options.substances!);

    console.log(`Mode: Two-file (complete with EUR-Lex URLs)`);
    console.log(`Entries file: ${entriesPath}`);
    console.log(`Substances file: ${substancesPath}`);
    console.log(`Version: ${version}`);
    console.log(`Dry run: ${options.dryRun}`);
    console.log('');

    // Check files exist
    checkFileExists(options.entries!);
    checkFileExists(options.substances!);

    if (options.dryRun) {
      console.log('\n[DRY RUN] Would seed ECHA Annex XVII data from both files');
      console.log('[DRY RUN] No database changes will be made');
      return;
    }

    // Initialize ORM
    console.log('Connecting to database...');
    const orm = await getOrm();

    try {
      const em = orm.em.fork();
      const seeder = new EchaAnnexXviiSeeder(em);

      console.log('Seeding data from both files...');
      const result = await seeder.seedFromBothFiles(entriesPath, substancesPath, version);

      if (result.skipped) {
        console.log(`\n[SKIPPED] ${result.message}`);
      } else {
        console.log(`\n[SUCCESS] ${result.message}`);
        console.log(`  Entries: ${result.entryCount}`);
        console.log(`  Groups: ${result.groupCount}`);
        if (result.stubsCreated > 0) {
          console.log(`  Stubs created: ${result.stubsCreated}`);
        }
        console.log(`  Skipped: ${result.skippedCount}`);
      }
    } finally {
      await closeOrm();
    }
  } else {
    // Legacy single-file mode
    const absolutePath = resolveFilePath(filePathOrOptions!);
    const format = detectFileFormat(filePathOrOptions!);

    console.log(`Mode: Single-file (legacy)`);
    console.log(`File: ${absolutePath}`);
    console.log(`Format: ${format.toUpperCase()}`);
    console.log(`Version: ${version}`);
    console.log(`Dry run: ${options.dryRun}`);
    console.log('');

    // Check file exists
    checkFileExists(filePathOrOptions!);

    if (options.dryRun) {
      console.log('\n[DRY RUN] Would seed ECHA Annex XVII data');
      console.log('[DRY RUN] No database changes will be made');
      return;
    }

    // Initialize ORM
    console.log('Connecting to database...');
    const orm = await getOrm();

    try {
      const em = orm.em.fork();
      const seeder = new EchaAnnexXviiSeeder(em);

      console.log('Seeding data...');
      const result = await seeder.seedFromFile(absolutePath, version);

      if (result.skipped) {
        console.log(`\n[SKIPPED] ${result.message}`);
      } else {
        console.log(`\n[SUCCESS] ${result.message}`);
        console.log(`  Entries: ${result.entryCount}`);
        console.log(`  Groups: ${result.groupCount}`);
        if (result.stubsCreated > 0) {
          console.log(`  Stubs created: ${result.stubsCreated}`);
        }
        console.log(`  Skipped: ${result.skippedCount}`);
      }
    } finally {
      await closeOrm();
    }
  }
}

/**
 * Seeds ECHA REACH Annex XIV (Authorization List) data.
 *
 * Supports two modes:
 * 1. Two-file mode (recommended): --entries and --substances files for complete data
 * 2. Single-file mode (legacy): Single file for basic seeding
 */
export async function seedEchaAnnexXiv(
  filePathOrOptions: string | undefined,
  options: AnnexXivSeedOptions
): Promise<void> {
  const version = options.version || getCurrentVersion();

  // Determine which mode we're in
  const hasBothFiles = options.entries && options.substances;
  const hasSingleFile = filePathOrOptions && !options.entries && !options.substances;

  if (!hasBothFiles && !hasSingleFile) {
    console.error('\nError: You must provide either:');
    console.error('  --entries <file> --substances <file>  (recommended, complete data)');
    console.error('  <file>                                (legacy, single file mode)');
    process.exit(1);
  }

  console.log(`\nECHA REACH Annex XIV Seeder`);
  console.log(`===========================`);

  if (hasBothFiles) {
    const entriesPath = resolveFilePath(options.entries!);
    const substancesPath = resolveFilePath(options.substances!);

    console.log(`Mode: Two-file (complete data)`);
    console.log(`Entries file: ${entriesPath}`);
    console.log(`Substances file: ${substancesPath}`);
    console.log(`Version: ${version}`);
    console.log(`Dry run: ${options.dryRun}`);
    console.log('');

    // Check files exist
    checkFileExists(options.entries!);
    checkFileExists(options.substances!);

    if (options.dryRun) {
      console.log('\n[DRY RUN] Would seed ECHA Annex XIV data from both files');
      console.log('[DRY RUN] No database changes will be made');
      return;
    }

    // Initialize ORM
    console.log('Connecting to database...');
    const orm = await getOrm();

    try {
      const em = orm.em.fork();
      const seeder = new EchaAnnexXivSeeder(em);

      console.log('Seeding data from both files...');
      const result = await seeder.seedFromBothFiles(entriesPath, substancesPath, version);

      if (result.skipped) {
        console.log(`\n[SKIPPED] ${result.message}`);
      } else {
        console.log(`\n[SUCCESS] ${result.message}`);
        console.log(`  Entries: ${result.entryCount}`);
        console.log(`  Groups: ${result.groupCount}`);
        if (result.stubsCreated > 0) {
          console.log(`  Stubs created: ${result.stubsCreated}`);
        }
        console.log(`  Skipped: ${result.skippedCount}`);
      }
    } finally {
      await closeOrm();
    }
  } else {
    // Legacy single-file mode
    const absolutePath = resolveFilePath(filePathOrOptions!);
    const format = detectFileFormat(filePathOrOptions!);

    console.log(`Mode: Single-file (legacy)`);
    console.log(`File: ${absolutePath}`);
    console.log(`Format: ${format.toUpperCase()}`);
    console.log(`Version: ${version}`);
    console.log(`Dry run: ${options.dryRun}`);
    console.log('');

    // Check file exists
    checkFileExists(filePathOrOptions!);

    if (options.dryRun) {
      console.log('\n[DRY RUN] Would seed ECHA Annex XIV data');
      console.log('[DRY RUN] No database changes will be made');
      return;
    }

    // Initialize ORM
    console.log('Connecting to database...');
    const orm = await getOrm();

    try {
      const em = orm.em.fork();
      const seeder = new EchaAnnexXivSeeder(em);

      console.log('Seeding data...');
      const result = await seeder.seedFromFile(absolutePath, version);

      if (result.skipped) {
        console.log(`\n[SKIPPED] ${result.message}`);
      } else {
        console.log(`\n[SUCCESS] ${result.message}`);
        console.log(`  Entries: ${result.entryCount}`);
        console.log(`  Groups: ${result.groupCount}`);
        if (result.stubsCreated > 0) {
          console.log(`  Stubs created: ${result.stubsCreated}`);
        }
        console.log(`  Skipped: ${result.skippedCount}`);
      }
    } finally {
      await closeOrm();
    }
  }
}

/**
 * Seeds ECHA POP Regulation (Persistent Organic Pollutants) data.
 *
 * Supports two modes:
 * 1. Two-file mode (recommended): --entries and --substances files for complete data with groups
 * 2. Single-file mode (legacy): Single file for basic seeding
 */
export async function seedEchaPop(
  filePathOrOptions: string | undefined,
  options: PopSeedOptions
): Promise<void> {
  const version = options.version || getCurrentVersion();

  // Determine which mode we're in
  const hasBothFiles = options.entries && options.substances;
  const hasSingleFile = filePathOrOptions && !options.entries && !options.substances;

  if (!hasBothFiles && !hasSingleFile) {
    console.error('\nError: You must provide either:');
    console.error('  --entries <file> --substances <file>  (recommended, complete data with groups)');
    console.error('  <file>                                (legacy, single file mode)');
    process.exit(1);
  }

  console.log(`\nECHA POP Regulation Seeder`);
  console.log(`==========================`);

  if (hasBothFiles) {
    const entriesPath = resolveFilePath(options.entries!);
    const substancesPath = resolveFilePath(options.substances!);

    console.log(`Mode: Two-file (complete with groups)`);
    console.log(`Entries file: ${entriesPath}`);
    console.log(`Substances file: ${substancesPath}`);
    console.log(`Version: ${version}`);
    console.log(`Dry run: ${options.dryRun}`);
    console.log('');

    // Check files exist
    checkFileExists(options.entries!);
    checkFileExists(options.substances!);

    if (options.dryRun) {
      console.log('\n[DRY RUN] Would seed ECHA POP data from both files');
      console.log('[DRY RUN] No database changes will be made');
      return;
    }

    // Initialize ORM
    console.log('Connecting to database...');
    const orm = await getOrm();

    try {
      const em = orm.em.fork();
      const seeder = new EchaPopSeeder(em);

      console.log('Seeding data from both files...');
      const result = await seeder.seedFromBothFiles(entriesPath, substancesPath, version);

      if (result.skipped) {
        console.log(`\n[SKIPPED] ${result.message}`);
      } else {
        console.log(`\n[SUCCESS] ${result.message}`);
        console.log(`  Entries: ${result.entryCount}`);
        console.log(`  Groups: ${result.groupCount}`);
        if (result.stubsCreated > 0) {
          console.log(`  Stubs created: ${result.stubsCreated}`);
        }
        console.log(`  Skipped: ${result.skippedCount}`);
      }
    } finally {
      await closeOrm();
    }
  } else {
    // Legacy single-file mode
    const absolutePath = resolveFilePath(filePathOrOptions!);
    const format = detectFileFormat(filePathOrOptions!);

    console.log(`Mode: Single-file (legacy)`);
    console.log(`File: ${absolutePath}`);
    console.log(`Format: ${format.toUpperCase()}`);
    console.log(`Version: ${version}`);
    console.log(`Dry run: ${options.dryRun}`);
    console.log('');

    // Check file exists
    checkFileExists(filePathOrOptions!);

    if (options.dryRun) {
      console.log('\n[DRY RUN] Would seed ECHA POP Regulation data');
      console.log('[DRY RUN] No database changes will be made');
      return;
    }

    // Initialize ORM
    console.log('Connecting to database...');
    const orm = await getOrm();

    try {
      const em = orm.em.fork();
      const seeder = new EchaPopSeeder(em);

      console.log('Seeding data...');
      const result = await seeder.seedFromFile(absolutePath, version);

      if (result.skipped) {
        console.log(`\n[SKIPPED] ${result.message}`);
      } else {
        console.log(`\n[SUCCESS] ${result.message}`);
        console.log(`  Entries: ${result.entryCount}`);
        console.log(`  Groups: ${result.groupCount}`);
        if (result.stubsCreated > 0) {
          console.log(`  Stubs created: ${result.stubsCreated}`);
        }
        console.log(`  Skipped: ${result.skippedCount}`);
      }
    } finally {
      await closeOrm();
    }
  }
}

/**
 * Seeds RoHS Directive Annex II restricted substances.
 * No CSV file needed - substances are hardcoded.
 */
export async function seedRohs(options: SeedCommandOptions): Promise<void> {
  const version = options.version || getCurrentVersion();

  console.log(`\nRoHS Directive Seeder`);
  console.log(`=====================`);
  console.log(`Version: ${version}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  if (options.dryRun) {
    console.log('[DRY RUN] Would seed RoHS Directive Annex II substances');
    console.log('[DRY RUN] No database changes will be made');
    console.log('[DRY RUN] 9 substances will be seeded (hardcoded list)');
    return;
  }

  // Initialize ORM
  console.log('Connecting to database...');
  const orm = await getOrm();

  try {
    const em = orm.em.fork();
    const seeder = new RohsSeeder(em);

    console.log('Seeding data...');
    const result = await seeder.seed(version);

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
  console.log('  gsr seed echa-annex-xvii <csv-file>');
  console.log('  gsr seed echa-annex-xiv <csv-file>');
  console.log('  gsr seed echa-pop <csv-file>');
}

/**
 * Seeds CLP hazard reference data (hazard classes and H-statements).
 * This must be run before seeding harmonised classifications.
 */
export async function seedClpReference(options: SeedCommandOptions): Promise<void> {
  console.log(`\nCLP Hazard Reference Seeder`);
  console.log(`===========================`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  if (options.dryRun) {
    console.log('[DRY RUN] Would seed CLP hazard classes and H-statements');
    console.log('[DRY RUN] No database changes will be made');
    return;
  }

  // Initialize ORM
  console.log('Connecting to database...');
  const orm = await getOrm();

  try {
    const seeder = new HazardReferenceSeeder(orm);

    console.log('Seeding hazard reference data...');
    const result = await seeder.seedAll();

    console.log('');
    console.log('Hazard Classes:');
    console.log('===============');
    if (result.classes.skipped) {
      console.log(`[SKIPPED] ${result.classes.message}`);
    } else {
      console.log(`[SUCCESS] Seeded ${result.classes.count} hazard classes`);
    }

    console.log('');
    console.log('Hazard Statements:');
    console.log('==================');
    if (result.statements.skipped) {
      console.log(`[SKIPPED] ${result.statements.message}`);
    } else {
      console.log(`[SUCCESS] Seeded ${result.statements.count} hazard statements`);
    }
  } finally {
    await closeOrm();
  }
}

/**
 * Seeds CLP harmonised classifications from ECHA XLSX file.
 * Requires CLP reference data to be seeded first.
 */
export async function seedClpHarmonised(filePath: string, options: ClpSeedOptions): Promise<void> {
  // Validate file path
  if (!filePath || filePath.trim() === '') {
    throw new Error('File path is required');
  }

  const version = options.version || 'ATP21';
  const absolutePath = resolveFilePath(filePath);

  console.log(`\nCLP Harmonised Classification Seeder`);
  console.log(`=====================================`);
  console.log(`File: ${absolutePath}`);
  console.log(`Version: ${version}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  // Check file exists
  checkFileExists(filePath);

  if (options.dryRun) {
    console.log('[DRY RUN] Would seed CLP harmonised classifications');
    console.log('[DRY RUN] No database changes will be made');
    return;
  }

  // Initialize ORM
  console.log('Connecting to database...');
  const orm = await getOrm();

  try {
    const seeder = new ClpHarmonisedSeeder(orm);

    console.log('Seeding harmonised classifications...');
    const result = await seeder.seedFromXlsx(absolutePath, version);

    console.log('');
    if (result.skipped) {
      console.log(`[SKIPPED] ${result.message}`);
      console.log('');
      console.log("Run 'pnpm gsr seed clp-reference' first to seed hazard classes and statements.");
    } else if (result.seeded) {
      console.log(`[SUCCESS] ${result.message}`);
      console.log('');
      console.log('Statistics:');
      console.log(`  Version: ${result.version}`);
      console.log(`  Total rows: ${result.totalRows}`);
      console.log(`  Substances matched: ${result.substancesMatched}`);
      console.log(`  Stubs created: ${result.stubsCreated}`);
      console.log(`  Skipped (no valid CAS): ${result.skippedEntries}`);
      console.log(`  Classifications created: ${result.classificationsCreated}`);
      console.log(`  Classifications skipped: ${result.classificationsSkipped}`);

      // Info about stubs created
      if (result.stubsCreated > 0) {
        console.log('');
        console.log(`[INFO] ${result.stubsCreated} stub substances created for CAS numbers not in EC Inventory.`);
        console.log('Run "pnpm gsr enrich pubchem" to enrich these stubs with additional data.');
      }

      // Info about skipped entries
      if (result.skippedEntries > 0) {
        console.log('');
        console.log(`[INFO] ${result.skippedEntries} entries skipped (group entries or invalid CAS).`);
      }
    } else {
      console.log(`[INFO] ${result.message}`);
    }
  } finally {
    await closeOrm();
  }
}

/**
 * Seeds EPA CompTox substances from a CSV file.
 *
 * This is the foundation seeder for the GSR - loads 1.2M+ substances from
 * the EPA Computational Toxicology dashboard dataset.
 *
 * Performance considerations:
 * - Uses streaming CSV parsing for memory efficiency (664MB file)
 * - Raw SQL bulk inserts with batches of 5,000+ records
 * - Progress reporting every batch
 */
export async function seedComptox(filePath: string, options: ComptoxSeedOptions): Promise<void> {
  // Validate file path
  if (!filePath || filePath.trim() === '') {
    throw new Error('File path is required');
  }

  const absolutePath = resolveFilePath(filePath);

  console.log(`\nEPA CompTox Foundation Seeder`);
  console.log(`=============================`);
  console.log(`File: ${absolutePath}`);
  console.log(`Batch size: ${options.batchSize.toLocaleString()}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  // Check file exists
  checkFileExists(filePath);

  if (options.dryRun) {
    console.log('[DRY RUN] Counting records in CSV file...');
    console.log('');
  }

  // Initialize ORM
  if (!options.dryRun) {
    console.log('Connecting to database...');
  }
  const orm = await getOrm();

  try {
    const em = orm.em.fork();
    const seeder = new ComptoxSeeder(em);

    console.log('Processing CompTox CSV file...');
    console.log('This may take several minutes for the full 1.2M+ substance dataset.');
    console.log('');

    const startTime = Date.now();
    const result = await seeder.seedFromFile(
      absolutePath,
      options.dryRun,
      options.batchSize,
      (message) => process.stdout.write(`\r${message}    `)
    );

    // Clear progress line
    console.log('');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    if (options.dryRun) {
      console.log(`[DRY RUN] Results:`);
    } else {
      console.log(`[SUCCESS] Seeding complete`);
    }
    console.log(`  Processed: ${result.processed.toLocaleString()}`);
    console.log(`  Created: ${result.created.toLocaleString()}`);
    console.log(`  Skipped (no CAS): ${result.skipped.toLocaleString()}`);
    console.log(`  Errors: ${result.errors.toLocaleString()}`);
    console.log(`  Time: ${elapsed}s`);

    if (result.errors > 0) {
      console.log('');
      console.log('[WARNING] Some records had errors. Check logs for details.');
    }
  } finally {
    await closeOrm();
  }
}

export interface CosingSeedOptions extends SeedCommandOptions {
  // Additional options can be added here
}

/**
 * Seeds CosIng cosmetics substances from XLS files.
 *
 * Reads CosIng Annex II-VI XLS files from the specified directory,
 * uses Identity Ladder to match substances to Golden Records,
 * and creates SubstanceCosing persona records.
 *
 * Expected files:
 * - COSING_Annex_II_v2.xls (Prohibited substances)
 * - COSING_Annex_III_v2.xls (Restricted substances)
 * - COSING_Annex_IV_v2.xls (Permitted colorants)
 * - COSING_Annex_V_v2.xls (Permitted preservatives)
 * - COSING_Annex_VI_v2.xls (Permitted UV filters)
 */
export async function seedCosing(directory: string, options: CosingSeedOptions): Promise<void> {
  // Validate directory path
  if (!directory || directory.trim() === '') {
    throw new Error('Directory path is required');
  }

  const absolutePath = resolveFilePath(directory);

  console.log(`\nCosIng Cosmetics Seeder`);
  console.log(`=======================`);
  console.log(`Directory: ${absolutePath}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  // Check directory exists
  checkFileExists(directory);

  if (options.dryRun) {
    console.log('[DRY RUN] Scanning for CosIng Annex files...');
    console.log('');
  }

  // Initialize ORM
  if (!options.dryRun) {
    console.log('Connecting to database...');
  }
  const orm = await getOrm();

  try {
    const em = orm.em.fork();
    const seeder = new CosingSeeder(em);

    console.log('Processing CosIng Annex files...');
    console.log('');

    const startTime = Date.now();
    const result = await seeder.seedFromDirectory(
      absolutePath,
      options.dryRun,
      (message) => console.log(message)
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    if (options.dryRun) {
      console.log(`[DRY RUN] Results:`);
    } else {
      console.log(`[SUCCESS] Seeding complete`);
    }
    console.log(`  Processed: ${result.processed.toLocaleString()}`);
    console.log(`  Attached to Golden Records: ${result.attached.toLocaleString()}`);
    console.log(`  Unresolved (no match): ${result.unresolved.toLocaleString()}`);
    console.log(`  Errors: ${result.errors.toLocaleString()}`);
    console.log(`  Time: ${elapsed}s`);

    if (result.unresolved > 0) {
      console.log('');
      console.log(`[INFO] ${result.unresolved} substances could not be matched to Golden Records.`);
      console.log('These have been added to the unresolved_substance queue for manual review.');
    }

    if (result.errors > 0) {
      console.log('');
      console.log('[WARNING] Some records had errors. Check logs for details.');
    }
  } finally {
    await closeOrm();
  }
}

export interface EfsaSeedOptions extends SeedCommandOptions {
  // Additional options can be added here
}

/**
 * Seeds EFSA food additive substances from ENumbers.txt file.
 *
 * Reads ENumbers.txt from the specified directory,
 * uses Identity Ladder to match substances to Golden Records,
 * and creates SubstanceEfsa persona records.
 *
 * Expected file: ENumbers.txt (tab-separated: E-number, IsGroup, Name)
 */
export async function seedEfsa(directory: string, options: EfsaSeedOptions): Promise<void> {
  // Validate directory path
  if (!directory || directory.trim() === '') {
    throw new Error('Directory path is required');
  }

  const absolutePath = resolveFilePath(directory);

  console.log(`\nEFSA Food Additives Seeder`);
  console.log(`==========================`);
  console.log(`Directory: ${absolutePath}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  // Check directory exists
  checkFileExists(directory);

  if (options.dryRun) {
    console.log('[DRY RUN] Scanning for ENumbers.txt...');
    console.log('');
  }

  // Initialize ORM
  if (!options.dryRun) {
    console.log('Connecting to database...');
  }
  const orm = await getOrm();

  try {
    const em = orm.em.fork();
    const seeder = new EfsaSeeder(em);

    console.log('Processing ENumbers.txt...');
    console.log('');

    const startTime = Date.now();
    const result = await seeder.seedFromDirectory(
      absolutePath,
      options.dryRun,
      (message) => console.log(message)
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    if (options.dryRun) {
      console.log(`[DRY RUN] Results:`);
    } else {
      console.log(`[SUCCESS] Seeding complete`);
    }
    console.log(`  Processed: ${result.processed.toLocaleString()}`);
    console.log(`  Attached to Golden Records: ${result.attached.toLocaleString()}`);
    console.log(`  Unresolved (no match): ${result.unresolved.toLocaleString()}`);
    console.log(`  Errors: ${result.errors.toLocaleString()}`);
    console.log(`  Time: ${elapsed}s`);

    if (result.unresolved > 0) {
      console.log('');
      console.log(`[INFO] ${result.unresolved} substances could not be matched to Golden Records.`);
      console.log('These have been added to the unresolved_substance queue for manual review.');
    }

    if (result.errors > 0) {
      console.log('');
      console.log('[WARNING] Some records had errors. Check logs for details.');
    }
  } finally {
    await closeOrm();
  }
}

export interface TscaSeedOptions extends SeedCommandOptions {
  batchSize: number;
}

/**
 * Seeds EPA TSCA US inventory substances from a CSV file.
 *
 * Uses the TSCA Inventory CSV export from the EPA website.
 * Approximately 70,000+ substances in the full inventory.
 *
 * Performance considerations:
 * - Uses streaming CSV parsing for memory efficiency
 * - Batch processing with progress reporting
 */
export async function seedTsca(filePath: string, options: TscaSeedOptions): Promise<void> {
  // Validate file path
  if (!filePath || filePath.trim() === '') {
    throw new Error('File path is required');
  }

  const absolutePath = resolveFilePath(filePath);

  console.log(`\nEPA TSCA US Inventory Seeder`);
  console.log(`============================`);
  console.log(`File: ${absolutePath}`);
  console.log(`Batch size: ${options.batchSize.toLocaleString()}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  // Check file exists
  checkFileExists(filePath);

  if (options.dryRun) {
    console.log('[DRY RUN] Counting records in CSV file...');
    console.log('');
  }

  // Initialize ORM
  if (!options.dryRun) {
    console.log('Connecting to database...');
  }
  const orm = await getOrm();

  try {
    const em = orm.em.fork();
    const seeder = new TscaSeeder(em);

    console.log('Processing TSCA CSV file...');
    console.log('This may take a few minutes for the full 70k+ substance dataset.');
    console.log('');

    const startTime = Date.now();
    const result = await seeder.seedFromFile(
      absolutePath,
      options.dryRun,
      options.batchSize,
      (message) => process.stdout.write(`\r${message}    `)
    );

    // Clear progress line
    console.log('');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    if (options.dryRun) {
      console.log(`[DRY RUN] Results:`);
    } else {
      console.log(`[SUCCESS] Seeding complete`);
    }
    console.log(`  Processed: ${result.processed.toLocaleString()}`);
    console.log(`  Attached to Golden Records: ${result.attached.toLocaleString()}`);
    console.log(`  Unresolved (no match): ${result.unresolved.toLocaleString()}`);
    console.log(`  Errors: ${result.errors.toLocaleString()}`);
    console.log(`  Time: ${elapsed}s`);

    if (result.unresolved > 0) {
      console.log('');
      console.log(`[INFO] ${result.unresolved} substances could not be matched to Golden Records.`);
      console.log('These have been added to the unresolved_substance queue for manual review.');
    }

    if (result.errors > 0) {
      console.log('');
      console.log('[WARNING] Some records had errors. Check logs for details.');
    }
  } finally {
    await closeOrm();
  }
}
