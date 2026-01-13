# Scalability Architecture

## Overview

EuroComply is designed to handle high-volume QR code scans while maintaining low latency and predictable costs. This is achieved through a **dual-path architecture** that separates high-volume reads (QR scans) from low-volume writes (workspace operations that build workspace data in The Hub).

**Key Insight:** DPP access must be free for all users (ESPR Article 31). This means infrastructure costs scale with adoption but revenue doesn't. We solve this by self-hosting the read path with Cloudflare (unlimited free bandwidth) + Hetzner (cheap EU bare metal), reducing costs by 99% compared to AWS CloudFront.

---

## Current Capacity vs Scalable Architecture

> **Important**: This section distinguishes between what our *currently deployed* infrastructure can handle vs what the architecture *can scale to* with planned upgrades.

### Currently Deployed Infrastructure

| Component | Specification | Realistic Capacity |
|-----------|---------------|-------------------|
| **Read Path** | | |
| Cloudflare CDN | Pro plan ($20/month) | Unlimited (CDN handles 99%+ of traffic) |
| Hetzner Origins | 3× AX41 servers (~€150/month) | 60TB/month bandwidth → ~50B scans/day |
| **Write Path** | | |
| ECS Fargate | 2-10 tasks (auto-scaling) | ~1,000 concurrent API users |
| RDS PostgreSQL | db.t3.medium (2 vCPU, 4GB RAM) | ~500 connections, ~10K transactions/sec |
| ElastiCache Redis | cache.t3.micro | Session caching, rate limiting |

### How CDN Caching Makes This Work

The impressive scan numbers are possible because **Cloudflare's global CDN handles 99%+ of read traffic**:

```
50 billion scans/day × 1% cache miss rate = 500 million origin hits/day
500M hits × 5KB per DPP = 2.5TB/day = 75TB/month

With 99.5% cache hit rate: 37TB/month (within Hetzner's 60TB limit)
With 99.9% cache hit rate: 7.5TB/month (comfortable margin)
```

Our origin servers (Hetzner) only handle cache misses. Cloudflare's 300+ edge locations serve the rest.

### Scalable To (With Planned Upgrades)

| Metric | Current Capacity | With R2 Migration | With Full Upgrades |
|--------|------------------|-------------------|-------------------|
| QR scans/day | Up to 50B | 100B+ | 1T+ |
| Concurrent users | ~1,000 | ~1,000 | 10,000+ |
| Products total | 10M+ | 10M+ | 100M+ |
| Monthly cost | ~$500 | ~$2,500-11,000 | ~$12,000+ |

**Migration Triggers:**
- **R2 Migration**: When origin bandwidth consistently exceeds 40TB/month (67% of Hetzner limit)
- **RDS Upgrade**: When connection count exceeds 400 or CPU > 80% sustained
- **Enterprise Tier**: When concurrent users exceed 5,000

---

## Scale Targets

| Metric | Current Capacity | Scalable To |
|--------|------------------|-------------|
| QR scans per day | Up to 50 billion | 1+ trillion (with R2) |
| Peak scans per second | ~600K (CDN) | 10+ million (CDN) |
| Scan latency (p99) | <100ms | <100ms |
| Concurrent PIM users | ~1,000 | 10,000+ (with RDS upgrade) |
| Products per organization | 100,000+ | 100,000+ |
| Total products | 10+ million | 100+ million |

---

## Dual-Path Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DUAL-PATH ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WRITE PATH (Low volume, complex) - AWS                                     │
│  ───────────────────────────────────────                                    │
│  • Workspace writes → PostgreSQL (RDS) → The Hub                            │
│  • DPP issuance → PostgreSQL + push to Hetzner origins                     │
│  • User management → PostgreSQL                                             │
│  • Hosted on: AWS ECS Fargate (eu-central-1)                               │
│  • Capacity needed: Thousands of writes/day                                 │
│                                                                              │
│  READ PATH (High volume, simple) - Cloudflare + Hetzner                    │
│  ───────────────────────────────────────────────────────                   │
│  • QR scans → Cloudflare CDN → Hetzner static files                        │
│  • No database                                                              │
│  • No AWS costs                                                             │
│  • Unlimited bandwidth (Cloudflare)                                         │
│  • Capacity: Billions of reads/day                                          │
│  • Cost: ~$200-500/month (regardless of volume)                            │
│                                                                              │
│  SEPARATION IS KEY                                                          │
│  ─────────────────────────────────                                          │
│  Write path complexity doesn't affect read path performance.                │
│  Read path can scale infinitely without touching write path.                │
│  Read path cost is fixed, not usage-based.                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Why Self-Host the Read Path?

### The Problem with AWS CloudFront

```
┌─────────────────────────────────────────────────────────────────┐
│  AWS CLOUDFRONT COST BREAKDOWN (1B scans/day)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DATA TRANSFER (egress) - THE BIG ONE                        │
│     • 30B requests × 5KB = 150TB/month                          │
│     • AWS charges: ~$0.085/GB                                   │
│     • Cost: 150,000 GB × $0.085 = $12,750/month                 │
│                                                                  │
│  2. REQUESTS                                                    │
│     • 30B requests/month                                        │
│     • AWS charges: ~$0.0085 per 10,000 requests                 │
│     • Cost: 30B ÷ 10k × $0.0085 = $25,500/month                 │
│                                                                  │
│  TOTAL: ~$38,000/month                                          │
│                                                                  │
│  THE PROBLEM:                                                   │
│  ESPR requires free DPP access. Revenue doesn't scale with      │
│  scans, but AWS costs do. A viral product could bankrupt us.    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### The Solution: Cloudflare + Hetzner

```
┌─────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE + HETZNER COST (1B scans/day)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CLOUDFLARE (CDN Layer)                                         │
│  • Pro plan: $20/month                                          │
│  • Bandwidth: UNLIMITED (yes, really)                           │
│  • Requests: UNLIMITED                                          │
│                                                                  │
│  HETZNER (Origin Servers - EU)                                  │
│  • 3x AX41 dedicated servers: €150/month                        │
│  • 20TB bandwidth included per server                           │
│  • Location: Germany (GDPR compliant)                           │
│                                                                  │
│  TOTAL: ~$200/month                                             │
│                                                                  │
│  SAVINGS: 99.5% vs AWS CloudFront                               │
│                                                                  │
│  WHY THIS WORKS:                                                │
│  • Cloudflare monetizes security/enterprise features, not       │
│    bandwidth. Free bandwidth is their acquisition strategy.     │
│  • Hetzner is European bare metal at commodity prices.          │
│  • DPPs are small (~5KB) static files - perfect for CDN.        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## DPP Serving Architecture (CDN-Backed)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SELF-HOSTED DPP SERVING ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  QR Code: https://dpp.eurocomply.eu/01/05901234567890                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  LAYER 1: Cloudflare Global CDN (Free/Pro - $20/month)              │    │
│  │  ───────────────────────────────────────────────────────────────    │    │
│  │  • 300+ edge locations worldwide                                    │    │
│  │  • Unlimited bandwidth                                              │    │
│  │  • Free DDoS protection                                             │    │
│  │  • Auto-caching of static files                                     │    │
│  │  • Cache TTL: 24h (configurable via Cache-Control headers)          │    │
│  │  • Expected cache hit rate: 99%+                                    │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │ (~1% cache miss)                           │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  LAYER 2: Hetzner Origin Servers (€150/month total)                  │    │
│  │  ───────────────────────────────────────────────────────────────    │    │
│  │                                                                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │    │
│  │  │  Server 1   │  │  Server 2   │  │  Server 3   │                   │    │
│  │  │  (Germany)  │  │  (Finland)  │  │  (Germany)  │                   │    │
│  │  │  FSN1-DC14  │  │  HEL1-DC2   │  │  NBG1-DC3   │                   │    │
│  │  │             │  │             │  │             │                   │    │
│  │  │  Nginx      │  │  Nginx      │  │  Nginx      │                   │    │
│  │  │  + Static   │  │  + Static   │  │  + Static   │                   │    │
│  │  │    Files    │  │    Files    │  │    Files    │                   │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                   │    │
│  │         │                │                │                          │    │
│  │         └────────────────┴────────────────┘                          │    │
│  │                          │                                           │    │
│  │                   Lsyncd/Rsync                                       │    │
│  │              (real-time file sync)                                   │    │
│  │                                                                       │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  DATABASE INVOLVEMENT: ZERO                                                 │
│  AWS INVOLVEMENT: ZERO (for read path)                                      │
│  COST: FIXED (~$200/month regardless of volume)                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Static File Structure

```
/var/www/dpp/                          # On each Hetzner server
├── gtin/
│   ├── 05901234567890/
│   │   ├── dpp.json           # Machine-readable VC (for APIs)
│   │   ├── index.html         # Human-readable page (for browsers)
│   │   ├── qr.svg             # QR code image
│   │   └── meta.json          # Last updated, version, etc.
│   └── 05901234567891/
│       └── ...
├── serial/
│   └── {serial-hash}/         # For item-level DPPs (serialized products)
│       └── ...
└── _shared/
    ├── verify.js              # Client-side VC verification library
    ├── styles.css             # DPP page styling
    └── logo.svg               # EuroComply branding
```

### URL Routing

```
https://dpp.eurocomply.eu/01/05901234567890
                          ──┬─ ──────────────┬───
                            │                │
                     GS1 AI (01)        GTIN-13/14
                     = GTIN

Cloudflare routes to Hetzner origin
Origin serves: /var/www/dpp/gtin/05901234567890/index.html (browser)
           or: /var/www/dpp/gtin/05901234567890/dpp.json (Accept: application/json)
```

### Static vs Dynamic DPP Content

DPP pages use a **hybrid approach**:

| Content Type | Serving Method | Source |
|--------------|----------------|--------|
| Core DPP (materials, certifications, attestations) | **Static files** (CDN) | Pre-rendered at issuance |
| Product lifecycle (EPCIS events) | **API call** (client-side) | Queried on page load |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PUBLIC DPP PAGE - HYBRID CONTENT                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STATIC (CDN - cached)                    DYNAMIC (API - live)              │
│  ─────────────────────                    ────────────────────              │
│  • Product identity                       • Lifecycle timeline (EPCIS)      │
│  • Materials & composition                • Current location                │
│  • Certifications                         • Latest events                   │
│  • Attestations (at issuance)             • Carbon footprint updates        │
│  • QR code                                                                  │
│                                                                              │
│  Browser loads:                                                             │
│  1. Static index.html from CDN (instant)                                    │
│  2. JavaScript fetches lifecycle from API (async, non-blocking)             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why hybrid?**
- Core DPP data is immutable after issuance - perfect for static files
- Lifecycle data changes continuously - must be dynamic
- Static core means 99%+ cache hit rate (CDN efficiency)
- Dynamic lifecycle adds <100ms latency (API call)

---

## Item-Level DPP Architecture

ESPR requires item-level serialization for many product categories (batteries, electronics, textiles). Each physical unit needs a unique DPP with its own lifecycle tracking. This section describes how EuroComply handles billions of item-level DPPs efficiently.

### The Challenge

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ITEM-LEVEL SCALE CHALLENGE                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  REQUIREMENT:                                                               │
│  • Each physical item needs unique DPP (serial number)                      │
│  • Track individual lifecycle: manufacturing → shipping → sale → recycling  │
│  • 10-year retention required by ESPR                                       │
│                                                                              │
│  SCALE EXAMPLE (one large customer):                                        │
│  • 1 billion items/year                                                     │
│  • 10 billion items over retention period                                   │
│  • 150 billion EPCIS events (15 events/item average)                       │
│                                                                              │
│  NAIVE APPROACH (full static files per item):                              │
│  • 1B items × 20KB = 20TB/year new files                                   │
│  • 10 years = 200TB static files                                           │
│  • File system cannot handle billions of files efficiently                  │
│  • ❌ Not viable                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Solution: Template + Item Data

Most DPP data is identical across all units of a product (materials, certifications, care instructions). Only serial number and lifecycle events differ. We separate static product data from dynamic item data.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SMART DPP ARCHITECTURE: TEMPLATE + ITEM DATA                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STATIC TEMPLATE (per GTIN, CDN-cached):     DYNAMIC ITEM DATA (per item): │
│  ─────────────────────────────────────       ───────────────────────────── │
│  • Product identity                          • Serial number                 │
│  • Materials composition                     • Manufacturing date/batch      │
│  • Certifications                            • EPCIS lifecycle events        │
│  • Care instructions                         • Current location/status       │
│  • Sustainability claims                     • Ownership transfers           │
│  • Repair information                        • Repair history                │
│  • Recycling instructions                    • Recycling status              │
│  • Brand/manufacturer info                   • State-of-health (batteries)   │
│                                                                              │
│  Storage: ~20KB per GTIN                     Storage: ~300 bytes/item       │
│  100K GTINs = 2GB                            1B items = 300GB (DB rows)     │
│                                                                              │
│  RESULT:                                                                    │
│  • 10B items over 10 years = ~3TB (vs 200TB naive approach)                │
│  • Item registration: DB insert only, no file generation                   │
│  • Throughput: 100M+ items/day possible                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### URL Structure

```
Product-level DPP (static template only):
  https://dpp.eurocomply.eu/01/{gtin}
  https://dpp.eurocomply.eu/01/05901234567890
  → Serves static template from CDN
  → No item-specific data

Item-level DPP (template + dynamic data):
  https://dpp.eurocomply.eu/01/{gtin}/21/{serial}
  https://dpp.eurocomply.eu/01/05901234567890/21/ABC123XYZ
  → Loads static template from CDN (instant)
  → Fetches item data from API (async)
  → Renders combined view

API endpoint for item data:
  GET /api/v1/items/{gtin}/{serial}
  → Returns: { serial, batchId, status, events: [...] }
  → Latency: <100ms
```

### Scan Flow (Item-Level DPP)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  QR CODE SCAN FLOW (Item-Level DPP)                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  QR Code contains: https://dpp.eurocomply.eu/01/05901234567890/21/SN12345   │
│                                                ──────────────── ────────   │
│                                                     GTIN         Serial     │
│                                                                              │
│  STEP 1: Browser requests item-level URL                                    │
│  ───────────────────────────────────────                                    │
│  GET /01/05901234567890/21/SN12345                                          │
│  → Cloudflare edge routes to static template                                │
│  → Returns HTML with embedded GTIN + serial                                 │
│  → Latency: <50ms (edge cache)                                              │
│                                                                              │
│  STEP 2: Page loads, JavaScript fetches item data                           │
│  ────────────────────────────────────────────────                           │
│  fetch('/api/v1/items/05901234567890/SN12345')                              │
│  → API looks up ItemInstance by (gtin, serial)                              │
│  → Fetches recent EPCIS events from hot tier                                │
│  → Returns JSON: { serial, status, events: [...] }                          │
│  → Latency: <100ms                                                          │
│                                                                              │
│  STEP 3: JavaScript renders combined view                                   │
│  ────────────────────────────────────────                                   │
│  → Static template (product info) already displayed                         │
│  → Dynamic section populated with item data                                 │
│  → Lifecycle timeline shows this item's journey                             │
│  → Total time to interactive: <200ms                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Model (Item-Level)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DATABASE SCHEMA (Item-Level Support)                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Product (existing - one per GTIN)                                          │
│  ├── id, gtin, name, description                                            │
│  ├── materials, certifications, sustainability                              │
│  └── ... (all static product data)                                          │
│                                                                              │
│  Passport (existing - template, one per GTIN)                               │
│  ├── id, productId, vcJwt (product-level VC)                               │
│  ├── staticPath, templateUrl                                                │
│  └── isItemLevel: boolean (enables item tracking)                          │
│                                                                              │
│  ItemInstance (NEW - one per physical unit)                                 │
│  ├── id: cuid                                                               │
│  ├── organizationId: FK → Organization                                     │
│  ├── passportId: FK → Passport (the template)                              │
│  ├── serial: string (unique within GTIN)                                   │
│  ├── batchId: string (optional manufacturing batch)                        │
│  ├── status: ACTIVE | IN_TRANSIT | SOLD | RECYCLED | RECALLED              │
│  ├── manufacturedAt: DateTime                                               │
│  ├── itemVcJwt: string? (optional item-level VC)                           │
│  ├── hasArchivedEvents: boolean (indicates warm/cold tier data exists)     │
│  └── createdAt, updatedAt                                                  │
│                                                                              │
│  EpcisEvent (existing - updated to link to item)                           │
│  ├── id, organizationId                                                    │
│  ├── itemInstanceId: FK → ItemInstance (nullable for batch events)         │
│  ├── productId: FK → Product                                               │
│  ├── eventType, eventTime, bizStep, disposition                            │
│  └── eventData: JSONB                                                       │
│                                                                              │
│  INDEXES (critical for performance):                                        │
│  • ItemInstance(organizationId, passportId, serial) - unique, lookups      │
│  • ItemInstance(serial) - for direct serial search                         │
│  • EpcisEvent(itemInstanceId, eventTime DESC) - lifecycle queries          │
│  • EpcisEvent(organizationId, eventTime) - archival jobs                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Item Registration (Issuance) Flow

```typescript
// Item registration is lightweight - no file generation needed
async function registerItem(
  passportId: string,
  serial: string,
  batchId?: string,
  manufacturedAt?: Date
): Promise<ItemInstance> {
  // 1. Validate passport exists and supports item-level
  const passport = await prisma.passport.findUnique({
    where: { id: passportId },
    select: { id: true, isItemLevel: true, organizationId: true }
  });

  if (!passport?.isItemLevel) {
    throw new Error('Passport does not support item-level tracking');
  }

  // 2. Create item instance (single DB insert)
  const item = await prisma.itemInstance.create({
    data: {
      organizationId: passport.organizationId,
      passportId,
      serial,
      batchId,
      manufacturedAt: manufacturedAt ?? new Date(),
      status: 'ACTIVE'
    }
  });

  // 3. Optionally create manufacturing EPCIS event
  await prisma.epcisEvent.create({
    data: {
      organizationId: passport.organizationId,
      itemInstanceId: item.id,
      eventType: 'ObjectEvent',
      eventTime: item.manufacturedAt,
      bizStep: 'commissioning',
      disposition: 'active'
    }
  });

  return item;
  // Total time: ~5-20ms (vs 200-500ms for full static file generation)
}

// Bulk registration for high-volume manufacturers
async function registerItemsBatch(
  passportId: string,
  items: Array<{ serial: string; batchId?: string; manufacturedAt?: Date }>
): Promise<number> {
  // Use Prisma createMany for efficient bulk insert
  const result = await prisma.itemInstance.createMany({
    data: items.map(item => ({
      organizationId,
      passportId,
      serial: item.serial,
      batchId: item.batchId,
      manufacturedAt: item.manufacturedAt ?? new Date(),
      status: 'ACTIVE'
    })),
    skipDuplicates: true
  });

  return result.count;
  // Can process 10,000+ items per second
}
```

### Capacity (Item-Level Architecture)

| Operation | Old Approach | Template + Item Approach |
|-----------|--------------|--------------------------|
| **Per-item issuance** | Generate 3 files (20KB), push to origins | Insert 1 DB row (~300 bytes) |
| **Issuance latency** | 200-500ms | 5-20ms |
| **Throughput (single task)** | 2-5 items/sec | 500-1,000 items/sec |
| **Throughput (10 tasks)** | 20-50 items/sec | 5,000-10,000 items/sec |
| **Daily capacity** | ~1-4M items | ~100-500M items |
| **Storage (1B items)** | 20TB static files | ~300GB database |
| **Storage (10B items, 10yr)** | 200TB | ~3TB |

---

## Tiered Storage Architecture

With 10-year retention requirements and billions of items, we need a tiered storage strategy. Not all data is accessed equally - recent events are queried frequently, while historical events are rarely accessed except for compliance audits.

### Storage Tiers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TIERED STORAGE ARCHITECTURE                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HOT TIER (PostgreSQL RDS)                                                  │
│  ─────────────────────────                                                  │
│  What: Recent data, frequently accessed                                     │
│  Retention: Last 90 days of EPCIS events                                    │
│  Data:                                                                       │
│    • All ItemInstance records (always hot - needed for lookups)             │
│    • Recent EPCIS events (last 90 days)                                     │
│    • All Passport templates                                                 │
│  Access pattern: Every scan, every API call                                 │
│  Storage per mega-customer: ~5-10 TB                                        │
│  Cost: ~$0.115/GB/month (RDS gp3)                                          │
│                                                                              │
│  WARM TIER (Cloudflare R2 / S3 Standard)                                    │
│  ───────────────────────────────────────                                    │
│  What: Historical events, occasionally queried                              │
│  Retention: 90 days - 2 years                                               │
│  Format: Parquet files, partitioned by org/year/month                       │
│  Access pattern: Lifecycle reports, audits, analytics                       │
│  Query engine: DuckDB or Athena for ad-hoc queries                         │
│  Storage per mega-customer: ~30 TB                                          │
│  Cost: ~$0.015/GB/month (R2)                                               │
│                                                                              │
│  COLD TIER (S3 Glacier / R2 Infrequent Access)                             │
│  ─────────────────────────────────────────────                              │
│  What: Archived events, rarely accessed                                     │
│  Retention: 2-10 years (ESPR compliance)                                    │
│  Format: Compressed Parquet, yearly archives                                │
│  Access pattern: Legal requests, regulatory audits                          │
│  Retrieval time: Minutes to hours (async)                                   │
│  Storage per mega-customer: ~40 TB                                          │
│  Cost: ~$0.004/GB/month (Glacier Deep Archive)                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cost Comparison: Naive vs Tiered

For one mega-customer (1B items/year, 10-year retention):

| Approach | Year 1 | Year 5 | Year 10 | 10yr Total |
|----------|--------|--------|---------|------------|
| **Naive (all in RDS)** | $920/mo | $4,600/mo | $9,200/mo | ~$400,000 |
| **Tiered (hot/warm/cold)** | $600/mo | $1,200/mo | $1,600/mo | ~$75,000 |
| **Savings** | 35% | 74% | 83% | **81%** |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TIERED STORAGE COST BREAKDOWN (Year 10, one mega-customer)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HOT TIER (RDS):                                                            │
│  • ItemInstance: 10B × 300 bytes = 3 TB × $0.115 = $345/month              │
│  • Recent events: 90 days × 2.7M/day × 500 bytes = 365 GB × $0.115 = $42   │
│  • Indexes, overhead: ~$200/month                                           │
│  • Subtotal: ~$600/month                                                    │
│                                                                              │
│  WARM TIER (R2):                                                            │
│  • Events 90d-2yr: ~30 TB × $0.015 = $450/month                            │
│  • Subtotal: ~$450/month                                                    │
│                                                                              │
│  COLD TIER (Glacier):                                                       │
│  • Events 2-10yr: ~40 TB × $0.004 = $160/month                             │
│  • Subtotal: ~$160/month                                                    │
│                                                                              │
│  TOTAL: ~$1,200-1,600/month (vs $9,200/month naive)                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Lifecycle Automation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AUTOMATED DATA LIFECYCLE JOBS                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  NIGHTLY JOB: Hot → Warm Migration                                          │
│  ──────────────────────────────────                                         │
│  Schedule: 02:00 UTC daily                                                  │
│  Process:                                                                   │
│    1. SELECT events WHERE event_time < NOW() - INTERVAL '90 days'           │
│       AND NOT archived                                                      │
│    2. Export to Parquet, partition by org_id/year/month                     │
│    3. Upload to R2/S3 warm bucket                                           │
│    4. Verify upload integrity (checksum)                                    │
│    5. DELETE from PostgreSQL                                                │
│    6. UPDATE item_instances SET has_archived_events = true                  │
│       WHERE id IN (affected items)                                          │
│                                                                              │
│  Throughput: ~10M events/hour (batch processing)                            │
│  Duration: 2-4 hours for mega-customer daily batch                          │
│                                                                              │
│  MONTHLY JOB: Warm → Cold Migration                                         │
│  ────────────────────────────────────                                        │
│  Schedule: 1st of month, 04:00 UTC                                          │
│  Process:                                                                   │
│    1. Identify Parquet files older than 2 years                             │
│    2. Compress further (ZSTD level 19)                                      │
│    3. Move to Glacier/cold R2 storage class                                 │
│    4. Update metadata index                                                 │
│                                                                              │
│  YEARLY JOB: Cold Tier Compaction                                           │
│  ────────────────────────────────                                           │
│  Schedule: January 15th, 00:00 UTC                                          │
│  Process:                                                                   │
│    1. Merge monthly archives into yearly archives                           │
│    2. Further compress (maximize storage efficiency)                        │
│    3. Verify data integrity                                                 │
│    4. Delete monthly files                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Query Routing

```typescript
// Query router determines which tier(s) to query based on date range
async function getItemLifecycle(
  gtin: string,
  serial: string,
  options?: { from?: Date; to?: Date }
): Promise<EpcisEvent[]> {
  const item = await prisma.itemInstance.findFirst({
    where: { passport: { product: { gtin } }, serial },
    select: { id: true, hasArchivedEvents: true }
  });

  if (!item) throw new NotFoundError('Item not found');

  const now = new Date();
  const from = options?.from ?? new Date(0);
  const to = options?.to ?? now;
  const hotCutoff = subDays(now, 90);
  const warmCutoff = subYears(now, 2);

  const results: EpcisEvent[] = [];

  // Query hot tier (PostgreSQL) for recent events
  if (to > hotCutoff) {
    const hotEvents = await prisma.epcisEvent.findMany({
      where: {
        itemInstanceId: item.id,
        eventTime: { gte: max(from, hotCutoff), lte: to }
      },
      orderBy: { eventTime: 'desc' }
    });
    results.push(...hotEvents);
  }

  // Query warm tier (Parquet via DuckDB) for historical events
  if (item.hasArchivedEvents && from < hotCutoff && to > warmCutoff) {
    const warmEvents = await queryWarmTier(item.id, max(from, warmCutoff), min(to, hotCutoff));
    results.push(...warmEvents);
  }

  // Query cold tier (Glacier) for archived events - async with callback
  if (item.hasArchivedEvents && from < warmCutoff) {
    // Cold tier queries are async - initiate restore and notify when ready
    await initiateColdTierQuery(item.id, from, min(to, warmCutoff));
    // Results delivered via webhook or polling
  }

  return results.sort((a, b) => b.eventTime.getTime() - a.eventTime.getTime());
}

// Warm tier query using DuckDB
async function queryWarmTier(
  itemInstanceId: string,
  from: Date,
  to: Date
): Promise<EpcisEvent[]> {
  const db = await getDuckDBConnection();

  // Query Parquet files directly from R2
  const result = await db.run(`
    SELECT * FROM read_parquet('r2://eurocomply-events/org_*/year_*/month_*/*.parquet')
    WHERE item_instance_id = ?
      AND event_time BETWEEN ? AND ?
    ORDER BY event_time DESC
  `, [itemInstanceId, from.toISOString(), to.toISOString()]);

  return result.map(row => ({
    id: row.id,
    itemInstanceId: row.item_instance_id,
    eventType: row.event_type,
    eventTime: new Date(row.event_time),
    bizStep: row.biz_step,
    disposition: row.disposition,
    eventData: JSON.parse(row.event_data)
  }));
}
```

### Query Performance by Tier

| Query Type | Tier | Latency | Use Case |
|------------|------|---------|----------|
| Item lookup | Hot | <10ms | Every scan |
| Recent events (90d) | Hot | <50ms | Every scan |
| Historical events (90d-2yr) | Warm | 100-500ms | Lifecycle reports |
| Archived events (2-10yr) | Cold | 1-12 hours | Compliance audits |
| Full lifecycle (all tiers) | Federated | 2-5 seconds | Rare, cached |

---

## Database Partitioning Strategy

For multi-tenant isolation and efficient data management at scale, we partition tables by organization and time.

### Partitioning Scheme

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PARTITIONING STRATEGY                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ITEM_INSTANCES: Partition by organization_id (LIST)                        │
│  ───────────────────────────────────────────────────                        │
│  Why: Each customer's items isolated, enables per-customer maintenance      │
│                                                                              │
│  CREATE TABLE item_instances (                                              │
│    id TEXT NOT NULL,                                                        │
│    organization_id TEXT NOT NULL,                                           │
│    passport_id TEXT NOT NULL,                                               │
│    serial TEXT NOT NULL,                                                    │
│    batch_id TEXT,                                                           │
│    status TEXT DEFAULT 'ACTIVE',                                            │
│    manufactured_at TIMESTAMPTZ,                                             │
│    has_archived_events BOOLEAN DEFAULT FALSE,                               │
│    created_at TIMESTAMPTZ DEFAULT NOW(),                                    │
│    updated_at TIMESTAMPTZ DEFAULT NOW(),                                    │
│    PRIMARY KEY (organization_id, id)                                        │
│  ) PARTITION BY LIST (organization_id);                                     │
│                                                                              │
│  -- Default partition for small customers (shared)                          │
│  CREATE TABLE item_instances_default                                        │
│    PARTITION OF item_instances DEFAULT;                                     │
│                                                                              │
│  -- Dedicated partition for mega-customers                                  │
│  CREATE TABLE item_instances_org_megacorp                                   │
│    PARTITION OF item_instances                                              │
│    FOR VALUES IN ('org_megacorp_id');                                       │
│                                                                              │
│                                                                              │
│  EPCIS_EVENTS: Partition by time (RANGE) + sub-partition by org            │
│  ──────────────────────────────────────────────────────────────             │
│  Why: Time-based for efficient archival, org-based for isolation           │
│                                                                              │
│  CREATE TABLE epcis_events (                                                │
│    id TEXT NOT NULL,                                                        │
│    organization_id TEXT NOT NULL,                                           │
│    item_instance_id TEXT,                                                   │
│    product_id TEXT,                                                         │
│    event_type TEXT NOT NULL,                                                │
│    event_time TIMESTAMPTZ NOT NULL,                                         │
│    biz_step TEXT,                                                           │
│    disposition TEXT,                                                        │
│    event_data JSONB,                                                        │
│    created_at TIMESTAMPTZ DEFAULT NOW(),                                    │
│    PRIMARY KEY (event_time, organization_id, id)                            │
│  ) PARTITION BY RANGE (event_time);                                         │
│                                                                              │
│  -- Monthly partitions for easy archival                                    │
│  CREATE TABLE epcis_events_2026_01                                          │
│    PARTITION OF epcis_events                                                │
│    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');                        │
│                                                                              │
│  CREATE TABLE epcis_events_2026_02                                          │
│    PARTITION OF epcis_events                                                │
│    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');                        │
│  -- ... etc, created automatically by maintenance job                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Partition Maintenance

```typescript
// Automated partition management
async function ensurePartitionsExist(): Promise<void> {
  const db = getDbConnection();

  // Create partitions for next 3 months (run weekly)
  for (let i = 0; i < 3; i++) {
    const start = startOfMonth(addMonths(new Date(), i));
    const end = startOfMonth(addMonths(new Date(), i + 1));
    const partitionName = `epcis_events_${format(start, 'yyyy_MM')}`;

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ${partitionName}
      PARTITION OF epcis_events
      FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')
    `);
  }
}

// Archive old partitions (run monthly)
async function archiveOldPartitions(): Promise<void> {
  const cutoff = subDays(new Date(), 90);
  const partitionName = `epcis_events_${format(cutoff, 'yyyy_MM')}`;

  // Export to Parquet
  await exportPartitionToParquet(partitionName);

  // Verify export
  await verifyParquetExport(partitionName);

  // Drop old partition (data now in warm tier)
  await db.execute(`DROP TABLE IF EXISTS ${partitionName}`);
}
```

### Index Strategy

```sql
-- ItemInstance indexes (on each partition)
CREATE INDEX idx_item_instances_serial
  ON item_instances (serial);

CREATE UNIQUE INDEX idx_item_instances_passport_serial
  ON item_instances (passport_id, serial);

-- EpcisEvent indexes (on each partition)
CREATE INDEX idx_epcis_events_item
  ON epcis_events (item_instance_id, event_time DESC);

CREATE INDEX idx_epcis_events_org_time
  ON epcis_events (organization_id, event_time DESC);

-- Partial index for active items only (common query pattern)
CREATE INDEX idx_item_instances_active
  ON item_instances (passport_id, created_at DESC)
  WHERE status = 'ACTIVE';
```

---

## Multi-Tenant Isolation

One mega-customer's billions of items shouldn't affect query performance for SME customers.

### Isolation Strategies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MULTI-TENANT ISOLATION                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. DEDICATED PARTITIONS                                                    │
│  ────────────────────────                                                   │
│  • Mega-customers get dedicated table partitions                            │
│  • Their 10B items physically separated from SME data                       │
│  • Indexes scoped to partition (smaller, faster)                            │
│  • Can run VACUUM/ANALYZE per-partition without affecting others            │
│                                                                              │
│  2. CONNECTION POOLING (PgBouncer)                                          │
│  ─────────────────────────────────                                          │
│  • Separate pools per customer tier                                         │
│  • Enterprise: dedicated pool (100 connections)                             │
│  • SME: shared pool (200 connections)                                       │
│  • Mega-customer cannot exhaust SME connections                             │
│                                                                              │
│  Pool configuration:                                                        │
│  [databases]                                                                │
│  eurocomply_enterprise = host=primary pool_size=100                         │
│  eurocomply_sme = host=primary pool_size=200                               │
│  eurocomply_analytics = host=replica pool_size=50                          │
│                                                                              │
│  3. QUERY TIMEOUTS                                                          │
│  ─────────────────                                                          │
│  • Item lookup: 100ms timeout (fast, indexed)                               │
│  • Event query: 1s timeout (bounded)                                        │
│  • Analytics: No timeout, but uses read replica                             │
│                                                                              │
│  SET statement_timeout = '100ms';  -- For item lookups                     │
│  SET statement_timeout = '1s';     -- For event queries                    │
│                                                                              │
│  4. DEDICATED READ REPLICAS (Enterprise tier)                               │
│  ────────────────────────────────────────────                               │
│  • Mega-customers get their own read replica                                │
│  • Analytics queries routed to replica                                      │
│  • Primary reserved for writes + SME reads                                  │
│                                                                              │
│  5. RATE LIMITING (per organization)                                        │
│  ────────────────────────────────────                                        │
│  • API rate limits per org, not global                                      │
│  • Mega-customer bulk imports don't starve SME API access                  │
│  • Separate queues for bulk operations                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Resource Allocation by Tier

| Resource | SME (shared) | Enterprise | Mega-Customer |
|----------|--------------|------------|---------------|
| DB connections | 200 shared | 100 dedicated | 100 dedicated |
| Read replica | Shared | Shared | Dedicated |
| API rate limit | 100 req/s | 1,000 req/s | 10,000 req/s |
| Bulk import queue | Shared | Priority | Dedicated |
| Storage partition | Default | Default | Dedicated |
| Support SLA | 48h | 24h | 4h |

---

## 10-Year Retention Strategy

ESPR requires DPP data retention for the product lifetime plus additional years. For many products, this means 10+ years of data retention.

### Retention Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ESPR RETENTION REQUIREMENTS                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHAT MUST BE RETAINED:                                                     │
│  • DPP core data (product information) - lifetime of product + 10 years    │
│  • EPCIS events (lifecycle tracking) - same retention period               │
│  • Verifiable Credentials - must remain verifiable                         │
│  • Audit trail - all changes, who/when                                     │
│                                                                              │
│  RETENTION PERIODS BY PRODUCT:                                              │
│  • Electronics: 10 years (expected lifetime) + 10 years = 20 years         │
│  • Batteries: 15 years (EV batteries) + 10 years = 25 years               │
│  • Textiles: 3 years (fast fashion) to 10 years + 10 years                │
│  • Construction: Building lifetime (50+ years) + 10 years                  │
│                                                                              │
│  PRACTICAL APPROACH:                                                        │
│  • Default: 10 years from item creation                                    │
│  • Configurable per product category                                       │
│  • Legal hold capability (prevent deletion)                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Integrity Over Time

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LONG-TERM DATA INTEGRITY                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CHALLENGE: Ensure data remains readable and verifiable for 10+ years      │
│                                                                              │
│  SOLUTIONS:                                                                 │
│                                                                              │
│  1. FORMAT STABILITY                                                        │
│  ───────────────────                                                        │
│  • Parquet format (columnar, self-describing)                              │
│  • JSON for event data (universal compatibility)                           │
│  • Avoid proprietary formats                                               │
│                                                                              │
│  2. SCHEMA EVOLUTION                                                        │
│  ────────────────────                                                        │
│  • Schema version stored with data                                         │
│  • Backward-compatible changes only                                        │
│  • Migration scripts versioned and tested                                  │
│                                                                              │
│  3. CRYPTOGRAPHIC INTEGRITY                                                 │
│  ──────────────────────────                                                 │
│  • SHA-256 checksums for archived files                                    │
│  • Merkle tree for batch verification                                      │
│  • Annual integrity audits                                                 │
│                                                                              │
│  4. VC VERIFICATION                                                         │
│  ──────────────────                                                         │
│  • DID documents preserved                                                 │
│  • Signing keys archived (with rotation history)                           │
│  • Verification possible even if issuer gone                               │
│                                                                              │
│  5. GEOGRAPHIC REDUNDANCY                                                   │
│  ─────────────────────────                                                   │
│  • Hot tier: Multi-AZ RDS                                                  │
│  • Warm tier: R2 (replicated)                                              │
│  • Cold tier: Cross-region Glacier                                         │
│  • Annual restore tests                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Compliance Query Patterns

```typescript
// Regulatory audit: Full lifecycle for specific item
async function getFullItemHistory(
  gtin: string,
  serial: string,
  requestId: string
): Promise<AuditResponse> {
  // 1. Get item instance
  const item = await prisma.itemInstance.findFirst({
    where: { passport: { product: { gtin } }, serial },
    include: { passport: { include: { product: true } } }
  });

  if (!item) throw new NotFoundError('Item not found');

  // 2. Query all tiers (async for cold)
  const hotEvents = await getHotTierEvents(item.id);
  const warmEvents = await getWarmTierEvents(item.id);

  // 3. Initiate cold tier restore if needed
  let coldRestoreJob = null;
  if (item.hasArchivedEvents && item.createdAt < subYears(new Date(), 2)) {
    coldRestoreJob = await initiateColdRestore(item.id, requestId);
  }

  // 4. Return available data + restore status
  return {
    item: {
      gtin,
      serial,
      status: item.status,
      manufacturedAt: item.manufacturedAt,
      product: item.passport.product
    },
    events: [...hotEvents, ...warmEvents],
    coldTierStatus: coldRestoreJob ? {
      status: 'restoring',
      estimatedCompletion: coldRestoreJob.estimatedCompletion,
      callbackUrl: `/api/v1/audit/${requestId}/status`
    } : null,
    dataCompleteness: coldRestoreJob ? 'partial' : 'complete'
  };
}

// Bulk export for regulatory compliance
async function exportOrganizationData(
  organizationId: string,
  fromDate: Date,
  toDate: Date
): Promise<ExportJob> {
  // Create async export job
  const job = await prisma.exportJob.create({
    data: {
      organizationId,
      status: 'pending',
      parameters: { fromDate, toDate },
      estimatedSize: await estimateExportSize(organizationId, fromDate, toDate)
    }
  });

  // Queue background processing
  await exportQueue.add('org-export', {
    jobId: job.id,
    organizationId,
    fromDate,
    toDate
  });

  return job;
}
```

---

## DPP Issuance Flow (Write Path)

When a DPP is issued, the Compliance workspace reads workspace data from The Hub and generates static files that are pushed to Hetzner origins. The workspace data contains the complete, authoritative product data aggregated from all workspace contributions:

```typescript
async function issueDPP(product: Product, vc: VerifiableCredential): Promise<Passport> {
  // NOTE: 'product' contains the workspace data read from The Hub

  // 1. Sign the VC (existing flow)
  const signedVC = await wallet.sign(vc);

  // 2. Store in database (for management UI)
  const passport = await prisma.passport.create({
    data: {
      productId: product.id,
      vcJwt: signedVC.jwt,
      status: 'ACTIVE',
      staticPath: `gtin/${product.gtin}`,
      cdnUrl: `https://dpp.eurocomply.eu/01/${product.gtin}`,
    },
  });

  // 3. Pre-render static files
  const staticFiles = await prerenderDPP(product, signedVC);

  // 4. Push to Hetzner origin servers (via rsync/scp)
  await pushToOrigins({
    path: `gtin/${product.gtin}`,
    files: {
      'dpp.json': JSON.stringify(staticFiles.json),
      'index.html': staticFiles.html,
      'qr.svg': staticFiles.qr,
      'meta.json': JSON.stringify({
        version: passport.id,
        issuedAt: new Date().toISOString(),
        gtin: product.gtin,
        organizationId: product.organizationId,
      }),
    },
  });

  // 5. Cloudflare auto-caches on next request (no manual invalidation needed)
  //    Or use Cloudflare API to purge if immediate update required
  if (process.env.CLOUDFLARE_ZONE_ID) {
    await cloudflare.purgeCache({
      zoneId: process.env.CLOUDFLARE_ZONE_ID,
      files: [`https://dpp.eurocomply.eu/01/${product.gtin}`],
    });
  }

  // 6. Update passport with publish timestamp
  await prisma.passport.update({
    where: { id: passport.id },
    data: { lastPublishedAt: new Date() },
  });

  return passport;
}

// Push files to all origin servers using resilient queue-based distribution
async function pushToOrigins(params: { path: string; files: Record<string, string> }): Promise<void> {
  // Queue-based file distribution with retry logic
  // See "Resilient File Distribution" section below for full architecture
  await fileDistributionQueue.add('push-dpp-files', {
    path: params.path,
    files: params.files,
    priority: 'normal',
  });
}
```

### Resilient File Distribution (Queue-Based)

The static file push to origin servers uses a resilient job queue instead of synchronous `Promise.all()`:

```
┌─────────────────────────────────────────────────────────────────┐
│              QUEUE-BASED FILE DISTRIBUTION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PROBLEM WITH SYNCHRONOUS PUSH                                  │
│  ─────────────────────────────                                  │
│  • Promise.all() fails if ANY origin is unreachable             │
│  • DPP issuance blocked by network issues                       │
│  • No retry logic for transient failures                        │
│  • User waits for all 3 origins to complete                     │
│                                                                  │
│  SOLUTION: BullMQ Job Queue                                     │
│  ───────────────────────────                                    │
│  1. DPP issuance completes immediately (writes to DB)           │
│  2. File push job added to queue (async)                        │
│  3. Worker processes with exponential backoff retry             │
│  4. Partial success = degraded OK (2/3 origins)                 │
│  5. Full failure = alert + manual intervention                  │
│                                                                  │
│  FLOW:                                                          │
│  ┌────────────┐     ┌─────────────┐     ┌─────────────────┐    │
│  │  Issue DPP │────▶│ Redis Queue │────▶│ Distribution    │    │
│  │  (instant) │     │  (BullMQ)   │     │ Worker          │    │
│  └────────────┘     └─────────────┘     └────────┬────────┘    │
│                                                   │              │
│                          ┌───────────────────────┼───────┐      │
│                          ▼                       ▼       ▼      │
│                     ┌─────────┐           ┌─────────┐ ┌─────────┐│
│                     │Origin 1 │           │Origin 2 │ │Origin 3 ││
│                     │(Germany)│           │(Finland)│ │(Germany)││
│                     └─────────┘           └─────────┘ └─────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Queue Configuration

```typescript
// File distribution queue configuration
const fileDistributionQueue = new Queue('file-distribution', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // 2s, 4s, 8s
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

// Job priorities
const PRIORITIES = {
  critical: 1,  // Revocations (immediate visibility required)
  high: 2,      // Updates to active DPPs
  normal: 3,    // New DPP issuance
  low: 4,       // Batch operations
};
```

#### Distribution Worker

```typescript
const fileDistributionWorker = new Worker('file-distribution', async (job) => {
  const { path, files } = job.data;
  const origins = [
    { host: 'origin1.eurocomply.eu', path: '/var/www/dpp' },
    { host: 'origin2.eurocomply.eu', path: '/var/www/dpp' },
    { host: 'origin3.eurocomply.eu', path: '/var/www/dpp' },
  ];

  const results = await Promise.allSettled(
    origins.map(async (origin) => {
      await sshExec(origin.host, `mkdir -p ${origin.path}/${path}`);
      for (const [filename, content] of Object.entries(files)) {
        await scpPush(origin.host, content, `${origin.path}/${path}/${filename}`);
      }
      return origin.host;
    })
  );

  // Count successes
  const succeeded = results.filter(r => r.status === 'fulfilled');
  const failed = results.filter(r => r.status === 'rejected');

  // Partial success handling (2/3 = degraded OK)
  if (succeeded.length >= 2) {
    if (failed.length > 0) {
      // Log degraded state, but don't fail the job
      await logDegradedState(path, failed);
    }
    return { status: 'ok', succeeded: succeeded.length, failed: failed.length };
  }

  // Full failure (0-1 origins) - retry
  throw new Error(`Distribution failed: only ${succeeded.length}/3 origins succeeded`);
}, {
  connection: redis,
  concurrency: 5, // Process 5 DPPs in parallel
});

// Alert on persistent failures
fileDistributionWorker.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await alertOps({
      type: 'FILE_DISTRIBUTION_FAILED',
      path: job.data.path,
      attempts: job.attemptsMade,
      error: err.message,
    });
  }
});
```

#### Degraded State Handling

| Origins OK | Status | Action |
|------------|--------|--------|
| 3/3 | Healthy | Normal operation |
| 2/3 | Degraded | Log warning, schedule repair job |
| 1/3 | Critical | Alert ops, block new distributions to failed origins |
| 0/3 | Failed | Retry with backoff, alert if persistent |

#### Benefits

| Metric | Synchronous | Queue-Based |
|--------|-------------|-------------|
| DPP issuance latency | 3-5s (waits for all origins) | <500ms (instant) |
| Failure mode | All-or-nothing | Graceful degradation |
| Retry logic | None | Exponential backoff (3 attempts) |
| User experience | Blocked on network | Non-blocking |
| Monitoring | None | Job status, metrics, alerts |

### Dual-Path Synchronization: Solutions

The dual-path architecture requires careful handling of synchronization. Here's how we solve each challenge.

#### Solution 1: Atomic File Distribution (No Lsyncd)

**Problem**: Lsyncd creates race conditions and doesn't guarantee consistency.
**Solution**: Write directly to all 3 origins in parallel with atomic operations.

```
┌─────────────────────────────────────────────────────────────────┐
│  DIRECT MULTI-ORIGIN DISTRIBUTION (Replaces Lsyncd)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OLD (Lsyncd):                                                  │
│  Worker → Origin 1 → Lsyncd → Origin 2, 3 (race conditions!)    │
│                                                                  │
│  NEW (Direct):                                                  │
│  Worker → [Origin 1, Origin 2, Origin 3] (parallel, verified)   │
│                                                                  │
│  ATOMIC WRITE PATTERN:                                          │
│  1. Write to temp file: /var/www/dpp/gtin/123/.tmp_dpp.json    │
│  2. Verify checksum matches expected                            │
│  3. Atomic rename: mv .tmp_dpp.json dpp.json                   │
│  4. If checksum fails: retry or mark origin degraded            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```typescript
// Atomic file distribution with checksum verification
async function distributeToOrigins(params: {
  path: string;
  files: Record<string, string>;
}): Promise<DistributionResult> {
  const origins = [
    { host: 'origin1.eurocomply.eu', region: 'germany' },
    { host: 'origin2.eurocomply.eu', region: 'finland' },
    { host: 'origin3.eurocomply.eu', region: 'germany' },
  ];

  const results = await Promise.allSettled(
    origins.map(origin => atomicWriteToOrigin(origin, params))
  );

  const succeeded = results.filter(r => r.status === 'fulfilled');
  if (succeeded.length < 2) {
    throw new Error(`Distribution failed: ${succeeded.length}/3 origins`);
  }

  return { succeeded: succeeded.length, total: 3 };
}

async function atomicWriteToOrigin(
  origin: Origin,
  params: { path: string; files: Record<string, string> }
): Promise<void> {
  const basePath = `/var/www/dpp/${params.path}`;

  for (const [filename, content] of Object.entries(params.files)) {
    const tempPath = `${basePath}/.tmp_${filename}`;
    const finalPath = `${basePath}/${filename}`;
    const expectedChecksum = crypto.createHash('md5').update(content).digest('hex');

    // 1. Write to temp file
    await sshExec(origin.host, `mkdir -p ${basePath}`);
    await scpPush(origin.host, content, tempPath);

    // 2. Verify checksum on remote
    const remoteChecksum = await sshExec(
      origin.host,
      `md5sum ${tempPath} | cut -d' ' -f1`
    );

    if (remoteChecksum.trim() !== expectedChecksum) {
      await sshExec(origin.host, `rm -f ${tempPath}`);
      throw new Error(`Checksum mismatch on ${origin.host}`);
    }

    // 3. Atomic rename (instant, can't be partial)
    await sshExec(origin.host, `mv ${tempPath} ${finalPath}`);
  }
}
```

**Result**: No partial files possible. Checksum guarantees integrity.

#### Solution 2: Cloudflare Worker for Real-Time Revocation

**Problem**: Cache purge can fail, leaving revoked DPPs visible for up to 24 hours.
**Solution**: Cloudflare Worker checks revocation status on every request.

```
┌─────────────────────────────────────────────────────────────────┐
│  REAL-TIME REVOCATION CHECKING (Cloudflare Worker)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Every DPP request goes through the Worker:                     │
│                                                                  │
│  QR Scan → Cloudflare Edge → Worker → Check Revocation → Serve  │
│                                    ↓                            │
│                              KV Cache (60s TTL)                  │
│                                    ↓                            │
│                              Revocation API                      │
│                                                                  │
│  LATENCY IMPACT: ~5ms (KV lookup at edge)                       │
│  WORST CASE: 60 seconds until revocation visible                │
│  COST: ~$5/month (Workers + KV for 10M requests)                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```typescript
// Cloudflare Worker: dpp-gateway
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const gtinMatch = url.pathname.match(/\/01\/(\d{14})/);

    if (!gtinMatch) {
      return fetch(request); // Not a DPP request
    }

    const gtin = gtinMatch[1];

    // Check revocation status (KV cache with 60s TTL)
    const revoked = await checkRevocationStatus(env, gtin);

    if (revoked.isRevoked) {
      return new Response(renderRevocationPage(revoked), {
        status: 410,
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store',
        },
      });
    }

    // DPP is active - serve from origin
    return fetch(request);
  },
};

async function checkRevocationStatus(env: Env, gtin: string) {
  // Check KV cache first
  const cached = await env.REVOCATION_KV.get(`revoked:${gtin}`, 'json');
  if (cached !== null) return cached;

  // Cache miss - query API
  const response = await fetch(
    `${env.API_URL}/api/v1/public/revocation-status/${gtin}`
  );
  const status = await response.json();

  // Cache for 60 seconds
  await env.REVOCATION_KV.put(`revoked:${gtin}`, JSON.stringify(status), {
    expirationTtl: 60,
  });

  return status;
}
```

**Result**: Revocation visible within 60 seconds, regardless of CDN cache state.

#### Solution 3: Purge Retry with Verification

```typescript
async function purgeWithRetry(gtin: string): Promise<void> {
  const urls = [
    `https://dpp.eurocomply.eu/01/${gtin}`,
    `https://dpp.eurocomply.eu/gtin/${gtin}/dpp.json`,
  ];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await cloudflare.purgeCache({
        zoneId: process.env.CLOUDFLARE_ZONE_ID,
        files: urls,
      });
      return; // Success
    } catch (error) {
      logger.warn(`Purge attempt ${attempt} failed`, { gtin, error });
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }

  // All retries failed - Worker will handle revocation anyway
  logger.error('Purge failed, relying on Worker', { gtin });
  await alertOps({ type: 'PURGE_FAILED', gtin });
}
```

#### Solution 4: Propagation Status Tracking

```typescript
enum PublishStatus {
  PENDING = 'PENDING',           // Not yet distributed
  DISTRIBUTING = 'DISTRIBUTING', // In progress
  PUBLISHED = 'PUBLISHED',       // All origins confirmed
  DEGRADED = 'DEGRADED',         // Partial (2/3 origins)
}

// Passport model extended
model Passport {
  // ... existing fields
  publishStatus    PublishStatus @default(PENDING)
  publishedOrigins Int           @default(0)
  lastPublishedAt  DateTime?
}
```

**UI shows status**: "Publishing... (2/3 servers) → Live in ~5 seconds"

#### Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  SOLVED: DUAL-PATH SYNCHRONIZATION                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PROBLEM               │ SOLUTION                                │
│  ──────────────────────┼─────────────────────────────────────────│
│  Lsyncd race conditions│ Direct parallel writes to all origins  │
│  Partial file writes   │ Atomic temp file + rename + checksum   │
│  Purge failures        │ Retry + Worker backup                  │
│  Revocation delay      │ Cloudflare Worker + KV (60s max)       │
│  Status uncertainty    │ PublishStatus tracking                 │
│                                                                  │
│  GUARANTEES:                                                    │
│  • No partial/corrupt files (atomic writes)                     │
│  • No race conditions (no Lsyncd)                               │
│  • Revocation visible within 60 seconds                         │
│  • User knows when DPP is live                                  │
│                                                                  │
│  ADDITIONAL COST: ~$6/month (Workers + KV)                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Removed: Lsyncd Configuration

The previous Lsyncd-based file synchronization is replaced by direct multi-origin distribution. Remove `/etc/lsyncd/lsyncd.conf.lua` from all origin servers.

#### Monitoring

```
┌─────────────────────────────────────────────────────────────────┐
│  SYNCHRONIZATION MONITORING                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  METRICS:                                                       │
│  • distribution_duration_seconds (histogram)                    │
│  • distribution_success_total (counter by origin)               │
│  • checksum_verification_failures (counter)                     │
│  • revocation_visibility_seconds (histogram)                    │
│  • cloudflare_purge_success_rate (gauge)                        │
│                                                                  │
│  ALERTS:                                                        │
│  • distribution_failed: All 3 origins failed                    │
│  • checksum_mismatch: File corruption detected                  │
│  • purge_failed: Cloudflare API error (Worker handles backup)   │
│  • revocation_delayed: >60s to propagate (investigate Worker)   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Timing Guarantees

| Operation | Target | Guarantee |
|-----------|--------|-----------|
| New DPP issuance | <5s to first origin | 99th percentile |
| All origins synced | <10s | 99th percentile |
| Revocation visible | <60s | **Guaranteed** (via Worker) |
| Cache purge complete | <30s | Best effort (Worker backup) |

---

## Revocation Handling

When a DPP is revoked, the static page is replaced with a revocation notice:

```typescript
async function revokeDPP(passportId: string, reason: string): Promise<void> {
  const passport = await prisma.passport.update({
    where: { id: passportId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revocationReason: reason,
    },
    include: { product: true },
  });

  // 1. Render revocation page
  const revocationHtml = renderRevocationPage({
    gtin: passport.product.gtin,
    productName: passport.product.name,
    revokedAt: passport.revokedAt,
    reason: passport.revocationReason,
    organizationName: passport.product.organization.name,
  });

  // 2. Update JSON to include revocation status
  const revokedJson = {
    ...JSON.parse(passport.vcJwt),
    credentialStatus: {
      type: 'RevocationList2020Status',
      revoked: true,
      revokedAt: passport.revokedAt.toISOString(),
      reason: passport.revocationReason,
    },
  };

  // 3. Push revoked files to origins
  await pushToOrigins({
    path: `gtin/${passport.product.gtin}`,
    files: {
      'index.html': revocationHtml,
      'dpp.json': JSON.stringify(revokedJson),
    },
  });

  // 4. Force immediate Cloudflare cache purge
  await cloudflare.purgeCache({
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
    files: [
      `https://dpp.eurocomply.eu/01/${passport.product.gtin}`,
      `https://dpp.eurocomply.eu/01/${passport.product.gtin}/`,
    ],
  });
}
```

---

## Cost Analysis

### Cost Comparison: AWS vs Self-Hosted

| Scale | AWS CloudFront | Cloudflare + Hetzner | Savings |
|-------|----------------|----------------------|---------|
| 1M scans/day | ~$1,200/month | ~$200/month | 83% |
| 10M scans/day | ~$4,000/month | ~$200/month | 95% |
| 100M scans/day | ~$12,000/month | ~$200/month | 98% |
| 1B scans/day | ~$38,000/month | ~$200/month | 99.5% |
| 10B scans/day | ~$250,000/month | ~$200/month | 99.9% |

**Why is the cost fixed?**
- Cloudflare: Unlimited bandwidth (free)
- Hetzner: 60TB/month included across 3 servers
- At 99% cache hit rate, origins see only 1% of traffic
- 10B scans × 1% × 5KB = 15TB/month (well under 60TB limit)

### Detailed Cost Breakdown (Self-Hosted)

```
┌─────────────────────────────────────────────────────────────────┐
│  MONTHLY INFRASTRUCTURE COST (ANY SCALE)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  READ PATH (Cloudflare + Hetzner)                               │
│  ─────────────────────────────────                              │
│  Cloudflare Pro:                    $20/month                   │
│  Hetzner AX41 × 3 (redundancy):    €150/month (~$165)          │
│  Subtotal:                          ~$185/month                 │
│                                                                  │
│  WRITE PATH (AWS)                                               │
│  ────────────────                                               │
│  ECS Fargate (2-4 tasks):          ~$100/month                  │
│  RDS PostgreSQL (db.t3.medium):    ~$80/month                   │
│  ElastiCache Redis:                 ~$50/month                  │
│  ALB + networking:                  ~$50/month                  │
│  S3 + misc:                         ~$20/month                  │
│  Subtotal:                          ~$300/month                 │
│                                                                  │
│  TOTAL:                             ~$500/month                 │
│                                                                  │
│  This handles:                                                  │
│  • Billions of DPP scans/day                                   │
│  • 10,000+ concurrent PIM users                                │
│  • 10+ million products                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Cloudflare Can Offer Unlimited Bandwidth

```
┌─────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE'S BUSINESS MODEL                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AWS sells bandwidth (commodity markup)                         │
│  Cloudflare sells security/features (value-add)                 │
│                                                                  │
│  Cloudflare revenue sources:                                    │
│  • Enterprise contracts (security, WAF, bot protection)         │
│  • Workers (serverless compute)                                 │
│  • R2 Storage (S3 competitor with no egress fees)               │
│  • Zero Trust (enterprise security)                             │
│                                                                  │
│  Free/cheap bandwidth is customer acquisition.                  │
│                                                                  │
│  Terms of Service:                                              │
│  • Prohibit using Cloudflare only for large file serving        │
│  • DPPs are small (~5KB) text/JSON files - perfectly fine      │
│  • This is exactly what Cloudflare is designed for             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Trillion-Scale Architecture (Cloudflare R2)

For extreme scale beyond 100 billion scans per day, Hetzner's bandwidth limits become a constraint. At this scale, we upgrade to Cloudflare R2 as our origin storage.

### When to Scale Beyond Hetzner

```
┌─────────────────────────────────────────────────────────────────┐
│  HETZNER BANDWIDTH LIMITS                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Hetzner AX41 × 3 servers:                                      │
│  • 20TB/month per server = 60TB/month total                     │
│                                                                  │
│  At 99% cache hit rate (Cloudflare serves 99% from edge):       │
│  • 1% of traffic hits origin                                    │
│  • Each DPP ~5KB average                                        │
│                                                                  │
│  SCALE CALCULATIONS:                                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Scans/Day    │ Origin Traffic/Month │ Fits in 60TB? │      │ │
│  │──────────────│──────────────────────│───────────────│      │ │
│  │ 1 billion    │ 1.5 TB               │ ✅ Yes        │      │ │
│  │ 10 billion   │ 15 TB                │ ✅ Yes        │      │ │
│  │ 100 billion  │ 150 TB               │ ❌ No         │      │ │
│  │ 1 trillion   │ 1.5 PB               │ ❌ No         │      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  SOLUTION: At >100B scans/day, switch to Cloudflare R2 origin  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Option 1: Increase Cache Hit Rate (Free)

Before switching to R2, optimize cache hit rate to delay the transition:

```
┌─────────────────────────────────────────────────────────────────┐
│  CACHE HIT RATE OPTIMIZATION                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Cache Hit Rate │ Origin Traffic at 100B scans/day             │
│  ─────────────────────────────────────────────────────          │
│  99.0%          │ 1% × 100B × 5KB × 30 = 150 TB/month           │
│  99.5%          │ 0.5% × 100B × 5KB × 30 = 75 TB/month          │
│  99.9%          │ 0.1% × 100B × 5KB × 30 = 15 TB/month  ✅      │
│  99.99%         │ 0.01% × 100B × 5KB × 30 = 1.5 TB/month ✅     │
│                                                                  │
│  HOW TO ACHIEVE 99.9%+ CACHE HIT:                               │
│  • Set long cache TTL (7+ days)                                 │
│  • DPPs rarely change after issuance                            │
│  • Use stale-while-revalidate                                   │
│  • Pre-warm cache for popular products                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Option 2: Cloudflare R2 as Origin (Trillion-Scale)

For true trillion-scale with zero bandwidth concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE R2 ARCHITECTURE                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  R2 = S3-compatible storage with ZERO EGRESS FEES               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  LAYER 1: Cloudflare Global CDN (Unchanged)              │    │
│  │  • 300+ edge locations                                   │    │
│  │  • Unlimited bandwidth                                   │    │
│  │  • 99.9%+ cache hit rate                                │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │ (~0.1% cache miss)                 │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  LAYER 2: Cloudflare R2 (Replaces Hetzner)               │    │
│  │  ─────────────────────────────────────────────────────   │    │
│  │  • Storage: $0.015/GB/month                              │    │
│  │  • Egress: $0.00 (FREE, unlimited)                       │    │
│  │  • Operations: $0.36 per million Class A (writes)        │    │
│  │               $0.36 per million Class B (reads)          │    │
│  │                                                          │    │
│  │  No bandwidth limits. Ever.                              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  WHY R2?                                                        │
│  • Same Cloudflare network (lowest latency to CDN)              │
│  • S3-compatible API (easy migration)                           │
│  • Zero egress = predictable costs at any scale                 │
│  • Automatic replication across Cloudflare's network            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### R2 Cost Analysis at Trillion Scale

```
┌─────────────────────────────────────────────────────────────────┐
│  R2 COST AT 1 TRILLION SCANS/DAY                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STORAGE                                                        │
│  • 100 million DPPs × 15KB each = 1.5 TB                       │
│  • Cost: 1,500 GB × $0.015 = $22.50/month                       │
│                                                                  │
│  OPERATIONS (at 99.9% cache hit)                                │
│  • 1 trillion scans/day × 0.1% miss = 1 billion origin hits/day│
│  • 30 billion reads/month                                       │
│  • Cost: 30,000 × $0.36 = $10,800/month                        │
│                                                                  │
│  EGRESS                                                         │
│  • 30 billion reads × 5KB = 150 PB/month                       │
│  • Cost: $0.00 (R2 has no egress fees)                          │
│                                                                  │
│  CLOUDFLARE PRO                                                 │
│  • $20/month                                                    │
│                                                                  │
│  ──────────────────────────────────────────────────────────     │
│  TOTAL AT TRILLION SCALE: ~$10,850/month                       │
│                                                                  │
│  Compare to AWS CloudFront at 1T scans/day:                     │
│  • ~$3,800,000/month (yes, $3.8 million)                       │
│  • Savings: 99.7%                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tiered Scaling Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│  TIERED INFRASTRUCTURE SCALING                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIER 1: Startup (0 - 10B scans/day)                           │
│  ────────────────────────────────────                           │
│  Infrastructure: Cloudflare Pro + 3× Hetzner AX41               │
│  Cost: ~$200/month (fixed)                                      │
│  Capacity: 10 billion scans/day easily                          │
│                                                                  │
│  TIER 2: Scale (10B - 100B scans/day)                          │
│  ─────────────────────────────────────                          │
│  Infrastructure: Same + optimize cache to 99.9%                 │
│  Cost: ~$200/month (fixed)                                      │
│  Action: Tune cache TTL, add pre-warming                        │
│                                                                  │
│  TIER 3: Extreme (100B+ scans/day)                             │
│  ─────────────────────────────────                              │
│  Infrastructure: Cloudflare Pro + R2 (drop Hetzner)             │
│  Cost: Scales with operations (~$500-2,000/month)               │
│  Action: Migrate static files from Hetzner to R2                │
│                                                                  │
│  TIER 4: Planetary (1T+ scans/day)                             │
│  ─────────────────────────────────                              │
│  Infrastructure: Cloudflare Enterprise + R2                     │
│  Cost: ~$10,000-15,000/month                                    │
│  Action: Enterprise support, SLA guarantees                     │
│                                                                  │
│  KEY INSIGHT: We start with Hetzner ($200/month) and only       │
│  migrate to R2 if we hit extreme scale. Most customers will     │
│  never need Tier 3+.                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cost Comparison: All Scales

| Scale | AWS CloudFront | Cloudflare + Hetzner | Cloudflare + R2 | Best Option |
|-------|----------------|----------------------|-----------------|-------------|
| 1M scans/day | ~$1,200/mo | ~$200/mo | ~$25/mo | Hetzner |
| 10M scans/day | ~$4,000/mo | ~$200/mo | ~$30/mo | Hetzner |
| 100M scans/day | ~$12,000/mo | ~$200/mo | ~$50/mo | Hetzner |
| 1B scans/day | ~$38,000/mo | ~$200/mo | ~$130/mo | Hetzner |
| 10B scans/day | ~$250,000/mo | ~$200/mo | ~$400/mo | Hetzner |
| 100B scans/day | ~$2,500,000/mo | ❌ Exceeds limit | ~$2,500/mo | R2 |
| 1T scans/day | ~$38,000,000/mo | ❌ Exceeds limit | ~$11,000/mo | R2 |

**Key Insight:** Hetzner is most cost-effective up to ~50B scans/day. Beyond that, R2's unlimited egress becomes necessary.

### R2 Migration Path

When ready to migrate from Hetzner to R2:

```typescript
// R2 configuration
const R2_CONFIG = {
  endpoint: 'https://<account_id>.r2.cloudflarestorage.com',
  bucket: 'eurocomply-dpp',
  region: 'auto', // R2 automatically distributes globally
};

// DPP publishing to R2 (replaces pushToOrigins)
async function publishToR2(params: { path: string; files: Record<string, string> }): Promise<void> {
  const s3 = new S3Client({
    endpoint: R2_CONFIG.endpoint,
    region: R2_CONFIG.region,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  await Promise.all(
    Object.entries(params.files).map(([filename, content]) =>
      s3.send(new PutObjectCommand({
        Bucket: R2_CONFIG.bucket,
        Key: `${params.path}/${filename}`,
        Body: content,
        ContentType: filename.endsWith('.json') ? 'application/json' : 'text/html',
        CacheControl: 'public, max-age=604800', // 7 days
      }))
    )
  );
}

// Cloudflare Worker for R2 serving (optional, for custom routing)
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /01/{gtin} → gtin/{gtin}/index.html or dpp.json
    const match = url.pathname.match(/^\/01\/(\d+)$/);
    if (match) {
      const gtin = match[1];
      const wantsJson = request.headers.get('Accept')?.includes('application/json');
      const key = `gtin/${gtin}/${wantsJson ? 'dpp.json' : 'index.html'}`;

      const object = await env.DPP_BUCKET.get(key);
      if (!object) {
        return new Response('DPP not found', { status: 404 });
      }

      return new Response(object.body, {
        headers: {
          'Content-Type': wantsJson ? 'application/json' : 'text/html',
          'Cache-Control': 'public, max-age=604800',
        },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
```

### Cloudflare Handles Everything

```
┌─────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE CAPACITY                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Can Cloudflare handle a trillion scans/day?                    │
│                                                                  │
│  YES. Here's why:                                               │
│                                                                  │
│  • Cloudflare handles 20%+ of all internet traffic              │
│  • Peak capacity: 250+ Tbps                                      │
│  • 330+ cities, 120+ countries                                  │
│  • 1 trillion scans/day = ~12 million req/sec                   │
│  • This is routine traffic for Cloudflare                       │
│                                                                  │
│  The ONLY bottleneck was Hetzner's bandwidth limit.             │
│  With R2, there is no bottleneck.                               │
│                                                                  │
│  Our architecture can scale infinitely.                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Hetzner Server Configuration

### Recommended Setup

```
┌─────────────────────────────────────────────────────────────────┐
│  HETZNER ORIGIN SERVERS                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Server Model: AX41 (or AX51 for more storage)                  │
│  • CPU: AMD Ryzen 5 3600 (6 cores)                              │
│  • RAM: 64 GB DDR4                                              │
│  • Storage: 2× 512GB NVMe SSD                                   │
│  • Bandwidth: 20 TB/month included                              │
│  • Price: ~€50/month                                            │
│                                                                  │
│  Locations (for redundancy):                                    │
│  • Server 1: Falkenstein, Germany (FSN1)                        │
│  • Server 2: Helsinki, Finland (HEL1)                           │
│  • Server 3: Nuremberg, Germany (NBG1)                          │
│                                                                  │
│  Software Stack:                                                │
│  • OS: Ubuntu 22.04 LTS                                         │
│  • Web Server: Nginx (static file serving)                      │
│  • Sync: Lsyncd (real-time file replication)                    │
│  • Monitoring: Prometheus + Grafana                             │
│                                                                  │
│  GDPR Compliance:                                               │
│  • All servers in EU (Germany/Finland)                          │
│  • Hetzner is German company, GDPR compliant                    │
│  • Data never leaves EU                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/dpp.eurocomply.eu

server {
    listen 80;
    server_name dpp.eurocomply.eu;
    root /var/www/dpp;

    # Health check for Cloudflare
    location /health {
        return 200 'OK';
        add_header Content-Type text/plain;
    }

    # GS1 Digital Link routing
    # /01/{gtin} -> /gtin/{gtin}/
    location ~ ^/01/(\d+)$ {
        alias /var/www/dpp/gtin/$1/;

        # Content negotiation
        if ($http_accept ~* "application/json") {
            rewrite ^ /gtin/$1/dpp.json last;
        }

        try_files /gtin/$1/index.html =404;
    }

    # Direct file access
    location / {
        try_files $uri $uri/ =404;

        # Cache headers (Cloudflare respects these)
        add_header Cache-Control "public, max-age=86400";
    }

    # JSON files
    location ~* \.json$ {
        add_header Content-Type application/json;
        add_header Cache-Control "public, max-age=86400";
    }

    # Gzip compression
    gzip on;
    gzip_types application/json text/html text/css application/javascript;
}
```

### File Synchronization

> **Note**: Lsyncd has been removed. File distribution is now handled directly by the distribution worker writing to all 3 origins in parallel with atomic writes and checksum verification. See "Dual-Path Synchronization: Solutions" section above.

---

## Cloudflare Configuration

### DNS Setup

```
dpp.eurocomply.eu    A      <origin1-ip>     (proxied)
dpp.eurocomply.eu    A      <origin2-ip>     (proxied)
dpp.eurocomply.eu    A      <origin3-ip>     (proxied)
```

### Page Rules / Cache Rules

```
URL: dpp.eurocomply.eu/*

Rules:
• Cache Level: Cache Everything
• Edge Cache TTL: 1 day
• Browser Cache TTL: 1 day
• Origin Cache Control: On (respect Cache-Control headers)
```

### Cloudflare API for Cache Purging

```typescript
// When DPP is updated or revoked
async function purgeCloudflareCache(gtin: string): Promise<void> {
  await fetch(
    `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: [
          `https://dpp.eurocomply.eu/01/${gtin}`,
          `https://dpp.eurocomply.eu/01/${gtin}/`,
          `https://dpp.eurocomply.eu/gtin/${gtin}/dpp.json`,
          `https://dpp.eurocomply.eu/gtin/${gtin}/index.html`,
        ],
      }),
    }
  );
}
```

---

## Write Path Architecture (AWS)

The write path (workspace operations that populate The Hub) remains on AWS for reliability and managed services. All four workspaces—Design (PLM), Operations (ERP-lite), Marketing (PIM), and Compliance (DPP)—write product data to The Hub, building workspace data for each product:

```
┌─────────────────────────────────────────────────────────────────┐
│  WRITE PATH - AWS (eu-central-1)                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  API Layer                                                      │
│  ─────────                                                      │
│  • AWS ECS Fargate (auto-scaling)                               │
│  • 2-10 instances based on load                                 │
│  • Handles 1,000+ concurrent users                              │
│                                                                  │
│  Database Layer                                                 │
│  ──────────────                                                 │
│  • AWS RDS PostgreSQL (Multi-AZ)                                │
│  • db.t3.medium → db.r6g.xlarge as needed                      │
│  • Handles 10,000+ transactions/second                          │
│                                                                  │
│  Caching Layer                                                  │
│  ─────────────                                                  │
│  • AWS ElastiCache Redis                                        │
│  • Session caching, rate limiting                               │
│  • Reduces DB load by 50-70%                                    │
│                                                                  │
│  Job Processing                                                 │
│  ──────────────                                                 │
│  • BullMQ workers (2-5 instances)                               │
│  • Handles bulk imports, Shopify sync                           │
│  • DPP publishing to Hetzner origins                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## EPCIS Event Storage

EPCIS events track supply chain activities (receiving, shipping, transformations) and are stored separately from the workspace product data. The Operations workspace generates these events automatically based on user actions.

### Storage Strategy (Year 1-2)

**Keep it simple—PostgreSQL only:**

```
┌─────────────────────────────────────────────────────────────────┐
│  EPCIS STORAGE STRATEGY                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PostgreSQL (Multi-tenant Cluster)                              │
│  ─────────────────────────────────                              │
│                                                                  │
│  epcis_events table:                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ organization_id  │ event_id  │ event_time │ event_json  │   │
│  │ (partition key)  │ (PK)      │ (indexed)  │ (JSONB)     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Why PostgreSQL is enough:                                      │
│  • Large retailer (1M SKUs) = 50M events/year ≈ 100 GB/year    │
│  • 100 customers at this scale = 10 TB (manageable)            │
│  • PostgreSQL handles 10+ TB comfortably                        │
│  • Cost: ~$500/month for managed Postgres                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cold Tier Migration Path

**Trigger:** When approaching 500GB–1TB, add cold storage tier:

```
┌─────────────────────────────────────────────────────────────────┐
│  COLD TIER STRATEGY (>500GB)                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Hot tier (PostgreSQL):                                         │
│  • Events < 30 days old                                          │
│  • Fast queries for operational use                              │
│                                                                  │
│  Cold tier (R2/S3 + Parquet):                                   │
│  • Events > 30 days old                                          │
│  • 7-year retention (regulatory requirement)                     │
│  • Queryable via DuckDB or Athena                               │
│  • Cost: ~$0.015/GB/month                                       │
│                                                                  │
│  Migration runs nightly, moving aged events                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Capacity & Fair Use

| Metric | Policy |
|--------|--------|
| Events per product | ~100 events/product/year (typical) |
| Storage per org | "Unlimited" with fair use |
| Fair use threshold | >500 events/product/year triggers review |
| Enterprise override | Custom limits for >500K products |
| Retention | 7 years total (regulatory requirement) |

See [EPCIS_INTEGRATION.md](./EPCIS_INTEGRATION.md) for full EPCIS event flows and repository connection details.

---

## Error Handling & Resilience

### API Error Response Standard

All API endpoints return consistent error responses:

```typescript
// Standard Error Response
interface ApiErrorResponse {
  success: false;
  error: {
    code: string;           // Machine-readable: "VALIDATION_ERROR", "RATE_LIMIT_EXCEEDED"
    message: string;        // Human-readable: "Invalid GTIN format"
    details?: {
      field?: string;       // Which field failed
      reason?: string;      // Why it failed
      retryAfter?: number;  // Seconds until retry allowed
      retryable: boolean;   // Can client retry this request?
    };
  };
  meta: {
    requestId: string;      // For support/debugging
    timestamp: string;      // ISO 8601
  };
}
```

**Error Code Taxonomy:**

| Code | HTTP | Retryable | Description |
|------|------|-----------|-------------|
| `VALIDATION_ERROR` | 400 | No | Invalid input data |
| `AUTHENTICATION_REQUIRED` | 401 | No | Missing or invalid API key |
| `INSUFFICIENT_PERMISSIONS` | 403 | No | API key lacks required scope |
| `RESOURCE_NOT_FOUND` | 404 | No | Passport, credential, etc. not found |
| `RESOURCE_CONFLICT` | 409 | No | Duplicate GTIN, state conflict |
| `RATE_LIMIT_EXCEEDED` | 429 | Yes | Too many requests |
| `DEPENDENCY_UNAVAILABLE` | 503 | Yes | External service down |
| `INTERNAL_ERROR` | 500 | Yes | Unexpected server error |

### Retry Policies

Different operations have different retry strategies:

```
┌─────────────────────────────────────────────────────────────────┐
│  RETRY POLICY MATRIX                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Operation              │ Retries │ Backoff    │ Max Wait       │
│  ───────────────────────┼─────────┼────────────┼────────────────│
│  API Requests (client)  │ 3       │ Exp 1s     │ 30s            │
│  Stripe Webhooks        │ 5       │ Exp 30s    │ 24h (Stripe)   │
│  EPCIS Event Push       │ 5       │ Exp 5s     │ 5 minutes      │
│  GS1 Resolver Lookup    │ 3       │ Exp 2s     │ 30s            │
│  File Generation (R2)   │ 3       │ Exp 1s     │ 10s            │
│  Email Delivery         │ 5       │ Exp 60s    │ 1 hour         │
│  Credential Issuance    │ 2       │ Fixed 2s   │ 10s            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Backoff Formula: delay = min(base * 2^attempt, maxWait)
```

**BullMQ Job Retry Configuration:**

```typescript
// Queue-specific retry policies
const retryPolicies = {
  'file-generation': {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
  'epcis-push': {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
  },
  'email-delivery': {
    attempts: 5,
    backoff: { type: 'exponential', delay: 60000 },
  },
  'credential-issuance': {
    attempts: 2,
    backoff: { type: 'fixed', delay: 2000 },
  },
};
```

### Circuit Breaker Patterns

External dependencies use circuit breakers to prevent cascade failures:

```
┌─────────────────────────────────────────────────────────────────┐
│  CIRCUIT BREAKER STATE MACHINE                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    ┌────────┐     5 failures     ┌────────┐                     │
│    │ CLOSED │ ─────────────────► │  OPEN  │                     │
│    │(normal)│                    │(reject)│                     │
│    └────────┘                    └────────┘                     │
│         ▲                             │                          │
│         │                             │ 30s timeout              │
│         │ success                     ▼                          │
│         │                       ┌──────────┐                     │
│         └────────────────────── │HALF-OPEN │                     │
│                                 │ (probe)  │                     │
│                                 └──────────┘                     │
│                                       │                          │
│                              failure  │                          │
│                                       ▼                          │
│                                 Back to OPEN                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Circuit Breaker Configuration per Dependency:**

| Dependency | Failure Threshold | Timeout | Half-Open Probes |
|------------|-------------------|---------|------------------|
| Stripe API | 5 failures/60s | 30s | 1 request |
| EPCIS Repository | 5 failures/60s | 30s | 1 request |
| GS1 Resolver | 3 failures/30s | 15s | 1 request |
| Email Service | 5 failures/120s | 60s | 1 request |
| R2 Storage | 3 failures/30s | 15s | 1 request |

**Implementation Pattern:**

```typescript
// Circuit breaker wrapper (conceptual)
interface CircuitBreakerConfig {
  failureThreshold: number;  // Failures before opening
  successThreshold: number;  // Successes in half-open to close
  timeout: number;           // Time in open state before half-open
}

// When circuit is OPEN, requests fail immediately with:
{
  success: false,
  error: {
    code: "DEPENDENCY_UNAVAILABLE",
    message: "Stripe service temporarily unavailable",
    details: {
      retryable: true,
      retryAfter: 30,
      dependency: "stripe"
    }
  }
}
```

### Graceful Degradation Matrix

When dependencies fail, the system degrades gracefully rather than failing completely:

```
┌─────────────────────────────────────────────────────────────────┐
│  GRACEFUL DEGRADATION MATRIX                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Dependency Down      │ Impact              │ Mitigation         │
│  ─────────────────────┼─────────────────────┼────────────────────│
│  Stripe               │ No new signups      │ Queue signups,     │
│                       │ No billing updates  │ process when back  │
│  ─────────────────────┼─────────────────────┼────────────────────│
│  EPCIS Repository     │ Events not pushed   │ Queue events,      │
│                       │                     │ retry with backoff │
│  ─────────────────────┼─────────────────────┼────────────────────│
│  GS1 Resolver         │ No GTIN lookup      │ Cache lookups,     │
│                       │                     │ allow manual entry │
│  ─────────────────────┼─────────────────────┼────────────────────│
│  R2 Storage           │ No file serving     │ Cloudflare cache   │
│                       │                     │ continues serving  │
│  ─────────────────────┼─────────────────────┼────────────────────│
│  PostgreSQL           │ Full outage         │ Read replicas for  │
│                       │                     │ read-only mode     │
│  ─────────────────────┼─────────────────────┼────────────────────│
│  Redis                │ No caching/queuing  │ Fallback to        │
│                       │                     │ PostgreSQL queues  │
│  ─────────────────────┼─────────────────────┼────────────────────│
│  Email Service        │ No notifications    │ Queue emails,      │
│                       │                     │ retry when back    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Degradation Levels:**

| Level | State | User Experience |
|-------|-------|-----------------|
| **Full** | All systems operational | Normal operation |
| **Degraded** | Non-critical dependency down | Core features work, some delayed |
| **Maintenance** | Planned downtime | Read-only mode, banner displayed |
| **Emergency** | Critical failure | Static error page, status page link |

### Timeout Configuration

Every external call has explicit timeouts:

```typescript
// Timeout configuration per service
const timeouts = {
  // External APIs
  stripe: {
    connect: 5000,    // 5s connection timeout
    read: 30000,      // 30s read timeout (webhooks can be slow)
  },
  epcis: {
    connect: 5000,
    read: 10000,      // 10s for event operations
  },
  gs1Resolver: {
    connect: 3000,
    read: 5000,       // 5s for GTIN lookups
  },

  // Internal services
  database: {
    query: 5000,      // 5s default query timeout
    transaction: 30000, // 30s for complex transactions
  },
  redis: {
    connect: 1000,
    command: 500,     // Sub-second for cache ops
  },
  r2Storage: {
    upload: 60000,    // 60s for large file uploads
    download: 30000,  // 30s for downloads
  },
};
```

### Health Check Endpoints

```
GET /health          → Basic liveness (always returns 200 if process alive)
GET /health/ready    → Readiness (checks all dependencies)
GET /health/detailed → Full dependency status (requires auth)
```

**Readiness Check Response:**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-12T10:00:00Z",
  "checks": {
    "database": { "status": "healthy", "latency": 5 },
    "redis": { "status": "healthy", "latency": 1 },
    "r2": { "status": "healthy", "latency": 15 },
    "stripe": { "status": "degraded", "circuit": "open" },
    "epcis": { "status": "healthy", "latency": 45 }
  },
  "degradedDependencies": ["stripe"]
}
```

### Error Logging Standards

All errors are logged with consistent structure:

```typescript
// Error log structure
interface ErrorLog {
  level: 'error' | 'warn';
  message: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  context: {
    requestId: string;
    userId?: string;
    organizationId?: string;
    operation: string;
    dependency?: string;
  };
  metadata: {
    timestamp: string;
    environment: string;
    version: string;
  };
}

// Example log output
{
  "level": "error",
  "message": "EPCIS event push failed",
  "error": {
    "name": "TimeoutError",
    "message": "Request timed out after 10000ms"
  },
  "context": {
    "requestId": "req_abc123",
    "organizationId": "org_xyz789",
    "operation": "epcis.pushEvent",
    "dependency": "epcis"
  },
  "metadata": {
    "timestamp": "2026-01-12T10:00:00Z",
    "environment": "production",
    "version": "1.2.3"
  }
}
```

---

## Monitoring and Analytics

### Cloudflare Analytics (Free)

```
Cloudflare Dashboard provides:
• Requests (total, cached vs uncached)
• Bandwidth saved
• Geographic distribution
• Cache hit ratio
• Error rates
```

### Custom Analytics (Log-Based)

```
┌─────────────────────────────────────────────────────────────────┐
│  SCAN ANALYTICS                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Option 1: Cloudflare Logpush (Enterprise)                      │
│  • Real-time logs to S3/R2                                      │
│  • Full request details                                         │
│                                                                  │
│  Option 2: Nginx Access Logs (Free)                             │
│  • Logs on origin servers                                       │
│  • Only cache misses (~1% of traffic)                           │
│  • Ship to S3 via Filebeat                                      │
│                                                                  │
│  Option 3: JavaScript Beacon (Free)                             │
│  • Add tracking pixel to DPP HTML pages                         │
│  • Sends scan event to our API                                  │
│  • Works with CDN caching                                       │
│                                                                  │
│  Recommended: Option 3 for production                           │
│  • Works with Cloudflare Free/Pro                               │
│  • Captures all scans (not just cache misses)                   │
│  • Async, doesn't affect page load                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### JavaScript Beacon for Analytics

```html
<!-- Added to each DPP HTML page -->
<script>
  (function() {
    var img = new Image();
    img.src = 'https://api.eurocomply.eu/v1/analytics/scan?' +
      'gtin=' + encodeURIComponent('{{gtin}}') +
      '&t=' + Date.now();
  })();
</script>
```

---

## EU Registry Integration (Future)

When the EU DPP Registry launches (expected July 2026), we'll integrate seamlessly.

**See [EU_INTEGRATION.md](./EU_INTEGRATION.md) for full EBSI and EU Registry integration details.**

```
┌─────────────────────────────────────────────────────────────────┐
│  EU REGISTRY INTEGRATION STRATEGY                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PHASE 1 (Now): Self-Hosted Read Path                           │
│  • Cloudflare + Hetzner serves all DPP traffic                  │
│  • ~$200/month for unlimited scale                              │
│  • did:key for portable identities                              │
│                                                                  │
│  PHASE 2 (2025-2026): EBSI Integration                          │
│  • Add did:ebsi alongside did:key (same keys)                   │
│  • Organizations can register on EU Trusted Issuers Registry    │
│  • EU-anchored trust for customs/regulators                     │
│                                                                  │
│  PHASE 3 (2026-2027): EU Registry Integration                   │
│  • Register DPPs with EU Registry on issuance                   │
│  • EU Registry indexes our DPPs (points to our URLs)            │
│  • Dual-path: direct access + EU discovery                      │
│                                                                  │
│  PHASE 4 (Long-term): Dual Operation                            │
│  • We handle high-volume consumer scans (CDN)                   │
│  • EU Registry handles official lookups (customs, etc.)         │
│  • Both systems interoperate                                    │
│                                                                  │
│  KEY POINT: EU Registry is an index, not a replacement.         │
│  We remain the authoritative DPP content host.                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Model: Passport Static Serving Fields

The Passport model stores a snapshot of workspace data at the time of DPP issuance. The `data` field contains the CIRPASS-compliant data extracted from The Hub, while the `vcJwt` is the signed Verifiable Credential that makes this snapshot tamper-proof.

```prisma
model Passport {
  id              String    @id @default(cuid())
  productId       String
  product         Product   @relation(fields: [productId], references: [id])

  // Core DPP data
  data            Json      // CIRPASS schema
  vcJwt           String    // Signed Verifiable Credential
  status          PassportStatus @default(ACTIVE)

  // Static serving (for billion-scale reads)
  staticPath      String?   // gtin/05901234567890
  cdnUrl          String?   // https://dpp.eurocomply.eu/01/05901234567890
  lastPublishedAt DateTime? // When static files were last pushed to origins

  // Revocation
  revokedAt       DateTime?
  revocationReason String?

  // QR Code
  qrCodeUrl       String?   // CDN URL to QR code SVG

  // Attestations
  attestations    AttestationRef[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([status])
  @@index([productId])
}

enum PassportStatus {
  DRAFT
  ACTIVE
  REVOKED
}
```

---

## Implementation Checklist

### Phase 4 (Compliance) - Required for Launch

| Task | Complexity | Status |
|------|------------|--------|
| Provision 3x Hetzner origin servers | Low | Planned |
| Configure Nginx for static file serving | Low | Planned |
| Set up Lsyncd for file replication | Medium | Planned |
| Configure Cloudflare DNS and caching | Low | Planned |
| Implement DPP pre-rendering (JSON + HTML) | Medium | Planned |
| Build origin push mechanism (rsync/scp) | Medium | Planned |
| Add static serving fields to Passport model | Low | Planned |
| Implement Cloudflare cache purge on update | Low | Planned |
| Revocation page rendering | Low | Planned |
| Content negotiation (HTML vs JSON) | Low | Planned |

### Phase 7 (Retailer Access) - Analytics

| Task | Complexity | Status |
|------|------------|--------|
| Add JavaScript beacon to DPP pages | Low | Planned |
| Build scan analytics API endpoint | Low | Planned |
| Scan analytics dashboard | Medium | Planned |
| Organization-level scan reports | Low | Planned |

### Future: Trillion-Scale (R2 Migration)

| Task | Complexity | Status |
|------|------------|--------|
| Monitor origin bandwidth usage | Low | Planned |
| Set up Cloudflare R2 bucket | Low | Planned |
| Implement R2 publishing function | Medium | Planned |
| Create Cloudflare Worker for R2 routing | Medium | Planned |
| Test R2 migration with subset of DPPs | Medium | Planned |
| Migrate all DPPs from Hetzner to R2 | Medium | Planned |
| Decommission Hetzner origins | Low | Planned |

**Trigger:** Migrate to R2 when origin bandwidth consistently exceeds 40TB/month (67% of limit).

---

## Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  SCALABILITY SUMMARY                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  QR SCANS (READ PATH) - Cloudflare + Hetzner/R2                 │
│  ──────────────────────────────────────────────                 │
│  Current capacity: Up to 50B scans/day (Hetzner)               │
│  Scalable to: 1T+ scans/day (with R2 migration)                │
│  Latency: <200ms (template from CDN + item data from API)      │
│  Architecture: Static template + dynamic item data              │
│  Key: Cloudflare CDN handles 99%+ of template traffic          │
│                                                                  │
│  Cost by scale:                                                 │
│  • Up to 50B scans/day: ~$200/month (Hetzner) ← CURRENT        │
│  • 100B+ scans/day: ~$2,500/month (R2) ← REQUIRES MIGRATION    │
│  • 1T scans/day: ~$11,000/month (R2) ← REQUIRES MIGRATION      │
│                                                                  │
│  ITEM REGISTRATION (WRITE PATH)                                 │
│  ──────────────────────────────                                 │
│  Approach: Template + item data (not full static files/item)   │
│  Per-item: DB insert only (~300 bytes), no file generation     │
│  Throughput: 100-500M items/day                                │
│  Storage (10B items): ~3TB (vs 200TB naive approach)           │
│                                                                  │
│  TIERED STORAGE (10-YEAR RETENTION)                            │
│  ──────────────────────────────────                            │
│  Hot (RDS): Last 90 days, <50ms queries                        │
│  Warm (R2/Parquet): 90 days - 2 years, 100-500ms queries      │
│  Cold (Glacier): 2-10 years, hours to restore                  │
│  Cost (mega-customer, 10yr): ~$1,600/month (vs $9,200 naive)  │
│                                                                  │
│  MULTI-TENANT ISOLATION                                        │
│  ──────────────────────                                        │
│  • Dedicated partitions for mega-customers                     │
│  • Connection pooling by tier                                  │
│  • Query timeouts (100ms lookup, 1s events)                   │
│  • Dedicated read replicas for enterprise                      │
│                                                                  │
│  TOTAL INFRASTRUCTURE                                           │
│  ────────────────────                                           │
│  SME customers: ~$500/month (shared infrastructure)            │
│  Enterprise: ~$2,800/month (priority resources)                │
│  Mega-customer (1B items/yr, 10yr): ~$1,600/month storage     │
│  Savings vs naive approach: 80%+                               │
│                                                                  │
│  KEY INSIGHTS                                                   │
│  ────────────                                                   │
│  1. Template + item data: 99% storage reduction               │
│  2. Tiered storage: 80% cost reduction over 10 years          │
│  3. Partitioning: Multi-tenant isolation at scale             │
│  4. CDN for templates, API for item data                      │
│  5. Hot/warm/cold tiers match access patterns                 │
│  6. Can handle billion-item customers with 10yr retention     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [DPP_CONTENT_PLAN.md](./DPP_CONTENT_PLAN.md) | Workspace data model and how The Hub works |
| [EPCIS_INTEGRATION.md](./EPCIS_INTEGRATION.md) | Full EPCIS event flows and repository setup |
| [INFRASTRUCTURE.md](../INFRASTRUCTURE.md) | Full infrastructure guide (AWS + Hetzner) |
| [EU_INTEGRATION.md](./EU_INTEGRATION.md) | EBSI and EU DPP Registry integration |
| [ARCHITECTURE_PORTABILITY.md](./ARCHITECTURE_PORTABILITY.md) | Data ownership and portability |
| [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) | EU data residency |
| [VERIFIABLE_CREDENTIALS.md](./VERIFIABLE_CREDENTIALS.md) | VC/DID technical details (did:key, did:ebsi) |
| [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) | Full implementation roadmap |

---

*Last Updated: January 11, 2026*
