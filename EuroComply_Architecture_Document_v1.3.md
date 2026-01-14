# EuroComply Platform Architecture

**Document Version:** 1.3  
**Date:** January 2026  
**Status:** Production Ready

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
10. [Operations](#10-operations)
11. [Implementation Guide](#11-implementation-guide)
12. [Standards & Data Formats](#12-standards--data-formats)

---

## 1. Executive Summary

EuroComply is a B2B SaaS platform for EU Digital Product Passport (DPP) compliance under the ESPR regulation. The platform serves customers across four pricing tiers, from €129/month startups to €4,999/month enterprises.

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

| Stage | Customers | Infrastructure | Revenue | Margin |
|-------|-----------|----------------|---------|--------|
| Launch | 0-10 | €158/month | €1,290 | 88% |
| Growth | 50-200 | €158-211/month | €6,450-25,800 | 97-99% |
| Scale | 200-500 | €400-800/month | €40,000-100,000 | 98% |

### Gross Margin by Tier

| Tier | Price | Infra Cost | Gross Margin |
|------|-------|------------|--------------|
| Growth (€129) | €129/mo | <€5 | **96%** |
| Scale (€399) | €399/mo | €10-15 | **96%** |
| Enterprise (€999) | €999/mo | ~€100 | **90%** |
| Mega (€4,999) | €4,999/mo | €300-500 | **90-94%** |

Infrastructure costs scale linearly with revenue, ensuring healthy margins at all tiers.

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

| Tier | Price | Products | Items | Max Batch Size | Target Customer |
|------|-------|----------|-------|----------------|-----------------|
| Growth | €129/month | 500 | 10,000 | 10,000 | Startups, small brands |
| Scale | €399/month | 5,000 | 1,000,000 | 100,000 | Mid-market manufacturers |
| Enterprise | €999/month | Unlimited | 100,000,000 | 1,000,000 | Large brands |
| Mega | €4,999/month | Unlimited | Unlimited | 10,000,000 | Fortune 500 |

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
QR Scan → CDN → Static DPP (or Lazy Generation)
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
| Growth | Schema + Cell | 1 tenant |
| Scale | Schema + Cell + Credentials | 1 tenant |
| Enterprise | Dedicated Instance | 1 tenant |
| Mega | Dedicated Cluster | 1 tenant |

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
| Cell credential leak | Schema isolation | Must know schema name |
| Application bug | RLS + schema isolation | 1 tenant max |
| Database snapshot theft | Per-tenant encryption | Data unreadable |
| Complete cell compromise | Cell isolation | ~200 tenants max |

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
│  │  • Lazy generation for uncached DPPs                               │    │
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
│       │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │  │
│       │   │  │  DynamoDB   │  │     R2      │  │   Redis     │         │  │
│       │   │  │ BatchWrite  │  │  Bulk Put   │  │  Progress   │         │  │
│       │   │  │ (25/batch)  │  │ (50 conc.)  │  │  Counter    │         │  │
│       │   │  └─────────────┘  └─────────────┘  └─────────────┘         │  │
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

| Batch Size | Workers | Chunks | Time | Cost |
|------------|---------|--------|------|------|
| 1,000 | 1 | 1 | 5 sec | $0.01 |
| 10,000 | 2 | 10 | 30 sec | $0.05 |
| 100,000 | 5 | 100 | 2 min | $0.50 |
| 1,000,000 | 10 | 1,000 | 10 min | $11 |
| 10,000,000 | 20 | 10,000 | 1-2 hours | $110 |

### 7.4 Chunk Processing

Each worker processes a 1,000-item chunk:

```
PER CHUNK (1,000 items):
────────────────────────

1. Fetch passport template (cached):     50ms
2. Generate 1,000 DPPs in memory:        2,000ms (parallel)
3. Batch write to DynamoDB:              800ms (40 batches × 25 items)
4. Bulk upload to R2:                    2,000ms (50 concurrent uploads)
5. Update progress in Redis:             50ms
───────────────────────────────────────────────
Total per chunk:                         ~5 seconds
```

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
│  │ R2: Idempotent by design                                            │   │
│  │                                                                      │   │
│  │ • Key: dpps/{passportId}/{serial}.html                             │   │
│  │ • PUT with same key = overwrite (not duplicate)                    │   │
│  │ • Content is deterministic (same input → same output)              │   │
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
    const passport = await this.getPassportTemplate(chunk.passportId);
    const serials = await this.getSerialNumbers(chunk);
    const dpps = await this.generateDPPs(passport, serials);
    
    // 3. Write to DynamoDB (idempotent: same key = overwrite)
    await this.batchWriteDynamoDB(chunk.organizationId, dpps);
    
    // 4. Write to R2 (idempotent: same key = overwrite)
    await this.bulkUploadR2(dpps);
    
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

### 7.7 Lazy Generation (Alternative)

For ultra-large batches or when most items may never be scanned:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LAZY GENERATION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BATCH REQUEST (Fast)                                                       │
│  ─────────────────────                                                      │
│  1. User submits 1M serial numbers                                          │
│  2. System creates 1M DynamoDB records only (2 min)                         │
│  3. No DPP files generated yet                                              │
│  4. Job completes, items are "registered"                                   │
│                                                                              │
│  CONSUMER SCAN (On-Demand)                                                  │
│  ─────────────────────────                                                  │
│  1. Consumer scans QR code                                                  │
│  2. Request hits Cloudflare edge                                            │
│                                                                              │
│       ┌─────────────┐                                                       │
│       │ Edge Cache? │                                                       │
│       └──────┬──────┘                                                       │
│              │                                                               │
│      ┌───────┴───────┐                                                      │
│      │               │                                                       │
│      ▼ HIT           ▼ MISS                                                 │
│   Return          ┌──────────┐                                              │
│   cached          │ R2 file? │                                              │
│   DPP             └────┬─────┘                                              │
│   <20ms               │                                                      │
│              ┌────────┴────────┐                                            │
│              │                 │                                             │
│              ▼ EXISTS          ▼ NOT EXISTS                                 │
│           Return           ┌──────────────┐                                 │
│           file             │ Generate DPP │                                 │
│           <50ms            │ on-the-fly   │                                 │
│                            │ (100ms)      │                                 │
│                            └──────┬───────┘                                 │
│                                   │                                          │
│                                   ▼                                          │
│                            Store in R2                                       │
│                            (async, for                                       │
│                             next time)                                       │
│                                                                              │
│  BENEFITS:                                                                  │
│  • No upfront generation delay                                              │
│  • Only generate DPPs that are actually scanned                            │
│  • 90%+ of items may never be scanned (returns, defects, warehouse)        │
│  • First scan: 100-150ms, subsequent scans: <50ms                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.8 Cloudflare Worker for DPP Serving

```typescript
// Cloudflare Worker - serves DPPs with lazy generation
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/\/dpp\/([^/]+)\/([^/]+)/);
    
    if (!match) {
      return new Response('Not Found', { status: 404 });
    }
    
    const [, passportId, serial] = match;
    const cacheKey = `dpps/${passportId}/${serial}.html`;
    
    // 1. Check R2 for pre-generated DPP
    const cached = await env.R2_BUCKET.get(cacheKey);
    if (cached) {
      return new Response(cached.body, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'public, max-age=86400',
          'X-DPP-Source': 'r2-cache',
        },
      });
    }
    
    // 2. Fetch item from DynamoDB (via API)
    const item = await env.API.fetch(
      `${env.API_URL}/internal/items/${passportId}/${serial}`
    ).then(r => r.json());
    
    if (!item) {
      return new Response('Item Not Found', { status: 404 });
    }
    
    // 3. Fetch passport template (cached heavily)
    const template = await getPassportTemplate(env, passportId);
    
    // 4. Generate DPP on-the-fly
    const html = renderDPP(template, item);
    
    // 5. Store in R2 for next time (don't await)
    env.R2_BUCKET.put(cacheKey, html);
    
    // 6. Return generated DPP
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=86400',
        'X-DPP-Source': 'lazy-generated',
      },
    });
  },
};
```

### 7.9 Tier Limits for Bulk Operations

| Tier | Max Batch Size | Max Items/Month | Overage |
|------|----------------|-----------------|---------|
| Growth | 10,000 | 100,000 | Not available |
| Scale | 100,000 | 10,000,000 | €0.01/1000 items |
| Enterprise | 1,000,000 | 100,000,000 | €0.005/1000 items |
| Mega | 10,000,000 | Unlimited | Included |

### 7.10 Cost Considerations for Bulk Operations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BULK OPERATION COST AWARENESS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. MEGA TIER INGESTION SPIKE                                               │
│  ────────────────────────────────────────────────────────────────────────   │
│                                                                              │
│  Scenario: Fortune 500 signs up, immediately imports 500M items             │
│                                                                              │
│  DynamoDB Write Cost:                                                       │
│  • 500M items × $1.25/million WRU = $625 instant COGS hit                  │
│  • This is 12% of the €4,999 monthly fee                                   │
│                                                                              │
│  Mitigation Options:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Option A: Onboarding Fee                                            │   │
│  │ • Charge €2,500 one-time setup fee for Mega tier                   │   │
│  │ • Covers initial ingestion + dedicated onboarding support          │   │
│  │                                                                     │   │
│  │ Option B: Ingestion Rate Limiting                                   │   │
│  │ • Cap at 50M items/day for first month                             │   │
│  │ • Spreads $625 cost over 10 days                                   │   │
│  │                                                                     │   │
│  │ Option C: Accept as Customer Acquisition Cost                       │   │
│  │ • 12% of month 1 revenue is acceptable CAC                         │   │
│  │ • LTV of Mega customer (€60K/year) easily absorbs this             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  RECOMMENDATION: Option C for strategic accounts, Option A for standard    │
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
│  • First Mega tier customer OR                                             │
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
│  │ This is still <2% of Mega tier revenue                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Overage Fee Margin Analysis:**

| Cost Component | AWS Cost per 1K Items | Customer Price | Margin |
|----------------|----------------------|----------------|--------|
| DynamoDB Write | $0.00125 | - | - |
| DynamoDB Storage | $0.00025/mo | - | - |
| R2 Write (if pre-gen) | $0.0045 | - | - |
| **Total (Year 1)** | **~$0.006** | **€0.01 (~$0.011)** | **~180%** |

The overage pricing provides healthy margins while remaining competitive.

---

## 8. Infrastructure

### 8.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLOUDFLARE                                      │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │     DNS     │  │     WAF     │  │     CDN     │  │     R2      │        │
│  │             │  │             │  │             │  │  (DPP files)│        │
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
| Secrets Manager | 5 secrets | $2.50 | €2 |
| **Storage & Queues** | | | |
| DynamoDB | On-demand | $1-50 | €1-45 |
| SQS (Events + Bulk) | FIFO queues | $1.00 | €1 |
| S3 | Assets bucket | $0.50 | €1 |
| ECR | Container images | $0.50 | €1 |
| **Monitoring** | | | |
| CloudWatch | Logs, metrics, alarms | $10.00 | €9 |
| **External** | | | |
| Cloudflare Pro | DNS, CDN, WAF, DDoS | $20.00 | €19 |
| Cloudflare Workers | DPP serving + lazy gen | $5.00 | €5 |
| Cloudflare R2 | DPP file storage | $1-20 | €1-18 |
| | | | |
| **Base Total** | | **$171** | **€158** |
| **With Bulk Processing** | | **$171-350** | **€158-320** |

**Note:** Bulk worker costs scale to zero when not in use. Typical monthly addition: €20-50 for active usage.

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

#### Milestone 1: Launch (0-200 Growth Customers)

**Infrastructure:** Base configuration  
**Cost:** €158/month  
**Bulk Capacity:** Up to 1M DPPs/batch (auto-scaling workers)

#### Milestone 2: Second Growth Cell (200+ Customers)

**Trigger:** Approaching 200 Growth customers OR database CPU >70%  
**Action:** Deploy second Growth cell  
**Cost Impact:** +€53/month  
**Deployment:** Zero downtime, new tenants routed to Cell 2

#### Milestone 3: First Scale Customer

**Trigger:** Customer signs Scale tier (€399/month)  
**Action:** Deploy Scale cell with per-tenant credentials  
**Cost Impact:** +€95/month  
**Net:** +€304/month profit

#### Milestone 4: First Enterprise Customer

**Trigger:** Customer signs Enterprise tier (€999/month)  
**Action:** Provision dedicated RDS instance  
**Cost Impact:** +€110/month per customer  
**Net:** +€889/month profit per customer

#### Milestone 5: High Availability + NAT Upgrade

**Trigger:** €20K+ MRR OR first Mega tier customer OR bulk processing >10GB/day  
**Action:** NAT Gateway + Redis cluster  
**Cost Impact:** +€50-80/month (NAT Gateway + data processing)

Note: The t4g.nano NAT instance works fine for Growth/Scale/Enterprise tiers. Upgrade to NAT Gateway when:
- Bulk jobs consistently process >10GB/day
- Network timeout errors appear in bulk worker logs
- First Mega tier customer onboards

#### Milestone 6: Multi-Region

**Trigger:** €100K+ MRR  
**Action:** Secondary region with read replicas  
**Cost Impact:** +€300/month

### 9.3 Cost Projection

| Customers | Mix | Infrastructure | Revenue | Margin |
|-----------|-----|----------------|---------|--------|
| 10 | 10 Growth | €158/mo | €1,290/mo | 88% |
| 50 | 50 Growth | €158/mo | €6,450/mo | 98% |
| 100 | 90 Growth, 8 Scale, 2 Enterprise | €360/mo | €16,800/mo | 98% |
| 200 | 170 Growth, 25 Scale, 5 Enterprise | €520/mo | €36,920/mo | 99% |
| 500 | 400 Growth, 80 Scale, 18 Ent, 2 Mega | €1,200/mo | €104,700/mo | 99% |

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
│  │ Workers Active  ████░░░ │          │ Lazy Gen Rate  █░░░░░░░ │          │
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
| DPP Lazy Gen Rate | >20% | Warning | Pre-generate more |
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
│  Note: Mega tier customers generating 100M DPPs/month = ~$450 in R2 writes │
│  This should be factored into Mega tier pricing (€4,999 easily covers it)  │
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
│       │   └── dpp-server/     # DPP serving + lazy gen
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
| 2026-01 | Lazy generation option | Handle 10M+ batches efficiently |
| 2026-01 | Cloudflare Workers for DPP serving | Edge latency, lazy generation |
| 2026-01 | Auto-scaling bulk workers (0-20) | Scale to zero, cost efficiency |
| 2026-01 | Idempotent chunk processing | Handle worker crashes, SQS redelivery |
| 2026-01 | DLQ with Lambda analyzer | Detect poison pills, auto-notify |
| 2026-01 | Per-tenant R2 cost tracking | Cost attribution for Mega tier |
| 2026-01 | NAT instance at launch | $3/mo vs $33/mo, upgrade at Mega tier |
| 2026-01 | Accept Mega ingestion as CAC | 12% of month 1 is acceptable for €60K LTV |

---

## Appendix B: Performance Targets

| Operation | Target | Achieved |
|-----------|--------|----------|
| API response (p50) | <200ms | 50-100ms ✅ |
| API response (p99) | <500ms | 200-400ms ✅ |
| DPP scan (cached) | <50ms | 20-50ms ✅ |
| DPP scan (lazy gen) | <200ms | 100-150ms ✅ |
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
| Lazy Generation | Generate DPP on first scan instead of upfront |
| RLS | Row-Level Security - PostgreSQL feature for row-level access control |

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | January 2026 | Architecture Team | Initial release |
| 1.1 | January 2026 | Architecture Team | Added bulk DPP generation architecture |
| 1.2 | January 2026 | Architecture Team | Added idempotency, DLQ handling, R2 cost monitoring |
| 1.3 | January 2026 | Architecture Team | Added Mega tier ingestion spike handling, NAT bandwidth analysis, gross margin breakdown |
