// apps/api/src/routes/taxonomy/units.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MikroORM } from '@eurocomply/database';
import { Hono } from 'hono';
import { createUnitsRouter, type UnitsRepository, type UnitData } from './units.js';
import { UnitDefinition, UnitSystem, uneceUnits } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';

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
    for (const unitData of uneceUnits.slice(0, 10)) {
      const unit = em.create(UnitDefinition, {
        code: unitData.code,
        name: unitData.name,
        symbol: unitData.symbol,
        system: unitData.system,
        factor: unitData.factor,
        isBase: unitData.isBase,
        isActive: true,
      });
      em.persist(unit);
    }
    await em.flush();

    // Create repository
    const repo: UnitsRepository = {
      findAll: async (filter) => {
        const qb = orm.em.fork().createQueryBuilder(UnitDefinition);
        if (filter?.system) qb.andWhere({ system: filter.system });
        if (filter?.active !== undefined) qb.andWhere({ isActive: filter.active });
        return qb.getResultList() as unknown as UnitData[];
      },
      findByCode: async (code) => {
        return orm.em.fork().findOne(UnitDefinition, { code }) as unknown as UnitData | null;
      },
      findBaseUnit: async (system) => {
        return orm.em.fork().findOne(UnitDefinition, { system, isBase: true }) as unknown as UnitData | null;
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
    const data = await res.json();
    expect(data.data.length).toBeGreaterThan(0);
  });

  it('should convert units correctly', async () => {
    if (!orm) return;

    const res = await app.request('/units/convert?from=GRM&to=KGM&value=1000');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.to.val).toBeCloseTo(1, 5);
  });
});
