import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { Organization } from '@eurocomply/db';
import { createLogger } from '../lib/logger.js';

const log = createLogger({ module: 'tenant' });

interface TenantVariables {
  organizationId: string;
  em: EntityManager;
  organization: Organization;
}

/**
 * Tenant middleware for MikroORM schema isolation.
 * Looks up organization and forks an EntityManager scoped to the tenant's schema.
 *
 * Prerequisites: organizationId must be set in context (by auth middleware).
 */
export function tenantMiddleware(orm: MikroORM) {
  return createMiddleware<{ Variables: TenantVariables }>(async (c, next) => {
    const organizationId = c.get('organizationId');

    // Validate organizationId is set (should be set by auth middleware)
    if (!organizationId) {
      log.warn('organizationId not set in context - auth middleware may not have run');
      throw new HTTPException(400, { message: 'Organization ID not set in context' });
    }

    // Lookup organization from public.organizations
    let org: Organization | null;
    try {
      org = await orm.em.findOne(Organization, { id: organizationId });
    } catch (error) {
      log.error({ error, organizationId }, 'Database error looking up organization');
      throw new HTTPException(500, { message: 'Database error' });
    }

    if (!org) {
      log.warn({ organizationId }, 'Organization not found');
      throw new HTTPException(404, { message: 'Organization not found' });
    }

    // Fork EntityManager with tenant schema
    const tenantEm = orm.em.fork({ schema: org.schemaName });
    c.set('em', tenantEm);
    c.set('organization', org);

    log.debug({ organizationId, schema: org.schemaName }, 'Tenant context established');

    try {
      await next();
    } finally {
      // Cleanup - always clear EntityManager even on error
      tenantEm.clear();
    }
  });
}
