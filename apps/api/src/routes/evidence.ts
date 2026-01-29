/**
 * Evidence API Router
 *
 * Handles recording and retrieving compliance evidence for product versions.
 * Evidence includes a requirement snapshot for audit integrity.
 *
 * POST /evidence - Record evidence with mandatory requirement snapshot
 * GET /evidence/:productVersionId - Retrieve all evidence for a product version
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@eurocomply/database';
import {
  ComplianceEvidence,
  EvidenceType,
  EvidenceResult,
  RequirementType,
  RequirementSeverity,
} from '@eurocomply/database';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';
import { success, error } from '../utils/response.js';

export interface EvidenceRouterDependencies {
  orm: MikroORM;
}

/**
 * Zod schema for requirement snapshot validation.
 * The snapshot captures the requirement state at time of evidence recording,
 * ensuring audit trail integrity even if requirements change/are deleted.
 */
const requirementSnapshotSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  type: z.nativeEnum(RequirementType),
  severity: z.nativeEnum(RequirementSeverity),
  regulationCode: z.string().min(1, 'Regulation code is required'),
  regulationName: z.string().min(1, 'Regulation name is required'),
  handlerConfig: z.record(z.unknown()).optional(),
  legalReference: z.string().optional(),
  snapshotAt: z.string().datetime(),
});

/**
 * Zod schema for creating evidence.
 * requirementSnapshot is MANDATORY - evidence without snapshot is not auditable.
 */
const createEvidenceSchema = z.object({
  productVersionId: z.string().min(1, 'Product version ID is required'),
  requirementId: z.string().min(1, 'Requirement ID cannot be empty').optional(),
  type: z.nativeEnum(EvidenceType),
  result: z.nativeEnum(EvidenceResult),
  details: z.record(z.unknown()),
  documentKey: z.string().optional(),
  requirementSnapshot: requirementSnapshotSchema,
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
 * Serializes a ComplianceEvidence entity to API response format.
 */
function serializeEvidence(evidence: ComplianceEvidence) {
  // Handle snapshotAt - it may be a Date object or string depending on database driver
  const snapshotAt = evidence.requirementSnapshot.snapshotAt;
  const snapshotAtString = snapshotAt instanceof Date
    ? snapshotAt.toISOString()
    : snapshotAt;

  return {
    id: evidence.id,
    productVersionId: evidence.productVersionId,
    requirementId: evidence.requirementId,
    type: evidence.type,
    result: evidence.result,
    details: evidence.details,
    documentKey: evidence.documentKey,
    requirementSnapshot: {
      ...evidence.requirementSnapshot,
      snapshotAt: snapshotAtString,
    },
    recordedBy: evidence.recordedBy,
    recordedAt: evidence.recordedAt.toISOString(),
  };
}

/**
 * Creates the evidence router.
 *
 * POST /evidence - Record evidence with requirement snapshot (requires compliance:edit)
 * GET /evidence/:productVersionId - Get all evidence for a product version (requires compliance:view)
 */
export function createEvidenceRouter(deps: EvidenceRouterDependencies): Hono<Env> {
  const { orm } = deps;
  const router = new Hono<Env>();

  // POST /evidence - Record new evidence
  router.post(
    '/',
    authorize('compliance', 'edit'),
    zValidator('json', createEvidenceSchema, validationHook),
    async (c) => {
      const body = c.req.valid('json');
      const schema = c.get('tenantSchema')!;
      const userId = c.get('userId')!;
      const em = orm.em.fork({ schema });

      const evidence = await em.transactional(async (txEm) => {
        await txEm.execute(`SET search_path TO "${schema}", public`);

        // Parse snapshotAt string to Date for storage
        const snapshotAt = new Date(body.requirementSnapshot.snapshotAt);

        const newEvidence = new ComplianceEvidence();
        newEvidence.productVersionId = body.productVersionId;
        newEvidence.requirementId = body.requirementId;
        newEvidence.type = body.type;
        newEvidence.result = body.result;
        newEvidence.details = body.details;
        newEvidence.documentKey = body.documentKey;
        newEvidence.requirementSnapshot = {
          code: body.requirementSnapshot.code,
          name: body.requirementSnapshot.name,
          type: body.requirementSnapshot.type,
          severity: body.requirementSnapshot.severity,
          regulationCode: body.requirementSnapshot.regulationCode,
          regulationName: body.requirementSnapshot.regulationName,
          handlerConfig: body.requirementSnapshot.handlerConfig,
          legalReference: body.requirementSnapshot.legalReference,
          snapshotAt,
        };
        newEvidence.recordedBy = userId;
        newEvidence.recordedAt = new Date();

        txEm.persist(newEvidence);
        await txEm.flush();

        return newEvidence;
      });

      return success(c, serializeEvidence(evidence), { status: 201 });
    }
  );

  // GET /evidence/:productVersionId - Get all evidence for a product version
  router.get(
    '/:productVersionId',
    authorize('compliance', 'view'),
    async (c) => {
      const productVersionId = c.req.param('productVersionId');
      const schema = c.get('tenantSchema')!;
      const em = orm.em.fork({ schema });

      const evidenceList = await em.transactional(async (txEm) => {
        await txEm.execute(`SET search_path TO "${schema}", public`);

        return txEm.find(
          ComplianceEvidence,
          { productVersionId },
          { orderBy: { recordedAt: 'DESC' } }
        );
      });

      return success(c, evidenceList.map(serializeEvidence));
    }
  );

  return router;
}
