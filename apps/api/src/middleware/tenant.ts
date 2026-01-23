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

export function extractTenantFromJwt(token: string): TenantContext | null {
  return extractTenantFromJwtUnsafe(token);
}

export function createTenantMiddleware(options?: Partial<JwtVerificationOptions>) {
  const instanceUrl = options?.instanceUrl ?? process.env['ZITADEL_INSTANCE_URL'];
  const clientId = options?.clientId ?? process.env['ZITADEL_CLIENT_ID'];

  return createMiddleware<Env>(async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' }, 401);
    }

    const token = authHeader.slice(7);
    let tenant: TenantContext | null = null;

    if (instanceUrl) {
      tenant = await verifyAndExtractTenant(token, {
        instanceUrl,
        clientId,
      });
    } else {
      if (process.env['NODE_ENV'] !== 'test') {
        console.warn(
          '[SECURITY WARNING] ZITADEL_INSTANCE_URL not set. JWT signature verification is disabled. ' +
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

export const tenantMiddleware = createTenantMiddleware();
