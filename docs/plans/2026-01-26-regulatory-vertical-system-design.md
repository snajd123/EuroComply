# Regulatory Vertical System - Design Document

> **STATUS: IMPLEMENTED** (2026-01-28)
>
> This design has been fully implemented. The entities described here are live in the codebase.
> See the actual implementation in `packages/database/src/entities/`:
> - `Regulation.ts` - Regulation entity (replaces RegulatoryList)
> - `Requirement.ts` - Requirement entity (replaces RegulatoryListEntry)
> - `CategoryRegulation.ts` - Category-Regulation mapping (replaces CategoryRegulatoryList)
> - `TenantRequirementExemption.ts` - Tenant exemptions (replaces TenantCategoryRegulatoryList)

**Goal:** Replace hardcoded regulatory data with a data-driven vertical system that supports admin-managed imports, temporal versioning, and category-aware compliance evaluation.

**Architecture:** Public schema holds versioned Regulations with requirement entries. Categories link to applicable regulations via LTREE inheritance. PreFlight evaluation dynamically resolves which regulations apply based on product category, then cross-references rolled-up substances against requirement entries.

**Key Decisions:**
- **Handler-based evaluation model**: RequirementType + handlerConfig stored in database, not code
- Admin-managed CSV/JSON import (not live API sync)
- Immutable regulation versions for forensic compliance
- ARTICLE vs HOMOGENEOUS_MATERIAL evaluation scope
- Denormalized snapshots prevent substance drift
- All violations returned at once (no whack-a-mole)

---

## 1. Core Entities

### 1.1 Regulation (Public Schema)

```typescript
@Entity({ tableName: 'regulation', schema: 'public' })
export class Regulation extends BaseEntity {

  @Property({ type: 'text' })
  @Unique()
  code!: string;  // 'REACH', 'ROHS', 'CLP' - stable identifier

  @Property({ type: 'text' })
  name!: string;  // 'REACH Regulation'

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Enum({ items: () => RegulationStatus, default: RegulationStatus.DRAFT })
  status: RegulationStatus = RegulationStatus.DRAFT;  // DRAFT, ACTIVE, ARCHIVED

  @Property({ type: 'text', nullable: true })
  version?: string;  // '2024-01', '2026-01'

  @Property({ type: 'date', nullable: true, name: 'effective_date' })
  effectiveDate?: Date;  // When this version became law

  @Property({ type: 'text', nullable: true, name: 'source_url' })
  sourceUrl?: string;  // Deep link to official EU source

  @ManyToOne(() => Regulation, { nullable: true, name: 'superseded_by_id' })
  supersededBy?: Regulation;  // Reference to the regulation that supersedes this one

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

  @OneToMany('Requirement', 'regulation')
  requirements = new Collection<Requirement>(this);
}

enum RegulationStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}
```

### 1.2 Requirement (Public Schema)

**HANDLER-BASED EVALUATION MODEL:** The requirement defines the type and configuration via `type` + `handlerConfig`.
Four requirement types are supported with extensible handler configuration.

```typescript
@Entity({ tableName: 'requirement', schema: 'public' })
@Unique({ properties: ['regulation', 'code'] })
export class Requirement extends BaseEntity {

  @ManyToOne(() => Regulation, { name: 'regulation_id' })
  @Index()
  regulation!: Regulation;

  @Property({ type: 'text' })
  code!: string;  // 'VOLTAGE_CHECK', 'LEAD_SCREEN' - unique within regulation

  @Property({ type: 'text' })
  name!: string;  // 'Voltage Compliance Check'

  @Property({ type: 'text', nullable: true })
  description?: string;

  // ─────────────────────────────────────────────────────────────
  // HANDLER-BASED EVALUATION FIELDS (replaces hardcoded RestrictionType)
  // ─────────────────────────────────────────────────────────────

  @Enum({ items: () => RequirementType })
  type!: RequirementType;  // ATTRIBUTE_CHECK, SUBSTANCE_SCREEN, CALCULATED_CHECK, DECLARATION

  @Enum({ items: () => RequirementSeverity, default: RequirementSeverity.WARNING })
  severity: RequirementSeverity = RequirementSeverity.WARNING;

  // Type-specific fields
  @Property({ type: 'text', nullable: true, name: 'attribute_template_key' })
  attributeTemplateKey?: string | null;  // For ATTRIBUTE_CHECK

  @Property({ type: 'text', nullable: true, name: 'substance_list_id' })
  substanceListId?: string | null;  // For SUBSTANCE_SCREEN

  @Property({ type: 'text', nullable: true, name: 'calculation_formula' })
  calculationFormula?: string | null;  // For CALCULATED_CHECK

  @Property({ type: 'jsonb', nullable: true, name: 'handler_config' })
  handlerConfig?: RequirementHandlerConfig | null;  // Handler configuration

  // ─────────────────────────────────────────────────────────────

  @Property({ type: 'text', nullable: true, name: 'legal_reference' })
  legalReference?: string | null;  // 'Article 33, REACH Regulation'

  @Property({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder: number = 0;

  @Property({ type: 'boolean', default: true, name: 'allow_tenant_exemption' })
  allowTenantExemption: boolean = true;
}

enum RequirementType {
  ATTRIBUTE_CHECK = 'ATTRIBUTE_CHECK',      // Validates a product attribute value
  SUBSTANCE_SCREEN = 'SUBSTANCE_SCREEN',    // Screens against a substance list
  CALCULATED_CHECK = 'CALCULATED_CHECK',    // Evaluates a calculated formula
  DECLARATION = 'DECLARATION',              // Requires user attestation/declaration
}

enum RequirementSeverity {
  BLOCKER = 'BLOCKER',
  WARNING = 'WARNING',
  INFO = 'INFO',
}

// Handler configuration for requirement evaluation
interface RequirementHandlerConfig {
  operator?: ComparisonOperator;        // For threshold checks
  threshold?: number;                    // Threshold value
  unit?: string;                        // Unit of measurement
  pattern?: string;                     // Regex for string matching
  defaultThresholdPct?: number;         // Default threshold for substance screens
  question?: string;                    // Question text for DECLARATION
  acceptedAnswers?: string[];           // Accepted answers for DECLARATION
  requiresDocument?: boolean;           // Whether document is required
  acceptedDocumentTypes?: string[];     // Accepted document types
}

// Comparison operators (shared across requirement types)
enum ComparisonOperator {
  GT = 'GT',           // value > threshold
  GTE = 'GTE',         // value >= threshold
  LT = 'LT',           // value < threshold
  LTE = 'LTE',         // value <= threshold
  EQ = 'EQ',           // value == threshold
  PRESENT = 'PRESENT', // value > 0 (any presence)
  ABSENT = 'ABSENT',   // value must be 0 (must be absent)
}
```

### 1.3 CategoryRegulation (Public Schema)

```typescript
@Entity({ tableName: 'category_regulation', schema: 'public' })
@Unique({ properties: ['category', 'regulation'] })
export class CategoryRegulation extends BaseEntity {

  @ManyToOne(() => Category, { name: 'category_id' })
  @Index()
  category!: Category;  // The LTREE node

  @ManyToOne(() => Regulation, { name: 'regulation_id' })
  @Index()
  regulation!: Regulation;

  @Property({ type: 'timestamptz', name: 'added_at' })
  addedAt: Date = new Date();

  @Property({ type: 'text', nullable: true, name: 'added_by' })
  addedBy?: string;
}
```

### 1.4 TenantRequirementExemption (Tenant Schema)

```typescript
@Entity({ tableName: 'tenant_requirement_exemption' })
@Unique({ properties: ['tenantCategory', 'requirementId'] })
export class TenantRequirementExemption extends BaseEntity {

  @ManyToOne(() => TenantCategory, { name: 'tenant_category_id' })
  @Index()
  tenantCategory!: TenantCategory;

  @Property({ type: 'text', name: 'requirement_id' })
  @Index()
  requirementId!: string;  // Text FK to avoid cross-schema complexity

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

### 1.5 RegulatoryImportLog (Public Schema)

```typescript
@Entity({ tableName: 'regulatory_import_log', schema: 'public' })
export class RegulatoryImportLog extends BaseEntity {

  @Property()
  regulationCode!: string;

  @Property()
  version!: string;

  @Property()
  adminId!: string;

  @Property({ type: 'jsonb' })
  changes!: {
    requirementsAdded: number;
    requirementsRemoved: number;
    requirementsUpdated: number;
    unmatchedCas: string[];
  };

  @Property()
  appliedAt!: Date;

  @Property({ nullable: true })
  sourceFileName?: string;
}
```

---

## 2. Updated validationLogic Schema

### 2.1 Requirement Types

```typescript
// Four requirement types with handler-based evaluation
enum RequirementType {
  ATTRIBUTE_CHECK = 'ATTRIBUTE_CHECK',      // Validates a product attribute value
  SUBSTANCE_SCREEN = 'SUBSTANCE_SCREEN',    // Screens against a substance list
  CALCULATED_CHECK = 'CALCULATED_CHECK',    // Evaluates a calculated formula
  DECLARATION = 'DECLARATION',              // Requires user attestation/declaration
}
```

### 2.2 SUBSTANCE_SCREEN Handler Config

**HANDLER-BASED:** The config specifies WHICH substance list to check and HOW to scope evaluation.
The actual comparison logic comes from the handlerConfig.

```typescript
{
  type: 'SUBSTANCE_SCREEN',
  substanceListId: 'rohs-restricted-substances',
  handlerConfig: {
    operator: 'GTE',
    defaultThresholdPct: 0.1,  // 0.1% default threshold
  }
}
```

### 2.3 CALCULATED_CHECK Handler Config

```typescript
{
  type: 'CALCULATED_CHECK',
  calculationFormula: 'weightedSupplyRisk',
  handlerConfig: {
    operator: 'GT',
    threshold: 4.0,
  }
}
```

### 2.4 ATTRIBUTE_CHECK Handler Config

```typescript
{
  type: 'ATTRIBUTE_CHECK',
  attributeTemplateKey: 'voltage_rating',
  handlerConfig: {
    operator: 'LTE',
    threshold: 240,
    unit: 'V',
  }
}
```

### 2.5 DECLARATION Handler Config

```typescript
{
  type: 'DECLARATION',
  handlerConfig: {
    question: 'Does this product contain conflict minerals?',
    acceptedAnswers: ['NO', 'NOT_APPLICABLE'],
    requiresDocument: true,
    acceptedDocumentTypes: ['CONFLICT_MINERALS_REPORT'],
  }
}
```

---

## 3. Category-Regulation Scoping

### 3.1 LTREE Inheritance Query

```sql
-- Get all regulations for a moisturizer product
SELECT
  r.*,
  cr.added_at,
  c.path as matched_at,
  nlevel(c.path) as depth
FROM public.regulation r
JOIN public.category_regulation cr ON r.id = cr.regulation_id
JOIN public.category c ON c.id = cr.category_id
WHERE c.path @> 'products.cosmetics.skincare.moisturizers'::ltree
  AND r.status = 'ACTIVE'
ORDER BY nlevel(c.path) DESC;
```

### 3.2 With Tenant Exemptions Query

```sql
WITH applicable_requirements AS (
  SELECT
    req.*,
    r.code as regulation_code,
    r.name as regulation_name,
    c.path as matched_at,
    nlevel(c.path) as depth
  FROM public.requirement req
  JOIN public.regulation r ON req.regulation_id = r.id
  JOIN public.category_regulation cr ON r.id = cr.regulation_id
  JOIN public.category c ON c.id = cr.category_id
  WHERE c.path @> 'products.electronics.consumer'::ltree
    AND r.status = 'ACTIVE'
)
SELECT ar.* FROM applicable_requirements ar
WHERE NOT EXISTS (
  -- Exclude if tenant has exemption for this requirement
  SELECT 1 FROM tenant_requirement_exemption tre
  JOIN tenant_category tc ON tre.tenant_category_id = tc.id
  WHERE tre.requirement_id = ar.id::text
    AND tre.revoked_at IS NULL
    AND tc.category_id = ar.category_id
)
ORDER BY ar.depth DESC, ar.sort_order;
```

### 3.3 Concurrent Jurisdiction Example

```
products                         → REACH (all products)
products.electronics             → ROHS, WEEE (electronics only)
products.cosmetics               → CLP, Cosmetics Regulation
products.cosmetics.skincare      → (inherits from parent)
products.food_contact            → Food Contact Regulation
```

A smart electronic skincare device matches all three regulatory frameworks.

---

## 4. Finding Data Contract

### 4.1 SubstanceFinding

```typescript
interface SubstanceFinding extends AuditFinding {
  // Issue classification - from Requirement evaluation
  // Common values: 'PROHIBITED_SUBSTANCE', 'CHEMICAL_LIMIT_EXCEEDED', 'RESTRICTED_CONDITIONS'
  issueType: string;

  // What substance (null for MISSING_DOCUMENTATION)
  substance?: {
    casNumber: string;
    primaryName: string;
    effectiveConcentrationPct: string;
    scope: 'ARTICLE' | 'HOMOGENEOUS_MATERIAL';
  };

  evaluationContext: {
    // Legal authority
    appliedRegulation: {
      code: string;
      name: string;
      version: string;
      sourceUrl: string;
    };
    requirement: {
      code: string;
      name: string;
      type: RequirementType;
    };
    legalReference: string;

    // Why this rule applied
    categoryTrigger: string;
    reason: string;

    // Supply chain path (from rollup)
    traceability: Array<{
      materialName: string;
      materialVersionId: string;
      supplier?: string;
      concentrationInMaterial: string;
      contributionToProduct: string;
    }>;
  };

  // Actionable guidance
  remediation: {
    suggestion: string;
    alternativeCas?: string[];
    documentationRequired?: string[];
  };
}
```

### 4.2 MetricFinding

```typescript
interface MetricFinding extends AuditFinding {
  metricName: string;
  metricValue: string;
  threshold: string;
  operator: string;

  evaluationContext: {
    requirement: {
      code: string;
      name: string;
      type: 'CALCULATED_CHECK';
    };
    topDrivers: Array<{
      material: string;
      riskScore: string;
      contributionPct: string;
    }>;

    remediation: string;
  };
}
```

### 4.3 AuditResult Summary

```typescript
interface AuditResult {
  productVersionId: string;
  evaluatedAt: Date;

  findings: AuditFinding[];

  summary: {
    total: number;
    passed: number;
    failed: number;
    blockers: number;
    warnings: number;

    byIssueType: Record<string, number>;

    byRegulation: Record<string, {
      regulationCode: string;
      regulationName: string;
      violationCount: number;
    }>;
  };

  canProceed: boolean;
  resultStatus: 'PASS' | 'PASS_WITH_DEVIATIONS' | 'BLOCKED';
}
```

---

## 5. Admin Import Pipeline

### 5.1 Import Flow

```
Upload CSV/JSON → Validate Schema → Preview Diff → Apply Changes
                  (CAS checksum)   (add/remove)   (new version)
```

### 5.2 Import File Format

**HANDLER-BASED:** Import files define the full evaluation logic per requirement.
No hardcoded rule types - admins can import new requirements without code changes.

```typescript
interface RegulationImport {
  code: string;
  name: string;
  description?: string;
  version: string;
  effectiveDate: string;
  sourceUrl: string;
  requirements: RequirementImport[];
}

interface RequirementImport {
  code: string;
  name: string;
  description?: string;

  // HANDLER-BASED EVALUATION FIELDS
  type: 'ATTRIBUTE_CHECK' | 'SUBSTANCE_SCREEN' | 'CALCULATED_CHECK' | 'DECLARATION';
  severity: 'BLOCKER' | 'WARNING' | 'INFO';

  // Type-specific fields
  attributeTemplateKey?: string;
  substanceListId?: string;
  calculationFormula?: string;

  // Handler configuration
  handlerConfig?: {
    operator?: 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ' | 'PRESENT' | 'ABSENT';
    threshold?: number;
    unit?: string;
    pattern?: string;
    defaultThresholdPct?: number;
    question?: string;
    acceptedAnswers?: string[];
    requiresDocument?: boolean;
    acceptedDocumentTypes?: string[];
  };

  legalReference?: string;
  sortOrder?: number;
  allowTenantExemption?: boolean;
}
```

### 5.3 Versioning Strategy

- **Lifecycle states**: DRAFT → ACTIVE → ARCHIVED
- **Succession chain**: `supersededBy` links for history traversal
- **Point-in-time queries**: Products evaluated against regulation version effective at manufacture date
- **Soft archive**: Old regulations remain accessible but marked as ARCHIVED

### 5.4 Unmatched CAS Handling

**Warn & Skip**: Requirement ignored, warning shown, admin can add substance manually.

Dashboard shows "X requirements pending substance mapping."

---

## 6. Evaluation Flow

### 6.1 PreFlight Integration

```
Product Category (LTREE)
    ↓
CategoryRegulation (scope resolution)
    ↓
Applicable Regulations
    ↓
Requirements (from each Regulation)
    ↓
Filter by tenant exemptions (TenantRequirementExemption)
    ↓
RequirementHandler evaluation (by type)
    ↓
SubstanceRollupService + RawMaterialRollupService
    ↓
Cross-reference substances against requirements
    ↓
Build SubstanceFindings[] with traceability
    ↓
AuditResult (all violations at once)
```

### 6.2 Scope Evaluation

| Scope | What gets checked | Example |
|-------|-------------------|---------|
| `ARTICLE` | Rolled-up concentration (whole product) | REACH: "Total lead in shirt < 0.1%" |
| `HOMOGENEOUS_MATERIAL` | Each `MaterialSubstance` individually | RoHS: "Lead in each solder joint < 0.1%" |

---

## 7. Implementation Plans

This design has been split into focused implementation plans:

| Plan | Focus | Status |
|------|-------|--------|
| **10** | Regulatory List Registry | IMPLEMENTED |
| **11** | Category-Regulation Scoping | IMPLEMENTED |
| **12** | Admin Import Pipeline | IMPLEMENTED |
| **14** | Vertical Rule Evaluation | IMPLEMENTED |
| **15** | Regulatory Seeders | IMPLEMENTED |

*(Plan 13 is existing Regulatory Advisor)*

---

## 8. Index Requirements

```sql
-- GIST index for LTREE (from Plan 5)
CREATE INDEX idx_category_path_gist ON public.category USING GIST (path);

-- Composite index for join performance
CREATE INDEX idx_cat_reg_composite
  ON public.category_regulation (category_id, regulation_id);

-- Fast active regulation lookup
CREATE INDEX idx_regulation_active
  ON public.regulation (code) WHERE status = 'ACTIVE';

-- Requirement lookups by regulation
CREATE INDEX idx_requirement_regulation
  ON public.requirement (regulation_id);

-- Tenant exemption lookups
CREATE INDEX idx_tenant_req_exemption_requirement
  ON tenant_requirement_exemption (requirement_id);
```

---

## 9. Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              PUBLIC SCHEMA                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────┐         ┌─────────────────────┐                         │
│  │   Category      │         │    Regulation       │                         │
│  │   (LTREE)       │         │                     │                         │
│  ├─────────────────┤         ├─────────────────────┤                         │
│  │ id              │         │ id                  │                         │
│  │ path (ltree)    │         │ code (unique)       │                         │
│  │ name            │         │ name                │                         │
│  │ slug            │         │ status (enum)       │                         │
│  └────────┬────────┘         │ version             │                         │
│           │                  │ effectiveDate       │                         │
│           │                  │ supersededBy (FK)   │                         │
│           │                  └──────────┬──────────┘                         │
│           │                             │                                     │
│           │  ┌──────────────────────────┼──────────────────────────┐         │
│           │  │                          │                          │         │
│           ▼  ▼                          ▼                          │         │
│  ┌─────────────────────┐       ┌─────────────────────┐             │         │
│  │ CategoryRegulation  │       │    Requirement      │             │         │
│  │ (M:N Junction)      │       │                     │             │         │
│  ├─────────────────────┤       ├─────────────────────┤             │         │
│  │ category_id (FK)    │       │ regulation_id (FK)  │─────────────┘         │
│  │ regulation_id (FK)  │       │ code                │                       │
│  │ addedAt             │       │ name                │                       │
│  │ addedBy             │       │ type (enum)         │                       │
│  └─────────────────────┘       │ severity (enum)     │                       │
│                                │ handlerConfig       │                       │
│                                │ legalReference      │                       │
│                                │ allowTenantExemption│                       │
│                                └──────────┬──────────┘                       │
│                                           │                                   │
└───────────────────────────────────────────│───────────────────────────────────┘
                                            │
                                            │ (text FK, cross-schema)
                                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              TENANT SCHEMA                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────┐       ┌───────────────────────────┐                 │
│  │   TenantCategory    │       │ TenantRequirementExemption│                 │
│  │                     │       │                           │                 │
│  ├─────────────────────┤       ├───────────────────────────┤                 │
│  │ id                  │◄──────│ tenantCategory_id (FK)    │                 │
│  │ category_id (FK)    │       │ requirementId (text)      │                 │
│  │ tenant_id           │       │ reason                    │                 │
│  │ adoptedAt           │       │ exemptedBy                │                 │
│  │ adoptedBy           │       │ exemptedAt                │                 │
│  └─────────────────────┘       │ revokedAt                 │                 │
│                                │ revokedBy                 │                 │
│                                │ revocationReason          │                 │
│                                └───────────────────────────┘                 │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

*Design validated through collaborative brainstorming session, 2026-01-26*
*Implementation completed: 2026-01-28*
