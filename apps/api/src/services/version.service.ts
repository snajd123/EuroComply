import { EntityManager } from '@mikro-orm/postgresql';
import { MikroOrm } from '@eurocomply/db';
import {
  ProductWorkspace,
  VersionStatus,
  canTransitionTo,
  UserForensicContext,
  OrgForensicContext,
} from '@eurocomply/shared';
import { NotFoundError, ValidationError, ConflictError } from '../lib/errors.js';
import { SigningService } from './signing.service.js';
import { randomUUID } from 'crypto';

const { Product, ProductVersion, User } = MikroOrm;

export interface CreateVersionInput {
  productId: string;
  workspace: ProductWorkspace;
  createdBy: string;
}

/**
 * Optional signing context for releasing a version with Corporate Envelope signing.
 * When provided, creates a dual-signed SealedArtifact for forensic traceability.
 */
export interface ReleaseVersionSigningContext {
  userDid: string;
  userForensicContext: UserForensicContext;
  orgDid: string;
  orgForensicContext: OrgForensicContext;
}

/**
 * Generates a unique ID with the given prefix.
 */
function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

/**
 * VersionService manages product version lifecycle (DRAFT → PENDING_REVIEW → IN_REVIEW → RELEASED).
 *
 * Architecture notes:
 * - The EntityManager passed to the constructor is already scoped to the tenant schema
 * - No organizationId filtering needed - schema isolation handles tenant separation
 * - FORENSIC GUARD A: Released versions are immutable
 */
export class VersionService {
  private signingService: SigningService;

  constructor(
    private em: EntityManager,
    signingService?: SigningService
  ) {
    // Use provided SigningService or create a new instance
    this.signingService = signingService ?? new SigningService();
  }

  /**
   * Create a new version for a product in a specific workspace.
   * GUARD: Cannot create new version if there's already an in-progress version
   * (DRAFT, PENDING_REVIEW, or IN_REVIEW) in the same workspace.
   */
  async createVersion(input: CreateVersionInput): Promise<MikroOrm.ProductVersion> {
    // Verify product exists
    const product = await this.em.findOne(Product, { id: input.productId });

    if (!product) {
      throw new NotFoundError('Product', input.productId);
    }

    // Check for existing in-progress version in this workspace
    const inProgressVersion = await this.em.findOne(ProductVersion, {
      product: input.productId,
      workspace: input.workspace as unknown as MikroOrm.Workspace,
      status: { $in: ['DRAFT', 'PENDING_REVIEW', 'IN_REVIEW'] as unknown as MikroOrm.VersionStatus[] },
    });

    if (inProgressVersion) {
      throw new ConflictError(
        `Cannot create new version: ${input.workspace} workspace already has a ${inProgressVersion.status} version (v${inProgressVersion.versionNumber})`
      );
    }

    // Get the latest version number for this workspace
    const latestVersion = await this.em.findOne(
      ProductVersion,
      {
        product: input.productId,
        workspace: input.workspace as unknown as MikroOrm.Workspace,
      },
      { orderBy: { versionNumber: 'DESC' } }
    );

    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const version = this.em.create(ProductVersion, {
      id: generateId('ver'),
      product: this.em.getReference(Product, input.productId),
      workspace: input.workspace as unknown as MikroOrm.Workspace,
      versionNumber: nextVersionNumber,
      status: 'DRAFT' as unknown as MikroOrm.VersionStatus,
      createdBy: this.em.getReference(User, input.createdBy),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.em.flush();
    return version;
  }

  /**
   * Get a version by ID.
   * Schema isolation ensures we only see versions in the current tenant.
   */
  async getVersion(versionId: string): Promise<MikroOrm.ProductVersion | null> {
    return this.em.findOne(
      ProductVersion,
      { id: versionId },
      { populate: ['product'] }
    );
  }

  /**
   * List versions for a product.
   */
  async listVersions(
    productId: string,
    workspace?: ProductWorkspace
  ): Promise<MikroOrm.ProductVersion[]> {
    return this.em.find(
      ProductVersion,
      {
        product: productId,
        ...(workspace && { workspace: workspace as unknown as MikroOrm.Workspace }),
      },
      { orderBy: { versionNumber: 'DESC' } }
    );
  }

  /**
   * Transition a version to a new status with validation.
   * All transitions use transactions to prevent race conditions where
   * concurrent requests could both pass validation before either updates.
   */
  private async transitionStatus(
    versionId: string,
    targetStatus: VersionStatus,
    publishedBy?: string
  ): Promise<MikroOrm.ProductVersion> {
    return this.em.transactional(async (em) => {
      // Fetch within transaction for consistency
      const version = await em.findOne(
        ProductVersion,
        { id: versionId },
        { populate: ['product'] }
      );

      if (!version) {
        throw new NotFoundError('Version', versionId);
      }

      if (!canTransitionTo(version.status as VersionStatus, targetStatus)) {
        throw new ValidationError(
          `Cannot transition from ${version.status} to ${targetStatus}`
        );
      }

      version.status = targetStatus as unknown as MikroOrm.VersionStatus;

      if (targetStatus === 'RELEASED') {
        version.publishedAt = new Date();
        if (publishedBy) {
          version.publishedBy = em.getReference(User, publishedBy);
        }
      }

      await em.flush();
      return version;
    });
  }

  /**
   * Submit a version for review.
   */
  async submitForReview(versionId: string): Promise<MikroOrm.ProductVersion> {
    return this.transitionStatus(versionId, 'PENDING_REVIEW');
  }

  /**
   * Start reviewing a version.
   */
  async startReview(versionId: string): Promise<MikroOrm.ProductVersion> {
    return this.transitionStatus(versionId, 'IN_REVIEW');
  }

  /**
   * Release a version (make it immutable).
   * FORENSIC GUARD A: Once released, BOM entries cannot be modified.
   *
   * When signingContext is provided, creates a Corporate Envelope (SealedArtifact)
   * with dual signatures (user + organization) for forensic traceability.
   *
   * @param versionId - The version to release
   * @param publishedBy - The user releasing the version
   * @param signingContext - Optional signing context for Corporate Envelope creation
   */
  async releaseVersion(
    versionId: string,
    publishedBy: string,
    signingContext?: ReleaseVersionSigningContext
  ): Promise<MikroOrm.ProductVersion> {
    return this.em.transactional(async (em) => {
      // Fetch within transaction for consistency
      const version = await em.findOne(
        ProductVersion,
        { id: versionId },
        { populate: ['product'] }
      );

      if (!version) {
        throw new NotFoundError('Version', versionId);
      }

      if (!canTransitionTo(version.status as VersionStatus, 'RELEASED')) {
        throw new ValidationError(
          `Cannot transition from ${version.status} to RELEASED`
        );
      }

      const publishedAt = new Date();

      // Prepare signature data if signing context is provided
      let signatureDid: string | undefined;
      let signatureJws: string | undefined;

      if (signingContext) {
        // Build payload from version data
        const payload: Record<string, unknown> = {
          id: version.id,
          productId: version.product.id,
          workspace: version.workspace,
          versionNumber: version.versionNumber,
          status: 'RELEASED',
          publishedAt: publishedAt.toISOString(),
          publishedBy,
        };

        // Create corporate envelope with dual signatures
        const sealedArtifact = await this.signingService.createCorporateEnvelope(
          payload,
          {
            did: signingContext.userDid,
            forensicContext: signingContext.userForensicContext,
          },
          {
            did: signingContext.orgDid,
            forensicContext: signingContext.orgForensicContext,
          }
        );

        signatureDid = signingContext.orgDid;
        signatureJws = JSON.stringify(sealedArtifact);
      }

      version.status = 'RELEASED' as unknown as MikroOrm.VersionStatus;
      version.publishedAt = publishedAt;
      version.publishedBy = em.getReference(User, publishedBy);
      version.signatureDid = signatureDid;
      version.signatureJws = signatureJws;

      await em.flush();
      return version;
    });
  }

  /**
   * Reject a version.
   */
  async rejectVersion(versionId: string): Promise<MikroOrm.ProductVersion> {
    return this.transitionStatus(versionId, 'REJECTED');
  }

  /**
   * FORENSIC GUARD A: Check if a version is released (immutable).
   * Use this before any BOM mutation to enforce "Released data is Dead data."
   */
  async assertVersionEditable(versionId: string): Promise<void> {
    const version = await this.getVersion(versionId);

    if (!version) {
      throw new NotFoundError('Version', versionId);
    }

    if (version.status === ('RELEASED' as unknown as MikroOrm.VersionStatus)) {
      throw new ValidationError('Cannot modify BOM: version is RELEASED (immutable)');
    }
  }
}
