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

  // 6. TIMESTAMP: Get RFC 3161 proof (Enterprise+ only)
  const timestampProof = await getTimestampProof(snapshotHash, batch.organization.plan);

  // 7. PERSIST: Save the immutable record
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

    -- RFC 3161 Timestamp (Enterprise+ only)
    timestamp_proof     JSONB,

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

---

## 11. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft: Birth Certificate Model, Transparency Funnel, Proof Ceremony |

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
| 0.1 | 2026-01-15 | Initial draft from brainstorming session |
