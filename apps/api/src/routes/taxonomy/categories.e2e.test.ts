// apps/api/src/routes/taxonomy/categories.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MikroORM } from '@eurocomply/database';
import { Hono } from 'hono';
import { createCategoriesRouter, type CategoriesRepository, type CategoryData } from './categories.js';
import { CategoryType, TargetType } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';

interface ApiResponse<T> {
  success: true;
  data: T;
  meta: { requestId: string; timestamp: string; total?: number };
}

interface ErrorResponse {
  success: false;
  error: { code: string; message: string; details?: unknown };
  meta: { requestId: string; timestamp: string };
}

// Check database availability at module level (before test registration)
const dbAvailable = await isDatabaseAvailable();

describe('Categories API E2E', () => {
  let orm: MikroORM;
  let app: Hono;

  // Test category IDs - stored for reference in tests
  const categoryIds: Record<string, string> = {};

  beforeAll(async () => {
    if (!dbAvailable) {
      return;
    }

    orm = await setupTestDb();

    // Create category table in public schema for system categories
    const connection = orm.em.getConnection();
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS public.category (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        path ltree NOT NULL,
        type VARCHAR(10) DEFAULT 'BRANCH',
        target_type VARCHAR(20) DEFAULT 'PRODUCT',
        depth INT DEFAULT 0,
        parent_id TEXT REFERENCES public.category(id),
        default_profile_id TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await connection.execute(`
      CREATE INDEX IF NOT EXISTS category_path_gist_idx ON public.category USING gist(path)
    `);

    // Seed test categories
    const now = new Date().toISOString();

    // Root categories (depth 0)
    categoryIds['apparel'] = crypto.randomUUID();
    categoryIds['materials'] = crypto.randomUUID();
    categoryIds['facilities'] = crypto.randomUUID();

    // Branch categories (depth 1)
    categoryIds['apparel.tops'] = crypto.randomUUID();
    categoryIds['apparel.bottoms'] = crypto.randomUUID();

    // Leaf categories (depth 2)
    categoryIds['apparel.tops.tshirts'] = crypto.randomUUID();
    categoryIds['apparel.tops.shirts'] = crypto.randomUUID();

    // Inactive category for filtering tests
    categoryIds['apparel.inactive'] = crypto.randomUUID();

    // Insert test categories
    await connection.execute(`
      INSERT INTO public.category (id, name, description, path, type, target_type, depth, parent_id, is_active, created_at, updated_at)
      VALUES
        ('${categoryIds['apparel']}', 'Apparel', 'Clothing and accessories', 'apparel', 'ROOT', 'PRODUCT', 0, NULL, true, '${now}', '${now}'),
        ('${categoryIds['materials']}', 'Materials', 'Raw materials and components', 'materials', 'ROOT', 'MATERIAL', 0, NULL, true, '${now}', '${now}'),
        ('${categoryIds['facilities']}', 'Facilities', 'Manufacturing facilities', 'facilities', 'ROOT', 'FACILITY', 0, NULL, true, '${now}', '${now}'),
        ('${categoryIds['apparel.tops']}', 'Tops', 'Upper body clothing', 'apparel.tops', 'BRANCH', 'PRODUCT', 1, '${categoryIds['apparel']}', true, '${now}', '${now}'),
        ('${categoryIds['apparel.bottoms']}', 'Bottoms', 'Lower body clothing', 'apparel.bottoms', 'BRANCH', 'PRODUCT', 1, '${categoryIds['apparel']}', true, '${now}', '${now}'),
        ('${categoryIds['apparel.tops.tshirts']}', 'T-Shirts', 'Casual t-shirts', 'apparel.tops.tshirts', 'LEAF', 'PRODUCT', 2, '${categoryIds['apparel.tops']}', true, '${now}', '${now}'),
        ('${categoryIds['apparel.tops.shirts']}', 'Shirts', 'Formal and casual shirts', 'apparel.tops.shirts', 'LEAF', 'PRODUCT', 2, '${categoryIds['apparel.tops']}', true, '${now}', '${now}'),
        ('${categoryIds['apparel.inactive']}', 'Inactive Category', 'Should not appear when filtering active', 'apparel.inactive', 'BRANCH', 'PRODUCT', 1, '${categoryIds['apparel']}', false, '${now}', '${now}')
    `);

    // Create repository - uses raw SQL to query public.category
    // MikroORM's em.execute() uses ? placeholders (not $1)
    const repo: CategoriesRepository = {
      findAll: async (filter): Promise<CategoryData[]> => {
        const em = orm.em.fork();
        let sql = 'SELECT * FROM public.category WHERE 1=1';
        const params: unknown[] = [];

        if (filter?.targetType) {
          sql += ' AND target_type = ?';
          params.push(filter.targetType);
        }
        if (filter?.depth !== undefined) {
          sql += ' AND depth = ?';
          params.push(filter.depth);
        }
        if (filter?.active !== undefined) {
          sql += ' AND is_active = ?';
          params.push(filter.active);
        }

        sql += ' ORDER BY path';

        const rows = await em.execute<CategoryRow[]>(sql, params);
        return rows.map(mapRowToCategory);
      },

      findById: async (id): Promise<CategoryData | null> => {
        const em = orm.em.fork();
        const rows = await em.execute<CategoryRow[]>(
          'SELECT * FROM public.category WHERE id = ?',
          [id]
        );
        const row = rows[0];
        return row ? mapRowToCategory(row) : null;
      },

      findByPath: async (path): Promise<CategoryData | null> => {
        const em = orm.em.fork();
        const rows = await em.execute<CategoryRow[]>(
          'SELECT * FROM public.category WHERE path::text = ?',
          [path]
        );
        const row = rows[0];
        return row ? mapRowToCategory(row) : null;
      },

      findRoots: async (targetType): Promise<CategoryData[]> => {
        const em = orm.em.fork();
        let sql = 'SELECT * FROM public.category WHERE depth = 0 AND is_active = true';
        const params: unknown[] = [];

        if (targetType) {
          sql += ' AND target_type = ?';
          params.push(targetType);
        }

        sql += ' ORDER BY name';

        const rows = await em.execute<CategoryRow[]>(sql, params);
        return rows.map(mapRowToCategory);
      },

      findChildren: async (parentId): Promise<CategoryData[]> => {
        const em = orm.em.fork();
        const rows = await em.execute<CategoryRow[]>(
          'SELECT * FROM public.category WHERE parent_id = ? AND is_active = true ORDER BY name',
          [parentId]
        );
        return rows.map(mapRowToCategory);
      },

      findAncestors: async (id): Promise<CategoryData[]> => {
        const em = orm.em.fork();

        // First get the category to get its path
        const catRows = await em.execute<CategoryRow[]>(
          'SELECT * FROM public.category WHERE id = ?',
          [id]
        );
        const category = catRows[0];
        if (!category) return [];
        if (category.depth === 0) return [];

        // Use LTREE @> operator to find ancestors (excluding self)
        const rows = await em.execute<CategoryRow[]>(
          `SELECT * FROM public.category
           WHERE path @> ?::ltree AND path != ?::ltree
           ORDER BY depth ASC`,
          [category.path, category.path]
        );
        return rows.map(mapRowToCategory);
      },
    };

    app = new Hono();
    app.route('/categories', createCategoriesRouter(repo));
  });

  afterAll(async () => {
    if (orm) {
      try {
        const connection = orm.em.getConnection();
        await connection.execute('DROP TABLE IF EXISTS public.category CASCADE');
      } catch {
        // Ignore cleanup errors
      }
      await teardownTestDb();
    }
  });

  // ============================================================================
  // GET / - List categories with filters
  // ============================================================================

  describe('GET /categories', () => {
    it.skipIf(!dbAvailable)('should list all categories', async () => {
      const res = await app.request('/categories');
      expect(res.status).toBe(200);

      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(8); // All test categories
      expect(body.meta?.total).toBe(8);
    });

    it.skipIf(!dbAvailable)('should filter by targetType', async () => {
      const res = await app.request('/categories?targetType=PRODUCT');
      expect(res.status).toBe(200);

      const body = await res.json() as ApiResponse<CategoryData[]>;
      // 6 PRODUCT categories (apparel, apparel.tops, apparel.bottoms, apparel.tops.tshirts, apparel.tops.shirts, apparel.inactive)
      expect(body.data.length).toBe(6);
      expect(body.data.every(c => c.targetType === 'PRODUCT')).toBe(true);
    });

    it.skipIf(!dbAvailable)('should filter by depth', async () => {
      const res = await app.request('/categories?depth=0');
      expect(res.status).toBe(200);

      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(3); // 3 root categories
      expect(body.data.every(c => c.depth === 0)).toBe(true);
    });

    it.skipIf(!dbAvailable)('should filter by active status', async () => {
      const res = await app.request('/categories?active=true');
      expect(res.status).toBe(200);

      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(7); // All except inactive
      expect(body.data.every(c => c.isActive === true)).toBe(true);
    });

    it.skipIf(!dbAvailable)('should combine multiple filters', async () => {
      const res = await app.request('/categories?targetType=PRODUCT&depth=1&active=true');
      expect(res.status).toBe(200);

      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(2); // apparel.tops and apparel.bottoms (not inactive)
      expect(body.data.every(c => c.targetType === 'PRODUCT' && c.depth === 1 && c.isActive)).toBe(true);
    });
  });

  // ============================================================================
  // GET /roots - Root categories
  // ============================================================================

  describe('GET /categories/roots', () => {
    it.skipIf(!dbAvailable)('should return all root categories', async () => {
      const res = await app.request('/categories/roots');
      expect(res.status).toBe(200);

      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(3);
      expect(body.data.every(c => c.depth === 0)).toBe(true);
    });

    it.skipIf(!dbAvailable)('should filter root categories by targetType', async () => {
      const res = await app.request('/categories/roots?targetType=MATERIAL');
      expect(res.status).toBe(200);

      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(1);
      expect(body.data[0]!.name).toBe('Materials');
      expect(body.data[0]!.targetType).toBe('MATERIAL');
    });
  });

  // ============================================================================
  // GET /:id - Single category
  // ============================================================================

  describe('GET /categories/:id', () => {
    it.skipIf(!dbAvailable)('should return a category by ID', async () => {
      const res = await app.request(`/categories/${categoryIds['apparel']}`);
      expect(res.status).toBe(200);

      const body = await res.json() as ApiResponse<CategoryData>;
      expect(body.data.id).toBe(categoryIds['apparel']);
      expect(body.data.name).toBe('Apparel');
      expect(body.data.path).toBe('apparel');
      expect(body.data.type).toBe('ROOT');
    });

    it.skipIf(!dbAvailable)('should return 404 for unknown category', async () => {
      const res = await app.request('/categories/non-existent-id');
      expect(res.status).toBe(404);

      const body = await res.json() as ErrorResponse;
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Category not found');
    });
  });

  // ============================================================================
  // GET /:id/children - Direct children
  // ============================================================================

  describe('GET /categories/:id/children', () => {
    it.skipIf(!dbAvailable)('should return direct children of a category', async () => {
      const res = await app.request(`/categories/${categoryIds['apparel']}/children`);
      expect(res.status).toBe(200);

      const body = await res.json() as ApiResponse<CategoryData[]>;
      // Should return tops and bottoms, but NOT inactive
      expect(body.data.length).toBe(2);
      expect(body.data.map(c => c.name).sort()).toEqual(['Bottoms', 'Tops']);
    });

    it.skipIf(!dbAvailable)('should return empty array for leaf category', async () => {
      const res = await app.request(`/categories/${categoryIds['apparel.tops.tshirts']}/children`);
      expect(res.status).toBe(200);

      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(0);
    });

    it.skipIf(!dbAvailable)('should return 404 for unknown parent', async () => {
      const res = await app.request('/categories/non-existent-id/children');
      expect(res.status).toBe(404);

      const body = await res.json() as ErrorResponse;
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Category not found');
    });
  });

  // ============================================================================
  // GET /:id/ancestors - Breadcrumb trail
  // ============================================================================

  describe('GET /categories/:id/ancestors', () => {
    it.skipIf(!dbAvailable)('should return ancestors (breadcrumb trail)', async () => {
      const res = await app.request(`/categories/${categoryIds['apparel.tops.tshirts']}/ancestors`);
      expect(res.status).toBe(200);

      const body = await res.json() as ApiResponse<CategoryData[]>;
      // Should return apparel (root) and apparel.tops (branch), ordered by depth
      expect(body.data.length).toBe(2);
      expect(body.data[0]!.path).toBe('apparel');
      expect(body.data[1]!.path).toBe('apparel.tops');
    });

    it.skipIf(!dbAvailable)('should return empty array for root category', async () => {
      const res = await app.request(`/categories/${categoryIds['apparel']}/ancestors`);
      expect(res.status).toBe(200);

      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(0);
    });

    it.skipIf(!dbAvailable)('should return 404 for unknown category', async () => {
      const res = await app.request('/categories/non-existent-id/ancestors');
      expect(res.status).toBe(404);

      const body = await res.json() as ErrorResponse;
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Category not found');
    });
  });
});

// ============================================================================
// Helper types and functions
// ============================================================================

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  path: string;
  type: string;
  target_type: string;
  depth: number;
  parent_id: string | null;
  is_active: boolean;
}

function mapRowToCategory(row: CategoryRow): CategoryData {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    path: row.path,
    type: row.type as CategoryType,
    targetType: row.target_type,
    depth: row.depth,
    parentId: row.parent_id ?? undefined,
    isActive: row.is_active,
  };
}
