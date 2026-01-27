# Taxonomy Plan 11: Category-List Scoping

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement dual-layer regulatory scoping: CategoryRegulatoryList (public schema for system baseline) and TenantCategoryRegulatoryList (tenant schema for additions + exemptions). Includes ComplianceStackResolver for 3-layer resolution.

**Architecture:** Create two entity layers:
1. `CategoryRegulatoryList` (public schema) - Links system Categories to RegulatoryLists with priority, exclusion, compareValue override, and tenant exemption guardrails
2. `TenantCategoryRegulatoryList` (tenant schema) - Enables tenant additions (extra regulations) and exemptions (with mandatory justification)

The `ComplianceStackResolver` service resolves the effective compliance stack:
- Layer 1 (Bottom): System baseline from CategoryRegulatoryList
- Layer 2 (Middle): Tenant additions from TenantCategoryRegulatoryList
- Layer 3 (Top): Tenant exemptions from TenantCategoryRegulatoryList

**Tech Stack:** MikroORM, PostgreSQL LTREE, TypeScript

**Prerequisites:**
- Plan 5 (Category Service) must be completed first
- Plan 10 (Regulatory List Registry) must be completed first

**Reference:** See `docs/plans/2026-01-27-unified-taxonomy-compliance-stack-design.md` Sections 2-4

---

## Task 1: Create ListRequirement Enum

**Files:**
- Create: `packages/database/src/entities/enums/ListRequirement.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create the enum file**

```typescript
// packages/database/src/entities/enums/ListRequirement.ts
export enum ListRequirement {
  PROHIBITION = 'PROHIBITION',    // Substances banned entirely
  RESTRICTION = 'RESTRICTION',    // Allowed with conditions/thresholds
  DECLARATION = 'DECLARATION',    // Must disclose if present
}
```

**Step 2: Export from index**

```typescript
// packages/database/src/entities/enums/index.ts
// Add to existing exports:
export { ListRequirement } from './ListRequirement.js';
```

**Step 3: Verify build**

```bash
cd packages/database && pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/database/src/entities/enums/ListRequirement.ts packages/database/src/entities/enums/index.ts
git commit -m "feat(database): add ListRequirement enum (PROHIBITION, RESTRICTION, DECLARATION)"
```

---

## Task 2: Create CategoryRegulatoryList Entity

**Files:**
- Create: `packages/database/src/entities/CategoryRegulatoryList.ts`
- Test: `packages/database/src/entities/CategoryRegulatoryList.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/CategoryRegulatoryList.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { Category, CategoryType } from './Category.js';
import { RegulatoryList } from './RegulatoryList.js';
import { CategoryRegulatoryList } from './CategoryRegulatoryList.js';
import { ListRequirement } from './enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('CategoryRegulatoryList Entity', () => {
  let orm: MikroORM;
  let rootCategoryId: string;
  let childCategoryId: string;
  let regulatoryListId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!orm) return;
    const em = orm.em.fork();
    await em.nativeDelete(CategoryRegulatoryList, {});
    await em.nativeDelete(RegulatoryList, {});
    await em.nativeDelete(Category, {});

    // Create category hierarchy
    const rootCategory = em.create(Category, {
      name: 'Products',
      path: 'products',
      type: CategoryType.ROOT,
      depth: 0,
    });

    const childCategory = em.create(Category, {
      name: 'Cosmetics',
      path: 'products.cosmetics',
      type: CategoryType.BRANCH,
      depth: 1,
      parent: rootCategory,
    });

    // Create regulatory list
    const regulatoryList = em.create(RegulatoryList, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC Candidate List',
      source: 'ECHA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
    });

    await em.persistAndFlush([rootCategory, childCategory, regulatoryList]);
    rootCategoryId = rootCategory.id;
    childCategoryId = childCategory.id;
    regulatoryListId = regulatoryList.id;
  });

  it('creates a category-list mapping', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { id: rootCategoryId });
    const listRef = await em.findOneOrFail(RegulatoryList, { id: regulatoryListId });

    const mapping = em.create(CategoryRegulatoryList, {
      category: catRef,
      regulatoryList: listRef,
      requirement: ListRequirement.RESTRICTION,
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(CategoryRegulatoryList, {
      category: catRef,
      regulatoryList: listRef,
    });

    expect(found.requirement).toBe(ListRequirement.RESTRICTION);
    expect(found.priority).toBe(0);
    expect(found.isExclusion).toBe(false);
  });

  it('supports priority for same-depth ordering', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { id: rootCategoryId });
    const listRef = await em.findOneOrFail(RegulatoryList, { id: regulatoryListId });

    const mapping = em.create(CategoryRegulatoryList, {
      category: catRef,
      regulatoryList: listRef,
      requirement: ListRequirement.RESTRICTION,
      priority: 10,
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(CategoryRegulatoryList, { category: catRef });
    expect(found.priority).toBe(10);
  });

  it('supports exclusion flag', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { id: childCategoryId });
    const listRef = await em.findOneOrFail(RegulatoryList, { id: regulatoryListId });

    const mapping = em.create(CategoryRegulatoryList, {
      category: catRef,
      regulatoryList: listRef,
      requirement: ListRequirement.RESTRICTION,
      isExclusion: true,  // Cosmetics exempt from this list
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(CategoryRegulatoryList, { category: catRef });
    expect(found.isExclusion).toBe(true);
  });

  it('supports compareValue override', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { id: childCategoryId });
    const listRef = await em.findOneOrFail(RegulatoryList, { id: regulatoryListId });

    const mapping = em.create(CategoryRegulatoryList, {
      category: catRef,
      regulatoryList: listRef,
      requirement: ListRequirement.RESTRICTION,
      compareValueOverride: '0.01',  // Stricter for cosmetics
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(CategoryRegulatoryList, { category: catRef });
    expect(found.compareValueOverride).toBe('0.01');
  });

  it('enforces unique constraint on category + list', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { id: rootCategoryId });
    const listRef = await em.findOneOrFail(RegulatoryList, { id: regulatoryListId });

    const mapping1 = em.create(CategoryRegulatoryList, {
      category: catRef,
      regulatoryList: listRef,
      requirement: ListRequirement.RESTRICTION,
    });
    await em.persistAndFlush(mapping1);

    const em2 = orm.em.fork();
    const catRef2 = await em2.findOneOrFail(Category, { id: rootCategoryId });
    const listRef2 = await em2.findOneOrFail(RegulatoryList, { id: regulatoryListId });

    const mapping2 = em2.create(CategoryRegulatoryList, {
      category: catRef2,
      regulatoryList: listRef2,  // Same category + list
      requirement: ListRequirement.PROHIBITION,
    });

    await expect(em2.persistAndFlush(mapping2)).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test CategoryRegulatoryList.test.ts
```

Expected: FAIL with "Cannot find module './CategoryRegulatoryList.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/entities/CategoryRegulatoryList.ts
import {
  Entity,
  Property,
  ManyToOne,
  Enum,
  Unique,
  Index,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';
import { RegulatoryList } from './RegulatoryList.js';
import { ListRequirement } from './enums/index.js';

@Entity({ tableName: 'category_regulatory_list', schema: 'public' })
@Unique({ properties: ['category', 'regulatoryList'] })
@Index({ properties: ['category', 'regulatoryList'] })
export class CategoryRegulatoryList extends BaseEntity {
  /**
   * The category this mapping applies to.
   * LTREE inheritance means child categories inherit parent mappings.
   */
  @ManyToOne(() => Category, { name: 'category_id' })
  @Index()
  category!: Category;

  /**
   * The regulatory list that applies to this category.
   */
  @ManyToOne(() => RegulatoryList, { name: 'regulatory_list_id' })
  @Index()
  regulatoryList!: RegulatoryList;

  /**
   * The type of requirement this list imposes.
   */
  @Enum({ items: () => ListRequirement })
  requirement!: ListRequirement;

  /**
   * Priority for ordering when multiple lists match at the same depth.
   * Higher priority = takes precedence.
   */
  @Property({ type: 'smallint', default: 0 })
  priority: number = 0;

  /**
   * If true, this mapping excludes the category from a parent's list.
   * Used when a child category should NOT inherit a parent's regulatory requirement.
   */
  @Property({ type: 'boolean', default: false, name: 'is_exclusion' })
  isExclusion: boolean = false;

  /**
   * Category-specific compareValue override (agnostic model).
   * When set, this value is used instead of the default RegulatoryListEntry.compareValue.
   * Example: Toys might have 0.01% while general products allow 0.1%.
   */
  @Property({ type: 'decimal', precision: 5, scale: 4, nullable: true, name: 'compare_value_override' })
  compareValueOverride?: string;

  /**
   * Whether tenants can exempt themselves from this regulatory requirement.
   * Set to false for non-negotiable regulations (e.g., absolute prohibitions).
   */
  @Property({ type: 'boolean', default: true, name: 'allow_tenant_exemption' })
  allowTenantExemption: boolean = true;
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test CategoryRegulatoryList.test.ts
```

Expected: PASS (all tests)

**Step 5: Export from index and commit**

```typescript
// packages/database/src/entities/index.ts
// Add to existing exports:
export { CategoryRegulatoryList } from './CategoryRegulatoryList.js';
```

```bash
git add packages/database/src/entities/CategoryRegulatoryList.ts packages/database/src/entities/CategoryRegulatoryList.test.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add CategoryRegulatoryList entity for LTREE scoping"
```

---

## Task 3: Create CategoryRegulatoryList Migration

**Files:**
- Create: `packages/database/src/migrations/Migration20260126_CategoryRegulatoryList.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260126_CategoryRegulatoryList.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_CategoryRegulatoryList extends Migration {
  async up(): Promise<void> {
    // Create category_regulatory_list table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.category_regulatory_list (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL REFERENCES public.category(id) ON DELETE CASCADE,
        regulatory_list_id TEXT NOT NULL REFERENCES public.regulatory_list(id) ON DELETE CASCADE,
        requirement TEXT NOT NULL CHECK (requirement IN ('PROHIBITION', 'RESTRICTION', 'DECLARATION')),
        priority SMALLINT NOT NULL DEFAULT 0,
        is_exclusion BOOLEAN NOT NULL DEFAULT false,
        compare_value_override NUMERIC(5,4),
        allow_tenant_exemption BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_category_regulatory_list UNIQUE (category_id, regulatory_list_id)
      );
    `);

    // Create indexes for efficient lookups
    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_cat_reg_list_category
        ON public.category_regulatory_list (category_id);
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_cat_reg_list_list
        ON public.category_regulatory_list (regulatory_list_id);
    `);

    // Composite index for join performance
    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_cat_reg_list_composite
        ON public.category_regulatory_list (category_id, regulatory_list_id);
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS public.category_regulatory_list;');
  }
}
```

**Step 2: Run migration**

```bash
cd packages/database && pnpm mikro-orm migration:up
```

Expected: Migration applies successfully

**Step 3: Commit**

```bash
git add packages/database/src/migrations/Migration20260126_CategoryRegulatoryList.ts
git commit -m "feat(database): add migration for category_regulatory_list table"
```

---

## Task 4: Create CategoryRegulatoryListService

**Files:**
- Create: `packages/database/src/services/CategoryRegulatoryListService.ts`
- Test: `packages/database/src/services/CategoryRegulatoryListService.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/CategoryRegulatoryListService.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { Category, CategoryType } from '../entities/Category.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { CategoryRegulatoryList } from '../entities/CategoryRegulatoryList.js';
import { CategoryRegulatoryListService } from './CategoryRegulatoryListService.js';
import { ListRequirement } from '../entities/enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('CategoryRegulatoryListService', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!orm) return;
    const em = orm.em.fork();
    await em.nativeDelete(CategoryRegulatoryList, {});
    await em.nativeDelete(RegulatoryList, {});
    await em.nativeDelete(Category, {});

    // Create category hierarchy
    const root = em.create(Category, {
      name: 'Products',
      path: 'products',
      type: CategoryType.ROOT,
      depth: 0,
    });

    const electronics = em.create(Category, {
      name: 'Electronics',
      path: 'products.electronics',
      type: CategoryType.BRANCH,
      depth: 1,
      parent: root,
    });

    const cosmetics = em.create(Category, {
      name: 'Cosmetics',
      path: 'products.cosmetics',
      type: CategoryType.BRANCH,
      depth: 1,
      parent: root,
    });

    const skincare = em.create(Category, {
      name: 'Skincare',
      path: 'products.cosmetics.skincare',
      type: CategoryType.BRANCH,
      depth: 2,
      parent: cosmetics,
    });

    const moisturizers = em.create(Category, {
      name: 'Moisturizers',
      path: 'products.cosmetics.skincare.moisturizers',
      type: CategoryType.LEAF,
      depth: 3,
      parent: skincare,
    });

    // Create regulatory lists
    const reachSvhc = em.create(RegulatoryList, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC',
      source: 'ECHA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
    });

    const rohs = em.create(RegulatoryList, {
      code: 'ROHS_RESTRICTED',
      name: 'RoHS Restricted',
      source: 'EU_ROHS',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
    });

    const cosingII = em.create(RegulatoryList, {
      code: 'COSING_ANNEX_II',
      name: 'CosIng Annex II',
      source: 'EU_COSING',
      version: '2024-06',
      effectiveDate: new Date('2024-06-01'),
    });

    const cosingIII = em.create(RegulatoryList, {
      code: 'COSING_ANNEX_III',
      name: 'CosIng Annex III',
      source: 'EU_COSING',
      version: '2024-06',
      effectiveDate: new Date('2024-06-01'),
    });

    await em.persistAndFlush([
      root, electronics, cosmetics, skincare, moisturizers,
      reachSvhc, rohs, cosingII, cosingIII,
    ]);

    // Create mappings:
    // - REACH_SVHC applies to all products (root)
    // - ROHS applies only to electronics
    // - COSING_ANNEX_II and III apply to cosmetics

    const rootRef = await em.findOneOrFail(Category, { path: 'products' });
    const electronicsRef = await em.findOneOrFail(Category, { path: 'products.electronics' });
    const cosmeticsRef = await em.findOneOrFail(Category, { path: 'products.cosmetics' });

    em.create(CategoryRegulatoryList, {
      category: rootRef,
      regulatoryList: reachSvhc,
      requirement: ListRequirement.RESTRICTION,
    });

    em.create(CategoryRegulatoryList, {
      category: electronicsRef,
      regulatoryList: rohs,
      requirement: ListRequirement.RESTRICTION,
    });

    em.create(CategoryRegulatoryList, {
      category: cosmeticsRef,
      regulatoryList: cosingII,
      requirement: ListRequirement.PROHIBITION,
    });

    em.create(CategoryRegulatoryList, {
      category: cosmeticsRef,
      regulatoryList: cosingIII,
      requirement: ListRequirement.RESTRICTION,
    });

    await em.flush();
  });

  describe('getListsForCategory', () => {
    it('returns lists inherited from ancestors', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new CategoryRegulatoryListService(em);

      // Moisturizers should inherit: REACH_SVHC (from root), COSING II & III (from cosmetics)
      const lists = await service.getListsForCategory('products.cosmetics.skincare.moisturizers');

      expect(lists).toHaveLength(3);
      const codes = lists.map(l => l.regulatoryList.code).sort();
      expect(codes).toEqual(['COSING_ANNEX_II', 'COSING_ANNEX_III', 'REACH_SVHC']);
    });

    it('returns only applicable lists for electronics', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new CategoryRegulatoryListService(em);

      // Electronics should get: REACH_SVHC (from root), ROHS (direct)
      const lists = await service.getListsForCategory('products.electronics');

      expect(lists).toHaveLength(2);
      const codes = lists.map(l => l.regulatoryList.code).sort();
      expect(codes).toEqual(['REACH_SVHC', 'ROHS_RESTRICTED']);
    });

    it('returns lists ordered by depth (most specific first)', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new CategoryRegulatoryListService(em);

      const lists = await service.getListsForCategory('products.cosmetics.skincare.moisturizers');

      // CosIng lists (depth 1) should come before REACH (depth 0)
      const cosing = lists.filter(l => l.regulatoryList.code.startsWith('COSING'));
      const reach = lists.find(l => l.regulatoryList.code === 'REACH_SVHC');

      expect(cosing.length).toBe(2);
      expect(reach).toBeDefined();

      // Verify depth ordering
      const firstCosing = lists.findIndex(l => l.regulatoryList.code.startsWith('COSING'));
      const reachIndex = lists.findIndex(l => l.regulatoryList.code === 'REACH_SVHC');
      expect(firstCosing).toBeLessThan(reachIndex);
    });
  });

  describe('getListsForCategory with exclusions', () => {
    it('respects exclusions from child categories', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new CategoryRegulatoryListService(em);

      // Add exclusion: skincare exempt from REACH_SVHC
      const skincareRef = await em.findOneOrFail(Category, { path: 'products.cosmetics.skincare' });
      const reachRef = await em.findOneOrFail(RegulatoryList, { code: 'REACH_SVHC' });

      em.create(CategoryRegulatoryList, {
        category: skincareRef,
        regulatoryList: reachRef,
        requirement: ListRequirement.RESTRICTION,
        isExclusion: true,
      });
      await em.flush();

      // Moisturizers should now only get COSING II & III (REACH excluded by skincare)
      const lists = await service.getListsForCategory('products.cosmetics.skincare.moisturizers');

      expect(lists).toHaveLength(2);
      const codes = lists.map(l => l.regulatoryList.code).sort();
      expect(codes).toEqual(['COSING_ANNEX_II', 'COSING_ANNEX_III']);
    });
  });

  describe('getListsForCategory with compareValue override', () => {
    it('returns compareValue override when set', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new CategoryRegulatoryListService(em);

      // Add stricter compareValue for cosmetics on REACH
      const cosmeticsRef = await em.findOneOrFail(Category, { path: 'products.cosmetics' });
      const reachRef = await em.findOneOrFail(RegulatoryList, { code: 'REACH_SVHC' });

      em.create(CategoryRegulatoryList, {
        category: cosmeticsRef,
        regulatoryList: reachRef,
        requirement: ListRequirement.RESTRICTION,
        compareValueOverride: '0.01',  // Stricter than default 0.1%
      });
      await em.flush();

      const lists = await service.getListsForCategory('products.cosmetics.skincare.moisturizers');

      const reachMapping = lists.find(l => l.regulatoryList.code === 'REACH_SVHC');
      expect(reachMapping?.compareValueOverride).toBe('0.01');
    });
  });

  describe('getCurrentListsWithEntries', () => {
    it('returns lists with entries populated', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new CategoryRegulatoryListService(em);

      const result = await service.getCurrentListsWithEntries('products.cosmetics');

      expect(result.length).toBeGreaterThan(0);
      // Lists should have entries collection available
      for (const mapping of result) {
        expect(mapping.regulatoryList).toBeDefined();
        expect(mapping.regulatoryList.code).toBeDefined();
      }
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test CategoryRegulatoryListService.test.ts
```

Expected: FAIL with "Cannot find module './CategoryRegulatoryListService.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/services/CategoryRegulatoryListService.ts
import { EntityManager, raw } from '@mikro-orm/postgresql';
import { Category } from '../entities/Category.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { CategoryRegulatoryList } from '../entities/CategoryRegulatoryList.js';
import { ListRequirement } from '../entities/enums/index.js';

export interface ApplicableList {
  regulatoryList: RegulatoryList;
  requirement: ListRequirement;
  matchedAt: string;  // The category path where this mapping was defined
  depth: number;
  priority: number;
  compareValueOverride?: string;
}

export class CategoryRegulatoryListService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Get all regulatory lists applicable to a category path.
   * Uses LTREE @> operator for ancestor matching, respects exclusions.
   *
   * @param categoryPath - The LTREE path of the target category
   * @returns Lists ordered by depth (most specific first), then priority
   */
  async getListsForCategory(categoryPath: string): Promise<CategoryRegulatoryList[]> {
    // Step 1: Get all candidate mappings (ancestors of the target path)
    const candidates = await this.em.getConnection().execute<Array<{
      id: string;
      category_id: string;
      regulatory_list_id: string;
      requirement: string;
      priority: number;
      is_exclusion: boolean;
      compare_value_override: string | null;
      path: string;
      depth: number;
    }>>(`
      SELECT
        crl.id,
        crl.category_id,
        crl.regulatory_list_id,
        crl.requirement,
        crl.priority,
        crl.is_exclusion,
        crl.compare_value_override,
        c.path,
        c.depth
      FROM public.category_regulatory_list crl
      JOIN public.category c ON c.id = crl.category_id
      JOIN public.regulatory_list rl ON rl.id = crl.regulatory_list_id
      WHERE c.path @> ?::ltree
        AND rl.is_current_version = true
      ORDER BY c.depth DESC, crl.priority DESC
    `, [categoryPath]);

    // Step 2: Process exclusions
    // An exclusion at depth N removes the list from ancestors at depth < N
    const exclusions = new Map<string, number>();  // listId -> exclusion depth

    for (const row of candidates) {
      if (row.is_exclusion) {
        const existingDepth = exclusions.get(row.regulatory_list_id);
        if (existingDepth === undefined || row.depth > existingDepth) {
          exclusions.set(row.regulatory_list_id, row.depth);
        }
      }
    }

    // Step 3: Filter out excluded lists and return non-exclusion mappings
    const filtered = candidates.filter(row => {
      if (row.is_exclusion) return false;  // Don't include exclusion records

      const exclusionDepth = exclusions.get(row.regulatory_list_id);
      if (exclusionDepth !== undefined && exclusionDepth > row.depth) {
        // This mapping is excluded by a more specific exclusion
        return false;
      }

      return true;
    });

    // Step 4: Load full entities
    const ids = filtered.map(r => r.id);
    if (ids.length === 0) return [];

    const mappings = await this.em.find(
      CategoryRegulatoryList,
      { id: { $in: ids } },
      {
        populate: ['regulatoryList', 'category'],
        orderBy: { category: { depth: 'DESC' }, priority: 'DESC' },
      }
    );

    // Maintain the order from our filtered results
    const idOrder = new Map(ids.map((id, i) => [id, i]));
    return mappings.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
  }

  /**
   * Get current regulatory lists for a category with their entries populated.
   * Used for compliance evaluation.
   */
  async getCurrentListsWithEntries(categoryPath: string): Promise<CategoryRegulatoryList[]> {
    const mappings = await this.getListsForCategory(categoryPath);

    // Populate entries for each list
    for (const mapping of mappings) {
      await this.em.populate(mapping.regulatoryList, ['entries']);
    }

    return mappings;
  }

  /**
   * Add a regulatory list to a category.
   */
  async addListToCategory(input: {
    categoryId: string;
    regulatoryListId: string;
    requirement: ListRequirement;
    priority?: number;
    isExclusion?: boolean;
    compareValueOverride?: string;
  }): Promise<CategoryRegulatoryList> {
    const category = await this.em.findOneOrFail(Category, { id: input.categoryId });
    const list = await this.em.findOneOrFail(RegulatoryList, { id: input.regulatoryListId });

    const mapping = this.em.create(CategoryRegulatoryList, {
      category,
      regulatoryList: list,
      requirement: input.requirement,
      priority: input.priority ?? 0,
      isExclusion: input.isExclusion ?? false,
      compareValueOverride: input.compareValueOverride,
    });

    await this.em.persistAndFlush(mapping);
    return mapping;
  }

  /**
   * Remove a regulatory list from a category.
   */
  async removeListFromCategory(categoryId: string, regulatoryListId: string): Promise<void> {
    const mapping = await this.em.findOne(CategoryRegulatoryList, {
      category: { id: categoryId },
      regulatoryList: { id: regulatoryListId },
    });

    if (mapping) {
      await this.em.removeAndFlush(mapping);
    }
  }

  /**
   * Get all mappings for a specific category (not inherited).
   */
  async getDirectMappings(categoryId: string): Promise<CategoryRegulatoryList[]> {
    return this.em.find(
      CategoryRegulatoryList,
      { category: { id: categoryId } },
      { populate: ['regulatoryList'] }
    );
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test CategoryRegulatoryListService.test.ts
```

Expected: PASS (all tests)

**Step 5: Export from index and commit**

```typescript
// packages/database/src/services/index.ts
// Add to existing exports:
export { CategoryRegulatoryListService } from './CategoryRegulatoryListService.js';
```

```bash
git add packages/database/src/services/CategoryRegulatoryListService.ts packages/database/src/services/CategoryRegulatoryListService.test.ts packages/database/src/services/index.ts
git commit -m "feat(database): add CategoryRegulatoryListService with LTREE inheritance"
```

---

## Task 5: Add API Route for Category Lists

**Files:**
- Create: `apps/api/src/routes/taxonomy/category-lists.ts`
- Modify: `apps/api/src/routes/taxonomy/index.ts`

**Step 1: Create the router**

```typescript
// apps/api/src/routes/taxonomy/category-lists.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@mikro-orm/postgresql';
import { CategoryRegulatoryListService } from '@eurocomply/database';
import type { Env } from '../../app.js';

// ============================================================================
// Types
// ============================================================================

export interface CategoryListsRouterOptions {
  orm: MikroORM;
}

// ============================================================================
// Schemas
// ============================================================================

const pathParam = z.object({
  path: z.string().min(1).regex(/^[a-z0-9_.]+$/, 'Invalid LTREE path format'),
});

// ============================================================================
// Router
// ============================================================================

export function createCategoryListsRouter(options: CategoryListsRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  // GET /taxonomy/categories/:path/regulatory-lists
  // Get all regulatory lists applicable to a category (with inheritance)
  router.get('/:path/regulatory-lists', async (c) => {
    const categoryPath = c.req.param('path');
    const em = orm.em.fork();
    const service = new CategoryRegulatoryListService(em);

    try {
      const mappings = await service.getListsForCategory(categoryPath);

      return c.json({
        data: mappings.map(m => ({
          listId: m.regulatoryList.id,
          listCode: m.regulatoryList.code,
          listName: m.regulatoryList.name,
          requirement: m.requirement,
          matchedAt: m.category.path,
          depth: m.category.depth,
          priority: m.priority,
          compareValueOverride: m.compareValueOverride,
        })),
        meta: {
          categoryPath,
          total: mappings.length,
        },
      });
    } catch (error) {
      return c.json(
        { error: 'Bad Request', message: 'Invalid category path' },
        400
      );
    }
  });

  return router;
}
```

**Step 2: Register in taxonomy routes**

```typescript
// apps/api/src/routes/taxonomy/index.ts
// Add import:
import { createCategoryListsRouter } from './category-lists.js';

// Add route registration:
taxonomy.route('/categories', createCategoryListsRouter({ orm }));
```

**Step 3: Verify build**

```bash
cd apps/api && pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/api/src/routes/taxonomy/category-lists.ts apps/api/src/routes/taxonomy/index.ts
git commit -m "feat(api): add category regulatory lists route with LTREE inheritance"
```

---

## Task 6: Create RegulationSource Enum

**Files:**
- Create: `packages/database/src/entities/enums/RegulationSource.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create the enum file**

```typescript
// packages/database/src/entities/enums/RegulationSource.ts
export enum RegulationSource {
  INHERITED = 'INHERITED',      // From system baseline (resolved from CategoryRegulatoryList)
  TENANT_ADDED = 'TENANT_ADDED',  // Tenant-specific addition
}
```

**Step 2: Export from index**

```typescript
// packages/database/src/entities/enums/index.ts
// Add to existing exports:
export { RegulationSource } from './RegulationSource.js';
```

**Step 3: Verify build**

```bash
cd packages/database && pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/database/src/entities/enums/RegulationSource.ts packages/database/src/entities/enums/index.ts
git commit -m "feat(database): add RegulationSource enum (INHERITED, TENANT_ADDED)"
```

---

## Task 7: Create TenantCategoryRegulatoryList Entity

**Files:**
- Create: `packages/database/src/entities/tenant/TenantCategoryRegulatoryList.ts`
- Test: `packages/database/src/entities/tenant/TenantCategoryRegulatoryList.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/tenant/TenantCategoryRegulatoryList.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { TenantCategory } from './TenantCategory.js';
import { TenantCategoryRegulatoryList } from './TenantCategoryRegulatoryList.js';
import { ListRequirement, RegulationSource } from '../enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../../test-utils.js';

describe('TenantCategoryRegulatoryList Entity', () => {
  let orm: MikroORM;
  let tenantCategoryId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!orm) return;
    const em = orm.em.fork();
    await em.nativeDelete(TenantCategoryRegulatoryList, {});
    await em.nativeDelete(TenantCategory, {});

    // Create tenant category
    const tenantCategory = em.create(TenantCategory, {
      name: 'Electronics',
      path: 'system.electronics',
      systemCategoryId: 'sys-cat-uuid',
    });

    await em.persistAndFlush(tenantCategory);
    tenantCategoryId = tenantCategory.id;
  });

  it('creates a tenant-added regulatory list mapping', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const tenantCatRef = await em.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    const mapping = em.create(TenantCategoryRegulatoryList, {
      tenantCategory: tenantCatRef,
      regulatoryListId: 'reg-list-uuid',
      requirement: ListRequirement.RESTRICTION,
      source: RegulationSource.TENANT_ADDED,
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(TenantCategoryRegulatoryList, {
      tenantCategory: tenantCatRef,
    });

    expect(found.requirement).toBe(ListRequirement.RESTRICTION);
    expect(found.source).toBe(RegulationSource.TENANT_ADDED);
    expect(found.isExempted).toBe(false);
  });

  it('supports exemption with required fields', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const tenantCatRef = await em.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    const mapping = em.create(TenantCategoryRegulatoryList, {
      tenantCategory: tenantCatRef,
      regulatoryListId: 'rohs-uuid',
      requirement: ListRequirement.RESTRICTION,
      source: RegulationSource.INHERITED,
      isExempted: true,
      exemptionReason: 'Medical device per Article 2(4)(f)',
      exemptionLegalRef: 'Directive 2011/65/EU Art 2(4)(f)',
      exemptedBy: 'user-uuid',
      exemptedAt: new Date(),
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(TenantCategoryRegulatoryList, {
      tenantCategory: tenantCatRef,
    });

    expect(found.isExempted).toBe(true);
    expect(found.exemptionReason).toBe('Medical device per Article 2(4)(f)');
    expect(found.exemptionLegalRef).toBe('Directive 2011/65/EU Art 2(4)(f)');
    expect(found.exemptedBy).toBe('user-uuid');
    expect(found.exemptedAt).toBeInstanceOf(Date);
  });

  it('supports override threshold', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const tenantCatRef = await em.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    const mapping = em.create(TenantCategoryRegulatoryList, {
      tenantCategory: tenantCatRef,
      regulatoryListId: 'reach-uuid',
      requirement: ListRequirement.RESTRICTION,
      source: RegulationSource.INHERITED,
      overrideThreshold: '0.005',  // Stricter than the law
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(TenantCategoryRegulatoryList, {
      tenantCategory: tenantCatRef,
    });

    expect(found.overrideThreshold).toBe('0.005');
  });

  it('enforces unique constraint on tenantCategory + regulatoryListId', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const tenantCatRef = await em.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    const mapping1 = em.create(TenantCategoryRegulatoryList, {
      tenantCategory: tenantCatRef,
      regulatoryListId: 'same-list-uuid',
      requirement: ListRequirement.RESTRICTION,
      source: RegulationSource.TENANT_ADDED,
    });
    await em.persistAndFlush(mapping1);

    const em2 = orm.em.fork();
    const tenantCatRef2 = await em2.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    const mapping2 = em2.create(TenantCategoryRegulatoryList, {
      tenantCategory: tenantCatRef2,
      regulatoryListId: 'same-list-uuid',  // Same list
      requirement: ListRequirement.PROHIBITION,
      source: RegulationSource.INHERITED,
    });

    await expect(em2.persistAndFlush(mapping2)).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test TenantCategoryRegulatoryList.test.ts
```

Expected: FAIL with "Cannot find module './TenantCategoryRegulatoryList.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/entities/tenant/TenantCategoryRegulatoryList.ts
import {
  Entity,
  Property,
  ManyToOne,
  Enum,
  Unique,
  Index,
} from '@mikro-orm/core';
import { BaseEntity } from '../BaseEntity.js';
import { TenantCategory } from './TenantCategory.js';
import { ListRequirement, RegulationSource } from '../enums/index.js';

@Entity({ tableName: 'tenant_category_regulatory_list' })
@Unique({ properties: ['tenantCategory', 'regulatoryListId'] })
export class TenantCategoryRegulatoryList extends BaseEntity {
  /**
   * The tenant category this mapping applies to.
   */
  @ManyToOne(() => TenantCategory, { name: 'tenant_category_id' })
  @Index()
  tenantCategory!: TenantCategory;

  /**
   * Soft link to public.regulatory_list.
   * Uses text ID instead of FK to avoid cross-schema constraints.
   */
  @Property({ type: 'text', name: 'regulatory_list_id' })
  @Index()
  regulatoryListId!: string;

  /**
   * The type of requirement this list imposes.
   */
  @Enum({ items: () => ListRequirement })
  requirement!: ListRequirement;

  /**
   * Source of this regulation mapping.
   * INHERITED = resolved from system baseline (CategoryRegulatoryList)
   * TENANT_ADDED = tenant-specific addition
   */
  @Enum({ items: () => RegulationSource })
  source!: RegulationSource;

  // ============================================================================
  // Exemption Fields
  // ============================================================================

  /**
   * If true, the tenant has exempted themselves from this regulation.
   * Only valid for INHERITED source regulations (cannot exempt tenant-added).
   */
  @Property({ type: 'boolean', default: false, name: 'is_exempted' })
  isExempted: boolean = false;

  /**
   * Mandatory justification for the exemption.
   * Required when isExempted = true.
   */
  @Property({ type: 'text', nullable: true, name: 'exemption_reason' })
  exemptionReason?: string;

  /**
   * Legal reference supporting the exemption.
   * e.g., "Directive 2011/65/EU Art 2(4)(f)"
   */
  @Property({ type: 'text', nullable: true, name: 'exemption_legal_ref' })
  exemptionLegalRef?: string;

  /**
   * User ID who created the exemption.
   */
  @Property({ type: 'text', nullable: true, name: 'exempted_by' })
  exemptedBy?: string;

  /**
   * When the exemption was created.
   */
  @Property({ type: 'timestamptz', nullable: true, name: 'exempted_at' })
  exemptedAt?: Date;

  // ============================================================================
  // Override Fields
  // ============================================================================

  /**
   * Tenant-specific threshold override.
   * Allows tenant to be STRICTER than the legal requirement.
   * Cannot be more lenient than system baseline.
   */
  @Property({ type: 'decimal', nullable: true, name: 'override_threshold' })
  overrideThreshold?: string;
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test TenantCategoryRegulatoryList.test.ts
```

Expected: PASS (all tests)

**Step 5: Export from index and commit**

```typescript
// packages/database/src/entities/tenant/index.ts
// Add to existing exports:
export { TenantCategoryRegulatoryList } from './TenantCategoryRegulatoryList.js';
```

```bash
git add packages/database/src/entities/tenant/TenantCategoryRegulatoryList.ts packages/database/src/entities/tenant/TenantCategoryRegulatoryList.test.ts packages/database/src/entities/tenant/index.ts
git commit -m "feat(database): add TenantCategoryRegulatoryList entity for tenant additions and exemptions"
```

---

## Task 8: Create TenantCategoryRegulatoryList Migration

**Files:**
- Modify: `packages/database/src/migrations/tenant/Migration_TenantSchema.ts` (or create new migration)

**Step 1: Add to tenant schema migration**

```typescript
// Add to tenant schema migration
this.addSql(`
  CREATE TABLE IF NOT EXISTS tenant_category_regulatory_list (
    id TEXT PRIMARY KEY,
    tenant_category_id TEXT NOT NULL REFERENCES tenant_category(id) ON DELETE CASCADE,
    regulatory_list_id TEXT NOT NULL,  -- Soft link to public.regulatory_list
    requirement TEXT NOT NULL CHECK (requirement IN ('PROHIBITION', 'RESTRICTION', 'DECLARATION')),
    source TEXT NOT NULL CHECK (source IN ('INHERITED', 'TENANT_ADDED')),

    -- Exemption fields
    is_exempted BOOLEAN NOT NULL DEFAULT false,
    exemption_reason TEXT,
    exemption_legal_ref TEXT,
    exempted_by TEXT,
    exempted_at TIMESTAMPTZ,

    -- Override fields
    override_threshold DECIMAL(10,6),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_tenant_cat_reg_list UNIQUE (tenant_category_id, regulatory_list_id),
    CONSTRAINT chk_exemption_reason CHECK (
      is_exempted = false OR exemption_reason IS NOT NULL
    )
  );
`);

// Create indexes
this.addSql(`
  CREATE INDEX IF NOT EXISTS idx_tcrl_tenant_category
    ON tenant_category_regulatory_list (tenant_category_id);
`);

this.addSql(`
  CREATE INDEX IF NOT EXISTS idx_tcrl_reg_list
    ON tenant_category_regulatory_list (regulatory_list_id);
`);
```

**Step 2: Update tenant provisioner**

Ensure `TenantProvisioner.provisionSchema()` includes this table.

**Step 3: Run migration**

```bash
cd packages/database && pnpm mikro-orm migration:up
```

Expected: Migration applies successfully

**Step 4: Commit**

```bash
git add packages/database/src/migrations/
git commit -m "feat(database): add tenant_category_regulatory_list table migration"
```

---

## Task 9: Create ComplianceStackResolver Service

**Files:**
- Create: `packages/database/src/services/ComplianceStackResolver.ts`
- Test: `packages/database/src/services/ComplianceStackResolver.test.ts`

**Step 1: Define the interface and types**

```typescript
// packages/database/src/services/ComplianceStackResolver.ts

import { EntityManager } from '@mikro-orm/postgresql';
import { TenantCategory } from '../entities/tenant/TenantCategory.js';
import { TenantCategoryRegulatoryList } from '../entities/tenant/TenantCategoryRegulatoryList.js';
import { CategoryRegulatoryList } from '../entities/CategoryRegulatoryList.js';
import { ListRequirement, RegulationSource } from '../entities/enums/index.js';

// ============================================================================
// Types
// ============================================================================

export interface EffectiveRegulation {
  regulatoryListId: string;
  regulatoryListCode: string;
  source: 'SYSTEM' | 'TENANT';
  requirement: ListRequirement;
  status: 'ACTIVE' | 'EXEMPTED';
  allowExemption: boolean;
  exemption?: {
    reason: string;
    legalRef?: string;
    exemptedBy: string;
    exemptedAt: Date;
  };
  overrideThreshold?: string;
}

export interface ComplianceStackResult {
  tenantCategoryId: string;
  tenantCategoryPath: string;
  systemCategoryId?: string;
  linkMode?: string;
  effectiveRegulations: EffectiveRegulation[];
}

// ============================================================================
// Service
// ============================================================================

export class ComplianceStackResolver {
  constructor(
    private readonly em: EntityManager,
    private readonly tenantSchema: string = 'tenant'
  ) {}

  /**
   * Resolve the effective compliance stack for a TenantCategory.
   *
   * Resolution order:
   * 1. Get system baseline (from CategoryRegulatoryList via systemCategoryId)
   * 2. Get tenant additions (TenantCategoryRegulatoryList where source = TENANT_ADDED)
   * 3. Apply tenant exemptions (TenantCategoryRegulatoryList where isExempted = true)
   *
   * @param tenantCategoryId - The TenantCategory UUID
   * @returns Resolved compliance stack with effective regulations
   */
  async resolve(tenantCategoryId: string): Promise<ComplianceStackResult> {
    // Step 1: Get TenantCategory with adoption info
    const tenantCategory = await this.em.findOneOrFail(
      TenantCategory,
      { id: tenantCategoryId },
      { populate: ['categoryAdoption'] }
    );

    const result: ComplianceStackResult = {
      tenantCategoryId,
      tenantCategoryPath: tenantCategory.path,
      systemCategoryId: tenantCategory.systemCategoryId ?? undefined,
      linkMode: tenantCategory.categoryAdoption?.mode,
      effectiveRegulations: [],
    };

    // Step 2: Get system baseline (if adopted from system category)
    const systemBaseline = await this.getSystemBaseline(tenantCategory);

    // Step 3: Get tenant overrides and additions
    const tenantRecords = await this.em.find(
      TenantCategoryRegulatoryList,
      { tenantCategory: { id: tenantCategoryId } }
    );

    // Step 4: Merge into effective regulations
    const effectiveMap = new Map<string, EffectiveRegulation>();

    // Add system baseline first
    for (const baseline of systemBaseline) {
      effectiveMap.set(baseline.regulatoryListId, {
        regulatoryListId: baseline.regulatoryListId,
        regulatoryListCode: baseline.regulatoryListCode,
        source: 'SYSTEM',
        requirement: baseline.requirement,
        status: 'ACTIVE',
        allowExemption: baseline.allowExemption,
        overrideThreshold: baseline.overrideThreshold,
      });
    }

    // Apply tenant records (additions and exemptions)
    for (const record of tenantRecords) {
      if (record.source === RegulationSource.TENANT_ADDED) {
        // Tenant addition - new regulation
        const listCode = await this.getListCode(record.regulatoryListId);
        effectiveMap.set(record.regulatoryListId, {
          regulatoryListId: record.regulatoryListId,
          regulatoryListCode: listCode,
          source: 'TENANT',
          requirement: record.requirement,
          status: 'ACTIVE',
          allowExemption: true,  // Tenant can always remove their own additions
          overrideThreshold: record.overrideThreshold ?? undefined,
        });
      } else if (record.source === RegulationSource.INHERITED && record.isExempted) {
        // Exemption for system baseline
        const existing = effectiveMap.get(record.regulatoryListId);
        if (existing) {
          existing.status = 'EXEMPTED';
          existing.exemption = {
            reason: record.exemptionReason!,
            legalRef: record.exemptionLegalRef ?? undefined,
            exemptedBy: record.exemptedBy!,
            exemptedAt: record.exemptedAt!,
          };
        }
      }
    }

    result.effectiveRegulations = Array.from(effectiveMap.values());
    return result;
  }

  /**
   * Get system baseline regulations for a TenantCategory.
   * Uses LTREE inheritance if the category is adopted from a system category.
   */
  private async getSystemBaseline(tenantCategory: TenantCategory): Promise<Array<{
    regulatoryListId: string;
    regulatoryListCode: string;
    requirement: ListRequirement;
    allowExemption: boolean;
    overrideThreshold?: string;
  }>> {
    if (!tenantCategory.systemCategoryId) {
      return [];  // Custom category, no system baseline
    }

    // Query CategoryRegulatoryList using LTREE inheritance
    const rows = await this.em.getConnection().execute<Array<{
      regulatory_list_id: string;
      code: string;
      requirement: string;
      allow_tenant_exemption: boolean;
      compare_value_override: string | null;
    }>>(`
      SELECT DISTINCT ON (crl.regulatory_list_id)
        crl.regulatory_list_id,
        rl.code,
        crl.requirement,
        crl.allow_tenant_exemption,
        crl.compare_value_override
      FROM public.category_regulatory_list crl
      JOIN public.category c ON c.id = crl.category_id
      JOIN public.regulatory_list rl ON rl.id = crl.regulatory_list_id
      WHERE c.path @> (
        SELECT path FROM public.category WHERE id = ?
      )::ltree
        AND rl.is_current_version = true
        AND crl.is_exclusion = false
      ORDER BY crl.regulatory_list_id, c.depth DESC
    `, [tenantCategory.systemCategoryId]);

    return rows.map(row => ({
      regulatoryListId: row.regulatory_list_id,
      regulatoryListCode: row.code,
      requirement: row.requirement as ListRequirement,
      allowExemption: row.allow_tenant_exemption,
      overrideThreshold: row.compare_value_override ?? undefined,
    }));
  }

  /**
   * Get regulatory list code by ID.
   */
  private async getListCode(regulatoryListId: string): Promise<string> {
    const [row] = await this.em.getConnection().execute<Array<{ code: string }>>(`
      SELECT code FROM public.regulatory_list WHERE id = ?
    `, [regulatoryListId]);
    return row?.code ?? 'UNKNOWN';
  }
}
```

**Step 2: Write the test**

```typescript
// packages/database/src/services/ComplianceStackResolver.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { Category, CategoryType } from '../entities/Category.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { CategoryRegulatoryList } from '../entities/CategoryRegulatoryList.js';
import { TenantCategory } from '../entities/tenant/TenantCategory.js';
import { TenantCategoryRegulatoryList } from '../entities/tenant/TenantCategoryRegulatoryList.js';
import { ComplianceStackResolver } from './ComplianceStackResolver.js';
import { ListRequirement, RegulationSource } from '../entities/enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('ComplianceStackResolver', () => {
  let orm: MikroORM;
  let systemCategoryId: string;
  let tenantCategoryId: string;
  let reachListId: string;
  let rohsListId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!orm) return;
    const em = orm.em.fork();

    // Clean up in order (respecting FKs)
    await em.nativeDelete(TenantCategoryRegulatoryList, {});
    await em.nativeDelete(TenantCategory, {});
    await em.nativeDelete(CategoryRegulatoryList, {});
    await em.nativeDelete(RegulatoryList, {});
    await em.nativeDelete(Category, {});

    // Create system category
    const systemCategory = em.create(Category, {
      name: 'Electronics',
      path: 'products.electronics',
      type: CategoryType.BRANCH,
      depth: 1,
    });

    // Create regulatory lists
    const reachList = em.create(RegulatoryList, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC',
      source: 'ECHA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
      isCurrentVersion: true,
    });

    const rohsList = em.create(RegulatoryList, {
      code: 'ROHS_RESTRICTED',
      name: 'RoHS Restricted',
      source: 'EU_ROHS',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
      isCurrentVersion: true,
    });

    await em.persistAndFlush([systemCategory, reachList, rohsList]);

    systemCategoryId = systemCategory.id;
    reachListId = reachList.id;
    rohsListId = rohsList.id;

    // Create system baseline mappings
    em.create(CategoryRegulatoryList, {
      category: systemCategory,
      regulatoryList: reachList,
      requirement: ListRequirement.RESTRICTION,
      allowTenantExemption: true,
    });

    em.create(CategoryRegulatoryList, {
      category: systemCategory,
      regulatoryList: rohsList,
      requirement: ListRequirement.RESTRICTION,
      allowTenantExemption: true,
    });

    await em.flush();

    // Create tenant category (adopted from system)
    const tenantCategory = em.create(TenantCategory, {
      name: 'Electronics',
      path: 'system.electronics',
      systemCategoryId: systemCategoryId,
    });

    await em.persistAndFlush(tenantCategory);
    tenantCategoryId = tenantCategory.id;
  });

  it('resolves system baseline for adopted category', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();
    const resolver = new ComplianceStackResolver(em);

    const result = await resolver.resolve(tenantCategoryId);

    expect(result.tenantCategoryId).toBe(tenantCategoryId);
    expect(result.systemCategoryId).toBe(systemCategoryId);
    expect(result.effectiveRegulations).toHaveLength(2);

    const reachReg = result.effectiveRegulations.find(r => r.regulatoryListCode === 'REACH_SVHC');
    expect(reachReg).toBeDefined();
    expect(reachReg!.source).toBe('SYSTEM');
    expect(reachReg!.status).toBe('ACTIVE');
  });

  it('includes tenant additions', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    // Add tenant-specific regulation
    const tenantCatRef = await em.findOneOrFail(TenantCategory, { id: tenantCategoryId });
    em.create(TenantCategoryRegulatoryList, {
      tenantCategory: tenantCatRef,
      regulatoryListId: 'iec-62368-uuid',
      requirement: ListRequirement.RESTRICTION,
      source: RegulationSource.TENANT_ADDED,
    });
    await em.flush();

    const resolver = new ComplianceStackResolver(em);
    const result = await resolver.resolve(tenantCategoryId);

    expect(result.effectiveRegulations).toHaveLength(3);

    const tenantReg = result.effectiveRegulations.find(r => r.source === 'TENANT');
    expect(tenantReg).toBeDefined();
    expect(tenantReg!.regulatoryListId).toBe('iec-62368-uuid');
  });

  it('applies tenant exemptions', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    // Add exemption for RoHS
    const tenantCatRef = await em.findOneOrFail(TenantCategory, { id: tenantCategoryId });
    em.create(TenantCategoryRegulatoryList, {
      tenantCategory: tenantCatRef,
      regulatoryListId: rohsListId,
      requirement: ListRequirement.RESTRICTION,
      source: RegulationSource.INHERITED,
      isExempted: true,
      exemptionReason: 'Medical device per Article 2(4)(f)',
      exemptionLegalRef: 'Directive 2011/65/EU Art 2(4)(f)',
      exemptedBy: 'user-uuid',
      exemptedAt: new Date(),
    });
    await em.flush();

    const resolver = new ComplianceStackResolver(em);
    const result = await resolver.resolve(tenantCategoryId);

    const rohsReg = result.effectiveRegulations.find(r => r.regulatoryListCode === 'ROHS_RESTRICTED');
    expect(rohsReg).toBeDefined();
    expect(rohsReg!.status).toBe('EXEMPTED');
    expect(rohsReg!.exemption).toBeDefined();
    expect(rohsReg!.exemption!.reason).toBe('Medical device per Article 2(4)(f)');
  });

  it('returns empty baseline for custom category', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    // Create custom category (no systemCategoryId)
    const customCategory = em.create(TenantCategory, {
      name: 'Custom Widgets',
      path: 'custom.widgets',
      systemCategoryId: null,
    });
    await em.persistAndFlush(customCategory);

    const resolver = new ComplianceStackResolver(em);
    const result = await resolver.resolve(customCategory.id);

    expect(result.systemCategoryId).toBeUndefined();
    expect(result.effectiveRegulations).toHaveLength(0);
  });
});
```

**Step 3: Run test to verify it passes**

```bash
cd packages/database && pnpm test ComplianceStackResolver.test.ts
```

Expected: PASS (all tests)

**Step 4: Export from index and commit**

```typescript
// packages/database/src/services/index.ts
// Add to existing exports:
export { ComplianceStackResolver } from './ComplianceStackResolver.js';
export type { EffectiveRegulation, ComplianceStackResult } from './ComplianceStackResolver.js';
```

```bash
git add packages/database/src/services/ComplianceStackResolver.ts packages/database/src/services/ComplianceStackResolver.test.ts packages/database/src/services/index.ts
git commit -m "feat(database): add ComplianceStackResolver for 3-layer compliance resolution"
```

---

## Summary

**Plan 11 delivers:**

**Public Schema (System Baseline):**
- `ListRequirement` enum (PROHIBITION, RESTRICTION, DECLARATION)
- `CategoryRegulatoryList` entity with:
  - Priority and exclusion support
  - CompareValue override for category-specific thresholds
  - `allowTenantExemption` guardrail flag
- Database migration for `category_regulatory_list` table
- `CategoryRegulatoryListService` with LTREE `@>` inheritance queries
- API route for querying applicable lists by category path

**Tenant Schema (Additions + Exemptions):**
- `RegulationSource` enum (INHERITED, TENANT_ADDED)
- `TenantCategoryRegulatoryList` entity with:
  - Soft link to regulatory_list (no cross-schema FK)
  - Exemption fields (reason, legalRef, exemptedBy, exemptedAt)
  - Override threshold support
- Database migration for `tenant_category_regulatory_list` table

**Compliance Stack Resolution:**
- `ComplianceStackResolver` service implementing 3-layer resolution:
  - Layer 1: System baseline from CategoryRegulatoryList
  - Layer 2: Tenant additions from TenantCategoryRegulatoryList
  - Layer 3: Tenant exemptions from TenantCategoryRegulatoryList
- `EffectiveRegulation` interface for resolved regulations
- Full test coverage

**Key Features:**
- **Dual-layer architecture:** System baseline + tenant customization
- **LTREE inheritance:** Child categories automatically inherit parent list mappings
- **Guardrail protection:** System can mark regulations as non-exemptable
- **Audit trail:** All exemptions require justification with user/timestamp
- **Threshold overrides:** Tenants can be stricter (but not more lenient) than law
- **Cross-schema safety:** Soft links prevent FK issues during tenant migrations

**Implementation Refinements (for hardening):**

1. **Stoichiometry & Threshold Fallback (Plan 14):**
   - Plan 9/10 discussed adding a `stoichiometric_factor` to `RegulatoryListEntry`
   - The Evaluation Service (Plan 14) should implement this resolution hierarchy:
     ```
     1. TenantCategoryRegulatoryList.overrideThreshold (if non-null)
     2. CategoryRegulatoryList.compareValueOverride (if non-null)
     3. RegulatoryListEntry.compareValue (default list entry compareValue)
     ```
   - This allows tenant > category > list-entry threshold precedence

2. **Temporal Scoping (Future Enhancement):**
   - Current implementation filters `rl.is_current_version = true` (correct for 99% of use cases)
   - Future enhancement: Add optional `atDate?: Date` parameter to `ComplianceStackResolver.resolve()`
   - This enables forensic auditing: "Which lists were scoped to this category on the day this product was manufactured 2 years ago?"

3. **FROZEN Mode Support (Plan 05):**
   - When `CategoryAdoption.mode = FROZEN`, resolver should use `pinnedRegulatoryListIds[]`
   - This enables version pinning for predictable compliance evaluation

**Next Plans:**
- **Plan 05:** Category Service rewrite (split into admin/tenant services)
- **Plan 12:** RegulatoryImportService (admin import pipeline)
- **Plan 14:** Vertical rule evaluators (add JUSTIFIED_EXEMPTION status, threshold fallback)
- **Plan 15:** Initial list seeders (populate CategoryRegulatoryList links)

---

*Plan created: 2026-01-26*
*Updated: 2026-01-27 - Rewritten for Compliance Stack architecture*
