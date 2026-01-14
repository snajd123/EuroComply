# EuroComply Platform Architecture

**Document Version:** 1.5
**Date:** January 2026
**Status:** Core MVP Architecture - Additional features in planning (see Appendix D)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Multi-Tenancy Architecture](#3-multi-tenancy-architecture)
4. [Security Architecture](#4-security-architecture)
5. [Database Architecture](#5-database-architecture)
6. [Application Architecture](#6-application-architecture)
7. [Bulk DPP Generation](#7-bulk-dpp-generation)
8. [Infrastructure](#8-infrastructure)
9. [Scaling Plan](#9-scaling-plan)
   - 9.4 [Infrastructure Baseline](#94-infrastructure-baseline)
   - 9.5 [Auto-Scaling Layers](#95-auto-scaling-layers)
   - 9.6 [Manual Scaling Operations Guide](#96-manual-scaling-operations-guide)
10. [Operations](#10-operations)
11. [Implementation Guide](#11-implementation-guide)
12. [Standards & Data Formats](#12-standards--data-formats)

---

## 1. Executive Summary

EuroComply is a B2B SaaS platform for EU Digital Product Passport (DPP) compliance under the ESPR regulation. The platform uses a Base Fee + Per-DPP pricing model, with tiers from €79/month (Starter) to custom Enterprise/Platform pricing.

### Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tenant Isolation | Schema per tenant | Security without dedicated infrastructure cost |
| Database | PostgreSQL + DynamoDB | Relational for products, key-value for billions of items |
| Encryption | Per-tenant KMS keys | Data remains encrypted even if database is compromised |
| Compute | ECS Fargate | No server management, pay-per-use, auto-scaling |
| Event Processing | Transactional Outbox + SQS | Guaranteed delivery, exactly-once processing |
| Bulk Generation | Fan-out + auto-scaling workers | 1M DPPs in 10 minutes |
| CDN | Cloudflare | DDoS protection, zero egress from R2 |

### Cost Summary

| Stage | Customers | Infrastructure | Base Revenue | Est. DPP Revenue | Gross Margin |
|-------|-----------|----------------|--------------|------------------|--------------|
| Launch | 0-10 | €158/month | €1,990 | €500 | 85-90% |
| Growth | 50-200 | €200-400/month | €9,950-39,800 | €5,000-50,000 | 88-92% |
| Scale | 200-500 | €600-1,200/month | €79,600-199,000 | €100K-500K | 89-92% |

### Realistic Gross Margin by Tier

| Tier | Base Fee | Infra | Payment (3%) | API/Support | Total COGS | Base Margin | DPP Margin |
|------|----------|-------|--------------|-------------|------------|-------------|------------|
| Starter (€79) | €79/mo | €3 | €2.50 | €5 | €10.50 | **87%** | **99%** |
| Growth (€199) | €199/mo | €5 | €6 | €10 | €21 | **89%** | **98%** |
| Scale (€599) | €599/mo | €15 | €18 | €25 | €58 | **90%** | **95%** |
| Enterprise (€1,499) | €1,499/mo | €100 | €45 | €75 | €220 | **85%** | **87%** |
| Platform (Custom) | Custom | €400+ | Custom | Custom | Custom | **70-80%** | **0-67%** |

**Cost Components:**
- **Infrastructure**: AWS (RDS, ECS, ElastiCache) + Cloudflare (R2, Workers)
- **Payment processing**: Stripe fees (~2.9% + €0.25 per transaction)
- **API costs**: walt.id credentials, Anthropic AI import, GLEIF/VIES verification
- **Support allocation**: Per-customer support cost estimate
- **Per-DPP cost**: ~€0.001 (R2 storage + compute for 10-year hosting)

Note: Per-DPP margins are extremely high (87-99%) except at Platform tier where volume discounts approach cost.

---

## 2. System Overview

### 2.1 Product Structure

EuroComply consists of four integrated workspaces:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EUROCOMPLY PLATFORM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   DESIGN    │  │ OPERATIONS  │  │  MARKETING  │  │ COMPLIANCE  │        │
│  │             │  │             │  │             │  │             │        │
│  │ • Products  │  │ • Items     │  │ • Content   │  │ • DPP Gen   │        │
│  │ • BOM       │  │ • EPCIS     │  │ • Assets    │  │ • Audit     │        │
│  │ • Versions  │  │ • Tracking  │  │ • Locales   │  │ • Export    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Pricing Tiers

| Tier | Base Fee | DPP Price | Volume Discounts | Target Customer |
|------|----------|-----------|------------------|-----------------|
| Starter | €79/month | €0.10/DPP | 10K+: €0.08 | Micro-businesses, testing |
| Growth | €199/month | €0.05/DPP | 50K+: €0.03, 100K+: €0.02 | Small brands |
| Scale | €599/month | €0.02/DPP | 500K+: €0.01, 1M+: €0.008 | Mid-market manufacturers |
| Enterprise | €1,499/month | €0.008/DPP | 5M+: €0.005, 10M+: €0.003 | Large brands |
| Platform | Custom | €0.001-0.003 | Negotiated | Fortune 500 |

*All tiers include unlimited storage for products, images, PDFs, and all workspace data.*

All tiers include unlimited products/SKUs, unlimited users, and unlimited storage. Per-DPP pricing includes EPCIS events and 10-year hosting.

### 2.3 Traffic Patterns

```
WRITE PATH (Low Volume, High Value)
───────────────────────────────────
Users → API → Database
• ~1,000 requests/day per tenant
• CRUD operations on products, passports
• Authenticated, rate-limited

BULK GENERATION PATH (High Volume, Async)
─────────────────────────────────────────
User Request → Chunker → Worker Fleet → DynamoDB + R2
• Millions of items per batch possible
• Auto-scaling workers (0-20)
• Progress via WebSocket

READ PATH (High Volume, Low Cost)
─────────────────────────────────
QR Scan → CDN → Static DPP (Pre-Generated)
• Millions of scans/day potential
• 99%+ cache hit rate
• Public, no authentication
• Served from Cloudflare edge
```

---

## 3. Multi-Tenancy Architecture

### 3.1 Design Principle

**Security is not a premium feature.** Every pricing tier receives genuine data isolation. The difference between tiers is performance and features, not security.

| Tier | Isolation Model | Max Breach Impact |
|------|-----------------|-------------------|
| Starter | Schema + Cell | 1 tenant |
| Growth | Schema + Cell | 1 tenant |
| Scale | Schema + Cell + Credentials | 1 tenant |
| Enterprise | Dedicated Instance | 1 tenant |
| Platform | Dedicated Cluster | 1 tenant |

### 3.2 Schema Isolation Model

Each tenant receives a dedicated PostgreSQL schema within a shared database cell:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            GROWTH CELL 1                                     │
│                         db.t4g.small Multi-AZ                                │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ schema_tenant_  │  │ schema_tenant_  │  │ schema_tenant_  │             │
│  │ abc123          │  │ def456          │  │ ghi789          │   • • •     │
│  │                 │  │                 │  │                 │             │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │             │
│  │ │ products    │ │  │ │ products    │ │  │ │ products    │ │             │
│  │ │ passports   │ │  │ │ passports   │ │  │ │ passports   │ │             │
│  │ │ versions    │ │  │ │ versions    │ │  │ │ versions    │ │             │
│  │ │ attestations│ │  │ │ attestations│ │  │ │ attestations│ │             │
│  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  Cell Credentials: growth_cell_1_user                                       │
│  Tenants per Cell: ~200                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Connection Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Request │────▶│    Tenant    │────▶│  Get Cell    │────▶│   Set Schema │
│  + JWT   │     │    Router    │     │   Pool       │     │   Context    │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                        │                                          │
                        ▼                                          ▼
                 ┌──────────────┐                          ┌──────────────┐
                 │ Config DB    │                          │ SET search_  │
                 │ org → cell   │                          │ path = schema│
                 │ org → schema │                          │ + RLS context│
                 └──────────────┘                          └──────────────┘
```

### 3.4 Tenant Router Implementation

```typescript
class TenantRouter {
  private cellPools: Map<string, Pool> = new Map();

  async getConnection(organizationId: string): Promise<TenantConnection> {
    const config = await this.getTenantConfig(organizationId);
    const pool = await this.getCellPool(config.cellId);
    const client = await pool.connect();

    // Set schema context - PRIMARY SECURITY CONTROL
    await client.query(`SET search_path = ${config.schemaName}, public`);
    
    // Set RLS context - DEFENSE IN DEPTH
    await client.query('SET app.current_org = $1', [organizationId]);

    return {
      client,
      release: async () => {
        await client.query('RESET ALL');
        await client.query('DISCARD ALL');
        client.release();
      },
    };
  }
}
```

### 3.5 Tenant Provisioning

On signup, the system automatically:

1. Assigns tenant to a cell with capacity
2. Creates dedicated schema
3. Generates per-tenant encryption key (DEK)
4. Runs schema migrations
5. Registers configuration in routing database

```sql
-- Executed during tenant provisioning
CREATE SCHEMA schema_tenant_abc123;
SET search_path = schema_tenant_abc123;

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    gtin TEXT,
    sku TEXT,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT org_check CHECK (organization_id = 'abc123-...'::uuid)
);

-- RLS as defense-in-depth
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
    USING (organization_id = current_setting('app.current_org')::uuid);
```

### 3.6 Configuration Database Schema

The platform maintains a central configuration database (`schema_config`) in each cell that stores tenant routing and metadata. This is separate from tenant data.

```sql
-- Configuration schema (one per cell, stores metadata for all tenants in cell)
CREATE SCHEMA schema_config;
SET search_path = schema_config;

-- Tenant registry: which organization is in which schema
CREATE TABLE tenants (
    organization_id UUID PRIMARY KEY,
    schema_name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'migrating', 'deleted')),
    tier TEXT NOT NULL CHECK (tier IN ('starter', 'growth', 'scale', 'enterprise', 'platform')),
    dek_key_id TEXT NOT NULL,  -- KMS key ID for tenant DEK
    db_credentials_arn TEXT,   -- Secrets Manager ARN for per-schema credentials (Scale+)
    metadata JSONB DEFAULT '{}'
);

-- Cell health and capacity tracking
CREATE TABLE cell_metadata (
    cell_id TEXT PRIMARY KEY,
    region TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    max_tenants INTEGER DEFAULT 200,
    current_tenants INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'draining', 'quarantined')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant activity metrics (for capacity planning)
CREATE TABLE tenant_metrics (
    organization_id UUID REFERENCES tenants(organization_id),
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    product_count INTEGER,
    passport_count INTEGER,
    storage_bytes BIGINT,
    api_calls_24h INTEGER,
    PRIMARY KEY (organization_id, recorded_at)
);

-- Indexes for routing performance
CREATE INDEX idx_tenants_schema ON tenants(schema_name);
CREATE INDEX idx_tenants_status ON tenants(status) WHERE status = 'active';
```

**Cross-Cell Routing Database:**

For multi-cell deployments, a global routing table exists in AWS DynamoDB:

```typescript
// DynamoDB table: eurocomply-routing
interface TenantRouting {
  pk: string;           // ORG#{organizationId}
  sk: string;           // ROUTING
  cellId: string;       // growth-cell-1, scale-cell-1, etc.
  region: string;       // eu-central-1
  schemaName: string;   // schema_tenant_abc123
  status: 'active' | 'migrating' | 'suspended';
  tier: 'starter' | 'growth' | 'scale' | 'enterprise' | 'platform';
  updatedAt: string;    // ISO timestamp
}

// Query pattern: O(1) lookup
const routing = await dynamodb.get({
  TableName: 'eurocomply-routing',
  Key: { pk: `ORG#${organizationId}`, sk: 'ROUTING' }
});
```

**Tenant Router Cache:**

Redis caches routing information for fast lookups:

```typescript
// Cache key: tenant:routing:{organizationId}
// TTL: 5 minutes (short to handle migrations)
interface CachedRouting {
  cellId: string;
  schemaName: string;
  endpoint: string;
  dekKeyId: string;
}
```

---

## 4. Security Architecture

### 4.1 Defense in Depth

Seven layers of security protect tenant data:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 1: Edge Protection (Cloudflare)                                        │
│ • DDoS mitigation, WAF rules, Bot protection, TLS termination               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 2: Authentication (JWT + API Keys)                                     │
│ • Short-lived access tokens, Refresh token rotation, API key scoping        │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 3: Application Isolation                                               │
│ • Organization ID on every request, Middleware validates access             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 4: Schema Isolation                                                    │
│ • Dedicated PostgreSQL schema per tenant, SET search_path limits visibility │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 5: Row-Level Security                                                  │
│ • PostgreSQL RLS policies, Defense against SQL injection                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 6: Cell Isolation                                                      │
│ • Tenants grouped into separate RDS instances, ~200 tenants per cell max    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 7: Encryption                                                          │
│ • TLS in transit, AES-256 at rest, Per-tenant DEKs for sensitive fields     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Encryption Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENCRYPTION HIERARCHY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        ┌─────────────────────┐                              │
│                        │   AWS KMS           │                              │
│                        │   Master Key (CMK)  │                              │
│                        └──────────┬──────────┘                              │
│                                   │                                          │
│              ┌────────────────────┼────────────────────┐                    │
│              ▼                    ▼                    ▼                    │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│   │ Tenant DEK      │  │ Tenant DEK      │  │ Tenant DEK      │           │
│   │ (tenant_001)    │  │ (tenant_002)    │  │ (tenant_003)    │           │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │
│            │                    │                    │                      │
│            ▼                    ▼                    ▼                      │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│   │ Encrypted:      │  │ Encrypted:      │  │ Encrypted:      │           │
│   │ • BOM data      │  │ • BOM data      │  │ • BOM data      │           │
│   │ • Cost prices   │  │ • Cost prices   │  │ • Cost prices   │           │
│   │ • Supplier info │  │ • Supplier info │  │ • Supplier info │           │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘           │
│                                                                              │
│   On tenant deletion: DEK is revoked → data becomes permanently unreadable │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Attack Scenarios

| Attack Vector | Mitigation | Impact if Successful |
|---------------|------------|----------------------|
| SQL Injection | Parameterized queries + RLS | 1 tenant max |
| Stolen JWT | Short expiry + refresh rotation | 1 user session |
| Cell credential leak | Per-schema credentials + rotation | 1 tenant max |
| Application bug | RLS + schema isolation | 1 tenant max |
| Database snapshot theft | Per-tenant encryption | Data unreadable |
| Complete cell compromise | Quarantine + migration | ~200 tenants, minutes to recover |
| Noisy neighbor | Resource quotas + throttling | 1 tenant throttled |

> **Cell-Level Hardening:** For detailed implementation of per-schema credentials, resource quotas, anomaly detection, and cell quarantine procedures, see [SECURITY.md §13.10](./docs/SECURITY.md#1310-cell-level-hardening).

---

## 5. Database Architecture

### 5.1 Polyglot Persistence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA STORAGE STRATEGY                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         PostgreSQL                                    │   │
│  │                                                                       │   │
│  │  Organizations    Users    Products    Passports    Attestations     │   │
│  │       ~5K         ~20K      ~500K        ~1M           ~2M           │   │
│  │                                                                       │   │
│  │  Why: Relational integrity, complex queries, ACID transactions       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          DynamoDB                                     │   │
│  │                                                                       │   │
│  │  Item Instances (serialized products with DPPs)                      │   │
│  │       10B+ records potential                                         │   │
│  │                                                                       │   │
│  │  Why: Unlimited scale, single-digit ms latency, key-value access    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Cloudflare R2                                  │   │
│  │                                                                       │   │
│  │  Static DPP files (HTML/JSON)                                        │   │
│  │       100M+ files potential                                          │   │
│  │                                                                       │   │
│  │  Why: Zero egress cost, global CDN, S3-compatible                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 PostgreSQL Schema

```sql
-- Core tables (created per tenant schema)

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    gtin TEXT,
    sku TEXT,
    category TEXT,
    product_type TEXT,
    status TEXT DEFAULT 'draft' 
        CHECK (status IN ('draft', 'active', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);

CREATE TABLE passports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'draft'
        CHECK (status IN ('draft', 'review', 'published', 'archived')),
    dpp_data JSONB,
    template_id TEXT,
    static_url_base TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);

CREATE TABLE batch_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    passport_id UUID NOT NULL REFERENCES passports(id),
    type TEXT NOT NULL CHECK (type IN ('generate_dpps', 'import_items', 'export')),
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    total_items INTEGER NOT NULL,
    processed_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    error_log JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);

-- Indexes
CREATE INDEX idx_products_gtin ON products(gtin) WHERE gtin IS NOT NULL;
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_passports_product ON passports(product_id);
CREATE INDEX idx_passports_status ON passports(status);
CREATE INDEX idx_batch_jobs_status ON batch_jobs(status) WHERE status IN ('pending', 'processing');
```

### 5.3 DynamoDB Schema

```
Table: eurocomply-items-{environment}

Primary Key:
  pk (String): ORG#${org_id}#PASSPORT#${passport_id}
  sk (String): SERIAL#${serial_number}

Attributes:
  organizationId: String
  passportId: String
  serialNumber: String
  productionDate: String (ISO 8601)
  batchNumber: String
  facilityId: String
  status: String (active | recalled | destroyed)
  dppUrl: String
  dppGenerated: Boolean
  createdAt: String (ISO 8601)
  lastScannedAt: String (ISO 8601)
  scanCount: Number

Global Secondary Index (GSI1):
  gsi1pk: ORG#${org_id}
  gsi1sk: CREATED#${timestamp}#SERIAL#${serial}
  
  Use: Time-range queries, recent items

Access Patterns:
  1. Get item by serial:     Query pk=ORG#X#PASSPORT#Y, sk=SERIAL#Z
  2. List items by passport: Query pk=ORG#X#PASSPORT#Y
  3. Recent items by org:    Query GSI1 pk=ORG#X, sk begins_with CREATED#
  4. Batch lookup:           BatchGetItem with multiple keys
```

---

## 6. Application Architecture

### 6.1 Service Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          APPLICATION SERVICES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         API SERVICE                                  │    │
│  │  • HTTP REST endpoints         • Rate limiting                      │    │
│  │  • Authentication middleware   • Request validation                 │    │
│  │  • Tenant context injection                                         │    │
│  │  Runs: 2 Fargate tasks (high availability)                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       WORKER SERVICE                                 │    │
│  │  • Consumes events from SQS    • Webhook delivery                   │    │
│  │  • Individual DPP generation   • Report generation                  │    │
│  │  Runs: 1 Fargate task                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     OUTBOX PROCESSOR                                 │    │
│  │  • Polls event_outbox table    • Handles retries                    │    │
│  │  • Publishes events to SQS     • Dead-letter handling               │    │
│  │  Runs: 1 Fargate task                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                   BULK WORKER SERVICE (Auto-scaling)                 │    │
│  │  • Processes bulk generation chunks                                 │    │
│  │  • Parallel DynamoDB writes    • Parallel R2 uploads               │    │
│  │  • Progress reporting                                               │    │
│  │  Runs: 0-20 Fargate tasks (scales based on queue depth)            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                   DPP EDGE SERVICE (Cloudflare Worker)               │    │
│  │  • Serves static DPPs from R2                                       │    │
│  │  • Static DPP serving from R2 (zero egress)                         │    │
│  │  • Edge caching (<50ms global)                                     │    │
│  │  Runs: Cloudflare edge network                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Event-Driven Architecture

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│   API    │────▶│ Business │────▶│  Event   │────▶│  Outbox  │────▶│   SQS    │
│ Request  │     │  Logic   │     │  Outbox  │     │ Processor│     │  Queue   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                                                   │
                      │           SAME TRANSACTION                        │
                      ▼                                                   ▼
                ┌──────────┐                                        ┌──────────┐
                │ Database │                                        │  Worker  │
                │  Write   │                                        │ Service  │
                └──────────┘                                        └──────────┘
```

### 6.3 API Structure

```
/api/v1
├── /auth
│   ├── POST /login
│   ├── POST /logout
│   └── POST /refresh
│
├── /products
│   ├── GET    /                 # List products
│   ├── POST   /                 # Create product
│   ├── GET    /:id              # Get product
│   ├── PATCH  /:id              # Update product
│   └── DELETE /:id              # Archive product
│
├── /passports
│   ├── GET    /                 # List passports
│   ├── POST   /                 # Create passport
│   ├── GET    /:id              # Get passport
│   ├── PATCH  /:id              # Update passport
│   ├── POST   /:id/publish      # Publish passport
│   ├── GET    /:id/preview      # Preview DPP
│   └── POST   /:id/generate-batch  # Bulk generate DPPs
│
├── /items
│   ├── GET    /                 # List items
│   ├── POST   /                 # Create item
│   ├── POST   /batch            # Batch create items
│   └── GET    /:serial          # Get item by serial
│
├── /batch-jobs
│   ├── GET    /                 # List batch jobs
│   ├── GET    /:id              # Get job status
│   └── GET    /:id/progress     # WebSocket progress
│
└── /webhooks
    ├── GET    /                 # List webhooks
    ├── POST   /                 # Create webhook
    └── DELETE /:id              # Delete webhook
```

---

## 7. Bulk DPP Generation

### 7.1 The Challenge

Manufacturers produce items at massive scale:

| Industry | Typical Batch Size | DPPs Needed |
|----------|-------------------|-------------|
| Luxury goods | 1,000 | Minutes |
| Apparel | 50,000 | Minutes |
| Electronics | 500,000 | Under 1 hour |
| Consumer goods | 1,000,000+ | Under 1 hour |
| High-volume manufacturing | 10,000,000+ | Few hours |

A sequential approach (100ms per DPP) would take 27+ hours for 1 million items. This is unacceptable.

### 7.2 Fan-Out Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BULK DPP GENERATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐     ┌──────────────┐     ┌──────────────────────────────────┐ │
│  │  User    │────▶│  API         │────▶│  Batch Job Record                │ │
│  │  Request │     │  (accepts)   │     │  status: pending                 │ │
│  └──────────┘     └──────────────┘     │  total: 1,000,000                │ │
│       │                                 │  processed: 0                    │ │
│       │                                 └──────────────────────────────────┘ │
│       │                                              │                       │
│       │         ┌────────────────────────────────────┘                       │
│       │         ▼                                                            │
│       │   ┌──────────────┐                                                   │
│       │   │   Chunker    │  Splits into 1,000 chunks of 1,000 items         │
│       │   │   Service    │                                                   │
│       │   └──────┬───────┘                                                   │
│       │          │                                                           │
│       │          ▼                                                           │
│       │   ┌──────────────────────────────────────────────────────────────┐  │
│       │   │                    SQS FIFO QUEUE                            │  │
│       │   │                                                              │  │
│       │   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │  │
│       │   │  │Chunk 1  │ │Chunk 2  │ │Chunk 3  │ │  ...    │  (1,000)  │  │
│       │   │  │1-1000   │ │1001-2000│ │2001-3000│ │         │           │  │
│       │   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │  │
│       │   │                                                              │  │
│       │   └──────────────────────────┬───────────────────────────────────┘  │
│       │                              │                                       │
│       │                              ▼                                       │
│       │   ┌──────────────────────────────────────────────────────────────┐  │
│       │   │              AUTO-SCALING WORKER FLEET                       │  │
│       │   │                     (0-20 tasks)                             │  │
│       │   │                                                              │  │
│       │   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │  │
│       │   │  │ Worker 1 │ │ Worker 2 │ │ Worker 3 │ │ Worker N │       │  │
│       │   │  │          │ │          │ │          │ │          │       │  │
│       │   │  │ 1K items │ │ 1K items │ │ 1K items │ │ 1K items │       │  │
│       │   │  │ ~5 sec   │ │ ~5 sec   │ │ ~5 sec   │ │ ~5 sec   │       │  │
│       │   │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │  │
│       │   │       │            │            │            │              │  │
│       │   └───────┼────────────┼────────────┼────────────┼──────────────┘  │
│       │           │            │            │            │                  │
│       │           ▼            ▼            ▼            ▼                  │
│       │   ┌──────────────────────────────────────────────────────────────┐  │
│       │   │                    PARALLEL WRITES                           │  │
│       │   │                                                              │  │
│       │   │  ┌─────────────────────────┐  ┌─────────────┐               │  │
│       │   │  │       DynamoDB          │  │   Redis     │               │  │
│       │   │  │   BatchWrite Items      │  │  Progress   │               │  │
│       │   │  │     (25/batch)          │  │  Counter    │               │  │
│       │   │  └─────────────────────────┘  └─────────────┘               │  │
│       │   │                                                              │  │
│       │   │  Note: DPPs rendered on-demand from template + item record  │  │
│       │   │  (No per-item R2 uploads needed)                            │  │
│       │   │                                                              │  │
│       │   └──────────────────────────────────────────────────────────────┘  │
│       │                                                                      │
│       │                              │                                       │
│       ▼                              ▼                                       │
│  ┌──────────┐                 ┌──────────────┐                              │
│  │ WebSocket│◀────────────────│   Progress   │                              │
│  │ Progress │   Real-time     │   (Redis)    │                              │
│  │ Updates  │                 │              │                              │
│  └──────────┘                 └──────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Performance Targets

With deduplicated storage (DynamoDB writes only, no per-item R2 uploads):

| Batch Size | Workers | Chunks | Time | Cost |
|------------|---------|--------|------|------|
| 1,000 | 1 | 1 | 1 sec | $0.001 |
| 10,000 | 2 | 10 | 6 sec | $0.01 |
| 100,000 | 5 | 100 | 25 sec | $0.10 |
| 1,000,000 | 10 | 1,000 | 2 min | $1 |
| 10,000,000 | 20 | 10,000 | 10 min | $10 |

*Note: ~5x faster than pre-generated approach due to elimination of per-item R2 uploads.*

### 7.4 Chunk Processing

Each worker processes a 1,000-item chunk. With deduplicated storage, workers only write item records to DynamoDB (no individual R2 uploads needed):

```
PER CHUNK (1,000 items):
────────────────────────

1. Validate serial numbers:              50ms
2. Build item records in memory:         200ms
3. Batch write to DynamoDB:              800ms (40 batches × 25 items)
4. Update progress in Redis:             50ms
───────────────────────────────────────────────
Total per chunk:                         ~1.1 seconds

TEMPLATE UPLOAD (once per passport, not per chunk):
───────────────────────────────────────────────────
Upload template.html + images to R2:     500ms (one-time)
```

**Note:** With deduplicated storage, bulk creation is ~5x faster because we only write small item records to DynamoDB, not large DPP files to R2. DPPs are rendered on-demand when consumers scan QR codes.

### 7.5 Idempotency

Bulk processing must handle worker crashes and message redelivery gracefully. Every operation is idempotent.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         IDEMPOTENCY STRATEGY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SCENARIO: Worker crashes after DynamoDB write, before R2 upload            │
│  SQS redelivers message to new worker                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DYNAMODB: Idempotent by design                                      │   │
│  │                                                                      │   │
│  │ • Primary key: pk + sk (ORG#X#PASSPORT#Y + SERIAL#Z)               │   │
│  │ • PutItem with same key = overwrite (not duplicate)                │   │
│  │ • Use ConditionExpression for "insert only if not exists"          │   │
│  │   or accept overwrites (data is identical anyway)                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ R2 TEMPLATE: One-time upload per passport                           │   │
│  │                                                                      │   │
│  │ • Key: templates/{passportId}/template.html                        │   │
│  │ • Uploaded once when passport is published (not per item)          │   │
│  │ • Individual item DPPs are rendered on-demand, not pre-stored      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ REDIS PROGRESS: Use atomic increment with chunk tracking            │   │
│  │                                                                      │   │
│  │ • Track processed chunks, not items: SADD job:{id}:chunks {chunkId}│   │
│  │ • Before processing: SISMEMBER to check if already done            │   │
│  │ • Progress = SCARD(chunks) × chunk_size                            │   │
│  │ • Prevents double-counting on redelivery                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
class BulkDPPWorker {
  async processChunk(chunk: ChunkMessage): Promise<void> {
    const chunkKey = `${chunk.jobId}:${chunk.chunkIndex}`;
    
    // 1. Check if chunk already processed (idempotency check)
    const alreadyProcessed = await this.redis.sismember(
      `job:${chunk.jobId}:completed_chunks`,
      chunk.chunkIndex.toString()
    );
    
    if (alreadyProcessed) {
      console.log(`Chunk ${chunkKey} already processed, skipping`);
      return; // Safe to skip - already done
    }
    
    // 2. Process chunk (all operations are idempotent)
    const serials = await this.getSerialNumbers(chunk);
    const itemRecords = this.buildItemRecords(chunk.passportId, serials, chunk);

    // 3. Write item records to DynamoDB (idempotent: same key = overwrite)
    // Note: No R2 upload needed - DPPs are rendered on-demand from template + item record
    await this.batchWriteDynamoDB(chunk.organizationId, itemRecords);
    
    // 5. Mark chunk as completed (atomic)
    await this.redis.sadd(
      `job:${chunk.jobId}:completed_chunks`,
      chunk.chunkIndex.toString()
    );
    
    // 6. Update progress counter
    const completedCount = await this.redis.scard(
      `job:${chunk.jobId}:completed_chunks`
    );
    await this.redis.set(
      `job:${chunk.jobId}:progress`,
      completedCount * chunk.chunkSize
    );
  }
}
```

### 7.6 Batch Job API

```typescript
// POST /api/v1/passports/:id/generate-batch
interface BatchGenerateRequest {
  // Option 1: Direct serial numbers (small batches)
  serialNumbers?: string[];
  
  // Option 2: Pattern-based generation (large batches)
  serialPattern?: {
    prefix: string;      // "SN-2026-"
    start: number;       // 1
    end: number;         // 1000000
    padding: number;     // 7 → "SN-2026-0000001"
  };
  
  // Option 3: File-based (very large batches)
  serialSource?: {
    type: 's3' | 'url';
    location: string;    // S3 URI or HTTPS URL to CSV
  };
}

// Response (immediate, async processing)
interface BatchGenerateResponse {
  jobId: string;
  status: 'accepted';
  totalItems: number;
  estimatedMinutes: number;
  progressUrl: string;   // WebSocket endpoint
}
```

### 7.7 Deduplicated Storage + On-Demand Rendering

DPPs use **deduplicated storage** to handle billions of items efficiently over 10+ years:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DEDUPLICATED DPP ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  KEY INSIGHT: 90%+ of DPP content is duplicate static data                  │
│  ─────────────────────────────────────────────────────────                   │
│  2M shoes of same product = 2M copies of identical images, materials, etc.  │
│  Solution: Store static data ONCE, reference from items                      │
│                                                                              │
│  STORAGE ARCHITECTURE                                                        │
│  ────────────────────                                                        │
│                                                                              │
│  PRODUCT TEMPLATE (R2 - stored ONCE per product type)                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  templates/{passportId}/                                                │ │
│  │  ├── template.html     (DPP with {{serial}}, {{batch}} placeholders)   │ │
│  │  ├── image_main.webp   (~15KB product image)                           │ │
│  │  └── image_detail.webp                                                  │ │
│  │                                                                          │ │
│  │  Size: ~30KB per product type                                           │ │
│  │  Cache: 30 days at Cloudflare edge (immutable)                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ITEM RECORD (DynamoDB - stored per serial number)                          │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  {                                                                      │ │
│  │    pk: "ORG#{orgId}#PASSPORT#{passportId}",                            │ │
│  │    sk: "SERIAL#{serialNumber}",                                        │ │
│  │    batchNumber, productionDate, facilityId, status,                    │ │
│  │    epcisEventIds: ["evt_1", "evt_2"]  // References, not embedded      │ │
│  │  }                                                                      │ │
│  │                                                                          │ │
│  │  Size: ~500 bytes per item                                              │ │
│  │  Access: Always instant (DynamoDB on-demand)                           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  STORAGE COMPARISON (2M shoes example)                                       │
│  ─────────────────────────────────────                                       │
│  │ Approach        │ Static Data      │ Dynamic Data    │ Total    │       │
│  │─────────────────│──────────────────│─────────────────│──────────│       │
│  │ Naive (files)   │ 2M × 30KB = 60GB │ -               │ 60GB     │       │
│  │ Deduplicated    │ 1 × 30KB = 30KB  │ 2M × 500B = 1GB │ ~1GB     │       │
│  │ Savings         │                  │                 │ 98%      │       │
│                                                                              │
│  10-YEAR PROJECTION (10B items)                                             │
│  ──────────────────────────────                                              │
│  │ Approach       │ Storage │ Cost (10yr) │                                │
│  │────────────────│─────────│─────────────│                                │
│  │ Naive          │ 300TB   │ ~$54M       │                                │
│  │ Deduplicated   │ ~5TB    │ ~$600K      │                                │
│  │ Savings        │ 98%     │ $53.4M      │                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ON-DEMAND RENDERING FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BATCH CREATION (Fast - DynamoDB only)                                      │
│  ─────────────────────────────────────                                       │
│  1. User submits 1M serial numbers                                          │
│  2. Upload product template to R2 (ONCE): 50ms                              │
│  3. Fan-out to 20 workers to create item records                            │
│  4. Batch write to DynamoDB: ~2 minutes for 1M records                      │
│  5. Job completes, items are "ready to scan"                                │
│  Total time: ~2 minutes (5x faster than file generation)                    │
│                                                                              │
│  CONSUMER SCAN (On-Demand Merge)                                            │
│  ────────────────────────────────                                            │
│  1. Consumer scans QR code                                                  │
│     https://dpp.eurocomply.eu/dpp/{passportId}/{serial}                     │
│                                                                              │
│  2. Cloudflare Worker receives request                                      │
│                                                                              │
│       ┌─────────────────────────────────────────────────────────────┐       │
│       │                                                              │       │
│       │   ┌──────────────┐         ┌──────────────┐                │       │
│       │   │  Fetch from  │         │  Fetch from  │                │       │
│       │   │  R2 (cached) │         │  API/DynamoDB│                │       │
│       │   │              │         │              │                │       │
│       │   │  Template    │         │  Item Record │                │       │
│       │   │  (~30KB)     │         │  (~500 bytes)│                │       │
│       │   └──────┬───────┘         └──────┬───────┘                │       │
│       │          │                        │                         │       │
│       │          └────────────┬───────────┘                         │       │
│       │                       │                                     │       │
│       │                       ▼                                     │       │
│       │              ┌────────────────┐                            │       │
│       │              │  Merge & Render │                           │       │
│       │              │  template.replace({{serial}}, item.serial)  │       │
│       │              └────────┬───────┘                            │       │
│       │                       │                                     │       │
│       │                       ▼                                     │       │
│       │              Return rendered DPP                            │       │
│       │              (<50ms total)                                  │       │
│       │                                                              │       │
│       └─────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  BENEFITS:                                                                  │
│  • 99% storage reduction (templates stored once, not per-item)             │
│  • Zero AWS egress cost (templates served from Cloudflare R2)              │
│  • Ultra-low latency: <50ms (template cached, DynamoDB instant)            │
│  • Template updates propagate to ALL items immediately                      │
│  • EPCIS events always fresh (queried on-demand, not stale embedded copy)  │
│  • No archival delays - all DPPs served instantly                          │
│                                                                              │
│  COST COMPARISON (10B items over 10 years):                                 │
│  • Naive (pre-generated files): ~$54M ❌                                    │
│  • Deduplicated + on-demand: ~$600K ✅                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.8 Cloudflare Worker for On-Demand DPP Rendering

```typescript
// Cloudflare Worker - renders DPPs on-demand by merging template + item data
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/\/dpp\/([^/]+)(?:\/([^/]+))?/);

    if (!match) {
      return new Response('Not Found', { status: 404 });
    }

    const [, passportId, serialNumber] = match;

    // 1. Fetch product template from R2 (heavily cached at edge)
    const templateKey = `templates/${passportId}/template.html`;
    const templateObject = await env.R2_BUCKET.get(templateKey);

    if (!templateObject) {
      return new Response('DPP template not found', { status: 404 });
    }

    let templateHtml = await templateObject.text();

    // 2. For product-level DPP (no serial), return template as-is
    if (!serialNumber) {
      return new Response(templateHtml, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=2592000, immutable', // 30 days
          'X-DPP-Source': 'template-only',
        },
      });
    }

    // 3. Fetch item record from API (DynamoDB via API Gateway)
    const itemResponse = await fetch(
      `${env.API_ENDPOINT}/v1/internal/items/${passportId}/${serialNumber}`,
      { headers: { 'X-Internal-Request': 'dpp-worker' } }
    );

    if (!itemResponse.ok) {
      return new Response('Item not found', { status: 404 });
    }

    const { data: item } = await itemResponse.json();

    // 4. Render DPP by merging template + item data
    const renderedDpp = templateHtml
      .replace(/\{\{serialNumber\}\}/g, escapeHtml(item.serialNumber))
      .replace(/\{\{batchNumber\}\}/g, escapeHtml(item.batchNumber))
      .replace(/\{\{productionDate\}\}/g, formatDate(item.productionDate))
      .replace(/\{\{status\}\}/g, item.status)
      .replace(/\{\{epcisLink\}\}/g, `/api/epcis/${passportId}/${serialNumber}`);

    // 5. Return rendered DPP (shorter cache - item status may change)
    return new Response(renderedDpp, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, max-age=300', // 5 min (item data may change)
        'X-DPP-Source': 'rendered',
        'X-DPP-Serial': serialNumber,
      },
    });
  },
};

function escapeHtml(str: string): string {
  return str?.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c] || c)) || '';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}
```

**Key Optimizations:**

1. **Deduplicated Storage**: Templates stored once, item records per-serial
2. **On-Demand Rendering**: Merge template + item data at scan time
3. **Zero AWS Egress**: Templates served from Cloudflare R2
4. **Template Caching**: 30-day cache for templates (immutable static content)
5. **Fresh Item Data**: Item records fetched from DynamoDB (always current)
6. **EPCIS Lazy Loading**: Events loaded on-demand via separate API call

### 7.9 Tier Limits for Bulk Operations

| Tier | Max Batch Size | API Rate Limit | DPP Price |
|------|----------------|----------------|-----------|
| Starter | 1,000 | 100/min | €0.10/DPP |
| Growth | 10,000 | 500/min | €0.05/DPP |
| Scale | 100,000 | 2,000/min | €0.02/DPP |
| Enterprise | 1,000,000 | 10,000/min | €0.008/DPP |
| Platform | 10,000,000 | Custom | €0.001-0.003/DPP |

Note: No monthly item/DPP limits - all tiers can issue unlimited DPPs at their per-DPP rate with volume discounts.

### 7.10 Cost Considerations for Bulk Operations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BULK OPERATION COST AWARENESS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. PLATFORM TIER INGESTION SPIKE                                           │
│  ────────────────────────────────────────────────────────────────────────   │
│                                                                              │
│  Scenario: Fortune 500 signs up, immediately issues 500M DPPs              │
│                                                                              │
│  Cost Analysis (at €0.001/DPP):                                             │
│  • 500M DPPs × €0.001 = €500,000 DPP revenue                               │
│  • AWS cost: 500M × $0.001 = $500 (R2 + compute)                           │
│  • DynamoDB: 500M × $0.00125/1K = $625                                     │
│  • Total COGS: ~$1,125 (0.2% of revenue!)                                  │
│                                                                              │
│  The per-DPP model makes bulk ingestion PROFITABLE, not a cost concern.    │
│                                                                              │
│  ────────────────────────────────────────────────────────────────────────   │
│                                                                              │
│  2. NAT INSTANCE BANDWIDTH LIMITS                                           │
│  ────────────────────────────────────────────────────────────────────────   │
│                                                                              │
│  Current: t4g.nano NAT Instance ($3/month)                                  │
│  • Network: Up to 5 Gbps (burstable)                                       │
│  • CPU: 2 vCPU (burstable, limited credits)                                │
│                                                                              │
│  Risk: Bulk workers fetching 100GB of assets will:                         │
│  • Exhaust CPU credits                                                      │
│  • Throttle network throughput                                             │
│  • Cause bulk job timeouts                                                 │
│                                                                              │
│  Trigger for Upgrade:                                                       │
│  • First Platform tier customer OR                                          │
│  • Bulk jobs processing >10GB/day consistently                             │
│                                                                              │
│  Upgrade Path:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ NAT Gateway: $33/month + $0.045/GB processed                        │   │
│  │                                                                     │   │
│  │ Cost at 100GB/month: $33 + $4.50 = $37.50                          │   │
│  │ Cost at 500GB/month: $33 + $22.50 = $55.50                         │   │
│  │ Cost at 1TB/month:   $33 + $45.00 = $78.00                         │   │
│  │                                                                     │   │
│  │ At €0.001/DPP, 1M DPPs/month = €1,000 revenue vs $78 NAT cost     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Per-DPP Margin Analysis:**

| Cost Component | AWS Cost per DPP | Customer Price Range | Margin Range |
|----------------|------------------|---------------------|--------------|
| R2 Storage (10KB, 10yr) | $0.00018 | - | - |
| Compute (Lambda/ECS) | $0.0001 | - | - |
| DynamoDB Write | $0.000001 | - | - |
| **Total Cost** | **~$0.001** | **€0.001-€0.10** | **0-99%** |

The per-DPP pricing provides healthy margins at all tiers. Even at the lowest Platform pricing (€0.001/DPP), costs are break-even, with the base subscription providing profitability.

---

## 8. Infrastructure

### 8.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLOUDFLARE                                      │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │     DNS     │  │     WAF     │  │     CDN     │  │     R2      │        │
│  │             │  │             │  │             │  │ (templates) │        │
│  │ eurocomply  │  │  DDoS       │  │  Edge       │  │             │        │
│  │ .eu         │  │  Protection │  │  Caching    │  │  Workers    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AWS VPC (eu-central-1)                               │
│                            10.0.0.0/16                                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    PUBLIC SUBNETS                                       │ │
│  │                 10.0.1.0/24, 10.0.2.0/24                                │ │
│  │                                                                         │ │
│  │  ┌─────────────────────────────┐  ┌─────────────────────────────┐     │ │
│  │  │    Application Load         │  │      NAT Instance           │     │ │
│  │  │    Balancer                 │  │      t4g.nano               │     │ │
│  │  └──────────────┬──────────────┘  └─────────────────────────────┘     │ │
│  └─────────────────┼──────────────────────────────────────────────────────┘ │
│                    │                                                         │
│  ┌─────────────────┼──────────────────────────────────────────────────────┐ │
│  │                 ▼           PRIVATE SUBNETS (App)                       │ │
│  │                          10.0.10.0/24, 10.0.11.0/24                     │ │
│  │                                                                         │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐ │ │
│  │  │                       ECS FARGATE CLUSTER                         │ │ │
│  │  │                                                                   │ │ │
│  │  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐           │ │ │
│  │  │  │  API Service  │ │ Worker Service│ │Outbox Processor│          │ │ │
│  │  │  │  2 tasks      │ │ 1 task        │ │ 1 task        │           │ │ │
│  │  │  │  (always on)  │ │ (always on)   │ │ (always on)   │           │ │ │
│  │  │  └───────────────┘ └───────────────┘ └───────────────┘           │ │ │
│  │  │                                                                   │ │ │
│  │  │  ┌───────────────────────────────────────────────────────────┐   │ │ │
│  │  │  │              BULK WORKER SERVICE (Auto-scaling)           │   │ │ │
│  │  │  │                                                           │   │ │ │
│  │  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐       ┌─────────┐  │   │ │ │
│  │  │  │  │Worker 1 │ │Worker 2 │ │Worker 3 │  ...  │Worker 20│  │   │ │ │
│  │  │  │  └─────────┘ └─────────┘ └─────────┘       └─────────┘  │   │ │ │
│  │  │  │                                                           │   │ │ │
│  │  │  │  Scales 0-20 based on SQS queue depth                    │   │ │ │
│  │  │  └───────────────────────────────────────────────────────────┘   │ │ │
│  │  │                                                                   │ │ │
│  │  └───────────────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    PRIVATE SUBNETS (Database)                           │ │
│  │                      10.0.20.0/24, 10.0.21.0/24                         │ │
│  │                                                                         │ │
│  │  ┌───────────────────────────────────┐  ┌─────────────────────────────┐│ │
│  │  │         GROWTH CELL 1             │  │       ELASTICACHE          ││ │
│  │  │                                   │  │                            ││ │
│  │  │  RDS PostgreSQL 15                │  │  Redis 7.0                 ││ │
│  │  │  db.t4g.small                     │  │  cache.t4g.micro           ││ │
│  │  │  Multi-AZ                         │  │                            ││ │
│  │  │                                   │  │  • Session cache           ││ │
│  │  │  ┌─────────────────────────────┐  │  │  • DEK cache               ││ │
│  │  │  │ schema_tenant_001          │  │  │  • Progress counters       ││ │
│  │  │  │ schema_tenant_002          │  │  │                            ││ │
│  │  │  │ schema_tenant_...          │  │  └─────────────────────────────┘│ │
│  │  │  │ schema_config              │  │                                 │ │
│  │  │  └─────────────────────────────┘  │                                 │ │
│  │  │  Capacity: ~200 tenants           │                                 │ │
│  │  └───────────────────────────────────┘                                 │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            AWS SERVERLESS                                    │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  DynamoDB   │  │  SQS FIFO   │  │  SQS FIFO   │  │    KMS      │        │
│  │             │  │  (Events)   │  │  (Bulk Gen) │  │             │        │
│  │  Items      │  │             │  │             │  │  Master key │        │
│  │  10B+ cap.  │  │  Standard   │  │  Auto-scale │  │  Tenant DEKs│        │
│  │             │  │  processing │  │  trigger    │  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Secrets    │  │     S3      │  │ CloudWatch  │  │    ECR      │        │
│  │  Manager    │  │  (Assets)   │  │  (Logs)     │  │  (Images)   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Monthly Cost Breakdown

| Component | Specification | Cost (USD) | Cost (EUR) |
|-----------|---------------|------------|------------|
| **Compute (Always On)** | | | |
| Fargate - API | 2 × (0.25 vCPU, 512 MB) | $18.02 | €17 |
| Fargate - Worker | 1 × (0.25 vCPU, 512 MB) | $9.01 | €8 |
| Fargate - Outbox | 1 × (0.25 vCPU, 512 MB) | $9.01 | €8 |
| **Compute (Auto-scaling)** | | | |
| Fargate - Bulk Workers | 0-20 × (0.5 vCPU, 1 GB) | $0-150 | €0-140 |
| **Database** | | | |
| RDS PostgreSQL | db.t4g.small Multi-AZ, 50 GB | $56.94 | €53 |
| ElastiCache Redis | cache.t4g.micro | $11.68 | €11 |
| **Networking** | | | |
| NAT Instance | t4g.nano | $3.07 | €3 |
| Application Load Balancer | Hourly + LCU | $18.43 | €17 |
| **Security** | | | |
| KMS | 1 CMK + API requests | $4.00 | €4 |
| Secrets Manager (base) | 5 platform secrets | $2.50 | €2 |
| Secrets Manager (tenants) | Per-tenant DB credentials (~$0.40/tenant) | Variable | See note¹ |
| **Storage & Queues** | | | |
| DynamoDB | On-demand | $1-50 | €1-45 |
| SQS (Events + Bulk) | FIFO queues | $1.00 | €1 |
| S3 | Assets bucket | $0.50 | €1 |
| ECR | Container images | $0.50 | €1 |
| **Monitoring** | | | |
| CloudWatch | Logs, metrics, alarms | $10.00 | €9 |
| **External** | | | |
| Cloudflare Pro | DNS, CDN, WAF, DDoS | $20.00 | €19 |
| Cloudflare Workers | DPP serving (static) | $5.00 | €5 |
| Cloudflare R2 | DPP file storage | $1-20 | €1-18 |
| | | | |
| **Base Total** | | **$171** | **€158** |
| **With Bulk Processing** | | **$171-350** | **€158-320** |

**Note:** Bulk worker costs scale to zero when not in use. Typical monthly addition: €20-50 for active usage.

**¹ Per-Tenant Secrets Manager Cost:** Each tenant requires a dedicated database credential stored in Secrets Manager for [Cell-Level Hardening](./docs/SECURITY.md#1310-cell-level-hardening). Cost scales with tenant count:

| Tenants per Cell | Secrets Manager Cost | Cost per Tenant |
|------------------|---------------------|-----------------|
| 50 (Scale cell) | ~$20/month | $0.40 |
| 200 (Growth cell) | ~$80/month | $0.40 |

At €129/tenant/month (Growth tier), the $0.40 secrets cost is <0.4% of revenue.

---

## 9. Scaling Plan

### 9.1 Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SCALING TIMELINE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Launch        50         100        200        300        500              │
│    │           │           │          │          │          │               │
│    ▼           ▼           ▼          ▼          ▼          ▼               │
│  ┌───┐      ┌───┐      ┌───┐      ┌───┐      ┌───┐      ┌───┐             │
│  │ 1 │      │ 1 │      │ 1 │      │ 2 │      │ 2 │      │ 3 │  Growth     │
│  └───┘      └───┘      └───┘      └───┘      └───┘      └───┘  Cells      │
│                                                                              │
│                           ┌───┐      ┌───┐      ┌───┐      ┌───┐           │
│                           │ 1 │      │ 1 │      │ 1 │      │ 1 │  Scale    │
│                           └───┘      └───┘      └───┘      └───┘  Cell     │
│                                                                              │
│                                      ┌───┐      ┌───┐      ┌───┐           │
│                                      │ 1 │      │ 3 │      │ 5 │  Ent.     │
│                                      └───┘      └───┘      └───┘  DBs      │
│                                                                              │
│  €158        €158        €253        €306        €470        €680           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Milestone Details

#### Milestone 1: Launch (0-200 Starter/Growth Customers)

**Infrastructure:** Base configuration
**Cost:** €158/month + ~€0.37/tenant (Secrets Manager)
**Bulk Capacity:** Up to 1M DPPs/batch (auto-scaling workers)
**Connection Pooling:** PgBouncer with `max_client_conn=2500`, per-tenant database roles

#### Milestone 2: Second Cell (200+ Customers)

**Trigger:** Approaching 200 Starter/Growth customers OR database CPU >70%
**Action:** Deploy second cell
**Cost Impact:** +€53/month (RDS) + ~€74/month (Secrets Manager for 200 tenants)
**Deployment:** Zero downtime, new tenants routed to Cell 2
**PgBouncer:** Deploy dedicated PgBouncer instance per cell; each handles up to 2,000 pooled connections

#### Milestone 3: First Scale Customer

**Trigger:** Customer signs Scale tier (€599/month base + per-DPP)
**Action:** Deploy Scale cell with per-tenant credentials
**Cost Impact:** +€95/month
**Net:** +€504/month base profit + DPP revenue

#### Milestone 4: First Enterprise Customer

**Trigger:** Customer signs Enterprise tier (€1,499/month base + per-DPP)
**Action:** Provision dedicated RDS instance
**Cost Impact:** +€110/month per customer
**Net:** +€1,389/month base profit per customer + DPP revenue

#### Milestone 5: High Availability + NAT Upgrade

**Trigger:** €50K+ MRR OR first Platform tier customer OR bulk processing >10GB/day
**Action:** NAT Gateway + Redis cluster
**Cost Impact:** +€50-80/month (NAT Gateway + data processing)

Note: The t4g.nano NAT instance works fine for Starter/Growth/Scale/Enterprise tiers. Upgrade to NAT Gateway when:
- Bulk jobs consistently process >10GB/day
- Network timeout errors appear in bulk worker logs
- First Platform tier customer onboards

#### Milestone 6: Multi-Region

**Trigger:** €100K+ MRR  
**Action:** Secondary region with read replicas  
**Cost Impact:** +€300/month

### 9.3 Cost Projection

| Customers | Mix | Infrastructure | Base Revenue | Est. DPP Revenue | Total MRR | Margin |
|-----------|-----|----------------|--------------|------------------|-----------|--------|
| 10 | 5 Starter, 5 Growth | €158/mo | €1,390/mo | €500/mo | €1,890/mo | 92% |
| 50 | 15 Starter, 30 Growth, 5 Scale | €200/mo | €9,350/mo | €5,000/mo | €14,350/mo | 99% |
| 100 | 25 Starter, 50 Growth, 20 Scale, 5 Ent | €360/mo | €25,895/mo | €25,000/mo | €50,895/mo | 99% |
| 200 | 40 Starter, 100 Growth, 45 Scale, 14 Ent, 1 Platform | €520/mo | €71,256/mo | €100,000/mo | €171,256/mo | 99.7% |
| 500 | 75 Starter, 250 Growth, 130 Scale, 42 Ent, 3 Platform | €1,200/mo | €210,533/mo | €500,000/mo | €710,533/mo | 99.8% |

*DPP revenue estimates assume growing item-level DPP adoption in batteries, electronics, and industrial sectors.*

### 9.4 Infrastructure Baseline

The starting configuration provides a solid foundation that auto-scales as demand grows.

#### Launch Configuration (€158/month)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STARTING INFRASTRUCTURE BREAKDOWN                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  COMPUTE (ECS Fargate)                                                      │
│  ────────────────────                                                       │
│  • API Service: 2 tasks × 0.5 vCPU × 1GB RAM                               │
│  • Bulk Worker: 0 tasks (scale from 0)                                      │
│  • Cost: ~€35/month (API always on)                                        │
│                                                                              │
│  DATABASE (PostgreSQL RDS)                                                  │
│  ─────────────────────────                                                  │
│  • Instance: db.t4g.micro (single-AZ)                                      │
│  • Storage: 20GB gp3                                                        │
│  • Capacity: ~200 tenants per cell                                         │
│  • Cost: ~€18/month                                                        │
│                                                                              │
│  CACHE (ElastiCache Redis)                                                  │
│  ─────────────────────────                                                  │
│  • Instance: cache.t4g.micro (single node)                                 │
│  • Capacity: 500MB, sufficient for ~50K cached sessions                    │
│  • Cost: ~€12/month                                                        │
│                                                                              │
│  ITEM STORAGE (DynamoDB)                                                    │
│  ───────────────────────                                                    │
│  • Mode: On-Demand (pay per request)                                       │
│  • Capacity: Unlimited items                                               │
│  • Cost: ~€0 at low volume, scales with usage                              │
│                                                                              │
│  DPP STORAGE & SERVING (Cloudflare R2)                                     │
│  ─────────────────────────────────────                                      │
│  • Storage: Pay per GB (first 10GB free)                                   │
│  • Egress: FREE via Cloudflare CDN                                         │
│  • Cost: ~€0 initially, scales with DPP volume                             │
│                                                                              │
│  NETWORKING                                                                 │
│  ──────────────                                                             │
│  • NAT: t4g.nano instance (saves €30/mo vs NAT Gateway)                   │
│  • VPC: No cost                                                            │
│  • Cost: ~€3/month                                                         │
│                                                                              │
│  QUEUE & EVENTS (SQS)                                                      │
│  ────────────────────                                                       │
│  • Queues: Standard queues for bulk processing                             │
│  • Cost: ~€0 (1M requests free, then $0.40/M)                              │
│                                                                              │
│  SECRETS (AWS Secrets Manager)                                             │
│  ──────────────────────────────                                             │
│  • Per-tenant database credentials                                         │
│  • Cost: ~€0.37/tenant/month                                               │
│                                                                              │
│  OTHER                                                                      │
│  ─────                                                                      │
│  • CloudWatch Logs: ~€5/month                                              │
│  • Route 53: ~€0.50/month per hosted zone                                  │
│  • KMS: ~€1/month per key (can share for Starter/Growth)                   │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════   │
│  TOTAL BASELINE: ~€158/month                                               │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.5 Auto-Scaling Layers

Most infrastructure scales automatically without operator intervention.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUTO-SCALING vs MANUAL SCALING                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ✅ AUTO-SCALES (Zero Intervention)                                         │
│  ══════════════════════════════════                                         │
│                                                                              │
│  Component          Trigger                    Range                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  API Tasks          CPU > 70% for 3 min        2 → 10 tasks                │
│  Bulk Workers       Queue depth > 1,000        0 → 20 tasks                │
│  DynamoDB           Request rate               Unlimited (on-demand)       │
│  R2 Storage         Data volume                Unlimited                    │
│  R2 Serving         Request volume             Unlimited (Cloudflare CDN)  │
│  SQS Queues         Message volume             Unlimited                    │
│                                                                              │
│  ⚠️ MANUAL SCALING REQUIRED                                                │
│  ══════════════════════════════                                             │
│                                                                              │
│  Component          Trigger                    Action Required              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  PostgreSQL Cell    ~200 tenants OR            Add new cell                 │
│                     CPU > 70% sustained                                     │
│                                                                              │
│  Redis Instance     Memory > 80% OR            Upgrade instance type        │
│                     CPU > 70% sustained                                     │
│                                                                              │
│  NAT Instance       Bulk jobs timeout OR       Upgrade to NAT Gateway       │
│                     Network errors spike                                    │
│                                                                              │
│  Enterprise RDS     New Enterprise customer    Provision dedicated RDS      │
│                                                                              │
│  Platform Cluster   New Platform customer      Provision dedicated          │
│                                                infrastructure               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### ECS Auto-Scaling Configuration

```hcl
# API Service - Always-on with CPU-based scaling
resource "aws_appautoscaling_target" "api" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "api-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Bulk Worker - Scale from 0 based on queue depth
resource "aws_appautoscaling_target" "bulk_worker" {
  max_capacity       = 20
  min_capacity       = 0
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.bulk_worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "bulk_worker_queue" {
  name               = "bulk-worker-queue-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.bulk_worker.resource_id
  scalable_dimension = aws_appautoscaling_target.bulk_worker.scalable_dimension
  service_namespace  = aws_appautoscaling_target.bulk_worker.service_namespace

  target_tracking_scaling_policy_configuration {
    customized_metric_specification {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      statistic   = "Average"
      dimensions {
        name  = "QueueName"
        value = aws_sqs_queue.bulk_chunks.name
      }
    }
    target_value       = 100.0  # 100 messages per worker
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
```

### 9.6 Manual Scaling Operations Guide

This section provides step-by-step procedures for manual scaling operations.

#### 9.6.1 Adding a New Database Cell

**When to trigger:** ~200 tenants in current cell OR database CPU consistently >70%

**Prerequisites:**
- AWS CLI configured with production credentials
- Terraform state access
- Database migration scripts ready

**Procedure:**

```bash
# 1. Check current cell utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=eurocomply-cell-1 \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average

# Check tenant count
psql -h eurocomply-cell-1.xxx.rds.amazonaws.com -U admin -d eurocomply -c \
  "SELECT COUNT(DISTINCT schema_name) FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%';"

# 2. Update Terraform to add new cell
cd infrastructure/terraform/environments/production

# Edit cells.tf - add new cell definition
cat >> cells.tf << 'EOF'
module "cell_2" {
  source = "../../modules/database-cell"

  cell_name        = "cell-2"
  cell_number      = 2
  instance_class   = "db.t4g.micro"
  allocated_storage = 20

  vpc_id           = module.vpc.vpc_id
  subnet_ids       = module.vpc.database_subnet_ids
  security_group_id = aws_security_group.database.id

  # Use same master password, different identifier
  master_username  = var.db_master_username
  master_password  = var.db_master_password

  tags = local.common_tags
}
EOF

# 3. Plan and apply
terraform plan -target=module.cell_2
terraform apply -target=module.cell_2

# 4. Wait for RDS to be available (5-10 minutes)
aws rds wait db-instance-available \
  --db-instance-identifier eurocomply-cell-2

# 5. Initialize cell schema
psql -h eurocomply-cell-2.xxx.rds.amazonaws.com -U admin -d postgres << 'EOF'
CREATE DATABASE eurocomply;
\c eurocomply
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EOF

# 6. Deploy PgBouncer for new cell
cd ../../../pgbouncer
./deploy-cell.sh cell-2

# 7. Update application routing configuration
# Set cell_2 as default for new tenants
aws ssm put-parameter \
  --name "/eurocomply/production/default-cell" \
  --value "cell-2" \
  --type "String" \
  --overwrite

# 8. Verify new cell is operational
curl -s https://api.eurocomply.io/health | jq '.database_cells'

# 9. Monitor for 24 hours
# Watch CloudWatch dashboard for any issues with new cell
```

**Rollback procedure:**
```bash
# If issues occur, route new tenants back to cell-1
aws ssm put-parameter \
  --name "/eurocomply/production/default-cell" \
  --value "cell-1" \
  --type "String" \
  --overwrite

# Do NOT destroy cell-2 if any tenants have been provisioned on it
# Check: SELECT COUNT(*) FROM tenants WHERE cell = 'cell-2';
```

**Cost impact:** +€18/month for db.t4g.micro, +€0.37/tenant for Secrets Manager

---

#### 9.6.2 Upgrading Redis Instance

**When to trigger:** Memory utilization >80% OR CPU consistently >70% OR cache evictions increasing

**Prerequisites:**
- Maintenance window scheduled (brief connection drops during failover)
- Notify customers of potential brief latency spike

**Procedure:**

```bash
# 1. Check current utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name DatabaseMemoryUsagePercentage \
  --dimensions Name=CacheClusterId,Value=eurocomply-redis \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average

# Check evictions
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name Evictions \
  --dimensions Name=CacheClusterId,Value=eurocomply-redis \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Sum

# 2. Choose target instance type
# Upgrade path: t4g.micro → t4g.small → t4g.medium → r6g.large
#
# Instance      Memory    Cost/month  Use case
# t4g.micro     0.5 GB    €12         Launch (0-50 customers)
# t4g.small     1.6 GB    €24         Growth (50-200 customers)
# t4g.medium    3.2 GB    €48         Scale (200-500 customers)
# r6g.large     13 GB     €120        Enterprise (500+ customers)

# 3. Update Terraform
cd infrastructure/terraform/environments/production

# Edit redis.tf
sed -i 's/node_type = "cache.t4g.micro"/node_type = "cache.t4g.small"/' redis.tf

# 4. Plan and apply (will cause brief downtime)
terraform plan -target=aws_elasticache_cluster.redis
terraform apply -target=aws_elasticache_cluster.redis

# Note: Modification takes 5-15 minutes
# During this time, cache operations will fail
# Application should gracefully degrade (slower, not broken)

# 5. Verify new instance is operational
aws elasticache describe-cache-clusters \
  --cache-cluster-id eurocomply-redis \
  --show-cache-node-info

# 6. Verify application connectivity
curl -s https://api.eurocomply.io/health | jq '.redis'

# 7. Monitor memory utilization post-upgrade
watch -n 60 'aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name DatabaseMemoryUsagePercentage \
  --dimensions Name=CacheClusterId,Value=eurocomply-redis \
  --start-time $(date -u -d "5 minutes ago" +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60 \
  --statistics Average'
```

**Zero-downtime alternative (Redis Cluster Mode):**
```bash
# For Scale+ tier, use Redis Cluster Mode for online scaling
# This requires application changes to use cluster client

# 1. Create new cluster with replication
aws elasticache create-replication-group \
  --replication-group-id eurocomply-redis-cluster \
  --replication-group-description "EuroComply Redis Cluster" \
  --automatic-failover-enabled \
  --cache-node-type cache.t4g.small \
  --num-cache-clusters 2 \
  --engine redis \
  --engine-version 7.0

# 2. Online scaling (no downtime)
aws elasticache modify-replication-group \
  --replication-group-id eurocomply-redis-cluster \
  --cache-node-type cache.t4g.medium \
  --apply-immediately
```

**Cost impact:** ~€12-108/month depending on upgrade path

---

#### 9.6.3 Provisioning Enterprise Dedicated RDS

**When to trigger:** New Enterprise tier customer signs up (€1,499/month base)

**Prerequisites:**
- Customer onboarding complete
- Tenant ID assigned
- Customer's data isolation requirements documented

**Procedure:**

```bash
# 1. Get customer details
TENANT_ID="ent_abc123"
CUSTOMER_NAME="acme-corp"
REGION="eu-west-1"

# 2. Create dedicated RDS instance via Terraform
cd infrastructure/terraform/environments/production

cat >> enterprise-instances.tf << EOF

module "enterprise_${CUSTOMER_NAME}" {
  source = "../../modules/enterprise-database"

  tenant_id         = "${TENANT_ID}"
  customer_name     = "${CUSTOMER_NAME}"

  instance_class    = "db.t4g.medium"  # Enterprise default
  allocated_storage = 100
  max_allocated_storage = 1000  # Auto-expand up to 1TB

  # Multi-AZ for Enterprise
  multi_az          = true

  # Enhanced monitoring
  monitoring_interval = 60
  performance_insights_enabled = true

  # Backup
  backup_retention_period = 35
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"

  vpc_id            = module.vpc.vpc_id
  subnet_ids        = module.vpc.database_subnet_ids
  security_group_id = aws_security_group.enterprise_database.id

  # Customer-specific KMS key
  kms_key_id        = aws_kms_key.enterprise_${CUSTOMER_NAME}.arn

  tags = merge(local.common_tags, {
    Customer = "${CUSTOMER_NAME}"
    Tier     = "Enterprise"
  })
}

# Customer-specific encryption key
resource "aws_kms_key" "enterprise_${CUSTOMER_NAME}" {
  description             = "KMS key for ${CUSTOMER_NAME}"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Customer = "${CUSTOMER_NAME}"
    Tier     = "Enterprise"
  }
}
EOF

# 3. Plan and apply
terraform plan -target=module.enterprise_${CUSTOMER_NAME}
terraform apply -target=module.enterprise_${CUSTOMER_NAME}

# Wait for RDS (10-15 minutes for Multi-AZ)
aws rds wait db-instance-available \
  --db-instance-identifier eurocomply-ent-${CUSTOMER_NAME}

# 4. Initialize database schema
export PGHOST=$(terraform output -raw enterprise_${CUSTOMER_NAME}_endpoint)
export PGUSER=$(aws secretsmanager get-secret-value \
  --secret-id eurocomply/enterprise/${CUSTOMER_NAME}/master \
  --query SecretString --output text | jq -r .username)
export PGPASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id eurocomply/enterprise/${CUSTOMER_NAME}/master \
  --query SecretString --output text | jq -r .password)

psql -d postgres << 'EOF'
CREATE DATABASE eurocomply;
\c eurocomply
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EOF

# Run migrations
cd ../../../../
npx prisma migrate deploy

# 5. Create tenant record pointing to dedicated instance
psql -h eurocomply-cell-1.xxx.rds.amazonaws.com -U admin -d eurocomply << EOF
INSERT INTO tenants (
  id,
  name,
  tier,
  database_host,
  database_type,
  kms_key_id,
  created_at
) VALUES (
  '${TENANT_ID}',
  '${CUSTOMER_NAME}',
  'ENTERPRISE',
  'eurocomply-ent-${CUSTOMER_NAME}.xxx.rds.amazonaws.com',
  'dedicated',
  'arn:aws:kms:${REGION}:xxx:key/yyy',
  NOW()
);
EOF

# 6. Update application routing
aws ssm put-parameter \
  --name "/eurocomply/production/tenants/${TENANT_ID}/database-host" \
  --value "eurocomply-ent-${CUSTOMER_NAME}.xxx.rds.amazonaws.com" \
  --type "SecureString" \
  --overwrite

# 7. Verify connectivity
curl -s -H "X-Tenant-ID: ${TENANT_ID}" \
  https://api.eurocomply.io/health | jq '.database'

# 8. Send onboarding notification to customer
# (via internal ops tool or manual email)
```

**Cost breakdown:**
| Component | Monthly Cost |
|-----------|--------------|
| db.t4g.medium Multi-AZ | €90 |
| 100GB gp3 storage | €12 |
| Automated backups | €5 |
| KMS key | €1 |
| Performance Insights | €2 |
| **Total** | **~€110/month** |

**Customer revenue:** €1,499/month base + per-DPP fees
**Net margin:** €1,389/month base profit + DPP revenue

---

#### 9.6.4 Upgrading NAT Instance to NAT Gateway

**When to trigger:**
- Bulk jobs experiencing network timeouts
- Platform tier customer onboards
- MRR exceeds €50K
- Network throughput >5Gbps consistently

**Prerequisites:**
- Maintenance window for brief connectivity interruption
- Monitor bulk jobs during transition

**Procedure:**

```bash
# 1. Check current NAT instance metrics
# Look for packet drops, bandwidth saturation
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name NetworkPacketsOut \
  --dimensions Name=InstanceId,Value=i-nat-instance-id \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Sum

# 2. Create NAT Gateway via Terraform
cd infrastructure/terraform/environments/production

# Edit vpc.tf - comment out NAT instance, add NAT Gateway
cat >> vpc.tf << 'EOF'

# NAT Gateway (replaces NAT instance)
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "eurocomply-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "eurocomply-nat-gateway"
  }

  depends_on = [aws_internet_gateway.main]
}

# Update route table to use NAT Gateway
resource "aws_route" "private_nat_gateway" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main.id
}
EOF

# 3. Plan changes
terraform plan

# 4. Apply in maintenance window
# This will briefly interrupt outbound connectivity from private subnets
terraform apply

# 5. Terminate old NAT instance (after verification)
aws ec2 terminate-instances --instance-ids i-nat-instance-id

# 6. Verify bulk jobs are working
# Run a small test bulk job
curl -X POST https://api.eurocomply.io/v1/bulk-jobs \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"product_id": "test", "serial_numbers": ["SN001", "SN002"]}'

# 7. Monitor network metrics
watch -n 60 'aws cloudwatch get-metric-statistics \
  --namespace AWS/NATGateway \
  --metric-name BytesOutToDestination \
  --dimensions Name=NatGatewayId,Value=nat-xxx \
  --start-time $(date -u -d "5 minutes ago" +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60 \
  --statistics Sum'
```

**Cost impact:**
| Component | Before (NAT Instance) | After (NAT Gateway) |
|-----------|----------------------|---------------------|
| Fixed cost | €3/month (t4g.nano) | €35/month |
| Data processing | Included | €0.048/GB |
| Throughput | ~5 Gbps | 45 Gbps |
| Availability | Single instance | Highly available |

**When NOT to upgrade:**
- If bulk processing is <5GB/day, NAT instance is sufficient
- If budget is constrained and no Platform customers
- If network errors are caused by other issues (check first)

---

#### 9.6.5 Scaling Decision Matrix

Quick reference for when to trigger each scaling operation:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SCALING DECISION MATRIX                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Observation                          Action                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Tenant count approaching 200         → Add new database cell               │
│  RDS CPU >70% for >1 hour            → Add new database cell               │
│  Redis memory >80%                    → Upgrade Redis instance              │
│  Redis evictions increasing           → Upgrade Redis instance              │
│  Bulk job timeouts                    → Check NAT, then upgrade if needed  │
│  New Enterprise customer              → Provision dedicated RDS             │
│  New Platform customer                → Provision dedicated infrastructure  │
│  API tasks at max (10)               → Increase max in auto-scaling        │
│  Bulk workers at max (20)            → Increase max in auto-scaling        │
│  DynamoDB throttling                  → Already on-demand, check queries   │
│  R2 write costs >$100/month          → Review bulk job batching            │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════   │
│  KEY PRINCIPLE: Most scaling is automatic. Manual intervention is rare     │
│  and primarily involves database cells and Enterprise provisioning.        │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Operations

### 10.1 Monitoring Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EUROCOMPLY PRODUCTION DASHBOARD                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  API METRICS                           DATABASE METRICS                      │
│  ┌─────────────────────────┐          ┌─────────────────────────┐          │
│  │ Request Rate    ████░░░ │          │ CPU Utilization  ███░░░ │          │
│  │ 847 req/min             │          │ 34%                     │          │
│  │ P99 Latency     ██░░░░░ │          │ Connections      ██░░░░ │          │
│  │ 245ms                   │          │ 45/200                  │          │
│  └─────────────────────────┘          └─────────────────────────┘          │
│                                                                              │
│  BULK GENERATION                       DPP SERVING                          │
│  ┌─────────────────────────┐          ┌─────────────────────────┐          │
│  │ Active Jobs     ██░░░░░ │          │ Scans/min      █████░░░ │          │
│  │ 3                       │          │ 12,847                  │          │
│  │ Queue Depth     ███░░░░ │          │ Cache Hit Rate ██████░░ │          │
│  │ 847 chunks              │          │ 94.2%                   │          │
│  │ Workers Active  ████░░░ │          │ R2 Cache Hit %  ██████░░ │          │
│  │ 8/20                    │          │ 5.8%                    │          │
│  └─────────────────────────┘          └─────────────────────────┘          │
│                                                                              │
│  BUSINESS METRICS                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Tenants: 156  Products: 12,847  Items: 47.2M  DPPs Generated: 31.4M│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Alerts

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| API High Error Rate | >1% for 5 min | Critical | Page on-call |
| RDS High CPU | >80% for 10 min | Warning | Investigate queries |
| Bulk Queue Depth | >10,000 for 10 min | Warning | Check worker scaling |
| Bulk Worker Failures | >5% failure rate | Critical | Investigate logs |
| R2 Cache Hit Rate | <80% | Warning | Check edge cache config |
| SQS DLQ Messages | >0 | Critical | Investigate immediately |
| R2 Class A Ops | >10M/day | Warning | Review bulk job sizes |
| R2 Monthly Cost | >$100 | Warning | Review usage patterns |

### 10.3 Dead Letter Queue (DLQ) Handling

Poison pill messages (malformed data that crashes workers) are common in bulk processing. Robust DLQ handling is critical.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DLQ HANDLING STRATEGY                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FLOW:                                                                      │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐          │
│  │  Chunk   │────▶│  Worker  │────▶│  Fails   │────▶│  Retry   │          │
│  │  Message │     │  Process │     │  (crash) │     │  (×5)    │          │
│  └──────────┘     └──────────┘     └──────────┘     └────┬─────┘          │
│                                                          │                  │
│                                            After 5 failures                │
│                                                          │                  │
│                                                          ▼                  │
│                                                   ┌──────────┐             │
│                                                   │   DLQ    │             │
│                                                   └────┬─────┘             │
│                                                        │                    │
│                              ┌──────────────────────────┼──────────────┐   │
│                              │                          │              │   │
│                              ▼                          ▼              ▼   │
│                       ┌──────────┐              ┌──────────┐   ┌──────────┐│
│                       │CloudWatch│              │  Lambda  │   │  Slack   ││
│                       │  Alarm   │              │ Analyzer │   │  Alert   ││
│                       │  (>0)    │              │          │   │          ││
│                       └──────────┘              └──────────┘   └──────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

COMMON POISON PILL CAUSES:
───────────────────────────
• Invalid serial number format (special characters, too long)
• Corrupted passport template (missing required fields)
• Invalid UTF-8 in product data
• Circular references in JSON
• Extremely large payload exceeding memory

DLQ MESSAGE STRUCTURE:
──────────────────────
{
  "originalMessage": { ... },
  "failureReason": "OutOfMemoryError",
  "failureCount": 5,
  "firstFailure": "2026-01-13T10:00:00Z",
  "lastFailure": "2026-01-13T10:05:00Z",
  "workerIds": ["worker-1", "worker-3", "worker-1", "worker-2", "worker-1"]
}

AUTOMATED RESPONSE:
───────────────────
1. CloudWatch Alarm triggers on DLQ message count > 0
2. Lambda function analyzes failed message:
   - Parse error type
   - Identify affected tenant/job
   - Categorize failure (data issue vs system issue)
3. Notify via Slack with context
4. Update job status to 'partial_failure'
5. Generate failure report for tenant
```

**DLQ Processor Lambda:**

```typescript
// Lambda triggered by DLQ messages
export async function handler(event: SQSEvent) {
  for (const record of event.Records) {
    const failedMessage = JSON.parse(record.body);
    const originalChunk = JSON.parse(failedMessage.originalMessage);
    
    // 1. Log detailed failure info
    console.error('Chunk processing failed', {
      jobId: originalChunk.jobId,
      chunkIndex: originalChunk.chunkIndex,
      organizationId: originalChunk.organizationId,
      errorMessage: failedMessage.failureReason,
      receiveCount: record.attributes.ApproximateReceiveCount,
    });
    
    // 2. Update job with failure info
    await updateJobStatus(originalChunk.jobId, {
      status: 'partial_failure',
      failedChunks: increment(1),
      lastError: failedMessage.failureReason,
    });
    
    // 3. Notify operations team
    await sendSlackAlert({
      channel: '#eurocomply-alerts',
      text: `🚨 Bulk generation chunk failed`,
      attachments: [{
        color: 'danger',
        fields: [
          { title: 'Job ID', value: originalChunk.jobId },
          { title: 'Chunk', value: `${originalChunk.chunkIndex}` },
          { title: 'Tenant', value: originalChunk.organizationId },
          { title: 'Error', value: failedMessage.failureReason },
        ],
      }],
    });
    
    // 4. Store for manual review
    await s3.putObject({
      Bucket: 'eurocomply-dlq-analysis',
      Key: `${originalChunk.jobId}/${originalChunk.chunkIndex}.json`,
      Body: JSON.stringify(failedMessage, null, 2),
    });
  }
}
```

### 10.4 R2 Cost Monitoring

While R2 has zero egress fees, write operations (Class A) have costs that can spike during bulk generation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           R2 COST STRUCTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRICING (as of 2026):                                                      │
│  ────────────────────                                                       │
│  • Storage: $0.015/GB/month (first 10GB free)                              │
│  • Class A (writes): $4.50 per million operations                          │
│  • Class B (reads): $0.36 per million operations                           │
│  • Egress: FREE                                                            │
│                                                                              │
│  BULK GENERATION COSTS:                                                     │
│  ──────────────────────                                                     │
│  │ Batch Size   │ Class A Ops │ Write Cost │ Storage (10KB avg) │         │
│  ├──────────────┼─────────────┼────────────┼────────────────────┤         │
│  │ 100,000      │ 100K        │ $0.45      │ 1 GB = $0.015      │         │
│  │ 1,000,000    │ 1M          │ $4.50      │ 10 GB = $0.15      │         │
│  │ 10,000,000   │ 10M         │ $45.00     │ 100 GB = $1.50     │         │
│  │ 100,000,000  │ 100M        │ $450.00    │ 1 TB = $15.00      │         │
│  └──────────────┴─────────────┴────────────┴────────────────────┘         │
│                                                                              │
│  Note: Platform tier customers generating 100M DPPs/month = ~$450 in R2 writes │
│  This is factored into Platform tier custom pricing negotiations               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**CloudWatch Alarm for R2 Costs:**

```hcl
# Monitor R2 Class A operations via Cloudflare API
resource "aws_cloudwatch_metric_alarm" "r2_class_a_ops" {
  alarm_name          = "r2-class-a-operations-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "R2ClassAOperations"
  namespace           = "EuroComply/Cloudflare"
  period              = 86400  # Daily
  statistic           = "Sum"
  threshold           = 10000000  # 10M ops/day = $45/day
  alarm_description   = "R2 write operations exceed 10M/day"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# Custom metric published by Lambda (polls Cloudflare API)
resource "aws_lambda_function" "r2_metrics" {
  function_name = "eurocomply-r2-metrics"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  
  environment {
    variables = {
      CLOUDFLARE_API_TOKEN = data.aws_secretsmanager_secret_version.cf_token.secret_string
      CLOUDFLARE_ACCOUNT_ID = var.cloudflare_account_id
    }
  }
}

resource "aws_cloudwatch_event_rule" "r2_metrics_schedule" {
  name                = "r2-metrics-hourly"
  schedule_expression = "rate(1 hour)"
}
```

**Per-Tenant Cost Attribution:**

```typescript
// Track R2 operations per tenant for cost attribution
async function trackR2Operations(
  organizationId: string,
  operation: 'write' | 'read',
  count: number
) {
  const date = new Date().toISOString().split('T')[0];
  
  await dynamodb.update({
    TableName: 'eurocomply-usage-metrics',
    Key: {
      pk: `ORG#${organizationId}`,
      sk: `R2#${date}`,
    },
    UpdateExpression: 'ADD #op :count',
    ExpressionAttributeNames: {
      '#op': operation === 'write' ? 'classAOps' : 'classBOps',
    },
    ExpressionAttributeValues: {
      ':count': count,
    },
  });
}

// In bulk worker, after R2 upload:
await trackR2Operations(chunk.organizationId, 'write', dpps.length);
```

### 10.5 Backup and Recovery

| Component | Backup Method | Retention | RPO | RTO |
|-----------|---------------|-----------|-----|-----|
| RDS | Automated snapshots | 7 days | 5 min | 30 min |
| RDS | Point-in-time recovery | 7 days | 1 sec | 30 min |
| DynamoDB | Point-in-time recovery | 35 days | 1 sec | Minutes |
| R2 | Versioning | 30 days | 0 | Instant |
| S3 | Versioning | Indefinite | 0 | Instant |

---

## 11. Implementation Guide

### 11.1 Prerequisites

```bash
# Required tools
aws-cli >= 2.0
terraform >= 1.0
docker >= 20.0
node >= 20.0
wrangler >= 3.0  # Cloudflare Workers CLI
```

### 11.2 Initial Deployment

```bash
# 1. Clone repository
git clone https://github.com/eurocomply/platform.git
cd platform

# 2. Deploy AWS infrastructure
cd infrastructure/terraform/environments/production
terraform init && terraform apply

# 3. Deploy Cloudflare Workers
cd ../../../cloudflare
wrangler deploy

# 4. Build and push containers
./scripts/build-and-push.sh

# 5. Run database migrations
./scripts/migrate.sh --environment production

# 6. Verify deployment
./scripts/health-check.sh
```

### 11.3 Bulk Worker Auto-Scaling Configuration

```hcl
# ECS Service Auto Scaling for Bulk Workers
resource "aws_appautoscaling_target" "bulk_worker" {
  max_capacity       = 20
  min_capacity       = 0
  resource_id        = "service/${aws_ecs_cluster.main.name}/bulk-worker"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "bulk_worker_scale" {
  name               = "bulk-worker-queue-depth"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.bulk_worker.resource_id
  scalable_dimension = aws_appautoscaling_target.bulk_worker.scalable_dimension
  service_namespace  = aws_appautoscaling_target.bulk_worker.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Scale based on SQS queue depth
resource "aws_cloudwatch_metric_alarm" "bulk_queue_high" {
  alarm_name          = "bulk-queue-depth-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Average"
  threshold           = 100
  alarm_actions       = [aws_appautoscaling_policy.bulk_worker_scale_out.arn]

  dimensions = {
    QueueName = aws_sqs_queue.bulk_generation.name
  }
}
```

### 11.4 Directory Structure

```
eurocomply/
├── apps/
│   ├── api/                    # Express.js API
│   ├── web/                    # Next.js frontend
│   ├── worker/                 # Background job processor
│   └── bulk-worker/            # Bulk DPP generation
│
├── packages/
│   ├── database/               # Prisma, tenant router
│   ├── encryption/             # KMS integration
│   ├── events/                 # Event sourcing
│   ├── dpp-generator/          # DPP rendering engine
│   └── shared/                 # Common utilities
│
├── infrastructure/
│   ├── terraform/
│   │   ├── modules/
│   │   │   ├── vpc/
│   │   │   ├── rds/
│   │   │   ├── ecs/
│   │   │   ├── bulk-workers/   # Auto-scaling config
│   │   │   └── ...
│   │   └── environments/
│   │       ├── production/
│   │       └── staging/
│   │
│   └── cloudflare/
│       ├── workers/
│       │   └── dpp-server/     # Cloudflare Worker for R2 serving
│       └── wrangler.toml
│
├── scripts/
│   ├── provision-tenant.sh
│   ├── migrate.sh
│   ├── deploy.sh
│   └── health-check.sh
│
└── docs/
    └── architecture.md
```

---

## 12. Standards & Data Formats

This document covers **infrastructure** (how we run the platform). The following documents cover **standards** (what format the data is in):

### 12.1 Document Map

| Document | Covers | Key Topics |
|----------|--------|------------|
| **This document** | Infrastructure | AWS, DynamoDB, R2, scaling, costs |
| [VERIFIABLE_CREDENTIALS.md](./docs/VERIFIABLE_CREDENTIALS.md) | Standards | W3C VCs, did:key, signing, revocation |
| [ARCHITECTURE_PORTABILITY.md](./docs/ARCHITECTURE_PORTABILITY.md) | Portability | Export, data ownership, self-hosting |

### 12.2 Standards Implementation

| Standard | Purpose | Covered In |
|----------|---------|------------|
| **W3C Verifiable Credentials** | DPP data format | VERIFIABLE_CREDENTIALS.md §4.4 |
| **did:key** | Portable issuer identity | VERIFIABLE_CREDENTIALS.md §3 |
| **Status List 2021** | Credential revocation | VERIFIABLE_CREDENTIALS.md §14 |
| **GS1 Digital Link** | QR code format | ARCHITECTURE_PORTABILITY.md |
| **Ed25519** | Signature algorithm | VERIFIABLE_CREDENTIALS.md §4.1 |
| **JSON-LD** | VC context | VERIFIABLE_CREDENTIALS.md §4.4 |

### 12.3 How Infrastructure Supports Standards

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE → STANDARDS FLOW                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. SIGNING (walt.id Custodian on Fargate)                                  │
│     • Per-organization Ed25519 key pairs                                    │
│     • Keys stored encrypted (per-tenant KMS DEK)                            │
│     • Signs VCs with did:key issuer                                         │
│                                                                              │
│  2. STORAGE                                                                  │
│     PostgreSQL (dpp_data JSONB)  →  Signed VC (JSON-LD + proof)            │
│                    ↓                                                         │
│     R2 Static Files (.json)      →  Self-contained VC for public access    │
│                                                                              │
│  3. REVOCATION                                                               │
│     PostgreSQL (status_list table)  →  Status List 2021 credential          │
│                    ↓                                                         │
│     API endpoint (/v1/status/{orgId})  →  Public status list URL           │
│                                                                              │
│  4. VERIFICATION                                                             │
│     Cloudflare Worker  →  Serves static VC  →  Client verifies signature   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.4 Key Architecture Decisions

| Decision | Infrastructure Implication | Standards Implication |
|----------|---------------------------|----------------------|
| did:key over did:web | No DID document hosting needed | Signatures verify offline |
| Self-contained VCs | Store full data in R2 files | No database lookup on scan |
| Per-tenant KMS keys | Encryption at rest | Signing key isolation |
| Status List 2021 | Revocation API endpoint | W3C-standard revocation |

### 12.5 Related Documentation

- [VERIFIABLE_CREDENTIALS.md](./docs/VERIFIABLE_CREDENTIALS.md) - Complete VC implementation including wallet architecture, attestations, and identity verification
- [ARCHITECTURE_PORTABILITY.md](./docs/ARCHITECTURE_PORTABILITY.md) - Export, data sovereignty, and self-hosting options
- [DATA_SOVEREIGNTY.md](./docs/DATA_SOVEREIGNTY.md) - Customer data ownership and GDPR compliance

---

## Appendix A: Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01 | Schema isolation for all tiers | Security is not a premium feature |
| 2026-01 | PostgreSQL for products | Complex queries, ACID |
| 2026-01 | DynamoDB for items | Billions of records, key-value access |
| 2026-01 | Fan-out for bulk generation | 1M DPPs in 10 min vs 27 hours |
| 2026-01 | Eager generation with R2 storage | Zero AWS egress cost at scale |
| 2026-01 | Cloudflare Workers for DPP serving | Edge latency, static file serving |
| 2026-01 | Auto-scaling bulk workers (0-20) | Scale to zero, cost efficiency |
| 2026-01 | Idempotent chunk processing | Handle worker crashes, SQS redelivery |
| 2026-01 | DLQ with Lambda analyzer | Detect poison pills, auto-notify |
| 2026-01 | Per-tenant R2 cost tracking | Cost attribution for Platform tier |
| 2026-01 | NAT instance at launch | $3/mo vs $33/mo, upgrade at Platform tier |
| 2026-01 | Accept Mega ingestion as CAC | 12% of month 1 is acceptable for €60K LTV |

---

## Appendix B: Performance Targets

| Operation | Target | Achieved |
|-----------|--------|----------|
| API response (p50) | <200ms | 50-100ms ✅ |
| API response (p99) | <500ms | 200-400ms ✅ |
| DPP scan (cached) | <50ms | 20-50ms ✅ |
| DPP scan (R2 static) | <50ms | 10-30ms ✅ |
| Bulk generation (1M) | <1 hour | ~10 min ✅ |
| Bulk generation (10M) | <4 hours | 1-2 hours ✅ |

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| Cell | A PostgreSQL RDS instance containing multiple tenant schemas |
| Chunk | A 1,000-item unit of work for bulk processing |
| DEK | Data Encryption Key - per-tenant key for encrypting sensitive fields |
| DPP | Digital Product Passport - EU ESPR compliance document |
| Fan-out | Parallel processing pattern using message queues |
| Eager Generation | Pre-generate all DPPs to R2 for zero-egress serving |
| RLS | Row-Level Security - PostgreSQL feature for row-level access control |

---

## Appendix D: Planned - Data Sovereignty Infrastructure

> **Status: 📋 PLANNED** - This appendix documents infrastructure that will be built to support the data sovereignty features described in [DATA_SOVEREIGNTY.md](./docs/DATA_SOVEREIGNTY.md). None of this is implemented yet.

### D.1 Identity & Signing Infrastructure

**Purpose:** Enable organizations to sign VCs with their own did:key identity.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  IDENTITY SERVICE (walt.id on Fargate)                          📋 PLANNED  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  NEW TABLES (per-tenant schema):                                            │
│  ───────────────────────────────                                            │
│  organization_keys                                                          │
│  ├── id: UUID                                                               │
│  ├── organization_id: UUID                                                  │
│  ├── did: String (did:key:z6Mk...)                                         │
│  ├── public_key_jwk: JSONB                                                  │
│  ├── encrypted_private_key: BYTEA (encrypted with tenant DEK)              │
│  ├── key_type: Ed25519                                                      │
│  ├── created_at, rotated_at                                                 │
│  └── is_active: Boolean                                                     │
│                                                                              │
│  NEW SERVICE:                                                                │
│  ────────────                                                                │
│  packages/identity/                                                          │
│  ├── did-key.service.ts    - Generate/manage did:key                        │
│  ├── vc.service.ts         - Sign VCs using walt.id                         │
│  ├── key.service.ts        - Key storage/export                             │
│  └── wallet.provider.ts    - EUDI-ready wallet abstraction                  │
│                                                                              │
│  INFRASTRUCTURE:                                                             │
│  ───────────────                                                             │
│  • walt.id Community Stack containers on Fargate                            │
│  • Core API (:7000), Signatory (:7001), Custodian (:7002), Auditor (:7003) │
│  • Keys encrypted at rest with per-tenant KMS DEK                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### D.2 Status List Infrastructure (Revocation)

**Purpose:** Enable credential revocation per W3C Status List 2021 standard.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STATUS LIST 2021 INFRASTRUCTURE                                 📋 PLANNED │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  NEW TABLES (per-tenant schema):                                            │
│  ───────────────────────────────                                            │
│  status_lists                                                                │
│  ├── id: UUID                                                               │
│  ├── organization_id: UUID                                                  │
│  ├── list_index: Integer (which list, for pagination)                       │
│  ├── bitstring: BYTEA (compressed bitstring, up to 131,072 entries)        │
│  ├── last_updated: Timestamp                                                │
│  └── signed_credential: JSONB (the Status List 2021 VC itself)             │
│                                                                              │
│  credential_status                                                           │
│  ├── credential_id: UUID (references passports or attestations)             │
│  ├── status_list_id: UUID                                                   │
│  ├── status_list_index: Integer                                             │
│  ├── is_revoked: Boolean                                                    │
│  ├── revoked_at: Timestamp                                                  │
│  └── revocation_reason: String                                              │
│                                                                              │
│  NEW API ENDPOINTS:                                                          │
│  ──────────────────                                                          │
│  GET  /api/v1/status/{orgId}           - Public status list (cached at CDN) │
│  POST /api/v1/passports/:id/revoke     - Revoke a DPP                       │
│  POST /api/v1/attestations/:id/revoke  - Revoke an attestation              │
│                                                                              │
│  CDN CACHING:                                                                │
│  ────────────                                                                │
│  Cache-Control: public, max-age=300, stale-while-revalidate=60              │
│  Cloudflare cache purge on revocation for critical cases                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### D.3 Export Service Architecture

**Purpose:** Enable one-click export of all organization data for portability.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXPORT SERVICE                                                  📋 PLANNED │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  NEW API ENDPOINTS:                                                          │
│  ──────────────────                                                          │
│  GET  /api/v1/organization/export/did              - Get organization DID   │
│  POST /api/v1/organization/export/did              - Create DID if missing  │
│  GET  /api/v1/organization/export/dpp/:productId   - Export single DPP      │
│  GET  /api/v1/organization/export/keys             - Export signing keys    │
│  GET  /api/v1/organization/export/status-list      - Export status list     │
│  GET  /api/v1/organization/export/viewer/:productId- Offline HTML viewer    │
│  POST /api/v1/organization/export/full             - Full org export (async)│
│                                                                              │
│  EXPORT PACKAGE STRUCTURE:                                                   │
│  ─────────────────────────                                                   │
│  dpp-export-{org-id}.zip                                                     │
│  ├── credentials/                                                            │
│  │   ├── dpp-001.vc.json     (signed VC with ALL data embedded)             │
│  │   ├── dpp-002.vc.json                                                     │
│  │   └── ...                                                                 │
│  ├── attestations/                                                           │
│  │   ├── att-001.vc.json     (third-party attestation VCs)                  │
│  │   └── ...                                                                 │
│  ├── identity/                                                               │
│  │   ├── did.json            (DID document)                                  │
│  │   └── private-key.jwk     (for future VC signing)                        │
│  ├── status-list/                                                            │
│  │   ├── current.json        (current status list credential)               │
│  │   └── signing-key.jwk     (to sign updated status lists)                 │
│  ├── images/                                                                 │
│  │   ├── product-001-hero.jpg                                                │
│  │   └── ...                                                                 │
│  ├── viewer.html             (self-contained offline viewer)                │
│  ├── qr-codes/                                                               │
│  │   ├── dpp-001.svg                                                         │
│  │   └── ...                                                                 │
│  ├── manifest.json           (GTIN → VC mapping)                             │
│  └── HOSTING.md              (self-hosting instructions)                     │
│                                                                              │
│  SECURITY:                                                                   │
│  ─────────                                                                   │
│  • Rate limit: 10 full exports per day                                       │
│  • Audit log: All exports logged with user, timestamp, scope                │
│  • Key export requires re-authentication                                     │
│  • Optional 24-hour delay for enterprise security policies                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### D.4 Offline Viewer Generation

**Purpose:** Generate self-contained HTML viewers that work without any server.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  OFFLINE VIEWER PIPELINE                                         📋 PLANNED │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  VIEWER CHARACTERISTICS:                                                     │
│  ───────────────────────                                                     │
│  • Single HTML file with embedded CSS/JS (no external dependencies)         │
│  • Loads VC from same folder (credentials/dpp-xxx.vc.json)                  │
│  • Verifies Ed25519 signature client-side (noble-ed25519 library)           │
│  • Renders DPP data with styling                                             │
│  • Works completely offline for signature verification                       │
│  • Images: Base64 embedded OR URL references (configurable)                 │
│                                                                              │
│  GENERATION:                                                                 │
│  ───────────                                                                 │
│  packages/dpp-generator/                                                     │
│  ├── templates/                                                              │
│  │   └── offline-viewer.html.ejs   (template with embedded JS)              │
│  ├── assets/                                                                 │
│  │   ├── noble-ed25519.min.js      (signature verification)                 │
│  │   ├── multibase.min.js          (did:key parsing)                        │
│  │   └── styles.css                                                          │
│  └── offline-viewer.service.ts     (generates self-contained HTML)          │
│                                                                              │
│  vs. ONLINE DPP (current):                                                   │
│  ─────────────────────────                                                   │
│  • Online DPP: Cloudflare Worker renders HTML, fetches data from R2         │
│  • Offline viewer: All data + verification code in one HTML file            │
│  • Both share the same DPP rendering templates (different delivery)         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### D.5 Implementation Priority

| Component | Priority | Dependency | Est. Effort |
|-----------|----------|------------|-------------|
| Identity Service (walt.id) | P0 | None | 2-3 weeks |
| VC Signing Pipeline | P0 | Identity Service | 1-2 weeks |
| Status List Tables | P1 | VC Signing | 1 week |
| Revocation API | P1 | Status List Tables | 1 week |
| Export Endpoints | P2 | All above | 2 weeks |
| Offline Viewer | P2 | VC Signing | 1 week |
| Full Export Package | P3 | Export Endpoints | 1 week |

**Total estimated: 9-12 weeks for full data sovereignty stack.**

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | January 2026 | Architecture Team | Initial release |
| 1.1 | January 2026 | Architecture Team | Added bulk DPP generation architecture |
| 1.2 | January 2026 | Architecture Team | Added idempotency, DLQ handling, R2 cost monitoring |
| 1.3 | January 2026 | Architecture Team | Added Platform tier ingestion spike handling, NAT bandwidth analysis, gross margin breakdown |
| 1.3.1 | January 2026 | Architecture Team | Added Section 12 (Standards & Data Formats), Appendix D (Planned Data Sovereignty Infrastructure) |
| 1.4 | January 2026 | Architecture Team | Updated pricing model to Base Fee + Per-DPP, renamed Mega to Platform tier |
| 1.5 | January 2026 | Architecture Team | Added Infrastructure Baseline (9.4), Auto-Scaling Layers (9.5), Manual Scaling Operations Guide (9.6) |
