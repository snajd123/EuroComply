import { PrismaClient } from '@eurocomply/db';
import type { CredentialStatus } from '@eurocomply/shared';
import { NotFoundError, ValidationError } from '../lib/errors.js';

/**
 * Revocation information for a status list entry.
 */
export interface RevocationInfo {
  revokedAt: Date;
  reason?: string;
}

/**
 * StatusList2021Service implements the W3C Status List 2021 specification
 * for credential revocation management.
 *
 * This service manages a bitstring-based revocation registry where:
 * - Each credential/DID gets a unique index in the status list
 * - bit = 0 means valid (not revoked)
 * - bit = 1 means revoked
 *
 * For MVP, this implementation:
 * - Uses Organization.statusListIndex counter for index allocation
 * - Queries UserDidHistory and OrgDidHistory for DID revocation status
 * - Maintains an in-memory map for non-DID revocations (e.g., OperationsEvents)
 *
 * TODO: Consider adding a dedicated StatusListEntry table for full persistence
 * TODO: Implement actual bitstring encoding for Status List 2021 credential
 */
export class StatusList2021Service {
  private readonly baseUrl: string;

  /**
   * In-memory tracking for revoked indices that aren't in DID history tables.
   * Key format: `${organizationId}:${index}`
   *
   * NOTE: This is an MVP approach. For production, consider:
   * - Adding a dedicated database table for revocation tracking
   * - Using Redis for distributed caching
   */
  private readonly revokedIndices: Map<string, RevocationInfo> = new Map();

  /**
   * Create a new StatusList2021Service.
   *
   * @param prisma - PrismaClient instance for database operations
   * @param baseUrl - Base URL for status list credential URLs (default: https://api.eurocomply.eu)
   */
  constructor(
    private prisma: PrismaClient,
    baseUrl: string = 'https://api.eurocomply.eu'
  ) {
    this.baseUrl = baseUrl;
  }

  /**
   * Allocate the next available status list index for an organization.
   *
   * This atomically increments the organization's statusListIndex counter
   * and returns the previous value as the allocated index.
   *
   * @param organizationId - The organization ID
   * @returns The allocated index (0-based)
   * @throws NotFoundError if organization doesn't exist
   */
  async allocateIndex(organizationId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      // Get current index
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { statusListIndex: true },
      });

      if (!org) {
        throw new NotFoundError('Organization', organizationId);
      }

      const allocatedIndex = org.statusListIndex;

      // Increment counter atomically
      await tx.organization.update({
        where: { id: organizationId },
        data: { statusListIndex: allocatedIndex + 1 },
      });

      return allocatedIndex;
    });
  }

  /**
   * Mark a status list index as revoked.
   *
   * This method handles revocation for both DID-based entries (tracked in
   * UserDidHistory/OrgDidHistory) and non-DID entries (tracked in-memory).
   *
   * @param organizationId - The organization ID
   * @param index - The status list index to revoke
   * @param reason - Optional reason for revocation
   * @throws ValidationError if index is negative
   */
  async revoke(
    organizationId: string,
    index: number,
    reason?: string
  ): Promise<void> {
    this.validateIndex(index);

    // For MVP, we just store in our in-memory map
    // The DID history tables will be updated by the DID rotation service when applicable
    const key = this.buildKey(organizationId, index);
    this.revokedIndices.set(key, {
      revokedAt: new Date(),
      reason,
    });
  }

  /**
   * Check if a status list index is revoked.
   *
   * Checks both DID history tables and the in-memory revocation map.
   *
   * @param organizationId - The organization ID
   * @param index - The status list index to check
   * @returns true if the index is revoked, false otherwise
   * @throws ValidationError if index is negative
   */
  async isRevoked(organizationId: string, index: number): Promise<boolean> {
    this.validateIndex(index);

    // Check in-memory revocations first (fast path)
    const key = this.buildKey(organizationId, index);
    if (this.revokedIndices.has(key)) {
      return true;
    }

    // Check UserDidHistory for revoked user DIDs
    const userDid = await this.prisma.userDidHistory.findFirst({
      where: {
        statusListIndex: index,
        user: {
          organizations: {
            some: {
              organizationId,
            },
          },
        },
      },
      select: { revokedAt: true },
    });

    if (userDid?.revokedAt) {
      return true;
    }

    // Check OrgDidHistory for revoked organization DIDs
    const orgDid = await this.prisma.orgDidHistory.findFirst({
      where: {
        organizationId,
        statusListIndex: index,
      },
      select: { revokedAt: true },
    });

    if (orgDid?.revokedAt) {
      return true;
    }

    return false;
  }

  /**
   * Get the CredentialStatus object for embedding in a Verifiable Credential.
   *
   * This creates a Status List 2021 entry that can be included in sealed
   * artifacts and verifiable credentials for revocation checking.
   *
   * @param organizationId - The organization ID
   * @param index - The status list index
   * @returns CredentialStatus object conforming to W3C Status List 2021
   * @throws ValidationError if index is negative
   */
  async getCredentialStatus(
    organizationId: string,
    index: number
  ): Promise<CredentialStatus> {
    this.validateIndex(index);

    return {
      type: 'StatusList2021Entry',
      statusPurpose: 'revocation',
      statusListIndex: String(index),
      statusListCredential: `${this.baseUrl}/organizations/${organizationId}/status-list`,
    };
  }

  /**
   * Get detailed revocation information for an index.
   *
   * @param organizationId - The organization ID
   * @param index - The status list index
   * @returns RevocationInfo if revoked, null if not revoked
   * @throws ValidationError if index is negative
   */
  async getRevocationInfo(
    organizationId: string,
    index: number
  ): Promise<RevocationInfo | null> {
    this.validateIndex(index);

    // Check in-memory revocations
    const key = this.buildKey(organizationId, index);
    const inMemoryRevocation = this.revokedIndices.get(key);
    if (inMemoryRevocation) {
      return inMemoryRevocation;
    }

    // Check UserDidHistory
    const userDid = await this.prisma.userDidHistory.findFirst({
      where: {
        statusListIndex: index,
        user: {
          organizations: {
            some: {
              organizationId,
            },
          },
        },
      },
      select: { revokedAt: true, revocationReason: true },
    });

    if (userDid?.revokedAt) {
      return {
        revokedAt: userDid.revokedAt,
        reason: userDid.revocationReason ?? undefined,
      };
    }

    // Check OrgDidHistory
    const orgDid = await this.prisma.orgDidHistory.findFirst({
      where: {
        organizationId,
        statusListIndex: index,
      },
      select: { revokedAt: true, revocationReason: true },
    });

    if (orgDid?.revokedAt) {
      return {
        revokedAt: orgDid.revokedAt,
        reason: orgDid.revocationReason ?? undefined,
      };
    }

    return null;
  }

  /**
   * Validate that an index is non-negative.
   *
   * @param index - The index to validate
   * @throws ValidationError if index is negative
   */
  private validateIndex(index: number): void {
    if (index < 0) {
      throw new ValidationError(
        `Status list index must be non-negative, got: ${index}`
      );
    }
  }

  /**
   * Build a unique key for the in-memory revocation map.
   *
   * @param organizationId - The organization ID
   * @param index - The status list index
   * @returns Composite key string
   */
  private buildKey(organizationId: string, index: number): string {
    return `${organizationId}:${index}`;
  }
}
