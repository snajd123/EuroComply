# Billing Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** BILLING.md + clarification session

---

## 1. Overview

EuroComply uses Stripe for all billing operations with a **Base Fee + Per-DPP + User Overage** model.

### Billing Components

| Component | Description |
|-----------|-------------|
| **Base Fee** | Monthly/annual platform subscription (tier-based) |
| **Per-DPP** | Usage-based fee for each DPP issued |
| **User Overage** | €10/user/month for users beyond tier limit |

### Key Principles

1. **Transparent Pricing**: Three clear line items on every invoice
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

---

## 4. Billing Access Control

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

## 5. Data Model

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

## 6. Stripe Integration

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

## 7. Webhook Handling

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

## 8. Changes from Original BILLING.md

| Aspect | Original | Updated |
|--------|----------|---------|
| **Users** | "Unlimited users within organization" | Tiered: 20/50/100/200 + €10/user overage |
| **User tracking** | Not addressed | MAU-based tracking |
| **Invoice line items** | 2 (Base + DPP) | 3 (Base + DPP + User Overage) |
| **Billing access** | "ADMIN role" | Organization Admin (isOrganizationAdmin flag) |
| **Data model** | Missing user tracking | Added user_activity_log, billing_snapshots |

---

## 9. Related Documents

| Document | Purpose |
|----------|---------|
| [Business Model Design](./2026-01-15-business-model-design.md) | Pricing tiers, unit economics |
| [User Management Design](./2026-01-15-user-management-design.md) | Organization Admin definition |
| [Architecture Design](./2026-01-15-architecture-design.md) | System architecture |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from BILLING.md review |

