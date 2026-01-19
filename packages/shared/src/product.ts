/**
 * Product types and interfaces for the EuroComply platform.
 * @module product
 */

/**
 * Available product types in the system.
 * - FINISHED_GOOD: A complete product ready for sale
 * - RAW_MATERIAL: Raw materials used in production
 * - COMPONENT: Sub-assemblies or parts
 * - VARIANT: A variant of another product (e.g., different color/size)
 */
export const PRODUCT_TYPES = ['FINISHED_GOOD', 'RAW_MATERIAL', 'COMPONENT', 'VARIANT'] as const;

/** Type representing valid product types */
export type ProductType = typeof PRODUCT_TYPES[number];

/**
 * Product lifecycle statuses.
 * - ACTIVE: Product is currently active and available
 * - ARCHIVED: Product has been archived and is no longer active
 */
export const PRODUCT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;

/** Type representing valid product statuses */
export type ProductStatus = typeof PRODUCT_STATUSES[number];

/**
 * Workspaces that use ProductVersion (iterative content).
 * Only DESIGN and MARKETING workspaces support versioning.
 */
export const VERSIONED_WORKSPACES = ['DESIGN', 'MARKETING'] as const;

/** Type representing workspaces that support versioning */
export type VersionedWorkspace = typeof VERSIONED_WORKSPACES[number];

/**
 * All available workspaces in the system.
 * Used for authority checks and workspace-level permissions.
 */
export const ALL_WORKSPACES = ['DESIGN', 'OPERATIONS', 'MARKETING', 'COMPLIANCE'] as const;

/** Type representing all workspace types */
export type AllWorkspaceType = typeof ALL_WORKSPACES[number];

/**
 * @deprecated Use `VERSIONED_WORKSPACES` for ProductVersion operations,
 * or `ALL_WORKSPACES` for authority checks. Will be removed in v2.0.
 */
export const PRODUCT_WORKSPACES = VERSIONED_WORKSPACES;

/**
 * @deprecated Use `VersionedWorkspace` instead. Will be removed in v2.0.
 */
export type ProductWorkspace = VersionedWorkspace;

/**
 * Version workflow statuses.
 * - DRAFT: Initial state, editable
 * - PENDING_REVIEW: Submitted for review
 * - IN_REVIEW: Currently being reviewed
 * - RELEASED: Approved and immutable
 * - REJECTED: Review rejected, can create new draft
 */
export const VERSION_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'IN_REVIEW', 'RELEASED', 'REJECTED'] as const;

/** Type representing valid version statuses */
export type VersionStatus = typeof VERSION_STATUSES[number];

/**
 * Product identifier types.
 * - INTERNAL: Internal reference number
 * - SKU: Stock Keeping Unit
 * - GTIN: Global Trade Item Number (barcode)
 * - DPP_URI: Digital Product Passport URI
 */
export const IDENTIFIER_TYPES = ['INTERNAL', 'SKU', 'GTIN', 'DPP_URI'] as const;

/** Type representing valid identifier types */
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
