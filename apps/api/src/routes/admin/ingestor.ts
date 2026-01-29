/**
 * Admin Ingestor API Routes
 *
 * Platform admin endpoints for AI regulation ingestion:
 * - POST /extract: Trigger extraction from URL
 * - GET /staging: List staging regulations
 * - GET /staging/:id: Get staging regulation with requirements
 * - PATCH /staging/:id/requirements/:reqId: Edit requirement
 * - POST /staging/:id/approve: Approve requirements
 * - POST /staging/:id/bulk-approve: Approve all MATCH requirements
 * - DELETE /staging/:id: Reject and remove
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@eurocomply/database';
import { StagingService, StagingStatus, PublishService } from '@eurocomply/database';
import type { Env } from '../../app.js';
import { success, error } from '../../utils/response.js';

export interface IngestorRouterOptions {
  orm: MikroORM;
}

const extractSchema = z.object({
  sourceUrl: z.string().url(),
  sourceType: z.enum(['EUR_LEX', 'ECHA', 'MANUAL']),
  documentText: z.string().optional(), // For manual paste
});

const approveSchema = z.object({
  requirementIds: z.array(z.string()).min(1),
});

const editRequirementSchema = z.object({
  thresholdValue: z.number().optional(),
  unit: z.string().optional(),
  operator: z.enum(['GT', 'GTE', 'LT', 'LTE', 'EQ', 'PRESENT', 'ABSENT']).optional(),
  scope: z.array(z.string()).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PARTIALLY_APPROVED', 'PUBLISHED']).optional(),
  sourceType: z.enum(['EUR_LEX', 'ECHA', 'MANUAL']).optional(),
});

export function createIngestorRouter(options: IngestorRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  /**
   * GET /staging
   * List all staging regulations with optional filters
   */
  router.get(
    '/staging',
    zValidator('query', listQuerySchema),
    async (c) => {
      const query = c.req.valid('query');
      const em = orm.em.fork();
      const service = new StagingService(em);

      const regulations = await service.listStagingRegulations({
        status: query.status as StagingStatus | undefined,
        sourceType: query.sourceType as 'EUR_LEX' | 'ECHA' | 'MANUAL' | undefined,
      });

      return success(c, regulations.map(reg => ({
        id: reg.id,
        code: reg.code,
        name: reg.name,
        sourceType: reg.sourceType,
        status: reg.status,
        createdAt: reg.createdAt.toISOString(),
        requirementCount: reg.requirements.length,
      })), { total: regulations.length });
    }
  );

  /**
   * GET /staging/:id
   * Get a staging regulation with all its requirements
   */
  router.get(
    '/staging/:id',
    async (c) => {
      const { id } = c.req.param();
      const em = orm.em.fork();
      const service = new StagingService(em);

      const regulation = await service.getStagingRegulation(id);
      if (!regulation) {
        return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
      }

      return success(c, {
        id: regulation.id,
        code: regulation.code,
        name: regulation.name,
        sourceUrl: regulation.sourceUrl,
        sourceType: regulation.sourceType,
        status: regulation.status,
        createdAt: regulation.createdAt.toISOString(),
        primaryPayload: regulation.primaryPayload,
        shadowPayload: regulation.shadowPayload,
        requirements: regulation.requirements.getItems().map(req => ({
          id: req.id,
          code: req.code,
          name: req.name,
          substanceName: req.substanceName,
          casNumber: req.casNumber,
          operator: req.operator,
          thresholdValue: req.thresholdValue,
          unit: req.unit,
          scope: req.scope,
          legalReference: req.legalReference,
          pdfCoordinates: req.pdfCoordinates,
          type: req.type,
          severity: req.severity,
          confidenceScore: req.confidenceScore,
          reasoning: req.reasoning,
          consensusStatus: req.consensusStatus,
          conflictDetails: req.conflictDetails,
          isApproved: req.isApproved,
          approvedBy: req.approvedBy,
          approvedAt: req.approvedAt?.toISOString(),
        })),
      });
    }
  );

  /**
   * POST /extract
   * Trigger extraction from a source URL
   * NOTE: Actual extraction requires API keys configured
   */
  router.post(
    '/extract',
    zValidator('json', extractSchema),
    async (c) => {
      const body = c.req.valid('json');

      // For now, return a placeholder - actual extraction implemented in Task 18
      return success(c, {
        message: 'Extraction queued',
        sourceUrl: body.sourceUrl,
        sourceType: body.sourceType,
      }, { status: 202 });
    }
  );

  /**
   * PATCH /staging/:id/requirements/:reqId
   * Edit a specific requirement
   */
  router.patch(
    '/staging/:id/requirements/:reqId',
    zValidator('json', editRequirementSchema),
    async (c) => {
      const { id, reqId } = c.req.param();
      const body = c.req.valid('json');
      const userId = c.get('userId') ?? 'admin';
      const em = orm.em.fork();
      const service = new StagingService(em);

      // Verify staging regulation exists and requirement belongs to it
      const regulation = await service.getStagingRegulation(id);
      if (!regulation) {
        return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
      }

      const reqBelongsToReg = regulation.requirements.getItems().some(r => r.id === reqId);
      if (!reqBelongsToReg) {
        return error(c, 'NOT_FOUND', 'Requirement not found in this staging regulation', 404);
      }

      try {
        const updated = await service.updateRequirement(reqId, body as Parameters<StagingService['updateRequirement']>[1], userId);
        return success(c, {
          id: updated.id,
          thresholdValue: updated.thresholdValue,
          unit: updated.unit,
          operator: updated.operator,
          scope: updated.scope,
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return error(c, 'NOT_FOUND', 'Requirement not found', 404);
        }
        throw err;
      }
    }
  );

  /**
   * POST /staging/:id/approve
   * Approve specific requirements
   */
  router.post(
    '/staging/:id/approve',
    zValidator('json', approveSchema),
    async (c) => {
      const { id } = c.req.param();
      const body = c.req.valid('json');
      const userId = c.get('userId') ?? 'admin';
      const em = orm.em.fork();
      const service = new StagingService(em);

      let approvedCount = 0;
      for (const reqId of body.requirementIds) {
        try {
          await service.approveRequirement(reqId, userId);
          approvedCount++;
        } catch {
          // Skip requirements that don't exist
        }
      }

      return success(c, {
        approvedCount,
        totalRequested: body.requirementIds.length,
      });
    }
  );

  /**
   * POST /staging/:id/bulk-approve
   * Approve all MATCH requirements
   */
  router.post(
    '/staging/:id/bulk-approve',
    async (c) => {
      const { id } = c.req.param();
      const userId = c.get('userId') ?? 'admin';
      const em = orm.em.fork();
      const service = new StagingService(em);

      // Verify staging regulation exists
      const regulation = await service.getStagingRegulation(id);
      if (!regulation) {
        return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
      }

      const count = await service.bulkApproveMatches(id, userId);

      return success(c, {
        approvedCount: count,
      });
    }
  );

  /**
   * POST /staging/:id/publish
   * Publish approved requirements to production
   */
  router.post(
    '/staging/:id/publish',
    async (c) => {
      const { id } = c.req.param();
      const userId = c.get('userId') ?? 'admin';
      const em = orm.em.fork();

      try {
        const publishService = new PublishService(em);
        const result = await publishService.publish(id, userId);

        return success(c, {
          regulationId: result.regulationId,
          requirementCount: result.requirementCount,
          message: 'Regulation published to production',
        }, { status: 201 });
      } catch (err) {
        if (err instanceof Error) {
          if (err.message.includes('not found')) {
            return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
          }
          if (err.message.includes('not approved')) {
            return error(c, 'BAD_REQUEST', err.message, 400);
          }
        }
        throw err;
      }
    }
  );

  /**
   * DELETE /staging/:id
   * Reject and remove a staging regulation
   */
  router.delete(
    '/staging/:id',
    async (c) => {
      const { id } = c.req.param();
      const em = orm.em.fork();

      const regulation = await em.findOne('StagingRegulation', { id });
      if (!regulation) {
        return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
      }

      await em.removeAndFlush(regulation);

      return c.body(null, 204);
    }
  );

  return router;
}
