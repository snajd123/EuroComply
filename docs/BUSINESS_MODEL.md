# EuroComply Business Model

## Overview

EuroComply is a **SaaS platform for SME suppliers** to create, host, and distribute ESPR-compliant Digital Product Passports. We provide the tools that make DPP compliance accessible and affordable.

```
┌─────────────────────────────────────────────────────────────────┐
│                    EUROCOMPLY MODEL                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   SUPPLIERS PAY                         RETAILERS ACCESS FREE   │
│   ─────────────                         ────────────────────    │
│                                                                  │
│   ┌──────────────┐                      ┌──────────────┐        │
│   │  Producers   │                      │  Retailers   │        │
│   │  Importers   │ ──── SaaS Fee ────►  │  (Shopify,   │        │
│   │  Brands      │                      │  WooCommerce)│        │
│   └──────────────┘                      └──────────────┘        │
│         │                                      │                 │
│         │ Create DPPs                          │ Display DPPs   │
│         │ using our tools                      │ on storefronts │
│         │                                      │                 │
│         ▼                                      ▼                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                 EUROCOMPLY PLATFORM                      │   │
│   │                                                          │   │
│   │  • DPP Creator Studio (forms, templates, CSV import)    │   │
│   │  • Verifiable Credential issuance (walt.id)             │   │
│   │  • Managed hosting (while subscribed)                   │   │
│   │  • Retailer plugins (Shopify, WooCommerce)              │   │
│   │  • QR code generation (GS1 Digital Link)                │   │
│   │  • Public verification pages                            │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why This Model?

### Legal Requirement: ESPR Article 31

The EU Ecodesign for Sustainable Products Regulation (ESPR) mandates that DPP data must be accessible **"free of charge"** to all economic operators in the supply chain - including retailers, importers, repairers, and recyclers.

**We cannot charge retailers for DPP access. It's illegal.**

### Market Reality: SME Gap

| Segment | DPP Solution | Cost |
|---------|--------------|------|
| **Enterprise** (BMW, H&M) | SAP, Siemens, custom build | €50,000 - €500,000+ |
| **SME** (99% of EU businesses) | ??? | Can't afford enterprise solutions |

EuroComply fills this gap with affordable SaaS pricing.

---

## Who Are Our Customers?

### Suppliers (Paying Customers)

Only verified suppliers can create Digital Product Passports. They have the product data and the legal obligation.

| Supplier Type | Role | ESPR Obligation |
|---------------|------|-----------------|
| **Producer** | Manufactures the product | Create DPP with primary manufacturing data |
| **Importer** | Brings non-EU products into EU | Must ensure DPP exists before placing on market |
| **Brand** | Owns the product identity | Create DPPs for branded product lines |

```
┌─────────────────────────────────────────────────────────────────┐
│                    IMPORTER USE CASE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Chinese Factory ─────────────────────────────► EU Importer     │
│       │                                              │           │
│       │ Ships product                                │           │
│       │ (no DPP - factory doesn't use EuroComply)    │           │
│       │                                              │           │
│       │                                              ▼           │
│       │                               ┌─────────────────────────┐│
│       │                               │ ESPR Obligation:        ││
│       │                               │ "Cannot place on EU     ││
│       │                               │  market without DPP"    ││
│       │                               └─────────────────────────┘│
│       │                                              │           │
│       │                                              ▼           │
│       │                               ┌─────────────────────────┐│
│       │                               │ Importer creates DPP    ││
│       │                               │ using EuroComply SaaS   ││
│       │                               │                         ││
│       │                               │ • Uses factory spec     ││
│       │                               │   sheets as data source ││
│       │                               │ • VC: "Attested by      ││
│       │                               │   [Importer Name]"      ││
│       │                               └─────────────────────────┘│
│       │                                              │           │
│       │                                              ▼           │
│       │                                       EU Retailers      │
│       │                                       (free access)     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Retailers (Free Access)

Retailers use DPPs but don't pay for them. This is mandated by ESPR Article 31.

| What Retailers Get (Free) |
|---------------------------|
| Browse supplier DPP catalog |
| Link DPPs to their products |
| Display DPPs on storefront (widget) |
| QR codes for products |
| Public verification page |
| Shopify/WooCommerce plugins |

---

## Pricing

### Supplier SaaS Tiers

| Tier | Monthly | DPPs Included | Features |
|------|---------|---------------|----------|
| **Starter** | €49 | 50 DPPs | Creator studio, VC issuance, managed hosting, QR codes |
| **Growth** | €149 | 500 DPPs | + Bulk CSV import, templates library, priority support |
| **Pro** | €399 | 2,000 DPPs | + API access, white-label verification, dedicated support |
| **Enterprise** | Custom | Unlimited | + Self-hosting support, SLA, custom integrations |

### What's Included

Every tier includes:
- **DPP Creator Studio** - Category-specific forms, validation, templates
- **Verifiable Credential Issuance** - walt.id integration, did:key signing
- **Managed Hosting** - EU data residency, high availability
- **QR Code Generation** - GS1 Digital Link compliant
- **Retailer Distribution** - Catalog listing, Shopify/WooCommerce plugins
- **Public Verification** - Branded verification pages

### No Per-Retailer Fees

```
OLD MODEL (Illegal):
  Supplier creates DPP → Retailer pays €0.50/month → Revenue split

NEW MODEL (Legal):
  Supplier pays €149/month → Creates 500 DPPs → Unlimited retailers access free
```

---

## What We Sell

### 1. DPP Creator Studio

The tools to create ESPR-compliant Digital Product Passports.

| Feature | Description |
|---------|-------------|
| **Category-specific forms** | Textile, electronics, battery, furniture schemas |
| **CIRPASS/ESPR validation** | "Your DPP is 85% complete" |
| **Templates** | Pre-built defaults for common products |
| **Bulk CSV import** | Upload hundreds of products at once |
| **LCA estimation** | Calculate carbon footprint from materials |
| **Certification upload** | GOTS, FSC, OEKO-TEX document storage |

### 2. Verifiable Credential Issuance

Cryptographic proof that the DPP is authentic and untampered.

| Feature | Description |
|---------|-------------|
| **did:key identity** | Portable, self-contained supplier identity |
| **W3C VC signing** | Industry-standard Verifiable Credentials |
| **Tamper evidence** | Any change breaks the signature |
| **Offline verification** | No server needed to verify |
| **EUDI wallet ready** | Compatible with EU Digital Identity wallets |

### 3. Managed Hosting

Reliable hosting while the subscription is active.

| Feature | Description |
|---------|-------------|
| **EU data residency** | Data stays in EU |
| **High availability** | Fast response for QR scans |
| **Automatic backups** | Data protection |
| **CDN delivery** | Global performance |

### 4. Retailer Distribution

Tools for retailers to access and display DPPs.

| Feature | Description |
|---------|-------------|
| **Supplier catalog** | Retailers browse and find DPPs |
| **Shopify plugin** | One-click DPP display |
| **WooCommerce plugin** | WordPress integration |
| **Storefront widget** | Embedded DPP viewer |
| **QR codes** | Print-ready for products |

---

## Data Portability & Ownership

### Suppliers Own Their Data

The DPPs and Verifiable Credentials belong to the supplier, not EuroComply.

```
┌─────────────────────────────────────────────────────────────────┐
│  THE VC IS THE ASSET - HOSTING IS JUST STORAGE                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  The Verifiable Credential contains:                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  {                                                         │  │
│  │    "issuer": "did:key:z6MkhaXgBZD...",  ← Portable DID    │  │
│  │    "credentialSubject": {                                  │  │
│  │      ... all DPP data ...                                  │  │
│  │    },                                                      │  │
│  │    "proof": { "jws": "..." }            ← Signature       │  │
│  │  }                                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  This JSON file:                                                │
│  • Can be verified by ANYONE (did:key = self-contained)        │
│  • Can be hosted ANYWHERE                                       │
│  • Is OWNED by the supplier                                    │
│  • Is TRANSFERABLE to any other host                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### When Subscription Ends

If a supplier cancels their subscription:

1. **Export package provided** containing all VCs and keys
2. **30-day grace period** to migrate data
3. **Customer options:**
   - Self-host the data
   - Move to another DPP provider
   - Upload to decentralized storage (IPFS/Arweave)
   - Give to distributor/retailer to host
4. **VCs still verify** - did:key is self-contained, no EuroComply dependency

```
┌─────────────────────────────────────────────────────────────────┐
│  EXPORT PACKAGE                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  export/                                                        │
│  ├── credentials/                                               │
│  │   ├── dpp-001.vc.json   (signed Verifiable Credential)      │
│  │   ├── dpp-002.vc.json                                       │
│  │   └── ...                                                   │
│  ├── identity/                                                  │
│  │   ├── did-document.json                                     │
│  │   └── private-key.jwk   (for future VC signing)             │
│  └── manifest.json         (GTIN → VC mapping)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### No Lock-In

| Concern | Our Approach |
|---------|--------------|
| **Data ownership** | Supplier owns all VCs and keys |
| **Portability** | Standard W3C format, works anywhere |
| **Verification** | did:key works forever without EuroComply |
| **Export** | Full data export on cancellation |

This is NOT a lock-in business. We earn customers by being the best tool, not by holding data hostage.

---

## Trust & Verification

### How We Ensure Authenticity

| Layer | Protection |
|-------|------------|
| **KYB verification** | Suppliers must verify business identity before creating DPPs |
| **did:key identity** | Cryptographic proof of issuer |
| **VC signature** | Tamper-evident - any change breaks signature |
| **Public verification** | Anyone can verify at eurocomply.eu/verify |

### VC Attribution by Supplier Type

| Supplier Type | VC Attribution | Trust Level |
|---------------|----------------|-------------|
| **Producer** | "Verified by [Producer Name]" | Highest - primary data source |
| **Importer** | "Attested by [Importer Name]" | High - from supplier documentation |
| **Brand** | "Verified by [Brand Name]" | Depends on data source |

---

## Why Suppliers Pay

### The Real Value

| Value | Description |
|-------|-------------|
| **Avoid €50k+ alternatives** | Enterprise solutions are unaffordable for SMEs |
| **ESPR compliance** | Meet legal requirements to sell in EU |
| **Market access** | No DPP = no EU market access (starting 2027) |
| **Easy creation** | Forms, templates, validation - not Excel hell |
| **Cryptographic proof** | Verifiable Credentials differentiate from competitors |
| **Retailer reach** | Shopify/WooCommerce plugins distribute your DPPs |

### The Math

```
┌─────────────────────────────────────────────────────────────────┐
│  COST COMPARISON                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Option A: Build your own DPP system                            │
│  • Development: €50,000+                                        │
│  • Hosting: €500/month                                          │
│  • Maintenance: €10,000/year                                    │
│  • Total Year 1: €66,000+                                       │
│                                                                  │
│  Option B: Enterprise vendor (SAP, Siemens)                     │
│  • Implementation: €100,000+                                    │
│  • Annual license: €50,000+                                     │
│  • Total Year 1: €150,000+                                      │
│                                                                  │
│  Option C: EuroComply                                           │
│  • Monthly SaaS: €149                                           │
│  • Total Year 1: €1,788                                         │
│                                                                  │
│  EuroComply is 97% cheaper than building, 99% cheaper than SAP. │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why Retailers Use Us

Even though access is free, retailers choose EuroComply because:

| Benefit | Description |
|---------|-------------|
| **Supplier catalog** | Easy to find DPPs from verified suppliers |
| **One-click integration** | Shopify/WooCommerce plugins |
| **Verified data** | Cryptographically signed by suppliers |
| **Zero work** | Supplier maintains the data |
| **Compliance** | Meet ESPR requirements without expertise |
| **Consumer trust** | "Verified by [Supplier]" badge |

---

## Competitive Positioning

```
┌─────────────────────────────────────────────────────────────────┐
│  MARKET POSITIONING                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ENTERPRISE                                                      │
│  (BMW, Siemens, H&M)         SAP / Siemens / Circulor           │
│  €100k+ budgets              Deep ERP integration               │
│                              Custom implementations              │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  MID-MARKET                                                      │
│  (€10k-50k budgets)          Kezzler / Avery Dennison           │
│                              Specialized traceability            │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  SME                         ┌─────────────────────────────┐    │
│  (99% of EU businesses)      │      EUROCOMPLY            │    │
│  €49-399/month budgets       │                             │    │
│                              │  "The WordPress of DPPs"   │    │
│                              │                             │    │
│                              │  • Affordable SaaS          │    │
│                              │  • Easy to use              │    │
│                              │  • No lock-in               │    │
│                              │  • Portable VCs             │    │
│                              └─────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Revenue Model

### Simple SaaS

```
Revenue = Number of Paying Suppliers × Average Monthly Fee

Example at scale:
1,000 suppliers × €149/month average = €149,000 MRR
```

### No Complex Splits

| Old Model (Removed) | New Model |
|---------------------|-----------|
| Retailer pays per DPP | Retailers free |
| 3-way revenue split | Simple SaaS |
| Distributor referral % | Not applicable |
| Usage tracking/billing | Subscription only |

### Future Premium (Optional)

For retailers who want more than free access:

| Premium Feature | Price | Description |
|-----------------|-------|-------------|
| Bulk API access | €99/mo | 1000+ product sync |
| CSRD reporting | €199/mo | Sustainability reports |
| Supply chain analytics | €299/mo | Insights dashboard |

These are **value-add analytics**, not DPP access (which must remain free).

---

## Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    EUROCOMPLY MODEL                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WHO CREATES DPPs?                                              │
│  → Producers (manufacturers - primary data)                     │
│  → Importers (must ensure DPP exists for EU market)            │
│  → Brands (product identity owners)                             │
│                                                                  │
│  WHO PAYS?                                                      │
│  → Suppliers pay SaaS fee (€49-399/month)                      │
│                                                                  │
│  WHO ACCESSES FREE?                                             │
│  → Retailers (ESPR Article 31 mandate)                         │
│  → Consumers (public verification)                              │
│                                                                  │
│  WHAT DO SUPPLIERS GET?                                         │
│  → DPP Creator Studio                                           │
│  → Verifiable Credential issuance                               │
│  → Managed hosting                                              │
│  → Retailer distribution                                        │
│  → Data portability                                             │
│                                                                  │
│  WHAT HAPPENS ON CANCELLATION?                                  │
│  → Export all VCs and keys                                      │
│  → Host elsewhere or self-host                                  │
│  → VCs still verify (did:key is portable)                      │
│                                                                  │
│  WHY US?                                                        │
│  → 97% cheaper than building yourself                           │
│  → 99% cheaper than enterprise vendors                          │
│  → No lock-in - you own your data                              │
│  → Cryptographic proof - not just a database                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last Updated: 2026-01-08*
