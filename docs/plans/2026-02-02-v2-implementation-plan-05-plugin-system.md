# Segment 05: Plugin System (Verticals, Handlers, Rules)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the plugin architecture where verticals (industries), workspaces, requirement handlers, and rules are database-driven configuration, not hardcoded. This enables adding new industries via INSERT statements rather than code changes.

**Architecture:** The "Compliance Virtual Machine" treats rules as data (JSON) executed by handlers (code). Seeders "compile" rule definitions into the database, and handlers evaluate products against those rules at runtime. Verticals define the context (cosmetics, electronics, food) with associated personas, workspaces, and rules.

**Tech Stack:** PostgreSQL, MikroORM, TypeScript, JSON Schema

---

## Prerequisites

- Segment 03 completed (Tenant database with row-level tenancy)
- Segment 04 completed (Neo4j knowledge graph)
- Understanding of the v2 architecture design document

---

## Task 1: Create Vertical Entity

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Vertical.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Vertical.test.ts`

**Step 1: Write failing test for Vertical entity**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Vertical } from './Vertical.js';

describe('Vertical Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(Vertical, {});
  });

  describe('creation', () => {
    it('should_create_vertical_with_required_fields', async () => {
      const vertical = em.create(Vertical, {
        id: 'cosmetics',
        name: 'Cosmetics',
        description: 'Personal care and cosmetic products',
        version: '1.0.0',
        gsrPersonas: ['cosing', 'clp'],
      });

      await em.persistAndFlush(vertical);

      expect(vertical.id).toBe('cosmetics');
      expect(vertical.gsrPersonas).toContain('cosing');
    });

    it('should_store_default_config_as_jsonb', async () => {
      const vertical = em.create(Vertical, {
        id: 'electronics',
        name: 'Electronics',
        version: '1.0.0',
        gsrPersonas: ['rohs', 'reach'],
        defaultConfig: {
          markets: ['EU', 'UK'],
          requireCeMarking: true,
        },
      });

      await em.persistAndFlush(vertical);

      const loaded = await em.findOneOrFail(Vertical, { id: 'electronics' });
      expect(loaded.defaultConfig?.markets).toContain('EU');
    });

    it('should_enforce_unique_id_constraint', async () => {
      const v1 = em.create(Vertical, {
        id: 'food',
        name: 'Food',
        version: '1.0.0',
        gsrPersonas: ['efsa'],
      });
      await em.persistAndFlush(v1);

      const v2 = em.create(Vertical, {
        id: 'food', // Duplicate
        name: 'Food Products',
        version: '1.0.0',
        gsrPersonas: ['efsa'],
      });

      await expect(em.persistAndFlush(v2)).rejects.toThrow(/unique|duplicate/i);
    });
  });

  describe('gsr personas', () => {
    it('should_store_multiple_personas_as_array', async () => {
      const vertical = em.create(Vertical, {
        id: 'biocides',
        name: 'Biocidal Products',
        version: '1.0.0',
        gsrPersonas: ['biocide', 'clp', 'reach'],
      });

      await em.persistAndFlush(vertical);

      expect(vertical.gsrPersonas).toHaveLength(3);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/Vertical.test.ts`
Expected: FAIL

**Step 3: Create Vertical entity**

```typescript
import {
  Entity,
  Property,
  PrimaryKey,
  OneToMany,
  Collection,
} from '@mikro-orm/core';
import { VerticalWorkspace } from './VerticalWorkspace.js';

/**
 * Vertical: An industry vertical (plugin).
 *
 * Verticals define:
 * - Which GSR personas are relevant (cosing for cosmetics, efsa for food)
 * - Which workspaces are available
 * - Default configuration for tenants
 * - Associated rules and handlers
 *
 * Adding a new industry = INSERT into verticals + seed rules.
 * No code changes required.
 */
@Entity({ tableName: 'verticals' })
export class Vertical {
  /**
   * Unique identifier (e.g., 'cosmetics', 'electronics', 'food').
   * Used as primary key for simplicity and readability.
   */
  @PrimaryKey({ type: 'varchar', length: 50 })
  id!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string | null;

  /**
   * Semantic version for the vertical definition.
   * Allows tracking of rule updates.
   */
  @Property({ type: 'varchar', length: 20 })
  version!: string;

  /**
   * GSR personas used by this vertical.
   * Maps to substance_* tables in GSR database.
   */
  @Property({ type: 'text[]' })
  gsrPersonas!: string[];

  /**
   * Default configuration for tenants enabling this vertical.
   */
  @Property({ type: 'jsonb', nullable: true })
  defaultConfig?: Record<string, unknown> | null;

  /**
   * JSON Schema for validating tenant config overrides.
   */
  @Property({ type: 'jsonb', nullable: true })
  configSchema?: Record<string, unknown> | null;

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true;

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @OneToMany(() => VerticalWorkspace, (ws) => ws.vertical)
  workspaces = new Collection<VerticalWorkspace>(this);
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/Vertical.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/Vertical.ts packages/database/src/entities/Vertical.test.ts
git commit -m "feat(database): add Vertical entity for industry plugins

Vertical defines an industry plugin:
- id: unique identifier (cosmetics, electronics, food)
- gsrPersonas: which GSR personas are relevant
- defaultConfig: tenant configuration defaults
- configSchema: JSON Schema for validation

Adding new industries = INSERT, no code changes.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create VerticalWorkspace Entity

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/VerticalWorkspace.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/VerticalWorkspace.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Vertical } from './Vertical.js';
import { VerticalWorkspace } from './VerticalWorkspace.js';

describe('VerticalWorkspace Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testVertical: Vertical;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(VerticalWorkspace, {});
    await em.nativeDelete(Vertical, {});

    testVertical = em.create(Vertical, {
      id: 'cosmetics',
      name: 'Cosmetics',
      version: '1.0.0',
      gsrPersonas: ['cosing'],
    });
    await em.persistAndFlush(testVertical);
    em.clear();
    testVertical = await em.findOneOrFail(Vertical, { id: 'cosmetics' });
  });

  describe('creation', () => {
    it('should_create_workspace_linked_to_vertical', async () => {
      const workspace = em.create(VerticalWorkspace, {
        id: 'cosmetics:formulation',
        vertical: testVertical,
        code: 'formulation',
        name: 'Formulation',
        description: 'Manage cosmetic formulations',
        availableRoles: ['VIEWER', 'EDITOR', 'MANAGER'],
      });

      await em.persistAndFlush(workspace);

      expect(workspace.id).toBe('cosmetics:formulation');
    });

    it('should_enforce_unique_workspace_per_vertical', async () => {
      const ws1 = em.create(VerticalWorkspace, {
        id: 'cosmetics:design',
        vertical: testVertical,
        code: 'design',
        name: 'Design',
        availableRoles: ['VIEWER'],
      });
      await em.persistAndFlush(ws1);

      const ws2 = em.create(VerticalWorkspace, {
        id: 'cosmetics:design2', // Different id
        vertical: testVertical,
        code: 'design', // Same code
        name: 'Design Duplicate',
        availableRoles: ['VIEWER'],
      });

      await expect(em.persistAndFlush(ws2)).rejects.toThrow(/unique|duplicate/i);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/VerticalWorkspace.test.ts`
Expected: FAIL

**Step 3: Create VerticalWorkspace entity**

```typescript
import {
  Entity,
  Property,
  PrimaryKey,
  ManyToOne,
  Unique,
  Index,
  type Rel,
} from '@mikro-orm/core';
import { Vertical } from './Vertical.js';

/**
 * VerticalWorkspace: A workspace within a vertical.
 *
 * Workspaces define functional areas within an industry vertical.
 * Each workspace has its own set of available roles.
 *
 * Example for Cosmetics:
 * - formulation: Manage product formulations
 * - safety: Safety assessments and documentation
 * - labeling: Product labeling and claims
 */
@Entity({ tableName: 'vertical_workspaces' })
@Unique({ properties: ['vertical', 'code'], name: 'uq_vertical_workspace' })
export class VerticalWorkspace {
  /**
   * Composite ID: {vertical_id}:{workspace_code}
   */
  @PrimaryKey({ type: 'varchar', length: 100 })
  id!: string;

  @ManyToOne(() => Vertical, { onDelete: 'cascade' })
  @Index({ name: 'idx_workspace_vertical' })
  vertical!: Rel<Vertical>;

  /**
   * Short code for the workspace (e.g., 'formulation', 'safety').
   */
  @Property({ type: 'varchar', length: 50 })
  code!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string | null;

  /**
   * Roles available in this workspace.
   */
  @Property({ type: 'text[]' })
  availableRoles!: string[];

  @Property({ type: 'varchar', length: 50, nullable: true })
  icon?: string | null;

  @Property({ type: 'varchar', length: 20, nullable: true })
  color?: string | null;

  @Property({ type: 'integer', default: 0 })
  sortOrder: number = 0;

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/VerticalWorkspace.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/VerticalWorkspace.ts packages/database/src/entities/VerticalWorkspace.test.ts
git commit -m "feat(database): add VerticalWorkspace entity

Workspaces define functional areas within a vertical:
- Composite ID: vertical_id:workspace_code
- Available roles per workspace
- Sort order for UI presentation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create TenantVertical Entity

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/TenantVertical.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/TenantVertical.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Tenant } from './Tenant.js';
import { Vertical } from './Vertical.js';
import { TenantVertical } from './TenantVertical.js';

describe('TenantVertical Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testTenant: Tenant;
  let testVertical: Vertical;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(TenantVertical, {});
    await em.nativeDelete(Tenant, {});
    await em.nativeDelete(Vertical, {});

    testTenant = em.create(Tenant, {
      externalId: 'org_test',
      name: 'Test Company',
      slug: 'test-company',
    });
    await em.persistAndFlush(testTenant);

    testVertical = em.create(Vertical, {
      id: 'cosmetics',
      name: 'Cosmetics',
      version: '1.0.0',
      gsrPersonas: ['cosing'],
    });
    await em.persistAndFlush(testVertical);

    em.clear();
  });

  describe('tenant vertical enablement', () => {
    it('should_enable_vertical_for_tenant_with_config', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });
      testVertical = await em.findOneOrFail(Vertical, { id: 'cosmetics' });

      const tenantVertical = em.create(TenantVertical, {
        tenant: testTenant,
        vertical: testVertical,
        config: {
          markets: ['EU', 'UK'],
          enableSafetyReports: true,
        },
      });

      await em.persistAndFlush(tenantVertical);

      expect(tenantVertical.enabledAt).toBeDefined();
      expect(tenantVertical.config?.markets).toContain('EU');
    });

    it('should_enforce_unique_tenant_vertical_combination', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });
      testVertical = await em.findOneOrFail(Vertical, { id: 'cosmetics' });

      const tv1 = em.create(TenantVertical, {
        tenant: testTenant,
        vertical: testVertical,
      });
      await em.persistAndFlush(tv1);

      const tv2 = em.create(TenantVertical, {
        tenant: testTenant,
        vertical: testVertical,
      });

      await expect(em.persistAndFlush(tv2)).rejects.toThrow(/unique|duplicate/i);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/TenantVertical.test.ts`
Expected: FAIL

**Step 3: Create TenantVertical entity**

```typescript
import {
  Entity,
  Property,
  ManyToOne,
  PrimaryKeyProp,
  Index,
  type Rel,
} from '@mikro-orm/core';
import { Tenant } from './Tenant.js';
import { Vertical } from './Vertical.js';

/**
 * TenantVertical: Links a tenant to enabled verticals.
 *
 * When a tenant enables a vertical:
 * - They gain access to vertical-specific workspaces
 * - They can override default config
 * - Rules for that vertical apply to their products
 */
@Entity({ tableName: 'tenant_verticals' })
export class TenantVertical {
  [PrimaryKeyProp]?: ['tenant', 'vertical'];

  @ManyToOne(() => Tenant, { primary: true, onDelete: 'cascade' })
  @Index({ name: 'idx_tenant_vertical_tenant' })
  tenant!: Rel<Tenant>;

  @ManyToOne(() => Vertical, { primary: true })
  @Index({ name: 'idx_tenant_vertical_vertical' })
  vertical!: Rel<Vertical>;

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  enabledAt: Date = new Date();

  /**
   * Tenant-specific config overrides.
   * Merged with vertical.defaultConfig.
   */
  @Property({ type: 'jsonb', nullable: true })
  config?: Record<string, unknown> | null;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/TenantVertical.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/TenantVertical.ts packages/database/src/entities/TenantVertical.test.ts
git commit -m "feat(database): add TenantVertical for vertical enablement

TenantVertical links tenants to enabled verticals:
- Composite PK: (tenant_id, vertical_id)
- Config overrides vertical defaults
- enabledAt tracks when vertical was enabled

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create RequirementHandler Entity

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/RequirementHandler.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/RequirementHandler.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Vertical } from './Vertical.js';
import { RequirementHandler, HandlerType } from './RequirementHandler.js';

describe('RequirementHandler Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testVertical: Vertical;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(RequirementHandler, {});
    await em.nativeDelete(Vertical, {});

    testVertical = em.create(Vertical, {
      id: 'cosmetics',
      name: 'Cosmetics',
      version: '1.0.0',
      gsrPersonas: ['cosing'],
    });
    await em.persistAndFlush(testVertical);
    em.clear();
  });

  describe('handler registration', () => {
    it('should_create_handler_with_module_path', async () => {
      testVertical = await em.findOneOrFail(Vertical, { id: 'cosmetics' });

      const handler = em.create(RequirementHandler, {
        id: 'cosmetics:concentration-limit',
        vertical: testVertical,
        code: 'concentration-limit',
        name: 'Concentration Limit Handler',
        handlerType: HandlerType.SUBSTANCE_RESTRICTION,
        requirementTypes: ['CONCENTRATION_LIMIT', 'THRESHOLD_CHECK'],
        modulePath: '@eurocomply/handlers/concentration-limit',
        version: '1.0.0',
      });

      await em.persistAndFlush(handler);

      expect(handler.id).toBe('cosmetics:concentration-limit');
      expect(handler.requirementTypes).toContain('CONCENTRATION_LIMIT');
    });

    it('should_store_config_schema_for_validation', async () => {
      testVertical = await em.findOneOrFail(Vertical, { id: 'cosmetics' });

      const handler = em.create(RequirementHandler, {
        id: 'cosmetics:cmr-check',
        vertical: testVertical,
        code: 'cmr-check',
        name: 'CMR Substance Check',
        handlerType: HandlerType.SUBSTANCE_PROHIBITION,
        requirementTypes: ['CMR_CHECK'],
        modulePath: '@eurocomply/handlers/cmr-check',
        version: '1.0.0',
        configSchema: {
          type: 'object',
          properties: {
            categories: { type: 'array', items: { type: 'string' } },
            exemptions: { type: 'array', items: { type: 'string' } },
          },
        },
      });

      await em.persistAndFlush(handler);

      const loaded = await em.findOneOrFail(RequirementHandler, { id: 'cosmetics:cmr-check' });
      expect(loaded.configSchema?.type).toBe('object');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/RequirementHandler.test.ts`
Expected: FAIL

**Step 3: Create RequirementHandler entity**

```typescript
import {
  Entity,
  Property,
  PrimaryKey,
  ManyToOne,
  Enum,
  Unique,
  Index,
  type Rel,
} from '@mikro-orm/core';
import { Vertical } from './Vertical.js';

export enum HandlerType {
  SUBSTANCE_PROHIBITION = 'SUBSTANCE_PROHIBITION',
  SUBSTANCE_RESTRICTION = 'SUBSTANCE_RESTRICTION',
  CONCENTRATION_LIMIT = 'CONCENTRATION_LIMIT',
  LABELING_REQUIREMENT = 'LABELING_REQUIREMENT',
  DOCUMENTATION_REQUIREMENT = 'DOCUMENTATION_REQUIREMENT',
  CMR_CHECK = 'CMR_CHECK',
  CUSTOM = 'CUSTOM',
}

/**
 * RequirementHandler: The "instruction set" of the Compliance Virtual Machine.
 *
 * Handlers are the CODE that executes rules (DATA).
 * Each handler knows how to evaluate a specific type of requirement.
 *
 * Example handlers:
 * - concentration-limit: Check if substance concentration exceeds threshold
 * - cmr-check: Check if product contains CMR substances
 * - labeling-check: Verify required label information is present
 */
@Entity({ tableName: 'requirement_handlers' })
@Unique({ properties: ['vertical', 'code'], name: 'uq_handler_vertical' })
export class RequirementHandler {
  /**
   * Composite ID: {vertical_id}:{handler_code}
   */
  @PrimaryKey({ type: 'varchar', length: 100 })
  id!: string;

  @ManyToOne(() => Vertical, { onDelete: 'cascade' })
  @Index({ name: 'idx_handler_vertical' })
  vertical!: Rel<Vertical>;

  @Property({ type: 'varchar', length: 50 })
  code!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string | null;

  @Enum(() => HandlerType)
  handlerType!: HandlerType;

  /**
   * JSON Schema for handler configuration.
   */
  @Property({ type: 'jsonb', nullable: true })
  configSchema?: Record<string, unknown> | null;

  /**
   * Default configuration for rules using this handler.
   */
  @Property({ type: 'jsonb', nullable: true })
  defaultConfig?: Record<string, unknown> | null;

  /**
   * Rule types this handler can evaluate.
   * Rules reference handlers via this mapping.
   */
  @Property({ type: 'text[]' })
  @Index({ name: 'idx_handler_types', type: 'gin' })
  requirementTypes!: string[];

  /**
   * Module path for dynamic import.
   * e.g., '@eurocomply/handlers/concentration-limit'
   */
  @Property({ type: 'text' })
  modulePath!: string;

  @Property({ type: 'varchar', length: 20 })
  version!: string;

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/RequirementHandler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/RequirementHandler.ts packages/database/src/entities/RequirementHandler.test.ts
git commit -m "feat(database): add RequirementHandler for compliance VM instruction set

RequirementHandler is the CODE that executes rules (DATA):
- handlerType: What kind of requirement it evaluates
- requirementTypes: Which rule types it can handle
- modulePath: Where to import the handler from
- configSchema: JSON Schema for validation

Handlers are the 'instruction set' of the Compliance Virtual Machine.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create Regulation and Rule Entities

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Regulation.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Rule.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Rule.test.ts`

**Step 1: Write failing test for Rule entity**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Vertical } from './Vertical.js';
import { RequirementHandler, HandlerType } from './RequirementHandler.js';
import { Regulation } from './Regulation.js';
import { Rule, RuleType, RuleSeverity } from './Rule.js';

describe('Rule Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testVertical: Vertical;
  let testHandler: RequirementHandler;
  let testRegulation: Regulation;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(Rule, {});
    await em.nativeDelete(RequirementHandler, {});
    await em.nativeDelete(Regulation, {});
    await em.nativeDelete(Vertical, {});

    testVertical = em.create(Vertical, {
      id: 'cosmetics',
      name: 'Cosmetics',
      version: '1.0.0',
      gsrPersonas: ['cosing'],
    });
    await em.persistAndFlush(testVertical);

    testHandler = em.create(RequirementHandler, {
      id: 'cosmetics:concentration-limit',
      vertical: testVertical,
      code: 'concentration-limit',
      name: 'Concentration Limit Handler',
      handlerType: HandlerType.CONCENTRATION_LIMIT,
      requirementTypes: ['CONCENTRATION_LIMIT'],
      modulePath: '@eurocomply/handlers/concentration-limit',
      version: '1.0.0',
    });
    await em.persistAndFlush(testHandler);

    testRegulation = em.create(Regulation, {
      code: 'EC-1223-2009',
      name: 'EU Cosmetics Regulation',
      jurisdiction: 'EU',
      version: '2023',
      effectiveDate: new Date('2009-12-22'),
      verticalIds: ['cosmetics'],
    });
    await em.persistAndFlush(testRegulation);

    em.clear();
  });

  describe('rule creation', () => {
    it('should_create_rule_with_logic_json', async () => {
      testVertical = await em.findOneOrFail(Vertical, { id: 'cosmetics' });
      testHandler = await em.findOneOrFail(RequirementHandler, { id: 'cosmetics:concentration-limit' });
      testRegulation = await em.findOneOrFail(Regulation, { code: 'EC-1223-2009' });

      const rule = em.create(Rule, {
        code: 'COSING-ANNEX-III-001',
        name: 'Ethanol concentration limit in leave-on products',
        vertical: testVertical,
        regulation: testRegulation,
        handler: testHandler,
        ruleType: RuleType.CONCENTRATION_LIMIT,
        severity: RuleSeverity.BLOCKER,
        logic: {
          type: 'CONCENTRATION_LIMIT',
          target: {
            match_by: 'cas_number',
            value: '64-17-5',
          },
          threshold: {
            operator: '<=',
            value: 10.0,
            unit: 'PERCENT',
          },
          conditions: {
            product_type: ['leave-on'],
          },
        },
        appliesTo: {
          categories: {
            include: ['cosmetics.skincare.*'],
          },
          markets: ['EU'],
        },
        version: '1.0.0',
        effectiveFrom: new Date('2023-01-01'),
      });

      await em.persistAndFlush(rule);

      expect(rule.id).toBeDefined();
      expect(rule.logic.type).toBe('CONCENTRATION_LIMIT');
    });

    it('should_enforce_unique_code_constraint', async () => {
      testVertical = await em.findOneOrFail(Vertical, { id: 'cosmetics' });
      testHandler = await em.findOneOrFail(RequirementHandler, { id: 'cosmetics:concentration-limit' });
      testRegulation = await em.findOneOrFail(Regulation, { code: 'EC-1223-2009' });

      const rule1 = em.create(Rule, {
        code: 'SAME-CODE',
        name: 'Rule 1',
        vertical: testVertical,
        regulation: testRegulation,
        handler: testHandler,
        ruleType: RuleType.CONCENTRATION_LIMIT,
        severity: RuleSeverity.WARNING,
        logic: {},
        appliesTo: {},
        version: '1.0.0',
        effectiveFrom: new Date(),
      });
      await em.persistAndFlush(rule1);

      const rule2 = em.create(Rule, {
        code: 'SAME-CODE',
        name: 'Rule 2',
        vertical: testVertical,
        regulation: testRegulation,
        handler: testHandler,
        ruleType: RuleType.CONCENTRATION_LIMIT,
        severity: RuleSeverity.WARNING,
        logic: {},
        appliesTo: {},
        version: '1.0.0',
        effectiveFrom: new Date(),
      });

      await expect(em.persistAndFlush(rule2)).rejects.toThrow(/unique|duplicate/i);
    });

    it('should_support_gsr_version_pinning', async () => {
      testVertical = await em.findOneOrFail(Vertical, { id: 'cosmetics' });
      testHandler = await em.findOneOrFail(RequirementHandler, { id: 'cosmetics:concentration-limit' });
      testRegulation = await em.findOneOrFail(Regulation, { code: 'EC-1223-2009' });

      const rule = em.create(Rule, {
        code: 'PINNED-RULE',
        name: 'Rule with pinned GSR version',
        vertical: testVertical,
        regulation: testRegulation,
        handler: testHandler,
        ruleType: RuleType.SUBSTANCE_PROHIBITION,
        severity: RuleSeverity.BLOCKER,
        logic: {
          type: 'SUBSTANCE_PROHIBITION',
          target: {
            match_by: 'substance_id',
            value: 'uuid-here',
          },
          resolved_substance_ids: ['uuid1', 'uuid2'], // Injected by seeder
        },
        appliesTo: {},
        version: '1.0.0',
        effectiveFrom: new Date(),
        gsrVersion: '2026.02.03', // Pinned to specific GSR version
      });

      await em.persistAndFlush(rule);

      expect(rule.gsrVersion).toBe('2026.02.03');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/Rule.test.ts`
Expected: FAIL

**Step 3: Create Regulation entity**

```typescript
import {
  Entity,
  Property,
  PrimaryKey,
  Index,
  Unique,
  OneToMany,
  Collection,
} from '@mikro-orm/core';
import { Rule } from './Rule.js';

/**
 * Regulation: A legal regulation that defines rules.
 *
 * Examples:
 * - EC 1223/2009 (EU Cosmetics Regulation)
 * - REACH (EU Chemicals Registration)
 * - RoHS (Restriction of Hazardous Substances)
 */
@Entity({ tableName: 'regulations' })
export class Regulation {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  /**
   * Short code for the regulation (e.g., 'EC-1223-2009', 'REACH', 'ROHS').
   */
  @Property({ type: 'varchar', length: 50 })
  @Unique({ name: 'uq_regulation_code' })
  @Index({ name: 'idx_regulation_code' })
  code!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'varchar', length: 100, nullable: true })
  shortName?: string | null;

  @Property({ type: 'varchar', length: 20 })
  jurisdiction!: string;

  @Property({ type: 'varchar', length: 100, nullable: true })
  regulatoryBody?: string | null;

  @Property({ type: 'text', nullable: true })
  officialReference?: string | null;

  @Property({ type: 'text', nullable: true })
  officialUrl?: string | null;

  @Property({ type: 'varchar', length: 20 })
  version!: string;

  @Property({ type: 'date' })
  effectiveDate!: Date;

  @Property({ type: 'date', nullable: true })
  sunsetDate?: Date | null;

  /**
   * Which verticals this regulation applies to.
   */
  @Property({ type: 'text[]' })
  @Index({ name: 'idx_regulation_verticals', type: 'gin' })
  verticalIds!: string[];

  @Property({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string = 'ACTIVE';

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @OneToMany(() => Rule, (rule) => rule.regulation)
  rules = new Collection<Rule>(this);
}
```

**Step 4: Create Rule entity**

```typescript
import {
  Entity,
  Property,
  PrimaryKey,
  ManyToOne,
  Enum,
  Index,
  Unique,
  type Rel,
} from '@mikro-orm/core';
import { Vertical } from './Vertical.js';
import { Regulation } from './Regulation.js';
import { RequirementHandler } from './RequirementHandler.js';

export enum RuleType {
  SUBSTANCE_PROHIBITION = 'SUBSTANCE_PROHIBITION',
  SUBSTANCE_RESTRICTION = 'SUBSTANCE_RESTRICTION',
  CONCENTRATION_LIMIT = 'CONCENTRATION_LIMIT',
  LABELING_REQUIREMENT = 'LABELING_REQUIREMENT',
  DOCUMENTATION_REQUIREMENT = 'DOCUMENTATION_REQUIREMENT',
  CMR_CHECK = 'CMR_CHECK',
}

export enum RuleSeverity {
  BLOCKER = 'BLOCKER',     // Cannot proceed, hard stop
  WARNING = 'WARNING',     // Alert but can continue
  INFO = 'INFO',           // Informational only
}

export enum RuleStatus {
  ACTIVE = 'ACTIVE',
  DRAFT = 'DRAFT',
  SUPERSEDED = 'SUPERSEDED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Rule: The "program" in the Compliance Virtual Machine.
 *
 * Rules are DATA that handlers (CODE) execute.
 * The `logic` field contains a JSON DSL that defines:
 * - What to check (target substance, property)
 * - Conditions (thresholds, categories, markets)
 * - Expected values
 *
 * Seeders "compile" human-readable rule definitions into this format,
 * using the Identity Ladder to resolve substance references.
 */
@Entity({ tableName: 'rules' })
export class Rule {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  /**
   * Unique code for the rule (e.g., 'COSING-ANNEX-III-001').
   */
  @Property({ type: 'varchar', length: 100 })
  @Unique({ name: 'uq_rule_code' })
  @Index({ name: 'idx_rule_code' })
  code!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string | null;

  @ManyToOne(() => Vertical)
  @Index({ name: 'idx_rule_vertical' })
  vertical!: Rel<Vertical>;

  @ManyToOne(() => Regulation)
  @Index({ name: 'idx_rule_regulation' })
  regulation!: Rel<Regulation>;

  @ManyToOne(() => RequirementHandler)
  @Index({ name: 'idx_rule_handler' })
  handler!: Rel<RequirementHandler>;

  @Enum(() => RuleType)
  @Index({ name: 'idx_rule_type' })
  ruleType!: RuleType;

  @Enum(() => RuleSeverity)
  severity!: RuleSeverity;

  /**
   * The rule logic in JSON DSL format.
   *
   * Example for concentration limit:
   * {
   *   "type": "CONCENTRATION_LIMIT",
   *   "target": { "match_by": "cas_number", "value": "64-17-5" },
   *   "threshold": { "operator": "<=", "value": 10, "unit": "PERCENT" },
   *   "conditions": { "product_type": ["leave-on"] },
   *   "resolved_substance_ids": ["uuid1"]  // Injected by seeder
   * }
   */
  @Property({ type: 'jsonb' })
  @Index({ name: 'idx_rule_logic', type: 'gin' })
  logic!: Record<string, unknown>;

  /**
   * Where this rule applies.
   *
   * Example:
   * {
   *   "categories": { "include": ["cosmetics.*"], "exclude": ["cosmetics.professional"] },
   *   "markets": ["EU", "UK"],
   *   "product_types": ["FINISHED_GOOD"]
   * }
   */
  @Property({ type: 'jsonb' })
  @Index({ name: 'idx_rule_applies', type: 'gin' })
  appliesTo!: Record<string, unknown>;

  @Property({ type: 'text', nullable: true })
  legalReference?: string | null;

  @Property({ type: 'text', nullable: true })
  legalText?: string | null;

  @Property({ type: 'varchar', length: 20 })
  version!: string;

  @Property({ type: 'date' })
  effectiveFrom!: Date;

  @Property({ type: 'date', nullable: true })
  effectiveUntil?: Date | null;

  @ManyToOne(() => Rule, { nullable: true })
  supersededBy?: Rel<Rule> | null;

  /**
   * GSR version this rule was compiled against.
   * Allows rebuilding resolved_substance_ids if GSR updates.
   */
  @Property({ type: 'varchar', length: 20, nullable: true })
  gsrVersion?: string | null;

  @Enum(() => RuleStatus)
  @Index({ name: 'idx_rule_status' })
  status: RuleStatus = RuleStatus.ACTIVE;

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/Rule.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/entities/Regulation.ts packages/database/src/entities/Rule.ts packages/database/src/entities/Rule.test.ts
git commit -m "feat(database): add Regulation and Rule entities

Regulation defines legal sources (EC-1223-2009, REACH, RoHS).

Rule is the 'program' in the Compliance Virtual Machine:
- logic: JSON DSL defining what to check
- appliesTo: Where the rule applies
- handler: Which handler executes this rule
- gsrVersion: For reproducibility with pinned GSR data

Rules are DATA. Handlers are CODE. Seeders are the COMPILER.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Update Entity Index with Plugin Entities

**Files:**
- Modify: `/root/Documents/EuroComply/packages/database/src/entities/index.ts`

**Step 1: Add all plugin entities to exports**

```typescript
// ... existing exports ...

// Plugin System - Verticals
export { Vertical } from './Vertical.js';
export { VerticalWorkspace } from './VerticalWorkspace.js';
export { TenantVertical } from './TenantVertical.js';

// Plugin System - Handlers & Rules
export { RequirementHandler, HandlerType } from './RequirementHandler.js';
export { Regulation } from './Regulation.js';
export { Rule, RuleType, RuleSeverity, RuleStatus } from './Rule.js';

// Update entity arrays
export const tenantEntities = [
  // ... existing entities ...
  Vertical,
  VerticalWorkspace,
  TenantVertical,
  RequirementHandler,
  Regulation,
  Rule,
];
```

**Step 2: Commit**

```bash
git add packages/database/src/entities/index.ts
git commit -m "chore(database): add plugin entities to exports

Exports: Vertical, VerticalWorkspace, TenantVertical,
RequirementHandler, Regulation, Rule

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Segment 05 Completion Checklist

- [ ] Vertical entity for industry plugins
- [ ] VerticalWorkspace for workspace definitions
- [ ] TenantVertical for tenant vertical enablement
- [ ] RequirementHandler as the "instruction set"
- [ ] Regulation for legal sources
- [ ] Rule as the "program" with JSON DSL
- [ ] All tests pass
- [ ] All commits follow CLAUDE.md format

---

## Next Segment

Proceed to **Segment 06: AI Infrastructure**

File: `docs/plans/2026-02-02-v2-implementation-plan-06-ai-infrastructure.md`
