import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { verifyToken } from '@clerk/backend';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { Organization, MikroOrm } from '@eurocomply/db';
import type { AppVariables, UserOnlyVariables } from '../types/context.js';
import { isValidOrgId } from '../lib/validators.js';
import { loggers } from '../lib/logger.js';

const log = loggers.auth;

const CLERK_SECRET_KEY = process.env['CLERK_SECRET_KEY'];
const ENABLE_TEST_AUTH_BYPASS = process.env['ENABLE_TEST_AUTH_BYPASS'] === 'true';

// Fail fast in production if test auth bypass is enabled
// This is a critical security check - test auth bypass must NEVER be enabled in production
if (ENABLE_TEST_AUTH_BYPASS && process.env['NODE_ENV'] === 'production') {
  throw new Error(
    'SECURITY ERROR: ENABLE_TEST_AUTH_BYPASS=true is not allowed in production. ' +
    'This flag bypasses authentication and must only be used in test environments.'
  );
}

// Fail fast if Clerk is not configured (all environments except test)
// This prevents undefined behavior from missing auth configuration
if (!CLERK_SECRET_KEY && process.env['NODE_ENV'] !== 'test') {
  throw new Error(
    'CLERK_SECRET_KEY is required. Set this environment variable to enable authentication.'
  );
}

/**
 * Core authentication logic extracted for reuse.
 * Verifies token, loads user/org/permissions, and sets context.
 * Throws HTTPException on failure.
 *
 * Architecture:
 * - Organization is in PUBLIC schema
 * - User and OrganizationUser are in TENANT schema (per-org)
 * - Auth flow: look up org (public) → fork tenant EM → look up user/membership (tenant)
 */
async function performOrgAuth(
  orm: MikroORM,
  c: Context<{ Variables: AppVariables }>,
  token: string,
  orgId: string
): Promise<void> {
  // Verify JWT with Clerk
  // Note: CLERK_SECRET_KEY is validated at startup (except in test mode)
  if (!CLERK_SECRET_KEY) {
    throw new HTTPException(500, { message: 'Authentication service not configured' });
  }

  const payload = await verifyToken(token, {
    secretKey: CLERK_SECRET_KEY,
  });

  const clerkUserId = payload.sub;
  if (!clerkUserId) {
    throw new HTTPException(401, { message: 'Invalid token: missing subject' });
  }

  // Look up organization from PUBLIC schema
  const org = await orm.em.findOne(Organization, { id: orgId });
  if (!org) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  // Fork tenant-scoped EntityManager for this organization's schema
  const tenantEm = orm.em.fork({ schema: org.schemaName });

  // Look up user in TENANT schema by clerkId
  const user = await tenantEm.findOne(MikroOrm.User, { clerkId: clerkUserId });
  if (!user) {
    throw new HTTPException(401, { message: 'User not found' });
  }

  // Look up membership in TENANT schema
  const membership = await tenantEm.findOne(
    MikroOrm.OrganizationUser,
    { user: user.id },
    { populate: ['user'] }
  );
  if (!membership) {
    throw new HTTPException(403, { message: 'Not a member of this organization' });
  }

  // Set context variables
  c.set('user', {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    name: user.name ?? null,
  });

  c.set('tenant', {
    organizationId: org.id,
    schemaName: org.schemaName,
    name: org.name,
    subscriptionTier: org.subscriptionTier,
  });

  c.set('permissions', {
    role: membership.role,
    designAuthority: membership.designAuthority,
    operationsAuthority: membership.operationsAuthority,
    marketingAuthority: membership.marketingAuthority,
    complianceAuthority: membership.complianceAuthority,
  });

  // Set MikroORM context variables
  c.set('organizationId', org.id);
  c.set('em', tenantEm);
  c.set('organization', org);

  // Update last login with timeout to avoid blocking authentication
  // We await this to ensure proper error handling, but use a timeout
  // to prevent slow DB writes from delaying the auth response
  const UPDATE_TIMEOUT_MS = 1000;

  try {
    await Promise.race([
      (async () => {
        user.lastLoginAt = new Date();
        await tenantEm.flush();
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('lastLoginAt update timeout')), UPDATE_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    // Log but don't fail auth - lastLoginAt is non-critical
    log.warn({ error: err instanceof Error ? err.message : err }, 'Failed to update lastLoginAt');
  }
}

/**
 * Factory function to create auth middleware with MikroORM instance.
 * Returns all three middleware variants: auth, userAuth, optionalAuth.
 */
export function createAuthMiddleware(orm: MikroORM) {
  /**
   * Authentication middleware.
   * Verifies Clerk JWT and loads user + organization context.
   */
  const authMiddleware = createMiddleware<{ Variables: AppVariables }>(
    async (c, next) => {
      // Skip auth if context already set AND explicit test bypass is enabled
      // This allows integration tests to pre-populate user/tenant context
      // SECURITY: Requires explicit ENABLE_TEST_AUTH_BYPASS=true flag
      // Never set this flag in production/staging environments
      if (ENABLE_TEST_AUTH_BYPASS) {
        const existingUser = c.get('user');
        const existingTenant = c.get('tenant');
        if (existingUser && existingTenant) {
          await next();
          return;
        }
      }

      // Extract token from Authorization header
      const authHeader = c.req.header('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        throw new HTTPException(401, { message: 'Missing authorization token' });
      }

      const token = authHeader.slice(7);

      // Get organization ID from header or query param
      const orgId = c.req.header('X-Organization-ID') || c.req.query('org');
      if (!orgId) {
        throw new HTTPException(400, { message: 'Missing organization ID' });
      }

      // Validate org ID format before database query (security: prevents injection)
      if (!isValidOrgId(orgId)) {
        throw new HTTPException(400, { message: 'Invalid organization ID format' });
      }

      try {
        await performOrgAuth(orm, c, token, orgId);
        await next();
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        log.error({ error }, 'Authentication failed');
        throw new HTTPException(401, { message: 'Authentication failed' });
      }
    }
  );

  /**
   * User-only authentication middleware.
   * Verifies JWT and loads user, but does NOT require organization context.
   * Use for endpoints that operate across organizations (create org, list orgs).
   *
   * Note: In the multi-tenant MikroORM architecture, User is per-tenant.
   * For truly cross-org user lookup, we'd need a different approach.
   * This middleware is kept for API compatibility but may need revision
   * when implementing cross-org operations.
   */
  const userAuthMiddleware = createMiddleware<{ Variables: UserOnlyVariables }>(
    async (c, next) => {
      const authHeader = c.req.header('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        throw new HTTPException(401, { message: 'Missing or invalid authorization header' });
      }

      const token = authHeader.slice(7);

      try {
        // Note: CLERK_SECRET_KEY is validated at startup (except in test mode)
        if (!CLERK_SECRET_KEY) {
          throw new HTTPException(500, { message: 'Authentication service not configured' });
        }

        const payload = await verifyToken(token, {
          secretKey: CLERK_SECRET_KEY,
        });

        const clerkUserId = payload.sub;
        if (!clerkUserId) {
          throw new HTTPException(401, { message: 'Invalid token: missing user ID' });
        }

        // For user-only auth, we search across all tenant schemas
        // This is a simplified approach - in production, you might:
        // 1. Keep a public.users_lookup table
        // 2. Search known schemas
        // 3. Use the org from a previous request
        // For now, we'll use the public schema fork to search
        // Note: This may need architectural revision for true cross-org user lookup

        // Try to find user in public schema (fallback behavior)
        // In practice, user-only endpoints should be revised to work differently
        const em = orm.em.fork();

        // Search for user - this is a simplified approach
        // Real implementation would need to handle multi-tenant user lookup
        const user = await em.findOne(MikroOrm.User, { clerkId: clerkUserId });

        if (!user) {
          throw new HTTPException(401, { message: 'User not found' });
        }

        c.set('user', {
          id: user.id,
          clerkId: user.clerkId,
          email: user.email,
          name: user.name ?? null,
        });

        await next();
      } catch (error) {
        if (error instanceof HTTPException) throw error;
        log.error({ error }, 'Invalid or expired token');
        throw new HTTPException(401, { message: 'Invalid or expired token' });
      }
    }
  );

  /**
   * Optional auth - sets user context if token present, continues otherwise.
   * Uses performOrgAuth directly to avoid type assertion issues.
   */
  const optionalAuthMiddleware = createMiddleware<{ Variables: AppVariables }>(
    async (c, next) => {
      const authHeader = c.req.header('Authorization');

      if (!authHeader?.startsWith('Bearer ')) {
        await next();
        return;
      }

      const token = authHeader.slice(7);
      const orgId = c.req.header('X-Organization-ID') || c.req.query('org');

      // If no org ID provided, continue without full context
      if (!orgId) {
        await next();
        return;
      }

      try {
        await performOrgAuth(orm, c, token, orgId);
      } catch (error) {
        // Log auth failures for debugging (not security-sensitive since this is optional auth)
        log.debug({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Optional auth failed');
        // Continue without user context
      }

      await next();
    }
  );

  return { authMiddleware, userAuthMiddleware, optionalAuthMiddleware };
}

// For backward compatibility, export standalone middleware that throws if ORM not configured
// These are deprecated - use createAuthMiddleware(orm) instead
let _orm: MikroORM | null = null;

/**
 * Set the ORM instance for standalone middleware exports.
 * Call this at app startup before using the exported middleware.
 * @deprecated Use createAuthMiddleware(orm) instead
 */
export function setOrmInstance(orm: MikroORM): void {
  _orm = orm;
}

function getOrm(): MikroORM {
  if (!_orm) {
    throw new Error(
      'ORM not initialized. Either call setOrmInstance(orm) at startup, ' +
      'or use createAuthMiddleware(orm) to create middleware with explicit ORM injection.'
    );
  }
  return _orm;
}

/**
 * Authentication middleware (standalone export).
 * Supports test auth bypass when ENABLE_TEST_AUTH_BYPASS=true and context is pre-set.
 * @deprecated Use createAuthMiddleware(orm).authMiddleware instead
 */
export const authMiddleware = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    // Check for test auth bypass BEFORE requiring ORM
    // This allows integration tests to skip auth without initializing ORM
    if (ENABLE_TEST_AUTH_BYPASS) {
      const existingUser = c.get('user');
      const existingTenant = c.get('tenant');
      if (existingUser && existingTenant) {
        await next();
        return;
      }
    }

    // ORM is required for actual authentication
    const { authMiddleware: middleware } = createAuthMiddleware(getOrm());
    return middleware(c, next);
  }
);

/**
 * User-only authentication middleware (standalone export).
 * @deprecated Use createAuthMiddleware(orm).userAuthMiddleware instead
 */
export const userAuthMiddleware = createMiddleware<{ Variables: UserOnlyVariables }>(
  async (c, next) => {
    // Check for test auth bypass BEFORE requiring ORM
    if (ENABLE_TEST_AUTH_BYPASS) {
      const existingUser = c.get('user');
      if (existingUser) {
        await next();
        return;
      }
    }

    const { userAuthMiddleware: middleware } = createAuthMiddleware(getOrm());
    return middleware(c, next);
  }
);

/**
 * Optional auth middleware (standalone export).
 * @deprecated Use createAuthMiddleware(orm).optionalAuthMiddleware instead
 */
export const optionalAuthMiddleware = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    // For optional auth, if ORM isn't set and bypass is enabled, just continue
    if (ENABLE_TEST_AUTH_BYPASS) {
      const existingUser = c.get('user');
      const existingTenant = c.get('tenant');
      if (existingUser && existingTenant) {
        await next();
        return;
      }
    }

    // If no ORM and it's optional auth, just skip auth
    if (!_orm) {
      await next();
      return;
    }

    const { optionalAuthMiddleware: middleware } = createAuthMiddleware(getOrm());
    return middleware(c, next);
  }
);
