# Verifiable Credentials for Digital Product Passports

## How EuroComply Uses walt.id for Portable, Verifiable DPPs

> ⚠️ **Implementation Status**
> - DID Method: Currently `did:web` (target: `did:key` for offline verification)
> - VC Content: Currently references DB (target: all data embedded)
> - Export: Not yet implemented (target: one-click export with offline viewer)
>
> See [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) for target architecture.

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

### 4.2 Supplier Identity (did:key)

When a supplier signs up:

1. Generate Ed25519 key pair
2. Create did:key from public key
3. Store private key securely (exportable)
4. Supplier can export keys at any time

```
Supplier DID: did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS
              ──────────────────────────────────────────────────────────
                                    │
                                    └── Self-contained, portable identity
```

### 4.3 The DPP as a Verifiable Credential

When a DPP is created and signed, it becomes a portable VC:

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

When a supplier exports their data (or cancels subscription):

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

### What Suppliers Can Do After Export

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

### For Suppliers

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
| **Independence** | Can verify without contacting supplier |
| **Offline** | Verification works without internet |
| **Standards** | W3C format works with any compliant tool |

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

## 11. Future: EBSI Integration

When EuroComply achieves scale, EBSI integration adds EU-level trust:

| Feature | did:key (Current) | did:ebsi (Future) |
|---------|-------------------|-------------------|
| **Trust Anchor** | Self-attested | EU Government blockchain |
| **Legal Status** | Industry standard | eIDAS 2.0 recognized |
| **Issuer Registry** | None required | Listed in EU Trusted Issuers |
| **Portability** | Full | Full |

The architecture supports both - did:key for portability, did:ebsi for EU trust framework.

---

## 12. Code Example: Issuing a Portable DPP

```typescript
import { getVcService, getDidKeyService } from '@eurocomply/identity';

async function createPortableDPP(dppData: DppData, supplier: Supplier) {
  const didKeyService = getDidKeyService();
  const vcService = getVcService();

  // 1. Get or create supplier's did:key
  let supplierDid = supplier.did;
  if (!supplierDid) {
    const { did, privateKeyJwk } = await didKeyService.createDidKey();
    supplierDid = did;
    // Store DID and encrypted private key
    await saveSupplierIdentity(supplier.id, did, privateKeyJwk);
  }

  // 2. Build credential subject
  const credentialSubject = {
    id: `urn:gtin:${dppData.gtin}`,
    type: 'Product',
    name: dppData.name,
    gtin: dppData.gtin,
    manufacturer: {
      name: supplier.companyName,
      country: supplier.country,
    },
    sustainability: dppData.sustainability,
    certifications: dppData.certifications,
  };

  // 3. Issue Verifiable Credential
  const vc = await vcService.issueCredential({
    issuerDid: supplierDid,
    credentialType: 'DigitalProductPassport',
    credentialSubject,
    expiresIn: '10y',
  });

  // 4. Store and return
  return {
    vcJson: vc.credential,
    vcJwt: vc.jwt,
    // This VC is now portable - supplier owns it
  };
}
```

---

## 13. Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    VERIFIABLE CREDENTIALS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  IDENTITY                                                       │
│  → did:key (self-contained, portable)                           │
│  → No platform dependency                                       │
│  → Supplier owns their identity                                 │
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
│  → Easy creation tools                                          │
│  → Managed hosting (while subscribed)                          │
│  → Retailer distribution                                        │
│  → NOT lock-in                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 14. References

- [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model/)
- [W3C Decentralized Identifiers (DIDs)](https://www.w3.org/TR/did-core/)
- [did:key Method Specification](https://w3c-ccg.github.io/did-method-key/)
- [walt.id Documentation](https://docs.walt.id/)
- [ESPR Regulation](https://eur-lex.europa.eu/eli/reg/2024/1781)
- [eIDAS 2.0 Framework](https://digital-strategy.ec.europa.eu/en/policies/eidas-regulation)

---

*Last Updated: 2026-01-08*
