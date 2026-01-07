# EuroComply Business Model

## Overview

EuroComply is a **supplier-driven marketplace** for Digital Product Passports (DPPs). Only verified suppliers can create passports, and merchants subscribe to use them.

```
┌─────────────────────────────────────────────────────────────┐
│                   THE EUROCOMPLY FLYWHEEL                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ┌──────────┐         enforces          ┌──────────┐     │
│    │ SUPPLIER │ ─────────────────────────▶│ MERCHANT │     │
│    └────┬─────┘                           └────┬─────┘     │
│         │                                      │           │
│         │ creates DPPs                         │ subscribes │
│         │ sets price                           │ displays   │
│         │ earns revenue                        │ DPPs       │
│         │                                      │           │
│         ▼                                      ▼           │
│    ┌─────────────────────────────────────────────┐         │
│    │              EUROCOMPLY PLATFORM            │         │
│    │  • Hosts passports                          │         │
│    │  • Processes payments                       │         │
│    │  • Issues Verifiable Credentials            │         │
│    │  • Takes platform fee                       │         │
│    └─────────────────────────────────────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Who Creates Passports?

### ✅ Suppliers (Manufacturers, Brands, Wholesalers)

**Only verified suppliers can create Digital Product Passports.**

- Must pass KYB (Know Your Business) verification
- Have actual product knowledge and certifications
- Control the source of truth for product data
- Set their own pricing

### ❌ Merchants (Retailers, Resellers)

**Merchants cannot create their own passports.**

- Subscribe to supplier passports via Shopify plugin
- Pay the supplier's price per product per month
- Display the supplier's verified DPP on their store
- Cannot modify the passport data

---

## Pricing Model

### Supplier-Set Dynamic Pricing

**Suppliers choose their own price.** EuroComply does not dictate pricing.

| Parameter | Value |
|-----------|-------|
| **Floor Price** | €0.50/product/month (minimum) |
| **Ceiling** | None (suppliers can charge what they want) |
| **Platform Fee** | 20% of supplier's price |

### Examples

| Supplier Price | Platform Fee (20%) | Supplier Receives |
|---------------|-------------------|-------------------|
| €0.50 (floor) | €0.10 | €0.40 |
| €1.00 | €0.20 | €0.80 |
| €2.50 | €0.50 | €2.00 |
| €5.00 | €1.00 | €4.00 |
| €10.00 | €2.00 | €8.00 |

### Why Dynamic Pricing?

1. **Suppliers know their market** - A luxury brand may charge €10, a commodity supplier €0.50
2. **Value-based pricing** - Complex DPPs with more data are worth more
3. **Competition** - Market forces keep prices reasonable
4. **Incentive alignment** - Suppliers earn more by creating better passports

---

## Revenue Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      MONTHLY BILLING                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Merchant pays: €2.00/product/month                         │
│                                                             │
│       ┌────────────────┬────────────────┐                   │
│       │                │                │                   │
│       ▼                ▼                │                   │
│   ┌────────┐      ┌────────┐            │                   │
│   │ €1.60  │      │ €0.40  │            │                   │
│   │Supplier│      │Platform│            │                   │
│   │  (80%) │      │  (20%) │            │                   │
│   └────────┘      └────────┘            │                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Why This Model Eliminates Fraud

### The Problem (Old Model)

In models where merchants can create their own passports:
- Merchants could copy supplier data
- Merchants could make false certification claims
- No accountability for accuracy
- Required complex proof verification systems

### The Solution (Supplier-Only Model)

| Fraud Vector | How It's Eliminated |
|--------------|---------------------|
| **Copying data** | Merchants can't create passports - only subscribe |
| **False certifications** | Only verified suppliers can claim certifications |
| **Unverified claims** | Suppliers pass KYB verification |
| **No accountability** | Supplier is legally liable for DPP accuracy |

### Trust Chain

```
Certification Body ──verifies──▶ Supplier ──creates──▶ DPP ──subscribes──▶ Merchant
       │                            │                   │                    │
       │                            │                   │                    │
   (GOTS, FSC,                 (KYB verified,      (Signed VC,          (Display only,
    OEKO-TEX)                   liable)            immutable)            no edit)
```

---

## Incentives

### Why Suppliers Join

| Incentive | Description |
|-----------|-------------|
| **Revenue** | Earn recurring income from merchants using their DPPs |
| **Enforcement power** | Can require merchants to use their passports |
| **Brand trust** | "Verified Supplier" badge increases credibility |
| **ESPR compliance** | Fulfill EU regulatory requirements |
| **Control** | Maintain single source of truth for product data |

### Why Merchants Join

| Incentive | Description |
|-----------|-------------|
| **Supplier requirement** | Suppliers enforce DPP usage for their products |
| **Consumer trust** | Verified passports increase conversions |
| **No work** | Just subscribe - supplier maintains the data |
| **Compliance** | Meet ESPR requirements without expertise |
| **Competitive advantage** | Stand out from non-compliant competitors |

### Why Consumers Trust It

| Factor | Reason |
|--------|--------|
| **Verified source** | Passport comes from the actual manufacturer |
| **Cryptographic proof** | Signed Verifiable Credential |
| **Public verification** | Anyone can verify at eurocomply.eu |
| **No self-declaration** | Merchants can't make unverified claims |

---

## Pricing Strategy for Suppliers

### Factors to Consider

1. **Product value** - Higher-value products can support higher DPP prices
2. **Data complexity** - More detailed passports justify higher prices
3. **Certification value** - Certified products (GOTS, FSC) can charge premium
4. **Market competition** - Other suppliers' prices for similar products
5. **Merchant volume** - High-volume merchants may negotiate bulk rates

### Suggested Pricing Tiers

| Product Category | Suggested Price Range |
|-----------------|----------------------|
| **Commodity textiles** | €0.50 - €1.00 |
| **Certified textiles** | €1.00 - €3.00 |
| **Premium/luxury** | €3.00 - €10.00 |
| **Electronics** | €1.00 - €5.00 |
| **Furniture** | €1.00 - €5.00 |
| **Batteries (industrial)** | €5.00 - €20.00 |

*These are suggestions only. Suppliers set their own prices.*

---

## Platform Economics

### Revenue Model

```
Platform Revenue = Σ (Merchant Subscriptions × 20%)
```

### Example: 10,000 Active Subscriptions

| Average Price | Monthly Platform Revenue |
|--------------|-------------------------|
| €1.00 | €2,000 |
| €2.00 | €4,000 |
| €3.00 | €6,000 |

### Scaling

| Metric | 1 Year | 3 Years | 5 Years |
|--------|--------|---------|---------|
| **Suppliers** | 100 | 1,000 | 5,000 |
| **Merchants** | 1,000 | 20,000 | 100,000 |
| **Active Subscriptions** | 5,000 | 200,000 | 2,000,000 |
| **Platform Revenue/mo** | €5,000 | €200,000 | €2,000,000 |

*Assumes €2.50 average price, 20% platform fee*

---

## Implementation Notes

### Database Schema

The current schema already supports this model:

```prisma
model SupplierProduct {
  id          String   @id
  supplierId  String
  price       Decimal  @db.Decimal(10, 2)  // Supplier-set price
  // ... DPP data
}

model MerchantSupplierLink {
  id                String   @id
  supplierProductId String
  merchantShop      String
  linkType          MerchantLinkType  // LINKED only (no FORKED)
  // ... subscription tracking
}
```

### Validation Changes

Since merchants can't create passports:
- Remove `ValidationOptions.isSupplierLinked` logic
- Validation always assumes supplier context
- No need for certification proof requirements on merchant side

### Shopify Plugin

The plugin should:
1. **Remove** passport creation UI for merchants
2. **Keep** supplier catalog browsing
3. **Keep** subscription/linking flow
4. **Show** supplier's price before subscribing

---

## Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    EUROCOMPLY MODEL                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WHO CREATES PASSPORTS?                                     │
│  → Only verified suppliers                                  │
│                                                             │
│  WHO USES PASSPORTS?                                        │
│  → Merchants subscribe via Shopify                          │
│                                                             │
│  WHO SETS PRICES?                                           │
│  → Suppliers (minimum €0.50/product/month)                  │
│                                                             │
│  WHO EARNS WHAT?                                            │
│  → Suppliers: 80% of subscription price                     │
│  → Platform: 20% of subscription price                      │
│                                                             │
│  WHY NO FRAUD?                                              │
│  → Merchants can't create passports                         │
│  → Only verified suppliers can make claims                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

*Last Updated: 2026-01-07*
