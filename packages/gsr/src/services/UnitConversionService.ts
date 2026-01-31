// packages/gsr/src/services/UnitConversionService.ts
import { ThresholdUnit, CONVERSION_TO_PPM } from '../enums/ThresholdUnit.js';

export interface ThresholdValue {
  value: number;
  unit: ThresholdUnit;
}

/**
 * Converts and compares thresholds across different units.
 * All conversions normalize to PPM as the canonical unit.
 */
export class UnitConversionService {
  /**
   * Convert threshold to canonical unit (PPM) for comparison.
   * @returns Normalized value in PPM, or null if unit is incompatible
   */
  toCanonical(value: number, unit: ThresholdUnit): number | null {
    const factor = CONVERSION_TO_PPM[unit];
    if (factor === null) return null;
    return value * factor;
  }

  /**
   * Check if two units can be compared.
   */
  areComparable(unit1: ThresholdUnit, unit2: ThresholdUnit): boolean {
    return (
      CONVERSION_TO_PPM[unit1] !== null &&
      CONVERSION_TO_PPM[unit2] !== null
    );
  }

  /**
   * Compare two thresholds, accounting for unit conversion.
   * @returns -1 if a is stricter (lower), 0 if equal, 1 if b is stricter, null if incomparable
   */
  compareThresholds(a: ThresholdValue, b: ThresholdValue): -1 | 0 | 1 | null {
    if (!this.areComparable(a.unit, b.unit)) return null;

    const aPpm = this.toCanonical(a.value, a.unit)!;
    const bPpm = this.toCanonical(b.value, b.unit)!;

    // Lower threshold = stricter
    if (aPpm < bPpm) return -1;
    if (aPpm > bPpm) return 1;
    return 0;
  }
}
