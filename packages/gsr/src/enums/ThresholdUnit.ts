export enum ThresholdUnit {
  PERCENT_BY_WEIGHT = 'PERCENT_BY_WEIGHT',
  PPM = 'PPM',
  PPB = 'PPB',
  MG_PER_KG = 'MG_PER_KG',
  MG_PER_CM2 = 'MG_PER_CM2',
  MG_PER_L = 'MG_PER_L',
}

/**
 * Conversion factors to canonical unit (PPM).
 * null = incompatible (different dimension, cannot compare).
 */
export const CONVERSION_TO_PPM: Record<ThresholdUnit, number | null> = {
  [ThresholdUnit.PERCENT_BY_WEIGHT]: 10_000,
  [ThresholdUnit.PPM]: 1,
  [ThresholdUnit.PPB]: 0.001,
  [ThresholdUnit.MG_PER_KG]: 1,
  [ThresholdUnit.MG_PER_CM2]: null,
  [ThresholdUnit.MG_PER_L]: null,
};

/** Canonical unit for threshold comparison */
export const CANONICAL_UNIT = ThresholdUnit.PPM;
