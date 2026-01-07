# Digital Product Passport Trust Model

This document explains how EuroComply prevents merchants from making unsubstantiated certification claims and ensures the integrity of Digital Product Passports (DPPs).

## The Problem

When suppliers create DPPs with certification data (e.g., "GOTS Certified Organic Cotton"), what prevents merchants from:
1. Copying the data and creating their own passport without paying the supplier?
2. Falsely claiming certifications they don't actually hold?

## The Solution: Multi-Layered Trust Model

EuroComply uses a combination of **cryptographic verification**, **proof requirements**, and **business incentives** to ensure DPP integrity.

---

## 1. Supplier vs Merchant Passports

### Supplier-Linked Passports (Trusted)

When a merchant **links** to a verified supplier's DPP:

| Aspect | How It Works |
|--------|--------------|
| **Source** | Data comes from verified supplier |
| **Verification** | Supplier passed KYB (Know Your Business) review |
| **Certification Claims** | Trusted - supplier already verified with certification bodies |
| **Signature** | Signed by supplier's Decentralized Identifier (DID) |
| **Display** | Shows "Verified Supplier ✓" badge |
| **Proof Required** | No - supplier's verification is sufficient |

### Self-Created Passports (Requires Proof)

When a merchant creates their **own** DPP (not linked to a supplier):

| Aspect | How It Works |
|--------|--------------|
| **Source** | Merchant-entered data |
| **Verification** | Self-declared |
| **Certification Claims** | **Must provide documentary proof** |
| **Signature** | Signed by merchant's DID |
| **Display** | Shows "Created by [Merchant]" |
| **Proof Required** | Yes - for all protected certifications |

---

## 2. Protected Certifications

The following certifications **require documentary proof** (certificate URL/PDF) when claimed by merchants creating their own passports:

### Textile Certifications
| Certification | Description | Verification |
|--------------|-------------|--------------|
| **GOTS** | Global Organic Textile Standard | [Check](https://global-standard.org/certification-and-labelling/check-if-certified) |
| **OEKO-TEX** | Tested for harmful substances | [Label Check](https://www.oeko-tex.com/en/label-check) |
| **GRS** | Global Recycled Standard | [Verify](https://textileexchange.org/standards/grs/) |
| **RCS** | Recycled Claim Standard | [Verify](https://textileexchange.org/standards/rcs/) |
| **OCS** | Organic Content Standard | [Verify](https://textileexchange.org/standards/ocs/) |
| **BLUESIGN** | Sustainable textile production | [Check](https://www.bluesign.com/en/consumer/check-products) |
| **FAIRTRADE** | Fair trade practices | [Verify](https://www.fairtrade.net/) |
| **BCI** | Better Cotton Initiative | [Verify](https://bettercotton.org/) |

### Electronics Certifications
| Certification | Description | Verification |
|--------------|-------------|--------------|
| **ENERGY STAR** | Energy efficiency | [Product Finder](https://www.energystar.gov/productfinder/) |
| **EPEAT** | Environmental assessment | [Registry](https://epeat.net/) |
| **TCO Certified** | IT sustainability | [Product Finder](https://tcocertified.com/product-finder/) |

### Furniture Certifications
| Certification | Description | Verification |
|--------------|-------------|--------------|
| **FSC** | Forest Stewardship Council | [Certificate Search](https://fsc.org/en/fsc-public-certificate-search) |
| **PEFC** | Sustainable forest management | [Find Certified](https://www.pefc.org/find-certified) |
| **GREENGUARD** | Low chemical emissions | [Verify](https://www.ul.com/resources/ul-greenguard-certification-program) |

### General Certifications
| Certification | Description |
|--------------|-------------|
| **ISO 14001** | Environmental management system |
| **ISO 9001** | Quality management system |
| **B Corp** | Social and environmental performance |
| **Cradle to Cradle** | Circular economy certification |

---

## 3. Validation Rules

### For Supplier-Linked Passports

```
✓ Certification claims are TRUSTED
✓ No proof required (supplier already verified)
✓ Displays "Verified Supplier" badge
⚠ Warning if proof not provided (recommendation only)
```

### For Self-Created Passports

```
✗ BLOCKED if protected certification claimed without proof
✗ Must provide documentUrl (certificate PDF or verification link)
✗ Cannot issue Verifiable Credential until proof provided
```

### Example Validation Error

When a merchant tries to claim GOTS certification without proof:

```json
{
  "valid": false,
  "errors": [
    {
      "field": "certifications[0].documentUrl",
      "code": "CERT_PROOF_REQUIRED",
      "message": "\"Global Organic Textile Standard\" certification requires documentary proof. Upload the certificate or provide a verification URL."
    }
  ]
}
```

---

## 4. How It Works Technically

### Validation Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    DPP Validation                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Check if passport is supplier-linked                    │
│     └─ isSupplierLinked: true/false                         │
│                                                             │
│  2. Check supplier verification status                      │
│     └─ supplierVerificationStatus: 'VERIFIED' | other       │
│                                                             │
│  3. Determine if proof is required                          │
│     └─ Supplier-linked + VERIFIED = NO proof required       │
│     └─ All other cases = Proof REQUIRED                     │
│                                                             │
│  4. For each certification:                                 │
│     └─ Check if it's a protected certification              │
│     └─ If proof required AND no documentUrl:                │
│        └─ Add BLOCKING error (cannot issue VC)              │
│     └─ If proof not required AND no documentUrl:            │
│        └─ Add WARNING (recommendation only)                 │
│                                                             │
│  5. Return validation result                                │
│     └─ valid: false if any blocking errors                  │
│     └─ Cannot issue Verifiable Credential if invalid        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Code Example

```typescript
import { validateDppData, ValidationOptions } from './dpp-validation.server';

// Supplier-linked passport (proof NOT required)
const supplierLinkedOptions: ValidationOptions = {
  isSupplierLinked: true,
  supplierVerificationStatus: 'VERIFIED',
};
const result1 = validateDppData(dppData, supplierLinkedOptions);
// → Warnings only, no blocking errors for missing proof

// Self-created passport (proof REQUIRED)
const selfCreatedOptions: ValidationOptions = {
  isSupplierLinked: false,
};
const result2 = validateDppData(dppData, selfCreatedOptions);
// → Blocking error if protected certification lacks documentUrl
```

---

## 5. Cryptographic Verification

Even if someone copies DPP data, the **Verifiable Credential** reveals the true issuer:

| Passport Type | VC Issuer DID | Public Verification Shows |
|--------------|---------------|---------------------------|
| Supplier-Linked | `did:web:eurocomply.eu:o:supplier-name` | "Issued by Supplier Name (Verified)" |
| Self-Created | `did:web:eurocomply.eu:o:merchant-name` | "Issued by Merchant Name" |
| Copied (Fake) | Merchant's DID | "Issued by [Merchant]" - NOT supplier |

Anyone can verify a passport at `/v1/passports/:id/verify` to see:
- Who actually issued it (DID)
- When it was issued
- Whether the signature is valid
- If the issuer is a verified supplier

---

## 6. Business Incentives

### Why Pay for Supplier DPPs?

| Factor | Supplier-Linked (€1/mo) | Self-Created |
|--------|------------------------|--------------|
| **Credibility** | "Verified Supplier ✓" badge | "Self-declared" |
| **Liability** | Supplier liable for accuracy | Merchant liable |
| **Updates** | Auto-synced when supplier updates | Manual updates needed |
| **Proof** | Not required | Required for all protected certs |
| **ESPR Compliance** | Stronger audit trail | May face scrutiny |
| **Consumer Trust** | Higher | Lower |

### The Economics of Copying

A merchant considering copying supplier data would need to:
1. Obtain and upload proof for every protected certification
2. Accept liability for all claims
3. Forego the "Verified Supplier" badge
4. Manually update data when things change
5. Risk regulatory scrutiny during audits

For €1/month, the legitimate route is almost always preferable.

---

## 7. Summary

```
┌─────────────────────────────────────────────────────────────┐
│           EuroComply Trust Model Summary                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SUPPLIER-LINKED PASSPORTS                                  │
│  ✓ Trusted source (verified supplier)                       │
│  ✓ No proof required for certifications                     │
│  ✓ Displays "Verified Supplier" badge                       │
│  ✓ Cryptographically signed by supplier                     │
│                                                             │
│  SELF-CREATED PASSPORTS                                     │
│  ⚠ Self-declared data                                       │
│  ✗ MUST provide proof for protected certifications          │
│  ✗ No verified badge                                        │
│  ✗ Merchant bears liability                                 │
│                                                             │
│  COPYING IS TRANSPARENT                                     │
│  → VC signature reveals true issuer                         │
│  → Public verification shows who created it                 │
│  → No way to fake supplier verification badge               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Related Files

- `plugins/shopify/app/services/dpp-validation.server.ts` - Validation logic
- `plugins/shopify/app/types/dpp-schemas.ts` - Certification type definitions
- `apps/api/src/modules/product-trust/services/dpp.service.ts` - VC issuance
- `packages/database/prisma/schema.prisma` - Data model

---

*Last Updated: 2026-01-07*
