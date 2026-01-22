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
  flush: () => Promise<void>;
  fork: (options?: { schema?: string }) => EntityManagerLike;
}

export interface OrmLike {
  em: EntityManagerLike;
}

export interface TenantProvisionerLike {
  provisionTenant: (schemaName: string) => Promise<{ success: boolean; schemaName: string; error?: string }>;
}

// ============================================================================
// Zod Schemas
// ============================================================================

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  clerkOrgId: z.string().optional(),
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

  // List organizations
  router.get('/', async (c) => {
    const em = orm.em.fork();
    const orgs = await em.findAll(Organization);

    return c.json({
      data: orgs.map(serializeOrganization),
      meta: { total: orgs.length },
    });
  });

  // Create organization
  router.post(
    '/',
    zValidator('json', createOrganizationSchema),
    async (c) => {
      const em = orm.em.fork();
      const body = c.req.valid('json');

      // Check for duplicate slug
      const existing = await em.findOne(Organization, { slug: body.slug });
      if (existing) {
        return c.json({ error: 'Conflict', message: 'Organization with this slug already exists' }, 409);
      }

      // Generate schema name from slug
      const schemaName = generateSchemaName(body.slug);

      const org = em.create(Organization, {
        id: createId(),
        name: body.name,
        slug: body.slug,
        schemaName,
        clerkOrgId: body.clerkOrgId,
        regulatoryAdvisorEnabled: body.regulatoryAdvisorEnabled,
        enforcementMode: body.enforcementMode,
        captureComplianceInSilentMode: body.captureComplianceInSilentMode,
        provisioningStatus: ProvisioningStatus.PENDING,
      });

      await em.persistAndFlush(org);

      return c.json({ data: serializeOrganization(org) }, 201);
    }
  );

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
      clerkOrgId: body.clerkOrgId,
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
