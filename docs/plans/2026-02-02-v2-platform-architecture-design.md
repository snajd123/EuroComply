# EuroComply v2 Platform Architecture Design

> **Status:** APPROVED
> **Created:** 2026-02-02
> **Authors:** Human + Claude (Brainstorming Session)
> **Supersedes:** All previous architecture documents for tenant/data model

---

## Executive Summary

EuroComply v2 is a **Compliance Virtual Machine** - a meta-framework that treats regulatory rules as data, not code. This architecture enables:

- **100k+ tenants** via row-level tenancy (not schema-per-tenant)
- **AI-native** features via pgvector embeddings and RAG infrastructure
- **Plugin-ready** vertical system where new industries are configuration, not code
- **Graph-powered** compliance reasoning via Neo4j knowledge graph
- **Legally defensible** audit trails via event sourcing with GSR version pinning

### Core Principle

```
The Code (requirement_handlers) is the Instruction Set.
The Data (rules JSON) is the Program.
The Seeder is the Loader that compiles the program into the VM's memory.
```

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Strategy: Polyglot Persistence](#2-database-strategy-polyglot-persistence)
3. [GSR Database Schema](#3-gsr-database-schema)
4. [Tenant Database Schema](#4-tenant-database-schema)
5. [Neo4j Knowledge Graph Schema](#5-neo4j-knowledge-graph-schema)
6. [Plugin Architecture](#6-plugin-architecture)
7. [AI Infrastructure](#7-ai-infrastructure)
8. [Rules Engine](#8-rules-engine)
9. [Seeder Architecture](#9-seeder-architecture)
10. [Synchronization Strategy](#10-synchronization-strategy)
11. [Query Patterns](#11-query-patterns)
12. [Migration from v1](#12-migration-from-v1)
13. [Implementation Plan](#13-implementation-plan)

---

## 1. Architecture Overview

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EUROCOMPLY v2 - COMPLIANCE VIRTUAL MACHINE             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                            ┌─────────────────┐                               │
│                            │   API GATEWAY   │                               │
│                            │     (Hono)      │                               │
│                            └────────┬────────┘                               │
│                                     │                                        │
│         ┌───────────────────────────┼───────────────────────────┐           │
│         │                           │                           │           │
│         ▼                           ▼                           ▼           │
│  ┌─────────────┐           ┌─────────────────┐          ┌─────────────┐     │
│  │ POSTGRESQL  │           │     NEO4J       │          │  POSTGRESQL │     │
│  │  (Tenant)   │           │ (Knowledge      │          │ + PGVECTOR  │     │
│  │             │           │     Graph)      │          │    (AI)     │     │
│  ├─────────────┤           ├─────────────────┤          ├─────────────┤     │
│  │             │           │                 │          │             │     │
│  │ Tenants     │           │ (:Substance)    │          │ embeddings  │     │
│  │ Users       │◄─────────▶│ (:Regulation)   │◄────────▶│ rag_chunks  │     │
│  │ Products    │   sync    │ (:Rule)         │  embed   │ ai_*        │     │
│  │ Materials   │           │ (:Category)     │          │             │     │
│  │ Events      │           │ (:HazardClass)  │          │             │     │
│  │ Evidence    │           │                 │          │             │     │
│  │             │           │ [:RESTRICTS]    │          │             │     │
│  │ tenant_id   │           │ [:APPLIES_TO]   │          │             │     │
│  │ on EVERY    │           │ [:CLASSIFIED_AS]│          │             │     │
│  │ row         │           │ [:DEFINED_BY]   │          │             │     │
│  └─────────────┘           └─────────────────┘          └─────────────┘     │
│         │                           │                           │           │
│         └───────────────────────────┼───────────────────────────┘           │
│                                     │                                        │
│                                     ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                 POSTGRESQL (GSR - Global Substance Registry)         │   │
│  │                           READ-ONLY REFERENCE DATA                   │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │   substance (1.2M Golden Records)                                   │   │
│  │   ├─ substance_alias (20M+ synonyms)                                │   │
│  │   ├─ substance_ec (EU EC numbers)                                   │   │
│  │   ├─ substance_cosing (Cosmetics INCI)                              │   │
│  │   ├─ substance_efsa (Food E-numbers)                                │   │
│  │   ├─ substance_tsca (US TSCA)                                       │   │
│  │   ├─ substance_biocide (EU Biocides)                                │   │
│  │   └─ substance_hazard_classification (CLP)                          │   │
│  │                                                                      │   │
│  │   Edge-replicated │ Version-pinned │ Identity Ladder resolution     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multi-tenancy | Row-level (`tenant_id` on every row) | Scales to 100k+ tenants, enables cross-tenant analytics |
| Chemical data | Separate GSR database | Read-heavy global truth, edge-replicable, version-pinned |
| Compliance logic | Neo4j knowledge graph | Path traversal, impact analysis, explanation generation |
| AI infrastructure | pgvector in tenant DB | Semantic search, RAG, co-located with tenant data |
| Audit trail | Event sourcing | Legal time-travel, immutable history, replay capability |
| Vertical system | Database-driven plugins | New industries = INSERT statements, not code |
| Rules | Declarative JSON | "Compiled" by seeders, executed by handlers |

---

## 2. Database Strategy: Polyglot Persistence

### Four Databases, Clear Responsibilities

| Database | Technology | Purpose | Characteristics |
|----------|------------|---------|-----------------|
| `eurocomply_gsr` | PostgreSQL | Global Substance Registry | Read-only, edge-replicated, 1.2M records |
| `eurocomply_tenant` | PostgreSQL | Tenant business data | Write-heavy, row-level tenancy, event-sourced |
| `eurocomply_graph` | Neo4j | Compliance knowledge graph | Traversal queries, impact analysis |
| `eurocomply_tenant.embeddings` | pgvector | AI embeddings | Semantic search, RAG |

### Why Separate GSR?

```
PROBLEM: Mixing chemicals (read-heavy, global) with products (write-heavy, tenant-specific)

SOLUTION: Physical separation

BENEFITS:
├─ GSR can be cached at edge (Cloudflare, regional replicas)
├─ Tenant DB stays lean (no 1.2M chemical rows per query plan)
├─ GSR updates don't lock tenant tables
├─ Security: GSR is public data, tenant data is private
└─ Scale: Can shard tenant DB without touching GSR
```

### Connection Strategy

```typescript
// Application maintains three connection pools
const gsrOrm = await MikroORM.init(gsrConfig);      // Read-only pool
const tenantOrm = await MikroORM.init(tenantConfig); // Write-optimized pool
const neo4j = neo4jDriver.driver(neo4jUri);          // Graph queries

// Cross-database joins happen in application memory, not SQL
const substances = await gsrOrm.em.find(Substance, { id: { $in: substanceIds } });
const materials = await tenantOrm.em.find(Material, { substanceId: { $in: substanceIds } });
// Join in memory
```

---

## 3. GSR Database Schema

### Extensions Required

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- Trigram fuzzy search
CREATE EXTENSION IF NOT EXISTS "btree_gist";    -- For exclusion constraints
```

### 3.1 Golden Record (substance)

The canonical representation of a chemical, keyed by InChIKey.

```sql
CREATE TABLE substance (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Chemical Identity (the "DNA")
    inchi_key           VARCHAR(27),                  -- Chemical fingerprint, NULL for mixtures
    cas_number          VARCHAR(20),                  -- Indexed but NOT unique (historical dupes)
    dtxsid              VARCHAR(20) UNIQUE,           -- EPA CompTox ID

    -- Names
    canonical_name      TEXT NOT NULL,                -- Primary name (CompTox PREFERRED_NAME)
    iupac_name          TEXT,                         -- Systematic name

    -- Structure
    smiles              TEXT,                         -- Molecular structure string
    molecular_formula   VARCHAR(500),
    molecular_weight    DECIMAL(12, 4),

    -- Quality & Status
    qc_level            SMALLINT,                     -- CompTox QC (1-5)
    is_mixture          BOOLEAN DEFAULT FALSE,        -- True if no single structure
    is_active           BOOLEAN DEFAULT TRUE,

    -- Versioning
    data_version        VARCHAR(20) NOT NULL,         -- e.g., "2026.02.03"

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for Identity Ladder resolution
CREATE UNIQUE INDEX idx_substance_inchi ON substance(inchi_key) WHERE inchi_key IS NOT NULL;
CREATE INDEX idx_substance_cas ON substance(cas_number) WHERE cas_number IS NOT NULL;
CREATE INDEX idx_substance_dtxsid ON substance(dtxsid) WHERE dtxsid IS NOT NULL;
CREATE INDEX idx_substance_name_trgm ON substance USING gin (canonical_name gin_trgm_ops);
CREATE INDEX idx_substance_version ON substance(data_version);
```

### 3.2 Aliases

```sql
CREATE TABLE substance_alias (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    substance_id        UUID NOT NULL REFERENCES substance(id) ON DELETE CASCADE,

    name                TEXT NOT NULL,
    name_normalized     TEXT NOT NULL,                -- Lowercase, trimmed
    alias_type          VARCHAR(30),                  -- TRADE_NAME, SYNONYM, INCI, IUPAC
    language            VARCHAR(5),                   -- ISO 639-1
    source              VARCHAR(50),                  -- PUBCHEM, COMPTOX, ECHA

    data_version        VARCHAR(20) NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alias_substance ON substance_alias(substance_id);
CREATE INDEX idx_alias_name_trgm ON substance_alias USING gin (name_normalized gin_trgm_ops);
```

### 3.3 Personas (Regulatory Context Identities)

#### EC Numbers (ECHA - EU Registry)

```sql
CREATE TABLE substance_ec (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    substance_id        UUID NOT NULL REFERENCES substance(id) ON DELETE CASCADE,

    ec_number           VARCHAR(20) NOT NULL,
    ec_name             TEXT,
    inventory_type      VARCHAR(10) NOT NULL,         -- EINECS, ELINCS, NLP

    is_primary          BOOLEAN DEFAULT TRUE,         -- For display when multiple exist
    echa_url            TEXT,

    data_version        VARCHAR(20) NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_ec_number UNIQUE (ec_number)
);

CREATE INDEX idx_ec_substance ON substance_ec(substance_id);
CREATE INDEX idx_ec_number ON substance_ec(ec_number);
```

#### CosIng (Cosmetics)

```sql
CREATE TABLE substance_cosing (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    substance_id        UUID NOT NULL REFERENCES substance(id) ON DELETE CASCADE,

    cosing_ref          VARCHAR(20) NOT NULL UNIQUE,
    inci_name           TEXT NOT NULL,
    inci_name_normalized TEXT NOT NULL,

    functions           TEXT[],                       -- [preservative, fragrance, etc.]
    restriction_type    VARCHAR(20),                  -- ANNEX_II, ANNEX_III, etc.
    max_concentration   DECIMAL(10, 4),
    restriction_text    TEXT,
    sccs_opinions       JSONB,

    data_version        VARCHAR(20) NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_cosing_substance UNIQUE (substance_id)
);

CREATE INDEX idx_cosing_inci_trgm ON substance_cosing USING gin (inci_name_normalized gin_trgm_ops);
CREATE INDEX idx_cosing_restriction ON substance_cosing(restriction_type) WHERE restriction_type IS NOT NULL;
```

#### EFSA (Food Additives)

```sql
CREATE TABLE substance_efsa (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    substance_id        UUID NOT NULL REFERENCES substance(id) ON DELETE CASCADE,

    e_number            VARCHAR(15),                  -- E211, E160a(ii), etc.
    efsa_id             VARCHAR(50),
    functional_class    VARCHAR(50) NOT NULL,         -- Preservative, Colorant, etc.

    adi_value           DECIMAL(10, 4),               -- mg/kg bw/day
    adi_unit            VARCHAR(30) DEFAULT 'mg/kg bw/day',
    adi_note            TEXT,                         -- "not specified", "not limited"

    approved_uses       TEXT[],
    conditions          TEXT,

    re_evaluation_date  DATE,
    re_evaluation_status VARCHAR(30),

    data_version        VARCHAR(20) NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_efsa_substance UNIQUE (substance_id)
);

CREATE INDEX idx_efsa_enumber ON substance_efsa(e_number) WHERE e_number IS NOT NULL;
```

#### TSCA (US Industrial)

```sql
CREATE TABLE substance_tsca (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    substance_id        UUID NOT NULL REFERENCES substance(id) ON DELETE CASCADE,

    tsca_id             INTEGER NOT NULL,
    tsca_cas            VARCHAR(20) NOT NULL,

    inventory_status    VARCHAR(20) NOT NULL,         -- ACTIVE, INACTIVE
    is_section_5        BOOLEAN DEFAULT FALSE,
    is_section_6        BOOLEAN DEFAULT FALSE,
    is_snur             BOOLEAN DEFAULT FALSE,
    flags               VARCHAR(10)[],

    data_version        VARCHAR(20) NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_tsca_substance UNIQUE (substance_id),
    CONSTRAINT uq_tsca_cas UNIQUE (tsca_cas)
);

CREATE INDEX idx_tsca_status ON substance_tsca(inventory_status);
```

#### Biocides (EU BPR)

```sql
CREATE TABLE substance_biocide (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    substance_id        UUID NOT NULL REFERENCES substance(id) ON DELETE CASCADE,

    biocide_name        TEXT NOT NULL,
    approval_status     VARCHAR(30) NOT NULL,
    product_types       INTEGER[],                    -- [1, 2, 4, 18] etc.

    approval_date       DATE,
    expiry_date         DATE,
    conditions          TEXT,

    data_version        VARCHAR(20) NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_biocide_substance UNIQUE (substance_id)
);

CREATE INDEX idx_biocide_status ON substance_biocide(approval_status);
CREATE INDEX idx_biocide_pt ON substance_biocide USING gin (product_types);
```

### 3.4 Hazard Classifications (CLP)

```sql
CREATE TABLE hazard_class (
    code                VARCHAR(30) PRIMARY KEY,
    hazard_type         VARCHAR(30) NOT NULL,         -- PHYSICAL, HEALTH, ENVIRONMENTAL
    ghs_code            VARCHAR(10),
    signal_word         VARCHAR(10),
    is_cmr              BOOLEAN DEFAULT FALSE,
    sort_order          INTEGER
);

CREATE TABLE hazard_statement (
    code                VARCHAR(10) PRIMARY KEY,
    hazard_class_code   VARCHAR(30) REFERENCES hazard_class(code),
    texts               JSONB NOT NULL,               -- {"en": "...", "de": "...", ...}
    is_combined         BOOLEAN DEFAULT FALSE
);

CREATE TABLE substance_hazard_classification (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    substance_id        UUID NOT NULL REFERENCES substance(id) ON DELETE CASCADE,

    hazard_class_code   VARCHAR(30) NOT NULL REFERENCES hazard_class(code),
    category            VARCHAR(30),
    h_code              VARCHAR(20),

    scl                 DECIMAL(10, 4),               -- Specific Concentration Limit
    m_factor            INTEGER,
    m_factor_chronic    INTEGER,
    ael                 DECIMAL(10, 4),

    atp_source          VARCHAR(20),
    valid_from          DATE,
    valid_to            DATE,
    notes               TEXT,

    data_version        VARCHAR(20) NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_classification UNIQUE (substance_id, hazard_class_code, category, h_code)
);

CREATE INDEX idx_classification_substance ON substance_hazard_classification(substance_id);
CREATE INDEX idx_classification_class ON substance_hazard_classification(hazard_class_code);
```

### 3.5 Regulatory Lists

```sql
CREATE TABLE regulatory_list (
    code                VARCHAR(30) PRIMARY KEY,
    name                TEXT NOT NULL,
    description         TEXT,
    jurisdiction        VARCHAR(10) NOT NULL,
    regulation_ref      VARCHAR(100),
    current_version     VARCHAR(20),
    effective_date      DATE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE substance_group (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(50) UNIQUE NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    parent_id           UUID REFERENCES substance_group(id),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE substance_group_member (
    group_id            UUID NOT NULL REFERENCES substance_group(id) ON DELETE CASCADE,
    substance_id        UUID NOT NULL REFERENCES substance(id) ON DELETE CASCADE,
    membership_type     VARCHAR(20) DEFAULT 'EXPLICIT',
    PRIMARY KEY (group_id, substance_id)
);

CREATE TABLE substance_list_entry (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    substance_id        UUID REFERENCES substance(id) ON DELETE CASCADE,
    group_id            UUID REFERENCES substance_group(id) ON DELETE CASCADE,
    list_code           VARCHAR(30) NOT NULL REFERENCES regulatory_list(code),

    entry_number        VARCHAR(20),
    entry_name          TEXT,
    scope               TEXT,
    threshold           DECIMAL(10, 6),
    threshold_unit      VARCHAR(20),
    threshold_operator  VARCHAR(5),
    conditions          TEXT,

    inclusion_date      DATE,
    sunset_date         DATE,

    data_version        VARCHAR(20) NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_entry_target CHECK (substance_id IS NOT NULL OR group_id IS NOT NULL)
);

CREATE INDEX idx_list_entry_substance ON substance_list_entry(substance_id);
CREATE INDEX idx_list_entry_group ON substance_list_entry(group_id);
CREATE INDEX idx_list_entry_list ON substance_list_entry(list_code);
```

### 3.6 Version Tracking

```sql
CREATE TABLE gsr_version (
    version             VARCHAR(20) PRIMARY KEY,
    substance_count     INTEGER NOT NULL,
    cosing_count        INTEGER,
    efsa_count          INTEGER,
    tsca_count          INTEGER,
    biocide_count       INTEGER,
    classification_count INTEGER,
    seeded_at           TIMESTAMPTZ NOT NULL,
    notes               TEXT
);

CREATE TABLE gsr_current (
    singleton           BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
    version             VARCHAR(20) NOT NULL REFERENCES gsr_version(version)
);
```

---

## 4. Tenant Database Schema

### Extensions Required

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "ltree";           -- Category hierarchies
CREATE EXTENSION IF NOT EXISTS "vector";          -- AI embeddings
```

### 4.1 Tenancy Root

```sql
CREATE TABLE tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    external_id         VARCHAR(50) UNIQUE NOT NULL,  -- Clerk org ID
    name                TEXT NOT NULL,
    slug                VARCHAR(100) UNIQUE NOT NULL,

    tier                VARCHAR(20) NOT NULL DEFAULT 'starter',
    status              VARCHAR(20) NOT NULL DEFAULT 'active',

    user_limit          INTEGER NOT NULL DEFAULT 20,
    storage_limit_bytes BIGINT NOT NULL DEFAULT 536870912000,
    api_rate_limit      INTEGER NOT NULL DEFAULT 100,

    enforcement_mode    VARCHAR(20) DEFAULT 'SILENT',

    stripe_customer_id  VARCHAR(100),
    did                 VARCHAR(255),

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_external ON tenants(external_id);
CREATE INDEX idx_tenants_tier ON tenants(tier);
```

### 4.2 Users & Auth

```sql
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    external_id         VARCHAR(50) NOT NULL,
    email               TEXT NOT NULL,
    name                TEXT,
    avatar_url          TEXT,

    is_active           BOOLEAN DEFAULT TRUE,
    last_login_at       TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_user_tenant_external UNIQUE (tenant_id, external_id)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);

CREATE TABLE user_workspace_roles (
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    workspace_id        VARCHAR(50) NOT NULL,
    role                VARCHAR(20) NOT NULL,
    granted_at          TIMESTAMPTZ DEFAULT NOW(),
    granted_by          UUID REFERENCES users(id),
    PRIMARY KEY (user_id, workspace_id)
);

CREATE TABLE api_keys (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    name                TEXT NOT NULL,
    key_prefix          VARCHAR(20) NOT NULL,
    key_hash            VARCHAR(64) NOT NULL,

    authorities         JSONB NOT NULL,

    last_used_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    created_by          UUID REFERENCES users(id)
);

CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
```

### 4.3 Event Store

```sql
CREATE TABLE events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,

    stream_type         VARCHAR(50) NOT NULL,
    stream_id           UUID NOT NULL,

    event_type          VARCHAR(100) NOT NULL,
    event_data          JSONB NOT NULL,
    metadata            JSONB,

    version             BIGINT NOT NULL,
    global_position     BIGSERIAL,

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_stream_version UNIQUE (stream_id, version)
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE events_2026_01 PARTITION OF events
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE events_2026_02 PARTITION OF events
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- Continue for future months...

CREATE INDEX idx_events_tenant ON events(tenant_id);
CREATE INDEX idx_events_stream ON events(stream_id, version);
CREATE INDEX idx_events_type ON events(tenant_id, stream_type, event_type);
CREATE INDEX idx_events_global ON events(global_position);

CREATE TABLE snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,

    stream_type         VARCHAR(50) NOT NULL,
    stream_id           UUID NOT NULL,

    version             BIGINT NOT NULL,
    state               JSONB NOT NULL,

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_snapshot_stream_version UNIQUE (stream_id, version)
);

CREATE INDEX idx_snapshots_stream ON snapshots(stream_id, version DESC);
```

### 4.4 Product Projections

```sql
CREATE TABLE products (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    name                TEXT NOT NULL,
    internal_id         VARCHAR(100),
    sku                 VARCHAR(100),
    gtin                VARCHAR(14),

    category_id         UUID,
    product_type        VARCHAR(30) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT',

    current_version_id  UUID,
    stream_version      BIGINT NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_sku ON products(tenant_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_gtin ON products(tenant_id, gtin) WHERE gtin IS NOT NULL;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_products ON products
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE TABLE product_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    workspace           VARCHAR(50) NOT NULL,
    version_number      INTEGER NOT NULL,
    status              VARCHAR(20) NOT NULL,
    data                JSONB NOT NULL,

    approved_at         TIMESTAMPTZ,
    approved_by         UUID REFERENCES users(id),

    stream_version      BIGINT NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_product_workspace_version UNIQUE (product_id, workspace, version_number)
);

CREATE INDEX idx_versions_tenant ON product_versions(tenant_id);
CREATE INDEX idx_versions_product ON product_versions(product_id);

ALTER TABLE product_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_versions ON product_versions
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
```

### 4.5 Materials & Substances

```sql
CREATE TABLE materials (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,

    name                TEXT NOT NULL,
    material_type       VARCHAR(30),
    product_id          UUID REFERENCES products(id),

    stream_version      BIGINT NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_materials_tenant ON materials(tenant_id);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_materials ON materials
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE TABLE material_substances (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    material_id         UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,

    -- GSR linkage (cross-database reference)
    substance_id        UUID NOT NULL,                -- References gsr.substance.id
    inchi_key           VARCHAR(27),                  -- Denormalized for validation
    substance_name      TEXT NOT NULL,                -- Denormalized for display
    cas_number          VARCHAR(20),                  -- Denormalized for display

    -- Declaration data
    concentration       DECIMAL(10, 6),
    concentration_unit  VARCHAR(20) DEFAULT 'PERCENT',
    concentration_type  VARCHAR(20),
    concentration_min   DECIMAL(10, 6),
    concentration_max   DECIMAL(10, 6),

    is_confidential     BOOLEAN DEFAULT FALSE,

    -- GSR version pinning (critical for compliance snapshots)
    gsr_version         VARCHAR(20) NOT NULL,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mat_substances_tenant ON material_substances(tenant_id);
CREATE INDEX idx_mat_substances_material ON material_substances(material_id);
CREATE INDEX idx_mat_substances_substance ON material_substances(substance_id);

ALTER TABLE material_substances ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_mat_substances ON material_substances
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
```

### 4.6 Compliance Evidence

```sql
CREATE TABLE compliance_evidence (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,

    product_id          UUID NOT NULL REFERENCES products(id),
    product_version_id  UUID REFERENCES product_versions(id),

    evaluation_type     VARCHAR(30) NOT NULL,
    vertical_id         VARCHAR(50),

    status              VARCHAR(20) NOT NULL,

    requirement_snapshot JSONB NOT NULL,
    gsr_version         VARCHAR(20) NOT NULL,
    substance_snapshot  JSONB,
    evaluation_result   JSONB NOT NULL,

    evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluated_by        UUID REFERENCES users(id),

    evaluation_hash     VARCHAR(64) NOT NULL
);

CREATE INDEX idx_evidence_tenant ON compliance_evidence(tenant_id);
CREATE INDEX idx_evidence_product ON compliance_evidence(product_id);
CREATE INDEX idx_evidence_status ON compliance_evidence(tenant_id, status);
CREATE INDEX idx_evidence_date ON compliance_evidence(tenant_id, evaluated_at DESC);

ALTER TABLE compliance_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_evidence ON compliance_evidence
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
```

---

## 5. Neo4j Knowledge Graph Schema

### 5.1 Node Types

```cypher
// Chemical Identity (synced from GSR)
(:Substance {
  id: UUID,
  inchi_key: String,
  cas_number: String,
  canonical_name: String,
  gsr_version: String
})

(:SubstanceGroup {
  id: UUID,
  code: String,
  name: String
})

// Regulatory Structure
(:Regulation {
  id: UUID,
  code: String,
  name: String,
  jurisdiction: String,
  effective_date: Date
})

(:Rule {
  id: UUID,
  code: String,
  name: String,
  rule_type: String,
  severity: String,
  logic: String,       // JSON stringified
  gsr_version: String
})

(:Category {
  id: UUID,
  code: String,
  path: String,
  name: String
})

(:HazardClass {
  code: String,
  name: String,
  is_cmr: Boolean
})

(:Vertical {
  id: String,
  name: String
})

(:Workspace {
  id: String,
  name: String
})

(:Handler {
  id: String,
  code: String,
  name: String,
  module_path: String
})
```

### 5.2 Relationships

```cypher
// Substance relationships
(:Substance)-[:BELONGS_TO]->(:SubstanceGroup)
(:Substance)-[:HAS_PERSONA {type: String}]->(:Persona)
(:Substance)-[:CLASSIFIED_AS {category: String, h_code: String}]->(:HazardClass)

// Regulatory relationships
(:Rule)-[:DEFINED_BY]->(:Regulation)
(:Rule)-[:RESTRICTS {threshold: Float, unit: String, condition: String}]->(:Substance)
(:Rule)-[:RESTRICTS_GROUP]->(:SubstanceGroup)
(:Rule)-[:APPLIES_TO]->(:Category)
(:Rule)-[:EVALUATED_BY]->(:Handler)
(:Rule)-[:OWNED_BY]->(:Vertical)

// Category relationships
(:Category)-[:PARENT_OF]->(:Category)
(:Category)-[:SUBJECT_TO]->(:Regulation)

// Vertical relationships
(:Vertical)-[:HAS_WORKSPACE]->(:Workspace)
(:Vertical)-[:USES_PERSONA {persona_type: String}]->(:Substance)
```

### 5.3 Key Query Patterns

```cypher
// WHY IS MY PRODUCT NON-COMPLIANT?
// Returns the full path from product to failing rule
MATCH path = (p:Product {id: $productId})
  -[:CONTAINS]->(m:Material)
  -[:DECLARES]->(s:Substance)
  -[:RESTRICTED_BY]->(r:Rule)
  -[:DEFINED_BY]->(reg:Regulation)
WHERE r.severity = 'BLOCKER'
RETURN path, s.canonical_name, r.name, r.logic, reg.code

// IMPACT ANALYSIS: What if we ban PFAS?
MATCH (g:SubstanceGroup {code: "PFAS"})<-[:BELONGS_TO]-(s:Substance)
      <-[:DECLARES]-(m:Material)<-[:CONTAINS]-(p:Product)
RETURN DISTINCT p.id, p.name, COUNT(DISTINCT s) AS pfas_count

// ALL APPLICABLE REGULATIONS FOR A CATEGORY
MATCH (c:Category {id: $categoryId})
MATCH path = (c)-[:PARENT_OF*0..]->(ancestor:Category)
              -[:SUBJECT_TO]->(reg:Regulation)
RETURN DISTINCT reg.code, reg.name

// COMPLIANCE STACK FOR A PRODUCT
MATCH (p:Product {id: $productId})-[:IN_CATEGORY]->(c:Category)
MATCH (c)-[:PARENT_OF*0..]->(ancestor:Category)<-[:APPLIES_TO]-(r:Rule)
OPTIONAL MATCH (p)-[:CONTAINS]->(:Material)-[:DECLARES]->(s:Substance)
               <-[:RESTRICTS]-(sr:Rule)
WITH COLLECT(DISTINCT r) + COLLECT(DISTINCT sr) AS all_rules
UNWIND all_rules AS rule
RETURN DISTINCT rule.code, rule.name, rule.severity, rule.logic
```

---

## 6. Plugin Architecture

### 6.1 Vertical Definitions

```sql
CREATE TABLE verticals (
    id                  VARCHAR(50) PRIMARY KEY,
    name                TEXT NOT NULL,
    description         TEXT,

    version             VARCHAR(20) NOT NULL,
    gsr_personas        TEXT[] NOT NULL,

    default_config      JSONB NOT NULL DEFAULT '{}',
    config_schema       JSONB,

    is_active           BOOLEAN DEFAULT TRUE,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vertical_workspaces (
    id                  VARCHAR(100) PRIMARY KEY,
    vertical_id         VARCHAR(50) NOT NULL REFERENCES verticals(id) ON DELETE CASCADE,

    code                VARCHAR(50) NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,

    available_roles     TEXT[] NOT NULL,

    icon                VARCHAR(50),
    color               VARCHAR(20),
    sort_order          INTEGER DEFAULT 0,

    is_active           BOOLEAN DEFAULT TRUE,

    CONSTRAINT uq_vertical_workspace UNIQUE (vertical_id, code)
);

CREATE TABLE tenant_verticals (
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vertical_id         VARCHAR(50) NOT NULL REFERENCES verticals(id),

    enabled_at          TIMESTAMPTZ DEFAULT NOW(),
    config              JSONB,

    PRIMARY KEY (tenant_id, vertical_id)
);
```

### 6.2 Dynamic Entity System

```sql
CREATE TABLE vertical_entity_definitions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_id         VARCHAR(50) NOT NULL REFERENCES verticals(id) ON DELETE CASCADE,

    entity_code         VARCHAR(50) NOT NULL,
    entity_name         TEXT NOT NULL,

    data_schema         JSONB NOT NULL,              -- JSON Schema
    extends_entity      VARCHAR(50),                 -- 'product', 'material', NULL
    required_fields     TEXT[],

    version             VARCHAR(20) NOT NULL,

    CONSTRAINT uq_vertical_entity UNIQUE (vertical_id, entity_code)
);

CREATE TABLE vertical_entity_data (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vertical_id         VARCHAR(50) NOT NULL REFERENCES verticals(id),
    entity_code         VARCHAR(50) NOT NULL,

    base_entity_type    VARCHAR(50),
    base_entity_id      UUID,

    data                JSONB NOT NULL,
    version             INTEGER NOT NULL DEFAULT 1,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_vertical_data UNIQUE (tenant_id, vertical_id, entity_code, base_entity_id)
);

CREATE INDEX idx_vertical_data_tenant ON vertical_entity_data(tenant_id);
CREATE INDEX idx_vertical_data_vertical ON vertical_entity_data(vertical_id, entity_code);
CREATE INDEX idx_vertical_data_base ON vertical_entity_data(base_entity_type, base_entity_id)
    WHERE base_entity_id IS NOT NULL;
CREATE INDEX idx_vertical_data_jsonb ON vertical_entity_data USING gin (data jsonb_path_ops);

ALTER TABLE vertical_entity_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vertical_data ON vertical_entity_data
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
```

### 6.3 Requirement Handlers

```sql
CREATE TABLE requirement_handlers (
    id                  VARCHAR(100) PRIMARY KEY,
    vertical_id         VARCHAR(50) NOT NULL REFERENCES verticals(id) ON DELETE CASCADE,

    code                VARCHAR(50) NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,

    handler_type        VARCHAR(50) NOT NULL,

    config_schema       JSONB,
    default_config      JSONB,

    requirement_types   TEXT[] NOT NULL,
    module_path         TEXT NOT NULL,

    version             VARCHAR(20) NOT NULL,
    is_active           BOOLEAN DEFAULT TRUE,

    CONSTRAINT uq_handler_vertical UNIQUE (vertical_id, code)
);

CREATE INDEX idx_handlers_vertical ON requirement_handlers(vertical_id);
CREATE INDEX idx_handlers_types ON requirement_handlers USING gin (requirement_types);
```

---

## 7. AI Infrastructure

### 7.1 Embeddings

```sql
CREATE TABLE embeddings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id           UUID,                         -- NULL for GSR embeddings

    entity_type         VARCHAR(50) NOT NULL,
    entity_id           UUID NOT NULL,

    embedding           vector(1536) NOT NULL,

    content_hash        VARCHAR(64) NOT NULL,
    content_preview     TEXT,

    model               VARCHAR(50) NOT NULL,
    model_version       VARCHAR(20),

    chunk_index         INTEGER,
    chunk_total         INTEGER,

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_embedding UNIQUE (tenant_id, entity_type, entity_id, chunk_index)
);

CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
CREATE INDEX idx_embeddings_tenant ON embeddings(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_embeddings_entity ON embeddings(entity_type, entity_id);
CREATE INDEX idx_embeddings_gsr ON embeddings(entity_type, entity_id) WHERE tenant_id IS NULL;
```

### 7.2 RAG Documents

```sql
CREATE TABLE rag_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id           UUID,

    source_type         VARCHAR(50) NOT NULL,
    source_id           VARCHAR(100),
    title               TEXT NOT NULL,

    content_type        VARCHAR(20) NOT NULL,
    storage_path        TEXT,
    content_hash        VARCHAR(64) NOT NULL,

    processing_status   VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    processed_at        TIMESTAMPTZ,
    error_message       TEXT,

    metadata            JSONB,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rag_chunks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,

    content             TEXT NOT NULL,
    chunk_index         INTEGER NOT NULL,

    start_page          INTEGER,
    end_page            INTEGER,
    start_char          INTEGER,
    end_char            INTEGER,

    embedding_id        UUID REFERENCES embeddings(id),

    metadata            JSONB,

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rag_chunks_doc ON rag_chunks(document_id, chunk_index);
```

### 7.3 AI Interactions

```sql
CREATE TABLE ai_interactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),

    user_id             UUID REFERENCES users(id),
    api_key_id          UUID REFERENCES api_keys(id),

    interaction_type    VARCHAR(50) NOT NULL,

    model               VARCHAR(50) NOT NULL,
    model_version       VARCHAR(20),

    request_hash        VARCHAR(64) NOT NULL,
    request_preview     TEXT,
    response_preview    TEXT,

    input_tokens        INTEGER NOT NULL,
    output_tokens       INTEGER NOT NULL,
    total_tokens        INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,

    cost_millicents     INTEGER,
    latency_ms          INTEGER,

    context             JSONB,
    compliance_evidence_id UUID REFERENCES compliance_evidence(id),

    status              VARCHAR(20) NOT NULL,
    error_message       TEXT,

    created_at          TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_ai_interactions_tenant ON ai_interactions(tenant_id);
CREATE INDEX idx_ai_interactions_type ON ai_interactions(tenant_id, interaction_type);
CREATE INDEX idx_ai_interactions_evidence ON ai_interactions(compliance_evidence_id)
    WHERE compliance_evidence_id IS NOT NULL;
```

### 7.4 AI Tools & Agents

```sql
CREATE TABLE ai_tools (
    id                  VARCHAR(100) PRIMARY KEY,

    name                TEXT NOT NULL,
    description         TEXT NOT NULL,

    tool_type           VARCHAR(30) NOT NULL,
    vertical_ids        TEXT[],

    input_schema        JSONB NOT NULL,
    output_schema       JSONB NOT NULL,

    module_path         TEXT NOT NULL,

    rate_limit_per_minute INTEGER,
    required_permissions TEXT[],

    is_active           BOOLEAN DEFAULT TRUE,

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_agent_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    user_id             UUID REFERENCES users(id),

    agent_type          VARCHAR(50) NOT NULL,
    vertical_id         VARCHAR(50),

    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    memory              JSONB,
    tools_used          TEXT[],

    total_turns         INTEGER DEFAULT 0,
    total_tokens        INTEGER DEFAULT 0,
    total_cost_millicents INTEGER DEFAULT 0,

    started_at          TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at    TIMESTAMPTZ DEFAULT NOW(),
    ended_at            TIMESTAMPTZ
);

CREATE TABLE ai_agent_turns (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES ai_agent_sessions(id) ON DELETE CASCADE,

    turn_number         INTEGER NOT NULL,

    user_message        TEXT,
    thinking            TEXT,
    tool_calls          JSONB,
    assistant_message   TEXT,

    input_tokens        INTEGER,
    output_tokens       INTEGER,
    latency_ms          INTEGER,

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_usage_limits (
    tenant_id           UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

    monthly_token_limit BIGINT,
    monthly_cost_limit  INTEGER,

    period_start        DATE NOT NULL,
    tokens_used         BIGINT NOT NULL DEFAULT 0,
    cost_used           INTEGER NOT NULL DEFAULT 0,

    alert_threshold     DECIMAL(3, 2) DEFAULT 0.80,
    alert_sent_at       TIMESTAMPTZ,

    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. Rules Engine

### 8.1 Regulations & Sections

```sql
CREATE TABLE regulations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    code                VARCHAR(50) UNIQUE NOT NULL,
    name                TEXT NOT NULL,
    short_name          VARCHAR(100),

    jurisdiction        VARCHAR(20) NOT NULL,
    regulatory_body     VARCHAR(100),

    official_reference  TEXT,
    official_url        TEXT,
    document_id         UUID,

    version             VARCHAR(20) NOT NULL,
    effective_date      DATE NOT NULL,
    sunset_date         DATE,

    vertical_ids        TEXT[] NOT NULL,

    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regulations_code ON regulations(code);
CREATE INDEX idx_regulations_vertical ON regulations USING gin (vertical_ids);

CREATE TABLE regulation_sections (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    regulation_id       UUID NOT NULL REFERENCES regulations(id) ON DELETE CASCADE,

    path                LTREE NOT NULL,
    parent_id           UUID REFERENCES regulation_sections(id),

    section_type        VARCHAR(30) NOT NULL,
    number              VARCHAR(20),
    title               TEXT,
    text_content        TEXT,

    page_number         INTEGER,
    coordinates         JSONB,

    sort_order          INTEGER DEFAULT 0,

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reg_sections_regulation ON regulation_sections(regulation_id);
CREATE INDEX idx_reg_sections_path ON regulation_sections USING GIST (path);
```

### 8.2 Atomic Rules

```sql
CREATE TABLE rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    code                VARCHAR(100) UNIQUE NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,

    vertical_id         VARCHAR(50) NOT NULL REFERENCES verticals(id),
    regulation_id       UUID NOT NULL REFERENCES regulations(id),
    section_id          UUID REFERENCES regulation_sections(id),

    rule_type           VARCHAR(50) NOT NULL,
    severity            VARCHAR(20) NOT NULL,

    logic               JSONB NOT NULL,

    handler_id          VARCHAR(100) NOT NULL REFERENCES requirement_handlers(id),

    applies_to          JSONB NOT NULL,

    legal_reference     TEXT,
    legal_text          TEXT,

    version             VARCHAR(20) NOT NULL,
    effective_from      DATE NOT NULL,
    effective_until     DATE,
    superseded_by       UUID REFERENCES rules(id),

    gsr_version         VARCHAR(20),                  -- Pinned GSR version

    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rules_code ON rules(code);
CREATE INDEX idx_rules_vertical ON rules(vertical_id);
CREATE INDEX idx_rules_regulation ON rules(regulation_id);
CREATE INDEX idx_rules_handler ON rules(handler_id);
CREATE INDEX idx_rules_type ON rules(rule_type);
CREATE INDEX idx_rules_status ON rules(status, effective_from, effective_until);
CREATE INDEX idx_rules_logic ON rules USING gin (logic jsonb_path_ops);
CREATE INDEX idx_rules_applies ON rules USING gin (applies_to jsonb_path_ops);

CREATE TABLE rule_parameters (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    regulation_id       UUID REFERENCES regulations(id) ON DELETE CASCADE,
    rule_id             UUID REFERENCES rules(id) ON DELETE CASCADE,

    code                VARCHAR(50) NOT NULL,
    name                TEXT NOT NULL,

    parameter_type      VARCHAR(30) NOT NULL,
    value               JSONB NOT NULL,

    version             VARCHAR(20) NOT NULL,
    effective_from      DATE,

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_param_owner CHECK (
        (regulation_id IS NOT NULL AND rule_id IS NULL) OR
        (regulation_id IS NULL AND rule_id IS NOT NULL)
    )
);
```

### 8.3 Rule Logic Schema

```
RULE_TYPES:
- SUBSTANCE_PROHIBITION     : Substance must not be present
- SUBSTANCE_RESTRICTION     : Substance allowed with conditions
- CONCENTRATION_LIMIT       : Max/min concentration threshold
- LABELING_REQUIREMENT      : Must display certain information
- DOCUMENTATION_REQUIREMENT : Must have certain documents
- CMR_CHECK                 : Carcinogenic/Mutagenic/Reprotoxic check

LOGIC SCHEMA (JSON):

1. CONCENTRATION_LIMIT:
{
  "type": "CONCENTRATION_LIMIT",
  "target": {
    "match_by": "substance_id" | "cas_number" | "group_code",
    "value": "..."
  },
  "threshold": {
    "operator": "<" | "<=" | ">" | ">=" | "range",
    "value": 0.5,
    "unit": "PERCENT" | "PPM" | "MG_KG"
  },
  "conditions": {
    "product_type": ["leave-on"],
    "body_part": ["face"]
  },
  "resolved_substance_ids": ["uuid1", "uuid2"]  // Injected by seeder
}

2. SUBSTANCE_PROHIBITION:
{
  "type": "SUBSTANCE_PROHIBITION",
  "target": {
    "match_by": "persona_property",
    "value": {
      "persona": "cosing",
      "field": "restriction_type",
      "equals": "ANNEX_II"
    }
  }
}

APPLICABILITY SCHEMA (JSON):
{
  "categories": {
    "include": ["cosmetics.*", "cosmetics.skincare.*"],
    "exclude": ["cosmetics.professional_use"]
  },
  "product_types": ["FINISHED_GOOD"],
  "markets": ["EU", "UK"],
  "conditions": {
    "vertical_data": {
      "entity": "formulation",
      "field": "leave_on",
      "equals": true
    }
  }
}
```

---

## 9. Seeder Architecture

### 9.1 Directory Structure

```
packages/
├── gsr/
│   ├── data/
│   │   ├── DSSTox_CCD_dump_12092025/
│   │   ├── CosIng/
│   │   ├── EFSA/
│   │   ├── tsca_inventory/
│   │   └── ECHA Biocides/
│   └── src/
│       ├── seeders/
│       │   ├── comptox.seeder.ts
│       │   ├── cosing.seeder.ts
│       │   ├── efsa.seeder.ts
│       │   ├── tsca.seeder.ts
│       │   └── biocides.seeder.ts
│       └── services/
│           └── IdentityLadder.ts
│
├── regulations/
│   ├── data/
│   │   ├── cosmetics/
│   │   │   ├── regulation.json
│   │   │   ├── handlers.json
│   │   │   └── rules/
│   │   │       ├── annex-ii.json
│   │   │       ├── annex-iii.json
│   │   │       └── cmr.json
│   │   ├── electronics/
│   │   └── food/
│   └── src/
│       └── seeders/
│           ├── cosmetics.seeder.ts
│           ├── electronics.seeder.ts
│           └── food.seeder.ts
│
└── graph/
    └── src/
        └── sync/
            └── graph-sync.service.ts
```

### 9.2 Seeder Compilation Steps

Each seeder performs these "compilation" steps:

1. **Read**: Parse JSON rule definitions
2. **Resolve**: Query GSR via Identity Ladder for substance_ids
3. **Validate**: Ensure handler_id exists in requirement_handlers
4. **Pin**: Attach current gsr_version to the rule
5. **Persist**: Upsert to PostgreSQL
6. **Sync**: Push to Neo4j graph

### 9.3 CLI Commands

```bash
# Full seed sequence
pnpm seed:full

# Individual steps:
# 1. GSR (PostgreSQL)
pnpm gsr seed all-golden

# 2. Sync GSR to Neo4j
pnpm graph sync gsr --version 2026.02.03

# 3. Regulations (PostgreSQL)
pnpm regulations seed all

# 4. Sync Rules to Neo4j
pnpm graph sync rules

# 5. Generate embeddings
pnpm ai embed all
```

---

## 10. Synchronization Strategy

### 10.1 PostgreSQL → Neo4j Sync

```typescript
// packages/graph/src/sync/graph-sync.service.ts

export class GraphSyncService {
  async syncSubstances(version: string): Promise<SyncResult> {
    // Stream from PostgreSQL GSR
    // Batch insert to Neo4j
    // Create persona relationships
    // Create classification relationships
  }

  async syncRules(): Promise<SyncResult> {
    // Load rules from PostgreSQL
    // Create Rule nodes in Neo4j
    // Create [:RESTRICTS] relationships based on logic.target
    // Create [:APPLIES_TO] relationships based on applies_to.categories
    // Create [:DEFINED_BY] relationships to Regulation
  }
}
```

### 10.2 When to Query Which Database

| Query Type | Database | Why |
|------------|----------|-----|
| Simple lookups | PostgreSQL | Fast, transactional |
| Compliance path traversal | Neo4j | Graph native |
| Impact analysis | Neo4j | Reverse traversal |
| Semantic search | pgvector | Vector similarity |
| RAG queries | All three | Combined intelligence |

---

## 11. Query Patterns

### 11.1 Identity Ladder (GSR)

```typescript
// Resolution priority:
// 1. InChIKey (exact) → substance.inchi_key
// 2. CAS (exact) → substance.cas_number
// 3. EC (exact) → substance_ec.ec_number
// 4. INCI (exact) → substance_cosing.inci_name_normalized
// 5. E-Number (exact) → substance_efsa.e_number
// 6. Name (fuzzy) → substance.canonical_name (pg_trgm)
// 7. Alias (fuzzy) → substance_alias.name_normalized (pg_trgm)
```

### 11.2 Compliance Evaluation (Neo4j)

```cypher
// Get compliance stack for product
MATCH (p:Product {id: $productId})-[:IN_CATEGORY]->(c:Category)
MATCH (c)-[:PARENT_OF*0..]->(ancestor:Category)<-[:APPLIES_TO]-(r:Rule)
OPTIONAL MATCH (p)-[:CONTAINS]->(:Material)-[:DECLARES]->(s:Substance)
               <-[:RESTRICTS]-(sr:Rule)
WITH COLLECT(DISTINCT r) + COLLECT(DISTINCT sr) AS all_rules
UNWIND all_rules AS rule
RETURN DISTINCT rule.code, rule.name, rule.severity, rule.logic
ORDER BY rule.severity DESC
```

### 11.3 Semantic Search (pgvector)

```sql
-- Find similar products
SELECT entity_id, 1 - (embedding <=> $query_vector) AS similarity
FROM embeddings
WHERE entity_type = 'product' AND tenant_id = $tenantId
ORDER BY embedding <=> $query_vector
LIMIT 10;
```

---

## 12. Migration from v1

### 12.1 Strategy: Wipe & Rebuild

Since we are pre-launch with no production data:

1. **Delete old migration**: `rm packages/database/src/migrations/Migration20260122000000.ts`
2. **Create new migrations**: One for GSR, one for Tenant
3. **Reset database**: `pnpm db:reset`
4. **Run full seed**: `pnpm seed:full`

### 12.2 No Data Migration Required

- Existing schema-per-tenant data: Delete
- Existing GSR data: Re-seed with new structure
- Test data: Regenerate

---

## 13. Implementation Plan

### Phase 1: Database Setup (Week 1)

1. Create GSR database schema + MikroORM entities
2. Create Tenant database schema + MikroORM entities
3. Deploy Neo4j instance
4. Build Identity Ladder service

### Phase 2: GSR Seeding (Week 1-2)

1. CompTox foundation seeder (1.2M records)
2. Persona seeders (EC, CosIng, EFSA, TSCA, Biocides)
3. Classification seeders (CLP)
4. GSR → Neo4j sync

### Phase 3: Plugin System (Week 2)

1. Vertical registration system
2. Dynamic entity system
3. Handler registry
4. Workspace configuration

### Phase 4: Rules Engine (Week 2-3)

1. Regulation/Rule seeders
2. Rule → Neo4j sync
3. Compliance evaluation service
4. Evidence capture

### Phase 5: AI Infrastructure (Week 3)

1. Embedding pipeline
2. RAG document processing
3. AI interaction logging
4. Agent session management

### Phase 6: Integration (Week 4)

1. API endpoints
2. Query routing (PostgreSQL vs Neo4j vs pgvector)
3. End-to-end compliance flow
4. Documentation

---

## Appendix A: File Locations

| Component | Path |
|-----------|------|
| GSR Entities | `packages/gsr/src/entities/` |
| GSR Seeders | `packages/gsr/src/seeders/` |
| Tenant Entities | `packages/database/src/entities/` |
| Regulation Data | `packages/regulations/data/` |
| Regulation Seeders | `packages/regulations/src/seeders/` |
| Graph Sync | `packages/graph/src/sync/` |
| AI Infrastructure | `packages/ai/src/` |

## Appendix B: Technology Stack

| Layer | Technology |
|-------|------------|
| API | Hono (Node.js) |
| ORM | MikroORM |
| Relational DB | PostgreSQL 15 |
| Graph DB | Neo4j 5.x |
| Vector Store | pgvector |
| Auth | Clerk |
| File Storage | Cloudflare R2 |
| Event Bus | AWS EventBridge |
| Signing | walt.id |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-02 | Initial design from brainstorming session |

---

*This architecture transforms EuroComply from a "software project" into an "industry infrastructure project" - a Compliance Virtual Machine that treats regulatory rules as data, not code.*
