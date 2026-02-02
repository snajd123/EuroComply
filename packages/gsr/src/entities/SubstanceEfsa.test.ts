import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { SubstanceEfsa, EfsaReEvaluationOutcome } from './SubstanceEfsa.js';
import { Substance } from '@eurocomply/database';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceEfsa', () => {
  let orm: MikroORM;
  let em: EntityManager;

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
    }
  });

  describe('entity definition', () => {
    it('should_have_all_required_properties_when_entity_is_instantiated', () => {
      // Arrange & Act
      const entity = new SubstanceEfsa();

      // Assert - verify all properties exist on the entity
      expect(entity).toHaveProperty('id');
      expect(entity).toHaveProperty('eNumber');
      expect(entity).toHaveProperty('efsaRef');
      expect(entity).toHaveProperty('functionalClass');
      expect(entity).toHaveProperty('adiValue');
      expect(entity).toHaveProperty('adiUnit');
      expect(entity).toHaveProperty('adiNote');
      expect(entity).toHaveProperty('approvedUses');
      expect(entity).toHaveProperty('conditions');
      expect(entity).toHaveProperty('reEvaluationDate');
      expect(entity).toHaveProperty('reEvaluationOutcome');
    });

    it.skipIf(!dbAvailable)('should_have_correct_table_name_when_entity_is_defined', async () => {
      // Arrange
      const metadata = orm.getMetadata().get(SubstanceEfsa);

      // Act & Assert
      expect(metadata.tableName).toBe('substance_efsa');
    });
  });

  describe('entity persistence', () => {
    it.skipIf(!dbAvailable)('should_create_substance_efsa_when_all_required_fields_provided', async () => {
      // Arrange - create parent substance first (Sorbic acid - valid CAS)
      const substance = em.create(Substance, {
        casNumber: '110-44-1',
        primaryName: 'Sorbic acid',
      });
      await em.persistAndFlush(substance);

      // Act - create EFSA persona
      const efsa = em.create(SubstanceEfsa, {
        substance,
        eNumber: 'E200',
        functionalClass: 'PRESERVATIVE',
      });
      await em.persistAndFlush(efsa);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceEfsa, { eNumber: 'E200' }, { populate: ['substance'] });
      expect(found).not.toBeNull();
      expect(found!.eNumber).toBe('E200');
      expect(found!.functionalClass).toBe('PRESERVATIVE');
      expect(found!.substance.casNumber).toBe('110-44-1');
    });

    it.skipIf(!dbAvailable)('should_store_adi_value_as_decimal', async () => {
      // Arrange (Benzoic acid - valid CAS)
      const substance = em.create(Substance, {
        casNumber: '65-85-0',
        primaryName: 'Benzoic acid',
      });
      await em.persistAndFlush(substance);

      // Act
      const efsa = em.create(SubstanceEfsa, {
        substance,
        eNumber: 'E210',
        functionalClass: 'PRESERVATIVE',
        adiValue: 5.0,
        adiUnit: 'mg/kg bw/day',
        adiNote: 'Group ADI expressed as benzoic acid',
      });
      await em.persistAndFlush(efsa);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceEfsa, { eNumber: 'E210' });
      expect(parseFloat(String(found!.adiValue))).toBe(5.0);
      expect(found!.adiUnit).toBe('mg/kg bw/day');
      expect(found!.adiNote).toBe('Group ADI expressed as benzoic acid');
    });

    it.skipIf(!dbAvailable)('should_store_re_evaluation_outcome_enum_correctly', async () => {
      // Arrange (Sodium acetate - valid CAS: 127-09-3)
      const substance = em.create(Substance, {
        casNumber: '127-09-3',
        primaryName: 'Sodium acetate',
      });
      await em.persistAndFlush(substance);

      // Act - create EFSA entry with re-evaluation data
      const efsa = em.create(SubstanceEfsa, {
        substance,
        eNumber: 'E262',
        functionalClass: 'ACIDITY_REGULATOR',
        reEvaluationDate: new Date('2019-06-20'),
        reEvaluationOutcome: EfsaReEvaluationOutcome.SAFE,
      });
      await em.persistAndFlush(efsa);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceEfsa, { eNumber: 'E262' });
      expect(found!.reEvaluationOutcome).toBe(EfsaReEvaluationOutcome.SAFE);
      expect(found!.reEvaluationDate).toEqual(new Date('2019-06-20'));
    });

    it.skipIf(!dbAvailable)('should_store_approved_uses_array', async () => {
      // Arrange (Citric acid - valid CAS: 77-92-9)
      const substance = em.create(Substance, {
        casNumber: '77-92-9',
        primaryName: 'Citric acid',
      });
      await em.persistAndFlush(substance);

      // Act
      const efsa = em.create(SubstanceEfsa, {
        substance,
        eNumber: 'E330',
        functionalClass: 'ACIDITY_REGULATOR',
        approvedUses: ['Beverages', 'Confectionery', 'Dairy products', 'Sauces'],
      });
      await em.persistAndFlush(efsa);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceEfsa, { eNumber: 'E330' });
      expect(found!.approvedUses).toEqual(['Beverages', 'Confectionery', 'Dairy products', 'Sauces']);
    });

    it.skipIf(!dbAvailable)('should_store_conditions_text', async () => {
      // Arrange (Ascorbic acid - valid CAS: 50-81-7)
      const substance = em.create(Substance, {
        casNumber: '50-81-7',
        primaryName: 'Ascorbic acid',
      });
      await em.persistAndFlush(substance);

      // Act
      const efsa = em.create(SubstanceEfsa, {
        substance,
        eNumber: 'E300',
        functionalClass: 'ANTIOXIDANT',
        conditions: 'Quantum satis in most food categories. Specific limits apply in certain infant foods.',
      });
      await em.persistAndFlush(efsa);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceEfsa, { eNumber: 'E300' });
      expect(found!.conditions).toContain('Quantum satis');
    });

    it.skipIf(!dbAvailable)('should_store_safe_with_conditions_outcome', async () => {
      // Arrange (Tartaric acid - valid CAS: 87-69-4)
      const substance = em.create(Substance, {
        casNumber: '87-69-4',
        primaryName: 'L-Tartaric acid',
      });
      await em.persistAndFlush(substance);

      // Act
      const efsa = em.create(SubstanceEfsa, {
        substance,
        eNumber: 'E334',
        functionalClass: 'ACIDITY_REGULATOR',
        reEvaluationOutcome: EfsaReEvaluationOutcome.SAFE_WITH_CONDITIONS,
        conditions: 'Only for use in specific food categories at specified concentrations',
      });
      await em.persistAndFlush(efsa);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceEfsa, { eNumber: 'E334' });
      expect(found!.reEvaluationOutcome).toBe(EfsaReEvaluationOutcome.SAFE_WITH_CONDITIONS);
    });

    it.skipIf(!dbAvailable)('should_index_e_number_for_efficient_queries', async () => {
      // Arrange (Water and Ethanol - valid CAS numbers)
      const substance1 = em.create(Substance, {
        casNumber: '7732-18-5',
        primaryName: 'Water',
      });
      const substance2 = em.create(Substance, {
        casNumber: '64-17-5',
        primaryName: 'Ethanol',
      });
      await em.persistAndFlush([substance1, substance2]);

      const efsa1 = em.create(SubstanceEfsa, {
        substance: substance1,
        eNumber: 'E999',
        functionalClass: 'CARRIER',
      });
      const efsa2 = em.create(SubstanceEfsa, {
        substance: substance2,
        eNumber: 'E998',
        functionalClass: 'SOLVENT',
      });
      await em.persistAndFlush([efsa1, efsa2]);
      em.clear();

      // Act - query by eNumber (indexed)
      const found = await em.findOne(SubstanceEfsa, { eNumber: 'E999' });

      // Assert
      expect(found).not.toBeNull();
      expect(found!.eNumber).toBe('E999');
    });

    it.skipIf(!dbAvailable)('should_index_functional_class_for_efficient_queries', async () => {
      // Arrange (Beta-carotene - valid CAS: 7235-40-7)
      const substance = em.create(Substance, {
        casNumber: '7235-40-7',
        primaryName: 'Beta-carotene',
      });
      await em.persistAndFlush(substance);

      const efsa = em.create(SubstanceEfsa, {
        substance,
        eNumber: 'E160a',
        functionalClass: 'COLOUR',
      });
      await em.persistAndFlush(efsa);
      em.clear();

      // Act - query by functional class (indexed)
      const found = await em.find(SubstanceEfsa, { functionalClass: 'COLOUR' });

      // Assert
      expect(found).toHaveLength(1);
      expect(found[0].eNumber).toBe('E160a');
    });

    it.skipIf(!dbAvailable)('should_allow_null_e_number_for_non_e_numbered_additives', async () => {
      // Arrange - some EFSA-evaluated additives don't have E numbers (Guar gum - valid CAS: 9000-30-0)
      const substance = em.create(Substance, {
        casNumber: '9000-30-0',
        primaryName: 'Guar gum',
      });
      await em.persistAndFlush(substance);

      // Act
      const efsa = em.create(SubstanceEfsa, {
        substance,
        efsaRef: 'EFSA-Q-2021-00789',
        functionalClass: 'THICKENER',
      });
      await em.persistAndFlush(efsa);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceEfsa, { efsaRef: 'EFSA-Q-2021-00789' });
      expect(found).not.toBeNull();
      expect(found!.eNumber).toBeFalsy();  // Can be null or undefined depending on ORM behavior
      expect(found!.functionalClass).toBe('THICKENER');
    });
  });
});
