# Taxonomy Plan 11: Category-List Scoping

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement CategoryRegulatoryList join table enabling LTREE-based inheritance of regulatory requirements from category hierarchy.

**Architecture:** Create `CategoryRegulatoryList` entity linking Categories to RegulatoryLists with priority, exclusion, and threshold override support. Service provides LTREE `@>` queries for resolving all applicable lists for a product category, respecting inheritance and exclusions.

**Tech Stack:** MikroORM, PostgreSQL LTREE, TypeScript

**Prerequisites:**
- Plan 5 (Category Service) must be completed first
- Plan 10 (Regulatory List Registry) must be completed first

**Reference:** See `docs/plans/2026-01-26-regulatory-vertical-system-design.md` Section 1.3, 3

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
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Category, CategoryType } from './Category.js';
import { RegulatoryList } from './RegulatoryList.js';
import { CategoryRegulatoryList } from './CategoryRegulatoryList.js';
import { ListRequirement } from './enums/index.js';
import testConfig from '../mikro-orm.config.test.js';

describe('CategoryRegulatoryList Entity', () => {
  let orm: MikroORM<PostgreSqlDriver>;
  let rootCategory: Category;
  let childCategory: Category;
  let regulatoryList: RegulatoryList;

  beforeAll(async () => {
    orm = await MikroORM.init<PostgreSqlDriver>({
      ...testConfig,
      entities: [Category, RegulatoryList, CategoryRegulatoryList],
      allowGlobalContext: true,
    });
    await orm.getSchemaGenerator().refreshDatabase();
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    const em = orm.em.fork();
    await em.nativeDelete(CategoryRegulatoryList, {});
    await em.nativeDelete(RegulatoryList, {});
    await em.nativeDelete(Category, {});

    // Create category hierarchy
    rootCategory = em.create(Category, {
      name: 'Products',
      path: 'products',
      type: CategoryType.ROOT,
      depth: 0,
    });

    childCategory = em.create(Category, {
      name: 'Cosmetics',
      path: 'products.cosmetics',
      type: CategoryType.BRANCH,
      depth: 1,
      parent: rootCategory,
    });

    // Create regulatory list
    regulatoryList = em.create(RegulatoryList, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC Candidate List',
      source: 'ECHA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
    });

    await em.persistAndFlush([rootCategory, childCategory, regulatoryList]);
  });

  it('should create a category-list mapping', async () => {
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { path: 'products' });
    const listRef = await em.findOneOrFail(RegulatoryList, { code: 'REACH_SVHC' });

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

  it('should support priority for same-depth ordering', async () => {
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { path: 'products' });
    const listRef = await em.findOneOrFail(RegulatoryList, { code: 'REACH_SVHC' });

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

  it('should support exclusion flag', async () => {
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { path: 'products.cosmetics' });
    const listRef = await em.findOneOrFail(RegulatoryList, { code: 'REACH_SVHC' });

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

  it('should support threshold override', async () => {
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { path: 'products.cosmetics' });
    const listRef = await em.findOneOrFail(RegulatoryList, { code: 'REACH_SVHC' });

    const mapping = em.create(CategoryRegulatoryList, {
      category: catRef,
      regulatoryList: listRef,
      requirement: ListRequirement.RESTRICTION,
      thresholdOverridePct: '0.01',  // Stricter for cosmetics
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(CategoryRegulatoryList, { category: catRef });
    expect(found.thresholdOverridePct).toBe('0.01');
  });

  it('should enforce unique constraint on category + list', async () => {
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { path: 'products' });
    const listRef = await em.findOneOrFail(RegulatoryList, { code: 'REACH_SVHC' });

    const mapping1 = em.create(CategoryRegulatoryList, {
      category: catRef,
      regulatoryList: listRef,
      requirement: ListRequirement.RESTRICTION,
    });
    await em.persistAndFlush(mapping1);

    const mapping2 = em.create(CategoryRegulatoryList, {
      category: catRef,
      regulatoryList: listRef,  // Same category + list
      requirement: ListRequirement.PROHIBITION,
    });

    await expect(em.persistAndFlush(mapping2)).rejects.toThrow();
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
   * Category-specific threshold override.
   * When set, this threshold is used instead of the default list entry threshold.
   * Example: Toys might have 0.01% while general products allow 0.1%.
   */
  @Property({ type: 'decimal', precision: 5, scale: 4, nullable: true, name: 'threshold_override_pct' })
  thresholdOverridePct?: string;
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
        threshold_override_pct NUMERIC(5,4),
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
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Category, CategoryType } from '../entities/Category.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { CategoryRegulatoryList } from '../entities/CategoryRegulatoryList.js';
import { CategoryRegulatoryListService } from './CategoryRegulatoryListService.js';
import { ListRequirement } from '../entities/enums/index.js';
import testConfig from '../mikro-orm.config.test.js';

describe('CategoryRegulatoryListService', () => {
  let orm: MikroORM<PostgreSqlDriver>;

  beforeAll(async () => {
    orm = await MikroORM.init<PostgreSqlDriver>({
      ...testConfig,
      entities: [Category, RegulatoryList, CategoryRegulatoryList],
      allowGlobalContext: true,
    });
    await orm.getSchemaGenerator().refreshDatabase();
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
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
    it('should return lists inherited from ancestors', async () => {
      const em = orm.em.fork();
      const service = new CategoryRegulatoryListService(em);

      // Moisturizers should inherit: REACH_SVHC (from root), COSING II & III (from cosmetics)
      const lists = await service.getListsForCategory('products.cosmetics.skincare.moisturizers');

      expect(lists).toHaveLength(3);
      const codes = lists.map(l => l.regulatoryList.code).sort();
      expect(codes).toEqual(['COSING_ANNEX_II', 'COSING_ANNEX_III', 'REACH_SVHC']);
    });

    it('should return only applicable lists for electronics', async () => {
      const em = orm.em.fork();
      const service = new CategoryRegulatoryListService(em);

      // Electronics should get: REACH_SVHC (from root), ROHS (direct)
      const lists = await service.getListsForCategory('products.electronics');

      expect(lists).toHaveLength(2);
      const codes = lists.map(l => l.regulatoryList.code).sort();
      expect(codes).toEqual(['REACH_SVHC', 'ROHS_RESTRICTED']);
    });

    it('should return lists ordered by depth (most specific first)', async () => {
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
    it('should respect exclusions from child categories', async () => {
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

  describe('getListsForCategory with threshold override', () => {
    it('should return threshold override when set', async () => {
      const em = orm.em.fork();
      const service = new CategoryRegulatoryListService(em);

      // Add stricter threshold for cosmetics on REACH
      const cosmeticsRef = await em.findOneOrFail(Category, { path: 'products.cosmetics' });
      const reachRef = await em.findOneOrFail(RegulatoryList, { code: 'REACH_SVHC' });

      em.create(CategoryRegulatoryList, {
        category: cosmeticsRef,
        regulatoryList: reachRef,
        requirement: ListRequirement.RESTRICTION,
        thresholdOverridePct: '0.01',  // Stricter than default 0.1%
      });
      await em.flush();

      const lists = await service.getListsForCategory('products.cosmetics.skincare.moisturizers');

      const reachMapping = lists.find(l => l.regulatoryList.code === 'REACH_SVHC');
      expect(reachMapping?.thresholdOverridePct).toBe('0.01');
    });
  });

  describe('getCurrentListsWithEntries', () => {
    it('should return lists with their entries populated', async () => {
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
  thresholdOverridePct?: string;
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
      threshold_override_pct: string | null;
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
        crl.threshold_override_pct,
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
    thresholdOverridePct?: string;
  }): Promise<CategoryRegulatoryList> {
    const category = await this.em.findOneOrFail(Category, { id: input.categoryId });
    const list = await this.em.findOneOrFail(RegulatoryList, { id: input.regulatoryListId });

    const mapping = this.em.create(CategoryRegulatoryList, {
      category,
      regulatoryList: list,
      requirement: input.requirement,
      priority: input.priority ?? 0,
      isExclusion: input.isExclusion ?? false,
      thresholdOverridePct: input.thresholdOverridePct,
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
import { EntityManager } from '@mikro-orm/postgresql';
import { CategoryRegulatoryListService } from '@eurocomply/database';
import type { Env } from '../../app.js';

interface RouterDeps {
  em: EntityManager;
}

export function createCategoryListsRouter(deps: RouterDeps): Hono<Env> {
  const router = new Hono<Env>();

  // GET /taxonomy/categories/:path/regulatory-lists
  // Get all regulatory lists applicable to a category (with inheritance)
  router.get('/:path/regulatory-lists', async (c) => {
    const categoryPath = c.req.param('path');
    const em = deps.em.fork();
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
          thresholdOverridePct: m.thresholdOverridePct,
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
taxonomy.route('/categories', createCategoryListsRouter({ em }));
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

## Summary

**Plan 11 delivers:**
- `ListRequirement` enum
- `CategoryRegulatoryList` entity with priority, exclusion, threshold override
- Database migration
- `CategoryRegulatoryListService` with LTREE `@>` inheritance queries
- API route for querying applicable lists by category path
- Full test coverage

**Key Features:**
- LTREE inheritance: child categories automatically inherit parent list mappings
- Exclusions: child categories can exempt themselves from inherited lists
- Priority: ordering when multiple lists at same depth
- Threshold override: category-specific stricter thresholds

**Next Plans:**
- **Plan 12:** RegulatoryImportService (admin import pipeline)
- **Plan 14:** Vertical rule evaluators
- **Plan 15:** Initial list seeders

---

*Plan created: 2026-01-26*
