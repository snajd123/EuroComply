#!/usr/bin/env node
/**
 * Seed check CLI - displays seeded datasets and their versions.
 * Usage: node --env-file=.env packages/database/dist/cli/seed-check.js
 *        node --env-file=.env packages/database/dist/cli/seed-check.js --name <name>
 */
import { initOrm, closeOrm } from '../orm.js';
import { SeedService } from '../services/seed.service.js';
import { SeedVersion } from '../entities/SeedVersion.js';

async function main() {
  const args = process.argv.slice(2);
  const nameIndex = args.indexOf('--name');
  const name = nameIndex !== -1 ? args[nameIndex + 1] : undefined;

  try {
    const orm = await initOrm();
    const em = orm.em.fork();
    const seedService = new SeedService(em);

    if (name) {
      // Check specific seed
      const version = await seedService.getSeededVersion(name);
      if (version) {
        console.log(`${name}:`);
        console.log(`  Version:   ${version.version}`);
        console.log(`  Checksum:  ${version.sourceChecksum || '(none)'}`);
        console.log(`  Records:   ${version.recordCount}`);
        console.log(`  Seeded at: ${version.seededAt.toISOString()}`);
      } else {
        console.log(`${name}: NOT SEEDED`);
      }
    } else {
      // List all seeds
      const allSeeds = await em.find(SeedVersion, {}, { orderBy: { name: 'ASC' } });

      if (allSeeds.length === 0) {
        console.log('No seed data found.');
      } else {
        console.log('Seeded datasets:');
        console.log('-'.repeat(80));
        console.log(
          'Name'.padEnd(25) +
          'Version'.padEnd(15) +
          'Records'.padEnd(10) +
          'Checksum'
        );
        console.log('-'.repeat(80));
        for (const seed of allSeeds) {
          const checksumDisplay = seed.sourceChecksum
            ? seed.sourceChecksum.slice(0, 20) + '...'
            : '-';
          console.log(
            seed.name.padEnd(25) +
            seed.version.padEnd(15) +
            String(seed.recordCount).padEnd(10) +
            checksumDisplay
          );
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await closeOrm();
  }
}

main();
