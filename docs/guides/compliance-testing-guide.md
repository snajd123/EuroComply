# Compliance System Testing Guide

> **Purpose:** Step-by-step guide to seeding data and testing the compliance system via Postman.

---

## Overview

The compliance system has a **layered architecture** where data flows from platform-managed seed data down to tenant-specific configurations:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SEEDING (One-Time Setup)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Step 1: seed:categories                                                    │
│  ─────────────────────────                                                  │
│  Creates system categories in public.category                               │
│                                                                             │
│      apparel                                                                │
│      ├── apparel.tops                                                       │
│      │   └── apparel.tops.tshirts                                           │
│      cosmetics                                                              │
│      ├── cosmetics.skincare                                                 │
│      electronics                                                            │
│      └── electronics.batteries                                              │
│                                                                             │
│  Step 2: seed:regulations                                                   │
│  ─────────────────────────                                                  │
│  Creates regulations + requirements + category mappings                     │
│                                                                             │
│      REACH  ──────────────┬──► apparel                                      │
│      ESPR   ──────────────┤   cosmetics                                     │
│      COSING ──────────────┘   electronics                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TENANT OPERATIONS (Via API)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Step 3: Adopt a System Category                                            │
│  ─────────────────────────────────                                          │
│  POST /api/v1/category-adoption/:categoryId                                 │
│                                                                             │
│      Tenant "Acme Corp" adopts "apparel"                                    │
│      → Creates TenantCategory linked to system category                     │
│      → Link mode: LIVE (auto-updates) | FROZEN | DETACHED                   │
│                                                                             │
│  Step 4: Get Compliance Stack                                               │
│  ─────────────────────────────────                                          │
│  GET /api/v1/compliance-stack/:tenantCategoryId                             │
│                                                                             │
│      Returns all regulations that apply to "apparel":                       │
│      - REACH (from category mapping)                                        │
│      - ESPR (from category mapping)                                         │
│      Each with nested requirements                                          │
│                                                                             │
│  Step 5: Create Exemptions (Optional)                                       │
│  ─────────────────────────────────────                                      │
│  POST /api/v1/exemptions                                                    │
│                                                                             │
│      Tenant exempts a specific requirement                                  │
│      (only if allowTenantExemption: true)                                   │
│                                                                             │
│  Step 6: Record Evidence                                                    │
│  ─────────────────────────                                                  │
│  POST /api/v1/evidence                                                      │
│                                                                             │
│      Record compliance evaluation results                                   │
│      with requirement snapshot for audit trail                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Seeding the Database

### Prerequisites

1. PostgreSQL running with `eurocomply` database
2. Database migrations applied

### Step 1: Seed System Categories

System categories are the **product taxonomy** that all tenants can adopt. They live in the `public.category` table.

```bash
# From project root
cd packages/database

# Build first (CLI uses compiled JS)
pnpm build

# Seed categories
pnpm seed:categories
```

**Expected output:**
```
Initializing database connection...
Running categories seeder...
✓ Seeded 54 categories (SystemCategories-v2).
```

**What this creates:**
- 54 categories with LTREE paths (e.g., `apparel`, `apparel.tops`, `electronics.batteries`)
- Parent-child relationships via `parent_id`
- Target types: PRODUCT, MATERIAL, FACILITY

### Step 2: Seed Regulations

Regulations define **compliance requirements** that apply to categories.

```bash
pnpm seed:regulations
```

**Expected output:**
```
Initializing database connection...
Loading manifest from .../eu-regulations-2026.json...
Loading 3 regulations...

Results:
  Regulations created: 3
  Regulations skipped: 0
  Requirements created: 6
  Category mappings:   6

✓ Seeded regulations (1.0)
```

**What this creates:**

| Regulation | Requirements | Mapped Categories |
|------------|--------------|-------------------|
| REACH | SVHC_SCREEN, REACH_RESTRICTED | apparel, cosmetics, electronics, toys |
| ESPR | RECYCLED_CONTENT_MIN, DURABILITY_DECL | apparel |
| COSING | ANNEX_II_SCREEN, ANIMAL_TEST_DECL | cosmetics |

### Shortcut: Seed Everything

```bash
pnpm seed:all
```

This runs `seed:categories` then `seed:regulations` in sequence.

### Verify Seeding

```bash
pnpm seed:check
```

**Expected output:**
```
Seeded datasets:
────────────────────────────────────────────────────────────────────────────────
Name                     Version        Records   Checksum
────────────────────────────────────────────────────────────────────────────────
eu-regulations           1.0            15        sha256:abc123...
system-categories        SystemCate...  54        sha256:def456...
```

---

## Part 2: Understanding the Data Model

### The Inheritance Chain

```
public.category (System)              tenant_xxx.tenant_category (Tenant)
────────────────────────              ────────────────────────────────────
id: "cat_abc"                         id: "tcat_123"
path: "apparel"         ◄─────────────systemCategoryId: "cat_abc"
name: "Apparel"                       name: "My Apparel Products"

        │                                     │
        │                                     │
        ▼                                     ▼

public.category_regulation            tenant_xxx.category_adoption
────────────────────────────          ─────────────────────────────
category_id: "cat_abc"                systemCategoryId: "cat_abc"
regulation_id: "reg_reach"            localCategory: "tcat_123"
                                      mode: LIVE | FROZEN | DETACHED
        │
        │
        ▼

public.regulation                     public.requirement
─────────────────                     ──────────────────
id: "reg_reach"                       id: "req_svhc"
code: "REACH"          ◄──────────────regulation_id: "reg_reach"
name: "REACH..."                      code: "SVHC_SCREEN"
status: ACTIVE                        type: SUBSTANCE_SCREEN
                                      severity: BLOCKER
                                      allowTenantExemption: false
```

### How ComplianceStackResolver Works

When you call `GET /api/v1/compliance-stack/:tenantCategoryId`:

1. **Find TenantCategory** → Get `systemCategoryId`
2. **Get System Category Path** → e.g., `apparel`
3. **LTREE Inheritance Query** → Find all regulations where category path matches or is ancestor
4. **Load Requirements** → For each regulation
5. **Apply Exemptions** → Mark exempted requirements
6. **Return Stack** → Regulations with nested requirements

```sql
-- Simplified LTREE query
SELECT r.* FROM category_regulation cr
JOIN category c ON c.id = cr.category_id
JOIN regulation r ON r.id = cr.regulation_id
WHERE 'apparel'::ltree <@ c.path  -- apparel is descendant of or equal to c.path
  AND r.status = 'ACTIVE'
```

---

## Part 3: Testing with Postman

### Setup

1. Import `docs/testing/postman/tenant-api.postman_collection.json`
2. Run **0. Setup** folder to create org and user
3. Run **1. JWT Auth → API Key Management** to create API keys

### Test Flow

#### 1. List Available System Categories

```
GET /api/v1/category-adoption/available
Authorization: Bearer {{jwtToken}}
```

**Response:**
```json
{
  "categories": [
    {
      "id": "cat_abc123",
      "path": "apparel",
      "name": "Apparel",
      "description": "Clothing and textile products",
      "regulationCount": 2
    },
    {
      "id": "cat_def456",
      "path": "electronics",
      "name": "Electronics",
      "regulationCount": 1
    }
  ]
}
```

#### 2. Adopt a Category

```
POST /api/v1/category-adoption/{{categoryId}}
Authorization: Bearer {{jwtToken}}
Content-Type: application/json

{
  "name": "Our Apparel Line",
  "mode": "LIVE"
}
```

**Response:**
```json
{
  "adoption": {
    "id": "adopt_xyz",
    "systemCategoryId": "cat_abc123",
    "localCategory": {
      "id": "tcat_789",
      "name": "Our Apparel Line"
    },
    "mode": "LIVE",
    "adoptedAt": "2026-01-29T10:00:00Z"
  }
}
```

#### 3. Get Compliance Stack

```
GET /api/v1/compliance-stack/{{tenantCategoryId}}
Authorization: Bearer {{jwtToken}}
```

**Response:**
```json
{
  "tenantCategoryId": "tcat_789",
  "regulations": [
    {
      "regulationId": "reg_reach",
      "regulationCode": "REACH",
      "source": "SYSTEM",
      "requirements": [
        {
          "requirementId": "req_svhc",
          "requirementCode": "SVHC_SCREEN",
          "type": "SUBSTANCE_SCREEN",
          "severity": "BLOCKER",
          "status": "ACTIVE"
        },
        {
          "requirementId": "req_restricted",
          "requirementCode": "REACH_RESTRICTED",
          "type": "SUBSTANCE_SCREEN",
          "severity": "BLOCKER",
          "status": "ACTIVE"
        }
      ]
    },
    {
      "regulationId": "reg_espr",
      "regulationCode": "ESPR",
      "source": "SYSTEM",
      "requirements": [
        {
          "requirementId": "req_recycled",
          "requirementCode": "RECYCLED_CONTENT_MIN",
          "type": "ATTRIBUTE_CHECK",
          "severity": "BLOCKER",
          "status": "ACTIVE"
        },
        {
          "requirementId": "req_durability",
          "requirementCode": "DURABILITY_DECL",
          "type": "DECLARATION",
          "severity": "WARNING",
          "status": "ACTIVE"
        }
      ]
    }
  ]
}
```

#### 4. Create an Exemption

Only works if `allowTenantExemption: true` for the requirement.

```
POST /api/v1/exemptions
Authorization: Bearer {{jwtToken}}
Content-Type: application/json

{
  "tenantCategoryId": "tcat_789",
  "requirementId": "req_durability",
  "reason": "Product line discontinued before regulation effective date",
  "legalReference": "Article 5(3) transitional provisions"
}
```

**Response:**
```json
{
  "exemption": {
    "id": "exempt_abc",
    "requirementId": "req_durability",
    "reason": "Product line discontinued...",
    "exemptedBy": "user_123",
    "exemptedAt": "2026-01-29T10:05:00Z"
  }
}
```

#### 5. Verify Exemption in Compliance Stack

```
GET /api/v1/compliance-stack/{{tenantCategoryId}}
```

Now the durability requirement shows as exempted:

```json
{
  "requirementId": "req_durability",
  "requirementCode": "DURABILITY_DECL",
  "type": "DECLARATION",
  "severity": "WARNING",
  "status": "EXEMPTED",
  "exemption": {
    "reason": "Product line discontinued...",
    "legalRef": "Article 5(3) transitional provisions",
    "exemptedBy": "user_123",
    "exemptedAt": "2026-01-29T10:05:00Z"
  }
}
```

#### 6. Record Evidence

Record compliance evaluation results:

```
POST /api/v1/evidence
Authorization: Bearer {{jwtToken}}
Content-Type: application/json

{
  "productVersionId": "pv_123",
  "requirementId": "req_recycled",
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
    "handlerConfig": { "operator": ">=", "threshold": 25 },
    "regulationCode": "ESPR",
    "regulationName": "Ecodesign for Sustainable Products",
    "allowTenantExemption": true,
    "snapshotAt": "2026-01-29T10:10:00Z"
  }
}
```

---

## Part 4: Link Modes Explained

### LIVE (Default)

- Tenant always sees current system baseline
- When platform updates regulations, tenant sees changes immediately
- Best for: Most tenants who want latest requirements

### FROZEN

- Tenant locked to a specific version
- `pinnedRegulationIds` captures point-in-time snapshot
- System updates don't affect tenant until explicit sync
- Best for: Certification periods where stability matters

```
PATCH /api/v1/category-adoption/{{categoryId}}
{ "mode": "FROZEN" }
```

To sync later:
```
POST /api/v1/category-adoption/{{categoryId}}/sync
```

### DETACHED

- Tenant category becomes fully independent
- No longer linked to system category
- **Permanent** - cannot be re-linked
- Best for: Highly customized compliance requirements

---

## Part 5: Requirement Types

| Type | Entity Fields | Handler Config | Example |
|------|---------------|----------------|---------|
| `ATTRIBUTE_CHECK` | `attributeTemplateKey` | `{ operator, threshold }` | "Recycled content >= 25%" |
| `SUBSTANCE_SCREEN` | `substanceListId` | `{ defaultThresholdPct }` | "No SVHC above 0.1%" |
| `DECLARATION` | — | `{ question, acceptedAnswers[] }` | "Confirm durability tested" |
| `CALCULATED_CHECK` | `calculationFormula` | `{ formula, variables }` | "Total weight from BOM" |

---

## Part 6: Troubleshooting

### "No regulations found"

1. Check categories are seeded: `pnpm seed:check`
2. Check regulations are seeded: `pnpm seed:check`
3. Verify category adoption exists
4. Verify adopted category has regulation mappings

### "Cannot create exemption" (403)

The requirement has `allowTenantExemption: false`. This is a guardrail for critical safety requirements that cannot be exempted.

### "Category not found" during adoption

The system category ID doesn't exist. Check available categories first:
```
GET /api/v1/category-adoption/available
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `pnpm seed:categories` | Seed system categories |
| `pnpm seed:regulations` | Seed regulations + mappings |
| `pnpm seed:all` | Seed everything |
| `pnpm seed:check` | View seeded datasets |

| Endpoint | Purpose |
|----------|---------|
| `GET /category-adoption/available` | List adoptable categories |
| `POST /category-adoption/:id` | Adopt a category |
| `GET /compliance-stack/:tenantCatId` | Get effective regulations |
| `POST /exemptions` | Create exemption |
| `POST /evidence` | Record evaluation result |
