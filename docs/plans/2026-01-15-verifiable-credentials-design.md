# Verifiable Credentials Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** VERIFIABLE_CREDENTIALS.md + clarification session

---

## 1. Overview

EuroComply issues Digital Product Passports as **W3C Verifiable Credentials** with **did:key** identifiers, making them portable, tamper-evident, and independent of any platform.

### Why VCs Instead of Database Lookups

| Aspect | Traditional DPP | EuroComply VC-DPP |
|--------|-----------------|-------------------|
| **Tamper Evidence** | None - data can be silently changed | Cryptographic - any change breaks signature |
| **Trust Model** | Trust the database operator | Trust math (cryptographic verification) |
| **Verification** | Requires server connection | Signature offline, revocation online |
| **Portability** | Locked to platform | Supplier owns, can move anywhere |
| **Platform Dependency** | Dies with platform | Signature works forever |

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Self-contained** | VC contains ALL DPP data, not references |
| **Portable identity** | did:key - supplier owns their identity |
| **Tamper-evident** | Ed25519 signatures break if data changes |
| **Offline verification** | Signature verification needs no network |
| **Revocation support** | Status List 2021 for invalidating VCs |

---

## 2. Why did:key

### The Problem with did:web

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
└─────────────────────────────────────────────────────────────────┘
```

### did:key = Permanent Identity

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE KEY IS THE IDENTITY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  The key IS the organization's trust anchor.                    │
│  Verifiers learn: "did:key:z6Mk... = ACME Corp"                │
│                                                                  │
│  Changing the key = NEW identity = trust relationship broken    │
│                                                                  │
│  THERE IS NO KEY ROTATION FOR did:key                          │
│  ─────────────────────────────────────                          │
│  • Proactive rotation destroys value, not adds security         │
│  • Ed25519 has no known time-based weaknesses                  │
│  • If key is compromised: revoke all VCs, get NEW identity     │
│                                                                  │
│  KEEP YOUR KEY FOREVER (unless compromised)                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. DID Hierarchy

### Organization vs User DIDs

```
┌─────────────────────────────────────────────────────────────────┐
│                        DID HIERARCHY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ORGANIZATION DID (did:key:zOrg...)                             │
│  └── Purpose: Issue DPPs (external, public-facing)              │
│  └── Stored: walt.id Custodian (org-level key)                  │
│  └── Signs: DigitalProductPassport VCs                          │
│                                                                  │
│  USER DIDs (did:key:zUser...)                                   │
│  └── Purpose: Sign product versions (internal chain of custody) │
│  └── Stored: walt.id Custodian (per-user keys)                  │
│  └── Signs: ProductVersion snapshots on approval/publish        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What Gets Signed

| Entity | Signed By | DID Type | When |
|--------|-----------|----------|------|
| ProductVersion | User (Editor/Manager) | User DID | On publish/approve |
| DigitalProductPassport | Organization | Org DID | On DPP issuance |
| Attestation | Third-party Contributor | Contributor DID | On attestation submit |

---

## 4. VC Structure

### DPP as Verifiable Credential

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
      "carbonFootprint": { "value": 5.2, "unit": "kgCO2e" },
      "recyclability": { "percentage": 85 },
      "materials": [
        { "name": "Organic Cotton", "percentage": 95 }
      ]
    }
  },

  "credentialStatus": {
    "id": "https://api.eurocomply.eu/v1/status/sl_abc123#42",
    "type": "StatusList2021Entry",
    "statusPurpose": "revocation",
    "statusListIndex": "42",
    "statusListCredential": "https://api.eurocomply.eu/v1/status/sl_abc123"
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

### Self-Contained Design

The VC contains **ALL the DPP data** - not references to external databases:

| Component | What It Contains |
|-----------|------------------|
| `credentialSubject` | ALL product data (materials, certifications, carbon footprint) |
| `issuer` | Organization's did:key (public key embedded) |
| `proof` | Cryptographic signature |
| `credentialStatus` | Reference to Status List for revocation |

This means:
- The VC IS the DPP (not a pointer)
- Signature can be verified anywhere, offline
- Supplier truly OWNS their data

---

## 5. Status List 2021 (Revocation)

### Why Revocation

VCs verify offline forever. But what if:
- Product is recalled?
- Certification expires?
- Data error discovered?
- Key is compromised?

**Status List 2021** allows invalidating VCs without breaking cryptographic integrity.

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    STATUS LIST 2021                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Each VC gets a unique index in a bitstring:                    │
│                                                                  │
│  Status List: [0, 0, 0, 0, 0, ...]                              │
│                ↑  ↑  ↑                                          │
│                │  │  └── VC 3: valid (bit = 0)                  │
│                │  └───── VC 2: valid (bit = 0)                  │
│                └──────── VC 1: valid (bit = 0)                  │
│                                                                  │
│  To revoke VC 2, set bit to 1:                                  │
│                                                                  │
│  Status List: [0, 1, 0, 0, 0, ...]                              │
│                   ↑                                              │
│                   └── VC 2: REVOKED                             │
│                                                                  │
│  VERIFICATION:                                                   │
│  1. Verify signature (offline)                                  │
│  2. Fetch status list (requires network)                        │
│  3. Check bit at statusListIndex                                │
│  4. If bit = 1, credential is revoked                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Status List Hosting

| Scenario | Status List | Who Updates |
|----------|-------------|-------------|
| Active subscription | EuroComply hosts | EuroComply |
| After cancellation | EuroComply hosts (frozen) | No updates (10-year hosting included) |
| Self-managed | Customer's domain | Customer |

**After subscription ends:**
- Status list remains hosted for 10 years (cost included in DPP price)
- List is frozen (no new revocations possible)
- Existing revocations preserved
- Customer can export and self-host for full control

---

## 6. Key Protection

Since the key is permanent, **protect it well**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEY PROTECTION                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STORAGE:                                                       │
│  • walt.id Custodian (server-side key management)              │
│  • Encrypted at rest                                            │
│  • AWS KMS backup for disaster recovery                        │
│                                                                  │
│  ACCESS:                                                        │
│  • Signing requires MANAGER authority in Compliance workspace  │
│  • All signing operations logged to audit trail                │
│                                                                  │
│  BACKUP:                                                        │
│  • Encrypted backup in separate region                         │
│  • Recovery requires multi-party authorization                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Compromise Response

If the private key is compromised, you **must** get a new identity:

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEY COMPROMISE RESPONSE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIMELINE:                                                      │
│  ─────────                                                      │
│  < 15 min: Disable compromised key, trigger alert              │
│  < 30 min: Bulk-revoke all VCs signed with old key            │
│  < 2 hours: Generate new keypair (new did:key)                 │
│  < 24 hours: Re-issue all affected DPPs with new key          │
│                                                                  │
│  PROCESS:                                                       │
│  1. REVOKE - Set all bits in status list                       │
│  2. NEW KEY - Generate new Ed25519 keypair                     │
│  3. RE-ISSUE - Bulk re-issue all affected DPPs                 │
│  4. NOTIFY - Alert supply chain partners of new DID            │
│                                                                  │
│  Note: This is the ONLY reason to get a new key                │
│  (other than algorithm obsolescence decades away)              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Verification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    VERIFICATION FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: SIGNATURE VERIFICATION (offline)                       │
│  ─────────────────────────────────────────                      │
│  • Parse did:key from issuer field                             │
│  • Extract public key (embedded in did:key)                    │
│  • Verify Ed25519 signature                                    │
│  • Result: Signature valid/invalid                             │
│                                                                  │
│  Step 2: REVOCATION CHECK (requires network)                   │
│  ──────────────────────────────────────────                    │
│  • Fetch status list from credentialStatus URL                 │
│  • Check bit at statusListIndex                                │
│  • Result: Valid / Revoked                                     │
│                                                                  │
│  VERIFICATION SCENARIOS:                                        │
│  ──────────────────────                                        │
│  | Signature | Status List | Result         |                  │
│  |-----------|-------------|----------------|                  │
│  | Valid     | Bit = 0     | VALID          |                  │
│  | Valid     | Bit = 1     | REVOKED        |                  │
│  | Valid     | Unavailable | SIGNATURE OK*  |                  │
│  | Invalid   | Any         | INVALID        |                  │
│                                                                  │
│  *Verifier decides policy for unavailable status list          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. walt.id Integration

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      EuroComply Platform                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────┐              ┌─────────────────────┐      │
│   │  Supplier API   │ ──────────►  │  packages/identity  │      │
│   │                 │              │  (walt.id wrapper)  │      │
│   │ POST /dpp       │              │                     │      │
│   │ GET /export     │              │ • DidKeyService     │      │
│   │ GET /verify     │              │ • VcService         │      │
│   └─────────────────┘              │ • KeyService        │      │
│                                    └──────────┬──────────┘      │
│                                               │                  │
└───────────────────────────────────────────────┼──────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    walt.id Community Stack                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│   │ Core API  │  │ Signatory │  │ Custodian │  │  Auditor  │   │
│   │ (DID ops) │  │ (issue)   │  │ (keys)    │  │ (verify)  │   │
│   │   :7000   │  │   :7001   │  │   :7002   │  │   :7003   │   │
│   └───────────┘  └───────────┘  └───────────┘  └───────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Wallet Abstraction (EUDI-Ready)

```typescript
interface WalletProvider {
  getDid(): Promise<string>;
  sign(payload: SignablePayload): Promise<SignedResult>;
  storeCredential(vc: VerifiableCredential): Promise<void>;
  getCredentials(filter?: CredentialFilter): Promise<VerifiableCredential[]>;
}

// Same code works for all wallet types
const wallet = await WalletFactory.getProvider(user.walletType);
const signed = await wallet.sign(data);
```

| Wallet Type | Status | Use Case |
|-------------|--------|----------|
| **MANAGED** | Current | Default, server-side via walt.id |
| **EUDI** | Future | EU Digital Identity Wallet |
| **EXTERNAL** | Future | Self-sovereign, user-controlled |

> See [EUDI Wallet Integration Design](./2026-01-15-eudi-wallet-integration-design.md) for consumer wallet flows.

---

## 10. Export & Portability

### One-Click Export Package

```
dpp-export-{org-id}.zip
├── credentials/
│   ├── dpp-001.vc.json     (signed VC with ALL data)
│   ├── dpp-002.vc.json
│   └── ...
├── identity/
│   ├── did.json            (DID document)
│   └── private-key.jwk     (for future signing)
├── status-list/
│   └── status-list.vc.json (current revocation state)
├── images/
│   └── ...
├── viewer.html             (offline viewer)
└── manifest.json           (GTIN → VC mapping)
```

### What Organizations Can Do After Export

| Action | Description |
|--------|-------------|
| **Self-host** | Put VCs on their own server |
| **Use another provider** | Import into any VC-compatible platform |
| **Continue signing** | Use exported private key to issue new VCs |
| **Manage revocations** | Host their own status list |

---

## 11. Changes from Original Document

| Aspect | Original | Design Decision |
|--------|----------|-----------------|
| **Key rotation** | "Annual best practice" option | Removed - contradicts did:key philosophy |
| **Compliance Archive** | €99/year dormant tier | Removed - 10-year hosting in DPP price |
| **Status list after cancel** | Unclear | Frozen but hosted for 10 years |

---

## 12. Related Documents

| Document | Purpose |
|----------|---------|
| [Architecture Design](./2026-01-15-architecture-design.md) | System architecture |
| [User Management Design](./2026-01-15-user-management-design.md) | DIDs per user, signing authorities |
| [EUDI Wallet Integration](./2026-01-15-eudi-wallet-integration-design.md) | Consumer wallet flows |
| [Business Model Design](./2026-01-15-business-model-design.md) | DPP pricing (includes 10-year hosting) |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from VERIFIABLE_CREDENTIALS.md review |

