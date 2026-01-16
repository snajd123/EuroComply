# Compliance Workspace (DPP Snapshot Engine) Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** Brainstorming session - Compliance Workspace

---

## 1. Overview

The Compliance Workspace is the **convergence point** where Design, Marketing, and Operations unite to "mint" the Digital Product Passport. It implements the "Birth Certificate" model - treating each DPP as a permanent, immutable record of a product's identity and provenance.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Birth Certificate** | DPP URI reserved at serial creation; data frozen at batch release |
| **Snapshot Immutability** | Once sealed, the DPP data never changes (no live lookups) |
| **Progressive Disclosure** | Same URL serves consumers (Story) and auditors (Evidence) |
| **Proof Ceremony** | Verification is a ritual that builds trust through perceived rigor |
| **Offline-First** | Client-side verification works without network connectivity |

### Ownership

| Owns | Description |
|------|-------------|
| DPP Snapshots | Frozen bundles of Design + Marketing + Operations data |
| Public Landing Pages | Consumer-facing "Transparency Funnel" UI |
| Verification Engine | Cryptographic proof ceremony and API |
| Revocation Registry | Recall/decommission status tracking |
| GS1 Digital Link Resolver | Smart routing based on audience |

### Relationship to Other Workspaces

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORKSPACE CONVERGENCE MODEL                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   DESIGN    │     │  MARKETING  │     │ OPERATIONS  │                   │
│  │   (PLM)     │     │    (PIM)    │     │  (EVIDENCE) │                   │
│  │             │     │             │     │             │                   │
│  │  • BOM      │     │  • Story    │     │  • Notary   │                   │
│  │  • Specs    │     │  • Images   │     │  • GPS      │                   │
│  │  • Version  │     │  • Locale   │     │  • Certs    │                   │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                   │
│         │                   │                   │                           │
│         └───────────────────┼───────────────────┘                           │
│                             │                                               │
│                             ▼                                               │
│              ┌─────────────────────────────┐                               │
│              │     COMPLIANCE WORKSPACE     │                               │
│              │    (DPP Snapshot Engine)     │                               │
│              │                              │                               │
│              │  • Gather from 3 workspaces  │                               │
│              │  • Bundle into frozen JSONB  │                               │
│              │  • Seal with Brand's DID     │                               │
│              │  • Serve via Digital Link    │                               │
│              └──────────────┬───────────────┘                               │
│                             │                                               │
│                             ▼                                               │
│              ┌─────────────────────────────┐                               │
│              │    PUBLIC LANDING PAGE       │                               │
│              │   (Transparency Funnel)      │                               │
│              │                              │                               │
│              │  Level 1: Brand Story        │                               │
│              │  Level 2: Journey & Materials│                               │
│              │  Level 3: Forensic Seal      │                               │
│              └─────────────────────────────┘                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Authority Model

> **Reference:** See [User Management Design](./2026-01-15-user-management-design.md) for complete authority model.

| Authority | Compliance Workspace Capabilities |
|-----------|----------------------------------|
| **MANAGER** | Configure snapshot rules, manage revocations, access all DPPs |
| **EDITOR** | View all DPPs, trigger manual re-snapshots (rare), manage recalls |
| **CONTRIBUTOR** | View DPPs for their products, download verification reports |
| **VIEWER** | Read-only access to DPP registry |

**Note:** Most Compliance Workspace operations are automated. Human intervention is rare and typically limited to recall management.

---

## 3. Module Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLIANCE WORKSPACE (DPP SNAPSHOT ENGINE)                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CORE MODULES                                                               │
│  ────────────                                                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Snapshot   │  │   Public    │  │ Verification│  │ Revocation  │        │
│  │   Engine    │  │   Resolver  │  │   Ceremony  │  │  Registry   │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                   │                                          │
│  SNAPSHOT ENGINE                  ▼                                          │
│  ────────────────    ┌─────────────────────────────────────────────────┐   │
│                      │              DPP SNAPSHOT                         │   │
│  Operations ────────►│                                                   │   │
│  (Serial Created)    │  ┌───────────┐ ┌───────────┐ ┌───────────┐      │   │
│                      │  │  Design   │ │ Marketing │ │ Operations│      │   │
│  Batch Released ────►│  │  Data     │ │   Data    │ │   Data    │      │   │
│  (Trigger Freeze)    │  │ (frozen)  │ │ (frozen)  │ │ (frozen)  │      │   │
│                      │  └───────────┘ └───────────┘ └───────────┘      │   │
│                      │                                                   │   │
│                      │  snapshot_hash + issuance_jws + rfc3161_token    │   │
│                      └─────────────────────────────────────────────────┘   │
│                                   │                                          │
│  PUBLIC RESOLVER                  ▼                                          │
│  ───────────────     ┌─────────────────────────────────────────────────┐   │
│                      │           GS1 DIGITAL LINK RESOLVER              │   │
│  Consumer Scan ─────►│  /01/{gtin}/21/{serial}                          │   │
│  (No Auth)           │                    │                              │   │
│                      │     ┌──────────────┼──────────────┐              │   │
│  Customs Scan ──────►│     ▼              ▼              ▼              │   │
│  (eIDAS Auth)        │  Level 1       Level 2       Level 3             │   │
│                      │  (Story)      (Journey)    (Forensic)            │   │
│                      └─────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. DPP Lifecycle (Birth Certificate Model)

### 4.1 The Problem with Deferred Minting

If we wait for "Batch Release" or "On-Demand" triggers, we create a production bottleneck. A worker on an assembly line cannot wait for a compliance manager in a different timezone to "approve a minting" before applying a physical label.

### 4.2 The Solution: Reserve Early, Freeze Late

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DPP LIFECYCLE STATE MACHINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  COMMISSIONED ────► PROVISIONED ────► ACTIVE ────► DECOMMISSIONED           │
│       │                  │               │               │                   │
│       │                  │               │               │                   │
│       ▼                  ▼               ▼               ▼                   │
│  ┌─────────┐       ┌─────────┐     ┌─────────┐     ┌─────────┐             │
│  │ URI     │       │ Data    │     │ Public  │     │ End of  │             │
│  │Reserved │       │ Frozen  │     │ Access  │     │ Life    │             │
│  │         │       │         │     │         │     │         │             │
│  │ Empty   │       │ Full    │     │ Story   │     │ Archive │             │
│  │ Shell   │       │Snapshot │     │ Visible │     │ Only    │             │
│  └─────────┘       └─────────┘     └─────────┘     └─────────┘             │
│                                                                              │
│                          ┌─────────┐                                        │
│                          │RECALLED │ (Special State - Overlay Warning)      │
│                          └─────────┘                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 State Definitions

| State | Trigger | Physical Status | Digital Data | Public Access |
|-------|---------|-----------------|--------------|---------------|
| **COMMISSIONED** | Serial created in Operations | QR label printed/applied | Empty shell (URI only) | "Coming Soon" page |
| **PROVISIONED** | Batch released + Evidence sealed | Product in warehouse | Full frozen snapshot | "Preview" (optional) |
| **ACTIVE** | Delivery confirmed or "Sold" | In customer hands | Full snapshot | Full "Story" page |
| **RECALLED** | Quality issue in Lot/Batch | On shelf / In use | Snapshot + Warning | "RECALL NOTICE" overlay |
| **DECOMMISSIONED** | End of life / Recycled | Disposed | Archived snapshot | "Product Retired" page |

### 4.4 State Transitions

```typescript
// Valid state transitions
const DPP_TRANSITIONS = {
  COMMISSIONED: ['PROVISIONED'],           // Batch released
  PROVISIONED: ['ACTIVE', 'RECALLED'],     // Delivered or recalled before sale
  ACTIVE: ['RECALLED', 'DECOMMISSIONED'],  // Issue found or end of life
  RECALLED: ['ACTIVE', 'DECOMMISSIONED'],  // Recall resolved or disposed
  DECOMMISSIONED: [],                      // Terminal state
};

// Transition triggers
interface DPPTransition {
  from_state: DPPStatus;
  to_state: DPPStatus;
  trigger: 'BATCH_RELEASED' | 'DELIVERY_CONFIRMED' | 'RECALL_ISSUED' |
           'RECALL_RESOLVED' | 'END_OF_LIFE';
  triggered_by: 'SYSTEM' | 'USER';
  reason_code: string;
  timestamp: string;
}
```

### 4.5 Billing Triggers

The DPP lifecycle has specific billing implications:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BILLING EVENTS                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  COMMISSIONED → PROVISIONED                                                 │
│  ══════════════════════════                                                  │
│  ✅ PER-DPP FEE TRIGGERED                                                    │
│  • This is the ONLY billing event for DPP creation                          │
│  • Charged per-DPP according to tier pricing                                │
│  • Covers 10-year hosting, VC issuance, QR generation                       │
│                                                                              │
│  ACTIVE → RECALLED (or PROVISIONED → RECALLED)                              │
│  ═════════════════════════════════════════════                               │
│  ✅ RECALL INITIATION FEE                                                    │
│  • €0.001 per item in affected scope                                        │
│  • Covers Status List updates, notifications, overlay injection             │
│  • Minimum charge: €10.00                                                   │
│                                                                              │
│  RECALLED → ACTIVE                                                          │
│  ═════════════════                                                           │
│  ✅ RECALL RESOLUTION FEE                                                    │
│  • €0.0005 per item resolved                                                │
│  • Covers Status List updates, overlay removal                              │
│  • Minimum charge: €5.00                                                    │
│                                                                              │
│  OTHER TRANSITIONS                                                          │
│  ═════════════════                                                           │
│  ❌ No billing events for:                                                   │
│  • Serial creation (COMMISSIONED state)                                     │
│  • Delivery confirmation (PROVISIONED → ACTIVE)                             │
│  • End of life (→ DECOMMISSIONED)                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why Bill at Provisioning, Not Creation:**
1. Factory workers can print labels immediately (no bottleneck)
2. Failed batches never incur DPP fees
3. Cost aligns with actual value delivered (frozen, sealed data)
4. Simple to track: one event per DPP, ever

> **Reference:** See [Billing Design](./2026-01-15-billing-design.md#dpp-billing-trigger) for complete billing details.
> **Reference:** See [Operations Workspace Design](./2026-01-15-operations-workspace-design.md#124-dpp-lifecycle-integration) for the Operations→Compliance trigger bridge.

---

## 5. Snapshot Engine

### 5.1 Pre-Flight Checks

Before a DPP can transition from COMMISSIONED to PROVISIONED, the Compliance Workspace runs an automated **Snapshot Audit**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRE-FLIGHT SNAPSHOT AUDIT                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CHECK 1: DESIGN READINESS                                                  │
│  ─────────────────────────                                                   │
│  □ Design Version status = RELEASED                                         │
│  □ BOM has at least one line item                                          │
│  □ All BOM facilities are VERIFIED in Operations                           │
│  □ No expired certifications on any facility                               │
│                                                                              │
│  CHECK 2: MARKETING READINESS                                               │
│  ────────────────────────────                                                │
│  □ Marketing Version exists for this Design Version                         │
│  □ At least one locale has PUBLISHED content                               │
│  □ Hero image uploaded and processed                                        │
│  □ Product description minimum length met (50 chars)                        │
│                                                                              │
│  CHECK 3: OPERATIONS READINESS                                              │
│  ─────────────────────────────                                               │
│  □ Batch has Digital Seal (all events signed)                              │
│  □ Notary chain hash integrity verified                                     │
│  □ All serials have valid EPC assignments                                  │
│  □ Origin facility has GPS coordinates (EUDR)                              │
│                                                                              │
│  RESULT: ALL CHECKS PASS ────► PROCEED TO SNAPSHOT                          │
│          ANY CHECK FAILS ────► BLOCK WITH DETAILED ERRORS                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Snapshot Trigger Service

```typescript
interface SnapshotTriggerService {
  // Called when batch status changes to RELEASED
  onBatchReleased(batchId: string): Promise<SnapshotResult>;
}

interface SnapshotResult {
  success: boolean;
  dpps_created: number;
  dpps_failed: number;
  errors: SnapshotError[];
}

// The snapshot creation flow
async function createDPPSnapshot(serialId: string): Promise<DPPSnapshot> {
  // 1. GATHER: Fetch from Design Workspace
  const serial = await getSerial(serialId);
  const batch = await getBatch(serial.batchId);
  const designVersion = await getDesignVersion(batch.designVersionId);
  const bom = await getBOM(designVersion.id);

  const designData: DesignSnapshotData = {
    product_id: designVersion.productId,
    product_name: designVersion.product.name,
    version_number: designVersion.versionNumber,
    released_at: designVersion.releasedAt,
    category: designVersion.product.category,
    specifications: designVersion.specifications,
    bom_snapshot: bom.lines.map(line => ({
      material_name: line.material.name,
      quantity: line.quantity,
      unit: line.unit,
      facility_id: line.facilityId,
      facility_name: line.facility.name,
      facility_gln: line.facility.gln,
    })),
  };

  // 2. GATHER: Fetch from Marketing Workspace
  const marketingVersion = await getMarketingVersion(designVersion.id);
  const content = await getPublishedContent(marketingVersion.id);
  const assets = await getMediaAssets(marketingVersion.id);

  const marketingData: MarketingSnapshotData = {
    hero_image_url: assets.heroImage?.cdnUrl,
    locales: content.map(c => ({
      locale: c.locale,
      product_name: c.productName,
      tagline: c.tagline,
      description: c.description,
      features: c.features,
      sustainability_claims: c.sustainabilityClaims,
    })),
    impact_badges: calculateImpactBadges(designData, content),
  };

  // 3. GATHER: Fetch from Operations Workspace
  const evidencePackage = await getEvidencePackage(batch.id);
  const notaryChain = await getNotaryChain(batch.id);

  const operationsData: OperationsSnapshotData = {
    serial_number: serial.serialNumber,
    epc: serial.epc,
    batch_number: batch.batchNumber,
    lot_number: batch.lot.lotNumber,
    production_date: batch.productionDate,
    origin_facility: {
      id: batch.facilityId,
      name: batch.facility.name,
      gln: batch.facility.gln,
      coordinates: batch.facility.coordinates,
      country_code: batch.facility.countryCode,
    },
    notary_chain_summary: {
      event_count: notaryChain.events.length,
      first_event: notaryChain.events[0].timestamp,
      last_event: notaryChain.events[notaryChain.events.length - 1].timestamp,
      chain_hash: notaryChain.chainHash,
      all_signatures_valid: notaryChain.integrityCheck.allSignaturesValid,
    },
    certifications: evidencePackage.pillars.supply_chain_integrity.facilities
      .flatMap(f => f.certifications_snapshot),
  };

  // 4. BUNDLE: Create the frozen snapshot
  const snapshotContent = {
    design: designData,
    marketing: marketingData,
    operations: operationsData,
    metadata: {
      snapshot_version: '1.0',
      created_at: new Date().toISOString(),
      espr_compliant: true,
    },
  };

  // 5. SEAL: Hash and sign
  const snapshotHash = sha256(canonicalize(snapshotContent));
  const issuanceJws = await signWithBrandDID(
    batch.organizationId,
    snapshotHash
  );

  // 6. TIMESTAMP: Collect hash for Merkle tree (all tiers)
  // Actual RFC 3161 timestamp is obtained per-batch, not per-DPP
  // See: batchTimestampService.addHash(batchId, snapshotHash)
  await batchTimestampService.addHash(batch.id, snapshotHash);

  // 7. PERSIST: Save the immutable record (timestamp_proof added after batch completes)
  return await db.dppSnapshot.create({
    serial_id: serialId,
    dpp_uri: generateDigitalLinkURI(serial),
    design_data: designData,
    marketing_data: marketingData,
    operations_data: operationsData,
    snapshot_hash: snapshotHash,
    issuance_jws: issuanceJws,
    timestamp_proof: timestampProof,
    status: 'PROVISIONED',
  });
}
```

### 5.3 Data Model

```sql
-- DPP Status enum
CREATE TYPE dpp_status AS ENUM (
    'COMMISSIONED',     -- URI reserved, no data
    'PROVISIONED',      -- Data frozen, not yet public
    'ACTIVE',           -- Publicly accessible
    'RECALLED',         -- Warning overlay active
    'DECOMMISSIONED'    -- End of life
);

-- The core DPP Snapshot table
CREATE TABLE dpp_snapshot (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    serial_id           UUID NOT NULL UNIQUE REFERENCES serial_number(id),

    -- The Permanent URI (GS1 Digital Link format)
    dpp_uri             VARCHAR(500) UNIQUE NOT NULL,
    gtin                VARCHAR(14) NOT NULL,
    serial_number       VARCHAR(50) NOT NULL,

    -- THE FROZEN DATA (never changes after PROVISIONED)
    design_data         JSONB NOT NULL DEFAULT '{}',
    marketing_data      JSONB NOT NULL DEFAULT '{}',
    operations_data     JSONB NOT NULL DEFAULT '{}',

    -- Integrity Seal
    snapshot_hash       VARCHAR(64) NOT NULL,
    issuance_jws        TEXT NOT NULL,
    signer_did          VARCHAR(255) NOT NULL,

    -- RFC 3161 Timestamp (All tiers via Merkle batching)
    timestamp_proof     JSONB,       -- Contains: merkle_root, merkle_proof[], tsa_token
    merkle_proof        JSONB,       -- Path from this DPP hash to the timestamped root

    -- Lifecycle
    status              dpp_status NOT NULL DEFAULT 'COMMISSIONED',
    commissioned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    provisioned_at      TIMESTAMPTZ,
    activated_at        TIMESTAMPTZ,
    decommissioned_at   TIMESTAMPTZ,

    -- Recall handling
    recall_id           UUID REFERENCES recall(id),
    recall_overlay      JSONB,  -- Warning message, instructions

    -- Audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_dpp_snapshot_org ON dpp_snapshot (organization_id);
CREATE INDEX idx_dpp_snapshot_gtin ON dpp_snapshot (gtin);
CREATE INDEX idx_dpp_snapshot_serial ON dpp_snapshot (serial_number);
CREATE INDEX idx_dpp_snapshot_status ON dpp_snapshot (status);
CREATE INDEX idx_dpp_snapshot_uri ON dpp_snapshot (dpp_uri);

-- Batch Timestamp Registry (Merkle roots)
CREATE TABLE batch_timestamp (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id            UUID NOT NULL REFERENCES batch(id),

    -- Merkle tree data
    merkle_root         VARCHAR(64) NOT NULL,
    dpp_count           INT NOT NULL,

    -- RFC 3161 timestamp from TSA
    tsa_token           BYTEA NOT NULL,
    tsa_authority       VARCHAR(255) NOT NULL,  -- 'DigiCert', 'Sectigo', etc.
    tsa_timestamp       TIMESTAMPTZ NOT NULL,

    -- Verification
    verified            BOOLEAN DEFAULT FALSE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_batch_timestamp_batch ON batch_timestamp (batch_id);
```

### 5.4 Merkle Tree Timestamp Service

RFC 3161 timestamps are included for **all tiers** using Merkle tree batching:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MERKLE TREE TIMESTAMPING                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Per-DPP: €0.01 × 500 = €5.00        Merkle: €0.01 total = €0.00002/DPP    │
│                                                                              │
│  HOW IT WORKS:                                                              │
│  ─────────────                                                               │
│                                                                              │
│  1. COLLECT: Each DPP snapshot hash added to batch                          │
│     DPP-001: a1b2c3...                                                      │
│     DPP-002: d4e5f6...                                                      │
│     DPP-003: g7h8i9...                                                      │
│     ...                                                                      │
│                                                                              │
│  2. BUILD: Construct Merkle tree when batch RELEASED                        │
│                                                                              │
│                    [ROOT: x9y8z7...]  ◄── TSA timestamps this               │
│                   /                  \                                       │
│          [ab12...]                   [cd34...]                              │
│         /        \                  /        \                              │
│     [a1b2]     [d4e5]          [g7h8]     [...]                            │
│                                                                              │
│  3. TIMESTAMP: Single RFC 3161 call for the Merkle root                     │
│     POST /tsa → { merkle_root: "x9y8z7...", ... }                          │
│     Response: TSA token (signed timestamp)                                  │
│                                                                              │
│  4. STORE: Each DPP gets its Merkle proof                                   │
│     DPP-001.merkle_proof = [d4e5..., cd34...]                              │
│     (Path from a1b2 up to root x9y8z7)                                      │
│                                                                              │
│  5. VERIFY: Anyone can prove inclusion                                      │
│     hash(a1b2 + d4e5) → ab12                                               │
│     hash(ab12 + cd34) → x9y8z7 ← matches TSA-signed root ✓                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

```typescript
// Merkle Tree Timestamp Service
interface BatchTimestampService {
  // Called for each DPP as it's created
  addHash(batchId: string, snapshotHash: string): Promise<void>;

  // Called when batch is RELEASED - builds tree and gets timestamp
  finalizeBatch(batchId: string): Promise<BatchTimestampResult>;

  // Called to verify a DPP's timestamp
  verifyTimestamp(dppId: string): Promise<TimestampVerification>;
}

interface BatchTimestampResult {
  merkle_root: string;
  tsa_token: Buffer;
  tsa_authority: string;
  tsa_timestamp: Date;
  dpp_proofs: Map<string, string[]>;  // dppId → merkle proof path
}

async function finalizeBatch(batchId: string): Promise<BatchTimestampResult> {
  // 1. Get all snapshot hashes for this batch
  const hashes = await getBatchSnapshotHashes(batchId);

  // 2. Build Merkle tree
  const tree = new MerkleTree(hashes, sha256);
  const merkleRoot = tree.getRoot().toString('hex');

  // 3. Get RFC 3161 timestamp from TSA
  const tsaResponse = await requestTimestamp(merkleRoot, {
    authority: 'DigiCert',  // or 'Sectigo', 'FreeTSA'
    hashAlgorithm: 'SHA-256'
  });

  // 4. Store batch timestamp record
  await db.batchTimestamp.create({
    batch_id: batchId,
    merkle_root: merkleRoot,
    dpp_count: hashes.length,
    tsa_token: tsaResponse.token,
    tsa_authority: tsaResponse.authority,
    tsa_timestamp: tsaResponse.timestamp
  });

  // 5. Update each DPP with its Merkle proof
  const proofs = new Map<string, string[]>();
  for (const hash of hashes) {
    const proof = tree.getProof(hash).map(p => p.data.toString('hex'));
    const dppId = await getDppIdByHash(hash);
    proofs.set(dppId, proof);

    await db.dppSnapshot.update(dppId, {
      merkle_proof: proof,
      timestamp_proof: {
        merkle_root: merkleRoot,
        tsa_token: tsaResponse.token.toString('base64'),
        tsa_authority: tsaResponse.authority,
        tsa_timestamp: tsaResponse.timestamp.toISOString()
      }
    });
  }

  return {
    merkle_root: merkleRoot,
    tsa_token: tsaResponse.token,
    tsa_authority: tsaResponse.authority,
    tsa_timestamp: tsaResponse.timestamp,
    dpp_proofs: proofs
  };
}
```

**Cost Savings:**

| Batch Size | Individual TSA | Merkle Batched | Savings |
|------------|----------------|----------------|---------|
| 100 DPPs | €1.00 | €0.01 | 99% |
| 500 DPPs | €5.00 | €0.01 | 99.8% |
| 1,000 DPPs | €10.00 | €0.01 | 99.9% |

### 5.5 Merkle Path Verification Ceremony

The **Verification Ceremony** is the cryptographic proof that a specific DPP was timestamped at a specific moment. This enables third parties to independently verify authenticity without trusting EuroComply.

#### 5.5.1 Verification Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MERKLE PATH VERIFICATION CEREMONY                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INPUTS (from DPP record):                                                  │
│  ────────────────────────                                                   │
│  • dpp_content_hash: "a1b2c3d4..."     (SHA-256 of frozen DPP data)        │
│  • merkle_proof: ["d4e5f6...", "cd34ef..."]  (sibling hashes)              │
│  • merkle_root: "x9y8z7w6..."          (root that was timestamped)          │
│  • tsa_token: <binary>                  (RFC 3161 timestamp response)       │
│                                                                              │
│  CEREMONY STEPS:                                                            │
│  ───────────────                                                            │
│                                                                              │
│  STEP 1: RECOMPUTE THE MERKLE ROOT                                          │
│  ─────────────────────────────────                                          │
│                                                                              │
│     Start: a1b2c3d4 (DPP hash)                                              │
│            │                                                                 │
│            │  + d4e5f6... (proof[0], sibling)                               │
│            ▼                                                                 │
│     Hash: ab12ef78                                                          │
│            │                                                                 │
│            │  + cd34ef... (proof[1], sibling)                               │
│            ▼                                                                 │
│     Root: x9y8z7w6  ◄── Does this match stored merkle_root?                 │
│                                                                              │
│  STEP 2: VERIFY TSA TOKEN                                                   │
│  ────────────────────────                                                   │
│                                                                              │
│     ┌────────────────────────────────────────┐                              │
│     │  RFC 3161 Timestamp Token              │                              │
│     ├────────────────────────────────────────┤                              │
│     │  • Hash: x9y8z7w6 (merkle root)       │                              │
│     │  • Time: 2026-01-15T10:30:00Z         │                              │
│     │  • TSA: DigiCert Timestamp Authority  │                              │
│     │  • Signature: <RSA/ECDSA signature>   │                              │
│     └────────────────────────────────────────┘                              │
│                                                                              │
│     Verify:                                                                  │
│     ✓ Token signature valid (using TSA public cert)                        │
│     ✓ Hash in token == computed merkle root                                │
│     ✓ TSA certificate chains to trusted root                               │
│                                                                              │
│  STEP 3: RETURN VERIFICATION RESULT                                         │
│  ──────────────────────────────────                                         │
│                                                                              │
│     ┌────────────────────────────────────────┐                              │
│     │  ✅ VERIFIED                            │                              │
│     │                                        │                              │
│     │  "This DPP was cryptographically       │                              │
│     │   timestamped on 2026-01-15 at         │                              │
│     │   10:30:00 UTC by DigiCert TSA.        │                              │
│     │                                        │                              │
│     │   The timestamp is mathematically      │                              │
│     │   impossible to forge or backdate."    │                              │
│     └────────────────────────────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 5.5.2 Implementation

```typescript
interface VerificationCeremonyResult {
  verified: boolean;
  dpp_id: string;

  // Merkle proof details
  merkle: {
    content_hash: string;
    computed_root: string;
    stored_root: string;
    proof_path: MerkleProofStep[];
    root_matches: boolean;
  };

  // TSA verification details
  timestamp: {
    verified: boolean;
    authority: string;
    timestamp: Date;
    hash_in_token: string;
    hash_matches: boolean;
    certificate_chain_valid: boolean;
  };

  // Human-readable summary
  summary: {
    status: 'VERIFIED' | 'INVALID_PROOF' | 'INVALID_TIMESTAMP' | 'TAMPERED';
    message: string;
    verified_at: Date;
  };

  // Error details (if verification failed)
  error?: {
    code: string;
    step: 'MERKLE_PROOF' | 'TSA_VERIFICATION' | 'CERTIFICATE_CHAIN';
    details: string;
  };
}

interface MerkleProofStep {
  position: 'left' | 'right';  // Which side is the sibling
  sibling_hash: string;
  combined_hash: string;       // Result after hashing with sibling
}

async function verifyTimestamp(dppId: string): Promise<VerificationCeremonyResult> {
  // 1. Load DPP and its proof data
  const dpp = await db.dppSnapshot.findUnique({
    where: { id: dppId },
    include: { batch_timestamp: true }
  });

  if (!dpp || !dpp.timestamp_proof) {
    throw new Error('DPP not found or not yet timestamped');
  }

  const { content_hash, merkle_proof, timestamp_proof } = dpp;

  // 2. Walk the Merkle path
  const proofSteps: MerkleProofStep[] = [];
  let currentHash = content_hash;

  for (const proofNode of merkle_proof) {
    const position = proofNode.position;  // 'left' or 'right'
    const siblingHash = proofNode.hash;

    // Combine in correct order (position indicates WHERE the sibling goes)
    const combined = position === 'left'
      ? sha256(siblingHash + currentHash)
      : sha256(currentHash + siblingHash);

    proofSteps.push({
      position,
      sibling_hash: siblingHash,
      combined_hash: combined
    });

    currentHash = combined;
  }

  const computedRoot = currentHash;
  const storedRoot = timestamp_proof.merkle_root;
  const rootMatches = computedRoot === storedRoot;

  // 3. Verify TSA token
  const tsaVerification = await verifyRFC3161Token(
    timestamp_proof.tsa_token,
    storedRoot
  );

  // 4. Build result
  const verified = rootMatches &&
                   tsaVerification.valid &&
                   tsaVerification.hash_matches;

  return {
    verified,
    dpp_id: dppId,

    merkle: {
      content_hash,
      computed_root: computedRoot,
      stored_root: storedRoot,
      proof_path: proofSteps,
      root_matches: rootMatches
    },

    timestamp: {
      verified: tsaVerification.valid,
      authority: tsaVerification.authority,
      timestamp: tsaVerification.timestamp,
      hash_in_token: tsaVerification.hash,
      hash_matches: tsaVerification.hash === storedRoot,
      certificate_chain_valid: tsaVerification.chain_valid
    },

    summary: buildSummary(verified, rootMatches, tsaVerification),

    error: verified ? undefined : buildError(rootMatches, tsaVerification)
  };
}

// RFC 3161 token verification
async function verifyRFC3161Token(
  tokenBase64: string,
  expectedHash: string
): Promise<TSAVerificationResult> {
  const token = Buffer.from(tokenBase64, 'base64');

  // Parse the TST (Timestamp Token)
  const tst = asn1.decode(token);

  // Extract components
  const tstInfo = tst.content.find(c => c.tag === 'TSTInfo');
  const signature = tst.content.find(c => c.tag === 'SignerInfo');
  const certificates = tst.content.find(c => c.tag === 'Certificates');

  // Verify the hash matches
  const hashInToken = tstInfo.messageImprint.hashedMessage.toString('hex');
  const hashMatches = hashInToken === expectedHash;

  // Verify the signature using the TSA certificate
  const tsaCert = certificates[0];
  const signatureValid = crypto.verify(
    'SHA256',
    tstInfo.toBuffer(),
    tsaCert.publicKey,
    signature.value
  );

  // Verify certificate chain to trusted root
  const chainValid = await verifyCertificateChain(certificates, TRUSTED_TSA_ROOTS);

  return {
    valid: signatureValid && chainValid,
    hash: hashInToken,
    hash_matches: hashMatches,
    timestamp: tstInfo.genTime,
    authority: tsaCert.subject.commonName,
    chain_valid: chainValid
  };
}
```

#### 5.5.3 Verification Failure Modes

| Failure | Cause | User Message | Investigation |
|---------|-------|--------------|---------------|
| `INVALID_PROOF` | Merkle path doesn't compute to root | "Proof path corrupted" | Data migration issue, restore from backup |
| `ROOT_MISMATCH` | Computed root ≠ stored root | "Data may have been modified" | Content hash changed post-timestamp |
| `INVALID_SIGNATURE` | TSA signature doesn't verify | "Timestamp token invalid" | Token corrupted or forged |
| `HASH_MISMATCH` | Root ≠ hash in TSA token | "Timestamp doesn't match data" | Wrong token associated with batch |
| `EXPIRED_CERT` | TSA certificate expired | "Timestamp authority cert expired" | Normal - still valid if was valid at signing time |
| `UNTRUSTED_TSA` | TSA not in trusted list | "Unknown timestamp authority" | Configuration issue or malicious token |

#### 5.5.4 Public Verification Endpoint

```typescript
// GET /api/v1/public/verify/:dpp_uri
//
// Returns full verification ceremony result for public inspection

router.get('/api/v1/public/verify/:dpp_uri', async (req, res) => {
  const dppUri = decodeURIComponent(req.params.dpp_uri);

  // Lookup DPP by URI
  const dpp = await findDppByUri(dppUri);
  if (!dpp) {
    return res.status(404).json({
      verified: false,
      error: { code: 'NOT_FOUND', message: 'DPP not registered' }
    });
  }

  // Run verification ceremony
  const result = await verifyTimestamp(dpp.id);

  // Add verification metadata
  return res.json({
    ...result,
    verification_metadata: {
      verified_at: new Date().toISOString(),
      verified_by: 'EuroComply Public Verification Service',
      api_version: '1.0',

      // Links for independent verification
      independent_verification: {
        tsa_token_download: `/api/v1/public/dpps/${dpp.id}/tsa-token`,
        merkle_proof_download: `/api/v1/public/dpps/${dpp.id}/merkle-proof`,
        verification_guide: 'https://eurocomply.eu/docs/verify-yourself'
      }
    }
  });
});
```

#### 5.5.5 Independent Verification (No Trust Required)

For maximum transparency, third parties can verify entirely offline:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INDEPENDENT VERIFICATION FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHAT THEY DOWNLOAD:                                                        │
│  ───────────────────                                                        │
│                                                                              │
│  1. DPP Content (JSON)          → dpp_content.json                          │
│  2. Merkle Proof                → merkle_proof.json                         │
│  3. TSA Token                   → timestamp.tsr                             │
│  4. TSA Certificate Chain       → tsa_chain.pem                             │
│                                                                              │
│  WHAT THEY DO:                                                              │
│  ─────────────                                                              │
│                                                                              │
│  $ # 1. Hash the DPP content                                                │
│  $ sha256sum dpp_content.json                                               │
│  a1b2c3d4e5f6...                                                            │
│                                                                              │
│  $ # 2. Walk the Merkle tree (using any Merkle library)                     │
│  $ merkle-verify --leaf a1b2c3d4e5f6 --proof merkle_proof.json              │
│  Computed root: x9y8z7w6...                                                 │
│                                                                              │
│  $ # 3. Verify TSA token with OpenSSL                                       │
│  $ openssl ts -verify -data <(echo -n "x9y8z7w6..." | xxd -r -p) \          │
│      -in timestamp.tsr -CAfile tsa_chain.pem                                │
│  Verification: OK                                                           │
│  Timestamp: Jan 15 10:30:00 2026 UTC                                        │
│  TSA: DigiCert Timestamp Responder                                          │
│                                                                              │
│  RESULT:                                                                    │
│  ───────                                                                    │
│  ✅ DPP content hash matches Merkle leaf                                    │
│  ✅ Merkle proof computes to timestamped root                               │
│  ✅ TSA token is valid and signed by trusted authority                      │
│  ✅ Data existed at 2026-01-15T10:30:00Z (mathematically proven)            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Download Endpoints:**

```
GET /api/v1/public/dpps/:id/content      → DPP JSON (for hashing)
GET /api/v1/public/dpps/:id/merkle-proof → Merkle proof JSON
GET /api/v1/public/dpps/:id/tsa-token    → Raw RFC 3161 .tsr file
GET /api/v1/public/dpps/:id/tsa-chain    → TSA certificate chain .pem
GET /api/v1/public/dpps/:id/verify-kit   → ZIP of all above + instructions
```

#### 5.5.6 UI Presentation (Proof Ceremony)

The public DPP page shows the verification ceremony in an accessible way:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  🔐 CRYPTOGRAPHIC PROOF                                     [Expand Details] │
│                                                                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                              │
│   ✅ VERIFIED                                                               │
│                                                                              │
│   This product passport was cryptographically sealed on                     │
│   January 15, 2026 at 10:30:00 UTC                                          │
│                                                                              │
│   Timestamp Authority: DigiCert                                             │
│   Certificate: Valid until 2028                                             │
│                                                                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                              │
│  [📥 Download Proof Kit]   [🔍 Verify Independently]   [📋 Technical Details] │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

[Expanded Technical Details]

┌─────────────────────────────────────────────────────────────────────────────┐
│  MERKLE TREE PATH                                                           │
│                                                                              │
│   Your DPP: a1b2c3d4...                                                     │
│        │                                                                     │
│        ├──┬── d4e5f6... (sibling)                                           │
│        │  │                                                                  │
│        │  ▼                                                                  │
│        │  ab12ef78 (combined)                                               │
│        │  │                                                                  │
│        │  ├──┬── cd34gh... (sibling)                                        │
│        │  │  │                                                               │
│        │  │  ▼                                                               │
│        │  │  x9y8z7w6 ◀── ROOT (timestamped)                                │
│        │  │                                                                  │
│  ─────────┴──────────────────────────────────────────────────               │
│                                                                              │
│  RFC 3161 TIMESTAMP                                                         │
│  • Authority: DigiCert Timestamp Responder                                  │
│  • Algorithm: SHA-256 with RSA-4096                                         │
│  • Time: 2026-01-15T10:30:00.000Z                                           │
│  • Serial: 0x1A2B3C4D5E6F...                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 5.5.7 Verification Caching

To avoid re-verifying on every page load:

```typescript
interface CachedVerification {
  dpp_id: string;
  verified: boolean;
  verified_at: Date;
  expires_at: Date;  // Re-verify after 24 hours
  summary: string;
}

// Redis cache for verification results
const VERIFICATION_TTL = 24 * 60 * 60;  // 24 hours

async function getCachedOrVerify(dppId: string): Promise<VerificationCeremonyResult> {
  const cacheKey = `verify:${dppId}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Run full verification
  const result = await verifyTimestamp(dppId);

  // Cache result (verified or not)
  await redis.setex(cacheKey, VERIFICATION_TTL, JSON.stringify(result));

  return result;
}
```

---

```sql
-- DPP State Transitions (audit log)
CREATE TABLE dpp_transition (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dpp_snapshot_id     UUID NOT NULL REFERENCES dpp_snapshot(id),
    from_status         dpp_status NOT NULL,
    to_status           dpp_status NOT NULL,
    trigger             VARCHAR(50) NOT NULL,
    triggered_by        VARCHAR(20) NOT NULL,  -- 'SYSTEM' or 'USER'
    user_id             UUID REFERENCES users(id),
    reason_code         VARCHAR(100),
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dpp_transition_snapshot ON dpp_transition (dpp_snapshot_id);

-- Recall Registry
CREATE TABLE recall (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),

    -- Scope of recall
    scope_type          VARCHAR(20) NOT NULL,  -- 'SERIAL', 'BATCH', 'LOT', 'PRODUCT'
    scope_id            UUID NOT NULL,         -- ID of the affected entity

    -- Recall details
    recall_number       VARCHAR(50) NOT NULL,
    severity            VARCHAR(20) NOT NULL,  -- 'SAFETY', 'QUALITY', 'COMPLIANCE'
    title               VARCHAR(255) NOT NULL,
    description         TEXT NOT NULL,
    consumer_action     TEXT NOT NULL,         -- What the consumer should do

    -- Status
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ,

    -- Audit
    issued_by           UUID NOT NULL REFERENCES users(id),
    resolved_by         UUID REFERENCES users(id),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recall_org ON recall (organization_id);
CREATE INDEX idx_recall_status ON recall (status);
```

---

## 6. Public Landing Page (Transparency Funnel)

### 6.1 The Strategy

The Public Page acts as a funnel that moves from **Emotional Trust** to **Technical Proof**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TRANSPARENCY FUNNEL                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  LEVEL 1: THE BRAND STORY (Default View)                                ││
│  │  ───────────────────────────────────────                                ││
│  │  Target: Average Consumer                                               ││
│  │                                                                          ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │  ┌─────────────────────────────────────────────────────────┐   │   ││
│  │  │  │                    [HERO IMAGE]                          │   │   ││
│  │  │  │                                                          │   │   ││
│  │  │  │              ORGANIC COTTON T-SHIRT                     │   │   ││
│  │  │  │                  by EcoBrand                             │   │   ││
│  │  │  │                                                          │   │   ││
│  │  │  │  "Crafted with care for you and the planet"             │   │   ││
│  │  │  └─────────────────────────────────────────────────────────┘   │   ││
│  │  │                                                                 │   ││
│  │  │  ┌───────────┐  ┌───────────┐  ┌───────────┐                  │   ││
│  │  │  │   95%     │  │    CO2    │  │   100%    │                  │   ││
│  │  │  │  ORGANIC  │  │  NEUTRAL  │  │ RECYCLABLE│                  │   ││
│  │  │  └───────────┘  └───────────┘  └───────────┘                  │   ││
│  │  │                                                                 │   ││
│  │  │           [ TRACE MY JOURNEY ]                                 │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  LEVEL 2: THE JOURNEY (Tap to Expand)                                   ││
│  │  ────────────────────────────────────                                   ││
│  │  Target: Conscious Consumer                                             ││
│  │                                                                          ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │  SUPPLY CHAIN MAP                                               │   ││
│  │  │  ─────────────────                                              │   ││
│  │  │                                                                  │   ││
│  │  │  [India]──────►[Portugal]──────►[Germany]                       │   ││
│  │  │   Cotton        Spinning         Assembly                       │   ││
│  │  │   Farm          Mill                                            │   ││
│  │  │                                                                  │   ││
│  │  │  Each facility is verified and notarized.                       │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  │                                                                          ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │  MATERIALS                                                       │   ││
│  │  │  ─────────                                                       │   ││
│  │  │  [====================] 95% Organic Cotton (GOTS Certified)     │   ││
│  │  │  [===] 5% Elastane                                              │   ││
│  │  │                                                                  │   ││
│  │  │  CERTIFICATIONS                                                  │   ││
│  │  │  ──────────────                                                  │   ││
│  │  │  [GOTS 6.0] Valid until: Dec 2026                               │   ││
│  │  │  [OEKO-TEX] Valid until: Mar 2027                               │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  LEVEL 3: THE FORENSIC SEAL (Auth/Deep Link)                            ││
│  │  ───────────────────────────────────────────                            ││
│  │  Target: Auditors, Customs, Super-Users                                 ││
│  │                                                                          ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │           [ VERIFY AUTHENTICITY ]                                │   ││
│  │  │                                                                  │   ││
│  │  │  (Triggers Proof Ceremony - see Section 7)                      │   ││
│  │  │                                                                  │   ││
│  │  │  ┌─────────────────────────────────────────────────────────┐   │   ││
│  │  │  │  ✓ This record was sealed by EuroComply                 │   │   ││
│  │  │  │    for EcoBrand on January 15, 2026.                    │   │   ││
│  │  │  │                                                          │   │   ││
│  │  │  │  Signature: VALID                                        │   │   ││
│  │  │  │  Timestamp: RFC 3161 (DigiCert)                         │   │   ││
│  │  │  └─────────────────────────────────────────────────────────┘   │   ││
│  │  │                                                                  │   ││
│  │  │  [ DOWNLOAD EVIDENCE PACKAGE (JSON-LD) ]                        │   ││
│  │  │  [ REQUEST INDEPENDENT VERIFICATION ]                           │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Recall Overlay

When a DPP's linked Batch is marked as RECALLED, the resolver injects a warning banner:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ⚠️  PRODUCT RECALL NOTICE                                                   │
│  ─────────────────────────────────────────────────────────────────────────  │
│  This product has been recalled due to: [Reason]                            │
│                                                                              │
│  Consumer Action Required:                                                   │
│  [Instructions from brand - e.g., "Return to store for refund"]             │
│                                                                              │
│  Recall ID: RCL-2026-00123                                                  │
│  Issued: January 15, 2026                                                   │
│  [ LEARN MORE ]                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Status-Based Page Rendering

| DPP Status | Page Content |
|------------|--------------|
| COMMISSIONED | "This product is being prepared. Check back soon." |
| PROVISIONED | Level 1 + 2 visible (preview mode, optional) |
| ACTIVE | Full Transparency Funnel (Levels 1, 2, 3) |
| RECALLED | Full content + Recall Overlay at top |
| DECOMMISSIONED | "This product has been retired." + Archive data |

### 6.4 Recall Propagation Service (Operations → Compliance Handshake)

When Operations marks a batch as RECALLED, the Compliance workspace must update all affected DPPs. This is the **Reverse Handshake** - Operations triggers, Compliance executes.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RECALL PROPAGATION PATTERN                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  OPERATIONS (Source of Product Health)                                      │
│  ═════════════════════════════════════                                       │
│  1. User with MANAGER authority marks batch as RECALLED                     │
│  2. Operations creates a signed Notary Event (audit proof)                  │
│  3. Operations emits event: { type: 'BATCH_RECALLED', batchId, recallId }   │
│                                                                              │
│                              │                                               │
│                              ▼                                               │
│                                                                              │
│  COMPLIANCE (Source of Public Truth)                                        │
│  ════════════════════════════════════                                        │
│  4. DPP Revocation Service receives event                                   │
│  5. Query all dpp_snapshot WHERE batch_id = X                               │
│  6. Batch update: status → RECALLED, inject overlay                         │
│  7. Record billing event (recall fee per DPP)                               │
│                                                                              │
│  WHY EVENT-DRIVEN (not live join):                                          │
│  • Consumer QR scans are fast (pre-computed state)                          │
│  • No cross-workspace database joins at read time                           │
│  • Recall state is cached in the dpp_snapshot record                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

```typescript
// DPP Revocation Service (Compliance Workspace)
// Triggered by Operations batch recall event

interface RecallEvent {
  type: 'BATCH_RECALLED';
  batchId: string;
  recallId: string;
  reason: string;
  severity: 'SAFETY' | 'QUALITY' | 'COMPLIANCE';
  consumerAction: string;
  issuedBy: string;
  issuedAt: string;
}

async function handleBatchRecall(event: RecallEvent): Promise<RecallResult> {
  const { batchId, recallId, reason, severity, consumerAction } = event;

  // 1. Identify all affected DPPs
  const affectedDpps = await db.dppSnapshot.findMany({
    where: { batch_id: batchId }
  });

  if (affectedDpps.length === 0) {
    return { success: true, affected: 0 };
  }

  // 2. Build the recall overlay content
  const recallOverlay = {
    recall_id: recallId,
    reason: reason,
    severity: severity,
    consumer_action: consumerAction,
    recalled_at: event.issuedAt,
    issued_by: event.issuedBy,
    // Link back to Operations for forensic audit
    operations_event_link: `/api/v1/operations/events/${event.recallId}`
  };

  // 3. Batch update all affected DPPs
  await db.dppSnapshot.updateMany({
    where: { batch_id: batchId },
    data: {
      status: 'RECALLED',
      recall_id: recallId,
      recall_overlay: recallOverlay
    }
  });

  // 4. Record state transition for each DPP (audit trail)
  for (const dpp of affectedDpps) {
    await db.dppTransition.create({
      dpp_snapshot_id: dpp.id,
      from_status: dpp.status,
      to_status: 'RECALLED',
      trigger: 'RECALL_ISSUED',
      triggered_by: 'SYSTEM',
      reason_code: reason,
      metadata: { recall_id: recallId }
    });
  }

  // 5. Trigger billing (recall fee per DPP)
  // See: billing-design.md Section 6 (Recall Operations Billing)
  await recordRecallUsage({
    organization_id: affectedDpps[0].organization_id,
    recall_id: recallId,
    items_recalled: affectedDpps.length,
    fee_rate: 0.001  // €0.001 per item
  });

  return {
    success: true,
    affected: affectedDpps.length,
    recall_id: recallId
  };
}

// Recall Resolution (when issue is fixed)
async function handleRecallResolution(recallId: string): Promise<void> {
  // 1. Get all DPPs with this recall
  const affectedDpps = await db.dppSnapshot.findMany({
    where: { recall_id: recallId, status: 'RECALLED' }
  });

  // 2. Restore to ACTIVE (or previous state)
  await db.dppSnapshot.updateMany({
    where: { recall_id: recallId },
    data: {
      status: 'ACTIVE',
      recall_overlay: null  // Remove warning
    }
  });

  // 3. Record resolution billing (€0.0005 per item)
  await recordRecallUsage({
    organization_id: affectedDpps[0].organization_id,
    recall_id: recallId,
    items_resolved: affectedDpps.length,
    fee_rate: 0.0005
  });
}
```

**Verification Ceremony Impact:**

When a DPP is RECALLED, the Verification Ceremony (Section 7) ends with a **Critical Failure**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ❌ VERIFICATION FAILED                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  The cryptographic seal is intact, but this batch has been                  │
│  RECALLED by the manufacturer.                                              │
│                                                                              │
│  Reason: [Consumer safety concern - potential allergen contamination]       │
│                                                                              │
│  [ VIEW RECALL DETAILS ]                                                    │
│  [ VIEW FORENSIC EVIDENCE ]  ← Links to Operations Notary Event             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Verification Ceremony (Proof Ritual)

### 7.1 The Psychology

If verification happens *too fast*, people don't believe it. The 2-3 second animated "Forensic Scan" builds **perceived value** and transforms a static signature into a visible narrative of integrity.

### 7.2 The Animation Steps

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROOF CEREMONY ANIMATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: "Resolving Identity..."                     [====    ] 0.5s       │
│  └─► Check Brand's DID and EuroComply's Issuer key                         │
│                                                                              │
│  Step 2: "Checking Evidence Seal..."                 [=======  ] 0.6s      │
│  └─► Verify the issuance_jws from dpp_snapshot                             │
│                                                                              │
│  Step 3: "Validating Notary Chain..."                [========= ] 0.7s     │
│  └─► Check sequential hashes of operations_events                          │
│                                                                              │
│  Step 4: "Confirming Spatiotemporal Anchor..."       [=========== ] 0.6s   │
│  └─► Validate GPS coordinates and RFC 3161 timestamp                       │
│                                                                              │
│  Step 5: "Independent Registry Check..."             [=============] 0.6s  │
│  └─► API call to verify not revoked (Option C)                             │
│                                                                              │
│  ══════════════════════════════════════════════════════════════════════════│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │                    ✓  VERIFIED AUTHENTIC                            │   │
│  │                                                                      │   │
│  │  This record was sealed by EuroComply                               │   │
│  │  for EcoBrand on January 15, 2026 at 14:32:01 UTC.                  │   │
│  │                                                                      │   │
│  │  Local Verification:    ✓ VALID                                     │   │
│  │  Registry Verification: ✓ VALID                                     │   │
│  │                                                                      │   │
│  │  [ VIEW TECHNICAL DETAILS ]                                          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Client-Side Verification (Offline-First)

```typescript
// Embedded in the page load - works without network
async function verifyLocalSignature(dpp: DPPSnapshot): Promise<VerificationResult> {
  // 1. Reconstruct the snapshot hash
  const content = {
    design: dpp.design_data,
    marketing: dpp.marketing_data,
    operations: dpp.operations_data,
    metadata: dpp.metadata,
  };
  const computedHash = sha256(canonicalize(content));

  // 2. Verify hash matches
  if (computedHash !== dpp.snapshot_hash) {
    return { valid: false, reason: 'Hash mismatch - data may be tampered' };
  }

  // 3. Verify JWS signature
  const publicKey = await resolvePublicKey(dpp.signer_did);
  const signatureValid = await verifyJWS(dpp.issuance_jws, dpp.snapshot_hash, publicKey);

  if (!signatureValid) {
    return { valid: false, reason: 'Signature verification failed' };
  }

  return {
    valid: true,
    signer: dpp.signer_did,
    sealed_at: extractTimestamp(dpp.issuance_jws),
    verification_type: 'LOCAL',
  };
}
```

### 7.4 Server-Side Verification (Deep Verify)

```typescript
// Called when user taps "Request Independent Verification"
async function verifyWithRegistry(dppUri: string): Promise<RegistryVerificationResult> {
  const response = await fetch(`https://api.eurocomply.eu/v1/verify/${encodeURIComponent(dppUri)}`);
  return response.json();
}
```

---

## 8. Public Verification API

### 8.1 Endpoint

```
GET https://api.eurocomply.eu/v1/public/verify/{dpp_uri}
```

### 8.2 Response Schema

```typescript
interface PublicVerificationResponse {
  // Identity
  dpp_uri: string;
  gtin: string;
  serial_number: string;

  // Integrity Check
  integrity: {
    is_authentic: boolean;         // Signature valid
    is_revoked: boolean;           // Not in revocation list
    is_recalled: boolean;          // Recall active on this item
    last_verified: string;         // ISO timestamp
    verification_tier: 'LEVEL_1_SELF' | 'LEVEL_2_NOTARIZED' | 'LEVEL_3_AUDITED';
  };

  // Metadata (safe to expose publicly)
  metadata: {
    issuer_name: 'EuroComply';
    brand_name: string;
    product_name: string;
    seal_date: string;
    status: DPPStatus;
  };

  // Recall info (if applicable)
  recall?: {
    recall_id: string;
    severity: string;
    title: string;
    consumer_action: string;
    issued_at: string;
  };
}
```

### 8.3 Example Response

```json
{
  "dpp_uri": "https://dpp.eurocomply.eu/01/04012345678901/21/ABC123",
  "gtin": "04012345678901",
  "serial_number": "ABC123",
  "integrity": {
    "is_authentic": true,
    "is_revoked": false,
    "is_recalled": false,
    "last_verified": "2026-01-15T14:35:00Z",
    "verification_tier": "LEVEL_2_NOTARIZED"
  },
  "metadata": {
    "issuer_name": "EuroComply",
    "brand_name": "EcoBrand",
    "product_name": "Organic Cotton T-Shirt",
    "seal_date": "2026-01-15T14:32:01Z",
    "status": "ACTIVE"
  }
}
```

---

## 9. GS1 Digital Link Resolver

### 9.1 URL Structure

```
https://dpp.eurocomply.eu/01/{gtin}/21/{serial}

Example:
https://dpp.eurocomply.eu/01/04012345678901/21/ABC123
```

### 9.2 Selective Disclosure Logic

```typescript
// Edge resolver (Cloudflare Worker)
async function resolveDPP(request: Request): Promise<Response> {
  const { gtin, serial } = parseDigitalLink(request.url);
  const authContext = await parseAuthContext(request);

  const dpp = await getDPPSnapshot(gtin, serial);

  if (!dpp) {
    return render404Page();
  }

  // Check for recall overlay
  const recallOverlay = dpp.status === 'RECALLED' ? dpp.recall_overlay : null;

  // Determine disclosure level
  switch (authContext?.type) {
    case 'CUSTOMS_EIDAS':
    case 'AUDITOR_API_KEY':
      // Full Evidence Package (Level 3)
      return renderFullEvidencePage(dpp, recallOverlay);

    case 'SUPPLY_CHAIN_PARTNER':
      // EPCIS events + BOM (Level 2+)
      return renderPartnerPage(dpp, authContext.permissions);

    default:
      // Public consumer view (Levels 1 + 2 + limited 3)
      return renderPublicPage(dpp, recallOverlay);
  }
}

// View parameter override
const viewParam = new URL(request.url).searchParams.get('view');
if (viewParam === 'evidence' && authContext) {
  return renderFullEvidencePage(dpp, recallOverlay);
}
```

---

## 10. API Endpoints

### DPP Management

```
GET    /api/v1/compliance/dpps                    # List organization's DPPs
GET    /api/v1/compliance/dpps/:id                # Get DPP detail
GET    /api/v1/compliance/dpps/by-serial/:serial  # Lookup by serial number
GET    /api/v1/compliance/dpps/by-uri/:uri        # Lookup by Digital Link URI
```

### Snapshot Operations

```
POST   /api/v1/compliance/snapshots/preview       # Preview snapshot (dry run)
POST   /api/v1/compliance/snapshots/batch/:id     # Trigger snapshot for batch
GET    /api/v1/compliance/snapshots/:id/audit     # Get pre-flight audit results
```

### Lifecycle Management

```
POST   /api/v1/compliance/dpps/:id/activate       # PROVISIONED → ACTIVE
POST   /api/v1/compliance/dpps/:id/decommission   # → DECOMMISSIONED
```

### Recall Management

```
GET    /api/v1/compliance/recalls                 # List recalls
POST   /api/v1/compliance/recalls                 # Issue new recall
PUT    /api/v1/compliance/recalls/:id             # Update recall
POST   /api/v1/compliance/recalls/:id/resolve     # Mark recall resolved
```

### Public Verification

```
GET    /api/v1/public/verify/:dpp_uri             # Public verification (no auth)
GET    /api/v1/public/dpps/:dpp_uri               # Public DPP data (no auth)
```

### Public Revocation API (Third-Party Access)

```
GET    /api/v1/public/recall/check/:gtin/:serial  # Check single product recall status
POST   /api/v1/public/recall/batch                # Batch check (up to 100 items)
GET    /api/v1/public/recall/feed                 # RSS/Atom feed of active recalls
GET    /api/v1/public/recall/:recall_id           # Get recall details by ID
```

---

## 11. Public Revocation API

Third-party systems (retailers, POS terminals, customs, marketplaces) need to verify product recall status without authentication. This API enables the "Deep Trust" ecosystem where any stakeholder can check compliance status.

### 11.1 Design Principles

| Principle | Rationale |
|-----------|-----------|
| **No authentication required** | Recall status is public safety information |
| **High availability** | Edge-cached via CDN, 99.9% uptime SLA |
| **Rate-limited by IP** | 1000 req/min free tier, higher with API key |
| **Machine-readable** | JSON responses, standardized error codes |
| **Privacy-preserving** | Returns status only, not consumer data |

### 11.2 Single Product Check

**Endpoint:** `GET /api/v1/public/recall/check/:gtin/:serial`

```typescript
// Request
GET /api/v1/public/recall/check/01234567890123/ABC-001

// Response (no recall)
{
  "gtin": "01234567890123",
  "serial": "ABC-001",
  "status": "CLEAR",
  "checked_at": "2026-01-16T10:30:00Z",
  "cache_ttl": 300
}

// Response (active recall)
{
  "gtin": "01234567890123",
  "serial": "ABC-001",
  "status": "RECALLED",
  "recall": {
    "id": "RCL-2026-001",
    "severity": "CLASS_I",
    "reason": "Potential battery overheating",
    "issued_at": "2026-01-15T08:00:00Z",
    "consumer_action": "Stop using immediately. Return to retailer for full refund.",
    "manufacturer": "TechCorp GmbH",
    "official_notice_url": "https://techcorp.eu/recalls/RCL-2026-001"
  },
  "checked_at": "2026-01-16T10:30:00Z",
  "cache_ttl": 60
}

// Response (product not found)
{
  "gtin": "01234567890123",
  "serial": "UNKNOWN-999",
  "status": "NOT_FOUND",
  "message": "Product not registered in EuroComply system",
  "checked_at": "2026-01-16T10:30:00Z"
}
```

### 11.3 Batch Check (POS/Inventory Systems)

**Endpoint:** `POST /api/v1/public/recall/batch`

For retailers scanning inventory or POS systems checking cart contents.

```typescript
// Request
POST /api/v1/public/recall/batch
Content-Type: application/json

{
  "items": [
    { "gtin": "01234567890123", "serial": "ABC-001" },
    { "gtin": "01234567890123", "serial": "ABC-002" },
    { "gtin": "09876543210987", "serial": "XYZ-100" }
  ]
}

// Response
{
  "checked_at": "2026-01-16T10:30:00Z",
  "total": 3,
  "clear": 2,
  "recalled": 1,
  "not_found": 0,
  "results": [
    { "gtin": "01234567890123", "serial": "ABC-001", "status": "CLEAR" },
    { "gtin": "01234567890123", "serial": "ABC-002", "status": "RECALLED", "recall_id": "RCL-2026-001" },
    { "gtin": "09876543210987", "serial": "XYZ-100", "status": "CLEAR" }
  ]
}
```

**Limits:**
- Free tier: 100 items per batch, 10 batches/minute
- With API key: 1000 items per batch, 100 batches/minute

### 11.4 Active Recalls Feed

**Endpoint:** `GET /api/v1/public/recall/feed`

RSS/Atom feed for systems that want to subscribe to all active recalls.

```typescript
// Request
GET /api/v1/public/recall/feed?format=json&since=2026-01-01

// Response
{
  "feed_version": "1.0",
  "updated_at": "2026-01-16T10:00:00Z",
  "recalls": [
    {
      "id": "RCL-2026-001",
      "manufacturer_id": "org_techcorp",
      "manufacturer_name": "TechCorp GmbH",
      "product_name": "PowerBank Pro 10000",
      "gtin": "01234567890123",
      "severity": "CLASS_I",
      "reason": "Potential battery overheating",
      "issued_at": "2026-01-15T08:00:00Z",
      "affected_serials_count": 5000,
      "consumer_action": "Stop using immediately. Return to retailer.",
      "status": "ACTIVE"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "per_page": 50
  }
}
```

**Feed options:**
- `format`: `json` (default), `atom`, `rss`
- `since`: ISO date filter
- `severity`: `CLASS_I`, `CLASS_II`, `CLASS_III`
- `manufacturer_id`: Filter by specific manufacturer

### 11.5 Recall Detail

**Endpoint:** `GET /api/v1/public/recall/:recall_id`

```typescript
// Request
GET /api/v1/public/recall/RCL-2026-001

// Response
{
  "id": "RCL-2026-001",
  "status": "ACTIVE",
  "severity": "CLASS_I",
  "manufacturer": {
    "id": "org_techcorp",
    "name": "TechCorp GmbH",
    "country": "DE"
  },
  "product": {
    "name": "PowerBank Pro 10000",
    "gtin": "01234567890123",
    "category": "Electronics > Power Banks"
  },
  "recall_details": {
    "reason": "Potential battery overheating under high ambient temperatures",
    "hazard": "Fire risk",
    "incidents_reported": 3,
    "injuries_reported": 0
  },
  "consumer_action": {
    "instruction": "Stop using immediately. Return to retailer for full refund.",
    "refund_available": true,
    "replacement_available": false
  },
  "affected_range": {
    "serial_prefix": "ABC-",
    "production_dates": {
      "from": "2025-10-01",
      "to": "2025-12-15"
    },
    "estimated_units": 5000
  },
  "timeline": {
    "issued_at": "2026-01-15T08:00:00Z",
    "updated_at": "2026-01-15T08:00:00Z",
    "resolved_at": null
  },
  "official_links": {
    "manufacturer_notice": "https://techcorp.eu/recalls/RCL-2026-001",
    "regulatory_notice": "https://ec.europa.eu/safety-gate/..."
  }
}
```

### 11.6 Implementation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CDN Edge Cache                          │
│              (Cloudflare/Fastly, 60s TTL)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Rate Limiter                              │
│         (IP-based: 1000/min free, 10000/min with key)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Public Revocation API Service                  │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Single      │  │ Batch       │  │ Feed        │         │
│  │ Check       │  │ Check       │  │ Generator   │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          ▼                                  │
│              ┌───────────────────────┐                      │
│              │   Recall Status       │                      │
│              │   Materialized View   │                      │
│              │   (Redis/Postgres)    │                      │
│              └───────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Recall Propagation Service                     │
│              (Section 6.4 - Event Handler)                  │
│                                                             │
│    Operations RECALL event → Updates materialized view      │
└─────────────────────────────────────────────────────────────┘
```

### 11.7 Materialized View Schema

```sql
-- Optimized for fast public lookups
CREATE TABLE public_recall_status (
  gtin           VARCHAR(14) NOT NULL,
  serial_number  VARCHAR(100) NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'CLEAR',  -- CLEAR, RECALLED, RESOLVED
  recall_id      VARCHAR(50),
  recall_data    JSONB,  -- Cached recall details for single-query response
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (gtin, serial_number)
);

-- Index for batch queries
CREATE INDEX idx_recall_status_lookup ON public_recall_status (gtin, serial_number);

-- Active recalls for feed
CREATE TABLE public_recall_feed (
  recall_id         VARCHAR(50) PRIMARY KEY,
  manufacturer_id   VARCHAR(50) NOT NULL,
  manufacturer_name VARCHAR(255) NOT NULL,
  product_name      VARCHAR(255) NOT NULL,
  gtin              VARCHAR(14) NOT NULL,
  severity          VARCHAR(20) NOT NULL,
  reason            TEXT NOT NULL,
  consumer_action   TEXT NOT NULL,
  issued_at         TIMESTAMPTZ NOT NULL,
  resolved_at       TIMESTAMPTZ,
  status            VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  details           JSONB NOT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recall_feed_active ON public_recall_feed (status, issued_at DESC);
CREATE INDEX idx_recall_feed_manufacturer ON public_recall_feed (manufacturer_id);
```

### 11.8 Monetization

The Public Revocation API is **free for basic use** (public safety) but offers premium tiers:

| Feature | Free | API Key (€49/mo) | Enterprise |
|---------|------|------------------|------------|
| Single checks | 1000/min | 10,000/min | Unlimited |
| Batch size | 100 items | 1000 items | 10,000 items |
| Feed access | JSON only | All formats + webhooks | Custom |
| SLA | Best effort | 99.9% | 99.99% |
| Support | Community | Email | Dedicated |

**Revenue opportunity:** Retailers with large inventories will upgrade for faster batch checks and webhook notifications.

---

## 12. Related Documents

| Document | Purpose |
|----------|---------|
| [Design Workspace Design](./2026-01-15-design-workspace-design.md) | Source of BOM, specs, versions |
| [Marketing Workspace Design](./2026-01-15-marketing-workspace-design.md) | Source of content, assets, locales |
| [Operations Workspace Design](./2026-01-15-operations-workspace-design.md) | Source of evidence, notary chain, EPCIS |
| [Verifiable Credentials Design](./2026-01-15-verifiable-credentials-design.md) | VC issuance, DID management |
| [Architecture Design](./2026-01-15-architecture-design.md) | System architecture |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.7 | 2026-01-16 | Added Section 5.5: Merkle Path Verification Ceremony - independent timestamp verification |
| 0.6 | 2026-01-16 | Added Section 11: Public Revocation API - third-party recall status checks |
| 0.5 | 2026-01-16 | Added Section 6.4: Recall Propagation Service (Operations → Compliance handshake) |
| 0.4 | 2026-01-16 | Added Merkle Tree Timestamp Service (Section 5.4) - RFC 3161 for all tiers via batching |
| 0.3 | 2026-01-16 | Added cross-reference to Operations→Compliance bridge |
| 0.2 | 2026-01-16 | Added Section 4.5: Billing Triggers (DPP provisioning, Recall fees) |
| 0.1 | 2026-01-15 | Initial draft from brainstorming session |
