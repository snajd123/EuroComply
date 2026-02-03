// packages/gsr/src/seeders/comptox.seeder.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { ComptoxSeeder, buildBulkInsertSql, seedComptox } from './comptox.seeder.js';
import { Substance } from '@eurocomply/database';
import type { ParsedComptoxSubstance } from '../parsers/comptox.parser.js';

const dbAvailable = await isDatabaseAvailable();

// Create a temp directory for test files
const testDir = join(tmpdir(), 'comptox-seeder-test');

describe('ComptoxSeeder', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testCsvPath: string;

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

    // Clean up test files
    if (existsSync(testCsvPath)) {
      unlinkSync(testCsvPath);
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearGsrTestDb(orm.em);
      em = orm.em.fork();
    }
  });

  // Sample CSV content matching CompTox DSSToxCCDdump format
  const sampleCsv = `DTXSID,PREFERRED_NAME,CASRN,INCHIKEY,IUPAC_NAME,SMILES,MOLECULAR_FORMULA,AVERAGE_MASS
DTXSID7020182,Benzene,71-43-2,UHOVQNZJYSORNB-UHFFFAOYSA-N,benzene,C1=CC=CC=C1,C6H6,78.1134
DTXSID3020443,Cadmium,7440-43-9,BDOSMKKIYDBER-UHFFFAOYSA-N,cadmium,[Cd],Cd,112.411
DTXSID1020560,Lead dioxide,1309-60-0,HWSSEYVMGDIFMH-UHFFFAOYSA-N,dioxolead,O=[Pb]=O,O2Pb,239.1988`;

  // CSV with some records missing CAS numbers
  const csvWithMissingCas = `DTXSID,PREFERRED_NAME,CASRN,INCHIKEY,IUPAC_NAME,SMILES,MOLECULAR_FORMULA,AVERAGE_MASS
DTXSID7020182,Benzene,71-43-2,UHOVQNZJYSORNB-UHFFFAOYSA-N,benzene,C1=CC=CC=C1,C6H6,78.1134
DTXSID9999999,Unknown Compound,,,unknown compound,,C10H20,156.0
DTXSID3020443,Cadmium,7440-43-9,BDOSMKKIYDBER-UHFFFAOYSA-N,cadmium,[Cd],Cd,112.411`;

  // CSV with BOM (UTF-8 byte order mark)
  const csvWithBom = '\ufeff' + sampleCsv;

  describe('buildBulkInsertSql', () => {
    it('should_return_empty_sql_when_no_substances', () => {
      const { sql, params } = buildBulkInsertSql([]);

      expect(sql).toBe('');
      expect(params).toHaveLength(0);
    });

    it('should_build_valid_sql_when_single_substance', () => {
      const substances: ParsedComptoxSubstance[] = [
        {
          dtxsid: 'DTXSID7020182',
          canonicalName: 'Benzene',
          casNumber: '71-43-2',
          inchiKey: 'UHOVQNZJYSORNB-UHFFFAOYSA-N',
          iupacName: 'benzene',
          smiles: 'C1=CC=CC=C1',
          molecularFormula: 'C6H6',
          molecularWeight: 78.1134,
          qcLevel: null,
        },
      ];

      const { sql, params } = buildBulkInsertSql(substances);

      expect(sql).toContain('INSERT INTO substance');
      expect(sql).toContain('ON CONFLICT (cas_number)');
      expect(sql).toContain('DO UPDATE SET');
      expect(params).toContain('71-43-2');
      expect(params).toContain('Benzene');
      expect(params).toContain('DTXSID7020182');
    });

    it('should_build_sql_with_multiple_value_sets_when_batch', () => {
      const substances: ParsedComptoxSubstance[] = [
        {
          dtxsid: 'DTXSID7020182',
          canonicalName: 'Benzene',
          casNumber: '71-43-2',
          inchiKey: null,
          iupacName: null,
          smiles: null,
          molecularFormula: null,
          molecularWeight: null,
          qcLevel: null,
        },
        {
          dtxsid: 'DTXSID3020443',
          canonicalName: 'Cadmium',
          casNumber: '7440-43-9',
          inchiKey: null,
          iupacName: null,
          smiles: null,
          molecularFormula: null,
          molecularWeight: null,
          qcLevel: null,
        },
      ];

      const { sql, params } = buildBulkInsertSql(substances);

      // Should have multiple value placeholders
      const valueMatches = sql.match(/\(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, NOW\(\), NOW\(\)\)/g);
      expect(valueMatches).toHaveLength(2);

      // Should have parameters for both substances (11 params each)
      expect(params).toHaveLength(22);
    });

    it('should_handle_null_values_in_substances', () => {
      const substances: ParsedComptoxSubstance[] = [
        {
          dtxsid: 'DTXSID9999999',
          canonicalName: 'Unknown',
          casNumber: '123-45-6',
          inchiKey: null,
          iupacName: null,
          smiles: null,
          molecularFormula: null,
          molecularWeight: null,
          qcLevel: null,
        },
      ];

      const { sql, params } = buildBulkInsertSql(substances);

      expect(sql).toContain('INSERT INTO substance');
      // Null values should be in params
      expect(params).toContain(null);
    });
  });

  describe('seedFromFile', () => {
    beforeEach(() => {
      // Create test CSV file
      testCsvPath = join(testDir, `test-comptox-${Date.now()}.csv`);
      writeFileSync(testCsvPath, sampleCsv, 'utf-8');
    });

    afterEach(() => {
      // Clean up test file
      if (existsSync(testCsvPath)) {
        unlinkSync(testCsvPath);
      }
    });

    it.skipIf(!dbAvailable)('should_seed_substances_from_csv_when_valid_file', async () => {
      const seeder = new ComptoxSeeder(em);
      const result = await seeder.seedFromFile(testCsvPath, false, 100);

      expect(result.processed).toBe(3);
      expect(result.created).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);

      // Verify substances were created
      const substances = await em.find(Substance, {});
      expect(substances).toHaveLength(3);

      // Verify benzene
      const benzene = substances.find((s) => s.casNumber === '71-43-2');
      expect(benzene).toBeTruthy();
      expect(benzene!.dtxsid).toBe('DTXSID7020182');
      expect(benzene!.primaryName).toBe('Benzene');
      expect(benzene!.inchiKey).toBe('UHOVQNZJYSORNB-UHFFFAOYSA-N');
      expect(benzene!.molecularWeight).toBeCloseTo(78.1134, 4);
    });

    it.skipIf(!dbAvailable)('should_skip_records_without_cas_when_seeding', async () => {
      // Create CSV with missing CAS
      writeFileSync(testCsvPath, csvWithMissingCas, 'utf-8');

      const seeder = new ComptoxSeeder(em);
      const result = await seeder.seedFromFile(testCsvPath, false, 100);

      expect(result.processed).toBe(3);
      expect(result.created).toBe(2); // Only 2 with valid CAS
      expect(result.skipped).toBe(1); // 1 without CAS

      // Verify only substances with CAS were created
      const substances = await em.find(Substance, {});
      expect(substances).toHaveLength(2);
    });

    it.skipIf(!dbAvailable)('should_handle_utf8_bom_when_present', async () => {
      // Create CSV with BOM
      writeFileSync(testCsvPath, csvWithBom, 'utf-8');

      const seeder = new ComptoxSeeder(em);
      const result = await seeder.seedFromFile(testCsvPath, false, 100);

      expect(result.processed).toBe(3);
      expect(result.created).toBe(3);
    });

    it.skipIf(!dbAvailable)('should_track_registry_source_when_seeding', async () => {
      const seeder = new ComptoxSeeder(em);
      await seeder.seedFromFile(testCsvPath, false, 100);

      // Verify registry source was created
      const source = await em.findOne(RegistrySource, { name: RegistrySourceName.EPA_COMPTOX });
      expect(source).toBeTruthy();
      expect(source!.recordCount).toBe(3);
      expect(source!.sourceUrl).toContain('comptox.epa.gov');
    });

    it.skipIf(!dbAvailable)('should_upsert_on_cas_conflict_when_reseeding', async () => {
      const seeder = new ComptoxSeeder(em);

      // First seed
      await seeder.seedFromFile(testCsvPath, false, 100);

      // Verify initial state
      let benzene = await em.findOne(Substance, { casNumber: '71-43-2' });
      expect(benzene!.primaryName).toBe('Benzene');

      // Create updated CSV with different name for benzene
      const updatedCsv = `DTXSID,PREFERRED_NAME,CASRN,INCHIKEY,IUPAC_NAME,SMILES,MOLECULAR_FORMULA,AVERAGE_MASS
DTXSID7020182,Benzene (updated),71-43-2,UHOVQNZJYSORNB-UHFFFAOYSA-N,benzene,C1=CC=CC=C1,C6H6,78.1134`;
      writeFileSync(testCsvPath, updatedCsv, 'utf-8');

      // Second seed
      await seeder.seedFromFile(testCsvPath, false, 100);

      // Verify upsert happened
      em.clear();
      const substances = await em.find(Substance, {});
      expect(substances).toHaveLength(3); // Still 3, not duplicated

      benzene = await em.findOne(Substance, { casNumber: '71-43-2' });
      expect(benzene!.primaryName).toBe('Benzene (updated)');
    });

    it.skipIf(!dbAvailable)('should_report_progress_when_callback_provided', async () => {
      const progressMessages: string[] = [];
      const seeder = new ComptoxSeeder(em);

      await seeder.seedFromFile(testCsvPath, false, 1, (msg) => progressMessages.push(msg));

      // Should have received progress messages (one per batch with batch size 1)
      expect(progressMessages.length).toBeGreaterThan(0);
      // Last message should indicate completion
      expect(progressMessages[progressMessages.length - 1]).toContain('Completed');
    });
  });

  describe('dry run mode', () => {
    beforeEach(() => {
      testCsvPath = join(testDir, `test-comptox-dryrun-${Date.now()}.csv`);
      writeFileSync(testCsvPath, sampleCsv, 'utf-8');
    });

    afterEach(() => {
      if (existsSync(testCsvPath)) {
        unlinkSync(testCsvPath);
      }
    });

    it.skipIf(!dbAvailable)('should_not_write_to_database_when_dry_run', async () => {
      const seeder = new ComptoxSeeder(em);
      const result = await seeder.seedFromFile(testCsvPath, true, 100);

      expect(result.processed).toBe(3);
      expect(result.created).toBe(3);

      // Verify nothing was written to database
      const substances = await em.find(Substance, {});
      expect(substances).toHaveLength(0);

      const sources = await em.find(RegistrySource, {});
      expect(sources).toHaveLength(0);
    });
  });

  describe('seedComptox function', () => {
    beforeEach(() => {
      testCsvPath = join(testDir, `test-comptox-func-${Date.now()}.csv`);
      writeFileSync(testCsvPath, sampleCsv, 'utf-8');
    });

    afterEach(() => {
      if (existsSync(testCsvPath)) {
        unlinkSync(testCsvPath);
      }
    });

    it.skipIf(!dbAvailable)('should_seed_using_function_interface', async () => {
      const result = await seedComptox({
        file: testCsvPath,
        dryRun: false,
        batchSize: 100,
        em,
      });

      expect(result.processed).toBe(3);
      expect(result.created).toBe(3);
    });
  });
});
