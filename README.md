# EuroComply

**Compliance-First Product Information Management for EU Regulations**

EuroComply is a Product Information Management (PIM) platform with Digital Product Passports (DPP) as a core capability. Built for brands, manufacturers, and distributors who need to manage product data and comply with EU ESPR regulations.

---

## Platform Overview

EuroComply unifies product data management and regulatory compliance into a single platform. Instead of treating compliance as an afterthought, the platform architects data structures where regulatory validity is intrinsic to the product record.

### Core Concept: The Golden Record

Every product has a single "Golden Record" containing both commercial attributes and compliance data:

```
┌─────────────────────────────────────────────────────────────────┐
│                      GOLDEN RECORD                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  COMMERCIAL DATA              COMPLIANCE DATA                   │
│  ├── Name, Description        ├── Material Composition          │
│  ├── SKU, GTIN                ├── Carbon Footprint              │
│  ├── Price, Currency          ├── Certifications                │
│  ├── Images, Media            ├── Country of Origin             │
│  └── Variants                 └── Care Instructions             │
│                                                                  │
│                        ↓                                         │
│              ┌─────────────────┐                                │
│              │ DPP Ready List  │ Review and approve for issue   │
│              └────────┬────────┘                                │
│                       ↓                                         │
│              ┌─────────────────┐                                │
│              │ Shopify Sync    │ Product syndication            │
│              └─────────────────┘                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Platform Modules

EuroComply uses a modular architecture. Organizations enable the modules they need:

| Module | Description | Depends On |
|--------|-------------|------------|
| **Core** | Authentication, organizations, billing | - |
| **Compliance** | DPP generation, walt.id credentials, lifecycle tracking | Core |
| **Attestation** | Third-party data contributions with cryptographic signatures | Core, Compliance |
| **PIM** | Product families, variants, completeness scoring | Core |
| **DAM** | Digital asset management, image optimization | Core |
| **Import** | AI-powered data import from any format | Core, PIM |
| **Syndication** | Shopify integration, channel publishing | Core, PIM |

### Plan-Based Access

| Plan | Monthly | Annual | Products | Key Features |
|------|---------|--------|----------|--------------|
| **DPP Starter** | €29 | €290/yr | 50 | Core, Compliance, Basic DAM (session-only storage) |
| **DPP Professional** | €99 | €990/yr | 500 | + Basic PIM (3 families), CSV Import, 20 AI imports/mo, Attestation |
| **PIM Standard** | €199 | €1,990/yr | 2,000 | + Full PIM, Unlimited AI, Bulk Ops, Export, Audit Log, Shopify, API |
| **PIM Growth** | €499 | €4,990/yr | 20,000 | + Webhooks, Priority Support, 99.5% SLA |
| **Enterprise** | Custom | Custom | 100,000+ | + Custom integrations, Dedicated Success, 99.9% SLA |

---

## Key Features

### AI-Powered Import

Users can import product data from any format. The AI extracts, maps, and validates data automatically:

- **Supported formats**: CSV, Excel, PDF, JSON, Images (OCR)
- **Intelligent mapping**: AI suggests field mappings to your product schema
- **Data enrichment**: Auto-fill missing fields based on product type
- **Validation**: Schema validation and compliance pre-checks

### Product Information Management

- **Product Families**: Define attribute schemas per product type
- **Industry Templates**: Start from pre-built templates (ESPR Textiles, Electronics, Food & Beverage, etc.) or build from scratch
- **Template Customization**: Modify templates - add fields, remove optional fields, adjust validation
- **Dynamic Attributes**: Flexible JSONB storage for category-specific data
- **Variants**: Parent-child product relationships with attribute inheritance
- **Completeness Scoring**: Per-channel readiness scores (DPP: 85%, Shopify: 100%)
- **Multi-Currency**: Support for EUR, USD, GBP, and other currencies
- **Bulk Operations**: Edit, delete, or assign families to multiple products at once (PIM Standard+)
- **Export**: Download product data as CSV, Excel, or JSON (PIM Standard+)
- **Audit Log**: Track who changed what, when - essential for compliance (PIM Standard+)

### Digital Product Passports

- **DPP Ready Products**: Products appear in approval queue when completeness reaches 100%
- **Manual Review & Issue**: Review product data before issuing DPP
- **Verifiable Credentials**: W3C VCs signed with did:key for tamper evidence
- **Portable**: Organizations own their credentials, can export anytime
- **QR Codes**: GS1 Digital Link compatible

### Multi-Party Attestation

Request and receive product data from third parties (manufacturers, certifiers, labs, suppliers) with cryptographic proof of origin:

- **Data Requests**: Invite third parties via email to contribute specific product data
- **Contributor Portal**: Third parties sign up, get their own did:key, and contribute data
- **Cryptographic Signatures**: Every contribution is signed with the contributor's DID
- **Linked Verifiable Credentials**: Each attestation is its own VC, linked to the main DPP
- **Review Workflow**: Customer reviews and approves contributions before inclusion
- **Expiry & Revocation**: Track attestation validity, get notified when certifications expire
- **Trust Transparency**: DPP displays which data is self-claimed vs. third-party attested

```
┌─────────────────────────────────────────────────────────────────┐
│                    ATTESTATION FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CUSTOMER                    CONTRIBUTOR                         │
│  ─────────                   ───────────                        │
│  1. Request data ──────────► 2. Receive email invitation        │
│                              3. Sign up (get did:key)           │
│  6. Review & approve ◄────── 4. Enter data                      │
│  7. Issue DPP with           5. Sign with DID                   │
│     linked attestations                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### E-commerce Syndication

- **Shopify Integration**: Sync products, variants, and DPP metadata
- **Rate-Limited Sync**: Respectful of API limits with queue-based processing
- **Bi-directional**: Import from Shopify, push updates back

### Retailer DPP Access

Retailers who sell products from brands using EuroComply can access and display DPPs on their storefronts. This is provided free of charge in compliance with ESPR Article 31, which mandates free DPP access for all economic operators.

Retailers register for a free account and gain access to:

- **DPP Catalog Browser**: Search and browse DPPs by GTIN, brand and SKU, or serial number
- **Embeddable Widget**: Copy-paste JavaScript snippet to display DPPs on product pages
- **Public API**: Programmatic access to look up and retrieve DPP data
- **Shopify Retailer App**: Automatic matching of store products to available DPPs

Lookup is supported by GTIN/EAN, brand and SKU combination, or item-level serial numbers.

---

## Technology Stack

### Backend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Node.js 20 | API server, async I/O |
| Framework | Express.js | HTTP routing |
| ORM | Prisma | Type-safe database access |
| Database | PostgreSQL 16 | Primary data store with JSONB |
| Cache/Queue | Redis + BullMQ | Caching, job processing |
| Identity | walt.id | DID/VC infrastructure |
| AI | Claude API | Document parsing, data extraction |

### Frontend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | Next.js 14 | React with App Router |
| Styling | Tailwind CSS | Utility-first CSS |
| Data Grid | AG Grid | Spreadsheet-like product management |
| State | React Query | Server state management |

### Infrastructure

| Component | Technology | Purpose |
|-----------|------------|---------|
| Compute | AWS ECS Fargate | Containerized API |
| Database | AWS RDS | Managed PostgreSQL |
| Cache | AWS ElastiCache | Managed Redis |
| Storage | AWS S3 + CloudFront | Asset storage and CDN |
| Image Processing | AWS Lambda + Sharp | On-the-fly image optimization |
| Frontend | Vercel | Next.js hosting |

---

## Data Model

### Core Entities

```
Organization (tenant)
├── Products (Golden Records)
│   ├── attributes: JSONB (dynamic, validated by family)
│   ├── completeness: JSONB (per-channel scores)
│   ├── dppData: JSONB (compliance snapshot)
│   ├── price: Decimal (multi-currency)
│   └── Variants
│       └── attributes: JSONB (overrides parent)
├── ProductFamilies (attribute schemas)
│   ├── attributeSchema: JSONB (field definitions)
│   ├── completenessRules: JSONB (per-channel requirements)
│   └── templateId?: references ProductFamilyTemplate
├── ProductFamilyTemplates (industry presets)
│   ├── attributeSchema: JSONB (default fields)
│   └── industry: ESPR | FOOD | COSMETICS | INDUSTRIAL | CUSTOM
├── Assets (DAM)
│   └── ProductAssets (many-to-many with roles)
├── Channels (Shopify connections)
│   └── ChannelListings (product sync status)
├── ImportJobs (AI import tracking)
├── Passports (issued DPPs with VCs)
│   └── attestations: linked attestation VCs
├── DataRequests (invitations to contribute)
│   └── requestedFields, visibility, expiry settings
└── Contributions (third-party attestations)
    ├── contributorId, fields[], status
    └── versions: signed ContributionVersions with VCs

Contributors (third-party attestors - cross-organization)
├── email, companyName, type
├── did, didKeyId (their own did:key)
└── verificationLevel: SELF_ATTESTED | DOMAIN_VERIFIED
```

### Hybrid Schema Design

The database uses a hybrid relational/JSONB approach:

- **Relational columns**: Universal fields (SKU, GTIN, name, status, price)
- **JSONB columns**: Dynamic attributes validated by ProductFamily schema

This provides SQL query performance for core fields with NoSQL flexibility for category-specific data.

---

## Project Structure

```
EuroComply/
├── apps/
│   ├── api/                 # Express.js API server
│   │   └── src/
│   │       ├── core/        # Auth, org, billing
│   │       ├── compliance/  # Passports, lifecycle
│   │       ├── attestation/ # Multi-party contributions
│   │       ├── pim/         # Families, variants, scoring
│   │       ├── dam/         # Assets
│   │       ├── import/      # AI import
│   │       ├── syndication/ # Shopify connector
│   │       └── retailer/    # Retailer access, public API
│   └── frontend/            # Next.js dashboard
├── packages/
│   ├── database/            # Prisma schema
│   ├── shared/              # Shared types, validation
│   └── identity/            # walt.id integration
├── infrastructure/
│   ├── aws/                 # CloudFormation templates
│   └── terraform/           # Alternative IaC
└── docs/                    # Documentation
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker (for local development)

### Local Development

```bash
# Clone repository
git clone https://github.com/your-org/EuroComply.git
cd EuroComply

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Start database and Redis
docker-compose up -d postgres redis

# Run migrations
npm run db:migrate

# Start development server
npm run dev
```

### Environment Variables

See `.env.example` for required configuration. Key variables:

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/eurocomply

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-32-char-minimum-secret

# walt.id
WALTID_CORE_API=http://localhost:7000
WALTID_SIGNATORY_API=http://localhost:7001
WALTID_CUSTODIAN_API=http://localhost:7002
WALTID_AUDITOR_API=http://localhost:7003

# Shopify
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret

# AI (for import)
ANTHROPIC_API_KEY=your_claude_api_key
```

---

## API Documentation

API documentation available at:
- Development: http://localhost:3000/api/docs
- Production: https://api.eurocomply.eu/api/docs

### Authentication

All API requests require an API key:

```bash
curl https://api.eurocomply.eu/v1/products \
  -H "Authorization: Bearer ec_live_xxxxx"
```

---

## Compliance

### EU Regulations

- **ESPR** (Ecodesign for Sustainable Products Regulation): DPP generation
- **GDPR**: EU data residency (Frankfurt), encryption at rest/transit

### Data Standards

- **W3C Verifiable Credentials**: Tamper-evident DPPs
- **W3C DIDs**: did:key for portable identity
- **GS1 Digital Link**: QR code standards

### ESPR Timeline

| Milestone | Date | Impact |
|-----------|------|--------|
| ESPR enters into force | July 2024 | Framework law active |
| First delegated acts | 2025-2026 | Product-specific rules |
| DPP requirements begin | 2027+ | Passports required |

**First product categories**: Textiles, batteries, electronics, furniture

---

## Data Sovereignty

Organizations own their data. Full portability guaranteed:

| Guarantee | Implementation |
|-----------|----------------|
| **You own your data** | Self-contained VCs with all data embedded |
| **No lock-in** | Open standards (W3C VC, JSON) |
| **Offline verification** | did:key verifies without any server |
| **One-click export** | VC + images + offline HTML viewer |
| **Key portability** | Export/import private keys |

---

## Documentation

| Document | Description |
|----------|-------------|
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Technical implementation roadmap |
| [BUSINESS_MODEL.md](./docs/BUSINESS_MODEL.md) | Pricing and business model |
| [ARCHITECTURE_PORTABILITY.md](./docs/ARCHITECTURE_PORTABILITY.md) | Data portability architecture |
| [VERIFIABLE_CREDENTIALS.md](./docs/VERIFIABLE_CREDENTIALS.md) | VC/DID technical details |
| [MULTI_PARTY_ATTESTATION.md](./docs/MULTI_PARTY_ATTESTATION.md) | Third-party data contribution architecture |
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | AWS infrastructure guide |
| [ECOMMERCE_INTEGRATIONS.md](./docs/ECOMMERCE_INTEGRATIONS.md) | Shopify integration guide |

---

## License

Proprietary - All rights reserved

---

## Support

- Documentation: https://docs.eurocomply.eu
- API Status: https://status.eurocomply.eu
- Contact: support@eurocomply.eu
