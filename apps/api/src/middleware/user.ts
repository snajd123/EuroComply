// apps/api/src/middleware/user.ts
import { createMiddleware } from 'hono/factory';
import type { Env } from '../app.js';
import { User, type MikroORM } from '@eurocomply/database';
import { error } from '../utils/response.js';

export interface UserMiddlewareOptions {
  orm: MikroORM;
}

export function createUserMiddleware(options: UserMiddlewareOptions) {
  const { orm } = options;

  return createMiddleware<Env>(async (c, next) => {
    const tenantSchema = c.get('tenantSchema');
    const clerkUserId = c.get('userId');

    // Guard: tenantMiddleware must run first
    if (!tenantSchema) {
      return error(c, 'UNAUTHORIZED', 'Missing tenant context', 401);
    }

    // Skip for API key auth (already has org-level access)
    if (!clerkUserId || clerkUserId.startsWith('api-key:')) {
      await next();
      return;
    }

    // Look up user in tenant schema with proper search_path for JOINs
    const em = orm.em.fork({ schema: tenantSchema });

    // Use transaction to scope search_path and avoid connection pool leakage
    const user = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${tenantSchema}", public`);
      return txEm.findOne(
        User,
        { clerkId: clerkUserId, deletedAt: null },
        { populate: ['membership'] }
      );
    });

    // Race condition: user has valid JWT but webhook hasn't synced yet
    if (!user) {
      const response = error(c, 'PROVISIONING', 'Setting up your account. Please retry in a moment.', 202, { retryAfter: 2 });
      response.headers.set('Retry-After', '2');
      return response;
    }

    // User was soft-deleted or has no membership
    if (!user.membership) {
      return error(c, 'FORBIDDEN', 'You are no longer a member of this organization', 403);
    }

    // Attach to context
    c.set('user', user);
    c.set('membership', user.membership);

    // Update last login (fire and forget, don't block request)
    em.nativeUpdate(User, { id: user.id }, { lastLoginAt: new Date() })
      .catch(() => {}); // Ignore errors

    await next();
  });
}
