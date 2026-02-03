// packages/gsr/src/parsers/efsa.parser.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseENumberLine,
  parseOpenFoodToxRow,
  normalizeENumber,
  type ParsedENumber,
  type ParsedOpenFoodToxEntry,
  type OpenFoodToxRow,
} from './efsa.parser.js';

describe('EfsaParser', () => {
  describe('normalizeENumber', () => {
    it('should_normalize_e_number_when_space_between_e_and_digits', () => {
      expect(normalizeENumber('E 211')).toBe('E211');
    });

    it('should_normalize_e_number_when_lowercase', () => {
      expect(normalizeENumber('e211')).toBe('E211');
    });

    it('should_normalize_e_number_when_multiple_spaces', () => {
      expect(normalizeENumber('E  211')).toBe('E211');
    });

    it('should_normalize_range_when_spaces_around_dash', () => {
      expect(normalizeENumber('E 210 - 213')).toBe('E210-213');
    });

    it('should_normalize_range_when_no_spaces', () => {
      expect(normalizeENumber('E210-213')).toBe('E210-213');
    });

    it('should_normalize_suffix_when_lowercase_with_space', () => {
      expect(normalizeENumber('E 160a')).toBe('E160A');
    });

    it('should_normalize_complex_suffix_when_parentheses', () => {
      expect(normalizeENumber('E 160a(ii)')).toBe('E160A(II)');
    });

    it('should_normalize_complex_suffix_when_lowercase_with_spaces', () => {
      expect(normalizeENumber('e 160 a (ii)')).toBe('E160A(II)');
    });

    it('should_return_empty_string_when_null_or_undefined', () => {
      expect(normalizeENumber(null)).toBe('');
      expect(normalizeENumber(undefined)).toBe('');
      expect(normalizeENumber('')).toBe('');
    });
  });

  describe('parseENumberLine', () => {
    it('should_parse_simple_e_number_when_tab_separated', () => {
      const line = 'E 211\tNo\tSodium benzoate';
      const result = parseENumberLine(line);

      expect(result).not.toBeNull();
      expect(result!.eNumber).toBe('E 211');
      expect(result!.eNumberNormalized).toBe('E211');
      expect(result!.name).toBe('Sodium benzoate');
      expect(result!.isGroup).toBe(false);
    });

    it('should_parse_e_number_with_suffix_when_letter_present', () => {
      const line = 'E 160a\tNo\tCarotenes';
      const result = parseENumberLine(line);

      expect(result).not.toBeNull();
      expect(result!.eNumber).toBe('E 160a');
      expect(result!.eNumberNormalized).toBe('E160A');
      expect(result!.name).toBe('Carotenes');
      expect(result!.isGroup).toBe(false);
    });

    it('should_parse_e_number_with_complex_suffix_when_parentheses_present', () => {
      const line = 'E 160a(ii)\tNo\tBeta-carotene';
      const result = parseENumberLine(line);

      expect(result).not.toBeNull();
      expect(result!.eNumber).toBe('E 160a(ii)');
      expect(result!.eNumberNormalized).toBe('E160A(II)');
      expect(result!.name).toBe('Beta-carotene');
      expect(result!.isGroup).toBe(false);
    });

    it('should_parse_range_e_number_when_dash_present', () => {
      const line = 'E 210-213\tYes\tBenzoates';
      const result = parseENumberLine(line);

      expect(result).not.toBeNull();
      expect(result!.eNumber).toBe('E 210-213');
      expect(result!.eNumberNormalized).toBe('E210-213');
      expect(result!.name).toBe('Benzoates');
      expect(result!.isGroup).toBe(true);
    });

    it('should_parse_group_e_number_when_yes_in_group_field', () => {
      const line = 'E 330-333\tYes\tCitrates';
      const result = parseENumberLine(line);

      expect(result).not.toBeNull();
      expect(result!.isGroup).toBe(true);
    });

    it('should_return_null_when_line_empty', () => {
      expect(parseENumberLine('')).toBeNull();
      expect(parseENumberLine('   ')).toBeNull();
    });

    it('should_return_null_when_line_has_insufficient_columns', () => {
      expect(parseENumberLine('E 211')).toBeNull();
      expect(parseENumberLine('E 211\tNo')).toBeNull();
    });

    it('should_return_null_when_e_number_missing', () => {
      expect(parseENumberLine('\tNo\tSodium benzoate')).toBeNull();
    });

    it('should_handle_whitespace_in_name', () => {
      const line = 'E 211\tNo\t  Sodium benzoate  ';
      const result = parseENumberLine(line);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Sodium benzoate');
    });

    it('should_handle_yes_group_marker_case_insensitive', () => {
      const line1 = 'E 210-213\tyes\tBenzoates';
      const line2 = 'E 210-213\tYES\tBenzoates';
      const line3 = 'E 210-213\tYes\tBenzoates';

      expect(parseENumberLine(line1)!.isGroup).toBe(true);
      expect(parseENumberLine(line2)!.isGroup).toBe(true);
      expect(parseENumberLine(line3)!.isGroup).toBe(true);
    });

    it('should_detect_group_from_range_even_if_group_field_says_no', () => {
      // If E-number contains range (dash between numbers), it's a group
      const line = 'E 210-213\tNo\tBenzoates';
      const result = parseENumberLine(line);

      expect(result).not.toBeNull();
      expect(result!.isGroup).toBe(true);
    });
  });

  describe('parseOpenFoodToxRow', () => {
    it('should_parse_valid_row_when_all_fields_present', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2019-12345',
        'Substance name': 'Sodium benzoate',
        'CAS number': '532-32-1',
        'EC number': '208-534-8',
        'Functional class': 'Preservative',
        'ADI': '5 mg/kg bw/day',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      expect(result!.efsaRef).toBe('EFSA-Q-2019-12345');
      expect(result!.name).toBe('Sodium benzoate');
      expect(result!.casNumber).toBe('532-32-1');
      expect(result!.ecNumber).toBe('208-534-8');
      expect(result!.functionalClass).toBe('Preservative');
      expect(result!.adiValue).toBe(5);
      expect(result!.adiUnit).toBe('mg/kg bw/day');
      expect(result!.adiNote).toBeNull();
    });

    it('should_parse_adi_with_decimal_value', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00001',
        'Substance name': 'Test substance',
        'CAS number': '100-00-0',
        'EC number': '200-100-1',
        'Functional class': 'Sweetener',
        'ADI': '0.5 mg/kg bw/day',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      expect(result!.adiValue).toBe(0.5);
      expect(result!.adiUnit).toBe('mg/kg bw/day');
    });

    it('should_handle_adi_not_specified_when_present', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00002',
        'Substance name': 'Citric acid',
        'CAS number': '77-92-9',
        'EC number': '201-069-1',
        'Functional class': 'Acidity regulator',
        'ADI': 'not specified',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      expect(result!.adiValue).toBeNull();
      expect(result!.adiUnit).toBeNull();
      expect(result!.adiNote).toBe('not specified');
    });

    it('should_handle_adi_not_limited_when_present', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00003',
        'Substance name': 'Water',
        'CAS number': '7732-18-5',
        'EC number': '231-791-2',
        'Functional class': 'Carrier',
        'ADI': 'not limited',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      expect(result!.adiValue).toBeNull();
      expect(result!.adiNote).toBe('not limited');
    });

    it('should_handle_adi_acceptable_when_present', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00004',
        'Substance name': 'Carbon dioxide',
        'CAS number': '124-38-9',
        'EC number': '204-696-9',
        'Functional class': 'Propellant',
        'ADI': 'acceptable',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      expect(result!.adiValue).toBeNull();
      expect(result!.adiNote).toBe('acceptable');
    });

    it('should_handle_group_adi_when_present', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00005',
        'Substance name': 'Potassium benzoate',
        'CAS number': '582-25-2',
        'EC number': '209-481-3',
        'Functional class': 'Preservative',
        'ADI': '5 mg/kg bw/day (Group ADI)',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      expect(result!.adiValue).toBe(5);
      expect(result!.adiUnit).toBe('mg/kg bw/day');
      expect(result!.adiNote).toBe('Group ADI');
    });

    it('should_return_null_cas_when_not_available', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00006',
        'Substance name': 'Mixed substance',
        'CAS number': '-',
        'EC number': '-',
        'Functional class': 'Emulsifier',
        'ADI': '10 mg/kg bw/day',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      expect(result!.casNumber).toBeNull();
      expect(result!.ecNumber).toBeNull();
    });

    it('should_return_null_when_reference_missing', () => {
      const row: OpenFoodToxRow = {
        'Reference': '',
        'Substance name': 'Test substance',
        'CAS number': '100-00-0',
        'EC number': '200-100-1',
        'Functional class': 'Sweetener',
        'ADI': '1 mg/kg bw/day',
      };

      const result = parseOpenFoodToxRow(row);
      expect(result).toBeNull();
    });

    it('should_return_null_when_substance_name_missing', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00007',
        'Substance name': '',
        'CAS number': '100-00-0',
        'EC number': '200-100-1',
        'Functional class': 'Sweetener',
        'ADI': '1 mg/kg bw/day',
      };

      const result = parseOpenFoodToxRow(row);
      expect(result).toBeNull();
    });

    it('should_return_null_when_functional_class_missing', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00008',
        'Substance name': 'Test substance',
        'CAS number': '100-00-0',
        'EC number': '200-100-1',
        'Functional class': '',
        'ADI': '1 mg/kg bw/day',
      };

      const result = parseOpenFoodToxRow(row);
      expect(result).toBeNull();
    });

    it('should_handle_adi_with_range_value', () => {
      // Some ADI values come as ranges, e.g., "0-5 mg/kg bw/day"
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00009',
        'Substance name': 'Test substance',
        'CAS number': '100-00-0',
        'EC number': '200-100-1',
        'Functional class': 'Colour',
        'ADI': '0-5 mg/kg bw/day',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      // For ranges, we take the upper bound
      expect(result!.adiValue).toBe(5);
      expect(result!.adiUnit).toBe('mg/kg bw/day');
    });

    it('should_sanitize_cas_number_and_reject_invalid', () => {
      // Test with a CAS number that has invalid checksum
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00010',
        'Substance name': 'Test substance',
        'CAS number': '123-45-9', // Invalid checksum
        'EC number': '200-100-1',
        'Functional class': 'Antioxidant',
        'ADI': '1 mg/kg bw/day',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      // Invalid CAS should be set to null
      expect(result!.casNumber).toBeNull();
    });

    it('should_handle_empty_adi_field', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00011',
        'Substance name': 'Test substance',
        'CAS number': '100-00-0',
        'EC number': '200-100-1',
        'Functional class': 'Stabiliser',
        'ADI': '',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      expect(result!.adiValue).toBeNull();
      expect(result!.adiUnit).toBeNull();
      expect(result!.adiNote).toBeNull();
    });

    it('should_handle_whitespace_in_fields', () => {
      const row: OpenFoodToxRow = {
        'Reference': '  EFSA-Q-2020-00012  ',
        'Substance name': '  Test substance  ',
        'CAS number': '  532-32-1  ',
        'EC number': '  208-534-8  ',
        'Functional class': '  Preservative  ',
        'ADI': '  5 mg/kg bw/day  ',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      expect(result!.efsaRef).toBe('EFSA-Q-2020-00012');
      expect(result!.name).toBe('Test substance');
      expect(result!.casNumber).toBe('532-32-1');
      expect(result!.functionalClass).toBe('Preservative');
    });

    it('should_handle_adi_with_micro_symbol', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00013',
        'Substance name': 'Test substance',
        'CAS number': '100-00-0',
        'EC number': '200-100-1',
        'Functional class': 'Colour',
        'ADI': '50 \u03bcg/kg bw/day',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      expect(result!.adiValue).toBe(50);
      expect(result!.adiUnit).toBe('\u03bcg/kg bw/day');
    });
  });

  describe('edge cases', () => {
    it('should_handle_e_number_line_with_extra_tabs', () => {
      const line = 'E 211\tNo\tSodium benzoate\t\textra';
      const result = parseENumberLine(line);

      expect(result).not.toBeNull();
      expect(result!.eNumber).toBe('E 211');
      expect(result!.name).toBe('Sodium benzoate');
    });

    it('should_parse_e_number_with_roman_numeral_suffix', () => {
      const line = 'E 160a(iv)\tNo\tBeta-apo-8\'-carotenal';
      const result = parseENumberLine(line);

      expect(result).not.toBeNull();
      expect(result!.eNumberNormalized).toBe('E160A(IV)');
    });

    it('should_handle_na_in_adi_field', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00014',
        'Substance name': 'Test substance',
        'CAS number': '100-00-0',
        'EC number': '200-100-1',
        'Functional class': 'Enzyme',
        'ADI': 'N/A',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      expect(result!.adiValue).toBeNull();
      expect(result!.adiNote).toBe('N/A');
    });

    it('should_handle_cas_number_with_n_a_value', () => {
      const row: OpenFoodToxRow = {
        'Reference': 'EFSA-Q-2020-00015',
        'Substance name': 'Test substance',
        'CAS number': 'n/a',
        'EC number': 'not available',
        'Functional class': 'Flavouring',
        'ADI': '1 mg/kg bw/day',
      };

      const result = parseOpenFoodToxRow(row);

      expect(result).not.toBeNull();
      expect(result!.casNumber).toBeNull();
      expect(result!.ecNumber).toBeNull();
    });
  });
});
