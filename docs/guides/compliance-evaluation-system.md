# The Compliance Evaluation System: A Complete Guide

> How the regulation-agnostic engine evaluates products against requirements

**Last Updated:** 2026-01-28

---

## Table of Contents

1. [The Big Picture](#the-big-picture)
2. [Core Concepts](#core-concepts)
3. [How Requirements Work](#how-requirements-work)
4. [The Handler Plugin System](#the-handler-plugin-system)
5. [Compliance Stack Resolution](#compliance-stack-resolution)
6. [Category Adoption and Link Modes](#category-adoption-and-link-modes)
7. [Exemptions and Guardrails](#exemptions-and-guardrails)
8. [Evidence and Audit Trail](#evidence-and-audit-trail)
9. [API Reference](#api-reference)
10. [Data Flow Example](#data-flow-example)
11. [Adding New Regulations](#adding-new-regulations)

---

## The Big Picture

### What Problem Does This Solve?

Imagine you're a compliance officer at a cosmetics company. You need to ensure your products comply with:
- **REACH** - EU chemicals regulation (substance restrictions)
- **CosIng** - EU cosmetics regulation (prohibited ingredients)
- **ESPR** - EU ecodesign regulation (recycled content minimums)

Each regulation has dozens of requirements. Each requirement needs different data. Some can be auto-checked, others need human attestation.

**The compliance evaluation system handles all of this with a single, unified architecture.**

### The Key Insight: Separate HOW from WHAT

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REGULATION-AGNOSTIC ENGINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   CODE (HOW to evaluate)              DATA (WHAT to evaluate)               │
│   ──────────────────────              ───────────────────────               │
│                                                                             │
│   • AttributeCheckHandler             • Regulation: ESPR                    │
│     "Compare value to threshold"        • Requirement: recycled >= 25%      │
│                                                                             │
│   • SubstanceScreenHandler            • Regulation: REACH                   │
│     "Check against restricted list"     • Requirement: no SVHC > 0.1%       │
│                                                                             │
│   • DeclarationHandler                • Regulation: CosIng                  │
│     "Record user attestation"           • Requirement: no animal testing    │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   The HANDLERS are code (rarely changes)                                    │
│   The REGULATIONS are data (loaded from manifests, changes often)           │
│                                                                             │
│   To add a new regulation: just add data. No code changes needed.           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

This separation means:
- **New regulations** = just add JSON data
- **New requirement types** = add one handler, use it for unlimited requirements
- **Compliance updates** = update manifests, no code deployment

---

## Core Concepts

### The Entity Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENTITY HIERARCHY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Regulation                          "A legal framework"                   │
│   ├── code: "REACH"                   Unique identifier                     │
│   ├── name: "Registration, Evaluation..."                                   │
│   ├── status: ACTIVE                  DRAFT → ACTIVE → ARCHIVED             │
│   └── requirements[]                  What must be proven                   │
│                                                                             │
│       └── Requirement                 "A specific compliance check"         │
│           ├── code: "SVHC_SCREEN"     Unique within regulation              │
│           ├── type: SUBSTANCE_SCREEN  Which handler evaluates it            │
│           ├── severity: BLOCKER       BLOCKER | WARNING | INFO              │
│           ├── handlerConfig: {...}    Parameters for the handler            │
│           └── allowTenantExemption    Can tenants exempt from this?         │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   Category                            "Product taxonomy"                    │
│   ├── path: "cosmetics.skincare"      LTREE hierarchical path               │
│   └── CategoryRegulation[]            Which regulations apply               │
│                                                                             │
│       └── CategoryRegulation          "Links category to regulation"        │
│           ├── category                                                      │
│           └── regulation                                                    │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   ComplianceEvidence                  "Proof of evaluation"                 │
│   ├── productVersionId                Which product was checked             │
│   ├── requirementSnapshot             Frozen copy of requirement            │
│   ├── type: AUTO_CHECK                How it was evaluated                  │
│   ├── result: PASS                    What happened                         │
│   └── details: {...}                  The specifics                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Status Lifecycle

Regulations have a lifecycle that controls how they can be used:

```
     ┌──────────┐          ┌──────────┐          ┌──────────┐
     │  DRAFT   │ ──────▶  │  ACTIVE  │ ──────▶  │ ARCHIVED │
     └──────────┘          └──────────┘          └──────────┘
          │                     │                     │
          │                     │                     │
          ▼                     ▼                     ▼
     Platform admins       Can be mapped         No new mappings
     preparing new         to categories         Historical data
     regulation            Evaluated             preserved
```

| Status | Can Create New Mappings? | Evaluated? | Visible to Tenants? |
|--------|--------------------------|------------|---------------------|
| DRAFT | No | No | No |
| ACTIVE | Yes | Yes | Yes |
| ARCHIVED | No | Yes (historical) | No (new) |

---

## How Requirements Work

### The Four Requirement Types

Each requirement has a `type` that determines which handler evaluates it:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        REQUIREMENT TYPES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ATTRIBUTE_CHECK                                                           │
│   ───────────────                                                           │
│   "Does a product attribute meet a threshold?"                              │
│                                                                             │
│   Example: "Recycled content must be at least 25%"                          │
│   handlerConfig: {                                                          │
│     operator: ">=",                                                         │
│     threshold: 25,                                                          │
│     attributeCode: "recycled_content_pct"                                   │
│   }                                                                         │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   SUBSTANCE_SCREEN                                                          │
│   ────────────────                                                          │
│   "Does the product contain restricted substances above threshold?"         │
│                                                                             │
│   Example: "No SVHC substances above 0.1%"                                  │
│   handlerConfig: {                                                          │
│     substanceListId: "reach-svhc-list-uuid",                                │
│     defaultThresholdPct: 0.1                                                │
│   }                                                                         │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   DECLARATION                                                               │
│   ───────────                                                               │
│   "Has the user attested to something?"                                     │
│                                                                             │
│   Example: "Product was not tested on animals"                              │
│   handlerConfig: {                                                          │
│     question: "Has this product been tested on animals?",                   │
│     acceptedAnswers: ["No"],                                                │
│     requiresDocument: false                                                 │
│   }                                                                         │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   CALCULATED_CHECK (future)                                                 │
│   ─────────────────────────                                                 │
│   "Does a calculated value meet a threshold?"                               │
│                                                                             │
│   Example: "Total weight of recycled materials in BOM >= 30%"               │
│   handlerConfig: {                                                          │
│     formula: "sum(materials.weight * materials.recycled_pct)",              │
│     operator: ">=",                                                         │
│     threshold: 30                                                           │
│   }                                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Severity Levels

Requirements have severity that affects how failures are treated:

| Severity | Meaning | UI Treatment | Can Block Publish? |
|----------|---------|--------------|-------------------|
| **BLOCKER** | Must pass for compliance | Red error | Yes |
| **WARNING** | Should pass, investigate | Yellow warning | Configurable |
| **INFO** | Good to know | Blue info | No |

---

## The Handler Plugin System

### How Handlers Work

Each requirement type has a dedicated handler that knows how to evaluate it:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HANDLER ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   RequirementEvaluatorEngine (Registry)                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                     │   │
│   │   handlers = Map<RequirementType, RequirementHandler>               │   │
│   │                                                                     │   │
│   │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │   │
│   │   │ ATTRIBUTE_CHECK │  │ SUBSTANCE_SCREEN│  │   DECLARATION   │    │   │
│   │   │       ↓         │  │        ↓        │  │        ↓        │    │   │
│   │   │ AttributeCheck  │  │ SubstanceScreen │  │  Declaration    │    │   │
│   │   │    Handler      │  │     Handler     │  │    Handler      │    │   │
│   │   └─────────────────┘  └─────────────────┘  └─────────────────┘    │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   evaluate(context):                                                        │
│   1. Look up handler for context.requirement.type                           │
│   2. Call handler.evaluate(context)                                         │
│   3. Return result (PASS | FAIL | INCOMPLETE)                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The RequirementHandler Interface

Every handler implements this interface:

```typescript
interface RequirementHandler {
  // Which requirement type this handler evaluates
  type: RequirementType;

  // Evaluate a requirement against product data
  evaluate(context: EvaluationContext): Promise<EvaluationResult>;

  // Validate handler configuration
  validateConfig(config: unknown, requirement: Requirement): ValidationResult;
}

interface EvaluationContext {
  requirement: Requirement;
  product: {
    attributes: Record<string, unknown>;
    substances: Array<{ casNumber: string; concentrationPct: number }>;
    declarations: Record<string, { answer: string; documentKey?: string }>;
  };
}

interface EvaluationResult {
  status: 'PASS' | 'FAIL' | 'INCOMPLETE';
  details: Record<string, unknown>;
}
```

### Example: AttributeCheckHandler

```typescript
// Simplified implementation
class AttributeCheckHandler implements RequirementHandler {
  type = RequirementType.ATTRIBUTE_CHECK;

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const config = context.requirement.handlerConfig;
    const { operator, threshold, attributeCode } = config;

    // Get the attribute value from the product
    const actualValue = context.product.attributes[attributeCode];

    // If attribute is missing, evaluation is incomplete
    if (actualValue === undefined) {
      return {
        status: 'INCOMPLETE',
        details: { reason: `Missing attribute: ${attributeCode}` }
      };
    }

    // Compare using the configured operator
    const passed = this.compare(actualValue, operator, threshold);

    return {
      status: passed ? 'PASS' : 'FAIL',
      details: {
        actualValue,
        threshold,
        operator,
        attributeCode
      }
    };
  }

  private compare(actual: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>=': return actual >= threshold;
      case '<=': return actual <= threshold;
      case '>':  return actual > threshold;
      case '<':  return actual < threshold;
      case '==': return actual === threshold;
      case '!=': return actual !== threshold;
      default:   return false;
    }
  }
}
```

### Adding a New Handler

To support a new requirement type:

1. **Create the handler class** implementing `RequirementHandler`
2. **Register it** in `RequirementEvaluatorEngine`
3. **That's it** - no other code changes needed

```typescript
// 1. Create handler
class MyNewHandler implements RequirementHandler {
  type = RequirementType.MY_NEW_TYPE;
  // ...implement evaluate() and validateConfig()
}

// 2. Register in createEvaluatorEngine()
engine.register(new MyNewHandler());

// 3. Use it by adding requirements with type: MY_NEW_TYPE
```

---

## Compliance Stack Resolution

### What is the Compliance Stack?

The "compliance stack" is the **effective set of requirements** that apply to a tenant's category after considering:

1. **System baseline** - What the platform says applies (via CategoryRegulation)
2. **LTREE inheritance** - Requirements from parent categories
3. **Tenant exemptions** - Requirements the tenant is exempted from

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLIANCE STACK RESOLUTION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   System Category Hierarchy (LTREE)                                         │
│   ─────────────────────────────────                                         │
│                                                                             │
│   packaging                         ← REACH applies here                    │
│       │                                                                     │
│       └── packaging.plastic         ← ESPR applies here                     │
│               │                                                             │
│               └── packaging.plastic.pet  ← Tenant's category                │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   Resolution Process:                                                       │
│                                                                             │
│   1. Find all ancestor categories using LTREE:                              │
│      'packaging.plastic.pet' <@ c.path                                      │
│      → Returns: packaging, packaging.plastic, packaging.plastic.pet         │
│                                                                             │
│   2. Get all regulations mapped to those categories:                        │
│      → REACH (from packaging)                                               │
│      → ESPR (from packaging.plastic)                                        │
│                                                                             │
│   3. Get all requirements from those regulations:                           │
│      → REACH.SVHC_SCREEN                                                    │
│      → REACH.ANNEX_XVII                                                     │
│      → ESPR.RECYCLED_CONTENT_MIN                                            │
│      → ESPR.DURABILITY_DECL                                                 │
│                                                                             │
│   4. Apply tenant exemptions:                                               │
│      → ESPR.RECYCLED_CONTENT_MIN is EXEMPTED (tenant got an exemption)      │
│                                                                             │
│   5. Return effective requirements:                                         │
│      [                                                                      │
│        { code: "SVHC_SCREEN", status: "ACTIVE" },                           │
│        { code: "ANNEX_XVII", status: "ACTIVE" },                            │
│        { code: "RECYCLED_CONTENT_MIN", status: "EXEMPTED", exemption:{...}},│
│        { code: "DURABILITY_DECL", status: "ACTIVE" }                        │
│      ]                                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The ComplianceStackResolver

```typescript
// Usage
const resolver = new ComplianceStackResolver(entityManager);
const result = await resolver.resolve(tenantCategoryId);

// Result structure
{
  tenantCategoryId: "uuid",
  regulations: [
    {
      regulationId: "reach-uuid",
      regulationCode: "REACH",
      source: "SYSTEM",
      requirements: [
        {
          requirementId: "uuid",
          requirementCode: "SVHC_SCREEN",
          type: "SUBSTANCE_SCREEN",
          severity: "BLOCKER",
          status: "ACTIVE"
        },
        {
          requirementId: "uuid",
          requirementCode: "RECYCLED_MIN",
          type: "ATTRIBUTE_CHECK",
          severity: "BLOCKER",
          status: "EXEMPTED",
          exemption: {
            reason: "Product exempt under Article 5.2",
            legalRef: "ESPR Article 5.2",
            exemptedBy: "user_123",
            exemptedAt: "2026-01-15T..."
          }
        }
      ]
    }
  ]
}
```

---

## Category Adoption and Link Modes

### How Tenants Connect to System Categories

When a tenant wants to use the platform's regulatory framework, they **adopt** a system category. This creates a `TenantCategory` in their schema linked to a `Category` in the public schema.

The key feature is the **link mode** which controls how tightly coupled the tenant is to system updates:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CATEGORY ADOPTION MODES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────┐                                                             │
│  │    LIVE    │  "Always follow the system"                                 │
│  └────────────┘                                                             │
│  • Tenant always sees current system baseline                               │
│  • When platform adds new regulations, tenant gets them automatically       │
│  • When platform updates requirements, tenant sees updates immediately      │
│  • BEST FOR: Tenants who trust the platform and want automatic updates      │
│                                                                             │
│  ┌────────────┐                                                             │
│  │   FROZEN   │  "Lock to a specific version"                               │
│  └────────────┘                                                             │
│  • Tenant locked to regulations that existed at freeze time                 │
│  • pinnedRegulationIds captures exactly which regulations apply             │
│  • System updates don't affect tenant until they explicitly sync            │
│  • updateAvailable flag indicates when newer version exists                 │
│  • BEST FOR: Certification periods, audit preparation, stable releases      │
│                                                                             │
│  ┌────────────┐                                                             │
│  │  DETACHED  │  "Go fully independent"                                     │
│  └────────────┘                                                             │
│  • Tenant category becomes completely custom                                │
│  • No longer linked to any system category                                  │
│  • PERMANENT: Cannot be re-linked once detached                             │
│  • BEST FOR: Highly specialized requirements that diverge from standard     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The CategoryAdoption Entity

Lives in the tenant schema and tracks the relationship:

```typescript
interface CategoryAdoption {
  id: string;
  systemCategoryId: string;      // Links to public.category
  localCategory: TenantCategory; // The tenant's category
  mode: 'LIVE' | 'FROZEN' | 'DETACHED';
  adoptedAt: Date;
  adoptedVersion: number;        // System version when adopted
  frozenAtVersion?: number;      // System version when frozen
  updateAvailable: boolean;      // True if system has newer version
  pinnedRegulationIds?: string[];// Captured regulation IDs (FROZEN only)
}
```

### Mode Transitions

```
                    ┌──────────────┐
         adopt()   │     LIVE     │
    ─────────────> │   (default)  │
                    └──────┬───────┘
                           │
              patch(FROZEN)│ patch(LIVE)
                           │ (bidirectional)
                           v
                    ┌──────────────┐
                    │    FROZEN    │
                    │              │
                    └──────┬───────┘
                           │
              patch(DETACHED) (one-way)
                           │
                           v
                    ┌──────────────┐
                    │   DETACHED   │
                    │  (terminal)  │
                    └──────────────┘
```

**Note:** DETACHED is permanent. Once detached, a category cannot be re-linked to the system.

### API for Category Adoption

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/category-adoption` | GET | List adopted categories |
| `/api/v1/category-adoption/available` | GET | List categories available for adoption |
| `/api/v1/category-adoption/:categoryId` | POST | Adopt a system category (starts in LIVE) |
| `/api/v1/category-adoption/:categoryId` | PATCH | Change mode (body: `{ mode: "FROZEN" }`) |
| `/api/v1/category-adoption/:categoryId` | DELETE | Remove adoption |
| `/api/v1/category-adoption/:categoryId/sync` | POST | Manual sync for FROZEN mode |

---

## Exemptions and Guardrails

### What is an Exemption?

An exemption allows a tenant to **skip a specific requirement** for their products. This is for legitimate business reasons like:

- Products sold outside EU don't need EU-specific requirements
- Medical devices may be exempt from certain cosmetics regulations
- Legacy products may have grandfather clauses

### The Exemption Guardrail

**Not all requirements can be exempted.** Some are too critical:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXEMPTION GUARDRAIL                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Requirement "SVHC_SCREEN" (REACH Article 33)                              │
│   ─────────────────────────────────────────────                             │
│   allowTenantExemption: FALSE                                               │
│                                                                             │
│   Why? This is a core safety requirement. Substances of Very High           │
│   Concern must always be checked - no exceptions.                           │
│                                                                             │
│   What happens if tenant tries to exempt?                                   │
│   → API returns HTTP 403 Forbidden                                          │
│   → Error: "EXEMPTION_NOT_ALLOWED"                                          │
│   → Message: "This requirement cannot be exempted"                          │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   Requirement "RECYCLED_CONTENT_MIN" (ESPR Article 5)                       │
│   ───────────────────────────────────────────────────                       │
│   allowTenantExemption: TRUE                                                │
│                                                                             │
│   Why? While important, there are legitimate exemptions in the law          │
│   (e.g., certain product categories, small producers).                      │
│                                                                             │
│   What happens if tenant tries to exempt?                                   │
│   → Exemption is created with audit trail                                   │
│   → Reason and legal reference recorded                                     │
│   → Requirement status becomes "EXEMPTED" in compliance stack               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Creating an Exemption

```bash
# Create exemption via API
POST /api/v1/exemptions
{
  "tenantCategoryId": "category-uuid",
  "requirementId": "requirement-uuid",
  "reason": "Products sold to non-EU markets",
  "legalReference": "ESPR Article 5.2 territorial scope"
}

# Response (success)
201 Created
{
  "success": true,
  "data": {
    "id": "exemption-uuid",
    "tenantCategoryId": "...",
    "requirementId": "...",
    "reason": "Products sold to non-EU markets",
    "legalReference": "ESPR Article 5.2 territorial scope",
    "exemptedBy": "user_123",
    "exemptedAt": "2026-01-28T10:30:00Z"
  }
}

# Response (guardrail blocked)
403 Forbidden
{
  "success": false,
  "error": {
    "code": "EXEMPTION_NOT_ALLOWED",
    "message": "This requirement cannot be exempted"
  }
}
```

### Revoking an Exemption

Exemptions can be revoked (not deleted - audit trail preserved):

```bash
DELETE /api/v1/exemptions/:id
{
  "revocationReason": "Now selling to EU markets"
}

# Response
200 OK
{
  "success": true,
  "data": {
    "id": "exemption-uuid",
    "revokedAt": "2026-01-28T14:00:00Z",
    "revokedBy": "user_123",
    "revocationReason": "Now selling to EU markets"
  }
}
```

---

## Evidence and Audit Trail

### Why Evidence Matters

When an auditor asks "how do you know this product complies?", you need proof:

- **What** was checked
- **When** it was checked
- **What** the requirement said at that time
- **What** the result was
- **Who** made declarations

### The Requirement Snapshot

Requirements can change over time (thresholds updated, rules modified). Evidence records capture a **snapshot** of the requirement at evaluation time:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REQUIREMENT SNAPSHOT                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Today: Requirement "RECYCLED_CONTENT_MIN"                                 │
│   ─────────────────────────────────────────                                 │
│   threshold: 25%                                                            │
│                                                                             │
│   Evidence recorded with snapshot:                                          │
│   {                                                                         │
│     code: "RECYCLED_CONTENT_MIN",                                           │
│     name: "Minimum Recycled Content",                                       │
│     type: "ATTRIBUTE_CHECK",                                                │
│     severity: "BLOCKER",                                                    │
│     handlerConfig: { operator: ">=", threshold: 25 },                       │
│     snapshotAt: "2026-01-28T10:00:00Z"                                      │
│   }                                                                         │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   Next year: Requirement updated                                            │
│   ────────────────────────────────                                          │
│   threshold: 30% (stricter)                                                 │
│                                                                             │
│   The old evidence still shows the product was compliant with the           │
│   25% threshold that was in effect at the time. Audit integrity preserved.  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Evidence Types

| Type | When Used | What's Recorded |
|------|-----------|-----------------|
| `AUTO_CHECK` | Handler evaluated automatically | Values compared, threshold, result |
| `DECLARATION` | User attested something | Question asked, answer given, justification |
| `DOCUMENT` | User uploaded evidence | Document reference, upload metadata |

### Recording Evidence

```bash
POST /api/v1/evidence
{
  "productVersionId": "product-uuid",
  "requirementId": "requirement-uuid",
  "type": "AUTO_CHECK",
  "result": "PASS",
  "details": {
    "actualValue": 30,
    "threshold": 25,
    "operator": ">="
  },
  "requirementSnapshot": {
    "code": "RECYCLED_CONTENT_MIN",
    "name": "Minimum Recycled Content",
    "type": "ATTRIBUTE_CHECK",
    "severity": "BLOCKER",
    "regulationCode": "ESPR",
    "regulationName": "Ecodesign for Sustainable Products",
    "handlerConfig": { "operator": ">=", "threshold": 25 },
    "snapshotAt": "2026-01-28T10:00:00Z"
  }
}
```

### Retrieving Evidence

```bash
GET /api/v1/evidence/:productVersionId

# Response
{
  "success": true,
  "data": [
    {
      "id": "evidence-uuid",
      "productVersionId": "...",
      "requirementSnapshot": { ... },
      "type": "AUTO_CHECK",
      "result": "PASS",
      "details": { ... },
      "recordedBy": "user_123",
      "recordedAt": "2026-01-28T10:00:00Z"
    }
  ]
}
```

---

## API Reference

### Compliance Stack

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/compliance-stack/:tenantCategoryId` | GET | Get effective requirements for category |

### Exemptions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/exemptions` | POST | Create exemption |
| `/api/v1/exemptions` | GET | List exemptions (optional `?tenantCategoryId=` filter) |
| `/api/v1/exemptions/:id` | GET | Get specific exemption |
| `/api/v1/exemptions/:id` | DELETE | Revoke exemption (requires `revocationReason` in body) |

### Evidence

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/evidence` | POST | Record evidence with requirement snapshot |
| `/api/v1/evidence/:productVersionId` | GET | Get all evidence for a product version |

### Authorization

All endpoints require authentication and the appropriate permission:

| Action | Required Permission |
|--------|---------------------|
| View compliance stack | `compliance:view` |
| View exemptions | `compliance:view` |
| Create/revoke exemptions | `compliance:edit` |
| View evidence | `compliance:view` |
| Record evidence | `compliance:edit` |

---

## Data Flow Example

Let's trace through a complete compliance evaluation:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE DATA FLOW EXAMPLE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   SETUP: Tenant "AcmeCorp" has category "Plastic Bottles"                   │
│   ─────────────────────────────────────────────────────                     │
│                                                                             │
│   TenantCategory                                                            │
│   ├── id: "tc-123"                                                          │
│   ├── name: "Plastic Bottles"                                               │
│   └── systemCategoryId: "packaging.plastic" (adopted from system)           │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   STEP 1: Resolve Compliance Stack                                          │
│   ────────────────────────────────                                          │
│                                                                             │
│   GET /api/v1/compliance-stack/tc-123                                       │
│                                                                             │
│   ComplianceStackResolver:                                                  │
│   1. Get TenantCategory → systemCategoryId = "packaging.plastic"            │
│   2. Get system category path → "packaging.plastic"                         │
│   3. Query CategoryRegulation with LTREE inheritance:                       │
│      WHERE 'packaging.plastic'::ltree <@ c.path                             │
│      → Finds REACH (from "packaging") and ESPR (from "packaging.plastic")   │
│   4. Get requirements from those regulations                                │
│   5. Check exemptions for tenant category                                   │
│      → AcmeCorp has exemption for ESPR.DURABILITY_DECL                      │
│   6. Return effective requirements                                          │
│                                                                             │
│   Response:                                                                 │
│   {                                                                         │
│     regulations: [                                                          │
│       {                                                                     │
│         regulationCode: "REACH",                                            │
│         requirements: [                                                     │
│           { code: "SVHC_SCREEN", status: "ACTIVE", type: "SUBSTANCE_SCREEN"}│
│         ]                                                                   │
│       },                                                                    │
│       {                                                                     │
│         regulationCode: "ESPR",                                             │
│         requirements: [                                                     │
│           { code: "RECYCLED_MIN", status: "ACTIVE", type: "ATTRIBUTE_CHECK"}│
│           { code: "DURABILITY_DECL", status: "EXEMPTED", exemption: {...} } │
│         ]                                                                   │
│       }                                                                     │
│     ]                                                                       │
│   }                                                                         │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   STEP 2: Evaluate Product                                                  │
│   ────────────────────────                                                  │
│                                                                             │
│   Product "EcoBottle v2.1"                                                  │
│   ├── attributes: { recycled_content_pct: 35 }                              │
│   └── substances: [{ casNumber: "25038-59-9", concentrationPct: 95 }]       │
│                                                                             │
│   For each ACTIVE requirement:                                              │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ REACH.SVHC_SCREEN (SubstanceScreenHandler)                          │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │ Config: { substanceListId: "svhc-list", defaultThresholdPct: 0.1 }  │   │
│   │                                                                     │   │
│   │ Handler checks:                                                     │   │
│   │ - CAS 25038-59-9 (PET) → Not on SVHC list → OK                      │   │
│   │                                                                     │   │
│   │ Result: PASS                                                        │   │
│   │ Details: { substancesChecked: 1, violations: [] }                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ ESPR.RECYCLED_MIN (AttributeCheckHandler)                           │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │ Config: { operator: ">=", threshold: 25, attributeCode: "..."  }    │   │
│   │                                                                     │   │
│   │ Handler checks:                                                     │   │
│   │ - recycled_content_pct = 35                                         │   │
│   │ - 35 >= 25 → TRUE                                                   │   │
│   │                                                                     │   │
│   │ Result: PASS                                                        │   │
│   │ Details: { actualValue: 35, threshold: 25, operator: ">=" }         │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ESPR.DURABILITY_DECL → SKIPPED (exempted)                                 │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   STEP 3: Record Evidence                                                   │
│   ───────────────────────                                                   │
│                                                                             │
│   POST /api/v1/evidence (for each evaluation)                               │
│                                                                             │
│   Evidence records created with requirement snapshots.                      │
│   Audit trail preserved for future reference.                               │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   RESULT: Product "EcoBottle v2.1" is COMPLIANT                             │
│   ─────────────────────────────────────────────                             │
│   - SVHC_SCREEN: PASS                                                       │
│   - RECYCLED_MIN: PASS                                                      │
│   - DURABILITY_DECL: EXEMPTED (with audit trail)                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Adding New Regulations

### Using Migration Manifests

New regulations are loaded from JSON manifests - no code changes needed:

```json
{
  "$schema": "../migration-manifest.schema.json",
  "version": "1.0",
  "source": "https://eurocomply.io/regulatory-content/eu-2026",
  "regulations": [
    {
      "code": "NEW_REG",
      "name": "New Regulation 2026",
      "description": "A new EU regulation",
      "status": "ACTIVE",
      "version": "2026.1",
      "metadata": {
        "jurisdiction": "EU",
        "type": "REGULATION",
        "officialJournalRef": "Regulation (EU) 2026/xxx"
      },
      "requirements": [
        {
          "code": "NEW_REQ_1",
          "name": "New Requirement",
          "description": "Products must meet this requirement",
          "type": "ATTRIBUTE_CHECK",
          "severity": "BLOCKER",
          "attributeTemplateKey": "some_attribute",
          "handlerConfig": {
            "operator": ">=",
            "threshold": 50
          },
          "legalReference": "Article 1",
          "allowTenantExemption": true
        }
      ]
    }
  ],
  "categoryMappings": [
    {
      "categoryPath": "electronics",
      "regulationCode": "NEW_REG"
    }
  ]
}
```

### Loading the Manifest

```typescript
import { ManifestLoader } from '@eurocomply/database';

const loader = new ManifestLoader(entityManager);
const result = await loader.loadManifest('/path/to/manifest.json');

console.log(result);
// {
//   regulationsCreated: 1,
//   regulationsSkipped: 0,
//   requirementsCreated: 1,
//   requirementsSkipped: 0,
//   mappingsCreated: 1,
//   mappingsSkipped: 0
// }
```

The loader is **idempotent** - running it multiple times is safe. Existing regulations are skipped.

---

## Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KEY TAKEAWAYS                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. REGULATION-AGNOSTIC: Handlers are code, regulations are data           │
│      → Add new regulations without code changes                             │
│                                                                             │
│   2. FOUR REQUIREMENT TYPES: ATTRIBUTE_CHECK, SUBSTANCE_SCREEN,             │
│      DECLARATION, CALCULATED_CHECK (future)                                 │
│      → Each has a dedicated handler                                         │
│                                                                             │
│   3. LTREE INHERITANCE: Child categories inherit parent regulations         │
│      → "cosmetics.skincare" gets all "cosmetics" requirements               │
│                                                                             │
│   4. EXEMPTION GUARDRAIL: Some requirements can't be exempted               │
│      → allowTenantExemption: false blocks exemption attempts                │
│                                                                             │
│   5. EVIDENCE SNAPSHOTS: Capture requirement state at evaluation time       │
│      → Audit trail preserved even when requirements change                  │
│                                                                             │
│   6. MANIFEST-BASED LOADING: JSON files define regulatory content           │
│      → Idempotent, version-controlled, easy to update                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [Regulatory Vertical System](./regulatory-vertical-system-explained.md) - Overall system architecture
- [Compliance Architecture](../compliance-architecture.md) - Technical reference
- [Implementation Plan](../plans/2026-01-28-compliance-architecture-revision.md) - How this was built

---

*Document Version: 1.0*
*Last Updated: 2026-01-28*
