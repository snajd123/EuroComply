# Verifiable Credentials for Digital Product Passports

## How EuroComply Uses walt.id for Portable, Verifiable DPPs

---

## 1. The Problem with Traditional DPPs

Most Digital Product Passport implementations are essentially **fancy PDFs** or **database lookups**:

```
Traditional DPP Flow:
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  QR Code on  │ ──►  │  Lookup in   │ ──►  │  Display     │
│  Product     │      │  Database    │      │  Product Info│
└──────────────┘      └──────────────┘      └──────────────┘

Problems:
• Data can be changed at any time (no tamper evidence)
• Verifier must trust the database operator
• Single point of failure
• No cryptographic proof of who created the data
• No proof of when the data was created
• Data is locked to the platform
```

**The trust question:** When a consumer or regulator scans a DPP QR code, how do they know:
1. The data hasn't been tampered with?
2. It was actually issued by the claimed manufacturer?
3. It hasn't been revoked or updated?
4. It will still exist if the platform shuts down?

---

## 2. The Innovation: Portable, Verifiable DPPs

EuroComply issues DPPs as **W3C Verifiable Credentials** with **did:key** identifiers - making them portable, self-verifying, and independent of any platform.

```
EuroComply DPP Flow:
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  QR Code on  │ ──►  │  Fetch VC    │ ──►  │  Verify      │
│  Product     │      │  (JSON)      │      │  Signature   │
└──────────────┘      └──────────────┘      └──────────────┘
                                                   │
                                                   ▼
                                            ┌──────────────┐
                                            │ ✓ Issuer DID │
                                            │ ✓ Not Tampered│
                                            │ ✓ Not Expired │
                                            │ ✓ Portable   │
                                            └──────────────┘

Benefits:
• Cryptographic tamper evidence (signature breaks if data changes)
• Self-contained verification (no need to contact any server)
• Issuer accountability (did:key proves who made the claim)
• Portable (supplier owns it, can host anywhere)
• Platform-independent (works even if EuroComply shuts down)
```

### What Makes This Different

| Aspect | Traditional DPP | EuroComply VC-DPP |
|--------|-----------------|-------------------|
| **Tamper Evidence** | None - data can be silently changed | Cryptographic - any change breaks signature |
| **Trust Model** | Trust the database operator | Trust math (cryptographic verification) |
| **Issuer Proof** | "Trust me, I'm the manufacturer" | did:key signature proves issuer identity |
| **Verification** | Requires server connection | Works offline, anywhere |
| **Portability** | Locked to platform | Supplier owns, can move anywhere |
| **Platform Dependency** | Dies with platform | Works forever |
| **Interoperability** | Proprietary formats | W3C standard, works with EUDI wallets |

---

## 3. Why did:key Instead of did:web?

### The Portability Problem with did:web

```
did:web:eurocomply.eu:org:acme-corp
       └── Requires EuroComply to host DID document
       └── If EuroComply stops hosting, verification breaks
       └── Creates platform dependency
```

### The did:key Solution

```
did:key:z6MkhaXgBZDvvvRhta4LjXRJzL...
       └── The public key IS the identifier
       └── No resolution needed
       └── Works forever, anywhere
       └── Supplier truly owns their identity
```

### How did:key Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        did:key EXPLAINED                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  A did:key is a self-contained identifier:                      │
│                                                                  │
│  did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS      │
│          └───────────────────────────────────────────┘          │
│                          │                                       │
│                          └── This IS the public key              │
│                              (Base58-encoded Ed25519)            │
│                                                                  │
│  To verify a signature:                                         │
│  1. Parse the did:key to extract the public key                 │
│  2. Use the public key to verify the signature                  │
│  3. No network call needed!                                     │
│                                                                  │
│  The identity is SELF-CONTAINED in the DID string itself.       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Comparison

| Aspect | did:web | did:key |
|--------|---------|---------|
| **Resolution** | HTTP call to domain | Parse the string |
| **Hosting Required** | Yes (DID document) | No |
| **Platform Dependency** | Yes | No |
| **Works Offline** | No | Yes |
| **Portability** | Limited | Full |
| **Human Readable** | Nice branding | Less pretty |

**We chose did:key because suppliers own their identity, not EuroComply.**

---

## 4. Technical Architecture

### 4.1 The Identity Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EuroComply Platform                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────────┐                    ┌─────────────────────┐    │
│   │  Supplier API   │                    │   packages/identity │    │
│   │                 │ ───────────────►   │   (walt.id wrapper) │    │
│   │                 │                    │                     │    │
│   │ POST /dpp       │                    │ • DidKeyService     │    │
│   │ GET /export     │                    │ • VcService         │    │
│   │ GET /verify     │                    │ • KeyService        │    │
│   └─────────────────┘                    └──────────┬──────────┘    │
│                                                     │               │
└─────────────────────────────────────────────────────┼───────────────┘
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      walt.id Community Stack                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │
│   │   Core API  │  │  Signatory  │  │  Custodian  │  │  Auditor  │ │
│   │  (DID ops)  │  │  (VC issue) │  │  (Key mgmt) │  │ (Verify)  │ │
│   │  :7000      │  │  :7001      │  │  :7002      │  │  :7003    │ │
│   └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Organization Identity (did:key)

When an organization (brand, manufacturer, distributor) signs up:

1. Generate Ed25519 key pair
2. Create did:key from public key
3. Store private key securely (exportable)
4. Organization can export keys at any time

```
Organization DID: did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS
                  ──────────────────────────────────────────────────────────
                                        │
                                        └── Self-contained, portable identity
```

### 4.3 User-Level DIDs (Chain of Custody)

In addition to Organization DIDs (for issuing DPPs), each user within an organization has their own did:key for internal chain of custody:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DID HIERARCHY                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ORGANIZATION DID (did:key:zOrg...)                                         │
│  └── Purpose: Issue DPPs (external, public-facing)                          │
│  └── Stored: walt.id Custodian (org-level key)                              │
│  └── Signs: DigitalProductPassport VCs                                      │
│                                                                              │
│  USER DIDs (did:key:zUser...)                                               │
│  └── Purpose: Sign product versions (internal chain of custody)             │
│  └── Stored: walt.id Custodian (per-user keys)                              │
│  └── Signs: ProductVersion snapshots on approval/publish                    │
│                                                                              │
│  CONTRIBUTOR DIDs (did:key:zContributor...)                                 │
│  └── Purpose: Sign third-party attestations                                 │
│  └── Stored: walt.id Custodian (per-contributor keys)                       │
│  └── Signs: Attestation VCs for product data contributions                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### What Gets Signed

| Entity | Signed By | DID Type | When |
|--------|-----------|----------|------|
| ProductVersion | User (Editor/Manager) | User DID | On publish/approve |
| DigitalProductPassport | Organization | Org DID | On DPP issuance |
| Attestation | Third-party Contributor | Contributor DID | On attestation submit |

#### User DID Lifecycle

1. **User invited to organization** - No DID yet (created on first signing action)
2. **First signing action** - System generates did:key via walt.id Custodian
3. **Ongoing work** - Same DID used for all future signatures
4. **User leaves** - User deactivated, DID remains for audit trail
5. **Data export** - User DIDs included in export package

#### Chain of Custody Example

```
Product: Organic Cotton T-Shirt (TSH-001)

v3 (LIVE) ──────────────────────────────────────────────────────
│ Signed by: Sarah Chen (EDITOR)
│ DID: did:key:z6MkSarah...
│ Signature: eyJhbGciOiJFZERTQSJ9...
│ Changes: Updated fiber composition

v2 ─────────────────────────────────────────────────────────────
│ Signed by: John Smith (MANAGER)
│ DID: did:key:z6MkJohn...
│ Signature: eyJhbGciOiJFZERTQSJ9...
│ Approved submission from: Maria Garcia (CONTRIBUTOR)

v1 ─────────────────────────────────────────────────────────────
  Created by: Admin
  DID: did:key:z6MkAdmin...
  Signature: eyJhbGciOiJFZERTQSJ9...

DPP Issued ─────────────────────────────────────────────────────
  Signed by: Organization
  DID: did:key:z6MkOrg...
  References: v3 as the source version
```

All user DIDs are stored in walt.id Custodian alongside organization keys, using the same infrastructure and security model.

See [USER_MANAGEMENT.md](./USER_MANAGEMENT.md) for full details on user roles, permissions, and version control workflow.

### 4.4 The DPP as a Verifiable Credential

When a product reaches 100% DPP completeness, it appears in the **DPP Ready list** for review. When the organization approves issuance, the DPP is signed and becomes a portable VC:

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://eurocomply.eu/contexts/dpp/v1"
  ],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS",
  "issuanceDate": "2026-01-08T10:30:00Z",
  "credentialSubject": {
    "id": "urn:gtin:5901234123457",
    "type": "Product",
    "name": "Organic Cotton T-Shirt",
    "gtin": "5901234123457",
    "manufacturer": {
      "name": "EcoTextiles GmbH",
      "country": "DE"
    },
    "sustainability": {
      "carbonFootprint": {
        "value": 5.2,
        "unit": "kgCO2e",
        "scope": "cradle-to-gate"
      },
      "recyclability": {
        "percentage": 85,
        "instructions": "Remove buttons before recycling"
      },
      "materials": [
        {"name": "Organic Cotton", "percentage": 95, "certified": true},
        {"name": "Elastane", "percentage": 5}
      ]
    },
    "certifications": [
      {"name": "GOTS", "issuer": "Control Union", "validUntil": "2027-06-15"}
    ]
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-01-08T10:30:00Z",
    "verificationMethod": "did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS#key-1",
    "proofPurpose": "assertionMethod",
    "proofValue": "z3FXQTimwQMHMDxfKvXNyL..."
  }
}
```

**Key Points:**
- `issuer` is a did:key - no server resolution needed
- `proof` contains the cryptographic signature
- The entire credential is self-contained and portable
- Anyone can verify it without contacting EuroComply

---

## 5. Self-Contained VCs & Data Sovereignty

### The Key Architectural Decision

**The VC contains ALL the DPP data** - not references to data stored elsewhere. This is a critical design choice for data sovereignty.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SELF-CONTAINED VCs                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  The VC file contains EVERYTHING:                               │
│                                                                  │
│  1. ALL DPP data (embedded in credentialSubject)               │
│     • Product info, fiber composition, carbon footprint         │
│     • Manufacturer details, certifications, care instructions   │
│     • NOT references to external databases                      │
│                                                                  │
│  2. The issuer identity (did:key)                              │
│     • Public key IS the identifier                              │
│     • No server needed to resolve                               │
│                                                                  │
│  3. The cryptographic signature (proof)                         │
│     • Proves data wasn't tampered                               │
│     • Works offline, forever                                    │
│                                                                  │
│  This means:                                                    │
│  • The VC IS the DPP (not a pointer to it)                     │
│  • Can be verified by ANYONE, ANYWHERE, OFFLINE                │
│  • Works FOREVER without any server                            │
│  • Supplier truly OWNS their data                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

See [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) for full architecture details.

### One-Click Export Package

When an organization exports their data (or cancels subscription):

```
dpp-export-{supplier-id}.zip
├── credentials/
│   ├── dpp-001.vc.json     (signed VC with ALL data embedded)
│   ├── dpp-002.vc.json
│   └── ...
├── identity/
│   ├── did.json            (DID document)
│   └── private-key.jwk     (for future VC signing)
├── images/
│   ├── product-001-hero.jpg
│   └── cert-gots.png
├── viewer.html             (self-contained offline viewer)
├── qr-codes/
│   ├── dpp-001.svg
│   └── ...
└── manifest.json           (GTIN → VC mapping)
```

**The `viewer.html` is self-contained:**
- All CSS/JS embedded (no external dependencies)
- Loads the VC from same folder
- Verifies signature offline
- Renders beautiful DPP page
- Works forever without internet

### What Organizations Can Do After Export

1. **Self-host** - Put VCs on their own server
2. **Use another provider** - Import into any VC-compatible platform
3. **Decentralized storage** - Upload to IPFS/Arweave
4. **Continue signing** - Use exported private key to issue new VCs
5. **Provide to retailers** - Give VCs directly to retail partners

---

## 6. Verification Flow

### What Happens When Someone Verifies a DPP

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DPP Verification Flow                                │
└─────────────────────────────────────────────────────────────────────────────┘

     Consumer/Regulator              Any Verifier              did:key Logic
            │                              │                         │
            │  1. Get VC (JSON file)       │                         │
            │─────────────────────────────►│                         │
            │                              │                         │
            │                              │  2. Parse did:key       │
            │                              │  from issuer field      │
            │                              │────────────────────────►│
            │                              │                         │
            │                              │  3. Extract public key  │
            │                              │  (no network call!)     │
            │                              │◄────────────────────────│
            │                              │                         │
            │                              │  4. Verify signature    │
            │                              │  using public key       │
            │                              │                         │
            │  5. Verification result      │                         │
            │◄─────────────────────────────│                         │
            │                              │                         │
            │  ✓ VALID                     │                         │
            │  • Issuer: did:key:z6Mkh...  │                         │
            │  • Issued: 2026-01-08        │                         │
            │  • Not tampered              │                         │
            │  • Works offline!            │                         │
```

### Public Verification Endpoint

```bash
# Verify via EuroComply (while hosted)
curl https://api.eurocomply.eu/v1/verify/dpp_abc123

# Or verify locally (works anywhere, anytime)
walt verify credential --credential dpp-001.vc.json
```

Response:
```json
{
  "valid": true,
  "issuer": {
    "did": "did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS",
    "name": "EcoTextiles GmbH"
  },
  "issuanceDate": "2026-01-08T10:30:00Z",
  "verification": {
    "signatureValid": true,
    "notExpired": true,
    "issuerTrusted": true
  }
}
```

---

## 7. Why This Matters

### For Organizations

| Benefit | Description |
|---------|-------------|
| **Ownership** | You own your DPPs and identity, not EuroComply |
| **Portability** | Take your data anywhere, anytime |
| **No lock-in** | Cancel subscription, keep your VCs |
| **Future-proof** | VCs work forever, no platform dependency |
| **Legal protection** | Cryptographic proof of what you claimed, when |

### For Retailers

| Benefit | Description |
|---------|-------------|
| **Trust** | Cryptographic proof, not just a database entry |
| **Independence** | Can verify without contacting the brand |
| **Offline** | Verification works without internet |
| **Standards** | W3C format works with any compliant tool |
| **Free access** | Public API, widget, and Shopify app at no cost |

### For Regulators

| Benefit | Description |
|---------|-------------|
| **Enforcement** | Can verify claims without trusting any company |
| **Audit trail** | Immutable record of sustainability declarations |
| **Standards** | W3C/eIDAS standards, not proprietary formats |
| **Resilience** | VCs survive platform shutdowns |

### For Consumers

| Benefit | Description |
|---------|-------------|
| **Transparency** | Can independently verify claims |
| **Interoperability** | Works with EUDI wallets (future) |
| **Trust** | Mathematical proof, not marketing promises |

---

## 8. The "Greenwashing Defense"

**Scenario:** A company claims their product has a 5.2 kgCO2e carbon footprint. Two years later, an NGO accuses them of greenwashing.

| Traditional DPP | EuroComply VC-DPP |
|-----------------|-------------------|
| Company: "We said 5.2 at the time" | Company produces the VC |
| NGO: "Prove it" | VC has timestamp + signature |
| Company: "Here's our database record" | Signature proves data unchanged |
| NGO: "You could have edited that" | Cryptographic proof of original claim |
| **Result: He-said-she-said** | **Result: Mathematical proof** |

The VC serves as a **time-stamped, tamper-evident receipt** of what the company claimed.

---

## 9. Key Management

### Private Keys Never Exposed

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Key Management Architecture                     │
└─────────────────────────────────────────────────────────────────────┘

  EuroComply API                walt.id Custodian              Key Storage
       │                              │                             │
       │  "Sign this VC with         │                             │
       │   supplier's key"           │                             │
       │─────────────────────────────►│                             │
       │                              │                             │
       │                              │  Retrieve private key       │
       │                              │─────────────────────────────►│
       │                              │                             │
       │                              │  Sign data                  │
       │                              │◄─────────────────────────────│
       │                              │                             │
       │  Signed VC returned          │                             │
       │◄─────────────────────────────│                             │
       │                              │                             │
       │  (Private key stays          │                             │
       │   in Custodian)              │                             │
```

### Export Available

Suppliers can export their private key when:
- They want to self-host
- They're canceling subscription
- They want backup

```typescript
// Export endpoint
POST /api/supplier/export

Response:
{
  "identity": {
    "did": "did:key:z6Mkh...",
    "privateKeyJwk": {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "...",
      "d": "..."  // Private key component
    }
  },
  "credentials": [...]
}
```

---

## 10. Configuration

```typescript
// packages/identity/src/config.ts

export const defaultConfig: IdentityConfig = {
  waltid: {
    coreApi: process.env.WALTID_CORE_API || 'http://localhost:7000',
    signatoryApi: process.env.WALTID_SIGNATORY_API || 'http://localhost:7001',
    custodianApi: process.env.WALTID_CUSTODIAN_API || 'http://localhost:7002',
    auditorApi: process.env.WALTID_AUDITOR_API || 'http://localhost:7003',
  },
  did: {
    method: 'key',  // did:key for portability
  },
  features: {
    exportEnabled: true,  // Suppliers can export keys
  },
};
```

---

## 11. Understanding DIDs, Keys, and Organization Identity

### How did:key Works

A common misconception is that you can choose what goes in a `did:key` (like a company name). **This is not how it works.**

```
┌─────────────────────────────────────────────────────────────────┐
│                    did:key GENERATION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Generate cryptographic key pair                        │
│                                                                  │
│    ┌─────────────────────────────────────────────────────────┐  │
│    │  Ed25519 Key Pair                                       │  │
│    │  Private: 0x7f3a...def456 (kept secret)                 │  │
│    │  Public:  0xed01abc123...789xyz                         │  │
│    └─────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 2: Encode public key as did:key                           │
│                                                                  │
│    Public Key → Multicodec prefix → Base58 encode → did:key     │
│                                                                  │
│    0xed01abc123...789xyz                                        │
│           ↓                                                      │
│    did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS    │
│            └─────────────────────────────────────────────────┘  │
│                    This IS the public key                        │
│                                                                  │
│  The DID is DERIVED from the key. You cannot choose it.         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Where Does Organization Identity Live?

The DID is **cryptographic identity** (a key). The **human identity** (company name, VAT number, etc.) is stored as metadata:

```json
{
  "issuer": "did:key:z6MkhaXgBZDvvvRhta...",

  "issuerMetadata": {
    "name": "ABC Textiles GmbH",
    "vatNumber": "DE123456789",
    "address": "Berlin, Germany",
    "website": "https://abc-textiles.de"
  },

  "credentialSubject": {
    "id": "urn:gtin:5901234567890",
    "productName": "Organic Cotton T-Shirt",
    ...
  }
}
```

**In our database:**

```typescript
Organization {
  // Human-readable identity
  name: "ABC Textiles GmbH"
  vatNumber: "DE123456789"

  // Cryptographic identity (stored key material)
  keyId: "key_abc123"              // Internal reference
  publicKeyJwk: { ... }            // The actual public key

  // DID identifiers (derived from same key)
  didKey: "did:key:z6Mk..."        // Always available (derived)
  didEbsi?: "did:ebsi:z23..."      // Added after EBSI registration

  // Which to use for signing new VCs
  activeDid: "did:key:z6Mk..."     // Switch to did:ebsi when ready
}
```

### Same Key → Multiple DIDs

The **same cryptographic key pair** can have multiple DID identifiers:

```
┌─────────────────────────────────────────────────────────────────┐
│                    ONE KEY, MULTIPLE DIDs                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Ed25519 Key Pair (generated once, stored securely)             │
│  ├── Public Key:  0xabc123...                                   │
│  └── Private Key: 0xdef456...                                   │
│                                                                  │
│  Same key → Multiple DID methods:                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ did:key:z6MkhaXgBZD...                                      ││
│  │ ✓ Derived directly from public key                          ││
│  │ ✓ Works offline, instant, free                              ││
│  │ ✓ No registration required                                  ││
│  │ ✓ Available NOW                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ did:ebsi:z23abc...                                          ││
│  │ ✓ Same public key registered on EBSI blockchain             ││
│  │ ✓ EU government trust anchor                                ││
│  │ ✓ Listed in Trusted Issuers Registry                        ││
│  │ ✓ Requires onboarding (€10-50 per DID)                      ││
│  │ ○ Available when EBSI integration ready                     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  BOTH DIDs resolve to the same public key!                      │
│  VCs signed with the private key verify against BOTH.           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### EBSI Migration Path

Organizations can seamlessly upgrade from did:key to did:ebsi:

```
┌─────────────────────────────────────────────────────────────────┐
│                    EBSI MIGRATION PATH                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TODAY (did:key)                                                │
│  ─────────────────                                              │
│  1. Organization signs up to EuroComply                         │
│  2. Key pair generated automatically                            │
│  3. did:key derived: did:key:z6MkhaXgBZD...                    │
│  4. VCs issued with did:key as issuer                          │
│                                                                  │
│  LATER (did:ebsi - when we integrate)                           │
│  ─────────────────────────────────────                          │
│  1. Organization clicks "Register on EBSI"                      │
│  2. Same public key submitted to EBSI                           │
│  3. EBSI assigns: did:ebsi:z23abc...                           │
│  4. Organization chooses which DID to use for new VCs          │
│                                                                  │
│  WHAT HAPPENS TO OLD VCs?                                       │
│  ─────────────────────────                                      │
│  • Old VCs with did:key: Still valid! Signature still verifies │
│  • New VCs: Can use did:ebsi for EU trust framework            │
│  • No re-issuance needed for existing VCs                      │
│  • Both DIDs link to same organization                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### did:key vs did:ebsi Comparison

| Feature | did:key | did:ebsi |
|---------|---------|----------|
| **Trust Anchor** | Self-attested (cryptographic) | EU Government blockchain |
| **Legal Status** | Industry standard (W3C) | eIDAS 2.0 recognized |
| **Issuer Registry** | None required | Listed in EU Trusted Issuers |
| **Cost** | Free | €10-50 per registration |
| **Setup Time** | Instant | Days (onboarding process) |
| **Offline Verification** | Yes | Requires EBSI API |
| **Portability** | Full | Full |
| **Key Ownership** | Organization | Organization |

### Configuration

Switch DID method via environment variable:

```bash
# .env
DID_METHOD=key    # Default: portable, instant, free
# DID_METHOD=ebsi  # When EBSI integration ready
```

The architecture supports seamless switching - same key, different DID format.

---

## 12. Code Example: Issuing a Portable DPP

```typescript
import { getVcService, getDidKeyService } from '@eurocomply/identity';

// 1. Products at 100% completeness appear in DPP Ready list
async function getDppReadyProducts(organizationId: string) {
  return prisma.product.findMany({
    where: {
      organizationId,
      completeness: { path: ['dpp'], gte: 100 },
      passportId: null,  // No DPP issued yet
    },
  });
}

// 2. User reviews and approves a product for DPP issuance
async function approveDppIssuance(productId: string, organization: Organization) {
  const didKeyService = getDidKeyService();
  const vcService = getVcService();
  const product = await prisma.product.findUnique({ where: { id: productId } });

  // 3. Get or create organization's did:key
  let organizationDid = organization.did;
  if (!organizationDid) {
    const { did, privateKeyJwk } = await didKeyService.createDidKey();
    organizationDid = did;
    // Store DID and encrypted private key
    await saveOrganizationIdentity(organization.id, did, privateKeyJwk);
  }

  // 4. Build credential subject from Golden Record
  const credentialSubject = {
    id: `urn:gtin:${product.gtin}`,
    type: 'Product',
    name: product.name,
    gtin: product.gtin,
    manufacturer: {
      name: organization.name,
      country: organization.country,
    },
    sustainability: product.dppData.sustainability,
    certifications: product.dppData.certifications,
  };

  // 5. Issue Verifiable Credential (after user approval)
  const vc = await vcService.issueCredential({
    issuerDid: organizationDid,
    credentialType: 'DigitalProductPassport',
    credentialSubject,
    expiresIn: '10y',
  });

  // 6. Store and return
  return {
    vcJson: vc.credential,
    vcJwt: vc.jwt,
    // This VC is now portable - organization owns it
  };
}
```

---

## 13. Multi-Party Attestations

DPPs can include **attestations from third parties** (manufacturers, certifiers, labs, suppliers). Each attestation is a separate VC, linked to the main DPP.

See [MULTI_PARTY_ATTESTATION.md](./MULTI_PARTY_ATTESTATION.md) for full architecture.

### Attestation VC Structure

When a third party (e.g., certifier, manufacturer, lab) contributes data:

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://eurocomply.eu/contexts/attestation/v1"
  ],
  "id": "urn:uuid:attestation-abc123",
  "type": ["VerifiableCredential", "ProductDataAttestation"],
  "issuer": "did:key:zContributor...",
  "issuanceDate": "2026-01-10T12:00:00Z",
  "expirationDate": "2027-06-01T00:00:00Z",
  "credentialSubject": {
    "id": "urn:eurocomply:product:prod_xyz",
    "gtin": "1234567890123",
    "attestationType": "CERTIFICATION",
    "attestedFields": ["certifications"],
    "data": {
      "certifications": [
        {
          "type": "GOTS",
          "certificateNumber": "CU-123456",
          "issuedDate": "2025-06-01",
          "expiresDate": "2027-06-01"
        }
      ]
    },
    "dataHash": "sha256:e3b0c44298fc1c149afbf4c8...",
    "version": 1
  },
  "proof": {
    "type": "JsonWebSignature2020",
    "created": "2026-01-10T12:00:00Z",
    "verificationMethod": "did:key:zContributor...#key-1",
    "proofPurpose": "assertionMethod",
    "jws": "eyJhbGci..."
  }
}
```

### DPP with Linked Attestations

The final DPP references all approved attestation VCs:

```json
{
  "@context": [...],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:key:zCustomer...",
  "credentialSubject": {
    "id": "urn:gtin:1234567890123",
    "productName": "Organic Cotton T-Shirt",
    "materials": { ... },
    "certifications": [ ... ]
  },

  "attestations": [
    {
      "id": "urn:uuid:attestation-abc123",
      "issuer": {
        "did": "did:key:zCertifier...",
        "name": "Control Union Certifications",
        "type": "CERTIFIER",
        "verificationLevel": "DOMAIN_VERIFIED"
      },
      "attestedFields": ["certifications"],
      "signedAt": "2026-01-10T12:00:00Z",
      "expiresAt": "2027-06-01T00:00:00Z",
      "credential": "eyJhbGci..."
    },
    {
      "id": "urn:uuid:attestation-def456",
      "issuer": {
        "did": "did:key:zManufacturer...",
        "name": "EcoTextiles GmbH",
        "type": "MANUFACTURER",
        "verificationLevel": "SELF_ATTESTED"
      },
      "attestedFields": ["materials"],
      "signedAt": "2026-01-08T12:00:00Z",
      "expiresAt": null,
      "credential": "eyJhbGci..."
    }
  ],

  "proof": { ... }
}
```

### Attestation Trust Levels

| Level | Description | Display |
|-------|-------------|---------|
| SELF_ATTESTED | Contributor signed up and claims identity | "Self-attested" |
| DOMAIN_VERIFIED | Email domain matches claimed organization | "Domain verified (example.com)" |

### Verification of Attestations

When verifying a DPP with attestations:

1. Verify the main DPP signature (customer's did:key)
2. For each attestation:
   - Extract the embedded attestation VC JWT
   - Verify the attestation signature (contributor's did:key)
   - Check expiration date
3. Display trust level for each attested field

```
┌─────────────────────────────────────────────────────────────────┐
│ MATERIALS                                           ✓ ATTESTED │
│ 95% Organic Cotton, 5% Elastane                                │
│                                                                 │
│ Attested by: EcoTextiles GmbH (MANUFACTURER)                   │
│ DID: did:key:z6Mk... • SELF_ATTESTED                           │
│ Signed: 2026-01-08 • Never expires                             │
│ ✓ Signature Valid                                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ CARBON FOOTPRINT                                ⚠️ SELF-CLAIMED │
│ 5.2 kgCO2e                                                      │
│                                                                 │
│ Claimed by: Fashion Brand GmbH (product owner)                 │
│ No third-party attestation                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Key Points

- **Linked VCs**: Each attestation is its own VC, not embedded data
- **Independent verification**: Each attestation can be verified separately
- **Expiry tracking**: Attestations can expire (e.g., when certifications expire)
- **Revocation**: Contributors can revoke their attestations
- **Versioning**: Attestations maintain version history with signatures
- **Any field**: Third parties can attest any product field, not just certifications

---

## 14. Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    VERIFIABLE CREDENTIALS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  IDENTITY                                                       │
│  → did:key (self-contained, portable)                           │
│  → No platform dependency                                       │
│  → Organization owns their identity                             │
│                                                                  │
│  CREDENTIALS                                                    │
│  → W3C Verifiable Credentials                                   │
│  → Tamper-evident signatures                                    │
│  → Work offline, forever                                        │
│                                                                  │
│  PORTABILITY                                                    │
│  → Export VCs and keys anytime                                  │
│  → Host anywhere after export                                   │
│  → No lock-in to EuroComply                                    │
│                                                                  │
│  VERIFICATION                                                   │
│  → Anyone can verify without EuroComply                        │
│  → No server needed (did:key is self-contained)                │
│  → Works even if EuroComply shuts down                         │
│                                                                  │
│  THE VALUE WE PROVIDE                                           │
│  → Easy product management (Golden Record model)               │
│  → AI-powered import from any format                           │
│  → Managed hosting (while subscribed)                          │
│  → Free retailer access layer                                  │
│  → NOT lock-in                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 15. References

- [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model/)
- [W3C Decentralized Identifiers (DIDs)](https://www.w3.org/TR/did-core/)
- [did:key Method Specification](https://w3c-ccg.github.io/did-method-key/)
- [walt.id Documentation](https://docs.walt.id/)
- [ESPR Regulation](https://eur-lex.europa.eu/eli/reg/2024/1781)
- [eIDAS 2.0 Framework](https://digital-strategy.ec.europa.eu/en/policies/eidas-regulation)
- [MULTI_PARTY_ATTESTATION.md](./MULTI_PARTY_ATTESTATION.md) - Third-party attestation architecture

---

*Last Updated: January 2026*
