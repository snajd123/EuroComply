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

EuroComply is a B2B SaaS platform for EU Digital Product Passport (DPP) compliance under the ESPR regulation. The platform uses a Base Fee + Per-DPP pricing model, with tiers from €149/month (Starter) to custom Enterprise/Platform pricing.

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

| Tier | Base Fee | Storage | Infra | Payment (3%) | API/Support | Total COGS | Base Margin | DPP Margin |
|------|----------|---------|-------|--------------|-------------|------------|-------------|------------|
| Starter (€149) | €149/mo | 500 GB | €3 | €4.50 | €5 | €12.50 | **92%** | **99%** |
| Growth (€299) | €299/mo | 1 TB | €5 | €9 | €10 | €24 | **92%** | **98%** |
| Scale (€749) | €749/mo | 2 TB | €15 | €22.50 | €25 | €62.50 | **92%** | **95%** |
| Enterprise (€1,999) | €1,999/mo | 5 TB | €100 | €60 | €75 | €235 | **88%** | **87%** |
| Platform (Custom) | Custom | Custom | €400+ | Custom | Custom | Custom | **70-80%** | **0-67%** |

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

| Tier | Base Fee | Storage | DPP Price | Volume Discounts | Target Customer |
|------|----------|---------|-----------|------------------|-----------------|
| Starter | €149/month | 500 GB | €0.10/DPP | 10K+: €0.08 | Micro-businesses, testing |
| Growth | €299/month | 1 TB | €0.05/DPP | 50K+: €0.03, 100K+: €0.02 | Small brands |
| Scale | €749/month | 2 TB | €0.02/DPP | 500K+: €0.01, 1M+: €0.008 | Mid-market manufacturers |
| Enterprise | €1,999/month | 5 TB | €0.008/DPP | 5M+: €0.005, 10M+: €0.003 | Large brands |
| Platform | Custom | Custom | €0.001-0.003 | Negotiated | Fortune 500 |

*Storage is for media files (images, PDFs, videos). Product data and DPP metadata are unlimited.*

All tiers include unlimited products/SKUs, unlimited users, and generous storage. Per-DPP pricing includes EPCIS events and 10-year hosting.

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

### 3.5 Connection Pooling Strategy (Scale-Critical)

Multi-tenant databases with schema-per-tenant face connection exhaustion at scale. With 200 tenants × 10 connections each = 2,000 connections against a PostgreSQL limit of ~300-500, we need external connection pooling.

#### PgBouncer Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONNECTION POOLING ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  APPLICATION LAYER (ECS Fargate)                                            │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                               │
│  │ Task 1 │ │ Task 2 │ │ Task 3 │ │ Task N │  (Each: 5-10 local conns)     │
│  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘                               │
│      │          │          │          │                                      │
│      └──────────┴──────────┴──────────┘                                      │
│                      │                                                       │
│                      ▼                                                       │
│  PGBOUNCER LAYER (Per Cell)                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PgBouncer Instance (ECS or EC2)                                     │    │
│  │  • Mode: transaction (return conn after each transaction)            │    │
│  │  • max_client_conn: 2,500                                            │    │
│  │  • default_pool_size: 20 per database (shared across tenants)        │    │
│  │  • reserve_pool_size: 5 (burst handling)                             │    │
│  │  • server_idle_timeout: 600s                                         │    │
│  └────────────────────────────────┬────────────────────────────────────┘    │
│                                   │                                          │
│                                   ▼                                          │
│  POSTGRESQL (Aurora)                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  max_connections: 400 (reserved: 50 for admin/monitoring)            │    │
│  │  Effective pool: 350 connections                                     │    │
│  │  schema_tenant_001 ──┐                                               │    │
│  │  schema_tenant_002 ──┼── Shared connection pool                      │    │
│  │  schema_tenant_NNN ──┘                                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### PgBouncer Configuration

```ini
; /etc/pgbouncer/pgbouncer.ini
[databases]
; Single database, schema-per-tenant model
eurocomply_cell1 = host=cell1.cluster-xxx.eu-central-1.rds.amazonaws.com port=5432 dbname=eurocomply

[pgbouncer]
; Connection limits
max_client_conn = 2500          ; Total application connections allowed
default_pool_size = 20          ; Connections per database (not per tenant!)
reserve_pool_size = 5           ; Extra connections for burst
reserve_pool_timeout = 3        ; Seconds to wait before using reserve

; Pooling mode - CRITICAL: must be 'transaction' for SET search_path
pool_mode = transaction

; Timeouts
server_idle_timeout = 600       ; Close idle backend connections after 10min
server_connect_timeout = 15     ; Timeout for new backend connections
client_idle_timeout = 300       ; Close idle client connections

; Connection reset - CRITICAL FOR SECURITY
server_reset_query = DISCARD ALL
server_reset_query_always = 1   ; Reset even on error/cancel

; Security
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

; Monitoring
stats_period = 60
admin_users = pgbouncer_admin
stats_users = pgbouncer_stats
```

#### Connection Math at Scale

| Scale Point | Tenants | ECS Tasks | Conn/Task | Total Client Conns | PgBouncer Pool | Backend Conns |
|-------------|---------|-----------|-----------|--------------------|--------------------|---------------|
| Launch | 10 | 2 | 10 | 20 | 20 | 20 |
| Growth | 50 | 4 | 10 | 40 | 20 | 20 |
| Scale | 200 | 8 | 10 | 80 | 25 | 25 |
| High Load | 200 | 20 | 10 | 200 | 50 | 50 |
| Burst | 200 | 50 | 10 | 500 | 80 | 80 |

**Key Insight:** PgBouncer's transaction mode multiplexes many client connections onto few backend connections. The pool size is per-database, not per-tenant, so 200 tenants share 25-50 connections.

#### Application-Level Pooling (Prisma/Node.js)

```typescript
// prisma/schema.prisma - connection limit per container
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL") // Points to PgBouncer
}

// Connection string format
// postgresql://user:pass@pgbouncer.internal:6432/eurocomply_cell1
//   ?connection_limit=10        // Per-container limit
//   &pool_timeout=10            // Wait 10s for connection
//   &pgbouncer=true             // Disable prepared statements (required!)

// CRITICAL: pgbouncer=true disables prepared statements
// Transaction pooling breaks prepared statements because different
// requests may get different backend connections
```

#### Schema Context in Transaction Pooling Mode

With transaction pooling, each transaction may get a different backend connection. The schema context MUST be set at the start of each transaction:

```typescript
class TenantConnection {
  async executeInTenantContext<T>(
    organizationId: string,
    operation: (client: PrismaClient) => Promise<T>
  ): Promise<T> {
    const config = await this.getTenantConfig(organizationId);

    // CRITICAL: Set schema at transaction start
    return await prisma.$transaction(async (tx) => {
      // Set schema context for this transaction
      await tx.$executeRawUnsafe(
        `SET search_path = ${config.schemaName}, public`
      );
      await tx.$executeRaw`SET app.current_org = ${organizationId}`;

      // Execute the operation
      return await operation(tx);
    });
  }
}
```

#### Health Monitoring

```sql
-- PgBouncer admin console queries
-- Connect: psql -h localhost -p 6432 -U pgbouncer_admin pgbouncer

-- Current connection status
SHOW POOLS;
-- database | user | cl_active | cl_waiting | sv_active | sv_idle | sv_used | ...

-- Alert thresholds
-- cl_waiting > 10: Pool exhaustion imminent
-- sv_active near pool_size: Consider increasing pool_size

-- Client connections
SHOW CLIENTS;
-- Track connections per application instance
```

#### Circuit Breaker for Connection Exhaustion

```typescript
// Prevent cascading failures when pool is exhausted
class ConnectionCircuitBreaker {
  private failures = 0;
  private lastFailure: Date | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  async getConnection(): Promise<Connection> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure!.getTime() > 30000) {
        this.state = 'half-open'; // Try one request
      } else {
        throw new ServiceUnavailableError('Database connection pool exhausted');
      }
    }

    try {
      const conn = await pool.connect({ timeout: 5000 });
      this.onSuccess();
      return conn;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = new Date();
    if (this.failures >= 5) {
      this.state = 'open';
      // Alert: Pool exhaustion detected
      metrics.increment('db.circuit_breaker.opened');
    }
  }
}
```

### 3.5.1 Connection Isolation Security

Transaction mode with schema-per-tenant requires careful connection handling. However, EuroComply's per-tenant credentials architecture makes cross-tenant data leaks **not possible**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              CONNECTION ISOLATION - DEFENSE IN DEPTH                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Layer 1: PgBouncer Reset (PRIMARY)                                         │
│  └── server_reset_query = DISCARD ALL                                       │
│  └── server_reset_query_always = 1 (even on error)                          │
│  └── Executed BEFORE connection returned to pool                            │
│                                                                              │
│  Layer 2: Per-Tenant Credentials (CRITICAL)                                 │
│  └── Each tenant has dedicated PostgreSQL role                              │
│  └── Role has USAGE only on its own schema                                  │
│  └── Even if search_path leaks, credential can't access other schemas       │
│                                                                              │
│  Layer 3: Row-Level Security (DEFENSE IN DEPTH)                             │
│  └── app.current_org context variable                                       │
│  └── RLS policies filter by organization_id                                 │
│  └── Catches any schema isolation failures                                  │
│                                                                              │
│  Layer 4: Application-Level SET (BELT AND SUSPENDERS)                       │
│  └── SET search_path at transaction start                                   │
│  └── SET app.current_org at transaction start                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why Transaction Mode is Safe with Per-Tenant Credentials:**

| Concern | Mitigation | Residual Risk |
|---------|------------|---------------|
| search_path leak | Per-tenant credentials can't access other schemas | None |
| RESET ALL failure | server_reset_query_always=1 + per-tenant creds | None |
| Race condition | PgBouncer serializes reset before reuse | None |

**Blast Radius Analysis:**

| Failure Mode | With Cell Credentials | With Per-Tenant Credentials |
|--------------|----------------------|----------------------------|
| search_path leak | ~200 tenants exposed | 0 tenants exposed |
| RESET failure | ~200 tenants exposed | 0 tenants exposed |
| Both failures | ~200 tenants exposed | 0 tenants exposed |

Per-tenant credentials make the pooling mode security concern **moot**. See SECURITY.md §13.10 for credential implementation details.

### 3.6 Tenant Provisioning

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

### 3.7 Configuration Database Resilience

The configuration database (routing tables in DynamoDB + cell metadata in PostgreSQL) is critical infrastructure. If unavailable, tenant routing fails and the entire platform is inaccessible.

#### High Availability Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONFIGURATION DATABASE HA                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  GLOBAL ROUTING (DynamoDB Global Tables)                                    │
│  ───────────────────────────────────────                                    │
│                                                                              │
│  ┌─────────────────────┐         ┌─────────────────────┐                   │
│  │  eu-central-1       │◄───────►│  eu-west-1          │                   │
│  │  (Primary)          │  sync   │  (Secondary)        │                   │
│  │                     │  <1s    │                     │                   │
│  │  eurocomply-routing │         │  eurocomply-routing │                   │
│  └─────────────────────┘         └─────────────────────┘                   │
│           │                               │                                  │
│           │                               │                                  │
│       Route 53 latency-based routing                                        │
│           │                               │                                  │
│           ▼                               ▼                                  │
│  ┌─────────────────────┐         ┌─────────────────────┐                   │
│  │  API Servers        │         │  API Servers        │                   │
│  │  (eu-central-1)     │         │  (eu-west-1)        │                   │
│  └─────────────────────┘         └─────────────────────┘                   │
│                                                                              │
│  Benefits:                                                                  │
│  • Active-active in both regions                                           │
│  • Automatic failover via Route 53                                         │
│  • < 1 second replication lag                                              │
│  • 99.999% availability SLA                                                │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  CELL CONFIGURATION (Aurora Global Database)                                │
│  ───────────────────────────────────────────                                │
│                                                                              │
│  Each cell's config schema uses Aurora with read replica in DR region:     │
│                                                                              │
│  ┌─────────────────────┐         ┌─────────────────────┐                   │
│  │  eu-central-1       │────────►│  eu-west-1          │                   │
│  │  Aurora Primary     │  async  │  Aurora Replica     │                   │
│  │  (read/write)       │  <1s    │  (read-only)        │                   │
│  │                     │         │                     │                   │
│  │  schema_config      │         │  schema_config      │                   │
│  └─────────────────────┘         └─────────────────────┘                   │
│                                          │                                  │
│                              On failover: promoted to read/write            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### RTO/RPO Targets

| Component | RPO | RTO | Mechanism |
|-----------|-----|-----|-----------|
| DynamoDB Global Tables | < 1 second | < 1 minute | Active-active replication |
| Aurora Cell Config | < 1 second | < 1 minute | Global Database failover |
| Redis Routing Cache | N/A (cache) | < 5 seconds | Auto-rebuild from source |

#### Automated Failover Triggers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FAILOVER TRIGGERS                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DYNAMODB (Automatic via Global Tables)                                     │
│  ──────────────────────────────────────                                     │
│  • Region unavailable: Traffic routes to secondary region automatically    │
│  • No manual intervention required                                          │
│  • Route 53 health checks detect failure in < 30 seconds                   │
│                                                                              │
│  AURORA (Automated Failover)                                                │
│  ──────────────────────────                                                 │
│  Trigger conditions (any one):                                              │
│  • Primary instance unavailable > 30 seconds                               │
│  • Replication lag > 10 seconds sustained for 1 minute                     │
│  • Storage subsystem failure detected                                       │
│  • Manual trigger via AWS Console or CLI                                    │
│                                                                              │
│  Failover sequence:                                                         │
│  1. Aurora detects failure (< 30 seconds)                                  │
│  2. Promotes read replica to primary (< 30 seconds)                        │
│  3. Updates DNS endpoint (< 10 seconds)                                    │
│  4. Applications reconnect automatically                                    │
│  Total RTO: < 1 minute                                                      │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  MANUAL FAILOVER (Operations Console)                                       │
│  ────────────────────────────────────                                       │
│  Use cases:                                                                 │
│  • Planned maintenance in primary region                                   │
│  • Performance degradation detected                                         │
│  • Security incident requiring region isolation                             │
│                                                                              │
│  Command:                                                                   │
│  aws rds failover-global-cluster \                                         │
│    --global-cluster-identifier eurocomply-global \                         │
│    --target-db-cluster-identifier eurocomply-cell-1-eu-west-1              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Failover Procedure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FAILOVER RUNBOOK                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  AUTOMATIC FAILOVER (No Action Required)                                    │
│  ───────────────────────────────────────                                    │
│  1. CloudWatch alarm triggers PagerDuty notification                        │
│  2. Aurora/DynamoDB performs automatic failover                             │
│  3. On-call engineer monitors progress                                      │
│  4. Verify services recovered via health check dashboard                    │
│  5. Document incident in post-mortem                                        │
│                                                                              │
│  MANUAL FAILOVER (Planned Maintenance)                                      │
│  ─────────────────────────────────────                                      │
│  1. Announce maintenance window (24h notice for non-emergency)              │
│  2. Verify DR region is healthy and in-sync                                 │
│  3. Drain connections from primary (set maintenance mode)                   │
│  4. Execute failover command                                                │
│  5. Verify secondary promoted successfully                                  │
│  6. Run integration test suite against new primary                          │
│  7. Clear maintenance mode                                                  │
│  8. Monitor for 30 minutes post-failover                                    │
│                                                                              │
│  POST-FAILOVER VALIDATION CHECKLIST                                         │
│  ──────────────────────────────────                                         │
│  □ All API health checks passing                                            │
│  □ Tenant routing resolves correctly (sample 10 tenants)                   │
│  □ New tenant signup works                                                  │
│  □ DPP issuance works (test credential)                                    │
│  □ Dashboard login works                                                    │
│  □ Replication from new primary to new secondary established               │
│  □ Alerting updated for new topology                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Cell Provisioning Prerequisites

Before provisioning a new cell, the configuration database must be healthy:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CELL PROVISIONING HEALTH CHECK                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRE-PROVISIONING CHECKS (Automated)                                        │
│  ───────────────────────────────────                                        │
│                                                                              │
│  □ DynamoDB Global Tables healthy                                           │
│    └── Check: aws dynamodb describe-table shows ACTIVE in both regions     │
│                                                                              │
│  □ Aurora Global Database healthy                                           │
│    └── Check: aws rds describe-global-clusters shows all members AVAILABLE │
│                                                                              │
│  □ Replication lag < 1 second                                               │
│    └── Check: CloudWatch AuroraGlobalDBReplicationLag metric                │
│                                                                              │
│  □ No active failovers in progress                                          │
│    └── Check: aws rds describe-events --source-type db-cluster             │
│                                                                              │
│  □ Primary region not in maintenance window                                 │
│    └── Check: internal maintenance calendar API                            │
│                                                                              │
│  PROVISIONING BLOCKED IF:                                                   │
│  ────────────────────────                                                   │
│  • Any health check fails                                                   │
│  • Replication lag > 5 seconds                                              │
│  • Active incident affecting config database                                │
│  • Primary region capacity > 90%                                            │
│                                                                              │
│  OVERRIDE (Emergency Only):                                                 │
│  ─────────────────────────                                                  │
│  Platform lead can override with documented justification:                  │
│  terraform apply -var="skip_config_health_check=true" \                    │
│                  -var="override_reason=INCIDENT-123"                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Monitoring and Alerting

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| DynamoDB read latency | > 10ms | > 50ms | Check region health |
| DynamoDB write latency | > 20ms | > 100ms | Check replication |
| Aurora replication lag | > 1s | > 5s | Investigate, prepare failover |
| Aurora connections | > 80% max | > 95% max | Scale or provision new cell |
| Config DB error rate | > 0.1% | > 1% | Page on-call |
| Routing cache miss rate | > 10% | > 30% | Check Redis health |

### 3.8 Circuit Breakers for External Services

External API dependencies (walt.id, Shopify, GLEIF, etc.) can cause cascading failures if they become unavailable or slow. Circuit breakers prevent this by failing fast when dependencies are unhealthy.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CIRCUIT BREAKER PATTERN                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STATES:                                                                     │
│                                                                              │
│  ┌─────────┐       failures >= threshold        ┌─────────┐                │
│  │ CLOSED  │ ──────────────────────────────────▶│  OPEN   │                │
│  │(Normal) │                                     │ (Fast   │                │
│  └────┬────┘                                     │  Fail)  │                │
│       │                                          └────┬────┘                │
│       │                                               │                      │
│       │           success                    timeout elapsed                │
│       │              │                               │                      │
│       │              │    ┌─────────────┐           │                      │
│       │              └────│ HALF-OPEN   │◀──────────┘                      │
│       │                   │ (Test One)  │                                   │
│       │                   └──────┬──────┘                                   │
│       │                          │ failure                                  │
│       │                          ▼                                          │
│       │                   Back to OPEN                                      │
│       │                                                                      │
│       └──────────────────────────────────────────────────────────────────   │
│                                                                              │
│  CLOSED: Normal operation, requests pass through                            │
│  OPEN: Fail immediately, don't call external service                        │
│  HALF-OPEN: Allow one request to test if service recovered                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### External Service Configuration

```typescript
// Circuit breaker configuration per external service
const circuitBreakerConfigs: Record<string, CircuitBreakerConfig> = {
  // walt.id VC signing - critical path
  'walt.id': {
    failureThreshold: 5,          // Failures before opening
    successThreshold: 2,          // Successes to close
    timeout: 30000,               // Time in OPEN state before testing (ms)
    requestTimeout: 10000,        // Individual request timeout
    volumeThreshold: 10,          // Minimum requests before evaluating
    fallback: 'queue',            // Queue for later retry
  },

  // Shopify integration - non-critical
  'shopify': {
    failureThreshold: 3,
    successThreshold: 1,
    timeout: 60000,
    requestTimeout: 15000,
    volumeThreshold: 5,
    fallback: 'degraded',         // Return partial data
  },

  // GLEIF/VIES verification - can be deferred
  'gleif': {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 120000,              // 2 minutes (lower priority)
    requestTimeout: 30000,
    volumeThreshold: 5,
    fallback: 'skip',             // Skip verification, flag for later
  },

  // Redis cache - fast fail
  'redis': {
    failureThreshold: 3,
    successThreshold: 1,
    timeout: 5000,                // 5 seconds
    requestTimeout: 500,          // Very low timeout
    volumeThreshold: 10,
    fallback: 'bypass',           // Bypass cache, hit database
  },
};
```

#### Implementation

```typescript
import CircuitBreaker from 'opossum';

class ExternalServiceClient {
  private breakers: Map<string, CircuitBreaker> = new Map();

  constructor(private readonly metrics: MetricsClient) {}

  getBreaker(serviceName: string): CircuitBreaker {
    if (this.breakers.has(serviceName)) {
      return this.breakers.get(serviceName)!;
    }

    const config = circuitBreakerConfigs[serviceName];
    const breaker = new CircuitBreaker(
      async (request: () => Promise<unknown>) => request(),
      {
        timeout: config.requestTimeout,
        errorThresholdPercentage: 50,
        resetTimeout: config.timeout,
        volumeThreshold: config.volumeThreshold,
      }
    );

    // Metrics integration
    breaker.on('success', () => {
      this.metrics.increment(`circuit.${serviceName}.success`);
    });

    breaker.on('failure', () => {
      this.metrics.increment(`circuit.${serviceName}.failure`);
    });

    breaker.on('open', () => {
      this.metrics.increment(`circuit.${serviceName}.opened`);
      // Alert on-call
      alerting.warn({
        service: serviceName,
        event: 'circuit_breaker_opened',
        message: `Circuit breaker opened for ${serviceName}`,
      });
    });

    breaker.on('halfOpen', () => {
      this.metrics.increment(`circuit.${serviceName}.half_open`);
    });

    breaker.on('close', () => {
      this.metrics.increment(`circuit.${serviceName}.closed`);
    });

    this.breakers.set(serviceName, breaker);
    return breaker;
  }
}

// Usage in services
class CredentialService {
  constructor(
    private readonly waltIdClient: WaltIdClient,
    private readonly circuitBreaker: ExternalServiceClient
  ) {}

  async signCredential(credential: Credential): Promise<SignedCredential> {
    const breaker = this.circuitBreaker.getBreaker('walt.id');

    try {
      return await breaker.fire(async () => {
        return await this.waltIdClient.sign(credential);
      });
    } catch (error) {
      if (error.message === 'Breaker is open') {
        // Circuit is open - use fallback
        return await this.queueForLaterSigning(credential);
      }
      throw error;
    }
  }

  private async queueForLaterSigning(credential: Credential): Promise<SignedCredential> {
    // Store in outbox for retry when service recovers
    await this.outbox.create({
      type: 'credential.sign',
      payload: credential,
      status: 'pending_external_service',
    });

    return {
      ...credential,
      status: 'pending_signature',
      message: 'Credential queued for signing, will complete shortly',
    };
  }
}
```

#### Fallback Strategies

| Service | Fallback | User Impact |
|---------|----------|-------------|
| **walt.id** | Queue for later | DPP issuance delayed, user notified |
| **Shopify** | Return cached/partial | Some data may be stale |
| **GLEIF** | Skip verification | LEI not verified, flagged for review |
| **Redis** | Bypass cache | Higher database load, slower response |
| **PgBouncer** | Reject requests | 503 Service Unavailable |

#### Monitoring Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CIRCUIT BREAKER STATUS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SERVICE         STATE      FAILURES    SUCCESS RATE    LAST ERROR          │
│  ───────────────────────────────────────────────────────────────────────    │
│  walt.id         CLOSED     0/5         99.8%           -                   │
│  shopify         CLOSED     1/3         98.2%           2m ago              │
│  gleif           HALF-OPEN  4/5         72.1%           30s ago             │
│  redis           CLOSED     0/3         99.99%          -                   │
│  pgbouncer       CLOSED     0/5         100%            -                   │
│                                                                              │
│  ⚠️ GLEIF circuit breaker in HALF-OPEN state - testing recovery             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
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

### 4.2.1 Data Key Caching

To support bulk operations (1M+ DPPs) without hitting KMS rate limits or costs, EuroComply uses the **AWS Encryption SDK data key caching** pattern:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATA KEY CACHING ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  AWS KMS (CMK)                                                              │
│      │                                                                      │
│      └─► GenerateDataKey (once per cache period)                           │
│              │                                                              │
│              ▼                                                              │
│      Tenant DEK (plaintext + encrypted)                                    │
│              │                                                              │
│              ├─► Worker Memory Cache (5-10 min TTL)                        │
│              │       • Max 1M operations per cached key                    │
│              │       • Isolated per tenant                                 │
│              │                                                              │
│              └─► Redis Shared Cache (5 min TTL)                            │
│                      • Fallback for new workers                            │
│                      • Encrypted at rest                                    │
│                                                                              │
│  BULK OPERATION FLOW:                                                      │
│  1. Worker starts → check memory cache                                     │
│  2. Cache miss → check Redis cache                                         │
│  3. Redis miss → KMS GenerateDataKey → cache everywhere                    │
│  4. Process 1M items using cached DEK                                      │
│  5. Zero additional KMS calls                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why This Matters:**

| Scenario | Without Cache | With Cache | Savings |
|----------|--------------|------------|---------|
| 1M DPPs | 2M+ KMS calls ($6) | ~10 KMS calls ($0.00003) | 99.9995% |
| 10M DPPs | 20M+ KMS calls ($60) | ~10 KMS calls ($0.00003) | 99.9999% |
| Rate limit risk | High (5,500/sec limit) | None | - |

**Caching Strategy:**

| Context | Cache Location | TTL | Max Uses |
|---------|---------------|-----|----------|
| API workers | In-memory | 5 minutes | 10,000 |
| Bulk workers | In-memory | 10 minutes | 1,000,000 |
| Redis (shared) | Redis | 5 minutes | Unlimited |

**Security Constraints:**
- DEK cached for max 10 minutes
- Max 1M operations per cached key (whichever comes first)
- Cache cleared on worker restart
- Tenant isolation enforced (separate cache entries per org)

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

The complete tenant schema includes tables for products, versioning, users, attestations, audit, and DPP issuance. All tables include standard audit columns for compliance.

#### 5.2.1 Standard Audit Columns

Every table includes these columns for compliance and debugging:

```sql
-- Applied to ALL tables
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
created_by UUID NOT NULL,
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_by UUID NOT NULL,
deleted_at TIMESTAMPTZ,           -- Soft delete timestamp
deleted_by UUID,                  -- Who deleted
version INTEGER NOT NULL DEFAULT 1  -- Optimistic locking
```

#### 5.2.2 Core Product Tables

```sql
-- Products: Central product registry
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
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID NOT NULL,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID,
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid),
    CONSTRAINT unique_gtin_per_org UNIQUE (organization_id, gtin),
    CONSTRAINT unique_sku_per_org UNIQUE (organization_id, sku)
);

-- Product Versions: Version control per workspace
-- Marketing can ONLY create versions for Design versions in RELEASED_TO_OPS state
CREATE TABLE product_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    workspace TEXT NOT NULL CHECK (workspace IN ('design', 'operations', 'marketing', 'compliance')),
    version_number INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'draft',           -- Initial state
        'checked_out',     -- Being edited (locked)
        'checked_in',      -- Edit complete, immutable
        'released_to_ops', -- Design: available for batches
        'released_for_dpp' -- Marketing: available for DPP
    )),
    data JSONB NOT NULL,
    -- Version linkage
    based_on_design_version_id UUID REFERENCES product_versions(id),  -- For Marketing versions
    -- Checkout tracking
    checked_out_by UUID,
    checked_out_at TIMESTAMPTZ,
    checkout_expires_at TIMESTAMPTZ,
    -- Release tracking
    released_by UUID,
    released_at TIMESTAMPTZ,
    release_note TEXT,
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID NOT NULL,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID,
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT unique_version_per_workspace UNIQUE (product_id, workspace, version_number),
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);
```

#### 5.2.3 Operations Tables

```sql
-- Batches: Production batches (Operations workspace)
-- Immutable from creation, references a released Design version
CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    batch_number TEXT NOT NULL,
    design_version_id UUID NOT NULL REFERENCES product_versions(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',          -- Draft, editable
        'committed',        -- Locked, inventory deducted
        'released_for_dpp'  -- Ready for DPP issuance
    )),
    quantity INTEGER NOT NULL,
    serial_range_start TEXT,
    serial_range_end TEXT,
    production_date DATE,
    facility_id TEXT,
    -- Commit/Release tracking
    committed_at TIMESTAMPTZ,
    committed_by UUID,
    released_at TIMESTAMPTZ,
    released_by UUID,
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID NOT NULL,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID,
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT unique_batch_number_per_org UNIQUE (organization_id, batch_number),
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);

-- EPCIS Events: Supply chain events (immutable)
CREATE TABLE epcis_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    batch_id UUID NOT NULL REFERENCES batches(id),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'object', 'aggregation', 'transaction', 'transformation'
    )),
    action TEXT NOT NULL CHECK (action IN ('ADD', 'OBSERVE', 'DELETE')),
    biz_step TEXT,
    disposition TEXT,
    read_point TEXT,
    biz_location TEXT,
    event_time TIMESTAMPTZ NOT NULL,
    event_timezone TEXT,
    epcis_data JSONB NOT NULL,
    -- Audit columns (immutable - no updated_by)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);
```

#### 5.2.4 DPP & Passport Tables

```sql
-- Passports: DPP issuance records
CREATE TABLE passports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    batch_id UUID NOT NULL REFERENCES batches(id),
    design_version_id UUID NOT NULL REFERENCES product_versions(id),
    marketing_version_id UUID REFERENCES product_versions(id),
    passport_version INTEGER NOT NULL DEFAULT 1,
    status TEXT DEFAULT 'draft' CHECK (status IN (
        'draft', 'snapshot_created', 'approved', 'published', 'revoked'
    )),
    template_id TEXT,
    static_url_base TEXT,
    -- Snapshot reference
    snapshot_id UUID,
    -- Publishing
    published_at TIMESTAMPTZ,
    published_by UUID,
    -- Revocation
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,
    revocation_reason TEXT,
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID NOT NULL,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID,
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);

-- DPP Sustainability: Decomposed from JSONB for queryability
CREATE TABLE dpp_sustainability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passport_id UUID NOT NULL REFERENCES passports(id) ON DELETE CASCADE,
    carbon_footprint_kg_co2e DECIMAL,
    carbon_scope TEXT CHECK (carbon_scope IN ('cradle-to-gate', 'cradle-to-grave', 'gate-to-gate')),
    recyclability_percent DECIMAL CHECK (recyclability_percent BETWEEN 0 AND 100),
    recycled_content_percent DECIMAL CHECK (recycled_content_percent BETWEEN 0 AND 100),
    durability_score INTEGER CHECK (durability_score BETWEEN 1 AND 10),
    repairability_score INTEGER CHECK (repairability_score BETWEEN 1 AND 10),
    energy_efficiency_class TEXT,
    water_usage_liters DECIMAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DPP Materials: Material composition (decomposed from JSONB)
CREATE TABLE dpp_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passport_id UUID NOT NULL REFERENCES passports(id) ON DELETE CASCADE,
    material_name TEXT NOT NULL,
    percentage DECIMAL NOT NULL CHECK (percentage BETWEEN 0 AND 100),
    material_type TEXT,  -- 'primary', 'secondary', 'packaging'
    recycled BOOLEAN DEFAULT false,
    certified BOOLEAN DEFAULT false,
    certification_name TEXT,
    country_of_origin TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DPP Certifications: Product certifications (decomposed from JSONB)
CREATE TABLE dpp_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passport_id UUID NOT NULL REFERENCES passports(id) ON DELETE CASCADE,
    certification_name TEXT NOT NULL,
    issuing_body TEXT NOT NULL,
    certificate_number TEXT,
    issue_date DATE,
    expiry_date DATE,
    verification_url TEXT,
    verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compliance Snapshots: Immutable snapshots for approval workflow
CREATE TABLE compliance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    passport_id UUID NOT NULL REFERENCES passports(id),
    content_hash TEXT NOT NULL,  -- SHA-256 of snapshot content
    snapshot_data JSONB NOT NULL,  -- Frozen copy of all workspace data
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'rejected'
    )),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_by UUID NOT NULL,
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID,
    rejection_reason TEXT,
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);
```

#### 5.2.5 User & Access Tables

```sql
-- Users: User accounts within tenant
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    user_type TEXT NOT NULL CHECK (user_type IN ('internal', 'guest_partner', 'transactional')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'deactivated')),
    is_admin BOOLEAN NOT NULL DEFAULT false,
    -- Guest partner specific
    invitation_expires_at TIMESTAMPTZ,
    access_expires_at TIMESTAMPTZ,  -- 90 days default for guests
    -- DID management
    did_key TEXT,
    did_method TEXT CHECK (did_method IN ('key', 'web', 'ion')),
    -- MFA
    mfa_enabled BOOLEAN NOT NULL DEFAULT false,
    mfa_method TEXT CHECK (mfa_method IN ('totp', 'webauthn')),
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID NOT NULL,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID,
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT unique_email_per_org UNIQUE (organization_id, email),
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);

-- Workspace Access: User permissions per workspace
CREATE TABLE workspace_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace TEXT NOT NULL CHECK (workspace IN ('design', 'operations', 'marketing', 'compliance')),
    authority TEXT NOT NULL CHECK (authority IN ('viewer', 'contributor', 'editor', 'manager')),
    -- For Compliance workspace, different roles
    compliance_role TEXT CHECK (compliance_role IN ('viewer', 'reviewer', 'approver')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    CONSTRAINT unique_user_workspace UNIQUE (user_id, workspace)
);

-- API Keys: Machine authentication
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,  -- SHA-256 of the key
    key_prefix TEXT NOT NULL,  -- First 8 chars for identification
    scopes TEXT[] NOT NULL,  -- Array of scopes
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);

-- DIDs: Decentralized Identifier storage
CREATE TABLE dids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'organization')),
    owner_id UUID NOT NULL,
    did_key TEXT NOT NULL UNIQUE,
    did_method TEXT NOT NULL CHECK (did_method IN ('key', 'web', 'ion')),
    public_key_jwk JSONB NOT NULL,
    -- walt.id custodian reference
    custodian_key_id TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotated', 'revoked')),
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);
```

#### 5.2.6 Attestation Tables

```sql
-- Attestations: Third-party attestations and claims
CREATE TABLE attestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    attestation_type TEXT NOT NULL CHECK (attestation_type IN (
        'certification', 'test_result', 'supplier_declaration', 'audit_report'
    )),
    signer_type TEXT NOT NULL CHECK (signer_type IN ('user', 'organization', 'contributor')),
    signer_id UUID NOT NULL,
    signer_did TEXT NOT NULL,
    claim_data JSONB NOT NULL,
    signature TEXT NOT NULL,  -- VC proof
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'verified', 'rejected', 'expired'
    )),
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);

-- Contributors: External attestation providers
CREATE TABLE contributors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    company_name TEXT,
    contributor_type TEXT NOT NULL CHECK (contributor_type IN (
        'supplier', 'lab', 'certifier', 'auditor'
    )),
    did_key TEXT,
    status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended')),
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID NOT NULL,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);
```

#### 5.2.7 Audit & Event Tables

```sql
-- Audit Log: Compliance audit trail (append-only)
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    user_id UUID,
    action TEXT NOT NULL,  -- 'product.created', 'passport.published', etc.
    resource_type TEXT NOT NULL,
    resource_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);

-- Event Outbox: Transactional outbox pattern for reliable event delivery
CREATE TABLE event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    event_version TEXT NOT NULL DEFAULT '1.0',
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    payload JSONB NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_message TEXT,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);

-- Status Lists: VC revocation status (StatusList2021)
CREATE TABLE status_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    list_type TEXT NOT NULL CHECK (list_type IN ('revocation', 'suspension')),
    encoded_list TEXT NOT NULL,  -- Base64-encoded bitstring
    list_size INTEGER NOT NULL DEFAULT 131072,  -- 16KB = 131072 credentials
    next_index INTEGER NOT NULL DEFAULT 0,
    credential_url TEXT NOT NULL,  -- URL where this list is published
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);

-- Webhooks: Webhook configuration
CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    secret_hash TEXT NOT NULL,  -- SHA-256 of webhook secret
    events TEXT[] NOT NULL,  -- Array of event types to subscribe to
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'failed')),
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID NOT NULL,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);

-- Batch Jobs: Background job tracking
CREATE TABLE batch_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    passport_id UUID REFERENCES passports(id),
    job_type TEXT NOT NULL CHECK (job_type IN ('generate_dpps', 'import_items', 'export', 'bulk_update')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    idempotency_key TEXT UNIQUE,
    total_items INTEGER NOT NULL,
    processed_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    error_log JSONB,
    progress_checkpoint JSONB,  -- For resumable jobs
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT org_check CHECK (organization_id = current_setting('app.tenant_id')::uuid)
);
```

#### 5.2.8 Indexes for Scale

```sql
-- Composite indexes for common queries (org_id + status pattern)
CREATE INDEX idx_products_org_status ON products(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_gtin ON products(gtin) WHERE gtin IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_products_sku ON products(sku) WHERE sku IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_product_versions_org_status ON product_versions(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_product_versions_product_workspace ON product_versions(product_id, workspace, status);
CREATE INDEX idx_product_versions_checkout ON product_versions(checked_out_by, checkout_expires_at)
    WHERE status = 'checked_out';

CREATE INDEX idx_batches_org_status ON batches(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_batches_design_version ON batches(design_version_id);

CREATE INDEX idx_passports_org_status ON passports(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_passports_batch ON passports(batch_id);
CREATE INDEX idx_passports_product ON passports(product_id);

CREATE INDEX idx_dpp_sustainability_passport ON dpp_sustainability(passport_id);
CREATE INDEX idx_dpp_sustainability_carbon ON dpp_sustainability(carbon_footprint_kg_co2e)
    WHERE carbon_footprint_kg_co2e IS NOT NULL;
CREATE INDEX idx_dpp_materials_passport ON dpp_materials(passport_id);
CREATE INDEX idx_dpp_certifications_passport ON dpp_certifications(passport_id);
CREATE INDEX idx_dpp_certifications_expiry ON dpp_certifications(expiry_date) WHERE expiry_date IS NOT NULL;

CREATE INDEX idx_users_org_status ON users(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email);

CREATE INDEX idx_audit_log_org_created ON audit_log(organization_id, created_at DESC);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);

CREATE INDEX idx_event_outbox_pending ON event_outbox(created_at) WHERE status = 'pending';
CREATE INDEX idx_event_outbox_failed ON event_outbox(failed_at) WHERE status = 'failed' AND retry_count < max_retries;

CREATE INDEX idx_batch_jobs_org_status ON batch_jobs(organization_id, status);
CREATE INDEX idx_batch_jobs_pending ON batch_jobs(created_at) WHERE status IN ('pending', 'processing');

CREATE INDEX idx_epcis_events_batch ON epcis_events(batch_id);
CREATE INDEX idx_epcis_events_time ON epcis_events(event_time);

CREATE INDEX idx_attestations_product ON attestations(product_id);
CREATE INDEX idx_attestations_status ON attestations(status, expires_at);
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

#### 6.2.1 Workspace Hub Synchronization

Each product exists across four workspaces (Design, Operations, Marketing, Compliance), with the Hub as the central source of truth. Workspaces synchronize via an event bus with eventual consistency.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORKSPACE HUB SYNCHRONIZATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────┐          ┌─────────────────┐          ┌─────────┐            │
│   │ DESIGN  │ ────────▶│                 │◀──────── │  OPS    │            │
│   │Workspace│          │                 │          │Workspace│            │
│   └─────────┘          │    PRODUCT      │          └─────────┘            │
│        │               │      HUB        │               │                 │
│        │               │  (Source of     │               │                 │
│        │               │    Truth)       │               │                 │
│   ┌─────────┐          │                 │          ┌─────────┐            │
│   │MARKETING│ ────────▶│                 │◀──────── │COMPLIANCE│           │
│   │Workspace│          │                 │          │Workspace│            │
│   └─────────┘          └─────────────────┘          └─────────┘            │
│                               │                                            │
│                               ▼                                            │
│                    ┌─────────────────────┐                                 │
│                    │   PUBLISHED DPP     │                                 │
│                    │  (Immutable VC)     │                                 │
│                    └─────────────────────┘                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Synchronization Architecture:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EVENT BUS SYNC FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Workspace Change                                                           │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │  Business   │────▶│   Outbox    │────▶│   SQS/SNS   │                   │
│  │   Logic     │     │   Table     │     │  Event Bus  │                   │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│       │                                         │                          │
│       │ Same Transaction                        │                          │
│       ▼                                         ▼                          │
│  ┌─────────────┐                          ┌─────────────┐                  │
│  │  Workspace  │                          │  Hub Sync   │                  │
│  │  Database   │                          │   Worker    │                  │
│  └─────────────┘                          └─────────────┘                  │
│                                                 │                          │
│                                                 ▼                          │
│                                           ┌─────────────┐                  │
│                                           │  Hub Update │                  │
│                                           │ + Fan-out   │                  │
│                                           └─────────────┘                  │
│                                                 │                          │
│                          ┌──────────────────────┼──────────────────────┐   │
│                          ▼                      ▼                      ▼   │
│                    ┌──────────┐           ┌──────────┐           ┌──────────┐
│                    │ Design   │           │  Ops     │           │Marketing │
│                    │ Listener │           │ Listener │           │ Listener │
│                    └──────────┘           └──────────┘           └──────────┘
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Consistency Model: Eventual**

| Property | Guarantee |
|----------|-----------|
| Sync latency | < 5 seconds typical, < 30 seconds P99 |
| Ordering | Per-product ordering via partition key |
| Durability | At-least-once delivery with idempotent handlers |
| Conflict handling | N/A - checkout system prevents concurrent edits |

**Event Types:**

```typescript
type WorkspaceSyncEvent =
  | { type: 'product.field.updated'; productId: string; workspace: Workspace; field: string; version: number }
  | { type: 'product.version.checked_in'; productId: string; version: number; checkedInBy: string }
  | { type: 'product.version.checked_out'; productId: string; version: number; checkedOutBy: string }
  | { type: 'dpp.submitted_for_approval'; productId: string; versionId: string }
  | { type: 'dpp.approved'; productId: string; credentialId: string }
  | { type: 'dpp.rejected'; productId: string; reason: string };

interface SyncEvent {
  eventId: string;           // Idempotency key
  timestamp: string;         // ISO 8601
  productId: string;         // Partition key for ordering
  sourceWorkspace: Workspace;
  payload: WorkspaceSyncEvent;
}
```

**Failure Recovery:**

| Failure Mode | Recovery Action |
|--------------|-----------------|
| Sync worker crash | SQS visibility timeout → automatic retry |
| Poison message | Move to DLQ after 3 retries, alert ops team |
| Hub temporarily unavailable | Exponential backoff, messages queue in SQS |
| Workspace DB write failure | Retry with idempotent handler, log to audit |

**Dead Letter Queue Handling:**

```
DLQ Runbook:
1. Alert triggered: "workspace-sync-dlq messages > 0"
2. Inspect failed messages: aws sqs receive-message --queue-url $DLQ_URL
3. Identify failure pattern (schema mismatch, permission, timeout)
4. Fix root cause
5. Replay messages: ./ops-cli sync replay-dlq --queue workspace-sync-dlq
6. Monitor for successful processing
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

### 7.2.1 DEK Handling in Bulk Workers

Each bulk worker pre-warms the DEK cache before processing chunks to avoid KMS rate limits (see §4.2.1 Data Key Caching):

```
PER-CHUNK DEK FLOW:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  1. Receive chunk message with organizationId            [0ms]              │
│                    │                                                        │
│                    ▼                                                        │
│  2. Check worker memory cache for tenant DEK             [<1ms]             │
│                    │                                                        │
│        ┌──────────┴──────────┐                                             │
│        │ Cache Hit           │ Cache Miss                                  │
│        ▼                     ▼                                              │
│     Use cached DEK     3. Check Redis cache              [5ms]             │
│        │                     │                                              │
│        │             ┌───────┴───────┐                                     │
│        │             │ Redis Hit     │ Redis Miss                          │
│        │             ▼               ▼                                      │
│        │         Use Redis DEK   4. KMS GenerateDataKey  [50-200ms]        │
│        │             │               │                                      │
│        │             │               └─► Cache in memory + Redis           │
│        │             │                                                      │
│        └─────────────┴───────────────┘                                     │
│                    │                                                        │
│                    ▼                                                        │
│  5. Process 1,000 items with cached DEK                  [1,100ms]         │
│  6. DEK remains cached for next chunk                    [0ms lookup]      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

RESULT: First chunk pays ~200ms KMS cost, subsequent chunks pay 0ms.

WORST CASE (new worker, empty cache):
- 1M items = 1,000 chunks
- First chunk: 1 KMS call
- Remaining 999 chunks: 0 KMS calls
- Total KMS calls: 1 (vs 2M+ without caching)
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

**KMS Cost with Data Key Caching (see §4.2.1):**

| DPP Volume/Month | KMS Calls (Without Cache) | KMS Calls (With Cache) | Cost |
|------------------|---------------------------|------------------------|------|
| Base (no bulk) | ~10,000 | ~10,000 | €0.03 |
| 1M DPPs | 2M+ | ~10,100 | €0.03 |
| 100M DPPs | 200M+ ($600) | ~11,000 | €0.03 |

Data key caching reduces KMS costs to near-zero regardless of DPP volume. The €4/month KMS line item covers the CMK plus all API requests even at 100M+ DPPs.

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

**Trigger:** Customer signs Scale tier (€749/month base + per-DPP)
**Action:** Deploy Scale cell with per-tenant credentials
**Cost Impact:** +€95/month
**Net:** +€654/month base profit + DPP revenue

#### Milestone 4: First Enterprise Customer

**Trigger:** Customer signs Enterprise tier (€1,999/month base + per-DPP)
**Action:** Provision dedicated RDS instance
**Cost Impact:** +€110/month per customer
**Net:** +€1,764/month base profit per customer + DPP revenue

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
| 1,000 | 150 S, 500 G, 260 Sc, 84 E, 6 P | €2,500/mo | €420K/mo | €1.5M/mo | €1.9M/mo | 99.9% |
| 2,000 | 300 S, 1,000 G, 520 Sc, 168 E, 12 P | €5,500/mo | €840K/mo | €4M/mo | €4.8M/mo | 99.9% |
| 4,000 | 600 S, 2,000 G, 1,040 Sc, 336 E, 24 P | €12,000/mo | €1.7M/mo | €6M/mo | €7.7M/mo | 99.8% |
| 6,000 | 900 S, 3,000 G, 1,560 Sc, 504 E, 36 P | €20,000/mo | €2.5M/mo | €8M/mo | €10.5M/mo | 99.8% |

*DPP revenue estimates assume growing item-level DPP adoption in batteries, electronics, and industrial sectors.*

### 9.3.1 Year 3-5 Scaling Milestones (1,000-6,000 Customers)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    YEAR 3-5 INFRASTRUCTURE SCALING                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  500        1,000       2,000       4,000       6,000                       │
│   │           │           │           │           │                         │
│   ▼           ▼           ▼           ▼           ▼                         │
│ ┌───┐      ┌───┐      ┌───┐      ┌───┐      ┌───┐                          │
│ │ 3 │      │ 6 │      │12 │      │24 │      │36 │  Growth Cells            │
│ └───┘      └───┘      └───┘      └───┘      └───┘  (Starter + Growth)      │
│                                                                              │
│ ┌───┐      ┌───┐      ┌───┐      ┌───┐      ┌───┐                          │
│ │ 1 │      │ 3 │      │ 5 │      │10 │      │16 │  Scale Cells             │
│ └───┘      └───┘      └───┘      └───┘      └───┘  (~100 tenants/cell)     │
│                                                                              │
│ ┌───┐      ┌───┐      ┌───┐      ┌───┐      ┌───┐                          │
│ │ 5 │      │10 │      │20 │      │40 │      │60 │  Enterprise DBs          │
│ └───┘      └───┘      └───┘      └───┘      └───┘  (dedicated instances)   │
│                                                                              │
│ €1.2K     €2.5K      €5.5K      €12K       €20K   Monthly Infra Cost       │
│                                                                              │
│  MULTI-REGION: Required at 2,000+ customers for reliability                 │
│  Adds ~€300-500/mo per region                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Milestone 7: 1,000 Customers (Year 2-3)

**Trigger:** 1,000 active customers across all tiers
**Actions:**
- Scale to 6 Growth cells (Starter + Growth tiers)
- Add 2 Scale cells (100 tenants per cell)
- ~10 Enterprise dedicated instances
- Consider secondary AWS region (EU-WEST)

**Infrastructure Cost:** ~€2,500/month
**Operational:** Add second engineer for on-call rotation

#### Milestone 8: 2,000 Customers (Year 3)

**Trigger:** 2,000 active customers
**Actions:**
- Scale to 12 Growth cells
- Scale to 5 Scale cells
- ~20 Enterprise dedicated instances
- **Deploy secondary region** (EU-WEST-1)
- Add read replicas for hot cells

**Infrastructure Cost:** ~€5,500/month
**Operational:** Implement follow-the-sun support

#### Milestone 9: 4,000 Customers (Year 4)

**Trigger:** 4,000 active customers
**Actions:**
- 24 Growth cells (automated provisioning)
- 10 Scale cells
- ~40 Enterprise instances
- Consider third region (US-EAST for CBAM partners)
- Global load balancing

**Infrastructure Cost:** ~€12,000/month
**Operational:** SRE team of 3+

#### Milestone 10: 6,000 Customers (Year 5)

**Trigger:** 6,000 active customers (Year 5 projection)
**Actions:**
- 36 Growth cells
- 16 Scale cells
- 60 Enterprise instances
- 36 Platform deployments (dedicated infrastructure)
- Full multi-region with automatic failover

**Infrastructure Cost:** ~€20,000/month
**Total Infrastructure at Scale:** ~€240K/year

**Revenue at 6,000 customers:** ~€126M ARR (Base + DPP)
**Infrastructure as % of revenue:** <0.2%

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

**When to trigger:** New Enterprise tier customer signs up (€1,999/month base)

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

**Customer revenue:** €1,999/month base + per-DPP fees
**Net margin:** €1,764/month base profit + DPP revenue

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
