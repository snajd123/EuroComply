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
 *
 * MULTI-TENANT SAFETY: All queries are wrapped in transactions with SET search_path
 * to prevent cross-tenant data leakage when MikroORM generates JOINs (e.g., populate).
 */
export function createProductsRouter(options: ProductsRouterOptions) {
  const { orm } = options;
  const router = new Hono<Env>();

  // List products for tenant
  router.get('/', authorize('design', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });

    // Wrap in transaction with search_path to future-proof against JOINs
    const products = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);
      return txEm.find(Product, {});
    });

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

      // Wrap in transaction with search_path for JOIN safety
      const result = await em.transactional(async (txEm) => {
        await txEm.execute(`SET search_path TO "${schema}", public`);

        // Verify category exists
        const category = await txEm.findOne(Category, { id: body.categoryId });
        if (!category) {
          return { error: 'Category not found' as const };
        }

        const now = new Date();
        const product = txEm.create(Product, {
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

        txEm.persist(product);
        return { product };
      });

      if ('error' in result) {
        return c.json({ error: 'Bad Request', message: result.error }, 400);
      }

      return c.json({ data: serializeProduct(result.product) }, 201);
    }
  );

  // Get product by ID
  router.get('/:id', authorize('design', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const id = c.req.param('id');

    // Wrap in transaction with search_path for JOIN safety
    const product = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);
      return txEm.findOne(Product, { id });
    });

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

