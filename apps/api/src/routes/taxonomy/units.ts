// apps/api/src/routes/taxonomy/units.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { UnitSystem, UnitConversionService, type UnitLookup, type UnitInfo } from '@eurocomply/database';

// ============================================================================
// Types
// ============================================================================

export interface UnitData {
  id: string;
  code: string;
  name: string;
  symbol: string;
  system: UnitSystem;
  factor: string;
  isBase: boolean;
  isActive: boolean;
}

export interface UnitsRepository {
  findAll(filter?: { system?: UnitSystem; active?: boolean }): Promise<UnitData[]>;
  findByCode(code: string): Promise<UnitData | null>;
  findBaseUnit(system: UnitSystem): Promise<UnitData | null>;
}

// ============================================================================
// Schemas
// ============================================================================

const listUnitsQuery = z.object({
  system: z.nativeEnum(UnitSystem).optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

const convertQuery = z.object({
  from: z.string().min(1).max(10),
  to: z.string().min(1).max(10),
  value: z.string().transform(v => parseFloat(v)).refine(v => !isNaN(v), 'value must be a number'),
});

// ============================================================================
// Router
// ============================================================================

export function createUnitsRouter(repo: UnitsRepository) {
  const router = new Hono();

  // Create unit lookup adapter for conversion service
  const lookup: UnitLookup = {
    findUnit: async (code): Promise<UnitInfo | null> => {
      const unit = await repo.findByCode(code);
      if (!unit) return null;
      return {
        code: unit.code,
        system: unit.system,
        factor: unit.factor,
        isBase: unit.isBase,
      };
    },
    findBaseUnit: async (system): Promise<UnitInfo | null> => {
      const unit = await repo.findBaseUnit(system);
      if (!unit) return null;
      return {
        code: unit.code,
        system: unit.system,
        factor: unit.factor,
        isBase: unit.isBase,
      };
    },
  };

  const conversionService = new UnitConversionService(lookup);

  // GET /units - List all units
  router.get('/', zValidator('query', listUnitsQuery), async (c) => {
    const query = c.req.valid('query');
    const units = await repo.findAll({
      system: query.system,
      active: query.active,
    });

    return c.json({
      data: units,
      meta: { total: units.length },
    });
  });

  // GET /units/convert - Convert between units
  // Note: Must be before /:code to avoid matching "convert" as a code
  router.get('/convert', zValidator('query', convertQuery), async (c) => {
    const { from, to, value } = c.req.valid('query');

    try {
      const result = await conversionService.convert(value, from, to);

      return c.json({
        data: {
          from: { val: value, unit: from },
          to: { val: result.val, unit: result.unit },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Conversion failed';
      return c.json({ error: 'Bad Request', message }, 400);
    }
  });

  // GET /units/:code - Get unit by UNECE code
  router.get('/:code', async (c) => {
    const code = c.req.param('code').toUpperCase();
    const unit = await repo.findByCode(code);

    if (!unit) {
      return c.json({ error: 'Not Found', message: `Unit not found: ${code}` }, 404);
    }

    return c.json({ data: unit });
  });

  return router;
}
