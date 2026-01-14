# Billing & Payment Processing

**Version:** 1.0
**Status:** Active
**Last Updated:** 2026-01-14

---

## Table of Contents

1. [Overview](#1-overview)
2. [Pricing Tiers](#2-pricing-tiers)
3. [Payment Processing](#3-payment-processing)
4. [Billing Cycles](#4-billing-cycles)
5. [Usage-Based Billing](#5-usage-based-billing)
6. [Plan Changes](#6-plan-changes)
7. [Invoice Generation](#7-invoice-generation)
8. [Failed Payment Handling](#8-failed-payment-handling)
9. [Tax Calculation](#9-tax-calculation)
10. [Payment Methods](#10-payment-methods)
11. [Billing Admin](#11-billing-admin)
12. [Implementation Guide](#12-implementation-guide)

---

## 1. Overview

EuroComply uses a **volume-based subscription model** with usage-based billing for item-level serialization. All billing operations are powered by Stripe.

### Billing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    BILLING ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SUBSCRIPTION MANAGEMENT                                        │
│  ───────────────────────                                        │
│  • Base plan (€129, €399, €999, €4,999/month)                  │
│  • Monthly or annual billing cycles                             │
│  • Automatic renewal                                            │
│                                                                  │
│  USAGE TRACKING (Item Overages)                                │
│  ──────────────────────────────                                 │
│  • Item count metered per organization                          │
│  • Billable overages calculated monthly                         │
│  • Per-tier overage rates (€0.01 or €0.005 per 1,000 items)    │
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
│  • Email delivery                                               │
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

1. **Transparent Pricing**: No hidden fees, all costs shown upfront
2. **Fair Prorating**: Upgrades and downgrades prorated to the day
3. **EU Tax Compliance**: Automatic VAT calculation and collection
4. **Grace Period**: 7-day grace period for failed payments before suspension
5. **Self-Service**: Admins can manage billing without support intervention

---

## 2. Pricing Tiers

EuroComply offers four pricing tiers with full platform access in all plans.

### Tier Comparison

| Plan | Monthly | Annual (20% discount) | Products | Items | Batch Size | AI Imports | Support |
|------|---------|----------------------|----------|-------|------------|------------|---------|
| **Growth** | €129 | €1,290/yr (€108/mo) | 500 | 10,000 | 10,000 | 100/mo | Email |
| **Scale** | €399 | €3,990/yr (€333/mo) | 5,000 | 1,000,000 | 100,000 | 1,000/mo | Priority |
| **Enterprise** | €999 | €9,990/yr (€833/mo) | Unlimited | 100,000,000 | 1,000,000 | Custom | Dedicated |
| **Mega** | €4,999 | €49,990/yr (€4,166/mo) | Unlimited | Unlimited | 10,000,000 | Custom | SLA |

**Annual Savings:**
- Growth: Save €258/year
- Scale: Save €798/year
- Enterprise: Save €1,998/year
- Mega: Save €9,998/year

### Included in All Plans

- All four workspaces (Design, Operations, Marketing, Compliance)
- Full module access (Registry, PIM, Compliance, EPCIS, Attestation)
- Unlimited users within organization
- Shopify integration
- API access
- Permanent DPP hosting
- Standard security (encryption, backups)

### Additional Features by Tier

| Feature | Growth | Scale | Enterprise | Mega |
|---------|:------:|:-----:|:----------:|:----:|
| Email Support | ✅ | ✅ | ✅ | ✅ |
| Priority Support (4-hour response) | ❌ | ✅ | ✅ | ✅ |
| Dedicated Support (1-hour response) | ❌ | ❌ | ✅ | ✅ |
| SLA (99.9% uptime guarantee) | ❌ | ❌ | ❌ | ✅ |
| SSO (SAML, OAuth) | ❌ | ❌ | ✅ | ✅ |
| Invoice Payment (NET30) | ❌ | ❌ | ✅ | ✅ |
| Custom Contract Terms | ❌ | ❌ | ✅ | ✅ |
| Dedicated Account Manager | ❌ | ❌ | ❌ | ✅ |
| Dedicated Infrastructure | ❌ | ❌ | ❌ | ✅ |

---

## 3. Payment Processing

All payments are processed through **Stripe** (Stripe Billing + Stripe Tax).

### Stripe Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                    STRIPE INTEGRATION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STRIPE PRODUCTS (configured in Stripe Dashboard)               │
│  ────────────────────────────────────────────────────────       │
│  • EuroComply Growth (€129/month or €1,290/year)                │
│  • EuroComply Scale (€399/month or €3,990/year)                 │
│  • EuroComply Enterprise (€999/month or €9,990/year)            │
│  • EuroComply Mega (€4,999/month or €49,990/year)               │
│                                                                  │
│  METERED BILLING (usage-based)                                  │
│  ────────────────────────────                                   │
│  • Item Overage - Scale (€0.01 per 1,000 items)                 │
│  • Item Overage - Enterprise (€0.005 per 1,000 items)           │
│                                                                  │
│  STRIPE OBJECTS                                                 │
│  ──────────────                                                 │
│  • Customer: Maps to EuroComply Organization                    │
│  • Subscription: Active plan + billing cycle                    │
│  • PaymentMethod: Saved card or SEPA mandate                    │
│  • Invoice: Generated monthly with line items                   │
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
  plan              Plan      // GROWTH, SCALE, ENTERPRISE, MEGA
  billingCycle      Cycle     // MONTHLY, ANNUAL
  currentPeriodEnd  DateTime?

  // Limits
  productLimit      Int       // 500, 5000, or unlimited
  itemLimit         Int       // 10000, 1000000, 100000000, or unlimited

  // Usage (updated real-time)
  productCount      Int       @default(0)
  itemCount         Int       @default(0)

  // Status
  subscriptionStatus SubscriptionStatus // ACTIVE, PAST_DUE, CANCELED, TRIAL

  // Payment method
  paymentMethod      Json?    // Stripe PaymentMethod details

  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}

enum Plan {
  GROWTH
  SCALE
  ENTERPRISE
  MEGA
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
│  • Stripe charges €399 for Scale plan                           │
│  • currentPeriodEnd = Day 30                                    │
│  • Organization status = ACTIVE                                 │
│                                                                  │
│  Day 1-30: Usage tracking                                       │
│  • Item count tracked in real-time                              │
│  • If itemCount > 1,000,000 → overage accrued                   │
│                                                                  │
│  Day 30: End of billing period                                  │
│  • Stripe calculates overage charges:                           │
│    - Items used: 1,250,000                                      │
│    - Overage: 250,000 items                                     │
│    - Overage cost: 250 × €0.01 = €2.50                          │
│                                                                  │
│  Day 30: Invoice generated                                      │
│  • Line item 1: Scale plan - €399.00                            │
│  • Line item 2: Item overage (250k) - €2.50                     │
│  • VAT (if applicable): €80.30 (20%)                            │
│  • Total: €481.80                                               │
│                                                                  │
│  Day 30: Payment attempt                                        │
│  • Stripe charges saved payment method                          │
│  • If success: Renew for Day 31-60                              │
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
│  • Stripe charges €3,990 for Scale annual plan                  │
│  • 20% discount applied (vs. €4,788 monthly)                    │
│  • currentPeriodEnd = Day 365                                   │
│                                                                  │
│  Monthly usage billing                                          │
│  • Item overages still billed monthly                           │
│  • Invoice generated on the same day each month                 │
│                                                                  │
│  Month 1 invoice:                                               │
│  • Line item 1: Item overage - €2.50                            │
│  • VAT: €0.50                                                   │
│  • Total: €3.00                                                 │
│  • (Base plan already paid annually)                            │
│                                                                  │
│  Day 365: Annual renewal                                        │
│  • Stripe charges €3,990 for next year                          │
│  • Customer receives renewal notification 30 days prior         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Usage-Based Billing

### Item Overage Calculation

Only **Scale** and **Enterprise** tiers have usage-based billing. Growth must upgrade to Scale when limits are reached.

```typescript
// Calculate billable overage
function calculateOverage(org: Organization): number {
  const { plan, itemLimit, itemCount } = org;

  // Mega plan: unlimited, no overage
  if (plan === 'MEGA') return 0;

  // Growth plan: no overage billing, must upgrade
  if (plan === 'GROWTH') {
    if (itemCount > itemLimit) {
      throw new Error('Item limit exceeded. Please upgrade to Scale.');
    }
    return 0;
  }

  // Scale and Enterprise: calculate overage
  if (itemCount <= itemLimit) return 0;

  const overage = itemCount - itemLimit;
  const rate = plan === 'SCALE' ? 0.01 : 0.005; // per 1,000 items

  // Round up to nearest 1,000
  const billableUnits = Math.ceil(overage / 1000);
  const cost = billableUnits * rate;

  return cost;
}
```

### Usage Tracking

```
┌─────────────────────────────────────────────────────────────────┐
│                     USAGE TRACKING FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. ITEM CREATED (via bulk DPP generation)                      │
│     • Worker creates item record in DynamoDB                    │
│     • Increment Organization.itemCount                          │
│     • Write to usage_events table for audit                     │
│                                                                  │
│  2. PERIODIC SYNC (every 5 minutes)                             │
│     • Aggregate itemCount from DynamoDB                         │
│     • Update Organization.itemCount in PostgreSQL               │
│     • Check if limit exceeded                                   │
│                                                                  │
│  3. LIMIT CHECK                                                 │
│     if (itemCount > itemLimit) {                                │
│       if (plan === 'GROWTH') {                                  │
│         // Block further item creation                          │
│         throw new Error('Limit reached. Upgrade required.');    │
│       } else {                                                  │
│         // Allow overage, will bill at month-end                │
│         logOverage(organizationId, itemCount - itemLimit);      │
│       }                                                          │
│     }                                                            │
│                                                                  │
│  4. MONTH-END (triggered by Stripe webhook)                     │
│     • Calculate overage: itemCount - itemLimit                  │
│     • Report usage to Stripe Billing                            │
│     • Stripe generates invoice with overage line item           │
│                                                                  │
│  5. DASHBOARD DISPLAY                                           │
│     • Show real-time usage: "1,250,000 / 1,000,000 items"       │
│     • Estimated overage cost: "~€2.50 this month"               │
│     • Progress bar with color coding:                           │
│       - Green: < 80% of limit                                   │
│       - Yellow: 80-100% of limit                                │
│       - Red: > 100% (overage)                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Plan Changes

### Upgrade Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        UPGRADE FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. USER INITIATES UPGRADE                                      │
│     Current: Growth (€129/month)                                │
│     Target: Scale (€399/month)                                  │
│     Days remaining in period: 15 days                           │
│                                                                  │
│  2. CALCULATE PRORATION                                         │
│     • Unused Growth credit: €129 × (15/30) = €64.50            │
│     • Scale prorated charge: €399 × (15/30) = €199.50          │
│     • Net charge today: €199.50 - €64.50 = €135.00             │
│                                                                  │
│  3. CONFIRM WITH USER                                           │
│     ┌──────────────────────────────────────────────┐           │
│     │ Upgrade to Scale                              │           │
│     ├──────────────────────────────────────────────┤           │
│     │ • Charge today: €135.00 (prorated)           │           │
│     │ • Next billing: €399.00 on Feb 15            │           │
│     │ • New limits:                                │           │
│     │   - Products: 500 → 5,000                    │           │
│     │   - Items: 10,000 → 1,000,000                │           │
│     │                                               │           │
│     │ [Cancel]  [Confirm Upgrade]                  │           │
│     └──────────────────────────────────────────────┘           │
│                                                                  │
│  4. EXECUTE UPGRADE                                             │
│     • Stripe.subscriptions.update(subscriptionId, {             │
│         items: [{ price: 'price_scale_monthly' }],              │
│         proration_behavior: 'always_invoice',                   │
│       })                                                         │
│     • Stripe immediately charges €135.00                        │
│     • Update Organization.plan = 'SCALE'                        │
│     • Update limits: productLimit = 5000, itemLimit = 1000000   │
│                                                                  │
│  5. CONFIRMATION                                                │
│     • Email sent: "Upgraded to Scale"                           │
│     • Dashboard updated with new limits                         │
│     • Invoice emailed                                           │
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
│     Current: Scale (€399/month)                                 │
│     Target: Growth (€129/month)                                 │
│     Days remaining in period: 20 days                           │
│                                                                  │
│  2. CHECK USAGE VS NEW LIMITS                                   │
│     Current usage:                                              │
│     • Products: 450 (within Growth limit of 500) ✅             │
│     • Items: 8,000 (within Growth limit of 10,000) ✅           │
│                                                                  │
│     if (currentUsage > targetLimits) {                          │
│       // Block downgrade, show error                            │
│       throw new Error(                                          │
│         'Cannot downgrade: 450 products exceeds Growth limit'   │
│       );                                                         │
│     }                                                            │
│                                                                  │
│  3. CALCULATE CREDIT (NO REFUND - CREDIT APPLIED)               │
│     • Unused Scale credit: €399 × (20/30) = €266.00            │
│     • Growth cost: €129 × (20/30) = €86.00                      │
│     • Credit balance: €266.00 - €86.00 = €180.00               │
│                                                                  │
│  4. CONFIRM WITH USER                                           │
│     ┌──────────────────────────────────────────────┐           │
│     │ Downgrade to Growth                           │           │
│     ├──────────────────────────────────────────────┤           │
│     │ • Charge today: €0.00                        │           │
│     │ • Credit applied: €180.00                    │           │
│     │ • Next billing: €0.00 on Feb 15              │           │
│     │   (covered by credit)                        │           │
│     │ • Following billing: €129.00 on Mar 15       │           │
│     │                                               │           │
│     │ • New limits:                                │           │
│     │   - Products: 5,000 → 500                    │           │
│     │   - Items: 1,000,000 → 10,000                │           │
│     │   - No overage billing available             │           │
│     │                                               │           │
│     │ [Cancel]  [Confirm Downgrade]                │           │
│     └──────────────────────────────────────────────┘           │
│                                                                  │
│  5. EXECUTE DOWNGRADE                                           │
│     • Stripe.subscriptions.update(subscriptionId, {             │
│         items: [{ price: 'price_growth_monthly' }],             │
│         proration_behavior: 'always_invoice',                   │
│       })                                                         │
│     • Update Organization.plan = 'GROWTH'                       │
│     • Update limits: productLimit = 500, itemLimit = 10000      │
│     • Credit balance shown on next invoice                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Monthly ↔ Annual Conversion

```
MONTHLY → ANNUAL
────────────────
1. User switches to annual
2. Calculate prorated credit from remaining monthly period
3. Charge annual amount minus credit
4. Reset billing cycle to annual

ANNUAL → MONTHLY
────────────────
1. User switches to monthly
2. Calculate unused annual credit
3. Apply credit to future monthly invoices
4. No immediate charge
5. Reset billing cycle to monthly
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
│  Acme Fashion GmbH                      Jan 1, 2026 - Jan 31, 2026│
│  Munich, Germany                                                 │
│  VAT: DE987654321                                                │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DESCRIPTION                            QTY      PRICE   AMOUNT  │
│  ──────────────────────────────────────────────────────────────│
│  Scale Plan (Monthly)                    1     €399.00  €399.00 │
│  Item Overage (250,000 items)          250      €0.01    €2.50 │
│                                                                  │
│                                         Subtotal:       €401.50 │
│                                         VAT (19%):       €76.29 │
│                                         ───────────────────────│
│                                         Total:          €477.79 │
│                                                                  │
│  Payment Method: •••• 4242 (Visa)                               │
│  Status: PAID - Jan 31, 2026                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Invoice Delivery

| Event | Recipient | Content |
|-------|-----------|---------|
| Payment succeeded | Billing admin(s) | PDF invoice + payment receipt |
| Payment failed | Billing admin(s) | Payment failure notice + retry schedule |
| Upcoming renewal | Billing admin(s) | Reminder 7 days before renewal |
| Plan changed | Billing admin(s) | Confirmation + prorated invoice |

### Invoice Archiving

- All invoices stored in Stripe
- Accessible via dashboard: Settings → Billing → Invoice History
- Download as PDF or view in browser
- Invoices retained indefinitely for compliance

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
│    Subtotal: €399.00                                            │
│    VAT (19%): €75.81                                            │
│    Total: €474.81                                               │
│                                                                  │
│  B2B Invoice (reverse charge):                                  │
│    Subtotal: €399.00                                            │
│    VAT: €0.00 (reverse charge)                                  │
│    Total: €399.00                                               │
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
| **Invoice (NET30)** | Enterprise, Mega | 30 days | None |

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

### Invoice Payment (Enterprise, Mega Only)

```
1. Enable invoice payment
   • Requires Enterprise or Mega tier
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

Billing management is restricted to users with **ADMIN** role.

| Action | ADMIN | Non-Admin |
|--------|:-----:|:---------:|
| View current plan | ✅ | ❌ |
| View invoices | ✅ | ❌ |
| View usage | ✅ | ❌ |
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
│  Scale (€399/month)                    [Upgrade] [Downgrade]    │
│  Next billing: February 1, 2026                                 │
│  Payment method: Visa •••• 4242                  [Update]       │
│                                                                  │
│  USAGE THIS MONTH                                               │
│  ─────────────────                                              │
│  Products: 450 / 5,000        [████████░░] 9%                   │
│  Items: 1,250,000 / 1,000,000 [██████████] 125% ⚠️             │
│  Estimated overage: €2.50                                       │
│                                                                  │
│  INVOICE HISTORY                                                │
│  ────────────────                                               │
│  Jan 2026  €477.79  PAID     [Download PDF]                    │
│  Dec 2025  €401.50  PAID     [Download PDF]                    │
│  Nov 2025  €399.00  PAID     [Download PDF]                    │
│                                                                  │
│  BILLING INFORMATION                                            │
│  ────────────────────                                           │
│  Company: Acme Fashion GmbH                      [Edit]         │
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

// Create subscription
async function createSubscription(orgId: string, plan: Plan, cycle: Cycle) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });

  const priceId = getPriceId(plan, cycle);

  const subscription = await stripe.subscriptions.create({
    customer: org.stripeCustomerId!,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  });

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      subscriptionId: subscription.id,
      plan,
      billingCycle: cycle,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      subscriptionStatus: 'ACTIVE',
    },
  });

  return subscription;
}

// Price ID mapping
function getPriceId(plan: Plan, cycle: Cycle): string {
  const prices = {
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
    MEGA: {
      MONTHLY: process.env.STRIPE_PRICE_MEGA_MONTHLY!,
      ANNUAL: process.env.STRIPE_PRICE_MEGA_ANNUAL!,
    },
  };

  return prices[plan][cycle];
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

  await prisma.organization.update({
    where: { id: org!.id },
    data: { subscriptionStatus: 'ACTIVE' },
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

### 12.3 Usage Reporting

```typescript
// Report usage to Stripe (called at month-end)
async function reportUsageToStripe(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });

  if (org.plan === 'GROWTH' || org.plan === 'MEGA') {
    return; // No usage billing
  }

  const overage = Math.max(0, org.itemCount - org.itemLimit);
  if (overage === 0) return;

  const billableUnits = Math.ceil(overage / 1000);

  // Find usage-based subscription item
  const subscription = await stripe.subscriptions.retrieve(org.subscriptionId!);
  const usageItem = subscription.items.data.find(item =>
    item.price.id === getUsagePriceId(org.plan)
  );

  if (!usageItem) {
    throw new Error('Usage price not found in subscription');
  }

  // Report usage
  await stripe.subscriptionItems.createUsageRecord(usageItem.id, {
    quantity: billableUnits,
    timestamp: Math.floor(Date.now() / 1000),
    action: 'set', // Replace previous usage
  });
}

function getUsagePriceId(plan: Plan): string {
  return plan === 'SCALE'
    ? process.env.STRIPE_USAGE_SCALE!
    : process.env.STRIPE_USAGE_ENTERPRISE!;
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
| 1.0 | 2026-01-14 | Initial specification |
