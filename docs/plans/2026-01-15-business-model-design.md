# Business Model Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** BUSINESS_MODEL.md + clarification session

---

## 1. Overview

EuroComply is a Unified Product Lifecycle & Compliance Platform combining PLM, ERP-lite, PIM, and DPP capabilities. This document defines the pricing model and business economics.

### Value Proposition

| Aspect | Value |
|--------|-------|
| **Core offering** | Four tools in one (PLM + ERP + PIM + DPP) |
| **Target market** | SMEs and mid-market with ESPR compliance needs |
| **Price positioning** | 95% cheaper than enterprise alternatives |
| **Key differentiator** | Native DPP compliance, not an add-on |

---

## 2. Pricing Structure

### Base Fee + Per-DPP + SKU Hosting + Shipping Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRICING PHILOSOPHY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BASE FEE (Monthly/Annual)                                      │
│  ─────────────────────────                                       │
│  • Full platform access (all 4 workspaces)                      │
│  • Unlimited products/SKUs                                       │
│  • User allocation (tier-based)                                  │
│  • Storage allocation (tier-based)                               │
│  • API access and webhooks                                       │
│  • Support level (varies by tier)                               │
│                                                                  │
│  PER-DPP FEE (Triggered at Provisioning)                        │
│  ───────────────────────────────────────                         │
│  • Charged when DPP transitions COMMISSIONED → PROVISIONED      │
│  • NOT charged at serial creation (label printing)              │
│  • DPP generation and VC issuance                               │
│  • QR code generation (GS1 Digital Link)                        │
│  • 10-year hosting included in price                            │
│  • EPCIS lifecycle events included                              │
│  • Scales with actual compliance output                         │
│                                                                  │
│  SKU HOSTING FEE                                                │
│  ───────────────                                                 │
│  • €0.50/year per active SKU                                    │
│  • Covers product catalog hosting costs                         │
│  • Billed monthly (€0.042/SKU prorated)                         │
│  • Only active SKUs (released products) count                   │
│                                                                  │
│  RECALL OPERATIONS                                              │
│  ─────────────────                                               │
│  • €0.001/item for recall initiation                            │
│  • €0.0005/item for recall resolution                           │
│  • Cost-based pricing with 80% margin                           │
│  • Minimum charge: €10 per recall                               │
│                                                                  │
│  SHIPPING & LOGISTICS ("Compliant Highway")                     │
│  ──────────────────────────────────────────                      │
│  • Compliance Unlock fee (per consignment)                      │
│  • EPCIS event tracking (per EPC)                               │
│  • Customs filing with Evidence Package (per filing)            │
│  • Label markup (10% on carrier rates)                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

> **Billing Trigger:** See [Billing Design](./2026-01-15-billing-design.md#dpp-billing-trigger) for DPP billing lifecycle.

### Pricing Tiers

| Tier | Base Fee | Users | Storage | DPP Price | Volume Discounts |
|------|----------|-------|---------|-----------|------------------|
| **Starter** | €149/mo | 20 | 500 GB | €0.10/DPP | 10K+: €0.08 |
| **Growth** | €299/mo | 50 | 1 TB | €0.05/DPP | 50K+: €0.03, 100K+: €0.02 |
| **Scale** | €749/mo | 100 | 2 TB | €0.02/DPP | 500K+: €0.01, 1M+: €0.008 |
| **Enterprise** | €1,999/mo | 200 | 5 TB | €0.008/DPP | 5M+: €0.005, 10M+: €0.003 |
| **Platform** | Custom | Custom | Custom | €0.001-0.003 | Negotiated |

### User Limits

User limits protect margins while providing generous allocations for typical SME needs:

| Tier | Users Included | Additional Users |
|------|----------------|------------------|
| Starter | 20 | €10/user/month |
| Growth | 50 | €10/user/month |
| Scale | 100 | €10/user/month |
| Enterprise | 200 | €10/user/month |
| Platform | Custom | Negotiated |

**Rationale:**
- 95% of SMEs need fewer than 50 users
- Prevents margin erosion from auth provider costs (Clerk MAU pricing)
- €10/user overage is simple and covers costs + margin
- "Unlimited products/SKUs" remains the headline differentiator

### Storage Limits

| Tier | Storage | At Limit |
|------|---------|----------|
| Starter | 500 GB | Upgrade tier |
| Growth | 1 TB | Upgrade tier |
| Scale | 2 TB | Upgrade tier |
| Enterprise | 5 TB | Upgrade tier |
| Platform | Custom | Negotiated |

**What counts toward storage:**
- Product images and marketing assets
- PDFs (certifications, spec sheets)
- Videos and rich media

**Not counted (unlimited):**
- Product data records
- DPP metadata and EPCIS events
- All workspace data

**At limit behavior:**
- Notification at 90% usage
- New uploads paused at 100%
- Existing data unaffected
- Solution: Upgrade tier or clean up unused files

### Annual Pricing

20% discount on base fees for annual prepayment:

| Tier | Monthly | Annual | Savings |
|------|---------|--------|---------|
| Starter | €149/mo | €1,430/year | €358 |
| Growth | €299/mo | €2,870/year | €718 |
| Scale | €749/mo | €7,190/year | €1,798 |
| Enterprise | €1,999/mo | €19,190/year | €4,798 |

*Per-DPP fees always billed monthly based on actual usage.*

---

## 3. Volume Discounts

Automatic discounts as monthly DPP volume increases:

```
┌─────────────────────────────────────────────────────────────────┐
│                    VOLUME DISCOUNT THRESHOLDS                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STARTER (€0.10 base):                                          │
│  └─ 10K+ DPPs/month: €0.08 (20% discount)                       │
│                                                                  │
│  GROWTH (€0.05 base):                                           │
│  ├─ 50K+ DPPs/month: €0.03 (40% discount)                       │
│  └─ 100K+ DPPs/month: €0.02 (60% discount)                      │
│                                                                  │
│  SCALE (€0.02 base):                                            │
│  ├─ 500K+ DPPs/month: €0.01 (50% discount)                      │
│  └─ 1M+ DPPs/month: €0.008 (60% discount)                       │
│                                                                  │
│  ENTERPRISE (€0.008 base):                                      │
│  ├─ 5M+ DPPs/month: €0.005 (37% discount)                       │
│  └─ 10M+ DPPs/month: €0.003 (62% discount)                      │
│                                                                  │
│  PLATFORM:                                                      │
│  └─ 100M+ DPPs/month: €0.001 or lower (negotiated)              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Feature Matrix

| Feature | Starter | Growth | Scale | Enterprise | Platform |
|---------|:-------:|:------:|:-----:|:----------:|:--------:|
| **Platform** | | | | | |
| Design Workspace | Full | Full | Full | Full | Full |
| Operations Workspace | Full | Full | Full | Full | Full |
| Marketing Workspace | Full | Full | Full | Full | Full |
| Compliance Workspace | Full | Full | Full | Full | Full |
| **Limits** | | | | | |
| Products/SKUs | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |
| Users | 20 | 50 | 100 | 200 | Custom |
| Storage | 500 GB | 1 TB | 2 TB | 5 TB | Custom |
| API Rate Limit | 100/min | 500/min | 2,000/min | 10,000/min | Custom |
| **Support** | | | | | |
| Email Support | ✓ | ✓ | ✓ | ✓ | ✓ |
| Priority Support | - | - | ✓ | ✓ | ✓ |
| Phone Support | - | - | - | ✓ | ✓ |
| Dedicated CSM | - | - | - | ✓ | ✓ |
| **SLAs** | | | | | |
| Uptime SLA | 99.5% | 99.5% | 99.9% | 99.95% | Custom |
| Response Time | - | - | 4 hours | 1 hour | Custom |
| **Advanced** | | | | | |
| SSO/SAML | - | - | Add-on | ✓ | ✓ |
| Custom Domain | - | - | Add-on | ✓ | ✓ |
| Dedicated Infrastructure | - | - | - | - | ✓ |

### Add-ons (Scale tier)

| Add-on | Price |
|--------|-------|
| SSO/SAML | €99/month |
| Custom Domain | €49/month |

---

## 5. Unit Economics

### Per-DPP Cost Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    10-YEAR DPP COST                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GENERATION (one-time):                                         │
│  ├── VC computation: €0.0001                                    │
│  ├── QR code generation: €0.00001                               │
│  └── Subtotal: ~€0.0001                                         │
│                                                                  │
│  10-YEAR STORAGE:                                               │
│  ├── Template (R2, shared): €0.00003 amortized                  │
│  ├── Item record (DynamoDB): €0.00002                           │
│  └── Subtotal: ~€0.00005                                        │
│                                                                  │
│  10-YEAR OPERATIONS:                                            │
│  ├── Status list hosting: €0.00005                              │
│  ├── Format migration reserve: €0.00010                         │
│  ├── Inflation buffer: €0.00005                                 │
│  └── Subtotal: ~€0.00020                                        │
│                                                                  │
│  TOTAL 10-YEAR TCO: ~€0.00035                                   │
│  WITH RISK BUFFER (3x): ~€0.001                                 │
│                                                                  │
│  SERVING COST: €0 (R2 zero egress)                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Gross Margins by Tier

| Tier | DPP Price | 10-Year TCO | Gross Margin |
|------|-----------|-------------|--------------|
| Starter | €0.10 | €0.00035 | **99.7%** |
| Growth | €0.05 | €0.00035 | **99.3%** |
| Scale | €0.02 | €0.00035 | **98.3%** |
| Enterprise | €0.008 | €0.00035 | **95.6%** |
| Platform (floor) | €0.001 | €0.00035 | **65%** |

### Key Insight: 10-Year Hosting Included

DPP pricing already includes 10-year hosting costs. When a customer cancels:
- Their DPPs continue working (cost already collected)
- QR codes remain functional
- No "dormant hosting" fee needed
- Customer can export data during 30-day grace period

### DPP vs Evidence Package Economics

Evidence Packages (shipping compliance bundles) have different economics than DPPs:

| Metric | DPP | Evidence Package | Notes |
|--------|-----|------------------|-------|
| Storage architecture | Deduplicated | Unique per consignment | EPkg can't share templates |
| Average size | ~500 bytes + shared template | ~1.3MB full package | 2,600x larger |
| 10-year TCO | €0.00035 | €0.02 (with PDF) | 57x more expensive |
| Floor price | €0.001/DPP | €5.00/consignment | 5,000x higher revenue |
| Gross margin (floor) | 65% | **99.7%** | EPkg margins are healthier |
| Volume (Year 5) | 12B DPPs | ~7M consignments | DPPs drive volume, EPkg drives margin |

**Key Insight:** Evidence Package storage is more expensive than DPPs (no deduplication possible), but the pricing easily covers costs with 99%+ margins. DPPs drive volume; Evidence Packages drive high-margin revenue.

---

## 6. Shipping Revenue ("Compliant Highway")

EuroComply's "Compliant Highway" integrates shipping with compliance verification. The key insight: **ship only after proving compliance, not the reverse**.

> **Full Details:** See [Operations Workspace Design](./2026-01-15-operations-workspace-design.md#16-shipping--logistics-module) for complete shipping architecture and [Billing Design](./2026-01-15-billing-design.md#4-shipping--logistics-billing) for pricing details.

### Shipping Revenue Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPLIANT HIGHWAY MODEL                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STAGE → VERIFY → SEAL → SHIP                                   │
│                                                                  │
│  1. STAGE: Aggregate serials into consignment                   │
│  2. VERIFY: Automated compliance check (all DPPs valid)         │
│  3. SEAL: Generate EPCIS aggregation event + Evidence Package   │
│  4. SHIP: Label generated only after compliance verified        │
│                                                                  │
│  KEY INSIGHT: Control the label, control the highway.           │
│  No label without passing compliance verification.              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Shipping Pricing by Tier

| Fee Type | Starter | Growth | Scale | Enterprise | Platform |
|----------|---------|--------|-------|------------|----------|
| Compliance Unlock | €25.00 | €20.00 | €15.00 | €10.00 | €5.00 |
| EPCIS Event (per EPC) | €0.05 | €0.04 | €0.03 | €0.02 | €0.01 |
| Customs Filing | €50.00 | €40.00 | €35.00 | €25.00 | €15.00 |
| Label Markup | 10% | 10% | 10% | 10% | 10% |

### Revenue Composition (Year 5)

```
┌─────────────────────────────────────────────────────────────────┐
│                    REVENUE COMPOSITION (Year 5)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  26% Base Subscription Revenue                                  │
│  ├── Monthly/Annual platform fees                               │
│  └── Predictable, recurring foundation                          │
│                                                                  │
│  54% Per-DPP Revenue (Provisioning Trigger)                     │
│  ├── Charged at COMMISSIONED → PROVISIONED transition           │
│  ├── Volume-based DPP issuance fees                            │
│  ├── Scales with actual compliance output                       │
│  └── Primary growth driver                                      │
│                                                                  │
│  4% SKU Hosting Revenue                                         │
│  ├── €0.50/year per active SKU                                  │
│  ├── Covers product catalog infrastructure                      │
│  └── Predictable, scales with product count                     │
│                                                                  │
│  12% Shipping & Logistics Revenue                               │
│  ├── Compliance Unlock fees (per consignment)                   │
│  ├── EPCIS event fees (per EPC tracked)                        │
│  ├── Customs filing fees (Evidence Package generation)          │
│  └── Label markup (10% on carrier rates)                        │
│                                                                  │
│  2% Recall Operations Revenue                                   │
│  ├── €0.001/item for recall initiation                          │
│  ├── €0.0005/item for recall resolution                         │
│  └── Cost-based with 80% margin (unpredictable)                 │
│                                                                  │
│  2% Services Revenue                                            │
│  ├── Enterprise onboarding                                      │
│  ├── Custom integrations                                        │
│  └── One-time or project-based                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### SKU Hosting Economics

| Metric | Year 5 |
|--------|--------|
| Customers | 6,000 |
| Average SKUs per customer | 500 |
| Total active SKUs | 3,000,000 |
| Annual revenue | €1.5M |
| 10-year cost per SKU | €0.033 |
| **Gross Margin** | **93.4%** |

### Recall Operations Economics

| Metric | Year 5 (estimated) |
|--------|-------------------|
| Annual recalls (industry avg) | 2% of batches |
| Average items per recall | 25,000 |
| Recall initiation fee | €25 average |
| Resolution fee | €12.50 average |
| Recall events/year | ~3,600 |
| Annual revenue | ~€135K |
| **Gross Margin** | **~77%** |

*Note: Recall revenue is unpredictable and should not be relied upon for projections.*

### Shipping Revenue Projection

- Year 5: 6,000 customers × 20% using shipping = 1,200 active shipping customers
- Average 500 shipments/month × €5 blended shipping fee = €3M/month
- **Shipping ARR (Year 5): ~€36M** (12% of total €175M ARR)

---

## 7. Subscription Lifecycle

### When Subscription Ends

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUBSCRIPTION END FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DAY 0: Subscription ends                                       │
│  ├── Platform access suspended                                  │
│  ├── Export tools remain accessible                             │
│  └── DPPs continue working (10-year hosting paid)               │
│                                                                  │
│  DAYS 1-30: Grace period                                        │
│  ├── Export all data (products, VCs, media)                     │
│  ├── Download organization's signing keys                       │
│  └── DPPs continue working                                      │
│                                                                  │
│  DAY 30+: Data retention                                        │
│  ├── Product data archived (not deleted)                        │
│  ├── DPPs continue working (ESPR requirement)                   │
│  └── VCs remain valid (did:key is self-contained)               │
│                                                                  │
│  OPTIONS FOR CUSTOMER:                                          │
│  • Self-host exported data                                      │
│  • Move to another provider                                     │
│  • Re-subscribe to restore access                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**No dormant hosting tier.** DPP costs already include 10-year hosting.

---

## 8. Retailer Access (Free)

ESPR Article 31 mandates free DPP access for economic operators.

### What Retailers Get (Free)

| Feature | Description |
|---------|-------------|
| DPP Catalog Browser | Search by GTIN, brand, serial number |
| Embeddable Widget | JavaScript snippet for product pages |
| Public API | Programmatic DPP data access |
| Shopify Retailer App | Automatic GTIN matching |

### Why Free?

1. **Legal requirement** - ESPR Article 31 mandates free access
2. **Network effects** - Retailer adoption drives brand value
3. **Zero marginal cost** - R2 egress is free

---

## 9. Revenue Examples

### Example 1: Small Fashion Brand (Growth)

```
500 SKUs, product-level DPPs
Monthly: 42 DPPs

Base fee:     €299
DPPs:         42 × €0.05 = €2
Users:        15 (within 50 limit)
──────────────────────────────
TOTAL:        €301/month
Annual:       €3,612
```

### Example 2: Electronics Manufacturer (Scale)

```
2,000 SKUs, serialized items
Monthly: 42,000 DPPs

Base fee:     €749
DPPs:         42,000 × €0.02 = €840
Users:        45 (within 100 limit)
──────────────────────────────────
TOTAL:        €1,589/month
Annual:       €19,068
```

### Example 3: Battery Manufacturer (Enterprise)

```
100 SKUs, cell-level tracking
Monthly: 4.2M DPPs

Base fee:           €1,999
DPPs (at €0.008):   4,200,000 × €0.008 = €33,600
Users:              120 (20 over limit)
User overage:       20 × €10 = €200
──────────────────────────────────────────────
TOTAL:              €35,799/month
Annual:             €429,588
```

---

## 10. Competitive Positioning

### Cost Comparison

```
┌─────────────────────────────────────────────────────────────────┐
│                    YEAR 1 COST COMPARISON                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OPTION A: Enterprise Stack                                     │
│  ├── Akeneo/Salsify PIM: €20,000+                               │
│  ├── DPP addon: €10,000+                                        │
│  ├── Implementation: €50,000+                                   │
│  └── Total: €80,000+                                            │
│                                                                  │
│  OPTION B: Custom Build                                         │
│  ├── Development: €100,000+                                     │
│  ├── Hosting: €12,000/year                                      │
│  ├── Maintenance: €20,000/year                                  │
│  └── Total: €132,000+                                           │
│                                                                  │
│  OPTION C: EuroComply Growth                                    │
│  ├── Base: €3,588/year                                          │
│  ├── DPPs (20K): ~€1,000/year                                   │
│  └── Total: €4,588                                              │
│                                                                  │
│  EuroComply is 95%+ cheaper.                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Market Position

| Segment | Competition | EuroComply Position |
|---------|-------------|---------------------|
| Enterprise PLM/PIM | Siemens, SAP, Akeneo | Not competing |
| Mid-Market | Arena, Plytix | Adjacent (we're cheaper) |
| SME Unified | **No direct competitor** | **Leader** |
| DPP-Only | Various startups | Superior (full platform) |

---

## 11. Infrastructure Economics

### Base Cost

| Component | Monthly Cost |
|-----------|--------------|
| AWS (Fargate, RDS, DynamoDB, etc.) | €120 |
| Cloudflare (Pro, Workers, R2) | €38 |
| **Total baseline** | **€158** |

### Why Infrastructure Isn't the Cost Driver

```
At Year 5 (€139M ARR):
├── Infrastructure: ~€2M (1.4% of revenue)
├── Personnel: ~€30M (22% of revenue)
└── Gross profit: ~€128M (92% margin)

Infrastructure scales sub-linearly with revenue.
Personnel is the real cost driver.
```

---

## 12. Changes from Original Document

| Aspect | Original | Updated |
|--------|----------|---------|
| **Users** | "Unlimited" | Tiered: 20/50/100/200 + €10/user overage |
| **Dormant Hosting** | €99/year option | Removed (10-year hosting in DPP price) |
| **Storage overage** | Not addressed | Tier upgrade required |
| **RBAC description** | "Scope-based permissions" | Workspace-based (4 authorities per workspace) |

---

## 13. Related Documents

| Document | Purpose |
|----------|---------|
| [Architecture Design](./2026-01-15-architecture-design.md) | Technical infrastructure |
| [Operations Workspace Design](./2026-01-15-operations-workspace-design.md) | Shipping & Logistics, EPCIS, Evidence Package |
| [Billing Design](./2026-01-15-billing-design.md) | Stripe integration, invoicing, shipping billing |
| [User Management Design](./2026-01-15-user-management-design.md) | RBAC, permissions |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.3 | 2026-01-16 | Clarified DPP billing trigger (COMMISSIONED→PROVISIONED), added SKU hosting (€0.50/yr), added Recall operations (80% margin) |
| 0.2 | 2026-01-15 | Added Section 6: Shipping Revenue, DPP vs Evidence Package economics |
| 0.1 | 2026-01-15 | Initial draft from BUSINESS_MODEL.md review |
