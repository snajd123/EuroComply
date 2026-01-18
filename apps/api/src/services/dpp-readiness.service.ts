import { PrismaClient } from '@eurocomply/db';
import { NotFoundError } from '../lib/errors.js';

export interface ReadinessCheckResult {
  productId: string;
  profileId: string;
  score: number;
  isReady: boolean;
  missingFields: { workspace: string; field: string }[];
  missingAttestations: string[];
  missingRequirements: string[];
  designVersionId?: string;
  marketingVersionId?: string;
}

export class DPPReadinessService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Check if a product meets the requirements of a readiness profile.
   */
  async checkProductReadiness(
    organizationId: string,
    productId: string,
    profileId: string
  ): Promise<ReadinessCheckResult> {
    // Get product
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      include: {
        identifiers: true,
      },
    });

    if (!product) {
      throw new NotFoundError('Product', productId);
    }

    // Get readiness profile
    const profile = await this.prisma.readinessProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundError('ReadinessProfile', profileId);
    }

    const missingFields: { workspace: string; field: string }[] = [];
    const missingAttestations: string[] = [];
    const missingRequirements: string[] = [];
    let totalRequired = 0;
    let totalPresent = 0;

    // Check for released DESIGN version (mandatory)
    const designVersion = await this.prisma.productVersion.findFirst({
      where: {
        productId,
        workspace: 'DESIGN',
        status: 'RELEASED',
      },
      orderBy: { versionNumber: 'desc' },
    });

    if (!designVersion) {
      missingRequirements.push('Released DESIGN version required');
    }

    // Check for released MARKETING version (optional but scored)
    const marketingVersion = await this.prisma.productVersion.findFirst({
      where: {
        productId,
        workspace: 'MARKETING',
        status: 'RELEASED',
      },
      orderBy: { versionNumber: 'desc' },
    });

    // Check required fields from profile
    const requiredFields = (profile.requiredFields as Record<string, string[]>) || {};

    // Build product data object for checking
    const productData: Record<string, Record<string, unknown>> = {
      design: {
        name: product.name,
        description: product.description,
        productType: product.productType,
        identifiers: product.identifiers,
      },
      marketing: {},
    };

    // Check each required field
    for (const [workspace, fields] of Object.entries(requiredFields)) {
      const workspaceData = productData[workspace] || {};

      for (const field of fields) {
        totalRequired++;
        const value = workspaceData[field];

        if (value !== undefined && value !== null && value !== '') {
          totalPresent++;
        } else {
          missingFields.push({ workspace, field });
        }
      }
    }

    // Check required attestations
    const requiredAttestations = (profile.requiredAttestations as string[]) || [];
    // In production, this would check against actual attestation records
    const productAttestations: string[] = []; // Placeholder

    for (const attestation of requiredAttestations) {
      totalRequired++;
      if (productAttestations.includes(attestation)) {
        totalPresent++;
      } else {
        missingAttestations.push(attestation);
      }
    }

    // Add version requirements to total
    totalRequired++; // Design version
    if (designVersion) totalPresent++;

    // Calculate score
    const score = totalRequired > 0
      ? Math.round((totalPresent / totalRequired) * 100)
      : 100;

    // Determine if ready (100% score AND no missing requirements)
    const isReady = score === 100 && missingRequirements.length === 0;

    return {
      productId,
      profileId,
      score,
      isReady,
      missingFields,
      missingAttestations,
      missingRequirements,
      designVersionId: designVersion?.id,
      marketingVersionId: marketingVersion?.id,
    };
  }

  /**
   * Check readiness for all products of a given category.
   * Returns products that are ready for DPP issuance.
   */
  async getReadyProducts(
    organizationId: string,
    profileId: string
  ): Promise<ReadinessCheckResult[]> {
    const profile = await this.prisma.readinessProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundError('ReadinessProfile', profileId);
    }

    // Get all active products
    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        productType: 'FINISHED_GOOD', // Only finished goods get DPPs
      },
    });

    const results: ReadinessCheckResult[] = [];

    for (const product of products) {
      try {
        const result = await this.checkProductReadiness(
          organizationId,
          product.id,
          profileId
        );
        if (result.isReady) {
          results.push(result);
        }
      } catch {
        // Skip products that can't be checked
        continue;
      }
    }

    return results;
  }

  /**
   * Check if a product already has a pending or issued DPP snapshot.
   */
  async hasExistingSnapshot(
    organizationId: string,
    productId: string
  ): Promise<boolean> {
    const existing = await this.prisma.dPPSnapshot.findFirst({
      where: {
        organizationId,
        productId,
        status: {
          in: ['PENDING_REVIEW', 'VERIFIED', 'ATTESTED', 'SEALED', 'ISSUED'],
        },
      },
    });

    return existing !== null;
  }
}
