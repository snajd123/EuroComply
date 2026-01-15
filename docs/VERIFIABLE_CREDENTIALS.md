# Verifiable Credentials for Digital Product Passports

## How EuroComply Uses walt.id for Portable, Verifiable DPPs

> **Terminology Note:**
> - **Product revision**: Editable data iteration in Design/Marketing workspaces (r1, r2, r3)
> - **DPP edition**: A published, immutable Digital Product Passport issued as a Verifiable Credential
>
> A DPP edition is created from specific product revisions and becomes immutable once issued.
> See [Architecture Document - Terminology](../EuroComply_Architecture_Document_v1.3.md#terminology-version-vs-revision-vs-edition).

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
• Signature verification offline (did:key is self-contained)
• Issuer traceability (did:key identifies which keypair signed)*
• Portable (supplier owns it, can host anywhere)
• Signature works forever (even if EuroComply shuts down)
• Revocation checking requires status list hosting (we host it, or self-host)

*IMPORTANT: did:key proves WHICH KEYPAIR signed, not WHO owns that keypair.
Real-world identity verification requires additional checks. See Section 17.

⚠️ IMPORTANT CAVEAT: Revocation checking still requires network access
to a status list server. See Section 14 for details on this tradeoff.

Note: Signature verification is fully offline. Revocation checking requires
network access to status list. Image rendering depends on storage mode.
```

### What Makes This Different

| Aspect | Traditional DPP | EuroComply VC-DPP |
|--------|-----------------|-------------------|
| **Tamper Evidence** | None - data can be silently changed | Cryptographic - any change breaks signature |
| **Trust Model** | Trust the database operator | Trust math (cryptographic verification) |
| **Issuer Traceability** | "Trust me, I'm the manufacturer" | Signature tied to specific did:key* |
| **Verification** | Requires server connection | Signature offline, revocation online |
| **Portability** | Locked to platform | Supplier owns, can move anywhere |
| **Platform Dependency** | Dies with platform | Signature works forever; revocation check needs status list** |
| **Interoperability** | Proprietary formats | W3C standard, works with EUDI wallets |

*did:key proves cryptographic origin, not real-world identity. See Section 17 for identity verification.
**See Section 14 for revocation status list hosting options and tradeoffs.

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
       └── Signature verification works forever, anywhere
       └── Supplier truly owns their identity
       └── NOTE: Revocation still needs status list (see Section 14)
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
| **Hosting Required** | Yes (DID document) | No (for signature verification) |
| **Platform Dependency** | Yes (DID resolution) | No (signature), Yes (revocation)* |
| **Works Offline** | No | Signature: Yes, Revocation: No |
| **Portability** | Limited | Full (signature), Partial (revocation)* |
| **Human Readable** | Nice branding | Less pretty |

*Revocation requires Status List 2021 server. See Section 14 for hosting options.

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

All DIDs are managed through a **Wallet abstraction** that enables future integration with external wallets (including EUDI).

### 4.3.1 Wallet Architecture (EUDI-Ready)

Keys and credentials are accessed through a unified **WalletProvider** interface:

```typescript
interface WalletProvider {
  getDid(): Promise<string>;
  sign(payload: SignablePayload): Promise<SignedResult>;
  storeCredential(vc: VerifiableCredential): Promise<void>;
  getCredentials(filter?: CredentialFilter): Promise<VerifiableCredential[]>;
}

// Same code works for all wallet types
const wallet = await WalletFactory.getProvider(user.wallet);
const signed = await wallet.sign(versionData);
```

#### Supported Wallet Types

**User Wallets (for natural persons):**

| Type | Storage | Signing | Use Case |
|------|---------|---------|----------|
| **MANAGED** | walt.id Custodian | Server-side (automatic) | Default for all users (global) |
| **EUDI** | User's EU Digital Identity Wallet | User confirms on phone | EU users wanting stronger identity |
| **EXTERNAL** | Third-party wallet | User-controlled | Full self-sovereignty |

**Organization Wallets (for legal entities):**

| Type | Storage | Signing | Use Case |
|------|---------|---------|----------|
| **MANAGED** | walt.id Custodian | Server-side (automatic) | Default for all organizations (global) |
| **EU_ORG_WALLET** | EU Organizational Identity Wallet | Authorized signer confirms | EU orgs wanting government-verified identity |

**Global Coverage:** MANAGED wallets are the default and provide full functionality for users and organizations worldwide. EU wallets are optional enhancements for those who want government-verified identity.

#### Why This Design

```
┌─────────────────────────────────────────────────────────────────┐
│  EUDI-READY ARCHITECTURE                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Application Code (unchanged)                                   │
│  ─────────────────────────────                                  │
│  const signed = await wallet.sign(data);                        │
│                                                                  │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              WalletProvider Interface                        ││
│  └─────────────────────────────────────────────────────────────┘│
│         │              │              │                          │
│         ▼              ▼              ▼                          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐                    │
│  │  MANAGED  │  │   EUDI    │  │ EXTERNAL  │                    │
│  │ (walt.id) │  │(OpenID4VP)│  │(WalletCon)│                    │
│  └───────────┘  └───────────┘  └───────────┘                    │
│                                                                  │
│  When EUDI launches:                                            │
│  1. Implement EUDIWalletProvider (same interface)               │
│  2. Add "Connect EUDI" button in settings                       │
│  3. Done - all existing code works automatically                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### OpenID4VC Protocol (EUDI Standard)

EUDI Wallets use **OpenID for Verifiable Credentials** (OpenID4VC):

- **OpenID4VCI**: Receiving credentials into wallet
- **OpenID4VP**: Presenting credentials / signing requests

```
EuroComply                              EUDI Wallet
    │                                        │
    │  1. "Please sign this product update"  │
    │  (OpenID4VP request)                   │
    │───────────────────────────────────────►│
    │                                        │ (User sees notification)
    │                                        │ (User confirms with biometrics)
    │  2. Signed response                    │
    │◄───────────────────────────────────────│
    │                                        │
    │  3. Verify against EBSI registry       │
    │  (government trust anchor)             │
```

See [USER_MANAGEMENT.md](./USER_MANAGEMENT.md) for full details on user roles, wallet configuration, and version control workflow.

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
│     • Signature verification works without network              │
│                                                                  │
│  This means:                                                    │
│  • The VC IS the DPP (not a pointer to it)                     │
│  • Signature can be verified ANYWHERE                          │
│  • Revocation checking requires network (status list)          │
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
- Works offline for signature verification
- Images require network if using URL mode (see Base64 mode for fully offline)

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
            │  • Signature valid!          │                         │
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
| **Future-proof** | Signatures work forever; revocation needs hosting (see Section 14) |
| **Legal protection** | Cryptographic proof of what you claimed, when |

### For Retailers

| Benefit | Description |
|---------|-------------|
| **Trust** | Cryptographic proof, not just a database entry |
| **Independence** | Can verify without contacting the brand |
| **Signature Proof** | Cryptographic signature verification |
| **Standards** | W3C format works with any compliant tool |
| **Free access** | Public API, widget, and Shopify app at no cost |

### For Regulators

| Benefit | Description |
|---------|-------------|
| **Enforcement** | Can verify signatures without trusting any company |
| **Audit trail** | Immutable record of sustainability declarations |
| **Standards** | W3C/eIDAS standards, not proprietary formats |
| **Resilience** | Signatures survive platform shutdowns; revocation status depends on hosting |

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
       │   organization's key"       │                             │
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

Organizations can export their private key when:
- They want to self-host
- They're canceling subscription
- They want backup

```typescript
// Export endpoint
POST /api/v1/organization/export

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

### Key Backup with AWS KMS/CloudHSM

Organization signing keys are backed up using AWS Key Management Service with CloudHSM for FIPS 140-2 Level 3 compliance.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KEY BACKUP ARCHITECTURE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Organization Key Generation:                                               │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  Generate       │───▶│  Store in       │───▶│  Backup to      │         │
│  │  Ed25519 Key    │    │  walt.id        │    │  AWS KMS        │         │
│  └─────────────────┘    │  Custodian      │    │  (encrypted)    │         │
│                         └─────────────────┘    └─────────────────┘         │
│                                                        │                    │
│                                                        ▼                    │
│                                                 ┌─────────────────┐         │
│                                                 │  CloudHSM       │         │
│                                                 │  (FIPS 140-2    │         │
│                                                 │   Level 3)      │         │
│                                                 └─────────────────┘         │
│                                                                              │
│  Backup Encryption:                                                         │
│  • Organization key encrypted with KMS Customer Managed Key (CMK)          │
│  • CMK stored in CloudHSM cluster                                          │
│  • Cross-region replication for disaster recovery                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**KMS Configuration:**

```typescript
interface KeyBackupConfig {
  // AWS KMS settings
  kms: {
    keyId: string;              // KMS CMK for encrypting org keys
    region: 'eu-central-1';     // Primary region
    backupRegion: 'eu-west-1';  // DR region
    keySpec: 'SYMMETRIC_DEFAULT';
    keyUsage: 'ENCRYPT_DECRYPT';
  };

  // CloudHSM cluster
  hsm: {
    clusterId: string;
    availabilityZones: ['eu-central-1a', 'eu-central-1b'];
    hsmType: 'hsm1.medium';
  };

  // Backup schedule
  backup: {
    frequency: 'daily';
    retentionDays: 365;
    crossRegionReplication: true;
  };
}
```

### Key Rotation

Key rotation creates a new signing key while maintaining the ability to verify credentials signed with previous keys.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KEY ROTATION WORKFLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHY ROTATE?                                                                │
│  • Scheduled rotation (annual best practice)                                │
│  • Key compromise (emergency rotation)                                      │
│  • Algorithm upgrade (e.g., Ed25519 → future standard)                     │
│  • Employee departure (key was accessible to departed admin)               │
│                                                                              │
│  ROTATION PROCESS:                                                          │
│                                                                              │
│  Step 1: Generate New Key                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • Create new Ed25519 keypair                                         │   │
│  │ • New did:key generated (different from old)                         │   │
│  │ • Store in Custodian + backup to KMS                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Step 2: Mark Old Key as Rotated                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • Old key status: ACTIVE → ROTATED                                   │   │
│  │ • Rotation timestamp recorded                                        │   │
│  │ • Old key retained for verification (read-only)                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Step 3: Update Organization Record                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • Current DID updated to new did:key                                 │   │
│  │ • Key history preserved                                              │   │
│  │ • All new credentials use new key                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  CREDENTIAL HANDLING:                                                       │
│  • Existing credentials remain valid (old key still verifies signatures)   │
│  • New credentials issued with new key                                      │
│  • Optional: Re-issue critical credentials with new key                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key History Schema:**

```typescript
interface OrganizationKeyHistory {
  organizationId: string;

  // Current active key
  currentKey: {
    did: string;           // did:key:z6Mk...
    publicKeyJwk: JsonWebKey;
    createdAt: Date;
    status: 'ACTIVE';
  };

  // Previous keys (for verification only)
  rotatedKeys: Array<{
    did: string;
    publicKeyJwk: JsonWebKey;
    createdAt: Date;
    rotatedAt: Date;
    rotationReason: 'SCHEDULED' | 'COMPROMISE' | 'ALGORITHM_UPGRADE' | 'ADMIN_CHANGE';
    status: 'ROTATED';
    // Credentials signed with this key are still verifiable
    credentialCount: number;
  }>;

  // Compromised keys (credentials should be treated with caution)
  revokedKeys: Array<{
    did: string;
    publicKeyJwk: JsonWebKey;
    createdAt: Date;
    revokedAt: Date;
    revocationReason: string;
    status: 'REVOKED';
  }>;
}
```

### Key Compromise Response

If an organization's signing key is compromised, immediate action is required.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KEY COMPROMISE RESPONSE PROCEDURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SEVERITY: CRITICAL                                                         │
│  RESPONSE TIME: Immediate (< 1 hour)                                        │
│                                                                              │
│  STEP 1: IMMEDIATE CONTAINMENT (< 15 minutes)                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                              │
│  □ Disable compromised key in Custodian (prevent new signatures)            │
│  □ Mark key status as REVOKED in database                                   │
│  □ Trigger security alert to platform team                                  │
│  □ Log incident with timestamp and suspected scope                          │
│                                                                              │
│  STEP 2: CREDENTIAL REVOCATION (< 30 minutes)                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                              │
│  □ Identify ALL credentials signed with compromised key                     │
│  □ Bulk-revoke all identified credentials via Status List update            │
│  □ Invalidate CDN cache for status list (CRITICAL priority)                │
│  □ Verify revocations are live (test verification)                          │
│                                                                              │
│  STEP 3: NOTIFICATION (< 1 hour)                                            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                             │
│  □ Notify affected organization (email + dashboard alert)                   │
│  □ Notify downstream verifiers if known (retailers using affected DPPs)    │
│  □ Prepare incident report for compliance team                              │
│                                                                              │
│  STEP 4: KEY ROTATION (< 2 hours)                                           │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                             │
│  □ Generate new keypair for organization                                    │
│  □ Update organization's current DID                                        │
│  □ Backup new key to KMS                                                    │
│                                                                              │
│  STEP 5: CREDENTIAL RE-ISSUANCE (< 24 hours)                               │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                 │
│  □ Re-issue all revoked credentials with new key                            │
│  □ Link new credentials to old (supersedes relationship)                    │
│  □ Update QR codes if physically printed (coordinate with customer)         │
│  □ Notify customer of new credential IDs                                    │
│                                                                              │
│  STEP 6: POST-INCIDENT (< 72 hours)                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                           │
│  □ Root cause analysis                                                      │
│  □ Update security procedures if needed                                     │
│  □ Customer incident report                                                 │
│  □ Regulatory notification if required (GDPR breach assessment)             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Compromise Response API:**

```typescript
// Emergency key revocation (admin only)
POST /api/v1/admin/organizations/:id/keys/revoke
Request: {
  keyDid: string;
  reason: string;
  revokeCredentials: boolean;  // Default: true
}
Response: {
  revokedKeyDid: string;
  credentialsRevoked: number;
  newKeyDid: string;
  statusListUpdated: boolean;
}

// Bulk credential re-issuance
POST /api/v1/admin/organizations/:id/credentials/reissue
Request: {
  credentialIds?: string[];    // Specific credentials, or omit for all
  useNewKey: boolean;          // Default: true
}
Response: {
  reissuedCount: number;
  newCredentialIds: string[];
  failedCount: number;
  failures: Array<{ credentialId: string; reason: string }>;
}
```

### Key Derivation Path in Credentials

Each credential includes metadata about the signing key's derivation path for full traceability.

```json
{
  "@context": [...],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": {
    "id": "did:key:z6MkNewKey...",
    "name": "Acme Corp",
    "keyMetadata": {
      "keyId": "key_abc123",
      "keyVersion": 2,
      "algorithm": "Ed25519",
      "createdAt": "2026-01-01T00:00:00Z",
      "derivationPath": "m/44'/501'/0'/0'",
      "previousKeyDid": "did:key:z6MkOldKey..."
    }
  },
  "credentialSubject": { ... },
  "proof": { ... }
}
```

**Key Metadata Fields:**

| Field | Description |
|-------|-------------|
| `keyId` | Internal key identifier |
| `keyVersion` | Rotation counter (1 = original, 2+ = rotated) |
| `algorithm` | Signing algorithm (Ed25519) |
| `createdAt` | Key generation timestamp |
| `derivationPath` | BIP-44 derivation path for deterministic key generation |
| `previousKeyDid` | DID of the key this one replaced (if rotated) |

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
    exportEnabled: true,  // Organizations can export keys
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

  // 4. Build credential subject from workspace data
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
- **Revocation**: Contributors can revoke their attestations (see Revocation section below)
- **Versioning**: Attestations maintain version history with signatures
- **Any field**: Third parties can attest any product field, not just certifications

### DPP Validity After Issuance

**Critical Principle**: An issued DPP remains valid regardless of later certification or attestation expiry. The DPP was valid at the time of issuance - that's what matters for regulatory compliance.

```
┌─────────────────────────────────────────────────────────────────┐
│  DPP VALIDITY RULE                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ISSUED DPP = VALID SNAPSHOT IN TIME                            │
│  ───────────────────────────────────                            │
│                                                                  │
│  When a DPP is issued:                                          │
│  • All attestations were valid at that moment                   │
│  • All certifications were current at that moment               │
│  • The DPP is cryptographically sealed with that state          │
│                                                                  │
│  If a certification later expires:                              │
│  ✓ Existing DPPs remain valid (they were accurate when issued) │
│  ✓ No "expiry note" added to existing DPPs                     │
│  ✗ NEW DPPs cannot be issued using the expired attestation     │
│                                                                  │
│  This matches regulatory intent:                                │
│  • ESPR requires accurate DPP at time of market placement       │
│  • Products sold in 2026 with valid GOTS cert remain compliant │
│  • Cert expiring in 2027 doesn't retroactively invalidate DPPs │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

| Scenario | Effect on Existing DPPs | Effect on New DPPs |
|----------|------------------------|-------------------|
| Certification expires | No change - remains valid | Cannot include unless renewed |
| Attestation expires | No change - remains valid | Cannot include unless renewed |
| Attestation revoked | No change - but verifier can check revocation status | Cannot include |
| Product recalled | DPP can be revoked via Status List 2021 | N/A |

---

## 14. Credential Revocation

### Why Revocation Matters

VCs are cryptographically signed and self-contained - they verify offline forever. But what if:
- A certification expires or is withdrawn?
- A product is recalled?
- An attestation was made in error?
- A contributor's account is compromised?

**Revocation allows invalidating a VC after issuance without breaking cryptographic integrity.**

### Status List 2021 (W3C Standard)

We use [Status List 2021](https://www.w3.org/TR/vc-status-list/) - the W3C standard for VC revocation:

```
┌─────────────────────────────────────────────────────────────────┐
│                    STATUS LIST 2021 ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ISSUING A VC                                                   │
│  ────────────                                                   │
│  Each VC gets a unique index in a bitstring status list:        │
│                                                                  │
│  VC 1 → Index 0                                                 │
│  VC 2 → Index 1                                                 │
│  VC 3 → Index 2                                                 │
│  ...                                                             │
│                                                                  │
│  Status List (bitstring):                                       │
│  [0, 0, 0, 0, 0, 0, 0, 0, ...]                                  │
│   ↑  ↑  ↑                                                       │
│   │  │  └── VC 3: valid (bit = 0)                              │
│   │  └───── VC 2: valid (bit = 0)                              │
│   └──────── VC 1: valid (bit = 0)                              │
│                                                                  │
│  REVOKING A VC                                                  │
│  ─────────────                                                  │
│  Set the bit at that index to 1:                                │
│                                                                  │
│  [0, 1, 0, 0, 0, 0, 0, 0, ...]                                  │
│      ↑                                                          │
│      └── VC 2: REVOKED (bit = 1)                               │
│                                                                  │
│  VERIFYING                                                      │
│  ─────────                                                      │
│  1. Verify signature (works offline)                            │
│  2. Fetch status list from credentialStatus.statusListCredential│
│  3. Check bit at statusListIndex                                │
│  4. If bit = 1, credential is revoked                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### VC with Status List Reference

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://w3id.org/vc/status-list/2021/v1"
  ],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:key:z6MkOrg...",
  "issuanceDate": "2026-01-10T12:00:00Z",
  "credentialSubject": { ... },

  "credentialStatus": {
    "id": "https://api.eurocomply.eu/v1/status/sl_a1b2c3d4e5f6#42",
    "type": "StatusList2021Entry",
    "statusPurpose": "revocation",
    "statusListIndex": "42",
    "statusListCredential": "https://api.eurocomply.eu/v1/status/sl_a1b2c3d4e5f6"
  },

  "proof": { ... }
}
```

### Status List Credential (Hosted)

The status list itself is a signed VC:

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://w3id.org/vc/status-list/2021/v1"
  ],
  "type": ["VerifiableCredential", "StatusList2021Credential"],
  "issuer": "did:key:z6MkOrg...",
  "issuanceDate": "2026-01-10T12:00:00Z",
  "credentialSubject": {
    "id": "https://api.eurocomply.eu/v1/status/sl_a1b2c3d4e5f6",
    "type": "StatusList2021",
    "statusPurpose": "revocation",
    "encodedList": "H4sIAAAAAAAA/2NgGAWjYBSMglEwCkYBEwMAAAD//wMA..."
  },
  "proof": { ... }
}
```

**The `encodedList` is a GZIP-compressed, Base64-encoded bitstring.**

### Revocation Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    REVOCATION WORKFLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DPP REVOCATION (by organization admin)                         │
│  ─────────────────────────────────────                          │
│  Use cases:                                                     │
│  • Product recall                                               │
│  • Discovered data error                                        │
│  • Superseded by new DPP version                               │
│                                                                  │
│  API: POST /api/v1/passports/:id/revoke                        │
│  { "reason": "Product recalled due to safety issue" }           │
│                                                                  │
│  Effect:                                                        │
│  1. Set bit in organization's status list                      │
│  2. Re-sign status list credential                              │
│  3. Update CDN-cached status list                              │
│  4. DPP now shows "REVOKED" on verification                    │
│                                                                  │
│  ATTESTATION REVOCATION (by contributor)                        │
│  ───────────────────────────────────────                        │
│  Use cases:                                                     │
│  • Certification expired/withdrawn                              │
│  • Attestation made in error                                    │
│  • Contributor account compromised                              │
│                                                                  │
│  API: POST /api/v1/attestations/:id/revoke                     │
│  { "reason": "Certification withdrawn by certifying body" }     │
│                                                                  │
│  Effect:                                                        │
│  1. Set bit in contributor's status list                       │
│  2. DPP shows "Attestation revoked" for that field             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Status List Hosting

| Mode | Status List URL | Who Updates |
|------|-----------------|-------------|
| **Active Subscription** | `https://api.eurocomply.eu/v1/status/{statusListId}` | EuroComply |
| **Dormant Hosting** | Same URL (preserved) | EuroComply (read-only) |
| **Self-Managed** | Customer's domain | Customer |
| **GS1 Resolver** | Redirects to customer's hosted list | Customer |

**Security Note:** Status list URLs use opaque identifiers (`sl_a1b2c3d4`) rather than organization IDs to prevent enumeration attacks and competitive intelligence gathering.

**Important:** After subscription cancellation:
- **Dormant Hosting**: Status list remains frozen (no new revocations possible, existing revocations preserved)
- **Self-Managed/GS1**: Customer exports status list and hosts it themselves

### Portability vs. Revocation: Architectural Tradeoff

> 📖 **Detailed Migration Guide**: For step-by-step instructions on status list migration and self-hosting, see [ARCHITECTURE_PORTABILITY.md - Status List Migration Guide](./ARCHITECTURE_PORTABILITY.md#status-list-migration-guide) and [Portability Limitations](./ARCHITECTURE_PORTABILITY.md#portability-limitations-honest-assessment).

**The Tension:**

did:key provides offline signature verification, but Status List 2021 requires network access for revocation checks. This creates a dependency that limits true portability:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│            PORTABILITY vs. REVOCATION TRADEOFF                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHAT did:key PROVIDES (fully portable):                                    │
│  ✓ Signature verification - works offline, forever                          │
│  ✓ Issuer identity - embedded in the key itself                             │
│  ✓ Tamper detection - cryptographic proof                                   │
│                                                                              │
│  WHAT Status List 2021 REQUIRES (creates dependency):                       │
│  ✗ Network access to fetch status list                                      │
│  ✗ Status list URL hardcoded in issued VCs                                  │
│  ✗ Cannot change URL without re-issuing all VCs                             │
│                                                                              │
│  ISSUED VC CONTAINS:                                                        │
│  "statusListCredential": "https://api.eurocomply.eu/v1/status/sl_a1b2c3d4"   │
│                          ─────────────────────────────────────────────────  │
│                          This URL is IMMUTABLE after issuance               │
│                                                                              │
│  AFTER EXPORT, ORGANIZATIONS CANNOT:                                        │
│  • Revoke credentials (unless they maintain the hosted URL)                 │
│  • Change where the status list is hosted                                   │
│  • Update already-issued VCs to point elsewhere                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Options for True Independence

| Option | Revocation Control | Complexity | Cost |
|--------|-------------------|------------|------|
| **Compliance Archive** | Frozen (no new revocations) | None | €99/year |
| **Self-Hosted Status List** | Full control | Medium | Your hosting costs |
| **GS1 Resolver Redirect** | Full control + domain portability | Medium | GS1 membership |
| **No Revocation** | N/A (signature-only verification) | None | Free |

> 📥 **Export API**: Use `POST /api/v1/organization/export/status-list` to export your status list credential for self-hosting. See [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md#api-schemas) for full API documentation.

### Self-Hosted Status List Setup

For organizations that want full independence **before** issuing VCs:

```typescript
// 1. Configure your status list URL at setup time
const orgSettings = {
  statusListBaseUrl: 'https://your-domain.com/credentials/status',
  // NOT https://api.eurocomply.eu/v1/status/{statusListId}
};

// 2. VCs will be issued with YOUR URL
// {
//   "credentialStatus": {
//     "statusListCredential": "https://your-domain.com/credentials/status/list-1"
//   }
// }

// 3. Export includes status list for self-hosting
const exportPackage = await exportOrganizationData({
  includeStatusList: true,  // Exports current status list credential
  includeStatusListKey: true, // Key to sign updated status lists
});
```

**For already-issued VCs pointing to EuroComply:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  OPTIONS FOR EXISTING VCs                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. DORMANT HOSTING (recommended for most)                                  │
│     • EuroComply continues hosting status list                              │
│     • Existing revocations preserved                                        │
│     • No new revocations possible                                           │
│     • €19/month                                                              │
│                                                                              │
│  2. RE-ISSUE WITH NEW URL                                                   │
│     • Issue new VCs with your status list URL                               │
│     • Revoke old VCs                                                        │
│     • Update QR codes on products                                           │
│     • Complex but provides full independence                                │
│                                                                              │
│  3. ACCEPT SIGNATURE-ONLY VERIFICATION                                      │
│     • Let EuroComply URL expire after subscription ends                     │
│     • Verifiers see: "Signature valid, revocation status unavailable"       │
│     • Appropriate for low-risk products                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Export Package Contents

The standard export package includes:

| Included | Not Included (requires separate export) |
|----------|----------------------------------------|
| All issued VCs (JSON + JWT) | Status list credential |
| Organization DID + private key | Status list signing key |
| Viewer HTML | Status list hosting code |
| Images (base64 mode) | |

**To export status list for self-hosting:**

```typescript
// Request full export with status list
const fullExport = await eurocomply.export({
  format: 'full-independence',
  include: {
    credentials: true,
    statusList: true,
    statusListSigningKey: true,
    hostingInstructions: true, // README with setup guide
  }
});

// fullExport contains:
// - credentials/*.json (all issued VCs)
// - status-list/current.json (current status list credential)
// - status-list/signing-key.jwk (to sign updated lists)
// - HOSTING.md (setup instructions for self-hosting)
```

### Self-Hosting Requirements

To host your own status list:

1. **Static file hosting** - Status list is a signed JSON file
2. **CORS headers** - Allow cross-origin requests from verifiers
3. **HTTPS** - Required for security
4. **Signing capability** - To update status list when revoking

```typescript
// Minimal self-hosted status list server
import express from 'express';
import { signStatusList } from '@eurocomply/identity';

const app = express();

// Serve current status list
app.get('/credentials/status/list-1', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(currentStatusListCredential);
});

// Revoke a credential (internal API)
app.post('/internal/revoke', async (req, res) => {
  const { vcId, index } = req.body;
  statusBitstring[index] = 1;
  currentStatusListCredential = await signStatusList(statusBitstring, orgPrivateKey);
  res.json({ success: true });
});
```

**Key Point:** Self-hosting status lists is straightforward but must be configured **before** issuing VCs. Already-issued VCs cannot be migrated to a new status list URL.

### Verification Flow with Status Check

```typescript
async function verifyCredentialWithStatus(vc: VerifiableCredential): Promise<VerificationResult> {
  // Step 1: Verify signature (works offline)
  const signatureValid = await verifySignature(vc);
  if (!signatureValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Step 2: Check revocation status (requires network)
  if (vc.credentialStatus) {
    const statusList = await fetch(vc.credentialStatus.statusListCredential);
    const decodedList = decodeStatusList(statusList.credentialSubject.encodedList);
    const index = parseInt(vc.credentialStatus.statusListIndex);

    if (decodedList[index] === 1) {
      return { valid: false, error: 'Credential revoked' };
    }
  }

  // Step 3: Check expiration
  if (vc.expirationDate && new Date(vc.expirationDate) < new Date()) {
    return { valid: false, error: 'Credential expired' };
  }

  return { valid: true };
}
```

### Offline vs Online Verification

> ⚠️ **Important**: "Offline verification" in this documentation means *signature* verification only. Full verification requires network access.

| Check | Offline? | Notes |
|-------|----------|-------|
| Signature verification | ✅ Yes | did:key is self-contained |
| Expiration check | ✅ Yes | Date comparison is local |
| Data integrity | ✅ Yes | Hash verification is local |
| **Revocation check** | ❌ No | Requires fetching Status List 2021 |
| **Attestation status** | ❌ No | Requires fetching contributor's status list |
| **Certificate validity** | ❌ No | May require OCSP/CRL check for X.509 certs |

**Verification Levels:**
| Level | What's Checked | Network Required? |
|-------|----------------|-------------------|
| **Basic** | Signature + expiration | No |
| **Standard** | Basic + revocation status | Yes |
| **Full** | Standard + attestation statuses | Yes |

**Graceful degradation:** If status list is unreachable:
- Display: "Signature valid, revocation status unavailable"
- Let verifier decide whether to accept

### Status List Caching

To minimize network calls, status lists are cached:

```
┌─────────────────────────────────────────────────────────────────┐
│  CACHING STRATEGY                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CDN Layer (Cloudflare):                                        │
│  Cache-Control: public, max-age=300, stale-while-revalidate=60 │
│  (5-minute cache with stale serving during refresh)             │
│                                                                  │
│  Client-Side:                                                   │
│  • Cache status list per organization                           │
│  • Re-fetch if older than 5 minutes                            │
│  • Batch multiple VC checks against same status list            │
│                                                                  │
│  Revocation Propagation:                                        │
│  • Revocation takes effect within 5 minutes (cache TTL)         │
│  • Critical revocations: Purge CDN cache immediately            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Status List Optimization for Scale

As credential volumes grow to 10M+ per organization, status lists require optimization strategies.

#### Status List Sharding

Large organizations may issue millions of credentials. A single status list becomes inefficient at scale.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STATUS LIST SHARDING STRATEGY                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SHARDING OPTIONS:                                                          │
│                                                                              │
│  1. TIME-BASED SHARDING (Recommended)                                       │
│  ────────────────────────────────────                                       │
│  Each month/quarter gets a separate status list:                            │
│                                                                              │
│  /v1/status/sl_a1b2c3d4/2026-Q1  → Credentials issued Jan-Mar 2026          │
│  /v1/status/sl_a1b2c3d4/2026-Q2  → Credentials issued Apr-Jun 2026          │
│  /v1/status/sl_a1b2c3d4/2026-Q3  → Credentials issued Jul-Sep 2026          │
│                                                                              │
│  Benefits:                                                                  │
│  • Older lists become static (no updates, perfect caching)                 │
│  • Only current period's list needs frequent updates                        │
│  • Predictable list sizes                                                   │
│                                                                              │
│  2. CREDENTIAL-TYPE SHARDING                                                │
│  ───────────────────────────────                                            │
│  Separate lists by credential type:                                         │
│                                                                              │
│  /v1/status/sl_a1b2c3d4/dpp        → Digital Product Passports              │
│  /v1/status/sl_a1b2c3d4/attestation → Supplier attestations                 │
│  /v1/status/sl_a1b2c3d4/batch      → Batch-level credentials                │
│                                                                              │
│  Benefits:                                                                  │
│  • High-volume types isolated from low-volume                              │
│  • Different cache strategies per type                                      │
│                                                                              │
│  3. HYBRID SHARDING                                                         │
│  ──────────────────                                                         │
│  Combine time + type for very large deployments:                            │
│                                                                              │
│  /v1/status/sl_a1b2c3d4/dpp/2026-Q1                                         │
│  /v1/status/sl_a1b2c3d4/attestation/2026-Q1                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Status List Credential Reference with Sharding:**

```json
{
  "credentialStatus": {
    "id": "https://api.eurocomply.eu/v1/status/sl_a1b2c3d4/2026-Q1#42857",
    "type": "StatusList2021Entry",
    "statusPurpose": "revocation",
    "statusListIndex": "42857",
    "statusListCredential": "https://api.eurocomply.eu/v1/status/sl_a1b2c3d4/2026-Q1"
  }
}
```

**Shard Selection at Issuance:**

```typescript
function selectStatusListShard(orgId: string, credentialType: string): string {
  const currentQuarter = getCurrentQuarter(); // e.g., "2026-Q1"

  // Time-based sharding (default)
  return `${orgId}/${currentQuarter}`;

  // Or hybrid for high-volume orgs:
  // return `${orgId}/${credentialType}/${currentQuarter}`;
}
```

#### CDN Cache Invalidation on Revocation

When a credential is revoked, the status list must be updated and caches invalidated.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CACHE INVALIDATION FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  REVOCATION REQUEST                                                         │
│  ──────────────────                                                         │
│  POST /api/v1/credentials/{id}/revoke                                      │
│                                                                              │
│  PROCESSING STEPS:                                                          │
│                                                                              │
│  1. UPDATE STATUS LIST                                                      │
│     ├── Load current status list for credential's shard                    │
│     ├── Set bit at credential's statusListIndex = 1                        │
│     ├── Re-sign status list credential                                     │
│     └── Save to database                                                    │
│                                                                              │
│  2. INVALIDATE CDN CACHE (Cloudflare)                                      │
│     ├── Determine revocation priority                                       │
│     │   • CRITICAL (safety recall): Immediate purge                        │
│     │   • STANDARD (routine): Let TTL expire (5 min)                       │
│     └── If CRITICAL: API call to Cloudflare purge                          │
│                                                                              │
│  3. NOTIFY SUBSCRIBERS (Optional)                                           │
│     └── Webhook: credential.revoked                                         │
│                                                                              │
│  PRIORITY LEVELS:                                                           │
│  ────────────────                                                           │
│  | Priority  | Cache Action      | Use Case                    |           │
│  |-----------|-------------------|------------------------------|          │
│  | CRITICAL  | Immediate purge   | Safety recall, fraud         |          │
│  | HIGH      | Purge within 1m   | Compliance issue             |          │
│  | STANDARD  | TTL expiry (5m)   | Routine revocation           |          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Revocation API with Priority:**

```typescript
interface RevocationRequest {
  credentialId: string;
  reason: 'PRODUCT_RECALL' | 'FRAUD' | 'COMPLIANCE' | 'SUPERSEDED' | 'OTHER';
  priority: 'CRITICAL' | 'HIGH' | 'STANDARD';
  notes?: string;
}

async function revokeCredential(request: RevocationRequest): Promise<void> {
  // 1. Update status list
  const credential = await getCredential(request.credentialId);
  const shard = extractShardFromStatusUrl(credential.credentialStatus.statusListCredential);
  await updateStatusBit(shard, credential.credentialStatus.statusListIndex, 1);

  // 2. Re-sign status list
  const updatedList = await resignStatusList(shard);

  // 3. Invalidate cache based on priority
  if (request.priority === 'CRITICAL') {
    await cloudflare.purgeCache({
      files: [credential.credentialStatus.statusListCredential]
    });
  } else if (request.priority === 'HIGH') {
    // Queue for purge within 1 minute
    await purgeQueue.add({ url: credential.credentialStatus.statusListCredential }, { delay: 60000 });
  }
  // STANDARD: Let TTL handle it

  // 4. Emit webhook
  await emitWebhook('credential.revoked', {
    credentialId: request.credentialId,
    reason: request.reason,
    revokedAt: new Date().toISOString()
  });
}
```

#### Pre-Computation for High-Traffic Credentials

Popular products may have credentials verified thousands of times per minute. Pre-computation optimizes verification.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRE-COMPUTATION STRATEGY                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PROBLEM: High-traffic credentials cause repeated status list fetches      │
│                                                                              │
│  SOLUTION: Pre-compute verification results for popular credentials         │
│                                                                              │
│  TRACKING POPULARITY:                                                       │
│  ────────────────────                                                       │
│  1. Log verification requests per credential (anonymized)                   │
│  2. Identify "hot" credentials (>100 verifications/hour)                   │
│  3. Pre-compute verification bundles for hot credentials                   │
│                                                                              │
│  PRE-COMPUTED VERIFICATION BUNDLE:                                          │
│  ──────────────────────────────────                                         │
│  {                                                                          │
│    "credentialId": "cred_abc123",                                          │
│    "signatureValid": true,                                                 │
│    "revocationStatus": "valid",                                            │
│    "statusListHash": "sha256:e3b0c44...",                                  │
│    "computedAt": "2026-01-14T12:00:00Z",                                   │
│    "validUntil": "2026-01-14T12:05:00Z",                                   │
│    "attestationStatuses": [                                                │
│      { "id": "att_xyz", "status": "valid" },                              │
│      { "id": "att_uvw", "status": "valid" }                               │
│    ]                                                                        │
│  }                                                                          │
│                                                                              │
│  CACHE LOCATIONS:                                                           │
│  ────────────────                                                           │
│  • Edge (Cloudflare Workers KV): For global low-latency access             │
│  • Regional (Redis): For API-level caching                                 │
│                                                                              │
│  INVALIDATION TRIGGER:                                                      │
│  ─────────────────────                                                      │
│  • On revocation: Purge pre-computed bundle                                │
│  • On attestation revocation: Purge affected bundles                       │
│  • TTL expiry: Re-compute automatically                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Pre-Computation Background Job:**

```typescript
// Runs every minute
async function preComputeHotCredentials(): Promise<void> {
  // 1. Get credentials with >100 verifications in last hour
  const hotCredentials = await getHotCredentials({
    threshold: 100,
    window: '1h'
  });

  for (const credentialId of hotCredentials) {
    // 2. Fetch credential and status list
    const credential = await getCredential(credentialId);
    const statusList = await getStatusList(credential.credentialStatus.statusListCredential);

    // 3. Compute full verification
    const bundle: PreComputedVerification = {
      credentialId,
      signatureValid: await verifySignature(credential),
      revocationStatus: checkRevocationBit(statusList, credential.credentialStatus.statusListIndex),
      statusListHash: hashStatusList(statusList),
      computedAt: new Date().toISOString(),
      validUntil: addMinutes(new Date(), 5).toISOString(),
      attestationStatuses: await checkAttestationStatuses(credential)
    };

    // 4. Cache at edge
    await cloudflareKV.put(
      `verification:${credentialId}`,
      JSON.stringify(bundle),
      { expirationTtl: 300 } // 5 minutes
    );
  }
}
```

**Verification with Pre-Computation:**

```typescript
async function verifyCredential(credentialId: string): Promise<VerificationResult> {
  // 1. Check for pre-computed result
  const cached = await cloudflareKV.get(`verification:${credentialId}`);

  if (cached) {
    const bundle = JSON.parse(cached);

    // Verify cache is still valid
    if (new Date(bundle.validUntil) > new Date()) {
      return {
        valid: bundle.signatureValid && bundle.revocationStatus === 'valid',
        source: 'precomputed',
        computedAt: bundle.computedAt,
        attestations: bundle.attestationStatuses
      };
    }
  }

  // 2. Fall back to real-time verification
  return await performFullVerification(credentialId);
}
```

**Scaling Targets:**

| Metric | Target | Strategy |
|--------|--------|----------|
| Verifications/second | 100,000+ | Pre-computation + edge caching |
| Status list size | 10M credentials | Time-based sharding |
| Revocation propagation | <1 minute (critical) | CDN purge API |
| Cache hit rate | >95% for hot credentials | Pre-computation |

---

## 15. Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    VERIFIABLE CREDENTIALS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  IDENTITY                                                       │
│  → did:key (self-contained, portable for signatures)            │
│  → No platform dependency for signature verification            │
│  → Organization owns their identity                             │
│                                                                  │
│  CREDENTIALS                                                    │
│  → W3C Verifiable Credentials                                   │
│  → Tamper-evident signatures                                    │
│  → Signatures work offline, forever                             │
│                                                                  │
│  PORTABILITY                                                    │
│  → Export VCs and keys anytime                                  │
│  → Host anywhere after export                                   │
│  → No lock-in to EuroComply                                    │
│                                                                  │
│  VERIFICATION                                                   │
│  → Signatures verifiable without EuroComply                    │
│  → Revocation check needs status list host (see Section 14)    │
│  → Options: self-host, dormant hosting, or signature-only      │
│                                                                  │
│  THE VALUE WE PROVIDE                                           │
│  → Easy product management (workspace-based data model)        │
│  → AI-powered import from any format                           │
│  → Managed hosting (while subscribed)                          │
│  → Free retailer access layer                                  │
│  → NOT lock-in                                                  │
│                                                                  │
│  ⚠️ HONEST TRADEOFF                                             │
│  → Signature: fully portable, works forever                    │
│  → Revocation: requires status list host (see Section 14)      │
│  → If host unreachable: "valid signature, unknown revocation"  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 17. Identity Verification: Solving the Trust Gap

### The Problem

did:key provides **cryptographic proof** (data integrity), NOT **identity verification** (real-world identity):

```
┌─────────────────────────────────────────────────────────────────┐
│  WHAT did:key PROVES vs. WHAT IT DOESN'T                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ✓ CRYPTOGRAPHIC PROOF (did:key provides):                      │
│    • This data hasn't been tampered with since signing          │
│    • The same keypair that created this did:key signed this     │
│    • The signature is mathematically valid                      │
│                                                                  │
│  ✗ IDENTITY VERIFICATION (did:key does NOT provide):            │
│    • The entity is actually "ACME Corp"                         │
│    • The "certifier" is actually Control Union                  │
│    • The organization exists in the real world                  │
│    • The person has authority to sign for the organization      │
│                                                                  │
│  ATTACK SCENARIO:                                                │
│  1. Attacker creates controlunion.io (lookalike domain)         │
│  2. Registers as CERTIFIER, gets DOMAIN_VERIFIED status         │
│  3. Issues fraudulent GOTS certification attestations           │
│  4. Signature is cryptographically valid ✓                      │
│  5. But identity is fraudulent ✗                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**The old verification levels were insufficient:**

| Level | What It Checked | Why It's Weak |
|-------|-----------------|---------------|
| SELF_ATTESTED | User signed up | Anyone can claim any identity |
| DOMAIN_VERIFIED | Email domain matches | Lookalike domains (controlunion.io vs controlunion.com) |

### Solution 1: Certification Body Trust Registry

**Problem**: Anyone can claim to be a certification body.
**Solution**: Pre-register known certification bodies with verified did:keys.

```typescript
// Trusted Issuer Registry - maintained by EuroComply
interface TrustedIssuer {
  did: string;                    // Their actual did:key
  name: string;                   // Official name
  type: 'CERTIFICATION_BODY' | 'ACCREDITATION_BODY' | 'GOVERNMENT';
  accreditations: string[];       // What they can certify (GOTS, OEKO-TEX, etc.)
  verifiedAt: Date;
  verificationMethod: string;     // How we verified them
  officialWebsite: string;
  registryUrl?: string;           // Link to official accreditation registry
}

// Example: Control Union is pre-registered
const trustedIssuers: TrustedIssuer[] = [
  {
    did: 'did:key:z6MkControlUnionVerified...',
    name: 'Control Union Certifications',
    type: 'CERTIFICATION_BODY',
    accreditations: ['GOTS', 'OCS', 'GRS', 'RCS'],
    verifiedAt: new Date('2026-01-01'),
    verificationMethod: 'Manual verification via official contact + IOAS registry',
    officialWebsite: 'https://controlunion.com',
    registryUrl: 'https://ioas.org/accredited-bodies/',
  },
  {
    did: 'did:key:z6MkOekoTexVerified...',
    name: 'OEKO-TEX Association',
    type: 'CERTIFICATION_BODY',
    accreditations: ['STANDARD 100', 'MADE IN GREEN', 'STeP'],
    verifiedAt: new Date('2026-01-01'),
    verificationMethod: 'Manual verification via official contact',
    officialWebsite: 'https://www.oeko-tex.com',
  },
];

// Verification endpoint
app.get('/api/v1/public/trusted-issuer/:did', async (req, res) => {
  const issuer = trustedIssuers.find(i => i.did === req.params.did);

  if (!issuer) {
    return res.json({
      trusted: false,
      reason: 'DID not in trusted issuer registry',
      warning: 'This issuer has not been verified by EuroComply',
    });
  }

  return res.json({
    trusted: true,
    issuer,
    verificationBadge: 'REGISTRY_VERIFIED',
  });
});
```

**Onboarding Process for Certification Bodies:**

```
┌─────────────────────────────────────────────────────────────────┐
│  CERTIFICATION BODY ONBOARDING                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. ACCREDITATION CHECK                                         │
│     └── Verify against IOAS, IAF, or national accreditation DB  │
│     └── Check they're authorized to issue claimed certifications│
│                                                                  │
│  2. OFFICIAL CONTACT                                            │
│     └── Contact via official website (not email they provide)   │
│     └── Request confirmation of DID registration                │
│                                                                  │
│  3. DOMAIN VERIFICATION (DNS TXT)                               │
│     └── Add TXT record: eurocomply-did=did:key:z6Mk...          │
│     └── Proves they control their official domain               │
│                                                                  │
│  4. REGISTRY ENTRY                                              │
│     └── Add to trusted issuer registry                          │
│     └── Publish to public transparency log                      │
│                                                                  │
│  TIME: 3-5 business days (manual process)                       │
│  COST: Free for accredited certification bodies                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Result**: Attestations from REGISTRY_VERIFIED issuers can be trusted. Unknown issuers display warning.

### Solution 2: DNS-Based Domain Verification

**Problem**: Email domain matching is easily spoofed.
**Solution**: Require DNS TXT record ownership proof.

```typescript
// DNS verification - proves domain ownership, not just email access
async function verifyDomainOwnership(
  domain: string,
  expectedDid: string
): Promise<VerificationResult> {
  try {
    // Look up TXT records for the domain
    const records = await dns.resolveTxt(`_eurocomply.${domain}`);

    // Expected format: eurocomply-did=did:key:z6Mk...
    const didRecord = records
      .flat()
      .find(r => r.startsWith('eurocomply-did='));

    if (!didRecord) {
      return {
        verified: false,
        level: 'DOMAIN_UNVERIFIED',
        reason: 'No eurocomply-did TXT record found',
      };
    }

    const recordDid = didRecord.replace('eurocomply-did=', '');

    if (recordDid !== expectedDid) {
      return {
        verified: false,
        level: 'DOMAIN_UNVERIFIED',
        reason: 'DID in TXT record does not match claimed DID',
      };
    }

    return {
      verified: true,
      level: 'DNS_VERIFIED',
      domain,
      verifiedAt: new Date(),
    };
  } catch (error) {
    return {
      verified: false,
      level: 'DOMAIN_UNVERIFIED',
      reason: 'DNS lookup failed',
    };
  }
}

// Example DNS record
// _eurocomply.acme-textiles.com TXT "eurocomply-did=did:key:z6MkAcmeTextiles..."
```

**Why DNS is stronger than email:**

| Method | Attack Resistance |
|--------|-------------------|
| Email domain match | Attacker registers lookalike domain, gets email |
| DNS TXT record | Attacker must control actual domain's DNS |

### Solution 3: Business Registry Verification (LEI/VAT)

**Problem**: No proof the organization legally exists.
**Solution**: Verify against official business registries.

```typescript
// LEI (Legal Entity Identifier) verification via GLEIF API
async function verifyLEI(lei: string, claimedName: string): Promise<VerificationResult> {
  const response = await fetch(
    `https://api.gleif.org/api/v1/lei-records/${lei}`
  );

  if (!response.ok) {
    return { verified: false, reason: 'LEI not found in GLEIF database' };
  }

  const data = await response.json();
  const legalName = data.data.attributes.entity.legalName.name;
  const status = data.data.attributes.entity.status;

  if (status !== 'ACTIVE') {
    return { verified: false, reason: `LEI status is ${status}, not ACTIVE` };
  }

  // Fuzzy match on name (handles minor variations)
  const nameMatch = fuzzyMatch(legalName, claimedName) > 0.85;

  if (!nameMatch) {
    return {
      verified: false,
      reason: `LEI registered to "${legalName}", not "${claimedName}"`,
    };
  }

  return {
    verified: true,
    level: 'LEI_VERIFIED',
    lei,
    legalName,
    jurisdiction: data.data.attributes.entity.jurisdiction,
  };
}

// VAT verification via EU VIES API
async function verifyVAT(vatNumber: string, claimedName: string): Promise<VerificationResult> {
  const countryCode = vatNumber.slice(0, 2);
  const number = vatNumber.slice(2);

  const response = await fetch(
    `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${countryCode}/vat/${number}`
  );

  if (!response.ok) {
    return { verified: false, reason: 'VAT number not found in VIES' };
  }

  const data = await response.json();

  if (!data.isValid) {
    return { verified: false, reason: 'VAT number is not valid' };
  }

  return {
    verified: true,
    level: 'VAT_VERIFIED',
    vatNumber,
    registeredName: data.name,
    registeredAddress: data.address,
    countryCode,
  };
}
```

### Solution 4: New Verification Levels

**Replace weak verification levels with meaningful ones:**

```typescript
enum VerificationLevel {
  // Weak (display warnings)
  SELF_ATTESTED = 'SELF_ATTESTED',       // Just signed up
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',      // Email confirmed (was DOMAIN_VERIFIED)

  // Moderate (organization exists)
  DNS_VERIFIED = 'DNS_VERIFIED',          // Controls domain via DNS TXT
  VAT_VERIFIED = 'VAT_VERIFIED',          // VAT number validated via VIES
  LEI_VERIFIED = 'LEI_VERIFIED',          // LEI validated via GLEIF

  // Strong (for certification bodies)
  REGISTRY_VERIFIED = 'REGISTRY_VERIFIED', // In EuroComply trusted issuer registry
  EUDI_VERIFIED = 'EUDI_VERIFIED',         // EU Digital Identity Wallet (future)
}

// Trust display in UI
const trustDisplay: Record<VerificationLevel, TrustDisplay> = {
  SELF_ATTESTED: {
    badge: '⚠️',
    color: 'red',
    label: 'Unverified Identity',
    warning: 'This entity has not proven their identity. Treat claims with caution.',
  },
  EMAIL_VERIFIED: {
    badge: '⚠️',
    color: 'orange',
    label: 'Email Only',
    warning: 'Only email address verified. Does not prove organizational identity.',
  },
  DNS_VERIFIED: {
    badge: '🔵',
    color: 'blue',
    label: 'Domain Verified',
    description: 'Controls the claimed domain (DNS verification)',
  },
  VAT_VERIFIED: {
    badge: '🟢',
    color: 'green',
    label: 'Business Verified',
    description: 'VAT number verified against EU VIES registry',
  },
  LEI_VERIFIED: {
    badge: '🟢',
    color: 'green',
    label: 'LEI Verified',
    description: 'Legal Entity Identifier verified against GLEIF',
  },
  REGISTRY_VERIFIED: {
    badge: '✅',
    color: 'green',
    label: 'Trusted Issuer',
    description: 'Verified certification body in EuroComply trust registry',
  },
  EUDI_VERIFIED: {
    badge: '🇪🇺',
    color: 'blue',
    label: 'EU Digital Identity',
    description: 'Verified via EU Digital Identity Wallet',
  },
};
```

### Updated Trust Model

```
┌─────────────────────────────────────────────────────────────────┐
│  VERIFICATION LEVEL HIERARCHY                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LEVEL              │ WHAT IT PROVES           │ TRUST DISPLAY  │
│  ──────────────────────────────────────────────────────────────│
│  SELF_ATTESTED      │ Nothing                  │ ⚠️ Red warning  │
│  EMAIL_VERIFIED     │ Has email at domain      │ ⚠️ Orange warn  │
│  DNS_VERIFIED       │ Controls domain          │ 🔵 Moderate     │
│  VAT_VERIFIED       │ Business legally exists  │ 🟢 Good         │
│  LEI_VERIFIED       │ Global business ID       │ 🟢 Good         │
│  REGISTRY_VERIFIED  │ Accredited cert body     │ ✅ High trust   │
│  EUDI_VERIFIED      │ EU government vouches    │ 🇪🇺 Highest     │
│                                                                  │
│  CERTIFICATION ATTESTATIONS:                                    │
│  • Only REGISTRY_VERIFIED issuers can attest certifications    │
│  • Other levels display "unverified certifier" warning         │
│                                                                  │
│  MANUFACTURER/SUPPLIER ATTESTATIONS:                            │
│  • VAT_VERIFIED or higher recommended                          │
│  • SELF_ATTESTED displays prominent warning                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### UI Display: Before vs After

**Before (insufficient):**
```
┌─────────────────────────────────────────────────────────────────┐
│ GOTS CERTIFICATION                                   ✓ ATTESTED │
│ Certificate: CU-123456                                          │
│                                                                 │
│ Attested by: Control Union Certifications                       │
│ Type: CERTIFIER • DOMAIN_VERIFIED                               │
│ ✓ Signature Valid                                              │
│                                                                 │
│ [No indication this could be a fake "Control Union"]           │
└─────────────────────────────────────────────────────────────────┘
```

**After (with trust verification):**
```
┌─────────────────────────────────────────────────────────────────┐
│ GOTS CERTIFICATION                                   ✅ TRUSTED │
│ Certificate: CU-123456                                          │
│                                                                 │
│ Attested by: Control Union Certifications                       │
│ ✅ REGISTRY_VERIFIED - Trusted Certification Body              │
│ ✓ In EuroComply Trust Registry since 2026-01-01                │
│ ✓ Accredited for: GOTS, OCS, GRS, RCS                          │
│ ✓ Verified via IOAS accreditation registry                     │
│ ✓ Signature Valid                                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ GOTS CERTIFICATION                                   ⚠️ WARNING │
│ Certificate: FAKE-123                                           │
│                                                                 │
│ Attested by: "Control Union" (controlunion.io)                  │
│ ⚠️ EMAIL_VERIFIED ONLY - Not in Trust Registry                 │
│ ⚠️ This certifier has NOT been verified by EuroComply          │
│ ⚠️ controlunion.io is NOT the official Control Union domain    │
│ ✓ Signature Valid (but identity not verified)                  │
│                                                                 │
│ [!] Do not rely on this certification without independent      │
│     verification from the actual certification body.           │
└─────────────────────────────────────────────────────────────────┘
```

### Verification API

```typescript
// Public API: Check if an issuer is trusted
// GET /api/v1/public/verify-issuer/:did
app.get('/api/v1/public/verify-issuer/:did', async (req, res) => {
  const { did } = req.params;

  // Check trusted issuer registry
  const trustedIssuer = await prisma.trustedIssuer.findUnique({
    where: { did },
  });

  if (trustedIssuer) {
    return res.json({
      did,
      trusted: true,
      level: 'REGISTRY_VERIFIED',
      issuer: {
        name: trustedIssuer.name,
        type: trustedIssuer.type,
        accreditations: trustedIssuer.accreditations,
        verifiedAt: trustedIssuer.verifiedAt,
        officialWebsite: trustedIssuer.officialWebsite,
      },
    });
  }

  // Check contributor verification level
  const contributor = await prisma.contributor.findUnique({
    where: { did },
    select: {
      name: true,
      verificationLevel: true,
      domain: true,
      vatNumber: true,
      lei: true,
    },
  });

  if (!contributor) {
    return res.json({
      did,
      trusted: false,
      level: 'UNKNOWN',
      warning: 'This DID is not registered in our system',
    });
  }

  return res.json({
    did,
    trusted: contributor.verificationLevel !== 'SELF_ATTESTED',
    level: contributor.verificationLevel,
    issuer: {
      name: contributor.name,
      domain: contributor.domain,
      vatNumber: contributor.vatNumber ? 'Verified' : null,
      lei: contributor.lei ? 'Verified' : null,
    },
    warning: contributor.verificationLevel === 'SELF_ATTESTED'
      ? 'Identity not verified. Treat claims with caution.'
      : null,
  });
});
```

### Implementation Roadmap

| Solution | Complexity | Target | Status |
|----------|------------|--------|--------|
| Trusted Issuer Registry | Medium | Q1 2026 | 📋 Planned |
| DNS TXT Verification | Low | Q1 2026 | 📋 Planned |
| VAT/VIES Integration | Low | Q1 2026 | 📋 Planned |
| LEI/GLEIF Integration | Low | Q1 2026 | 📋 Planned |
| Updated Verification Levels | Medium | Q1 2026 | 📋 Planned |
| UI Trust Indicators | Medium | Q1 2026 | 📋 Planned |
| EUDI Wallet Integration | High | Q3 2026 | 📋 Planned |
| Proactive Identity Protection | Medium | Q1 2026 | 📋 Planned |

### 17.5 Proactive Identity Protection

The solutions above are **reactive** - they verify identity when requested. This section adds **proactive** defenses against impersonation attacks.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROACTIVE IDENTITY PROTECTION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  REACTIVE (Solutions 1-4):                                                  │
│  ─────────────────────────                                                  │
│  • Verify identity when attestation is checked                              │
│  • Display warnings for unverified issuers                                  │
│  • User must notice and act on warnings                                     │
│                                                                              │
│  PROACTIVE (This section):                                                  │
│  ─────────────────────────                                                  │
│  • Detect lookalike domains at registration time                            │
│  • Block known impersonation patterns                                       │
│  • Alert trusted issuers of suspicious activity                            │
│  • Maintain blocklist of known bad actors                                   │
│                                                                              │
│  Defense in depth: Even if proactive detection fails,                       │
│  reactive verification catches it at display time.                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 17.5.1 Lookalike Domain Detection

Detect domains that are confusingly similar to trusted issuers:

```typescript
// src/lib/identity/lookalike-detection.ts

interface LookalikeCheckResult {
  isSuspicious: boolean;
  similarTo?: TrustedIssuer;
  similarity: number;
  reasons: string[];
  action: 'ALLOW' | 'FLAG_FOR_REVIEW' | 'BLOCK';
}

// Homoglyph mappings (characters that look similar)
const HOMOGLYPHS: Record<string, string[]> = {
  'a': ['а', 'ạ', 'ă', 'α'],      // Cyrillic 'а', Vietnamese, etc.
  'e': ['е', 'ẹ', 'ė', 'ε'],      // Cyrillic 'е', Greek epsilon
  'o': ['о', 'ọ', 'ο', '0'],      // Cyrillic 'о', Greek omicron, zero
  'i': ['і', 'ị', 'ı', '1', 'l'], // Cyrillic 'і', Turkish dotless i, one, lowercase L
  'c': ['с', 'ç', 'ċ'],           // Cyrillic 'с'
  'u': ['υ', 'ụ', 'μ'],           // Greek upsilon, mu
  'n': ['п', 'ń', 'η'],           // Cyrillic 'п', Greek eta
  // ... more mappings
};

// Common TLD typosquatting patterns
const SUSPICIOUS_TLD_PATTERNS = [
  { trusted: '.com', suspicious: ['.co', '.cm', '.corn', '.com.de', '.io', '.net', '.org'] },
  { trusted: '.org', suspicious: ['.og', '.org.com', '.io'] },
  { trusted: '.eu', suspicious: ['.eu.com', '.ею'] },
];

async function checkForLookalike(
  registrationDomain: string,
  registrationName: string
): Promise<LookalikeCheckResult> {
  const trustedIssuers = await getTrustedIssuers();
  const results: LookalikeCheckResult[] = [];

  for (const issuer of trustedIssuers) {
    const domainSimilarity = calculateDomainSimilarity(
      registrationDomain,
      new URL(issuer.officialWebsite).hostname
    );

    const nameSimilarity = calculateNameSimilarity(
      registrationName,
      issuer.name
    );

    if (domainSimilarity > 0.7 || nameSimilarity > 0.8) {
      results.push({
        isSuspicious: true,
        similarTo: issuer,
        similarity: Math.max(domainSimilarity, nameSimilarity),
        reasons: buildSuspicionReasons(registrationDomain, registrationName, issuer),
        action: determineAction(domainSimilarity, nameSimilarity),
      });
    }
  }

  // Return the most suspicious match
  if (results.length > 0) {
    return results.sort((a, b) => b.similarity - a.similarity)[0];
  }

  return {
    isSuspicious: false,
    similarity: 0,
    reasons: [],
    action: 'ALLOW',
  };
}

function calculateDomainSimilarity(domain1: string, domain2: string): number {
  // Normalize domains
  const d1 = normalizeDomain(domain1);
  const d2 = normalizeDomain(domain2);

  // Exact match (different TLD)
  const d1Base = d1.split('.')[0];
  const d2Base = d2.split('.')[0];

  if (d1Base === d2Base) {
    return 0.95; // Same base, different TLD = very suspicious
  }

  // Levenshtein distance
  const levenshteinSim = 1 - (levenshteinDistance(d1Base, d2Base) / Math.max(d1Base.length, d2Base.length));

  // Homoglyph detection
  const homoglyphSim = calculateHomoglyphSimilarity(d1Base, d2Base);

  // Character insertion/deletion (e.g., "controll-union" vs "control-union")
  const typoSim = calculateTypoSimilarity(d1Base, d2Base);

  return Math.max(levenshteinSim, homoglyphSim, typoSim);
}

function calculateHomoglyphSimilarity(s1: string, s2: string): number {
  // Normalize both strings by replacing homoglyphs with their base character
  const normalize = (s: string): string => {
    let normalized = s.toLowerCase();
    for (const [base, variants] of Object.entries(HOMOGLYPHS)) {
      for (const variant of variants) {
        normalized = normalized.replace(new RegExp(variant, 'g'), base);
      }
    }
    return normalized;
  };

  const n1 = normalize(s1);
  const n2 = normalize(s2);

  if (n1 === n2) {
    return 1.0; // Homoglyph attack detected
  }

  return 1 - (levenshteinDistance(n1, n2) / Math.max(n1.length, n2.length));
}

function buildSuspicionReasons(
  domain: string,
  name: string,
  trustedIssuer: TrustedIssuer
): string[] {
  const reasons: string[] = [];
  const trustedDomain = new URL(trustedIssuer.officialWebsite).hostname;

  // Check for TLD swap
  const domainBase = domain.split('.')[0];
  const trustedBase = trustedDomain.split('.')[0];

  if (domainBase === trustedBase) {
    reasons.push(`Same base domain as ${trustedIssuer.name} but different TLD`);
  }

  // Check for homoglyphs
  if (containsHomoglyphs(domain)) {
    reasons.push('Domain contains characters that look like Latin letters but are not (homoglyph attack)');
  }

  // Check for typosquatting patterns
  if (isTyposquat(domain, trustedDomain)) {
    reasons.push(`Domain is a typosquat variant of ${trustedDomain}`);
  }

  // Check for name similarity
  if (calculateNameSimilarity(name, trustedIssuer.name) > 0.8) {
    reasons.push(`Organization name "${name}" is very similar to trusted issuer "${trustedIssuer.name}"`);
  }

  return reasons;
}

function determineAction(domainSim: number, nameSim: number): 'ALLOW' | 'FLAG_FOR_REVIEW' | 'BLOCK' {
  const maxSim = Math.max(domainSim, nameSim);

  if (maxSim >= 0.95) return 'BLOCK';        // Almost certain impersonation
  if (maxSim >= 0.80) return 'FLAG_FOR_REVIEW'; // Needs human review
  return 'ALLOW';
}
```

#### 17.5.2 Registration-Time Enforcement

Apply lookalike detection during contributor registration:

```typescript
// src/services/contributor-registration.ts

async function registerContributor(
  registration: ContributorRegistration
): Promise<RegistrationResult> {
  // Step 1: Check for lookalike domains
  const lookalikeCheck = await checkForLookalike(
    registration.domain,
    registration.organizationName
  );

  if (lookalikeCheck.action === 'BLOCK') {
    // Log for security audit
    await auditLog.create({
      action: 'REGISTRATION_BLOCKED',
      resourceType: 'Contributor',
      metadata: {
        attemptedDomain: registration.domain,
        attemptedName: registration.organizationName,
        similarTo: lookalikeCheck.similarTo?.name,
        similarity: lookalikeCheck.similarity,
        reasons: lookalikeCheck.reasons,
      },
    });

    // Alert the trusted issuer being impersonated
    await alertTrustedIssuer(lookalikeCheck.similarTo!, registration);

    return {
      success: false,
      error: {
        code: 'REGISTRATION_BLOCKED',
        message: 'Registration blocked due to similarity to a verified certification body.',
        details: {
          similarTo: lookalikeCheck.similarTo?.name,
          reasons: lookalikeCheck.reasons,
          contactEmail: 'security@eurocomply.eu',
        },
      },
    };
  }

  if (lookalikeCheck.action === 'FLAG_FOR_REVIEW') {
    // Create registration in PENDING_REVIEW state
    const contributor = await prisma.contributor.create({
      data: {
        ...registration,
        status: 'PENDING_MANUAL_REVIEW',
        reviewReason: lookalikeCheck.reasons.join('; '),
        flaggedSimilarTo: lookalikeCheck.similarTo?.did,
      },
    });

    // Notify security team
    await notifySecurityTeam({
      type: 'SUSPICIOUS_REGISTRATION',
      contributorId: contributor.id,
      lookalikeCheck,
    });

    return {
      success: true,
      pendingReview: true,
      message: 'Registration submitted for manual review. You will be contacted within 2 business days.',
    };
  }

  // Normal registration flow
  return await completeRegistration(registration);
}
```

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  REGISTRATION FLOW WITH LOOKALIKE DETECTION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User submits registration                                                  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────────────┐                                                │
│  │  Lookalike Detection    │                                                │
│  │  • Domain similarity    │                                                │
│  │  • Name similarity      │                                                │
│  │  • Homoglyph check      │                                                │
│  └───────────┬─────────────┘                                                │
│              │                                                               │
│     ┌────────┼────────┐                                                     │
│     │        │        │                                                     │
│     ▼        ▼        ▼                                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐                                                │
│  │ALLOW │ │REVIEW│ │BLOCK │                                                │
│  └──┬───┘ └──┬───┘ └──┬───┘                                                │
│     │        │        │                                                     │
│     ▼        ▼        ▼                                                     │
│  Continue  Manual   Reject +                                                │
│  normally  review   Alert issuer                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 17.5.3 Trust Registry Governance

Transparent governance model for the trusted issuer registry:

```typescript
// Trust Registry Governance Model

interface TrustRegistryGovernance {
  // Criteria for inclusion
  inclusionCriteria: {
    certificationBodies: {
      required: [
        'Accreditation by recognized body (IOAS, IAF member, national body)',
        'Active accreditation status verified against official registry',
        'Domain ownership verified via DNS TXT',
        'Official contact confirmation (phone call + email)',
      ],
      recommended: [
        'LEI registration',
        'Member of industry association (Textile Exchange, etc.)',
      ],
    },
    governmentBodies: {
      required: [
        'Official government domain (.gov, .europa.eu, etc.)',
        'DNS TXT verification',
        'Letter of authorization on official letterhead',
      ],
    },
  };

  // Decision process
  decisionProcess: {
    reviewer: 'EuroComply Security Team',
    approvalRequired: 2, // Two-person approval
    slaBusinessDays: 5,
    documentation: 'All evidence stored in audit log',
  };

  // Appeals process
  appealsProcess: {
    contactEmail: 'trust-registry-appeals@eurocomply.eu',
    reviewPeriod: '10 business days',
    escalationTo: 'External advisory board (annual review)',
  };

  // Removal criteria
  removalCriteria: [
    'Accreditation revoked or expired',
    'Evidence of fraudulent certifications',
    'Failure to respond to verification renewal (annual)',
    'Request from the organization itself',
  ];

  // Transparency
  transparency: {
    publicRegistry: true, // List of trusted issuers is public
    changeLog: true,      // All additions/removals logged
    auditReports: 'annual', // Annual transparency report
  };
}
```

**Public Transparency Log:**

```typescript
// GET /api/v1/public/trust-registry/changelog
interface TrustRegistryChange {
  id: string;
  timestamp: Date;
  action: 'ADDED' | 'REMOVED' | 'UPDATED';
  issuerDid: string;
  issuerName: string;
  reason: string;
  verificationMethod: string;
  approvedBy: string[]; // Anonymized reviewer IDs
}

// Example changelog entries
const changelog: TrustRegistryChange[] = [
  {
    id: 'chg_001',
    timestamp: new Date('2026-01-15'),
    action: 'ADDED',
    issuerDid: 'did:key:z6MkControlUnion...',
    issuerName: 'Control Union Certifications',
    reason: 'Initial registry population - major certification body',
    verificationMethod: 'IOAS registry + official contact + DNS TXT',
    approvedBy: ['reviewer_a1b2', 'reviewer_c3d4'],
  },
  {
    id: 'chg_002',
    timestamp: new Date('2026-03-20'),
    action: 'REMOVED',
    issuerDid: 'did:key:z6MkExpiredCert...',
    issuerName: 'Expired Certifications Ltd',
    reason: 'Accreditation expired, not renewed',
    verificationMethod: 'IOAS registry check - status changed to EXPIRED',
    approvedBy: ['reviewer_e5f6', 'reviewer_g7h8'],
  },
];
```

#### 17.5.4 Impersonation Alerting

Notify trusted issuers when potential impersonation is detected:

```typescript
// src/services/impersonation-alerting.ts

interface ImpersonationAlert {
  trustedIssuer: TrustedIssuer;
  suspiciousRegistration: {
    domain: string;
    name: string;
    email: string;
    ipAddress: string;
    registrationTime: Date;
  };
  similarity: number;
  reasons: string[];
  action: 'BLOCKED' | 'FLAGGED_FOR_REVIEW';
}

async function alertTrustedIssuer(
  issuer: TrustedIssuer,
  registration: ContributorRegistration
): Promise<void> {
  const alert: ImpersonationAlert = {
    trustedIssuer: issuer,
    suspiciousRegistration: {
      domain: registration.domain,
      name: registration.organizationName,
      email: registration.email,
      ipAddress: registration.ipAddress,
      registrationTime: new Date(),
    },
    similarity: 0, // Set by caller
    reasons: [],   // Set by caller
    action: 'BLOCKED',
  };

  // Send email to trusted issuer's security contact
  await sendEmail({
    to: issuer.securityContact || `security@${new URL(issuer.officialWebsite).hostname}`,
    subject: `[EuroComply Alert] Potential impersonation attempt detected`,
    template: 'impersonation-alert',
    data: {
      issuerName: issuer.name,
      suspiciousDomain: registration.domain,
      suspiciousName: registration.organizationName,
      reasons: alert.reasons,
      actionTaken: alert.action,
      reportUrl: `https://eurocomply.eu/security/report/${alert.id}`,
    },
  });

  // Log for our records
  await prisma.impersonationAlert.create({
    data: {
      trustedIssuerId: issuer.did,
      suspiciousDomain: registration.domain,
      suspiciousName: registration.organizationName,
      suspiciousEmail: registration.email,
      similarity: alert.similarity,
      reasons: alert.reasons,
      actionTaken: alert.action,
      alertSentAt: new Date(),
    },
  });
}
```

**Alert Email Template:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Subject: [EuroComply Alert] Potential impersonation attempt detected        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Dear Control Union Certifications Security Team,                           │
│                                                                              │
│  EuroComply's identity protection system has detected and BLOCKED a         │
│  registration attempt that appears to impersonate your organization.        │
│                                                                              │
│  SUSPICIOUS REGISTRATION:                                                   │
│  • Domain: controlunion.io                                                  │
│  • Organization Name: "Control Union Certifications"                        │
│  • Registration Time: 2026-01-15 14:32:00 UTC                              │
│                                                                              │
│  REASONS FOR BLOCKING:                                                      │
│  • Same base domain as Control Union but different TLD (.io vs .com)       │
│  • Organization name exactly matches your verified name                     │
│  • Attempted to register as CERTIFIER with GOTS attestation capability     │
│                                                                              │
│  ACTION TAKEN:                                                              │
│  Registration was automatically BLOCKED. No attestations were issued.      │
│                                                                              │
│  RECOMMENDED ACTIONS:                                                       │
│  • Consider registering controlunion.io defensively                        │
│  • Report this domain to your legal team if appropriate                    │
│  • No action required on EuroComply - we've handled it                     │
│                                                                              │
│  View full report: https://eurocomply.eu/security/report/rpt_abc123        │
│                                                                              │
│  Questions? Contact security@eurocomply.eu                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 17.5.5 Known Bad Actor Blocklist

Maintain a blocklist of confirmed bad actors:

```typescript
// src/lib/identity/blocklist.ts

interface BlocklistEntry {
  id: string;
  type: 'DOMAIN' | 'EMAIL_PATTERN' | 'IP_RANGE' | 'NAME_PATTERN';
  value: string;           // The blocked value or pattern
  reason: string;
  addedAt: Date;
  addedBy: string;         // Reviewer ID
  expiresAt?: Date;        // Optional expiry
  evidence: string[];      // Links to evidence
}

const blocklist: BlocklistEntry[] = [
  {
    id: 'blk_001',
    type: 'DOMAIN',
    value: 'controlunion.io',
    reason: 'Confirmed impersonation attempt of Control Union Certifications',
    addedAt: new Date('2026-01-15'),
    addedBy: 'security_team',
    evidence: ['incident_report_001', 'legal_notice_cu_2026_01'],
  },
  {
    id: 'blk_002',
    type: 'EMAIL_PATTERN',
    value: '*@fake-certifications.com',
    reason: 'Domain used for multiple fraudulent certification claims',
    addedAt: new Date('2026-02-01'),
    addedBy: 'security_team',
    evidence: ['incident_report_002', 'incident_report_003'],
  },
  {
    id: 'blk_003',
    type: 'NAME_PATTERN',
    value: '/control.?union/i', // Regex pattern
    reason: 'Block variations of Control Union name from non-verified registrations',
    addedAt: new Date('2026-01-20'),
    addedBy: 'security_team',
    expiresAt: undefined, // Permanent
    evidence: ['policy_decision_001'],
  },
];

async function checkBlocklist(registration: ContributorRegistration): Promise<BlocklistMatch | null> {
  for (const entry of blocklist) {
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      continue; // Expired entry
    }

    let matched = false;

    switch (entry.type) {
      case 'DOMAIN':
        matched = registration.domain === entry.value;
        break;
      case 'EMAIL_PATTERN':
        matched = matchWildcard(registration.email, entry.value);
        break;
      case 'NAME_PATTERN':
        matched = new RegExp(entry.value).test(registration.organizationName);
        break;
      case 'IP_RANGE':
        matched = ipInRange(registration.ipAddress, entry.value);
        break;
    }

    if (matched) {
      return {
        entry,
        matchedField: entry.type,
        matchedValue: getMatchedValue(registration, entry.type),
      };
    }
  }

  return null;
}
```

#### 17.5.6 Defense Summary

| Layer | Mechanism | Catches |
|-------|-----------|---------|
| **Blocklist** | Known bad domains/patterns | Repeat offenders |
| **Lookalike Detection** | Domain/name similarity | New impersonation attempts |
| **Registration Review** | Manual verification | Edge cases, sophisticated attacks |
| **Trusted Issuer Alert** | Notify impersonation targets | Brand protection |
| **Transparency Log** | Public changelog | Accountability, trust |

**Attack Resistance:**

| Attack | Defense |
|--------|---------|
| `controlunion.io` (TLD swap) | Lookalike detection → BLOCK |
| `сontrolunion.com` (Cyrillic 'с') | Homoglyph detection → BLOCK |
| `control-union-certifications.com` | Name similarity → FLAG_FOR_REVIEW |
| `controlunion.com` (legitimate) | Already in Trust Registry → ALLOW |
| Known bad actor returns | Blocklist → BLOCK |

### What This Doesn't Solve

**Honest limitations:**

1. **Initial registry population** - We must manually verify each certification body
2. **Non-EU businesses** - VAT/VIES only works for EU entities
3. **Small suppliers** - May not have LEI (costs ~$100/year)
4. **Attestation content** - We verify WHO signed, not WHETHER claims are true
5. **Revoked accreditations** - Registry must be kept up-to-date

**The verification hierarchy makes trust explicit:**
- REGISTRY_VERIFIED = "We verified this is the real certification body"
- VAT_VERIFIED = "This business legally exists"
- DNS_VERIFIED = "They control this domain"
- EMAIL_VERIFIED = "They have an email here" (weak)
- SELF_ATTESTED = "They claim to be X" (very weak)

---

## 18. References

- [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model/)
- [W3C Decentralized Identifiers (DIDs)](https://www.w3.org/TR/did-core/)
- [did:key Method Specification](https://w3c-ccg.github.io/did-method-key/)
- [walt.id Documentation](https://docs.walt.id/)
- [ESPR Regulation](https://eur-lex.europa.eu/eli/reg/2024/1781)
- [eIDAS 2.0 Framework](https://digital-strategy.ec.europa.eu/en/policies/eidas-regulation)
- [MULTI_PARTY_ATTESTATION.md](./MULTI_PARTY_ATTESTATION.md) - Third-party attestation architecture

---

*Last Updated: 2026-01-13*
