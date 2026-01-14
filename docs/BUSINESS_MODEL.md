# EuroComply Business Model

## Value Proposition

EuroComply is a **Unified Product Lifecycle & Compliance Platform** combining Product Lifecycle Management (PLM), ERP-lite Operations, Product Information Management (PIM), and Digital Product Passport (DPP) capabilities in a single, integrated solution for SMEs and mid-market companies.

**Core Value**: Help brands and manufacturers meet EU Digital Product Passport (ESPR) requirements while gaining a complete product management platform at SME-accessible pricing.

**Unique Differentiator**: One platform replaces four separate tools (PLM + ERP + PIM + DPP), with native compliance built-in rather than as an add-on.

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLATFORM VALUE SUMMARY                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  • Design Workspace (PLM): Product registry, materials, BOMs    │
│  • Operations Workspace (ERP-lite): Item tracking, inventory    │
│  • Marketing Workspace (PIM): Product content, DAM, syndication │
│  • Compliance Workspace (DPP): Passport issuance, attestation   │
│  • Full platform access at all tiers (unlimited users/SKUs)     │
│  • Per-DPP pricing scales with your actual compliance output    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Customer Segments

### Target Customers

EuroComply targets SMEs and mid-market organizations who:

1. **Own-brand products** - Have products they design, manufacture, or private-label
2. **EU market presence** - Sell products in the EU market (directly or through retailers)
3. **ESPR scope** - Products fall under ESPR categories (textiles, electronics, batteries, furniture, etc.)
4. **Need unified solution** - Want PLM + PIM + DPP without enterprise complexity or cost

### Tier Profiles

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER SEGMENTS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STARTER (€79/month base + per-DPP)                             │
│  ├── Company size: Micro-businesses, startups                   │
│  ├── SKU count: 1-100 products                                  │
│  ├── DPP volume: 100-10K DPPs/year                              │
│  ├── Use case: First ESPR compliance, testing waters            │
│  └── Example: Small fashion label, local furniture maker        │
│                                                                  │
│  GROWTH (€199/month base + per-DPP)                             │
│  ├── Company size: Small businesses                             │
│  ├── SKU count: 100-2,000 products                              │
│  ├── DPP volume: 10K-100K DPPs/year                             │
│  ├── Use case: Growing brand with product-level DPPs            │
│  └── Example: Fashion brand, homeware manufacturer              │
│                                                                  │
│  SCALE (€599/month base + per-DPP)                              │
│  ├── Company size: Mid-market                                   │
│  ├── SKU count: 2,000-20,000 products                           │
│  ├── DPP volume: 100K-5M DPPs/year                              │
│  ├── Use case: Item-level tracking, serialized products         │
│  └── Example: Electronics brand, industrial equipment           │
│                                                                  │
│  ENTERPRISE (€1,499/month base + per-DPP)                       │
│  ├── Company size: Large mid-market                             │
│  ├── SKU count: 20,000+ products                                │
│  ├── DPP volume: 5M-100M DPPs/year                              │
│  ├── Use case: High-volume serialization, supply chain tracking │
│  └── Example: Battery manufacturer, large electronics OEM       │
│                                                                  │
│  PLATFORM (Custom pricing)                                      │
│  ├── Company size: Large enterprise                             │
│  ├── SKU count: Unlimited                                       │
│  ├── DPP volume: 100M+ DPPs/year                                │
│  ├── Use case: Dedicated infrastructure, custom SLAs            │
│  └── Example: Automotive OEM, multinational manufacturer        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Industry DPP Volume Patterns

Understanding that DPPs can be issued at **product level** (per-GTIN) or **item level** (per-serial-number) is critical to our pricing model:

| Industry | DPP Level | Typical Ratios | Example |
|----------|-----------|----------------|---------|
| **Textiles (Fashion)** | Product | 1 DPP per SKU | 500 SKUs = 500 DPPs/year |
| **Textiles (Fast Fashion)** | Mixed | 1 DPP per SKU, batch tracking | 2,000 SKUs = 10K DPPs/year |
| **Furniture** | Product | 1 DPP per model | 200 SKUs = 200 DPPs/year |
| **Electronics (Consumer)** | Mixed | 1 DPP per SKU + batch | 1,000 SKUs = 50K DPPs/year |
| **Electronics (Industrial)** | Item | 1 DPP per serial number | 100 SKUs = 500K DPPs/year |
| **Batteries** | Item | 1 DPP per cell/pack | 50 SKUs = 10M DPPs/year |
| **Automotive Parts** | Item | 1 DPP per component | 5,000 SKUs = 100M DPPs/year |

**Key Insight**: Industries with lifecycle tracking requirements (EPCIS events, recycling, warranty) issue DPPs at the **item level**, creating potentially millions or billions of DPPs per customer.

---

## Pricing Model

### Base Fee + Per-DPP Pricing

EuroComply uses a **Base Fee + Per-DPP** pricing model that separates platform access from compliance output:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRICING STRUCTURE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WHAT THE BASE FEE COVERS:                                      │
│  ├── Full platform access (all 4 workspaces)                    │
│  ├── Unlimited products/SKUs (no catalog size limits)           │
│  ├── Unlimited users                                            │
│  ├── PLM/PIM/ERP data storage (product specs, BOMs, content)    │
│  ├── API access and webhooks                                    │
│  └── Support level (varies by tier)                             │
│                                                                  │
│  WHAT THE PER-DPP FEE COVERS:                                   │
│  ├── DPP generation compute                                     │
│  ├── W3C Verifiable Credential issuance                         │
│  ├── QR code generation (GS1 Digital Link)                      │
│  ├── R2 storage for static DPP files                            │
│  ├── 10-year serving via Cloudflare edge                        │
│  └── EPCIS lifecycle events (included, not charged separately)  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Pricing Tiers

| Tier | Base Fee | Storage Included | Starting DPP Price | Volume Discounts |
|------|----------|------------------|-------------------|------------------|
| **Starter** | €79/mo | 10 GB | €0.10/DPP | 10K+: €0.08 |
| **Growth** | €199/mo | 50 GB | €0.05/DPP | 50K+: €0.03, 100K+: €0.02 |
| **Scale** | €599/mo | 200 GB | €0.02/DPP | 500K+: €0.01, 1M+: €0.008 |
| **Enterprise** | €1,499/mo | 1 TB | €0.008/DPP | 5M+: €0.005, 10M+: €0.003 |
| **Platform** | Custom | Custom | €0.001-0.003/DPP | Negotiated |

### Volume Discount Details

Each tier has built-in volume discount thresholds that automatically apply as monthly DPP volume increases:

```
┌─────────────────────────────────────────────────────────────────┐
│                    VOLUME DISCOUNT THRESHOLDS                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STARTER (€0.10 base per DPP):                                  │
│  └─ 10K+ DPPs/month: €0.08/DPP (20% discount)                   │
│                                                                  │
│  GROWTH (€0.05 base per DPP):                                   │
│  ├─ 50K+ DPPs/month: €0.03/DPP (40% discount)                   │
│  └─ 100K+ DPPs/month: €0.02/DPP (60% discount)                  │
│                                                                  │
│  SCALE (€0.02 base per DPP):                                    │
│  ├─ 500K+ DPPs/month: €0.01/DPP (50% discount)                  │
│  └─ 1M+ DPPs/month: €0.008/DPP (60% discount)                   │
│                                                                  │
│  ENTERPRISE (€0.008 base per DPP):                              │
│  ├─ 5M+ DPPs/month: €0.005/DPP (37% discount)                   │
│  └─ 10M+ DPPs/month: €0.003/DPP (62% discount)                  │
│                                                                  │
│  PLATFORM (Custom):                                             │
│  └─ 100M+ DPPs/month: €0.001/DPP or lower (negotiated)          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Hybrid Model Rationale**: The tier sets the starting per-DPP price (reflecting support costs and customer profile), while volume discounts reward high-volume usage within each tier. This prevents "race to bottom" pricing while still being competitive for high-volume customers.

### Annual Pricing

20% discount on base fees for annual prepayment:

| Tier | Monthly | Annual | Annual Savings |
|------|---------|--------|----------------|
| Starter | €79/mo | €758/year | €190/year |
| Growth | €199/mo | €1,910/year | €478/year |
| Scale | €599/mo | €5,750/year | €1,438/year |
| Enterprise | €1,499/mo | €14,390/year | €3,598/year |

*Per-DPP fees are always billed monthly based on actual usage.*

---

## Feature Comparison

All tiers include full platform access. Differences are in storage, support, and per-DPP pricing:

| Feature | Starter | Growth | Scale | Enterprise | Platform |
|---------|---------|--------|-------|------------|----------|
| **Platform Access** | | | | | |
| Design Workspace (PLM) | Full | Full | Full | Full | Full |
| Operations Workspace | Full | Full | Full | Full | Full |
| Marketing Workspace (PIM) | Full | Full | Full | Full | Full |
| Compliance Workspace (DPP) | Full | Full | Full | Full | Full |
| **Limits** | | | | | |
| Products/SKUs | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |
| Users | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |
| Storage Included | 10 GB | 50 GB | 200 GB | 1 TB | Custom |
| API Rate Limit | 100/min | 500/min | 2,000/min | 10,000/min | Custom |
| **DPP Pricing** | | | | | |
| Base DPP Price | €0.10 | €0.05 | €0.02 | €0.008 | Custom |
| Volume Discounts | 10K+ | 50K+, 100K+ | 500K+, 1M+ | 5M+, 10M+ | Negotiated |
| EPCIS Events | Included | Included | Included | Included | Included |
| **Support** | | | | | |
| Email Support | Yes | Yes | Yes | Yes | Yes |
| Priority Support | No | No | Yes | Yes | Yes |
| Phone Support | No | No | No | Yes | Yes |
| Dedicated CSM | No | No | No | Yes | Yes |
| **SLAs** | | | | | |
| Uptime SLA | 99.5% | 99.5% | 99.9% | 99.95% | Custom |
| Response Time SLA | No | No | 4 hours | 1 hour | Custom |
| **Advanced** | | | | | |
| SSO/SAML | No | No | Add-on | Included | Included |
| Custom Domain | No | No | Add-on | Included | Included |
| Dedicated Resources | No | No | No | No | Yes |
| Custom Integrations | No | No | No | Yes | Yes |

### Add-ons (Scale tier)

| Add-on | Price |
|--------|-------|
| SSO/SAML | €99/month |
| Custom Domain | €49/month |
| Additional Storage (100 GB) | €29/month |

---

## Revenue Examples

### Example 1: Small Textile Brand (Growth Tier)

```
Scenario: Fashion brand with 500 SKUs, product-level DPPs only
- Products: 500 SKUs (unlimited, no extra cost)
- DPPs/year: 500 (one per SKU)
- Monthly DPPs: ~42

Monthly Bill:
  Base fee:     €199
  DPPs:         42 × €0.05 = €2.10
  ─────────────────────────────
  TOTAL:        €201.10/month

Annual: €2,413
```

### Example 2: Electronics Manufacturer (Scale Tier)

```
Scenario: Consumer electronics with serialized items
- Products: 2,000 SKUs
- Items manufactured: 500,000/year
- DPPs/year: 500,000 (item-level)
- Monthly DPPs: ~42,000

Monthly Bill:
  Base fee:     €599
  DPPs:         42,000 × €0.02 = €840
  ─────────────────────────────────
  TOTAL:        €1,439/month

Annual: €17,268
```

### Example 3: Battery Cell Manufacturer (Enterprise Tier)

```
Scenario: EV battery manufacturer with cell-level tracking
- Products: 100 SKUs (cell types)
- Cells manufactured: 50M/year
- DPPs/year: 50M (each cell gets DPP with lifecycle)
- Monthly DPPs: ~4.2M

Monthly Bill (with volume discounts):
  Base fee:           €1,499
  First 5M DPPs:      5,000,000 × €0.008 = €40,000
  Remaining DPPs:     (4.2M - 4.2M first month doesn't exceed 5M)
  Actually: 4.2M all at €0.008 = €33,600
  ─────────────────────────────────────────────
  TOTAL:              €35,099/month

Annual: €421,188

At scale (hitting 10M+ DPPs/month):
  Base fee:           €1,499
  DPPs at €0.003:     10,000,000 × €0.003 = €30,000
  ───────────────────────────────────────────────
  TOTAL:              €31,499/month
```

### Example 4: Automotive Supplier (Platform Tier)

```
Scenario: Tier 1 automotive supplier with component tracking
- Products: 5,000 SKUs
- Components manufactured: 500M/year
- DPPs/year: 500M
- Monthly DPPs: ~42M

Monthly Bill (negotiated Platform pricing):
  Base fee:           €5,000 (custom)
  DPPs at €0.001:     42,000,000 × €0.001 = €42,000
  ───────────────────────────────────────────────
  TOTAL:              €47,000/month

Annual: €564,000
```

---

## Revenue Projections

### Year 5 Scenario Analysis

**Conservative Scenario** (Product-level DPPs dominate):
```
Assumptions:
- 8,000 customers (mix of tiers)
- Average 100K DPPs/customer/year = 800M total DPPs
- Average effective DPP price: €0.015/DPP (blended)

Revenue:
  Base fees: 8K × €400 avg × 12 = €38.4M
  DPP revenue: 800M × €0.015 = €12M
  ──────────────────────────────────────
  Total ARR: €50.4M
```

**Expected Scenario** (Item-level adoption grows):
```
Assumptions:
- 6,000 customers
- Average 2M DPPs/customer/year = 12B total DPPs
- Average effective DPP price: €0.008/DPP

Revenue:
  Base fees: 6K × €600 avg × 12 = €43.2M
  DPP revenue: 12B × €0.008 = €96M
  ──────────────────────────────────────
  Total ARR: €139.2M
```

**Optimistic Scenario** (Large manufacturers adopt):
```
Assumptions:
- 4,000 customers
- Average 25M DPPs/customer/year = 100B total DPPs
- Average effective DPP price: €0.003/DPP

Revenue:
  Base fees: 4K × €1,000 avg × 12 = €48M
  DPP revenue: 100B × €0.003 = €300M
  ──────────────────────────────────────
  Total ARR: €348M
```

### Year-by-Year Projections (Expected Scenario)

| Year | Customers | Avg DPPs/Customer | Total DPPs | Base ARR | DPP ARR | Total ARR |
|------|-----------|-------------------|------------|----------|---------|-----------|
| 2025 | 300 | 50K | 15M | €1.1M | €0.5M | €1.6M |
| 2026 | 1,000 | 200K | 200M | €3.6M | €2.4M | €6.0M |
| 2027 | 2,500 | 500K | 1.25B | €9.0M | €12.5M | €21.5M |
| 2028 | 4,500 | 1.5M | 6.75B | €19.4M | €47.3M | €66.7M |
| 2029 | 6,000 | 2M | 12B | €43.2M | €96.0M | €139.2M |

### Revenue Composition Shift

The per-DPP model creates a significant shift in revenue composition:

```
┌─────────────────────────────────────────────────────────────────┐
│                    REVENUE COMPOSITION EVOLUTION                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  YEAR 1 (2025):                                                 │
│  ├── Base fees: 69%                                             │
│  ├── DPP revenue: 31%                                           │
│  └── (Product-level DPPs dominate)                              │
│                                                                  │
│  YEAR 3 (2027):                                                 │
│  ├── Base fees: 42%                                             │
│  ├── DPP revenue: 58%                                           │
│  └── (Item-level tracking adoption grows)                       │
│                                                                  │
│  YEAR 5 (2029):                                                 │
│  ├── Base fees: 31%                                             │
│  ├── DPP revenue: 69%                                           │
│  └── (High-volume manufacturers dominate DPP revenue)           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Customer Tier Distribution (Year 5)

| Tier | Customers | % of Base | Base MRR | DPP MRR | Total MRR |
|------|-----------|-----------|----------|---------|-----------|
| Starter | 1,800 | 30% | €142K | €36K | €178K |
| Growth | 2,400 | 40% | €478K | €240K | €718K |
| Scale | 1,200 | 20% | €719K | €1.2M | €1.9M |
| Enterprise | 540 | 9% | €809K | €4.3M | €5.1M |
| Platform | 60 | 1% | €300K | €2.3M | €2.6M |
| **Total** | **6,000** | **100%** | **€2.45M** | **€8.08M** | **€10.5M** |

*Monthly figures. Annual × 12 = €126M (excluding services)*

---

## Unit Economics

### Per-DPP Cost Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    DPP COST BREAKDOWN                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DPP GENERATION (one-time):                                     │
│  ├── VC computation (Lambda/ECS): €0.0001                       │
│  ├── QR code generation: €0.00001                               │
│  └── Subtotal: ~€0.0001                                         │
│                                                                  │
│  10-YEAR STORAGE (R2):                                          │
│  ├── Static DPP file (10KB): €0.0018 over 10 years              │
│  ├── Product images (2MB avg): €0.36 over 10 years              │
│  └── Subtotal: ~€0.002-0.36 (varies by content)                 │
│                                                                  │
│  SERVING (Cloudflare):                                          │
│  ├── CDN bandwidth: €0 (R2 has zero egress)                     │
│  ├── Worker invocations: ~€0.0001/scan                          │
│  └── Subtotal: ~€0 (amortized)                                  │
│                                                                  │
│  TOTAL COST PER DPP: €0.001-0.002 (minimal content)             │
│                      €0.002-0.40 (with rich media)              │
│                                                                  │
│  BLENDED AVERAGE: ~€0.001/DPP at scale                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Gross Margin by Tier

| Tier | DPP Price | Est. Cost/DPP | Gross Margin |
|------|-----------|---------------|--------------|
| Starter | €0.10 | €0.001 | **99%** |
| Growth | €0.05 | €0.001 | **98%** |
| Scale | €0.02 | €0.001 | **95%** |
| Enterprise | €0.008 | €0.001 | **87.5%** |
| Platform | €0.001-0.003 | €0.001 | **0-67%** |

**Key Insight**: Even at the lowest Platform pricing (€0.001/DPP), margins remain positive. At higher tiers, DPP revenue is extremely profitable.

### Overall Unit Economics

| Metric | Value |
|--------|-------|
| Average Revenue Per User (ARPU) | €970/month |
| Base Fee ARPU | €300/month |
| DPP ARPU | €670/month |
| Customer Acquisition Cost (CAC) | €1,200 |
| Lifetime Value (LTV) | €34,920 (36 months) |
| LTV:CAC Ratio | 29x |
| Gross Margin (Base) | 95% |
| Gross Margin (DPP) | 90% average |
| Blended Gross Margin | 92% |
| Monthly Churn | 1.5% |

### Year 5 Operating Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    YEAR 5 OPERATING MODEL                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  REVENUE (Expected Scenario)                                    │
│  Base subscriptions:            €43,200,000                     │
│  DPP revenue:                   €96,000,000                     │
│  Services:                      €5,000,000                      │
│  ─────────────────────────────────────────                      │
│  TOTAL REVENUE:                 €144,200,000                    │
│                                                                  │
│  COST OF REVENUE                                                │
│  AWS Infrastructure:            €2,000,000                      │
│  Cloudflare (R2, Workers):      €1,500,000                      │
│  Third-party services:          €500,000                        │
│  DPP generation costs:          €12,000,000 (12B × €0.001)      │
│  ─────────────────────────────────────────                      │
│  TOTAL COGS:                    €16,000,000                     │
│                                                                  │
│  GROSS PROFIT:                  €128,200,000 (88.9% margin)     │
│                                                                  │
│  OPERATING EXPENSES                                             │
│  Engineering (100 people):      €12,000,000                     │
│  Sales & Marketing (80 people): €10,000,000                     │
│  Customer Success (40 people):  €4,000,000                      │
│  G&A (30 people):               €4,000,000                      │
│  Other OpEx:                    €2,000,000                      │
│  ─────────────────────────────────────────                      │
│  TOTAL OPEX:                    €32,000,000                     │
│                                                                  │
│  OPERATING INCOME (EBITDA):     €96,200,000 (66.7% margin)      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5-Year Financial Summary

| Year | Customers | Base ARR | DPP ARR | Total ARR | Gross Margin | EBITDA |
|------|-----------|----------|---------|-----------|--------------|--------|
| 2025 | 300 | €1.1M | €0.5M | €1.6M | 90% | -€1.5M |
| 2026 | 1,000 | €3.6M | €2.4M | €6.0M | 91% | €0.5M |
| 2027 | 2,500 | €9.0M | €12.5M | €21.5M | 91% | €8M |
| 2028 | 4,500 | €19.4M | €47.3M | €66.7M | 90% | €35M |
| 2029 | 6,000 | €43.2M | €96.0M | €139.2M | 89% | €96M |

**Year 5 Valuation (8x ARR): ~€1.1B**

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
│  • Monthly base: €199                                           │
│  • DPPs (20K/year): ~€1,000                                     │
│  • Total Year 1: €3,388                                         │
│  • Full platform access from day 1                              │
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
│                    REVENUE COMPOSITION (Year 5)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  31% Base Subscription Revenue                                  │
│  ├── Monthly/Annual platform fees                               │
│  └── Predictable, recurring foundation                          │
│                                                                  │
│  67% Per-DPP Revenue                                            │
│  ├── Volume-based DPP issuance fees                            │
│  ├── Scales with customer compliance output                     │
│  └── Primary growth driver                                      │
│                                                                  │
│  2% Services Revenue                                            │
│  ├── Enterprise onboarding                                      │
│  ├── Custom integrations                                        │
│  └── One-time or project-based                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### The "Money Machine" Economics

At scale, cost per DPP is ~€0.001 (R2 storage + compute). Margin profile:

| DPP Price | Cost | Gross Margin |
|-----------|------|--------------|
| €0.10 | €0.001 | **99%** |
| €0.05 | €0.001 | **98%** |
| €0.02 | €0.001 | **95%** |
| €0.008 | €0.001 | **87.5%** |
| €0.003 | €0.001 | **67%** |
| €0.001 | €0.001 | **0%** (volume play) |

Even at the lowest negotiated Platform pricing, DPP revenue remains profitable or break-even, while the base subscription ensures platform profitability.

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
| Batteries | 10,000 | 2027 | €500M |
| **Total** | **883,000** | | **€1.7B** |

*TAM includes both platform fees and per-DPP revenue potential*

### Serviceable Market

Targeting SMEs and mid-market companies who:
- Have own-brand products
- Sell in EU market
- Need unified PLM + PIM + DPP solution
- Can't afford enterprise solutions

**SAM**: ~60,000 companies = €200M+ annual opportunity

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
    │          │         │           └── Volume growth (more DPPs = more revenue)
    │          │         └── Subscribe (tier based on support/storage needs)
    │          └── 14-day free trial (full platform access, 100 DPPs free)
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
| **SME Unified (PLM + ERP + PIM + DPP)** | EuroComply | €948-18k+/year | **Leader** |
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
| SME pricing | Unaffordable | Too expensive | Affordable | €79-599/mo base |
| Per-DPP pricing | N/A | N/A | Some | Native |
| Setup time | Months | Weeks | Days | Same day |

### The EuroComply Advantage

**One platform replaces four tools:**

| Traditional Approach | EuroComply Equivalent |
|---------------------|----------------------|
| Entry-level PLM (€500-2k/mo) | Design Workspace (Registry, Materials) |
| Basic ERP/Inventory (€200-1k/mo) | Operations Workspace (Item Tracking, Inventory) |
| Entry-level PIM (€300-1.5k/mo) | Marketing Workspace (PIM, DAM, Syndication) |
| Compliance consultants (€5-20k one-time) | Compliance Workspace (DPP, Attestation) |
| **Total: €1,000-4,500+/mo** | **EuroComply: €79-599/mo base + per-DPP** |

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
| **Cost** | €99/year or €500 one-time (per 10,000 DPPs) |
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
| Customers | 300 | 1,000 | 2,500 |
| Base ARR | €1.1M | €3.6M | €9.0M |
| DPP ARR | €0.5M | €2.4M | €12.5M |
| Total ARR | €1.6M | €6.0M | €21.5M |
| Gross Margin | 90% | 91% | 91% |
| Headcount | 12 | 25 | 50 |

### Revenue by Tier (Year 3)

| Tier | Customers | % of Base | Base MRR | DPP MRR | Total MRR |
|------|-----------|-----------|----------|---------|-----------|
| Starter | 750 | 30% | €59K | €30K | €89K |
| Growth | 1,125 | 45% | €224K | €225K | €449K |
| Scale | 500 | 20% | €300K | €500K | €800K |
| Enterprise | 115 | 4.5% | €172K | €287K | €459K |
| Platform | 10 | 0.5% | €50K | €100K | €150K |
| **Total** | **2,500** | **100%** | **€805K** | **€1,142K** | **€1,947K** |

*Monthly figures. Annual × 12 = €23.4M (including month-over-month growth within year)*

---

## Key Success Metrics

### North Star Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **DPPs Issued** | Total DPPs generated | 1B by Year 3 |
| **Active Products** | Products managed in platform | 2M by Year 3 |
| **Completeness Score** | Avg product data completeness | 85% |

### Operational Metrics

| Category | Metric | Target |
|----------|--------|--------|
| Growth | MRR Growth Rate | 12% MoM |
| Retention | Net Revenue Retention | 130% |
| Efficiency | CAC Payback Period | 3 months |
| Engagement | Weekly Active Users | 75% |

---

## Risk Factors

### Market Risks

| Risk | Mitigation |
|------|------------|
| ESPR delays | Build PIM value independent of compliance |
| Competition from incumbents | Focus on SME segment they ignore |
| Economic downturn | Essential compliance spend, not discretionary |
| Price pressure on DPPs | Volume discounts already built in, margins remain healthy |

### Operational Risks

| Risk | Mitigation |
|------|------------|
| Technical complexity | Modular architecture, incremental delivery |
| Customer churn | Strong onboarding, success team |
| Scaling challenges | Cloud-native infrastructure, DynamoDB for billions of items |
| DPP volume spikes | Auto-scaling infrastructure, async processing |

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
│  distributors) requiring ESPR compliance without enterprise-   │
│  level investment. Industries with item-level DPP requirements │
│  (batteries, electronics, automotive) are high-value targets.  │
│                                                                  │
│  PRICING STRUCTURE                                              │
│  Base Fee + Per-DPP model:                                      │
│  • Starter: €79/mo base + €0.10/DPP                            │
│  • Growth: €199/mo base + €0.05/DPP                            │
│  • Scale: €599/mo base + €0.02/DPP                             │
│  • Enterprise: €1,499/mo base + €0.008/DPP                     │
│  • Platform: Custom base + €0.001-0.003/DPP                    │
│                                                                  │
│  All tiers: Unlimited products/SKUs, unlimited users           │
│  Volume discounts unlock at tier-specific thresholds           │
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
│  • SME-accessible price point (95% cheaper than alternatives)  │
│  • Per-DPP pricing scales with compliance output               │
│  • Same-day setup (no implementation project)                  │
│                                                                  │
│  UNIT ECONOMICS (from Architecture Doc v1.3)                    │
│  • Base fee gross margin: 95%                                  │
│  • DPP gross margin: 87-99% depending on tier                  │
│  • Infrastructure base cost: €158/month                        │
│  • Per-DPP cost: ~€0.001 at scale                              │
│  • Primary cost driver: personnel (support, development)       │
│                                                                  │
│  REVENUE POTENTIAL                                              │
│  • Year 5 ARR (Expected): €139M                                │
│  • Revenue mix: 31% base fees, 67% DPP revenue, 2% services    │
│  • High-volume customers drive majority of DPP revenue         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last Updated: January 14, 2026*
