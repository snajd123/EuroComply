# EuroComply Business Model

## Value Proposition

EuroComply is a Compliance-First Product Information Management (PIM) platform. Organizations pay for tools to manage product data and generate Digital Product Passports (DPPs) for EU ESPR compliance.

---

## Target Market

### Primary Customers

| Segment | Description | Size |
|---------|-------------|------|
| **Brands** | Consumer brands managing product catalogs | 50-5,000 SKUs |
| **Manufacturers** | Producers with primary product data | 100-10,000 SKUs |
| **Distributors** | Wholesalers aggregating products | 500-50,000 SKUs |

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
│  • DPPs generated automatically when data complete             │
│  • Sync to Shopify with one click                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Not Our Target

- **Large Enterprises**: Use SAP, Akeneo, or custom solutions
- **Pure Retailers**: Only resell others' products, no own brands
- **Non-EU Businesses**: No ESPR compliance requirement

---

## Pricing Model

### SaaS Subscription Tiers

Organizations pay monthly based on features needed and product volume.

| Plan | Monthly | Products | Features |
|------|---------|----------|----------|
| **DPP Starter** | €49 | 100 | Core, Compliance, Basic DAM, Manual entry |
| **DPP Professional** | €149 | 500 | + Full DAM, CSV Import, Priority support |
| **PIM + DPP** | €299 | 2,000 | + PIM, AI Import, Shopify Sync, API access |
| **Enterprise** | Custom | Unlimited | + Custom integrations, Dedicated support, SLA |

### Module Breakdown

| Module | DPP Starter | DPP Professional | PIM + DPP | Enterprise |
|--------|:-----------:|:----------------:|:---------:|:----------:|
| Core (Auth, Billing) | Y | Y | Y | Y |
| Compliance (DPP, VCs) | Y | Y | Y | Y |
| DAM (Basic) | Y | Y | Y | Y |
| DAM (Full) | - | Y | Y | Y |
| Import (CSV) | - | Y | Y | Y |
| Import (AI) | - | - | Y | Y |
| PIM (Families, Variants) | - | - | Y | Y |
| Syndication (Shopify) | - | - | Y | Y |
| API Access | - | - | Y | Y |
| Custom Integrations | - | - | - | Y |

### Add-ons

| Add-on | Price | Description |
|--------|-------|-------------|
| Additional Products | €0.10/product/mo | Beyond plan limit |
| Additional Users | €10/user/mo | Beyond 3 included |
| API Overage | €0.001/call | Beyond 100k calls/mo |
| Priority Support | €50/mo | 4-hour response SLA |

---

## Platform Value

### What Organizations Get

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLATFORM VALUE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRODUCT INFORMATION MANAGEMENT                                 │
│  ├── Product Families (attribute schemas)                       │
│  ├── Dynamic attributes (JSONB flexibility)                     │
│  ├── Variants (parent-child inheritance)                        │
│  ├── Completeness scoring (per-channel)                         │
│  └── Multi-currency pricing                                     │
│                                                                  │
│  AI-POWERED IMPORT                                              │
│  ├── Drop any file format (CSV, Excel, PDF, JSON)              │
│  ├── AI extracts and maps data                                  │
│  ├── Schema validation                                          │
│  └── Bulk upsert                                                │
│                                                                  │
│  DIGITAL ASSET MANAGEMENT                                       │
│  ├── S3 storage with CloudFront CDN                            │
│  ├── On-the-fly image optimization (Lambda + Sharp)            │
│  └── Asset roles (gallery, thumbnail, certificate)              │
│                                                                  │
│  COMPLIANCE (DPP)                                               │
│  ├── Auto-generation when completeness = 100%                  │
│  ├── W3C Verifiable Credentials (walt.id)                      │
│  ├── did:key for portable identity                              │
│  ├── QR codes (GS1 Digital Link)                               │
│  └── Public verification                                        │
│                                                                  │
│  E-COMMERCE SYNDICATION                                         │
│  ├── Shopify product sync                                       │
│  ├── Rate-limited job queue (BullMQ)                           │
│  └── DPP metadata in metafields                                 │
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
│  Option C: EuroComply PIM + DPP                                 │
│  • Monthly SaaS: €299                                           │
│  • Total Year 1: €3,588                                         │
│                                                                  │
│  EuroComply is 95%+ cheaper than alternatives.                  │
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
| Average Revenue Per User (ARPU) | €200/month |
| Customer Acquisition Cost (CAC) | €600 |
| Lifetime Value (LTV) | €4,800 (24 months) |
| LTV:CAC Ratio | 8.0x |
| Gross Margin | 75% |
| Monthly Churn | 2% |

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
    │          │         │           └── DPP Starter → PIM + DPP
    │          │         └── Subscribe (starts at any tier)
    │          └── 14-day free trial
    └── Content, SEO, App Store, Partnerships
```

---

## Competitive Positioning

### Market Landscape

| Tier | Examples | Price | Our Position |
|------|----------|-------|--------------|
| Enterprise PIM | Akeneo, Salsify, inRiver | €50k+/year | Not competing |
| Mid-Market PIM | Plytix, Sales Layer | €10k+/year | Adjacent |
| **SME PIM + DPP** | EuroComply | €600-3,600/year | **Leader** |
| DPP-Only Tools | Various | €500-2k/year | Partial overlap |

### Differentiation

| Capability | Traditional PIM | DPP-Only Tools | EuroComply |
|------------|-----------------|----------------|------------|
| Product management | Full | None | Full |
| DPP compliance | Addon | Basic | Native |
| Verifiable credentials | None | None | W3C VCs |
| AI import | None | None | Any format |
| E-commerce sync | Limited | None | Native |
| SME pricing | Too expensive | Affordable | Affordable |

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
4. **VCs still verify** - did:key is self-contained, no EuroComply dependency

---

## Financial Projections

### Year 1-3 Targets

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| Customers | 400 | 1,500 | 4,000 |
| ARR | €1.0M | €3.6M | €9.6M |
| MRR | €80k | €300k | €800k |
| Gross Margin | 70% | 75% | 80% |
| Headcount | 8 | 18 | 35 |

### Revenue by Tier (Year 3)

| Tier | Customers | % of Base | MRR | % of Revenue |
|------|-----------|-----------|-----|--------------|
| DPP Starter | 2,000 | 50% | €98k | 12% |
| DPP Professional | 1,200 | 30% | €179k | 22% |
| PIM + DPP | 680 | 17% | €204k | 26% |
| Enterprise | 120 | 3% | €320k | 40% |
| **Total** | **4,000** | **100%** | **€801k** | **100%** |

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
| Efficiency | CAC Payback Period | 5 months |
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
│                    EUROCOMPLY MODEL                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POSITIONING: Compliance-First PIM                              │
│  → Product data management + DPP in one platform               │
│  → Single "Golden Record" for commercial + compliance data      │
│                                                                  │
│  TARGET MARKET: SMEs and Mid-Market                            │
│  → Brands, manufacturers, distributors                          │
│  → 100-5,000 SKUs                                              │
│  → Can't afford enterprise solutions                           │
│                                                                  │
│  PRICING: Modular SaaS                                         │
│  → DPP Starter: €49/mo (compliance focus)                      │
│  → DPP Professional: €149/mo (+ import, DAM)                   │
│  → PIM + DPP: €299/mo (full platform)                          │
│  → Enterprise: Custom                                           │
│                                                                  │
│  KEY FEATURES:                                                  │
│  → AI-powered import (any file format)                         │
│  → Product families with dynamic attributes                    │
│  → Completeness scoring per channel                            │
│  → Auto DPP generation with W3C VCs                            │
│  → Shopify syndication                                         │
│                                                                  │
│  DIFFERENTIATION:                                               │
│  → Only PIM with native DPP compliance                         │
│  → AI import from any format                                   │
│  → Affordable for SMEs                                          │
│  → No lock-in (portable VCs)                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last Updated: January 2026*
