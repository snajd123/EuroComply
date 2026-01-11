# EuroComply

**Compliance-First Product Information Management for EU Regulations**

EuroComply is a unified platform for product lifecycle management and EU regulatory compliance. Built for brands, manufacturers, and distributors who need to manage product data, track supply chains, and comply with EU ESPR regulations.

**One platform, four workspaces** - each persona gets a purpose-built interface backed by shared data.

---

## Platform Overview

EuroComply unifies product data management and regulatory compliance into a single platform. Instead of treating compliance as an afterthought, the platform architects data structures where regulatory validity is intrinsic to the product record.

### The Workspace Architecture

Different roles need different views of the same data. EuroComply provides **four specialized workspaces**, each tailored to a specific persona:

| Workspace | Persona | Focus |
|-----------|---------|-------|
| **Design** | Product Designers, R&D | BOMs, material specs, revision control |
| **Operations** | Supply Chain, Procurement | Inventory, orders, supplier management |
| **Marketing** | Brand Managers, E-commerce | Product content, images, channel syndication |
| **Compliance** | Compliance Officers, QA | DPP issuance, certifications, audits |

All workspaces read from and write to the same **Hub** - the central source of truth. Changes in one workspace are immediately visible in others.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        WORKSPACE LAYER                                   │
├──────────────┬──────────────┬──────────────┬──────────────────────────┤
│   DESIGN     │  OPERATIONS  │  MARKETING   │       COMPLIANCE          │
│  (PLM-lite)  │  (ERP-lite)  │  (PIM-lite)  │       (DPP-core)         │
│              │              │              │                           │
│ • BOMs       │ • Inventory  │ • Content    │ • DPP Issuance           │
│ • Materials  │ • Orders     │ • Images     │ • Certifications         │
│ • Revisions  │ • Suppliers  │ • Channels   │ • Attestations           │
└──────┬───────┴──────┬───────┴──────┬───────┴───────────┬───────────────┘
       │              │              │                   │
       └──────────────┴──────────────┴───────────────────┘
                              │
                              ▼
       ┌─────────────────────────────────────────────────────────────────┐
       │                         THE HUB                                  │
       │              (Central Data Model - Single Truth)                 │
       │                                                                  │
       │   Products • Variants • Materials • Suppliers • Certifications  │
       └─────────────────────────────────────────────────────────────────┘
```

**Workspace access is role-based.** All customers receive all workspaces - differentiation is based on catalog capacity, not features. Users see the workspaces relevant to their role (e.g., a Distributor may not need the Design workspace).

### Core Concept: The Hub (Golden Record)

At the center of EuroComply is **The Hub** - every product has a single "Golden Record" containing all data across workspaces:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           THE HUB (Golden Record)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DESIGN DATA              OPERATIONS DATA           MARKETING DATA          │
│  ├── Bill of Materials    ├── Inventory Levels      ├── Product Name        │
│  ├── Material Specs       ├── Supplier Info         ├── Description         │
│  ├── Revision History     ├── Batch/Lot Numbers     ├── Images, Media       │
│  └── Component Sources    └── Purchase Orders       └── Pricing             │
│                                                                              │
│  COMPLIANCE DATA                                                             │
│  ├── Material Composition    ├── Carbon Footprint    ├── Certifications     │
│  ├── Country of Origin       ├── Care Instructions   └── Third-Party Attest │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                          WORKSPACE PROJECTIONS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Design View │  │ Ops View    │  │ Marketing   │  │ Compliance View     │ │
│  │ BOM Editor  │  │ Inventory   │  │ PIM Grid    │  │ DPP Ready List      │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

Each workspace provides a **filtered, optimized view** of the Hub data relevant to that persona. Edit in any workspace - the Hub stays synchronized.

---

## Platform Modules

EuroComply uses a modular architecture. Modules are the backend capabilities that power the workspaces:

| Module | Description | Primary Workspace(s) |
|--------|-------------|---------------------|
| **Core** | Authentication, organizations, billing | All |
| **Registry** | Product structure, BOMs, versions, SKU management (Technical DNA) | Design, Operations |
| **Materials** | Material library, compositions, sustainability properties | Design |
| **PIM** | Marketing content, descriptions, SEO, translations (Commercial enrichment) | Marketing |
| **DAM** | Digital asset management (Tech docs for Design, Media for Marketing) | Design, Marketing |
| **Compliance** | DPP generation, walt.id credentials, lifecycle tracking | Compliance |
| **EPCIS** | Supply chain events, carbon tracking, lifecycle visualization | Operations, Compliance |
| **Attestation** | Third-party data contributions with cryptographic signatures | All (different datapoints) |
| **Import** | AI-powered data import from any format | All |
| **Syndication** | Shopify integration, channel publishing | Marketing |

### Workspace → Module Mapping

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND: WORKSPACES                               │
├───────────────┬───────────────┬───────────────┬────────────────────────────┤
│    Design     │  Operations   │   Marketing   │        Compliance          │
│    (PLM)      │  (ERP-lite)   │   (PIM)       │        (DPP)               │
│               │               │               │                            │
│ Uses:         │ Uses:         │ Uses:         │ Uses:                      │
│ • Registry    │ • Registry    │ • PIM         │ • Compliance               │
│ • Materials   │ • EPCIS       │ • DAM-Media   │ • Registry (read)          │
│ • DAM-Tech    │ • Attestation │ • Syndication │ • EPCIS (read)             │
│ • Attestation │ • Import      │ • Import      │ • Attestation              │
│ • Import      │               │ • Registry*   │ • PIM (read)               │
└───────────────┴───────────────┴───────────────┴────────────────────────────┘
                              * read-only
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND: MODULES                                    │
│ Core│Registry│Materials│PIM│DAM│Compliance│EPCIS│Attestation│Import│Syndic │
└────────────────────────────────────────────────────────────────────────────┘
```

**Key Architecture Insight:**
- **Registry** = Technical DNA (product structure, BOMs, versions) - used by Design
- **PIM** = Commercial Enrichment (marketing descriptions, SEO) - used by Marketing
- **DAM** serves both: Tech docs/specs for Design, Media assets for Marketing

**Note:** Multi-Party Attestation is available in ALL workspaces - different personas request attestations for different datapoints (Design: material certs, Operations: supplier audits, Marketing: brand claims, Compliance: regulatory certifications).

### Volume-Based Pricing

All customers receive full platform access. Tier differentiation is based solely on catalog capacity.

| Plan | Monthly | Annual | Products | AI Imports | API | Support |
|------|---------|--------|----------|------------|-----|---------|
| **Growth** | €129 | €1,290/yr | 2,000 | 100/mo | Rate Limited | Email |
| **Scale** | €399 | €3,990/yr | 20,000 | 1,000/mo | High Limits | Priority |
| **Enterprise** | Custom | Custom | Unlimited | Custom | Custom | Dedicated + SLA |

**Included in all plans:** All four workspaces, full module access, Shopify Sync, API Access, Unlimited Users, Permanent DPP Hosting.

**Volume Overages:** €10 per 100 additional SKUs beyond plan limits.

---

## Workspace Details

### Design Workspace (PLM)

For product designers, R&D teams, and technical managers. Focused on product structure, composition, and specifications.

**Modules Used:** Registry, Materials, DAM-Tech, Attestation, Import

| Feature | Description |
|---------|-------------|
| **Bill of Materials** | Hierarchical product structure (components, sub-assemblies, raw materials) |
| **Material Library** | Centralized material definitions with sustainability properties |
| **Revision Control** | Version history with approval workflows and change management |
| **Component Sourcing** | Link materials to approved suppliers, track alternatives |
| **Technical Documents** | CAD files, tech packs, MSDS sheets (via DAM-Tech) |
| **Attestation Requests** | Request material certifications, test results from suppliers |

**UI Aesthetic:** Technical, data-dense, document-centric

**Key Distinction:** Design uses **Registry** (product structure) NOT PIM. Marketing enriches the technical product with commercial content later.

---

### Operations Workspace (ERP-lite)

For supply chain managers, procurement, and warehouse teams. Focused on inventory and supplier management.

**Modules Used:** Registry, EPCIS, Attestation, Import

| Feature | Description |
|---------|-------------|
| **Inventory Tracking** | Stock levels, locations, reorder points |
| **Batch/Lot Management** | Traceability for recalls and quality control |
| **Simple Purchase Orders** | Basic PO creation and tracking |
| **Supplier Management** | Supplier profiles, certifications, performance |
| **EPCIS Events** | Supply chain event visualization and carbon tracking |
| **Attestation Requests** | Request supplier audits, factory certifications |

**UI Aesthetic:** Operational dashboards, status indicators, alerts

**Note:** This is ERP-*lite* - inventory and procurement basics. Not full accounting, no GL, no payroll.

---

### Marketing Workspace (PIM)

For brand managers, e-commerce teams, and content creators. Focused on product content and syndication.

**Modules Used:** PIM, DAM-Media, Syndication, Import, Registry (read-only)

| Feature | Description |
|---------|-------------|
| **Product Grid** | AG Grid spreadsheet-style product management |
| **Content Management** | Names, descriptions, marketing copy, SEO |
| **Digital Assets** | Product images, galleries, videos (via DAM-Media) |
| **Channel Syndication** | Shopify sync, marketplace publishing |
| **Completeness Scoring** | Per-channel readiness indicators |
| **Attestation Requests** | Request brand claim verifications |

**UI Aesthetic:** Visual, content-rich, media-focused

**Key Distinction:** Marketing uses **PIM** (commercial enrichment) to add descriptions and media to products defined in **Registry** by Design. Registry is read-only in this workspace.

---

### Compliance Workspace (DPP)

For compliance officers, quality assurance, and regulatory teams. The core DPP issuance workflow.

**Modules Used:** Compliance, Registry (read-only), EPCIS (read-only), Attestation, PIM (read-only)

| Feature | Description |
|---------|-------------|
| **DPP Ready List** | Products at 100% compliance completeness |
| **Review & Approve** | Manual review before DPP issuance |
| **Verifiable Credentials** | W3C VC generation with did:key signing |
| **QR Code Generation** | GS1 Digital Link compatible codes |
| **Lifecycle Tracking** | EPCIS event timelines on DPP pages |
| **Attestation Management** | Third-party certifications, lab results |
| **Audit Trail** | Complete history of compliance actions |

**UI Aesthetic:** Clean, checklist-driven, audit-focused

**Key Role:** Compliance aggregates data from all other workspaces (Registry structure, PIM content, EPCIS events, Attestations) to generate the final DPP. Read-only access to upstream data.

---

## Key Features

### AI-Powered Import

Users can import product data from any format. The AI extracts, maps, and validates data automatically:

- **Supported formats**: CSV, Excel, PDF, JSON, Images (OCR)
- **Intelligent mapping**: AI suggests field mappings to your product schema
- **Data enrichment**: Auto-fill missing fields based on product type
- **Validation**: Schema validation and compliance pre-checks

### Product Registry (Design Workspace - Technical DNA)

The foundation of every product - structure, BOMs, and materials:

- **Bill of Materials**: Hierarchical product structure (components → sub-assemblies → raw materials)
- **Material Library**: Centralized material definitions with sustainability properties (recyclability, carbon factors)
- **Product Families**: Define attribute schemas per product type
- **Industry Templates**: Start from pre-built templates (ESPR Textiles, Electronics, etc.)
- **Revision Control**: Version history with change management and approval workflows
- **Variants**: Parent-child product relationships with attribute inheritance
- **Audit Log**: Track who changed what, when - essential for compliance

### Product Information Management (Marketing Workspace - Commercial Enrichment)

Marketing content that enriches the technical product for sales channels:

- **Marketing Content**: Names, descriptions, SEO keywords, translations
- **Media Assets**: Product images, videos, galleries (via DAM-Media)
- **Channel Completeness**: Per-channel readiness scores (Shopify: 100%, Amazon: 85%)
- **Multi-Currency**: Support for EUR, USD, GBP pricing
- **Bulk Operations**: Edit, delete, or assign content to multiple products
- **Export**: Download product data as CSV, Excel, or JSON

### Digital Product Passports (Compliance Workspace)

- **DPP Ready Products**: Products appear in approval queue when completeness reaches 100%
- **Manual Review & Issue**: Review product data before issuing DPP
- **Verifiable Credentials**: W3C VCs signed with did:key for tamper evidence
- **Portable**: Organizations own their credentials, can export anytime
- **QR Codes**: GS1 Digital Link compatible

### Supply Chain Lifecycle Tracking (Operations & Compliance Workspaces)

Track the complete journey of every product with GS1 EPCIS 2.0 integration. EuroComply operates a **Hybrid EPCIS Model**:

- **Manufacturing Events**: When and where products are created
- **Shipping & Receiving**: Full logistics chain with locations
- **Transport Carbon**: Automatic CO2 calculation per shipment
- **Repairs & Refurbishment**: Service history for circular economy
- **End-of-Life**: Recycling and disposal tracking

**Our Role: Hybrid EPCIS Provider**

| Customer Type | Their Situation | Our Solution |
|---------------|-----------------|--------------|
| Enterprise (Nestlé, H&M) | Have SAP/IBM EPCIS | Read from their systems |
| Mid-market manufacturer | No EPCIS, have ERP | Host OpenEPCIS for them |
| SMB supplier | No EPCIS, no ERP | Manual portal → our OpenEPCIS |

**Compatible with**: SAP EPCIS, IBM Sterling, TraceLink, GS1 Cloud + our hosted OpenEPCIS

**Where does the data come from?**

| Source | How It Works |
|--------|--------------|
| **Customer EPCIS** | Query events from customer's EPCIS repository |
| **Supplier EPCIS** | Query events from supplier's repository (if access granted) |
| **Logistics EPCIS** | Query tracking from DHL, FedEx repositories |
| **EuroComply OpenEPCIS** | Hosted EPCIS for SMB customers/suppliers |
| **Manual Entry Portal** | Simple UI for suppliers without systems → our OpenEPCIS |

```
┌─────────────────────────────────────────────────────────────────┐
│  PRODUCT LIFECYCLE TIMELINE                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ● Jan 10 - MANUFACTURED (Berlin Factory)                       │
│  │ Carbon: 2.5 kg CO2e | Energy: 3.2 kWh (85% renewable)        │
│  │                                                               │
│  ● Jan 10 - SHIPPED (Berlin → Munich, 450km by road)            │
│  │ Carbon: 4.2 kg CO2e | Temperature: 4-8°C ✓                   │
│  │                                                               │
│  ● Jan 11 - RECEIVED (Munich Distribution Center)               │
│  │                                                               │
│  ● Jan 12 - SOLD (EcoFashion Store)                             │
│                                                                  │
│  Total Carbon Footprint: 8.5 kg CO2e                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

See [EPCIS_INTEGRATION.md](docs/EPCIS_INTEGRATION.md) for full documentation.

### Multi-Party Attestation (All Workspaces)

Request and receive product data from third parties (manufacturers, certifiers, labs, suppliers) with cryptographic proof of origin. **Available in all four workspaces** for different datapoints:

| Workspace | Attestation Use Cases |
|-----------|----------------------|
| **Design** | Material certifications, component specs, lab test results |
| **Operations** | Supplier audits, factory certifications, transport emissions |
| **Marketing** | Brand claim verifications, sustainability certifications |
| **Compliance** | Regulatory certifications, third-party compliance audits |

**Core Capabilities:**

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
│  CUSTOMER (any workspace)   CONTRIBUTOR                         │
│  ─────────────────────      ───────────                        │
│  1. Request data ──────────► 2. Receive email invitation        │
│                              3. Sign up (get did:key)           │
│  6. Review & approve ◄────── 4. Enter data                      │
│  7. Data linked to Hub       5. Sign with DID                   │
│     (visible across workspaces)                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### E-commerce Syndication (Marketing Workspace)

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

### EPCIS Integration (Hybrid Model)

| Component | Technology | Purpose |
|-----------|------------|---------|
| Hosted OpenEPCIS | PostgreSQL | Multi-tenant EPCIS for SMB customers |
| Query Client | TypeScript/HTTP | Query any EPCIS 2.0 repository |
| Story Builder | TypeScript | Transform JSON → human-readable timelines |
| Manual Entry Portal | Next.js | Simple UI for suppliers without systems |
| Location Master | PostgreSQL | GLN → location name resolution |

**Hybrid approach:** We read from enterprise EPCIS (SAP, IBM) AND host OpenEPCIS for SMB customers who don't have their own. Compatible with any GS1-compliant implementation.

### Frontend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | Next.js 14 | React with App Router |
| Styling | Tailwind CSS | Utility-first CSS |
| Data Grid | AG Grid | Spreadsheet-like product management |
| State | React Query | Server state management |

### Infrastructure (Hybrid Architecture)

EuroComply uses a **dual-path architecture** for cost-effective billion-scale DPP serving:

| Path | Component | Technology | Purpose |
|------|-----------|------------|---------|
| **Write** | Compute | AWS ECS Fargate | Containerized API |
| **Write** | Database | AWS RDS | Managed PostgreSQL |
| **Write** | Cache | AWS ElastiCache | Managed Redis |
| **Write** | Storage | AWS S3 | Asset storage |
| **Read** | CDN | Cloudflare | Global edge, unlimited bandwidth |
| **Read** | Origins | Hetzner (EU) | Static DPP files |
| **Both** | Frontend | Vercel | Next.js hosting |

**Why hybrid?** ESPR requires free DPP access. AWS bandwidth costs would be ~$38k/month at 1B scans/day. Cloudflare + Hetzner is fixed at ~$200/month. See [SCALABILITY.md](docs/SCALABILITY.md) for details.

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
| [SCALABILITY.md](./docs/SCALABILITY.md) | Billion-scale DPP serving architecture |
| [EPCIS_INTEGRATION.md](./docs/EPCIS_INTEGRATION.md) | Supply chain lifecycle tracking |
| [EU_INTEGRATION.md](./docs/EU_INTEGRATION.md) | EBSI and EU DPP Registry integration |
| [USER_MANAGEMENT.md](./docs/USER_MANAGEMENT.md) | User roles, permissions, and version control |
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
