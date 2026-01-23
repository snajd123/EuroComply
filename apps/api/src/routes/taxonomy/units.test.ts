// apps/api/src/routes/taxonomy/units.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createUnitsRouter } from './units.js';
import { UnitSystem } from '@eurocomply/database';

// Mock unit data
const mockUnits = [
  { id: '1', code: 'KGM', name: 'Kilogram', symbol: 'kg', system: UnitSystem.MASS, factor: '1', isBase: true, isActive: true },
  { id: '2', code: 'GRM', name: 'Gram', symbol: 'g', system: UnitSystem.MASS, factor: '0.001', isBase: false, isActive: true },
  { id: '3', code: 'MTR', name: 'Metre', symbol: 'm', system: UnitSystem.LENGTH, factor: '1', isBase: true, isActive: true },
];

describe('units routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    const router = createUnitsRouter({
      findAll: async (filter) => {
        let units = [...mockUnits];
        if (filter?.system) {
          units = units.filter(u => u.system === filter.system);
        }
        if (filter?.active !== undefined) {
          units = units.filter(u => u.isActive === filter.active);
        }
        return units;
      },
      findByCode: async (code) => mockUnits.find(u => u.code === code) ?? null,
      findBaseUnit: async (system) => mockUnits.find(u => u.system === system && u.isBase) ?? null,
    });
    app.route('/units', router);
  });

  describe('GET /units', () => {
    it('returns all units', async () => {
      const res = await app.request('/units');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(3);
    });

    it('filters by system', async () => {
      const res = await app.request('/units?system=MASS');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(2);
      expect(data.data.every((u: any) => u.system === 'MASS')).toBe(true);
    });
  });

  describe('GET /units/:code', () => {
    it('returns unit by code', async () => {
      const res = await app.request('/units/KGM');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.code).toBe('KGM');
      expect(data.data.name).toBe('Kilogram');
    });

    it('returns 404 for unknown code', async () => {
      const res = await app.request('/units/XXX');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /units/convert', () => {
    it('converts between units', async () => {
      const res = await app.request('/units/convert?from=GRM&to=KGM&value=500');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.from.val).toBe(500);
      expect(data.data.from.unit).toBe('GRM');
      expect(data.data.to.val).toBeCloseTo(0.5, 10);
      expect(data.data.to.unit).toBe('KGM');
    });

    it('returns 400 for missing parameters', async () => {
      const res = await app.request('/units/convert?from=GRM&to=KGM');
      expect(res.status).toBe(400);
    });

    it('returns 400 for cross-system conversion', async () => {
      const res = await app.request('/units/convert?from=KGM&to=MTR&value=1');
      expect(res.status).toBe(400);
    });
  });
});
