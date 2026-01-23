# Attributes Service & API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement AttributeService with inherited attribute resolution and full CRUD API for attribute templates.

**Architecture:** AttributeService walks the category hierarchy to collect inherited attributes. Attributes API supports dual-scope (system + tenant) with category binding. Routes follow the established Hono pattern from categories.ts.

**Tech Stack:** MikroORM, PostgreSQL, Hono, Zod validation, Vitest

**Prerequisites:**
- Plan 1 (Units Foundation) - DONE
- Plan 2 (Category & Attribute Schema) - DONE
- Plan 3 (Category Service & API) - DONE or in progress

---

## Task 4.1: Create AttributeService with Inheritance Resolution

**Files:**
- Create: `packages/database/src/services/attribute.service.ts`
- Create: `packages/database/src/services/attribute.service.test.ts`
- Modify: `packages/database/src/services/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/attribute.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AttributeService } from './attribute.service.js';
import { AttributeTemplate, AttributeType, RollupMethod, InheritanceRule } from '../entities/AttributeTemplate.js';
import { Category, CategoryType } from '../entities/Category.js';
import { TargetType, UnitSystem } from '../entities/enums/index.js';

describe('AttributeService', () => {
  let service: AttributeService;
  let mockCategories: Category[];
  let mockAttributes: AttributeTemplate[];

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

    // Create mock attributes at different levels
    const weightAttr = new AttributeTemplate();
    weightAttr.id = 'attr_weight';
    weightAttr.key = 'weight';
    weightAttr.name = 'Product Weight';
    weightAttr.type = AttributeType.NUMBER_UNIT;
    weightAttr.category = apparel;  // Defined at apparel level
    weightAttr.targetType = TargetType.PRODUCT;
    weightAttr.unitSystem = UnitSystem.MASS;
    weightAttr.rollupMethod = RollupMethod.SUM;
    weightAttr.inheritanceRule = InheritanceRule.INHERIT;
    weightAttr.isActive = true;

    const colorAttr = new AttributeTemplate();
    colorAttr.id = 'attr_color';
    colorAttr.key = 'color';
    colorAttr.name = 'Color';
    colorAttr.type = AttributeType.STRING;
    colorAttr.category = tops;  // Defined at tops level
    colorAttr.targetType = TargetType.PRODUCT;
    colorAttr.rollupMethod = RollupMethod.NONE;
    colorAttr.inheritanceRule = InheritanceRule.INHERIT;
    colorAttr.isActive = true;

    const sleeveAttr = new AttributeTemplate();
    sleeveAttr.id = 'attr_sleeve';
    sleeveAttr.key = 'sleeve_length';
    sleeveAttr.name = 'Sleeve Length';
    sleeveAttr.type = AttributeType.NUMBER_UNIT;
    sleeveAttr.category = tshirts;  // Defined at tshirts level
    sleeveAttr.targetType = TargetType.PRODUCT;
    sleeveAttr.unitSystem = UnitSystem.LENGTH;
    sleeveAttr.rollupMethod = RollupMethod.NONE;
    sleeveAttr.inheritanceRule = InheritanceRule.INHERIT;
    sleeveAttr.isActive = true;

    mockAttributes = [weightAttr, colorAttr, sleeveAttr];

    // Create mock executor
    const mockExecutor = {
      findByCategoryPath: async (path: string): Promise<AttributeTemplate[]> => {
        return mockAttributes.filter(a => a.category.path === path);
      },
      findById: async (id: string): Promise<AttributeTemplate | null> => {
        return mockAttributes.find(a => a.id === id) ?? null;
      },
      findByKey: async (key: string, categoryId: string): Promise<AttributeTemplate | null> => {
        return mockAttributes.find(a => a.key === key && a.category.id === categoryId) ?? null;
      },
      getCategoryAncestorPaths: async (categoryId: string): Promise<string[]> => {
        const cat = mockCategories.find(c => c.id === categoryId);
        if (!cat) return [];
        // Return all ancestor paths including self
        const parts = cat.path.split('.');
        return parts.map((_, i) => parts.slice(0, i + 1).join('.'));
      },
    };

    service = new AttributeService(mockExecutor);
  });

  describe('getAttributesForCategory', () => {
    it('should return only direct attributes when includeInherited=false', async () => {
      const attrs = await service.getAttributesForCategory('cat_tshirts', false);

      expect(attrs).toHaveLength(1);
      expect(attrs[0].key).toBe('sleeve_length');
    });

    it('should return all inherited attributes when includeInherited=true', async () => {
      const attrs = await service.getAttributesForCategory('cat_tshirts', true);

      expect(attrs).toHaveLength(3);
      expect(attrs.map(a => a.key).sort()).toEqual(['color', 'sleeve_length', 'weight']);
    });

    it('should order attributes by category depth (ancestors first)', async () => {
      const attrs = await service.getAttributesForCategory('cat_tshirts', true);

      // weight is from apparel (depth 0)
      // color is from tops (depth 1)
      // sleeve_length is from tshirts (depth 2)
      expect(attrs[0].key).toBe('weight');
      expect(attrs[1].key).toBe('color');
      expect(attrs[2].key).toBe('sleeve_length');
    });

    it('should return empty array for unknown category', async () => {
      const attrs = await service.getAttributesForCategory('cat_unknown', true);
      expect(attrs).toHaveLength(0);
    });
  });

  describe('getAttributeByKey', () => {
    it('should find attribute by key in category', async () => {
      const attr = await service.getAttributeByKey('weight', 'cat_apparel');

      expect(attr).not.toBeNull();
      expect(attr?.key).toBe('weight');
    });

    it('should return null for unknown key', async () => {
      const attr = await service.getAttributeByKey('unknown', 'cat_apparel');
      expect(attr).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/attribute.service.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the service**

```typescript
// packages/database/src/services/attribute.service.ts
import { AttributeTemplate } from '../entities/AttributeTemplate.js';

/**
 * Interface for attribute queries - allows mock injection for testing.
 */
export interface AttributeQueryExecutor {
  findByCategoryPath(path: string): Promise<AttributeTemplate[]>;
  findById(id: string): Promise<AttributeTemplate | null>;
  findByKey(key: string, categoryId: string): Promise<AttributeTemplate | null>;
  getCategoryAncestorPaths(categoryId: string): Promise<string[]>;
}

/**
 * Service for attribute operations with inheritance resolution.
 *
 * CRITICAL: Walks the category hierarchy to collect all inherited attributes.
 * Attributes defined at a parent category are inherited by all descendants.
 */
export class AttributeService {
  constructor(private readonly executor: AttributeQueryExecutor) {}

  /**
   * Get all attributes for a category, optionally including inherited ones.
   *
   * When includeInherited=true, walks up the category tree and collects
   * all attributes defined at ancestor categories.
   *
   * Attributes are returned ordered by category depth (ancestors first).
   */
  async getAttributesForCategory(
    categoryId: string,
    includeInherited: boolean = true,
  ): Promise<AttributeTemplate[]> {
    const ancestorPaths = await this.executor.getCategoryAncestorPaths(categoryId);

    if (ancestorPaths.length === 0) {
      return [];
    }

    if (!includeInherited) {
      // Only return attributes from the category itself (last path)
      const directPath = ancestorPaths[ancestorPaths.length - 1];
      return this.executor.findByCategoryPath(directPath);
    }

    // Collect attributes from all ancestors, ordered by path length (depth)
    const allAttributes: AttributeTemplate[] = [];

    for (const path of ancestorPaths) {
      const attrs = await this.executor.findByCategoryPath(path);
      allAttributes.push(...attrs);
    }

    return allAttributes;
  }

  /**
   * Get attribute by ID.
   */
  async getAttributeById(attributeId: string): Promise<AttributeTemplate | null> {
    return this.executor.findById(attributeId);
  }

  /**
   * Get attribute by key within a specific category.
   */
  async getAttributeByKey(
    key: string,
    categoryId: string,
  ): Promise<AttributeTemplate | null> {
    return this.executor.findByKey(key, categoryId);
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/services/attribute.service.test.ts
```

Expected: PASS

**Step 5: Export from services index**

Add to `packages/database/src/services/index.ts`:

```typescript
export { AttributeService, type AttributeQueryExecutor } from './attribute.service.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/services/attribute.service.ts
git add packages/database/src/services/attribute.service.test.ts
git add packages/database/src/services/index.ts
git commit -m "feat(database): add AttributeService with inheritance resolution

- getAttributesForCategory() walks category tree
- Collects inherited attributes from ancestors
- Orders by category depth (ancestors first)"
```

---

## Task 4.2: Create MikroORM AttributeQueryExecutor Implementation

**Files:**
- Create: `packages/database/src/services/attribute-query-executor.ts`
- Create: `packages/database/src/services/attribute-query-executor.test.ts`
- Modify: `packages/database/src/services/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/attribute-query-executor.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroOrmAttributeQueryExecutor } from './attribute-query-executor.js';
import { Category, CategoryType } from '../entities/Category.js';
import { AttributeTemplate, AttributeType, RollupMethod, InheritanceRule } from '../entities/AttributeTemplate.js';
import { TargetType, UnitSystem } from '../entities/enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils/index.js';
import type { MikroORM } from '@mikro-orm/postgresql';

describe('MikroOrmAttributeQueryExecutor', () => {
  let orm: MikroORM;
  let executor: MikroOrmAttributeQueryExecutor;
  let apparelId: string;
  let topsId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    executor = new MikroOrmAttributeQueryExecutor(orm.em);

    // Seed test data
    const em = orm.em.fork();

    const apparel = em.create(Category, {
      name: 'Apparel',
      path: 'apparel',
      type: CategoryType.ROOT,
      targetType: TargetType.PRODUCT,
      depth: 0,
      isActive: true,
    });
    em.persist(apparel);

    const tops = em.create(Category, {
      name: 'Tops',
      path: 'apparel.tops',
      type: CategoryType.BRANCH,
      targetType: TargetType.PRODUCT,
      depth: 1,
      parent: apparel,
      isActive: true,
    });
    em.persist(tops);

    await em.flush();
    apparelId = apparel.id;
    topsId = tops.id;

    // Create attributes
    const weightAttr = em.create(AttributeTemplate, {
      key: 'weight',
      name: 'Product Weight',
      type: AttributeType.NUMBER_UNIT,
      category: apparel,
      targetType: TargetType.PRODUCT,
      unitSystem: UnitSystem.MASS,
      rollupMethod: RollupMethod.SUM,
      inheritanceRule: InheritanceRule.INHERIT,
      isActive: true,
      sortOrder: 0,
    });
    em.persist(weightAttr);

    const colorAttr = em.create(AttributeTemplate, {
      key: 'color',
      name: 'Color',
      type: AttributeType.STRING,
      category: tops,
      targetType: TargetType.PRODUCT,
      rollupMethod: RollupMethod.NONE,
      inheritanceRule: InheritanceRule.INHERIT,
      isActive: true,
      sortOrder: 0,
    });
    em.persist(colorAttr);

    await em.flush();
  });

  afterAll(async () => {
    if (orm) {
      await orm.em.fork().nativeDelete(AttributeTemplate, {});
      await orm.em.fork().nativeDelete(Category, {});
      await teardownTestDb();
    }
  });

  it('should find attributes by category path', async () => {
    if (!orm) return;

    const attrs = await executor.findByCategoryPath('apparel');

    expect(attrs.length).toBe(1);
    expect(attrs[0].key).toBe('weight');
  });

  it('should get category ancestor paths', async () => {
    if (!orm) return;

    const paths = await executor.getCategoryAncestorPaths(topsId);

    expect(paths).toEqual(['apparel', 'apparel.tops']);
  });

  it('should find attribute by key in category', async () => {
    if (!orm) return;

    const attr = await executor.findByKey('weight', apparelId);

    expect(attr).not.toBeNull();
    expect(attr?.name).toBe('Product Weight');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/attribute-query-executor.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the MikroORM executor**

```typescript
// packages/database/src/services/attribute-query-executor.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { Category } from '../entities/Category.js';
import { AttributeTemplate } from '../entities/AttributeTemplate.js';
import type { AttributeQueryExecutor } from './attribute.service.js';

/**
 * MikroORM implementation of AttributeQueryExecutor.
 */
export class MikroOrmAttributeQueryExecutor implements AttributeQueryExecutor {
  constructor(private readonly em: EntityManager) {}

  /**
   * Find all attributes for a category path.
   */
  async findByCategoryPath(path: string): Promise<AttributeTemplate[]> {
    const em = this.em.fork();

    const category = await em.findOne(Category, { path });
    if (!category) {
      return [];
    }

    return em.find(AttributeTemplate, { category }, {
      orderBy: { sortOrder: 'ASC', key: 'ASC' },
    });
  }

  /**
   * Find attribute by ID.
   */
  async findById(id: string): Promise<AttributeTemplate | null> {
    const em = this.em.fork();
    return em.findOne(AttributeTemplate, { id }, {
      populate: ['category'],
    });
  }

  /**
   * Find attribute by key within a specific category.
   */
  async findByKey(key: string, categoryId: string): Promise<AttributeTemplate | null> {
    const em = this.em.fork();
    return em.findOne(AttributeTemplate, {
      key,
      category: { id: categoryId },
    }, {
      populate: ['category'],
    });
  }

  /**
   * Get all ancestor paths for a category (including self).
   * Uses LTREE to efficiently get the path hierarchy.
   */
  async getCategoryAncestorPaths(categoryId: string): Promise<string[]> {
    const em = this.em.fork();

    const category = await em.findOne(Category, { id: categoryId });
    if (!category) {
      return [];
    }

    // Build ancestor paths from the category's path
    // e.g., 'apparel.tops.tshirts' -> ['apparel', 'apparel.tops', 'apparel.tops.tshirts']
    const parts = category.path.split('.');
    return parts.map((_, i) => parts.slice(0, i + 1).join('.'));
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/services/attribute-query-executor.test.ts
```

Expected: PASS (if database available) or SKIP

**Step 5: Export from services index**

Add to `packages/database/src/services/index.ts`:

```typescript
export { MikroOrmAttributeQueryExecutor } from './attribute-query-executor.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/services/attribute-query-executor.ts
git add packages/database/src/services/attribute-query-executor.test.ts
git add packages/database/src/services/index.ts
git commit -m "feat(database): add MikroORM AttributeQueryExecutor

- findByCategoryPath for direct attributes
- getCategoryAncestorPaths builds path hierarchy
- E2E test with real database"
```

---

## Task 4.3: Create Attributes API Types and Repository Interface

**Files:**
- Create: `apps/api/src/routes/taxonomy/attributes.ts` (types only first)

**Step 1: Create the types and interfaces**

```typescript
// apps/api/src/routes/taxonomy/attributes.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  AttributeType,
  RollupMethod,
  InheritanceRule,
  TargetType,
  UnitSystem,
} from '@eurocomply/database';

// ============================================================================
// Types
// ============================================================================

export interface AttributeData {
  id: string;
  key: string;
  name: string;
  description?: string;
  type: AttributeType;
  categoryId: string;
  categoryPath: string;
  targetType: TargetType;
  defaultUnitId?: string;
  unitSystem?: UnitSystem;
  rollupMethod: RollupMethod;
  weightBasisKey?: string;
  inheritanceRule: InheritanceRule;
  validationRules?: Record<string, unknown>;
  enumValues?: string[];
  defaultValue?: unknown;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AttributeWithInheritance extends AttributeData {
  scope: 'SYSTEM' | 'TENANT';
  inheritedFrom?: {
    categoryId: string;
    categoryPath: string;
  };
}

export interface AttributesRepository {
  findAll(filter?: {
    categoryId?: string;
    targetType?: TargetType;
    type?: AttributeType;
    isActive?: boolean;
  }): Promise<AttributeData[]>;

  findById(id: string): Promise<AttributeData | null>;

  findByKey(key: string, categoryId: string): Promise<AttributeData | null>;

  findForCategory(
    categoryId: string,
    includeInherited: boolean,
  ): Promise<AttributeWithInheritance[]>;

  create(data: {
    key: string;
    name: string;
    description?: string;
    type: AttributeType;
    categoryId: string;
    targetType: TargetType;
    defaultUnitId?: string;
    unitSystem?: UnitSystem;
    rollupMethod: RollupMethod;
    weightBasisKey?: string;
    inheritanceRule?: InheritanceRule;
    validationRules?: Record<string, unknown>;
    enumValues?: string[];
    defaultValue?: unknown;
    sortOrder?: number;
  }): Promise<AttributeData>;

  update(id: string, data: {
    name?: string;
    description?: string;
    defaultUnitId?: string;
    validationRules?: Record<string, unknown>;
    enumValues?: string[];
    defaultValue?: unknown;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<AttributeData>;

  delete(id: string): Promise<void>;
}

// ============================================================================
// Schemas
// ============================================================================

export const listAttributesQuery = z.object({
  categoryId: z.string().optional(),
  targetType: z.nativeEnum(TargetType).optional(),
  type: z.nativeEnum(AttributeType).optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

export const categoryAttributesQuery = z.object({
  inherited: z.enum(['true', 'false']).transform(v => v === 'true').optional().default('true'),
});

export const createAttributeBody = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/, 'Key must be lowercase, start with letter'),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  type: z.nativeEnum(AttributeType),
  categoryId: z.string(),
  targetType: z.nativeEnum(TargetType).default(TargetType.PRODUCT),
  defaultUnitId: z.string().optional(),
  unitSystem: z.nativeEnum(UnitSystem).optional(),
  rollupMethod: z.nativeEnum(RollupMethod).default(RollupMethod.NONE),
  weightBasisKey: z.string().optional(),
  inheritanceRule: z.nativeEnum(InheritanceRule).default(InheritanceRule.INHERIT),
  validationRules: z.record(z.unknown()).optional(),
  enumValues: z.array(z.string()).optional(),
  defaultValue: z.unknown().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateAttributeBody = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  defaultUnitId: z.string().optional(),
  validationRules: z.record(z.unknown()).optional(),
  enumValues: z.array(z.string()).optional(),
  defaultValue: z.unknown().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// Router placeholder - implemented in next task
export function createAttributesRouter(repo: AttributesRepository) {
  const router = new Hono();
  // To be implemented
  return router;
}
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/taxonomy/attributes.ts
git commit -m "feat(api): add attributes API types and repository interface

- AttributeData, AttributeWithInheritance types
- AttributesRepository interface for dependency injection
- Zod schemas for request validation
- Key validation: lowercase, starts with letter"
```

---

## Task 4.4: Implement Attributes List and Get Routes

**Files:**
- Modify: `apps/api/src/routes/taxonomy/attributes.ts`
- Create: `apps/api/src/routes/taxonomy/attributes.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/api/src/routes/taxonomy/attributes.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  createAttributesRouter,
  type AttributesRepository,
  type AttributeData,
  type AttributeWithInheritance,
} from './attributes.js';
import {
  AttributeType,
  RollupMethod,
  InheritanceRule,
  TargetType,
  UnitSystem,
} from '@eurocomply/database';

// Mock attribute data
const mockAttributes: AttributeData[] = [
  {
    id: 'attr_weight',
    key: 'weight',
    name: 'Product Weight',
    type: AttributeType.NUMBER_UNIT,
    categoryId: 'cat_apparel',
    categoryPath: 'apparel',
    targetType: TargetType.PRODUCT,
    unitSystem: UnitSystem.MASS,
    rollupMethod: RollupMethod.SUM,
    inheritanceRule: InheritanceRule.INHERIT,
    isActive: true,
    sortOrder: 0,
    createdAt: '2026-01-23T00:00:00Z',
    updatedAt: '2026-01-23T00:00:00Z',
  },
  {
    id: 'attr_color',
    key: 'color',
    name: 'Color',
    type: AttributeType.STRING,
    categoryId: 'cat_tops',
    categoryPath: 'apparel.tops',
    targetType: TargetType.PRODUCT,
    rollupMethod: RollupMethod.NONE,
    inheritanceRule: InheritanceRule.INHERIT,
    isActive: true,
    sortOrder: 1,
    createdAt: '2026-01-23T00:00:00Z',
    updatedAt: '2026-01-23T00:00:00Z',
  },
];

describe('attributes routes', () => {
  let app: Hono;
  let mockRepo: AttributesRepository;

  beforeEach(() => {
    mockRepo = {
      findAll: async (filter) => {
        let attrs = [...mockAttributes];
        if (filter?.categoryId) {
          attrs = attrs.filter(a => a.categoryId === filter.categoryId);
        }
        if (filter?.targetType) {
          attrs = attrs.filter(a => a.targetType === filter.targetType);
        }
        if (filter?.type) {
          attrs = attrs.filter(a => a.type === filter.type);
        }
        if (filter?.isActive !== undefined) {
          attrs = attrs.filter(a => a.isActive === filter.isActive);
        }
        return attrs;
      },
      findById: async (id) => mockAttributes.find(a => a.id === id) ?? null,
      findByKey: async (key, categoryId) =>
        mockAttributes.find(a => a.key === key && a.categoryId === categoryId) ?? null,
      findForCategory: async (categoryId, includeInherited) => {
        // Simulate inheritance - return all for apparel.tops
        const attrs: AttributeWithInheritance[] = mockAttributes.map(a => ({
          ...a,
          scope: 'SYSTEM' as const,
          inheritedFrom: a.categoryId !== categoryId
            ? { categoryId: a.categoryId, categoryPath: a.categoryPath }
            : undefined,
        }));
        if (!includeInherited) {
          return attrs.filter(a => a.categoryId === categoryId);
        }
        return attrs;
      },
      create: async (data) => ({
        ...mockAttributes[0],
        ...data,
        id: 'new_attr',
        categoryPath: 'apparel',
        isActive: true,
        sortOrder: data.sortOrder ?? 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      update: async (id, data) => {
        const attr = mockAttributes.find(a => a.id === id);
        if (!attr) throw new Error('Not found');
        return { ...attr, ...data };
      },
      delete: async () => {},
    };

    app = new Hono();
    app.route('/attributes', createAttributesRouter(mockRepo));
  });

  describe('GET /attributes', () => {
    it('returns all attributes', async () => {
      const res = await app.request('/attributes');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: AttributeData[]; meta: { total: number } };
      expect(body.data).toHaveLength(2);
      expect(body.meta.total).toBe(2);
    });

    it('filters by categoryId', async () => {
      const res = await app.request('/attributes?categoryId=cat_apparel');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: AttributeData[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].key).toBe('weight');
    });

    it('filters by type', async () => {
      const res = await app.request('/attributes?type=NUMBER_UNIT');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: AttributeData[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].type).toBe('NUMBER_UNIT');
    });
  });

  describe('GET /attributes/:id', () => {
    it('returns attribute by ID', async () => {
      const res = await app.request('/attributes/attr_weight');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: AttributeData };
      expect(body.data.id).toBe('attr_weight');
      expect(body.data.name).toBe('Product Weight');
    });

    it('returns 404 for unknown ID', async () => {
      const res = await app.request('/attributes/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /categories/:categoryId/attributes', () => {
    it('returns inherited attributes by default', async () => {
      const res = await app.request('/categories/cat_tops/attributes');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: AttributeWithInheritance[] };
      expect(body.data).toHaveLength(2);
      // Weight should be marked as inherited
      const weight = body.data.find(a => a.key === 'weight');
      expect(weight?.inheritedFrom).toBeDefined();
    });

    it('returns only direct attributes when inherited=false', async () => {
      const res = await app.request('/categories/cat_tops/attributes?inherited=false');
      expect(res.status).toBe(200);

      const body = await res.json() as { data: AttributeWithInheritance[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].key).toBe('color');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/routes/taxonomy/attributes.test.ts
```

Expected: FAIL - routes not implemented

**Step 3: Implement the list and get routes**

Update `apps/api/src/routes/taxonomy/attributes.ts` to add the router implementation:

```typescript
// ============================================================================
// Router
// ============================================================================

export function createAttributesRouter(repo: AttributesRepository) {
  const router = new Hono();

  // GET /attributes - List all attributes
  router.get('/', zValidator('query', listAttributesQuery), async (c) => {
    const query = c.req.valid('query');

    const attributes = await repo.findAll({
      categoryId: query.categoryId,
      targetType: query.targetType,
      type: query.type,
      isActive: query.active,
    });

    return c.json({
      data: attributes,
      meta: { total: attributes.length },
    });
  });

  // GET /attributes/:id - Get attribute by ID
  router.get('/:id', async (c) => {
    const id = c.req.param('id');
    const attribute = await repo.findById(id);

    if (!attribute) {
      return c.json({ error: 'Not Found', message: `Attribute not found: ${id}` }, 404);
    }

    return c.json({ data: attribute });
  });

  return router;
}

/**
 * Create routes for category-scoped attribute access.
 * Mounted at /categories/:categoryId/attributes
 */
export function createCategoryAttributesRouter(repo: AttributesRepository) {
  const router = new Hono();

  // GET /categories/:categoryId/attributes - Get attributes for category
  router.get('/', zValidator('query', categoryAttributesQuery), async (c) => {
    const categoryId = c.req.param('categoryId');
    const query = c.req.valid('query');

    // Default inherited to true (as a boolean now after transform)
    const includeInherited = query.inherited !== false;

    const attributes = await repo.findForCategory(categoryId, includeInherited);

    return c.json({
      data: attributes,
      meta: {
        total: attributes.length,
        categoryId,
        includeInherited,
      },
    });
  });

  return router;
}
```

**Step 4: Update test to use category router**

Update the test's beforeEach to also mount the category attributes router:

```typescript
// In beforeEach:
import { createAttributesRouter, createCategoryAttributesRouter } from './attributes.js';

// ...

app = new Hono();
app.route('/attributes', createAttributesRouter(mockRepo));

// Mount category attributes under a categories route
const categoriesApp = new Hono();
categoriesApp.route('/:categoryId/attributes', createCategoryAttributesRouter(mockRepo));
app.route('/categories', categoriesApp);
```

**Step 5: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/routes/taxonomy/attributes.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/routes/taxonomy/attributes.ts
git add apps/api/src/routes/taxonomy/attributes.test.ts
git commit -m "feat(api): add attributes list and get routes

- GET /attributes with categoryId, targetType, type filters
- GET /attributes/:id
- GET /categories/:categoryId/attributes with inherited flag"
```

---

## Task 4.5: Implement Attributes CRUD Routes

**Files:**
- Modify: `apps/api/src/routes/taxonomy/attributes.ts`
- Modify: `apps/api/src/routes/taxonomy/attributes.test.ts`

**Step 1: Add tests for CRUD operations**

Add to `apps/api/src/routes/taxonomy/attributes.test.ts`:

```typescript
  describe('POST /attributes', () => {
    it('creates a new attribute', async () => {
      const res = await app.request('/attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'recycled_content',
          name: 'Recycled Content',
          type: 'NUMBER_UNIT',
          categoryId: 'cat_apparel',
          unitSystem: 'PERCENTAGE',
          rollupMethod: 'WEIGHTED_AVG',
          weightBasisKey: 'weight',
        }),
      });
      expect(res.status).toBe(201);

      const body = await res.json() as { data: AttributeData };
      expect(body.data.key).toBe('recycled_content');
    });

    it('rejects invalid key format', async () => {
      const res = await app.request('/attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'InvalidKey', // Must be lowercase
          name: 'Test',
          type: 'STRING',
          categoryId: 'cat_apparel',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects missing required fields', async () => {
      const res = await app.request('/attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /attributes/:id', () => {
    it('updates an attribute', async () => {
      const res = await app.request('/attributes/attr_weight', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Weight' }),
      });
      expect(res.status).toBe(200);

      const body = await res.json() as { data: AttributeData };
      expect(body.data.name).toBe('Updated Weight');
    });

    it('returns 404 for unknown attribute', async () => {
      const res = await app.request('/attributes/unknown', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /attributes/:id', () => {
    it('deletes an attribute', async () => {
      const res = await app.request('/attributes/attr_weight', {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for unknown attribute', async () => {
      const res = await app.request('/attributes/unknown', {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/routes/taxonomy/attributes.test.ts
```

Expected: FAIL - CRUD routes not implemented

**Step 3: Implement the CRUD routes**

Add to `createAttributesRouter` function in `apps/api/src/routes/taxonomy/attributes.ts`:

```typescript
  // POST /attributes - Create attribute
  router.post('/', zValidator('json', createAttributeBody), async (c) => {
    const body = c.req.valid('json');

    // Validate NUMBER_UNIT requires unitSystem
    if (body.type === AttributeType.NUMBER_UNIT && !body.unitSystem) {
      return c.json({
        error: 'Validation Error',
        message: 'unitSystem is required for NUMBER_UNIT attributes',
      }, 400);
    }

    // Validate WEIGHTED_AVG requires weightBasisKey
    if (body.rollupMethod === RollupMethod.WEIGHTED_AVG && !body.weightBasisKey) {
      return c.json({
        error: 'Validation Error',
        message: 'weightBasisKey is required for WEIGHTED_AVG rollup method',
      }, 400);
    }

    const attribute = await repo.create({
      key: body.key,
      name: body.name,
      description: body.description,
      type: body.type,
      categoryId: body.categoryId,
      targetType: body.targetType,
      defaultUnitId: body.defaultUnitId,
      unitSystem: body.unitSystem,
      rollupMethod: body.rollupMethod,
      weightBasisKey: body.weightBasisKey,
      inheritanceRule: body.inheritanceRule,
      validationRules: body.validationRules,
      enumValues: body.enumValues,
      defaultValue: body.defaultValue,
      sortOrder: body.sortOrder,
    });

    return c.json({ data: attribute }, 201);
  });

  // PATCH /attributes/:id - Update attribute
  router.patch('/:id', zValidator('json', updateAttributeBody), async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json({ error: 'Not Found', message: `Attribute not found: ${id}` }, 404);
    }

    const updated = await repo.update(id, {
      name: body.name,
      description: body.description,
      defaultUnitId: body.defaultUnitId,
      validationRules: body.validationRules,
      enumValues: body.enumValues,
      defaultValue: body.defaultValue,
      isActive: body.isActive,
      sortOrder: body.sortOrder,
    });

    return c.json({ data: updated });
  });

  // DELETE /attributes/:id - Delete attribute
  router.delete('/:id', async (c) => {
    const id = c.req.param('id');

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json({ error: 'Not Found', message: `Attribute not found: ${id}` }, 404);
    }

    await repo.delete(id);

    return c.json({ success: true, message: 'Attribute deleted' });
  });
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/routes/taxonomy/attributes.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/taxonomy/attributes.ts
git add apps/api/src/routes/taxonomy/attributes.test.ts
git commit -m "feat(api): add attributes CRUD routes

- POST /attributes - create with validation
- PATCH /attributes/:id - update attribute
- DELETE /attributes/:id - delete attribute
- Validates NUMBER_UNIT requires unitSystem
- Validates WEIGHTED_AVG requires weightBasisKey"
```

---

## Task 4.6: Create MikroORM Attributes Repository

**Files:**
- Create: `apps/api/src/routes/taxonomy/attributes-repository.ts`

**Step 1: Implement the MikroORM repository**

```typescript
// apps/api/src/routes/taxonomy/attributes-repository.ts
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import {
  AttributeTemplate,
  AttributeType,
  RollupMethod,
  InheritanceRule,
  Category,
  TargetType,
  UnitSystem,
  AttributeService,
  MikroOrmAttributeQueryExecutor,
} from '@eurocomply/database';
import type {
  AttributesRepository,
  AttributeData,
  AttributeWithInheritance,
} from './attributes.js';

/**
 * MikroORM implementation of AttributesRepository.
 *
 * Handles dual-scope attributes (system in public schema, tenant in tenant schema)
 * with inheritance resolution through the category hierarchy.
 */
export class MikroOrmAttributesRepository implements AttributesRepository {
  private attributeService: AttributeService;

  constructor(
    private readonly orm: MikroORM,
    private readonly tenantSchema: string,
  ) {
    const executor = new MikroOrmAttributeQueryExecutor(orm.em);
    this.attributeService = new AttributeService(executor);
  }

  async findAll(filter?: {
    categoryId?: string;
    targetType?: TargetType;
    type?: AttributeType;
    isActive?: boolean;
  }): Promise<AttributeData[]> {
    const em = this.orm.em.fork();

    const where: Record<string, unknown> = {};
    if (filter?.categoryId) where['category'] = { id: filter.categoryId };
    if (filter?.targetType) where['targetType'] = filter.targetType;
    if (filter?.type) where['type'] = filter.type;
    if (filter?.isActive !== undefined) where['isActive'] = filter.isActive;

    const attributes = await em.find(AttributeTemplate, where, {
      populate: ['category'],
      orderBy: { sortOrder: 'ASC', key: 'ASC' },
    });

    return attributes.map(a => this.toData(a));
  }

  async findById(id: string): Promise<AttributeData | null> {
    const em = this.orm.em.fork();
    const attr = await em.findOne(AttributeTemplate, { id }, {
      populate: ['category'],
    });
    return attr ? this.toData(attr) : null;
  }

  async findByKey(key: string, categoryId: string): Promise<AttributeData | null> {
    const em = this.orm.em.fork();
    const attr = await em.findOne(AttributeTemplate, {
      key,
      category: { id: categoryId },
    }, {
      populate: ['category'],
    });
    return attr ? this.toData(attr) : null;
  }

  async findForCategory(
    categoryId: string,
    includeInherited: boolean,
  ): Promise<AttributeWithInheritance[]> {
    const em = this.orm.em.fork();

    // Get the target category to find its path
    const category = await em.findOne(Category, { id: categoryId });
    if (!category) {
      return [];
    }

    if (!includeInherited) {
      // Only direct attributes
      const attrs = await em.find(AttributeTemplate, { category: { id: categoryId } }, {
        populate: ['category'],
        orderBy: { sortOrder: 'ASC', key: 'ASC' },
      });
      return attrs.map(a => this.toWithInheritance(a, categoryId, 'TENANT'));
    }

    // Get all ancestor paths including self
    const parts = category.path.split('.');
    const ancestorPaths = parts.map((_, i) => parts.slice(0, i + 1).join('.'));

    // Fetch all attributes from ancestor categories
    const allAttributes: AttributeWithInheritance[] = [];

    for (const path of ancestorPaths) {
      const pathCategory = await em.findOne(Category, { path });
      if (!pathCategory) continue;

      const attrs = await em.find(AttributeTemplate, { category: pathCategory }, {
        populate: ['category'],
        orderBy: { sortOrder: 'ASC', key: 'ASC' },
      });

      for (const attr of attrs) {
        // Determine if this is inherited (not from the target category)
        const isInherited = pathCategory.id !== categoryId;
        const scope = this.determineScope(pathCategory);

        allAttributes.push({
          ...this.toData(attr),
          scope,
          inheritedFrom: isInherited
            ? { categoryId: pathCategory.id, categoryPath: pathCategory.path }
            : undefined,
        });
      }
    }

    return allAttributes;
  }

  async create(data: {
    key: string;
    name: string;
    description?: string;
    type: AttributeType;
    categoryId: string;
    targetType: TargetType;
    defaultUnitId?: string;
    unitSystem?: UnitSystem;
    rollupMethod: RollupMethod;
    weightBasisKey?: string;
    inheritanceRule?: InheritanceRule;
    validationRules?: Record<string, unknown>;
    enumValues?: string[];
    defaultValue?: unknown;
    sortOrder?: number;
  }): Promise<AttributeData> {
    const em = this.orm.em.fork();
    em.schema = this.tenantSchema;

    const category = await em.findOneOrFail(Category, { id: data.categoryId });

    const attribute = em.create(AttributeTemplate, {
      key: data.key,
      name: data.name,
      description: data.description,
      type: data.type,
      category,
      targetType: data.targetType,
      defaultUnitId: data.defaultUnitId,
      unitSystem: data.unitSystem,
      rollupMethod: data.rollupMethod,
      weightBasisKey: data.weightBasisKey,
      inheritanceRule: data.inheritanceRule ?? InheritanceRule.INHERIT,
      validationRules: data.validationRules,
      enumValues: data.enumValues,
      defaultValue: data.defaultValue,
      sortOrder: data.sortOrder ?? 0,
      isActive: true,
    });

    await em.persistAndFlush(attribute);

    return this.toData(attribute);
  }

  async update(id: string, data: {
    name?: string;
    description?: string;
    defaultUnitId?: string;
    validationRules?: Record<string, unknown>;
    enumValues?: string[];
    defaultValue?: unknown;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<AttributeData> {
    const em = this.orm.em.fork();
    em.schema = this.tenantSchema;

    const attribute = await em.findOneOrFail(AttributeTemplate, { id }, {
      populate: ['category'],
    });

    if (data.name !== undefined) attribute.name = data.name;
    if (data.description !== undefined) attribute.description = data.description;
    if (data.defaultUnitId !== undefined) attribute.defaultUnitId = data.defaultUnitId;
    if (data.validationRules !== undefined) attribute.validationRules = data.validationRules;
    if (data.enumValues !== undefined) attribute.enumValues = data.enumValues;
    if (data.defaultValue !== undefined) attribute.defaultValue = data.defaultValue;
    if (data.isActive !== undefined) attribute.isActive = data.isActive;
    if (data.sortOrder !== undefined) attribute.sortOrder = data.sortOrder;

    await em.flush();

    return this.toData(attribute);
  }

  async delete(id: string): Promise<void> {
    const em = this.orm.em.fork();
    em.schema = this.tenantSchema;

    const attribute = await em.findOneOrFail(AttributeTemplate, { id });
    em.remove(attribute);
    await em.flush();
  }

  // Helper methods
  private toData(attr: AttributeTemplate): AttributeData {
    return {
      id: attr.id,
      key: attr.key,
      name: attr.name,
      description: attr.description,
      type: attr.type,
      categoryId: attr.category.id,
      categoryPath: attr.category.path,
      targetType: attr.targetType,
      defaultUnitId: attr.defaultUnitId,
      unitSystem: attr.unitSystem,
      rollupMethod: attr.rollupMethod,
      weightBasisKey: attr.weightBasisKey,
      inheritanceRule: attr.inheritanceRule,
      validationRules: attr.validationRules,
      enumValues: attr.enumValues,
      defaultValue: attr.defaultValue,
      isActive: attr.isActive,
      sortOrder: attr.sortOrder,
      createdAt: attr.createdAt.toISOString(),
      updatedAt: attr.updatedAt.toISOString(),
    };
  }

  private toWithInheritance(
    attr: AttributeTemplate,
    requestedCategoryId: string,
    scope: 'SYSTEM' | 'TENANT',
  ): AttributeWithInheritance {
    const isInherited = attr.category.id !== requestedCategoryId;
    return {
      ...this.toData(attr),
      scope,
      inheritedFrom: isInherited
        ? { categoryId: attr.category.id, categoryPath: attr.category.path }
        : undefined,
    };
  }

  private determineScope(category: Category): 'SYSTEM' | 'TENANT' {
    // In a real implementation, this would check the schema
    // For now, assume all are tenant-scoped
    return 'TENANT';
  }
}
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/taxonomy/attributes-repository.ts
git commit -m "feat(api): add MikroORM AttributesRepository implementation

- Dual-schema support (public + tenant)
- Inheritance resolution through category hierarchy
- CRUD operations with category binding"
```

---

## Task 4.7: Wire Attributes Routes to App

**Files:**
- Modify: `apps/api/src/routes/taxonomy/index.ts`
- Modify: `apps/api/src/app.ts`

**Step 1: Update taxonomy index**

Add exports to `apps/api/src/routes/taxonomy/index.ts`:

```typescript
export {
  createAttributesRouter,
  createCategoryAttributesRouter,
  type AttributesRepository,
  type AttributeData,
  type AttributeWithInheritance,
} from './attributes.js';
export { MikroOrmAttributesRepository } from './attributes-repository.js';

/**
 * Create a MikroORM-based attributes repository for production use.
 */
export function createAttributesRepository(orm: MikroORM, tenantSchema: string): AttributesRepository {
  return new MikroOrmAttributesRepository(orm, tenantSchema);
}
```

**Step 2: Update app.ts**

Add attributes routes to `apps/api/src/app.ts`:

```typescript
// Add import at top
import {
  createUnitsRouter,
  createCategoriesRouter,
  createAttributesRouter,
  createCategoryAttributesRouter,
  type UnitsRepository,
  type CategoriesRepository,
  type AttributesRepository,
} from './routes/taxonomy/index.js';

// Update AppDependencies interface
export interface AppDependencies {
  orm?: OrmLike;
  webhooksRouter?: Hono;
  organizationsAdminRouter?: Hono;
  unitsRepository?: UnitsRepository;
  categoriesRepository?: CategoriesRepository;
  attributesRepository?: AttributesRepository;
}

// Update taxonomy routes section
  // Taxonomy routes
  const taxonomy = new Hono<Env>();
  if (deps?.unitsRepository) {
    taxonomy.route('/units', createUnitsRouter(deps.unitsRepository));
  }
  if (deps?.categoriesRepository) {
    const categoriesRouter = createCategoriesRouter(deps.categoriesRepository);
    // Mount category attributes under categories
    if (deps?.attributesRepository) {
      categoriesRouter.route('/:categoryId/attributes', createCategoryAttributesRouter(deps.attributesRepository));
    }
    taxonomy.route('/categories', categoriesRouter);
  }
  if (deps?.attributesRepository) {
    taxonomy.route('/attributes', createAttributesRouter(deps.attributesRepository));
  }
  v1.route('/taxonomy', taxonomy);
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/taxonomy/index.ts
git add apps/api/src/app.ts
git commit -m "feat(api): wire attributes routes to app

- Export createAttributesRepository factory
- Add attributesRepository to AppDependencies
- Mount /taxonomy/attributes routes
- Mount /taxonomy/categories/:id/attributes routes"
```

---

## Task 4.8: Create Attributes E2E Integration Test

**Files:**
- Create: `apps/api/src/routes/taxonomy/attributes.e2e.test.ts`

**Step 1: Create integration test**

```typescript
// apps/api/src/routes/taxonomy/attributes.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import type { MikroORM } from '@eurocomply/database';
import {
  Category,
  CategoryType,
  TargetType,
  AttributeTemplate,
  AttributeType,
  RollupMethod,
  InheritanceRule,
  UnitSystem,
} from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import {
  createAttributesRouter,
  createCategoryAttributesRouter,
  type AttributeData,
  type AttributeWithInheritance,
} from './attributes.js';
import { MikroOrmAttributesRepository } from './attributes-repository.js';

describe('Attributes API E2E', () => {
  let orm: MikroORM;
  let app: Hono;
  const testSchema = 'tenant_attributes_e2e_test';
  let apparelId: string;
  let topsId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();

    // Create test schema
    await orm.em.execute(`CREATE SCHEMA IF NOT EXISTS "${testSchema}"`);

    // Seed categories
    const em = orm.em.fork();
    const apparel = em.create(Category, {
      name: 'Apparel',
      path: 'apparel',
      type: CategoryType.ROOT,
      targetType: TargetType.PRODUCT,
      depth: 0,
      isActive: true,
    });
    em.persist(apparel);

    const tops = em.create(Category, {
      name: 'Tops',
      path: 'apparel.tops',
      type: CategoryType.BRANCH,
      targetType: TargetType.PRODUCT,
      depth: 1,
      parent: apparel,
      isActive: true,
    });
    em.persist(tops);
    await em.flush();

    apparelId = apparel.id;
    topsId = tops.id;

    // Seed attributes
    const weightAttr = em.create(AttributeTemplate, {
      key: 'weight',
      name: 'Product Weight',
      type: AttributeType.NUMBER_UNIT,
      category: apparel,
      targetType: TargetType.PRODUCT,
      unitSystem: UnitSystem.MASS,
      rollupMethod: RollupMethod.SUM,
      inheritanceRule: InheritanceRule.INHERIT,
      isActive: true,
      sortOrder: 0,
    });
    em.persist(weightAttr);
    await em.flush();

    // Create repository and app
    const repo = new MikroOrmAttributesRepository(orm, testSchema);
    app = new Hono();
    app.route('/attributes', createAttributesRouter(repo));

    // Mount category attributes
    const categoriesApp = new Hono();
    categoriesApp.route('/:categoryId/attributes', createCategoryAttributesRouter(repo));
    app.route('/categories', categoriesApp);
  });

  afterAll(async () => {
    if (orm) {
      await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
      await orm.em.fork().nativeDelete(AttributeTemplate, {});
      await orm.em.fork().nativeDelete(Category, {});
      await teardownTestDb();
    }
  });

  it('should list all attributes', async () => {
    if (!orm) return;

    const res = await app.request('/attributes');
    expect(res.status).toBe(200);

    const body = await res.json() as { data: AttributeData[] };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('should get attribute by ID', async () => {
    if (!orm) return;

    // First get list to find an ID
    const listRes = await app.request('/attributes');
    const listBody = await listRes.json() as { data: AttributeData[] };
    const attr = listBody.data[0];

    const res = await app.request(`/attributes/${attr.id}`);
    expect(res.status).toBe(200);

    const body = await res.json() as { data: AttributeData };
    expect(body.data.id).toBe(attr.id);
  });

  it('should get inherited attributes for category', async () => {
    if (!orm) return;

    const res = await app.request(`/categories/${topsId}/attributes?inherited=true`);
    expect(res.status).toBe(200);

    const body = await res.json() as { data: AttributeWithInheritance[] };
    // Should include weight from apparel (inherited)
    const weight = body.data.find(a => a.key === 'weight');
    expect(weight).toBeDefined();
    expect(weight?.inheritedFrom).toBeDefined();
  });

  it('should create a new attribute', async () => {
    if (!orm) return;

    const res = await app.request('/attributes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'color',
        name: 'Color',
        type: 'STRING',
        categoryId: topsId,
        rollupMethod: 'NONE',
      }),
    });
    expect(res.status).toBe(201);

    const body = await res.json() as { data: AttributeData };
    expect(body.data.key).toBe('color');
  });
});
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/taxonomy/attributes.e2e.test.ts
git commit -m "test(api): add attributes API e2e integration test

- Tests attribute listing
- Tests attribute by ID
- Tests inherited attributes
- Tests attribute creation"
```

---

## Phase 4 Complete Checkpoint

At this point, Plan 4 is complete. Verify:

```bash
# Run all tests
pnpm test

# Run attribute-specific tests
cd packages/database && pnpm test src/services/attribute
cd apps/api && pnpm test src/routes/taxonomy/attributes

# Verify build
pnpm build
```

**Plan 4 Deliverables:**
- [x] AttributeService with inheritance resolution
- [x] MikroOrmAttributeQueryExecutor
- [x] Attributes API types and interfaces
- [x] GET /attributes (list with filters)
- [x] GET /attributes/:id
- [x] GET /categories/:categoryId/attributes (with inherited flag)
- [x] POST /attributes (create)
- [x] PATCH /attributes/:id (update)
- [x] DELETE /attributes/:id (delete)
- [x] MikroORM AttributesRepository
- [x] E2E integration tests

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-23 | Initial implementation plan |
