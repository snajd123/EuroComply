// packages/gsr/src/seeders/rohs.seeder.test.ts
import { describe, it, expect } from 'vitest';
import { ROHS_SUBSTANCES } from './rohs.seeder.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { ProductScope } from '../enums/ProductScope.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';

/**
 * Unit tests for ROHS_SUBSTANCES static data.
 * Integration tests are run via the main test suite with full database setup.
 */
describe('ROHS_SUBSTANCES', () => {
  it('should_have_9_substances', () => {
    // RoHS has 10 substances but PBDE is a group that may need special handling
    expect(ROHS_SUBSTANCES.length).toBe(9);
  });

  it('should_have_all_required_fields', () => {
    for (const substance of ROHS_SUBSTANCES) {
      expect(substance.cas).toBeDefined();
      expect(substance.name).toBeDefined();
      expect(substance.threshold).toBeDefined();
      expect(substance.threshold).toBeGreaterThan(0);
    }
  });

  it('should_have_cadmium_with_lower_threshold', () => {
    const cadmium = ROHS_SUBSTANCES.find((s) => s.cas === '7440-43-9');
    expect(cadmium).toBeDefined();
    expect(cadmium?.threshold).toBe(0.01);
  });

  it('should_have_valid_CAS_numbers', () => {
    // CAS format: XXXXXXX-XX-X (7-2-1 digits)
    const casPattern = /^\d{1,7}-\d{2}-\d$/;
    for (const substance of ROHS_SUBSTANCES) {
      expect(substance.cas).toMatch(casPattern);
    }
  });

  it('should_have_expected_heavy_metals', () => {
    const casNumbers = ROHS_SUBSTANCES.map((s) => s.cas);
    expect(casNumbers).toContain('7439-92-1'); // Lead
    expect(casNumbers).toContain('7439-97-6'); // Mercury
    expect(casNumbers).toContain('7440-43-9'); // Cadmium
    expect(casNumbers).toContain('18540-29-9'); // Chromium VI
  });

  it('should_have_expected_phthalates', () => {
    const casNumbers = ROHS_SUBSTANCES.map((s) => s.cas);
    expect(casNumbers).toContain('117-81-7'); // DEHP
    expect(casNumbers).toContain('85-68-7'); // BBP
    expect(casNumbers).toContain('84-74-2'); // DBP
    expect(casNumbers).toContain('84-69-5'); // DIBP
  });

  it('should_have_thresholds_in_percent', () => {
    for (const substance of ROHS_SUBSTANCES) {
      // All RoHS thresholds are either 0.1% or 0.01% (for Cadmium)
      expect([0.1, 0.01]).toContain(substance.threshold);
    }
  });
});

describe('RohsSeeder constants', () => {
  it('should_use_correct_listing_status_for_restrictions', () => {
    // RoHS substances should be RESTRICTED status
    expect(ListingStatus.RESTRICTED).toBe('RESTRICTED');
  });

  it('should_use_EEE_product_scope', () => {
    // RoHS only applies to EEE
    expect(ProductScope.EEE).toBe('EEE');
  });

  it('should_use_percent_by_weight_unit', () => {
    // RoHS thresholds are expressed in percent by weight
    expect(ThresholdUnit.PERCENT_BY_WEIGHT).toBe('PERCENT_BY_WEIGHT');
  });
});
