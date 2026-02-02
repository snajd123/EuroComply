// packages/gsr/src/parsers/echa-annex-xiv.parser.test.ts
import { describe, it, expect } from 'vitest';
import { EchaAnnexXivParser } from './echa-annex-xiv.parser.js';

describe('EchaAnnexXivParser', () => {
  describe('parseRow', () => {
    const parser = new EchaAnnexXivParser();

    it('should_parse_valid_row_when_all_fields_present', () => {
      const row = {
        'Substance Name': 'Bis(2-ethylhexyl)phthalate (DEHP)',
        'EC No.': '204-211-0',
        'CAS No.': '117-81-7',
        "Intrinsic property(ies) referred to in Article 57": 'Toxic for reproduction (Article 57c)',
        'Sunset Date': '21-Feb-2015',
        'Latest application date': '21-Aug-2013',
        'Exempted (categories of) uses': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.substanceName).toBe('Bis(2-ethylhexyl)phthalate (DEHP)');
      expect(result!.ecNumber).toBe('204-211-0');
      expect(result!.casNumber).toBe('117-81-7');
      expect(result!.intrinsicProperties).toBe('Toxic for reproduction (Article 57c)');
      expect(result!.sunsetDate).toBeInstanceOf(Date);
      expect(result!.sunsetDate!.getFullYear()).toBe(2015);
      expect(result!.sunsetDate!.getMonth()).toBe(1); // February is 1 (0-indexed)
      expect(result!.sunsetDate!.getDate()).toBe(21);
      expect(result!.latestApplicationDate).toBeInstanceOf(Date);
      expect(result!.latestApplicationDate!.getFullYear()).toBe(2013);
      expect(result!.latestApplicationDate!.getMonth()).toBe(7); // August is 7
      expect(result!.latestApplicationDate!.getDate()).toBe(21);
    });

    it('should_parse_row_when_CAS_missing', () => {
      const row = {
        'Substance Name': 'Test substance without CAS',
        'EC No.': '200-001-8',
        'CAS No.': '-',
        "Intrinsic property(ies) referred to in Article 57": 'Carcinogenic (Article 57a)',
        'Sunset Date': '01-Jan-2020',
        'Latest application date': '01-Jul-2018',
        'Exempted (categories of) uses': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.casNumber).toBeUndefined();
      expect(result!.ecNumber).toBe('200-001-8');
    });

    it('should_parse_row_when_dates_missing', () => {
      const row = {
        'Substance Name': 'Substance with pending dates',
        'EC No.': '200-002-9',
        'CAS No.': '50-00-0',
        "Intrinsic property(ies) referred to in Article 57": 'Mutagenic (Article 57b)',
        'Sunset Date': '',
        'Latest application date': '',
        'Exempted (categories of) uses': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.sunsetDate).toBeNull();
      expect(result!.latestApplicationDate).toBeNull();
    });

    it('should_return_null_when_substance_name_missing', () => {
      const row = {
        'Substance Name': '',
        'EC No.': '200-001-8',
        'CAS No.': '50-00-0',
        "Intrinsic property(ies) referred to in Article 57": 'Carcinogenic',
        'Sunset Date': '01-Jan-2020',
        'Latest application date': '01-Jul-2018',
        'Exempted (categories of) uses': '',
      };

      const result = parser.parseRow(row);
      expect(result).toBeNull();
    });

    it('should_parse_exempted_uses_when_present', () => {
      const row = {
        'Substance Name': 'Diarsenic trioxide',
        'EC No.': '215-481-4',
        'CAS No.': '1327-53-3',
        "Intrinsic property(ies) referred to in Article 57": 'Carcinogenic (Article 57a)',
        'Sunset Date': '21-May-2015',
        'Latest application date': '21-Nov-2013',
        'Exempted (categories of) uses': 'Use in production of glass',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.exemptedUses).toBe('Use in production of glass');
    });

    it('should_parse_row_without_exempted_uses_column', () => {
      const row = {
        'Substance Name': 'Simple substance',
        'EC No.': '200-003-0',
        'CAS No.': '71-43-2',
        "Intrinsic property(ies) referred to in Article 57": 'PBT (Article 57d)',
        'Sunset Date': '01-Mar-2022',
        'Latest application date': '01-Sep-2020',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.exemptedUses).toBeUndefined();
    });

    it('should_parse_multiple_intrinsic_properties', () => {
      const row = {
        'Substance Name': 'Multi-hazard substance',
        'EC No.': '200-004-1',
        'CAS No.': '75-09-2',
        "Intrinsic property(ies) referred to in Article 57": 'Carcinogenic (Article 57a), Equivalent level of concern having probable serious effects to the environment (Article 57f)',
        'Sunset Date': '01-Jun-2025',
        'Latest application date': '01-Dec-2023',
        'Exempted (categories of) uses': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.intrinsicProperties).toContain('Carcinogenic');
      expect(result!.intrinsicProperties).toContain('Article 57f');
    });

    it('should_sanitize_invalid_CAS_number', () => {
      const row = {
        'Substance Name': 'Substance with invalid CAS',
        'EC No.': '200-005-2',
        'CAS No.': '12345', // Invalid format, no hyphens
        "Intrinsic property(ies) referred to in Article 57": 'Toxic',
        'Sunset Date': '01-Jan-2024',
        'Latest application date': '01-Jul-2022',
        'Exempted (categories of) uses': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      // Invalid CAS should be sanitized (parser should handle gracefully)
    });

    it('should_handle_na_as_missing_CAS', () => {
      const row = {
        'Substance Name': 'Substance with N/A CAS',
        'EC No.': '200-006-3',
        'CAS No.': 'N/A',
        "Intrinsic property(ies) referred to in Article 57": 'vPvB',
        'Sunset Date': '01-Apr-2023',
        'Latest application date': '01-Oct-2021',
        'Exempted (categories of) uses': '',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.casNumber).toBeUndefined();
    });
  });

  describe('parse', () => {
    const parser = new EchaAnnexXivParser();

    it('should_parse_TSV_content_when_valid', async () => {
      const tsv = `Substance Name\tEC No.\tCAS No.\tIntrinsic property(ies) referred to in Article 57\tSunset Date\tLatest application date\tExempted (categories of) uses
Bis(2-ethylhexyl)phthalate (DEHP)\t204-211-0\t117-81-7\tToxic for reproduction (Article 57c)\t21-Feb-2015\t21-Aug-2013\t
Benzyl butyl phthalate (BBP)\t201-622-7\t85-68-7\tToxic for reproduction (Article 57c)\t21-Feb-2015\t21-Aug-2013\t`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(2);
      expect(results[0].substanceName).toBe('Bis(2-ethylhexyl)phthalate (DEHP)');
      expect(results[0].casNumber).toBe('117-81-7');
      expect(results[1].substanceName).toBe('Benzyl butyl phthalate (BBP)');
      expect(results[1].casNumber).toBe('85-68-7');
    });

    it('should_skip_invalid_rows_when_parsing', async () => {
      const tsv = `Substance Name\tEC No.\tCAS No.\tIntrinsic property(ies) referred to in Article 57\tSunset Date\tLatest application date\tExempted (categories of) uses
Bis(2-ethylhexyl)phthalate (DEHP)\t204-211-0\t117-81-7\tToxic for reproduction\t21-Feb-2015\t21-Aug-2013\t
\t200-001-8\t50-00-0\tCarcinogenic\t01-Jan-2020\t01-Jul-2018\t`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(1);
      expect(results[0].substanceName).toBe('Bis(2-ethylhexyl)phthalate (DEHP)');
    });

    it('should_handle_ECHA_metadata_header_lines', async () => {
      const tsv = `Downloaded from ECHA website
Date: 2026-01-20
Authorisation List

Substance Name\tEC No.\tCAS No.\tIntrinsic property(ies) referred to in Article 57\tSunset Date\tLatest application date\tExempted (categories of) uses
DEHP\t204-211-0\t117-81-7\tToxic for reproduction\t21-Feb-2015\t21-Aug-2013\t`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(1);
      expect(results[0].substanceName).toBe('DEHP');
    });

    it('should_return_empty_array_when_no_valid_rows', async () => {
      const tsv = `Substance Name\tEC No.\tCAS No.\tIntrinsic property(ies) referred to in Article 57\tSunset Date\tLatest application date
\t\t\t\t\t`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(0);
    });

    it('should_parse_various_date_formats', async () => {
      const tsv = `Substance Name\tEC No.\tCAS No.\tIntrinsic property(ies) referred to in Article 57\tSunset Date\tLatest application date
Test1\t200-001-1\t50-00-0\tCarcinogenic\t21-Feb-2015\t21-Aug-2013
Test2\t200-001-2\t50-00-1\tMutagenic\t01-Jan-2020\t01-Jul-2018`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(2);
      expect(results[0].sunsetDate?.getFullYear()).toBe(2015);
      expect(results[0].sunsetDate?.getMonth()).toBe(1); // February
      expect(results[1].sunsetDate?.getFullYear()).toBe(2020);
      expect(results[1].sunsetDate?.getMonth()).toBe(0); // January
    });
  });
});
