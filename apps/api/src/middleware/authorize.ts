import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { hasAuthority, type AuthorityLevel, type WorkspaceType } from '@eurocomply/shared';
import type { AppVariables } from '../types/context.js';

/**
 * Authorization middleware factory.
 * Checks if the user has the required authority for a workspace.
 */
export function requireAuthority(
  workspace: WorkspaceType,
  requiredAuthority: AuthorityLevel
) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const permissions = c.get('permissions');

    if (!permissions) {
      throw new HTTPException(401, { message: 'Not authenticated' });
    }

    // Get user's authority for the specified workspace
    const authorityKey = `${workspace}Authority` as keyof typeof permissions;
    const userAuthority = permissions[authorityKey] as AuthorityLevel;

    if (!hasAuthority(userAuthority, requiredAuthority)) {
      throw new HTTPException(403, {
        message: 'Insufficient permissions for this operation',
      });
    }

    await next();
  });
}

/**
 * Require user to be an organization owner or admin.
 */
export const requireOrgAdmin = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const permissions = c.get('permissions');

    if (!permissions) {
      throw new HTTPException(401, { message: 'Not authenticated' });
    }

    if (!['owner', 'admin'].includes(permissions.role)) {
      throw new HTTPException(403, {
        message: 'Organization admin access required',
      });
    }

    await next();
  }
);

/**
 * Require user to be the organization owner.
 */
export const requireOrgOwner = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const permissions = c.get('permissions');

    if (!permissions) {
      throw new HTTPException(401, { message: 'Not authenticated' });
    }

    if (permissions.role !== 'owner') {
      throw new HTTPException(403, {
        message: 'Organization owner access required',
      });
    }

    await next();
  }
);
