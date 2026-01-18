import { type PrismaClient } from '@eurocomply/db';
import { type DidService } from './did.service.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';

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
    private readonly prisma: PrismaClient
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

    // Verify organization exists
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundError('Organization', organizationId);
    }

    // Get or create user and membership in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Get or create user
      let user = await tx.user.findUnique({
        where: { clerkId },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            clerkId,
            email,
            name,
          },
        });
      }

      // Check if already a member
      const existingMembership = await tx.organizationUser.findFirst({
        where: {
          userId: user.id,
          organizationId,
        },
      });

      if (existingMembership) {
        throw new ConflictError('User is already a member of this organization');
      }

      // Create membership
      await tx.organizationUser.create({
        data: {
          userId: user.id,
          organizationId,
          role,
          // Default authority levels for new members
          designAuthority: 'VIEWER',
          operationsAuthority: 'VIEWER',
          marketingAuthority: 'VIEWER',
          complianceAuthority: 'VIEWER',
        },
      });

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
