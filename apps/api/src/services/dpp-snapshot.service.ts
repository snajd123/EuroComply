import { PrismaClient, DPPSnapshot } from '@eurocomply/db';
import { createHash } from 'crypto';
import { NotFoundError, ValidationError } from '../lib/errors.js';

export interface CreateSnapshotInput {
  productId: string;
  readinessProfileId: string;
  marketingVersionId?: string;
}

export interface AttestInput {
  userSignatureDid: string;
  userSignatureJws: string;
  userForensicContext: Record<string, unknown>;
}

export interface SealInput {
  orgSignatureDid: string;
  orgSignatureJws: string;
  orgForensicContext: Record<string, unknown>;
}

export interface IssueInput {
  vcId: string;
  vcJwt: string;
  dppUrl: string;
  qrCodeUrl?: string;
  credentialStatusIndex?: number;
  timestampProof?: Record<string, unknown>;
}

type SnapshotStatus = 'PENDING_REVIEW' | 'VERIFIED' | 'ATTESTED' | 'SEALED' | 'ISSUED' | 'REVOKED';

const VALID_TRANSITIONS: Record<SnapshotStatus, SnapshotStatus[]> = {
  PENDING_REVIEW: ['VERIFIED'],
  VERIFIED: ['ATTESTED'],
  ATTESTED: ['SEALED'],
  SEALED: ['ISSUED'],
  ISSUED: ['REVOKED'],
  REVOKED: [],
};

export class DPPSnapshotService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new DPP snapshot with deep-cloned product data.
   */
  async createSnapshot(
    organizationId: string,
    input: CreateSnapshotInput
  ): Promise<DPPSnapshot> {
    return this.prisma.$transaction(async (tx) => {
      // Get product with all related data
      const product = await tx.product.findFirst({
        where: { id: input.productId, organizationId },
        include: {
          identifiers: true,
          bomEntriesAsParent: {
            include: { childProduct: true },
          },
        },
      });

      if (!product) {
        throw new NotFoundError('Product', input.productId);
      }

      // Get released design version
      const designVersion = await tx.productVersion.findFirst({
        where: {
          productId: input.productId,
          workspace: 'DESIGN',
          status: 'RELEASED',
        },
        orderBy: { versionNumber: 'desc' },
        include: { bomEntries: true },
      });

      if (!designVersion) {
        throw new ValidationError('No released DESIGN version found for product');
      }

      // Get marketing version if provided
      let marketingVersion = null;
      if (input.marketingVersionId) {
        marketingVersion = await tx.productVersion.findFirst({
          where: {
            id: input.marketingVersionId,
            productId: input.productId,
            workspace: 'MARKETING',
            status: 'RELEASED',
          },
        });
      }

      // Get readiness profile
      const profile = await tx.readinessProfile.findUnique({
        where: { id: input.readinessProfileId },
      });

      if (!profile) {
        throw new NotFoundError('ReadinessProfile', input.readinessProfileId);
      }

      // Deep clone product data
      const snapshotData = {
        product: {
          id: product.id,
          name: product.name,
          description: product.description,
          productType: product.productType,
          identifiers: product.identifiers,
        },
        designVersion: {
          id: designVersion.id,
          versionNumber: designVersion.versionNumber,
          bomEntries: designVersion.bomEntries,
        },
        marketingVersion: marketingVersion ? {
          id: marketingVersion.id,
          versionNumber: marketingVersion.versionNumber,
        } : null,
        snapshotTimestamp: new Date().toISOString(),
      };

      // Calculate data hash
      const dataHash = createHash('sha256')
        .update(JSON.stringify(snapshotData))
        .digest('hex');

      // Calculate completion score (simplified)
      const completionScore = 100; // Would use checkReadiness in production

      return tx.dPPSnapshot.create({
        data: {
          organizationId,
          productId: input.productId,
          designVersionId: designVersion.id,
          marketingVersionId: marketingVersion?.id,
          data: snapshotData,
          dataHash,
          readinessProfileId: input.readinessProfileId,
          completionScore,
          status: 'PENDING_REVIEW',
        },
      });
    });
  }

  /**
   * Get a snapshot by ID.
   */
  async getSnapshot(
    organizationId: string,
    snapshotId: string
  ): Promise<DPPSnapshot | null> {
    return this.prisma.dPPSnapshot.findFirst({
      where: { id: snapshotId, organizationId },
      include: { readinessProfile: true },
    });
  }

  /**
   * List snapshots for an organization.
   */
  async listSnapshots(
    organizationId: string,
    options?: {
      productId?: string;
      status?: SnapshotStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<DPPSnapshot[]> {
    return this.prisma.dPPSnapshot.findMany({
      where: {
        organizationId,
        ...(options?.productId && { productId: options.productId }),
        ...(options?.status && { status: options.status }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
      include: { readinessProfile: true },
    });
  }

  /**
   * Verify snapshot (CONTRIBUTOR action).
   * PENDING_REVIEW → VERIFIED
   */
  async verify(
    organizationId: string,
    snapshotId: string,
    verifiedBy: string
  ): Promise<DPPSnapshot> {
    return this.transitionStatus(
      organizationId,
      snapshotId,
      'VERIFIED',
      { verifiedBy, verifiedAt: new Date() }
    );
  }

  /**
   * Attest snapshot (EDITOR action with user DID signature).
   * VERIFIED → ATTESTED
   */
  async attest(
    organizationId: string,
    snapshotId: string,
    attestedBy: string,
    input: AttestInput
  ): Promise<DPPSnapshot> {
    return this.transitionStatus(
      organizationId,
      snapshotId,
      'ATTESTED',
      {
        attestedBy,
        attestedAt: new Date(),
        userSignatureDid: input.userSignatureDid,
        userSignatureJws: input.userSignatureJws,
        userForensicContext: input.userForensicContext,
      }
    );
  }

  /**
   * Seal snapshot (SYSTEM action with org DID signature).
   * ATTESTED → SEALED
   */
  async seal(
    organizationId: string,
    snapshotId: string,
    input: SealInput
  ): Promise<DPPSnapshot> {
    return this.transitionStatus(
      organizationId,
      snapshotId,
      'SEALED',
      {
        sealedAt: new Date(),
        orgSignatureDid: input.orgSignatureDid,
        orgSignatureJws: input.orgSignatureJws,
        orgForensicContext: input.orgForensicContext,
      }
    );
  }

  /**
   * Issue DPP (final step with VC minting).
   * SEALED → ISSUED
   */
  async issue(
    organizationId: string,
    snapshotId: string,
    input: IssueInput
  ): Promise<DPPSnapshot> {
    return this.transitionStatus(
      organizationId,
      snapshotId,
      'ISSUED',
      {
        issuedAt: new Date(),
        vcId: input.vcId,
        vcJwt: input.vcJwt,
        dppUrl: input.dppUrl,
        qrCodeUrl: input.qrCodeUrl,
        credentialStatusIndex: input.credentialStatusIndex,
        timestampProof: input.timestampProof,
      }
    );
  }

  /**
   * Revoke an issued DPP.
   * ISSUED → REVOKED
   */
  async revoke(
    organizationId: string,
    snapshotId: string
  ): Promise<DPPSnapshot> {
    return this.transitionStatus(organizationId, snapshotId, 'REVOKED', {});
  }

  /**
   * Internal method to handle status transitions with validation.
   */
  private async transitionStatus(
    organizationId: string,
    snapshotId: string,
    targetStatus: SnapshotStatus,
    updateData: Record<string, unknown>
  ): Promise<DPPSnapshot> {
    const snapshot = await this.prisma.dPPSnapshot.findFirst({
      where: { id: snapshotId, organizationId },
    });

    if (!snapshot) {
      throw new NotFoundError('DPPSnapshot', snapshotId);
    }

    const currentStatus = snapshot.status as SnapshotStatus;
    const allowedTransitions = VALID_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(targetStatus)) {
      throw new ValidationError(
        `Cannot transition from ${currentStatus} to ${targetStatus}`
      );
    }

    return this.prisma.dPPSnapshot.update({
      where: { id: snapshotId },
      data: {
        status: targetStatus,
        ...updateData,
      },
    });
  }
}
