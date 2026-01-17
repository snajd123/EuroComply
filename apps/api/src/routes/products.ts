import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '@eurocomply/db';
import {
  ok,
  err,
  PRODUCT_TYPES,
  PRODUCT_WORKSPACES,
  IDENTIFIER_TYPES,
  type ProductWorkspace,
  type CreateProductInput,
} from '@eurocomply/shared';
import { ProductService } from '../services/product.service.js';
import { VersionService } from '../services/version.service.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AppVariables } from '../types/context.js';

const products = new Hono<{ Variables: AppVariables }>();
const productService = new ProductService(prisma);
const versionService = new VersionService(prisma);

// FORENSIC GUARD C: GTIN must be 8, 12, 13, or 14 digits
const GTIN_REGEX = /^(\d{8}|\d{12}|\d{13}|\d{14})$/;

// Validation schemas
const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  productType: z.enum(PRODUCT_TYPES),
  parentId: z.string().optional(),
  identifiers: z
    .array(
      z.object({
        type: z.enum(IDENTIFIER_TYPES),
        value: z.string().min(1),
      })
    )
    .optional()
    .refine(
      (ids) => {
        if (!ids) return true;
        const gtins = ids.filter((id) => id.type === 'GTIN');
        return gtins.every((id) => GTIN_REGEX.test(id.value));
      },
      { message: 'GTIN must be 8, 12, 13, or 14 digits' }
    ),
});

const updateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  productType: z.enum(PRODUCT_TYPES).optional(),
  parentId: z.string().optional(),
});

const createVersionSchema = z.object({
  workspace: z.enum(PRODUCT_WORKSPACES),
});

// Apply auth middleware to all routes
products.use('*', authMiddleware);

/**
 * GET /api/v1/products
 * List products for the organization.
 */
products.get('/', zValidator('query', listQuerySchema), async (c) => {
  const { organizationId } = c.get('tenant');
  const query = c.req.valid('query');

  const items = await productService.listProducts(organizationId, query);

  return c.json(ok({ items, limit: query.limit, offset: query.offset }));
});

/**
 * POST /api/v1/products
 * Create a new product.
 */
products.post('/', zValidator('json', createProductSchema), async (c) => {
  const { organizationId } = c.get('tenant');
  const { id: userId } = c.get('user');
  const input = c.req.valid('json');

  try {
    const createInput: CreateProductInput = {
      name: input.name,
      description: input.description,
      productType: input.productType,
      parentId: input.parentId,
      identifiers: input.identifiers,
      createdBy: userId,
    };
    const product = await productService.createProduct(organizationId, createInput);
    return c.json(ok(product), 201);
  } catch (error) {
    if (error instanceof Error) {
      return c.json(err('VALIDATION_ERROR', error.message), 400);
    }
    throw error;
  }
});

/**
 * GET /api/v1/products/:id
 * Get a product by ID.
 */
products.get('/:id', async (c) => {
  const { organizationId } = c.get('tenant');
  const productId = c.req.param('id');

  const product = await productService.getProduct(organizationId, productId);

  if (!product) {
    return c.json(err('NOT_FOUND', 'Product not found'), 404);
  }

  return c.json(ok(product));
});

/**
 * PATCH /api/v1/products/:id
 * Update a product.
 */
products.patch('/:id', zValidator('json', updateProductSchema), async (c) => {
  const { organizationId } = c.get('tenant');
  const productId = c.req.param('id');
  const input = c.req.valid('json');

  const product = await productService.updateProduct(organizationId, productId, input);

  if (!product) {
    return c.json(err('NOT_FOUND', 'Product not found'), 404);
  }

  return c.json(ok(product));
});

/**
 * DELETE /api/v1/products/:id
 * Archive a product (soft delete).
 */
products.delete('/:id', async (c) => {
  const { organizationId } = c.get('tenant');
  const productId = c.req.param('id');

  const product = await productService.archiveProduct(organizationId, productId);

  if (!product) {
    return c.json(err('NOT_FOUND', 'Product not found'), 404);
  }

  return c.json(ok({ message: 'Product archived' }));
});

/**
 * POST /api/v1/products/:id/versions
 * Create a new version for a product.
 */
products.post(
  '/:id/versions',
  zValidator('json', createVersionSchema),
  async (c) => {
    const { organizationId } = c.get('tenant');
    const { id: userId } = c.get('user');
    const productId = c.req.param('id');
    const { workspace } = c.req.valid('json');

    try {
      const version = await versionService.createVersion(organizationId, {
        productId,
        workspace,
        createdBy: userId,
      });
      return c.json(ok(version), 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'Product not found') {
        return c.json(err('NOT_FOUND', 'Product not found'), 404);
      }
      throw error;
    }
  }
);

/**
 * GET /api/v1/products/:id/versions
 * List versions for a product.
 */
products.get('/:id/versions', async (c) => {
  const { organizationId } = c.get('tenant');
  const productId = c.req.param('id');
  const workspaceParam = c.req.query('workspace');

  // Validate workspace parameter if provided
  let workspace: ProductWorkspace | undefined;
  if (workspaceParam) {
    const validWorkspaces = PRODUCT_WORKSPACES as readonly string[];
    if (validWorkspaces.indexOf(workspaceParam) !== -1) {
      workspace = workspaceParam as ProductWorkspace;
    }
  }

  const versions = await versionService.listVersions(
    organizationId,
    productId,
    workspace
  );

  return c.json(ok({ items: versions }));
});

export { products };
