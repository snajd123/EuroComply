# EuroComply Implementation Plan

## Compliance-First Product Information Management Platform

---

## 1. Executive Summary

EuroComply is a Compliance-First Product Information Management (PIM) platform with Digital Product Passports (DPP) as a core capability. The platform provides tools for managing product data, generating EU ESPR-compliant DPPs, and syndicating products to e-commerce channels.

### Core Concept

The **Golden Record** - a unified product model containing both commercial attributes (name, price, images) and compliance data (materials, certifications, carbon footprint). Products appear in the DPP Ready list when completeness reaches 100%, and users manually review and approve issuance.

### Target Market

**Primary (ESPR Compliance)**
- Brands, manufacturers, distributors managing 100-5,000 SKUs
- First movers in textiles, batteries, electronics, furniture
- Organizations needing both PIM and compliance functionality

**Secondary (PIM-First)**
- Industries not yet subject to ESPR but needing structured product data
- Food & beverage, cosmetics, industrial goods, specialty retail
- Organizations wanting future-proof product management with optional DPP readiness

**NOT Target**
- Enterprise (they have SAP, Akeneo, custom solutions)

---

## 2. Technology Stack

### Backend

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js 20+ | Async I/O, excellent for API syndication |
| Language | TypeScript | Type safety, better DX |
| Framework | Express.js | Proven, flexible |
| Database | PostgreSQL 16 | ACID, JSONB for dynamic attributes |
| ORM | Prisma | Type-safe, migrations |
| Cache/Queue | Redis + BullMQ | Rate limiting, async job processing |
| AI | Claude API (Haiku) | Document parsing, data extraction |

### Frontend

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | Next.js 14 | React with App Router |
| Styling | Tailwind CSS | Utility-first |
| Data Grid | AG Grid | Spreadsheet-like product management |
| State | React Query | Server state, optimistic updates |

### Identity & Credentials

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Stack | walt.id Community | W3C VCs, Apache 2.0 license |
| DID Method | did:key | Self-contained, portable, offline verification |
| Credential Format | W3C Verifiable Credentials | Industry standard |

### Infrastructure

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Compute | AWS ECS Fargate | Serverless containers |
| Database | AWS RDS PostgreSQL | Managed, Multi-AZ |
| Cache | AWS ElastiCache Redis | Managed cluster |
| Storage | AWS S3 + CloudFront | DAM with CDN |
| Image Processing | AWS Lambda + Sharp | On-the-fly optimization |
| Frontend | Vercel | Next.js hosting |

---

## 3. System Architecture

### Modular Platform Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EUROCOMPLY PLATFORM                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                         CORE MODULE                           │   │
│  │  • Authentication (JWT, API Keys)                            │   │
│  │  • Organization management                                    │   │
│  │  • Billing (Stripe)                                          │   │
│  │  • Basic Product CRUD                                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│         │                                                            │
│         ├─────────────────┬─────────────────┬─────────────────┐     │
│         ▼                 ▼                 ▼                 ▼     │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌──────────┐│
│  │ COMPLIANCE  │   │     PIM     │   │     DAM     │   │  IMPORT  ││
│  │             │   │             │   │             │   │          ││
│  │ • Passports │   │ • Families  │   │ • Assets    │   │ • AI     ││
│  │ • walt.id   │   │ • Variants  │   │ • S3/CDN    │   │ • CSV    ││
│  │ • Lifecycle │   │ • Scoring   │   │ • Transform │   │ • PDF    ││
│  │ • QR codes  │   │ • Pricing   │   │ • Roles     │   │ • Excel  ││
│  └─────────────┘   └──────┬──────┘   └─────────────┘   └──────────┘│
│                           │                                         │
│                           ▼                                         │
│                    ┌─────────────┐                                  │
│                    │ SYNDICATION │                                  │
│                    │             │                                  │
│                    │ • Shopify   │                                  │
│                    │ • BullMQ    │                                  │
│                    │ • Rate limit│                                  │
│                    └─────────────┘                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Module Dependencies

```
CORE ─────────────────► Required by all modules

COMPLIANCE ───────────► Requires: CORE
                        Optional: PIM (enhances product data)

PIM ──────────────────► Requires: CORE
                        Optional: DAM, IMPORT

DAM ──────────────────► Requires: CORE
                        Works with: PIM, COMPLIANCE

IMPORT ───────────────► Requires: CORE, PIM

SYNDICATION ──────────► Requires: CORE, PIM
```

---

## 4. Data Model

### Hybrid Schema Strategy

The database uses a hybrid relational/JSONB approach:

- **Relational columns**: Universal fields with query performance (SKU, GTIN, name, status, price)
- **JSONB columns**: Dynamic attributes validated by ProductFamily schema

### Core Entities

```
Organization (Tenant)
├── type: BRAND | MANUFACTURER | DISTRIBUTOR
├── enabledModules: ["core", "compliance", "pim", ...]
├── plan: DPP_STARTER | DPP_PROFESSIONAL | PIM_DPP | ENTERPRISE
└── settings (billing, integrations)

ProductFamily (Attribute Schema)
├── name: "Apparel", "Electronics", etc.
├── attributeSchema: JSONB (field definitions)
├── dppRequirements: String[] (fields needed for DPP)
├── completenessRules: JSONB (per-channel requirements)
├── templateId?: references ProductFamilyTemplate (if created from template)
└── isCustom: boolean (true if created from scratch)

ProductFamilyTemplate (Industry Templates)
├── name: "ESPR Textiles", "ESPR Electronics", "Food & Beverage", etc.
├── industry: "ESPR" | "FOOD" | "COSMETICS" | "INDUSTRIAL" | "CUSTOM"
├── attributeSchema: JSONB (default fields for this industry)
├── dppRequirements: String[] (regulatory requirements, if any)
├── description: string (explains what this template is for)
├── isRegulated: boolean (true if ESPR/compliance requirements apply)
└── version: number (templates can be updated)

Product (Golden Record)
├── Core fields: sku, gtin, name, status
├── attributes: JSONB (validated by family)
├── completeness: JSONB (per-channel scores)
├── dppData: JSONB (compliance snapshot)
├── price, currency (multi-currency)
└── Variants[]

ProductVariant
├── sku, gtin
├── attributes: JSONB (overrides parent)
├── price (override)
└── quantity

Asset (DAM)
├── filename, mimeType, size
├── storageKey (S3)
├── type: IMAGE | VIDEO | DOCUMENT | CERTIFICATE
└── ProductAssets[] (many-to-many with roles)

Channel (Syndication)
├── type: SHOPIFY | DPP | CUSTOM_API
├── credentials: JSONB (encrypted)
├── status, lastSyncAt
└── ChannelListings[]

ImportJob (AI Import)
├── fileType: CSV | EXCEL | PDF | JSON | IMAGE
├── status: PENDING | EXTRACTING | MAPPING | IMPORTING | COMPLETED
├── extractedData: JSONB (AI output)
├── mappingSuggestions: JSONB
└── errors: JSONB

Passport (DPP)
├── productId
├── data: JSONB (CIRPASS schema)
├── vcJwt (Verifiable Credential)
├── qrCodeUrl
├── attestations: AttestationRef[] (linked attestation VCs)
└── status: DRAFT | ACTIVE | REVOKED

Contributor (Third-Party Attestor)
├── email, companyName
├── type: CERTIFIER | MANUFACTURER | SUPPLIER | LAB | AUDITOR | OTHER
├── did, didKeyId (their own did:key)
└── verificationLevel: SELF_ATTESTED | DOMAIN_VERIFIED

DataRequest (Invitation to Contribute)
├── organizationId, productId
├── contributorEmail, requestedFields[]
├── visibility: FULL_PRODUCT | REQUESTED_FIELDS_ONLY
├── expiry settings (suggestedExpiry, allowNoExpiry, requireExpiry)
└── status: PENDING | ACCEPTED | COMPLETED | EXPIRED | DECLINED

Contribution (Attested Data)
├── productId, contributorId, requestId?
├── fields[] (which fields covered)
├── status: DRAFT | PENDING_REVIEW | APPROVED | REJECTED | REVOKED
└── versions: ContributionVersion[]

ContributionVersion (Signed Version)
├── version: number, data: JSONB
├── dataHash, signature (signed with contributor DID)
├── vcId, vcJwt (attestation VC)
└── expiresAt? (null = never)
```

---

## 5. API Design

### Module-Based Routes

```
/api/v1/
├── core/
│   ├── /auth           # Login, API keys
│   ├── /organizations  # Tenant management
│   └── /billing        # Subscription, usage
│
├── pim/
│   ├── /templates      # ProductFamily templates (browse, preview)
│   ├── /families       # Product family schemas (CRUD, from template or scratch)
│   ├── /products       # Product CRUD
│   ├── /variants       # Variant management
│   └── /completeness   # Scoring rules
│
├── compliance/
│   ├── /passports      # DPP generation
│   ├── /lifecycle      # Event tracking
│   └── /verify         # Public verification (no auth)
│
├── attestation/
│   ├── /data-requests  # Create/manage data requests
│   ├── /contributions  # Review/approve contributions
│   └── /contributors   # Contributor management
│
├── dam/
│   ├── /assets         # Asset CRUD
│   └── /upload         # Upload endpoint
│
├── import/
│   ├── /jobs           # Import job management
│   └── /upload         # File upload + AI processing
│
├── syndication/
│   ├── /channels       # Channel connections
│   ├── /shopify        # Shopify OAuth + webhooks
│   └── /sync           # Manual sync triggers
│
├── retailer/
│   ├── /register       # Retailer registration (free)
│   ├── /me             # Retailer profile
│   └── /saved          # Saved products
│
├── contribute/
│   └── /:token           # Public contributor portal (no auth, token-based)
│
└── public/
    ├── /dpp/gtin/:gtin           # Lookup by GTIN
    ├── /dpp/brand/:brand/sku/:sku # Lookup by brand + SKU
    ├── /dpp/serial/:serial       # Lookup by serial number
    ├── /dpp/search               # Search catalog
    └── /dpp/batch                # Batch lookup
```

### Authentication

```bash
# API Key (for integrations)
curl https://api.eurocomply.eu/v1/products \
  -H "Authorization: Bearer ec_live_xxxxx"

# JWT (for dashboard)
curl https://api.eurocomply.eu/v1/products \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Module Access Control

```typescript
// Middleware checks module access
const requireModule = (module: Module) => {
  return (req, res, next) => {
    if (!req.organization.enabledModules.includes(module)) {
      throw new ForbiddenError(`Module '${module}' not enabled`);
    }
    next();
  };
};

// Routes are grouped by module
router.use('/pim/families', requireModule('pim'), familyRoutes);
router.use('/syndication', requireModule('syndication'), syndicationRoutes);
```

---

## 6. Implementation Phases

### Phase Overview

Each phase is a **full-stack vertical slice** - backend, frontend, and tests together. This enables demo-able progress and early feedback.

```
Phase 1: Core + Schema      ──► Foundation for everything
Phase 2: PIM + DAM          ──► Product management (main UI)
Phase 3: Import Engine      ──► Data onboarding
Phase 4: Compliance         ──► DPP workflow
Phase 5: Attestation        ──► Third-party contributions (tightly coupled with Phase 4)
Phase 6: Syndication        ──► Shopify integration
Phase 7: Retailer Access    ──► Public API and widget
```

---

### Phase 1: Core + Schema

**Goal:** Establish foundation - auth, multi-tenancy, and complete database schema

| Task | Status |
|------|--------|
| Design complete Prisma schema (all entities including ProductFamilyTemplate, Contributor, Contribution, Attestation) | Planned |
| Seed ProductFamilyTemplate with industry presets (ESPR Textiles, ESPR Electronics, Food & Beverage, etc.) | Planned |
| Implement authentication (JWT sessions, password hashing) | Planned |
| Build Organization model with multi-tenancy (row-level security) | Planned |
| Implement User/Team management within organizations | Planned |
| Create API key management (hashed keys, scopes) | Planned |
| Set up Stripe billing integration (subscriptions, usage metering) | Planned |
| Basic login/signup UI | Planned |
| Organization settings page | Planned |

**Outcome:** Users can sign up, create organizations, and manage subscriptions. Database schema supports all future features.

**Key Decision:** Design attestation models NOW (Contributor, DataRequest, Contribution, ContributionVersion) even though implementation is Phase 5. This prevents schema rework later.

---

### Phase 2: PIM + DAM

**Goal:** Full-stack product management - the core UI users interact with daily

| Task | Status |
|------|--------|
| Implement ProductFamilyTemplate system with industry presets | Planned |
| Build "Create Family" wizard (from template or from scratch) | Planned |
| Implement ProductFamily model with dynamic attribute schemas | Planned |
| Template modification UI (add/remove/customize fields) | Planned |
| Build Product CRUD API with JSONB validation | Planned |
| Implement completeness scoring algorithm (per-channel) | Planned |
| Build AG Grid frontend with virtualization (10k+ rows) | Planned |
| Implement inline editing with optimistic updates | Planned |
| Add completeness visualization (traffic lights per channel) | Planned |
| ProductVariant with parent-child inheritance | Planned |
| Multi-currency pricing support | Planned |
| S3 upload for assets (images, documents, certificates) | Planned |
| Asset-product associations with roles (hero, gallery, certificate) | Planned |
| Basic asset management UI | Planned |

**Outcome:** Users can manage products with dynamic attributes, see completeness scores, upload assets. Core PIM functionality complete.

**Dependencies:** Phase 1 (auth, org, schema)

**Key Design: ProductFamily Templates**

ProductFamily creation supports two paths:

1. **From Template** (recommended for most users)
   - Browse industry templates: ESPR Textiles, ESPR Electronics, Food & Beverage, Cosmetics, Industrial, etc.
   - Templates include pre-configured fields, validation rules, and compliance requirements
   - Users can modify templates: add fields, remove optional fields, customize validation
   - Original template reference is kept for future updates/suggestions

2. **From Scratch** (for custom industries)
   - Build family with no pre-populated fields
   - Define custom attributes, data types, and validation rules
   - Useful for industries without ESPR requirements or niche verticals

This approach supports industries beyond ESPR compliance - any business needing structured product data management can use EuroComply, with or without DPP issuance.

---

### Phase 3: Import Engine

**Goal:** Enable bulk data onboarding from any format - full stack

| Task | Status |
|------|--------|
| Implement stream-based file parser (CSV, Excel) | Planned |
| Build Claude API integration for data extraction | Planned |
| Set up BullMQ workers for async processing | Planned |
| Create import wizard UI with column mapping | Planned |
| Build mapping preview with validation errors | Planned |
| Implement import progress tracking | Planned |
| PDF/Image OCR support for product data | Planned |
| Import history and error logs | Planned |

**Outcome:** Users can import 10,000 SKUs from any file format via intuitive wizard.

**Dependencies:** Phase 2 (product model, families, completeness)

---

### Phase 4: Compliance

**Goal:** DPP workflow - from "ready" products to issued passports

| Task | Status |
|------|--------|
| Build DPP completeness rules (which fields required) | Planned |
| Implement DPP Ready list (products at 100% DPP completeness) | Planned |
| Build manual review and approval workflow | Planned |
| Integrate packages/identity for VC issuance | Complete (packages/identity) |
| Generate DPP as Verifiable Credential (with attestation slots) | Planned |
| QR code generation with customizable branding | Planned |
| DPP public verification page | Planned |
| DPP lifecycle tracking (issued, updated, revoked) | Planned |
| Lambda image optimization pipeline | Planned |

**Outcome:** Products at 100% completeness appear in DPP Ready list. Users review and issue DPPs as Verifiable Credentials with QR codes.

**Dependencies:** Phase 2 (completeness scoring, assets)

**Key Decision:** DPP VC schema includes `attestations[]` array from day one, even if empty. This enables Phase 5 integration without schema changes.

---

### Phase 5: Multi-Party Attestation

**Goal:** Third-party data contributions with cryptographic signatures

| Task | Status |
|------|--------|
| Implement Contributor model with did:key generation | Planned |
| Build DataRequest model and email invitation system | Planned |
| Create Contribution and ContributionVersion models | Planned |
| Build contributor portal (token-based access) | Planned |
| Implement configurable product visibility (full vs. requested-only) | Planned |
| Contributor data entry forms with validation | Planned |
| Signature and attestation VC generation | Planned |
| Customer review and approval workflow UI | Planned |
| Link approved attestations to DPP VC | Planned |
| Notification system (email + in-app) | Planned |
| Expiry tracking and reminders (30 days, 7 days, expired) | Planned |
| Revocation handling with customer alerts | Planned |
| Attestation badges in DPP verification view | Planned |

**Outcome:** Customers can request data from manufacturers, certifiers, labs. Contributors sign with their own DID. DPPs show complete chain of trust.

**Dependencies:** Phase 1 (schema), Phase 4 (DPP issuance)

See [MULTI_PARTY_ATTESTATION.md](docs/MULTI_PARTY_ATTESTATION.md) for full architecture.

---

### Phase 6: Syndication

**Goal:** Publish products to e-commerce channels

| Task | Status |
|------|--------|
| Implement Shopify OAuth connector | Planned |
| Build rate-limited BullMQ sync workers | Planned |
| Product push to Shopify (create/update) | Planned |
| Product pull from Shopify (bi-directional) | Planned |
| DPP metadata to Shopify metafields | Planned |
| Sync status dashboard (last sync, errors) | Planned |
| Webhook handlers for Shopify events | Planned |
| Manual sync triggers | Planned |

**Outcome:** Products sync to Shopify with DPP metadata in metafields. Bi-directional sync keeps data consistent.

**Dependencies:** Phase 2 (products), Phase 4 (DPP data)

---

### Phase 7: Retailer Access Layer

**Goal:** Enable retailers to access and display DPPs on their storefronts

| Task | Status |
|------|--------|
| Retailer registration (free tier, no payment) | Planned |
| Retailer dashboard with saved products | Planned |
| DPP catalog browser with search | Planned |
| Public API for DPP lookup (GTIN, brand/SKU, serial) | Planned |
| Batch lookup endpoint for bulk verification | Planned |
| Embeddable JavaScript widget | Planned |
| Widget customization (colors, layout) | Planned |
| Shopify Retailer App (free, auto-matching by GTIN) | Planned |
| DPP index for fast lookups (ElasticSearch or similar) | Planned |
| Rate limiting and usage tracking | Planned |

**Outcome:** Retailers can search, browse, and display DPPs without technical expertise. Free widget and Shopify app drive adoption.

**Dependencies:** Phase 4 (DPP endpoints)

---

### Phase Dependency Graph

```
                    ┌─────────────────────┐
                    │     PHASE 1         │
                    │   Core + Schema     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     PHASE 2         │
                    │    PIM + DAM        │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
     │   PHASE 3   │   │   PHASE 4   │   │   PHASE 6   │
     │   Import    │   │  Compliance │   │ Syndication │
     └─────────────┘   └──────┬──────┘   └─────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │     PHASE 5         │
                    │   Attestation       │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     PHASE 7         │
                    │  Retailer Access    │
                    └─────────────────────┘
```

**Parallel Work Possible:**
- Phase 3 (Import) and Phase 4 (Compliance) can run in parallel after Phase 2
- Phase 6 (Syndication) can start after Phase 2, independent of Phases 3-5
- Phase 5 (Attestation) requires Phase 4 (DPP structure)
- Phase 7 (Retailer) requires Phase 4 (DPP endpoints)

---

## 7. Directory Structure

```
EuroComply/
├── apps/
│   ├── api/                     # Express.js API server
│   │   └── src/
│   │       ├── core/            # Auth, org, billing
│   │       ├── pim/             # Families, products, variants
│   │       ├── compliance/      # Passports, lifecycle
│   │       ├── attestation/     # Multi-party data contributions
│   │       ├── dam/             # Assets, upload
│   │       ├── import/          # AI import, job processing
│   │       ├── syndication/     # Shopify, sync jobs
│   │       └── retailer/        # Retailer access, public API
│   │
│   └── frontend/                # Next.js dashboard
│       └── src/
│           ├── app/             # App Router pages
│           ├── components/      # UI components
│           │   ├── grid/        # AG Grid wrappers
│           │   ├── import/      # Import wizard
│           │   └── common/      # Shared components
│           └── lib/             # Utilities, API client
│
├── packages/
│   ├── database/                # Prisma schema & migrations
│   ├── identity/                # walt.id integration
│   ├── shared/                  # Shared types, Zod schemas
│   └── ai/                      # Claude API integration
│
├── infrastructure/
│   ├── aws/                     # CloudFormation templates
│   └── terraform/               # Alternative IaC
│
├── docker/
│   ├── docker-compose.yml       # Local development
│   └── Dockerfile               # Production build
│
└── docs/                        # Documentation
```

---

## 8. Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Headless Modular Monolith | Logical separation, shared runtime, option to extract |
| Data Model | Relational + JSONB | SQL performance + NoSQL flexibility |
| API Style | REST | Simple, well-understood |
| Multi-tenancy | Shared DB, row-level security | Cost-effective |
| Identity | walt.id + did:key | Portable, offline verification |
| AI Provider | Claude (Haiku) | Cost-effective for extraction |
| Job Queue | BullMQ + Redis | Rate limiting, reliable processing |
| E-commerce | Shopify only (initially) | Largest SME platform |

---

## 9. Pricing Tiers & Module Access

| Plan | Monthly | Annual | Products | Users |
|------|---------|--------|----------|-------|
| **DPP Starter** | €29 | €290/yr | 50 | 1 |
| **DPP Professional** | €99 | €990/yr | 500 | 3 |
| **PIM + DPP Standard** | €199 | €1,990/yr | 2,000 | 5 |
| **PIM + DPP Growth** | €499 | €4,990/yr | 20,000 | 10 |
| **Enterprise** | Custom | Custom | 100,000+ | Unlimited |

### Module Access by Tier

| Module | Starter | Pro | Standard | Growth | Enterprise |
|--------|:-------:|:---:|:--------:|:------:|:----------:|
| Core (Auth, Billing) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Compliance (DPP, VCs) | ✓ | ✓ | ✓ | ✓ | ✓ |
| DAM (Basic) | ✓ | ✓ | ✓ | ✓ | ✓ |
| PIM (Families, Variants) | - | Basic | Full | Full | Full |
| Import (CSV) | - | ✓ | ✓ | ✓ | ✓ |
| Import (AI) | - | 20/mo | Unlimited | Unlimited | Unlimited |
| Attestation (Multi-Party) | - | ✓ | ✓ | ✓ | ✓ |
| Syndication (Shopify) | - | - | ✓ | ✓ | ✓ |
| API Access | - | - | ✓ | ✓ | ✓ |
| Webhooks | - | - | - | ✓ | ✓ |
| Custom Integrations | - | - | - | - | ✓ |

See [BUSINESS_MODEL.md](docs/BUSINESS_MODEL.md) for full cost analysis and margin details.

---

## 10. Success Metrics

### Technical KPIs

| Metric | Target |
|--------|--------|
| API latency (p95) | < 200ms |
| Uptime | 99.9% |
| Import throughput | 1,000 products/minute |
| Completeness calculation | < 100ms |

### Business KPIs

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| Customers | 400 | 1,500 | 4,000 |
| ARR | €1.0M | €3.6M | €9.6M |
| Active Products | 100k | 400k | 1M |
| DPPs Issued | 50k | 200k | 500k |

---

## 11. EU Registry Integration (Future)

### What is the EU Registry?

The **System Registry** (formally the Registry of Digital Product Passports) is a central database managed by the European Commission. It acts as a lookup index enabling:

- **Customs Automation:** Bulk verification of products entering the EU
- **Market Surveillance:** Regulators can query product patterns
- **Resilience:** Record of products even if manufacturer disappears

### Timeline

| Milestone | Date |
|-----------|------|
| EU publishes Registry API specs | 2025-2026 |
| EuroComply implements Registry client | 2026 |
| First products registered | 2027 |

### Architecture Readiness

Our architecture is ready for Registry integration:
- GS1 standards (GTIN for product identification)
- Operator data (organization details)
- Accessible URLs (public DPP endpoints)
- Open formats (W3C VCs, JSON-LD)

---

## 12. Related Documentation

| Document | Description |
|----------|-------------|
| [README.md](./README.md) | Platform overview and setup |
| [BUSINESS_MODEL.md](./docs/BUSINESS_MODEL.md) | Pricing and market positioning |
| [DATA_SOVEREIGNTY.md](./docs/DATA_SOVEREIGNTY.md) | Data ownership architecture |
| [VERIFIABLE_CREDENTIALS.md](./docs/VERIFIABLE_CREDENTIALS.md) | VC/DID technical details |
| [MULTI_PARTY_ATTESTATION.md](./docs/MULTI_PARTY_ATTESTATION.md) | Third-party data contribution architecture |
| [ECOMMERCE_INTEGRATIONS.md](./docs/ECOMMERCE_INTEGRATIONS.md) | Shopify integration guide |
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | AWS deployment guide |

---

*Last Updated: January 2026*
