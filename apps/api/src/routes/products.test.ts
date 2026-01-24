import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { productsRouter, clearProductsStore, createProductsRouter } from './products.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { WorkspaceAuthority } from '@eurocomply/database';

interface ProductResponse {
  data: {
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
  };
}

interface ProductListResponse {
  data: ProductResponse['data'][];
  meta: { total: number };
}

function createTestToken(schemaName: string, userId: string): string {
  const payload = btoa(JSON.stringify({ schema_name: schemaName, sub: userId }));
  return `header.${payload}.signature`;
}

describe('products routes', () => {
  const app = new Hono();
  app.use('*', tenantMiddleware);
  app.route('/products', productsRouter);

  beforeEach(() => {
    clearProductsStore();
  });

  describe('GET /products', () => {
    it('requires authentication', async () => {
      const res = await app.request('/products');
      expect(res.status).toBe(401);
    });

    it('returns empty array for tenant', async () => {
      const res = await app.request('/products', {
        headers: { Authorization: `Bearer ${createTestToken('tenant_acme', 'user1')}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as ProductListResponse;
      expect(data.data).toEqual([]);
    });
  });

  describe('POST /products', () => {
    it('creates product in tenant scope', async () => {
      const res = await app.request('/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${createTestToken('tenant_acme', 'user1')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Widget A',
          categoryId: 'cat123',
        }),
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as ProductResponse;
      expect(data.data.name).toBe('Widget A');
      expect(data.data.tenantSchema).toBe('tenant_acme');
    });

    it('isolates products by tenant', async () => {
      // Create product in tenant_acme
      await app.request('/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${createTestToken('tenant_acme', 'user1')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Acme Widget', categoryId: 'cat1' }),
      });

      // Create product in tenant_other
      await app.request('/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${createTestToken('tenant_other', 'user2')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Other Widget', categoryId: 'cat2' }),
      });

      // List tenant_acme products
      const acmeRes = await app.request('/products', {
        headers: { Authorization: `Bearer ${createTestToken('tenant_acme', 'user1')}` },
      });
      const acmeData = (await acmeRes.json()) as ProductListResponse;
      expect(acmeData.data.length).toBe(1);
      expect(acmeData.data[0]!.name).toBe('Acme Widget');

      // List tenant_other products
      const otherRes = await app.request('/products', {
        headers: { Authorization: `Bearer ${createTestToken('tenant_other', 'user2')}` },
      });
      const otherData = (await otherRes.json()) as ProductListResponse;
      expect(otherData.data.length).toBe(1);
      expect(otherData.data[0]!.name).toBe('Other Widget');
    });
  });
});

// ============================================================================
// Authorization Tests (using createProductsRouter with ORM)
// ============================================================================

describe('Products Authorization', () => {
  // Mock ORM for authorization tests
  const mockOrm = {
    em: {
      fork: () => ({
        find: vi.fn().mockResolvedValue([]),
        findOne: vi.fn().mockResolvedValue({ id: 'cat_123', name: 'Test Category' }),
        create: vi.fn().mockImplementation((_, data) => ({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'cat_123' },
        })),
        persistAndFlush: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };

  type Env = {
    Variables: {
      tenantSchema?: string;
      userId?: string;
      membership?: any;
    };
  };

  describe('GET /products', () => {
    it('allows Design VIEWER', async () => {
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', {
          designAuthority: WorkspaceAuthority.VIEWER,
        } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products');
      expect(res.status).toBe(200);
    });

    it('denies user with NONE authority', async () => {
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', {
          designAuthority: WorkspaceAuthority.NONE,
        } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products');
      expect(res.status).toBe(403);
    });
  });

  describe('POST /products', () => {
    it('denies Design VIEWER', async () => {
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', {
          designAuthority: WorkspaceAuthority.VIEWER,
        } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Product',
          categoryId: 'cat_123',
        }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /products/:id', () => {
    it('allows Design VIEWER', async () => {
      const mockProduct = {
        id: 'prod_123',
        name: 'Test Product',
        status: 'DRAFT',
        category: { id: 'cat_123' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockOrmWithProduct = {
        em: {
          fork: () => ({
            findOne: vi.fn().mockResolvedValue(mockProduct),
          }),
        },
      };

      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', {
          designAuthority: WorkspaceAuthority.VIEWER,
        } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrmWithProduct as any }));

      const res = await app.request('/products/prod_123');
      expect(res.status).toBe(200);
    });

    it('denies user with NONE authority', async () => {
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', {
          designAuthority: WorkspaceAuthority.NONE,
        } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products/prod_123');
      expect(res.status).toBe(403);
    });
  });
});
