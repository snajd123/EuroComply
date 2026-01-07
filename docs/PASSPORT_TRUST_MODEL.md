# Digital Product Passport Trust Model

## Overview

EuroComply uses a **supplier-only model** for passport creation. This eliminates fraud by design.

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUST BY DESIGN                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✅ SUPPLIERS create passports                              │
│     → Verified via KYB                                      │
│     → Own the product data                                  │
│     → Legally liable for accuracy                           │
│                                                             │
│  ❌ RETAILERS cannot create passports                       │
│     → Can only subscribe to supplier DPPs                   │
│     → Cannot copy or modify data                            │
│     → Display only                                          │
│                                                             │
│  = NO FRAUD POSSIBLE                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

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
│    Body      │────▶│  (Verified)  │────▶│  (Signed VC) │────▶│ (Subscribe)  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │                    │
   Issues cert         Creates DPP          Immutable            Display only
   to supplier         with proof           credential           cannot edit
```

### Each Step Explained

1. **Certification Body → Supplier**
   - GOTS, OEKO-TEX, FSC etc. certify the supplier
   - Supplier has documentary proof

2. **Supplier → DPP**
   - Supplier creates Digital Product Passport
   - Includes certification data with proof
   - Signed as Verifiable Credential (VC)

3. **DPP → Retailer**
   - Retailer subscribes to supplier's DPP
   - Pays supplier's price (min €0.50/month)
   - Can display but cannot modify

---

## Verification Flow

### Public Verification

Anyone can verify a passport at `/v1/passports/:id/verify`:

```json
{
  "valid": true,
  "issuer": {
    "did": "did:web:eurocomply.eu:o:supplier-name",
    "name": "Supplier Name",
    "verified": true,
    "verifiedAt": "2025-06-15T10:30:00Z"
  },
  "credential": {
    "id": "urn:uuid:abc123...",
    "issuedAt": "2025-07-01T09:00:00Z",
    "expiresAt": "2026-07-01T09:00:00Z"
  },
  "signature": "valid"
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

### Shopify Plugin Flow

```
1. Retailer browses Supplier Catalog
   └─ Sees products from verified suppliers

2. Retailer finds their supplier's product
   └─ Sees price, DPP preview, supplier verification badge

3. Retailer subscribes
   └─ Links DPP to their Shopify product
   └─ Pays supplier's price monthly

4. DPP displays on retailer's store
   └─ Shows "Verified by [Supplier Name]"
   └─ QR code links to public verification
```

### What Retailers Cannot Do

- ❌ Create their own passport
- ❌ Modify supplier's DPP data
- ❌ Claim certifications
- ❌ Remove supplier attribution

### What Retailers Can Do

- ✅ Browse supplier catalog
- ✅ Subscribe to supplier DPPs
- ✅ Display DPPs on their store
- ✅ Unsubscribe (stops displaying)

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
| Who creates passports? | Only verified suppliers |
| Can retailers create passports? | No |
| Can retailers copy data? | No - can only subscribe |
| Who is liable for accuracy? | Supplier |
| How are certifications verified? | During supplier KYB |
| Can anyone verify a passport? | Yes - public verification endpoint |
| What prevents fraud? | Architectural design - not validation rules |

---

## Related Documentation

- [Business Model](./BUSINESS_MODEL.md) - Pricing, revenue sharing, economics
- [Infrastructure](../INFRASTRUCTURE.md) - AWS deployment architecture

---

*Last Updated: 2026-01-07*
