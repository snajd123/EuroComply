import { EntityManager, IsolationLevel } from '@mikro-orm/postgresql';
import { MikroOrm, Organization } from '@eurocomply/db';
import type { CredentialStatus } from '@eurocomply/shared';
import {
  createBitstring,
  setBit,
  getBit,
  encodeBitstring,
  decodeBitstring,
  BITSTRING_SIZE,
} from '@eurocomply/shared';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { randomUUID } from 'crypto';

const { StatusListEntry, UserDidHistory, OrgDidHistory, OrganizationUser } = MikroOrm;

/**
 * Generates a unique ID with the given prefix.
 */
function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

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
 * Architecture notes:
 * - The EntityManager passed to the constructor is already scoped to the tenant schema
 * - Organization and StatusListEntry declare `schema: 'public'` in their entity definitions
 * - UserDidHistory and OrgDidHistory live in the tenant schema
 *
 * Implementation:
 * - Uses Organization.statusListIndex counter for index allocation
 * - Queries UserDidHistory and OrgDidHistory for DID revocation status
 * - Uses StatusListEntry table for non-DID revocations (e.g., OperationsEvents)
 */
export class StatusList2021Service {
  private readonly baseUrl: string;

  /**
   * Create a new StatusList2021Service.
   *
   * @param em - EntityManager instance (tenant-scoped, public schema entities route correctly)
   * @param baseUrl - Base URL for status list credential URLs (default: https://api.eurocomply.eu)
   */
  constructor(
    private em: EntityManager,
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
    return this.em.transactional(
      async (em) => {
        // Get organization (public schema)
        const org = await em.findOne(Organization, { id: organizationId });

        if (!org) {
          throw new NotFoundError('Organization', organizationId);
        }

        const allocatedIndex = org.statusListIndex ?? 0;

        // Increment counter atomically
        org.statusListIndex = allocatedIndex + 1;
        await em.flush();

        return allocatedIndex;
      },
      { isolationLevel: IsolationLevel.SERIALIZABLE }
    );
  }

  /**
   * Mark a status list index as revoked.
   *
   * This method handles revocation for both DID-based entries (tracked in
   * UserDidHistory/OrgDidHistory) and non-DID entries (tracked in StatusListEntry).
   *
   * @param organizationId - The organization ID
   * @param index - The status list index to revoke
   * @param reason - Optional reason for revocation
   * @param reference - Optional reference to what this entry tracks (e.g., { type: 'operations_event', id: 'abc123' })
   * @throws ValidationError if index is negative
   */
  async revoke(
    organizationId: string,
    index: number,
    reason?: string,
    reference?: { type: string; id: string }
  ): Promise<void> {
    this.validateIndex(index);

    // Check if entry already exists (upsert behavior)
    const existing = await this.em.findOne(StatusListEntry, {
      organizationId,
      statusIndex: index,
    });

    if (existing) {
      existing.revokedAt = new Date();
      existing.reason = reason;
      existing.referenceType = reference?.type;
      existing.referenceId = reference?.id;
    } else {
      this.em.create(StatusListEntry, {
        id: generateId('sle'),
        organizationId,
        statusIndex: index,
        revokedAt: new Date(),
        reason,
        referenceType: reference?.type,
        referenceId: reference?.id,
      });
    }

    await this.em.flush();
  }

  /**
   * Check if a status list index is revoked.
   *
   * Checks StatusListEntry table, UserDidHistory, and OrgDidHistory.
   *
   * @param organizationId - The organization ID
   * @param index - The status list index to check
   * @returns true if the index is revoked, false otherwise
   * @throws ValidationError if index is negative
   */
  async isRevoked(organizationId: string, index: number): Promise<boolean> {
    this.validateIndex(index);

    // Check StatusListEntry table first (public schema)
    const entry = await this.em.findOne(StatusListEntry, {
      organizationId,
      statusIndex: index,
    });

    if (entry?.revokedAt) {
      return true;
    }

    // Check UserDidHistory for revoked user DIDs (tenant schema)
    // This requires a join through User -> OrganizationUser
    // We simplify by checking if the user belongs to the organization
    const userDid = await this.em.findOne(UserDidHistory, {
      statusListIndex: index,
      revokedAt: { $ne: null },
    });

    if (userDid) {
      // Verify user belongs to this organization
      const membership = await this.em.findOne(OrganizationUser, {
        userId: userDid.userId,
        organizationId,
      });
      if (membership) {
        return true;
      }
    }

    // Check OrgDidHistory for revoked organization DIDs (tenant schema)
    const orgDid = await this.em.findOne(OrgDidHistory, {
      organizationId,
      statusListIndex: index,
      revokedAt: { $ne: null },
    });

    if (orgDid) {
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

    // Check StatusListEntry table (public schema)
    const entry = await this.em.findOne(StatusListEntry, {
      organizationId,
      statusIndex: index,
    });

    if (entry?.revokedAt) {
      return {
        revokedAt: entry.revokedAt,
        reason: entry.reason ?? undefined,
      };
    }

    // Check UserDidHistory (tenant schema)
    const userDid = await this.em.findOne(UserDidHistory, {
      statusListIndex: index,
      revokedAt: { $ne: null },
    });

    if (userDid?.revokedAt) {
      // Verify user belongs to this organization
      const membership = await this.em.findOne(OrganizationUser, {
        userId: userDid.userId,
        organizationId,
      });
      if (membership) {
        return {
          revokedAt: userDid.revokedAt,
          reason: userDid.revocationReason ?? undefined,
        };
      }
    }

    // Check OrgDidHistory (tenant schema)
    const orgDid = await this.em.findOne(OrgDidHistory, {
      organizationId,
      statusListIndex: index,
      revokedAt: { $ne: null },
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
   * Build the complete bitstring for an organization's status list.
   *
   * This aggregates revocation status from:
   * - StatusListEntry table
   * - UserDidHistory table
   * - OrgDidHistory table
   *
   * @param organizationId - The organization ID
   * @returns The bitstring with all revoked indices set
   */
  async buildBitstring(organizationId: string): Promise<Uint8Array> {
    const bitstring = createBitstring();

    // Set bits from StatusListEntry table (public schema)
    const revokedEntries = await this.em.find(StatusListEntry, {
      organizationId,
    });

    for (const entry of revokedEntries) {
      if (entry.statusIndex < BITSTRING_SIZE) {
        setBit(bitstring, entry.statusIndex);
      }
    }

    // Get user IDs that belong to this organization
    const memberships = await this.em.find(OrganizationUser, { organizationId });
    const userIds = memberships.map((m) => m.userId);

    // Set bits from UserDidHistory (tenant schema)
    if (userIds.length > 0) {
      const revokedUserDids = await this.em.find(UserDidHistory, {
        userId: { $in: userIds },
        revokedAt: { $ne: null },
      });

      for (const userDid of revokedUserDids) {
        if (userDid.statusListIndex < BITSTRING_SIZE) {
          setBit(bitstring, userDid.statusListIndex);
        }
      }
    }

    // Set bits from OrgDidHistory (tenant schema)
    const revokedOrgDids = await this.em.find(OrgDidHistory, {
      organizationId,
      revokedAt: { $ne: null },
    });

    for (const orgDid of revokedOrgDids) {
      if (orgDid.statusListIndex < BITSTRING_SIZE) {
        setBit(bitstring, orgDid.statusListIndex);
      }
    }

    return bitstring;
  }

  /**
   * Get the encoded status list for an organization.
   *
   * Returns the GZIP + base64url encoded bitstring as specified by
   * W3C Status List 2021.
   *
   * @param organizationId - The organization ID
   * @returns Base64url encoded GZIP compressed bitstring
   */
  async getEncodedList(organizationId: string): Promise<string> {
    const bitstring = await this.buildBitstring(organizationId);
    return encodeBitstring(bitstring);
  }

  /**
   * Check revocation status from an encoded status list.
   *
   * This is a static method that can be used to verify revocation status
   * without database access, using only the encoded list from a
   * Status List 2021 credential.
   *
   * @param encodedList - Base64url encoded GZIP compressed bitstring
   * @param index - The status list index to check
   * @returns true if revoked, false if valid
   */
  static checkRevocationFromEncodedList(
    encodedList: string,
    index: number
  ): boolean {
    if (index < 0 || index >= BITSTRING_SIZE) {
      throw new ValidationError(
        `Index out of bounds: ${index}. Must be 0-${BITSTRING_SIZE - 1}`
      );
    }
    const bitstring = decodeBitstring(encodedList);
    return getBit(bitstring, index);
  }

  /**
   * Generate a complete Status List 2021 Credential for an organization.
   *
   * This creates the credential structure that can be signed and published
   * for verifiers to check revocation status.
   *
   * @param organizationId - The organization ID
   * @param issuerId - The DID of the issuer
   * @returns The unsigned Status List 2021 Credential
   */
  async generateStatusListCredential(
    organizationId: string,
    issuerId: string
  ): Promise<StatusList2021Credential> {
    const encodedList = await this.getEncodedList(organizationId);

    return {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/vc/status-list/2021/v1',
      ],
      id: `${this.baseUrl}/organizations/${organizationId}/status-list`,
      type: ['VerifiableCredential', 'StatusList2021Credential'],
      issuer: issuerId,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: `${this.baseUrl}/organizations/${organizationId}/status-list#list`,
        type: 'StatusList2021',
        statusPurpose: 'revocation',
        encodedList,
      },
    };
  }
}

/**
 * Status List 2021 Credential structure per W3C specification.
 */
export interface StatusList2021Credential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: {
    id: string;
    type: 'StatusList2021';
    statusPurpose: 'revocation';
    encodedList: string;
  };
  proof?: Record<string, unknown>;
}
