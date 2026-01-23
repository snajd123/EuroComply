import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createId } from '@eurocomply/core';
import {
  Organization,
  ProvisioningStatus,
  OutboxEvent,
  OutboxStatus,
  generateSchemaName,
} from '@eurocomply/database';

// ============================================================================
// Type Definitions
// ============================================================================

export interface EntityManagerLike {
  findOne: <T>(entity: new () => T, where: Record<string, unknown>) => Promise<T | null>;
  findAll: <T>(entity: new () => T) => Promise<T[]>;
  find: <T>(entity: new () => T, where: Record<string, unknown>) => Promise<T[]>;
  create: <T>(entity: new () => T, data: Record<string, unknown>) => T;
  persist: (entity: unknown) => void;
  persistAndFlush: (entity: unknown) => Promise<void>;
  removeAndFlush: (entity: unknown) => Promise<void>;
  flush: () => Promise<void>;
  fork: (options?: { schema?: string }) => EntityManagerLike;
}

export interface OrmLike {
  em: EntityManagerLike;
}

export interface TenantProvisionerLike {
  provisionTenant: (schemaName: string) => Promise<{ success: boolean; schemaName: string; error?: string; alreadyProvisioned?: boolean }>;
  dropSchema: (schemaName: string) => Promise<void>;
}

// ============================================================================
// Zod Schemas
// ============================================================================

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  zitadelOrgId: z.string().optional(),
  regulatoryAdvisorEnabled: z.boolean().default(true),
  enforcementMode: z.enum(['ENFORCING', 'SILENT']).default('SILENT'),
  captureComplianceInSilentMode: z.boolean().default(true),
});

export interface OrganizationsRouterOptions {
  orm: OrmLike;
}

/**
 * Creates the organizations router with database backing.
 */
export function createOrganizationsRouter(options: OrganizationsRouterOptions) {
  const { orm } = options;
  const router = new Hono();

  // List organizations (read-only)
  router.get('/', async (c) => {
    const em = orm.em.fork();
    const orgs = await em.findAll(Organization);

    return c.json({
      data: orgs.map(serializeOrganization),
      meta: { total: orgs.length },
    });
  });

  // Note: Organization creation is handled exclusively via ZITADEL webhooks.
  // There is no public POST endpoint - this ensures single source of truth.

  // Get organization by ID
  router.get('/:id', async (c) => {
    const em = orm.em.fork();
    const id = c.req.param('id');
    const org = await em.findOne(Organization, { id });

    if (!org) {
      return c.json({ error: 'Not Found', message: 'Organization not found' }, 404);
    }

    return c.json({ data: serializeOrganization(org) });
  });

  return router;
}

/**
 * Serializes an Organization entity to a plain object for API response.
 */
function serializeOrganization(org: Organization) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    schemaName: org.schemaName,
    zitadelOrgId: org.zitadelOrgId,
    regulatoryAdvisorEnabled: org.regulatoryAdvisorEnabled,
    enforcementMode: org.enforcementMode,
    captureComplianceInSilentMode: org.captureComplianceInSilentMode,
    provisioningStatus: org.provisioningStatus,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

/**
 * @deprecated Use createOrganizationsRouter with ORM injection instead.
 * This is kept for backwards compatibility with tests that don't have database.
 */
export const organizationsRouter = new Hono();

// In-memory fallback for tests without database
const inMemoryOrgs: Map<string, ReturnType<typeof serializeOrganization>> = new Map();

organizationsRouter.get('/', (c) => {
  const orgs = Array.from(inMemoryOrgs.values());
  return c.json({ data: orgs, meta: { total: orgs.length } });
});

organizationsRouter.post(
  '/',
  zValidator('json', createOrganizationSchema),
  (c) => {
    const body = c.req.valid('json');
    const now = new Date().toISOString();
    const schemaName = generateSchemaName(body.slug);

    const org = {
      id: createId(),
      name: body.name,
      slug: body.slug,
      schemaName,
      zitadelOrgId: body.zitadelOrgId,
      regulatoryAdvisorEnabled: body.regulatoryAdvisorEnabled,
      enforcementMode: body.enforcementMode,
      captureComplianceInSilentMode: body.captureComplianceInSilentMode,
      provisioningStatus: ProvisioningStatus.PENDING as const,
      createdAt: now,
      updatedAt: now,
    };

    inMemoryOrgs.set(org.id, org);
    return c.json({ data: org }, 201);
  }
);

organizationsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const org = inMemoryOrgs.get(id);

  if (!org) {
    return c.json({ error: 'Not Found', message: 'Organization not found' }, 404);
  }

  return c.json({ data: org });
});

export function clearOrganizationsStore(): void {
  inMemoryOrgs.clear();
}

// ============================================================================
// Admin Router for Provisioning Operations
// ============================================================================

export interface ZitadelClient {
  organizations: {
    updateOrganizationMetadata: (
      orgId: string,
      params: { publicMetadata: Record<string, unknown> }
    ) => Promise<unknown>;
  };
}

export interface OrganizationsAdminRouterOptions {
  orm: OrmLike;
  provisioner: TenantProvisionerLike;
  zitadel?: ZitadelClient;
}

export function createOrganizationsAdminRouter(options: OrganizationsAdminRouterOptions) {
  const { orm, provisioner, zitadel } = options;
  const router = new Hono();

  /**
   * GET /organizations/:id/status
   *
   * Get organization status by ID (internal ID or ZITADEL org ID)
   */
  router.get('/:id/status', async (c) => {
    const id = c.req.param('id');
    const em = orm.em.fork();

    // Try to find by internal ID first, then by ZITADEL org ID
    let org = await em.findOne(Organization, { id });
    if (!org) {
      org = await em.findOne(Organization, { zitadelOrgId: id });
    }

    if (!org) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    return c.json({
      id: org.id,
      name: org.name,
      schemaName: org.schemaName,
      zitadelOrgId: org.zitadelOrgId,
      provisioningStatus: org.provisioningStatus,
      provisioningError: org.provisioningError,
    });
  });

  /**
   * POST /organizations/:id/provision
   *
   * Provisions an organization with PENDING or FAILED status.
   * - PENDING: Initial provisioning (e.g., if webhook didn't auto-provision)
   * - FAILED: Retry after transient errors (DB connection, etc.)
   * - READY: Returns 400 (already provisioned)
   */
  router.post('/:id/provision', async (c) => {
    const id = c.req.param('id');
    const em = orm.em.fork();

    const org = await em.findOne(Organization, { id });

    if (!org) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    if (org.provisioningStatus === ProvisioningStatus.READY) {
      return c.json({
        error: 'Organization already provisioned',
        message: 'This organization is already in READY state',
      }, 400);
    }

    // Store previous status/error for the event payload
    const previousStatus = org.provisioningStatus;
    const previousError = org.provisioningError;

    // Update status to PROVISIONING
    org.provisioningStatus = ProvisioningStatus.PROVISIONING;
    org.provisioningError = undefined;
    await em.flush();

    // Provision the tenant
    const result = await provisioner.provisionTenant(org.schemaName);

    if (!result.success) {
      org.provisioningStatus = ProvisioningStatus.FAILED;
      org.provisioningError = result.error;
      await em.flush();

      return c.json({
        success: false,
        error: `Provisioning failed: ${result.error}`,
      }, 500);
    }

    // Success - update status and emit event
    org.provisioningStatus = ProvisioningStatus.READY;

    const eventType = previousStatus === ProvisioningStatus.FAILED
      ? 'organization.provisioning_retried'
      : 'organization.provisioned';

    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: org.id,
      eventType,
      payload: {
        organizationId: org.id,
        schemaName: org.schemaName,
        previousStatus,
        previousError,
      },
      status: OutboxStatus.PENDING,
    });
    em.persist(outboxEvent);
    await em.flush();

    return c.json({
      success: true,
      organizationId: org.id,
      schemaName: org.schemaName,
      provisioningStatus: org.provisioningStatus,
    });
  });

  /**
   * POST /organizations/:id/retry-deletion
   *
   * Retries deletion for organizations stuck in DELETE_FAILED or DELETING status.
   * This endpoint is for admin recovery when deletion fails.
   */
  router.post('/:id/retry-deletion', async (c) => {
    const id = c.req.param('id');
    const em = orm.em.fork();

    // Try to find by internal ID first, then by ZITADEL org ID
    let org = await em.findOne(Organization, { id });
    if (!org) {
      org = await em.findOne(Organization, { zitadelOrgId: id });
    }

    if (!org) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    // Only allow retry for DELETE_FAILED or stuck DELETING
    if (
      org.provisioningStatus !== ProvisioningStatus.DELETE_FAILED &&
      org.provisioningStatus !== ProvisioningStatus.DELETING
    ) {
      return c.json({
        error: 'Invalid state for retry deletion',
        message: `Organization is in ${org.provisioningStatus} state. Only DELETE_FAILED or DELETING orgs can be retried.`,
      }, 400);
    }

    const { id: organizationId, schemaName, name, slug, zitadelOrgId } = org;

    try {
      // Mark as DELETING
      org.provisioningStatus = ProvisioningStatus.DELETING;
      org.provisioningError = undefined;
      await em.flush();

      // Create outbox event for deletion retry
      const outboxEvent = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: organizationId,
        eventType: 'organization.deletion_retried',
        payload: {
          organizationId,
          zitadelOrgId,
          schemaName,
          name,
          slug,
        },
        status: OutboxStatus.PENDING,
      });
      em.persist(outboxEvent);
      await em.flush();

      // Drop tenant schema
      await provisioner.dropSchema(schemaName);

      // Delete organization record
      await em.removeAndFlush(org);

      return c.json({
        success: true,
        message: 'Organization and tenant schema deleted',
        organizationId,
        schemaName,
      });
    } catch (error) {
      // Schema drop failed - mark as DELETE_FAILED
      const errorMessage = error instanceof Error ? error.message : String(error);
      org.provisioningStatus = ProvisioningStatus.DELETE_FAILED;
      org.provisioningError = errorMessage;
      await em.flush();

      return c.json({
        success: false,
        error: `Deletion failed: ${errorMessage}`,
      }, 500);
    }
  });

  /**
   * POST /organizations/:id/sync-zitadel-metadata
   *
   * Manually syncs organization metadata to ZITADEL.
   * Useful when ZITADEL update fails during provisioning.
   */
  router.post('/:id/sync-zitadel-metadata', async (c) => {
    const id = c.req.param('id');
    const em = orm.em.fork();

    if (!zitadel) {
      return c.json({ error: 'ZITADEL client not configured' }, 500);
    }

    // Try to find by internal ID first, then by ZITADEL org ID
    let org = await em.findOne(Organization, { id });
    if (!org) {
      org = await em.findOne(Organization, { zitadelOrgId: id });
    }

    if (!org) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    if (!org.zitadelOrgId) {
      return c.json({ error: 'Organization has no ZITADEL ID' }, 400);
    }

    try {
      await zitadel.organizations.updateOrganizationMetadata(org.zitadelOrgId, {
        publicMetadata: {
          schema_name: org.schemaName,
          tier: org.subscriptionTier?.toLowerCase() ?? 'starter',
          cell_id: org.cellId,
        },
      });

      return c.json({
        success: true,
        message: 'ZITADEL metadata synced successfully',
        organizationId: org.id,
        zitadelOrgId: org.zitadelOrgId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({
        success: false,
        error: `ZITADEL sync failed: ${errorMessage}`,
      }, 500);
    }
  });

  return router;
}
