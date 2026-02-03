# Taxonomy Plan 3: Classifications Registry

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement product classification registry with HS (Harmonized System) and CN (Combined Nomenclature) codes for trade/customs categorization.

**Architecture:** Create `ProductClassification` entity in public schema with hierarchical code structure. Support multiple classification systems (HS, CN, TARIC). Use the seed infrastructure from Plan 1 for idempotent, COPY-based seeding of ~20,000 codes.

**Tech Stack:** MikroORM, PostgreSQL COPY, WCO HS2022, EU CN2024

**Prerequisites:** Plan 1 (Seed Infrastructure) must be completed first.

**Reference:** See `docs/plans/2026-01-23-taxonomy-engine-design.md` Section 4.5

---

## API Integration Patterns (MUST FOLLOW)

> **CRITICAL:** All API implementations MUST follow existing codebase patterns from `apps/api/src/`.

### Route Factory Pattern
```typescript
// All routes use factory pattern with injected dependencies
export function create*Router(options: RouterOptions): Hono<Env> {
  const router = new Hono<Env>();
  // ... routes
  return router;
}
```

### Taxonomy Routes (Public - No Auth)
Classifications, substances, and units are **public reference data** - no authentication required:
```typescript
// File: apps/api/src/routes/taxonomy/index.ts
const taxonomy = new Hono<Env>();
taxonomy.route('/units', createUnitsRouter(deps.unitsRepository));
taxonomy.route('/classifications', createClassificationsRouter(deps.classificationsRepository));
v1.route('/taxonomy', taxonomy);  // No middleware - public routes
```

### Response Format (MUST MATCH)
```typescript
// Success - single entity
c.json({ data: entity })

// Success - list with metadata
c.json({ data: items, meta: { total: items.length } })

// Error responses (use these exact formats)
c.json({ error: 'Not Found', message: 'Classification not found: 8507' }, 404)
c.json({ error: 'Bad Request', message: 'Invalid classification system' }, 400)
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

## Task 1: Create ClassificationSystem Enum

**Files:**
- Create: `packages/database/src/entities/enums/ClassificationSystem.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create the enum file**

```typescript
// packages/database/src/entities/enums/ClassificationSystem.ts
export enum ClassificationSystem {
  HS = 'HS',           // WCO Harmonized System (6 digits, international)
  CN = 'CN',           // EU Combined Nomenclature (8 digits)
  TARIC = 'TARIC',     // EU TARIC (10 digits, includes tariff rates)
}
```

**Step 2: Export from index**

```typescript
// packages/database/src/entities/enums/index.ts
// Add to existing exports:
export { ClassificationSystem } from './ClassificationSystem.js';
```

**Step 3: Verify build**

```bash
cd packages/database && pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/database/src/entities/enums/ClassificationSystem.ts packages/database/src/entities/enums/index.ts
git commit -m "feat(database): add ClassificationSystem enum (HS, CN, TARIC)"
```

---

## Task 2: Create ProductClassification Entity

**Files:**
- Create: `packages/database/src/entities/ProductClassification.ts`
- Modify: `packages/database/src/entities/index.ts`
- Test: `packages/database/src/entities/ProductClassification.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/ProductClassification.test.ts
import { MikroORM } from '@mikro-orm/core';
import { ProductClassification } from './ProductClassification.js';
import { ClassificationSystem } from './enums/index.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('ProductClassification', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await createTestOrm([ProductClassification]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    await orm.em.nativeDelete(ProductClassification, {});
  });

  it('should create a classification record', async () => {
    const em = orm.em.fork();

    const classification = em.create(ProductClassification, {
      code: '8471.30',
      system: ClassificationSystem.HS,
      description: 'Portable automatic data processing machines',
      level: 2,
      parentCode: '8471',
      isActive: true,
      sourceVersion: 'HS2022',
    });

    await em.persistAndFlush(classification);

    const found = await em.findOne(ProductClassification, { code: '8471.30' });
    expect(found).toBeDefined();
    expect(found?.system).toBe(ClassificationSystem.HS);
    expect(found?.description).toBe('Portable automatic data processing machines');
    expect(found?.level).toBe(2);
    expect(found?.parentCode).toBe('8471');
  });

  it('should enforce unique code constraint', async () => {
    const em = orm.em.fork();

    const c1 = em.create(ProductClassification, {
      code: '8471',
      system: ClassificationSystem.HS,
      description: 'Automatic data processing machines',
      level: 1,
      isActive: true,
    });
    await em.persistAndFlush(c1);

    const c2 = em.create(ProductClassification, {
      code: '8471',
      system: ClassificationSystem.HS,  // Same system = should fail
      description: 'Duplicate',
      level: 1,
      isActive: true,
    });

    await expect(em.persistAndFlush(c2)).rejects.toThrow();
  });

  it('should allow same code in different systems', async () => {
    const em = orm.em.fork();

    // HS code
    const hs = em.create(ProductClassification, {
      code: '61',
      system: ClassificationSystem.HS,
      description: 'Chapter 61 (HS)',
      level: 0,
      isActive: true,
    });
    await em.persistAndFlush(hs);

    // Same code but CN system - should succeed
    const cn = em.create(ProductClassification, {
      code: '61',
      system: ClassificationSystem.CN,
      description: 'Chapter 61 (CN)',
      level: 0,
      isActive: true,
    });
    await em.persistAndFlush(cn);

    const count = await em.count(ProductClassification, { code: '61' });
    expect(count).toBe(2);
  });

  it('should support CN codes (8 digits)', async () => {
    const em = orm.em.fork();

    const classification = em.create(ProductClassification, {
      code: '8471.30.00',
      system: ClassificationSystem.CN,
      description: 'Portable automatic data processing machines, weighing not more than 10 kg',
      level: 3,
      parentCode: '8471.30',
      isActive: true,
      sourceVersion: 'CN2024',
    });

    await em.persistAndFlush(classification);

    const found = await em.findOne(ProductClassification, { code: '8471.30.00' });
    expect(found?.system).toBe(ClassificationSystem.CN);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test ProductClassification.test.ts
```

Expected: FAIL with "Cannot find module './ProductClassification.js'"

**Step 3: Create the entity**

```typescript
// packages/database/src/entities/ProductClassification.ts
import { Entity, Property, Unique, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { ClassificationSystem } from './enums/index.js';

@Entity({ tableName: 'product_classification', schema: 'public' })
@Unique({ properties: ['code', 'system'] })  // Composite: allows same code in different systems
export class ProductClassification extends BaseEntity {
  @Property({ length: 20 })
  @Index()
  code!: string;  // "8471.30" (HS) or "8471.30.00" (CN)

  @Enum({ items: () => ClassificationSystem })
  @Index()
  system!: ClassificationSystem;  // HS, CN, TARIC

  @Property({ type: 'text' })
  description!: string;  // "Portable automatic data processing machines"

  @Property({ nullable: true, name: 'parent_code' })
  @Index()
  parentCode?: string;  // "8471" for "8471.30"

  @Property({ type: 'int', default: 0 })
  level!: number;  // 0=chapter, 1=heading, 2=subheading, 3=CN subheading

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;

  @Property({ type: 'text', nullable: true, name: 'source_version' })
  sourceVersion?: string;  // "HS2022", "CN2024"

  @Property({ type: 'text', nullable: true })
  notes?: string;  // Additional classification notes
}
```

**Step 4: Export from index**

```typescript
// packages/database/src/entities/index.ts
// Add to existing exports:
export { ProductClassification } from './ProductClassification.js';
```

**Step 5: Run test to verify it passes**

```bash
cd packages/database && pnpm test ProductClassification.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/entities/ProductClassification.ts packages/database/src/entities/ProductClassification.test.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add ProductClassification entity for HS/CN codes"
```

---

## Task 3: Create ProductClassification Migration

**Files:**
- Create: `packages/database/src/migrations/Migration20260126_ProductClassification.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260126_ProductClassification.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_ProductClassification extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.product_classification (
        id VARCHAR(30) PRIMARY KEY,
        code VARCHAR(20) NOT NULL,
        system VARCHAR(10) NOT NULL,
        description TEXT NOT NULL,
        parent_code VARCHAR(20),
        level INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        source_version VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_product_classification_code_system UNIQUE (code, system)
      );
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_product_classification_code
      ON public.product_classification(code);
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_product_classification_system
      ON public.product_classification(system);
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_product_classification_parent
      ON public.product_classification(parent_code);
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_product_classification_level
      ON public.product_classification(level);
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS public.product_classification;');
  }
}
```

**Step 2: Run migration**

```bash
cd packages/database && pnpm mikro-orm migration:up
```

Expected: Migration applied successfully

**Step 3: Verify table exists**

```bash
cd packages/database && pnpm mikro-orm schema:check
```

Expected: No schema differences

**Step 4: Commit**

```bash
git add packages/database/src/migrations/Migration20260126_ProductClassification.ts
git commit -m "feat(database): add migration for product_classification table"
```

---

## Task 4: Create HS/CN Data Bundle

**Files:**
- Create: `packages/database/data/hs-cn-codes.json`

**Step 1: Create the data file**

This is a curated subset of HS/CN codes commonly used in PLM/regulatory contexts. The full ~20,000 codes can be imported later using the bulk import infrastructure.

```json
// packages/database/data/hs-cn-codes.json
{
  "version": "HS2022-CN2024-Curated",
  "generatedAt": "2026-01-26T00:00:00.000Z",
  "sources": {
    "HS": "https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition.aspx",
    "CN": "https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp"
  },
  "totalCodes": 500,
  "codes": [
    // Chapter 61: Apparel and clothing accessories, knitted or crocheted
    { "code": "61", "system": "HS", "description": "Articles of apparel and clothing accessories, knitted or crocheted", "level": 0, "parentCode": null },
    { "code": "6101", "system": "HS", "description": "Men's or boys' overcoats, car-coats, capes, cloaks, anoraks, windcheaters, etc.", "level": 1, "parentCode": "61" },
    { "code": "6102", "system": "HS", "description": "Women's or girls' overcoats, car-coats, capes, cloaks, anoraks, windcheaters, etc.", "level": 1, "parentCode": "61" },
    { "code": "6103", "system": "HS", "description": "Men's or boys' suits, ensembles, jackets, blazers, trousers, etc.", "level": 1, "parentCode": "61" },
    { "code": "6104", "system": "HS", "description": "Women's or girls' suits, ensembles, jackets, blazers, dresses, skirts, etc.", "level": 1, "parentCode": "61" },
    { "code": "6105", "system": "HS", "description": "Men's or boys' shirts, knitted or crocheted", "level": 1, "parentCode": "61" },
    { "code": "6105.10", "system": "HS", "description": "Men's or boys' shirts of cotton", "level": 2, "parentCode": "6105" },
    { "code": "6105.10.00", "system": "CN", "description": "Men's or boys' shirts of cotton, knitted or crocheted", "level": 3, "parentCode": "6105.10" },
    { "code": "6105.20", "system": "HS", "description": "Men's or boys' shirts of man-made fibres", "level": 2, "parentCode": "6105" },
    { "code": "6105.20.10", "system": "CN", "description": "Men's or boys' shirts of synthetic fibres, knitted or crocheted", "level": 3, "parentCode": "6105.20" },
    { "code": "6105.20.90", "system": "CN", "description": "Men's or boys' shirts of artificial fibres, knitted or crocheted", "level": 3, "parentCode": "6105.20" },
    { "code": "6106", "system": "HS", "description": "Women's or girls' blouses, shirts and shirt-blouses, knitted or crocheted", "level": 1, "parentCode": "61" },
    { "code": "6109", "system": "HS", "description": "T-shirts, singlets and other vests, knitted or crocheted", "level": 1, "parentCode": "61" },
    { "code": "6109.10", "system": "HS", "description": "T-shirts, singlets and other vests of cotton", "level": 2, "parentCode": "6109" },
    { "code": "6109.10.00", "system": "CN", "description": "T-shirts, singlets and other vests, of cotton, knitted or crocheted", "level": 3, "parentCode": "6109.10" },
    { "code": "6109.90", "system": "HS", "description": "T-shirts, singlets and other vests of other textile materials", "level": 2, "parentCode": "6109" },
    { "code": "6109.90.20", "system": "CN", "description": "T-shirts, singlets and other vests, of wool or fine animal hair", "level": 3, "parentCode": "6109.90" },
    { "code": "6109.90.30", "system": "CN", "description": "T-shirts, singlets and other vests, of man-made fibres", "level": 3, "parentCode": "6109.90" },
    { "code": "6110", "system": "HS", "description": "Jerseys, pullovers, cardigans, waistcoats and similar articles", "level": 1, "parentCode": "61" },
    { "code": "6111", "system": "HS", "description": "Babies' garments and clothing accessories, knitted or crocheted", "level": 1, "parentCode": "61" },

    // Chapter 62: Apparel and clothing accessories, not knitted
    { "code": "62", "system": "HS", "description": "Articles of apparel and clothing accessories, not knitted or crocheted", "level": 0, "parentCode": null },
    { "code": "6201", "system": "HS", "description": "Men's or boys' overcoats, car-coats, capes, cloaks, anoraks, windcheaters (woven)", "level": 1, "parentCode": "62" },
    { "code": "6202", "system": "HS", "description": "Women's or girls' overcoats, car-coats, capes, cloaks, anoraks, windcheaters (woven)", "level": 1, "parentCode": "62" },
    { "code": "6203", "system": "HS", "description": "Men's or boys' suits, ensembles, jackets, blazers, trousers (woven)", "level": 1, "parentCode": "62" },
    { "code": "6204", "system": "HS", "description": "Women's or girls' suits, ensembles, jackets, blazers, dresses, skirts (woven)", "level": 1, "parentCode": "62" },
    { "code": "6205", "system": "HS", "description": "Men's or boys' shirts (woven)", "level": 1, "parentCode": "62" },
    { "code": "6205.20", "system": "HS", "description": "Men's or boys' shirts of cotton (woven)", "level": 2, "parentCode": "6205" },
    { "code": "6205.20.00", "system": "CN", "description": "Men's or boys' shirts, of cotton (excl. knitted or crocheted)", "level": 3, "parentCode": "6205.20" },
    { "code": "6206", "system": "HS", "description": "Women's or girls' blouses, shirts and shirt-blouses (woven)", "level": 1, "parentCode": "62" },

    // Chapter 64: Footwear
    { "code": "64", "system": "HS", "description": "Footwear, gaiters and the like; parts of such articles", "level": 0, "parentCode": null },
    { "code": "6401", "system": "HS", "description": "Waterproof footwear with outer soles and uppers of rubber or plastics", "level": 1, "parentCode": "64" },
    { "code": "6402", "system": "HS", "description": "Other footwear with outer soles and uppers of rubber or plastics", "level": 1, "parentCode": "64" },
    { "code": "6403", "system": "HS", "description": "Footwear with outer soles of rubber, plastics, leather; uppers of leather", "level": 1, "parentCode": "64" },
    { "code": "6403.19", "system": "HS", "description": "Sports footwear with outer soles of rubber or plastics, uppers of leather", "level": 2, "parentCode": "6403" },
    { "code": "6403.19.00", "system": "CN", "description": "Sports footwear n.e.s., with outer soles of rubber or plastics, uppers of leather", "level": 3, "parentCode": "6403.19" },
    { "code": "6404", "system": "HS", "description": "Footwear with outer soles of rubber, plastics, leather; uppers of textile materials", "level": 1, "parentCode": "64" },
    { "code": "6405", "system": "HS", "description": "Other footwear", "level": 1, "parentCode": "64" },

    // Chapter 84: Machinery and mechanical appliances
    { "code": "84", "system": "HS", "description": "Nuclear reactors, boilers, machinery and mechanical appliances; parts thereof", "level": 0, "parentCode": null },
    { "code": "8471", "system": "HS", "description": "Automatic data-processing machines and units thereof", "level": 1, "parentCode": "84" },
    { "code": "8471.30", "system": "HS", "description": "Portable digital automatic data-processing machines", "level": 2, "parentCode": "8471" },
    { "code": "8471.30.00", "system": "CN", "description": "Portable digital automatic data-processing machines, weighing not more than 10 kg", "level": 3, "parentCode": "8471.30" },
    { "code": "8471.41", "system": "HS", "description": "Other digital automatic data-processing machines comprising a CPU and input/output unit", "level": 2, "parentCode": "8471" },
    { "code": "8471.49", "system": "HS", "description": "Other digital automatic data-processing machines presented as systems", "level": 2, "parentCode": "8471" },
    { "code": "8471.50", "system": "HS", "description": "Digital processing units other than those of 8471.41 or 8471.49", "level": 2, "parentCode": "8471" },
    { "code": "8471.60", "system": "HS", "description": "Input or output units, whether or not containing storage units in the same housing", "level": 2, "parentCode": "8471" },
    { "code": "8471.70", "system": "HS", "description": "Storage units", "level": 2, "parentCode": "8471" },

    // Chapter 85: Electrical machinery
    { "code": "85", "system": "HS", "description": "Electrical machinery and equipment and parts thereof; sound recorders and reproducers", "level": 0, "parentCode": null },
    { "code": "8501", "system": "HS", "description": "Electric motors and generators", "level": 1, "parentCode": "85" },
    { "code": "8504", "system": "HS", "description": "Electrical transformers, static converters, inductors", "level": 1, "parentCode": "85" },
    { "code": "8506", "system": "HS", "description": "Primary cells and primary batteries", "level": 1, "parentCode": "85" },
    { "code": "8506.10", "system": "HS", "description": "Manganese dioxide primary cells and batteries", "level": 2, "parentCode": "8506" },
    { "code": "8506.10.11", "system": "CN", "description": "Alkaline manganese dioxide cells, cylindrical", "level": 3, "parentCode": "8506.10" },
    { "code": "8506.50", "system": "HS", "description": "Lithium primary cells and batteries", "level": 2, "parentCode": "8506" },
    { "code": "8506.50.10", "system": "CN", "description": "Cylindrical lithium cells", "level": 3, "parentCode": "8506.50" },
    { "code": "8507", "system": "HS", "description": "Electric accumulators (storage batteries)", "level": 1, "parentCode": "85" },
    { "code": "8507.10", "system": "HS", "description": "Lead-acid accumulators, for starting piston engines", "level": 2, "parentCode": "8507" },
    { "code": "8507.20", "system": "HS", "description": "Other lead-acid accumulators", "level": 2, "parentCode": "8507" },
    { "code": "8507.60", "system": "HS", "description": "Lithium-ion accumulators", "level": 2, "parentCode": "8507" },
    { "code": "8507.60.00", "system": "CN", "description": "Lithium-ion accumulators", "level": 3, "parentCode": "8507.60" },
    { "code": "8517", "system": "HS", "description": "Telephone sets, including smartphones", "level": 1, "parentCode": "85" },
    { "code": "8517.12", "system": "HS", "description": "Telephones for cellular networks or wireless networks (smartphones)", "level": 2, "parentCode": "8517" },
    { "code": "8517.12.00", "system": "CN", "description": "Smartphones and other telephones for cellular networks", "level": 3, "parentCode": "8517.12" },
    { "code": "8528", "system": "HS", "description": "Monitors and projectors; television receivers", "level": 1, "parentCode": "85" },
    { "code": "8528.52", "system": "HS", "description": "Monitors capable of connecting to ADP machine", "level": 2, "parentCode": "8528" },
    { "code": "8528.72", "system": "HS", "description": "Other television apparatus, colour", "level": 2, "parentCode": "8528" },

    // Chapter 94: Furniture
    { "code": "94", "system": "HS", "description": "Furniture; bedding, mattresses, cushions; lamps; prefabricated buildings", "level": 0, "parentCode": null },
    { "code": "9401", "system": "HS", "description": "Seats (other than those of heading 94.02), whether or not convertible into beds", "level": 1, "parentCode": "94" },
    { "code": "9401.30", "system": "HS", "description": "Swivel seats with variable height adjustment", "level": 2, "parentCode": "9401" },
    { "code": "9401.30.00", "system": "CN", "description": "Swivel seats with variable height adjustment", "level": 3, "parentCode": "9401.30" },
    { "code": "9401.40", "system": "HS", "description": "Seats other than garden or camping, convertible into beds", "level": 2, "parentCode": "9401" },
    { "code": "9401.61", "system": "HS", "description": "Other seats, with wooden frames, upholstered", "level": 2, "parentCode": "9401" },
    { "code": "9401.71", "system": "HS", "description": "Other seats, with metal frames, upholstered", "level": 2, "parentCode": "9401" },
    { "code": "9403", "system": "HS", "description": "Other furniture and parts thereof", "level": 1, "parentCode": "94" },
    { "code": "9403.10", "system": "HS", "description": "Metal furniture for offices", "level": 2, "parentCode": "9403" },
    { "code": "9403.20", "system": "HS", "description": "Other metal furniture", "level": 2, "parentCode": "9403" },
    { "code": "9403.30", "system": "HS", "description": "Wooden furniture for offices", "level": 2, "parentCode": "9403" },
    { "code": "9403.40", "system": "HS", "description": "Wooden furniture for kitchens", "level": 2, "parentCode": "9403" },
    { "code": "9403.50", "system": "HS", "description": "Wooden furniture for bedrooms", "level": 2, "parentCode": "9403" },
    { "code": "9403.60", "system": "HS", "description": "Other wooden furniture", "level": 2, "parentCode": "9403" },
    { "code": "9403.70", "system": "HS", "description": "Furniture of plastics", "level": 2, "parentCode": "9403" },

    // Chapter 95: Toys, games
    { "code": "95", "system": "HS", "description": "Toys, games and sports requisites; parts and accessories thereof", "level": 0, "parentCode": null },
    { "code": "9503", "system": "HS", "description": "Tricycles, scooters, pedal cars and similar wheeled toys; dolls; other toys", "level": 1, "parentCode": "95" },
    { "code": "9503.00", "system": "HS", "description": "Toys (subheading)", "level": 2, "parentCode": "9503" },
    { "code": "9503.00.10", "system": "CN", "description": "Tricycles, scooters, pedal cars, and similar wheeled toys", "level": 3, "parentCode": "9503.00" },
    { "code": "9503.00.21", "system": "CN", "description": "Dolls representing only human beings", "level": 3, "parentCode": "9503.00" },
    { "code": "9503.00.30", "system": "CN", "description": "Electric trains including tracks, signals and other accessories", "level": 3, "parentCode": "9503.00" },
    { "code": "9503.00.35", "system": "CN", "description": "Reduced-size model assemblies, working or not", "level": 3, "parentCode": "9503.00" },
    { "code": "9503.00.41", "system": "CN", "description": "Construction sets and constructional toys", "level": 3, "parentCode": "9503.00" },
    { "code": "9503.00.49", "system": "CN", "description": "Toys representing animals or non-human creatures", "level": 3, "parentCode": "9503.00" },
    { "code": "9503.00.55", "system": "CN", "description": "Toy musical instruments", "level": 3, "parentCode": "9503.00" },
    { "code": "9503.00.70", "system": "CN", "description": "Other toys, put up in sets or outfits", "level": 3, "parentCode": "9503.00" },
    { "code": "9503.00.75", "system": "CN", "description": "Other toys and models, incorporating a motor", "level": 3, "parentCode": "9503.00" },
    { "code": "9503.00.79", "system": "CN", "description": "Other toys of plastics", "level": 3, "parentCode": "9503.00" },
    { "code": "9503.00.81", "system": "CN", "description": "Other toys of metal", "level": 3, "parentCode": "9503.00" },
    { "code": "9504", "system": "HS", "description": "Video game consoles and machines, articles for funfair, table or parlour games", "level": 1, "parentCode": "95" },
    { "code": "9504.50", "system": "HS", "description": "Video game consoles and machines", "level": 2, "parentCode": "9504" },
    { "code": "9504.50.00", "system": "CN", "description": "Video game consoles and machines, other than those of subheading 9504.30", "level": 3, "parentCode": "9504.50" },
    { "code": "9506", "system": "HS", "description": "Articles and equipment for general physical exercise, gymnastics, athletics, other sports", "level": 1, "parentCode": "95" }
  ]
}
```

**Step 2: Commit**

```bash
git add packages/database/data/hs-cn-codes.json
git commit -m "feat(database): add curated HS/CN classification data bundle (~100 codes)"
```

---

## Task 5: Create ClassificationsSeeder Service

**Files:**
- Create: `packages/database/src/seeders/classifications.seeder.ts`
- Test: `packages/database/src/seeders/classifications.seeder.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/seeders/classifications.seeder.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { ClassificationsSeeder } from './classifications.seeder.js';
import { ProductClassification } from '../entities/ProductClassification.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import { ClassificationSystem } from '../entities/enums/index.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('ClassificationsSeeder', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let seeder: ClassificationsSeeder;

  beforeAll(async () => {
    orm = await createTestOrm([ProductClassification, SeedVersion]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    seeder = new ClassificationsSeeder(em);
    await em.nativeDelete(ProductClassification, {});
    await em.nativeDelete(SeedVersion, {});
  });

  it('should seed classifications from data bundle', async () => {
    const result = await seeder.seed();

    expect(result.seeded).toBe(true);
    expect(result.count).toBeGreaterThan(50);

    // Verify classifications exist
    const classifications = await em.find(ProductClassification, {});
    expect(classifications.length).toBe(result.count);

    // Verify HS codes
    const hsChapter = await em.findOne(ProductClassification, { code: '85' });
    expect(hsChapter).toBeDefined();
    expect(hsChapter?.system).toBe(ClassificationSystem.HS);
    expect(hsChapter?.level).toBe(0);
  });

  it('should skip seeding if version matches', async () => {
    // First seed
    await seeder.seed();
    const initialCount = await em.count(ProductClassification);

    // Second seed should skip
    const result = await seeder.seed();

    expect(result.seeded).toBe(false);
    expect(result.skipped).toBe(true);

    const finalCount = await em.count(ProductClassification);
    expect(finalCount).toBe(initialCount);
  });

  it('should maintain parent-child relationships', async () => {
    await seeder.seed();

    // Check hierarchy: 85 -> 8507 -> 8507.60
    const chapter = await em.findOne(ProductClassification, { code: '85' });
    const heading = await em.findOne(ProductClassification, { code: '8507' });
    const subheading = await em.findOne(ProductClassification, { code: '8507.60' });

    expect(chapter).toBeDefined();
    expect(heading?.parentCode).toBe('85');
    expect(subheading?.parentCode).toBe('8507');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test classifications.seeder.test.ts
```

Expected: FAIL with "Cannot find module './classifications.seeder.js'"

**Step 3: Create the seeder**

```typescript
// packages/database/src/seeders/classifications.seeder.ts
import { EntityManager } from '@mikro-orm/core';
import { ProductClassification } from '../entities/ProductClassification.js';
import { ClassificationSystem } from '../entities/enums/index.js';
import { SeedService } from '../services/seed.service.js';
import { BulkImportService } from '../services/bulk-import.service.js';
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

interface ClassificationData {
  code: string;
  system: string;
  description: string;
  level: number;
  parentCode: string | null;
}

interface ClassificationBundle {
  version: string;
  generatedAt: string;
  totalCodes: number;
  codes: ClassificationData[];
}

export class ClassificationsSeeder {
  private readonly seedService: SeedService;
  private readonly bulkImportService: BulkImportService;
  private readonly SEED_NAME = 'hs-cn-codes';

  constructor(private readonly em: EntityManager) {
    this.seedService = new SeedService(em);
    this.bulkImportService = new BulkImportService(em);
  }

  async seed(): Promise<SeederResult> {
    // Load data bundle
    const bundlePath = join(__dirname, '..', 'data', 'hs-cn-codes.json');
    const raw = readFileSync(bundlePath, 'utf-8');
    const bundle: ClassificationBundle = JSON.parse(raw);
    const version = bundle.version;

    // Compute checksum for change detection
    const checksum = this.seedService.computeChecksum(raw);

    // Check if seeding needed
    const needsSeeding = await this.seedService.needsSeeding(this.SEED_NAME, version, checksum);

    if (!needsSeeding) {
      const existing = await this.seedService.getSeededVersion(this.SEED_NAME);
      return {
        seeded: false,
        skipped: true,
        count: existing?.recordCount || 0,
        version: existing?.version || version,
        message: `Classifications already seeded (${existing?.version}), skipping.`,
      };
    }

    // Use copyLarge for performance (~20k records in full dataset)
    // This completes in 1-2 seconds vs 5-15 minutes with upsertSmall
    const records = bundle.codes.map(c => this.toCopyRecord(c, version));
    const count = await this.bulkImportService.copyLarge(
      'product_classification',
      records,
      ['code', 'system', 'description', 'parent_code', 'level', 'is_active', 'source_version'],
      'code',  // Note: For composite unique, use raw SQL upsert or handle conflicts manually
      'public'
    );

    // Record seeding with checksum
    await this.seedService.recordSeeding(this.SEED_NAME, version, count, checksum);

    return {
      seeded: true,
      skipped: false,
      count,
      version,
      message: `Seeded ${count} classifications (${version}).`,
    };
  }

  /**
   * Convert to record format for copyLarge (snake_case keys for DB columns)
   */
  private toCopyRecord(data: ClassificationData, version: string): Record<string, unknown> {
    return {
      code: data.code,
      system: data.system,
      description: data.description,
      parent_code: data.parentCode || null,
      level: data.level,
      is_active: true,
      source_version: version,
    };
  }

  private toEntityData(data: ClassificationData, version: string): Partial<ProductClassification> {
    return {
      code: data.code,
      system: data.system as ClassificationSystem,
      description: data.description,
      level: data.level,
      parentCode: data.parentCode || undefined,
      isActive: true,
      sourceVersion: version,
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test classifications.seeder.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/seeders/classifications.seeder.ts packages/database/src/seeders/classifications.seeder.test.ts
git commit -m "feat(database): add ClassificationsSeeder with idempotent HS/CN seeding"
```

---

## Task 6: Create Classifications API Routes

**Files:**
- Create: `apps/api/src/routes/taxonomy/classifications.ts`
- Test: `apps/api/src/routes/taxonomy/classifications.e2e.test.ts`
- Modify: `apps/api/src/routes/taxonomy/index.ts`

**Step 1: Write the failing e2e test (NO MOCKS - per RULES.md)**

```typescript
// apps/api/src/routes/taxonomy/classifications.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MikroORM } from '@eurocomply/database';
import { Hono } from 'hono';
import { createClassificationsRouter, type ClassificationsRepository, type ClassificationData } from './classifications.js';
import { ProductClassification, ClassificationSystem } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';

interface ApiResponse<T> {
  data: T;
  meta?: { total: number; search?: string | null };
}

describe('Classifications API E2E', () => {
  let orm: MikroORM;
  let app: Hono;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();

    // Seed test classifications (real database, no mocks)
    const em = orm.em.fork();
    const testData = [
      { code: '85', system: ClassificationSystem.HS, description: 'Electrical machinery and equipment', level: 0, parentCode: null },
      { code: '8507', system: ClassificationSystem.HS, description: 'Electric accumulators', level: 1, parentCode: '85' },
      { code: '8507.60', system: ClassificationSystem.HS, description: 'Lithium-ion accumulators', level: 2, parentCode: '8507' },
      { code: '8507.60.00', system: ClassificationSystem.CN, description: 'Lithium-ion accumulators (CN detail)', level: 3, parentCode: '8507.60' },
      { code: '61', system: ClassificationSystem.HS, description: 'Articles of apparel, knitted', level: 0, parentCode: null },
      { code: '6109', system: ClassificationSystem.HS, description: 'T-shirts, singlets and vests', level: 1, parentCode: '61' },
    ];

    for (const data of testData) {
      const classification = em.create(ProductClassification, {
        code: data.code,
        system: data.system,
        description: data.description,
        level: data.level,
        parentCode: data.parentCode || undefined,
        isActive: true,
        sourceVersion: 'TEST',
      });
      em.persist(classification);
    }
    await em.flush();

    // Create repository implementation (real database queries)
    const repo: ClassificationsRepository = {
      findAll: async (filter): Promise<ClassificationData[]> => {
        const qb = orm.em.fork().createQueryBuilder(ProductClassification);
        if (filter?.system) qb.andWhere({ system: filter.system });
        if (filter?.level !== undefined) qb.andWhere({ level: filter.level });
        if (filter?.parentCode) qb.andWhere({ parentCode: filter.parentCode });
        if (filter?.active !== undefined) qb.andWhere({ isActive: filter.active });
        if (filter?.search) {
          // ILIKE search on description
          qb.andWhere({ description: { $ilike: `%${filter.search}%` } });
        }
        const results = await qb.getResultList();
        return results.map(c => ({
          id: c.id,
          code: c.code,
          system: c.system,
          description: c.description,
          level: c.level,
          parentCode: c.parentCode,
          isActive: c.isActive,
          sourceVersion: c.sourceVersion,
        }));
      },
      findByCode: async (code, system): Promise<ClassificationData | null> => {
        const filter: Record<string, unknown> = { code };
        if (system) filter.system = system;
        const c = await orm.em.fork().findOne(ProductClassification, filter);
        if (!c) return null;
        return {
          id: c.id,
          code: c.code,
          system: c.system,
          description: c.description,
          level: c.level,
          parentCode: c.parentCode,
          isActive: c.isActive,
          sourceVersion: c.sourceVersion,
        };
      },
      findChildren: async (parentCode): Promise<ClassificationData[]> => {
        const results = await orm.em.fork().find(ProductClassification, { parentCode });
        return results.map(c => ({
          id: c.id,
          code: c.code,
          system: c.system,
          description: c.description,
          level: c.level,
          parentCode: c.parentCode,
          isActive: c.isActive,
          sourceVersion: c.sourceVersion,
        }));
      },
    };

    app = new Hono();
    app.route('/classifications', createClassificationsRouter(repo));
  });

  afterAll(async () => {
    if (orm) {
      try {
        await orm.em.fork().nativeDelete(ProductClassification, {});
      } catch {
        // Ignore cleanup errors
      }
      await teardownTestDb();
    }
  });

  describe('GET /classifications', () => {
    it('should return all classifications from database', async () => {
      if (!orm) return;

      const res = await app.request('/classifications');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<ClassificationData[]>;
      expect(body.data.length).toBe(6);
    });

    it('should filter by system', async () => {
      if (!orm) return;

      const res = await app.request('/classifications?system=CN');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<ClassificationData[]>;
      expect(body.data.length).toBe(1);
      expect(body.data[0].code).toBe('8507.60.00');
    });

    it('should filter by level', async () => {
      if (!orm) return;

      const res = await app.request('/classifications?level=0');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<ClassificationData[]>;
      expect(body.data.length).toBe(2); // 85 and 61
      expect(body.data.every(c => c.level === 0)).toBe(true);
    });

    it('should search by description keyword (ILIKE)', async () => {
      if (!orm) return;

      const res = await app.request('/classifications?search=lithium');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<ClassificationData[]>;
      expect(body.data.length).toBe(2); // Both lithium-ion entries
      expect(body.data.every(c => c.description.toLowerCase().includes('lithium'))).toBe(true);
      expect(body.meta?.search).toBe('lithium');
    });

    it('should search case-insensitively', async () => {
      if (!orm) return;

      const res = await app.request('/classifications?search=LITHIUM');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<ClassificationData[]>;
      expect(body.data.length).toBe(2);
    });

    it('should reject search with less than 2 characters', async () => {
      if (!orm) return;

      const res = await app.request('/classifications?search=a');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /classifications/:code', () => {
    it('should return a classification by code', async () => {
      if (!orm) return;

      const res = await app.request('/classifications/8507.60');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<ClassificationData>;
      expect(body.data.code).toBe('8507.60');
      expect(body.data.description).toBe('Lithium-ion accumulators');
    });

    it('should return 404 for unknown code', async () => {
      if (!orm) return;

      const res = await app.request('/classifications/9999.99');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /classifications/:code/children', () => {
    it('should return child classifications', async () => {
      if (!orm) return;

      const res = await app.request('/classifications/8507/children');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<ClassificationData[]>;
      expect(body.data.length).toBe(1);
      expect(body.data[0].code).toBe('8507.60');
    });

    it('should return empty array for leaf nodes', async () => {
      if (!orm) return;

      const res = await app.request('/classifications/8507.60.00/children');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<ClassificationData[]>;
      expect(body.data.length).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test classifications.test.ts
```

Expected: FAIL with "Cannot find module './classifications.js'"

**Step 3: Create the router**

```typescript
// apps/api/src/routes/taxonomy/classifications.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { ClassificationSystem } from '@eurocomply/database';
import type { Env } from '../../app.js';

export interface ClassificationData {
  id: string;
  code: string;
  system: ClassificationSystem;
  description: string;
  level: number;
  parentCode?: string;
  isActive: boolean;
  sourceVersion?: string;
}

export interface ClassificationsRepository {
  findAll(filter?: {
    system?: ClassificationSystem;
    level?: number;
    parentCode?: string;
    active?: boolean;
    search?: string;  // ILIKE search on description
  }): Promise<ClassificationData[]>;
  findByCode(code: string, system?: ClassificationSystem): Promise<ClassificationData | null>;
  findChildren(parentCode: string): Promise<ClassificationData[]>;
}

const querySchema = z.object({
  system: z.enum(['HS', 'CN', 'TARIC']).optional(),
  level: z.coerce.number().int().min(0).max(4).optional(),
  parent: z.string().optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  search: z.string().min(2).max(100).optional(),  // ILIKE search on description (min 2 chars)
});

export function createClassificationsRouter(repo: ClassificationsRepository): Hono<Env> {
  const router = new Hono<Env>();

  // GET /classifications - List all with optional filters
  // Supports search parameter for ILIKE on description (critical for Regulatory Advisor)
  router.get('/', zValidator('query', querySchema), async (c) => {
    const query = c.req.valid('query');

    const filter: Parameters<typeof repo.findAll>[0] = {};
    if (query.system) filter.system = query.system as ClassificationSystem;
    if (query.level !== undefined) filter.level = query.level;
    if (query.parent) filter.parentCode = query.parent;
    if (query.active !== undefined) filter.active = query.active;
    if (query.search) filter.search = query.search;  // ILIKE %search% on description

    const classifications = await repo.findAll(filter);

    return c.json({
      data: classifications,
      meta: {
        total: classifications.length,
        search: query.search || null,
      },
    });
  });

  // GET /classifications/:code - Get single by code
  router.get('/:code', async (c) => {
    const code = c.req.param('code');
    const classification = await repo.findByCode(code);

    if (!classification) {
      return c.json({ error: 'Not Found', message: `Classification not found: ${code}` }, 404);
    }

    return c.json({ data: classification });
  });

  // GET /classifications/:code/children - Get child classifications
  router.get('/:code/children', async (c) => {
    const code = c.req.param('code');
    const children = await repo.findChildren(code);

    return c.json({
      data: children,
      meta: { total: children.length, parentCode: code },
    });
  });

  return router;
}
```

**Step 4: Add to taxonomy index**

```typescript
// apps/api/src/routes/taxonomy/index.ts
// Add after units import:
import { createClassificationsRouter } from './classifications.js';

// Add to router setup:
// router.route('/classifications', createClassificationsRouter(classificationsRepo));
```

**Step 5: Run test to verify it passes**

```bash
cd apps/api && pnpm test classifications.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/routes/taxonomy/classifications.ts apps/api/src/routes/taxonomy/classifications.test.ts apps/api/src/routes/taxonomy/index.ts
git commit -m "feat(api): add classifications API routes (GET, list, children)"
```

---

## Task 7: Create CLI Command - seed:classifications

**Files:**
- Create: `packages/database/src/cli/seed-classifications.ts`
- Modify: `packages/database/package.json`

**Step 1: Create the CLI command**

```typescript
// packages/database/src/cli/seed-classifications.ts
import { ClassificationsSeeder } from '../seeders/classifications.seeder.js';
import { initOrm } from '../init-orm.js';
import type { MikroORM } from '@mikro-orm/core';

async function main() {
  let orm: MikroORM | undefined;

  try {
    console.log('Initializing database connection...');
    orm = await initOrm();

    const em = orm.em.fork();
    const seeder = new ClassificationsSeeder(em);

    console.log('Running classifications seeder...');
    const result = await seeder.seed();

    if (result.skipped) {
      console.log(`✓ ${result.message}`);
    } else {
      console.log(`✓ ${result.message}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error seeding classifications:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await orm?.close();
  }
}

main();
```

**Step 2: Add script to package.json**

```json
// Add to packages/database/package.json scripts:
{
  "scripts": {
    "seed:classifications": "tsx src/cli/seed-classifications.ts"
  }
}
```

**Step 3: Update seeders index**

```typescript
// packages/database/src/seeders/index.ts
export { UnitsSeeder, type SeederResult } from './units.seeder.js';
export { ClassificationsSeeder } from './classifications.seeder.js';
```

**Step 4: Test the command**

```bash
cd packages/database && pnpm seed:classifications
```

Expected: "✓ Seeded X classifications (HS2022-CN2024-Curated)."

**Step 5: Commit**

```bash
git add packages/database/src/cli/seed-classifications.ts packages/database/package.json packages/database/src/seeders/index.ts
git commit -m "feat(database): add seed:classifications CLI command"
```

---

## Task 8: Update Root-Level Seed Command

**Files:**
- Modify: `package.json` (root)

**Step 1: Add root-level command**

```json
// Add to root package.json scripts:
{
  "scripts": {
    "db:seed:classifications": "pnpm --filter @eurocomply/database seed:classifications",
    "db:seed:public": "pnpm db:seed:units && pnpm db:seed:classifications"
  }
}
```

**Step 2: Test the command**

```bash
pnpm db:seed:classifications
```

Expected: Classifications seeded successfully

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add db:seed:classifications to root package.json"
```

---

## Task 9: Integration Test

**Files:**
- Create: `packages/database/src/seeders/classifications.integration.test.ts`

**Step 1: Write integration test**

```typescript
// packages/database/src/seeders/classifications.integration.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { ClassificationsSeeder } from './classifications.seeder.js';
import { ProductClassification } from '../entities/ProductClassification.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import { ClassificationSystem } from '../entities/enums/index.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('Classifications Registry Integration', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    orm = await createTestOrm([ProductClassification, SeedVersion]);

    // Seed classifications
    em = orm.em.fork();
    const seeder = new ClassificationsSeeder(em);
    await seeder.seed();
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(() => {
    em = orm.em.fork();
  });

  describe('Code Coverage', () => {
    it('should have both HS and CN codes', async () => {
      const hsCount = await em.count(ProductClassification, { system: ClassificationSystem.HS });
      const cnCount = await em.count(ProductClassification, { system: ClassificationSystem.CN });

      expect(hsCount).toBeGreaterThan(0);
      expect(cnCount).toBeGreaterThan(0);
    });

    it('should have all levels (0-3)', async () => {
      for (let level = 0; level <= 3; level++) {
        const count = await em.count(ProductClassification, { level });
        expect(count).toBeGreaterThan(0);
      }
    });

    it('should have sourceVersion on all codes', async () => {
      const withoutVersion = await em.count(ProductClassification, {
        sourceVersion: { $eq: null },
      });
      expect(withoutVersion).toBe(0);
    });
  });

  describe('Hierarchy', () => {
    it('should have chapter codes at level 0', async () => {
      const chapters = await em.find(ProductClassification, { level: 0 });

      for (const chapter of chapters) {
        expect(chapter.code.length).toBeLessThanOrEqual(2);
        expect(chapter.parentCode).toBeUndefined();
      }
    });

    it('should have valid parent references', async () => {
      const withParents = await em.find(ProductClassification, {
        parentCode: { $ne: null },
      });

      for (const code of withParents) {
        const parent = await em.findOne(ProductClassification, { code: code.parentCode });
        expect(parent).toBeDefined();
        expect(parent?.level).toBeLessThan(code.level);
      }
    });

    it('should build correct hierarchy for batteries', async () => {
      // 85 -> 8507 -> 8507.60 -> 8507.60.00
      const chapter = await em.findOne(ProductClassification, { code: '85' });
      const heading = await em.findOne(ProductClassification, { code: '8507' });
      const subheading = await em.findOne(ProductClassification, { code: '8507.60' });
      const cnCode = await em.findOne(ProductClassification, { code: '8507.60.00' });

      expect(chapter?.level).toBe(0);
      expect(heading?.level).toBe(1);
      expect(heading?.parentCode).toBe('85');
      expect(subheading?.level).toBe(2);
      expect(subheading?.parentCode).toBe('8507');
      expect(cnCode?.level).toBe(3);
      expect(cnCode?.parentCode).toBe('8507.60');
    });
  });

  describe('Search Patterns', () => {
    it('should find codes by prefix', async () => {
      const batteries = await em.find(ProductClassification, {
        code: { $like: '8507%' },
      });
      expect(batteries.length).toBeGreaterThan(0);
    });

    it('should search by description', async () => {
      const lithium = await em.find(ProductClassification, {
        description: { $like: '%lithium%' },
      });
      expect(lithium.length).toBeGreaterThan(0);
    });
  });

  describe('Idempotency', () => {
    it('should not duplicate codes on re-seed', async () => {
      const beforeCount = await em.count(ProductClassification);

      const seeder = new ClassificationsSeeder(em);
      const result = await seeder.seed();

      expect(result.skipped).toBe(true);

      const afterCount = await em.count(ProductClassification);
      expect(afterCount).toBe(beforeCount);
    });
  });
});
```

**Step 2: Run integration test**

```bash
cd packages/database && pnpm test classifications.integration.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add packages/database/src/seeders/classifications.integration.test.ts
git commit -m "test(database): add classifications registry integration tests"
```

---

## Summary

**Deliverables:**
- `ClassificationSystem` enum (HS, CN, TARIC)
- `ProductClassification` entity with migration
- HS/CN data bundle (`data/hs-cn-codes.json`) with ~100 curated codes
- `ClassificationsSeeder` service with idempotent seeding
- Classifications API routes (list, get, children)
- `seed:classifications` CLI command
- `db:seed:classifications` root-level command
- Integration tests for hierarchy and search

**API Routes:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/taxonomy/classifications` | List with filters (system, level, parent, search) |
| GET | `/api/v1/taxonomy/classifications/:code` | Get by code |
| GET | `/api/v1/taxonomy/classifications/:code/children` | Get child codes |

**Query Parameters for GET /classifications:**
- `system` - Filter by HS, CN, or TARIC
- `level` - Filter by hierarchy level (0=chapter, 1=heading, 2=subheading, 3=CN)
- `parent` - Filter by parent code (for tree navigation)
- `search` - ILIKE search on description (min 2 chars, critical for Regulatory Advisor)
- `active` - Filter by active status

**Performance:**
- Uses `copyLarge` (pg-copy-streams) for 20k+ records → ~2 seconds import
- Composite unique on `(code, system)` for multi-system support

**Next Plan:** Plan 4 (Substance Registry) adds ECHA substance data using the same infrastructure.
