// packages/gsr/src/seeders/efsa.seeder.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { SubstanceEfsa } from '../entities/SubstanceEfsa.js';
import { UnresolvedSubstance, UnresolvedSource } from '../entities/UnresolvedSubstance.js';
import { EfsaSeeder, seedEfsa, type EfsaSeederResult } from './efsa.seeder.js';
import { Substance } from '@eurocomply/database';
import { createId } from '@paralleldrive/cuid2';

const dbAvailable = await isDatabaseAvailable();

// Create a temp directory for test files
const testDir = join(tmpdir(), `efsa-seeder-test-${createId()}`);

/**
 * Creates a test ENumbers.txt file with tab-separated values.
 * Format: E-number\tIsGroup\tName
 */
function createTestENumbersFile(filePath: string, rows: Array<{
  eNumber: string;
  isGroup: string;
  name: string;
}>): void {
  const content = rows.map(row => `${row.eNumber}\t${row.isGroup}\t${row.name}`).join('\n');
  writeFileSync(filePath, content, 'utf-8');
}

describe('EfsaSeeder', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    // Ensure test directory exists
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    if (dbAvailable) {
      orm = await setupGsrTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownGsrTestDb();
    }

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearGsrTestDb(orm.em);
      em = orm.em.fork();
    }
  });

  describe('seedEfsa function', () => {
    it('should_be_defined', () => {
      expect(seedEfsa).toBeDefined();
      expect(typeof seedEfsa).toBe('function');
    });
  });

  describe('EfsaSeeder class', () => {
    it('should_be_defined', () => {
      expect(EfsaSeeder).toBeDefined();
    });

    it.skipIf(!dbAvailable)('should_instantiate_with_entity_manager', () => {
      const seeder = new EfsaSeeder(em);
      expect(seeder).toBeDefined();
    });
  });

  describe('seeding from ENumbers.txt', () => {
    let eNumbersPath: string;

    beforeEach(async () => {
      if (!dbAvailable) return;

      // Create a golden record substance to match (Sodium benzoate)
      const sodiumBenzoate = em.create(Substance, {
        id: createId(),
        casNumber: '532-32-1',
        primaryName: 'Sodium benzoate',
        sourceVersion: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(sodiumBenzoate);

      // Create test ENumbers.txt file
      eNumbersPath = join(testDir, 'ENumbers.txt');
      createTestENumbersFile(eNumbersPath, [
        {
          eNumber: 'E 211',
          isGroup: 'No',
          name: 'Sodium benzoate',
        },
        {
          eNumber: 'E 210-213',
          isGroup: 'Yes',
          name: 'Benzoates',
        },
        {
          eNumber: 'E 999',
          isGroup: 'No',
          name: 'Unknown additive',
        },
      ]);
    });

    afterEach(() => {
      if (existsSync(eNumbersPath)) {
        unlinkSync(eNumbersPath);
      }
    });

    it.skipIf(!dbAvailable)('should_seed_efsa_personas_when_matching_substance_found', async () => {
      const seeder = new EfsaSeeder(em);
      const result = await seeder.seedFromDirectory(testDir);

      expect(result.processed).toBeGreaterThan(0);
      expect(result.attached).toBeGreaterThanOrEqual(1);

      // Verify SubstanceEfsa was created
      const efsaRecords = await em.find(SubstanceEfsa, {});
      expect(efsaRecords.length).toBeGreaterThanOrEqual(1);

      // Find the sodium benzoate record
      const sodiumBenzoateRecord = efsaRecords.find(r => r.eNumber === 'E211');
      expect(sodiumBenzoateRecord).toBeDefined();
      expect(sodiumBenzoateRecord!.functionalClass).toBe('FOOD_ADDITIVE');
    });

    it.skipIf(!dbAvailable)('should_skip_groups_when_seeding', async () => {
      const seeder = new EfsaSeeder(em);
      const result = await seeder.seedFromDirectory(testDir);

      // Groups should be skipped, not counted as processed
      // We have 3 lines: 1 matching substance, 1 group (skipped), 1 unresolved
      expect(result.processed).toBe(2); // Only non-group entries
      expect(result.attached).toBe(1); // Sodium benzoate
      expect(result.unresolved).toBe(1); // Unknown additive
    });

    it.skipIf(!dbAvailable)('should_track_unresolved_substances_when_no_match', async () => {
      const seeder = new EfsaSeeder(em);
      const result = await seeder.seedFromDirectory(testDir);

      expect(result.unresolved).toBeGreaterThanOrEqual(1);

      // Verify UnresolvedSubstance was created
      const unresolvedRecords = await em.find(UnresolvedSubstance, { source: UnresolvedSource.EFSA });
      expect(unresolvedRecords.length).toBeGreaterThanOrEqual(1);

      // Find the unknown additive
      const unknownRecord = unresolvedRecords.find(r => r.rawName === 'Unknown additive');
      expect(unknownRecord).toBeDefined();
    });

    it.skipIf(!dbAvailable)('should_update_registry_source_when_seeding', async () => {
      const seeder = new EfsaSeeder(em);
      await seeder.seedFromDirectory(testDir);

      // Verify registry source was created/updated
      const source = await em.findOne(RegistrySource, { name: RegistrySourceName.EFSA });
      expect(source).toBeTruthy();
      expect(source!.recordCount).toBeGreaterThan(0);
    });

    it.skipIf(!dbAvailable)('should_handle_dry_run_without_database_writes', async () => {
      const result = await seedEfsa({
        directory: testDir,
        dryRun: true,
        em,
      });

      expect(result.processed).toBeGreaterThan(0);

      // Verify nothing was written to database
      const efsaRecords = await em.find(SubstanceEfsa, {});
      expect(efsaRecords).toHaveLength(0);

      const unresolvedRecords = await em.find(UnresolvedSubstance, { source: UnresolvedSource.EFSA });
      expect(unresolvedRecords).toHaveLength(0);
    });

    it.skipIf(!dbAvailable)('should_skip_already_seeded_substance_personas', async () => {
      const seeder = new EfsaSeeder(em);

      // First seed
      const result1 = await seeder.seedFromDirectory(testDir);
      expect(result1.attached).toBeGreaterThanOrEqual(1);

      // Clear EM cache
      em.clear();

      // Second seed should skip existing
      const result2 = await seeder.seedFromDirectory(testDir);

      // Same E-number shouldn't be duplicated
      const efsaRecords = await em.find(SubstanceEfsa, { eNumber: 'E211' });
      expect(efsaRecords).toHaveLength(1);
    });
  });

  describe('E-number matching via Identity Ladder', () => {
    let eNumbersPath: string;

    beforeEach(async () => {
      if (!dbAvailable) return;

      // Create a golden record substance (Citric acid)
      const citricAcid = em.create(Substance, {
        id: createId(),
        casNumber: '77-92-9',
        primaryName: 'Citric acid',
        sourceVersion: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(citricAcid);

      // Create SubstanceEfsa for citric acid to test E-number ladder step
      const existingEfsa = em.create(SubstanceEfsa, {
        id: createId(),
        substance: citricAcid,
        eNumber: 'E330',
        functionalClass: 'ACIDITY_REGULATOR',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(existingEfsa);

      // Create another substance that doesn't have an existing EFSA persona
      const malicAcid = em.create(Substance, {
        id: createId(),
        casNumber: '617-48-1',  // DL-Malic acid
        primaryName: 'Malic acid',  // Will match by name
        sourceVersion: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(malicAcid);

      eNumbersPath = join(testDir, 'ENumbers.txt');
      createTestENumbersFile(eNumbersPath, [
        {
          eNumber: 'E 296',
          isGroup: 'No',
          name: 'Malic acid',
        },
      ]);
    });

    afterEach(() => {
      if (existsSync(eNumbersPath)) {
        unlinkSync(eNumbersPath);
      }
    });

    it.skipIf(!dbAvailable)('should_match_substance_by_name_using_identity_ladder', async () => {
      const seeder = new EfsaSeeder(em);
      const result = await seeder.seedFromDirectory(testDir);

      expect(result.attached).toBe(1);

      // Verify SubstanceEfsa was created for malic acid
      const malicRecord = await em.findOne(SubstanceEfsa, { eNumber: 'E296' });
      expect(malicRecord).toBeDefined();
      expect(malicRecord!.functionalClass).toBe('FOOD_ADDITIVE');
    });
  });

  describe('error handling', () => {
    it.skipIf(!dbAvailable)('should_throw_error_for_nonexistent_directory', async () => {
      const seeder = new EfsaSeeder(em);

      await expect(seeder.seedFromDirectory('/nonexistent/path')).rejects.toThrow('Directory not found');
    });

    it.skipIf(!dbAvailable)('should_handle_missing_ENumbers_file_gracefully', async () => {
      // Create an empty test directory
      const emptyDir = join(testDir, 'empty');
      if (!existsSync(emptyDir)) {
        mkdirSync(emptyDir, { recursive: true });
      }

      const seeder = new EfsaSeeder(em);
      const result = await seeder.seedFromDirectory(emptyDir);

      // Should complete without error but with zero records
      expect(result.processed).toBe(0);
      expect(result.attached).toBe(0);
      expect(result.unresolved).toBe(0);
      expect(result.errors).toBe(0);

      // Cleanup
      rmSync(emptyDir, { recursive: true, force: true });
    });
  });
});
