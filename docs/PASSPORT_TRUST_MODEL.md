# Digital Product Passport Trust Model

> **Terminology Note:** This document uses "revision" for product data iterations (Design revision 3),
> "version" for API compatibility (/api/v1/), and "edition" for published DPPs. See
> [Architecture Document - Terminology](../EuroComply_Architecture_Document_v1.3.md#terminology-version-vs-revision-vs-edition)
> for the full glossary. Legacy code may still use `version` where `revision` is meant.

## Overview

EuroComply uses an **organization-only model** for passport creation. Only registered brands, manufacturers, and distributors can create DPPs. This eliminates fraud by design.

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUST BY DESIGN                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✅ ORGANIZATIONS create passports (pay subscription)      │
│     → Own the product data (workspace-based data model)    │
│     → Legally liable for accuracy                          │
│     → did:key identity (portable, self-verifying)          │
│     → Multi-party attestations from supply chain           │
│     → DPP issuance via Compliance workspace                │
│                                                             │
│  ✅ RETAILERS access FREE (ESPR Article 31)                │
│     → Public API lookup (GTIN, brand/SKU, serial)          │
│     → Embeddable widget for any website                    │
│     → Shopify Retailer App for automatic matching          │
│     → Cannot create or modify DPPs                         │
│                                                             │
│  = NO FRAUD + ESPR COMPLIANT                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## The Hub: Central Source of Truth

At the center of EuroComply is **The Hub** - a central data store where all product data lives. Each product has **workspace data** in the Hub stored by Design, Operations, and Marketing workspaces.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              THE HUB                                         │
│                    (Central Data Store - Always Synchronized)                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    WORKSPACE DATA (per product)                      │    │
│  │                                                                      │    │
│  │  Design Data         Operations Data       Marketing Data           │    │
│  │  ├─ Registry         ├─ Batches           ├─ PIM Content           │    │
│  │  ├─ Materials        ├─ EPCIS Events      ├─ Media                 │    │
│  │  ├─ Certifications   └─ Attestations      └─ Channels              │    │
│  │  └─ Attestations                                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           │ WRITE                  │ WRITE                  │ WRITE
           ▼                        ▼                        ▼
    ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
    │   DESIGN    │          │ OPERATIONS  │          │  MARKETING  │
    │   (PLM)     │          │ (ERP-lite)  │          │   (PIM)     │
    └─────────────┘          └─────────────┘          └─────────────┘
           │                        │                        │
           └────────────────────────┼────────────────────────┘
                                    │ READ
                                    ▼
                            ┌─────────────┐
                            │ COMPLIANCE  │
                            │   (DPP)     │
                            │ Reads Hub   │
                            │ Issues DPPs │
                            └─────────────┘
```

**Key Principle:** All workspaces read from and write to the same Hub. Changes in one workspace are immediately visible in others. Compliance workspace READS the complete workspace data and issues DPPs - it does not "aggregate" data.

---

## Workspace Conflict Resolution

### The Problem

Multiple team members may edit product data simultaneously:
- Marketing updates product descriptions while Design updates materials
- Two users in Operations edit the same batch data
- Changes occur after a DPP has already been issued

### Conflict Resolution Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONFLICT RESOLUTION MODEL                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. WORKSPACE-LEVEL ISOLATION (Primary)                                     │
│  ──────────────────────────────────────                                     │
│  Each workspace owns distinct data types:                                   │
│  • Design: Materials, BOM, certifications                                   │
│  • Operations: Batches, EPCIS events                                        │
│  • Marketing: PIM content, media                                            │
│                                                                              │
│  Cross-workspace conflicts are IMPOSSIBLE by design.                        │
│  Marketing cannot edit materials. Design cannot edit batch data.            │
│                                                                              │
│  2. WITHIN-WORKSPACE CONFLICTS                                              │
│  ─────────────────────────────                                              │
│  Strategy: Check-Out/Check-In with Explicit Locking                         │
│                                                                              │
│  • Users check out a product version before editing                         │
│  • Check-out creates an exclusive lock (30-minute timeout)                  │
│  • Other users see "Checked out by [Name]" and can view but not edit       │
│  • Check-in creates a new immutable version                                 │
│  • All versions preserved in audit log                                      │
│                                                                              │
│  3. ISSUED DPP IMMUTABILITY                                                 │
│  ─────────────────────────────                                              │
│  Once issued, DPP credential is IMMUTABLE. Changes to workspace data do    │
│  NOT retroactively modify issued DPPs.                                      │
│                                                                              │
│  To update a DPP:                                                           │
│  • Revoke the old credential (status list update)                           │
│  • Issue a new credential with updated data                                 │
│  • Link new credential to old (supersedes relationship)                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Revision Management for Products

Product data iterations are called **revisions** (not "versions" to avoid confusion with API versions).

```typescript
// Each product record in the Hub
// Note: Code uses `version` field name (legacy); conceptually these are "revisions"
interface ProductVersion {  // TODO: Rename to ProductRevision in v2
  id: string;
  version: number;           // Auto-incremented on check-in (revision number)
  createdAt: Date;
  createdBy: string;         // User ID who checked in
  workspace: 'design' | 'operations' | 'marketing';

  // Immutable snapshot of data at this version
  data: ProductData;

  // Check-in metadata
  changeDescription?: string;  // Optional description of changes

  // If DPP issued from this version
  issuedDppId?: string;
  issuedAt?: Date;
}

// Checkout state
interface ProductCheckout {
  productId: string;
  workspace: 'design' | 'operations' | 'marketing';
  checkedOutBy: string;      // User ID
  checkedOutAt: Date;
  expiresAt: Date;           // 30-minute timeout
  baseVersion: number;       // Version being edited
}
```

### Workspace Data Contracts (Scale Architecture)

To prevent tight coupling between workspaces and enable independent scaling, the Compliance workspace queries through **immutable view contracts** rather than direct table access.

```typescript
// ══════════════════════════════════════════════════════════════════════════════
// WORKSPACE VIEW CONTRACTS
// Compliance workspace queries these interfaces, not raw tables
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Immutable view of Design workspace data for DPP issuance
 * Compliance workspace sees this - cannot modify
 */
interface DesignDataView {
  readonly productId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly state: 'released_to_ops';  // ONLY released versions visible

  // Product definition
  readonly name: string;
  readonly gtin?: string;
  readonly sku?: string;
  readonly category: string;

  // Bill of Materials (immutable at release)
  readonly materials: ReadonlyArray<{
    name: string;
    percentage: number;
    recycled: boolean;
    certified: boolean;
    certificationName?: string;
    countryOfOrigin?: string;
  }>;

  // Sustainability metrics
  readonly sustainability: Readonly<{
    carbonFootprintKgCO2e?: number;
    carbonScope?: 'cradle-to-gate' | 'cradle-to-grave' | 'gate-to-gate';
    recyclabilityPercent?: number;
    recycledContentPercent?: number;
    durabilityScore?: number;  // 1-10
    repairabilityScore?: number;  // 1-10
  }>;

  // Certifications attached at Design
  readonly certifications: ReadonlyArray<{
    name: string;
    issuingBody: string;
    certificateNumber?: string;
    issueDate?: Date;
    expiryDate?: Date;
    verificationUrl?: string;
  }>;

  // Third-party attestations linked to Design
  readonly attestations: ReadonlyArray<AttestationView>;

  // Audit trail
  readonly releasedAt: Date;
  readonly releasedBy: string;
}

/**
 * Immutable view of Operations workspace data for DPP issuance
 */
interface OperationsDataView {
  readonly batchId: string;
  readonly batchNumber: string;
  readonly quantity: number;
  readonly status: 'completed' | 'in_production';  // Only production batches

  // Linked Design version (frozen at batch creation)
  readonly designVersionId: string;
  readonly designVersionNumber: number;

  // Production data
  readonly productionFacility?: string;
  readonly productionDate?: Date;
  readonly productionCountry?: string;

  // Material lots used (traceability)
  readonly materialLots: ReadonlyArray<{
    materialName: string;
    lotNumber: string;
    quantity: number;
    supplierName?: string;
  }>;

  // EPCIS events (supply chain events)
  readonly epcisEvents: ReadonlyArray<{
    eventType: 'ObjectEvent' | 'AggregationEvent' | 'TransformationEvent';
    action: 'ADD' | 'OBSERVE' | 'DELETE';
    eventTime: Date;
    readPoint?: string;
    bizLocation?: string;
  }>;

  // Third-party attestations from Operations
  readonly attestations: ReadonlyArray<AttestationView>;
}

/**
 * Immutable view of Marketing workspace data for DPP issuance
 */
interface MarketingDataView {
  readonly versionId: string;
  readonly versionNumber: number;
  readonly state: 'released_for_dpp';  // ONLY released versions visible

  // Commercial content
  readonly brandStory?: string;
  readonly careInstructions?: string;
  readonly warrantyInfo?: string;

  // Media assets (URLs to R2 storage)
  readonly images: ReadonlyArray<{
    url: string;
    altText?: string;
    type: 'primary' | 'gallery' | 'detail';
  }>;

  // Localized content
  readonly localizations: ReadonlyArray<{
    locale: string;  // e.g., 'de-DE', 'fr-FR'
    brandStory?: string;
    careInstructions?: string;
  }>;

  // Channel-specific data
  readonly channels: ReadonlyArray<{
    channelType: 'shopify' | 'amazon' | 'direct';
    externalId?: string;
    listingUrl?: string;
  }>;

  // Audit trail
  readonly releasedAt: Date;
  readonly releasedBy: string;
}

/**
 * Unified view of attestation data across all workspaces
 */
interface AttestationView {
  readonly id: string;
  readonly type: string;  // 'MaterialOrigin', 'CarbonFootprint', etc.

  // Contributor who created the attestation
  readonly contributor: Readonly<{
    did: string;
    name: string;
    role: 'supplier' | 'lab' | 'auditor' | 'manufacturer';
  }>;

  // Verifiable Credential
  readonly credential: Readonly<{
    vcId: string;
    issuedAt: Date;
    expiresAt?: Date;
    signatureValid: boolean;
    revoked: boolean;
  }>;

  // Attestation-specific claims
  readonly claims: Readonly<Record<string, unknown>>;
}

// ══════════════════════════════════════════════════════════════════════════════
// DPP SNAPSHOT SERVICE (Compliance Workspace)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Service that creates DPP snapshots from workspace views
 * Uses contracts - never queries tables directly
 */
interface DPPSnapshotService {
  /**
   * Create an immutable snapshot for DPP issuance
   * All workspace views are captured at this moment
   */
  createSnapshot(params: {
    organizationId: string;
    batchId: string;
    designVersionId: string;
    marketingVersionId?: string;
  }): Promise<DPPSnapshot>;

  /**
   * Get workspace views (for preview before snapshot)
   */
  getDesignView(versionId: string): Promise<DesignDataView>;
  getOperationsView(batchId: string): Promise<OperationsDataView>;
  getMarketingView(versionId: string): Promise<MarketingDataView | null>;
}

/**
 * Immutable snapshot - captured state at DPP creation
 * This is what gets signed and issued as a VC
 */
interface DPPSnapshot {
  readonly id: string;
  readonly createdAt: Date;
  readonly createdBy: string;

  // Captured workspace data (immutable)
  readonly design: DesignDataView;
  readonly operations: OperationsDataView;
  readonly marketing: MarketingDataView | null;

  // Verification state
  readonly allAttestationsVerified: boolean;
  readonly attestationCount: number;

  // After issuance
  readonly issuedAt?: Date;
  readonly vcId?: string;
}
```

**Why Contracts Matter at Scale:**

| Without Contracts | With Contracts |
|-------------------|----------------|
| Compliance queries Design tables directly | Compliance queries `DesignDataView` interface |
| Schema changes break Compliance | Interface remains stable |
| Can't cache workspace views | Views are read-only, highly cacheable |
| Tight coupling prevents independent deployment | Workspaces can evolve independently |
| Testing requires full database | Mock interfaces for unit tests |

**Implementation Note:**

```typescript
// Repository implements the contract
class DesignWorkspaceRepository implements DesignDataViewProvider {
  async getDesignView(versionId: string): Promise<DesignDataView> {
    const version = await this.prisma.designVersion.findUnique({
      where: { id: versionId },
      include: {
        materials: true,
        certifications: true,
        attestations: { include: { contributor: true } },
      },
    });

    if (!version || version.state !== 'released_to_ops') {
      throw new NotFoundError('Design version not released');
    }

    // Map to immutable view contract
    return Object.freeze({
      productId: version.productId,
      versionId: version.id,
      // ... map all fields
    });
  }
}
```

### Check-Out/Check-In Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CHECK-OUT/CHECK-IN WORKFLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User A wants to edit product                                               │
│          │                                                                  │
│          ▼                                                                  │
│  ┌─────────────────┐      ┌─────────────────┐                              │
│  │  CHECK OUT v3   │      │  Product locked │ ◀── User B sees:            │
│  │  (30-min lock)  │ ────▶│  to User A      │     "Checked out by User A" │
│  └─────────────────┘      └─────────────────┘     [View Only] [Request]   │
│          │                                                                  │
│          ▼                                                                  │
│  User A edits (local draft)                                                 │
│          │                                                                  │
│          ├──────────────────┐                                              │
│          ▼                  ▼                                              │
│  ┌─────────────────┐  ┌─────────────────┐                                 │
│  │   CHECK IN      │  │    DISCARD      │                                 │
│  │   → v4 created  │  │    → Lock       │                                 │
│  │   → Lock        │  │      released   │                                 │
│  │      released   │  │                 │                                 │
│  └─────────────────┘  └─────────────────┘                                 │
│                                                                              │
│  TIMEOUT HANDLING:                                                          │
│  • 30-minute timeout with 5-minute warnings                                 │
│  • User can extend (up to 4 hours max)                                      │
│  • On timeout: draft auto-saved, lock released                             │
│  • Other user can then check out                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Check-Out API

```typescript
// Check out a product for editing
POST /api/v1/products/:id/checkout
Request: { workspace: 'design' | 'operations' | 'marketing' }
Response: {
  checkoutId: string;
  expiresAt: string;
  baseVersion: number;
  data: ProductData;
}

// Extend checkout timeout
POST /api/v1/products/:id/checkout/extend
Response: { expiresAt: string }

// Check in changes (creates new version)
POST /api/v1/products/:id/checkin
Request: {
  data: ProductData;
  changeDescription?: string;
}
Response: {
  version: number;
  versionId: string;
}

// Discard checkout (release lock without saving)
DELETE /api/v1/products/:id/checkout

// Request checkout from current holder
POST /api/v1/products/:id/checkout/request
Request: { message?: string }
// Sends notification to current holder
```

### Draft Recovery & Data Loss Prevention

Understanding what happens to unsaved changes during checkout:

#### Auto-Save Behavior

The system implements client-side auto-save to minimize data loss:

| Feature | Behavior |
|---------|----------|
| **Auto-save interval** | Every 60 seconds while editing |
| **Storage location** | Browser localStorage (per user, per product, per workspace) |
| **Retention** | Until checkin or explicit discard |
| **Cross-device** | Not synced - local to device only |

#### Timeout Scenarios

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TIMEOUT & DATA RECOVERY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SCENARIO 1: User is active, extends checkout                               │
│  ─────────────────────────────────────────────                              │
│  • 5-minute warning shown                                                   │
│  • User clicks "Extend" → checkout extended 30 more minutes                 │
│  • No data loss                                                             │
│                                                                              │
│  SCENARIO 2: User inactive, checkout times out                              │
│  ───────────────────────────────────────────────                            │
│  • System attempts auto-save to localStorage before releasing lock          │
│  • Lock released, other users can now checkout                              │
│  • When original user returns:                                              │
│    - If they checkout again → offered to restore from auto-save             │
│    - If another user checked in new version → merge conflict possible       │
│                                                                              │
│  SCENARIO 3: Browser crash / network failure                                │
│  ──────────────────────────────────────────────                             │
│  • Last auto-save in localStorage preserved                                 │
│  • Server-side checkout times out after 30 minutes                          │
│  • When user returns → offered to restore from localStorage                 │
│                                                                              │
│  SCENARIO 4: Deliberate discard                                             │
│  ──────────────────────────────────────────                                 │
│  • User clicks "Discard Changes"                                            │
│  • localStorage cleared for this product                                    │
│  • Lock released                                                            │
│  • NO recovery possible (by design)                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Recovery Limitations

**What IS recoverable:**
- ✓ Changes auto-saved to localStorage (last 60 seconds of work may be lost)
- ✓ Previous checked-in versions (always in version history)

**What is NOT recoverable:**
- ✗ Changes since last auto-save (up to 60 seconds)
- ✗ Explicitly discarded changes
- ✗ localStorage cleared by user/browser
- ✗ Changes overwritten by another user's checkin

#### Design Rationale

We deliberately do NOT implement server-side draft storage because:

1. **Simplicity**: Reduces system complexity and potential data conflicts
2. **Clear versioning**: Only checked-in versions are "real" - no ambiguous draft states
3. **Compliance**: ESPR requires clear version history - drafts would complicate this
4. **Performance**: No server round-trips during editing

**Recommendation for users**: Check in frequently with descriptive change notes. This creates clear version history and ensures work is never lost.

#### Concurrent Checkout Release (Scale Pattern)

At scale, a background job periodically releases expired checkouts. To prevent race conditions where multiple workers process the same expired checkout, we use `SELECT ... FOR UPDATE SKIP LOCKED`:

```sql
-- Background job: Release expired checkouts
-- Uses SKIP LOCKED to prevent double-processing across workers

BEGIN;

-- Select expired checkouts that aren't being processed by another worker
SELECT id, product_id, workspace, checked_out_by
FROM product_versions
WHERE status = 'checked_out'
  AND checkout_expires_at < NOW()
  AND deleted_at IS NULL
FOR UPDATE SKIP LOCKED
LIMIT 100;

-- Release the selected checkouts
UPDATE product_versions
SET status = 'checked_in',
    checked_out_by = NULL,
    checkout_expires_at = NULL,
    updated_at = NOW(),
    updated_by = '00000000-0000-0000-0000-000000000000', -- System user
    version = version + 1
WHERE id IN (/* selected IDs */);

-- Log the timeout events
INSERT INTO audit_log (
    organization_id, resource_type, resource_id,
    action, actor_id, actor_type, details, created_at
)
SELECT
    organization_id, 'product_version', id,
    'checkout_expired', '00000000-0000-0000-0000-000000000000', 'system',
    jsonb_build_object(
        'previous_holder', checked_out_by,
        'workspace', workspace,
        'expired_at', checkout_expires_at
    ),
    NOW()
FROM product_versions
WHERE id IN (/* selected IDs */);

COMMIT;
```

**Why SKIP LOCKED?**
- Multiple worker instances may run the expired checkout job simultaneously
- Without `SKIP LOCKED`, workers would block each other or cause conflicts
- `SKIP LOCKED` allows each worker to process different expired checkouts
- Combined with `LIMIT`, this distributes work across workers evenly

**Alternative: Single-Worker Pattern**
For smaller deployments, a single background worker with distributed locking (Redis `SETNX`) can be used instead:

```typescript
// Single-worker pattern with Redis lock
const lockKey = 'checkout:release:lock';
const acquired = await redis.set(lockKey, workerId, 'NX', 'EX', 300);

if (acquired) {
  try {
    await releaseExpiredCheckouts();
  } finally {
    await redis.del(lockKey);
  }
}
```

---

## Cross-Workspace Release Workflow

Different workspaces have distinct versioning and release models that coordinate to produce a DPP:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CROSS-WORKSPACE VERSION CONTROL & RELEASE                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DESIGN WORKSPACE                                                           │
│  ─────────────────                                                          │
│  v1 → v2 → v3 (checkout/checkin)                                           │
│            │                                                                 │
│      [RELEASE TO OPS]                                                       │
│            │                                                                 │
│            ▼                                                                 │
│      v3 "Released" ─────────► Available for batch selection                │
│            │                                                                 │
│      Can continue → v4 → v5 (independent of v3)                            │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  OPERATIONS WORKSPACE                                                       │
│  ────────────────────                                                       │
│  Batch #123 created                                                         │
│      └── Selects Design v3 (must be released)                              │
│            │                                                                 │
│            ▼                                                                 │
│      [COMMIT] → Design v3 referenced by this batch                        │
│            │    (batch data is immutable)                                   │
│            ▼                                                                 │
│      Production happens...                                                  │
│            │                                                                 │
│            ▼                                                                 │
│      [RELEASE FOR DPP]                                                      │
│            │    Meaning: Production complete, QA approved, ready for sales  │
│            ▼                                                                 │
│      Batch #123 "Ready for DPP"                                            │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  MARKETING WORKSPACE                                                        │
│  ───────────────────                                                        │
│  v1 → v2 → v3 (checkout/checkin)                                           │
│            │                                                                 │
│      [RELEASE FOR DPP]                                                      │
│            │                                                                 │
│            ▼                                                                 │
│      v3 "Released" ─────────► Brand story, care instructions,              │
│                               sustainability narrative (ESPR compliant)     │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  COMPLIANCE WORKSPACE                                                       │
│  ────────────────────                                                       │
│  DPP for Batch #123:                                                        │
│      ├── Design v3 (released, referenced by batch)                         │
│      ├── Batch #123 data (serials, production date, EPCIS)                 │
│      └── Marketing v3 (released for DPP)                                   │
│            │                                                                 │
│            ▼                                                                 │
│      [CREATE SNAPSHOT] → All workspace data frozen                         │
│            │                                                                 │
│            ▼                                                                 │
│      Compliance Manager approves                                            │
│            │                                                                 │
│            ▼                                                                 │
│      DPP ISSUED (Verifiable Credential for Batch #123)                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Principles:**
- **Design**: Revisions can be released independently; multiple revisions can be released simultaneously
- **Operations**: Batches are immediately immutable at creation; no revisions, just states
- **Marketing**: Same checkout/checkin model as Design; releases content for DPP
- **DPP Scope**: One batch = one DPP (per-batch issuance)

---

### Design Revision Release

Design revisions follow a checkout/checkin model with an additional release gate for Operations.

#### Revision States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DESIGN REVISION STATE MACHINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────┐     ┌─────────────┐     ┌─────────────┐     ┌───────────────┐  │
│   │ DRAFT  │────▶│ CHECKED_OUT │────▶│ CHECKED_IN  │────▶│ RELEASED_TO_  │  │
│   │        │     │  (editing)  │     │  (frozen)   │     │ OPS (frozen)  │  │
│   └────────┘     └─────────────┘     └─────────────┘     └───────────────┘  │
│        │               │                   │                      │          │
│        │               ▼                   │                      ▼          │
│        │         [Discard] ────────────────┘              Multiple batches   │
│        │                                                  can reference      │
│        │                                                                     │
│        └──────────────────────────────────────────────────────────────────▶  │
│                     (new edits always create new versions)                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

| State | Description | Who Can Transition |
|-------|-------------|-------------------|
| **DRAFT** | Initial state for new revisions | System (on create) |
| **CHECKED_OUT** | User is actively editing | User with EDITOR role |
| **CHECKED_IN** | Editing complete, revision frozen | User who checked out |
| **RELEASED_TO_OPS** | Frozen forever; available for Operations batch selection | Design MANAGER |

**Key Principle:** Once a revision is released, it is **frozen forever**. No edits can be made to that revision. New work must be done in a new revision.

#### Release Rules

- **Multiple Releases**: Multiple revisions can be released simultaneously (e.g., r2 and r3 both released)
- **Independence**: Releasing r3 does not affect r2's release status
- **Immutability**: Released revisions are frozen forever - no edits allowed
- **Multiple References**: Multiple batches can reference the same released Design revision
- **Continuation**: Editing can continue on new revisions (r4, r5...) regardless of released revisions

#### Design Revision Interface

```typescript
interface DesignVersion {
  id: string;
  productId: string;
  version: number;

  // State machine (released_to_ops is the final state - frozen forever)
  state: 'draft' | 'checked_out' | 'checked_in' | 'released_to_ops';

  // Checkout tracking
  checkedOutBy?: string;
  checkedOutAt?: Date;
  checkedInBy?: string;
  checkedInAt?: Date;

  // Release tracking
  releasedBy?: string;
  releasedAt?: Date;
  releaseNote?: string;

  // Version data (immutable after check-in)
  data: DesignData;

  // Audit
  createdAt: Date;
  createdBy: string;
}
```

#### Release API

```typescript
// Release a Design version to Operations
POST /api/v1/products/:productId/design/:version/release
Authorization: Design MANAGER role required
Request: {
  releaseNote?: string;  // Optional note for Operations
}
Response: {
  version: number;
  state: 'released_to_ops';
  releasedAt: string;
  releasedBy: string;
}

// List released versions available for batch selection
// Note: Multiple batches can reference the same released version
GET /api/v1/products/:productId/design/released
Response: {
  versions: {
    version: number;
    releasedAt: string;
    releaseNote?: string;
    referencedByBatches: string[];  // List of batch IDs using this version
  }[];
}
```

#### Release Audit Trail

```json
{
  "eventType": "DESIGN_VERSION_RELEASED",
  "productId": "prod_123",
  "version": 3,
  "workspace": "design",
  "releasedBy": "user_456",
  "releasedAt": "2026-01-14T10:30:00Z",
  "releaseNote": "Approved by product team for Spring 2026 collection",
  "previousState": "checked_in",
  "newState": "released_to_ops"
}
```

#### Complete Version Lifecycle State Machine (Scale Architecture)

For long-term version management at scale, versions follow an extended lifecycle beyond the basic edit/release flow:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE VERSION LIFECYCLE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  EDITING PHASE (short-term)                                                 │
│  ─────────────────────────────                                              │
│                                                                              │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌────────────────┐   │
│  │  DRAFT  │───▶│ CHECKED_OUT │───▶│ CHECKED_IN  │───▶│ RELEASED_TO_   │   │
│  │         │    │             │    │             │    │ OPS            │   │
│  └─────────┘    └─────────────┘    └─────────────┘    └───────┬────────┘   │
│                                                                │             │
│  ════════════════════════════════════════════════════════════════════════   │
│                                                                │             │
│  LIFECYCLE PHASE (long-term)                                   │             │
│  ──────────────────────────                                    ▼             │
│                                                                              │
│                      ┌────────────────────────────────────────────────┐     │
│                      │               ACTIVE                            │     │
│                      │  • Referenced by production batches             │     │
│                      │  • Referenced by active DPPs                    │     │
│                      │  • CANNOT be deleted or modified                │     │
│                      └──────────────────┬─────────────────────────────┘     │
│                                         │                                    │
│                            (no more active references)                       │
│                                         │                                    │
│                                         ▼                                    │
│                      ┌────────────────────────────────────────────────┐     │
│                      │              DEPRECATED                         │     │
│                      │  • Superseded by newer version                  │     │
│                      │  • Still valid for historical DPPs              │     │
│                      │  • New batches should use newer version         │     │
│                      └──────────────────┬─────────────────────────────┘     │
│                                         │                                    │
│                             (6 months grace period)                          │
│                                         │                                    │
│                                         ▼                                    │
│                      ┌────────────────────────────────────────────────┐     │
│                      │               ARCHIVED                          │     │
│                      │  • No active production usage                   │     │
│                      │  • Retained for compliance (10 years)           │     │
│                      │  • Still readable for audit                     │     │
│                      └──────────────────┬─────────────────────────────┘     │
│                                         │                                    │
│                            (retention period expires)                        │
│                                         │                                    │
│                                         ▼                                    │
│                      ┌────────────────────────────────────────────────┐     │
│                      │                RETIRED                          │     │
│                      │  • All DPPs expired (10+ years)                 │     │
│                      │  • Can be purged for storage optimization       │     │
│                      │  • Audit log retained separately                │     │
│                      └────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Lifecycle State Definitions:**

| State | Trigger | Can Delete? | Can Reference? | Storage |
|-------|---------|-------------|----------------|---------|
| **RELEASED** | Manual release | No | Yes (new batches) | Hot |
| **ACTIVE** | Batch references it | No | Yes | Hot |
| **DEPRECATED** | Newer version released | No | Warn but allow | Hot |
| **ARCHIVED** | No active references | No | No (read-only) | Warm (S3) |
| **RETIRED** | 10-year retention met | Yes (optional) | No | Cold/Delete |

**Automatic State Transitions:**

```typescript
// Background job: Manage version lifecycle states
async function processVersionLifecycle(): Promise<void> {
  // 1. RELEASED → ACTIVE (when first batch references it)
  await prisma.$executeRaw`
    UPDATE product_versions
    SET lifecycle_state = 'active',
        activated_at = NOW()
    WHERE lifecycle_state = 'released'
      AND id IN (
        SELECT DISTINCT design_version_id FROM batches
        WHERE status IN ('committed', 'in_production', 'completed')
      )
  `;

  // 2. ACTIVE → DEPRECATED (when newer version is active)
  await prisma.$executeRaw`
    UPDATE product_versions pv1
    SET lifecycle_state = 'deprecated',
        deprecated_at = NOW()
    WHERE lifecycle_state = 'active'
      AND EXISTS (
        SELECT 1 FROM product_versions pv2
        WHERE pv2.product_id = pv1.product_id
          AND pv2.workspace = pv1.workspace
          AND pv2.version > pv1.version
          AND pv2.lifecycle_state = 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM batches b
        WHERE b.design_version_id = pv1.id
          AND b.status IN ('in_production', 'planned')
      )
  `;

  // 3. DEPRECATED → ARCHIVED (after 6 months with no active references)
  await prisma.$executeRaw`
    UPDATE product_versions
    SET lifecycle_state = 'archived',
        archived_at = NOW()
    WHERE lifecycle_state = 'deprecated'
      AND deprecated_at < NOW() - INTERVAL '6 months'
      AND NOT EXISTS (
        SELECT 1 FROM passports p
        WHERE p.design_version_id = product_versions.id
          AND p.status = 'published'
          AND p.revoked_at IS NULL
      )
  `;

  // 4. ARCHIVED → RETIRED (after 10-year retention)
  await prisma.$executeRaw`
    UPDATE product_versions
    SET lifecycle_state = 'retired',
        retired_at = NOW()
    WHERE lifecycle_state = 'archived'
      AND archived_at < NOW() - INTERVAL '10 years'
  `;
}
```

**Reference Protection:**

```typescript
// Prevent deletion of referenced versions
async function deleteVersion(versionId: string): Promise<void> {
  const version = await prisma.productVersion.findUnique({
    where: { id: versionId },
    include: {
      _count: {
        select: {
          batches: true,
          passports: true,
        },
      },
    },
  });

  if (!version) {
    throw new NotFoundError('Version not found');
  }

  // Check lifecycle state
  if (version.lifecycleState !== 'retired') {
    throw new ConflictError(
      `Cannot delete version in ${version.lifecycleState} state. Only RETIRED versions can be deleted.`,
      { currentState: version.lifecycleState }
    );
  }

  // Double-check no references (defensive)
  if (version._count.batches > 0 || version._count.passports > 0) {
    throw new ConflictError(
      'Cannot delete version with active references',
      {
        batchCount: version._count.batches,
        passportCount: version._count.passports,
      }
    );
  }

  // Safe to delete
  await prisma.productVersion.delete({ where: { id: versionId } });

  await auditLog.record({
    action: 'VERSION_DELETED',
    resourceType: 'product_version',
    resourceId: versionId,
    details: {
      productId: version.productId,
      versionNumber: version.version,
      previousState: 'retired',
    },
  });
}
```

---

### Marketing Revision Release

Marketing follows the same checkout/checkin model as Design, with a release gate for DPP inclusion.

#### Revision States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MARKETING REVISION STATE MACHINE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────┐     ┌─────────────┐     ┌─────────────┐     ┌───────────────┐  │
│   │ DRAFT  │────▶│ CHECKED_OUT │────▶│ CHECKED_IN  │────▶│ RELEASED_FOR_ │  │
│   │        │     │  (editing)  │     │  (frozen)   │     │ DPP (frozen)  │  │
│   └────────┘     └─────────────┘     └─────────────┘     └───────────────┘  │
│        │               │                   │                      │          │
│        │               ▼                   │                      ▼          │
│        │         [Discard] ────────────────┘              Multiple DPPs      │
│        │                                                  can reference      │
│        │                                                                     │
│        └──────────────────────────────────────────────────────────────────▶  │
│                     (new edits always create new revisions)                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Principle:** Once a Marketing revision is released, it is **frozen forever**. No edits can be made to that revision. New work must be done in a new revision.

| State | Description | Who Can Transition |
|-------|-------------|-------------------|
| **DRAFT** | Initial state for new revisions | System (on create) |
| **CHECKED_OUT** | User is actively editing | User with EDITOR role |
| **CHECKED_IN** | Editing complete, revision frozen | User who checked out |
| **RELEASED_FOR_DPP** | Frozen forever; available for DPP snapshot inclusion | Marketing MANAGER |

#### Marketing Release Rules

- **Multiple Releases**: Multiple Marketing revisions can be released simultaneously (e.g., r2 for US market, r3 for EU market)
- **Independence**: Releasing r3 does not affect r2's release status
- **Explicit Selection**: When creating a DPP snapshot, user explicitly selects which released Marketing revision to include
- **Continuation**: Editing can continue on new revisions regardless of released revisions

#### Marketing Content in DPP (ESPR Guidance)

ESPR allows certain marketing content in DPPs. The following guidance applies:

| Data Category | Examples | DPP Status |
|---------------|----------|------------|
| **Mandatory** | Materials, Carbon Footprint, Repair Index | Required by law |
| **Functional** | User Manuals, Warranty Info, Safety Instructions | Allowed (often required) |
| **Marketing** | Brand Story, Traceability "Journey", Sustainability Narrative | Allowed (Voluntary) |
| **Promotional** | Limited-time Sales, Unrelated Ads | Discouraged/Restricted |

**Key Principle**: Brand storytelling and sustainability narrative are permitted and encouraged. Promotional content (sales, discounts, unrelated advertising) should not be included.

#### Marketing Version Interface

```typescript
interface MarketingVersion {
  id: string;
  productId: string;
  version: number;

  // State machine (released_for_dpp is the final state - frozen forever)
  state: 'draft' | 'checked_out' | 'checked_in' | 'released_for_dpp';

  // Checkout tracking
  checkedOutBy?: string;
  checkedOutAt?: Date;
  checkedInBy?: string;
  checkedInAt?: Date;

  // Release tracking
  releasedBy?: string;
  releasedAt?: Date;
  releaseNote?: string;

  // Version data (immutable after check-in)
  data: MarketingData;

  // Audit
  createdAt: Date;
  createdBy: string;
}

interface MarketingData {
  // ESPR-compliant content
  brandStory?: string;
  sustainabilityNarrative?: string;
  careInstructions?: string;
  repairInstructions?: string;
  warrantyInfo?: string;

  // Media references
  productImages: string[];
  instructionVideos?: string[];

  // Localization
  translations: Record<string, {
    brandStory?: string;
    careInstructions?: string;
  }>;
}
```

#### Marketing Release API

```typescript
// Release a Marketing version for DPP inclusion
POST /api/v1/products/:productId/marketing/:version/release
Authorization: Marketing MANAGER role required
Request: {
  releaseNote?: string;
}
Response: {
  version: number;
  state: 'released_for_dpp';
  releasedAt: string;
  releasedBy: string;
}

// Get released Marketing versions for DPP
// Note: Multiple DPP snapshots can reference the same released version
GET /api/v1/products/:productId/marketing/released
Response: {
  versions: {
    version: number;
    releasedAt: string;
    releaseNote?: string;
    referencedBySnapshots: string[];  // List of snapshot IDs using this version
  }[];
}
```

---

### Operations Batch Workflow

Operations does NOT use versions. Instead, it manages **batches** which are immediately immutable upon creation.

#### Batch Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPERATIONS BATCH STATE MACHINE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐ │
│   │                          BATCH CREATION                                │ │
│   │                                                                        │ │
│   │   Select Released Design Version ──► Create Batch ──► CREATED         │ │
│   │   (must be RELEASED_TO_OPS)          (immediately immutable)          │ │
│   └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│                                      ▼                                       │
│   ┌───────────────────────────────────────────────────────────────────────┐ │
│   │                             COMMITTED                                  │ │
│   │                                                                        │ │
│   │   Design version reference recorded (version is frozen/immutable)     │ │
│   │   Batch data frozen (serials, quantities, dates)                       │ │
│   │   Production can proceed                                               │ │
│   └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│                                      ▼                                       │
│   ┌───────────────────────────────────────────────────────────────────────┐ │
│   │                         RELEASED_FOR_DPP                               │ │
│   │                                                                        │ │
│   │   Production complete                                                  │ │
│   │   QA approved                                                          │ │
│   │   Ready for sales                                                      │ │
│   │   Available for DPP snapshot creation                                  │ │
│   └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

| State | Description | Who Can Transition |
|-------|-------------|-------------------|
| **CREATED** | Batch created with Design version selected; batch data is immutable | Operations EDITOR |
| **COMMITTED** | Design version reference recorded; production proceeds | Operations MANAGER |
| **RELEASED_FOR_DPP** | Production complete, QA approved, ready for DPP | Operations MANAGER |

#### Key Batch Rules

1. **Batch Data Immutability**: Batch data (serials, quantity, dates) is immutable from creation; batch state progresses through workflow
2. **Design Selection**: Must select a Design version with state `released_to_ops`
3. **Design Reference**: On COMMIT, the batch records a reference to the Design version (the Design version remains in `released_to_ops` state)
4. **Multiple References**: Multiple batches can reference the same released Design version
5. **One DPP Per Batch**: Each batch results in exactly one DPP
6. **No Versions**: If corrections needed, create a new batch (old batch remains for audit)

#### Batch Interface

```typescript
interface OperationsBatch {
  id: string;
  batchNumber: string;          // Human-readable batch ID (e.g., "BATCH-2026-0001")
  productId: string;

  // State machine
  state: 'created' | 'committed' | 'released_for_dpp';

  // Design version reference
  designVersionId: string;
  designVersionNumber: number;

  // Immutable batch data (set at creation)
  quantity: number;
  serialNumbers: string[];      // Or serial range
  productionDate: Date;
  facilityId: string;

  // EPCIS events (append-only after creation)
  epcisEvents: EpcisEvent[];

  // Attestations linked to this batch
  attestationIds: string[];

  // Commit tracking
  committedBy?: string;
  committedAt?: Date;

  // Release tracking
  releasedBy?: string;
  releasedAt?: Date;
  releaseNote?: string;

  // QA tracking
  qaApprovedBy?: string;
  qaApprovedAt?: Date;

  // If DPP issued for this batch
  dppCredentialId?: string;
  dppIssuedAt?: Date;

  // Audit
  createdAt: Date;
  createdBy: string;
}
```

#### Batch API

```typescript
// Create a new batch (must select released Design version)
POST /api/v1/products/:productId/batches
Authorization: Operations EDITOR role required
Request: {
  designVersionNumber: number;  // Must be RELEASED_TO_OPS
  quantity: number;
  serialNumbers?: string[];
  serialRange?: { start: string; end: string };
  productionDate: string;
  facilityId: string;
}
Response: {
  batchId: string;
  batchNumber: string;
  state: 'created';
  designVersionNumber: number;
}

// Commit batch (records Design version reference)
POST /api/v1/products/:productId/batches/:batchId/commit
Authorization: Operations MANAGER role required
Response: {
  batchId: string;
  state: 'committed';
  designVersionNumber: number;
}

// Release batch for DPP
POST /api/v1/products/:productId/batches/:batchId/release
Authorization: Operations MANAGER role required
Request: {
  qaApprovedBy: string;
  qaApprovedAt: string;
  releaseNote?: string;
}
Response: {
  batchId: string;
  state: 'released_for_dpp';
  releasedAt: string;
  releasedBy: string;
}

// List batches ready for DPP
GET /api/v1/products/:productId/batches/ready-for-dpp
Response: {
  batches: {
    batchId: string;
    batchNumber: string;
    designVersionNumber: number;
    quantity: number;
    releasedAt: string;
    hasDpp: boolean;
  }[];
}
```

#### Batch Audit Trail

```json
{
  "eventType": "BATCH_RELEASED_FOR_DPP",
  "productId": "prod_123",
  "batchId": "batch_456",
  "batchNumber": "BATCH-2026-0001",
  "workspace": "operations",
  "releasedBy": "user_789",
  "releasedAt": "2026-01-14T14:00:00Z",
  "releaseNote": "QA passed, production complete",
  "qaApprovedBy": "qa_manager_123",
  "qaApprovedAt": "2026-01-14T13:45:00Z",
  "previousState": "committed",
  "newState": "released_for_dpp",
  "linkedDesignVersion": 3
}
```

---

### Design ↔ Marketing Coordination

Marketing versions are **linked to Design versions**, not independent. Each Marketing version references a specific released Design version.

#### Relationship Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  DESIGN ↔ MARKETING RELATIONSHIP                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Marketing versions LINK TO Design versions:                                │
│                                                                              │
│  Design v1 (Released Jan 10)                                                │
│    └── Marketing v1 (Released Jan 12) → linked to Design v1                 │
│    └── Marketing v2 (Released Jan 15) → linked to Design v1                 │
│                                                                              │
│  Design v2 (Released Jan 20)                                                │
│    └── Marketing v3 (Released Jan 22) → linked to Design v2                 │
│    └── Marketing v4 (Released Jan 25) → linked to Design v2                 │
│                                                                              │
│  KEY CONSTRAINTS:                                                           │
│  • Marketing version MUST reference a released Design version               │
│  • Multiple Marketing versions can reference the same Design version        │
│  • Marketing cannot be released until linked Design is released             │
│  • Design changes don't auto-propagate to existing Marketing versions       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Why This Model?

| Reason | Explanation |
|--------|-------------|
| **Consistency** | Marketing content describes a specific product design - if Design changes, Marketing may need updates |
| **Traceability** | Every Marketing version explicitly states which Design it describes |
| **Flexibility** | Multiple Marketing versions can exist for the same Design (regional variations, A/B testing) |
| **Compliance** | ESPR requires Marketing claims to accurately reflect actual product composition |

#### Marketing Version Creation

When creating a new Marketing version:

1. **Select Design Version**: User must choose which released Design version this Marketing describes
2. **Inherit Product Data**: Marketing can auto-populate fields from selected Design (materials, composition, etc.)
3. **Add Marketing Content**: User adds descriptions, images, marketing claims
4. **Link Validation**: System ensures linked Design is still released (not archived)

```typescript
interface MarketingVersion {
  id: string;
  productId: string;
  version: number;
  linkedDesignVersion: number;  // Required: which Design version this describes
  state: 'DRAFT' | 'CHECKED_OUT' | 'CHECKED_IN' | 'RELEASED_FOR_DPP';
  content: MarketingContent;
  releasedBy?: string;
  releasedAt?: Date;
}
```

#### Design Updates Impact

When a new Design version is released:

| Scenario | Impact on Marketing |
|----------|---------------------|
| Minor Design change | Existing Marketing versions remain valid (still linked to old Design) |
| Major Design change | New Marketing version may be needed to describe new Design |
| Design archived | Marketing versions linked to it remain valid (frozen reference) |

**No automatic propagation**: Design changes don't cascade to Marketing. This is intentional - Marketing content may be different across regions even for the same Design.

---

### Operations ↔ Marketing Visibility

Operations users can view Marketing content that is linked to their Batch's Design version.

#### Visibility Rules

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  OPERATIONS ↔ MARKETING VISIBILITY                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Operations creates Batch #12345 → references Design v2                     │
│                                                                              │
│  Operations can SEE:                                                        │
│  ✓ Marketing v3 (linked to Design v2) - read-only view                     │
│  ✓ Marketing v4 (linked to Design v2) - read-only view                     │
│                                                                              │
│  Operations CANNOT see:                                                     │
│  ✗ Marketing v1 (linked to Design v1) - different Design                   │
│  ✗ Marketing v2 (linked to Design v1) - different Design                   │
│                                                                              │
│  Operations CANNOT do:                                                      │
│  ✗ Edit any Marketing content                                              │
│  ✗ Create Marketing versions                                               │
│  ✗ Release Marketing versions                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Cross-Workspace View

| Workspace | Can View | Can Edit | Can Release |
|-----------|----------|----------|-------------|
| **Design viewing Marketing** | ✓ (own Design's Marketing) | ✗ | ✗ |
| **Marketing viewing Design** | ✓ (linked Design only) | ✗ | ✗ |
| **Operations viewing Design** | ✓ (Batch's linked Design) | ✗ | ✗ |
| **Operations viewing Marketing** | ✓ (Batch's Design's Marketing) | ✗ | ✗ |
| **Compliance viewing all** | ✓ (all released versions) | ✗ | ✗ |

---

### DPP Pre-Snapshot Requirements

Before creating a DPP snapshot, all workspace releases must be in place.

#### Version Selection Rules

| Component | Selection Method |
|-----------|------------------|
| **Design Version** | Automatically determined - the batch references a specific released Design version at commit time |
| **Operations Batch** | User selects which released batch to create DPP for |
| **Marketing Version** | User explicitly selects which released Marketing version to include |

**Why explicit Marketing selection?** Multiple Marketing versions can be released simultaneously (e.g., v2 for US market, v3 for EU market). The Compliance user selects the appropriate version when creating the snapshot.

#### Snapshot Composition

A DPP snapshot requires contributions from three workspaces:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DPP SNAPSHOT COMPOSITION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         DPP SNAPSHOT                                 │    │
│  │                                                                      │    │
│  │   ┌─────────────────────────────────────────────────────────────┐   │    │
│  │   │  DESIGN DATA (from Design workspace)                         │   │    │
│  │   │  ────────────────────────────────────                        │   │    │
│  │   │  • Version: v3 (RELEASED_TO_OPS, referenced by batch)       │   │    │
│  │   │  • Materials, BOM, certifications                            │   │    │
│  │   │  • Design attestations                                       │   │    │
│  │   └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │   ┌─────────────────────────────────────────────────────────────┐   │    │
│  │   │  OPERATIONS DATA (from Operations workspace)                 │   │    │
│  │   │  ───────────────────────────────────────                     │   │    │
│  │   │  • Batch: #123 (RELEASED_FOR_DPP)                           │   │    │
│  │   │  • Serial numbers, production date                           │   │    │
│  │   │  • EPCIS events, facility info                              │   │    │
│  │   │  • Operations attestations                                   │   │    │
│  │   └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │   ┌─────────────────────────────────────────────────────────────┐   │    │
│  │   │  MARKETING DATA (from Marketing workspace)                   │   │    │
│  │   │  ──────────────────────────────────────                      │   │    │
│  │   │  • Version: v3 (RELEASED_FOR_DPP)                           │   │    │
│  │   │  • Brand story, sustainability narrative                     │   │    │
│  │   │  • Care instructions, warranty info                          │   │    │
│  │   └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Snapshot can only be created when ALL THREE components are ready:          │
│  ✓ Design version RELEASED_TO_OPS (referenced by the batch)                │
│  ✓ Operations batch RELEASED_FOR_DPP                                       │
│  ✓ Marketing version RELEASED_FOR_DPP                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### DPP Ready View

The Compliance workspace provides a "DPP Ready" dashboard showing release status:

```typescript
// API: GET /api/v1/products/:productId/batches/:batchId/dpp-readiness
interface DppReadiness {
  batchId: string;
  batchNumber: string;
  productId: string;

  // Overall status
  isReady: boolean;

  // Design status
  design: {
    ready: boolean;
    versionNumber: number;
    state: 'released_to_ops';  // Must be released (and referenced by this batch)
    releasedAt: string;
    issue?: string;            // If not ready, explains why
  };

  // Operations status
  operations: {
    ready: boolean;
    batchState: 'released_for_dpp';
    releasedAt: string;
    qaApprovedAt: string;
    issue?: string;
  };

  // Marketing status
  marketing: {
    ready: boolean;
    versionNumber: number;
    state: 'released_for_dpp';
    releasedAt: string;
    issue?: string;
  };

  // Blockers (if any)
  blockers: string[];
}
```

**Example Response (Ready)**:
```json
{
  "batchId": "batch_456",
  "batchNumber": "BATCH-2026-0001",
  "productId": "prod_123",
  "isReady": true,
  "design": {
    "ready": true,
    "versionNumber": 3,
    "state": "released_to_ops",
    "releasedAt": "2026-01-10T09:00:00Z"
  },
  "operations": {
    "ready": true,
    "batchState": "released_for_dpp",
    "releasedAt": "2026-01-14T14:00:00Z",
    "qaApprovedAt": "2026-01-14T13:45:00Z"
  },
  "marketing": {
    "ready": true,
    "versionNumber": 3,
    "state": "released_for_dpp",
    "releasedAt": "2026-01-13T16:00:00Z"
  },
  "blockers": []
}
```

**Example Response (Not Ready)**:
```json
{
  "batchId": "batch_789",
  "batchNumber": "BATCH-2026-0002",
  "productId": "prod_123",
  "isReady": false,
  "design": {
    "ready": true,
    "versionNumber": 4,
    "state": "released_to_ops",
    "releasedAt": "2026-01-12T10:00:00Z"
  },
  "operations": {
    "ready": true,
    "batchState": "released_for_dpp",
    "releasedAt": "2026-01-14T15:00:00Z",
    "qaApprovedAt": "2026-01-14T14:30:00Z"
  },
  "marketing": {
    "ready": false,
    "versionNumber": 2,
    "state": "checked_in",
    "issue": "Marketing version not released for DPP"
  },
  "blockers": [
    "Marketing version 2 must be released for DPP before snapshot can be created"
  ]
}
```

#### Snapshot Validation

When creating a compliance snapshot, the system validates:

```typescript
// Validation performed before snapshot creation
interface SnapshotValidation {
  // 1. Batch must be released
  batchReleased: boolean;

  // 2. Design version must be released and referenced by this batch
  designVersionReleased: boolean;
  designVersionReferencedByBatch: boolean;

  // 3. Marketing version must be released
  marketingVersionReleased: boolean;

  // 4. All attestations must be valid
  attestationsValid: boolean;

  // 5. No pending issues
  noPendingIssues: boolean;
}

// If validation fails, snapshot creation is rejected
POST /api/v1/compliance/snapshots
Request: {
  batchId: string;
  marketingVersionNumber: number;
}
Response (if validation fails): {
  error: "SNAPSHOT_VALIDATION_FAILED",
  validationResult: {
    batchReleased: true,
    designVersionReleased: true,
    designVersionReferencedByBatch: true,
    marketingVersionReleased: false,  // FAILED
    attestationsValid: true,
    noPendingIssues: true
  },
  message: "Marketing version must be released for DPP"
}
```

---

### Post-DPP-Issuance Changes

When product data changes after DPP issuance:

| Change Type | Action Required | Impact on Issued DPP |
|-------------|-----------------|---------------------|
| Minor update (typo fix) | Optional: Issue new DPP | Old DPP remains valid |
| Material change | Recommended: Revoke + reissue | Old DPP should be revoked |
| Compliance-critical change | Required: Revoke + reissue | Old DPP MUST be revoked |
| New batch/variant | Issue additional DPP | Separate credential |

### Audit Trail

All changes are logged in immutable audit log:

```json
{
  "eventType": "PRODUCT_UPDATED",
  "productId": "prod_123",
  "previousVersion": 3,
  "newVersion": 4,
  "workspace": "design",
  "userId": "user_456",
  "timestamp": "2026-01-14T10:30:00Z",
  "changes": {
    "materials.fiberComposition[0].percentage": { "from": 95, "to": 100 }
  },
  "relatedDpps": ["dpp_789"]  // DPPs issued from previous versions
}
```

---

## Compliance Snapshot Isolation

When a DPP is submitted for approval, the system creates an **immutable snapshot** of all workspace data. This ensures the approval process evaluates a fixed state, even if product data continues to evolve.

### The Problem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WITHOUT SNAPSHOT ISOLATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Day 1: Marketing submits DPP for approval                                  │
│         Product shows: "95% Organic Cotton"                                 │
│                                                                              │
│  Day 2: Design updates materials (routine correction)                       │
│         Product now shows: "92% Organic Cotton"                             │
│                                                                              │
│  Day 3: Compliance approves DPP                                             │
│         Which version was approved? 95% or 92%?                             │
│                                                                              │
│  PROBLEM: No audit trail of what was actually reviewed and approved.        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Solution: Snapshot-on-Submit

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLIANCE SNAPSHOT ISOLATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WORKFLOW:                                                                   │
│                                                                              │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │  DRAFT  │───▶│  SUBMITTED  │───▶│  APPROVED   │───▶│ VC ISSUED   │      │
│  │         │    │  (snapshot  │    │  (snapshot  │    │ (references │      │
│  │         │    │   created)  │    │   locked)   │    │  snapshot)  │      │
│  └─────────┘    └──────┬──────┘    └─────────────┘    └─────────────┘      │
│                        │                                                     │
│                        │ OR                                                  │
│                        ▼                                                     │
│                 ┌─────────────┐                                             │
│                 │  REJECTED   │                                             │
│                 │  (snapshot  │                                             │
│                 │  retained)  │                                             │
│                 └─────────────┘                                             │
│                                                                              │
│  KEY PRINCIPLE:                                                             │
│  Once submitted, the DPP approval evaluates the SNAPSHOT, not live data.    │
│  Product data can continue to change for future DPPs without affecting      │
│  the pending approval.                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Snapshot Creation

When a DPP is submitted for approval:

```typescript
interface ComplianceSnapshot {
  // Unique identifier (content-addressed)
  id: string;                    // snap_<sha256 hash of content>

  // What was snapshotted
  productId: string;
  organizationId: string;

  // Frozen workspace data at submission time
  designData: DesignWorkspaceData;      // Materials, BOM, certifications
  operationsData: OperationsWorkspaceData;  // Batches, EPCIS events
  marketingData: MarketingWorkspaceData;    // PIM content, media refs

  // Attestations included (references to signed VCs)
  attestationIds: string[];

  // Metadata
  submittedAt: Date;
  submittedBy: string;           // User ID who submitted
  productVersion: number;        // Version of product at submission

  // Content hash for integrity verification
  contentHash: string;           // SHA-256 of canonical JSON

  // Approval state
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;

  // If approved, link to issued credential
  issuedCredentialId?: string;
}
```

### Immutable Storage

Snapshots are stored in an append-only manner:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SNAPSHOT STORAGE                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TABLE: compliance_snapshots                                                │
│  ─────────────────────────────                                              │
│  • Primary storage for all compliance snapshots                             │
│  • Append-only (no UPDATE or DELETE allowed at application level)           │
│  • Content-addressed ID prevents tampering                                  │
│                                                                              │
│  INTEGRITY GUARANTEES:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. ID derived from content hash                                      │   │
│  │    snap_<sha256(canonical_json)>                                     │   │
│  │                                                                       │   │
│  │ 2. Application enforces append-only                                  │   │
│  │    - No UPDATE operations on snapshot content                        │   │
│  │    - Status field is only mutable field (pending→approved/rejected)  │   │
│  │                                                                       │   │
│  │ 3. Database triggers log any modification attempts                   │   │
│  │    - Alerts on unexpected modifications                              │   │
│  │    - Audit trail preserved                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  RETENTION: 10 years minimum (ESPR compliance requirement)                  │
│  After 10 years: Archive to cold storage (S3 Glacier), retain hash index    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Version Reference in Issued Credentials

When a DPP is approved and the VC is issued, it references the exact snapshot:

```json
{
  "@context": [...],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:key:z6MkOrg...",
  "issuanceDate": "2026-01-14T10:30:00Z",

  "credentialSubject": {
    "id": "urn:gtin:5901234123457",
    "type": "Product",
    "name": "Organic Cotton T-Shirt",
    "...": "... all DPP data ..."
  },

  "evidence": [
    {
      "type": "ComplianceSnapshot",
      "id": "snap_a1b2c3d4e5f6...",
      "contentHash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "submittedAt": "2026-01-12T09:00:00Z",
      "approvedAt": "2026-01-14T10:30:00Z",
      "approvedBy": "user_compliance_manager_123"
    }
  ],

  "proof": { "...": "..." }
}
```

**The `evidence` field provides:**
- `id`: Exact snapshot that was approved
- `contentHash`: Verifiable link to frozen data
- `submittedAt` / `approvedAt`: Timeline of approval process
- `approvedBy`: Who approved (for accountability)

### Approval Workflow States

| State | Description | Snapshot | Product Editable? |
|-------|-------------|----------|-------------------|
| **DRAFT** | DPP being prepared | None | Yes |
| **SUBMITTED** | Awaiting compliance review | Created & locked | Yes (changes go to new version) |
| **APPROVED** | Compliance approved, VC issued | Retained forever | Yes (for future DPPs) |
| **REJECTED** | Compliance rejected | Retained for audit | Yes (resubmit creates new snapshot) |

### Rejection and Resubmission

When a DPP is rejected:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REJECTION FLOW                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Compliance reviewer rejects DPP                                         │
│     - Must provide rejection reason                                         │
│     - Snapshot status updated to 'rejected'                                 │
│     - Snapshot content RETAINED (audit trail)                               │
│                                                                              │
│  2. Product team receives notification                                       │
│     - Sees rejection reason                                                 │
│     - Sees which snapshot was rejected                                      │
│     - Can view exact data that was reviewed                                 │
│                                                                              │
│  3. Product team makes corrections                                          │
│     - Edits product data (creates new version)                              │
│     - Can reference rejected snapshot to see what to fix                    │
│                                                                              │
│  4. Resubmission                                                            │
│     - Creates NEW snapshot with corrected data                              │
│     - New snapshot ID (different content hash)                              │
│     - Original rejected snapshot remains in history                         │
│                                                                              │
│  AUDIT TRAIL:                                                               │
│  snap_v1 (rejected) → snap_v2 (rejected) → snap_v3 (approved)              │
│  All snapshots retained, showing full approval history                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Snapshot Comparison

Users can compare snapshots to understand changes:

```typescript
// API: GET /api/v1/compliance/snapshots/{id1}/diff/{id2}
interface SnapshotDiff {
  snapshot1: {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    submittedAt: Date;
  };
  snapshot2: {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    submittedAt: Date;
  };
  changes: {
    path: string;           // e.g., "designData.materials[0].percentage"
    oldValue: any;
    newValue: any;
    workspace: 'design' | 'operations' | 'marketing';
  }[];
}
```

### Integration with Issued Credentials

When querying a credential's provenance:

```typescript
// API: GET /api/v1/credentials/{id}/provenance
interface CredentialProvenance {
  credentialId: string;
  issuedAt: Date;

  // The exact snapshot that was approved
  snapshot: {
    id: string;
    contentHash: string;
    submittedAt: Date;
    approvedAt: Date;
    approvedBy: string;
  };

  // History of submissions for this product
  submissionHistory: {
    snapshotId: string;
    status: 'approved' | 'rejected';
    submittedAt: Date;
    reviewedAt: Date;
    rejectionReason?: string;
  }[];

  // Product version at time of submission
  productVersion: number;
}
```

---

## Workspace Architecture

Trust is built progressively through four workspaces, all connected to the Hub:

| Workspace | Trust Function | Key Modules | Hub Access |
|-----------|----------------|-------------|------------|
| **Design** | Technical truth - materials, composition, certifications | Registry, BOM-Materials, Certifications, Attestations | Read/Write |
| **Operations** | Lifecycle events - batch tracking, supply chain events | Registry, Batch Mgmt, EPCIS, Attestations | Read/Write |
| **Marketing** | Commercial presentation - content, media, channels | PIM, DAM-Media, Channels | Read/Write |
| **Compliance** | DPP issuance - review and credential signing | DPP Ready, Credential Issuance | Read + Issue |

### Workspace Roles

Each workspace has role-based access control. **This is the single source of truth for workspace permissions** - other documents reference this matrix.

#### Role Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     WORKSPACE ROLE HIERARCHY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ALL WORKSPACES (Design, Marketing, Operations, Compliance):                │
│                                                                              │
│  MANAGER ← Has all EDITOR permissions                                       │
│    │       (In Compliance: acts as "Approver" - can approve/reject DPPs)   │
│  EDITOR ← Has all VIEWER permissions                                        │
│    │       (In Compliance: acts as "Reviewer" - can create snapshots)      │
│  VIEWER ← Base read-only access                                             │
│                                                                              │
│  CONTRIBUTOR (external) ← Limited access for attestation submission only   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Comprehensive Permissions Matrix

**Design Workspace:**

| Action | VIEWER | EDITOR | MANAGER |
|--------|:------:|:------:|:-------:|
| View product data | ✓ | ✓ | ✓ |
| View version history | ✓ | ✓ | ✓ |
| View audit log | ✓ | ✓ | ✓ |
| Checkout version | - | ✓ | ✓ |
| Edit checked-out version | - | ✓ | ✓ |
| Checkin version | - | ✓ | ✓ |
| Cancel checkout | - | ✓ (own) | ✓ (any) |
| Request checkout (queued) | - | ✓ | ✓ |
| Extend checkout timeout | - | ✓ | ✓ |
| Release version to Operations | - | - | ✓ |
| View cross-workspace Marketing | ✓ | ✓ | ✓ |

**Operations Workspace:**

| Action | VIEWER | EDITOR | MANAGER |
|--------|:------:|:------:|:-------:|
| View batches | ✓ | ✓ | ✓ |
| View EPCIS events | ✓ | ✓ | ✓ |
| View audit log | ✓ | ✓ | ✓ |
| Create batch | - | ✓ | ✓ |
| Edit batch (before commit) | - | ✓ | ✓ |
| Add EPCIS events | - | ✓ | ✓ |
| Commit batch | - | - | ✓ |
| Release batch for DPP | - | - | ✓ |
| View linked Design version | ✓ | ✓ | ✓ |
| View linked Marketing versions | ✓ | ✓ | ✓ |

**Marketing Workspace:**

| Action | VIEWER | EDITOR | MANAGER |
|--------|:------:|:------:|:-------:|
| View marketing content | ✓ | ✓ | ✓ |
| View version history | ✓ | ✓ | ✓ |
| View audit log | ✓ | ✓ | ✓ |
| Checkout version | - | ✓ | ✓ |
| Edit checked-out version | - | ✓ | ✓ |
| Checkin version | - | ✓ | ✓ |
| Cancel checkout | - | ✓ (own) | ✓ (any) |
| Select linked Design version | - | ✓ | ✓ |
| Release version for DPP | - | - | ✓ |
| View linked Design data | ✓ | ✓ | ✓ |

**Compliance Workspace:**

| Action | VIEWER | EDITOR | MANAGER |
|--------|:------:|:------:|:-------:|
| View DPP readiness dashboard | ✓ | ✓ | ✓ |
| View snapshot history | ✓ | ✓ | ✓ |
| View audit log | ✓ | ✓ | ✓ |
| View Design/Ops/Marketing data | ✓ | ✓ | ✓ |
| Create compliance snapshot | - | ✓ | ✓ |
| Select batch for snapshot | - | ✓ | ✓ |
| Select Marketing version(s) | - | ✓ | ✓ |
| Add review comments | - | ✓ | ✓ |
| Request changes | - | ✓ | ✓ |
| Approve snapshot | - | - | ✓ |
| Reject snapshot | - | - | ✓ |
| Issue DPP credential | - | - | ✓ |
| Revoke DPP credential | - | - | ✓ |

#### Cross-Workspace Permissions

| Action | Design | Operations | Marketing | Compliance |
|--------|--------|------------|-----------|------------|
| View own workspace data | ✓ (VIEWER+) | ✓ (VIEWER+) | ✓ (VIEWER+) | ✓ (VIEWER+) |
| View Design data | - | ✓ (read-only) | ✓ (linked only) | ✓ (read-only) |
| View Operations data | - | - | - | ✓ (read-only) |
| View Marketing data | ✓ (read-only) | ✓ (linked only) | - | ✓ (read-only) |
| Edit other workspace | ✗ | ✗ | ✗ | ✗ |
| Release in other workspace | ✗ | ✗ | ✗ | ✗ |

> **Note:** Cross-workspace viewing is read-only. Users cannot edit or release content in workspaces they don't have direct access to.

#### Admin Permissions (Separate from Workspace)

Admin access is organization-level, separate from workspace roles:

| Action | Requires Admin |
|--------|:--------------:|
| Invite users | ✓ |
| Remove users | ✓ |
| Modify user roles | ✓ |
| Manage billing | ✓ |
| API key management | ✓ |
| Organization settings | ✓ |
| View all audit logs | ✓ |

> **Reference:** For complete details on Admin permissions and security, see [USER_MANAGEMENT.md](./USER_MANAGEMENT.md) Section 12-13.

---

## ESPR Article 31: Free Access Mandate

EU law requires DPP data to be accessible **"free of charge"** to all economic operators.

**We cannot charge retailers for DPP access. It's illegal.**

| Who | Access | Cost |
|-----|--------|------|
| Brands, Manufacturers | Create DPPs | €129-399/month subscription |
| Retailers | View & display DPPs | **Free** |
| Consumers | Verify DPPs | **Free** |
| Regulators | Audit DPPs | **Free** |

---

## Why This Model?

### The Problem with Retailer-Created Passports

If retailers could create their own passports:

| Risk | Description |
|------|-------------|
| **Copying** | Retailer copies supplier data without paying |
| **False claims** | Retailer claims certifications they don't have |
| **No accountability** | Who verifies retailer's claims? |
| **Complex validation** | Need proof requirements, plagiarism detection |

### The Solution: Organization-Only

| Benefit | Description |
|---------|-------------|
| **Central database** | Organization creates product with workspace data |
| **Manual approval** | Organizations review and approve each DPP before issuance |
| **No copying possible** | Retailers can't create - only access via API |
| **Clear liability** | Organization is legally responsible for DPP accuracy |

---

## Trust Chain

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              TRUST CHAIN WITH ATTESTATIONS                           │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  EXTERNAL TRUST SOURCES                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                         │
│  │ Certification│     │   Supplier   │     │   Testing    │                         │
│  │    Body      │     │  (Tier 1-N)  │     │     Lab      │                         │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘                         │
│         │                    │                    │                                  │
│    Issues cert          Signs material       Signs test                             │
│    (documentary)        attestation (VC)     results (VC)                           │
│         │                    │                    │                                  │
│         └────────────────────┴────────────────────┘                                  │
│                              │                                                       │
│                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                              THE HUB                                          │   │
│  │                    (Workspace Data - Always Synchronized)                     │   │
│  │                                                                               │   │
│  │   Design writes:           Operations writes:        Marketing writes:        │   │
│  │   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │   │
│  │   │ • Registry      │     │ • Batch Mgmt    │     │ • PIM Content   │        │   │
│  │   │ • BOM-Materials │     │ • EPCIS Events  │     │ • Media Assets  │        │   │
│  │   │ • Certifications│     │ • Attestations  │     │ • Channels      │        │   │
│  │   │ • Attestations  │     └─────────────────┘     └─────────────────┘        │   │
│  │   └─────────────────┘                                                         │   │
│  │                                                                               │   │
│  └───────────────────────────────────┬───────────────────────────────────────────┘   │
│                                      │ READ                                          │
│                                      ▼                                               │
│                    ┌─────────────────────────────────┐                              │
│                    │      Compliance Workspace       │                              │
│                    │                                 │                              │
│                    │  • Reads workspace data from Hub│                              │
│                    │  • Verifies attestation sigs    │                              │
│                    │  • Checks completeness          │                              │
│                    │  • Manual review & approval     │                              │
│                    │  • Issues DPP credential        │                              │
│                    └────────────────┬────────────────┘                              │
│                                     │                                                │
│                                     ▼                                                │
│                    ┌──────────────────────┐                                         │
│                    │   DPP (Signed VC)    │                                         │
│                    │   did:key portable   │                                         │
│                    │   Includes all       │                                         │
│                    │   attestation refs   │                                         │
│                    └──────────┬───────────┘                                         │
│                               │                                                      │
│                               ▼                                                      │
│                    ┌──────────────────────┐                                         │
│                    │  Retailer (Free)     │                                         │
│                    │  Display only        │                                         │
│                    └──────────────────────┘                                         │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Each Step Explained

1. **External Trust Sources → The Hub**
   - **Certification Bodies**: GOTS, OEKO-TEX, FSC certify the organization (documentary proof)
   - **Suppliers**: Sign material attestations with their did:key (Verifiable Credentials)
   - **Testing Labs**: Sign test results with their did:key (carbon footprint, composition)
   - All attestations are stored in the Hub as workspace data

2. **Workspaces Write to the Hub**
   - **Design**: Creates product in Registry, adds BOM, materials, certifications, attestations
   - **Operations**: Batch tracking, EPCIS events, batch-specific attestations
   - **Marketing**: Commercial content, media assets, channel data
   - All data is immediately synchronized in the Hub

3. **Compliance Workspace Reads the Hub**
   - Reads the complete workspace data (no aggregation needed - data is already there)
   - Verifies all attestation signatures
   - Checks completeness requirements
   - Organization reviews and approves for issuance
   - Signs DPP with organization's did:key

4. **DPP → Retailer**
   - Retailer accesses DPP for **free** via public API
   - Uses widget or Shopify Retailer App
   - Can display but cannot modify
   - DPP includes references to all attestations

---

## Verification Flow

### Public Verification

Anyone can verify a passport at `/v1/passports/:id/verify`:

```json
{
  "valid": true,
  "issuer": {
    "did": "did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS",
    "name": "Organization Name",
    "verified": true,
    "verifiedAt": "2025-06-15T10:30:00Z"
  },
  "credential": {
    "id": "urn:uuid:abc123...",
    "issuedAt": "2025-07-01T09:00:00Z",
    "expiresAt": "2035-07-01T09:00:00Z"
  },
  "signature": "valid",
  "attestations": {
    "total": 3,
    "verified": 3,
    "details": [
      {
        "type": "MaterialOrigin",
        "issuer": "did:key:z6Mkf...",
        "issuerName": "Supplier ABC",
        "valid": true
      },
      {
        "type": "TestingResults",
        "issuer": "did:key:z6Mkg...",
        "issuerName": "Carbon Lab Inc",
        "valid": true
      },
      {
        "type": "Manufacturing",
        "issuer": "did:key:z6Mkh...",
        "issuerName": "Factory XYZ",
        "valid": true
      }
    ]
  },
  "note": "Signature verification offline (did:key), revocation check requires network"
}
```

### What This Proves

| Claim | Verified By |
|-------|-------------|
| "This is a real passport" | Cryptographic signature |
| "Created by Organization X" | DID matches organization |
| "Organization approved this DPP" | Compliance workspace issuance |
| "Data hasn't been tampered" | VC signature integrity |
| "Supply chain claims are real" | Attestation signatures verified |
| "Third party verified claims" | Testing lab attestations |

---

## Certification Claims

### Only Suppliers Can Claim Certifications

Since retailers can't create passports, they can't make false certification claims.

| Certification | Who Claims It | Proof Required |
|--------------|---------------|----------------|
| GOTS | Supplier | Yes (during KYB) |
| OEKO-TEX | Supplier | Yes (during KYB) |
| FSC | Supplier | Yes (during KYB) |
| etc. | Supplier | Yes (during KYB) |

### Verification Links

Certifications can be independently verified:

| Certification | Verification URL |
|--------------|------------------|
| GOTS | https://global-standard.org/certification-and-labelling/check-if-certified |
| OEKO-TEX | https://www.oeko-tex.com/en/label-check |
| FSC | https://fsc.org/en/fsc-public-certificate-search |
| GRS | https://textileexchange.org/standards/grs/ |
| ENERGY STAR | https://www.energystar.gov/productfinder/ |

---

## Multi-Party Attestation

Beyond traditional certifications, EuroComply supports cryptographically signed attestations from supply chain partners.

### How Attestations Work

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MULTI-PARTY ATTESTATION FLOW                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. REQUEST                 2. ONBOARD                 3. CONTRIBUTE         │
│  ┌───────────────┐         ┌───────────────┐         ┌───────────────┐      │
│  │ Organization  │         │  Contributor  │         │  Contributor  │      │
│  │ requests data │────────▶│ receives link │────────▶│ signs data    │      │
│  │ from partner  │         │ gets did:key  │         │ with did:key  │      │
│  └───────────────┘         └───────────────┘         └───────────────┘      │
│         │                                                   │                │
│   From Design or                                      Verifiable            │
│   Operations workspace                                Credential            │
│                                                             │                │
│  4. REVIEW                  5. STORE                   6. ISSUE             │
│  ┌───────────────┐         ┌───────────────┐         ┌───────────────┐      │
│  │ Organization  │         │  Attestation  │         │  Compliance   │      │
│  │ reviews in    │◀────────│  Module       │────────▶│  workspace    │      │
│  │ requesting WS │         │    (Hub)      │         │  issues DPP   │      │
│  └───────────────┘         └───────────────┘         └───────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Attestation Types

| Type | Requestor | Contributor | Example Claims |
|------|-----------|-------------|----------------|
| **Material Origin** | Brand (Design) | Tier 1-N Supplier | "Cotton sourced from India, farm XYZ" |
| **Manufacturing** | Brand (Operations) | Factory | "Produced at facility ABC, date X" |
| **Testing Results** | Brand (Design) | Lab | "Carbon footprint: 2.3 kg CO2e" |
| **Chain of Custody** | Brand (Operations) | Logistics | "Shipped via route X, cold chain maintained" |
| **Social Audit** | Brand (Design) | Auditor | "Fair labor practices verified" |

### Contributor Onboarding

Contributors don't need a EuroComply subscription. The flow is:

1. Organization sends contribution request via email
2. Contributor clicks link and creates free contributor account
3. System generates did:key for contributor
4. Contributor fills requested data and signs with did:key
5. Signed attestation returns to requesting organization's workspace

### Attestation Verification

All attestations are independently verifiable:

| What | How |
|------|-----|
| Signature valid | Verify did:key signature on VC |
| Contributor identity | did:key matches registered contributor |
| Not tampered | VC integrity check |
| Not expired | Check validUntil date |

### Relationship to DPP

Attestations do NOT go directly into the DPP. They are:

1. **Stored** in the Attestation Module as workspace data
2. **Referenced** in the DPP credential (attestation IDs included)
3. **Verifiable** independently via public API
4. **Aggregated** during DPP issuance in Compliance workspace

---

## What Retailers Get

### Retailer Access Options (All Free)

| Option | How It Works |
|--------|--------------|
| **Public API** | Look up DPPs by GTIN, brand/SKU, or serial number |
| **Embeddable Widget** | JavaScript snippet that displays DPP on any product page |
| **Shopify Retailer App** | Auto-matches store products to available DPPs by GTIN |

### What Retailers Cannot Do

- ❌ Create their own passport
- ❌ Modify organization's DPP data
- ❌ Claim certifications
- ❌ Remove organization attribution

### What Retailers Can Do (All Free)

- ✅ Look up DPPs via public API
- ✅ Embed widget on product pages
- ✅ Install Shopify Retailer App for auto-matching
- ✅ Display DPPs on their store

---

## Consumer Trust Signals

When consumers scan a DPP QR code:

```
┌─────────────────────────────────────────────────────────────┐
│                  DIGITAL PRODUCT PASSPORT                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✓ VERIFIED ORGANIZATION                                    │
│    Brand Name (verified Jan 2025)                           │
│                                                             │
│  ✓ CERTIFICATIONS                                           │
│    • GOTS Certified (valid until Dec 2026)                  │
│    • OEKO-TEX Standard 100                                  │
│                                                             │
│  ✓ SUPPLY CHAIN ATTESTATIONS                                │
│    • Material origin: Supplier ABC (verified)               │
│    • Carbon footprint: Lab XYZ (verified)                   │
│                                                             │
│  ✓ PRODUCT DATA                                             │
│    • 95% Organic Cotton, 5% Elastane                        │
│    • Made in Portugal                                       │
│    • Carbon footprint: 2.3 kg CO2e                          │
│                                                             │
│  ✓ CRYPTOGRAPHICALLY SIGNED                                 │
│    Credential ID: urn:uuid:abc123...                        │
│    Issued: 2025-07-01 (Compliance workspace)                │
│    3 attestations included                                  │
│                                                             │
│  [Verify Authenticity]                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary

| Question | Answer |
|----------|--------|
| Who creates passports? | Only registered organizations (brands, manufacturers, distributors) |
| Can retailers create passports? | No |
| Do retailers pay for access? | **No - free** (ESPR Article 31) |
| Who is liable for accuracy? | The organization that created the DPP |
| Where does product data live? | **The Hub** - central data store with workspace data per product |
| How do workspaces interact? | Design, Operations, Marketing WRITE to Hub; Compliance READS from Hub |
| Where are DPPs issued? | Compliance workspace (reads Hub, reviews, issues credentials) |
| How are supply chain claims verified? | Multi-party attestations signed with did:key |
| What DID method? | did:key (portable, self-verifying) |
| Can anyone verify a passport? | Yes - including all attestation signatures |
| What prevents fraud? | Hub architecture + attestations + manual approval |

---

## Related Documentation

- [User Management](./USER_MANAGEMENT.md) - Workspace-based access control and data ownership
- [Business Model](./BUSINESS_MODEL.md) - SME-first SaaS pricing
- [Verifiable Credentials](./VERIFIABLE_CREDENTIALS.md) - did:key, portability
- [Architecture Portability](./ARCHITECTURE_PORTABILITY.md) - Export, data ownership
- [Multi-Party Attestation](./MULTI_PARTY_ATTESTATION.md) - Supply chain attestations
- [DPP Content Plan](./DPP_CONTENT_PLAN.md) - Workspace data flow

---

*Last Updated: 2026-01-15*
