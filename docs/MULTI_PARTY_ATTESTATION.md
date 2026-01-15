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
| Level | Description | Trust Level |
|-------|-------------|-------------|
| SELF_ATTESTED | Contributor signed up and claims identity | ⚠️ Very Weak |
| EMAIL_VERIFIED | Email confirmed at claimed domain | ⚠️ Weak |
| DNS_VERIFIED | Controls domain via DNS TXT record | 🔵 Moderate |
| VAT_VERIFIED | VAT number validated via EU VIES | 🟢 Good |
| LEI_VERIFIED | LEI validated via GLEIF | 🟢 Good |
| REGISTRY_VERIFIED | In EuroComply trusted issuer registry | ✅ High |
| EUDI_VERIFIED | EU Digital Identity Wallet (future) | 🇪🇺 Highest |

⚠️ **IMPORTANT**: SELF_ATTESTED and EMAIL_VERIFIED do NOT prove real-world identity.
Anyone can claim to be any organization. For certification attestations, only
REGISTRY_VERIFIED issuers should be trusted. See [VERIFIABLE_CREDENTIALS.md Section 17](./VERIFIABLE_CREDENTIALS.md#17-identity-verification-solving-the-trust-gap).

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

### Effect of Expiry on Issued DPPs

**Critical Principle**: An issued DPP remains valid without any expiry note. The DPP was valid at the time of issuance - that's what matters.

| What Expires | Effect on Existing DPPs | Effect on New DPPs |
|--------------|------------------------|-------------------|
| Attestation expiry date passes | **No change** - DPP remains fully valid | Attestation cannot be included |
| Certification in attestation expires | **No change** - DPP remains fully valid | Attestation cannot be included |

**Why this matters:**
- DPPs are immutable VCs sealed at issuance time
- At issuance, all certifications and attestations were valid
- Later expiry doesn't retroactively invalidate the DPP
- This matches ESPR intent: accurate info at time of market placement

**Example:**
- Jan 2026: DPP issued with GOTS certification (valid until Jun 2027)
- Jul 2027: GOTS certification expires
- The Jan 2026 DPP remains valid - it correctly stated the certification was valid at issuance
- New DPPs cannot include this attestation until certification is renewed

---

## Attestation Workflow Robustness

This section defines timeout handling, retry logic, and error recovery for the attestation workflow.

### Request TTL and Timeout Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REQUEST LIFECYCLE WITH TIMEOUTS                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  REQUEST CREATED                                                            │
│  ───────────────                                                            │
│  • Default TTL: 7 days (configurable: 1-30 days)                           │
│  • Status: PENDING                                                          │
│  • Email sent to contributor                                                │
│                                                                              │
│       Day 0          Day 5           Day 7                                  │
│         │              │               │                                     │
│         ▼              ▼               ▼                                     │
│     ┌───────┐     ┌─────────┐     ┌─────────┐                              │
│     │Request│────▶│Reminder │────▶│ EXPIRED │                              │
│     │Created│     │Email    │     │         │                              │
│     └───────┘     └─────────┘     └─────────┘                              │
│                                        │                                     │
│                                        ▼                                     │
│                              Customer notified                               │
│                              Can re-send request                             │
│                                                                              │
│  CONFIGURABLE SETTINGS:                                                     │
│  ──────────────────────                                                     │
│  │ Setting              │ Default │ Range    │ Description                 │
│  │──────────────────────│─────────│──────────│─────────────────────────────│
│  │ requestTtlDays       │ 7       │ 1-30     │ Days until request expires  │
│  │ reminderBeforeDays   │ 2       │ 1-7      │ Days before expiry to remind│
│  │ allowExtension       │ true    │ bool     │ Customer can extend TTL     │
│  │ maxExtensions        │ 3       │ 0-5      │ Max times can extend        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Timeout State Transitions

| Current State | Trigger | New State | Action |
|---------------|---------|-----------|--------|
| PENDING | TTL expires | EXPIRED | Notify customer |
| PENDING | Contributor clicks link | ACCEPTED | Start contribution |
| ACCEPTED | 48h no activity | ACCEPTED (reminder) | Email contributor |
| ACCEPTED | 7 days no activity | STALE | Notify both parties |
| STALE | Contributor submits | PENDING_REVIEW | Normal flow |
| STALE | 7 more days | EXPIRED | Close request |

### Delivery Retry Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EMAIL DELIVERY RETRY                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  RETRY SCHEDULE:                                                            │
│  ───────────────                                                            │
│  Attempt 1: Immediate                                                       │
│  Attempt 2: 1 minute (if soft bounce or timeout)                           │
│  Attempt 3: 5 minutes                                                       │
│  Attempt 4: 30 minutes                                                      │
│  Attempt 5: 2 hours                                                         │
│  After 5 failures: Move to Dead Letter Queue                               │
│                                                                              │
│  FAILURE CLASSIFICATION:                                                    │
│  ───────────────────────                                                    │
│  │ Failure Type    │ Retry? │ Action                                       │
│  │─────────────────│────────│──────────────────────────────────────────────│
│  │ Soft bounce     │ Yes    │ Retry with backoff                           │
│  │ Timeout         │ Yes    │ Retry with backoff                           │
│  │ Hard bounce     │ No     │ Mark email invalid, notify customer          │
│  │ Spam complaint  │ No     │ Mark email blocked, notify customer          │
│  │ Invalid format  │ No     │ Validation error, notify customer            │
│                                                                              │
│  DEAD LETTER QUEUE:                                                         │
│  ─────────────────                                                          │
│  Failed deliveries are stored for manual review:                            │
│  • Customer notified of delivery failure                                    │
│  • Dashboard shows "Delivery failed" status                                 │
│  • Option to retry with different email or cancel request                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Webhook Notification Retry

Attestation lifecycle events trigger webhooks. Retry policy matches standard webhook delivery:

| Event | Webhook Type | Retry Policy |
|-------|--------------|--------------|
| Request created | `attestation.requested` | Standard (6 attempts over 24h) |
| Contribution submitted | `attestation.submitted` | Standard |
| Attestation approved | `attestation.approved` | Standard |
| Attestation rejected | `attestation.rejected` | Standard |
| Attestation expired | `attestation.expired` | Standard |
| Contributor key revoked | `attestation.contributor_key_revoked` | High priority (immediate + 3 fast retries) |

### Contributor Key Revocation Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KEY REVOCATION SCENARIOS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SCENARIO 1: Key Compromised During PENDING Request                         │
│  ──────────────────────────────────────────────────                         │
│                                                                              │
│  Contributor reports key compromise → Before they submitted any data        │
│                                                                              │
│  Actions:                                                                   │
│  1. Contributor's account locked                                            │
│  2. All PENDING requests to this contributor: Status → CANCELLED            │
│  3. Customer notified: "Contributor security incident, request cancelled"   │
│  4. Contributor must re-onboard with new key                               │
│  5. Customer can re-send request to contributor's new account              │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  SCENARIO 2: Key Compromised During PENDING_REVIEW                          │
│  ─────────────────────────────────────────────────                          │
│                                                                              │
│  Contributor reports key compromise → After submitting, before approval     │
│                                                                              │
│  Actions:                                                                   │
│  1. Contribution status → CANCELLED_KEY_COMPROMISE                         │
│  2. Customer notified with details:                                         │
│     - Which contribution affected                                           │
│     - When it was signed (before or during compromise window?)              │
│     - Recommendation: Request fresh attestation with new key               │
│  3. Existing signed VC marked as "key_compromised" in metadata             │
│  4. Customer can choose to:                                                 │
│     a) Reject and request new attestation (recommended)                    │
│     b) Accept anyway if signed before compromise window (audit logged)     │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  SCENARIO 3: Key Compromised After APPROVED                                 │
│  ──────────────────────────────────────────                                 │
│                                                                              │
│  Contributor reports key compromise → Attestation already approved & in use │
│                                                                              │
│  Actions:                                                                   │
│  1. APPROVED attestations signed BEFORE compromise: Remain valid            │
│     - Signature was authentic at time of signing                           │
│     - No retroactive invalidation                                           │
│  2. Customer notified: "Contributor key compromised, review attestations"  │
│  3. Customer can choose to:                                                 │
│     a) Keep existing attestations (valid)                                  │
│     b) Request fresh attestation with new key (for new DPPs)              │
│     c) Revoke attestation if signed during suspected compromise window     │
│  4. Issued DPPs referencing these attestations: Unaffected                 │
│     - DPP validity not changed                                             │
│     - Verification shows: "Attestation key has been rotated"              │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  DATABASE SCHEMA ADDITION:                                                  │
│                                                                              │
│  ContributionVersion (existing table, new fields):                         │
│  ├── keyStatus: 'VALID' | 'KEY_ROTATED' | 'KEY_COMPROMISED'                │
│  ├── keyCompromisedAt?: DateTime                                           │
│  └── signedDuringCompromise?: boolean                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Partial Attestation State Management

Contributors may not fill all requested fields. The system handles partial attestations:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PARTIAL ATTESTATION HANDLING                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  EXAMPLE:                                                                   │
│  ─────────                                                                  │
│  Customer requests: [materials, carbonFootprint, factoryLocation]          │
│  Contributor submits: [materials, carbonFootprint] only                    │
│  Missing: [factoryLocation]                                                │
│                                                                              │
│  CONTRIBUTOR VIEW:                                                          │
│  ─────────────────                                                          │
│  • Can submit with partial data                                             │
│  • Must confirm: "I can only attest to these fields"                       │
│  • Optional: Explain why (dropdown + free text)                            │
│    - "Data not available"                                                  │
│    - "Confidential / trade secret"                                         │
│    - "Not applicable to this product"                                      │
│    - "Will provide later" (sets reminder)                                  │
│                                                                              │
│  CUSTOMER REVIEW VIEW:                                                      │
│  ─────────────────────                                                      │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Attestation from: Supplier ABC                                       │ │
│  │                                                                        │ │
│  │  ✅ Materials         Attested    [View data]                         │ │
│  │  ✅ Carbon Footprint  Attested    [View data]                         │ │
│  │  ⚠️ Factory Location  Skipped     Reason: "Confidential"              │ │
│  │                                                                        │ │
│  │  Coverage: 2 of 3 requested fields (67%)                              │ │
│  │                                                                        │ │
│  │  [Approve Partial] [Reject - Request Missing] [Reject - Cancel]       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  APPROVAL OPTIONS:                                                          │
│  ─────────────────                                                          │
│                                                                              │
│  │ Action                    │ Effect                                      │
│  │───────────────────────────│─────────────────────────────────────────────│
│  │ Approve Partial           │ Attestation approved for submitted fields   │
│  │                           │ Missing fields remain unattested            │
│  │                           │ Customer can request separately later       │
│  │───────────────────────────│─────────────────────────────────────────────│
│  │ Reject - Request Missing  │ Status → REJECTED                           │
│  │                           │ Contributor notified to add missing fields  │
│  │                           │ Contributor can revise and resubmit         │
│  │───────────────────────────│─────────────────────────────────────────────│
│  │ Reject - Cancel           │ Status → REJECTED                           │
│  │                           │ Request closed                              │
│  │                           │ Customer can send new request if needed     │
│                                                                              │
│  METADATA IN ATTESTATION VC:                                                │
│  ───────────────────────────                                                │
│                                                                              │
│  {                                                                          │
│    "requestedFields": ["materials", "carbonFootprint", "factoryLocation"], │
│    "attestedFields": ["materials", "carbonFootprint"],                     │
│    "skippedFields": [                                                      │
│      {                                                                     │
│        "field": "factoryLocation",                                        │
│        "reason": "confidential",                                          │
│        "note": "Trade secret per supplier agreement"                      │
│      }                                                                     │
│    ],                                                                       │
│    "coveragePercentage": 67                                                │
│  }                                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Workflow State Diagram

Complete state machine for attestation requests:

```
                                    ┌─────────────────┐
                                    │     CREATED     │
                                    │  (request sent) │
                                    └────────┬────────┘
                                             │
                         ┌───────────────────┼───────────────────┐
                         │                   │                   │
                    TTL expires       Contributor clicks    Contributor declines
                         │                   │                   │
                         ▼                   ▼                   ▼
                  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                  │   EXPIRED   │     │  ACCEPTED   │     │  DECLINED   │
                  └─────────────┘     └──────┬──────┘     └─────────────┘
                                             │
                         ┌───────────────────┼───────────────────┐
                         │                   │                   │
                   Key compromised    Submits contribution   Goes stale (14d)
                         │                   │                   │
                         ▼                   ▼                   ▼
                  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                  │  CANCELLED  │     │  PENDING    │     │   STALE     │
                  │  (security) │     │   REVIEW    │     │ (reminder)  │
                  └─────────────┘     └──────┬──────┘     └──────┬──────┘
                                             │                   │
                         ┌───────────────────┼───────────────────┤
                         │                   │                   │
                   Customer approves  Customer rejects    7 more days
                         │                   │                   │
                         ▼                   ▼                   ▼
                  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                  │  APPROVED   │     │  REJECTED   │     │   EXPIRED   │
                  │             │     │             │     │             │
                  │ Stored in   │     │ Contributor │     │   Closed    │
                  │ The Hub     │     │ can revise  │     │             │
                  └──────┬──────┘     └──────┬──────┘     └─────────────┘
                         │                   │
                         │            Contributor revises
                         │                   │
                         │                   ▼
                         │            ┌─────────────┐
                         │            │  PENDING    │
                         │            │   REVIEW    │
                         │            │  (v2, v3...)│
                         │            └─────────────┘
                         │
                  Post-approval events:
                         │
          ┌──────────────┼──────────────┐
          │              │              │
   Attestation     Contributor     Key compromised
   expires         revokes         (post-approval)
          │              │              │
          ▼              ▼              ▼
   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
   │   EXPIRED   │ │   REVOKED   │ │ VALID but   │
   │ (no new DPP)│ │ (removed)   │ │ KEY_ROTATED │
   └─────────────┘ └─────────────┘ └─────────────┘
```

---

## Attestation Version Binding

### The Problem: Stale Attestations

Attestations reference product data. If that data changes, the attestation may become stale or invalid:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ATTESTATION STALENESS SCENARIOS                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SCENARIO 1: Product Changed After Attestation                              │
│  ──────────────────────────────────────────────                             │
│  1. Supplier attests: "Materials: 95% cotton, 5% elastane"                  │
│  2. Brand later changes product: "Materials: 90% cotton, 10% elastane"     │
│  3. Attestation is now STALE - supplier never saw 10% elastane             │
│                                                                              │
│  SCENARIO 2: Attestation on Data Supplier Can't See                        │
│  ───────────────────────────────────────────────────                        │
│  1. Brand requests carbon footprint attestation (REQUESTED_FIELDS_ONLY)    │
│  2. Supplier can't see materials (hidden for confidentiality)               │
│  3. Supplier provides carbon calculation based on... what?                  │
│                                                                              │
│  SCENARIO 3: Referenced Version Archived                                    │
│  ─────────────────────────────────────────                                  │
│  1. Attestation references product version v3                               │
│  2. Brand archives v3, publishes v4                                         │
│  3. Attestation orphaned - references non-current version                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Solution: Version-Bound Attestations

Attestations are bound to a **specific product data snapshot** via content hash:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VERSION BINDING MODEL                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ATTESTATION CREATION:                                                      │
│  ─────────────────────                                                      │
│  1. When contributor views product, system captures:                        │
│     • Product version ID (e.g., pv_abc123)                                  │
│     • Content hash of VISIBLE fields (sha256)                              │
│     • Timestamp of view                                                     │
│                                                                              │
│  2. Attestation VC includes:                                                │
│     {                                                                        │
│       "productReference": {                                                  │
│         "productId": "prod_xyz",                                            │
│         "versionId": "pv_abc123",                                           │
│         "visibleFieldsHash": "sha256:e3b0c44...",                           │
│         "viewedAt": "2026-01-10T12:00:00Z"                                  │
│       },                                                                     │
│       "attestedFields": ["materials", "carbonFootprint"],                   │
│       ...                                                                    │
│     }                                                                        │
│                                                                              │
│  STALENESS DETECTION:                                                       │
│  ────────────────────                                                       │
│  On every product update, system checks:                                    │
│                                                                              │
│  for each approved attestation:                                             │
│    newHash = hash(product.fields[attestation.visibleFields])               │
│    if (newHash !== attestation.visibleFieldsHash):                         │
│      mark attestation as STALE                                              │
│      notify customer: "Product changed since attestation"                   │
│                                                                              │
│  STALE ATTESTATION HANDLING:                                                │
│  ───────────────────────────                                                │
│  Stale attestations are:                                                    │
│  • Flagged in UI with warning                                               │
│  • Excluded from NEW DPPs (optional, configurable)                         │
│  • Customer prompted to request fresh attestation                          │
│                                                                              │
│  Already-issued DPPs are UNAFFECTED (immutable, valid at issuance)         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Model Additions

```typescript
// ContributionVersion (extended)
interface ContributionVersion {
  // ... existing fields ...

  // Version binding (NEW)
  productVersionId: string;              // Product version when contributor viewed
  visibleFieldsHash: string;             // Hash of visible fields at view time
  visibleFields: string[];               // Which fields were visible
  viewedAt: DateTime;                    // When contributor viewed product

  // Staleness tracking (NEW)
  staleAt?: DateTime;                    // When marked stale (null = current)
  staleReason?: string;                  // What changed
  staleFields?: string[];                // Which fields changed
}
```

### Visibility and Attestation Scope

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VISIBILITY RULES FOR ATTESTATION SCOPE                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  RULE: Contributors can ONLY attest fields they can SEE.                    │
│                                                                              │
│  FULL_PRODUCT visibility:                                                   │
│  ─────────────────────────                                                  │
│  • Contributor sees ALL product data                                        │
│  • Can attest ANY field (if requested)                                      │
│  • Hash includes all fields                                                 │
│                                                                              │
│  REQUESTED_FIELDS_ONLY visibility:                                          │
│  ─────────────────────────────────                                          │
│  • Contributor sees ONLY requested fields + basic info                     │
│  • Can attest ONLY those fields                                             │
│  • Hash includes only visible fields                                        │
│  • BLOCKED: Cannot attest derived data (e.g., carbon footprint              │
│    calculation that depends on hidden materials)                            │
│                                                                              │
│  FIELD DEPENDENCY CHECK:                                                    │
│  ───────────────────────                                                    │
│  Some fields depend on others for meaningful attestation:                   │
│                                                                              │
│  │ Field             │ Requires Visibility Of           │                   │
│  │───────────────────│──────────────────────────────────│                   │
│  │ carbonFootprint   │ materials, weight, transport     │                   │
│  │ recyclability     │ materials, bom                   │                   │
│  │ repairScore       │ bom, disassemblyGuide            │                   │
│                                                                              │
│  If requesting carbonFootprint but hiding materials:                        │
│  • System warns: "Carbon calculation requires materials visibility"        │
│  • Customer can override (their responsibility)                             │
│  • Attestation flagged: "Attested without full context"                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Product Change Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WHEN PRODUCT DATA CHANGES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. DETECT CHANGE                                                           │
│     On product update (any field save):                                     │
│     • New version created with incremented version number                   │
│     • All approved attestations checked for staleness                       │
│                                                                              │
│  2. CATEGORIZE CHANGE                                                       │
│                                                                              │
│     │ Change Type         │ Effect on Attestations                        │
│     │─────────────────────│───────────────────────────────────────────────│
│     │ Non-attested field  │ No effect - attestation still valid           │
│     │ (e.g., price)       │                                               │
│     │─────────────────────│───────────────────────────────────────────────│
│     │ Attested field      │ Attestation marked STALE                      │
│     │ (e.g., materials)   │ Customer notified                             │
│     │                     │ Must re-request or acknowledge stale          │
│     │─────────────────────│───────────────────────────────────────────────│
│     │ Dependency field    │ Derived attestations marked STALE             │
│     │ (materials changed, │ (e.g., carbon footprint depends on materials) │
│     │  affects carbon)    │                                               │
│                                                                              │
│  3. CUSTOMER OPTIONS                                                        │
│                                                                              │
│     ┌──────────────────────────────────────────────────────────────────┐   │
│     │ ⚠️ Attestation Stale                                             │   │
│     │                                                                   │   │
│     │ "Materials" attestation from EcoTextiles GmbH is stale.         │   │
│     │ Product materials were modified since attestation.               │   │
│     │                                                                   │   │
│     │ Changed: materials.fiberComposition                              │   │
│     │ Before: 95% cotton, 5% elastane                                  │   │
│     │ After:  90% cotton, 10% elastane                                 │   │
│     │                                                                   │   │
│     │ [Request New Attestation] [Keep Stale] [Remove Attestation]     │   │
│     └──────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│     • Request New: Sends new request to same contributor                    │
│     • Keep Stale: Attestation stays but flagged (excluded from new DPPs)   │
│     • Remove: Attestation deleted, field unattested                        │
│                                                                              │
│  4. DPP ISSUANCE WITH STALE ATTESTATIONS                                   │
│                                                                              │
│     Default: Stale attestations BLOCKED from new DPPs                       │
│     Override: Customer can force-include with acknowledgment:               │
│     "I confirm this stale attestation is still accurate for this DPP"      │
│     (Logged for audit)                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation: Staleness Check

```typescript
async function checkAttestationStaleness(
  productId: string,
  changedFields: string[]
): Promise<void> {
  // Get all approved attestations for this product
  const attestations = await prisma.contribution.findMany({
    where: {
      productId,
      status: 'APPROVED',
    },
    include: {
      currentVersion: true,
    },
  });

  for (const attestation of attestations) {
    const version = attestation.currentVersion;

    // Check if any changed field was visible to contributor
    const affectedFields = changedFields.filter(f =>
      version.visibleFields.includes(f)
    );

    // Check if any changed field affects attested fields (dependencies)
    const dependencyAffected = checkFieldDependencies(
      version.attestedFields,
      changedFields
    );

    if (affectedFields.length > 0 || dependencyAffected) {
      // Mark as stale
      await prisma.contributionVersion.update({
        where: { id: version.id },
        data: {
          staleAt: new Date(),
          staleReason: 'Product data changed since attestation',
          staleFields: [...affectedFields, ...(dependencyAffected ? ['(dependencies)'] : [])],
        },
      });

      // Notify customer
      await createNotification({
        type: 'ATTESTATION_STALE',
        organizationId: attestation.organizationId,
        contributionId: attestation.id,
        message: `Attestation from ${attestation.contributorName} is stale. ` +
                 `Changed fields: ${affectedFields.join(', ')}`,
      });
    }
  }
}

// Field dependency map
const FIELD_DEPENDENCIES: Record<string, string[]> = {
  carbonFootprint: ['materials', 'weight', 'transportMode', 'manufacturingLocation'],
  recyclability: ['materials', 'bom'],
  repairScore: ['bom', 'disassemblyGuide'],
  durability: ['materials', 'testResults'],
};

function checkFieldDependencies(
  attestedFields: string[],
  changedFields: string[]
): boolean {
  for (const attested of attestedFields) {
    const deps = FIELD_DEPENDENCIES[attested] || [];
    if (deps.some(dep => changedFields.includes(dep))) {
      return true;
    }
  }
  return false;
}
```

### Summary: Preventing Orphaned/Stale Attestations

| Scenario | Prevention | Handling |
|----------|------------|----------|
| Product changed after attestation | Version binding + staleness check | Mark stale, notify, require re-attestation |
| Supplier attests to unseen data | Visibility + dependency checking | Block or warn when dependencies hidden |
| Referenced version archived | Version ID in attestation VC | Attestation remains valid for that version; stale for new versions |
| Field removed from product | Field deletion check | Remove attestation for deleted field |

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

After expiry, this attestation cannot be included in NEW DPPs.
Already-issued DPPs remain valid - they were accurate at time of issuance.
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

### The Identity Verification Problem

⚠️ **CRITICAL**: did:key provides cryptographic proof (data integrity), NOT identity verification.

```
┌─────────────────────────────────────────────────────────────────┐
│  WHAT did:key PROVES vs. WHAT IT DOESN'T                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ✓ CRYPTOGRAPHIC PROOF (did:key provides):                      │
│    • Data hasn't been tampered with since signing               │
│    • Same keypair signed this data                              │
│                                                                  │
│  ✗ IDENTITY (did:key does NOT prove):                           │
│    • The entity is actually "Control Union"                     │
│    • The organization legally exists                            │
│    • The person has authority to sign                           │
│                                                                  │
│  ATTACK SCENARIO:                                                │
│  1. Attacker creates controlunion.io (lookalike domain)         │
│  2. Gets EMAIL_VERIFIED status (email works!)                   │
│  3. Issues fraudulent GOTS attestations                         │
│  4. Signature is cryptographically valid ✓                      │
│  5. But identity is fraudulent ✗                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Verification Level Hierarchy

| Level | How Achieved | Trust Level | What It Proves |
|-------|--------------|-------------|----------------|
| SELF_ATTESTED | Signup only | ⚠️ Very Weak | Nothing |
| EMAIL_VERIFIED | Email confirmed | ⚠️ Weak | Has email at domain |
| DNS_VERIFIED | DNS TXT record | 🔵 Moderate | Controls domain |
| VAT_VERIFIED | VIES API check | 🟢 Good | Business legally exists (EU) |
| LEI_VERIFIED | GLEIF API check | 🟢 Good | Global business ID verified |
| REGISTRY_VERIFIED | Manual verification | ✅ High | Verified certification body |
| EUDI_VERIFIED | EU wallet | 🇪🇺 Highest | EU government vouches |

### Verification Process

#### How to Achieve Each Verification Level

**1. SELF_ATTESTED (Automatic on Signup)**

No verification required. Contributor creates account with email and claims an organization name.

⚠️ **Security Risk:** Anyone can claim to be any organization.

---

**2. EMAIL_VERIFIED (Automatic After Email Confirmation)**

```
Flow:
1. Contributor signs up with email: certifier@controlunion.com
2. Receives verification email with one-time link
3. Clicks link → email confirmed
4. Status: EMAIL_VERIFIED

Proves: Email address works at claimed domain
Does NOT prove: Actually owns/works for Control Union
```

⚠️ **Security Risk:** Email can be created at lookalike domains (controlunion.io instead of controlunion.com)

---

**3. DNS_VERIFIED (Proves Domain Control)**

Contributor must add a DNS TXT record to prove they control the domain:

```
Process:
1. Contributor goes to Settings → Verification
2. System generates unique verification code:
   TXT _eurocomply-verification.controlunion.com = "ec_verify_a3f9d2c8b1e5..."

3. Contributor adds TXT record to DNS:
   @ or subdomain: _eurocomply-verification
   Type: TXT
   Value: ec_verify_a3f9d2c8b1e5...

4. Click "Verify Domain"
5. System queries DNS:
   dig TXT _eurocomply-verification.controlunion.com

6. If match found:
   Status: DNS_VERIFIED
   Badge updated in UI

Proves: Controls DNS for the domain
Does NOT prove: Business legally exists or is accredited
```

**Implementation:**

```typescript
async function verifyDomain(contributorId: string): Promise<boolean> {
  const contributor = await prisma.contributor.findUnique({ where: { id: contributorId } });
  const domain = extractDomain(contributor.email); // controlunion.com
  const expectedCode = contributor.dnsVerificationCode; // ec_verify_a3f9...

  // Query DNS TXT record
  const records = await dns.resolveTxt(`_eurocomply-verification.${domain}`);
  const found = records.flat().find(r => r === expectedCode);

  if (found) {
    await prisma.contributor.update({
      where: { id: contributorId },
      data: {
        verificationLevel: 'DNS_VERIFIED',
        domainVerifiedAt: new Date(),
      },
    });
    return true;
  }

  return false;
}
```

---

**4. VAT_VERIFIED (Proves Business Legally Exists in EU)**

Contributor provides their EU VAT number for verification via VIES (VAT Information Exchange System):

```
Process:
1. Contributor goes to Settings → Verification → VAT
2. Enters VAT number: DE123456789
3. System validates via EU VIES API:
   https://ec.europa.eu/taxation_customs/vies/

4. If valid:
   - Retrieves business name, address from VIES
   - Checks if name matches claimed organization name
   - Status: VAT_VERIFIED

Proves:
- Business legally registered in EU
- VAT number is active
- Business name matches registration

Does NOT prove:
- Certification body accreditation
- Authority to issue specific certifications
```

**Implementation:**

```typescript
async function verifyVAT(contributorId: string, vatNumber: string): Promise<boolean> {
  const contributor = await prisma.contributor.findUnique({ where: { id: contributorId } });

  // Validate VAT format (e.g., DE + 9 digits)
  if (!isValidVATFormat(vatNumber)) {
    throw new Error('Invalid VAT format');
  }

  // Query EU VIES API
  const viesResult = await fetch('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      countryCode: vatNumber.substring(0, 2),
      vatNumber: vatNumber.substring(2),
    }),
  }).then(r => r.json());

  if (!viesResult.valid) {
    throw new Error('VAT number not found in VIES');
  }

  // Check if business name matches claimed name (fuzzy match)
  const similarity = stringSimilarity(
    viesResult.name.toLowerCase(),
    contributor.companyName.toLowerCase()
  );

  if (similarity < 0.7) {
    throw new Error(`VAT business name "${viesResult.name}" does not match claimed "${contributor.companyName}"`);
  }

  // Update contributor
  await prisma.contributor.update({
    where: { id: contributorId },
    data: {
      verificationLevel: 'VAT_VERIFIED',
      vatNumber,
      vatBusinessName: viesResult.name,
      vatAddress: viesResult.address,
      vatVerifiedAt: new Date(),
    },
  });

  return true;
}
```

---

**5. LEI_VERIFIED (Global Business Identifier)**

Contributor provides their Legal Entity Identifier (LEI) for verification via GLEIF:

```
Process:
1. Contributor enters LEI: 5493001KJTIIGC8Y1R12
2. System validates via GLEIF API:
   https://api.gleif.org/api/v1/lei-records/{lei}

3. If valid and active:
   - Retrieves legal name, jurisdiction
   - Status: LEI_VERIFIED

Proves:
- Global business identity verified
- Registered with financial regulators
```

---

**6. REGISTRY_VERIFIED (Trusted Certification Bodies)**

**Manual verification process** for certification bodies and critical suppliers:

```
Process:
1. Contributor requests REGISTRY_VERIFIED status
2. Provides evidence:
   - Accreditation certificates (IOAS, IAF, etc.)
   - Certification body license
   - Proof of accreditation scope

3. EuroComply team verifies:
   - Check accreditation body registry (IOAS, IAF, etc.)
   - Verify license is active
   - Confirm scope matches requested certifications

4. Manual approval:
   - Add to Trust Registry
   - Assign accreditation scope (GOTS, GRS, etc.)
   - Status: REGISTRY_VERIFIED

5. Ongoing monitoring:
   - Periodic re-verification (annually)
   - Automatic alerts if accreditation expires
```

**Trust Registry Structure:**

```typescript
model TrustedIssuer {
  id                String    @id
  contributorId     String    @unique

  // Verification
  verifiedBy        String    // EuroComply admin who verified
  verifiedAt        DateTime
  reVerifyBy        DateTime  // Annual re-verification

  // Accreditation
  accreditationBody String    // "IOAS", "IAF", "DAkkS", etc.
  accreditationId   String    // Accreditation certificate number
  accreditedScopes  String[]  // ["GOTS", "GRS", "OCS", "RCS"]

  // Evidence
  evidenceUrls      String[]  // Links to accreditation certificates

  // Status
  status            TrustStatus // ACTIVE, SUSPENDED, REVOKED
}

enum TrustStatus {
  ACTIVE       // Currently trusted
  SUSPENDED    // Temporary suspension pending review
  REVOKED      // Permanently removed from registry
}
```

---

**7. EUDI_VERIFIED (EU Digital Identity Wallet - Future)**

```
Process (Planned):
1. Contributor connects EU Digital Identity Wallet (EUDI)
2. Wallet provides government-verified identity claims
3. EuroComply validates wallet signature
4. Status: EUDI_VERIFIED

Proves: EU member state government vouches for identity

Timeline: EUDI wallet rollout 2024-2027
```

---

### Automatic Verification During Signup

```
┌─────────────────────────────────────────────────────────────────┐
│                CONTRIBUTOR SIGNUP & VERIFICATION                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. SIGNUP                                                      │
│     Email: certifier@controlunion.com                           │
│     Company: Control Union                                      │
│     Type: CERTIFIER                                             │
│     Status: SELF_ATTESTED ⚠️                                    │
│                                                                  │
│  2. EMAIL VERIFICATION (Automatic)                              │
│     Send verification email → click link                        │
│     Status: EMAIL_VERIFIED ⚠️                                   │
│                                                                  │
│  3. PROMPT FOR ADDITIONAL VERIFICATION                          │
│     ┌────────────────────────────────────────────────────┐    │
│     │ ⚠️ Improve Your Trust Level                        │    │
│     │                                                     │    │
│     │ Current: EMAIL_VERIFIED (Weak)                     │    │
│     │                                                     │    │
│     │ To attest certifications, you need higher          │    │
│     │ verification. Choose an option:                    │    │
│     │                                                     │    │
│     │ [Verify VAT Number] (EU businesses) → 🟢          │    │
│     │ [Verify Domain (DNS)] → 🔵                         │    │
│     │ [Request Trust Registry] → ✅ (certification bodies)│    │
│     └────────────────────────────────────────────────────┘    │
│                                                                  │
│  4. CERTIFICATION ATTESTATION BLOCKED                           │
│     if (contributorType === 'CERTIFIER' &&                      │
│         verificationLevel !== 'REGISTRY_VERIFIED') {            │
│       throw new Error(                                          │
│         'Only REGISTRY_VERIFIED contributors can attest'        │
│         + ' certifications. Please apply for verification.'     │
│       );                                                         │
│     }                                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Certification Attestation Restrictions

**Enforcement:**

```typescript
async function createAttestation(contributorId: string, data: AttestationData) {
  const contributor = await prisma.contributor.findUnique({ where: { id: contributorId } });

  // Check if attestation includes certifications
  const hasCertifications = data.fields.some(f =>
    ['certifications', 'gots', 'grs', 'ocs', 'iso', 'fsc'].includes(f.key)
  );

  if (hasCertifications && contributor.type === 'CERTIFIER') {
    // Require REGISTRY_VERIFIED for certification attestations
    if (contributor.verificationLevel !== 'REGISTRY_VERIFIED') {
      throw new ForbiddenError(
        'Certification attestations require REGISTRY_VERIFIED status. ' +
        'Please apply for Trust Registry inclusion at Settings → Verification.'
      );
    }

    // Check if certification is in accredited scope
    const certTypes = data.fields.map(f => f.key.toUpperCase());
    const accreditedScopes = await getTrustedIssuerScopes(contributorId);

    const unscopedCerts = certTypes.filter(c => !accreditedScopes.includes(c));
    if (unscopedCerts.length > 0) {
      throw new ForbiddenError(
        `Not accredited for: ${unscopedCerts.join(', ')}. ` +
        `Your accredited scopes: ${accreditedScopes.join(', ')}`
      );
    }
  }

  // Non-certification attestations allow VAT_VERIFIED or higher
  if (!hasCertifications) {
    const allowedLevels = ['VAT_VERIFIED', 'LEI_VERIFIED', 'DNS_VERIFIED', 'REGISTRY_VERIFIED', 'EUDI_VERIFIED'];

    if (!allowedLevels.includes(contributor.verificationLevel)) {
      // Still allow but show warning
      data.metadata = {
        ...data.metadata,
        lowTrustWarning: true,
        verificationLevel: contributor.verificationLevel,
      };
    }
  }

  // Create attestation...
}
```

---

### Trust Display in UI

**Trusted Certification Body (REGISTRY_VERIFIED):**
```
┌────────────────────────────────────────────────────────────────┐
│  ✅ REGISTRY_VERIFIED                                           │
│  Control Union Certifications                                  │
│  ✓ In EuroComply Trust Registry since 2026-01-01              │
│  ✓ Accredited for: GOTS, OCS, GRS, RCS                        │
│  ✓ Verified via IOAS accreditation registry                   │
└────────────────────────────────────────────────────────────────┘
```

**Verified Business (VAT_VERIFIED):**
```
┌────────────────────────────────────────────────────────────────┐
│  🟢 VAT_VERIFIED                                                │
│  EcoTextiles GmbH                                              │
│  VAT: DE123456789 - Verified via EU VIES                      │
│  Business legally registered in Germany                        │
└────────────────────────────────────────────────────────────────┘
```

**Unverified (EMAIL_VERIFIED only - WARNING):**
```
┌────────────────────────────────────────────────────────────────┐
│  ⚠️ EMAIL_VERIFIED ONLY                                         │
│  "Control Union" (controlunion.io)                             │
│  ⚠️ NOT in Trust Registry - Identity NOT verified              │
│  ⚠️ controlunion.io is NOT the official domain                 │
│  ⚠️ Do not trust certification claims without verification    │
└────────────────────────────────────────────────────────────────┘
```

### Certification Attestation Rules

**Only REGISTRY_VERIFIED issuers can provide trusted certification attestations.**

| Contributor Level | Can Attest Certifications? | Display |
|-------------------|---------------------------|---------|
| REGISTRY_VERIFIED | ✅ Yes (trusted) | Green checkmark |
| VAT/LEI_VERIFIED | ⚠️ Warning displayed | "Certifier not in registry" |
| EMAIL_VERIFIED | ⚠️ Strong warning | "Unverified certifier" |
| SELF_ATTESTED | ⚠️ Strong warning | "Unverified certifier" |

### Customer Responsibility

EuroComply validates:
- ✅ Signature cryptographic validity
- ✅ REGISTRY_VERIFIED status for certification bodies
- ✅ VAT/LEI against official registries
- ✅ DNS TXT records for domain ownership

EuroComply does NOT validate:
- ❌ Attestation content accuracy (we verify WHO signed, not WHETHER claims are true)
- ❌ Certification validity with the actual certification body
- ❌ Real-world identity for EMAIL_VERIFIED or SELF_ATTESTED contributors

Customers are responsible for:
- Verifying attestation accuracy
- Checking certification validity with issuing body
- Not trusting EMAIL_VERIFIED contributors for certifications

**See [VERIFIABLE_CREDENTIALS.md Section 17](./VERIFIABLE_CREDENTIALS.md#17-identity-verification-solving-the-trust-gap) for full identity verification architecture.**

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
