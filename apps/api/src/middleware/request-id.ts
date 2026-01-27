/**
 * Request ID Middleware
 *
 * Generates a unique request ID for each incoming request and:
 * 1. Stores it in the context for use by response helpers
 * 2. Sets the X-Request-Id response header for client correlation
 *
 * Accepts existing X-Request-Id from client if it follows the req_ format.
 */
import { createMiddleware } from 'hono/factory';
import { createId } from '@eurocomply/core';

/**
 * Valid request ID format: starts with "req_"
 */
function isValidRequestId(id: string | undefined | null): id is string {
  return typeof id === 'string' && id.startsWith('req_');
}

/**
 * Creates the request ID middleware
 */
export function requestIdMiddleware() {
  return createMiddleware(async (c, next) => {
    // Check for existing valid request ID from client
    const existingId = c.req.header('X-Request-Id');
    const requestId = isValidRequestId(existingId) ? existingId : `req_${createId()}`;

    // Store in context for use by response helpers
    c.set('requestId', requestId);

    // Continue processing
    await next();

    // Set response header
    c.header('X-Request-Id', requestId);
  });
}
