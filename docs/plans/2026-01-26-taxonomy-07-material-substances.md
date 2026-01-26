# Taxonomy Plan 7: Material Substances

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement MaterialSubstance entity linking chemical substances to material product versions with concentration data and verification audit trail.

**Architecture:** Create `MaterialSubstance` entity in tenant schema with soft link to public.substance. Add database trigger to enforce targetType=MATERIAL constraint. Create service and API for substance declarations on materials.

**Tech Stack:** MikroORM, PostgreSQL triggers, Hono

**Prerequisites:** Plans 4 (Substance Registry) and 6 (Attribute Service) completed.

**Reference:** See `docs/plans/2026-01-23-taxonomy-engine-design.md` Section 4.7

---

## API Integration Patterns (MUST FOLLOW)

> **CRITICAL:** All API implementations MUST follow existing codebase patterns from `apps/api/src/`.

### Tenant-Scoped Routes (REQUIRES FULL AUTH STACK)
Material substances are **tenant data** - requires authentication and authorization:

```typescript
// File: apps/api/src/app.ts
// Material substance routes need tenant + user middleware
v1.use('/materials/*/substances', createTenantMiddlewareWithApiKeys(deps.orm.em));
v1.use('/materials/*/substances', userMiddleware);
v1.route('/materials', createMaterialsRouter({ orm: deps.orm }));
```

### Authorization Pattern
```typescript
import { authorize } from '../../middleware/authorize.js';

// Viewing substances requires design:view
router.get('/:materialId/versions/:versionId/substances', authorize('design', 'view'), async (c) => { ... });

// Modifying substances requires design:edit
router.post('/:materialId/versions/:versionId/substances', authorize('design', 'edit'), async (c) => { ... });
router.put('/:materialId/versions/:versionId/substances/:id', authorize('design', 'edit'), async (c) => { ... });
router.delete('/:materialId/versions/:versionId/substances/:id', authorize('design', 'edit'), async (c) => { ... });
```

### Tenant Isolation Pattern (CRITICAL)
```typescript
router.get('/:materialId/versions/:versionId/substances', authorize('design', 'view'), async (c) => {
  const schema = c.get('tenantSchema')!;
  const em = orm.em.fork({ schema });

  // ALWAYS use transaction with SET search_path for tenant data
  const result = await em.transactional(async (txEm) => {
    await txEm.execute(`SET search_path TO "${schema}", public`);
    return txEm.find(MaterialSubstance, { productVersion: { id: versionId } });
  });

  return c.json({ data: result.map(serializeMaterialSubstance) });
});
```

### Response Format (MUST MATCH)
```typescript
// Success
c.json({ data: entity })
c.json({ data: items, meta: { total: items.length } })

// Errors
c.json({ error: 'Not Found', message: 'Material not found' }, 404)
c.json({ error: 'Forbidden', message: 'Insufficient permissions', workspace: 'design', action: 'edit' }, 403)
c.json({ error: 'Bad Request', message: 'Invalid substance reference' }, 400)
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

## Task 1: Create ConcentrationBasis Enum

**Files:**
- Create: `packages/database/src/entities/enums/ConcentrationBasis.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create the enum**

```typescript
// packages/database/src/entities/enums/ConcentrationBasis.ts
export enum ConcentrationBasis {
  WEIGHT = 'WEIGHT',   // % w/w (most common)
  VOLUME = 'VOLUME',   // % v/v
  MOLAR = 'MOLAR',     // mol%
}
```

**Step 2: Export and commit**

```bash
git add packages/database/src/entities/enums/ConcentrationBasis.ts packages/database/src/entities/enums/index.ts
git commit -m "feat(database): add ConcentrationBasis enum"
```

---

## Task 2: Create MaterialSubstance Entity

**Files:**
- Create: `packages/database/src/entities/MaterialSubstance.ts`
- Modify: `packages/database/src/entities/index.ts`
- Test: `packages/database/src/entities/MaterialSubstance.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/MaterialSubstance.test.ts
import { MikroORM } from '@mikro-orm/core';
import { MaterialSubstance } from './MaterialSubstance.js';
import { ProductVersion } from './ProductVersion.js';
import { Product } from './Product.js';
import { Substance } from './Substance.js';
import { Category, CategoryType } from './Category.js';
import { ConcentrationBasis, TargetType } from './enums/index.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('MaterialSubstance', () => {
  let orm: MikroORM;
  let materialVersion: ProductVersion;
  let substance: Substance;

  beforeAll(async () => {
    orm = await createTestOrm([MaterialSubstance, ProductVersion, Product, Substance, Category]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    const em = orm.em.fork();

    // Clean up
    await em.nativeDelete(MaterialSubstance, {});
    await em.nativeDelete(ProductVersion, {});
    await em.nativeDelete(Product, {});
    await em.nativeDelete(Substance, {});
    await em.nativeDelete(Category, {});

    // Create test category (MATERIAL type)
    const category = em.create(Category, {
      name: 'Textiles',
      path: 'materials.textiles',
      type: CategoryType.BRANCH,
      targetType: TargetType.MATERIAL,
      depth: 1,
    });
    await em.persistAndFlush(category);

    // Create test product (material)
    const product = em.create(Product, {
      name: 'Cotton Fabric',
      category,
    });
    await em.persistAndFlush(product);

    // Create test version
    materialVersion = em.create(ProductVersion, {
      product,
      version: '1.0',
    });
    await em.persistAndFlush(materialVersion);

    // Create test substance (in public schema)
    substance = em.create(Substance, {
      casNumber: '127-19-5',
      name: 'N,N-Dimethylacetamide',
    });
    await em.persistAndFlush(substance);
  });

  it('should create a material substance declaration with relations', async () => {
    const em = orm.em.fork();

    const decl = em.create(MaterialSubstance, {
      materialVersion,
      substance,
      concentrationPct: '8.000000',
      basis: ConcentrationBasis.WEIGHT,
      isIntentionallyAdded: true,
      verificationSource: 'Supplier SDS dated 2024-01-15',
    });

    await em.persistAndFlush(decl);

    // Load with populated relations
    const found = await em.findOne(MaterialSubstance,
      { materialVersion: { id: materialVersion.id } },
      { populate: ['substance', 'materialVersion'] }
    );
    expect(found).toBeDefined();
    expect(found?.concentrationPct).toBe('8.000000');
    expect(found?.basis).toBe(ConcentrationBasis.WEIGHT);
    expect(found?.substance.casNumber).toBe('127-19-5');
    expect(found?.substance.name).toBe('N,N-Dimethylacetamide');
  });

  it('should enforce unique material+substance constraint', async () => {
    const em = orm.em.fork();

    const d1 = em.create(MaterialSubstance, {
      materialVersion,
      substance,
      concentrationPct: '5.0',
      basis: ConcentrationBasis.WEIGHT,
    });
    await em.persistAndFlush(d1);

    const d2 = em.create(MaterialSubstance, {
      materialVersion,
      substance,  // Same material + substance
      concentrationPct: '10.0',
      basis: ConcentrationBasis.WEIGHT,
    });

    await expect(em.persistAndFlush(d2)).rejects.toThrow();
  });

  it('should support concentration ranges', async () => {
    const em = orm.em.fork();

    const decl = em.create(MaterialSubstance, {
      materialVersion,
      substance,
      concentrationMin: '0.050000',
      concentrationMax: '0.150000',
      basis: ConcentrationBasis.WEIGHT,
    });

    await em.persistAndFlush(decl);

    const found = await em.findOne(MaterialSubstance, { materialVersion: { id: materialVersion.id } });
    expect(found?.concentrationMin).toBe('0.050000');
    expect(found?.concentrationMax).toBe('0.150000');
  });
});
```

**Step 2: Create the entity**

```typescript
// packages/database/src/entities/MaterialSubstance.ts
import { Entity, Property, Unique, Index, Enum, ManyToOne, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { ConcentrationBasis } from './enums/index.js';
import { ProductVersion } from './ProductVersion.js';
import { Substance } from './Substance.js';

/**
 * MaterialSubstance - Links a material (ProductVersion with targetType=MATERIAL) to a chemical substance.
 *
 * Cross-Schema Design:
 * - materialVersion: Tenant schema (tenant_xxx.product_version)
 * - substance: Public schema (public.substance)
 *
 * MikroORM handles cross-schema relations correctly when using:
 * - em.fork({ schema }) for tenant isolation
 * - SET search_path TO "tenant_xxx", public
 */
@Entity({ tableName: 'material_substance' })
@Unique({ properties: ['materialVersion', 'substance'] })
export class MaterialSubstance extends BaseEntity {
  /**
   * The material version this substance is declared on.
   * Must reference a ProductVersion where the product's category has targetType=MATERIAL.
   */
  @ManyToOne(() => ProductVersion, { fieldName: 'material_version_id' })
  @Index()
  materialVersion!: Rel<ProductVersion>;

  /**
   * The substance from the public registry.
   * Cross-schema relation: this entity is in tenant schema, Substance is in public schema.
   */
  @ManyToOne(() => Substance, { fieldName: 'substance_id' })
  @Index()
  substance!: Rel<Substance>;

  // Concentration data (high precision for regulatory thresholds like 0.1% REACH)
  // Stored as strings to preserve DECIMAL(10,6) precision through JS
  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true, name: 'concentration_pct' })
  concentrationPct?: string;  // % by weight (e.g., "0.100000" for 0.1%)

  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true, name: 'concentration_min' })
  concentrationMin?: string;  // Range minimum (if variable)

  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true, name: 'concentration_max' })
  concentrationMax?: string;  // Range maximum (if variable)

  @Enum({ items: () => ConcentrationBasis, default: ConcentrationBasis.WEIGHT })
  basis: ConcentrationBasis = ConcentrationBasis.WEIGHT;

  // Verification audit trail
  @Property({ nullable: true, name: 'verified_by_id' })
  verifiedById?: string;  // Soft link to user

  @Property({ nullable: true, name: 'verified_at' })
  verifiedAt?: Date;

  @Property({ type: 'text', nullable: true, name: 'verification_source' })
  verificationSource?: string;  // "Supplier SDS dated 2024-01-15"

  // Conditional presence
  @Property({ type: 'boolean', default: false, name: 'is_intentionally_added' })
  isIntentionallyAdded: boolean = false;  // vs. impurity/contamination

  @Property({ type: 'text', nullable: true })
  notes?: string;
}
```

**Step 3: Run tests, export, and commit**

```bash
git add packages/database/src/entities/MaterialSubstance.ts packages/database/src/entities/MaterialSubstance.test.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add MaterialSubstance entity for substance declarations"
```

---

## Task 3: Create MaterialSubstance Migration

**Files:**
- Create: `packages/database/src/migrations/Migration20260126_MaterialSubstance.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260126_MaterialSubstance.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_MaterialSubstance extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS material_substance (
        id VARCHAR(30) PRIMARY KEY,
        material_version_id VARCHAR(30) NOT NULL,
        substance_id VARCHAR(30) NOT NULL,
        concentration_pct DECIMAL(10, 6),
        concentration_min DECIMAL(10, 6),
        concentration_max DECIMAL(10, 6),
        basis VARCHAR(10) DEFAULT 'WEIGHT',
        verified_by_id VARCHAR(30),
        verified_at TIMESTAMPTZ,
        verification_source TEXT,
        is_intentionally_added BOOLEAN DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_material_substance UNIQUE (material_version_id, substance_id)
      );
    `);

    this.addSql(`CREATE INDEX idx_material_substance_version ON material_substance(material_version_id);`);
    this.addSql(`CREATE INDEX idx_material_substance_substance ON material_substance(substance_id);`);

    // Trigger to enforce targetType=MATERIAL constraint
    // IMPORTANT: Uses public.category to prevent schema ambiguity in multi-tenant setup
    this.addSql(`
      CREATE OR REPLACE FUNCTION check_material_version_target_type()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM product_version pv
          JOIN product p ON pv.product_id = p.id
          JOIN public.category c ON p.category_id = c.id
          WHERE pv.id = NEW.material_version_id
          AND c.target_type = 'MATERIAL'
        ) THEN
          RAISE EXCEPTION 'material_substance.material_version_id must reference a product version with category.target_type=MATERIAL';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    this.addSql(`
      CREATE TRIGGER trg_material_substance_validate
        BEFORE INSERT OR UPDATE ON material_substance
        FOR EACH ROW EXECUTE FUNCTION check_material_version_target_type();
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP TRIGGER IF EXISTS trg_material_substance_validate ON material_substance;');
    this.addSql('DROP FUNCTION IF EXISTS check_material_version_target_type();');
    this.addSql('DROP TABLE IF EXISTS material_substance;');
  }
}
```

**Step 2: Run migration and commit**

```bash
cd packages/database && pnpm mikro-orm migration:up
git add packages/database/src/migrations/Migration20260126_MaterialSubstance.ts
git commit -m "feat(database): add migration for material_substance table"
```

---

## Task 4: Create MaterialSubstanceService

**Files:**
- Create: `packages/database/src/services/material-substance.service.ts`
- Test: `packages/database/src/services/material-substance.service.test.ts`

**Step 1: Create the service**

```typescript
// packages/database/src/services/material-substance.service.ts
import { EntityManager } from '@mikro-orm/core';
import { MaterialSubstance } from '../entities/MaterialSubstance.js';
import { ProductVersion } from '../entities/ProductVersion.js';
import { Substance } from '../entities/Substance.js';
import { ConcentrationBasis } from '../entities/enums/index.js';
import { isValidCasNumber } from '../utils/cas-validator.js';

export interface AddSubstanceInput {
  materialVersionId: string;
  casNumber: string;
  concentrationPct?: string;
  concentrationMin?: string;
  concentrationMax?: string;
  basis?: ConcentrationBasis;
  isIntentionallyAdded?: boolean;
  verificationSource?: string;
  verifiedById?: string;
  notes?: string;
}

export class MaterialSubstanceService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Add a substance declaration to a material version.
   * Validates CAS number and checks for duplicates.
   */
  async addSubstance(input: AddSubstanceInput): Promise<MaterialSubstance> {
    // Validate CAS number
    if (!isValidCasNumber(input.casNumber)) {
      throw new Error(`Invalid CAS number: ${input.casNumber}`);
    }

    // Find material version
    const materialVersion = await this.em.findOneOrFail(ProductVersion, { id: input.materialVersionId });

    // Find substance by CAS (from public schema)
    const substance = await this.em.findOne(Substance, { casNumber: input.casNumber }, {
      schema: 'public',
    });

    if (!substance) {
      throw new Error(`Substance not found: ${input.casNumber}`);
    }

    // Check for existing declaration using relations
    const existing = await this.em.findOne(MaterialSubstance, {
      materialVersion: { id: input.materialVersionId },
      substance: { id: substance.id },
    });

    if (existing) {
      throw new Error(`Substance ${input.casNumber} already declared on this material version`);
    }

    const decl = this.em.create(MaterialSubstance, {
      materialVersion,
      substance,
      concentrationPct: input.concentrationPct,
      concentrationMin: input.concentrationMin,
      concentrationMax: input.concentrationMax,
      basis: input.basis ?? ConcentrationBasis.WEIGHT,
      isIntentionallyAdded: input.isIntentionallyAdded ?? false,
      verificationSource: input.verificationSource,
      verifiedById: input.verifiedById,
      verifiedAt: input.verifiedById ? new Date() : undefined,
      notes: input.notes,
    });

    await this.em.persistAndFlush(decl);
    return decl;
  }

  /**
   * Get all substance declarations for a material version.
   * Uses populate to fetch substance details in a single query.
   */
  async getDeclarationsForVersion(materialVersionId: string): Promise<MaterialSubstance[]> {
    return this.em.find(
      MaterialSubstance,
      { materialVersion: { id: materialVersionId } },
      { populate: ['substance'] }
    );
  }

  /**
   * Remove a substance declaration by CAS number.
   */
  async removeSubstance(materialVersionId: string, casNumber: string): Promise<void> {
    const substance = await this.em.findOne(Substance, { casNumber }, { schema: 'public' });
    if (!substance) {
      throw new Error(`Substance not found: ${casNumber}`);
    }

    const decl = await this.em.findOne(MaterialSubstance, {
      materialVersion: { id: materialVersionId },
      substance: { id: substance.id },
    });

    if (!decl) {
      throw new Error(`Substance ${casNumber} not declared on this material version`);
    }

    await this.em.removeAndFlush(decl);
  }

  /**
   * Update a substance declaration.
   * Clears verification status when concentration changes (defensive programming).
   */
  async updateDeclaration(
    materialVersionId: string,
    casNumber: string,
    update: Partial<Pick<MaterialSubstance, 'concentrationPct' | 'concentrationMin' | 'concentrationMax' | 'verificationSource' | 'notes'>>
  ): Promise<MaterialSubstance> {
    const substance = await this.em.findOne(Substance, { casNumber }, { schema: 'public' });
    if (!substance) {
      throw new Error(`Substance not found: ${casNumber}`);
    }

    const decl = await this.em.findOneOrFail(MaterialSubstance, {
      materialVersion: { id: materialVersionId },
      substance: { id: substance.id },
    });

    // Check if concentration is being changed
    const concentrationChanged =
      (update.concentrationPct !== undefined && update.concentrationPct !== decl.concentrationPct) ||
      (update.concentrationMin !== undefined && update.concentrationMin !== decl.concentrationMin) ||
      (update.concentrationMax !== undefined && update.concentrationMax !== decl.concentrationMax);

    Object.assign(decl, update);

    // Defensive: clear verification when concentration changes
    if (concentrationChanged) {
      decl.verifiedById = undefined;
      decl.verifiedAt = undefined;
    }

    await this.em.flush();
    return decl;
  }
}
```

**Step 2: Run tests and commit**

```bash
git add packages/database/src/services/material-substance.service.ts packages/database/src/services/material-substance.service.test.ts
git commit -m "feat(database): add MaterialSubstanceService for substance declarations"
```

---

## Task 5: Create Material Substances API Routes

**Files:**
- Create: `apps/api/src/routes/materials/substances.ts`
- Test: `apps/api/src/routes/materials/substances.e2e.test.ts`
- Modify: `apps/api/src/routes/materials/index.ts`

**API Routes:**
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/materials/:id/versions/:versionId/substances` | design:view | List declarations |
| POST | `/materials/:id/versions/:versionId/substances` | design:edit | Add substance |
| PATCH | `/materials/:id/versions/:versionId/substances/:casNumber` | design:edit | Update |
| DELETE | `/materials/:id/versions/:versionId/substances/:casNumber` | design:edit | Remove |

**Step 1: Create the router**

```typescript
// apps/api/src/routes/materials/substances.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@mikro-orm/core';
import { MaterialSubstance, Substance, ProductVersion, ConcentrationBasis } from '@eurocomply/database';
import { isValidCasNumber } from '@eurocomply/database/utils';
import type { Env } from '../../app.js';
import { authorize } from '../../middleware/authorize.js';

export interface MaterialSubstancesRouterOptions {
  orm: MikroORM;
}

// Decimal regex: accepts strings like "0.1", "100", "0.000001", etc.
// Using strings preserves DECIMAL(10,6) precision through JavaScript
const decimalRegex = /^\d+(\.\d{1,6})?$/;

const addSubstanceSchema = z.object({
  casNumber: z.string().refine(isValidCasNumber, 'Invalid CAS number format'),
  // String concentration preserves decimal precision (avoid JS number precision loss)
  concentrationPct: z.string().regex(decimalRegex, 'Must be a decimal string like "0.1" or "5.500000"').optional(),
  concentrationMin: z.string().regex(decimalRegex).optional(),
  concentrationMax: z.string().regex(decimalRegex).optional(),
  basis: z.nativeEnum(ConcentrationBasis).default(ConcentrationBasis.WEIGHT),
  isIntentionallyAdded: z.boolean().default(false),
  verificationSource: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

const updateSubstanceSchema = z.object({
  concentrationPct: z.string().regex(decimalRegex).optional(),
  concentrationMin: z.string().regex(decimalRegex).optional(),
  concentrationMax: z.string().regex(decimalRegex).optional(),
  basis: z.nativeEnum(ConcentrationBasis).optional(),
  verificationSource: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

export function createMaterialSubstancesRouter(options: MaterialSubstancesRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  // GET /:materialId/versions/:versionId/substances - List substance declarations
  // Returns full substance details (populated) so frontend doesn't need second call
  router.get('/:materialId/versions/:versionId/substances', authorize('design', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const versionId = c.req.param('versionId');

    const declarations = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);
      return txEm.find(
        MaterialSubstance,
        { materialVersion: { id: versionId } },
        { populate: ['substance'] }  // Fetch substance in same query
      );
    });

    return c.json({
      data: declarations.map(d => ({
        id: d.id,
        // Substance details (populated)
        substance: {
          id: d.substance.id,
          casNumber: d.substance.casNumber,
          name: d.substance.name,
          ecNumber: d.substance.ecNumber,
        },
        // Concentration (as strings to preserve precision)
        concentrationPct: d.concentrationPct,
        concentrationMin: d.concentrationMin,
        concentrationMax: d.concentrationMax,
        basis: d.basis,
        isIntentionallyAdded: d.isIntentionallyAdded,
        // Verification
        verifiedById: d.verifiedById,
        verifiedAt: d.verifiedAt,
        verificationSource: d.verificationSource,
        notes: d.notes,
      })),
      meta: { total: declarations.length, versionId },
    });
  });

  // POST /:materialId/versions/:versionId/substances - Add substance declaration
  router.post('/:materialId/versions/:versionId/substances', authorize('design', 'edit'), zValidator('json', addSubstanceSchema), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const versionId = c.req.param('versionId');
    const body = c.req.valid('json');

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      // Verify product version exists
      const materialVersion = await txEm.findOne(ProductVersion, { id: versionId });
      if (!materialVersion) {
        return { error: 'Material version not found' as const };
      }

      // Verify substance exists in public schema
      const substance = await txEm.findOne(Substance, { casNumber: body.casNumber });
      if (!substance) {
        return { error: `Substance not found: ${body.casNumber}` as const };
      }

      // Check for duplicate using relations
      const existing = await txEm.findOne(MaterialSubstance, {
        materialVersion: { id: versionId },
        substance: { id: substance.id },
      });
      if (existing) {
        return { error: `Substance ${body.casNumber} already declared on this version` as const, status: 409 };
      }

      const declaration = txEm.create(MaterialSubstance, {
        materialVersion,
        substance,
        concentrationPct: body.concentrationPct,
        concentrationMin: body.concentrationMin,
        concentrationMax: body.concentrationMax,
        basis: body.basis,
        isIntentionallyAdded: body.isIntentionallyAdded,
        verificationSource: body.verificationSource,
        notes: body.notes,
      });

      await txEm.persistAndFlush(declaration);
      return { declaration, substance };
    });

    if ('error' in result) {
      const status = result.status || 400;
      return c.json({ error: status === 409 ? 'Conflict' : 'Bad Request', message: result.error }, status as 400 | 409);
    }

    return c.json({
      data: {
        id: result.declaration.id,
        substance: {
          id: result.substance.id,
          casNumber: result.substance.casNumber,
          name: result.substance.name,
        },
        concentrationPct: result.declaration.concentrationPct,
        basis: result.declaration.basis,
      },
    }, 201);
  });

  // PATCH /:materialId/versions/:versionId/substances/:casNumber - Update declaration
  router.patch('/:materialId/versions/:versionId/substances/:casNumber', authorize('design', 'edit'), zValidator('json', updateSubstanceSchema), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const versionId = c.req.param('versionId');
    const casNumber = c.req.param('casNumber');
    const body = c.req.valid('json');

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      // Find substance by CAS
      const substance = await txEm.findOne(Substance, { casNumber });
      if (!substance) {
        return { error: `Substance not found: ${casNumber}` as const };
      }

      const declaration = await txEm.findOne(MaterialSubstance, {
        materialVersion: { id: versionId },
        substance: { id: substance.id },
      });

      if (!declaration) {
        return { error: 'Substance declaration not found' as const };
      }

      // Track if concentration is changing
      const concentrationChanging =
        (body.concentrationPct !== undefined && body.concentrationPct !== declaration.concentrationPct) ||
        (body.concentrationMin !== undefined && body.concentrationMin !== declaration.concentrationMin) ||
        (body.concentrationMax !== undefined && body.concentrationMax !== declaration.concentrationMax);

      // Apply updates
      if (body.concentrationPct !== undefined) declaration.concentrationPct = body.concentrationPct;
      if (body.concentrationMin !== undefined) declaration.concentrationMin = body.concentrationMin;
      if (body.concentrationMax !== undefined) declaration.concentrationMax = body.concentrationMax;
      if (body.basis !== undefined) declaration.basis = body.basis;
      if (body.verificationSource !== undefined) declaration.verificationSource = body.verificationSource;
      if (body.notes !== undefined) declaration.notes = body.notes;

      // Defensive: clear verification when concentration changes
      if (concentrationChanging) {
        declaration.verifiedById = undefined;
        declaration.verifiedAt = undefined;
      }

      await txEm.flush();
      return { declaration };
    });

    if ('error' in result) {
      return c.json({ error: 'Not Found', message: result.error }, 404);
    }

    return c.json({
      data: {
        id: result.declaration.id,
        concentrationPct: result.declaration.concentrationPct,
        verifiedAt: result.declaration.verifiedAt,  // null if cleared
      },
    });
  });

  // DELETE /:materialId/versions/:versionId/substances/:casNumber - Remove declaration
  router.delete('/:materialId/versions/:versionId/substances/:casNumber', authorize('design', 'edit'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const versionId = c.req.param('versionId');
    const casNumber = c.req.param('casNumber');

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      // Find substance by CAS
      const substance = await txEm.findOne(Substance, { casNumber });
      if (!substance) {
        return { error: `Substance not found: ${casNumber}` as const };
      }

      const declaration = await txEm.findOne(MaterialSubstance, {
        materialVersion: { id: versionId },
        substance: { id: substance.id },
      });

      if (!declaration) {
        return { error: 'Substance declaration not found' as const };
      }

      await txEm.removeAndFlush(declaration);
      return { success: true };
    });

    if ('error' in result) {
      return c.json({ error: 'Not Found', message: result.error }, 404);
    }

    return c.json({ data: { success: true } });
  });

  return router;
}
```

**Step 2: Register in app.ts**

```typescript
// apps/api/src/app.ts - add to createApp function
// Material substance routes (tenant-scoped, requires auth)
v1.use('/materials/*', createTenantMiddlewareWithApiKeys(deps.orm.em as any));
if (userMiddleware) {
  v1.use('/materials/*', userMiddleware);
}
v1.route('/materials', createMaterialSubstancesRouter({ orm: deps.orm }));
```

**Step 3: Write e2e tests and commit**

```bash
git add apps/api/src/routes/materials/substances.ts apps/api/src/routes/materials/substances.e2e.test.ts
git commit -m "feat(api): add material substances API with tenant isolation and auth"
```

---

## Summary

**Deliverables:**
- `ConcentrationBasis` enum
- `MaterialSubstance` entity with migration
- `MaterialSubstanceService` for CRUD operations
- Material substances API routes
- CAS validation integration
- Verification audit trail support

**Next Plan:** Plan 8 (Substance Rollup & Compliance) aggregates substances through BOM.
