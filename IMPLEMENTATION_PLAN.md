# EuroComply Implementation Plan
## Digital Product Passport Infrastructure for ESPR Compliance

---

## 1. Executive Summary

EuroComply is an API-first Digital Product Passport (DPP) platform targeting manufacturers and brands preparing for the EU Ecodesign for Sustainable Products Regulation (ESPR). The platform provides developer-friendly APIs for DPP lifecycle management, following Stripe's playbook for developer experience.

### Core Focus
**ProductTrust API** - Digital Product Passport engine for ESPR compliance

### Target Market
- **SME suppliers** (99% of EU businesses) - producers, importers, brands
- E-commerce merchants on Shopify/WooCommerce
- First movers in textiles, batteries, electronics, furniture
- NOT enterprise (they have SAP, Siemens, Catena-X)

---

## 2. Technology Stack

### Backend Framework
**Node.js + TypeScript + Express**

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js 20+ | Async I/O, ecosystem, Stripe-like DX |
| Language | TypeScript | Type safety, better DX |
| Framework | Express | Proven, flexible, large ecosystem |
| Database | PostgreSQL | ACID, JSON support, mature |
| ORM | Prisma | Type-safe, migrations, great DX |
| Cache | Redis | Rate limiting, sessions |

### Identity & Credentials
**walt.id Community Stack (Apache 2.0)**

- W3C Verifiable Credentials
- SD-JWT (Selective Disclosure)
- OID4VCI/OID4VP protocols
- EBSI compatibility (future)

### DID Strategy
| Phase | Method | Status |
|-------|--------|--------|
| Current | `did:web` | Active - works with walt.id, requires domain hosting |
| Next | `did:key` | 🔄 PLANNED - self-contained, portable, offline verification |
| Future | `did:ebsi` | When institutional trust needed (enterprise customers) |

**Why move to did:key?** The public key IS the identifier. Verification works offline, forever, without any server. Required for true data sovereignty.

> ⚠️ **Current limitation**: We use `did:web` which requires server resolution. Migration to `did:key` is planned to enable offline verification and true data portability.

### Standards
- **GS1 Digital Link** - Product identification URLs
- **W3C Verifiable Credentials** - Cryptographic proofs
- **ESPR/CIRPASS** - DPP data schema alignment

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│  Developer API  │  Dashboard UI   │  E-commerce Plugins             │
│  (REST)         │  (React)        │  (Shopify, WooCommerce)         │
└────────┬────────┴────────┬────────┴──────────────┬──────────────────┘
         │                 │                        │
         ▼                 ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY                                  │
│  • Rate Limiting  • Auth  • Request Validation  • Logging           │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      ProductTrust Service                            │
├─────────────────────────────────────────────────────────────────────┤
│  • Product Management     • Passport Issuance    • QR Generation    │
│  • Lifecycle Events       • Sustainability Data  • Public Verify    │
│  • Unsold Goods Reports   • GS1 Digital Link     • VC Anchoring     │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐
│   Identity      │    │   Integrations  │    │   QR/GS1            │
│   Engine        │    │   Hub           │    │   Service           │
│  (walt.id)      │    │                 │    │                     │
├─────────────────┤    ├─────────────────┤    ├─────────────────────┤
│ • VC Issuance   │    │ • Shopify Sync  │    │ • GS1 Digital Link  │
│ • DID:web       │    │ • WooCommerce   │    │ • QR Generation     │
│ • SD-JWT        │    │ • Webhooks      │    │ • Verification URLs │
└────────┬────────┘    └────────┬────────┘    └──────────┬──────────┘
         │                      │                        │
         └──────────────────────┼────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                   │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│   PostgreSQL    │     Redis       │    Object Storage (S3)          │
│   (Primary DB)  │    (Cache)      │    (QR images, documents)       │
└─────────────────┴─────────────────┴─────────────────────────────────┘
```

---

## 4. Database Schema

### Core Entities

```
Organizations (Tenants)
├── api_keys
├── team_members
├── webhooks
└── settings (Shopify/WooCommerce credentials)

Products
├── name, sku, gtin
├── description
├── attributes (JSON - sustainability data)
├── status (DRAFT, ACTIVE, ARCHIVED)
└── source (manual, shopify, woocommerce)

Passports (DPPs)
├── productId
├── data (JSON - CIRPASS schema)
├── credentialId
├── vcJwt (Verifiable Credential)
├── qrCodeUrl
├── status (DRAFT, ACTIVE, REVOKED)
└── anchoredAt

LifecycleEvents
├── productId
├── eventType (MANUFACTURED, SHIPPED, SOLD, RETURNED, RECYCLED, DESTROYED)
├── quantity
├── reason
└── metadata

AuditLog
├── organizationId
├── action
├── resourceType
├── resourceId
└── metadata
```

---

## 5. API Design

### Authentication
```bash
# API Key in header (Stripe-style)
curl https://api.eurocomply.eu/v1/products \
  -H "Authorization: Bearer ec_live_xxxxx"
```

### ProductTrust API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/products` | Create product |
| GET | `/v1/products` | List products |
| GET | `/v1/products/:id` | Get product |
| PATCH | `/v1/products/:id` | Update product |
| DELETE | `/v1/products/:id` | Archive product |
| POST | `/v1/products/:id/events` | Log lifecycle event |
| POST | `/v1/passports` | Create DPP |
| GET | `/v1/passports/:id` | Get DPP |
| PATCH | `/v1/passports/:id` | Update DPP |
| POST | `/v1/passports/:id/qr` | Generate QR code |
| POST | `/v1/passports/:id/anchor` | Anchor to blockchain |
| GET | `/v1/passports/:id/verify` | Public verification (no auth) |
| GET | `/v1/reports/unsold-goods` | ESPR Article 20 report |

### E-commerce Integration Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/shopify/auth` | Start OAuth flow |
| GET | `/api/shopify/callback` | OAuth callback |
| POST | `/api/shopify/webhooks/:topic` | Webhook handler |
| GET | `/api/shopify/status` | Connection status |
| POST | `/api/shopify/sync` | Manual sync |
| POST | `/api/woocommerce/connect` | Connect store |
| GET | `/api/woocommerce/status` | Connection status |
| POST | `/api/woocommerce/sync` | Manual sync |

### Webhook Events
```
product.created
product.updated
passport.created
passport.anchored
lifecycle.recorded
```

---

## 6. Implementation Status

### Completed ✅

- [x] Project scaffolding (monorepo)
- [x] Database schema (Prisma + PostgreSQL)
- [x] Authentication system (API keys)
- [x] Rate limiting and middleware
- [x] Organization/tenant management
- [x] Product CRUD operations
- [x] Passport CRUD operations
- [x] GS1 Digital Link generation
- [x] QR code generation
- [x] Lifecycle event tracking
- [x] walt.id integration (VCs)
- [x] DID document hosting (did:web)
- [x] Public passport verification
- [x] Shopify integration (OAuth, sync, webhooks)
- [x] WooCommerce integration (API key, sync, webhooks)

### In Progress 🔄

- [ ] React Dashboard
- [ ] Batch passport generation
- [ ] ESPR unsold goods report generation

### Future 📋

- [ ] EBSI integration (when mature)
- [ ] Supply chain credential sharing
- [ ] AI-powered document parsing
- [ ] Additional e-commerce platforms

---

## 7. Directory Structure

```
eurocomply/
├── apps/
│   ├── api/                    # Express.js API server
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── product-trust/    # DPP endpoints
│   │   │   │   └── integrations/     # Shopify, WooCommerce
│   │   │   ├── common/
│   │   │   │   ├── auth/
│   │   │   │   ├── middleware/
│   │   │   │   ├── routes/           # health, did
│   │   │   │   └── utils/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── dashboard/              # React admin dashboard (planned)
│
├── packages/
│   ├── database/               # Prisma schema & migrations
│   ├── identity/               # walt.id integration
│   ├── integrations/           # Shopify & WooCommerce clients
│   └── shared/                 # Shared types and utilities
│
├── docs/
│   └── ECOMMERCE_INTEGRATIONS.md
│
├── docker/
│   ├── docker-compose.yml
│   └── Dockerfile
│
└── README.md
```

---

## 8. Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Monolith-first | Faster iteration, extract services later |
| API Style | REST | Stripe-like simplicity |
| Multi-tenancy | Shared DB, row-level | Cost-effective for SME pricing |
| Identity | walt.id (free) | W3C VCs, EBSI-ready |
| DID Method | did:key | Self-contained, portable, offline verification |
| E-commerce | Shopify + WooCommerce | Largest SME platforms |

---

## 9. Business Model

### Supplier-Pays SaaS (ESPR Article 31 Compliant)

**Suppliers pay** for DPP creation tools. **Retailers access free** (EU law mandates free access).

| Tier | Monthly | DPPs | Features |
|------|---------|------|----------|
| Starter | €49 | 50 | Creator studio, VCs, hosting, QR codes |
| Growth | €149 | 500 | + CSV import, templates, priority support |
| Pro | €399 | 2,000 | + API access, white-label, dedicated support |

See [BUSINESS_MODEL.md](docs/BUSINESS_MODEL.md) for details.

### Data Sovereignty

All tiers include full data sovereignty:
- Self-contained VCs (all data embedded)
- Offline verification (works forever without us)
- One-click export (VC + images + offline viewer)
- No lock-in (open standards, any viewer works)

See [DATA_SOVEREIGNTY.md](docs/DATA_SOVEREIGNTY.md) for architecture details.

---

## 10. Product Roadmap

### Phase 1: Textile MVP ✅ COMPLETE

**Goal:** Compliant DPPs for textile/apparel SMEs

```typescript
interface TextileDppData {
  // MANDATORY (2027)
  fiberComposition: FiberEntry[];
  countryOfOrigin: string;
  manufacturerIdentification: { name: string; did?: string; };
  careInstructions: { maxWashTemp: number; bleachAllowed: boolean; tumbleDry: boolean; };
  hazardousSubstances: { reachCompliant: boolean; };

  // RECOMMENDED
  carbonFootprint?: { value: number; unit: 'kgCO2e'; methodology: string; };
  certifications?: Certification[];
}
```

**Delivered:**
- Textile-specific schema and validation
- Data collection UI in Shopify app
- Template library (t-shirt, jeans, jacket benchmarks)
- Compliance validation engine

### Phase 2: Third-Party Data Integration ✅ COMPLETE

**Goal:** Auto-populate from industry databases

- Higg MSI integration (carbon footprint calculation)
- Certification registry (GOTS, OEKO-TEX, GRS)

### Phase 3: Supplier SaaS Platform ⚠️ PARTIAL

**Goal:** Self-service supplier onboarding

**Implemented:**
- ✅ Supplier portal (registration, verification, dashboard)
- ✅ SaaS subscription billing (€49/149/399) - schema + services ready
- ✅ Free retailer catalog access (ESPR Article 31)
- ✅ Email verification service
- ✅ VIES VAT verification service

**Not Yet Implemented:**
- ❌ Data export (VCs + keys + images)
- ❌ Self-contained VCs (all data embedded)
- ❌ Offline viewer
- ❌ did:key migration (currently did:web)

### Phase 3.5: Data Sovereignty 📋 PLANNED

**Goal:** True data portability and ownership

- did:key implementation (offline verification)
- Self-contained VCs (all DPP data embedded)
- One-click export (VC + images + offline viewer)
- Public DPP viewer app

### Phase 4: Shopify Metaobject Sync 📋 PLANNED

**Goal:** Native Shopify data storage

- DPP metaobject definitions
- Bi-directional sync with EuroComply

### Phase 5: Furniture & Electronics (2026)

**Goal:** Expand to next product categories

Aligned with regulatory deadlines:
| Category | ESPR Deadline | Our Timeline |
|----------|---------------|--------------|
| Textiles | 2027 | ✅ Ready |
| Furniture | 2029 | 2026 |
| Electronics | 2030 | 2027 |

### Phase 6: Advanced Features (2026+)

- Item-level tracking (serial numbers)
- Supply chain VCs
- GS1 Digital Link resolver
- Basic AAS export

---

## 11. ESPR Timeline & Market

| Milestone | Date | Implication |
|-----------|------|-------------|
| ESPR enters into force | July 2024 | Framework active |
| First delegated acts | 2025-2026 | Product-specific rules |
| DPP requirements begin | 2027+ | Passports mandatory |

**First product categories**: Textiles, batteries, electronics, furniture

### Target Customer Profile (SME Suppliers)
- Company size: 5-200 employees
- Revenue: €1M-€50M (SME range)
- Products: Physical goods sold in EU
- IT staff: 0-2 (not dedicated)
- Tech: Using Shopify/WooCommerce, can use web apps
- Pain: Upcoming ESPR compliance, no internal expertise, can't afford enterprise solutions

---

## 12. EBSI Roadmap (Future)

EBSI integration planned when business traction achieved.

### Trigger Criteria
- 50+ paying customers
- €10K+ MRR
- Enterprise customer requirement

### What EBSI Adds
- Listed in EU Trusted Issuers Registry
- Full eIDAS 2.0 legal recognition
- "Powered by EBSI" marketing

### Current State
- Using: did:web via walt.id (requires domain hosting)
- Credentials: W3C VCs (data stored in DB, referenced in VC)
- Verifiable: Yes (requires server resolution for did:web)
- Data Sovereignty: Partial (export not yet implemented)
- EBSI-ready: Yes (architecture supports upgrade)

### Target State (Phase 3.5)
- did:key (self-contained, offline verification)
- Self-contained VCs (all data embedded)
- Full data sovereignty (one-click export, no lock-in)

---

## 13. Success Metrics

### Technical KPIs
- API latency < 200ms (p95)
- 99.9% uptime
- < 0.1% error rate
- Time to first passport < 5 minutes

### Business KPIs
- Year 1: 500 organizations, €500K ARR
- Year 2: 2,000 organizations, €2M ARR
- Focus: Product-market fit before scale

---

## 14. Related Documentation

- **[README.md](./README.md)** - Quick start and API usage
- **[Business Model](./docs/BUSINESS_MODEL.md)** - Pricing and supplier-pays model
- **[Data Sovereignty](./docs/DATA_SOVEREIGNTY.md)** - Self-contained VCs and no lock-in
- **[E-commerce Integrations](./docs/ECOMMERCE_INTEGRATIONS.md)** - Shopify & WooCommerce setup
- **[Verifiable Credentials](./docs/VERIFIABLE_CREDENTIALS.md)** - How DPPs become cryptographically verifiable
- **[Testing Guide](./docs/TESTING_GUIDE.md)** - Local testing instructions
