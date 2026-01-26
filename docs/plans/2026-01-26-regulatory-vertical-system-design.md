# Regulatory Vertical System - Design Document

> **For Claude:** This is a DESIGN document. Use superpowers:writing-plans to create implementation plans 10-15.

**Goal:** Replace hardcoded regulatory data with a data-driven vertical system that supports admin-managed imports, temporal versioning, and category-aware compliance evaluation.

**Architecture:** Public schema holds versioned RegulatoryLists with substance entries. Categories link to applicable lists via LTREE inheritance. PreFlight evaluation dynamically resolves which lists apply based on product category, then cross-references rolled-up substances against list entries.

**Key Decisions:**
- **Agnostic evaluation model**: Operator + compareValue + issueType + severity stored in database, not code
- Admin-managed CSV/JSON import (not live API sync)
- Immutable list versions for forensic compliance
- ARTICLE vs HOMOGENEOUS_MATERIAL evaluation scope
- Denormalized snapshots prevent substance drift
- All violations returned at once (no whack-a-mole)

---

## 1. Core Entities

### 1.1 RegulatoryList (Public Schema)

```typescript
@Entity({ tableName: 'regulatory_list', schema: 'public' })
@Unique({ properties: ['code', 'version'] })
export class RegulatoryList extends BaseEntity {

  @Property()
  code!: string;  // 'COSING_ANNEX_II' - stable identifier

  @Property()
  name!: string;  // 'CosIng Annex II - Prohibited Substances'

  @Property()
  source!: string;  // 'EU_COSING', 'ECHA', 'EU_RMIS'

  @Property()
  version!: string;  // '2024-06', '2026-01'

  @Property()
  effectiveDate!: Date;  // When this version became law

  @Property({ nullable: true })
  supersededDate?: Date;  // When next version replaced it

  @Property({ type: 'boolean', default: true })
  isCurrentVersion!: boolean;  // Fast lookup for latest

  @Property({ nullable: true })
  sourceUrl?: string;  // Deep link to official EU source

  @ManyToOne(() => RegulatoryList, { nullable: true })
  previousVersion?: RegulatoryList;  // Chain for history traversal

  @OneToMany(() => RegulatoryListEntry, e => e.list)
  entries = new Collection<RegulatoryListEntry>(this);
}
```

### 1.2 RegulatoryListEntry (Public Schema)

**AGNOSTIC EVALUATION MODEL:** The entry itself defines the comparison logic via `operator` + `compareValue`.
No hardcoded rule types - new regulations can be imported without code changes.

```typescript
@Entity({ tableName: 'regulatory_list_entry', schema: 'public' })
@Unique({ properties: ['list', 'substance'] })
export class RegulatoryListEntry extends BaseEntity {

  @ManyToOne(() => RegulatoryList)
  list!: RegulatoryList;

  // Live reference (for joins)
  @ManyToOne(() => Substance)
  substance!: Substance;

  // Forensic snapshots (immutable at import time)
  @Property({ name: 'cas_number_snapshot' })
  casNumberSnapshot!: string;

  @Property({ name: 'substance_name_snapshot' })
  substanceNameSnapshot!: string;

  // ─────────────────────────────────────────────────────────────
  // AGNOSTIC EVALUATION FIELDS (replaces hardcoded RestrictionType)
  // ─────────────────────────────────────────────────────────────

  @Enum(() => ComparisonOperator)
  operator!: ComparisonOperator;  // How to compare concentration

  @Property({ type: 'decimal', precision: 7, scale: 4, nullable: true, name: 'compare_value' })
  compareValue?: string;  // Threshold for comparison (null for PRESENT/ABSENT)

  @Property({ type: 'text', name: 'issue_type' })
  issueType!: string;  // e.g., 'PROHIBITED_SUBSTANCE', 'CHEMICAL_LIMIT_EXCEEDED'

  @Enum(() => Severity)
  severity!: Severity;  // BLOCKER, WARNING, INFO

  @Property({ type: 'decimal', precision: 7, scale: 4, nullable: true, name: 'stoichiometric_factor' })
  stoichiometricFactor?: string;  // For element-based regulations (e.g., Cobalt from Cobalt Sulfate)

  // ─────────────────────────────────────────────────────────────

  @Property({ type: 'jsonb', nullable: true })
  conditions?: Record<string, string>;  // { application_area: 'spray products' }

  @Property({ nullable: true })
  legalReference?: string;  // 'Entry 1577'

  @Property({ nullable: true })
  notes?: string;
}

// Agnostic comparison operators
enum ComparisonOperator {
  GT = 'GT',           // concentration > compareValue
  GTE = 'GTE',         // concentration >= compareValue
  LT = 'LT',           // concentration < compareValue
  LTE = 'LTE',         // concentration <= compareValue
  EQ = 'EQ',           // concentration == compareValue
  PRESENT = 'PRESENT', // concentration > 0 (any presence is violation)
  ABSENT = 'ABSENT',   // concentration must be 0 (must be absent)
}

enum Severity {
  BLOCKER = 'BLOCKER',
  WARNING = 'WARNING',
  INFO = 'INFO',
}
```

### 1.3 CategoryRegulatoryList (Public Schema)

```typescript
@Entity({ tableName: 'category_regulatory_list', schema: 'public' })
@Unique({ properties: ['category', 'regulatoryList'] })
@Index({ properties: ['category', 'regulatoryList'] })
export class CategoryRegulatoryList extends BaseEntity {

  @ManyToOne(() => Category)
  category!: Category;  // The LTREE node

  @ManyToOne(() => RegulatoryList)
  regulatoryList!: RegulatoryList;

  @Enum(() => ListRequirement)
  requirement!: ListRequirement;  // PROHIBITION | RESTRICTION | DECLARATION

  // Override handling
  @Property({ type: 'smallint', default: 0 })
  priority!: number;  // Higher = takes precedence at same depth

  @Property({ type: 'boolean', default: false })
  isExclusion!: boolean;  // True = exempt this category from parent's list

  @Property({ type: 'decimal', precision: 5, scale: 4, nullable: true, name: 'compare_value_override' })
  compareValueOverride?: string;  // Category-specific stricter compareValue (e.g., toys)
}

enum ListRequirement {
  PROHIBITION = 'PROHIBITION',    // Substances banned entirely
  RESTRICTION = 'RESTRICTION',    // Allowed with conditions/thresholds
  DECLARATION = 'DECLARATION',    // Must disclose if present
}
```

### 1.4 RegulatoryImportLog (Public Schema)

```typescript
@Entity({ tableName: 'regulatory_import_log', schema: 'public' })
export class RegulatoryImportLog extends BaseEntity {

  @Property()
  listCode!: string;

  @Property()
  version!: string;

  @Property()
  adminId!: string;

  @Property({ type: 'jsonb' })
  changes!: {
    entriesAdded: number;
    entriesRemoved: number;
    entriesUpdated: number;
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

### 2.1 New Rule Types

```typescript
// Existing types (unchanged)
type: 'required' | 'pattern' | 'range' | 'custom'  // For ATTRIBUTE rules

// New types (for SUBSTANCE rules)
type: 'regulatory_list_check' | 'aggregate_metric_threshold'
```

### 2.2 regulatory_list_check Config

**AGNOSTIC:** The config specifies WHICH lists to check and HOW to scope evaluation.
The actual comparison logic (operator, compareValue, issueType, severity) comes from RegulatoryListEntry.

```typescript
{
  type: 'regulatory_list_check',
  config: {
    // Explicit list codes OR null = inherit from CategoryRegulatoryList
    listCodes: ['COSING_ANNEX_II', 'COSING_ANNEX_III'] | null,

    // Evaluation scope (REACH vs RoHS difference)
    scope: 'ARTICLE' | 'HOMOGENEOUS_MATERIAL',

    // Override list entry compareValue (null = use RegulatoryListEntry.compareValue)
    // Used for category-specific stricter thresholds (e.g., toys)
    compareValueOverride: null,

    // For conditional restrictions (checks entry.conditions JSONB)
    conditionKey: 'application_area'
  }
}
```

Note: No `checkType` field - the evaluation is agnostic. Each RegulatoryListEntry defines its own
operator/compareValue/issueType/severity. This allows new rule types without code changes.

### 2.3 aggregate_metric_threshold Config

```typescript
{
  type: 'aggregate_metric_threshold',
  config: {
    metric: 'weightedSupplyRisk' | 'totalStrategicContentPct',
    operator: 'GREATER_THAN' | 'LESS_THAN',
    threshold: 4.0,
    message: 'Supply chain vulnerability exceeds platform limits.'
  }
}
```

---

## 3. Category-List Scoping

### 3.1 LTREE Inheritance Query

```sql
-- Get all regulatory lists for a moisturizer product
SELECT
  rl.*,
  crl.requirement,
  crl.compare_value_override,
  c.path as matched_at,
  nlevel(c.path) as depth
FROM public.regulatory_list rl
JOIN public.category_regulatory_list crl ON rl.id = crl.regulatory_list_id
JOIN public.category c ON c.id = crl.category_id
WHERE c.path @> 'products.cosmetics.skincare.moisturizers'::ltree
  AND rl.is_current_version = true
ORDER BY nlevel(c.path) DESC, crl.priority DESC;
```

### 3.2 Exclusion Handling Query

```sql
WITH candidate_lists AS (
  SELECT
    rl.*,
    crl.requirement,
    crl.is_exclusion,
    crl.compare_value_override,
    crl.priority,
    c.path as matched_at,
    nlevel(c.path) as depth
  FROM public.regulatory_list rl
  JOIN public.category_regulatory_list crl ON rl.id = crl.regulatory_list_id
  JOIN public.category c ON c.id = crl.category_id
  WHERE c.path @> 'products.toys.electronic'::ltree
    AND rl.is_current_version = true
)
SELECT * FROM candidate_lists cl
WHERE NOT EXISTS (
  -- Exclude if a more specific node excludes this list
  SELECT 1 FROM candidate_lists excl
  WHERE excl.id = cl.id
    AND excl.is_exclusion = true
    AND excl.depth > cl.depth
)
ORDER BY depth DESC, priority DESC;
```

### 3.3 Concurrent Jurisdiction Example

```
products                         → REACH_SVHC (all products)
products.electronics             → ROHS_RESTRICTED (electronics only)
products.cosmetics               → COSING_ANNEX_II, COSING_ANNEX_III
products.cosmetics.skincare      → (inherits from parent)
products.food_contact            → EFSA_MIGRATION_LIMITS
```

A smart electronic skincare device matches all three regulatory frameworks.

---

## 4. Finding Data Contract

### 4.1 SubstanceFinding

```typescript
interface SubstanceFinding extends AuditFinding {
  // Issue classification - from RegulatoryListEntry.issueType (agnostic string)
  // Common values: 'PROHIBITED_SUBSTANCE', 'CHEMICAL_LIMIT_EXCEEDED', 'RESTRICTED_CONDITIONS'
  // New issueTypes can be added via admin import without code changes
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
    appliedList: {
      code: string;
      name: string;
      version: string;
      sourceUrl: string;
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
  profileUsed: ReadinessProfile;
  evaluatedAt: Date;

  findings: AuditFinding[];

  summary: {
    total: number;
    passed: number;
    failed: number;
    blockers: number;
    warnings: number;

    byIssueType: Record<IssueType, number>;

    byRegulatoryList: Record<string, {
      listCode: string;
      listName: string;
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

**AGNOSTIC:** Import files define the full evaluation logic per entry.
No hardcoded rule types - admins can import new regulations without code changes.

```typescript
interface RegulatoryListImport {
  code: string;
  name: string;
  source: string;
  version: string;
  effectiveDate: string;
  sourceUrl: string;
  entries: RegulatoryListEntryImport[];
}

interface RegulatoryListEntryImport {
  casNumber: string;
  ecNumber?: string;

  // AGNOSTIC EVALUATION FIELDS
  operator: 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ' | 'PRESENT' | 'ABSENT';
  compareValue?: string;  // Required for GT/GTE/LT/LTE/EQ, null for PRESENT/ABSENT
  issueType: string;      // e.g., 'PROHIBITED_SUBSTANCE', 'CHEMICAL_LIMIT_EXCEEDED'
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  stoichiometricFactor?: string;  // For element-based regulations

  conditions?: Record<string, string>;
  legalReference?: string;
  notes?: string;
}
```

### 5.3 Versioning Strategy

- **Immutable versions**: Never overwrite old list data
- **Version chain**: `previousVersion` links for history traversal
- **Point-in-time queries**: Products evaluated against list version effective at manufacture date
- **Soft delete avoided**: Old entries remain in old version, simply not copied to new version

### 5.4 Unmatched CAS Handling

**Warn & Skip**: Entry ignored, warning shown, admin can add substance manually.

Dashboard shows "X entries pending substance mapping."

---

## 6. Evaluation Flow

### 6.1 PreFlight Integration

```
Product Category (LTREE)
    ↓
CategoryRegulatoryList (scope resolution)
    ↓
Applicable RegulatoryLists
    ↓
RuleTemplates (from ReadinessProfile)
    ↓
Filter rules referencing these lists OR listCodes = null
    ↓
SubstanceRollupService + RawMaterialRollupService
    ↓
Cross-reference substances against list entries
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

This design should be split into focused implementation plans:

| Plan | Focus | Dependencies |
|------|-------|--------------|
| **10** | Regulatory List Registry | Plan 4 (Substance) |
| **11** | Category-List Scoping | Plans 5, 10 |
| **12** | Admin Import Pipeline | Plan 10 |
| **14** | Vertical Rule Evaluation | Plans 8, 9, 10, 11 |
| **15** | Regulatory Seeders | Plans 10, 11 |

*(Plan 13 is existing Regulatory Advisor)*

---

## 8. Index Requirements

```sql
-- GIST index for LTREE (from Plan 5)
CREATE INDEX idx_category_path_gist ON public.category USING GIST (path);

-- Composite index for join performance
CREATE INDEX idx_cat_reg_list_composite
  ON public.category_regulatory_list (category_id, regulatory_list_id);

-- Fast current version lookup
CREATE INDEX idx_reg_list_current
  ON public.regulatory_list (code) WHERE is_current_version = true;

-- Entry lookups by list
CREATE INDEX idx_reg_list_entry_list
  ON public.regulatory_list_entry (list_id);
```

---

*Design validated through collaborative brainstorming session, 2026-01-26*
