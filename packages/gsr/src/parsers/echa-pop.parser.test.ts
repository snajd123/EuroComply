// packages/gsr/src/parsers/echa-pop.parser.test.ts
import { describe, it, expect } from 'vitest';
import { EchaPopParser, deriveListingStatus } from './echa-pop.parser.js';
import { ListingStatus } from '../enums/ListingStatus.js';

describe('EchaPopParser', () => {
  describe('deriveListingStatus', () => {
    it('should_return_BANNED_when_annex_I_only', () => {
      const result = deriveListingStatus(['I']);
      expect(result).toBe(ListingStatus.BANNED);
    });

    it('should_return_BANNED_when_annex_I_and_IV', () => {
      const result = deriveListingStatus(['I', 'IV']);
      expect(result).toBe(ListingStatus.BANNED);
    });

    it('should_return_BANNED_when_annex_I_II_and_IV', () => {
      // Annex I takes precedence over II
      const result = deriveListingStatus(['I', 'II', 'IV']);
      expect(result).toBe(ListingStatus.BANNED);
    });

    it('should_return_RESTRICTED_when_annex_II_only', () => {
      const result = deriveListingStatus(['II']);
      expect(result).toBe(ListingStatus.RESTRICTED);
    });

    it('should_return_RESTRICTED_when_annex_II_and_III', () => {
      const result = deriveListingStatus(['II', 'III']);
      expect(result).toBe(ListingStatus.RESTRICTED);
    });

    it('should_return_LISTED_when_annex_III_only', () => {
      const result = deriveListingStatus(['III']);
      expect(result).toBe(ListingStatus.LISTED);
    });

    it('should_return_LISTED_when_annex_IV_only', () => {
      const result = deriveListingStatus(['IV']);
      expect(result).toBe(ListingStatus.LISTED);
    });

    it('should_return_LISTED_when_empty_annexes', () => {
      const result = deriveListingStatus([]);
      expect(result).toBe(ListingStatus.LISTED);
    });
  });

  describe('parseRow', () => {
    const parser = new EchaPopParser();

    it('should_parse_valid_row_when_all_fields_present', () => {
      const row = {
        'Substance Name': 'Aldrin',
        'EC No.': '206-215-8',
        'CAS No.': '309-00-2',
        'Annex': 'I, IV',
        'Specific exemptions or conditions': 'Some exemptions',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.substanceName).toBe('Aldrin');
      expect(result!.ecNumber).toBe('206-215-8');
      expect(result!.casNumber).toBe('309-00-2');
      expect(result!.annexes).toEqual(['I', 'IV']);
      expect(result!.listingStatus).toBe(ListingStatus.BANNED);
      expect(result!.exemptions).toBe('Some exemptions');
    });

    it('should_parse_row_when_single_annex_I', () => {
      const row = {
        'Substance Name': 'Chlordane',
        'EC No.': '200-349-0',
        'CAS No.': '57-74-9',
        'Annex': 'I',
        'Specific exemptions or conditions': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.annexes).toEqual(['I']);
      expect(result!.listingStatus).toBe(ListingStatus.BANNED);
    });

    it('should_parse_row_when_annex_II', () => {
      const row = {
        'Substance Name': 'Some restricted substance',
        'EC No.': '200-123-4',
        'CAS No.': '50-00-0',
        'Annex': 'II',
        'Specific exemptions or conditions': 'Use in closed systems',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.annexes).toEqual(['II']);
      expect(result!.listingStatus).toBe(ListingStatus.RESTRICTED);
      expect(result!.exemptions).toBe('Use in closed systems');
    });

    it('should_parse_row_when_annex_I_II_III_IV', () => {
      const row = {
        'Substance Name': 'Multi-annex substance',
        'EC No.': '200-456-7',
        'CAS No.': '71-43-2',
        'Annex': 'I, II, III, IV',
        'Specific exemptions or conditions': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.annexes).toEqual(['I', 'II', 'III', 'IV']);
      expect(result!.listingStatus).toBe(ListingStatus.BANNED); // I takes precedence
    });

    it('should_parse_row_when_CAS_missing', () => {
      const row = {
        'Substance Name': 'Test substance without CAS',
        'EC No.': '200-001-8',
        'CAS No.': '-',
        'Annex': 'I',
        'Specific exemptions or conditions': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.casNumber).toBeUndefined();
      expect(result!.ecNumber).toBe('200-001-8');
    });

    it('should_parse_row_when_EC_missing', () => {
      const row = {
        'Substance Name': 'Test substance without EC',
        'EC No.': '',
        'CAS No.': '50-00-0',
        'Annex': 'II',
        'Specific exemptions or conditions': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.ecNumber).toBeUndefined();
      expect(result!.casNumber).toBe('50-00-0');
    });

    it('should_return_null_when_substance_name_missing', () => {
      const row = {
        'Substance Name': '',
        'EC No.': '200-001-8',
        'CAS No.': '50-00-0',
        'Annex': 'I',
        'Specific exemptions or conditions': '',
      };

      const result = parser.parseRow(row);
      expect(result).toBeNull();
    });

    it('should_return_null_when_annex_missing', () => {
      const row = {
        'Substance Name': 'Test substance',
        'EC No.': '200-001-8',
        'CAS No.': '50-00-0',
        'Annex': '',
        'Specific exemptions or conditions': '',
      };

      const result = parser.parseRow(row);
      expect(result).toBeNull();
    });

    it('should_handle_na_as_missing_CAS', () => {
      const row = {
        'Substance Name': 'Substance with N/A CAS',
        'EC No.': '200-006-3',
        'CAS No.': 'N/A',
        'Annex': 'I',
        'Specific exemptions or conditions': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.casNumber).toBeUndefined();
    });

    it('should_parse_exemptions_when_present', () => {
      const row = {
        'Substance Name': 'DDT',
        'EC No.': '200-024-3',
        'CAS No.': '50-29-3',
        'Annex': 'I',
        'Specific exemptions or conditions': 'Use as intermediate in synthesis',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.exemptions).toBe('Use as intermediate in synthesis');
    });

    it('should_set_exemptions_undefined_when_empty', () => {
      const row = {
        'Substance Name': 'Endrin',
        'EC No.': '200-775-7',
        'CAS No.': '72-20-8',
        'Annex': 'I',
        'Specific exemptions or conditions': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.exemptions).toBeUndefined();
    });

    it('should_handle_whitespace_in_annex_column', () => {
      const row = {
        'Substance Name': 'Test substance',
        'EC No.': '200-001-8',
        'CAS No.': '50-00-0',
        'Annex': '  I ,  IV  ',
        'Specific exemptions or conditions': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.annexes).toEqual(['I', 'IV']);
    });
  });

  describe('parse', () => {
    const parser = new EchaPopParser();

    it('should_parse_TSV_content_when_valid', async () => {
      const tsv = `Substance Name\tEC No.\tCAS No.\tAnnex\tSpecific exemptions or conditions
Aldrin\t206-215-8\t309-00-2\tI, IV\t
Chlordane\t200-349-0\t57-74-9\tI\t`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(2);
      expect(results[0].substanceName).toBe('Aldrin');
      expect(results[0].casNumber).toBe('309-00-2');
      expect(results[0].annexes).toEqual(['I', 'IV']);
      expect(results[0].listingStatus).toBe(ListingStatus.BANNED);
      expect(results[1].substanceName).toBe('Chlordane');
      expect(results[1].casNumber).toBe('57-74-9');
    });

    it('should_skip_invalid_rows_when_parsing', async () => {
      const tsv = `Substance Name\tEC No.\tCAS No.\tAnnex\tSpecific exemptions or conditions
Aldrin\t206-215-8\t309-00-2\tI\t
\t200-001-8\t50-00-0\tI\t`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(1);
      expect(results[0].substanceName).toBe('Aldrin');
    });

    it('should_handle_ECHA_metadata_header_lines', async () => {
      const tsv = `Downloaded from ECHA website
Date: 2026-01-20
POP Regulation

Substance Name\tEC No.\tCAS No.\tAnnex\tSpecific exemptions or conditions
Aldrin\t206-215-8\t309-00-2\tI\t`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(1);
      expect(results[0].substanceName).toBe('Aldrin');
    });

    it('should_return_empty_array_when_no_valid_rows', async () => {
      const tsv = `Substance Name\tEC No.\tCAS No.\tAnnex\tSpecific exemptions or conditions
\t\t\t\t`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(0);
    });

    it('should_parse_mixed_annex_statuses', async () => {
      const tsv = `Substance Name\tEC No.\tCAS No.\tAnnex\tSpecific exemptions or conditions
BannedSubstance\t200-001-1\t50-00-0\tI\t
RestrictedSubstance\t200-001-2\t50-00-1\tII\tConditions apply
ListedSubstance\t200-001-3\t50-00-2\tIII\t`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(3);
      expect(results[0].listingStatus).toBe(ListingStatus.BANNED);
      expect(results[1].listingStatus).toBe(ListingStatus.RESTRICTED);
      expect(results[1].exemptions).toBe('Conditions apply');
      expect(results[2].listingStatus).toBe(ListingStatus.LISTED);
    });
  });
});
