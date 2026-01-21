import { createMiddleware } from 'hono/factory';
import type { Env } from '../app.js';

export interface TenantContext {
  schemaName: string;
  userId: string;
}

/**
 * Extracts tenant context from a JWT token.
 * In production, this should validate the signature via Clerk/JWKS.
 * For now, we just decode the payload (development only).
 */
export function extractTenantFromJwt(token: string): TenantContext | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(atob(parts[1]!));
    const schemaName = payload.schema_name;
    const userId = payload.sub;

    if (!schemaName || typeof schemaName !== 'string') {
      return null;
    }

    return { schemaName, userId: userId ?? 'anonymous' };
  } catch {
    return null;
  }
}

/**
 * Middleware that extracts tenant context from the Authorization header.
 * Sets tenantSchema and userId in the Hono context.
 */
export const tenantMiddleware = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const tenant = extractTenantFromJwt(token);

  if (!tenant) {
    return c.json({ error: 'Unauthorized', message: 'Invalid token or missing tenant context' }, 401);
  }

  c.set('tenantSchema', tenant.schemaName);
  c.set('userId', tenant.userId);

  await next();
});
