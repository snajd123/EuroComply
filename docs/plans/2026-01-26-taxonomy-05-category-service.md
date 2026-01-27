# Taxonomy Plan 5: Category Services (Dual Model)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement dual category services for the Unified Taxonomy architecture:
- **SystemCategoryService**: CRUD operations for system categories in `public.category` (admin-only)
- **TenantCategoryService**: CRUD operations for tenant categories in `tenant_*.tenant_category`, including adoption management

**Architecture:**
- **System Categories** (`public.category`): Platform-managed category hierarchy seeded from JSON bundles, read-only for tenants
- **Tenant Categories** (`tenant_*.tenant_category`): Tenant-owned categories with optional links to system categories
- **Category Adoption** (`tenant_*.category_adoption`): Links tenant categories to system categories with LIVE/FROZEN/DETACHED modes

**Already Implemented:**
- `TenantCategory` entity: `packages/database/src/entities/TenantCategory.ts`
- `CategoryAdoption` entity: `packages/database/src/entities/CategoryAdoption.ts`
- `LinkMode` enum: LIVE, FROZEN, DETACHED (in CategoryAdoption.ts)

**Tech Stack:** MikroORM, PostgreSQL LTREE, Hono

**Prerequisites:** Plans 1-4 completed. Category entity exists in public schema.

**Reference:** See `docs/plans/2026-01-23-taxonomy-engine-design.md` Section 2

---

## Tenant Category Model

### Link Modes

When a tenant creates a category linked to a system category, they choose a link mode:

| Mode | System Updates | Notifications | Use Case |
|------|----------------|---------------|----------|
| **LIVE** | Auto-applied to tenant category | Yes | "Keep me current with regulations" |
| **FROZEN** | Ignored (snapshot at version) | Yes, can review & merge | "I want control over when to update" |
| **DETACHED** | Ignored permanently | No | "I've diverged, don't notify me" |

### Permissions

- `design:manager` required to create, edit, or delete tenant categories
- `design:view` sufficient for browsing and assigning to products

### Deletion Rules

- Cannot delete a category with assigned products
- Error returns count of affected products
- Must reassign products first

---

## API Integration Patterns (MUST FOLLOW)

> **CRITICAL:** All API implementations MUST follow existing codebase patterns from `apps/api/src/`.

### Route Types in This Plan

**1. Public Taxonomy Routes (No Auth)**
Category listing, hierarchy traversal - public reference data:
```typescript
// File: apps/api/src/routes/taxonomy/index.ts
const taxonomy = new Hono<Env>();
taxonomy.route('/categories', createCategoriesRouter(deps.categoriesRepository));
v1.route('/taxonomy', taxonomy);  // No middleware - public routes
```

**2. Tenant-Scoped Adoption Routes (REQUIRES AUTH)**
Category adoption requires tenant context + authorization:
```typescript
// File: apps/api/src/app.ts
v1.use('/categories/adoption/*', createTenantMiddlewareWithApiKeys(deps.orm.em));
v1.use('/categories/adoption/*', userMiddleware);
v1.route('/categories/adoption', createCategoryAdoptionRouter({ orm: deps.orm }));
```

### Authorization Pattern (for tenant routes)
```typescript
import { authorize } from '../../middleware/authorize.js';

// Adoption requires design:edit authority
router.post('/:id/adopt', authorize('design', 'edit'), async (c) => { ... });
router.delete('/:id/adopt', authorize('design', 'edit'), async (c) => { ... });
router.get('/', authorize('design', 'view'), async (c) => { ... });
```

### Tenant Isolation Pattern (CRITICAL)
```typescript
router.post('/:id/adopt', authorize('design', 'edit'), async (c) => {
  const schema = c.get('tenantSchema')!;
  const em = orm.em.fork({ schema });

  // ALWAYS use transaction with SET search_path for tenant data
  const result = await em.transactional(async (txEm) => {
    await txEm.execute(`SET search_path TO "${schema}", public`);
    // ... operations
  });
});
```

### Response Format (MUST MATCH)
```typescript
// Success
c.json({ data: entity })
c.json({ data: items, meta: { total: items.length } })

// Errors
c.json({ error: 'Not Found', message: 'Category not found' }, 404)
c.json({ error: 'Forbidden', message: 'Insufficient permissions', workspace: 'design', action: 'edit' }, 403)
c.json({ error: 'Conflict', message: 'Category already adopted' }, 409)
```

### Env Type (from apps/api/src/app.ts)
```typescript
export type Env = {
  Variables: {
    tenantSchema?: string;
    userId?: string;
    user?: User;
    membership?: OrganizationUser;
  };
};
```

---

## Task 1a: Create SystemCategoryService

> **Purpose:** Manages system categories in `public.category` - admin-only operations for platform-managed taxonomy.

**Files:**
- Create: `packages/database/src/services/system-category.service.ts`
- Test: `packages/database/src/services/system-category.service.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/system-category.service.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { SystemCategoryService } from './system-category.service.js';
import { Category, CategoryType } from '../entities/Category.js';
import { TargetType } from '../entities/enums/index.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('SystemCategoryService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: SystemCategoryService;

  beforeAll(async () => {
    orm = await createTestOrm([Category]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    service = new SystemCategoryService(em);
    await em.nativeDelete(Category, {});
  });

  describe('create', () => {
    it('should create a root category', async () => {
      const category = await service.create({
        name: 'Apparel',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      expect(category.id).toBeDefined();
      expect(category.path).toBe('apparel');
      expect(category.depth).toBe(0);
    });

    it('should create a child category with correct path', async () => {
      const root = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const child = await service.create({
        name: 'Batteries',
        parentId: root.id,
        type: CategoryType.BRANCH,
        targetType: TargetType.PRODUCT,
      });

      expect(child.path).toBe('electronics.batteries');
      expect(child.depth).toBe(1);
      expect(child.parent?.id).toBe(root.id);
    });

    it('should throw user-friendly error on slug collision', async () => {
      const root = await service.create({
        name: 'Apparel',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      await service.create({
        name: 'T-Shirts',
        parentId: root.id,
        type: CategoryType.LEAF,
        targetType: TargetType.PRODUCT,
      });

      // Try to create "T Shirts" which slugifies to same path
      await expect(
        service.create({
          name: 'T Shirts',  // Different name, same slug
          parentId: root.id,
          type: CategoryType.LEAF,
          targetType: TargetType.PRODUCT,
        })
      ).rejects.toThrow('Category path "apparel.t_shirts" already exists');
    });
  });

  describe('findByPath', () => {
    it('should find category by LTREE path', async () => {
      await service.create({
        name: 'Apparel',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const found = await service.findByPath('apparel');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Apparel');
    });
  });

  describe('getAncestors', () => {
    it('should return all ancestors of a category', async () => {
      const root = await service.create({
        name: 'Apparel',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const branch = await service.create({
        name: 'Tops',
        parentId: root.id,
        type: CategoryType.BRANCH,
        targetType: TargetType.PRODUCT,
      });

      const leaf = await service.create({
        name: 'T-Shirts',
        parentId: branch.id,
        type: CategoryType.LEAF,
        targetType: TargetType.PRODUCT,
      });

      const ancestors = await service.getAncestors(leaf.id);

      expect(ancestors).toHaveLength(2);
      expect(ancestors.map(a => a.name)).toEqual(['Apparel', 'Tops']);
    });
  });

  describe('getDescendants', () => {
    it('should return all descendants of a category', async () => {
      const root = await service.create({
        name: 'Apparel',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const tops = await service.create({
        name: 'Tops',
        parentId: root.id,
        type: CategoryType.BRANCH,
        targetType: TargetType.PRODUCT,
      });

      await service.create({
        name: 'T-Shirts',
        parentId: tops.id,
        type: CategoryType.LEAF,
        targetType: TargetType.PRODUCT,
      });

      await service.create({
        name: 'Blouses',
        parentId: tops.id,
        type: CategoryType.LEAF,
        targetType: TargetType.PRODUCT,
      });

      const descendants = await service.getDescendants(root.id);

      expect(descendants).toHaveLength(3);
    });
  });

  describe('getRoots', () => {
    it('should return root categories filtered by target type', async () => {
      await service.create({
        name: 'Apparel',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      await service.create({
        name: 'Materials',
        type: CategoryType.ROOT,
        targetType: TargetType.MATERIAL,
      });

      const productRoots = await service.getRoots(TargetType.PRODUCT);
      expect(productRoots).toHaveLength(1);
      expect(productRoots[0].name).toBe('Apparel');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test system-category.service.test.ts
```

Expected: FAIL with "Cannot find module './system-category.service.js'"

**Step 3: Create the service**

```typescript
// packages/database/src/services/system-category.service.ts
import { EntityManager } from '@mikro-orm/core';
import { Category, CategoryType } from '../entities/Category.js';
import { TargetType } from '../entities/enums/index.js';

export interface CreateSystemCategoryInput {
  name: string;
  description?: string;
  parentId?: string;
  type: CategoryType;
  targetType: TargetType;
  defaultProfileId?: string;
}

export interface UpdateSystemCategoryInput {
  name?: string;
  description?: string;
  type?: CategoryType;
  defaultProfileId?: string;
  isActive?: boolean;
}

/**
 * SystemCategoryService - Manages system categories in public.category (admin-only).
 *
 * This service operates on the PUBLIC schema only. For tenant categories,
 * use TenantCategoryService instead.
 *
 * PREREQUISITE: Ensure the category.path column has a GIST index for LTREE operators.
 */
export class SystemCategoryService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Create a new system category with auto-generated LTREE path.
   * Admin-only operation.
   */
  async create(input: CreateSystemCategoryInput): Promise<Category> {
    let parent: Category | null = null;
    let path: string;
    let depth: number;

    if (input.parentId) {
      parent = await this.em.findOneOrFail(Category, { id: input.parentId });
      path = `${parent.path}.${this.slugify(input.name)}`;
      depth = parent.depth + 1;
    } else {
      path = this.slugify(input.name);
      depth = 0;
    }

    // Check for slug collision
    const existingPath = await this.em.findOne(Category, { path });
    if (existingPath) {
      throw new Error(
        `Category path "${path}" already exists. ` +
        `Names "${input.name}" and "${existingPath.name}" produce the same slug.`
      );
    }

    const category = this.em.create(Category, {
      name: input.name,
      description: input.description,
      path,
      type: input.type,
      targetType: input.targetType,
      depth,
      parent,
      defaultProfileId: input.defaultProfileId,
      isActive: true,
    });

    await this.em.persistAndFlush(category);
    return category;
  }

  /**
   * Update an existing system category. Admin-only operation.
   */
  async update(id: string, input: UpdateSystemCategoryInput): Promise<Category> {
    const category = await this.em.findOneOrFail(Category, { id });

    if (input.name !== undefined) category.name = input.name;
    if (input.description !== undefined) category.description = input.description;
    if (input.type !== undefined) category.type = input.type;
    if (input.defaultProfileId !== undefined) category.defaultProfileId = input.defaultProfileId;
    if (input.isActive !== undefined) category.isActive = input.isActive;

    // Increment version for change tracking
    category.version = (category.version ?? 1) + 1;

    await this.em.flush();
    return category;
  }

  /**
   * Find category by LTREE path.
   */
  async findByPath(path: string): Promise<Category | null> {
    return this.em.findOne(Category, { path });
  }

  /**
   * Find category by ID.
   */
  async findById(id: string): Promise<Category | null> {
    return this.em.findOne(Category, { id });
  }

  /**
   * Get all ancestors of a category (from root to immediate parent).
   */
  async getAncestors(id: string): Promise<Category[]> {
    const category = await this.em.findOneOrFail(Category, { id });

    const conn = this.em.getConnection();
    const result = await conn.execute<Array<{ id: string }>>(
      `SELECT id FROM public.category
       WHERE path @> $1::ltree AND path != $1::ltree
       ORDER BY depth ASC`,
      [category.path]
    );

    if (result.length === 0) return [];

    const ids = result.map(r => r.id);
    const ancestors = await this.em.find(Category, { id: { $in: ids } });
    return ancestors.sort((a, b) => a.depth - b.depth);
  }

  /**
   * Get all descendants of a category.
   */
  async getDescendants(id: string): Promise<Category[]> {
    const category = await this.em.findOneOrFail(Category, { id });

    const conn = this.em.getConnection();
    const result = await conn.execute<Array<{ id: string }>>(
      `SELECT id FROM public.category
       WHERE path <@ $1::ltree AND path != $1::ltree
       ORDER BY depth ASC`,
      [category.path]
    );

    if (result.length === 0) return [];

    const ids = result.map(r => r.id);
    return this.em.find(Category, { id: { $in: ids } });
  }

  /**
   * Get direct children of a category.
   */
  async getChildren(id: string): Promise<Category[]> {
    return this.em.find(Category, { parent: { id } }, { orderBy: { name: 'ASC' } });
  }

  /**
   * Get root categories (no parent).
   */
  async getRoots(targetType?: TargetType): Promise<Category[]> {
    const where: Record<string, unknown> = { depth: 0 };
    if (targetType) where.targetType = targetType;
    return this.em.find(Category, where, { orderBy: { name: 'ASC' } });
  }

  /**
   * Delete a system category (fails if has children).
   */
  async delete(id: string): Promise<void> {
    const category = await this.em.findOneOrFail(Category, { id });

    const childCount = await this.em.count(Category, { parent: { id } });
    if (childCount > 0) {
      throw new Error('Cannot delete category with children');
    }

    await this.em.removeAndFlush(category);
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test system-category.service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/services/system-category.service.ts packages/database/src/services/system-category.service.test.ts
git commit -m "feat(database): add SystemCategoryService for public.category CRUD"
```

---

## Task 1b: Create TenantCategoryService

> **Purpose:** Manages tenant categories in `tenant_*.tenant_category` and adoption records in `tenant_*.category_adoption`.

**Files:**
- Create: `packages/database/src/services/tenant-category.service.ts`
- Test: `packages/database/src/services/tenant-category.service.test.ts`

**Existing Entities (already implemented):**
- `TenantCategory`: `packages/database/src/entities/TenantCategory.ts`
- `CategoryAdoption`: `packages/database/src/entities/CategoryAdoption.ts`
- `LinkMode`: LIVE, FROZEN, DETACHED (in CategoryAdoption.ts)

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/tenant-category.service.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { TenantCategoryService } from './tenant-category.service.js';
import { TenantCategory } from '../entities/TenantCategory.js';
import { CategoryAdoption, LinkMode } from '../entities/CategoryAdoption.js';
import { Category, CategoryType } from '../entities/Category.js';
import { TargetType } from '../entities/enums/index.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('TenantCategoryService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: TenantCategoryService;

  beforeAll(async () => {
    orm = await createTestOrm([Category, TenantCategory, CategoryAdoption]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    service = new TenantCategoryService(em);
    await em.nativeDelete(CategoryAdoption, {});
    await em.nativeDelete(TenantCategory, {});
    await em.nativeDelete(Category, {});
  });

  describe('create', () => {
    it('should create a tenant root category', async () => {
      const category = await service.create({
        name: 'Premium Line',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      expect(category.id).toBeDefined();
      expect(category.path).toBe('premium_line');
      expect(category.depth).toBe(0);
    });

    it('should create a tenant category linked to system category', async () => {
      // Create system category first
      const systemCategory = em.create(Category, {
        name: 'Apparel',
        path: 'apparel',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
        depth: 0,
        isActive: true,
      });
      await em.persistAndFlush(systemCategory);

      const tenantCategory = await service.create({
        name: 'Our Apparel',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
        systemCategoryId: systemCategory.id,
        linkMode: LinkMode.LIVE,
      });

      expect(tenantCategory.systemCategoryId).toBe(systemCategory.id);
      expect(tenantCategory.linkMode).toBe(LinkMode.LIVE);
    });

    it('should require linkMode when systemCategoryId is provided', async () => {
      const systemCategory = em.create(Category, {
        name: 'Apparel',
        path: 'apparel',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
        depth: 0,
        isActive: true,
      });
      await em.persistAndFlush(systemCategory);

      await expect(
        service.create({
          name: 'Our Apparel',
          type: CategoryType.ROOT,
          targetType: TargetType.PRODUCT,
          systemCategoryId: systemCategory.id,
          // Missing linkMode!
        })
      ).rejects.toThrow('linkMode is required');
    });
  });

  describe('adoptSystemCategory', () => {
    it('should create adoption record with LIVE mode', async () => {
      const systemCategory = em.create(Category, {
        name: 'Electronics',
        path: 'electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
        depth: 0,
        isActive: true,
        version: 1,
      });
      await em.persistAndFlush(systemCategory);

      const adoption = await service.adoptSystemCategory(
        systemCategory.id,
        LinkMode.LIVE
      );

      expect(adoption.systemCategoryId).toBe(systemCategory.id);
      expect(adoption.mode).toBe(LinkMode.LIVE);
      expect(adoption.adoptedAt).toBeDefined();
    });

    it('should create adoption with FROZEN mode and version snapshot', async () => {
      const systemCategory = em.create(Category, {
        name: 'Electronics',
        path: 'electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
        depth: 0,
        isActive: true,
        version: 3,
      });
      await em.persistAndFlush(systemCategory);

      const adoption = await service.adoptSystemCategory(
        systemCategory.id,
        LinkMode.FROZEN
      );

      expect(adoption.mode).toBe(LinkMode.FROZEN);
      expect(adoption.frozenAtVersion).toBe(3);
    });

    it('should throw if category already adopted', async () => {
      const systemCategory = em.create(Category, {
        name: 'Electronics',
        path: 'electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
        depth: 0,
        isActive: true,
      });
      await em.persistAndFlush(systemCategory);

      await service.adoptSystemCategory(systemCategory.id, LinkMode.LIVE);

      await expect(
        service.adoptSystemCategory(systemCategory.id, LinkMode.LIVE)
      ).rejects.toThrow('already adopted');
    });
  });

  describe('getAdoptedSystemCategories', () => {
    it('should return adopted system categories with ancestors', async () => {
      // Create system hierarchy
      const root = em.create(Category, {
        name: 'Electronics',
        path: 'electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
        depth: 0,
        isActive: true,
      });
      await em.persistAndFlush(root);

      const branch = em.create(Category, {
        name: 'Batteries',
        path: 'electronics.batteries',
        type: CategoryType.BRANCH,
        targetType: TargetType.PRODUCT,
        depth: 1,
        parent: root,
        isActive: true,
      });
      await em.persistAndFlush(branch);

      const leaf = em.create(Category, {
        name: 'Lithium Ion',
        path: 'electronics.batteries.lithium_ion',
        type: CategoryType.LEAF,
        targetType: TargetType.PRODUCT,
        depth: 2,
        parent: branch,
        isActive: true,
      });
      await em.persistAndFlush(leaf);

      // Adopt only the leaf
      await service.adoptSystemCategory(leaf.id, LinkMode.LIVE);

      const adopted = await service.getAdoptedSystemCategories();

      // Should return 3: leaf + 2 ancestors for tree rendering
      expect(adopted).toHaveLength(3);
      expect(adopted.map(c => c.name)).toEqual(['Electronics', 'Batteries', 'Lithium Ion']);
    });
  });

  describe('unadoptSystemCategory', () => {
    it('should remove adoption', async () => {
      const systemCategory = em.create(Category, {
        name: 'Electronics',
        path: 'electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
        depth: 0,
        isActive: true,
      });
      await em.persistAndFlush(systemCategory);

      await service.adoptSystemCategory(systemCategory.id, LinkMode.LIVE);
      await service.unadoptSystemCategory(systemCategory.id);

      const adopted = await service.getAdoptedSystemCategories();
      expect(adopted).toHaveLength(0);
    });
  });

  describe('updateAdoptionMode', () => {
    it('should change from LIVE to FROZEN with version snapshot', async () => {
      const systemCategory = em.create(Category, {
        name: 'Electronics',
        path: 'electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
        depth: 0,
        isActive: true,
        version: 5,
      });
      await em.persistAndFlush(systemCategory);

      await service.adoptSystemCategory(systemCategory.id, LinkMode.LIVE);

      const updated = await service.updateAdoptionMode(
        systemCategory.id,
        LinkMode.FROZEN
      );

      expect(updated.mode).toBe(LinkMode.FROZEN);
      expect(updated.frozenAtVersion).toBe(5);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test tenant-category.service.test.ts
```

Expected: FAIL with "Cannot find module './tenant-category.service.js'"

**Step 3: Create the service**

```typescript
// packages/database/src/services/tenant-category.service.ts
import { EntityManager } from '@mikro-orm/core';
import { TenantCategory } from '../entities/TenantCategory.js';
import { CategoryAdoption, LinkMode } from '../entities/CategoryAdoption.js';
import { Category, CategoryType } from '../entities/Category.js';
import { TargetType } from '../entities/enums/index.js';

export interface CreateTenantCategoryInput {
  name: string;
  description?: string;
  parentId?: string;
  type: CategoryType;
  targetType: TargetType;
  systemCategoryId?: string;
  linkMode?: LinkMode;
  defaultProfileId?: string;
}

export interface UpdateTenantCategoryInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  linkMode?: LinkMode;
}

/**
 * TenantCategoryService - Manages tenant categories and system category adoptions.
 *
 * This service operates on TENANT schema tables:
 * - tenant_category: Tenant-owned categories
 * - category_adoption: Links to system categories with LIVE/FROZEN/DETACHED modes
 *
 * For system category management (admin-only), use SystemCategoryService instead.
 */
export class TenantCategoryService {
  constructor(private readonly em: EntityManager) {}

  // ==========================================================================
  // Tenant Category CRUD
  // ==========================================================================

  /**
   * Create a new tenant category.
   */
  async create(input: CreateTenantCategoryInput): Promise<TenantCategory> {
    // Validate linkMode requirement
    if (input.systemCategoryId && !input.linkMode) {
      throw new Error('linkMode is required when linking to a system category');
    }

    let parent: TenantCategory | null = null;
    let path: string;
    let depth: number;

    if (input.parentId) {
      parent = await this.em.findOneOrFail(TenantCategory, { id: input.parentId });
      path = `${parent.path}.${this.slugify(input.name)}`;
      depth = parent.depth + 1;
    } else {
      path = this.slugify(input.name);
      depth = 0;
    }

    // Check for path collision within tenant
    const existingPath = await this.em.findOne(TenantCategory, { path });
    if (existingPath) {
      throw new Error(`Category path "${path}" already exists`);
    }

    const category = this.em.create(TenantCategory, {
      name: input.name,
      description: input.description,
      path,
      type: input.type,
      targetType: input.targetType,
      depth,
      parent,
      systemCategoryId: input.systemCategoryId,
      linkMode: input.linkMode,
      defaultProfileId: input.defaultProfileId,
      isActive: true,
    });

    await this.em.persistAndFlush(category);
    return category;
  }

  /**
   * Update a tenant category.
   */
  async update(id: string, input: UpdateTenantCategoryInput): Promise<TenantCategory> {
    const category = await this.em.findOneOrFail(TenantCategory, { id });

    if (input.name !== undefined) category.name = input.name;
    if (input.description !== undefined) category.description = input.description;
    if (input.isActive !== undefined) category.isActive = input.isActive;
    if (input.linkMode !== undefined) category.linkMode = input.linkMode;

    await this.em.flush();
    return category;
  }

  /**
   * Delete a tenant category (fails if has children or assigned products).
   */
  async delete(id: string): Promise<void> {
    const category = await this.em.findOneOrFail(TenantCategory, { id });

    const childCount = await this.em.count(TenantCategory, { parent: { id } });
    if (childCount > 0) {
      throw new Error(`Cannot delete category with ${childCount} children`);
    }

    // Note: Product assignment check would be done at API layer

    await this.em.removeAndFlush(category);
  }

  /**
   * Find tenant category by ID.
   */
  async findById(id: string): Promise<TenantCategory | null> {
    return this.em.findOne(TenantCategory, { id });
  }

  /**
   * Get all tenant categories.
   */
  async findAll(options?: { targetType?: TargetType; active?: boolean }): Promise<TenantCategory[]> {
    const where: Record<string, unknown> = {};
    if (options?.targetType) where.targetType = options.targetType;
    if (options?.active !== undefined) where.isActive = options.active;
    return this.em.find(TenantCategory, where, { orderBy: { path: 'ASC' } });
  }

  // ==========================================================================
  // System Category Adoption
  // ==========================================================================

  /**
   * Adopt a system category with specified link mode.
   *
   * @param systemCategoryId - ID of the system category to adopt
   * @param mode - LIVE (auto-sync), FROZEN (snapshot), or DETACHED (independent)
   */
  async adoptSystemCategory(
    systemCategoryId: string,
    mode: LinkMode
  ): Promise<CategoryAdoption> {
    // Verify system category exists
    const systemCategory = await this.em.findOneOrFail(Category, { id: systemCategoryId });

    // Check if already adopted
    const existing = await this.em.findOne(CategoryAdoption, { systemCategoryId });
    if (existing) {
      throw new Error(`System category "${systemCategory.name}" is already adopted`);
    }

    const adoption = this.em.create(CategoryAdoption, {
      systemCategoryId,
      mode,
      adoptedAt: new Date(),
      adoptedVersion: systemCategory.version ?? 1,
      frozenAtVersion: mode === LinkMode.FROZEN ? (systemCategory.version ?? 1) : undefined,
      updateAvailable: false,
    });

    await this.em.persistAndFlush(adoption);
    return adoption;
  }

  /**
   * Get all adopted system categories, INCLUDING ancestors for tree rendering.
   */
  async getAdoptedSystemCategories(): Promise<Category[]> {
    const adoptions = await this.em.find(CategoryAdoption, {});
    if (adoptions.length === 0) return [];

    const adoptedIds = adoptions.map(a => a.systemCategoryId);

    // Get adopted categories
    const adoptedCategories = await this.em.find(Category, { id: { $in: adoptedIds } });
    if (adoptedCategories.length === 0) return [];

    // Use LTREE to find all ancestors
    const adoptedPaths = adoptedCategories.map(c => c.path);

    const conn = this.em.getConnection();
    const result = await conn.execute<Array<{ id: string }>>(
      `SELECT DISTINCT c.id
       FROM public.category c
       WHERE EXISTS (
         SELECT 1 FROM unnest($1::ltree[]) AS adopted_path
         WHERE c.path @> adopted_path OR c.path = adopted_path
       )
       ORDER BY c.path`,
      [adoptedPaths]
    );

    if (result.length === 0) return adoptedCategories;

    const ids = result.map(r => r.id);
    return this.em.find(Category, { id: { $in: ids } }, { orderBy: { path: 'ASC' } });
  }

  /**
   * Get directly adopted system categories (without ancestors).
   */
  async getDirectlyAdoptedCategories(): Promise<Category[]> {
    const adoptions = await this.em.find(CategoryAdoption, {});
    if (adoptions.length === 0) return [];

    const adoptedIds = adoptions.map(a => a.systemCategoryId);
    return this.em.find(Category, { id: { $in: adoptedIds } });
  }

  /**
   * Get adoption record for a system category.
   */
  async getAdoption(systemCategoryId: string): Promise<CategoryAdoption | null> {
    return this.em.findOne(CategoryAdoption, { systemCategoryId });
  }

  /**
   * Remove adoption of a system category.
   */
  async unadoptSystemCategory(systemCategoryId: string): Promise<void> {
    const adoption = await this.em.findOne(CategoryAdoption, { systemCategoryId });
    if (!adoption) {
      throw new Error('System category is not adopted');
    }

    await this.em.removeAndFlush(adoption);
  }

  /**
   * Update the link mode of an adoption.
   */
  async updateAdoptionMode(
    systemCategoryId: string,
    newMode: LinkMode
  ): Promise<CategoryAdoption> {
    const adoption = await this.em.findOneOrFail(CategoryAdoption, { systemCategoryId });
    const systemCategory = await this.em.findOneOrFail(Category, { id: systemCategoryId });

    adoption.mode = newMode;

    // If switching to FROZEN, snapshot current version
    if (newMode === LinkMode.FROZEN) {
      adoption.frozenAtVersion = systemCategory.version ?? 1;
    }

    await this.em.flush();
    return adoption;
  }

  /**
   * Get available system categories for adoption (not yet adopted).
   */
  async getAvailableForAdoption(targetType?: TargetType): Promise<Category[]> {
    const adoptions = await this.em.find(CategoryAdoption, {});
    const adoptedIds = new Set(adoptions.map(a => a.systemCategoryId));

    const where: Record<string, unknown> = { isActive: true };
    if (targetType) where.targetType = targetType;

    const allCategories = await this.em.find(Category, where);
    return allCategories.filter(c => !adoptedIds.has(c.id));
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test tenant-category.service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/services/tenant-category.service.ts packages/database/src/services/tenant-category.service.test.ts
git commit -m "feat(database): add TenantCategoryService for tenant category and adoption management"
```

---

## Task 2: Create System Category Seeder

**Files:**
- Create: `packages/database/src/seeders/categories.seeder.ts`
- Create: `packages/database/data/system-categories.json`
- Test: `packages/database/src/seeders/categories.seeder.test.ts`

**Step 1: Create the data bundle**

```json
// packages/database/data/system-categories.json
{
  "version": "SystemCategories-v1",
  "generatedAt": "2026-01-26T00:00:00.000Z",
  "totalCategories": 50,
  "categories": [
    {
      "path": "apparel",
      "name": "Apparel",
      "description": "Clothing and textile products",
      "type": "ROOT",
      "targetType": "PRODUCT"
    },
    {
      "path": "apparel.tops",
      "name": "Tops",
      "description": "Upper body garments",
      "type": "BRANCH",
      "targetType": "PRODUCT"
    },
    {
      "path": "apparel.tops.tshirts",
      "name": "T-Shirts",
      "description": "Short-sleeved casual tops",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "apparel.tops.blouses",
      "name": "Blouses",
      "description": "Formal upper body garments",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "apparel.tops.sweaters",
      "name": "Sweaters",
      "description": "Knitted upper body garments",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "apparel.bottoms",
      "name": "Bottoms",
      "description": "Lower body garments",
      "type": "BRANCH",
      "targetType": "PRODUCT"
    },
    {
      "path": "apparel.bottoms.pants",
      "name": "Pants",
      "description": "Full-length leg garments",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "apparel.bottoms.shorts",
      "name": "Shorts",
      "description": "Short leg garments",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "apparel.bottoms.skirts",
      "name": "Skirts",
      "description": "Non-bifurcated lower body garments",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "apparel.outerwear",
      "name": "Outerwear",
      "description": "Coats, jackets, and outer layers",
      "type": "BRANCH",
      "targetType": "PRODUCT"
    },
    {
      "path": "apparel.outerwear.jackets",
      "name": "Jackets",
      "description": "Light to medium outerwear",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "apparel.outerwear.coats",
      "name": "Coats",
      "description": "Heavy outerwear",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },

    {
      "path": "electronics",
      "name": "Electronics",
      "description": "Electronic devices and components",
      "type": "ROOT",
      "targetType": "PRODUCT"
    },
    {
      "path": "electronics.batteries",
      "name": "Batteries",
      "description": "Power storage devices",
      "type": "BRANCH",
      "targetType": "PRODUCT"
    },
    {
      "path": "electronics.batteries.lithium_ion",
      "name": "Lithium-Ion Batteries",
      "description": "Rechargeable lithium-ion cells",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "electronics.batteries.lead_acid",
      "name": "Lead-Acid Batteries",
      "description": "Lead-based rechargeable batteries",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "electronics.displays",
      "name": "Displays",
      "description": "Visual output devices",
      "type": "BRANCH",
      "targetType": "PRODUCT"
    },
    {
      "path": "electronics.displays.lcd",
      "name": "LCD Displays",
      "description": "Liquid crystal displays",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "electronics.displays.oled",
      "name": "OLED Displays",
      "description": "Organic light-emitting diode displays",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "electronics.computing",
      "name": "Computing Devices",
      "description": "Data processing equipment",
      "type": "BRANCH",
      "targetType": "PRODUCT"
    },
    {
      "path": "electronics.computing.laptops",
      "name": "Laptops",
      "description": "Portable computers",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "electronics.computing.smartphones",
      "name": "Smartphones",
      "description": "Mobile computing devices",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },

    {
      "path": "furniture",
      "name": "Furniture",
      "description": "Furnishings and fixtures",
      "type": "ROOT",
      "targetType": "PRODUCT"
    },
    {
      "path": "furniture.seating",
      "name": "Seating",
      "description": "Chairs and seating solutions",
      "type": "BRANCH",
      "targetType": "PRODUCT"
    },
    {
      "path": "furniture.seating.office_chairs",
      "name": "Office Chairs",
      "description": "Ergonomic work seating",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "furniture.seating.sofas",
      "name": "Sofas",
      "description": "Upholstered seating for multiple persons",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "furniture.tables",
      "name": "Tables",
      "description": "Flat-topped furniture",
      "type": "BRANCH",
      "targetType": "PRODUCT"
    },
    {
      "path": "furniture.tables.desks",
      "name": "Desks",
      "description": "Work surfaces",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "furniture.tables.dining",
      "name": "Dining Tables",
      "description": "Tables for eating",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },

    {
      "path": "toys",
      "name": "Toys",
      "description": "Play items for children",
      "type": "ROOT",
      "targetType": "PRODUCT"
    },
    {
      "path": "toys.construction",
      "name": "Construction Toys",
      "description": "Building and assembly toys",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "toys.dolls",
      "name": "Dolls",
      "description": "Figurines and dolls",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },
    {
      "path": "toys.electronic",
      "name": "Electronic Toys",
      "description": "Battery-powered play items",
      "type": "LEAF",
      "targetType": "PRODUCT"
    },

    {
      "path": "materials",
      "name": "Materials",
      "description": "Raw materials and components",
      "type": "ROOT",
      "targetType": "MATERIAL"
    },
    {
      "path": "materials.textiles",
      "name": "Textiles",
      "description": "Fabric and fiber materials",
      "type": "BRANCH",
      "targetType": "MATERIAL"
    },
    {
      "path": "materials.textiles.cotton",
      "name": "Cotton",
      "description": "Cotton-based textiles",
      "type": "LEAF",
      "targetType": "MATERIAL"
    },
    {
      "path": "materials.textiles.polyester",
      "name": "Polyester",
      "description": "Synthetic polyester textiles",
      "type": "LEAF",
      "targetType": "MATERIAL"
    },
    {
      "path": "materials.textiles.elastane",
      "name": "Elastane",
      "description": "Stretchable synthetic fiber",
      "type": "LEAF",
      "targetType": "MATERIAL"
    },
    {
      "path": "materials.metals",
      "name": "Metals",
      "description": "Metallic materials",
      "type": "BRANCH",
      "targetType": "MATERIAL"
    },
    {
      "path": "materials.metals.steel",
      "name": "Steel",
      "description": "Iron-carbon alloys",
      "type": "LEAF",
      "targetType": "MATERIAL"
    },
    {
      "path": "materials.metals.aluminum",
      "name": "Aluminum",
      "description": "Aluminum and alloys",
      "type": "LEAF",
      "targetType": "MATERIAL"
    },
    {
      "path": "materials.plastics",
      "name": "Plastics",
      "description": "Polymer materials",
      "type": "BRANCH",
      "targetType": "MATERIAL"
    },
    {
      "path": "materials.plastics.abs",
      "name": "ABS",
      "description": "Acrylonitrile butadiene styrene",
      "type": "LEAF",
      "targetType": "MATERIAL"
    },
    {
      "path": "materials.plastics.pla",
      "name": "PLA",
      "description": "Polylactic acid (biodegradable)",
      "type": "LEAF",
      "targetType": "MATERIAL"
    },

    {
      "path": "facilities",
      "name": "Facilities",
      "description": "Manufacturing and operational sites",
      "type": "ROOT",
      "targetType": "FACILITY"
    },
    {
      "path": "facilities.manufacturing",
      "name": "Manufacturing",
      "description": "Production facilities",
      "type": "BRANCH",
      "targetType": "FACILITY"
    },
    {
      "path": "facilities.warehousing",
      "name": "Warehousing",
      "description": "Storage facilities",
      "type": "BRANCH",
      "targetType": "FACILITY"
    }
  ]
}
```

**Step 2: Write the failing test**

```typescript
// packages/database/src/seeders/categories.seeder.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { CategoriesSeeder } from './categories.seeder.js';
import { Category, CategoryType } from '../entities/Category.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import { TargetType } from '../entities/enums/index.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('CategoriesSeeder', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let seeder: CategoriesSeeder;

  beforeAll(async () => {
    orm = await createTestOrm([Category, SeedVersion]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    seeder = new CategoriesSeeder(em);
    await em.nativeDelete(Category, {});
    await em.nativeDelete(SeedVersion, {});
  });

  it('should seed categories from data bundle', async () => {
    const result = await seeder.seed();

    expect(result.seeded).toBe(true);
    expect(result.count).toBeGreaterThan(30);

    // Verify hierarchy
    const apparel = await em.findOne(Category, { path: 'apparel' });
    expect(apparel).toBeDefined();
    expect(apparel?.type).toBe(CategoryType.ROOT);
    expect(apparel?.depth).toBe(0);

    const tshirts = await em.findOne(Category, { path: 'apparel.tops.tshirts' });
    expect(tshirts).toBeDefined();
    expect(tshirts?.type).toBe(CategoryType.LEAF);
    expect(tshirts?.depth).toBe(2);
  });

  it('should set up parent references correctly', async () => {
    await seeder.seed();

    const tops = await em.findOne(Category, { path: 'apparel.tops' }, { populate: ['parent'] });
    expect(tops?.parent?.path).toBe('apparel');
  });

  it('should support multiple target types', async () => {
    await seeder.seed();

    const products = await em.find(Category, { targetType: TargetType.PRODUCT });
    const materials = await em.find(Category, { targetType: TargetType.MATERIAL });
    const facilities = await em.find(Category, { targetType: TargetType.FACILITY });

    expect(products.length).toBeGreaterThan(0);
    expect(materials.length).toBeGreaterThan(0);
    expect(facilities.length).toBeGreaterThan(0);
  });

  it('should skip seeding if version matches', async () => {
    await seeder.seed();
    const initialCount = await em.count(Category);

    const result = await seeder.seed();

    expect(result.seeded).toBe(false);
    expect(result.skipped).toBe(true);

    const finalCount = await em.count(Category);
    expect(finalCount).toBe(initialCount);
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd packages/database && pnpm test categories.seeder.test.ts
```

Expected: FAIL with "Cannot find module './categories.seeder.js'"

**Step 4: Create the seeder**

```typescript
// packages/database/src/seeders/categories.seeder.ts
import { EntityManager } from '@mikro-orm/core';
import { Category, CategoryType } from '../entities/Category.js';
import { TargetType } from '../entities/enums/index.js';
import { SeedService } from '../services/seed.service.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SeederResult {
  seeded: boolean;
  skipped: boolean;
  count: number;
  version: string;
  message: string;
}

interface CategoryData {
  path: string;
  name: string;
  description?: string;
  type: string;
  targetType: string;
}

interface CategoryBundle {
  version: string;
  generatedAt: string;
  totalCategories: number;
  categories: CategoryData[];
}

export class CategoriesSeeder {
  private readonly seedService: SeedService;
  private readonly SEED_NAME = 'system-categories';

  constructor(private readonly em: EntityManager) {
    this.seedService = new SeedService(em);
  }

  async seed(): Promise<SeederResult> {
    // Load data bundle
    const bundlePath = join(__dirname, '..', 'data', 'system-categories.json');
    const raw = readFileSync(bundlePath, 'utf-8');
    const bundle: CategoryBundle = JSON.parse(raw);
    const version = bundle.version;

    // Check if seeding needed
    const needsSeeding = await this.seedService.needsSeeding(this.SEED_NAME, version);

    if (!needsSeeding) {
      const existing = await this.seedService.getSeededVersion(this.SEED_NAME);
      return {
        seeded: false,
        skipped: true,
        count: existing?.recordCount || 0,
        version: existing?.version || version,
        message: `Categories already seeded (${existing?.version}), skipping.`,
      };
    }

    // Sort by path to ensure parents are created before children
    const sorted = [...bundle.categories].sort((a, b) => a.path.localeCompare(b.path));

    // Build path -> id map for parent references
    const pathToId = new Map<string, string>();

    let count = 0;
    for (const cat of sorted) {
      const depth = cat.path.split('.').length - 1;
      const parentPath = cat.path.includes('.')
        ? cat.path.substring(0, cat.path.lastIndexOf('.'))
        : null;

      // Check if already exists
      const existing = await this.em.findOne(Category, { path: cat.path });
      if (existing) {
        pathToId.set(cat.path, existing.id);
        continue;
      }

      // Get parent
      let parent: Category | undefined;
      if (parentPath) {
        const parentId = pathToId.get(parentPath);
        if (parentId) {
          parent = await this.em.findOne(Category, { id: parentId }) || undefined;
        }
      }

      const category = this.em.create(Category, {
        name: cat.name,
        description: cat.description,
        path: cat.path,
        type: cat.type as CategoryType,
        targetType: cat.targetType as TargetType,
        depth,
        parent,
        isActive: true,
      });

      await this.em.persistAndFlush(category);
      pathToId.set(cat.path, category.id);
      count++;
    }

    // Record seeding
    await this.seedService.recordSeeding(this.SEED_NAME, version, count);

    return {
      seeded: true,
      skipped: false,
      count,
      version,
      message: `Seeded ${count} system categories (${version}).`,
    };
  }
}
```

**Step 5: Run test to verify it passes**

```bash
cd packages/database && pnpm test categories.seeder.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/seeders/categories.seeder.ts packages/database/src/seeders/categories.seeder.test.ts packages/database/data/system-categories.json
git commit -m "feat(database): add CategoriesSeeder with system category hierarchy"
```

---

## Task 3: Create Category API Routes

**Files:**
- Create: `apps/api/src/routes/taxonomy/categories.ts`
- Test: `apps/api/src/routes/taxonomy/categories.e2e.test.ts`

**Step 1: Write the failing e2e test (NO MOCKS - per RULES.md)**

```typescript
// apps/api/src/routes/taxonomy/categories.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MikroORM } from '@eurocomply/database';
import { Hono } from 'hono';
import { createCategoriesRouter, type CategoriesRepository, type CategoryData } from './categories.js';
import { Category, CategoryType } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';

interface ApiResponse<T> {
  data: T;
  meta?: { total: number };
}

describe('Categories API E2E', () => {
  let orm: MikroORM;
  let app: Hono;
  let testCategoryIds: { apparel: string; tops: string; tshirts: string };

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();

    // Seed test categories (real database, no mocks)
    const em = orm.em.fork();

    const apparel = em.create(Category, {
      name: 'Apparel',
      path: 'apparel',
      type: CategoryType.ROOT,
      targetType: 'PRODUCT',
      depth: 0,
      isActive: true,
    });
    em.persist(apparel);
    await em.flush();

    const tops = em.create(Category, {
      name: 'Tops',
      path: 'apparel.tops',
      type: CategoryType.BRANCH,
      targetType: 'PRODUCT',
      depth: 1,
      parentId: apparel.id,
      isActive: true,
    });
    em.persist(tops);
    await em.flush();

    const tshirts = em.create(Category, {
      name: 'T-Shirts',
      path: 'apparel.tops.tshirts',
      type: CategoryType.LEAF,
      targetType: 'PRODUCT',
      depth: 2,
      parentId: tops.id,
      isActive: true,
    });
    em.persist(tshirts);

    // Add a material category for targetType filter testing
    const materials = em.create(Category, {
      name: 'Materials',
      path: 'materials',
      type: CategoryType.ROOT,
      targetType: 'MATERIAL',
      depth: 0,
      isActive: true,
    });
    em.persist(materials);

    await em.flush();

    testCategoryIds = {
      apparel: apparel.id,
      tops: tops.id,
      tshirts: tshirts.id,
    };

    // Create repository implementation (real database queries)
    const repo: CategoriesRepository = {
      findAll: async (filter): Promise<CategoryData[]> => {
        const qb = orm.em.fork().createQueryBuilder(Category);
        if (filter?.targetType) qb.andWhere({ targetType: filter.targetType });
        if (filter?.depth !== undefined) qb.andWhere({ depth: filter.depth });
        if (filter?.active !== undefined) qb.andWhere({ isActive: filter.active });
        const results = await qb.getResultList();
        return results.map(c => ({
          id: c.id,
          name: c.name,
          path: c.path,
          type: c.type,
          targetType: c.targetType,
          depth: c.depth,
          parentId: c.parentId ?? undefined,
          isActive: c.isActive,
        }));
      },
      findById: async (id): Promise<CategoryData | null> => {
        const c = await orm.em.fork().findOne(Category, { id });
        if (!c) return null;
        return {
          id: c.id,
          name: c.name,
          path: c.path,
          type: c.type,
          targetType: c.targetType,
          depth: c.depth,
          parentId: c.parentId ?? undefined,
          isActive: c.isActive,
        };
      },
      findByPath: async (path): Promise<CategoryData | null> => {
        const c = await orm.em.fork().findOne(Category, { path });
        if (!c) return null;
        return {
          id: c.id,
          name: c.name,
          path: c.path,
          type: c.type,
          targetType: c.targetType,
          depth: c.depth,
          parentId: c.parentId ?? undefined,
          isActive: c.isActive,
        };
      },
      findRoots: async (targetType): Promise<CategoryData[]> => {
        const filter: Record<string, unknown> = { depth: 0 };
        if (targetType) filter.targetType = targetType;
        const results = await orm.em.fork().find(Category, filter);
        return results.map(c => ({
          id: c.id,
          name: c.name,
          path: c.path,
          type: c.type,
          targetType: c.targetType,
          depth: c.depth,
          parentId: c.parentId ?? undefined,
          isActive: c.isActive,
        }));
      },
      findChildren: async (parentId): Promise<CategoryData[]> => {
        const results = await orm.em.fork().find(Category, { parentId });
        return results.map(c => ({
          id: c.id,
          name: c.name,
          path: c.path,
          type: c.type,
          targetType: c.targetType,
          depth: c.depth,
          parentId: c.parentId ?? undefined,
          isActive: c.isActive,
        }));
      },
      findAncestors: async (id): Promise<CategoryData[]> => {
        // Walk up the tree by following parentId
        const ancestors: CategoryData[] = [];
        let current = await orm.em.fork().findOne(Category, { id });
        while (current?.parentId) {
          const parent = await orm.em.fork().findOne(Category, { id: current.parentId });
          if (parent) {
            ancestors.unshift({
              id: parent.id,
              name: parent.name,
              path: parent.path,
              type: parent.type,
              targetType: parent.targetType,
              depth: parent.depth,
              parentId: parent.parentId ?? undefined,
              isActive: parent.isActive,
            });
            current = parent;
          } else {
            break;
          }
        }
        return ancestors;
      },
    };

    app = new Hono();
    app.route('/categories', createCategoriesRouter(repo));
  });

  afterAll(async () => {
    if (orm) {
      try {
        await orm.em.fork().nativeDelete(Category, {});
      } catch {
        // Ignore cleanup errors
      }
      await teardownTestDb();
    }
  });

  describe('GET /categories', () => {
    it('should return all categories from database', async () => {
      if (!orm) return;

      const res = await app.request('/categories');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(4);
    });

    it('should filter by targetType', async () => {
      if (!orm) return;

      const res = await app.request('/categories?targetType=PRODUCT');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(3);
      expect(body.data.every(c => c.targetType === 'PRODUCT')).toBe(true);
    });

    it('should filter by depth', async () => {
      if (!orm) return;

      const res = await app.request('/categories?depth=0');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(2); // Apparel and Materials
      expect(body.data.every(c => c.depth === 0)).toBe(true);
    });
  });

  describe('GET /categories/roots', () => {
    it('should return root categories', async () => {
      if (!orm) return;

      const res = await app.request('/categories/roots');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(2);
      expect(body.data.every(c => c.depth === 0)).toBe(true);
    });

    it('should filter roots by targetType', async () => {
      if (!orm) return;

      const res = await app.request('/categories/roots?targetType=MATERIAL');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(1);
      expect(body.data[0].name).toBe('Materials');
    });
  });

  describe('GET /categories/:id', () => {
    it('should return a category by id', async () => {
      if (!orm) return;

      const res = await app.request(`/categories/${testCategoryIds.apparel}`);
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<CategoryData>;
      expect(body.data.name).toBe('Apparel');
    });

    it('should return 404 for unknown id', async () => {
      if (!orm) return;

      const res = await app.request('/categories/cat_unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /categories/:id/children', () => {
    it('should return child categories', async () => {
      if (!orm) return;

      const res = await app.request(`/categories/${testCategoryIds.apparel}/children`);
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(1);
      expect(body.data[0].name).toBe('Tops');
    });

    it('should return empty array for leaf nodes', async () => {
      if (!orm) return;

      const res = await app.request(`/categories/${testCategoryIds.tshirts}/children`);
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(0);
    });
  });

  describe('GET /categories/:id/ancestors', () => {
    it('should return ancestor categories', async () => {
      if (!orm) return;

      const res = await app.request(`/categories/${testCategoryIds.tshirts}/ancestors`);
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(2); // Apparel and Tops
      expect(body.data[0].name).toBe('Apparel');
      expect(body.data[1].name).toBe('Tops');
    });

    it('should return empty array for root nodes', async () => {
      if (!orm) return;

      const res = await app.request(`/categories/${testCategoryIds.apparel}/ancestors`);
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<CategoryData[]>;
      expect(body.data.length).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test categories.test.ts
```

Expected: FAIL with "Cannot find module './categories.js'"

**Step 3: Create the router**

```typescript
// apps/api/src/routes/taxonomy/categories.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { CategoryType } from '@eurocomply/database';
import type { Env } from '../../app.js';
import { authorize } from '../../middleware/authorize.js';

export interface CategoryData {
  id: string;
  name: string;
  description?: string;
  path: string;
  type: CategoryType;
  targetType: string;
  depth: number;
  parentId?: string;
  defaultProfileId?: string;
  isActive: boolean;
}

export interface CategoriesRepository {
  findAll(filter?: {
    targetType?: string;
    depth?: number;
    active?: boolean;
  }): Promise<CategoryData[]>;
  findById(id: string): Promise<CategoryData | null>;
  findByPath(path: string): Promise<CategoryData | null>;
  findRoots(targetType?: string): Promise<CategoryData[]>;
  findChildren(parentId: string): Promise<CategoryData[]>;
  findAncestors(id: string): Promise<CategoryData[]>;
  // NOTE: Adoption methods are NOT in this interface.
  // Adoption is handled by separate CategoryAdoptionRouter using CategoryService directly.
}

const querySchema = z.object({
  targetType: z.enum(['PRODUCT', 'MATERIAL', 'FACILITY', 'BATCH']).optional(),
  depth: z.coerce.number().int().min(0).optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

export function createCategoriesRouter(repo: CategoriesRepository): Hono<Env> {
  const router = new Hono<Env>();

  // GET /categories - List all with optional filters
  router.get('/', zValidator('query', querySchema), async (c) => {
    const query = c.req.valid('query');

    const filter: Parameters<typeof repo.findAll>[0] = {};
    if (query.targetType) filter.targetType = query.targetType;
    if (query.depth !== undefined) filter.depth = query.depth;
    if (query.active !== undefined) filter.active = query.active;

    const categories = await repo.findAll(filter);

    return c.json({
      data: categories,
      meta: { total: categories.length },
    });
  });

  // GET /categories/roots - Get root categories
  router.get('/roots', zValidator('query', z.object({
    targetType: z.enum(['PRODUCT', 'MATERIAL', 'FACILITY', 'BATCH']).optional(),
  })), async (c) => {
    const query = c.req.valid('query');
    const roots = await repo.findRoots(query.targetType);

    return c.json({
      data: roots,
      meta: { total: roots.length },
    });
  });

  // GET /categories/:id - Get single by id
  router.get('/:id', async (c) => {
    const id = c.req.param('id');
    const category = await repo.findById(id);

    if (!category) {
      return c.json({ error: 'Category not found' }, 404);
    }

    return c.json({ data: category });
  });

  // GET /categories/:id/children - Get direct children
  router.get('/:id/children', async (c) => {
    const id = c.req.param('id');
    const category = await repo.findById(id);

    if (!category) {
      return c.json({ error: 'Category not found' }, 404);
    }

    const children = await repo.findChildren(id);

    return c.json({
      data: children,
      meta: { total: children.length, parentId: id },
    });
  });

  // GET /categories/:id/ancestors - Get all ancestors (breadcrumb trail)
  router.get('/:id/ancestors', async (c) => {
    const id = c.req.param('id');
    const category = await repo.findById(id);

    if (!category) {
      return c.json({ error: 'Not Found', message: 'Category not found' }, 404);
    }

    const ancestors = await repo.findAncestors(id);

    return c.json({
      data: ancestors,
      meta: { total: ancestors.length, categoryId: id },
    });
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test categories.e2e.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/taxonomy/categories.ts apps/api/src/routes/taxonomy/categories.e2e.test.ts
git commit -m "feat(api): add categories API routes (list, roots, children, ancestors)"
```

---

## Task 3b: Create Category Adoption Router (Tenant-Scoped)

> **IMPORTANT:** Adoption routes are separated into their own router for clean middleware application.
> This allows applying `tenantMiddleware` and `userMiddleware` at the router level in `app.ts`.
>
> **Uses:** TenantCategoryService for adoption operations (see Task 1b)

**Files:**
- Create: `apps/api/src/routes/category-adoption.ts`
- Test: `apps/api/src/routes/category-adoption.e2e.test.ts`

**Step 1: Create the adoption router**

```typescript
// apps/api/src/routes/category-adoption.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@mikro-orm/core';
import { Category, CategoryAdoption, LinkMode } from '@eurocomply/database';
import { TenantCategoryService } from '@eurocomply/database/services';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';

export interface CategoryAdoptionRouterOptions {
  orm: MikroORM;
}

const adoptSchema = z.object({
  mode: z.enum(['LIVE', 'FROZEN', 'DETACHED']),
});

export function createCategoryAdoptionRouter(options: CategoryAdoptionRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  // GET / - Get adopted categories for current tenant (includes ancestors for tree rendering)
  router.get('/', authorize('design', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });

    const adopted = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);
      const service = new TenantCategoryService(txEm);
      return service.getAdoptedSystemCategories();
    });

    return c.json({
      data: adopted.map(cat => ({
        id: cat.id,
        name: cat.name,
        path: cat.path,
        type: cat.type,
        targetType: cat.targetType,
        depth: cat.depth,
      })),
      meta: { total: adopted.length },
    });
  });

  // GET /available - Get system categories available for adoption
  router.get('/available', authorize('design', 'view'), zValidator('query', z.object({
    targetType: z.enum(['PRODUCT', 'MATERIAL', 'FACILITY', 'BATCH']).optional(),
  })), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const query = c.req.valid('query');

    const available = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);
      const service = new TenantCategoryService(txEm);
      return service.getAvailableForAdoption(query.targetType);
    });

    return c.json({
      data: available.map(cat => ({
        id: cat.id,
        name: cat.name,
        path: cat.path,
        type: cat.type,
        targetType: cat.targetType,
        depth: cat.depth,
      })),
      meta: { total: available.length },
    });
  });

  // POST /:categoryId - Adopt a system category with specified link mode
  router.post('/:categoryId', authorize('design', 'edit'), zValidator('json', adoptSchema), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const categoryId = c.req.param('categoryId');
    const { mode } = c.req.valid('json');

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);
      const service = new TenantCategoryService(txEm);

      try {
        const adoption = await service.adoptSystemCategory(categoryId, mode as LinkMode);
        const systemCategory = await txEm.findOneOrFail(Category, { id: categoryId });
        return { adoption, systemCategory };
      } catch (error) {
        if (error instanceof Error && error.message.includes('already adopted')) {
          return { error: error.message, status: 409 as const };
        }
        throw error;
      }
    });

    if ('error' in result) {
      return c.json({ error: 'Conflict', message: result.error }, result.status);
    }

    return c.json({
      data: {
        id: result.adoption.id,
        systemCategoryId: result.adoption.systemCategoryId,
        categoryName: result.systemCategory.name,
        mode: result.adoption.mode,
        adoptedAt: result.adoption.adoptedAt,
        frozenAtVersion: result.adoption.frozenAtVersion,
      },
    }, 201);
  });

  // PATCH /:categoryId - Update adoption mode (e.g., LIVE -> FROZEN)
  router.patch('/:categoryId', authorize('design', 'edit'), zValidator('json', z.object({
    mode: z.enum(['LIVE', 'FROZEN', 'DETACHED']),
  })), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const categoryId = c.req.param('categoryId');
    const { mode } = c.req.valid('json');

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);
      const service = new TenantCategoryService(txEm);

      try {
        const adoption = await service.updateAdoptionMode(categoryId, mode as LinkMode);
        return { adoption };
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return { error: error.message, status: 404 as const };
        }
        throw error;
      }
    });

    if ('error' in result) {
      return c.json({ error: 'Not Found', message: result.error }, result.status);
    }

    return c.json({
      data: {
        id: result.adoption.id,
        mode: result.adoption.mode,
        frozenAtVersion: result.adoption.frozenAtVersion,
      },
    });
  });

  // DELETE /:categoryId - Remove category adoption
  router.delete('/:categoryId', authorize('design', 'edit'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const categoryId = c.req.param('categoryId');

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);
      const service = new TenantCategoryService(txEm);

      try {
        await service.unadoptSystemCategory(categoryId);
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message.includes('not adopted')) {
          return { error: error.message, status: 404 as const };
        }
        throw error;
      }
    });

    if ('error' in result) {
      return c.json({ error: 'Not Found', message: result.error }, result.status);
    }

    return c.json({ data: { success: true } });
  });

  return router;
}
```

**Step 2: Register in app.ts**

```typescript
// apps/api/src/app.ts - add to createApp function

import { createCategoryAdoptionRouter } from './routes/category-adoption.js';

// Public taxonomy routes (no auth required)
const taxonomy = new Hono<Env>();
taxonomy.route('/units', createUnitsRouter(deps.unitsRepository));
taxonomy.route('/classifications', createClassificationsRouter(deps.classificationsRepository));
taxonomy.route('/categories', createCategoriesRouter(deps.categoriesRepository));
v1.route('/taxonomy', taxonomy);

// Tenant-scoped category adoption routes (REQUIRES full auth stack)
v1.use('/category-adoption/*', createTenantMiddlewareWithApiKeys(deps.orm.em as any));
if (userMiddleware) {
  v1.use('/category-adoption/*', userMiddleware);
}
v1.route('/category-adoption', createCategoryAdoptionRouter({ orm: deps.orm }));
```

**Step 3: Write e2e tests and commit**

```bash
git add apps/api/src/routes/category-adoption.ts apps/api/src/routes/category-adoption.e2e.test.ts apps/api/src/app.ts
git commit -m "feat(api): add category adoption router with tenant isolation"
```

---

## Task 4: Create CLI Command and Update Exports

**Files:**
- Create: `packages/database/src/cli/seed-categories.ts`
- Modify: `packages/database/package.json`
- Modify: `packages/database/src/seeders/index.ts`
- Modify: `packages/database/src/services/index.ts`
- Modify: `package.json` (root)

**Step 1: Create the CLI command**

```typescript
// packages/database/src/cli/seed-categories.ts
import { CategoriesSeeder } from '../seeders/categories.seeder.js';
import { initOrm } from '../init-orm.js';
import type { MikroORM } from '@mikro-orm/core';

async function main() {
  let orm: MikroORM | undefined;

  try {
    console.log('Initializing database connection...');
    orm = await initOrm();

    const em = orm.em.fork();
    const seeder = new CategoriesSeeder(em);

    console.log('Running categories seeder...');
    const result = await seeder.seed();

    console.log(`✓ ${result.message}`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding categories:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await orm?.close();
  }
}

main();
```

**Step 2: Add scripts to package.json**

```json
// Add to packages/database/package.json scripts:
{
  "scripts": {
    "seed:categories": "tsx src/cli/seed-categories.ts"
  }
}
```

**Step 3: Update seeders index**

```typescript
// packages/database/src/seeders/index.ts
export { UnitsSeeder, type SeederResult } from './units.seeder.js';
export { ClassificationsSeeder } from './classifications.seeder.js';
export { SubstancesSeeder, type SubstanceSeederResult } from './substances.seeder.js';
export { CategoriesSeeder } from './categories.seeder.js';
```

**Step 4: Update services index**

```typescript
// packages/database/src/services/index.ts
export { BulkImportService } from './bulk-import.service.js';
export { SeedService } from './seed.service.js';
export { SystemCategoryService, type CreateSystemCategoryInput, type UpdateSystemCategoryInput } from './system-category.service.js';
export { TenantCategoryService, type CreateTenantCategoryInput, type UpdateTenantCategoryInput } from './tenant-category.service.js';
```

**Step 5: Update root package.json**

```json
// Add to root package.json scripts:
{
  "scripts": {
    "db:seed:categories": "pnpm --filter @eurocomply/database seed:categories",
    "db:seed:public": "pnpm db:seed:units && pnpm db:seed:classifications && pnpm db:seed:substances && pnpm db:seed:categories"
  }
}
```

**Step 6: Test the command**

```bash
pnpm db:seed:categories
```

Expected: Categories seeded successfully

**Step 7: Commit**

```bash
git add packages/database/src/cli/seed-categories.ts packages/database/package.json packages/database/src/seeders/index.ts packages/database/src/services/index.ts package.json
git commit -m "feat(database): add seed:categories CLI command and export CategoryService"
```

---

## Task 5: Integration Test

**Files:**
- Create: `packages/database/src/services/category.integration.test.ts`

**Step 1: Write integration test**

```typescript
// packages/database/src/services/category.integration.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { CategoriesSeeder } from '../seeders/categories.seeder.js';
import { SystemCategoryService } from './system-category.service.js';
import { Category, CategoryType } from '../entities/Category.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import { TargetType } from '../entities/enums/index.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('SystemCategoryService Integration', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: SystemCategoryService;

  beforeAll(async () => {
    orm = await createTestOrm([Category, SeedVersion]);

    // Seed categories
    em = orm.em.fork();
    const seeder = new CategoriesSeeder(em);
    await seeder.seed();
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(() => {
    em = orm.em.fork();
    service = new SystemCategoryService(em);
  });

  describe('Hierarchy Navigation', () => {
    it('should find category by path', async () => {
      const category = await service.findByPath('apparel.tops.tshirts');

      expect(category).toBeDefined();
      expect(category?.name).toBe('T-Shirts');
    });

    it('should get ancestors of leaf category', async () => {
      const tshirts = await service.findByPath('apparel.tops.tshirts');
      const ancestors = await service.getAncestors(tshirts!.id);

      expect(ancestors).toHaveLength(2);
      expect(ancestors.map(a => a.name)).toEqual(['Apparel', 'Tops']);
    });

    it('should get descendants of root category', async () => {
      const apparel = await service.findByPath('apparel');
      const descendants = await service.getDescendants(apparel!.id);

      expect(descendants.length).toBeGreaterThan(5);
    });

    it('should get direct children', async () => {
      const apparel = await service.findByPath('apparel');
      const children = await service.getChildren(apparel!.id);

      expect(children.length).toBeGreaterThan(0);
      expect(children.every(c => c.depth === 1)).toBe(true);
    });
  });

  describe('Root Categories', () => {
    it('should get all root categories', async () => {
      const roots = await service.getRoots();

      expect(roots.length).toBeGreaterThan(0);
      expect(roots.every(r => r.depth === 0)).toBe(true);
    });

    it('should filter roots by target type', async () => {
      const productRoots = await service.getRoots(TargetType.PRODUCT);
      const materialRoots = await service.getRoots(TargetType.MATERIAL);

      expect(productRoots.every(r => r.targetType === TargetType.PRODUCT)).toBe(true);
      expect(materialRoots.every(r => r.targetType === TargetType.MATERIAL)).toBe(true);
    });
  });

  describe('LTREE Operations', () => {
    it('should have valid LTREE paths', async () => {
      const allCategories = await em.find(Category, {});

      for (const cat of allCategories) {
        // Path should match expected pattern
        expect(cat.path).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/);

        // Depth should match path segments
        const expectedDepth = cat.path.split('.').length - 1;
        expect(cat.depth).toBe(expectedDepth);
      }
    });

    it('should have correct parent references', async () => {
      const nonRoots = await em.find(Category, { depth: { $gt: 0 } }, { populate: ['parent'] });

      for (const cat of nonRoots) {
        expect(cat.parent).toBeDefined();
        expect(cat.depth).toBe(cat.parent!.depth + 1);
      }
    });
  });

  describe('Category Creation', () => {
    it('should create tenant category under system category', async () => {
      const apparel = await service.findByPath('apparel');

      const tenantCategory = await service.create({
        name: 'Premium Line',
        parentId: apparel!.id,
        type: CategoryType.BRANCH,
        targetType: TargetType.PRODUCT,
      });

      expect(tenantCategory.path).toBe('apparel.premium_line');
      expect(tenantCategory.depth).toBe(1);

      // Cleanup
      await service.delete(tenantCategory.id);
    });
  });
});
```

**Step 2: Run integration test**

```bash
cd packages/database && pnpm test category.integration.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add packages/database/src/services/category.integration.test.ts
git commit -m "test(database): add category service integration tests"
```

---

## Task 6: Tenant Categories CRUD API

> **Note:** TenantCategory and CategoryAdoption entities are already implemented.
> This task creates the API routes using TenantCategoryService.

**Already Implemented (reference only):**
- `TenantCategory` entity: `packages/database/src/entities/TenantCategory.ts`
- `CategoryAdoption` entity: `packages/database/src/entities/CategoryAdoption.ts`
- `LinkMode` enum: LIVE, FROZEN, DETACHED

**Files:**
- Create: `apps/api/src/routes/tenant-categories.ts`
- Test: `apps/api/src/routes/tenant-categories.e2e.test.ts`

**Step 1: Create Tenant Categories API Router (uses TenantCategoryService)**

```typescript
// apps/api/src/routes/tenant-categories.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@mikro-orm/core';
import { TenantCategory, LinkMode, CategoryType, TargetType, Product } from '@eurocomply/database';
import { TenantCategoryService } from '@eurocomply/database/services';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';

export interface TenantCategoriesRouterOptions {
  orm: MikroORM;
}

const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  parentId: z.string().optional(),
  type: z.enum(['ROOT', 'BRANCH', 'LEAF']),
  targetType: z.enum(['PRODUCT', 'MATERIAL', 'FACILITY', 'BATCH']),
  systemCategoryId: z.string().optional(),
  linkMode: z.enum(['LIVE', 'FROZEN', 'DETACHED']).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  linkMode: z.enum(['LIVE', 'FROZEN', 'DETACHED']).optional(),
});

export function createTenantCategoriesRouter(options: TenantCategoriesRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  // GET / - List tenant categories
  router.get('/', authorize('design', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });

    const categories = await em.find(TenantCategory, { isActive: true });

    return c.json({
      data: categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        path: cat.path,
        type: cat.type,
        targetType: cat.targetType,
        depth: cat.depth,
        parentId: cat.parent?.id,
        systemCategoryId: cat.systemCategoryId,
        linkMode: cat.linkMode,
        frozenAtVersion: cat.frozenAtVersion,
        isActive: cat.isActive,
      })),
      meta: { total: categories.length },
    });
  });

  // POST / - Create tenant category (requires design:manager)
  router.post('/', authorize('design', 'manager'), zValidator('json', createCategorySchema), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const input = c.req.valid('json');

    // Validate parent exists if provided
    let parent: TenantCategory | undefined;
    let path: string;
    let depth: number;

    if (input.parentId) {
      parent = await em.findOne(TenantCategory, { id: input.parentId }) ?? undefined;
      if (!parent) {
        return c.json({ error: 'Not Found', message: 'Parent category not found' }, 404);
      }
      path = `${parent.path}.${slugify(input.name)}`;
      depth = parent.depth + 1;
    } else {
      path = slugify(input.name);
      depth = 0;
    }

    // Check for path collision
    const existing = await em.findOne(TenantCategory, { path });
    if (existing) {
      return c.json({
        error: 'Conflict',
        message: `Category path "${path}" already exists`,
      }, 409);
    }

    // If linking to system category, validate linkMode is provided
    if (input.systemCategoryId && !input.linkMode) {
      return c.json({
        error: 'Bad Request',
        message: 'linkMode is required when linking to a system category',
      }, 400);
    }

    const category = em.create(TenantCategory, {
      name: input.name,
      description: input.description,
      path,
      type: input.type as CategoryType,
      targetType: input.targetType as TargetType,
      depth,
      parent,
      systemCategoryId: input.systemCategoryId,
      linkMode: input.linkMode as LinkMode,
      isActive: true,
    });

    await em.persistAndFlush(category);

    return c.json({
      data: {
        id: category.id,
        name: category.name,
        path: category.path,
        type: category.type,
        targetType: category.targetType,
        depth: category.depth,
        systemCategoryId: category.systemCategoryId,
        linkMode: category.linkMode,
      },
    }, 201);
  });

  // PATCH /:id - Update tenant category (requires design:manager)
  router.patch('/:id', authorize('design', 'manager'), zValidator('json', updateCategorySchema), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const category = await em.findOne(TenantCategory, { id });
    if (!category) {
      return c.json({ error: 'Not Found', message: 'Category not found' }, 404);
    }

    if (input.name !== undefined) category.name = input.name;
    if (input.description !== undefined) category.description = input.description;
    if (input.isActive !== undefined) category.isActive = input.isActive;
    if (input.linkMode !== undefined) category.linkMode = input.linkMode as LinkMode;

    await em.flush();

    return c.json({ data: { id: category.id, name: category.name } });
  });

  // DELETE /:id - Delete tenant category (requires design:manager)
  router.delete('/:id', authorize('design', 'manager'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const id = c.req.param('id');

    const category = await em.findOne(TenantCategory, { id });
    if (!category) {
      return c.json({ error: 'Not Found', message: 'Category not found' }, 404);
    }

    // Check for children
    const childCount = await em.count(TenantCategory, { parent: { id } });
    if (childCount > 0) {
      return c.json({
        error: 'Conflict',
        message: `Cannot delete category with ${childCount} children`,
      }, 409);
    }

    // Check for assigned products
    const productCount = await em.count(Product, { categoryId: id });
    if (productCount > 0) {
      return c.json({
        error: 'Conflict',
        message: `Cannot delete category with ${productCount} assigned products. Reassign products first.`,
      }, 409);
    }

    await em.removeAndFlush(category);

    return c.json({ data: { success: true } });
  });

  return router;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
```

**Step 4: Register in app.ts**

```typescript
// apps/api/src/app.ts
import { createTenantCategoriesRouter } from './routes/tenant-categories.js';

// Tenant-scoped category management routes (REQUIRES full auth stack)
v1.use('/tenant-categories/*', createTenantMiddlewareWithApiKeys(deps.orm.em as any));
if (userMiddleware) {
  v1.use('/tenant-categories/*', userMiddleware);
}
v1.route('/tenant-categories', createTenantCategoriesRouter({ orm: deps.orm }));
```

**Step 5: Commit**

```bash
git add packages/database/src/entities/TenantCategory.ts packages/database/src/entities/CategoryAdoption.ts apps/api/src/routes/tenant-categories.ts
git commit -m "feat(database): add TenantCategory entity with LIVE/FROZEN/DETACHED link modes"
```

---

## Summary

**Dual Service Architecture:**

| Service | Schema | Purpose | Access |
|---------|--------|---------|--------|
| **SystemCategoryService** | `public.category` | Platform-managed category hierarchy | Admin-only |
| **TenantCategoryService** | `tenant_*.tenant_category` | Tenant categories + adoption management | Tenant users |

**Deliverables:**
- `SystemCategoryService` - CRUD for system categories with LTREE hierarchy operations
- `TenantCategoryService` - CRUD for tenant categories + adoption management with LIVE/FROZEN/DETACHED modes
- System categories data bundle (`data/system-categories.json`) with ~50 categories
- `CategoriesSeeder` service with idempotent seeding
- Public categories API routes (list, roots, get, children, ancestors)
- Tenant-scoped category adoption API with link mode support
- Tenant categories CRUD API with manager permission
- `seed:categories` CLI command
- Integration tests for hierarchy navigation

**Already Implemented Entities (reference):**
- `TenantCategory`: `packages/database/src/entities/TenantCategory.ts`
- `CategoryAdoption`: `packages/database/src/entities/CategoryAdoption.ts`
- `LinkMode` enum: LIVE, FROZEN, DETACHED

**API Routes:**

*Public System Category Routes (No Auth):*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/taxonomy/categories` | List system categories with filters |
| GET | `/api/v1/taxonomy/categories/roots` | Get root system categories |
| GET | `/api/v1/taxonomy/categories/:id` | Get system category by id |
| GET | `/api/v1/taxonomy/categories/:id/children` | Get direct children |
| GET | `/api/v1/taxonomy/categories/:id/ancestors` | Get all ancestors |

*Tenant Category Adoption Routes (Requires Tenant Auth):*
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/category-adoption` | design:view | Get adopted system categories (with ancestors) |
| GET | `/api/v1/category-adoption/available` | design:view | Get available system categories for adoption |
| POST | `/api/v1/category-adoption/:id` | design:edit | Adopt a system category (requires mode: LIVE/FROZEN/DETACHED) |
| PATCH | `/api/v1/category-adoption/:id` | design:edit | Update adoption mode |
| DELETE | `/api/v1/category-adoption/:id` | design:edit | Remove adoption |

*Tenant Category Management Routes (Requires Tenant Auth):*
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/tenant-categories` | design:view | List tenant categories |
| POST | `/api/v1/tenant-categories` | design:manager | Create tenant category |
| PATCH | `/api/v1/tenant-categories/:id` | design:manager | Update tenant category |
| DELETE | `/api/v1/tenant-categories/:id` | design:manager | Delete tenant category |

**Updated db:seed:public command:**
```bash
pnpm db:seed:public
# Runs: seed:units → seed:classifications → seed:substances → seed:categories
```

**Next Plan:** Plan 6 (Attribute Service) adds attribute templates linked to categories.
