# AI Regulation Ingestor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a hybrid AI-powered pipeline that ingests EU regulations from structured APIs (ECHA) and unstructured legal text (EUR-Lex), with dual-model validation and human-in-the-loop review.

**Architecture:** Dual-path ingestion (ECHA XML → direct parse, EUR-Lex PDF → Claude extraction + Gemini shadow validation), staging tables for review, admin dashboard for approval, then publish to production `public.regulation` tables.

**Tech Stack:** Claude 4.5 API, Gemini 2.0 Flash API, TypeScript, Hono (API), React (Admin UI), PostgreSQL, MikroORM, Vitest.

---

## Critical Refinements

These refinements address edge cases and improve production-readiness:

### 1. CAS Mapping (Task 19 - PublishService)
During `PublishService.publish()`, map `cas_number` to existing `Substance` records in `public.substance`. This prevents duplicate substances and maintains the chemical library as the single source of truth.

```typescript
// In PublishService.publish():
const existingSubstance = await em.findOne(Substance, { casNumber: stagingReq.casNumber });
if (existingSubstance) {
  requirement.substanceListId = existingSubstance.id;
} else {
  // Create new substance or flag for review
}
```

### 2. Unit Normalization (Task 15 - Comparator)
Add unit conversion in `Comparator` before comparing thresholds. AI models may extract identical values in different units (e.g., 0.1% = 1000 ppm = 1000 mg/kg).

```typescript
// Unit conversion table
const UNIT_TO_PPM: Record<string, number> = {
  'PERCENT_BY_WEIGHT': 10000,  // 1% = 10,000 ppm
  'PPM': 1,
  'MG_KG': 1,                  // mg/kg = ppm
  'MG_L': 1,
};

// Normalize before comparison
function toPpm(value: number, unit: string): number {
  return value * (UNIT_TO_PPM[unit] ?? 1);
}
```

### 3. Partial Publishing (Task 19 - PublishService)
`PublishService` must support partial approval. A 200-rule regulation might have 199 approved and 1 conflict. Publish the approved requirements, leave conflicts in staging for later resolution.

```typescript
// In PublishService:
async publishApproved(stagingRegulationId: string, publishedBy: string): Promise<PublishResult> {
  const approvedReqs = requirements.filter(r => r.isApproved);
  const pendingReqs = requirements.filter(r => !r.isApproved);

  // Publish approved only
  // Update staging status to PARTIALLY_APPROVED if pending remain
}
```

### 4. Audit Detail (Task 8 - StagingService.updateRequirement)
`IngestionAuditLog` must store complete before/after diffs for manual edits. Essential for legal defensibility when an admin changes an AI-extracted threshold.

```typescript
// In StagingService.updateRequirement():
const auditLog = em.create(IngestionAuditLog, {
  action: IngestionAction.EDITED,
  actorId: editedBy,
  details: {
    before: {
      thresholdValue: requirement.thresholdValue,
      unit: requirement.unit,
      operator: requirement.operator,
      scope: requirement.scope,
    },
    after: updates,
    editReason: updates.editReason, // Optional: why the edit was made
  },
});
```

---

## Prerequisites

Before starting, ensure:
1. Database is running: `pnpm db:start`
2. Migrations are applied: database has `public.regulation`, `public.requirement`, `public.category_regulation` tables
3. Environment variables set in `.env`:
   - `ANTHROPIC_API_KEY` (for Claude)
   - `GOOGLE_AI_API_KEY` (for Gemini)

---

## Phase 0: Staging Infrastructure (Tasks 1-8)

### Task 1: Create StagingStatus Enum

**Files:**
- Create: `packages/database/src/entities/enums/StagingStatus.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Write the enum file**

Create `packages/database/src/entities/enums/StagingStatus.ts`:

```typescript
/**
 * Status of a staging regulation through the review workflow.
 */
export enum StagingStatus {
  /** Awaiting review */
  PENDING = 'PENDING',
  /** Approved and ready to publish */
  APPROVED = 'APPROVED',
  /** Rejected by reviewer */
  REJECTED = 'REJECTED',
  /** Some requirements approved, some pending */
  PARTIALLY_APPROVED = 'PARTIALLY_APPROVED',
  /** Published to production tables */
  PUBLISHED = 'PUBLISHED',
}
```

**Step 2: Export from enums index**

Add to `packages/database/src/entities/enums/index.ts`:

```typescript
export { StagingStatus } from './StagingStatus.js';
```

**Step 3: Commit**

```bash
git add packages/database/src/entities/enums/StagingStatus.ts packages/database/src/entities/enums/index.ts
git commit -m "$(cat <<'EOF'
feat(database): add StagingStatus enum for ingestor workflow

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create ConsensusStatus Enum

**Files:**
- Create: `packages/database/src/entities/enums/ConsensusStatus.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Write the enum file**

Create `packages/database/src/entities/enums/ConsensusStatus.ts`:

```typescript
/**
 * Consensus status between primary (Claude) and shadow (Gemini) extraction.
 */
export enum ConsensusStatus {
  /** Both models agree on values */
  MATCH = 'MATCH',
  /** Models disagree - requires human review */
  CONFLICT = 'CONFLICT',
  /** Models agree but confidence < 95% */
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  /** No shadow extraction performed (e.g., structured ECHA import) */
  SHADOW_MISSING = 'SHADOW_MISSING',
}
```

**Step 2: Export from enums index**

Add to `packages/database/src/entities/enums/index.ts`:

```typescript
export { ConsensusStatus } from './ConsensusStatus.js';
```

**Step 3: Commit**

```bash
git add packages/database/src/entities/enums/ConsensusStatus.ts packages/database/src/entities/enums/index.ts
git commit -m "$(cat <<'EOF'
feat(database): add ConsensusStatus enum for dual-model validation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create StagingRegulation Entity

**Files:**
- Create: `packages/database/src/entities/StagingRegulation.ts`
- Test: `packages/database/src/entities/StagingRegulation.test.ts`

**Step 1: Write the failing test**

Create `packages/database/src/entities/StagingRegulation.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { StagingRegulation } from './StagingRegulation.js';
import { StagingStatus } from './enums/StagingStatus.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('StagingRegulation', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
    em = orm.em.fork();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  describe('entity creation', () => {
    it('should_create_staging_regulation_with_required_fields', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const staging = em.create(StagingRegulation, {
        code: 'TEST-REG-001',
        name: 'Test Regulation',
        sourceUrl: 'https://eur-lex.europa.eu/test',
        sourceType: 'EUR_LEX',
        primaryPayload: { regulations: [] },
        status: StagingStatus.PENDING,
      });

      await em.persistAndFlush(staging);

      expect(staging.id).toBeDefined();
      expect(staging.code).toBe('TEST-REG-001');
      expect(staging.status).toBe(StagingStatus.PENDING);
      expect(staging.createdAt).toBeInstanceOf(Date);

      // Cleanup
      await em.removeAndFlush(staging);
    });

    it('should_default_status_to_pending', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const staging = em.create(StagingRegulation, {
        code: 'TEST-REG-002',
        name: 'Test Regulation 2',
        sourceUrl: 'https://eur-lex.europa.eu/test2',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
      });

      expect(staging.status).toBe(StagingStatus.PENDING);

      // No flush needed - just testing defaults
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/entities/StagingRegulation.test.ts
```

Expected: FAIL with "Cannot find module './StagingRegulation.js'"

**Step 3: Write the entity**

Create `packages/database/src/entities/StagingRegulation.ts`:

```typescript
import {
  Entity,
  Property,
  Enum,
  OneToMany,
  Collection,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { StagingStatus } from './enums/StagingStatus.js';
import type { StagingRequirement } from './StagingRequirement.js';

/**
 * Source type for regulation ingestion.
 */
export type SourceType = 'EUR_LEX' | 'ECHA' | 'MANUAL';

/**
 * Staging table for regulations pending review.
 *
 * Regulations are extracted by AI (Claude) from legal documents,
 * validated against a shadow model (Gemini), then reviewed by
 * platform admins before publishing to production tables.
 *
 * Lives in the public schema.
 */
@Entity({ tableName: 'staging_regulation', schema: 'public' })
export class StagingRegulation extends BaseEntity {
  /**
   * Proposed regulation code (e.g., 'REACH_ANNEX_XVII')
   */
  @Property({ type: 'text' })
  code!: string;

  /**
   * Proposed regulation name
   */
  @Property({ type: 'text' })
  name!: string;

  /**
   * URL to the source document
   */
  @Property({ type: 'text', name: 'source_url' })
  sourceUrl!: string;

  /**
   * Type of source: EUR_LEX, ECHA, or MANUAL
   */
  @Property({ type: 'text', name: 'source_type' })
  sourceType!: SourceType;

  /**
   * Claude's full extraction payload (JSON)
   */
  @Property({ type: 'jsonb', name: 'primary_payload' })
  primaryPayload!: object;

  /**
   * Gemini's simplified extraction for validation (JSON)
   */
  @Property({ type: 'jsonb', nullable: true, name: 'shadow_payload' })
  shadowPayload?: object;

  /**
   * Additional metadata from extraction
   */
  @Property({ type: 'jsonb', nullable: true, name: 'regulation_metadata' })
  regulationMetadata?: {
    jurisdiction?: string;
    type?: string;
    officialJournalRef?: string;
    effectiveDate?: string;
    version?: string;
  };

  /**
   * Workflow status
   */
  @Enum({ items: () => StagingStatus, default: StagingStatus.PENDING })
  status: StagingStatus = StagingStatus.PENDING;

  /**
   * User who reviewed this staging regulation
   */
  @Property({ type: 'text', nullable: true, name: 'reviewed_by' })
  reviewedBy?: string;

  /**
   * Timestamp when review was completed
   */
  @Property({ type: 'timestamptz', nullable: true, name: 'approved_at' })
  approvedAt?: Date;

  /**
   * Reason for rejection (if rejected)
   */
  @Property({ type: 'text', nullable: true, name: 'rejection_reason' })
  rejectionReason?: string;

  /**
   * ID of the published regulation (after publishing)
   */
  @Property({ type: 'text', nullable: true, name: 'published_regulation_id' })
  publishedRegulationId?: string;

  /**
   * Requirements extracted for this regulation
   */
  @OneToMany('StagingRequirement', 'stagingRegulation')
  requirements = new Collection<StagingRequirement>(this);
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm build && pnpm test src/entities/StagingRegulation.test.ts
```

Expected: PASS (may fail if table doesn't exist yet - that's ok, we'll add migration later)

**Step 5: Commit**

```bash
git add packages/database/src/entities/StagingRegulation.ts packages/database/src/entities/StagingRegulation.test.ts
git commit -m "$(cat <<'EOF'
feat(database): add StagingRegulation entity for ingestor workflow

Stores AI-extracted regulations pending human review before
publishing to production tables.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Create StagingRequirement Entity

**Files:**
- Create: `packages/database/src/entities/StagingRequirement.ts`
- Test: `packages/database/src/entities/StagingRequirement.test.ts`

**Step 1: Write the failing test**

Create `packages/database/src/entities/StagingRequirement.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { StagingRegulation } from './StagingRegulation.js';
import { StagingRequirement } from './StagingRequirement.js';
import { StagingStatus } from './enums/StagingStatus.js';
import { ConsensusStatus } from './enums/ConsensusStatus.js';
import { RequirementType } from './enums/RequirementType.js';
import { RequirementSeverity } from './enums/RequirementSeverity.js';
import { ComparisonOperator } from './enums/ComparisonOperator.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('StagingRequirement', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
    em = orm.em.fork();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  describe('entity creation', () => {
    it('should_create_staging_requirement_with_consensus_status', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create parent staging regulation
      const stagingReg = em.create(StagingRegulation, {
        code: 'TEST-REG-REQ-001',
        name: 'Test Regulation for Requirements',
        sourceUrl: 'https://eur-lex.europa.eu/test',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        status: StagingStatus.PENDING,
      });
      await em.persistAndFlush(stagingReg);

      // Create staging requirement
      const stagingReq = em.create(StagingRequirement, {
        stagingRegulation: stagingReg,
        code: 'LEAD_LIMIT',
        name: 'Lead Content Limit',
        substanceName: 'Lead',
        casNumber: '7439-92-1',
        operator: ComparisonOperator.LT,
        thresholdValue: 0.05,
        unit: 'PERCENT_BY_WEIGHT',
        scope: ['Jewellery', 'Hair accessories'],
        legalReference: 'Entry 63, Paragraph 1',
        type: RequirementType.SUBSTANCE_SCREEN,
        severity: RequirementSeverity.BLOCKER,
        confidenceScore: 0.97,
        reasoning: 'Applied 2024 amendment',
        consensusStatus: ConsensusStatus.MATCH,
      });
      await em.persistAndFlush(stagingReq);

      expect(stagingReq.id).toBeDefined();
      expect(stagingReq.consensusStatus).toBe(ConsensusStatus.MATCH);
      expect(stagingReq.thresholdValue).toBe(0.05);
      expect(stagingReq.scope).toContain('Jewellery');

      // Cleanup
      await em.removeAndFlush([stagingReq, stagingReg]);
    });

    it('should_track_conflict_details_when_models_disagree', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const stagingReg = em.create(StagingRegulation, {
        code: 'TEST-REG-CONFLICT-001',
        name: 'Test Regulation Conflict',
        sourceUrl: 'https://eur-lex.europa.eu/test',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
      });
      await em.persistAndFlush(stagingReg);

      const stagingReq = em.create(StagingRequirement, {
        stagingRegulation: stagingReg,
        code: 'CADMIUM_LIMIT',
        name: 'Cadmium Content Limit',
        substanceName: 'Cadmium',
        casNumber: '7440-43-9',
        operator: ComparisonOperator.LT,
        thresholdValue: 0.01,
        unit: 'PERCENT_BY_WEIGHT',
        scope: ['Plastics'],
        legalReference: 'Entry 23',
        type: RequirementType.SUBSTANCE_SCREEN,
        severity: RequirementSeverity.BLOCKER,
        confidenceScore: 0.85,
        consensusStatus: ConsensusStatus.CONFLICT,
        conflictDetails: {
          claude: { threshold: 0.01, unit: 'PERCENT_BY_WEIGHT' },
          gemini: { threshold: 0.1, unit: 'PERCENT_BY_WEIGHT' },
        },
      });
      await em.persistAndFlush(stagingReq);

      expect(stagingReq.consensusStatus).toBe(ConsensusStatus.CONFLICT);
      expect(stagingReq.conflictDetails?.claude.threshold).toBe(0.01);
      expect(stagingReq.conflictDetails?.gemini.threshold).toBe(0.1);

      await em.removeAndFlush([stagingReq, stagingReg]);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/entities/StagingRequirement.test.ts
```

Expected: FAIL with "Cannot find module './StagingRequirement.js'"

**Step 3: Write the entity**

Create `packages/database/src/entities/StagingRequirement.ts`:

```typescript
import {
  Entity,
  Property,
  Enum,
  ManyToOne,
  Index,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { StagingRegulation } from './StagingRegulation.js';
import { ConsensusStatus } from './enums/ConsensusStatus.js';
import { RequirementType } from './enums/RequirementType.js';
import { RequirementSeverity } from './enums/RequirementSeverity.js';
import { ComparisonOperator } from './enums/ComparisonOperator.js';

/**
 * Conflict details when Claude and Gemini disagree.
 */
export interface ConflictDetails {
  claude: { threshold: number; unit: string };
  gemini: { threshold: number; unit: string };
}

/**
 * Staging table for requirements pending review.
 *
 * Each requirement is extracted from a regulation document,
 * validated against a shadow model, and tracked with per-requirement
 * consensus status for granular review.
 *
 * Lives in the public schema.
 */
@Entity({ tableName: 'staging_requirement', schema: 'public' })
export class StagingRequirement extends BaseEntity {
  /**
   * Parent staging regulation
   */
  @ManyToOne(() => StagingRegulation, { name: 'staging_regulation_id' })
  @Index()
  stagingRegulation!: StagingRegulation;

  /**
   * Requirement code (e.g., 'SVHC_SCREEN', 'LEAD_LIMIT')
   */
  @Property({ type: 'text' })
  code!: string;

  /**
   * Human-readable name
   */
  @Property({ type: 'text' })
  name!: string;

  /**
   * Description of the requirement
   */
  @Property({ type: 'text', nullable: true })
  description?: string;

  /**
   * Substance name (for SUBSTANCE_SCREEN type)
   */
  @Property({ type: 'text', nullable: true, name: 'substance_name' })
  substanceName?: string;

  /**
   * CAS number of the substance
   */
  @Property({ type: 'text', nullable: true, name: 'cas_number' })
  casNumber?: string;

  /**
   * EC number of the substance
   */
  @Property({ type: 'text', nullable: true, name: 'ec_number' })
  ecNumber?: string;

  /**
   * Comparison operator (LT, LTE, GT, GTE, EQ, PRESENT, ABSENT)
   */
  @Enum({ items: () => ComparisonOperator, nullable: true })
  operator?: ComparisonOperator;

  /**
   * Threshold value for comparison
   */
  @Property({ type: 'decimal', nullable: true, name: 'threshold_value' })
  thresholdValue?: number;

  /**
   * Unit of measurement (e.g., 'PERCENT_BY_WEIGHT', 'PPM')
   */
  @Property({ type: 'text', nullable: true })
  unit?: string;

  /**
   * Scope/applicability (e.g., ['Jewellery', 'Hair accessories'])
   */
  @Property({ type: 'jsonb', nullable: true })
  scope?: string[];

  /**
   * Legal reference (e.g., 'Entry 63, Paragraph 1')
   */
  @Property({ type: 'text', nullable: true, name: 'legal_reference' })
  legalReference?: string;

  /**
   * PDF coordinates for citation anchoring
   */
  @Property({ type: 'jsonb', nullable: true, name: 'pdf_coordinates' })
  pdfCoordinates?: { page: number; bbox: number[] };

  /**
   * Requirement type
   */
  @Enum({ items: () => RequirementType })
  type!: RequirementType;

  /**
   * Severity level
   */
  @Enum({ items: () => RequirementSeverity, default: RequirementSeverity.WARNING })
  severity: RequirementSeverity = RequirementSeverity.WARNING;

  /**
   * Claude's confidence score (0.0 - 1.0)
   */
  @Property({ type: 'decimal', nullable: true, name: 'confidence_score' })
  confidenceScore?: number;

  /**
   * Claude's Chain-of-Thought reasoning
   */
  @Property({ type: 'text', nullable: true })
  reasoning?: string;

  /**
   * Whether tenants can exempt this requirement
   */
  @Property({ type: 'boolean', default: true, name: 'allows_exemption' })
  allowsExemption: boolean = true;

  /**
   * Conditions under which exemption is allowed
   */
  @Property({ type: 'text', nullable: true, name: 'exemption_conditions' })
  exemptionConditions?: string;

  /**
   * Consensus status between Claude and Gemini
   */
  @Enum({ items: () => ConsensusStatus })
  @Index()
  consensusStatus!: ConsensusStatus;

  /**
   * Details when models disagree
   */
  @Property({ type: 'jsonb', nullable: true, name: 'conflict_details' })
  conflictDetails?: ConflictDetails;

  /**
   * Suggested category mappings from AI
   */
  @Property({ type: 'jsonb', nullable: true, name: 'suggested_categories' })
  suggestedCategories?: { path: string; confidence: number }[];

  /**
   * Whether this specific requirement is approved
   */
  @Property({ type: 'boolean', default: false, name: 'is_approved' })
  isApproved: boolean = false;

  /**
   * User who approved this requirement
   */
  @Property({ type: 'text', nullable: true, name: 'approved_by' })
  approvedBy?: string;

  /**
   * Timestamp when approved
   */
  @Property({ type: 'timestamptz', nullable: true, name: 'approved_at' })
  approvedAt?: Date;
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm build && pnpm test src/entities/StagingRequirement.test.ts
```

Expected: PASS (may need migration first)

**Step 5: Commit**

```bash
git add packages/database/src/entities/StagingRequirement.ts packages/database/src/entities/StagingRequirement.test.ts
git commit -m "$(cat <<'EOF'
feat(database): add StagingRequirement entity with consensus tracking

Per-requirement staging with:
- Dual-model consensus status (MATCH, CONFLICT, LOW_CONFIDENCE)
- Conflict details when models disagree
- Chain-of-Thought reasoning from Claude
- PDF coordinates for citation anchoring

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Create IngestionAuditLog Entity

**Files:**
- Create: `packages/database/src/entities/IngestionAuditLog.ts`
- Create: `packages/database/src/entities/enums/IngestionAction.ts`

**Step 1: Create the enum**

Create `packages/database/src/entities/enums/IngestionAction.ts`:

```typescript
/**
 * Actions tracked in the ingestion audit log.
 */
export enum IngestionAction {
  /** Initial extraction from source */
  EXTRACTED = 'EXTRACTED',
  /** Shadow validation completed */
  VALIDATED = 'VALIDATED',
  /** Conflict detected between models */
  CONFLICT_DETECTED = 'CONFLICT_DETECTED',
  /** Requirement approved by admin */
  APPROVED = 'APPROVED',
  /** Requirement rejected by admin */
  REJECTED = 'REJECTED',
  /** Requirement edited by admin */
  EDITED = 'EDITED',
  /** Published to production tables */
  PUBLISHED = 'PUBLISHED',
}
```

**Step 2: Export from enums index**

Add to `packages/database/src/entities/enums/index.ts`:

```typescript
export { IngestionAction } from './IngestionAction.js';
```

**Step 3: Create the entity**

Create `packages/database/src/entities/IngestionAuditLog.ts`:

```typescript
import {
  Entity,
  Property,
  Enum,
  ManyToOne,
  Index,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { StagingRegulation } from './StagingRegulation.js';
import { StagingRequirement } from './StagingRequirement.js';
import { IngestionAction } from './enums/IngestionAction.js';

/**
 * Audit log for regulation ingestion workflow.
 *
 * Tracks all actions taken on staging regulations and requirements
 * for legal defensibility and debugging.
 *
 * Lives in the public schema.
 */
@Entity({ tableName: 'ingestion_audit_log', schema: 'public' })
export class IngestionAuditLog extends BaseEntity {
  /**
   * Reference to the staging regulation
   */
  @ManyToOne(() => StagingRegulation, { name: 'staging_regulation_id' })
  @Index()
  stagingRegulation!: StagingRegulation;

  /**
   * Reference to specific requirement (optional)
   */
  @ManyToOne(() => StagingRequirement, { nullable: true, name: 'staging_requirement_id' })
  @Index()
  stagingRequirement?: StagingRequirement;

  /**
   * Type of action performed
   */
  @Enum({ items: () => IngestionAction })
  @Index()
  action!: IngestionAction;

  /**
   * User who performed the action (or 'system' for automated actions)
   */
  @Property({ type: 'text', nullable: true, name: 'actor_id' })
  actorId?: string;

  /**
   * Action-specific details (before/after state, model used, etc.)
   */
  @Property({ type: 'jsonb', nullable: true })
  details?: object;

  /**
   * Timestamp when action occurred
   */
  @Property({ type: 'timestamptz' })
  timestamp: Date = new Date();
}
```

**Step 4: Commit**

```bash
git add packages/database/src/entities/enums/IngestionAction.ts packages/database/src/entities/enums/index.ts packages/database/src/entities/IngestionAuditLog.ts
git commit -m "$(cat <<'EOF'
feat(database): add IngestionAuditLog entity for audit trail

Tracks all ingestion workflow actions for legal defensibility:
- EXTRACTED, VALIDATED, CONFLICT_DETECTED
- APPROVED, REJECTED, EDITED
- PUBLISHED

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Export New Entities from Index

**Files:**
- Modify: `packages/database/src/entities/index.ts`

**Step 1: Add exports**

Add to `packages/database/src/entities/index.ts` after existing exports:

```typescript
export { StagingStatus } from './enums/StagingStatus.js';
export { ConsensusStatus } from './enums/ConsensusStatus.js';
export { IngestionAction } from './enums/IngestionAction.js';
export { StagingRegulation, type SourceType } from './StagingRegulation.js';
export { StagingRequirement, type ConflictDetails } from './StagingRequirement.js';
export { IngestionAuditLog } from './IngestionAuditLog.js';
```

**Step 2: Add to publicOnlyEntities array**

In `packages/database/src/entities/index.ts`, add the imports and update the array:

```typescript
// Add imports at top
import { StagingRegulation } from './StagingRegulation.js';
import { StagingRequirement } from './StagingRequirement.js';
import { IngestionAuditLog } from './IngestionAuditLog.js';

// Update publicOnlyEntities array
export const publicOnlyEntities = [
  Organization,
  ApiKey,
  WebhookEvent,
  UnitDefinition,
  Substance,
  SubstanceAlias,
  SeedVersion,
  Category,
  CategoryRegulation,
  Regulation,
  Requirement,
  StagingRegulation,      // Add
  StagingRequirement,     // Add
  IngestionAuditLog,      // Add
];
```

**Step 3: Build and verify**

```bash
cd packages/database && pnpm build
```

Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add packages/database/src/entities/index.ts
git commit -m "$(cat <<'EOF'
feat(database): export staging entities from index

Adds StagingRegulation, StagingRequirement, IngestionAuditLog
to public exports and publicOnlyEntities array.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Add Migration for Staging Tables

**Files:**
- Modify: `packages/database/src/migrations/Migration20260122000000.ts`

**Step 1: Add staging tables to migration**

Add the following after the `seed_version` table creation in `Migration20260122000000.ts`:

```typescript
    // =====================================================
    // Staging tables for AI Regulation Ingestor
    // =====================================================

    // Staging Regulation - pending review
    this.addSql(`
      CREATE TABLE "public"."staging_regulation" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "code" text NOT NULL,
        "name" text NOT NULL,
        "source_url" text NOT NULL,
        "source_type" text NOT NULL,
        "primary_payload" jsonb NOT NULL,
        "shadow_payload" jsonb,
        "regulation_metadata" jsonb,
        "status" text NOT NULL DEFAULT 'PENDING',
        "reviewed_by" text,
        "approved_at" timestamptz,
        "rejection_reason" text,
        "published_regulation_id" text REFERENCES "public"."regulation"("id")
      );
    `);
    this.addSql('CREATE INDEX "idx_staging_regulation_status" ON "public"."staging_regulation" ("status");');
    this.addSql('CREATE INDEX "idx_staging_regulation_code" ON "public"."staging_regulation" ("code");');

    // Consensus status type
    this.addSql(`CREATE TYPE consensus_status AS ENUM ('MATCH', 'CONFLICT', 'LOW_CONFIDENCE', 'SHADOW_MISSING');`);

    // Staging Requirement - per-requirement review
    this.addSql(`
      CREATE TABLE "public"."staging_requirement" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "staging_regulation_id" text NOT NULL REFERENCES "public"."staging_regulation"("id") ON DELETE CASCADE,
        "code" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "substance_name" text,
        "cas_number" text,
        "ec_number" text,
        "operator" text,
        "threshold_value" decimal,
        "unit" text,
        "scope" jsonb,
        "legal_reference" text,
        "pdf_coordinates" jsonb,
        "type" requirement_type NOT NULL,
        "severity" requirement_severity NOT NULL DEFAULT 'WARNING',
        "confidence_score" decimal,
        "reasoning" text,
        "allows_exemption" boolean NOT NULL DEFAULT true,
        "exemption_conditions" text,
        "consensus_status" consensus_status NOT NULL,
        "conflict_details" jsonb,
        "suggested_categories" jsonb,
        "is_approved" boolean NOT NULL DEFAULT false,
        "approved_by" text,
        "approved_at" timestamptz
      );
    `);
    this.addSql('CREATE INDEX "idx_staging_requirement_regulation" ON "public"."staging_requirement" ("staging_regulation_id");');
    this.addSql('CREATE INDEX "idx_staging_requirement_consensus" ON "public"."staging_requirement" ("consensus_status");');

    // Ingestion action type
    this.addSql(`CREATE TYPE ingestion_action AS ENUM ('EXTRACTED', 'VALIDATED', 'CONFLICT_DETECTED', 'APPROVED', 'REJECTED', 'EDITED', 'PUBLISHED');`);

    // Ingestion Audit Log
    this.addSql(`
      CREATE TABLE "public"."ingestion_audit_log" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "staging_regulation_id" text NOT NULL REFERENCES "public"."staging_regulation"("id") ON DELETE CASCADE,
        "staging_requirement_id" text REFERENCES "public"."staging_requirement"("id") ON DELETE CASCADE,
        "action" ingestion_action NOT NULL,
        "actor_id" text,
        "details" jsonb,
        "timestamp" timestamptz NOT NULL DEFAULT NOW()
      );
    `);
    this.addSql('CREATE INDEX "idx_ingestion_audit_regulation" ON "public"."ingestion_audit_log" ("staging_regulation_id");');
    this.addSql('CREATE INDEX "idx_ingestion_audit_action" ON "public"."ingestion_audit_log" ("action");');
```

**Step 2: Add drop statements to down() method**

Add before existing drops in the `down()` method:

```typescript
    // Drop staging tables
    this.addSql('DROP TABLE IF EXISTS "public"."ingestion_audit_log" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."staging_requirement" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."staging_regulation" CASCADE;');
    this.addSql('DROP TYPE IF EXISTS ingestion_action;');
    this.addSql('DROP TYPE IF EXISTS consensus_status;');
```

**Step 3: Reset database to apply migration**

```bash
pnpm db:reset
```

**Step 4: Verify tables exist**

```bash
docker exec -it eurocomply-postgres psql -U postgres -d eurocomply -c "\dt public.staging*"
```

Expected: Lists `staging_regulation`, `staging_requirement`

**Step 5: Run entity tests**

```bash
cd packages/database && pnpm build && pnpm test
```

Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/database/src/migrations/Migration20260122000000.ts
git commit -m "$(cat <<'EOF'
feat(database): add migration for staging tables

Creates staging_regulation, staging_requirement, ingestion_audit_log
tables with appropriate indexes for the AI regulation ingestor workflow.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Create StagingService for CRUD Operations

**Files:**
- Create: `packages/database/src/services/StagingService.ts`
- Test: `packages/database/src/services/StagingService.test.ts`

**Step 1: Write the failing test**

Create `packages/database/src/services/StagingService.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { StagingService } from './StagingService.js';
import { StagingRegulation } from '../entities/StagingRegulation.js';
import { StagingRequirement } from '../entities/StagingRequirement.js';
import { StagingStatus } from '../entities/enums/StagingStatus.js';
import { ConsensusStatus } from '../entities/enums/ConsensusStatus.js';
import { RequirementType } from '../entities/enums/RequirementType.js';
import { RequirementSeverity } from '../entities/enums/RequirementSeverity.js';
import { ComparisonOperator } from '../entities/enums/ComparisonOperator.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('StagingService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: StagingService;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!(await isDatabaseAvailable())) return;
    em = orm.em.fork();
    service = new StagingService(em);

    // Clean up staging tables
    await em.execute('DELETE FROM public.ingestion_audit_log');
    await em.execute('DELETE FROM public.staging_requirement');
    await em.execute('DELETE FROM public.staging_regulation');
  });

  describe('createStagingRegulation', () => {
    it('should_create_staging_regulation_with_requirements', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const result = await service.createStagingRegulation({
        code: 'REACH_TEST',
        name: 'REACH Test Regulation',
        sourceUrl: 'https://eur-lex.europa.eu/reach',
        sourceType: 'EUR_LEX',
        primaryPayload: { test: true },
        requirements: [
          {
            code: 'LEAD_LIMIT',
            name: 'Lead Content Limit',
            substanceName: 'Lead',
            casNumber: '7439-92-1',
            operator: ComparisonOperator.LT,
            thresholdValue: 0.05,
            unit: 'PERCENT_BY_WEIGHT',
            type: RequirementType.SUBSTANCE_SCREEN,
            severity: RequirementSeverity.BLOCKER,
            confidenceScore: 0.97,
            consensusStatus: ConsensusStatus.MATCH,
          },
        ],
      });

      expect(result.regulation.id).toBeDefined();
      expect(result.regulation.code).toBe('REACH_TEST');
      expect(result.regulation.status).toBe(StagingStatus.PENDING);
      expect(result.requirements).toHaveLength(1);
      expect(result.requirements[0].code).toBe('LEAD_LIMIT');
    });
  });

  describe('listStagingRegulations', () => {
    it('should_list_regulations_by_status', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create test data
      await service.createStagingRegulation({
        code: 'PENDING_REG',
        name: 'Pending Regulation',
        sourceUrl: 'https://example.com/1',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        requirements: [],
      });

      const results = await service.listStagingRegulations({ status: StagingStatus.PENDING });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every(r => r.status === StagingStatus.PENDING)).toBe(true);
    });
  });

  describe('approveRequirement', () => {
    it('should_approve_single_requirement', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const { requirements } = await service.createStagingRegulation({
        code: 'APPROVE_TEST',
        name: 'Approval Test',
        sourceUrl: 'https://example.com/2',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        requirements: [
          {
            code: 'REQ_1',
            name: 'Requirement 1',
            type: RequirementType.DECLARATION,
            severity: RequirementSeverity.WARNING,
            confidenceScore: 0.99,
            consensusStatus: ConsensusStatus.MATCH,
          },
        ],
      });

      const approved = await service.approveRequirement(requirements[0].id, 'admin_user');

      expect(approved.isApproved).toBe(true);
      expect(approved.approvedBy).toBe('admin_user');
      expect(approved.approvedAt).toBeInstanceOf(Date);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/StagingService.test.ts
```

Expected: FAIL with "Cannot find module './StagingService.js'"

**Step 3: Write the service**

Create `packages/database/src/services/StagingService.ts`:

```typescript
import { EntityManager } from '@mikro-orm/postgresql';
import { StagingRegulation, SourceType } from '../entities/StagingRegulation.js';
import { StagingRequirement } from '../entities/StagingRequirement.js';
import { IngestionAuditLog } from '../entities/IngestionAuditLog.js';
import { StagingStatus } from '../entities/enums/StagingStatus.js';
import { ConsensusStatus } from '../entities/enums/ConsensusStatus.js';
import { IngestionAction } from '../entities/enums/IngestionAction.js';
import { RequirementType } from '../entities/enums/RequirementType.js';
import { RequirementSeverity } from '../entities/enums/RequirementSeverity.js';
import { ComparisonOperator } from '../entities/enums/ComparisonOperator.js';

export interface CreateStagingRequirementInput {
  code: string;
  name: string;
  description?: string;
  substanceName?: string;
  casNumber?: string;
  ecNumber?: string;
  operator?: ComparisonOperator;
  thresholdValue?: number;
  unit?: string;
  scope?: string[];
  legalReference?: string;
  pdfCoordinates?: { page: number; bbox: number[] };
  type: RequirementType;
  severity: RequirementSeverity;
  confidenceScore?: number;
  reasoning?: string;
  allowsExemption?: boolean;
  exemptionConditions?: string;
  consensusStatus: ConsensusStatus;
  conflictDetails?: { claude: { threshold: number; unit: string }; gemini: { threshold: number; unit: string } };
  suggestedCategories?: { path: string; confidence: number }[];
}

export interface CreateStagingRegulationInput {
  code: string;
  name: string;
  sourceUrl: string;
  sourceType: SourceType;
  primaryPayload: object;
  shadowPayload?: object;
  regulationMetadata?: {
    jurisdiction?: string;
    type?: string;
    officialJournalRef?: string;
    effectiveDate?: string;
    version?: string;
  };
  requirements: CreateStagingRequirementInput[];
}

export interface ListStagingRegulationsFilter {
  status?: StagingStatus;
  sourceType?: SourceType;
}

/**
 * Service for managing staging regulations and requirements.
 */
export class StagingService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Creates a staging regulation with its requirements.
   */
  async createStagingRegulation(input: CreateStagingRegulationInput): Promise<{
    regulation: StagingRegulation;
    requirements: StagingRequirement[];
  }> {
    const regulation = this.em.create(StagingRegulation, {
      code: input.code,
      name: input.name,
      sourceUrl: input.sourceUrl,
      sourceType: input.sourceType,
      primaryPayload: input.primaryPayload,
      shadowPayload: input.shadowPayload,
      regulationMetadata: input.regulationMetadata,
      status: StagingStatus.PENDING,
    });

    await this.em.persistAndFlush(regulation);

    const requirements: StagingRequirement[] = [];

    for (const reqInput of input.requirements) {
      const requirement = this.em.create(StagingRequirement, {
        stagingRegulation: regulation,
        code: reqInput.code,
        name: reqInput.name,
        description: reqInput.description,
        substanceName: reqInput.substanceName,
        casNumber: reqInput.casNumber,
        ecNumber: reqInput.ecNumber,
        operator: reqInput.operator,
        thresholdValue: reqInput.thresholdValue,
        unit: reqInput.unit,
        scope: reqInput.scope,
        legalReference: reqInput.legalReference,
        pdfCoordinates: reqInput.pdfCoordinates,
        type: reqInput.type,
        severity: reqInput.severity,
        confidenceScore: reqInput.confidenceScore,
        reasoning: reqInput.reasoning,
        allowsExemption: reqInput.allowsExemption ?? true,
        exemptionConditions: reqInput.exemptionConditions,
        consensusStatus: reqInput.consensusStatus,
        conflictDetails: reqInput.conflictDetails,
        suggestedCategories: reqInput.suggestedCategories,
      });
      requirements.push(requirement);
    }

    await this.em.persistAndFlush(requirements);

    // Log the extraction
    const auditLog = this.em.create(IngestionAuditLog, {
      stagingRegulation: regulation,
      action: IngestionAction.EXTRACTED,
      actorId: 'system',
      details: {
        requirementCount: requirements.length,
        sourceType: input.sourceType,
      },
    });
    await this.em.persistAndFlush(auditLog);

    return { regulation, requirements };
  }

  /**
   * Lists staging regulations with optional filters.
   */
  async listStagingRegulations(filter?: ListStagingRegulationsFilter): Promise<StagingRegulation[]> {
    const where: Record<string, unknown> = {};

    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.sourceType) {
      where.sourceType = filter.sourceType;
    }

    return this.em.find(StagingRegulation, where, {
      orderBy: { createdAt: 'DESC' },
    });
  }

  /**
   * Gets a staging regulation with its requirements.
   */
  async getStagingRegulation(id: string): Promise<StagingRegulation | null> {
    return this.em.findOne(StagingRegulation, { id }, {
      populate: ['requirements'],
    });
  }

  /**
   * Approves a single requirement.
   */
  async approveRequirement(requirementId: string, approvedBy: string): Promise<StagingRequirement> {
    const requirement = await this.em.findOneOrFail(StagingRequirement, { id: requirementId }, {
      populate: ['stagingRegulation'],
    });

    requirement.isApproved = true;
    requirement.approvedBy = approvedBy;
    requirement.approvedAt = new Date();

    await this.em.flush();

    // Log the approval
    const auditLog = this.em.create(IngestionAuditLog, {
      stagingRegulation: requirement.stagingRegulation,
      stagingRequirement: requirement,
      action: IngestionAction.APPROVED,
      actorId: approvedBy,
    });
    await this.em.persistAndFlush(auditLog);

    return requirement;
  }

  /**
   * Rejects a single requirement.
   */
  async rejectRequirement(requirementId: string, rejectedBy: string, reason: string): Promise<StagingRequirement> {
    const requirement = await this.em.findOneOrFail(StagingRequirement, { id: requirementId }, {
      populate: ['stagingRegulation'],
    });

    // Mark as not approved (rejected requirements stay in staging for reference)
    requirement.isApproved = false;

    await this.em.flush();

    // Log the rejection
    const auditLog = this.em.create(IngestionAuditLog, {
      stagingRegulation: requirement.stagingRegulation,
      stagingRequirement: requirement,
      action: IngestionAction.REJECTED,
      actorId: rejectedBy,
      details: { reason },
    });
    await this.em.persistAndFlush(auditLog);

    return requirement;
  }

  /**
   * Updates a staging requirement (for manual edits).
   */
  async updateRequirement(
    requirementId: string,
    updates: Partial<Pick<StagingRequirement, 'thresholdValue' | 'unit' | 'operator' | 'scope'>>,
    editedBy: string
  ): Promise<StagingRequirement> {
    const requirement = await this.em.findOneOrFail(StagingRequirement, { id: requirementId }, {
      populate: ['stagingRegulation'],
    });

    const before = {
      thresholdValue: requirement.thresholdValue,
      unit: requirement.unit,
      operator: requirement.operator,
      scope: requirement.scope,
    };

    // Apply updates
    if (updates.thresholdValue !== undefined) requirement.thresholdValue = updates.thresholdValue;
    if (updates.unit !== undefined) requirement.unit = updates.unit;
    if (updates.operator !== undefined) requirement.operator = updates.operator;
    if (updates.scope !== undefined) requirement.scope = updates.scope;

    await this.em.flush();

    // Log the edit
    const auditLog = this.em.create(IngestionAuditLog, {
      stagingRegulation: requirement.stagingRegulation,
      stagingRequirement: requirement,
      action: IngestionAction.EDITED,
      actorId: editedBy,
      details: { before, after: updates },
    });
    await this.em.persistAndFlush(auditLog);

    return requirement;
  }

  /**
   * Bulk approves all MATCH requirements for a regulation.
   */
  async bulkApproveMatches(regulationId: string, approvedBy: string): Promise<number> {
    const requirements = await this.em.find(StagingRequirement, {
      stagingRegulation: regulationId,
      consensusStatus: ConsensusStatus.MATCH,
      isApproved: false,
    });

    const now = new Date();
    let count = 0;

    for (const req of requirements) {
      req.isApproved = true;
      req.approvedBy = approvedBy;
      req.approvedAt = now;
      count++;
    }

    await this.em.flush();

    return count;
  }
}
```

**Step 4: Export the service**

Add to `packages/database/src/services/index.ts` (create if it doesn't exist):

```typescript
export { StagingService } from './StagingService.js';
```

**Step 5: Run tests**

```bash
cd packages/database && pnpm build && pnpm test src/services/StagingService.test.ts
```

Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/database/src/services/StagingService.ts packages/database/src/services/StagingService.test.ts packages/database/src/services/index.ts
git commit -m "$(cat <<'EOF'
feat(database): add StagingService for ingestor CRUD operations

Provides:
- createStagingRegulation with requirements
- listStagingRegulations with filters
- approveRequirement / rejectRequirement
- updateRequirement for manual edits
- bulkApproveMatches for consensus items

All operations logged to ingestion_audit_log.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 0 Complete Checkpoint

At this point you should have:
- [ ] StagingStatus enum
- [ ] ConsensusStatus enum
- [ ] IngestionAction enum
- [ ] StagingRegulation entity with tests
- [ ] StagingRequirement entity with tests
- [ ] IngestionAuditLog entity
- [ ] Migration updated with staging tables
- [ ] StagingService with CRUD operations and tests

Run full test suite:
```bash
cd packages/database && pnpm build && pnpm test
```

All tests should pass before proceeding to Phase 1.

---

## Phase 1: Claude Extraction Service (Tasks 9-16)

### Task 9: Create Ingestor Package Structure

**Files:**
- Create: `packages/ingestor/package.json`
- Create: `packages/ingestor/tsconfig.json`
- Create: `packages/ingestor/tsconfig.build.json`
- Create: `packages/ingestor/src/index.ts`
- Modify: `pnpm-workspace.yaml` (if not already including packages/*)

**Step 1: Create package.json**

Create `packages/ingestor/package.json`:

```json
{
  "name": "@eurocomply/ingestor",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@eurocomply/core": "workspace:*",
    "@eurocomply/database": "workspace:*",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/ingestor/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create tsconfig.build.json**

Create `packages/ingestor/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/__tests__/**"]
}
```

**Step 4: Create index.ts**

Create `packages/ingestor/src/index.ts`:

```typescript
// AI Regulation Ingestor Package
export { ClaudeExtractor } from './services/ClaudeExtractor.js';
export { GeminiShadow } from './services/GeminiShadow.js';
export { Comparator } from './services/Comparator.js';
export { IngestionPipeline } from './services/IngestionPipeline.js';
```

**Step 5: Install dependencies**

```bash
cd packages/ingestor && pnpm install
```

**Step 6: Commit**

```bash
git add packages/ingestor/
git commit -m "$(cat <<'EOF'
feat(ingestor): initialize ingestor package structure

New package for AI-powered regulation ingestion:
- ClaudeExtractor for primary extraction
- GeminiShadow for validation
- Comparator for consensus detection
- IngestionPipeline for orchestration

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Create Extraction Schema Types

**Files:**
- Create: `packages/ingestor/src/types/extraction.ts`

**Step 1: Create the types file**

Create `packages/ingestor/src/types/extraction.ts`:

```typescript
import { z } from 'zod';

/**
 * Schema for regulation metadata extracted by Claude.
 */
export const RegulationMetadataSchema = z.object({
  code: z.string(),
  name: z.string(),
  sourceUrl: z.string().url(),
  version: z.string().optional(),
  effectiveDate: z.string().optional(),
  jurisdiction: z.string().optional(),
  type: z.string().optional(),
  officialJournalRef: z.string().optional(),
});

export type RegulationMetadata = z.infer<typeof RegulationMetadataSchema>;

/**
 * Comparison operators for requirement thresholds.
 */
export const OperatorSchema = z.enum(['GT', 'GTE', 'LT', 'LTE', 'EQ', 'PRESENT', 'ABSENT']);

export type Operator = z.infer<typeof OperatorSchema>;

/**
 * PDF coordinates for citation anchoring.
 */
export const PdfCoordinatesSchema = z.object({
  page: z.number(),
  bbox: z.array(z.number()).length(4),
});

export type PdfCoordinates = z.infer<typeof PdfCoordinatesSchema>;

/**
 * Schema for a single extracted requirement.
 */
export const ExtractedRequirementSchema = z.object({
  substanceName: z.string().optional(),
  casNumber: z.string().optional(),
  ecNumber: z.string().optional(),
  operator: OperatorSchema.optional(),
  thresholdValue: z.number().optional(),
  unit: z.string().optional(),
  scope: z.array(z.string()).optional(),
  legalReference: z.string(),
  pdfCoordinates: PdfCoordinatesSchema.optional(),
  confidenceScore: z.number().min(0).max(1),
  reasoning: z.string(),
  allowsExemption: z.boolean().default(true),
  exemptionConditions: z.string().optional(),
});

export type ExtractedRequirement = z.infer<typeof ExtractedRequirementSchema>;

/**
 * Suggested category mapping from AI.
 */
export const CategoryMappingSchema = z.object({
  requirementIndex: z.number(),
  suggestedCategories: z.array(z.object({
    path: z.string(),
    confidence: z.number().min(0).max(1),
  })),
});

export type CategoryMapping = z.infer<typeof CategoryMappingSchema>;

/**
 * Full extraction result from Claude.
 */
export const ExtractionResultSchema = z.object({
  regulationMetadata: RegulationMetadataSchema,
  requirements: z.array(ExtractedRequirementSchema),
  categoryMappings: z.array(CategoryMappingSchema).optional(),
  extractionMetadata: z.object({
    model: z.string(),
    extractedAt: z.string(),
    totalRequirements: z.number(),
    avgConfidence: z.number(),
  }),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/**
 * Simplified extraction from Gemini for validation.
 */
export const ShadowExtractionSchema = z.array(z.object({
  cas: z.string().optional(),
  threshold: z.number().optional(),
  unit: z.string().optional(),
}));

export type ShadowExtraction = z.infer<typeof ShadowExtractionSchema>;
```

**Step 2: Export from index**

Update `packages/ingestor/src/index.ts`:

```typescript
// Types
export * from './types/extraction.js';

// Services (to be added)
// export { ClaudeExtractor } from './services/ClaudeExtractor.js';
```

**Step 3: Commit**

```bash
git add packages/ingestor/src/types/extraction.ts packages/ingestor/src/index.ts
git commit -m "$(cat <<'EOF'
feat(ingestor): add extraction schema types with Zod validation

Defines schemas for:
- RegulationMetadata
- ExtractedRequirement with confidence scores
- CategoryMapping for AI suggestions
- ShadowExtraction for Gemini validation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Create Claude Extraction Prompt

**Files:**
- Create: `packages/ingestor/src/prompts/substance-restriction-prompt.ts`

**Step 1: Create the prompt file**

Create `packages/ingestor/src/prompts/substance-restriction-prompt.ts`:

```typescript
/**
 * System prompt for Claude to extract substance restrictions from EU legal text.
 */
export const SUBSTANCE_RESTRICTION_SYSTEM_PROMPT = `Role: You are a Legal Systems Architect specializing in EU REACH and ESPR compliance.

Task: Extract every distinct substance restriction from the provided EUR-Lex text.

Constraints:
1. For each restriction, identify: substance name, CAS number, threshold, operator, material scope
2. Map operators to these exact enums: GT, GTE, LT, LTE, EQ, PRESENT, ABSENT
3. Provide a confidence_score (0.0-1.0) for each extracted requirement
4. Include your reasoning for complex interpretations
5. Cite the exact legal reference (Article, Paragraph, Entry)
6. Note PDF page numbers and approximate positions where possible

CRITICAL RULES:
- If threshold is "shall not exceed X%", use operator LT with value X
- If threshold is "not more than X%", use operator LTE with value X
- If threshold is "at least X%", use operator GTE with value X
- If substance is "banned" or "prohibited", use operator ABSENT
- When amendments exist, use the MOST RECENT threshold value
- If exemptions exist, set allowsExemption: true and describe conditions

Output Format: Return ONLY valid JSON wrapped in <extraction_results> tags. No preamble.`;

/**
 * User prompt template for extraction.
 */
export function createExtractionPrompt(documentText: string, sourceUrl: string): string {
  return `Extract all substance restrictions from the following EU legal document.

Source URL: ${sourceUrl}

<document>
${documentText}
</document>

Return the extraction in this exact JSON format wrapped in <extraction_results> tags:

<extraction_results>
{
  "regulation_metadata": {
    "code": "REGULATION_CODE",
    "name": "Full Regulation Name",
    "source_url": "${sourceUrl}",
    "version": "2024.1",
    "effective_date": "YYYY-MM-DD",
    "jurisdiction": "EU"
  },
  "requirements": [
    {
      "substance_name": "Name of substance",
      "cas_number": "XXXXX-XX-X",
      "ec_number": "XXX-XXX-X",
      "operator": "LT|LTE|GT|GTE|EQ|PRESENT|ABSENT",
      "threshold_value": 0.05,
      "unit": "PERCENT_BY_WEIGHT|PPM|MG_KG",
      "scope": ["Product type 1", "Product type 2"],
      "legal_reference": "Article X, Paragraph Y",
      "confidence_score": 0.97,
      "reasoning": "Explain your interpretation and any amendments applied",
      "allows_exemption": true,
      "exemption_conditions": "Describe if exemption is conditional"
    }
  ],
  "category_mappings": [
    {
      "requirement_index": 0,
      "suggested_categories": [
        { "path": "apparel.accessories", "confidence": 0.92 }
      ]
    }
  ],
  "extraction_metadata": {
    "model": "claude-4.5-opus",
    "extracted_at": "ISO timestamp",
    "total_requirements": 1,
    "avg_confidence": 0.97
  }
}
</extraction_results>`;
}
```

**Step 2: Commit**

```bash
git add packages/ingestor/src/prompts/substance-restriction-prompt.ts
git commit -m "$(cat <<'EOF'
feat(ingestor): add Claude extraction prompt for substance restrictions

System prompt with:
- Operator mapping rules (LT, LTE, GT, GTE, ABSENT)
- Amendment handling (use most recent)
- Confidence scoring requirements
- Chain-of-Thought reasoning requirement

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Create ClaudeExtractor Service

**Files:**
- Create: `packages/ingestor/src/services/ClaudeExtractor.ts`
- Test: `packages/ingestor/src/services/ClaudeExtractor.test.ts`

**Step 1: Write the failing test**

Create `packages/ingestor/src/services/ClaudeExtractor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeExtractor } from './ClaudeExtractor.js';
import type { ExtractionResult } from '../types/extraction.js';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

describe('ClaudeExtractor', () => {
  let extractor: ClaudeExtractor;

  beforeEach(() => {
    extractor = new ClaudeExtractor({ apiKey: 'test-key' });
  });

  describe('parseExtractionResponse', () => {
    it('should_parse_valid_extraction_response', () => {
      const response = `Some preamble text

<extraction_results>
{
  "regulation_metadata": {
    "code": "REACH_ANNEX_XVII",
    "name": "REACH Annex XVII Restrictions",
    "source_url": "https://eur-lex.europa.eu/test",
    "version": "2024.1"
  },
  "requirements": [
    {
      "substance_name": "Lead",
      "cas_number": "7439-92-1",
      "operator": "LT",
      "threshold_value": 0.05,
      "unit": "PERCENT_BY_WEIGHT",
      "scope": ["Jewellery"],
      "legal_reference": "Entry 63",
      "confidence_score": 0.97,
      "reasoning": "Standard lead restriction"
    }
  ],
  "extraction_metadata": {
    "model": "claude-4.5-opus",
    "extracted_at": "2026-01-29T10:00:00Z",
    "total_requirements": 1,
    "avg_confidence": 0.97
  }
}
</extraction_results>

Some trailing text`;

      const result = extractor.parseExtractionResponse(response);

      expect(result).toBeDefined();
      expect(result.regulationMetadata.code).toBe('REACH_ANNEX_XVII');
      expect(result.requirements).toHaveLength(1);
      expect(result.requirements[0].substanceName).toBe('Lead');
      expect(result.requirements[0].confidenceScore).toBe(0.97);
    });

    it('should_throw_on_missing_extraction_tags', () => {
      const response = `Just some text without tags`;

      expect(() => extractor.parseExtractionResponse(response)).toThrow(
        'No extraction_results found in response'
      );
    });

    it('should_throw_on_invalid_json', () => {
      const response = `<extraction_results>
{ invalid json }
</extraction_results>`;

      expect(() => extractor.parseExtractionResponse(response)).toThrow();
    });
  });

  describe('normalizeKeys', () => {
    it('should_convert_snake_case_to_camelCase', () => {
      const input = {
        regulation_metadata: {
          source_url: 'https://example.com',
          effective_date: '2024-01-01',
        },
        requirements: [
          {
            substance_name: 'Lead',
            cas_number: '7439-92-1',
            threshold_value: 0.05,
            confidence_score: 0.97,
            legal_reference: 'Entry 63',
          },
        ],
        extraction_metadata: {
          extracted_at: '2026-01-29T10:00:00Z',
          total_requirements: 1,
          avg_confidence: 0.97,
        },
      };

      const result = extractor.normalizeKeys(input);

      expect(result.regulationMetadata.sourceUrl).toBe('https://example.com');
      expect(result.requirements[0].substanceName).toBe('Lead');
      expect(result.requirements[0].casNumber).toBe('7439-92-1');
      expect(result.extractionMetadata.extractedAt).toBe('2026-01-29T10:00:00Z');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/ingestor && pnpm test src/services/ClaudeExtractor.test.ts
```

Expected: FAIL with "Cannot find module './ClaudeExtractor.js'"

**Step 3: Write the service**

Create `packages/ingestor/src/services/ClaudeExtractor.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { ExtractionResultSchema, type ExtractionResult } from '../types/extraction.js';
import { SUBSTANCE_RESTRICTION_SYSTEM_PROMPT, createExtractionPrompt } from '../prompts/substance-restriction-prompt.js';

export interface ClaudeExtractorOptions {
  apiKey: string;
  model?: string;
}

/**
 * Claude-based extractor for EU regulation substance restrictions.
 *
 * Uses Claude 4.5 to parse legal documents and extract structured
 * requirement data with confidence scores and chain-of-thought reasoning.
 */
export class ClaudeExtractor {
  private client: Anthropic;
  private model: string;

  constructor(options: ClaudeExtractorOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? 'claude-sonnet-4-20250514';
  }

  /**
   * Extracts requirements from a legal document.
   */
  async extract(documentText: string, sourceUrl: string): Promise<ExtractionResult> {
    const userPrompt = createExtractionPrompt(documentText, sourceUrl);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: SUBSTANCE_RESTRICTION_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    // Extract text from response
    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    return this.parseExtractionResponse(textContent.text);
  }

  /**
   * Parses the extraction response from Claude.
   * Handles XML wrapper and JSON parsing.
   */
  parseExtractionResponse(response: string): ExtractionResult {
    // Extract JSON from <extraction_results> tags
    const match = response.match(/<extraction_results>\s*([\s\S]*?)\s*<\/extraction_results>/);
    if (!match) {
      throw new Error('No extraction_results found in response');
    }

    const jsonStr = match[1].trim();
    let parsed: unknown;

    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`Invalid JSON in extraction_results: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    // Normalize keys from snake_case to camelCase
    const normalized = this.normalizeKeys(parsed as Record<string, unknown>);

    // Validate against schema
    const result = ExtractionResultSchema.safeParse(normalized);
    if (!result.success) {
      throw new Error(`Extraction validation failed: ${result.error.message}`);
    }

    return result.data;
  }

  /**
   * Converts snake_case keys to camelCase recursively.
   */
  normalizeKeys(obj: Record<string, unknown>): Record<string, unknown> {
    if (Array.isArray(obj)) {
      return obj.map(item =>
        typeof item === 'object' && item !== null
          ? this.normalizeKeys(item as Record<string, unknown>)
          : item
      ) as unknown as Record<string, unknown>;
    }

    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = typeof value === 'object' && value !== null
        ? this.normalizeKeys(value as Record<string, unknown>)
        : value;
    }

    return result;
  }
}
```

**Step 4: Run tests**

```bash
cd packages/ingestor && pnpm build && pnpm test src/services/ClaudeExtractor.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/ingestor/src/services/ClaudeExtractor.ts packages/ingestor/src/services/ClaudeExtractor.test.ts
git commit -m "$(cat <<'EOF'
feat(ingestor): add ClaudeExtractor service for regulation parsing

Extracts structured requirements from legal documents using Claude 4.5:
- XML-wrapped JSON response parsing
- snake_case to camelCase normalization
- Zod schema validation
- Confidence scores and reasoning preservation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Create Gemini Shadow Prompt

**Files:**
- Create: `packages/ingestor/src/prompts/gemini-shadow-prompt.ts`

**Step 1: Create the prompt file**

Create `packages/ingestor/src/prompts/gemini-shadow-prompt.ts`:

```typescript
/**
 * Simplified prompt for Gemini Flash to extract (CAS, threshold) pairs.
 * Used for shadow validation against Claude's extraction.
 */
export const GEMINI_SHADOW_PROMPT = `Extract all substance restrictions from this legal text as a simple list.

For each substance found, extract:
1. CAS number (if mentioned)
2. Threshold percentage (if mentioned)
3. Unit (PERCENT_BY_WEIGHT, PPM, or MG_KG)

Return ONLY a JSON array, no explanation:

[
  {"cas": "7439-92-1", "threshold": 0.05, "unit": "PERCENT_BY_WEIGHT"},
  {"cas": "7440-43-9", "threshold": 0.01, "unit": "PERCENT_BY_WEIGHT"}
]

If no CAS number is given, omit the cas field.
If no threshold is given, omit the threshold field.

DOCUMENT:
`;

/**
 * Creates the full prompt for Gemini shadow extraction.
 */
export function createShadowPrompt(documentText: string): string {
  return `${GEMINI_SHADOW_PROMPT}

${documentText}`;
}
```

**Step 2: Commit**

```bash
git add packages/ingestor/src/prompts/gemini-shadow-prompt.ts
git commit -m "$(cat <<'EOF'
feat(ingestor): add Gemini shadow extraction prompt

Simplified prompt for Gemini Flash to extract (CAS, threshold) pairs
for validation against Claude's primary extraction.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Create GeminiShadow Service

**Files:**
- Create: `packages/ingestor/src/services/GeminiShadow.ts`
- Test: `packages/ingestor/src/services/GeminiShadow.test.ts`

**Step 1: Write the failing test**

Create `packages/ingestor/src/services/GeminiShadow.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GeminiShadow } from './GeminiShadow.js';

describe('GeminiShadow', () => {
  describe('parseResponse', () => {
    it('should_parse_valid_json_array', () => {
      const shadow = new GeminiShadow({ apiKey: 'test-key' });

      const response = `[
        {"cas": "7439-92-1", "threshold": 0.05, "unit": "PERCENT_BY_WEIGHT"},
        {"cas": "7440-43-9", "threshold": 0.01, "unit": "PERCENT_BY_WEIGHT"}
      ]`;

      const result = shadow.parseResponse(response);

      expect(result).toHaveLength(2);
      expect(result[0].cas).toBe('7439-92-1');
      expect(result[0].threshold).toBe(0.05);
    });

    it('should_handle_response_with_markdown_code_block', () => {
      const shadow = new GeminiShadow({ apiKey: 'test-key' });

      const response = `\`\`\`json
[
  {"cas": "7439-92-1", "threshold": 0.05}
]
\`\`\``;

      const result = shadow.parseResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].cas).toBe('7439-92-1');
    });

    it('should_handle_missing_fields', () => {
      const shadow = new GeminiShadow({ apiKey: 'test-key' });

      const response = `[
        {"cas": "7439-92-1"},
        {"threshold": 0.05}
      ]`;

      const result = shadow.parseResponse(response);

      expect(result).toHaveLength(2);
      expect(result[0].cas).toBe('7439-92-1');
      expect(result[0].threshold).toBeUndefined();
      expect(result[1].cas).toBeUndefined();
      expect(result[1].threshold).toBe(0.05);
    });

    it('should_return_empty_array_for_empty_response', () => {
      const shadow = new GeminiShadow({ apiKey: 'test-key' });

      const result = shadow.parseResponse('[]');

      expect(result).toHaveLength(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/ingestor && pnpm test src/services/GeminiShadow.test.ts
```

Expected: FAIL with "Cannot find module './GeminiShadow.js'"

**Step 3: Write the service**

Create `packages/ingestor/src/services/GeminiShadow.ts`:

```typescript
import { ShadowExtractionSchema, type ShadowExtraction } from '../types/extraction.js';
import { createShadowPrompt } from '../prompts/gemini-shadow-prompt.js';

export interface GeminiShadowOptions {
  apiKey: string;
  model?: string;
}

/**
 * Gemini Flash-based shadow extractor for validation.
 *
 * Extracts simplified (CAS, threshold) pairs from legal documents
 * for comparison against Claude's primary extraction.
 */
export class GeminiShadow {
  private apiKey: string;
  private model: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  constructor(options: GeminiShadowOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'gemini-2.0-flash';
  }

  /**
   * Extracts simplified substance data from a legal document.
   */
  async extract(documentText: string): Promise<ShadowExtraction> {
    const prompt = createShadowPrompt(documentText);

    const response = await fetch(
      `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${error}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('No text content in Gemini response');
    }

    return this.parseResponse(text);
  }

  /**
   * Parses the shadow extraction response.
   */
  parseResponse(response: string): ShadowExtraction {
    // Strip markdown code block if present
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`Invalid JSON in Gemini response: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    const result = ShadowExtractionSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Shadow extraction validation failed: ${result.error.message}`);
    }

    return result.data;
  }
}
```

**Step 4: Run tests**

```bash
cd packages/ingestor && pnpm build && pnpm test src/services/GeminiShadow.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/ingestor/src/services/GeminiShadow.ts packages/ingestor/src/services/GeminiShadow.test.ts
git commit -m "$(cat <<'EOF'
feat(ingestor): add GeminiShadow service for validation extraction

Simplified extractor using Gemini 2.0 Flash:
- Extracts (CAS, threshold) pairs for comparison
- Handles markdown code blocks in response
- Lower cost than Claude for validation pass

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Create Comparator Service

**Files:**
- Create: `packages/ingestor/src/services/Comparator.ts`
- Test: `packages/ingestor/src/services/Comparator.test.ts`

**Step 1: Write the failing test**

Create `packages/ingestor/src/services/Comparator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Comparator, type ComparisonResult } from './Comparator.js';
import type { ExtractedRequirement, ShadowExtraction } from '../types/extraction.js';

describe('Comparator', () => {
  const comparator = new Comparator();

  describe('compare', () => {
    it('should_return_MATCH_when_thresholds_agree', () => {
      const primary: ExtractedRequirement[] = [
        {
          casNumber: '7439-92-1',
          thresholdValue: 0.05,
          unit: 'PERCENT_BY_WEIGHT',
          legalReference: 'Entry 63',
          confidenceScore: 0.97,
          reasoning: 'Lead restriction',
        },
      ];

      const shadow: ShadowExtraction = [
        { cas: '7439-92-1', threshold: 0.05, unit: 'PERCENT_BY_WEIGHT' },
      ];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('MATCH');
      expect(results[0].conflictDetails).toBeUndefined();
    });

    it('should_return_CONFLICT_when_thresholds_disagree', () => {
      const primary: ExtractedRequirement[] = [
        {
          casNumber: '7439-92-1',
          thresholdValue: 0.05,
          unit: 'PERCENT_BY_WEIGHT',
          legalReference: 'Entry 63',
          confidenceScore: 0.97,
          reasoning: 'Lead restriction',
        },
      ];

      const shadow: ShadowExtraction = [
        { cas: '7439-92-1', threshold: 0.5, unit: 'PERCENT_BY_WEIGHT' },
      ];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('CONFLICT');
      expect(results[0].conflictDetails).toBeDefined();
      expect(results[0].conflictDetails?.claude.threshold).toBe(0.05);
      expect(results[0].conflictDetails?.gemini.threshold).toBe(0.5);
    });

    it('should_return_LOW_CONFIDENCE_when_confidence_below_threshold', () => {
      const primary: ExtractedRequirement[] = [
        {
          casNumber: '7439-92-1',
          thresholdValue: 0.05,
          unit: 'PERCENT_BY_WEIGHT',
          legalReference: 'Entry 63',
          confidenceScore: 0.80, // Below 0.95 threshold
          reasoning: 'Lead restriction',
        },
      ];

      const shadow: ShadowExtraction = [
        { cas: '7439-92-1', threshold: 0.05, unit: 'PERCENT_BY_WEIGHT' },
      ];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('LOW_CONFIDENCE');
    });

    it('should_return_SHADOW_MISSING_when_no_shadow_match', () => {
      const primary: ExtractedRequirement[] = [
        {
          casNumber: '7439-92-1',
          thresholdValue: 0.05,
          unit: 'PERCENT_BY_WEIGHT',
          legalReference: 'Entry 63',
          confidenceScore: 0.97,
          reasoning: 'Lead restriction',
        },
      ];

      const shadow: ShadowExtraction = [
        { cas: '9999-99-9', threshold: 0.1 }, // Different CAS
      ];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('SHADOW_MISSING');
    });

    it('should_handle_requirements_without_CAS_numbers', () => {
      const primary: ExtractedRequirement[] = [
        {
          substanceName: 'Generic Chemical',
          thresholdValue: 0.1,
          unit: 'PERCENT_BY_WEIGHT',
          legalReference: 'Article 5',
          confidenceScore: 0.95,
          reasoning: 'No CAS provided',
        },
      ];

      const shadow: ShadowExtraction = [];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('SHADOW_MISSING');
    });

    // UNIT NORMALIZATION TESTS
    it('should_return_MATCH_when_values_equal_after_unit_normalization', () => {
      const primary: ExtractedRequirement[] = [
        {
          casNumber: '7439-92-1',
          thresholdValue: 0.1,           // 0.1% = 1000 ppm
          unit: 'PERCENT_BY_WEIGHT',
          legalReference: 'Entry 63',
          confidenceScore: 0.97,
          reasoning: 'Lead restriction',
        },
      ];

      const shadow: ShadowExtraction = [
        { cas: '7439-92-1', threshold: 1000, unit: 'PPM' },  // 1000 ppm = 0.1%
      ];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('MATCH');
    });

    it('should_return_MATCH_for_mg_kg_vs_ppm_equivalence', () => {
      const primary: ExtractedRequirement[] = [
        {
          casNumber: '7440-43-9',
          thresholdValue: 100,
          unit: 'MG_KG',                // 100 mg/kg = 100 ppm
          legalReference: 'Entry 23',
          confidenceScore: 0.95,
          reasoning: 'Cadmium restriction',
        },
      ];

      const shadow: ShadowExtraction = [
        { cas: '7440-43-9', threshold: 100, unit: 'PPM' },  // 100 ppm
      ];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('MATCH');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/ingestor && pnpm test src/services/Comparator.test.ts
```

Expected: FAIL with "Cannot find module './Comparator.js'"

**Step 3: Write the service**

Create `packages/ingestor/src/services/Comparator.ts`:

```typescript
import type { ExtractedRequirement, ShadowExtraction } from '../types/extraction.js';
import { ConsensusStatus } from '@eurocomply/database';

export interface ConflictDetails {
  claude: { threshold: number; unit: string };
  gemini: { threshold: number; unit: string };
}

export interface ComparisonResult {
  requirementIndex: number;
  status: 'MATCH' | 'CONFLICT' | 'LOW_CONFIDENCE' | 'SHADOW_MISSING';
  conflictDetails?: ConflictDetails;
}

export interface ComparatorOptions {
  confidenceThreshold?: number;
  thresholdTolerance?: number;
}

/**
 * Unit conversion factors to PPM (parts per million).
 * Used to normalize thresholds before comparison.
 */
const UNIT_TO_PPM: Record<string, number> = {
  'PERCENT_BY_WEIGHT': 10000,  // 1% = 10,000 ppm
  'PERCENT': 10000,
  'PPM': 1,
  'MG_KG': 1,                  // mg/kg = ppm (in mass terms)
  'MG_L': 1,                   // Approximately, for aqueous solutions
  'UG_KG': 0.001,              // 1 μg/kg = 0.001 ppm
};

/**
 * Compares Claude's primary extraction against Gemini's shadow extraction.
 *
 * Detects conflicts, low confidence, and missing shadow matches.
 * Normalizes units before comparison to prevent false conflicts.
 */
export class Comparator {
  private confidenceThreshold: number;
  private thresholdTolerance: number;

  constructor(options?: ComparatorOptions) {
    this.confidenceThreshold = options?.confidenceThreshold ?? 0.95;
    this.thresholdTolerance = options?.thresholdTolerance ?? 1; // 1 ppm tolerance after normalization
  }

  /**
   * Normalizes a threshold value to PPM for consistent comparison.
   */
  private toPpm(value: number, unit: string): number {
    const factor = UNIT_TO_PPM[unit] ?? 1;
    return value * factor;
  }

  /**
   * Compares primary extraction against shadow extraction.
   */
  compare(primary: ExtractedRequirement[], shadow: ShadowExtraction): ComparisonResult[] {
    const results: ComparisonResult[] = [];

    for (let i = 0; i < primary.length; i++) {
      const req = primary[i];
      const result = this.compareRequirement(i, req, shadow);
      results.push(result);
    }

    return results;
  }

  /**
   * Compares a single requirement against shadow data.
   */
  private compareRequirement(
    index: number,
    requirement: ExtractedRequirement,
    shadow: ShadowExtraction
  ): ComparisonResult {
    // Find matching shadow entry by CAS number
    const casNumber = requirement.casNumber;
    const shadowMatch = casNumber
      ? shadow.find(s => s.cas === casNumber)
      : undefined;

    // No shadow match found
    if (!shadowMatch) {
      return {
        requirementIndex: index,
        status: 'SHADOW_MISSING',
      };
    }

    // Check for threshold conflicts (with unit normalization)
    const claudeThreshold = requirement.thresholdValue;
    const geminiThreshold = shadowMatch.threshold;
    const claudeUnit = requirement.unit ?? 'PPM';
    const geminiUnit = shadowMatch.unit ?? 'PPM';

    if (claudeThreshold !== undefined && geminiThreshold !== undefined) {
      // Normalize both values to PPM before comparing
      const claudePpm = this.toPpm(claudeThreshold, claudeUnit);
      const geminiPpm = this.toPpm(geminiThreshold, geminiUnit);
      const difference = Math.abs(claudePpm - geminiPpm);

      if (difference > this.thresholdTolerance) {
        return {
          requirementIndex: index,
          status: 'CONFLICT',
          conflictDetails: {
            claude: {
              threshold: claudeThreshold,
              unit: claudeUnit,
            },
            gemini: {
              threshold: geminiThreshold,
              unit: geminiUnit,
            },
          },
        };
      }
    }

    // Check confidence level
    if (requirement.confidenceScore < this.confidenceThreshold) {
      return {
        requirementIndex: index,
        status: 'LOW_CONFIDENCE',
      };
    }

    // All checks passed
    return {
      requirementIndex: index,
      status: 'MATCH',
    };
  }

  /**
   * Converts comparison status to ConsensusStatus enum.
   */
  static toConsensusStatus(status: ComparisonResult['status']): ConsensusStatus {
    switch (status) {
      case 'MATCH':
        return ConsensusStatus.MATCH;
      case 'CONFLICT':
        return ConsensusStatus.CONFLICT;
      case 'LOW_CONFIDENCE':
        return ConsensusStatus.LOW_CONFIDENCE;
      case 'SHADOW_MISSING':
        return ConsensusStatus.SHADOW_MISSING;
    }
  }
}
```

**Step 4: Run tests**

```bash
cd packages/ingestor && pnpm build && pnpm test src/services/Comparator.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/ingestor/src/services/Comparator.ts packages/ingestor/src/services/Comparator.test.ts
git commit -m "$(cat <<'EOF'
feat(ingestor): add Comparator service for dual-model validation

Compares Claude and Gemini extractions to detect:
- MATCH: Both models agree, high confidence
- CONFLICT: Threshold values disagree
- LOW_CONFIDENCE: Agreement but confidence < 95%
- SHADOW_MISSING: No matching CAS in shadow

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Create IngestionPipeline Orchestrator

**Files:**
- Create: `packages/ingestor/src/services/IngestionPipeline.ts`
- Test: `packages/ingestor/src/services/IngestionPipeline.test.ts`

**Step 1: Write the failing test**

Create `packages/ingestor/src/services/IngestionPipeline.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionPipeline } from './IngestionPipeline.js';
import type { ClaudeExtractor } from './ClaudeExtractor.js';
import type { GeminiShadow } from './GeminiShadow.js';
import type { Comparator } from './Comparator.js';

describe('IngestionPipeline', () => {
  let mockClaudeExtractor: ClaudeExtractor;
  let mockGeminiShadow: GeminiShadow;
  let mockComparator: Comparator;

  beforeEach(() => {
    mockClaudeExtractor = {
      extract: vi.fn(),
    } as unknown as ClaudeExtractor;

    mockGeminiShadow = {
      extract: vi.fn(),
    } as unknown as GeminiShadow;

    mockComparator = {
      compare: vi.fn(),
    } as unknown as Comparator;
  });

  describe('ingest', () => {
    it('should_orchestrate_extraction_and_validation', async () => {
      const mockExtractionResult = {
        regulationMetadata: {
          code: 'TEST-REG',
          name: 'Test Regulation',
          sourceUrl: 'https://example.com',
        },
        requirements: [
          {
            casNumber: '7439-92-1',
            thresholdValue: 0.05,
            unit: 'PERCENT_BY_WEIGHT',
            legalReference: 'Entry 63',
            confidenceScore: 0.97,
            reasoning: 'Test',
          },
        ],
        extractionMetadata: {
          model: 'claude-4.5-opus',
          extractedAt: '2026-01-29T10:00:00Z',
          totalRequirements: 1,
          avgConfidence: 0.97,
        },
      };

      const mockShadowResult = [
        { cas: '7439-92-1', threshold: 0.05, unit: 'PERCENT_BY_WEIGHT' },
      ];

      const mockComparisonResults = [
        { requirementIndex: 0, status: 'MATCH' as const },
      ];

      vi.mocked(mockClaudeExtractor.extract).mockResolvedValue(mockExtractionResult);
      vi.mocked(mockGeminiShadow.extract).mockResolvedValue(mockShadowResult);
      vi.mocked(mockComparator.compare).mockReturnValue(mockComparisonResults);

      const pipeline = new IngestionPipeline({
        claudeExtractor: mockClaudeExtractor,
        geminiShadow: mockGeminiShadow,
        comparator: mockComparator,
      });

      const result = await pipeline.ingest('Document text', 'https://example.com');

      expect(result.extraction).toBe(mockExtractionResult);
      expect(result.shadow).toBe(mockShadowResult);
      expect(result.comparisons).toBe(mockComparisonResults);
      expect(mockClaudeExtractor.extract).toHaveBeenCalledWith('Document text', 'https://example.com');
      expect(mockGeminiShadow.extract).toHaveBeenCalledWith('Document text');
      expect(mockComparator.compare).toHaveBeenCalledWith(
        mockExtractionResult.requirements,
        mockShadowResult
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/ingestor && pnpm test src/services/IngestionPipeline.test.ts
```

Expected: FAIL with "Cannot find module './IngestionPipeline.js'"

**Step 3: Write the service**

Create `packages/ingestor/src/services/IngestionPipeline.ts`:

```typescript
import type { EntityManager } from '@mikro-orm/postgresql';
import { ClaudeExtractor } from './ClaudeExtractor.js';
import { GeminiShadow } from './GeminiShadow.js';
import { Comparator, type ComparisonResult } from './Comparator.js';
import type { ExtractionResult, ShadowExtraction } from '../types/extraction.js';
import { StagingService, type CreateStagingRequirementInput } from '@eurocomply/database';
import { RequirementType, RequirementSeverity, ConsensusStatus } from '@eurocomply/database';

export interface IngestionPipelineOptions {
  claudeExtractor: ClaudeExtractor;
  geminiShadow: GeminiShadow;
  comparator: Comparator;
  em?: EntityManager;
}

export interface IngestionResult {
  extraction: ExtractionResult;
  shadow: ShadowExtraction;
  comparisons: ComparisonResult[];
}

/**
 * Orchestrates the full ingestion pipeline:
 * 1. Claude extraction (primary)
 * 2. Gemini extraction (shadow)
 * 3. Comparison for consensus detection
 * 4. Staging table creation
 */
export class IngestionPipeline {
  private claudeExtractor: ClaudeExtractor;
  private geminiShadow: GeminiShadow;
  private comparator: Comparator;
  private em?: EntityManager;

  constructor(options: IngestionPipelineOptions) {
    this.claudeExtractor = options.claudeExtractor;
    this.geminiShadow = options.geminiShadow;
    this.comparator = options.comparator;
    this.em = options.em;
  }

  /**
   * Runs the full ingestion pipeline.
   */
  async ingest(documentText: string, sourceUrl: string): Promise<IngestionResult> {
    // Step 1: Claude extraction
    const extraction = await this.claudeExtractor.extract(documentText, sourceUrl);

    // Step 2: Gemini shadow extraction
    const shadow = await this.geminiShadow.extract(documentText);

    // Step 3: Compare results
    const comparisons = this.comparator.compare(extraction.requirements, shadow);

    return {
      extraction,
      shadow,
      comparisons,
    };
  }

  /**
   * Runs ingestion and saves to staging tables.
   */
  async ingestAndStage(documentText: string, sourceUrl: string): Promise<{
    result: IngestionResult;
    stagingRegulationId: string;
  }> {
    if (!this.em) {
      throw new Error('EntityManager required for staging');
    }

    const result = await this.ingest(documentText, sourceUrl);
    const stagingService = new StagingService(this.em);

    // Map extraction to staging input
    const requirements: CreateStagingRequirementInput[] = result.extraction.requirements.map(
      (req, index) => {
        const comparison = result.comparisons[index];
        return {
          code: `REQ_${index + 1}`,
          name: req.substanceName ?? `Requirement ${index + 1}`,
          description: req.reasoning,
          substanceName: req.substanceName,
          casNumber: req.casNumber,
          ecNumber: req.ecNumber,
          operator: req.operator as any, // Map to enum
          thresholdValue: req.thresholdValue,
          unit: req.unit,
          scope: req.scope,
          legalReference: req.legalReference,
          pdfCoordinates: req.pdfCoordinates,
          type: RequirementType.SUBSTANCE_SCREEN,
          severity: RequirementSeverity.BLOCKER,
          confidenceScore: req.confidenceScore,
          reasoning: req.reasoning,
          allowsExemption: req.allowsExemption,
          exemptionConditions: req.exemptionConditions,
          consensusStatus: Comparator.toConsensusStatus(comparison.status),
          conflictDetails: comparison.conflictDetails,
          suggestedCategories: result.extraction.categoryMappings?.find(
            m => m.requirementIndex === index
          )?.suggestedCategories,
        };
      }
    );

    const { regulation } = await stagingService.createStagingRegulation({
      code: result.extraction.regulationMetadata.code,
      name: result.extraction.regulationMetadata.name,
      sourceUrl: result.extraction.regulationMetadata.sourceUrl,
      sourceType: 'EUR_LEX',
      primaryPayload: result.extraction,
      shadowPayload: result.shadow,
      regulationMetadata: {
        jurisdiction: result.extraction.regulationMetadata.jurisdiction,
        version: result.extraction.regulationMetadata.version,
        effectiveDate: result.extraction.regulationMetadata.effectiveDate,
      },
      requirements,
    });

    return {
      result,
      stagingRegulationId: regulation.id,
    };
  }
}
```

**Step 4: Update exports in index.ts**

Update `packages/ingestor/src/index.ts`:

```typescript
// Types
export * from './types/extraction.js';

// Prompts
export { SUBSTANCE_RESTRICTION_SYSTEM_PROMPT, createExtractionPrompt } from './prompts/substance-restriction-prompt.js';
export { GEMINI_SHADOW_PROMPT, createShadowPrompt } from './prompts/gemini-shadow-prompt.js';

// Services
export { ClaudeExtractor, type ClaudeExtractorOptions } from './services/ClaudeExtractor.js';
export { GeminiShadow, type GeminiShadowOptions } from './services/GeminiShadow.js';
export { Comparator, type ComparatorOptions, type ComparisonResult, type ConflictDetails } from './services/Comparator.js';
export { IngestionPipeline, type IngestionPipelineOptions, type IngestionResult } from './services/IngestionPipeline.js';
```

**Step 5: Run tests**

```bash
cd packages/ingestor && pnpm build && pnpm test
```

Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/ingestor/src/services/IngestionPipeline.ts packages/ingestor/src/services/IngestionPipeline.test.ts packages/ingestor/src/index.ts
git commit -m "$(cat <<'EOF'
feat(ingestor): add IngestionPipeline orchestrator

Orchestrates the full ingestion workflow:
1. Claude extraction (primary)
2. Gemini extraction (shadow)
3. Comparison for consensus detection
4. Optional staging table creation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1 Complete Checkpoint

At this point you should have:
- [ ] Ingestor package structure
- [ ] Extraction schema types with Zod
- [ ] Claude extraction prompt
- [ ] ClaudeExtractor service with tests
- [ ] Gemini shadow prompt
- [ ] GeminiShadow service with tests
- [ ] Comparator service with tests
- [ ] IngestionPipeline orchestrator with tests

Run full test suite:
```bash
cd packages/ingestor && pnpm build && pnpm test
```

All tests should pass before proceeding to Phase 2.

---

## Phase 2: Admin API Routes (Tasks 17-24)

### Task 17: Create Ingestor Admin Router

**Files:**
- Create: `apps/api/src/routes/admin/ingestor.ts`
- Test: `apps/api/src/routes/admin/ingestor.integration.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/routes/admin/ingestor.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createIngestorRouter } from './ingestor.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import type { MikroORM } from '@eurocomply/database';
import type { Env } from '../../app.js';

describe('Ingestor Admin API Integration', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!(await isDatabaseAvailable())) return;
    const em = orm.em.fork();
    await em.execute('DELETE FROM public.ingestion_audit_log');
    await em.execute('DELETE FROM public.staging_requirement');
    await em.execute('DELETE FROM public.staging_regulation');
  });

  function createTestApp(): Hono<Env> {
    const testApp = new Hono<Env>();
    testApp.route('/ingestor', createIngestorRouter({ orm }));
    return testApp;
  }

  describe('GET /ingestor/staging', () => {
    it('should_return_empty_list_when_no_staging_regulations', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const testApp = createTestApp();
      const res = await testApp.request('/ingestor/staging');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });
  });

  describe('POST /ingestor/extract', () => {
    it('should_reject_missing_source_url', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const testApp = createTestApp();
      const res = await testApp.request('/ingestor/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType: 'EUR_LEX' }),
      });

      expect(res.status).toBe(400);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/routes/admin/ingestor.integration.test.ts
```

Expected: FAIL with "Cannot find module './ingestor.js'"

**Step 3: Write the router**

Create `apps/api/src/routes/admin/ingestor.ts`:

```typescript
/**
 * Admin Ingestor API Routes
 *
 * Platform admin endpoints for AI regulation ingestion:
 * - POST /extract: Trigger extraction from URL
 * - GET /staging: List staging regulations
 * - GET /staging/:id: Get staging regulation with requirements
 * - PATCH /staging/:id/requirements/:reqId: Edit requirement
 * - POST /staging/:id/approve: Approve requirements
 * - POST /staging/:id/publish: Publish to production
 * - DELETE /staging/:id: Reject and remove
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@eurocomply/database';
import { StagingService, StagingStatus } from '@eurocomply/database';
import type { Env } from '../../app.js';
import { success, error } from '../../utils/response.js';

export interface IngestorRouterOptions {
  orm: MikroORM;
}

const extractSchema = z.object({
  sourceUrl: z.string().url(),
  sourceType: z.enum(['EUR_LEX', 'ECHA', 'MANUAL']),
  documentText: z.string().optional(), // For manual paste
});

const approveSchema = z.object({
  requirementIds: z.array(z.string()).min(1),
});

const editRequirementSchema = z.object({
  thresholdValue: z.number().optional(),
  unit: z.string().optional(),
  operator: z.enum(['GT', 'GTE', 'LT', 'LTE', 'EQ', 'PRESENT', 'ABSENT']).optional(),
  scope: z.array(z.string()).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PARTIALLY_APPROVED', 'PUBLISHED']).optional(),
  sourceType: z.enum(['EUR_LEX', 'ECHA', 'MANUAL']).optional(),
});

export function createIngestorRouter(options: IngestorRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  /**
   * GET /staging
   * List all staging regulations with optional filters
   */
  router.get(
    '/staging',
    zValidator('query', listQuerySchema),
    async (c) => {
      const query = c.req.valid('query');
      const em = orm.em.fork();
      const service = new StagingService(em);

      const regulations = await service.listStagingRegulations({
        status: query.status as StagingStatus | undefined,
        sourceType: query.sourceType as any,
      });

      return success(c, regulations.map(reg => ({
        id: reg.id,
        code: reg.code,
        name: reg.name,
        sourceType: reg.sourceType,
        status: reg.status,
        createdAt: reg.createdAt.toISOString(),
        requirementCount: reg.requirements.length,
      })), { total: regulations.length });
    }
  );

  /**
   * GET /staging/:id
   * Get a staging regulation with all its requirements
   */
  router.get(
    '/staging/:id',
    async (c) => {
      const { id } = c.req.param();
      const em = orm.em.fork();
      const service = new StagingService(em);

      const regulation = await service.getStagingRegulation(id);
      if (!regulation) {
        return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
      }

      return success(c, {
        id: regulation.id,
        code: regulation.code,
        name: regulation.name,
        sourceUrl: regulation.sourceUrl,
        sourceType: regulation.sourceType,
        status: regulation.status,
        createdAt: regulation.createdAt.toISOString(),
        primaryPayload: regulation.primaryPayload,
        shadowPayload: regulation.shadowPayload,
        requirements: regulation.requirements.getItems().map(req => ({
          id: req.id,
          code: req.code,
          name: req.name,
          substanceName: req.substanceName,
          casNumber: req.casNumber,
          operator: req.operator,
          thresholdValue: req.thresholdValue,
          unit: req.unit,
          scope: req.scope,
          legalReference: req.legalReference,
          type: req.type,
          severity: req.severity,
          confidenceScore: req.confidenceScore,
          reasoning: req.reasoning,
          consensusStatus: req.consensusStatus,
          conflictDetails: req.conflictDetails,
          isApproved: req.isApproved,
          approvedBy: req.approvedBy,
          approvedAt: req.approvedAt?.toISOString(),
        })),
      });
    }
  );

  /**
   * POST /extract
   * Trigger extraction from a source URL
   * NOTE: Actual extraction requires API keys configured
   */
  router.post(
    '/extract',
    zValidator('json', extractSchema),
    async (c) => {
      const body = c.req.valid('json');

      // Validate required fields
      if (!body.sourceUrl) {
        return error(c, 'BAD_REQUEST', 'sourceUrl is required', 400);
      }

      // For now, return a placeholder - actual extraction implemented in Task 18
      return success(c, {
        message: 'Extraction queued',
        sourceUrl: body.sourceUrl,
        sourceType: body.sourceType,
      }, { status: 202 });
    }
  );

  /**
   * PATCH /staging/:id/requirements/:reqId
   * Edit a specific requirement
   */
  router.patch(
    '/staging/:id/requirements/:reqId',
    zValidator('json', editRequirementSchema),
    async (c) => {
      const { id, reqId } = c.req.param();
      const body = c.req.valid('json');
      const userId = c.get('userId') ?? 'admin';
      const em = orm.em.fork();
      const service = new StagingService(em);

      try {
        const updated = await service.updateRequirement(reqId, body as any, userId);
        return success(c, {
          id: updated.id,
          thresholdValue: updated.thresholdValue,
          unit: updated.unit,
          operator: updated.operator,
          scope: updated.scope,
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return error(c, 'NOT_FOUND', 'Requirement not found', 404);
        }
        throw err;
      }
    }
  );

  /**
   * POST /staging/:id/approve
   * Approve specific requirements
   */
  router.post(
    '/staging/:id/approve',
    zValidator('json', approveSchema),
    async (c) => {
      const { id } = c.req.param();
      const body = c.req.valid('json');
      const userId = c.get('userId') ?? 'admin';
      const em = orm.em.fork();
      const service = new StagingService(em);

      let approvedCount = 0;
      for (const reqId of body.requirementIds) {
        try {
          await service.approveRequirement(reqId, userId);
          approvedCount++;
        } catch {
          // Skip requirements that don't exist
        }
      }

      return success(c, {
        approvedCount,
        totalRequested: body.requirementIds.length,
      });
    }
  );

  /**
   * POST /staging/:id/bulk-approve
   * Approve all MATCH requirements
   */
  router.post(
    '/staging/:id/bulk-approve',
    async (c) => {
      const { id } = c.req.param();
      const userId = c.get('userId') ?? 'admin';
      const em = orm.em.fork();
      const service = new StagingService(em);

      const count = await service.bulkApproveMatches(id, userId);

      return success(c, {
        approvedCount: count,
      });
    }
  );

  /**
   * DELETE /staging/:id
   * Reject and remove a staging regulation
   */
  router.delete(
    '/staging/:id',
    async (c) => {
      const { id } = c.req.param();
      const em = orm.em.fork();

      const regulation = await em.findOne('StagingRegulation', { id });
      if (!regulation) {
        return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
      }

      await em.removeAndFlush(regulation);

      return c.body(null, 204);
    }
  );

  return router;
}
```

**Step 4: Run tests**

```bash
cd apps/api && pnpm build && pnpm test src/routes/admin/ingestor.integration.test.ts
```

Expected: Tests pass

**Step 5: Commit**

```bash
git add apps/api/src/routes/admin/ingestor.ts apps/api/src/routes/admin/ingestor.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(api): add ingestor admin API routes

Admin endpoints for AI regulation ingestion:
- GET /staging: List staging regulations
- GET /staging/:id: Get with requirements
- POST /extract: Trigger extraction
- PATCH /staging/:id/requirements/:reqId: Edit
- POST /staging/:id/approve: Approve requirements
- POST /staging/:id/bulk-approve: Approve all MATCH
- DELETE /staging/:id: Reject and remove

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Wire Ingestor Router to App

**Files:**
- Modify: `apps/api/src/app.ts`

**Step 1: Import and register the router**

Add to `apps/api/src/app.ts` after existing admin routes:

```typescript
// Add import at top
import { createIngestorRouter } from './routes/admin/ingestor.js';

// In createApp function, after organizationsAdminRouter:
  // Ingestor admin routes (AI regulation ingestion)
  if (deps?.orm) {
    v1.route('/admin/ingestor', createIngestorRouter({ orm: deps.orm }));
  }
```

**Step 2: Verify build**

```bash
cd apps/api && pnpm build
```

Expected: No TypeScript errors

**Step 3: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "$(cat <<'EOF'
feat(api): wire ingestor admin routes to app

Registers /api/v1/admin/ingestor/* routes for AI regulation ingestion.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: Create PublishService for Production Publishing

**Files:**
- Create: `packages/database/src/services/PublishService.ts`
- Test: `packages/database/src/services/PublishService.test.ts`

**Step 1: Write the failing test**

Create `packages/database/src/services/PublishService.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { PublishService } from './PublishService.js';
import { StagingService } from './StagingService.js';
import { StagingStatus } from '../entities/enums/StagingStatus.js';
import { ConsensusStatus } from '../entities/enums/ConsensusStatus.js';
import { RequirementType } from '../entities/enums/RequirementType.js';
import { RequirementSeverity } from '../entities/enums/RequirementSeverity.js';
import { Regulation } from '../entities/Regulation.js';
import { Requirement } from '../entities/Requirement.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('PublishService', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!(await isDatabaseAvailable())) return;
    em = orm.em.fork();

    // Clean up
    await em.execute('DELETE FROM public.ingestion_audit_log');
    await em.execute('DELETE FROM public.staging_requirement');
    await em.execute('DELETE FROM public.staging_regulation');
    await em.execute('DELETE FROM public.category_regulation');
    await em.execute('DELETE FROM public.requirement');
    await em.execute('DELETE FROM public.regulation');
  });

  describe('publish', () => {
    it('should_publish_staging_regulation_to_production', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create staging regulation with approved requirements
      const stagingService = new StagingService(em);
      const { regulation, requirements } = await stagingService.createStagingRegulation({
        code: 'PUBLISH_TEST',
        name: 'Publish Test Regulation',
        sourceUrl: 'https://example.com',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        requirements: [
          {
            code: 'REQ_1',
            name: 'Requirement 1',
            type: RequirementType.SUBSTANCE_SCREEN,
            severity: RequirementSeverity.BLOCKER,
            confidenceScore: 0.99,
            consensusStatus: ConsensusStatus.MATCH,
          },
        ],
      });

      // Approve the requirement
      await stagingService.approveRequirement(requirements[0].id, 'test_admin');

      // Publish
      const publishService = new PublishService(em);
      const result = await publishService.publish(regulation.id, 'test_admin');

      expect(result.regulationId).toBeDefined();
      expect(result.requirementCount).toBe(1);

      // Verify production data
      const prodRegulation = await em.findOne(Regulation, { id: result.regulationId });
      expect(prodRegulation).toBeDefined();
      expect(prodRegulation?.code).toBe('PUBLISH_TEST');

      const prodRequirements = await em.find(Requirement, { regulation: result.regulationId });
      expect(prodRequirements).toHaveLength(1);
    });

    it('should_reject_publishing_with_unapproved_requirements', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const stagingService = new StagingService(em);
      const { regulation } = await stagingService.createStagingRegulation({
        code: 'UNAPPROVED_TEST',
        name: 'Unapproved Test',
        sourceUrl: 'https://example.com',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        requirements: [
          {
            code: 'REQ_1',
            name: 'Requirement 1',
            type: RequirementType.DECLARATION,
            severity: RequirementSeverity.WARNING,
            confidenceScore: 0.95,
            consensusStatus: ConsensusStatus.CONFLICT, // Not approved
          },
        ],
      });

      const publishService = new PublishService(em);

      await expect(publishService.publish(regulation.id, 'test_admin')).rejects.toThrow(
        'Cannot publish: 1 requirements not approved'
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/PublishService.test.ts
```

Expected: FAIL with "Cannot find module './PublishService.js'"

**Step 3: Write the service**

Create `packages/database/src/services/PublishService.ts`:

```typescript
import { EntityManager } from '@mikro-orm/postgresql';
import { StagingRegulation } from '../entities/StagingRegulation.js';
import { StagingRequirement } from '../entities/StagingRequirement.js';
import { IngestionAuditLog } from '../entities/IngestionAuditLog.js';
import { Regulation } from '../entities/Regulation.js';
import { Requirement } from '../entities/Requirement.js';
import { Substance } from '../entities/Substance.js';
import { StagingStatus } from '../entities/enums/StagingStatus.js';
import { IngestionAction } from '../entities/enums/IngestionAction.js';
import { RegulationStatus } from '../entities/enums/RegulationStatus.js';
import { RequirementType } from '../entities/enums/RequirementType.js';
import { RequirementSeverity } from '../entities/enums/RequirementSeverity.js';

export interface PublishResult {
  regulationId: string;
  requirementCount: number;
  skippedCount: number;  // Requirements not approved (for partial publish)
}

/**
 * Service for publishing staging regulations to production tables.
 *
 * Features:
 * - CAS mapping: Links to existing Substance records in public.substance
 * - Partial publishing: Publishes approved requirements, leaves conflicts in staging
 */
export class PublishService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Maps a CAS number to an existing Substance record.
   * Returns the substance ID if found, undefined otherwise.
   */
  private async mapCasToSubstance(casNumber: string | undefined): Promise<string | undefined> {
    if (!casNumber) return undefined;

    const substance = await this.em.findOne(Substance, { casNumber });
    return substance?.id;
  }

  /**
   * Publishes a staging regulation to production.
   * Supports partial publishing - only approved requirements are published.
   *
   * @param requireAll - If true, throws if any requirements are unapproved.
   *                     If false (default), publishes approved only.
   */
  async publish(
    stagingRegulationId: string,
    publishedBy: string,
    options?: { requireAll?: boolean }
  ): Promise<PublishResult> {
    const staging = await this.em.findOneOrFail(
      StagingRegulation,
      { id: stagingRegulationId },
      { populate: ['requirements'] }
    );

    const allRequirements = staging.requirements.getItems();
    const approved = allRequirements.filter(r => r.isApproved);
    const unapproved = allRequirements.filter(r => !r.isApproved);

    // If requireAll is true and there are unapproved, reject
    if (options?.requireAll && unapproved.length > 0) {
      throw new Error(`Cannot publish: ${unapproved.length} requirements not approved`);
    }

    // Must have at least one approved requirement to publish
    if (approved.length === 0) {
      throw new Error('Cannot publish: No approved requirements');
    }

    // Create production regulation
    const regulation = this.em.create(Regulation, {
      code: staging.code,
      name: staging.name,
      description: `Imported from ${staging.sourceUrl}`,
      status: RegulationStatus.ACTIVE,
      version: staging.regulationMetadata?.version,
      effectiveDate: staging.regulationMetadata?.effectiveDate
        ? new Date(staging.regulationMetadata.effectiveDate)
        : undefined,
      sourceUrl: staging.sourceUrl,
      metadata: {
        jurisdiction: staging.regulationMetadata?.jurisdiction,
        type: staging.regulationMetadata?.type,
        officialJournalRef: staging.regulationMetadata?.officialJournalRef,
      },
    });

    await this.em.persistAndFlush(regulation);

    // Create production requirements (approved only)
    let sortOrder = 0;
    for (const stagingReq of approved) {
      // Map CAS to existing Substance record
      const substanceId = await this.mapCasToSubstance(stagingReq.casNumber);

      const requirement = this.em.create(Requirement, {
        regulation,
        code: stagingReq.code,
        name: stagingReq.name,
        description: stagingReq.description ?? stagingReq.reasoning,
        type: stagingReq.type,
        severity: stagingReq.severity,
        substanceListId: substanceId ?? stagingReq.casNumber, // Use mapped ID or fallback to CAS
        handlerConfig: {
          operator: stagingReq.operator,
          threshold: stagingReq.thresholdValue,
          unit: stagingReq.unit,
        },
        legalReference: stagingReq.legalReference,
        allowTenantExemption: stagingReq.allowsExemption,
        sortOrder: sortOrder++,
      });
      this.em.persist(requirement);
    }

    await this.em.flush();

    // Update staging status based on whether all were published
    staging.status = unapproved.length > 0
      ? StagingStatus.PARTIALLY_APPROVED
      : StagingStatus.PUBLISHED;
    staging.publishedRegulationId = regulation.id;
    await this.em.flush();

    // Log the publish action
    const auditLog = this.em.create(IngestionAuditLog, {
      stagingRegulation: staging,
      action: IngestionAction.PUBLISHED,
      actorId: publishedBy,
      details: {
        productionRegulationId: regulation.id,
        publishedCount: approved.length,
        skippedCount: unapproved.length,
        skippedRequirementIds: unapproved.map(r => r.id),
      },
    });
    await this.em.persistAndFlush(auditLog);

    return {
      regulationId: regulation.id,
      requirementCount: approved.length,
      skippedCount: unapproved.length,
    };
  }
}
```

**Step 4: Export the service**

Add to `packages/database/src/services/index.ts`:

```typescript
export { PublishService } from './PublishService.js';
```

**Step 5: Run tests**

```bash
cd packages/database && pnpm build && pnpm test src/services/PublishService.test.ts
```

Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/database/src/services/PublishService.ts packages/database/src/services/PublishService.test.ts packages/database/src/services/index.ts
git commit -m "$(cat <<'EOF'
feat(database): add PublishService for production publishing

Publishes staging regulations to production tables:
- Validates all requirements are approved
- Creates Regulation and Requirement entities
- Updates staging status to PUBLISHED
- Logs PUBLISHED action to audit log

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: Add Publish Endpoint to Admin Router

**Files:**
- Modify: `apps/api/src/routes/admin/ingestor.ts`

**Step 1: Import PublishService and add endpoint**

Add to `apps/api/src/routes/admin/ingestor.ts`:

```typescript
// Add import
import { PublishService } from '@eurocomply/database';

// Add route before the DELETE route:

  /**
   * POST /staging/:id/publish
   * Publish approved requirements to production
   */
  router.post(
    '/staging/:id/publish',
    async (c) => {
      const { id } = c.req.param();
      const userId = c.get('userId') ?? 'admin';
      const em = orm.em.fork();

      try {
        const publishService = new PublishService(em);
        const result = await publishService.publish(id, userId);

        return success(c, {
          regulationId: result.regulationId,
          requirementCount: result.requirementCount,
          message: 'Regulation published to production',
        }, { status: 201 });
      } catch (err) {
        if (err instanceof Error) {
          if (err.message.includes('not found')) {
            return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
          }
          if (err.message.includes('not approved')) {
            return error(c, 'BAD_REQUEST', err.message, 400);
          }
        }
        throw err;
      }
    }
  );
```

**Step 2: Add integration test**

Add to `apps/api/src/routes/admin/ingestor.integration.test.ts`:

```typescript
  describe('POST /staging/:id/publish', () => {
    it('should_publish_approved_staging_regulation', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create and approve a staging regulation
      const em = orm.em.fork();
      const stagingService = new StagingService(em);
      const { regulation, requirements } = await stagingService.createStagingRegulation({
        code: 'PUBLISH_API_TEST',
        name: 'Publish API Test',
        sourceUrl: 'https://example.com',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        requirements: [
          {
            code: 'REQ_1',
            name: 'Test Requirement',
            type: RequirementType.DECLARATION,
            severity: RequirementSeverity.WARNING,
            confidenceScore: 0.99,
            consensusStatus: ConsensusStatus.MATCH,
          },
        ],
      });

      await stagingService.approveRequirement(requirements[0].id, 'test');

      const testApp = createTestApp();
      const res = await testApp.request(`/ingestor/staging/${regulation.id}/publish`, {
        method: 'POST',
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.regulationId).toBeDefined();
      expect(data.data.requirementCount).toBe(1);
    });
  });
```

**Step 3: Run tests**

```bash
cd apps/api && pnpm build && pnpm test src/routes/admin/ingestor.integration.test.ts
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add apps/api/src/routes/admin/ingestor.ts apps/api/src/routes/admin/ingestor.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(api): add publish endpoint to ingestor admin routes

POST /staging/:id/publish publishes approved staging regulations
to production tables (public.regulation, public.requirement).

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 21-24: Update Postman Collection

**Files:**
- Modify: `docs/testing/postman/admin-api.postman_collection.json`

**Step 1: Add Ingestor folder to admin collection**

Add the following requests to `admin-api.postman_collection.json`:

1. **List Staging Regulations**
   - GET `{{baseUrl}}/api/v1/admin/ingestor/staging`
   - Headers: `X-Admin-Key: {{adminApiKey}}`

2. **Get Staging Regulation**
   - GET `{{baseUrl}}/api/v1/admin/ingestor/staging/:id`
   - Headers: `X-Admin-Key: {{adminApiKey}}`

3. **Bulk Approve Matches**
   - POST `{{baseUrl}}/api/v1/admin/ingestor/staging/:id/bulk-approve`
   - Headers: `X-Admin-Key: {{adminApiKey}}`

4. **Publish to Production**
   - POST `{{baseUrl}}/api/v1/admin/ingestor/staging/:id/publish`
   - Headers: `X-Admin-Key: {{adminApiKey}}`

5. **Delete Staging Regulation**
   - DELETE `{{baseUrl}}/api/v1/admin/ingestor/staging/:id`
   - Headers: `X-Admin-Key: {{adminApiKey}}`

**Step 2: Commit**

```bash
git add docs/testing/postman/admin-api.postman_collection.json
git commit -m "$(cat <<'EOF'
docs(postman): add ingestor admin endpoints to collection

Adds AI regulation ingestor endpoints:
- List/Get staging regulations
- Bulk approve matches
- Publish to production
- Delete staging

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 Complete Checkpoint

At this point you should have:
- [ ] Ingestor admin router with all endpoints
- [ ] Router wired to app.ts
- [ ] PublishService for production publishing
- [ ] Integration tests for all endpoints
- [ ] Postman collection updated

Run full test suite:
```bash
cd apps/api && pnpm build && pnpm test
cd packages/database && pnpm build && pnpm test
```

All tests should pass before proceeding to Phase 3.

---

## Phase 3: Admin Dashboard UI (Tasks 25-32)

### Note on UI Implementation

Phase 3 covers the React admin dashboard for reviewing and approving staged regulations. This includes:

- Task 25: Create staging list page component
- Task 26: Create staging detail page with dual-pane layout
- Task 27: Create PDF viewer component with highlight support
- Task 28: Create requirement card component with consensus badge
- Task 29: Create reasoning drawer component
- Task 30: Create bulk approve button component
- Task 31: Create publish confirmation modal
- Task 32: Wire pages to admin router

**UI implementation follows the same TDD pattern:**
1. Write failing test (React Testing Library)
2. Implement component
3. Run tests
4. Commit

Due to the length of this plan, detailed UI task breakdowns are provided separately in:
`docs/plans/2026-01-29-ai-regulation-ingestor-ui-implementation.md`

---

## Phase 4: Citation Anchoring (Tasks 33-36)

### Task 33: Add PDF Coordinate Extraction to Claude Prompt

Enhance the extraction prompt to request PDF coordinates for each requirement.

### Task 34: Create PDF.js Viewer Wrapper

Create a React component that wraps PDF.js and supports:
- Page navigation
- Scroll to page
- Draw highlight rectangles at coordinates

### Task 35: Wire Highlight on Requirement Click

When user clicks a requirement in the review panel:
1. Get `pdfCoordinates` from requirement
2. Scroll PDF viewer to page
3. Draw highlight box at bbox coordinates

### Task 36: Integration Test for Citation Flow

End-to-end test that:
1. Extracts a document with coordinates
2. Stages it
3. Clicks requirement in UI
4. Verifies PDF scrolls and highlights

---

## Final Checklist

Before marking implementation complete:

- [ ] All Phase 0 tasks complete (staging infrastructure)
- [ ] All Phase 1 tasks complete (extraction services)
- [ ] All Phase 2 tasks complete (admin API)
- [ ] All Phase 3 tasks complete (admin UI)
- [ ] All Phase 4 tasks complete (citation anchoring)
- [ ] Full test suite passes
- [ ] Postman collection updated and tested
- [ ] Documentation updated (README, guides)
- [ ] No TypeScript errors
- [ ] No ESLint errors

---

## Quick Reference Commands

```bash
# Build all packages
pnpm build

# Run all tests
pnpm test

# Run specific package tests
cd packages/database && pnpm test
cd packages/ingestor && pnpm test
cd apps/api && pnpm test

# Reset database (apply migrations fresh)
pnpm db:reset

# Start dev server
pnpm dev
```

---

*Implementation plan created: 2026-01-29*
*Estimated tasks: 36*
*Phases: 5 (including Phase 0)*
