import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import {
  MikroOrm,
  createTenantSchemaMikroOrm as createTenantSchema,
  EventTypes,
} from '@eurocomply/db';
import { createWaltIdClient } from '@eurocomply/walt-id';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { DidService } from './did.service.js';
import { StatusList2021Service } from './status-list.service.js';
import { loggers } from '../lib/logger.js';
import { randomUUID } from 'crypto';

const log = loggers.organization;

/** Default storage limit for new organizations: 500GB */
const DEFAULT_STORAGE_LIMIT_BYTES = '536870912000';

export interface CreateOrganizationInput {
  name: string;
  ownerClerkId: string;
  ownerEmail: string;
  ownerName?: string;
}

export interface OrganizationWithOwner {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  createdAt: Date;
  owner: {
    id: string;
    email: string;
    name: string | null;
  };
}

export interface UserOrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  subscriptionTier: string;
}

/**
 * Generates a unique ID with the given prefix.
 */
function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

/**
 * OrganizationService handles organization creation, retrieval, and listing.
 *
 * Architecture notes:
 * - Organization entity lives in PUBLIC schema
 * - User and OrganizationUser entities live in TENANT schema
 * - When creating an org, we create the tenant schema first, then user/membership in it
 */
export class OrganizationService {
  constructor(private orm: MikroORM) {}

  /**
   * Creates a new organization with tenant schema and owner user.
   */
  async createOrganization(
    input: CreateOrganizationInput
  ): Promise<OrganizationWithOwner> {
    const { name, ownerClerkId, ownerEmail, ownerName } = input;

    // Generate slug from name
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    // Check for slug collision and generate unique slug
    let slug = baseSlug;
    let counter = 0;
    while (
      await this.orm.em.findOne(MikroOrm.Organization, { slug })
    ) {
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    // Generate schema name
    const schemaName = `tenant_${slug.replace(/-/g, '_')}`;

    // Check if schema name conflicts
    const existingSchema = await this.orm.em.findOne(MikroOrm.Organization, {
      schemaName,
    });
    if (existingSchema) {
      throw new ConflictError('Organization with this name already exists');
    }

    // 1. Create organization in public schema
    const orgId = generateId('org');
    const organization = this.orm.em.create(MikroOrm.Organization, {
      id: orgId,
      name,
      slug,
      schemaName,
      subscriptionTier: 'starter',
      subscriptionStatus: 'active',
      userLimit: 20,
      storageLimit: DEFAULT_STORAGE_LIMIT_BYTES,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await this.orm.em.flush();

    // 2. Create tenant schema (outside transaction - DDL can't be rolled back anyway)
    await createTenantSchema(this.orm, schemaName);

    // 3. Fork tenant EM for User/OrganizationUser
    const tenantEm = this.orm.em.fork({ schema: schemaName });

    // 4. Create user in tenant schema
    const userId = generateId('usr');
    const user = tenantEm.create(MikroOrm.User, {
      id: userId,
      clerkId: ownerClerkId,
      email: ownerEmail,
      name: ownerName,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5. Create membership in tenant schema
    const membershipId = generateId('mem');
    tenantEm.create(MikroOrm.OrganizationUser, {
      id: membershipId,
      user,
      role: 'owner',
      designAuthority: 'MANAGER',
      operationsAuthority: 'MANAGER',
      marketingAuthority: 'MANAGER',
      complianceAuthority: 'MANAGER',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 6. Create outbox event in tenant schema
    const eventId = generateId('evt');
    tenantEm.create(MikroOrm.OutboxEvent, {
      id: eventId,
      eventType: EventTypes.ORG_CREATED,
      aggregateType: 'organization',
      aggregateId: organization.id,
      payload: {
        name: organization.name,
        slug: organization.slug,
        ownerId: user.id,
        subscriptionTier: organization.subscriptionTier,
      },
      createdAt: new Date(),
    });

    await tenantEm.flush();

    // 7. Create DIDs for organization and owner
    try {
      const waltIdClient = createWaltIdClient({
        WALTID_CORE_URL: process.env['WALTID_CORE_URL'],
        WALTID_SIGNATORY_URL: process.env['WALTID_SIGNATORY_URL'],
        WALTID_CUSTODIAN_URL: process.env['WALTID_CUSTODIAN_URL'],
        WALTID_AUDITOR_URL: process.env['WALTID_AUDITOR_URL'],
      });
      // StatusList2021Service still uses Prisma for now, will be migrated in Task 4.7
      // For now, we skip DID creation if the service isn't properly configured
      const prisma = (this.orm as unknown as { config?: { prisma?: unknown } }).config?.prisma;
      if (prisma) {
        const statusListService = new StatusList2021Service(prisma as never);
        const didService = new DidService(waltIdClient, statusListService, prisma as never);

        // Create organization DID
        await didService.createOrganizationDid(organization.id);

        // Create user DID (owner)
        await didService.createUserDid(user.id, organization.id);
      }
    } catch (error) {
      // Log error but don't fail org creation - DIDs can be created later
      log.error(
        { error, orgId: organization.id },
        'Failed to create DIDs during org creation'
      );
    }

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      schemaName: organization.schemaName,
      subscriptionTier: organization.subscriptionTier,
      subscriptionStatus: organization.subscriptionStatus,
      createdAt: organization.createdAt,
      owner: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
      },
    };
  }

  /**
   * Gets an organization by ID.
   */
  async getOrganization(id: string): Promise<OrganizationWithOwner> {
    // Organization is in public schema
    const org = await this.orm.em.findOne(MikroOrm.Organization, { id });

    if (!org) {
      throw new NotFoundError('Organization', id);
    }

    // To get owner, we need to query tenant schema
    const tenantEm = this.orm.em.fork({ schema: org.schemaName });
    const ownerMembership = await tenantEm.findOne(
      MikroOrm.OrganizationUser,
      { role: 'owner' },
      { populate: ['user'] }
    );

    if (!ownerMembership?.user) {
      // DATA INTEGRITY ERROR: An organization without an owner indicates
      // a broken organizationUser link. This should never happen in normal
      // operation and requires investigation.
      log.error(
        { orgId: id },
        'CRITICAL: Organization has no owner - data integrity violation'
      );
      throw new NotFoundError('Organization owner');
    }

    const owner = ownerMembership.user;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      schemaName: org.schemaName,
      subscriptionTier: org.subscriptionTier,
      subscriptionStatus: org.subscriptionStatus,
      createdAt: org.createdAt,
      owner: {
        id: owner.id,
        email: owner.email,
        name: owner.name ?? null,
      },
    };
  }

  /**
   * Lists organizations for a user by their Clerk ID.
   *
   * This is complex with per-tenant users - we query all orgs and check each tenant
   * for user membership.
   */
  async listUserOrganizations(
    clerkId: string
  ): Promise<UserOrganizationSummary[]> {
    // Query all organizations from public schema
    const orgs = await this.orm.em.find(MikroOrm.Organization, {});
    const results: UserOrganizationSummary[] = [];

    for (const org of orgs) {
      const tenantEm = this.orm.em.fork({ schema: org.schemaName });

      // Find user by clerkId in this tenant
      const user = await tenantEm.findOne(MikroOrm.User, { clerkId });
      if (!user) {
        continue;
      }

      // Find membership for this user
      const membership = await tenantEm.findOne(MikroOrm.OrganizationUser, {
        user,
      });
      if (membership) {
        results.push({
          id: org.id,
          name: org.name,
          slug: org.slug,
          role: membership.role,
          subscriptionTier: org.subscriptionTier,
        });
      }
    }

    // Sort by most recently created orgs first (approximation using org order)
    return results;
  }

  /**
   * Lists organizations for a user by their internal user ID within a known tenant.
   * This is more efficient when you already know which tenant to query.
   */
  async listUserOrganizationsByUserId(
    userId: string,
    knownSchemaName: string
  ): Promise<UserOrganizationSummary[]> {
    const tenantEm = this.orm.em.fork({ schema: knownSchemaName });

    // Find the user's membership
    const user = await tenantEm.findOne(MikroOrm.User, { id: userId });
    if (!user) {
      return [];
    }

    const membership = await tenantEm.findOne(MikroOrm.OrganizationUser, {
      user,
    });

    if (!membership) {
      return [];
    }

    // Find the organization by schema name
    const org = await this.orm.em.findOne(MikroOrm.Organization, {
      schemaName: knownSchemaName,
    });

    if (!org) {
      return [];
    }

    return [
      {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: membership.role,
        subscriptionTier: org.subscriptionTier,
      },
    ];
  }
}

// =============================================================================
// Standalone Functions (for backwards compatibility)
// =============================================================================

// Global ORM instance holder for standalone functions
let globalOrm: MikroORM | null = null;

/**
 * Sets the global MikroORM instance for standalone function usage.
 * Call this once at application startup.
 */
export function setOrganizationServiceOrm(orm: MikroORM): void {
  globalOrm = orm;
}

/**
 * Gets or throws if ORM not set.
 */
function getOrm(): MikroORM {
  if (!globalOrm) {
    throw new Error(
      'OrganizationService ORM not initialized. Call setOrganizationServiceOrm() at startup.'
    );
  }
  return globalOrm;
}

/**
 * Creates a new organization with tenant schema and owner user.
 * @deprecated Use OrganizationService class instead
 */
export async function createOrganization(
  input: CreateOrganizationInput
): Promise<OrganizationWithOwner> {
  const service = new OrganizationService(getOrm());
  return service.createOrganization(input);
}

/**
 * Gets an organization by ID.
 * @deprecated Use OrganizationService class instead
 */
export async function getOrganization(id: string): Promise<OrganizationWithOwner> {
  const service = new OrganizationService(getOrm());
  return service.getOrganization(id);
}

/**
 * Lists organizations for a user.
 * @deprecated Use OrganizationService class instead
 */
export async function listUserOrganizations(
  clerkId: string
): Promise<UserOrganizationSummary[]> {
  const service = new OrganizationService(getOrm());
  return service.listUserOrganizations(clerkId);
}
