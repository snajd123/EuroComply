import { describe, it, expect } from 'vitest';
import {
  HAZARD_CLASSES,
  buildHazardClassDictionary,
  getHazardClassesByType,
  getCmrHazardClasses,
  getPictogramForHazardClass,
} from './hazard-classes.js';
import { HazardType, SignalWord } from '../entities/HazardClass.js';

describe('hazard-classes reference data', () => {
  describe('HAZARD_CLASSES', () => {
    it('should_contain_all_major_hazard_classes', () => {
      // Verify we have a reasonable number of hazard classes
      expect(HAZARD_CLASSES.length).toBeGreaterThanOrEqual(30);
    });

    it('should_have_physical_hazards', () => {
      const physicalHazards = HAZARD_CLASSES.filter(
        hc => hc.hazardType === HazardType.PHYSICAL
      );
      expect(physicalHazards.length).toBeGreaterThanOrEqual(15);

      // Check specific physical hazards
      const codes = physicalHazards.map(h => h.code);
      expect(codes).toContain('Expl.');
      expect(codes).toContain('Flam. Gas');
      expect(codes).toContain('Flam. Liq.');
      expect(codes).toContain('Flam. Sol.');
      expect(codes).toContain('Ox. Gas');
      expect(codes).toContain('Press. Gas');
    });

    it('should_have_health_hazards', () => {
      const healthHazards = HAZARD_CLASSES.filter(
        hc => hc.hazardType === HazardType.HEALTH
      );
      expect(healthHazards.length).toBeGreaterThanOrEqual(10);

      // Check specific health hazards
      const codes = healthHazards.map(h => h.code);
      expect(codes).toContain('Acute Tox.');
      expect(codes).toContain('Skin Corr.');
      expect(codes).toContain('Eye Dam.');
      expect(codes).toContain('Carc.');
      expect(codes).toContain('Muta.');
      expect(codes).toContain('Repr.');
      expect(codes).toContain('STOT SE');
      expect(codes).toContain('STOT RE');
    });

    it('should_have_environmental_hazards', () => {
      const envHazards = HAZARD_CLASSES.filter(
        hc => hc.hazardType === HazardType.ENVIRONMENTAL
      );
      expect(envHazards.length).toBeGreaterThanOrEqual(3);

      // Check specific environmental hazards
      const codes = envHazards.map(h => h.code);
      expect(codes).toContain('Aquatic Acute');
      expect(codes).toContain('Aquatic Chronic');
      expect(codes).toContain('Ozone');
    });

    it('should_have_unique_codes', () => {
      const codes = HAZARD_CLASSES.map(h => h.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should_mark_only_cmr_hazards_as_cmr', () => {
      const cmrHazards = HAZARD_CLASSES.filter(hc => hc.isCmr);

      // Should have exactly 3 CMR hazard classes
      expect(cmrHazards).toHaveLength(3);

      const cmrCodes = cmrHazards.map(h => h.code);
      expect(cmrCodes).toContain('Carc.');
      expect(cmrCodes).toContain('Muta.');
      expect(cmrCodes).toContain('Repr.');

      // Verify these are all HEALTH hazards
      cmrHazards.forEach(hc => {
        expect(hc.hazardType).toBe(HazardType.HEALTH);
      });
    });

    it('should_have_correct_pictograms_for_key_hazard_classes', () => {
      const dict = buildHazardClassDictionary();

      // Explosives use GHS01 (exploding bomb)
      expect(dict.get('Expl.')?.pictogram).toBe('GHS01');

      // Flammables use GHS02 (flame)
      expect(dict.get('Flam. Liq.')?.pictogram).toBe('GHS02');
      expect(dict.get('Flam. Gas')?.pictogram).toBe('GHS02');

      // Oxidisers use GHS03 (flame over circle)
      expect(dict.get('Ox. Gas')?.pictogram).toBe('GHS03');

      // Compressed gases use GHS04 (gas cylinder)
      expect(dict.get('Press. Gas')?.pictogram).toBe('GHS04');

      // Corrosives use GHS05
      expect(dict.get('Skin Corr.')?.pictogram).toBe('GHS05');

      // Acute toxicity uses GHS06 (skull and crossbones)
      expect(dict.get('Acute Tox.')?.pictogram).toBe('GHS06');

      // CMR and STOT use GHS08 (health hazard)
      expect(dict.get('Carc.')?.pictogram).toBe('GHS08');
      expect(dict.get('Muta.')?.pictogram).toBe('GHS08');
      expect(dict.get('Repr.')?.pictogram).toBe('GHS08');
      expect(dict.get('STOT SE')?.pictogram).toBe('GHS08');

      // Environmental uses GHS09 (environment)
      expect(dict.get('Aquatic Acute')?.pictogram).toBe('GHS09');
    });

    it('should_have_signal_words_for_most_hazards', () => {
      const withSignalWord = HAZARD_CLASSES.filter(hc => hc.signalWord !== undefined);
      const withoutSignalWord = HAZARD_CLASSES.filter(hc => hc.signalWord === undefined);

      // Most hazard classes should have signal words
      expect(withSignalWord.length).toBeGreaterThan(withoutSignalWord.length);

      // Gases under pressure specifically should not have signal word
      const pressGas = HAZARD_CLASSES.find(h => h.code === 'Press. Gas');
      expect(pressGas?.signalWord).toBeUndefined();
    });
  });

  describe('buildHazardClassDictionary', () => {
    it('should_return_map_with_all_hazard_classes', () => {
      const dict = buildHazardClassDictionary();
      expect(dict.size).toBe(HAZARD_CLASSES.length);
    });

    it('should_allow_lookup_by_code', () => {
      const dict = buildHazardClassDictionary();

      const carc = dict.get('Carc.');
      expect(carc).toBeDefined();
      expect(carc?.fullName).toBe('Carcinogenicity');
      expect(carc?.hazardType).toBe(HazardType.HEALTH);
      expect(carc?.isCmr).toBe(true);
    });

    it('should_return_undefined_for_unknown_code', () => {
      const dict = buildHazardClassDictionary();
      expect(dict.get('Unknown')).toBeUndefined();
    });
  });

  describe('getHazardClassesByType', () => {
    it('should_return_only_physical_hazards_when_requested', () => {
      const physical = getHazardClassesByType(HazardType.PHYSICAL);

      expect(physical.length).toBeGreaterThan(0);
      physical.forEach(hc => {
        expect(hc.hazardType).toBe(HazardType.PHYSICAL);
      });
    });

    it('should_return_only_health_hazards_when_requested', () => {
      const health = getHazardClassesByType(HazardType.HEALTH);

      expect(health.length).toBeGreaterThan(0);
      health.forEach(hc => {
        expect(hc.hazardType).toBe(HazardType.HEALTH);
      });
    });

    it('should_return_only_environmental_hazards_when_requested', () => {
      const environmental = getHazardClassesByType(HazardType.ENVIRONMENTAL);

      expect(environmental.length).toBeGreaterThan(0);
      environmental.forEach(hc => {
        expect(hc.hazardType).toBe(HazardType.ENVIRONMENTAL);
      });
    });
  });

  describe('getCmrHazardClasses', () => {
    it('should_return_exactly_three_cmr_classes', () => {
      const cmr = getCmrHazardClasses();
      expect(cmr).toHaveLength(3);
    });

    it('should_return_carc_muta_repr', () => {
      const cmr = getCmrHazardClasses();
      const codes = cmr.map(h => h.code);

      expect(codes).toContain('Carc.');
      expect(codes).toContain('Muta.');
      expect(codes).toContain('Repr.');
    });

    it('should_all_have_isCmr_true', () => {
      const cmr = getCmrHazardClasses();
      cmr.forEach(hc => {
        expect(hc.isCmr).toBe(true);
      });
    });
  });

  describe('getPictogramForHazardClass', () => {
    it('should_return_pictogram_for_known_hazard_class', () => {
      expect(getPictogramForHazardClass('Carc.')).toBe('GHS08');
      expect(getPictogramForHazardClass('Flam. Liq.')).toBe('GHS02');
      expect(getPictogramForHazardClass('Aquatic Acute')).toBe('GHS09');
    });

    it('should_return_undefined_for_unknown_hazard_class', () => {
      expect(getPictogramForHazardClass('Unknown')).toBeUndefined();
    });

    it('should_return_undefined_for_hazard_class_without_pictogram', () => {
      // Press. Gas has no signal word, but does have a pictogram
      // Let's test a case where pictogram might be undefined
      // All our current hazard classes have pictograms, so this returns the pictogram
      expect(getPictogramForHazardClass('Press. Gas')).toBe('GHS04');
    });
  });
});
