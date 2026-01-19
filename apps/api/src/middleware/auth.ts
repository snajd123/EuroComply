import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { verifyToken } from '@clerk/backend';
import { prisma, getTenantConnectionManager } from '@eurocomply/db';
import type { AppVariables, UserOnlyVariables } from '../types/context.js';

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
 */
async function performOrgAuth(
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

  // Load user from database
  const user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    throw new HTTPException(401, { message: 'User not found' });
  }

  // Load organization and membership
  const membership = await prisma.organizationUser.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId: user.id,
      },
    },
    include: {
      organization: true,
    },
  });

  if (!membership) {
    throw new HTTPException(403, { message: 'Not a member of this organization' });
  }

  // Set context variables
  c.set('user', {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    name: user.name,
  });

  c.set('tenant', {
    organizationId: membership.organization.id,
    schemaName: membership.organization.schemaName,
    name: membership.organization.name,
    subscriptionTier: membership.organization.subscriptionTier,
  });

  c.set('permissions', {
    role: membership.role,
    designAuthority: membership.designAuthority,
    operationsAuthority: membership.operationsAuthority,
    marketingAuthority: membership.marketingAuthority,
    complianceAuthority: membership.complianceAuthority,
  });

  // Create tenant-scoped database client
  const tenantManager = getTenantConnectionManager(prisma);
  const tenantClient = tenantManager.getClient({
    organizationId: membership.organization.id,
    schemaName: membership.organization.schemaName,
    userId: user.id,
  });

  c.set('db', tenantClient);

  // Update last login with timeout to avoid blocking authentication
  // We await this to ensure proper error handling, but use a timeout
  // to prevent slow DB writes from delaying the auth response
  const UPDATE_TIMEOUT_MS = 1000;

  try {
    await Promise.race([
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('lastLoginAt update timeout')), UPDATE_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    // Log but don't fail auth - lastLoginAt is non-critical
    console.error(
      'Failed to update lastLoginAt:',
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Authentication middleware.
 * Verifies Clerk JWT and loads user + organization context.
 */
export const authMiddleware = createMiddleware<{ Variables: AppVariables }>(
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

    try {
      await performOrgAuth(c, token, orgId);
      await next();
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      console.error('Auth error:', error);
      throw new HTTPException(401, { message: 'Authentication failed' });
    }
  }
);

/**
 * User-only authentication middleware.
 * Verifies JWT and loads user, but does NOT require organization context.
 * Use for endpoints that operate across organizations (create org, list orgs).
 */
export const userAuthMiddleware = createMiddleware<{ Variables: UserOnlyVariables }>(
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

      const user = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
      });

      if (!user) {
        throw new HTTPException(401, { message: 'User not found' });
      }

      c.set('user', {
        id: user.id,
        clerkId: user.clerkId,
        email: user.email,
        name: user.name,
      });

      await next();
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      console.error('Auth error:', error);
      throw new HTTPException(401, { message: 'Invalid or expired token' });
    }
  }
);

/**
 * Optional auth - sets user context if token present, continues otherwise.
 * Uses performOrgAuth directly to avoid type assertion issues.
 */
export const optionalAuthMiddleware = createMiddleware<{ Variables: AppVariables }>(
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
      await performOrgAuth(c, token, orgId);
    } catch (error) {
      // Log auth failures for debugging (not security-sensitive since this is optional auth)
      if (process.env['NODE_ENV'] !== 'production') {
        console.debug('[optionalAuth] Auth failed:', error instanceof Error ? error.message : 'Unknown error');
      }
      // Continue without user context
    }

    await next();
  }
);
