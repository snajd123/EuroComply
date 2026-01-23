import { describe, it, expect } from 'vitest';
import { UnitDefinition } from './UnitDefinition.js';
import { UnitSystem } from './enums/index.js';

describe('UnitDefinition', () => {
  it('should create a unit with UNECE code', () => {
    const unit = new UnitDefinition();
    unit.code = 'KGM';
    unit.name = 'Kilogram';
    unit.symbol = 'kg';
    unit.system = UnitSystem.MASS;
    unit.factor = '1';
    unit.isBase = true;
    unit.isActive = true;

    expect(unit.code).toBe('KGM');
    expect(unit.system).toBe(UnitSystem.MASS);
    expect(unit.isBase).toBe(true);
  });

  it('should have correct factor for conversion', () => {
    const gram = new UnitDefinition();
    gram.code = 'GRM';
    gram.name = 'Gram';
    gram.symbol = 'g';
    gram.system = UnitSystem.MASS;
    gram.factor = '0.001';
    gram.isBase = false;

    expect(gram.factor).toBe('0.001');
  });
});
