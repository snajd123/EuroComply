import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { SubstanceHazardClassification, SclOperator } from './SubstanceHazardClassification.js';
import { HazardClass, HazardType } from './HazardClass.js';
import { Substance } from '@eurocomply/database';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceHazardClassification', () => {
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

  describe('entity creation', () => {
    it.skipIf(!dbAvailable)('should_create_classification_with_all_fields', async () => {
      const hazardClass = em.create(HazardClass, {
        code: 'Carc.',
        fullName: 'Carcinogenicity',
        hazardType: HazardType.HEALTH,
        isCmr: true,
      });

      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
      });

      await em.persistAndFlush([hazardClass, substance]);

      const classification = em.create(SubstanceHazardClassification, {
        substance,
        hazardClass,
        category: '1B',
        hCode: 'H350',
        notes: ['Note A'],
        atpSource: 'ATP21',
        validFrom: new Date('2024-01-01'),
      });
      await em.persistAndFlush(classification);
      em.clear();

      const found = await em.findOne(SubstanceHazardClassification,
        { id: classification.id },
        { populate: ['substance', 'hazardClass'] }
      );
      expect(found?.category).toBe('1B');
      expect(found?.hCode).toBe('H350');
      expect(found?.notes).toEqual(['Note A']);
      expect(found?.atpSource).toBe('ATP21');
      expect(found?.substance.primaryName).toBe('Formaldehyde');
      expect(found?.hazardClass.code).toBe('Carc.');
    });

    it.skipIf(!dbAvailable)('should_store_scl_logic_when_provided', async () => {
      const hazardClass = em.create(HazardClass, {
        code: 'Skin Sens.',
        fullName: 'Skin Sensitisation',
        hazardType: HazardType.HEALTH,
        isCmr: false,
      });

      const substance = em.create(Substance, {
        casNumber: '7440-02-0',
        primaryName: 'Nickel compounds',
      });

      await em.persistAndFlush([hazardClass, substance]);

      const classification = em.create(SubstanceHazardClassification, {
        substance,
        hazardClass,
        category: '1',
        hCode: 'H317',
        sclLogic: {
          operator: SclOperator.GTE,
          value: 0.001,
          unit: 'PERCENT',
        },
        atpSource: 'CLP00',
        validFrom: new Date('2009-01-01'),
      });
      await em.persistAndFlush(classification);
      em.clear();

      const found = await em.findOne(SubstanceHazardClassification, { id: classification.id });
      expect(found?.sclLogic?.operator).toBe('gte');
      expect(found?.sclLogic?.value).toBe(0.001);
      expect(found?.sclLogic?.unit).toBe('PERCENT');
    });

    it.skipIf(!dbAvailable)('should_store_scl_logic_with_between_operator', async () => {
      const hazardClass = em.create(HazardClass, {
        code: 'Eye Irrit.',
        fullName: 'Eye Irritation',
        hazardType: HazardType.HEALTH,
        isCmr: false,
      });

      const substance = em.create(Substance, {
        casNumber: '64-17-5',
        primaryName: 'Ethanol',
      });

      await em.persistAndFlush([hazardClass, substance]);

      const classification = em.create(SubstanceHazardClassification, {
        substance,
        hazardClass,
        category: '2',
        hCode: 'H319',
        sclLogic: {
          operator: SclOperator.BETWEEN,
          value: 50,
          valueTo: 100,
          unit: 'PERCENT',
        },
        atpSource: 'CLP00',
        validFrom: new Date('2009-01-01'),
      });
      await em.persistAndFlush(classification);
      em.clear();

      const found = await em.findOne(SubstanceHazardClassification, { id: classification.id });
      expect(found?.sclLogic?.operator).toBe('between');
      expect(found?.sclLogic?.value).toBe(50);
      expect(found?.sclLogic?.valueTo).toBe(100);
    });

    it.skipIf(!dbAvailable)('should_store_m_factor_for_aquatic_hazards', async () => {
      const hazardClass = em.create(HazardClass, {
        code: 'Aquatic Acute',
        fullName: 'Hazardous to the Aquatic Environment - Acute',
        hazardType: HazardType.ENVIRONMENTAL,
        isCmr: false,
      });

      const substance = em.create(Substance, {
        casNumber: '688-73-3',
        primaryName: 'Tributyltin',
      });

      await em.persistAndFlush([hazardClass, substance]);

      const classification = em.create(SubstanceHazardClassification, {
        substance,
        hazardClass,
        category: '1',
        hCode: 'H400',
        mFactor: 100,
        atpSource: 'ATP15',
        validFrom: new Date('2020-01-01'),
      });
      await em.persistAndFlush(classification);
      em.clear();

      const found = await em.findOne(SubstanceHazardClassification, { id: classification.id });
      expect(found?.mFactor).toBe(100);
    });

    it.skipIf(!dbAvailable)('should_flag_minimum_classification_when_asterisk_present', async () => {
      const hazardClass = em.create(HazardClass, {
        code: 'Acute Tox.',
        fullName: 'Acute Toxicity',
        hazardType: HazardType.HEALTH,
        isCmr: false,
      });

      const substance = em.create(Substance, {
        casNumber: '100-00-5',
        primaryName: 'Test substance',
      });

      await em.persistAndFlush([hazardClass, substance]);

      const classification = em.create(SubstanceHazardClassification, {
        substance,
        hazardClass,
        category: '4',
        hCode: 'H302',
        isMinimumClassification: true,
        atpSource: 'ATP21',
        validFrom: new Date('2024-01-01'),
      });
      await em.persistAndFlush(classification);
      em.clear();

      const found = await em.findOne(SubstanceHazardClassification, { id: classification.id });
      expect(found?.isMinimumClassification).toBe(true);
    });

    it.skipIf(!dbAvailable)('should_allow_null_category_and_hCode', async () => {
      // Some classifications may have placeholders or incomplete data
      const hazardClass = em.create(HazardClass, {
        code: 'STOT SE',
        fullName: 'Specific Target Organ Toxicity - Single Exposure',
        hazardType: HazardType.HEALTH,
        isCmr: false,
      });

      const substance = em.create(Substance, {
        casNumber: '67-56-1',
        primaryName: 'Methanol',
      });

      await em.persistAndFlush([hazardClass, substance]);

      const classification = em.create(SubstanceHazardClassification, {
        substance,
        hazardClass,
        atpSource: 'ATP10',
        validFrom: new Date('2015-01-01'),
      });
      await em.persistAndFlush(classification);
      em.clear();

      const found = await em.findOne(SubstanceHazardClassification, { id: classification.id });
      expect(found?.category).toBeNull();
      expect(found?.hCode).toBeNull();
    });

    it.skipIf(!dbAvailable)('should_support_validTo_for_superseded_classifications', async () => {
      const hazardClass = em.create(HazardClass, {
        code: 'Flam. Liq.',
        fullName: 'Flammable Liquids',
        hazardType: HazardType.PHYSICAL,
        isCmr: false,
      });

      const substance = em.create(Substance, {
        casNumber: '67-63-0',
        primaryName: 'Isopropanol',
      });

      await em.persistAndFlush([hazardClass, substance]);

      // Old classification that was superseded
      const oldClassification = em.create(SubstanceHazardClassification, {
        substance,
        hazardClass,
        category: '3',
        hCode: 'H226',
        atpSource: 'CLP00',
        validFrom: new Date('2009-01-01'),
        validTo: new Date('2020-06-30'),
      });

      // New classification
      const newClassification = em.create(SubstanceHazardClassification, {
        substance,
        hazardClass,
        category: '2',
        hCode: 'H225',
        atpSource: 'ATP15',
        validFrom: new Date('2020-07-01'),
      });

      await em.persistAndFlush([oldClassification, newClassification]);
      em.clear();

      // Find current (active) classifications
      const current = await em.find(SubstanceHazardClassification, {
        substance: substance.id,
        validTo: null,
      });
      expect(current).toHaveLength(1);
      expect(current[0]?.category).toBe('2');

      // Find historical classification
      const historical = await em.findOne(SubstanceHazardClassification, {
        substance: substance.id,
        validTo: { $ne: null },
      });
      expect(historical?.category).toBe('3');
    });

    it.skipIf(!dbAvailable)('should_allow_multiple_notes', async () => {
      const hazardClass = em.create(HazardClass, {
        code: 'Repr.',
        fullName: 'Reproductive Toxicity',
        hazardType: HazardType.HEALTH,
        isCmr: true,
      });

      const substance = em.create(Substance, {
        casNumber: '84-74-2',
        primaryName: 'Dibutyl phthalate',
      });

      await em.persistAndFlush([hazardClass, substance]);

      const classification = em.create(SubstanceHazardClassification, {
        substance,
        hazardClass,
        category: '1B',
        hCode: 'H360Db',
        notes: ['Note A', 'Note 10', 'Note 7'],
        atpSource: 'ATP17',
        validFrom: new Date('2021-01-01'),
      });
      await em.persistAndFlush(classification);
      em.clear();

      const found = await em.findOne(SubstanceHazardClassification, { id: classification.id });
      expect(found?.notes).toEqual(['Note A', 'Note 10', 'Note 7']);
      expect(found?.notes).toHaveLength(3);
    });
  });

  describe('querying', () => {
    it.skipIf(!dbAvailable)('should_find_all_classifications_for_substance', async () => {
      const carcClass = em.create(HazardClass, {
        code: 'Carc. Q',
        fullName: 'Carcinogenicity',
        hazardType: HazardType.HEALTH,
        isCmr: true,
      });

      const skinSensClass = em.create(HazardClass, {
        code: 'Skin Sens. Q',
        fullName: 'Skin Sensitisation',
        hazardType: HazardType.HEALTH,
        isCmr: false,
      });

      const substance = em.create(Substance, {
        casNumber: '100-01-6',
        primaryName: 'Test Multi-Hazard',
      });

      await em.persistAndFlush([carcClass, skinSensClass, substance]);

      const carcClassification = em.create(SubstanceHazardClassification, {
        substance,
        hazardClass: carcClass,
        category: '1B',
        hCode: 'H350',
        atpSource: 'ATP21',
        validFrom: new Date('2024-01-01'),
      });

      const skinSensClassification = em.create(SubstanceHazardClassification, {
        substance,
        hazardClass: skinSensClass,
        category: '1',
        hCode: 'H317',
        atpSource: 'ATP21',
        validFrom: new Date('2024-01-01'),
      });

      await em.persistAndFlush([carcClassification, skinSensClassification]);
      em.clear();

      const classifications = await em.find(SubstanceHazardClassification, {
        substance: substance.id,
      }, { populate: ['hazardClass'] });

      expect(classifications).toHaveLength(2);
      const codes = classifications.map(c => c.hazardClass.code).sort();
      expect(codes).toEqual(['Carc. Q', 'Skin Sens. Q']);
    });

    it.skipIf(!dbAvailable)('should_find_cmr_classifications_via_hazardClass', async () => {
      // Create CMR and non-CMR hazard classes
      const carcClass = em.create(HazardClass, {
        code: 'Carc. CMR',
        fullName: 'Carcinogenicity',
        hazardType: HazardType.HEALTH,
        isCmr: true,
      });

      const flamClass = em.create(HazardClass, {
        code: 'Flam. Liq. CMR',
        fullName: 'Flammable Liquids',
        hazardType: HazardType.PHYSICAL,
        isCmr: false,
      });

      const substance1 = em.create(Substance, {
        casNumber: '71-43-2',
        primaryName: 'Benzene',
      });

      const substance2 = em.create(Substance, {
        casNumber: '67-64-1',
        primaryName: 'Acetone',
      });

      await em.persistAndFlush([carcClass, flamClass, substance1, substance2]);

      // Benzene has CMR classification
      const benzeneClassification = em.create(SubstanceHazardClassification, {
        substance: substance1,
        hazardClass: carcClass,
        category: '1A',
        hCode: 'H350',
        atpSource: 'ATP21',
        validFrom: new Date('2024-01-01'),
      });

      // Acetone has only flammable classification
      const acetoneClassification = em.create(SubstanceHazardClassification, {
        substance: substance2,
        hazardClass: flamClass,
        category: '2',
        hCode: 'H225',
        atpSource: 'ATP21',
        validFrom: new Date('2024-01-01'),
      });

      await em.persistAndFlush([benzeneClassification, acetoneClassification]);
      em.clear();

      // Find substances with CMR classifications
      const cmrClassifications = await em.find(SubstanceHazardClassification, {
        hazardClass: { isCmr: true },
      }, { populate: ['substance', 'hazardClass'] });

      expect(cmrClassifications).toHaveLength(1);
      expect(cmrClassifications[0]?.substance.primaryName).toBe('Benzene');
    });
  });
});
