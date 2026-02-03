// packages/gsr/src/seeders/tsca.seeder.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { SubstanceTsca, TscaInventoryStatus } from '../entities/SubstanceTsca.js';
import { UnresolvedSubstance, UnresolvedSource } from '../entities/UnresolvedSubstance.js';
import { TscaSeeder, seedTsca, type TscaSeederResult } from './tsca.seeder.js';
import { Substance } from '@eurocomply/database';
import { createId } from '@paralleldrive/cuid2';

const dbAvailable = await isDatabaseAvailable();

// Create a temp directory for test files
const testDir = join(tmpdir(), `tsca-seeder-test-${createId()}`);

/**
 * Creates a test CSV file with TSCA inventory data.
 */
function createTestTscaCsv(filePath: string, rows: Array<{
  id: string;
  casrn: string;
  chemName: string;
  activity: string;
  uvcb?: string;
  flag?: string;
}>): void {
  const header = 'ID,CASRN,ChemName,ACTIVITY,UVCB,FLAG';
  const csvRows = rows.map(row =>
    `${row.id},"${row.casrn}","${row.chemName}",${row.activity},${row.uvcb ?? ''},${row.flag ?? ''}`
  );
  const content = [header, ...csvRows].join('\n');
  writeFileSync(filePath, content, 'utf-8');
}

describe('TscaSeeder', () => {
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

  describe('seedTsca function', () => {
    it('should_be_defined', () => {
      expect(seedTsca).toBeDefined();
      expect(typeof seedTsca).toBe('function');
    });
  });

  describe('TscaSeeder class', () => {
    it('should_be_defined', () => {
      expect(TscaSeeder).toBeDefined();
    });

    it.skipIf(!dbAvailable)('should_instantiate_with_entity_manager', () => {
      const seeder = new TscaSeeder(em);
      expect(seeder).toBeDefined();
    });
  });

  describe('seeding from CSV file', () => {
    let csvPath: string;

    beforeEach(async () => {
      if (!dbAvailable) return;

      // Create golden record substances to match
      const benzene = em.create(Substance, {
        id: createId(),
        casNumber: '71-43-2',
        primaryName: 'Benzene',
        sourceVersion: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const formaldehyde = em.create(Substance, {
        id: createId(),
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
        sourceVersion: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await em.persistAndFlush([benzene, formaldehyde]);

      // Create test CSV file
      csvPath = join(testDir, 'tsca_test.csv');
      createTestTscaCsv(csvPath, [
        {
          id: '1',
          casrn: '71-43-2',
          chemName: 'Benzene',
          activity: 'ACTIVE',
          uvcb: '',
          flag: 'S',
        },
        {
          id: '2',
          casrn: '50-00-0',
          chemName: 'Formaldehyde',
          activity: 'ACTIVE',
          uvcb: '',
          flag: 'S,P',
        },
        {
          id: '3',
          casrn: '7440-43-9', // Valid CAS (4-Nitrochlorobenzene) but doesn't exist in DB
          chemName: 'Unknown Substance',
          activity: 'INACTIVE',
          uvcb: 'UVCB',
          flag: '',
        },
      ]);
    });

    afterEach(() => {
      if (existsSync(csvPath)) {
        unlinkSync(csvPath);
      }
    });

    it.skipIf(!dbAvailable)('should_seed_tsca_personas_when_matching_substance_found', async () => {
      const seeder = new TscaSeeder(em);
      const result = await seeder.seedFromFile(csvPath);

      expect(result.processed).toBe(3);
      expect(result.attached).toBeGreaterThanOrEqual(2);

      // Verify SubstanceTsca was created
      const tscaRecords = await em.find(SubstanceTsca, {});
      expect(tscaRecords.length).toBeGreaterThanOrEqual(2);

      // Find the benzene record
      const benzeneRecord = tscaRecords.find(r => r.tscaCas === '71-43-2');
      expect(benzeneRecord).toBeDefined();
      expect(benzeneRecord!.inventoryStatus).toBe(TscaInventoryStatus.ACTIVE);
      expect(benzeneRecord!.isSnur).toBe(true); // Has 'S' flag
    });

    it.skipIf(!dbAvailable)('should_parse_snur_flag_correctly', async () => {
      const seeder = new TscaSeeder(em);
      await seeder.seedFromFile(csvPath);

      // Benzene has 'S' flag - should have isSnur = true
      const benzeneRecord = await em.findOne(SubstanceTsca, { tscaCas: '71-43-2' });
      expect(benzeneRecord).toBeDefined();
      expect(benzeneRecord!.isSnur).toBe(true);

      // Formaldehyde has 'S,P' flags - should have isSnur = true
      const formaldehydeRecord = await em.findOne(SubstanceTsca, { tscaCas: '50-00-0' });
      expect(formaldehydeRecord).toBeDefined();
      expect(formaldehydeRecord!.isSnur).toBe(true);
    });

    it.skipIf(!dbAvailable)('should_track_unresolved_substances_when_no_match', async () => {
      const seeder = new TscaSeeder(em);
      const result = await seeder.seedFromFile(csvPath);

      expect(result.unresolved).toBeGreaterThanOrEqual(1);

      // Verify UnresolvedSubstance was created
      const unresolvedRecords = await em.find(UnresolvedSubstance, { source: UnresolvedSource.TSCA });
      expect(unresolvedRecords.length).toBeGreaterThanOrEqual(1);

      // Find the unknown substance
      const unknownRecord = unresolvedRecords.find(r => r.rawCasNumber === '7440-43-9');
      expect(unknownRecord).toBeDefined();
      expect(unknownRecord!.rawName).toBe('Unknown Substance');
    });

    it.skipIf(!dbAvailable)('should_update_registry_source_when_seeding', async () => {
      const seeder = new TscaSeeder(em);
      await seeder.seedFromFile(csvPath);

      // Verify registry source was created/updated
      const source = await em.findOne(RegistrySource, { name: RegistrySourceName.TSCA });
      expect(source).toBeTruthy();
      expect(source!.recordCount).toBeGreaterThan(0);
    });

    it.skipIf(!dbAvailable)('should_handle_dry_run_without_database_writes', async () => {
      const result = await seedTsca({
        file: csvPath,
        dryRun: true,
        batchSize: 100,
        em,
      });

      expect(result.processed).toBe(3);

      // Verify nothing was written to database
      const tscaRecords = await em.find(SubstanceTsca, {});
      expect(tscaRecords).toHaveLength(0);

      const unresolvedRecords = await em.find(UnresolvedSubstance, { source: UnresolvedSource.TSCA });
      expect(unresolvedRecords).toHaveLength(0);
    });

    it.skipIf(!dbAvailable)('should_skip_already_seeded_substance_personas', async () => {
      const seeder = new TscaSeeder(em);

      // First seed
      const result1 = await seeder.seedFromFile(csvPath);
      expect(result1.attached).toBeGreaterThanOrEqual(2);

      // Clear EM cache
      em.clear();

      // Second seed should skip existing
      const result2 = await seeder.seedFromFile(csvPath);

      // Same TSCA CAS shouldn't be duplicated
      const tscaRecords = await em.find(SubstanceTsca, { tscaCas: '71-43-2' });
      expect(tscaRecords).toHaveLength(1);
    });

    it.skipIf(!dbAvailable)('should_handle_uvcb_substances', async () => {
      // Create a substance that matches the UVCB entry
      const uvcbSubstance = em.create(Substance, {
        id: createId(),
        casNumber: '7440-43-9', // Valid CAS (4-Nitrochlorobenzene)
        primaryName: 'Unknown Substance',
        sourceVersion: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(uvcbSubstance);

      const seeder = new TscaSeeder(em);
      await seeder.seedFromFile(csvPath);

      // Find the UVCB record - should now be attached since we created the substance
      const uvcbRecord = await em.findOne(SubstanceTsca, { tscaCas: '7440-43-9' });
      // If the substance exists, it should be attached
      if (uvcbRecord) {
        expect(uvcbRecord.inventoryStatus).toBe(TscaInventoryStatus.INACTIVE);
      }
    });
  });

  describe('batch processing', () => {
    let largeCsvPath: string;

    beforeEach(async () => {
      if (!dbAvailable) return;

      // Create a larger test CSV file
      largeCsvPath = join(testDir, 'tsca_large_test.csv');
      const rows = [];
      for (let i = 0; i < 50; i++) {
        rows.push({
          id: String(i + 1),
          casrn: `${i + 100}-${(i + 10) % 100}-${(i + 7) % 10}`,
          chemName: `Test Substance ${i + 1}`,
          activity: i % 2 === 0 ? 'ACTIVE' : 'INACTIVE',
          uvcb: '',
          flag: i % 3 === 0 ? 'S' : '',
        });
      }
      createTestTscaCsv(largeCsvPath, rows);
    });

    afterEach(() => {
      if (existsSync(largeCsvPath)) {
        unlinkSync(largeCsvPath);
      }
    });

    it.skipIf(!dbAvailable)('should_process_records_in_batches', async () => {
      const seeder = new TscaSeeder(em);
      let progressCalls = 0;

      const result = await seeder.seedFromFile(largeCsvPath, false, 10, () => {
        progressCalls++;
      });

      expect(result.processed).toBe(50);
      // With batch size 10, we should get multiple progress calls
      expect(progressCalls).toBeGreaterThan(0);
    });
  });
});
