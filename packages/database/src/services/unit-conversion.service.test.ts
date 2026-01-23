import { describe, it, expect, beforeEach } from 'vitest';
import { UnitConversionService, ConversionError } from './unit-conversion.service.js';
import { UnitDefinition } from '../entities/UnitDefinition.js';
import { UnitSystem } from '../entities/enums/index.js';

describe('UnitConversionService', () => {
  let service: UnitConversionService;
  let units: Map<string, UnitDefinition>;

  beforeEach(() => {
    // Create mock units
    units = new Map();

    const kg = new UnitDefinition();
    kg.code = 'KGM';
    kg.name = 'Kilogram';
    kg.symbol = 'kg';
    kg.system = UnitSystem.MASS;
    kg.factor = '1';
    kg.isBase = true;
    units.set('KGM', kg);

    const g = new UnitDefinition();
    g.code = 'GRM';
    g.name = 'Gram';
    g.symbol = 'g';
    g.system = UnitSystem.MASS;
    g.factor = '0.001';
    g.isBase = false;
    units.set('GRM', g);

    const oz = new UnitDefinition();
    oz.code = 'OZA';
    oz.name = 'Ounce';
    oz.symbol = 'oz';
    oz.system = UnitSystem.MASS;
    oz.factor = '0.0283495';
    oz.isBase = false;
    units.set('OZA', oz);

    const m = new UnitDefinition();
    m.code = 'MTR';
    m.name = 'Metre';
    m.symbol = 'm';
    m.system = UnitSystem.LENGTH;
    m.factor = '1';
    m.isBase = true;
    units.set('MTR', m);

    // Create service with mock lookup
    service = new UnitConversionService({
      findUnit: async (code: string) => units.get(code) ?? null,
      findBaseUnit: async (system: UnitSystem) => {
        for (const unit of units.values()) {
          if (unit.system === system && unit.isBase) return unit;
        }
        return null;
      },
    });
  });

  describe('convert', () => {
    it('should convert grams to kilograms', async () => {
      const result = await service.convert(500, 'GRM', 'KGM');
      expect(result.val).toBeCloseTo(0.5, 10);
      expect(result.unit).toBe('KGM');
    });

    it('should convert kilograms to grams', async () => {
      const result = await service.convert(0.5, 'KGM', 'GRM');
      expect(result.val).toBeCloseTo(500, 10);
      expect(result.unit).toBe('GRM');
    });

    it('should convert ounces to kilograms', async () => {
      const result = await service.convert(8, 'OZA', 'KGM');
      expect(result.val).toBeCloseTo(0.226796, 5);
      expect(result.unit).toBe('KGM');
    });

    it('should throw when converting between different systems', async () => {
      await expect(service.convert(1, 'KGM', 'MTR')).rejects.toThrow(ConversionError);
    });

    it('should throw when unit not found', async () => {
      await expect(service.convert(1, 'XXX', 'KGM')).rejects.toThrow(ConversionError);
    });
  });

  describe('toBase', () => {
    it('should convert grams to base unit (kg)', async () => {
      const result = await service.toBase(500, 'GRM');
      expect(result.val).toBeCloseTo(0.5, 10);
      expect(result.unit).toBe('KGM');
    });

    it('should return same value if already base unit', async () => {
      const result = await service.toBase(1, 'KGM');
      expect(result.val).toBe(1);
      expect(result.unit).toBe('KGM');
    });

    it('should throw when base unit not found for system', async () => {
      // Create a unit with no base unit defined for its system
      const orphanUnit = new UnitDefinition();
      orphanUnit.code = 'ORP';
      orphanUnit.system = UnitSystem.TEMPERATURE; // No temp base unit in mock
      orphanUnit.factor = '1';
      orphanUnit.isBase = false;
      units.set('ORP', orphanUnit);

      await expect(service.toBase(1, 'ORP')).rejects.toThrow(ConversionError);
    });
  });

  describe('fromBase', () => {
    it('should convert from base unit (kg) to grams', async () => {
      const result = await service.fromBase(1, UnitSystem.MASS, 'GRM');
      expect(result.val).toBeCloseTo(1000, 5);
      expect(result.unit).toBe('GRM');
    });
  });
});
