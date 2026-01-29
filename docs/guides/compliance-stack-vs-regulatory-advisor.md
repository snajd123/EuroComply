# Compliance Architecture: How It All Fits Together

> Understanding how Category, Regulation, Requirement, and Evaluation work together

**Last Updated:** 2026-01-28

---

## Executive Summary

EuroComply's compliance system has a layered architecture:

| Layer | Purpose | Status |
|-------|---------|--------|
| **Category Configuration** | "What data to collect + what regulations apply" | Implemented |
| **Compliance Stack** | "Resolve effective requirements for a tenant" | Implemented |
| **Evaluation Engine** | "Evaluate product and record evidence" | Implemented |

**Key Design Principle:** The system uses a **hybrid evaluation model**:
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
│          • ESPR                     (via CategoryRegulation junction)       │
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
│          │   ├── attributeTemplateKey: "recycled_content_pct" (entity field)│
│          │   └── handlerConfig: { operator: ">=", threshold: 25 }           │
│          │                                                                  │
│          ├── SUBSTANCE_SCREEN       "No SVHC above 0.1%"                    │
│          │   ├── substanceListId: "svhc-candidate-list" (entity field)      │
│          │   └── handlerConfig: { defaultThresholdPct: 0.1 }                │
│          │                                                                  │
│          ├── CALCULATED_CHECK       "Total recycled content from BOM"       │
│          │   ├── calculationFormula: "..." (entity field)                   │
│          │   └── handlerConfig: { formula, variables, threshold }           │
│          │                                                                  │
│          └── DECLARATION            "Confirm durability testing done"       │
│              └── handlerConfig: { question, acceptedAnswers[], requiresDoc }│
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
│                           EVIDENCE (AUDIT TRAIL)                            │
│                                                                             │
│  ComplianceEvidence records everything:                                     │
│  • Auto-check results (PASS/FAIL + values checked)                          │
│  • Substance screening results (matched/not found)                          │
│  • User declarations (attestations + justifications)                        │
│  • Uploaded evidence (SDS, certificates, test reports)                      │
│  • Requirement snapshot (frozen at evaluation time)                         │
│  • Timestamps + who did what                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Design Principles

| Principle | Explanation |
|-----------|-------------|
| **Regulation owns Requirements** | SubstanceLists are accessed via Regulation → Requirement, not directly from Category. This ensures every compliance check has legal context. |
| **Hybrid Evaluation** | Auto-check where data exists, guide user to declare/upload where it doesn't. |
| **Category defines data shape** | AttributeTemplates on Category tell users what data to provide. |
| **Evidence for everything** | Even auto-checks record what was checked. Declarations require justification/uploads. |
| **Requirement snapshots** | Evidence captures requirement state at evaluation time for audit integrity. |
| **Tenant override layer** | Tenants can exempt from requirements (with audit trail and guardrails). |

---

## Part 2: The Compliance Stack (Tenant Resolution Layer)

### 2.1 Purpose

The Compliance Stack resolves **which requirements effectively apply** to a tenant's category, considering:
- System baseline (what platform says applies via CategoryRegulation)
- LTREE inheritance (requirements from parent categories)
- Tenant exemptions (requirements tenant is exempt from)

### 2.2 Current Implementation

**Architecture:**
```
Category → CategoryRegulation → Regulation
                                    │
                                    └── Requirement[]
                                            │
                                            ├── SUBSTANCE_SCREEN → references SubstanceList
                                            ├── ATTRIBUTE_CHECK → references AttributeTemplate
                                            └── DECLARATION → (evidence spec in handlerConfig)
```

**Key entities:**
- `CategoryRegulation` - Junction table linking Category to Regulation (public schema)
- `Regulation` - Legal framework with status lifecycle (public schema)
- `Requirement` - Specific compliance check with handler configuration (public schema)
- `TenantRequirementExemption` - Tenant exemptions with audit trail (tenant schema)

### 2.3 LTREE Inheritance

Categories use PostgreSQL LTREE for hierarchical inheritance:

```
packaging                         ← REACH applies here
    │
    └── packaging.plastic         ← ESPR also applies here
            │
            └── packaging.plastic.pet  ← Tenant's category inherits BOTH
```

The `ComplianceStackResolver` uses the LTREE `<@` operator to find all ancestor regulations:

```sql
SELECT DISTINCT cr.regulation_id, r.code
FROM category_regulation cr
JOIN category c ON c.id = cr.category_id
JOIN regulation r ON r.id = cr.regulation_id
WHERE 'packaging.plastic.pet'::ltree <@ c.path
  AND r.status = 'ACTIVE'
```

### 2.4 Three-Layer Resolution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLIANCE STACK RESOLUTION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Layer 1: SYSTEM BASELINE                                                   │
│  ────────────────────────                                                   │
│  CategoryRegulation links system categories to regulations                  │
│  LTREE inheritance: child categories get parent regulations                 │
│  Example: "cosmetics.skincare" inherits from "cosmetics"                    │
│                                                                             │
│  Layer 2: REQUIREMENT COLLECTION                                            │
│  ───────────────────────────────                                            │
│  Each Regulation brings its Requirements                                    │
│  Requirements have type, severity, handlerConfig, allowTenantExemption      │
│                                                                             │
│  Layer 3: TENANT EXEMPTIONS                                                 │
│  ─────────────────────────                                                  │
│  TenantRequirementExemption marks specific requirements as EXEMPTED         │
│  Exemptions include: reason, legalReference, exemptedBy, exemptedAt         │
│  Guardrail: Requirements with allowTenantExemption=false cannot be exempted │
│                                                                             │
│  OUTPUT: ComplianceStackResultRevised                                       │
│  ────────────────────────────────────                                       │
│  {                                                                          │
│    tenantCategoryId: "uuid",                                                │
│    regulations: [                                                           │
│      {                                                                      │
│        regulationId: "uuid",                                                │
│        regulationCode: "REACH",                                             │
│        source: "SYSTEM",                                                    │
│        requirements: [                                                      │
│          { code: "SVHC_SCREEN", status: "ACTIVE", type: "SUBSTANCE_SCREEN"},│
│          { code: "RECYCLED_MIN", status: "EXEMPTED", exemption: {...} }     │
│        ]                                                                    │
│      }                                                                      │
│    ]                                                                        │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 API Endpoint

```bash
GET /api/v1/compliance-stack/:tenantCategoryId

# Response
{
  "success": true,
  "data": {
    "tenantCategoryId": "...",
    "regulations": [...]
  }
}
```

---

## Part 3: The Evaluation Engine (Handler Plugins)

### 3.1 Purpose

The Evaluation Engine **evaluates products** against their effective requirements using pluggable handlers.

**Architecture principle:** Separate HOW (handlers) from WHAT (requirements):
- **Handlers** are code that knows how to evaluate a type of requirement
- **Requirements** are data that specifies what to check
- New regulations = just add data, no code changes

### 3.2 Requirement Types and Handlers

| Type | Handler | What It Checks | Data Source |
|------|---------|----------------|-------------|
| `ATTRIBUTE_CHECK` | `AttributeCheckHandler` | Product attribute meets threshold | Product.attributes |
| `SUBSTANCE_SCREEN` | `SubstanceScreenHandler` | No restricted substances above limit | Product substances |
| `DECLARATION` | `DeclarationHandler` | User attests something is true | User input |
| `CALCULATED_CHECK` | (future) | Derived value meets threshold | BOM rollup |

### 3.3 Handler Interface

```typescript
interface RequirementHandler {
  type: RequirementType;
  evaluate(context: EvaluationContext): Promise<EvaluationResult>;
  validateConfig(config: unknown, requirement: Requirement): ValidationResult;
}

interface EvaluationResult {
  status: 'PASS' | 'FAIL' | 'INCOMPLETE';
  details: Record<string, unknown>;
}
```

### 3.4 Hybrid Evaluation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HYBRID EVALUATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  For each Requirement:                                                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ATTRIBUTE_CHECK (AttributeCheckHandler)                             │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ IF attribute value exists:                                          │   │
│  │   → Compare using operator (>=, <=, >, <, ==, !=)                   │   │
│  │   → Return: PASS or FAIL with details                               │   │
│  │ IF attribute missing:                                               │   │
│  │   → Return: INCOMPLETE with reason                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ SUBSTANCE_SCREEN (SubstanceScreenHandler)                           │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ FOR each substance in product:                                      │   │
│  │   → Check if on restricted list                                     │   │
│  │   → Compare concentration vs threshold                              │   │
│  │ IF any violations found:                                            │   │
│  │   → Return: FAIL with violation details                             │   │
│  │ ELSE:                                                               │   │
│  │   → Return: PASS                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DECLARATION (DeclarationHandler)                                    │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ IF user has answered the question:                                  │   │
│  │   → Check if answer is in acceptedAnswers                           │   │
│  │   → Check if document uploaded (if required)                        │   │
│  │   → Return: PASS (ATTESTED) or FAIL                                 │   │
│  │ IF not answered:                                                    │   │
│  │   → Return: INCOMPLETE                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Exemptions and Guardrails

### 4.1 Exemption System

Tenants can exempt from specific requirements for legitimate business reasons:

```bash
POST /api/v1/exemptions
{
  "tenantCategoryId": "uuid",
  "requirementId": "uuid",
  "reason": "Products sold outside EU markets",
  "legalReference": "ESPR Article 5.2 territorial scope"
}
```

### 4.2 Exemption Guardrail

Some requirements are too critical to exempt. The `allowTenantExemption` field controls this:

```typescript
// Requirement entity
@Property({ default: true })
allowTenantExemption: boolean = true;
```

**If `allowTenantExemption: false`:**
- API returns HTTP 403 Forbidden
- Error code: `EXEMPTION_NOT_ALLOWED`

**Example: REACH SVHC screening cannot be exempted** - it's a core safety requirement.

### 4.3 Exemption Audit Trail

Exemptions are never deleted, only revoked:

```typescript
// TenantRequirementExemption entity
exemptedBy: string;      // Who created it
exemptedAt: Date;        // When created
revokedAt?: Date;        // When revoked (null if active)
revokedBy?: string;      // Who revoked it
revocationReason?: string; // Why revoked
```

---

## Part 5: Evidence and Audit Trail

### 5.1 Why Evidence Matters

Auditors need proof: what was checked, when, by whom, and what the rules were at that time.

### 5.2 Requirement Snapshots

Requirements can change over time. Evidence records capture a **snapshot** of the requirement at evaluation time:

```typescript
// ComplianceEvidence entity
@Property({ type: 'jsonb' })
requirementSnapshot!: RequirementSnapshot;

interface RequirementSnapshot {
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
```

This ensures audit integrity even when requirements are updated later.

### 5.3 Evidence API

```bash
# Record evidence
POST /api/v1/evidence
{
  "productVersionId": "uuid",
  "requirementId": "uuid",
  "type": "AUTO_CHECK",
  "result": "PASS",
  "details": { "actualValue": 30, "threshold": 25, "operator": ">=" },
  "requirementSnapshot": { ... }
}

# Get evidence for product
GET /api/v1/evidence/:productVersionId
```

---

## Part 6: Entity Model Summary

### 6.1 Entity Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENTITY RELATIONSHIPS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PUBLIC SCHEMA (Platform-managed)                                           │
│  ────────────────────────────────                                           │
│                                                                             │
│  Category                                                                   │
│    ├── path: ltree (hierarchical)                                           │
│    ├── AttributeTemplate[] (1:N) - what data to collect                     │
│    └── CategoryRegulation[] (M:N via junction) - what regulations apply     │
│                                                                             │
│  Regulation                                                                 │
│    ├── code: unique identifier (e.g., "REACH", "ESPR")                      │
│    ├── status: DRAFT | ACTIVE | ARCHIVED                                    │
│    ├── supersededBy?: Regulation (for succession)                           │
│    └── Requirement[] (1:N) - what must be proven                            │
│                                                                             │
│  Requirement                                                                │
│    ├── code: unique within regulation                                       │
│    ├── type: ATTRIBUTE_CHECK | SUBSTANCE_SCREEN | DECLARATION | ...         │
│    ├── severity: BLOCKER | WARNING | INFO                                   │
│    ├── handlerConfig: jsonb (parameters for handler)                        │
│    └── allowTenantExemption: boolean (guardrail)                            │
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────    │
│                                                                             │
│  TENANT SCHEMA (Tenant-specific)                                            │
│  ───────────────────────────────                                            │
│                                                                             │
│  TenantCategory                                                             │
│    ├── systemCategoryId?: links to public Category                          │
│    └── linkMode: LIVE | FROZEN | DETACHED                                   │
│                                                                             │
│  TenantRequirementExemption                                                 │
│    ├── tenantCategory: TenantCategory                                       │
│    ├── requirementId: string (cross-schema reference)                       │
│    ├── reason, legalReference                                               │
│    ├── exemptedBy, exemptedAt                                               │
│    └── revokedAt, revokedBy, revocationReason (for revocation)              │
│                                                                             │
│  ComplianceEvidence                                                         │
│    ├── productVersionId: string                                             │
│    ├── requirementId?: string                                               │
│    ├── requirementSnapshot: jsonb (frozen at evaluation time)               │
│    ├── type: AUTO_CHECK | DECLARATION | DOCUMENT                            │
│    ├── result: PASS | FAIL | ATTESTED | INCOMPLETE                          │
│    ├── details: jsonb                                                       │
│    └── recordedBy, recordedAt                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 7: API Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/compliance-stack/:tenantCategoryId` | GET | Get effective requirements |
| `/api/v1/exemptions` | POST | Create exemption |
| `/api/v1/exemptions` | GET | List exemptions |
| `/api/v1/exemptions/:id` | GET | Get exemption |
| `/api/v1/exemptions/:id` | DELETE | Revoke exemption |
| `/api/v1/evidence` | POST | Record evidence |
| `/api/v1/evidence/:productVersionId` | GET | Get evidence for product |

---

## Appendix: Glossary

| Term | Definition |
|------|------------|
| **Compliance Stack** | The tenant resolution layer that determines effective requirements |
| **Evaluation Engine** | The handler-based system that checks products and records evidence |
| **Regulation** | A legal framework (ESPR, REACH, CosIng) with status lifecycle |
| **Requirement** | A specific thing that must be proven for compliance |
| **Handler** | Code that knows how to evaluate a specific requirement type |
| **handlerConfig** | JSON parameters passed to a handler (threshold, operator, etc.) |
| **AttributeTemplate** | A predefined data field for a category |
| **SubstanceList** | A list of substances with restrictions |
| **Hybrid Evaluation** | Auto-check where possible, declaration where not |
| **Evidence** | Proof of compliance with requirement snapshot |
| **Exemption** | Tenant-level exception from a requirement (with audit trail) |
| **Guardrail** | `allowTenantExemption: false` prevents exemption of critical requirements |

---

## Related Documentation

- [Compliance Evaluation System Guide](./compliance-evaluation-system.md) - Detailed implementation guide
- [Regulatory Vertical System](./regulatory-vertical-system-explained.md) - System overview
- [Implementation Plan](../plans/2026-01-28-compliance-architecture-revision.md) - How this was built
- [Compliance Architecture Reference](../compliance-architecture.md) - Technical reference

---

*Document Version: 3.0*
*Last Updated: 2026-01-28*
*Status: Reflects current implementation*
