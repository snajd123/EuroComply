import { Hono } from 'hono';
import { createId } from '@eurocomply/core';
import {
  Organization,
  ProvisioningStatus,
  OutboxEvent,
  OutboxStatus,
  TenantProvisioner,
} from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';

export interface OrganizationsRouterOptions {
  orm: MikroORM;
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

  // Note: Organization creation is handled exclusively via Clerk webhooks.
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
    clerkOrgId: org.clerkOrgId,
    regulatoryAdvisorEnabled: org.regulatoryAdvisorEnabled,
    enforcementMode: org.enforcementMode,
    captureComplianceInSilentMode: org.captureComplianceInSilentMode,
    provisioningStatus: org.provisioningStatus,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

// ============================================================================
// Admin Router for Provisioning Operations
// ============================================================================

export interface OrganizationsAdminRouterOptions {
  orm: MikroORM;
  provisioner: TenantProvisioner;
}

export function createOrganizationsAdminRouter(options: OrganizationsAdminRouterOptions) {
  const { orm, provisioner } = options;
  const router = new Hono();

  /**
   * GET /organizations/:id/status
   *
   * Get organization status by ID (internal ID or Clerk org ID)
   */
  router.get('/:id/status', async (c) => {
    const id = c.req.param('id');
    const em = orm.em.fork();

    // Try to find by internal ID first, then by Clerk org ID
    let org = await em.findOne(Organization, { id });
    if (!org) {
      org = await em.findOne(Organization, { clerkOrgId: id });
    }

    if (!org) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    return c.json({
      id: org.id,
      name: org.name,
      schemaName: org.schemaName,
      clerkOrgId: org.clerkOrgId,
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

    const now = new Date();
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
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
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
   * DELETE /organizations/:id
   *
   * Deletes an organization and drops its tenant schema.
   * Use this to retry a failed deletion or manually delete an org.
   */
  router.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const em = orm.em.fork();

    // Try to find by internal ID first, then by Clerk org ID
    let org = await em.findOne(Organization, { id });
    if (!org) {
      org = await em.findOne(Organization, { clerkOrgId: id });
    }

    if (!org) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    const { id: organizationId, schemaName, clerkOrgId } = org;

    // 1. Try to drop the tenant schema
    try {
      await provisioner.dropSchema(schemaName);
    } catch (dropError) {
      const errorMsg = dropError instanceof Error ? dropError.message : String(dropError);

      // If schema doesn't exist, that's fine - continue with deletion
      if (!errorMsg.includes('does not exist') && !errorMsg.includes('not found')) {
        // Real error - mark org as failed
        org.provisioningStatus = ProvisioningStatus.FAILED;
        org.provisioningError = `Deletion failed: Could not drop schema - ${errorMsg}`;
        await em.flush();

        return c.json({
          success: false,
          error: `Failed to drop schema: ${errorMsg}`,
          organizationId,
          schemaName,
        }, 500);
      }
    }

    // 2. Create outbox event before deleting
    const deleteNow = new Date();
    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: organizationId,
      eventType: 'organization.deleted',
      payload: {
        organizationId,
        clerkOrgId,
        schemaName,
        deletedVia: 'admin_endpoint',
      },
      status: OutboxStatus.PENDING,
      retryCount: 0,
      createdAt: deleteNow,
      updatedAt: deleteNow,
    });
    em.persist(outboxEvent);

    // 3. Delete the organization record
    em.remove(org);
    await em.flush();

    return c.json({
      success: true,
      organizationId,
      clerkOrgId,
      schemaName,
      message: 'Organization and tenant schema deleted',
    });
  });

  return router;
}
