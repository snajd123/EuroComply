# Unified Taxonomy & Compliance Stack Implementation Plan

> **STATUS: IMPLEMENTED** - This plan has been completed. The terminology was updated to use the simplified naming convention (Regulation, Requirement, CategoryRegulation, TenantRequirementExemption).

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Compliance Stack architecture from the design document, enabling system categories with regulatory baselines, tenant additions, and justified exemptions.

**Architecture:** Dual-layer category system (public + tenant schemas), 3-layer compliance resolution (System Baseline → Tenant Additions → Tenant Exemptions), justified exemption audit trail.

**Tech Stack:** MikroORM, PostgreSQL, TypeScript, Hono

**Prerequisites:**
- Category entities exist (Plan 05 partially done)
- CategoryAdoption exists and works (implemented)
- TenantCategory exists (implemented)

**Reference:** See `docs/plans/2026-01-27-unified-taxonomy-compliance-stack-design.md`

**Migration Policy (per RULES.md):**
- **Single consolidated migration** (`Migration20260122000000.ts`) - update this file for all public schema changes
- **TenantProvisioner** - update for tenant schema changes
- **After schema changes**: Run `pnpm db:reset` to apply
- **No incremental migration files during development**

---

## Phase 1: Update Existing Plan Documents

Before implementing, we must update the existing plans to align with the new design.

### Task 1: Update Plan 10 - Add allowTenantExemption Flag

**Files:**
- Modify: `docs/plans/2026-01-26-taxonomy-10-regulatory-list-registry.md`

**Step 1: Read current Plan 10**

```bash
# Already read - we know the structure
```

**Step 2: Add allowTenantExemption to Regulation entity**

In the Regulation entity section, add:

```typescript
/**
 * Whether tenants can exempt from this regulation.
 * Some regulations (e.g., prohibited substances) may not allow exemptions.
 * Default: true (most regulations can be exempted with justification)
 */
@Property({ type: 'boolean', default: true, name: 'allow_tenant_exemption' })
allowTenantExemption: boolean = true;
```

**Step 3: Update the migration section**

Add to the CREATE TABLE statement:
```sql
allow_tenant_exemption BOOLEAN NOT NULL DEFAULT true,
```

**Step 4: Update the service CreateListInput interface**

```typescript
export interface CreateListInput {
  // ... existing fields ...
  allowTenantExemption?: boolean;  // NEW
}
```

**Step 5: Commit the plan update**

```bash
git add docs/plans/2026-01-26-taxonomy-10-regulatory-list-registry.md
git commit -m "docs(plans): update Plan 10 - add allowTenantExemption flag per design"
```

---

### Task 2: Update Plan 11 - Major Rewrite for Compliance Stack

**Files:**
- Modify: `docs/plans/2026-01-26-taxonomy-11-category-list-scoping.md`

**Step 1: Update the Goal section**

Change from:
> Implement CategoryRegulation join table enabling LTREE-based inheritance

To:
> Implement dual-layer regulatory scoping: CategoryRegulation (public schema for system baseline) and TenantRequirementExemption (tenant schema for additions + exemptions). Includes ComplianceStackResolver for 3-layer resolution.

**Step 2: Add TenantRequirementExemption entity section**

Add new Task after CategoryRegulation:

```typescript
// packages/database/src/entities/TenantRequirementExemption.ts
@Entity({ tableName: 'tenant_requirement_exemption' })
@Unique({ properties: ['tenantCategory', 'regulationId'] })
export class TenantRequirementExemption extends BaseEntity {
  @ManyToOne(() => TenantCategory, { name: 'tenant_category_id' })
  tenantCategory!: TenantCategory;

  @Property({ type: 'text', name: 'regulation_id' })
  regulationId!: string;  // Soft link to public.regulation

  @Enum(() => ListRequirement)
  requirement!: ListRequirement;

  @Enum(() => RegulationSource)
  source!: RegulationSource;  // INHERITED | TENANT_ADDED

  // Exemption fields
  @Property({ type: 'boolean', default: false, name: 'is_exempted' })
  isExempted: boolean = false;

  @Property({ type: 'text', nullable: true, name: 'exemption_reason' })
  exemptionReason?: string;

  @Property({ type: 'text', nullable: true, name: 'exemption_legal_ref' })
  exemptionLegalRef?: string;

  @Property({ type: 'text', nullable: true, name: 'exempted_by' })
  exemptedBy?: string;

  @Property({ type: 'timestamptz', nullable: true, name: 'exempted_at' })
  exemptedAt?: Date;

  @Property({ type: 'decimal', nullable: true, name: 'override_threshold' })
  overrideThreshold?: string;
}
```

**Step 3: Add RegulationSource enum**

```typescript
// packages/database/src/entities/enums/RegulationSource.ts
export enum RegulationSource {
  INHERITED = 'INHERITED',    // From system baseline
  TENANT_ADDED = 'TENANT_ADDED',  // Tenant-specific addition
}
```

**Step 4: Add ComplianceStackResolver service section**

```typescript
// packages/database/src/services/ComplianceStackResolver.ts
export interface EffectiveRegulation {
  regulationId: string;
  regulationCode: string;
  source: 'SYSTEM' | 'TENANT';
  requirement: ListRequirement;
  status: 'ACTIVE' | 'EXEMPTED';
  exemption?: {
    reason: string;
    legalRef?: string;
    exemptedBy: string;
    exemptedAt: Date;
  };
  allowExemption: boolean;
  overrideThreshold?: string;
}

export class ComplianceStackResolver {
  async resolve(tenantCategoryId: string): Promise<EffectiveRegulation[]>;
}
```

**Step 5: Update CategoryRegulation entity**

Add `allowTenantExemption` field:
```typescript
@Property({ type: 'boolean', default: true, name: 'allow_tenant_exemption' })
allowTenantExemption: boolean = true;
```

**Step 6: Commit the plan update**

```bash
git add docs/plans/2026-01-26-taxonomy-11-category-list-scoping.md
git commit -m "docs(plans): rewrite Plan 11 for Compliance Stack architecture"
```

---

### Task 3: Update Plan 05 - Category Service Split

**Files:**
- Read and modify: `docs/plans/2026-01-23-taxonomy-05-category-service.md` (if exists)

**Step 1: Locate Plan 05**

```bash
ls docs/plans/*05*.md
```

**Step 2: Update to reflect dual category model**

Key changes:
- Split into SystemCategoryService (admin operations on public.category)
- TenantCategoryService (tenant operations on tenant.tenant_category)
- Reference CategoryAdoption for adoption flow (already implemented)

**Step 3: Commit**

```bash
git add docs/plans/*05*.md
git commit -m "docs(plans): update Plan 05 for dual category model"
```

---

### Task 4: Update Plan 14 - Add JUSTIFIED_EXEMPTION Status

**Files:**
- Read and modify: `docs/plans/*14*.md`

**Step 1: Locate Plan 14**

```bash
ls docs/plans/*14*.md
```

**Step 2: Add JUSTIFIED_EXEMPTION to FindingStatus enum**

```typescript
export enum FindingStatus {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  JUSTIFIED_EXEMPTION = 'JUSTIFIED_EXEMPTION',  // NEW
  NOT_EVALUATED = 'NOT_EVALUATED',
}
```

**Step 3: Update evaluation logic**

Add exemption handling:
```typescript
// Before evaluating a regulation, check if exempted
const effectiveRegs = await complianceStackResolver.resolve(tenantCategoryId);

for (const reg of effectiveRegs) {
  if (reg.status === 'EXEMPTED') {
    findings.push({
      regulationCode: reg.regulationCode,
      status: FindingStatus.JUSTIFIED_EXEMPTION,
      exemptionReason: reg.exemption.reason,
      exemptionLegalRef: reg.exemption.legalRef,
    });
    continue;  // Skip substance checks for exempted regulations
  }
  // ... normal evaluation
}
```

**Step 4: Update report structure**

Add exemptions section to PreFlightReport.

**Step 5: Commit**

```bash
git add docs/plans/*14*.md
git commit -m "docs(plans): update Plan 14 - add JUSTIFIED_EXEMPTION status"
```

---

### Task 5: Update Plan 15 - Seeder Updates

**Files:**
- Read and modify: `docs/plans/*15*.md`

**Step 1: Locate Plan 15**

```bash
ls docs/plans/*15*.md
```

**Step 2: Add CategoryRegulation seeding**

Add section for seeding system category → regulation links:
```typescript
// Seed: Electronics → [REACH_SVHC, ROHS_RESTRICTED, WEEE]
// Seed: Cosmetics → [COSING_ANNEX_II, COSING_ANNEX_III, REACH_SVHC]
```

**Step 3: Add allowTenantExemption examples**

```typescript
// REACH_SVHC: allowTenantExemption = true (can be exempted with justification)
// COSING_ANNEX_II: allowTenantExemption = false (prohibited substances - no exemption)
```

**Step 4: Commit**

```bash
git add docs/plans/*15*.md
git commit -m "docs(plans): update Plan 15 - add CategoryRegulation seeding"
```

---

## Phase 2: Implement Plan 10 (Regulation with allowTenantExemption)

Since Plans 10 and 11 are not yet implemented, we implement them with the design updates included.

### Task 6: Create ComparisonOperator and Severity Enums

**Files:**
- Create: `packages/database/src/entities/enums/ComparisonOperator.ts`
- Create: `packages/database/src/entities/enums/Severity.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create ComparisonOperator enum**

```typescript
// packages/database/src/entities/enums/ComparisonOperator.ts
export enum ComparisonOperator {
  GT = 'GT',
  GTE = 'GTE',
  LT = 'LT',
  LTE = 'LTE',
  EQ = 'EQ',
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
}
```

**Step 2: Create Severity enum**

```typescript
// packages/database/src/entities/enums/Severity.ts
export enum Severity {
  BLOCKER = 'BLOCKER',
  WARNING = 'WARNING',
  INFO = 'INFO',
}
```

**Step 3: Export from index**

**Step 4: Verify build**

```bash
cd packages/database && pnpm build
```

**Step 5: Commit**

```bash
git add packages/database/src/entities/enums/
git commit -m "feat(database): add ComparisonOperator and Severity enums"
```

---

### Task 7: Create Regulation Entity (with allowTenantExemption)

**Files:**
- Create: `packages/database/src/entities/Regulation.ts`
- Create: `packages/database/src/entities/Regulation.test.ts`

**Step 1: Write the failing test**

Test should include `allowTenantExemption` field.

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test Regulation.test.ts
```

**Step 3: Write implementation**

Include `allowTenantExemption: boolean = true` field.

**Step 4: Run test to verify it passes**

**Step 5: Export and commit**

```bash
git add packages/database/src/entities/Regulation*
git commit -m "feat(database): add Regulation entity with allowTenantExemption"
```

---

### Task 8: Create Requirement Entity

**Files:**
- Create: `packages/database/src/entities/Requirement.ts`
- Create: `packages/database/src/entities/Requirement.test.ts`

Follow Plan 10 Task 3 exactly.

**Commit:**
```bash
git commit -m "feat(database): add Requirement entity with forensic snapshots"
```

---

### Task 9: Update Consolidated Migration for Regulation Tables

**Files:**
- Modify: `packages/database/src/migrations/Migration20260122000000.ts`

**Step 1: Add regulation table to the consolidated migration**

Add after existing public schema tables:

```sql
-- Regulation Registry (public schema)
CREATE TABLE IF NOT EXISTS public.regulation (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  version TEXT NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL,
  superseded_date TIMESTAMPTZ,
  is_current_version BOOLEAN NOT NULL DEFAULT true,
  allow_tenant_exemption BOOLEAN NOT NULL DEFAULT true,
  source_url TEXT,
  description TEXT,
  previous_version_id TEXT REFERENCES public.regulation(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_regulation_code_version UNIQUE (code, version)
);

CREATE INDEX IF NOT EXISTS idx_regulation_code ON public.regulation (code);
CREATE INDEX IF NOT EXISTS idx_regulation_current ON public.regulation (code) WHERE is_current_version = true;

-- Requirements (public schema)
CREATE TABLE IF NOT EXISTS public.requirement (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES public.regulation(id) ON DELETE CASCADE,
  substance_id TEXT NOT NULL REFERENCES public.substance(id),
  cas_number_snapshot TEXT NOT NULL,
  substance_name_snapshot TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('GT', 'GTE', 'LT', 'LTE', 'EQ', 'PRESENT', 'ABSENT')),
  compare_value NUMERIC(7,4),
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('BLOCKER', 'WARNING', 'INFO')),
  stoichiometric_factor NUMERIC(5,4),
  conditions JSONB,
  legal_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_requirement_list_substance UNIQUE (list_id, substance_id)
);

CREATE INDEX IF NOT EXISTS idx_requirement_list ON public.requirement (list_id);
CREATE INDEX IF NOT EXISTS idx_requirement_substance ON public.requirement (substance_id);
```

**Step 2: Reset database**

```bash
pnpm db:reset
```

**Step 3: Commit**

```bash
git add packages/database/src/migrations/Migration20260122000000.ts
git commit -m "feat(database): add regulation tables to consolidated migration"
```

---

### Task 10: Create RegulationService

**Files:**
- Create: `packages/database/src/services/RegulationService.ts`
- Create: `packages/database/src/services/RegulationService.test.ts`

Follow Plan 10 Task 5.

**Commit:**
```bash
git commit -m "feat(database): add RegulationService"
```

---

## Phase 3: Implement Plan 11 (Category-List Scoping + Compliance Stack)

### Task 11: Create ListRequirement and RegulationSource Enums

**Files:**
- Create: `packages/database/src/entities/enums/ListRequirement.ts`
- Create: `packages/database/src/entities/enums/RegulationSource.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create ListRequirement**

```typescript
export enum ListRequirement {
  MANDATORY = 'MANDATORY',
  RECOMMENDED = 'RECOMMENDED',
  INFORMATIONAL = 'INFORMATIONAL',
}
```

**Step 2: Create RegulationSource**

```typescript
export enum RegulationSource {
  INHERITED = 'INHERITED',
  TENANT_ADDED = 'TENANT_ADDED',
}
```

**Step 3: Export and commit**

```bash
git commit -m "feat(database): add ListRequirement and RegulationSource enums"
```

---

### Task 12: Create CategoryRegulation Entity (Public Schema)

**Files:**
- Create: `packages/database/src/entities/CategoryRegulation.ts`
- Create: `packages/database/src/entities/CategoryRegulation.test.ts`

Include `allowTenantExemption` field.

**Commit:**
```bash
git commit -m "feat(database): add CategoryRegulation entity (public schema)"
```

---

### Task 13: Create TenantRequirementExemption Entity (Tenant Schema)

**Files:**
- Create: `packages/database/src/entities/TenantRequirementExemption.ts`
- Create: `packages/database/src/entities/TenantRequirementExemption.test.ts`

**Step 1: Write the failing test**

```typescript
describe('TenantRequirementExemption Entity', () => {
  it('creates tenant regulation link', async () => {
    // Test basic creation
  });

  it('supports exemption with audit fields', async () => {
    // Test exemption fields
  });

  it('enforces unique constraint on tenantCategory + regulationId', async () => {
    // Test uniqueness
  });
});
```

**Step 2: Write implementation**

```typescript
@Entity({ tableName: 'tenant_requirement_exemption' })
@Unique({ properties: ['tenantCategory', 'regulationId'] })
export class TenantRequirementExemption extends BaseEntity {
  @ManyToOne(() => TenantCategory, { name: 'tenant_category_id' })
  tenantCategory!: TenantCategory;

  @Property({ type: 'text', name: 'regulation_id' })
  regulationId!: string;

  @Enum(() => ListRequirement)
  requirement!: ListRequirement;

  @Enum(() => RegulationSource)
  source!: RegulationSource;

  @Property({ type: 'boolean', default: false, name: 'is_exempted' })
  isExempted: boolean = false;

  @Property({ type: 'text', nullable: true, name: 'exemption_reason' })
  exemptionReason?: string;

  @Property({ type: 'text', nullable: true, name: 'exemption_legal_ref' })
  exemptionLegalRef?: string;

  @Property({ type: 'text', nullable: true, name: 'exempted_by' })
  exemptedBy?: string;

  @Property({ type: 'timestamptz', nullable: true, name: 'exempted_at' })
  exemptedAt?: Date;

  @Property({ type: 'decimal', nullable: true, name: 'override_threshold' })
  overrideThreshold?: string;
}
```

**Step 3: Add to tenantOnlyEntities in index.ts**

**Commit:**
```bash
git commit -m "feat(database): add TenantRequirementExemption entity"
```

---

### Task 14: Update Consolidated Migration and TenantProvisioner

**Files:**
- Modify: `packages/database/src/migrations/Migration20260122000000.ts` (public schema)
- Modify: `packages/database/src/services/tenant-provisioner.ts` (tenant schema)

**Step 1: Add category_regulation to consolidated migration (public schema)**

Add after requirement table:

```sql
-- CategoryRegulation (public schema - system baseline)
CREATE TABLE IF NOT EXISTS public.category_regulation (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES public.category(id) ON DELETE CASCADE,
  regulation_id TEXT NOT NULL REFERENCES public.regulation(id) ON DELETE CASCADE,
  requirement TEXT NOT NULL CHECK (requirement IN ('MANDATORY', 'RECOMMENDED', 'INFORMATIONAL')),
  allow_tenant_exemption BOOLEAN NOT NULL DEFAULT true,
  priority SMALLINT NOT NULL DEFAULT 0,
  is_exclusion BOOLEAN NOT NULL DEFAULT false,
  compare_value_override NUMERIC(5,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_category_regulation UNIQUE (category_id, regulation_id)
);

CREATE INDEX IF NOT EXISTS idx_cat_reg_list_category ON public.category_regulation (category_id);
CREATE INDEX IF NOT EXISTS idx_cat_reg_list_list ON public.category_regulation (regulation_id);
```

**Step 2: Update TenantProvisioner for tenant_requirement_exemption**

In `tenant-provisioner.ts`:

1. Add to `EXPECTED_TENANT_TABLES`:
```typescript
'tenant_requirement_exemption',
```

2. Add table creation in `createTenantTables()`:
```sql
-- TenantRequirementExemption (tenant additions + exemptions)
CREATE TABLE IF NOT EXISTS "${schema}".tenant_requirement_exemption (
  id TEXT PRIMARY KEY,
  tenant_category_id TEXT NOT NULL REFERENCES "${schema}".tenant_category(id) ON DELETE CASCADE,
  regulation_id TEXT NOT NULL,
  requirement TEXT NOT NULL CHECK (requirement IN ('MANDATORY', 'RECOMMENDED', 'INFORMATIONAL')),
  source TEXT NOT NULL CHECK (source IN ('INHERITED', 'TENANT_ADDED')),
  is_exempted BOOLEAN NOT NULL DEFAULT false,
  exemption_reason TEXT,
  exemption_legal_ref VARCHAR(255),
  exempted_by TEXT,
  exempted_at TIMESTAMPTZ,
  override_threshold NUMERIC(10,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_cat_reg_list UNIQUE (tenant_category_id, regulation_id)
);

CREATE INDEX IF NOT EXISTS idx_tcrl_category ON "${schema}".tenant_requirement_exemption (tenant_category_id);
CREATE INDEX IF NOT EXISTS idx_tcrl_list ON "${schema}".tenant_requirement_exemption (regulation_id);
```

**Step 3: Reset database**

```bash
pnpm db:reset
```

**Step 4: Commit**

```bash
git add packages/database/src/migrations/Migration20260122000000.ts packages/database/src/services/tenant-provisioner.ts
git commit -m "feat(database): add category regulation tables (public + tenant)"
```

---

### Task 15: Create ComplianceStackResolver Service

**Files:**
- Create: `packages/database/src/services/ComplianceStackResolver.ts`
- Create: `packages/database/src/services/ComplianceStackResolver.test.ts`

**Step 1: Write the failing test**

```typescript
describe('ComplianceStackResolver', () => {
  describe('resolve', () => {
    it('returns system baseline regulations for adopted category', async () => {
      // Setup: TenantCategory adopted from system category with REACH_SVHC linked
      // Expect: REACH_SVHC in result with source: SYSTEM, status: ACTIVE
    });

    it('includes tenant-added regulations', async () => {
      // Setup: Tenant adds IEC-62368 to their category
      // Expect: IEC-62368 in result with source: TENANT, status: ACTIVE
    });

    it('marks exempted regulations with EXEMPTED status', async () => {
      // Setup: Tenant exempts ROHS with justification
      // Expect: ROHS in result with status: EXEMPTED, exemption details included
    });

    it('respects allowTenantExemption guardrail', async () => {
      // Setup: Try to exempt regulation with allowTenantExemption = false
      // Expect: Throws or rejects
    });

    it('handles FROZEN mode with pinned regulation IDs', async () => {
      // Setup: CategoryAdoption in FROZEN mode with pinnedRegulationIds
      // Expect: Only pinned versions returned
    });
  });
});
```

**Step 2: Write implementation**

```typescript
export class ComplianceStackResolver {
  constructor(private readonly em: EntityManager) {}

  async resolve(tenantCategoryId: string, schema: string): Promise<EffectiveRegulation[]> {
    // 1. Get TenantCategory with systemCategoryId
    // 2. Get CategoryAdoption for mode (LIVE/FROZEN/DETACHED)
    // 3. If DETACHED, only return tenant-added regulations
    // 4. If LIVE/FROZEN, get system baseline from CategoryRegulation
    // 5. Get tenant additions/exemptions from TenantRequirementExemption
    // 6. Merge layers: System Baseline → Tenant Additions → Apply Exemptions
    // 7. Return EffectiveRegulation[]
  }
}
```

**Commit:**
```bash
git commit -m "feat(database): add ComplianceStackResolver service"
```

---

## Phase 4: API Routes

### Task 16: Create Admin Routes for System Category Regulatory Links

**Files:**
- Create: `apps/api/src/routes/admin/category-regulatory-lists.ts`
- Modify: `apps/api/src/routes/admin/index.ts` (register route)

**Endpoints (per design Section 6):**
- `GET /api/v1/admin/categories/:id/regulatory-lists` - List linked regulations
- `POST /api/v1/admin/categories/:id/regulatory-lists` - Link a regulation
- `DELETE /api/v1/admin/categories/:id/regulatory-lists/:listId` - Unlink

**Implementation requirements (per RULES.md):**
- Use `success()` and `error()` from `../utils/response.js` - NEVER `c.json()` directly
- Use Zod schemas with `zValidator` for request validation
- Fork EntityManager for queries

**Commit:**
```bash
git commit -m "feat(api): add admin routes for category regulation management"
```

---

### Task 17: Create Tenant Regulatory Lists Router

**Files:**
- Create: `apps/api/src/routes/tenant-category-regulatory-lists.ts`
- Modify: `apps/api/src/app.ts` (register route)

**Endpoints:**
- `GET /tenant-categories/:id/regulatory-lists` - Get compliance stack
- `POST /tenant-categories/:id/regulatory-lists` - Add tenant regulation
- `POST /tenant-categories/:id/regulatory-lists/:listId/exempt` - Create exemption
- `DELETE /tenant-categories/:id/regulatory-lists/:listId/exempt` - Remove exemption
- `DELETE /tenant-categories/:id/regulatory-lists/:listId` - Remove tenant-added

**Implementation requirements (per RULES.md):**
- Use `authorize('compliance', 'view')` / `authorize('compliance', 'edit')` middleware
- Use `success()` and `error()` from `../utils/response.js` - NEVER `c.json()` directly
- Wrap queries in transactions with `SET search_path TO "${schema}", public`
- Use Zod schemas with `zValidator` for request validation

**Commit:**
```bash
git commit -m "feat(api): add tenant category regulations routes"
```

---

### Task 18: Create E2E Tests for Compliance Stack

**Files:**
- Create: `apps/api/src/routes/tenant-category-regulatory-lists.e2e.test.ts`

**Test naming convention (per RULES.md):** `should_[expectedBehavior]_when_[condition]`

```typescript
describe('TenantRequirementExemptions', () => {
  describe('GET /tenant-categories/:id/regulatory-lists', () => {
    it('should return system baseline regulations when category is adopted', async () => {});
    it('should include tenant-added regulations when present', async () => {});
    it('should mark exempted regulations with EXEMPTED status when exemption exists', async () => {});
    it('should return 401 when authentication missing', async () => {});
    it('should return 403 when user lacks compliance:view permission', async () => {});
  });

  describe('POST /tenant-categories/:id/regulatory-lists/:listId/exempt', () => {
    it('should create exemption with audit trail when valid justification provided', async () => {});
    it('should return 403 when regulation has allowTenantExemption=false', async () => {});
    it('should return 400 when exemption reason is too short', async () => {});
  });
});
```

**Commit:**
```bash
git commit -m "test(api): add e2e tests for compliance stack"
```

---

### Task 19: Update Postman Collections

**Files (per RULES.md Section 16):**
- Modify: `docs/testing/postman/admin-api.postman_collection.json`
- Modify: `docs/testing/postman/tenant-api.postman_collection.json`

**Admin API collection - add requests:**
- "List Category Regulatory Links" - `GET /api/v1/admin/categories/:categoryId/regulatory-lists`
- "Link Regulation to Category" - `POST /api/v1/admin/categories/:categoryId/regulatory-lists`
- "Unlink Regulation from Category" - `DELETE /api/v1/admin/categories/:categoryId/regulatory-lists/:listId`

**Tenant API collection - add requests:**
- "Get Compliance Stack" - `GET /api/v1/tenant-categories/:id/regulatory-lists`
- "Add Tenant Regulation" - `POST /api/v1/tenant-categories/:id/regulatory-lists`
- "Create Exemption" - `POST /api/v1/tenant-categories/:id/regulatory-lists/:listId/exempt`
- "Remove Exemption" - `DELETE /api/v1/tenant-categories/:id/regulatory-lists/:listId/exempt`
- "Remove Tenant Regulation" - `DELETE /api/v1/tenant-categories/:id/regulatory-lists/:listId`

**Each request must include:**
- All parameters documented
- Test scripts verifying status code and response structure
- Error case examples (401, 403, 404)

**Commit:**
```bash
git commit -m "docs(postman): add compliance stack endpoints to collections"
```

---

## Phase 5: Update CategoryAdoption for pinnedRegulationIds

### Task 20: Add pinnedRegulationIds to CategoryAdoption

**Files:**
- Modify: `packages/database/src/entities/CategoryAdoption.ts`
- Update test

**Add field:**
```typescript
@Property({ type: 'array', nullable: true, name: 'pinned_regulation_ids' })
pinnedRegulationIds?: string[];
```

**Commit:**
```bash
git commit -m "feat(database): add pinnedRegulationIds to CategoryAdoption"
```

---

### Task 21: Update PATCH /category-adoption/:id for FROZEN Mode

**Files:**
- Modify: `apps/api/src/routes/category-adoption.ts`

When changing to FROZEN mode, capture current regulation IDs.

**Commit:**
```bash
git commit -m "feat(api): capture pinnedRegulationIds on FROZEN mode"
```

---

## Phase 6: Run Full Test Suite and Verify

### Task 22: Run All Tests

```bash
pnpm test
```

Ensure all tests pass.

### Task 23: Update GUIDES Documentation

**Files:**
- Modify: `docs/guides/regulatory-vertical-system-explained.md`

Update to reflect:
1. Dual category model
2. Adoption flow
3. Compliance stack resolution
4. Exemptions with justification

**Commit:**
```bash
git commit -m "docs: update regulatory vertical system guide for compliance stack"
```

---

## Summary

**Phase 1:** Update plan documents (Tasks 1-5)
**Phase 2:** Implement Plan 10 - Regulation registry (Tasks 6-10)
**Phase 3:** Implement Plan 11 - Category-List scoping + Compliance Stack (Tasks 11-15)
**Phase 4:** API routes + Postman (Tasks 16-19)
**Phase 5:** CategoryAdoption pinnedRegulationIds (Tasks 20-21)
**Phase 6:** Testing and documentation (Tasks 22-23)

**Total: 23 tasks**

**RULES.md Compliance Checklist:**
- [x] Single consolidated migration (Task 9, 14)
- [x] TDD with test-first approach (all entity/service tasks)
- [x] Test naming: `should_*_when_*` (Task 18)
- [x] Response utilities: `success()` / `error()` (Tasks 16, 17)
- [x] Authorization middleware (Task 17)
- [x] Multi-tenant safety: fork + transaction + search_path (Tasks 16, 17)
- [x] Postman collection updates (Task 19)
- [x] Documentation updates (Task 23)

**New Entities Created:**
- `Regulation` (public)
- `Requirement` (public)
- `CategoryRegulation` (public)
- `TenantRequirementExemption` (tenant)

**New Services Created:**
- `RegulationService`
- `CategoryRegulationService`
- `ComplianceStackResolver`

**New Enums:**
- `ComparisonOperator`
- `Severity`
- `ListRequirement`
- `RegulationSource`

---

*Plan created: 2026-01-27*
