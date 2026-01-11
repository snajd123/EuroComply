# Digital Product Passport Trust Model

## Overview

EuroComply uses an **organization-only model** for passport creation. Only registered brands, manufacturers, and distributors can create DPPs. This eliminates fraud by design.

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUST BY DESIGN                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✅ ORGANIZATIONS create passports (pay subscription)      │
│     → Own the product data (Golden Record model)           │
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

## Workspace Architecture

Trust is built progressively through four workspaces:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TRUST FLOWS THROUGH WORKSPACES                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐ │
│  │    DESIGN    │───▶│  OPERATIONS  │───▶│  MARKETING   │───▶│ COMPLIANCE │ │
│  │    (PLM)     │    │  (ERP-lite)  │    │    (PIM)     │    │   (DPP)    │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └────────────┘ │
│         │                   │                   │                   │        │
│    Registry +          Registry +            PIM +           DPP Ready +    │
│    BOM-Materials       Batch Mgmt        DAM-Media          Credential      │
│    Certifications      EPCIS Events      Channels           Issuance        │
│    Attestations        Attestations                                          │
│         │                   │                   │                   │        │
│         └───────────────────┴───────────────────┴───────────────────┘        │
│                                     │                                        │
│                              GOLDEN RECORD                                   │
│                     (Aggregated in Compliance workspace)                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Workspace | Trust Function | Key Modules |
|-----------|----------------|-------------|
| **Design** | Technical truth - materials, composition, certifications | Registry, BOM-Materials, Certifications, Attestations |
| **Operations** | Lifecycle events - batch tracking, supply chain events | Registry, Batch Mgmt, EPCIS, Attestations |
| **Marketing** | Commercial presentation - content, media, channels | PIM, DAM-Media, Channels |
| **Compliance** | DPP issuance - aggregation, review, credential signing | DPP Ready, Credential Issuance |

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
| **Single source of truth** | Organization creates product as Golden Record |
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
│         └────────────────────┼────────────────────┘                                  │
│                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                         ORGANIZATION (Registered)                             │   │
│  │                                                                               │   │
│  │   Design Workspace              Operations Workspace                          │   │
│  │   ┌─────────────────┐          ┌─────────────────┐                           │   │
│  │   │ • Registry      │          │ • Batch Mgmt    │                           │   │
│  │   │ • BOM-Materials │──────────│ • EPCIS Events  │                           │   │
│  │   │ • Certifications│          │ • Attestations  │                           │   │
│  │   │ • Attestations  │          └────────┬────────┘                           │   │
│  │   └────────┬────────┘                   │                                    │   │
│  │            │                            │                                    │   │
│  │            └────────────┬───────────────┘                                    │   │
│  │                         ▼                                                    │   │
│  │              Compliance Workspace                                            │   │
│  │              ┌─────────────────────────────┐                                 │   │
│  │              │ GOLDEN RECORD AGGREGATION   │                                 │   │
│  │              │ • All attestations verified │                                 │   │
│  │              │ • Completeness check        │                                 │   │
│  │              │ • Manual review & approval  │                                 │   │
│  │              │ • Credential issuance       │                                 │   │
│  │              └──────────────┬──────────────┘                                 │   │
│  │                             │                                                │   │
│  └─────────────────────────────┼────────────────────────────────────────────────┘   │
│                                ▼                                                     │
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

1. **External Trust Sources → Organization**
   - **Certification Bodies**: GOTS, OEKO-TEX, FSC certify the organization (documentary proof)
   - **Suppliers**: Sign material attestations with their did:key (Verifiable Credentials)
   - **Testing Labs**: Sign test results with their did:key (carbon footprint, composition)

2. **Design Workspace** (Technical truth)
   - Organization creates product in Registry
   - Adds BOM and material composition
   - Attaches certification documents
   - Requests and receives supplier attestations

3. **Operations Workspace** (Lifecycle events)
   - Batch tracking and serialization
   - EPCIS events auto-generated from actions
   - Additional attestations for specific batches

4. **Compliance Workspace** (DPP issuance)
   - Aggregates Golden Record from all workspaces
   - Verifies all attestation signatures
   - Checks completeness requirements
   - Organization reviews and approves for issuance
   - Signs DPP with organization's did:key

5. **DPP → Retailer**
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
  "note": "Verification works offline - did:key is self-contained"
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
│  │ requesting WS │         │ (Golden Rec.) │         │  issues DPP   │      │
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

1. **Stored** in the Attestation Module as part of Golden Record
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
| Where is product data managed? | Design workspace (technical), Marketing workspace (commercial) |
| Where are DPPs issued? | Compliance workspace (aggregates Golden Record, reviews, issues) |
| How are supply chain claims verified? | Multi-party attestations signed with did:key |
| What DID method? | did:key (portable, self-verifying) |
| Can anyone verify a passport? | Yes - including all attestation signatures |
| What prevents fraud? | Workspace architecture + attestations + manual approval |

---

## Related Documentation

- [Business Model](./BUSINESS_MODEL.md) - SME-first SaaS pricing
- [Verifiable Credentials](./VERIFIABLE_CREDENTIALS.md) - did:key, portability
- [Architecture Portability](./ARCHITECTURE_PORTABILITY.md) - Export, data ownership
- [Multi-Party Attestation](./MULTI_PARTY_ATTESTATION.md) - Supply chain attestations
- [DPP Content Plan](./DPP_CONTENT_PLAN.md) - Workspace data flow

---

*Last Updated: 2026-01-11*
