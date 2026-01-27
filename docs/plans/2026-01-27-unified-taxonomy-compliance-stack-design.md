# Unified Taxonomy & Compliance Stack Design

**Status:** Approved
**Created:** 2026-01-27
**Author:** Brainstorm Session

---

## 1. Overview

This design unifies the taxonomy implementation plans (01-15) with the category adoption concept, creating a **dual-layer category system** where:

1. **Platform-managed system categories** provide regulatory baselines
2. **Tenants can adopt, extend, or create their own categories** with full audit trails
3. **Compliance evaluation** resolves a "stack" of system + tenant regulations

### Core Principle: The Compliance Stack

Compliance is treated as a layered filter:

| Layer | Source | Example |
|-------|--------|---------|
| 3 (Top) | Tenant Exemptions | "We are exempt from RoHS per Article 2(4)(f)" |
| 2 (Middle) | Tenant Additions | "We also require IEC-62368 certification" |
| 1 (Bottom) | System Baseline | "REACH_SVHC is mandatory for electronics" |

### Related Documents

- [Taxonomy Engine Design](./2026-01-23-taxonomy-engine-design.md) - Original taxonomy design
- [Category Adoption Sync Design](./2026-01-27-category-adoption-sync-design.md) - Adoption implementation
- [Regulatory Vertical System Explained](../guides/regulatory-vertical-system-explained.md) - User guide (needs update)

---

## 2. The Dual Category Model

### Problem

The original plans treat categories as either fully system-owned OR fully tenant-owned. Real compliance requires both:
- Platform provides authoritative regulatory mappings
- Tenants need flexibility for their specific business context

### Solution

Two category types with an adoption bridge:

```
┌─────────────────────────────────────────────────────────────────┐
│                      PUBLIC SCHEMA                              │
├─────────────────────────────────────────────────────────────────┤
│  Category (System Taxonomy)                                     │
│  ├── id, name, path, type, targetType                          │
│  ├── version (for sync tracking)                               │
│  └── Managed by PLATFORM ADMINS                                │
│                                                                 │
│  CategoryRegulatoryList (System Baseline)                       │
│  ├── category_id → Category                                    │
│  ├── regulatory_list_id → RegulatoryList                       │
│  ├── requirement (MANDATORY | RECOMMENDED)                      │
│  └── allowTenantExemption (guardrail flag)                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      TENANT SCHEMA                              │
├─────────────────────────────────────────────────────────────────┤
│  TenantCategory                                                 │
│  ├── Adopted from system (systemCategoryId set, path: system.*) │
│  └── OR Custom (systemCategoryId null, path: custom.*)          │
│                                                                 │
│  CategoryAdoption (tracks link mode for adopted categories)     │
│  ├── mode: LIVE | FROZEN | DETACHED                            │
│  └── frozenAtVersion (for version pinning)                     │
│                                                                 │
│  TenantCategoryRegulatoryList (additions + exemptions)          │
│  ├── Tenant-added regulations                                   │
│  └── Justified exemptions from system baseline                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Insight

A `TenantCategory` can be:
- **Adopted**: Links to a system category, inherits its regulatory baseline
- **Custom**: No system link, tenant manually configures regulatory lists

The "soft link" (no hard FK across schemas) enables:
- **Portability**: Tenants can be moved between database clusters
- **Versioning**: System categories can be retired without breaking tenant data

---

## 3. Tenant Regulatory Layer - Additions & Exemptions

### Purpose

Allow tenants to:
1. **Add extra regulations** beyond the system baseline
2. **Exempt from baseline regulations** with mandatory justification

### Entity: TenantCategoryRegulatoryList

```typescript
@Entity({ tableName: 'tenant_category_regulatory_list' })
export class TenantCategoryRegulatoryList extends BaseEntity {
  // Core Fields
  @ManyToOne(() => TenantCategory)
  tenantCategory!: TenantCategory;

  @Property({ type: 'text', name: 'regulatory_list_id' })
  regulatoryListId!: string;  // Soft link to public.regulatory_list

  @Enum(() => ListRequirement)
  requirement!: ListRequirement;  // MANDATORY | RECOMMENDED | INFORMATIONAL

  @Enum(() => RegulationSource)
  source!: RegulationSource;  // INHERITED | TENANT_ADDED

  // Exemption Fields
  @Property({ type: 'boolean', default: false, name: 'is_exempted' })
  isExempted: boolean = false;

  @Property({ type: 'text', nullable: true, name: 'exemption_reason' })
  exemptionReason?: string;  // REQUIRED if isExempted = true

  @Property({ type: 'text', nullable: true, name: 'exemption_legal_ref' })
  exemptionLegalRef?: string;  // e.g., "Directive 2011/65/EU Art 2(4)(f)"

  @Property({ type: 'text', nullable: true, name: 'exempted_by' })
  exemptedBy?: string;  // User ID

  @Property({ type: 'timestamptz', nullable: true, name: 'exempted_at' })
  exemptedAt?: Date;

  // Override Fields
  @Property({ type: 'decimal', nullable: true, name: 'override_threshold' })
  overrideThreshold?: string;  // Tenant can be STRICTER than the law
}
```

### How It Works

| Scenario | Record State |
|----------|--------------|
| Tenant adds OEKO-TEX | `source: TENANT_ADDED`, `isExempted: false` |
| System baseline REACH inherited | No record needed (resolved at query time) |
| Tenant exempts RoHS | `source: INHERITED`, `isExempted: true`, `exemptionReason: "..."` |

### The Guardrail Check

```typescript
// Before allowing exemption
const systemLink = await getSystemCategoryRegulatoryList(regulatoryListId);
if (!systemLink.allowTenantExemption) {
  return error(c, 'FORBIDDEN', 'This regulation cannot be exempted', 403, {
    regulatoryListCode: systemLink.code,
    allowTenantExemption: false
  });
}
```

### Query-Time Resolution

```sql
-- Effective regulations for a TenantCategory
SELECT
  crl.regulatory_list_id,
  crl.requirement,
  'SYSTEM' as source,
  COALESCE(tcrl.is_exempted, false) as is_exempted,
  tcrl.exemption_reason
FROM public.category_regulatory_list crl
LEFT JOIN tenant.tenant_category_regulatory_list tcrl
  ON tcrl.regulatory_list_id = crl.regulatory_list_id
  AND tcrl.tenant_category_id = :tenantCategoryId
WHERE crl.category_id = :systemCategoryId

UNION

SELECT
  tcrl.regulatory_list_id,
  tcrl.requirement,
  'TENANT' as source,
  false as is_exempted,
  NULL as exemption_reason
FROM tenant.tenant_category_regulatory_list tcrl
WHERE tcrl.tenant_category_id = :tenantCategoryId
  AND tcrl.source = 'TENANT_ADDED'
```

---

## 4. Link Modes & Version Pinning

### Link Mode Behavior

| Mode | System Updates | Notifications | Use Case |
|------|----------------|---------------|----------|
| **LIVE** | Auto-applied | N/A | "Keep me current with regulations" |
| **FROZEN** | Ignored (snapshot) | `updateAvailable = true` | "I want control over when to update" |
| **DETACHED** | Ignored permanently | None | "I've diverged, don't notify me" |

### Version Pinning (FROZEN Mode)

When a tenant freezes their adoption:
- Store `pinnedRegulatoryListIds[]` - the specific UUIDs of list versions
- Query resolves against those exact versions, not current
- Enables "time machine" compliance - prove compliance as of a specific date

### Resolution Flow

```
Product in category "system.electronics"
         │
         ▼
┌─────────────────────────────┐
│ 1. Get TenantCategory       │
│    systemCategoryId = X     │
│    linkMode = FROZEN        │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ 2. Get CategoryAdoption     │
│    mode = FROZEN            │
│    frozenAtVersion = 3      │
│    pinnedRegulatoryListIds  │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Resolve Compliance Stack                                 │
│                                                             │
│    Layer 3 (Top): Tenant exemptions                         │
│    ├── RoHS exempted: "Medical device per Art 2(4)(f)"     │
│                                                             │
│    Layer 2 (Middle): Tenant additions                       │
│    ├── IEC-62368 added (internal requirement)              │
│                                                             │
│    Layer 1 (Bottom): System baseline @ version 3            │
│    ├── REACH_SVHC (mandatory)                              │
│    ├── RoHS (mandatory) ← exempted by Layer 3              │
│    └── WEEE (recommended)                                   │
│                                                             │
│ Result: [REACH_SVHC, WEEE, IEC-62368]                       │
│         + RoHS as JUSTIFIED_EXEMPTION                       │
└─────────────────────────────────────────────────────────────┘
```

### Exemption Resolution Order (with LTREE)

When resolving exemptions across the category hierarchy:

1. **Direct Tenant Exemption** - "I exempted this for THIS category" (highest priority)
2. **Inherited Tenant Exemption** - "I exempted this at a PARENT category"
3. **System Baseline** - "The platform says this is required" (lowest priority)

---

## 5. PreFlight Evaluation Flow

### Evaluation Process

```
┌─────────────────────────────────────────────────────────────────┐
│                  PREFLIGHT EVALUATION FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INPUT: Product with TenantCategory "system.electronics"        │
│                                                                 │
│  Step 1: Resolve Compliance Stack                               │
│  ─────────────────────────────────────────────────────────────  │
│  ComplianceStackResolver.resolve(tenantCategoryId)              │
│    → Returns effective regulations with source + status         │
│                                                                 │
│  Step 2: For each ACTIVE regulation, evaluate substances        │
│  ─────────────────────────────────────────────────────────────  │
│  For REACH: Check substances → Generate findings                │
│  For IEC-62368: Check substances → Generate findings            │
│  For RoHS (EXEMPTED): SKIP checks → Generate JUSTIFIED_EXEMPTION│
│                                                                 │
│  Step 3: Compile Report                                         │
│  ─────────────────────────────────────────────────────────────  │
│  Group findings by source (SYSTEM vs TENANT)                    │
│  Show exemptions in dedicated section with justifications       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Finding Statuses

| Status | Meaning | Severity |
|--------|---------|----------|
| `PASSED` | Substance not in list OR below threshold | None |
| `FAILED` | Violation detected | BLOCKER / WARNING |
| `JUSTIFIED_EXEMPTION` | Regulation skipped with reason | INFO |
| `NOT_EVALUATED` | Missing data (no substances declared) | WARNING |

### Report Structure

```typescript
interface PreFlightReport {
  productId: string;
  evaluatedAt: Date;

  sections: {
    systemBaseline: {
      regulations: RegulationResult[];
    };
    tenantAdditions: {
      regulations: RegulationResult[];
    };
    exemptions: {
      regulations: ExemptionRecord[];  // Never hidden
    };
  };

  summary: {
    blockers: number;
    warnings: number;
    exemptions: number;
    passed: number;
  };
}
```

### Key Principle

Exemptions are **NEVER hidden**. They appear in a dedicated report section so auditors can see the tenant's explicit decisions. This protects the platform: if audited, the report shows the tenant made the exemption decision, not the platform.

---

## 6. API Endpoints

### Admin API (admin-api collection, X-Admin-Key auth)

Base: `/api/v1/admin`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/categories` | List system categories |
| POST | `/categories` | Create system category |
| PATCH | `/categories/:id` | Update (bumps version) |
| GET | `/categories/:id/regulatory-lists` | List linked regulations |
| POST | `/categories/:id/regulatory-lists` | Link a regulation |
| DELETE | `/categories/:id/regulatory-lists/:listId` | Unlink |

### Tenant API (tenant-api collection, Clerk JWT or X-API-Key)

Base: `/api/v1`

**Category Adoption (existing - already implemented):**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/category-adoption/available` | `authorize('design', 'view')` | List adoptable |
| GET | `/category-adoption` | `authorize('design', 'view')` | List adopted |
| POST | `/category-adoption/:categoryId` | `authorize('design', 'edit')` | Adopt |
| PATCH | `/category-adoption/:categoryId` | `authorize('design', 'edit')` | Change link mode |
| POST | `/category-adoption/:categoryId/sync` | `authorize('design', 'edit')` | Manual sync |
| DELETE | `/category-adoption/:categoryId` | `authorize('design', 'edit')` | Remove adoption |

**Tenant Regulatory Links (NEW):**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/tenant-categories/:id/regulatory-lists` | `authorize('compliance', 'view')` | Get compliance stack |
| POST | `/tenant-categories/:id/regulatory-lists` | `authorize('compliance', 'edit')` | Add tenant regulation |
| POST | `/tenant-categories/:id/regulatory-lists/:listId/exempt` | `authorize('compliance', 'edit')` | Create exemption |
| DELETE | `/tenant-categories/:id/regulatory-lists/:listId/exempt` | `authorize('compliance', 'edit')` | Remove exemption |
| DELETE | `/tenant-categories/:id/regulatory-lists/:listId` | `authorize('compliance', 'edit')` | Remove tenant-added |

### Validation Schemas

```typescript
// POST /tenant-categories/:id/regulatory-lists
const addRegulatoryListSchema = z.object({
  regulatoryListId: z.string().min(1),
  requirement: z.enum(['MANDATORY', 'RECOMMENDED', 'INFORMATIONAL']),
});

// POST /tenant-categories/:id/regulatory-lists/:listId/exempt
const exemptRegulatoryListSchema = z.object({
  reason: z.string().min(10).max(1000),
  legalRef: z.string().max(255).optional(),
});
```

### Response Example

**GET /tenant-categories/:id/regulatory-lists:**

```json
{
  "success": true,
  "data": {
    "tenantCategoryId": "uuid",
    "tenantCategoryPath": "system.electronics",
    "linkMode": "LIVE",
    "effectiveRegulations": [
      {
        "regulatoryListId": "reach-svhc-uuid",
        "regulatoryListCode": "REACH_SVHC",
        "source": "SYSTEM",
        "requirement": "MANDATORY",
        "status": "ACTIVE",
        "allowExemption": true
      },
      {
        "regulatoryListId": "rohs-uuid",
        "regulatoryListCode": "ROHS_RESTRICTED",
        "source": "SYSTEM",
        "requirement": "MANDATORY",
        "status": "EXEMPTED",
        "exemption": {
          "reason": "Medical device per Article 2(4)(f)",
          "legalRef": "Directive 2011/65/EU Art 2(4)(f)",
          "exemptedBy": "user-uuid",
          "exemptedAt": "2026-01-27T10:00:00Z"
        }
      }
    ]
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

---

## 7. Plan Alignment Matrix

### Plans Requiring Changes

| Plan | Change Level | Description |
|------|--------------|-------------|
| **Plan 05** (Category Service) | MAJOR REWRITE | Split into SystemCategoryService (admin) and TenantCategoryService (tenant). Add adoption endpoints (already done). Add sync/diff engine. |
| **Plan 10** (Regulatory Lists) | MINOR UPDATE | Add `allowTenantExemption: boolean` flag to RegulatoryList entity. Add to seeder data. |
| **Plan 11** (Category-List Scoping) | MAJOR REWRITE | Create CategoryRegulatoryList (public). Create TenantCategoryRegulatoryList (tenant). Implement "Compliance Stack" resolver. Handle LTREE ancestor traversal. Handle LIVE/FROZEN/DETACHED modes. |
| **Plan 14** (Rule Evaluation) | MODERATE UPDATE | Add JUSTIFIED_EXEMPTION result status. Include exemptionReason in findings. Label findings by source (SYSTEM/TENANT). Handle overrideThreshold comparisons. |
| **Plan 15** (Regulatory Seeders) | MODERATE UPDATE | Seed CategoryRegulatoryList links. Define which system categories get which regulations. |

### Plans Unchanged

Plans 01-04, 06-09, 12 deal with infrastructure, substances, units, and materials - they are unaffected by this design.

### New Entities

| Entity | Schema | Purpose |
|--------|--------|---------|
| `CategoryRegulatoryList` | public | Links system categories to regulatory lists |
| `TenantCategoryRegulatoryList` | tenant | Tenant additions + exemptions with audit trail |

### Modified Entities

| Entity | Changes |
|--------|---------|
| `RegulatoryList` | Add `allowTenantExemption: boolean` |
| `TenantCategory` | Add `originalNameSnapshot: string` |
| `CategoryAdoption` | Add `pinnedRegulatoryListIds: string[]` |

### Implementation Order

1. Plan 10 update (add exemption flag) - prerequisite
2. Plan 11 rewrite (scoping engine) - core work
3. Plan 05 rewrite (category services) - builds on 11
4. Plan 14 update (evaluation) - consumes stack
5. Plan 15 update (seeders) - populates data

---

## 8. Database Schema Updates

### New Table: CategoryRegulatoryList (public schema)

```sql
CREATE TABLE public.category_regulatory_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.category(id),
  regulatory_list_id UUID NOT NULL REFERENCES public.regulatory_list(id),
  requirement VARCHAR(20) NOT NULL DEFAULT 'MANDATORY',
  allow_tenant_exemption BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(category_id, regulatory_list_id)
);

CREATE INDEX idx_crl_category ON public.category_regulatory_list(category_id);
CREATE INDEX idx_crl_list ON public.category_regulatory_list(regulatory_list_id);
```

### New Table: TenantCategoryRegulatoryList (tenant schema)

```sql
CREATE TABLE tenant_category_regulatory_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_category_id UUID NOT NULL REFERENCES tenant_category(id),
  regulatory_list_id UUID NOT NULL,  -- Soft link to public.regulatory_list
  requirement VARCHAR(20) NOT NULL DEFAULT 'MANDATORY',
  source VARCHAR(20) NOT NULL DEFAULT 'TENANT_ADDED',

  -- Exemption fields
  is_exempted BOOLEAN NOT NULL DEFAULT false,
  exemption_reason TEXT,
  exemption_legal_ref VARCHAR(255),
  exempted_by UUID,
  exempted_at TIMESTAMPTZ,

  -- Override fields
  override_threshold DECIMAL(10,6),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_category_id, regulatory_list_id)
);

CREATE INDEX idx_tcrl_category ON tenant_category_regulatory_list(tenant_category_id);
CREATE INDEX idx_tcrl_list ON tenant_category_regulatory_list(regulatory_list_id);
```

### Modified Table: RegulatoryList (public schema)

```sql
ALTER TABLE public.regulatory_list
ADD COLUMN allow_tenant_exemption BOOLEAN NOT NULL DEFAULT true;
```

### Modified Table: TenantCategory (tenant schema)

```sql
ALTER TABLE tenant_category
ADD COLUMN original_name_snapshot VARCHAR(255);
```

### Modified Table: CategoryAdoption (tenant schema)

```sql
ALTER TABLE category_adoption
ADD COLUMN pinned_regulatory_list_ids UUID[];
```

---

## 9. GUIDES Documentation Update Required

The current `docs/guides/regulatory-vertical-system-explained.md` needs to be updated to reflect:

1. **Dual category model** - System vs Tenant categories
2. **Adoption flow** - How tenants adopt system categories
3. **Compliance stack** - How regulations are layered
4. **Exemptions** - How and why tenants can exempt with justification
5. **Link modes** - LIVE/FROZEN/DETACHED behavior

This should be done after implementation is complete.

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-27 | Initial design from brainstorm session |
