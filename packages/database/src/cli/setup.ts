#!/usr/bin/env node
/**
 * Database setup CLI - runs migrations and seeds reference data.
 * Usage: node --env-file=.env packages/database/dist/cli/setup.js
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..', '..');

async function main() {
  // Change to package directory BEFORE loading ORM so migration paths resolve correctly
  process.chdir(PACKAGE_ROOT);

  // Dynamic imports after chdir so relative paths resolve correctly
  const { initOrm, closeOrm } = await import('../orm.js');

  console.log('🚀 EuroComply Database Setup');
  console.log('============================\n');

  console.log('1. Initializing database connection...');
  const orm = await initOrm();

  try {
    // Run migrations
    console.log('2. Running migrations...');
    const migrator = orm.getMigrator();
    const pending = await migrator.getPendingMigrations();

    if (pending.length > 0) {
      console.log(`   Found ${pending.length} pending migration(s)`);
      await migrator.up();
      console.log('   ✓ Migrations complete');
    } else {
      console.log('   ✓ No pending migrations');
    }

    // Note: Substance seeding is now handled by the GSR package.
    // Use the GSR CLI (pnpm --filter gsr seed) to seed substances
    // from ECHA EC Inventory and SVHC Candidate List.
    console.log('3. Reference data seeding');
    console.log('   Note: Use GSR package for substance seeding:');
    console.log('   pnpm --filter gsr seed:echa-inventory');
    console.log('   pnpm --filter gsr seed:echa-svhc');

    console.log('\n✅ Database setup complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Setup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await closeOrm();
  }
}

main();
