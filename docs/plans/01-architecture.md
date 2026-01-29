# Architecture Design

**Status:** Active
**Last Updated:** 2026-01-28

---

## 1. Overview

EuroComply is a unified Product Lifecycle & Compliance Platform combining PLM, ERP-lite, PIM, and Digital Product Passport (DPP) capabilities.

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
+-------------------------------------------------------------------------+
|                              EUROCOMPLY                                   |
+-------------------------------------------------------------------------+
|                                                                           |
|  +-------------+  +-------------+  +-------------+  +-------------+      |
|  |   Design    |  | Operations  |  |  Marketing  |  | Compliance  |      |
|  |  Workspace  |  |  Workspace  |  |  Workspace  |  |  Workspace  |      |
|  +------+------+  +------+------+  +------+------+  +------+------+      |
|         |                |                |                |              |
|  ═══════╪════════════════╪════════════════╪════════════════╪════════════ |
|  ║      |                |                |                |            ║ |
|  ║  +---+----------------+----------------+----------------+---+        ║ |
|  ║  |              COMPLIANCE EVALUATION LAYER                |        ║ |
|  ║  |   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   |        ║ |
|  ║  |   │Regulations & │ │Compliance    │ │PreFlight     │   |        ║ |
|  ║  |   │Requirements  │ │Stack Resolver│ │Evaluation    │   |        ║ |
|  ║  |   └──────────────┘ └──────────────┘ └──────────────┘   |        ║ |
|  ║  +---+----------------+----------------+----------------+---+        ║ |
|  ║      |                |                |                |            ║ |
|  ═══════╪════════════════╪════════════════╪════════════════╪════════════ |
|         |                |                |                |              |
|         +----------------+----------------+----------------+              |
|                                  |                                        |
|                                  v                                        |
|                          +---------------+                                |
|                          |   THE HUB     |                                |
|                          |   (Product)   |                                |
|                          +-------+-------+                                |
|                                  |                                        |
|         +------------------------+------------------------+              |
|         v                        v                        v              |
|  +-------------+         +-------------+         +-------------+         |
|  | PostgreSQL  |         |  DynamoDB   |         | Cloudflare  |         |
|  | (Products,  |         |   (Items,   |         |  R2 + CDN   |         |
|  |  Versions)  |         |   Events)   |         |   (DPPs)    |         |
|  +-------------+         +-------------+         +-------------+         |
|                                                                           |
+-------------------------------------------------------------------------+
```

### Four Workspaces

| Workspace | Purpose | Data Ownership |
|-----------|---------|----------------|
| **Design** | Product registry, materials, BOMs, technical specs | Design versions |
| **Operations** | Item tracking, batches, EPCIS events, inventory | Batch records, items |
| **Marketing** | Product content, images, variants, syndication | Marketing versions |
| **Compliance** | DPP issuance, attestations, verifiable credentials | DPPs, attestations |

### Compliance Evaluation (Cross-Cutting Layer)

The **Compliance Evaluation Layer** is an **optional** cross-cutting layer that provides compliance guidance across all workspaces. Organizations can enable, disable, or run in silent mode based on their needs.

| Component | Purpose | Integration Points |
|-----------|---------|-------------------|
| **Regulation** | Versioned regulatory lists (COSING, RoHS, REACH SVHC) | Category mapping, Requirements |
| **Requirement** | Substance restrictions per regulation | PreFlight evaluation |
| **CategoryRegulation** | LTREE-based category-to-regulation mapping | Product classification |
| **ComplianceStackResolver** | Resolves applicable requirements for a product | PreFlight Service |
| **RequirementHandler** | Plugin system for evaluating specific requirement types | SubstanceScreenHandler, etc. |
| **PreFlight Service** | Real-time compliance evaluation | Design save, Batch release, DPP provisioning |
| **ComplianceEvidence** | Audit trail of evaluation results | DPP snapshots |

**Feature Toggles (per Organization):**

| Setting | Default | Description |
|---------|---------|-------------|
| `regulatoryAdvisorEnabled` | `true` | Master toggle - hides entire feature when false |
| `enforcementMode` | `SILENT` | `ENFORCING` = blockers enforced; `SILENT` = advisory only |
| `captureComplianceInSilentMode` | `true` | Capture compliance data in DPPs even in silent mode |

> **Full Design:** See [Compliance Evaluation System](../guides/compliance-evaluation-system.md) and [Compliance Architecture](../architecture/compliance-architecture.md) for complete specification.

### The Hub (Product as Shared Entity)

Product is the central entity that all workspaces reference. Products include finished goods, raw materials, and components.

**Product Identity Model:**

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

## 3. Technology Stack

### Core Technologies

| Layer | Technology | Purpose |
|-------|------------|---------|
| **API** | Hono (Node.js) | REST API framework |
| **ORM** | MikroORM | Database access with schema-per-tenant |
| **Database** | PostgreSQL | Relational data, transactions |
| **Item Store** | DynamoDB | High-scale key-value (items, events) |
| **File Storage** | Cloudflare R2 | DPP files, images, zero egress |
| **CDN** | Cloudflare | Edge caching, DDoS protection |
| **Auth** | Clerk | Authentication, SSO, Organizations |
| **Signing** | walt.id | DID/VC signing |

### MikroORM Configuration

```typescript
// packages/db/src/mikro-orm.config.ts
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';

export default defineConfig({
  driver: PostgreSqlDriver,
  dbName: 'eurocomply',
  schema: 'public', // Default for shared tables
  entities: ['./dist/entities/**/*.js'],
  entitiesTs: ['./src/entities/**/*.ts'],
  migrations: {
    path: './migrations',
    glob: '!(*.d).{js,ts}',
  },
});
```

---

## 4. Multi-Tenancy

### Schema-Per-Tenant Isolation

Every organization gets its own PostgreSQL schema:

```
eurocomply database
├── public              -- Shared tables (organizations only)
├── tenant_abc123       -- Organization ABC's data
├── tenant_def456       -- Organization DEF's data
└── tenant_ghi789       -- Organization GHI's data
```

### Schema Split

**Public Schema (shared reference data):**

```sql
-- Tenant Registry
public.organizations              -- Tenant registry, billing tier, schema name

-- Regulation Documents (see compliance-architecture.md)
public.regulation_documents       -- Official regulation PDFs
public.regulation_anchors         -- Highlighted text coordinates
public.marketplace_listings       -- Published templates (profiles, rules)

-- Taxonomy Foundation (see Taxonomy Plans 1-4, 9-12)
public.seed_version               -- Reference data version tracking
public.unit_definition            -- UNECE Rec 20 units
public.product_classification     -- HS/CN/TARIC codes
public.substance                  -- ECHA substance registry
public.substance_alias            -- Substance alternative names
public.raw_material               -- EU RMIS raw materials (CRM compliance)

-- Regulations (see Taxonomy Plans 10-12)
public.regulation                 -- Versioned regulations (COSING, RoHS, REACH SVHC)
public.requirement                -- Substance restrictions per regulation
public.category_regulation        -- LTREE-based category-to-regulation mapping
public.regulatory_import_log      -- Admin import audit trail
```

**Tenant Schema (all organization data):**

```sql
tenant_{slug}.users                  -- Local user profiles
tenant_{slug}.organization_users     -- Membership + workspace authorities
tenant_{slug}.products               -- Product hub entity
tenant_{slug}.product_identifiers    -- GTIN, SKU, Internal IDs
tenant_{slug}.product_versions       -- Per-workspace versioning
tenant_{slug}.bom_entries            -- Bill of materials
tenant_{slug}.dpp_snapshots          -- Compliance snapshots
tenant_{slug}.operations_events      -- Forensic ledger
tenant_{slug}.outbox_events          -- Transactional outbox
tenant_{slug}.audit_log              -- All mutations logged
tenant_{slug}.status_lists           -- Revocation registry
tenant_{slug}.tenant_requirement_exemption -- Per-tenant requirement exemptions
tenant_{slug}.compliance_evidence    -- Evaluation results for audit trail
```

### Tenant Context via JWT (Zero DB Lookups)

**Critical optimization:** Store tenant metadata in Clerk JWT custom claims to avoid database hits on every request.

**Clerk JWT Custom Claims (via Actions):**

```json
{
  "sub": "user_123",
  "urn:clerk:iam:org:id": "org_456",
  "urn:eurocomply:schema_name": "tenant_org_456",
  "urn:eurocomply:tier": "starter",
  "urn:eurocomply:cell_id": "cell_1"
}
```

**Tenant Middleware (reads from JWT, no DB lookup):**

```typescript
// apps/api/src/middleware/tenant.middleware.ts
import { MikroORM } from '@mikro-orm/postgresql';

export function tenantMiddleware(orm: MikroORM) {
  return async (c: Context, next: Next) => {
    // Read schema directly from JWT custom claims - NO database lookup
    const claims = c.get('jwtPayload');
    const schemaName = claims['urn:eurocomply:schema_name'];

    if (!schemaName) {
      throw new HTTPException(400, { message: 'Organization not configured' });
    }

    // Fork EntityManager with tenant schema
    const tenantEm = orm.em.fork({ schema: schemaName });
    c.set('em', tenantEm);
    c.set('schemaName', schemaName);
    c.set('tier', claims['urn:eurocomply:tier']);

    await next();

    // Cleanup
    tenantEm.clear();
  };
}
```

**When to update JWT metadata:**

| Event | Action |
|-------|--------|
| Organization created | Set custom claims via Clerk Actions |
| Tier upgraded/downgraded | Update `urn:eurocomply:tier` in Clerk Actions |
| Tenant migrated to new cell | Update `urn:eurocomply:cell_id` in Clerk Actions |

**Fallback for edge cases:**

```typescript
// Only hit DB if JWT metadata missing (legacy orgs, first login after migration)
if (!schemaName) {
  const org = await orm.em.findOne(Organization, { id: organizationId });
  if (!org) throw new HTTPException(404, { message: 'Organization not found' });
  schemaName = org.schemaName;

  // Update Clerk Actions metadata asynchronously (self-healing)
  updateClerkOrgMetadata(organizationId, { schema_name: org.schemaName });
}
```

### Cell Architecture

Multiple tenants share a database "cell" until scale requires splitting:

```
CELL 1 (db.t4g.small)
├── tenant_abc123
├── tenant_def456
└── ... (~200 tenants max)

CELL 2 (db.t4g.small)         <- Add when Cell 1 at capacity
├── tenant_ghi789
└── ...

ENTERPRISE CELL (db.t4g.medium, dedicated)
└── tenant_enterprise_xyz     <- Single tenant, isolated
```

| Trigger | Action |
|---------|--------|
| Cell has ~200 tenants | Add new cell |
| Cell CPU >70% sustained | Add new cell OR upgrade |
| Enterprise customer signs | Provision dedicated cell |

### Schema Migration Strategy

**Problem:** With 200 tenants per cell, running migrations sequentially takes too long (200 schemas × 1s = 3+ minutes downtime).

**Solution: Parallel Rolling Migrations**

```typescript
// scripts/migrate-schemas.ts
import { MikroORM } from '@mikro-orm/postgresql';
import pLimit from 'p-limit';

const CONCURRENCY = 10; // Max parallel migrations
const limit = pLimit(CONCURRENCY);

async function migrateCell(orm: MikroORM, cellId: string) {
  // 1. Get all tenant schemas in this cell
  const tenants = await orm.em.find(Organization, { cellId });

  // 2. Acquire migration lock (prevent API startup during migration)
  await acquireMigrationLock(cellId);

  try {
    // 3. Run migrations in parallel with concurrency limit
    const migrations = tenants.map(tenant =>
      limit(async () => {
        console.log(`Migrating ${tenant.schemaName}...`);
        const migrator = orm.getMigrator();
        await migrator.up({ schema: tenant.schemaName });
        console.log(`Completed ${tenant.schemaName}`);
      })
    );

    await Promise.all(migrations);
  } finally {
    // 4. Release migration lock
    await releaseMigrationLock(cellId);
  }
}

// Migration lock prevents API from starting mid-migration
async function acquireMigrationLock(cellId: string) {
  await redis.set(`migration_lock:${cellId}`, Date.now(), 'EX', 600);
}

async function releaseMigrationLock(cellId: string) {
  await redis.del(`migration_lock:${cellId}`);
}
```

**API Startup Check:**

```typescript
// apps/api/src/index.ts
async function startServer() {
  const cellId = process.env.CELL_ID;

  // Wait for migration lock to clear
  while (await redis.exists(`migration_lock:${cellId}`)) {
    console.log('Waiting for migrations to complete...');
    await sleep(5000);
  }

  // Start accepting traffic
  app.listen(3000);
}
```

**Performance with parallel migrations:**
- Sequential: 200 schemas × 1s = 200s (~3.3 min)
- Parallel (10x): 200 schemas / 10 = 20 batches × 1s = 20s

**Zero-downtime option (for complex migrations):**

```
1. Deploy new API version with migration code (but don't run yet)
2. Run migrations in background (API continues on old schema)
3. Enable feature flag to use new columns/tables
4. Remove old columns in next deployment cycle
```

---

## 5. Authentication

### Provider: Clerk Cloud (EU)

Selected for:
- Swiss-based company, EU data hosting (GDPR compliant)
- Built-in organizations with per-org SSO
- Modern B2B features (organizations, roles, Actions)
- SSO/SAML support included
- OAuth support (Shopify integration)
- Open source core, transparent security

### Authentication Flow

```
USER LOGIN
1. User visits app.eurocomply.eu
2. Clerk handles login (password, passkeys, or SSO)
3. Clerk issues JWT with custom claims (via Actions)
4. EuroComply API validates token via Clerk JWKS
5. Middleware reads schema_name from JWT custom claims (no DB lookup)
6. API checks workspace authorities from session

SESSION MANAGEMENT
- Clerk manages session tokens
- HttpOnly, Secure cookies
- Automatic refresh
- Session revocation via Clerk Console

SSO (Enterprise)
- SAML 2.0: Okta, Azure AD, OneLogin
- OIDC: Google Workspace, Azure AD, Auth0
- Configured per organization in Clerk
```

### Clerk Custom Claims (via Actions)

```typescript
// Clerk Action: Inject custom claims at token issuance
function setClaims(ctx, api) {
  // Claims are set based on organization metadata
  api.claims.setClaim('urn:eurocomply:schema_name', `tenant_${ctx.v1.user.orgId}`);
  api.claims.setClaim('urn:eurocomply:tier', ctx.v1.org.metadata.tier || 'starter');
  api.claims.setClaim('urn:eurocomply:cell_id', ctx.v1.org.metadata.cell_id || 'cell_1');
}
```

### Clerk + walt.id Integration

```
AUTHENTICATION (Clerk)        SIGNING (walt.id)
- User login/sessions           - DID generation
- Organization management       - Key storage (Custodian)
- SSO/SAML                      - VC signing
- JWT issuance                  - Signature verification

INTEGRATION FLOW
1. User logs in via Clerk -> clerk_user_id assigned
2. First action requiring signature:
   - Generate Ed25519 keypair in walt.id
   - Derive did:key from public key
   - Store mapping: clerk_user_id -> walt_id_key_id -> did
3. Subsequent signatures:
   - Look up walt_id_key_id from clerk_user_id
   - Sign via walt.id Custodian API
```

---

## 5.1 Organization Lifecycle

### Creation (Clerk-Only)

Organizations are created **exclusively** through Clerk Actions v2 webhooks:

1. User creates organization in Clerk (via frontend UI)
2. Clerk sends `org.created` webhook
3. Backend creates Organization record + provisions tenant schema
4. Status updated to READY

**There is no public API endpoint to create organizations.** This ensures:
- Single source of truth (Clerk)
- Consistent provisioning flow
- No orphaned organizations

### Deletion (Clerk-Only)

Organizations are deleted **exclusively** through Clerk Actions v2 webhooks:

1. Admin deletes organization in Clerk
2. Clerk sends `org.removed` webhook
3. Backend creates audit event, drops tenant schema, deletes Organization record
4. All tenant data is permanently removed

**Warning:** This is a destructive operation. All tenant data is permanently deleted.

### Admin Operations

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/organizations` | List organizations (read-only) |
| `GET /api/v1/organizations/:id` | Get organization details |
| `GET /api/v1/admin/organizations/:id/status` | Check provisioning status |
| `POST /api/v1/admin/organizations/:id/provision` | Trigger/retry provisioning |

---

## 6. Version Control

### Version States

Design and Marketing workspaces use formal versioning. Once RELEASED, a version can be referenced **forever** by Operations.

```
                              +----------+
                              | REJECTED | <---- Reviewer rejects
                              +----+-----+       (author can revise)
                                   |
                                   v
  +-------+    +----------------+    +-----------+    +----------+
  | DRAFT |--->| PENDING_REVIEW |--->| IN_REVIEW |--->| RELEASED |
  +-------+    +----------------+    +-----------+    +----------+
      |         (Contributor          (Claimed by          |
      |          submits)              reviewer)           |
      |                                                    |
      +----------------------------------------------------+
                    (Editor/Manager direct release)

  RELEASED = Final. Can be referenced by Operations forever.
```

| State | Description | Can Edit? | Can Reference? |
|-------|-------------|-----------|----------------|
| **DRAFT** | Being edited, not yet submitted | Yes | No |
| **PENDING_REVIEW** | Submitted, awaiting reviewer claim | No | No |
| **IN_REVIEW** | Claimed by a specific reviewer | No | No |
| **REJECTED** | Reviewer rejected, author can revise | Yes (new draft) | No |
| **RELEASED** | Done. Immutable. Can be referenced forever. | No | Yes |

### Product-Level Archiving

Archiving happens at the **product level**, not version level:

```
Product States:
- ACTIVE   - Normal product, can create batches/DPPs
- ARCHIVED - Discontinued (soft delete)

When product is ARCHIVED:
- All versions remain (for audit/history)
- Cannot create new batches referencing it
- Cannot issue new DPPs
- Existing DPPs remain valid
- Can be restored to ACTIVE if needed
```

### Checkout Locks

- **Per-workspace**: Design and Marketing locks are independent
- **72-hour timeout**: Abandoned checkouts auto-release
- **Draft preserved**: Timeout releases lock but keeps draft
- **Admin override**: Can force-release if user unavailable

---

## 7. Event System

EuroComply uses the **transactional outbox pattern** for reliable event-driven processing. Events are written atomically with domain changes, then processed asynchronously by dedicated workers.

### Architecture

Events are for **audit trail**, not source of truth. Tables are the source of truth.

```
APPLICATION
    |
    | 1. Mutation (INSERT/UPDATE/DELETE)
    v
+---------------------+
|   PostgreSQL        |
|   Transaction       |
|  +---------------+  |
|  |  Table        |  |  <- Source of truth
|  |  Change       |  |
|  +---------------+  |
|       +             |
|  +---------------+  |
|  |  Outbox       |  |  <- Event record (same transaction)
|  |  Insert       |  |
|  +---------------+  |
+---------+-----------+
          |
          | 2. Outbox workers poll
          v
+---------------------+
|      SQS            |  <- Async processing
+---------+-----------+
          |
          | 3. Consumers process events
          v
+---------------------+
|   Consumers         |
|  - Webhooks         |
|  - Notifications    |
|  - Sync jobs        |
|  - Analytics        |
+---------------------+
```

### 7.1 Dual-Schema Outbox Pattern

Events are stored in two locations based on their context:

| Schema | Purpose | Events |
|--------|---------|--------|
| **Public** | System-level events that occur outside tenant context | `organization.provisioned`, `organization.deleted`, `organization.provisioning_retried`, `clerk.metadata_sync_requested` |
| **Tenant** | Domain events within a tenant transaction | `user.joined_organization`, `user.left_organization`, `user.profile_sync_requested`, plus all future domain events (products, batches, DPPs) |

**Why two schemas?**
- Organization provisioning happens *before* a tenant schema exists
- System events need cross-tenant visibility for operational monitoring
- Domain events benefit from tenant isolation (one tenant's backlog doesn't affect others)
- Transactional safety: domain events commit atomically with the data they describe

### 7.2 Outbox Workers

Two worker types process events from each schema:

```
┌──────────────────────────────────────────────────────────────┐
│                      Outbox Processing                        │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────┐      ┌─────────────────────────┐    │
│  │    System Worker    │      │    Tenant Worker(s)     │    │
│  │    (single instance)│      │    (scalable pool)      │    │
│  └──────────┬──────────┘      └───────────┬─────────────┘    │
│             │                             │                   │
│             ▼                             ▼                   │
│    public.outbox_event           tenant_*.outbox_event       │
│                                                               │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
                          SQS
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
         Webhooks    Notifications   Analytics
```

**System Worker** (single instance):
- Polls `public.outbox_event` for pending events
- Handles organization lifecycle and external integrations
- Critical path for onboarding - kept separate to avoid tenant queue delays

**Tenant Worker** (horizontally scalable):
- Iterates through active tenant schemas
- Round-robin polling with configurable batch size
- Scale instances as tenant count grows

**Processing guarantees:**
- At-least-once delivery (consumers must be idempotent)
- Exponential backoff on failure (max 5 retries)
- Dead-letter queue for failed events after max retries

### 7.3 Event Types

**Public Schema Events** (system-level):

| Event Type | Aggregate | Description |
|------------|-----------|-------------|
| `organization.provisioned` | Organization | Tenant schema created and ready |
| `organization.deleted` | Organization | Tenant schema dropped |
| `organization.provisioning_retried` | Organization | Manual retry of failed provisioning |
| `clerk.metadata_sync_requested` | Organization | Sync schema metadata back to Clerk |

**Tenant Schema Events** (domain-level):

| Event Type | Aggregate | Description |
|------------|-----------|-------------|
| `user.joined_organization` | User | User added to organization |
| `user.left_organization` | User | User removed from organization |
| `user.profile_sync_requested` | User | Profile update needs syncing |
| `product.created` | Product | New product registered |
| `product.updated` | Product | Product metadata changed |
| `product.archived` | Product | Product soft-deleted |
| `dpp.issued` | DigitalProductPassport | DPP credential generated |
| `dpp.revoked` | DigitalProductPassport | DPP credential invalidated |
| `batch.committed` | Batch | Batch finalized for production |
| `attestation.requested` | Attestation | Compliance attestation initiated |

*Note: Domain events (product, dpp, batch, attestation) are designed but not yet implemented.*

---

## 8. Compliance Evaluation Layer

The Compliance Evaluation Layer provides compliance guidance across all workspaces, transforming EuroComply from a pure data management platform into an intelligent compliance advisor.

> **Governance:** The **Compliance Workspace** is the sole control center for compliance governance. Compliance MANAGER manages requirement exemptions, assigns regulations to product categories, and configures compliance evaluation settings. Design and Operations workspaces have read-only compliance views.

> **Full Design:** See [Compliance Evaluation System](../guides/compliance-evaluation-system.md) and [Compliance Architecture](../architecture/compliance-architecture.md) for complete specification.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REGULATION LAYER ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PUBLIC SCHEMA (Platform-Managed)                                           │
│  ═══════════════════════════════                                             │
│                                                                              │
│  Legal References:                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Regulation       │  │ Regulation       │  │ Marketplace      │          │
│  │ Documents        │──│ Anchors          │  │ Listings         │          │
│  │ (PDFs, versions) │  │ (highlighted     │  │ (published       │          │
│  │                  │  │  text coords)    │  │  templates)      │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                              │
│  Substance Compliance (Data-Driven):                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Regulation       │  │ Requirement      │  │ CategoryRegula-  │          │
│  │ (versioned regs  │──│ (substance       │  │ tion             │          │
│  │  COSING, RoHS,   │  │  restrictions)   │  │ (LTREE path      │          │
│  │  REACH SVHC)     │  │                  │  │  mapping)        │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│           │                     │                     │                     │
│           └─────────────────────┴─────────────────────┘                     │
│                                 │                                           │
│             ┌───────────────────┴────────────────────┐                      │
│             │  Cross-references via IDs + LTREE @>   │                      │
│             └───────────────────┬────────────────────┘                      │
│                                 │                                           │
│  TENANT SCHEMA (Organization-Specific)                                      │
│  ═════════════════════════════════════                                       │
│  ┌──────────────────┐  ┌──────────────────┐                                 │
│  │ TenantRequire-   │  │ Compliance       │                                 │
│  │ mentExemption    │  │ Evidence         │                                 │
│  │ (per-tenant      │  │ (evaluation      │                                 │
│  │  exemptions)     │  │  audit trail)    │                                 │
│  └──────────────────┘  └──────────────────┘                                 │
│           │                     │                                            │
│           ▼                     ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                  COMPLIANCE STACK RESOLVER                            │  │
│  │  • Resolves applicable regulations for a product based on category   │  │
│  │  • Walks CategoryRegulation LTREE to find inherited regulations      │  │
│  │  • Applies TenantRequirementExemption overrides                      │  │
│  │  • Returns full compliance stack: regulations → requirements         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│           │                                                                  │
│           ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      PREFLIGHT SERVICE                                │  │
│  │  • Evaluates products/batches against applicable requirements        │  │
│  │  • Returns findings with severity (BLOCKER/WARNING/INFO)             │  │
│  │  • Links findings to regulation anchors (PDF highlights)             │  │
│  │  • Cross-references substances against Requirement                   │  │
│  │  • Uses ComplianceStackResolver to determine applicable requirements │  │
│  │  • Uses RequirementHandler plugins for type-specific evaluation      │  │
│  │  • Records ComplianceEvidence for audit trail                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

> **Data-Driven Substance Compliance:** See [Taxonomy Plans 10-12](./2026-01-26-taxonomy-10-regulatory-list-registry.md) for Regulation/Requirement entities and [compliance-evaluation-system.md](../guides/compliance-evaluation-system.md) for the `RequirementHandler` plugin system (including `SubstanceScreenHandler` for substance validation).

### Integration Points

| Workspace | Integration | Trigger |
|-----------|-------------|---------|
| **Design** | Attribute validation against requirements | Design version save |
| **Design** | Compliance check on version release | Release action |
| **Operations** | Batch compliance check | Batch creation |
| **Compliance** | PreFlight before DPP provisioning | BATCH_RELEASED event |
| **Compliance** | ComplianceEvidence in DPP audit trail | DPP issuance |

### Event Types

**Compliance Evaluation Events:**
- `PreFlightEvaluated` (productId, findings, evidence)
- `ComplianceEvidenceCreated` (productId, regulationId, result)
- `RequirementExemptionCreated`, `RequirementExemptionRevoked`

---

## 9. Verifiable Credentials

### Signing Flow

```
1. Organization first DPP issuance
   - Generate Ed25519 keypair
   - Derive did:key from public key
   - Store encrypted private key (per-tenant KMS DEK)

2. DPP Issuance
   - Collect data: Design version + Marketing version + Ops
   - Build VC payload (W3C format)
   - Sign with organization's Ed25519 key
   - Assign status list index
   - Store VC in R2

3. Verification (by anyone)
   - Fetch VC from QR code URL
   - Extract issuer did:key
   - Verify Ed25519 signature
   - Check status list (not revoked)
   - Valid if all pass
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

```typescript
@Entity({ tableName: 'status_lists' })
export class StatusList {
  @PrimaryKey()
  id!: string;

  @Property()
  purpose!: string;

  @Property({ name: 'encoded_list', type: 'text' })
  encodedList!: string;       // Compressed bitstring

  @Property({ name: 'current_index', default: 0 })
  currentIndex!: number;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}

@Entity({ tableName: 'status_list_entries' })
export class StatusListEntry {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => StatusList, { name: 'status_list_id' })
  statusList!: StatusList;

  @Property({ name: 'credential_id' })
  credentialId!: string;

  @Property()
  index!: number;

  @Property({ default: false })
  revoked!: boolean;

  @Property({ name: 'revoked_at', nullable: true })
  revokedAt?: Date;
}
```

---

## 10. Data Storage

### Polyglot Persistence

| Store | Purpose | Data Types |
|-------|---------|------------|
| **PostgreSQL** | Relational data, transactions | Products, versions, users, organizations |
| **DynamoDB** | High-scale key-value | Items (billions), EPCIS events |
| **Cloudflare R2** | Static files, zero egress | DPP files, images, templates |
| **Redis** | Caching, sessions | Migration locks, API rate limits |

### PostgreSQL Database Access (Three-User Model)

| User | Auth Method | Privileges | Purpose |
|------|-------------|------------|---------|
| `eurocomply` | Password | Admin | Infrastructure deployment (Lambda) |
| `eurocomply_app` | IAM Token | DML (read/write) | Application runtime (ECS) |
| `eurocomply_migrate` | Password | DDL + DML | MikroORM migrations (CI/CD) |

### DynamoDB Schema

```
Table: eurocomply-items

Partition Key: pk (String)   -- "PRODUCT#<gtin>" or "BATCH#<batch_id>"
Sort Key: sk (String)        -- "ITEM#<serial>" or "EVENT#<timestamp>"

Item Record:
{
  pk: "PRODUCT#01234567890128",
  sk: "ITEM#SN-001234",
  gtin: "01234567890128",
  serial_number: "SN-001234",
  batch_id: "batch-uuid",
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
- GSI1: batch_id + serial_number (batch queries)
- GSI2: current_status (status filtering)
```

---

## 11. DPP Generation

### Deduplicated Storage

```
INSTEAD OF: 1M items x 30KB = 30GB

WE STORE:
  R2: Product Template (30KB, stored ONCE)
  ├── Static data (images, materials, descriptions)
  ├── Brand styling
  └── Shared across all items of this product
                    +
  DynamoDB: Item Records (500 bytes each)
  ├── Serial number
  ├── Batch reference
  ├── Manufacturing date
  └── Lifecycle events

RESULT: 30KB + (1M x 500B) = 530MB (98% savings)

ON SCAN: Cloudflare Worker merges template + item data
```

### Bulk Generation Flow

```
1. API receives bulk request (product_id, serial_numbers[])

2. Create batch job record
   - Status: PENDING

3. Chunk into 1,000-item batches
   - 1M items = 1,000 chunks

4. Send chunks to SQS
   - Each chunk is a message

5. Bulk workers process chunks (auto-scale 0-20)
   For each item:
   ├── Generate VC
   ├── Sign with org's key
   ├── Store item record in DynamoDB
   └── Update progress

6. On completion, update batch job
   - Status: COMPLETED
   - Webhook notification

Performance: 1M DPPs in ~2 minutes (20 workers)
```

---

## 12. Infrastructure

### AWS + Cloudflare Hybrid

```
ALL ENVIRONMENTS (AWS European Sovereign Cloud)
Region: eusc-de-east-1 (Brandenburg, Germany)
Partition: aws-eusc (isolated from global AWS)

  - ECS Fargate: API, Workers, Bulk Workers
  - RDS PostgreSQL: Products, versions, users
  - DynamoDB: Items, events (on-demand scaling)
  - SQS: Event outbox processing, bulk generation
  - ElastiCache Redis: Caching, migration locks
  - KMS: Per-tenant encryption keys

SOVEREIGNTY GUARANTEES:
  - All data AND metadata stays within EU borders
  - Operated exclusively by EU residents
  - Not subject to US CLOUD Act jurisdiction
  - BSI C5 certified

READ PATH (Cloudflare Global)
  - R2: DPP files, templates, images (zero egress)
  - Workers: On-demand DPP rendering
  - CDN: Edge caching (<50ms global)

EXTERNAL SERVICES
  - Clerk: Authentication (EU region)
  - walt.id: VC signing
```

### Monthly Cost Baseline

| Component | Specification | Cost (EUR) |
|-----------|---------------|------------|
| Fargate API | 2 x (0.25 vCPU, 512MB) | 17 |
| Fargate Worker | 1 x (0.25 vCPU, 512MB) | 8 |
| RDS PostgreSQL | db.t4g.small, 50GB | 53 |
| ElastiCache | cache.t4g.micro | 11 |
| DynamoDB | On-demand | 1-45 |
| NAT Instance | t4g.nano | 3 |
| ALB | Hourly + LCU | 17 |
| KMS | Per-tenant keys | 4 |
| Cloudflare Pro | DNS, CDN, WAF | 19 |
| Cloudflare Workers | DPP serving | 5 |
| R2 | Storage | 1-18 |
| **Base Total** | | **~158** |

---

## 13. Security

### Defense in Depth

| Layer | Implementation |
|-------|----------------|
| **Edge** | Cloudflare WAF, DDoS protection |
| **Network** | VPC, private subnets, security groups |
| **Authentication** | Clerk, JWT validation |
| **Authorization** | RBAC per workspace |
| **Tenant isolation** | Schema-per-tenant (PostgreSQL) |
| **Encryption at rest** | Per-tenant KMS DEKs |
| **Encryption in transit** | TLS 1.3 everywhere |
| **Audit** | Event trail for all mutations |

### Per-Tenant Encryption

```
AWS KMS Master Key (per-cell)
         |
         v
    Generate DEK
    (Data Encryption Key)
         |
         ├── tenant_abc123 DEK
         ├── tenant_def456 DEK
         └── tenant_ghi789 DEK
                   |
                   v
           Encrypt sensitive fields:
           - Signing keys
           - API secrets
           - PII fields
```

---

## 14. Future Scale Considerations

### PgBouncer Connection Limits

**Trigger:** Tens of thousands of concurrent connections.

**Current design:** MikroORM forks EntityManager per request with schema context.

**Scaling concern:** At high scale, connection pooling needs tuning.

**Future solution:**
- PgBouncer in transaction mode with explicit schema setting
- Per-cell connection limits with automatic tenant redistribution
- Consider PgCat or Supavisor as alternatives at scale

### Cross-Tenant Analytics (Data Warehouse)

**Trigger:** Need for platform-wide metrics.

**Current design:** Schema-per-tenant isolation prevents cross-tenant queries.

**Future solution:** Stream anonymized/aggregated data from Outbox to central data warehouse (Redshift/Snowflake).

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [Business Model](./00-business-model.md) | Pricing, tiers |
| [Data Model](./02-data-model.md) | MikroORM entities |
| [Security](./03-security.md) | Auth, RBAC, encryption |
| [Infrastructure](./11-infrastructure.md) | AWS, Cloudflare setup |
| [Compliance Architecture](../architecture/compliance-architecture.md) | Compliance system architecture |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 2.6 | 2026-01-28 | Removed deprecated concepts (ReadinessProfile, RuleTemplate, ReasonCode, RuleDeviation); consolidated to current architecture (Regulation, Requirement, CategoryRegulation, ComplianceStackResolver, RequirementHandler, TenantRequirementExemption, ComplianceEvidence) |
| 2.5 | 2026-01-28 | Updated terminology: RegulatoryList to Regulation, RegulatoryListEntry to Requirement, CategoryRegulatoryList to CategoryRegulation; added ComplianceStackResolver to architecture; added TenantRequirementExemption and ComplianceEvidence to tenant schema |
| 2.4 | 2026-01-24 | Documented dual-schema outbox pattern (public for system events, tenant for domain events); added separate worker architecture |
| 2.3 | 2026-01-23 | Migrated authentication from Clerk to Clerk Cloud EU |
| 2.2 | 2026-01-21 | Added feature toggles to compliance evaluation section; noted optional nature with enable/silent/enforcing modes |
| 2.1 | 2026-01-21 | Added Compliance Evaluation Layer (Section 8); compliance cross-cutting layer |
| 2.0 | 2026-01-21 | Rewritten for MikroORM, JWT-based tenant context, parallel migrations |
