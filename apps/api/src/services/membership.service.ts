import { EntityManager } from '@mikro-orm/postgresql';
import { MikroOrm } from '@eurocomply/db';
import { type DidService } from './did.service.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';

const { User, Organization, OrganizationUser } = MikroOrm;

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${random}`;
}

export interface AddUserToOrganizationInput {
  organizationId: string;
  clerkId: string;
  email: string;
  name?: string;
  role?: 'member' | 'admin' | 'owner';
}

export interface MembershipResult {
  userId: string;
  organizationId: string;
  role: string;
  did: string | null;
}

/**
 * MembershipService handles user membership in organizations.
 *
 * When a user joins an organization, this service:
 * 1. Creates the user record if they don't exist
 * 2. Creates the organization membership
 * 3. Creates a DID for the user if they don't have one
 */
export class MembershipService {
  constructor(
    private readonly didService: DidService,
    private readonly em: EntityManager
  ) {}

  /**
   * Add a user to an organization.
   *
   * This handles the complete user onboarding flow:
   * - Creates user record if needed
   * - Creates organization membership
   * - Creates user DID if needed (for signing documents)
   *
   * @param input - User and organization details
   * @returns The membership result including the user's DID
   * @throws NotFoundError if organization doesn't exist
   * @throws ConflictError if user is already a member
   */
  async addUserToOrganization(input: AddUserToOrganizationInput): Promise<MembershipResult> {
    const { organizationId, clerkId, email, name, role = 'member' } = input;

    // Verify organization exists (Organization is in public schema)
    const organization = await this.em.findOne(Organization, { id: organizationId });

    if (!organization) {
      throw new NotFoundError('Organization', organizationId);
    }

    // Get or create user and membership in a transaction
    const result = await this.em.transactional(async (em) => {
      // Get or create user (User is in public schema)
      let user = await em.findOne(User, { clerkId });

      if (!user) {
        user = em.create(User, {
          id: generateId('user'),
          clerkId,
          email,
          name,
        });
        em.persist(user);
      }

      // Check if already a member
      const existingMemberships = await em.find(
        OrganizationUser,
        { userId: user.id, organizationId },
        { limit: 1 }
      );

      if (existingMemberships.length > 0) {
        throw new ConflictError('User is already a member of this organization');
      }

      // Create membership
      const membership = em.create(OrganizationUser, {
        id: generateId('orguser'),
        userId: user.id,
        organizationId,
        role,
        // Default authority levels for new members
        designAuthority: 'VIEWER',
        operationsAuthority: 'VIEWER',
        marketingAuthority: 'VIEWER',
        complianceAuthority: 'VIEWER',
      });
      em.persist(membership);

      await em.flush();

      return user;
    });

    // Create DID for user if they don't have one
    let userDid = await this.didService.getUserDid(result.id);

    if (!userDid) {
      try {
        userDid = await this.didService.createUserDid(result.id, organizationId);
      } catch (error) {
        // Log error but don't fail the membership creation
        console.error('Failed to create DID for user:', error);
      }
    }

    return {
      userId: result.id,
      organizationId,
      role,
      did: userDid?.did ?? null,
    };
  }
}
