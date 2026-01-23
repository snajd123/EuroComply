# Category Service & API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement CategoryService with LTREE-optimized queries and full CRUD API for categories with adoption (LIVE_LINK/FORKED) support.

**Architecture:** CategoryService uses PostgreSQL LTREE `@>` operator for single-query ancestor fetches. Categories API supports dual-scope (system + tenant) with adoption modes. Routes follow the established Hono pattern from units.ts.

**Tech Stack:** MikroORM, PostgreSQL LTREE, Hono, Zod validation, Vitest

**Prerequisites:**
- Plan 1 (Units Foundation) - DONE
- Plan 2 (Category & Attribute Schema) - DONE

---

## Task 3.1: Create CategoryService with LTREE Ancestor Query

**Files:**
- Create: `packages/database/src/services/category.service.ts`
- Create: `packages/database/src/services/category.service.test.ts`
- Modify: `packages/database/src/services/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/category.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CategoryService } from './category.service.js';
import { Category, CategoryType } from '../entities/Category.js';
import { TargetType } from '../entities/enums/index.js';

describe('CategoryService', () => {
  let service: CategoryService;
  let mockCategories: Category[];

  beforeEach(() => {
    // Create mock category hierarchy: apparel > tops > tshirts
    const apparel = new Category();
    apparel.id = 'cat_apparel';
    apparel.name = 'Apparel';
    apparel.path = 'apparel';
    apparel.type = CategoryType.ROOT;
    apparel.targetType = TargetType.PRODUCT;
    apparel.depth = 0;

    const tops = new Category();
    tops.id = 'cat_tops';
    tops.name = 'Tops';
    tops.path = 'apparel.tops';
    tops.type = CategoryType.BRANCH;
    tops.targetType = TargetType.PRODUCT;
    tops.depth = 1;
    tops.parent = apparel;

    const tshirts = new Category();
    tshirts.id = 'cat_tshirts';
    tshirts.name = 'T-Shirts';
    tshirts.path = 'apparel.tops.tshirts';
    tshirts.type = CategoryType.LEAF;
    tshirts.targetType = TargetType.PRODUCT;
    tshirts.depth = 2;
    tshirts.parent = tops;

    mockCategories = [apparel, tops, tshirts];

    // Create mock executor
    const mockExecutor = {
      findAncestors: async (path: string): Promise<Category[]> => {
        // Simulate LTREE @> query: find categories whose path is prefix of given path
        return mockCategories.filter(c => path.startsWith(c.path));
      },
      findDescendants: async (path: string): Promise<Category[]> => {
        // Simulate LTREE <@ query: find categories whose path starts with given path
        return mockCategories.filter(c => c.path.startsWith(path));
      },
      findById: async (id: string): Promise<Category | null> => {
        return mockCategories.find(c => c.id === id) ?? null;
      },
    };

    service = new CategoryService(mockExecutor);
  });

  describe('getAncestors', () => {
    it('should return all ancestors for a leaf category', async () => {
      const ancestors = await service.getAncestors('cat_tshirts');

      expect(ancestors).toHaveLength(3);
      expect(ancestors[0].path).toBe('apparel');
      expect(ancestors[1].path).toBe('apparel.tops');
      expect(ancestors[2].path).toBe('apparel.tops.tshirts');
    });

    it('should return only self for root category', async () => {
      const ancestors = await service.getAncestors('cat_apparel');

      expect(ancestors).toHaveLength(1);
      expect(ancestors[0].path).toBe('apparel');
    });

    it('should return ancestors ordered by depth ascending', async () => {
      const ancestors = await service.getAncestors('cat_tshirts');

      expect(ancestors[0].depth).toBe(0);
      expect(ancestors[1].depth).toBe(1);
      expect(ancestors[2].depth).toBe(2);
    });
  });

  describe('getDescendants', () => {
    it('should return all descendants for a root category', async () => {
      const descendants = await service.getDescendants('cat_apparel');

      expect(descendants).toHaveLength(3);
    });

    it('should return only self for leaf category', async () => {
      const descendants = await service.getDescendants('cat_tshirts');

      expect(descendants).toHaveLength(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/category.service.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the service**

```typescript
// packages/database/src/services/category.service.ts
import { Category } from '../entities/Category.js';

/**
 * Interface for category queries - allows mock injection for testing.
 * Production implementation uses raw SQL with LTREE operators.
 */
export interface CategoryQueryExecutor {
  findAncestors(path: string): Promise<Category[]>;
  findDescendants(path: string): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
}

/**
 * Service for category operations using LTREE-optimized queries.
 *
 * CRITICAL: Uses PostgreSQL LTREE operators (@>, <@) for single-query
 * ancestor/descendant fetches instead of recursive individual lookups.
 */
export class CategoryService {
  constructor(private readonly executor: CategoryQueryExecutor) {}

  /**
   * Get all ancestors of a category (inclusive), ordered by depth ascending.
   * Uses LTREE @> operator for single-query fetch.
   *
   * Example: 'apparel.tops.tshirts' returns [apparel, apparel.tops, apparel.tops.tshirts]
   */
  async getAncestors(categoryId: string): Promise<Category[]> {
    const category = await this.executor.findById(categoryId);
    if (!category) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    const ancestors = await this.executor.findAncestors(category.path);

    // Sort by depth ascending (root first)
    return ancestors.sort((a, b) => a.depth - b.depth);
  }

  /**
   * Get all descendants of a category (inclusive), ordered by depth ascending.
   * Uses LTREE <@ operator for single-query fetch.
   */
  async getDescendants(categoryId: string): Promise<Category[]> {
    const category = await this.executor.findById(categoryId);
    if (!category) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    const descendants = await this.executor.findDescendants(category.path);

    // Sort by depth ascending
    return descendants.sort((a, b) => a.depth - b.depth);
  }

  /**
   * Get category by ID.
   */
  async getById(categoryId: string): Promise<Category | null> {
    return this.executor.findById(categoryId);
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/services/category.service.test.ts
```

Expected: PASS

**Step 5: Export from services index**

Add to `packages/database/src/services/index.ts`:

```typescript
export { CategoryService, type CategoryQueryExecutor } from './category.service.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/services/category.service.ts
git add packages/database/src/services/category.service.test.ts
git add packages/database/src/services/index.ts
git commit -m "feat(database): add CategoryService with LTREE-optimized queries

- getAncestors() uses LTREE @> for single-query ancestor fetch
- getDescendants() uses LTREE <@ for single-query descendant fetch
- Injectable executor for testability"
```

---

## Task 3.2: Create MikroORM CategoryQueryExecutor Implementation

**Files:**
- Create: `packages/database/src/services/category-query-executor.ts`
- Create: `packages/database/src/services/category-query-executor.test.ts`
- Modify: `packages/database/src/services/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/category-query-executor.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroOrmCategoryQueryExecutor } from './category-query-executor.js';
import { Category, CategoryType } from '../entities/Category.js';
import { TargetType } from '../entities/enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils/index.js';
import type { MikroORM } from '@mikro-orm/postgresql';

describe('MikroOrmCategoryQueryExecutor', () => {
  let orm: MikroORM;
  let executor: MikroOrmCategoryQueryExecutor;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    executor = new MikroOrmCategoryQueryExecutor(orm.em);

    // Seed test categories
    const em = orm.em.fork();

    const apparel = em.create(Category, {
      name: 'Apparel',
      path: 'apparel',
      type: CategoryType.ROOT,
      targetType: TargetType.PRODUCT,
      depth: 0,
      isActive: true,
    });

    const tops = em.create(Category, {
      name: 'Tops',
      path: 'apparel.tops',
      type: CategoryType.BRANCH,
      targetType: TargetType.PRODUCT,
      depth: 1,
      parent: apparel,
      isActive: true,
    });

    em.create(Category, {
      name: 'T-Shirts',
      path: 'apparel.tops.tshirts',
      type: CategoryType.LEAF,
      targetType: TargetType.PRODUCT,
      depth: 2,
      parent: tops,
      isActive: true,
    });

    await em.flush();
  });

  afterAll(async () => {
    if (orm) {
      await orm.em.fork().nativeDelete(Category, {});
      await teardownTestDb();
    }
  });

  it('should find ancestors using LTREE @> query', async () => {
    if (!orm) return;

    const ancestors = await executor.findAncestors('apparel.tops.tshirts');

    expect(ancestors.length).toBe(3);
    expect(ancestors.map(a => a.path).sort()).toEqual([
      'apparel',
      'apparel.tops',
      'apparel.tops.tshirts',
    ]);
  });

  it('should find descendants using LTREE <@ query', async () => {
    if (!orm) return;

    const descendants = await executor.findDescendants('apparel');

    expect(descendants.length).toBe(3);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/category-query-executor.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the MikroORM executor**

```typescript
// packages/database/src/services/category-query-executor.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { Category } from '../entities/Category.js';
import type { CategoryQueryExecutor } from './category.service.js';

/**
 * MikroORM implementation of CategoryQueryExecutor using raw LTREE queries.
 */
export class MikroOrmCategoryQueryExecutor implements CategoryQueryExecutor {
  constructor(private readonly em: EntityManager) {}

  /**
   * Find all ancestors of a path using LTREE @> operator.
   * This fetches ALL ancestors in ONE query.
   */
  async findAncestors(path: string): Promise<Category[]> {
    const em = this.em.fork();

    // LTREE @> means "is ancestor of or equal to"
    // We want categories whose path is a prefix of the given path
    const result = await em.execute<Category[]>(`
      SELECT * FROM category
      WHERE path @> $1::ltree
      ORDER BY depth ASC
    `, [path]);

    // Map raw results to entities
    return result.map(row => this.mapToEntity(row));
  }

  /**
   * Find all descendants of a path using LTREE <@ operator.
   */
  async findDescendants(path: string): Promise<Category[]> {
    const em = this.em.fork();

    // LTREE <@ means "is descendant of or equal to"
    const result = await em.execute<Category[]>(`
      SELECT * FROM category
      WHERE path <@ $1::ltree
      ORDER BY depth ASC
    `, [path]);

    return result.map(row => this.mapToEntity(row));
  }

  /**
   * Find category by ID.
   */
  async findById(id: string): Promise<Category | null> {
    const em = this.em.fork();
    return em.findOne(Category, { id });
  }

  /**
   * Map raw SQL result to Category entity.
   */
  private mapToEntity(row: Record<string, unknown>): Category {
    const category = new Category();
    category.id = row['id'] as string;
    category.name = row['name'] as string;
    category.description = row['description'] as string | undefined;
    category.path = row['path'] as string;
    category.type = row['type'] as Category['type'];
    category.targetType = row['target_type'] as Category['targetType'];
    category.depth = row['depth'] as number;
    category.isActive = row['is_active'] as boolean;
    category.defaultProfileId = row['default_profile_id'] as string | undefined;
    category.createdAt = new Date(row['created_at'] as string);
    category.updatedAt = new Date(row['updated_at'] as string);
    return category;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/services/category-query-executor.test.ts
```

Expected: PASS (if database available) or SKIP

**Step 5: Export from services index**

Add to `packages/database/src/services/index.ts`:

```typescript
export { MikroOrmCategoryQueryExecutor } from './category-query-executor.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/services/category-query-executor.ts
git add packages/database/src/services/category-query-executor.test.ts
git add packages/database/src/services/index.ts
git commit -m "feat(database): add MikroORM CategoryQueryExecutor with LTREE queries

- Uses raw SQL for LTREE @> and <@ operators
- Single-query ancestor/descendant fetches
- E2E test with real database"
```

---

## Task 3.3: Create Categories API Types and Repository Interface

**Files:**
- Create: `apps/api/src/routes/taxonomy/categories.ts` (types only first)

**Step 1: Create the types and interfaces**

```typescript
// apps/api/src/routes/taxonomy/categories.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { CategoryType, TargetType, AdoptionMode, type MikroORM } from '@eurocomply/database';

// ============================================================================
// Types
// ============================================================================

export interface CategoryData {
  id: string;
  name: string;
  description?: string;
  path: string;
  type: CategoryType;
  targetType: TargetType;
  depth: number;
  parentId?: string;
  defaultProfileId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryAdoptionData {
  id: string;
  systemCategoryId: string;
  localCategoryId?: string;
  mode: AdoptionMode;
  adoptedAt: string;
  forkedVersion?: number;
  updateAvailable: boolean;
}

export interface CategoryWithAdoption extends CategoryData {
  scope: 'SYSTEM' | 'TENANT';
  adoption?: CategoryAdoptionData;
}

export interface CategoriesRepository {
  findAll(filter?: {
    scope?: 'SYSTEM' | 'TENANT' | 'ALL';
    targetType?: TargetType;
    parentId?: string;
    isActive?: boolean;
  }): Promise<CategoryWithAdoption[]>;

  findById(id: string): Promise<CategoryWithAdoption | null>;

  findByPath(path: string): Promise<CategoryWithAdoption | null>;

  create(data: {
    name: string;
    description?: string;
    parentId?: string;
    targetType: TargetType;
    type?: CategoryType;
  }): Promise<CategoryData>;

  update(id: string, data: {
    name?: string;
    description?: string;
    isActive?: boolean;
    defaultProfileId?: string;
  }): Promise<CategoryData>;

  delete(id: string): Promise<void>;

  adopt(systemCategoryId: string, mode: AdoptionMode): Promise<CategoryAdoptionData>;

  syncFork(adoptionId: string): Promise<CategoryAdoptionData>;

  getAncestors(categoryId: string): Promise<CategoryData[]>;

  getChildren(categoryId: string): Promise<CategoryData[]>;
}

// ============================================================================
// Schemas
// ============================================================================

export const listCategoriesQuery = z.object({
  scope: z.enum(['SYSTEM', 'TENANT', 'ALL']).optional().default('ALL'),
  targetType: z.nativeEnum(TargetType).optional(),
  parentId: z.string().optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

export const createCategoryBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  parentId: z.string().optional(),
  targetType: z.nativeEnum(TargetType).default(TargetType.PRODUCT),
  type: z.nativeEnum(CategoryType).optional(),
});

export const updateCategoryBody = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
  defaultProfileId: z.string().optional(),
});

export const adoptCategoryBody = z.object({
  mode: z.nativeEnum(AdoptionMode),
});

// Router will be implemented in next task
export function createCategoriesRouter(repo: CategoriesRepository) {
  const router = new Hono();
  // To be implemented
  return router;
}
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/taxonomy/categories.ts
git commit -m "feat(api): add categories API types and repository interface

- CategoryData, CategoryAdoptionData, CategoryWithAdoption types
- CategoriesRepository interface for dependency injection
- Zod schemas for request validation"
```

---

## Task 3.4: Implement Categories List and Get Routes

**Files:**
- Modify: `apps/api/src/routes/taxonomy/categories.ts`
- Create: `apps/api/src/routes/taxonomy/categories.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/api/src/routes/taxonomy/categories.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createCategoriesRouter, type CategoriesRepository, type CategoryWithAdoption } from './categories.js';
import { CategoryType, TargetType, AdoptionMode } from '@eurocomply/database';

// Mock categories
const mockCategories: CategoryWithAdoption[] = [
  {
    id: 'sys_apparel',
    name: 'Apparel',
    path: 'apparel',
    type: CategoryType.ROOT,
    targetType: TargetType.PRODUCT,
    depth: 0,
    isActive: true,
    scope: 'SYSTEM',
    createdAt: '2026-01-23T00:00:00Z',
    updatedAt: '2026-01-23T00:00:00Z',
  },
  {
    id: 'sys_tops',
    name: 'Tops',
    path: 'apparel.tops',
    type: CategoryType.BRANCH,
    targetType: TargetType.PRODUCT,
    depth: 1,
    parentId: 'sys_apparel',
    isActive: true,
    scope: 'SYSTEM',
    createdAt: '2026-01-23T00:00:00Z',
    updatedAt: '2026-01-23T00:00:00Z',
  },
  {
    id: 'tenant_premium',
    name: 'Premium T-Shirts',
    path: 'apparel.tops.tshirts.premium',
    type: CategoryType.LEAF,
    targetType: TargetType.PRODUCT,
    depth: 3,
    isActive: true,
    scope: 'TENANT',
    createdAt: '2026-01-23T00:00:00Z',
    updatedAt: '2026-01-23T00:00:00Z',
    adoption: {
      id: 'adopt_1',
      systemCategoryId: 'sys_tshirts',
      mode: AdoptionMode.FORKED,
      adoptedAt: '2026-01-23T00:00:00Z',
      forkedVersion: 1,
      updateAvailable: false,
    },
  },
];

describe('categories routes', () => {
  let app: Hono;
  let mockRepo: CategoriesRepository;

  beforeEach(() => {
    mockRepo = {
      findAll: async (filter) => {
        let cats = [...mockCategories];
        if (filter?.scope === 'SYSTEM') {
          cats = cats.filter(c => c.scope === 'SYSTEM');
        } else if (filter?.scope === 'TENANT') {
          cats = cats.filter(c => c.scope === 'TENANT');
        }
        if (filter?.targetType) {
          cats = cats.filter(c => c.targetType === filter.targetType);
        }
        if (filter?.parentId) {
          cats = cats.filter(c => c.parentId === filter.parentId);
        }
        if (filter?.isActive !== undefined) {
          cats = cats.filter(c => c.isActive === filter.isActive);
        }
        return cats;
      },
      findById: async (id) => mockCategories.find(c => c.id === id) ?? null,
      findByPath: async (path) => mockCategories.find(c => c.path === path) ?? null,
      create: async () => mockCategories[0],
      update: async () => mockCategories[0],
      delete: async () => {},
      adopt: async () => mockCategories[2].adoption!,
      syncFork: async () => mockCategories[2].adoption!,
      getAncestors: async () => [mockCategories[0], mockCategories[1]],
      getChildren: async () => [mockCategories[1]],
    };

    app = new Hono();
    app.route('/categories', createCategoriesRouter(mockRepo));
  });

  describe('GET /categories', () => {
    it('returns all categories', async () => {
      const res = await app.request('/categories');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: CategoryWithAdoption[]; meta: { total: number } };
      expect(body.data).toHaveLength(3);
      expect(body.meta.total).toBe(3);
    });

    it('filters by scope=SYSTEM', async () => {
      const res = await app.request('/categories?scope=SYSTEM');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: CategoryWithAdoption[] };
      expect(body.data).toHaveLength(2);
      expect(body.data.every(c => c.scope === 'SYSTEM')).toBe(true);
    });

    it('filters by scope=TENANT', async () => {
      const res = await app.request('/categories?scope=TENANT');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: CategoryWithAdoption[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].scope).toBe('TENANT');
    });

    it('filters by targetType', async () => {
      const res = await app.request('/categories?targetType=PRODUCT');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: CategoryWithAdoption[] };
      expect(body.data.every(c => c.targetType === 'PRODUCT')).toBe(true);
    });
  });

  describe('GET /categories/:id', () => {
    it('returns category by ID', async () => {
      const res = await app.request('/categories/sys_apparel');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: CategoryWithAdoption };
      expect(body.data.id).toBe('sys_apparel');
      expect(body.data.name).toBe('Apparel');
    });

    it('returns 404 for unknown ID', async () => {
      const res = await app.request('/categories/unknown');
      expect(res.status).toBe(404);
    });

    it('includes adoption info for tenant category', async () => {
      const res = await app.request('/categories/tenant_premium');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: CategoryWithAdoption };
      expect(body.data.adoption).toBeDefined();
      expect(body.data.adoption?.mode).toBe('FORKED');
    });
  });

  describe('GET /categories/:id/ancestors', () => {
    it('returns ancestors ordered by depth', async () => {
      const res = await app.request('/categories/sys_tops/ancestors');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: CategoryWithAdoption[] };
      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /categories/:id/children', () => {
    it('returns direct children', async () => {
      const res = await app.request('/categories/sys_apparel/children');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: CategoryWithAdoption[] };
      expect(body.data.length).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/routes/taxonomy/categories.test.ts
```

Expected: FAIL - routes not implemented

**Step 3: Implement the list and get routes**

Update `apps/api/src/routes/taxonomy/categories.ts`:

```typescript
// apps/api/src/routes/taxonomy/categories.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { CategoryType, TargetType, AdoptionMode } from '@eurocomply/database';

// ============================================================================
// Types
// ============================================================================

export interface CategoryData {
  id: string;
  name: string;
  description?: string;
  path: string;
  type: CategoryType;
  targetType: TargetType;
  depth: number;
  parentId?: string;
  defaultProfileId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryAdoptionData {
  id: string;
  systemCategoryId: string;
  localCategoryId?: string;
  mode: AdoptionMode;
  adoptedAt: string;
  forkedVersion?: number;
  updateAvailable: boolean;
}

export interface CategoryWithAdoption extends CategoryData {
  scope: 'SYSTEM' | 'TENANT';
  adoption?: CategoryAdoptionData;
}

export interface CategoriesRepository {
  findAll(filter?: {
    scope?: 'SYSTEM' | 'TENANT' | 'ALL';
    targetType?: TargetType;
    parentId?: string;
    isActive?: boolean;
  }): Promise<CategoryWithAdoption[]>;

  findById(id: string): Promise<CategoryWithAdoption | null>;

  findByPath(path: string): Promise<CategoryWithAdoption | null>;

  create(data: {
    name: string;
    description?: string;
    parentId?: string;
    targetType: TargetType;
    type?: CategoryType;
  }): Promise<CategoryData>;

  update(id: string, data: {
    name?: string;
    description?: string;
    isActive?: boolean;
    defaultProfileId?: string;
  }): Promise<CategoryData>;

  delete(id: string): Promise<void>;

  adopt(systemCategoryId: string, mode: AdoptionMode): Promise<CategoryAdoptionData>;

  syncFork(adoptionId: string): Promise<CategoryAdoptionData>;

  getAncestors(categoryId: string): Promise<CategoryData[]>;

  getChildren(categoryId: string): Promise<CategoryData[]>;
}

// ============================================================================
// Schemas
// ============================================================================

const listCategoriesQuery = z.object({
  scope: z.enum(['SYSTEM', 'TENANT', 'ALL']).optional().default('ALL'),
  targetType: z.nativeEnum(TargetType).optional(),
  parentId: z.string().optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

const createCategoryBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  parentId: z.string().optional(),
  targetType: z.nativeEnum(TargetType).default(TargetType.PRODUCT),
  type: z.nativeEnum(CategoryType).optional(),
});

const updateCategoryBody = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
  defaultProfileId: z.string().optional(),
});

const adoptCategoryBody = z.object({
  mode: z.nativeEnum(AdoptionMode),
});

// ============================================================================
// Router
// ============================================================================

export function createCategoriesRouter(repo: CategoriesRepository) {
  const router = new Hono();

  // GET /categories - List all categories
  router.get('/', zValidator('query', listCategoriesQuery), async (c) => {
    const query = c.req.valid('query');

    const categories = await repo.findAll({
      scope: query.scope === 'ALL' ? undefined : query.scope,
      targetType: query.targetType,
      parentId: query.parentId,
      isActive: query.active,
    });

    return c.json({
      data: categories,
      meta: { total: categories.length },
    });
  });

  // GET /categories/:id - Get category by ID
  router.get('/:id', async (c) => {
    const id = c.req.param('id');
    const category = await repo.findById(id);

    if (!category) {
      return c.json({ error: 'Not Found', message: `Category not found: ${id}` }, 404);
    }

    return c.json({ data: category });
  });

  // GET /categories/:id/ancestors - Get all ancestors
  router.get('/:id/ancestors', async (c) => {
    const id = c.req.param('id');
    const category = await repo.findById(id);

    if (!category) {
      return c.json({ error: 'Not Found', message: `Category not found: ${id}` }, 404);
    }

    const ancestors = await repo.getAncestors(id);

    return c.json({
      data: ancestors,
      meta: { total: ancestors.length },
    });
  });

  // GET /categories/:id/children - Get direct children
  router.get('/:id/children', async (c) => {
    const id = c.req.param('id');
    const category = await repo.findById(id);

    if (!category) {
      return c.json({ error: 'Not Found', message: `Category not found: ${id}` }, 404);
    }

    const children = await repo.getChildren(id);

    return c.json({
      data: children,
      meta: { total: children.length },
    });
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/routes/taxonomy/categories.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/taxonomy/categories.ts
git add apps/api/src/routes/taxonomy/categories.test.ts
git commit -m "feat(api): add categories list and get routes

- GET /categories with scope, targetType, parentId filters
- GET /categories/:id with adoption info
- GET /categories/:id/ancestors
- GET /categories/:id/children"
```

---

## Task 3.5: Implement Categories CRUD Routes

**Files:**
- Modify: `apps/api/src/routes/taxonomy/categories.ts`
- Modify: `apps/api/src/routes/taxonomy/categories.test.ts`

**Step 1: Add tests for CRUD operations**

Add to `apps/api/src/routes/taxonomy/categories.test.ts`:

```typescript
  describe('POST /categories', () => {
    it('creates a new tenant category', async () => {
      const res = await app.request('/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Category',
          targetType: 'PRODUCT',
        }),
      });
      expect(res.status).toBe(201);

      const body = await res.json() as { data: CategoryWithAdoption };
      expect(body.data.name).toBeDefined();
    });

    it('rejects invalid body', async () => {
      const res = await app.request('/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('updates a category', async () => {
      const res = await app.request('/categories/tenant_premium', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for unknown category', async () => {
      const res = await app.request('/categories/unknown', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /categories/:id', () => {
    it('deletes a category', async () => {
      const res = await app.request('/categories/tenant_premium', {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for unknown category', async () => {
      const res = await app.request('/categories/unknown', {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/routes/taxonomy/categories.test.ts
```

Expected: FAIL - CRUD routes not implemented

**Step 3: Implement the CRUD routes**

Add to `createCategoriesRouter` function in `apps/api/src/routes/taxonomy/categories.ts`:

```typescript
  // POST /categories - Create tenant category
  router.post('/', zValidator('json', createCategoryBody), async (c) => {
    const body = c.req.valid('json');

    const category = await repo.create({
      name: body.name,
      description: body.description,
      parentId: body.parentId,
      targetType: body.targetType,
      type: body.type,
    });

    return c.json({ data: category }, 201);
  });

  // PATCH /categories/:id - Update tenant category
  router.patch('/:id', zValidator('json', updateCategoryBody), async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json({ error: 'Not Found', message: `Category not found: ${id}` }, 404);
    }

    // Only allow updating tenant categories
    if (existing.scope === 'SYSTEM') {
      return c.json({ error: 'Forbidden', message: 'Cannot modify system categories' }, 403);
    }

    const updated = await repo.update(id, {
      name: body.name,
      description: body.description,
      isActive: body.isActive,
      defaultProfileId: body.defaultProfileId,
    });

    return c.json({ data: updated });
  });

  // DELETE /categories/:id - Delete tenant category
  router.delete('/:id', async (c) => {
    const id = c.req.param('id');

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json({ error: 'Not Found', message: `Category not found: ${id}` }, 404);
    }

    if (existing.scope === 'SYSTEM') {
      return c.json({ error: 'Forbidden', message: 'Cannot delete system categories' }, 403);
    }

    await repo.delete(id);

    return c.json({ success: true, message: 'Category deleted' });
  });
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/routes/taxonomy/categories.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/taxonomy/categories.ts
git add apps/api/src/routes/taxonomy/categories.test.ts
git commit -m "feat(api): add categories CRUD routes

- POST /categories - create tenant category
- PATCH /categories/:id - update tenant category (blocks system)
- DELETE /categories/:id - delete tenant category (blocks system)"
```

---

## Task 3.6: Implement Category Adoption Routes

**Files:**
- Modify: `apps/api/src/routes/taxonomy/categories.ts`
- Modify: `apps/api/src/routes/taxonomy/categories.test.ts`

**Step 1: Add tests for adoption operations**

Add to `apps/api/src/routes/taxonomy/categories.test.ts`:

```typescript
  describe('POST /categories/:systemId/adopt', () => {
    it('adopts a system category as LIVE_LINK', async () => {
      const res = await app.request('/categories/sys_apparel/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'LIVE_LINK' }),
      });
      expect(res.status).toBe(201);

      const body = await res.json() as { data: { mode: string } };
      expect(body.data.mode).toBeDefined();
    });

    it('adopts a system category as FORKED', async () => {
      const res = await app.request('/categories/sys_apparel/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'FORKED' }),
      });
      expect(res.status).toBe(201);
    });

    it('rejects adoption of non-existent category', async () => {
      // Update mock to return null for unknown
      mockRepo.findById = async (id) => {
        if (id === 'unknown') return null;
        return mockCategories.find(c => c.id === id) ?? null;
      };

      const res = await app.request('/categories/unknown/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'LIVE_LINK' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /categories/:id/sync', () => {
    it('syncs a forked category', async () => {
      const res = await app.request('/categories/tenant_premium/sync', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
    });

    it('rejects sync for non-forked category', async () => {
      const res = await app.request('/categories/sys_apparel/sync', {
        method: 'POST',
      });
      // System category has no adoption, so can't sync
      expect(res.status).toBe(400);
    });
  });
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/routes/taxonomy/categories.test.ts
```

Expected: FAIL - adoption routes not implemented

**Step 3: Implement the adoption routes**

Add to `createCategoriesRouter` function:

```typescript
  // POST /categories/:systemId/adopt - Adopt a system category
  router.post('/:systemId/adopt', zValidator('json', adoptCategoryBody), async (c) => {
    const systemId = c.req.param('systemId');
    const body = c.req.valid('json');

    const systemCategory = await repo.findById(systemId);
    if (!systemCategory) {
      return c.json({ error: 'Not Found', message: `System category not found: ${systemId}` }, 404);
    }

    if (systemCategory.scope !== 'SYSTEM') {
      return c.json({ error: 'Bad Request', message: 'Can only adopt system categories' }, 400);
    }

    const adoption = await repo.adopt(systemId, body.mode);

    return c.json({
      data: adoption,
      message: `Category adopted as ${body.mode}`,
    }, 201);
  });

  // POST /categories/:id/sync - Sync a forked category with system
  router.post('/:id/sync', async (c) => {
    const id = c.req.param('id');

    const category = await repo.findById(id);
    if (!category) {
      return c.json({ error: 'Not Found', message: `Category not found: ${id}` }, 404);
    }

    if (!category.adoption) {
      return c.json({ error: 'Bad Request', message: 'Category has no adoption record' }, 400);
    }

    if (category.adoption.mode !== AdoptionMode.FORKED) {
      return c.json({ error: 'Bad Request', message: 'Only FORKED categories can be synced' }, 400);
    }

    const updated = await repo.syncFork(category.adoption.id);

    return c.json({
      data: updated,
      message: 'Category synced with system',
    });
  });
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/routes/taxonomy/categories.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/taxonomy/categories.ts
git add apps/api/src/routes/taxonomy/categories.test.ts
git commit -m "feat(api): add category adoption routes

- POST /categories/:systemId/adopt - adopt as LIVE_LINK or FORKED
- POST /categories/:id/sync - sync forked category with system updates"
```

---

## Task 3.7: Create MikroORM Categories Repository

**Files:**
- Create: `apps/api/src/routes/taxonomy/categories-repository.ts`

**Step 1: Implement the MikroORM repository**

```typescript
// apps/api/src/routes/taxonomy/categories-repository.ts
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import {
  Category,
  CategoryType,
  CategoryAdoption,
  AdoptionMode,
  TargetType,
  CategoryService,
  MikroOrmCategoryQueryExecutor,
} from '@eurocomply/database';
import type {
  CategoriesRepository,
  CategoryData,
  CategoryAdoptionData,
  CategoryWithAdoption,
} from './categories.js';

/**
 * MikroORM implementation of CategoriesRepository.
 *
 * Handles dual-scope categories (system in public schema, tenant in tenant schema)
 * with adoption tracking.
 */
export class MikroOrmCategoriesRepository implements CategoriesRepository {
  private categoryService: CategoryService;

  constructor(
    private readonly orm: MikroORM,
    private readonly tenantSchema: string,
  ) {
    const executor = new MikroOrmCategoryQueryExecutor(orm.em);
    this.categoryService = new CategoryService(executor);
  }

  async findAll(filter?: {
    scope?: 'SYSTEM' | 'TENANT';
    targetType?: TargetType;
    parentId?: string;
    isActive?: boolean;
  }): Promise<CategoryWithAdoption[]> {
    const results: CategoryWithAdoption[] = [];

    // Fetch system categories (if scope is SYSTEM or undefined)
    if (!filter?.scope || filter.scope === 'SYSTEM') {
      const publicEm = this.orm.em.fork();
      const systemCategories = await publicEm.find(Category, {
        ...(filter?.targetType && { targetType: filter.targetType }),
        ...(filter?.parentId && { parent: { id: filter.parentId } }),
        ...(filter?.isActive !== undefined && { isActive: filter.isActive }),
      }, { schema: 'public' });

      for (const cat of systemCategories) {
        results.push(this.toWithAdoption(cat, 'SYSTEM'));
      }
    }

    // Fetch tenant categories (if scope is TENANT or undefined)
    if (!filter?.scope || filter.scope === 'TENANT') {
      const tenantEm = this.orm.em.fork();
      tenantEm.schema = this.tenantSchema;

      const tenantCategories = await tenantEm.find(Category, {
        ...(filter?.targetType && { targetType: filter.targetType }),
        ...(filter?.parentId && { parent: { id: filter.parentId } }),
        ...(filter?.isActive !== undefined && { isActive: filter.isActive }),
      });

      // Load adoptions for tenant categories
      const adoptions = await tenantEm.find(CategoryAdoption, {});
      const adoptionMap = new Map(adoptions.map(a => [a.localCategory?.id, a]));

      for (const cat of tenantCategories) {
        const adoption = adoptionMap.get(cat.id);
        results.push(this.toWithAdoption(cat, 'TENANT', adoption));
      }
    }

    return results;
  }

  async findById(id: string): Promise<CategoryWithAdoption | null> {
    // Try public schema first
    const publicEm = this.orm.em.fork();
    const systemCat = await publicEm.findOne(Category, { id }, { schema: 'public' });
    if (systemCat) {
      return this.toWithAdoption(systemCat, 'SYSTEM');
    }

    // Try tenant schema
    const tenantEm = this.orm.em.fork();
    tenantEm.schema = this.tenantSchema;
    const tenantCat = await tenantEm.findOne(Category, { id });
    if (tenantCat) {
      const adoption = await tenantEm.findOne(CategoryAdoption, { localCategory: tenantCat });
      return this.toWithAdoption(tenantCat, 'TENANT', adoption ?? undefined);
    }

    return null;
  }

  async findByPath(path: string): Promise<CategoryWithAdoption | null> {
    // Try public schema first
    const publicEm = this.orm.em.fork();
    const systemCat = await publicEm.findOne(Category, { path }, { schema: 'public' });
    if (systemCat) {
      return this.toWithAdoption(systemCat, 'SYSTEM');
    }

    // Try tenant schema
    const tenantEm = this.orm.em.fork();
    tenantEm.schema = this.tenantSchema;
    const tenantCat = await tenantEm.findOne(Category, { path });
    if (tenantCat) {
      const adoption = await tenantEm.findOne(CategoryAdoption, { localCategory: tenantCat });
      return this.toWithAdoption(tenantCat, 'TENANT', adoption ?? undefined);
    }

    return null;
  }

  async create(data: {
    name: string;
    description?: string;
    parentId?: string;
    targetType: TargetType;
    type?: CategoryType;
  }): Promise<CategoryData> {
    const em = this.orm.em.fork();
    em.schema = this.tenantSchema;

    let parent: Category | undefined;
    let path = this.slugify(data.name);
    let depth = 0;

    if (data.parentId) {
      parent = await em.findOne(Category, { id: data.parentId }) ?? undefined;
      if (parent) {
        path = `${parent.path}.${this.slugify(data.name)}`;
        depth = parent.depth + 1;
      }
    }

    const category = em.create(Category, {
      name: data.name,
      description: data.description,
      path,
      type: data.type ?? (parent ? CategoryType.BRANCH : CategoryType.ROOT),
      targetType: data.targetType,
      depth,
      parent,
      isActive: true,
    });

    await em.persistAndFlush(category);

    return this.toData(category);
  }

  async update(id: string, data: {
    name?: string;
    description?: string;
    isActive?: boolean;
    defaultProfileId?: string;
  }): Promise<CategoryData> {
    const em = this.orm.em.fork();
    em.schema = this.tenantSchema;

    const category = await em.findOneOrFail(Category, { id });

    if (data.name !== undefined) category.name = data.name;
    if (data.description !== undefined) category.description = data.description;
    if (data.isActive !== undefined) category.isActive = data.isActive;
    if (data.defaultProfileId !== undefined) category.defaultProfileId = data.defaultProfileId;

    await em.flush();

    return this.toData(category);
  }

  async delete(id: string): Promise<void> {
    const em = this.orm.em.fork();
    em.schema = this.tenantSchema;

    const category = await em.findOneOrFail(Category, { id });

    // Delete associated adoption if exists
    const adoption = await em.findOne(CategoryAdoption, { localCategory: category });
    if (adoption) {
      em.remove(adoption);
    }

    em.remove(category);
    await em.flush();
  }

  async adopt(systemCategoryId: string, mode: AdoptionMode): Promise<CategoryAdoptionData> {
    const em = this.orm.em.fork();
    em.schema = this.tenantSchema;

    // Check if already adopted
    const existing = await em.findOne(CategoryAdoption, { systemCategoryId });
    if (existing) {
      return this.toAdoptionData(existing);
    }

    let localCategory: Category | undefined;

    if (mode === AdoptionMode.FORKED) {
      // Get system category to copy
      const publicEm = this.orm.em.fork();
      const systemCat = await publicEm.findOneOrFail(Category, { id: systemCategoryId }, { schema: 'public' });

      // Create local copy
      localCategory = em.create(Category, {
        name: systemCat.name,
        description: systemCat.description,
        path: systemCat.path,
        type: systemCat.type,
        targetType: systemCat.targetType,
        depth: systemCat.depth,
        isActive: true,
      });
      em.persist(localCategory);
    }

    const adoption = em.create(CategoryAdoption, {
      systemCategoryId,
      localCategory,
      mode,
      adoptedAt: new Date(),
      forkedVersion: mode === AdoptionMode.FORKED ? 1 : undefined,
      updateAvailable: false,
    });

    await em.persistAndFlush(adoption);

    return this.toAdoptionData(adoption);
  }

  async syncFork(adoptionId: string): Promise<CategoryAdoptionData> {
    const em = this.orm.em.fork();
    em.schema = this.tenantSchema;

    const adoption = await em.findOneOrFail(CategoryAdoption, { id: adoptionId }, {
      populate: ['localCategory'],
    });

    if (adoption.mode !== AdoptionMode.FORKED) {
      throw new Error('Can only sync FORKED adoptions');
    }

    // Get latest system category
    const publicEm = this.orm.em.fork();
    const systemCat = await publicEm.findOneOrFail(Category, { id: adoption.systemCategoryId }, { schema: 'public' });

    // Update local copy
    if (adoption.localCategory) {
      adoption.localCategory.name = systemCat.name;
      adoption.localCategory.description = systemCat.description;
    }

    adoption.forkedVersion = (adoption.forkedVersion ?? 0) + 1;
    adoption.updateAvailable = false;

    await em.flush();

    return this.toAdoptionData(adoption);
  }

  async getAncestors(categoryId: string): Promise<CategoryData[]> {
    const category = await this.findById(categoryId);
    if (!category) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    // Use LTREE query via category service
    const em = this.orm.em.fork();
    const result = await em.execute<Record<string, unknown>[]>(`
      SELECT * FROM category
      WHERE path @> $1::ltree
      ORDER BY depth ASC
    `, [category.path]);

    return result.map(row => this.rowToData(row));
  }

  async getChildren(categoryId: string): Promise<CategoryData[]> {
    const em = this.orm.em.fork();
    const children = await em.find(Category, { parent: { id: categoryId } });
    return children.map(c => this.toData(c));
  }

  // Helper methods
  private slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  private toData(cat: Category): CategoryData {
    return {
      id: cat.id,
      name: cat.name,
      description: cat.description,
      path: cat.path,
      type: cat.type,
      targetType: cat.targetType,
      depth: cat.depth,
      parentId: cat.parent?.id,
      defaultProfileId: cat.defaultProfileId,
      isActive: cat.isActive,
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
    };
  }

  private toWithAdoption(
    cat: Category,
    scope: 'SYSTEM' | 'TENANT',
    adoption?: CategoryAdoption,
  ): CategoryWithAdoption {
    return {
      ...this.toData(cat),
      scope,
      adoption: adoption ? this.toAdoptionData(adoption) : undefined,
    };
  }

  private toAdoptionData(adoption: CategoryAdoption): CategoryAdoptionData {
    return {
      id: adoption.id,
      systemCategoryId: adoption.systemCategoryId,
      localCategoryId: adoption.localCategory?.id,
      mode: adoption.mode,
      adoptedAt: adoption.adoptedAt.toISOString(),
      forkedVersion: adoption.forkedVersion,
      updateAvailable: adoption.updateAvailable,
    };
  }

  private rowToData(row: Record<string, unknown>): CategoryData {
    return {
      id: row['id'] as string,
      name: row['name'] as string,
      description: row['description'] as string | undefined,
      path: row['path'] as string,
      type: row['type'] as CategoryType,
      targetType: row['target_type'] as TargetType,
      depth: row['depth'] as number,
      parentId: row['parent_id'] as string | undefined,
      defaultProfileId: row['default_profile_id'] as string | undefined,
      isActive: row['is_active'] as boolean,
      createdAt: new Date(row['created_at'] as string).toISOString(),
      updatedAt: new Date(row['updated_at'] as string).toISOString(),
    };
  }
}
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/taxonomy/categories-repository.ts
git commit -m "feat(api): add MikroORM CategoriesRepository implementation

- Dual-schema support (public + tenant)
- LTREE-based ancestor queries
- Category adoption (LIVE_LINK/FORKED)
- Fork sync functionality"
```

---

## Task 3.8: Wire Categories Routes to App

**Files:**
- Modify: `apps/api/src/routes/taxonomy/index.ts`
- Modify: `apps/api/src/app.ts`

**Step 1: Update taxonomy index**

```typescript
// apps/api/src/routes/taxonomy/index.ts
import type { MikroORM } from '@mikro-orm/postgresql';
import { UnitDefinition, UnitSystem } from '@eurocomply/database';
import type { UnitsRepository, UnitData } from './units.js';
import type { CategoriesRepository } from './categories.js';
import { MikroOrmCategoriesRepository } from './categories-repository.js';

export { createUnitsRouter, type UnitsRepository, type UnitData } from './units.js';
export { createCategoriesRouter, type CategoriesRepository, type CategoryWithAdoption } from './categories.js';

/**
 * Create a MikroORM-based units repository for production use.
 */
export function createUnitsRepository(orm: MikroORM): UnitsRepository {
  return {
    findAll: async (filter): Promise<UnitData[]> => {
      const em = orm.em.fork();
      const qb = em.createQueryBuilder(UnitDefinition);
      if (filter?.system) qb.andWhere({ system: filter.system });
      if (filter?.active !== undefined) qb.andWhere({ isActive: filter.active });
      const units = await qb.getResultList();
      return units.map((u: UnitDefinition) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        symbol: u.symbol,
        system: u.system,
        factor: u.factor,
        isBase: u.isBase,
        isActive: u.isActive,
      }));
    },
    findByCode: async (code): Promise<UnitData | null> => {
      const em = orm.em.fork();
      const unit = await em.findOne(UnitDefinition, { code });
      if (!unit) return null;
      return {
        id: unit.id,
        code: unit.code,
        name: unit.name,
        symbol: unit.symbol,
        system: unit.system,
        factor: unit.factor,
        isBase: unit.isBase,
        isActive: unit.isActive,
      };
    },
    findBaseUnit: async (system): Promise<UnitData | null> => {
      const em = orm.em.fork();
      const unit = await em.findOne(UnitDefinition, { system, isBase: true });
      if (!unit) return null;
      return {
        id: unit.id,
        code: unit.code,
        name: unit.name,
        symbol: unit.symbol,
        system: unit.system,
        factor: unit.factor,
        isBase: unit.isBase,
        isActive: unit.isActive,
      };
    },
  };
}

/**
 * Create a MikroORM-based categories repository for production use.
 */
export function createCategoriesRepository(orm: MikroORM, tenantSchema: string): CategoriesRepository {
  return new MikroOrmCategoriesRepository(orm, tenantSchema);
}
```

**Step 2: Update app.ts**

Add categories routes to `apps/api/src/app.ts`:

```typescript
// Add import at top
import {
  createUnitsRouter,
  createCategoriesRouter,
  type UnitsRepository,
  type CategoriesRepository,
} from './routes/taxonomy/index.js';

// Update AppDependencies interface
export interface AppDependencies {
  orm?: OrmLike;
  webhooksRouter?: Hono;
  organizationsAdminRouter?: Hono;
  unitsRepository?: UnitsRepository;
  categoriesRepository?: CategoriesRepository;
}

// Update taxonomy routes section
  // Taxonomy routes (public, no auth required for units; tenant-scoped for categories)
  const taxonomy = new Hono<Env>();
  if (deps?.unitsRepository) {
    taxonomy.route('/units', createUnitsRouter(deps.unitsRepository));
  }
  if (deps?.categoriesRepository) {
    taxonomy.route('/categories', createCategoriesRouter(deps.categoriesRepository));
  }
  v1.route('/taxonomy', taxonomy);
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/taxonomy/index.ts
git add apps/api/src/app.ts
git commit -m "feat(api): wire categories routes to app

- Export createCategoriesRepository factory
- Add categoriesRepository to AppDependencies
- Mount /taxonomy/categories routes"
```

---

## Task 3.9: Create Categories E2E Integration Test

**Files:**
- Create: `apps/api/src/routes/taxonomy/categories.e2e.test.ts`

**Step 1: Create integration test**

```typescript
// apps/api/src/routes/taxonomy/categories.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import type { MikroORM } from '@eurocomply/database';
import { Category, CategoryType, TargetType, CategoryAdoption, AdoptionMode } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createCategoriesRouter, type CategoryWithAdoption } from './categories.js';
import { MikroOrmCategoriesRepository } from './categories-repository.js';

describe('Categories API E2E', () => {
  let orm: MikroORM;
  let app: Hono;
  const testSchema = 'tenant_categories_e2e_test';

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();

    // Create test schema
    await orm.em.execute(`CREATE SCHEMA IF NOT EXISTS "${testSchema}"`);

    // Seed system categories in public schema
    const publicEm = orm.em.fork();
    const apparel = publicEm.create(Category, {
      name: 'Apparel',
      path: 'apparel',
      type: CategoryType.ROOT,
      targetType: TargetType.PRODUCT,
      depth: 0,
      isActive: true,
    });
    publicEm.persist(apparel);

    const tops = publicEm.create(Category, {
      name: 'Tops',
      path: 'apparel.tops',
      type: CategoryType.BRANCH,
      targetType: TargetType.PRODUCT,
      depth: 1,
      parent: apparel,
      isActive: true,
    });
    publicEm.persist(tops);
    await publicEm.flush();

    // Create repository and app
    const repo = new MikroOrmCategoriesRepository(orm, testSchema);
    app = new Hono();
    app.route('/categories', createCategoriesRouter(repo));
  });

  afterAll(async () => {
    if (orm) {
      await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
      await orm.em.fork().nativeDelete(Category, {});
      await teardownTestDb();
    }
  });

  it('should list system categories', async () => {
    if (!orm) return;

    const res = await app.request('/categories?scope=SYSTEM');
    expect(res.status).toBe(200);

    const body = await res.json() as { data: CategoryWithAdoption[] };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every(c => c.scope === 'SYSTEM')).toBe(true);
  });

  it('should create a tenant category', async () => {
    if (!orm) return;

    const res = await app.request('/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Custom Category',
        targetType: 'PRODUCT',
      }),
    });
    expect(res.status).toBe(201);

    const body = await res.json() as { data: CategoryWithAdoption };
    expect(body.data.name).toBe('Custom Category');
  });

  it('should adopt a system category as FORKED', async () => {
    if (!orm) return;

    // First get system category ID
    const listRes = await app.request('/categories?scope=SYSTEM');
    const listBody = await listRes.json() as { data: CategoryWithAdoption[] };
    const systemCat = listBody.data[0];

    const res = await app.request(`/categories/${systemCat.id}/adopt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'FORKED' }),
    });
    expect(res.status).toBe(201);

    const body = await res.json() as { data: { mode: string } };
    expect(body.data.mode).toBe('FORKED');
  });

  it('should get category with ancestors', async () => {
    if (!orm) return;

    const listRes = await app.request('/categories?scope=SYSTEM');
    const listBody = await listRes.json() as { data: CategoryWithAdoption[] };
    const deepCat = listBody.data.find(c => c.depth > 0);

    if (!deepCat) return; // Skip if no nested categories

    const res = await app.request(`/categories/${deepCat.id}/ancestors`);
    expect(res.status).toBe(200);

    const body = await res.json() as { data: CategoryWithAdoption[] };
    expect(body.data.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/taxonomy/categories.e2e.test.ts
git commit -m "test(api): add categories API e2e integration test

- Tests system category listing
- Tests tenant category creation
- Tests adoption flow
- Tests ancestor queries"
```

---

## Phase 3 Complete Checkpoint

At this point, Plan 3 is complete. Verify:

```bash
# Run all tests
pnpm test

# Run category-specific tests
cd packages/database && pnpm test src/services/category
cd apps/api && pnpm test src/routes/taxonomy/categories

# Verify build
pnpm build
```

**Plan 3 Deliverables:**
- [x] CategoryService with LTREE-optimized queries
- [x] MikroOrmCategoryQueryExecutor
- [x] Categories API types and interfaces
- [x] GET /categories (list with filters)
- [x] GET /categories/:id (with adoption info)
- [x] GET /categories/:id/ancestors
- [x] GET /categories/:id/children
- [x] POST /categories (create tenant)
- [x] PATCH /categories/:id (update tenant)
- [x] DELETE /categories/:id (delete tenant)
- [x] POST /categories/:systemId/adopt
- [x] POST /categories/:id/sync
- [x] MikroORM CategoriesRepository
- [x] E2E integration tests

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-23 | Initial implementation plan |
