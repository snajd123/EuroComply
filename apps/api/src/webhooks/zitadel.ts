import {
  Organization,
  ProvisioningStatus,
  OutboxEvent,
  OutboxStatus,
} from '@eurocomply/database';
import { createId } from '@eurocomply/core';

const PROVISIONING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface ZitadelOrganizationEvent {
  type: 'org.created' | 'org.updated' | 'org.removed';
  data: {
    orgId: string;
    name?: string;
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
  removeAndFlush(entity: object): Promise<void>;
}

/**
 * Interface for the TenantProvisioner dependency.
 * Matches the public API of TenantProvisioner from @eurocomply/database.
 */
export interface TenantProvisionerLike {
  provisionTenant(schemaName: string): Promise<{ success: boolean; schemaName: string; error?: string; alreadyProvisioned?: boolean }>;
  dropSchema(schemaName: string): Promise<void>;
}

export interface HandlerDependencies {
  orm: OrmLike;
  provisioner: TenantProvisionerLike;
}

export interface HandlerResult {
  success: boolean;
  organizationId?: string;
  schemaName?: string;
  error?: string;
  retryable?: boolean;
  idempotent?: boolean;
}

/**
 * Converts a ZITADEL organization ID to a valid PostgreSQL schema name.
 * Uses the last 8 characters of the org ID for uniqueness while keeping names short.
 *
 * The ZITADEL org ID is immutable, making it ideal for schema naming.
 */
export function zitadelOrgIdToSchemaName(zitadelOrgId: string): string {
  const suffix = zitadelOrgId.length > 8 ? zitadelOrgId.slice(-8) : zitadelOrgId;
  return `tenant_org_${suffix.toLowerCase()}`;
}

/**
 * Checks if provisioning has timed out.
 */
function isProvisioningTimedOut(org: Organization): boolean {
  if (!org.provisioningStartedAt) return false;
  return Date.now() - org.provisioningStartedAt.getTime() > PROVISIONING_TIMEOUT_MS;
}

/**
 * Handles the org.created webhook event.
 * Creates the organization record and provisions the tenant schema.
 *
 * Race condition handling:
 * - READY: Already provisioned, return success (idempotent)
 * - PROVISIONING with timeout: Treat as failed, allow retry
 * - PROVISIONING within timeout: Return 409 conflict
 * - PENDING/FAILED: Continue with provisioning
 */
export async function handleOrganizationCreated(
  event: ZitadelOrganizationEvent,
  deps: HandlerDependencies
): Promise<HandlerResult> {
  const { orm, provisioner } = deps;
  const { orgId: zitadelOrgId, name = 'Unnamed Organization' } = event.data;
  const schemaName = zitadelOrgIdToSchemaName(zitadelOrgId);
  // Generate slug from name (lowercase, hyphens)
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `org-${zitadelOrgId.slice(-8)}`;

  const em = orm.em.fork();

  try {
    // Check for existing organization (race condition guard)
    let org = await em.findOne(Organization, { zitadelOrgId });

    if (org) {
      // Handle based on current status
      switch (org.provisioningStatus) {
        case ProvisioningStatus.READY:
          // Already provisioned - idempotent success
          return {
            success: true,
            organizationId: org.id,
            schemaName: org.schemaName,
            idempotent: true,
          };

        case ProvisioningStatus.PROVISIONING:
          // Check for timeout
          if (isProvisioningTimedOut(org)) {
            // Treat as failed, allow retry
            org.provisioningStatus = ProvisioningStatus.FAILED;
            org.provisioningError = 'Provisioning timed out';
            await em.flush();
            // Fall through to retry provisioning
          } else {
            // Still in progress - return conflict
            return {
              success: false,
              organizationId: org.id,
              schemaName: org.schemaName,
              error: 'Organization provisioning already in progress',
              retryable: true,
            };
          }
          break;

        case ProvisioningStatus.PENDING:
        case ProvisioningStatus.FAILED:
          // Continue with provisioning
          break;

        default:
          // DELETING or DELETE_FAILED - unexpected state
          return {
            success: false,
            organizationId: org.id,
            schemaName: org.schemaName,
            error: `Organization is in ${org.provisioningStatus} state`,
          };
      }

      // Update existing org for retry
      org.provisioningStatus = ProvisioningStatus.PROVISIONING;
      org.provisioningStartedAt = new Date();
      org.provisioningError = undefined;
      await em.flush();
    } else {
      // Create new Organization record
      org = em.create(Organization, {
        id: createId(),
        name,
        slug,
        schemaName,
        zitadelOrgId,
        provisioningStatus: ProvisioningStatus.PROVISIONING,
        provisioningStartedAt: new Date(),
      });
      em.persist(org);
      await em.flush();
    }

    // Provision tenant schema
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
        retryable: true,
      };
    }

    // Update organization status to ready
    org.provisioningStatus = ProvisioningStatus.READY;

    // Create outbox event
    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: org.id,
      eventType: 'organization.provisioned',
      payload: {
        organizationId: org.id,
        zitadelOrgId,
        schemaName,
        name,
        slug,
      },
      status: OutboxStatus.PENDING,
    });
    em.persist(outboxEvent);
    await em.flush();

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
      retryable: true,
    };
  }
}

/**
 * Handles the org.removed webhook event.
 * Uses two-phase deletion for reliability:
 * 1. Mark as DELETING (first phase)
 * 2. Drop schema
 * 3. Delete organization record (second phase)
 *
 * If deletion fails, org is marked as DELETE_FAILED for retry.
 * Not found is treated as success (idempotent).
 */
export async function handleOrganizationDeleted(
  event: ZitadelOrganizationEvent,
  deps: Pick<HandlerDependencies, 'orm' | 'provisioner'>
): Promise<HandlerResult> {
  const { orm, provisioner } = deps;
  const { orgId: zitadelOrgId } = event.data;

  const em = orm.em.fork();

  // 1. Find organization
  const org = await em.findOne(Organization, { zitadelOrgId });

  if (!org) {
    // Not found - treat as success (idempotent)
    return {
      success: true,
      error: 'Already deleted',
      idempotent: true,
    };
  }

  // Handle if already in deletion state
  if (org.provisioningStatus === ProvisioningStatus.DELETING) {
    // Already being deleted - return conflict
    return {
      success: false,
      organizationId: org.id,
      schemaName: org.schemaName,
      error: 'Organization deletion already in progress',
      retryable: true,
    };
  }

  const { id: organizationId, schemaName, name, slug } = org;

  try {
    // 2. Create outbox event BEFORE deletion (for audit trail)
    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: organizationId,
      eventType: 'organization.deleted',
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

    // 3. Phase 1: Mark as DELETING
    org.provisioningStatus = ProvisioningStatus.DELETING;
    await em.flush();

    // 4. Drop tenant schema (CASCADE removes all tables)
    try {
      await provisioner.dropSchema(schemaName);
    } catch (error) {
      // Schema drop failed - mark as DELETE_FAILED for retry
      const errorMessage = error instanceof Error ? error.message : String(error);
      org.provisioningStatus = ProvisioningStatus.DELETE_FAILED;
      org.provisioningError = errorMessage;
      await em.flush();

      return {
        success: false,
        organizationId,
        schemaName,
        error: `Schema drop failed: ${errorMessage}`,
        retryable: true,
      };
    }

    // 5. Phase 2: Delete organization record
    await em.removeAndFlush(org);

    return {
      success: true,
      organizationId,
      schemaName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      organizationId,
      schemaName,
      error: errorMessage,
      retryable: true,
    };
  }
}
