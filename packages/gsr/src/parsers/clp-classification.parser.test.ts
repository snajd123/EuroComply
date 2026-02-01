// packages/gsr/src/parsers/clp-classification.parser.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import {
  ClpClassificationParser,
  type ParsedClassification,
} from './clp-classification.parser.js';
import {
  buildHazardClassDictionary,
  type HazardClassDefinition,
} from '../reference-data/hazard-classes.js';

describe('ClpClassificationParser', () => {
  let dictionary: Map<string, HazardClassDefinition>;
  let parser: ClpClassificationParser;

  beforeAll(() => {
    dictionary = buildHazardClassDictionary();
    parser = new ClpClassificationParser(dictionary);
  });

  describe('parseSingleClassification', () => {
    it('should_parse_simple_classification_when_standard_format', () => {
      // Arrange
      const raw = 'Carc. 1B, H350';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Carc.');
      expect(result!.category).toBe('1B');
      expect(result!.hCode).toBe('H350');
      expect(result!.isMinimumClassification).toBe(false);
    });

    it('should_parse_asterisk_minimum_classification_when_asterisk_present', () => {
      // Arrange
      const raw = 'Acute Tox. 4*, H302';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Acute Tox.');
      expect(result!.category).toBe('4');
      expect(result!.hCode).toBe('H302');
      expect(result!.isMinimumClassification).toBe(true);
    });

    it('should_parse_hcode_with_suffix_when_route_indicator_present', () => {
      // Arrange - H350i indicates inhalation route
      const raw = 'Carc. 1A, H350i';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Carc.');
      expect(result!.category).toBe('1A');
      expect(result!.hCode).toBe('H350i');
      expect(result!.isMinimumClassification).toBe(false);
    });

    it('should_parse_combined_hcode_when_reproductive_toxicity', () => {
      // Arrange - H360FD means fertility and developmental toxicity
      const raw = 'Repr. 1B, H360FD';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Repr.');
      expect(result!.category).toBe('1B');
      expect(result!.hCode).toBe('H360FD');
    });

    it('should_parse_category_with_letter_suffix_when_skin_sens', () => {
      // Arrange
      const raw = 'Skin Sens. 1A, H317';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Skin Sens.');
      expect(result!.category).toBe('1A');
      expect(result!.hCode).toBe('H317');
    });

    it('should_parse_no_category_no_hcode_when_press_gas', () => {
      // Arrange - Press. Gas has no category and no H-code
      const raw = 'Press. Gas';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Press. Gas');
      expect(result!.category).toBeUndefined();
      expect(result!.hCode).toBeUndefined();
    });

    it('should_parse_stot_se_when_multi_word_hazard_class', () => {
      // Arrange
      const raw = 'STOT SE 3, H335';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('STOT SE');
      expect(result!.category).toBe('3');
      expect(result!.hCode).toBe('H335');
    });

    it('should_parse_stot_re_when_repeated_exposure', () => {
      // Arrange
      const raw = 'STOT RE 1, H372';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('STOT RE');
      expect(result!.category).toBe('1');
      expect(result!.hCode).toBe('H372');
    });

    it('should_return_null_when_unknown_hazard_class', () => {
      // Arrange - "Unknown Class" is not in the dictionary
      const raw = 'Unknown Class 1, H999';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_when_input_is_dot', () => {
      // Arrange - Just a period (garbage from XLSX)
      const raw = '.';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_when_input_is_empty_string', () => {
      // Arrange
      const raw = '';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_when_input_is_whitespace', () => {
      // Arrange
      const raw = '   ';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_when_input_is_dash', () => {
      // Arrange - Dash placeholder
      const raw = '-';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).toBeNull();
    });

    it('should_handle_case_insensitive_lookup_when_lowercase_input', () => {
      // Arrange
      const raw = 'carc. 1B, H350';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Carc.');
    });

    it('should_parse_aquatic_acute_when_environmental_hazard', () => {
      // Arrange
      const raw = 'Aquatic Acute 1, H400';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Aquatic Acute');
      expect(result!.category).toBe('1');
      expect(result!.hCode).toBe('H400');
    });

    it('should_parse_aquatic_chronic_when_environmental_hazard', () => {
      // Arrange
      const raw = 'Aquatic Chronic 2, H411';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Aquatic Chronic');
      expect(result!.category).toBe('2');
      expect(result!.hCode).toBe('H411');
    });

    it('should_parse_flam_liq_when_physical_hazard', () => {
      // Arrange
      const raw = 'Flam. Liq. 2, H225';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Flam. Liq.');
      expect(result!.category).toBe('2');
      expect(result!.hCode).toBe('H225');
    });

    it('should_parse_muta_when_cmr_hazard', () => {
      // Arrange
      const raw = 'Muta. 1B, H340';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Muta.');
      expect(result!.category).toBe('1B');
      expect(result!.hCode).toBe('H340');
    });

    it('should_capture_additional_info_when_trailing_text_present', () => {
      // Arrange - Some classifications have additional info after H-code
      const raw = 'Acute Tox. 3, H301 (oral)';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Acute Tox.');
      expect(result!.hCode).toBe('H301');
      expect(result!.additionalInfo).toBe('(oral)');
    });

    it('should_parse_eye_dam_when_health_hazard', () => {
      // Arrange
      const raw = 'Eye Dam. 1, H318';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Eye Dam.');
      expect(result!.category).toBe('1');
      expect(result!.hCode).toBe('H318');
    });

    it('should_parse_skin_corr_when_health_hazard', () => {
      // Arrange
      const raw = 'Skin Corr. 1A, H314';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Skin Corr.');
      expect(result!.category).toBe('1A');
      expect(result!.hCode).toBe('H314');
    });

    it('should_parse_ozone_when_environmental_hazard', () => {
      // Arrange - Ozone depletion hazard
      const raw = 'Ozone 1, H420';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Ozone');
      expect(result!.category).toBe('1');
      expect(result!.hCode).toBe('H420');
    });

    it('should_parse_category_without_hcode_when_only_category_present', () => {
      // Arrange - Some entries may have category but missing H-code
      const raw = 'Carc. 2';

      // Act
      const result = parser.parseSingleClassification(raw);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.hazardClass).toBe('Carc.');
      expect(result!.category).toBe('2');
      expect(result!.hCode).toBeUndefined();
    });
  });

  describe('parseClassificationBlock', () => {
    it('should_parse_multiple_classifications_when_multiline_block', () => {
      // Arrange
      const block = `Carc. 1B, H350
Muta. 1B, H340
Repr. 1A, H360F`;

      // Act
      const results = parser.parseClassificationBlock(block);

      // Assert
      expect(results).toHaveLength(3);
      expect(results[0].hazardClass).toBe('Carc.');
      expect(results[1].hazardClass).toBe('Muta.');
      expect(results[2].hazardClass).toBe('Repr.');
    });

    it('should_skip_invalid_lines_when_block_has_garbage', () => {
      // Arrange
      const block = `Carc. 1B, H350
.
Unknown 1, H999
Muta. 1B, H340`;

      // Act
      const results = parser.parseClassificationBlock(block);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].hazardClass).toBe('Carc.');
      expect(results[1].hazardClass).toBe('Muta.');
    });

    it('should_return_empty_array_when_block_is_empty', () => {
      // Arrange
      const block = '';

      // Act
      const results = parser.parseClassificationBlock(block);

      // Assert
      expect(results).toHaveLength(0);
    });

    it('should_return_empty_array_when_block_is_all_garbage', () => {
      // Arrange
      const block = `.
-

   `;

      // Act
      const results = parser.parseClassificationBlock(block);

      // Assert
      expect(results).toHaveLength(0);
    });

    it('should_handle_crlf_line_endings_when_windows_format', () => {
      // Arrange
      const block = 'Carc. 1B, H350\r\nMuta. 1B, H340';

      // Act
      const results = parser.parseClassificationBlock(block);

      // Assert
      expect(results).toHaveLength(2);
    });

    it('should_trim_lines_when_whitespace_padding', () => {
      // Arrange
      const block = `  Carc. 1B, H350
   Muta. 1B, H340   `;

      // Act
      const results = parser.parseClassificationBlock(block);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].hazardClass).toBe('Carc.');
      expect(results[1].hazardClass).toBe('Muta.');
    });
  });
});
