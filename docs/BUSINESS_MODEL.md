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

### ✅ Suppliers (Producers, Distributors, Brands)

**Only verified suppliers can create Digital Product Passports.**

| Supplier Type | Role | Data Source | VC Attribution |
|---------------|------|-------------|----------------|
| **Producer** | Manufacturer of the product | Primary (owns the data) | "Verified by [Producer]" |
| **Distributor** | Wholesaler in supply chain | Secondary (from producer docs) | "Attested by [Distributor]" |
| **Brand** | Brand owner (may not manufacture) | Primary or secondary | "Verified by [Brand]" |

All supplier types:
- Must pass KYB (Know Your Business) verification
- Have product knowledge and/or certifications
- Control the source of truth for product data
- Set their own pricing

### Producer vs Distributor

```
┌─────────────────────────────────────────────────────────────────────┐
│  SUPPLY CHAIN SCENARIOS                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  SCENARIO A: Producer Creates DPP (Strongest)                        │
│  ─────────────────────────────────────────────                       │
│  Producer ──creates DPP──▶ Distributor ──pass-through──▶ Retailer   │
│     │                                                        │       │
│     └── Has primary data (manufacturing, materials, LCA)     │       │
│                                         Retailer subscribes ─┘       │
│                                                                      │
│  SCENARIO B: Distributor Creates DPP (Valid)                         │
│  ───────────────────────────────────────────                         │
│  Producer ──spec sheets──▶ Distributor ──creates DPP──▶ Retailer    │
│     │                           │                           │        │
│     │                           └── Uses producer docs      │        │
│     └── Doesn't use EuroComply      to create DPP           │        │
│                                         Retailer subscribes ─┘       │
│                                                                      │
│  Both are compliant. Producer-created is more authoritative.         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### ❌ Retailers (Merchants, Resellers)

**Retailers cannot create their own passports.**

- Subscribe to supplier passports via Shopify/WooCommerce plugin
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

## Value Proposition for Retailers

### The Math: DPP Cost vs. Product Profit

**DPP subscriptions are negligible compared to product margins.**

| Scenario | Monthly Product Profit | DPP Cost | Cost as % of Profit |
|----------|----------------------|----------|---------------------|
| T-shirt (single SKU) | €2,000 | €1.00 | **0.05%** |
| Small store (50 SKUs) | €10,000 | €25-50 | **0.25-0.5%** |
| Medium store (200 SKUs) | €50,000 | €100-200 | **0.2-0.4%** |
| Large store (1,000 SKUs) | €500,000 | €500-1,000 | **0.1-0.2%** |

**Result: Always under 1% of revenue.**

### What Retailers Get for €1/Product/Month

| Benefit | Value |
|---------|-------|
| **EU Compliance** | Avoid ESPR fines (can be €thousands) |
| **Consumer Trust** | "Verified by [Supplier]" badge |
| **Zero Work** | Supplier maintains all data |
| **Auto-Updates** | When supplier improves data, retailer gets it free |
| **Competitive Edge** | Stand out from non-compliant competitors |

### Alternative Costs (Without EuroComply)

| Option | Estimated Cost |
|--------|---------------|
| Hire compliance consultant | €5,000+ one-time |
| Build own DPP system | €50,000+ development |
| Non-compliance fines | Variable, potentially severe |
| Lost sales (no sustainability badge) | Unquantifiable |

**€1/month is a no-brainer.**

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

#### For Producers (Manufacturers)

| Incentive | Description |
|-----------|-------------|
| **Revenue** | Earn recurring income from all downstream retailers |
| **Brand consistency** | Same DPP data across ALL retailers selling your products |
| **Enforcement power** | Can require retailers to use your passports |
| **Marketing reach** | Your brand shown on every retailer's product page |
| **Control** | Single source of truth - no fragmented claims |

#### For Distributors

| Incentive | Description |
|-----------|-------------|
| **Value-add service** | Offer DPP access as part of your distribution |
| **Revenue** | Earn from retailers who can't get DPPs from producers |
| **Competitive advantage** | Differentiate from distributors without DPP support |
| **Compliance enabler** | Help your retailer network become ESPR-compliant |

#### For Both

| Incentive | Description |
|-----------|-------------|
| **ESPR compliance** | Fulfill EU regulatory requirements |
| **Verified badge** | "Verified Supplier" increases credibility |
| **Ecosystem access** | Reach retailers through Shopify/WooCommerce plugins |

### Why Retailers Join

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

## Ecosystem Value

### Why the Ecosystem Matters

EuroComply's value isn't just the DPP data - it's the **ecosystem** that connects suppliers to retailers.

```
┌─────────────────────────────────────────────────────────────────────┐
│  THE EUROCOMPLY ECOSYSTEM                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  SUPPLIER SIDE                    RETAILER SIDE                      │
│  ────────────────                 ─────────────                      │
│  • Supplier Portal                • Shopify Plugin                   │
│  • Bulk CSV Import                • WooCommerce Plugin               │
│  • API Integration                • Storefront Widgets               │
│  • Earnings Dashboard             • QR Code Generation               │
│  • Verification System            • Public Verification Page         │
│                                                                      │
│                    CONNECTING LAYER                                  │
│                    ────────────────                                  │
│                    • Supplier Catalog                                │
│                    • GTIN/Barcode Lookup                             │
│                    • Subscription Billing                            │
│                    • Verifiable Credentials                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### The Multi-Tier Distribution Advantage

Retailers often don't buy directly from producers. They buy from distributors.

**Without EuroComply:**
```
Producer → Distributor → Retailer → Consumer
   │            │            │
   │            │            └── "Where do I get DPP data?"
   │            └── "I just resell, I don't have this data"
   └── "I don't deal with retailers directly"
```

**With EuroComply:**
```
Producer → Distributor → Retailer → Consumer
   │                         │
   │                         └── Subscribes to Producer's DPP via platform
   └── Creates DPP once, all retailers can access it
```

The ecosystem bridges the gap between producers and retailers, even when they don't have direct relationships.

### Product Discovery (GTIN Lookup)

Retailers can find DPPs by scanning product barcodes:

1. Retailer receives products from distributor
2. Scans GTIN/barcode
3. EuroComply finds matching DPP from producer
4. Retailer subscribes with one click

This is only possible because we have the ecosystem connecting both sides.

---

## Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    EUROCOMPLY MODEL                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WHO CREATES PASSPORTS?                                     │
│  → Producers (strongest - primary data)                     │
│  → Distributors (valid - secondary data)                    │
│  → Brands (depends on structure)                            │
│                                                             │
│  WHO USES PASSPORTS?                                        │
│  → Retailers subscribe via Shopify/WooCommerce              │
│                                                             │
│  WHO SETS PRICES?                                           │
│  → Suppliers (minimum €0.50/product/month)                  │
│                                                             │
│  WHO EARNS WHAT?                                            │
│  → Suppliers: 80% of subscription price                     │
│  → Platform: 20% of subscription price                      │
│                                                             │
│  WHY IS IT WORTH IT FOR RETAILERS?                          │
│  → €1/month vs €2,000/month profit = 0.05%                  │
│  → Compliance, trust badge, zero work                       │
│                                                             │
│  WHY NO FRAUD?                                              │
│  → Retailers can't create passports                         │
│  → Only verified suppliers can make claims                  │
│                                                             │
│  WHY THE ECOSYSTEM MATTERS?                                 │
│  → Connects producers to retailers across distribution      │
│  → GTIN lookup enables discovery without relationships      │
│  → Widgets, plugins, verification pages                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

*Last Updated: 2026-01-07*
