import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { MikroOrm, DppSnapshotStatus } from '@eurocomply/db';
import { createHash, randomUUID } from 'crypto';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const { Product, ProductVersion, BomEntry, DppSnapshot, ReadinessProfile, User } = MikroOrm;

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

/**
 * Generates a unique ID with the given prefix.
 */
function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

/**
 * DPPSnapshotService manages the DPP issuance workflow.
 *
 * Workflow: PENDING_REVIEW → VERIFIED → ATTESTED → SEALED → ISSUED → REVOKED
 *
 * Architecture notes:
 * - The EntityManager passed to the constructor is already scoped to the tenant schema
 * - No organizationId filtering needed - schema isolation handles tenant separation
 * - Deep-clones product data at snapshot creation for immutability
 */
export class DPPSnapshotService {
  constructor(private em: EntityManager) {}

  /**
   * Create a new DPP snapshot with deep-cloned product data.
   */
  async createSnapshot(input: CreateSnapshotInput): Promise<MikroOrm.DppSnapshot> {
    return this.em.transactional(async (em) => {
      // Get product with all related data
      const product = await em.findOne(
        Product,
        { id: input.productId },
        { populate: ['identifiers'] }
      );

      if (!product) {
        throw new NotFoundError('Product', input.productId);
      }

      // Get released design version
      const designVersion = await em.findOne(
        ProductVersion,
        {
          product: input.productId,
          workspace: 'DESIGN' as unknown as MikroOrm.Workspace,
          status: 'RELEASED' as unknown as MikroOrm.VersionStatus,
        },
        { orderBy: { versionNumber: 'DESC' } }
      );

      if (!designVersion) {
        throw new ValidationError('No released DESIGN version found for product');
      }

      // Get BOM entries for this version
      const bomEntries = await em.find(BomEntry, { version: designVersion.id });

      // Get marketing version if provided
      let marketingVersion: MikroOrm.ProductVersion | null = null;
      if (input.marketingVersionId) {
        marketingVersion = await em.findOne(ProductVersion, {
          id: input.marketingVersionId,
          product: input.productId,
          workspace: 'MARKETING' as unknown as MikroOrm.Workspace,
          status: 'RELEASED' as unknown as MikroOrm.VersionStatus,
        });

        if (!marketingVersion) {
          throw new ValidationError(
            `Marketing version ${input.marketingVersionId} not found or not released`
          );
        }
      }

      // Get readiness profile
      const profile = await em.findOne(ReadinessProfile, { id: input.readinessProfileId });

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
          identifiers: product.identifiers.getItems().map((id) => ({
            type: id.type,
            value: id.value,
          })),
        },
        designVersion: {
          id: designVersion.id,
          versionNumber: designVersion.versionNumber,
          bomEntries: bomEntries.map((entry) => ({
            id: entry.id,
            childProductId: entry.childProduct.id,
            quantity: entry.quantity,
            unit: entry.unit,
          })),
        },
        marketingVersion: marketingVersion
          ? {
              id: marketingVersion.id,
              versionNumber: marketingVersion.versionNumber,
            }
          : null,
        snapshotTimestamp: new Date().toISOString(),
      };

      // Calculate data hash
      const dataHash = createHash('sha256')
        .update(JSON.stringify(snapshotData))
        .digest('hex');

      // Calculate completion score (simplified)
      const completionScore = 100; // Would use checkReadiness in production

      const snapshot = em.create(DppSnapshot, {
        id: generateId('snap'),
        product: em.getReference(Product, input.productId),
        designVersion: em.getReference(ProductVersion, designVersion.id),
        marketingVersion: marketingVersion
          ? em.getReference(ProductVersion, marketingVersion.id)
          : undefined,
        readinessProfile: em.getReference(ReadinessProfile, input.readinessProfileId),
        data: snapshotData,
        dataHash,
        completionScore,
        status: DppSnapshotStatus.PENDING_REVIEW,
        createdAt: new Date(),
      });

      await em.flush();
      return snapshot;
    });
  }

  /**
   * Get a snapshot by ID.
   */
  async getSnapshot(snapshotId: string): Promise<MikroOrm.DppSnapshot | null> {
    return this.em.findOne(
      DppSnapshot,
      { id: snapshotId },
      { populate: ['readinessProfile', 'product'] }
    );
  }

  /**
   * List snapshots for the tenant.
   */
  async listSnapshots(options?: {
    productId?: string;
    status?: SnapshotStatus;
    limit?: number;
    offset?: number;
  }): Promise<MikroOrm.DppSnapshot[]> {
    return this.em.find(
      DppSnapshot,
      {
        ...(options?.productId && { product: options.productId }),
        ...(options?.status && { status: options.status as unknown as MikroOrm.DppSnapshotStatus }),
      },
      {
        orderBy: { createdAt: 'DESC' },
        limit: options?.limit ?? 50,
        offset: options?.offset ?? 0,
        populate: ['readinessProfile'],
      }
    );
  }

  /**
   * Verify snapshot (CONTRIBUTOR action).
   * PENDING_REVIEW → VERIFIED
   */
  async verify(snapshotId: string, verifiedById: string): Promise<MikroOrm.DppSnapshot> {
    return this.transitionStatus(snapshotId, 'VERIFIED', {
      verifiedBy: this.em.getReference(User, verifiedById),
      verifiedAt: new Date(),
    });
  }

  /**
   * Attest snapshot (EDITOR action with user DID signature).
   * VERIFIED → ATTESTED
   */
  async attest(
    snapshotId: string,
    attestedById: string,
    input: AttestInput
  ): Promise<MikroOrm.DppSnapshot> {
    return this.transitionStatus(snapshotId, 'ATTESTED', {
      attestedBy: this.em.getReference(User, attestedById),
      attestedAt: new Date(),
      userSignatureDid: input.userSignatureDid,
      userSignatureJws: input.userSignatureJws,
      userForensicContext: input.userForensicContext,
    });
  }

  /**
   * Seal snapshot (SYSTEM action with org DID signature).
   * ATTESTED → SEALED
   */
  async seal(snapshotId: string, input: SealInput): Promise<MikroOrm.DppSnapshot> {
    return this.transitionStatus(snapshotId, 'SEALED', {
      sealedAt: new Date(),
      orgSignatureDid: input.orgSignatureDid,
      orgSignatureJws: input.orgSignatureJws,
      orgForensicContext: input.orgForensicContext,
    });
  }

  /**
   * Issue DPP (final step with VC minting).
   * SEALED → ISSUED
   */
  async issue(snapshotId: string, input: IssueInput): Promise<MikroOrm.DppSnapshot> {
    return this.transitionStatus(snapshotId, 'ISSUED', {
      issuedAt: new Date(),
      vcId: input.vcId,
      vcJwt: input.vcJwt,
      dppUrl: input.dppUrl,
      qrCodeUrl: input.qrCodeUrl,
      credentialStatusIndex: input.credentialStatusIndex,
      timestampProof: input.timestampProof,
    });
  }

  /**
   * Revoke an issued DPP.
   * ISSUED → REVOKED
   */
  async revoke(snapshotId: string): Promise<MikroOrm.DppSnapshot> {
    return this.transitionStatus(snapshotId, 'REVOKED', {});
  }

  /**
   * Internal method to handle status transitions with validation.
   * Uses transaction with pessimistic locking to prevent race conditions.
   */
  private async transitionStatus(
    snapshotId: string,
    targetStatus: SnapshotStatus,
    updateData: Record<string, unknown>
  ): Promise<MikroOrm.DppSnapshot> {
    return this.em.transactional(async (em) => {
      // Use pessimistic write lock to prevent concurrent transitions
      const snapshot = await em.findOne(
        DppSnapshot,
        { id: snapshotId },
        { lockMode: LockMode.PESSIMISTIC_WRITE }
      );

      if (!snapshot) {
        throw new NotFoundError('DPPSnapshot', snapshotId);
      }

      const currentStatus = snapshot.status as unknown as SnapshotStatus;
      const allowedTransitions = VALID_TRANSITIONS[currentStatus];

      if (!allowedTransitions.includes(targetStatus)) {
        throw new ValidationError(
          `Cannot transition from ${currentStatus} to ${targetStatus}`
        );
      }

      snapshot.status = targetStatus as unknown as MikroOrm.DppSnapshotStatus;

      // Apply update data - these are typed updates from the calling methods
      for (const [key, value] of Object.entries(updateData)) {
        (snapshot as unknown as Record<string, unknown>)[key] = value;
      }

      await em.flush();
      return snapshot;
    });
  }
}
