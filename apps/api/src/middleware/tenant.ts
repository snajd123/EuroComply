import { createMiddleware } from 'hono/factory';
import type { Env } from '../app.js';
import {
  verifyAndExtractTenant,
  extractTenantFromJwtUnsafe,
  type JwtVerificationOptions,
} from '../utils/jwt.js';

export interface TenantContext {
  schemaName: string;
  userId: string;
}

/**
 * Extracts tenant context from a JWT token.
 *
 * @deprecated Use verifyAndExtractTenant for production with signature verification.
 * This function is kept for backwards compatibility with existing tests.
 */
export function extractTenantFromJwt(token: string): TenantContext | null {
  return extractTenantFromJwtUnsafe(token);
}

/**
 * Creates tenant middleware with JWT verification options.
 *
 * In production (when CLERK_SECRET_KEY is set), this verifies the JWT signature
 * against Clerk's JWKS before extracting tenant context.
 *
 * In development/testing (when CLERK_SECRET_KEY is not set), it falls back to
 * unsafe base64 decoding for convenience.
 */
export function createTenantMiddleware(options?: Partial<JwtVerificationOptions>) {
  const secretKey = options?.secretKey ?? process.env['CLERK_SECRET_KEY'];

  return createMiddleware<Env>(async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' }, 401);
    }

    const token = authHeader.slice(7);
    let tenant: TenantContext | null = null;

    if (secretKey) {
      // Production: Verify JWT signature with Clerk
      tenant = await verifyAndExtractTenant(token, {
        secretKey,
        jwtKey: options?.jwtKey,
        authorizedParties: options?.authorizedParties,
      });
    } else {
      // Development/Testing: Skip signature verification (INSECURE)
      // Log warning in non-test environments
      if (process.env['NODE_ENV'] !== 'test') {
        console.warn(
          '[SECURITY WARNING] CLERK_SECRET_KEY not set. JWT signature verification is disabled. ' +
            'This is acceptable for development but MUST be configured in production.'
        );
      }
      tenant = extractTenantFromJwtUnsafe(token);
    }

    if (!tenant) {
      return c.json({ error: 'Unauthorized', message: 'Invalid token or missing tenant context' }, 401);
    }

    c.set('tenantSchema', tenant.schemaName);
    c.set('userId', tenant.userId);

    await next();
  });
}

/**
 * Default tenant middleware that extracts tenant context from the Authorization header.
 * Sets tenantSchema and userId in the Hono context.
 *
 * Uses CLERK_SECRET_KEY from environment for JWT verification when available.
 */
export const tenantMiddleware = createTenantMiddleware();
