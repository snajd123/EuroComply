/**
 * Product types and interfaces for the EuroComply platform.
 */

export const PRODUCT_TYPES = ['FINISHED_GOOD', 'RAW_MATERIAL', 'COMPONENT', 'VARIANT'] as const;
export type ProductType = typeof PRODUCT_TYPES[number];

export const PRODUCT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ProductStatus = typeof PRODUCT_STATUSES[number];

export const PRODUCT_WORKSPACES = ['DESIGN', 'OPERATIONS', 'MARKETING', 'COMPLIANCE'] as const;
export type ProductWorkspace = typeof PRODUCT_WORKSPACES[number];

export const VERSION_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'IN_REVIEW', 'RELEASED', 'REJECTED'] as const;
export type VersionStatus = typeof VERSION_STATUSES[number];

export const IDENTIFIER_TYPES = ['INTERNAL', 'SKU', 'GTIN', 'DPP_URI'] as const;
export type IdentifierType = typeof IDENTIFIER_TYPES[number];

/**
 * Input for creating a new product.
 */
export interface CreateProductInput {
  name: string;
  description?: string;
  productType: ProductType;
  parentId?: string; // For variants
  createdBy?: string; // User ID for variant BOM inheritance
  identifiers?: {
    type: IdentifierType;
    value: string;
  }[];
}

/**
 * Input for updating a product.
 */
export interface UpdateProductInput {
  name?: string;
  description?: string;
  status?: ProductStatus;
}

/**
 * Input for creating a new version.
 */
export interface CreateVersionInput {
  productId: string;
  workspace: ProductWorkspace;
}

/**
 * Input for adding a BOM entry.
 */
export interface AddBomEntryInput {
  parentProductId: string;
  childProductId: string;
  versionId: string;
  quantity: number;
  unit: string;
  scrapRatePct?: number;
  yieldPct?: number;
  position?: number;
  notes?: string;
}

/**
 * Check if a version status allows editing (DRAFT or REJECTED).
 * Use this in BOM service to validate mutations.
 *
 * @example
 * // In future BOM service:
 * async addBomEntry(versionId: string, entry: BomEntry) {
 *   const version = await this.getVersion(versionId);
 *   if (!isEditableStatus(version.status)) {
 *     throw new Error('Cannot modify BOM: version is not editable');
 *   }
 *   // ... add entry
 * }
 */
export function isEditableStatus(status: VersionStatus): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}

/**
 * Check if a version can transition to a target status.
 */
export function canTransitionTo(current: VersionStatus, target: VersionStatus): boolean {
  const transitions: Record<VersionStatus, VersionStatus[]> = {
    DRAFT: ['PENDING_REVIEW'],
    PENDING_REVIEW: ['IN_REVIEW', 'DRAFT'],
    IN_REVIEW: ['RELEASED', 'REJECTED'],
    RELEASED: [], // Immutable
    REJECTED: ['DRAFT'], // Can create new draft
  };
  return transitions[current]?.includes(target) ?? false;
}
