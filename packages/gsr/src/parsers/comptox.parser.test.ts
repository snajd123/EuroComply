// packages/gsr/src/parsers/comptox.parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseComptoxRow, type ComptoxRow, type ParsedComptoxSubstance } from './comptox.parser.js';

describe('ComptoxParser', () => {
  describe('parseComptoxRow', () => {
    it('should_parse_complete_data_when_all_fields_present', () => {
      const row: ComptoxRow = {
        DTXSID: 'DTXSID7020182',
        PREFERRED_NAME: 'Benzene',
        CASRN: '71-43-2',
        INCHIKEY: 'UHOVQNZJYSORNB-UHFFFAOYSA-N',
        IUPAC_NAME: 'benzene',
        SMILES: 'C1=CC=CC=C1',
        MOLECULAR_FORMULA: 'C6H6',
        AVERAGE_MASS: '78.1134',
        DTXCID: 'DTXCID30182',
        QSAR_READY_SMILES: 'c1ccccc1',
        MS_READY_SMILES: 'c1ccccc1',
        IDENTIFIER: 'DTXSID7020182',
      };

      const result = parseComptoxRow(row);

      expect(result.dtxsid).toBe('DTXSID7020182');
      expect(result.canonicalName).toBe('Benzene');
      expect(result.casNumber).toBe('71-43-2');
      expect(result.inchiKey).toBe('UHOVQNZJYSORNB-UHFFFAOYSA-N');
      expect(result.iupacName).toBe('benzene');
      expect(result.smiles).toBe('C1=CC=CC=C1');
      expect(result.molecularFormula).toBe('C6H6');
      expect(result.molecularWeight).toBe(78.1134);
    });

    it('should_return_null_for_optional_fields_when_empty_strings', () => {
      const row: ComptoxRow = {
        DTXSID: 'DTXSID1234567',
        PREFERRED_NAME: 'Unknown Compound',
        CASRN: '',
        INCHIKEY: '',
        IUPAC_NAME: '',
        SMILES: '',
        MOLECULAR_FORMULA: '',
        AVERAGE_MASS: '',
      };

      const result = parseComptoxRow(row);

      expect(result.dtxsid).toBe('DTXSID1234567');
      expect(result.canonicalName).toBe('Unknown Compound');
      expect(result.casNumber).toBeNull();
      expect(result.inchiKey).toBeNull();
      expect(result.iupacName).toBeNull();
      expect(result.smiles).toBeNull();
      expect(result.molecularFormula).toBeNull();
      expect(result.molecularWeight).toBeNull();
    });

    it('should_return_null_molecular_weight_when_invalid_value', () => {
      const row: ComptoxRow = {
        DTXSID: 'DTXSID9876543',
        PREFERRED_NAME: 'Test Substance',
        CASRN: '7440-43-9',
        INCHIKEY: 'BDOSMKKIYDBER-UHFFFAOYSA-N',
        IUPAC_NAME: 'cadmium',
        SMILES: '[Cd]',
        MOLECULAR_FORMULA: 'Cd',
        AVERAGE_MASS: 'N/A',
      };

      const result = parseComptoxRow(row);

      expect(result.molecularWeight).toBeNull();
    });

    it('should_return_null_molecular_weight_when_non_numeric', () => {
      const row: ComptoxRow = {
        DTXSID: 'DTXSID9876543',
        PREFERRED_NAME: 'Test Substance',
        CASRN: '7440-43-9',
        INCHIKEY: 'BDOSMKKIYDBER-UHFFFAOYSA-N',
        IUPAC_NAME: 'cadmium',
        SMILES: '[Cd]',
        MOLECULAR_FORMULA: 'Cd',
        AVERAGE_MASS: 'unknown',
      };

      const result = parseComptoxRow(row);

      expect(result.molecularWeight).toBeNull();
    });

    it('should_trim_whitespace_from_all_fields_when_present', () => {
      const row: ComptoxRow = {
        DTXSID: '  DTXSID7020182  ',
        PREFERRED_NAME: '  Benzene  ',
        CASRN: '  71-43-2  ',
        INCHIKEY: '  UHOVQNZJYSORNB-UHFFFAOYSA-N  ',
        IUPAC_NAME: '  benzene  ',
        SMILES: '  C1=CC=CC=C1  ',
        MOLECULAR_FORMULA: '  C6H6  ',
        AVERAGE_MASS: '  78.1134  ',
      };

      const result = parseComptoxRow(row);

      expect(result.dtxsid).toBe('DTXSID7020182');
      expect(result.canonicalName).toBe('Benzene');
      expect(result.casNumber).toBe('71-43-2');
      expect(result.inchiKey).toBe('UHOVQNZJYSORNB-UHFFFAOYSA-N');
      expect(result.iupacName).toBe('benzene');
      expect(result.smiles).toBe('C1=CC=CC=C1');
      expect(result.molecularFormula).toBe('C6H6');
      expect(result.molecularWeight).toBe(78.1134);
    });

    it('should_handle_CAS_number_with_invalid_checksum_when_sanitize_fails', () => {
      // Invalid CAS checksum - sanitizeCas will return null
      const row: ComptoxRow = {
        DTXSID: 'DTXSID1234567',
        PREFERRED_NAME: 'Test Substance',
        CASRN: '71-43-9', // Invalid checksum (should be 2)
        INCHIKEY: '',
        IUPAC_NAME: '',
        SMILES: '',
        MOLECULAR_FORMULA: '',
        AVERAGE_MASS: '',
      };

      const result = parseComptoxRow(row);

      // sanitizeCas returns null for invalid CAS, so casNumber should be null
      expect(result.casNumber).toBeNull();
    });

    it('should_parse_molecular_weight_with_decimal_precision_when_valid', () => {
      const row: ComptoxRow = {
        DTXSID: 'DTXSID7020182',
        PREFERRED_NAME: 'Lead dioxide',
        CASRN: '1309-60-0',
        INCHIKEY: '',
        IUPAC_NAME: '',
        SMILES: '',
        MOLECULAR_FORMULA: 'PbO2',
        AVERAGE_MASS: '239.1988',
      };

      const result = parseComptoxRow(row);

      expect(result.molecularWeight).toBe(239.1988);
    });

    it('should_handle_missing_optional_properties_when_undefined', () => {
      const row: ComptoxRow = {
        DTXSID: 'DTXSID7020182',
        PREFERRED_NAME: 'Test',
        CASRN: '',
        INCHIKEY: '',
        IUPAC_NAME: '',
        SMILES: '',
        MOLECULAR_FORMULA: '',
        AVERAGE_MASS: '',
        // Optional properties DTXCID, QSAR_READY_SMILES, MS_READY_SMILES, IDENTIFIER are omitted
      };

      const result = parseComptoxRow(row);

      expect(result.dtxsid).toBe('DTXSID7020182');
      expect(result.canonicalName).toBe('Test');
    });

    it('should_return_null_for_CAS_when_placeholder_value', () => {
      const testCases = ['-', 'N/A', 'n/a', 'not available', 'Not Applicable'];

      for (const casValue of testCases) {
        const row: ComptoxRow = {
          DTXSID: 'DTXSID1234567',
          PREFERRED_NAME: 'Test',
          CASRN: casValue,
          INCHIKEY: '',
          IUPAC_NAME: '',
          SMILES: '',
          MOLECULAR_FORMULA: '',
          AVERAGE_MASS: '',
        };

        const result = parseComptoxRow(row);

        expect(result.casNumber).toBeNull();
      }
    });

    it('should_return_null_qcLevel_when_not_available', () => {
      // qcLevel is defined in the interface but not typically in raw CSV data
      const row: ComptoxRow = {
        DTXSID: 'DTXSID7020182',
        PREFERRED_NAME: 'Benzene',
        CASRN: '71-43-2',
        INCHIKEY: '',
        IUPAC_NAME: '',
        SMILES: '',
        MOLECULAR_FORMULA: '',
        AVERAGE_MASS: '',
      };

      const result = parseComptoxRow(row);

      expect(result.qcLevel).toBeNull();
    });
  });
});
