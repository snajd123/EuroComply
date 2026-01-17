# EuroComply Architecture Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** Architecture Document v1.3 + clarification session

---

## 1. Overview

EuroComply is a unified Product Lifecycle & Compliance Platform combining PLM, ERP-lite, PIM, and Digital Product Passport (DPP) capabilities. This document defines the technical architecture.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Security first** | Schema-per-tenant isolation for ALL tiers |
| **Simplicity** | PostgreSQL + outbox over complex event systems |
| **Zero egress** | Cloudflare R2 for all public content |
| **Portable credentials** | did:key for offline verification |
| **Audit everything** | Event trail for every mutation |

---

## 2. System Architecture

### High-Level View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EUROCOMPLY                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Design    │  │ Operations  │  │  Marketing  │  │ Compliance  │        │
│  │  Workspace  │  │  Workspace  │  │  Workspace  │  │  Workspace  │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                   │                                          │
│                                   ▼                                          │
│                          ┌───────────────┐                                  │
│                          │   THE HUB     │                                  │
│                          │   (Product)   │                                  │
│                          └───────┬───────┘                                  │
│                                  │                                          │
│         ┌────────────────────────┼────────────────────────┐                │
│         ▼                        ▼                        ▼                │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐          │
│  │ PostgreSQL  │         │  DynamoDB   │         │ Cloudflare  │          │
│  │ (Products,  │         │   (Items,   │         │  R2 + CDN   │          │
│  │  Versions)  │         │   Events)   │         │   (DPPs)    │          │
│  └─────────────┘         └─────────────┘         └─────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Four Workspaces

| Workspace | Purpose | Data Ownership |
|-----------|---------|----------------|
| **Design** | Product registry, materials, BOMs, technical specs | Design versions |
| **Operations** | Item tracking, batches, EPCIS events, inventory | Batch records, items |
| **Marketing** | Product content, images, variants, syndication | Marketing versions |
| **Compliance** | DPP issuance, attestations, verifiable credentials | DPPs, attestations |

### The Hub (Product as Shared Entity)

Product is the central entity that all workspaces reference. Products include finished goods, raw materials, and components - unified under a single entity for BOM relationships and compliance tracking.

> **See Also:** [Taxonomy Engine Design](./2026-01-15-taxonomy-engine-design.md) for complete data model including categories, attributes, and materials.

```
┌─────────────────────────────────────────────────────────────────┐
│                         PRODUCT (Hub)                            │
├─────────────────────────────────────────────────────────────────┤
│  id: UUID                                                        │
│  organization_id: UUID                                           │
│  category_id: UUID             -- FK to category table           │
│  parent_id: UUID               -- For variants                   │
│  product_type: ENUM            -- FINISHED_GOOD, RAW_MATERIAL,   │
│                                -- COMPONENT, VARIANT             │
│  name: VARCHAR(255)                                              │
│  status: ENUM                  -- ACTIVE, ARCHIVED               │
│  created_at: TIMESTAMPTZ                                         │
│                                                                  │
│  -- Current versions per workspace                               │
│  current_design_version_id: UUID                                 │
│  current_marketing_version_id: UUID                              │
│  current_operations_version_id: UUID                             │
│                                                                  │
│  -- Checkout locks (per-workspace)                               │
│  design_checked_out_by: UUID                                     │
│  design_checked_out_at: TIMESTAMPTZ                              │
│  marketing_checked_out_by: UUID                                  │
│  marketing_checked_out_at: TIMESTAMPTZ                           │
└─────────────────────────────────────────────────────────────────┘
         │
         ├──────────────┬──────────────┬──────────────┬──────────────┐
         ▼              ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ identifiers  │ │   versions   │ │  bom_entries │ │    dpps      │ │  attributes  │
│ (GTIN, SKU,  │ │ (per-workspace│ │ (materials   │ │ (Compliance) │ │ (per-version)│
│  Internal)   │ │  lifecycle)  │ │  & components)│ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**Product Identity Model:**

Products evolve through lifecycle stages, each adding identifiers:

| Identifier | Stage | Purpose |
|------------|-------|---------|
| System UUID | Creation | Internal database key |
| Internal ID | R&D | Human-readable project code |
| SKU | Manufacturing | ERP/warehouse sync |
| GTIN | Commercialization | Retail barcode |
| DPP URI | Compliance | Permanent passport URL |

**Product Types:**

| Type | Description | Example |
|------|-------------|---------|
| FINISHED_GOOD | End product for sale | T-Shirt, Laptop |
| RAW_MATERIAL | Base material | Cotton, Steel |
| COMPONENT | Assembled part | Zipper, Battery |
| VARIANT | Size/color variant | T-Shirt (Large, Blue) |

---

## 3. Authentication

### Provider: Clerk

Selected for:
- Modern B2B features (organizations, roles)
- SSO/SAML support (Enterprise tier)
- OAuth support (Shopify integration)
- Reasonable pricing at B2B scale

### Authentication Flows

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOWS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WEB APPLICATION                                                │
│  ────────────────                                                │
│  1. User visits app.eurocomply.eu                               │
│  2. Clerk SDK checks session                                    │
│  3. If no session → Clerk hosted login page                     │
│  4. After auth → JWT issued, stored in httpOnly cookie          │
│  5. API requests include JWT in Authorization header            │
│                                                                  │
│  API ACCESS (Machine-to-Machine)                                │
│  ───────────────────────────────                                 │
│  1. Organization creates API key in dashboard                   │
│  2. API key stored hashed in api_keys table                     │
│  3. Requests include: Authorization: Bearer <api_key>           │
│  4. API validates key, maps to organization + permissions       │
│                                                                  │
│  SHOPIFY OAUTH                                                  │
│  ─────────────                                                   │
│  1. Merchant installs EuroComply app                            │
│  2. Shopify OAuth flow via Clerk                                │
│  3. Access token stored encrypted in integrations table         │
│  4. Background sync uses stored token                           │
│                                                                  │
│  SSO/SAML (Enterprise)                                          │
│  ─────────────────────                                           │
│  1. Organization configures IdP in Clerk dashboard              │
│  2. Users from that org redirected to their IdP                 │
│  3. SAML assertion validated by Clerk                           │
│  4. User provisioned/matched in EuroComply                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Session Management

| Aspect | Implementation |
|--------|----------------|
| Session storage | Clerk-managed (not our concern) |
| Token format | JWT with org_id, user_id, roles |
| Token lifetime | 1 hour (refresh via Clerk SDK) |
| API key lifetime | Until revoked |

### Clerk ↔ walt.id Integration

Clerk handles authentication; walt.id handles cryptographic signing.

```
┌─────────────────────────────────────────────────────────────────┐
│                CLERK + WALT.ID INTEGRATION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AUTHENTICATION (Clerk)          SIGNING (walt.id)              │
│  ─────────────────────           ──────────────────              │
│  • User login/sessions           • DID generation               │
│  • Organization management       • Key storage (Custodian)      │
│  • SSO/SAML                      • VC signing                   │
│  • JWT issuance                  • Signature verification       │
│                                                                  │
│  INTEGRATION FLOW                                               │
│  ────────────────                                                │
│  1. User logs in via Clerk → clerk_user_id assigned             │
│  2. First action requiring signature:                           │
│     └── Generate Ed25519 keypair in walt.id                     │
│     └── Derive did:key from public key                          │
│     └── Store mapping: clerk_user_id → walt_id_key_id → did     │
│  3. Subsequent signatures:                                      │
│     └── Look up walt_id_key_id from clerk_user_id               │
│     └── Sign via walt.id Custodian API                          │
│                                                                  │
│  USER TABLE                                                     │
│  ──────────                                                      │
│  id              UUID                                           │
│  clerk_user_id   VARCHAR(255)  -- From Clerk                    │
│  walt_id_key_id  VARCHAR(255)  -- Reference in walt.id          │
│  did             VARCHAR(255)  -- did:key:z6Mk...               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Multi-Tenancy

### Schema-Per-Tenant Isolation

Every organization gets its own PostgreSQL schema:

```
eurocomply database
├── public              -- Shared tables (tenants, migrations)
├── tenant_abc123       -- Organization ABC's data
├── tenant_def456       -- Organization DEF's data
└── tenant_ghi789       -- Organization GHI's data
```

### Connection Handling

**Issue identified:** PgBouncer transaction mode doesn't persist `SET search_path`.

**Solution:** Use session mode for tenant-aware connections OR set search_path per query.

```typescript
// Option A: Session-mode PgBouncer pool per tenant (recommended)
class TenantConnectionManager {
  private pools: Map<string, Pool> = new Map();

  async getConnection(organizationId: string): Promise<PoolClient> {
    const tenantConfig = await this.getTenantConfig(organizationId);

    // Get or create pool for this tenant's schema
    let pool = this.pools.get(tenantConfig.schemaName);
    if (!pool) {
      pool = new Pool({
        ...baseConfig,
        // Session mode - search_path persists
        application_name: `tenant_${tenantConfig.schemaName}`,
      });

      // Set search_path on pool connect
      pool.on('connect', (client) => {
        client.query(`SET search_path = ${tenantConfig.schemaName}, public`);
      });

      this.pools.set(tenantConfig.schemaName, pool);
    }

    return pool.connect();
  }
}

// Option B: Set search_path in every query (simpler, works with transaction mode)
const query = `
  SET search_path = tenant_${schemaName}, public;
  SELECT * FROM products WHERE id = $1;
`;
```

### Cell Architecture

Multiple tenants share a database "cell" until scale requires splitting:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CELL ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CELL 1 (db.t4g.small)                                          │
│  ├── tenant_abc123                                               │
│  ├── tenant_def456                                               │
│  └── ... (~200 tenants max)                                      │
│                                                                  │
│  CELL 2 (db.t4g.small)         ← Add when Cell 1 at capacity    │
│  ├── tenant_ghi789                                               │
│  └── ...                                                         │
│                                                                  │
│  ENTERPRISE CELL (db.t4g.medium, dedicated)                     │
│  └── tenant_enterprise_xyz     ← Single tenant, isolated        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Tenant → Cell routing stored in:
- Configuration database (separate from cells)
- Cached in Redis for performance
```

### Scaling Triggers

| Trigger | Action |
|---------|--------|
| Cell has ~200 tenants | Add new cell |
| Cell CPU >70% sustained | Add new cell OR upgrade |
| Enterprise customer signs | Provision dedicated cell |

---

## 5. Version Control

### Version States

Design and Marketing workspaces use formal versioning. Once RELEASED, a version can be referenced **forever** by Operations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VERSION STATE MACHINE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                              ┌──────────┐                                   │
│                              │ REJECTED │ ◄──── Reviewer rejects            │
│                              └────┬─────┘       (author can revise)         │
│                                   │                                          │
│                                   ▼                                          │
│  ┌───────┐    ┌────────────────┐    ┌───────────┐    ┌──────────┐          │
│  │ DRAFT │───►│ PENDING_REVIEW │───►│ IN_REVIEW │───►│ RELEASED │          │
│  └───────┘    └────────────────┘    └───────────┘    └──────────┘          │
│      │         (Contributor          (Claimed by          │                 │
│      │          submits)              reviewer)           │                 │
│      │                                                    │                 │
│      └────────────────────────────────────────────────────┘                 │
│                    (Editor/Manager direct release)                          │
│                                                                              │
│  RELEASED = Final. Can be referenced by Operations forever.                 │
│  No automatic archiving. No ACTIVE state.                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

| State | Description | Can Edit? | Can Reference? |
|-------|-------------|-----------|----------------|
| **DRAFT** | Being edited, not yet submitted | Yes | No |
| **PENDING_REVIEW** | Submitted, awaiting reviewer claim | No | No |
| **IN_REVIEW** | Claimed by a specific reviewer | No | No |
| **REJECTED** | Reviewer rejected, author can revise | Yes (new draft) | No |
| **RELEASED** | Done. Immutable. Can be referenced forever. | No | Yes |

### State Transitions

| Transition | Trigger | Who |
|------------|---------|-----|
| DRAFT → PENDING_REVIEW | Contributor submits for review | CONTRIBUTOR |
| DRAFT → RELEASED | Direct release | EDITOR/MANAGER |
| PENDING_REVIEW → IN_REVIEW | Reviewer claims | EDITOR/MANAGER |
| IN_REVIEW → RELEASED | Reviewer approves | EDITOR/MANAGER |
| IN_REVIEW → REJECTED | Reviewer rejects | EDITOR/MANAGER |
| REJECTED → DRAFT | Author revises | CONTRIBUTOR |

**No automatic state changes.** RELEASED is the terminal state for versions.

### Product-Level Archiving

Archiving happens at the **product level**, not version level:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCT ARCHIVING                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Product States:                                                │
│  • ACTIVE   - Normal product, can create batches/DPPs           │
│  • ARCHIVED - Discontinued (soft delete)                        │
│                                                                  │
│  When product is ARCHIVED:                                      │
│  • All versions remain (for audit/history)                      │
│  • Cannot create new batches referencing it                     │
│  • Cannot issue new DPPs                                        │
│  • Existing DPPs remain valid                                   │
│  • Can be restored to ACTIVE if needed                          │
│                                                                  │
│  Archiving is MANUAL - user decides to discontinue a product.   │
│  This is NOT automatic based on batch completion.               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Checkout Locks

- **Per-workspace**: Design and Marketing locks are independent
- **72-hour timeout**: Abandoned checkouts auto-release
- **Draft preserved**: Timeout releases lock but keeps draft
- **Admin override**: Can force-release if user unavailable

### Version References Example

```
┌─────────────────────────────────────────────────────────────────┐
│  Product: Organic Cotton T-Shirt (TSH-001)   Status: ACTIVE     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DESIGN VERSIONS (all RELEASED, all can be referenced)          │
│  ───────────────                                                 │
│  v3 (RELEASED) ◄── Latest version                               │
│  v2 (RELEASED) ◄── Still valid, older batches use this          │
│  v1 (RELEASED)     Original version, still referenceable        │
│                                                                  │
│  OPERATIONS REFERENCES                                          │
│  ────────────────────                                            │
│  Batch #12345 → design_version_id = v2 (locked at commit)       │
│  Batch #12346 → design_version_id = v2 (same version, months later)│
│  Batch #12350 → design_version_id = v3 (newer batches use v3)   │
│                                                                  │
│  COMPLIANCE REFERENCES                                          │
│  ────────────────────                                            │
│  DPP #001 → snapshot of Design v3 + Marketing v4                │
│                                                                  │
│  All versions remain RELEASED forever.                          │
│  Operations can use v1, v2, or v3 for any batch.                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Event System (Audit Trail)

### Architecture

Events are for **audit trail**, not source of truth. Tables are the source of truth.

```
┌─────────────────────────────────────────────────────────────────┐
│                    EVENT SYSTEM                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  APPLICATION                                                    │
│      │                                                          │
│      │ 1. Mutation (INSERT/UPDATE/DELETE)                       │
│      ▼                                                          │
│  ┌─────────────────┐                                            │
│  │   PostgreSQL    │                                            │
│  │   Transaction   │                                            │
│  │  ┌───────────┐  │                                            │
│  │  │  Table    │  │  ← Source of truth                         │
│  │  │  Change   │  │                                            │
│  │  └───────────┘  │                                            │
│  │       +         │                                            │
│  │  ┌───────────┐  │                                            │
│  │  │  Outbox   │  │  ← Event record (same transaction)         │
│  │  │  Insert   │  │                                            │
│  │  └───────────┘  │                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           │ 2. Outbox processor polls                           │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │      SQS        │  ← Async processing                        │
│  └────────┬────────┘                                            │
│           │                                                      │
│           │ 3. Consumers process events                         │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │   Consumers     │                                            │
│  │  • Webhooks     │                                            │
│  │  • Notifications│                                            │
│  │  • Sync jobs    │                                            │
│  │  • Analytics    │                                            │
│  └─────────────────┘                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Outbox Table

```sql
CREATE TABLE event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Event identity
    event_type VARCHAR(100) NOT NULL,      -- 'DesignVersionReleased'
    aggregate_type VARCHAR(50) NOT NULL,   -- 'Product', 'Batch', 'DPP'
    aggregate_id UUID NOT NULL,            -- ID of the entity

    -- Payload
    payload JSONB NOT NULL,                -- Event-specific data

    -- Metadata
    organization_id UUID NOT NULL,
    user_id UUID,                          -- Who triggered (null for system)

    -- Processing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,              -- Null until processed

    INDEX idx_outbox_unprocessed (created_at) WHERE processed_at IS NULL
);
```

### Event Types

**Design Workspace:**
- `ProductCreated`
- `DesignVersionDraftCreated`
- `DesignVersionApprovalRequested`
- `DesignVersionApproved`
- `DesignVersionReleased`
- `MaterialAdded`, `MaterialRemoved`
- `BOMUpdated`

**Operations Workspace:**
- `BatchCreated`
- `BatchCommitted`
- `BatchCompleted`
- `ItemManufactured`
- `ItemShipped`, `ItemReceived`, `ItemSold`

**Marketing Workspace:**
- `MarketingVersionDraftCreated`
- `MarketingVersionReleased`
- `ProductImageAdded`, `ProductImageRemoved`
- `ProductSyncedToShopify`

**Compliance Workspace:**
- `DPPRequested`
- `DPPIssued`
- `DPPRevoked`
- `AttestationRequested`
- `AttestationReceived`

---

## 7. Verifiable Credentials

### Signing Infrastructure

```
┌─────────────────────────────────────────────────────────────────┐
│                    VC SIGNING FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Organization first DPP issuance                             │
│     └── Generate Ed25519 keypair                                │
│     └── Derive did:key from public key                          │
│     └── Store encrypted private key (per-tenant KMS DEK)        │
│                                                                  │
│  2. DPP Issuance                                                │
│     └── Collect data: Design version + Marketing version + Ops  │
│     └── Build VC payload (W3C format)                           │
│     └── Sign with organization's Ed25519 key                    │
│     └── Assign status list index                                │
│     └── Store VC in R2                                          │
│                                                                  │
│  3. Verification (by anyone)                                    │
│     └── Fetch VC from QR code URL                               │
│     └── Extract issuer did:key                                  │
│     └── Verify Ed25519 signature                                │
│     └── Check status list (not revoked)                         │
│     └── Valid if all pass                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### DID:key

```
did:key:z6MkhaXgBZDvotDUSSM...

Components:
├── did:key:     -- Method (self-contained, no resolution needed)
├── z6Mk         -- Multicodec prefix for Ed25519 public key
└── haXgBZD...   -- Base58-encoded public key
```

**Why did:key:**
- Self-contained - public key embedded in DID
- No resolution needed - verifier extracts key from DID
- Portable - works without EuroComply servers
- Offline verification possible

### Status List 2021 (Revocation)

```sql
-- Status list credentials (one per ~130K DPPs)
CREATE TABLE status_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    list_index INT NOT NULL,              -- 0, 1, 2... for pagination
    bitstring BYTEA NOT NULL,             -- Compressed, up to 131,072 entries
    last_updated TIMESTAMPTZ NOT NULL,
    signed_credential JSONB NOT NULL,     -- The Status List VC itself

    UNIQUE(organization_id, list_index)
);

-- Track which DPPs are in which status list position
CREATE TABLE credential_status (
    credential_id UUID PRIMARY KEY,       -- DPP or Attestation ID
    credential_type VARCHAR(20) NOT NULL, -- 'dpp' or 'attestation'
    status_list_id UUID NOT NULL REFERENCES status_lists(id),
    status_list_index INT NOT NULL,       -- Position in bitstring
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revocation_reason VARCHAR(255),

    UNIQUE(status_list_id, status_list_index)
);
```

**Revocation Flow:**
1. Admin revokes DPP (product recall, fraud, etc.)
2. Set `is_revoked = true` in credential_status
3. Update bitstring in status_lists
4. Re-sign status list VC
5. Verifiers check status list URL in credential → see revoked

---

## 8. Data Storage

### Polyglot Persistence

| Store | Purpose | Data Types |
|-------|---------|------------|
| **PostgreSQL** | Relational data, transactions | Products, versions, users, organizations |
| **DynamoDB** | High-scale key-value | Items (billions), EPCIS events |
| **Cloudflare R2** | Static files, zero egress | DPP files, images, templates |
| **Redis** | Caching, sessions | Tenant routing, API rate limits |

### PostgreSQL Schema (Per-Tenant)

> **Complete Schema:** See [Taxonomy Engine Design](./2026-01-15-taxonomy-engine-design.md) for full schema including categories, attributes, materials, and BOM.

```sql
-- Core product (the hub) - includes finished goods, materials, and components
CREATE TABLE product (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    category_id UUID NOT NULL REFERENCES category(id),
    parent_id UUID REFERENCES product(id),  -- For variants
    product_type product_type NOT NULL DEFAULT 'FINISHED_GOOD',
    -- FINISHED_GOOD, RAW_MATERIAL, COMPONENT, VARIANT
    name VARCHAR(255) NOT NULL,
    status product_status NOT NULL DEFAULT 'ACTIVE',
    -- ACTIVE, ARCHIVED

    -- Current versions per workspace
    current_design_version_id UUID,
    current_marketing_version_id UUID,
    current_operations_version_id UUID,

    -- Checkout locks
    design_checked_out_by UUID REFERENCES users(id),
    design_checked_out_at TIMESTAMPTZ,
    marketing_checked_out_by UUID REFERENCES users(id),
    marketing_checked_out_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Product identifiers (multi-identifier model)
CREATE TABLE product_identifier (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    type identifier_type NOT NULL,  -- INTERNAL, SKU, GTIN, DPP_URI
    value VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(product_id, type)
);

-- Workspace versions (unified for all workspaces)
CREATE TABLE workspace_version (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES product(id),
    workspace workspace_type NOT NULL,  -- DESIGN, MARKETING, OPERATIONS, COMPLIANCE
    version_number INT NOT NULL,
    status version_status NOT NULL DEFAULT 'DRAFT',
    -- DRAFT, PENDING_REVIEW, IN_REVIEW, REJECTED, RELEASED

    -- Workflow
    created_by UUID NOT NULL REFERENCES users(id),
    published_by UUID REFERENCES users(id),
    published_at TIMESTAMPTZ,

    -- Signature (for released versions)
    signature_did VARCHAR(255),
    signature_jws TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(product_id, workspace, version_number)
);

-- Bill of Materials (links products to materials/components)
CREATE TABLE bom_entry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_product_id UUID NOT NULL REFERENCES product(id),
    child_product_id UUID NOT NULL REFERENCES product(id),
    design_version_id UUID NOT NULL REFERENCES workspace_version(id),
    quantity DECIMAL NOT NULL,
    unit VARCHAR(20) NOT NULL,  -- "kg", "pcs", "m"
    position INT DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(parent_product_id, child_product_id, design_version_id),
    CHECK(parent_product_id != child_product_id)
);

-- Product attribute values (linked to version)
CREATE TABLE product_attribute_value (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES product(id),
    template_id UUID NOT NULL REFERENCES attribute_template(id),
    version_id UUID NOT NULL REFERENCES workspace_version(id),
    value JSONB NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(product_id, template_id, version_id)
);

-- Batches (Operations)
CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id),
    design_version_id UUID NOT NULL REFERENCES design_versions(id),

    batch_number VARCHAR(50) NOT NULL,
    quantity INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PLANNED',
    -- PLANNED, COMMITTED, IN_PRODUCTION, COMPLETED, CANCELLED

    committed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(batch_number)
);

-- DPPs (Compliance)
CREATE TABLE dpps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id),

    -- Snapshot references
    design_version_id UUID NOT NULL REFERENCES design_versions(id),
    marketing_version_id UUID REFERENCES marketing_versions(id),

    -- Credential
    credential_hash VARCHAR(64) NOT NULL,
    issuer_did VARCHAR(255) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    -- ACTIVE, SUPERSEDED, REVOKED

    -- Storage
    r2_path VARCHAR(500) NOT NULL,
    qr_code_url VARCHAR(500) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(credential_hash)
);
```

### DynamoDB Schema

```
Table: eurocomply-items
─────────────────────
Partition Key: pk (String)   -- "PRODUCT#<gtin>" or "BATCH#<batch_id>"
Sort Key: sk (String)        -- "ITEM#<serial>" or "EVENT#<timestamp>"

Item Record:
{
  pk: "PRODUCT#01234567890128",
  sk: "ITEM#SN-001234",
  gtin: "01234567890128",
  serial_number: "SN-001234",
  batch_id: "batch-uuid",
  organization_id: "org-uuid",
  manufactured_at: "2026-01-15T10:00:00Z",
  current_status: "manufactured",
  ...
}

EPCIS Event Record:
{
  pk: "ITEM#SN-001234",
  sk: "EVENT#2026-01-15T10:00:00Z#manufactured",
  event_type: "manufactured",
  timestamp: "2026-01-15T10:00:00Z",
  location: "Factory A",
  ...
}

GSIs:
- GSI1: organization_id + created_at (list items by org)
- GSI2: batch_id + serial_number (batch queries)
- GSI3: current_status + organization_id (status filtering)
```

---

## 9. DPP Generation

### Deduplicated Storage

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEDUPLICATED DPP STORAGE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INSTEAD OF: 1M items × 30KB = 30GB                             │
│                                                                  │
│  WE STORE:                                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  R2: Product Template (30KB, stored ONCE)                   ││
│  │  ├── Static data (images, materials, descriptions)          ││
│  │  ├── Brand styling                                          ││
│  │  └── Shared across all items of this product                ││
│  └─────────────────────────────────────────────────────────────┘│
│                           +                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  DynamoDB: Item Records (500 bytes each)                    ││
│  │  ├── Serial number                                          ││
│  │  ├── Batch reference                                        ││
│  │  ├── Manufacturing date                                     ││
│  │  └── Lifecycle events                                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  RESULT: 30KB + (1M × 500B) = 530MB (98% savings)              │
│                                                                  │
│  ON SCAN: Cloudflare Worker merges template + item data         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Bulk Generation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    BULK DPP GENERATION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. API receives bulk request (product_id, serial_numbers[])    │
│                                                                  │
│  2. Create batch job record                                     │
│     └── Status: PENDING                                         │
│                                                                  │
│  3. Chunk into 1,000-item batches                               │
│     └── 1M items = 1,000 chunks                                 │
│                                                                  │
│  4. Send chunks to SQS                                          │
│     └── Each chunk is a message                                 │
│                                                                  │
│  5. Bulk workers process chunks (auto-scale 0-20)               │
│     For each item:                                              │
│     ├── Generate VC                                             │
│     ├── Sign with org's key                                     │
│     ├── Store item record in DynamoDB                           │
│     └── Update progress                                         │
│                                                                  │
│  6. On completion, update batch job                             │
│     └── Status: COMPLETED                                       │
│     └── Webhook notification                                    │
│                                                                  │
│  Performance: 1M DPPs in ~2 minutes (20 workers)                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Infrastructure

### AWS + Cloudflare Hybrid

```
┌─────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ALL ENVIRONMENTS (AWS European Sovereign Cloud)                │
│  ───────────────────────────────────────────────                │
│  Region: eusc-de-east-1 (Brandenburg, Germany)                  │
│  Partition: aws-eusc (isolated from global AWS)                 │
│  Console: console.aws.eu                                        │
│                                                                  │
│  • ECS Fargate: API, Workers, Bulk Workers                      │
│  • RDS PostgreSQL: Products, versions, users                    │
│  • DynamoDB: Items, events (on-demand scaling)                  │
│  • SQS: Event outbox processing, bulk generation                │
│  • ElastiCache Redis: Caching, sessions                         │
│  • KMS: Per-tenant encryption keys                              │
│                                                                  │
│  SOVEREIGNTY GUARANTEES:                                        │
│  • All data AND metadata stays within EU borders                │
│  • Operated exclusively by EU residents                         │
│  • Not subject to US CLOUD Act jurisdiction                     │
│  • BSI C5 certified (German government standard)                │
│                                                                  │
│  READ PATH (Cloudflare Global)                                  │
│  ────────────────────────────                                    │
│  • R2: DPP files, templates, images (zero egress)               │
│  • Workers: On-demand DPP rendering                             │
│  • CDN: Edge caching (<50ms global)                             │
│                                                                  │
│  EXTERNAL SERVICES                                              │
│  ─────────────────                                               │
│  • Clerk: Authentication                                        │
│  • walt.id: VC signing (optional, can self-host)                │
│                                                                  │
│  See: devops-infrastructure-design.md Section 8 for setup       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Monthly Cost Baseline

| Component | Specification | Cost (EUR) |
|-----------|---------------|------------|
| Fargate API | 2 × (0.25 vCPU, 512MB) | €17 |
| Fargate Worker | 1 × (0.25 vCPU, 512MB) | €8 |
| Fargate Outbox | 1 × (0.25 vCPU, 512MB) | €8 |
| RDS PostgreSQL | db.t4g.small, 50GB | €53 |
| ElastiCache | cache.t4g.micro | €11 |
| DynamoDB | On-demand | €1-45 |
| SQS | Standard queues | ~€0 |
| NAT Instance | t4g.nano | €3 |
| ALB | Hourly + LCU | €17 |
| KMS | Per-tenant keys | €4 |
| Cloudflare Pro | DNS, CDN, WAF | €19 |
| Cloudflare Workers | DPP serving | €5 |
| R2 | Storage | €1-18 |
| **Base Total** | | **~€158** |

---

## 11. Security

### Defense in Depth

| Layer | Implementation |
|-------|----------------|
| **Edge** | Cloudflare WAF, DDoS protection |
| **Network** | VPC, private subnets, security groups |
| **Authentication** | Clerk, JWT validation |
| **Authorization** | RBAC per workspace |
| **Tenant isolation** | Schema-per-tenant |
| **Encryption at rest** | Per-tenant KMS DEKs |
| **Encryption in transit** | TLS 1.3 everywhere |
| **Audit** | Event trail for all mutations |

### Per-Tenant Encryption

```
AWS KMS Master Key (per-cell)
         │
         ▼
    Generate DEK
    (Data Encryption Key)
         │
         ├── tenant_abc123 DEK
         ├── tenant_def456 DEK
         └── tenant_ghi789 DEK
                   │
                   ▼
           Encrypt sensitive fields:
           • Signing keys
           • API secrets
           • PII fields
```

---

## 12. Future Scale Considerations

These are known scaling challenges that don't need solving at launch but should be planned for.

### 12.1 PgBouncer Connection Limits

**Trigger:** Tens of thousands of concurrent connections across all tenants.

**Current design:** Session-mode PgBouncer pools per tenant schema (persists `SET search_path`).

**Scaling concern:** At high scale, session-mode PgBouncer holds connections longer than transaction-mode, limiting total throughput.

**Future solution:**
- Hybrid approach: Transaction-mode for read-heavy workloads, Session-mode for writes
- Per-cell connection limits with automatic tenant redistribution
- Consider PgCat or Supavisor as PgBouncer alternatives at scale

**Monitoring trigger:** Alert when any cell exceeds 5,000 active connections.

### 12.2 Cross-Tenant Analytics (Data Warehouse)

**Trigger:** Need for platform-wide metrics (total DPPs issued, industry benchmarks, compliance trends).

**Current design:** Schema-per-tenant isolation prevents cross-tenant queries by design.

**Future solution:**
Stream anonymized/aggregated data from Outbox to central data warehouse:

```
┌─────────────────────────────────────────────────────────────────┐
│  Outbox Events (per tenant)                                     │
│        ↓                                                        │
│  Kinesis Firehose (batched, 1-minute intervals)                │
│        ↓                                                        │
│  AWS Redshift / Snowflake (central analytics)                  │
│        ↓                                                        │
│  Internal dashboards (no tenant PII, aggregates only)          │
└─────────────────────────────────────────────────────────────────┘
```

**Data to stream:**
- DPP issuance counts (no product details)
- Recall frequency by industry
- Platform usage patterns
- Billing/revenue metrics

**Privacy:** No PII, no product names, no supplier details. Aggregates and counts only.

---

## 13. Open Questions

Resolved in this session:
- [x] Authentication provider → Clerk
- [x] Event architecture → PostgreSQL outbox (not Kafka)
- [x] Version states → Simplified (DRAFT → PENDING_REVIEW → IN_REVIEW → RELEASED). No ACTIVE/ARCHIVED on versions.
- [x] Product archiving → Manual, at product level (not version level)
- [x] Status List → Include in design
- [x] Hub model → Product as shared entity, explicit versions
- [x] Clerk ↔ walt.id integration → Clerk for auth, walt.id for signing, linked via user ID
- [x] RBAC model → 4 authorities (VIEWER, CONTRIBUTOR, EDITOR, MANAGER) per workspace

Still to resolve (in subsequent doc reviews):
- [ ] EPCIS event schema (what events, what format?)
- [ ] Attestation flow details
- [ ] Shopify sync specifics
- [ ] AI import implementation

---

## 14. Related Documents

| Document | Status | Purpose |
|----------|--------|---------|
| USER_MANAGEMENT.md | Reviewed | RBAC, permissions, checkout flow |
| BUSINESS_MODEL.md | To review | Pricing, tiers, unit economics |
| BILLING.md | To review | Stripe integration, invoicing |
| VERIFIABLE_CREDENTIALS.md | To review | VC format, signing details |
| DATA_SOVEREIGNTY.md | To review | Export, portability |
| EPCIS_EVENTS.md | To review | Event schema |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.4 | 2026-01-16 | Added Section 12: Future Scale Considerations (PgBouncer limits, Cross-Tenant Analytics) |
| 0.3 | 2026-01-15 | Simplified version states (no ACTIVE/ARCHIVED), added product-level archiving |
| 0.2 | 2026-01-15 | Updated version states to full state machine, added Clerk ↔ walt.id integration |
| 0.1 | 2026-01-15 | Initial draft from Architecture Doc review |
