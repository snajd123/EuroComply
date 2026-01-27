#!/usr/bin/env node
import { initOrm, closeOrm } from '../orm.js';
import { CategoriesSeeder } from '../seeders/categories.seeder.js';
import { SeedService } from '../services/seed.service.js';

async function main() {
  console.log('Initializing database connection...');
  const orm = await initOrm();

  try {
    const em = orm.em.fork();
    const seedService = new SeedService(em);
    const seeder = new CategoriesSeeder(em, seedService);

    console.log('Running categories seeder...');
    const result = await seeder.seed();

    console.log(`✓ ${result.message}`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding categories:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await closeOrm();
  }
}

main();
