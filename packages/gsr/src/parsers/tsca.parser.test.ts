// packages/gsr/src/parsers/tsca.parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseTscaRow, type TscaRow, type ParsedTscaEntry } from './tsca.parser.js';
import { TscaInventoryStatus } from '../entities/SubstanceTsca.js';

describe('TscaParser', () => {
  describe('parseTscaRow', () => {
    it('should_parse_active_substance_when_ACTIVITY_is_ACTIVE', () => {
      const row: TscaRow = {
        ID: '1',
        CASRN: '71-43-2',
        ChemName: 'Benzene',
        ACTIVITY: 'ACTIVE',
      };

      const result = parseTscaRow(row);

      expect(result.tscaCas).toBe('71-43-2');
      expect(result.chemName).toBe('Benzene');
      expect(result.inventoryStatus).toBe(TscaInventoryStatus.ACTIVE);
      expect(result.isUvcb).toBe(false);
      expect(result.hasRestrictions).toBe(false);
      expect(result.flags).toEqual([]);
    });

    it('should_parse_inactive_substance_when_ACTIVITY_is_INACTIVE', () => {
      const row: TscaRow = {
        ID: '2',
        CASRN: '7440-43-9',
        ChemName: 'Cadmium',
        ACTIVITY: 'INACTIVE',
      };

      const result = parseTscaRow(row);

      expect(result.tscaCas).toBe('7440-43-9');
      expect(result.chemName).toBe('Cadmium');
      expect(result.inventoryStatus).toBe(TscaInventoryStatus.INACTIVE);
    });

    it('should_parse_UVCB_substance_when_UVCB_flag_present', () => {
      const row: TscaRow = {
        ID: '3',
        CASRN: '64742-53-6',
        ChemName: 'Distillates (petroleum), hydrotreated light naphthenic',
        ACTIVITY: 'ACTIVE',
        UVCB: 'UVCB',
      };

      const result = parseTscaRow(row);

      expect(result.isUvcb).toBe(true);
      expect(result.chemName).toBe('Distillates (petroleum), hydrotreated light naphthenic');
    });

    it('should_parse_flags_when_FLAG_field_contains_values', () => {
      const row: TscaRow = {
        ID: '4',
        CASRN: '1309-60-0',
        ChemName: 'Lead dioxide',
        ACTIVITY: 'ACTIVE',
        FLAG: 'S',
      };

      const result = parseTscaRow(row);

      expect(result.hasRestrictions).toBe(true);
      expect(result.flags).toContain('S');
    });

    it('should_parse_multiple_flags_when_FLAG_field_contains_comma_separated_values', () => {
      const row: TscaRow = {
        ID: '5',
        CASRN: '50-00-0',
        ChemName: 'Formaldehyde',
        ACTIVITY: 'ACTIVE',
        FLAG: 'S,P,XU',
      };

      const result = parseTscaRow(row);

      expect(result.flags).toEqual(['S', 'P', 'XU']);
      expect(result.hasRestrictions).toBe(true);
    });

    it('should_trim_whitespace_from_all_fields_when_present', () => {
      const row: TscaRow = {
        ID: '  6  ',
        CASRN: '  71-43-2  ',
        ChemName: '  Benzene  ',
        ACTIVITY: '  ACTIVE  ',
      };

      const result = parseTscaRow(row);

      expect(result.tscaCas).toBe('71-43-2');
      expect(result.chemName).toBe('Benzene');
      expect(result.inventoryStatus).toBe(TscaInventoryStatus.ACTIVE);
    });

    it('should_default_to_INACTIVE_when_ACTIVITY_is_unrecognized', () => {
      const row: TscaRow = {
        ID: '7',
        CASRN: '7440-43-9',
        ChemName: 'Unknown status substance',
        ACTIVITY: 'UNKNOWN',
      };

      const result = parseTscaRow(row);

      expect(result.inventoryStatus).toBe(TscaInventoryStatus.INACTIVE);
    });

    it('should_set_isUvcb_to_false_when_UVCB_is_empty_or_undefined', () => {
      const row: TscaRow = {
        ID: '8',
        CASRN: '71-43-2',
        ChemName: 'Benzene',
        ACTIVITY: 'ACTIVE',
        UVCB: '',
      };

      const result = parseTscaRow(row);

      expect(result.isUvcb).toBe(false);
    });

    it('should_set_hasRestrictions_to_false_when_FLAG_does_not_contain_S', () => {
      const row: TscaRow = {
        ID: '9',
        CASRN: '71-43-2',
        ChemName: 'Benzene',
        ACTIVITY: 'ACTIVE',
        FLAG: 'P,XU',
      };

      const result = parseTscaRow(row);

      expect(result.hasRestrictions).toBe(false);
      expect(result.flags).toEqual(['P', 'XU']);
    });

    it('should_handle_casregno_field_as_alternative_CAS_source', () => {
      const row: TscaRow = {
        ID: '10',
        CASRN: '',
        casregno: '7440-43-9',
        ChemName: 'Cadmium',
        ACTIVITY: 'ACTIVE',
      };

      const result = parseTscaRow(row);

      // When CASRN is empty, should use casregno
      expect(result.tscaCas).toBe('7440-43-9');
    });

    it('should_prefer_CASRN_over_casregno_when_both_present', () => {
      const row: TscaRow = {
        ID: '11',
        CASRN: '71-43-2',
        casregno: '7440-43-9',
        ChemName: 'Test substance',
        ACTIVITY: 'ACTIVE',
      };

      const result = parseTscaRow(row);

      expect(result.tscaCas).toBe('71-43-2');
    });

    it('should_handle_empty_FLAG_field_when_present_but_empty', () => {
      const row: TscaRow = {
        ID: '12',
        CASRN: '71-43-2',
        ChemName: 'Benzene',
        ACTIVITY: 'ACTIVE',
        FLAG: '',
      };

      const result = parseTscaRow(row);

      expect(result.flags).toEqual([]);
      expect(result.hasRestrictions).toBe(false);
    });

    it('should_handle_flags_with_whitespace_when_parsing_comma_separated', () => {
      const row: TscaRow = {
        ID: '13',
        CASRN: '50-00-0',
        ChemName: 'Formaldehyde',
        ACTIVITY: 'ACTIVE',
        FLAG: ' S , P , XU ',
      };

      const result = parseTscaRow(row);

      expect(result.flags).toEqual(['S', 'P', 'XU']);
      expect(result.hasRestrictions).toBe(true);
    });
  });
});
