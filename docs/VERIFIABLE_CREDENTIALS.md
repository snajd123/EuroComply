# Verifiable Credentials for Digital Product Passports

## How EuroComply Uses walt.id for Cryptographically Verifiable DPPs

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
```

**The trust question:** When a consumer or regulator scans a DPP QR code, how do they know:
1. The data hasn't been tampered with?
2. It was actually issued by the claimed manufacturer?
3. It hasn't been revoked or updated?

---

## 2. The Innovation: DPPs as Verifiable Credentials

EuroComply issues DPPs as **W3C Verifiable Credentials** - the same standard used for digital identity wallets under eIDAS 2.0.

```
EuroComply DPP Flow:
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  QR Code on  │ ──►  │  Fetch VC    │ ──►  │  Verify      │
│  Product     │      │  (JWT)       │      │  Signature   │
└──────────────┘      └──────────────┘      └──────────────┘
                                                   │
                                                   ▼
                                            ┌──────────────┐
                                            │ ✓ Issuer DID │
                                            │ ✓ Not Tampered│
                                            │ ✓ Not Expired │
                                            │ ✓ Not Revoked │
                                            └──────────────┘

Benefits:
• Cryptographic tamper evidence (signature breaks if data changes)
• Decentralized verification (no need to trust EuroComply's database)
• Issuer accountability (DID proves who made the claim)
• Timestamped (proof of when claims were made)
• Portable (credential can be verified by anyone, anywhere)
```

### What Makes This Different

| Aspect | Traditional DPP | EuroComply VC-DPP |
|--------|-----------------|-------------------|
| **Tamper Evidence** | None - data can be silently changed | Cryptographic - any change breaks signature |
| **Trust Model** | Trust the database operator | Trust math (cryptographic verification) |
| **Issuer Proof** | "Trust me, I'm the manufacturer" | DID signature proves issuer identity |
| **Offline Verification** | Impossible | Possible (with cached DID document) |
| **Interoperability** | Proprietary formats | W3C standard, works with EUDI wallets |
| **Regulatory Alignment** | Just data storage | Aligned with eIDAS 2.0 trust framework |

---

## 3. Technical Architecture

### 3.1 The Identity Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EuroComply Platform                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────────┐                    ┌─────────────────────┐    │
│   │  ProductTrust   │                    │   packages/identity │    │
│   │      API        │ ───────────────►   │   (walt.id wrapper) │    │
│   │                 │                    │                     │    │
│   │ POST /passports │                    │ • DidService        │    │
│   │ POST /anchor    │                    │ • VcService         │    │
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

### 3.2 DID (Decentralized Identifier) Structure

Every organization on EuroComply gets a **DID** - a globally unique, cryptographically verifiable identifier.

```
Organization DID: did:web:api.eurocomply.eu:org:acme-corp
                  ─────── ─────────────────── ─────────
                     │            │              │
                     │            │              └── Organization slug
                     │            └── EuroComply domain
                     └── DID method (web-based resolution)
```

**DID Document** (hosted at `https://api.eurocomply.eu/org/acme-corp/did.json`):
```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:api.eurocomply.eu:org:acme-corp",
  "verificationMethod": [{
    "id": "did:web:api.eurocomply.eu:org:acme-corp#key-1",
    "type": "JsonWebKey2020",
    "controller": "did:web:api.eurocomply.eu:org:acme-corp",
    "publicKeyJwk": {
      "kty": "EC",
      "crv": "P-256",
      "x": "...",
      "y": "..."
    }
  }],
  "authentication": ["did:web:api.eurocomply.eu:org:acme-corp#key-1"],
  "assertionMethod": ["did:web:api.eurocomply.eu:org:acme-corp#key-1"]
}
```

**Why this matters:** Anyone can resolve this DID, get the public key, and verify signatures made by ACME Corp - without asking EuroComply for permission.

### 3.3 The DPP as a Verifiable Credential

When a passport is created and anchored, it becomes a signed JWT:

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://eurocomply.eu/contexts/dpp/v1"
  ],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:web:api.eurocomply.eu:org:acme-corp",
  "issuanceDate": "2026-01-07T10:30:00Z",
  "credentialSubject": {
    "id": "urn:gtin:5901234123457",
    "type": "Product",
    "name": "Sustainable T-Shirt",
    "gtin": "5901234123457",
    "manufacturer": {
      "name": "ACME Textiles GmbH",
      "country": "DE",
      "did": "did:web:api.eurocomply.eu:org:acme-corp"
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
    "compliance": {
      "regulation": "ESPR",
      "category": "Textiles",
      "declarationDate": "2026-01-07"
    }
  },
  "proof": {
    "type": "JsonWebSignature2020",
    "created": "2026-01-07T10:30:00Z",
    "verificationMethod": "did:web:api.eurocomply.eu:org:acme-corp#key-1",
    "proofPurpose": "assertionMethod",
    "jws": "eyJhbGciOiJFUzI1NiIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il19...[signature]"
  }
}
```

**The `proof` field is the magic:** It contains a cryptographic signature over the entire credential. If anyone changes a single character in the data, the signature verification fails.

---

## 4. The Verification Flow

### 4.1 What Happens When Someone Scans a DPP QR Code

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DPP Verification Flow                                │
└─────────────────────────────────────────────────────────────────────────────┘

     Consumer/Regulator              EuroComply API            Verifier Logic
            │                              │                         │
            │  1. Scan QR Code             │                         │
            │  (GS1 Digital Link)          │                         │
            │                              │                         │
            │  2. GET /v1/passports/{id}/verify                      │
            │─────────────────────────────►│                         │
            │                              │                         │
            │                              │  3. Fetch VC JWT        │
            │                              │  from database          │
            │                              │                         │
            │                              │  4. Return VC + DID doc │
            │◄─────────────────────────────│                         │
            │                              │                         │
            │  5. Verify signature         │                         │
            │────────────────────────────────────────────────────────►│
            │                              │                         │
            │                              │     a. Parse JWT        │
            │                              │     b. Extract issuer DID
            │                              │     c. Resolve DID doc  │
            │                              │     d. Get public key   │
            │                              │     e. Verify signature │
            │                              │     f. Check expiry     │
            │                              │     g. Check revocation │
            │                              │                         │
            │  6. Verification result      │                         │
            │◄────────────────────────────────────────────────────────│
            │                              │                         │
            │  ✓ VALID                     │                         │
            │  • Issuer: ACME Textiles GmbH                          │
            │  • Issued: 2026-01-07        │                         │
            │  • Not tampered              │                         │
            │  • Not revoked               │                         │
            │                              │                         │
```

### 4.2 Public Verification Endpoint

```bash
# Anyone can verify a DPP - no authentication required
curl https://api.eurocomply.eu/v1/passports/pass_abc123/verify
```

Response:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "credential": {
      "issuer": {
        "did": "did:web:api.eurocomply.eu:org:acme-corp",
        "name": "ACME Textiles GmbH",
        "country": "DE"
      },
      "issuanceDate": "2026-01-07T10:30:00Z",
      "product": {
        "name": "Sustainable T-Shirt",
        "gtin": "5901234123457"
      },
      "sustainability": {
        "carbonFootprint": {"value": 5.2, "unit": "kgCO2e"},
        "recyclability": {"percentage": 85}
      }
    },
    "verification": {
      "signatureValid": true,
      "issuerVerified": true,
      "notExpired": true,
      "notRevoked": true,
      "verifiedAt": "2026-01-07T15:42:00Z"
    }
  }
}
```

---

## 5. Why This Is Innovative (And Why It Matters for ESPR)

### 5.1 Regulatory Alignment

The ESPR regulation emphasizes **verifiable** sustainability claims. The EU Commission's DPP framework mentions:

> "Digital Product Passports should ensure data integrity and prevent unauthorized modifications"

Verifiable Credentials are the **only standardized way** to achieve this with cryptographic guarantees.

### 5.2 The "Greenwashing Defense"

**Scenario:** A company claims their product has a 5.2 kgCO2e carbon footprint. Two years later, an NGO accuses them of greenwashing.

| Traditional DPP | EuroComply VC-DPP |
|-----------------|-------------------|
| Company: "We said 5.2 at the time" | Company produces the VC |
| NGO: "Prove it" | VC has timestamp + signature |
| Company: "Here's our database record" | Signature proves data unchanged |
| NGO: "You could have edited that" | Cryptographic proof of original claim |
| **Result: He-said-she-said** | **Result: Mathematical proof** |

The VC serves as a **time-stamped, tamper-evident receipt** of what the company claimed.

### 5.3 Interoperability with EUDI Wallets

Under eIDAS 2.0, every EU citizen will have a digital wallet. These wallets use the **same VC standards** that EuroComply uses.

**Future possibility:** A consumer's EUDI wallet could:
1. Scan a product QR code
2. Store the DPP credential in their wallet
3. Verify it locally (even offline)
4. Aggregate their "sustainable purchases"

This interoperability is **only possible** because we use W3C VCs, not proprietary formats.

### 5.4 Supply Chain Trust

When Brand A buys components from Supplier B:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Supply Chain Credential Flow                      │
└─────────────────────────────────────────────────────────────────────┘

  Supplier B                      Brand A                    Consumer
      │                              │                           │
      │  1. Issues component DPP     │                           │
      │  (VC signed by Supplier B)   │                           │
      │─────────────────────────────►│                           │
      │                              │                           │
      │                              │  2. Creates product DPP   │
      │                              │  (includes Supplier B's VC│
      │                              │   as "evidence")          │
      │                              │                           │
      │                              │  3. Issues final DPP      │
      │                              │─────────────────────────►│
      │                              │                           │
      │                              │     Consumer can verify:  │
      │                              │     • Brand A's claims    │
      │                              │     • Supplier B's claims │
      │                              │     • Neither tampered    │
```

This creates a **verifiable chain of custody** for sustainability claims.

---

## 6. walt.id Integration Details

### 6.1 Services Used

| walt.id Service | EuroComply Usage |
|-----------------|------------------|
| **Core API** | DID creation, resolution, updates |
| **Signatory** | VC issuance (signing credentials) |
| **Custodian** | Key storage (private keys never leave) |
| **Auditor** | VC verification policies |

### 6.2 Key Management

Private keys are **never exposed** to application code:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Key Management Architecture                     │
└─────────────────────────────────────────────────────────────────────┘

  EuroComply API                walt.id Custodian              HSM (optional)
       │                              │                             │
       │  "Sign this VC with         │                             │
       │   key-id: key_abc123"       │                             │
       │─────────────────────────────►│                             │
       │                              │                             │
       │                              │  Retrieve private key       │
       │                              │  (or delegate to HSM)       │
       │                              │─────────────────────────────►│
       │                              │                             │
       │                              │  Sign data                  │
       │                              │◄─────────────────────────────│
       │                              │                             │
       │  Signed VC returned          │                             │
       │◄─────────────────────────────│                             │
       │                              │                             │
       │  (Private key never          │                             │
       │   leaves Custodian)          │                             │
```

### 6.3 Configuration

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
    method: 'web',  // 'web' now, 'ebsi' later
    domain: process.env.API_HOST || 'api.eurocomply.eu',
  },
  features: {
    ebsiAnchoring: false,  // Enable when EBSI access obtained
  },
};
```

---

## 7. Code Example: Issuing a DPP Credential

```typescript
import { getVcService, getDidService } from '@eurocomply/identity';

async function createVerifiableDPP(passport: Passport, organization: Organization) {
  const didService = getDidService();
  const vcService = getVcService();

  // 1. Get or create organization's DID
  let orgDid = organization.did;
  if (!orgDid) {
    const { did, keyId } = await didService.createDid({
      identifier: organization.slug,
    });
    orgDid = did;
    // Store DID and keyId in organization record
  }

  // 2. Build credential subject (the DPP data)
  const credentialSubject = {
    id: `urn:gtin:${passport.product.gtin}`,
    type: 'Product',
    name: passport.product.name,
    gtin: passport.product.gtin,
    manufacturer: {
      name: organization.name,
      country: organization.country,
      did: orgDid,
    },
    sustainability: passport.data.sustainability,
    compliance: {
      regulation: 'ESPR',
      category: passport.data.productCategory,
      declarationDate: new Date().toISOString(),
    },
  };

  // 3. Issue the Verifiable Credential
  const { vcJwt, credentialId } = await vcService.issueCredential({
    issuerDid: orgDid,
    issuerKeyId: organization.keyId,
    credentialType: 'DigitalProductPassport',
    credentialSubject,
    expiresIn: '10y', // 10 year validity
  });

  // 4. Store the VC JWT with the passport
  await prisma.passport.update({
    where: { id: passport.id },
    data: {
      vcJwt,
      credentialId,
      anchoredAt: new Date(),
    },
  });

  return { vcJwt, credentialId };
}
```

---

## 8. Future: EBSI Anchoring

When EuroComply achieves business traction, EBSI integration adds:

| Feature | did:web (Current) | did:ebsi (Future) |
|---------|-------------------|-------------------|
| **Trust Anchor** | EuroComply domain | EU Government blockchain |
| **Legal Status** | Industry standard | eIDAS 2.0 recognized |
| **Issuer Registry** | Self-attested | Listed in EU Trusted Issuers |
| **Verification** | Resolve via HTTPS | Resolve via EBSI network |

The architecture is **already EBSI-ready** - it's a configuration change, not a rewrite.

```typescript
// Switching to EBSI (future)
setConfig({
  did: {
    method: 'ebsi',  // Changed from 'web'
    ebsiEnvironment: 'production',
  },
  features: {
    ebsiAnchoring: true,
  },
});
```

---

## 9. Summary: Why This Matters

### For Manufacturers
- **Legal protection**: Cryptographic proof of what you claimed, when
- **Trust**: Verifiable claims differentiate from greenwashing competitors
- **Future-proof**: Aligned with EU digital identity direction

### For Regulators
- **Enforcement**: Can verify claims without trusting the company's database
- **Audit trail**: Immutable record of sustainability declarations
- **Standards**: Uses W3C/eIDAS standards, not proprietary formats

### For Consumers
- **Transparency**: Can independently verify claims
- **Interoperability**: Works with EUDI wallets (future)
- **Trust**: Mathematical proof, not marketing promises

---

## 10. References

- [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model/)
- [W3C Decentralized Identifiers (DIDs)](https://www.w3.org/TR/did-core/)
- [walt.id Documentation](https://docs.walt.id/)
- [ESPR Regulation](https://eur-lex.europa.eu/eli/reg/2024/1781)
- [eIDAS 2.0 Framework](https://digital-strategy.ec.europa.eu/en/policies/eidas-regulation)
