# Compliance Stack vs. Regulatory Advisor

> Understanding the layered compliance architecture in EuroComply

**Last Updated:** 2026-01-27

---

## Executive Summary

EuroComply's compliance system has two distinct layers:

| Layer | Component | Purpose | Status |
|-------|-----------|---------|--------|
| **Data Layer** | Compliance Stack | "What regulations apply to this category?" | ✅ Implemented |
| **Evaluation Layer** | Regulatory Advisor | "Is this product compliant?" | 📋 Designed |

The **Compliance Stack** (built) determines which regulatory lists apply to a product category. The **Regulatory Advisor** (planned) uses that information to evaluate actual products and produce compliance findings.

---

## Part 1: Compliance Stack (Implemented)

### 1.1 What It Does

The Compliance Stack resolves which regulatory lists apply to a tenant's category, using a 3-layer inheritance model:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLIANCE STACK RESOLUTION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Layer 1: SYSTEM BASELINE (public schema)                                   │
│  ─────────────────────────────────────────                                   │
│  CategoryRegulatoryList links system categories to regulatory lists         │
│  Example: "cosmetics" category → COSING_ANNEX_II, REACH_SVHC               │
│                                                                              │
│  Layer 2: TENANT ADDITIONS (tenant schema)                                  │
│  ─────────────────────────────────────────                                   │
│  TenantCategoryRegulatoryList with source=TENANT_ADDED                      │
│  Example: Tenant adds stricter internal standard beyond EU requirements     │
│                                                                              │
│  Layer 3: TENANT EXEMPTIONS (tenant schema)                                 │
│  ─────────────────────────────────────────                                   │
│  TenantCategoryRegulatoryList with isExempted=true                          │
│  Example: Tenant exempts REACH for products sold outside EU                 │
│                                                                              │
│  OUTPUT: EffectiveRegulation[]                                              │
│  ─────────────────────────────────                                           │
│  [                                                                           │
│    { listId, code: "COSING_ANNEX_II", source: "SYSTEM", status: "ACTIVE" },│
│    { listId, code: "REACH_SVHC", source: "SYSTEM", status: "EXEMPTED" },   │
│    { listId, code: "INTERNAL_STD", source: "TENANT", status: "ACTIVE" },   │
│  ]                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Components

#### Entities (Database)

| Entity | Schema | Purpose |
|--------|--------|---------|
| `Category` | public | System taxonomy (managed by platform) |
| `RegulatoryList` | public | Regulation metadata (REACH, COSING, RoHS) |
| `RegulatoryListEntry` | public | Individual restricted substances with thresholds |
| `CategoryRegulatoryList` | public | Links system categories to regulatory lists |
| `TenantCategory` | tenant | Tenant's category (can adopt from system or custom) |
| `CategoryAdoption` | tenant | Links tenant to system category (LIVE/FROZEN/DETACHED) |
| `TenantCategoryRegulatoryList` | tenant | Tenant additions and exemptions |

#### Service

```typescript
// packages/database/src/services/ComplianceStackResolver.ts

class ComplianceStackResolver {
  /**
   * Resolves effective regulations for a tenant category.
   *
   * @param tenantCategoryId - The tenant category to resolve
   * @param options - Optional: pinnedRegulatoryListIds for FROZEN mode
   * @returns ComplianceStackResult with all effective regulations
   */
  async resolve(
    tenantCategoryId: string,
    options?: ResolveOptions
  ): Promise<ComplianceStackResult>;
}

interface ComplianceStackResult {
  tenantCategoryId: string;
  tenantCategoryPath: string;
  systemCategoryId?: string;
  linkMode?: string;  // LIVE | FROZEN | DETACHED
  effectiveRegulations: EffectiveRegulation[];
}

interface EffectiveRegulation {
  regulatoryListId: string;
  regulatoryListCode: string;
  source: 'SYSTEM' | 'TENANT';
  requirement: 'MANDATORY' | 'RECOMMENDED' | 'INFORMATIONAL';
  status: 'ACTIVE' | 'EXEMPTED';
  allowExemption: boolean;
  exemption?: {
    reason: string;
    legalRef?: string;
    exemptedBy: string;
    exemptedAt: Date;
  };
  overrideThreshold?: string;
}
```

#### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/tenant-categories/:id/regulatory-lists` | Get compliance stack for category |
| POST | `/tenant-categories/:id/regulatory-lists` | Add tenant-specific regulation |
| POST | `/tenant-categories/:id/regulatory-lists/:listId/exempt` | Create exemption |
| DELETE | `/tenant-categories/:id/regulatory-lists/:listId/exempt` | Remove exemption |
| DELETE | `/tenant-categories/:id/regulatory-lists/:listId` | Remove tenant-added regulation |

### 1.3 What It Does NOT Do

The Compliance Stack is purely about **metadata resolution**. It does NOT:

- ❌ Evaluate actual products
- ❌ Check substance concentrations against thresholds
- ❌ Produce compliance findings (PASS/FAIL/WARNING)
- ❌ Enforce soft gates or require acknowledgments
- ❌ Create audit trails for product compliance decisions
- ❌ Generate compliance reports or DPP snapshots

These are the responsibility of the **Regulatory Advisor** (see Part 2).

### 1.4 Link Modes Explained

When a tenant adopts a system category, they choose a link mode:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CATEGORY ADOPTION LINK MODES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LIVE (Default)                                                             │
│  ───────────────                                                             │
│  • Always uses current version of regulatory lists                          │
│  • Automatic updates when platform updates regulations                      │
│  • Best for: Most tenants who want latest compliance rules                  │
│                                                                              │
│  FROZEN                                                                      │
│  ────────                                                                    │
│  • Locks to specific regulatory list versions (pinnedRegulatoryListIds)    │
│  • No automatic updates - tenant controls when to update                    │
│  • Best for: Products mid-certification, legal audits, stability needs     │
│                                                                              │
│  DETACHED                                                                    │
│  ─────────                                                                   │
│  • No longer linked to system category                                      │
│  • Tenant manages all regulatory lists manually                             │
│  • One-way operation (cannot re-attach)                                     │
│  • Best for: Highly customized compliance requirements                      │
│                                                                              │
│  State Transitions:                                                          │
│  LIVE ──"freeze"──> FROZEN ──"detach"──> DETACHED                          │
│    ↑                   │                                                     │
│    └───"unfreeze"──────┘                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 2: Regulatory Advisor (Designed, Not Implemented)

### 2.1 What It Will Do

The Regulatory Advisor is the **evaluation engine** that checks actual products against compliance rules:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REGULATORY ADVISOR OVERVIEW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INPUT:                                                                      │
│  ──────                                                                      │
│  • Product (with category, materials, substances)                           │
│  • ReadinessProfile (collection of rules to evaluate)                       │
│                                                                              │
│  PROCESS:                                                                    │
│  ────────                                                                    │
│  1. Get product's TenantCategory                                            │
│  2. Resolve applicable regulatory lists (ComplianceStackResolver)           │
│  3. For each RuleTemplate in ReadinessProfile:                              │
│     a. Evaluate rule against product data                                   │
│     b. Check substances against RegulatoryListEntry thresholds              │
│     c. Generate finding with severity and traceability                      │
│  4. Apply enforcement mode (ENFORCING vs SILENT)                            │
│                                                                              │
│  OUTPUT:                                                                     │
│  ───────                                                                     │
│  • Findings[] with severity (BLOCKER, WARNING, INFO)                        │
│  • Soft gate status (requires acknowledgment?)                              │
│  • Compliance snapshot for DPP sealing                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Core Concepts

#### Rule Templates

Configurable compliance rules with validation logic:

```typescript
interface RuleTemplate {
  code: string;                    // "COSING_ANNEX_II_CHECK"
  name: string;                    // "CosIng Prohibited Substances"
  scope: 'SYSTEM' | 'MARKETPLACE' | 'ORGANIZATION';
  type: 'SUBSTANCE' | 'ATTRIBUTE' | 'PROCESS' | 'DOCUMENTATION';
  severity: 'BLOCKER' | 'WARNING' | 'INFO';

  // Config-driven validation (preferred)
  validationLogic: {
    type: 'regulatory_list_check';
    config: {
      listCodes: string[] | null;  // null = inherit from category
      checkType: 'PROHIBITED' | 'THRESHOLD' | 'RESTRICTED_WITH_CONDITIONS';
      scope: 'ARTICLE' | 'HOMOGENEOUS_MATERIAL';
      thresholdOverridePct?: string;
    };
  };

  // Legal anchoring
  regulationDocument?: RegulationDocument;
  anchorCoordinates?: { page: number; x: number; y: number; };
}
```

#### Readiness Profiles

Collections of rules for specific compliance targets:

```typescript
interface ReadinessProfile {
  code: string;                    // "EU_MARKET_COSMETICS_2025"
  name: string;                    // "EU Market Entry - Cosmetics"
  description: string;
  targetMarket?: string;           // "EU", "US", "GLOBAL"
  targetRegulations: string[];     // ["REACH", "COSING", "CLP"]
  rules: ReadinessProfileRule[];   // Rules with optional overrides
}

interface ReadinessProfileRule {
  rule: RuleTemplate;
  overrideMode?: 'ENFORCING' | 'SILENT' | 'DISABLED';
  severityOverride?: 'BLOCKER' | 'WARNING' | 'INFO';
}
```

#### Findings

Results of rule evaluation:

```typescript
interface Finding {
  rule: RuleTemplate;
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  status: 'PASS' | 'FAIL' | 'ACKNOWLEDGED';

  // For substance findings
  substance?: {
    casNumber: string;
    name: string;
    concentration: string;         // "0.05%"
    threshold: string;             // "0.1%"
    regulatoryList: string;        // "COSING_ANNEX_II"
    entryReference: string;        // "Entry 1577"
  };

  // Traceability
  traceability?: {
    materialName: string;          // "Preservative Blend"
    materialPercentage: string;    // "2%"
    substanceInMaterial: string;   // "2.5%"
  };

  // If acknowledged (deviation)
  deviation?: {
    reasonCode: string;
    narrative: string;
    acknowledgedBy: string;
    acknowledgedAt: Date;
  };
}
```

#### Enforcement Modes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ENFORCEMENT MODE BEHAVIOR                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SILENT (Default for new orgs)                                              │
│  ─────────────────────────────                                               │
│  • Rules evaluate, findings shown as "Advisory"                             │
│  • No blocking dialogs                                                      │
│  • User can proceed without acknowledgment                                  │
│  • Compliance data optionally captured in DPP                               │
│                                                                              │
│  ENFORCING                                                                   │
│  ──────────                                                                  │
│  • Full soft gate experience                                                │
│  • BLOCKER findings require acknowledgment + reason code                    │
│  • Cannot proceed until all blockers acknowledged                           │
│  • Full audit trail in DPP                                                  │
│                                                                              │
│  Per-Rule Override                                                           │
│  ─────────────────                                                           │
│  Individual rules can be set to ENFORCING, SILENT, or DISABLED             │
│  regardless of organization default.                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 PreFlight Evaluation Flow

The core evaluation process:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PREFLIGHT EVALUATION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: Gather Context                                                     │
│  ──────────────────────                                                      │
│  • Load Product with category, materials, substances                        │
│  • Load ReadinessProfile assigned to product                                │
│  • Check Organization.enforcementMode                                       │
│                                                                              │
│  STEP 2: Resolve Applicable Regulations                                     │
│  ──────────────────────────────────────                                      │
│  • Call ComplianceStackResolver.resolve(product.categoryId)                 │
│  • Get EffectiveRegulation[] (which lists apply, exemptions, etc.)         │
│                                                                              │
│  STEP 3: Roll Up Substances                                                 │
│  ─────────────────────────                                                   │
│  • For each material in product:                                            │
│    - Get declared substances with concentrations                            │
│    - Calculate rolled-up concentration in final product                     │
│    - Example: Material is 2% of product, substance is 2.5% of material     │
│               → Substance is 0.05% of final product                        │
│                                                                              │
│  STEP 4: Evaluate Rules                                                     │
│  ──────────────────────                                                      │
│  For each RuleTemplate in ReadinessProfile:                                 │
│    a. Skip if rule.overrideMode = DISABLED                                  │
│    b. If rule.validationLogic.type = 'regulatory_list_check':              │
│       - Get applicable lists from Step 2 (or explicit listCodes)           │
│       - Query RegulatoryListEntry for restricted substances                 │
│       - Cross-reference with rolled-up substances from Step 3              │
│       - Generate findings for any violations                                │
│    c. If rule.validationLogic.type = 'attribute_check':                    │
│       - Evaluate attribute against rule criteria                            │
│       - Generate finding if criteria not met                                │
│                                                                              │
│  STEP 5: Apply Enforcement                                                  │
│  ─────────────────────────                                                   │
│  • Determine effective mode (org default vs rule override)                  │
│  • If ENFORCING + BLOCKER findings:                                         │
│    - Return soft gate requiring acknowledgment                              │
│  • If SILENT:                                                               │
│    - Return findings as advisory only                                       │
│                                                                              │
│  STEP 6: Return Results                                                     │
│  ──────────────────────                                                      │
│  {                                                                           │
│    findings: Finding[],                                                     │
│    requiresAcknowledgment: boolean,                                         │
│    blockerCount: number,                                                    │
│    warningCount: number,                                                    │
│    complianceSnapshot: {...}  // For DPP sealing                           │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: How They Fit Together

### 3.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COMPLIANCE ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    REGULATORY ADVISOR (Evaluation Layer)             │   │
│  │                         [NOT YET IMPLEMENTED]                        │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │   PreFlightService                                                   │   │
│  │   ├── RuleEvaluator                                                 │   │
│  │   │   ├── SubstanceRuleEvaluator                                   │   │
│  │   │   ├── AttributeRuleEvaluator                                   │   │
│  │   │   └── ProcessRuleEvaluator                                     │   │
│  │   ├── SubstanceRollupService                                        │   │
│  │   ├── FindingGenerator                                              │   │
│  │   └── SoftGateManager                                               │   │
│  │                                                                      │   │
│  │   Entities: RuleTemplate, ReadinessProfile, ReasonCode, Finding     │   │
│  │                                                                      │   │
│  └────────────────────────────┬────────────────────────────────────────┘   │
│                               │                                             │
│                               │ uses                                        │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    COMPLIANCE STACK (Data Layer)                     │   │
│  │                         [IMPLEMENTED ✅]                             │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │   ComplianceStackResolver                                           │   │
│  │   └── resolve(tenantCategoryId) → EffectiveRegulation[]            │   │
│  │                                                                      │   │
│  │   Entities:                                                          │   │
│  │   ├── Category (public)                                             │   │
│  │   ├── RegulatoryList (public)                                       │   │
│  │   ├── RegulatoryListEntry (public)                                  │   │
│  │   ├── CategoryRegulatoryList (public)                               │   │
│  │   ├── TenantCategory (tenant)                                       │   │
│  │   ├── CategoryAdoption (tenant)                                     │   │
│  │   └── TenantCategoryRegulatoryList (tenant)                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow Example

Let's trace a complete compliance check for a cosmetic product:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXAMPLE: Checking "Hydrating Day Cream" for EU Market Compliance           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRODUCT DATA:                                                              │
│  ─────────────                                                               │
│  Name: Hydrating Day Cream                                                  │
│  Category: products.cosmetics.skincare (TenantCategory)                     │
│  Materials:                                                                 │
│    - Preservative Blend (2% of product)                                    │
│      └── Formaldehyde (CAS: 50-00-0) - 2.5% of material                   │
│      └── Ethanol (CAS: 64-17-5) - 97.5% of material                       │
│  ReadinessProfile: "EU Market Entry - Cosmetics"                           │
│                                                                              │
│  STEP 1: ComplianceStackResolver.resolve("products.cosmetics.skincare")    │
│  ───────────────────────────────────────────────────────────────────────    │
│  Result:                                                                    │
│    effectiveRegulations: [                                                  │
│      { code: "COSING_ANNEX_II", source: "SYSTEM", status: "ACTIVE" },     │
│      { code: "COSING_ANNEX_III", source: "SYSTEM", status: "ACTIVE" },    │
│      { code: "REACH_SVHC", source: "SYSTEM", status: "ACTIVE" },          │
│    ]                                                                        │
│                                                                              │
│  STEP 2: SubstanceRollupService.rollup(product)                            │
│  ───────────────────────────────────────────────                            │
│  Result:                                                                    │
│    rolledUpSubstances: [                                                   │
│      { cas: "50-00-0", name: "Formaldehyde", concentration: 0.0005 },     │
│      { cas: "64-17-5", name: "Ethanol", concentration: 0.0195 },          │
│    ]                                                                        │
│  (Formaldehyde: 2% × 2.5% = 0.05% = 0.0005)                               │
│                                                                              │
│  STEP 3: RuleEvaluator evaluates "COSING_ANNEX_II_CHECK" rule              │
│  ─────────────────────────────────────────────────────────────              │
│  Query: SELECT * FROM regulatory_list_entry                                │
│         WHERE list_code = 'COSING_ANNEX_II'                                │
│           AND cas_number IN ('50-00-0', '64-17-5')                         │
│                                                                              │
│  Found: Entry 1577 - Formaldehyde is PROHIBITED in cosmetics               │
│                                                                              │
│  STEP 4: FindingGenerator creates finding                                   │
│  ─────────────────────────────────────────                                   │
│  {                                                                           │
│    rule: "COSING_ANNEX_II_CHECK",                                          │
│    severity: "BLOCKER",                                                    │
│    status: "FAIL",                                                         │
│    message: "Prohibited substance found: Formaldehyde",                    │
│    substance: {                                                            │
│      casNumber: "50-00-0",                                                 │
│      name: "Formaldehyde",                                                 │
│      concentration: "0.05%",                                               │
│      regulatoryList: "COSING_ANNEX_II",                                   │
│      entryReference: "Entry 1577",                                         │
│    },                                                                       │
│    traceability: {                                                         │
│      materialName: "Preservative Blend",                                   │
│      materialPercentage: "2%",                                             │
│      substanceInMaterial: "2.5%",                                          │
│    },                                                                       │
│  }                                                                           │
│                                                                              │
│  STEP 5: SoftGateManager checks enforcement                                 │
│  ──────────────────────────────────────────                                  │
│  Organization.enforcementMode = ENFORCING                                   │
│  → User must acknowledge with reason code before proceeding                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Implementation Status

### 4.1 What's Built (Compliance Stack)

| Component | Location | Status |
|-----------|----------|--------|
| `Category` entity | `packages/database/src/entities/Category.ts` | ✅ |
| `TenantCategory` entity | `packages/database/src/entities/TenantCategory.ts` | ✅ |
| `CategoryAdoption` entity | `packages/database/src/entities/CategoryAdoption.ts` | ✅ |
| `RegulatoryList` entity | `packages/database/src/entities/RegulatoryList.ts` | ✅ |
| `RegulatoryListEntry` entity | `packages/database/src/entities/RegulatoryListEntry.ts` | ✅ |
| `CategoryRegulatoryList` entity | `packages/database/src/entities/CategoryRegulatoryList.ts` | ✅ |
| `TenantCategoryRegulatoryList` entity | `packages/database/src/entities/TenantCategoryRegulatoryList.ts` | ✅ |
| `ComplianceStackResolver` service | `packages/database/src/services/ComplianceStackResolver.ts` | ✅ |
| Tenant regulatory lists API | `apps/api/src/routes/tenant-category-regulatory-lists.ts` | ✅ |
| Category adoption API | `apps/api/src/routes/category-adoption.ts` | ✅ |
| FROZEN mode support | `ComplianceStackResolver` + `CategoryAdoption` | ✅ |
| Exemption workflow | `TenantCategoryRegulatoryList.isExempted` | ✅ |
| Admin regulatory list API | `apps/api/src/routes/admin/regulatory-lists.ts` | ✅ |

### 4.2 What's Designed But Not Built (Regulatory Advisor)

| Component | Design Doc | Priority |
|-----------|------------|----------|
| `RuleTemplate` entity | `docs/plans/13-regulatory-advisor.md` §4.4 | High |
| `ReadinessProfile` entity | `docs/plans/13-regulatory-advisor.md` §4.3 | High |
| `ReasonCode` entity | `docs/plans/13-regulatory-advisor.md` §4.6 | High |
| `RegulationDocument` entity | `docs/plans/13-regulatory-advisor.md` §4.1 | Medium |
| `RegulationAnchor` entity | `docs/plans/13-regulatory-advisor.md` §4.2 | Medium |
| `PreFlightService` | `docs/plans/13-regulatory-advisor.md` §7 | High |
| `SubstanceRollupService` | `docs/plans/2026-01-26-taxonomy-08-substance-rollup.md` | High |
| `RuleEvaluator` | `docs/plans/13-regulatory-advisor.md` §7 | High |
| `SoftGateManager` | `docs/plans/13-regulatory-advisor.md` §3 | Medium |
| Deviation workflow API | `docs/plans/13-regulatory-advisor.md` §8 | Medium |
| Compliance snapshot for DPP | `docs/plans/13-regulatory-advisor.md` §9 | Medium |
| Template marketplace | `docs/plans/13-regulatory-advisor.md` §2 | Low |

### 4.3 Database Schema Status

**Public Schema (Implemented):**
```sql
-- Regulatory data (shared by all tenants)
regulatory_list (id, code, name, version, ...)
regulatory_list_entry (id, list_id, cas_number, substance_name, restriction_type, threshold, ...)
category (id, name, path, ...)
category_regulatory_list (category_id, regulatory_list_id, requirement, allow_tenant_exemption, ...)
```

**Tenant Schema (Implemented):**
```sql
-- Tenant-specific compliance configuration
tenant_category (id, name, path, system_category_id, link_mode, ...)
category_adoption (id, system_category_id, local_category_id, mode, pinned_regulatory_list_ids, ...)
tenant_category_regulatory_list (tenant_category_id, regulatory_list_id, source, is_exempted, exemption_reason, ...)
```

**Not Yet Implemented:**
```sql
-- Public schema (Regulatory Advisor)
rule_template (id, code, name, scope, type, severity, validation_logic, ...)
reason_code (id, code, name, scope, ...)
regulation_document (id, name, file_key, ...)
regulation_anchor (id, document_id, page, coordinates, ...)

-- Tenant schema (Regulatory Advisor)
readiness_profile (id, code, name, ...)
readiness_profile_rule (profile_id, rule_id, override_mode, ...)
finding (id, product_version_id, rule_id, severity, status, ...)
deviation (id, finding_id, reason_code_id, narrative, acknowledged_by, ...)
```

---

## Part 5: Implementation Roadmap

### Phase 1: Substance Rollup (Foundation)

**Goal:** Calculate substance concentrations in final products

```
Product → Materials → Substances → Rolled-up concentrations
```

**Key Deliverables:**
- [ ] `MaterialSubstance` entity (link materials to substances with concentration)
- [ ] `SubstanceRollupService` with weighted calculation
- [ ] Unit conversion for concentration (ppm, %, mg/kg)
- [ ] API: `GET /products/:id/substances` (rolled-up view)

### Phase 2: Rule Evaluation Engine

**Goal:** Evaluate products against configurable rules

**Key Deliverables:**
- [ ] `RuleTemplate` entity with validation logic schema
- [ ] `RuleEvaluator` service with pluggable evaluators
- [ ] `SubstanceRuleEvaluator` (checks against RegulatoryListEntry)
- [ ] `Finding` entity to store evaluation results
- [ ] API: `POST /products/:id/preflight` (run evaluation)

### Phase 3: Readiness Profiles

**Goal:** Group rules into compliance targets

**Key Deliverables:**
- [ ] `ReadinessProfile` entity
- [ ] `ReadinessProfileRule` junction with overrides
- [ ] Profile assignment to products
- [ ] API: CRUD for readiness profiles

### Phase 4: Soft Gates & Deviations

**Goal:** Enforcement mode with acknowledgment workflow

**Key Deliverables:**
- [ ] `ReasonCode` entity (predefined justifications)
- [ ] `Deviation` entity (acknowledgment record)
- [ ] `SoftGateManager` service
- [ ] API: `POST /findings/:id/acknowledge`

### Phase 5: Compliance Snapshots

**Goal:** Seal compliance state into DPP

**Key Deliverables:**
- [ ] Snapshot generation at version publish
- [ ] Immutable storage of findings + deviations
- [ ] Integration with DPP minting

---

## Appendix A: API Reference

### Compliance Stack APIs (Implemented)

```
# Get compliance stack for a tenant category
GET /api/tenant-categories/:id/regulatory-lists
Response: {
  tenantCategoryId: string,
  effectiveRegulations: EffectiveRegulation[]
}

# Add tenant-specific regulation
POST /api/tenant-categories/:id/regulatory-lists
Body: { regulatoryListId: string, requirement: string }

# Create exemption
POST /api/tenant-categories/:id/regulatory-lists/:listId/exempt
Body: { reason: string, legalRef?: string }

# Remove exemption
DELETE /api/tenant-categories/:id/regulatory-lists/:listId/exempt

# Remove tenant-added regulation
DELETE /api/tenant-categories/:id/regulatory-lists/:listId
```

### Regulatory Advisor APIs (Planned)

```
# Run PreFlight evaluation
POST /api/products/:id/preflight
Response: {
  findings: Finding[],
  requiresAcknowledgment: boolean,
  summary: { blockers: number, warnings: number, info: number }
}

# Acknowledge deviation
POST /api/findings/:id/acknowledge
Body: { reasonCode: string, narrative: string }

# Get readiness profiles
GET /api/readiness-profiles

# Assign profile to product
PUT /api/products/:id/readiness-profile
Body: { profileId: string }
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Compliance Stack** | The 3-layer system that resolves which regulations apply to a category |
| **Regulatory Advisor** | The evaluation engine that checks products against rules |
| **PreFlight** | The evaluation process run before publishing a product version |
| **EffectiveRegulation** | A regulatory list that applies to a category after resolution |
| **RuleTemplate** | A configurable compliance rule with validation logic |
| **ReadinessProfile** | A collection of rules for a specific compliance target |
| **Finding** | The result of evaluating a rule against a product |
| **Deviation** | An acknowledged finding where user proceeds despite violation |
| **Soft Gate** | A checkpoint that requires acknowledgment but doesn't hard-block |
| **Link Mode** | How a tenant category relates to system (LIVE/FROZEN/DETACHED) |

---

## Related Documentation

- [Regulatory Advisor & Template Engine](../plans/13-regulatory-advisor.md) - Full design spec
- [Unified Taxonomy & Compliance Stack Design](../plans/2026-01-27-unified-taxonomy-compliance-stack-design.md) - Original design
- [Regulatory Vertical System Explained](./regulatory-vertical-system-explained.md) - Beginner guide
- [Substance Rollup Service](../plans/2026-01-26-taxonomy-08-substance-rollup.md) - Substance calculation design

---

*Document Version: 1.0*
*Last Updated: 2026-01-27*
