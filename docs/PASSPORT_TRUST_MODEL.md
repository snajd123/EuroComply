# Digital Product Passport Trust Model

## Overview

EuroComply uses a **supplier-only model** for passport creation. This eliminates fraud by design.

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUST BY DESIGN                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✅ SUPPLIERS create passports (pay SaaS fee)              │
│     → Verified via KYB                                      │
│     → Own the product data                                  │
│     → Legally liable for accuracy                           │
│     → did:key identity (portable, self-verifying)          │
│                                                             │
│  ✅ RETAILERS access FREE (ESPR Article 31)                 │
│     → Browse supplier catalog                               │
│     → Link DPPs to products                                 │
│     → Display on storefront                                 │
│     → Cannot create or modify DPPs                          │
│                                                             │
│  = NO FRAUD + ESPR COMPLIANT                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## ESPR Article 31: Free Access Mandate

EU law requires DPP data to be accessible **"free of charge"** to all economic operators.

**We cannot charge retailers for DPP access. It's illegal.**

| Who | Access | Cost |
|-----|--------|------|
| Suppliers | Create DPPs | €49-399/month SaaS |
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

### The Solution: Supplier-Only

| Benefit | Description |
|---------|-------------|
| **Single source of truth** | Supplier creates DPP once, retailers subscribe |
| **Verified by default** | Suppliers pass KYB before creating passports |
| **No copying possible** | Retailers can't create - only subscribe |
| **Clear liability** | Supplier is legally responsible for DPP accuracy |

---

## Trust Chain

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Certification│     │   Supplier   │     │     DPP      │     │   Retailer   │
│    Body      │────▶│  (Verified)  │────▶│  (Signed VC) │────▶│ (Free Access)│
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │                    │
   Issues cert         Creates DPP          did:key signed       Display only
   to supplier         pays SaaS fee        portable VC          cannot edit
```

### Each Step Explained

1. **Certification Body → Supplier**
   - GOTS, OEKO-TEX, FSC etc. certify the supplier
   - Supplier has documentary proof

2. **Supplier → DPP**
   - Supplier pays SaaS fee (€49-399/month)
   - Creates Digital Product Passport
   - Signed with did:key (portable, self-verifying)
   - Issued as Verifiable Credential (VC)

3. **DPP → Retailer**
   - Retailer accesses supplier's DPP for **free**
   - Links to their products via Shopify/WooCommerce
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
| "Created by Supplier X" | DID matches verified supplier |
| "Supplier is verified" | KYB verification status |
| "Data hasn't been tampered" | VC signature integrity |

---

## Supplier Verification (KYB)

Before creating passports, suppliers must complete KYB:

### Verification Requirements

| Requirement | Description |
|-------------|-------------|
| **Business registration** | Proof of legal entity |
| **VAT/Tax ID** | Valid tax registration |
| **Address verification** | Physical business address |
| **Authorized representative** | Identity of signing authority |
| **Certification documents** | Proof of claimed certifications |

### Verification States

```
PENDING → IN_REVIEW → VERIFIED
                   ↘ REJECTED

VERIFIED → SUSPENDED (if violations found)
```

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

## What Retailers See

### Shopify Plugin Flow (Free Access)

```
1. Retailer installs Shopify/WooCommerce plugin (free)
   └─ No subscription required

2. Retailer browses Supplier Catalog
   └─ Sees products from verified suppliers
   └─ Sees DPP preview, supplier verification badge

3. Retailer links DPP to their product (free)
   └─ No payment - ESPR Article 31 mandates free access
   └─ DPP associated with retailer's product

4. DPP displays on retailer's store
   └─ Shows "Verified by [Supplier Name]"
   └─ QR code links to public verification
```

### What Retailers Cannot Do

- ❌ Create their own passport
- ❌ Modify supplier's DPP data
- ❌ Claim certifications
- ❌ Remove supplier attribution

### What Retailers Can Do (All Free)

- ✅ Browse supplier catalog
- ✅ Link DPPs to their products
- ✅ Display DPPs on their store
- ✅ Unlink (stops displaying)

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
| Who creates passports? | Only verified suppliers (pay SaaS fee) |
| Can retailers create passports? | No |
| Do retailers pay for access? | **No - free** (ESPR Article 31) |
| Who is liable for accuracy? | Supplier |
| What DID method? | did:key (portable, self-verifying) |
| Can anyone verify a passport? | Yes - even offline |
| What prevents fraud? | Architectural design - not validation rules |

---

## Related Documentation

- [Business Model](./BUSINESS_MODEL.md) - SME-first SaaS pricing
- [Verifiable Credentials](./VERIFIABLE_CREDENTIALS.md) - did:key, portability
- [Architecture Portability](./ARCHITECTURE_PORTABILITY.md) - Export, data ownership

---

*Last Updated: 2026-01-08*
