// packages/gsr/src/parsers/biocides.parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseBiocidesRow, type BiocidesRow, type ParsedBiocidesEntry } from './biocides.parser.js';

describe('BiocidesParser', () => {
  describe('parseBiocidesRow', () => {
    it('should_parse_all_fields_when_row_has_complete_Article_95_data', () => {
      // Arrange
      const row: BiocidesRow = {
        'Active Substance Name': 'alpha-Cypermethrin',
        'EC no.': '214-619-0',
        'CAS no.': '67375-30-8',
        'PT': 18,
        'Entity Name': 'Test Company',
        'Country': 'Spain',
        'Supplier Type': 'Substance & Product Supplier',
        'Inclusion Reason': 'Art. 95 Submission',
      };

      // Act
      const result = parseBiocidesRow(row);

      // Assert
      expect(result.substanceName).toBe('alpha-Cypermethrin');
      expect(result.ecNumber).toBe('214-619-0');
      expect(result.casNumber).toBe('67375-30-8');
      expect(result.productType).toBe(18);
      expect(result.entityName).toBe('Test Company');
      expect(result.country).toBe('Spain');
      expect(result.supplierType).toBe('Substance & Product Supplier');
      expect(result.inclusionReason).toBe('Art. 95 Submission');
    });

    it('should_return_null_EC_number_when_row_has_Not_allocated_value', () => {
      // Arrange
      const row: BiocidesRow = {
        'Active Substance Name': 'Test Chemical',
        'EC no.': 'Not allocated',
        'CAS no.': '12345-67-8',
        'PT': 1,
        'Entity Name': 'Test',
        'Country': 'Germany',
        'Supplier Type': 'Substance Supplier',
        'Inclusion Reason': 'RP Participant',
      };

      // Act
      const result = parseBiocidesRow(row);

      // Assert
      expect(result.ecNumber).toBeNull();
      expect(result.casNumber).toBe('12345-67-8');
    });

    it('should_return_null_CAS_number_when_row_has_empty_CAS', () => {
      // Arrange
      const row: BiocidesRow = {
        'Active Substance Name': 'Unknown Substance',
        'EC no.': '200-001-8',
        'CAS no.': '',
        'PT': 5,
        'Entity Name': 'Test Corp',
        'Country': 'France',
        'Supplier Type': 'Product Supplier',
        'Inclusion Reason': 'Art. 95 Submission',
      };

      // Act
      const result = parseBiocidesRow(row);

      // Assert
      expect(result.casNumber).toBeNull();
      expect(result.ecNumber).toBe('200-001-8');
    });

    it('should_parse_PT_as_number_when_row_has_string_PT_value', () => {
      // Arrange
      const row: BiocidesRow = {
        'Active Substance Name': 'Test Biocide',
        'EC no.': '123-456-7',
        'CAS no.': '7440-43-9',
        'PT': '22',
        'Entity Name': 'Biocide Corp',
        'Country': 'Italy',
        'Supplier Type': 'Substance Supplier',
        'Inclusion Reason': 'RP Participant',
      };

      // Act
      const result = parseBiocidesRow(row);

      // Assert
      expect(result.productType).toBe(22);
      expect(typeof result.productType).toBe('number');
    });

    it('should_trim_whitespace_from_all_string_fields_when_present', () => {
      // Arrange
      const row: BiocidesRow = {
        'Active Substance Name': '  Trimmed Substance  ',
        'EC no.': '  214-619-0  ',
        'CAS no.': '  67375-30-8  ',
        'PT': 18,
        'Entity Name': '  Test Company  ',
        'Country': '  Spain  ',
        'Supplier Type': '  Substance Supplier  ',
        'Inclusion Reason': '  Art. 95 Submission  ',
      };

      // Act
      const result = parseBiocidesRow(row);

      // Assert
      expect(result.substanceName).toBe('Trimmed Substance');
      expect(result.ecNumber).toBe('214-619-0');
      expect(result.casNumber).toBe('67375-30-8');
      expect(result.entityName).toBe('Test Company');
      expect(result.country).toBe('Spain');
      expect(result.supplierType).toBe('Substance Supplier');
      expect(result.inclusionReason).toBe('Art. 95 Submission');
    });

    it('should_return_null_EC_number_when_row_has_dash_placeholder', () => {
      // Arrange
      const row: BiocidesRow = {
        'Active Substance Name': 'Dash Substance',
        'EC no.': '-',
        'CAS no.': '12345-67-8',
        'PT': 3,
        'Entity Name': 'Test',
        'Country': 'UK',
        'Supplier Type': 'Product Supplier',
        'Inclusion Reason': 'Art. 95 Submission',
      };

      // Act
      const result = parseBiocidesRow(row);

      // Assert
      expect(result.ecNumber).toBeNull();
    });

    it('should_return_null_CAS_number_when_row_has_dash_placeholder', () => {
      // Arrange
      const row: BiocidesRow = {
        'Active Substance Name': 'No CAS Substance',
        'EC no.': '200-001-8',
        'CAS no.': '-',
        'PT': 7,
        'Entity Name': 'Test',
        'Country': 'Netherlands',
        'Supplier Type': 'Substance Supplier',
        'Inclusion Reason': 'RP Participant',
      };

      // Act
      const result = parseBiocidesRow(row);

      // Assert
      expect(result.casNumber).toBeNull();
    });

    it('should_handle_all_product_types_PT1_through_PT22_when_valid', () => {
      // Arrange - test boundary values
      const rowPT1: BiocidesRow = {
        'Active Substance Name': 'PT1 Substance',
        'EC no.': '200-001-1',
        'CAS no.': '1000-00-1',
        'PT': 1,
        'Entity Name': 'Test',
        'Country': 'Germany',
        'Supplier Type': 'Substance Supplier',
        'Inclusion Reason': 'Art. 95 Submission',
      };

      const rowPT22: BiocidesRow = {
        'Active Substance Name': 'PT22 Substance',
        'EC no.': '200-001-22',
        'CAS no.': '1000-00-22',
        'PT': 22,
        'Entity Name': 'Test',
        'Country': 'Germany',
        'Supplier Type': 'Substance Supplier',
        'Inclusion Reason': 'Art. 95 Submission',
      };

      // Act
      const resultPT1 = parseBiocidesRow(rowPT1);
      const resultPT22 = parseBiocidesRow(rowPT22);

      // Assert
      expect(resultPT1.productType).toBe(1);
      expect(resultPT22.productType).toBe(22);
    });

    it('should_return_null_EC_number_when_empty_string', () => {
      // Arrange
      const row: BiocidesRow = {
        'Active Substance Name': 'Empty EC Substance',
        'EC no.': '',
        'CAS no.': '12345-67-8',
        'PT': 10,
        'Entity Name': 'Test',
        'Country': 'Belgium',
        'Supplier Type': 'Product Supplier',
        'Inclusion Reason': 'Art. 95 Submission',
      };

      // Act
      const result = parseBiocidesRow(row);

      // Assert
      expect(result.ecNumber).toBeNull();
    });

    it('should_return_null_for_EC_and_CAS_when_both_are_Not_allocated', () => {
      // Arrange
      const row: BiocidesRow = {
        'Active Substance Name': 'No Identifiers Substance',
        'EC no.': 'Not allocated',
        'CAS no.': 'Not allocated',
        'PT': 14,
        'Entity Name': 'Unknown Corp',
        'Country': 'Austria',
        'Supplier Type': 'Substance & Product Supplier',
        'Inclusion Reason': 'RP Participant',
      };

      // Act
      const result = parseBiocidesRow(row);

      // Assert
      expect(result.ecNumber).toBeNull();
      expect(result.casNumber).toBeNull();
      expect(result.substanceName).toBe('No Identifiers Substance');
    });
  });
});
