import { Hono } from 'hono';
import { prisma } from '@eurocomply/db';
import {
  ok,
  err,
  hasAuthority,
  type AuthorityLevel,
} from '@eurocomply/shared';
import { ReadinessProfileService } from '../services/readiness-profile.service.js';
import { DPPSnapshotService } from '../services/dpp-snapshot.service.js';
import { DPPReadinessService } from '../services/dpp-readiness.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import type { AppVariables } from '../types/context.js';

const compliance = new Hono<{ Variables: AppVariables }>();
const profileService = new ReadinessProfileService(prisma);
const snapshotService = new DPPSnapshotService(prisma);
const readinessService = new DPPReadinessService(prisma);

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

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'VIEWER' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires VIEWER authority for Compliance'), 403);
  }

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

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'VIEWER' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires VIEWER authority for Compliance'), 403);
  }

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

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'MANAGER' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires MANAGER authority for Compliance'), 403);
  }

  try {
    const body = await c.req.json();
    const profile = await profileService.create(body);
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

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'MANAGER' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires MANAGER authority for Compliance'), 403);
  }

  try {
    const body = await c.req.json();
    const profile = await profileService.update(profileId, body);
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

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'MANAGER' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires MANAGER authority for Compliance'), 403);
  }

  try {
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
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');
  const productId = c.req.param('productId');
  const profileId = c.req.query('profileId');

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'VIEWER' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires VIEWER authority for Compliance'), 403);
  }

  if (!profileId) {
    return c.json(err('VALIDATION_ERROR', 'profileId query parameter required'), 400);
  }

  try {
    const result = await readinessService.checkProductReadiness(
      organizationId,
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
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');
  const profileId = c.req.query('profileId');

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'VIEWER' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires VIEWER authority for Compliance'), 403);
  }

  if (!profileId) {
    return c.json(err('VALIDATION_ERROR', 'profileId query parameter required'), 400);
  }

  try {
    const results = await readinessService.getReadyProducts(organizationId, profileId);
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
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'CONTRIBUTOR' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires CONTRIBUTOR authority for Compliance'), 403);
  }

  try {
    const body = await c.req.json();
    const snapshot = await snapshotService.createSnapshot(organizationId, body);
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
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'VIEWER' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires VIEWER authority for Compliance'), 403);
  }

  const productId = c.req.query('productId');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const snapshots = await snapshotService.listSnapshots(organizationId, {
    productId: productId || undefined,
    status: status as any,
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
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');
  const snapshotId = c.req.param('id');

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'VIEWER' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires VIEWER authority for Compliance'), 403);
  }

  const snapshot = await snapshotService.getSnapshot(organizationId, snapshotId);
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
  const { organizationId } = c.get('tenant');
  const { id: userId } = c.get('user');
  const permissions = c.get('permissions');
  const snapshotId = c.req.param('id');

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'CONTRIBUTOR' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires CONTRIBUTOR authority for Compliance'), 403);
  }

  try {
    const snapshot = await snapshotService.verify(organizationId, snapshotId, userId);
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
  const { organizationId } = c.get('tenant');
  const { id: userId } = c.get('user');
  const permissions = c.get('permissions');
  const snapshotId = c.req.param('id');

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'EDITOR' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires EDITOR authority for Compliance'), 403);
  }

  try {
    const body = await c.req.json();
    const snapshot = await snapshotService.attest(organizationId, snapshotId, userId, body);
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
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');
  const snapshotId = c.req.param('id');

  // Sealing requires MANAGER authority (system-level action)
  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'MANAGER' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires MANAGER authority for Compliance'), 403);
  }

  try {
    const body = await c.req.json();
    const snapshot = await snapshotService.seal(organizationId, snapshotId, body);
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
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');
  const snapshotId = c.req.param('id');

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'MANAGER' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires MANAGER authority for Compliance'), 403);
  }

  try {
    const body = await c.req.json();
    const snapshot = await snapshotService.issue(organizationId, snapshotId, body);
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
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');
  const snapshotId = c.req.param('id');

  if (!hasAuthority(permissions.complianceAuthority as AuthorityLevel, 'MANAGER' as AuthorityLevel)) {
    return c.json(err('FORBIDDEN', 'Requires MANAGER authority for Compliance'), 403);
  }

  try {
    const snapshot = await snapshotService.revoke(organizationId, snapshotId);
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
