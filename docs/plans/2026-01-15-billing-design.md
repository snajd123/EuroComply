# Billing Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** BILLING.md + clarification session

---

## 1. Overview

EuroComply uses Stripe for all billing operations with a **Base Fee + Per-DPP + User Overage + Shipping** model.

### Billing Components

| Component | Description |
|-----------|-------------|
| **Base Fee** | Monthly/annual platform subscription (tier-based) |
| **Per-DPP** | Usage-based fee triggered when DPP status transitions COMMISSIONED → PROVISIONED |
| **SKU Hosting** | €0.50/year per active SKU for product catalog hosting |
| **User Overage** | €10/user/month for users beyond tier limit |
| **Recall Operations** | Per-item fee for recall API calls (cost + 80% margin) |
| **Shipping & Logistics** | Transaction fees for Compliant Highway services |

> **Shipping Details:** See [Operations Workspace Design](./2026-01-15-operations-workspace-design.md#16-shipping--logistics-module) for complete shipping architecture.

### DPP Billing Trigger

**IMPORTANT:** DPP fees are NOT charged at serial creation. The billing event occurs when a DPP transitions from `COMMISSIONED` to `PROVISIONED` status.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DPP BILLING TRIGGER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  COMMISSIONED (Serial Created)                                              │
│  ─────────────────────────────                                               │
│  • URI reserved, QR label printed                                           │
│  • Empty shell - no data frozen                                             │
│  • ❌ NO CHARGE - this is just reservation                                   │
│                                                                              │
│  PROVISIONED (Batch Released)                                               │
│  ─────────────────────────────                                               │
│  • Data frozen from Design + Marketing + Operations                         │
│  • Snapshot sealed with Brand's DID                                         │
│  • ✅ BILLING EVENT - per-DPP fee charged                                    │
│                                                                              │
│  WHY THIS MATTERS:                                                          │
│  • Customers can print labels immediately (no bottleneck)                   │
│  • Billing only occurs when real compliance work is done                    │
│  • Failed batches never get charged                                         │
│  • Aligns cost with value delivered                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

> **Reference:** See [Compliance Workspace Design](./2026-01-15-compliance-workspace-design.md#4-dpp-lifecycle-birth-certificate-model) for complete lifecycle states.

### DPP Lifecycle Cost Analysis (10-Year TCO)

The two-phase DPP lifecycle (COMMISSIONED → PROVISIONED) introduces costs at each phase:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DPP LIFECYCLE 10-YEAR TCO                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PHASE 1: COMMISSIONED (Serial Created)                                     │
│  ═══════════════════════════════════════                                     │
│  │ Component                        │ Calculation              │ Cost      │
│  ├──────────────────────────────────│──────────────────────────│───────────│
│  │ PostgreSQL row (empty shell ~1KB)│ 1KB × 120mo × $0.10/GB   │ €0.000012 │
│  │ Write operation                  │ One-time                 │ €0.000001 │
│  ├──────────────────────────────────│──────────────────────────│───────────│
│  │ PHASE 1 SUBTOTAL                 │                          │ €0.000013 │
│  └──────────────────────────────────────────────────────────────────────────│
│                                                                              │
│  PHASE 2: PROVISIONED (Batch Released)                                      │
│  ═════════════════════════════════════                                       │
│  │ Component                        │ Calculation              │ Cost      │
│  ├──────────────────────────────────│──────────────────────────│───────────│
│  │ Design data fetch (reads)        │ 3 queries                │ €0.00001  │
│  │ Marketing data fetch (reads)     │ 2 queries                │ €0.00001  │
│  │ Operations data fetch (reads)    │ 5 queries                │ €0.00002  │
│  │ JSONB snapshot storage (~50KB)   │ 50KB × 120mo × $0.10/GB  │ €0.0006   │
│  │ SHA256 hash computation          │ CPU cycles               │ €0.000001 │
│  │ JWS signing (KMS/Cloudflare)     │ Crypto operation         │ €0.0001   │
│  │ DID resolution                   │ Cache hit 99%            │ €0.00001  │
│  │ Database update                  │ One-time                 │ €0.000001 │
│  ├──────────────────────────────────│──────────────────────────│───────────│
│  │ PHASE 2 SUBTOTAL (without TSA)   │                          │ €0.00075  │
│  └──────────────────────────────────────────────────────────────────────────│
│                                                                              │
│  RFC 3161 TIMESTAMP (Add-on)                                                │
│  ═══════════════════════════                                                 │
│  │ TSA API call (DigiCert/Sectigo)  │ Per-DPP                  │ €0.01     │
│  │ Token storage (R2)               │ 2KB × 120mo × $0.015/GB  │ €0.00004  │
│  ├──────────────────────────────────│──────────────────────────│───────────│
│  │ TSA SUBTOTAL                     │                          │ €0.01004  │
│  └──────────────────────────────────────────────────────────────────────────│
│                                                                              │
│  ACTIVE/DECOMMISSIONED (Lifecycle)                                          │
│  ═════════════════════════════════                                           │
│  │ Status updates                   │ 1-2 per lifetime         │ €0.000002 │
│  └──────────────────────────────────────────────────────────────────────────│
│                                                                              │
│  TOTAL 10-YEAR TCO SCENARIOS                                                │
│  ═══════════════════════════                                                 │
│  │ Basic DPP (no TSA)               │ €0.000013 + €0.00075     │ €0.00076  │
│  │ With 3x safety buffer            │                          │ €0.0023   │
│  │ With RFC 3161 TSA                │ + €0.01004               │ €0.0111   │
│  │ With TSA + 3x buffer             │                          │ €0.033    │
│  └──────────────────────────────────────────────────────────────────────────│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Gross Margin Analysis by Tier

| Tier | DPP Price | 10-Year TCO | Gross Margin | Status |
|------|-----------|-------------|--------------|--------|
| **Starter** | €0.10 | €0.0023 | **97.7%** | ✅ Healthy |
| **Growth** | €0.05 | €0.0023 | **95.4%** | ✅ Healthy |
| **Scale** | €0.02 | €0.0023 | **88.5%** | ✅ Healthy |
| **Enterprise** | €0.008 | €0.0023 | **71.3%** | ✅ Acceptable |
| **Platform (floor)** | €0.003 | €0.0023 | **23.3%** | ⚠️ Minimum viable |
| **Platform (negotiated)** | €0.001 | €0.0023 | **-130%** | ❌ Below cost |

**Key Insights:**
1. All standard tiers maintain healthy margins (71%+ even at Enterprise)
2. Platform floor pricing at €0.003 is the minimum viable price
3. **Never price below €0.0025/DPP** (break-even with buffer)

### RFC 3161 Timestamp Pricing

⚠️ **CRITICAL:** TSA timestamps cost €0.01 per call. This MUST be priced separately:

| Scenario | TSA Cost | Minimum DPP Price | Margin |
|----------|----------|-------------------|--------|
| Without TSA | €0 | €0.003 | 23%+ |
| With TSA | €0.01 | €0.015 | 33%+ |

**Recommendation:** RFC 3161 timestamps should be:
- **Included** for Enterprise tier (already priced at €0.008 = covers €0.0023 base, TSA extra)
- **Add-on** at €0.015/DPP for Scale and below
- **Negotiated** for Platform (bundle pricing)

### Orphaned COMMISSIONED DPPs

Serials created but never provisioned (failed batches, QC rejects) consume storage but generate no revenue:

| Orphan Rate | Cost Impact per Provisioned DPP | Margin Impact |
|-------------|--------------------------------|---------------|
| 1% | €0.00000013 | Negligible |
| 5% | €0.00000065 | Negligible |
| 10% | €0.0000013 | Negligible |
| 50% | €0.0000065 | < 0.01% |

**Conclusion:** Orphaned DPPs have negligible cost impact. The lifecycle model is cost-efficient.

### Key Principles

1. **Transparent Pricing**: Up to four categories on every invoice (Base + DPP + Users + Shipping)
2. **Fair Prorating**: Upgrades and downgrades prorated to the day
3. **Volume Rewards**: Automatic DPP discounts as volume increases
4. **MAU-Based Users**: Monthly Active Users counted to align with Clerk costs
5. **EU Tax Compliance**: Automatic VAT via Stripe Tax

---

## 2. User Limits and Overage

### Tier User Limits

> See [Business Model Design](./2026-01-15-business-model-design.md) for full pricing details.

| Tier | Users Included | Overage Rate |
|------|----------------|--------------|
| Starter | 20 | €10/user/month |
| Growth | 50 | €10/user/month |
| Scale | 100 | €10/user/month |
| Enterprise | 200 | €10/user/month |
| Platform | Custom | Negotiated |

### Monthly Active User (MAU) Tracking

User counts are based on **Monthly Active Users** (users who logged in during the billing period):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MAU TRACKING                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHY MAU (not point-in-time):                                               │
│  • Aligns with Clerk's billing model (our cost driver)                      │
│  • Prevents gaming (can't deactivate users before billing day)              │
│  • Fair: if 25 users logged in during January, pay for 25 users            │
│                                                                              │
│  HOW IT WORKS:                                                              │
│  • Track unique user logins per organization per month                      │
│  • At month-end: count unique users who logged in                          │
│  • If count > tier limit: bill overage                                     │
│                                                                              │
│  EXAMPLE (Scale tier, 100 users included):                                 │
│  • January MAU: 115 unique users logged in                                 │
│  • Overage: 115 - 100 = 15 users                                           │
│  • Overage charge: 15 × €10 = €150                                         │
│                                                                              │
│  WHAT COUNTS AS "ACTIVE":                                                   │
│  • Any authenticated session (login via Clerk)                             │
│  • API calls with user token count as activity                             │
│  • Deactivated users don't count (even if they logged in before deactivation)│
│                                                                              │
│  WHAT DOESN'T COUNT:                                                        │
│  • Guest partners (separate tracking)                                       │
│  • Transactional partners (one-time access)                                │
│  • API-only service accounts (no Clerk session)                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### User Overage Calculation

```typescript
function calculateUserOverage(
  plan: Plan,
  monthlyActiveUsers: number
): { overage: number; cost: number } {
  const limits = {
    STARTER: 20,
    GROWTH: 50,
    SCALE: 100,
    ENTERPRISE: 200,
    PLATFORM: Infinity, // Custom
  };

  const limit = limits[plan];
  const overage = Math.max(0, monthlyActiveUsers - limit);
  const cost = overage * 10; // €10 per user

  return { overage, cost };
}
```

---

## 3. Invoice Structure

### Three Line Items

Every invoice contains up to three line items:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INVOICE                                         │
│                                                                              │
│  EuroComply GmbH                            Invoice #: INV-2026-0042        │
│  Frankfurt, Germany                         Date: January 31, 2026          │
│                                                                              │
│  Bill To:                                   Subscription Period:            │
│  Acme Electronics GmbH                      Jan 1, 2026 - Jan 31, 2026      │
│  VAT: DE987654321                                                           │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DESCRIPTION                               QTY        PRICE       AMOUNT    │
│  ────────────────────────────────────────────────────────────────────────── │
│  Scale Plan (Monthly Base Fee)               1     €749.00      €749.00    │
│                                                                              │
│  DPP Usage                                                                  │
│   - First 500,000 DPPs at €0.02        500,000       €0.02   €10,000.00    │
│   - Next 250,000 DPPs at €0.01         250,000       €0.01    €2,500.00    │
│  ────────────────────────────────────────────────────────────────────────── │
│  DPP Subtotal (750,000 DPPs)                                 €12,500.00    │
│                                                                              │
│  User Overage (115 MAU, 100 included)       15      €10.00      €150.00    │
│                                                                              │
│                                             Subtotal:        €13,399.00    │
│                                             VAT (19%):        €2,545.81    │
│                                             ─────────────────────────────── │
│                                             Total:           €15,944.81    │
│                                                                              │
│  Payment Method: •••• 4242 (Visa)                                          │
│  Status: PAID - Jan 31, 2026                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Invoice Line Item Summary

| Line Item | Description | Calculation |
|-----------|-------------|-------------|
| Base Plan | Monthly/annual subscription | Fixed by tier |
| DPP Usage | Per-DPP fees with volume discounts | Count × rate (tiered) |
| User Overage | Users beyond tier limit | (MAU - limit) × €10 |
| Shipping | Compliant Highway fees | Per consignment/EPC/filing |

---

## 4. Shipping & Logistics Billing

EuroComply's "Compliant Highway" generates transaction-based revenue through logistics services. These fees appear as additional line items alongside base fees, DPP usage, and user overage.

### Shipping Revenue Streams

| Fee Type | Description | When Charged |
|----------|-------------|--------------|
| **Compliance Unlock** | Per-consignment verification fee | When compliance gate passes |
| **EPCIS Events** | Per-EPC tracking in aggregation events | When EPCIS event generated |
| **Customs Filing** | Evidence Package with official PDF | When Evidence Package requested |
| **Label Markup** | 10% margin on carrier rates | When shipping label purchased |

### Shipping Pricing by Tier

| Fee Type | Starter | Growth | Scale | Enterprise | Platform |
|----------|---------|--------|-------|------------|----------|
| Compliance Unlock | €25.00 | €20.00 | €15.00 | €10.00 | €5.00 |
| EPCIS Event (per EPC) | €0.05 | €0.04 | €0.03 | €0.02 | €0.01 |
| Customs Filing | €50.00 | €40.00 | €35.00 | €25.00 | €15.00 |
| Label Markup | 10% | 10% | 10% | 10% | 10% |

### Shipping Storage Costs (10-Year TCO)

Unlike DPPs where we deduplicate (30KB template shared across 1,000 items), shipping artifacts are **unique per consignment** and cannot be templated.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SHIPPING ARTIFACT STORAGE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ARTIFACT SIZES (per consignment):                                          │
│  • Evidence Package JSON:     ~150KB (Four Pillars, EPCs, signatures)       │
│  • Customs PDF (5 pages):     ~1MB (official template with QR codes)        │
│  • EPCIS Events:              ~3KB each × 5 avg = 15KB per consignment      │
│  • Shipping Label:            ~100KB (carrier PDF, 90-day retention)        │
│  • RFC 3161 Timestamp Token:  ~2KB (Enterprise+ only)                       │
│  ──────────────────────────────────────────────────────────────────────────│
│  TOTAL PER CONSIGNMENT:       ~1.3MB (without customs PDF: ~270KB)          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 10-Year TCO Breakdown

| Component | Calculation | Cost |
|-----------|-------------|------|
| Evidence Package JSON (R2) | 150KB × 120mo × $0.015/GB | €0.00025 |
| Customs PDF (R2) | 1MB × 120mo × $0.015/GB | €0.0017 |
| EPCIS Events (DynamoDB) | 15KB × 120mo × $0.25/GB | €0.0004 |
| Shipping Label (R2, 90-day) | 100KB × 3mo × $0.015/GB | €0.000004 |
| RFC 3161 Token (R2) | 2KB × 120mo × $0.015/GB | €0.00004 |
| **Storage Subtotal** | | **€0.0024** |
| Generation compute | PDF rendering, signing, QR codes | €0.0022 |
| TSA API call (Enterprise+) | RFC 3161 timestamp request | €0.01 |
| Operational reserves | Format migration, inflation buffer | €0.0015 |

**Total 10-Year TCO:**
- Without Customs PDF: **€0.01** (with 3x buffer)
- With Customs PDF: **€0.02** (with 3x buffer)
- With TSA (Enterprise+): **€0.05** (with 3x buffer)

#### Gross Margin by Tier

| Fee Type | Tier | Price | 10-Year TCO | Gross Margin |
|----------|------|-------|-------------|--------------|
| Compliance Unlock | Starter | €25.00 | €0.01 | 99.96% |
| Compliance Unlock | Platform | €5.00 | €0.01 | **99.80%** |
| Customs Filing | Starter | €50.00 | €0.02 | 99.96% |
| Customs Filing + TSA | Platform | €15.00 | €0.05 | **99.67%** |
| EPCIS Event (per EPC) | Starter | €0.05 | €0.0001 | 99.80% |
| EPCIS Event (per EPC) | Platform | €0.01 | €0.0001 | **99.00%** |

**Key Insight:** Even at Platform floor pricing, all shipping artifacts maintain 99%+ gross margins. Storage costs are negligible relative to the value delivered.

### Invoice with Shipping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INVOICE                                         │
│                                                                              │
│  EuroComply GmbH                            Invoice #: INV-2026-0087        │
│  Frankfurt, Germany                         Date: January 31, 2026          │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DESCRIPTION                               QTY        PRICE       AMOUNT    │
│  ────────────────────────────────────────────────────────────────────────── │
│  Scale Plan (Monthly Base Fee)               1     €749.00      €749.00    │
│                                                                              │
│  DPP Usage                                                                  │
│   - 750,000 DPPs at €0.02                                     €12,500.00    │
│                                                                              │
│  User Overage (115 MAU, 100 included)       15      €10.00      €150.00    │
│                                                                              │
│  SHIPPING & LOGISTICS                                                       │
│   - Carrier Costs (pass-through)           450     varies     €4,500.00    │
│   - Label Markup (10%)                     450        10%       €450.00    │
│   - Compliance Unlock                      450      €15.00    €6,750.00    │
│   - EPCIS Events (125,000 EPCs)        125,000       €0.03    €3,750.00    │
│   - Customs Filings                         12      €35.00      €420.00    │
│  ────────────────────────────────────────────────────────────────────────── │
│  Shipping Subtotal:                                           €15,870.00    │
│                                                                              │
│                                             Subtotal:         €29,269.00    │
│                                             VAT (19%):         €5,561.11    │
│                                             ─────────────────────────────── │
│                                             Total:            €34,830.11    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Shipping Usage Tracking

```sql
-- Shipping usage tracking (extends billing model)
CREATE TABLE shipping_usage (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,

    -- Compliance Unlock (per consignment)
    shipments_count     INT DEFAULT 0,
    compliance_fee_rate DECIMAL(10,2),

    -- Label Markup
    carrier_costs       DECIMAL(10,2) DEFAULT 0,
    label_markup_rate   DECIMAL(5,4) DEFAULT 0.10,

    -- EPCIS Events (per EPC)
    epcis_epc_count     INT DEFAULT 0,
    epcis_fee_rate      DECIMAL(10,4),

    -- Customs Filings
    customs_filings     INT DEFAULT 0,
    customs_fee_rate    DECIMAL(10,2),

    -- Stripe reporting
    reported_to_stripe  BOOLEAN DEFAULT FALSE,
    reported_at         TIMESTAMPTZ,

    UNIQUE(organization_id, period_start)
);
```

---

## 5. SKU Hosting Fee

EuroComply charges a yearly fee per active SKU to cover product catalog hosting costs.

### Pricing

| Fee | Amount | Billing |
|-----|--------|---------|
| **SKU Hosting** | €0.50/year per active SKU | Monthly (€0.042/month prorated) |

### What Counts as an "Active SKU"

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SKU HOSTING DEFINITION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ACTIVE SKU (Charged):                                                      │
│  ─────────────────────                                                       │
│  • Has at least one RELEASED Design Version                                 │
│  • OR has at least one DPP in PROVISIONED/ACTIVE state                      │
│  • Product is not archived                                                   │
│                                                                              │
│  INACTIVE SKU (Not Charged):                                                │
│  ───────────────────────────                                                 │
│  • Draft products (no released versions)                                    │
│  • Archived products                                                         │
│  • Products with only DECOMMISSIONED DPPs                                   │
│                                                                              │
│  EXAMPLE:                                                                   │
│  • Organization has 500 products in catalog                                 │
│  • 450 have released versions (active)                                      │
│  • 50 are drafts or archived (inactive)                                     │
│  • Monthly charge: 450 × €0.042 = €18.75                                   │
│  • Annual cost: 450 × €0.50 = €225                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10-Year TCO for SKU Hosting

| Component | Calculation | Cost |
|-----------|-------------|------|
| Product data (PostgreSQL) | 50KB × 120mo × $0.10/GB | €0.0005 |
| Design versions (PostgreSQL) | 100KB × 120mo × $0.10/GB | €0.001 |
| Marketing content (PostgreSQL) | 150KB × 120mo × $0.10/GB | €0.0015 |
| Media assets (R2, shared) | 5MB amortized × 120mo × $0.015/GB | €0.008 |
| **Total 10-Year TCO** | | **€0.011** |
| **With 3x buffer** | | **€0.033** |

**Gross Margin:** €0.50 revenue / €0.033 cost = **93.4%** margin

---

## 6. Recall Operations Billing

Product recalls require updating the status of every affected serial number, which involves API calls and database operations. EuroComply passes through these costs with an 80% margin.

### Recall Cost Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RECALL API COST BREAKDOWN                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PER-ITEM OPERATIONS (for each serial in recalled batch):                   │
│  ──────────────────────────────────────────────────────────                  │
│  • Database status update (DPP → RECALLED):        €0.000002                │
│  • Status List 2021 credential update:             €0.000100                │
│  • Recall overlay injection:                       €0.000010                │
│  • Webhook notifications:                          €0.000050                │
│  • Audit log entries:                              €0.000008                │
│  ─────────────────────────────────────────────────────────────              │
│  TOTAL COST PER ITEM:                              €0.000170                │
│                                                                              │
│  PRICING (80% margin):                                                      │
│  • Cost: €0.00017                                                           │
│  • Price: €0.00017 / 0.20 = €0.00085                                       │
│  • Rounded: €0.001 per item                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Recall Pricing by Tier

All tiers use the same recall pricing (cost-based, not value-based):

| Operation | Price per Item | Minimum Charge |
|-----------|----------------|----------------|
| **Recall Initiation** | €0.001/item | €10.00 |
| **Recall Resolution** | €0.0005/item | €5.00 |

### Example: Recall 50,000 Items

```
Batch with 50,000 serials affected by quality issue

Recall Initiation:
  50,000 items × €0.001 = €50.00

Recall Resolution (after fix):
  50,000 items × €0.0005 = €25.00

Total recall lifecycle: €75.00

Cost breakdown:
  API costs: 50,000 × €0.00017 × 2 = €17.00
  Revenue: €75.00
  Gross profit: €58.00 (77% margin)
```

### Invoice Line Item

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  RECALL OPERATIONS                                                          │
│   - Recall #RCL-2026-00123 (50,000 items)      50,000     €0.001    €50.00 │
│   - Resolution #RCL-2026-00123                 50,000    €0.0005    €25.00 │
│  ────────────────────────────────────────────────────────────────────────── │
│  Recall Operations Subtotal:                                        €75.00 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Recall Usage Tracking

```sql
-- Recall usage tracking
CREATE TABLE recall_usage (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    recall_id           UUID NOT NULL REFERENCES recall(id),
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,

    -- Recall metrics
    items_recalled      INT NOT NULL DEFAULT 0,
    items_resolved      INT NOT NULL DEFAULT 0,
    recall_fee_rate     DECIMAL(10,6) DEFAULT 0.001,
    resolution_fee_rate DECIMAL(10,6) DEFAULT 0.0005,

    -- Calculated charges
    recall_charge       DECIMAL(10,2) NOT NULL DEFAULT 0,
    resolution_charge   DECIMAL(10,2) NOT NULL DEFAULT 0,

    -- Stripe reporting
    reported_to_stripe  BOOLEAN DEFAULT FALSE,
    reported_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recall_usage_org ON recall_usage (organization_id);
CREATE INDEX idx_recall_usage_recall ON recall_usage (recall_id);
```

---

## 7. Complete Invoice Example

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INVOICE                                         │
│                                                                              │
│  EuroComply GmbH                            Invoice #: INV-2026-0099        │
│  Frankfurt, Germany                         Date: January 31, 2026          │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DESCRIPTION                               QTY        PRICE       AMOUNT    │
│  ────────────────────────────────────────────────────────────────────────── │
│  Scale Plan (Monthly Base Fee)               1     €749.00      €749.00    │
│                                                                              │
│  DPP PROVISIONING (COMMISSIONED→PROVISIONED)                                │
│   - 750,000 DPPs at €0.02                                     €15,000.00    │
│                                                                              │
│  SKU HOSTING                                                                │
│   - 2,500 active SKUs (prorated monthly)   2,500     €0.042      €105.00   │
│                                                                              │
│  User Overage (115 MAU, 100 included)       15      €10.00      €150.00    │
│                                                                              │
│  SHIPPING & LOGISTICS                                                       │
│   - Carrier Costs (pass-through)           450     varies     €4,500.00    │
│   - Label Markup (10%)                     450        10%       €450.00    │
│   - Compliance Unlock                      450      €15.00    €6,750.00    │
│   - EPCIS Events (125,000 EPCs)        125,000       €0.03    €3,750.00    │
│   - Customs Filings                         12      €35.00      €420.00    │
│  ────────────────────────────────────────────────────────────────────────── │
│  Shipping Subtotal:                                           €15,870.00    │
│                                                                              │
│  RECALL OPERATIONS                                                          │
│   - Recall #RCL-2026-00045 (10,000 items)  10,000    €0.001      €10.00    │
│  ────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│                                             Subtotal:         €31,884.00    │
│                                             VAT (19%):         €6,057.96    │
│                                             ─────────────────────────────── │
│                                             Total:            €37,941.96    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Billing Access Control

### Who Can Manage Billing

Billing management requires **Organization Admin** status:

| Action | Organization Admin | Workspace MANAGER |
|--------|:------------------:|:-----------------:|
| View current plan | ✅ | ❌ |
| View invoices | ✅ | ❌ |
| View DPP usage | ✅ | ❌ |
| View user count/overage | ✅ | ❌ |
| Update payment method | ✅ | ❌ |
| Upgrade/downgrade plan | ✅ | ❌ |
| Cancel subscription | ✅ | ❌ |
| Update billing info (VAT ID, address) | ✅ | ❌ |
| Download invoices | ✅ | ❌ |

> See [User Management Design](./2026-01-15-user-management-design.md) for Organization Admin definition.

### Billing Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BILLING DASHBOARD                                     │
│                      (Organization Admins Only)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CURRENT PLAN                                                               │
│  ─────────────                                                               │
│  Scale (€749/month base)                          [Upgrade] [Downgrade]    │
│  Next billing: February 1, 2026                                            │
│  Payment method: Visa •••• 4242                              [Update]      │
│                                                                              │
│  THIS MONTH'S USAGE                                                        │
│  ──────────────────                                                         │
│                                                                              │
│  DPPs Issued: 750,000                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ ████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  │
│  │ 0        500K (€0.02)       1M (€0.008)                            │  │
│  │              ↑ Volume discount active!                              │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│  Estimated DPP cost: €12,500.00                                           │
│                                                                              │
│  Active Users: 115 / 100 included                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ ████████████████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░ │  │
│  │ 0               100 (included)              200                    │  │
│  │                   ↑ 15 users over limit                            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│  Estimated user overage: €150.00                                          │
│                                                                              │
│  ESTIMATED NEXT INVOICE                                                    │
│  ──────────────────────                                                     │
│  Base fee:        €749.00                                                  │
│  DPP usage:       €12,500.00                                               │
│  User overage:    €150.00                                                  │
│  ──────────────────────────                                                │
│  Subtotal:        €13,399.00                                               │
│  + VAT (estimated)                                                         │
│                                                                              │
│  INVOICE HISTORY                                                           │
│  ────────────────                                                           │
│  Jan 2026  €749 + €12,500 + €150 = €15,944.81  PAID   [PDF]              │
│  Dec 2025  €749 + €8,200 + €0 = €10,650.31     PAID   [PDF]              │
│  Nov 2025  €749 + €5,100 + €0 = €6,961.31      PAID   [PDF]              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Data Model

### Organization Billing Fields

```sql
-- Extended organization model for billing
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS (
    -- Stripe integration
    stripe_customer_id VARCHAR(255) UNIQUE,
    subscription_id VARCHAR(255) UNIQUE,

    -- Plan
    plan VARCHAR(20) NOT NULL DEFAULT 'STARTER',
    -- STARTER, GROWTH, SCALE, ENTERPRISE, PLATFORM
    billing_cycle VARCHAR(10) NOT NULL DEFAULT 'MONTHLY',
    -- MONTHLY, ANNUAL
    current_period_end TIMESTAMPTZ,

    -- Status
    subscription_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    -- TRIALING, ACTIVE, PAST_DUE, CANCELED, PAUSED

    -- DPP Usage (monthly)
    dpp_count_this_month INT NOT NULL DEFAULT 0,
    dpp_count_total BIGINT NOT NULL DEFAULT 0,

    -- User Usage (monthly)
    mau_count_this_month INT NOT NULL DEFAULT 0,

    -- Pricing (for custom Platform plans)
    base_dpp_price_cents INT,  -- Custom per-DPP rate
    volume_discounts JSONB,    -- Custom volume thresholds
    user_limit_override INT,   -- Custom user limit

    -- Payment
    payment_method JSONB,      -- Stripe PaymentMethod details
    billing_email VARCHAR(255)
);

-- Track user activity for MAU calculation
CREATE TABLE user_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL REFERENCES users(id),
    activity_date DATE NOT NULL,

    -- Only need one entry per user per day
    UNIQUE(organization_id, user_id, activity_date),

    INDEX idx_user_activity_org_date (organization_id, activity_date)
);

-- Monthly billing snapshots
CREATE TABLE billing_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    -- Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Snapshot data
    plan VARCHAR(20) NOT NULL,
    dpp_count INT NOT NULL,
    dpp_cost_cents BIGINT NOT NULL,
    mau_count INT NOT NULL,
    user_overage INT NOT NULL,
    user_overage_cost_cents INT NOT NULL,
    base_fee_cents INT NOT NULL,

    -- Invoice reference
    stripe_invoice_id VARCHAR(255),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(organization_id, period_start)
);
```

### MAU Tracking

```typescript
// Track user login (called on every authenticated request)
async function trackUserActivity(userId: string, orgId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Upsert - only one entry per user per day
  await prisma.userActivityLog.upsert({
    where: {
      organizationId_userId_activityDate: {
        organizationId: orgId,
        userId: userId,
        activityDate: today,
      },
    },
    create: {
      organizationId: orgId,
      userId: userId,
      activityDate: today,
    },
    update: {}, // No-op if exists
  });
}

// Calculate MAU for billing period
async function calculateMAU(
  orgId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const result = await prisma.userActivityLog.groupBy({
    by: ['userId'],
    where: {
      organizationId: orgId,
      activityDate: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    _count: true,
  });

  return result.length; // Count of unique users
}
```

---

## 10. Stripe Integration

### Subscription Structure

Each subscription has three components:

```typescript
// Create subscription with base + metered DPP + metered users
async function createSubscription(orgId: string, plan: Plan, cycle: Cycle) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });

  const subscription = await stripe.subscriptions.create({
    customer: org.stripeCustomerId!,
    items: [
      { price: getBasePriceId(plan, cycle) },     // Fixed base fee
      { price: getDppUsagePriceId(plan) },        // Metered DPP usage
      { price: getUserOveragePriceId() },         // Metered user overage
    ],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
  });

  return subscription;
}

// Report usage at month-end
async function reportMonthlyUsage(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const subscription = await stripe.subscriptions.retrieve(org.subscriptionId!);

  // Report DPP usage
  const dppItem = subscription.items.data.find(
    item => item.price.id === getDppUsagePriceId(org.plan)
  );
  await stripe.subscriptionItems.createUsageRecord(dppItem!.id, {
    quantity: org.dppCountThisMonth,
    action: 'set',
  });

  // Report user overage
  const userLimit = getUserLimit(org.plan);
  const overage = Math.max(0, org.mauCountThisMonth - userLimit);

  if (overage > 0) {
    const userItem = subscription.items.data.find(
      item => item.price.id === getUserOveragePriceId()
    );
    await stripe.subscriptionItems.createUsageRecord(userItem!.id, {
      quantity: overage,
      action: 'set',
    });
  }
}
```

### Stripe Products and Prices

| Product | Price ID Pattern | Type |
|---------|------------------|------|
| Starter Monthly | `price_starter_monthly` | Fixed recurring |
| Starter Annual | `price_starter_annual` | Fixed recurring |
| Growth Monthly | `price_growth_monthly` | Fixed recurring |
| ... | ... | ... |
| DPP Usage - Starter | `price_dpp_starter` | Metered (per unit) |
| DPP Usage - Growth | `price_dpp_growth` | Metered (per unit) |
| ... | ... | ... |
| User Overage | `price_user_overage` | Metered (€10/unit) |

---

## 11. Webhook Handling

```typescript
// Handle Stripe webhooks
async function handleStripeWebhook(event: Stripe.Event) {
  switch (event.type) {
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    // ... other events
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const org = await prisma.organization.findUnique({
    where: { stripeCustomerId: invoice.customer as string },
  });

  // Create billing snapshot for historical record
  await prisma.billingSnapshot.create({
    data: {
      organizationId: org!.id,
      periodStart: new Date(invoice.period_start * 1000),
      periodEnd: new Date(invoice.period_end * 1000),
      plan: org!.plan,
      dppCount: org!.dppCountThisMonth,
      dppCostCents: calculateDppCostCents(org!.plan, org!.dppCountThisMonth),
      mauCount: org!.mauCountThisMonth,
      userOverage: Math.max(0, org!.mauCountThisMonth - getUserLimit(org!.plan)),
      userOverageCostCents: Math.max(0, org!.mauCountThisMonth - getUserLimit(org!.plan)) * 1000,
      baseFeeCents: getBaseFeeCents(org!.plan),
      stripeInvoiceId: invoice.id,
    },
  });

  // Reset monthly counters
  await prisma.organization.update({
    where: { id: org!.id },
    data: {
      subscriptionStatus: 'ACTIVE',
      dppCountThisMonth: 0,
      mauCountThisMonth: 0,
    },
  });

  // Clear MAU activity log for previous period
  await prisma.userActivityLog.deleteMany({
    where: {
      organizationId: org!.id,
      activityDate: { lt: new Date(invoice.period_end * 1000) },
    },
  });
}
```

---

## 12. Changes from Original BILLING.md

| Aspect | Original | Updated |
|--------|----------|---------|
| **Users** | "Unlimited users within organization" | Tiered: 20/50/100/200 + €10/user overage |
| **User tracking** | Not addressed | MAU-based tracking |
| **Invoice line items** | 2 (Base + DPP) | 3 (Base + DPP + User Overage) |
| **Billing access** | "ADMIN role" | Organization Admin (isOrganizationAdmin flag) |
| **Data model** | Missing user tracking | Added user_activity_log, billing_snapshots |

---

## 13. Related Documents

| Document | Purpose |
|----------|---------|
| [Business Model Design](./2026-01-15-business-model-design.md) | Pricing tiers, unit economics |
| [Operations Workspace Design](./2026-01-15-operations-workspace-design.md) | Shipping & Logistics, EPCIS, Evidence Package |
| [User Management Design](./2026-01-15-user-management-design.md) | Organization Admin definition |
| [Architecture Design](./2026-01-15-architecture-design.md) | System architecture |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.4 | 2026-01-16 | Added DPP Lifecycle Cost Analysis (10-Year TCO), gross margin analysis by tier, TSA pricing recommendation, orphan DPP analysis |
| 0.3 | 2026-01-16 | Added DPP billing trigger (COMMISSIONED→PROVISIONED), SKU hosting fee (€0.50/yr), Recall operations billing (80% margin) |
| 0.2 | 2026-01-15 | Added Section 4: Shipping & Logistics Billing with storage costs and margins |
| 0.1 | 2026-01-15 | Initial draft from BILLING.md review |

