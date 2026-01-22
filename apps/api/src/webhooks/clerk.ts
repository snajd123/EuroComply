import {
  Organization,
  ProvisioningStatus,
  OutboxEvent,
  OutboxStatus,
} from '@eurocomply/database';
import { createId } from '@eurocomply/core';

export interface ClerkOrganizationEvent {
  type: 'organization.created' | 'organization.updated' | 'organization.deleted';
  data: {
    id: string;
    name: string;
    slug: string;
    created_at: number;
    public_metadata?: Record<string, unknown>;
  };
}

export interface ClerkClient {
  organizations: {
    updateOrganizationMetadata: (
      orgId: string,
      params: { publicMetadata: Record<string, unknown> }
    ) => Promise<unknown>;
  };
}

/**
 * Minimal interface for the ORM dependency.
 * This allows the handler to work with any ORM that provides these methods,
 * making it easier to test and avoiding tight coupling to MikroORM.
 */
export interface OrmLike {
  em: {
    fork: () => EntityManagerLike;
  };
}

export interface EntityManagerLike {
  create<T>(entityClass: new () => T, data: Partial<T>): T;
  persist(entity: object): void;
  flush(): Promise<void>;
  findOne<T>(entityClass: new () => T, where: Record<string, unknown>): Promise<T | null>;
}

/**
 * Interface for the TenantProvisioner dependency.
 * Matches the public API of TenantProvisioner from @eurocomply/database.
 */
export interface TenantProvisionerLike {
  provisionTenant(schemaName: string): Promise<{ success: boolean; schemaName: string; error?: string }>;
  dropSchema(schemaName: string): Promise<void>;
}

export interface HandlerDependencies {
  orm: OrmLike;
  provisioner: TenantProvisionerLike;
  clerk?: ClerkClient;
}

export interface HandlerResult {
  success: boolean;
  organizationId?: string;
  schemaName?: string;
  error?: string;
}

/**
 * Converts a Clerk organization ID to a valid PostgreSQL schema name.
 * Uses the last 8 characters of the org ID for uniqueness while keeping names short.
 *
 * Why not slug? Slugs can change if the org is renamed in Clerk, causing sync issues.
 * The Clerk org ID is immutable.
 */
export function clerkOrgIdToSchemaName(clerkOrgId: string): string {
  // Remove 'org_' prefix if present and take last 8 chars (or all if shorter)
  const idPart = clerkOrgId.replace(/^org_/, '');
  const suffix = idPart.length > 8 ? idPart.slice(-8) : idPart;

  return `tenant_org_${suffix.toLowerCase()}`;
}

/**
 * Handles the organization.created webhook event.
 * Creates the organization record and provisions the tenant schema.
 */
export async function handleOrganizationCreated(
  event: ClerkOrganizationEvent,
  deps: HandlerDependencies
): Promise<HandlerResult> {
  const { orm, provisioner, clerk } = deps;
  const { id: clerkOrgId, name, slug } = event.data;
  const schemaName = clerkOrgIdToSchemaName(clerkOrgId);

  const em = orm.em.fork();

  try {
    // 1. Create Organization record
    const org = em.create(Organization, {
      id: createId(),
      name,
      slug,
      schemaName,
      clerkOrgId,
      provisioningStatus: ProvisioningStatus.PROVISIONING,
    });
    em.persist(org);
    await em.flush();

    // 2. Provision tenant schema
    const provisionResult = await provisioner.provisionTenant(schemaName);

    if (!provisionResult.success) {
      // Update org with failure status
      org.provisioningStatus = ProvisioningStatus.FAILED;
      org.provisioningError = provisionResult.error;
      await em.flush();

      return {
        success: false,
        organizationId: org.id,
        schemaName,
        error: `Provisioning failed: ${provisionResult.error}`,
      };
    }

    // 3. Update organization status to ready
    org.provisioningStatus = ProvisioningStatus.READY;

    // 4. Create outbox event
    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: org.id,
      eventType: 'organization.provisioned',
      payload: {
        organizationId: org.id,
        clerkOrgId,
        schemaName,
        name,
        slug,
      },
      status: OutboxStatus.PENDING,
    });
    em.persist(outboxEvent);
    await em.flush();

    // 5. Update Clerk metadata (if clerk client provided)
    if (clerk) {
      await clerk.organizations.updateOrganizationMetadata(clerkOrgId, {
        publicMetadata: {
          schema_name: schemaName,
          tier: 'starter',
          cell_id: 'cell_1',
        },
      });
    }

    return {
      success: true,
      organizationId: org.id,
      schemaName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      schemaName,
      error: errorMessage,
    };
  }
}

/**
 * Handles the organization.deleted webhook event.
 * Note: We don't actually drop schemas - just mark as deleted for audit trail.
 */
export async function handleOrganizationDeleted(
  event: ClerkOrganizationEvent,
  deps: Pick<HandlerDependencies, 'orm' | 'provisioner'>
): Promise<HandlerResult> {
  const { orm } = deps;
  const { id: clerkOrgId } = event.data;

  const em = orm.em.fork();

  try {
    const org = await em.findOne(Organization, { clerkOrgId });

    if (!org) {
      return {
        success: false,
        error: `Organization not found for Clerk ID: ${clerkOrgId}`,
      };
    }

    // Mark as deleted but don't actually remove
    // In production, you might have a deletedAt field instead
    org.provisioningStatus = ProvisioningStatus.FAILED;
    org.provisioningError = 'Organization deleted via Clerk';

    // Create outbox event
    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: org.id,
      eventType: 'organization.deleted',
      payload: {
        organizationId: org.id,
        clerkOrgId,
        schemaName: org.schemaName,
      },
      status: OutboxStatus.PENDING,
    });
    em.persist(outboxEvent);
    await em.flush();

    return {
      success: true,
      organizationId: org.id,
      schemaName: org.schemaName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
