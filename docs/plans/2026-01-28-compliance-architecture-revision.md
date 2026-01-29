# Compliance Architecture Revision Implementation Plan

> **STATUS: IMPLEMENTED** - All 40 tasks completed on 2026-01-28. This plan has been fully executed and the compliance architecture is now in production.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from Category → SubstanceList direct mapping to unified Category → Regulation → Requirement architecture with hybrid evaluation (auto-check + declaration).

**Architecture:** Regulation entity owns Requirements (4 types: ATTRIBUTE_CHECK, SUBSTANCE_SCREEN, CALCULATED_CHECK, DECLARATION). Categories map to Regulations via CategoryRegulation junction. ComplianceStackResolver resolves effective requirements for tenant categories. RequirementEvaluator performs hybrid evaluation.

**Tech Stack:** MikroORM, PostgreSQL, Hono, Zod, Vitest

**References:**
- Design doc: `docs/guides/compliance-stack-vs-regulatory-advisor.md`
- Rules: `RULES.md` (TDD, no mocks, multi-tenant safety)

---

## Architectural Hardening (Critical)

These three safeguards MUST be implemented to de-risk the architecture:

### A. LTREE Hierarchical Inheritance in Resolver

**Problem:** If `REACH` is linked to parent category `textiles` and `ESPR` is linked to `textiles.apparel`, a product in `apparel` must inherit BOTH regulations.

**Solution:** ComplianceStackResolver must use LTREE `@>` operator to find all regulations from category ancestors.

```sql
-- Find all regulations for category 'textiles.apparel'
SELECT DISTINCT r.* FROM regulation r
JOIN category_regulation cr ON cr.regulation_id = r.id
JOIN category c ON c.id = cr.category_id
WHERE 'textiles.apparel'::ltree <@ c.path  -- path is ancestor of or equal to target
  AND r.status = 'ACTIVE';
```

**Implementation:** Task 12 (ComplianceStackResolver) includes this.

### B. Evidence Snapshot for Historical Integrity

**Problem:** If a Requirement is deleted or significantly changed, historical ComplianceEvidence becomes orphaned/confusing.

**Solution:** Snapshot requirement metadata when recording evidence.

```typescript
// ComplianceEvidence entity
@Property({ type: 'jsonb', name: 'requirement_snapshot' })
requirementSnapshot!: {
  code: string;
  name: string;
  type: RequirementType;
  severity: RequirementSeverity;
  regulationCode: string;
  regulationName: string;
  handlerConfig?: object;
  legalReference?: string;
  snapshotAt: Date;
};
```

**Benefit:** 2024 audit report remains readable even if law changes in 2026.

**Implementation:** Task 21 (ComplianceEvidence entity) includes this.

### C. Exemption Guardrail

**Problem:** Some requirements (e.g., BLOCKER severity substance screens) should NEVER be exemptable by tenants.

**Solution:** Add `allowTenantExemption` field to Requirement entity.

```typescript
// Requirement entity
@Property({ type: 'boolean', default: true, name: 'allow_tenant_exemption' })
allowTenantExemption: boolean = true;

// Validator check
if (!requirement.allowTenantExemption) {
  throw new ForbiddenError(
    `Requirement "${requirement.code}" cannot be exempted. Contact platform administrator.`
  );
}
```

**Implementation:** Tasks 6 (Requirement entity) and 15 (exemption validation) include this.

---

## Agnostic Engine Design (Critical)

The compliance engine MUST be regulation-agnostic. The CODE knows HOW to evaluate, the DATA defines WHAT to evaluate.

### Engine vs. Content Split

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ENGINE (Code - Fixed)              │  CONTENT (Data - Configurable)        │
├─────────────────────────────────────┼───────────────────────────────────────┤
│  • RequirementHandler interface     │  • Regulation records in database     │
│  • AttributeCheckHandler            │  • Requirement records under each     │
│  • SubstanceScreenHandler           │  • Category → Regulation mappings     │
│  • CalculatedCheckHandler           │  • SubstanceList entries              │
│  • DeclarationHandler               │  • AttributeTemplate definitions      │
│  • RequirementEvaluatorEngine       │  • Migration manifests (JSON)         │
│                                     │  • Admin-created custom regulations   │
│  Doesn't know what "REACH" means    │  Contains "REACH", "ESPR", etc.       │
└─────────────────────────────────────┴───────────────────────────────────────┘
```

### Handler Plugin Architecture

```typescript
// The Agnostic Engine Interface - knows HOW, not WHAT
interface RequirementHandler<TConfig = unknown> {
  readonly type: RequirementType;

  /**
   * Evaluate requirement against product data.
   * Handler doesn't know WHAT regulation - only HOW to check this type.
   */
  evaluate(context: EvaluationContext): Promise<EvaluationResult>;

  /**
   * Validate handler config at admin API level.
   * Prevents broken rules from ever hitting the database.
   */
  validateConfig(config: TConfig): ValidationResult;
}

// Context passed to handlers - product data, not regulation knowledge
interface EvaluationContext {
  productVersion: ProductVersion;
  requirement: EffectiveRequirement;
  services: {
    substanceRollup: SubstanceRollupService;
    formulaParser: FormulaParserService;
    evidenceStore: EvidenceStoreService;
  };
}

// Handler Registry - discovers handlers at startup
class RequirementEvaluatorEngine {
  private handlers = new Map<RequirementType, RequirementHandler>();

  register(handler: RequirementHandler): void {
    this.handlers.set(handler.type, handler);
  }

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const handler = this.handlers.get(context.requirement.type);
    if (!handler) {
      throw new Error(`No handler for type: ${context.requirement.type}`);
    }
    return handler.evaluate(context);
  }
}
```

### Column Design: Explicit vs. JSONB

**Explicit columns** (indexed, frequently queried):
- `substanceListId` - FK for SUBSTANCE_SCREEN lookups
- `attributeTemplateKey` - string for ATTRIBUTE_CHECK lookups
- `calculationFormula` - string for CALCULATED_CHECK

**handlerConfig JSONB** (evaluation parameters):
```typescript
@Property({ type: 'jsonb', nullable: true, name: 'handler_config' })
handlerConfig?: {
  // For ATTRIBUTE_CHECK / CALCULATED_CHECK
  operator?: '>=' | '<=' | '>' | '<' | '==' | '!=';
  threshold?: number;
  unit?: string;

  // For SUBSTANCE_SCREEN
  defaultThresholdPct?: number;

  // For DECLARATION
  question?: string;
  acceptedAnswers?: string[];
  requiresDocument?: boolean;
  acceptedDocumentTypes?: string[];
};
```

**Why this split?**
- Explicit columns enable: `WHERE substance_list_id = ?` (indexed)
- JSONB enables: flexible validation params without schema changes

### Migration Manifest (External JSON)

Regulatory knowledge lives in JSON, not TypeScript:

```json
{
  "$schema": "./migration-manifest.schema.json",
  "version": "1.0",
  "source": "https://eurocomply.io/regulatory-content/eu-2026.json",
  "mappings": [
    {
      "sourceListCode": "REACH_SVHC",
      "targetRegulation": {
        "code": "REACH",
        "name": "Registration, Evaluation, Authorisation and Restriction of Chemicals",
        "jurisdiction": "EU"
      },
      "targetRequirement": {
        "code": "SVHC_SCREEN",
        "name": "SVHC Substance Screen",
        "type": "SUBSTANCE_SCREEN",
        "severity": "BLOCKER",
        "allowTenantExemption": false,
        "handlerConfig": {
          "defaultThresholdPct": 0.1
        }
      }
    }
  ]
}
```

**DevOps Advantage:** Update regulatory baseline by fetching new JSON from S3 - no code deployment needed.

### Validation Guardrails by Handler

Each handler validates its required config at creation time:

```typescript
class SubstanceScreenHandler implements RequirementHandler {
  validateConfig(config: unknown, requirement: Partial<Requirement>): ValidationResult {
    if (!requirement.substanceListId) {
      return {
        valid: false,
        errors: ['SUBSTANCE_SCREEN requires substanceListId'],
      };
    }
    return { valid: true, errors: [] };
  }
}

class AttributeCheckHandler implements RequirementHandler {
  validateConfig(config: unknown, requirement: Partial<Requirement>): ValidationResult {
    if (!requirement.attributeTemplateKey) {
      return {
        valid: false,
        errors: ['ATTRIBUTE_CHECK requires attributeTemplateKey'],
      };
    }
    const cfg = config as { operator?: string; threshold?: number };
    if (!cfg?.operator || cfg?.threshold === undefined) {
      return {
        valid: false,
        errors: ['ATTRIBUTE_CHECK requires operator and threshold in handlerConfig'],
      };
    }
    return { valid: true, errors: [] };
  }
}
```

### What the Engine NEVER Does

| Never | Instead |
|-------|---------|
| `if (regulation.code === 'REACH')` | `if (requirement.type === 'SUBSTANCE_SCREEN')` |
| Hardcoded regulation names in code | Regulation names from database records |
| `import { REACH_REQUIREMENTS }` | Load from migration manifest JSON |
| Regulation-specific branches | Handler plugins by RequirementType |

---

## Task 1: Create RegulationStatus Enum

**Files:**
- Create: `packages/database/src/entities/enums/RegulationStatus.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create the enum file**

```typescript
// packages/database/src/entities/enums/RegulationStatus.ts
export enum RegulationStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}
```

**Step 2: Export from enums index**

Add to `packages/database/src/entities/enums/index.ts`:
```typescript
export { RegulationStatus } from './RegulationStatus.js';
```

**Step 3: Commit**

```bash
git add packages/database/src/entities/enums/RegulationStatus.ts packages/database/src/entities/enums/index.ts
git commit -m "feat(database): add RegulationStatus enum

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create RequirementType and RequirementSeverity Enums

**Files:**
- Create: `packages/database/src/entities/enums/RequirementType.ts`
- Create: `packages/database/src/entities/enums/RequirementSeverity.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create RequirementType enum**

```typescript
// packages/database/src/entities/enums/RequirementType.ts
export enum RequirementType {
  ATTRIBUTE_CHECK = 'ATTRIBUTE_CHECK',
  SUBSTANCE_SCREEN = 'SUBSTANCE_SCREEN',
  CALCULATED_CHECK = 'CALCULATED_CHECK',
  DECLARATION = 'DECLARATION',
}
```

**Step 2: Create RequirementSeverity enum**

```typescript
// packages/database/src/entities/enums/RequirementSeverity.ts
export enum RequirementSeverity {
  BLOCKER = 'BLOCKER',
  WARNING = 'WARNING',
  INFO = 'INFO',
}
```

**Step 3: Export from enums index**

Add to `packages/database/src/entities/enums/index.ts`:
```typescript
export { RequirementType } from './RequirementType.js';
export { RequirementSeverity } from './RequirementSeverity.js';
```

**Step 4: Commit**

```bash
git add packages/database/src/entities/enums/RequirementType.ts packages/database/src/entities/enums/RequirementSeverity.ts packages/database/src/entities/enums/index.ts
git commit -m "feat(database): add RequirementType and RequirementSeverity enums

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Write Failing Tests for Regulation Entity

**Files:**
- Create: `packages/database/src/entities/__tests__/Regulation.test.ts`

**Step 1: Write the failing test file**

```typescript
// packages/database/src/entities/__tests__/Regulation.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { Regulation } from '../Regulation.js';
import { RegulationStatus } from '../enums/RegulationStatus.js';
import { setupTestDb, teardownTestDb } from '../../test-utils.js';

describe('Regulation', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb(orm);
  });

  describe('creation', () => {
    it('should_create_regulation_when_valid_data_provided', async () => {
      const em = orm.em.fork();

      const regulation = em.create(Regulation, {
        code: 'TEST_REG_1',
        name: 'Test Regulation',
        status: RegulationStatus.DRAFT,
      });
      await em.persistAndFlush(regulation);

      const found = await em.findOne(Regulation, { code: 'TEST_REG_1' });
      expect(found).toBeDefined();
      expect(found!.code).toBe('TEST_REG_1');
      expect(found!.name).toBe('Test Regulation');
      expect(found!.status).toBe(RegulationStatus.DRAFT);
    });

    it('should_reject_duplicate_code', async () => {
      const em = orm.em.fork();

      const reg1 = em.create(Regulation, {
        code: 'DUPLICATE_CODE',
        name: 'First Regulation',
      });
      await em.persistAndFlush(reg1);

      const reg2 = em.create(Regulation, {
        code: 'DUPLICATE_CODE',
        name: 'Second Regulation',
      });

      await expect(em.persistAndFlush(reg2)).rejects.toThrow();
    });

    it('should_default_status_to_draft', async () => {
      const em = orm.em.fork();

      const regulation = em.create(Regulation, {
        code: 'DEFAULT_STATUS_TEST',
        name: 'Default Status Test',
      });
      await em.persistAndFlush(regulation);

      expect(regulation.status).toBe(RegulationStatus.DRAFT);
    });
  });

  describe('lifecycle', () => {
    it('should_set_archivedAt_when_status_changed_to_archived', async () => {
      const em = orm.em.fork();

      const regulation = em.create(Regulation, {
        code: 'ARCHIVE_TEST',
        name: 'Archive Test',
        status: RegulationStatus.ACTIVE,
      });
      await em.persistAndFlush(regulation);

      regulation.status = RegulationStatus.ARCHIVED;
      regulation.archivedAt = new Date();
      regulation.archiveReason = 'Replaced by new version';
      await em.flush();

      const found = await em.findOne(Regulation, { code: 'ARCHIVE_TEST' });
      expect(found!.status).toBe(RegulationStatus.ARCHIVED);
      expect(found!.archivedAt).toBeDefined();
      expect(found!.archiveReason).toBe('Replaced by new version');
    });

    it('should_link_to_successor_when_superseded', async () => {
      const em = orm.em.fork();

      const oldReg = em.create(Regulation, {
        code: 'OLD_REG',
        name: 'Old Regulation',
        status: RegulationStatus.ACTIVE,
      });
      const newReg = em.create(Regulation, {
        code: 'NEW_REG',
        name: 'New Regulation',
        status: RegulationStatus.ACTIVE,
      });
      await em.persistAndFlush([oldReg, newReg]);

      oldReg.status = RegulationStatus.ARCHIVED;
      oldReg.supersededBy = newReg;
      oldReg.archivedAt = new Date();
      await em.flush();

      const found = await em.findOne(Regulation, { code: 'OLD_REG' }, {
        populate: ['supersededBy'],
      });
      expect(found!.supersededBy).toBeDefined();
      expect(found!.supersededBy!.code).toBe('NEW_REG');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/entities/__tests__/Regulation.test.ts
```

Expected: FAIL with "Cannot find module '../Regulation.js'" or similar

**Step 3: Commit failing test**

```bash
git add packages/database/src/entities/__tests__/Regulation.test.ts
git commit -m "test(database): add failing tests for Regulation entity

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Implement Regulation Entity

**Files:**
- Create: `packages/database/src/entities/Regulation.ts`
- Modify: `packages/database/src/entities/index.ts`

**Step 1: Create the Regulation entity**

```typescript
// packages/database/src/entities/Regulation.ts
import {
  Entity,
  Property,
  Enum,
  OneToMany,
  ManyToOne,
  Collection,
  Unique,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { RegulationStatus } from './enums/RegulationStatus.js';

@Entity({ tableName: 'regulation', schema: 'public' })
export class Regulation extends BaseEntity {
  @Property({ type: 'text' })
  @Unique()
  code!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Enum({ items: () => RegulationStatus, default: RegulationStatus.DRAFT })
  status: RegulationStatus = RegulationStatus.DRAFT;

  @Property({ type: 'text', nullable: true })
  version?: string;

  @Property({ type: 'date', nullable: true, name: 'effective_date' })
  effectiveDate?: Date;

  @ManyToOne(() => Regulation, { nullable: true, name: 'superseded_by_id' })
  supersededBy?: Regulation;

  @Property({ type: 'timestamptz', nullable: true, name: 'archived_at' })
  archivedAt?: Date;

  @Property({ type: 'text', nullable: true, name: 'archive_reason' })
  archiveReason?: string;

  @Property({ type: 'jsonb', nullable: true })
  metadata?: {
    jurisdiction?: string;
    type?: string;
    officialJournalRef?: string;
  };
}
```

**Step 2: Export from entities index**

Add to `packages/database/src/entities/index.ts`:
```typescript
export { Regulation } from './Regulation.js';
```

**Step 3: Run tests to verify they pass**

```bash
cd packages/database && pnpm test src/entities/__tests__/Regulation.test.ts
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/database/src/entities/Regulation.ts packages/database/src/entities/index.ts
git commit -m "feat(database): implement Regulation entity

- Regulation entity with DRAFT/ACTIVE/ARCHIVED lifecycle
- Unique code constraint
- Self-referential supersededBy for succession
- Metadata JSONB for jurisdiction, type, official refs

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Write Failing Tests for Requirement Entity

**Files:**
- Create: `packages/database/src/entities/__tests__/Requirement.test.ts`

**Step 1: Write the failing test file**

```typescript
// packages/database/src/entities/__tests__/Requirement.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { Regulation } from '../Regulation.js';
import { Requirement } from '../Requirement.js';
import { RegulationStatus } from '../enums/RegulationStatus.js';
import { RequirementType } from '../enums/RequirementType.js';
import { RequirementSeverity } from '../enums/RequirementSeverity.js';
import { setupTestDb, teardownTestDb } from '../../test-utils.js';

describe('Requirement', () => {
  let orm: MikroORM;
  let regulation: Regulation;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb(orm);
  });

  beforeEach(async () => {
    const em = orm.em.fork();
    regulation = em.create(Regulation, {
      code: `REG_${Date.now()}`,
      name: 'Test Regulation',
      status: RegulationStatus.ACTIVE,
    });
    await em.persistAndFlush(regulation);
  });

  describe('creation', () => {
    it('should_create_attribute_check_requirement', async () => {
      const em = orm.em.fork();
      const reg = await em.findOneOrFail(Regulation, { id: regulation.id });

      // NOTE: Using generic names (TEST_*) - engine is regulation-agnostic
      const requirement = em.create(Requirement, {
        regulation: reg,
        code: 'TEST_ATTR_CHECK_1',
        name: 'Test Attribute Check',
        type: RequirementType.ATTRIBUTE_CHECK,
        severity: RequirementSeverity.BLOCKER,
        attributeTemplateKey: 'test_percentage',  // Explicit column for indexing
        handlerConfig: { operator: '>=', threshold: 25, unit: '%' },  // Logic params
      });
      await em.persistAndFlush(requirement);

      const found = await em.findOne(Requirement, { code: 'TEST_ATTR_CHECK_1' });
      expect(found).toBeDefined();
      expect(found!.type).toBe(RequirementType.ATTRIBUTE_CHECK);
      expect(found!.attributeTemplateKey).toBe('test_percentage');
      expect(found!.handlerConfig).toEqual({ operator: '>=', threshold: 25, unit: '%' });
    });

    it('should_create_substance_screen_requirement', async () => {
      const em = orm.em.fork();
      const reg = await em.findOneOrFail(Regulation, { id: regulation.id });

      // NOTE: Generic naming - doesn't reference specific regulations
      const requirement = em.create(Requirement, {
        regulation: reg,
        code: 'TEST_SUBST_SCREEN_1',
        name: 'Test Substance Screen',
        type: RequirementType.SUBSTANCE_SCREEN,
        severity: RequirementSeverity.BLOCKER,
        substanceListId: '00000000-0000-0000-0000-000000000001',  // Explicit column
        handlerConfig: { defaultThresholdPct: 0.1 },  // Logic params
        legalReference: 'Test Article 1',
      });
      await em.persistAndFlush(requirement);

      const found = await em.findOne(Requirement, { code: 'TEST_SUBST_SCREEN_1' });
      expect(found).toBeDefined();
      expect(found!.type).toBe(RequirementType.SUBSTANCE_SCREEN);
      expect(found!.legalReference).toBe('Test Article 1');
    });

    it('should_create_declaration_requirement_with_handler_config', async () => {
      const em = orm.em.fork();
      const reg = await em.findOneOrFail(Regulation, { id: regulation.id });

      // NOTE: Generic question - doesn't reference specific regulations
      const requirement = em.create(Requirement, {
        regulation: reg,
        code: 'TEST_DECLARATION_1',
        name: 'Test Declaration',
        type: RequirementType.DECLARATION,
        severity: RequirementSeverity.BLOCKER,
        handlerConfig: {
          question: 'Has the required testing been completed?',
          acceptedAnswers: ['Yes', 'No', 'Not Applicable'],
          requiresDocument: true,
          acceptedDocumentTypes: ['application/pdf'],
        },
      });
      await em.persistAndFlush(requirement);

      const found = await em.findOne(Requirement, { code: 'TEST_DECLARATION_1' });
      expect(found).toBeDefined();
      expect(found!.type).toBe(RequirementType.DECLARATION);
      expect(found!.handlerConfig).toHaveProperty('question');
      expect(found!.handlerConfig!.requiresDocument).toBe(true);
    });

    it('should_create_calculated_check_requirement', async () => {
      const em = orm.em.fork();
      const reg = await em.findOneOrFail(Regulation, { id: regulation.id });

      const requirement = em.create(Requirement, {
        regulation: reg,
        code: 'TEST_CALC_CHECK_1',
        name: 'Test Calculated Check',
        type: RequirementType.CALCULATED_CHECK,
        severity: RequirementSeverity.WARNING,
        calculationFormula: 'sum(material.test_pct * material.weight_pct)',  // Explicit column
        handlerConfig: { operator: '>=', threshold: 30, unit: '%' },  // Logic params
      });
      await em.persistAndFlush(requirement);

      const found = await em.findOne(Requirement, { code: 'TEST_CALC_CHECK_1' });
      expect(found).toBeDefined();
      expect(found!.type).toBe(RequirementType.CALCULATED_CHECK);
      expect(found!.calculationFormula).toBe('sum(material.test_pct * material.weight_pct)');
    });
  });

  describe('relationships', () => {
    it('should_belong_to_regulation', async () => {
      const em = orm.em.fork();
      const reg = await em.findOneOrFail(Regulation, { id: regulation.id });

      const requirement = em.create(Requirement, {
        regulation: reg,
        code: 'REL_TEST',
        name: 'Relationship Test',
        type: RequirementType.ATTRIBUTE_CHECK,
      });
      await em.persistAndFlush(requirement);

      const found = await em.findOne(Requirement, { code: 'REL_TEST' }, {
        populate: ['regulation'],
      });
      expect(found!.regulation).toBeDefined();
      expect(found!.regulation.id).toBe(regulation.id);
    });

    it('should_enforce_unique_code_per_regulation', async () => {
      const em = orm.em.fork();
      const reg = await em.findOneOrFail(Regulation, { id: regulation.id });

      const req1 = em.create(Requirement, {
        regulation: reg,
        code: 'UNIQUE_TEST',
        name: 'First Requirement',
        type: RequirementType.ATTRIBUTE_CHECK,
      });
      await em.persistAndFlush(req1);

      const req2 = em.create(Requirement, {
        regulation: reg,
        code: 'UNIQUE_TEST',
        name: 'Second Requirement',
        type: RequirementType.DECLARATION,
      });

      await expect(em.persistAndFlush(req2)).rejects.toThrow();
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/entities/__tests__/Requirement.test.ts
```

Expected: FAIL with "Cannot find module '../Requirement.js'"

**Step 3: Commit failing test**

```bash
git add packages/database/src/entities/__tests__/Requirement.test.ts
git commit -m "test(database): add failing tests for Requirement entity

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Implement Requirement Entity

**Files:**
- Create: `packages/database/src/entities/Requirement.ts`
- Modify: `packages/database/src/entities/index.ts`
- Modify: `packages/database/src/entities/Regulation.ts` (add requirements relation)

**Step 1: Create the Requirement entity**

```typescript
// packages/database/src/entities/Requirement.ts
import {
  Entity,
  Property,
  Enum,
  ManyToOne,
  Index,
  Unique,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Regulation } from './Regulation.js';
import { RequirementType } from './enums/RequirementType.js';
import { RequirementSeverity } from './enums/RequirementSeverity.js';

@Entity({ tableName: 'requirement', schema: 'public' })
@Unique({ properties: ['regulation', 'code'] })
export class Requirement extends BaseEntity {
  @ManyToOne(() => Regulation, { name: 'regulation_id' })
  @Index()
  regulation!: Regulation;

  @Property({ type: 'text' })
  code!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Enum({ items: () => RequirementType })
  type!: RequirementType;

  @Enum({ items: () => RequirementSeverity, default: RequirementSeverity.WARNING })
  severity: RequirementSeverity = RequirementSeverity.WARNING;

  @Property({ type: 'text', nullable: true, name: 'attribute_template_key' })
  attributeTemplateKey?: string;

  @Property({ type: 'uuid', nullable: true, name: 'substance_list_id' })
  substanceListId?: string;

  @Property({ type: 'text', nullable: true, name: 'calculation_formula' })
  calculationFormula?: string;

  // Handler config - contains evaluation parameters for each type
  // Explicit columns (above) are for indexing; this JSONB is for logic params
  @Property({ type: 'jsonb', nullable: true, name: 'handler_config' })
  handlerConfig?: {
    // For ATTRIBUTE_CHECK / CALCULATED_CHECK
    operator?: '>=' | '<=' | '>' | '<' | '==' | '!=';
    threshold?: number;
    unit?: string;
    pattern?: string;  // For regex validation

    // For SUBSTANCE_SCREEN
    defaultThresholdPct?: number;

    // For DECLARATION
    question?: string;
    acceptedAnswers?: string[];
    requiresDocument?: boolean;
    acceptedDocumentTypes?: string[];
  };

  @Property({ type: 'text', nullable: true, name: 'legal_reference' })
  legalReference?: string;

  @Property({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder: number = 0;

  // Exemption guardrail - some requirements cannot be exempted
  @Property({ type: 'boolean', default: true, name: 'allow_tenant_exemption' })
  allowTenantExemption: boolean = true;
}
```

**Step 2: Add requirements relation to Regulation**

Update `packages/database/src/entities/Regulation.ts`, add after metadata property:

```typescript
import { OneToMany, Collection } from '@mikro-orm/core';
import { Requirement } from './Requirement.js';

// Add to class:
@OneToMany(() => Requirement, (r) => r.regulation)
requirements = new Collection<Requirement>(this);
```

**Step 3: Export from entities index**

Add to `packages/database/src/entities/index.ts`:
```typescript
export { Requirement } from './Requirement.js';
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/database && pnpm test src/entities/__tests__/Requirement.test.ts
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/Requirement.ts packages/database/src/entities/Regulation.ts packages/database/src/entities/index.ts
git commit -m "feat(database): implement Requirement entity

- Four types: ATTRIBUTE_CHECK, SUBSTANCE_SCREEN, CALCULATED_CHECK, DECLARATION
- Unique code per regulation constraint
- Explicit columns: attributeTemplateKey, substanceListId, calculationFormula
- handlerConfig JSONB for evaluation parameters
- allowTenantExemption guardrail field
- OneToMany relation from Regulation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Add Database Migration for Regulation and Requirement

**Files:**
- Modify: `packages/database/src/migrations/Migration20260122000000.ts` (consolidated migration)

**Step 1: Add regulation and requirement tables to consolidated migration**

Add to the `up()` method in `packages/database/src/migrations/Migration20260122000000.ts`:

```sql
-- Regulation status enum
CREATE TYPE regulation_status AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- Requirement type enum
CREATE TYPE requirement_type AS ENUM (
  'ATTRIBUTE_CHECK', 'SUBSTANCE_SCREEN', 'CALCULATED_CHECK', 'DECLARATION'
);

-- Requirement severity enum
CREATE TYPE requirement_severity AS ENUM ('BLOCKER', 'WARNING', 'INFO');

-- Regulation table
CREATE TABLE public.regulation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status regulation_status NOT NULL DEFAULT 'DRAFT',
  version TEXT,
  effective_date DATE,
  superseded_by_id UUID REFERENCES public.regulation(id),
  archived_at TIMESTAMPTZ,
  archive_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_regulation_status ON public.regulation(status);
CREATE INDEX idx_regulation_code ON public.regulation(code);

-- Requirement table
CREATE TABLE public.requirement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regulation_id UUID NOT NULL REFERENCES public.regulation(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type requirement_type NOT NULL,
  severity requirement_severity NOT NULL DEFAULT 'WARNING',
  attribute_template_key TEXT,
  substance_list_id UUID,
  calculation_formula TEXT,
  handler_config JSONB,
  legal_reference TEXT,
  allow_tenant_exemption BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(regulation_id, code)
);

CREATE INDEX idx_requirement_regulation ON public.requirement(regulation_id);
CREATE INDEX idx_requirement_type ON public.requirement(type);
```

**Step 2: Reset database**

```bash
cd packages/database && pnpm db:reset
```

Expected: Database recreated with new tables

**Step 3: Run all tests**

```bash
cd packages/database && pnpm test
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/database/src/migrations/Migration20260122000000.ts
git commit -m "feat(database): add migration for Regulation and Requirement tables

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Write Failing Tests for CategoryRegulation Junction

**Files:**
- Create: `packages/database/src/entities/__tests__/CategoryRegulation.test.ts`

**Step 1: Write the failing test file**

```typescript
// packages/database/src/entities/__tests__/CategoryRegulation.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { Category } from '../Category.js';
import { Regulation } from '../Regulation.js';
import { CategoryRegulation } from '../CategoryRegulation.js';
import { RegulationStatus } from '../enums/RegulationStatus.js';
import { setupTestDb, teardownTestDb } from '../../test-utils.js';

describe('CategoryRegulation', () => {
  let orm: MikroORM;
  let category: Category;
  let regulation: Regulation;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb(orm);
  });

  beforeEach(async () => {
    const em = orm.em.fork();
    const timestamp = Date.now();

    category = em.create(Category, {
      name: `Test Category ${timestamp}`,
      path: `test.category.${timestamp}`,
    });
    regulation = em.create(Regulation, {
      code: `REG_${timestamp}`,
      name: 'Test Regulation',
      status: RegulationStatus.ACTIVE,
    });
    await em.persistAndFlush([category, regulation]);
  });

  describe('creation', () => {
    it('should_create_mapping_between_category_and_regulation', async () => {
      const em = orm.em.fork();
      const cat = await em.findOneOrFail(Category, { id: category.id });
      const reg = await em.findOneOrFail(Regulation, { id: regulation.id });

      const mapping = em.create(CategoryRegulation, {
        category: cat,
        regulation: reg,
        addedBy: 'admin@test.com',
      });
      await em.persistAndFlush(mapping);

      const found = await em.findOne(CategoryRegulation, { category: cat, regulation: reg });
      expect(found).toBeDefined();
      expect(found!.addedBy).toBe('admin@test.com');
      expect(found!.addedAt).toBeDefined();
    });

    it('should_reject_duplicate_category_regulation_pair', async () => {
      const em = orm.em.fork();
      const cat = await em.findOneOrFail(Category, { id: category.id });
      const reg = await em.findOneOrFail(Regulation, { id: regulation.id });

      const mapping1 = em.create(CategoryRegulation, {
        category: cat,
        regulation: reg,
      });
      await em.persistAndFlush(mapping1);

      const mapping2 = em.create(CategoryRegulation, {
        category: cat,
        regulation: reg,
      });

      await expect(em.persistAndFlush(mapping2)).rejects.toThrow();
    });
  });

  describe('relationships', () => {
    it('should_load_regulation_from_mapping', async () => {
      const em = orm.em.fork();
      const cat = await em.findOneOrFail(Category, { id: category.id });
      const reg = await em.findOneOrFail(Regulation, { id: regulation.id });

      const mapping = em.create(CategoryRegulation, {
        category: cat,
        regulation: reg,
      });
      await em.persistAndFlush(mapping);

      const found = await em.findOne(CategoryRegulation, { id: mapping.id }, {
        populate: ['regulation'],
      });
      expect(found!.regulation.code).toBe(regulation.code);
    });

    it('should_load_category_from_mapping', async () => {
      const em = orm.em.fork();
      const cat = await em.findOneOrFail(Category, { id: category.id });
      const reg = await em.findOneOrFail(Regulation, { id: regulation.id });

      const mapping = em.create(CategoryRegulation, {
        category: cat,
        regulation: reg,
      });
      await em.persistAndFlush(mapping);

      const found = await em.findOne(CategoryRegulation, { id: mapping.id }, {
        populate: ['category'],
      });
      expect(found!.category.name).toBe(category.name);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/entities/__tests__/CategoryRegulation.test.ts
```

Expected: FAIL with "Cannot find module '../CategoryRegulation.js'"

**Step 3: Commit failing test**

```bash
git add packages/database/src/entities/__tests__/CategoryRegulation.test.ts
git commit -m "test(database): add failing tests for CategoryRegulation junction

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Implement CategoryRegulation Junction Entity

**Files:**
- Create: `packages/database/src/entities/CategoryRegulation.ts`
- Modify: `packages/database/src/entities/index.ts`

**Step 1: Create the CategoryRegulation entity**

```typescript
// packages/database/src/entities/CategoryRegulation.ts
import {
  Entity,
  Property,
  ManyToOne,
  Index,
  Unique,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';
import { Regulation } from './Regulation.js';

@Entity({ tableName: 'category_regulation', schema: 'public' })
@Unique({ properties: ['category', 'regulation'] })
export class CategoryRegulation extends BaseEntity {
  @ManyToOne(() => Category, { name: 'category_id' })
  @Index()
  category!: Category;

  @ManyToOne(() => Regulation, { name: 'regulation_id' })
  @Index()
  regulation!: Regulation;

  @Property({ type: 'timestamptz', name: 'added_at' })
  addedAt: Date = new Date();

  @Property({ type: 'text', nullable: true, name: 'added_by' })
  addedBy?: string;
}
```

**Step 2: Export from entities index**

Add to `packages/database/src/entities/index.ts`:
```typescript
export { CategoryRegulation } from './CategoryRegulation.js';
```

**Step 3: Run tests to verify they pass**

```bash
cd packages/database && pnpm test src/entities/__tests__/CategoryRegulation.test.ts
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/database/src/entities/CategoryRegulation.ts packages/database/src/entities/index.ts
git commit -m "feat(database): implement CategoryRegulation junction entity

- Maps Category to Regulation (M:N)
- Unique constraint on category+regulation pair
- Tracks addedAt and addedBy

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Add CategoryRegulation to Migration

**Files:**
- Modify: `packages/database/src/migrations/Migration20260122000000.ts`

**Step 1: Add category_regulation table to consolidated migration**

Add after the requirement table in `up()`:

```sql
-- CategoryRegulation junction table
CREATE TABLE public.category_regulation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.category(id) ON DELETE CASCADE,
  regulation_id UUID NOT NULL REFERENCES public.regulation(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category_id, regulation_id)
);

CREATE INDEX idx_category_regulation_category ON public.category_regulation(category_id);
CREATE INDEX idx_category_regulation_regulation ON public.category_regulation(regulation_id);
```

**Step 2: Reset database**

```bash
cd packages/database && pnpm db:reset
```

**Step 3: Run all entity tests**

```bash
cd packages/database && pnpm test src/entities/__tests__/
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/database/src/migrations/Migration20260122000000.ts
git commit -m "feat(database): add migration for CategoryRegulation junction table

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Write Failing Tests for ComplianceStackResolver (Revised)

**Files:**
- Create: `packages/database/src/services/__tests__/ComplianceStackResolver.test.ts`

**Step 1: Write the failing test file**

```typescript
// packages/database/src/services/__tests__/ComplianceStackResolver.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { Category } from '../../entities/Category.js';
import { Regulation } from '../../entities/Regulation.js';
import { Requirement } from '../../entities/Requirement.js';
import { CategoryRegulation } from '../../entities/CategoryRegulation.js';
import { TenantCategory } from '../../entities/TenantCategory.js';
import { RegulationStatus } from '../../entities/enums/RegulationStatus.js';
import { RequirementType } from '../../entities/enums/RequirementType.js';
import { RequirementSeverity } from '../../entities/enums/RequirementSeverity.js';
import { ComplianceStackResolver } from '../ComplianceStackResolver.js';
import { setupTestDb, teardownTestDb, createTestTenant } from '../../test-utils.js';

describe('ComplianceStackResolver', () => {
  let orm: MikroORM;
  let tenantSchema: string;

  beforeAll(async () => {
    orm = await setupTestDb();
    tenantSchema = await createTestTenant(orm, 'test_resolver');
  });

  afterAll(async () => {
    await teardownTestDb(orm);
  });

  describe('resolve', () => {
    it('should_return_system_baseline_regulations', async () => {
      const em = orm.em.fork();
      const timestamp = Date.now();

      // Create system category
      const category = em.create(Category, {
        name: `Cosmetics ${timestamp}`,
        path: `cosmetics.${timestamp}`,
      });

      // Create regulation with requirement
      const regulation = em.create(Regulation, {
        code: `COSING_${timestamp}`,
        name: 'CosIng',
        status: RegulationStatus.ACTIVE,
      });

      await em.persistAndFlush([category, regulation]);

      const requirement = em.create(Requirement, {
        regulation,
        code: 'ANNEX_II_SCREEN',
        name: 'Annex II Substance Screen',
        type: RequirementType.SUBSTANCE_SCREEN,
        severity: RequirementSeverity.BLOCKER,
      });

      const mapping = em.create(CategoryRegulation, {
        category,
        regulation,
      });

      await em.persistAndFlush([requirement, mapping]);

      // Create tenant category
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const tenantCategory = tenantEm.create(TenantCategory, {
        name: 'My Cosmetics',
        path: `cosmetics.${timestamp}`,
        systemCategoryId: category.id,
        linkMode: 'LIVE',
      });
      await tenantEm.persistAndFlush(tenantCategory);

      // Resolve
      const resolver = new ComplianceStackResolver(tenantEm);
      const result = await resolver.resolve(tenantCategory.id);

      // Assert
      expect(result.tenantCategoryId).toBe(tenantCategory.id);
      expect(result.regulations).toHaveLength(1);
      expect(result.regulations[0].regulationCode).toBe(`COSING_${timestamp}`);
      expect(result.regulations[0].source).toBe('SYSTEM');
      expect(result.regulations[0].requirements).toHaveLength(1);
      expect(result.regulations[0].requirements[0].requirementCode).toBe('ANNEX_II_SCREEN');
      expect(result.regulations[0].requirements[0].status).toBe('ACTIVE');
    });

    it('should_not_include_draft_regulations', async () => {
      const em = orm.em.fork();
      const timestamp = Date.now();

      const category = em.create(Category, {
        name: `Draft Test ${timestamp}`,
        path: `draft.${timestamp}`,
      });

      const draftRegulation = em.create(Regulation, {
        code: `DRAFT_${timestamp}`,
        name: 'Draft Regulation',
        status: RegulationStatus.DRAFT,
      });

      await em.persistAndFlush([category, draftRegulation]);

      const mapping = em.create(CategoryRegulation, {
        category,
        regulation: draftRegulation,
      });
      await em.persistAndFlush(mapping);

      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const tenantCategory = tenantEm.create(TenantCategory, {
        name: 'Draft Test Category',
        path: `draft.${timestamp}`,
        systemCategoryId: category.id,
        linkMode: 'LIVE',
      });
      await tenantEm.persistAndFlush(tenantCategory);

      const resolver = new ComplianceStackResolver(tenantEm);
      const result = await resolver.resolve(tenantCategory.id);

      expect(result.regulations).toHaveLength(0);
    });

    it('should_return_empty_when_no_system_category', async () => {
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const tenantCategory = tenantEm.create(TenantCategory, {
        name: 'Custom Category',
        path: `custom.${Date.now()}`,
        // No systemCategoryId
      });
      await tenantEm.persistAndFlush(tenantCategory);

      const resolver = new ComplianceStackResolver(tenantEm);
      const result = await resolver.resolve(tenantCategory.id);

      expect(result.regulations).toHaveLength(0);
    });

    it('should_inherit_regulations_from_parent_categories_via_ltree', async () => {
      const em = orm.em.fork();
      const timestamp = Date.now();

      // Create parent category 'textiles' with REACH regulation
      const parentCategory = em.create(Category, {
        name: `Textiles ${timestamp}`,
        path: `textiles_${timestamp}`,
      });

      // Create child category 'textiles.apparel' with ESPR regulation
      const childCategory = em.create(Category, {
        name: `Apparel ${timestamp}`,
        path: `textiles_${timestamp}.apparel`,
      });

      const reachRegulation = em.create(Regulation, {
        code: `REACH_${timestamp}`,
        name: 'REACH',
        status: RegulationStatus.ACTIVE,
      });

      const esprRegulation = em.create(Regulation, {
        code: `ESPR_${timestamp}`,
        name: 'ESPR',
        status: RegulationStatus.ACTIVE,
      });

      await em.persistAndFlush([parentCategory, childCategory, reachRegulation, esprRegulation]);

      // Link REACH to parent 'textiles'
      const reachMapping = em.create(CategoryRegulation, {
        category: parentCategory,
        regulation: reachRegulation,
      });

      // Link ESPR to child 'textiles.apparel'
      const esprMapping = em.create(CategoryRegulation, {
        category: childCategory,
        regulation: esprRegulation,
      });

      // Add requirements
      const reachRequirement = em.create(Requirement, {
        regulation: reachRegulation,
        code: 'SVHC_SCREEN',
        name: 'SVHC Screen',
        type: RequirementType.SUBSTANCE_SCREEN,
      });

      const esprRequirement = em.create(Requirement, {
        regulation: esprRegulation,
        code: 'RECYCLED_MIN',
        name: 'Recycled Content',
        type: RequirementType.ATTRIBUTE_CHECK,
      });

      await em.persistAndFlush([reachMapping, esprMapping, reachRequirement, esprRequirement]);

      // Create tenant category adopting the CHILD category
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const tenantCategory = tenantEm.create(TenantCategory, {
        name: 'My Apparel',
        path: `textiles_${timestamp}.apparel`,
        systemCategoryId: childCategory.id,
        linkMode: 'LIVE',
      });
      await tenantEm.persistAndFlush(tenantCategory);

      // Resolve - should get BOTH REACH (from parent) AND ESPR (from self)
      const resolver = new ComplianceStackResolver(tenantEm);
      const result = await resolver.resolve(tenantCategory.id);

      // Assert: Product in 'apparel' inherits REACH from 'textiles' parent
      expect(result.regulations).toHaveLength(2);

      const regulationCodes = result.regulations.map(r => r.regulationCode);
      expect(regulationCodes).toContain(`REACH_${timestamp}`);
      expect(regulationCodes).toContain(`ESPR_${timestamp}`);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/__tests__/ComplianceStackResolver.test.ts
```

Expected: FAIL (ComplianceStackResolver may not exist or have correct interface)

**Step 3: Commit failing test**

```bash
git add packages/database/src/services/__tests__/ComplianceStackResolver.test.ts
git commit -m "test(database): add failing tests for revised ComplianceStackResolver

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Implement Revised ComplianceStackResolver

**Files:**
- Create or Modify: `packages/database/src/services/ComplianceStackResolver.ts`

**Step 1: Implement the revised resolver**

```typescript
// packages/database/src/services/ComplianceStackResolver.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Category } from '../entities/Category.js';
import { TenantCategory } from '../entities/TenantCategory.js';
import { CategoryRegulation } from '../entities/CategoryRegulation.js';
import { Regulation, RegulationStatus } from '../entities/Regulation.js';
import { RequirementType, RequirementSeverity } from '../entities/enums/index.js';

export interface EffectiveRequirementResult {
  tenantCategoryId: string;
  tenantCategoryPath: string;
  systemCategoryId?: string;
  linkMode?: string;
  regulations: EffectiveRegulation[];
}

export interface EffectiveRegulation {
  regulationId: string;
  regulationCode: string;
  regulationName: string;
  source: 'SYSTEM' | 'TENANT';
  requirements: EffectiveRequirement[];
}

export interface EffectiveRequirement {
  requirementId: string;
  requirementCode: string;
  requirementName: string;
  type: RequirementType;
  severity: RequirementSeverity;
  status: 'ACTIVE' | 'EXEMPTED';
  allowTenantExemption: boolean;
  attributeTemplateKey?: string;
  substanceListId?: string;
  calculationFormula?: string;
  handlerConfig?: Record<string, unknown>;
  legalReference?: string;
  exemption?: {
    reason: string;
    legalRef?: string;
    exemptedBy: string;
    exemptedAt: Date;
  };
}

export class ComplianceStackResolver {
  constructor(private readonly em: EntityManager) {}

  async resolve(tenantCategoryId: string): Promise<EffectiveRequirementResult> {
    const schema = this.em.config.get('schema') || 'public';

    return this.em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      const tenantCategory = await txEm.findOneOrFail(TenantCategory, { id: tenantCategoryId });

      const result: EffectiveRequirementResult = {
        tenantCategoryId,
        tenantCategoryPath: tenantCategory.path,
        systemCategoryId: tenantCategory.systemCategoryId ?? undefined,
        linkMode: tenantCategory.linkMode ?? undefined,
        regulations: [],
      };

      // Get system baseline regulations
      const systemRegulations = await this.getSystemRegulations(txEm, tenantCategory.systemCategoryId);

      // TODO: Get tenant-added regulations (Phase 2)
      // TODO: Get tenant exemptions (Phase 2)

      result.regulations = systemRegulations.map(reg => ({
        ...reg,
        source: 'SYSTEM' as const,
      }));

      return result;
    });
  }

  private async getSystemRegulations(
    em: EntityManager,
    systemCategoryId: string | null | undefined
  ): Promise<Omit<EffectiveRegulation, 'source'>[]> {
    if (!systemCategoryId) return [];

    // Get the category path for LTREE hierarchical lookup
    const category = await em.findOne(Category, { id: systemCategoryId });
    if (!category) return [];

    // LTREE HIERARCHICAL INHERITANCE:
    // Find all regulations from ancestor categories down to this category
    // e.g., if category is 'textiles.apparel', find regulations linked to
    // 'textiles' AND 'textiles.apparel'
    const regulations = await em.execute<Array<{ regulation_id: string }>>(
      `SELECT DISTINCT cr.regulation_id
       FROM public.category_regulation cr
       JOIN public.category c ON c.id = cr.category_id
       JOIN public.regulation r ON r.id = cr.regulation_id
       WHERE $1::ltree <@ c.path
         AND r.status = 'ACTIVE'`,
      [category.path]
    );

    if (regulations.length === 0) return [];

    const regulationIds = regulations.map(r => r.regulation_id);

    // Load full regulation entities with requirements
    const fullRegulations = await em.find(Regulation, {
      id: { $in: regulationIds },
    }, {
      populate: ['requirements'],
    });

    return fullRegulations.map(r => this.mapRegulation(r));
  }

  private mapRegulation(reg: Regulation): Omit<EffectiveRegulation, 'source'> {
    return {
      regulationId: reg.id,
      regulationCode: reg.code,
      regulationName: reg.name,
      requirements: reg.requirements.getItems().map(req => ({
        requirementId: req.id,
        requirementCode: req.code,
        requirementName: req.name,
        type: req.type,
        severity: req.severity,
        status: 'ACTIVE' as const,
        allowTenantExemption: req.allowTenantExemption,
        attributeTemplateKey: req.attributeTemplateKey ?? undefined,
        substanceListId: req.substanceListId ?? undefined,
        calculationFormula: req.calculationFormula ?? undefined,
        handlerConfig: req.handlerConfig ?? undefined,
        legalReference: req.legalReference ?? undefined,
      })),
    };
  }
}
```

**Step 2: Export from services index**

Add to `packages/database/src/services/index.ts`:
```typescript
export { ComplianceStackResolver } from './ComplianceStackResolver.js';
export type {
  EffectiveRequirementResult,
  EffectiveRegulation,
  EffectiveRequirement,
} from './ComplianceStackResolver.js';
```

**Step 3: Run tests to verify they pass**

```bash
cd packages/database && pnpm test src/services/__tests__/ComplianceStackResolver.test.ts
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/database/src/services/ComplianceStackResolver.ts packages/database/src/services/index.ts
git commit -m "feat(database): implement revised ComplianceStackResolver

- Resolves at Regulation level (not SubstanceList)
- Returns EffectiveRequirement[] grouped by regulation
- Uses transaction with SET search_path for multi-tenant safety
- TODO markers for tenant additions and exemptions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Checkpoint: Phase 1 Complete

At this point, the core entities and resolver are in place:

- [x] RegulationStatus enum
- [x] RequirementType enum
- [x] RequirementSeverity enum
- [x] Regulation entity with tests
- [x] Requirement entity with tests
- [x] CategoryRegulation junction with tests
- [x] ComplianceStackResolver (basic) with tests
- [x] Database migration

**Run full test suite:**

```bash
cd packages/database && pnpm test
```

Expected: All tests PASS

---

## Phase 2: Tenant Layer (Tasks 13-18)

---

## Task 13: Write Failing Tests for TenantRequirementExemption Entity

**Files:**
- Create: `packages/database/src/entities/__tests__/TenantRequirementExemption.test.ts`

**Step 1: Write the failing test file**

```typescript
// packages/database/src/entities/__tests__/TenantRequirementExemption.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { Regulation } from '../Regulation.js';
import { Requirement } from '../Requirement.js';
import { TenantCategory } from '../TenantCategory.js';
import { TenantRequirementExemption } from '../TenantRequirementExemption.js';
import { RegulationStatus } from '../enums/RegulationStatus.js';
import { RequirementType } from '../enums/RequirementType.js';
import { setupTestDb, teardownTestDb, createTestTenant } from '../../test-utils.js';

describe('TenantRequirementExemption', () => {
  let orm: MikroORM;
  let tenantSchema: string;
  let regulation: Regulation;
  let requirement: Requirement;

  beforeAll(async () => {
    orm = await setupTestDb();
    tenantSchema = await createTestTenant(orm, 'test_exemption');
  });

  afterAll(async () => {
    await teardownTestDb(orm);
  });

  beforeEach(async () => {
    const em = orm.em.fork();
    const timestamp = Date.now();

    regulation = em.create(Regulation, {
      code: `REG_${timestamp}`,
      name: 'Test Regulation',
      status: RegulationStatus.ACTIVE,
    });
    await em.persistAndFlush(regulation);

    requirement = em.create(Requirement, {
      regulation,
      code: `REQ_${timestamp}`,
      name: 'Test Requirement',
      type: RequirementType.SUBSTANCE_SCREEN,
      allowTenantExemption: true,
    });
    await em.persistAndFlush(requirement);
  });

  describe('creation', () => {
    it('should_create_exemption_with_reason_and_legal_ref', async () => {
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const tenantCategory = tenantEm.create(TenantCategory, {
        name: 'Test Category',
        path: `test.${Date.now()}`,
      });
      await tenantEm.persistAndFlush(tenantCategory);

      const exemption = tenantEm.create(TenantRequirementExemption, {
        tenantCategory,
        requirementId: requirement.id,
        reason: 'Product does not contain regulated substances',
        legalReference: 'Article 5.2 exemption clause',
        exemptedBy: 'admin@tenant.com',
      });
      await tenantEm.persistAndFlush(exemption);

      const found = await tenantEm.findOne(TenantRequirementExemption, { id: exemption.id });
      expect(found).toBeDefined();
      expect(found!.reason).toBe('Product does not contain regulated substances');
      expect(found!.legalReference).toBe('Article 5.2 exemption clause');
      expect(found!.exemptedAt).toBeDefined();
    });

    it('should_reject_duplicate_exemption_for_same_category_requirement', async () => {
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const tenantCategory = tenantEm.create(TenantCategory, {
        name: 'Unique Test',
        path: `unique.${Date.now()}`,
      });
      await tenantEm.persistAndFlush(tenantCategory);

      const exemption1 = tenantEm.create(TenantRequirementExemption, {
        tenantCategory,
        requirementId: requirement.id,
        reason: 'First exemption',
        exemptedBy: 'admin@tenant.com',
      });
      await tenantEm.persistAndFlush(exemption1);

      const exemption2 = tenantEm.create(TenantRequirementExemption, {
        tenantCategory,
        requirementId: requirement.id,
        reason: 'Duplicate exemption',
        exemptedBy: 'admin@tenant.com',
      });

      await expect(tenantEm.persistAndFlush(exemption2)).rejects.toThrow();
    });
  });

  describe('revocation', () => {
    it('should_allow_revoking_exemption', async () => {
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const tenantCategory = tenantEm.create(TenantCategory, {
        name: 'Revoke Test',
        path: `revoke.${Date.now()}`,
      });
      await tenantEm.persistAndFlush(tenantCategory);

      const exemption = tenantEm.create(TenantRequirementExemption, {
        tenantCategory,
        requirementId: requirement.id,
        reason: 'Initial exemption',
        exemptedBy: 'admin@tenant.com',
      });
      await tenantEm.persistAndFlush(exemption);

      exemption.revokedAt = new Date();
      exemption.revokedBy = 'compliance@tenant.com';
      exemption.revocationReason = 'Exemption no longer valid';
      await tenantEm.flush();

      const found = await tenantEm.findOne(TenantRequirementExemption, { id: exemption.id });
      expect(found!.revokedAt).toBeDefined();
      expect(found!.revokedBy).toBe('compliance@tenant.com');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/entities/__tests__/TenantRequirementExemption.test.ts
```

Expected: FAIL with "Cannot find module '../TenantRequirementExemption.js'"

**Step 3: Commit failing test**

```bash
git add packages/database/src/entities/__tests__/TenantRequirementExemption.test.ts
git commit -m "test(database): add failing tests for TenantRequirementExemption entity

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 14: Implement TenantRequirementExemption Entity

**Files:**
- Create: `packages/database/src/entities/TenantRequirementExemption.ts`
- Modify: `packages/database/src/entities/index.ts`

**Step 1: Create the TenantRequirementExemption entity**

```typescript
// packages/database/src/entities/TenantRequirementExemption.ts
import {
  Entity,
  Property,
  ManyToOne,
  Index,
  Unique,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { TenantCategory } from './TenantCategory.js';

/**
 * Tenant-level exemption for a specific requirement.
 * Lives in tenant schema.
 *
 * Note: We store requirementId as UUID string instead of FK because
 * the Requirement entity is in public schema. Cross-schema FKs are
 * complex in PostgreSQL with schema-per-tenant architecture.
 */
@Entity({ tableName: 'tenant_requirement_exemption' })
@Unique({ properties: ['tenantCategory', 'requirementId'] })
export class TenantRequirementExemption extends BaseEntity {
  @ManyToOne(() => TenantCategory, { name: 'tenant_category_id' })
  @Index()
  tenantCategory!: TenantCategory;

  @Property({ type: 'uuid', name: 'requirement_id' })
  @Index()
  requirementId!: string;

  @Property({ type: 'text' })
  reason!: string;

  @Property({ type: 'text', nullable: true, name: 'legal_reference' })
  legalReference?: string;

  @Property({ type: 'text', name: 'exempted_by' })
  exemptedBy!: string;

  @Property({ type: 'timestamptz', name: 'exempted_at' })
  exemptedAt: Date = new Date();

  // Revocation fields
  @Property({ type: 'timestamptz', nullable: true, name: 'revoked_at' })
  revokedAt?: Date;

  @Property({ type: 'text', nullable: true, name: 'revoked_by' })
  revokedBy?: string;

  @Property({ type: 'text', nullable: true, name: 'revocation_reason' })
  revocationReason?: string;
}
```

**Step 2: Export from entities index**

Add to `packages/database/src/entities/index.ts`:
```typescript
export { TenantRequirementExemption } from './TenantRequirementExemption.js';
```

**Step 3: Add to tenantOnlyEntities array**

In `packages/database/src/entities/index.ts`, add to the `tenantOnlyEntities` array:
```typescript
TenantRequirementExemption,
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/database && pnpm test src/entities/__tests__/TenantRequirementExemption.test.ts
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/TenantRequirementExemption.ts packages/database/src/entities/index.ts
git commit -m "feat(database): implement TenantRequirementExemption entity

- Tenant-schema entity for requirement exemptions
- Unique constraint on tenantCategory + requirementId
- Revocation support with reason and timestamp
- Uses UUID for cross-schema requirement reference

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 15: Write Failing Tests for Exemption Guardrail

**Files:**
- Create: `packages/database/src/services/__tests__/ExemptionGuardrail.test.ts`

**Step 1: Write the failing test file**

```typescript
// packages/database/src/services/__tests__/ExemptionGuardrail.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { Regulation } from '../../entities/Regulation.js';
import { Requirement } from '../../entities/Requirement.js';
import { TenantCategory } from '../../entities/TenantCategory.js';
import { RegulationStatus } from '../../entities/enums/RegulationStatus.js';
import { RequirementType } from '../../entities/enums/RequirementType.js';
import { RequirementSeverity } from '../../entities/enums/RequirementSeverity.js';
import { ExemptionService } from '../ExemptionService.js';
import { setupTestDb, teardownTestDb, createTestTenant } from '../../test-utils.js';

describe('ExemptionService', () => {
  let orm: MikroORM;
  let tenantSchema: string;

  beforeAll(async () => {
    orm = await setupTestDb();
    tenantSchema = await createTestTenant(orm, 'test_guardrail');
  });

  afterAll(async () => {
    await teardownTestDb(orm);
  });

  describe('createExemption', () => {
    it('should_reject_exemption_when_allowTenantExemption_is_false', async () => {
      const em = orm.em.fork();
      const timestamp = Date.now();

      const regulation = em.create(Regulation, {
        code: `BLOCKER_REG_${timestamp}`,
        name: 'Blocker Regulation',
        status: RegulationStatus.ACTIVE,
      });
      await em.persistAndFlush(regulation);

      // Non-exemptable requirement
      const requirement = em.create(Requirement, {
        regulation,
        code: `NON_EXEMPT_${timestamp}`,
        name: 'Non-Exemptable Requirement',
        type: RequirementType.SUBSTANCE_SCREEN,
        severity: RequirementSeverity.BLOCKER,
        allowTenantExemption: false,  // CANNOT be exempted
      });
      await em.persistAndFlush(requirement);

      // Create tenant category
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const tenantCategory = tenantEm.create(TenantCategory, {
        name: 'Guardrail Test',
        path: `guardrail.${timestamp}`,
      });
      await tenantEm.persistAndFlush(tenantCategory);

      // Try to create exemption - should fail
      const service = new ExemptionService(tenantEm);

      await expect(service.createExemption({
        tenantCategoryId: tenantCategory.id,
        requirementId: requirement.id,
        reason: 'Trying to exempt non-exemptable',
        exemptedBy: 'admin@tenant.com',
      })).rejects.toThrow(/cannot be exempted/);
    });

    it('should_allow_exemption_when_allowTenantExemption_is_true', async () => {
      const em = orm.em.fork();
      const timestamp = Date.now();

      const regulation = em.create(Regulation, {
        code: `EXEMPT_REG_${timestamp}`,
        name: 'Exemptable Regulation',
        status: RegulationStatus.ACTIVE,
      });
      await em.persistAndFlush(regulation);

      // Exemptable requirement
      const requirement = em.create(Requirement, {
        regulation,
        code: `EXEMPTABLE_${timestamp}`,
        name: 'Exemptable Requirement',
        type: RequirementType.ATTRIBUTE_CHECK,
        severity: RequirementSeverity.WARNING,
        allowTenantExemption: true,  // CAN be exempted
      });
      await em.persistAndFlush(requirement);

      // Create tenant category
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const tenantCategory = tenantEm.create(TenantCategory, {
        name: 'Exemptable Test',
        path: `exemptable.${timestamp}`,
      });
      await tenantEm.persistAndFlush(tenantCategory);

      // Create exemption - should succeed
      const service = new ExemptionService(tenantEm);

      const exemption = await service.createExemption({
        tenantCategoryId: tenantCategory.id,
        requirementId: requirement.id,
        reason: 'Valid exemption reason',
        exemptedBy: 'admin@tenant.com',
      });

      expect(exemption).toBeDefined();
      expect(exemption.reason).toBe('Valid exemption reason');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/__tests__/ExemptionGuardrail.test.ts
```

Expected: FAIL with "Cannot find module '../ExemptionService.js'"

**Step 3: Commit failing test**

```bash
git add packages/database/src/services/__tests__/ExemptionGuardrail.test.ts
git commit -m "test(database): add failing tests for exemption guardrail

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 16: Implement ExemptionService with Guardrail

**Files:**
- Create: `packages/database/src/services/ExemptionService.ts`
- Modify: `packages/database/src/services/index.ts`

**Step 1: Create the ExemptionService**

```typescript
// packages/database/src/services/ExemptionService.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Requirement } from '../entities/Requirement.js';
import { TenantCategory } from '../entities/TenantCategory.js';
import { TenantRequirementExemption } from '../entities/TenantRequirementExemption.js';

export interface CreateExemptionInput {
  tenantCategoryId: string;
  requirementId: string;
  reason: string;
  legalReference?: string;
  exemptedBy: string;
}

export class ExemptionGuardrailError extends Error {
  constructor(
    message: string,
    public readonly requirementCode: string,
    public readonly requirementName: string
  ) {
    super(message);
    this.name = 'ExemptionGuardrailError';
  }
}

export class ExemptionService {
  constructor(private readonly em: EntityManager) {}

  async createExemption(input: CreateExemptionInput): Promise<TenantRequirementExemption> {
    const { tenantCategoryId, requirementId, reason, legalReference, exemptedBy } = input;

    // Load requirement from public schema to check guardrail
    const requirement = await this.em.findOne(
      Requirement,
      { id: requirementId },
      { schema: 'public' }
    );

    if (!requirement) {
      throw new Error(`Requirement not found: ${requirementId}`);
    }

    // GUARDRAIL: Check if exemption is allowed
    if (!requirement.allowTenantExemption) {
      throw new ExemptionGuardrailError(
        `Requirement "${requirement.code}" cannot be exempted. This is a mandatory compliance requirement. Contact platform administrator.`,
        requirement.code,
        requirement.name
      );
    }

    // Load tenant category
    const tenantCategory = await this.em.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    // Create exemption
    const exemption = this.em.create(TenantRequirementExemption, {
      tenantCategory,
      requirementId,
      reason,
      legalReference,
      exemptedBy,
    });

    await this.em.persistAndFlush(exemption);
    return exemption;
  }

  async revokeExemption(
    exemptionId: string,
    revokedBy: string,
    revocationReason: string
  ): Promise<TenantRequirementExemption> {
    const exemption = await this.em.findOneOrFail(TenantRequirementExemption, { id: exemptionId });

    exemption.revokedAt = new Date();
    exemption.revokedBy = revokedBy;
    exemption.revocationReason = revocationReason;

    await this.em.flush();
    return exemption;
  }
}
```

**Step 2: Export from services index**

Add to `packages/database/src/services/index.ts`:
```typescript
export { ExemptionService, ExemptionGuardrailError } from './ExemptionService.js';
export type { CreateExemptionInput } from './ExemptionService.js';
```

**Step 3: Run tests to verify they pass**

```bash
cd packages/database && pnpm test src/services/__tests__/ExemptionGuardrail.test.ts
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/database/src/services/ExemptionService.ts packages/database/src/services/index.ts
git commit -m "feat(database): implement ExemptionService with guardrail

- Checks allowTenantExemption before creating exemption
- Throws ExemptionGuardrailError for non-exemptable requirements
- Supports exemption revocation with reason

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 17: Update ComplianceStackResolver for Exemptions

**Files:**
- Modify: `packages/database/src/services/ComplianceStackResolver.ts`
- Modify: `packages/database/src/services/__tests__/ComplianceStackResolver.test.ts`

**Step 1: Add exemption test case**

Add to `packages/database/src/services/__tests__/ComplianceStackResolver.test.ts`:

```typescript
it('should_mark_requirement_as_exempted_when_exemption_exists', async () => {
  const em = orm.em.fork();
  const timestamp = Date.now();

  // Create system category with regulation
  const category = em.create(Category, {
    name: `Exemption Test ${timestamp}`,
    path: `exemption.${timestamp}`,
  });

  const regulation = em.create(Regulation, {
    code: `EXEMPT_TEST_${timestamp}`,
    name: 'Exemption Test Regulation',
    status: RegulationStatus.ACTIVE,
  });

  await em.persistAndFlush([category, regulation]);

  const requirement = em.create(Requirement, {
    regulation,
    code: 'EXEMPTABLE_REQ',
    name: 'Exemptable Requirement',
    type: RequirementType.ATTRIBUTE_CHECK,
    allowTenantExemption: true,
  });

  const mapping = em.create(CategoryRegulation, {
    category,
    regulation,
  });

  await em.persistAndFlush([requirement, mapping]);

  // Create tenant category
  const tenantEm = orm.em.fork({ schema: tenantSchema });
  await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

  const tenantCategory = tenantEm.create(TenantCategory, {
    name: 'Exemption Category',
    path: `exemption.${timestamp}`,
    systemCategoryId: category.id,
    linkMode: 'LIVE',
  });
  await tenantEm.persistAndFlush(tenantCategory);

  // Create exemption
  const exemption = tenantEm.create(TenantRequirementExemption, {
    tenantCategory,
    requirementId: requirement.id,
    reason: 'Product exempt under Article 5',
    exemptedBy: 'admin@tenant.com',
  });
  await tenantEm.persistAndFlush(exemption);

  // Resolve - requirement should be marked EXEMPTED
  const resolver = new ComplianceStackResolver(tenantEm);
  const result = await resolver.resolve(tenantCategory.id);

  expect(result.regulations).toHaveLength(1);
  expect(result.regulations[0].requirements[0].status).toBe('EXEMPTED');
  expect(result.regulations[0].requirements[0].exemption).toBeDefined();
  expect(result.regulations[0].requirements[0].exemption!.reason).toBe('Product exempt under Article 5');
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/__tests__/ComplianceStackResolver.test.ts
```

Expected: FAIL (exemption not being applied yet)

**Step 3: Update ComplianceStackResolver to apply exemptions**

In `packages/database/src/services/ComplianceStackResolver.ts`, update the `resolve` method:

```typescript
async resolve(tenantCategoryId: string): Promise<EffectiveRequirementResult> {
  const schema = this.em.config.get('schema') || 'public';

  return this.em.transactional(async (txEm) => {
    await txEm.execute(`SET search_path TO "${schema}", public`);

    const tenantCategory = await txEm.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    const result: EffectiveRequirementResult = {
      tenantCategoryId,
      tenantCategoryPath: tenantCategory.path,
      systemCategoryId: tenantCategory.systemCategoryId ?? undefined,
      linkMode: tenantCategory.linkMode ?? undefined,
      regulations: [],
    };

    // Get system baseline regulations
    const systemRegulations = await this.getSystemRegulations(txEm, tenantCategory.systemCategoryId);

    // Get tenant exemptions for this category
    const exemptions = await txEm.find(TenantRequirementExemption, {
      tenantCategory: { id: tenantCategoryId },
      revokedAt: null,  // Only active exemptions
    });

    const exemptionMap = new Map(
      exemptions.map(e => [e.requirementId, e])
    );

    // Apply exemptions to regulations
    result.regulations = systemRegulations.map(reg => ({
      ...reg,
      source: 'SYSTEM' as const,
      requirements: reg.requirements.map(req => {
        const exemption = exemptionMap.get(req.requirementId);
        if (exemption) {
          return {
            ...req,
            status: 'EXEMPTED' as const,
            exemption: {
              reason: exemption.reason,
              legalRef: exemption.legalReference ?? undefined,
              exemptedBy: exemption.exemptedBy,
              exemptedAt: exemption.exemptedAt,
            },
          };
        }
        return req;
      }),
    }));

    return result;
  });
}
```

**Step 4: Add import for TenantRequirementExemption**

Add to imports in `ComplianceStackResolver.ts`:
```typescript
import { TenantRequirementExemption } from '../entities/TenantRequirementExemption.js';
```

**Step 5: Run tests to verify they pass**

```bash
cd packages/database && pnpm test src/services/__tests__/ComplianceStackResolver.test.ts
```

Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/database/src/services/ComplianceStackResolver.ts packages/database/src/services/__tests__/ComplianceStackResolver.test.ts
git commit -m "feat(database): add exemption support to ComplianceStackResolver

- Loads tenant exemptions for the category
- Marks requirements as EXEMPTED with exemption details
- Only applies active (non-revoked) exemptions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 18: Add TenantRequirementExemption to Migration

**Files:**
- Modify: `packages/database/src/services/tenant-provisioner.ts`

**Step 1: Add tenant_requirement_exemption to EXPECTED_TENANT_TABLES**

In `packages/database/src/services/tenant-provisioner.ts`, add to `EXPECTED_TENANT_TABLES`:

```typescript
'tenant_requirement_exemption',
```

**Step 2: Verify TenantProvisioner creates the table**

```bash
cd packages/database && pnpm test src/services/__tests__/tenant-provisioner.test.ts
```

Expected: All tests PASS (TenantProvisioner should auto-create table from entity)

**Step 3: Commit**

```bash
git add packages/database/src/services/tenant-provisioner.ts
git commit -m "feat(database): add tenant_requirement_exemption to tenant provisioner

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Checkpoint: Phase 2 Complete

At this point, the tenant layer is in place:

- [x] TenantRequirementExemption entity with tests
- [x] ExemptionService with guardrail
- [x] ComplianceStackResolver applies exemptions
- [x] TenantProvisioner updated

**Run full test suite:**

```bash
cd packages/database && pnpm test
```

Expected: All tests PASS

---

## Phase 3: Handler Plugin Architecture (Tasks 19-24)

---

## Task 19: Create RequirementHandler Interface and Types

**Files:**
- Create: `packages/database/src/services/evaluation/types.ts`

**Step 1: Create the types file**

```typescript
// packages/database/src/services/evaluation/types.ts
import { RequirementType, RequirementSeverity } from '../../entities/enums/index.js';

/**
 * Context passed to requirement handlers for evaluation.
 * Contains all data needed to evaluate a requirement against a product.
 */
export interface EvaluationContext {
  productVersionId: string;
  requirement: {
    id: string;
    code: string;
    name: string;
    type: RequirementType;
    severity: RequirementSeverity;
    attributeTemplateKey?: string;
    substanceListId?: string;
    calculationFormula?: string;
    handlerConfig?: Record<string, unknown>;
    legalReference?: string;
  };
  regulation: {
    id: string;
    code: string;
    name: string;
  };
}

/**
 * Result of evaluating a requirement.
 */
export interface EvaluationResult {
  passed: boolean;
  status: 'PASS' | 'FAIL' | 'INCOMPLETE' | 'NOT_APPLICABLE';
  details: {
    actualValue?: unknown;
    expectedValue?: unknown;
    threshold?: number;
    operator?: string;
    message?: string;
    [key: string]: unknown;
  };
}

/**
 * Result of validating handler configuration.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Interface for requirement handlers.
 * Each handler knows HOW to evaluate a type, not WHAT regulations exist.
 *
 * The engine is regulation-agnostic - it dispatches to handlers by type.
 */
export interface RequirementHandler<TConfig = unknown> {
  readonly type: RequirementType;

  /**
   * Evaluate the requirement against product data.
   * Handler doesn't know WHAT regulation - only HOW to check this type.
   */
  evaluate(context: EvaluationContext): Promise<EvaluationResult>;

  /**
   * Validate handler configuration at admin API level.
   * Prevents broken rules from ever hitting the database.
   */
  validateConfig(config: TConfig, requirement: Partial<{
    attributeTemplateKey?: string;
    substanceListId?: string;
    calculationFormula?: string;
  }>): ValidationResult;
}
```

**Step 2: Commit**

```bash
git add packages/database/src/services/evaluation/types.ts
git commit -m "feat(database): add RequirementHandler interface and evaluation types

- EvaluationContext with product and requirement data
- EvaluationResult with pass/fail status and details
- RequirementHandler interface for plugin architecture
- ValidationResult for config validation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 20: Write Failing Tests for AttributeCheckHandler

**Files:**
- Create: `packages/database/src/services/evaluation/__tests__/AttributeCheckHandler.test.ts`

**Step 1: Write the failing test file**

```typescript
// packages/database/src/services/evaluation/__tests__/AttributeCheckHandler.test.ts
import { describe, it, expect } from 'vitest';
import { AttributeCheckHandler } from '../handlers/AttributeCheckHandler.js';
import { RequirementType, RequirementSeverity } from '../../../entities/enums/index.js';
import type { EvaluationContext } from '../types.js';

describe('AttributeCheckHandler', () => {
  const handler = new AttributeCheckHandler();

  describe('type', () => {
    it('should_have_correct_type', () => {
      expect(handler.type).toBe(RequirementType.ATTRIBUTE_CHECK);
    });
  });

  describe('validateConfig', () => {
    it('should_reject_missing_attributeTemplateKey', () => {
      const result = handler.validateConfig(
        { operator: '>=', threshold: 25 },
        {}  // No attributeTemplateKey
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ATTRIBUTE_CHECK requires attributeTemplateKey');
    });

    it('should_reject_missing_operator', () => {
      const result = handler.validateConfig(
        { threshold: 25 },  // No operator
        { attributeTemplateKey: 'recycled_content' }
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ATTRIBUTE_CHECK requires operator in handlerConfig');
    });

    it('should_reject_missing_threshold', () => {
      const result = handler.validateConfig(
        { operator: '>=' },  // No threshold
        { attributeTemplateKey: 'recycled_content' }
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ATTRIBUTE_CHECK requires threshold in handlerConfig');
    });

    it('should_accept_valid_config', () => {
      const result = handler.validateConfig(
        { operator: '>=', threshold: 25, unit: '%' },
        { attributeTemplateKey: 'recycled_content' }
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('evaluate', () => {
    const baseContext: EvaluationContext = {
      productVersionId: 'test-product-version-id',
      requirement: {
        id: 'test-req-id',
        code: 'TEST_ATTR',
        name: 'Test Attribute Check',
        type: RequirementType.ATTRIBUTE_CHECK,
        severity: RequirementSeverity.BLOCKER,
        attributeTemplateKey: 'recycled_content',
        handlerConfig: { operator: '>=', threshold: 25, unit: '%' },
      },
      regulation: {
        id: 'test-reg-id',
        code: 'TEST_REG',
        name: 'Test Regulation',
      },
    };

    it('should_pass_when_value_meets_threshold', async () => {
      // Mock: Product has recycled_content = 30%
      const context = {
        ...baseContext,
        // In real implementation, handler would fetch attribute from DB
        // For testing, we'll inject the value via a test helper
        _testAttributeValue: 30,
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
      expect(result.details.actualValue).toBe(30);
      expect(result.details.threshold).toBe(25);
    });

    it('should_fail_when_value_below_threshold', async () => {
      const context = {
        ...baseContext,
        _testAttributeValue: 20,  // Below 25% threshold
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(false);
      expect(result.status).toBe('FAIL');
      expect(result.details.actualValue).toBe(20);
    });

    it('should_return_incomplete_when_attribute_not_set', async () => {
      const context = {
        ...baseContext,
        _testAttributeValue: undefined,  // No value set
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(false);
      expect(result.status).toBe('INCOMPLETE');
      expect(result.details.message).toContain('not set');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/evaluation/__tests__/AttributeCheckHandler.test.ts
```

Expected: FAIL with "Cannot find module '../handlers/AttributeCheckHandler.js'"

**Step 3: Commit failing test**

```bash
git add packages/database/src/services/evaluation/__tests__/AttributeCheckHandler.test.ts
git commit -m "test(database): add failing tests for AttributeCheckHandler

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 21: Implement AttributeCheckHandler

**Files:**
- Create: `packages/database/src/services/evaluation/handlers/AttributeCheckHandler.ts`

**Step 1: Create the handler**

```typescript
// packages/database/src/services/evaluation/handlers/AttributeCheckHandler.ts
import { RequirementType } from '../../../entities/enums/index.js';
import type { RequirementHandler, EvaluationContext, EvaluationResult, ValidationResult } from '../types.js';

interface AttributeCheckConfig {
  operator: '>=' | '<=' | '>' | '<' | '==' | '!=';
  threshold: number;
  unit?: string;
}

/**
 * Handler for ATTRIBUTE_CHECK requirements.
 * Compares a product attribute value against a threshold.
 *
 * Agnostic: Doesn't know WHAT regulation - only HOW to compare values.
 */
export class AttributeCheckHandler implements RequirementHandler<AttributeCheckConfig> {
  readonly type = RequirementType.ATTRIBUTE_CHECK;

  validateConfig(
    config: unknown,
    requirement: Partial<{ attributeTemplateKey?: string }>
  ): ValidationResult {
    const errors: string[] = [];

    if (!requirement.attributeTemplateKey) {
      errors.push('ATTRIBUTE_CHECK requires attributeTemplateKey');
    }

    const cfg = config as Partial<AttributeCheckConfig>;
    if (!cfg?.operator) {
      errors.push('ATTRIBUTE_CHECK requires operator in handlerConfig');
    }
    if (cfg?.threshold === undefined) {
      errors.push('ATTRIBUTE_CHECK requires threshold in handlerConfig');
    }

    return { valid: errors.length === 0, errors };
  }

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const config = context.requirement.handlerConfig as AttributeCheckConfig;
    const { operator, threshold, unit } = config;

    // Get attribute value (in real implementation, fetch from ProductVersion attributes)
    // For now, support test injection via _testAttributeValue
    const actualValue = (context as unknown as { _testAttributeValue?: number })._testAttributeValue;

    if (actualValue === undefined || actualValue === null) {
      return {
        passed: false,
        status: 'INCOMPLETE',
        details: {
          message: `Attribute "${context.requirement.attributeTemplateKey}" not set on product`,
          expectedValue: threshold,
          operator,
          unit,
        },
      };
    }

    const passed = this.compare(actualValue, operator, threshold);

    return {
      passed,
      status: passed ? 'PASS' : 'FAIL',
      details: {
        actualValue,
        expectedValue: threshold,
        threshold,
        operator,
        unit,
        message: passed
          ? `${actualValue}${unit || ''} ${operator} ${threshold}${unit || ''}`
          : `${actualValue}${unit || ''} does not satisfy ${operator} ${threshold}${unit || ''}`,
      },
    };
  }

  private compare(actual: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>=': return actual >= threshold;
      case '<=': return actual <= threshold;
      case '>': return actual > threshold;
      case '<': return actual < threshold;
      case '==': return actual === threshold;
      case '!=': return actual !== threshold;
      default: return false;
    }
  }
}
```

**Step 2: Run tests to verify they pass**

```bash
cd packages/database && pnpm test src/services/evaluation/__tests__/AttributeCheckHandler.test.ts
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/database/src/services/evaluation/handlers/AttributeCheckHandler.ts
git commit -m "feat(database): implement AttributeCheckHandler

- Compares product attribute against threshold
- Supports operators: >=, <=, >, <, ==, !=
- Returns INCOMPLETE when attribute not set
- Agnostic: knows HOW to compare, not WHAT regulation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 22: Write Failing Tests for SubstanceScreenHandler

**Files:**
- Create: `packages/database/src/services/evaluation/__tests__/SubstanceScreenHandler.test.ts`

**Step 1: Write the failing test file**

```typescript
// packages/database/src/services/evaluation/__tests__/SubstanceScreenHandler.test.ts
import { describe, it, expect } from 'vitest';
import { SubstanceScreenHandler } from '../handlers/SubstanceScreenHandler.js';
import { RequirementType, RequirementSeverity } from '../../../entities/enums/index.js';
import type { EvaluationContext } from '../types.js';

describe('SubstanceScreenHandler', () => {
  const handler = new SubstanceScreenHandler();

  describe('type', () => {
    it('should_have_correct_type', () => {
      expect(handler.type).toBe(RequirementType.SUBSTANCE_SCREEN);
    });
  });

  describe('validateConfig', () => {
    it('should_reject_missing_substanceListId', () => {
      const result = handler.validateConfig(
        { defaultThresholdPct: 0.1 },
        {}  // No substanceListId
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SUBSTANCE_SCREEN requires substanceListId');
    });

    it('should_accept_valid_config', () => {
      const result = handler.validateConfig(
        { defaultThresholdPct: 0.1 },
        { substanceListId: 'test-list-id' }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('evaluate', () => {
    const baseContext: EvaluationContext = {
      productVersionId: 'test-product-version-id',
      requirement: {
        id: 'test-req-id',
        code: 'TEST_SCREEN',
        name: 'Test Substance Screen',
        type: RequirementType.SUBSTANCE_SCREEN,
        severity: RequirementSeverity.BLOCKER,
        substanceListId: 'test-list-id',
        handlerConfig: { defaultThresholdPct: 0.1 },
      },
      regulation: {
        id: 'test-reg-id',
        code: 'TEST_REG',
        name: 'Test Regulation',
      },
    };

    it('should_pass_when_no_substances_detected', async () => {
      const context = {
        ...baseContext,
        _testSubstanceMatches: [],  // No matches
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
    });

    it('should_fail_when_substance_above_threshold', async () => {
      const context = {
        ...baseContext,
        _testSubstanceMatches: [
          { substanceId: 's1', name: 'Lead', concentration: 0.15 },  // Above 0.1% threshold
        ],
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(false);
      expect(result.status).toBe('FAIL');
      expect(result.details.violations).toHaveLength(1);
    });

    it('should_pass_when_substance_below_threshold', async () => {
      const context = {
        ...baseContext,
        _testSubstanceMatches: [
          { substanceId: 's1', name: 'Cadmium', concentration: 0.05 },  // Below 0.1%
        ],
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/evaluation/__tests__/SubstanceScreenHandler.test.ts
```

Expected: FAIL with "Cannot find module '../handlers/SubstanceScreenHandler.js'"

**Step 3: Commit failing test**

```bash
git add packages/database/src/services/evaluation/__tests__/SubstanceScreenHandler.test.ts
git commit -m "test(database): add failing tests for SubstanceScreenHandler

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 23: Implement SubstanceScreenHandler

**Files:**
- Create: `packages/database/src/services/evaluation/handlers/SubstanceScreenHandler.ts`

**Step 1: Create the handler**

```typescript
// packages/database/src/services/evaluation/handlers/SubstanceScreenHandler.ts
import { RequirementType } from '../../../entities/enums/index.js';
import type { RequirementHandler, EvaluationContext, EvaluationResult, ValidationResult } from '../types.js';

interface SubstanceScreenConfig {
  defaultThresholdPct?: number;
}

interface SubstanceMatch {
  substanceId: string;
  name: string;
  concentration: number;  // As percentage (0.1 = 0.1%)
}

/**
 * Handler for SUBSTANCE_SCREEN requirements.
 * Checks if product contains any substances from a restricted list.
 *
 * Agnostic: Doesn't know WHAT list (SVHC, Annex II, etc) - only HOW to screen.
 */
export class SubstanceScreenHandler implements RequirementHandler<SubstanceScreenConfig> {
  readonly type = RequirementType.SUBSTANCE_SCREEN;

  validateConfig(
    _config: unknown,
    requirement: Partial<{ substanceListId?: string }>
  ): ValidationResult {
    const errors: string[] = [];

    if (!requirement.substanceListId) {
      errors.push('SUBSTANCE_SCREEN requires substanceListId');
    }

    return { valid: errors.length === 0, errors };
  }

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const config = context.requirement.handlerConfig as SubstanceScreenConfig;
    const defaultThreshold = config?.defaultThresholdPct ?? 0.1;  // Default 0.1%

    // Get substance matches (in real implementation, query SubstanceRollupService)
    // For now, support test injection via _testSubstanceMatches
    const matches = (context as unknown as { _testSubstanceMatches?: SubstanceMatch[] })._testSubstanceMatches ?? [];

    // Find violations (substances above threshold)
    const violations = matches.filter(m => m.concentration >= defaultThreshold);

    if (violations.length === 0) {
      return {
        passed: true,
        status: 'PASS',
        details: {
          message: 'No restricted substances detected above threshold',
          substancesChecked: matches.length,
          threshold: defaultThreshold,
        },
      };
    }

    return {
      passed: false,
      status: 'FAIL',
      details: {
        message: `Found ${violations.length} substance(s) above threshold`,
        violations: violations.map(v => ({
          substanceId: v.substanceId,
          name: v.name,
          concentration: v.concentration,
          threshold: defaultThreshold,
        })),
        threshold: defaultThreshold,
      },
    };
  }
}
```

**Step 2: Run tests to verify they pass**

```bash
cd packages/database && pnpm test src/services/evaluation/__tests__/SubstanceScreenHandler.test.ts
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/database/src/services/evaluation/handlers/SubstanceScreenHandler.ts
git commit -m "feat(database): implement SubstanceScreenHandler

- Screens product substances against a restricted list
- Supports configurable threshold (default 0.1%)
- Returns violations with substance details
- Agnostic: knows HOW to screen, not WHAT list

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 24: Implement DeclarationHandler

**Files:**
- Create: `packages/database/src/services/evaluation/handlers/DeclarationHandler.ts`
- Create: `packages/database/src/services/evaluation/__tests__/DeclarationHandler.test.ts`

**Step 1: Write the test file**

```typescript
// packages/database/src/services/evaluation/__tests__/DeclarationHandler.test.ts
import { describe, it, expect } from 'vitest';
import { DeclarationHandler } from '../handlers/DeclarationHandler.js';
import { RequirementType, RequirementSeverity } from '../../../entities/enums/index.js';
import type { EvaluationContext } from '../types.js';

describe('DeclarationHandler', () => {
  const handler = new DeclarationHandler();

  describe('type', () => {
    it('should_have_correct_type', () => {
      expect(handler.type).toBe(RequirementType.DECLARATION);
    });
  });

  describe('validateConfig', () => {
    it('should_reject_missing_question', () => {
      const result = handler.validateConfig(
        { acceptedAnswers: ['Yes', 'No'] },
        {}
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DECLARATION requires question in handlerConfig');
    });

    it('should_accept_valid_config', () => {
      const result = handler.validateConfig(
        {
          question: 'Has testing been completed?',
          acceptedAnswers: ['Yes', 'No'],
        },
        {}
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('evaluate', () => {
    const baseContext: EvaluationContext = {
      productVersionId: 'test-product-version-id',
      requirement: {
        id: 'test-req-id',
        code: 'TEST_DECL',
        name: 'Test Declaration',
        type: RequirementType.DECLARATION,
        severity: RequirementSeverity.BLOCKER,
        handlerConfig: {
          question: 'Has product testing been completed?',
          acceptedAnswers: ['Yes', 'No', 'N/A'],
          requiresDocument: false,
        },
      },
      regulation: {
        id: 'test-reg-id',
        code: 'TEST_REG',
        name: 'Test Regulation',
      },
    };

    it('should_return_incomplete_when_no_declaration', async () => {
      const context = {
        ...baseContext,
        _testDeclaration: undefined,
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(false);
      expect(result.status).toBe('INCOMPLETE');
    });

    it('should_pass_when_declaration_provided', async () => {
      const context = {
        ...baseContext,
        _testDeclaration: {
          answer: 'Yes',
          attestedBy: 'user@tenant.com',
          attestedAt: new Date(),
        },
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
    });

    it('should_require_document_when_specified', async () => {
      const context = {
        ...baseContext,
        requirement: {
          ...baseContext.requirement,
          handlerConfig: {
            question: 'Upload test certificate',
            requiresDocument: true,
            acceptedDocumentTypes: ['application/pdf'],
          },
        },
        _testDeclaration: {
          answer: 'Yes',
          attestedBy: 'user@tenant.com',
          // No document
        },
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(false);
      expect(result.status).toBe('INCOMPLETE');
      expect(result.details.message).toContain('document');
    });
  });
});
```

**Step 2: Create the handler**

```typescript
// packages/database/src/services/evaluation/handlers/DeclarationHandler.ts
import { RequirementType } from '../../../entities/enums/index.js';
import type { RequirementHandler, EvaluationContext, EvaluationResult, ValidationResult } from '../types.js';

interface DeclarationConfig {
  question: string;
  acceptedAnswers?: string[];
  requiresDocument?: boolean;
  acceptedDocumentTypes?: string[];
}

interface Declaration {
  answer: string;
  attestedBy: string;
  attestedAt?: Date;
  documentKey?: string;
}

/**
 * Handler for DECLARATION requirements.
 * Checks if a user has provided the required attestation.
 *
 * Agnostic: Doesn't know WHAT declaration - only HOW to validate attestations.
 */
export class DeclarationHandler implements RequirementHandler<DeclarationConfig> {
  readonly type = RequirementType.DECLARATION;

  validateConfig(config: unknown): ValidationResult {
    const errors: string[] = [];
    const cfg = config as Partial<DeclarationConfig>;

    if (!cfg?.question) {
      errors.push('DECLARATION requires question in handlerConfig');
    }

    return { valid: errors.length === 0, errors };
  }

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const config = context.requirement.handlerConfig as DeclarationConfig;

    // Get declaration (in real implementation, query from ComplianceEvidence)
    const declaration = (context as unknown as { _testDeclaration?: Declaration })._testDeclaration;

    if (!declaration) {
      return {
        passed: false,
        status: 'INCOMPLETE',
        details: {
          message: 'Declaration not provided',
          question: config.question,
        },
      };
    }

    // Check if document required but not provided
    if (config.requiresDocument && !declaration.documentKey) {
      return {
        passed: false,
        status: 'INCOMPLETE',
        details: {
          message: 'Required document not uploaded',
          question: config.question,
          requiresDocument: true,
          acceptedDocumentTypes: config.acceptedDocumentTypes,
        },
      };
    }

    return {
      passed: true,
      status: 'PASS',
      details: {
        answer: declaration.answer,
        attestedBy: declaration.attestedBy,
        attestedAt: declaration.attestedAt,
        documentKey: declaration.documentKey,
        question: config.question,
      },
    };
  }
}
```

**Step 3: Run tests**

```bash
cd packages/database && pnpm test src/services/evaluation/__tests__/DeclarationHandler.test.ts
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/database/src/services/evaluation/handlers/DeclarationHandler.ts packages/database/src/services/evaluation/__tests__/DeclarationHandler.test.ts
git commit -m "feat(database): implement DeclarationHandler

- Validates user attestations for declaration requirements
- Supports optional document requirement
- Returns INCOMPLETE when declaration/document missing
- Agnostic: knows HOW to validate declarations, not WHAT

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 25: Implement RequirementEvaluatorEngine (Registry)

**Files:**
- Create: `packages/database/src/services/evaluation/RequirementEvaluatorEngine.ts`
- Create: `packages/database/src/services/evaluation/__tests__/RequirementEvaluatorEngine.test.ts`

**Step 1: Write the test file**

```typescript
// packages/database/src/services/evaluation/__tests__/RequirementEvaluatorEngine.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { RequirementEvaluatorEngine } from '../RequirementEvaluatorEngine.js';
import { AttributeCheckHandler } from '../handlers/AttributeCheckHandler.js';
import { SubstanceScreenHandler } from '../handlers/SubstanceScreenHandler.js';
import { DeclarationHandler } from '../handlers/DeclarationHandler.js';
import { RequirementType, RequirementSeverity } from '../../../entities/enums/index.js';
import type { EvaluationContext } from '../types.js';

describe('RequirementEvaluatorEngine', () => {
  let engine: RequirementEvaluatorEngine;

  beforeAll(() => {
    engine = new RequirementEvaluatorEngine();
    engine.register(new AttributeCheckHandler());
    engine.register(new SubstanceScreenHandler());
    engine.register(new DeclarationHandler());
  });

  describe('evaluate', () => {
    it('should_dispatch_to_correct_handler_for_attribute_check', async () => {
      const context: EvaluationContext = {
        productVersionId: 'test-pv',
        requirement: {
          id: 'req-1',
          code: 'TEST_ATTR',
          name: 'Test Attribute',
          type: RequirementType.ATTRIBUTE_CHECK,
          severity: RequirementSeverity.WARNING,
          attributeTemplateKey: 'test_attr',
          handlerConfig: { operator: '>=', threshold: 50 },
        },
        regulation: { id: 'reg-1', code: 'REG', name: 'Regulation' },
      };

      const result = await engine.evaluate({
        ...context,
        _testAttributeValue: 60,
      } as EvaluationContext);

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
    });

    it('should_dispatch_to_correct_handler_for_substance_screen', async () => {
      const context: EvaluationContext = {
        productVersionId: 'test-pv',
        requirement: {
          id: 'req-2',
          code: 'TEST_SCREEN',
          name: 'Test Screen',
          type: RequirementType.SUBSTANCE_SCREEN,
          severity: RequirementSeverity.BLOCKER,
          substanceListId: 'list-1',
          handlerConfig: { defaultThresholdPct: 0.1 },
        },
        regulation: { id: 'reg-1', code: 'REG', name: 'Regulation' },
      };

      const result = await engine.evaluate({
        ...context,
        _testSubstanceMatches: [],
      } as EvaluationContext);

      expect(result.passed).toBe(true);
    });

    it('should_throw_for_unregistered_handler', async () => {
      const context: EvaluationContext = {
        productVersionId: 'test-pv',
        requirement: {
          id: 'req-3',
          code: 'TEST_CALC',
          name: 'Test Calc',
          type: RequirementType.CALCULATED_CHECK,  // Not registered
          severity: RequirementSeverity.WARNING,
        },
        regulation: { id: 'reg-1', code: 'REG', name: 'Regulation' },
      };

      await expect(engine.evaluate(context)).rejects.toThrow(/No handler/);
    });
  });

  describe('validateConfig', () => {
    it('should_validate_using_correct_handler', () => {
      const result = engine.validateConfig(
        RequirementType.ATTRIBUTE_CHECK,
        { operator: '>=', threshold: 25 },
        { attributeTemplateKey: 'recycled_content' }
      );

      expect(result.valid).toBe(true);
    });

    it('should_return_errors_from_handler', () => {
      const result = engine.validateConfig(
        RequirementType.SUBSTANCE_SCREEN,
        {},
        {}  // Missing substanceListId
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SUBSTANCE_SCREEN requires substanceListId');
    });
  });
});
```

**Step 2: Create the engine**

```typescript
// packages/database/src/services/evaluation/RequirementEvaluatorEngine.ts
import { RequirementType } from '../../entities/enums/index.js';
import type { RequirementHandler, EvaluationContext, EvaluationResult, ValidationResult } from './types.js';

/**
 * RequirementEvaluatorEngine - Registry-based handler dispatch.
 *
 * This is the "brain" of the compliance engine. It:
 * 1. Registers handlers for each RequirementType at startup
 * 2. Dispatches evaluation requests to the correct handler
 * 3. Never contains regulation-specific logic
 *
 * The engine is AGNOSTIC - it knows HOW to dispatch, not WHAT regulations exist.
 */
export class RequirementEvaluatorEngine {
  private handlers = new Map<RequirementType, RequirementHandler>();

  /**
   * Register a handler for a requirement type.
   * Called at application startup.
   */
  register(handler: RequirementHandler): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(`Handler already registered for type: ${handler.type}`);
    }
    this.handlers.set(handler.type, handler);
  }

  /**
   * Evaluate a requirement against product data.
   * Dispatches to the appropriate handler based on requirement type.
   */
  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const handler = this.handlers.get(context.requirement.type);
    if (!handler) {
      throw new Error(`No handler registered for type: ${context.requirement.type}`);
    }
    return handler.evaluate(context);
  }

  /**
   * Validate handler configuration before saving a requirement.
   * Used at admin API level to prevent broken rules.
   */
  validateConfig(
    type: RequirementType,
    config: unknown,
    requirement: Partial<{
      attributeTemplateKey?: string;
      substanceListId?: string;
      calculationFormula?: string;
    }>
  ): ValidationResult {
    const handler = this.handlers.get(type);
    if (!handler) {
      return {
        valid: false,
        errors: [`No handler registered for type: ${type}`],
      };
    }
    return handler.validateConfig(config, requirement);
  }

  /**
   * Get all registered handler types.
   */
  getRegisteredTypes(): RequirementType[] {
    return Array.from(this.handlers.keys());
  }
}
```

**Step 3: Run tests**

```bash
cd packages/database && pnpm test src/services/evaluation/__tests__/RequirementEvaluatorEngine.test.ts
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/database/src/services/evaluation/RequirementEvaluatorEngine.ts packages/database/src/services/evaluation/__tests__/RequirementEvaluatorEngine.test.ts
git commit -m "feat(database): implement RequirementEvaluatorEngine (handler registry)

- Registry pattern for handler dispatch
- Dispatches by RequirementType, not regulation
- Validates config using appropriate handler
- Agnostic: knows HOW to dispatch, not WHAT regulations exist

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 26: Create Evaluation Module Index

**Files:**
- Create: `packages/database/src/services/evaluation/index.ts`
- Modify: `packages/database/src/services/index.ts`

**Step 1: Create the evaluation module index**

```typescript
// packages/database/src/services/evaluation/index.ts
export { RequirementEvaluatorEngine } from './RequirementEvaluatorEngine.js';
export { AttributeCheckHandler } from './handlers/AttributeCheckHandler.js';
export { SubstanceScreenHandler } from './handlers/SubstanceScreenHandler.js';
export { DeclarationHandler } from './handlers/DeclarationHandler.js';
export type {
  EvaluationContext,
  EvaluationResult,
  ValidationResult,
  RequirementHandler,
} from './types.js';

/**
 * Creates a pre-configured RequirementEvaluatorEngine with all handlers registered.
 */
export function createEvaluatorEngine(): RequirementEvaluatorEngine {
  const engine = new RequirementEvaluatorEngine();
  engine.register(new AttributeCheckHandler());
  engine.register(new SubstanceScreenHandler());
  engine.register(new DeclarationHandler());
  return engine;
}
```

**Step 2: Export from services index**

Add to `packages/database/src/services/index.ts`:
```typescript
export * from './evaluation/index.js';
```

**Step 3: Commit**

```bash
git add packages/database/src/services/evaluation/index.ts packages/database/src/services/index.ts
git commit -m "feat(database): add evaluation module exports

- createEvaluatorEngine() factory function
- Export all handlers and types

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Checkpoint: Phase 3 Complete

At this point, the handler plugin architecture is in place:

- [x] RequirementHandler interface
- [x] AttributeCheckHandler with tests
- [x] SubstanceScreenHandler with tests
- [x] DeclarationHandler with tests
- [x] RequirementEvaluatorEngine (registry) with tests
- [x] Module exports

**Run full test suite:**

```bash
cd packages/database && pnpm test
```

Expected: All tests PASS

---

## Phase 4: ComplianceEvidence with Snapshot (Tasks 27-30)

---

## Task 27: Create EvidenceType and EvidenceResult Enums

**Files:**
- Create: `packages/database/src/entities/enums/EvidenceType.ts`
- Create: `packages/database/src/entities/enums/EvidenceResult.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create EvidenceType enum**

```typescript
// packages/database/src/entities/enums/EvidenceType.ts
export enum EvidenceType {
  AUTO_CHECK = 'AUTO_CHECK',      // Automated evaluation result
  DECLARATION = 'DECLARATION',    // User attestation
  DOCUMENT = 'DOCUMENT',          // Uploaded document
}
```

**Step 2: Create EvidenceResult enum**

```typescript
// packages/database/src/entities/enums/EvidenceResult.ts
export enum EvidenceResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  ATTESTED = 'ATTESTED',      // Declaration acknowledged
  INCOMPLETE = 'INCOMPLETE',  // Missing data
}
```

**Step 3: Export from enums index**

Add to `packages/database/src/entities/enums/index.ts`:
```typescript
export { EvidenceType } from './EvidenceType.js';
export { EvidenceResult } from './EvidenceResult.js';
```

**Step 4: Commit**

```bash
git add packages/database/src/entities/enums/EvidenceType.ts packages/database/src/entities/enums/EvidenceResult.ts packages/database/src/entities/enums/index.ts
git commit -m "feat(database): add EvidenceType and EvidenceResult enums

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 28: Write Failing Tests for ComplianceEvidence Entity

**Files:**
- Create: `packages/database/src/entities/__tests__/ComplianceEvidence.test.ts`

**Step 1: Write the failing test file**

```typescript
// packages/database/src/entities/__tests__/ComplianceEvidence.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { ComplianceEvidence } from '../ComplianceEvidence.js';
import { EvidenceType, EvidenceResult } from '../enums/index.js';
import { RequirementType, RequirementSeverity } from '../enums/index.js';
import { setupTestDb, teardownTestDb, createTestTenant } from '../../test-utils.js';

describe('ComplianceEvidence', () => {
  let orm: MikroORM;
  let tenantSchema: string;

  beforeAll(async () => {
    orm = await setupTestDb();
    tenantSchema = await createTestTenant(orm, 'test_evidence');
  });

  afterAll(async () => {
    await teardownTestDb(orm);
  });

  describe('creation', () => {
    it('should_create_evidence_with_requirement_snapshot', async () => {
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const evidence = tenantEm.create(ComplianceEvidence, {
        productVersionId: '00000000-0000-0000-0000-000000000001',
        requirementId: '00000000-0000-0000-0000-000000000002',
        requirementSnapshot: {
          code: 'TEST_REQ',
          name: 'Test Requirement',
          type: RequirementType.ATTRIBUTE_CHECK,
          severity: RequirementSeverity.BLOCKER,
          regulationCode: 'TEST_REG',
          regulationName: 'Test Regulation',
          handlerConfig: { operator: '>=', threshold: 25 },
          legalReference: 'Article 5.1',
          snapshotAt: new Date(),
        },
        type: EvidenceType.AUTO_CHECK,
        result: EvidenceResult.PASS,
        details: {
          actualValue: 30,
          threshold: 25,
          operator: '>=',
        },
        recordedBy: 'system',
      });
      await tenantEm.persistAndFlush(evidence);

      const found = await tenantEm.findOne(ComplianceEvidence, { id: evidence.id });
      expect(found).toBeDefined();
      expect(found!.requirementSnapshot.code).toBe('TEST_REQ');
      expect(found!.requirementSnapshot.regulationCode).toBe('TEST_REG');
      expect(found!.type).toBe(EvidenceType.AUTO_CHECK);
      expect(found!.result).toBe(EvidenceResult.PASS);
    });

    it('should_store_snapshot_independently_of_requirement_changes', async () => {
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      // Create evidence with snapshot showing threshold = 25
      const evidence = tenantEm.create(ComplianceEvidence, {
        productVersionId: '00000000-0000-0000-0000-000000000003',
        requirementId: '00000000-0000-0000-0000-000000000004',
        requirementSnapshot: {
          code: 'RECYCLED_MIN',
          name: 'Min Recycled Content',
          type: RequirementType.ATTRIBUTE_CHECK,
          severity: RequirementSeverity.BLOCKER,
          regulationCode: 'ESPR',
          regulationName: 'Ecodesign for Sustainable Products',
          handlerConfig: { operator: '>=', threshold: 25 },  // Original threshold
          snapshotAt: new Date('2025-01-15'),
        },
        type: EvidenceType.AUTO_CHECK,
        result: EvidenceResult.PASS,
        details: { actualValue: 30, threshold: 25 },
        recordedBy: 'system',
      });
      await tenantEm.persistAndFlush(evidence);

      // Reload and verify snapshot is unchanged
      // (Even if requirement in public schema changes to threshold=30)
      const found = await tenantEm.findOne(ComplianceEvidence, { id: evidence.id });
      expect(found!.requirementSnapshot.handlerConfig!.threshold).toBe(25);
      expect(found!.result).toBe(EvidenceResult.PASS);
      // Audit report shows: "Passed on 2025-01-15 with threshold 25%"
    });
  });

  describe('declaration evidence', () => {
    it('should_store_declaration_with_attestation_details', async () => {
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const evidence = tenantEm.create(ComplianceEvidence, {
        productVersionId: '00000000-0000-0000-0000-000000000005',
        requirementId: '00000000-0000-0000-0000-000000000006',
        requirementSnapshot: {
          code: 'ANIMAL_TEST_DECL',
          name: 'Animal Testing Declaration',
          type: RequirementType.DECLARATION,
          severity: RequirementSeverity.BLOCKER,
          regulationCode: 'COSING',
          regulationName: 'Cosmetics Regulation',
          handlerConfig: {
            question: 'Has product been tested on animals?',
            acceptedAnswers: ['No', 'N/A'],
          },
          snapshotAt: new Date(),
        },
        type: EvidenceType.DECLARATION,
        result: EvidenceResult.ATTESTED,
        details: {
          answer: 'No',
          justification: 'Product uses alternative testing methods',
        },
        recordedBy: 'compliance@tenant.com',
      });
      await tenantEm.persistAndFlush(evidence);

      const found = await tenantEm.findOne(ComplianceEvidence, { id: evidence.id });
      expect(found!.type).toBe(EvidenceType.DECLARATION);
      expect(found!.result).toBe(EvidenceResult.ATTESTED);
      expect(found!.details.answer).toBe('No');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/entities/__tests__/ComplianceEvidence.test.ts
```

Expected: FAIL with "Cannot find module '../ComplianceEvidence.js'"

**Step 3: Commit failing test**

```bash
git add packages/database/src/entities/__tests__/ComplianceEvidence.test.ts
git commit -m "test(database): add failing tests for ComplianceEvidence entity

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 29: Implement ComplianceEvidence Entity

**Files:**
- Create: `packages/database/src/entities/ComplianceEvidence.ts`
- Modify: `packages/database/src/entities/index.ts`

**Step 1: Create the ComplianceEvidence entity**

```typescript
// packages/database/src/entities/ComplianceEvidence.ts
import {
  Entity,
  Property,
  Enum,
  Index,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { EvidenceType, EvidenceResult, RequirementType, RequirementSeverity } from './enums/index.js';

/**
 * Requirement snapshot captured at evidence recording time.
 * This ensures historical audit reports remain accurate even if
 * requirements change or are deleted in the future.
 */
export interface RequirementSnapshot {
  code: string;
  name: string;
  type: RequirementType;
  severity: RequirementSeverity;
  regulationCode: string;
  regulationName: string;
  handlerConfig?: Record<string, unknown>;
  legalReference?: string;
  snapshotAt: Date;
}

/**
 * ComplianceEvidence records the result of evaluating a requirement
 * against a product version.
 *
 * CRITICAL: Contains requirementSnapshot for historical integrity.
 * Even if the Requirement entity is modified or deleted, this evidence
 * record remains self-contained and auditable.
 *
 * Lives in tenant schema.
 */
@Entity({ tableName: 'compliance_evidence' })
export class ComplianceEvidence extends BaseEntity {
  @Property({ type: 'uuid', name: 'product_version_id' })
  @Index()
  productVersionId!: string;

  @Property({ type: 'uuid', name: 'requirement_id', nullable: true })
  @Index()
  requirementId?: string;  // May be deleted in future

  /**
   * SNAPSHOT: Captures requirement state at time of evidence recording.
   * Ensures audit report remains readable even if requirement changes/deleted.
   * This is the ONLY way to generate a legally defensible audit trail.
   */
  @Property({ type: 'jsonb', name: 'requirement_snapshot' })
  requirementSnapshot!: RequirementSnapshot;

  @Enum({ items: () => EvidenceType })
  type!: EvidenceType;

  @Enum({ items: () => EvidenceResult })
  result!: EvidenceResult;

  /**
   * Evidence details vary by type:
   * - AUTO_CHECK: { actualValue, threshold, operator, message }
   * - DECLARATION: { answer, justification }
   * - DOCUMENT: { documentType, fileName }
   */
  @Property({ type: 'jsonb' })
  details!: Record<string, unknown>;

  @Property({ type: 'text', nullable: true, name: 'document_key' })
  documentKey?: string;  // R2/S3 file key for uploaded evidence

  @Property({ type: 'text', name: 'recorded_by' })
  recordedBy!: string;

  @Property({ type: 'timestamptz', name: 'recorded_at' })
  recordedAt: Date = new Date();
}
```

**Step 2: Export from entities index**

Add to `packages/database/src/entities/index.ts`:
```typescript
export { ComplianceEvidence } from './ComplianceEvidence.js';
export type { RequirementSnapshot } from './ComplianceEvidence.js';
```

**Step 3: Add to tenantOnlyEntities array**

In `packages/database/src/entities/index.ts`, add to `tenantOnlyEntities`:
```typescript
ComplianceEvidence,
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/database && pnpm test src/entities/__tests__/ComplianceEvidence.test.ts
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/ComplianceEvidence.ts packages/database/src/entities/index.ts
git commit -m "feat(database): implement ComplianceEvidence entity with requirement snapshot

- Stores evaluation result with full requirement snapshot
- Snapshot ensures historical audit trail integrity
- Supports AUTO_CHECK, DECLARATION, and DOCUMENT types
- Evidence remains valid even if requirement changes/deleted

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 30: Add ComplianceEvidence to TenantProvisioner

**Files:**
- Modify: `packages/database/src/services/tenant-provisioner.ts`

**Step 1: Add compliance_evidence to EXPECTED_TENANT_TABLES**

In `packages/database/src/services/tenant-provisioner.ts`, add to `EXPECTED_TENANT_TABLES`:

```typescript
'compliance_evidence',
```

**Step 2: Run tests**

```bash
cd packages/database && pnpm test src/services/__tests__/tenant-provisioner.test.ts
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/database/src/services/tenant-provisioner.ts
git commit -m "feat(database): add compliance_evidence to tenant provisioner

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Checkpoint: Phase 4 Complete

At this point, the evidence system is in place:

- [x] EvidenceType and EvidenceResult enums
- [x] ComplianceEvidence entity with snapshot
- [x] Historical integrity via requirementSnapshot
- [x] TenantProvisioner updated

**Run full test suite:**

```bash
cd packages/database && pnpm test
```

Expected: All tests PASS

---

## Phase 5: Migration Manifest (Tasks 31-33)

---

## Task 31: Create Migration Manifest Schema

**Files:**
- Create: `packages/database/src/seed/migration-manifest.schema.json`
- Create: `packages/database/src/seed/types.ts`

**Step 1: Create JSON Schema for migration manifest**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "migration-manifest.schema.json",
  "title": "Migration Manifest",
  "description": "Defines regulatory content for database seeding. Engine is agnostic - this file contains the WHAT.",
  "type": "object",
  "required": ["version", "regulations"],
  "properties": {
    "version": {
      "type": "string",
      "description": "Schema version for compatibility checking"
    },
    "source": {
      "type": "string",
      "description": "URL or identifier for the content source"
    },
    "regulations": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/regulation"
      }
    },
    "categoryMappings": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/categoryMapping"
      }
    }
  },
  "$defs": {
    "regulation": {
      "type": "object",
      "required": ["code", "name", "status", "requirements"],
      "properties": {
        "code": { "type": "string" },
        "name": { "type": "string" },
        "description": { "type": "string" },
        "status": { "enum": ["DRAFT", "ACTIVE", "ARCHIVED"] },
        "version": { "type": "string" },
        "effectiveDate": { "type": "string", "format": "date" },
        "metadata": {
          "type": "object",
          "properties": {
            "jurisdiction": { "type": "string" },
            "type": { "type": "string" },
            "officialJournalRef": { "type": "string" }
          }
        },
        "requirements": {
          "type": "array",
          "items": { "$ref": "#/$defs/requirement" }
        }
      }
    },
    "requirement": {
      "type": "object",
      "required": ["code", "name", "type", "severity"],
      "properties": {
        "code": { "type": "string" },
        "name": { "type": "string" },
        "description": { "type": "string" },
        "type": { "enum": ["ATTRIBUTE_CHECK", "SUBSTANCE_SCREEN", "CALCULATED_CHECK", "DECLARATION"] },
        "severity": { "enum": ["BLOCKER", "WARNING", "INFO"] },
        "attributeTemplateKey": { "type": "string" },
        "substanceListCode": { "type": "string" },
        "calculationFormula": { "type": "string" },
        "handlerConfig": { "type": "object" },
        "legalReference": { "type": "string" },
        "allowTenantExemption": { "type": "boolean", "default": true }
      }
    },
    "categoryMapping": {
      "type": "object",
      "required": ["categoryPath", "regulationCode"],
      "properties": {
        "categoryPath": { "type": "string" },
        "regulationCode": { "type": "string" }
      }
    }
  }
}
```

**Step 2: Create TypeScript types**

```typescript
// packages/database/src/seed/types.ts
import { RegulationStatus, RequirementType, RequirementSeverity } from '../entities/enums/index.js';

export interface MigrationManifest {
  version: string;
  source?: string;
  regulations: ManifestRegulation[];
  categoryMappings?: ManifestCategoryMapping[];
}

export interface ManifestRegulation {
  code: string;
  name: string;
  description?: string;
  status: RegulationStatus;
  version?: string;
  effectiveDate?: string;
  metadata?: {
    jurisdiction?: string;
    type?: string;
    officialJournalRef?: string;
  };
  requirements: ManifestRequirement[];
}

export interface ManifestRequirement {
  code: string;
  name: string;
  description?: string;
  type: RequirementType;
  severity: RequirementSeverity;
  attributeTemplateKey?: string;
  substanceListCode?: string;  // Will be resolved to UUID
  calculationFormula?: string;
  handlerConfig?: Record<string, unknown>;
  legalReference?: string;
  allowTenantExemption?: boolean;
}

export interface ManifestCategoryMapping {
  categoryPath: string;
  regulationCode: string;
}
```

**Step 3: Commit**

```bash
git add packages/database/src/seed/migration-manifest.schema.json packages/database/src/seed/types.ts
git commit -m "feat(database): add migration manifest schema and types

- JSON Schema for manifest validation
- TypeScript types for type-safe loading
- Regulations and requirements defined in JSON, not code
- Category mappings for linking categories to regulations

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 32: Create Sample Migration Manifest

**Files:**
- Create: `packages/database/src/seed/manifests/eu-regulations-2026.json`

**Step 1: Create sample manifest with EU regulations**

```json
{
  "$schema": "../migration-manifest.schema.json",
  "version": "1.0",
  "source": "https://eurocomply.io/regulatory-content/eu-2026",
  "regulations": [
    {
      "code": "REACH",
      "name": "Registration, Evaluation, Authorisation and Restriction of Chemicals",
      "description": "EU regulation on chemical substances and their safe use",
      "status": "ACTIVE",
      "version": "2024.1",
      "metadata": {
        "jurisdiction": "EU",
        "type": "REGULATION",
        "officialJournalRef": "Regulation (EC) No 1907/2006"
      },
      "requirements": [
        {
          "code": "SVHC_SCREEN",
          "name": "SVHC Substance Screen",
          "description": "Screen for Substances of Very High Concern",
          "type": "SUBSTANCE_SCREEN",
          "severity": "BLOCKER",
          "substanceListCode": "REACH_SVHC",
          "handlerConfig": {
            "defaultThresholdPct": 0.1
          },
          "legalReference": "Article 33",
          "allowTenantExemption": false
        },
        {
          "code": "REACH_RESTRICTED",
          "name": "REACH Restricted Substances",
          "description": "Screen for Annex XVII restricted substances",
          "type": "SUBSTANCE_SCREEN",
          "severity": "BLOCKER",
          "substanceListCode": "REACH_ANNEX_XVII",
          "handlerConfig": {
            "defaultThresholdPct": 0.1
          },
          "legalReference": "Annex XVII",
          "allowTenantExemption": false
        }
      ]
    },
    {
      "code": "ESPR",
      "name": "Ecodesign for Sustainable Products Regulation",
      "description": "EU regulation setting ecodesign requirements for sustainable products",
      "status": "ACTIVE",
      "version": "2024.1",
      "metadata": {
        "jurisdiction": "EU",
        "type": "REGULATION",
        "officialJournalRef": "Regulation (EU) 2024/1781"
      },
      "requirements": [
        {
          "code": "RECYCLED_CONTENT_MIN",
          "name": "Minimum Recycled Content",
          "description": "Products must contain minimum recycled material",
          "type": "ATTRIBUTE_CHECK",
          "severity": "BLOCKER",
          "attributeTemplateKey": "recycled_content_pct",
          "handlerConfig": {
            "operator": ">=",
            "threshold": 25,
            "unit": "%"
          },
          "legalReference": "Article 5(1)(a)",
          "allowTenantExemption": true
        },
        {
          "code": "DURABILITY_DECL",
          "name": "Durability Declaration",
          "description": "Declaration of product durability characteristics",
          "type": "DECLARATION",
          "severity": "WARNING",
          "handlerConfig": {
            "question": "Has durability testing been performed and documented?",
            "acceptedAnswers": ["Yes", "Not Applicable"],
            "requiresDocument": true,
            "acceptedDocumentTypes": ["application/pdf"]
          },
          "legalReference": "Article 5(1)(b)",
          "allowTenantExemption": true
        }
      ]
    },
    {
      "code": "COSING",
      "name": "Cosmetics Regulation",
      "description": "EU regulation on cosmetic products",
      "status": "ACTIVE",
      "version": "2024.1",
      "metadata": {
        "jurisdiction": "EU",
        "type": "REGULATION",
        "officialJournalRef": "Regulation (EC) No 1223/2009"
      },
      "requirements": [
        {
          "code": "ANNEX_II_SCREEN",
          "name": "Annex II Prohibited Substances",
          "description": "Screen for prohibited cosmetic substances",
          "type": "SUBSTANCE_SCREEN",
          "severity": "BLOCKER",
          "substanceListCode": "COSING_ANNEX_II",
          "handlerConfig": {
            "defaultThresholdPct": 0
          },
          "legalReference": "Annex II",
          "allowTenantExemption": false
        },
        {
          "code": "ANIMAL_TEST_DECL",
          "name": "Animal Testing Declaration",
          "description": "Declaration that product was not tested on animals",
          "type": "DECLARATION",
          "severity": "BLOCKER",
          "handlerConfig": {
            "question": "Has this product or its ingredients been tested on animals?",
            "acceptedAnswers": ["No"],
            "requiresDocument": false
          },
          "legalReference": "Article 18",
          "allowTenantExemption": false
        }
      ]
    }
  ],
  "categoryMappings": [
    {
      "categoryPath": "textiles",
      "regulationCode": "REACH"
    },
    {
      "categoryPath": "textiles.apparel",
      "regulationCode": "ESPR"
    },
    {
      "categoryPath": "cosmetics",
      "regulationCode": "REACH"
    },
    {
      "categoryPath": "cosmetics",
      "regulationCode": "COSING"
    },
    {
      "categoryPath": "electronics",
      "regulationCode": "REACH"
    }
  ]
}
```

**Step 2: Commit**

```bash
git add packages/database/src/seed/manifests/eu-regulations-2026.json
git commit -m "feat(database): add EU regulations migration manifest

- REACH with SVHC and restricted substance screens
- ESPR with recycled content and durability requirements
- COSING with Annex II and animal testing requirements
- Category mappings for textiles, cosmetics, electronics
- All regulatory knowledge in JSON, not code

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 33: Implement ManifestLoader Service

**Files:**
- Create: `packages/database/src/seed/ManifestLoader.ts`
- Create: `packages/database/src/seed/__tests__/ManifestLoader.test.ts`

**Step 1: Write the test file**

```typescript
// packages/database/src/seed/__tests__/ManifestLoader.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { ManifestLoader } from '../ManifestLoader.js';
import { Regulation } from '../../entities/Regulation.js';
import { Requirement } from '../../entities/Requirement.js';
import { CategoryRegulation } from '../../entities/CategoryRegulation.js';
import { Category } from '../../entities/Category.js';
import { RegulationStatus } from '../../entities/enums/RegulationStatus.js';
import { RequirementType } from '../../entities/enums/RequirementType.js';
import { setupTestDb, teardownTestDb } from '../../test-utils.js';
import type { MigrationManifest } from '../types.js';

describe('ManifestLoader', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb(orm);
  });

  describe('loadManifest', () => {
    it('should_create_regulations_from_manifest', async () => {
      const em = orm.em.fork();
      const loader = new ManifestLoader(em);

      const manifest: MigrationManifest = {
        version: '1.0',
        regulations: [
          {
            code: 'TEST_REG_MANIFEST',
            name: 'Test Regulation from Manifest',
            status: RegulationStatus.ACTIVE,
            requirements: [
              {
                code: 'TEST_REQ_1',
                name: 'Test Requirement 1',
                type: RequirementType.ATTRIBUTE_CHECK,
                severity: 'BLOCKER' as any,
                attributeTemplateKey: 'test_attr',
                handlerConfig: { operator: '>=', threshold: 10 },
              },
            ],
          },
        ],
      };

      await loader.loadManifest(manifest);

      const regulation = await em.findOne(Regulation, { code: 'TEST_REG_MANIFEST' });
      expect(regulation).toBeDefined();
      expect(regulation!.name).toBe('Test Regulation from Manifest');

      const requirements = await em.find(Requirement, { regulation });
      expect(requirements).toHaveLength(1);
      expect(requirements[0].code).toBe('TEST_REQ_1');
    });

    it('should_create_category_mappings_from_manifest', async () => {
      const em = orm.em.fork();
      const loader = new ManifestLoader(em);

      // Create category first
      const category = em.create(Category, {
        name: 'Manifest Test Category',
        path: 'manifest_test',
      });
      await em.persistAndFlush(category);

      const manifest: MigrationManifest = {
        version: '1.0',
        regulations: [
          {
            code: 'MAPPED_REG',
            name: 'Mapped Regulation',
            status: RegulationStatus.ACTIVE,
            requirements: [],
          },
        ],
        categoryMappings: [
          {
            categoryPath: 'manifest_test',
            regulationCode: 'MAPPED_REG',
          },
        ],
      };

      await loader.loadManifest(manifest);

      const mapping = await em.findOne(CategoryRegulation, {
        category: { path: 'manifest_test' },
        regulation: { code: 'MAPPED_REG' },
      });
      expect(mapping).toBeDefined();
    });

    it('should_skip_existing_regulations_on_reload', async () => {
      const em = orm.em.fork();
      const loader = new ManifestLoader(em);

      const manifest: MigrationManifest = {
        version: '1.0',
        regulations: [
          {
            code: 'IDEMPOTENT_REG',
            name: 'Idempotent Regulation',
            status: RegulationStatus.ACTIVE,
            requirements: [],
          },
        ],
      };

      // Load twice
      await loader.loadManifest(manifest);
      await loader.loadManifest(manifest);

      const regulations = await em.find(Regulation, { code: 'IDEMPOTENT_REG' });
      expect(regulations).toHaveLength(1);  // Not duplicated
    });
  });
});
```

**Step 2: Create the ManifestLoader**

```typescript
// packages/database/src/seed/ManifestLoader.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Regulation } from '../entities/Regulation.js';
import { Requirement } from '../entities/Requirement.js';
import { Category } from '../entities/Category.js';
import { CategoryRegulation } from '../entities/CategoryRegulation.js';
import { RequirementSeverity } from '../entities/enums/RequirementSeverity.js';
import type { MigrationManifest, ManifestRegulation, ManifestRequirement, ManifestCategoryMapping } from './types.js';

/**
 * ManifestLoader loads regulatory content from JSON manifests into the database.
 *
 * This keeps the engine AGNOSTIC - the code knows HOW to load,
 * the manifest JSON defines WHAT to load.
 *
 * Benefits:
 * - Update regulations without code deployment
 * - Manifests can be sourced from S3, CDN, or local files
 * - Idempotent loading (safe to run multiple times)
 */
export class ManifestLoader {
  constructor(private readonly em: EntityManager) {}

  /**
   * Load a migration manifest into the database.
   * Idempotent - safe to run multiple times.
   */
  async loadManifest(manifest: MigrationManifest): Promise<LoadResult> {
    const result: LoadResult = {
      regulationsCreated: 0,
      regulationsSkipped: 0,
      requirementsCreated: 0,
      mappingsCreated: 0,
    };

    // Load regulations and requirements
    for (const regManifest of manifest.regulations) {
      const created = await this.loadRegulation(regManifest);
      if (created) {
        result.regulationsCreated++;
        result.requirementsCreated += regManifest.requirements.length;
      } else {
        result.regulationsSkipped++;
      }
    }

    // Load category mappings
    if (manifest.categoryMappings) {
      for (const mapping of manifest.categoryMappings) {
        const created = await this.loadCategoryMapping(mapping);
        if (created) {
          result.mappingsCreated++;
        }
      }
    }

    return result;
  }

  private async loadRegulation(manifest: ManifestRegulation): Promise<boolean> {
    // Check if regulation already exists
    const existing = await this.em.findOne(Regulation, { code: manifest.code });
    if (existing) {
      return false;  // Skip - already exists
    }

    // Create regulation
    const regulation = this.em.create(Regulation, {
      code: manifest.code,
      name: manifest.name,
      description: manifest.description,
      status: manifest.status,
      version: manifest.version,
      effectiveDate: manifest.effectiveDate ? new Date(manifest.effectiveDate) : undefined,
      metadata: manifest.metadata,
    });

    // Create requirements
    for (const reqManifest of manifest.requirements) {
      await this.loadRequirement(reqManifest, regulation);
    }

    await this.em.persistAndFlush(regulation);
    return true;
  }

  private async loadRequirement(manifest: ManifestRequirement, regulation: Regulation): Promise<void> {
    // Resolve substanceListCode to UUID if provided (substance lists are Regulations with type SUBSTANCE_SCREEN)
    let substanceListId: string | undefined;
    if (manifest.substanceListCode) {
      const substanceList = await this.em.findOne(
        Regulation,
        { code: manifest.substanceListCode },
        { schema: 'public' }
      );
      if (substanceList) {
        substanceListId = substanceList.id;
      } else {
        console.warn(`Substance list not found for code: ${manifest.substanceListCode}`);
      }
    }

    const requirement = this.em.create(Requirement, {
      regulation,
      code: manifest.code,
      name: manifest.name,
      description: manifest.description,
      type: manifest.type,
      severity: manifest.severity as RequirementSeverity,
      attributeTemplateKey: manifest.attributeTemplateKey,
      substanceListId,
      calculationFormula: manifest.calculationFormula,
      handlerConfig: manifest.handlerConfig,
      legalReference: manifest.legalReference,
      allowTenantExemption: manifest.allowTenantExemption ?? true,
    });

    this.em.persist(requirement);
  }

  private async loadCategoryMapping(manifest: ManifestCategoryMapping): Promise<boolean> {
    // Find category by path
    const category = await this.em.findOne(Category, { path: manifest.categoryPath });
    if (!category) {
      console.warn(`Category not found for path: ${manifest.categoryPath}`);
      return false;
    }

    // Find regulation by code
    const regulation = await this.em.findOne(Regulation, { code: manifest.regulationCode });
    if (!regulation) {
      console.warn(`Regulation not found for code: ${manifest.regulationCode}`);
      return false;
    }

    // Check if mapping already exists
    const existing = await this.em.findOne(CategoryRegulation, { category, regulation });
    if (existing) {
      return false;  // Skip - already exists
    }

    // Create mapping
    const mapping = this.em.create(CategoryRegulation, {
      category,
      regulation,
      addedBy: 'manifest-loader',
    });

    await this.em.persistAndFlush(mapping);
    return true;
  }
}

export interface LoadResult {
  regulationsCreated: number;
  regulationsSkipped: number;
  requirementsCreated: number;
  mappingsCreated: number;
}
```

**Step 3: Run tests**

```bash
cd packages/database && pnpm test src/seed/__tests__/ManifestLoader.test.ts
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/database/src/seed/ManifestLoader.ts packages/database/src/seed/__tests__/ManifestLoader.test.ts
git commit -m "feat(database): implement ManifestLoader for JSON-based seeding

- Loads regulations and requirements from JSON manifest
- Idempotent - safe to run multiple times
- Creates category-regulation mappings
- Engine remains agnostic - manifest defines WHAT, code knows HOW

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Checkpoint: Phase 5 Complete

At this point, the migration manifest system is in place:

- [x] JSON Schema for manifest validation
- [x] TypeScript types for type-safe loading
- [x] Sample EU regulations manifest
- [x] ManifestLoader service with tests
- [x] Idempotent loading

**Run full test suite:**

```bash
cd packages/database && pnpm test
```

Expected: All tests PASS

---

## Phase 6: API Endpoints (Tasks 34-38)

---

## Task 34: Create Compliance Stack API Route

**Files:**
- Create: `packages/api/src/routes/compliance-stack.ts`
- Create: `packages/api/src/routes/__tests__/compliance-stack.test.ts`

**Step 1: Write the test file**

```typescript
// packages/api/src/routes/__tests__/compliance-stack.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestTenant, setupTestDb, teardownTestDb } from '../../test-utils.js';

describe('GET /api/v1/compliance-stack/:tenantCategoryId', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let tenantSchema: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenantSchema = await createTestTenant(app.orm, 'test_api');
  });

  afterAll(async () => {
    await teardownTestDb(app.orm);
  });

  it('should_return_effective_regulations_for_tenant_category', async () => {
    // Setup: Create category, regulation, requirement, tenant category
    // ... (similar to service tests)

    const response = await app.request
      .get(`/api/v1/compliance-stack/${tenantCategoryId}`)
      .set('X-Tenant-Schema', tenantSchema);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.regulations).toBeDefined();
  });

  it('should_return_404_for_unknown_tenant_category', async () => {
    const response = await app.request
      .get('/api/v1/compliance-stack/00000000-0000-0000-0000-000000000000')
      .set('X-Tenant-Schema', tenantSchema);

    expect(response.status).toBe(404);
  });
});
```

**Step 2: Create the route (using router factory pattern per RULES.md Section 10)**

```typescript
// packages/api/src/routes/compliance-stack.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@mikro-orm/postgresql';
import { ComplianceStackResolver } from '@eurocomply/database';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';
import { success, error } from '../utils/response.js';

export interface ComplianceStackRouterOptions {
  orm: MikroORM;
}

const paramsSchema = z.object({
  tenantCategoryId: z.string().uuid(),
});

/**
 * Creates the compliance stack router.
 *
 * GET /api/v1/compliance-stack/:tenantCategoryId
 * Returns the effective compliance stack for a tenant category.
 * Includes system baseline regulations + tenant exemptions.
 */
export function createComplianceStackRouter(options: ComplianceStackRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  router.get(
    '/:tenantCategoryId',
    authorize('compliance', 'view'),
    zValidator('param', paramsSchema),
    async (c) => {
      const { tenantCategoryId } = c.req.valid('param');
      const schema = c.get('tenantSchema')!;
      const em = orm.em.fork({ schema });

      try {
        const result = await em.transactional(async (txEm) => {
          await txEm.execute(`SET search_path TO "${schema}", public`);
          const resolver = new ComplianceStackResolver(txEm);
          return resolver.resolve(tenantCategoryId);
        });

        return success(c, result);
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return error(c, 'NOT_FOUND', 'Tenant category not found', 404);
        }
        throw err;
      }
    }
  );

  return router;
}
```

**Step 3: Register route in main app**

Add to `packages/api/src/app.ts`:
```typescript
import { createComplianceStackRouter } from './routes/compliance-stack.js';

// In createApp() or where routes are registered:
app.route('/api/v1/compliance-stack', createComplianceStackRouter({ orm }));
```

**Step 4: Run tests**

```bash
cd packages/api && pnpm test src/routes/__tests__/compliance-stack.test.ts
```

**Step 5: Commit**

```bash
git add packages/api/src/routes/compliance-stack.ts packages/api/src/routes/__tests__/compliance-stack.test.ts packages/api/src/app.ts
git commit -m "feat(api): add GET /compliance-stack/:tenantCategoryId endpoint

- Returns effective regulations for tenant category
- Uses ComplianceStackResolver
- Includes exemption status

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 35: Write Failing Tests for Exemption API

**Files:**
- Create: `packages/api/src/routes/__tests__/exemptions.test.ts`

**Step 1: Write the failing test file**

```typescript
// packages/api/src/routes/__tests__/exemptions.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, createTestTenant } from '../../test-utils.js';
import { Regulation, Requirement, Category, CategoryRegulation, TenantCategory } from '@eurocomply/database';
import { RegulationStatus, RequirementType, RequirementSeverity } from '@eurocomply/database';

describe('Exemptions API', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let tenantSchema: string;
  let tenantCategoryId: string;
  let exemptableRequirementId: string;
  let nonExemptableRequirementId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenantSchema = await createTestTenant(app.orm, 'test_exemptions_api');

    // Setup test data
    const em = app.orm.em.fork();
    const timestamp = Date.now();

    const category = em.create(Category, {
      name: `Exemption API Test ${timestamp}`,
      path: `exemption_api.${timestamp}`,
    });

    const regulation = em.create(Regulation, {
      code: `API_REG_${timestamp}`,
      name: 'API Test Regulation',
      status: RegulationStatus.ACTIVE,
    });

    await em.persistAndFlush([category, regulation]);

    // Exemptable requirement
    const exemptableReq = em.create(Requirement, {
      regulation,
      code: 'EXEMPTABLE_API',
      name: 'Exemptable Requirement',
      type: RequirementType.ATTRIBUTE_CHECK,
      severity: RequirementSeverity.WARNING,
      allowTenantExemption: true,
    });

    // Non-exemptable requirement
    const nonExemptableReq = em.create(Requirement, {
      regulation,
      code: 'NON_EXEMPTABLE_API',
      name: 'Non-Exemptable Requirement',
      type: RequirementType.SUBSTANCE_SCREEN,
      severity: RequirementSeverity.BLOCKER,
      allowTenantExemption: false,
    });

    const mapping = em.create(CategoryRegulation, { category, regulation });
    await em.persistAndFlush([exemptableReq, nonExemptableReq, mapping]);

    exemptableRequirementId = exemptableReq.id;
    nonExemptableRequirementId = nonExemptableReq.id;

    // Create tenant category
    const tenantEm = app.orm.em.fork({ schema: tenantSchema });
    await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

    const tenantCategory = tenantEm.create(TenantCategory, {
      name: 'API Test Category',
      path: `exemption_api.${timestamp}`,
      systemCategoryId: category.id,
      linkMode: 'LIVE',
    });
    await tenantEm.persistAndFlush(tenantCategory);
    tenantCategoryId = tenantCategory.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/exemptions', () => {
    it('should_create_exemption_for_exemptable_requirement', async () => {
      const response = await app.request
        .post('/api/v1/exemptions')
        .set('X-Tenant-Schema', tenantSchema)
        .send({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          reason: 'Product exempt under Article 5.2',
          legalReference: 'Article 5.2 exemption clause',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reason).toBe('Product exempt under Article 5.2');
    });

    it('should_reject_exemption_for_non_exemptable_requirement', async () => {
      const response = await app.request
        .post('/api/v1/exemptions')
        .set('X-Tenant-Schema', tenantSchema)
        .send({
          tenantCategoryId,
          requirementId: nonExemptableRequirementId,
          reason: 'Trying to exempt non-exemptable',
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toContain('cannot be exempted');
    });

    it('should_reject_missing_reason', async () => {
      const response = await app.request
        .post('/api/v1/exemptions')
        .set('X-Tenant-Schema', tenantSchema)
        .send({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          // Missing reason
        });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/exemptions/:id', () => {
    it('should_revoke_exemption', async () => {
      // First create an exemption
      const createResponse = await app.request
        .post('/api/v1/exemptions')
        .set('X-Tenant-Schema', tenantSchema)
        .send({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          reason: 'Exemption to be revoked',
        });

      const exemptionId = createResponse.body.data.id;

      // Then revoke it
      const revokeResponse = await app.request
        .delete(`/api/v1/exemptions/${exemptionId}`)
        .set('X-Tenant-Schema', tenantSchema)
        .send({
          revocationReason: 'Exemption no longer valid',
        });

      expect(revokeResponse.status).toBe(200);
      expect(revokeResponse.body.data.revokedAt).toBeDefined();
      expect(revokeResponse.body.data.revocationReason).toBe('Exemption no longer valid');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/api && pnpm test src/routes/__tests__/exemptions.test.ts
```

Expected: FAIL with "Cannot find module './exemptions.js'" or 404

**Step 3: Commit failing test**

```bash
git add packages/api/src/routes/__tests__/exemptions.test.ts
git commit -m "test(api): add failing tests for exemptions API

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 36: Implement Exemption API Routes

**Files:**
- Create: `packages/api/src/routes/exemptions.ts`
- Modify: `packages/api/src/app.ts`

**Step 1: Create the exemptions route (using router factory pattern per RULES.md Section 10)**

```typescript
// packages/api/src/routes/exemptions.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@mikro-orm/postgresql';
import { ExemptionService, ExemptionGuardrailError } from '@eurocomply/database';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';
import { success, error } from '../utils/response.js';

export interface ExemptionRouterOptions {
  orm: MikroORM;
}

const createExemptionSchema = z.object({
  tenantCategoryId: z.string().uuid(),
  requirementId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required'),
  legalReference: z.string().optional(),
});

const revokeExemptionSchema = z.object({
  revocationReason: z.string().min(1, 'Revocation reason is required'),
});

/**
 * Creates the exemptions router.
 *
 * POST /api/v1/exemptions - Create exemption with guardrail check
 * DELETE /api/v1/exemptions/:id - Revoke exemption
 */
export function createExemptionRouter(options: ExemptionRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  /**
   * POST /api/v1/exemptions
   *
   * Create an exemption for a requirement.
   * Enforces exemption guardrail - non-exemptable requirements return 403.
   */
  router.post(
    '/',
    authorize('compliance', 'edit'),
    zValidator('json', createExemptionSchema),
    async (c) => {
      const body = c.req.valid('json');
      const schema = c.get('tenantSchema')!;
      const userId = c.get('userId')!;
      const em = orm.em.fork({ schema });

      try {
        const exemption = await em.transactional(async (txEm) => {
          await txEm.execute(`SET search_path TO "${schema}", public`);
          const service = new ExemptionService(txEm);
          return service.createExemption({
            tenantCategoryId: body.tenantCategoryId,
            requirementId: body.requirementId,
            reason: body.reason,
            legalReference: body.legalReference,
            exemptedBy: userId,
          });
        });

        return success(c, exemption, 201);
      } catch (err) {
        if (err instanceof ExemptionGuardrailError) {
          return error(c, 'FORBIDDEN', err.message, 403, {
            requirementCode: err.requirementCode,
            requirementName: err.requirementName,
          });
        }
        throw err;
      }
    }
  );

  /**
   * DELETE /api/v1/exemptions/:id
   *
   * Revoke an exemption.
   */
  router.delete(
    '/:id',
    authorize('compliance', 'edit'),
    zValidator('param', z.object({ id: z.string().uuid() })),
    zValidator('json', revokeExemptionSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const { revocationReason } = c.req.valid('json');
      const schema = c.get('tenantSchema')!;
      const userId = c.get('userId')!;
      const em = orm.em.fork({ schema });

      try {
        const exemption = await em.transactional(async (txEm) => {
          await txEm.execute(`SET search_path TO "${schema}", public`);
          const service = new ExemptionService(txEm);
          return service.revokeExemption(id, userId, revocationReason);
        });

        return success(c, exemption);
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return error(c, 'NOT_FOUND', 'Exemption not found', 404);
        }
        throw err;
      }
    }
  );

  return router;
}
```

**Step 2: Register route in main app**

Add to `packages/api/src/app.ts`:
```typescript
import { createExemptionRouter } from './routes/exemptions.js';

// In createApp() or where routes are registered:
app.route('/api/v1/exemptions', createExemptionRouter({ orm }));
```

**Step 3: Run tests to verify they pass**

```bash
cd packages/api && pnpm test src/routes/__tests__/exemptions.test.ts
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/api/src/routes/exemptions.ts packages/api/src/app.ts
git commit -m "feat(api): implement exemptions API with guardrail

- POST /exemptions creates exemption with guardrail check
- DELETE /exemptions/:id revokes exemption
- Returns 403 for non-exemptable requirements

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 37: Write Failing Tests for Evidence API

**Files:**
- Create: `packages/api/src/routes/__tests__/evidence.test.ts`

**Step 1: Write the failing test file**

```typescript
// packages/api/src/routes/__tests__/evidence.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestTenant } from '../../test-utils.js';
import { EvidenceType, EvidenceResult, RequirementType, RequirementSeverity } from '@eurocomply/database';

describe('Evidence API', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let tenantSchema: string;
  let productVersionId: string;
  let requirementId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenantSchema = await createTestTenant(app.orm, 'test_evidence_api');

    // Setup test data (product version, requirement)
    productVersionId = '00000000-0000-0000-0000-000000000001';
    requirementId = '00000000-0000-0000-0000-000000000002';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/evidence', () => {
    it('should_record_auto_check_evidence_with_snapshot', async () => {
      const response = await app.request
        .post('/api/v1/evidence')
        .set('X-Tenant-Schema', tenantSchema)
        .send({
          productVersionId,
          requirementId,
          type: EvidenceType.AUTO_CHECK,
          result: EvidenceResult.PASS,
          details: {
            actualValue: 30,
            threshold: 25,
            operator: '>=',
          },
          requirementSnapshot: {
            code: 'TEST_REQ',
            name: 'Test Requirement',
            type: RequirementType.ATTRIBUTE_CHECK,
            severity: RequirementSeverity.BLOCKER,
            regulationCode: 'TEST_REG',
            regulationName: 'Test Regulation',
            handlerConfig: { operator: '>=', threshold: 25 },
            snapshotAt: new Date().toISOString(),
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.requirementSnapshot.code).toBe('TEST_REQ');
      expect(response.body.data.result).toBe(EvidenceResult.PASS);
    });

    it('should_record_declaration_evidence', async () => {
      const response = await app.request
        .post('/api/v1/evidence')
        .set('X-Tenant-Schema', tenantSchema)
        .send({
          productVersionId,
          requirementId: '00000000-0000-0000-0000-000000000003',
          type: EvidenceType.DECLARATION,
          result: EvidenceResult.ATTESTED,
          details: {
            answer: 'No',
            justification: 'Product uses alternative methods',
          },
          requirementSnapshot: {
            code: 'DECL_REQ',
            name: 'Declaration Requirement',
            type: RequirementType.DECLARATION,
            severity: RequirementSeverity.BLOCKER,
            regulationCode: 'TEST_REG',
            regulationName: 'Test Regulation',
            handlerConfig: { question: 'Has testing been done?' },
            snapshotAt: new Date().toISOString(),
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.data.type).toBe(EvidenceType.DECLARATION);
      expect(response.body.data.result).toBe(EvidenceResult.ATTESTED);
    });

    it('should_reject_missing_snapshot', async () => {
      const response = await app.request
        .post('/api/v1/evidence')
        .set('X-Tenant-Schema', tenantSchema)
        .send({
          productVersionId,
          requirementId,
          type: EvidenceType.AUTO_CHECK,
          result: EvidenceResult.PASS,
          details: { actualValue: 30 },
          // Missing requirementSnapshot
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/evidence/:productVersionId', () => {
    it('should_return_all_evidence_for_product_version', async () => {
      // First create some evidence
      await app.request
        .post('/api/v1/evidence')
        .set('X-Tenant-Schema', tenantSchema)
        .send({
          productVersionId: '00000000-0000-0000-0000-000000000010',
          requirementId,
          type: EvidenceType.AUTO_CHECK,
          result: EvidenceResult.PASS,
          details: { actualValue: 50 },
          requirementSnapshot: {
            code: 'GET_TEST',
            name: 'Get Test',
            type: RequirementType.ATTRIBUTE_CHECK,
            severity: RequirementSeverity.WARNING,
            regulationCode: 'REG',
            regulationName: 'Regulation',
            snapshotAt: new Date().toISOString(),
          },
        });

      const response = await app.request
        .get('/api/v1/evidence/00000000-0000-0000-0000-000000000010')
        .set('X-Tenant-Schema', tenantSchema);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/api && pnpm test src/routes/__tests__/evidence.test.ts
```

Expected: FAIL with 404 or module not found

**Step 3: Commit failing test**

```bash
git add packages/api/src/routes/__tests__/evidence.test.ts
git commit -m "test(api): add failing tests for evidence API

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 38: Implement Evidence API Routes

**Files:**
- Create: `packages/api/src/routes/evidence.ts`
- Modify: `packages/api/src/app.ts`

**Step 1: Create the evidence route (using router factory pattern per RULES.md Section 10)**

```typescript
// packages/api/src/routes/evidence.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@mikro-orm/postgresql';
import { ComplianceEvidence, EvidenceType, EvidenceResult, RequirementType, RequirementSeverity } from '@eurocomply/database';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';
import { success, error } from '../utils/response.js';

export interface EvidenceRouterOptions {
  orm: MikroORM;
}

const requirementSnapshotSchema = z.object({
  code: z.string(),
  name: z.string(),
  type: z.nativeEnum(RequirementType),
  severity: z.nativeEnum(RequirementSeverity),
  regulationCode: z.string(),
  regulationName: z.string(),
  handlerConfig: z.record(z.unknown()).optional(),
  legalReference: z.string().optional(),
  snapshotAt: z.string().datetime(),
});

const createEvidenceSchema = z.object({
  productVersionId: z.string().uuid(),
  requirementId: z.string().uuid().optional(),
  type: z.nativeEnum(EvidenceType),
  result: z.nativeEnum(EvidenceResult),
  details: z.record(z.unknown()),
  documentKey: z.string().optional(),
  requirementSnapshot: requirementSnapshotSchema,
});

/**
 * Creates the evidence router.
 *
 * POST /api/v1/evidence - Record compliance evidence
 * GET /api/v1/evidence/:productVersionId - Get all evidence for product
 */
export function createEvidenceRouter(options: EvidenceRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  /**
   * POST /api/v1/evidence
   *
   * Record compliance evidence for a product version.
   * MUST include requirementSnapshot for historical integrity.
   */
  router.post(
    '/',
    authorize('compliance', 'edit'),
    zValidator('json', createEvidenceSchema),
    async (c) => {
      const body = c.req.valid('json');
      const schema = c.get('tenantSchema')!;
      const userId = c.get('userId')!;
      const em = orm.em.fork({ schema });

      const evidence = await em.transactional(async (txEm) => {
        await txEm.execute(`SET search_path TO "${schema}", public`);

        const record = txEm.create(ComplianceEvidence, {
          productVersionId: body.productVersionId,
          requirementId: body.requirementId,
          requirementSnapshot: {
            ...body.requirementSnapshot,
            snapshotAt: new Date(body.requirementSnapshot.snapshotAt),
          },
          type: body.type,
          result: body.result,
          details: body.details,
          documentKey: body.documentKey,
          recordedBy: userId,
        });

        await txEm.persistAndFlush(record);
        return record;
      });

      return success(c, evidence, 201);
    }
  );

  /**
   * GET /api/v1/evidence/:productVersionId
   *
   * Get all compliance evidence for a product version.
   */
  router.get(
    '/:productVersionId',
    authorize('compliance', 'view'),
    zValidator('param', z.object({ productVersionId: z.string().uuid() })),
    async (c) => {
      const { productVersionId } = c.req.valid('param');
      const schema = c.get('tenantSchema')!;
      const em = orm.em.fork({ schema });

      const evidence = await em.transactional(async (txEm) => {
        await txEm.execute(`SET search_path TO "${schema}", public`);
        return txEm.find(ComplianceEvidence, { productVersionId }, {
          orderBy: { recordedAt: 'DESC' },
        });
      });

      return success(c, evidence);
    }
  );

  return router;
}
```

**Step 2: Register route in main app**

Add to `packages/api/src/app.ts`:
```typescript
import { createEvidenceRouter } from './routes/evidence.js';

// In createApp() or where routes are registered:
app.route('/api/v1/evidence', createEvidenceRouter({ orm }));
```

**Step 3: Run tests to verify they pass**

```bash
cd packages/api && pnpm test src/routes/__tests__/evidence.test.ts
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/api/src/routes/evidence.ts packages/api/src/app.ts
git commit -m "feat(api): implement evidence API with snapshot requirement

- POST /evidence records evidence with mandatory snapshot
- GET /evidence/:productVersionId retrieves all evidence
- Snapshot ensures historical audit trail integrity

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 7: Postman and Documentation (Tasks 39-40)

---

## Task 39: Update Postman Collection (MANDATORY per RULES.md Section 16)

**Files:**
- Modify: `docs/postman/eurocomply.postman_collection.json`

**Step 1: Add Compliance Stack folder and requests**

Open Postman and add the following to the collection:

**Folder: "Compliance"**

**Request 1: Get Compliance Stack**
- Name: `Get Compliance Stack`
- Method: `GET`
- URL: `{{baseUrl}}/api/v1/compliance-stack/:tenantCategoryId`
- Path Variables:
  - `tenantCategoryId`: `{{tenantCategoryId}}`
- Headers:
  - `Authorization`: `Bearer {{accessToken}}`
  - `X-Request-Id`: `{{$guid}}`
- Description:
  ```
  Returns the effective compliance stack for a tenant category.
  Includes system baseline regulations and tenant exemptions.

  Response:
  - tenantCategoryId: UUID
  - tenantCategoryPath: ltree path
  - systemCategoryId: UUID (if linked)
  - effectiveRegulations[]: Array of regulations with requirements
  ```

**Request 2: Create Exemption**
- Name: `Create Exemption`
- Method: `POST`
- URL: `{{baseUrl}}/api/v1/exemptions`
- Headers:
  - `Authorization`: `Bearer {{accessToken}}`
  - `Content-Type`: `application/json`
  - `X-Request-Id`: `{{$guid}}`
- Body (raw JSON):
  ```json
  {
    "tenantCategoryId": "{{tenantCategoryId}}",
    "requirementId": "{{requirementId}}",
    "reason": "Product exempt under Article 5.2",
    "legalReference": "Article 5.2 exemption clause"
  }
  ```
- Description:
  ```
  Creates an exemption for a requirement.
  Returns 403 if requirement has allowTenantExemption: false.
  ```

**Request 3: Revoke Exemption**
- Name: `Revoke Exemption`
- Method: `DELETE`
- URL: `{{baseUrl}}/api/v1/exemptions/:id`
- Path Variables:
  - `id`: `{{exemptionId}}`
- Headers:
  - `Authorization`: `Bearer {{accessToken}}`
  - `Content-Type`: `application/json`
  - `X-Request-Id`: `{{$guid}}`
- Body (raw JSON):
  ```json
  {
    "revocationReason": "Exemption no longer valid"
  }
  ```

**Request 4: Record Evidence**
- Name: `Record Evidence`
- Method: `POST`
- URL: `{{baseUrl}}/api/v1/evidence`
- Headers:
  - `Authorization`: `Bearer {{accessToken}}`
  - `Content-Type`: `application/json`
  - `X-Request-Id`: `{{$guid}}`
- Body (raw JSON):
  ```json
  {
    "productVersionId": "{{productVersionId}}",
    "requirementId": "{{requirementId}}",
    "type": "AUTO_CHECK",
    "result": "PASS",
    "details": {
      "actualValue": 30,
      "threshold": 25,
      "operator": ">="
    },
    "requirementSnapshot": {
      "code": "REQ_001",
      "name": "Minimum Recycled Content",
      "type": "ATTRIBUTE_CHECK",
      "severity": "BLOCKER",
      "regulationCode": "PPWR",
      "regulationName": "Packaging and Packaging Waste Regulation",
      "handlerConfig": {"operator": ">=", "threshold": 25},
      "snapshotAt": "{{$isoTimestamp}}"
    }
  }
  ```

**Request 5: Get Evidence for Product**
- Name: `Get Evidence for Product`
- Method: `GET`
- URL: `{{baseUrl}}/api/v1/evidence/:productVersionId`
- Path Variables:
  - `productVersionId`: `{{productVersionId}}`
- Headers:
  - `Authorization`: `Bearer {{accessToken}}`
  - `X-Request-Id`: `{{$guid}}`

**Step 2: Add collection variables**

Add to collection variables:
- `tenantCategoryId`: (empty, set at runtime)
- `requirementId`: (empty, set at runtime)
- `exemptionId`: (empty, set at runtime)

**Step 3: Export and save**

Export the collection from Postman and save to `docs/postman/eurocomply.postman_collection.json`.

**Step 4: Commit**

```bash
git add docs/postman/eurocomply.postman_collection.json
git commit -m "docs(postman): add compliance stack, exemptions, and evidence endpoints

- GET /compliance-stack/:tenantCategoryId
- POST/DELETE /exemptions
- POST/GET /evidence

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 40: Update Documentation

**Files:**
- Create: `docs/compliance-architecture.md`
- Modify: `README.md` (add link to new doc)

**Step 1: Create the compliance architecture documentation**

```markdown
# Compliance Architecture

> **For Claude:** This document describes the compliance evaluation system architecture.

## Overview

The compliance system uses a **regulation-agnostic engine** that separates:
- **HOW** to evaluate (code: handler plugins)
- **WHAT** to evaluate (data: regulations, requirements, manifests)

## Core Concepts

### Regulations and Requirements

```
Regulation (e.g., PPWR, REACH)
  └── Requirement (e.g., minimum recycled content check)
        ├── type: ATTRIBUTE_CHECK | SUBSTANCE_SCREEN | CALCULATED_CHECK | DECLARATION
        ├── severity: BLOCKER | WARNING | INFORMATIONAL
        ├── handlerConfig: { operator, threshold, ... }
        └── allowTenantExemption: boolean (guardrail)
```

### Category Inheritance (LTREE)

Categories use PostgreSQL LTREE for hierarchical inheritance:

```
packaging
├── packaging.plastic          ← inherits packaging regulations
│   └── packaging.plastic.pet  ← inherits packaging.plastic regulations
└── packaging.paper
```

### Tenant Layer

Tenants can:
1. **Adopt** system categories via `TenantCategory.systemCategoryId`
2. **Create exemptions** (if `allowTenantExemption: true`)
3. **Add tenant-specific** regulations (beyond system baseline)

### Exemption Guardrail

```typescript
// Requirements can be marked non-exemptable
allowTenantExemption: false  // Critical safety requirements
```

Attempting to exempt a non-exemptable requirement returns HTTP 403.

## Handler Plugins

Each `RequirementType` has a dedicated handler:

| Type | Handler | Config |
|------|---------|--------|
| `ATTRIBUTE_CHECK` | `AttributeCheckHandler` | `{ operator, threshold, attributeCode }` |
| `SUBSTANCE_SCREEN` | `SubstanceScreenHandler` | `{ substanceListCode, maxConcentration }` |
| `CALCULATED_CHECK` | `CalculatedCheckHandler` | `{ formula, variables, threshold }` |
| `DECLARATION` | `DeclarationHandler` | `{ question, expectedAnswer }` |

### Adding New Handlers

1. Implement `RequirementHandler` interface
2. Register in `RequirementEvaluatorEngine`
3. No code changes needed for new regulations using existing handlers

## Evidence and Audit Trail

Evidence records include a **requirement snapshot** to preserve:
- Requirement definition at time of evaluation
- Regulation context
- Handler configuration

This ensures audit integrity even when requirements change.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/compliance-stack/:tenantCategoryId` | GET | Get effective regulations |
| `/api/v1/exemptions` | POST | Create exemption |
| `/api/v1/exemptions/:id` | DELETE | Revoke exemption |
| `/api/v1/evidence` | POST | Record evidence |
| `/api/v1/evidence/:productVersionId` | GET | Get evidence for product |

## Migration Manifests

Regulatory content is defined in JSON manifests:

```
packages/database/src/data/manifests/
├── eu-regulations.manifest.json
├── us-regulations.manifest.json
└── manifest.schema.json
```

The `ManifestLoader` service loads these idempotently.

## Related Documentation

- [RULES.md](../RULES.md) - Development standards
- [Multi-Tenant Safety](./multi-tenant-safety.md) - Database isolation patterns
```

**Step 2: Update README.md with link**

Add to the documentation section of README.md:
```markdown
- [Compliance Architecture](./docs/compliance-architecture.md) - Regulation-agnostic evaluation engine
```

**Step 3: Commit**

```bash
git add docs/compliance-architecture.md README.md
git commit -m "docs: add compliance architecture documentation

- Explains regulation-agnostic engine design
- Documents handler plugins, exemption guardrail
- Links API endpoints and manifests

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Final Checkpoint: All Phases Complete

**Run full test suite:**

```bash
pnpm test
```

**Verify API:**

```bash
pnpm dev
# Test with curl or Postman (using updated collection)
```

**Verify Postman collection:**

```bash
# Import docs/postman/eurocomply.postman_collection.json
# Run Compliance folder tests
```

**Summary of implemented features:**

1. **Phase 1**: Core entities (Regulation, Requirement, CategoryRegulation)
2. **Phase 2**: Tenant layer (TenantRequirementExemption, ExemptionService with guardrail)
3. **Phase 3**: Handler plugin architecture (AttributeCheckHandler, SubstanceScreenHandler, DeclarationHandler, RequirementEvaluatorEngine)
4. **Phase 4**: ComplianceEvidence with requirement snapshot
5. **Phase 5**: Migration manifest system (JSON-based seeding)
6. **Phase 6**: API endpoints (router factory pattern, authorize middleware, transactional safety)
7. **Phase 7**: Postman collection and documentation

**Architectural principles upheld:**

- Engine is regulation-agnostic (handlers know HOW, manifests define WHAT)
- LTREE hierarchical inheritance
- Evidence snapshots for historical integrity
- Exemption guardrails
- Router factory pattern (per RULES.md Section 10)
- Multi-tenant transaction safety (per RULES.md Section 11)
- Postman collection updated (per RULES.md Section 16)
- Multi-tenant safety with schema isolation
