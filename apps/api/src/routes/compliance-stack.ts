/**
 * Compliance Stack API Routes
 *
 * Provides API endpoints for retrieving the effective compliance stack
 * for a tenant category. Uses ComplianceStackResolver to compute the
 * combined regulations and requirements from system and tenant sources.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { ComplianceStackResolver } from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';
import { success, error } from '../utils/response.js';

export interface ComplianceStackRouterOptions {
  orm: MikroORM;
}

const paramsSchema = z.object({
  tenantCategoryId: z.string().min(1),
});

/**
 * Creates the compliance stack router.
 *
 * GET /api/v1/compliance-stack/:tenantCategoryId
 * Returns the effective compliance stack for a tenant category.
 *
 * The compliance stack includes:
 * - Regulations inherited from the linked system category (via LTREE hierarchy)
 * - Requirements for each regulation with their type and severity
 * - Exemption status for each requirement (if any exemptions are active)
 */
export function createComplianceStackRouter(options: ComplianceStackRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  router.get(
    '/:tenantCategoryId',
    authorize('compliance', 'view'),
    zValidator('param', paramsSchema),
    async (c) => {
      const { tenantCategoryId } = c.req.valid('param');
      const schema = c.get('tenantSchema')!;
      const em = orm.em.fork({ schema });

      try {
        const result = await em.transactional(async (txEm) => {
          await txEm.execute(`SET search_path TO "${schema}", public`);
          const resolver = new ComplianceStackResolver(txEm);
          return resolver.resolve(tenantCategoryId);
        });

        return success(c, result);
      } catch (err) {
        // Handle "not found" errors from MikroORM's findOneOrFail
        if (err instanceof Error && err.message.includes('not found')) {
          return error(c, 'NOT_FOUND', 'Tenant category not found', 404);
        }
        throw err;
      }
    }
  );

  return router;
}
