import { describe, it, expect } from 'vitest';
import { ThresholdUnit, CONVERSION_TO_PPM } from './ThresholdUnit.js';

describe('ThresholdUnit', () => {
  describe('enum values', () => {
    it('should have all weight-based units', () => {
      expect(ThresholdUnit.PERCENT_BY_WEIGHT).toBe('PERCENT_BY_WEIGHT');
      expect(ThresholdUnit.PPM).toBe('PPM');
      expect(ThresholdUnit.PPB).toBe('PPB');
      expect(ThresholdUnit.MG_PER_KG).toBe('MG_PER_KG');
    });

    it('should have surface and concentration units', () => {
      expect(ThresholdUnit.MG_PER_CM2).toBe('MG_PER_CM2');
      expect(ThresholdUnit.MG_PER_L).toBe('MG_PER_L');
    });
  });

  describe('CONVERSION_TO_PPM', () => {
    it('should convert 1% to 10000 ppm', () => {
      expect(CONVERSION_TO_PPM[ThresholdUnit.PERCENT_BY_WEIGHT]).toBe(10000);
    });

    it('should have identity conversion for PPM', () => {
      expect(CONVERSION_TO_PPM[ThresholdUnit.PPM]).toBe(1);
    });

    it('should convert PPB to PPM (1 ppb = 0.001 ppm)', () => {
      expect(CONVERSION_TO_PPM[ThresholdUnit.PPB]).toBe(0.001);
    });

    it('should treat MG_PER_KG as equivalent to PPM', () => {
      expect(CONVERSION_TO_PPM[ThresholdUnit.MG_PER_KG]).toBe(1);
    });

    it('should return null for incompatible units (surface area)', () => {
      expect(CONVERSION_TO_PPM[ThresholdUnit.MG_PER_CM2]).toBeNull();
    });

    it('should return null for incompatible units (concentration)', () => {
      expect(CONVERSION_TO_PPM[ThresholdUnit.MG_PER_L]).toBeNull();
    });
  });
});
