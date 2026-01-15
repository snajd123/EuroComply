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

Each workspace manages its own data in **The Hub** - the central database. Product identity (SKU, GTIN) links workspace-specific data together.

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
       │                   (Central Database)                             │
       │                                                                  │
       │   Product Identity • Workspace Data • Materials • Suppliers     │
       └─────────────────────────────────────────────────────────────────┘
```

**Workspace access is role-based.** All customers receive all workspaces - differentiation is based on catalog capacity, not features. Users see the workspaces relevant to their role (e.g., a Distributor may not need the Design workspace).

### Core Concept: Workspace Data Ownership

At the center of EuroComply is **The Hub** - the central database. Each product has an **identity record** (SKU, GTIN) that links to **workspace-specific data**.

#### The Central Database

"The Hub" is simply the PostgreSQL database. All workspace data is stored in separate tables within this single database:

```
PostgreSQL Database
├── Product          (identity: SKU, GTIN, family)
├── DesignVersion    (Design workspace - versioned)
├── MarketingVersion (Marketing workspace - versioned)
├── BatchRecord      (Operations workspace - immutable)
├── DPPSnapshot      (Compliance workspace - immutable)
└── ... other tables
```

All workspaces read/write via Prisma ORM. See [USER_MANAGEMENT.md](./docs/USER_MANAGEMENT.md) for the complete schema.

#### Product = Identity + Links

A Product in EuroComply is NOT a monolithic record. It contains only identity information and links to workspace data:

| Product Identity | Workspace Data (separate tables) |
|-----------------|----------------------------------|
| SKU | Design: DesignVersion (versioned) |
| GTIN/EAN | Marketing: MarketingVersion (versioned) |
| Product Family | Operations: BatchRecord, MaterialOrder (immutable) |
| Created/Updated timestamps | Compliance: DPPSnapshot (immutable) |

#### Workspace Data Ownership

Each workspace owns and versions its own data independently:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           THE HUB (Central Database)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRODUCT (Identity Only)                                                     │
│  └── SKU, GTIN/EAN, productFamilyId                                         │
│                                                                              │
│  DESIGN DATA (Versioned)      OPERATIONS DATA (Immutable Records)           │
│  ├── DesignVersion v1         ├── BatchRecord (locks Design version)        │
│  ├── DesignVersion v2         ├── MaterialOrder                             │
│  └── DesignVersion v3         └── EPCIS Events                              │
│                                                                              │
│  MARKETING DATA (Versioned)   COMPLIANCE DATA (Immutable Snapshots)         │
│  ├── MarketingVersion v1      ├── DPPSnapshot (captures Design + Marketing) │
│  ├── MarketingVersion v2      └── Attestations (third-party verified)       │
│  └── MarketingVersion v3                                                    │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                          WORKSPACE ACCESS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Design      │  │ Operations  │  │ Marketing   │  │ Compliance          │ │
│  │ WRITE+VER   │  │ WRITE       │  │ WRITE+VER   │  │ READ + ISSUE        │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### How It Works

1. **Design creates versioned product definitions** - BOMs, materials, specs tracked with full version history
2. **Marketing creates versioned content** - Names, descriptions, images with independent versioning (can view Design data while editing)
3. **Operations creates immutable records** - Batch records reference a specific Design version at production time
4. **Compliance issues immutable snapshots** - DPP captures specific Design + Marketing versions at issuance

**Version Reference Semantics (Clarification):**

When Operations creates a BatchRecord or Compliance issues a DPP, they **reference** a specific DesignVersion (e.g., v2). This is a **read-only reference**, not a "lock" in the database sense:

| Action | What Happens | Design Workspace Impact |
|--------|--------------|------------------------|
| BatchRecord created referencing v2 | Stores `designVersionId: v2` | **None** - Design retains full control |
| Design releases v3 | v3 becomes current | BatchRecord still references v2 (valid) |
| Design archives v2 | v2 status → ARCHIVED | BatchRecord reference remains valid |
| Design deletes v2 | **Blocked** by foreign key | Cannot delete referenced versions |

**Key Rules:**
- Operations and Compliance have **no write access** to Design data - only Design can modify DesignVersions
- **Reference protection**: Versions with active references (BatchRecords, DPPSnapshots) cannot be deleted (foreign key constraint), but CAN be archived
- **No implicit locking**: Operations cannot prevent Design from releasing new versions or archiving old ones
- **Deletion safety**: To delete a DesignVersion, all BatchRecords and DPPSnapshots referencing it must first be deleted (rare, typically only in development/testing)

This ensures clear ownership while maintaining referential integrity.

**Compliance Write Behavior:** While Compliance has read-only access to Design, Marketing, and Operations data, the "ISSUE" operation writes to Compliance-owned tables: `Passport` (the issued VC) and `DPPSnapshot` (the immutable data capture). This maintains separation of concerns - Compliance cannot modify source data, only create signed snapshots of it.

#### Compliance Workspace Data Flow

The "READ + ISSUE" access pattern means Compliance has a **split data flow**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 COMPLIANCE WORKSPACE DATA FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  READS FROM (cannot modify):              WRITES TO (owns):                 │
│  ─────────────────────────────            ─────────────────                 │
│  ┌─────────────────────────┐              ┌─────────────────────────┐       │
│  │ DesignVersion           │──────┐       │ Passport                │       │
│  │ (BOM, materials, specs) │      │       │ (issued VC, QR code)    │       │
│  └─────────────────────────┘      │       └─────────────────────────┘       │
│  ┌─────────────────────────┐      │              ▲                          │
│  │ MarketingVersion        │──────┼──► ISSUE ────┤                          │
│  │ (descriptions, media)   │      │   OPERATION  │                          │
│  └─────────────────────────┘      │              ▼                          │
│  ┌─────────────────────────┐      │       ┌─────────────────────────┐       │
│  │ BatchRecord             │──────┘       │ DPPSnapshot             │       │
│  │ (production records)    │              │ (immutable data capture)│       │
│  └─────────────────────────┘              └─────────────────────────┘       │
│  ┌─────────────────────────┐                                                │
│  │ Attestation             │──────────────────────────────────────────►     │
│  │ (third-party claims)    │  (Attestations are linked by reference,        │
│  └─────────────────────────┘   not copied into DPPSnapshot)                 │
│                                                                              │
│  KEY PRINCIPLE: Compliance cannot modify upstream data.                     │
│  It creates signed snapshots that reference specific versions.              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Versioned Data vs. DPP Snapshot

| Workspace Data | DPP Snapshot |
|----------------|--------------|
| Live, versioned history | Immutable at issuance |
| Multiple versions per product | Captures specific version numbers |
| Editable (new versions) | Never changes once issued |
| Internal use | Public-facing proof |

When workspace data changes after DPP issuance, the existing DPP remains valid (it captured the version numbers at issuance). Organizations can issue a new DPP version that captures newer versions.

#### DPP Version Migration

When product data changes materially (new composition, updated certifications), issue a new DPP version:

```
Product "Organic T-Shirt" (GTIN: 5901234567890)
├── DPP v1 (Jan 2026) → Design v1, Marketing v1 → QR: dpp.eurocomply.eu/pass_abc/v1
├── DPP v2 (Mar 2026) → Design v2, Marketing v1 → QR: dpp.eurocomply.eu/pass_abc/v2
└── DPP v3 (Jun 2026) → Design v2, Marketing v2 → QR: dpp.eurocomply.eu/pass_abc/v3
```

**Migration rules:**
- **Material change** (composition, origin): Issue new DPP version, update QR codes on new products
- **Minor update** (typo fix, image update): Can issue new version, but not required
- **Existing products**: Old QR codes continue working (point to original DPP version)
- **Verifier notification**: Each DPP version is a separate VC; verifiers see version in credential

**QR code strategy:**
| Strategy | When to Use | QR Points To |
|----------|-------------|--------------|
| **Fixed version** | Product already printed | Specific DPP version (v1) |
| **Latest version** | E-commerce, dynamic labels | Latest DPP version |
| **Serial-specific** | Batch traceability | DPP for specific serial number |

See [USER_MANAGEMENT.md](docs/USER_MANAGEMENT.md) for complete documentation on version control and workspace data ownership.

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
│   (write)     │   (read)      │ • DAM-Media   │ • Registry (read)          │
│ • Materials   │ • EPCIS       │ • Syndication │ • EPCIS (read)             │
│ • DAM-Tech    │   (write)     │ • Import      │ • Attestation              │
│ • Attestation │ • Attestation │ • Registry    │ • PIM (read)               │
│ • Import      │ • Import      │   (read)      │                            │
└───────────────┴───────────────┴───────────────┴────────────────────────────┘
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

**Note:** Operations creates BatchRecords that reference (lock) a specific DesignVersion, but does not modify the Registry product structure itself. Only Design has write access to product definitions in the Registry.

**Note:** Multi-Party Attestation is available in ALL workspaces - different personas request attestations for different datapoints (Design: material certs, Operations: supplier audits, Marketing: brand claims, Compliance: regulatory certifications).

### Base Fee + Per-DPP Pricing

All customers receive full platform access with unlimited products/SKUs and users. Pricing is based on a monthly base fee plus per-DPP charges.

| Plan | Base Fee | Storage | DPP Price | Volume Discounts | Support |
|------|----------|---------|-----------|------------------|---------|
| **Starter** | €149/mo | 500 GB | €0.10/DPP | 10K+: €0.08 | Email |
| **Growth** | €299/mo | 1 TB | €0.05/DPP | 50K+: €0.03, 100K+: €0.02 | Email |
| **Scale** | €749/mo | 2 TB | €0.02/DPP | 500K+: €0.01, 1M+: €0.008 | Priority |
| **Enterprise** | €1,999/mo | 5 TB | €0.008/DPP | 5M+: €0.005, 10M+: €0.003 | Dedicated |
| **Platform** | Custom | Custom | €0.001-0.003 | Negotiated | SLA |

*Storage is for media files (images, PDFs, videos). Product data and DPP metadata are unlimited.*

**Base fee includes:** All four workspaces, unlimited products/SKUs, unlimited users, generous storage, API access, Shopify Sync, EPCIS events, 10-year DPP hosting.

**Per-DPP fee includes:** VC issuance, QR code generation, R2 storage, 10-year serving via Cloudflare edge.

**Annual pricing:** 20% discount on base fees (per-DPP fees always monthly based on usage).

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

See [EuroComply_Architecture_Document_v1.3.md](./EuroComply_Architecture_Document_v1.3.md) for technical details on item tracking.

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

EuroComply uses a **dual-path architecture** for cost-effective high-volume DPP serving:

| Path | Component | Technology | Purpose |
|------|-----------|------------|---------|
| **Write** | Compute | AWS ECS Fargate | Containerized API + Workers |
| **Write** | Database | AWS RDS PostgreSQL | Products, passports, attestations |
| **Write** | Items DB | AWS DynamoDB | Item-level data (billions of records) |
| **Write** | Cache | AWS ElastiCache | Managed Redis |
| **Write** | Storage | AWS S3 | Asset storage |
| **Read** | CDN | Cloudflare | Global edge, unlimited bandwidth |
| **Read** | Storage | Cloudflare R2 | Static DPP files (zero egress) |
| **Read** | Edge | Cloudflare Workers | DPP serving + lazy generation |
| **Both** | Frontend | Vercel | Next.js hosting |

**Why hybrid?** ESPR requires free DPP access. AWS bandwidth costs would be ~$38k/month at 1B scans/day. Cloudflare R2 has **zero egress fees** - unlimited DPP scans at fixed cost.

**Infrastructure Cost (from Architecture Doc v1.3):**

| Stage | Customers | Monthly Cost | Notes |
|-------|-----------|--------------|-------|
| Launch | 0-10 | €158/month | Base infrastructure |
| Growth | 50-200 | €158-211/month | Scales with usage |
| Scale | 200-500 | €400-800/month | Additional cells |

**Base Cost Breakdown:**
| Component | Monthly Cost |
|-----------|--------------|
| Fargate API (2 tasks) | €17 |
| Fargate Workers (1-21 auto-scaling) | €8-148 |
| RDS PostgreSQL (Multi-AZ) | €53 |
| DynamoDB (on-demand) | €1-45 |
| ElastiCache Redis | €11 |
| Cloudflare Pro + Workers + R2 | €25-42 |
| Other (ALB, NAT, KMS, logs) | €35 |

See [EuroComply_Architecture_Document_v1.3.md](./EuroComply_Architecture_Document_v1.3.md) for detailed breakdown.

---

## Data Model

### Hybrid Database Architecture

EuroComply uses polyglot persistence for different data patterns:

| Database | Purpose | Scale |
|----------|---------|-------|
| **PostgreSQL** | Products, passports, attestations, user data | ~200 tenants/cell (schema-per-tenant) |
| **DynamoDB** | Item-level serialization (serial numbers) | Billions of records |
| **Cloudflare R2** | Static DPP files | Unlimited (zero egress) |

### Core Entities

```
Organization (tenant) - each gets dedicated PostgreSQL schema
├── Products (Identity Only)
│   ├── sku: String (unique within org)
│   ├── gtin: String (optional, globally unique)
│   └── productFamilyId: references ProductFamily
│
├── DesignVersions (versioned - owned by Design workspace)
│   ├── productId, versionNumber, status (DRAFT|RELEASED|ACTIVE|ARCHIVED)
│   ├── attributes: JSONB (BOMs, materials, specs)
│   ├── checkedOutBy, checkedOutAt (locking)
│   └── releasedAt, releasedBy
│
├── MarketingVersions (versioned - owned by Marketing workspace)
│   ├── productId, versionNumber, status (DRAFT|RELEASED|ACTIVE|ARCHIVED)
│   ├── content: JSONB (names, descriptions, SEO)
│   ├── checkedOutBy, checkedOutAt (locking)
│   └── releasedAt, releasedBy
│
├── BatchRecords (immutable - owned by Operations workspace)
│   ├── productId, batchNumber, quantity
│   ├── designVersionId (locks specific Design version)
│   └── producedAt, facility
│
├── Items (DynamoDB - item-level serialization)
│   ├── PK: ORG#{orgId}#PROD#{productId}
│   ├── SK: ITEM#{serialNumber}
│   ├── status, lifecycle events
│   └── dppUrl (Cloudflare R2 path)
│
├── DPPSnapshots (immutable - owned by Compliance workspace)
│   ├── productId, passportId
│   ├── designVersionId, marketingVersionId (captured versions)
│   ├── snapshotData: JSONB (full captured data)
│   └── issuedAt, issuedBy
│
├── ProductFamilies (attribute schemas)
│   ├── attributeSchema: JSONB (field definitions per workspace)
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

### Workspace Data Architecture

Each workspace owns its data with different versioning strategies:

| Workspace | Data Tables | Versioning |
|-----------|-------------|------------|
| **Design** | DesignVersion | Full versioning (v1, v2, v3...) with checkout locking |
| **Marketing** | MarketingVersion | Full versioning (independent from Design) |
| **Operations** | BatchRecord, MaterialOrder | Immutable records (locks Design version at production) |
| **Compliance** | DPPSnapshot | Immutable snapshots (captures Design + Marketing versions) |

### Hybrid Schema Design

The database uses a hybrid relational/JSONB approach:

- **Relational columns**: Identity fields (SKU, GTIN), foreign keys, version metadata
- **JSONB columns**: Workspace-specific attributes validated by ProductFamily schema

This provides SQL query performance for lookups with NoSQL flexibility for workspace-specific data.

### Product Family Schema Evolution

Product Families define the attribute schema for products. When business needs change, schemas evolve:

#### Adding New Fields

New fields are additive and backward-compatible:

```
ProductFamily "Textile" v1 → v2 (add recycledContent field)
├── Existing products: New field is NULL (optional by default)
├── New products: Can populate new field immediately
└── Completeness: New field included if marked as required for channel
```

#### Modifying Existing Fields

Field modifications require migration strategies:

| Change Type | Migration Strategy | Impact |
|-------------|-------------------|--------|
| **Rename field** | Copy data to new field, deprecate old | Zero data loss |
| **Change type** | Transform during migration (e.g., string→enum) | Requires data validation |
| **Make required** | Set default for existing, require for new | Gradual enforcement |
| **Remove field** | Mark deprecated, remove after grace period | Notify affected products |

#### Workspace-Specific Schema Changes

Each workspace manages its own schema portion:

```
ProductFamily "Textile"
├── Design Schema
│   ├── fiberComposition (required)
│   └── countryOfOrigin (required)
├── Marketing Schema
│   ├── shortDescription (required for Shopify)
│   └── careInstructions (optional)
└── Operations Schema
    └── warehouseLocation (optional)
```

Schema changes in one workspace don't affect other workspaces.

#### Migration Workflow

1. **Draft schema change**: Edit ProductFamily attributeSchema (draft mode)
2. **Impact analysis**: System shows affected products and completeness impact
3. **Apply migration**: Execute field transformations
4. **Notify users**: Alert product owners of new requirements
5. **Grace period**: Products with missing required fields flagged but not blocked

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
| [EuroComply_Architecture_Document_v1.3.md](./EuroComply_Architecture_Document_v1.3.md) | **Master architecture document** |
| [USER_MANAGEMENT.md](./docs/USER_MANAGEMENT.md) | User roles, permissions, and workspace data ownership |
| [BUSINESS_MODEL.md](./docs/BUSINESS_MODEL.md) | Pricing and business model |
| [SECURITY.md](./docs/SECURITY.md) | 7-layer security architecture |
| [DATA_SOVEREIGNTY.md](./docs/DATA_SOVEREIGNTY.md) | Data ownership and export |
| [ARCHITECTURE_PORTABILITY.md](./docs/ARCHITECTURE_PORTABILITY.md) | Data portability architecture |
| [VERIFIABLE_CREDENTIALS.md](./docs/VERIFIABLE_CREDENTIALS.md) | VC/DID technical details |
| [MULTI_PARTY_ATTESTATION.md](./docs/MULTI_PARTY_ATTESTATION.md) | Third-party data contribution architecture |
| [PASSPORT_TRUST_MODEL.md](./docs/PASSPORT_TRUST_MODEL.md) | Trust architecture and verification |
| [SELF_SERVICE_ONBOARDING.md](./docs/SELF_SERVICE_ONBOARDING.md) | Onboarding flow and tenant provisioning |
| [EU_INTEGRATION.md](./docs/EU_INTEGRATION.md) | EBSI and EU DPP Registry integration |
| [ECOMMERCE_INTEGRATIONS.md](./docs/ECOMMERCE_INTEGRATIONS.md) | Shopify integration guide |

---

## License

Proprietary - All rights reserved

---

## Support

- Documentation: https://docs.eurocomply.eu
- API Status: https://status.eurocomply.eu
- Contact: support@eurocomply.eu
