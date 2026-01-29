# Billing

**Status:** Active
**Last Updated:** 2026-01-21

---

## 1. Overview

EuroComply uses Stripe for all billing operations with a **Base Fee + Per-DPP + User Overage + Shipping** model.

### Billing Components

| Component | Description |
|-----------|-------------|
| **Base Fee** | Monthly/annual platform subscription (tier-based) |
| **Per-DPP** | Usage-based fee triggered when DPP status transitions COMMISSIONED → PROVISIONED |
| **SKU Hosting** | EUR 0.50/year per active SKU for product catalog hosting |
| **User Overage** | EUR 10/user/month for users beyond tier limit |
| **Shipping & Logistics** | Transaction fees for Compliant Highway services |
| **Recall Operations** | Per-item fee for recall API calls (cost + 80% margin) |

### Key Principles

| Principle | Implementation |
|-----------|----------------|
| **Transparent Pricing** | Up to five categories on every invoice |
| **Fair Prorating** | Upgrades and downgrades prorated to the day |
| **Volume Rewards** | Automatic DPP discounts as volume increases |
| **MAU-Based Users** | Monthly Active Users counted to align with auth costs |
| **EU Tax Compliance** | Automatic VAT via Stripe Tax |

---

## 2. MikroORM Entities

### Organization Billing Extensions

```typescript
import { Entity, Property, Enum, OneToMany, Collection, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';

export enum Plan {
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  SCALE = 'SCALE',
  ENTERPRISE = 'ENTERPRISE',
  PLATFORM = 'PLATFORM',
}

export enum BillingCycle {
  MONTHLY = 'MONTHLY',
  ANNUAL = 'ANNUAL',
}

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
  PAUSED = 'PAUSED',
}

// Add to Organization entity
export interface OrganizationBillingFields {
  // Stripe integration
  stripeCustomerId?: string;
  subscriptionId?: string;

  // Plan
  plan: Plan;
  billingCycle: BillingCycle;
  currentPeriodEnd?: Date;

  // Status
  subscriptionStatus: SubscriptionStatus;

  // DPP Usage (monthly)
  dppCountThisMonth: number;
  dppCountTotal: number;

  // User Usage (monthly)
  mauCountThisMonth: number;

  // Active SKU count
  activeSkuCount: number;

  // Custom pricing (Platform tier)
  baseDppPriceCents?: number;
  volumeDiscounts?: VolumeDiscount[];
  userLimitOverride?: number;

  // Payment
  paymentMethod?: PaymentMethodInfo;
  billingEmail?: string;
}

interface VolumeDiscount {
  threshold: number;
  priceCents: number;
}

interface PaymentMethodInfo {
  type: 'card' | 'sepa_debit';
  last4: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
}
```

### User Activity Tracking (MAU)

```typescript
import { Entity, Property, ManyToOne, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';
import { Organization } from './Organization';
import { User } from './User';

@Entity({ tableName: 'user_activity_log' })
@Unique({ properties: ['organization', 'user', 'activityDate'] })
export class UserActivityLog extends BaseEntity {
  @ManyToOne(() => Organization)
  @Index()
  organization!: Organization;

  @ManyToOne(() => User)
  user!: User;

  @Property({ type: 'date' })
  @Index()
  activityDate!: Date;
}
```

### Billing Snapshots

```typescript
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';
import { Organization } from './Organization';
import { Plan } from './Organization';

@Entity({ tableName: 'billing_snapshot' })
@Unique({ properties: ['organization', 'periodStart'] })
export class BillingSnapshot extends BaseEntity {
  @ManyToOne(() => Organization)
  organization!: Organization;

  @Property({ type: 'date' })
  @Index()
  periodStart!: Date;

  @Property({ type: 'date' })
  periodEnd!: Date;

  @Enum(() => Plan)
  plan!: Plan;

  // DPP usage
  @Property()
  dppCount!: number;

  @Property({ type: 'bigint' })
  dppCostCents!: number;

  // SKU hosting
  @Property()
  activeSkuCount!: number;

  @Property()
  skuHostingCostCents!: number;

  // User usage
  @Property()
  mauCount!: number;

  @Property()
  userOverage!: number;

  @Property()
  userOverageCostCents!: number;

  // Base fee
  @Property()
  baseFeeCents!: number;

  // Shipping
  @Property({ default: 0 })
  shippingCostCents!: number;

  // Recall
  @Property({ default: 0 })
  recallCostCents!: number;

  // Stripe reference
  @Property({ nullable: true })
  stripeInvoiceId?: string;
}
```

### DPP Usage Tracking

```typescript
import { Entity, Property, ManyToOne, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';
import { Organization } from './Organization';

@Entity({ tableName: 'dpp_usage' })
@Unique({ properties: ['organization', 'periodStart'] })
export class DppUsage extends BaseEntity {
  @ManyToOne(() => Organization)
  organization!: Organization;

  @Property({ type: 'date' })
  @Index()
  periodStart!: Date;

  @Property({ type: 'date' })
  periodEnd!: Date;

  // DPP counts by tier
  @Property({ default: 0 })
  dppProvisioned!: number;

  // Per-tier pricing applied
  @Property({ type: 'jsonb', nullable: true })
  tierBreakdown?: {
    tier1Count: number;
    tier1Rate: number;
    tier2Count?: number;
    tier2Rate?: number;
    tier3Count?: number;
    tier3Rate?: number;
  };

  @Property({ type: 'bigint', default: 0 })
  totalCostCents!: number;

  @Property({ default: false })
  reportedToStripe!: boolean;

  @Property({ nullable: true })
  reportedAt?: Date;
}
```

### Shipping Usage Tracking

```typescript
import { Entity, Property, ManyToOne, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';
import { Organization } from './Organization';

@Entity({ tableName: 'shipping_usage' })
@Unique({ properties: ['organization', 'periodStart'] })
export class ShippingUsage extends BaseEntity {
  @ManyToOne(() => Organization)
  organization!: Organization;

  @Property({ type: 'date' })
  @Index()
  periodStart!: Date;

  @Property({ type: 'date' })
  periodEnd!: Date;

  // Compliance Unlock (per consignment)
  @Property({ default: 0 })
  shipmentsCount!: number;

  @Property({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  complianceFeeRate?: string;

  // Label Markup
  @Property({ type: 'decimal', precision: 10, scale: 2, default: '0' })
  carrierCosts!: string;

  @Property({ type: 'decimal', precision: 5, scale: 4, default: '0.10' })
  labelMarkupRate!: string;

  // EPCIS Events (per EPC)
  @Property({ default: 0 })
  epcisEpcCount!: number;

  @Property({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  epcisFeeRate?: string;

  // Customs Filings
  @Property({ default: 0 })
  customsFilings!: number;

  @Property({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  customsFeeRate?: string;

  // Stripe reporting
  @Property({ default: false })
  reportedToStripe!: boolean;

  @Property({ nullable: true })
  reportedAt?: Date;
}
```

### Recall Usage Tracking

```typescript
import { Entity, Property, ManyToOne, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';
import { Organization } from './Organization';
import { Recall } from './Recall';

@Entity({ tableName: 'recall_usage' })
export class RecallUsage extends BaseEntity {
  @ManyToOne(() => Organization)
  @Index()
  organization!: Organization;

  @ManyToOne(() => Recall)
  @Index()
  recall!: Recall;

  @Property({ type: 'date' })
  periodStart!: Date;

  @Property({ type: 'date' })
  periodEnd!: Date;

  // Recall metrics
  @Property({ default: 0 })
  itemsRecalled!: number;

  @Property({ default: 0 })
  itemsResolved!: number;

  @Property({ type: 'decimal', precision: 10, scale: 6, default: '0.001' })
  recallFeeRate!: string;

  @Property({ type: 'decimal', precision: 10, scale: 6, default: '0.0005' })
  resolutionFeeRate!: string;

  // Calculated charges
  @Property({ type: 'decimal', precision: 10, scale: 2, default: '0' })
  recallCharge!: string;

  @Property({ type: 'decimal', precision: 10, scale: 2, default: '0' })
  resolutionCharge!: string;

  @Property({ default: false })
  reportedToStripe!: boolean;

  @Property({ nullable: true })
  reportedAt?: Date;
}
```

### Verification API Subscription (Retailer)

```typescript
import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';

export enum VerificationTier {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
}

@Entity({ tableName: 'retailer' })
export class Retailer extends BaseEntity {
  @Property()
  name!: string;

  @Property()
  contactEmail!: string;

  @Property({ nullable: true })
  stripeCustomerId?: string;
}

@Entity({ tableName: 'verification_api_subscription' })
export class VerificationApiSubscription extends BaseEntity {
  @ManyToOne(() => Retailer)
  retailer!: Retailer;

  @Enum(() => VerificationTier)
  tier: VerificationTier = VerificationTier.FREE;

  @Property({ nullable: true })
  stripeSubscriptionId?: string;

  @Property({ default: 100 })
  rateLimitPerMinute!: number;

  @Property({ default: 100 })
  batchLimit!: number;

  @Property({ default: false })
  webhooksEnabled!: boolean;

  @Property({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  slaPercentage?: string;

  // Current period usage
  @Property({ type: 'bigint', default: 0 })
  currentPeriodCalls!: number;

  @Property()
  currentPeriodStart!: Date;
}

@Entity({ tableName: 'verification_api_usage' })
export class VerificationApiUsage extends BaseEntity {
  @ManyToOne(() => Retailer)
  @Index()
  retailer!: Retailer;

  @Property()
  endpoint!: 'single' | 'batch' | 'feed';

  @Property({ default: 0 })
  calls!: number;

  @Property({ default: 0 })
  itemsChecked!: number;

  @Property({ type: 'date' })
  @Index()
  date!: Date;
}
```

---

## 3. DPP Billing Trigger

DPP fees are charged when a DPP transitions from `COMMISSIONED` to `PROVISIONED` status.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DPP BILLING TRIGGER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  COMMISSIONED (Serial Created)                                              │
│  ─────────────────────────────                                               │
│  • URI reserved, QR label printed                                           │
│  • Empty shell - no data frozen                                             │
│  • NO CHARGE - this is just reservation                                     │
│                                                                              │
│  PROVISIONED (Batch Released)                                               │
│  ─────────────────────────────                                               │
│  • Data frozen from Design + Marketing + Operations                         │
│  • Snapshot sealed with organization's DID                                  │
│  • BILLING EVENT - per-DPP fee charged                                      │
│                                                                              │
│  WHY THIS MATTERS:                                                          │
│  • Customers can print labels immediately (no bottleneck)                   │
│  • Billing only occurs when real compliance work is done                    │
│  • Failed batches never get charged                                         │
│  • Aligns cost with value delivered                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Pricing Structure

### Tier Pricing

| Tier | Base Fee | Users | DPP Price | Volume Discounts |
|------|----------|-------|-----------|------------------|
| **Starter** | EUR 149/mo | 20 | EUR 0.10/DPP | 10K+: EUR 0.08 |
| **Growth** | EUR 299/mo | 50 | EUR 0.05/DPP | 50K+: EUR 0.03, 100K+: EUR 0.02 |
| **Scale** | EUR 749/mo | 100 | EUR 0.02/DPP | 500K+: EUR 0.01, 1M+: EUR 0.008 |
| **Enterprise** | EUR 1,999/mo | 200 | EUR 0.008/DPP | 5M+: EUR 0.005, 10M+: EUR 0.003 |
| **Platform** | Custom | Custom | EUR 0.001-0.003 | Negotiated |

### SKU Hosting Fee

| Fee | Amount | Billing |
|-----|--------|---------|
| **SKU Hosting** | EUR 0.50/year per active SKU | Monthly (EUR 0.042/month prorated) |

**Active SKU Definition:**
- Has at least one RELEASED Design Version
- OR has at least one DPP in PROVISIONED/ACTIVE state
- Product is not archived

### User Overage

| Tier | Users Included | Overage Rate |
|------|----------------|--------------|
| All tiers | As above | EUR 10/user/month |

Users counted as Monthly Active Users (MAU) - unique users who logged in during billing period.

---

## 5. 10-Year TCO Analysis

### Per-DPP Cost Structure

| Component | Cost |
|-----------|------|
| COMMISSIONED phase (PostgreSQL row) | EUR 0.000013 |
| PROVISIONED phase (snapshot, signing) | EUR 0.00075 |
| TSA (Merkle batched) | EUR 0.000024 |
| Lifecycle updates | EUR 0.000002 |
| **Total Base Cost** | **EUR 0.00079** |
| **With 3x Safety Buffer** | **EUR 0.0024** |

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
- Never price below: EUR 0.002/DPP

### Merkle Tree Timestamping

RFC 3161 timestamps included for all tiers via Merkle batching:

```
INSTEAD OF:                          WE DO:
────────────                         ──────
DPP-001 → TSA → EUR 0.01             DPP-001 ─┐
DPP-002 → TSA → EUR 0.01             DPP-002 ─┼─► Merkle Root ──► TSA
DPP-003 → TSA → EUR 0.01             DPP-003 ─┤                  │
...                                  ...      │                  ▼
DPP-500 → TSA → EUR 0.01             DPP-500 ─┘              EUR 0.01 total
─────────────────────────            ─────────────────────────────────────
500 DPPs = EUR 5.00                  500 DPPs = EUR 0.01 = EUR 0.00002/DPP
```

| Batch Size | TSA Cost | Per-DPP Cost | Savings |
|------------|----------|--------------|---------|
| 100 DPPs | EUR 0.01 | EUR 0.0001 | 99% |
| 500 DPPs | EUR 0.01 | EUR 0.00002 | 99.8% |
| 1,000 DPPs | EUR 0.01 | EUR 0.00001 | 99.9% |

---

## 6. Shipping & Logistics Billing

### Shipping Pricing by Tier

| Fee Type | Starter | Growth | Scale | Enterprise | Platform |
|----------|---------|--------|-------|------------|----------|
| Compliance Unlock | EUR 25 | EUR 20 | EUR 15 | EUR 10 | EUR 5 |
| EPCIS Event (per EPC) | EUR 0.05 | EUR 0.04 | EUR 0.03 | EUR 0.02 | EUR 0.01 |
| Customs Filing | EUR 50 | EUR 40 | EUR 35 | EUR 25 | EUR 15 |
| Label Markup | 10% | 10% | 10% | 10% | 10% |

### Shipping 10-Year TCO

| Component | Cost |
|-----------|------|
| Evidence Package JSON (R2) | EUR 0.00025 |
| Customs PDF (R2) | EUR 0.0017 |
| EPCIS Events (DynamoDB) | EUR 0.0004 |
| Shipping Label (R2, 90-day) | EUR 0.000004 |
| **Total Storage** | **EUR 0.0024** |

All shipping fees maintain 99%+ gross margins even at Platform tier.

---

## 7. Recall Operations Billing

### Recall Pricing

| Operation | Price per Item | Minimum Charge |
|-----------|----------------|----------------|
| **Recall Initiation** | EUR 0.001/item | EUR 10.00 |
| **Recall Resolution** | EUR 0.0005/item | EUR 5.00 |

### Example: Recall 50,000 Items

```
Recall Initiation:  50,000 × EUR 0.001  = EUR 50.00
Recall Resolution:  50,000 × EUR 0.0005 = EUR 25.00
Total:                                    EUR 75.00

Cost (80% margin):  50,000 × EUR 0.00017 × 2 = EUR 17.00
Revenue:            EUR 75.00
Gross Profit:       EUR 58.00 (77% margin)
```

---

## 8. Verification Proof Service (Retailer Revenue)

### ESPR Article 31 Compliance

| Service | What It Is | Price | ESPR Status |
|---------|------------|-------|-------------|
| **Status Check** | "Is this product recalled?" | **FREE** | Mandated by Article 31 |
| **Proof Receipt** | Cryptographic proof you checked | **PAID** | Value-add service |

```
FREE (ESPR Article 31):
• GET /api/v1/public/status/:gtin/:serial → "CLEAR" or "RECALLED"
• GET /api/v1/public/recall/feed → Active recalls list

PAID (Proof Service):
• Cryptographic proof receipt (Merkle path + TSA verification)
• Audit trail storage (7 years on Enterprise)
• Batch proof processing
• SLA guarantees
```

### Verification Tiers

| Tier | Price | Proof Receipts | Features |
|------|-------|----------------|----------|
| **Free** | EUR 0 | Status only | ESPR-mandated |
| **Basic** | EUR 49/mo | 10,000/mo | Email support |
| **Professional** | EUR 199/mo | 50,000/mo | 99.9% SLA, webhooks |
| **Enterprise** | EUR 999+/mo | Unlimited | 99.99% SLA, 7-year storage |

---

## 9. Marketplace Revenue (Regulatory Advisor)

The Template Marketplace allows compliance consultants to publish rule templates that other organizations can adopt. Revenue is shared between publishers and the platform.

> **Full Design:** See [Compliance Architecture](../architecture/compliance-architecture.md) for complete marketplace specification.

### Revenue Model

| Revenue Stream | Split | Description |
|----------------|-------|-------------|
| **Template Adoption Fee** | 70% Publisher / 30% Platform | One-time or recurring fee for template adoption |
| **Premium Rule Packs** | 70% Publisher / 30% Platform | Bundled templates for specific regulations |
| **AI Regulation Ingestion** | Platform Revenue | Fee for automated PDF anchor extraction |
| **Consulting Referrals** | 80% Consultant / 20% Platform | Referral fees for implementation services |

### Template Pricing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TEMPLATE MARKETPLACE PRICING                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SYSTEM TEMPLATES (EuroComply-Managed)                                      │
│  ─────────────────────────────────────                                       │
│  • Included free with all plans                                             │
│  • Core EU regulations (ESPR, REACH, etc.)                                  │
│  • Auto-updated when regulations change                                     │
│                                                                              │
│  MARKETPLACE TEMPLATES (Publisher Pricing)                                  │
│  ─────────────────────────────────────────                                   │
│  • Free tier: Publishers can offer free templates for exposure              │
│  • One-time: EUR 99 - EUR 499 per template adoption                        │
│  • Subscription: EUR 19 - EUR 99/month for ongoing updates                 │
│  • Enterprise: Custom pricing for multi-tenant deployments                  │
│                                                                              │
│  PREMIUM RULE PACKS (Curated Bundles)                                       │
│  ─────────────────────────────────────                                       │
│  • "EU Market Entry": EUR 299 (includes ESPR + REACH + CBAM + EUDR)        │
│  • "Textile Compliance": EUR 199 (industry-specific rules)                 │
│  • "Full Sustainability": EUR 499 (environmental + social + governance)    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Publisher Payout Flow

```typescript
interface MarketplaceTransaction {
  id: string;
  templateId: string;
  adopter: Organization;
  publisher: Organization;

  grossAmount: number;      // EUR 299.00
  platformFee: number;      // EUR 89.70 (30%)
  publisherPayout: number;  // EUR 209.30 (70%)

  stripeTransferId: string; // Stripe Connect transfer
  payoutStatus: 'PENDING' | 'COMPLETED' | 'FAILED';
}

// Monthly payout aggregation
interface PublisherPayout {
  publisherId: string;
  periodStart: Date;
  periodEnd: Date;
  adoptionCount: number;
  grossRevenue: number;
  platformFees: number;
  netPayout: number;
  stripePayoutId: string;
}
```

### Publisher Verification

| Level | Requirements | Benefits |
|-------|--------------|----------|
| **Standard** | Email verified, template review | Basic publishing |
| **Verified** | Identity verification, LinkedIn profile | "Verified" badge, featured placement |
| **Expert** | Credentials verified (e.g., ISO auditor certification) | "Expert" badge, premium pricing tier |
| **Partner** | Formal partnership agreement | Co-marketing, priority support |

### MikroORM Entities

```typescript
@Entity({ tableName: 'marketplace_transactions' })
export class MarketplaceTransaction extends BaseEntity {
  @ManyToOne(() => MarketplaceListing)
  listing!: MarketplaceListing;

  @ManyToOne(() => Organization)
  adopter!: Organization;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  grossAmountCents!: number;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  platformFeeCents!: number;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  publisherPayoutCents!: number;

  @Property({ length: 100, nullable: true })
  stripePaymentIntentId?: string;

  @Property({ length: 100, nullable: true })
  stripeTransferId?: string;

  @Enum(() => PayoutStatus)
  payoutStatus!: PayoutStatus;

  @Property()
  createdAt: Date = new Date();

  @Property({ nullable: true })
  paidOutAt?: Date;
}

export enum PayoutStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
```

### Invoice Line Items

Marketplace transactions appear as separate line items on both sides:

**Adopter Invoice:**
```
MARKETPLACE TEMPLATES
 - ESPR Compliance Pack (one-time)            1    EUR 299.00    EUR 299.00
 - Textile Industry Rules (monthly)           1     EUR 49.00     EUR 49.00
Marketplace Subtotal                                             EUR 348.00
```

**Publisher Statement:**
```
MARKETPLACE PAYOUTS
 - ESPR Compliance Pack × 12 adoptions       12    EUR 209.30  EUR 2,511.60
 - Textile Industry Rules × 45 subscribers   45     EUR 34.30  EUR 1,543.50
Gross Payout                                                   EUR 4,055.10
```

---

## 10. Invoice Structure

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
│  Scale Plan (Monthly Base Fee)               1   EUR 749.00    EUR 749.00  │
│                                                                              │
│  DPP PROVISIONING                                                           │
│   - First 500,000 DPPs at EUR 0.02       500,000     EUR 0.02 EUR 10,000.00│
│   - Next 250,000 DPPs at EUR 0.01        250,000     EUR 0.01  EUR 2,500.00│
│  DPP Subtotal (750,000 DPPs)                                EUR 12,500.00  │
│                                                                              │
│  SKU HOSTING                                                                │
│   - 2,500 active SKUs (prorated)          2,500   EUR 0.042    EUR 105.00  │
│                                                                              │
│  USER OVERAGE (115 MAU, 100 included)        15    EUR 10.00    EUR 150.00  │
│                                                                              │
│  SHIPPING & LOGISTICS                                                       │
│   - Compliance Unlock                       450    EUR 15.00  EUR 6,750.00  │
│   - EPCIS Events (125,000 EPCs)         125,000     EUR 0.03  EUR 3,750.00  │
│   - Customs Filings                          12    EUR 35.00    EUR 420.00  │
│   - Carrier Costs (pass-through)                             EUR 4,500.00  │
│   - Label Markup (10%)                                         EUR 450.00  │
│  Shipping Subtotal                                          EUR 15,870.00  │
│                                                                              │
│  RECALL OPERATIONS                                                          │
│   - Recall #RCL-2026-00045 (10,000 items) 10,000   EUR 0.001    EUR 10.00  │
│                                                                              │
│                                             Subtotal:       EUR 29,384.00  │
│                                             VAT (19%):       EUR 5,582.96  │
│                                             ─────────────────────────────── │
│                                             Total:          EUR 34,966.96  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Billing Service Implementation

### DPP Billing Service

```typescript
import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { Organization, DppUsage, Plan } from '../entities';

const TIER_PRICING: Record<Plan, { base: number; tiers: { threshold: number; rate: number }[] }> = {
  [Plan.STARTER]: {
    base: 10,
    tiers: [
      { threshold: 0, rate: 10 },      // EUR 0.10
      { threshold: 10_000, rate: 8 },   // EUR 0.08
    ],
  },
  [Plan.GROWTH]: {
    base: 5,
    tiers: [
      { threshold: 0, rate: 5 },        // EUR 0.05
      { threshold: 50_000, rate: 3 },   // EUR 0.03
      { threshold: 100_000, rate: 2 },  // EUR 0.02
    ],
  },
  [Plan.SCALE]: {
    base: 2,
    tiers: [
      { threshold: 0, rate: 2 },        // EUR 0.02
      { threshold: 500_000, rate: 1 },  // EUR 0.01
      { threshold: 1_000_000, rate: 0.8 }, // EUR 0.008
    ],
  },
  [Plan.ENTERPRISE]: {
    base: 0.8,
    tiers: [
      { threshold: 0, rate: 0.8 },      // EUR 0.008
      { threshold: 5_000_000, rate: 0.5 }, // EUR 0.005
      { threshold: 10_000_000, rate: 0.3 }, // EUR 0.003
    ],
  },
  [Plan.PLATFORM]: {
    base: 0.3,
    tiers: [
      { threshold: 0, rate: 0.3 },      // EUR 0.003
    ],
  },
};

const USER_LIMITS: Record<Plan, number> = {
  [Plan.STARTER]: 20,
  [Plan.GROWTH]: 50,
  [Plan.SCALE]: 100,
  [Plan.ENTERPRISE]: 200,
  [Plan.PLATFORM]: Infinity,
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe;

  constructor(private readonly em: EntityManager) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }

  /**
   * Record DPP provisioning event (billing trigger)
   */
  async recordDppProvisioned(organizationId: string, count: number = 1): Promise<void> {
    const org = await this.em.findOneOrFail(Organization, organizationId);

    org.dppCountThisMonth += count;
    org.dppCountTotal += count;

    await this.em.flush();
  }

  /**
   * Calculate DPP cost with volume discounts
   */
  calculateDppCost(plan: Plan, dppCount: number): { totalCents: number; breakdown: DppTierBreakdown } {
    const pricing = TIER_PRICING[plan];
    const tiers = pricing.tiers.sort((a, b) => b.threshold - a.threshold);

    let remaining = dppCount;
    let totalCents = 0;
    const breakdown: DppTierBreakdown = { tiers: [] };

    for (const tier of tiers) {
      if (remaining <= 0) break;

      const countAtTier = remaining - Math.max(0, tier.threshold);
      if (countAtTier > 0) {
        const costCents = countAtTier * tier.rate;
        totalCents += costCents;
        breakdown.tiers.push({
          threshold: tier.threshold,
          count: countAtTier,
          rateCents: tier.rate,
          costCents,
        });
        remaining = tier.threshold;
      }
    }

    return { totalCents, breakdown };
  }

  /**
   * Calculate user overage
   */
  calculateUserOverage(plan: Plan, mauCount: number): { overage: number; costCents: number } {
    const limit = USER_LIMITS[plan];
    const overage = Math.max(0, mauCount - limit);
    const costCents = overage * 1000; // EUR 10 = 1000 cents

    return { overage, costCents };
  }

  /**
   * Report monthly usage to Stripe
   */
  async reportMonthlyUsage(organizationId: string): Promise<void> {
    const org = await this.em.findOneOrFail(Organization, organizationId);

    if (!org.subscriptionId) {
      throw new Error('Organization has no subscription');
    }

    const subscription = await this.stripe.subscriptions.retrieve(org.subscriptionId);

    // Report DPP usage
    const dppItem = subscription.items.data.find(
      (item) => item.price.metadata?.type === 'dpp_usage',
    );

    if (dppItem && org.dppCountThisMonth > 0) {
      await this.stripe.subscriptionItems.createUsageRecord(dppItem.id, {
        quantity: org.dppCountThisMonth,
        action: 'set',
        timestamp: 'now',
      });
    }

    // Report user overage
    const { overage } = this.calculateUserOverage(org.plan, org.mauCountThisMonth);

    if (overage > 0) {
      const userItem = subscription.items.data.find(
        (item) => item.price.metadata?.type === 'user_overage',
      );

      if (userItem) {
        await this.stripe.subscriptionItems.createUsageRecord(userItem.id, {
          quantity: overage,
          action: 'set',
          timestamp: 'now',
        });
      }
    }

    // Report SKU hosting
    if (org.activeSkuCount > 0) {
      const skuItem = subscription.items.data.find(
        (item) => item.price.metadata?.type === 'sku_hosting',
      );

      if (skuItem) {
        await this.stripe.subscriptionItems.createUsageRecord(skuItem.id, {
          quantity: org.activeSkuCount,
          action: 'set',
          timestamp: 'now',
        });
      }
    }

    this.logger.log(
      `Reported usage for ${organizationId}: ${org.dppCountThisMonth} DPPs, ${overage} user overage, ${org.activeSkuCount} SKUs`,
    );
  }
}

interface DppTierBreakdown {
  tiers: Array<{
    threshold: number;
    count: number;
    rateCents: number;
    costCents: number;
  }>;
}
```

### MAU Tracking Service

```typescript
import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { UserActivityLog } from '../entities';

@Injectable()
export class MauTrackingService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Record user activity (called on authenticated requests)
   */
  async trackActivity(userId: string, organizationId: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Upsert - one entry per user per org per day
    await this.em.upsert(UserActivityLog, {
      organization: organizationId,
      user: userId,
      activityDate: today,
    });
  }

  /**
   * Calculate MAU for billing period
   */
  async calculateMau(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const result = await this.em.createQueryBuilder(UserActivityLog, 'ual')
      .select('COUNT(DISTINCT ual.user_id)', 'count')
      .where({
        organization: { id: organizationId },
        activityDate: {
          $gte: periodStart,
          $lte: periodEnd,
        },
      })
      .execute('get');

    return parseInt(result.count, 10);
  }

  /**
   * Clean up old activity logs after billing period
   */
  async cleanupOldLogs(organizationId: string, beforeDate: Date): Promise<number> {
    const result = await this.em.nativeDelete(UserActivityLog, {
      organization: { id: organizationId },
      activityDate: { $lt: beforeDate },
    });

    return result;
  }
}
```

### Stripe Webhook Handler

```typescript
import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { Organization, BillingSnapshot, SubscriptionStatus } from '../entities';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly em: EntityManager,
    private readonly billingService: BillingService,
    private readonly mauService: MauTrackingService,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }

  async handleWebhook(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;

      default:
        this.logger.debug(`Unhandled webhook event: ${event.type}`);
    }
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const org = await this.em.findOne(Organization, {
      stripeCustomerId: invoice.customer as string,
    });

    if (!org) {
      this.logger.warn(`Organization not found for customer ${invoice.customer}`);
      return;
    }

    // Calculate costs for snapshot
    const { totalCents: dppCostCents } = this.billingService.calculateDppCost(
      org.plan,
      org.dppCountThisMonth,
    );
    const { overage, costCents: userOverageCostCents } = this.billingService.calculateUserOverage(
      org.plan,
      org.mauCountThisMonth,
    );

    // Create billing snapshot
    const snapshot = this.em.create(BillingSnapshot, {
      organization: org,
      periodStart: new Date(invoice.period_start * 1000),
      periodEnd: new Date(invoice.period_end * 1000),
      plan: org.plan,
      dppCount: org.dppCountThisMonth,
      dppCostCents,
      activeSkuCount: org.activeSkuCount,
      skuHostingCostCents: Math.round(org.activeSkuCount * 4.2), // EUR 0.042/month
      mauCount: org.mauCountThisMonth,
      userOverage: overage,
      userOverageCostCents,
      baseFeeCents: this.getBaseFeeCents(org.plan),
      stripeInvoiceId: invoice.id,
    });

    this.em.persist(snapshot);

    // Reset monthly counters
    org.subscriptionStatus = SubscriptionStatus.ACTIVE;
    org.dppCountThisMonth = 0;
    org.mauCountThisMonth = 0;

    await this.em.flush();

    // Clean up old MAU logs
    await this.mauService.cleanupOldLogs(
      org.id,
      new Date(invoice.period_start * 1000),
    );

    this.logger.log(`Payment succeeded for ${org.id}, snapshot created: ${snapshot.id}`);
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const org = await this.em.findOne(Organization, {
      stripeCustomerId: invoice.customer as string,
    });

    if (!org) return;

    org.subscriptionStatus = SubscriptionStatus.PAST_DUE;
    await this.em.flush();

    // TODO: Send dunning email
    this.logger.warn(`Payment failed for ${org.id}`);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const org = await this.em.findOne(Organization, {
      subscriptionId: subscription.id,
    });

    if (!org) return;

    org.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    org.subscriptionStatus = this.mapStripeStatus(subscription.status);

    await this.em.flush();
  }

  private async handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
    const org = await this.em.findOne(Organization, {
      subscriptionId: subscription.id,
    });

    if (!org) return;

    org.subscriptionStatus = SubscriptionStatus.CANCELED;
    await this.em.flush();

    this.logger.log(`Subscription canceled for ${org.id}`);
  }

  private getBaseFeeCents(plan: Plan): number {
    const fees: Record<Plan, number> = {
      [Plan.STARTER]: 14900,
      [Plan.GROWTH]: 29900,
      [Plan.SCALE]: 74900,
      [Plan.ENTERPRISE]: 199900,
      [Plan.PLATFORM]: 0, // Custom
    };
    return fees[plan];
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    const mapping: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
      trialing: SubscriptionStatus.TRIALING,
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      paused: SubscriptionStatus.PAUSED,
      incomplete: SubscriptionStatus.PAST_DUE,
      incomplete_expired: SubscriptionStatus.CANCELED,
      unpaid: SubscriptionStatus.PAST_DUE,
    };
    return mapping[status];
  }
}
```

---

## 12. Billing Access Control

### Who Can Manage Billing

| Action | Organization Admin | Workspace MANAGER |
|--------|:------------------:|:-----------------:|
| View current plan | Yes | No |
| View invoices | Yes | No |
| View DPP usage | Yes | No |
| Update payment method | Yes | No |
| Upgrade/downgrade plan | Yes | No |
| Cancel subscription | Yes | No |

---

## 13. Stripe Products Configuration

### Product Structure

| Product | Price ID Pattern | Type |
|---------|------------------|------|
| Base Fee (per tier/cycle) | `price_starter_monthly` | Fixed recurring |
| DPP Usage (per tier) | `price_dpp_starter` | Metered (per unit) |
| SKU Hosting | `price_sku_hosting` | Metered (per unit) |
| User Overage | `price_user_overage` | Metered (EUR 10/unit) |
| Shipping - Compliance | `price_shipping_compliance_{tier}` | Metered |
| Shipping - EPCIS | `price_shipping_epcis_{tier}` | Metered |
| Recall Operations | `price_recall_ops` | Metered |

### Subscription Creation

```typescript
async function createSubscription(
  customerId: string,
  plan: Plan,
  cycle: BillingCycle,
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [
      { price: `price_${plan.toLowerCase()}_${cycle.toLowerCase()}` },
      { price: `price_dpp_${plan.toLowerCase()}` },
      { price: 'price_sku_hosting' },
      { price: 'price_user_overage' },
    ],
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    metadata: {
      organizationId: 'org_id',
      plan,
    },
  });
}
```

---

## 14. Related Documents

| Document | Purpose |
|----------|---------|
| [Business Model](./00-business-model.md) | Pricing tiers, unit economics |
| [Operations Workspace](./06-operations-workspace.md) | Shipping & logistics |
| [Compliance Workspace](./08-compliance-workspace.md) | DPP lifecycle, recall |
| [Security](./03-security.md) | Organization admin definition |
| [Compliance Architecture](../architecture/compliance-architecture.md) | Template marketplace, adoption fees |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 2.1 | 2026-01-21 | Added Marketplace Revenue (Section 9); template pricing, publisher payouts, verification levels |
| 2.0 | 2026-01-21 | Consolidated from billing design, converted to MikroORM |
