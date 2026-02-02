// packages/gsr/src/parsers/echa-annex-xvii.parser.test.ts
import { describe, it, expect } from 'vitest';
import { EchaAnnexXviiParser, extractThreshold } from './echa-annex-xvii.parser.js';
import { ProductScope } from '../enums/ProductScope.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';

describe('EchaAnnexXviiParser', () => {
  describe('extractThreshold', () => {
    it('should_extract_threshold_when_percent_by_weight', () => {
      const result = extractThreshold('0.1% by weight');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(0.1);
      expect(result!.unit).toBe(ThresholdUnit.PERCENT_BY_WEIGHT);
    });

    it('should_extract_threshold_when_percent_with_space', () => {
      const result = extractThreshold('0.05 %');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(0.05);
      expect(result!.unit).toBe(ThresholdUnit.PERCENT_BY_WEIGHT);
    });

    it('should_extract_threshold_when_percent_without_space', () => {
      const result = extractThreshold('concentration of 0.1%');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(0.1);
      expect(result!.unit).toBe(ThresholdUnit.PERCENT_BY_WEIGHT);
    });

    it('should_extract_threshold_when_mg_per_kg', () => {
      const result = extractThreshold('1 mg/kg');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1);
      expect(result!.unit).toBe(ThresholdUnit.MG_PER_KG);
    });

    it('should_extract_threshold_when_mg_kg_format', () => {
      const result = extractThreshold('50 mg kg');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(50);
      expect(result!.unit).toBe(ThresholdUnit.MG_PER_KG);
    });

    it('should_extract_threshold_when_ppm', () => {
      const result = extractThreshold('100 ppm');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(100);
      expect(result!.unit).toBe(ThresholdUnit.PPM);
    });

    it('should_extract_threshold_when_ppb', () => {
      const result = extractThreshold('1000 ppb');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1000);
      expect(result!.unit).toBe(ThresholdUnit.PPB);
    });

    it('should_extract_threshold_when_mg_per_cm2', () => {
      const result = extractThreshold('0.5 mg/cm2');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(0.5);
      expect(result!.unit).toBe(ThresholdUnit.MG_PER_CM2);
    });

    it('should_return_null_when_no_threshold_found', () => {
      const result = extractThreshold('Shall not be used in certain products');
      expect(result).toBeNull();
    });

    it('should_extract_first_threshold_when_multiple_present', () => {
      const result = extractThreshold('0.1% by weight or 0.05%');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(0.1);
    });

    it('should_handle_decimal_values_correctly', () => {
      const result = extractThreshold('0.0001 %');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(0.0001);
      expect(result!.unit).toBe(ThresholdUnit.PERCENT_BY_WEIGHT);
    });
  });

  describe('parseRow', () => {
    const parser = new EchaAnnexXviiParser();

    it('should_parse_valid_row_when_all_fields_present', () => {
      const row = {
        'Entry No.': '23',
        'Substance Name': 'Cadmium and its compounds',
        'EC No.': '231-152-8',
        'CAS No.': '7440-43-9',
        'Restriction Conditions': 'Shall not be used in mixtures for colouring plastics at concentrations > 0.01% by weight.',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.entryNumber).toBe('23');
      expect(result!.substanceName).toBe('Cadmium and its compounds');
      expect(result!.ecNumber).toBe('231-152-8');
      expect(result!.casNumber).toBe('7440-43-9');
      expect(result!.restrictionConditions).toContain('Shall not be used');
      expect(result!.threshold).toBe(0.01);
      expect(result!.thresholdUnit).toBe(ThresholdUnit.PERCENT_BY_WEIGHT);
    });

    it('should_parse_row_when_CAS_missing', () => {
      const row = {
        'Entry No.': '63',
        'Substance Name': 'Lead and its compounds',
        'EC No.': '231-100-4',
        'CAS No.': '-',
        'Restriction Conditions': 'Shall not be placed on the market if concentration > 0.05%.',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.casNumber).toBeUndefined();
      expect(result!.ecNumber).toBe('231-100-4');
    });

    it('should_return_null_when_entry_number_missing', () => {
      const row = {
        'Entry No.': '',
        'Substance Name': 'Test substance',
        'EC No.': '231-100-4',
        'CAS No.': '7439-92-1',
        'Restriction Conditions': 'Some restriction',
      };

      const result = parser.parseRow(row);
      expect(result).toBeNull();
    });

    it('should_return_null_when_substance_name_missing', () => {
      const row = {
        'Entry No.': '23',
        'Substance Name': '',
        'EC No.': '231-152-8',
        'CAS No.': '7440-43-9',
        'Restriction Conditions': 'Some restriction',
      };

      const result = parser.parseRow(row);
      expect(result).toBeNull();
    });

    it('should_extract_scope_from_restriction_conditions', () => {
      const row = {
        'Entry No.': '51',
        'Substance Name': 'Test substance',
        'EC No.': '200-001-8',
        'CAS No.': '50-00-0',
        'Restriction Conditions': 'Shall not be used in toys or childcare articles at > 0.1%.',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.scopes).toContain(ProductScope.TOYS);
      expect(result!.scopes).toContain(ProductScope.CHILDCARE_ARTICLES);
    });

    it('should_set_all_products_scope_when_no_specific_scope', () => {
      const row = {
        'Entry No.': '28',
        'Substance Name': 'Test substance',
        'EC No.': '200-001-8',
        'CAS No.': '50-00-0',
        'Restriction Conditions': 'Shall not be placed on the market.',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.scopes).toContain(ProductScope.ALL_PRODUCTS);
    });

    it('should_parse_row_without_threshold', () => {
      const row = {
        'Entry No.': '1',
        'Substance Name': 'Polychlorinated terphenyls (PCTs)',
        'EC No.': '262-968-2',
        'CAS No.': '-',
        'Restriction Conditions': 'Shall not be placed on the market, or used.',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.threshold).toBeUndefined();
      expect(result!.thresholdUnit).toBeUndefined();
    });

    it('should_detect_group_entry_flag_for_compound_names', () => {
      const row = {
        'Entry No.': '63',
        'Substance Name': 'Lead and its compounds',
        'EC No.': '231-100-4',
        'CAS No.': '7439-92-1',
        'Restriction Conditions': 'Test restriction.',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.isGroupEntry).toBe(true);
    });

    it('should_not_flag_as_group_entry_for_single_substance', () => {
      const row = {
        'Entry No.': '5',
        'Substance Name': 'Benzene',
        'EC No.': '200-753-7',
        'CAS No.': '71-43-2',
        'Restriction Conditions': 'Test restriction.',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.isGroupEntry).toBe(false);
    });
  });

  describe('parse', () => {
    const parser = new EchaAnnexXviiParser();

    it('should_parse_TSV_content_when_valid', async () => {
      const tsv = `Entry No.\tSubstance Name\tEC No.\tCAS No.\tRestriction Conditions
23\tCadmium\t231-152-8\t7440-43-9\tShall not be used at > 0.01%.
63\tLead\t231-100-4\t7439-92-1\tShall not be used at > 0.05%.`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(2);
      expect(results[0].entryNumber).toBe('23');
      expect(results[0].substanceName).toBe('Cadmium');
      expect(results[1].entryNumber).toBe('63');
      expect(results[1].substanceName).toBe('Lead');
    });

    it('should_skip_invalid_rows_when_parsing', async () => {
      const tsv = `Entry No.\tSubstance Name\tEC No.\tCAS No.\tRestriction Conditions
23\tCadmium\t231-152-8\t7440-43-9\tShall not be used.
\tInvalid\t200-001-8\t50-00-0\tMissing entry number.`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(1);
      expect(results[0].substanceName).toBe('Cadmium');
    });

    it('should_handle_ECHA_metadata_header_lines', async () => {
      const tsv = `Generated from ECHA database
Date: 2026-01-15

Entry No.\tSubstance Name\tEC No.\tCAS No.\tRestriction Conditions
23\tCadmium\t231-152-8\t7440-43-9\tShall not be used.`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(1);
      expect(results[0].substanceName).toBe('Cadmium');
    });

    it('should_return_empty_array_when_no_valid_rows', async () => {
      const tsv = `Entry No.\tSubstance Name\tEC No.\tCAS No.\tRestriction Conditions
\t\t\t\t`;

      const results = await parser.parse(tsv);

      expect(results).toHaveLength(0);
    });
  });

  describe('groupByEntry', () => {
    const parser = new EchaAnnexXviiParser();

    it('should_group_records_by_entry_number', async () => {
      const tsv = `Entry No.\tSubstance Name\tEC No.\tCAS No.\tRestriction Conditions
23\tCadmium\t231-152-8\t7440-43-9\tShall not be used.
23\tCadmium oxide\t215-146-2\t1306-19-0\tShall not be used.
63\tLead\t231-100-4\t7439-92-1\tShall not be used.`;

      const records = await parser.parse(tsv);
      const grouped = parser.groupByEntry(records);

      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped['23']).toHaveLength(2);
      expect(grouped['63']).toHaveLength(1);
    });
  });
});
