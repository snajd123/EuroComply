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
  smiles?: string;
  inchiKey?: string;
  iupacName?: string;
  echaUrl?: string;
  isActive: boolean;
  /** Regulatory list memberships (SVHC, restricted, etc.) */
  regulatoryLists?: string[];
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
    search?: string;
    active?: boolean;
    /** Filter by regulatory list identifier (e.g., 'ECHA_SVHC_CANDIDATE') */
    listIdentifier?: string;
  }): Promise<SubstanceData[]>;
  findByCasNumber(cas: string): Promise<SubstanceData | null>;
  findAliases(substanceId: string): Promise<SubstanceAliasData[]>;
  /** Find substances that appear on any regulatory list */
  findRegulated(): Promise<SubstanceData[]>;
}

// ============================================================================
// Schemas
// ============================================================================

const querySchema = z.object({
  search: z.string().optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  /** Filter by regulatory list identifier (e.g., 'ECHA_SVHC_CANDIDATE') */
  list: z.string().optional(),
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
    if (query.search) filter.search = query.search;
    if (query.active !== undefined) filter.active = query.active;
    if (query.list) filter.listIdentifier = query.list;

    const substances = await repo.findAll(filter);

    return success(c, substances, { total: substances.length });
  });

  // GET /substances/regulated - Get all substances on any regulatory list
  // Note: Must be before /:casNumber to avoid matching "regulated" as a CAS number
  router.get('/regulated', async (c) => {
    const substances = await repo.findRegulated();

    // Group by regulatory list
    const listCounts: Record<string, number> = {};
    for (const s of substances) {
      for (const list of s.regulatoryLists ?? []) {
        listCounts[list] = (listCounts[list] ?? 0) + 1;
      }
    }

    return success(c, {
      substances,
      listCounts,
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
