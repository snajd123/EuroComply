# Scalability Architecture

## Overview

EuroComply is designed to handle billions of QR code scans per day while maintaining low latency and predictable costs. This is achieved through a **dual-path architecture** that separates high-volume reads (QR scans) from low-volume writes (PIM operations).

---

## Scale Requirements

| Metric | Target |
|--------|--------|
| QR scans per day | 1-10 billion |
| Peak scans per second | 1+ million |
| Scan latency (p99) | <100ms |
| Concurrent PIM users | 10,000+ |
| Products per organization | 100,000+ |
| Total products | 10+ million |

---

## Dual-Path Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DUAL-PATH ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WRITE PATH (Low volume, complex)                                           │
│  ─────────────────────────────────                                          │
│  • PIM operations → PostgreSQL                                              │
│  • DPP issuance → PostgreSQL + S3 + CDN invalidation                       │
│  • User management → PostgreSQL                                             │
│  • Capacity needed: Thousands of writes/day                                 │
│                                                                              │
│  READ PATH (High volume, simple)                                            │
│  ────────────────────────────────                                           │
│  • QR scans → CloudFront CDN → S3 static files                             │
│  • No database                                                              │
│  • No API server                                                            │
│  • No compute                                                               │
│  • Capacity: Billions of reads/day                                          │
│                                                                              │
│  SEPARATION IS KEY                                                          │
│  ─────────────────────────────────                                          │
│  Write path complexity doesn't affect read path performance.                │
│  Read path can scale infinitely without touching write path.                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## DPP Serving Architecture (Billion-Scale)

QR code scans are served entirely from static files via CDN. The database and API are never involved.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DPP SERVING AT BILLION-SCALE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  QR Code: https://dpp.eurocomply.eu/01/05901234567890                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  LAYER 1: CloudFront Global CDN                                      │    │
│  │  ─────────────────────────────────────────────────────────────────   │    │
│  │  • 450+ edge locations worldwide                                     │    │
│  │  • Serves static files directly (no origin hit)                      │    │
│  │  • Cache TTL: 24h (or until invalidation)                            │    │
│  │  • Expected hit rate: 99%+                                           │    │
│  │  • Capacity: Unlimited (AWS manages scaling)                         │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │ (1% cache miss)                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  LAYER 2: S3 Origin (Static Files)                                   │    │
│  │  ─────────────────────────────────────────────────────────────────   │    │
│  │  • Pre-rendered DPP JSON files                                       │    │
│  │  • Pre-rendered DPP HTML pages                                       │    │
│  │  • No compute required                                               │    │
│  │  • Infinite storage capacity                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  DATABASE INVOLVEMENT: ZERO                                                 │
│  API INVOLVEMENT: ZERO                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Static File Structure

```
s3://eurocomply-dpp-public/
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

Routes to: s3://eurocomply-dpp-public/gtin/05901234567890/index.html (browser)
       or: s3://eurocomply-dpp-public/gtin/05901234567890/dpp.json (Accept: application/json)
```

---

## DPP Issuance Flow (Write Path)

When a DPP is issued, static files are generated and uploaded to S3:

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
      staticJsonKey: `gtin/${product.gtin}/dpp.json`,
      staticHtmlKey: `gtin/${product.gtin}/index.html`,
      cdnUrl: `https://dpp.eurocomply.eu/01/${product.gtin}`,
    },
  });

  // 3. Pre-render static files
  const staticFiles = await prerenderDPP(product, signedVC);

  // 4. Upload to S3 (parallel)
  await Promise.all([
    s3.putObject({
      Bucket: 'eurocomply-dpp-public',
      Key: `gtin/${product.gtin}/dpp.json`,
      Body: JSON.stringify(staticFiles.json),
      ContentType: 'application/json',
      CacheControl: 'public, max-age=86400',
    }),
    s3.putObject({
      Bucket: 'eurocomply-dpp-public',
      Key: `gtin/${product.gtin}/index.html`,
      Body: staticFiles.html,
      ContentType: 'text/html',
      CacheControl: 'public, max-age=86400',
    }),
    s3.putObject({
      Bucket: 'eurocomply-dpp-public',
      Key: `gtin/${product.gtin}/qr.svg`,
      Body: staticFiles.qr,
      ContentType: 'image/svg+xml',
      CacheControl: 'public, max-age=86400',
    }),
    s3.putObject({
      Bucket: 'eurocomply-dpp-public',
      Key: `gtin/${product.gtin}/meta.json`,
      Body: JSON.stringify({
        version: passport.id,
        issuedAt: new Date().toISOString(),
        gtin: product.gtin,
        organizationId: product.organizationId,
      }),
      ContentType: 'application/json',
    }),
  ]);

  // 5. Update passport with publish timestamp
  await prisma.passport.update({
    where: { id: passport.id },
    data: { lastPublishedAt: new Date() },
  });

  // 6. Invalidate CDN cache (async, non-blocking)
  cloudfront.createInvalidation({
    DistributionId: process.env.CLOUDFRONT_DPP_DISTRIBUTION_ID,
    InvalidationBatch: {
      Paths: { Quantity: 1, Items: [`/01/${product.gtin}/*`] },
      CallerReference: `dpp-${passport.id}-${Date.now()}`,
    },
  }).catch(err => logger.error('CDN invalidation failed', { err, passportId: passport.id }));

  return passport;
}
```

---

## DPP Update Flow

When a DPP is updated (product data changes), static files are regenerated:

```typescript
async function updateDPP(passportId: string): Promise<void> {
  const passport = await prisma.passport.findUnique({
    where: { id: passportId },
    include: { product: true },
  });

  // 1. Re-sign the VC with updated data
  const newVC = buildDPPCredential(passport.product);
  const signedVC = await wallet.sign(newVC);

  // 2. Update database
  await prisma.passport.update({
    where: { id: passportId },
    data: {
      vcJwt: signedVC.jwt,
      data: newVC.credentialSubject,
    },
  });

  // 3. Re-render and upload static files (same as issuance)
  const staticFiles = await prerenderDPP(passport.product, signedVC);
  await uploadStaticFiles(passport.product.gtin, staticFiles);

  // 4. Invalidate CDN
  await invalidateCDN(passport.product.gtin);

  // 5. Update publish timestamp
  await prisma.passport.update({
    where: { id: passportId },
    data: {
      lastPublishedAt: new Date(),
      cdnInvalidatedAt: new Date(),
    },
  });
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

  // 3. Upload revoked files
  await Promise.all([
    s3.putObject({
      Bucket: 'eurocomply-dpp-public',
      Key: `gtin/${passport.product.gtin}/index.html`,
      Body: revocationHtml,
      ContentType: 'text/html',
      CacheControl: 'no-cache', // Don't cache revocation pages
    }),
    s3.putObject({
      Bucket: 'eurocomply-dpp-public',
      Key: `gtin/${passport.product.gtin}/dpp.json`,
      Body: JSON.stringify(revokedJson),
      ContentType: 'application/json',
      CacheControl: 'no-cache',
    }),
  ]);

  // 4. Force immediate CDN refresh
  await cloudfront.createInvalidation({
    DistributionId: process.env.CLOUDFRONT_DPP_DISTRIBUTION_ID,
    InvalidationBatch: {
      Paths: { Quantity: 1, Items: [`/01/${passport.product.gtin}/*`] },
      CallerReference: `revoke-${passportId}-${Date.now()}`,
    },
  });
}
```

---

## Cost Analysis

### Cost at 1 Billion Scans/Day

```
┌─────────────────────────────────────────────────────────────────┐
│  COST AT 1 BILLION SCANS/DAY                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CloudFront Requests:                                           │
│  • 1B requests × 30 days = 30B requests/month                   │
│  • First 10B: $0.0085/10k = $8,500                              │
│  • Next 20B: $0.0060/10k = $12,000                              │
│  • Total: ~$20,500/month                                        │
│                                                                  │
│  CloudFront Data Transfer:                                      │
│  • Avg response: 5KB                                            │
│  • 30B × 5KB = 150TB/month                                      │
│  • ~$0.085/GB = ~$12,750/month                                  │
│                                                                  │
│  S3 Storage (1M DPPs):                                          │
│  • 1M × 50KB = 50GB                                             │
│  • ~$1.15/month                                                  │
│                                                                  │
│  S3 Requests (1% cache miss):                                   │
│  • 300M requests/month                                          │
│  • $0.0004/1k = ~$120/month                                     │
│                                                                  │
│  TOTAL: ~$33,400/month for 1B scans/day                         │
│                                                                  │
│  Per scan: $0.000001 (one-thousandth of a cent)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cost at 10 Billion Scans/Day

```
┌─────────────────────────────────────────────────────────────────┐
│  COST AT 10 BILLION SCANS/DAY                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CloudFront Requests:                                           │
│  • 10B requests × 30 days = 300B requests/month                 │
│  • Tiered pricing: ~$150,000/month                              │
│                                                                  │
│  CloudFront Data Transfer:                                      │
│  • 300B × 5KB = 1.5PB/month                                     │
│  • ~$100,000/month                                              │
│                                                                  │
│  S3 (unchanged from 1B scenario):                               │
│  • ~$200/month                                                  │
│                                                                  │
│  TOTAL: ~$250,000/month for 10B scans/day                       │
│                                                                  │
│  Per scan: $0.0000008 (less than one-thousandth of a cent)      │
│                                                                  │
│  NOTE: At this scale, negotiate AWS Enterprise Discount Program │
│        for 20-30% savings.                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cost Comparison: Static vs. Dynamic

```
┌─────────────────────────────────────────────────────────────────┐
│  STATIC vs. DYNAMIC SERVING (1B scans/day)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STATIC (CloudFront + S3)                                       │
│  ─────────────────────────                                      │
│  • CDN + Transfer: ~$33,000/month                               │
│  • No compute costs                                             │
│  • No database costs                                            │
│  • Infinite scalability                                         │
│                                                                  │
│  DYNAMIC (API + Database)                                       │
│  ────────────────────────                                       │
│  • ~12,000 requests/second average                              │
│  • ~100,000 requests/second peak                                │
│  • Would require:                                               │
│    - 50+ API server instances (~$50,000/month)                  │
│    - Massive RDS cluster (~$30,000/month)                       │
│    - Redis cluster for caching (~$10,000/month)                 │
│    - Load balancers, NAT, etc. (~$5,000/month)                  │
│  • Total: ~$95,000/month (3x more expensive)                    │
│  • Plus: operational complexity, failure risk                   │
│                                                                  │
│  SAVINGS: ~$62,000/month (65% reduction)                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Write Path Scalability

The write path (PIM operations) uses standard PostgreSQL scaling patterns:

### Current Architecture (Sufficient for Years 1-3)

```
┌─────────────────────────────────────────────────────────────────┐
│  WRITE PATH - CURRENT ARCHITECTURE                               │
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
│  • db.r6g.xlarge (4 vCPU, 32 GB RAM)                           │
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
│  • Rate-limited to respect external APIs                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Future Scaling (Years 3+, if needed)

| Scale Trigger | Solution |
|---------------|----------|
| 10,000+ concurrent users | Add read replicas for analytics/reports |
| 100M+ products | Partition by organization (tenant sharding) |
| Complex analytics | Move reporting to data warehouse (Redshift/BigQuery) |
| Global latency requirements | Multi-region deployment with Route 53 |

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
  staticJsonKey   String?   // S3 key: gtin/05901234567890/dpp.json
  staticHtmlKey   String?   // S3 key: gtin/05901234567890/index.html
  cdnUrl          String?   // https://dpp.eurocomply.eu/01/05901234567890
  lastPublishedAt DateTime? // When static files were last uploaded
  cdnInvalidatedAt DateTime? // When CDN cache was last cleared

  // Revocation
  revokedAt       DateTime?
  revocationReason String?

  // QR Code
  qrCodeUrl       String?   // S3 URL to QR code SVG

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

## CloudFront Configuration

```yaml
# cloudfront-dpp-distribution.yaml
Distribution:
  Origins:
    - Id: S3-DPP-Public
      DomainName: eurocomply-dpp-public.s3.eu-central-1.amazonaws.com
      S3OriginConfig:
        OriginAccessIdentity: origin-access-identity/cloudfront/XXXXX

  DefaultCacheBehavior:
    TargetOriginId: S3-DPP-Public
    ViewerProtocolPolicy: redirect-to-https
    CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6  # CachingOptimized

    # Content negotiation based on Accept header
    # Browser gets HTML, API gets JSON
    FunctionAssociations:
      - EventType: viewer-request
        FunctionARN: arn:aws:cloudfront::XXXXX:function/content-negotiation

  # Custom error pages
  CustomErrorResponses:
    - ErrorCode: 404
      ResponseCode: 404
      ResponsePagePath: /_shared/404.html
      ErrorCachingMinTTL: 60

  # Aliases
  Aliases:
    - dpp.eurocomply.eu

  # SSL
  ViewerCertificate:
    AcmCertificateArn: arn:aws:acm:us-east-1:XXXXX:certificate/XXXXX
    SslSupportMethod: sni-only
    MinimumProtocolVersion: TLSv1.2_2021
```

---

## Monitoring and Analytics

QR scan analytics without database involvement:

### CloudFront Access Logs → S3 → Athena

```sql
-- Query scan patterns by GTIN
SELECT
  date_trunc('hour', time) as hour,
  uri,
  count(*) as scans,
  count(distinct client_ip) as unique_scanners
FROM cloudfront_logs
WHERE date = '2026-01-10'
  AND uri LIKE '/01/%'
GROUP BY 1, 2
ORDER BY 3 DESC
LIMIT 100;
```

### Real-Time Metrics

```
CloudFront → CloudWatch Metrics → Dashboard

Key Metrics:
• Requests (total, by status code)
• Cache hit ratio (target: >99%)
• Latency (p50, p95, p99)
• Data transfer
• Error rate
```

---

## Implementation Checklist

### Phase 4 (Compliance) - Required for Launch

| Task | Complexity | Status |
|------|------------|--------|
| Create S3 bucket for static DPP files | Low | Planned |
| Configure CloudFront distribution | Medium | Planned |
| Implement DPP pre-rendering (JSON + HTML) | Medium | Planned |
| Add static serving fields to Passport model | Low | Planned |
| Upload static files on DPP issuance | Low | Planned |
| CDN invalidation on DPP update | Low | Planned |
| Revocation page rendering | Low | Planned |
| Content negotiation (HTML vs JSON) | Low | Planned |

### Phase 7 (Retailer Access) - Analytics

| Task | Complexity | Status |
|------|------------|--------|
| CloudFront access log delivery to S3 | Low | Planned |
| Athena table for log analysis | Medium | Planned |
| Scan analytics dashboard | Medium | Planned |
| Popular products report | Low | Planned |

---

## Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  SCALABILITY SUMMARY                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  QR SCANS (READ PATH)                                           │
│  ─────────────────────                                          │
│  Capacity: Billions per day                                     │
│  Latency: <100ms globally                                       │
│  Architecture: CloudFront CDN → S3 static files                 │
│  Database involvement: Zero                                     │
│  Cost: ~$33k/month for 1B scans/day                            │
│                                                                  │
│  PIM OPERATIONS (WRITE PATH)                                    │
│  ─────────────────────────                                      │
│  Capacity: Thousands per day                                    │
│  Architecture: ECS → PostgreSQL → Redis                         │
│  Scalable to: 10,000+ concurrent users                         │
│                                                                  │
│  KEY INSIGHT                                                    │
│  ───────────                                                    │
│  Separate read and write paths completely.                      │
│  DPPs are immutable after issuance → perfect for static serving.│
│  QR scans should never touch the database.                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE_PORTABILITY.md](./ARCHITECTURE_PORTABILITY.md) | Data ownership and portability |
| [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) | Full implementation roadmap |
| [INFRASTRUCTURE.md](../INFRASTRUCTURE.md) | AWS infrastructure guide |

---

*Last Updated: January 2026*
