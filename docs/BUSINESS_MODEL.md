# EuroComply Business Model

## Overview

EuroComply is a **supplier-driven marketplace** for Digital Product Passports (DPPs). Only verified suppliers (producers, distributors, brands) can create passports, and retailers subscribe to use them.

```
┌─────────────────────────────────────────────────────────────┐
│                   THE EUROCOMPLY FLYWHEEL                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ┌──────────┐                             ┌──────────┐   │
│    │ PRODUCER │ ──creates DPP──────────────▶│ RETAILER │   │
│    └────┬─────┘                             └────┬─────┘   │
│         │                                        │         │
│         │ sets price                             │ subscribes│
│         │ earns 80%                              │ displays  │
│         │                                        │ DPPs      │
│         │      ┌─────────────┐                   │         │
│         │      │ DISTRIBUTOR │                   │         │
│         │      └──────┬──────┘                   │         │
│         │             │                          │         │
│         │             │ refers retailers         │         │
│         │             │ earns 10-30%             │         │
│         │             │                          │         │
│         ▼             ▼                          ▼         │
│    ┌─────────────────────────────────────────────┐         │
│    │              EUROCOMPLY PLATFORM            │         │
│    │  • Hosts passports                          │         │
│    │  • Processes payments                       │         │
│    │  • Issues Verifiable Credentials            │         │
│    │  • Takes 20% platform fee                   │         │
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

### Basic Model (No Distributor Involved)

When a retailer subscribes directly to a producer's DPP:

```
┌─────────────────────────────────────────────────────────────┐
│                      MONTHLY BILLING                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Retailer pays: €1.00/product/month                         │
│                                                             │
│       ┌────────────────┬────────────────┐                   │
│       │                │                │                   │
│       ▼                ▼                                    │
│   ┌────────┐      ┌────────┐                                │
│   │ €0.80  │      │ €0.20  │                                │
│   │Producer│      │Platform│                                │
│   │  (80%) │      │  (20%) │                                │
│   └────────┘      └────────┘                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Distributor Referral Model

When a distributor brings retailers to a producer's DPP, the producer can share revenue with the distributor.

**How it works:**
1. Producer creates DPP and sets a **referral rate** (0-30%)
2. Distributor registers as authorized distributor for that producer
3. Distributor's retailers subscribe to the producer's DPP
4. Revenue is split three ways: Producer + Distributor + Platform

```
┌─────────────────────────────────────────────────────────────────────┐
│              DISTRIBUTOR REFERRAL BILLING (Example: 20% referral)   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Retailer pays: €1.00/product/month                                 │
│                                                                     │
│       ┌────────────────┬────────────────┬────────────────┐          │
│       │                │                │                │          │
│       ▼                ▼                ▼                           │
│   ┌────────┐      ┌────────┐      ┌────────┐                        │
│   │ €0.60  │      │ €0.20  │      │ €0.20  │                        │
│   │Producer│      │Distrib.│      │Platform│                        │
│   │  (60%) │      │  (20%) │      │  (20%) │                        │
│   └────────┘      └────────┘      └────────┘                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Referral Rate Examples

Producer sets the referral rate. Platform fee (20%) is always fixed.

| Referral Rate | Producer Gets | Distributor Gets | Platform Gets |
|---------------|---------------|------------------|---------------|
| 0% (no referral) | 80% | 0% | 20% |
| 10% | 70% | 10% | 20% |
| 20% | 60% | 20% | 20% |
| 30% (max) | 50% | 30% | 20% |

### Why Producers Offer Referral Rates

| Benefit | Description |
|---------|-------------|
| **Access to retailers** | Distributors have relationships with 100s of retailers |
| **Volume** | Distributors can onboard entire retailer networks |
| **No sales effort** | Distributor does the selling, producer just creates DPP |
| **Competitive advantage** | Higher referral rates attract more distributor partners |

### Why Distributors Participate

| Benefit | Description |
|---------|-------------|
| **Recurring revenue** | Earn 10-30% of every subscription, every month |
| **No DPP creation work** | Producer maintains the data |
| **Value-add to retailers** | Offer DPP access as part of distribution package |
| **Scale economics** | 1000 retailers × 100 SKUs × €0.20 = €20,000/month |

### Example: Large Distributor

A distributor with 500 retailers, averaging 50 SKUs each, with 20% referral rate:

```
500 retailers × 50 SKUs × €1.00 × 20% = €5,000/month passive income
```

This creates a powerful incentive for distributors to actively promote producer DPPs to their retailer networks.

---

## Trust & Verification

### How the Model Prevents False Claims

| Protection | How It Works |
|------------|--------------|
| **KYB verification** | Suppliers must verify their business identity before creating DPPs |
| **Retailers can't create** | Retailers only subscribe - they cannot create or modify passport data |
| **Certification verification** | Only suppliers with valid certifications can claim them |
| **Legal liability** | Supplier who creates DPP is legally liable for accuracy under ESPR |
| **Cryptographic proof** | Each DPP is signed as a Verifiable Credential |

### Trust Chain

```
Certification Body ──verifies──▶ Supplier ──creates──▶ DPP ──subscribes──▶ Retailer
       │                            │                   │                    │
       │                            │                   │                    │
   (GOTS, FSC,                 (KYB verified,      (Signed VC,          (Display only,
    OEKO-TEX)                   liable)            immutable)            no edit)
```

---

## Supplier Legal Liability Under ESPR

### "It's Not My Problem" is Wrong

Suppliers sometimes claim: *"DPPs are the retailer's responsibility, not mine."*

**This is incorrect.** Under ESPR (Ecodesign for Sustainable Products Regulation), ALL economic operators have obligations:

| Economic Operator | ESPR Obligation |
|-------------------|-----------------|
| **Manufacturer** | Create DPP, ensure product compliance, maintain technical documentation |
| **Importer** | Verify DPP exists before placing product on EU market |
| **Distributor** | Verify DPP exists before supplying to retailers |
| **Retailer** | Display DPP, don't sell non-compliant products |

### Consequences of Non-Compliance

| Risk | Impact |
|------|--------|
| **Market access denied** | Products without DPPs cannot be sold in EU |
| **Retailer rejection** | Retailers won't stock products from non-compliant suppliers |
| **Regulatory fines** | Member state enforcement varies, but penalties exist |
| **Liability chain** | If retailer is fined, they'll pursue supplier for damages |
| **Competitive loss** | Compliant competitors take your market share |

### The Bottom Line

> "I don't have liability" is factually wrong. Distributors and producers ARE liable under ESPR. The regulation requires verification at every step of the supply chain.

---

## Incentives

### Why Suppliers Join

#### The Honest Truth About Revenue

**Revenue from subscriptions is NOT the primary value for most suppliers.**

| Supplier Size | Products | Retailers | Monthly Revenue (80%) |
|---------------|----------|-----------|----------------------|
| Small | 10 SKUs | 5 | **€40** ← peanuts |
| Medium | 100 SKUs | 20 | **€1,600** ← decent |
| Large | 500 SKUs | 100 | **€40,000** ← significant |

For small and medium suppliers, the €1/product/month is a **bonus**, not the reason to join.

#### The Real Value Proposition

| Value | Why It Matters |
|-------|----------------|
| **Avoid building own DPP system** | Building compliant DPP infrastructure costs €50-100k+ |
| **Avoid compliance fines** | ESPR violations carry penalties |
| **Market access** | Retailers WILL require DPPs - no DPP = no shelf space |
| **Brand control** | Same sustainability message across ALL retailers |
| **Retailer reach** | Access to thousands of stores via our plugins |
| **Passive income at scale** | Revenue grows as more retailers subscribe |

> You need DPPs anyway. We make it easy AND you get paid when retailers use them.

#### For Producers (Manufacturers)

| Incentive | Description |
|-----------|-------------|
| **Primary data authority** | You own the manufacturing data - strongest VC attribution |
| **Brand consistency** | Same DPP data across ALL retailers selling your products |
| **Enforcement power** | Can require retailers to use your passports |
| **Marketing reach** | Your brand shown on every retailer's product page |
| **Single source of truth** | No fragmented or incorrect sustainability claims |

#### For Distributors

| Incentive | Description |
|-----------|-------------|
| **Value-add service** | Offer DPP access as part of your distribution package |
| **Fill the gap** | Create DPPs when producers don't (many won't) |
| **Competitive moat** | Differentiate from distributors without DPP support |
| **Compliance enabler** | Help your retailer network become ESPR-compliant |
| **Revenue opportunity** | Earn from retailers who can't get DPPs directly |

#### For Both

| Incentive | Description |
|-----------|-------------|
| **Legal compliance** | Meet your ESPR obligations as economic operator |
| **Verified badge** | "Verified Supplier" increases credibility |
| **Ecosystem access** | Reach retailers through Shopify/WooCommerce plugins |
| **Future-proofing** | Be ready as DPP requirements expand to more product categories |

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
| **Verified source** | Passport comes from the actual producer or authorized distributor |
| **Cryptographic proof** | Signed Verifiable Credential |
| **Public verification** | Anyone can verify at eurocomply.eu |
| **No self-declaration** | Retailers can't create or modify claims |

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
│  → Producers also set distributor referral rate (0-30%)     │
│                                                             │
│  WHO EARNS WHAT?                                            │
│  → Direct: Producer 80%, Platform 20%                       │
│  → Via Distributor: Producer 50-70%, Distributor 10-30%,    │
│                     Platform 20%                            │
│                                                             │
│  WHY IS IT WORTH IT FOR RETAILERS?                          │
│  → €1/month vs €2,000/month profit = 0.05%                  │
│  → Compliance, trust badge, zero work                       │
│                                                             │
│  WHY IS IT WORTH IT FOR DISTRIBUTORS?                       │
│  → 500 retailers × 50 SKUs × €0.20 = €5,000/month passive   │
│  → Value-add service for retailer network                   │
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
