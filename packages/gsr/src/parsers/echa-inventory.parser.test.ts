// packages/gsr/src/parsers/echa-inventory.parser.test.ts
import { describe, it, expect } from 'vitest';
import { EchaInventoryParser, type EchaInventoryRecord } from './echa-inventory.parser.js';

describe('EchaInventoryParser', () => {
  describe('parseRow', () => {
    it('should_parse_valid_CSV_row_when_all_fields_present', () => {
      const parser = new EchaInventoryParser();
      const row = {
        'EC Number': '215-174-5',
        'EC Name': 'Lead dioxide',
        'CAS Number': '1309-60-0',
        'Molecular formula': 'PbO2',
        'Description': 'Inorganic compound',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.ecNumber).toBe('215-174-5');
      expect(result!.primaryName).toBe('lead dioxide');
      expect(result!.casNumber).toBe('1309-60-0');
      expect(result!.molecularFormula).toBe('PbO2');
      expect(result!.description).toBe('Inorganic compound');
    });

    it('should_skip_rows_with_invalid_CAS_checksum_when_checksum_wrong', () => {
      const parser = new EchaInventoryParser();
      const row = {
        'EC Number': '999-999-9',
        'EC Name': 'Fake substance',
        'CAS Number': '1309-60-1', // Invalid checksum (should be 0, not 1)
        'Molecular formula': 'X',
      };

      const result = parser.parseRow(row);

      expect(result).toBeNull();
    });

    it('should_accept_rows_without_CAS_number_when_CAS_is_placeholder', () => {
      const parser = new EchaInventoryParser();

      // Test with '-'
      const row1 = {
        'EC Number': '215-174-5',
        'EC Name': 'Lead dioxide',
        'CAS Number': '-',
        'Molecular formula': 'PbO2',
      };
      const result1 = parser.parseRow(row1);
      expect(result1).not.toBeNull();
      expect(result1!.casNumber).toBeUndefined();

      // Test with 'N/A'
      const row2 = {
        'EC Number': '215-174-5',
        'EC Name': 'Lead dioxide',
        'CAS Number': 'N/A',
        'Molecular formula': 'PbO2',
      };
      const result2 = parser.parseRow(row2);
      expect(result2).not.toBeNull();
      expect(result2!.casNumber).toBeUndefined();

      // Test with empty string
      const row3 = {
        'EC Number': '215-174-5',
        'EC Name': 'Lead dioxide',
        'CAS Number': '',
        'Molecular formula': 'PbO2',
      };
      const result3 = parser.parseRow(row3);
      expect(result3).not.toBeNull();
      expect(result3!.casNumber).toBeUndefined();
    });

    it('should_normalize_EC_number_format_when_present', () => {
      const parser = new EchaInventoryParser();
      const row = {
        'EC Number': '231-152-8',
        'EC Name': 'Cadmium',
        'CAS Number': '7440-43-9',
        'Molecular formula': 'Cd',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.ecNumber).toBe('231-152-8');
    });

    it('should_return_null_when_required_fields_missing', () => {
      const parser = new EchaInventoryParser();
      // Missing EC Number
      expect(parser.parseRow({ 'EC Number': '', 'EC Name': 'Test' })).toBeNull();
      // Missing EC Name
      expect(parser.parseRow({ 'EC Number': '215-174-5', 'EC Name': '' })).toBeNull();
    });

    it('should_accept_rows_with_not_available_CAS_patterns', () => {
      const parser = new EchaInventoryParser();

      const notAvailable = parser.parseRow({
        'EC Number': '200-001-8',
        'EC Name': 'test',
        'CAS Number': 'not available',
      });
      expect(notAvailable).not.toBeNull();
      expect(notAvailable!.casNumber).toBeUndefined();

      const notApplicable = parser.parseRow({
        'EC Number': '200-001-8',
        'EC Name': 'test',
        'CAS Number': 'Not Applicable',
      });
      expect(notApplicable).not.toBeNull();
      expect(notApplicable!.casNumber).toBeUndefined();
    });
  });

  describe('parse', () => {
    it('should_parse_CSV_content_when_valid_records', async () => {
      const parser = new EchaInventoryParser();
      const csvContent = `"EC Number","EC Name","CAS Number","Molecular formula","Description"
"215-174-5","Lead dioxide","1309-60-0","PbO2","Lead compound"
"231-152-8","Cadmium","7440-43-9","Cd","Heavy metal"`;

      const results = await parser.parse(csvContent);

      expect(results).toHaveLength(2);

      expect(results[0]!.ecNumber).toBe('215-174-5');
      expect(results[0]!.primaryName).toBe('lead dioxide');
      expect(results[0]!.casNumber).toBe('1309-60-0');
      expect(results[0]!.molecularFormula).toBe('PbO2');

      expect(results[1]!.ecNumber).toBe('231-152-8');
      expect(results[1]!.primaryName).toBe('cadmium');
      expect(results[1]!.casNumber).toBe('7440-43-9');
      expect(results[1]!.molecularFormula).toBe('Cd');
    });

    it('should_skip_invalid_rows_and_continue_when_mixed_valid_invalid', async () => {
      const parser = new EchaInventoryParser();
      const csvContent = `"EC Number","EC Name","CAS Number","Molecular formula","Description"
"215-174-5","Lead dioxide","1309-60-0","PbO2","Valid entry"
"999-999-9","Fake substance","1309-60-1","X","Invalid CAS checksum (should be 0 not 1)"
"231-152-8","Cadmium","7440-43-9","Cd","Valid entry"`;

      const results = await parser.parse(csvContent);

      expect(results).toHaveLength(2);
      expect(results[0]!.ecNumber).toBe('215-174-5');
      expect(results[1]!.ecNumber).toBe('231-152-8');
    });
  });
});
