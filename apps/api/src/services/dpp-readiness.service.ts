import { EntityManager } from '@mikro-orm/postgresql';
import { MikroOrm, DppSnapshotStatus } from '@eurocomply/db';
import { NotFoundError } from '../lib/errors.js';
import { loggers } from '../lib/logger.js';

const log = loggers.compliance;

const { Product, ProductVersion, ReadinessProfile, DppSnapshot } = MikroOrm;

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

/**
 * DPPReadinessService checks if products meet the requirements for DPP issuance.
 *
 * Architecture notes:
 * - The EntityManager passed to the constructor is already scoped to the tenant schema
 * - No organizationId filtering needed - schema isolation handles tenant separation
 */
export class DPPReadinessService {
  constructor(private em: EntityManager) {}

  /**
   * Check if a product meets the requirements of a readiness profile.
   */
  async checkProductReadiness(
    productId: string,
    profileId: string
  ): Promise<ReadinessCheckResult> {
    // Get product with identifiers
    const product = await this.em.findOne(
      Product,
      { id: productId },
      { populate: ['identifiers'] }
    );

    if (!product) {
      throw new NotFoundError('Product', productId);
    }

    // Get readiness profile
    const profile = await this.em.findOne(ReadinessProfile, { id: profileId });

    if (!profile) {
      throw new NotFoundError('ReadinessProfile', profileId);
    }

    const missingFields: { workspace: string; field: string }[] = [];
    const missingAttestations: string[] = [];
    const missingRequirements: string[] = [];
    let totalRequired = 0;
    let totalPresent = 0;

    // Check for released DESIGN version (mandatory)
    const designVersion = await this.em.findOne(
      ProductVersion,
      {
        product: productId,
        workspace: 'DESIGN' as unknown as MikroOrm.Workspace,
        status: 'RELEASED' as unknown as MikroOrm.VersionStatus,
      },
      { orderBy: { versionNumber: 'DESC' } }
    );

    if (!designVersion) {
      missingRequirements.push('Released DESIGN version required');
    }

    // Check for released MARKETING version (optional but scored)
    const marketingVersion = await this.em.findOne(
      ProductVersion,
      {
        product: productId,
        workspace: 'MARKETING' as unknown as MikroOrm.Workspace,
        status: 'RELEASED' as unknown as MikroOrm.VersionStatus,
      },
      { orderBy: { versionNumber: 'DESC' } }
    );

    // Check required fields from profile
    const requirements = profile.requirements as { requiredFields?: Record<string, string[]>; requiredAttestations?: string[] };
    const requiredFields = requirements?.requiredFields || {};

    // Build product data object for checking
    const productData: Record<string, Record<string, unknown>> = {
      design: {
        name: product.name,
        description: product.description,
        productType: product.productType,
        identifiers: product.identifiers.getItems(),
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
    const requiredAttestations = requirements?.requiredAttestations || [];
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
  async getReadyProducts(profileId: string): Promise<ReadinessCheckResult[]> {
    const profile = await this.em.findOne(ReadinessProfile, { id: profileId });

    if (!profile) {
      throw new NotFoundError('ReadinessProfile', profileId);
    }

    // Get all active products (only finished goods get DPPs)
    const products = await this.em.find(Product, {
      status: 'ACTIVE' as unknown as MikroOrm.ProductStatus,
      productType: 'FINISHED_GOOD' as unknown as MikroOrm.ProductType,
    });

    const results: ReadinessCheckResult[] = [];

    for (const product of products) {
      try {
        const result = await this.checkProductReadiness(product.id, profileId);
        if (result.isReady) {
          results.push(result);
        }
      } catch (error) {
        // Log warning but continue checking other products
        log.warn(
          { productId: product.id, profileId, error: error instanceof Error ? error.message : error },
          'Failed to check product readiness'
        );
        continue;
      }
    }

    return results;
  }

  /**
   * Check if a product already has a pending or issued DPP snapshot.
   */
  async hasExistingSnapshot(productId: string): Promise<boolean> {
    const existing = await this.em.findOne(DppSnapshot, {
      product: productId,
      status: {
        $in: [
          DppSnapshotStatus.PENDING_REVIEW,
          DppSnapshotStatus.VERIFIED,
          DppSnapshotStatus.ATTESTED,
          DppSnapshotStatus.SEALED,
          DppSnapshotStatus.ISSUED,
        ],
      },
    });

    return existing !== null;
  }
}
