import { prisma, createTenantSchema, publishEvent, EventTypes } from '@eurocomply/db';
import { ConflictError, NotFoundError } from '../lib/errors.js';

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

/**
 * Creates a new organization with tenant schema and owner user.
 */
export async function createOrganization(
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
  while (await prisma.organization.findUnique({ where: { slug } })) {
    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  // Generate schema name
  const schemaName = `tenant_${slug.replace(/-/g, '_')}`;

  // Check if schema name conflicts
  const existingSchema = await prisma.organization.findUnique({
    where: { schemaName },
  });
  if (existingSchema) {
    throw new ConflictError('Organization with this name already exists');
  }

  // Create everything in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create or get user
    let user = await tx.user.findUnique({
      where: { clerkId: ownerClerkId },
    });

    if (!user) {
      user = await tx.user.create({
        data: {
          clerkId: ownerClerkId,
          email: ownerEmail,
          name: ownerName,
        },
      });
    }

    // 2. Create organization
    const organization = await tx.organization.create({
      data: {
        name,
        slug,
        schemaName,
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
        userLimit: 20,
        storageLimit: BigInt(536870912000), // 500GB
      },
    });

    // 3. Create owner membership
    await tx.organizationUser.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: 'owner',
        designAuthority: 'MANAGER',
        operationsAuthority: 'MANAGER',
        marketingAuthority: 'MANAGER',
        complianceAuthority: 'MANAGER',
      },
    });

    // 4. Publish event
    await publishEvent(tx, {
      organizationId: organization.id,
      eventType: EventTypes.ORG_CREATED,
      aggregateType: 'organization',
      aggregateId: organization.id,
      payload: {
        name: organization.name,
        slug: organization.slug,
        ownerId: user.id,
        subscriptionTier: organization.subscriptionTier,
      },
    });

    return { organization, user };
  });

  // 5. Create tenant schema (outside transaction - DDL can't be rolled back anyway)
  await createTenantSchema(prisma, schemaName);

  return {
    id: result.organization.id,
    name: result.organization.name,
    slug: result.organization.slug,
    schemaName: result.organization.schemaName,
    subscriptionTier: result.organization.subscriptionTier,
    subscriptionStatus: result.organization.subscriptionStatus,
    createdAt: result.organization.createdAt,
    owner: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
    },
  };
}

/**
 * Gets an organization by ID.
 */
export async function getOrganization(id: string): Promise<OrganizationWithOwner> {
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      users: {
        where: { role: 'owner' },
        include: { user: true },
        take: 1,
      },
    },
  });

  if (!org) {
    throw new NotFoundError('Organization', id);
  }

  const owner = org.users[0]?.user;
  if (!owner) {
    throw new NotFoundError('Organization owner');
  }

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
      name: owner.name,
    },
  };
}

/**
 * Lists organizations for a user.
 */
export async function listUserOrganizations(userId: string) {
  const memberships = await prisma.organizationUser.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: 'desc' },
  });

  return memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role,
    subscriptionTier: m.organization.subscriptionTier,
  }));
}
