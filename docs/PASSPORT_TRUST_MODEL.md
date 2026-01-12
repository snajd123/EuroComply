# Digital Product Passport Trust Model

## Overview

EuroComply uses an **organization-only model** for passport creation. Only registered brands, manufacturers, and distributors can create DPPs. This eliminates fraud by design.

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUST BY DESIGN                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✅ ORGANIZATIONS create passports (pay subscription)      │
│     → Own the product data (workspace-based data model)    │
│     → Legally liable for accuracy                          │
│     → did:key identity (portable, self-verifying)          │
│     → Multi-party attestations from supply chain           │
│     → DPP issuance via Compliance workspace                │
│                                                             │
│  ✅ RETAILERS access FREE (ESPR Article 31)                │
│     → Public API lookup (GTIN, brand/SKU, serial)          │
│     → Embeddable widget for any website                    │
│     → Shopify Retailer App for automatic matching          │
│     → Cannot create or modify DPPs                         │
│                                                             │
│  = NO FRAUD + ESPR COMPLIANT                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## The Hub: Central Source of Truth

At the center of EuroComply is **The Hub** - a central data store where all product data lives. Each product has **workspace data** in the Hub stored by Design, Operations, and Marketing workspaces.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              THE HUB                                         │
│                    (Central Data Store - Always Synchronized)                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    WORKSPACE DATA (per product)                      │    │
│  │                                                                      │    │
│  │  Design Data         Operations Data       Marketing Data           │    │
│  │  ├─ Registry         ├─ Batches           ├─ PIM Content           │    │
│  │  ├─ Materials        ├─ EPCIS Events      ├─ Media                 │    │
│  │  ├─ Certifications   └─ Attestations      └─ Channels              │    │
│  │  └─ Attestations                                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           │ WRITE                  │ WRITE                  │ WRITE
           ▼                        ▼                        ▼
    ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
    │   DESIGN    │          │ OPERATIONS  │          │  MARKETING  │
    │   (PLM)     │          │ (ERP-lite)  │          │   (PIM)     │
    └─────────────┘          └─────────────┘          └─────────────┘
           │                        │                        │
           └────────────────────────┼────────────────────────┘
                                    │ READ
                                    ▼
                            ┌─────────────┐
                            │ COMPLIANCE  │
                            │   (DPP)     │
                            │ Reads Hub   │
                            │ Issues DPPs │
                            └─────────────┘
```

**Key Principle:** All workspaces read from and write to the same Hub. Changes in one workspace are immediately visible in others. Compliance workspace READS the complete workspace data and issues DPPs - it does not "aggregate" data.

---

## Workspace Architecture

Trust is built progressively through four workspaces, all connected to the Hub:

| Workspace | Trust Function | Key Modules | Hub Access |
|-----------|----------------|-------------|------------|
| **Design** | Technical truth - materials, composition, certifications | Registry, BOM-Materials, Certifications, Attestations | Read/Write |
| **Operations** | Lifecycle events - batch tracking, supply chain events | Registry, Batch Mgmt, EPCIS, Attestations | Read/Write |
| **Marketing** | Commercial presentation - content, media, channels | PIM, DAM-Media, Channels | Read/Write |
| **Compliance** | DPP issuance - review and credential signing | DPP Ready, Credential Issuance | Read + Issue |

---

## ESPR Article 31: Free Access Mandate

EU law requires DPP data to be accessible **"free of charge"** to all economic operators.

**We cannot charge retailers for DPP access. It's illegal.**

| Who | Access | Cost |
|-----|--------|------|
| Brands, Manufacturers | Create DPPs | €129-399/month subscription |
| Retailers | View & display DPPs | **Free** |
| Consumers | Verify DPPs | **Free** |
| Regulators | Audit DPPs | **Free** |

---

## Why This Model?

### The Problem with Retailer-Created Passports

If retailers could create their own passports:

| Risk | Description |
|------|-------------|
| **Copying** | Retailer copies supplier data without paying |
| **False claims** | Retailer claims certifications they don't have |
| **No accountability** | Who verifies retailer's claims? |
| **Complex validation** | Need proof requirements, plagiarism detection |

### The Solution: Organization-Only

| Benefit | Description |
|---------|-------------|
| **Central database** | Organization creates product with workspace data |
| **Manual approval** | Organizations review and approve each DPP before issuance |
| **No copying possible** | Retailers can't create - only access via API |
| **Clear liability** | Organization is legally responsible for DPP accuracy |

---

## Trust Chain

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              TRUST CHAIN WITH ATTESTATIONS                           │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  EXTERNAL TRUST SOURCES                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                         │
│  │ Certification│     │   Supplier   │     │   Testing    │                         │
│  │    Body      │     │  (Tier 1-N)  │     │     Lab      │                         │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘                         │
│         │                    │                    │                                  │
│    Issues cert          Signs material       Signs test                             │
│    (documentary)        attestation (VC)     results (VC)                           │
│         │                    │                    │                                  │
│         └────────────────────┴────────────────────┘                                  │
│                              │                                                       │
│                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                              THE HUB                                          │   │
│  │                    (Workspace Data - Always Synchronized)                     │   │
│  │                                                                               │   │
│  │   Design writes:           Operations writes:        Marketing writes:        │   │
│  │   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │   │
│  │   │ • Registry      │     │ • Batch Mgmt    │     │ • PIM Content   │        │   │
│  │   │ • BOM-Materials │     │ • EPCIS Events  │     │ • Media Assets  │        │   │
│  │   │ • Certifications│     │ • Attestations  │     │ • Channels      │        │   │
│  │   │ • Attestations  │     └─────────────────┘     └─────────────────┘        │   │
│  │   └─────────────────┘                                                         │   │
│  │                                                                               │   │
│  └───────────────────────────────────┬───────────────────────────────────────────┘   │
│                                      │ READ                                          │
│                                      ▼                                               │
│                    ┌─────────────────────────────────┐                              │
│                    │      Compliance Workspace       │                              │
│                    │                                 │                              │
│                    │  • Reads workspace data from Hub│                              │
│                    │  • Verifies attestation sigs    │                              │
│                    │  • Checks completeness          │                              │
│                    │  • Manual review & approval     │                              │
│                    │  • Issues DPP credential        │                              │
│                    └────────────────┬────────────────┘                              │
│                                     │                                                │
│                                     ▼                                                │
│                    ┌──────────────────────┐                                         │
│                    │   DPP (Signed VC)    │                                         │
│                    │   did:key portable   │                                         │
│                    │   Includes all       │                                         │
│                    │   attestation refs   │                                         │
│                    └──────────┬───────────┘                                         │
│                               │                                                      │
│                               ▼                                                      │
│                    ┌──────────────────────┐                                         │
│                    │  Retailer (Free)     │                                         │
│                    │  Display only        │                                         │
│                    └──────────────────────┘                                         │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Each Step Explained

1. **External Trust Sources → The Hub**
   - **Certification Bodies**: GOTS, OEKO-TEX, FSC certify the organization (documentary proof)
   - **Suppliers**: Sign material attestations with their did:key (Verifiable Credentials)
   - **Testing Labs**: Sign test results with their did:key (carbon footprint, composition)
   - All attestations are stored in the Hub as workspace data

2. **Workspaces Write to the Hub**
   - **Design**: Creates product in Registry, adds BOM, materials, certifications, attestations
   - **Operations**: Batch tracking, EPCIS events, batch-specific attestations
   - **Marketing**: Commercial content, media assets, channel data
   - All data is immediately synchronized in the Hub

3. **Compliance Workspace Reads the Hub**
   - Reads the complete workspace data (no aggregation needed - data is already there)
   - Verifies all attestation signatures
   - Checks completeness requirements
   - Organization reviews and approves for issuance
   - Signs DPP with organization's did:key

4. **DPP → Retailer**
   - Retailer accesses DPP for **free** via public API
   - Uses widget or Shopify Retailer App
   - Can display but cannot modify
   - DPP includes references to all attestations

---

## Verification Flow

### Public Verification

Anyone can verify a passport at `/v1/passports/:id/verify`:

```json
{
  "valid": true,
  "issuer": {
    "did": "did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS",
    "name": "Organization Name",
    "verified": true,
    "verifiedAt": "2025-06-15T10:30:00Z"
  },
  "credential": {
    "id": "urn:uuid:abc123...",
    "issuedAt": "2025-07-01T09:00:00Z",
    "expiresAt": "2035-07-01T09:00:00Z"
  },
  "signature": "valid",
  "attestations": {
    "total": 3,
    "verified": 3,
    "details": [
      {
        "type": "MaterialOrigin",
        "issuer": "did:key:z6Mkf...",
        "issuerName": "Supplier ABC",
        "valid": true
      },
      {
        "type": "TestingResults",
        "issuer": "did:key:z6Mkg...",
        "issuerName": "Carbon Lab Inc",
        "valid": true
      },
      {
        "type": "Manufacturing",
        "issuer": "did:key:z6Mkh...",
        "issuerName": "Factory XYZ",
        "valid": true
      }
    ]
  },
  "note": "Signature verification offline (did:key), revocation check requires network"
}
```

### What This Proves

| Claim | Verified By |
|-------|-------------|
| "This is a real passport" | Cryptographic signature |
| "Created by Organization X" | DID matches organization |
| "Organization approved this DPP" | Compliance workspace issuance |
| "Data hasn't been tampered" | VC signature integrity |
| "Supply chain claims are real" | Attestation signatures verified |
| "Third party verified claims" | Testing lab attestations |

---

## Certification Claims

### Only Suppliers Can Claim Certifications

Since retailers can't create passports, they can't make false certification claims.

| Certification | Who Claims It | Proof Required |
|--------------|---------------|----------------|
| GOTS | Supplier | Yes (during KYB) |
| OEKO-TEX | Supplier | Yes (during KYB) |
| FSC | Supplier | Yes (during KYB) |
| etc. | Supplier | Yes (during KYB) |

### Verification Links

Certifications can be independently verified:

| Certification | Verification URL |
|--------------|------------------|
| GOTS | https://global-standard.org/certification-and-labelling/check-if-certified |
| OEKO-TEX | https://www.oeko-tex.com/en/label-check |
| FSC | https://fsc.org/en/fsc-public-certificate-search |
| GRS | https://textileexchange.org/standards/grs/ |
| ENERGY STAR | https://www.energystar.gov/productfinder/ |

---

## Multi-Party Attestation

Beyond traditional certifications, EuroComply supports cryptographically signed attestations from supply chain partners.

### How Attestations Work

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MULTI-PARTY ATTESTATION FLOW                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. REQUEST                 2. ONBOARD                 3. CONTRIBUTE         │
│  ┌───────────────┐         ┌───────────────┐         ┌───────────────┐      │
│  │ Organization  │         │  Contributor  │         │  Contributor  │      │
│  │ requests data │────────▶│ receives link │────────▶│ signs data    │      │
│  │ from partner  │         │ gets did:key  │         │ with did:key  │      │
│  └───────────────┘         └───────────────┘         └───────────────┘      │
│         │                                                   │                │
│   From Design or                                      Verifiable            │
│   Operations workspace                                Credential            │
│                                                             │                │
│  4. REVIEW                  5. STORE                   6. ISSUE             │
│  ┌───────────────┐         ┌───────────────┐         ┌───────────────┐      │
│  │ Organization  │         │  Attestation  │         │  Compliance   │      │
│  │ reviews in    │◀────────│  Module       │────────▶│  workspace    │      │
│  │ requesting WS │         │    (Hub)      │         │  issues DPP   │      │
│  └───────────────┘         └───────────────┘         └───────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Attestation Types

| Type | Requestor | Contributor | Example Claims |
|------|-----------|-------------|----------------|
| **Material Origin** | Brand (Design) | Tier 1-N Supplier | "Cotton sourced from India, farm XYZ" |
| **Manufacturing** | Brand (Operations) | Factory | "Produced at facility ABC, date X" |
| **Testing Results** | Brand (Design) | Lab | "Carbon footprint: 2.3 kg CO2e" |
| **Chain of Custody** | Brand (Operations) | Logistics | "Shipped via route X, cold chain maintained" |
| **Social Audit** | Brand (Design) | Auditor | "Fair labor practices verified" |

### Contributor Onboarding

Contributors don't need a EuroComply subscription. The flow is:

1. Organization sends contribution request via email
2. Contributor clicks link and creates free contributor account
3. System generates did:key for contributor
4. Contributor fills requested data and signs with did:key
5. Signed attestation returns to requesting organization's workspace

### Attestation Verification

All attestations are independently verifiable:

| What | How |
|------|-----|
| Signature valid | Verify did:key signature on VC |
| Contributor identity | did:key matches registered contributor |
| Not tampered | VC integrity check |
| Not expired | Check validUntil date |

### Relationship to DPP

Attestations do NOT go directly into the DPP. They are:

1. **Stored** in the Attestation Module as workspace data
2. **Referenced** in the DPP credential (attestation IDs included)
3. **Verifiable** independently via public API
4. **Aggregated** during DPP issuance in Compliance workspace

---

## What Retailers Get

### Retailer Access Options (All Free)

| Option | How It Works |
|--------|--------------|
| **Public API** | Look up DPPs by GTIN, brand/SKU, or serial number |
| **Embeddable Widget** | JavaScript snippet that displays DPP on any product page |
| **Shopify Retailer App** | Auto-matches store products to available DPPs by GTIN |

### What Retailers Cannot Do

- ❌ Create their own passport
- ❌ Modify organization's DPP data
- ❌ Claim certifications
- ❌ Remove organization attribution

### What Retailers Can Do (All Free)

- ✅ Look up DPPs via public API
- ✅ Embed widget on product pages
- ✅ Install Shopify Retailer App for auto-matching
- ✅ Display DPPs on their store

---

## Consumer Trust Signals

When consumers scan a DPP QR code:

```
┌─────────────────────────────────────────────────────────────┐
│                  DIGITAL PRODUCT PASSPORT                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✓ VERIFIED ORGANIZATION                                    │
│    Brand Name (verified Jan 2025)                           │
│                                                             │
│  ✓ CERTIFICATIONS                                           │
│    • GOTS Certified (valid until Dec 2026)                  │
│    • OEKO-TEX Standard 100                                  │
│                                                             │
│  ✓ SUPPLY CHAIN ATTESTATIONS                                │
│    • Material origin: Supplier ABC (verified)               │
│    • Carbon footprint: Lab XYZ (verified)                   │
│                                                             │
│  ✓ PRODUCT DATA                                             │
│    • 95% Organic Cotton, 5% Elastane                        │
│    • Made in Portugal                                       │
│    • Carbon footprint: 2.3 kg CO2e                          │
│                                                             │
│  ✓ CRYPTOGRAPHICALLY SIGNED                                 │
│    Credential ID: urn:uuid:abc123...                        │
│    Issued: 2025-07-01 (Compliance workspace)                │
│    3 attestations included                                  │
│                                                             │
│  [Verify Authenticity]                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary

| Question | Answer |
|----------|--------|
| Who creates passports? | Only registered organizations (brands, manufacturers, distributors) |
| Can retailers create passports? | No |
| Do retailers pay for access? | **No - free** (ESPR Article 31) |
| Who is liable for accuracy? | The organization that created the DPP |
| Where does product data live? | **The Hub** - central data store with workspace data per product |
| How do workspaces interact? | Design, Operations, Marketing WRITE to Hub; Compliance READS from Hub |
| Where are DPPs issued? | Compliance workspace (reads Hub, reviews, issues credentials) |
| How are supply chain claims verified? | Multi-party attestations signed with did:key |
| What DID method? | did:key (portable, self-verifying) |
| Can anyone verify a passport? | Yes - including all attestation signatures |
| What prevents fraud? | Hub architecture + attestations + manual approval |

---

## Related Documentation

- [User Management](./USER_MANAGEMENT.md) - Workspace-based access control and data ownership
- [Business Model](./BUSINESS_MODEL.md) - SME-first SaaS pricing
- [Verifiable Credentials](./VERIFIABLE_CREDENTIALS.md) - did:key, portability
- [Architecture Portability](./ARCHITECTURE_PORTABILITY.md) - Export, data ownership
- [Multi-Party Attestation](./MULTI_PARTY_ATTESTATION.md) - Supply chain attestations
- [DPP Content Plan](./DPP_CONTENT_PLAN.md) - Workspace data flow

---

*Last Updated: 2026-01-11*
