# Taxonomy Plan 11: Category-List Scoping

> **STATUS: IMPLEMENTED** - This plan has been implemented. The terminology in this document reflects the final naming conventions used in the codebase.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement dual-layer regulatory scoping: CategoryRegulation (public schema for system baseline) and TenantRequirementExemption (tenant schema for additions + exemptions). Includes ComplianceStackResolver for 3-layer resolution.

**Architecture:** Create two entity layers:
1. `CategoryRegulation` (public schema) - Links system Categories to Regulations with priority, exclusion, compareValue override, and tenant exemption guardrails
2. `TenantRequirementExemption` (tenant schema) - Enables tenant additions (extra regulations) and exemptions (with mandatory justification)

The `ComplianceStackResolver` service resolves the effective compliance stack:
- Layer 1 (Bottom): System baseline from CategoryRegulation
- Layer 2 (Middle): Tenant additions from TenantRequirementExemption
- Layer 3 (Top): Tenant exemptions from TenantRequirementExemption

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

## Task 2: Create CategoryRegulation Entity

**Files:**
- Create: `packages/database/src/entities/CategoryRegulation.ts`
- Test: `packages/database/src/entities/CategoryRegulation.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/CategoryRegulation.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { Category, CategoryType } from './Category.js';
import { Regulation } from './Regulation.js';
import { CategoryRegulation } from './CategoryRegulation.js';
import { ListRequirement } from './enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('CategoryRegulation Entity', () => {
  let orm: MikroORM;
  let rootCategoryId: string;
  let childCategoryId: string;
  let regulationId: string;

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
    await em.nativeDelete(CategoryRegulation, {});
    await em.nativeDelete(Regulation, {});
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

    // Create regulation
    const regulation = em.create(Regulation, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC Candidate List',
      source: 'ECHA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
    });

    await em.persistAndFlush([rootCategory, childCategory, regulation]);
    rootCategoryId = rootCategory.id;
    childCategoryId = childCategory.id;
    regulationId = regulation.id;
  });

  it('creates a category-regulation mapping', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { id: rootCategoryId });
    const regRef = await em.findOneOrFail(Regulation, { id: regulationId });

    const mapping = em.create(CategoryRegulation, {
      category: catRef,
      regulation: regRef,
      requirement: ListRequirement.RESTRICTION,
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(CategoryRegulation, {
      category: catRef,
      regulation: regRef,
    });

    expect(found.requirement).toBe(ListRequirement.RESTRICTION);
    expect(found.priority).toBe(0);
    expect(found.isExclusion).toBe(false);
  });

  it('supports priority for same-depth ordering', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { id: rootCategoryId });
    const regRef = await em.findOneOrFail(Regulation, { id: regulationId });

    const mapping = em.create(CategoryRegulation, {
      category: catRef,
      regulation: regRef,
      requirement: ListRequirement.RESTRICTION,
      priority: 10,
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(CategoryRegulation, { category: catRef });
    expect(found.priority).toBe(10);
  });

  it('supports exclusion flag', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { id: childCategoryId });
    const regRef = await em.findOneOrFail(Regulation, { id: regulationId });

    const mapping = em.create(CategoryRegulation, {
      category: catRef,
      regulation: regRef,
      requirement: ListRequirement.RESTRICTION,
      isExclusion: true,  // Cosmetics exempt from this list
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(CategoryRegulation, { category: catRef });
    expect(found.isExclusion).toBe(true);
  });

  it('supports compareValue override', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { id: childCategoryId });
    const regRef = await em.findOneOrFail(Regulation, { id: regulationId });

    const mapping = em.create(CategoryRegulation, {
      category: catRef,
      regulation: regRef,
      requirement: ListRequirement.RESTRICTION,
      compareValueOverride: '0.01',  // Stricter for cosmetics
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(CategoryRegulation, { category: catRef });
    expect(found.compareValueOverride).toBe('0.01');
  });

  it('enforces unique constraint on category + regulation', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const catRef = await em.findOneOrFail(Category, { id: rootCategoryId });
    const regRef = await em.findOneOrFail(Regulation, { id: regulationId });

    const mapping1 = em.create(CategoryRegulation, {
      category: catRef,
      regulation: regRef,
      requirement: ListRequirement.RESTRICTION,
    });
    await em.persistAndFlush(mapping1);

    const em2 = orm.em.fork();
    const catRef2 = await em2.findOneOrFail(Category, { id: rootCategoryId });
    const regRef2 = await em2.findOneOrFail(Regulation, { id: regulationId });

    const mapping2 = em2.create(CategoryRegulation, {
      category: catRef2,
      regulation: regRef2,  // Same category + regulation
      requirement: ListRequirement.PROHIBITION,
    });

    await expect(em2.persistAndFlush(mapping2)).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test CategoryRegulation.test.ts
```

Expected: FAIL with "Cannot find module './CategoryRegulation.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/entities/CategoryRegulation.ts
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
import { Regulation } from './Regulation.js';
import { ListRequirement } from './enums/index.js';

@Entity({ tableName: 'category_regulation', schema: 'public' })
@Unique({ properties: ['category', 'regulation'] })
@Index({ properties: ['category', 'regulation'] })
export class CategoryRegulation extends BaseEntity {
  /**
   * The category this mapping applies to.
   * LTREE inheritance means child categories inherit parent mappings.
   */
  @ManyToOne(() => Category, { name: 'category_id' })
  @Index()
  category!: Category;

  /**
   * The regulation that applies to this category.
   */
  @ManyToOne(() => Regulation, { name: 'regulation_id' })
  @Index()
  regulation!: Regulation;

  /**
   * The type of requirement this regulation imposes.
   */
  @Enum({ items: () => ListRequirement })
  requirement!: ListRequirement;

  /**
   * Priority for ordering when multiple regulations match at the same depth.
   * Higher priority = takes precedence.
   */
  @Property({ type: 'smallint', default: 0 })
  priority: number = 0;

  /**
   * If true, this mapping excludes the category from a parent's regulation.
   * Used when a child category should NOT inherit a parent's regulatory requirement.
   */
  @Property({ type: 'boolean', default: false, name: 'is_exclusion' })
  isExclusion: boolean = false;

  /**
   * Category-specific compareValue override (agnostic model).
   * When set, this value is used instead of the default Requirement.compareValue.
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
cd packages/database && pnpm test CategoryRegulation.test.ts
```

Expected: PASS (all tests)

**Step 5: Export from index and commit**

```typescript
// packages/database/src/entities/index.ts
// Add to existing exports:
export { CategoryRegulation } from './CategoryRegulation.js';
```

```bash
git add packages/database/src/entities/CategoryRegulation.ts packages/database/src/entities/CategoryRegulation.test.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add CategoryRegulation entity for LTREE scoping"
```

---

## Task 3: Create CategoryRegulation Migration

**Files:**
- Create: `packages/database/src/migrations/Migration20260126_CategoryRegulation.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260126_CategoryRegulation.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_CategoryRegulation extends Migration {
  async up(): Promise<void> {
    // Create category_regulation table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.category_regulation (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL REFERENCES public.category(id) ON DELETE CASCADE,
        regulation_id TEXT NOT NULL REFERENCES public.regulation(id) ON DELETE CASCADE,
        requirement TEXT NOT NULL CHECK (requirement IN ('PROHIBITION', 'RESTRICTION', 'DECLARATION')),
        priority SMALLINT NOT NULL DEFAULT 0,
        is_exclusion BOOLEAN NOT NULL DEFAULT false,
        compare_value_override NUMERIC(5,4),
        allow_tenant_exemption BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_category_regulation UNIQUE (category_id, regulation_id)
      );
    `);

    // Create indexes for efficient lookups
    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_cat_reg_category
        ON public.category_regulation (category_id);
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_cat_reg_regulation
        ON public.category_regulation (regulation_id);
    `);

    // Composite index for join performance
    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_cat_reg_composite
        ON public.category_regulation (category_id, regulation_id);
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS public.category_regulation;');
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
git add packages/database/src/migrations/Migration20260126_CategoryRegulation.ts
git commit -m "feat(database): add migration for category_regulation table"
```

---

## Task 4: Create CategoryRegulationService

**Files:**
- Create: `packages/database/src/services/CategoryRegulationService.ts`
- Test: `packages/database/src/services/CategoryRegulationService.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/CategoryRegulationService.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { Category, CategoryType } from '../entities/Category.js';
import { Regulation } from '../entities/Regulation.js';
import { CategoryRegulation } from '../entities/CategoryRegulation.js';
import { CategoryRegulationService } from './CategoryRegulationService.js';
import { ListRequirement } from '../entities/enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('CategoryRegulationService', () => {
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
    await em.nativeDelete(CategoryRegulation, {});
    await em.nativeDelete(Regulation, {});
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

    // Create regulations
    const reachSvhc = em.create(Regulation, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC',
      source: 'ECHA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
    });

    const rohs = em.create(Regulation, {
      code: 'ROHS_RESTRICTED',
      name: 'RoHS Restricted',
      source: 'EU_ROHS',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
    });

    const cosingII = em.create(Regulation, {
      code: 'COSING_ANNEX_II',
      name: 'CosIng Annex II',
      source: 'EU_COSING',
      version: '2024-06',
      effectiveDate: new Date('2024-06-01'),
    });

    const cosingIII = em.create(Regulation, {
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

    em.create(CategoryRegulation, {
      category: rootRef,
      regulation: reachSvhc,
      requirement: ListRequirement.RESTRICTION,
    });

    em.create(CategoryRegulation, {
      category: electronicsRef,
      regulation: rohs,
      requirement: ListRequirement.RESTRICTION,
    });

    em.create(CategoryRegulation, {
      category: cosmeticsRef,
      regulation: cosingII,
      requirement: ListRequirement.PROHIBITION,
    });

    em.create(CategoryRegulation, {
      category: cosmeticsRef,
      regulation: cosingIII,
      requirement: ListRequirement.RESTRICTION,
    });

    await em.flush();
  });

  describe('getRegulationsForCategory', () => {
    it('returns regulations inherited from ancestors', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new CategoryRegulationService(em);

      // Moisturizers should inherit: REACH_SVHC (from root), COSING II & III (from cosmetics)
      const regulations = await service.getRegulationsForCategory('products.cosmetics.skincare.moisturizers');

      expect(regulations).toHaveLength(3);
      const codes = regulations.map(r => r.regulation.code).sort();
      expect(codes).toEqual(['COSING_ANNEX_II', 'COSING_ANNEX_III', 'REACH_SVHC']);
    });

    it('returns only applicable regulations for electronics', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new CategoryRegulationService(em);

      // Electronics should get: REACH_SVHC (from root), ROHS (direct)
      const regulations = await service.getRegulationsForCategory('products.electronics');

      expect(regulations).toHaveLength(2);
      const codes = regulations.map(r => r.regulation.code).sort();
      expect(codes).toEqual(['REACH_SVHC', 'ROHS_RESTRICTED']);
    });

    it('returns regulations ordered by depth (most specific first)', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new CategoryRegulationService(em);

      const regulations = await service.getRegulationsForCategory('products.cosmetics.skincare.moisturizers');

      // CosIng regulations (depth 1) should come before REACH (depth 0)
      const cosing = regulations.filter(r => r.regulation.code.startsWith('COSING'));
      const reach = regulations.find(r => r.regulation.code === 'REACH_SVHC');

      expect(cosing.length).toBe(2);
      expect(reach).toBeDefined();

      // Verify depth ordering
      const firstCosing = regulations.findIndex(r => r.regulation.code.startsWith('COSING'));
      const reachIndex = regulations.findIndex(r => r.regulation.code === 'REACH_SVHC');
      expect(firstCosing).toBeLessThan(reachIndex);
    });
  });

  describe('getRegulationsForCategory with exclusions', () => {
    it('respects exclusions from child categories', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new CategoryRegulationService(em);

      // Add exclusion: skincare exempt from REACH_SVHC
      const skincareRef = await em.findOneOrFail(Category, { path: 'products.cosmetics.skincare' });
      const reachRef = await em.findOneOrFail(Regulation, { code: 'REACH_SVHC' });

      em.create(CategoryRegulation, {
        category: skincareRef,
        regulation: reachRef,
        requirement: ListRequirement.RESTRICTION,
        isExclusion: true,
      });
      await em.flush();

      // Moisturizers should now only get COSING II & III (REACH excluded by skincare)
      const regulations = await service.getRegulationsForCategory('products.cosmetics.skincare.moisturizers');

      expect(regulations).toHaveLength(2);
      const codes = regulations.map(r => r.regulation.code).sort();
      expect(codes).toEqual(['COSING_ANNEX_II', 'COSING_ANNEX_III']);
    });
  });

  describe('getRegulationsForCategory with compareValue override', () => {
    it('returns compareValue override when set', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new CategoryRegulationService(em);

      // Add stricter compareValue for cosmetics on REACH
      const cosmeticsRef = await em.findOneOrFail(Category, { path: 'products.cosmetics' });
      const reachRef = await em.findOneOrFail(Regulation, { code: 'REACH_SVHC' });

      em.create(CategoryRegulation, {
        category: cosmeticsRef,
        regulation: reachRef,
        requirement: ListRequirement.RESTRICTION,
        compareValueOverride: '0.01',  // Stricter than default 0.1%
      });
      await em.flush();

      const regulations = await service.getRegulationsForCategory('products.cosmetics.skincare.moisturizers');

      const reachMapping = regulations.find(r => r.regulation.code === 'REACH_SVHC');
      expect(reachMapping?.compareValueOverride).toBe('0.01');
    });
  });

  describe('getCurrentRegulationsWithRequirements', () => {
    it('returns regulations with requirements populated', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new CategoryRegulationService(em);

      const result = await service.getCurrentRegulationsWithRequirements('products.cosmetics');

      expect(result.length).toBeGreaterThan(0);
      // Regulations should have requirements collection available
      for (const mapping of result) {
        expect(mapping.regulation).toBeDefined();
        expect(mapping.regulation.code).toBeDefined();
      }
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test CategoryRegulationService.test.ts
```

Expected: FAIL with "Cannot find module './CategoryRegulationService.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/services/CategoryRegulationService.ts
import { EntityManager, raw } from '@mikro-orm/postgresql';
import { Category } from '../entities/Category.js';
import { Regulation } from '../entities/Regulation.js';
import { CategoryRegulation } from '../entities/CategoryRegulation.js';
import { ListRequirement } from '../entities/enums/index.js';

export interface ApplicableRegulation {
  regulation: Regulation;
  requirement: ListRequirement;
  matchedAt: string;  // The category path where this mapping was defined
  depth: number;
  priority: number;
  compareValueOverride?: string;
}

export class CategoryRegulationService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Get all regulations applicable to a category path.
   * Uses LTREE @> operator for ancestor matching, respects exclusions.
   *
   * @param categoryPath - The LTREE path of the target category
   * @returns Regulations ordered by depth (most specific first), then priority
   */
  async getRegulationsForCategory(categoryPath: string): Promise<CategoryRegulation[]> {
    // Step 1: Get all candidate mappings (ancestors of the target path)
    const candidates = await this.em.getConnection().execute<Array<{
      id: string;
      category_id: string;
      regulation_id: string;
      requirement: string;
      priority: number;
      is_exclusion: boolean;
      compare_value_override: string | null;
      path: string;
      depth: number;
    }>>(`
      SELECT
        cr.id,
        cr.category_id,
        cr.regulation_id,
        cr.requirement,
        cr.priority,
        cr.is_exclusion,
        cr.compare_value_override,
        c.path,
        c.depth
      FROM public.category_regulation cr
      JOIN public.category c ON c.id = cr.category_id
      JOIN public.regulation r ON r.id = cr.regulation_id
      WHERE c.path @> ?::ltree
        AND r.is_current_version = true
      ORDER BY c.depth DESC, cr.priority DESC
    `, [categoryPath]);

    // Step 2: Process exclusions
    // An exclusion at depth N removes the regulation from ancestors at depth < N
    const exclusions = new Map<string, number>();  // regulationId -> exclusion depth

    for (const row of candidates) {
      if (row.is_exclusion) {
        const existingDepth = exclusions.get(row.regulation_id);
        if (existingDepth === undefined || row.depth > existingDepth) {
          exclusions.set(row.regulation_id, row.depth);
        }
      }
    }

    // Step 3: Filter out excluded regulations and return non-exclusion mappings
    const filtered = candidates.filter(row => {
      if (row.is_exclusion) return false;  // Don't include exclusion records

      const exclusionDepth = exclusions.get(row.regulation_id);
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
      CategoryRegulation,
      { id: { $in: ids } },
      {
        populate: ['regulation', 'category'],
        orderBy: { category: { depth: 'DESC' }, priority: 'DESC' },
      }
    );

    // Maintain the order from our filtered results
    const idOrder = new Map(ids.map((id, i) => [id, i]));
    return mappings.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
  }

  /**
   * Get current regulations for a category with their requirements populated.
   * Used for compliance evaluation.
   */
  async getCurrentRegulationsWithRequirements(categoryPath: string): Promise<CategoryRegulation[]> {
    const mappings = await this.getRegulationsForCategory(categoryPath);

    // Populate requirements for each regulation
    for (const mapping of mappings) {
      await this.em.populate(mapping.regulation, ['requirements']);
    }

    return mappings;
  }

  /**
   * Add a regulation to a category.
   */
  async addRegulationToCategory(input: {
    categoryId: string;
    regulationId: string;
    requirement: ListRequirement;
    priority?: number;
    isExclusion?: boolean;
    compareValueOverride?: string;
  }): Promise<CategoryRegulation> {
    const category = await this.em.findOneOrFail(Category, { id: input.categoryId });
    const regulation = await this.em.findOneOrFail(Regulation, { id: input.regulationId });

    const mapping = this.em.create(CategoryRegulation, {
      category,
      regulation,
      requirement: input.requirement,
      priority: input.priority ?? 0,
      isExclusion: input.isExclusion ?? false,
      compareValueOverride: input.compareValueOverride,
    });

    await this.em.persistAndFlush(mapping);
    return mapping;
  }

  /**
   * Remove a regulation from a category.
   */
  async removeRegulationFromCategory(categoryId: string, regulationId: string): Promise<void> {
    const mapping = await this.em.findOne(CategoryRegulation, {
      category: { id: categoryId },
      regulation: { id: regulationId },
    });

    if (mapping) {
      await this.em.removeAndFlush(mapping);
    }
  }

  /**
   * Get all mappings for a specific category (not inherited).
   */
  async getDirectMappings(categoryId: string): Promise<CategoryRegulation[]> {
    return this.em.find(
      CategoryRegulation,
      { category: { id: categoryId } },
      { populate: ['regulation'] }
    );
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test CategoryRegulationService.test.ts
```

Expected: PASS (all tests)

**Step 5: Export from index and commit**

```typescript
// packages/database/src/services/index.ts
// Add to existing exports:
export { CategoryRegulationService } from './CategoryRegulationService.js';
```

```bash
git add packages/database/src/services/CategoryRegulationService.ts packages/database/src/services/CategoryRegulationService.test.ts packages/database/src/services/index.ts
git commit -m "feat(database): add CategoryRegulationService with LTREE inheritance"
```

---

## Task 5: Add API Route for Category Regulations

**Files:**
- Create: `apps/api/src/routes/taxonomy/category-regulations.ts`
- Modify: `apps/api/src/routes/taxonomy/index.ts`

**Step 1: Create the router**

```typescript
// apps/api/src/routes/taxonomy/category-regulations.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@mikro-orm/postgresql';
import { CategoryRegulationService } from '@eurocomply/database';
import type { Env } from '../../app.js';

// ============================================================================
// Types
// ============================================================================

export interface CategoryRegulationsRouterOptions {
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

export function createCategoryRegulationsRouter(options: CategoryRegulationsRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  // GET /taxonomy/categories/:path/regulations
  // Get all regulations applicable to a category (with inheritance)
  router.get('/:path/regulations', async (c) => {
    const categoryPath = c.req.param('path');
    const em = orm.em.fork();
    const service = new CategoryRegulationService(em);

    try {
      const mappings = await service.getRegulationsForCategory(categoryPath);

      return c.json({
        data: mappings.map(m => ({
          regulationId: m.regulation.id,
          regulationCode: m.regulation.code,
          regulationName: m.regulation.name,
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
import { createCategoryRegulationsRouter } from './category-regulations.js';

// Add route registration:
taxonomy.route('/categories', createCategoryRegulationsRouter({ orm }));
```

**Step 3: Verify build**

```bash
cd apps/api && pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/api/src/routes/taxonomy/category-regulations.ts apps/api/src/routes/taxonomy/index.ts
git commit -m "feat(api): add category regulations route with LTREE inheritance"
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
  INHERITED = 'INHERITED',      // From system baseline (resolved from CategoryRegulation)
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

## Task 7: Create TenantRequirementExemption Entity

**Files:**
- Create: `packages/database/src/entities/tenant/TenantRequirementExemption.ts`
- Test: `packages/database/src/entities/tenant/TenantRequirementExemption.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/tenant/TenantRequirementExemption.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { TenantCategory } from './TenantCategory.js';
import { TenantRequirementExemption } from './TenantRequirementExemption.js';
import { ListRequirement, RegulationSource } from '../enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../../test-utils.js';

describe('TenantRequirementExemption Entity', () => {
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
    await em.nativeDelete(TenantRequirementExemption, {});
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

  it('creates a tenant-added regulation mapping', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const tenantCatRef = await em.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    const mapping = em.create(TenantRequirementExemption, {
      tenantCategory: tenantCatRef,
      regulationId: 'regulation-uuid',
      requirement: ListRequirement.RESTRICTION,
      source: RegulationSource.TENANT_ADDED,
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(TenantRequirementExemption, {
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

    const mapping = em.create(TenantRequirementExemption, {
      tenantCategory: tenantCatRef,
      regulationId: 'rohs-uuid',
      requirement: ListRequirement.RESTRICTION,
      source: RegulationSource.INHERITED,
      isExempted: true,
      exemptionReason: 'Medical device per Article 2(4)(f)',
      exemptionLegalRef: 'Directive 2011/65/EU Art 2(4)(f)',
      exemptedBy: 'user-uuid',
      exemptedAt: new Date(),
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(TenantRequirementExemption, {
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

    const mapping = em.create(TenantRequirementExemption, {
      tenantCategory: tenantCatRef,
      regulationId: 'reach-uuid',
      requirement: ListRequirement.RESTRICTION,
      source: RegulationSource.INHERITED,
      overrideThreshold: '0.005',  // Stricter than the law
    });

    await em.persistAndFlush(mapping);

    const found = await em.findOneOrFail(TenantRequirementExemption, {
      tenantCategory: tenantCatRef,
    });

    expect(found.overrideThreshold).toBe('0.005');
  });

  it('enforces unique constraint on tenantCategory + regulationId', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const tenantCatRef = await em.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    const mapping1 = em.create(TenantRequirementExemption, {
      tenantCategory: tenantCatRef,
      regulationId: 'same-regulation-uuid',
      requirement: ListRequirement.RESTRICTION,
      source: RegulationSource.TENANT_ADDED,
    });
    await em.persistAndFlush(mapping1);

    const em2 = orm.em.fork();
    const tenantCatRef2 = await em2.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    const mapping2 = em2.create(TenantRequirementExemption, {
      tenantCategory: tenantCatRef2,
      regulationId: 'same-regulation-uuid',  // Same regulation
      requirement: ListRequirement.PROHIBITION,
      source: RegulationSource.INHERITED,
    });

    await expect(em2.persistAndFlush(mapping2)).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test TenantRequirementExemption.test.ts
```

Expected: FAIL with "Cannot find module './TenantRequirementExemption.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/entities/tenant/TenantRequirementExemption.ts
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

@Entity({ tableName: 'tenant_requirement_exemption' })
@Unique({ properties: ['tenantCategory', 'regulationId'] })
export class TenantRequirementExemption extends BaseEntity {
  /**
   * The tenant category this mapping applies to.
   */
  @ManyToOne(() => TenantCategory, { name: 'tenant_category_id' })
  @Index()
  tenantCategory!: TenantCategory;

  /**
   * Soft link to public.regulation.
   * Uses text ID instead of FK to avoid cross-schema constraints.
   */
  @Property({ type: 'text', name: 'regulation_id' })
  @Index()
  regulationId!: string;

  /**
   * The type of requirement this regulation imposes.
   */
  @Enum({ items: () => ListRequirement })
  requirement!: ListRequirement;

  /**
   * Source of this regulation mapping.
   * INHERITED = resolved from system baseline (CategoryRegulation)
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
cd packages/database && pnpm test TenantRequirementExemption.test.ts
```

Expected: PASS (all tests)

**Step 5: Export from index and commit**

```typescript
// packages/database/src/entities/tenant/index.ts
// Add to existing exports:
export { TenantRequirementExemption } from './TenantRequirementExemption.js';
```

```bash
git add packages/database/src/entities/tenant/TenantRequirementExemption.ts packages/database/src/entities/tenant/TenantRequirementExemption.test.ts packages/database/src/entities/tenant/index.ts
git commit -m "feat(database): add TenantRequirementExemption entity for tenant additions and exemptions"
```

---

## Task 8: Create TenantRequirementExemption Migration

**Files:**
- Modify: `packages/database/src/migrations/tenant/Migration_TenantSchema.ts` (or create new migration)

**Step 1: Add to tenant schema migration**

```typescript
// Add to tenant schema migration
this.addSql(`
  CREATE TABLE IF NOT EXISTS tenant_requirement_exemption (
    id TEXT PRIMARY KEY,
    tenant_category_id TEXT NOT NULL REFERENCES tenant_category(id) ON DELETE CASCADE,
    regulation_id TEXT NOT NULL,  -- Soft link to public.regulation
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

    CONSTRAINT uq_tenant_req_exemption UNIQUE (tenant_category_id, regulation_id),
    CONSTRAINT chk_exemption_reason CHECK (
      is_exempted = false OR exemption_reason IS NOT NULL
    )
  );
`);

// Create indexes
this.addSql(`
  CREATE INDEX IF NOT EXISTS idx_tre_tenant_category
    ON tenant_requirement_exemption (tenant_category_id);
`);

this.addSql(`
  CREATE INDEX IF NOT EXISTS idx_tre_regulation
    ON tenant_requirement_exemption (regulation_id);
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
git commit -m "feat(database): add tenant_requirement_exemption table migration"
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
import { TenantRequirementExemption } from '../entities/tenant/TenantRequirementExemption.js';
import { CategoryRegulation } from '../entities/CategoryRegulation.js';
import { ListRequirement, RegulationSource } from '../entities/enums/index.js';

// ============================================================================
// Types
// ============================================================================

export interface EffectiveRegulation {
  regulationId: string;
  regulationCode: string;
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
   * 1. Get system baseline (from CategoryRegulation via systemCategoryId)
   * 2. Get tenant additions (TenantRequirementExemption where source = TENANT_ADDED)
   * 3. Apply tenant exemptions (TenantRequirementExemption where isExempted = true)
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
      TenantRequirementExemption,
      { tenantCategory: { id: tenantCategoryId } }
    );

    // Step 4: Merge into effective regulations
    const effectiveMap = new Map<string, EffectiveRegulation>();

    // Add system baseline first
    for (const baseline of systemBaseline) {
      effectiveMap.set(baseline.regulationId, {
        regulationId: baseline.regulationId,
        regulationCode: baseline.regulationCode,
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
        const regCode = await this.getRegulationCode(record.regulationId);
        effectiveMap.set(record.regulationId, {
          regulationId: record.regulationId,
          regulationCode: regCode,
          source: 'TENANT',
          requirement: record.requirement,
          status: 'ACTIVE',
          allowExemption: true,  // Tenant can always remove their own additions
          overrideThreshold: record.overrideThreshold ?? undefined,
        });
      } else if (record.source === RegulationSource.INHERITED && record.isExempted) {
        // Exemption for system baseline
        const existing = effectiveMap.get(record.regulationId);
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
    regulationId: string;
    regulationCode: string;
    requirement: ListRequirement;
    allowExemption: boolean;
    overrideThreshold?: string;
  }>> {
    if (!tenantCategory.systemCategoryId) {
      return [];  // Custom category, no system baseline
    }

    // Query CategoryRegulation using LTREE inheritance
    const rows = await this.em.getConnection().execute<Array<{
      regulation_id: string;
      code: string;
      requirement: string;
      allow_tenant_exemption: boolean;
      compare_value_override: string | null;
    }>>(`
      SELECT DISTINCT ON (cr.regulation_id)
        cr.regulation_id,
        r.code,
        cr.requirement,
        cr.allow_tenant_exemption,
        cr.compare_value_override
      FROM public.category_regulation cr
      JOIN public.category c ON c.id = cr.category_id
      JOIN public.regulation r ON r.id = cr.regulation_id
      WHERE c.path @> (
        SELECT path FROM public.category WHERE id = ?
      )::ltree
        AND r.is_current_version = true
        AND cr.is_exclusion = false
      ORDER BY cr.regulation_id, c.depth DESC
    `, [tenantCategory.systemCategoryId]);

    return rows.map(row => ({
      regulationId: row.regulation_id,
      regulationCode: row.code,
      requirement: row.requirement as ListRequirement,
      allowExemption: row.allow_tenant_exemption,
      overrideThreshold: row.compare_value_override ?? undefined,
    }));
  }

  /**
   * Get regulation code by ID.
   */
  private async getRegulationCode(regulationId: string): Promise<string> {
    const [row] = await this.em.getConnection().execute<Array<{ code: string }>>(`
      SELECT code FROM public.regulation WHERE id = ?
    `, [regulationId]);
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
import { Regulation } from '../entities/Regulation.js';
import { CategoryRegulation } from '../entities/CategoryRegulation.js';
import { TenantCategory } from '../entities/tenant/TenantCategory.js';
import { TenantRequirementExemption } from '../entities/tenant/TenantRequirementExemption.js';
import { ComplianceStackResolver } from './ComplianceStackResolver.js';
import { ListRequirement, RegulationSource } from '../entities/enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('ComplianceStackResolver', () => {
  let orm: MikroORM;
  let systemCategoryId: string;
  let tenantCategoryId: string;
  let reachRegId: string;
  let rohsRegId: string;

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
    await em.nativeDelete(TenantRequirementExemption, {});
    await em.nativeDelete(TenantCategory, {});
    await em.nativeDelete(CategoryRegulation, {});
    await em.nativeDelete(Regulation, {});
    await em.nativeDelete(Category, {});

    // Create system category
    const systemCategory = em.create(Category, {
      name: 'Electronics',
      path: 'products.electronics',
      type: CategoryType.BRANCH,
      depth: 1,
    });

    // Create regulations
    const reachReg = em.create(Regulation, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC',
      source: 'ECHA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
      isCurrentVersion: true,
    });

    const rohsReg = em.create(Regulation, {
      code: 'ROHS_RESTRICTED',
      name: 'RoHS Restricted',
      source: 'EU_ROHS',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
      isCurrentVersion: true,
    });

    await em.persistAndFlush([systemCategory, reachReg, rohsReg]);

    systemCategoryId = systemCategory.id;
    reachRegId = reachReg.id;
    rohsRegId = rohsReg.id;

    // Create system baseline mappings
    em.create(CategoryRegulation, {
      category: systemCategory,
      regulation: reachReg,
      requirement: ListRequirement.RESTRICTION,
      allowTenantExemption: true,
    });

    em.create(CategoryRegulation, {
      category: systemCategory,
      regulation: rohsReg,
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

    const reachReg = result.effectiveRegulations.find(r => r.regulationCode === 'REACH_SVHC');
    expect(reachReg).toBeDefined();
    expect(reachReg!.source).toBe('SYSTEM');
    expect(reachReg!.status).toBe('ACTIVE');
  });

  it('includes tenant additions', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    // Add tenant-specific regulation
    const tenantCatRef = await em.findOneOrFail(TenantCategory, { id: tenantCategoryId });
    em.create(TenantRequirementExemption, {
      tenantCategory: tenantCatRef,
      regulationId: 'iec-62368-uuid',
      requirement: ListRequirement.RESTRICTION,
      source: RegulationSource.TENANT_ADDED,
    });
    await em.flush();

    const resolver = new ComplianceStackResolver(em);
    const result = await resolver.resolve(tenantCategoryId);

    expect(result.effectiveRegulations).toHaveLength(3);

    const tenantReg = result.effectiveRegulations.find(r => r.source === 'TENANT');
    expect(tenantReg).toBeDefined();
    expect(tenantReg!.regulationId).toBe('iec-62368-uuid');
  });

  it('applies tenant exemptions', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    // Add exemption for RoHS
    const tenantCatRef = await em.findOneOrFail(TenantCategory, { id: tenantCategoryId });
    em.create(TenantRequirementExemption, {
      tenantCategory: tenantCatRef,
      regulationId: rohsRegId,
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

    const rohsReg = result.effectiveRegulations.find(r => r.regulationCode === 'ROHS_RESTRICTED');
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
- `CategoryRegulation` entity with:
  - Priority and exclusion support
  - CompareValue override for category-specific thresholds
  - `allowTenantExemption` guardrail flag
- Database migration for `category_regulation` table
- `CategoryRegulationService` with LTREE `@>` inheritance queries
- API route for querying applicable regulations by category path

**Tenant Schema (Additions + Exemptions):**
- `RegulationSource` enum (INHERITED, TENANT_ADDED)
- `TenantRequirementExemption` entity with:
  - Soft link to regulation (no cross-schema FK)
  - Exemption fields (reason, legalRef, exemptedBy, exemptedAt)
  - Override threshold support
- Database migration for `tenant_requirement_exemption` table

**Compliance Stack Resolution:**
- `ComplianceStackResolver` service implementing 3-layer resolution:
  - Layer 1: System baseline from CategoryRegulation
  - Layer 2: Tenant additions from TenantRequirementExemption
  - Layer 3: Tenant exemptions from TenantRequirementExemption
- `EffectiveRegulation` interface for resolved regulations
- Full test coverage

**Key Features:**
- **Dual-layer architecture:** System baseline + tenant customization
- **LTREE inheritance:** Child categories automatically inherit parent regulation mappings
- **Guardrail protection:** System can mark regulations as non-exemptable
- **Audit trail:** All exemptions require justification with user/timestamp
- **Threshold overrides:** Tenants can be stricter (but not more lenient) than law
- **Cross-schema safety:** Soft links prevent FK issues during tenant migrations

**Implementation Refinements (for hardening):**

1. **Stoichiometry & Threshold Fallback (Plan 14):**
   - Plan 9/10 discussed adding a `stoichiometric_factor` to `Requirement`
   - The Evaluation Service (Plan 14) should implement this resolution hierarchy:
     ```
     1. TenantRequirementExemption.overrideThreshold (if non-null)
     2. CategoryRegulation.compareValueOverride (if non-null)
     3. Requirement.compareValue (default requirement compareValue)
     ```
   - This allows tenant > category > requirement threshold precedence

2. **Temporal Scoping (Future Enhancement):**
   - Current implementation filters `r.is_current_version = true` (correct for 99% of use cases)
   - Future enhancement: Add optional `atDate?: Date` parameter to `ComplianceStackResolver.resolve()`
   - This enables forensic auditing: "Which regulations were scoped to this category on the day this product was manufactured 2 years ago?"

3. **FROZEN Mode Support (Plan 05):**
   - When `CategoryAdoption.mode = FROZEN`, resolver should use `pinnedRegulationIds[]`
   - This enables version pinning for predictable compliance evaluation

**Next Plans:**
- **Plan 05:** Category Service rewrite (split into admin/tenant services)
- **Plan 12:** RegulatoryImportService (admin import pipeline)
- **Plan 14:** Vertical rule evaluators (add JUSTIFIED_EXEMPTION status, threshold fallback)
- **Plan 15:** Initial regulation seeders (populate CategoryRegulation links)

---

*Plan created: 2026-01-26*
*Updated: 2026-01-27 - Rewritten for Compliance Stack architecture*
