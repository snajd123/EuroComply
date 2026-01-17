import { PrismaClient, ProductVersion } from '@eurocomply/db';
import { ProductWorkspace, VersionStatus, canTransitionTo } from '@eurocomply/shared';
import { NotFoundError, ValidationError, ConflictError } from '../lib/errors.js';

export interface CreateVersionInput {
  productId: string;
  workspace: ProductWorkspace;
  createdBy: string;
}

export class VersionService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new version for a product in a specific workspace.
   * GUARD: Cannot create new version if there's already an in-progress version
   * (DRAFT, PENDING_REVIEW, or IN_REVIEW) in the same workspace.
   */
  async createVersion(
    organizationId: string,
    input: CreateVersionInput
  ): Promise<ProductVersion> {
    // Verify product belongs to org
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
    });

    if (!product || product.organizationId !== organizationId) {
      throw new NotFoundError('Product', input.productId);
    }

    // Check for existing in-progress version in this workspace
    const inProgressVersion = await this.prisma.productVersion.findFirst({
      where: {
        productId: input.productId,
        workspace: input.workspace,
        status: { in: ['DRAFT', 'PENDING_REVIEW', 'IN_REVIEW'] },
      },
    });

    if (inProgressVersion) {
      throw new ConflictError(
        `Cannot create new version: ${input.workspace} workspace already has a ${inProgressVersion.status} version (v${inProgressVersion.versionNumber})`
      );
    }

    // Get the latest version number for this workspace
    const latestVersion = await this.prisma.productVersion.findFirst({
      where: {
        productId: input.productId,
        workspace: input.workspace,
      },
      orderBy: { versionNumber: 'desc' },
    });

    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    return this.prisma.productVersion.create({
      data: {
        productId: input.productId,
        workspace: input.workspace,
        versionNumber: nextVersionNumber,
        status: 'DRAFT',
        createdBy: input.createdBy,
      },
    });
  }

  /**
   * Get a version by ID, ensuring it belongs to the organization.
   */
  async getVersion(
    organizationId: string,
    versionId: string
  ): Promise<ProductVersion | null> {
    const version = await this.prisma.productVersion.findFirst({
      where: { id: versionId },
      include: { product: true },
    });

    if (!version || version.product.organizationId !== organizationId) {
      return null;
    }

    return version;
  }

  /**
   * List versions for a product.
   */
  async listVersions(
    organizationId: string,
    productId: string,
    workspace?: ProductWorkspace
  ): Promise<ProductVersion[]> {
    return this.prisma.productVersion.findMany({
      where: {
        productId,
        product: { organizationId },
        ...(workspace && { workspace }),
      },
      orderBy: { versionNumber: 'desc' },
    });
  }

  /**
   * Transition a version to a new status with validation.
   * Uses transaction for RELEASED status to ensure atomic immutability lock.
   */
  private async transitionStatus(
    organizationId: string,
    versionId: string,
    targetStatus: VersionStatus,
    publishedBy?: string
  ): Promise<ProductVersion> {
    // For RELEASED status, use a transaction to ensure atomic check-and-update
    // This prevents race conditions where two concurrent requests could both
    // pass the canTransitionTo check before either updates the status
    if (targetStatus === 'RELEASED') {
      return this.prisma.$transaction(async (tx) => {
        // Re-fetch within transaction for consistency
        const version = await tx.productVersion.findFirst({
          where: { id: versionId },
          include: { product: true },
        });

        if (!version || version.product.organizationId !== organizationId) {
          throw new NotFoundError('Version', versionId);
        }

        if (!canTransitionTo(version.status as VersionStatus, targetStatus)) {
          throw new ValidationError(
            `Cannot transition from ${version.status} to ${targetStatus}`
          );
        }

        return tx.productVersion.update({
          where: { id: versionId },
          data: {
            status: targetStatus,
            publishedAt: new Date(),
            publishedBy,
          },
        });
      });
    }

    // Non-RELEASED transitions don't need transaction overhead
    const version = await this.getVersion(organizationId, versionId);

    if (!version) {
      throw new NotFoundError('Version', versionId);
    }

    if (!canTransitionTo(version.status as VersionStatus, targetStatus)) {
      throw new ValidationError(
        `Cannot transition from ${version.status} to ${targetStatus}`
      );
    }

    return this.prisma.productVersion.update({
      where: { id: versionId },
      data: { status: targetStatus },
    });
  }

  /**
   * Submit a version for review.
   */
  async submitForReview(
    organizationId: string,
    versionId: string
  ): Promise<ProductVersion> {
    return this.transitionStatus(organizationId, versionId, 'PENDING_REVIEW');
  }

  /**
   * Start reviewing a version.
   */
  async startReview(
    organizationId: string,
    versionId: string
  ): Promise<ProductVersion> {
    return this.transitionStatus(organizationId, versionId, 'IN_REVIEW');
  }

  /**
   * Release a version (make it immutable).
   * FORENSIC GUARD A: Once released, BOM entries cannot be modified.
   */
  async releaseVersion(
    organizationId: string,
    versionId: string,
    publishedBy: string
  ): Promise<ProductVersion> {
    return this.transitionStatus(organizationId, versionId, 'RELEASED', publishedBy);
  }

  /**
   * Reject a version.
   */
  async rejectVersion(
    organizationId: string,
    versionId: string
  ): Promise<ProductVersion> {
    return this.transitionStatus(organizationId, versionId, 'REJECTED');
  }

  /**
   * FORENSIC GUARD A: Check if a version is released (immutable).
   * Use this before any BOM mutation to enforce "Released data is Dead data."
   */
  async assertVersionEditable(
    organizationId: string,
    versionId: string
  ): Promise<void> {
    const version = await this.getVersion(organizationId, versionId);

    if (!version) {
      throw new NotFoundError('Version', versionId);
    }

    if (version.status === 'RELEASED') {
      throw new ValidationError('Cannot modify BOM: version is RELEASED (immutable)');
    }
  }
}
