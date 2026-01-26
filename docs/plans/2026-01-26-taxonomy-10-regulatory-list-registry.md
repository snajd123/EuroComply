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
export function create*Router(options: RouterOptions): Hono<Env> {
  const router = new Hono<Env>();
  return router;
}
```

### Taxonomy Routes (Public - No Auth)
RegulatoryLists are **public reference data** - no authentication required:
```typescript
// File: apps/api/src/routes/taxonomy/index.ts
const taxonomy = new Hono<Env>();
taxonomy.route('/regulatory-lists', createRegulatoryListsRouter(deps));
v1.route('/taxonomy', taxonomy);  // No middleware - public routes
```

### Response Format (MUST MATCH)
```typescript
// Success
c.json({ data: entity })
c.json({ data: items, meta: { total: items.length } })

// Errors (use exact format)
c.json({ error: 'Not Found', message: 'Regulatory list not found: INVALID_CODE' }, 404)
c.json({ error: 'Bad Request', message: 'Invalid list code format' }, 400)
```

---

## Task 1: Create RestrictionType Enum

**Files:**
- Create: `packages/database/src/entities/enums/RestrictionType.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create the enum file**

```typescript
// packages/database/src/entities/enums/RestrictionType.ts
export enum RestrictionType {
  PROHIBITED = 'PROHIBITED',                         // Substance banned entirely
  THRESHOLD = 'THRESHOLD',                           // Allowed below threshold
  RESTRICTED_WITH_CONDITIONS = 'RESTRICTED_WITH_CONDITIONS',  // Conditional use
}
```

**Step 2: Export from index**

```typescript
// packages/database/src/entities/enums/index.ts
// Add to existing exports:
export { RestrictionType } from './RestrictionType.js';
```

**Step 3: Verify build**

```bash
cd packages/database && pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/database/src/entities/enums/RestrictionType.ts packages/database/src/entities/enums/index.ts
git commit -m "feat(database): add RestrictionType enum (PROHIBITED, THRESHOLD, RESTRICTED_WITH_CONDITIONS)"
```

---

## Task 2: Create RegulatoryList Entity

**Files:**
- Create: `packages/database/src/entities/RegulatoryList.ts`
- Test: `packages/database/src/entities/RegulatoryList.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/RegulatoryList.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { RegulatoryList } from './RegulatoryList.js';
import testConfig from '../mikro-orm.config.test.js';

describe('RegulatoryList Entity', () => {
  let orm: MikroORM<PostgreSqlDriver>;

  beforeAll(async () => {
    orm = await MikroORM.init<PostgreSqlDriver>({
      ...testConfig,
      entities: [RegulatoryList],
      allowGlobalContext: true,
    });
    await orm.getSchemaGenerator().refreshDatabase();
  });

  afterAll(async () => {
    await orm.close(true);
  });

  it('should create a regulatory list with required fields', async () => {
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

  it('should enforce unique constraint on code + version', async () => {
    const em = orm.em.fork();

    const list1 = em.create(RegulatoryList, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC Candidate List',
      source: 'ECHA',
      version: '2024-01',
      effectiveDate: new Date('2024-01-15'),
    });
    await em.persistAndFlush(list1);

    const list2 = em.create(RegulatoryList, {
      code: 'REACH_SVHC',
      name: 'REACH SVHC Candidate List',
      source: 'ECHA',
      version: '2024-01',  // Same version - should fail
      effectiveDate: new Date('2024-01-15'),
    });

    await expect(em.persistAndFlush(list2)).rejects.toThrow();
  });

  it('should allow same code with different versions', async () => {
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

  it('should support version chain via previousVersion', async () => {
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
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { RegulatoryList } from './RegulatoryList.js';
import { RegulatoryListEntry } from './RegulatoryListEntry.js';
import { Substance } from './Substance.js';
import { RestrictionType } from './enums/index.js';
import testConfig from '../mikro-orm.config.test.js';

describe('RegulatoryListEntry Entity', () => {
  let orm: MikroORM<PostgreSqlDriver>;
  let list: RegulatoryList;
  let substance: Substance;

  beforeAll(async () => {
    orm = await MikroORM.init<PostgreSqlDriver>({
      ...testConfig,
      entities: [RegulatoryList, RegulatoryListEntry, Substance],
      allowGlobalContext: true,
    });
    await orm.getSchemaGenerator().refreshDatabase();
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    const em = orm.em.fork();
    await em.nativeDelete(RegulatoryListEntry, {});
    await em.nativeDelete(RegulatoryList, {});
    await em.nativeDelete(Substance, {});

    // Create test list
    list = em.create(RegulatoryList, {
      code: 'TEST_LIST',
      name: 'Test Regulatory List',
      source: 'TEST',
      version: '2024-01',
      effectiveDate: new Date('2024-01-01'),
    });

    // Create test substance
    substance = em.create(Substance, {
      casNumber: '50-00-0',
      primaryName: 'Formaldehyde',
    });

    await em.persistAndFlush([list, substance]);
  });

  it('should create an entry with prohibition restriction', async () => {
    const em = orm.em.fork();

    const listRef = await em.findOneOrFail(RegulatoryList, { code: 'TEST_LIST' });
    const substanceRef = await em.findOneOrFail(Substance, { casNumber: '50-00-0' });

    const entry = em.create(RegulatoryListEntry, {
      list: listRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      restrictionType: RestrictionType.PROHIBITED,
      legalReference: 'Entry 1577',
    });

    await em.persistAndFlush(entry);

    const found = await em.findOneOrFail(RegulatoryListEntry, {
      list: listRef,
      substance: substanceRef,
    });

    expect(found.restrictionType).toBe(RestrictionType.PROHIBITED);
    expect(found.casNumberSnapshot).toBe('50-00-0');
    expect(found.substanceNameSnapshot).toBe('Formaldehyde');
    expect(found.legalReference).toBe('Entry 1577');
  });

  it('should create an entry with threshold restriction', async () => {
    const em = orm.em.fork();

    const listRef = await em.findOneOrFail(RegulatoryList, { code: 'TEST_LIST' });
    const substanceRef = await em.findOneOrFail(Substance, { casNumber: '50-00-0' });

    const entry = em.create(RegulatoryListEntry, {
      list: listRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      restrictionType: RestrictionType.THRESHOLD,
      thresholdPct: '0.1',  // 0.1% max
      legalReference: 'Annex XVII Entry 28',
    });

    await em.persistAndFlush(entry);

    const found = await em.findOneOrFail(RegulatoryListEntry, { list: listRef });
    expect(found.restrictionType).toBe(RestrictionType.THRESHOLD);
    expect(found.thresholdPct).toBe('0.1');
  });

  it('should create an entry with conditional restriction', async () => {
    const em = orm.em.fork();

    const listRef = await em.findOneOrFail(RegulatoryList, { code: 'TEST_LIST' });
    const substanceRef = await em.findOneOrFail(Substance, { casNumber: '50-00-0' });

    const entry = em.create(RegulatoryListEntry, {
      list: listRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      restrictionType: RestrictionType.RESTRICTED_WITH_CONDITIONS,
      thresholdPct: '0.05',
      conditions: {
        application_area: 'spray_products',
        max_concentration: '0.05%',
      },
      legalReference: 'CosIng Annex III Entry 13',
    });

    await em.persistAndFlush(entry);

    const found = await em.findOneOrFail(RegulatoryListEntry, { list: listRef });
    expect(found.restrictionType).toBe(RestrictionType.RESTRICTED_WITH_CONDITIONS);
    expect(found.conditions).toEqual({
      application_area: 'spray_products',
      max_concentration: '0.05%',
    });
  });

  it('should enforce unique constraint on list + substance', async () => {
    const em = orm.em.fork();

    const listRef = await em.findOneOrFail(RegulatoryList, { code: 'TEST_LIST' });
    const substanceRef = await em.findOneOrFail(Substance, { casNumber: '50-00-0' });

    const entry1 = em.create(RegulatoryListEntry, {
      list: listRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      restrictionType: RestrictionType.PROHIBITED,
    });
    await em.persistAndFlush(entry1);

    const entry2 = em.create(RegulatoryListEntry, {
      list: listRef,
      substance: substanceRef,  // Same list + substance - should fail
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      restrictionType: RestrictionType.THRESHOLD,
      thresholdPct: '0.1',
    });

    await expect(em.persistAndFlush(entry2)).rejects.toThrow();
  });

  it('should preserve snapshot even if substance is updated', async () => {
    const em = orm.em.fork();

    const listRef = await em.findOneOrFail(RegulatoryList, { code: 'TEST_LIST' });
    const substanceRef = await em.findOneOrFail(Substance, { casNumber: '50-00-0' });

    const entry = em.create(RegulatoryListEntry, {
      list: listRef,
      substance: substanceRef,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',  // Snapshot at creation time
      restrictionType: RestrictionType.PROHIBITED,
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
import { RestrictionType } from './enums/index.js';

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
  // Restriction Details
  // ─────────────────────────────────────────────────────────────

  /**
   * Type of restriction applied to this substance.
   */
  @Enum({ items: () => RestrictionType, name: 'restriction_type' })
  restrictionType!: RestrictionType;

  /**
   * Maximum allowed concentration (as percentage).
   * NULL for PROHIBITED restrictions.
   * Stored as string to preserve decimal precision.
   */
  @Property({ type: 'decimal', precision: 7, scale: 4, nullable: true, name: 'threshold_pct' })
  thresholdPct?: string;

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

    // Create regulatory_list_entry table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.regulatory_list_entry (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL REFERENCES public.regulatory_list(id) ON DELETE CASCADE,
        substance_id TEXT NOT NULL REFERENCES public.substance(id),
        cas_number_snapshot TEXT NOT NULL,
        substance_name_snapshot TEXT NOT NULL,
        restriction_type TEXT NOT NULL CHECK (restriction_type IN ('PROHIBITED', 'THRESHOLD', 'RESTRICTED_WITH_CONDITIONS')),
        threshold_pct NUMERIC(7,4),
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
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { RegulatoryListEntry } from '../entities/RegulatoryListEntry.js';
import { Substance } from '../entities/Substance.js';
import { RegulatoryListService } from './RegulatoryListService.js';
import { RestrictionType } from '../entities/enums/index.js';
import testConfig from '../mikro-orm.config.test.js';

describe('RegulatoryListService', () => {
  let orm: MikroORM<PostgreSqlDriver>;
  let service: RegulatoryListService;

  beforeAll(async () => {
    orm = await MikroORM.init<PostgreSqlDriver>({
      ...testConfig,
      entities: [RegulatoryList, RegulatoryListEntry, Substance],
      allowGlobalContext: true,
    });
    await orm.getSchemaGenerator().refreshDatabase();
    service = new RegulatoryListService(orm.em);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    const em = orm.em.fork();
    await em.nativeDelete(RegulatoryListEntry, {});
    await em.nativeDelete(RegulatoryList, {});
    await em.nativeDelete(Substance, {});
  });

  describe('createList', () => {
    it('should create a new regulatory list', async () => {
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
    it('should return the current version of a list', async () => {
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

    it('should return null for non-existent list', async () => {
      const em = orm.em.fork();
      const svc = new RegulatoryListService(em);

      const result = await svc.getCurrentVersion('NONEXISTENT');
      expect(result).toBeNull();
    });
  });

  describe('getListsByCodes', () => {
    it('should return current versions for multiple codes', async () => {
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
    it('should return all versions of a list ordered by effective date', async () => {
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
    it('should return all entries for a list', async () => {
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

      // Add entries
      await svc.addEntry(list.id, {
        substanceId: s1.id,
        restrictionType: RestrictionType.PROHIBITED,
        legalReference: 'Entry 1',
      });

      await svc.addEntry(list.id, {
        substanceId: s2.id,
        restrictionType: RestrictionType.THRESHOLD,
        thresholdPct: '0.1',
        legalReference: 'Entry 2',
      });

      const entries = await svc.getEntriesForList(list.id);
      expect(entries).toHaveLength(2);
    });
  });

  describe('getVersionAtDate', () => {
    it('should return the version effective at a specific date', async () => {
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
import { RestrictionType } from '../entities/enums/index.js';

export interface CreateListInput {
  code: string;
  name: string;
  source: string;
  version: string;
  effectiveDate: Date;
  sourceUrl?: string;
  description?: string;
  isCurrentVersion?: boolean;
  previousVersionId?: string;
}

export interface AddEntryInput {
  substanceId: string;
  restrictionType: RestrictionType;
  thresholdPct?: string;
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
      restrictionType: input.restrictionType,
      thresholdPct: input.thresholdPct,
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
import { EntityManager } from '@mikro-orm/postgresql';
import { RegulatoryListService } from '@eurocomply/database';
import type { Env } from '../../app.js';

interface RouterDeps {
  em: EntityManager;
}

export function createRegulatoryListsRouter(deps: RouterDeps): Hono<Env> {
  const router = new Hono<Env>();

  // GET /taxonomy/regulatory-lists
  // List all current regulatory lists
  router.get('/', async (c) => {
    const em = deps.em.fork();
    const service = new RegulatoryListService(em);

    const lists = await em.find(
      RegulatoryList,
      { isCurrentVersion: true },
      { orderBy: { code: 'ASC' } }
    );

    return c.json({
      data: lists.map(l => ({
        id: l.id,
        code: l.code,
        name: l.name,
        source: l.source,
        version: l.version,
        effectiveDate: l.effectiveDate.toISOString(),
        sourceUrl: l.sourceUrl,
      })),
      meta: { total: lists.length },
    });
  });

  // GET /taxonomy/regulatory-lists/:code
  // Get current version of a specific list
  router.get('/:code', async (c) => {
    const code = c.req.param('code');
    const em = deps.em.fork();
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
      },
    });
  });

  // GET /taxonomy/regulatory-lists/:code/versions
  // Get version history for a list
  router.get('/:code/versions', async (c) => {
    const code = c.req.param('code');
    const em = deps.em.fork();
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
  router.get('/:code/entries', async (c) => {
    const code = c.req.param('code');
    const em = deps.em.fork();
    const service = new RegulatoryListService(em);

    const list = await service.getCurrentVersion(code);
    if (!list) {
      return c.json(
        { error: 'Not Found', message: `Regulatory list not found: ${code}` },
        404
      );
    }

    const entries = await service.getEntriesForList(list.id, { populate: true });

    return c.json({
      data: entries.map(e => ({
        id: e.id,
        casNumber: e.casNumberSnapshot,
        substanceName: e.substanceNameSnapshot,
        restrictionType: e.restrictionType,
        thresholdPct: e.thresholdPct,
        conditions: e.conditions,
        legalReference: e.legalReference,
      })),
      meta: { total: entries.length },
    });
  });

  return router;
}
```

**Step 2: Add import to RegulatoryList entity**

Add at the top of the file:
```typescript
import { RegulatoryList } from '@eurocomply/database';
```

**Step 3: Register in taxonomy routes**

```typescript
// apps/api/src/routes/taxonomy/index.ts
// Add import:
import { createRegulatoryListsRouter } from './regulatory-lists.js';

// Add route registration (after existing taxonomy routes):
taxonomy.route('/regulatory-lists', createRegulatoryListsRouter({ em }));
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
// apps/api/src/routes/taxonomy/regulatory-lists.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { app } from '../../app.js';
import { MikroORM } from '@mikro-orm/postgresql';
import { RegulatoryList, RegulatoryListEntry, Substance, RestrictionType } from '@eurocomply/database';

describe('Regulatory Lists API', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init();
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
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
      restrictionType: RestrictionType.PROHIBITED,
      legalReference: 'Entry 1577',
    });

    await em.persistAndFlush(entry);
  });

  describe('GET /api/v1/taxonomy/regulatory-lists', () => {
    it('should return all current regulatory lists', async () => {
      const res = await app.request('/api/v1/taxonomy/regulatory-lists');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].code).toBe('TEST_COSING');
      expect(body.meta.total).toBe(1);
    });
  });

  describe('GET /api/v1/taxonomy/regulatory-lists/:code', () => {
    it('should return a specific list by code', async () => {
      const res = await app.request('/api/v1/taxonomy/regulatory-lists/TEST_COSING');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.code).toBe('TEST_COSING');
      expect(body.data.name).toBe('Test CosIng List');
      expect(body.data.version).toBe('2024-06');
    });

    it('should return 404 for non-existent list', async () => {
      const res = await app.request('/api/v1/taxonomy/regulatory-lists/NONEXISTENT');
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Not Found');
    });
  });

  describe('GET /api/v1/taxonomy/regulatory-lists/:code/entries', () => {
    it('should return entries for a list', async () => {
      const res = await app.request('/api/v1/taxonomy/regulatory-lists/TEST_COSING/entries');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].casNumber).toBe('50-00-0');
      expect(body.data[0].substanceName).toBe('Formaldehyde');
      expect(body.data[0].restrictionType).toBe('PROHIBITED');
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
- `RestrictionType` enum (PROHIBITED, THRESHOLD, RESTRICTED_WITH_CONDITIONS)
- `RegulatoryList` entity with versioning support
- `RegulatoryListEntry` entity with forensic snapshots
- Database migration for both tables
- `RegulatoryListService` with version management
- Public API routes for regulatory list access
- Full test coverage

**Next Plans:**
- **Plan 11:** CategoryRegulatoryList (category-list scoping)
- **Plan 12:** RegulatoryImportService (admin import pipeline)
- **Plan 14:** Vertical rule evaluators
- **Plan 15:** Initial list seeders

---

*Plan created: 2026-01-26*
