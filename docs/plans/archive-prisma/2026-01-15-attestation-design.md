# Multi-Party Attestation Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** MULTI_PARTY_ATTESTATION.md

---

## 1. Overview

Multi-Party Attestation enables third parties (manufacturers, certifiers, labs, suppliers) to contribute product data with cryptographic signatures. Each attestation becomes a Verifiable Credential linked to the product's DPP.

### Key Principles

| Principle | Description |
|-----------|-------------|
| **Any field attestable** | Not limited to certifications |
| **Linked VCs** | Each attestation is its own VC, referenced by DPP |
| **Full traceability** | Every data point shows who attested it |
| **Customer responsibility** | Customer trusts their contributors |
| **Cross-workspace** | Available in all four workspaces |

---

## 2. Attestation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ATTESTATION WORKFLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. REQUEST                                                     │
│     Customer creates request from any workspace                 │
│     Email sent to contributor with unique link                  │
│                                                                  │
│  2. ONBOARD                                                     │
│     Contributor signs up (if new)                              │
│     Gets their own did:key for signing                         │
│                                                                  │
│  3. CONTRIBUTE                                                  │
│     Contributor fills requested data                           │
│     Signs with their DID                                       │
│                                                                  │
│  4. REVIEW                                                      │
│     Customer reviews in requesting workspace                   │
│     Approves or rejects                                        │
│                                                                  │
│  5. STORE                                                       │
│     Approved attestation stored in Hub                         │
│     Visible across all workspaces                              │
│                                                                  │
│  6. INCLUDE IN DPP                                              │
│     When DPP issued, attestation VCs linked                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Linked VC Model

```
┌────────────────────────┐
│      DPP (VC)          │
│  issuer: Customer      │
│                        │
│  attestations: [       │──────┬──────────┬──────────┐
│  ]                     │      │          │          │
└────────────────────────┘      ▼          ▼          ▼
                         ┌───────────┐ ┌───────────┐ ┌───────────┐
                         │ Attest 1  │ │ Attest 2  │ │ Attest 3  │
                         │   (VC)    │ │   (VC)    │ │   (VC)    │
                         │           │ │           │ │           │
                         │ issuer:   │ │ issuer:   │ │ issuer:   │
                         │ Certifier │ │ Mfr       │ │ Lab       │
                         │           │ │           │ │           │
                         │ fields:   │ │ fields:   │ │ fields:   │
                         │ certs     │ │ materials │ │ carbon    │
                         └───────────┘ └───────────┘ └───────────┘
```

---

## 4. Contributor Types

| Type | Description | Typical Attestations |
|------|-------------|---------------------|
| **CERTIFIER** | Certification bodies | GOTS, OEKO-TEX, FSC |
| **MANUFACTURER** | Factories | Materials, process, factory details |
| **SUPPLIER** | Raw material suppliers | Source origin, composition |
| **LAB** | Testing labs | Carbon footprint, chemical tests |
| **AUDITOR** | Compliance auditors | Social compliance, audits |
| **DESIGNER** | Product designers | Repair instructions |
| **OTHER** | Any third party | Any product data |

---

## 5. Verification Levels

| Level | Description | Trust |
|-------|-------------|-------|
| **SELF_ATTESTED** | Signed up, claims identity | ⚠️ Very Weak |
| **EMAIL_VERIFIED** | Email at claimed domain | ⚠️ Weak |
| **DNS_VERIFIED** | Controls domain (TXT record) | 🔵 Moderate |
| **VAT_VERIFIED** | VAT validated via EU VIES | 🟢 Good |
| **LEI_VERIFIED** | LEI validated via GLEIF | 🟢 Good |
| **REGISTRY_VERIFIED** | In EuroComply trusted issuer registry | ✅ High |
| **EUDI_VERIFIED** | EU Digital Identity Wallet | 🇪🇺 Highest |

**Important:** SELF_ATTESTED and EMAIL_VERIFIED do NOT prove real-world identity. For certification attestations, only REGISTRY_VERIFIED or higher should be trusted.

---

## 6. Data Model

### Contributor

```typescript
interface Contributor {
  id: string;
  email: string;
  companyName: string;
  type: ContributorType;
  did: string;              // did:key:z...
  verificationLevel: VerificationLevel;
  website?: string;
}
```

### DataRequest

```typescript
interface DataRequest {
  id: string;
  organizationId: string;
  productId: string;

  // Recipient
  contributorEmail: string;
  contributorType?: ContributorType;

  // Visibility
  visibility: 'FULL_PRODUCT' | 'REQUESTED_FIELDS_ONLY';
  requestedFields: string[];

  // Expiry settings
  requestExpiresAt: Date;
  suggestedAttestationExpiry?: Date;
  allowNoExpiry: boolean;
  requireExpiry: boolean;

  // Status
  status: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'EXPIRED' | 'DECLINED';
  accessToken: string;
}
```

### Contribution

```typescript
interface Contribution {
  id: string;
  productId: string;
  contributorId: string;
  requestId?: string;       // null if unsolicited
  fields: string[];
  status: ContributionStatus;
  currentVersionId: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

type ContributionStatus =
  | 'DRAFT'           // Editing, not signed
  | 'PENDING_REVIEW'  // Signed, awaiting review
  | 'APPROVED'        // Linked to product
  | 'REJECTED'        // Can revise
  | 'REVOKED';        // Contributor revoked
```

### ContributionVersion

```typescript
interface ContributionVersion {
  id: string;
  contributionId: string;
  version: number;
  data: Record<string, unknown>;
  dataHash: string;         // SHA256
  signature: string;        // Signed with contributor's DID
  vcId?: string;
  vcJwt?: string;
  signedAt: Date;
  expiresAt?: Date;
}
```

---

## 7. Contribution Lifecycle

```
┌─────────┐  sign    ┌────────────────┐  approve   ┌──────────┐
│  DRAFT  │─────────►│ PENDING_REVIEW │───────────►│ APPROVED │
└─────────┘          └────────────────┘            └──────────┘
     │                       │                           │
     │ delete                │ reject                    │ revoke
     ▼                       ▼                           ▼
  (gone)             ┌──────────┐                 ┌──────────┐
                     │ REJECTED │                 │ REVOKED  │
                     └──────────┘                 └──────────┘
                           │
                           │ edit & re-sign (new version)
                           ▼
                     ┌────────────────┐
                     │ PENDING_REVIEW │
                     │  (v2, v3...)   │
                     └────────────────┘
```

---

## 8. Visibility Options

### FULL_PRODUCT

Contributor sees all product data (read-only) plus editable fields.

**Use case:** Manufacturer needs context for accurate materials data.

### REQUESTED_FIELDS_ONLY

Contributor sees only basic identification and requested fields.

**Use case:** Lab only provides test results, doesn't need product context.

---

## 9. Expiry Management

### Customer Settings (Request)

| Setting | Description |
|---------|-------------|
| `suggestedAttestationExpiry` | Hint to contributor |
| `allowNoExpiry` | Can contributor set "never expires"? |
| `requireExpiry` | Is expiry mandatory? |
| `maxExpiryDuration` | Maximum days allowed |

### Notifications

| Type | Trigger | Action |
|------|---------|--------|
| EXPIRING_SOON | 30 days before | Request renewal |
| EXPIRING_URGENT | 7 days before | Urgent renewal |
| EXPIRED | Attestation expired | Remove or renew |
| REVOKED | Contributor revoked | Immediate action |

---

## 10. Workspace Usage

| Workspace | Use Cases | Typical Contributors |
|-----------|-----------|---------------------|
| **Design** | Material certs, component specs | Suppliers, labs |
| **Operations** | Supplier audits, factory certs | Auditors, suppliers |
| **Marketing** | Sustainability certs | Cert bodies, NGOs |
| **Compliance** | Regulatory certs | Cert bodies, auditors |

---

## 11. Access Control

| Action | Contributor | VIEWER | CONTRIBUTOR | EDITOR | MANAGER |
|--------|:-----------:|:------:|:-----------:|:------:|:-------:|
| View own attestations | ✅ | - | - | - | - |
| Submit attestation | ✅ | ❌ | ❌ | ❌ | ❌ |
| View attestations | - | ✅ | ✅ | ✅ | ✅ |
| Create request | - | ❌ | ✅ | ✅ | ✅ |
| Review/approve | - | ❌ | ❌ | ✅ | ✅ |

---

## 12. Attestation VC Structure

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://eurocomply.eu/contexts/attestation/v1"
  ],
  "type": ["VerifiableCredential", "ProductAttestation"],
  "issuer": "did:key:z6MkContributor...",
  "issuanceDate": "2026-01-14T10:00:00Z",
  "expirationDate": "2027-01-14T10:00:00Z",

  "credentialSubject": {
    "productId": "urn:gtin:5901234567890",
    "attestedFields": ["materials", "carbonFootprint"],
    "materials": {
      "primary": "Organic Cotton",
      "percentage": 95
    },
    "carbonFootprint": {
      "value": 5.2,
      "unit": "kgCO2e",
      "methodology": "ISO 14067"
    }
  },

  "credentialStatus": {
    "type": "StatusList2021Entry",
    "statusListCredential": "https://api.eurocomply.eu/v1/status/..."
  },

  "proof": { ... }
}
```

---

## 13. DPP with Attestations

```json
{
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:key:z6MkOrganization...",

  "credentialSubject": {
    "productId": "urn:gtin:5901234567890",
    "name": "Organic Cotton T-Shirt",

    "attestations": [
      {
        "type": "LinkedAttestation",
        "credentialId": "att_123",
        "issuer": "did:key:z6MkCertifier...",
        "issuerName": "Control Union",
        "fields": ["certifications"],
        "verificationLevel": "REGISTRY_VERIFIED"
      },
      {
        "type": "LinkedAttestation",
        "credentialId": "att_456",
        "issuer": "did:key:z6MkLab...",
        "issuerName": "TÜV Rheinland",
        "fields": ["carbonFootprint"],
        "verificationLevel": "VAT_VERIFIED"
      }
    ]
  }
}
```

---

## 14. Related Documents

| Document | Purpose |
|----------|---------|
| [Verifiable Credentials Design](./2026-01-15-verifiable-credentials-design.md) | VC structure, did:key |
| [User Management Design](./2026-01-15-user-management-design.md) | Workspace authorities |
| [Security Design](./2026-01-15-security-design.md) | Contributor authentication |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from MULTI_PARTY_ATTESTATION.md |

