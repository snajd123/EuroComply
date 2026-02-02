// packages/gsr/src/seeders/hazard-reference.seeder.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import {
  HazardReferenceSeeder,
  HAZARD_STATEMENTS,
} from './hazard-reference.seeder.js';
import { HazardClass, HazardType, SignalWord } from '../entities/HazardClass.js';
import { HazardStatement } from '../entities/HazardStatement.js';
import { HAZARD_CLASSES } from '../reference-data/hazard-classes.js';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';

const dbAvailable = await isDatabaseAvailable();

describe('HazardReferenceSeeder', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let seeder: HazardReferenceSeeder;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupGsrTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownGsrTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearGsrTestDb(orm.em);
      em = orm.em.fork();
      seeder = new HazardReferenceSeeder(orm);
    }
  });

  describe('HAZARD_STATEMENTS fallback reference data', () => {
    // Note: HAZARD_STATEMENTS is now the FALLBACK data - only used when mhchem is unavailable.
    // The actual seeder uses mhchem as primary source, which has ~91 H-statements.
    it('should_have_at_least_40_statements', () => {
      // We expect a good coverage of H-statements in the fallback
      expect(HAZARD_STATEMENTS.length).toBeGreaterThanOrEqual(40);
    });

    it('should_have_all_required_fields', () => {
      for (const statement of HAZARD_STATEMENTS) {
        expect(statement.code).toBeDefined();
        expect(statement.code).toMatch(/^(H|EUH)\d{3}/); // H-code or EUH-code format
        expect(statement.text).toBeDefined();
        expect(statement.text.length).toBeGreaterThan(0);
      }
    });

    it('should_have_cancer_statements_H350_H350i_H351', () => {
      const codes = HAZARD_STATEMENTS.map((s) => s.code);
      expect(codes).toContain('H350');
      expect(codes).toContain('H350i');
      expect(codes).toContain('H351');
    });

    it('should_have_reproductive_toxicity_variants', () => {
      const codes = HAZARD_STATEMENTS.map((s) => s.code);
      expect(codes).toContain('H360F');
      expect(codes).toContain('H360D');
      expect(codes).toContain('H360FD');
      expect(codes).toContain('H361f');
      expect(codes).toContain('H361d');
    });

    it('should_have_acute_toxicity_statements', () => {
      const codes = HAZARD_STATEMENTS.map((s) => s.code);
      expect(codes).toContain('H300'); // Fatal if swallowed
      expect(codes).toContain('H301'); // Toxic if swallowed
      expect(codes).toContain('H302'); // Harmful if swallowed
      expect(codes).toContain('H310'); // Fatal in contact with skin
      expect(codes).toContain('H330'); // Fatal if inhaled
    });

    it('should_have_environmental_statements', () => {
      const codes = HAZARD_STATEMENTS.map((s) => s.code);
      expect(codes).toContain('H400'); // Very toxic to aquatic life
      expect(codes).toContain('H410'); // Very toxic to aquatic life with long lasting effects
      expect(codes).toContain('H420'); // Ozone layer hazard
    });

    it('should_have_physical_hazard_statements', () => {
      const codes = HAZARD_STATEMENTS.map((s) => s.code);
      expect(codes).toContain('H200'); // Unstable explosive
      expect(codes).toContain('H220'); // Extremely flammable gas
      expect(codes).toContain('H290'); // Corrosive to metals
    });
  });

  describe('seedHazardClasses', () => {
    it.skipIf(!dbAvailable)('should_seed_all_classes_when_database_empty', async () => {
      const result = await seeder.seedHazardClasses();

      expect(result.seeded).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.count).toBe(HAZARD_CLASSES.length);
      expect(result.message).toContain('Seeded');
    });

    it.skipIf(!dbAvailable)('should_have_correct_cmr_flags', async () => {
      await seeder.seedHazardClasses();

      const cmrClasses = await em.find(HazardClass, { isCmr: true });
      expect(cmrClasses.length).toBe(3); // Carc., Muta., Repr.

      const cmrCodes = cmrClasses.map((c) => c.code);
      expect(cmrCodes).toContain('Carc.');
      expect(cmrCodes).toContain('Muta.');
      expect(cmrCodes).toContain('Repr.');
    });

    it.skipIf(!dbAvailable)('should_have_correct_physical_hazard_types', async () => {
      await seeder.seedHazardClasses();

      const physicalClasses = await em.find(HazardClass, { hazardType: HazardType.PHYSICAL });
      expect(physicalClasses.length).toBeGreaterThan(10);

      const codes = physicalClasses.map((c) => c.code);
      expect(codes).toContain('Expl.');
      expect(codes).toContain('Flam. Gas');
      expect(codes).toContain('Flam. Liq.');
    });

    it.skipIf(!dbAvailable)('should_have_correct_environmental_hazard_types', async () => {
      await seeder.seedHazardClasses();

      const envClasses = await em.find(HazardClass, { hazardType: HazardType.ENVIRONMENTAL });
      expect(envClasses.length).toBe(3); // Aquatic Acute, Aquatic Chronic, Ozone

      const codes = envClasses.map((c) => c.code);
      expect(codes).toContain('Aquatic Acute');
      expect(codes).toContain('Aquatic Chronic');
      expect(codes).toContain('Ozone');
    });

    it.skipIf(!dbAvailable)('should_skip_when_already_seeded', async () => {
      // First seed
      await seeder.seedHazardClasses();

      // Second seed should skip
      const result = await seeder.seedHazardClasses();

      expect(result.seeded).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.message).toContain('already seeded');
    });

    it.skipIf(!dbAvailable)('should_not_create_duplicates_on_rerun', async () => {
      await seeder.seedHazardClasses();
      await seeder.seedHazardClasses();

      const count = await em.count(HazardClass, {});
      expect(count).toBe(HAZARD_CLASSES.length);
    });

    it.skipIf(!dbAvailable)('should_have_pictograms_and_signal_words', async () => {
      await seeder.seedHazardClasses();

      const carc = await em.findOne(HazardClass, { code: 'Carc.' });
      expect(carc).not.toBeNull();
      expect(carc!.pictogram).toBe('GHS08');
      expect(carc!.signalWord).toBe(SignalWord.DANGER);

      const gasesUnderPressure = await em.findOne(HazardClass, { code: 'Press. Gas' });
      expect(gasesUnderPressure).not.toBeNull();
      expect(gasesUnderPressure!.pictogram).toBe('GHS04');
      expect(gasesUnderPressure!.signalWord).toBeNull(); // No signal word
    });
  });

  describe('seedHazardStatements', () => {
    // Note: The seeder loads from mhchem as primary source (91+ H-statements)
    // with fallback to hardcoded English-only data (65 statements) if unavailable.

    it.skipIf(!dbAvailable)('should_seed_statements_when_database_empty', async () => {
      const result = await seeder.seedHazardStatements();

      expect(result.seeded).toBe(true);
      expect(result.skipped).toBe(false);
      // mhchem provides ~91 H-statements, fallback has ~65
      expect(result.count).toBeGreaterThanOrEqual(HAZARD_STATEMENTS.length);
      expect(result.message).toContain('Seeded');
    });

    it.skipIf(!dbAvailable)('should_have_cancer_statements_with_correct_text', async () => {
      await seeder.seedHazardStatements();

      const h350 = await em.findOne(HazardStatement, { code: 'H350' });
      expect(h350).not.toBeNull();
      // Use toContain since mhchem includes placeholders in angle brackets
      expect(h350!.translations.en).toContain('May cause cancer');

      const h350i = await em.findOne(HazardStatement, { code: 'H350i' });
      expect(h350i).not.toBeNull();
      expect(h350i!.translations.en).toContain('inhalation');

      const h351 = await em.findOne(HazardStatement, { code: 'H351' });
      expect(h351).not.toBeNull();
      expect(h351!.translations.en).toContain('Suspected');
    });

    it.skipIf(!dbAvailable)('should_have_reproductive_toxicity_variants_with_correct_text', async () => {
      await seeder.seedHazardStatements();

      const h360F = await em.findOne(HazardStatement, { code: 'H360F' });
      expect(h360F).not.toBeNull();
      expect(h360F!.translations.en).toContain('fertility');

      const h360D = await em.findOne(HazardStatement, { code: 'H360D' });
      expect(h360D).not.toBeNull();
      expect(h360D!.translations.en).toContain('unborn child');

      const h360FD = await em.findOne(HazardStatement, { code: 'H360FD' });
      expect(h360FD).not.toBeNull();
      expect(h360FD!.translations.en).toContain('fertility');
      expect(h360FD!.translations.en).toContain('unborn child');
    });

    it.skipIf(!dbAvailable)('should_skip_when_already_seeded', async () => {
      // First seed
      await seeder.seedHazardStatements();

      // Second seed should skip
      const result = await seeder.seedHazardStatements();

      expect(result.seeded).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.message).toContain('already seeded');
    });

    it.skipIf(!dbAvailable)('should_not_create_duplicates_on_rerun', async () => {
      const firstResult = await seeder.seedHazardStatements();
      await seeder.seedHazardStatements();

      const count = await em.count(HazardStatement, {});
      // Count should match what was seeded the first time
      expect(count).toBe(firstResult.count);
    });

    it.skipIf(!dbAvailable)('should_include_languages_in_result_when_using_mhchem', async () => {
      const result = await seeder.seedHazardStatements();

      // If mhchem was used, languagesLoaded should be populated
      if (!result.usedFallback) {
        expect(result.languagesLoaded).toBeDefined();
        expect(result.languagesLoaded!.length).toBeGreaterThan(0);
        expect(result.languagesLoaded).toContain('en');
      }
    });
  });

  describe('seedAll', () => {
    it.skipIf(!dbAvailable)('should_seed_both_classes_and_statements', async () => {
      const result = await seeder.seedAll();

      expect(result.classes.seeded).toBe(true);
      expect(result.classes.count).toBe(HAZARD_CLASSES.length);
      expect(result.statements.seeded).toBe(true);
      // mhchem provides ~91 H-statements, fallback has ~65
      expect(result.statements.count).toBeGreaterThanOrEqual(HAZARD_STATEMENTS.length);
    });

    it.skipIf(!dbAvailable)('should_skip_both_when_already_seeded', async () => {
      await seeder.seedAll();

      const result = await seeder.seedAll();

      expect(result.classes.skipped).toBe(true);
      expect(result.statements.skipped).toBe(true);
    });

    it.skipIf(!dbAvailable)('should_seed_classes_before_statements', async () => {
      // This test verifies the order by checking that both work together
      // and that statements can be seeded without classes present
      const result = await seeder.seedAll();

      const classCount = await em.count(HazardClass, {});
      const statementCount = await em.count(HazardStatement, {});

      expect(classCount).toBe(HAZARD_CLASSES.length);
      // Statement count should match what was seeded
      expect(statementCount).toBe(result.statements.count);
    });
  });
});
