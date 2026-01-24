import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createProductsRouter } from './products.js';
import { WorkspaceAuthority } from '@eurocomply/database';

// ============================================================================
// Types
// ============================================================================

interface ProductResponse {
  data: {
    id: string;
    name: string;
    description?: string;
    sku?: string;
    gtin?: string;
    categoryId?: string;
    status: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
}

interface ProductListResponse {
  data: ProductResponse['data'][];
  meta: { total: number };
}

type Env = {
  Variables: {
    tenantSchema?: string;
    userId?: string;
    membership?: { designAuthority: string };
  };
};

// ============================================================================
// Mock ORM Factory
// ============================================================================

function createMockOrm(overrides: {
  products?: Array<{ id: string; name: string; status: string; category?: { id: string }; createdAt: Date; updatedAt: Date }>;
  category?: { id: string; name: string } | null;
} = {}) {
  const mockProducts = overrides.products ?? [];
  // Use 'category' in overrides to check if explicitly set (including to null)
  const mockCategory = 'category' in overrides ? overrides.category : { id: 'cat_123', name: 'Test Category' };

  return {
    em: {
      fork: () => ({
        transactional: vi.fn().mockImplementation(async (callback) => {
          const txEm = {
            execute: vi.fn().mockResolvedValue(undefined),
            find: vi.fn().mockResolvedValue(mockProducts),
            findOne: vi.fn().mockImplementation((entity, filter) => {
              if (entity.name === 'Category' || entity === 'Category') {
                return Promise.resolve(mockCategory);
              }
              if (entity.name === 'Product' || entity === 'Product') {
                const product = mockProducts.find((p) => p.id === filter.id);
                return Promise.resolve(product ?? null);
              }
              return Promise.resolve(null);
            }),
            create: vi.fn().mockImplementation((_, data) => ({
              ...data,
              createdAt: data.createdAt || new Date(),
              updatedAt: data.updatedAt || new Date(),
              category: mockCategory,
            })),
            persist: vi.fn(),
          };
          return callback(txEm);
        }),
      }),
    },
  };
}

// ============================================================================
// Authorization Tests
// ============================================================================

describe('Products Authorization', () => {
  describe('GET /products', () => {
    it('allows Design VIEWER', async () => {
      const mockOrm = createMockOrm();
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.VIEWER } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products');
      expect(res.status).toBe(200);
    });

    it('allows Design EDITOR', async () => {
      const mockOrm = createMockOrm();
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.EDITOR } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products');
      expect(res.status).toBe(200);
    });

    it('allows Design MANAGER', async () => {
      const mockOrm = createMockOrm();
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.MANAGER } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products');
      expect(res.status).toBe(200);
    });

    it('denies user with NONE authority', async () => {
      const mockOrm = createMockOrm();
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.NONE } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products');
      expect(res.status).toBe(403);
    });

    it('returns products list', async () => {
      const mockProducts = [
        {
          id: 'prod_1',
          name: 'Product 1',
          status: 'DRAFT',
          category: { id: 'cat_123' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const mockOrm = createMockOrm({ products: mockProducts });
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.VIEWER } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products');
      expect(res.status).toBe(200);
      const data = (await res.json()) as ProductListResponse;
      expect(data.data.length).toBe(1);
      expect(data.data[0]!.name).toBe('Product 1');
    });
  });

  describe('POST /products', () => {
    it('allows Design EDITOR', async () => {
      const mockOrm = createMockOrm();
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.EDITOR } as any);
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
      expect(res.status).toBe(201);
    });

    it('allows Design MANAGER', async () => {
      const mockOrm = createMockOrm();
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.MANAGER } as any);
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
      expect(res.status).toBe(201);
    });

    it('denies Design VIEWER', async () => {
      const mockOrm = createMockOrm();
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.VIEWER } as any);
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

    it('denies Design NONE', async () => {
      const mockOrm = createMockOrm();
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.NONE } as any);
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

    it('returns 400 if category not found', async () => {
      const mockOrm = createMockOrm({ category: null });
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.EDITOR } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Product',
          categoryId: 'nonexistent_cat',
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toBe('Category not found');
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
      const mockOrm = createMockOrm({ products: [mockProduct] });

      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.VIEWER } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products/prod_123');
      expect(res.status).toBe(200);
    });

    it('denies user with NONE authority', async () => {
      const mockOrm = createMockOrm();
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.NONE } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products/prod_123');
      expect(res.status).toBe(403);
    });

    it('returns 404 if product not found', async () => {
      const mockOrm = createMockOrm({ products: [] });
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', { designAuthority: WorkspaceAuthority.VIEWER } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm as any }));

      const res = await app.request('/products/nonexistent');
      expect(res.status).toBe(404);
    });
  });
});

// ============================================================================
// Search Path Safety Tests
// ============================================================================

describe('Products Multi-tenant Safety', () => {
  it('sets search_path before queries', async () => {
    const executeMock = vi.fn().mockResolvedValue(undefined);
    const mockOrm = {
      em: {
        fork: () => ({
          transactional: vi.fn().mockImplementation(async (callback) => {
            const txEm = {
              execute: executeMock,
              find: vi.fn().mockResolvedValue([]),
            };
            return callback(txEm);
          }),
        }),
      },
    };

    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_acme');
      c.set('membership', { designAuthority: WorkspaceAuthority.VIEWER } as any);
      return next();
    });
    app.route('/products', createProductsRouter({ orm: mockOrm as any }));

    await app.request('/products');

    // Verify SET search_path was called with correct tenant schema
    expect(executeMock).toHaveBeenCalledWith('SET search_path TO "tenant_acme", public');
  });
});
