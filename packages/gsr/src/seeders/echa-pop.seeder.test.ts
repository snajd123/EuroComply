// packages/gsr/src/seeders/echa-pop.seeder.test.ts
import { describe, it, expect } from 'vitest';
import { deriveListingStatus } from '../parsers/echa-pop.parser.js';
import { formatSourceReference } from './echa-pop.seeder.js';
import { ListingStatus } from '../enums/ListingStatus.js';

describe('EchaPopSeeder', () => {
  describe('deriveListingStatus (integration with parser)', () => {
    // These tests verify the status mapping logic used by the seeder.
    // The actual function is defined in the parser but used by the seeder
    // to determine what status to store in the database.

    it('should_map_Annex_I_to_BANNED', () => {
      const result = deriveListingStatus(['I']);
      expect(result).toBe(ListingStatus.BANNED);
    });

    it('should_map_Annex_I_IV_to_BANNED', () => {
      // I takes precedence regardless of other annexes
      const result = deriveListingStatus(['I', 'IV']);
      expect(result).toBe(ListingStatus.BANNED);
    });

    it('should_map_Annex_II_to_RESTRICTED', () => {
      const result = deriveListingStatus(['II']);
      expect(result).toBe(ListingStatus.RESTRICTED);
    });

    it('should_map_Annex_II_III_to_RESTRICTED', () => {
      const result = deriveListingStatus(['II', 'III']);
      expect(result).toBe(ListingStatus.RESTRICTED);
    });

    it('should_map_Annex_III_to_LISTED', () => {
      const result = deriveListingStatus(['III']);
      expect(result).toBe(ListingStatus.LISTED);
    });

    it('should_map_Annex_IV_to_LISTED', () => {
      const result = deriveListingStatus(['IV']);
      expect(result).toBe(ListingStatus.LISTED);
    });

    it('should_prioritize_I_over_II_when_both_present', () => {
      // Annex I is the most restrictive, so it takes precedence
      const result = deriveListingStatus(['I', 'II', 'III', 'IV']);
      expect(result).toBe(ListingStatus.BANNED);
    });
  });

  describe('formatSourceReference', () => {
    // Test the source reference formatting used by the seeder
    it('should_format_single_annex_correctly', () => {
      const result = formatSourceReference(['I']);
      expect(result).toBe('POP Regulation (EU 2019/1021), Annex I');
    });

    it('should_format_multiple_annexes_correctly', () => {
      const result = formatSourceReference(['I', 'IV']);
      expect(result).toBe('POP Regulation (EU 2019/1021), Annex I, IV');
    });
  });
});
