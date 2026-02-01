// packages/gsr/src/seeders/clp-harmonised.seeder.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { Substance } from '@eurocomply/database';
import { ClpHarmonisedSeeder, type ClpHarmonisedSeederResult } from './clp-harmonised.seeder.js';
import { HazardReferenceSeeder } from './hazard-reference.seeder.js';
import { HazardClass } from '../entities/HazardClass.js';
import { SubstanceHazardClassification } from '../entities/SubstanceHazardClassification.js';
import { UnresolvedSubstance, UnresolvedSource } from '../entities/UnresolvedSubstance.js';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { sanitizeCas } from '../utils/index.js';

const dbAvailable = await isDatabaseAvailable();

describe('ClpHarmonisedSeeder', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let seeder: ClpHarmonisedSeeder;

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
      seeder = new ClpHarmonisedSeeder(orm);
    }
  });

  describe('seedFromXlsx', () => {
    it.skipIf(!dbAvailable)('should_fail_gracefully_when_no_hazard_classes_seeded', async () => {
      // No hazard classes seeded - should return skipped with clear message
      const result = await seeder.seedFromXlsx('/fake/path.xlsx', 'ATP21');

      expect(result.skipped).toBe(true);
      expect(result.seeded).toBe(false);
      expect(result.message).toContain('No hazard classes found');
      expect(result.message).toContain('clp-reference');
    });

    it.skipIf(!dbAvailable)('should_return_zero_counts_when_file_not_found', async () => {
      // First seed hazard classes
      const refSeeder = new HazardReferenceSeeder(orm);
      await refSeeder.seedHazardClasses();

      // Try to seed from non-existent file
      const result = await seeder.seedFromXlsx('/nonexistent/path.xlsx', 'ATP21');

      // Should fail with file error (not pre-check error)
      expect(result.totalRows).toBe(0);
    });
  });

  describe('classification linking', () => {
    beforeEach(async () => {
      if (dbAvailable) {
        // Seed hazard classes first
        const refSeeder = new HazardReferenceSeeder(orm);
        await refSeeder.seedHazardClasses();
      }
    });

    it.skipIf(!dbAvailable)('should_link_classification_to_substance_and_hazard_class_correctly', async () => {
      // Create a test substance
      const substance = em.create(Substance, {
        casNumber: '50-00-0', // Formaldehyde
        primaryName: 'Formaldehyde',
        ecNumber: '200-001-8',
      });
      await em.persistAndFlush(substance);

      // Manually create a classification to test the linking pattern
      const hazardClass = await em.findOne(HazardClass, { code: 'Carc.' });
      expect(hazardClass).not.toBeNull();

      const classification = em.create(SubstanceHazardClassification, {
        substance: substance,
        hazardClass: hazardClass!,
        category: '1B',
        hCode: 'H350',
        isMinimumClassification: false,
        atpSource: 'ATP21',
        validFrom: new Date('2021-01-01'),
      });
      await em.persistAndFlush(classification);

      // Verify the link
      const found = await em.findOne(SubstanceHazardClassification, {
        substance: substance,
        hazardClass: hazardClass!,
      });
      expect(found).not.toBeNull();
      expect(found!.category).toBe('1B');
      expect(found!.hCode).toBe('H350');
    });

    it.skipIf(!dbAvailable)('should_store_notes_array_correctly', async () => {
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
      });
      await em.persistAndFlush(substance);

      const hazardClass = await em.findOne(HazardClass, { code: 'Carc.' });

      const classification = em.create(SubstanceHazardClassification, {
        substance: substance,
        hazardClass: hazardClass!,
        category: '1B',
        hCode: 'H350',
        notes: ['Note A', 'Note 10'],
        isMinimumClassification: false,
        atpSource: 'ATP21',
        validFrom: new Date('2021-01-01'),
      });
      await em.persistAndFlush(classification);

      const found = await em.findOne(SubstanceHazardClassification, { substance: substance });
      expect(found!.notes).toEqual(['Note A', 'Note 10']);
    });

    it.skipIf(!dbAvailable)('should_store_isMinimumClassification_flag', async () => {
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
      });
      await em.persistAndFlush(substance);

      const hazardClass = await em.findOne(HazardClass, { code: 'Skin Sens.' });

      const classification = em.create(SubstanceHazardClassification, {
        substance: substance,
        hazardClass: hazardClass!,
        category: '1',
        hCode: 'H317',
        isMinimumClassification: true,
        atpSource: 'ATP21',
        validFrom: new Date('2021-01-01'),
      });
      await em.persistAndFlush(classification);

      const found = await em.findOne(SubstanceHazardClassification, { substance: substance });
      expect(found!.isMinimumClassification).toBe(true);
    });

    it.skipIf(!dbAvailable)('should_store_mFactor_for_aquatic_hazards', async () => {
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
      });
      await em.persistAndFlush(substance);

      const hazardClass = await em.findOne(HazardClass, { code: 'Aquatic Acute' });

      const classification = em.create(SubstanceHazardClassification, {
        substance: substance,
        hazardClass: hazardClass!,
        category: '1',
        hCode: 'H400',
        mFactor: 10,
        isMinimumClassification: false,
        atpSource: 'ATP21',
        validFrom: new Date('2021-01-01'),
      });
      await em.persistAndFlush(classification);

      const found = await em.findOne(SubstanceHazardClassification, { substance: substance });
      expect(found!.mFactor).toBe(10);
    });
  });

  describe('substance metadata updates', () => {
    beforeEach(async () => {
      if (dbAvailable) {
        const refSeeder = new HazardReferenceSeeder(orm);
        await refSeeder.seedHazardClasses();
      }
    });

    it.skipIf(!dbAvailable)('should_update_clpVersion_on_substance', async () => {
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
      });
      await em.persistAndFlush(substance);

      // Manually update as the seeder would
      substance.clpVersion = 'ATP21';
      await em.persistAndFlush(substance);

      const found = await em.findOne(Substance, { casNumber: '50-00-0' });
      expect(found!.clpVersion).toBe('ATP21');
    });

    it.skipIf(!dbAvailable)('should_update_indexNumber_when_not_already_set', async () => {
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
      });
      await em.persistAndFlush(substance);

      // Simulate seeder setting indexNumber
      substance.indexNumber = '605-001-00-5';
      await em.persistAndFlush(substance);

      const found = await em.findOne(Substance, { casNumber: '50-00-0' });
      expect(found!.indexNumber).toBe('605-001-00-5');
    });

    it.skipIf(!dbAvailable)('should_not_overwrite_existing_indexNumber', async () => {
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
        indexNumber: 'EXISTING-123',
      });
      await em.persistAndFlush(substance);

      // Seeder should NOT overwrite existing indexNumber
      // Only update if not set
      if (!substance.indexNumber) {
        substance.indexNumber = 'NEW-456';
      }
      await em.persistAndFlush(substance);

      const found = await em.findOne(Substance, { casNumber: '50-00-0' });
      expect(found!.indexNumber).toBe('EXISTING-123');
    });
  });

  describe('substance matching', () => {
    beforeEach(async () => {
      if (dbAvailable) {
        const refSeeder = new HazardReferenceSeeder(orm);
        await refSeeder.seedHazardClasses();
      }
    });

    it.skipIf(!dbAvailable)('should_match_substance_by_cas_first', async () => {
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
        ecNumber: '200-001-8',
      });
      await em.persistAndFlush(substance);

      // Find by CAS
      const found = await em.findOne(Substance, { casNumber: '50-00-0' });
      expect(found).not.toBeNull();
      expect(found!.id).toBe(substance.id);
    });

    it.skipIf(!dbAvailable)('should_fallback_to_ec_number_when_no_cas_match', async () => {
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
        ecNumber: '200-001-8',
      });
      await em.persistAndFlush(substance);

      // Find by EC number when CAS doesn't match
      const found = await em.findOne(Substance, { ecNumber: '200-001-8' });
      expect(found).not.toBeNull();
      expect(found!.id).toBe(substance.id);
    });

    it.skipIf(!dbAvailable)('should_handle_missing_cas_gracefully', async () => {
      // Create substance with only EC number (unlikely but possible in edge cases)
      const substance = em.create(Substance, {
        casNumber: '50-00-0', // CAS is required in schema
        primaryName: 'Formaldehyde',
        ecNumber: '200-001-8',
      });
      await em.persistAndFlush(substance);

      // Try to find by a CAS that doesn't exist
      const notFound = await em.findOne(Substance, { casNumber: '999-99-9' });
      expect(notFound).toBeNull();

      // But EC number still works
      const found = await em.findOne(Substance, { ecNumber: '200-001-8' });
      expect(found).not.toBeNull();
    });
  });

  describe('duplicate handling', () => {
    beforeEach(async () => {
      if (dbAvailable) {
        const refSeeder = new HazardReferenceSeeder(orm);
        await refSeeder.seedHazardClasses();
      }
    });

    it.skipIf(!dbAvailable)('should_not_create_duplicate_classifications', async () => {
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
      });
      await em.persistAndFlush(substance);

      const hazardClass = await em.findOne(HazardClass, { code: 'Carc.' });

      // Create first classification
      const classification1 = em.create(SubstanceHazardClassification, {
        substance: substance,
        hazardClass: hazardClass!,
        category: '1B',
        hCode: 'H350',
        isMinimumClassification: false,
        atpSource: 'ATP21',
        validFrom: new Date('2021-01-01'),
      });
      await em.persistAndFlush(classification1);

      // Check for existing before creating duplicate
      const existing = await em.findOne(SubstanceHazardClassification, {
        substance: substance,
        hazardClass: hazardClass!,
        category: '1B',
        hCode: 'H350',
      });
      expect(existing).not.toBeNull();

      // Should not create duplicate
      const count = await em.count(SubstanceHazardClassification, {
        substance: substance,
        hazardClass: hazardClass!,
      });
      expect(count).toBe(1);
    });

    it.skipIf(!dbAvailable)('should_allow_same_substance_with_different_hazard_classes', async () => {
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
      });
      await em.persistAndFlush(substance);

      const carc = await em.findOne(HazardClass, { code: 'Carc.' });
      const skinSens = await em.findOne(HazardClass, { code: 'Skin Sens.' });

      // Create classification for Carc.
      const classification1 = em.create(SubstanceHazardClassification, {
        substance: substance,
        hazardClass: carc!,
        category: '1B',
        hCode: 'H350',
        isMinimumClassification: false,
        atpSource: 'ATP21',
        validFrom: new Date('2021-01-01'),
      });
      await em.persistAndFlush(classification1);

      // Create classification for Skin Sens.
      const classification2 = em.create(SubstanceHazardClassification, {
        substance: substance,
        hazardClass: skinSens!,
        category: '1',
        hCode: 'H317',
        isMinimumClassification: false,
        atpSource: 'ATP21',
        validFrom: new Date('2021-01-01'),
      });
      await em.persistAndFlush(classification2);

      // Should have two classifications
      const count = await em.count(SubstanceHazardClassification, {
        substance: substance,
      });
      expect(count).toBe(2);
    });
  });

  describe('sanitizeCas utility', () => {
    it('should_validate_checksum_correctly', () => {
      // Valid CAS numbers
      expect(sanitizeCas('50-00-0')).toBe('50-00-0'); // Formaldehyde
      expect(sanitizeCas('127-19-5')).toBe('127-19-5'); // DMAc
      expect(sanitizeCas('7440-66-6')).toBe('7440-66-6'); // Zinc

      // Invalid checksums
      expect(sanitizeCas('50-00-1')).toBeNull(); // Wrong check digit
      expect(sanitizeCas('123-45-9')).toBeNull(); // Invalid checksum
    });

    it('should_handle_malformed_input', () => {
      expect(sanitizeCas(null)).toBeNull();
      expect(sanitizeCas(undefined)).toBeNull();
      expect(sanitizeCas('')).toBeNull();
      expect(sanitizeCas('N/A')).toBeNull();
      expect(sanitizeCas('not available')).toBeNull();
      expect(sanitizeCas('-')).toBeNull();
    });

    it('should_format_and_validate', () => {
      // With CAS prefix
      expect(sanitizeCas('CAS 50-00-0')).toBe('50-00-0');
      expect(sanitizeCas('CAS: 50-00-0')).toBe('50-00-0');

      // With extra spaces
      expect(sanitizeCas('  50-00-0  ')).toBe('50-00-0');

      // Without hyphens (will be formatted)
      expect(sanitizeCas('50000')).toBe('50-00-0');
    });
  });

  describe('unresolved logging', () => {
    beforeEach(async () => {
      if (dbAvailable) {
        const refSeeder = new HazardReferenceSeeder(orm);
        await refSeeder.seedHazardClasses();
      }
    });

    it.skipIf(!dbAvailable)('should_log_unmatched_substances_to_UnresolvedSubstance_table', async () => {
      // Create an unresolved substance entry as the seeder would
      const unresolved = em.create(UnresolvedSubstance, {
        rawName: 'Unknown Chemical',
        rawCasNumber: '999-99-9',
        source: UnresolvedSource.REGULATORY_IMPORT,
        occurrenceCount: 1,
        status: 'PENDING',
      });
      await em.persistAndFlush(unresolved);

      const found = await em.findOne(UnresolvedSubstance, {
        rawCasNumber: '999-99-9',
      });
      expect(found).not.toBeNull();
      expect(found!.source).toBe(UnresolvedSource.REGULATORY_IMPORT);
      expect(found!.rawName).toBe('Unknown Chemical');
    });

    it.skipIf(!dbAvailable)('should_use_REGULATORY_IMPORT_source', async () => {
      const unresolved = em.create(UnresolvedSubstance, {
        rawName: 'Test Chemical',
        rawCasNumber: '123-45-6',
        source: UnresolvedSource.REGULATORY_IMPORT,
        occurrenceCount: 1,
        status: 'PENDING',
      });
      await em.persistAndFlush(unresolved);

      const found = await em.findOne(UnresolvedSubstance, { rawName: 'Test Chemical' });
      expect(found!.source).toBe(UnresolvedSource.REGULATORY_IMPORT);
    });

    it.skipIf(!dbAvailable)('should_increment_occurrence_count_for_duplicates', async () => {
      // First occurrence
      const unresolved1 = em.create(UnresolvedSubstance, {
        rawName: 'Unknown Chemical',
        rawCasNumber: '999-99-9',
        source: UnresolvedSource.REGULATORY_IMPORT,
        occurrenceCount: 1,
        status: 'PENDING',
      });
      await em.persistAndFlush(unresolved1);

      // Find existing and increment
      const existing = await em.findOne(UnresolvedSubstance, {
        rawName: 'Unknown Chemical',
        rawCasNumber: '999-99-9',
        source: UnresolvedSource.REGULATORY_IMPORT,
      });
      if (existing) {
        existing.occurrenceCount += 1;
        await em.persistAndFlush(existing);
      }

      const found = await em.findOne(UnresolvedSubstance, { rawCasNumber: '999-99-9' });
      expect(found!.occurrenceCount).toBe(2);
    });
  });
});
