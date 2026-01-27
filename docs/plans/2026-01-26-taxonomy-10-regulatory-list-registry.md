# Taxonomy Plan 10: Regulatory List Registry

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement versioned RegulatoryList and RegulatoryListEntry entities for data-driven vertical compliance checking.

**Architecture:** Create `RegulatoryList` and `RegulatoryListEntry` entities in public schema. Lists are versioned (immutable once created). Entries link to Substances with forensic snapshots of CAS/name at import time. Service provides CRUD and version management.

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
RegulatoryLists are **public reference data** - no authentication required:
```typescript
// File: apps/api/src/routes/taxonomy/index.ts
const taxonomy = new Hono<Env>();
taxonomy.route('/regulatory-lists', createRegulatoryListsRouter({ orm }));
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
c.json({ error: 'Not Found', message: 'Regulatory list not found: INVALID_CODE' }, 404)
c.json({ error: 'Bad Request', message: 'Invalid list code format' }, 400)
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
 * Stored in RegulatoryListEntry, used by evaluator.
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

## Task 2: Create RegulatoryList Entity

**Files:**
- Create: `packages/database/src/entities/RegulatoryList.ts`
- Test: `packages/database/src/entities/RegulatoryList.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/RegulatoryList.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { RegulatoryList } from './RegulatoryList.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('RegulatoryList Entity', () => {
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
    await em.nativeDelete(RegulatoryList, {});
  });

  it('creates regulatory list with required fields', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const list = em.create(RegulatoryList, {
      code: 'COSING_ANNEX_II',
      name: 'CosIng Annex II - Prohibited Substances',
      source: 'EU_COSING',
      version: '2024-06',
      effectiveDate: new Date('2024-06-01'),
      sourceUrl: 'https://ec.europa.eu/growth/tools-databases/cosing/',
    });

    await em.persistAndFlush(list);

    const found = await em.findOneOrFail(RegulatoryList, { code: 'COSING_ANNEX_II' });
    expect(found.name).toBe('CosIng Annex II - Prohibited Substances');
    expect(found.source).toBe('EU_COSING');
    expect(found.version).toBe('2024-06');
    expect(found.isCurrentVersion).toBe(true);
    expect(found.supersededDate).toBeUndefined();
  });

  it('enforces unique constraint on code + version', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const list1 = em.create(RegulatoryList, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC Candidate List',
      source: 'ECHA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-15'),
    });
    await em.persistAndFlush(list1);

    const em2 = orm.em.fork();
    const list2 = em2.create(RegulatoryList, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC Candidate List',
      source: 'ECHA',
      version: '2024-01',  // Same version - should fail
      effectiveDate: new Date('2024-01-15'),
    });

    await expect(em2.persistAndFlush(list2)).rejects.toThrow();
  });

  it('allows same code with different versions', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const v1 = em.create(RegulatoryList, {
      code: 'ROHS_RESTRICTED',
      name: 'RoHS Restricted Substances',
      source: 'EU_ROHS',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
      isCurrentVersion: false,
    });

    const v2 = em.create(RegulatoryList, {
      code: 'ROHS_RESTRICTED',
      name: 'RoHS Restricted Substances',
      source: 'EU_ROHS',
      version: '2024-06',
      effectiveDate: new Date('2024-06-01'),
      isCurrentVersion: true,
    });

    await em.persistAndFlush([v1, v2]);

    const versions = await em.find(RegulatoryList, { code: 'ROHS_RESTRICTED' });
    expect(versions).toHaveLength(2);
  });

  it('supports version chain via previousVersion', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const v1 = em.create(RegulatoryList, {
      code: 'EFSA_LIMITS',
      name: 'EFSA Migration Limits',
      source: 'EU_EFSA',
      version: '2023-01',
      effectiveDate: new Date('2023-01-01'),
      isCurrentVersion: false,
      supersededDate: new Date('2024-01-01'),
    });
    await em.persistAndFlush(v1);

    const v2 = em.create(RegulatoryList, {
      code: 'EFSA_LIMITS',
      name: 'EFSA Migration Limits',
      source: 'EU_EFSA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
      isCurrentVersion: true,
      previousVersion: v1,
    });
    await em.persistAndFlush(v2);

    const current = await em.findOneOrFail(RegulatoryList, {
      code: 'EFSA_LIMITS',
      isCurrentVersion: true,
    }, { populate: ['previousVersion'] });

    expect(current.version).toBe('2024-01');
    expect(current.previousVersion?.version).toBe('2023-01');
  });

  it('creates list with allowTenantExemption: false and verifies persistence', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const list = em.create(RegulatoryList, {
      code: 'COSING_ANNEX_II_PROHIBITED',
      name: 'CosIng Annex II - Prohibited (No Exemptions)',
      source: 'EU_COSING',
      version: '2024-06',
      effectiveDate: new Date('2024-06-01'),
      allowTenantExemption: false,  // Prohibited substances cannot be exempted
    });

    await em.persistAndFlush(list);

    const found = await em.findOneOrFail(RegulatoryList, { code: 'COSING_ANNEX_II_PROHIBITED' });
    expect(found.allowTenantExemption).toBe(false);
  });

  it('defaults allowTenantExemption to true when not specified', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const list = em.create(RegulatoryList, {
      code: 'REACH_AUTHORIZATION',
      name: 'REACH Authorization List',
      source: 'ECHA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
      // allowTenantExemption not specified - should default to true
    });

    await em.persistAndFlush(list);

    const found = await em.findOneOrFail(RegulatoryList, { code: 'REACH_AUTHORIZATION' });
    expect(found.allowTenantExemption).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test RegulatoryList.test.ts
```

Expected: FAIL with "Cannot find module './RegulatoryList.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/entities/RegulatoryList.ts
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

@Entity({ tableName: 'regulatory_list', schema: 'public' })
@Unique({ properties: ['code', 'version'] })
export class RegulatoryList extends BaseEntity {
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
   * Link to the previous version of this list for history traversal.
   */
  @ManyToOne(() => RegulatoryList, { nullable: true, name: 'previous_version_id' })
  previousVersion?: RegulatoryList;

  // Note: entries collection will be added when RegulatoryListEntry is created
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test RegulatoryList.test.ts
```

Expected: PASS (all tests)

**Step 5: Export from index and commit**

```typescript
// packages/database/src/entities/index.ts
// Add to existing exports:
export { RegulatoryList } from './RegulatoryList.js';
```

```bash
git add packages/database/src/entities/RegulatoryList.ts packages/database/src/entities/RegulatoryList.test.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add RegulatoryList entity with versioning support"
```

---

## Task 3: Create RegulatoryListEntry Entity

**Files:**
- Create: `packages/database/src/entities/RegulatoryListEntry.ts`
- Test: `packages/database/src/entities/RegulatoryListEntry.test.ts`
- Modify: `packages/database/src/entities/RegulatoryList.ts` (add entries collection)

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/RegulatoryListEntry.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { RegulatoryList } from './RegulatoryList.js';
import { RegulatoryListEntry } from './RegulatoryListEntry.js';
import { Substance } from './Substance.js';
import { ComparisonOperator, Severity } from './enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('RegulatoryListEntry Entity', () => {
  let orm: MikroORM;
  let listId: string;
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
    await em.nativeDelete(RegulatoryListEntry, {});
    await em.nativeDelete(RegulatoryList, {});
    await em.nativeDelete(Substance, {});

    // Create test list
    const list = em.create(RegulatoryList, {
      code: 'TEST_LIST',
      name: 'Test Regulatory List',
      source: 'TEST',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
    });

    // Create test substance
    const substance = em.create(Substance, {
      casNumber: '50-00-0',
      primaryName: 'Formaldehyde',
    });

    await em.persistAndFlush([list, substance]);
    listId = list.id;
    substanceId = substance.id;
  });

  it('creates entry with PRESENT operator (prohibited substance)', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const listRef = await em.findOneOrFail(RegulatoryList, { id: listId });
    const substanceRef = await em.findOneOrFail(Substance, { id: substanceId });

    const entry = em.create(RegulatoryListEntry, {
      list: listRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      operator: ComparisonOperator.PRESENT,
      compareValue: null,  // No threshold - any presence is violation
      issueType: 'PROHIBITED_SUBSTANCE',
      severity: Severity.BLOCKER,
      legalReference: 'Entry 1577',
    });

    await em.persistAndFlush(entry);

    const found = await em.findOneOrFail(RegulatoryListEntry, {
      list: listRef,
      substance: substanceRef,
    });

    expect(found.operator).toBe(ComparisonOperator.PRESENT);
    expect(found.compareValue).toBeNull();
    expect(found.issueType).toBe('PROHIBITED_SUBSTANCE');
    expect(found.severity).toBe(Severity.BLOCKER);
    expect(found.casNumberSnapshot).toBe('50-00-0');
    expect(found.legalReference).toBe('Entry 1577');
  });

  it('creates entry with GT operator (threshold restriction)', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const listRef = await em.findOneOrFail(RegulatoryList, { id: listId });
    const substanceRef = await em.findOneOrFail(Substance, { id: substanceId });

    const entry = em.create(RegulatoryListEntry, {
      list: listRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      operator: ComparisonOperator.GT,
      compareValue: '0.1',  // Violates if > 0.1%
      issueType: 'CHEMICAL_LIMIT_EXCEEDED',
      severity: Severity.WARNING,
      legalReference: 'Annex XVII Entry 28',
    });

    await em.persistAndFlush(entry);

    const found = await em.findOneOrFail(RegulatoryListEntry, { list: listRef });
    expect(found.operator).toBe(ComparisonOperator.GT);
    expect(found.compareValue).toBe('0.1');
    expect(found.issueType).toBe('CHEMICAL_LIMIT_EXCEEDED');
    expect(found.severity).toBe(Severity.WARNING);
  });

  it('creates entry with conditional restriction and conditions JSONB', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const listRef = await em.findOneOrFail(RegulatoryList, { id: listId });
    const substanceRef = await em.findOneOrFail(Substance, { id: substanceId });

    const entry = em.create(RegulatoryListEntry, {
      list: listRef,
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

    await em.persistAndFlush(entry);

    const found = await em.findOneOrFail(RegulatoryListEntry, { list: listRef });
    expect(found.operator).toBe(ComparisonOperator.GT);
    expect(found.conditions).toEqual({
      application_area: 'spray_products',
      max_concentration: '0.05%',
    });
  });

  it('enforces unique constraint on list + substance', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const listRef = await em.findOneOrFail(RegulatoryList, { id: listId });
    const substanceRef = await em.findOneOrFail(Substance, { id: substanceId });

    const entry1 = em.create(RegulatoryListEntry, {
      list: listRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      operator: ComparisonOperator.PRESENT,
      issueType: 'PROHIBITED_SUBSTANCE',
      severity: Severity.BLOCKER,
    });
    await em.persistAndFlush(entry1);

    const em2 = orm.em.fork();
    const listRef2 = await em2.findOneOrFail(RegulatoryList, { id: listId });
    const substanceRef2 = await em2.findOneOrFail(Substance, { id: substanceId });

    const entry2 = em2.create(RegulatoryListEntry, {
      list: listRef2,
      substance: substanceRef2,  // Same list + substance - should fail
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      operator: ComparisonOperator.GT,
      compareValue: '0.1',
      issueType: 'CHEMICAL_LIMIT_EXCEEDED',
      severity: Severity.WARNING,
    });

    await expect(em2.persistAndFlush(entry2)).rejects.toThrow();
  });

  it('preserves snapshot when substance is updated', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const listRef = await em.findOneOrFail(RegulatoryList, { id: listId });
    const substanceRef = await em.findOneOrFail(Substance, { id: substanceId });

    const entry = em.create(RegulatoryListEntry, {
      list: listRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',  // Snapshot at creation time
      operator: ComparisonOperator.PRESENT,
      issueType: 'PROHIBITED_SUBSTANCE',
      severity: Severity.BLOCKER,
    });
    await em.persistAndFlush(entry);

    // Update substance name
    substanceRef.primaryName = 'Methanal';  // IUPAC name
    await em.persistAndFlush(substanceRef);

    // Snapshot should be unchanged
    const found = await em.findOneOrFail(RegulatoryListEntry, { list: listRef });
    expect(found.substanceNameSnapshot).toBe('Formaldehyde');  // Original name preserved
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test RegulatoryListEntry.test.ts
```

Expected: FAIL with "Cannot find module './RegulatoryListEntry.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/entities/RegulatoryListEntry.ts
import {
  Entity,
  Property,
  ManyToOne,
  Enum,
  Unique,
  Index,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { RegulatoryList } from './RegulatoryList.js';
import { Substance } from './Substance.js';
import { ComparisonOperator, Severity } from './enums/index.js';

@Entity({ tableName: 'regulatory_list_entry', schema: 'public' })
@Unique({ properties: ['list', 'substance'] })
@Index({ properties: ['list'] })
export class RegulatoryListEntry extends BaseEntity {
  /**
   * The regulatory list this entry belongs to.
   */
  @ManyToOne(() => RegulatoryList, { name: 'list_id' })
  list!: RegulatoryList;

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

**Step 4: Update RegulatoryList with entries collection**

```typescript
// packages/database/src/entities/RegulatoryList.ts
// Add import at top:
import { RegulatoryListEntry } from './RegulatoryListEntry.js';

// Add at end of class, before closing brace:

  /**
   * Entries (substance restrictions) in this list.
   */
  @OneToMany(() => RegulatoryListEntry, entry => entry.list)
  entries = new Collection<RegulatoryListEntry>(this);
```

**Step 5: Run test to verify it passes**

```bash
cd packages/database && pnpm test RegulatoryListEntry.test.ts
```

Expected: PASS (all tests)

**Step 6: Export from index and commit**

```typescript
// packages/database/src/entities/index.ts
// Add to existing exports:
export { RegulatoryListEntry } from './RegulatoryListEntry.js';
```

```bash
git add packages/database/src/entities/RegulatoryListEntry.ts packages/database/src/entities/RegulatoryListEntry.test.ts packages/database/src/entities/RegulatoryList.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add RegulatoryListEntry entity with forensic snapshots"
```

---

## Task 4: Create RegulatoryList Migration

**Files:**
- Create: `packages/database/src/migrations/Migration20260126_RegulatoryList.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260126_RegulatoryList.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_RegulatoryList extends Migration {
  async up(): Promise<void> {
    // Create regulatory_list table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.regulatory_list (
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
        previous_version_id TEXT REFERENCES public.regulatory_list(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_regulatory_list_code_version UNIQUE (code, version)
      );
    `);

    // Create indexes
    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_list_code
        ON public.regulatory_list (code);
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_list_current
        ON public.regulatory_list (code)
        WHERE is_current_version = true;
    `);

    // Create regulatory_list_entry table with agnostic evaluation fields
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.regulatory_list_entry (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL REFERENCES public.regulatory_list(id) ON DELETE CASCADE,
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
        CONSTRAINT uq_regulatory_list_entry_list_substance UNIQUE (list_id, substance_id)
      );
    `);

    // Create indexes for entry lookups
    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_list_entry_list
        ON public.regulatory_list_entry (list_id);
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_list_entry_substance
        ON public.regulatory_list_entry (substance_id);
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_list_entry_cas
        ON public.regulatory_list_entry (cas_number_snapshot);
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS public.regulatory_list_entry;');
    this.addSql('DROP TABLE IF EXISTS public.regulatory_list;');
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
git add packages/database/src/migrations/Migration20260126_RegulatoryList.ts
git commit -m "feat(database): add migration for regulatory_list and regulatory_list_entry tables"
```

---

## Task 5: Create RegulatoryListService

**Files:**
- Create: `packages/database/src/services/RegulatoryListService.ts`
- Test: `packages/database/src/services/RegulatoryListService.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/RegulatoryListService.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { RegulatoryListEntry } from '../entities/RegulatoryListEntry.js';
import { Substance } from '../entities/Substance.js';
import { RegulatoryListService } from './RegulatoryListService.js';
import { ComparisonOperator, Severity } from '../entities/enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('RegulatoryListService', () => {
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
    await em.nativeDelete(RegulatoryListEntry, {});
    await em.nativeDelete(RegulatoryList, {});
    await em.nativeDelete(Substance, {});
  });

  describe('createList', () => {
    it('creates a new regulatory list', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulatoryListService(em);

      const list = await svc.createList({
        code: 'COSING_ANNEX_II',
        name: 'CosIng Annex II - Prohibited Substances',
        source: 'EU_COSING',
        version: '2024-06',
        effectiveDate: new Date('2024-06-01'),
        sourceUrl: 'https://ec.europa.eu/cosing/',
      });

      expect(list.id).toBeDefined();
      expect(list.code).toBe('COSING_ANNEX_II');
      expect(list.isCurrentVersion).toBe(true);
    });
  });

  describe('getCurrentVersion', () => {
    it('returns the current version of a list', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulatoryListService(em);

      // Create two versions
      await svc.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2023-01',
        effectiveDate: new Date('2023-01-01'),
        isCurrentVersion: false,
      });

      await svc.createList({
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

    it('returns null for non-existent list', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulatoryListService(em);

      const result = await svc.getCurrentVersion('NONEXISTENT');
      expect(result).toBeNull();
    });
  });

  describe('getListsByCodes', () => {
    it('returns current versions for multiple codes', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulatoryListService(em);

      await svc.createList({
        code: 'LIST_A',
        name: 'List A',
        source: 'TEST',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
      });

      await svc.createList({
        code: 'LIST_B',
        name: 'List B',
        source: 'TEST',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
      });

      const lists = await svc.getListsByCodes(['LIST_A', 'LIST_B']);
      expect(lists).toHaveLength(2);
      expect(lists.map(l => l.code).sort()).toEqual(['LIST_A', 'LIST_B']);
    });
  });

  describe('getVersionHistory', () => {
    it('returns all versions ordered by effective date', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulatoryListService(em);

      await svc.createList({
        code: 'VERSIONED_LIST',
        name: 'Test',
        source: 'TEST',
        version: '2022-01',
        effectiveDate: new Date('2022-01-01'),
        isCurrentVersion: false,
      });

      await svc.createList({
        code: 'VERSIONED_LIST',
        name: 'Test',
        source: 'TEST',
        version: '2023-01',
        effectiveDate: new Date('2023-01-01'),
        isCurrentVersion: false,
      });

      await svc.createList({
        code: 'VERSIONED_LIST',
        name: 'Test',
        source: 'TEST',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
        isCurrentVersion: true,
      });

      const versions = await svc.getVersionHistory('VERSIONED_LIST');
      expect(versions).toHaveLength(3);
      expect(versions[0].version).toBe('2024-01');  // Most recent first
      expect(versions[2].version).toBe('2022-01');
    });
  });

  describe('getEntriesForList', () => {
    it('returns all entries for a list', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulatoryListService(em);

      // Create list
      const list = await svc.createList({
        code: 'TEST_LIST',
        name: 'Test',
        source: 'TEST',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
      });

      // Create substances
      const s1 = em.create(Substance, { casNumber: '50-00-0', primaryName: 'Formaldehyde' });
      const s2 = em.create(Substance, { casNumber: '75-56-9', primaryName: 'Propylene oxide' });
      await em.persistAndFlush([s1, s2]);

      // Add entries with agnostic evaluation fields
      await svc.addEntry(list.id, {
        substanceId: s1.id,
        operator: ComparisonOperator.PRESENT,
        issueType: 'PROHIBITED_SUBSTANCE',
        severity: Severity.BLOCKER,
        legalReference: 'Entry 1',
      });

      await svc.addEntry(list.id, {
        substanceId: s2.id,
        operator: ComparisonOperator.GT,
        compareValue: '0.1',
        issueType: 'CHEMICAL_LIMIT_EXCEEDED',
        severity: Severity.WARNING,
        legalReference: 'Entry 2',
      });

      const entries = await svc.getEntriesForList(list.id);
      expect(entries).toHaveLength(2);
    });
  });

  describe('getVersionAtDate', () => {
    it('returns version effective at a specific date', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const svc = new RegulatoryListService(em);

      const v1 = await svc.createList({
        code: 'TEMPORAL_LIST',
        name: 'Test',
        source: 'TEST',
        version: '2023-01',
        effectiveDate: new Date('2023-01-01'),
        isCurrentVersion: false,
      });

      // Supersede v1
      v1.supersededDate = new Date('2024-01-01');
      await em.persistAndFlush(v1);

      await svc.createList({
        code: 'TEMPORAL_LIST',
        name: 'Test',
        source: 'TEST',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
        isCurrentVersion: true,
      });

      // Query for date in 2023 - should get v2023
      const pastVersion = await svc.getVersionAtDate('TEMPORAL_LIST', new Date('2023-06-15'));
      expect(pastVersion?.version).toBe('2023-01');

      // Query for date in 2024 - should get v2024
      const currentVersion = await svc.getVersionAtDate('TEMPORAL_LIST', new Date('2024-06-15'));
      expect(currentVersion?.version).toBe('2024-01');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test RegulatoryListService.test.ts
```

Expected: FAIL with "Cannot find module './RegulatoryListService.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/services/RegulatoryListService.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { RegulatoryListEntry } from '../entities/RegulatoryListEntry.js';
import { Substance } from '../entities/Substance.js';
import { ComparisonOperator, Severity } from '../entities/enums/index.js';

export interface CreateListInput {
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

export interface AddEntryInput {
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

export class RegulatoryListService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Create a new regulatory list version.
   */
  async createList(input: CreateListInput): Promise<RegulatoryList> {
    const list = this.em.create(RegulatoryList, {
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
      const previous = await this.em.findOne(RegulatoryList, { id: input.previousVersionId });
      if (previous) {
        list.previousVersion = previous;
      }
    }

    await this.em.persistAndFlush(list);
    return list;
  }

  /**
   * Get the current (latest) version of a list by code.
   */
  async getCurrentVersion(code: string): Promise<RegulatoryList | null> {
    return this.em.findOne(RegulatoryList, {
      code,
      isCurrentVersion: true,
    });
  }

  /**
   * Get current versions for multiple list codes.
   */
  async getListsByCodes(codes: string[]): Promise<RegulatoryList[]> {
    return this.em.find(RegulatoryList, {
      code: { $in: codes },
      isCurrentVersion: true,
    });
  }

  /**
   * Get all versions of a list, ordered by effective date (newest first).
   */
  async getVersionHistory(code: string): Promise<RegulatoryList[]> {
    return this.em.find(
      RegulatoryList,
      { code },
      { orderBy: { effectiveDate: 'DESC' } }
    );
  }

  /**
   * Get the version of a list that was effective at a specific date.
   * Used for forensic/point-in-time compliance queries.
   */
  async getVersionAtDate(code: string, date: Date): Promise<RegulatoryList | null> {
    return this.em.findOne(
      RegulatoryList,
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
   * Add an entry (substance restriction) to a list.
   */
  async addEntry(listId: string, input: AddEntryInput): Promise<RegulatoryListEntry> {
    const list = await this.em.findOneOrFail(RegulatoryList, { id: listId });
    const substance = await this.em.findOneOrFail(Substance, { id: input.substanceId });

    const entry = this.em.create(RegulatoryListEntry, {
      list,
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

    await this.em.persistAndFlush(entry);
    return entry;
  }

  /**
   * Get all entries for a list.
   */
  async getEntriesForList(
    listId: string,
    options?: { populate?: boolean }
  ): Promise<RegulatoryListEntry[]> {
    return this.em.find(
      RegulatoryListEntry,
      { list: { id: listId } },
      { populate: options?.populate ? ['substance'] : [] }
    );
  }

  /**
   * Get entries for multiple lists (used during evaluation).
   */
  async getEntriesForLists(listIds: string[]): Promise<RegulatoryListEntry[]> {
    return this.em.find(
      RegulatoryListEntry,
      { list: { id: { $in: listIds } } },
      { populate: ['substance'] }
    );
  }

  /**
   * Find entries by CAS number across all current lists.
   */
  async findEntriesByCas(casNumber: string): Promise<RegulatoryListEntry[]> {
    return this.em.find(
      RegulatoryListEntry,
      {
        casNumberSnapshot: casNumber,
        list: { isCurrentVersion: true },
      },
      { populate: ['list'] }
    );
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test RegulatoryListService.test.ts
```

Expected: PASS (all tests)

**Step 5: Export from index and commit**

```typescript
// packages/database/src/services/index.ts (create if doesn't exist)
export { RegulatoryListService } from './RegulatoryListService.js';
```

```bash
git add packages/database/src/services/RegulatoryListService.ts packages/database/src/services/RegulatoryListService.test.ts packages/database/src/services/index.ts
git commit -m "feat(database): add RegulatoryListService with version management"
```

---

## Task 6: Create RegulatoryList API Routes

**Files:**
- Create: `apps/api/src/routes/taxonomy/regulatory-lists.ts`
- Modify: `apps/api/src/routes/taxonomy/index.ts`

**Step 1: Create the router**

```typescript
// apps/api/src/routes/taxonomy/regulatory-lists.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@mikro-orm/postgresql';
import { RegulatoryList, RegulatoryListService } from '@eurocomply/database';
import type { Env } from '../../app.js';

// ============================================================================
// Types
// ============================================================================

export interface RegulatoryListsRouterOptions {
  orm: MikroORM;
}

// ============================================================================
// Schemas
// ============================================================================

const listQuery = z.object({
  source: z.string().optional(),
});

const entriesQuery = z.object({
  operator: z.enum(['GT', 'GTE', 'LT', 'LTE', 'EQ', 'PRESENT', 'ABSENT']).optional(),
  severity: z.enum(['BLOCKER', 'WARNING', 'INFO']).optional(),
});

// ============================================================================
// Router
// ============================================================================

export function createRegulatoryListsRouter(options: RegulatoryListsRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  // GET /taxonomy/regulatory-lists
  // List all current regulatory lists
  router.get('/', zValidator('query', listQuery), async (c) => {
    const query = c.req.valid('query');
    const em = orm.em.fork();

    const where: Record<string, unknown> = { isCurrentVersion: true };
    if (query.source) where.source = query.source;

    const lists = await em.find(RegulatoryList, where, { orderBy: { code: 'ASC' } });

    return c.json({
      data: lists.map(l => ({
        id: l.id,
        code: l.code,
        name: l.name,
        source: l.source,
        version: l.version,
        effectiveDate: l.effectiveDate.toISOString(),
        sourceUrl: l.sourceUrl,
        allowTenantExemption: l.allowTenantExemption,
      })),
      meta: { total: lists.length },
    });
  });

  // GET /taxonomy/regulatory-lists/:code
  // Get current version of a specific list
  router.get('/:code', async (c) => {
    const code = c.req.param('code').toUpperCase();
    const em = orm.em.fork();
    const service = new RegulatoryListService(em);

    const list = await service.getCurrentVersion(code);
    if (!list) {
      return c.json(
        { error: 'Not Found', message: `Regulatory list not found: ${code}` },
        404
      );
    }

    return c.json({
      data: {
        id: list.id,
        code: list.code,
        name: list.name,
        source: list.source,
        version: list.version,
        effectiveDate: list.effectiveDate.toISOString(),
        supersededDate: list.supersededDate?.toISOString(),
        sourceUrl: list.sourceUrl,
        description: list.description,
        allowTenantExemption: list.allowTenantExemption,
      },
    });
  });

  // GET /taxonomy/regulatory-lists/:code/versions
  // Get version history for a list
  router.get('/:code/versions', async (c) => {
    const code = c.req.param('code').toUpperCase();
    const em = orm.em.fork();
    const service = new RegulatoryListService(em);

    const versions = await service.getVersionHistory(code);
    if (versions.length === 0) {
      return c.json(
        { error: 'Not Found', message: `Regulatory list not found: ${code}` },
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

  // GET /taxonomy/regulatory-lists/:code/entries
  // Get entries for current version of a list
  router.get('/:code/entries', zValidator('query', entriesQuery), async (c) => {
    const code = c.req.param('code').toUpperCase();
    const query = c.req.valid('query');
    const em = orm.em.fork();
    const service = new RegulatoryListService(em);

    const list = await service.getCurrentVersion(code);
    if (!list) {
      return c.json(
        { error: 'Not Found', message: `Regulatory list not found: ${code}` },
        404
      );
    }

    let entries = await service.getEntriesForList(list.id, { populate: true });

    // Filter by operator or severity if provided
    if (query.operator) {
      entries = entries.filter(e => e.operator === query.operator);
    }
    if (query.severity) {
      entries = entries.filter(e => e.severity === query.severity);
    }

    return c.json({
      data: entries.map(e => ({
        id: e.id,
        casNumber: e.casNumberSnapshot,
        substanceName: e.substanceNameSnapshot,
        // Agnostic evaluation fields
        operator: e.operator,
        compareValue: e.compareValue,
        issueType: e.issueType,
        severity: e.severity,
        // Optional
        stoichiometricFactor: e.stoichiometricFactor,
        conditions: e.conditions,
        legalReference: e.legalReference,
      })),
      meta: { total: entries.length },
    });
  });

  return router;
}
```

**Step 2: Register in taxonomy routes**

```typescript
// apps/api/src/routes/taxonomy/index.ts
// Add import:
import { createRegulatoryListsRouter } from './regulatory-lists.js';

// Add route registration (after existing taxonomy routes):
taxonomy.route('/regulatory-lists', createRegulatoryListsRouter({ orm }));
```

**Step 4: Verify build**

```bash
cd apps/api && pnpm build
```

Expected: Build succeeds

**Step 5: Commit**

```bash
git add apps/api/src/routes/taxonomy/regulatory-lists.ts apps/api/src/routes/taxonomy/index.ts
git commit -m "feat(api): add regulatory-lists public taxonomy routes"
```

---

## Task 7: Integration Test

**Files:**
- Create: `apps/api/src/routes/taxonomy/regulatory-lists.test.ts`

**Step 1: Write integration test**

```typescript
// apps/api/src/routes/taxonomy/regulatory-lists.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { MikroORM } from '@mikro-orm/postgresql';
import { RegulatoryList, RegulatoryListEntry, Substance, ComparisonOperator, Severity } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createRegulatoryListsRouter } from './regulatory-lists.js';

interface ListResponse {
  data: Array<{ code: string; name: string; version: string }>;
  meta: { total: number };
}

interface SingleResponse {
  data: { code: string; name: string; version: string };
}

interface EntriesResponse {
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

describe('Regulatory Lists API Integration', () => {
  let orm: MikroORM;
  let app: Hono;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;

    orm = await setupTestDb();
    app = new Hono();
    app.route('/regulatory-lists', createRegulatoryListsRouter({ orm }));
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!orm) return;
    const em = orm.em.fork();
    await em.nativeDelete(RegulatoryListEntry, {});
    await em.nativeDelete(RegulatoryList, {});
    await em.nativeDelete(Substance, {});

    // Seed test data
    const list = em.create(RegulatoryList, {
      code: 'TEST_COSING',
      name: 'Test CosIng List',
      source: 'EU_COSING',
      version: '2024-06',
      effectiveDate: new Date('2024-06-01'),
      sourceUrl: 'https://example.com/cosing',
    });

    const substance = em.create(Substance, {
      casNumber: '50-00-0',
      primaryName: 'Formaldehyde',
    });

    await em.persistAndFlush([list, substance]);

    const entry = em.create(RegulatoryListEntry, {
      list,
      substance,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      operator: ComparisonOperator.PRESENT,
      issueType: 'PROHIBITED_SUBSTANCE',
      severity: Severity.BLOCKER,
      legalReference: 'Entry 1577',
    });

    await em.persistAndFlush(entry);
  });

  describe('GET /regulatory-lists', () => {
    it('returns all current regulatory lists', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulatory-lists');
      expect(res.status).toBe(200);

      const body = (await res.json()) as ListResponse;
      expect(body.data).toHaveLength(1);
      expect(body.data[0].code).toBe('TEST_COSING');
      expect(body.meta.total).toBe(1);
    });

    it('filters by source', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulatory-lists?source=EU_COSING');
      expect(res.status).toBe(200);

      const body = (await res.json()) as ListResponse;
      expect(body.data).toHaveLength(1);

      const res2 = await app.request('/regulatory-lists?source=NONEXISTENT');
      expect(res2.status).toBe(200);

      const body2 = (await res2.json()) as ListResponse;
      expect(body2.data).toHaveLength(0);
    });
  });

  describe('GET /regulatory-lists/:code', () => {
    it('returns a specific list by code', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulatory-lists/TEST_COSING');
      expect(res.status).toBe(200);

      const body = (await res.json()) as SingleResponse;
      expect(body.data.code).toBe('TEST_COSING');
      expect(body.data.name).toBe('Test CosIng List');
      expect(body.data.version).toBe('2024-06');
    });

    it('returns 404 for non-existent list', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulatory-lists/NONEXISTENT');
      expect(res.status).toBe(404);

      const body = (await res.json()) as ErrorResponse;
      expect(body.error).toBe('Not Found');
    });
  });

  describe('GET /regulatory-lists/:code/entries', () => {
    it('returns entries for a list with agnostic fields', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulatory-lists/TEST_COSING/entries');
      expect(res.status).toBe(200);

      const body = (await res.json()) as EntriesResponse;
      expect(body.data).toHaveLength(1);
      expect(body.data[0].casNumber).toBe('50-00-0');
      expect(body.data[0].substanceName).toBe('Formaldehyde');
      expect(body.data[0].operator).toBe('PRESENT');
      expect(body.data[0].issueType).toBe('PROHIBITED_SUBSTANCE');
      expect(body.data[0].severity).toBe('BLOCKER');
    });

    it('filters entries by operator', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulatory-lists/TEST_COSING/entries?operator=PRESENT');
      expect(res.status).toBe(200);

      const body = (await res.json()) as EntriesResponse;
      expect(body.data).toHaveLength(1);

      const res2 = await app.request('/regulatory-lists/TEST_COSING/entries?operator=GT');
      expect(res2.status).toBe(200);

      const body2 = (await res2.json()) as EntriesResponse;
      expect(body2.data).toHaveLength(0);
    });

    it('filters entries by severity', async (context) => {
      if (!orm) { context.skip(); return; }

      const res = await app.request('/regulatory-lists/TEST_COSING/entries?severity=BLOCKER');
      expect(res.status).toBe(200);

      const body = (await res.json()) as EntriesResponse;
      expect(body.data).toHaveLength(1);

      const res2 = await app.request('/regulatory-lists/TEST_COSING/entries?severity=WARNING');
      expect(res2.status).toBe(200);

      const body2 = (await res2.json()) as EntriesResponse;
      expect(body2.data).toHaveLength(0);
    });
  });
});
```

**Step 2: Run integration test**

```bash
cd apps/api && pnpm test regulatory-lists.test.ts
```

Expected: PASS (all tests)

**Step 3: Commit**

```bash
git add apps/api/src/routes/taxonomy/regulatory-lists.test.ts
git commit -m "test(api): add integration tests for regulatory-lists routes"
```

---

## Summary

**Plan 10 delivers:**
- `ComparisonOperator` and `Severity` enums for agnostic evaluation
- `RegulatoryList` entity with versioning support and `allowTenantExemption` flag
- `RegulatoryListEntry` entity with forensic snapshots
- Database migration for both tables
- `RegulatoryListService` with version management
- Public API routes for regulatory list access (including `allowTenantExemption` in responses)
- Full test coverage (including `allowTenantExemption` persistence and default value tests)

**Next Plans:**
- **Plan 11:** CategoryRegulatoryList (category-list scoping)
- **Plan 12:** RegulatoryImportService (admin import pipeline)
- **Plan 14:** Vertical rule evaluators
- **Plan 15:** Initial list seeders

---

*Plan created: 2026-01-26*
