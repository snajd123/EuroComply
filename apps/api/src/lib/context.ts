import type { Context } from 'hono';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { Organization } from '@eurocomply/db';
import { HTTPException } from 'hono/http-exception';
import type { AppVariables, AuthUser, TenantInfo, UserPermissions } from '../types/context.js';

type AppContext = Context<{ Variables: AppVariables }>;

/**
 * Gets the tenant-scoped EntityManager from context.
 * Throws 500 if not set (indicates middleware misconfiguration).
 */
export function getEntityManager(c: AppContext): EntityManager {
  const em = c.get('em');
  if (!em) {
    throw new HTTPException(500, {
      message: 'EntityManager not available - ensure auth middleware ran'
    });
  }
  return em;
}

/**
 * Gets the organization from context.
 * Throws 500 if not set.
 */
export function getOrganization(c: AppContext): Organization {
  const org = c.get('organization');
  if (!org) {
    throw new HTTPException(500, {
      message: 'Organization not available - ensure auth middleware ran'
    });
  }
  return org;
}

/**
 * Gets the authenticated user from context.
 * Throws 500 if not set.
 */
export function getUser(c: AppContext): AuthUser {
  const user = c.get('user');
  if (!user) {
    throw new HTTPException(500, {
      message: 'User not available - ensure auth middleware ran'
    });
  }
  return user;
}

/**
 * Gets the tenant info from context.
 * Throws 500 if not set.
 */
export function getTenant(c: AppContext): TenantInfo {
  const tenant = c.get('tenant');
  if (!tenant) {
    throw new HTTPException(500, {
      message: 'Tenant not available - ensure auth middleware ran'
    });
  }
  return tenant;
}

/**
 * Gets the user permissions from context.
 * Throws 500 if not set.
 */
export function getPermissions(c: AppContext): UserPermissions {
  const permissions = c.get('permissions');
  if (!permissions) {
    throw new HTTPException(500, {
      message: 'Permissions not available - ensure auth middleware ran'
    });
  }
  return permissions;
}

/**
 * Gets all auth context at once for convenience.
 * Useful when you need multiple context values.
 */
export function getAuthContext(c: AppContext) {
  return {
    em: getEntityManager(c),
    organization: getOrganization(c),
    user: getUser(c),
    tenant: getTenant(c),
    permissions: getPermissions(c),
  };
}
