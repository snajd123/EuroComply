#!/usr/bin/env node
import { initOrm, closeOrm } from '../orm.js';
import { ManifestLoader } from '../seed/ManifestLoader.js';
import { SeedService } from '../services/seed.service.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { MigrationManifest } from '../seed/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..', '..');
const SEED_NAME = 'eu-regulations';

async function main() {
  console.log('Initializing database connection...');
  const orm = await initOrm();

  try {
    const em = orm.em.fork();
    const seedService = new SeedService(em);
    const loader = new ManifestLoader(em);

    // Load manifest file
    const manifestPath = join(PACKAGE_ROOT, 'src', 'seed', 'manifests', 'eu-regulations-2026.json');
    console.log(`Loading manifest from ${manifestPath}...`);

    const raw = readFileSync(manifestPath, 'utf-8');
    const manifest: MigrationManifest = JSON.parse(raw);

    // Compute checksum for change detection
    const checksum = seedService.computeChecksum(raw);
    const version = manifest.version;

    // Check if seeding needed
    const needsSeeding = await seedService.needsSeeding(SEED_NAME, version, checksum);
    if (!needsSeeding) {
      console.log(`Regulations already seeded (${version}), skipping.`);
      process.exit(0);
    }

    console.log(`Loading ${manifest.regulations.length} regulations...`);
    const result = await loader.loadManifest(manifest);

    // Record seeding
    const totalRecords = result.regulationsCreated + result.requirementsCreated + result.mappingsCreated;
    await seedService.recordSeeding(SEED_NAME, version, totalRecords, checksum);

    console.log('');
    console.log('Results:');
    console.log(`  Regulations created: ${result.regulationsCreated}`);
    console.log(`  Regulations skipped: ${result.regulationsSkipped}`);
    console.log(`  Requirements created: ${result.requirementsCreated}`);
    console.log(`  Category mappings:   ${result.mappingsCreated}`);
    console.log('');
    console.log(`✓ Seeded regulations (${version})`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding regulations:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await closeOrm();
  }
}

main();
