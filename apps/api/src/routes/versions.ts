import { Hono } from 'hono';
import { prisma } from '@eurocomply/db';
import { ok, err } from '@eurocomply/shared';
import { VersionService } from '../services/version.service.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AppVariables } from '../types/context.js';

const versions = new Hono<{ Variables: AppVariables }>();
const versionService = new VersionService(prisma);

// Apply auth middleware to all routes
versions.use('*', authMiddleware);

/**
 * POST /api/v1/versions/:id/submit
 * Submit for review (DRAFT -> PENDING_REVIEW)
 */
versions.post('/:id/submit', async (c) => {
  const { organizationId } = c.get('tenant');
  const versionId = c.req.param('id');

  try {
    const version = await versionService.submitForReview(organizationId, versionId);
    return c.json(ok(version));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Version not found') {
        return c.json(err('NOT_FOUND', 'Version not found'), 404);
      }
      if (error.message.startsWith('Cannot transition')) {
        return c.json(err('VALIDATION_ERROR', error.message), 400);
      }
    }
    throw error;
  }
});

/**
 * POST /api/v1/versions/:id/review
 * Start review (PENDING_REVIEW -> IN_REVIEW)
 */
versions.post('/:id/review', async (c) => {
  const { organizationId } = c.get('tenant');
  const versionId = c.req.param('id');

  try {
    const version = await versionService.startReview(organizationId, versionId);
    return c.json(ok(version));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Version not found') {
        return c.json(err('NOT_FOUND', 'Version not found'), 404);
      }
      if (error.message.startsWith('Cannot transition')) {
        return c.json(err('VALIDATION_ERROR', error.message), 400);
      }
    }
    throw error;
  }
});

/**
 * POST /api/v1/versions/:id/release
 * Release version (IN_REVIEW -> RELEASED)
 * FORENSIC GUARD A: Once released, BOM entries cannot be modified.
 */
versions.post('/:id/release', async (c) => {
  const { organizationId } = c.get('tenant');
  const { id: userId } = c.get('user');
  const versionId = c.req.param('id');

  try {
    const version = await versionService.releaseVersion(
      organizationId,
      versionId,
      userId
    );
    return c.json(ok(version));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Version not found') {
        return c.json(err('NOT_FOUND', 'Version not found'), 404);
      }
      if (error.message.startsWith('Cannot transition')) {
        return c.json(err('VALIDATION_ERROR', error.message), 400);
      }
    }
    throw error;
  }
});

/**
 * POST /api/v1/versions/:id/reject
 * Reject version (IN_REVIEW -> REJECTED)
 */
versions.post('/:id/reject', async (c) => {
  const { organizationId } = c.get('tenant');
  const versionId = c.req.param('id');

  try {
    const version = await versionService.rejectVersion(organizationId, versionId);
    return c.json(ok(version));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Version not found') {
        return c.json(err('NOT_FOUND', 'Version not found'), 404);
      }
      if (error.message.startsWith('Cannot transition')) {
        return c.json(err('VALIDATION_ERROR', error.message), 400);
      }
    }
    throw error;
  }
});

export { versions };
