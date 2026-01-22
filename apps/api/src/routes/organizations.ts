import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createId } from '@eurocomply/core';
import { Organization, ProvisioningStatus, OutboxEvent, OutboxStatus } from '@eurocomply/database';

// In-memory store for testing (will be replaced with MikroORM)
interface LocalOrganization {
  id: string;
  name: string;
  schemaName: string;
  clerkOrgId?: string;
  regulatoryAdvisorEnabled: boolean;
  enforcementMode: 'ENFORCING' | 'SILENT';
  captureComplianceInSilentMode: boolean;
  kmsKeyArn?: string;
  createdAt: string;
  updatedAt: string;
}

const organizations: Map<string, LocalOrganization> = new Map();

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  schemaName: z.string().min(1).max(63).regex(/^tenant_[a-z0-9_]+$/),
  clerkOrgId: z.string().optional(),
  regulatoryAdvisorEnabled: z.boolean().default(true),
  enforcementMode: z.enum(['ENFORCING', 'SILENT']).default('SILENT'),
  captureComplianceInSilentMode: z.boolean().default(true),
});

export const organizationsRouter = new Hono();

// List organizations
organizationsRouter.get('/', (c) => {
  const orgs = Array.from(organizations.values());
  return c.json({
    data: orgs,
    meta: { total: orgs.length },
  });
});

// Create organization
organizationsRouter.post(
  '/',
  zValidator('json', createOrganizationSchema),
  (c) => {
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const org: LocalOrganization = {
      id: createId(),
      name: body.name,
      schemaName: body.schemaName,
      clerkOrgId: body.clerkOrgId,
      regulatoryAdvisorEnabled: body.regulatoryAdvisorEnabled,
      enforcementMode: body.enforcementMode,
      captureComplianceInSilentMode: body.captureComplianceInSilentMode,
      createdAt: now,
      updatedAt: now,
    };

    organizations.set(org.id, org);

    return c.json({ data: org }, 201);
  }
);

// Get organization by ID
organizationsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const org = organizations.get(id);

  if (!org) {
    return c.json({ error: 'Not Found', message: 'Organization not found' }, 404);
  }

  return c.json({ data: org });
});

// ============================================================================
// Admin Router for Provisioning Operations
// ============================================================================

export interface OrmLike {
  em: {
    fork: () => EntityManagerLike;
  };
}

export interface EntityManagerLike {
  findOne: <T>(entity: new () => T, where: Record<string, unknown>) => Promise<T | null>;
  flush: () => Promise<void>;
  create: <T>(entity: new () => T, data: Record<string, unknown>) => T;
  persist: (entity: unknown) => void;
}

export interface TenantProvisionerLike {
  provisionTenant: (schemaName: string) => Promise<{ success: boolean; schemaName: string; error?: string }>;
}

export interface OrganizationsAdminRouterOptions {
  orm: OrmLike;
  provisioner: TenantProvisionerLike;
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
   * POST /organizations/:id/retry-provisioning
   *
   * Retries provisioning for a failed organization.
   * Use this when provisioning failed due to transient errors (DB connection, etc.)
   */
  router.post('/:id/retry-provisioning', async (c) => {
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

    // Store previous error for the event payload
    const previousError = org.provisioningError;

    // Update status to PROVISIONING
    org.provisioningStatus = ProvisioningStatus.PROVISIONING;
    org.provisioningError = undefined;
    await em.flush();

    // Retry provisioning
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

    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: org.id,
      eventType: 'organization.provisioning_retried',
      payload: {
        organizationId: org.id,
        schemaName: org.schemaName,
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

  return router;
}
