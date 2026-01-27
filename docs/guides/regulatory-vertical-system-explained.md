# Understanding the Regulatory Compliance System

> A beginner-friendly guide to the EuroComply Regulatory Vertical System

---

## Table of Contents

1. [How Users Use This System](#how-users-use-this-system)
2. [The Problem We're Solving](#the-problem-were-solving)
3. [System Overview](#system-overview)
4. [What is a Regulatory List?](#part-1-what-is-a-regulatory-list-plan-10)
5. [Version History](#part-2-version-history-why-lists-are-immutable)
6. [Snapshots](#part-3-snapshots-protecting-against-data-drift)
7. [Category Hierarchy (LTREE)](#part-4-how-categories-work-ltree-magic---plan-11)
8. [Dual Category Model](#part-5-dual-category-model-system-vs-tenant)
9. [Category Adoption](#part-6-category-adoption-live-frozen-detached)
10. [Compliance Stack Resolution](#part-7-compliance-stack-resolution-3-layers)
11. [Tenant Exemptions](#part-8-tenant-exemptions-with-audit-trail)
12. [Admin Import Pipeline](#part-9-the-admin-import-pipeline-plan-12)
13. [Rule Evaluation](#part-10-rule-evaluation-plan-14---the-actual-compliance-check)
14. [Evaluation Scopes](#part-11-the-two-evaluation-scopes-reach-vs-rohs)
15. [Complete Data Flow](#part-12-how-it-all-connects)
16. [Key Concepts Summary](#summary-the-key-concepts)

---

## How Users Use This System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    USER-DEFINED DATA MODEL                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  KEY CONCEPT: The platform provides SYSTEM CATEGORIES (shared taxonomy)    │
│  that tenants can ADOPT, or tenants can create their own CUSTOM categories.│
│                                                                             │
│                                                                             │
│  TWO SCHEMAS IN THE DATABASE:                                               │
│                                                                             │
│   ┌─────────────────────────────┐    ┌─────────────────────────────┐       │
│   │      PUBLIC SCHEMA          │    │    TENANT SCHEMA (per org)  │       │
│   │    (shared by all orgs)     │    │   (e.g., "acme_corp")       │       │
│   ├─────────────────────────────┤    ├─────────────────────────────┤       │
│   │                             │    │                             │       │
│   │  • RegulatoryList           │    │  • Product                  │       │
│   │  • RegulatoryListEntry      │    │  • TenantCategory           │       │
│   │  • Substance (master list)  │    │  • CategoryAdoption         │       │
│   │  • Category (system taxon.) │    │  • TenantCategoryRegList    │       │
│   │  • CategoryRegulatoryList   │    │  • RawMaterial              │       │
│   │                             │    │  • MaterialSubstance        │       │
│   │  (Managed by PLATFORM       │    │  • AttributeTemplate        │       │
│   │   ADMINS, not users)        │    │  • AttributeValue           │       │
│   │                             │    │                             │       │
│   │                             │    │  (Managed by TENANT USERS)  │       │
│   └─────────────────────────────┘    └─────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What Users Define

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    USER WORKFLOW - SETTING UP THEIR DATA                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 1: User ADOPTS system categories or creates their own                │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│    User Action: "We make cosmetics - let me adopt the standard taxonomy"   │
│                                                                             │
│    Option A: ADOPT a System Category (recommended)                         │
│    ┌──────────────────────────────────────────────────────────────────┐    │
│    │  CategoryAdoption Table (in tenant schema)                       │    │
│    ├──────────────────────────────────────────────────────────────────┤    │
│    │  systemCategoryId │  mode    │  frozenAt                         │    │
│    ├────────────────────┼──────────┼─────────────────────────────────-┤    │
│    │  cosmetics-uuid   │  LIVE    │  null                             │    │
│    │  electronics-uuid │  FROZEN  │  2024-06-01                       │    │
│    └──────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│    Option B: CREATE their own TenantCategory (custom taxonomy)             │
│    ┌──────────────────────────────────────────────────────────────────┐    │
│    │  TenantCategory Table (in tenant schema)                         │    │
│    ├──────────────────────────────────────────────────────────────────┤    │
│    │  name            │  path (LTREE)                                 │    │
│    ├───────────────────┼──────────────────────────────────────────────┤    │
│    │  Custom Widgets  │  custom.widgets                               │    │
│    │  Gadgets         │  custom.gadgets                               │    │
│    └──────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│    Users can adopt standard categories OR create their own!                │
│                                                                             │
│                                                                             │
│  STEP 2: User creates ATTRIBUTE TEMPLATES (scoped to categories)           │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│    User Action: "Skincare products need SPF rating, Electronics need       │
│                  voltage rating"                                           │
│                                                                             │
│    ┌──────────────────────────────────────────────────────────────────┐    │
│    │  AttributeTemplate Table                                         │    │
│    ├──────────────────────────────────────────────────────────────────┤    │
│    │  name         │  category                │  valueType            │    │
│    ├───────────────┼──────────────────────────┼───────────────────────┤    │
│    │  SPF Rating   │  products.cosmetics      │  NUMBER               │    │
│    │  Scent        │  products.cosmetics      │  TEXT                 │    │
│    │  Voltage      │  products.electronics    │  NUMBER               │    │
│    │  Weight       │  products (all!)         │  NUMBER               │    │
│    └──────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│    Attributes INHERIT down the tree (Weight applies to everything)         │
│                                                                             │
│                                                                             │
│  STEP 3: User creates PRODUCTS and assigns them to categories              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│    User Action: "I have a moisturizer product"                             │
│                                                                             │
│    ┌──────────────────────────────────────────────────────────────────┐    │
│    │  Product: "Hydrating Day Cream"                                  │    │
│    ├──────────────────────────────────────────────────────────────────┤    │
│    │  category:  products.cosmetics.skincare   <-- User assigns this  │    │
│    │  status:    DRAFT                                                │    │
│    │                                                                  │    │
│    │  Attribute Values (user fills these in):                         │    │
│    │    SPF Rating: 30                                                │    │
│    │    Scent: "Lavender"                                             │    │
│    │    Weight: 50g                                                   │    │
│    └──────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│                                                                             │
│  STEP 4: User declares RAW MATERIALS and their SUBSTANCES                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│    User Action: "My product contains these ingredients"                    │
│                                                                             │
│    ┌──────────────────────────────────────────────────────────────────┐    │
│    │  RawMaterial: "Preservative Blend X"                             │    │
│    ├──────────────────────────────────────────────────────────────────┤    │
│    │  supplier: "Acme Chemicals"                                      │    │
│    │  percentageInProduct: 2%                                         │    │
│    │                                                                  │    │
│    │  Substances declared:                                            │    │
│    │    ┌────────────────────────────────────────────────────────┐   │    │
│    │    │ CAS: 50-00-0 (Formaldehyde)  │  2.5% in this material  │   │    │
│    │    │ CAS: 64-17-5 (Ethanol)       │  97.5% in this material │   │    │
│    │    └────────────────────────────────────────────────────────┘   │    │
│    └──────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│    User links substances from the MASTER substance list (public schema)    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How Regulatory Lists Connect to User Data

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    THE MAGIC LINK: CategoryRegulatoryList                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Platform admins (NOT regular users) configure which regulatory lists      │
│  apply to which category PATHS. This is the bridge!                        │
│                                                                             │
│                                                                             │
│   PUBLIC SCHEMA                          TENANT SCHEMA                      │
│   ─────────────                          ─────────────                      │
│                                                                             │
│   ┌─────────────────┐                    ┌─────────────────┐               │
│   │ RegulatoryList  │                    │    Category     │               │
│   │                 │                    │                 │               │
│   │ REACH_SVHC      │                    │ path: products  │               │
│   │ COSING_ANNEX_II │                    │ path: products. │               │
│   │ ROHS_RESTRICTED │                    │      cosmetics  │               │
│   └────────┬────────┘                    └────────┬────────┘               │
│            │                                      │                        │
│            │     ┌────────────────────────┐       │                        │
│            │     │ CategoryRegulatoryList │       │                        │
│            │     │ (PUBLIC SCHEMA)        │       │                        │
│            └────>│                        │<──────┘                        │
│                  │ ┌──────────────────────────────────────────────┐       │
│                  │ │ RULE: "Any category matching 'products.*'    │       │
│                  │ │        must check REACH_SVHC"                │       │
│                  │ │                                              │       │
│                  │ │ categoryPath: 'products'                     │       │
│                  │ │ regulatoryList: REACH_SVHC                   │       │
│                  │ └──────────────────────────────────────────────┘       │
│                  │ ┌──────────────────────────────────────────────┐       │
│                  │ │ RULE: "Any category matching 'products.      │       │
│                  │ │        cosmetics.*' must check COSING"       │       │
│                  │ │                                              │       │
│                  │ │ categoryPath: 'products.cosmetics'           │       │
│                  │ │ regulatoryList: COSING_ANNEX_II              │       │
│                  │ └──────────────────────────────────────────────┘       │
│                  └────────────────────────┘                               │
│                                                                             │
│                                                                             │
│  THE KEY INSIGHT:                                                          │
│  ────────────────                                                          │
│  CategoryRegulatoryList doesn't link to SPECIFIC categories.               │
│  It links to category PATHS using LTREE matching!                          │
│                                                                             │
│  When user creates category "products.cosmetics.skincare.moisturizers",    │
│  the system automatically knows:                                           │
│    - "products.*" matches → REACH_SVHC applies                            │
│    - "products.cosmetics.*" matches → COSING_ANNEX_II applies             │
│                                                                             │
│  Users don't configure this! Platform admins set it up once.               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Complete User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    USER JOURNEY: FROM PRODUCT TO COMPLIANCE                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1. USER CREATES PRODUCT                                            │   │
│  │     "Hydrating Day Cream" in category "products.cosmetics.skincare" │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   │                                        │
│                                   ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  2. USER ADDS RAW MATERIALS                                         │   │
│  │     "Preservative Blend" - 2% of product                            │   │
│  │     "Moisturizing Base" - 80% of product                            │   │
│  │     "Fragrance Oil" - 18% of product                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   │                                        │
│                                   ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  3. USER DECLARES SUBSTANCES IN EACH MATERIAL                       │   │
│  │     Preservative Blend contains:                                    │   │
│  │       • Formaldehyde (CAS: 50-00-0) - 2.5%                         │   │
│  │       • Ethanol (CAS: 64-17-5) - 97.5%                             │   │
│  │                                                                     │   │
│  │     (User selects from master Substance list in public schema)      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   │                                        │
│                                   ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  4. USER CLICKS "RUN COMPLIANCE CHECK" (PreFlight Audit)            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   │                                        │
│                                   ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  5. SYSTEM AUTOMATICALLY:                                           │   │
│  │                                                                     │   │
│  │     a) Looks up product category: "products.cosmetics.skincare"     │   │
│  │                                                                     │   │
│  │     b) Finds matching regulatory lists (LTREE query):               │   │
│  │        - REACH_SVHC (from "products")                               │   │
│  │        - COSING_ANNEX_II (from "products.cosmetics")                │   │
│  │                                                                     │   │
│  │     c) Rolls up all substances from materials:                      │   │
│  │        - Formaldehyde: 2% × 2.5% = 0.05% in final product          │   │
│  │        - Ethanol: 2% × 97.5% = 1.95% in final product              │   │
│  │                                                                     │   │
│  │     d) Cross-references against regulatory list entries:            │   │
│  │        - Formaldehyde in COSING_ANNEX_II? YES - PROHIBITED!        │   │
│  │        - Ethanol in COSING_ANNEX_II? No - PASS                      │   │
│  │                                                                     │   │
│  │     e) Generates findings with traceability                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   │                                        │
│                                   ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  6. USER SEES RESULTS                                               │   │
│  │                                                                     │   │
│  │     ┌───────────────────────────────────────────────────────────┐  │   │
│  │     │ ❌ BLOCKER: Prohibited Substance Found                     │  │   │
│  │     │                                                           │  │   │
│  │     │ Substance: Formaldehyde (CAS: 50-00-0)                    │  │   │
│  │     │ Concentration: 0.05%                                      │  │   │
│  │     │ Regulation: COSING_ANNEX_II (Entry 1577)                  │  │   │
│  │     │                                                           │  │   │
│  │     │ Source: Preservative Blend (2% of product)                │  │   │
│  │     │         └─ Formaldehyde is 2.5% of this material          │  │   │
│  │     │                                                           │  │   │
│  │     │ Suggested action: Replace preservative with               │  │   │
│  │     │                   formaldehyde-free alternative           │  │   │
│  │     └───────────────────────────────────────────────────────────┘  │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Summary: Who Manages What?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RESPONSIBILITY MATRIX                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PLATFORM ADMINS manage:                 TENANT USERS manage:               │
│  ─────────────────────────               ───────────────────────            │
│                                                                             │
│  ┌─────────────────────────────┐        ┌─────────────────────────────┐    │
│  │ • Regulatory Lists          │        │ • TenantCategories          │    │
│  │   (REACH, COSING, RoHS)     │        │   (adopt system OR custom)  │    │
│  │                             │        │                             │    │
│  │ • Regulatory List Entries   │        │ • Products                  │    │
│  │   (which substances are     │        │   (assigned to categories)  │    │
│  │    restricted and how)      │        │                             │    │
│  │                             │        │ • Raw Materials             │    │
│  │ • Master Substance List     │        │   (ingredients/components)  │    │
│  │   (CAS numbers, names)      │        │                             │    │
│  │                             │        │ • Substance Declarations    │    │
│  │ • System Categories         │        │   (what % of each substance │    │
│  │   (shared taxonomy)         │        │    is in each material)     │    │
│  │                             │        │                             │    │
│  │ • CategoryRegulatoryList    │        │ • Attribute Templates       │    │
│  │   (which paths get which    │        │   (custom fields)           │    │
│  │    regulatory lists)        │        │                             │    │
│  │                             │        │                             │    │
│  │ Stored in: PUBLIC schema    │        │ Stored in: TENANT schema    │    │
│  │ Shared by: All tenants      │        │ Isolated: Only their org    │    │
│  └─────────────────────────────┘        └─────────────────────────────┘    │
│                                                                             │
│                                                                             │
│  THE SYSTEM:                                                                │
│  ───────────                                                                │
│                                                                             │
│    Takes user's category assignment  ────────────────────────────┐         │
│    + user's substance declarations                               │         │
│    + platform's regulatory rules                                 │         │
│                                      ─────────────────────────>  │         │
│                                                                  v         │
│                                      ┌─────────────────────────────────┐   │
│                                      │   Compliance Findings Report    │   │
│                                      │   (what's wrong and why)        │   │
│                                      └─────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The Problem We're Solving

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        THE REAL WORLD PROBLEM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Your company makes products. Products contain RAW MATERIALS.               │
│  Raw materials contain SUBSTANCES (chemicals).                              │
│                                                                             │
│  The EU has LAWS that say:                                                  │
│    • "You can't use Formaldehyde in cosmetics!" (Prohibition)              │
│    • "Lead must be below 0.1% in electronics!" (Threshold)                 │
│    • "If you have Substance X, you must declare it!" (Declaration)         │
│                                                                             │
│  Different products have DIFFERENT rules:                                   │
│    • Cosmetics → CosIng regulations                                        │
│    • Electronics → RoHS regulations                                        │
│    • ALL products → REACH regulations                                      │
│                                                                             │
│  WE NEED TO:                                                                │
│    1. Store all these regulatory lists                                     │
│    2. Know which lists apply to which products                             │
│    3. Check if a product violates any rules                                │
│    4. Keep audit trails for compliance                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYSTEM OVERVIEW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐             │
│   │   PLAN 10    │      │   PLAN 11    │      │   PLAN 12    │             │
│   │  Regulatory  │      │   Category   │      │    Admin     │             │
│   │    Lists     │      │   Scoping    │      │   Import     │             │
│   │   Registry   │      │   (LTREE)    │      │  Pipeline    │             │
│   └──────┬───────┘      └──────┬───────┘      └──────┬───────┘             │
│          │                     │                     │                      │
│          │    "What lists      │   "Which lists      │   "How do we        │
│          │     exist?"         │   apply to what     │    update the       │
│          │                     │    products?"       │    lists?"          │
│          │                     │                     │                      │
│          └─────────────────────┼─────────────────────┘                      │
│                                │                                            │
│                                ▼                                            │
│                    ┌───────────────────────┐                               │
│                    │       PLAN 14         │                               │
│                    │   Rule Evaluation     │                               │
│                    │                       │                               │
│                    │  "Does this product   │                               │
│                    │   violate any rules?" │                               │
│                    └───────────────────────┘                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: What is a Regulatory List? (Plan 10)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      REGULATORY LIST STRUCTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Think of a regulatory list like a BOOK of rules:                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    REGULATORY LIST                                  │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  code:          "COSING_ANNEX_II"                                   │   │
│  │  name:          "CosIng Annex II - Prohibited Substances"           │   │
│  │  source:        "EU_COSING"                                         │   │
│  │  version:       "2024-06"     <-- Lists get UPDATED over time!      │   │
│  │  effectiveDate: "2024-06-01"                                        │   │
│  │  sourceUrl:     "https://ec.europa.eu/cosing/"                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Each list contains many ENTRIES (pages in the book):                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    LIST ENTRY                                       │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  substance:         Formaldehyde (CAS: 50-00-0)                     │   │
│  │  restrictionType:   PROHIBITED  <-- Can't use AT ALL                │   │
│  │  legalReference:    "Entry 1577"                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    LIST ENTRY                                       │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  substance:         Lead (CAS: 7439-92-1)                           │   │
│  │  restrictionType:   THRESHOLD   <-- Allowed, but limited            │   │
│  │  thresholdPct:      "0.001"     <-- Max 0.001% allowed              │   │
│  │  legalReference:    "Entry 1234"                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Three Types of Restrictions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RESTRICTION TYPES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. PROHIBITED                                                              │
│     ┌──────────────────────────────────────────────┐                       │
│     │  "You cannot use this substance AT ALL"      │                       │
│     │                                              │                       │
│     │  Example: Formaldehyde in cosmetics          │                       │
│     │  If found --> BLOCKER (product can't ship)   │                       │
│     └──────────────────────────────────────────────┘                       │
│                                                                             │
│  2. THRESHOLD                                                               │
│     ┌──────────────────────────────────────────────┐                       │
│     │  "You can use it, but only up to X%"         │                       │
│     │                                              │                       │
│     │  Example: Lead <= 0.1% in electronics        │                       │
│     │  If exceeded --> WARNING or BLOCKER          │                       │
│     └──────────────────────────────────────────────┘                       │
│                                                                             │
│  3. RESTRICTED_WITH_CONDITIONS                                              │
│     ┌──────────────────────────────────────────────┐                       │
│     │  "Allowed only under certain conditions"     │                       │
│     │                                              │                       │
│     │  Example: "OK in rinse-off products only"    │                       │
│     │  Needs extra checks based on product type    │                       │
│     └──────────────────────────────────────────────┘                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 2: Version History (Why Lists are Immutable)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WHY WE KEEP OLD VERSIONS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SCENARIO: A product shipped in March 2024. In December 2024, there's      │
│  a lawsuit asking "Was this product compliant when it shipped?"            │
│                                                                             │
│  We need to check against the rules THAT EXISTED IN MARCH 2024!            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    VERSION CHAIN                                    │   │
│  │                                                                     │   │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │   │
│  │   │ REACH_SVHC  │    │ REACH_SVHC  │    │ REACH_SVHC  │            │   │
│  │   │ v2023-01    │--->│ v2023-06    │--->│ v2024-01    │            │   │
│  │   │             │    │             │    │             │            │   │
│  │   │ 180 entries │    │ 195 entries │    │ 210 entries │            │   │
│  │   │             │    │             │    │ (CURRENT)   │            │   │
│  │   │ superseded: │    │ superseded: │    │ isCurrentV: │            │   │
│  │   │ 2023-06-01  │    │ 2024-01-15  │    │   TRUE      │            │   │
│  │   └─────────────┘    └─────────────┘    └─────────────┘            │   │
│  │         ^                                                          │   │
│  │         │                                                          │   │
│  │    We can still query: "What were the rules on 2023-03-15?"        │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  KEY RULES:                                                                 │
│    * Old versions are NEVER deleted                                        │
│    * Old versions are NEVER modified                                       │
│    * Only ONE version is "current" at a time                               │
│    * New imports create NEW versions, supersede old ones                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Snapshots (Protecting Against Data Drift)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WHY WE USE SNAPSHOTS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PROBLEM: What if someone "fixes" the substance name later?                │
│                                                                             │
│     BEFORE:                                AFTER:                           │
│     ┌──────────────────┐                   ┌──────────────────┐            │
│     │ Substance        │                   │ Substance        │            │
│     │ CAS: 50-00-0     │   Someone        │ CAS: 50-00-0     │            │
│     │ name: "Formalin" │   "corrects"     │ name: "Formal-   │            │
│     │      (wrong!)    │   ──────────>    │        dehyde"   │            │
│     └──────────────────┘                   └──────────────────┘            │
│                                                                             │
│  If our list entry just REFERENCES the substance, the audit trail breaks!  │
│                                                                             │
│  SOLUTION: Store a SNAPSHOT at the time of import                          │
│                                                                             │
│     ┌─────────────────────────────────────────────────────────────────┐    │
│     │                    LIST ENTRY                                   │    │
│     ├─────────────────────────────────────────────────────────────────┤    │
│     │  substance:           ────-> (FK to Substance entity)           │    │
│     │                                                                 │    │
│     │  casNumberSnapshot:   "50-00-0"      <-- FROZEN at import time │    │
│     │  substanceNameSnapshot: "Formalin"   <-- FROZEN at import time │    │
│     │                                                                 │    │
│     │  Even if someone "fixes" the Substance, our entry still shows  │    │
│     │  exactly what was imported and when!                           │    │
│     └─────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: How Categories Work (LTREE Magic) - Plan 11

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRODUCT CATEGORY HIERARCHY                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Products are organized in a TREE structure:                               │
│                                                                             │
│                          products                                           │
│                             │                                               │
│             ┌───────────────┼───────────────┐                              │
│             │               │               │                              │
│        electronics      cosmetics      food_packaging                      │
│             │               │               │                              │
│       ┌─────┴─────┐    ┌────┴────┐     ┌───┴───┐                          │
│       │           │    │         │     │       │                          │
│    phones     laptops skincare haircare bottles cans                       │
│                           │                                                 │
│                     ┌─────┴─────┐                                          │
│                     │           │                                          │
│                moisturizers  serums                                         │
│                                                                             │
│                                                                             │
│  In the database, we store this as LTREE paths:                            │
│                                                                             │
│     ┌────────────────────────────────────────────────────┐                 │
│     │  Category               Path (LTREE)               │                 │
│     ├────────────────────────────────────────────────────┤                 │
│     │  Products               products                   │                 │
│     │  Electronics            products.electronics       │                 │
│     │  Cosmetics              products.cosmetics         │                 │
│     │  Skincare               products.cosmetics.skincare│                 │
│     │  Moisturizers           products.cosmetics.skincare.moisturizers     │
│     └────────────────────────────────────────────────────┘                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why LTREE is Powerful

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LTREE INHERITANCE                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  The magic: Child categories INHERIT rules from parents!                   │
│                                                                             │
│  Step 1: Assign regulatory lists at different levels:                      │
│                                                                             │
│         products ─────────────────────┐                                    │
│             │                         │ REACH_SVHC applies here            │
│             │                         │ (ALL products must check REACH)    │
│             │                         │                                    │
│         cosmetics ────────────────────┤                                    │
│             │                         │ COSING_ANNEX_II applies here       │
│             │                         │ (cosmetics-specific rules)         │
│             │                         │                                    │
│         skincare                      │                                    │
│             │                         │                                    │
│         moisturizers <────────────────┘                                    │
│                          │                                                 │
│                          └─── This product INHERITS BOTH:                  │
│                               * REACH_SVHC (from "products")               │
│                               * COSING_ANNEX_II (from "cosmetics")         │
│                                                                             │
│                                                                             │
│  The SQL query uses the @> operator:                                       │
│                                                                             │
│    SELECT * FROM category_regulatory_list crl                              │
│    JOIN category c ON c.id = crl.category_id                               │
│    WHERE c.path @> 'products.cosmetics.skincare.moisturizers'              │
│                                                                             │
│    This finds ALL ancestors automatically!                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Exclusions (Breaking Inheritance)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXCLUSION EXAMPLE                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Sometimes a child category should NOT inherit a parent's rule:            │
│                                                                             │
│         products ──── REACH_SVHC (applies to all)                          │
│             │                                                              │
│         cosmetics ── (inherits REACH)                                      │
│             │                                                              │
│         medical_devices ── EXCLUSION: exempt from REACH!                   │
│             │               (medical devices have their own regulations)   │
│             │                                                              │
│         surgical_tools ── Does NOT inherit REACH                           │
│                          (because parent excluded it)                      │
│                                                                             │
│                                                                             │
│  In the database:                                                          │
│                                                                             │
│     ┌─────────────────────────────────────────────────────────────────┐    │
│     │  CategoryRegulatoryList                                         │    │
│     ├─────────────────────────────────────────────────────────────────┤    │
│     │  category:      medical_devices                                 │    │
│     │  regulatoryList: REACH_SVHC                                     │    │
│     │  isExclusion:   TRUE    <-- This breaks the inheritance chain! │    │
│     └─────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Dual Category Model (System vs Tenant)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TWO TYPES OF CATEGORIES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  The system has TWO category models that work together:                     │
│                                                                             │
│                                                                             │
│   PUBLIC SCHEMA                          TENANT SCHEMA                      │
│   ─────────────                          ─────────────                      │
│                                                                             │
│   ┌─────────────────────────────┐        ┌─────────────────────────────┐   │
│   │     SYSTEM CATEGORIES       │        │    TENANT CATEGORIES        │   │
│   │    (public.category)        │        │   (tenant.tenant_category)  │   │
│   ├─────────────────────────────┤        ├─────────────────────────────┤   │
│   │                             │        │                             │   │
│   │  • Shared taxonomy          │        │  • Tenant-owned categories  │   │
│   │  • Managed by platform      │        │  • Custom for this org      │   │
│   │  • Has regulatory mappings  │        │  • No system mappings       │   │
│   │  • Tenants can ADOPT these  │        │  • Must self-manage regs    │   │
│   │                             │        │                             │   │
│   │  Examples:                  │        │  Examples:                  │   │
│   │   • products.cosmetics      │        │   • custom.widgets          │   │
│   │   • products.electronics    │        │   • internal.prototypes     │   │
│   │   • products.medical        │        │   • legacy.old_products     │   │
│   │                             │        │                             │   │
│   └─────────────────────────────┘        └─────────────────────────────┘   │
│                                                                             │
│                                                                             │
│   WHY TWO MODELS?                                                          │
│   ───────────────                                                          │
│                                                                             │
│   System Categories:                                                        │
│     + Come with pre-configured regulatory mappings                         │
│     + Stay current when regulations change                                 │
│     + Industry-standard taxonomy                                           │
│     - Less flexibility for unique business needs                           │
│                                                                             │
│   Tenant Categories:                                                        │
│     + Full flexibility and control                                         │
│     + Can model any business structure                                     │
│     - Must manually configure regulatory lists                             │
│     - No automatic updates                                                 │
│                                                                             │
│                                                                             │
│   RECOMMENDATION: Adopt system categories when possible!                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 6: Category Adoption (LIVE, FROZEN, DETACHED)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CATEGORY ADOPTION MODES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  When a tenant adopts a system category, they choose an ADOPTION MODE:     │
│                                                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  MODE: LIVE (Recommended)                                           │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  "Always use the CURRENT system category definitions"               │   │
│  │                                                                     │   │
│  │   System Category                      Tenant's View                │   │
│  │   ┌─────────────────┐                 ┌─────────────────┐          │   │
│  │   │ cosmetics       │    LIVE LINK    │ cosmetics       │          │   │
│  │   │ v2024-06        │ <──────────────>│ (always current)│          │   │
│  │   │ +5 new regs     │                 │ sees 5 new regs │          │   │
│  │   └─────────────────┘                 └─────────────────┘          │   │
│  │                                                                     │   │
│  │   Pros: Always up-to-date, automatic regulation updates            │   │
│  │   Cons: Changes may surprise you, need to stay vigilant            │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  MODE: FROZEN                                                       │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  "Lock to the category definition AT A SPECIFIC POINT IN TIME"     │   │
│  │                                                                     │   │
│  │   System Category                      Tenant's View                │   │
│  │   ┌─────────────────┐                 ┌─────────────────┐          │   │
│  │   │ cosmetics       │   FROZEN AT     │ cosmetics       │          │   │
│  │   │ v2024-06        │   2024-01-15    │ (frozen state)  │          │   │
│  │   │ +5 new regs     │ ──────X         │ OLD regulations │          │   │
│  │   └─────────────────┘                 └─────────────────┘          │   │
│  │                                                                     │   │
│  │   Pros: Predictable, no surprise changes, audit stability          │   │
│  │   Cons: May become outdated, misses important regulation updates   │   │
│  │                                                                     │   │
│  │   USE CASE: "We're in the middle of certification, don't change!"  │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  MODE: DETACHED                                                     │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  "Take a snapshot and completely disconnect from system"            │   │
│  │                                                                     │   │
│  │   System Category                      Tenant's Category            │   │
│  │   ┌─────────────────┐                 ┌─────────────────┐          │   │
│  │   │ cosmetics       │    DETACHED     │ my_cosmetics    │          │   │
│  │   │ v2024-06        │ ───────X        │ (independent)   │          │   │
│  │   │ (continues...)  │                 │ can add/remove  │          │   │
│  │   └─────────────────┘                 │ regulations     │          │   │
│  │                                       └─────────────────┘          │   │
│  │                                                                     │   │
│  │   Pros: Complete control, can customize everything                 │   │
│  │   Cons: No automatic updates, full responsibility for compliance   │   │
│  │                                                                     │   │
│  │   USE CASE: "We need to model a unique regulatory situation"       │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                                                             │
│  ADOPTION LIFECYCLE:                                                       │
│  ────────────────────                                                      │
│                                                                             │
│    ┌──────┐                ┌────────┐               ┌──────────┐          │
│    │ LIVE │ ──"freeze"──>  │ FROZEN │ ──"detach"──> │ DETACHED │          │
│    └──────┘                └────────┘               └──────────┘          │
│        ^                       │                                          │
│        └───────"unfreeze"──────┘                                          │
│                                                                             │
│    Note: DETACHED is a one-way operation (cannot re-attach)               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 7: Compliance Stack Resolution (3 Layers)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HOW REGULATORY LISTS ARE RESOLVED                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  When checking compliance, the system resolves regulations through         │
│  THREE LAYERS that stack on top of each other:                             │
│                                                                             │
│                                                                             │
│    LAYER 3: Tenant Exemptions (subtract)                                   │
│    ───────────────────────────────────────                                 │
│    "These regulations don't apply to us (with justification)"              │
│                                                                             │
│        ┌─────────────────────────────────────────────────────────────┐     │
│        │  TenantCategoryRegulatoryList (isExempted = true)           │     │
│        │                                                             │     │
│        │  - COSING_ANNEX_III: "Exempt - B2B industrial use only"    │     │
│        │    (with legal reference and audit trail)                   │     │
│        └─────────────────────────────────────────────────────────────┘     │
│                              │                                             │
│                              │ SUBTRACT                                    │
│                              v                                             │
│    LAYER 2: Tenant Additions (add)                                         │
│    ───────────────────────────────────                                     │
│    "We also need to check these additional lists"                          │
│                                                                             │
│        ┌─────────────────────────────────────────────────────────────┐     │
│        │  TenantCategoryRegulatoryList (source = TENANT_ADDED)       │     │
│        │                                                             │     │
│        │  + CALIFORNIA_PROP65: "We sell in California"               │     │
│        │  + INTERNAL_RESTRICTED: "Company-specific bans"             │     │
│        └─────────────────────────────────────────────────────────────┘     │
│                              │                                             │
│                              │ ADD TO                                      │
│                              v                                             │
│    LAYER 1: System Baseline (base)                                         │
│    ───────────────────────────────────                                     │
│    "Default regulations from the adopted system category"                  │
│                                                                             │
│        ┌─────────────────────────────────────────────────────────────┐     │
│        │  CategoryRegulatoryList (public schema)                     │     │
│        │                                                             │     │
│        │  * REACH_SVHC: Required for all products                    │     │
│        │  * COSING_ANNEX_II: Required for cosmetics                  │     │
│        │  * COSING_ANNEX_III: Required for cosmetics                 │     │
│        └─────────────────────────────────────────────────────────────┘     │
│                                                                             │
│                                                                             │
│  RESOLUTION EXAMPLE:                                                       │
│  ────────────────────                                                      │
│                                                                             │
│    Tenant: Acme Corp                                                       │
│    Category: products.cosmetics (adopted in LIVE mode)                     │
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────┐     │
│    │  EFFECTIVE REGULATORY LISTS                                     │     │
│    ├─────────────────────────────────────────────────────────────────┤     │
│    │                                                                 │     │
│    │  From System (Layer 1):                                         │     │
│    │    [x] REACH_SVHC                                               │     │
│    │    [x] COSING_ANNEX_II                                          │     │
│    │    [~] COSING_ANNEX_III  <-- Will be exempted                   │     │
│    │                                                                 │     │
│    │  From Tenant Additions (Layer 2):                               │     │
│    │    [+] CALIFORNIA_PROP65                                        │     │
│    │                                                                 │     │
│    │  From Tenant Exemptions (Layer 3):                              │     │
│    │    [-] COSING_ANNEX_III  <-- Removed with justification        │     │
│    │                                                                 │     │
│    │  ═══════════════════════════════════════════════════════════   │     │
│    │  FINAL RESULT:                                                  │     │
│    │    * REACH_SVHC                                                 │     │
│    │    * COSING_ANNEX_II                                            │     │
│    │    * CALIFORNIA_PROP65                                          │     │
│    │                                                                 │     │
│    └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│                                                                             │
│  THE ComplianceStackResolver SERVICE:                                      │
│  ─────────────────────────────────────                                     │
│                                                                             │
│    Input:  CategoryAdoption (or TenantCategory)                            │
│    Output: List of effective RegulatoryLists                               │
│                                                                             │
│    The resolver handles all the complexity of:                             │
│      1. Fetching system baseline from CategoryRegulatoryList               │
│      2. Adding tenant-added lists from TenantCategoryRegulatoryList        │
│      3. Removing exempted lists (checking allowTenantExemption first!)     │
│      4. Returning the final effective list                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 8: Tenant Exemptions (With Audit Trail)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXEMPTION SYSTEM                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Sometimes a tenant legitimately doesn't need to comply with a regulation. │
│  The system allows EXEMPTIONS with full justification and audit trail.     │
│                                                                             │
│                                                                             │
│  EXEMPTION REQUIREMENTS:                                                   │
│  ────────────────────────                                                  │
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────┐     │
│    │  TenantCategoryRegulatoryList (exemption record)                │     │
│    ├─────────────────────────────────────────────────────────────────┤     │
│    │                                                                 │     │
│    │  regulatoryListId: COSING_ANNEX_III                            │     │
│    │  isExempted:       TRUE                                         │     │
│    │                                                                 │     │
│    │  --- REQUIRED JUSTIFICATION ---                                 │     │
│    │  exemptionReason:  "B2B industrial use only, not consumer"     │     │
│    │  legalReference:   "Article 2(2)(a) of Regulation 1223/2009"   │     │
│    │                                                                 │     │
│    │  --- AUTOMATIC AUDIT TRAIL ---                                  │     │
│    │  exemptedBy:       user-uuid-who-created-exemption              │     │
│    │  exemptedAt:       2024-06-15T10:30:00Z                         │     │
│    │                                                                 │     │
│    └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│                                                                             │
│  THE allowTenantExemption GUARDRAIL:                                       │
│  ────────────────────────────────────                                      │
│                                                                             │
│    Some regulations are TOO CRITICAL to allow exemptions!                  │
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────┐     │
│    │  RegulatoryList                                                 │     │
│    ├─────────────────────────────────────────────────────────────────┤     │
│    │  code:                REACH_SVHC                                │     │
│    │  name:                REACH Substances of Very High Concern     │     │
│    │  allowTenantExemption: FALSE  <-- CANNOT BE EXEMPTED!          │     │
│    └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────┐     │
│    │  CategoryRegulatoryList (system mapping)                        │     │
│    ├─────────────────────────────────────────────────────────────────┤     │
│    │  categoryPath:        products.cosmetics                        │     │
│    │  regulatoryList:      COSING_ANNEX_II                           │     │
│    │  allowTenantExemption: FALSE  <-- Can also be set per-mapping! │     │
│    └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│    The system checks BOTH flags:                                           │
│      1. RegulatoryList.allowTenantExemption (global setting)               │
│      2. CategoryRegulatoryList.allowTenantExemption (per-mapping)          │
│                                                                             │
│    If EITHER is FALSE, the exemption is BLOCKED.                           │
│                                                                             │
│                                                                             │
│  EXEMPTION WORKFLOW:                                                       │
│  ────────────────────                                                      │
│                                                                             │
│    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│    │ User Request │    │   System     │    │   Result     │               │
│    │  Exemption   │--->│   Checks     │--->│              │               │
│    └──────────────┘    └──────────────┘    └──────────────┘               │
│                              │                                             │
│                              │                                             │
│                    ┌─────────┴─────────┐                                  │
│                    │                   │                                  │
│                    v                   v                                  │
│           ┌──────────────┐    ┌──────────────┐                           │
│           │ Exemption    │    │ Exemption    │                           │
│           │ ALLOWED?     │    │ BLOCKED      │                           │
│           │              │    │              │                           │
│           │ Check flags: │    │ Returns 403  │                           │
│           │ - List flag  │    │ "Cannot      │                           │
│           │ - Mapping    │    │  exempt this │                           │
│           │   flag       │    │  regulation" │                           │
│           └──────┬───────┘    └──────────────┘                           │
│                  │                                                        │
│                  v                                                        │
│           ┌──────────────┐                                               │
│           │ Require      │                                               │
│           │ Justification│                                               │
│           │              │                                               │
│           │ - reason     │                                               │
│           │ - legalRef   │                                               │
│           └──────┬───────┘                                               │
│                  │                                                        │
│                  v                                                        │
│           ┌──────────────┐                                               │
│           │ Create Audit │                                               │
│           │ Trail        │                                               │
│           │              │                                               │
│           │ - who        │                                               │
│           │ - when       │                                               │
│           └──────────────┘                                               │
│                                                                             │
│                                                                             │
│  AUDIT TRAIL USAGE:                                                        │
│  ───────────────────                                                       │
│                                                                             │
│    The exemption audit trail is crucial for:                               │
│      * Regulatory audits ("Who approved this exemption?")                  │
│      * Internal compliance reviews                                         │
│      * Legal liability protection                                          │
│      * Change history tracking                                             │
│                                                                             │
│    Query: "Show me all exemptions created in the last 30 days"             │
│    Query: "Who exempted COSING_ANNEX_III for our cosmetics line?"          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 9: The Admin Import Pipeline (Plan 12)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HOW NEW DATA GETS INTO THE SYSTEM                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  The EU publishes updated regulatory lists. An admin needs to import them. │
│                                                                             │
│  THE WORKFLOW:                                                              │
│                                                                             │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Step 1  │    │   Step 2    │    │   Step 3    │    │   Step 4    │     │
│  │         │    │             │    │             │    │             │     │
│  │ Upload  │--->│  Validate   │--->│   Preview   │--->│   Apply     │     │
│  │  File   │    │   & Parse   │    │    Diff     │    │  Changes    │     │
│  │         │    │             │    │             │    │             │     │
│  └─────────┘    └─────────────┘    └─────────────┘    └─────────────┘     │
│       │               │                   │                   │            │
│       │               │                   │                   │            │
│       v               v                   v                   v            │
│   CSV or JSON    * Check CAS         "You're about       * Create new     │
│   file with      * Validate format     to add 5          version         │
│   substance      * Match to our        remove 2          * Log who/when   │
│   data             Substance DB        update 12"        * Supersede old  │
│                                                                             │
│                                                                             │
│  SAFETY FEATURES:                                                          │
│                                                                             │
│   [x] CAS Checksum Validation                                              │
│       * CAS numbers have a built-in check digit                            │
│       * "50-00-0" <-- last digit is checksum                               │
│       * Catches typos before they enter the system                         │
│                                                                             │
│   [x] Preview Before Apply                                                 │
│       * Admin sees exactly what will change                                │
│       * Can cancel if something looks wrong                                │
│                                                                             │
│   [x] Audit Log                                                            │
│       * Every import is logged                                             │
│       * Who did it, when, what changed                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 10: Rule Evaluation (Plan 14) - The Actual Compliance Check

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HOW COMPLIANCE CHECKING WORKS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SCENARIO: Checking a moisturizer product for compliance                   │
│                                                                             │
│  +=====================================================================+   │
│  |  PRODUCT: "Hydrating Day Cream"                                     |   │
│  |  Category: products.cosmetics.skincare.moisturizers                 |   │
│  |                                                                     |   │
│  |  Contains (rolled up from raw materials):                           |   │
│  |    * Formaldehyde (50-00-0): 0.05%                                  |   │
│  |    * Lead (7439-92-1): 0.0001%                                      |   │
│  |    * Zinc (7440-66-6): 2.5%                                         |   │
│  +=====================================================================+   │
│                                                                             │
│                                                                             │
│  STEP 1: Find applicable lists (using LTREE inheritance)                   │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│    Query: "What lists apply to products.cosmetics.skincare.moisturizers?"  │
│                                                                             │
│    Answer:                                                                  │
│      * REACH_SVHC (inherited from "products")                              │
│      * COSING_ANNEX_II (inherited from "cosmetics")                        │
│                                                                             │
│                                                                             │
│  STEP 2: Check each substance against each list                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────────┐ │
│    │ Substance: Formaldehyde (50-00-0)                                   │ │
│    │                                                                     │ │
│    │   vs REACH_SVHC:                                                    │ │
│    │       Not in list --> PASS                                          │ │
│    │                                                                     │ │
│    │   vs COSING_ANNEX_II:                                               │ │
│    │       Found! Type = PROHIBITED                                      │ │
│    │       Concentration = 0.05% (any amount > 0 fails)                  │ │
│    │       --> FAIL: PROHIBITED_SUBSTANCE                                │ │
│    └─────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────────┐ │
│    │ Substance: Lead (7439-92-1)                                         │ │
│    │                                                                     │ │
│    │   vs REACH_SVHC:                                                    │ │
│    │       Found! Type = THRESHOLD, limit = 0.1%                         │ │
│    │       Concentration = 0.0001%                                       │ │
│    │       0.0001% < 0.1% --> PASS                                       │ │
│    │                                                                     │ │
│    │   vs COSING_ANNEX_II:                                               │ │
│    │       Found! Type = PROHIBITED                                      │ │
│    │       --> FAIL: PROHIBITED_SUBSTANCE                                │ │
│    └─────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────────┐ │
│    │ Substance: Zinc (7440-66-6)                                         │ │
│    │                                                                     │ │
│    │   vs REACH_SVHC:      Not in list --> PASS                          │ │
│    │   vs COSING_ANNEX_II: Not in list --> PASS                          │ │
│    └─────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                                                                             │
│  STEP 3: Generate Findings                                                 │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────────┐ │
│    │ FINDING #1                                                          │ │
│    ├─────────────────────────────────────────────────────────────────────┤ │
│    │ Status:     FAILED                                                  │ │
│    │ Severity:   BLOCKER (product cannot ship!)                          │ │
│    │ Issue:      PROHIBITED_SUBSTANCE                                    │ │
│    │                                                                     │ │
│    │ Substance:  Formaldehyde (50-00-0) at 0.05%                         │ │
│    │ List:       COSING_ANNEX_II v2024-06                                │ │
│    │ Legal Ref:  Entry 1577                                              │ │
│    │                                                                     │ │
│    │ Traceability:                                                       │ │
│    │   └─ Came from "Preservative Blend" (supplier: Acme Chemicals)      │ │
│    │      └─ 2.5% formaldehyde in material                               │ │
│    │      └─ Material is 2% of product --> 0.05% contribution            │ │
│    │                                                                     │ │
│    │ Remediation: Remove formaldehyde or use approved alternative        │ │
│    └─────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 11: The Two Evaluation Scopes (REACH vs RoHS)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ARTICLE vs HOMOGENEOUS_MATERIAL                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Different regulations measure concentration differently!                   │
│                                                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ SCOPE: ARTICLE (used by REACH)                                      │   │
│  │                                                                     │   │
│  │ "What's the total concentration in the WHOLE product?"              │   │
│  │                                                                     │   │
│  │     ┌───────────────────────────────────────────┐                   │   │
│  │     │           LAPTOP (1000g)                  │                   │   │
│  │     │  ┌─────────┐  ┌─────────┐  ┌─────────┐   │                   │   │
│  │     │  │ Battery │  │ Screen  │  │ Casing  │   │                   │   │
│  │     │  │  200g   │  │  300g   │  │  500g   │   │                   │   │
│  │     │  │ 2% lead │  │ 0% lead │  │ 0% lead │   │                   │   │
│  │     │  └─────────┘  └─────────┘  └─────────┘   │                   │   │
│  │     └───────────────────────────────────────────┘                   │   │
│  │                                                                     │   │
│  │     Total lead = (200g x 2%) / 1000g = 0.4%                         │   │
│  │     Check: 0.4% vs 0.1% threshold --> FAIL                          │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ SCOPE: HOMOGENEOUS_MATERIAL (used by RoHS)                          │   │
│  │                                                                     │   │
│  │ "Check EACH material separately!"                                   │   │
│  │                                                                     │   │
│  │     ┌───────────────────────────────────────────┐                   │   │
│  │     │           LAPTOP                          │                   │   │
│  │     │  ┌─────────┐  ┌─────────┐  ┌─────────┐   │                   │   │
│  │     │  │ Battery │  │ Screen  │  │ Casing  │   │                   │   │
│  │     │  │ 2% lead │  │ 0% lead │  │ 0% lead │   │                   │   │
│  │     │  │  FAIL!  │  │  PASS   │  │  PASS   │   │                   │   │
│  │     │  └─────────┘  └─────────┘  └─────────┘   │                   │   │
│  │     └───────────────────────────────────────────┘                   │   │
│  │                                                                     │   │
│  │     Battery: 2% lead vs 0.1% threshold --> FAIL                     │   │
│  │     (Each material checked independently)                           │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  WHY THIS MATTERS:                                                         │
│  Same laptop, same lead, but:                                              │
│    * Under ARTICLE scope: Could PASS if lead diluted across whole product  │
│    * Under HOMOGENEOUS: Always FAILS because battery material fails        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 12: How It All Connects

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    THE COMPLETE DATA FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                        ┌─────────────────────┐                             │
│                        │   EU Publishes New  │                             │
│                        │   REACH List v2024  │                             │
│                        └──────────┬──────────┘                             │
│                                   │                                        │
│                                   v                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     ADMIN IMPORT (Plan 12)                           │  │
│  │   1. Upload CSV                                                      │  │
│  │   2. Validate CAS numbers                                            │  │
│  │   3. Preview changes                                                 │  │
│  │   4. Apply --> Creates new immutable version                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                   │                                        │
│                                   v                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                  REGULATORY LISTS (Plan 10)                          │  │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │  │
│  │   │ REACH_SVHC  │  │ ROHS_       │  │ COSING_     │                 │  │
│  │   │ v2024-01    │  │ RESTRICTED  │  │ ANNEX_II    │                 │  │
│  │   │ 210 entries │  │ 10 entries  │  │ 1600 entries│                 │  │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                   │                                        │
│                                   v                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                  CATEGORY SCOPING (Plan 11)                          │  │
│  │                                                                      │  │
│  │   products ─────────────── REACH_SVHC                               │  │
│  │       │                                                              │  │
│  │       ├── electronics ──── ROHS_RESTRICTED                          │  │
│  │       │                                                              │  │
│  │       └── cosmetics ────── COSING_ANNEX_II                          │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                   │                                        │
│                                   v                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                  RULE EVALUATION (Plan 14)                           │  │
│  │                                                                      │  │
│  │   INPUT:                        OUTPUT:                              │  │
│  │   ┌─────────────────┐          ┌─────────────────────────────────┐  │  │
│  │   │ Product         │          │ Findings                        │  │  │
│  │   │ - Category      │   --->   │ - Violations                    │  │  │
│  │   │ - Substances    │          │ - Traceability                  │  │  │
│  │   │ - Concentrations│          │ - Legal References              │  │  │
│  │   └─────────────────┘          │ - Remediation Suggestions       │  │  │
│  │                                 └─────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary: The Key Concepts

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KEY CONCEPTS TO REMEMBER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. REGULATORY LIST                                                        │
│     A collection of substances with restrictions (like a book of rules)    │
│                                                                             │
│  2. LIST ENTRY                                                             │
│     One substance in a list with its restriction type and threshold        │
│                                                                             │
│  3. IMMUTABLE VERSIONS                                                     │
│     Old list versions are kept forever for audit trail                     │
│                                                                             │
│  4. SNAPSHOTS                                                              │
│     Freeze substance names at import time to prevent data drift            │
│                                                                             │
│  5. LTREE INHERITANCE                                                      │
│     Child categories automatically inherit parent's regulatory lists       │
│                                                                             │
│  6. DUAL CATEGORY MODEL                                                    │
│     System Categories (public) = shared taxonomy with regulatory mappings  │
│     Tenant Categories (tenant) = custom categories for unique needs        │
│                                                                             │
│  7. CATEGORY ADOPTION MODES                                                │
│     LIVE = always current, automatic updates                               │
│     FROZEN = locked at a point in time, predictable                        │
│     DETACHED = completely independent, full control                        │
│                                                                             │
│  8. COMPLIANCE STACK (3 Layers)                                            │
│     Layer 1: System baseline (from CategoryRegulatoryList)                 │
│     Layer 2: Tenant additions (from TenantCategoryRegulatoryList)          │
│     Layer 3: Tenant exemptions (subtract with justification)               │
│                                                                             │
│  9. EXEMPTIONS WITH AUDIT TRAIL                                            │
│     Tenants can exempt certain regulations with:                           │
│       - Required justification (reason + legal reference)                  │
│       - Automatic audit trail (who, when)                                  │
│       - Subject to allowTenantExemption guardrails                         │
│                                                                             │
│ 10. allowTenantExemption GUARDRAIL                                         │
│     Critical regulations can be marked non-exemptable:                     │
│       - Set on RegulatoryList (global)                                     │
│       - Set on CategoryRegulatoryList (per-mapping)                        │
│       - If EITHER is false, exemption is blocked                           │
│                                                                             │
│ 11. EVALUATION SCOPE                                                       │
│     ARTICLE = whole product concentration                                  │
│     HOMOGENEOUS_MATERIAL = each material checked separately                │
│                                                                             │
│ 12. TRACEABILITY                                                           │
│     Track exactly which raw materials contributed to a violation           │
│                                                                             │
│ 13. RESTRICTION TYPES                                                      │
│     PROHIBITED = cannot use at all                                         │
│     THRESHOLD = must be below X%                                           │
│     RESTRICTED_WITH_CONDITIONS = allowed only in certain uses              │
│                                                                             │
│ 14. ADMIN IMPORT                                                           │
│     Safe process: Upload --> Validate --> Preview --> Apply                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATABASE ENTITIES (PUBLIC SCHEMA)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                                                                             │
│  ┌─────────────────┐         ┌─────────────────────────┐                   │
│  │    Substance    │         │    RegulatoryList       │                   │
│  ├─────────────────┤         ├─────────────────────────┤                   │
│  │ id              │         │ id                      │                   │
│  │ casNumber       │         │ code                    │                   │
│  │ primaryName     │         │ name                    │                   │
│  │ ...             │         │ source                  │                   │
│  └────────┬────────┘         │ version                 │                   │
│           │                  │ effectiveDate           │                   │
│           │                  │ isCurrentVersion        │                   │
│           │                  │ allowTenantExemption    │ <-- NEW!          │
│           │                  │ previousVersion (FK)--->│ (self-reference)  │
│           │                  └───────────┬─────────────┘                   │
│           │                              │                                 │
│           │      ┌───────────────────────┘                                 │
│           │      │                                                         │
│           v      v                                                         │
│  ┌─────────────────────────────────┐                                       │
│  │    RegulatoryListEntry          │                                       │
│  ├─────────────────────────────────┤                                       │
│  │ id                              │                                       │
│  │ list (FK) ──────────────────────│───> RegulatoryList                    │
│  │ substance (FK) ─────────────────│───> Substance                         │
│  │ casNumberSnapshot               │                                       │
│  │ substanceNameSnapshot           │                                       │
│  │ restrictionType                 │                                       │
│  │ thresholdPct                    │                                       │
│  │ conditions (JSONB)              │                                       │
│  │ legalReference                  │                                       │
│  └─────────────────────────────────┘                                       │
│                                                                             │
│                                                                             │
│  ┌─────────────────┐         ┌─────────────────────────┐                   │
│  │    Category     │         │ CategoryRegulatoryList  │                   │
│  │ (System Taxon.) │         │ (System Mappings)       │                   │
│  ├─────────────────┤         ├─────────────────────────┤                   │
│  │ id              │<────────│ category (FK)           │                   │
│  │ name            │         │ regulatoryList (FK) ────│───> RegulatoryList│
│  │ path (LTREE)    │         │ requirement             │                   │
│  │ depth           │         │ priority                │                   │
│  │ parent (FK)     │         │ isExclusion             │                   │
│  └─────────────────┘         │ allowTenantExemption    │ <-- NEW!          │
│                              │ thresholdOverridePct    │                   │
│                              └─────────────────────────┘                   │
│                                                                             │
│                                                                             │
│  ┌─────────────────────────────────┐                                       │
│  │    RegulatoryImportLog          │  (Audit Trail)                        │
│  ├─────────────────────────────────┤                                       │
│  │ id                              │                                       │
│  │ listCode                        │                                       │
│  │ version                         │                                       │
│  │ adminId                         │                                       │
│  │ changes (JSONB)                 │                                       │
│  │ appliedAt                       │                                       │
│  │ sourceFileName                  │                                       │
│  └─────────────────────────────────┘                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATABASE ENTITIES (TENANT SCHEMA)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                                                                             │
│  ┌─────────────────────────────────┐                                       │
│  │    TenantCategory               │  (Tenant-owned categories)            │
│  ├─────────────────────────────────┤                                       │
│  │ id                              │                                       │
│  │ name                            │                                       │
│  │ path (LTREE)                    │                                       │
│  │ depth                           │                                       │
│  │ parent (FK)                     │                                       │
│  └─────────────────────────────────┘                                       │
│                                                                             │
│                                                                             │
│  ┌─────────────────────────────────┐                                       │
│  │    CategoryAdoption             │  (Links tenant to system categories)  │
│  ├─────────────────────────────────┤                                       │
│  │ id                              │                                       │
│  │ systemCategoryId (FK) ──────────│───> Category (public schema)          │
│  │ mode                            │     LIVE | FROZEN | DETACHED          │
│  │ frozenAt                        │     (timestamp for FROZEN mode)       │
│  │ pinnedRegulatoryListIds[]       │     (for FROZEN: specific versions)   │
│  └─────────────────────────────────┘                                       │
│                                                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │    TenantCategoryRegulatoryList                                     │   │
│  │    (Tenant additions/exemptions)                                    │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ id                                                                  │   │
│  │ categoryAdoptionId (FK) ────────│───> CategoryAdoption              │   │
│  │   OR                                                                │   │
│  │ tenantCategoryId (FK) ──────────│───> TenantCategory                │   │
│  │                                                                     │   │
│  │ regulatoryListId (FK) ──────────│───> RegulatoryList (public)       │   │
│  │                                                                     │   │
│  │ source                          │     SYSTEM_INHERITED | TENANT_ADDED   │
│  │ requirement                     │     MANDATORY | RECOMMENDED | CUSTOM  │
│  │                                                                     │   │
│  │ --- Exemption Fields ---                                            │   │
│  │ isExempted                      │     TRUE if exempted              │   │
│  │ exemptionReason                 │     "Why this exemption?"         │   │
│  │ legalReference                  │     "Article X of Regulation Y"   │   │
│  │ exemptedBy (FK)                 │     User who created exemption    │   │
│  │ exemptedAt                      │     Timestamp of exemption        │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                                                             │
│   RELATIONSHIPS:                                                            │
│   ──────────────                                                            │
│                                                                             │
│   System Category (public)                                                  │
│          │                                                                  │
│          │ adopted by                                                       │
│          v                                                                  │
│   CategoryAdoption (tenant)                                                 │
│          │                                                                  │
│          │ has tenant-specific regulatory config                           │
│          v                                                                  │
│   TenantCategoryRegulatoryList (tenant)                                    │
│          │                                                                  │
│          │ references                                                       │
│          v                                                                  │
│   RegulatoryList (public)                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- **Design Document**: `docs/plans/2026-01-26-regulatory-vertical-system-design.md`
- **Plan 10**: Regulatory List Registry
- **Plan 11**: Category-List Scoping
- **Plan 12**: Admin Import Pipeline
- **Plan 14**: Vertical Rule Evaluation
- **Plan 15**: Regulatory Seeders

---

*Document created: 2026-01-26*
*Last updated: 2026-01-27 - Added compliance stack architecture (dual categories, adoption modes, 3-layer resolution, exemptions)*
