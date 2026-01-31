// packages/gsr/src/services/UnitConversionService.test.ts
import { describe, it, expect } from 'vitest';
import { UnitConversionService } from './UnitConversionService.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';

describe('UnitConversionService', () => {
  const service = new UnitConversionService();

  describe('toCanonical', () => {
    it('should convert percent to PPM (1% = 10000 ppm)', () => {
      expect(service.toCanonical(1, ThresholdUnit.PERCENT_BY_WEIGHT)).toBe(10000);
      expect(service.toCanonical(0.1, ThresholdUnit.PERCENT_BY_WEIGHT)).toBe(1000);
      expect(service.toCanonical(0.05, ThresholdUnit.PERCENT_BY_WEIGHT)).toBe(500);
    });

    it('should return PPM unchanged', () => {
      expect(service.toCanonical(1000, ThresholdUnit.PPM)).toBe(1000);
    });

    it('should convert PPB to PPM (1000 ppb = 1 ppm)', () => {
      expect(service.toCanonical(1000, ThresholdUnit.PPB)).toBe(1);
      expect(service.toCanonical(100, ThresholdUnit.PPB)).toBe(0.1);
    });

    it('should treat MG_PER_KG same as PPM', () => {
      expect(service.toCanonical(500, ThresholdUnit.MG_PER_KG)).toBe(500);
    });

    it('should return null for incompatible units', () => {
      expect(service.toCanonical(10, ThresholdUnit.MG_PER_CM2)).toBeNull();
      expect(service.toCanonical(10, ThresholdUnit.MG_PER_L)).toBeNull();
    });
  });

  describe('areComparable', () => {
    it('should return true for weight-based units', () => {
      expect(service.areComparable(ThresholdUnit.PERCENT_BY_WEIGHT, ThresholdUnit.PPM)).toBe(true);
      expect(service.areComparable(ThresholdUnit.PPM, ThresholdUnit.PPB)).toBe(true);
      expect(service.areComparable(ThresholdUnit.MG_PER_KG, ThresholdUnit.PERCENT_BY_WEIGHT)).toBe(true);
    });

    it('should return false when either unit is incompatible', () => {
      expect(service.areComparable(ThresholdUnit.PPM, ThresholdUnit.MG_PER_CM2)).toBe(false);
      expect(service.areComparable(ThresholdUnit.MG_PER_L, ThresholdUnit.PERCENT_BY_WEIGHT)).toBe(false);
    });
  });

  describe('compareThresholds', () => {
    it('should return -1 when first threshold is stricter (lower)', () => {
      const result = service.compareThresholds(
        { value: 0.05, unit: ThresholdUnit.PERCENT_BY_WEIGHT },
        { value: 0.1, unit: ThresholdUnit.PERCENT_BY_WEIGHT }
      );
      expect(result).toBe(-1);
    });

    it('should return 1 when second threshold is stricter (lower)', () => {
      const result = service.compareThresholds(
        { value: 1000, unit: ThresholdUnit.PPM },
        { value: 500, unit: ThresholdUnit.PPM }
      );
      expect(result).toBe(1);
    });

    it('should return 0 when thresholds are equal', () => {
      const result = service.compareThresholds(
        { value: 0.1, unit: ThresholdUnit.PERCENT_BY_WEIGHT },
        { value: 1000, unit: ThresholdUnit.PPM }
      );
      expect(result).toBe(0);
    });

    it('should compare across different units correctly', () => {
      // 0.05% = 500 ppm, comparing to 1000 ppm
      const result = service.compareThresholds(
        { value: 0.05, unit: ThresholdUnit.PERCENT_BY_WEIGHT },
        { value: 1000, unit: ThresholdUnit.PPM }
      );
      expect(result).toBe(-1); // 500 < 1000, so first is stricter
    });

    it('should return null for incomparable units', () => {
      const result = service.compareThresholds(
        { value: 10, unit: ThresholdUnit.PPM },
        { value: 5, unit: ThresholdUnit.MG_PER_CM2 }
      );
      expect(result).toBeNull();
    });
  });
});
