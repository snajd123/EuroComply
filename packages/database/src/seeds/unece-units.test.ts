// packages/database/src/seeds/unece-units.test.ts
import { describe, it, expect } from 'vitest';
import { uneceUnits, getUnitsBySystem } from './unece-units.js';
import { UnitSystem } from '../entities/enums/index.js';

describe('UNECE Units Seed Data', () => {
  it('should have mass units', () => {
    const massUnits = getUnitsBySystem(UnitSystem.MASS);
    expect(massUnits.length).toBeGreaterThan(0);

    const kg = massUnits.find(u => u.code === 'KGM');
    expect(kg).toBeDefined();
    expect(kg?.isBase).toBe(true);
    expect(kg?.factor).toBe('1');
  });

  it('should have length units', () => {
    const lengthUnits = getUnitsBySystem(UnitSystem.LENGTH);
    expect(lengthUnits.length).toBeGreaterThan(0);

    const meter = lengthUnits.find(u => u.code === 'MTR');
    expect(meter).toBeDefined();
    expect(meter?.isBase).toBe(true);
  });

  it('should have percentage unit', () => {
    const pctUnits = getUnitsBySystem(UnitSystem.PERCENTAGE);
    const p1 = pctUnits.find(u => u.code === 'P1');
    expect(p1).toBeDefined();
    expect(p1?.symbol).toBe('%');
  });

  it('should have exactly one base unit per system', () => {
    for (const system of Object.values(UnitSystem)) {
      const units = getUnitsBySystem(system as UnitSystem);
      if (units.length === 0) continue; // Some systems may not have units yet

      const baseUnits = units.filter(u => u.isBase);
      expect(baseUnits.length).toBe(1);
    }
  });

  it('should have all required fields', () => {
    for (const unit of uneceUnits) {
      expect(unit.code).toBeDefined();
      expect(unit.code.length).toBeLessThanOrEqual(10);
      expect(unit.name).toBeDefined();
      expect(unit.symbol).toBeDefined();
      expect(unit.system).toBeDefined();
      expect(unit.factor).toBeDefined();
      expect(typeof unit.isBase).toBe('boolean');
    }
  });
});
