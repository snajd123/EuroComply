# Data Sovereignty Architecture

## Executive Summary

**The Decision**: Sovereignty through **portable data**, not portable infrastructure.

SMEs don't want to manage AWS accounts, Kubernetes clusters, or IPFS nodes. They want:
- Simple SaaS ("it just works")
- No lock-in ("I can leave anytime")
- Data ownership ("I own my data")
- Survival guarantee ("works if you disappear")

**Our Solution**: We host everything (simple), but the Verifiable Credential IS the sovereign asset. It's self-contained, cryptographically signed, and works forever without us.

---

## The Problem

EuroComply stores DPP data centrally. This creates concerns:
- Perceived vendor lock-in ("what if you go out of business?")
- Data residency concerns ("I need data in my country")
- Control anxiety ("can I keep a copy?")

## The Solution: Self-Contained Verifiable Credentials

The VC contains ALL the DPP data (not references to it). The cryptographic signature proves authenticity. Verification works offline, forever, without EuroComply.

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
│  ✅ One-Click Export                                            │
│     → Download VC + images + offline viewer                     │
│     → Always available, no restrictions                         │
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

## What We're Building

### Phase 1: Self-Contained VC Export (Priority)

```typescript
interface DppExport {
  // The signed VC with ALL data embedded
  credential: VerifiableCredential;

  // Same data as JSON (for non-VC tools)
  passportJson: DppData;

  // All images
  images: Array<{ name: string; data: Buffer }>;

  // Self-contained HTML viewer
  viewerHtml: string;

  // QR code SVG
  qrCode: string;
}

async function exportDpp(passportId: string): Promise<Buffer> {
  const passport = await getPassport(passportId);

  // Build self-contained VC with embedded data
  const credential = await buildSelfContainedVC(passport);

  // Generate offline viewer
  const viewer = generateOfflineViewer(credential);

  // Package as ZIP
  return createExportZip({
    credential,
    passportJson: passport.data,
    images: await downloadImages(passport.imageUrls),
    viewerHtml: viewer,
    qrCode: await generateQrSvg(passport.verificationUrl),
  });
}
```

### Phase 2: Public DPP Viewer

A hosted viewer that renders any DPP beautifully:

```
https://dpp.eurocomply.eu/view/{passportId}
```

- Mobile-friendly
- Shows all DPP data
- Displays verification status
- Links to download export

### Phase 3: Offline Viewer (included in export)

Single HTML file with:
- Embedded CSS/JS
- VC verification library
- Beautiful rendering
- Works without internet

---

## Pricing (Simplified)

```
┌────────────────────────────┬─────────┬─────────────────────────────┐
│ Tier                       │ Price   │ Sovereignty Features        │
├────────────────────────────┼─────────┼─────────────────────────────┤
│ Starter                    │ €49/mo  │ ✅ Self-contained VCs       │
│                            │         │ ✅ One-click export         │
│                            │         │ ✅ Offline verification     │
├────────────────────────────┼─────────┼─────────────────────────────┤
│ Growth                     │ €149/mo │ All Starter features        │
│                            │         │ ✅ API access               │
│                            │         │ ✅ Bulk export              │
├────────────────────────────┼─────────┼─────────────────────────────┤
│ Pro                        │ €399/mo │ All Growth features         │
│                            │         │ ✅ White-label viewer       │
│                            │         │ ✅ Custom domain option     │
├────────────────────────────┼─────────┼─────────────────────────────┤
│ Enterprise                 │ €599+   │ All Pro features            │
│                            │         │ ✅ Dedicated infrastructure │
│                            │         │ ✅ Deploy to your cloud     │
│                            │         │ ✅ SLA guarantees           │
└────────────────────────────┴─────────┴─────────────────────────────┘
```

**Note**: All tiers get the same sovereignty guarantees. Enterprise just adds dedicated infrastructure for customers who want physical isolation.

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
  const subjectDid = await getSupplierDid(passport.supplierId);

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

- [Self-Service Onboarding](./SELF_SERVICE_ONBOARDING.md) - How suppliers sign up
- [Business Model](./BUSINESS_MODEL.md) - Pricing tiers
- [Implementation Roadmap](./IMPLEMENTATION_ROADMAP.md) - Development phases

---

*Last Updated: 2026-01-08*
