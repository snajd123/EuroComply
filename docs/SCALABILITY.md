# Scalability Architecture

## Overview

EuroComply is designed to handle billions of QR code scans per day while maintaining low latency and predictable costs. This is achieved through a **dual-path architecture** that separates high-volume reads (QR scans) from low-volume writes (PIM operations).

**Key Insight:** DPP access must be free for all users (ESPR Article 31). This means infrastructure costs scale with adoption but revenue doesn't. We solve this by self-hosting the read path with Cloudflare (unlimited free bandwidth) + Hetzner (cheap EU bare metal), reducing costs by 99% compared to AWS CloudFront.

---

## Scale Requirements

| Metric | Target | Extreme Scale |
|--------|--------|---------------|
| QR scans per day | 1-10 billion | 1+ trillion |
| Peak scans per second | 1+ million | 10+ million |
| Scan latency (p99) | <100ms | <100ms |
| Concurrent PIM users | 10,000+ | 10,000+ |
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
│  • PIM operations → PostgreSQL (RDS)                                        │
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

## DPP Serving Architecture (Billion-Scale)

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

---

## DPP Issuance Flow (Write Path)

When a DPP is issued, static files are generated and pushed to Hetzner origins:

```typescript
async function issueDPP(product: Product, vc: VerifiableCredential): Promise<Passport> {
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

// Push files to all origin servers
async function pushToOrigins(params: { path: string; files: Record<string, string> }): Promise<void> {
  const origins = [
    { host: 'origin1.eurocomply.eu', path: '/var/www/dpp' },
    { host: 'origin2.eurocomply.eu', path: '/var/www/dpp' },
    { host: 'origin3.eurocomply.eu', path: '/var/www/dpp' },
  ];

  // Write to primary, lsyncd replicates to others
  // Or parallel push to all for immediate consistency
  await Promise.all(origins.map(origin =>
    sshExec(origin.host, `mkdir -p ${origin.path}/${params.path}`)
  ));

  await Promise.all(origins.map(origin =>
    Object.entries(params.files).map(([filename, content]) =>
      scpPush(origin.host, content, `${origin.path}/${params.path}/${filename}`)
    )
  ).flat());
}
```

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

### File Synchronization (Lsyncd)

```lua
-- /etc/lsyncd/lsyncd.conf.lua
-- Primary server pushes to replicas

sync {
    default.rsyncssh,
    source = "/var/www/dpp",
    host = "origin2.eurocomply.eu",
    targetdir = "/var/www/dpp",
    delay = 1,  -- Sync within 1 second
    rsync = {
        compress = true,
        archive = true,
    },
}

sync {
    default.rsyncssh,
    source = "/var/www/dpp",
    host = "origin3.eurocomply.eu",
    targetdir = "/var/www/dpp",
    delay = 1,
    rsync = {
        compress = true,
        archive = true,
    },
}
```

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

The write path (PIM operations) remains on AWS for reliability and managed services:

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
│  Capacity: Trillions per day                                    │
│  Latency: <100ms globally                                       │
│  Architecture: Cloudflare CDN → Hetzner/R2 static files        │
│  Database involvement: Zero                                     │
│                                                                  │
│  Cost by scale:                                                 │
│  • Up to 50B scans/day: ~$200/month (Hetzner)                  │
│  • 100B+ scans/day: ~$2,500/month (R2)                         │
│  • 1T scans/day: ~$11,000/month (R2)                           │
│                                                                  │
│  PIM OPERATIONS (WRITE PATH) - AWS                              │
│  ─────────────────────────────────                              │
│  Capacity: Thousands per day                                    │
│  Architecture: ECS → PostgreSQL → Redis                         │
│  Cost: ~$300/month                                              │
│  Scalable to: 10,000+ concurrent users                         │
│                                                                  │
│  TOTAL INFRASTRUCTURE (at scale)                                │
│  ───────────────────────────────                                │
│  Startup (10B scans): ~$500/month                              │
│  Enterprise (100B scans): ~$2,800/month                        │
│  Planetary (1T scans): ~$11,300/month                          │
│  Savings vs AWS-only: 99.7%                                     │
│                                                                  │
│  KEY INSIGHTS                                                   │
│  ────────────                                                   │
│  1. Separate read and write paths completely                    │
│  2. DPPs are immutable → perfect for CDN caching               │
│  3. Cloudflare offers unlimited bandwidth (free)               │
│  4. Hetzner for startup, R2 for extreme scale                  │
│  5. Tiered scaling: costs only increase at 100B+ scans        │
│  6. EU Registry will absorb read traffic long-term             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [INFRASTRUCTURE.md](../INFRASTRUCTURE.md) | Full infrastructure guide (AWS + Hetzner) |
| [EU_INTEGRATION.md](./EU_INTEGRATION.md) | EBSI and EU DPP Registry integration |
| [ARCHITECTURE_PORTABILITY.md](./ARCHITECTURE_PORTABILITY.md) | Data ownership and portability |
| [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) | EU data residency |
| [VERIFIABLE_CREDENTIALS.md](./VERIFIABLE_CREDENTIALS.md) | VC/DID technical details (did:key, did:ebsi) |
| [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) | Full implementation roadmap |

---

*Last Updated: January 10, 2026*
