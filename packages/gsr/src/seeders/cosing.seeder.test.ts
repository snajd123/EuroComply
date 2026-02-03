// packages/gsr/src/seeders/cosing.seeder.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import XLSX from 'xlsx';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { SubstanceCosing, CosmeticRestrictionType } from '../entities/SubstanceCosing.js';
import { UnresolvedSubstance, UnresolvedSource } from '../entities/UnresolvedSubstance.js';
import { CosingSeeder, seedCosing, type CosingSeederResult } from './cosing.seeder.js';
import { Substance } from '@eurocomply/database';
import { createId } from '@paralleldrive/cuid2';

const dbAvailable = await isDatabaseAvailable();

// Create a temp directory for test files
const testDir = join(tmpdir(), `cosing-seeder-test-${createId()}`);

/**
 * Creates a test XLS file with CosIng Annex II data.
 */
function createTestAnnexIIXls(filePath: string, rows: Array<{
  refNumber: string;
  chemName: string;
  cas: string;
  ec: string;
  cmr: string;
  sccs: string;
  ingredients: string;
}>): void {
  const worksheet = XLSX.utils.json_to_sheet(rows.map(row => ({
    'Reference Number': row.refNumber,
    'Chemical name / INN': row.chemName,
    'CAS Number': row.cas,
    'EC Number': row.ec,
    'Regulation': '',
    'CMR': row.cmr,
    'SCCS opinions': row.sccs,
    'Identified INGREDIENTS': row.ingredients,
  })));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, filePath);
}

/**
 * Creates a test XLS file with CosIng Annex III data.
 */
function createTestAnnexIIIXls(filePath: string, rows: Array<{
  refNumber: string;
  chemName: string;
  glossaryName: string;
  cas: string;
  ec: string;
  productType: string;
  maxConc: string;
  warnings: string;
}>): void {
  const worksheet = XLSX.utils.json_to_sheet(rows.map(row => ({
    'Reference Number': row.refNumber,
    'Chemical name / INN': row.chemName,
    'Name of Common Ingredients Glossary': row.glossaryName,
    'CAS Number': row.cas,
    'EC Number': row.ec,
    'Product Type, body parts': row.productType,
    'Maximum concentration in ready for use preparation': row.maxConc,
    'Wording of conditions of use and warnings': row.warnings,
  })));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, filePath);
}

describe('CosingSeeder', () => {
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

  describe('seedCosing function', () => {
    it('should_be_defined', () => {
      expect(seedCosing).toBeDefined();
      expect(typeof seedCosing).toBe('function');
    });
  });

  describe('CosingSeeder class', () => {
    it('should_be_defined', () => {
      expect(CosingSeeder).toBeDefined();
    });

    it.skipIf(!dbAvailable)('should_instantiate_with_entity_manager', () => {
      const seeder = new CosingSeeder(em);
      expect(seeder).toBeDefined();
    });
  });

  describe('seeding from XLS files', () => {
    let annexIIPath: string;

    beforeEach(async () => {
      if (!dbAvailable) return;

      // Create a golden record substance to match
      const benzophenone = em.create(Substance, {
        id: createId(),
        casNumber: '119-61-9',
        primaryName: 'Benzophenone',
        sourceVersion: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(benzophenone);

      // Create test XLS files
      annexIIPath = join(testDir, 'COSING_Annex_II_v2.xls');
      createTestAnnexIIXls(annexIIPath, [
        {
          refNumber: '1',
          chemName: 'Benzophenone',
          cas: '119-61-9',
          ec: '204-337-6',
          cmr: 'CMR',
          sccs: 'SCCS/1234/18',
          ingredients: 'BENZOPHENONE',
        },
        {
          refNumber: '2',
          chemName: 'Unknown Substance',
          cas: '123-45-5', // Valid CAS checksum but doesn't exist in DB
          ec: '999-999-9',
          cmr: '',
          sccs: '',
          ingredients: 'UNKNOWN',
        },
      ]);
    });

    afterEach(() => {
      if (existsSync(annexIIPath)) {
        unlinkSync(annexIIPath);
      }
    });

    it.skipIf(!dbAvailable)('should_seed_cosing_personas_when_matching_substance_found', async () => {
      const seeder = new CosingSeeder(em);
      const result = await seeder.seedFromDirectory(testDir);

      expect(result.processed).toBeGreaterThan(0);
      expect(result.attached).toBeGreaterThanOrEqual(1);

      // Verify SubstanceCosing was created
      const cosingRecords = await em.find(SubstanceCosing, {});
      expect(cosingRecords.length).toBeGreaterThanOrEqual(1);

      // Find the benzophenone record
      const benzophenoneRecord = cosingRecords.find(r => r.cosingRef === 'II-1');
      expect(benzophenoneRecord).toBeDefined();
      expect(benzophenoneRecord!.inciName).toBe('BENZOPHENONE');
      expect(benzophenoneRecord!.restrictionType).toBe(CosmeticRestrictionType.ANNEX_II);
    });

    it.skipIf(!dbAvailable)('should_track_unresolved_substances_when_no_match', async () => {
      const seeder = new CosingSeeder(em);
      const result = await seeder.seedFromDirectory(testDir);

      expect(result.unresolved).toBeGreaterThanOrEqual(1);

      // Verify UnresolvedSubstance was created
      const unresolvedRecords = await em.find(UnresolvedSubstance, { source: UnresolvedSource.COSING });
      expect(unresolvedRecords.length).toBeGreaterThanOrEqual(1);

      // Find the unknown substance
      const unknownRecord = unresolvedRecords.find(r => r.rawCasNumber === '123-45-5');
      expect(unknownRecord).toBeDefined();
    });

    it.skipIf(!dbAvailable)('should_update_registry_source_when_seeding', async () => {
      const seeder = new CosingSeeder(em);
      await seeder.seedFromDirectory(testDir);

      // Verify registry source was created/updated
      const source = await em.findOne(RegistrySource, { name: RegistrySourceName.COSING });
      expect(source).toBeTruthy();
      expect(source!.recordCount).toBeGreaterThan(0);
    });

    it.skipIf(!dbAvailable)('should_handle_dry_run_without_database_writes', async () => {
      const result = await seedCosing({
        directory: testDir,
        dryRun: true,
        em,
      });

      expect(result.processed).toBeGreaterThan(0);

      // Verify nothing was written to database
      const cosingRecords = await em.find(SubstanceCosing, {});
      expect(cosingRecords).toHaveLength(0);

      const unresolvedRecords = await em.find(UnresolvedSubstance, { source: UnresolvedSource.COSING });
      expect(unresolvedRecords).toHaveLength(0);
    });

    it.skipIf(!dbAvailable)('should_skip_already_seeded_substance_personas', async () => {
      const seeder = new CosingSeeder(em);

      // First seed
      const result1 = await seeder.seedFromDirectory(testDir);
      expect(result1.attached).toBeGreaterThanOrEqual(1);

      // Clear EM cache
      em.clear();

      // Second seed should skip existing
      const result2 = await seeder.seedFromDirectory(testDir);

      // Same CosIng ref shouldn't be duplicated
      const cosingRecords = await em.find(SubstanceCosing, { cosingRef: 'II-1' });
      expect(cosingRecords).toHaveLength(1);
    });
  });

  describe('seeding Annex III with concentration', () => {
    let annexIIIPath: string;

    beforeEach(async () => {
      if (!dbAvailable) return;

      // Create a golden record substance
      const salicylicAcid = em.create(Substance, {
        id: createId(),
        casNumber: '69-72-7',
        primaryName: 'Salicylic acid',
        sourceVersion: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(salicylicAcid);

      // Create test XLS file
      annexIIIPath = join(testDir, 'COSING_Annex_III_v2.xls');
      createTestAnnexIIIXls(annexIIIPath, [
        {
          refNumber: '98',
          chemName: 'Salicylic acid',
          glossaryName: 'SALICYLIC ACID',
          cas: '69-72-7',
          ec: '200-712-3',
          productType: 'Rinse-off hair products',
          maxConc: '3%',
          warnings: 'Not to be used for children under 3 years of age',
        },
      ]);
    });

    afterEach(() => {
      if (existsSync(annexIIIPath)) {
        unlinkSync(annexIIIPath);
      }
    });

    it.skipIf(!dbAvailable)('should_parse_concentration_limits_from_annex_iii', async () => {
      const seeder = new CosingSeeder(em);
      const result = await seeder.seedFromDirectory(testDir);

      expect(result.attached).toBeGreaterThanOrEqual(1);

      // Verify SubstanceCosing with concentration was created
      const salicylicRecord = await em.findOne(SubstanceCosing, { cosingRef: 'III-98' });
      expect(salicylicRecord).toBeDefined();
      expect(salicylicRecord!.maxConcentration).toBe(3);
      expect(salicylicRecord!.concentrationUnit).toBe('%');
      expect(salicylicRecord!.restrictionType).toBe(CosmeticRestrictionType.ANNEX_III);
      expect(salicylicRecord!.restrictionText).toContain('children under 3');
    });
  });
});
