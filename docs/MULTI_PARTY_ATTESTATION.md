# Multi-Party Attestation

## Overview

Multi-Party Attestation enables EuroComply customers to request product data from third parties (manufacturers, certifiers, labs, suppliers, etc.) and have that data cryptographically signed by the contributor. Each attestation becomes a Verifiable Credential linked to the product's DPP, creating a complete chain of trust and traceability.

### Available in ALL Workspaces

Attestation is a cross-cutting feature available in **all four EuroComply workspaces**, with different use cases for each:

| Workspace | Attestation Use Cases | Typical Contributors |
|-----------|----------------------|---------------------|
| **Design** | Material certifications, component specs, lab test results | Material suppliers, testing labs |
| **Operations** | Supplier audits, factory certifications, transport emissions | Suppliers, auditors, logistics providers |
| **Marketing** | Brand claim verifications, sustainability certifications | Certification bodies, NGOs |
| **Compliance** | Regulatory certifications, third-party compliance audits | Certification bodies, auditors |

### Key Principles

1. **Any data field can be attested** - Not limited to certifications; contributors can attest materials, carbon footprint, manufacturing details, or any product attribute
2. **Linked Verifiable Credentials** - Each attestation is its own VC, referenced by the DPP
3. **Full traceability** - Every data point shows who attested it and when
4. **Customer responsibility** - EuroComply does not validate attestation accuracy; customers are responsible for trusting their contributors
5. **Data flows to The Hub** - Attestations are stored in the Hub (central database) as workspace data, immediately visible across all workspaces

---

## Architecture

### Attestation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA CONTRIBUTION WORKFLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. REQUEST                    2. ONBOARD                   3. CONTRIBUTE    │
│  ─────────                     ─────────                    ───────────      │
│  Customer creates              Third party                  Third party      │
│  request from any              signs up, gets               fills data,      │
│  workspace                     their own did:key            signs with DID   │
│                                                                              │
│       │                              │                            │          │
│       ▼                              ▼                            ▼          │
│  ┌─────────────┐  Email      ┌──────────────┐           ┌─────────────────┐ │
│  │  WORKSPACE  │────────────►│  Contributor │──────────►│   Attestation   │ │
│  │  (any)      │  + Link     │              │  Signs    │       VC        │ │
│  │             │             │  did:key:z...│           │                 │ │
│  │ • Design    │             └──────────────┘           │ issuer: z...    │ │
│  │ • Operations│                                        │ fields: [...]   │ │
│  │ • Marketing │                                        │ signature: ...  │ │
│  │ • Compliance│                                        └─────────────────┘ │
│  └─────────────┘                                                  │          │
│       ▲                                                           │          │
│       │                    4. REVIEW                              │          │
│       │                    ────────                               │          │
│       │                                                           ▼          │
│       │           ┌───────────────────────────────────────────────────────┐ │
│       │           │  Customer reviews contribution in REQUESTING WORKSPACE │ │
│       │           │  (approves or rejects)                                 │ │
│       │           └───────────────────────────────────────────────────────┘ │
│       │                                    │                                 │
│       │                                    │ approve                         │
│       │                                    ▼                                 │
│       │           ┌───────────────────────────────────────────────────────┐ │
│       │           │               5. STORE IN THE HUB                      │ │
│       │           │                                                        │ │
│       │           │  Approved attestation stored in the Hub as              │ │
│       │           │  workspace data for the product                        │ │
│       │           │                                                        │ │
│       │           │  Immediately visible across all workspaces             │ │
│       │           │  (Hub is always synchronized)                          │ │
│       │           └───────────────────────────────────────────────────────┘ │
│       │                                    │                                 │
│       │                                    │                                 │
│       │                                    ▼                                 │
│       │   ┌─────────────────────────────────────────────────────────────┐   │
│       │   │         6. DPP ISSUANCE (Later, in Compliance workspace)    │   │
│       │   │                                                             │   │
│       │   │  When product reaches 100% completeness and user approves:  │   │
│       │   │  • Compliance workspace READS workspace data from Hub        │   │
│       │   │  • DPP VC issued with attestations array                    │   │
│       │   │  • Each attestation linked by reference                     │   │
│       │   └─────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       └─────────────────────────────────────────────────────────────────────┘
│         All data stored in The Hub - central database                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- Attestations are requested from **any workspace** (Design, Operations, Marketing, Compliance)
- After approval, attestations are stored in **The Hub** as workspace data for the product
- Data is **immediately visible** across all workspaces (Hub is always synchronized)
- DPP issuance happens **later** in Compliance workspace - it READS from the Hub (no aggregation needed)

### Linked VC Model

Each attestation is its own Verifiable Credential. The DPP VC references all approved attestation VCs:

```
┌────────────────────────┐
│      DPP (VC)          │
│  issuer: Customer      │
│                        │
│  attestations: [       │
│    ──────────────┐     │
│                  │     │
└──────────────────│─────┘
                   │
        ┌──────────┴──────────┬─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Attestation 1 │    │ Attestation 2 │    │ Attestation 3 │
│    (VC)       │    │    (VC)       │    │    (VC)       │
│               │    │               │    │               │
│ issuer:       │    │ issuer:       │    │ issuer:       │
│ Certifier     │    │ Manufacturer  │    │ Lab           │
│               │    │               │    │               │
│ fields:       │    │ fields:       │    │ fields:       │
│ certifications│    │ materials     │    │ carbonFootprint│
└───────────────┘    └───────────────┘    └───────────────┘
```

---

## Data Model

### Contributor

Third parties who provide attestations. Each contributor has their own DID for signing.

```
Contributor
├── id: string
├── email: string (unique)
├── companyName: string
├── type: ContributorType
├── did: string (did:key:z...)
├── didKeyId: string
├── website?: string
├── verificationLevel: VerificationLevel
├── createdAt: DateTime
└── updatedAt: DateTime
```

**ContributorType:**
| Type | Description | Example Attestations |
|------|-------------|---------------------|
| CERTIFIER | Certification bodies | GOTS, OEKO-TEX, FSC certifications |
| MANUFACTURER | Factories, producers | Materials, production process, factory details |
| SUPPLIER | Raw material suppliers | Source origin, raw material composition |
| LAB | Testing laboratories | Carbon footprint, chemical testing, durability |
| AUDITOR | Compliance auditors | Social compliance, supply chain audits |
| DESIGNER | Product designers | Repair instructions, disassembly guides |
| OTHER | Any other third party | Any product data |

**VerificationLevel:**
| Level | Description |
|-------|-------------|
| SELF_ATTESTED | Contributor signed up and claims identity |
| DOMAIN_VERIFIED | Email domain matches claimed organization |

### DataRequest

An invitation sent to a third party to contribute data.

```
DataRequest
├── id: string
├── organizationId: string (customer)
├── productId: string
│
│  // Recipient
├── contributorEmail: string
├── contributorType?: ContributorType (hint)
│
│  // What to show
├── visibility: 'FULL_PRODUCT' | 'REQUESTED_FIELDS_ONLY'
│
│  // What to request
├── requestedFields: string[] (e.g., ["materials", "carbonFootprint"])
├── message?: string
│
│  // Expiry settings
├── requestExpiresAt: DateTime (link expiry)
├── suggestedAttestationExpiry?: DateTime
├── allowNoExpiry: boolean
├── requireExpiry: boolean
├── maxExpiryDuration?: number (days)
│
│  // Status
├── status: RequestStatus
├── accessToken: string (unique link token)
├── contributorId?: string (set when accepted)
├── createdAt: DateTime
└── updatedAt: DateTime
```

**RequestStatus:**
| Status | Description |
|--------|-------------|
| PENDING | Email sent, awaiting response |
| ACCEPTED | Contributor signed up and accepted |
| COMPLETED | Contribution submitted |
| EXPIRED | Link expired before acceptance |
| DECLINED | Contributor declined the request |

### Contribution

A data contribution from a third party, with version history.

```
Contribution
├── id: string
├── productId: string
├── contributorId: string
├── requestId?: string (null if unsolicited)
├── fields: string[] (which fields this covers)
├── status: ContributionStatus
├── currentVersionId: string
├── reviewedAt?: DateTime
├── reviewedBy?: string
├── reviewNotes?: string
├── createdAt: DateTime
└── updatedAt: DateTime
```

**ContributionStatus:**
| Status | Description |
|--------|-------------|
| DRAFT | Contributor editing, not yet signed |
| PENDING_REVIEW | Signed, awaiting customer review |
| APPROVED | Customer approved, linked to product |
| REJECTED | Customer rejected, contributor can revise |
| REVOKED | Contributor revoked their attestation |

### ContributionVersion

Versioned history of contribution data with signatures.

```
ContributionVersion
├── id: string
├── contributionId: string
├── version: number (1, 2, 3...)
├── data: JSONB (contributed data)
├── dataHash: string (SHA256 of canonical JSON)
├── signature: string (signed hash with contributor's DID)
├── vcId?: string (attestation VC ID)
├── vcJwt?: string (attestation VC JWT)
├── signedAt: DateTime
├── expiresAt?: DateTime (null = never expires)
├── expiryReason?: string
└── createdAt: DateTime
```

### AttestationNotification

Notifications for attestation lifecycle events.

```
AttestationNotification
├── id: string
├── organizationId: string
├── contributionId: string
├── type: NotificationType
├── message: string
├── readAt?: DateTime
├── actionTaken?: string
└── createdAt: DateTime
```

**NotificationType:**
| Type | Trigger | Action Required |
|------|---------|-----------------|
| NEW_CONTRIBUTION | Contribution submitted | Review & approve/reject |
| CONTRIBUTION_APPROVED | Customer approved | None (info to contributor) |
| CONTRIBUTION_REJECTED | Customer rejected | Contributor can revise |
| EXPIRING_SOON | 30 days before expiry | Request renewal |
| EXPIRING_URGENT | 7 days before expiry | Urgent: request renewal |
| EXPIRED | Attestation expired | Remove or get new attestation |
| REVOKED | Contributor revoked | Immediate action needed |
| NEW_VERSION | Updated version submitted | Review new version |

---

## Contribution Lifecycle

```
                          ┌──────────────────┐
                          │                  │
    ┌─────────┐  sign     │  PENDING_REVIEW  │  approve   ┌──────────┐
    │  DRAFT  │──────────►│                  │───────────►│ APPROVED │
    └─────────┘           │  (awaiting       │            └──────────┘
         │                │   customer)      │                  │
         │                └──────────────────┘                  │
         │                        │                             │
         │ delete                 │ reject                      │ revoke
         ▼                        ▼                             ▼
    ┌─────────┐           ┌──────────────┐              ┌──────────┐
    │ (gone)  │           │   REJECTED   │              │ REVOKED  │
    └─────────┘           │              │              │          │
                          │ can resubmit │              │ customer │
                          └──────────────┘              │ notified │
                                 │                      └──────────┘
                                 │ edit & re-sign
                                 │ (new version)
                                 ▼
                          ┌──────────────────┐
                          │  PENDING_REVIEW  │
                          │  (v2, v3, ...)   │
                          └──────────────────┘
```

---

## Visibility Configuration

When creating a data request, customers choose how much product data to show.

### FULL_PRODUCT

Contributor sees all product data (read-only) plus editable fields they're asked to provide.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Product: Organic Cotton T-Shirt                                        │
│  SKU: TSH-001 │ GTIN: 1234567890123                                    │
│                                                                         │
│  YOUR INPUT NEEDED                                                      │
│  ─────────────────────────────────────────────────────────────────────  │
│  Materials: [                                            ] ◄── EDIT    │
│  Carbon Footprint: [                                     ] ◄── EDIT    │
│                                                                         │
│  OTHER PRODUCT DATA (read-only)                                        │
│  ─────────────────────────────────────────────────────────────────────  │
│  Price: €49.00                                                          │
│  Category: Apparel > T-Shirts                                          │
│  Description: Classic organic cotton tee with...                       │
│  Certifications: GOTS (attested by Control Union)                      │
│  Images: [img] [img] [img]                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Use case:** Manufacturer needs context to provide accurate materials data.

### REQUESTED_FIELDS_ONLY

Contributor sees only basic identification and the fields they're asked to provide.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Product: Organic Cotton T-Shirt                                        │
│  GTIN: 1234567890123                                                    │
│                                                                         │
│  YOU'VE BEEN ASKED TO PROVIDE:                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│  Materials: [                                            ] ◄── EDIT    │
│  Carbon Footprint: [                                     ] ◄── EDIT    │
│                                                                         │
│  (Other product details hidden)                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

**Use case:** Lab only needs to provide test results, doesn't need full product context.

---

## Expiry Configuration

Attestations can have expiry dates or be indefinite. Both customer and contributor have control.

### Customer Settings (when creating request)

| Setting | Description |
|---------|-------------|
| suggestedAttestationExpiry | Hint to contributor (e.g., "please expire with cert") |
| allowNoExpiry | Whether contributor can set "never expires" |
| requireExpiry | Whether an expiry date is mandatory |
| maxExpiryDuration | Maximum days from now (e.g., 365 days max) |

### Contributor Settings (when signing)

| Option | Description |
|--------|-------------|
| Specific date | "Valid until 2027-06-01" (e.g., matches cert expiry) |
| Duration | "Valid for 1 year from today" |
| Never expires | "This data doesn't expire" (if allowed) |

### Expiry Examples

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SCENARIO: Certification Attestation                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  Customer: "Please set expiry to match certificate"                     │
│  Contributor: Sets expiry to 2027-06-01 (cert expires then)            │
│  Reason: "GOTS certificate CU-123456 expires 2027-06-01"               │
│                                                                         │
│  Result: Attestation expires 2027-06-01                                │
│  Notifications: 30 days before, 7 days before, on expiry               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  SCENARIO: Materials Attestation                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  Customer: allowNoExpiry = true                                         │
│  Contributor: Sets "never expires"                                      │
│  Reason: "Material composition is a fixed product property"            │
│                                                                         │
│  Result: Attestation never expires                                      │
│  Notifications: None (unless revoked)                                  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  SCENARIO: Carbon Footprint (annual recalculation)                      │
├─────────────────────────────────────────────────────────────────────────┤
│  Customer: requireExpiry = true, maxExpiryDuration = 365               │
│  Contributor: Sets "valid for 1 year"                                  │
│  Reason: "Carbon calculations should be refreshed annually"            │
│                                                                         │
│  Result: Attestation expires in 1 year                                 │
│  Notifications: Standard expiry notifications                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Verifiable Credential Structures

### Attestation VC

Issued by the contributor when they sign their data contribution.

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
    "attestationType": "MATERIALS",
    "attestedFields": ["materials", "fiberComposition"],
    "data": {
      "materials": {
        "fiberComposition": [
          { "fiber": "organic_cotton", "percentage": 95 },
          { "fiber": "elastane", "percentage": 5 }
        ],
        "countryOfOrigin": "IN"
      }
    },
    "dataHash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "version": 1
  },
  "proof": {
    "type": "JsonWebSignature2020",
    "created": "2026-01-10T12:00:00Z",
    "verificationMethod": "did:key:zContributor...#key-1",
    "proofPurpose": "assertionMethod",
    "jws": "eyJhbGciOiJFZERTQSIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il19..."
  }
}
```

### DPP VC with Linked Attestations

The final DPP includes references to all approved attestation VCs.

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://eurocomply.eu/contexts/dpp/v1"
  ],
  "id": "urn:uuid:dpp-xyz789",
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:key:zCustomer...",
  "issuanceDate": "2026-01-15T12:00:00Z",
  "credentialSubject": {
    "id": "urn:gtin:1234567890123",
    "productName": "Organic Cotton T-Shirt",
    "manufacturer": {
      "name": "EcoTextiles GmbH",
      "country": "DE"
    },
    "materials": {
      "fiberComposition": [
        { "fiber": "organic_cotton", "percentage": 95 },
        { "fiber": "elastane", "percentage": 5 }
      ]
    },
    "certifications": [
      {
        "type": "GOTS",
        "certificateNumber": "CU-123456",
        "expiresDate": "2027-06-01"
      }
    ],
    "carbonFootprint": {
      "value": 5.2,
      "unit": "kgCO2e"
    }
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
      "attestedFields": ["materials", "manufacturer"],
      "signedAt": "2026-01-08T12:00:00Z",
      "expiresAt": null,
      "credential": "eyJhbGci..."
    },
    {
      "id": "urn:uuid:attestation-ghi789",
      "issuer": {
        "did": "did:key:zLab...",
        "name": "Carbon Trust Labs",
        "type": "LAB",
        "verificationLevel": "SELF_ATTESTED"
      },
      "attestedFields": ["carbonFootprint"],
      "signedAt": "2026-01-12T12:00:00Z",
      "expiresAt": "2027-01-12T00:00:00Z",
      "credential": "eyJhbGci..."
    }
  ],

  "proof": {
    "type": "JsonWebSignature2020",
    "created": "2026-01-15T12:00:00Z",
    "verificationMethod": "did:key:zCustomer...#key-1",
    "proofPurpose": "assertionMethod",
    "jws": "eyJhbGci..."
  }
}
```

---

## User Journeys

### Customer: Request Data from Third Party

```
1. Navigate to product in any workspace:
   - Design: Materials, certifications, technical specs
   - Operations: Supplier audits, transport emissions
   - Marketing: Brand claims, sustainability certs
   - Compliance: Regulatory certifications
2. See incomplete field (e.g., "Materials: Missing")
3. Click "Request Attestation"
4. Fill request form:
   - Recipient email: manufacturer@example.com
   - Type: MANUFACTURER (optional hint)
   - Fields: materials, countryOfOrigin
   - Visibility: FULL_PRODUCT
   - Expiry: Allow no expiry
   - Message: "Please provide material composition for our t-shirt"
5. Click "Send Request"
6. Email sent to manufacturer with unique link
7. Wait for notification of contribution
8. Review and approve in the SAME workspace where you requested it
9. Approved attestation stored in The Hub, immediately visible across all workspaces
```

### Contributor: Provide Attestation

```
1. Receive email with request link
2. Click link, arrive at EuroComply
3. Sign up (if new):
   - Email (pre-filled)
   - Company name
   - Type: MANUFACTURER
   - Password
   - DID generated automatically
4. Accept the data request
5. View product page:
   - See product info (per visibility setting)
   - See other attestations (if any)
   - See editable fields for your contribution
6. Fill in requested data:
   - Materials: 95% organic cotton, 5% elastane
   - Country of origin: India
7. Set expiry:
   - "Never expires" (material composition is fixed)
8. Review and sign:
   - See summary of data
   - Click "Sign & Submit"
   - Attestation VC created with your DID
9. Contribution submitted for customer review
```

### Customer: Review and Approve Contribution

```
1. Receive notification: "New contribution from EcoTextiles GmbH"
2. Notification links to the WORKSPACE where request originated
   (e.g., Design workspace if materials were requested there)
3. Navigate to product > Attestations (in requesting workspace)
4. See pending contribution:
   - Contributor: EcoTextiles GmbH (MANUFACTURER)
   - Fields: materials, countryOfOrigin
   - Signed: 2026-01-10
   - Expiry: Never
5. Review data:
   - Materials: 95% organic cotton, 5% elastane
   - Country of origin: India
6. Decision:
   - Click "Approve" → Attestation stored in The Hub
   - Or "Reject" with notes → Contributor notified
7. Approved attestation immediately visible across all workspaces (Hub is synchronized)
8. Product completeness updated
9. Later: Issue DPP in Compliance workspace (reads from Hub)
```

### Verifier: View DPP with Attestations

```
1. Scan QR code on product
2. View DPP verification page
3. See product data with trust indicators:

   ┌─────────────────────────────────────────────────────────────────┐
   │ CERTIFICATIONS                                      ✓ ATTESTED │
   │ GOTS • CU-123456 • Expires: 2027-06-01                        │
   │                                                                 │
   │ Attested by: Control Union Certifications                      │
   │ Type: CERTIFIER • DOMAIN_VERIFIED                              │
   │ Signed: 2026-01-10 • Expires: 2027-06-01                       │
   │ ✓ Signature Valid                                              │
   └─────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────┐
   │ MATERIALS                                           ✓ ATTESTED │
   │ 95% Organic Cotton, 5% Elastane                                │
   │                                                                 │
   │ Attested by: EcoTextiles GmbH                                  │
   │ Type: MANUFACTURER • SELF_ATTESTED                             │
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

4. Click on any attestation to see full VC details
5. Verify signatures independently
```

---

## Notifications

### Notification Schedule

| Event | When | Who | Urgency |
|-------|------|-----|---------|
| Contribution submitted | Immediately | Customer | Normal |
| Contribution approved | Immediately | Contributor | Info |
| Contribution rejected | Immediately | Contributor | Normal |
| Expiring soon | 30 days before | Customer | Normal |
| Expiring urgent | 7 days before | Customer | High |
| Expired | On expiry date | Customer | High |
| Revoked | Immediately | Customer | Critical |
| New version | Immediately | Customer | Normal |

### Email Templates

**New Contribution:**
```
Subject: New data contribution for "Organic Cotton T-Shirt"

Hi [Customer Name],

EcoTextiles GmbH has submitted a data contribution for your product
"Organic Cotton T-Shirt" (GTIN: 1234567890123).

Fields provided:
• Materials
• Country of Origin

[Review Contribution] button

This contribution requires your approval before it's linked to the product.
```

**Attestation Expiring:**
```
Subject: ⚠️ Attestation expiring in 30 days

Hi [Customer Name],

The following attestation will expire on 2027-06-01:

Product: Organic Cotton T-Shirt
Field: Certifications (GOTS)
Attested by: Control Union Certifications

[Request Renewal] button

After expiry, this attestation will no longer be included in new DPPs.
```

**Attestation Revoked:**
```
Subject: 🚨 URGENT: Attestation revoked

Hi [Customer Name],

Control Union Certifications has REVOKED their attestation for:

Product: Organic Cotton T-Shirt
Field: Certifications (GOTS)
Reason: Certificate withdrawn

IMMEDIATE ACTION REQUIRED:
• Review affected products
• Remove or replace the attestation
• Consider pausing DPP issuance for this product

[View Product] button
```

---

## Trust Model

### Verification Levels

| Level | How Achieved | Display | Trust Implication |
|-------|--------------|---------|-------------------|
| SELF_ATTESTED | Signup only | "Self-attested" | "They claim to be X" |
| DOMAIN_VERIFIED | Email domain matches | "Domain verified" | "Email from X.com" |

### Trust Display in UI

```
┌────────────────────────────────────────────────────────────────┐
│  ✓ DOMAIN_VERIFIED                                             │
│  Control Union Certifications                                  │
│  Email: certifier@controlunion.com                            │
│  Domain controlunion.com verified                             │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  ○ SELF_ATTESTED                                               │
│  EcoTextiles GmbH                                              │
│  Email: info@ecotextiles.example                              │
│  Identity not independently verified                          │
└────────────────────────────────────────────────────────────────┘
```

### Customer Responsibility

EuroComply does NOT validate:
- Contributor identity (beyond email/domain)
- Attestation accuracy
- Certification validity
- Data truthfulness

Customers are 100% responsible for:
- Trusting their contributors
- Verifying contributor credentials out-of-band
- Validating attestation accuracy
- Ensuring compliance with regulations

---

## API Endpoints

### Data Requests

```
POST   /api/v1/products/:id/data-requests     Create request
GET    /api/v1/products/:id/data-requests     List requests for product
GET    /api/v1/data-requests/:id              Get request details
DELETE /api/v1/data-requests/:id              Cancel request
```

### Contributor Portal

```
GET    /api/v1/contribute/:token              Get request by token (public)
POST   /api/v1/contribute/:token/accept       Accept request
GET    /api/v1/contribute/:token/product      Get product data (per visibility)
POST   /api/v1/contribute/:token/submit       Submit contribution
```

### Contributions

```
GET    /api/v1/products/:id/contributions     List contributions
GET    /api/v1/contributions/:id              Get contribution details
GET    /api/v1/contributions/:id/versions     Get version history
POST   /api/v1/contributions/:id/approve      Approve contribution
POST   /api/v1/contributions/:id/reject       Reject contribution
```

### Contributor Management

```
GET    /api/v1/contributors                   List contributors
GET    /api/v1/contributors/:id               Get contributor details
```

---

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Contributor model and authentication
- [ ] DataRequest model and email sending
- [ ] Contribution and ContributionVersion models
- [ ] Basic CRUD APIs

### Phase 2: Contributor Portal
- [ ] Public contribution acceptance page
- [ ] Product view with visibility controls
- [ ] Data entry forms for common field types
- [ ] Signature and VC generation

### Phase 3: Review Workflow
- [ ] Contribution review UI for customers
- [ ] Approve/reject workflow
- [ ] Version comparison view
- [ ] Integration with product data

### Phase 4: DPP Integration
- [ ] Link approved attestations to DPP
- [ ] Attestation display in DPP viewer
- [ ] Signature verification for attestations

### Phase 5: Notifications
- [ ] Email notifications for all events
- [ ] In-app notification center
- [ ] Expiry tracking and reminders
- [ ] Revocation handling

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [USER_MANAGEMENT.md](./USER_MANAGEMENT.md) | Workspace-based data ownership model |
| [VERIFIABLE_CREDENTIALS.md](./VERIFIABLE_CREDENTIALS.md) | VC/DID technical implementation |
| [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) | Data ownership and portability |
| [PASSPORT_TRUST_MODEL.md](./PASSPORT_TRUST_MODEL.md) | Overall trust architecture |

---

*Last Updated: 2026-01-11*
