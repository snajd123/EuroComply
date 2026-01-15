# Billing & Payment Processing

**Version:** 2.0
**Status:** Active
**Last Updated:** 2026-01-15

---

## Table of Contents

1. [Overview](#1-overview)
2. [Pricing Tiers](#2-pricing-tiers)
3. [Payment Processing](#3-payment-processing)
4. [Billing Cycles](#4-billing-cycles)
5. [Per-DPP Billing](#5-per-dpp-billing)
6. [Plan Changes](#6-plan-changes)
7. [Invoice Generation](#7-invoice-generation)
8. [Failed Payment Handling](#8-failed-payment-handling)
9. [Tax Calculation](#9-tax-calculation)
10. [Payment Methods](#10-payment-methods)
11. [Billing Admin](#11-billing-admin)
12. [Implementation Guide](#12-implementation-guide)

---

## 1. Overview

EuroComply uses a **Base Fee + Per-DPP pricing model** that separates platform access from compliance output. All billing operations are powered by Stripe.

### Billing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    BILLING ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BASE SUBSCRIPTION                                              │
│  ─────────────────                                              │
│  • Monthly/annual platform fee                                  │
│  • Covers: Platform access, storage, support level              │
│  • Tiers: Starter (€149), Growth (€299), Scale (€749),         │
│           Enterprise (€1,999), Platform (Custom)                │
│                                                                  │
│  PER-DPP BILLING (Usage-Based)                                  │
│  ──────────────────────────────                                 │
│  • DPP count metered per organization per month                 │
│  • Per-DPP rate varies by tier (€0.10 → €0.001)                │
│  • Volume discounts applied automatically at thresholds         │
│  • Includes: VC issuance, QR generation, 10-year hosting        │
│                                                                  │
│  PAYMENT COLLECTION                                             │
│  ──────────────────                                             │
│  • Stripe automatic billing                                     │
│  • Credit/debit card, SEPA Direct Debit                         │
│  • Invoice payment (Enterprise+ with NET30)                     │
│                                                                  │
│  INVOICE GENERATION                                             │
│  ──────────────────                                             │
│  • PDF invoices via Stripe                                      │
│  • Two line items: Base fee + DPP usage                         │
│  • VAT calculation for EU customers                             │
│                                                                  │
│  DUNNING (Failed Payment Recovery)                             │
│  ──────────────────────────────────                             │
│  • Automatic retry (3 attempts over 7 days)                     │
│  • Email notifications                                          │
│  • Grace period before suspension                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Transparent Pricing**: Base fee + per-DPP, no hidden costs
2. **Fair Prorating**: Upgrades and downgrades prorated to the day
3. **Volume Rewards**: Automatic discounts as DPP volume increases
4. **EU Tax Compliance**: Automatic VAT calculation and collection
5. **Grace Period**: 7-day grace period for failed payments before suspension
6. **Self-Service**: Admins can manage billing without support intervention

---

## 2. Pricing Tiers

> **Canonical Reference:** See [Pricing Tiers](./BUSINESS_MODEL.md#pricing-tiers) for
> the authoritative pricing table with storage allocations and volume discounts.

EuroComply offers five pricing tiers. All tiers include full platform access with unlimited products/SKUs. User limits vary by tier (20/50/100/200) with €10/user/month overage.

### Tier Summary with Support Levels

| Plan | Base Fee | Support Level |
|------|----------|---------------|
| **Starter** | €149/mo | Email |
| **Growth** | €299/mo | Email |
| **Scale** | €749/mo | Priority |
| **Enterprise** | €1,999/mo | Dedicated |
| **Platform** | Custom | SLA |

### Annual Pricing (20% discount on base fee)

| Plan | Monthly | Annual | Annual Savings |
|------|---------|--------|----------------|
| Starter | €149/mo | €1,430/year | €358/year |
| Growth | €299/mo | €2,870/year | €718/year |
| Scale | €749/mo | €7,190/year | €1,798/year |
| Enterprise | €1,999/mo | €19,190/year | €4,798/year |

*Per-DPP fees are always billed monthly based on actual usage.*

### Included in All Plans

- All four workspaces (Design, Operations, Marketing, Compliance)
- Unlimited products/SKUs (no catalog size limits)
- User limits by tier (20/50/100/200, €10/user/month overage)
- **Generous storage** (500GB to 5TB depending on tier for media files)
- Full API access and webhooks
- Shopify integration
- Permanent DPP hosting (10+ years)
- Standard security (encryption, backups)
- EPCIS lifecycle events (included in DPP price)

### Additional Features by Tier

| Feature | Starter | Growth | Scale | Enterprise | Platform |
|---------|:-------:|:------:|:-----:|:----------:|:--------:|
| Email Support | ✅ | ✅ | ✅ | ✅ | ✅ |
| Priority Support (4-hour response) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Dedicated Support (1-hour response) | ❌ | ❌ | ❌ | ✅ | ✅ |
| SLA (99.95% uptime guarantee) | ❌ | ❌ | ❌ | ❌ | ✅ |
| SSO (SAML, OAuth) | ❌ | ❌ | Add-on | ✅ | ✅ |
| Custom Domain | ❌ | ❌ | Add-on | ✅ | ✅ |
| Invoice Payment (NET30) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Custom Contract Terms | ❌ | ❌ | ❌ | ✅ | ✅ |
| Dedicated Account Manager | ❌ | ❌ | ❌ | ✅ | ✅ |
| Dedicated Infrastructure | ❌ | ❌ | ❌ | ❌ | ✅ |

### Add-ons (Scale tier)

| Add-on | Price |
|--------|-------|
| SSO/SAML | €99/month |
| Custom Domain | €49/month |

---

## 3. Payment Processing

All payments are processed through **Stripe** (Stripe Billing + Stripe Tax).

### Stripe Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                    STRIPE INTEGRATION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STRIPE PRODUCTS (Base Subscriptions)                           │
│  ────────────────────────────────────                           │
│  • EuroComply Starter (€149/month or €1,430/year)               │
│  • EuroComply Growth (€299/month or €2,870/year)                │
│  • EuroComply Scale (€749/month or €7,190/year)                 │
│  • EuroComply Enterprise (€1,999/month or €19,190/year)         │
│  • EuroComply Platform (custom pricing)                         │
│                                                                  │
│  METERED BILLING (Per-DPP Usage)                                │
│  ───────────────────────────────                                │
│  • DPP Usage - Starter (€0.10/DPP, volume discounts)            │
│  • DPP Usage - Growth (€0.05/DPP, volume discounts)             │
│  • DPP Usage - Scale (€0.02/DPP, volume discounts)              │
│  • DPP Usage - Enterprise (€0.008/DPP, volume discounts)        │
│  • DPP Usage - Platform (custom per-DPP rate)                   │
│                                                                  │
│  STRIPE OBJECTS                                                 │
│  ──────────────                                                 │
│  • Customer: Maps to EuroComply Organization                    │
│  • Subscription: Base plan + metered DPP component              │
│  • SubscriptionItem: Separate items for base + usage            │
│  • UsageRecord: Monthly DPP counts                              │
│  • PaymentMethod: Saved card or SEPA mandate                    │
│  • Invoice: Base fee + DPP usage + VAT                          │
│                                                                  │
│  WEBHOOKS (Stripe → EuroComply API)                             │
│  ──────────────────────────────────                             │
│  • customer.subscription.created                                │
│  • customer.subscription.updated                                │
│  • customer.subscription.deleted                                │
│  • invoice.payment_succeeded                                    │
│  • invoice.payment_failed                                       │
│  • payment_method.attached                                      │
│  • payment_method.detached                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Model

```typescript
model Organization {
  id                String
  name              String

  // Billing
  stripeCustomerId  String?   @unique
  subscriptionId    String?   @unique
  plan              Plan      // STARTER, GROWTH, SCALE, ENTERPRISE, PLATFORM
  billingCycle      Cycle     // MONTHLY, ANNUAL
  currentPeriodEnd  DateTime?

  // Note: Storage limits vary by plan (500GB to 5TB for media files)

  // DPP Pricing (per-DPP rate in cents)
  baseDppPrice      Int       // 10, 5, 2, 0.8, or custom (in cents)

  // DPP Usage (monthly)
  dppCountThisMonth Int       @default(0)
  dppCountTotal     BigInt    @default(0)

  // Volume Discount Thresholds (stored for custom Platform plans)
  volumeDiscounts   Json?     // [{threshold: 10000, price: 8}, ...]

  // Status
  subscriptionStatus SubscriptionStatus // ACTIVE, PAST_DUE, CANCELED, TRIAL

  // Payment method
  paymentMethod      Json?    // Stripe PaymentMethod details

  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}

enum Plan {
  STARTER
  GROWTH
  SCALE
  ENTERPRISE
  PLATFORM
}

enum Cycle {
  MONTHLY
  ANNUAL
}

enum SubscriptionStatus {
  TRIALING      // 14-day trial (optional)
  ACTIVE        // Paid and active
  PAST_DUE      // Payment failed, in grace period
  CANCELED      // Canceled by user or failed payment
  PAUSED        // Admin paused (rare)
}
```

---

## 4. Billing Cycles

### Monthly Billing

```
┌─────────────────────────────────────────────────────────────────┐
│                     MONTHLY BILLING CYCLE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Day 1: Subscription starts                                     │
│  • Stripe charges €749 for Scale base plan                      │
│  • currentPeriodEnd = Day 30                                    │
│  • Organization status = ACTIVE                                 │
│  • dppCountThisMonth = 0                                        │
│                                                                  │
│  Day 1-30: DPP tracking                                         │
│  • Each DPP issued increments dppCountThisMonth                 │
│  • Volume discounts calculated at month-end                     │
│                                                                  │
│  Day 30: End of billing period                                  │
│  • Calculate DPP charges with volume discounts:                 │
│    - DPPs issued: 750,000                                       │
│    - First 500K at €0.02 = €10,000                              │
│    - Next 250K at €0.01 (500K+ discount) = €2,500               │
│    - Total DPP cost: €12,500                                    │
│                                                                  │
│  Day 30: Invoice generated                                      │
│  • Line item 1: Scale base plan - €749.00                       │
│  • Line item 2: DPP usage (750K) - €12,500.00                   │
│  • VAT (if applicable): €2,619.80 (20%)                         │
│  • Total: €15,718.80                                            │
│                                                                  │
│  Day 30: Payment attempt                                        │
│  • Stripe charges saved payment method                          │
│  • If success: Renew for Day 31-60, reset dppCountThisMonth     │
│  • If failure: Enter dunning process (see §8)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Annual Billing

```
┌─────────────────────────────────────────────────────────────────┐
│                     ANNUAL BILLING CYCLE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Day 1: Subscription starts                                     │
│  • Stripe charges €7,190 for Scale annual plan                  │
│  • 20% discount applied (vs. €8,988 monthly)                    │
│  • currentPeriodEnd = Day 365                                   │
│                                                                  │
│  Monthly DPP billing                                            │
│  • DPP usage still billed monthly (not annually)                │
│  • Invoice generated on the same day each month                 │
│                                                                  │
│  Month 1 invoice:                                               │
│  • Line item 1: DPP usage (750K) - €12,500.00                   │
│  • VAT: €2,500.00                                               │
│  • Total: €15,000.00                                            │
│  • (Base plan already paid annually)                            │
│                                                                  │
│  Day 365: Annual renewal                                        │
│  • Stripe charges €7,190 for next year                          │
│  • Customer receives renewal notification 30 days prior         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Per-DPP Billing

### Volume Discount Calculation

Each tier has different volume discount thresholds that automatically apply:

```typescript
// DPP pricing configuration by tier
const DPP_PRICING = {
  STARTER: {
    basePrice: 0.10,     // €0.10/DPP
    discounts: [
      { threshold: 10000, price: 0.08 },  // 10K+: €0.08
    ],
  },
  GROWTH: {
    basePrice: 0.05,     // €0.05/DPP
    discounts: [
      { threshold: 50000, price: 0.03 },   // 50K+: €0.03
      { threshold: 100000, price: 0.02 },  // 100K+: €0.02
    ],
  },
  SCALE: {
    basePrice: 0.02,     // €0.02/DPP
    discounts: [
      { threshold: 500000, price: 0.01 },   // 500K+: €0.01
      { threshold: 1000000, price: 0.008 }, // 1M+: €0.008
    ],
  },
  ENTERPRISE: {
    basePrice: 0.008,    // €0.008/DPP
    discounts: [
      { threshold: 5000000, price: 0.005 },  // 5M+: €0.005
      { threshold: 10000000, price: 0.003 }, // 10M+: €0.003
    ],
  },
  PLATFORM: {
    basePrice: 0.003,    // Custom, typically €0.001-0.003
    discounts: [],       // Custom negotiated
  },
};

// Calculate DPP cost with volume discounts
function calculateDppCost(plan: Plan, dppCount: number): number {
  const pricing = DPP_PRICING[plan];
  let totalCost = 0;
  let remainingDpps = dppCount;

  // Sort discounts by threshold descending
  const sortedDiscounts = [...pricing.discounts].sort(
    (a, b) => b.threshold - a.threshold
  );

  // Apply tiered pricing (highest discount first)
  for (const discount of sortedDiscounts) {
    if (remainingDpps > discount.threshold) {
      const dppsAtThisRate = remainingDpps - discount.threshold;
      totalCost += dppsAtThisRate * discount.price;
      remainingDpps = discount.threshold;
    }
  }

  // Remaining DPPs at base price
  totalCost += remainingDpps * pricing.basePrice;

  return totalCost;
}

// Example: Scale tier with 750,000 DPPs
// - First 500,000 at €0.02 = €10,000
// - Next 250,000 at €0.01 = €2,500
// - Total: €12,500
```

### DPP Tracking Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     DPP TRACKING FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DPP ISSUED (via API, bulk generation, or UI)                │
│     • Create DPP record with VC                                 │
│     • Increment Organization.dppCountThisMonth                  │
│     • Increment Organization.dppCountTotal                      │
│     • Write to dpp_usage_events table for audit                 │
│                                                                  │
│  2. REAL-TIME DISPLAY                                           │
│     • Dashboard shows: "12,450 DPPs issued this month"          │
│     • Estimated cost: "~€622.50 (€0.05/DPP)"                    │
│     • Projected discount: "At 50K: €0.03/DPP"                   │
│                                                                  │
│  3. MONTH-END (triggered by Stripe billing cycle)               │
│     • Calculate total DPP cost with volume discounts            │
│     • Report usage to Stripe Billing                            │
│     • Stripe generates invoice with DPP line item               │
│     • Reset dppCountThisMonth = 0                               │
│                                                                  │
│  4. USAGE HISTORY                                               │
│     • Monthly DPP counts stored for analytics                   │
│     • Historical data: "Jan: 50K, Feb: 75K, Mar: 120K"          │
│     • Trend visualization in dashboard                          │
│                                                                  │
│  Note: Storage limits vary by plan (500GB-5TB for media files)  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What Counts as a DPP

| Action | Counts as DPP? | Notes |
|--------|:--------------:|-------|
| Issue new DPP | ✅ Yes | Each unique DPP issuance |
| Update existing DPP | ❌ No | Updates are free |
| Revoke DPP | ❌ No | Revocations are free |
| Add EPCIS event | ❌ No | Included in DPP price |
| Bulk DPP generation | ✅ Yes | Each DPP in batch counts |
| Re-issue same DPP | ✅ Yes | New VC = new DPP |

---

## 6. Plan Changes

### Upgrade Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        UPGRADE FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. USER INITIATES UPGRADE                                      │
│     Current: Growth (€299/month base + €0.05/DPP)               │
│     Target: Scale (€749/month base + €0.02/DPP)                 │
│     Days remaining in period: 15 days                           │
│                                                                  │
│  2. CALCULATE PRORATION (Base Fee Only)                         │
│     • Unused Growth credit: €299 × (15/30) = €149.50           │
│     • Scale prorated charge: €749 × (15/30) = €374.50          │
│     • Net charge today: €374.50 - €149.50 = €225.00            │
│                                                                  │
│  3. CONFIRM WITH USER                                           │
│     ┌──────────────────────────────────────────────┐           │
│     │ Upgrade to Scale                              │           │
│     ├──────────────────────────────────────────────┤           │
│     │ • Charge today: €225.00 (prorated base)      │           │
│     │ • Next billing: €749.00 on Feb 15            │           │
│     │                                               │           │
│     │ • New DPP pricing:                           │           │
│     │   - Base: €0.02/DPP (was €0.05)              │           │
│     │   - 500K+: €0.01/DPP                         │           │
│     │   - 1M+: €0.008/DPP                          │           │
│     │                                               │           │
│     │ • Storage: 2 TB (was 1 TB)                   │           │
│     │ • Priority support enabled                   │           │
│     │                                               │           │
│     │ [Cancel]  [Confirm Upgrade]                  │           │
│     └──────────────────────────────────────────────┘           │
│                                                                  │
│  4. EXECUTE UPGRADE                                             │
│     • Stripe.subscriptions.update(...)                          │
│     • Immediate charge: €225.00                                 │
│     • Update Organization.plan = 'SCALE'                        │
│     • Update Organization.baseDppPrice = 2 (cents)              │
│     • DPPs issued rest of month at new rate                     │
│                                                                  │
│  5. DPP BILLING FOR SPLIT MONTH                                 │
│     • DPPs before upgrade: 30,000 at €0.05 = €1,500            │
│     • DPPs after upgrade: 25,000 at €0.02 = €500               │
│     • Total DPP cost: €2,000                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Downgrade Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       DOWNGRADE FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. USER INITIATES DOWNGRADE                                    │
│     Current: Scale (€749/month base)                            │
│     Target: Growth (€299/month base)                            │
│     Days remaining in period: 20 days                           │
│                                                                  │
│  2. CALCULATE CREDIT                                            │
│     • Unused Scale credit: €749 × (20/30) = €499.33            │
│     • Growth cost: €299 × (20/30) = €199.33                    │
│     • Credit balance: €300.00                                   │
│                                                                  │
│  3. CONFIRM WITH USER                                           │
│     ┌──────────────────────────────────────────────┐           │
│     │ Downgrade to Growth                           │           │
│     ├──────────────────────────────────────────────┤           │
│     │ • Charge today: €0.00                        │           │
│     │ • Credit applied: €300.00                    │           │
│     │ • Next billing: €0.00 (covered by credit)    │           │
│     │                                               │           │
│     │ • New DPP pricing:                           │           │
│     │   - Base: €0.05/DPP (was €0.02)              │           │
│     │   - 50K+: €0.03/DPP                          │           │
│     │   - 100K+: €0.02/DPP                         │           │
│     │                                               │           │
│     │ • Storage: 1 TB (was 2 TB)                   │           │
│     │ • Priority support disabled                  │           │
│     │                                               │           │
│     │ [Cancel]  [Confirm Downgrade]                │           │
│     └──────────────────────────────────────────────┘           │
│                                                                  │
│  4. EXECUTE DOWNGRADE                                           │
│     • Update Organization.plan = 'GROWTH'                       │
│     • Update Organization.baseDppPrice = 5 (cents)              │
│     • Credit balance shown on next invoice                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Invoice Generation

### Invoice Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                          INVOICE                                 │
│                                                                  │
│  EuroComply GmbH                        Invoice #: INV-2026-0042 │
│  Frankfurt, Germany                     Date: January 31, 2026   │
│  VAT: DE123456789                       Due: February 7, 2026    │
│                                                                  │
│  Bill To:                               Subscription Period:     │
│  Acme Electronics GmbH                  Jan 1, 2026 - Jan 31, 2026│
│  Munich, Germany                                                 │
│  VAT: DE987654321                                                │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DESCRIPTION                            QTY      PRICE   AMOUNT  │
│  ──────────────────────────────────────────────────────────────│
│  Scale Plan (Monthly Base Fee)           1    €749.00   €749.00 │
│                                                                  │
│  DPP Usage                                                       │
│   - First 500,000 DPPs at €0.02    500,000     €0.02 €10,000.00 │
│   - Next 250,000 DPPs at €0.01     250,000     €0.01  €2,500.00 │
│  ──────────────────────────────────────────────────────────────│
│  DPP Subtotal (750,000 DPPs)                        €12,500.00 │
│                                                                  │
│                                         Subtotal:    €13,249.00 │
│                                         VAT (19%):    €2,517.31 │
│                                         ───────────────────────│
│                                         Total:       €15,766.31 │
│                                                                  │
│  Payment Method: •••• 4242 (Visa)                               │
│  Status: PAID - Jan 31, 2026                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Invoice Line Items

| Line Item | Description | Calculation |
|-----------|-------------|-------------|
| Base Plan | Monthly subscription fee | Fixed by tier |
| DPP Usage (Tier 1) | DPPs at base rate | Count × base price |
| DPP Usage (Tier 2) | DPPs at first discount | Count × discount price |
| DPP Usage (Tier N) | DPPs at Nth discount | Count × discount price |
| Add-ons | SSO, Custom Domain, etc. | Fixed monthly |
| VAT | EU tax | Subtotal × VAT rate |

### Invoice Delivery

| Event | Recipient | Content |
|-------|-----------|---------|
| Payment succeeded | Billing admin(s) | PDF invoice + payment receipt |
| Payment failed | Billing admin(s) | Payment failure notice + retry schedule |
| Upcoming renewal | Billing admin(s) | Reminder 7 days before renewal |
| Plan changed | Billing admin(s) | Confirmation + prorated invoice |
| High usage alert | Billing admin(s) | "You've issued 500K DPPs, unlocking €0.01 rate" |

---

## 8. Failed Payment Handling (Dunning)

### Dunning Process

```
┌─────────────────────────────────────────────────────────────────┐
│                      DUNNING PROCESS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DAY 0: Payment fails                                           │
│  • Stripe attempts charge                                       │
│  • Card declined / insufficient funds                           │
│  • subscriptionStatus → PAST_DUE                                │
│  • Send email: "Payment Failed - Update Payment Method"         │
│  • Dashboard banner: "Payment failed. Please update."           │
│  • Service remains ACTIVE (grace period)                        │
│  • DPP issuance continues (billed next attempt)                 │
│                                                                  │
│  DAY 1: First retry                                             │
│  • Stripe auto-retries payment                                  │
│  • If success: subscriptionStatus → ACTIVE, send receipt        │
│  • If failure: Send email: "Retry #1 Failed"                    │
│  • Service remains ACTIVE                                       │
│                                                                  │
│  DAY 3: Second retry                                            │
│  • Stripe auto-retries payment                                  │
│  • If success: subscriptionStatus → ACTIVE                      │
│  • If failure: Send email: "Retry #2 Failed - Action Required"  │
│  • Dashboard: Persistent banner with "Update Payment" CTA       │
│  • Service remains ACTIVE                                       │
│                                                                  │
│  DAY 5: Third retry                                             │
│  • Stripe auto-retries payment                                  │
│  • If success: subscriptionStatus → ACTIVE                      │
│  • If failure: Send email: "Final Notice - Service Suspension"  │
│  • Service remains ACTIVE (48-hour final grace)                 │
│                                                                  │
│  DAY 7: Subscription canceled                                   │
│  • Stripe cancels subscription                                  │
│  • subscriptionStatus → CANCELED                                │
│  • Send email: "Service Suspended - Unpaid Invoice"             │
│  • Service SUSPENDED:                                           │
│    - Read-only access to all data                               │
│    - Cannot create products, issue DPPs, sync channels          │
│    - Can view and export data                                   │
│    - Can update payment method                                  │
│                                                                  │
│  REACTIVATION (user updates payment method)                     │
│  • User adds valid payment method                               │
│  • Stripe charges outstanding invoice                           │
│  • If success:                                                  │
│    - Create new subscription                                    │
│    - subscriptionStatus → ACTIVE                                │
│    - Send email: "Service Reactivated"                          │
│    - Full access restored immediately                           │
│                                                                  │
│  DAY 30: Data retention warning                                 │
│  • If still suspended after 30 days                             │
│  • Send email: "Data will be deleted in 60 days"                │
│                                                                  │
│  DAY 90: Data deletion                                          │
│  • If still suspended after 90 days                             │
│  • Delete organization data (GDPR compliance)                   │
│  • Send final email: "Account Closed"                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Retry Schedule

| Attempt | Day | Email | Service Status |
|---------|-----|-------|----------------|
| Initial failure | 0 | Payment Failed | ACTIVE (grace) |
| Retry 1 | 1 | Retry #1 Failed | ACTIVE |
| Retry 2 | 3 | Retry #2 Failed | ACTIVE |
| Retry 3 | 5 | Final Notice | ACTIVE |
| Cancellation | 7 | Service Suspended | SUSPENDED |
| Deletion Warning | 30 | Data Deletion Notice | SUSPENDED |
| Data Deletion | 90 | Account Closed | DELETED |

---

## 8.1 Billing Edge Cases

This section covers additional billing scenarios and edge cases not covered in the standard flows.

### Card Expiry Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CARD EXPIRY MANAGEMENT                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PROACTIVE NOTIFICATIONS                                                    │
│  ───────────────────────                                                    │
│  Day -30: Card expires next month                                          │
│  • Email: "Your card ending in 4242 expires soon"                          │
│  • Dashboard banner: "Update payment method before Feb 1"                  │
│  • Include direct link to payment update page                              │
│                                                                              │
│  Day -7: Card expires in 7 days                                            │
│  • Email reminder: "Urgent: Update payment method"                         │
│  • Dashboard: Persistent warning banner                                    │
│                                                                              │
│  Day 0: Card expires                                                        │
│  • If Stripe auto-updates card (card updater): No action needed           │
│  • If no auto-update: Mark payment method as expired                       │
│  • Dashboard: "Payment method expired - update required"                   │
│                                                                              │
│  GRACE PERIOD FOR EXPIRED CARDS                                            │
│  ──────────────────────────────                                            │
│  • 7-day grace period before billing attempt fails                         │
│  • During grace: Service remains fully active                              │
│  • User can update payment method at any time                              │
│  • If updated before billing: Normal charge, no disruption                 │
│  • If not updated: Enter standard dunning process                          │
│                                                                              │
│  STRIPE CARD UPDATER                                                        │
│  ────────────────────                                                       │
│  Stripe automatically updates cards when:                                  │
│  • Card is reissued with new expiry (same card number)                    │
│  • Bank participates in card updater network                               │
│  • ~70% of cards auto-update successfully                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Annual-to-Monthly Billing Cycle Switch

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BILLING CYCLE CHANGES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ANNUAL → MONTHLY                                                           │
│  ────────────────                                                           │
│  Scenario: Customer on Scale Annual (€7,190/year) switches to monthly      │
│                                                                              │
│  TIMING: Switch takes effect at next renewal                               │
│  • Current annual period continues until expiry                            │
│  • At renewal: Monthly billing begins (€749/month)                         │
│  • No prorated refund for unused annual period                             │
│                                                                              │
│  USER FLOW:                                                                 │
│  1. Admin clicks "Switch to Monthly"                                        │
│  2. Confirmation dialog explains:                                          │
│     "Your annual plan continues until [date]. After that,                  │
│      you'll be billed €749/month. You'll lose the 20% annual discount."   │
│  3. On confirmation: Schedule change for renewal date                       │
│  4. Email confirmation sent                                                 │
│                                                                              │
│  MONTHLY → ANNUAL                                                           │
│  ────────────────                                                           │
│  Scenario: Customer on Scale Monthly (€749/mo) switches to annual          │
│                                                                              │
│  TIMING: Immediate                                                         │
│  • Credit remaining monthly period                                         │
│  • Charge full annual amount (€7,190)                                      │
│  • Apply credit to annual charge                                           │
│                                                                              │
│  Example:                                                                   │
│  • Days remaining in month: 20/30                                          │
│  • Monthly credit: €749 × (20/30) = €499.33                               │
│  • Annual charge: €7,190.00                                                │
│  • Net charge: €7,190.00 - €499.33 = €6,690.67                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Credit Balance Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CREDIT BALANCE MANAGEMENT                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SOURCES OF CREDIT                                                          │
│  ─────────────────                                                          │
│  • Downgrade proration (switching to lower tier)                           │
│  • Annual-to-monthly switch (unused period credit)                         │
│  • Billing errors (manual credit applied)                                  │
│  • Promotional credits                                                      │
│                                                                              │
│  CREDIT APPLICATION                                                         │
│  ───────────────────                                                        │
│  • Credits automatically applied to next invoice                           │
│  • Credit balance shown on billing dashboard                               │
│  • Credits never expire while account is active                            │
│                                                                              │
│  CREDITS ON CANCELLATION                                                    │
│  ────────────────────────                                                   │
│  Policy: Credits are NOT refunded on voluntary cancellation                │
│                                                                              │
│  • User cancels subscription                                                │
│  • Service continues until end of paid period                              │
│  • Any credit balance is forfeited                                         │
│  • Exception: Credits from billing errors ARE refunded                     │
│                                                                              │
│  CREDITS ON ACCOUNT REACTIVATION                                           │
│  ───────────────────────────────                                            │
│  • If user reactivates within 90 days: Credits restored                    │
│  • After 90 days: Credits forfeited permanently                            │
│                                                                              │
│  CREDIT TRANSPARENCY                                                        │
│  ────────────────────                                                       │
│  Billing dashboard shows:                                                   │
│  ┌────────────────────────────────────────┐                                │
│  │ Credit Balance: €266.66                │                                │
│  │                                         │                                │
│  │ Sources:                               │                                │
│  │ • Jan 15: Downgrade proration  €266.66│                                │
│  │                                         │                                │
│  │ Applied to next invoice automatically  │                                │
│  └────────────────────────────────────────┘                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Refund Policy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REFUND POLICY                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  GENERAL POLICY                                                             │
│  ──────────────                                                             │
│  • Base fees: Prorated credit for downgrades, no refunds for cancellations │
│  • DPP usage: Non-refundable (usage already consumed)                      │
│  • Annual plans: No partial refunds for early cancellation                 │
│                                                                              │
│  AUTOMATIC REFUND SCENARIOS                                                 │
│  ───────────────────────────                                                │
│  | Scenario               | Refund Type    | Processing      |             │
│  |------------------------|----------------|-----------------|             │
│  | Duplicate charge       | Full refund    | Automatic       |             │
│  | Billing system error   | Full refund    | Automatic       |             │
│  | Service outage (SLA)   | Credit         | Per SLA terms   |             │
│                                                                              │
│  MANUAL REFUND SCENARIOS (Requires Support Review)                         │
│  ──────────────────────────────────────────────────                        │
│  | Scenario               | Refund Type    | Conditions      |             │
│  |------------------------|----------------|-----------------|             │
│  | First 14 days          | Full refund    | On request      |             │
│  | Accidental renewal     | Full refund    | Within 7 days   |             │
│  | Extended outage        | Pro-rata       | >24 hours down  |             │
│  | Disputed feature       | Discretionary  | Case-by-case    |             │
│                                                                              │
│  REFUND PROCESSING                                                          │
│  ─────────────────                                                          │
│  • Credit card: Refund to original card (3-5 business days)                │
│  • SEPA: Bank transfer (5-10 business days)                                │
│  • Invoice: Credit note or bank transfer                                   │
│                                                                              │
│  14-DAY MONEY-BACK GUARANTEE                                               │
│  ───────────────────────────                                                │
│  New customers can request full refund within 14 days of first payment:    │
│  • Applies to base fee only                                                │
│  • DPP usage fees are non-refundable (service was consumed)               │
│  • One refund per organization (prevents abuse)                            │
│  • Refund processed within 5 business days                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Chargeback and Dispute Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CHARGEBACK HANDLING                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHEN CHARGEBACK OCCURS                                                     │
│  ──────────────────────                                                     │
│  1. Stripe notifies via webhook: charge.dispute.created                    │
│  2. Subscription status → DISPUTED                                         │
│  3. Service remains active during dispute (good faith)                     │
│  4. Support team notified immediately                                       │
│                                                                              │
│  DISPUTE RESPONSE (Within 7 days)                                          │
│  ─────────────────────────────────                                          │
│  EuroComply provides Stripe with evidence:                                 │
│  • Customer signup confirmation                                            │
│  • Service usage logs (DPPs issued, API calls)                            │
│  • Previous successful payments                                            │
│  • Terms of service acceptance timestamp                                   │
│  • Any relevant email communications                                       │
│                                                                              │
│  DISPUTE OUTCOMES                                                           │
│  ────────────────                                                           │
│  | Outcome      | Action                                    |              │
│  |--------------|-------------------------------------------|              │
│  | Won          | Status → ACTIVE, no further action        |              │
│  | Lost         | Status → CANCELED, account suspended      |              │
│  | Withdrawn    | Status → ACTIVE, funds returned           |              │
│                                                                              │
│  FRIENDLY FRAUD PREVENTION                                                  │
│  ─────────────────────────                                                  │
│  • Clear billing descriptor: "EUROCOMPLY*DPPPLATFORM"                      │
│  • Receipt emails after every charge                                       │
│  • Usage summaries in invoice                                              │
│  • Easy-to-find cancellation option                                        │
│                                                                              │
│  REPEAT DISPUTE POLICY                                                      │
│  ─────────────────────                                                      │
│  • First dispute: Handled normally                                         │
│  • Second dispute: Account flagged for review                              │
│  • Third dispute: Account suspended, invoice payment only                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Failed Payment Recovery Metrics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PAYMENT RECOVERY DASHBOARD                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DUNNING METRICS (Visible to Finance/Admin)                                │
│  ──────────────────────────────────────────                                 │
│                                                                              │
│  This Month:                                                               │
│  • Failed payments: 23                                                     │
│  • Recovered (retry): 18 (78%)                                            │
│  • Recovered (card update): 3 (13%)                                       │
│  • Churned: 2 (9%)                                                        │
│                                                                              │
│  Recovery by Attempt:                                                      │
│  • Attempt 1 (Day 1): 45% recovered                                       │
│  • Attempt 2 (Day 3): 25% recovered                                       │
│  • Attempt 3 (Day 5): 8% recovered                                        │
│  • Manual recovery: 13% recovered                                         │
│                                                                              │
│  At-Risk Revenue:                                                          │
│  • Currently in dunning: €4,250 MRR (5 accounts)                          │
│  • Average days in dunning: 2.3 days                                      │
│                                                                              │
│  ALERTS                                                                    │
│  ──────                                                                    │
│  • High-value account in dunning (>€500 MRR): Immediate Slack alert       │
│  • Recovery rate drops below 70%: Weekly review triggered                 │
│  • Churn rate exceeds 5%: Investigate payment processor issues            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Tax Calculation

EuroComply uses **Stripe Tax** for automatic VAT calculation and collection.

### VAT Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                      VAT CALCULATION                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CUSTOMER TYPE DETECTION                                        │
│  ───────────────────────                                        │
│  • B2C (no VAT ID): Charge VAT at customer country rate        │
│  • B2B (valid VAT ID): Reverse charge (0% VAT)                 │
│  • B2B (invalid VAT ID): Charge VAT at customer country rate   │
│                                                                  │
│  VAT RATES (EU, 2026)                                           │
│  ────────────────────                                           │
│  • Germany: 19%                                                 │
│  • France: 20%                                                  │
│  • Spain: 21%                                                   │
│  • Italy: 22%                                                   │
│  • Netherlands: 21%                                             │
│  (Stripe Tax handles all EU rates automatically)                │
│                                                                  │
│  VALIDATION                                                     │
│  ──────────                                                     │
│  • VAT ID entered during signup: "DE123456789"                  │
│  • Stripe validates via VIES (EU VAT validation service)        │
│  • If valid: Reverse charge applied (0% VAT)                    │
│  • If invalid: Show error, require correction or charge VAT     │
│                                                                  │
│  INVOICE DISPLAY                                                │
│  ───────────────                                                │
│  B2C Invoice:                                                   │
│    Base fee: €749.00                                            │
│    DPP usage: €12,500.00                                        │
│    Subtotal: €13,249.00                                         │
│    VAT (19%): €2,517.31                                         │
│    Total: €15,766.31                                            │
│                                                                  │
│  B2B Invoice (reverse charge):                                  │
│    Base fee: €749.00                                            │
│    DPP usage: €12,500.00                                        │
│    Subtotal: €13,249.00                                         │
│    VAT: €0.00 (reverse charge)                                  │
│    Total: €13,249.00                                            │
│    Note: "VAT reverse charge - Customer VAT: DE123456789"       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tax Compliance

| Requirement | Implementation |
|-------------|----------------|
| VAT Registration | EuroComply registered for VAT in Germany (DE123456789) |
| VIES Validation | Stripe Tax validates EU VAT IDs automatically |
| VAT MOSS Filing | Stripe Tax generates quarterly reports for filing |
| Invoice Requirements | Invoices include VAT ID, rate, amount per EU regulations |
| Audit Trail | All tax calculations logged and available for export |

---

## 10. Payment Methods

### Supported Payment Methods

| Method | Availability | Processing Time | Fees |
|--------|--------------|----------------|------|
| **Credit/Debit Card** | All tiers | Instant | 1.4% + €0.25 |
| **SEPA Direct Debit** | EU organizations | 3-5 business days | 0.8% (capped at €5) |
| **Invoice (NET30)** | Enterprise, Platform | 30 days | None |

### Card Payment

```
1. User adds card
   • Stripe.js tokenizes card (PCI compliant)
   • Stripe validates card
   • Save as default payment method

2. Monthly billing
   • Stripe automatically charges card
   • 3D Secure (SCA) if required
   • Email receipt

3. Card updates
   • Replace card: Update Stripe PaymentMethod
   • Stripe notifies of expiring cards 30 days before
```

### SEPA Direct Debit

```
1. User provides IBAN
   • Validate IBAN format
   • Stripe creates SEPA mandate
   • User confirms mandate

2. Monthly billing
   • Stripe submits debit 3-5 days before due date
   • Email notification of upcoming debit
   • Settlement takes 3-5 business days

3. Failed debits
   • Enter dunning process (same as card failures)
   • User can switch to card payment
```

### Invoice Payment (Enterprise, Platform Only)

```
1. Enable invoice payment
   • Requires Enterprise or Platform tier
   • Credit check may be required
   • NET30 payment terms

2. Monthly billing
   • Stripe generates invoice
   • Email PDF to billing contact
   • Due in 30 days

3. Payment tracking
   • Manual payment recording in Stripe
   • Automated reminders at day 15, 25, 30
   • Late payment fees (5% after 30 days)
```

---

## 11. Billing Admin

### Admin Capabilities

Billing management is restricted to users with **Organization Admin** status (`isOrganizationAdmin: true`).

| Action | Org Admin | Non-Admin |
|--------|:-----:|:---------:|
| View current plan | ✅ | ❌ |
| View invoices | ✅ | ❌ |
| View DPP usage | ✅ | ❌ |
| Update payment method | ✅ | ❌ |
| Upgrade plan | ✅ | ❌ |
| Downgrade plan | ✅ | ❌ |
| Cancel subscription | ✅ | ❌ |
| Update billing info | ✅ | ❌ |
| Download invoices | ✅ | ❌ |

### Billing Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│                      BILLING DASHBOARD                           │
│                     (Admin Users Only)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CURRENT PLAN                                                   │
│  ─────────────                                                  │
│  Scale (€749/month base + €0.02/DPP)    [Upgrade] [Downgrade]   │
│  Next billing: February 1, 2026                                 │
│  Payment method: Visa •••• 4242                  [Update]       │
│                                                                  │
│  DPP USAGE THIS MONTH                                           │
│  ─────────────────────                                          │
│  DPPs issued: 750,000                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │
│  │ 0        500K       1M                                   │   │
│  │          ↑ Volume discount unlocked!                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Pricing breakdown:                                             │
│   - 500K DPPs at €0.02 = €10,000.00                            │
│   - 250K DPPs at €0.01 = €2,500.00  ← Volume discount!         │
│  ─────────────────────────────────                              │
│  Estimated DPP cost: €12,500.00                                │
│                                                                  │
│  Next discount at 1M DPPs: €0.008/DPP                          │
│                                                                  │
│  INVOICE HISTORY                                                │
│  ────────────────                                               │
│  Jan 2026  Base: €749 + DPPs: €12,500 = €15,766.31  PAID  [PDF]│
│  Dec 2025  Base: €749 + DPPs: €8,200 = €10,650.31   PAID  [PDF]│
│  Nov 2025  Base: €749 + DPPs: €5,100 = €6,961.31    PAID  [PDF]│
│                                                                  │
│  BILLING INFORMATION                                            │
│  ────────────────────                                           │
│  Company: Acme Electronics GmbH                     [Edit]      │
│  VAT ID: DE987654321 ✓ Verified                                │
│  Address: Munich, Germany                                       │
│                                                                  │
│  DANGER ZONE                                                    │
│  ───────────                                                    │
│  [Cancel Subscription]                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. Implementation Guide

### 12.1 Stripe Setup

```typescript
// Initialize Stripe
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

// Create customer on organization signup
async function createStripeCustomer(org: Organization) {
  const customer = await stripe.customers.create({
    name: org.name,
    email: org.billingEmail,
    metadata: {
      organizationId: org.id,
    },
    tax_id_data: org.vatId ? [
      {
        type: 'eu_vat',
        value: org.vatId,
      },
    ] : undefined,
  });

  await prisma.organization.update({
    where: { id: org.id },
    data: { stripeCustomerId: customer.id },
  });

  return customer;
}

// Create subscription with base + metered DPP
async function createSubscription(orgId: string, plan: Plan, cycle: Cycle) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });

  const basePriceId = getBasePriceId(plan, cycle);
  const usagePriceId = getUsagePriceId(plan);

  const subscription = await stripe.subscriptions.create({
    customer: org.stripeCustomerId!,
    items: [
      { price: basePriceId },              // Fixed monthly base fee
      { price: usagePriceId },             // Metered DPP usage
    ],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  });

  const limits = getPlanLimits(plan);

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      subscriptionId: subscription.id,
      plan,
      billingCycle: cycle,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      subscriptionStatus: 'ACTIVE',
      baseDppPrice: limits.dppPrice,
      volumeDiscounts: limits.volumeDiscounts,
    },
  });

  return subscription;
}

// Price ID mapping
function getBasePriceId(plan: Plan, cycle: Cycle): string {
  const prices = {
    STARTER: {
      MONTHLY: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
      ANNUAL: process.env.STRIPE_PRICE_STARTER_ANNUAL!,
    },
    GROWTH: {
      MONTHLY: process.env.STRIPE_PRICE_GROWTH_MONTHLY!,
      ANNUAL: process.env.STRIPE_PRICE_GROWTH_ANNUAL!,
    },
    SCALE: {
      MONTHLY: process.env.STRIPE_PRICE_SCALE_MONTHLY!,
      ANNUAL: process.env.STRIPE_PRICE_SCALE_ANNUAL!,
    },
    ENTERPRISE: {
      MONTHLY: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY!,
      ANNUAL: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL!,
    },
    PLATFORM: {
      MONTHLY: process.env.STRIPE_PRICE_PLATFORM_MONTHLY!,
      ANNUAL: process.env.STRIPE_PRICE_PLATFORM_ANNUAL!,
    },
  };

  return prices[plan][cycle];
}

function getUsagePriceId(plan: Plan): string {
  const usagePrices = {
    STARTER: process.env.STRIPE_USAGE_STARTER!,
    GROWTH: process.env.STRIPE_USAGE_GROWTH!,
    SCALE: process.env.STRIPE_USAGE_SCALE!,
    ENTERPRISE: process.env.STRIPE_USAGE_ENTERPRISE!,
    PLATFORM: process.env.STRIPE_USAGE_PLATFORM!,
  };

  return usagePrices[plan];
}

function getPlanLimits(plan: Plan) {
  // Note: Storage limits vary by plan (500GB to 5TB for media files)
  const limits = {
    STARTER: {
      dppPrice: 10, // €0.10 in cents
      volumeDiscounts: [{ threshold: 10000, price: 8 }],
    },
    GROWTH: {
      dppPrice: 5, // €0.05 in cents
      volumeDiscounts: [
        { threshold: 50000, price: 3 },
        { threshold: 100000, price: 2 },
      ],
    },
    SCALE: {
      dppPrice: 2, // €0.02 in cents
      volumeDiscounts: [
        { threshold: 500000, price: 1 },
        { threshold: 1000000, price: 0.8 },
      ],
    },
    ENTERPRISE: {
      dppPrice: 0.8, // €0.008 in cents (0.8 = 0.008 EUR)
      volumeDiscounts: [
        { threshold: 5000000, price: 0.5 },
        { threshold: 10000000, price: 0.3 },
      ],
    },
    PLATFORM: {
      dppPrice: 0.3, // Custom, typically €0.003
      volumeDiscounts: [], // Custom negotiated
    },
  };

  return limits[plan];
}
```

### 12.2 Webhook Handler

```typescript
// Stripe webhook endpoint
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']!;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'customer.subscription.created':
      await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
      break;

    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const org = await prisma.organization.findUnique({
    where: { stripeCustomerId: invoice.customer as string },
  });

  // Reset monthly DPP counter on successful payment
  await prisma.organization.update({
    where: { id: org!.id },
    data: {
      subscriptionStatus: 'ACTIVE',
      dppCountThisMonth: 0, // Reset for new billing period
    },
  });

  // Send receipt email
  await sendEmail({
    to: org!.billingEmail,
    subject: 'Payment Received - EuroComply',
    template: 'payment-success',
    data: { invoice },
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const org = await prisma.organization.findUnique({
    where: { stripeCustomerId: invoice.customer as string },
  });

  await prisma.organization.update({
    where: { id: org!.id },
    data: { subscriptionStatus: 'PAST_DUE' },
  });

  // Send failure email
  await sendEmail({
    to: org!.billingEmail,
    subject: 'Payment Failed - Action Required',
    template: 'payment-failed',
    data: { invoice, retryDate: invoice.next_payment_attempt },
  });
}
```

### 12.3 DPP Usage Reporting

```typescript
// Report DPP usage to Stripe (called at month-end)
async function reportDppUsageToStripe(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });

  if (org.dppCountThisMonth === 0) return;

  // Calculate cost with volume discounts
  const cost = calculateDppCost(org.plan, org.dppCountThisMonth);

  // Find metered subscription item
  const subscription = await stripe.subscriptions.retrieve(org.subscriptionId!);
  const usageItem = subscription.items.data.find(item =>
    item.price.id === getUsagePriceId(org.plan)
  );

  if (!usageItem) {
    throw new Error('Usage price not found in subscription');
  }

  // Report total DPP count (Stripe calculates cost based on price tiers)
  await stripe.subscriptionItems.createUsageRecord(usageItem.id, {
    quantity: org.dppCountThisMonth,
    timestamp: Math.floor(Date.now() / 1000),
    action: 'set',
  });

  // Log for audit
  await prisma.billingEvent.create({
    data: {
      organizationId: orgId,
      type: 'DPP_USAGE_REPORTED',
      dppCount: org.dppCountThisMonth,
      calculatedCost: cost,
      timestamp: new Date(),
    },
  });
}

// Track DPP issuance in real-time
async function trackDppIssuance(orgId: string, count: number = 1) {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      dppCountThisMonth: { increment: count },
      dppCountTotal: { increment: count },
    },
  });

  // Log individual DPP event for detailed audit
  await prisma.dppUsageEvent.create({
    data: {
      organizationId: orgId,
      count,
      timestamp: new Date(),
    },
  });
}

// Get current usage and cost estimate
async function getCurrentUsage(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });

  const estimatedCost = calculateDppCost(org.plan, org.dppCountThisMonth);
  const pricing = DPP_PRICING[org.plan];

  // Find next discount threshold
  const sortedDiscounts = [...pricing.discounts].sort(
    (a, b) => a.threshold - b.threshold
  );
  const nextDiscount = sortedDiscounts.find(
    d => d.threshold > org.dppCountThisMonth
  );

  return {
    dppCountThisMonth: org.dppCountThisMonth,
    dppCountTotal: org.dppCountTotal,
    estimatedCost,
    currentRate: getCurrentRate(org.plan, org.dppCountThisMonth),
    nextDiscount: nextDiscount ? {
      threshold: nextDiscount.threshold,
      price: nextDiscount.price,
      dppsUntil: nextDiscount.threshold - org.dppCountThisMonth,
    } : null,
    storage: getStorageLimit(org.plan),  // Storage varies by plan
  };
}

function getCurrentRate(plan: Plan, dppCount: number): number {
  const pricing = DPP_PRICING[plan];
  const sortedDiscounts = [...pricing.discounts].sort(
    (a, b) => b.threshold - a.threshold
  );

  for (const discount of sortedDiscounts) {
    if (dppCount >= discount.threshold) {
      return discount.price;
    }
  }

  return pricing.basePrice;
}
```

---

## Related Documentation

- [BUSINESS_MODEL.md](./BUSINESS_MODEL.md) - Pricing strategy, market analysis
- [AUTHENTICATION.md](./AUTHENTICATION.md) - User roles and permissions
- [SELF_SERVICE_ONBOARDING.md](./SELF_SERVICE_ONBOARDING.md) - Signup and trial flow

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.1 | 2026-01-15 | Updated pricing (€149/€299/€749/€1,999) and added storage limits (500GB-5TB) |
| 2.0 | 2026-01-14 | Major update: Base Fee + Per-DPP pricing model |
| 1.0 | 2026-01-14 | Initial specification |
