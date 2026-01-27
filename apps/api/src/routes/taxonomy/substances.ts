import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { success, error } from '../../utils/response.js';

// ============================================================================
// Types
// ============================================================================

export interface SubstanceData {
  id: string;
  casNumber: string;
  ecNumber?: string;
  primaryName: string;
  description?: string;
  molecularWeight?: string;
  molecularFormula?: string;
  isSvhc: boolean;
  requiresAuthorization: boolean;
  isRestricted: boolean;
  restrictionConditions?: string;
  sunsetDate?: Date;
  latestApplicationDate?: Date;
  echaUrl?: string;
  isActive: boolean;
}

export interface SubstanceAliasData {
  id: string;
  substanceId: string;
  name: string;
  type: string;
  language: string;
}

export interface SubstancesRepository {
  findAll(filter?: {
    svhc?: boolean;
    restricted?: boolean;
    authorization?: boolean;
    search?: string;
    active?: boolean;
  }): Promise<SubstanceData[]>;
  findByCasNumber(cas: string): Promise<SubstanceData | null>;
  findAliases(substanceId: string): Promise<SubstanceAliasData[]>;
  findRegulated(): Promise<SubstanceData[]>;
}

// ============================================================================
// Schemas
// ============================================================================

const querySchema = z.object({
  svhc: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  restricted: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  authorization: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  search: z.string().optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

// ============================================================================
// Router
// ============================================================================

export function createSubstancesRouter(repo: SubstancesRepository) {
  const router = new Hono();

  // GET /substances - List all with optional filters
  router.get('/', zValidator('query', querySchema), async (c) => {
    const query = c.req.valid('query');

    const filter: Parameters<typeof repo.findAll>[0] = {};
    if (query.svhc !== undefined) filter.svhc = query.svhc;
    if (query.restricted !== undefined) filter.restricted = query.restricted;
    if (query.authorization !== undefined) filter.authorization = query.authorization;
    if (query.search) filter.search = query.search;
    if (query.active !== undefined) filter.active = query.active;

    const substances = await repo.findAll(filter);

    return success(c, substances, { total: substances.length });
  });

  // GET /substances/regulated - Get all regulated substances (SVHC + Auth + Restricted)
  // Note: Must be before /:casNumber to avoid matching "regulated" as a CAS number
  router.get('/regulated', async (c) => {
    const substances = await repo.findRegulated();

    return success(c, {
      substances,
      counts: {
        svhc: substances.filter(s => s.isSvhc).length,
        authorization: substances.filter(s => s.requiresAuthorization).length,
        restricted: substances.filter(s => s.isRestricted).length,
      },
    }, { total: substances.length });
  });

  // GET /substances/:casNumber - Get single by CAS number
  router.get('/:casNumber', async (c) => {
    const casNumber = c.req.param('casNumber');
    const substance = await repo.findByCasNumber(casNumber);

    if (!substance) {
      return error(c, 'NOT_FOUND', `Substance not found: ${casNumber}`, 404);
    }

    return success(c, substance);
  });

  // GET /substances/:casNumber/aliases - Get aliases for a substance
  router.get('/:casNumber/aliases', async (c) => {
    const casNumber = c.req.param('casNumber');
    const substance = await repo.findByCasNumber(casNumber);

    if (!substance) {
      return error(c, 'NOT_FOUND', `Substance not found: ${casNumber}`, 404);
    }

    const aliases = await repo.findAliases(substance.id);

    return success(c, { aliases, casNumber }, { total: aliases.length });
  });

  return router;
}
