import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createId } from '@eurocomply/core';
import type { Env } from '../app.js';

// In-memory store keyed by tenant schema (will be replaced with MikroORM)
const productsByTenant: Map<string, Map<string, Product>> = new Map();

interface Product {
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

const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  sku: z.string().max(100).optional(),
  gtin: z.string().max(14).optional(),
  categoryId: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export function clearProductsStore(): void {
  productsByTenant.clear();
}

function getTenantProducts(schema: string): Map<string, Product> {
  let products = productsByTenant.get(schema);
  if (!products) {
    products = new Map();
    productsByTenant.set(schema, products);
  }
  return products;
}

export const productsRouter = new Hono<Env>();

// List products for tenant
productsRouter.get('/', (c) => {
  const schema = c.get('tenantSchema')!;
  const products = getTenantProducts(schema);
  const data = Array.from(products.values());

  return c.json({
    data,
    meta: { total: data.length },
  });
});

// Create product
productsRouter.post(
  '/',
  zValidator('json', createProductSchema),
  (c) => {
    const schema = c.get('tenantSchema')!;
    const userId = c.get('userId')!;
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const product: Product = {
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

// Get product by ID
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
