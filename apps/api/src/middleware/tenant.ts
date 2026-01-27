import { createMiddleware } from 'hono/factory';
import type { Env, ApiKeyAuthorities } from '../app.js';
import {
  verifyAndExtractTenant,
  extractTenantFromJwtUnsafe,
  type JwtVerificationOptions,
} from '../utils/jwt.js';
import { ApiKeyService, type EntityManager } from '@eurocomply/database';
import { error } from '../utils/response.js';

export interface TenantContext {
  schemaName: string;
  userId: string;
}

export interface TenantMiddlewareOptions extends Partial<JwtVerificationOptions> {
  /** EntityManager for API key validation */
  em?: EntityManager;
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
 * Supports two authentication methods:
 * 1. API Key: X-API-Key header with sk_live_* format
 * 2. JWT: Authorization: Bearer <token> header
 *
 * API key takes precedence if both are provided.
 *
 * In production (when CLERK_SECRET_KEY is set), JWT signatures are verified
 * against Clerk's JWKS.
 *
 * In development/testing (when CLERK_SECRET_KEY is not set), it falls back to
 * unsafe base64 decoding for convenience.
 */
export function createTenantMiddleware(options?: TenantMiddlewareOptions) {
  const secretKey = options?.secretKey ?? process.env['CLERK_SECRET_KEY'];

  return createMiddleware<Env>(async (c, next) => {
    const apiKey = c.req.header('X-API-Key');
    const authHeader = c.req.header('Authorization');

    let tenant: TenantContext | null = null;

    // Try API key authentication first
    if (apiKey) {
      if (!options?.em) {
        return error(c, 'CONFIG_ERROR', 'API key authentication not configured', 500);
      }

      const apiKeyService = new ApiKeyService(options.em);
      const result = await apiKeyService.validateKey(apiKey);

      if (!result.valid) {
        return error(c, 'UNAUTHORIZED', result.error ?? 'Invalid API key', 401);
      }

      tenant = {
        schemaName: result.schemaName!,
        userId: `api-key:${result.apiKeyId}`, // Use apiKeyId for audit traceability
      };

      // Set API key authorities in context for authorize middleware
      c.set('apiKeyAuthorities', {
        designAuthority: result.designAuthority!,
        operationsAuthority: result.operationsAuthority!,
        marketingAuthority: result.marketingAuthority!,
        complianceAuthority: result.complianceAuthority!,
        isOrgAdmin: result.isOrgAdmin!,
      } satisfies ApiKeyAuthorities);
    }
    // Fall back to JWT authentication
    else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);

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
    } else {
      return error(c, 'UNAUTHORIZED', 'Missing X-API-Key or Authorization header', 401);
    }

    if (!tenant) {
      return error(c, 'UNAUTHORIZED', 'Invalid token or missing tenant context', 401);
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
 *
 * NOTE: This middleware only supports JWT authentication.
 * For API key support, use createTenantMiddleware({ em }) with an EntityManager.
 */
export const tenantMiddleware = createTenantMiddleware();

/**
 * Creates a tenant middleware with API key support.
 * Requires an EntityManager for API key validation.
 */
export function createTenantMiddlewareWithApiKeys(em: EntityManager) {
  return createTenantMiddleware({ em });
}
