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

### Customer Segments

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER SEGMENTS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SEGMENT A: DPP-ONLY CUSTOMERS                                  │
│  ─────────────────────────────                                  │
│  Already have product data managed elsewhere (ERP, spreadsheets,│
│  existing PIM). Just need the compliance layer.                 │
│                                                                  │
│  • Compliance-Only: Has data elsewhere, needs DPP output        │
│  • Compliance-Growth: Some data management, growing needs       │
│                                                                  │
│  SEGMENT B: PIM + DPP CUSTOMERS                                 │
│  ─────────────────────────────                                  │
│  Need both product data management AND compliance.              │
│  Single platform for everything.                                │
│                                                                  │
│  • PIM-Lite: Small catalog, wants one tool for everything       │
│  • PIM-Pro: Larger catalog, needs AI import, multi-channel      │
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

### Tier Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EUROCOMPLY PRICING TIERS                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DPP TRACK (Compliance-focused)                                             │
│  ───────────────────────────────                                            │
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐                                │
│  │  DPP STARTER    │     │ DPP PROFESSIONAL│                                │
│  │  €29/mo         │ ──► │ €99/mo          │                                │
│  │  100 products   │     │ 1,000 products  │                                │
│  │  Generate DPPs  │     │ + Basic PIM     │                                │
│  │  30-day edit    │     │ + Limited AI    │                                │
│  │  Unlimited users│     │ + Attestation   │                                │
│  └─────────────────┘     └─────────────────┘                                │
│                                   │                                          │
│                                   ▼                                          │
│  PIM TRACK (Full platform)                                                  │
│  ─────────────────────────                                                  │
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │  PIM + DPP      │     │ PIM + DPP       │     │  ENTERPRISE     │       │
│  │  STANDARD       │ ──► │ GROWTH          │ ──► │                 │       │
│  │  €199/mo        │     │ €499/mo         │     │ Custom          │       │
│  │  5,000 products │     │ 25,000 products │     │ 100k+ products  │       │
│  │  Full PIM       │     │ + Higher limits │     │ + SLA           │       │
│  │  Full AI Import │     │ + Priority      │     │ + Custom        │       │
│  │  Shopify Sync   │     │                 │     │                 │       │
│  │  Unlimited users│     │ Unlimited users │     │ Unlimited users │       │
│  │  API Access     │     │                 │     │                 │       │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Pricing Table

| Plan | Monthly | Annual (2 months free) | Products | Users |
|------|---------|------------------------|----------|-------|
| **DPP Starter** | €29 | €290/year (€24/mo) | 100 | Unlimited |
| **DPP Professional** | €99 | €990/year (€82/mo) | 1,000 | Unlimited |
| **PIM + DPP Standard** | €199 | €1,990/year (€166/mo) | 5,000 | Unlimited |
| **PIM + DPP Growth** | €499 | €4,990/year (€416/mo) | 25,000 | Unlimited |
| **Enterprise** | Custom | Custom | 100,000+ | Unlimited |

### Feature Matrix

| Feature | DPP Starter | DPP Pro | PIM Standard | PIM Growth | Enterprise |
|---------|:-----------:|:-------:|:------------:|:----------:|:----------:|
| **COMPLIANCE** | | | | | |
| DPP Generation | ✓ | ✓ | ✓ | ✓ | ✓ |
| VC Issuance (did:key) | ✓ | ✓ | ✓ | ✓ | ✓ |
| QR Code Generation | ✓ | ✓ | ✓ | ✓ | ✓ |
| Public Verification | ✓ | ✓ | ✓ | ✓ | ✓ |
| EBSI Anchoring (when available) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Attestation (Multi-Party) | - | ✓ | ✓ | ✓ | ✓ |
| | | | | | |
| **PRODUCT MANAGEMENT** | | | | | |
| Editing Window | 30 days | Permanent | Permanent | Permanent | Permanent |
| DPP Hosting | Permanent | Permanent | Permanent | Permanent | Permanent |
| Product Families | - | Basic (3) | Unlimited | Unlimited | Unlimited |
| Variants | - | ✓ | ✓ | ✓ | ✓ |
| Completeness Scoring | - | ✓ | ✓ | ✓ | ✓ |
| Bulk Operations | - | - | ✓ | ✓ | ✓ |
| Export (CSV/JSON) | - | - | ✓ | ✓ | ✓ |
| Audit Log | - | - | ✓ | ✓ | ✓ |
| | | | | | |
| **DAM** | | | | | |
| Image Upload | 5/product | 10/product | 20/product | 50/product | Unlimited |
| Storage | 1 GB | 10 GB | 50 GB | 200 GB | Custom |
| CDN Delivery | ✓ | ✓ | ✓ | ✓ | ✓ |
| | | | | | |
| **IMPORT** | | | | | |
| Manual Entry | ✓ | ✓ | ✓ | ✓ | ✓ |
| CSV Import | - | ✓ | ✓ | ✓ | ✓ |
| AI Import (Claude) | - | 20/month | Unlimited | Unlimited | Unlimited |
| | | | | | |
| **INTEGRATIONS** | | | | | |
| Shopify Sync | - | - | ✓ | ✓ | ✓ |
| API Access | - | - | ✓ | ✓ | ✓ |
| Webhooks | - | - | - | ✓ | ✓ |
| Custom Integrations | - | - | - | - | ✓ |
| | | | | | |
| **SUPPORT** | | | | | |
| Email Support | ✓ | ✓ | ✓ | ✓ | ✓ |
| Priority Support | - | - | ✓ | ✓ | ✓ |
| Dedicated Success | - | - | - | - | ✓ |
| SLA | - | - | - | 99.5% | 99.9% |

### Tier Differentiation Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  WHAT DIFFERENTIATES EACH TIER                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DPP STARTER → DPP PROFESSIONAL                                 │
│  • Editing window (30 days → permanent)                         │
│  • Basic PIM (3 families, variants, completeness)               │
│  • CSV import + 20 AI imports/month                             │
│  • Multi-party attestation                                       │
│                                                                  │
│  DPP PROFESSIONAL → PIM STANDARD                                │
│  • More products (1,000 → 5,000)                                │
│  • Unlimited product families                                    │
│  • Unlimited AI imports                                          │
│  • Bulk operations, export, audit log                           │
│  • Shopify sync + API access                                    │
│                                                                  │
│  PIM STANDARD → PIM GROWTH                                      │
│  • More products (5,000 → 25,000)                               │
│  • Webhooks for real-time integrations                          │
│  • SLA guarantee (99.5%)                                        │
│                                                                  │
│  PIM GROWTH → ENTERPRISE                                        │
│  • More products (25,000 → 100,000+)                            │
│  • Custom integrations                                           │
│  • Dedicated success manager                                     │
│  • Higher SLA (99.9%)                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### DPP Starter: Edit Window Model

```
┌─────────────────────────────────────────────────────────────────┐
│  DPP STARTER - HOW IT WORKS                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ACTIVE PERIOD (30 days after DPP creation)                     │
│  ─────────────────────────────────────────                      │
│  1. User enters product data (manual form)                      │
│  2. User uploads images                                          │
│  3. System generates DPP + VC + QR code                         │
│  4. User can edit, update, regenerate DPP                       │
│  5. User downloads complete package:                             │
│     • DPP data (JSON-LD)                                        │
│     • Verifiable Credential (JWT)                               │
│     • QR code (PNG/SVG)                                         │
│     • Public verification URL                                    │
│                                                                  │
│  AFTER 30 DAYS (automatic transition to "Published" state)      │
│  ─────────────────────────────────────────────────────────      │
│  • Public DPP page: STAYS LIVE (10+ years, ESPR compliant)      │
│  • QR code resolver: KEEPS WORKING FOREVER                      │
│  • JSON-LD/VC: PERMANENTLY HOSTED via CDN                       │
│  • Images: ALL KEPT (original quality, CDN-served)              │
│  • Editing: DISABLED (upgrade to edit again)                    │
│                                                                  │
│  WHY THIS WORKS                                                  │
│  ─────────────                                                  │
│  ESPR requires DPP data to be accessible for product lifetime.  │
│  Deleting data would break QR codes → non-compliance.           │
│  We keep public-facing data forever; only editing is limited.   │
│                                                                  │
│  UPGRADE PATH                                                    │
│  → DPP Professional (€99/mo): Re-enables editing for all DPPs   │
│  → Or create new DPP (counts against 100 product limit)         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Volume Pricing (Beyond Included Products)

| Tier | Included | Overage Price | Volume Discount |
|------|----------|---------------|-----------------|
| DPP Starter | 100 | €0.50/product/mo | - |
| DPP Professional | 1,000 | €0.20/product/mo | 2,000+: €0.15 |
| PIM Standard | 5,000 | €0.10/product/mo | 10,000+: €0.08 |
| PIM Growth | 25,000 | €0.05/product/mo | 50,000+: €0.03 |
| Enterprise | 100,000+ | Custom | Volume-based |

**Example:** PIM Growth customer with 40,000 products
- 25,000 included in €499/mo
- 15,000 overage × €0.05 = €750/mo
- **Total: €1,249/mo**

### Add-ons

| Add-on | Price | Available For |
|--------|-------|---------------|
| Priority Support | €50/mo | DPP Starter, DPP Pro |
| API Access | €50/mo | DPP Pro only |
| Extra AI Imports | €5/10 imports | DPP Pro |
| Extra Storage | €5/10 GB | All tiers |

---

## Infrastructure Cost Analysis

### AWS Services Used

EuroComply runs on AWS with the following services:

| Service | Purpose |
|---------|---------|
| ECS Fargate | API servers, background workers, identity service |
| RDS PostgreSQL | Primary database |
| ElastiCache Redis | Session cache, rate limiting, job queue |
| S3 | Digital Asset Management (images, documents) |
| CloudFront | CDN for asset delivery |
| ALB | Load balancing |
| Route 53 | DNS |
| CloudWatch | Monitoring and logging |
| Secrets Manager | API keys, credentials |

### Compute: ECS Fargate

```
┌─────────────────────────────────────────────────────────────────┐
│  ECS FARGATE PRICING (eu-west-1)                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Per vCPU per hour:      $0.04048                               │
│  Per GB memory per hour: $0.004445                              │
│                                                                  │
│  API Server Task (always running):                              │
│  • 0.5 vCPU, 1GB RAM                                            │
│  • Monthly: 730 hours × ($0.04048 × 0.5 + $0.004445 × 1)        │
│  • = 730 × $0.024685 = $18.02/month per task                    │
│                                                                  │
│  Minimum setup (2 tasks for redundancy):                        │
│  • 2 × $18.02 = $36.04/month                                    │
│                                                                  │
│  Background workers (BullMQ - 1 task):                          │
│  • 0.25 vCPU, 0.5GB RAM = $9.01/month                          │
│                                                                  │
│  Identity service (walt.id - 1 task):                           │
│  • 0.25 vCPU, 0.5GB RAM = $9.01/month                          │
│                                                                  │
│  BASELINE COMPUTE: ~$72/month (~€67/month)                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Database: RDS PostgreSQL

```
┌─────────────────────────────────────────────────────────────────┐
│  RDS POSTGRESQL PRICING (eu-west-1)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INSTANCE PRICING                                               │
│  ─────────────────                                              │
│  db.t3.micro:  $0.018/hour × 730 = $13.14/month                │
│  db.t3.small:  $0.036/hour × 730 = $26.28/month                │
│  db.t3.medium: $0.072/hour × 730 = $52.56/month                │
│  db.r6g.large: $0.252/hour × 730 = $183.96/month               │
│                                                                  │
│  STORAGE (gp3): $0.114/GB/month                                 │
│                                                                  │
│  STORAGE PER PRODUCT                                            │
│  ─────────────────                                              │
│  • Product record: ~2KB (relational) + ~3KB (JSONB) = 5KB       │
│  • DPP/VC: ~8KB (JWT) + ~2KB (metadata) = 10KB                  │
│  • Total per product with DPP: ~15KB                            │
│                                                                  │
│  SCALE ESTIMATES                                                │
│  ─────────────────                                              │
│  • 1,000 products = 15MB                                        │
│  • 10,000 products = 150MB                                      │
│  • 100,000 products = 1.5GB                                     │
│  • 1,000,000 products = 15GB                                    │
│                                                                  │
│  SETUP BY SCALE                                                 │
│  ─────────────────                                              │
│  Starter:    db.t3.micro, 20GB   = ~$15/month                  │
│  Growth:     db.t3.small, 100GB  = ~$38/month                  │
│  Scale:      db.t3.medium Multi-AZ, 500GB = ~$219/month        │
│  Enterprise: db.r6g.large Multi-AZ, 2TB   = ~$824/month        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cache: ElastiCache Redis

```
┌─────────────────────────────────────────────────────────────────┐
│  ELASTICACHE REDIS PRICING (eu-west-1)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  cache.t3.micro (0.5GB):   $0.017/hour × 730 = $12.41/month    │
│  cache.t3.small (1.37GB):  $0.034/hour × 730 = $24.82/month    │
│  cache.t3.medium (3.09GB): $0.068/hour × 730 = $49.64/month    │
│                                                                  │
│  Usage: Session cache, rate limiting, BullMQ job queue          │
│  For <1000 customers: t3.micro sufficient                       │
│                                                                  │
│  BASELINE: ~$12/month (~€11/month)                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Storage: S3

```
┌─────────────────────────────────────────────────────────────────┐
│  S3 PRICING (eu-west-1)                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  S3 Standard Storage: $0.023/GB/month                           │
│                                                                  │
│  STORAGE PER PRODUCT (DAM)                                      │
│  ─────────────────────────                                      │
│  • Average 5 images per product                                 │
│  • Original: ~2MB each = 10MB                                   │
│  • Thumbnails (3 sizes): ~0.6MB                                 │
│  • Total per product: ~10.6MB                                   │
│                                                                  │
│  STORAGE COSTS                                                  │
│  ─────────────────────────                                      │
│  • 100 products = 1GB → $0.023/month                           │
│  • 1,000 products = 10GB → $0.23/month                         │
│  • 10,000 products = 100GB → $2.30/month                       │
│  • 100,000 products = 1TB → $23/month                          │
│  • 1,000,000 products = 10TB → $230/month                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### CDN: CloudFront

```
┌─────────────────────────────────────────────────────────────────┐
│  CLOUDFRONT PRICING                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Data Transfer Out (Europe):                                    │
│  • First 10TB: $0.085/GB                                        │
│  • Next 40TB: $0.080/GB                                         │
│                                                                  │
│  BANDWIDTH ESTIMATES                                            │
│  ─────────────────────────                                      │
│  • DPP verification page view: ~500KB (images + data)          │
│  • Product page (retailer widget): ~200KB                       │
│                                                                  │
│  SCALE ESTIMATES                                                │
│  ─────────────────────────                                      │
│  • 100 products, low traffic: ~$0.50/month                     │
│  • 1,000 products, moderate: ~$5/month                         │
│  • 10,000 products, moderate: ~$50/month                       │
│  • 100,000 products, high: ~$500/month                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Claude API (AI Import)

```
┌─────────────────────────────────────────────────────────────────┐
│  CLAUDE API PRICING (Haiku for extraction)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Claude 3 Haiku:                                                │
│  • Input: $0.25/million tokens                                  │
│  • Output: $1.25/million tokens                                 │
│                                                                  │
│  PER IMPORT OPERATION                                           │
│  ─────────────────────────                                      │
│  CSV/Excel mapping (1000 rows): ~$0.004 per import             │
│  PDF extraction (2 pages): ~$0.002 per document                │
│  Image extraction: ~$0.001 per image                           │
│                                                                  │
│  MONTHLY ESTIMATES                                              │
│  ─────────────────────────                                      │
│  • Light user (20 imports): ~$0.08/month                       │
│  • Medium user (100 imports): ~$0.40/month                     │
│  • Heavy user (500 imports): ~$2.00/month                      │
│                                                                  │
│  AI costs are negligible relative to subscription price         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Other AWS Services

```
┌─────────────────────────────────────────────────────────────────┐
│  OTHER AWS COSTS                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Route 53 (DNS): $0.50/month                                    │
│  ACM (SSL Certificates): Free                                   │
│  CloudWatch (Logs 10GB + Alarms): ~$6/month                    │
│  Secrets Manager (5 secrets): $2/month                         │
│  ALB (Load Balancer): ~$21/month                               │
│                                                                  │
│  MISC TOTAL: ~$30/month                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Total Infrastructure Cost by Scale

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE COST SUMMARY (Monthly, in USD)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        │ STARTUP    │ GROWTH     │ SCALE      │ ENTERPRISE │
│                        │ <100 cust  │ 100-500    │ 500-2000   │ 2000+      │
│  ──────────────────────┼────────────┼────────────┼────────────┼────────────│
│  ECS Fargate           │ $72        │ $108       │ $180       │ $360       │
│  RDS PostgreSQL        │ $15        │ $38        │ $219       │ $824       │
│  ElastiCache Redis     │ $12        │ $25        │ $50        │ $100       │
│  S3 Storage            │ $1         │ $5         │ $25        │ $250       │
│  CloudFront            │ $5         │ $25        │ $100       │ $500       │
│  ALB + Misc            │ $30        │ $35        │ $50        │ $100       │
│  ──────────────────────┼────────────┼────────────┼────────────┼────────────│
│  TOTAL                 │ $135       │ $236       │ $624       │ $2,134     │
│  (~EUR)                │ €125       │ €220       │ €580       │ €1,980     │
│                                                                              │
│  ──────────────────────────────────────────────────────────────────────────│
│                                                                              │
│  COST PER CUSTOMER                                                          │
│  ──────────────────────┼────────────┼────────────┼────────────┼────────────│
│  Customers             │ 50         │ 300        │ 1,000      │ 3,000      │
│  Infra per customer    │ €2.50      │ €0.73      │ €0.58      │ €0.66      │
│                                                                              │
│  Note: Per-customer infra cost drops dramatically with scale               │
│  Real costs are headcount (support, development) not infrastructure        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### DPP Hosting Economics (10-Year Lifetime)

ESPR requires DPP data to be accessible for the product's lifetime (typically 10+ years). Here's the true cost of hosting a DPP forever:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DPP HOSTING COST BREAKDOWN (Per DPP, 10-Year Lifetime)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STORAGE (What we keep for ALL published DPPs, all tiers)                   │
│  ──────────────────────────────────────────                                 │
│  Component              │ Size    │ Tier              │ 10-Year Cost        │
│  ───────────────────────┼─────────┼───────────────────┼─────────────────────│
│  JSON-LD/VC (public)    │ 5KB     │ S3 + CloudFront   │ $0.001              │
│  Original images        │ 2MB     │ S3 IA + CloudFront│ $0.005              │
│  Database record        │ 15KB    │ RDS PostgreSQL    │ $0.001              │
│  ───────────────────────┼─────────┼───────────────────┼─────────────────────│
│  TOTAL STORAGE          │ ~2MB    │                   │ ~$0.007             │
│                                                                              │
│  SIMPLE POLICY: All images kept at original quality for all tiers.          │
│  Cost difference vs deleting originals: ~$0.002/DPP (negligible)            │
│  Consumer experience: Full quality images forever                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### QR Code Scan Economics (CDN-First Architecture)

DPP pages are **static content** - they don't change after issuance. This enables aggressive CDN caching:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CDN CACHING ARCHITECTURE                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Consumer scans QR → CloudFront Edge (cached) → Response                    │
│                            │                                                 │
│                       Cache MISS (rare, ~0.1%)                              │
│                            │                                                 │
│                            ▼                                                 │
│                       S3 Origin                                              │
│                                                                              │
│  CACHE BEHAVIOR                                                             │
│  ─────────────────                                                          │
│  • Cache-Control: max-age=86400 (24 hours)                                  │
│  • Cache hit rate: 99.9%+ (static content)                                  │
│  • Edge locations: 400+ globally                                            │
│                                                                              │
│  COST PER SCAN                                                              │
│  ─────────────────                                                          │
│  • Cache HIT: $0.0000001 (request cost only)                                │
│  • Cache MISS: $0.000004 (request + origin fetch)                           │
│  • Effective average: ~$0.0000004 per scan                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Viral Product Scenario

What happens if a product goes viral with millions of scans?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  VIRAL PRODUCT COST ANALYSIS                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Scenario: Product goes viral, 10 million QR scans in one month             │
│                                                                              │
│  BREAKDOWN                                                                  │
│  ─────────────────────────────────────────────────────────────              │
│  Total scans:           10,000,000                                          │
│  Cache hit rate:        99.9%                                               │
│  Cache hits:            9,990,000  →  Served from edge, minimal cost        │
│  Cache misses:          10,000     →  Origin fetches                        │
│                                                                              │
│  Data per scan:         25KB (JSON + thumbnail)                             │
│  Total CDN transfer:    ~250GB                                              │
│                                                                              │
│  COST BREAKDOWN                                                             │
│  ─────────────────────────────────────────────────────────────              │
│  CDN data transfer:     250GB × $0.085/GB    = $21.25                       │
│  Request costs:         10M × $0.0000001     = $1.00                        │
│  Origin fetches:        10K × $0.0001        = $1.00                        │
│  ─────────────────────────────────────────────────────────────              │
│  TOTAL FOR 10M SCANS:                          ~$23                         │
│                                                                              │
│  Cost per scan: $0.0000023 (less than a thousandth of a cent)               │
│                                                                              │
│  EVEN MORE EXTREME: 100 million scans = ~$230                               │
│  Still negligible compared to subscription revenue                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Platform-Wide Scale Economics

At scale with millions of DPPs across thousands of customers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PLATFORM SCALE: 10 MILLION DPPs (10,000 customers × 1,000 avg)             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STORAGE COSTS (keeping ALL original images)                                │
│  ─────────────────────────────────────────────────────────────              │
│  Component              │ Total Size  │ Tier           │ Monthly Cost       │
│  ───────────────────────┼─────────────┼────────────────┼────────────────────│
│  Public JSON-LD files   │ 50GB        │ S3 Standard    │ $1.15              │
│  Original images        │ 20TB        │ S3 Infreq. Acc │ $250.00            │
│  Database               │ 150GB       │ RDS            │ Incl. in instance  │
│  ───────────────────────┼─────────────┼────────────────┼────────────────────│
│  TOTAL STORAGE          │ ~20TB       │                │ ~$251/month        │
│                                                                              │
│  BANDWIDTH (100M scans/month, 10 per DPP average)                           │
│  ─────────────────────────────────────────────────────────────              │
│  CDN transfer (2.5TB)   │             │ CloudFront     │ ~$215/month        │
│                                                                              │
│  TOTAL INFRASTRUCTURE FOR 10M DPPs                                          │
│  ─────────────────────────────────────────────────────────────              │
│  Storage + Bandwidth + Compute:                   ~$866/month               │
│                                                                              │
│  UNIT ECONOMICS                                                             │
│  ─────────────────────────────────────────────────────────────              │
│  Cost per DPP/month:         $0.00009                                       │
│  Cost per DPP/year:          $0.001                                         │
│  Cost per DPP/10 years:      $0.01   (one cent!)                            │
│                                                                              │
│  REVENUE AT THIS SCALE                                                      │
│  ─────────────────────────────────────────────────────────────              │
│  10,000 customers × €150 avg/month = €1,500,000/month                       │
│  Infrastructure cost: ~€800/month                                           │
│  Infrastructure as % of revenue: 0.05%                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Storage Tier Strategy

Different data types use different storage tiers for cost optimization:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STORAGE TIER STRATEGY                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  AWS STORAGE TIERS                                                          │
│  ─────────────────────────────────────────────────────────────              │
│  Tier                    │ Cost/GB/mo │ Retrieval    │ Use Case             │
│  ────────────────────────┼────────────┼──────────────┼──────────────────────│
│  S3 Standard             │ $0.023     │ Instant      │ Active data          │
│  S3 Infrequent Access    │ $0.0125    │ Instant      │ Monthly access       │
│  S3 Glacier Instant      │ $0.004     │ Instant      │ Archive, rare        │
│  S3 Glacier Flexible     │ $0.0036    │ 1-12 hours   │ Backup               │
│  S3 Glacier Deep Archive │ $0.00099   │ 12-48 hours  │ Cold storage         │
│                                                                              │
│  EUROCOMPLY DATA TIERING                                                    │
│  ─────────────────────────────────────────────────────────────              │
│  Data Type               │ Access Pattern     │ Tier           │ Notes      │
│  ────────────────────────┼────────────────────┼────────────────┼────────────│
│  Public DPP JSON-LD      │ On every scan      │ S3 + CloudFront│ Must be    │
│  Product images          │ On every scan      │ S3 IA + CDN    │ instant    │
│  Database records        │ Active queries     │ RDS            │            │
│  ────────────────────────┼────────────────────┼────────────────┼────────────│
│  Backup/audit logs       │ Rarely             │ Glacier        │ Compliance │
│                                                                              │
│  SIMPLE POLICY: All product images kept at original quality, all tiers.     │
│  Using S3 Infrequent Access for images (rarely re-downloaded after cache).  │
│  CloudFront caches images at edge - most requests never hit S3 origin.      │
│                                                                              │
│  KEY INSIGHT: Public-facing DPP data CANNOT use Glacier                     │
│  (12+ hour retrieval is unacceptable for QR scans)                          │
│  Only backups and audit logs use Glacier for cold storage.                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Margin Analysis by Tier

At 500 customer scale (€220/month infrastructure amortized):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MARGIN ANALYSIS BY TIER                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DPP STARTER (€29/month, 100 products)                                      │
│  ─────────────────────────────────────                                      │
│  Infrastructure share:     €0.44                                            │
│  S3 storage (1GB):         €0.02                                            │
│  Bandwidth:                €0.15                                            │
│  ────────────────────────────────                                           │
│  Total cost:               €0.61                                            │
│  Revenue:                  €29.00                                           │
│  Gross margin:             €28.39 (98%)                                     │
│                                                                              │
│  DPP PROFESSIONAL (€99/month, 1,000 products)                               │
│  ─────────────────────────────────────                                      │
│  Infrastructure share:     €0.44                                            │
│  S3 storage (10GB):        €0.23                                            │
│  Bandwidth:                €1.00                                            │
│  AI imports (20):          €0.08                                            │
│  ────────────────────────────────                                           │
│  Total cost:               €1.75                                            │
│  Revenue:                  €99.00                                           │
│  Gross margin:             €97.25 (98%)                                     │
│                                                                              │
│  PIM STANDARD (€199/month, 5,000 products)                                  │
│  ─────────────────────────────────────                                      │
│  Infrastructure share:     €0.44                                            │
│  S3 storage (50GB):        €1.15                                            │
│  Bandwidth:                €5.00                                            │
│  AI imports (100 avg):     €0.40                                            │
│  ────────────────────────────────                                           │
│  Total cost:               €6.99                                            │
│  Revenue:                  €199.00                                          │
│  Gross margin:             €192.01 (96%)                                    │
│                                                                              │
│  PIM GROWTH (€499/month, 25,000 products)                                   │
│  ─────────────────────────────────────                                      │
│  Infrastructure share:     €0.88                                            │
│  S3 storage (250GB):       €5.75                                            │
│  Bandwidth:                €25.00                                           │
│  AI imports (500 avg):     €2.00                                            │
│  ────────────────────────────────                                           │
│  Total cost:               €33.63                                           │
│  Revenue:                  €499.00                                          │
│  Gross margin:             €465.37 (93%)                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Enterprise Cost Model (High Volume)

```
┌─────────────────────────────────────────────────────────────────┐
│  ENTERPRISE COST MODEL (1,000,000 products)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INFRASTRUCTURE COSTS                                           │
│  ─────────────────────                                          │
│  Database (RDS db.r6g.large Multi-AZ):                          │
│  • 1M products × 15KB = 15GB data                              │
│  • Instance + storage: ~€800/mo                                │
│                                                                  │
│  S3 Storage:                                                    │
│  • 1M products × 10MB = 10TB                                   │
│  • S3 Standard: ~€220/mo                                        │
│                                                                  │
│  Bandwidth:                                                     │
│  • Assume 10% products accessed/mo = 100k views                │
│  • CloudFront: ~€85/mo                                          │
│                                                                  │
│  Compute:                                                       │
│  • Dedicated ECS tasks: ~€200/mo                               │
│                                                                  │
│  ─────────────────────                                          │
│  Total Infrastructure: ~€1,300/mo                               │
│                                                                  │
│  SUGGESTED PRICING                                              │
│  ─────────────────────                                          │
│  Enterprise base: €2,000/mo + €0.02/product/mo                 │
│  1M products: €2,000 + €20,000 = €22,000/mo                    │
│  Margin: €22,000 - €1,300 = €20,700 (94%)                      │
│                                                                  │
│  Note: Real cost is support/success headcount, not infra       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

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
│  ├── DPP Ready list when completeness = 100%                   │
│  ├── Manual review and approval before issuance                │
│  ├── W3C Verifiable Credentials (walt.id)                      │
│  ├── did:key for portable identity                              │
│  ├── QR codes (GS1 Digital Link)                               │
│  └── Public verification                                        │
│                                                                  │
│  MULTI-PARTY ATTESTATION                                        │
│  ├── Invite third parties to contribute data                   │
│  ├── Cryptographically signed attestations                     │
│  ├── Linked to DPP as verifiable claims                        │
│  └── Expiry tracking and notifications                         │
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
│  Option C: EuroComply PIM + DPP Standard                        │
│  • Monthly SaaS: €199                                           │
│  • Total Year 1: €2,388                                         │
│                                                                  │
│  EuroComply is 97%+ cheaper than alternatives.                  │
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
| Average Revenue Per User (ARPU) | €150/month |
| Customer Acquisition Cost (CAC) | €500 |
| Lifetime Value (LTV) | €3,600 (24 months) |
| LTV:CAC Ratio | 7.2x |
| Gross Margin | 95%+ (infrastructure only) |
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
| **SME PIM + DPP** | EuroComply | €350-6,000/year | **Leader** |
| DPP-Only Tools | Various | €500-2k/year | Partial overlap |

### Differentiation

| Capability | Traditional PIM | DPP-Only Tools | EuroComply |
|------------|-----------------|----------------|------------|
| Product management | Full | None | Full |
| DPP compliance | Addon | Basic | Native |
| Verifiable credentials | None | None | W3C VCs |
| Multi-party attestation | None | None | Native |
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
| ARR | €0.8M | €2.7M | €7.2M |
| MRR | €65k | €225k | €600k |
| Gross Margin | 94% | 95% | 96% |
| Headcount | 8 | 18 | 35 |

### Revenue by Tier (Year 3)

| Tier | Customers | % of Base | MRR | % of Revenue |
|------|-----------|-----------|-----|--------------|
| DPP Starter | 1,600 | 40% | €46k | 8% |
| DPP Professional | 1,200 | 30% | €119k | 20% |
| PIM Standard | 800 | 20% | €159k | 27% |
| PIM Growth | 320 | 8% | €160k | 27% |
| Enterprise | 80 | 2% | €116k | 19% |
| **Total** | **4,000** | **100%** | **€600k** | **100%** |

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
│                    EUROCOMPLY MODEL                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POSITIONING: Compliance-First PIM                              │
│  → Product data management + DPP in one platform               │
│  → Single "Golden Record" for commercial + compliance data      │
│                                                                  │
│  TARGET MARKET: SMEs and Mid-Market                            │
│  → Brands, manufacturers, distributors                          │
│  → 100-50,000 SKUs                                              │
│  → Can't afford enterprise solutions                           │
│                                                                  │
│  PRICING: 5-Tier SaaS Model (Unlimited Users All Tiers)        │
│  → DPP Starter: €29/mo (100 products, compliance-only)         │
│  → DPP Professional: €99/mo (1k products, basic PIM)           │
│  → PIM Standard: €199/mo (5k products, full platform)          │
│  → PIM Growth: €499/mo (25k products, high volume)             │
│  → Enterprise: Custom (100k+ products)                          │
│                                                                  │
│  KEY FEATURES:                                                  │
│  → AI-powered import (any file format)                         │
│  → Product families with dynamic attributes                    │
│  → Completeness scoring per channel                            │
│  → DPP Ready list with manual review and approval              │
│  → Multi-party attestation with cryptographic signatures       │
│  → Shopify syndication                                         │
│                                                                  │
│  DIFFERENTIATION:                                               │
│  → Only PIM with native DPP compliance                         │
│  → Multi-party attestation (unique feature)                    │
│  → AI import from any format                                   │
│  → Affordable for SMEs                                          │
│  → No lock-in (portable VCs with did:key)                      │
│                                                                  │
│  MARGINS:                                                       │
│  → 94-98% gross margin (infrastructure costs minimal)          │
│  → Real costs: headcount (support, development)                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last Updated: January 2026*
