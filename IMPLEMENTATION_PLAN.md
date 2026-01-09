# EuroComply Implementation Plan

## Compliance-First Product Information Management Platform

---

## 1. Executive Summary

EuroComply is a Compliance-First Product Information Management (PIM) platform with Digital Product Passports (DPP) as a core capability. The platform provides tools for managing product data, generating EU ESPR-compliant DPPs, and syndicating products to e-commerce channels.

### Core Concept

The **Golden Record** - a unified product model containing both commercial attributes (name, price, images) and compliance data (materials, certifications, carbon footprint). DPPs are generated automatically when product data completeness reaches 100%.

### Target Market

- **Brands, manufacturers, distributors** managing 100-5,000 SKUs
- First movers in textiles, batteries, electronics, furniture
- Organizations needing both PIM and compliance functionality
- NOT enterprise (they have SAP, Akeneo, custom solutions)

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
└── completenessRules: JSONB (per-channel requirements)

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
└── status: DRAFT | ACTIVE | REVOKED
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
│   ├── /families       # Product family schemas
│   ├── /products       # Product CRUD
│   ├── /variants       # Variant management
│   └── /completeness   # Scoring rules
│
├── compliance/
│   ├── /passports      # DPP generation
│   ├── /lifecycle      # Event tracking
│   └── /verify         # Public verification (no auth)
│
├── dam/
│   ├── /assets         # Asset CRUD
│   └── /upload         # Upload endpoint
│
├── import/
│   ├── /jobs           # Import job management
│   └── /upload         # File upload + AI processing
│
└── syndication/
    ├── /channels       # Channel connections
    ├── /shopify        # Shopify OAuth + webhooks
    └── /sync           # Manual sync triggers
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

### Phase 1: Data Foundation

**Goal:** Establish PIM schema and basic management UI

| Task | Status |
|------|--------|
| Design Prisma schema with Product, Family, JSONB attributes | Planned |
| Implement AG Grid frontend with read/write capabilities | Planned |
| Build core Node.js CRUD API | Partial |
| Multi-currency pricing support | Planned |
| ProductVariant with parent-child inheritance | Planned |

**Outcome:** Users can manually create and edit products with dynamic attributes.

### Phase 2: AI Import Engine

**Goal:** Enable bulk data onboarding from any format

| Task | Status |
|------|--------|
| Implement stream-based file parser (CSV, Excel) | Planned |
| Build Claude API integration for data extraction | Planned |
| Create import wizard UI with mapping preview | Planned |
| Set up BullMQ workers for async processing | Planned |
| PDF/Image OCR support | Planned |

**Outcome:** Users can import 10,000 SKUs from any file format.

### Phase 3: Compliance & DAM

**Goal:** Integrate DPP and media workflows

| Task | Status |
|------|--------|
| Implement S3 + Lambda image optimization pipeline | Planned |
| Develop completeness scoring algorithm | Planned |
| Build walt.id connector for credential issuance | Complete |
| Auto-trigger DPP generation at 100% completeness | Planned |
| Asset roles and product associations | Planned |

**Outcome:** Products can be validated and issued DPPs automatically.

### Phase 4: Syndication

**Goal:** Connect to e-commerce channels

| Task | Status |
|------|--------|
| Implement Shopify OAuth connector | Complete |
| Build rate-limited BullMQ sync workers | Planned |
| Bi-directional product sync | Partial |
| DPP metadata to Shopify metafields | Planned |

**Outcome:** Full PIM functionality with Shopify publishing.

### Phase 5: Frontend Dashboard

**Goal:** Spreadsheet-like product management interface

| Task | Status |
|------|--------|
| AG Grid integration with virtualization | Planned |
| Inline editing with optimistic updates | Planned |
| Completeness visualization (traffic lights) | Planned |
| Import wizard UI | Planned |
| Channel sync status dashboard | Planned |

**Outcome:** Users can manage thousands of products efficiently.

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
│   │       ├── dam/             # Assets, upload
│   │       ├── import/          # AI import, job processing
│   │       └── syndication/     # Shopify, sync jobs
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

| Plan | Monthly | Products | Modules |
|------|---------|----------|---------|
| **DPP Starter** | €49 | 100 | Core, Compliance, Basic DAM |
| **DPP Professional** | €149 | 500 | + Full DAM, CSV Import |
| **PIM + DPP** | €299 | 2,000 | + PIM, AI Import, Shopify Sync, API |
| **Enterprise** | Custom | Unlimited | All + Custom integrations |

See [BUSINESS_MODEL.md](docs/BUSINESS_MODEL.md) for full details.

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
- Operator data (VAT IDs validated via VIES)
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
| [ECOMMERCE_INTEGRATIONS.md](./docs/ECOMMERCE_INTEGRATIONS.md) | Shopify integration guide |
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | AWS deployment guide |

---

*Last Updated: January 2026*
