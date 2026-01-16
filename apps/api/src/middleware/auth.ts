import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { verifyToken } from '@clerk/backend';
import { prisma, getTenantConnectionManager } from '@eurocomply/db';
import type { AppVariables } from '../types/context.js';

const CLERK_SECRET_KEY = process.env['CLERK_SECRET_KEY'];

if (!CLERK_SECRET_KEY) {
  console.warn('CLERK_SECRET_KEY not set - auth will fail');
}

/**
 * Authentication middleware.
 * Verifies Clerk JWT and loads user + organization context.
 */
export const authMiddleware = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    // Extract token from Authorization header
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing authorization token' });
    }

    const token = authHeader.slice(7);

    try {
      // Verify JWT with Clerk
      const payload = await verifyToken(token, {
        secretKey: CLERK_SECRET_KEY!,
      });

      const clerkUserId = payload.sub;
      if (!clerkUserId) {
        throw new HTTPException(401, { message: 'Invalid token: missing subject' });
      }

      // Get organization ID from header or query param
      const orgId = c.req.header('X-Organization-ID') || c.req.query('org');
      if (!orgId) {
        throw new HTTPException(400, { message: 'Missing organization ID' });
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

      // Update last login (fire and forget)
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }).catch(() => {}); // Ignore errors

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
 * Optional auth - sets user context if token present, continues otherwise.
 */
export const optionalAuthMiddleware = createMiddleware<{ Variables: Partial<AppVariables> }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      await next();
      return;
    }

    // Delegate to full auth middleware
    try {
      // Type assertion needed because authMiddleware expects full AppVariables
      // but optionalAuthMiddleware uses Partial<AppVariables>
      await authMiddleware(c as unknown as Parameters<typeof authMiddleware>[0], next);
    } catch {
      // If auth fails, continue without user context
      await next();
    }
  }
);
