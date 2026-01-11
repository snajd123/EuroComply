# EuroComply Implementation Plan

## Compliance-First Product Information Management Platform

---

## 1. Executive Summary

EuroComply is a unified platform for product lifecycle management and EU regulatory compliance. The platform provides tools for managing product data, tracking supply chains, generating EU ESPR-compliant Digital Product Passports (DPPs), and syndicating products to e-commerce channels.

**One platform, four workspaces** - each persona gets a purpose-built interface backed by shared data.

### Core Concept: The Hub + Workspaces

At the center is **The Hub** (Golden Record) - a unified product model containing all data across workspaces: design specs, operations data, marketing content, and compliance information.

Four **Workspaces** provide persona-specific views of Hub data:

| Workspace | Persona | Focus |
|-----------|---------|-------|
| **Design** | Product Designers, R&D | BOMs, material specs, revision control |
| **Operations** | Supply Chain, Procurement | Inventory, orders, supplier management |
| **Marketing** | Brand Managers, E-commerce | Product content, images, channel syndication |
| **Compliance** | Compliance Officers, QA | DPP issuance, certifications, audits |

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        WORKSPACE LAYER (Frontend)                        │
├──────────────┬──────────────┬──────────────┬──────────────────────────┤
│   DESIGN     │  OPERATIONS  │  MARKETING   │       COMPLIANCE          │
│  (PLM-lite)  │  (ERP-lite)  │  (PIM-lite)  │       (DPP-core)         │
└──────────────┴──────────────┴──────────────┴──────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    THE HUB (Central Data Model)                          │
│   Products • Variants • Materials • Suppliers • Certifications • BOMs   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Principles:**
- All customers receive all workspaces (no tier-based restrictions)
- Workspace access is role-based (users see workspaces relevant to their role)
- Edit in any workspace - the Hub stays synchronized
- Each workspace has distinct UI/UX optimized for its persona

### Target Market

**Growth Segment (€129/month)**
- Small to medium brands and manufacturers with 100-2,000 SKUs
- First-time PIM users or organizations migrating from spreadsheets
- Annual revenue: €1M-€20M

**Scale Segment (€399/month)**
- Mid-market distributors and larger brands with 2,000-20,000 SKUs
- First movers in textiles, batteries, electronics, furniture
- Annual revenue: €20M-€200M

**Enterprise Segment (Custom)**
- Large organizations with 20,000+ SKUs requiring custom integrations
- SSO, SLA guarantees, dedicated account management
- Annual revenue: €200M+

**Secondary (PIM-First)**
- Industries not yet subject to ESPR but needing structured product data
- Food & beverage, cosmetics, industrial goods, specialty retail

**NOT Target**
- Fortune 500 enterprises (they have SAP, Akeneo, custom solutions)

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
| **Write Path (AWS)** | | |
| Compute | AWS ECS Fargate | Serverless containers |
| Database | AWS RDS PostgreSQL | Managed, Multi-AZ |
| Cache | AWS ElastiCache Redis | Managed cluster |
| Storage | AWS S3 | DAM storage |
| Image Processing | AWS Lambda + Sharp | On-the-fly optimization |
| Frontend | Vercel | Next.js hosting |
| **Read Path (DPP Serving)** | | |
| CDN | Cloudflare (Pro) | Unlimited bandwidth, free |
| Origins (Tier 1) | Hetzner bare metal | EU-based, ~$200/month fixed |
| Origins (Tier 2) | Cloudflare R2 | Trillion-scale, no egress fees |

---

## 3. System Architecture

### Workspace + Module Architecture

EuroComply uses a layered architecture: **Workspaces** (frontend) sit on top of **Modules** (backend), both accessing **The Hub** (data layer).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EUROCOMPLY PLATFORM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      WORKSPACE LAYER (Frontend)                        │  │
│  ├───────────────┬───────────────┬───────────────┬───────────────────────┤  │
│  │    DESIGN     │   OPERATIONS  │   MARKETING   │      COMPLIANCE       │  │
│  │   (PLM-lite)  │   (ERP-lite)  │   (PIM-lite)  │      (DPP-core)       │  │
│  │               │               │               │                       │  │
│  │ • BOM Editor  │ • Inventory   │ • Product Grid│ • DPP Ready List      │  │
│  │ • Material UI │ • Orders      │ • DAM Gallery │ • Review & Approve    │  │
│  │ • Revisions   │ • Suppliers   │ • Syndication │ • VC Issuance         │  │
│  └───────────────┴───────────────┴───────────────┴───────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       MODULE LAYER (Backend API)                       │  │
│  ├─────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                         │  │
│  │  ┌────────────────────────────────────────────────────────────────┐    │  │
│  │  │                         CORE MODULE                             │    │  │
│  │  │  • Authentication (JWT, API Keys)  • Billing (Stripe)          │    │  │
│  │  │  • Organization management         • User roles                 │    │  │
│  │  └────────────────────────────────────────────────────────────────┘    │  │
│  │         │                                                               │  │
│  │         ├──────────┬──────────┬──────────┬──────────┬──────────┐       │  │
│  │         ▼          ▼          ▼          ▼          ▼          ▼       │  │
│  │  ┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌───────┐ │  │
│  │  │COMPLIANCE││   PIM    ││   DAM    ││  EPCIS   ││ATTESTATN ││IMPORT │ │  │
│  │  │• DPPs    ││• Families││• Assets  ││• Events  ││• Requests││• AI   │ │  │
│  │  │• VCs     ││• Variants││• S3/CDN  ││• Carbon  ││• VCs     ││• CSV  │ │  │
│  │  │• QR      ││• Scoring ││• Images  ││• Timeline││• Review  ││• PDF  │ │  │
│  │  └──────────┘└────┬─────┘└──────────┘└──────────┘└──────────┘└───────┘ │  │
│  │                   │                                                     │  │
│  │                   ▼                                                     │  │
│  │            ┌─────────────┐                                              │  │
│  │            │ SYNDICATION │                                              │  │
│  │            │ • Shopify   │                                              │  │
│  │            └─────────────┘                                              │  │
│  │                                                                         │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       THE HUB (Data Layer)                             │  │
│  │  Products • Variants • Materials • Suppliers • BOMs • Certifications   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Workspace → Module Mapping

Each workspace uses specific modules to power its functionality:

| Workspace | Primary Modules | Key Features |
|-----------|----------------|--------------|
| **Design (PLM)** | Registry, Materials, DAM-Tech, Attestation, Import | BOMs, material library, revision control |
| **Operations (ERP-lite)** | Registry, EPCIS, Attestation, Import | Inventory, orders, supplier management |
| **Marketing (PIM)** | PIM, DAM-Media, Syndication, Import, Registry (read) | Product content, images, Shopify sync |
| **Compliance (DPP)** | Compliance, Registry (read), EPCIS (read), Attestation, PIM (read) | DPP issuance, lifecycle, certifications |

**Key Architecture Insight:**
- **Registry** = Technical DNA (product structure, BOMs, versions) - primary for Design
- **PIM** = Commercial Enrichment (descriptions, SEO, marketing) - primary for Marketing
- **DAM** serves both: Tech docs (Design), Media assets (Marketing)

**Note:** Attestation module is available in ALL workspaces for different datapoints (material certs, supplier audits, brand claims, regulatory certifications).

### Module Dependencies

```
CORE ─────────────────► Required by all modules

REGISTRY ─────────────► Requires: CORE
                        Used by: Design (read/write), Operations (read/write), Marketing (read), Compliance (read)

MATERIALS ────────────► Requires: CORE, REGISTRY
                        Used by: Design

PIM ──────────────────► Requires: CORE, REGISTRY
                        Used by: Marketing (read/write), Compliance (read)

COMPLIANCE ───────────► Requires: CORE
                        Reads from: REGISTRY, PIM, EPCIS, ATTESTATION

DAM ──────────────────► Requires: CORE
                        Works with: REGISTRY (tech docs), PIM (media)

EPCIS ────────────────► Requires: CORE
                        Works with: COMPLIANCE, REGISTRY

ATTESTATION ──────────► Requires: CORE
                        Works with: ALL WORKSPACES

IMPORT ───────────────► Requires: CORE, REGISTRY
                        Can import to: REGISTRY, PIM, MATERIALS

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
├── plan: GROWTH | SCALE | ENTERPRISE
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
├── status: DRAFT | ACTIVE | REVOKED
├── staticJsonKey? (S3 key for JSON file)
├── staticHtmlKey? (S3 key for HTML page)
├── cdnUrl? (public DPP URL)
├── lastPublishedAt? (when static files uploaded)
├── cdnInvalidatedAt? (when CDN cache cleared)
├── revokedAt?, revocationReason?
└── See SCALABILITY.md for billion-scale serving

Subscription
├── organizationId
├── plan: GROWTH | SCALE | ENTERPRISE
├── status: TRIALING | ACTIVE | PAST_DUE | CANCELED | DORMANT
├── trialEndsAt: DateTime (14 days from signup)
├── currentPeriodEnd: DateTime
├── productCount: number (for overage calculation)
├── stripeSubscriptionId
└── canceledAt?: DateTime

DormantHosting
├── organizationId
├── previousPlan: GROWTH | SCALE | ENTERPRISE
├── productCount: number (at time of cancellation)
├── billingType: ANNUAL | ONE_TIME
├── expiresAt?: DateTime (null if one-time)
└── status: ACTIVE | EXPIRED

Contributor (Third-Party Attestor)
├── email, companyName
├── type: CERTIFIER | MANUFACTURER | SUPPLIER | LAB | AUDITOR | OTHER
├── did, didKeyId (their own did:key)
└── verificationLevel: SELF_ATTESTED | DOMAIN_VERIFIED

User (Organization Member)
├── email, name, passwordHash?
├── organizationId
├── userType: INTERNAL | GUEST_PARTNER | TRANSACTIONAL_PARTNER
├── authority: VIEWER | CONTRIBUTOR | EDITOR | MANAGER
├── scopes: Scope[] (COMMERCIAL, COMPLIANCE, ADMIN)
├── reportsToId? (approval hierarchy)
├── allowedProductTags[], allowedFamilyIds[] (guest restrictions)
├── walletId? (references UserWallet)
└── isActive, invitedAt, lastLoginAt

UserWallet (User Identity & Keys)
├── userId (unique)
├── type: MANAGED | EUDI | EXTERNAL
├── did?, keyId? (for MANAGED wallets)
├── eudiDid?, eudiSubject?, connectionState? (for EUDI wallets)
├── activeDid (which DID to use for signing)
└── connectedAt, lastUsedAt

OrganizationWallet (Organization Identity)
├── organizationId (unique)
├── type: MANAGED | EU_ORG_WALLET
├── did?, keyId? (for MANAGED wallets)
├── euOrgDid?, euOrgSubject?, connectionState? (for EU Org Wallet)
├── activeDid (which DID to use for signing DPPs)
├── leiCode? (ISO 17442 Legal Entity Identifier)
├── vatNumber? (for EU VAT verification)
└── connectedAt, lastUsedAt, createdAt

ProductVersion (Git-Style Version Control)
├── productId, version (1, 2, 3...)
├── status: DRAFT | PENDING_REVIEW | APPROVED | REJECTED | SUPERSEDED
├── commercialData: JSONB (snapshot of commercial fields)
├── complianceData: JSONB (snapshot of compliance fields)
├── changesSummary[], dataDiff: JSONB
├── createdById, createdAt
├── reviewedById?, reviewedAt?, reviewNotes?
├── signedById?, signerDid?, signature?, signedAt?
└── Unique: [productId, version]

MagicLink (Passwordless Auth)
├── token (unique, cryptographically random)
├── userId
├── expiresAt? (null = never expires)
├── usedAt?, revokedAt?
└── createdAt

AuditLog (Event Logging)
├── organizationId
├── userId?, userEmail?, userName?
├── action: string ("product.version.published", "user.invited", etc.)
├── resourceType, resourceId?
├── metadata: JSONB
└── ipAddress?, userAgent?, createdAt

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

### Development Philosophy: Incremental Bottom-Up

We build the platform **bottom-up**, following the natural product lifecycle flow. The Hub (data model) grows incrementally with each phase - we don't design the complete schema upfront.

**Why bottom-up?**
- Compliance (DPP output) depends on upstream data
- Marketing content depends on product specs
- You can't issue a DPP without knowing materials, suppliers, carbon footprint
- Different customers have different entry points (manufacturers vs. distributors)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BOTTOM-UP BUILD ORDER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Phase 1: CORE HUB (Foundation)                                             │
│           Products, Variants, Organization, User                            │
│           All workspace shells navigable                                    │
│                              │                                              │
│                              ▼                                              │
│  Phase 2: ENTRY POINTS (Where data originates)                             │
│           ┌─────────────────┴─────────────────┐                            │
│           ▼                                   ▼                            │
│     Design Workspace               Operations Workspace                     │
│     + Materials, BOMs              + Suppliers, Inventory                  │
│     (for Manufacturers)            (for Distributors)                      │
│           │                                   │                            │
│           └─────────────────┬─────────────────┘                            │
│                             ▼                                              │
│  Phase 3: PRESENTATION (Content layer)                                     │
│           Marketing Workspace                                               │
│           + Assets, Channels, Content                                       │
│                             │                                              │
│                             ▼                                              │
│  Phase 4: OUTPUT (Compliance layer)                                        │
│           Compliance Workspace                                              │
│           + Passports, EPCIS, Certifications                               │
│                             │                                              │
│                             ▼                                              │
│  Phase 5+: ENHANCEMENTS                                                    │
│           Attestation, Syndication, Retailer Access                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase Overview

```
Phase 1: Core Hub + Shells    ──► Foundation (minimum viable Hub)
Phase 2: Design + Operations  ──► Entry points (Hub grows with Materials, Suppliers, BOMs, Inventory)
Phase 3: Marketing            ──► Presentation (Hub grows with Assets, Channels)
Phase 4: Compliance + EPCIS   ──► Output (Hub grows with Passports, Certifications)
Phase 5: Attestation          ──► Cross-cutting (all workspaces)
Phase 6: Syndication          ──► Channel push (Marketing)
Phase 7: Retailer Access      ──► Public access
```

### Hub Growth by Phase

The Hub schema grows incrementally - we only add what's needed for each phase:

| Phase | Hub Additions | Why |
|-------|---------------|-----|
| **1** | Product, Variant, Organization, User, ProductFamily | Minimum to exist |
| **2** | Material, BOM, Supplier, InventoryItem, PurchaseOrder | Entry points need this |
| **3** | Asset, Channel, ChannelListing | Content management |
| **4** | Passport, Certification, EpcisRepository | Compliance output |
| **5** | Contributor, DataRequest, Contribution | Attestation |

### Workspace Build Progression

| Phase | Design (PLM) | Operations (ERP-lite) | Marketing (PIM) | Compliance (DPP) |
|-------|--------------|----------------------|-----------------|------------------|
| 1 | Shell | Shell | Shell | Shell |
| 2 | **Registry + Materials** | **Registry + Inventory** | - | - |
| 3 | - | - | **PIM + DAM-Media** | - |
| 4 | - | EPCIS view | - | **DPP Issuance** |
| 5 | Attestation | Attestation | Attestation | Attestation |
| 6 | - | - | **Syndication** | - |

**Note:** Registry is built in Phase 2 and shared across workspaces. PIM (Phase 3) builds on Registry.

### Two Customer Entry Points

**Manufacturers start in Design:**
```
Phase 2 (Design/Registry) → Phase 2 (Operations) → Phase 3 (Marketing/PIM) → Phase 4 (Compliance)
```

**Distributors start in Operations:**
```
Phase 2 (Operations/Registry) → Phase 3 (Marketing/PIM) → Phase 4 (Compliance)
```

**Testable at each phase:**
- Phase 1: Users can log in, see all workspace shells, navigate
- Phase 2: Manufacturers can create BOMs; Distributors can track inventory
- Phase 3: Brand managers can create content, manage assets
- Phase 4: Compliance officers can issue DPPs with complete upstream data

---

### Phase 1: Core Hub + Workspace Shells

**Goal:** Establish foundation - auth, multi-tenancy, billing, minimum viable Hub schema, and ALL workspace shells navigable

| Task | Status |
|------|--------|
| Design complete Prisma schema (all entities including ProductFamilyTemplate, Contributor, Contribution, Attestation) | Planned |
| Seed ProductFamilyTemplate with industry presets (ESPR Textiles, ESPR Electronics, Food & Beverage, etc.) | Planned |
| Implement authentication (JWT sessions, password hashing) | Planned |
| Build Organization model with multi-tenancy (row-level security) | Planned |
| Implement User/Team management within organizations | Planned |
| Create API key management (hashed keys, scopes) | Planned |
| **Workspace Infrastructure** | |
| Build workspace shell layout (sidebar, navigation, workspace switcher) | Planned |
| Implement role-based workspace access middleware | Planned |
| Create workspace routing structure (/design, /operations, /marketing, /compliance) | Planned |
| Build placeholder pages for each workspace with "Coming Soon" state | Planned |
| Design workspace-specific navigation menus | Planned |
| **Billing & Subscriptions** | |
| Set up Stripe billing integration (subscriptions, usage metering) | Planned |
| Implement 14-day free trial with full platform access | Planned |
| Build volume overage billing (€10 per 100 additional SKUs) | Planned |
| Implement subscription cancellation workflow (30-day grace period) | Planned |
| Build data export package generation for cancellation | Planned |
| Implement Dormant Hosting option (€99/year for churned customers) | Planned |
| **API & Rate Limiting** | |
| Configure tier-based API rate limits (Growth: 100/min, Scale: 500/min, Enterprise: custom) | Planned |
| Implement rate limit middleware with Redis | Planned |
| **Enterprise Features** | |
| Implement SSO integration (SAML/OIDC) for Enterprise tier | Planned |
| **Infrastructure** | |
| Implement audit log infrastructure (event logging for all actions) | Planned |
| Basic login/signup UI | Planned |
| Organization settings page | Planned |
| Audit log viewer UI | Planned |
| **User Management & Roles** | |
| Extend Prisma schema with User, ProductVersion, MagicLink, AuditLog models | Planned |
| Implement user invitation flow (email + magic link, configurable expiry) | Planned |
| Build authority (VIEWER/CONTRIBUTOR/EDITOR/MANAGER) validation middleware | Planned |
| Build scope (COMMERCIAL/COMPLIANCE/ADMIN) validation middleware | Planned |
| User CRUD API endpoints (invite, update role/scope, deactivate) | Planned |
| Team settings UI (list members, invite, edit roles, deactivate) | Planned |
| Guest partner restrictions (filter by product tags/families) | Planned |
| **Version Control Workflow** | |
| Implement ProductVersion model with git-style versioning | Planned |
| Build checkout/checkin workflow for product editing | Planned |
| Implement version diff generation between versions | Planned |
| Build publish endpoint for EDITOR/MANAGER (sign-on-save) | Planned |
| Build submit-for-review endpoint for CONTRIBUTOR (sign-on-approval) | Planned |
| Implement approval routing logic (by scope and hierarchy) | Planned |
| Build approval inbox API and UI | Planned |
| Product history tab with version timeline | Planned |
| **Wallet Architecture (Global + EU-Ready)** | |
| Create WalletProvider interface (abstraction for all wallet types) | Planned |
| Implement ManagedWalletProvider (walt.id Custodian backend) | Planned |
| Add UserWallet model (MANAGED, EUDI, EXTERNAL types) | Planned |
| Add OrganizationWallet model (MANAGED, EU_ORG_WALLET types) | Planned |
| Build WalletFactory for provider instantiation | Planned |
| Auto-generate managed wallet on first signing action | Planned |
| Implement per-version signing through wallet interface | Planned |
| Trust level display in signature verification (Platform-managed vs Government-verified) | Planned |
| Include user and org wallets in data export package | Planned |
| Stub EUDIWalletProvider interface (user wallets, for when EUDI launches) | Planned |
| Stub EUOrgWalletProvider interface (org wallets, for when EU Org Wallet launches) | Planned |
| User wallet settings UI (view wallet, future: connect EUDI) | Planned |
| Organization wallet settings UI (view wallet, LEI, future: connect EU Org Wallet) | Planned |

**Outcome:** Users can sign up, start free trial, manage subscriptions with overage billing, and export data on cancellation. Enterprise customers can use SSO. Organizations can invite team members with role-based access control, and all product changes are version-controlled with cryptographic signatures. Wallet architecture supports global users (MANAGED) with optional EU identity enhancement (EUDI for users, EU Org Wallet for organizations) without code changes. Minimum viable Hub schema supports basic products.

**Workspace Deliverable:** All four workspace shells are navigable with proper routing. Role-based access controls which workspaces users can see. Placeholder pages show "Coming Soon" for incomplete workspaces.

**Hub at Phase 1:** Product, Variant, Organization, User, ProductFamily (minimum to exist)

**Key Decision:** Design attestation models NOW (Contributor, DataRequest, Contribution, ContributionVersion) even though implementation is Phase 5. This prevents schema rework later.

---

### Phase 2: Design + Operations → Entry Points (Registry + Materials)

**Goal:** Build the entry points where product data originates. Manufacturers start in Design (BOMs, materials), Distributors start in Operations (inventory, suppliers). The Hub grows with the **Registry** module (shared product structure) and **Materials** module.

**Workspaces:** Design (PLM), Operations (ERP-lite)

| Task | Status |
|------|--------|
| **Hub Schema Additions (Registry Module)** | |
| Product Registry model (SKU, versions, structure) | Planned |
| BillOfMaterials model (tree structure, component relationships) | Planned |
| ProductVersion model (revision history, change tracking) | Planned |
| **Hub Schema Additions (Materials Module)** | |
| Material model (fiber composition, chemical properties) | Planned |
| MaterialLibrary (centralized material definitions) | Planned |
| SustainabilityProperties (recyclability, carbon factors) | Planned |
| **Hub Schema Additions (Operations)** | |
| Supplier model (contact, certifications, audits) | Planned |
| InventoryItem model (locations, quantities, batch tracking) | Planned |
| PurchaseOrder model (supplier, items, status) | Planned |
| **Design Workspace - Registry + Materials** | |
| BOM editor UI (tree view, component list) | Planned |
| Material Library CRUD with sustainability properties | Planned |
| Component-supplier linking | Planned |
| Revision history and approval workflow | Planned |
| Technical document upload (CAD, specs, MSDS via DAM-Tech) | Planned |
| Design workspace navigation (BOMs, Materials, Revisions, Documents) | Planned |
| **Operations Workspace - Registry + Inventory** | |
| Inventory tracking data model (locations, quantities) | Planned |
| Stock level dashboard | Planned |
| Reorder point alerts | Planned |
| Batch/lot tracking UI | Planned |
| Simple purchase order model | Planned |
| PO creation and tracking UI | Planned |
| Supplier management dashboard | Planned |
| Operations workspace navigation (Inventory, Orders, Suppliers) | Planned |

**Outcome:** Two functional entry points for product data. Manufacturers define product structure (Registry) and materials in Design Workspace. Distributors track inventory and suppliers in Operations Workspace. Both paths feed the same Hub.

**Workspace Deliverables:**
- Design Workspace: Moves from "Coming Soon" to functional PLM (Registry, Materials, BOMs, revisions)
- Operations Workspace: Moves from "Coming Soon" to functional ERP-lite (inventory, orders, suppliers)

**Hub at Phase 2:** + Material, MaterialLibrary, BOM, ProductVersion, Supplier, InventoryItem, PurchaseOrder

**Dependencies:** Phase 1 (auth, org, schema, workspace shells)

**Key Insight:** **Registry** (product structure) is built here and shared across all workspaces. Marketing/PIM in Phase 3 will *enrich* Registry data, not replace it.

**Note:** This is ERP-*lite* - inventory and procurement basics. Not full accounting, no GL, no payroll. This is PLM - BOMs and materials, not full CAD integration.

**Two Customer Entry Points:**
- **Manufacturers:** Start in Design → define product structure in Registry, create materials → then track inventory in Operations
- **Distributors:** Start in Operations → create products in Registry, track inventory from suppliers → skip Material Library if not manufacturing

---

### Phase 3: Marketing → Presentation Layer (PIM)

**Goal:** Build the commercial enrichment layer where product content is managed for customers and channels. PIM enriches the technical product data from Registry with marketing content (descriptions, SEO, translations). The Hub grows to support rich media and channel listings.

**Workspace:** Marketing (PIM)

**Key Relationship:** Marketing has **read-only** access to Registry (product structure from Phase 2). PIM adds commercial content on top of technical specs.

| Task | Status |
|------|--------|
| **Hub Schema Additions** | |
| Asset model (images, documents, certificates) | Planned |
| Channel model (Shopify, DPP, custom) | Planned |
| ChannelListing model (per-product channel status) | Planned |
| **Backend (PIM Module)** | |
| Implement ProductFamilyTemplate system with industry presets | Planned |
| Implement ProductFamily model with dynamic attribute schemas | Planned |
| Build Product CRUD API with JSONB validation | Planned |
| Implement completeness scoring algorithm (per-channel) | Planned |
| ProductVariant with parent-child inheritance | Planned |
| Multi-currency pricing support | Planned |
| Bulk operations API (edit, delete, assign family) | Planned |
| Export to CSV/Excel/JSON | Planned |
| **Backend (DAM Module)** | |
| S3 upload for assets (images, documents, certificates) | Planned |
| Asset-product associations with roles (hero, gallery, certificate) | Planned |
| **Backend (Import Module)** | |
| Implement stream-based file parser (CSV, Excel) | Planned |
| Build Claude API integration for data extraction | Planned |
| Set up BullMQ workers for async processing | Planned |
| PDF/Image OCR support for product data | Planned |
| Import history and error logs API | Planned |
| **Marketing Workspace UI** | |
| Build "Create Family" wizard (from template or from scratch) | Planned |
| Template modification UI (add/remove/customize fields) | Planned |
| Build AG Grid product grid with virtualization (10k+ rows) | Planned |
| Implement inline editing with optimistic updates | Planned |
| Add completeness visualization (traffic lights per channel) | Planned |
| Bulk operations UI (multi-select in AG Grid) | Planned |
| Basic asset management UI (gallery view, drag-drop upload) | Planned |
| Import wizard UI with column mapping | Planned |
| Marketing workspace navigation (Products, Families, Assets, Import) | Planned |

**Outcome:** Marketing Workspace is fully functional for product content management. Users can manage products with dynamic attributes, see completeness scores, upload assets, perform bulk operations, import from files, and export data.

**Workspace Deliverable:** Marketing Workspace moves from "Coming Soon" to fully functional. Brand managers can create products, manage content, import data, and track completeness.

**Hub at Phase 3:** + Asset, Channel, ChannelListing

**Dependencies:** Phase 1 (auth, org, schema), Phase 2 (products with upstream data)

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

**Key Insight: Registry vs. PIM**
- **Registry** (Phase 2) = Technical DNA - SKU structure, BOMs, versions, product hierarchy
- **PIM** (Phase 3) = Commercial Enrichment - marketing descriptions, SEO, translations, channel content
- Marketing workspace reads from Registry but writes to PIM
- This separation ensures technical accuracy while enabling marketing flexibility

---

### Phase 4: Compliance + EPCIS → Output Layer

**Goal:** Build the output layer where all upstream data flows into compliance artifacts. DPP workflow in Compliance Workspace + EPCIS lifecycle visualization. The Hub grows to support passports and certifications.

**Workspaces:** Compliance (DPP-core), Operations (EPCIS features)

| Task | Status |
|------|--------|
| **Hub Schema Additions** | |
| Passport model (DPP with VC, QR code, lifecycle) | Planned |
| Certification model (third-party certs) | Planned |
| EpcisRepository model (connection config) | Planned |
| **Backend (Compliance Module)** | |
| Build DPP completeness rules (which fields required) | Planned |
| Implement DPP Ready list (products at 100% DPP completeness) | Planned |
| Build manual review and approval workflow | Planned |
| Integrate packages/identity for VC issuance | Complete (packages/identity) |
| Generate DPP as Verifiable Credential (with attestation slots) | Planned |
| QR code generation with customizable branding | Planned |
| DPP public verification page | Planned |
| DPP lifecycle tracking (issued, updated, revoked) | Planned |
| Lambda image optimization pipeline | Planned |
| **Backend (EPCIS Module - Hybrid Model)** | |
| Deploy hosted OpenEPCIS (PostgreSQL multi-tenant) | Planned |
| EPCIS 2.0 REST API (capture + query) | Planned |
| Build unified query client (internal + external) | Planned |
| Support OAuth 2.0 and API key authentication | Planned |
| Add repository connection management API | Planned |
| Build Story Builder service (JSON → timeline) | Planned |
| Carbon footprint aggregation from transport events | Planned |
| Multi-source event merging | Planned |
| **Compliance Workspace UI** | |
| DPP Ready list view with filtering | Planned |
| Review and approve workflow UI | Planned |
| DPP issuance confirmation with QR preview | Planned |
| Lifecycle timeline on product detail page | Planned |
| Audit trail view | Planned |
| Compliance workspace navigation (DPP Ready, Issued, Revoked) | Planned |
| **Operations Workspace UI** | |
| EPCIS repository connection settings | Planned |
| Product lifecycle timeline component | Planned |
| Carbon footprint visualization | Planned |
| Operations workspace navigation (Lifecycle, Repositories) | Planned |
| **Static DPP Serving (Billion-Scale, Fixed Cost)** | |
| Provision 3x Hetzner origin servers (Germany/Finland) | Planned |
| Configure Nginx for static file serving | Planned |
| Set up Lsyncd for real-time file replication | Planned |
| Configure Cloudflare DNS and CDN caching | Planned |
| Implement DPP pre-rendering (JSON + HTML) on issuance | Planned |
| Build origin push mechanism (rsync/scp from AWS) | Planned |
| Add static serving fields to Passport model | Planned |
| Implement Cloudflare cache purge on update/revoke | Planned |
| Revocation page rendering | Planned |
| Content negotiation (HTML for browsers, JSON for APIs) | Planned |
| **Trillion-Scale Preparation (Future)** | |
| Monitor origin bandwidth usage | Planned |
| Prepare Cloudflare R2 bucket for extreme scale | Planned |
| Build R2 publishing function (S3-compatible) | Planned |
| Create Cloudflare Worker for R2 routing | Planned |

**Outcome:** Compliance Workspace is fully functional for DPP issuance. Products at 100% completeness appear in DPP Ready list. Users review and issue DPPs as Verifiable Credentials with QR codes. Operations Workspace can display EPCIS lifecycle timelines and carbon footprint data.

**Workspace Deliverables:**
- Compliance Workspace: Moves from "Coming Soon" to fully functional DPP issuance workflow
- Operations Workspace: Gains EPCIS lifecycle visualization (inventory/orders already in Phase 2)

**Hub at Phase 4:** + Passport, Certification, EpcisRepository, EpcisEvent (hosted)

**Dependencies:** Phase 3 (completeness scoring, assets)

**Key Decisions:**
- DPP VC schema includes `attestations[]` array from day one, even if empty. This enables Phase 5 integration without schema changes.
- DPPs are pre-rendered to static files (JSON + HTML) and served via Cloudflare CDN with Hetzner bare-metal origins. This enables billions of QR scans/day at fixed cost (ESPR requires free access, so we can't use usage-based pricing).
- Read path is completely separate from write path. QR scans never touch AWS or the database.
- **Tiered scaling:** Start with Hetzner (up to ~50B scans/day at $200/month), migrate to Cloudflare R2 for extreme scale (100B+ scans/day at ~$2,500-11,000/month). See [SCALABILITY.md](docs/SCALABILITY.md) for details.

See [SCALABILITY.md](docs/SCALABILITY.md) for full architecture.

---

### Phase 5: Multi-Party Attestation → Cross-Cutting

**Goal:** Third-party data contributions with cryptographic signatures, available in ALL workspaces for different datapoints. The Hub grows to support contributor management and attestation workflows.

**Workspaces:** Design, Operations, Marketing, Compliance (ALL)

| Task | Status |
|------|--------|
| **Hub Schema Additions** | |
| Contributor model (third-party attestors with did:key) | Planned |
| DataRequest model (invitation to contribute) | Planned |
| Contribution model (attested data) | Planned |
| ContributionVersion model (signed versions) | Planned |
| **Backend (Attestation Module)** | |
| Implement Contributor model with did:key generation | Planned |
| Build DataRequest model and email invitation system | Planned |
| Create Contribution and ContributionVersion models | Planned |
| Signature and attestation VC generation | Planned |
| Link approved attestations to DPP VC | Planned |
| Notification system (email + in-app) | Planned |
| Expiry tracking and reminders (30 days, 7 days, expired) | Planned |
| Revocation handling with customer alerts | Planned |
| **Contributor Portal (External)** | |
| Build contributor portal (token-based access) | Planned |
| Implement configurable product visibility (full vs. requested-only) | Planned |
| Contributor data entry forms with validation | Planned |
| **Workspace Integration** | |
| Add attestation request UI to Design Workspace (material certs, component specs) | Planned |
| Add attestation request UI to Operations Workspace (supplier audits, factory certs) | Planned |
| Add attestation request UI to Marketing Workspace (brand claims, sustainability) | Planned |
| Add attestation management UI to Compliance Workspace (regulatory certs, third-party audits) | Planned |
| Customer review and approval workflow UI (shared component) | Planned |
| Attestation badges in DPP verification view | Planned |

**Attestation Use Cases by Workspace:**

| Workspace | Attestation Types |
|-----------|-------------------|
| **Design** | Material certifications, component specs, lab test results |
| **Operations** | Supplier audits, factory certifications, transport emissions |
| **Marketing** | Brand claim verifications, sustainability certifications |
| **Compliance** | Regulatory certifications, third-party compliance audits |

**Outcome:** All four workspaces can request attestations relevant to their domain. Contributors sign with their own DID. Attestations flow to the Hub and are visible across workspaces. DPPs show complete chain of trust.

**Workspace Deliverable:** Attestation functionality integrated into all four workspaces with context-appropriate request templates.

**Hub at Phase 5:** + Contributor, DataRequest, Contribution, ContributionVersion

**Dependencies:** Phase 4 (DPP issuance)

See [MULTI_PARTY_ATTESTATION.md](docs/MULTI_PARTY_ATTESTATION.md) for full architecture.

---

### Phase 6: Syndication → Marketing Workspace

**Goal:** Publish products to e-commerce channels from Marketing Workspace

**Workspace:** Marketing

| Task | Status |
|------|--------|
| **Backend (Syndication Module)** | |
| Implement Shopify OAuth connector | Planned |
| Build rate-limited BullMQ sync workers | Planned |
| Product push to Shopify (create/update) | Planned |
| Product pull from Shopify (bi-directional) | Planned |
| DPP metadata to Shopify metafields | Planned |
| Webhook handlers for Shopify events | Planned |
| **Marketing Workspace UI** | |
| Add Channels section to Marketing Workspace navigation | Planned |
| Shopify connection wizard | Planned |
| Sync status dashboard (last sync, errors) | Planned |
| Manual sync triggers | Planned |
| Per-product channel status indicators in product grid | Planned |

**Outcome:** Marketing Workspace users can connect Shopify stores and sync products. Products sync with DPP metadata in metafields. Bi-directional sync keeps data consistent.

**Workspace Deliverable:** Marketing Workspace gains full syndication capabilities. Channel management accessible from workspace navigation.

**Dependencies:** Phase 3 (Marketing products), Phase 4 (DPP data)

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
| **Scan Analytics** | |
| Add JavaScript beacon to DPP HTML pages | Planned |
| Build scan analytics API endpoint | Planned |
| Scan analytics dashboard (popular products, trends) | Planned |
| Organization-level scan reports | Planned |

**Outcome:** Retailers can search, browse, and display DPPs without technical expertise. Free widget and Shopify app drive adoption. Organizations can see scan analytics for their products via JavaScript beacon (works with CDN caching).

**Dependencies:** Phase 4 (DPP endpoints, static serving)

---

### Phase Dependency Graph

```
                    ┌─────────────────────────────┐
                    │         PHASE 1             │
                    │   Core Hub + Workspace Shells│
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │         PHASE 2             │
                    │ Design + Operations (Entry) │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │         PHASE 3             │
                    │ Marketing (Presentation)    │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │         PHASE 4             │
                    │ Compliance + EPCIS (Output) │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │         PHASE 5             │
                    │  Attestation (Cross-cutting)│
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
     ┌─────────────────────────┐    ┌─────────────────────────┐
     │        PHASE 6          │    │        PHASE 7          │
     │   Syndication (Mktg)    │    │    Retailer Access      │
     └─────────────────────────┘    └─────────────────────────┘
```

**Why Linear Flow (Not Parallel)?**

The bottom-up approach creates a natural data dependency chain:
- Phase 2 (Design + Operations) must exist before Phase 3 (Marketing) can present products
- Phase 3 (Marketing) must have content before Phase 4 (Compliance) can issue DPPs
- Phase 4 (DPPs) must exist before Phase 5 (Attestation) can link third-party data

**Parallel Work Possible After Phase 5:**
- Phase 6 (Syndication) and Phase 7 (Retailer) can run in parallel after Phase 5
- No Phase 8 - Design and Operations are now fully built in Phase 2

**Workspace Completion Timeline:**

| Workspace | Shell | Core Features | Enhanced Features |
|-----------|-------|---------------|-------------------|
| Design | Phase 1 | Phase 2 (BOMs, Materials) | Phase 5 (Attestation) |
| Operations | Phase 1 | Phase 2 (Inventory, Suppliers) | Phase 4 (EPCIS), Phase 5 (Attestation) |
| Marketing | Phase 1 | Phase 3 (PIM, DAM, Import) | Phase 6 (Syndication), Phase 5 (Attestation) |
| Compliance | Phase 1 | Phase 4 (DPP) | Phase 5 (Attestation) |

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
│   │       ├── epcis/           # Supply chain events (reader model)
│   │       ├── attestation/     # Multi-party data contributions
│   │       ├── dam/             # Assets, upload
│   │       ├── import/          # AI import, job processing
│   │       ├── syndication/     # Shopify, sync jobs
│   │       └── retailer/        # Retailer access, public API
│   │
│   └── frontend/                # Next.js dashboard
│       └── src/
│           ├── app/             # App Router pages
│           │   ├── (auth)/      # Login, signup, forgot password
│           │   ├── design/      # Design Workspace routes
│           │   │   ├── boms/
│           │   │   ├── materials/
│           │   │   └── revisions/
│           │   ├── operations/  # Operations Workspace routes
│           │   │   ├── inventory/
│           │   │   ├── orders/
│           │   │   ├── suppliers/
│           │   │   └── lifecycle/
│           │   ├── marketing/   # Marketing Workspace routes
│           │   │   ├── products/
│           │   │   ├── families/
│           │   │   ├── assets/
│           │   │   └── channels/
│           │   ├── compliance/  # Compliance Workspace routes
│           │   │   ├── ready/
│           │   │   ├── issued/
│           │   │   └── attestations/
│           │   └── settings/    # Organization settings
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

### Volume-Based Pricing

| Plan | Monthly | Annual | Products | AI Imports | Users |
|------|---------|--------|----------|------------|-------|
| **Growth** | €129 | €1,290/yr | 2,000 | 100/mo | Unlimited |
| **Scale** | €399 | €3,990/yr | 20,000 | 1,000/mo | Unlimited |
| **Enterprise** | Custom | Custom | Unlimited | Custom | Unlimited |

**Volume Overages:** €10 per 100 additional SKUs beyond plan limits.

### Module Access by Tier

All customers receive full platform access. Tier differentiation is based solely on catalog capacity.

| Module | Growth | Scale | Enterprise |
|--------|:------:|:-----:|:----------:|
| Core (Auth, Billing) | ✓ | ✓ | ✓ |
| Compliance (DPP, VCs) | ✓ | ✓ | ✓ |
| DAM (Full) | ✓ | ✓ | ✓ |
| PIM (Families, Variants) | ✓ | ✓ | ✓ |
| Bulk Operations | ✓ | ✓ | ✓ |
| Export (CSV/JSON) | ✓ | ✓ | ✓ |
| Audit Log | ✓ | ✓ | ✓ |
| Import (CSV) | ✓ | ✓ | ✓ |
| Import (AI) | 100/mo | 1,000/mo | Custom |
| Attestation (Multi-Party) | ✓ | ✓ | ✓ |
| Syndication (Shopify) | ✓ | ✓ | ✓ |
| API Access | Rate Limited | High Limits | Custom |
| Webhooks | ✓ | ✓ | ✓ |
| SSO | - | - | ✓ |
| SLA | - | - | 99.9% |

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
| ARR | €0.9M | €3.2M | €8.5M |
| Active Products | 100k | 400k | 1M |
| DPPs Issued | 50k | 200k | 500k |

---

## 11. EU Integration (EBSI & DPP Registry)

EuroComply is architected for seamless transition to EU-managed infrastructure. See [EU_INTEGRATION.md](docs/EU_INTEGRATION.md) for full details.

### Already Compliant

| Standard | Status | Notes |
|----------|--------|-------|
| W3C Verifiable Credentials | ✅ Complete | Same format EU uses |
| GS1 GTIN | ✅ Complete | Product identification |
| GS1 Digital Link | ✅ Complete | URL structure |
| JSON-LD | ✅ Complete | Data format |
| did:key | ✅ Complete | Portable identities |

### EBSI Integration (2025-2026)

**EBSI** (European Blockchain Services Infrastructure) provides EU-anchored trust:

| Phase | Timeline | Tasks |
|-------|----------|-------|
| Preparation | Q2-Q3 2025 | Apply for conformance, integrate EBSI libraries |
| did:ebsi | Q3-Q4 2025 | Add did:ebsi alongside did:key (same keys) |
| Production | Q1 2026 | Organizations can register on EU Trusted Issuers Registry |

**Key Insight:** did:ebsi uses the same cryptographic keys as did:key. Migration is registration, not replacement.

### EU DPP Registry (2026-2027)

The **EU DPP Registry** launches July 2026 as the central index of all DPPs:

| Phase | Timeline | Tasks |
|-------|----------|-------|
| Preparation | Q1-Q2 2026 | Monitor API specs, build client library |
| Integration | Q3-Q4 2026 | Auto-register new DPPs on issuance |
| Full Operation | 2027 | All DPPs indexed, dual-path serving |

**Key Insight:** EU Registry is an index pointing to our infrastructure. We remain the DPP content host.

### EPCIS 2.0 Integration (Core Feature)

EPCIS 2.0 is integrated **from day one** as a core feature. EuroComply operates a **Hybrid EPCIS Model**:
1. **Read from enterprise EPCIS** - Query existing SAP/IBM/TraceLink repositories
2. **Host OpenEPCIS for SMB** - Provide EPCIS hosting for customers/suppliers who don't have their own

See [EPCIS_INTEGRATION.md](docs/EPCIS_INTEGRATION.md) for full documentation.

#### Our Role: Hybrid EPCIS Provider

| Customer Type | Their Situation | Our Solution |
|---------------|-----------------|--------------|
| Enterprise (Nestlé, H&M) | Have SAP/IBM EPCIS | Read from their systems |
| Mid-market manufacturer | No EPCIS, have ERP | Host OpenEPCIS for them |
| SMB supplier | No EPCIS, no ERP | Manual portal → our OpenEPCIS |

**Why hybrid?**
- **Works with enterprise systems** - Don't force customers to migrate
- **Enables SMB participation** - Without requiring infrastructure investment
- **Data sovereignty options** - Enterprise keeps their data, SMB uses ours
- **Compatible with ANY EPCIS 2.0 repository** - SAP, IBM, TraceLink + our hosted OpenEPCIS

#### Components

| Component | Purpose |
|-----------|---------|
| **Hosted OpenEPCIS** | Multi-tenant EPCIS for SMB customers/suppliers (PostgreSQL) |
| **EPCIS Query Client** | Unified client to query any EPCIS 2.0 source |
| **Story Builder** | Transform raw EPCIS JSON into human-readable timelines |
| **Manual Entry Portal** | Simple UI for suppliers without systems |
| **Location Master** | GLN → human-readable location name resolution |
| **Carbon Aggregator** | Calculate total footprint from transport events |

**Why core from day one?**
- ESPR requires supply chain traceability
- Carbon footprint tracking needs transport events
- Repair/refurbishment history is mandatory
- Customers expect full lifecycle visibility

### Data Model Additions

```prisma
model OrganizationWallet {
  // Existing: did:key
  didKey          String   @unique

  // NEW: did:ebsi (after EBSI registration)
  didEbsi         String?  @unique
  ebsiRegisteredAt DateTime?
  ebsiTirEntry    String?
}

model Passport {
  // NEW: EU Registry integration
  euRegistryId    String?  @unique
  euRegisteredAt  DateTime?
  euRegistryStatus EuRegistryStatus @default(NOT_REGISTERED)

  // NEW: EPCIS integration (hybrid model)
  epcisEnabled          Boolean  @default(false)
  totalCarbonFootprint  Float?   // Cached from queries
  lastEventTime         DateTime?
  eventCount            Int      @default(0)
}

// External EPCIS Repository connections (enterprise customers)
model EpcisRepository {
  id              String   @id @default(cuid())
  organizationId  String
  name            String   // "Factory EPCIS", "DHL Tracking", etc.
  baseUrl         String   // https://epcis.supplier.com
  authType        String   // 'oauth2', 'apikey', 'basic'
  credentials     String   // Encrypted JSON
  isExternal      Boolean  @default(true) // true = external, false = our hosted
  isActive        Boolean  @default(true)
  lastChecked     DateTime?
  lastError       String?
}

// Hosted EPCIS events (for SMB customers using our OpenEPCIS)
model EpcisEvent {
  id              String   @id @default(cuid())
  organizationId  String   // Partition key for multi-tenancy
  eventId         String   @unique // EPCIS event ID
  eventType       String   // ObjectEvent, AggregationEvent, etc.
  eventTime       DateTime
  epcList         String[] // Product identifiers
  bizStep         String?
  disposition     String?
  readPoint       String?  // GLN
  bizLocation     String?  // GLN
  eventJson       Json     // Full EPCIS event
  createdAt       DateTime @default(now())

  @@index([organizationId])
  @@index([eventTime])
  @@index([epcList])
}

// NEW: Location master data (for GLN resolution)
model EpcisLocation {
  id              String   @id @default(cuid())
  organizationId  String
  gln             String   @unique  // Global Location Number
  name            String
  type            String   // warehouse, factory, store, etc.
  city            String?
  country         String   // ISO 3166-1 alpha-2
  latitude        Float?
  longitude       Float?
}
```

### Implementation Tasks

| Task | Phase | Status |
|------|-------|--------|
| **EBSI Preparation** | | |
| Apply for EBSI conformance testing | Q2 2025 | Planned |
| Integrate @cef-ebsi/verifiable-credential library | Q2 2025 | Planned |
| Implement did:ebsi resolver | Q3 2025 | Planned |
| Add did:ebsi to OrganizationWallet schema | Q3 2025 | Planned |
| Build EBSI registration UI | Q3 2025 | Planned |
| **EU Registry** | | |
| Build EU Registry client library | Q2 2026 | Planned |
| Add Registry registration to DPP issuance | Q3 2026 | Planned |
| Auto-register all new DPPs | Q3 2026 | Planned |
| Batch register existing DPPs | Q4 2026 | Planned |
| **EPCIS (Core Feature - Hybrid Model)** | | |
| Deploy hosted OpenEPCIS (PostgreSQL backend) | Phase 4 | Planned |
| Multi-tenant schema (organization_id partitioning) | Phase 4 | Planned |
| EPCIS 2.0 REST API (capture + query) | Phase 4 | Planned |
| Build unified query client (internal + external) | Phase 4 | Planned |
| Support OAuth 2.0 and API key authentication | Phase 4 | Planned |
| Add repository connection management API | Phase 4 | Planned |
| Build Story Builder service | Phase 4 | Planned |
| Implement bizStep → human text mapping | Phase 4 | Planned |
| Add GLN → location resolution (Location Master) | Phase 4 | Planned |
| Carbon footprint aggregation from events | Phase 4 | Planned |
| Multi-source event merging | Phase 4 | Planned |
| Add EPCIS tables to Prisma schema | Phase 4 | Planned |
| Product lifecycle timeline UI component | Phase 4 | Planned |
| Repository connection settings UI | Phase 4 | Planned |
| Add lifecycle tab to DPP public page | Phase 4 | Planned |
| Carbon footprint visualization | Phase 4 | Planned |
| Manual event entry portal (→ hosted OpenEPCIS) | Phase 5 | Planned |
| Supplier invitation workflow | Phase 5 | Planned |
| Excel/CSV bulk event upload | Phase 5 | Planned |
| Fair use monitoring (events/product tracking) | Phase 5 | Planned |

---

## 12. Related Documentation

| Document | Description |
|----------|-------------|
| [README.md](./README.md) | Platform overview and setup |
| [BUSINESS_MODEL.md](./docs/BUSINESS_MODEL.md) | Pricing and market positioning |
| [SCALABILITY.md](./docs/SCALABILITY.md) | Trillion-scale DPP serving architecture |
| [EU_INTEGRATION.md](./docs/EU_INTEGRATION.md) | EBSI and EU DPP Registry integration |
| [EPCIS_INTEGRATION.md](./docs/EPCIS_INTEGRATION.md) | EPCIS 2.0 supply chain event tracking |
| [USER_MANAGEMENT.md](./docs/USER_MANAGEMENT.md) | User roles, permissions, and version control workflow |
| [DATA_SOVEREIGNTY.md](./docs/DATA_SOVEREIGNTY.md) | Data ownership architecture |
| [VERIFIABLE_CREDENTIALS.md](./docs/VERIFIABLE_CREDENTIALS.md) | VC/DID technical details |
| [MULTI_PARTY_ATTESTATION.md](./docs/MULTI_PARTY_ATTESTATION.md) | Third-party data contribution architecture |
| [ECOMMERCE_INTEGRATIONS.md](./docs/ECOMMERCE_INTEGRATIONS.md) | Shopify integration guide |
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | AWS + Hetzner deployment guide |

---

*Last Updated: January 11, 2026*
