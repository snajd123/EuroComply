import { Hono } from 'hono';
import {
  ok,
  err,
  hasAuthority,
  Authority,
} from '@eurocomply/shared';
import { ReadinessProfileService } from '../services/readiness-profile.service.js';
import { DPPSnapshotService } from '../services/dpp-snapshot.service.js';
import { DPPReadinessService } from '../services/dpp-readiness.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import {
  ListSnapshotsQuerySchema,
  validateAuthority,
  CreateReadinessProfileBodySchema,
  UpdateReadinessProfileBodySchema,
  CreateSnapshotBodySchema,
  AttestSnapshotBodySchema,
  SealSnapshotBodySchema,
  IssueSnapshotBodySchema,
  validateBody,
} from '../lib/schemas.js';
import type { AppVariables } from '../types/context.js';
import { getEntityManager } from '../lib/context.js';

const compliance = new Hono<{ Variables: AppVariables }>();

/**
 * Helper to get ReadinessProfileService scoped to the tenant's EntityManager.
 * The EntityManager is already scoped to the tenant schema by the auth middleware.
 */
function getProfileService(c: Parameters<typeof getEntityManager>[0]): ReadinessProfileService {
  const em = getEntityManager(c);
  return new ReadinessProfileService(em);
}

/**
 * Helper to get DPPSnapshotService scoped to the tenant's EntityManager.
 * The EntityManager is already scoped to the tenant schema by the auth middleware.
 */
function getSnapshotService(c: Parameters<typeof getEntityManager>[0]): DPPSnapshotService {
  const em = getEntityManager(c);
  return new DPPSnapshotService(em);
}

/**
 * Helper to get DPPReadinessService scoped to the tenant's EntityManager.
 * The EntityManager is already scoped to the tenant schema by the auth middleware.
 */
function getReadinessService(c: Parameters<typeof getEntityManager>[0]): DPPReadinessService {
  const em = getEntityManager(c);
  return new DPPReadinessService(em);
}

// Apply auth middleware
compliance.use('*', authMiddleware);

// ============================================
// READINESS PROFILES
// ============================================

/**
 * GET /api/v1/compliance/profiles
 * List all readiness profiles.
 * Requires: VIEWER authority for Compliance workspace
 */
compliance.get('/profiles', async (c) => {
  const permissions = c.get('permissions');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.VIEWER)) {
    return c.json(err('FORBIDDEN', 'Requires VIEWER authority for Compliance'), 403);
  }

  const profileService = getProfileService(c);
  const profiles = await profileService.list();
  return c.json(ok(profiles));
});

/**
 * GET /api/v1/compliance/profiles/:id
 * Get a readiness profile by ID.
 * Requires: VIEWER authority for Compliance workspace
 */
compliance.get('/profiles/:id', async (c) => {
  const permissions = c.get('permissions');
  const profileId = c.req.param('id');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.VIEWER)) {
    return c.json(err('FORBIDDEN', 'Requires VIEWER authority for Compliance'), 403);
  }

  const profileService = getProfileService(c);
  const profile = await profileService.getById(profileId);
  if (!profile) {
    return c.json(err('NOT_FOUND', 'Profile not found'), 404);
  }

  return c.json(ok(profile));
});

/**
 * POST /api/v1/compliance/profiles
 * Create a readiness profile.
 * Requires: MANAGER authority for Compliance workspace
 */
compliance.post('/profiles', async (c) => {
  const permissions = c.get('permissions');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.MANAGER)) {
    return c.json(err('FORBIDDEN', 'Requires MANAGER authority for Compliance'), 403);
  }

  try {
    const rawBody = await c.req.json();
    const validation = validateBody(CreateReadinessProfileBodySchema, rawBody);
    if (!validation.success) {
      return c.json(err('VALIDATION_ERROR', validation.error), 400);
    }
    const profileService = getProfileService(c);
    const profile = await profileService.create(validation.data);
    return c.json(ok(profile), 201);
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json(err('VALIDATION_ERROR', error.message), 400);
    }
    throw error;
  }
});

/**
 * PUT /api/v1/compliance/profiles/:id
 * Update a readiness profile.
 * Requires: MANAGER authority for Compliance workspace
 */
compliance.put('/profiles/:id', async (c) => {
  const permissions = c.get('permissions');
  const profileId = c.req.param('id');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.MANAGER)) {
    return c.json(err('FORBIDDEN', 'Requires MANAGER authority for Compliance'), 403);
  }

  try {
    const rawBody = await c.req.json();
    const validation = validateBody(UpdateReadinessProfileBodySchema, rawBody);
    if (!validation.success) {
      return c.json(err('VALIDATION_ERROR', validation.error), 400);
    }
    const profileService = getProfileService(c);
    const profile = await profileService.update(profileId, validation.data);
    return c.json(ok(profile));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(err('NOT_FOUND', error.message), 404);
    }
    throw error;
  }
});

/**
 * DELETE /api/v1/compliance/profiles/:id
 * Delete a readiness profile.
 * Requires: MANAGER authority for Compliance workspace
 */
compliance.delete('/profiles/:id', async (c) => {
  const permissions = c.get('permissions');
  const profileId = c.req.param('id');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.MANAGER)) {
    return c.json(err('FORBIDDEN', 'Requires MANAGER authority for Compliance'), 403);
  }

  try {
    const profileService = getProfileService(c);
    await profileService.delete(profileId);
    return c.json(ok({ deleted: true }));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(err('NOT_FOUND', error.message), 404);
    }
    throw error;
  }
});

// ============================================
// DPP READINESS
// ============================================

/**
 * GET /api/v1/compliance/readiness/:productId
 * Check DPP readiness for a product.
 * Requires: VIEWER authority for Compliance workspace
 */
compliance.get('/readiness/:productId', async (c) => {
  const permissions = c.get('permissions');
  const productId = c.req.param('productId');
  const profileId = c.req.query('profileId');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.VIEWER)) {
    return c.json(err('FORBIDDEN', 'Requires VIEWER authority for Compliance'), 403);
  }

  if (!profileId) {
    return c.json(err('VALIDATION_ERROR', 'profileId query parameter required'), 400);
  }

  try {
    const readinessService = getReadinessService(c);
    const result = await readinessService.checkProductReadiness(
      productId,
      profileId
    );
    return c.json(ok(result));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(err('NOT_FOUND', error.message), 404);
    }
    throw error;
  }
});

/**
 * GET /api/v1/compliance/readiness
 * Get all products that are ready for DPP issuance.
 * Requires: VIEWER authority for Compliance workspace
 */
compliance.get('/readiness', async (c) => {
  const permissions = c.get('permissions');
  const profileId = c.req.query('profileId');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.VIEWER)) {
    return c.json(err('FORBIDDEN', 'Requires VIEWER authority for Compliance'), 403);
  }

  if (!profileId) {
    return c.json(err('VALIDATION_ERROR', 'profileId query parameter required'), 400);
  }

  try {
    const readinessService = getReadinessService(c);
    const results = await readinessService.getReadyProducts(profileId);
    return c.json(ok(results));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(err('NOT_FOUND', error.message), 404);
    }
    throw error;
  }
});

// ============================================
// DPP SNAPSHOTS
// ============================================

/**
 * POST /api/v1/compliance/snapshots
 * Create a new DPP snapshot.
 * Requires: CONTRIBUTOR authority for Compliance workspace
 */
compliance.post('/snapshots', async (c) => {
  const permissions = c.get('permissions');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.CONTRIBUTOR)) {
    return c.json(err('FORBIDDEN', 'Requires CONTRIBUTOR authority for Compliance'), 403);
  }

  try {
    const rawBody = await c.req.json();
    const validation = validateBody(CreateSnapshotBodySchema, rawBody);
    if (!validation.success) {
      return c.json(err('VALIDATION_ERROR', validation.error), 400);
    }
    const snapshotService = getSnapshotService(c);
    const snapshot = await snapshotService.createSnapshot(validation.data);
    return c.json(ok(snapshot), 201);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(err('NOT_FOUND', error.message), 404);
    }
    if (error instanceof ValidationError) {
      return c.json(err('VALIDATION_ERROR', error.message), 400);
    }
    throw error;
  }
});

/**
 * GET /api/v1/compliance/snapshots
 * List DPP snapshots.
 * Requires: VIEWER authority for Compliance workspace
 */
compliance.get('/snapshots', async (c) => {
  const permissions = c.get('permissions');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.VIEWER)) {
    return c.json(err('FORBIDDEN', 'Requires VIEWER authority for Compliance'), 403);
  }

  // Validate query parameters with Zod
  const queryResult = ListSnapshotsQuerySchema.safeParse({
    productId: c.req.query('productId'),
    status: c.req.query('status'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  });

  if (!queryResult.success) {
    const errors = queryResult.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    return c.json(err('VALIDATION_ERROR', `Invalid query parameters: ${errors}`), 400);
  }

  const { productId, status, limit, offset } = queryResult.data;

  const snapshotService = getSnapshotService(c);
  const snapshots = await snapshotService.listSnapshots({
    productId,
    status,
    limit,
    offset,
  });

  return c.json(ok(snapshots));
});

/**
 * GET /api/v1/compliance/snapshots/:id
 * Get a DPP snapshot.
 * Requires: VIEWER authority for Compliance workspace
 */
compliance.get('/snapshots/:id', async (c) => {
  const permissions = c.get('permissions');
  const snapshotId = c.req.param('id');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.VIEWER)) {
    return c.json(err('FORBIDDEN', 'Requires VIEWER authority for Compliance'), 403);
  }

  const snapshotService = getSnapshotService(c);
  const snapshot = await snapshotService.getSnapshot(snapshotId);
  if (!snapshot) {
    return c.json(err('NOT_FOUND', 'Snapshot not found'), 404);
  }

  return c.json(ok(snapshot));
});

/**
 * POST /api/v1/compliance/snapshots/:id/verify
 * Verify a snapshot (CONTRIBUTOR action).
 * PENDING_REVIEW → VERIFIED
 */
compliance.post('/snapshots/:id/verify', async (c) => {
  const { id: userId } = c.get('user');
  const permissions = c.get('permissions');
  const snapshotId = c.req.param('id');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.CONTRIBUTOR)) {
    return c.json(err('FORBIDDEN', 'Requires CONTRIBUTOR authority for Compliance'), 403);
  }

  try {
    const snapshotService = getSnapshotService(c);
    const snapshot = await snapshotService.verify(snapshotId, userId);
    return c.json(ok(snapshot));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(err('NOT_FOUND', error.message), 404);
    }
    if (error instanceof ValidationError) {
      return c.json(err('VALIDATION_ERROR', error.message), 400);
    }
    throw error;
  }
});

/**
 * POST /api/v1/compliance/snapshots/:id/attest
 * Attest a snapshot (EDITOR action with user DID).
 * VERIFIED → ATTESTED
 */
compliance.post('/snapshots/:id/attest', async (c) => {
  const { id: userId } = c.get('user');
  const permissions = c.get('permissions');
  const snapshotId = c.req.param('id');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.EDITOR)) {
    return c.json(err('FORBIDDEN', 'Requires EDITOR authority for Compliance'), 403);
  }

  try {
    const rawBody = await c.req.json();
    const validation = validateBody(AttestSnapshotBodySchema, rawBody);
    if (!validation.success) {
      return c.json(err('VALIDATION_ERROR', validation.error), 400);
    }
    const snapshotService = getSnapshotService(c);
    const snapshot = await snapshotService.attest(snapshotId, userId, validation.data);
    return c.json(ok(snapshot));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(err('NOT_FOUND', error.message), 404);
    }
    if (error instanceof ValidationError) {
      return c.json(err('VALIDATION_ERROR', error.message), 400);
    }
    throw error;
  }
});

/**
 * POST /api/v1/compliance/snapshots/:id/seal
 * Seal a snapshot (SYSTEM action with org DID).
 * ATTESTED → SEALED
 */
compliance.post('/snapshots/:id/seal', async (c) => {
  const permissions = c.get('permissions');
  const snapshotId = c.req.param('id');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  // Sealing requires MANAGER authority (system-level action)
  if (!userAuth || !hasAuthority(userAuth, Authority.MANAGER)) {
    return c.json(err('FORBIDDEN', 'Requires MANAGER authority for Compliance'), 403);
  }

  try {
    const rawBody = await c.req.json();
    const validation = validateBody(SealSnapshotBodySchema, rawBody);
    if (!validation.success) {
      return c.json(err('VALIDATION_ERROR', validation.error), 400);
    }
    const snapshotService = getSnapshotService(c);
    const snapshot = await snapshotService.seal(snapshotId, validation.data);
    return c.json(ok(snapshot));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(err('NOT_FOUND', error.message), 404);
    }
    if (error instanceof ValidationError) {
      return c.json(err('VALIDATION_ERROR', error.message), 400);
    }
    throw error;
  }
});

/**
 * POST /api/v1/compliance/snapshots/:id/issue
 * Issue the DPP (final step).
 * SEALED → ISSUED
 */
compliance.post('/snapshots/:id/issue', async (c) => {
  const permissions = c.get('permissions');
  const snapshotId = c.req.param('id');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.MANAGER)) {
    return c.json(err('FORBIDDEN', 'Requires MANAGER authority for Compliance'), 403);
  }

  try {
    const rawBody = await c.req.json();
    const validation = validateBody(IssueSnapshotBodySchema, rawBody);
    if (!validation.success) {
      return c.json(err('VALIDATION_ERROR', validation.error), 400);
    }
    const snapshotService = getSnapshotService(c);
    const snapshot = await snapshotService.issue(snapshotId, validation.data);
    return c.json(ok(snapshot));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(err('NOT_FOUND', error.message), 404);
    }
    if (error instanceof ValidationError) {
      return c.json(err('VALIDATION_ERROR', error.message), 400);
    }
    throw error;
  }
});

/**
 * POST /api/v1/compliance/snapshots/:id/revoke
 * Revoke an issued DPP.
 * ISSUED → REVOKED
 */
compliance.post('/snapshots/:id/revoke', async (c) => {
  const permissions = c.get('permissions');
  const snapshotId = c.req.param('id');
  const userAuth = validateAuthority(permissions.complianceAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.MANAGER)) {
    return c.json(err('FORBIDDEN', 'Requires MANAGER authority for Compliance'), 403);
  }

  try {
    const snapshotService = getSnapshotService(c);
    const snapshot = await snapshotService.revoke(snapshotId);
    return c.json(ok(snapshot));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(err('NOT_FOUND', error.message), 404);
    }
    if (error instanceof ValidationError) {
      return c.json(err('VALIDATION_ERROR', error.message), 400);
    }
    throw error;
  }
});

export { compliance };
