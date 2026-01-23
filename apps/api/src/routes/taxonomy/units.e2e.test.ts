// apps/api/src/routes/taxonomy/units.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MikroORM } from '@eurocomply/database';
import { Hono } from 'hono';
import { createUnitsRouter, type UnitsRepository, type UnitData } from './units.js';
import { UnitDefinition, UnitSystem, uneceUnits } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';

interface ApiResponse<T> {
  data: T;
  meta?: { total: number };
}

interface ConversionData {
  from: { val: number; unit: string };
  to: { val: number; unit: string };
}

describe('Units API E2E', () => {
  let orm: MikroORM;
  let app: Hono;

  beforeAll(async () => {
    // Skip if no test database available
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();

    // Seed test units
    const em = orm.em.fork();
    const now = new Date();
    for (const unitData of uneceUnits.slice(0, 10)) {
      const unit = em.create(UnitDefinition, {
        code: unitData.code,
        name: unitData.name,
        symbol: unitData.symbol,
        system: unitData.system,
        factor: unitData.factor,
        isBase: unitData.isBase,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      em.persist(unit);
    }
    await em.flush();

    // Create repository - map entities to UnitData interface
    const repo: UnitsRepository = {
      findAll: async (filter): Promise<UnitData[]> => {
        const qb = orm.em.fork().createQueryBuilder(UnitDefinition);
        if (filter?.system) qb.andWhere({ system: filter.system });
        if (filter?.active !== undefined) qb.andWhere({ isActive: filter.active });
        const units = await qb.getResultList();
        return units.map((u) => ({
          id: u.id,
          code: u.code,
          name: u.name,
          symbol: u.symbol,
          system: u.system,
          factor: u.factor,
          isBase: u.isBase,
          isActive: u.isActive,
        }));
      },
      findByCode: async (code): Promise<UnitData | null> => {
        const unit = await orm.em.fork().findOne(UnitDefinition, { code });
        if (!unit) return null;
        return {
          id: unit.id,
          code: unit.code,
          name: unit.name,
          symbol: unit.symbol,
          system: unit.system,
          factor: unit.factor,
          isBase: unit.isBase,
          isActive: unit.isActive,
        };
      },
      findBaseUnit: async (system): Promise<UnitData | null> => {
        const unit = await orm.em.fork().findOne(UnitDefinition, { system, isBase: true });
        if (!unit) return null;
        return {
          id: unit.id,
          code: unit.code,
          name: unit.name,
          symbol: unit.symbol,
          system: unit.system,
          factor: unit.factor,
          isBase: unit.isBase,
          isActive: unit.isActive,
        };
      },
    };

    app = new Hono();
    app.route('/units', createUnitsRouter(repo));
  });

  afterAll(async () => {
    if (orm) {
      // Clean up test data
      try {
        await orm.em.fork().nativeDelete(UnitDefinition, {});
      } catch {
        // Ignore cleanup errors
      }
      await teardownTestDb();
    }
  });

  it('should list units from database', async () => {
    if (!orm) return; // Skip if no database

    const res = await app.request('/units');
    expect(res.status).toBe(200);
    const body = await res.json() as ApiResponse<UnitData[]>;
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('should convert units correctly', async () => {
    if (!orm) return;

    const res = await app.request('/units/convert?from=GRM&to=KGM&value=1000');
    expect(res.status).toBe(200);
    const body = await res.json() as ApiResponse<ConversionData>;
    expect(body.data.to.val).toBeCloseTo(1, 5);
  });
});
