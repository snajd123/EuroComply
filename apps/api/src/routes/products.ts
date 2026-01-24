import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createId } from '@eurocomply/core';
import { Product, ProductStatus, Category } from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';

// ============================================================================
// Zod Schemas
// ============================================================================

const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  sku: z.string().max(100).optional(),
  gtin: z.string().max(14).optional(),
  categoryId: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Products Router with MikroORM
// ============================================================================

export interface ProductsRouterOptions {
  orm: MikroORM;
}

/**
 * Creates the products router with database backing and tenant isolation.
 */
export function createProductsRouter(options: ProductsRouterOptions) {
  const { orm } = options;
  const router = new Hono<Env>();

  // List products for tenant
  router.get('/', authorize('design', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const products = await em.find(Product, {});

    return c.json({
      data: products.map(serializeProduct),
      meta: { total: products.length },
    });
  });

  // Create product
  router.post(
    '/',
    authorize('design', 'edit'),
    zValidator('json', createProductSchema),
    async (c) => {
      const schema = c.get('tenantSchema')!;
      const em = orm.em.fork({ schema });
      const body = c.req.valid('json');

      // Verify category exists
      const category = await em.findOne(Category, { id: body.categoryId });
      if (!category) {
        return c.json({ error: 'Bad Request', message: 'Category not found' }, 400);
      }

      const now = new Date();
      const product = em.create(Product, {
        id: createId(),
        name: body.name,
        description: body.description,
        sku: body.sku,
        gtin: body.gtin,
        category,
        status: ProductStatus.DRAFT,
        metadata: body.metadata,
        createdAt: now,
        updatedAt: now,
      });

      await em.persistAndFlush(product);

      return c.json({ data: serializeProduct(product) }, 201);
    }
  );

  // Get product by ID
  router.get('/:id', authorize('design', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const id = c.req.param('id');
    const product = await em.findOne(Product, { id });

    if (!product) {
      return c.json({ error: 'Not Found', message: 'Product not found' }, 404);
    }

    return c.json({ data: serializeProduct(product) });
  });

  return router;
}

/**
 * Serializes a Product entity to a plain object for API response.
 */
function serializeProduct(product: Product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    sku: product.sku,
    gtin: product.gtin,
    categoryId: product.category?.id,
    status: product.status,
    metadata: product.metadata,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

// ============================================================================
// In-memory fallback for tests without database
// ============================================================================

interface InMemoryProduct {
  id: string;
  tenantSchema: string;
  name: string;
  description?: string;
  sku?: string;
  gtin?: string;
  categoryId: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

const productsByTenant: Map<string, Map<string, InMemoryProduct>> = new Map();

export function clearProductsStore(): void {
  productsByTenant.clear();
}

function getTenantProducts(schema: string): Map<string, InMemoryProduct> {
  let products = productsByTenant.get(schema);
  if (!products) {
    products = new Map();
    productsByTenant.set(schema, products);
  }
  return products;
}

/**
 * @deprecated Use createProductsRouter with ORM injection instead.
 * This in-memory fallback is kept for backwards compatibility with tests.
 * NOTE: Does not include authorization checks - for testing only.
 */
export const productsRouter = new Hono<Env>();

productsRouter.get('/', (c) => {
  const schema = c.get('tenantSchema')!;
  const products = getTenantProducts(schema);
  const data = Array.from(products.values());

  return c.json({
    data,
    meta: { total: data.length },
  });
});

productsRouter.post(
  '/',
  zValidator('json', createProductSchema),
  (c) => {
    const schema = c.get('tenantSchema')!;
    const userId = c.get('userId')!;
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const product: InMemoryProduct = {
      id: createId(),
      tenantSchema: schema,
      name: body.name,
      description: body.description,
      sku: body.sku,
      gtin: body.gtin,
      categoryId: body.categoryId,
      status: 'DRAFT',
      metadata: body.metadata,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    };

    const products = getTenantProducts(schema);
    products.set(product.id, product);

    return c.json({ data: product }, 201);
  }
);

productsRouter.get('/:id', (c) => {
  const schema = c.get('tenantSchema')!;
  const id = c.req.param('id');
  const products = getTenantProducts(schema);
  const product = products.get(id);

  if (!product) {
    return c.json({ error: 'Not Found', message: 'Product not found' }, 404);
  }

  return c.json({ data: product });
});
