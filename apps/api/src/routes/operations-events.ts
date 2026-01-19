import { Hono } from 'hono';
import { prisma } from '@eurocomply/db';
import {
  ok,
  err,
  hasAuthority,
  Authority,
} from '@eurocomply/shared';
import { OperationsEventService } from '../services/operations-event.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import {
  ListEventsQuerySchema,
  CreateOperationsEventBodySchema,
  validateAuthority,
  validateBody,
} from '../lib/schemas.js';
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
  const userAuth = validateAuthority(permissions.operationsAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.MANAGER)) {
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
  const userAuth = validateAuthority(permissions.operationsAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.CONTRIBUTOR)) {
    return c.json(
      err('FORBIDDEN', 'Requires CONTRIBUTOR authority for Operations'),
      403
    );
  }

  try {
    const rawBody = await c.req.json();

    // Validate request body with Zod schema
    const validation = validateBody(CreateOperationsEventBodySchema, rawBody);
    if (!validation.success) {
      return c.json(err('VALIDATION_ERROR', validation.error), 400);
    }

    const event = await eventService.recordEvent(organizationId, userId, validation.data);
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
  const userAuth = validateAuthority(permissions.operationsAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.VIEWER)) {
    return c.json(
      err('FORBIDDEN', 'Requires VIEWER authority for Operations'),
      403
    );
  }

  // Validate query parameters with Zod
  const queryResult = ListEventsQuerySchema.safeParse({
    eventType: c.req.query('eventType'),
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

  const { eventType, status, limit, offset } = queryResult.data;

  const events = await eventService.listEvents(organizationId, {
    eventType,
    status,
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
  const userAuth = validateAuthority(permissions.operationsAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.VIEWER)) {
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
  const userAuth = validateAuthority(permissions.operationsAuthority);

  if (!userAuth || !hasAuthority(userAuth, Authority.EDITOR)) {
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
