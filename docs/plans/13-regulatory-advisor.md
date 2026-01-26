# Regulatory Advisor & Template Engine

**Status:** Active
**Last Updated:** 2026-01-26

---

## 1. Overview

The Regulatory Advisor transforms EuroComply from a "Compliance Gatekeeper" (enforcement) to a "Regulatory Advisor" (expert guidance). Instead of rigidly enforcing rules, the platform provides regulation templates that users can follow, customize, or extend while maintaining a complete audit trail of their decisions.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Advisor over Enforcer** | Soft gates with acknowledgment, not hard blocks |
| **Legal Anchoring** | Every rule links to highlighted text in official regulation PDFs |
| **Template Hierarchy** | System → Marketplace → Organization (Live Link with overrides) |
| **Professional Judgment** | Users can deviate with documented reason codes |
| **Forensic Audit Trail** | All decisions permanently sealed into DPP snapshots |

### Ownership

| Owns | Description |
|------|-------------|
| Regulation Documents | Official PDF regulations stored in R2 |
| Regulation Anchors | Highlighted coordinates linking rules to law text |
| Rule Templates | Configurable compliance rules with severity levels |
| Readiness Profiles | Collections of rules for specific compliance targets |
| Reason Codes | Predefined justifications for rule deviations |
| Template Marketplace | Shared templates from partners and industry groups |

---

## 2. Template Ownership Model (Hybrid Marketplace)

### Three-Tier Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TEMPLATE OWNERSHIP HIERARCHY                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TIER 1: SYSTEM TEMPLATES (EuroComply Managed)                              │
│  ─────────────────────────────────────────────                               │
│  • organization = NULL                                                       │
│  • Visible to ALL tenants                                                    │
│  • Updated by EuroComply when regulations change                            │
│  • Examples: "ESPR Apparel 2025", "EU Battery Regulation 2023"              │
│                                                                              │
│  TIER 2: MARKETPLACE TEMPLATES (Partner/Industry Group)                     │
│  ──────────────────────────────────────────────────────                      │
│  • Published by verified organizations                                       │
│  • Opt-in adoption by tenants                                               │
│  • Examples: "Sustainable Textile Coalition Standard v2.1"                  │
│  • Revenue opportunity: certified templates for fee                         │
│                                                                              │
│  TIER 3: ORGANIZATION TEMPLATES (Tenant-Owned)                              │
│  ─────────────────────────────────────────────                               │
│  • Private to single organization                                           │
│  • Can inherit from System/Marketplace and add overrides                    │
│  • Examples: "Acme Corp Internal Sustainability Standard"                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Visibility Rules

| Template Scope | organization | Who Sees It |
|----------------|--------------|-------------|
| SYSTEM | NULL | All tenants |
| MARKETPLACE | Publisher Org | Tenants who opted in |
| ORGANIZATION | Tenant Org | Only that tenant |

---

## 3. Feature Toggles (Organization Settings)

The Regulatory Advisor is **fully optional** per organization. This ensures flexibility for customers who may not need compliance tracking or prefer a gradual adoption.

### Configuration Model

```typescript
// Added to Organization entity
interface OrganizationComplianceSettings {
  // Master toggle - hides entire Regulatory Advisor UI when false
  regulatoryAdvisorEnabled: boolean;

  // When enabled, controls enforcement behavior
  // ENFORCING = soft gates require acknowledgment
  // SILENT = rules evaluate but no gates, purely informational
  enforcementMode: 'ENFORCING' | 'SILENT';

  // When in SILENT mode, still capture compliance data in DPP snapshots?
  captureComplianceInSilentMode: boolean;
}
```

### Default Values (Opt-In Gentle)

| Setting | Default | Rationale |
|---------|---------|-----------|
| `regulatoryAdvisorEnabled` | `true` | Feature visible by default - users discover value naturally |
| `enforcementMode` | `SILENT` | Non-blocking on day one - no friction for new users |
| `captureComplianceInSilentMode` | `true` | Data captured for future use if they switch to enforcing |

### Behavior Matrix

| `enabled` | `enforcementMode` | `captureInSilent` | Result |
|-----------|-------------------|-------------------|--------|
| `false` | — | — | Advisor completely hidden. No PreFlight runs. No compliance UI in any workspace. DPP snapshots have no `complianceSnapshot`. |
| `true` | `SILENT` | `false` | Advisor visible. PreFlight evaluates. Findings shown as info only. No acknowledgment required. No compliance data in DPP. |
| `true` | `SILENT` | `true` | Advisor visible. PreFlight evaluates. Findings shown as info only. No acknowledgment required. Compliance data captured in DPP for auditors. |
| `true` | `ENFORCING` | — | Full experience. Soft gates require acknowledgment before proceeding. All compliance data captured. |

### UI Behavior by Mode

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FEATURE TOGGLE IMPACT ON UI                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HIDDEN (regulatoryAdvisorEnabled = false)                                  │
│  ═════════════════════════════════════════                                   │
│  • No "Compliance" tab in Design Workspace                                  │
│  • No "Readiness Profile" selector on products                              │
│  • No PreFlight validation on version release                               │
│  • No soft gates on batch release                                           │
│  • DPP Forensic Seal shows only supply chain, no compliance section         │
│  • Marketplace templates hidden                                             │
│                                                                              │
│  SILENT (enabled + enforcementMode = SILENT)                                │
│  ═══════════════════════════════════════════                                 │
│  • "Compliance" tab visible with informational findings                     │
│  • PreFlight runs but shows results as "Advisory" (blue info icons)         │
│  • No blocking dialogs - user can proceed without acknowledgment            │
│  • Dashboard shows compliance status as FYI only                            │
│  • If captureComplianceInSilentMode = true:                                 │
│    └── DPP Forensic Seal includes compliance section (status: ADVISORY)    │
│                                                                              │
│  ENFORCING (enabled + enforcementMode = ENFORCING)                          │
│  ═════════════════════════════════════════════════                           │
│  • Full soft gate experience with acknowledgment workflow                   │
│  • Blockers require reason code + narrative before proceeding               │
│  • Dashboard shows compliance status prominently                            │
│  • DPP Forensic Seal includes full compliance audit trail                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Settings Access

Only **Organization Admins** can change these settings. The toggle is found at:

```
Settings → Organization → Compliance → Regulatory Advisor
```

### Per-Rule Granularity

Beyond organization-wide settings, each rule within a Readiness Profile can be individually configured. This allows fine-grained control for complex compliance scenarios.

**Override Model:**

```typescript
// On ReadinessProfileRule (junction table)
export enum RuleOverrideMode {
  ENFORCING = 'ENFORCING',   // Full soft gate
  SILENT = 'SILENT',         // Advisory only
  DISABLED = 'DISABLED',     // Skip entirely
}

interface ReadinessProfileRule {
  profile: ReadinessProfile;
  rule: RuleTemplate;
  overrideMode?: RuleOverrideMode;  // null = inherit from Organization
  severityOverride?: RuleSeverity;
  // Audit trail
  overrideSetBy?: User;
  overrideSetAt?: Date;
  overrideReason?: string;
}
```

**Resolution Hierarchy:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RULE MODE RESOLUTION                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. ReadinessProfileRule.overrideMode (if set)                              │
│     └── ENFORCING, SILENT, or DISABLED                                      │
│                                                                              │
│  2. ELSE Organization.enforcementMode                                        │
│     └── Applies to all rules without explicit override                       │
│                                                                              │
│  3. ELSE skip (if regulatoryAdvisorEnabled = false)                         │
│     └── Entire Advisor is hidden                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**UI Example (Readiness Profile Editor):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  READINESS PROFILE: EU Market Entry - Apparel                               │
│  Organization Default: SILENT                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Rule                          │ Severity │ Mode                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  MIN_RECYCLED_CONTENT          │ BLOCKER  │ ○ Inherit  ● Silent  ○ Disabled │
│  HAZARDOUS_SUBSTANCES          │ BLOCKER  │ ○ Inherit  ○ Silent  ○ Disabled │
│                                │          │ ● Enforcing ← upgraded          │
│  CARBON_BENCHMARK              │ WARNING  │ ○ Inherit  ○ Silent  ● Disabled │
│  RECYCLABILITY_SCORE           │ INFO     │ ● Inherit  ○ Silent  ○ Disabled │
│                                                                              │
│  [ Bulk: Silence all ESPR rules ] [ Bulk: Enable all for regulation X ]    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Governance: Compliance Manager Authority

> **Control Center:** The **Compliance Workspace** is the sole control center for all rule governance. This includes adopting marketplace templates, managing readiness profiles, assigning profiles to products, and configuring per-rule override modes.
>
> Design and Operations workspaces have **read-only** compliance views - they can see compliance status and acknowledge deviations (if rule is ENFORCING), but cannot change profiles or rule configurations.

> **Critical:** Per-rule overrides are a **Compliance-only** function.

| Role | Can View Rules | Can Edit overrideMode | Can Bypass via Deviation |
|------|----------------|----------------------|--------------------------|
| **Compliance MANAGER** | ✓ | ✓ | ✓ |
| **Compliance EDITOR** | ✓ | ✗ | ✓ |
| **Design/Ops MANAGER** | ✓ | ✗ | ✓ (if rule is ENFORCING) |
| **Design/Ops EDITOR** | ✓ | ✗ | ✓ (if rule is ENFORCING) |

**Rationale:**

1. **Legal Liability Boundary**: Rule overrides are compliance decisions with legal implications
2. **Forensic Seal Integrity**: Auditors need to know WHO changed rule enforcement
3. **Policy vs. Data Separation**: Workspace users enter data; Compliance defines policy
4. **Soft Gate Bypass**: Even with strict governance, the Reason Code system allows operational flexibility

### Future Enhancement: Request + Approval Workflow

For larger enterprises, a formal request process can be added:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  REQUEST RULE OVERRIDE                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Rule: CARBON_BENCHMARK                                                     │
│  Current Mode: ENFORCING                                                    │
│  Requested Mode: SILENT                                                     │
│                                                                              │
│  Reason for Request:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ We are still setting up carbon tracking infrastructure. Request     │   │
│  │ silent mode until Q3 2026 when our LCA system goes live.            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Requested By: john.doe@acme.com (Design Manager)                          │
│  Requested At: 2026-01-21 14:30                                            │
│                                                                              │
│  [ APPROVE ]  [ REJECT ]  [ REQUEST MORE INFO ]                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

This is a natural evolution but **not required for MVP**.

---

## 4. Live Link Versioning Model

### Inheritance Behavior

When regulations change, the system uses **Live Link with Override Layers**:

1. **Organization Templates** only store their *additions* and *modifications*
2. Base rules are always fetched from the current System Template
3. When ESPR changes, tenants automatically get the update unless they've explicitly overridden that specific rule

### Version Scenarios

| Scenario | System Behavior |
|----------|-----------------|
| **Regulation Updated** | System templates auto-update; org templates get conflict notification |
| **In-Progress DPPs** | PreFlight audit warns of new requirements; user can acknowledge deviation |
| **Already-Minted DPPs** | Snapshot is frozen; shows rules valid at time of minting |

### Conflict Resolution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REGULATION UPDATE FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. ESPR v1.0 → v1.1 (Article 7 amended)                                    │
│                                                                              │
│  2. EuroComply updates System Template "ESPR Apparel"                       │
│     └── New rule: "Recyclability Score Required"                            │
│         └── activeFrom: 2027-01-01                                          │
│                                                                              │
│  3. Tenant "Acme Corp" has Organization Template inheriting from ESPR       │
│     └── NO override on Article 7 → Auto-receives new rule                   │
│     └── HAS override on Article 5 → Flagged as "Compliance Conflict"        │
│                                                                              │
│  4. Acme Admin sees notification:                                           │
│     "ESPR has been updated (Article 7). Your 'Internal Standard' has        │
│      been automatically updated. Click to review highlighted changes."      │
│                                                                              │
│  5. For conflicts:                                                          │
│     "Your override on Article 5 may conflict with new v1.1 requirements.    │
│      Please review and resolve before next release."                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Model

### 4.1 Schema Placement

| Entity | Schema | Reason |
|--------|--------|--------|
| `RegulationDocument` | `public` | Shared across all tenants |
| `RegulationAnchor` | `public` | Shared legal references |
| `RuleTemplate` (SYSTEM) | `public` | Platform-managed rules |
| `ReasonCode` (SYSTEM) | `public` | Platform-managed codes |
| `RuleTemplate` (ORG) | `tenant_{slug}` | Tenant-specific rules |
| `ReasonCode` (ORG) | `tenant_{slug}` | Tenant-specific codes |
| `ReadinessProfile` | `tenant_{slug}` | Tenant profiles (may reference public) |
| `ReadinessProfileRule` | `tenant_{slug}` | Override layer |
| `RuleDeviation` | `tenant_{slug}` | Per-DPP acknowledgments |
| `MarketplaceListing` | `public` | Published templates |
| `TemplateAdoption` | `tenant_{slug}` | Tenant adoptions |

### 4.2 RegulationDocument Entity

```typescript
// src/modules/regulations/entities/regulation-document.entity.ts
import { Entity, Property, OneToMany, Collection, Index } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';

@Entity({ tableName: 'regulation_document', schema: 'public' })
@Index({ properties: ['version'] })
export class RegulationDocument extends BaseEntity {
  @Property({ length: 255 })
  title!: string; // "ESPR - Ecodesign for Sustainable Products Regulation"

  @Property({ length: 50 })
  version!: string; // "EU 2024/1781"

  @Property({ length: 500 })
  r2Path!: string; // Path to immutable PDF in R2

  @Property({ length: 64 })
  contentHash!: string; // SHA-256 hash for version pinning

  @Property()
  effectiveDate!: Date; // When the regulation takes effect

  @Property({ nullable: true })
  sunsetDate?: Date; // When superseded by newer version

  @Property({ type: 'int' })
  totalPages!: number;

  @Property({ type: 'jsonb', nullable: true })
  metadata?: {
    jurisdiction: string; // "EU", "DE", "FR"
    regulationType: string; // "REGULATION", "DIRECTIVE", "DECISION"
    officialJournalRef?: string;
  };

  @Property({ default: true })
  isActive!: boolean;

  @OneToMany(() => RegulationAnchor, anchor => anchor.document)
  anchors = new Collection<RegulationAnchor>(this);
}
```

### 4.3 RegulationAnchor Entity

```typescript
// src/modules/regulations/entities/regulation-anchor.entity.ts
import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { RegulationDocument } from './regulation-document.entity';

export enum AnchorStatus {
  DRAFT = 'DRAFT',                     // AI-suggested, not verified
  VERIFIED_SYSTEM_TRUTH = 'VERIFIED',  // EuroComply legal team verified
  TENANT_CREATED = 'TENANT',           // Created by tenant for internal docs
}

@Entity({ tableName: 'regulation_anchor', schema: 'public' })
@Index({ properties: ['document', 'legalReference'] })
export class RegulationAnchor extends BaseEntity {
  @ManyToOne(() => RegulationDocument)
  document!: RegulationDocument;

  @Property({ length: 100 })
  legalReference!: string; // "Article 7, Paragraph 2(a)"

  @Property({ type: 'text' })
  textSnippet!: string; // Extracted text for display

  @Property({ type: 'jsonb' })
  coordinates!: {
    page: number;
    x: number;      // Percentage (0-100)
    y: number;      // Percentage (0-100)
    width: number;  // Percentage
    height: number; // Percentage
  };

  @Enum(() => AnchorStatus)
  status!: AnchorStatus;

  @Property({ nullable: true, length: 255 })
  verifiedBy?: string; // User ID who verified

  @Property({ nullable: true })
  verifiedAt?: Date;
}
```

### 4.4 RuleTemplate Entity

```typescript
// src/modules/regulations/entities/rule-template.entity.ts
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { RegulationAnchor } from './regulation-anchor.entity';
import { AttributeTemplate } from '../../taxonomy/entities/attribute-template.entity';
import { Category } from '../../taxonomy/entities/category.entity';

export enum RuleSeverity {
  BLOCKER = 'BLOCKER',   // Cannot proceed without acknowledgment
  WARNING = 'WARNING',   // Flagged but lower risk
  INFO = 'INFO',         // Informational guidance only
}

export enum RuleScope {
  SYSTEM = 'SYSTEM',
  MARKETPLACE = 'MARKETPLACE',
  ORGANIZATION = 'ORGANIZATION',
}

export enum RuleType {
  ATTRIBUTE = 'ATTRIBUTE', // Governs a specific data field
  PROCESS = 'PROCESS',     // Governs a workflow/relationship constraint
}

export enum RuleCategory {
  DESIGN = 'DESIGN',           // Product specs, materials, certifications
  OPERATIONS = 'OPERATIONS',   // Manufacturing, facilities, batch data
  MARKETING = 'MARKETING',     // Public content, claims, labels
  COMPLIANCE = 'COMPLIANCE',   // Legal docs, audit evidence, regulatory filings
}

@Entity({ tableName: 'rule_template' })
@Unique({ properties: ['organization', 'code'] })
@Index({ properties: ['scope', 'ruleCategory'] })
@Index({ properties: ['activeFrom', 'activeUntil'] })
export class RuleTemplate extends BaseEntity {
  @Property({ length: 100 })
  code!: string; // Unique identifier within scope

  @Property({ length: 255 })
  name!: string; // "Material Composition Disclosure"

  @Property({ type: 'text', nullable: true })
  description?: string;

  // --- Ownership ---
  @ManyToOne(() => Organization, { nullable: true })
  organization?: Organization; // NULL = System Template

  @Enum(() => RuleScope)
  scope!: RuleScope;

  // --- Inheritance ---
  @ManyToOne(() => RuleTemplate, { nullable: true })
  inheritedFrom?: RuleTemplate; // Link to parent template

  @Property({ nullable: true })
  inheritedFromVersion?: number; // Version at time of fork

  // --- Legal Anchoring ---
  @ManyToOne(() => RegulationAnchor, { nullable: true })
  legalAnchor?: RegulationAnchor; // Deep link to the law

  // --- Rule Target (mutually exclusive) ---
  @Enum(() => RuleType)
  type!: RuleType;

  @ManyToOne(() => AttributeTemplate, { nullable: true })
  attributeTemplate?: AttributeTemplate; // For ATTRIBUTE rules

  @ManyToOne(() => Category, { nullable: true })
  category?: Category; // For PROCESS rules

  // --- Classification ---
  @Enum(() => RuleCategory)
  ruleCategory!: RuleCategory;

  @Enum(() => RuleSeverity)
  severity!: RuleSeverity;

  // --- Temporal Activation ---
  @Property()
  activeFrom!: Date; // Rule takes effect on this date

  @Property({ nullable: true })
  activeUntil?: Date; // Optional sunset date

  // --- Validation ---
  // See Section 4.5 for detailed config interfaces per type
  @Property({ type: 'jsonb', nullable: true })
  validationLogic?: {
    type: 'required' | 'pattern' | 'range' | 'custom' |
          // Data-driven regulatory list checking (PREFERRED for substance compliance)
          'regulatory_list_check' | 'aggregate_metric_threshold' |
          // Legacy substance types (kept for backward compatibility)
          'substance_threshold' | 'substance_presence' | 'substance_authorization';
    config: Record<string, unknown>;
  };

  @Property({ version: true })
  version!: number; // Auto-incremented for change tracking
}
```

### 4.5 Substance Rule Templates

#### 4.5.1 Data-Driven Approach (PREFERRED)

**RECOMMENDED:** Use `regulatory_list_check` type with external RegulatoryList entities for maintainability and versioning.

> **Reference:** See `docs/plans/02-data-model.md` for RegulatoryList, RegulatoryListEntry, and CategoryRegulatoryList entity definitions.

```typescript
// RoHS Restricted Substances (data-driven)
const ROHS_RESTRICTED_SUBSTANCES: Partial<RuleTemplate> = {
  code: 'ROHS_RESTRICTED_SUBSTANCES',
  name: 'RoHS Restricted Substance Check',
  scope: RuleScope.SYSTEM,
  type: RuleType.PROCESS,
  ruleCategory: RuleCategory.DESIGN,
  severity: RuleSeverity.BLOCKER,
  validationLogic: {
    type: 'regulatory_list_check',
    config: {
      // References external RegulatoryList entity - no hardcoded CAS numbers!
      listCodes: ['ROHS_RESTRICTED'],
      checkType: 'THRESHOLD',
      // RoHS evaluates per homogeneous material, not whole article
      scope: 'HOMOGENEOUS_MATERIAL',
    },
  },
  // legalAnchor: linked to RoHS Directive Annex II PDF highlight
};

// COSING Annex II - Prohibited Cosmetic Substances (data-driven)
const COSING_PROHIBITED: Partial<RuleTemplate> = {
  code: 'COSING_ANNEX_II_CHECK',
  name: 'CosIng Prohibited Substances',
  scope: RuleScope.SYSTEM,
  type: RuleType.PROCESS,
  ruleCategory: RuleCategory.DESIGN,
  severity: RuleSeverity.BLOCKER,
  validationLogic: {
    type: 'regulatory_list_check',
    config: {
      listCodes: ['COSING_ANNEX_II'],
      checkType: 'PROHIBITED',
      scope: 'ARTICLE',  // Cosmetics evaluate whole product
    },
  },
};

// Category-inherited regulatory list check (uses CategoryRegulatoryList)
const CATEGORY_SUBSTANCE_CHECK: Partial<RuleTemplate> = {
  code: 'CATEGORY_SUBSTANCE_CHECK',
  name: 'Category-Based Substance Compliance',
  scope: RuleScope.SYSTEM,
  type: RuleType.PROCESS,
  ruleCategory: RuleCategory.DESIGN,
  severity: RuleSeverity.BLOCKER,
  validationLogic: {
    type: 'regulatory_list_check',
    config: {
      // null = inherit lists from CategoryRegulatoryList based on product category
      listCodes: null,
      checkType: 'PROHIBITED',
      scope: 'ARTICLE',
    },
  },
};
```

**RegulatoryListCheck Config Interface:**

```typescript
interface RegulatoryListCheckConfig {
  /**
   * Explicit list codes to check against.
   * If null, inherits from CategoryRegulatoryList based on product category.
   */
  listCodes: string[] | null;

  /**
   * Type of check: PROHIBITED, THRESHOLD, or RESTRICTED_WITH_CONDITIONS
   */
  checkType: 'PROHIBITED' | 'THRESHOLD' | 'RESTRICTED_WITH_CONDITIONS';

  /**
   * Evaluation scope:
   * - ARTICLE: Check rolled-up concentration (whole product) - used by REACH, COSING
   * - HOMOGENEOUS_MATERIAL: Check each material individually - used by RoHS
   */
  scope: 'ARTICLE' | 'HOMOGENEOUS_MATERIAL';

  /**
   * Override the threshold from RegulatoryListEntry.
   * If null, uses the threshold defined in the list entry.
   */
  thresholdOverridePct?: string;

  /**
   * For RESTRICTED_WITH_CONDITIONS checks, which condition key to evaluate.
   */
  conditionKey?: string;
}
```

**How It Works:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATA-DRIVEN SUBSTANCE EVALUATION FLOW                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. PreFlight receives product with category 'products.cosmetics.skincare' │
│                                                                             │
│  2. If listCodes is null, query CategoryRegulatoryList:                     │
│     SELECT rl.* FROM category_regulatory_list crl                          │
│     JOIN regulatory_list rl ON crl.list_id = rl.id                         │
│     WHERE crl.category_path @> 'products.cosmetics.skincare'::ltree        │
│       AND rl.is_current_version = TRUE                                     │
│     → Returns: [COSING_ANNEX_II, COSING_ANNEX_III, REACH_SVHC]             │
│                                                                             │
│  3. For each list, query RegulatoryListEntry for restricted substances     │
│                                                                             │
│  4. Roll up substances from product materials (SubstanceRollupService)     │
│                                                                             │
│  5. Cross-reference rolled-up substances against list entries              │
│                                                                             │
│  6. Generate SubstanceFinding with full traceability                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 4.5.2 Legacy Approach (Backward Compatibility)

The following hardcoded substance rule types are retained for backward compatibility but are **NOT RECOMMENDED** for new rules.

```typescript
// LEGACY: REACH SVHC Declaration Rule (hardcoded)
const REACH_SVHC_DECLARATION_LEGACY: Partial<RuleTemplate> = {
  code: 'REACH_SVHC_DECLARATION',
  name: 'SVHC Declaration Requirement',
  scope: RuleScope.SYSTEM,
  type: RuleType.PROCESS,
  ruleCategory: RuleCategory.COMPLIANCE,
  severity: RuleSeverity.WARNING,
  validationLogic: {
    type: 'substance_threshold',  // LEGACY TYPE
    config: {
      filter: { isSvhc: true },
      thresholdPct: 0.1,  // 0.1% w/w
      message: 'Product contains SVHC above 0.1% - declaration required per REACH Article 33',
    },
  },
};

// LEGACY: RoHS Restricted Substances (hardcoded CAS numbers)
const ROHS_RESTRICTED_LEGACY: Partial<RuleTemplate> = {
  code: 'ROHS_RESTRICTED_LEGACY',
  name: 'RoHS Restricted Substance Check (Legacy)',
  scope: RuleScope.SYSTEM,
  type: RuleType.PROCESS,
  ruleCategory: RuleCategory.DESIGN,
  severity: RuleSeverity.BLOCKER,
  validationLogic: {
    type: 'substance_presence',  // LEGACY TYPE
    config: {
      forbiddenCasNumbers: [
        '7439-92-1',  // Lead
        '7440-43-9',  // Cadmium
        '7439-97-6',  // Mercury
        '18540-29-9', // Chromium VI
      ],
      thresholds: {
        default: 0.1,
        '7440-43-9': 0.01,
      },
      message: 'Product contains RoHS restricted substance',
    },
  },
};
```

**Legacy Substance Rule Config Interface:**

```typescript
/** @deprecated Use RegulatoryListCheckConfig instead */
interface SubstanceRuleConfig {
  filter?: {
    isSvhc?: boolean;
    isRestricted?: boolean;
    requiresAuthorization?: boolean;
  };
  thresholdPct?: number;
  forbiddenCasNumbers?: string[];  // HARDCODED - difficult to maintain!
  thresholds?: Record<string, number>;
  message: string;
}
```

### 4.6 ReasonCode Entity

```typescript
// src/modules/regulations/entities/reason-code.entity.ts
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { RegulationDocument } from './regulation-document.entity';
import { Category } from '../../taxonomy/entities/category.entity';

export enum ReasonCodeScope {
  SYSTEM = 'SYSTEM',           // EuroComply standard codes
  MARKETPLACE = 'MARKETPLACE', // Industry group codes
  ORGANIZATION = 'ORGANIZATION', // Enterprise-specific codes
}

@Entity({ tableName: 'reason_code' })
@Unique({ properties: ['organization', 'code'] })
@Index({ properties: ['scope', 'category'] })
export class ReasonCode extends BaseEntity {
  @Property({ length: 50 })
  code!: string; // "SMALL_VOLUME_EXEMPTION"

  @Property({ length: 100 })
  label!: string; // "Small Volume Exemption"

  @Property({ type: 'text' })
  description!: string; // Explanation shown to user

  // --- Ownership ---
  @ManyToOne(() => Organization, { nullable: true })
  organization?: Organization; // NULL = System code

  @Enum(() => ReasonCodeScope)
  scope!: ReasonCodeScope;

  // --- Scoping ---
  @ManyToOne(() => Category, { nullable: true })
  category?: Category; // NULL = all categories

  @ManyToOne(() => RegulationDocument, { nullable: true })
  regulation?: RegulationDocument; // Scoped to specific regulation

  @Property({ default: false })
  requiresNarrative!: boolean; // Force additional explanation

  @Property({ default: true })
  isActive!: boolean;
}
```

### 4.6 ReadinessProfile Entity (Updated)

```typescript
// src/modules/regulations/entities/readiness-profile.entity.ts
import { Entity, Property, ManyToOne, OneToMany, Collection, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { Category } from '../../taxonomy/entities/category.entity';
import { RegulationDocument } from './regulation-document.entity';
import { ReadinessProfileRule } from './readiness-profile-rule.entity';

export enum ProfileScope {
  SYSTEM = 'SYSTEM',
  MARKETPLACE = 'MARKETPLACE',
  ORGANIZATION = 'ORGANIZATION',
}

@Entity({ tableName: 'readiness_profile' })
@Unique({ properties: ['organization', 'name'] })
@Index({ properties: ['scope', 'category'] })
export class ReadinessProfile extends BaseEntity {
  @Property({ length: 255 })
  name!: string; // "ESPR Apparel"

  @Property({ length: 50 })
  versionLabel!: string; // "Standard v2025.1"

  @Property({ type: 'text', nullable: true })
  description?: string;

  // --- Ownership ---
  @ManyToOne(() => Organization, { nullable: true })
  organization?: Organization; // NULL = System profile

  @Enum(() => ProfileScope)
  scope!: ProfileScope;

  // --- Classification ---
  @ManyToOne(() => Category)
  category!: Category; // Primary category this profile applies to

  @ManyToOne(() => RegulationDocument, { nullable: true })
  primaryRegulation?: RegulationDocument; // Main regulation covered

  // --- Inheritance ---
  @ManyToOne(() => ReadinessProfile, { nullable: true })
  inheritedFrom?: ReadinessProfile; // For fork tracking

  @Property({ nullable: true })
  inheritedFromVersion?: number;

  // --- Rules ---
  @OneToMany(() => ReadinessProfileRule, rule => rule.profile)
  rules = new Collection<ReadinessProfileRule>(this);

  @Property({ version: true })
  version!: number; // Internal auto-increment

  /**
   * Generate human-readable label for Forensic Seal display.
   */
  getAuditLabel(): string {
    if (this.inheritedFrom) {
      return `${this.name} ${this.versionLabel} (Based on ${this.inheritedFrom.name} ${this.inheritedFrom.versionLabel})`;
    }
    return `${this.name} ${this.versionLabel}`;
  }
}
```

### 4.7 ReadinessProfileRule Entity

```typescript
// src/modules/regulations/entities/readiness-profile-rule.entity.ts
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { ReadinessProfile } from './readiness-profile.entity';
import { RuleTemplate, RuleSeverity } from './rule-template.entity';

@Entity({ tableName: 'readiness_profile_rule' })
@Unique({ properties: ['profile', 'rule'] })
@Index({ properties: ['profile'] })
export class ReadinessProfileRule extends BaseEntity {
  @ManyToOne(() => ReadinessProfile)
  profile!: ReadinessProfile;

  @ManyToOne(() => RuleTemplate)
  rule!: RuleTemplate;

  // --- Override Layer (for Live Link model) ---
  @Enum({ items: () => RuleSeverity, nullable: true })
  severityOverride?: RuleSeverity; // Tenant can escalate WARNING → BLOCKER

  @Property({ nullable: true })
  activeFromOverride?: Date; // Tenant can delay or accelerate adoption

  @Property({ default: false })
  isExcluded!: boolean; // Tenant explicitly opted out of this rule
}
```

### 4.8 RuleDeviation Entity

```typescript
// src/modules/regulations/entities/rule-deviation.entity.ts
import { Entity, Property, ManyToOne, Index } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { DPPSnapshot } from '../../compliance/entities/dpp-snapshot.entity';
import { RuleTemplate } from './rule-template.entity';
import { ReasonCode } from './reason-code.entity';
import { User } from '../../auth/entities/user.entity';

@Entity({ tableName: 'rule_deviation' })
@Index({ properties: ['dpp'] })
@Index({ properties: ['rule'] })
export class RuleDeviation extends BaseEntity {
  @ManyToOne(() => DPPSnapshot)
  dpp!: DPPSnapshot;

  @ManyToOne(() => RuleTemplate)
  rule!: RuleTemplate;

  @Property()
  ruleVersion!: number; // Frozen at time of deviation

  @ManyToOne(() => ReasonCode)
  reasonCode!: ReasonCode;

  @Property({ type: 'text', nullable: true })
  narrative?: string; // Required if reasonCode.requiresNarrative or "Other"

  @ManyToOne(() => User)
  acknowledgedBy!: User;

  @Property()
  acknowledgedAt!: Date;

  // --- AI Sanity Check ---
  @Property({ type: 'jsonb', nullable: true })
  aiSanityCheck?: {
    flagged: boolean;
    warning?: string; // "This justification may not hold up..."
    reviewedByLegal?: boolean;
    reviewedAt?: Date;
  };

  // --- Legal Anchor Snapshot (frozen at time of deviation) ---
  @Property({ type: 'jsonb', nullable: true })
  legalAnchorSnapshot?: {
    reference: string;
    documentTitle: string;
    documentVersion: string;
    textSnippet: string;
  };
}
```

### 4.9 MarketplaceListing Entity

```typescript
// src/modules/marketplace/entities/marketplace-listing.entity.ts
import { Entity, Property, ManyToOne, OneToMany, Collection, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';

export enum ListingType {
  READINESS_PROFILE = 'READINESS_PROFILE',
  RULE_TEMPLATE = 'RULE_TEMPLATE',
  REASON_CODE_SET = 'REASON_CODE_SET',
}

export enum ListingStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  PUBLISHED = 'PUBLISHED',
  DEPRECATED = 'DEPRECATED',
}

@Entity({ tableName: 'marketplace_listing', schema: 'public' })
@Index({ properties: ['status', 'type'] })
export class MarketplaceListing extends BaseEntity {
  @ManyToOne(() => Organization)
  publisher!: Organization;

  @Enum(() => ListingType)
  type!: ListingType;

  @Property({ length: 255 })
  title!: string; // "Sustainable Textile Coalition Standard"

  @Property({ type: 'text' })
  description!: string;

  @Property({ type: 'jsonb' })
  metadata!: {
    industry: string[];        // ["Apparel", "Footwear"]
    regulations: string[];     // ["ESPR", "CSDDD"]
    version: string;
  };

  // Polymorphic reference to the shared item
  @Property({ length: 50 })
  linkedEntityType!: string; // 'ReadinessProfile' | 'RuleTemplate'

  @Property({ length: 30 })
  linkedEntityId!: string;

  @Enum(() => ListingStatus)
  status!: ListingStatus;

  @Property({ nullable: true })
  price?: number; // NULL = free, else EUR cents

  @Property({ default: 0 })
  adoptionCount!: number;

  @OneToMany(() => ListingReview, r => r.listing)
  reviews = new Collection<ListingReview>(this);

  @Property()
  publishedAt?: Date;
}
```

### 4.10 TemplateAdoption Entity

```typescript
// src/modules/marketplace/entities/template-adoption.entity.ts
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { MarketplaceListing } from './marketplace-listing.entity';

export enum AdoptionMode {
  LIVE_LINK = 'LIVE_LINK', // Auto-receives updates
  FORKED = 'FORKED',       // Snapshot, manual updates
}

@Entity({ tableName: 'template_adoption' })
@Unique({ properties: ['organization', 'listing'] })
@Index({ properties: ['organization'] })
export class TemplateAdoption extends BaseEntity {
  @ManyToOne(() => Organization)
  organization!: Organization;

  @ManyToOne(() => MarketplaceListing)
  listing!: MarketplaceListing;

  @Property()
  adoptedAt!: Date;

  @Property({ length: 50 })
  adoptedVersion!: string; // Version at time of adoption

  @Property({ nullable: true, length: 30 })
  forkedToProfileId?: string; // If they created a local fork

  @Enum(() => AdoptionMode)
  mode!: AdoptionMode;
}
```

---

## 6. PreFlight Audit Service (Soft Gate Logic)

### 6.0 Evaluation Timing

The PreFlight service operates in two distinct modes:

| Mode | When | Behavior | Outcome |
|------|------|----------|---------|
| **Advisory** | During design editing | Non-blocking, debounced (500ms), real-time feedback | UI shows warnings inline, doesn't prevent saving |
| **Blocking** | On version submit | Full evaluation with approval gate | Determines PASS, PASS_WITH_DEVIATIONS, or BLOCKED |

**Advisory Mode (Design Workspace):**
- Called via `POST /api/v1/design/versions/:id/preflight/advisory`
- Runs after 500ms of inactivity (debounced)
- Returns findings for UI color-coding
- Never prevents saving or editing

**Blocking Mode (Approval Gate):**
- Called via `POST /api/v1/design/versions/:id/submit`
- Full evaluation with frozen AuditResultSnapshot
- Determines `complianceStatus` outcome:
  - `PASS` → `AUTO_PASSED` → Version auto-released
  - `PASS_WITH_DEVIATIONS` → `PENDING_REVIEW` → Queued for Compliance Manager
  - `BLOCKED` → Error returned → Designer must acknowledge blockers first

### 6.1 Profile Resolution Hierarchy

When evaluating a ProductVersion, the PreFlight service resolves the ReadinessProfile using this hierarchy:

```
Resolved Profile =
  1. Product.readinessProfileId (if explicitly assigned)
  2. ELSE Product.category.defaultProfileId
  3. ELSE null → triggers SYSTEM_PROFILE_REQUIRED blocker
```

**Resolution Logic:**

```typescript
async resolveProfile(product: Product): Promise<ReadinessProfile | null> {
  // 1. Check for explicit product-level assignment
  if (product.readinessProfileId) {
    return this.em.findOne(ReadinessProfile, product.readinessProfileId);
  }

  // 2. Check for category default
  if (product.category?.defaultProfileId) {
    return this.em.findOne(ReadinessProfile, product.category.defaultProfileId);
  }

  // 3. No profile - will trigger SYSTEM_PROFILE_REQUIRED
  return null;
}
```

### 6.2 System Rule: SYSTEM_PROFILE_REQUIRED

When no profile is found via the resolution hierarchy, PreFlight generates a **system-level blocker** that must be acknowledged before submission.

```typescript
// System rule (scope: SYSTEM, not editable by tenants)
const SYSTEM_PROFILE_REQUIRED: SystemRule = {
  code: 'SYSTEM_PROFILE_REQUIRED',
  name: 'Compliance Profile Required',
  severity: 'BLOCKER',
  type: 'PROCESS',
  ruleCategory: 'COMPLIANCE',
  message: 'No compliance profile assigned to this product or category.',
  description: 'A Readiness Profile must be assigned to evaluate compliance. ' +
               'Contact your Compliance Manager to assign a profile, or acknowledge ' +
               'this requirement with a valid reason code.',
};
```

**Reason Codes for Missing Profile:**

| Code | Label | Use Case |
|------|-------|----------|
| `INTERNAL_R&D_ONLY` | Internal R&D Only | Product is for internal R&D, not market release |
| `EXEMPT_PRODUCT_TYPE` | Exempt Product Type | Product type exempt from compliance requirements |
| `PENDING_LEGAL_MAPPING` | Pending Legal Mapping | Compliance team still mapping regulations |
| `MANUAL_OVERRIDE` | Manual Override | Explicit business decision to skip compliance |

**Forensic Audit Trail:**

When a designer acknowledges this blocker and submits:
- `complianceStatus = PENDING_REVIEW`
- Compliance Manager reviews: "No profile assigned - Reason: INTERNAL_R&D_ONLY"
- If authorized, DPP shows: `PASS_WITH_DEVIATIONS - No profile: INTERNAL_R&D_ONLY`

This ensures:
- No product reaches market without documented compliance status
- Uses existing RuleDeviation workflow (no special cases)
- Full audit trail for regulators and internal auditors

### 6.3 Audit Result Interface

```typescript
// src/modules/compliance/interfaces/audit-result.interface.ts

export interface AuditResult {
  dppId: string;
  profileUsed: {
    id: string;
    auditLabel: string; // "Acme Corp v2.0 (Based on ESPR v2025.1)"
  };
  evaluatedAt: Date;
  summary: {
    total: number;
    passed: number;
    deviations: number;
    notApplicable: number;
    byCategory: Record<RuleCategory, CategorySummary>;
  };
  findings: AuditFinding[];
  canProceed: boolean; // True if all BLOCKERs are acknowledged
}

export interface CategorySummary {
  total: number;
  passed: number;
  blockers: number;
  warnings: number;
}

export interface AuditFinding {
  rule: {
    id: string;
    name: string;
    type: RuleType;
    severity: RuleSeverity;
  };
  ruleCategory: RuleCategory;
  legalAnchor?: {
    reference: string;
    documentTitle: string;
    viewerUrl: string;
  };
  status: 'PASSED' | 'FAILED' | 'NOT_APPLICABLE' | 'DISABLED';
  evidence?: {
    attributeValue?: unknown;
    documentIds?: string[];
  };
  existingDeviation?: {
    id: string;
    reasonCode: string;
    reasonLabel: string;
    narrative?: string;
    acknowledgedBy: string;
    acknowledgedAt: Date;
  };

  // Per-rule enforcement mode at evaluation time
  // Resolved from: ReadinessProfileRule.overrideMode → Organization.enforcementMode
  effectiveMode: 'ENFORCING' | 'SILENT' | 'DISABLED';

  // ─────────────────────────────────────────────────────────────
  // SUBSTANCE-SPECIFIC FINDINGS (for regulatory_list_check rules)
  // Provides full traceability from material to product
  // ─────────────────────────────────────────────────────────────
  substanceFindings?: SubstanceFinding[];
}

/**
 * Substance finding with full traceability for regulatory_list_check rules.
 * Shows exactly which substance violated which list and where it came from.
 */
export interface SubstanceFinding {
  substance: {
    id: string;
    casNumber: string;
    name: string;
  };

  /** The regulatory list that was violated */
  appliedList: {
    code: string;           // 'COSING_ANNEX_II'
    name: string;           // 'CosIng Annex II - Prohibited Substances'
    version: string;        // '2024-06'
    sourceUrl?: string;     // Deep link to official source
  };

  /** Entry details from RegulatoryListEntry */
  listEntry: {
    restrictionType: 'PROHIBITED' | 'THRESHOLD' | 'RESTRICTED_WITH_CONDITIONS';
    thresholdPct?: string;  // e.g., "0.1000"
    legalReference?: string; // 'Entry 1577'
    conditions?: Record<string, string>;
  };

  /** Why this list applied to this product */
  categoryTrigger: {
    productCategoryPath: string;  // 'products.cosmetics.skincare'
    matchedRulePath: string;       // 'products.cosmetics'
    priority: number;
  };

  /** Evaluation result */
  evaluation: {
    scope: 'ARTICLE' | 'HOMOGENEOUS_MATERIAL';
    actualConcentrationPct: string;  // Rolled-up or per-material
    thresholdPct: string;            // Applied threshold
    exceeded: boolean;
  };

  /**
   * Full traceability showing where the substance came from.
   * For ARTICLE scope: shows all contributing materials.
   * For HOMOGENEOUS_MATERIAL scope: shows the specific material.
   */
  traceability: Array<{
    material: {
      id: string;
      name: string;
      percentageInProduct: string;  // e.g., "2.5000"
    };
    concentrationInMaterial: string;  // e.g., "0.0500"
    contributionToProduct: string;    // material% × concentration%
    lineage?: string[];               // BOM path if nested
  }>;
}
```

### 5.2 PreFlight Audit Service

```typescript
// src/modules/compliance/services/preflight-audit.service.ts

@Injectable()
export class PreFlightAuditService {
  constructor(
    private readonly em: EntityManager,
    private readonly ruleResolver: RuleResolverService,
  ) {}

  /**
   * Evaluate a ProductVersion (design-time, before DPP minting).
   * Used by the Approval Gate workflow.
   *
   * @returns AuditResult with one of:
   *   - PASS: All rules passed, version can auto-release
   *   - PASS_WITH_DEVIATIONS: Blockers acknowledged, needs Compliance Manager
   *   - BLOCKED: Unacknowledged blockers, cannot submit
   */
  async evaluateVersion(versionId: string): Promise<AuditResult & { resultStatus: 'PASS' | 'PASS_WITH_DEVIATIONS' | 'BLOCKED' }> {
    const version = await this.em.findOneOrFail(ProductVersion, versionId, {
      populate: ['product', 'product.category'],
    });

    const product = version.product;

    // Resolve profile using hierarchy
    const profile = await this.resolveProfile(product);

    // If no profile, generate SYSTEM_PROFILE_REQUIRED finding
    if (!profile) {
      return this.generateMissingProfileResult(version);
    }

    // Get active rules (respecting activeFrom/activeUntil and overrides)
    const rules = await this.ruleResolver.getEffectiveRules(profile, new Date());

    // Evaluate each rule against the version's design data
    const findings = await Promise.all(
      rules.map(rule => this.evaluateRuleForVersion(version, rule))
    );

    // Determine result status
    const unacknowledgedBlockers = findings.filter(
      f => f.rule.severity === RuleSeverity.BLOCKER &&
           f.effectiveMode === 'ENFORCING' &&
           f.status === 'FAILED' &&
           !f.existingDeviation
    );

    const acknowledgedBlockers = findings.filter(
      f => f.rule.severity === RuleSeverity.BLOCKER &&
           f.effectiveMode === 'ENFORCING' &&
           f.status === 'FAILED' &&
           f.existingDeviation
    );

    let resultStatus: 'PASS' | 'PASS_WITH_DEVIATIONS' | 'BLOCKED';
    if (unacknowledgedBlockers.length > 0) {
      resultStatus = 'BLOCKED';
    } else if (acknowledgedBlockers.length > 0) {
      resultStatus = 'PASS_WITH_DEVIATIONS';
    } else {
      resultStatus = 'PASS';
    }

    return {
      dppId: versionId, // Using versionId as identifier for design-time
      profileUsed: {
        id: profile.id,
        auditLabel: profile.getAuditLabel(),
      },
      evaluatedAt: new Date(),
      summary: this.calculateSummary(findings),
      findings,
      canProceed: resultStatus !== 'BLOCKED',
      resultStatus,
    };
  }

  private async resolveProfile(product: Product): Promise<ReadinessProfile | null> {
    // 1. Check for explicit product-level assignment
    if (product.readinessProfileId) {
      return this.em.findOne(ReadinessProfile, product.readinessProfileId);
    }

    // 2. Check for category default
    if (product.category?.defaultProfileId) {
      return this.em.findOne(ReadinessProfile, product.category.defaultProfileId);
    }

    // 3. No profile - will trigger SYSTEM_PROFILE_REQUIRED
    return null;
  }

  private generateMissingProfileResult(version: ProductVersion): AuditResult & { resultStatus: 'BLOCKED' } {
    const systemFinding: AuditFinding = {
      rule: {
        id: 'SYSTEM_PROFILE_REQUIRED',
        name: 'Compliance Profile Required',
        type: RuleType.PROCESS,
        severity: RuleSeverity.BLOCKER,
      },
      ruleCategory: RuleCategory.COMPLIANCE,
      status: 'FAILED',
      effectiveMode: 'ENFORCING',
    };

    return {
      dppId: version.id,
      profileUsed: {
        id: 'NONE',
        auditLabel: 'No Profile Assigned',
      },
      evaluatedAt: new Date(),
      summary: {
        total: 1,
        passed: 0,
        deviations: 0,
        notApplicable: 0,
        byCategory: {
          DESIGN: { total: 0, passed: 0, blockers: 0, warnings: 0 },
          OPERATIONS: { total: 0, passed: 0, blockers: 0, warnings: 0 },
          MARKETING: { total: 0, passed: 0, blockers: 0, warnings: 0 },
          COMPLIANCE: { total: 1, passed: 0, blockers: 1, warnings: 0 },
        },
      },
      findings: [systemFinding],
      canProceed: false,
      resultStatus: 'BLOCKED',
    };
  }

  /**
   * Evaluate a DPP (runtime, after minting).
   * Original method for DPP-level evaluation.
   */
  async evaluate(dppId: string, profileId?: string): Promise<AuditResult> {
    const dpp = await this.em.findOneOrFail(DPPSnapshot, dppId, {
      populate: ['serial', 'serial.batch', 'serial.batch.designVersion', 'serial.batch.designVersion.product'],
    });

    const product = dpp.serial.batch.designVersion.product;

    // Resolve profile: explicit, org default, or system default
    const profile = await this.resolveProfile(product.category, profileId);

    // Get active rules (respecting activeFrom/activeUntil and overrides)
    const rules = await this.ruleResolver.getEffectiveRules(profile, new Date());

    // Evaluate each rule
    const findings = await Promise.all(
      rules.map(rule => this.evaluateRule(dpp, rule))
    );

    // Check if all ENFORCING BLOCKERs are either PASSED or have acknowledged deviations
    // SILENT and DISABLED rules never block
    const canProceed = findings
      .filter(f => f.rule.severity === RuleSeverity.BLOCKER && f.effectiveMode === 'ENFORCING')
      .every(f => f.status === 'PASSED' || f.existingDeviation);

    return {
      dppId,
      profileUsed: {
        id: profile.id,
        auditLabel: profile.getAuditLabel(),
      },
      evaluatedAt: new Date(),
      summary: this.calculateSummary(findings),
      findings,
      canProceed,
    };
  }

  private async evaluateRule(
    dpp: DPPSnapshot,
    rule: EffectiveRule
  ): Promise<AuditFinding> {
    // Resolve effective mode: rule override → org default
    const effectiveMode = rule.overrideMode ?? dpp.organization.enforcementMode;

    // DISABLED rules are skipped entirely
    if (effectiveMode === 'DISABLED') {
      return {
        rule: {
          id: rule.template.id,
          name: rule.template.name,
          type: rule.template.type,
          severity: rule.effectiveSeverity,
        },
        ruleCategory: rule.template.ruleCategory,
        legalAnchor: rule.template.legalAnchor
          ? this.formatLegalAnchor(rule.template.legalAnchor)
          : undefined,
        status: 'DISABLED',
        effectiveMode,
      };
    }

    // Check for existing acknowledged deviation
    const deviation = await this.em.findOne(RuleDeviation, {
      dpp,
      rule: rule.template,
      ruleVersion: rule.template.version,
    }, { populate: ['reasonCode', 'acknowledgedBy'] });

    // Evaluate based on rule type
    const status = rule.template.type === RuleType.ATTRIBUTE
      ? await this.evaluateAttributeRule(dpp, rule)
      : await this.evaluateProcessRule(dpp, rule);

    return {
      rule: {
        id: rule.template.id,
        name: rule.template.name,
        type: rule.template.type,
        severity: rule.effectiveSeverity,
      },
      ruleCategory: rule.template.ruleCategory,
      legalAnchor: rule.template.legalAnchor
        ? this.formatLegalAnchor(rule.template.legalAnchor)
        : undefined,
      status,
      effectiveMode,
      existingDeviation: deviation ? {
        id: deviation.id,
        reasonCode: deviation.reasonCode.code,
        reasonLabel: deviation.reasonCode.label,
        narrative: deviation.narrative,
        acknowledgedBy: deviation.acknowledgedBy.name ?? deviation.acknowledgedBy.email,
        acknowledgedAt: deviation.acknowledgedAt,
      } : undefined,
    };
  }

  private async evaluateAttributeRule(
    dpp: DPPSnapshot,
    rule: EffectiveRule
  ): Promise<'PASSED' | 'FAILED' | 'NOT_APPLICABLE'> {
    if (!rule.template.attributeTemplate) {
      return 'NOT_APPLICABLE';
    }

    const attrCode = rule.template.attributeTemplate.code;

    // Check in frozen snapshot data
    const designSpecs = dpp.designData?.specifications || {};
    const value = designSpecs[attrCode];

    if (value === undefined || value === null || value === '') {
      return 'FAILED';
    }

    // Apply validation logic if defined
    if (rule.template.validationLogic) {
      return this.applyValidation(value, rule.template.validationLogic)
        ? 'PASSED'
        : 'FAILED';
    }

    return 'PASSED';
  }

  private async evaluateProcessRule(
    dpp: DPPSnapshot,
    rule: EffectiveRule
  ): Promise<'PASSED' | 'FAILED' | 'NOT_APPLICABLE'> {
    // Process rules check relationships, not single values
    // Example: "All BOM items must have a linked facility"

    const bomSnapshot = dpp.designData?.bomSnapshot || [];

    // For now, check if all BOM entries have facility links
    if (rule.template.code === 'BOM_FACILITY_REQUIRED') {
      const allHaveFacility = bomSnapshot.every(
        (line: BomLineSnapshot) => line.facilityId
      );
      return allHaveFacility ? 'PASSED' : 'FAILED';
    }

    return 'NOT_APPLICABLE';
  }

  /**
   * Evaluate substance-specific rules against rolled-up substances from BOM.
   * See Taxonomy Engine Design (Section 6.7) for rollup calculation.
   *
   * Supports two approaches:
   * 1. PREFERRED: regulatory_list_check - data-driven via RegulatoryList entities
   * 2. LEGACY: substance_threshold/presence/authorization - hardcoded rules
   */
  private async evaluateSubstanceRule(
    dpp: DPPSnapshot,
    rule: EffectiveRule
  ): Promise<{ status: 'PASSED' | 'FAILED' | 'NOT_APPLICABLE'; substanceFindings?: SubstanceFinding[] }> {
    const substances = dpp.designData?.rolledUpSubstances || [];

    switch (rule.template.validationLogic?.type) {
      // ═══════════════════════════════════════════════════════════════════════════
      // DATA-DRIVEN APPROACH (PREFERRED)
      // Uses RegulatoryList entities from public schema
      // See: docs/plans/02-data-model.md (RegulatoryList, CategoryRegulatoryList)
      // ═══════════════════════════════════════════════════════════════════════════
      case 'regulatory_list_check':
        return this.evaluateRegulatoryListCheck(dpp, rule);

      // ═══════════════════════════════════════════════════════════════════════════
      // LEGACY APPROACH (Backward Compatibility)
      // Uses hardcoded rules in validationLogic.config
      // ═══════════════════════════════════════════════════════════════════════════
      case 'substance_threshold':
        // Check if any substance exceeds concentration threshold
        // Example: SVHC > 0.1% requires declaration
        const config = rule.template.validationLogic?.config as SubstanceRuleConfig;
        const filtered = substances.filter(s => {
          if (config.filter?.isSvhc !== undefined && s.isSvhc !== config.filter.isSvhc) return false;
          if (config.filter?.isRestricted !== undefined && s.isRestricted !== config.filter.isRestricted) return false;
          return true;
        });

        const exceeds = filtered.some(
          s => parseFloat(s.effectiveConcentrationPct) > config.thresholdPct
        );
        return { status: exceeds ? 'FAILED' : 'PASSED' };

      case 'substance_presence':
        // Check if any forbidden substance is present at all
        // Example: RoHS restricted substances
        const presenceConfig = rule.template.validationLogic?.config as SubstanceRuleConfig;
        const forbidden = substances.some(s =>
          presenceConfig.forbiddenCasNumbers?.includes(s.casNumber)
        );
        return { status: forbidden ? 'FAILED' : 'PASSED' };

      case 'substance_authorization':
        // Check if any substance requires authorization
        const needsAuth = substances.some(s => s.requiresAuthorization);
        return { status: needsAuth ? 'FAILED' : 'PASSED' };

      default:
        return { status: 'NOT_APPLICABLE' };
    }
  }

  /**
   * Evaluate regulatory list check using data-driven RegulatoryList entities.
   * Cross-references rolled-up substances against RegulatoryListEntry.
   *
   * @see docs/plans/2026-01-26-regulatory-vertical-system-design.md
   */
  private async evaluateRegulatoryListCheck(
    dpp: DPPSnapshot,
    rule: EffectiveRule
  ): Promise<{ status: 'PASSED' | 'FAILED' | 'NOT_APPLICABLE'; substanceFindings: SubstanceFinding[] }> {
    const config = rule.template.validationLogic?.config as RegulatoryListCheckConfig;
    const product = dpp.serial.batch.designVersion.product;
    const categoryPath = product.category?.path;

    // 1. Resolve applicable regulatory lists
    let listCodes: string[];
    if (config.listCodes === null) {
      // Inherit from CategoryRegulatoryList based on product category
      const categoryLists = await this.em.find(
        CategoryRegulatoryList,
        {
          // LTREE @> query: find all rules where category_path is ancestor of product category
          categoryPath: { $contained: categoryPath },
          isExcluded: false,
        },
        { populate: ['list'], orderBy: { priority: 'DESC' } }
      );
      listCodes = categoryLists
        .filter(cl => cl.list.isCurrentVersion)
        .map(cl => cl.list.code);
    } else {
      listCodes = config.listCodes;
    }

    if (listCodes.length === 0) {
      return { status: 'NOT_APPLICABLE', substanceFindings: [] };
    }

    // 2. Get all entries from applicable lists
    const lists = await this.em.find(RegulatoryList, {
      code: { $in: listCodes },
      isCurrentVersion: true,
    }, { populate: ['entries', 'entries.substance'] });

    // 3. Get rolled-up substances (or per-material for HOMOGENEOUS_MATERIAL scope)
    const rolledUpSubstances = dpp.designData?.rolledUpSubstances || [];
    const materialSubstances = dpp.designData?.bomSnapshot?.flatMap(
      bom => bom.substances || []
    ) || [];

    const substancesToCheck = config.scope === 'ARTICLE'
      ? rolledUpSubstances
      : materialSubstances;

    // 4. Cross-reference and build findings
    const substanceFindings: SubstanceFinding[] = [];

    for (const list of lists) {
      for (const entry of list.entries) {
        // Find matching substance in product
        const match = substancesToCheck.find(
          s => s.casNumber === entry.casNumberSnapshot
        );

        if (!match) continue;

        // Check restriction type
        const concentrationPct = parseFloat(match.effectiveConcentrationPct || '0');
        const thresholdPct = config.thresholdOverridePct
          ? parseFloat(config.thresholdOverridePct)
          : parseFloat(entry.thresholdPct || '0');

        let exceeded = false;
        switch (entry.restrictionType) {
          case 'PROHIBITED':
            exceeded = concentrationPct > 0;
            break;
          case 'THRESHOLD':
            exceeded = concentrationPct > thresholdPct;
            break;
          case 'RESTRICTED_WITH_CONDITIONS':
            // Check condition (if conditionKey specified)
            if (config.conditionKey && entry.conditions?.[config.conditionKey]) {
              exceeded = true; // Condition applies - needs manual review
            }
            break;
        }

        if (exceeded) {
          substanceFindings.push({
            substance: {
              id: entry.substance.id,
              casNumber: entry.casNumberSnapshot,
              name: entry.substanceNameSnapshot,
            },
            appliedList: {
              code: list.code,
              name: list.name,
              version: list.version,
              sourceUrl: list.sourceUrl,
            },
            listEntry: {
              restrictionType: entry.restrictionType,
              thresholdPct: entry.thresholdPct,
              legalReference: entry.legalReference,
              conditions: entry.conditions,
            },
            categoryTrigger: {
              productCategoryPath: categoryPath,
              matchedRulePath: categoryPath, // Simplified
              priority: 0,
            },
            evaluation: {
              scope: config.scope,
              actualConcentrationPct: match.effectiveConcentrationPct,
              thresholdPct: thresholdPct.toString(),
              exceeded,
            },
            traceability: match.traceability || [],
          });
        }
      }
    }

    return {
      status: substanceFindings.length > 0 ? 'FAILED' : 'PASSED',
      substanceFindings,
    };
  }

  private formatLegalAnchor(anchor: RegulationAnchor): AuditFinding['legalAnchor'] {
    return {
      reference: anchor.legalReference,
      documentTitle: anchor.document.title,
      viewerUrl: `/regulations/${anchor.document.id}?page=${anchor.coordinates.page}&anchor=${anchor.id}`,
    };
  }

  private calculateSummary(findings: AuditFinding[]): AuditResult['summary'] {
    const byCategory: Record<RuleCategory, CategorySummary> = {
      DESIGN: { total: 0, passed: 0, blockers: 0, warnings: 0 },
      OPERATIONS: { total: 0, passed: 0, blockers: 0, warnings: 0 },
      MARKETING: { total: 0, passed: 0, blockers: 0, warnings: 0 },
      COMPLIANCE: { total: 0, passed: 0, blockers: 0, warnings: 0 },
    };

    for (const f of findings) {
      const cat = byCategory[f.ruleCategory];
      cat.total++;
      if (f.status === 'PASSED') cat.passed++;
      if (f.status === 'FAILED' && f.rule.severity === RuleSeverity.BLOCKER) cat.blockers++;
      if (f.status === 'FAILED' && f.rule.severity === RuleSeverity.WARNING) cat.warnings++;
    }

    return {
      total: findings.length,
      passed: findings.filter(f => f.status === 'PASSED').length,
      deviations: findings.filter(f => f.existingDeviation).length,
      notApplicable: findings.filter(f => f.status === 'NOT_APPLICABLE').length,
      byCategory,
    };
  }
}
```

---

## 7. Forensic Seal View (Auditor Interface)

### 6.1 Tiered Information Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FORENSIC SEAL - TIERED HIERARCHY                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TIER 1: VERIFICATION HEADER (Trust Ritual)                                 │
│  ──────────────────────────────────────────                                  │
│  • Cryptographic status badge (VERIFIED / INVALID / EXPIRED)                │
│  • Issuer DID (did:ebsi:xyz or did:key:xyz)                                 │
│  • RFC 3161 timestamp proof                                                  │
│  • Merkle root and batch reference                                          │
│                                                                              │
│  TIER 2: EXCEPTION DASHBOARD (Respect auditor's time)                       │
│  ─────────────────────────────────────────────────────                       │
│  • Profile used: "Acme Corp v2.0 (Based on ESPR v2025.1)"                   │
│  • Deviation count: "3 Regulatory Deviations Acknowledged"                  │
│  • Each deviation shows:                                                     │
│    - Rule name + legal reference                                            │
│    - Reason code + narrative                                                │
│    - AI sanity check warning (if flagged)                                   │
│  • High-impact alerts                                                       │
│                                                                              │
│  TIER 3: RULE MATRIX (Systematic check - expandable)                        │
│  ────────────────────────────────────────────────────                        │
│  • Every rule from the profile as a row                                     │
│  • Columns: Rule | Legal Anchor | Status | Evidence | Justification         │
│  • Clickable links to highlighted PDF                                       │
│  • Grouped by ruleCategory (Design, Operations, Marketing, Compliance)      │
│                                                                              │
│  TIER 4: FORENSIC TIMELINE (Chronological - expandable)                     │
│  ──────────────────────────────────────────────────────                      │
│  • Git-style log of state transitions                                       │
│  • Each transition shows: from → to, trigger, user, timestamp               │
│  • Hash-linked operations events                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 ForensicSealView Interface

```typescript
// src/modules/compliance/interfaces/forensic-seal.interface.ts

export interface ForensicSealView {
  // --- Tier 1: Trust Header ---
  verification: {
    status: 'VERIFIED' | 'INVALID' | 'EXPIRED';
    issuerId: string;
    issuerName: string;
    issuedAt: Date;
    timestamp: {
      authority: string;
      hash: string;
      batchMerkleRoot?: string;
    };
  };

  // --- Tier 2: Exception Dashboard ---
  complianceSummary: {
    profileUsed: string;
    profileVersion: string;
    evaluatedAt: Date;
    deviationCount: number;
    deviations: DeviationSummary[];
    highImpactAlerts: HighImpactAlert[];
  };

  // --- Tier 3: Rule Matrix ---
  ruleMatrix: {
    byCategory: Record<RuleCategory, RuleMatrixEntry[]>;
    totalRules: number;
    passRate: number;
  };

  // --- Tier 4: Forensic Timeline ---
  timeline: {
    transitions: TransitionEntry[];
    operationsEvents: OperationsEventEntry[];
  };

  // --- Export Package ---
  exportPackage: {
    available: boolean;
    generatedAt?: Date;
    downloadUrl?: string;
    contents: string[];
  };
}

export interface DeviationSummary {
  ruleName: string;
  ruleCategory: RuleCategory;
  severity: RuleSeverity;
  legalReference?: string;
  reasonCode: {
    code: string;
    label: string;
    scope: ReasonCodeScope;
  };
  narrative?: string;
  acknowledgedBy: string;
  acknowledgedAt: Date;
  aiSanityCheck?: {
    flagged: boolean;
    warning?: string;
  };
}

export interface RuleMatrixEntry {
  ruleName: string;
  ruleCode: string;
  legalAnchor?: {
    reference: string;
    viewerUrl: string;
  };
  status: 'PASSED' | 'DEVIATION' | 'NOT_APPLICABLE';
  evidence: {
    type: 'ATTRIBUTE' | 'DOCUMENT' | 'PROCESS';
    summary: string;
    documentLinks?: string[];
  };
}
```

### 6.3 Offline Export Package

```
audit-package-SKU12345-2026-01-21/
├── manifest.json              # Package metadata + integrity hashes
├── forensic-seal.html         # Self-contained viewer (no external deps)
├── dpp-snapshot.json          # Frozen product data
├── compliance/
│   ├── profile-used.json      # Profile definition at time of mint
│   ├── rule-matrix.json       # All rules + statuses
│   └── deviations.json        # Acknowledged gaps with narratives
├── timeline.json              # State transitions + events
├── regulations/
│   └── espr-2024-1781.pdf     # Pinned regulation PDF
├── evidence/
│   ├── test-report-001.pdf
│   └── certification-002.pdf
└── signatures/
    ├── credential.jwt         # W3C VC
    └── timestamp.tsr          # RFC 3161 response
```

---

## 8. Regulation Viewer (PDF Highlighting)

### 7.1 Viewer State Interface

```typescript
// src/modules/regulations/interfaces/viewer.interface.ts

export interface RegulationViewerState {
  document: {
    id: string;
    title: string;
    version: string;
    r2Url: string;
    contentHash: string;
    totalPages: number;
  };
  activeAnchor?: {
    id: string;
    page: number;
    coordinates: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    legalReference: string;
    textSnippet: string;
    linkedRule?: {
      id: string;
      name: string;
      severity: RuleSeverity;
    };
  };
  relatedAnchors: AnchorPreview[];
}

export interface AnchorPreview {
  id: string;
  legalReference: string;
  linkedRuleCount: number;
}
```

### 7.2 Frontend Component (PDF.js Integration)

```typescript
// Frontend: RegulationViewer.tsx

function RegulationViewer({ documentId, anchorId }: Props) {
  const pdfViewerRef = useRef<HTMLDivElement>(null);
  const [viewerState, setViewerState] = useState<RegulationViewerState>();
  const [viewport, setViewport] = useState<PDFPageViewport>();

  // Fetch viewer state
  useEffect(() => {
    regulationViewerService
      .getViewerState(documentId, anchorId)
      .then(setViewerState);
  }, [documentId, anchorId]);

  // Auto-scroll to anchor when it becomes active
  useEffect(() => {
    if (viewerState?.activeAnchor && pdfViewerRef.current && viewport) {
      const scrollTop =
        (viewerState.activeAnchor.coordinates.y / 100) * viewport.height;

      pdfViewerRef.current.scrollTo({
        top: scrollTop - 50, // Offset for visual context
        behavior: 'smooth',
      });
    }
  }, [viewerState?.activeAnchor, viewport]);

  return (
    <div className="regulation-viewer" ref={pdfViewerRef}>
      <PDFDocument
        url={viewerState?.document.r2Url}
        initialPage={viewerState?.activeAnchor?.page ?? 1}
        onViewportReady={setViewport}
      >
        {viewerState?.activeAnchor && viewport && (
          <Highlight
            anchor={viewerState.activeAnchor}
            viewport={viewport}
          />
        )}

        <AnchorSidebar
          anchors={viewerState?.relatedAnchors ?? []}
          activeId={anchorId}
          onSelect={navigateToAnchor}
        />
      </PDFDocument>
    </div>
  );
}

function Highlight({ anchor, viewport }: HighlightProps) {
  // Convert percentage coordinates to viewport pixels
  const rect = {
    left: (anchor.coordinates.x / 100) * viewport.width,
    top: (anchor.coordinates.y / 100) * viewport.height,
    width: (anchor.coordinates.width / 100) * viewport.width,
    height: (anchor.coordinates.height / 100) * viewport.height,
  };

  return (
    <div
      className="regulation-highlight"
      style={{
        position: 'absolute',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        backgroundColor: 'rgba(255, 213, 0, 0.4)',
        border: '2px solid #f59e0b',
        cursor: 'pointer',
      }}
    />
  );
}
```

---

## 9. Regulation Ingestion Pipeline (AI-Assisted)

### 8.1 Ingestion Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AI-ASSISTED INGESTION PIPELINE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PHASE 1: OCR & LAYOUT ANALYSIS                                             │
│  ──────────────────────────────                                              │
│  • Upload regulation PDF to R2                                              │
│  • AWS Textract extracts text with (x, y) coordinates                       │
│  • Generate content hash for version pinning                                │
│                                                                              │
│  PHASE 2: ARTICLE EXTRACTION                                                │
│  ───────────────────────────                                                 │
│  • LLM parses text to identify logical sections                             │
│  • Extracts: Article number, title, full text, page, coordinates            │
│  • Identifies subsections (paragraphs, clauses)                             │
│                                                                              │
│  PHASE 3: ATTRIBUTE MAPPING                                                 │
│  ──────────────────────────                                                  │
│  • Match extracted articles to existing AttributeTemplates                  │
│  • Generate confidence scores (0.0 - 1.0)                                   │
│  • Create draft RegulationAnchors with DRAFT status                         │
│                                                                              │
│  PHASE 4: HUMAN VERIFICATION                                                │
│  ───────────────────────────                                                 │
│  • Legal team reviews AI suggestions in Verification Station                │
│  • Approve, adjust coordinates, or reject                                   │
│  • Mark as VERIFIED_SYSTEM_TRUTH                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Ingestion Job Entity

```typescript
// src/modules/regulations/entities/ingestion-job.entity.ts

export enum IngestionPhase {
  OCR = 'OCR',
  EXTRACTION = 'EXTRACTION',
  MAPPING = 'MAPPING',
  COMPLETE = 'COMPLETE',
}

export enum IngestionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  REVIEW_READY = 'REVIEW_READY',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity({ tableName: 'ingestion_job', schema: 'public' })
export class IngestionJob extends BaseEntity {
  @ManyToOne(() => RegulationDocument)
  document!: RegulationDocument;

  @Enum(() => IngestionStatus)
  status!: IngestionStatus;

  @Enum(() => IngestionPhase)
  phase!: IngestionPhase;

  @Property({ default: 0 })
  percentComplete!: number;

  @Property({ type: 'jsonb', nullable: true })
  results?: {
    extractedArticles: ExtractedArticle[];
    suggestedAnchors: SuggestedAnchor[];
    unmappedSections: string[];
  };

  @Property({ type: 'text', nullable: true })
  error?: string;
}
```

---

## 10. Marketplace Service

### 9.1 Publishing Flow

```typescript
// src/modules/marketplace/services/marketplace.service.ts

@Injectable()
export class MarketplaceService {
  async publish(
    organizationId: string,
    profileId: string,
    listingData: CreateListingDto
  ): Promise<MarketplaceListing> {
    // Validate publisher owns the profile
    const profile = await this.em.findOneOrFail(ReadinessProfile, profileId);
    if (profile.organization?.id !== organizationId) {
      throw new ForbiddenException('Cannot publish profile you do not own');
    }

    // Create listing
    const listing = this.em.create(MarketplaceListing, {
      publisher: organizationId,
      type: ListingType.READINESS_PROFILE,
      linkedEntityType: 'ReadinessProfile',
      linkedEntityId: profileId,
      status: ListingStatus.PENDING_REVIEW,
      adoptionCount: 0,
      ...listingData,
    });

    await this.em.flush();

    // Notify EuroComply team for review
    await this.notificationService.notifyMarketplaceReview(listing);

    return listing;
  }

  async adopt(
    organizationId: string,
    listingId: string,
    mode: AdoptionMode
  ): Promise<TemplateAdoption> {
    const listing = await this.em.findOneOrFail(MarketplaceListing, listingId);

    // Handle payment if priced
    if (listing.price) {
      await this.billingService.chargeMarketplacePurchase(organizationId, listing);
    }

    let forkedProfileId: string | undefined;

    if (mode === AdoptionMode.FORKED) {
      forkedProfileId = await this.forkProfile(organizationId, listing.linkedEntityId);
    }

    // Record adoption
    const adoption = this.em.create(TemplateAdoption, {
      organization: organizationId,
      listing,
      adoptedAt: new Date(),
      adoptedVersion: listing.metadata.version,
      forkedToProfileId: forkedProfileId,
      mode,
    });

    listing.adoptionCount++;
    await this.em.flush();

    return adoption;
  }
}
```

---

## 11. API Endpoints

### Regulations

```
GET    /api/v1/regulations                           # List regulation documents
GET    /api/v1/regulations/:id                       # Get document with anchors
GET    /api/v1/regulations/:id/viewer                # Get viewer state
POST   /api/v1/regulations                           # Upload new regulation (admin)
POST   /api/v1/regulations/:id/anchors               # Add anchor
PUT    /api/v1/regulations/anchors/:id               # Update anchor
POST   /api/v1/regulations/anchors/:id/verify        # Mark as verified
```

### Rule Templates

```
GET    /api/v1/rules                                 # List rules (filtered by scope)
GET    /api/v1/rules/:id                             # Get rule with legal anchor
POST   /api/v1/rules                                 # Create org rule
PUT    /api/v1/rules/:id                             # Update rule
DELETE /api/v1/rules/:id                             # Soft delete
```

### Readiness Profiles

```
GET    /api/v1/profiles                              # List profiles
GET    /api/v1/profiles/:id                          # Get profile with rules
POST   /api/v1/profiles                              # Create org profile
PUT    /api/v1/profiles/:id                          # Update profile
POST   /api/v1/profiles/:id/fork                     # Fork from system/marketplace
GET    /api/v1/profiles/:id/effective-rules          # Get resolved rules (with inheritance)
```

### Reason Codes

```
GET    /api/v1/reason-codes                          # List codes (filtered by category)
POST   /api/v1/reason-codes                          # Create org code
PUT    /api/v1/reason-codes/:id                      # Update code
```

### Compliance Audit

```
GET    /api/v1/compliance/dpps/:id/audit             # Run pre-flight audit
POST   /api/v1/compliance/dpps/:id/deviations        # Acknowledge deviation
GET    /api/v1/compliance/dpps/:id/forensic-seal     # Get forensic seal view
GET    /api/v1/compliance/dpps/:id/export            # Download audit package
```

### Marketplace

```
GET    /api/v1/marketplace/listings                  # Browse marketplace
GET    /api/v1/marketplace/listings/:id              # Get listing details
POST   /api/v1/marketplace/listings                  # Publish listing
POST   /api/v1/marketplace/listings/:id/adopt        # Adopt template
GET    /api/v1/marketplace/adoptions                 # List org adoptions
```

---

## 12. Related Documents

| Document | Integration Point |
|----------|-------------------|
| [Data Model](./02-data-model.md) | New entities added to schema |
| [Architecture](./01-architecture.md) | Regulation Layer in system diagram |
| [Design Workspace](./05-design-workspace.md) | AttributeTemplate → RuleTemplate linking |
| [Compliance Workspace](./08-compliance-workspace.md) | PreFlightAuditService, ForensicSealView |
| [Billing](./12-billing.md) | Marketplace revenue model |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 1.3 | 2026-01-21 | Added Approval Gate workflow: evaluation timing (Section 6.0), profile resolution hierarchy (Section 6.1), SYSTEM_PROFILE_REQUIRED blocker (Section 6.2), evaluateVersion() method for design-time evaluation |
| 1.2 | 2026-01-21 | Added per-rule granularity (Section 3): RuleOverrideMode, resolution hierarchy, Compliance MANAGER governance, future Request+Approval workflow |
| 1.1 | 2026-01-21 | Added Feature Toggles (Section 3): hidden/silent/enforcing modes, opt-in gentle defaults |
| 1.0 | 2026-01-21 | Initial design: Regulatory Advisor model with template hierarchy, soft gates, PDF anchoring, marketplace |
