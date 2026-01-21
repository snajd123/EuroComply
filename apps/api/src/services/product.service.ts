import { EntityManager, FilterQuery, UniqueConstraintViolationException } from '@mikro-orm/postgresql';
import {
  MikroOrm,
} from '@eurocomply/db';
import {
  CreateProductInput,
  UpdateProductInput,
} from '@eurocomply/shared';
import { ValidationError, NotFoundError, ConflictError } from '../lib/errors.js';
import { PAGINATION } from '../lib/config.js';
import { randomUUID } from 'crypto';

const { Product, ProductIdentifier, ProductVersion, BomEntry, ProductType, ProductStatus, Workspace, VersionStatus } = MikroOrm;

export interface ListProductsOptions {
  limit?: number;
  offset?: number;
  productType?: MikroOrm.ProductType | string;
  status?: MikroOrm.ProductStatus | string;
  parentId?: string;
}

// TODO: Phase 2 - Make workspace configurable for multi-workspace BOM inheritance.
// Currently MVP only supports DESIGN workspace for variant BOM cloning.
const BOM_INHERITANCE_WORKSPACE = Workspace.DESIGN;

/**
 * Generates a unique ID with the given prefix.
 */
function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

/**
 * ProductService handles product CRUD operations within a tenant schema.
 *
 * Architecture notes:
 * - The EntityManager passed to the constructor is already scoped to the tenant schema
 * - No organizationId filtering needed - schema isolation handles tenant separation
 * - All operations automatically target the correct tenant's products
 */
export class ProductService {
  constructor(private em: EntityManager) {}

  /**
   * Create a new product with optional identifiers.
   * FORENSIC GUARD B: For VARIANT products, auto-clones parent's RELEASED BOM.
   */
  async createProduct(
    input: CreateProductInput
  ): Promise<MikroOrm.Product> {
    // Validate: VARIANT must have parentId
    if (input.productType === 'VARIANT' && !input.parentId) {
      throw new ValidationError('VARIANT products must have a parentId');
    }

    // Validate: Non-VARIANT should not have parentId
    if (input.productType !== 'VARIANT' && input.parentId) {
      throw new ValidationError('Only VARIANT products can have a parentId');
    }

    // Validate: Parent product must exist
    if (input.parentId) {
      const parentProduct = await this.em.findOne(Product, { id: input.parentId });
      if (!parentProduct) {
        throw new NotFoundError('Parent product', input.parentId);
      }
    }

    try {
      return await this.em.transactional(async (em) => {
        // Create the product
        const productId = generateId('prd');
        const product = em.create(Product, {
          id: productId,
          name: input.name,
          description: input.description,
          productType: (input.productType as MikroOrm.ProductType) ?? ProductType.FINISHED_GOOD,
          parent: input.parentId ? em.getReference(Product, input.parentId) : undefined,
          status: ProductStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Create identifiers
        if (input.identifiers?.length) {
          for (const id of input.identifiers) {
            em.create(ProductIdentifier, {
              id: generateId('pid'),
              product,
              type: id.type as MikroOrm.IdentifierType,
              value: id.value,
              isPrimary: false,
              createdAt: new Date(),
            });
          }
        }

        await em.flush();

        // FORENSIC GUARD B: Variant Inheritance
        // Auto-clone parent's latest RELEASED BOM as variant's DRAFT v1.
        // NOTE: Currently hardcoded to DESIGN workspace for Phase 1 MVP.
        // Future: May need to clone from multiple workspaces or make configurable.
        if (input.productType === 'VARIANT' && input.parentId) {
          // Find parent's latest released version in the design workspace
          const parentReleasedVersions = await em.find(
            ProductVersion,
            {
              product: input.parentId,
              workspace: BOM_INHERITANCE_WORKSPACE,
              status: VersionStatus.PUBLISHED,
            },
            {
              orderBy: { versionNumber: 'DESC' },
              limit: 1,
            }
          );

          const parentReleasedVersion = parentReleasedVersions[0];
          if (parentReleasedVersion) {
            // Find BOM entries for this version
            const bomEntries = await em.find(BomEntry, { version: parentReleasedVersion.id });

            if (bomEntries.length > 0) {
              // AUDIT: Require createdBy for accountability - no anonymous BOM creation
              if (!input.createdBy) {
                throw new ValidationError('createdBy is required for variant BOM inheritance');
              }

              // Create DRAFT version for variant
              const variantVersionId = generateId('ver');
              const variantVersion = em.create(ProductVersion, {
                id: variantVersionId,
                product,
                workspace: BOM_INHERITANCE_WORKSPACE,
                versionNumber: 1,
                status: VersionStatus.DRAFT,
                createdBy: em.getReference(MikroOrm.User, input.createdBy),
                createdAt: new Date(),
                updatedAt: new Date(),
              });

              await em.flush();

              // Clone BOM entries
              for (const entry of bomEntries) {
                em.create(BomEntry, {
                  id: generateId('bom'),
                  parentProduct: product,
                  childProduct: em.getReference(Product, entry.childProduct.id),
                  version: variantVersion,
                  quantity: entry.quantity,
                  unit: entry.unit,
                  position: entry.position,
                  notes: entry.notes,
                  createdAt: new Date(),
                });
              }

              await em.flush();
            }
          }
        }

        // Populate relations before returning
        await em.populate(product, ['identifiers', 'versions', 'parent']);
        return product;
      });
    } catch (error) {
      // Handle unique constraint violations
      if (error instanceof UniqueConstraintViolationException) {
        // Check if it's an identifier constraint
        const message = error.message.toLowerCase();
        if (message.includes('product_identifier') || message.includes('type') || message.includes('value')) {
          // Find which identifier type might have caused the conflict
          const conflictingIdentifier = input.identifiers?.find((id) =>
            ['GTIN', 'DPP_URI', 'SKU', 'INTERNAL'].includes(id.type)
          );
          const identifierType = conflictingIdentifier?.type || 'identifier';
          throw new ConflictError(
            `${identifierType} value already exists. Each ${identifierType} must be globally unique.`
          );
        }
        throw new ConflictError('A product with these identifiers already exists');
      }
      throw error;
    }
  }

  /**
   * Get a product by ID.
   * Schema isolation ensures we only see products in the current tenant.
   */
  async getProduct(productId: string): Promise<MikroOrm.Product | null> {
    return this.em.findOne(
      Product,
      { id: productId },
      {
        populate: ['identifiers', 'versions', 'parent', 'variants'],
      }
    );
  }

  /**
   * List products with filtering and pagination.
   * Schema isolation handles tenant filtering automatically.
   */
  async listProducts(options: ListProductsOptions = {}): Promise<MikroOrm.Product[]> {
    const {
      limit = PAGINATION.DEFAULT_LIMIT,
      offset = PAGINATION.DEFAULT_OFFSET,
      productType,
      status = ProductStatus.ACTIVE,
      parentId,
    } = options;

    // Build filter query with proper types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      status: status as MikroOrm.ProductStatus,
    };
    if (productType) {
      where['productType'] = productType as MikroOrm.ProductType;
    }
    if (parentId !== undefined) {
      where['parent'] = parentId;
    }

    return this.em.find(Product, where as FilterQuery<MikroOrm.Product>, {
      populate: ['identifiers', 'versions', 'parent'],
      limit,
      offset,
      orderBy: { createdAt: 'DESC' },
    });
  }

  /**
   * Update a product.
   */
  async updateProduct(
    productId: string,
    input: UpdateProductInput
  ): Promise<MikroOrm.Product | null> {
    const product = await this.em.findOne(Product, { id: productId });
    if (!product) {
      return null;
    }

    // Update product properties directly
    if (input.name) {
      product.name = input.name;
    }
    if (input.description !== undefined) {
      product.description = input.description;
    }
    if (input.status) {
      product.status = input.status as MikroOrm.ProductStatus;
    }

    await this.em.flush();

    // Populate relations before returning
    await this.em.populate(product, ['identifiers', 'versions', 'parent']);
    return product;
  }

  /**
   * Archive a product (soft delete).
   */
  async archiveProduct(productId: string): Promise<MikroOrm.Product | null> {
    return this.updateProduct(productId, { status: 'ARCHIVED' });
  }
}
