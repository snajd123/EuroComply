# Digital Product Passport Trust Model

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

### Version Management for Products

```typescript
// Each product record in the Hub
interface ProductVersion {
  id: string;
  version: number;           // Auto-incremented on check-in
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
- **Design**: Versions can be released independently; multiple versions can be released simultaneously
- **Operations**: Batches are immediately immutable at creation; no versions, just states
- **Marketing**: Same checkout/checkin model as Design; releases content for DPP
- **DPP Scope**: One batch = one DPP (per-batch issuance)

---

### Design Version Release

Design versions follow a checkout/checkin model with an additional release gate for Operations.

#### Version States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DESIGN VERSION STATE MACHINE                              │
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
| **DRAFT** | Initial state for new versions | System (on create) |
| **CHECKED_OUT** | User is actively editing | User with EDITOR role |
| **CHECKED_IN** | Editing complete, version frozen | User who checked out |
| **RELEASED_TO_OPS** | Frozen forever; available for Operations batch selection | Design MANAGER |

**Key Principle:** Once a version is released, it is **frozen forever**. No edits can be made to that version. New work must be done in a new version.

#### Release Rules

- **Multiple Releases**: Multiple versions can be released simultaneously (e.g., v2 and v3 both released)
- **Independence**: Releasing v3 does not affect v2's release status
- **Immutability**: Released versions are frozen forever - no edits allowed
- **Multiple References**: Multiple batches can reference the same released Design version
- **Continuation**: Editing can continue on new versions (v4, v5...) regardless of released versions

#### Design Version Interface

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

---

### Marketing Version Release

Marketing follows the same checkout/checkin model as Design, with a release gate for DPP inclusion.

#### Version States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MARKETING VERSION STATE MACHINE                           │
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
│                     (new edits always create new versions)                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Principle:** Once a Marketing version is released, it is **frozen forever**. No edits can be made to that version. New work must be done in a new version.

| State | Description | Who Can Transition |
|-------|-------------|-------------------|
| **DRAFT** | Initial state for new versions | System (on create) |
| **CHECKED_OUT** | User is actively editing | User with EDITOR role |
| **CHECKED_IN** | Editing complete, version frozen | User who checked out |
| **RELEASED_FOR_DPP** | Frozen forever; available for DPP snapshot inclusion | Marketing MANAGER |

**Key Principle:** Once a version is released, it is **frozen forever**. No edits can be made to that version. New work must be done in a new version.

#### Marketing Release Rules

- **Multiple Releases**: Multiple Marketing versions can be released simultaneously (e.g., v2 for US market, v3 for EU market)
- **Independence**: Releasing v3 does not affect v2's release status
- **Explicit Selection**: When creating a DPP snapshot, user explicitly selects which released Marketing version to include
- **Continuation**: Editing can continue on new versions regardless of released versions

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

Each workspace has role-based access control:

| Workspace | Role | Capabilities |
|-----------|------|--------------|
| **Design** | VIEWER | View product data, versions, release history |
| | EDITOR | Checkout, edit, checkin versions |
| | MANAGER | All EDITOR capabilities + Release versions to Operations |
| **Operations** | VIEWER | View batches, EPCIS events |
| | EDITOR | Create batches |
| | MANAGER | All EDITOR capabilities + Commit batches, Release for DPP |
| **Marketing** | VIEWER | View marketing content, versions |
| | EDITOR | Checkout, edit, checkin versions |
| | MANAGER | All EDITOR capabilities + Release versions for DPP |
| **Compliance** | VIEWER | View DPP readiness status, snapshot history |
| | REVIEWER | All VIEWER capabilities + Review snapshots, add comments |
| | APPROVER | All REVIEWER capabilities + Approve/reject snapshots, issue DPPs |

**Compliance Workflow Authorization:**

| Action | Required Role |
|--------|---------------|
| View DPP readiness dashboard | Compliance VIEWER |
| Create compliance snapshot | Compliance REVIEWER |
| Add review comments | Compliance REVIEWER |
| Approve snapshot | Compliance APPROVER |
| Reject snapshot | Compliance APPROVER |
| Issue DPP credential | Compliance APPROVER |

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
