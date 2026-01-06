# EBSI Integration Plan for EuroComply
## European Blockchain Services Infrastructure via walt.id

---

## Table of Contents
1. [What is EBSI?](#1-what-is-ebsi)
2. [Why EBSI is the Only Choice for EuroComply](#2-why-ebsi-is-the-only-choice)
3. [walt.id: The Integration Layer](#3-waltid-the-integration-layer)
4. [EBSI Core Services We Will Use](#4-ebsi-core-services-we-will-use)
5. [Integration Architecture](#5-integration-architecture)
6. [ProductTrust API + EBSI](#6-producttrust-api--ebsi)
7. [WorkforceTrust API + EBSI](#7-workforcetrust-api--ebsi)
8. [MerchantTrust API + EBSI](#8-merchanttrust-api--ebsi)
9. [Technical Implementation](#9-technical-implementation)
10. [EBSI Conformance & Certification](#10-ebsi-conformance--certification)

---

## 1. What is EBSI?

### 1.1 Overview

The **European Blockchain Services Infrastructure (EBSI)** is the EU's official blockchain network, created by the European Commission and the European Blockchain Partnership (EBP). It is a **permissioned blockchain** operated by EU Member States, designed to deliver cross-border public services.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EBSI - EU's Official Blockchain                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   • Operated by 27 EU Member States + Norway, Liechtenstein        │
│   • Permissioned network (not public like Ethereum)                 │
│   • Designed for public services and regulatory compliance          │
│   • GDPR-compliant by design                                        │
│   • Production since 2023, mandatory integration by 2026            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 EBSI vs Public Blockchains

| Aspect | EBSI | Public Chains (Ethereum, Polygon) |
|--------|------|-----------------------------------|
| **Governance** | EU Member States | Decentralized community |
| **Legal Status** | Official EU infrastructure | No legal standing in EU law |
| **GDPR Compliance** | Built-in, by design | Problematic (immutable PII issues) |
| **eIDAS 2.0 Recognition** | Native integration | Not recognized |
| **Trust Anchors** | Government registries | Self-sovereign only |
| **Regulatory Acceptance** | Required for compliance | Not accepted for compliance |
| **Transaction Costs** | Free for participants | Gas fees apply |
| **Performance** | ~1000 TPS, 2s finality | Varies, often slower |

### 1.3 Why EBSI is Mandatory for Our Use Cases

**Legal Requirement**: Under eIDAS 2.0, Verifiable Credentials for organizational identity, diplomas, and professional qualifications MUST be anchored to EBSI's Trusted Registries to be legally recognized across the EU.

**ESPR Compliance**: The Digital Product Passport regulation specifies that DPP data must be accessible via "trusted registries" - EBSI is the designated infrastructure.

**Quote from EU Commission**:
> "EBSI will be the backbone for the European Digital Identity Wallet ecosystem, providing the trust anchors for cross-border verification of credentials."

---

## 2. Why EBSI is the Only Choice for EuroComply

### 2.1 Strategic Alignment

```
┌─────────────────────────────────────────────────────────────────────┐
│                 EuroComply's Regulatory Targets                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ESPR (Digital Product Passports)                                  │
│       └──► Requires trusted, verifiable product data                │
│       └──► EBSI provides immutable proof of sustainability claims   │
│                                                                     │
│   eIDAS 2.0 (Digital Identity)                                      │
│       └──► EUDI Wallets MUST interoperate with EBSI                │
│       └──► Organizational credentials anchored to EBSI              │
│                                                                     │
│   DSA (Trader Verification)                                         │
│       └──► KYB must link to official business registries           │
│       └──► EBSI connects to national registries                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Competitive Moat

By building exclusively on EBSI:

1. **Regulatory Certainty**: No risk of our blockchain layer becoming non-compliant
2. **Trust by Default**: "Anchored to EBSI" carries legal weight; "Anchored to Polygon" does not
3. **Interoperability**: Any EUDI Wallet can verify our credentials without custom integration
4. **Future-Proof**: As EU regulations tighten, EBSI compliance becomes mandatory
5. **No Gas Fees**: EBSI is free for registered participants, improving our unit economics

### 2.3 What Happens Without EBSI?

```
WITHOUT EBSI:
┌─────────────────────────────────────────────────────────────────────┐
│  SME creates DPP ──► Stored on private database ──► No legal proof │
│  SME issues credential ──► Not recognized by EUDI Wallets          │
│  SME verifies business ──► Cannot link to official registries      │
└─────────────────────────────────────────────────────────────────────┘

WITH EBSI:
┌─────────────────────────────────────────────────────────────────────┐
│  SME creates DPP ──► Hash anchored to EBSI ──► Legal proof ✓       │
│  SME issues credential ──► Verifiable by any EUDI Wallet ✓         │
│  SME verifies business ──► Links to BRIS/national registries ✓     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. walt.id: The Integration Layer

### 3.1 What is walt.id?

**walt.id** is an open-source identity infrastructure company providing the tooling to interact with EBSI. Instead of building our own cryptographic libraries and EBSI connectors, we leverage walt.id's battle-tested stack.

### 3.2 walt.id Product Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                      walt.id Product Suite                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐  │
│   │  walt.id        │   │  walt.id        │   │  walt.id        │  │
│   │  Identity       │   │  Credential     │   │  Wallet         │  │
│   │  (SSI Kit)      │   │  (VC Kit)       │   │  Kit            │  │
│   ├─────────────────┤   ├─────────────────┤   ├─────────────────┤  │
│   │ • DID Methods   │   │ • VC Issuance   │   │ • Wallet APIs   │  │
│   │ • Key Mgmt      │   │ • VC Verify     │   │ • Credential    │  │
│   │ • EBSI DID      │   │ • SD-JWT        │   │   Storage       │  │
│   │ • did:web       │   │ • JSON-LD       │   │ • OIDC Bridge   │  │
│   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘  │
│            │                     │                     │           │
│            └─────────────────────┼─────────────────────┘           │
│                                  │                                  │
│                                  ▼                                  │
│                    ┌─────────────────────────┐                     │
│                    │    EBSI Connector       │                     │
│                    │  • Trusted Registries   │                     │
│                    │  • DID Registration     │                     │
│                    │  • Credential Schemas   │                     │
│                    │  • Timestamping         │                     │
│                    └─────────────────────────┘                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Why walt.id Over Building Custom?

| Approach | Time to Market | Risk | Cost | EBSI Conformance |
|----------|---------------|------|------|------------------|
| Build Custom EBSI Integration | 12+ months | High | €500K+ | Uncertain |
| Use walt.id Stack | 2-3 months | Low | Open Source | Pre-certified |

**walt.id is already EBSI-conformant**, meaning credentials issued through their stack are automatically recognized by the EBSI ecosystem.

### 3.4 walt.id Licensing

- **Community Edition**: Open source (Apache 2.0) - sufficient for our needs
- **Enterprise Edition**: Additional features, SLAs, support

We will use the **Community Edition** initially, with option to upgrade for enterprise support.

---

## 4. EBSI Core Services We Will Use

### 4.1 EBSI Service Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EBSI Core Services                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  1. TRUSTED REGISTRIES                                      │  │
│   │     • Trusted Issuers Registry (TIR)                        │  │
│   │     • Trusted Schemas Registry (TSR)                        │  │
│   │     • Trusted Policies Registry (TPR)                       │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  2. DID REGISTRY                                            │  │
│   │     • did:ebsi method for legal entities                    │  │
│   │     • Links DIDs to official business registrations         │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  3. TIMESTAMPING & NOTARISATION                             │  │
│   │     • Immutable timestamps for documents/hashes             │  │
│   │     • Legal proof of existence at point in time             │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  4. VERIFIABLE CREDENTIALS INFRASTRUCTURE                   │  │
│   │     • OID4VCI (Issuance)                                    │  │
│   │     • OID4VP (Presentation/Verification)                    │  │
│   │     • SD-JWT support                                        │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Service Usage by EuroComply Module

| EBSI Service | ProductTrust | WorkforceTrust | MerchantTrust |
|--------------|--------------|----------------|---------------|
| Trusted Issuers Registry | ✓ (verify suppliers) | ✓ (verify employers) | ✓ (verify businesses) |
| Trusted Schemas Registry | ✓ (DPP schemas) | ✓ (credential schemas) | ✓ (KYB schemas) |
| DID Registry | ✓ (product DIDs) | ✓ (employee DIDs) | ✓ (business DIDs) |
| Timestamping | ✓ (anchor DPPs) | ✓ (credential issuance) | ✓ (verification records) |
| VC Infrastructure | - | ✓ (issue/verify creds) | ✓ (business credentials) |

---

## 5. Integration Architecture

### 5.1 EuroComply + walt.id + EBSI Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EuroComply Platform                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │ ProductTrust│    │WorkforceTrust│   │MerchantTrust│    │  Dashboard  │  │
│  │     API     │    │     API     │    │     API     │    │   (React)   │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │                  │         │
│         └──────────────────┼──────────────────┼──────────────────┘         │
│                            │                  │                            │
│                            ▼                  ▼                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     EBSI SERVICE LAYER                               │  │
│  │                   (EuroComply Abstraction)                           │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │                                                                      │  │
│  │   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │  │
│  │   │  DID Service   │  │ Credential Svc │  │ Timestamp Svc  │        │  │
│  │   │                │  │                │  │                │        │  │
│  │   │ • Create DID   │  │ • Issue VC     │  │ • Anchor Hash  │        │  │
│  │   │ • Resolve DID  │  │ • Verify VC    │  │ • Verify Time  │        │  │
│  │   │ • Update DID   │  │ • Revoke VC    │  │ • Get Proof    │        │  │
│  │   └───────┬────────┘  └───────┬────────┘  └───────┬────────┘        │  │
│  │           │                   │                   │                 │  │
│  └───────────┼───────────────────┼───────────────────┼─────────────────┘  │
│              │                   │                   │                    │
└──────────────┼───────────────────┼───────────────────┼────────────────────┘
               │                   │                   │
               ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           walt.id Stack                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐          │
│   │   SSI Kit       │   │   VC Kit        │   │  EBSI Connector │          │
│   │   (Identity)    │   │  (Credentials)  │   │   (Blockchain)  │          │
│   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘          │
│            │                     │                     │                    │
│            └─────────────────────┴─────────────────────┘                    │
│                                  │                                          │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EBSI Network                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│   │   Trusted   │  │    DID      │  │  Timestamp  │  │  Ledger     │       │
│   │  Registries │  │  Registry   │  │   Service   │  │  (Besu)     │       │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                                             │
│   Operated by EU Member States                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Data Flow: Credential Issuance

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Credential Issuance Flow (WorkforceTrust)                 │
└──────────────────────────────────────────────────────────────────────────────┘

 SME HR System          EuroComply API           walt.id            EBSI
      │                      │                     │                  │
      │  1. Issue Employee   │                     │                  │
      │     Credential       │                     │                  │
      │─────────────────────►│                     │                  │
      │                      │                     │                  │
      │                      │  2. Create VC       │                  │
      │                      │     (SD-JWT format) │                  │
      │                      │────────────────────►│                  │
      │                      │                     │                  │
      │                      │                     │  3. Register     │
      │                      │                     │     Credential   │
      │                      │                     │     Hash         │
      │                      │                     │─────────────────►│
      │                      │                     │                  │
      │                      │                     │  4. Timestamp    │
      │                      │                     │     + TxHash     │
      │                      │                     │◄─────────────────│
      │                      │                     │                  │
      │                      │  5. Signed VC       │                  │
      │                      │     + EBSI proof    │                  │
      │                      │◄────────────────────│                  │
      │                      │                     │                  │
      │  6. Return VC        │                     │                  │
      │     (ready for       │                     │                  │
      │      wallet)         │                     │                  │
      │◄─────────────────────│                     │                  │
      │                      │                     │                  │

The credential now contains:
• The actual claims (employee name, role, etc.)
• SD-JWT selective disclosure capability
• EBSI timestamp proof
• Issuer's DID (registered on EBSI)
• Can be verified by ANY EUDI Wallet
```

### 5.3 Data Flow: DPP Anchoring

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    DPP Anchoring Flow (ProductTrust)                         │
└──────────────────────────────────────────────────────────────────────────────┘

 SME Product Data       EuroComply API           walt.id            EBSI
      │                      │                     │                  │
      │  1. Create DPP       │                     │                  │
      │     (product data)   │                     │                  │
      │─────────────────────►│                     │                  │
      │                      │                     │                  │
      │                      │  2. Generate        │                  │
      │                      │     Content Hash    │                  │
      │                      │     (SHA-256)       │                  │
      │                      │                     │                  │
      │                      │  3. Request         │                  │
      │                      │     Timestamp       │                  │
      │                      │────────────────────►│                  │
      │                      │                     │                  │
      │                      │                     │  4. Anchor Hash  │
      │                      │                     │     to Ledger    │
      │                      │                     │─────────────────►│
      │                      │                     │                  │
      │                      │                     │  5. Return       │
      │                      │                     │     Timestamp    │
      │                      │                     │     Proof        │
      │                      │                     │◄─────────────────│
      │                      │                     │                  │
      │                      │  6. Proof Object    │                  │
      │                      │◄────────────────────│                  │
      │                      │                     │                  │
      │  7. DPP + GS1 QR     │                     │                  │
      │     + EBSI proof     │                     │                  │
      │◄─────────────────────│                     │                  │
      │                      │                     │                  │

The DPP now contains:
• Product sustainability data
• GS1 Digital Link QR code
• EBSI timestamp proof (immutable)
• Verifiable by regulators/consumers
```

---

## 6. ProductTrust API + EBSI

### 6.1 Use Cases

| Feature | EBSI Component | Purpose |
|---------|----------------|---------|
| DPP Creation | Timestamping | Immutable proof of when DPP was created |
| Sustainability Claims | Timestamping | Prove "100% recycled" claim existed at time X |
| Supplier Verification | Trusted Issuers | Verify supplier is legitimate business |
| Product Authentication | DID Registry | Unique DID per product/batch |
| Unsold Goods Reports | Timestamping | Immutable audit trail for ESPR compliance |

### 6.2 Implementation Details

```typescript
// ProductTrust Service - EBSI Integration

interface DPPAnchorResult {
  dppId: string;
  contentHash: string;
  ebsiTimestamp: {
    transactionHash: string;
    blockNumber: number;
    timestamp: Date;
    proof: string;  // Base64 encoded EBSI proof
  };
  gs1DigitalLink: string;
  qrCodeUrl: string;
}

class ProductTrustService {

  // Anchor DPP to EBSI
  async anchorDPP(dppId: string): Promise<DPPAnchorResult> {
    // 1. Get DPP data
    const dpp = await this.getDPP(dppId);

    // 2. Generate deterministic hash
    const contentHash = this.generateContentHash(dpp);

    // 3. Anchor to EBSI via walt.id
    const ebsiProof = await this.ebsiService.timestamp({
      hash: contentHash,
      metadata: {
        type: 'DigitalProductPassport',
        gtin: dpp.gtin,
        issuer: dpp.organizationDid
      }
    });

    // 4. Store proof and return
    await this.storeAnchorProof(dppId, ebsiProof);

    return {
      dppId,
      contentHash,
      ebsiTimestamp: ebsiProof,
      gs1DigitalLink: this.generateGS1Link(dpp),
      qrCodeUrl: await this.generateQRCode(dpp)
    };
  }

  // Verify DPP hasn't been tampered with
  async verifyDPP(dppId: string): Promise<VerificationResult> {
    const dpp = await this.getDPP(dppId);
    const currentHash = this.generateContentHash(dpp);
    const storedProof = await this.getAnchorProof(dppId);

    // Verify against EBSI
    const isValid = await this.ebsiService.verifyTimestamp({
      hash: currentHash,
      proof: storedProof.ebsiTimestamp.proof
    });

    return {
      isValid,
      anchoredAt: storedProof.ebsiTimestamp.timestamp,
      tampered: currentHash !== storedProof.contentHash
    };
  }
}
```

### 6.3 GS1 Digital Link + EBSI

The QR code resolves to a URL that returns both product data AND EBSI verification:

```
https://dpp.eurocomply.io/01/09506000134352/21/ABC123
                         │        │              │
                         │        │              └── Serial number
                         │        └── GTIN
                         └── GS1 Application Identifier

Response includes:
{
  "product": { ... DPP data ... },
  "verification": {
    "ebsiProof": "...",
    "anchoredAt": "2026-01-15T10:30:00Z",
    "verificationUrl": "https://ebsi.eu/verify/..."
  }
}
```

---

## 7. WorkforceTrust API + EBSI

### 7.1 Use Cases

| Feature | EBSI Component | Purpose |
|---------|----------------|---------|
| Employee Credentials | VC Infrastructure | Issue EUDI-compatible work credentials |
| Diploma Verification | Trusted Issuers | Verify university is legitimate issuer |
| Background Checks | Timestamping | Immutable record of check completion |
| Professional Licenses | VC Infrastructure | Verify professional qualifications |
| Contractor Verification | DID Registry | Verify contractor's business DID |

### 7.2 Credential Types

```typescript
// Credential schemas registered on EBSI TSR (Trusted Schemas Registry)

const EUROCOMPLY_CREDENTIAL_SCHEMAS = {

  // Employee credential - proves someone works for a company
  employeeCredential: {
    schemaId: 'https://eurocomply.io/schemas/employee/v1',
    ebsiSchemaId: 'did:ebsi:z...',  // Registered on EBSI TSR
    claims: {
      employeeId: 'string',
      organizationName: 'string',
      organizationDid: 'did:ebsi:...',
      role: 'string',
      department: 'string',
      startDate: 'date',
      employmentType: 'full-time | part-time | contractor'
    }
  },

  // Contractor credential - for B2B workforce
  contractorCredential: {
    schemaId: 'https://eurocomply.io/schemas/contractor/v1',
    claims: {
      contractorDid: 'did:ebsi:...',
      clientOrganizationDid: 'did:ebsi:...',
      projectName: 'string',
      clearanceLevel: 'string',
      validUntil: 'date'
    }
  },

  // Background check attestation
  backgroundCheckCredential: {
    schemaId: 'https://eurocomply.io/schemas/background-check/v1',
    claims: {
      checkType: 'criminal | credit | employment | education',
      result: 'clear | flagged',
      performedBy: 'did:ebsi:...',  // Accredited checker's DID
      performedAt: 'datetime',
      validUntil: 'date'
    }
  }
};
```

### 7.3 SD-JWT Selective Disclosure

SD-JWT allows the credential holder to reveal only necessary claims:

```typescript
// Example: Verifying someone is an employee without revealing their exact role

// Full credential (stored in wallet):
{
  "vc": {
    "credentialSubject": {
      "employeeId": "EMP-12345",
      "organizationName": "TechCorp GmbH",
      "role": "Senior Engineer",
      "department": "R&D",
      "startDate": "2023-01-15",
      "salary": "€85,000"  // Sensitive!
    }
  },
  "_sd": ["employeeId", "role", "department", "salary"]  // Selectively disclosable
}

// Presentation (employee chooses to reveal):
{
  "disclosed": {
    "organizationName": "TechCorp GmbH",  // Always visible
    "startDate": "2023-01-15"             // Always visible
  },
  "hidden": ["employeeId", "role", "department", "salary"],  // Not revealed
  "proof": "..."  // Still cryptographically valid!
}

// Verifier can confirm:
// ✓ Person works at TechCorp GmbH
// ✓ Started in 2023
// ✓ Credential is valid and anchored to EBSI
// ✗ Cannot see role, department, or salary
```

### 7.4 EUDI Wallet Integration

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    EUDI Wallet Credential Flow                               │
└──────────────────────────────────────────────────────────────────────────────┘

     Employee              SME (via EuroComply)         Employee's EUDI Wallet
         │                        │                              │
         │  1. "Issue my          │                              │
         │     work credential"   │                              │
         │───────────────────────►│                              │
         │                        │                              │
         │                        │  2. Generate OID4VCI         │
         │                        │     credential offer         │
         │                        │                              │
         │  3. QR Code / Deep Link│                              │
         │◄───────────────────────│                              │
         │                        │                              │
         │  4. Scan with          │                              │
         │     EUDI Wallet        │                              │
         │────────────────────────┼─────────────────────────────►│
         │                        │                              │
         │                        │  5. Wallet requests          │
         │                        │     credential via OID4VCI   │
         │                        │◄─────────────────────────────│
         │                        │                              │
         │                        │  6. Issue SD-JWT VC          │
         │                        │     (anchored to EBSI)       │
         │                        │─────────────────────────────►│
         │                        │                              │
         │                        │                              │  7. Credential
         │                        │                              │     stored in
         │                        │                              │     wallet
         │                        │                              │

Employee can now:
• Present credential to any verifier
• Selectively disclose only needed claims
• Prove employment without paperwork
• Credential works across all EU countries
```

---

## 8. MerchantTrust API + EBSI

### 8.1 Use Cases

| Feature | EBSI Component | Purpose |
|---------|----------------|---------|
| KYB Verification | DID Registry | Verify business DID links to real registration |
| Business Registry Check | Trusted Issuers | Query national registries via EBSI |
| DSA Trader Onboarding | VC Infrastructure | Issue trader compliance credentials |
| Sanctions Screening | Timestamping | Immutable proof of screening |
| UBO Verification | Trusted Issuers | Verify beneficial ownership |

### 8.2 Business DID Resolution

EBSI's DID Registry links DIDs to official business registrations:

```typescript
// Resolving a business DID

const businessDid = 'did:ebsi:zf5R4Gy7hNp2Q3...';

const resolution = await ebsiService.resolveDid(businessDid);

// Returns:
{
  "did": "did:ebsi:zf5R4Gy7hNp2Q3...",
  "verificationMethod": [...],
  "service": [
    {
      "type": "BusinessRegistration",
      "serviceEndpoint": {
        "registrationNumber": "HRB 12345",
        "country": "DE",
        "registry": "Handelsregister",
        "registryUrl": "https://www.handelsregister.de/..."
      }
    }
  ],
  "linkedRegistrations": [
    {
      "type": "LEI",  // Legal Entity Identifier
      "value": "5493001KJTIIGC8Y1R12"
    },
    {
      "type": "VAT",
      "value": "DE123456789"
    }
  ]
}

// This proves the DID belongs to a real, registered business
```

### 8.3 DSA Trader Compliance Credential

When a trader passes KYB, they receive a credential for marketplace onboarding:

```typescript
const traderComplianceCredential = {
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiableCredential", "DSATraderComplianceCredential"],
  "issuer": "did:ebsi:eurocomply...",  // EuroComply's EBSI DID
  "issuanceDate": "2026-01-15T10:00:00Z",
  "credentialSubject": {
    "id": "did:ebsi:trader123...",
    "legalName": "Acme Trading GmbH",
    "registrationNumber": "HRB 98765",
    "country": "DE",
    "dsaCompliance": {
      "identityVerified": true,
      "bankAccountVerified": true,
      "addressVerified": true,
      "sanctionsCleared": true,
      "verificationDate": "2026-01-15",
      "validUntil": "2027-01-15"
    }
  },
  "proof": {
    "type": "EcdsaSecp256k1Signature2019",
    "created": "2026-01-15T10:00:00Z",
    "proofPurpose": "assertionMethod",
    "verificationMethod": "did:ebsi:eurocomply...#key-1",
    "jws": "..."
  }
};

// Marketplaces can verify this credential instantly
// No need to repeat full KYB process
```

### 8.4 Marketplace Integration Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Marketplace Trader Onboarding with EBSI                   │
└──────────────────────────────────────────────────────────────────────────────┘

    Trader           EuroComply         Marketplace        EBSI
       │                 │                   │               │
       │  1. Complete    │                   │               │
       │     KYB         │                   │               │
       │────────────────►│                   │               │
       │                 │                   │               │
       │                 │  2. Verify via    │               │
       │                 │     registries    │               │
       │                 │──────────────────────────────────►│
       │                 │                   │               │
       │                 │  3. Issue DSA     │               │
       │                 │     Compliance    │               │
       │                 │     Credential    │               │
       │◄────────────────│                   │               │
       │                 │                   │               │
       │  4. Apply to    │                   │               │
       │     marketplace │                   │               │
       │─────────────────┼──────────────────►│               │
       │                 │                   │               │
       │                 │  5. Verify        │               │
       │                 │     credential    │               │
       │                 │◄──────────────────│               │
       │                 │                   │               │
       │                 │  6. Confirm       │               │
       │                 │     validity      │               │
       │                 │     via EBSI      │               │
       │                 │──────────────────────────────────►│
       │                 │                   │               │
       │                 │  7. Valid ✓       │               │
       │                 │◄──────────────────────────────────│
       │                 │                   │               │
       │                 │  8. Approved      │               │
       │                 │──────────────────►│               │
       │                 │                   │               │
       │  9. Onboarded   │                   │               │
       │◄────────────────┼───────────────────│               │
       │                 │                   │               │

Benefits:
• Trader does KYB once, uses credential on multiple marketplaces
• Marketplace has legal proof of DSA compliance
• Verification is instant (no manual document review)
• Audit trail anchored to EBSI
```

---

## 9. Technical Implementation

### 9.1 walt.id Integration Code

```typescript
// src/integrations/waltid/client.ts

import { WaltIdClient } from '@waltid/sdk';

export class EBSIService {
  private client: WaltIdClient;

  constructor() {
    this.client = new WaltIdClient({
      // Connect to EBSI via walt.id
      network: 'ebsi',
      environment: process.env.EBSI_ENV || 'conformance', // 'conformance' | 'production'
    });
  }

  // ----- DID Operations -----

  async createOrganizationDid(orgData: OrganizationData): Promise<string> {
    // Create did:ebsi for the organization
    const did = await this.client.did.create({
      method: 'ebsi',
      options: {
        // Link to business registration
        legalEntityIdentifier: orgData.lei,
        vatNumber: orgData.vatId,
        countryCode: orgData.country
      }
    });

    return did.id;
  }

  async resolveDid(did: string): Promise<DIDDocument> {
    return await this.client.did.resolve(did);
  }

  // ----- Credential Operations -----

  async issueCredential(params: IssueCredentialParams): Promise<VerifiableCredential> {
    // Create credential using walt.id
    const credential = await this.client.credentials.issue({
      issuerDid: params.issuerDid,
      subjectDid: params.subjectDid,
      type: params.credentialType,
      claims: params.claims,
      format: 'sd-jwt',  // Selective disclosure
      anchor: true       // Anchor to EBSI
    });

    return credential;
  }

  async verifyCredential(credential: string): Promise<VerificationResult> {
    return await this.client.credentials.verify({
      credential,
      policies: [
        'signature',      // Check cryptographic signature
        'notExpired',     // Check expiration
        'notRevoked',     // Check revocation status
        'trustedIssuer'   // Check issuer is in EBSI TIR
      ]
    });
  }

  // ----- Timestamping Operations -----

  async timestamp(data: TimestampData): Promise<TimestampProof> {
    // Anchor hash to EBSI ledger
    const hash = this.computeHash(data.content);

    const proof = await this.client.timestamp.create({
      hash,
      metadata: data.metadata
    });

    return {
      hash,
      transactionHash: proof.transactionHash,
      blockNumber: proof.blockNumber,
      timestamp: proof.timestamp,
      proof: proof.proof
    };
  }

  async verifyTimestamp(hash: string, proof: string): Promise<boolean> {
    return await this.client.timestamp.verify({ hash, proof });
  }

  // ----- Registry Operations -----

  async checkTrustedIssuer(did: string): Promise<TrustedIssuerInfo> {
    // Check if DID is in EBSI Trusted Issuers Registry
    return await this.client.registry.getTrustedIssuer(did);
  }

  async registerSchema(schema: CredentialSchema): Promise<string> {
    // Register credential schema on EBSI TSR
    return await this.client.registry.registerSchema(schema);
  }

  private computeHash(content: any): string {
    const canonical = JSON.stringify(content, Object.keys(content).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }
}
```

### 9.2 Environment Configuration

```typescript
// src/config/ebsi.config.ts

export const ebsiConfig = {
  // EBSI Network
  network: process.env.EBSI_NETWORK || 'conformance',

  // walt.id Configuration
  waltid: {
    apiUrl: process.env.WALTID_API_URL || 'https://api.walt.id',
    apiKey: process.env.WALTID_API_KEY,
  },

  // EuroComply's EBSI Identity
  eurocomply: {
    did: process.env.EUROCOMPLY_DID,
    keyId: process.env.EUROCOMPLY_KEY_ID,
  },

  // Credential Schemas (registered on EBSI TSR)
  schemas: {
    employee: process.env.SCHEMA_EMPLOYEE_ID,
    contractor: process.env.SCHEMA_CONTRACTOR_ID,
    backgroundCheck: process.env.SCHEMA_BACKGROUND_CHECK_ID,
    dsaTrader: process.env.SCHEMA_DSA_TRADER_ID,
    dpp: process.env.SCHEMA_DPP_ID,
  },

  // Rate limits for EBSI calls
  rateLimits: {
    timestampPerMinute: 100,
    credentialIssuePerMinute: 50,
    didResolvePerMinute: 200,
  }
};
```

### 9.3 Database Schema for EBSI Data

```prisma
// prisma/schema.prisma

// Store EBSI-related data

model EbsiDid {
  id              String   @id @default(uuid())
  did             String   @unique
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])

  // DID Document cache
  didDocument     Json

  // Registration details
  registeredAt    DateTime
  lastResolved    DateTime

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model EbsiTimestamp {
  id              String   @id @default(uuid())

  // What was timestamped
  entityType      String   // 'dpp', 'credential', 'kyb_check'
  entityId        String

  // Hash details
  contentHash     String

  // EBSI proof
  transactionHash String
  blockNumber     Int
  timestamp       DateTime
  proof           String   // Base64 encoded proof

  // Verification cache
  lastVerified    DateTime?
  isValid         Boolean  @default(true)

  createdAt       DateTime @default(now())

  @@index([entityType, entityId])
  @@index([contentHash])
}

model IssuedCredential {
  id              String   @id @default(uuid())

  // Credential metadata
  credentialType  String
  schemaId        String

  // Parties
  issuerDid       String
  subjectDid      String

  // Credential content (encrypted)
  credentialJwt   String

  // EBSI anchoring
  ebsiTimestampId String?
  ebsiTimestamp   EbsiTimestamp? @relation(fields: [ebsiTimestampId], references: [id])

  // Status
  status          CredentialStatus @default(ACTIVE)
  revokedAt       DateTime?
  revokedReason   String?

  // Validity
  issuedAt        DateTime
  expiresAt       DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([issuerDid])
  @@index([subjectDid])
  @@index([status])
}

enum CredentialStatus {
  ACTIVE
  REVOKED
  EXPIRED
  SUSPENDED
}
```

---

## 10. EBSI Conformance & Certification

### 10.1 Conformance Testing

Before production, EuroComply must pass EBSI conformance testing:

```
┌─────────────────────────────────────────────────────────────────────┐
│                 EBSI Conformance Requirements                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   1. DID Conformance                                                │
│      • Create, resolve, update did:ebsi                             │
│      • Key management compliance                                    │
│                                                                     │
│   2. Verifiable Credentials Conformance                             │
│      • Issue credentials per EBSI specs                             │
│      • Support OID4VCI protocol                                     │
│      • Support OID4VP protocol                                      │
│                                                                     │
│   3. Trust Registry Conformance                                     │
│      • Query Trusted Issuers Registry                               │
│      • Register schemas on TSR                                      │
│                                                                     │
│   4. Timestamping Conformance                                       │
│      • Anchor hashes correctly                                      │
│      • Verify timestamps                                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 Path to Production

```
Phase 1: Development (Now)
├── Use EBSI Conformance environment
├── Test all integrations
└── No real legal standing

Phase 2: Conformance Testing (Month 3)
├── Submit to EBSI conformance suite
├── Fix any issues
└── Obtain conformance badge

Phase 3: Pilot Network (Month 6)
├── Connect to EBSI Pilot
├── Real DIDs, limited scale
└── Partner with pilot participants

Phase 4: Production (Month 9+)
├── Full EBSI production access
├── Legal validity of credentials
└── Credentials accepted EU-wide
```

### 10.3 QTSP Certification (Future)

For maximum legal standing, EuroComply can pursue **Qualified Trust Service Provider (QTSP)** status under eIDAS:

- Credentials gain **legal equivalence to paper documents**
- Listed on EU Trusted Lists
- Higher trust with enterprise customers
- Requires audit and certification (€50-100K investment)

**Recommendation**: Start with standard EBSI conformance, pursue QTSP in Year 2 based on enterprise demand.

---

## Summary

EuroComply's exclusive use of EBSI via walt.id provides:

1. **Legal Certainty**: Only EBSI-anchored credentials are recognized under eIDAS 2.0
2. **Interoperability**: Works with all EUDI Wallets across EU
3. **Trust by Default**: EU government infrastructure, not speculative blockchain
4. **Cost Efficiency**: No gas fees, walt.id open source
5. **Future-Proof**: Aligned with EU regulatory direction
6. **Competitive Moat**: "EBSI Certified" becomes marketing differentiator

This architecture positions EuroComply as the definitive compliance infrastructure for the European Single Market.
