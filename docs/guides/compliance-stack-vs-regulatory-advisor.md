# Compliance Architecture: How It All Fits Together

> Understanding how Category, Regulation, Requirement, and Evaluation work together

**Last Updated:** 2026-01-28

---

## Executive Summary

EuroComply's compliance system has a layered architecture:

| Layer | Purpose | Status |
|-------|---------|--------|
| **Category Configuration** | "What data to collect + what regulations apply" | Partially Implemented |
| **Compliance Stack** | "Resolve effective requirements for a tenant" | Needs Revision |
| **Regulatory Advisor** | "Evaluate product and record evidence" | Designed, Not Built |

**Key Insight from Design Review:** The system uses a **hybrid evaluation model**:
- **Auto-check** where we have structured data
- **Declaration/attestation** where we don't
- **Evidence collection** for everything

---

## Part 1: The Complete Architecture

### 1.1 Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CATEGORY CONFIGURATION                            │
│                                                                             │
│  Category "Textiles > Apparel"                                              │
│      │                                                                      │
│      ├── AttributeTemplate[]        "What data to collect"                  │
│      │   • recycled_content_pct     (NUMBER, required)                      │
│      │   • durability_score         (NUMBER, required)                      │
│      │   • fiber_composition        (TEXT, required)                        │
│      │                                                                      │
│      └── Regulation[]               "What regulations apply"                │
│          • ESPR                                                             │
│          • REACH                                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REGULATION STRUCTURE                                │
│                                                                             │
│  Regulation "ESPR"                                                          │
│      │                                                                      │
│      ├── status: ACTIVE             (DRAFT | ACTIVE | ARCHIVED)             │
│      │                                                                      │
│      └── Requirement[]              "What must be proven"                   │
│          │                                                                  │
│          ├── ATTRIBUTE_CHECK        "recycled_content_pct >= 25%"           │
│          │   └── references: AttributeTemplate                              │
│          │                                                                  │
│          ├── SUBSTANCE_SCREEN       "No SVHC above 0.1%"                    │
│          │   └── references: SubstanceList (REACH SVHC)                     │
│          │                                                                  │
│          ├── CALCULATED_CHECK       "Total recycled content from BOM"       │
│          │   └── formula: sum(material.recycled_pct * material.weight_pct)  │
│          │                                                                  │
│          └── DECLARATION            "Confirm durability testing done"       │
│              └── evidence: Upload test report                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRODUCT DATA                                   │
│                                                                             │
│  Product                                                                    │
│      │                                                                      │
│      ├── Attributes (from templates)                                        │
│      │   • recycled_content_pct: 30                                         │
│      │   • durability_score: 4                                              │
│      │                                                                      │
│      └── BOM (Bill of Materials)                                            │
│          ├── Material: "Recycled Polyester" 60%                             │
│          │   └── Substances: [PET] ← Known in our database                  │
│          ├── Material: "Elastane" 35%                                       │
│          │   └── Substances: [Polyurethane] ← Known                         │
│          └── Material: "Blue Dye #7" 5%                                     │
│              └── Substances: [?] ← Unknown, needs SDS upload                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLIANCE EVALUATION (Hybrid Model)                     │
│                                                                             │
│  Requirement Type         Data Source              Evaluation               │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ATTRIBUTE_CHECK          Direct attribute         Auto-check value         │
│  "recycled >= 25%"        → 30%                    → 30 >= 25 ✓ PASS       │
│                                                                             │
│  CALCULATED_CHECK         Derived from BOM         Auto-calculate + check   │
│  "total recycled %"       → sum(materials)         → 36% ✓ PASS            │
│                                                                             │
│  SUBSTANCE_SCREEN         BOM substances           Match against registers  │
│  "no SVHC > 0.1%"         → [PET, Polyurethane]    → Not on list ✓ PASS    │
│                                                                             │
│  SUBSTANCE_SCREEN         Unknown substance        Request evidence         │
│  (same requirement)       → "Blue Dye #7"          → "Upload SDS"          │
│                                                                             │
│  DECLARATION              User attestation         Record + evidence        │
│  "durability tested"      → User clicks "Yes"      → Store with evidence    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DPP (AUDIT TRAIL)                                 │
│                                                                             │
│  Record everything:                                                         │
│  • Auto-check results (PASS/FAIL + values checked)                          │
│  • Substance screening results (matched/not found)                          │
│  • User declarations (attestations + justifications)                        │
│  • Uploaded evidence (SDS, certificates, test reports)                      │
│  • Timestamps + who did what                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Design Principles

| Principle | Explanation |
|-----------|-------------|
| **Regulation owns Requirements** | SubstanceLists are accessed via Regulation, not directly from Category. This ensures every compliance check has legal context. |
| **Hybrid Evaluation** | Auto-check where data exists, guide user to declare/upload where it doesn't. |
| **Category defines data shape** | AttributeTemplates on Category tell users what data to provide. |
| **Evidence for everything** | Even auto-checks record what was checked. Declarations require justification/uploads. |
| **Tenant override layer** | Tenants can add requirements, exempt from others (with audit trail). |

---

## Part 2: The Compliance Stack (Tenant Resolution Layer)

### 2.1 Purpose

The Compliance Stack resolves **which requirements effectively apply** to a tenant's category, considering:
- System baseline (what platform says applies)
- Tenant additions (extra requirements tenant adds)
- Tenant exemptions (requirements tenant is exempt from)

### 2.2 Current Implementation (Needs Revision)

**What we built:**
```
Category → CategoryRegulatoryList → RegulatoryList (SubstanceList)
```

**Problem:** This maps Category directly to SubstanceList, bypassing the Regulation entity. This creates "double mapping" - Category maps to both Regulations and SubstanceLists.

### 2.3 Revised Design

**Category should map to Regulation, not directly to SubstanceList:**

```
Category → CategoryRegulation → Regulation
                                    │
                                    └── Requirement[]
                                            │
                                            ├── SUBSTANCE_SCREEN → SubstanceList
                                            ├── ATTRIBUTE_CHECK → AttributeTemplate
                                            └── DECLARATION → (evidence spec)
```

**Why this is better:**
- SubstanceList always has legal context (which Regulation requires it)
- Single mapping path (DRY principle)
- Easier to understand: "REACH applies to this category" vs "This category must check against SVHC list"

### 2.4 Three-Layer Resolution (Revised)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLIANCE STACK RESOLUTION (Revised)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Layer 1: SYSTEM BASELINE                                                   │
│  ────────────────────────                                                   │
│  CategoryRegulation links system categories to regulations                  │
│  Example: "cosmetics" category → REACH, CosIng, ESPR                        │
│  Each Regulation brings its Requirements (substance screens, attr checks)   │
│                                                                             │
│  Layer 2: TENANT ADDITIONS                                                  │
│  ─────────────────────────                                                  │
│  TenantCategoryRegulation with source=TENANT_ADDED                          │
│  Example: Tenant adds "California Prop 65" regulation for US sales          │
│                                                                             │
│  Layer 3: TENANT EXEMPTIONS                                                 │
│  ─────────────────────────                                                  │
│  TenantCategoryRequirementExemption for specific requirements               │
│  Example: Tenant exempts "REACH SVHC screen" for products sold outside EU   │
│  (Exemption recorded with reason, legal ref, who approved)                  │
│                                                                             │
│  OUTPUT: EffectiveRequirement[]                                             │
│  ──────────────────────────────                                             │
│  [                                                                          │
│    { requirement: "SVHC_SCREEN", regulation: "REACH", status: "ACTIVE" },   │
│    { requirement: "ANNEX_II_CHECK", regulation: "CosIng", status: "ACTIVE"},│
│    { requirement: "RECYCLED_MIN", regulation: "ESPR", status: "EXEMPTED" }, │
│  ]                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: The Regulatory Advisor (Evaluation Engine)

### 3.1 Purpose

The Regulatory Advisor **evaluates products** against their effective requirements and **records evidence**.

**It is NOT being scrapped.** The core concept is valid. What changed is:
- Clearer understanding of the data model feeding into it
- Hybrid evaluation approach (auto-check + declaration)
- Integration with BOM for substance data

### 3.2 Requirement Types

| Type | What It Checks | Data Source | Evaluation Method |
|------|----------------|-------------|-------------------|
| `ATTRIBUTE_CHECK` | Product attribute meets threshold | Product.attributes | Auto-compare value |
| `CALCULATED_CHECK` | Derived value meets threshold | BOM rollup calculation | Auto-calculate + compare |
| `SUBSTANCE_SCREEN` | No restricted substances above limit | BOM substances | Match against register |
| `DECLARATION` | User attests something is true | User input | Record attestation + evidence |

### 3.3 Hybrid Evaluation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HYBRID EVALUATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  For each Requirement:                                                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ATTRIBUTE_CHECK                                                      │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ IF attribute value exists:                                          │   │
│  │   → Auto-evaluate against rule                                      │   │
│  │   → Record: { result: PASS/FAIL, value: 30, threshold: 25 }        │   │
│  │ IF attribute missing:                                               │   │
│  │   → Prompt: "Please provide recycled_content_pct"                   │   │
│  │   → Or mark as INCOMPLETE                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ SUBSTANCE_SCREEN                                                     │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ FOR each substance in BOM:                                          │   │
│  │   IF substance in our register:                                     │   │
│  │     → Check if on restricted list                                   │   │
│  │     → Auto-evaluate concentration vs threshold                      │   │
│  │     → Record: { result: PASS/FAIL, cas: "...", conc: 0.05% }       │   │
│  │   IF substance NOT in register:                                     │   │
│  │     → Flag for user: "Unknown substance: Blue Dye #7"              │   │
│  │     → Request: "Upload SDS to verify not restricted"               │   │
│  │     → Or: "Declare this is not on [SVHC list]"                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DECLARATION                                                          │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ Present question to user:                                           │   │
│  │   "Has durability testing been completed per ESPR Annex I?"        │   │
│  │   [ ] Yes  [ ] No  [ ] Not Applicable                              │   │
│  │   [Upload test report]                                              │   │
│  │                                                                      │   │
│  │ Record: { answer: "Yes", evidence: "report.pdf", by: "user@...",   │   │
│  │           at: "2026-01-28T..." }                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 BOM Integration

The BOM (Bill of Materials) is the source of substance data:

```
Product
└── BOM
    ├── Material: "Recycled Polyester" (60% of product)
    │   ├── recycled: true
    │   └── Substances:
    │       └── PET (100% of material)
    │
    ├── Material: "Elastane" (35% of product)
    │   ├── recycled: false
    │   └── Substances:
    │       └── Polyurethane (100% of material)
    │
    └── Material: "Blue Dye #7" (5% of product)
        ├── recycled: false
        └── Substances:
            └── ??? (unknown - needs SDS)
```

**Substance rollup calculation:**
```
For each substance in BOM:
  concentration_in_product = material_pct × substance_pct_in_material

Example:
  PET in product = 60% × 100% = 60%
  Polyurethane in product = 35% × 100% = 35%
```

**Calculated attribute example (total recycled content):**
```
recycled_content = sum(material.weight_pct for material where material.recycled)
                 = 60% (only Recycled Polyester is recycled)
```

---

## Part 4: Regulation Lifecycle

### 4.1 Status Values

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        REGULATION LIFECYCLE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DRAFT ──────────▶ ACTIVE ──────────▶ ARCHIVED                              │
│                                                                             │
│  • Being prepared   • Can be mapped      • No new mappings                  │
│  • Not visible to     to categories      • Existing mappings preserved      │
│    tenants          • Full evaluation    • Historical compliance intact     │
│  • Platform admin   • Requirements       • Optionally points to successor   │
│    only               enforced                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Mapping Rules

| Action | DRAFT | ACTIVE | ARCHIVED |
|--------|-------|--------|----------|
| Create new Category → Regulation mapping | No | Yes | No |
| Existing mappings continue to work | - | Yes | Yes |
| Evaluate compliance | No | Yes | Yes (historical) |
| Show in "available regulations" list | No | Yes | No |

### 4.3 Succession

When a regulation is archived (repealed/replaced):

```typescript
@Entity()
class Regulation {
  @Enum(() => RegulationStatus)
  status: RegulationStatus;

  // When archived, optionally point to replacement
  @ManyToOne(() => Regulation, { nullable: true })
  supersededBy?: Regulation;

  @Property({ nullable: true })
  archivedAt?: Date;

  @Property({ nullable: true })
  archiveReason?: string; // "Repealed", "Replaced by ESPR v2", etc.
}
```

---

## Part 5: Consistency Checks

### 5.1 Input Dependency Check

When a Regulation is mapped to a Category, the system should verify:

```
Regulation "ESPR" requires:
  - AttributeTemplate "recycled_content_pct"
  - AttributeTemplate "durability_score"

Category "Apparel" has:
  - AttributeTemplate "recycled_content_pct" ✓
  - AttributeTemplate "durability_score" ✗ MISSING

Alert: "Category 'Apparel' is missing required AttributeTemplate: durability_score"
Action: Auto-add template OR block mapping until resolved
```

### 5.2 Implementation

```typescript
async function validateRegulationMapping(
  categoryId: string,
  regulationId: string
): Promise<ValidationResult> {
  const category = await getCategory(categoryId);
  const regulation = await getRegulation(regulationId);

  const missingAttributes: string[] = [];

  for (const requirement of regulation.requirements) {
    if (requirement.type === 'ATTRIBUTE_CHECK') {
      const hasAttribute = category.attributeTemplates.some(
        t => t.key === requirement.attributeTemplateKey
      );
      if (!hasAttribute) {
        missingAttributes.push(requirement.attributeTemplateKey);
      }
    }
  }

  return {
    valid: missingAttributes.length === 0,
    missingAttributes,
    suggestion: missingAttributes.length > 0
      ? `Add these AttributeTemplates to Category: ${missingAttributes.join(', ')}`
      : null
  };
}
```

---

## Part 6: What Changes Are Needed

### 6.1 Does RegulatoryAdvisor Need Rewriting?

**No, but it needs updating:**

| Aspect | Keep | Update |
|--------|------|--------|
| Core concept (evaluation engine) | ✓ | |
| PreFlight evaluation flow | ✓ | |
| Finding generation | ✓ | |
| Soft gates / enforcement modes | ✓ | |
| RuleTemplate entity | | Rename to Requirement, add types |
| Data model | | Regulation entity, unified Requirements |
| Evaluation logic | | Add hybrid (auto + declaration) |
| BOM integration | | Add substance rollup from BOM |

### 6.2 What We Built That Needs Revision

| Current | Change To |
|---------|-----------|
| `CategoryRegulatoryList` (Category → SubstanceList) | `CategoryRegulation` (Category → Regulation) |
| `TenantCategoryRegulatoryList` | `TenantCategoryRegulation` + `TenantRequirementExemption` |
| `ComplianceStackResolver` returns `EffectiveRegulation[]` (lists) | Returns `EffectiveRequirement[]` |

### 6.3 Summary of Changes

```
CURRENT:
Category ──→ CategoryRegulatoryList ──→ RegulatoryList (SubstanceList)
                                              ↑
                                        (no legal context)

REVISED:
Category ──→ CategoryRegulation ──→ Regulation
                                        │
                                        └──→ Requirement[]
                                                  │
                                                  ├── SUBSTANCE_SCREEN → SubstanceList
                                                  ├── ATTRIBUTE_CHECK → AttributeTemplate
                                                  └── DECLARATION → (evidence spec)
```

---

## Part 7: Entity Model Summary

### 7.1 Revised Entity Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENTITY RELATIONSHIPS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PUBLIC SCHEMA (Platform-managed)                                           │
│  ────────────────────────────────                                           │
│                                                                             │
│  Category                                                                   │
│    ├── AttributeTemplate[] (1:N) - what data to collect                     │
│    └── CategoryRegulation[] (M:N via junction) - what regulations apply     │
│                                                                             │
│  Regulation                                                                 │
│    ├── status: DRAFT | ACTIVE | ARCHIVED                                    │
│    ├── supersededBy?: Regulation                                            │
│    └── Requirement[] (1:N) - what must be proven                            │
│                                                                             │
│  Requirement                                                                │
│    ├── type: ATTRIBUTE_CHECK | SUBSTANCE_SCREEN | CALCULATED_CHECK |        │
│    │         DECLARATION                                                    │
│    ├── attributeTemplate?: AttributeTemplate (for ATTRIBUTE_CHECK)          │
│    ├── substanceList?: SubstanceList (for SUBSTANCE_SCREEN)                 │
│    ├── calculationFormula?: string (for CALCULATED_CHECK)                   │
│    ├── validationRule: { operator, threshold, ... }                         │
│    └── severity: BLOCKER | WARNING | INFO                                   │
│                                                                             │
│  SubstanceList (was RegulatoryList)                                         │
│    └── SubstanceListEntry[] (1:N) - individual substances with thresholds   │
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────    │
│                                                                             │
│  TENANT SCHEMA (Tenant-specific)                                            │
│  ───────────────────────────────                                            │
│                                                                             │
│  TenantCategory                                                             │
│    ├── systemCategoryId?: links to public Category                          │
│    ├── linkMode: LIVE | FROZEN | DETACHED                                   │
│    └── TenantCategoryRegulation[] - additions beyond system baseline        │
│                                                                             │
│  TenantRequirementExemption                                                 │
│    ├── requirement: Requirement being exempted                              │
│    ├── reason: string                                                       │
│    ├── legalRef?: string                                                    │
│    ├── exemptedBy: string                                                   │
│    └── exemptedAt: Date                                                     │
│                                                                             │
│  ComplianceEvidence                                                         │
│    ├── product: Product                                                     │
│    ├── requirement: Requirement                                             │
│    ├── type: AUTO_CHECK | DECLARATION | DOCUMENT                            │
│    ├── result: PASS | FAIL | ATTESTED                                       │
│    ├── details: { value, threshold, ... } or { attestation, ... }          │
│    ├── documentKey?: string (uploaded file reference)                       │
│    └── recordedAt: Date                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Glossary

| Term | Definition |
|------|------------|
| **Compliance Stack** | The tenant resolution layer that determines effective requirements |
| **Regulatory Advisor** | The evaluation engine that checks products and records evidence |
| **Regulation** | A legal framework (ESPR, REACH, CosIng) with status lifecycle |
| **Requirement** | A specific thing that must be proven for compliance |
| **AttributeTemplate** | A predefined data field for a category |
| **SubstanceList** | A list of substances with restrictions (was RegulatoryList) |
| **BOM** | Bill of Materials - components and substances in a product |
| **Hybrid Evaluation** | Auto-check where possible, declaration where not |
| **Evidence** | Proof of compliance (auto-check result, declaration, document) |
| **Exemption** | Tenant-level exception from a requirement (with audit trail) |

---

## Related Documentation

- [Regulatory Advisor Design](../plans/13-regulatory-advisor.md) - Full design spec (needs update)
- [Regulatory Vertical System](./regulatory-vertical-system-explained.md) - System overview
- [Implementation Plan](../plans/compliance-architecture-revision.md) - Migration plan (to be created)

---

*Document Version: 2.0*
*Last Updated: 2026-01-28*
*Major Revision: Unified architecture from design review session*
