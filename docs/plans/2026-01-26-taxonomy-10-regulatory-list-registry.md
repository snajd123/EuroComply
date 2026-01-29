# Taxonomy Plan 10: Regulation Registry

> **IMPLEMENTED** - see [2026-01-28-compliance-architecture-revision.md](./2026-01-28-compliance-architecture-revision.md) for implementation details.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement versioned Regulation and Requirement entities for data-driven vertical compliance checking.

**Architecture:** Create `Regulation` and `Requirement` entities in public schema. Regulations are versioned (immutable once created). Requirements link to Substances with forensic snapshots of CAS/name at import time. Service provides CRUD and version management.

**Tech Stack:** MikroORM, PostgreSQL, TypeScript

**Prerequisites:** Plan 4 (Substance Registry) must be completed first.

**Reference:** See `docs/plans/2026-01-26-regulatory-vertical-system-design.md` Sections 1.1, 1.2

---

## API Integration Patterns (MUST FOLLOW)

> **CRITICAL:** All API implementations MUST follow existing codebase patterns from `apps/api/src/`.

### Route Factory Pattern
```typescript
// Pass ORM, fork EntityManager inside handlers
export interface RouterOptions {
  orm: MikroORM;
}

export function create*Router(options: RouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  router.get('/', async (c) => {
    const em = orm.em.fork();  // Fork inside handler
    // ...
  });

  return router;
}
```

### Zod Validation (REQUIRED)
```typescript
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const listQuery = z.object({
  source: z.string().optional(),
  version: z.string().optional(),
});

router.get('/', zValidator('query', listQuery), async (c) => {
  const query = c.req.valid('query');
  // ...
});
```

### Test Setup (REQUIRED)
```typescript
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';

beforeAll(async () => {
  if (!(await isDatabaseAvailable())) return;
  orm = await setupTestDb();
});

afterAll(async () => {
  if (orm) await teardownTestDb();
});
```

### Taxonomy Routes (Public - No Auth)
Regulations are **public reference data** - no authentication required:
```typescript
// File: apps/api/src/routes/taxonomy/index.ts
const taxonomy = new Hono<Env>();
taxonomy.route('/regulations', createRegulationsRouter({ orm }));
v1.route('/taxonomy', taxonomy);  // No middleware - public routes
```

### Response Format (MUST MATCH)
```typescript
// Success (reads)
c.json({ data: entity })
c.json({ data: items, meta: { total: items.length } })

// Success (mutations)
c.json({ success: true, data: { ... } })

// Errors (use exact format)
c.json({ error: 'Not Found', message: 'Regulation not found: INVALID_CODE' }, 404)
c.json({ error: 'Bad Request', message: 'Invalid regulation code format' }, 400)
```

---

## Task 1: Create Evaluation Enums (Agnostic Model)

**Files:**
- Create: `packages/database/src/entities/enums/ComparisonOperator.ts`
- Create: `packages/database/src/entities/enums/Severity.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create the operator enum**

```typescript
// packages/database/src/entities/enums/ComparisonOperator.ts
/**
 * Data-driven comparison operators for agnostic evaluation.
 * The evaluator uses these to compare substance concentrations against thresholds.
 */
export enum ComparisonOperator {
  GT = 'GT',           // Greater than (concentration > threshold)
  GTE = 'GTE',         // Greater than or equal
  LT = 'LT',           // Less than
  LTE = 'LTE',         // Less than or equal
  EQ = 'EQ',           // Equals
  PRESENT = 'PRESENT', // Any concentration > 0 (for prohibited substances)
  ABSENT = 'ABSENT',   // Must be 0 (for mandatory absence)
}
```

**Step 2: Create the severity enum**

```typescript
// packages/database/src/entities/enums/Severity.ts
/**
 * Severity levels for compliance findings.
 * Stored in Requirement, used by evaluator.
 */
export enum Severity {
  BLOCKER = 'BLOCKER',  // Blocks release/approval
  WARNING = 'WARNING',  // Requires attention
  INFO = 'INFO',        // Informational only
}
```

**Step 3: Export from index**

```typescript
// packages/database/src/entities/enums/index.ts
// Add to existing exports:
export { ComparisonOperator } from './ComparisonOperator.js';
export { Severity } from './Severity.js';
```

**Step 4: Verify build**

```bash
cd packages/database && pnpm build
```

Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/database/src/entities/enums/ComparisonOperator.ts packages/database/src/entities/enums/Severity.ts packages/database/src/entities/enums/index.ts
git commit -m "feat(database): add ComparisonOperator and Severity enums for agnostic evaluation"
```

---

## Task 2: Create Regulation Entity

**Files:**
- Create: `packages/database/src/entities/Regulation.ts`
- Test: `packages/database/src/entities/Regulation.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/Regulation.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { Regulation } from './Regulation.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('Regulation Entity', () => {
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
    await em.nativeDelete(Regulation, {});
  });

  it('creates regulation with required fields', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const regulation = em.create(Regulation, {
      code: 'COSING_ANNEX_II',
      name: 'CosIng Annex II - Prohibited Substances',
      source: 'EU_COSING',
      version: '2024-06',
      effectiveDate: new Date('2024-06-01'),
      sourceUrl: 'https://ec.europa.eu/growth/tools-databases/cosing/',
    });

    await em.persistAndFlush(regulation);

    const found = await em.findOneOrFail(Regulation, { code: 'COSING_ANNEX_II' });
    expect(found.name).toBe('CosIng Annex II - Prohibited Substances');
    expect(found.source).toBe('EU_COSING');
    expect(found.version).toBe('2024-06');
    expect(found.isCurrentVersion).toBe(true);
    expect(found.supersededDate).toBeUndefined();
  });

  it('enforces unique constraint on code + version', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const reg1 = em.create(Regulation, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC Candidate List',
      source: 'ECHA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-15'),
    });
    await em.persistAndFlush(reg1);

    const em2 = orm.em.fork();
    const reg2 = em2.create(Regulation, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC Candidate List',
      source: 'ECHA',
      version: '2024-01',  // Same version - should fail
      effectiveDate: new Date('2024-01-15'),
    });

    await expect(em2.persistAndFlush(reg2)).rejects.toThrow();
  });

  it('allows same code with different versions', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const v1 = em.create(Regulation, {
      code: 'ROHS_RESTRICTED',
      name: 'RoHS Restricted Substances',
      source: 'EU_ROHS',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
      isCurrentVersion: false,
    });

    const v2 = em.create(Regulation, {
      code: 'ROHS_RESTRICTED',
      name: 'RoHS Restricted Substances',
      source: 'EU_ROHS',
      version: '2024-06',
      effectiveDate: new Date('2024-06-01'),
      isCurrentVersion: true,
    });

    await em.persistAndFlush([v1, v2]);

    const versions = await em.find(Regulation, { code: 'ROHS_RESTRICTED' });
    expect(versions).toHaveLength(2);
  });

  it('supports version chain via previousVersion', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const v1 = em.create(Regulation, {
      code: 'EFSA_LIMITS',
      name: 'EFSA Migration Limits',
      source: 'EU_EFSA',
      version: '2023-01',
      effectiveDate: new Date('2023-01-01'),
      isCurrentVersion: false,
      supersededDate: new Date('2024-01-01'),
    });
    await em.persistAndFlush(v1);

    const v2 = em.create(Regulation, {
      code: 'EFSA_LIMITS',
      name: 'EFSA Migration Limits',
      source: 'EU_EFSA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
      isCurrentVersion: true,
      previousVersion: v1,
    });
    await em.persistAndFlush(v2);

    const current = await em.findOneOrFail(Regulation, {
      code: 'EFSA_LIMITS',
      isCurrentVersion: true,
    }, { populate: ['previousVersion'] });

    expect(current.version).toBe('2024-01');
    expect(current.previousVersion?.version).toBe('2023-01');
  });

  it('creates regulation with allowTenantExemption: false and verifies persistence', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const regulation = em.create(Regulation, {
      code: 'COSING_ANNEX_II_PROHIBITED',
      name: 'CosIng Annex II - Prohibited (No Exemptions)',
      source: 'EU_COSING',
      version: '2024-06',
      effectiveDate: new Date('2024-06-01'),
      allowTenantExemption: false,  // Prohibited substances cannot be exempted
    });

    await em.persistAndFlush(regulation);

    const found = await em.findOneOrFail(Regulation, { code: 'COSING_ANNEX_II_PROHIBITED' });
    expect(found.allowTenantExemption).toBe(false);
  });

  it('defaults allowTenantExemption to true when not specified', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const regulation = em.create(Regulation, {
      code: 'REACH_AUTHORIZATION',
      name: 'REACH Authorization List',
      source: 'ECHA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
      // allowTenantExemption not specified - should default to true
    });

    await em.persistAndFlush(regulation);

    const found = await em.findOneOrFail(Regulation, { code: 'REACH_AUTHORIZATION' });
    expect(found.allowTenantExemption).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test Regulation.test.ts
```

Expected: FAIL with "Cannot find module './Regulation.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/entities/Regulation.ts
import {
  Entity,
  Property,
  ManyToOne,
  OneToMany,
  Collection,
  Unique,
  Index,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

@Entity({ tableName: 'regulation', schema: 'public' })
@Unique({ properties: ['code', 'version'] })
export class Regulation extends BaseEntity {
  /**
   * Stable identifier for this regulatory framework.
   * Examples: 'COSING_ANNEX_II', 'REACH_SVHC', 'ROHS_RESTRICTED'
   */
  @Property({ type: 'text' })
  @Index()
  code!: string;

  /**
   * Human-readable name of this regulatory list.
   */
  @Property({ type: 'text' })
  name!: string;

  /**
   * Source authority for this list.
   * Examples: 'EU_COSING', 'ECHA', 'EU_ROHS', 'EU_EFSA'
   */
  @Property({ type: 'text' })
  source!: string;

  /**
   * Version identifier for this snapshot of the list.
   * Format: 'YYYY-MM' or custom version string.
   */
  @Property({ type: 'text' })
  version!: string;

  /**
   * Date when this version of the list became legally effective.
   */
  @Property({ name: 'effective_date' })
  effectiveDate!: Date;

  /**
   * Date when this version was replaced by a newer version.
   * NULL means this version has not been superseded.
   */
  @Property({ name: 'superseded_date', nullable: true })
  supersededDate?: Date;

  /**
   * Whether this is the current (latest) version of this list.
   * Used for fast lookups - only one version per code should have this true.
   */
  @Property({ type: 'boolean', default: true, name: 'is_current_version' })
  @Index()
  isCurrentVersion: boolean = true;

  /**
   * Deep link to the official EU source for this list.
   */
  @Property({ type: 'text', nullable: true, name: 'source_url' })
  sourceUrl?: string;

  /**
   * Optional description or notes about this list version.
   */
  @Property({ type: 'text', nullable: true })
  description?: string;

  /**
   * Whether tenants can exempt from this regulatory list.
   * Set to false for regulations that must always apply (e.g., prohibited substances).
   * Default: true (most regulations can be exempted by tenants).
   */
  @Property({ type: 'boolean', default: true, name: 'allow_tenant_exemption' })
  allowTenantExemption: boolean = true;

  /**
   * Link to the previous version of this regulation for history traversal.
   */
  @ManyToOne(() => Regulation, { nullable: true, name: 'previous_version_id' })
  previousVersion?: Regulation;

  // Note: requirements collection will be added when Requirement is created
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test Regulation.test.ts
```

Expected: PASS (all tests)

**Step 5: Export from index and commit**

```typescript
// packages/database/src/entities/index.ts
// Add to existing exports:
export { Regulation } from './Regulation.js';
```

```bash
git add packages/database/src/entities/Regulation.ts packages/database/src/entities/Regulation.test.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add Regulation entity with versioning support"
```

---

## Task 3: Create Requirement Entity

**Files:**
- Create: `packages/database/src/entities/Requirement.ts`
- Test: `packages/database/src/entities/Requirement.test.ts`
- Modify: `packages/database/src/entities/Regulation.ts` (add requirements collection)

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/Requirement.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { Regulation } from './Regulation.js';
import { Requirement } from './Requirement.js';
import { Substance } from './Substance.js';
import { ComparisonOperator, Severity } from './enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('Requirement Entity', () => {
  let orm: MikroORM;
  let regulationId: string;
  let substanceId: string;

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
    await em.nativeDelete(Requirement, {});
    await em.nativeDelete(Regulation, {});
    await em.nativeDelete(Substance, {});

    // Create test regulation
    const regulation = em.create(Regulation, {
      code: 'TEST_REG',
      name: 'Test Regulation',
      source: 'TEST',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
    });

    // Create test substance
    const substance = em.create(Substance, {
      casNumber: '50-00-0',
      primaryName: 'Formaldehyde',
    });

    await em.persistAndFlush([regulation, substance]);
    regulationId = regulation.id;
    substanceId = substance.id;
  });

  it('creates requirement with PRESENT operator (prohibited substance)', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const regulationRef = await em.findOneOrFail(Regulation, { id: regulationId });
    const substanceRef = await em.findOneOrFail(Substance, { id: substanceId });

    const requirement = em.create(Requirement, {
      regulation: regulationRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      operator: ComparisonOperator.PRESENT,
      compareValue: null,  // No threshold - any presence is violation
      issueType: 'PROHIBITED_SUBSTANCE',
      severity: Severity.BLOCKER,
      legalReference: 'Entry 1577',
    });

    await em.persistAndFlush(requirement);

    const found = await em.findOneOrFail(Requirement, {
      regulation: regulationRef,
      substance: substanceRef,
    });

    expect(found.operator).toBe(ComparisonOperator.PRESENT);
    expect(found.compareValue).toBeNull();
    expect(found.issueType).toBe('PROHIBITED_SUBSTANCE');
    expect(found.severity).toBe(Severity.BLOCKER);
    expect(found.casNumberSnapshot).toBe('50-00-0');
    expect(found.legalReference).toBe('Entry 1577');
  });

  it('creates requirement with GT operator (threshold restriction)', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const regulationRef = await em.findOneOrFail(Regulation, { id: regulationId });
    const substanceRef = await em.findOneOrFail(Substance, { id: substanceId });

    const requirement = em.create(Requirement, {
      regulation: regulationRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      operator: ComparisonOperator.GT,
      compareValue: '0.1',  // Violates if > 0.1%
      issueType: 'CHEMICAL_LIMIT_EXCEEDED',
      severity: Severity.WARNING,
      legalReference: 'Annex XVII Entry 28',
    });

    await em.persistAndFlush(requirement);

    const found = await em.findOneOrFail(Requirement, { regulation: regulationRef });
    expect(found.operator).toBe(ComparisonOperator.GT);
    expect(found.compareValue).toBe('0.1');
    expect(found.issueType).toBe('CHEMICAL_LIMIT_EXCEEDED');
    expect(found.severity).toBe(Severity.WARNING);
  });

  it('creates requirement with conditional restriction and conditions JSONB', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const regulationRef = await em.findOneOrFail(Regulation, { id: regulationId });
    const substanceRef = await em.findOneOrFail(Substance, { id: substanceId });

    const requirement = em.create(Requirement, {
      regulation: regulationRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      operator: ComparisonOperator.GT,
      compareValue: '0.05',
      issueType: 'RESTRICTED_CONDITIONS',
      severity: Severity.WARNING,
      conditions: {
        application_area: 'spray_products',
        max_concentration: '0.05%',
      },
      legalReference: 'CosIng Annex III Entry 13',
    });

    await em.persistAndFlush(requirement);

    const found = await em.findOneOrFail(Requirement, { regulation: regulationRef });
    expect(found.operator).toBe(ComparisonOperator.GT);
    expect(found.conditions).toEqual({
      application_area: 'spray_products',
      max_concentration: '0.05%',
    });
  });

  it('enforces unique constraint on regulation + substance', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const regulationRef = await em.findOneOrFail(Regulation, { id: regulationId });
    const substanceRef = await em.findOneOrFail(Substance, { id: substanceId });

    const req1 = em.create(Requirement, {
      regulation: regulationRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      operator: ComparisonOperator.PRESENT,
      issueType: 'PROHIBITED_SUBSTANCE',
      severity: Severity.BLOCKER,
    });
    await em.persistAndFlush(req1);

    const em2 = orm.em.fork();
    const regulationRef2 = await em2.findOneOrFail(Regulation, { id: regulationId });
    const substanceRef2 = await em2.findOneOrFail(Substance, { id: substanceId });

    const req2 = em2.create(Requirement, {
      regulation: regulationRef2,
      substance: substanceRef2,  // Same regulation + substance - should fail
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      operator: ComparisonOperator.GT,
      compareValue: '0.1',
      issueType: 'CHEMICAL_LIMIT_EXCEEDED',
      severity: Severity.WARNING,
    });

    await expect(em2.persistAndFlush(req2)).rejects.toThrow();
  });

  it('preserves snapshot when substance is updated', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const regulationRef = await em.findOneOrFail(Regulation, { id: regulationId });
    const substanceRef = await em.findOneOrFail(Substance, { id: substanceId });

    const requirement = em.create(Requirement, {
      regulation: regulationRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',  // Snapshot at creation time
      operator: ComparisonOperator.PRESENT,
      issueType: 'PROHIBITED_SUBSTANCE',
      severity: Severity.BLOCKER,
    });
    await em.persistAndFlush(requirement);

    // Update substance name
    substanceRef.primaryName = 'Methanal';  // IUPAC name
    await em.persistAndFlush(substanceRef);

    // Snapshot should be unchanged
    const found = await em.findOneOrFail(Requirement, { regulation: regulationRef });
    expect(found.substanceNameSnapshot).toBe('Formaldehyde');  // Original name preserved
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test Requirement.test.ts
```

Expected: FAIL with "Cannot find module './Requirement.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/entities/Requirement.ts
import {
  Entity,
  Property,
  ManyToOne,
  Enum,
  Unique,
  Index,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Regulation } from './Regulation.js';
import { Substance } from './Substance.js';
import { ComparisonOperator, Severity } from './enums/index.js';

@Entity({ tableName: 'requirement', schema: 'public' })
@Unique({ properties: ['regulation', 'substance'] })
@Index({ properties: ['regulation'] })
export class Requirement extends BaseEntity {
  /**
   * The regulation this requirement belongs to.
   */
  @ManyToOne(() => Regulation, { name: 'regulation_id' })
  regulation!: Regulation;

  /**
   * Live reference to the substance (for joins and lookups).
   */
  @ManyToOne(() => Substance, { name: 'substance_id' })
  @Index()
  substance!: Substance;

  // ─────────────────────────────────────────────────────────────
  // Forensic Snapshots (immutable at import time)
  // ─────────────────────────────────────────────────────────────

  /**
   * CAS number captured at time of import.
   * Preserved even if substance record is later modified.
   */
  @Property({ type: 'text', name: 'cas_number_snapshot' })
  casNumberSnapshot!: string;

  /**
   * Substance name captured at time of import.
   * Preserved for forensic audit trail.
   */
  @Property({ type: 'text', name: 'substance_name_snapshot' })
  substanceNameSnapshot!: string;

  // ─────────────────────────────────────────────────────────────
  // Agnostic Evaluation Rules (Data-Driven)
  // ─────────────────────────────────────────────────────────────

  /**
   * Comparison operator for evaluation.
   * The evaluator compares substance concentration using this operator.
   *
   * Examples:
   * - PRESENT: Any concentration > 0 triggers violation (prohibited)
   * - GT: Concentration > compareValue triggers violation (threshold)
   */
  @Enum({ items: () => ComparisonOperator, name: 'operator' })
  operator!: ComparisonOperator;

  /**
   * Value to compare against (as percentage).
   * NULL for PRESENT/ABSENT operators.
   * Stored as string to preserve decimal precision.
   *
   * Examples:
   * - '0.1' for 0.1% threshold
   * - null for PRESENT (prohibited substances)
   */
  @Property({ type: 'decimal', precision: 7, scale: 4, nullable: true, name: 'compare_value' })
  compareValue?: string;

  /**
   * Issue type to report when violation occurs.
   * This is the semantic meaning of the violation.
   *
   * Examples: 'PROHIBITED_SUBSTANCE', 'CHEMICAL_LIMIT_EXCEEDED', 'RESTRICTED_CONDITIONS'
   */
  @Property({ type: 'text', name: 'issue_type' })
  issueType!: string;

  /**
   * Severity level when this rule is violated.
   * Determines blocking behavior and UI treatment.
   */
  @Enum({ items: () => Severity, name: 'severity' })
  severity!: Severity;

  /**
   * Stoichiometric factor for element-based regulations.
   *
   * Used when the regulation restricts a pure element (e.g., Cobalt)
   * but the substance in the product is a compound (e.g., Cobalt Sulfate).
   *
   * Example: Cobalt Sulfate (CoSO₄) has factor ~0.38 for pure Cobalt content.
   * If product contains 1% Cobalt Sulfate, effective Cobalt = 1% × 0.38 = 0.38%
   *
   * Used by: SubstanceRollupService (Plan 8), CRM compliance (Plan 9)
   * NULL if not applicable (most entries).
   */
  @Property({ type: 'decimal', precision: 5, scale: 4, nullable: true, name: 'stoichiometric_factor' })
  stoichiometricFactor?: string;

  /**
   * Conditional restrictions (JSONB).
   * Example: { application_area: 'spray_products', max_concentration: '0.05%' }
   */
  @Property({ type: 'jsonb', nullable: true })
  conditions?: Record<string, string>;

  /**
   * Legal reference within the regulation.
   * Example: 'Entry 1577', 'Annex XVII Entry 28'
   */
  @Property({ type: 'text', nullable: true, name: 'legal_reference' })
  legalReference?: string;

  /**
   * Optional notes about this restriction.
   */
  @Property({ type: 'text', nullable: true })
  notes?: string;
}
```

**Step 4: Update Regulation with requirements collection**

```typescript
// packages/database/src/entities/Regulation.ts
// Add import at top:
import { Requirement } from './Requirement.js';

// Add at end of class, before closing brace:

  /**
   * Requirements (substance restrictions) in this regulation.
   */
  @OneToMany(() => Requirement, req => req.regulation)
  requirements = new Collection<Requirement>(this);
```

**Step 5: Run test to verify it passes**

```bash
cd packages/database && pnpm test Requirement.test.ts
```

Expected: PASS (all tests)

**Step 6: Export from index and commit**

```typescript
// packages/database/src/entities/index.ts
// Add to existing exports:
export { Requirement } from './Requirement.js';
```

```bash
git add packages/database/src/entities/Requirement.ts packages/database/src/entities/Requirement.test.ts packages/database/src/entities/Regulation.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add Requirement entity with forensic snapshots"
```

---

## Task 4: Create Regulation Migration

**Files:**
- Create: `packages/database/src/migrations/Migration20260126_Regulation.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260126_Regulation.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_Regulation extends Migration {
  async up(): Promise<void> {
    // Create regulation table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.regulation (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        version TEXT NOT NULL,
        effective_date TIMESTAMPTZ NOT NULL,
        superseded_date TIMESTAMPTZ,
        is_current_version BOOLEAN NOT NULL DEFAULT true,
        source_url TEXT,
        description TEXT,
        allow_tenant_exemption BOOLEAN NOT NULL DEFAULT true,
        previous_version_id TEXT REFERENCES public.regulation(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_regulation_code_version UNIQUE (code, version)
      );
    `);

    // Create indexes
    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_regulation_code
        ON public.regulation (code);
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_regulation_current
        ON public.regulation (code)
        WHERE is_current_version = true;
    `);

    // Create requirement table with agnostic evaluation fields
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.requirement (
        id TEXT PRIMARY KEY,
        regulation_id TEXT NOT NULL REFERENCES public.regulation(id) ON DELETE CASCADE,
        substance_id TEXT NOT NULL REFERENCES public.substance(id),
        cas_number_snapshot TEXT NOT NULL,
        substance_name_snapshot TEXT NOT NULL,

        -- Agnostic evaluation fields (data-driven)
        operator TEXT NOT NULL CHECK (operator IN ('GT', 'GTE', 'LT', 'LTE', 'EQ', 'PRESENT', 'ABSENT')),
        compare_value NUMERIC(7,4),  -- NULL for PRESENT/ABSENT operators
        issue_type TEXT NOT NULL,    -- e.g., 'PROHIBITED_SUBSTANCE', 'CHEMICAL_LIMIT_EXCEEDED'
        severity TEXT NOT NULL CHECK (severity IN ('BLOCKER', 'WARNING', 'INFO')),

        -- Stoichiometry support
        stoichiometric_factor NUMERIC(5,4),  -- For element-based regulations

        -- Conditional restrictions
        conditions JSONB,
        legal_reference TEXT,
        notes TEXT,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_requirement_regulation_substance UNIQUE (regulation_id, substance_id)
      );
    `);

    // Create indexes for requirement lookups
    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_requirement_regulation
        ON public.requirement (regulation_id);
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_requirement_substance
        ON public.requirement (substance_id);
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_requirement_cas
        ON public.requirement (cas_number_snapshot);
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS public.requirement;');
    this.addSql('DROP TABLE IF EXISTS public.regulation;');
  }
}
```

**Step 2: Run migration**

```bash
cd packages/database && pnpm mikro-orm migration:up
```

Expected: Migration applies successfully

**Step 3: Verify tables exist**

```bash
cd packages/database && pnpm mikro-orm schema:update --dump
```

Expected: No pending changes (schema is in sync)

**Step 4: Commit**

```bash
git add packages/database/src/migrations/Migration20260126_Regulation.ts
git commit -m "feat(database): add migration for regulation and requirement tables"
```

---

## Task 5: Create RegulationService

**Files:**
- Create: `packages/database/src/services/RegulationService.ts`
- Test: `packages/database/src/services/RegulationService.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/RegulationService.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { Regulation } from '../entities/Regulation.js';
import { Requirement } from '../entities/Requirement.js';
import { Substance } from '../entities/Substance.js';
import { RegulationService } from './RegulationService.js';
import { ComparisonOperator, Severity } from '../entities/enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('RegulationService', () => {
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
    await em.nativeDelete(Requirement, {});
    await em.nativeDelete(Regulation, {});
    await em.nativeDelete(Substance, {});
  });

  describe('createRegulation', () => {
    it('creates a new regulation', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulationService(em);

      const regulation = await svc.createRegulation({
        code: 'COSING_ANNEX_II',
        name: 'CosIng Annex II - Prohibited Substances',
        source: 'EU_COSING',
        version: '2024-06',
        effectiveDate: new Date('2024-06-01'),
        sourceUrl: 'https://ec.europa.eu/cosing/',
      });

      expect(regulation.id).toBeDefined();
      expect(regulation.code).toBe('COSING_ANNEX_II');
      expect(regulation.isCurrentVersion).toBe(true);
    });
  });

  describe('getCurrentVersion', () => {
    it('returns the current version of a regulation', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulationService(em);

      // Create two versions
      await svc.createRegulation({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2023-01',
        effectiveDate: new Date('2023-01-01'),
        isCurrentVersion: false,
      });

      await svc.createRegulation({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
        isCurrentVersion: true,
      });

      const current = await svc.getCurrentVersion('REACH_SVHC');
      expect(current?.version).toBe('2024-01');
    });

    it('returns null for non-existent regulation', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulationService(em);

      const result = await svc.getCurrentVersion('NONEXISTENT');
      expect(result).toBeNull();
    });
  });

  describe('getRegulationsByCodes', () => {
    it('returns current versions for multiple codes', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulationService(em);

      await svc.createRegulation({
        code: 'REG_A',
        name: 'Regulation A',
        source: 'TEST',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
      });

      await svc.createRegulation({
        code: 'REG_B',
        name: 'Regulation B',
        source: 'TEST',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
      });

      const regulations = await svc.getRegulationsByCodes(['REG_A', 'REG_B']);
      expect(regulations).toHaveLength(2);
      expect(regulations.map(r => r.code).sort()).toEqual(['REG_A', 'REG_B']);
    });
  });

  describe('getVersionHistory', () => {
    it('returns all versions ordered by effective date', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulationService(em);

      await svc.createRegulation({
        code: 'VERSIONED_REG',
        name: 'Test',
        source: 'TEST',
        version: '2022-01',
        effectiveDate: new Date('2022-01-01'),
        isCurrentVersion: false,
      });

      await svc.createRegulation({
        code: 'VERSIONED_REG',
        name: 'Test',
        source: 'TEST',
        version: '2023-01',
        effectiveDate: new Date('2023-01-01'),
        isCurrentVersion: false,
      });

      await svc.createRegulation({
        code: 'VERSIONED_REG',
        name: 'Test',
        source: 'TEST',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
        isCurrentVersion: true,
      });

      const versions = await svc.getVersionHistory('VERSIONED_REG');
      expect(versions).toHaveLength(3);
      expect(versions[0].version).toBe('2024-01');  // Most recent first
      expect(versions[2].version).toBe('2022-01');
    });
  });

  describe('getRequirementsForRegulation', () => {
    it('returns all requirements for a regulation', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulationService(em);

      // Create regulation
      const regulation = await svc.createRegulation({
        code: 'TEST_REG',
        name: 'Test',
        source: 'TEST',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
      });

      // Create substances
      const s1 = em.create(Substance, { casNumber: '50-00-0', primaryName: 'Formaldehyde' });
      const s2 = em.create(Substance, { casNumber: '75-56-9', primaryName: 'Propylene oxide' });
      await em.persistAndFlush([s1, s2]);

      // Add requirements with agnostic evaluation fields
      await svc.addRequirement(regulation.id, {
        substanceId: s1.id,
        operator: ComparisonOperator.PRESENT,
        issueType: 'PROHIBITED_SUBSTANCE',
        severity: Severity.BLOCKER,
        legalReference: 'Entry 1',
      });

      await svc.addRequirement(regulation.id, {
        substanceId: s2.id,
        operator: ComparisonOperator.GT,
        compareValue: '0.1',
        issueType: 'CHEMICAL_LIMIT_EXCEEDED',
        severity: Severity.WARNING,
        legalReference: 'Entry 2',
      });

      const requirements = await svc.getRequirementsForRegulation(regulation.id);
      expect(requirements).toHaveLength(2);
    });
  });

  describe('getVersionAtDate', () => {
    it('returns version effective at a specific date', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulationService(em);

      const v1 = await svc.createRegulation({
        code: 'TEMPORAL_REG',
        name: 'Test',
        source: 'TEST',
        version: '2023-01',
        effectiveDate: new Date('2023-01-01'),
        isCurrentVersion: false,
      });

      // Supersede v1
      v1.supersededDate = new Date('2024-01-01');
      await em.persistAndFlush(v1);

      await svc.createRegulation({
        code: 'TEMPORAL_REG',
        name: 'Test',
        source: 'TEST',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
        isCurrentVersion: true,
      });

      // Query for date in 2023 - should get v2023
      const pastVersion = await svc.getVersionAtDate('TEMPORAL_REG', new Date('2023-06-15'));
      expect(pastVersion?.version).toBe('2023-01');

      // Query for date in 2024 - should get v2024
      const currentVersion = await svc.getVersionAtDate('TEMPORAL_REG', new Date('2024-06-15'));
      expect(currentVersion?.version).toBe('2024-01');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test RegulationService.test.ts
```

Expected: FAIL with "Cannot find module './RegulationService.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/services/RegulationService.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Regulation } from '../entities/Regulation.js';
import { Requirement } from '../entities/Requirement.js';
import { Substance } from '../entities/Substance.js';
import { ComparisonOperator, Severity } from '../entities/enums/index.js';

export interface CreateRegulationInput {
  code: string;
  name: string;
  source: string;
  version: string;
  effectiveDate: Date;
  sourceUrl?: string;
  description?: string;
  isCurrentVersion?: boolean;
  allowTenantExemption?: boolean;
  previousVersionId?: string;
}

export interface AddRequirementInput {
  substanceId: string;
  // Agnostic evaluation fields
  operator: ComparisonOperator;
  compareValue?: string;        // NULL for PRESENT/ABSENT
  issueType: string;            // e.g., 'PROHIBITED_SUBSTANCE'
  severity: Severity;
  // Optional fields
  stoichiometricFactor?: string;
  conditions?: Record<string, string>;
  legalReference?: string;
  notes?: string;
}

export class RegulationService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Create a new regulation version.
   */
  async createRegulation(input: CreateRegulationInput): Promise<Regulation> {
    const regulation = this.em.create(Regulation, {
      code: input.code,
      name: input.name,
      source: input.source,
      version: input.version,
      effectiveDate: input.effectiveDate,
      sourceUrl: input.sourceUrl,
      description: input.description,
      isCurrentVersion: input.isCurrentVersion ?? true,
      allowTenantExemption: input.allowTenantExemption ?? true,
    });

    if (input.previousVersionId) {
      const previous = await this.em.findOne(Regulation, { id: input.previousVersionId });
      if (previous) {
        regulation.previousVersion = previous;
      }
    }

    await this.em.persistAndFlush(regulation);
    return regulation;
  }

  /**
   * Get the current (latest) version of a regulation by code.
   */
  async getCurrentVersion(code: string): Promise<Regulation | null> {
    return this.em.findOne(Regulation, {
      code,
      isCurrentVersion: true,
    });
  }

  /**
   * Get current versions for multiple regulation codes.
   */
  async getRegulationsByCodes(codes: string[]): Promise<Regulation[]> {
    return this.em.find(Regulation, {
      code: { $in: codes },
      isCurrentVersion: true,
    });
  }

  /**
   * Get all versions of a regulation, ordered by effective date (newest first).
   */
  async getVersionHistory(code: string): Promise<Regulation[]> {
    return this.em.find(
      Regulation,
      { code },
      { orderBy: { effectiveDate: 'DESC' } }
    );
  }

  /**
   * Get the version of a regulation that was effective at a specific date.
   * Used for forensic/point-in-time compliance queries.
   */
  async getVersionAtDate(code: string, date: Date): Promise<Regulation | null> {
    return this.em.findOne(
      Regulation,
      {
        code,
        effectiveDate: { $lte: date },
        $or: [
          { supersededDate: null },
          { supersededDate: { $gt: date } },
        ],
      },
      { orderBy: { effectiveDate: 'DESC' } }
    );
  }

  /**
   * Add a requirement (substance restriction) to a regulation.
   */
  async addRequirement(regulationId: string, input: AddRequirementInput): Promise<Requirement> {
    const regulation = await this.em.findOneOrFail(Regulation, { id: regulationId });
    const substance = await this.em.findOneOrFail(Substance, { id: input.substanceId });

    const requirement = this.em.create(Requirement, {
      regulation,
      substance,
      casNumberSnapshot: substance.casNumber,
      substanceNameSnapshot: substance.primaryName,
      // Agnostic evaluation fields
      operator: input.operator,
      compareValue: input.compareValue,
      issueType: input.issueType,
      severity: input.severity,
      // Optional fields
      stoichiometricFactor: input.stoichiometricFactor,
      conditions: input.conditions,
      legalReference: input.legalReference,
      notes: input.notes,
    });

    await this.em.persistAndFlush(requirement);
    return requirement;
  }

  /**
   * Get all requirements for a regulation.
   */
  async getRequirementsForRegulation(
    regulationId: string,
    options?: { populate?: boolean }
  ): Promise<Requirement[]> {
    return this.em.find(
      Requirement,
      { regulation: { id: regulationId } },
      { populate: options?.populate ? ['substance'] : [] }
    );
  }

  /**
   * Get requirements for multiple regulations (used during evaluation).
   */
  async getRequirementsForRegulations(regulationIds: string[]): Promise<Requirement[]> {
    return this.em.find(
      Requirement,
      { regulation: { id: { $in: regulationIds } } },
      { populate: ['substance'] }
    );
  }

  /**
   * Find requirements by CAS number across all current regulations.
   */
  async findRequirementsByCas(casNumber: string): Promise<Requirement[]> {
    return this.em.find(
      Requirement,
      {
        casNumberSnapshot: casNumber,
        regulation: { isCurrentVersion: true },
      },
      { populate: ['regulation'] }
    );
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test RegulationService.test.ts
```

Expected: PASS (all tests)

**Step 5: Export from index and commit**

```typescript
// packages/database/src/services/index.ts (create if doesn't exist)
export { RegulationService } from './RegulationService.js';
```

```bash
git add packages/database/src/services/RegulationService.ts packages/database/src/services/RegulationService.test.ts packages/database/src/services/index.ts
git commit -m "feat(database): add RegulationService with version management"
```

---

## Task 6: Create Regulation API Routes

**Files:**
- Create: `apps/api/src/routes/taxonomy/regulations.ts`
- Modify: `apps/api/src/routes/taxonomy/index.ts`

**Step 1: Create the router**

```typescript
// apps/api/src/routes/taxonomy/regulations.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@mikro-orm/postgresql';
import { Regulation, RegulationService } from '@eurocomply/database';
import type { Env } from '../../app.js';

// ============================================================================
// Types
// ============================================================================

export interface RegulationsRouterOptions {
  orm: MikroORM;
}

// ============================================================================
// Schemas
// ============================================================================

const regulationQuery = z.object({
  source: z.string().optional(),
});

const requirementsQuery = z.object({
  operator: z.enum(['GT', 'GTE', 'LT', 'LTE', 'EQ', 'PRESENT', 'ABSENT']).optional(),
  severity: z.enum(['BLOCKER', 'WARNING', 'INFO']).optional(),
});

// ============================================================================
// Router
// ============================================================================

export function createRegulationsRouter(options: RegulationsRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  // GET /taxonomy/regulations
  // List all current regulations
  router.get('/', zValidator('query', regulationQuery), async (c) => {
    const query = c.req.valid('query');
    const em = orm.em.fork();

    const where: Record<string, unknown> = { isCurrentVersion: true };
    if (query.source) where.source = query.source;

    const regulations = await em.find(Regulation, where, { orderBy: { code: 'ASC' } });

    return c.json({
      data: regulations.map(r => ({
        id: r.id,
        code: r.code,
        name: r.name,
        source: r.source,
        version: r.version,
        effectiveDate: r.effectiveDate.toISOString(),
        sourceUrl: r.sourceUrl,
        allowTenantExemption: r.allowTenantExemption,
      })),
      meta: { total: regulations.length },
    });
  });

  // GET /taxonomy/regulations/:code
  // Get current version of a specific regulation
  router.get('/:code', async (c) => {
    const code = c.req.param('code').toUpperCase();
    const em = orm.em.fork();
    const service = new RegulationService(em);

    const regulation = await service.getCurrentVersion(code);
    if (!regulation) {
      return c.json(
        { error: 'Not Found', message: `Regulation not found: ${code}` },
        404
      );
    }

    return c.json({
      data: {
        id: regulation.id,
        code: regulation.code,
        name: regulation.name,
        source: regulation.source,
        version: regulation.version,
        effectiveDate: regulation.effectiveDate.toISOString(),
        supersededDate: regulation.supersededDate?.toISOString(),
        sourceUrl: regulation.sourceUrl,
        description: regulation.description,
        allowTenantExemption: regulation.allowTenantExemption,
      },
    });
  });

  // GET /taxonomy/regulations/:code/versions
  // Get version history for a regulation
  router.get('/:code/versions', async (c) => {
    const code = c.req.param('code').toUpperCase();
    const em = orm.em.fork();
    const service = new RegulationService(em);

    const versions = await service.getVersionHistory(code);
    if (versions.length === 0) {
      return c.json(
        { error: 'Not Found', message: `Regulation not found: ${code}` },
        404
      );
    }

    return c.json({
      data: versions.map(v => ({
        id: v.id,
        version: v.version,
        effectiveDate: v.effectiveDate.toISOString(),
        supersededDate: v.supersededDate?.toISOString(),
        isCurrentVersion: v.isCurrentVersion,
      })),
      meta: { total: versions.length },
    });
  });

  // GET /taxonomy/regulations/:code/requirements
  // Get requirements for current version of a regulation
  router.get('/:code/requirements', zValidator('query', requirementsQuery), async (c) => {
    const code = c.req.param('code').toUpperCase();
    const query = c.req.valid('query');
    const em = orm.em.fork();
    const service = new RegulationService(em);

    const regulation = await service.getCurrentVersion(code);
    if (!regulation) {
      return c.json(
        { error: 'Not Found', message: `Regulation not found: ${code}` },
        404
      );
    }

    let requirements = await service.getRequirementsForRegulation(regulation.id, { populate: true });

    // Filter by operator or severity if provided
    if (query.operator) {
      requirements = requirements.filter(r => r.operator === query.operator);
    }
    if (query.severity) {
      requirements = requirements.filter(r => r.severity === query.severity);
    }

    return c.json({
      data: requirements.map(r => ({
        id: r.id,
        casNumber: r.casNumberSnapshot,
        substanceName: r.substanceNameSnapshot,
        // Agnostic evaluation fields
        operator: r.operator,
        compareValue: r.compareValue,
        issueType: r.issueType,
        severity: r.severity,
        // Optional
        stoichiometricFactor: r.stoichiometricFactor,
        conditions: r.conditions,
        legalReference: r.legalReference,
      })),
      meta: { total: requirements.length },
    });
  });

  return router;
}
```

**Step 2: Register in taxonomy routes**

```typescript
// apps/api/src/routes/taxonomy/index.ts
// Add import:
import { createRegulationsRouter } from './regulations.js';

// Add route registration (after existing taxonomy routes):
taxonomy.route('/regulations', createRegulationsRouter({ orm }));
```

**Step 4: Verify build**

```bash
cd apps/api && pnpm build
```

Expected: Build succeeds

**Step 5: Commit**

```bash
git add apps/api/src/routes/taxonomy/regulations.ts apps/api/src/routes/taxonomy/index.ts
git commit -m "feat(api): add regulations public taxonomy routes"
```

---

## Task 7: Integration Test

**Files:**
- Create: `apps/api/src/routes/taxonomy/regulations.test.ts`

**Step 1: Write integration test**

```typescript
// apps/api/src/routes/taxonomy/regulations.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { MikroORM } from '@mikro-orm/postgresql';
import { Regulation, Requirement, Substance, ComparisonOperator, Severity } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createRegulationsRouter } from './regulations.js';

interface RegulationResponse {
  data: Array<{ code: string; name: string; version: string }>;
  meta: { total: number };
}

interface SingleResponse {
  data: { code: string; name: string; version: string };
}

interface RequirementsResponse {
  data: Array<{
    casNumber: string;
    substanceName: string;
    operator: string;
    compareValue?: string;
    issueType: string;
    severity: string;
  }>;
  meta: { total: number };
}

interface ErrorResponse {
  error: string;
  message: string;
}

describe('Regulations API Integration', () => {
  let orm: MikroORM;
  let app: Hono;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;

    orm = await setupTestDb();
    app = new Hono();
    app.route('/regulations', createRegulationsRouter({ orm }));
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!orm) return;
    const em = orm.em.fork();
    await em.nativeDelete(Requirement, {});
    await em.nativeDelete(Regulation, {});
    await em.nativeDelete(Substance, {});

    // Seed test data
    const regulation = em.create(Regulation, {
      code: 'TEST_COSING',
      name: 'Test CosIng Regulation',
      source: 'EU_COSING',
      version: '2024-06',
      effectiveDate: new Date('2024-06-01'),
      sourceUrl: 'https://example.com/cosing',
    });

    const substance = em.create(Substance, {
      casNumber: '50-00-0',
      primaryName: 'Formaldehyde',
    });

    await em.persistAndFlush([regulation, substance]);

    const requirement = em.create(Requirement, {
      regulation,
      substance,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      operator: ComparisonOperator.PRESENT,
      issueType: 'PROHIBITED_SUBSTANCE',
      severity: Severity.BLOCKER,
      legalReference: 'Entry 1577',
    });

    await em.persistAndFlush(requirement);
  });

  describe('GET /regulations', () => {
    it('returns all current regulations', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulations');
      expect(res.status).toBe(200);

      const body = (await res.json()) as RegulationResponse;
      expect(body.data).toHaveLength(1);
      expect(body.data[0].code).toBe('TEST_COSING');
      expect(body.meta.total).toBe(1);
    });

    it('filters by source', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulations?source=EU_COSING');
      expect(res.status).toBe(200);

      const body = (await res.json()) as RegulationResponse;
      expect(body.data).toHaveLength(1);

      const res2 = await app.request('/regulations?source=NONEXISTENT');
      expect(res2.status).toBe(200);

      const body2 = (await res2.json()) as RegulationResponse;
      expect(body2.data).toHaveLength(0);
    });
  });

  describe('GET /regulations/:code', () => {
    it('returns a specific regulation by code', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulations/TEST_COSING');
      expect(res.status).toBe(200);

      const body = (await res.json()) as SingleResponse;
      expect(body.data.code).toBe('TEST_COSING');
      expect(body.data.name).toBe('Test CosIng Regulation');
      expect(body.data.version).toBe('2024-06');
    });

    it('returns 404 for non-existent regulation', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulations/NONEXISTENT');
      expect(res.status).toBe(404);

      const body = (await res.json()) as ErrorResponse;
      expect(body.error).toBe('Not Found');
    });
  });

  describe('GET /regulations/:code/requirements', () => {
    it('returns requirements for a regulation with agnostic fields', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulations/TEST_COSING/requirements');
      expect(res.status).toBe(200);

      const body = (await res.json()) as RequirementsResponse;
      expect(body.data).toHaveLength(1);
      expect(body.data[0].casNumber).toBe('50-00-0');
      expect(body.data[0].substanceName).toBe('Formaldehyde');
      expect(body.data[0].operator).toBe('PRESENT');
      expect(body.data[0].issueType).toBe('PROHIBITED_SUBSTANCE');
      expect(body.data[0].severity).toBe('BLOCKER');
    });

    it('filters requirements by operator', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulations/TEST_COSING/requirements?operator=PRESENT');
      expect(res.status).toBe(200);

      const body = (await res.json()) as RequirementsResponse;
      expect(body.data).toHaveLength(1);

      const res2 = await app.request('/regulations/TEST_COSING/requirements?operator=GT');
      expect(res2.status).toBe(200);

      const body2 = (await res2.json()) as RequirementsResponse;
      expect(body2.data).toHaveLength(0);
    });

    it('filters requirements by severity', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulations/TEST_COSING/requirements?severity=BLOCKER');
      expect(res.status).toBe(200);

      const body = (await res.json()) as RequirementsResponse;
      expect(body.data).toHaveLength(1);

      const res2 = await app.request('/regulations/TEST_COSING/requirements?severity=WARNING');
      expect(res2.status).toBe(200);

      const body2 = (await res2.json()) as RequirementsResponse;
      expect(body2.data).toHaveLength(0);
    });
  });
});
```

**Step 2: Run integration test**

```bash
cd apps/api && pnpm test regulations.test.ts
```

Expected: PASS (all tests)

**Step 3: Commit**

```bash
git add apps/api/src/routes/taxonomy/regulations.test.ts
git commit -m "test(api): add integration tests for regulations routes"
```

---

## Summary

**Plan 10 delivers:**
- `ComparisonOperator` and `Severity` enums for agnostic evaluation
- `Regulation` entity with versioning support and `allowTenantExemption` flag
- `Requirement` entity with forensic snapshots
- Database migration for both tables
- `RegulationService` with version management
- Public API routes for regulation access (including `allowTenantExemption` in responses)
- Full test coverage (including `allowTenantExemption` persistence and default value tests)

**Next Plans:**
- **Plan 11:** CategoryRegulation (category-regulation scoping)
- **Plan 12:** RegulationImportService (admin import pipeline)
- **Plan 14:** Vertical rule evaluators
- **Plan 15:** Initial regulation seeders

---

*Plan created: 2026-01-26*
