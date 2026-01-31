// packages/gsr/src/parsers/echa-svhc.parser.test.ts
import { describe, it, expect } from 'vitest';
import { EchaSvhcParser } from './echa-svhc.parser.js';

describe('EchaSvhcParser', () => {
  describe('parseRow', () => {
    const parser = new EchaSvhcParser();

    it('should_parse_valid_row_when_all_fields_present', () => {
      const row = {
        'Substance Name': 'Lead chromate',
        'EC Number': '231-846-0',
        'CAS Number': '7758-97-6',
        'Date of inclusion': '2010-01-13',
        'Reason for inclusion': 'Carcinogenic (Article 57a)',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.substanceName).toBe('Lead chromate');
      expect(result!.ecNumber).toBe('231-846-0');
      expect(result!.casNumber).toBe('7758-97-6');
      expect(result!.dateOfInclusion).toEqual(new Date('2010-01-13'));
      expect(result!.reasonForInclusion).toBe('Carcinogenic (Article 57a)');
    });

    it('should_return_null_when_substance_name_missing', () => {
      const row = {
        'Substance Name': '',
        'EC Number': '231-846-0',
        'CAS Number': '7758-97-6',
        'Date of inclusion': '2010-01-13',
        'Reason for inclusion': 'Carcinogenic',
      };

      const result = parser.parseRow(row);
      expect(result).toBeNull();
    });

    it('should_return_null_when_ec_number_missing', () => {
      const row = {
        'Substance Name': 'Lead chromate',
        'EC Number': '',
        'CAS Number': '7758-97-6',
        'Date of inclusion': '2010-01-13',
        'Reason for inclusion': 'Carcinogenic',
      };

      const result = parser.parseRow(row);
      expect(result).toBeNull();
    });

    it('should_return_null_when_date_of_inclusion_missing', () => {
      const row = {
        'Substance Name': 'Lead chromate',
        'EC Number': '231-846-0',
        'CAS Number': '7758-97-6',
        'Date of inclusion': '',
        'Reason for inclusion': 'Carcinogenic',
      };

      const result = parser.parseRow(row);
      expect(result).toBeNull();
    });

    it('should_return_null_when_reason_missing', () => {
      const row = {
        'Substance Name': 'Lead chromate',
        'EC Number': '231-846-0',
        'CAS Number': '7758-97-6',
        'Date of inclusion': '2010-01-13',
        'Reason for inclusion': '',
      };

      const result = parser.parseRow(row);
      expect(result).toBeNull();
    });

    it('should_parse_row_without_CAS_when_dash_placeholder', () => {
      const row = {
        'Substance Name': 'Some substance',
        'EC Number': '200-001-8',
        'CAS Number': '-',
        'Date of inclusion': '2015-06-15',
        'Reason for inclusion': 'Toxic',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.substanceName).toBe('Some substance');
      expect(result!.casNumber).toBeUndefined();
    });

    it('should_parse_row_when_CAS_is_empty', () => {
      const row = {
        'Substance Name': 'Some substance',
        'EC Number': '200-001-8',
        'CAS Number': '',
        'Date of inclusion': '2015-06-15',
        'Reason for inclusion': 'Toxic',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.casNumber).toBeUndefined();
    });

    it('should_accept_record_with_invalid_CAS_format', () => {
      // SVHC list entries should be accepted even with invalid CAS
      const row = {
        'Substance Name': 'Some substance',
        'EC Number': '200-001-8',
        'CAS Number': 'invalid-cas',
        'Date of inclusion': '2015-06-15',
        'Reason for inclusion': 'Toxic',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.casNumber).toBeUndefined(); // Invalid CAS becomes undefined
    });
  });

  describe('parse', () => {
    const parser = new EchaSvhcParser();

    it('should_parse_CSV_content_when_valid', async () => {
      const csv = `"Substance Name","EC Number","CAS Number","Date of inclusion","Reason for inclusion"
"Lead chromate","231-846-0","7758-97-6","2010-01-13","Carcinogenic (Article 57a)"
"Cadmium","231-152-8","7440-43-9","2012-06-18","Carcinogenic (Article 57a)"`;

      const results = await parser.parse(csv);

      expect(results).toHaveLength(2);

      expect(results[0].substanceName).toBe('Lead chromate');
      expect(results[0].casNumber).toBe('7758-97-6');
      expect(results[0].dateOfInclusion).toEqual(new Date('2010-01-13'));

      expect(results[1].substanceName).toBe('Cadmium');
      expect(results[1].casNumber).toBe('7440-43-9');
      expect(results[1].dateOfInclusion).toEqual(new Date('2012-06-18'));
    });

    it('should_skip_invalid_rows_when_parsing', async () => {
      const csv = `"Substance Name","EC Number","CAS Number","Date of inclusion","Reason for inclusion"
"Lead chromate","231-846-0","7758-97-6","2010-01-13","Carcinogenic"
"","231-152-8","7440-43-9","2012-06-18","Carcinogenic"`;

      const results = await parser.parse(csv);

      expect(results).toHaveLength(1);
      expect(results[0].substanceName).toBe('Lead chromate');
    });

    it('should_return_empty_array_when_no_valid_rows', async () => {
      const csv = `"Substance Name","EC Number","CAS Number","Date of inclusion","Reason for inclusion"
"","","","",""`;

      const results = await parser.parse(csv);

      expect(results).toHaveLength(0);
    });
  });
});
