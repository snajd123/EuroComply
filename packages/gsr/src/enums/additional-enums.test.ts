import { describe, it, expect } from 'vitest';
import { AliasSource } from './AliasSource.js';
import { ThresholdOperator } from './ThresholdOperator.js';
import { ListingStatus } from './ListingStatus.js';

describe('AliasSource', () => {
  it('should have all source types', () => {
    expect(AliasSource.PUBCHEM).toBe('PUBCHEM');
    expect(AliasSource.ECHA).toBe('ECHA');
    expect(AliasSource.EPA).toBe('EPA');
    expect(AliasSource.MANUAL).toBe('MANUAL');
  });
});

describe('ThresholdOperator', () => {
  it('should have comparison operators', () => {
    expect(ThresholdOperator.LT).toBe('LT');
    expect(ThresholdOperator.LTE).toBe('LTE');
    expect(ThresholdOperator.EQ).toBe('EQ');
    expect(ThresholdOperator.GTE).toBe('GTE');
    expect(ThresholdOperator.GT).toBe('GT');
  });
});

describe('ListingStatus', () => {
  it('should have regulatory listing statuses', () => {
    expect(ListingStatus.LISTED).toBe('LISTED');
    expect(ListingStatus.RESTRICTED).toBe('RESTRICTED');
    expect(ListingStatus.BANNED).toBe('BANNED');
    expect(ListingStatus.AUTHORIZED).toBe('AUTHORIZED');
  });
});
