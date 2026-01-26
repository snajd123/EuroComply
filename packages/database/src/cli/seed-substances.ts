#!/usr/bin/env node
import { initOrm, closeOrm } from '../orm.js';
import { SubstancesSeeder } from '../seeders/substances.seeder.js';

async function main() {
  console.log('Initializing database connection...');
  const orm = await initOrm();

  try {
    const em = orm.em.fork();
    const seeder = new SubstancesSeeder(em);

    console.log('Running substances seeder...');
    const result = await seeder.seed();

    if (result.skipped) {
      console.log(`✓ ${result.message}`);
    } else {
      console.log(`✓ ${result.message}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error seeding substances:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await closeOrm();
  }
}

main();
