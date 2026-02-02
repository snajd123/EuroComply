// packages/gsr/src/seeders/echa-annex-xvii.seeder.test.ts
import { describe, it, expect } from 'vitest';
import { generateGroupCode } from './echa-annex-xvii.seeder.js';

/**
 * Unit tests for ECHA Annex XVII seeder helper functions.
 *
 * Note: Full integration tests require database setup. These tests
 * focus on the pure helper functions that don't require database access.
 */
describe('EchaAnnexXviiSeeder', () => {
  describe('generateGroupCode', () => {
    it('should_generate_code_when_simple_entry', () => {
      const code = generateGroupCode('23', 'Cadmium');
      expect(code).toBe('ANNEX_XVII_23_CADMIUM');
    });

    it('should_generate_code_when_compound_name', () => {
      const code = generateGroupCode('63', 'Lead and its compounds');
      expect(code).toBe('ANNEX_XVII_63_LEAD_COMPOUNDS');
    });

    it('should_normalize_name_when_special_characters', () => {
      const code = generateGroupCode('28', 'N,N-dimethylformamide');
      // Should remove special chars and convert to uppercase
      expect(code).toMatch(/^ANNEX_XVII_28_[A-Z0-9_]+$/);
    });

    it('should_truncate_long_names', () => {
      const longName = 'A very long substance name that exceeds the maximum allowed length for a group code identifier';
      const code = generateGroupCode('99', longName);
      // Code should be truncated to reasonable length
      expect(code.length).toBeLessThanOrEqual(100);
    });

    it('should_handle_salt_names', () => {
      const code = generateGroupCode('18', 'Mercury and its salts');
      expect(code).toBe('ANNEX_XVII_18_MERCURY_SALTS');
    });

    it('should_handle_derivatives', () => {
      const code = generateGroupCode('50', 'Organostannic compounds and derivatives');
      expect(code).toMatch(/^ANNEX_XVII_50_/);
    });
  });
});
