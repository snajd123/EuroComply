import { Hono } from 'hono';
import { prisma } from '@eurocomply/db';
import {
  ok,
  err,
  hasAuthority,
  type AuthorityLevel,
} from '@eurocomply/shared';
import { OperationsEventService } from '../services/operations-event.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import type { AppVariables } from '../types/context.js';

const operationsEvents = new Hono<{ Variables: AppVariables }>();
const eventService = new OperationsEventService(prisma);

// Apply auth middleware
operationsEvents.use('*', authMiddleware);

/**
 * GET /api/v1/operations/events/integrity
 * Verify hash chain integrity.
 * Requires: MANAGER authority for Operations workspace
 *
 * NOTE: This route MUST be defined before /:id to avoid route matching conflicts.
 */
operationsEvents.get('/integrity', async (c) => {
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');

  if (!hasAuthority(permissions.operationsAuthority as AuthorityLevel, 'MANAGER' as AuthorityLevel)) {
    return c.json(
      err('FORBIDDEN', 'Requires MANAGER authority for Operations'),
      403
    );
  }

  const result = await eventService.verifyChainIntegrity(organizationId);
  return c.json(ok(result));
});

/**
 * POST /api/v1/operations/events
 * Record a new operations event.
 * Requires: CONTRIBUTOR authority for Operations workspace
 */
operationsEvents.post('/', async (c) => {
  const { organizationId } = c.get('tenant');
  const { id: userId } = c.get('user');
  const permissions = c.get('permissions');

  if (!hasAuthority(permissions.operationsAuthority as AuthorityLevel, 'CONTRIBUTOR' as AuthorityLevel)) {
    return c.json(
      err('FORBIDDEN', 'Requires CONTRIBUTOR authority for Operations'),
      403
    );
  }

  try {
    const body = await c.req.json();
    const event = await eventService.recordEvent(organizationId, userId, body);
    return c.json(ok(event), 201);
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json(err('VALIDATION_ERROR', error.message), 400);
    }
    throw error;
  }
});

/**
 * GET /api/v1/operations/events
 * List operations events.
 * Requires: VIEWER authority for Operations workspace
 */
operationsEvents.get('/', async (c) => {
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');

  if (!hasAuthority(permissions.operationsAuthority as AuthorityLevel, 'VIEWER' as AuthorityLevel)) {
    return c.json(
      err('FORBIDDEN', 'Requires VIEWER authority for Operations'),
      403
    );
  }

  const eventType = c.req.query('eventType');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const events = await eventService.listEvents(organizationId, {
    eventType: eventType as any,
    status: status as any,
    limit,
    offset,
  });

  return c.json(ok(events));
});

/**
 * GET /api/v1/operations/events/:id
 * Get a single event.
 * Requires: VIEWER authority for Operations workspace
 */
operationsEvents.get('/:id', async (c) => {
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');
  const eventId = c.req.param('id');

  if (!hasAuthority(permissions.operationsAuthority as AuthorityLevel, 'VIEWER' as AuthorityLevel)) {
    return c.json(
      err('FORBIDDEN', 'Requires VIEWER authority for Operations'),
      403
    );
  }

  const event = await eventService.getEvent(organizationId, eventId);
  if (!event) {
    return c.json(err('NOT_FOUND', 'Event not found'), 404);
  }

  return c.json(ok(event));
});

/**
 * POST /api/v1/operations/events/:id/verify
 * Verify (seal) an event.
 * Requires: EDITOR authority for Operations workspace
 */
operationsEvents.post('/:id/verify', async (c) => {
  const { organizationId } = c.get('tenant');
  const { id: userId } = c.get('user');
  const permissions = c.get('permissions');
  const eventId = c.req.param('id');

  if (!hasAuthority(permissions.operationsAuthority as AuthorityLevel, 'EDITOR' as AuthorityLevel)) {
    return c.json(
      err('FORBIDDEN', 'Requires EDITOR authority for Operations'),
      403
    );
  }

  try {
    const event = await eventService.verifyEvent(organizationId, eventId, userId);
    return c.json(ok(event));
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

export { operationsEvents };
