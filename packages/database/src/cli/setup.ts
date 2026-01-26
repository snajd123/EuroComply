#!/usr/bin/env node
/**
 * Database setup CLI - runs migrations and seeds reference data.
 * Usage: node --env-file=.env dist/cli/setup.js
 */
import { initOrm, closeOrm } from '../orm.js';
import { SubstancesSeeder } from '../seeders/substances.seeder.js';

async function main() {
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

    // Seed reference data
    console.log('3. Seeding reference data...');

    const em = orm.em.fork();

    // Seed substances
    const substancesSeeder = new SubstancesSeeder(em);
    const substancesResult = await substancesSeeder.seed();
    if (substancesResult.skipped) {
      console.log(`   ✓ Substances: already seeded (${substancesResult.substanceCount} found)`);
    } else {
      console.log(`   ✓ Substances: ${substancesResult.substanceCount} substances, ${substancesResult.aliasCount} aliases`);
    }

    // TODO: Add other seeders here as they're created
    // - UnitsSeeder
    // - ClassificationsSeeder

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
