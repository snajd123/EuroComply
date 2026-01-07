# EuroComply Implementation Plan
## Digital Product Passport Infrastructure for ESPR Compliance

---

## 1. Executive Summary

EuroComply is an API-first Digital Product Passport (DPP) platform targeting manufacturers and brands preparing for the EU Ecodesign for Sustainable Products Regulation (ESPR). The platform provides developer-friendly APIs for DPP lifecycle management, following Stripe's playbook for developer experience.

### Core Focus
**ProductTrust API** - Digital Product Passport engine for ESPR compliance

### Target Market
- Mid-market manufacturers (€10M-€100M revenue)
- Brands selling in the EU market
- E-commerce merchants on Shopify/WooCommerce
- First movers in textiles, batteries, electronics, furniture

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
| MVP | `did:web` | Active - no EBSI registration needed |
| Future | `did:ebsi` | When business traction achieved |

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
curl https://api.eurocomply.io/v1/products \
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
| DID Method | did:web | Works immediately, no registration |
| E-commerce | Shopify + WooCommerce | Largest SME platforms |

---

## 9. ESPR Timeline & Market

| Milestone | Date | Implication |
|-----------|------|-------------|
| ESPR enters into force | July 2024 | Framework active |
| First delegated acts | 2025-2026 | Product-specific rules |
| DPP requirements begin | 2027+ | Passports mandatory |

**First product categories**: Textiles, batteries, electronics, furniture

### Target Customer Profile
- Revenue: €10M-€100M
- Products: Physical goods sold in EU
- Tech: Using Shopify/WooCommerce or has dev team
- Pain: Upcoming ESPR compliance, no internal expertise

---

## 10. EBSI Roadmap (Future)

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
- Using: did:web via walt.id
- Credentials: W3C standard, cryptographically signed
- Verifiable: Yes (anyone can verify)
- EBSI-ready: Yes (architecture supports upgrade)

---

## 11. Success Metrics

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

## 12. Related Documentation

- **[README.md](./README.md)** - Quick start and API usage
- **[E-commerce Integrations](./docs/ECOMMERCE_INTEGRATIONS.md)** - Shopify & WooCommerce setup
