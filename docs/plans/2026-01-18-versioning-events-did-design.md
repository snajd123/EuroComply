# Versioning, Events, and DID Architecture Design

**Status:** Draft
**Date:** 2026-01-18
**Source:** Brainstorming session - Versioning system refinement

---

## 1. Overview

This document defines the data ownership patterns, event models, and cryptographic identity architecture for EuroComply. The core insight is that different workspaces have fundamentally different data patterns:

| Workspace | Data Pattern | Model |
|-----------|--------------|-------|
| **Design** | Iterative content (BOMs evolve through drafts) | `ProductVersion` |
| **Marketing** | Iterative content (descriptions refined) | `ProductVersion` |
| **Operations** | Immutable facts (production happened) | `OperationsEvent` |
| **Compliance** | Legal snapshots (DPP issued) | `DPPSnapshot` |

**Key Principle:** "Reviewing a Plan" (Design/Marketing) vs "Verifying a Fact" (Operations) vs "Auditing a Snapshot" (Compliance).

---

## 2. Key Decisions

| Decision | Resolution |
|----------|------------|
| Versioning scope | Only DESIGN and MARKETING use `ProductVersion` |
| Operations model | Polymorphic `OperationsEvent` table with Zod validation |
| Compliance model | `DPPSnapshot` with deep-cloned data |
| Authority model | 4 levels (VIEWER, CONTRIBUTOR, EDITOR, MANAGER) across all workspaces |
| Four-Eyes Principle | CONTRIBUTOR acts → EDITOR seals |
| DID model | Per-user DIDs + Corporate Envelope for high-stakes gates |
| Revocation | Status List 2021 + RFC3161 timestamp proof |
| Hash chain | Per-organization, sequential, tamper-evident |

---

## 3. Workspace Authority Model

The "Four-Eyes Principle" ensures that one person acts and another verifies, but the nature of the review differs by workspace.

### 3.1 Design & Marketing (Content Versioning)

| Authority | Action |
|-----------|--------|
| VIEWER | Read versions |
| CONTRIBUTOR | Edit drafts, submit for review |
| EDITOR | Approve, release (makes version immutable) |
| MANAGER | Full control, workspace settings |

**State Machine:**
```
DRAFT → PENDING_REVIEW → IN_REVIEW → RELEASED (immutable)
                    ↓              ↓
                  DRAFT        REJECTED → DRAFT
```

### 3.2 Operations (Industrial Notary)

| Authority | Action |
|-----------|--------|
| VIEWER | View events, inventory |
| CONTRIBUTOR | Log events (PENDING_VERIFICATION) |
| EDITOR | Verify/seal events (VERIFIED, immutable) |
| MANAGER | Full control, override errors |

### 3.3 Compliance (Snapshot Audit)

| Authority | Action |
|-----------|--------|
| VIEWER | View DPPs, attestations |
| CONTRIBUTOR | Prepare DPP, run pre-flight checks |
| EDITOR | Attest and issue DPP (triggers Corporate Envelope) |
| MANAGER | Full control, revoke DPPs |

---

## 4. Operations Event Model

### 4.1 Design Decision: Single Polymorphic Table

Operations uses a single `OperationsEvent` table with type-specific payloads validated by Zod schemas. This creates a unified "Forensic Ledger" that enables:

- **Audit Trail:** Sequential, immutable event chain
- **Hash Chain:** Tamper-evident with `previousEventHash`
- **Extensibility:** New event types without schema migrations
- **Timeline API:** Single query for product journey

### 4.2 Event Types

| Event Type | Triggered By | Key Payload Fields |
|------------|--------------|-------------------|
| `BATCH_PRODUCED` | Factory produces units | productId, designVersionId, quantity, facility |
| `MATERIAL_CONSUMED` | Production uses materials | batchId, materialLotId, quantity, wasteQuantity |
| `GOODS_RECEIVED` | Warehouse receives shipment | supplierId, purchaseOrderId, items[] |
| `GOODS_SHIPPED` | Warehouse ships | destinationId, items[], carrier |
| `QUALITY_CHECK` | QA inspection | targetId, targetType, passed, findings |
| `INVENTORY_ADJUSTMENT` | Stock correction | materialLotId, previousQuantity, newQuantity, reasonCode |
| `SUPPLIER_AUDIT` | Auditor observation | supplierId, auditType, findings, passed |

### 4.3 Zod Schemas

```typescript
import { z } from 'zod';

export const BatchProducedSchema = z.object({
  productId: z.string(),
  designVersionId: z.string(),
  batchNumber: z.string(),
  quantity: z.number().positive(),
  unit: z.enum(['PCS', 'KG', 'M', 'L']),
  facilityId: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});

export const MaterialConsumedSchema = z.object({
  batchId: z.string(),
  materialLotId: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  wasteQuantity: z.number().nonnegative().default(0),
});

export const QualityCheckSchema = z.object({
  targetId: z.string(),
  targetType: z.enum(['BATCH', 'MATERIAL']),
  checkType: z.string(),
  passed: z.boolean(),
  findings: z.string(),
  attachments: z.array(z.string().url()).optional(),
});

export const InventoryAdjustmentSchema = z.object({
  materialLotId: z.string(),
  previousQuantity: z.number(),
  newQuantity: z.number(),
  reasonCode: z.enum(['DAMAGE', 'THEFT', 'DATA_ENTRY_ERROR', 'EXPIRED']),
  notes: z.string(),
});

// Discriminated union for validation
export const EventPayloadSchema = z.discriminatedUnion("eventType", [
  z.object({ eventType: z.literal("BATCH_PRODUCED"), payload: BatchProducedSchema }),
  z.object({ eventType: z.literal("MATERIAL_CONSUMED"), payload: MaterialConsumedSchema }),
  z.object({ eventType: z.literal("QUALITY_CHECK"), payload: QualityCheckSchema }),
  z.object({ eventType: z.literal("INVENTORY_ADJUSTMENT"), payload: InventoryAdjustmentSchema }),
]);
```

### 4.4 Hash Chain Implementation

Per-organization chain creates tamper-evident ledger:

```typescript
async function recordForensicEvent(
  tx: Prisma.TransactionClient,
  orgId: string,
  input: ValidatedEvent
) {
  // 1. Lock organization row to prevent race conditions
  const org = await tx.organization.findUnique({
    where: { id: orgId },
    select: { lastEventHash: true, eventSequence: true }
  });

  const nextSequence = (org.eventSequence || 0) + 1;
  const previousHash = org.lastEventHash || "GENESIS";

  // 2. Generate deterministic hash
  const hashPayload = JSON.stringify({
    payload: input.payload,
    eventType: input.eventType,
    previousHash: previousHash,
    sequence: nextSequence,
    orgId: orgId
  });

  const currentHash = crypto
    .createHash('sha256')
    .update(hashPayload)
    .digest('hex');

  // 3. Insert event and update organization head pointer
  const event = await tx.operationsEvent.create({
    data: {
      ...input,
      eventHash: currentHash,
      previousEventHash: previousHash,
      sequenceNumber: nextSequence
    }
  });

  await tx.organization.update({
    where: { id: orgId },
    data: {
      lastEventHash: currentHash,
      eventSequence: nextSequence
    }
  });

  return event;
}
```

---

## 5. DID and Verifiable Credentials Architecture

### 5.1 Identity Model

| Entity | DID Type | Purpose |
|--------|----------|---------|
| User | `did:key` (Ed25519) | Individual accountability, non-repudiation |
| Organization | `did:key` (Ed25519) | Corporate legal standing |

**Key insight:** `did:key` is self-describing - the public key is embedded in the identifier, enabling offline verification forever.

### 5.2 Corporate Envelope Pattern

High-stakes gates require dual signatures:

1. **User signs:** EDITOR provides their DID signature (internal accountability)
2. **Organization wraps:** System adds org DID signature (legal accountability)

```
┌─────────────────────────────────────────────────────────┐
│  CORPORATE ENVELOPE (org.did signs this wrapper)        │
│  ┌───────────────────────────────────────────────────┐  │
│  │  USER VC (user.did signs the action)              │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  PAYLOAD                                    │  │  │
│  │  │  - Data being attested                      │  │  │
│  │  │  - Timestamp                                │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  │  userSignature: JWS (user.did)                    │  │
│  │  forensicContext: { signerName, role, ... }       │  │
│  └───────────────────────────────────────────────────┘  │
│  orgSignature: JWS (org.did)                            │
│  forensicContext: { orgName, vatNumber, certs, ... }    │
└─────────────────────────────────────────────────────────┘
```

### 5.3 When to Apply Corporate Envelope

| Action | Corporate Envelope? |
|--------|---------------------|
| DRAFT → PENDING_REVIEW | No (internal workflow) |
| Version RELEASED | **Yes** (immutable gate) |
| Operations event VERIFIED | **Yes** (sealed fact) |
| DPP ISSUED | **Yes** (legal document) |
| Internal logs | No (simple JWS sufficient) |

### 5.4 Forensic Context

To enable verification in 2031 when the user may have left the company:

```json
{
  "forensicContext": {
    "signerName": "Maria Santos",
    "signerEmail": "maria@eurocorp.com",
    "signerRole": "EDITOR",
    "workspaceAuthority": "DESIGN:EDITOR",
    "signedAt": "2026-03-15T10:00:00Z"
  }
}
```

For organization:

```json
{
  "forensicContext": {
    "organizationName": "EuroCorp GmbH",
    "organizationId": "org_789",
    "vatNumber": "DE123456789",
    "certifications": ["ISO-9001", "ESPR-REGISTERED"]
  }
}
```

### 5.5 Revocation Architecture

**Problem:** `did:key` has no built-in revocation. A compromised key looks valid forever.

**Solution:** Status List 2021 + RFC3161 Timestamp

```json
{
  "payload": { ... },
  "userProof": { ... },
  "corporateProof": { ... },

  "credentialStatus": {
    "type": "StatusList2021Entry",
    "statusPurpose": "revocation",
    "statusListIndex": "12345",
    "statusListCredential": "https://dpp.eurocomply.eu/status/org_789/2026"
  },

  "timestampProof": {
    "type": "RFC3161",
    "timestamp": "2026-03-15T10:00:05Z",
    "authority": "https://freetsa.org",
    "token": "MIIx...",
    "hashAlgorithm": "SHA-256"
  }
}
```

**Verification Algorithm (2031):**

1. **Signature Check (Offline):** Extract public key from `did:key`, verify signatures
2. **Revocation Check (Online):** Fetch StatusList, check if key is revoked
3. **Timestamp Check (If revoked):** Was signature made BEFORE revocation? If yes, still valid.

---

## 6. Compliance Workflow

### 6.1 Trigger Model (Hybrid)

- **Auto-detect:** System monitors for 100% readiness, creates `DPPSnapshot` in queue
- **Manual:** Compliance officer can initiate anytime

### 6.2 Readiness Engine

Category-specific requirements via `ReadinessProfile`:

```typescript
// Example: Textiles profile
{
  "name": "ESPR Textiles",
  "category": "TEXTILES",
  "requiredFields": {
    "design": ["bom.materials", "bom.fiberComposition", "recycledContent"],
    "marketing": ["consumerLabels", "careInstructions"],
    "operations": ["materialTraceability"]
  },
  "requiredAttestations": ["GOTS", "OEKO-TEX"]
}
```

**Completion Check:**
1. Fetch `ReadinessProfile` for product's category
2. Validate all `requiredFields` are present in RELEASED versions
3. Verify all `requiredAttestations` are valid
4. If 100% → Create `DPPSnapshot` with `status: PENDING_REVIEW`

### 6.3 Data Integrity: Deep Clone

The `DPPSnapshot.data` field contains a **deep clone** of all product data at snapshot time:

- What is signed is exactly what was reviewed
- Original records can be deleted/modified without affecting the DPP
- The snapshot is a complete, self-contained legal artifact

### 6.4 Workflow Stages

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. VERIFICATION (CONTRIBUTOR)                                          │
│     Review snapshot data against EU requirements                        │
│     Crypto: Internal log                                                │
│     Status: PENDING_REVIEW → VERIFIED                                   │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. ATTESTATION (EDITOR)                                                │
│     "I attest this data is accurate and complete"                       │
│     Crypto: User DID Signature                                          │
│     Status: VERIFIED → ATTESTED                                         │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  3. SEALING (SYSTEM)                                                    │
│     Wrap attestation in Corporate Envelope                              │
│     Crypto: Organization DID Signature                                  │
│     Status: ATTESTED → SEALED                                           │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  4. ISSUANCE (SYSTEM)                                                   │
│     Mint W3C VC, generate QR, publish to R2                             │
│     Event: dpp.issued                                                   │
│     Status: SEALED → ISSUED                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.5 Expiry Handling

**Decision:** No automatic expiry tracking.

The DPP is a point-in-time attestation. The timestamp proof demonstrates that all certificates were valid at issuance. The DPP does not become invalid when certificates later expire.

---

## 7. Schema Changes

### 7.1 Organization (Add DID fields)

```prisma
model Organization {
  // ... existing fields

  // DID and Walt.id Integration
  did               String?  @unique
  waltIdKeyId       String?  @map("walt_id_key_id")

  // Hash chain head pointer
  lastEventHash     String?  @map("last_event_hash")
  eventSequence     Int      @default(0) @map("event_sequence")

  // Status list counter
  statusListIndex   Int      @default(0) @map("status_list_index")
}
```

### 7.2 User DID History

```prisma
model UserDidHistory {
  id                String    @id @default(cuid())
  userId            String    @map("user_id")
  did               String
  waltIdKeyId       String    @map("walt_id_key_id")
  validFrom         DateTime  @map("valid_from")
  validTo           DateTime? @map("valid_to")
  revokedAt         DateTime? @map("revoked_at")
  revocationReason  String?   @map("revocation_reason")
  statusListIndex   Int       @map("status_list_index")

  @@index([userId])
  @@index([did])
  @@map("user_did_history")
}
```

### 7.3 Organization DID History

```prisma
model OrgDidHistory {
  id                String    @id @default(cuid())
  organizationId    String    @map("organization_id")
  did               String
  waltIdKeyId       String    @map("walt_id_key_id")
  validFrom         DateTime  @map("valid_from")
  validTo           DateTime? @map("valid_to")
  revokedAt         DateTime? @map("revoked_at")
  revocationReason  String?   @map("revocation_reason")
  statusListIndex   Int       @map("status_list_index")

  @@index([organizationId])
  @@index([did])
  @@map("org_did_history")
}
```

### 7.4 Operations Event

```prisma
model OperationsEvent {
  id                String       @id @default(cuid())
  organizationId    String       @map("organization_id")

  // Event type and payload
  eventType         String       @map("event_type")
  payload           Json

  // Hash chain
  eventHash         String       @map("event_hash")
  previousEventHash String?      @map("previous_event_hash")
  sequenceNumber    Int          @map("sequence_number")

  // Workflow
  status            EventStatus  @default(PENDING_VERIFICATION)

  // Created by (CONTRIBUTOR)
  createdAt         DateTime     @default(now()) @map("created_at")
  createdBy         String       @map("created_by")

  // Verified by (EDITOR) - The "Seal"
  verifiedAt        DateTime?    @map("verified_at")
  verifiedBy        String?      @map("verified_by")

  // Signatures
  userSignatureDid  String?      @map("user_signature_did")
  userSignatureJws  String?      @map("user_signature_jws")
  orgSignatureDid   String?      @map("org_signature_did")
  orgSignatureJws   String?      @map("org_signature_jws")

  // Forensic context (embedded at sign-time)
  forensicContext   Json?        @map("forensic_context")

  // Credential status
  credentialStatusIndex Int?     @map("credential_status_index")
  timestampProof    Json?        @map("timestamp_proof")

  @@index([organizationId, eventType])
  @@index([organizationId, sequenceNumber])
  @@index([status])
  @@map("operations_events")
}

enum EventStatus {
  PENDING_VERIFICATION
  VERIFIED
}
```

### 7.5 Readiness Profile

```prisma
model ReadinessProfile {
  id                  String   @id @default(cuid())
  name                String
  category            String
  requiredFields      Json     @map("required_fields")
  requiredAttestations Json?   @map("required_attestations")

  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  @@map("readiness_profiles")
}
```

### 7.6 DPP Snapshot

```prisma
model DPPSnapshot {
  id                  String            @id @default(cuid())
  organizationId      String            @map("organization_id")
  productId           String            @map("product_id")

  // Version references (audit trail)
  designVersionId     String            @map("design_version_id")
  marketingVersionId  String            @map("marketing_version_id")

  // Deep-cloned data
  data                Json
  dataHash            String            @map("data_hash")

  // Readiness
  readinessProfileId  String            @map("readiness_profile_id")
  completionScore     Int               @map("completion_score")

  // Workflow
  status              DPPSnapshotStatus @default(PENDING_REVIEW)

  // Verification (CONTRIBUTOR)
  verifiedAt          DateTime?         @map("verified_at")
  verifiedBy          String?           @map("verified_by")

  // Attestation (EDITOR)
  attestedAt          DateTime?         @map("attested_at")
  attestedBy          String?           @map("attested_by")
  userSignatureDid    String?           @map("user_signature_did")
  userSignatureJws    String?           @map("user_signature_jws")

  // Sealing (SYSTEM)
  sealedAt            DateTime?         @map("sealed_at")
  orgSignatureDid     String?           @map("org_signature_did")
  orgSignatureJws     String?           @map("org_signature_jws")

  // Forensic context
  userForensicContext Json?             @map("user_forensic_context")
  orgForensicContext  Json?             @map("org_forensic_context")

  // Issuance
  issuedAt            DateTime?         @map("issued_at")
  vcId                String?           @map("vc_id")
  vcJwt               String?           @map("vc_jwt")
  dppUrl              String?           @map("dpp_url")
  qrCodeUrl           String?           @map("qr_code_url")

  // Revocation
  credentialStatusIndex Int?            @map("credential_status_index")
  timestampProof      Json?             @map("timestamp_proof")

  // Timestamps
  createdAt           DateTime          @default(now()) @map("created_at")
  updatedAt           DateTime          @updatedAt @map("updated_at")

  @@index([organizationId, status])
  @@index([productId])
  @@map("dpp_snapshots")
}

enum DPPSnapshotStatus {
  PENDING_REVIEW
  VERIFIED
  ATTESTED
  SEALED
  ISSUED
  REVOKED
}
```

### 7.7 Refactor Workspace Enum

Remove OPERATIONS and COMPLIANCE from ProductVersion:

```prisma
enum Workspace {
  DESIGN
  MARKETING
  // OPERATIONS - removed, uses OperationsEvent
  // COMPLIANCE - removed, uses DPPSnapshot
}
```

---

## 8. Sealed Artifact Structure (Complete)

The final structure for any high-stakes sealed artifact:

```json
{
  "payload": {
    "type": "ProductVersionRelease",
    "productId": "prod_123",
    "versionNumber": 3,
    "data": { ... },
    "sealedAt": "2026-03-15T10:00:00Z"
  },

  "userProof": {
    "type": "Ed25519Signature2020",
    "verificationMethod": "did:key:z6MkUser...#z6MkUser...",
    "signatureValue": "eyJ...",
    "created": "2026-03-15T10:00:00Z",
    "forensicContext": {
      "signerName": "Maria Santos",
      "signerEmail": "maria@eurocorp.com",
      "signerRole": "EDITOR",
      "workspaceAuthority": "DESIGN:EDITOR"
    }
  },

  "corporateProof": {
    "type": "Ed25519Signature2020",
    "verificationMethod": "did:key:z6MkOrg...#z6MkOrg...",
    "signatureValue": "eyJ...",
    "created": "2026-03-15T10:00:01Z",
    "forensicContext": {
      "organizationName": "EuroCorp GmbH",
      "organizationId": "org_789",
      "vatNumber": "DE123456789",
      "certifications": ["ISO-9001", "ESPR-REGISTERED"]
    }
  },

  "credentialStatus": {
    "type": "StatusList2021Entry",
    "statusPurpose": "revocation",
    "statusListIndex": "12345",
    "statusListCredential": "https://dpp.eurocomply.eu/status/org_789/2026"
  },

  "timestampProof": {
    "type": "RFC3161",
    "timestamp": "2026-03-15T10:00:05Z",
    "authority": "https://freetsa.org",
    "token": "MIIx...",
    "hashAlgorithm": "SHA-256"
  }
}
```

---

## 9. Verification Algorithm

For auditors verifying a sealed artifact in 2031:

```
1. SIGNATURE CHECK (Offline)
   ├─ Extract public key from did:key (self-describing)
   ├─ Verify userProof.signatureValue against payload
   ├─ Verify corporateProof.signatureValue against userProof
   └─ Result: ✅ Valid / ❌ Invalid → REJECT

2. REVOCATION CHECK (Online)
   ├─ Fetch credentialStatus.statusListCredential
   ├─ Decode bitstring at statusListIndex
   └─ If bit = 0 → ✅ Not revoked
      If bit = 1 → Check timestamp...

3. TIMESTAMP CHECK (If revoked)
   ├─ Verify RFC3161 token from TSA
   ├─ Compare timestampProof.timestamp vs revocationDate
   └─ Signed BEFORE revocation → ✅ ACCEPT
      Signed AFTER revocation → ❌ REJECT
```

---

## 10. Implementation Priority

| Phase | Component | Effort |
|-------|-----------|--------|
| 1 | Refactor `Workspace` enum (remove OPERATIONS, COMPLIANCE) | Low |
| 2 | Add DID fields to Organization | Low |
| 3 | Create `OperationsEvent` table and service | Medium |
| 4 | Implement hash chain logic | Medium |
| 5 | Create `ReadinessProfile` and `DPPSnapshot` tables | Medium |
| 6 | Implement Corporate Envelope signing | High |
| 7 | Status List 2021 revocation registry | Medium |
| 8 | RFC3161 TSA integration | Medium |
| 9 | Verification service | Medium |

---

## 11. Related Documents

- [Design Workspace Design](./2026-01-15-design-workspace-design.md) - BOM and version workflow
- [Operations Workspace Design](./2026-01-15-operations-workspace-design.md) - Event model details
- [User Management Design](./2026-01-15-user-management-design.md) - Authority model
- [Verifiable Credentials Design](./2026-01-15-verifiable-credentials-design.md) - VC technical details

---

*Last Updated: 2026-01-18*
