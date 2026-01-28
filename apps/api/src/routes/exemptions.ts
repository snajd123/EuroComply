/**
 * Exemptions API Routes
 *
 * Provides API endpoints for managing tenant requirement exemptions.
 * Uses ExemptionService to handle creation/revocation with guardrail checks.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { ExemptionService, ExemptionGuardrailError, TenantRequirementExemption } from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';
import { success, error } from '../utils/response.js';

export interface ExemptionRouterOptions {
  orm: MikroORM;
}

const createExemptionSchema = z.object({
  tenantCategoryId: z.string().min(1, 'Tenant category ID is required'),
  requirementId: z.string().min(1, 'Requirement ID is required'),
  reason: z.string().min(1, 'Reason is required'),
  legalReference: z.string().optional(),
});

const revokeExemptionSchema = z.object({
  revocationReason: z.string().min(1, 'Revocation reason is required'),
});

/**
 * Custom validation hook for zValidator that returns our standard error format.
 */
function validationHook<T>(
  result: { success: true; data: T } | { success: false; error: z.ZodError },
  c: Hono['request'] extends (input: infer C) => unknown ? C : never
): Response | void {
  if (!result.success) {
    const ctx = c as unknown as Parameters<typeof error>[0];
    return error(ctx, 'VALIDATION_ERROR', 'Validation failed', 400, {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
}

/**
 * Serializes a TenantRequirementExemption entity to API response format.
 */
function serializeExemption(exemption: TenantRequirementExemption) {
  return {
    id: exemption.id,
    tenantCategoryId: exemption.tenantCategory?.id ?? (exemption as unknown as { tenant_category_id?: string }).tenant_category_id,
    requirementId: exemption.requirementId,
    reason: exemption.reason,
    legalReference: exemption.legalReference,
    exemptedBy: exemption.exemptedBy,
    exemptedAt: exemption.exemptedAt?.toISOString(),
    revokedAt: exemption.revokedAt?.toISOString(),
    revokedBy: exemption.revokedBy,
    revocationReason: exemption.revocationReason,
  };
}

/**
 * Creates the exemptions router.
 *
 * POST /api/v1/exemptions - Create exemption (requires compliance:edit)
 * GET /api/v1/exemptions/:id - Get exemption by ID (requires compliance:view)
 * GET /api/v1/exemptions - List exemptions with optional filter (requires compliance:view)
 * DELETE /api/v1/exemptions/:id - Revoke exemption (requires compliance:edit)
 */
export function createExemptionRouter(options: ExemptionRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  // POST /exemptions - Create exemption
  router.post(
    '/',
    authorize('compliance', 'edit'),
    zValidator('json', createExemptionSchema, validationHook),
    async (c) => {
      const body = c.req.valid('json');
      const schema = c.get('tenantSchema')!;
      const userId = c.get('userId')!;
      const em = orm.em.fork({ schema });

      try {
        const exemption = await em.transactional(async (txEm) => {
          await txEm.execute(`SET search_path TO "${schema}", public`);

          // Check for existing exemption (active, not revoked)
          const existing = await txEm.findOne(TenantRequirementExemption, {
            tenantCategory: { id: body.tenantCategoryId },
            requirementId: body.requirementId,
            revokedAt: null,
          });

          if (existing) {
            return { error: 'conflict' as const, message: 'An active exemption already exists for this requirement' };
          }

          const service = new ExemptionService(txEm);
          const created = await service.createExemption({
            tenantCategoryId: body.tenantCategoryId,
            requirementId: body.requirementId,
            reason: body.reason,
            legalReference: body.legalReference,
            exemptedBy: userId,
          });

          return { success: true as const, exemption: created };
        });

        if ('error' in exemption && exemption.error === 'conflict') {
          return error(c, 'CONFLICT', exemption.message, 409);
        }

        if ('exemption' in exemption) {
          return success(c, serializeExemption(exemption.exemption), { status: 201 });
        }

        // This should never happen, but TypeScript needs it
        throw new Error('Unexpected transaction result');
      } catch (err) {
        // Use error.name check instead of instanceof for cross-module compatibility
        if (err instanceof Error && err.name === 'ExemptionGuardrailError') {
          const guardrailErr = err as ExemptionGuardrailError;
          return error(c, 'FORBIDDEN', guardrailErr.message, 403, {
            requirementCode: guardrailErr.requirementCode,
            requirementName: guardrailErr.requirementName,
          });
        }
        if (err instanceof Error && err.message.includes('not found')) {
          return error(c, 'NOT_FOUND', err.message, 404);
        }
        throw err;
      }
    }
  );

  // GET /exemptions/:id - Get exemption by ID
  router.get(
    '/:id',
    authorize('compliance', 'view'),
    async (c) => {
      const id = c.req.param('id');
      const schema = c.get('tenantSchema')!;
      const em = orm.em.fork({ schema });

      const exemption = await em.transactional(async (txEm) => {
        await txEm.execute(`SET search_path TO "${schema}", public`);
        return txEm.findOne(TenantRequirementExemption, { id }, { populate: ['tenantCategory'] });
      });

      if (!exemption) {
        return error(c, 'NOT_FOUND', 'Exemption not found', 404);
      }

      return success(c, serializeExemption(exemption));
    }
  );

  // GET /exemptions - List exemptions (with optional filter)
  router.get(
    '/',
    authorize('compliance', 'view'),
    async (c) => {
      const schema = c.get('tenantSchema')!;
      const tenantCategoryId = c.req.query('tenantCategoryId');
      const em = orm.em.fork({ schema });

      const exemptions = await em.transactional(async (txEm) => {
        await txEm.execute(`SET search_path TO "${schema}", public`);
        const where: Record<string, unknown> = {};
        if (tenantCategoryId) {
          where.tenantCategory = { id: tenantCategoryId };
        }
        return txEm.find(TenantRequirementExemption, where, { populate: ['tenantCategory'] });
      });

      return success(c, exemptions.map(serializeExemption));
    }
  );

  // DELETE /exemptions/:id - Revoke exemption
  router.delete(
    '/:id',
    authorize('compliance', 'edit'),
    zValidator('json', revokeExemptionSchema, validationHook),
    async (c) => {
      const id = c.req.param('id');
      const { revocationReason } = c.req.valid('json');
      const schema = c.get('tenantSchema')!;
      const userId = c.get('userId')!;
      const em = orm.em.fork({ schema });

      try {
        const exemption = await em.transactional(async (txEm) => {
          await txEm.execute(`SET search_path TO "${schema}", public`);
          const service = new ExemptionService(txEm);
          return service.revokeExemption(id, userId, revocationReason);
        });

        return success(c, serializeExemption(exemption));
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return error(c, 'NOT_FOUND', 'Exemption not found', 404);
        }
        throw err;
      }
    }
  );

  return router;
}
