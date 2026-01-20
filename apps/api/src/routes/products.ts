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
import { NotFoundError, ValidationError, ConflictError } from '../lib/errors.js';
import { PAGINATION } from '../lib/config.js';
import type { AppVariables } from '../types/context.js';

const products = new Hono<{ Variables: AppVariables }>();

// VersionService still uses Prisma (will be migrated in a separate task)
const versionService = new VersionService(prisma);

// FORENSIC GUARD C: GTIN must be 8, 12, 13, or 14 digits with valid checksum
const GTIN_REGEX = /^(\d{8}|\d{12}|\d{13}|\d{14})$/;

/**
 * Validates GTIN checksum using modulo 10 algorithm.
 * Works for GTIN-8, GTIN-12, GTIN-13, and GTIN-14.
 */
function isValidGtinChecksum(gtin: string): boolean {
  if (!GTIN_REGEX.test(gtin)) {
    return false;
  }

  const digits = gtin.split('').map(Number);
  const checkDigit = digits.pop()!;

  // Calculate expected check digit using modulo 10 algorithm
  // Alternate multipliers: 3, 1, 3, 1... from right to left
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    const position = digits.length - i;
    const multiplier = position % 2 === 1 ? 3 : 1;
    const digit = digits[i];
    if (digit !== undefined) {
      sum += digit * multiplier;
    }
  }

  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return checkDigit === expectedCheckDigit;
}

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
        // Validate format first
        if (!gtins.every((id) => GTIN_REGEX.test(id.value))) {
          return false;
        }
        // Then validate checksum
        return gtins.every((id) => isValidGtinChecksum(id.value));
      },
      { message: 'GTIN must be 8, 12, 13, or 14 digits with valid checksum' }
    ),
});

const updateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  offset: z.coerce.number().min(0).default(PAGINATION.DEFAULT_OFFSET),
  productType: z.enum(PRODUCT_TYPES).optional(),
  parentId: z.string().optional(),
});

const createVersionSchema = z.object({
  workspace: z.enum(PRODUCT_WORKSPACES),
});

// Apply auth middleware to all routes
products.use('*', authMiddleware);

/**
 * Helper to get ProductService scoped to the tenant's EntityManager.
 * The EntityManager is already scoped to the tenant schema by the auth middleware.
 */
function getProductService(c: { get: (key: 'em') => import('@mikro-orm/postgresql').EntityManager | undefined }): ProductService {
  const em = c.get('em');
  if (!em) {
    throw new Error('EntityManager not available. Make sure auth middleware sets em.');
  }
  return new ProductService(em);
}

/**
 * GET /api/v1/products
 * List products for the organization.
 */
products.get('/', zValidator('query', listQuerySchema), async (c) => {
  const query = c.req.valid('query');
  const productService = getProductService(c);

  const items = await productService.listProducts(query);

  return c.json(ok({ items, limit: query.limit, offset: query.offset }));
});

/**
 * POST /api/v1/products
 * Create a new product.
 */
products.post('/', zValidator('json', createProductSchema), async (c) => {
  const { id: userId } = c.get('user');
  const input = c.req.valid('json');
  const productService = getProductService(c);

  try {
    const createInput: CreateProductInput = {
      name: input.name,
      description: input.description,
      productType: input.productType,
      parentId: input.parentId,
      identifiers: input.identifiers,
      createdBy: userId,
    };
    const product = await productService.createProduct(createInput);
    return c.json(ok(product), 201);
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json(err('VALIDATION_ERROR', error.message), 400);
    }
    if (error instanceof NotFoundError) {
      return c.json(err('NOT_FOUND', error.message), 404);
    }
    if (error instanceof ConflictError) {
      return c.json(err('CONFLICT', error.message), 409);
    }
    // Re-throw unexpected errors for global error handler
    throw error;
  }
});

/**
 * GET /api/v1/products/:id
 * Get a product by ID.
 */
products.get('/:id', async (c) => {
  const productId = c.req.param('id');
  const productService = getProductService(c);

  const product = await productService.getProduct(productId);

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
  const productId = c.req.param('id');
  const input = c.req.valid('json');
  const productService = getProductService(c);

  const product = await productService.updateProduct(productId, input);

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
  const productId = c.req.param('id');
  const productService = getProductService(c);

  const product = await productService.archiveProduct(productId);

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
      if (error instanceof NotFoundError) {
        return c.json(err('NOT_FOUND', error.message), 404);
      }
      if (error instanceof ConflictError) {
        return c.json(err('CONFLICT', error.message), 409);
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
