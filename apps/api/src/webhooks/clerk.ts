import {
  Organization,
  ProvisioningStatus,
  OutboxEvent,
  OutboxStatus,
  User,
  OrganizationUser,
  WorkspaceAuthority,
} from '@eurocomply/database';
import type { MikroORM } from '@mikro-orm/postgresql';
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

// Membership webhook event types
export interface ClerkOrganizationMembershipEvent {
  type: 'organizationMembership.created' | 'organizationMembership.deleted';
  data: {
    id: string;
    organization: { id: string };
    public_user_data: {
      user_id: string;
      identifier: string;      // email
      first_name?: string;
      last_name?: string;
      image_url?: string;
    };
    role: 'org:admin' | 'org:member';
    created_at: number;
  };
}

export interface ClerkUserUpdatedEvent {
  type: 'user.updated';
  data: {
    id: string;
    email_addresses: Array<{ email_address: string; id: string }>;
    primary_email_address_id: string;
    first_name?: string;
    last_name?: string;
    image_url?: string;
    organization_memberships: Array<{ organization: { id: string } }>;
  };
}

// Custom error for retryable webhook failures
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
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

/**
 * Handles the organizationMembership.created webhook event.
 * Creates a User and OrganizationUser in the tenant schema.
 *
 * Idempotency: If user with clerkId already exists, returns already_exists.
 * Retry: If org not yet provisioned, throws RetryableError.
 */
export async function handleMembershipCreated(
  orm: MikroORM,
  event: ClerkOrganizationMembershipEvent
): Promise<{ status: string; userId?: string }> {
  const { organization, public_user_data, role } = event.data;

  // Use forked em for shared schema lookup
  const sharedEm = orm.em.fork();

  // 1. Find our organization by Clerk org ID
  const org = await sharedEm.findOne(Organization, {
    clerkOrgId: organization.id,
  });

  if (!org) {
    throw new Error(`Organization not found for Clerk org: ${organization.id}`);
  }

  // 2. Check if org is provisioned
  if (org.provisioningStatus !== ProvisioningStatus.READY) {
    throw new RetryableError('Organization not yet provisioned');
  }

  // 3. Create user in tenant schema within a transaction
  const em = orm.em.fork({ schema: org.schemaName });

  return em.transactional(async (txEm) => {
    // Check if user already exists (idempotency)
    const existingUser = await txEm.findOne(User, {
      clerkId: public_user_data.user_id,
    });

    if (existingUser) {
      return { status: 'already_exists', userId: existingUser.id };
    }

    // Determine if first user - within transaction to prevent race
    const userCount = await txEm.count(User, {});
    const isFirstUser = userCount === 0;

    // Create User
    const user = txEm.create(User, {
      id: createId(),
      clerkId: public_user_data.user_id,
      email: public_user_data.identifier,
      name: [public_user_data.first_name, public_user_data.last_name]
        .filter(Boolean)
        .join(' ') || undefined,
      avatarUrl: public_user_data.image_url,
    });

    // Create OrganizationUser with authorities
    const isClerkAdmin = role === 'org:admin';

    const orgUser = txEm.create(OrganizationUser, {
      id: createId(),
      user,
      isOrgAdmin: isFirstUser || isClerkAdmin,
      designAuthority: isFirstUser ? WorkspaceAuthority.MANAGER : WorkspaceAuthority.NONE,
      operationsAuthority: isFirstUser ? WorkspaceAuthority.MANAGER : WorkspaceAuthority.NONE,
      marketingAuthority: isFirstUser ? WorkspaceAuthority.MANAGER : WorkspaceAuthority.NONE,
      complianceAuthority: isFirstUser ? WorkspaceAuthority.MANAGER : WorkspaceAuthority.NONE,
    });

    // Emit outbox event
    const outboxEvent = txEm.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'User',
      aggregateId: user.id,
      eventType: 'user.joined_organization',
      payload: {
        userId: user.id,
        clerkUserId: public_user_data.user_id,
        organizationId: org.id,
        isOrgAdmin: orgUser.isOrgAdmin,
        isFirstUser,
      },
      status: OutboxStatus.PENDING,
    });

    txEm.persist([user, orgUser, outboxEvent]);
    // Transaction will flush on commit

    return { status: 'created', userId: user.id };
  });
}

/**
 * Handles the organizationMembership.deleted webhook event.
 * Soft deletes the User in the tenant schema to preserve audit trail references.
 *
 * Idempotency: If user not found or already deleted, returns appropriate status.
 */
export async function handleMembershipDeleted(
  orm: MikroORM,
  event: ClerkOrganizationMembershipEvent
): Promise<{ status: string }> {
  const { organization, public_user_data } = event.data;

  const sharedEm = orm.em.fork();
  const org = await sharedEm.findOne(Organization, {
    clerkOrgId: organization.id,
  });

  if (!org) {
    return { status: 'org_not_found' };
  }

  const em = orm.em.fork({ schema: org.schemaName });

  return em.transactional(async (txEm) => {
    // Soft delete - preserves audit trail references
    const updated = await txEm.nativeUpdate(
      User,
      { clerkId: public_user_data.user_id, deletedAt: null },
      { deletedAt: new Date() }
    );

    if (updated === 0) {
      return { status: 'user_not_found' };
    }

    // Emit outbox event for event-driven consistency
    const outboxEvent = txEm.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'User',
      aggregateId: public_user_data.user_id,  // Use Clerk user ID as we don't have internal ID
      eventType: 'user.left_organization',
      payload: {
        clerkUserId: public_user_data.user_id,
        organizationId: org.id,
        clerkOrgId: organization.id,
      },
      status: OutboxStatus.PENDING,
    });
    txEm.persist(outboxEvent);

    return { status: 'soft_deleted' };
  });
}

/**
 * Handles the user.updated webhook event.
 * Queues profile sync requests for each organization the user belongs to.
 *
 * Note: This does NOT directly update user records - outbox events are
 * processed by a worker to update users in their respective tenant schemas.
 *
 * Idempotency: Duplicate webhooks will create duplicate outbox events,
 * which the worker should handle idempotently (upsert by clerkUserId).
 */
export async function handleUserUpdated(
  orm: MikroORM,
  event: ClerkUserUpdatedEvent
): Promise<{ status: string; count: number; error?: string }> {
  const em = orm.em.fork();

  try {
    const primaryEmail = event.data.email_addresses.find(
      (e) => e.id === event.data.primary_email_address_id
    )?.email_address;

    const name = [event.data.first_name, event.data.last_name]
      .filter(Boolean)
      .join(' ') || undefined;

    // Emit one outbox event per tenant (processed async by worker)
    for (const membership of event.data.organization_memberships) {
      const outboxEvent = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'User',
        aggregateId: event.data.id,
        eventType: 'user.profile_sync_requested',
        payload: {
          clerkUserId: event.data.id,
          clerkOrgId: membership.organization.id,
          email: primaryEmail,
          name,
          avatarUrl: event.data.image_url,
        },
        status: OutboxStatus.PENDING,
      });
      em.persist(outboxEvent);
    }
    await em.flush();

    return { status: 'queued', count: event.data.organization_memberships.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { status: 'failed', count: 0, error: errorMessage };
  }
}
