# Data Sovereignty Architecture

> ✅ **Implementation Status**: Data sovereignty features are **COMPLETE**. See implementation details below.

## Implementation Status

| Feature | Status | Implementation |
|---------|--------|----------------|
| DID Method | ✅ `did:key` | `packages/identity/src/services/did-key.service.ts` |
| VC Content | ✅ All data embedded | `packages/identity/src/services/vc-export.service.ts` |
| Verification | ✅ Works offline | `did-key.service.ts` - `verifySignatureOffline()` |
| Export | ✅ Implemented | `vc-export.service.ts` - `exportPortablePackage()` |
| Offline Viewer | ✅ Implemented | `vc-export.service.ts` - `generateOfflineViewer()` |
| API Endpoints | ✅ Implemented | `apps/api/src/core/routes.ts` |

**Test Coverage:** 34 tests (16 did:key + 11 vc-export + 7 export service) - all passing

## Executive Summary

**The Decision**: Sovereignty through **portable data**, not portable infrastructure.

SMEs don't want to manage AWS accounts, Kubernetes clusters, or IPFS nodes. They want:
- Simple SaaS ("it just works")
- No lock-in ("I can leave anytime")
- Data ownership ("I own my data")
- Survival guarantee ("works if you disappear")

**Target Solution**: We host everything (simple), but the Verifiable Credential IS the sovereign asset. It's self-contained, cryptographically signed, and works forever without us.

---

## The Problem

EuroComply stores DPP data centrally. This creates concerns:
- Perceived vendor lock-in ("what if you go out of business?")
- Data residency concerns ("I need data in my country")
- Control anxiety ("can I keep a copy?")

## The Solution: Self-Contained Verifiable Credentials

The VC contains ALL the DPP data (not references to it). The cryptographic signature proves authenticity. **Signature verification** works offline, forever, without EuroComply.

**Important Clarification: What "Offline" Means**

| Capability | Offline? | Notes |
|------------|----------|-------|
| **Signature Verification** | ✅ Yes | did:key is self-contained, no server needed |
| **Data Integrity Check** | ✅ Yes | Hash verification is local computation |
| **Text Data Display** | ✅ Yes | All text/JSON embedded in VC |
| **Image Rendering (URL mode)** | ❌ No | URLs require CDN access |
| **Image Rendering (Base64 mode)** | ✅ Yes | Images embedded in VC (larger file size) |

**Image Options at DPP Issuance:**
- **URL Mode (default)**: Images stored as CDN URLs. Smaller VC file (~5KB), but requires network for full rendering.
- **Base64 Mode**: Images embedded as base64 strings. Larger VC file (~2MB), but renders completely offline.

Organizations can choose per-DPP or set an organization-wide default. For products printed on physical packaging (where QR codes are scanned), URL mode is recommended. For archival or offline-critical use cases, Base64 mode ensures complete independence.

```
┌─────────────────────────────────────────────────────────────────┐
│  WHAT THE CUSTOMER GETS                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ Self-Contained VC                                           │
│     → ALL product data embedded inside                          │
│     → Not references, the actual data                           │
│     → Images as URLs or base64 (customer's choice)              │
│                                                                 │
│  ✅ Cryptographic Signature                                     │
│     → Proves data wasn't tampered with                          │
│     → Verifiable offline without EuroComply                     │
│     → Works forever                                             │
│                                                                 │
│  ✅ Open Standards                                              │
│     → W3C Verifiable Credentials                                │
│     → JSON format                                               │
│     → Any compatible viewer works                               │
│                                                                 │
│  ✅ Export Always Available (All Plans)                         │
│     → Individual DPP: VC + images + offline viewer              │
│     → Bulk Product Data: CSV/JSON export of workspace data      │
│     → Full Organization Export: Everything for migration        │
│     → No tier restrictions, no extra cost                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture: Managed Hosting + Portable Data

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  EUROCOMPLY PLATFORM                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  DPP Creator  →  Compliance  →  VC Issuer  →  Viewer    │   │
│  │  (Forms/UI)      Validator      (Signing)     (HTML)    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│              ┌───────────────────────────────┐                  │
│              │  Self-Contained VC            │                  │
│              │  {                            │                  │
│              │    "issuer": "did:key:...",   │                  │
│              │    "credentialSubject": {     │                  │
│              │      // ALL DPP DATA HERE     │                  │
│              │      "product": {...},        │                  │
│              │      "fiberComposition": [...],│                 │
│              │      "carbonFootprint": {...}, │                 │
│              │      "certifications": [...]  │                  │
│              │    },                         │                  │
│              │    "proof": {...}  // Signature                  │
│              │  }                            │                  │
│              └───────────────────────────────┘                  │
│                              │                                  │
│           ┌──────────────────┼──────────────────┐               │
│           ▼                  ▼                  ▼               │
│    ┌────────────┐    ┌────────────┐    ┌────────────┐          │
│    │ EuroComply │    │  Customer  │    │   Any      │          │
│    │ Viewer     │    │  Export    │    │   Viewer   │          │
│    │ (hosted)   │    │  (download)│    │   (open)   │          │
│    └────────────┘    └────────────┘    └────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

WHAT EACH COMPONENT DOES:
├── EuroComply Viewer: We host, renders the VC nicely
├── Customer Export: They download everything, host anywhere
└── Any Viewer: Open standards mean any compatible app works
```

---

## Hosting Infrastructure & Data Residency

All data is stored in the EU, using GDPR-compliant infrastructure:

```
┌─────────────────────────────────────────────────────────────────┐
│  EU DATA RESIDENCY                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WRITE PATH (PIM, User Data)                                    │
│  ─────────────────────────────                                  │
│  Provider: AWS (Amazon Web Services)                            │
│  Region: eu-central-1 (Frankfurt, Germany)                      │
│  Services: RDS PostgreSQL, ECS, ElastiCache, S3                 │
│  Compliance: GDPR, SOC 2, ISO 27001                             │
│                                                                  │
│  READ PATH (DPP Public Access)                                  │
│  ─────────────────────────────                                  │
│  CDN: Cloudflare (global edge, EU origin)                       │
│  Origins: Hetzner (German company)                              │
│    • Falkenstein, Germany                                       │
│    • Helsinki, Finland                                          │
│    • Nuremberg, Germany                                         │
│  Compliance: GDPR, German data protection law                   │
│                                                                  │
│  KEY POINTS                                                     │
│  ──────────                                                     │
│  • All data stored in EU                                        │
│  • Hetzner is German company (subject to German law)            │
│  • Cloudflare configured for EU-only origin (data never         │
│    stored in US/other regions)                                  │
│  • AWS EU data processing addendum (DPA) in place               │
│  • No data transfer outside EU without customer consent         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

See [INFRASTRUCTURE.md](../INFRASTRUCTURE.md) for technical details.

---

## The VC Contains Everything

This is the key architectural decision. The VC is NOT a reference to data stored elsewhere. It contains ALL the DPP data:

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://eurocomply.eu/schemas/dpp/v1"
  ],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "issuanceDate": "2026-01-08T12:00:00Z",

  "credentialSubject": {
    "id": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",

    "product": {
      "name": "Organic Cotton T-Shirt",
      "gtin": "4012345678901",
      "category": "textile",
      "description": "100% organic cotton t-shirt"
    },

    "fiberComposition": [
      {
        "fiberType": "Cotton",
        "percentage": 100,
        "origin": "Organic",
        "country": "EG"
      }
    ],

    "manufacturer": {
      "name": "EcoTextile GmbH",
      "country": "DE",
      "address": "Berlin, Germany",
      "registrationNumber": "HRB 12345"
    },

    "carbonFootprint": {
      "value": 8.5,
      "unit": "kgCO2e",
      "methodology": "PEF",
      "scope": "Cradle-to-gate"
    },

    "certifications": [
      {
        "type": "GOTS",
        "certificateNumber": "GOTS-12345",
        "issuingBody": "Control Union",
        "validFrom": "2025-01-01",
        "validUntil": "2027-01-01"
      }
    ],

    "careInstructions": {
      "maxWashTemperature": 30,
      "bleachAllowed": false,
      "tumbleDryAllowed": false,
      "ironTemperature": "low"
    },

    "images": [
      {
        "type": "product",
        "url": "https://cdn.eurocomply.eu/images/abc123.jpg",
        "hash": "sha256:e3b0c44298fc1c149afbf4c8996fb..."
      }
    ]
  },

  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-01-08T12:00:00Z",
    "verificationMethod": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK#key-1",
    "proofPurpose": "assertionMethod",
    "proofValue": "z58DAdFfa9SkqZMVPxAQpic7ndTeel..."
  }
}
```

**Key points:**
- All data is in `credentialSubject` - embedded, not referenced
- `proof` is the cryptographic signature - verifiable offline
- `issuer` is EuroComply's DID - proves we signed it
- `credentialSubject.id` is customer's DID - proves they own it

---

## Sovereignty Guarantees

| What SMEs Want | How We Deliver It |
|----------------|-------------------|
| "I own my data" | VC contains all data, customer's DID owns it |
| "No lock-in" | Open standards (W3C VC, JSON), any viewer works |
| "What if you die?" | One-click export + offline verification |
| "No IT skills needed" | We host everything, export is just a download |

---

## One-Click Export

What the customer downloads:

```
dpp-export-12345.zip
├── credential.jwt              # The signed Verifiable Credential
├── passport.json               # Human-readable JSON (same data)
├── images/
│   ├── product-hero.jpg
│   ├── cert-gots.png
│   └── cert-oeko-tex.png
├── viewer.html                 # Self-contained offline viewer
├── qr-code.svg                 # For printing
└── README.md                   # How to use/verify
```

**The `viewer.html` is self-contained:**
- All CSS/JS embedded (no external dependencies)
- Loads the VC from same folder
- Verifies signature offline
- Renders beautiful DPP page
- Works forever without internet

---

## Options Analyzed (And Why We Rejected Them)

### Container-per-Customer

```
Customer pays → We spin up container → Customer owns infrastructure
```

**Why NOT:**
- SMEs don't have DevOps skills
- Support burden exceeds revenue
- €50-110/month infrastructure + customer labor
- Defeats "no IT team needed" promise

**Verdict**: Only for Enterprise tier (€599+/month)

---

### Create AWS Accounts for Customers

```
Customer signs up → We create AWS account → Deploy to their account
```

**Why NOT:**
- AWS doesn't support easy account transfer
- Consolidated billing is complex
- Ownership is legally murky
- Managing 1000s of AWS accounts is operational nightmare

**Verdict**: Not feasible

---

### IPFS as Primary Storage

```
All VCs stored on IPFS → Decentralized, survives if we die
```

**Why NOT:**
- SMEs don't know what IPFS is
- Gateways can be slow/unreliable
- Pinning costs money (~€20-50/month)
- Overkill for the problem

**Verdict**: Good as optional add-on, not primary

---

### Self-Hosted Open Source

```
Customer downloads our software → Runs on their servers
```

**Why NOT:**
- Requires technical skills
- Customer handles updates, security, backups
- Support burden shifts to them
- Defeats "no IT team needed" promise

**Verdict**: Only for technical customers who specifically want it

---

## What We Built ✅

### Self-Contained VC Export ✅ COMPLETE

**Location:** `packages/identity/src/services/vc-export.service.ts`

```typescript
// Create self-contained VC
const vc = await vcExportService.createSelfContainedVC({
  issuerDid: did,
  issuerKeyId: keyId,
  subjectId: 'urn:gtin:1234567890123',
  dppData: { productName: '...', fiberComposition: [...], ... },
  images: [{ name: 'product.png', data: 'data:image/png;base64,...' }],
});

// Export portable package
const package = await vcExportService.exportPortablePackage({
  issuerDid: did,
  issuerKeyId: keyId,
  subjectId: 'urn:gtin:1234567890123',
  dppData: dppData,
  includePrivateKey: true, // For ownership transfer
});
// Returns: { files: [...], manifest: {...} }
```

### Offline HTML Viewer ✅ COMPLETE

**Location:** `vc-export.service.ts` - `generateOfflineViewer()`

Single HTML file with:
- ✅ Embedded CSS (no external dependencies)
- ✅ Beautiful DPP rendering
- ✅ QR code display
- ✅ Works without internet

### did:key Service ✅ COMPLETE

**Location:** `packages/identity/src/services/did-key.service.ts`

```typescript
// Create did:key
const { did, keyId } = await didKeyService.createDidKey({ algorithm: 'EdDSA' });
// did = "did:key:z6Mk..."

// Offline verification (no network!)
const isValid = await didKeyService.verifySignatureOffline(did, data, signature);

// Key export for portability
const privateKey = await didKeyService.exportPrivateKey(keyId);

// Key import (on different machine)
const newKeyId = await didKeyService.importPrivateKey(privateKey);
```

### API Endpoints ✅ COMPLETE

**Location:** `apps/api/src/modules/organization/routes.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/organization/export/did` | GET | Get or create organization's did:key |
| `/api/v1/organization/export/dpp/:productId` | POST | Export DPP as portable package |
| `/api/v1/organization/export/keys` | POST | Export signing keys (requires confirmation) |
| `/api/v1/organization/export/viewer/:productId` | GET | Download offline HTML viewer |

**Usage Examples:**

```bash
# Get organization's DID
curl -X GET https://api.eurocomply.eu/v1/organization/export/did \
  -H "Authorization: Bearer <token>"

# Export DPP as portable package
curl -X POST https://api.eurocomply.eu/v1/organization/export/dpp/prod_123 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"includePrivateKey": false}'

# Export signing keys (requires explicit confirmation)
curl -X POST https://api.eurocomply.eu/v1/organization/export/keys \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"confirmKeyExport": true}'

# Download offline HTML viewer
curl -X GET https://api.eurocomply.eu/v1/organization/export/viewer/prod_123 \
  -H "Authorization: Bearer <token>" \
  -o dpp-viewer.html
```

---

## Pricing

```
┌────────────────────────────┬─────────┬─────────────────────────────┐
│ Tier                       │ Price   │ Features                    │
├────────────────────────────┼─────────┼─────────────────────────────┤
│ Growth (2,000 products)    │ €129/mo │ ✅ Full platform access     │
│                            │         │ ✅ Self-contained VCs       │
│                            │         │ ✅ One-click export         │
│                            │         │ ✅ Offline verification     │
│                            │         │ ✅ Full PIM + Attestation   │
│                            │         │ ✅ Shopify sync + API       │
│                            │         │ ✅ 100 AI imports/month     │
├────────────────────────────┼─────────┼─────────────────────────────┤
│ Scale (20,000 products)    │ €399/mo │ ✅ Full platform access     │
│                            │         │ ✅ 1,000 AI imports/month   │
│                            │         │ ✅ Higher API limits        │
│                            │         │ ✅ Priority support         │
├────────────────────────────┼─────────┼─────────────────────────────┤
│ Enterprise (Unlimited)     │ Custom  │ ✅ Full platform access     │
│                            │         │ ✅ Custom AI limits         │
│                            │         │ ✅ SSO, 99.9% SLA           │
│                            │         │ ✅ Dedicated support        │
└────────────────────────────┴─────────┴─────────────────────────────┘

**All tiers include unlimited users and full data sovereignty guarantees.**
```

All customers receive full platform access. Tier differentiation is based solely on catalog capacity.

---

## Marketing the Sovereignty Story

### Messaging

> "Your Data, Your Rules, Our Tools"

### Key Points

1. **You own it** - VCs contain all data, signed to your DID
2. **No lock-in** - Open standards, any viewer works
3. **Works forever** - Offline verification, no EuroComply dependency
4. **Simple** - We host everything, one-click export

### FAQ: "What happens if EuroComply disappears?"

> Your Digital Product Passports continue to work. Here's why:
>
> 1. **Your VCs are self-contained** - All data is inside the credential, not stored on our servers
> 2. **Cryptographic signatures verify offline** - No server check needed
> 3. **Export anytime** - Download everything with one click
> 4. **Open standards** - Any W3C VC-compatible viewer works
>
> We recommend downloading your export periodically as a backup. But even if you don't, the VCs you've shared (via QR codes, etc.) will continue to verify forever.

### Trust Badges

- "Data Portable" - Export your data anytime
- "No Lock-in" - Works without us
- "Open Standards" - W3C Verifiable Credentials
- "Offline Verification" - No server dependency

---

## Technical Implementation

### Self-Contained VC Builder

```typescript
async function buildSelfContainedVC(passport: Passport): Promise<VerifiableCredential> {
  const issuerDid = await getEuroComplyDid();
  const subjectDid = await getOrganizationDid(passport.organizationId);

  // Build credential with ALL data embedded
  const credential: VerifiableCredential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://eurocomply.eu/schemas/dpp/v1'
    ],
    type: ['VerifiableCredential', 'DigitalProductPassport'],
    issuer: issuerDid,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: subjectDid,
      // Embed ALL the passport data
      ...passport.data,
    },
  };

  // Sign the credential
  const signedCredential = await signCredential(credential, issuerDid);

  return signedCredential;
}
```

### Offline Verification Library

```typescript
// Embedded in viewer.html
async function verifyCredential(credential: VerifiableCredential): Promise<VerificationResult> {
  // 1. Check structure
  if (!credential.proof) {
    return { valid: false, error: 'No proof found' };
  }

  // 2. Resolve issuer DID (did:key is self-contained - no network needed!)
  const issuerPublicKey = resolveDidKey(credential.issuer);

  // 3. Verify signature
  const signatureValid = await verifySignature(
    credential,
    credential.proof,
    issuerPublicKey
  );

  if (!signatureValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  // 4. Check expiration if present
  if (credential.expirationDate && new Date(credential.expirationDate) < new Date()) {
    return { valid: false, error: 'Credential expired' };
  }

  return { valid: true, issuer: credential.issuer };
}

// did:key is self-contained - public key IS the identifier
function resolveDidKey(did: string): PublicKey {
  // did:key:z6Mk... contains the public key in the identifier itself
  // No network request needed!
  const multibase = did.replace('did:key:', '');
  return decodeMultibase(multibase);
}
```

---

## Related Documentation

- [Self-Service Onboarding](./SELF_SERVICE_ONBOARDING.md) - How organizations sign up
- [Business Model](./BUSINESS_MODEL.md) - Pricing tiers
- [Implementation Plan](../IMPLEMENTATION_PLAN.md) - Development phases

---

*Last Updated: 2026-01-12*
