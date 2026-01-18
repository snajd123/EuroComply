import { Hono } from 'hono';
import type { Context } from 'hono';
import { prisma } from '@eurocomply/db';
import {
  ok,
  err,
  hasAuthority,
  type AuthorityLevel,
  type WorkspaceType,
} from '@eurocomply/shared';
import { VersionService } from '../services/version.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { NotFoundError, ValidationError, ConflictError } from '../lib/errors.js';
import type { AppVariables } from '../types/context.js';

const versions = new Hono<{ Variables: AppVariables }>();
const versionService = new VersionService(prisma);

/**
 * Version State Machine:
 *
 *   ┌─────────┐
 *   │  DRAFT  │
 *   └────┬────┘
 *        │ submit (EDITOR)
 *        ▼
 * ┌──────────────┐
 * │PENDING_REVIEW│
 * └──────┬───────┘
 *        │ startReview (EDITOR)
 *        ▼
 *   ┌──────────┐
 *   │IN_REVIEW │
 *   └────┬─────┘
 *        │
 *   ┌────┴────┐
 *   │         │
 *   ▼         ▼
 * ┌────────┐ ┌────────┐
 * │RELEASED│ │REJECTED│
 * └────────┘ └────────┘
 * (release)  (reject)
 * (EDITOR)   (EDITOR)
 *
 * Authority Levels: VIEWER < CONTRIBUTOR < EDITOR < MANAGER
 * EDITOR authority includes 'approve' permission for review actions.
 * Once RELEASED, version is immutable (Forensic Guard A).
 */

/**
 * Check if user has required authority for a workspace.
 * Returns error response if unauthorized, null if authorized.
 */
function checkWorkspaceAuthority(
  c: Context<{ Variables: AppVariables }>,
  workspace: string,
  requiredAuthority: AuthorityLevel
): Response | null {
  const permissions = c.get('permissions');
  if (!permissions) {
    return c.json(err('UNAUTHORIZED', 'Not authenticated'), 401);
  }

  // Map workspace to authority key
  const workspaceKey = workspace.toLowerCase() as WorkspaceType;
  const authorityKey = `${workspaceKey}Authority` as keyof typeof permissions;
  const userAuthority = permissions[authorityKey] as AuthorityLevel;

  if (!hasAuthority(userAuthority, requiredAuthority)) {
    return c.json(
      err(
        'FORBIDDEN',
        `Insufficient permissions. Required: ${requiredAuthority} for ${workspace}`
      ),
      403
    );
  }

  return null;
}

/**
 * Handle version service errors consistently.
 * Maps custom error classes to appropriate HTTP responses.
 */
function handleVersionError(c: Context, error: unknown): Response {
  if (error instanceof NotFoundError) {
    return c.json(err('NOT_FOUND', error.message), 404);
  }
  if (error instanceof ValidationError) {
    return c.json(err('VALIDATION_ERROR', error.message), 400);
  }
  if (error instanceof ConflictError) {
    return c.json(err('CONFLICT', error.message), 409);
  }
  throw error;
}

// Apply auth middleware to all routes
versions.use('*', authMiddleware);

/**
 * GET /api/v1/versions/:id
 * Get a single version by ID.
 * Requires: viewer authority for the version's workspace
 */
versions.get('/:id', async (c) => {
  const { organizationId } = c.get('tenant');
  const versionId = c.req.param('id');

  const version = await versionService.getVersion(organizationId, versionId);
  if (!version) {
    return c.json(err('NOT_FOUND', 'Version not found'), 404);
  }

  // Check viewer authority for the version's workspace
  const authError = checkWorkspaceAuthority(c, version.workspace, 'VIEWER');
  if (authError) return authError;

  return c.json(ok(version));
});

/**
 * POST /api/v1/versions/:id/submit
 * Submit for review (DRAFT -> PENDING_REVIEW)
 * Requires: editor authority for the version's workspace
 */
versions.post('/:id/submit', async (c) => {
  const { organizationId } = c.get('tenant');
  const versionId = c.req.param('id');

  // Fetch version first to check workspace authority
  const version = await versionService.getVersion(organizationId, versionId);
  if (!version) {
    return c.json(err('NOT_FOUND', 'Version not found'), 404);
  }

  // Check editor authority for the version's workspace
  const authError = checkWorkspaceAuthority(c, version.workspace, 'EDITOR');
  if (authError) return authError;

  try {
    const updatedVersion = await versionService.submitForReview(organizationId, versionId);
    return c.json(ok(updatedVersion));
  } catch (error) {
    return handleVersionError(c, error);
  }
});

/**
 * POST /api/v1/versions/:id/review
 * Start review (PENDING_REVIEW -> IN_REVIEW)
 * Requires: EDITOR authority for the version's workspace
 */
versions.post('/:id/review', async (c) => {
  const { organizationId } = c.get('tenant');
  const versionId = c.req.param('id');

  // Fetch version first to check workspace authority
  const version = await versionService.getVersion(organizationId, versionId);
  if (!version) {
    return c.json(err('NOT_FOUND', 'Version not found'), 404);
  }

  // Check EDITOR authority for the version's workspace
  const authError = checkWorkspaceAuthority(c, version.workspace, 'EDITOR');
  if (authError) return authError;

  try {
    const updatedVersion = await versionService.startReview(organizationId, versionId);
    return c.json(ok(updatedVersion));
  } catch (error) {
    return handleVersionError(c, error);
  }
});

/**
 * POST /api/v1/versions/:id/release
 * Release version (IN_REVIEW -> RELEASED)
 * FORENSIC GUARD A: Once released, BOM entries cannot be modified.
 * Requires: EDITOR authority for the version's workspace
 */
versions.post('/:id/release', async (c) => {
  const { organizationId } = c.get('tenant');
  const { id: userId } = c.get('user');
  const versionId = c.req.param('id');

  // Fetch version first to check workspace authority
  const version = await versionService.getVersion(organizationId, versionId);
  if (!version) {
    return c.json(err('NOT_FOUND', 'Version not found'), 404);
  }

  // Check EDITOR authority for the version's workspace
  const authError = checkWorkspaceAuthority(c, version.workspace, 'EDITOR');
  if (authError) return authError;

  try {
    const releasedVersion = await versionService.releaseVersion(
      organizationId,
      versionId,
      userId
    );
    return c.json(ok(releasedVersion));
  } catch (error) {
    return handleVersionError(c, error);
  }
});

/**
 * POST /api/v1/versions/:id/reject
 * Reject version (IN_REVIEW -> REJECTED)
 * Requires: EDITOR authority for the version's workspace
 */
versions.post('/:id/reject', async (c) => {
  const { organizationId } = c.get('tenant');
  const versionId = c.req.param('id');

  // Fetch version first to check workspace authority
  const version = await versionService.getVersion(organizationId, versionId);
  if (!version) {
    return c.json(err('NOT_FOUND', 'Version not found'), 404);
  }

  // Check EDITOR authority for the version's workspace
  const authError = checkWorkspaceAuthority(c, version.workspace, 'EDITOR');
  if (authError) return authError;

  try {
    const rejectedVersion = await versionService.rejectVersion(organizationId, versionId);
    return c.json(ok(rejectedVersion));
  } catch (error) {
    return handleVersionError(c, error);
  }
});

export { versions };
