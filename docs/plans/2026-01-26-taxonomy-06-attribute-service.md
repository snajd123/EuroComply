# Taxonomy Plan 6: Attribute Service

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement attribute template service with category inheritance, validation rules, and system attribute seeding.

**Architecture:** Leverage existing `AttributeTemplate` entity. Create `AttributeService` for template management with category-based inheritance resolution. Seed system attributes to public schema categories.

**Tech Stack:** MikroORM, Zod validation, Hono

**Prerequisites:** Plan 5 (Category Service) completed. AttributeTemplate entity already exists.

**Reference:** See `docs/plans/2026-01-23-taxonomy-engine-design.md` Section 3

---

## API Integration Patterns (MUST FOLLOW)

> **CRITICAL:** All API implementations MUST follow existing codebase patterns from `apps/api/src/`.

### Taxonomy Routes (Public - No Auth)
Attributes are **public reference data** - no authentication required:
```typescript
// File: apps/api/src/routes/taxonomy/index.ts
const taxonomy = new Hono<Env>();
taxonomy.route('/attributes', createAttributesRouter(deps.attributesRepository));
v1.route('/taxonomy', taxonomy);  // No middleware - public routes
```

### Response Format (MUST MATCH)
```typescript
// Success
c.json({ data: entity })
c.json({ data: items, meta: { total: items.length } })

// Errors
c.json({ error: 'Not Found', message: 'Attribute not found' }, 404)
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

## Task 1: Create AttributeService

**Files:**
- Create: `packages/database/src/services/attribute.service.ts`
- Test: `packages/database/src/services/attribute.service.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/attribute.service.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { AttributeService } from './attribute.service.js';
import { AttributeTemplate, AttributeType, RollupMethod, InheritanceRule } from '../entities/AttributeTemplate.js';
import { Category, CategoryType } from '../entities/Category.js';
import { TargetType, UnitSystem } from '../entities/enums/index.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('AttributeService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: AttributeService;
  let rootCategory: Category;
  let childCategory: Category;

  beforeAll(async () => {
    orm = await createTestOrm([AttributeTemplate, Category]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    service = new AttributeService(em);
    await em.nativeDelete(AttributeTemplate, {});
    await em.nativeDelete(Category, {});

    // Create test categories
    rootCategory = em.create(Category, {
      name: 'Apparel',
      path: 'apparel',
      type: CategoryType.ROOT,
      targetType: TargetType.PRODUCT,
      depth: 0,
    });
    await em.persistAndFlush(rootCategory);

    childCategory = em.create(Category, {
      name: 'T-Shirts',
      path: 'apparel.tshirts',
      type: CategoryType.LEAF,
      targetType: TargetType.PRODUCT,
      depth: 1,
      parent: rootCategory,
    });
    await em.persistAndFlush(childCategory);
  });

  describe('create', () => {
    it('should create an attribute template', async () => {
      const attr = await service.create({
        key: 'weight',
        name: 'Product Weight',
        type: AttributeType.NUMBER_UNIT,
        categoryId: rootCategory.id,
        targetType: TargetType.PRODUCT,
        unitSystem: UnitSystem.MASS,
        defaultUnitId: 'KGM',
        rollupMethod: RollupMethod.SUM,
      });

      expect(attr.id).toBeDefined();
      expect(attr.key).toBe('weight');
      expect(attr.unitSystem).toBe(UnitSystem.MASS);
    });
  });

  describe('getAttributesForCategory', () => {
    it('should return inherited attributes', async () => {
      // Add attribute to root
      await service.create({
        key: 'weight',
        name: 'Product Weight',
        type: AttributeType.NUMBER_UNIT,
        categoryId: rootCategory.id,
        targetType: TargetType.PRODUCT,
      });

      // Add attribute to child
      await service.create({
        key: 'sleeve_length',
        name: 'Sleeve Length',
        type: AttributeType.NUMBER_UNIT,
        categoryId: childCategory.id,
        targetType: TargetType.PRODUCT,
      });

      const attrs = await service.getAttributesForCategory(childCategory.id, true);

      expect(attrs).toHaveLength(2);
      expect(attrs.map(a => a.key).sort()).toEqual(['sleeve_length', 'weight']);
    });

    it('should return only direct attributes when inheritance disabled', async () => {
      await service.create({
        key: 'weight',
        name: 'Product Weight',
        type: AttributeType.NUMBER_UNIT,
        categoryId: rootCategory.id,
        targetType: TargetType.PRODUCT,
      });

      await service.create({
        key: 'sleeve_length',
        name: 'Sleeve Length',
        type: AttributeType.NUMBER_UNIT,
        categoryId: childCategory.id,
        targetType: TargetType.PRODUCT,
      });

      const attrs = await service.getAttributesForCategory(childCategory.id, false);

      expect(attrs).toHaveLength(1);
      expect(attrs[0].key).toBe('sleeve_length');
    });
  });

  describe('validateValue', () => {
    it('should validate NUMBER_UNIT attribute', async () => {
      const attr = await service.create({
        key: 'weight',
        name: 'Weight',
        type: AttributeType.NUMBER_UNIT,
        categoryId: rootCategory.id,
        targetType: TargetType.PRODUCT,
        unitSystem: UnitSystem.MASS,
        validationRules: { min: 0, max: 1000 },
      });

      // Valid value
      await expect(service.validateValue(attr.id, { val: 500, unit: 'KGM' })).resolves.not.toThrow();

      // Invalid - out of range
      await expect(service.validateValue(attr.id, { val: 2000, unit: 'KGM' })).rejects.toThrow();

      // Invalid - wrong type
      await expect(service.validateValue(attr.id, { val: 'text', unit: 'KGM' })).rejects.toThrow();
    });
  });
});
```

**Step 2: Create the service**

```typescript
// packages/database/src/services/attribute.service.ts
import { EntityManager } from '@mikro-orm/core';
import { AttributeTemplate, AttributeType, RollupMethod, InheritanceRule } from '../entities/AttributeTemplate.js';
import { Category } from '../entities/Category.js';
import { TargetType, UnitSystem } from '../entities/enums/index.js';

export interface CreateAttributeInput {
  key: string;
  name: string;
  description?: string;
  type: AttributeType;
  categoryId: string;
  targetType: TargetType;
  unitSystem?: UnitSystem;
  defaultUnitId?: string;
  rollupMethod?: RollupMethod;
  weightBasisKey?: string;
  inheritanceRule?: InheritanceRule;
  validationRules?: Record<string, unknown>;
  enumValues?: string[];
  defaultValue?: unknown;
}

export interface AttributeValue {
  val: unknown;
  unit?: string;
}

export class AttributeService {
  constructor(private readonly em: EntityManager) {}

  async create(input: CreateAttributeInput): Promise<AttributeTemplate> {
    const category = await this.em.findOneOrFail(Category, { id: input.categoryId });

    const attr = this.em.create(AttributeTemplate, {
      key: input.key,
      name: input.name,
      description: input.description,
      type: input.type,
      category,
      targetType: input.targetType,
      unitSystem: input.unitSystem,
      defaultUnitId: input.defaultUnitId,
      rollupMethod: input.rollupMethod ?? RollupMethod.NONE,
      weightBasisKey: input.weightBasisKey,
      inheritanceRule: input.inheritanceRule ?? InheritanceRule.INHERIT,
      validationRules: input.validationRules,
      enumValues: input.enumValues,
      defaultValue: input.defaultValue,
      isActive: true,
    });

    await this.em.persistAndFlush(attr);
    return attr;
  }

  async getAttributesForCategory(categoryId: string, includeInherited: boolean = true): Promise<AttributeTemplate[]> {
    const category = await this.em.findOneOrFail(Category, { id: categoryId });

    if (!includeInherited) {
      return this.em.find(AttributeTemplate, { category: { id: categoryId } });
    }

    // Get all ancestor paths
    const pathParts = category.path.split('.');
    const ancestorPaths: string[] = [];
    for (let i = 1; i <= pathParts.length; i++) {
      ancestorPaths.push(pathParts.slice(0, i).join('.'));
    }

    // Get categories by paths
    const categories = await this.em.find(Category, { path: { $in: ancestorPaths } });
    const categoryIds = categories.map(c => c.id);

    // Get attributes
    return this.em.find(AttributeTemplate, {
      category: { id: { $in: categoryIds } },
      isActive: true,
    }, { orderBy: { sortOrder: 'ASC' } });
  }

  async validateValue(attributeId: string, value: AttributeValue): Promise<void> {
    const attr = await this.em.findOneOrFail(AttributeTemplate, { id: attributeId });

    // Type validation
    switch (attr.type) {
      case AttributeType.NUMBER:
      case AttributeType.NUMBER_UNIT:
        if (typeof value.val !== 'number') {
          throw new Error(`Expected number for ${attr.key}, got ${typeof value.val}`);
        }
        if (attr.type === AttributeType.NUMBER_UNIT && !value.unit) {
          throw new Error(`Unit required for ${attr.key}`);
        }
        break;
      case AttributeType.STRING:
        if (typeof value.val !== 'string') {
          throw new Error(`Expected string for ${attr.key}`);
        }
        break;
      case AttributeType.BOOLEAN:
        if (typeof value.val !== 'boolean') {
          throw new Error(`Expected boolean for ${attr.key}`);
        }
        break;
    }

    // Validation rules
    if (attr.validationRules) {
      const rules = attr.validationRules as { min?: number; max?: number; pattern?: string };
      if (rules.min !== undefined && typeof value.val === 'number' && value.val < rules.min) {
        throw new Error(`${attr.key} must be >= ${rules.min}`);
      }
      if (rules.max !== undefined && typeof value.val === 'number' && value.val > rules.max) {
        throw new Error(`${attr.key} must be <= ${rules.max}`);
      }
    }

    // Enum validation
    if (attr.type === AttributeType.ENUM && attr.enumValues) {
      if (!attr.enumValues.includes(value.val as string)) {
        throw new Error(`Invalid enum value for ${attr.key}`);
      }
    }
  }

  async findByKey(categoryId: string, key: string): Promise<AttributeTemplate | null> {
    const attrs = await this.getAttributesForCategory(categoryId, true);
    return attrs.find(a => a.key === key) || null;
  }
}
```

**Step 3: Run tests and commit**

```bash
cd packages/database && pnpm test attribute.service.test.ts
git add packages/database/src/services/attribute.service.ts packages/database/src/services/attribute.service.test.ts
git commit -m "feat(database): add AttributeService with category inheritance"
```

---

## Task 2: Create System Attributes Seeder

**Files:**
- Create: `packages/database/data/system-attributes.json`
- Create: `packages/database/src/seeders/attributes.seeder.ts`
- Test: `packages/database/src/seeders/attributes.seeder.test.ts`

**Step 1: Create the data bundle**

```json
// packages/database/data/system-attributes.json
{
  "version": "SystemAttributes-v1",
  "generatedAt": "2026-01-26T00:00:00.000Z",
  "totalAttributes": 25,
  "attributes": [
    {
      "key": "weight",
      "name": "Product Weight",
      "description": "Total weight of the product",
      "type": "NUMBER_UNIT",
      "categoryPath": "apparel",
      "targetType": "PRODUCT",
      "unitSystem": "MASS",
      "defaultUnitId": "KGM",
      "rollupMethod": "SUM",
      "validationRules": { "min": 0, "max": 10000 }
    },
    {
      "key": "recycled_content",
      "name": "Recycled Content",
      "description": "Percentage of recycled materials",
      "type": "NUMBER_UNIT",
      "categoryPath": "apparel",
      "targetType": "PRODUCT",
      "unitSystem": "PERCENTAGE",
      "defaultUnitId": "P1",
      "rollupMethod": "WEIGHTED_AVG",
      "weightBasisKey": "weight",
      "validationRules": { "min": 0, "max": 100 }
    },
    {
      "key": "battery_capacity",
      "name": "Battery Capacity",
      "description": "Energy storage capacity",
      "type": "NUMBER_UNIT",
      "categoryPath": "electronics.batteries",
      "targetType": "PRODUCT",
      "unitSystem": "ENERGY",
      "defaultUnitId": "KWH",
      "rollupMethod": "SUM"
    },
    {
      "key": "material_composition",
      "name": "Material Composition",
      "description": "Breakdown of material components",
      "type": "JSON",
      "categoryPath": "apparel",
      "targetType": "PRODUCT",
      "rollupMethod": "NONE"
    },
    {
      "key": "density",
      "name": "Density",
      "description": "Material density",
      "type": "NUMBER_UNIT",
      "categoryPath": "materials",
      "targetType": "MATERIAL",
      "unitSystem": "MASS",
      "validationRules": { "min": 0 }
    },
    {
      "key": "tensile_strength",
      "name": "Tensile Strength",
      "description": "Maximum stress before breaking",
      "type": "NUMBER_UNIT",
      "categoryPath": "materials",
      "targetType": "MATERIAL"
    }
  ]
}
```

**Step 2: Create the seeder**

```typescript
// packages/database/src/seeders/attributes.seeder.ts
import { EntityManager } from '@mikro-orm/core';
import { AttributeTemplate, AttributeType, RollupMethod, InheritanceRule } from '../entities/AttributeTemplate.js';
import { Category } from '../entities/Category.js';
import { TargetType, UnitSystem } from '../entities/enums/index.js';
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

interface AttributeData {
  key: string;
  name: string;
  description?: string;
  type: string;
  categoryPath: string;
  targetType: string;
  unitSystem?: string;
  defaultUnitId?: string;
  rollupMethod?: string;
  weightBasisKey?: string;
  validationRules?: Record<string, unknown>;
  enumValues?: string[];
}

interface AttributeBundle {
  version: string;
  totalAttributes: number;
  attributes: AttributeData[];
}

export class AttributesSeeder {
  private readonly seedService: SeedService;
  private readonly SEED_NAME = 'system-attributes';

  constructor(private readonly em: EntityManager) {
    this.seedService = new SeedService(em);
  }

  async seed(): Promise<SeederResult> {
    const bundlePath = join(__dirname, '..', 'data', 'system-attributes.json');
    const raw = readFileSync(bundlePath, 'utf-8');
    const bundle: AttributeBundle = JSON.parse(raw);
    const version = bundle.version;

    const needsSeeding = await this.seedService.needsSeeding(this.SEED_NAME, version);

    if (!needsSeeding) {
      const existing = await this.seedService.getSeededVersion(this.SEED_NAME);
      return {
        seeded: false,
        skipped: true,
        count: existing?.recordCount || 0,
        version: existing?.version || version,
        message: `Attributes already seeded (${existing?.version}), skipping.`,
      };
    }

    let count = 0;
    for (const attr of bundle.attributes) {
      const category = await this.em.findOne(Category, { path: attr.categoryPath });
      if (!category) {
        console.warn(`Category not found: ${attr.categoryPath}, skipping attribute ${attr.key}`);
        continue;
      }

      const existing = await this.em.findOne(AttributeTemplate, { key: attr.key, category: { id: category.id } });
      if (existing) continue;

      const template = this.em.create(AttributeTemplate, {
        key: attr.key,
        name: attr.name,
        description: attr.description,
        type: attr.type as AttributeType,
        category,
        targetType: attr.targetType as TargetType,
        unitSystem: attr.unitSystem as UnitSystem,
        defaultUnitId: attr.defaultUnitId,
        rollupMethod: (attr.rollupMethod as RollupMethod) || RollupMethod.NONE,
        weightBasisKey: attr.weightBasisKey,
        inheritanceRule: InheritanceRule.INHERIT,
        validationRules: attr.validationRules,
        enumValues: attr.enumValues,
        isActive: true,
      });

      await this.em.persistAndFlush(template);
      count++;
    }

    await this.seedService.recordSeeding(this.SEED_NAME, version, count);

    return {
      seeded: true,
      skipped: false,
      count,
      version,
      message: `Seeded ${count} system attributes (${version}).`,
    };
  }
}
```

**Step 3: Run tests, update exports, create CLI, and commit**

```bash
# Add to seeders/index.ts and services/index.ts
git add packages/database/data/system-attributes.json packages/database/src/seeders/attributes.seeder.ts
git commit -m "feat(database): add AttributesSeeder with system attribute templates"
```

---

## Task 3: Create Attributes API Routes

**Files:**
- Create: `apps/api/src/routes/taxonomy/attributes.ts`
- Test: `apps/api/src/routes/taxonomy/attributes.e2e.test.ts`

**Step 1: Write the failing e2e test (NO MOCKS - per RULES.md)**

```typescript
// apps/api/src/routes/taxonomy/attributes.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MikroORM } from '@eurocomply/database';
import { Hono } from 'hono';
import { createAttributesRouter, type AttributesRepository, type AttributeData } from './attributes.js';
import { AttributeTemplate, Category, CategoryType, AttributeDataType } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import type { Env } from '../../app.js';

interface ApiResponse<T> {
  data: T;
  meta?: { total: number };
}

describe('Attributes API E2E', () => {
  let orm: MikroORM;
  let app: Hono<Env>;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();

    // Seed test data (real database, no mocks)
    const em = orm.em.fork();

    const category = em.create(Category, {
      name: 'Electronics',
      path: 'electronics',
      type: CategoryType.ROOT,
      targetType: 'PRODUCT',
      depth: 0,
      isActive: true,
    });
    em.persist(category);
    await em.flush();

    const attr = em.create(AttributeTemplate, {
      name: 'Weight',
      slug: 'weight',
      dataType: AttributeDataType.DECIMAL,
      category,
      isRequired: true,
      isActive: true,
    });
    em.persist(attr);
    await em.flush();

    // Create repository implementation (real database queries)
    const repo: AttributesRepository = {
      findAll: async (filter): Promise<AttributeData[]> => {
        const qb = orm.em.fork().createQueryBuilder(AttributeTemplate);
        if (filter?.categoryId) qb.andWhere({ category: { id: filter.categoryId } });
        if (filter?.dataType) qb.andWhere({ dataType: filter.dataType });
        if (filter?.active !== undefined) qb.andWhere({ isActive: filter.active });
        const results = await qb.getResultList();
        return results.map(a => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          dataType: a.dataType,
          categoryId: a.category?.id,
          isRequired: a.isRequired,
          isActive: a.isActive,
        }));
      },
      findById: async (id): Promise<AttributeData | null> => {
        const a = await orm.em.fork().findOne(AttributeTemplate, { id });
        if (!a) return null;
        return {
          id: a.id,
          name: a.name,
          slug: a.slug,
          dataType: a.dataType,
          categoryId: a.category?.id,
          isRequired: a.isRequired,
          isActive: a.isActive,
        };
      },
      findByCategoryWithInheritance: async (categoryId): Promise<AttributeData[]> => {
        // Simplified - full implementation would use LTREE queries
        const results = await orm.em.fork().find(AttributeTemplate, { category: { id: categoryId } });
        return results.map(a => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          dataType: a.dataType,
          categoryId: a.category?.id,
          isRequired: a.isRequired,
          isActive: a.isActive,
        }));
      },
    };

    app = new Hono<Env>();
    app.route('/attributes', createAttributesRouter(repo));
  });

  afterAll(async () => {
    if (orm) {
      await teardownTestDb();
    }
  });

  it('should list all attributes', async () => {
    if (!orm) return;

    const res = await app.request('/attributes');
    expect(res.status).toBe(200);
    const body = await res.json() as ApiResponse<AttributeData[]>;
    expect(body.data.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test attributes.e2e.test.ts
```

Expected: FAIL with "Cannot find module './attributes.js'"

**Step 3: Create the router**

```typescript
// apps/api/src/routes/taxonomy/attributes.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { AttributeDataType } from '@eurocomply/database';
import type { Env } from '../../app.js';

export interface AttributeData {
  id: string;
  name: string;
  slug: string;
  dataType: AttributeDataType;
  categoryId?: string;
  isRequired: boolean;
  isActive: boolean;
}

export interface AttributesRepository {
  findAll(filter?: {
    categoryId?: string;
    dataType?: AttributeDataType;
    active?: boolean;
  }): Promise<AttributeData[]>;
  findById(id: string): Promise<AttributeData | null>;
  findByCategoryWithInheritance(categoryId: string): Promise<AttributeData[]>;
}

const querySchema = z.object({
  categoryId: z.string().optional(),
  dataType: z.nativeEnum(AttributeDataType).optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

export function createAttributesRouter(repo: AttributesRepository): Hono<Env> {
  const router = new Hono<Env>();

  // GET /attributes - List all with optional filters
  router.get('/', zValidator('query', querySchema), async (c) => {
    const query = c.req.valid('query');

    const filter: Parameters<typeof repo.findAll>[0] = {};
    if (query.categoryId) filter.categoryId = query.categoryId;
    if (query.dataType) filter.dataType = query.dataType;
    if (query.active !== undefined) filter.active = query.active;

    const attributes = await repo.findAll(filter);

    return c.json({
      data: attributes,
      meta: { total: attributes.length },
    });
  });

  // GET /attributes/:id - Get single by id
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
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test attributes.e2e.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/taxonomy/attributes.ts apps/api/src/routes/taxonomy/attributes.e2e.test.ts
git commit -m "feat(api): add attributes API routes (list, get by id)"
```

---

## Summary

**Deliverables:**
- `AttributeService` with category inheritance and validation
- System attributes data bundle (`data/system-attributes.json`)
- `AttributesSeeder` service
- Attributes API routes
- CLI command `seed:attributes`

**API Routes:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/taxonomy/attributes` | List with filters |
| GET | `/api/v1/taxonomy/attributes/:id` | Get by id |
| GET | `/api/v1/taxonomy/categories/:id/attributes` | Get with inheritance |

**Next Plan:** Plan 7 (Material Substances) links substances to material versions.
