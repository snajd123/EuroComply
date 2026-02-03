// packages/gsr/src/parsers/cosing.parser.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseCosingAnnexII,
  parseCosingAnnexIII,
  parseCosingAnnexIV,
  parseCosingAnnexV,
  parseCosingAnnexVI,
  type CosingAnnexIIRow,
  type CosingAnnexIIIRow,
  type CosingAnnexIVRow,
  type CosingAnnexVRow,
  type CosingAnnexVIRow,
  type ParsedCosingEntry,
} from './cosing.parser.js';
import { CosmeticRestrictionType } from '../entities/SubstanceCosing.js';

describe('CosingParser', () => {
  describe('parseCosingAnnexII', () => {
    it('should_parse_valid_annex_ii_row_when_all_fields_present', () => {
      const row: CosingAnnexIIRow = {
        'Reference Number': '1',
        'Chemical name / INN': 'Lead acetate',
        'CAS Number': '301-04-2',
        'EC Number': '206-104-4',
        'Regulation': '(EC) No 1223/2009',
        'CMR': '',
        'SCCS opinions': '',
        'Identified INGREDIENTS': 'LEAD ACETATE',
      };

      const result = parseCosingAnnexII(row);

      expect(result).not.toBeNull();
      expect(result!.cosingRef).toBe('II-1');
      expect(result!.inciName).toBe('LEAD ACETATE');
      expect(result!.inciNameNormalized).toBe('lead acetate');
      expect(result!.casNumber).toBe('301-04-2');
      expect(result!.ecNumber).toBe('206-104-4');
      expect(result!.restrictionType).toBe(CosmeticRestrictionType.ANNEX_II);
      expect(result!.isCmr).toBe(false);
      expect(result!.sccsOpinions).toBeNull();
    });

    it('should_set_isCmr_true_when_cmr_field_equals_CMR', () => {
      const row: CosingAnnexIIRow = {
        'Reference Number': '100',
        'Chemical name / INN': 'Formaldehyde',
        'CAS Number': '50-00-0',
        'EC Number': '200-001-8',
        'Regulation': '(EC) No 1223/2009',
        'CMR': 'CMR',
        'SCCS opinions': 'SCCS/1234/12',
        'Identified INGREDIENTS': 'FORMALDEHYDE',
      };

      const result = parseCosingAnnexII(row);

      expect(result).not.toBeNull();
      expect(result!.isCmr).toBe(true);
      expect(result!.sccsOpinions).toEqual(['SCCS/1234/12']);
    });

    it('should_extract_first_inci_name_when_multiple_separated_by_semicolon', () => {
      const row: CosingAnnexIIRow = {
        'Reference Number': '50',
        'Chemical name / INN': 'Some chemical',
        'CAS Number': '7440-43-9',
        'EC Number': '231-152-8',
        'Regulation': '(EC) No 1223/2009',
        'CMR': '',
        'SCCS opinions': '',
        'Identified INGREDIENTS': 'CADMIUM; CD; CADMIUM SULFATE',
      };

      const result = parseCosingAnnexII(row);

      expect(result).not.toBeNull();
      expect(result!.inciName).toBe('CADMIUM');
      expect(result!.inciNameNormalized).toBe('cadmium');
    });

    it('should_return_null_when_reference_number_missing', () => {
      const row: CosingAnnexIIRow = {
        'Reference Number': '',
        'Chemical name / INN': 'Lead acetate',
        'CAS Number': '301-04-2',
        'EC Number': '206-104-4',
        'Regulation': '(EC) No 1223/2009',
        'CMR': '',
        'SCCS opinions': '',
        'Identified INGREDIENTS': 'LEAD ACETATE',
      };

      const result = parseCosingAnnexII(row);
      expect(result).toBeNull();
    });

    it('should_return_null_cas_when_cas_is_dash_placeholder', () => {
      const row: CosingAnnexIIRow = {
        'Reference Number': '10',
        'Chemical name / INN': 'Some mixture',
        'CAS Number': '-',
        'EC Number': '-',
        'Regulation': '(EC) No 1223/2009',
        'CMR': '',
        'SCCS opinions': '',
        'Identified INGREDIENTS': 'MIXTURE A',
      };

      const result = parseCosingAnnexII(row);

      expect(result).not.toBeNull();
      expect(result!.casNumber).toBeNull();
      expect(result!.ecNumber).toBeNull();
    });

    it('should_use_chemical_name_when_identified_ingredients_empty', () => {
      const row: CosingAnnexIIRow = {
        'Reference Number': '25',
        'Chemical name / INN': 'Cadmium and its compounds',
        'CAS Number': '7440-43-9',
        'EC Number': '231-152-8',
        'Regulation': '(EC) No 1223/2009',
        'CMR': '',
        'SCCS opinions': '',
        'Identified INGREDIENTS': '',
      };

      const result = parseCosingAnnexII(row);

      expect(result).not.toBeNull();
      expect(result!.inciName).toBe('CADMIUM AND ITS COMPOUNDS');
      expect(result!.inciNameNormalized).toBe('cadmium and its compounds');
    });

    it('should_parse_multiple_sccs_opinions_when_present', () => {
      const row: CosingAnnexIIRow = {
        'Reference Number': '30',
        'Chemical name / INN': 'Test substance',
        'CAS Number': '123-45-6',
        'EC Number': '200-100-1',
        'Regulation': '(EC) No 1223/2009',
        'CMR': '',
        'SCCS opinions': 'SCCS/1234/12; SCCS/5678/15; SCCS/9999/20',
        'Identified INGREDIENTS': 'TEST SUBSTANCE',
      };

      const result = parseCosingAnnexII(row);

      expect(result).not.toBeNull();
      expect(result!.sccsOpinions).toEqual(['SCCS/1234/12', 'SCCS/5678/15', 'SCCS/9999/20']);
    });
  });

  describe('parseCosingAnnexIII', () => {
    it('should_parse_valid_annex_iii_row_when_all_fields_present', () => {
      const row: CosingAnnexIIIRow = {
        'Reference Number': '15',
        'Chemical name / INN': 'Hydrogen peroxide',
        'Name of Common Ingredients Glossary': 'HYDROGEN PEROXIDE',
        'CAS Number': '7722-84-1',
        'EC Number': '231-765-0',
        'Product Type, body parts': 'Hair products',
        'Maximum concentration in ready for use preparation': '12%',
        'Wording of conditions of use and warnings': 'Only for professional use',
      };

      const result = parseCosingAnnexIII(row);

      expect(result).not.toBeNull();
      expect(result!.cosingRef).toBe('III-15');
      expect(result!.inciName).toBe('HYDROGEN PEROXIDE');
      expect(result!.inciNameNormalized).toBe('hydrogen peroxide');
      expect(result!.casNumber).toBe('7722-84-1');
      expect(result!.ecNumber).toBe('231-765-0');
      expect(result!.restrictionType).toBe(CosmeticRestrictionType.ANNEX_III);
      expect(result!.maxConcentration).toBe(12);
      expect(result!.concentrationUnit).toBe('%');
      expect(result!.restrictionText).toBe('Only for professional use');
    });

    it('should_parse_concentration_with_space_before_percent', () => {
      const row: CosingAnnexIIIRow = {
        'Reference Number': '20',
        'Chemical name / INN': 'Test',
        'Name of Common Ingredients Glossary': 'TEST SUBSTANCE',
        'CAS Number': '100-00-0',
        'EC Number': '200-100-1',
        'Product Type, body parts': 'Skin products',
        'Maximum concentration in ready for use preparation': '0.5 %',
        'Wording of conditions of use and warnings': '',
      };

      const result = parseCosingAnnexIII(row);

      expect(result).not.toBeNull();
      expect(result!.maxConcentration).toBe(0.5);
      expect(result!.concentrationUnit).toBe('%');
    });

    it('should_parse_concentration_in_ppm', () => {
      const row: CosingAnnexIIIRow = {
        'Reference Number': '25',
        'Chemical name / INN': 'Test',
        'Name of Common Ingredients Glossary': 'TEST',
        'CAS Number': '100-00-0',
        'EC Number': '200-100-1',
        'Product Type, body parts': 'Skin',
        'Maximum concentration in ready for use preparation': '500 ppm',
        'Wording of conditions of use and warnings': '',
      };

      const result = parseCosingAnnexIII(row);

      expect(result).not.toBeNull();
      expect(result!.maxConcentration).toBe(500);
      expect(result!.concentrationUnit).toBe('ppm');
    });

    it('should_return_null_concentration_when_not_parseable', () => {
      const row: CosingAnnexIIIRow = {
        'Reference Number': '30',
        'Chemical name / INN': 'Test',
        'Name of Common Ingredients Glossary': 'TEST',
        'CAS Number': '100-00-0',
        'EC Number': '200-100-1',
        'Product Type, body parts': 'All products',
        'Maximum concentration in ready for use preparation': 'As low as possible',
        'Wording of conditions of use and warnings': '',
      };

      const result = parseCosingAnnexIII(row);

      expect(result).not.toBeNull();
      expect(result!.maxConcentration).toBeNull();
      expect(result!.concentrationUnit).toBeNull();
      expect(result!.restrictionText).toBe('As low as possible');
    });

    it('should_extract_first_name_from_glossary_when_semicolon_separated', () => {
      const row: CosingAnnexIIIRow = {
        'Reference Number': '35',
        'Chemical name / INN': 'Multiple names',
        'Name of Common Ingredients Glossary': 'ALPHA NAME; BETA NAME; GAMMA NAME',
        'CAS Number': '100-00-0',
        'EC Number': '200-100-1',
        'Product Type, body parts': '',
        'Maximum concentration in ready for use preparation': '1%',
        'Wording of conditions of use and warnings': '',
      };

      const result = parseCosingAnnexIII(row);

      expect(result).not.toBeNull();
      expect(result!.inciName).toBe('ALPHA NAME');
    });

    it('should_return_null_when_reference_number_missing', () => {
      const row: CosingAnnexIIIRow = {
        'Reference Number': '',
        'Chemical name / INN': 'Test',
        'Name of Common Ingredients Glossary': 'TEST',
        'CAS Number': '100-00-0',
        'EC Number': '200-100-1',
        'Product Type, body parts': '',
        'Maximum concentration in ready for use preparation': '1%',
        'Wording of conditions of use and warnings': '',
      };

      const result = parseCosingAnnexIII(row);
      expect(result).toBeNull();
    });
  });

  describe('parseCosingAnnexIV', () => {
    it('should_parse_valid_annex_iv_colorant_row', () => {
      const row: CosingAnnexIVRow = {
        'Reference Number': '1',
        'Chemical name / INN': 'CI 10006',
        'Name of Common Ingredients Glossary': 'CI 10006',
        'CAS Number': '8004-92-0',
        'EC Number': '231-765-0',
        'Colour': 'Green',
        'Product Type, body parts': 'All cosmetic products',
        'Maximum concentration in ready for use preparation': '',
        'Wording of conditions of use and warnings': '',
      };

      const result = parseCosingAnnexIV(row);

      expect(result).not.toBeNull();
      expect(result!.cosingRef).toBe('IV-1');
      expect(result!.inciName).toBe('CI 10006');
      expect(result!.restrictionType).toBe(CosmeticRestrictionType.ANNEX_IV);
      expect(result!.isCmr).toBe(false);
    });

    it('should_set_restriction_text_from_warnings_when_present', () => {
      const row: CosingAnnexIVRow = {
        'Reference Number': '5',
        'Chemical name / INN': 'CI 11680',
        'Name of Common Ingredients Glossary': 'CI 11680',
        'CAS Number': '2512-29-0',
        'EC Number': '219-730-8',
        'Colour': 'Yellow',
        'Product Type, body parts': 'Rinse-off products only',
        'Maximum concentration in ready for use preparation': '1%',
        'Wording of conditions of use and warnings': 'Not to be used in lip products',
      };

      const result = parseCosingAnnexIV(row);

      expect(result).not.toBeNull();
      expect(result!.restrictionText).toBe('Not to be used in lip products');
      expect(result!.maxConcentration).toBe(1);
    });
  });

  describe('parseCosingAnnexV', () => {
    it('should_parse_valid_annex_v_preservative_row', () => {
      const row: CosingAnnexVRow = {
        'Reference Number': '1',
        'Chemical name / INN': 'Benzoic acid',
        'Name of Common Ingredients Glossary': 'BENZOIC ACID',
        'CAS Number': '65-85-0',
        'EC Number': '200-618-2',
        'Product Type, body parts': 'Leave-on products',
        'Maximum concentration in ready for use preparation': '0.5%',
        'Wording of conditions of use and warnings': '',
      };

      const result = parseCosingAnnexV(row);

      expect(result).not.toBeNull();
      expect(result!.cosingRef).toBe('V-1');
      expect(result!.inciName).toBe('BENZOIC ACID');
      expect(result!.restrictionType).toBe(CosmeticRestrictionType.ANNEX_V);
      expect(result!.maxConcentration).toBe(0.5);
      expect(result!.concentrationUnit).toBe('%');
    });

    it('should_parse_preservative_with_decimal_concentration', () => {
      const row: CosingAnnexVRow = {
        'Reference Number': '10',
        'Chemical name / INN': 'Methylparaben',
        'Name of Common Ingredients Glossary': 'METHYLPARABEN',
        'CAS Number': '99-76-3',
        'EC Number': '202-785-7',
        'Product Type, body parts': 'All products',
        'Maximum concentration in ready for use preparation': '0.4 %',
        'Wording of conditions of use and warnings': '',
      };

      const result = parseCosingAnnexV(row);

      expect(result).not.toBeNull();
      expect(result!.maxConcentration).toBe(0.4);
    });
  });

  describe('parseCosingAnnexVI', () => {
    it('should_parse_valid_annex_vi_uv_filter_row', () => {
      const row: CosingAnnexVIRow = {
        'Reference Number': '1',
        'Chemical name / INN': 'PABA',
        'Name of Common Ingredients Glossary': 'PABA',
        'CAS Number': '150-13-0',
        'EC Number': '205-753-0',
        'Product Type, body parts': 'Sunscreen products',
        'Maximum concentration in ready for use preparation': '5%',
        'Wording of conditions of use and warnings': '',
      };

      const result = parseCosingAnnexVI(row);

      expect(result).not.toBeNull();
      expect(result!.cosingRef).toBe('VI-1');
      expect(result!.inciName).toBe('PABA');
      expect(result!.restrictionType).toBe(CosmeticRestrictionType.ANNEX_VI);
      expect(result!.maxConcentration).toBe(5);
      expect(result!.concentrationUnit).toBe('%');
    });

    it('should_handle_uv_filter_with_warning_text', () => {
      const row: CosingAnnexVIRow = {
        'Reference Number': '20',
        'Chemical name / INN': 'Titanium dioxide (nano)',
        'Name of Common Ingredients Glossary': 'TITANIUM DIOXIDE',
        'CAS Number': '13463-67-7',
        'EC Number': '236-675-5',
        'Product Type, body parts': 'Face and hand products',
        'Maximum concentration in ready for use preparation': '25%',
        'Wording of conditions of use and warnings': 'Not to be used in spray products',
      };

      const result = parseCosingAnnexVI(row);

      expect(result).not.toBeNull();
      expect(result!.restrictionText).toBe('Not to be used in spray products');
      expect(result!.maxConcentration).toBe(25);
    });
  });

  describe('edge cases', () => {
    it('should_handle_whitespace_in_reference_number', () => {
      const row: CosingAnnexIIRow = {
        'Reference Number': '  42  ',
        'Chemical name / INN': 'Test',
        'CAS Number': '100-00-0',
        'EC Number': '200-100-1',
        'Regulation': '',
        'CMR': '',
        'SCCS opinions': '',
        'Identified INGREDIENTS': 'TEST',
      };

      const result = parseCosingAnnexII(row);
      expect(result!.cosingRef).toBe('II-42');
    });

    it('should_normalize_inci_name_correctly_with_special_characters', () => {
      const row: CosingAnnexIIIRow = {
        'Reference Number': '100',
        'Chemical name / INN': 'Test',
        'Name of Common Ingredients Glossary': 'ALPHA-HYDROXY ACID (AHA)',
        'CAS Number': '100-00-0',
        'EC Number': '200-100-1',
        'Product Type, body parts': '',
        'Maximum concentration in ready for use preparation': '1%',
        'Wording of conditions of use and warnings': '',
      };

      const result = parseCosingAnnexIII(row);

      expect(result).not.toBeNull();
      expect(result!.inciName).toBe('ALPHA-HYDROXY ACID (AHA)');
      expect(result!.inciNameNormalized).toBe('alpha-hydroxy acid aha');
    });

    it('should_return_null_ec_number_when_empty', () => {
      const row: CosingAnnexIIRow = {
        'Reference Number': '200',
        'Chemical name / INN': 'Test substance',
        'CAS Number': '100-00-0',
        'EC Number': '',
        'Regulation': '',
        'CMR': '',
        'SCCS opinions': '',
        'Identified INGREDIENTS': 'TEST',
      };

      const result = parseCosingAnnexII(row);

      expect(result).not.toBeNull();
      expect(result!.ecNumber).toBeNull();
    });

    it('should_handle_concentration_with_mg_kg_unit', () => {
      const row: CosingAnnexIIIRow = {
        'Reference Number': '50',
        'Chemical name / INN': 'Test',
        'Name of Common Ingredients Glossary': 'TEST',
        'CAS Number': '100-00-0',
        'EC Number': '200-100-1',
        'Product Type, body parts': '',
        'Maximum concentration in ready for use preparation': '100 mg/kg',
        'Wording of conditions of use and warnings': '',
      };

      const result = parseCosingAnnexIII(row);

      expect(result).not.toBeNull();
      expect(result!.maxConcentration).toBe(100);
      expect(result!.concentrationUnit).toBe('mg/kg');
    });
  });
});
