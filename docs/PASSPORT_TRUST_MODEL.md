# Digital Product Passport Trust Model

## Overview

EuroComply uses an **organization-only model** for passport creation. Only registered brands, manufacturers, and distributors can create DPPs. This eliminates fraud by design.

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUST BY DESIGN                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✅ ORGANIZATIONS create passports (pay subscription)      │
│     → Immediate access after registration and payment      │
│     → Own the product data (Golden Record model)           │
│     → Legally liable for accuracy                          │
│     → did:key identity (portable, self-verifying)          │
│     → Manual review and approval via DPP Ready list        │
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

## ESPR Article 31: Free Access Mandate

EU law requires DPP data to be accessible **"free of charge"** to all economic operators.

**We cannot charge retailers for DPP access. It's illegal.**

| Who | Access | Cost |
|-----|--------|------|
| Brands, Manufacturers | Create DPPs | €49-299/month subscription |
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
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Certification│     │ Organization │     │     DPP      │     │   Retailer   │
│    Body      │────▶│ (Registered) │────▶│  (Signed VC) │────▶│ (Free Access)│
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │                    │
   Issues cert         Creates product     did:key signed       Display only
   to organization     Reviews & approves  portable VC          cannot edit
```

### Each Step Explained

1. **Certification Body → Organization**
   - GOTS, OEKO-TEX, FSC etc. certify the organization
   - Organization has documentary proof

2. **Organization → DPP**
   - Organization pays subscription (€49-299/month)
   - Creates product as Golden Record
   - Product appears in DPP Ready list at 100% completeness
   - Organization reviews and approves for issuance
   - Signed with did:key (portable, self-verifying)

3. **DPP → Retailer**
   - Retailer accesses DPP for **free** via public API
   - Uses widget or Shopify Retailer App
   - Can display but cannot modify

---

## Verification Flow

### Public Verification

Anyone can verify a passport at `/v1/passports/:id/verify`:

```json
{
  "valid": true,
  "issuer": {
    "did": "did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS",
    "name": "Supplier Name",
    "verified": true,
    "verifiedAt": "2025-06-15T10:30:00Z"
  },
  "credential": {
    "id": "urn:uuid:abc123...",
    "issuedAt": "2025-07-01T09:00:00Z",
    "expiresAt": "2035-07-01T09:00:00Z"
  },
  "signature": "valid",
  "note": "Verification works offline - did:key is self-contained"
}
```

### What This Proves

| Claim | Verified By |
|-------|-------------|
| "This is a real passport" | Cryptographic signature |
| "Created by Organization X" | DID matches organization |
| "Organization approved this DPP" | Manual issuance workflow |
| "Data hasn't been tampered" | VC signature integrity |

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
│  ✓ VERIFIED SUPPLIER                                        │
│    Supplier Name (verified Jan 2025)                        │
│                                                             │
│  ✓ CERTIFICATIONS                                           │
│    • GOTS Certified (valid until Dec 2026)                  │
│    • OEKO-TEX Standard 100                                  │
│                                                             │
│  ✓ PRODUCT DATA                                             │
│    • 95% Organic Cotton, 5% Elastane                        │
│    • Made in Portugal                                       │
│    • Carbon footprint: 2.3 kg CO2e                          │
│                                                             │
│  ✓ CRYPTOGRAPHICALLY SIGNED                                 │
│    Credential ID: urn:uuid:abc123...                        │
│    Issued: 2025-07-01                                       │
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
| How are DPPs issued? | Manual review and approval via DPP Ready list |
| What DID method? | did:key (portable, self-verifying) |
| Can anyone verify a passport? | Yes - even offline |
| What prevents fraud? | Architectural design + manual approval workflow |

---

## Related Documentation

- [Business Model](./BUSINESS_MODEL.md) - SME-first SaaS pricing
- [Verifiable Credentials](./VERIFIABLE_CREDENTIALS.md) - did:key, portability
- [Architecture Portability](./ARCHITECTURE_PORTABILITY.md) - Export, data ownership

---

*Last Updated: 2026-01-08*
