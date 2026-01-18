import { type PrismaClient } from '@eurocomply/db';
import { type WaltIdClient } from '@eurocomply/walt-id';
import { type StatusList2021Service } from './status-list.service.js';

export interface DidCreationResult {
  did: string;
  keyId: string;
}

/**
 * DidService handles DID creation and lifecycle management.
 *
 * DIDs (Decentralized Identifiers) are created using walt.id and stored
 * in history tables for key rotation tracking and revocation support.
 */
export class DidService {
  constructor(
    private readonly waltIdClient: WaltIdClient,
    private readonly statusListService: StatusList2021Service,
    private readonly prisma: PrismaClient
  ) {}

  /**
   * Create a DID for an organization.
   *
   * This creates a new did:key identifier via walt.id and stores it
   * in both the Organization record and OrgDidHistory for tracking.
   *
   * @param organizationId - The organization to create DID for
   * @returns The created DID and key ID
   */
  async createOrganizationDid(organizationId: string): Promise<DidCreationResult> {
    // Create DID via walt.id
    const didResponse = await this.waltIdClient.createDid({
      method: 'key',
      keyAlgorithm: 'Ed25519',
    });

    // Allocate status list index for revocation tracking
    const statusListIndex = await this.statusListService.allocateIndex(
      organizationId
    );

    // Update organization with DID
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        did: didResponse.did,
        waltIdKeyId: didResponse.keyId,
      },
    });

    // Create history entry for tracking
    await this.prisma.orgDidHistory.create({
      data: {
        organizationId,
        did: didResponse.did,
        waltIdKeyId: didResponse.keyId,
        validFrom: new Date(),
        statusListIndex,
      },
    });

    return {
      did: didResponse.did,
      keyId: didResponse.keyId,
    };
  }

  /**
   * Create a DID for a user.
   *
   * Users have a single DID that works across all organizations.
   * If the user already has a DID, returns the existing one.
   *
   * @param userId - The user to create DID for
   * @param organizationId - The organization context (for status list index)
   * @returns The created or existing DID and key ID
   */
  async createUserDid(
    userId: string,
    organizationId: string
  ): Promise<DidCreationResult> {
    // Check if user already has a valid DID
    const existingDid = await this.prisma.userDidHistory.findFirst({
      where: {
        userId,
        validTo: null,
        revokedAt: null,
      },
      orderBy: { validFrom: 'desc' },
    });

    if (existingDid) {
      return {
        did: existingDid.did,
        keyId: existingDid.waltIdKeyId,
      };
    }

    // Create new DID via walt.id
    const didResponse = await this.waltIdClient.createDid({
      method: 'key',
      keyAlgorithm: 'Ed25519',
    });

    // Allocate status list index
    const statusListIndex = await this.statusListService.allocateIndex(
      organizationId
    );

    // Create history entry
    await this.prisma.userDidHistory.create({
      data: {
        userId,
        did: didResponse.did,
        waltIdKeyId: didResponse.keyId,
        validFrom: new Date(),
        statusListIndex,
      },
    });

    return {
      did: didResponse.did,
      keyId: didResponse.keyId,
    };
  }

  /**
   * Get the current valid DID for an organization.
   *
   * @param organizationId - The organization ID
   * @returns The current DID info or null if none exists
   */
  async getOrganizationDid(organizationId: string): Promise<DidCreationResult | null> {
    const orgDid = await this.prisma.orgDidHistory.findFirst({
      where: {
        organizationId,
        validTo: null,
        revokedAt: null,
      },
      orderBy: { validFrom: 'desc' },
    });

    if (!orgDid) {
      return null;
    }

    return {
      did: orgDid.did,
      keyId: orgDid.waltIdKeyId,
    };
  }

  /**
   * Get the current valid DID for a user.
   *
   * @param userId - The user ID
   * @returns The current DID info or null if none exists
   */
  async getUserDid(userId: string): Promise<DidCreationResult | null> {
    const userDid = await this.prisma.userDidHistory.findFirst({
      where: {
        userId,
        validTo: null,
        revokedAt: null,
      },
      orderBy: { validFrom: 'desc' },
    });

    if (!userDid) {
      return null;
    }

    return {
      did: userDid.did,
      keyId: userDid.waltIdKeyId,
    };
  }
}
