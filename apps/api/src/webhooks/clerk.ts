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
  remove(entity: object): void;
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
 *
 * Idempotency: If org with clerkOrgId already exists, returns success with existing org.
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
    // 1. Idempotency check - if org already exists, return it
    const existingOrg = await em.findOne(Organization, { clerkOrgId });
    if (existingOrg) {
      // Already processed this webhook
      return {
        success: true,
        organizationId: existingOrg.id,
        schemaName: existingOrg.schemaName,
        error: existingOrg.provisioningStatus === ProvisioningStatus.READY
          ? undefined
          : `Organization exists but status is ${existingOrg.provisioningStatus}`,
      };
    }

    // 2. Create Organization record with PROVISIONING status
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

    // 3. Provision tenant schema
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

    // 4. Update organization status to ready
    org.provisioningStatus = ProvisioningStatus.READY;

    // 5. Create outbox event
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

    // 6. Update Clerk metadata (if clerk client provided)
    // Note: This is non-critical - if it fails, org is still provisioned
    if (clerk) {
      try {
        await clerk.organizations.updateOrganizationMetadata(clerkOrgId, {
          publicMetadata: {
            schema_name: schemaName,
            tier: 'starter',
            cell_id: 'cell_1',
          },
        });
      } catch (clerkError) {
        // Log but don't fail - org is already provisioned
        console.error('Failed to update Clerk metadata:', clerkError);
      }
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
 * Drops the tenant schema and deletes the organization record.
 *
 * Idempotency: If org not found, returns success (already deleted).
 * Partial failure handling: If schema drop fails, marks org as FAILED but doesn't delete.
 */
export async function handleOrganizationDeleted(
  event: ClerkOrganizationEvent,
  deps: Pick<HandlerDependencies, 'orm' | 'provisioner'>
): Promise<HandlerResult> {
  const { orm, provisioner } = deps;
  const { id: clerkOrgId } = event.data;

  const em = orm.em.fork();

  try {
    const org = await em.findOne(Organization, { clerkOrgId });

    // Idempotency: If org not found, treat as already deleted
    if (!org) {
      return {
        success: true,
        error: 'Organization already deleted or never existed',
      };
    }

    const { id: organizationId, schemaName } = org;

    // 1. Try to drop the tenant schema
    let schemaDropped = false;
    try {
      await provisioner.dropSchema(schemaName);
      schemaDropped = true;
    } catch (dropError) {
      // Schema might not exist (already dropped) - check error type
      const errorMsg = dropError instanceof Error ? dropError.message : String(dropError);

      // If schema doesn't exist, that's fine - continue with deletion
      if (errorMsg.includes('does not exist') || errorMsg.includes('not found')) {
        schemaDropped = true;
      } else {
        // Real error - mark org as failed but don't delete
        org.provisioningStatus = ProvisioningStatus.FAILED;
        org.provisioningError = `Deletion failed: Could not drop schema - ${errorMsg}`;
        await em.flush();

        return {
          success: false,
          organizationId,
          schemaName,
          error: `Failed to drop schema: ${errorMsg}`,
        };
      }
    }

    // 2. Create outbox event before deleting the org
    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: organizationId,
      eventType: 'organization.deleted',
      payload: {
        organizationId,
        clerkOrgId,
        schemaName,
        schemaDropped,
      },
      status: OutboxStatus.PENDING,
    });
    em.persist(outboxEvent);

    // 3. Delete the organization record
    em.remove(org);
    await em.flush();

    return {
      success: true,
      organizationId,
      schemaName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
