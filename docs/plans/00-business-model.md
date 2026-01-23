# Business Model & Product Design

**Status:** Active
**Last Updated:** 2026-01-21

---

## 1. Overview

EuroComply is a Unified Product Lifecycle & Compliance Platform combining PLM, ERP-lite, PIM, and Digital Product Passport (DPP) capabilities.

### Value Proposition

| Aspect | Value |
|--------|-------|
| **Core offering** | Four tools in one (PLM + ERP + PIM + DPP) |
| **Target market** | SMEs and mid-market with ESPR compliance needs |
| **Price positioning** | 95% cheaper than enterprise alternatives |
| **Key differentiator** | Native DPP compliance, not an add-on |

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **No sales calls required** | Credit card signup |
| **Same-day compliance** | 15 minutes to first DPP |
| **No IT team needed** | AI-powered data import |
| **No lock-in** | Export anytime, take your data |

---

## 2. Pricing Structure

### Base Fee + Per-DPP + SKU Hosting Model

```
BASE FEE (Monthly/Annual)
  - Full platform access (all 4 workspaces)
  - Unlimited products/SKUs
  - User allocation (tier-based)
  - Storage allocation (tier-based)
  - API access and webhooks

PER-DPP FEE (At Provisioning)
  - Charged when DPP transitions COMMISSIONED -> PROVISIONED
  - NOT charged at serial creation (label printing)
  - 10-year hosting included in price
  - EPCIS lifecycle events included

SKU HOSTING FEE
  - EUR 0.50/year per active SKU
  - Only active SKUs (released products) count
```

### Pricing Tiers

| Tier | Base Fee | Users | Storage | DPP Price | Volume Discounts |
|------|----------|-------|---------|-----------|------------------|
| **Starter** | EUR 149/mo | 20 | 500 GB | EUR 0.10/DPP | 10K+: EUR 0.08 |
| **Growth** | EUR 299/mo | 50 | 1 TB | EUR 0.05/DPP | 50K+: EUR 0.03, 100K+: EUR 0.02 |
| **Scale** | EUR 749/mo | 100 | 2 TB | EUR 0.02/DPP | 500K+: EUR 0.01, 1M+: EUR 0.008 |
| **Enterprise** | EUR 1,999/mo | 200 | 5 TB | EUR 0.008/DPP | 5M+: EUR 0.005, 10M+: EUR 0.003 |
| **Platform** | Custom | Custom | Custom | EUR 0.001-0.003 | Negotiated |

### User Overage

| Tier | Users Included | Additional Users |
|------|----------------|------------------|
| All tiers | As above | EUR 10/user/month |

**Rationale:** User limits protect margins from auth provider costs (ZITADEL MAU pricing).

### Annual Pricing

20% discount on base fees for annual prepayment.

| Tier | Monthly | Annual | Savings |
|------|---------|--------|---------|
| Starter | EUR 149/mo | EUR 1,430/year | EUR 358 |
| Growth | EUR 299/mo | EUR 2,870/year | EUR 718 |
| Scale | EUR 749/mo | EUR 7,190/year | EUR 1,798 |
| Enterprise | EUR 1,999/mo | EUR 19,190/year | EUR 4,798 |

---

## 3. Volume Discounts

Automatic discounts as monthly DPP volume increases:

| Tier | Base Price | Volume Thresholds |
|------|------------|-------------------|
| Starter | EUR 0.10 | 10K+: EUR 0.08 (20% off) |
| Growth | EUR 0.05 | 50K+: EUR 0.03, 100K+: EUR 0.02 |
| Scale | EUR 0.02 | 500K+: EUR 0.01, 1M+: EUR 0.008 |
| Enterprise | EUR 0.008 | 5M+: EUR 0.005, 10M+: EUR 0.003 |
| Platform | Negotiated | 100M+: EUR 0.001 or lower |

---

## 4. Feature Matrix

| Feature | Starter | Growth | Scale | Enterprise | Platform |
|---------|:-------:|:------:|:-----:|:----------:|:--------:|
| **Workspaces** |||||
| Design Workspace | Full | Full | Full | Full | Full |
| Operations Workspace | Full | Full | Full | Full | Full |
| Marketing Workspace | Full | Full | Full | Full | Full |
| Compliance Workspace | Full | Full | Full | Full | Full |
| **Limits** |||||
| Products/SKUs | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |
| Users | 20 | 50 | 100 | 200 | Custom |
| Storage | 500 GB | 1 TB | 2 TB | 5 TB | Custom |
| API Rate Limit | 100/min | 500/min | 2,000/min | 10,000/min | Custom |
| **Support** |||||
| Email Support | Yes | Yes | Yes | Yes | Yes |
| Priority Support | - | - | Yes | Yes | Yes |
| Phone Support | - | - | - | Yes | Yes |
| Dedicated CSM | - | - | - | Yes | Yes |
| **SLAs** |||||
| Uptime SLA | 99.5% | 99.5% | 99.9% | 99.95% | Custom |
| Response Time | - | - | 4 hours | 1 hour | Custom |
| **Advanced** |||||
| SSO/SAML | - | - | Add-on | Yes | Yes |
| Custom Domain | - | - | Add-on | Yes | Yes |
| Dedicated Infrastructure | - | - | - | - | Yes |

### Add-ons (Scale tier)

| Add-on | Price |
|--------|-------|
| SSO/SAML | EUR 99/month |
| Custom Domain | EUR 49/month |

---

## 5. Self-Service Onboarding

### Onboarding Flow

```
STEP 1: REGISTER
  Email + password (via ZITADEL)
  Company name, country, organization type
  Email verification

STEP 2: SELECT PLAN
  Choose tier (Starter/Growth/Scale/Enterprise)

STEP 3: PAYMENT
  Stripe Checkout (credit card, SEPA, iDEAL)
  VAT handled automatically (Stripe Tax)
  Full access granted immediately

STEP 4: WORKSPACE INTRODUCTION
  "What would you like to do first?"
  -> Design (materials, BOMs)
  -> Operations (inventory, suppliers)
  -> Marketing (product content)
  -> Compliance (issue DPPs)

STEP 5: IMPORT PRODUCTS
  AI Import (CSV, Excel, PDF, JSON)
  Shopify Sync
  Manual creation with templates

STEP 6: ISSUE DPPs
  Review DPP Ready products
  Approve to issue Verifiable Credential
  QR code and public URL generated

TOTAL TIME: ~15 minutes
```

### Founder Permissions

The first user (founder) receives:

| Permission | Value |
|------------|-------|
| Organization Admin | Yes |
| Design workspace | MANAGER |
| Operations workspace | MANAGER |
| Marketing workspace | MANAGER |
| Compliance workspace | MANAGER |

### Success Metrics

| Metric | Target |
|--------|--------|
| Time to first product import | < 15 minutes |
| Time from registration to full access | < 10 minutes |
| Payment conversion | > 60% |
| Onboarding completion | > 80% |

---

## 6. Data Sovereignty & Portability

### Customer Promise

| Need | Solution |
|------|----------|
| Simple SaaS | We host everything |
| No lock-in | Export anytime, take your data |
| Data ownership | Self-contained VCs with all data embedded |
| Survival guarantee | Signatures work forever without us |

### Export Package (All Tiers)

```
dpp-export-{org-id}.zip
├── credentials/
│   ├── dpp-001.vc.json       # Signed VC with ALL data
│   └── ...
├── identity/
│   ├── did.json              # DID document
│   └── private-key.jwk       # For future signing
├── status-list/
│   └── status-list.vc.json   # Current revocation state
├── products/
│   └── products.json         # All workspace data
├── images/
│   └── ...                   # All media assets
├── viewer.html               # Offline viewer
└── manifest.json             # GTIN -> VC mapping
```

### When Subscription Ends

```
DAY 0: Subscription ends
  - Platform access suspended
  - Export tools remain accessible
  - DPPs continue working (10-year hosting paid)

DAYS 1-30: Grace period
  - Export all data
  - Download signing keys
  - DPPs continue working

DAY 30+: Data retention
  - Product data archived (not deleted)
  - DPPs continue working (10-year hosting included)
  - Status list frozen (no new revocations)
  - VCs remain valid (did:key is self-contained)
```

**No dormant hosting tier.** DPP costs already include 10-year hosting.

---

## 7. Unit Economics

### Per-DPP Cost Structure (10-Year)

| Component | Cost |
|-----------|------|
| VC computation | EUR 0.0001 |
| QR code generation | EUR 0.00001 |
| Template storage (amortized) | EUR 0.00003 |
| Item record (DynamoDB) | EUR 0.00002 |
| Status list hosting | EUR 0.00005 |
| Format migration reserve | EUR 0.00010 |
| Inflation buffer | EUR 0.00005 |
| **Total 10-Year TCO** | **~EUR 0.00035** |
| **With 3x Risk Buffer** | **~EUR 0.001** |

### Gross Margins by Tier

| Tier | DPP Price | 10-Year TCO | Gross Margin |
|------|-----------|-------------|--------------|
| Starter | EUR 0.10 | EUR 0.0024 | 97.6% |
| Growth | EUR 0.05 | EUR 0.0024 | 95.2% |
| Scale | EUR 0.02 | EUR 0.0024 | 88.0% |
| Enterprise | EUR 0.008 | EUR 0.0024 | 70.0% |
| Platform (floor) | EUR 0.003 | EUR 0.0024 | 20.0% |

**Critical Pricing Floors:**
- Minimum viable price: EUR 0.003/DPP (20% margin)
- Break-even with buffer: EUR 0.0025/DPP
- Never price below: EUR 0.002/DPP

---

## 8. Shipping Revenue ("Compliant Highway")

### Model

```
STAGE -> VERIFY -> SEAL -> SHIP

1. STAGE: Aggregate serials into consignment
2. VERIFY: Automated compliance check (all DPPs valid)
3. SEAL: Generate EPCIS aggregation event + Evidence Package
4. SHIP: Label generated only after compliance verified

KEY INSIGHT: Control the label, control the highway.
```

### Shipping Pricing by Tier

| Fee Type | Starter | Growth | Scale | Enterprise | Platform |
|----------|---------|--------|-------|------------|----------|
| Compliance Unlock | EUR 25 | EUR 20 | EUR 15 | EUR 10 | EUR 5 |
| EPCIS Event (per EPC) | EUR 0.05 | EUR 0.04 | EUR 0.03 | EUR 0.02 | EUR 0.01 |
| Customs Filing | EUR 50 | EUR 40 | EUR 35 | EUR 25 | EUR 15 |
| Label Markup | 10% | 10% | 10% | 10% | 10% |

---

## 9. Retailer Access

### DPP Display (Free)

ESPR Article 31 mandates free DPP access for economic operators.

| Feature | Description |
|---------|-------------|
| DPP Catalog Browser | Search by GTIN, brand, serial number |
| Embeddable Widget | JavaScript snippet for product pages |
| Public DPP API | Programmatic DPP data access |
| Shopify Retailer App | Automatic GTIN matching |

### Verification Proof Service (Paid)

**ESPR Article 31 Compliance:** Status checks are **always free**. We charge for **proof receipts**.

| Service | Price | ESPR Status |
|---------|-------|-------------|
| "Is this product recalled?" | **FREE** | Mandated by Article 31 |
| "Give me cryptographic proof I checked" | **PAID** | Value-add service |

### Verification Proof Tiers

| Tier | Price | Features |
|------|-------|----------|
| Free | EUR 0 | Status only (CLEAR/RECALLED/NOT_FOUND) |
| Basic | EUR 49/mo | + Proof receipts, API access |
| Professional | EUR 199/mo | + SLA, webhooks, batch verification |
| Enterprise | EUR 999+/mo | + 7-year proof storage, dedicated support |

---

## 10. Revenue Composition (Year 5 Target)

| Source | Percentage | Description |
|--------|------------|-------------|
| Base Subscription | 26% | Monthly/Annual platform fees |
| Per-DPP Revenue | 54% | Volume-based DPP issuance |
| SKU Hosting | 4% | EUR 0.50/year per active SKU |
| Shipping & Logistics | 12% | Compliant Highway fees |
| Recall Operations | 2% | Per-item recall fees |
| Services | 2% | Enterprise onboarding, integrations |

---

## 11. Competitive Positioning

### Cost Comparison (Year 1)

| Option | Total Cost |
|--------|------------|
| Enterprise Stack (Akeneo + DPP addon + implementation) | EUR 80,000+ |
| Custom Build (development + hosting + maintenance) | EUR 132,000+ |
| **EuroComply Growth** (base + 20K DPPs) | **EUR 4,588** |

**EuroComply is 95%+ cheaper.**

### Market Position

| Segment | Competition | EuroComply Position |
|---------|-------------|---------------------|
| Enterprise PLM/PIM | Siemens, SAP, Akeneo | Not competing |
| Mid-Market | Arena, Plytix | Adjacent (we're cheaper) |
| SME Unified | **No direct competitor** | **Leader** |
| DPP-Only | Various startups | Superior (full platform) |

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [Architecture](./01-architecture.md) | Technical architecture |
| [Data Model](./02-data-model.md) | Database schema |
| [Security](./03-security.md) | Auth, RBAC, encryption |
| [Billing](./12-billing.md) | Stripe integration |
| [Regulatory Advisor](./13-regulatory-advisor.md) | Template marketplace revenue |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 2.1 | 2026-01-23 | Updated Clerk references to ZITADEL for auth provider migration |
| 2.0 | 2026-01-21 | Consolidated from business-model, onboarding, data-sovereignty designs |
