# EuroComply Business Model

## Value Proposition

EuroComply is a unified platform for product lifecycle management and EU regulatory compliance. **One platform, four workspaces** - organizations get purpose-built interfaces for Design (PLM-lite), Operations (ERP-lite), Marketing (PIM-lite), and Compliance (DPP-core), all backed by shared data.

### Why Four Workspaces?

| Workspace | Primary Modules | Replaces | Typical Cost |
|-----------|-----------------|----------|--------------|
| **Design** (PLM) | Registry, Materials, DAM-Tech | Entry-level PLM | €500-2,000/mo |
| **Operations** (ERP-lite) | Registry, EPCIS, Inventory | Basic inventory/order tools | €200-1,000/mo |
| **Marketing** (PIM) | PIM, DAM-Media, Syndication | Entry-level PIM | €300-1,500/mo |
| **Compliance** (DPP) | Compliance, Attestation | Compliance consultants | €5,000-20,000 one-time |

**Key Architecture Insight:**
- **Registry** = Technical DNA (product structure, BOMs, versions) - primary for Design
- **PIM** = Commercial Enrichment (descriptions, SEO, marketing) - primary for Marketing
- Registry is shared across workspaces; Marketing has read-only access to it

**EuroComply gives all four for €129-399/month.** This is our competitive advantage against enterprise solutions and point products.

---

## Target Market

### Primary Customers

| Segment | Description | Size |
|---------|-------------|------|
| **Brands** | Consumer brands managing product catalogs | 50-5,000 SKUs |
| **Manufacturers** | Producers with primary product data | 100-10,000 SKUs |
| **Distributors** | Wholesalers aggregating products | 500-50,000 SKUs |

### Customer Segments

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER SEGMENTS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GROWTH SEGMENT (€129/month)                                    │
│  ───────────────────────────                                    │
│  Small brands and manufacturers with catalogs up to 500         │
│  products. Typically first-time PIM users or organizations      │
│  migrating from spreadsheets.                                   │
│                                                                  │
│  • Annual revenue: €1M-€20M                                     │
│  • Products: 50-500 SKUs                                        │
│  • Items: Up to 10,000 serialized items                         │
│  • Team size: 1-5 users managing product data                   │
│                                                                  │
│  SCALE SEGMENT (€399/month)                                     │
│  ──────────────────────────                                     │
│  Mid-market manufacturers and larger brands with extensive      │
│  catalogs and item-level serialization needs.                   │
│                                                                  │
│  • Annual revenue: €20M-€200M                                   │
│  • Products: 500-5,000 SKUs                                     │
│  • Items: Up to 1,000,000 serialized items                      │
│  • Team size: 5-20 users across departments                     │
│                                                                  │
│  ENTERPRISE SEGMENT (€999/month)                                │
│  ───────────────────────────────                                │
│  Large organizations requiring dedicated infrastructure,        │
│  custom integrations, and SLA guarantees.                       │
│                                                                  │
│  • Annual revenue: €200M+                                       │
│  • Products: Unlimited                                          │
│  • Items: Up to 100,000,000 serialized items                    │
│  • Requirements: SSO, SLA, dedicated account management         │
│                                                                  │
│  MEGA SEGMENT (€4,999/month)                                    │
│  ────────────────────────────                                   │
│  Fortune 500 and high-volume manufacturers requiring            │
│  dedicated clusters and unlimited capacity.                     │
│                                                                  │
│  • Annual revenue: €500M+                                       │
│  • Products: Unlimited                                          │
│  • Items: Unlimited                                             │
│  • Requirements: Dedicated cluster, custom SLA                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Customer Profile

```
┌─────────────────────────────────────────────────────────────────┐
│                    TYPICAL CUSTOMER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Company: Brand, manufacturer, or distributor                   │
│  Employees: 10-500                                              │
│  IT Staff: 0-5 (not dedicated to compliance)                   │
│  Products: 100-5,000 SKUs                                       │
│  Tech literacy: Can use web apps, not developers               │
│  Budget: €100-500/month for compliance tools                   │
│                                                                  │
│  Their needs:                                                   │
│  • "I need to manage product data across channels"             │
│  • "I need DPPs to sell in EU"                                 │
│  • "I don't have 6 months for implementation"                  │
│  • "I can't afford €50k for enterprise PIM"                    │
│                                                                  │
│  Our promise:                                                   │
│  • Import any data format with AI                              │
│  • Single source of truth for all product data                 │
│  • DPP Ready list for review and approval when data complete   │
│  • Sync to Shopify with one click                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Not Our Target (Paid Plans)

- **Large Enterprises**: Use SAP, Akeneo, or custom solutions
- **Non-EU Businesses**: No ESPR compliance requirement

Retailers who only resell products from other brands are served through the free Retailer Access tier (see below).

---

## Pricing Model

### Volume-Based Pricing with Item-Level Support

EuroComply uses a volume-based pricing model where all customers receive full platform access. Tier differentiation is based on catalog capacity and item-level serialization needs.

**Key Pricing Innovation:** We differentiate between **product-level DPPs** (one per GTIN, included in base price) and **item-level DPPs** (one per physical unit, usage-based pricing). This allows SMEs to get full compliance at low cost while enabling enterprise customers to scale to billions of items.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EUROCOMPLY PRICING TIERS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  GROWTH              SCALE               ENTERPRISE          MEGA            │
│  €129/mo             €399/mo             €999/mo             €4,999/mo       │
│  ──────              ─────               ──────────          ─────           │
│  500 products        5,000 products      Unlimited           Unlimited       │
│  10K items           1M items            100M items          Unlimited       │
│  10K batch size      100K batch size     1M batch size       10M batch size  │
│                                                                              │
│  Item overage:       Item overage:       Item overage:       Item overage:   │
│  Not available       €0.01/1K items      €0.005/1K items     Included        │
│                                                                              │
│  Full Platform       Full Platform       Full Platform       Full Platform   │
│  100 AI/month        1,000 AI/month      Custom AI           Custom AI       │
│  Unlimited users     Unlimited users     + SLA & SSO         + Dedicated     │
│                                                                              │
│  Infra cost: <€5     Infra cost: €10-15  Infra cost: ~€100   Infra cost:     │
│  Gross margin: 96%   Gross margin: 96%   Gross margin: 90%   €300-500        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Product-Level vs Item-Level DPPs

| DPP Type | Description | Use Case | Pricing |
|----------|-------------|----------|---------|
| **Product-level** | One DPP per GTIN (product model) | Fashion brands, furniture | Included in base price |
| **Item-level** | One DPP per physical unit (serial number) | Electronics, batteries, high-value goods | Usage-based (see tiers) |

**Why item-level costs more:** Each item requires DynamoDB storage, Cloudflare R2 static DPP files, and 10-year retention. See [EuroComply_Architecture_Document_v1.3.md](../EuroComply_Architecture_Document_v1.3.md) for technical architecture.

### Pricing Table

| Plan | Monthly | Annual | Products | Items Included | Max Batch | Item Overage | AI Imports | Support |
|------|---------|--------|----------|----------------|-----------|--------------|------------|---------|
| **Growth** | €129 | €1,290/yr | 500 | 10K | 10K | Not available | 100/mo | Email |
| **Scale** | €399 | €3,990/yr | 5,000 | 1M | 100K | €0.01/1K items | 1,000/mo | Priority |
| **Enterprise** | €999 | €9,990/yr | Unlimited | 100M | 1M | €0.005/1K items | Custom | Dedicated |
| **Mega** | €4,999 | €49,990/yr | Unlimited | Unlimited | 10M | Included | Custom | Dedicated + SLA |

### Item-Level Pricing Details

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ITEM-LEVEL COST BREAKDOWN                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHAT'S INCLUDED PER ITEM:                                                  │
│  • Unique serial number tracking (DynamoDB)                                 │
│  • 10-year data retention (ESPR compliant)                                  │
│  • Static DPP page (Cloudflare R2 + CDN)                                    │
│  • Item-level QR code                                                       │
│  • Unlimited scans (zero egress from R2)                                    │
│                                                                              │
│  OUR COST PER ITEM (from Architecture Doc v1.3):                            │
│  ─────────────────────────────────────────────                              │
│  • DynamoDB Write:  $0.00125/item                                          │
│  • DynamoDB Storage: $0.00025/item/month                                   │
│  • R2 Write (if pre-gen): $0.0045/item                                     │
│  • TOTAL FIRST YEAR: ~$0.006/item (~€0.0055/item)                          │
│                                                                              │
│  OVERAGE PRICING (per 1,000 items):                                         │
│  ─────────────────────────────────                                          │
│  Scale:      €0.01/1K items    (our cost: ~€0.0055 → 82% margin)           │
│  Enterprise: €0.005/1K items   (our cost: ~€0.0055 → 9% margin, volume)    │
│  Mega:       Included          (absorbed in €4,999/mo fee)                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Mega Tier: Dedicated Resources

Mega tier customers (€4,999/month) receive:
- Dedicated PostgreSQL cluster (complete isolation)
- Unlimited item generation (DynamoDB + R2)
- 10M items per batch (fan-out workers)
- Priority API rate limits (10,000 req/s)
- 4-hour support SLA
- Custom integration support
- Onboarding fee: €2,500 one-time (covers initial ingestion spike)

### What's Included in ALL Plans

Every paying customer gets the complete platform - **all four workspaces, all features**:

| Feature Category | Growth | Scale | Enterprise | Mega |
|------------------|:------:|:-----:|:----------:|:----:|
| **Products** | **500** | **5,000** | **Unlimited** | **Unlimited** |
| **Items** | **10K** | **1M** | **100M** | **Unlimited** |
| **Max Batch Size** | 10K | 100K | 1M | 10M |
| **Users** | Unlimited | Unlimited | Unlimited | Unlimited |
| | | | | |
| **DESIGN WORKSPACE (PLM)** | | | | |
| Product Registry (structure, BOMs, versions) | ✅ | ✅ | ✅ | ✅ |
| Materials Library (sustainability data) | ✅ | ✅ | ✅ | ✅ |
| DAM-Tech (specs, CAD files, test reports) | ✅ | ✅ | ✅ | ✅ |
| Version Control & Approval Workflow | ✅ | ✅ | ✅ | ✅ |
| | | | | |
| **OPERATIONS WORKSPACE (ERP-lite)** | | | | |
| Item Tracking (DynamoDB) | ✅ | ✅ | ✅ | ✅ |
| Lifecycle Event Visualization | ✅ | ✅ | ✅ | ✅ |
| Supplier Attestation Requests | ✅ | ✅ | ✅ | ✅ |
| Inventory & Orders (Planned) | ✅ | ✅ | ✅ | ✅ |
| | | | | |
| **MARKETING WORKSPACE (PIM)** | | | | |
| Product Families (attribute schemas) | ✅ | ✅ | ✅ | ✅ |
| Variants (parent-child inheritance) | ✅ | ✅ | ✅ | ✅ |
| Completeness Scoring (per-channel) | ✅ | ✅ | ✅ | ✅ |
| DAM-Media (images, videos, CDN) | ✅ | ✅ | ✅ | ✅ |
| Syndication (Shopify sync) | ✅ | ✅ | ✅ | ✅ |
| Bulk Operations & Export | ✅ | ✅ | ✅ | ✅ |
| | | | | |
| **COMPLIANCE WORKSPACE (DPP)** | | | | |
| DPP Generation & Issuance | ✅ | ✅ | ✅ | ✅ |
| W3C Verifiable Credentials | ✅ | ✅ | ✅ | ✅ |
| did:key Portable Identity | ✅ | ✅ | ✅ | ✅ |
| QR Codes (GS1 Digital Link) | ✅ | ✅ | ✅ | ✅ |
| Multi-Party Attestation | ✅ | ✅ | ✅ | ✅ |
| Public Verification | ✅ | ✅ | ✅ | ✅ |
| Permanent DPP Hosting (10+ years) | ✅ | ✅ | ✅ | ✅ |

**Workspace Access:** All customers receive all workspaces. Access within an organization is **role-based** - users see workspaces relevant to their role (e.g., a designer sees Design, a brand manager sees Marketing, a compliance officer sees Compliance). Workspace access is not tier-restricted.

| | | | | |
| **Automation & AI** | | | | |
| AI Import (Claude) | 100/mo | 1,000/mo | Custom | Custom |
| CSV/Excel Import | ✅ | ✅ | ✅ | ✅ |
| Shopify Sync | ✅ | ✅ | ✅ | ✅ |
| API Access | Rate Limited | High | Custom | Priority |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| | | | | |
| **Support** | Email | Priority | Dedicated | Dedicated |
| **SLA** | - | - | 99.9% | Custom |
| **SSO** | - | - | ✅ | ✅ |
| **Dedicated Infra** | - | - | Instance | Cluster |

### Pricing Rationale

The volume-based pricing model offers several strategic advantages:

| Benefit | Description |
|---------|-------------|
| **Reduced Sales Friction** | Single question ("How many products?") simplifies purchasing decisions |
| **Higher Platform Adoption** | Full feature access from day one increases integration depth |
| **Network Effects** | Universal attestation access encourages supplier chain participation |
| **Lower Churn** | Deep integration with Shopify, API, and attestation increases switching costs |

### Volume Overages

Product and item overages are tier-dependent:

| Plan | Included Products | Product Overage | Included Items | Item Overage |
|------|-------------------|-----------------|----------------|--------------|
| Growth | 500 | Upgrade to Scale | 10K | Not available |
| Scale | 5,000 | €10 per 100 SKUs | 1M | €0.01/1K items |
| Enterprise | Unlimited | N/A | 100M | €0.005/1K items |
| Mega | Unlimited | N/A | Unlimited | Included |

**Example Calculation (Scale tier):**
- Scale plan base: €399/month (includes 5,000 products, 1M items)
- Customer has 5,400 products and 1.2M items
- Product overage: 400 products = 4 units × €10 = €40/month
- Item overage: 200K items × €0.01/1K = €2/month
- **Total monthly cost: €441**

Growth customers who exceed 500 products should upgrade to Scale (better value).

---

## Revenue Projections

### Market Opportunity

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EU DPP MARKET SIZE                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  COMPANIES AFFECTED BY ESPR:                                                │
│  • Textiles: ~180,000 EU companies                                          │
│  • Electronics: ~85,000 EU companies                                        │
│  • Batteries: ~15,000 EU companies                                          │
│  • Furniture: ~130,000 EU companies                                         │
│  • Construction products: ~300,000 EU companies                             │
│  • Other categories: ~200,000 EU companies                                  │
│  ────────────────────────────────────────                                   │
│  TOTAL: ~900,000 EU companies need DPP compliance                          │
│                                                                              │
│  PLUS: Non-EU companies selling into EU                                     │
│  • US, UK, China, etc. exporters to EU: ~500,000 companies                 │
│  ────────────────────────────────────────                                   │
│  TOTAL ADDRESSABLE MARKET: ~1.4 million companies                          │
│                                                                              │
│  SERVICEABLE MARKET (SME focus, English-speaking initially):               │
│  • ~200,000 companies                                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5-Year Customer Projections

| Year | Growth | Scale | Enterprise | Mega | Total Customers |
|------|--------|-------|------------|------|-----------------|
| 2025 | 200 | 50 | 5 | 0 | 255 |
| 2026 | 800 | 200 | 20 | 1 | 1,021 |
| 2027 | 2,500 | 600 | 60 | 3 | 3,163 |
| 2028 | 5,000 | 1,200 | 120 | 8 | 6,328 |
| 2029 | 8,000 | 2,000 | 200 | 15 | 10,215 |

### Average Revenue Per User (ARPU)

| Tier | Base Price | Avg. Item Overage | Monthly ARPU |
|------|------------|-------------------|--------------|
| Growth | €129 | €0 (no item-level) | €129 |
| Scale | €399 | €200 (200K items overage) | €599 |
| Enterprise | €999 | €10,000 (20M items overage) | €10,999 |
| Mega | €4,999 | €80,000 (400M items overage) | €84,999 |

### 5-Year Revenue Projection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  5-YEAR REVENUE PROJECTION                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  YEAR 1 (2025): Early Adopters                                              │
│  ─────────────────────────────────                                          │
│  Growth:     200 × €129 × 12    = €309,600                                 │
│  Scale:      50 × €599 × 12     = €359,400                                 │
│  Enterprise: 5 × €10,999 × 12   = €659,940                                 │
│  Mega:       0 × €84,999 × 12   = €0                                       │
│  ──────────────────────────────────────────                                │
│  TOTAL YEAR 1: €1.3M ARR                                                   │
│                                                                              │
│  YEAR 2 (2026): Growing Awareness                                           │
│  ─────────────────────────────────                                          │
│  Growth:     800 × €129 × 12    = €1,238,400                               │
│  Scale:      200 × €599 × 12    = €1,437,600                               │
│  Enterprise: 20 × €10,999 × 12  = €2,639,760                               │
│  Mega:       1 × €84,999 × 12   = €1,019,988                               │
│  ──────────────────────────────────────────                                │
│  TOTAL YEAR 2: €6.3M ARR                                                   │
│                                                                              │
│  YEAR 3 (2027): ESPR Enforcement Begins                                     │
│  ───────────────────────────────────────                                    │
│  Growth:     2,500 × €129 × 12  = €3,870,000                               │
│  Scale:      600 × €599 × 12    = €4,312,800                               │
│  Enterprise: 60 × €10,999 × 12  = €7,919,280                               │
│  Mega:       3 × €84,999 × 12   = €3,059,964                               │
│  ──────────────────────────────────────────                                │
│  TOTAL YEAR 3: €19.2M ARR                                                  │
│                                                                              │
│  YEAR 4 (2028): Mass Adoption                                               │
│  ─────────────────────────────                                              │
│  Growth:     5,000 × €129 × 12  = €7,740,000                               │
│  Scale:      1,200 × €599 × 12  = €8,625,600                               │
│  Enterprise: 120 × €10,999 × 12 = €15,838,560                              │
│  Mega:       8 × €84,999 × 12   = €8,159,904                               │
│  ──────────────────────────────────────────                                │
│  TOTAL YEAR 4: €40.4M ARR                                                  │
│                                                                              │
│  YEAR 5 (2029): Market Maturity                                             │
│  ───────────────────────────────                                            │
│  Growth:     8,000 × €129 × 12  = €12,384,000                              │
│  Scale:      2,000 × €599 × 12  = €14,376,000                              │
│  Enterprise: 200 × €10,999 × 12 = €26,397,600                              │
│  Mega:       15 × €84,999 × 12  = €15,299,820                              │
│  ──────────────────────────────────────────                                │
│  TOTAL YEAR 5: €68.5M ARR                                                  │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════   │
│  5-YEAR CUMULATIVE REVENUE: ~€136M                                         │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Revenue by Source (Year 5)

| Revenue Type | Amount | Percentage |
|--------------|--------|------------|
| Platform subscriptions (base fees) | €38.2M | 56% |
| Item-level overage | €30.3M | 44% |
| **Total** | **€68.5M** | **100%** |

**Key Insight:** Item-level pricing becomes 44% of revenue by Year 5, validating the importance of the template + item data architecture.

### Profitability Analysis (Year 5)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  YEAR 5 PROFITABILITY (€68.5M Revenue)                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  REVENUE:                       €68,500,000                                 │
│                                                                              │
│  COST OF GOODS SOLD (COGS):                                                │
│  ─────────────────────────────                                              │
│  Infrastructure:                                                            │
│  • AWS (write path):            €300,000                                   │
│  • Hetzner/R2 (read path):      €150,000                                   │
│  • Item storage (tiered):       €1,500,000                                 │
│  • Cloudflare:                  €50,000                                    │
│  Third-party services:                                                      │
│  • AI (Claude API):             €500,000                                   │
│  • Payment processing (3%):     €2,055,000                                 │
│  • Email/notifications:         €100,000                                   │
│  ─────────────────────────────────────────                                 │
│  TOTAL COGS:                    €4,655,000                                 │
│  GROSS PROFIT:                  €63,845,000 (93.2% margin)                 │
│                                                                              │
│  OPERATING EXPENSES:                                                        │
│  ─────────────────────                                                      │
│  Engineering (30 people):       €4,500,000                                 │
│  Sales & Marketing:             €10,000,000                                │
│  Customer Success (20 people):  €2,000,000                                 │
│  G&A (Legal, Finance, HR):      €2,000,000                                 │
│  Office & Equipment:            €500,000                                   │
│  ─────────────────────────────────────────                                 │
│  TOTAL OPEX:                    €19,000,000                                │
│                                                                              │
│  OPERATING INCOME (EBITDA):     €44,845,000 (65.5% margin)                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5-Year Financial Summary

| Year | Customers | ARR | Gross Margin | EBITDA |
|------|-----------|-----|--------------|--------|
| 2025 | 255 | €1.3M | 90% | -€2M (investing) |
| 2026 | 1,021 | €6.3M | 91% | €1M |
| 2027 | 3,163 | €19.2M | 92% | €8M |
| 2028 | 6,328 | €40.4M | 93% | €22M |
| 2029 | 10,215 | €68.5M | 93% | €45M |

**Year 5 Valuation (10x ARR): ~€685M**

---

## Infrastructure Cost Analysis

### Architecture Overview

EuroComply uses a **polyglot persistence** architecture optimized for both cost and scale:

```
┌─────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE ARCHITECTURE (from Architecture Doc v1.3)        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WRITE PATH (AWS)                                               │
│  • ECS Fargate: API + Workers (always-on services)              │
│  • RDS PostgreSQL: Products, passports, attestations            │
│  • ElastiCache Redis: Sessions, caching, job queues             │
│  • DynamoDB: Item-level data (billions of records)              │
│  • SQS FIFO: Event processing + bulk generation                 │
│                                                                  │
│  READ PATH (Cloudflare)                                         │
│  • R2: Static DPP files (zero egress cost)                      │
│  • Workers: DPP serving + lazy generation                       │
│  • CDN: Edge caching (<50ms global latency)                     │
│                                                                  │
│  WHY THIS ARCHITECTURE?                                         │
│  • ESPR requires free DPP access for everyone                   │
│  • R2 has zero egress fees (vs AWS $0.085/GB)                   │
│  • Schema-per-tenant provides strong isolation                  │
│  • DynamoDB handles billions of items without RDS limits        │
│                                                                  │
│  BASE COST: €158/month (see breakdown below)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

See [EuroComply_Architecture_Document_v1.3.md](../EuroComply_Architecture_Document_v1.3.md) for technical details.

### Monthly Cost Breakdown (from Architecture Doc v1.3)

| Component | Specification | Cost (EUR) |
|-----------|---------------|------------|
| **Compute (Always On)** | | |
| Fargate - API | 2 × (0.25 vCPU, 512 MB) | €17 |
| Fargate - Worker | 1 × (0.25 vCPU, 512 MB) | €8 |
| Fargate - Outbox | 1 × (0.25 vCPU, 512 MB) | €8 |
| **Compute (Auto-scaling)** | | |
| Fargate - Bulk Workers | 0-20 × (0.5 vCPU, 1 GB) | €0-140 |
| **Database** | | |
| RDS PostgreSQL | db.t4g.small Multi-AZ, 50 GB | €53 |
| ElastiCache Redis | cache.t4g.micro | €11 |
| **Networking** | | |
| NAT Instance | t4g.nano | €3 |
| Application Load Balancer | Hourly + LCU | €17 |
| **Security** | | |
| KMS | 1 CMK + API requests | €4 |
| Secrets Manager | 5 secrets | €2 |
| **Storage & Queues** | | |
| DynamoDB | On-demand | €1-45 |
| SQS (Events + Bulk) | FIFO queues | €1 |
| S3 | Assets bucket | €1 |
| ECR | Container images | €1 |
| **Monitoring** | | |
| CloudWatch | Logs, metrics, alarms | €9 |
| **External (Cloudflare)** | | |
| Cloudflare Pro | DNS, CDN, WAF, DDoS | €19 |
| Cloudflare Workers | DPP serving + lazy gen | €5 |
| Cloudflare R2 | DPP file storage | €1-18 |
| | | |
| **Base Total** | | **€158** |
| **With Bulk Processing** | | **€158-320** |

### Read Path: Cloudflare R2

| Feature | Specification |
|---------|---------------|
| Storage | $0.015/GB/month |
| Class A (writes) | $4.50/million |
| Class B (reads) | $0.36/million |
| **Egress** | **FREE** |

This is the key cost advantage - unlimited bandwidth for DPP scans.

### Cost at Scale

| Customers | Mix | Infrastructure | Revenue | Margin |
|-----------|-----|----------------|---------|--------|
| 10 | 10 Growth | €158/mo | €1,290/mo | 88% |
| 50 | 50 Growth | €158/mo | €6,450/mo | 98% |
| 100 | 90 Growth, 8 Scale, 2 Ent | €360/mo | €16,800/mo | 98% |
| 200 | 170 Growth, 25 Scale, 5 Ent | €520/mo | €36,920/mo | 99% |
| 500 | 400 Growth, 80 Scale, 18 Ent, 2 Mega | €1,200/mo | €104,700/mo | 99% |

### Gross Margin by Tier

From the Architecture Document v1.3:

| Tier | Price | Infra Cost | Gross Margin |
|------|-------|------------|--------------|
| Growth (€129) | €129/mo | <€5 | **96%** |
| Scale (€399) | €399/mo | €10-15 | **96%** |
| Enterprise (€999) | €999/mo | ~€100 | **90%** |
| Mega (€4,999) | €4,999/mo | €300-500 | **90-94%** |

Infrastructure costs scale linearly with revenue, ensuring healthy margins at all tiers.

### DPP Hosting Economics (10-Year Lifetime)

ESPR requires DPP data to be accessible for 10+ years. With Cloudflare R2:

| Component | Size | 10-Year Cost |
|-----------|------|--------------|
| Static DPP (R2) | 10KB | ~$0.0018 |
| Product images (R2) | 2MB | ~$0.36 |
| **Total per DPP** | ~2MB | **~$0.36** |
| **Scans** | Unlimited | **FREE** (R2 egress) |

Key advantage: R2 has zero egress fees, so unlimited scans cost nothing.

### QR Code Scan Economics

DPP pages are **static content** served from Cloudflare edge:

```
Consumer scans QR → Cloudflare Edge (cached) → Response (<50ms)
                          │
                     Cache MISS (rare)
                          ↓
                    R2 Origin (lazy generation if needed)
```

**Viral Product Scenario:** 10 million scans = **$0** (R2 egress is free)

This is the key cost advantage vs AWS CloudFront where 10M scans would cost ~$230.

### Key Infrastructure Insights

From the Architecture Document v1.3:

1. **Infrastructure is NOT the cost driver** - At scale, infra is <1% of revenue
2. **Real costs are headcount** - Support, development, and customer success dominate OpEx
3. **R2 eliminates bandwidth costs** - Zero egress fees mean viral products don't hurt margins
4. **Schema-per-tenant provides security** - All tiers get strong isolation, not just Enterprise

For detailed infrastructure specifications, see [EuroComply_Architecture_Document_v1.3.md](../EuroComply_Architecture_Document_v1.3.md).

---

## Retailer Access (Free Tier)

ESPR Article 31 mandates that DPP data must be accessible free of charge to all economic operators in the supply chain. EuroComply provides a free access layer for retailers who need to display DPPs for products they sell.

### What Retailers Get (Free)

Retailers register for a free account with email and company name. No technical knowledge required. Registration provides access to:

- **DPP Catalog Browser**: Search and browse the full catalog of published DPPs. Lookup by GTIN/EAN, brand and SKU combination, or item-level serial number.
- **Embeddable Widget**: A JavaScript snippet that retailers can add to their product pages. The widget automatically fetches and displays the DPP for the product.
- **Public API**: REST API for programmatic access to DPP data. Retailers receive a simple identifier for tracking, not a complex API key.
- **Shopify Retailer App**: A free Shopify app that automatically matches the retailer's products against the DPP catalog by GTIN and displays DPP information on product pages.

### Why Free?

Brands and manufacturers pay for DPP creation. Retailers access DPPs for free because:

1. ESPR Article 31 legally mandates free access for economic operators
2. Retailer adoption drives value for paying customers (brands)
3. Network effects increase platform value

### Retailer Value Proposition

| Benefit | Description |
|---------|-------------|
| Regulatory compliance | Meet ESPR requirements to display DPPs |
| Zero cost | Free access, no subscription required |
| Easy integration | Copy-paste widget or install Shopify app |
| Automatic updates | DPP data stays current as brands update |
| Verified data | DPPs are cryptographically signed by brands |

---

## Platform Value

### What Organizations Get

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLATFORM VALUE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DESIGN WORKSPACE (PLM)                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  PRODUCT REGISTRY (Technical DNA)                           ││
│  │  ├── Product structure and BOMs                             ││
│  │  ├── SKU management and versioning                          ││
│  │  └── Technical specifications                               ││
│  │                                                              ││
│  │  MATERIALS LIBRARY                                          ││
│  │  ├── Material definitions with sustainability data          ││
│  │  ├── Fiber compositions and percentages                     ││
│  │  ├── Carbon footprint factors                               ││
│  │  └── Recyclability and hazardous substance tracking         ││
│  │                                                              ││
│  │  DAM-TECH (Technical Documents)                             ││
│  │  ├── Technical specs, CAD files, test reports               ││
│  │  └── Revision control with approval workflow                ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  OPERATIONS WORKSPACE (ERP-lite)                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ITEM TRACKING (DynamoDB)                                   ││
│  │  ├── Billions of serialized items                          ││
│  │  ├── Lifecycle event visualization (manufactured → sold)    ││
│  │  └── Supply chain traceability                              ││
│  │                                                              ││
│  │  INVENTORY & ORDERS (Planned)                               ││
│  │  ├── Stock levels and locations                             ││
│  │  ├── Purchase order tracking                                ││
│  │  └── Supplier management                                    ││
│  │                                                              ││
│  │  ATTESTATION                                                ││
│  │  ├── Invite suppliers to attest material data               ││
│  │  └── Cryptographic proof of supplier claims                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  MARKETING WORKSPACE (PIM)                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  PIM (Commercial Enrichment)                                ││
│  │  ├── Product Families (attribute schemas)                   ││
│  │  ├── Dynamic attributes (JSONB flexibility)                 ││
│  │  ├── Variants (parent-child inheritance)                    ││
│  │  ├── Completeness scoring (per-channel)                     ││
│  │  └── Marketing content and translations                     ││
│  │                                                              ││
│  │  DAM-MEDIA (Marketing Assets)                               ││
│  │  ├── Product images, lifestyle photos, videos               ││
│  │  ├── S3 storage with CloudFront CDN                         ││
│  │  └── On-the-fly image optimization (Lambda + Sharp)         ││
│  │                                                              ││
│  │  SYNDICATION                                                ││
│  │  ├── Shopify product sync                                   ││
│  │  ├── Rate-limited job queue (BullMQ)                        ││
│  │  └── DPP metadata in metafields                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  COMPLIANCE WORKSPACE (DPP)                                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  DPP ISSUANCE                                               ││
│  │  ├── DPP Ready list when completeness = 100%                ││
│  │  ├── Manual review and approval before issuance             ││
│  │  ├── W3C Verifiable Credentials (walt.id)                   ││
│  │  ├── did:key for portable identity                          ││
│  │  ├── QR codes (GS1 Digital Link)                            ││
│  │  └── Public verification                                    ││
│  │                                                              ││
│  │  MULTI-PARTY ATTESTATION                                    ││
│  │  ├── Invite third parties to contribute data                ││
│  │  ├── Cryptographically signed attestations                  ││
│  │  ├── Linked to DPP as verifiable claims                     ││
│  │  └── Expiry tracking and notifications                      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  CROSS-CUTTING CAPABILITIES                                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  AI-POWERED IMPORT                                          ││
│  │  ├── Drop any file format (CSV, Excel, PDF, JSON)           ││
│  │  ├── AI extracts and maps data                              ││
│  │  ├── Schema validation                                      ││
│  │  └── Bulk upsert                                            ││
│  │                                                              ││
│  │  ROLE-BASED ACCESS CONTROL                                  ││
│  │  ├── Four authority levels (Viewer → Manager)               ││
│  │  ├── Scope-based permissions (Commercial, Compliance, Admin)││
│  │  ├── Git-style version control with approval workflow       ││
│  │  ├── Guest partner access with product filtering            ││
│  │  └── Cryptographic chain of custody (per-user DIDs)         ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### The Math

```
┌─────────────────────────────────────────────────────────────────┐
│  COST COMPARISON                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Option A: Enterprise PIM + DPP Solution                        │
│  • Akeneo/Salsify: €20,000+/year                               │
│  • DPP addon: €10,000+/year                                    │
│  • Implementation: €50,000+                                     │
│  • Total Year 1: €80,000+                                       │
│                                                                  │
│  Option B: Build Custom Solution                                │
│  • Development: €100,000+                                       │
│  • Hosting: €1,000/month                                        │
│  • Maintenance: €20,000/year                                    │
│  • Total Year 1: €132,000+                                      │
│                                                                  │
│  Option C: EuroComply Growth Plan                               │
│  • Monthly SaaS: €129                                           │
│  • Total Year 1: €1,548                                         │
│  • Full platform access from day 1                              │
│                                                                  │
│  EuroComply is 98%+ cheaper than alternatives.                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Revenue Model

### Primary Revenue Streams

```
┌─────────────────────────────────────────────────────────────────┐
│                    REVENUE COMPOSITION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  85% Subscription Revenue                                       │
│  ├── Monthly/Annual SaaS fees                                   │
│  └── Predictable, recurring                                     │
│                                                                  │
│  10% Usage-Based Revenue                                        │
│  ├── Product overages                                           │
│  ├── API call overages                                          │
│  └── Variable, scales with usage                                │
│                                                                  │
│  5% Services Revenue                                            │
│  ├── Enterprise onboarding                                      │
│  ├── Custom integrations                                        │
│  └── One-time or project-based                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Unit Economics

| Metric | Target |
|--------|--------|
| Average Revenue Per User (ARPU) | €178/month |
| Customer Acquisition Cost (CAC) | €400 |
| Lifetime Value (LTV) | €4,272 (24 months) |
| LTV:CAC Ratio | 10.7x |
| Gross Margin | 95%+ (infrastructure only) |
| Monthly Churn | 1.5% |

Full platform access from initial subscription increases integration depth and reduces churn.

---

## Market Opportunity

### Total Addressable Market

The EU ESPR mandates DPPs for most physical products by 2027-2030.

| Sector | EU Companies | DPP Deadline | TAM |
|--------|--------------|--------------|-----|
| Textiles | 143,000 | 2027 | €200M |
| Furniture | 130,000 | 2029 | €180M |
| Electronics | 100,000 | 2030 | €140M |
| Construction | 500,000 | 2030 | €700M |
| **Total** | **873,000** | | **€1.2B** |

*TAM calculated at €120/mo average across eligible companies*

### Serviceable Market

Targeting SMEs and mid-market companies who:
- Have own-brand products
- Sell in EU market
- Need PIM + compliance solution
- Can't afford enterprise solutions

**SAM**: ~60,000 companies = €150M annual opportunity

---

## Go-to-Market Strategy

### Distribution Channels

```
┌─────────────────────────────────────────────────────────────────┐
│                    DISTRIBUTION CHANNELS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DIRECT (Self-Service)                     45% of customers  │
│     ├── Website signup                                          │
│     ├── Shopify App Store                                       │
│     └── SEO / Content marketing                                 │
│                                                                  │
│  2. PARTNERSHIPS                              35% of customers  │
│     ├── E-commerce agencies                                     │
│     ├── Sustainability consultants                              │
│     └── Industry associations                                   │
│                                                                  │
│  3. OUTBOUND                                  20% of customers  │
│     ├── Trade show presence                                     │
│     ├── Targeted campaigns                                      │
│     └── Enterprise sales                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Customer Journey

```
Awareness → Trial → Conversion → Expansion
    │          │         │           │
    │          │         │           └── Growth → Scale (volume-based)
    │          │         └── Subscribe (Growth or Scale based on catalog size)
    │          └── 14-day free trial (full platform access)
    └── Content, SEO, App Store, Partnerships
```

---

## Competitive Positioning

### Market Landscape

| Tier | Examples | Price | Our Position |
|------|----------|-------|--------------|
| Enterprise PLM | Siemens Teamcenter, Dassault 3DExperience | €100k+/year | Not competing |
| Enterprise PIM | Akeneo, Salsify, inRiver | €50k+/year | Not competing |
| Enterprise ERP | SAP, Oracle | €200k+/year | Not competing |
| Mid-Market PLM | Arena, Propel | €30k+/year | Adjacent |
| Mid-Market PIM | Plytix, Sales Layer | €10k+/year | Adjacent |
| **SME Unified (PLM + ERP + PIM + DPP)** | EuroComply | €1,548-59,988/year | **Leader** |
| DPP-Only Tools | Various | €500-2k/year | Partial overlap |

### Differentiation

| Capability | Enterprise Suites | Mid-Market Tools | DPP-Only Tools | EuroComply |
|------------|-------------------|------------------|----------------|------------|
| **Design (PLM)** | Full CAD integration | BOMs, materials | None | Registry, Materials, BOMs |
| **Operations (ERP)** | Full ERP | Basic inventory | None | Item tracking, Inventory-lite |
| **Marketing (PIM)** | Full PIM | Full PIM | None | Families, Variants, DAM |
| **Compliance (DPP)** | Addon (€10k+) | Addon | Basic | Native, integrated |
| Verifiable credentials | None | None | None | W3C VCs, did:key |
| Multi-party attestation | None | None | None | Native |
| AI import | Limited | Limited | None | Any format |
| E-commerce sync | Complex | Limited | None | Native Shopify |
| SME pricing | Unaffordable | Too expensive | Affordable | €129-399/mo |
| Setup time | Months | Weeks | Days | Same day |

### The EuroComply Advantage

**One platform replaces four tools:**

| Traditional Approach | EuroComply Equivalent |
|---------------------|----------------------|
| Entry-level PLM (€500-2k/mo) | Design Workspace (Registry, Materials) |
| Basic ERP/Inventory (€200-1k/mo) | Operations Workspace (Item Tracking, Inventory) |
| Entry-level PIM (€300-1.5k/mo) | Marketing Workspace (PIM, DAM, Syndication) |
| Compliance consultants (€5-20k one-time) | Compliance Workspace (DPP, Attestation) |
| **Total: €1,000-4,500+/mo** | **EuroComply: €129-399/mo** |

---

## Data Sovereignty

### Organizations Own Their Data

```
┌─────────────────────────────────────────────────────────────────┐
│  DATA OWNERSHIP GUARANTEE                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  All product data and credentials belong to the organization,   │
│  not EuroComply.                                                │
│                                                                  │
│  The Verifiable Credential contains:                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  {                                                         │  │
│  │    "issuer": "did:key:z6MkhaXgBZD...",  ← Portable DID    │  │
│  │    "credentialSubject": {                                  │  │
│  │      ... all DPP data embedded ...                         │  │
│  │    },                                                      │  │
│  │    "proof": { "jws": "..." }            ← Signature       │  │
│  │  }                                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  This means:                                                    │
│  • Can be verified by ANYONE (did:key = self-contained)        │
│  • Can be hosted ANYWHERE                                       │
│  • Organization OWNS it                                        │
│  • Is TRANSFERABLE to any other host                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### When Subscription Ends

1. **Export package provided** containing all data, VCs, and keys
2. **30-day grace period** to migrate data
3. **Options:**
   - Self-host the data
   - Move to another provider
   - Upload to decentralized storage
   - **Opt for Dormant Hosting** (see below)
4. **VCs still verify** - did:key is self-contained, no EuroComply dependency

### Dormant Hosting (Optional)

When an organization cancels their subscription but wants to keep their DPP QR codes working, they can opt for Dormant Hosting:

| Feature | Description |
|---------|-------------|
| **Purpose** | Keep QR codes working after subscription ends |
| **Cost** | €99/year or €500 one-time (per 10,000 SKUs) |
| **What's Included** | Static DPP pages remain accessible, QR codes continue working |
| **What's Disabled** | PIM editing, new DPP issuance, AI import, Shopify sync |
| **Data Retention** | 10+ years (ESPR compliance requirement) |

**This is optional.** Organizations can also:
- Export all data and self-host (free)
- Move to another VC-compatible provider
- Use the 30-day grace period to migrate

Dormant Hosting addresses the ESPR requirement for 10-year data availability while providing a low-cost option for organizations that no longer need active product management but want to maintain compliance for products already in market.

---

## Financial Projections

### Year 1-3 Targets

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| Customers | 400 | 1,500 | 4,000 |
| ARR | €0.9M | €3.2M | €8.5M |
| MRR | €77k | €270k | €710k |
| Gross Margin | 95% | 96% | 97% |
| Headcount | 8 | 18 | 35 |

### Revenue by Tier (Year 3)

| Tier | Customers | % of Base | MRR | % of Revenue |
|------|-----------|-----------|-----|--------------|
| Growth | 3,200 | 80% | €413k | 58% |
| Scale | 720 | 18% | €287k | 40% |
| Enterprise | 80 | 2% | €120k | 17% |
| **Total** | **4,000** | **100%** | **€710k** | **100%** |

Simplified tier structure accelerates sales cycles and improves conversion rates.

---

## Key Success Metrics

### North Star Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Active Products** | Products managed in platform | 1M by Year 3 |
| **DPPs Issued** | Products with active DPPs | 500k by Year 3 |
| **Completeness Score** | Avg product data completeness | 85% |

### Operational Metrics

| Category | Metric | Target |
|----------|--------|--------|
| Growth | MRR Growth Rate | 12% MoM |
| Retention | Net Revenue Retention | 115% |
| Efficiency | CAC Payback Period | 4 months |
| Engagement | Weekly Active Users | 75% |

---

## Risk Factors

### Market Risks

| Risk | Mitigation |
|------|------------|
| ESPR delays | Build PIM value independent of compliance |
| Competition from incumbents | Focus on SME segment they ignore |
| Economic downturn | Essential compliance spend, not discretionary |

### Operational Risks

| Risk | Mitigation |
|------|------------|
| Technical complexity | Modular architecture, incremental delivery |
| Customer churn | Strong onboarding, success team |
| Scaling challenges | Cloud-native infrastructure |

---

## Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    EUROCOMPLY BUSINESS MODEL                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POSITIONING                                                    │
│  Unified Product Lifecycle & Compliance platform combining      │
│  PLM, ERP-lite, PIM, and DPP in one affordable solution.       │
│  One platform, four workspaces, workspace-based data model.    │
│                                                                  │
│  TARGET MARKET                                                  │
│  SMEs and mid-market organizations (brands, manufacturers,      │
│  distributors) with 100-20,000+ SKUs requiring ESPR compliance │
│  without enterprise-level investment.                           │
│                                                                  │
│  PRICING STRUCTURE                                              │
│  Volume-based tiers with full platform access:                  │
│  • Growth: €129/month (500 products, 10K items)                │
│  • Scale: €399/month (5,000 products, 1M items)                │
│  • Enterprise: €999/month (unlimited, 100M items, SLA)         │
│  • Mega: €4,999/month (unlimited, dedicated cluster)           │
│                                                                  │
│  FOUR WORKSPACES (ALL INCLUDED)                                │
│  • Design (PLM): Registry, Materials, DAM-Tech, BOMs           │
│  • Operations (ERP-lite): Item Tracking, Inventory, Suppliers  │
│  • Marketing (PIM): Product content, DAM-Media, Syndication    │
│  • Compliance (DPP): DPP issuance, Attestation, VCs            │
│                                                                  │
│  CROSS-CUTTING CAPABILITIES                                     │
│  • AI-powered data import (any file format)                    │
│  • W3C Verifiable Credentials (walt.id, did:key)               │
│  • Multi-party attestation with cryptographic signatures       │
│  • E-commerce syndication (Shopify)                            │
│  • API access and webhooks                                      │
│                                                                  │
│  COMPETITIVE DIFFERENTIATION                                    │
│  • Four tools in one (PLM + ERP + PIM + DPP)                   │
│  • Native DPP compliance (not an add-on)                       │
│  • Portable credentials (did:key, no vendor lock-in)           │
│  • SME-accessible price point (98% cheaper than alternatives)  │
│  • Same-day setup (no implementation project)                  │
│                                                                  │
│  UNIT ECONOMICS (from Architecture Doc v1.3)                    │
│  • Gross margin: 90-96% depending on tier                      │
│  • Infrastructure base cost: €158/month                        │
│  • Primary cost driver: personnel (support, development)       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last Updated: January 13, 2026*
