import { PrismaClient, Product, Prisma, BomEntry } from '@eurocomply/db';
import {
  CreateProductInput,
  UpdateProductInput,
  ProductType,
  ProductStatus,
} from '@eurocomply/shared';

export interface ListProductsOptions {
  limit?: number;
  offset?: number;
  productType?: ProductType;
  status?: ProductStatus;
  parentId?: string;
}

const productInclude = {
  identifiers: true,
  versions: {
    orderBy: { versionNumber: 'desc' as const },
    take: 1,
  },
  parent: true,
  _count: {
    select: { variants: true },
  },
};

export class ProductService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new product with optional identifiers.
   * FORENSIC GUARD B: For VARIANT products, auto-clones parent's RELEASED BOM.
   */
  async createProduct(
    organizationId: string,
    input: CreateProductInput
  ): Promise<Product> {
    // Validate: VARIANT must have parentId
    if (input.productType === 'VARIANT' && !input.parentId) {
      throw new Error('VARIANT products must have a parentId');
    }

    // Validate: Non-VARIANT should not have parentId
    if (input.productType !== 'VARIANT' && input.parentId) {
      throw new Error('Only VARIANT products can have a parentId');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create the product
      const product = await tx.product.create({
        data: {
          organizationId,
          name: input.name,
          description: input.description,
          productType: input.productType,
          parentId: input.parentId,
          identifiers: input.identifiers
            ? {
                create: input.identifiers.map((id) => ({
                  type: id.type,
                  value: id.value,
                })),
              }
            : undefined,
        },
        include: productInclude,
      });

      // FORENSIC GUARD B: Variant Inheritance
      // Auto-clone parent's latest RELEASED BOM as variant's DRAFT v1.
      // NOTE: Currently hardcoded to DESIGN workspace for Phase 1 MVP.
      // Future: May need to clone from multiple workspaces or make configurable.
      if (input.productType === 'VARIANT' && input.parentId) {
        // SECURITY: Verify parent belongs to same organization before cloning
        const parentReleasedVersion = await tx.productVersion.findFirst({
          where: {
            productId: input.parentId,
            product: { organizationId }, // Cross-tenant protection
            workspace: 'DESIGN', // MVP: BOM inheritance only from DESIGN workspace
            status: 'RELEASED',
          },
          orderBy: { versionNumber: 'desc' },
          include: { bomEntries: true },
        });

        if (parentReleasedVersion && parentReleasedVersion.bomEntries.length > 0) {
          // AUDIT: Require createdBy for accountability - no anonymous BOM creation
          if (!input.createdBy) {
            throw new Error('createdBy is required for variant BOM inheritance');
          }

          // Create DRAFT version for variant
          const variantVersion = await tx.productVersion.create({
            data: {
              productId: product.id,
              workspace: 'DESIGN',
              versionNumber: 1,
              status: 'DRAFT',
              createdBy: input.createdBy,
            },
          });

          // Clone BOM entries
          await tx.bomEntry.createMany({
            data: parentReleasedVersion.bomEntries.map((entry: BomEntry) => ({
              parentProductId: product.id,
              childProductId: entry.childProductId,
              versionId: variantVersion.id,
              quantity: entry.quantity,
              unit: entry.unit,
              scrapRatePct: entry.scrapRatePct,
              yieldPct: entry.yieldPct,
              position: entry.position,
              notes: entry.notes,
            })),
          });
        }
      }

      return product;
    });
  }

  /**
   * Get a product by ID, ensuring it belongs to the organization.
   */
  async getProduct(
    organizationId: string,
    productId: string
  ): Promise<Product | null> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: productInclude,
    });

    // Tenant isolation check
    if (product && product.organizationId !== organizationId) {
      return null;
    }

    return product;
  }

  /**
   * List products for an organization with filtering and pagination.
   */
  async listProducts(
    organizationId: string,
    options: ListProductsOptions = {}
  ): Promise<Product[]> {
    const { limit = 20, offset = 0, productType, status = 'ACTIVE', parentId } = options;

    const where: Prisma.ProductWhereInput = {
      organizationId,
      status,
      ...(productType && { productType }),
      ...(parentId !== undefined && { parentId }),
    };

    return this.prisma.product.findMany({
      where,
      include: productInclude,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update a product.
   */
  async updateProduct(
    organizationId: string,
    productId: string,
    input: UpdateProductInput
  ): Promise<Product | null> {
    // First verify the product belongs to this org
    const existing = await this.getProduct(organizationId, productId);
    if (!existing) {
      return null;
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.status && { status: input.status }),
      },
      include: productInclude,
    });
  }

  /**
   * Archive a product (soft delete).
   */
  async archiveProduct(
    organizationId: string,
    productId: string
  ): Promise<Product | null> {
    return this.updateProduct(organizationId, productId, { status: 'ARCHIVED' });
  }
}
