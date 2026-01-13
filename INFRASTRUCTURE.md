# EuroComply Infrastructure

Hybrid infrastructure for EU/GDPR-compliant Digital Product Passport platform with CDN-backed scalable architecture.

---

## Overview

EuroComply uses a **dual-path architecture** that separates:
- **Write Path (AWS)**: PIM operations, user management, DPP issuance
- **Read Path (Cloudflare + Hetzner)**: High-volume QR code scans at fixed cost

| Aspect | Write Path (AWS) | Read Path (Hetzner/R2) |
|--------|------------------|------------------------|
| **Purpose** | PIM, API, management | DPP serving (QR scans) |
| **Location** | eu-central-1 (Frankfurt) | Germany + Finland / Global |
| **Provider** | AWS | Cloudflare CDN + Hetzner (or R2 at scale) |
| **Scaling** | Auto-scaling containers | Static files, CDN |
| **Cost Model** | Usage-based | Fixed up to 50B scans/day |
| **Current Capacity** | ~1,000 concurrent users | Up to 50B scans/day (Hetzner) |
| **Scalable To** | 10,000+ users (with DB upgrade) | 1T+ scans/day (with R2 migration) |

### Capacity Reality Check

**Current Infrastructure (as deployed):**
- **Read path**: 3× Hetzner AX41 servers (~€150/month) behind Cloudflare CDN
- **Write path**: 2-10 ECS Fargate tasks + db.t3.medium RDS (~$300/month)
- **Realistic capacity**: Up to 50 billion scans/day (read), ~1,000 concurrent users (write)

**How it scales:**
- **Cloudflare CDN handles 99%+ of read traffic** - our origin servers only see cache misses
- At 99% cache hit rate, 50B scans/day = 500M origin hits = well within Hetzner's 60TB/month limit
- Beyond 50B scans/day: migrate to Cloudflare R2 (documented in SCALABILITY.md, ~$2,500-11,000/month)
- Beyond 1,000 concurrent users: upgrade RDS to db.r6g.large or larger

**Key insight**: The impressive scale numbers come from Cloudflare's global CDN (300+ edge locations, unlimited bandwidth), not our origin servers. Our architecture leverages CDN caching for static DPP files.

### Item-Level DPP Architecture

For item-level serialization (each physical unit has unique DPP), we use a **template + item data** approach:
- **Static template** (per GTIN): Product info, materials, certifications - served from CDN
- **Dynamic item data** (per serial): Lifecycle events, status - fetched from API
- **Item registration**: DB insert only (~300 bytes), no file generation per item
- **Throughput**: 100-500M item registrations/day possible

This enables billion-scale item tracking without generating billions of static files. See [SCALABILITY.md](docs/SCALABILITY.md) for details.

### Storage Tiers (10-Year Retention)

For ESPR-compliant 10-year data retention, we use tiered storage:

| Tier | Data | Retention | Storage | Cost |
|------|------|-----------|---------|------|
| **Hot** (RDS) | Item records + recent events | Last 90 days | PostgreSQL | ~$0.115/GB/mo |
| **Warm** (R2) | Historical events | 90 days - 2 years | Parquet files | ~$0.015/GB/mo |
| **Cold** (Glacier) | Archived events | 2-10 years | Compressed archives | ~$0.004/GB/mo |

**Cost comparison for mega-customer (1B items/year, 10 years):**
- Naive (all in RDS): ~$9,200/month
- Tiered approach: ~$1,600/month (83% savings)

Automated jobs migrate data between tiers nightly. See [SCALABILITY.md](docs/SCALABILITY.md) for implementation details.

**Note:** EuroComply operates a **Hybrid EPCIS Model**: reading from enterprise EPCIS repositories (SAP, IBM) + hosting OpenEPCIS for SMB customers. See [EPCIS_INTEGRATION.md](docs/EPCIS_INTEGRATION.md) for details.

See [SCALABILITY.md](docs/SCALABILITY.md) for detailed architecture.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└────────────────┬────────────────────────────────────┬───────────────────────┘
                 │                                    │
                 │ QR Scans (billions/day)            │ PIM/API (thousands/day)
                 │ dpp.eurocomply.eu                  │ api.eurocomply.eu
                 ▼                                    ▼
┌────────────────────────────────────┐  ┌────────────────────────────────────┐
│   READ PATH (Cloudflare + Hetzner) │  │      WRITE PATH (AWS)               │
│   Fixed cost: ~$200/month          │  │      Usage-based: ~$300/month       │
├────────────────────────────────────┤  ├────────────────────────────────────┤
│                                    │  │                                    │
│  ┌──────────────────────────────┐  │  │  ┌──────────────────────────────┐  │
│  │    Cloudflare CDN            │  │  │  │    Route 53 (DNS)            │  │
│  │    • 300+ edge locations     │  │  │  │    api.eurocomply.eu         │  │
│  │    • Unlimited bandwidth     │  │  │  └──────────────┬───────────────┘  │
│  │    • DDoS protection         │  │  │                 │                  │
│  └──────────────┬───────────────┘  │  │  ┌──────────────▼───────────────┐  │
│                 │ (~1% cache miss) │  │  │    Application Load Balancer │  │
│                 ▼                  │  │  │    SSL termination (ACM)     │  │
│  ┌──────────────────────────────┐  │  │  └──────────────┬───────────────┘  │
│  │    Hetzner Origin Servers    │  │  │                 │                  │
│  │                              │  │  │  ┌──────────────▼───────────────┐  │
│  │  ┌────────┐ ┌────────┐      │  │  │  │    ECS Fargate (2-10 tasks)  │  │
│  │  │ DE-FSN │ │ FI-HEL │      │  │  │  │    Auto-scaling containers   │  │
│  │  │ Nginx  │ │ Nginx  │      │  │  │  └──────────────┬───────────────┘  │
│  │  └────────┘ └────────┘      │  │  │                 │                  │
│  │       ↕ Lsyncd sync ↕       │  │  │  ┌──────────────┼───────────────┐  │
│  │  ┌────────┐                 │  │  │  │              │               │  │
│  │  │ DE-NBG │                 │  │  │  ▼              ▼               ▼  │
│  │  │ Nginx  │                 │  │  │  ┌────────┐ ┌────────┐ ┌────────┐ │
│  │  └────────┘                 │  │  │  │  RDS   │ │ Redis  │ │  SQS   │ │
│  │                              │  │  │  │ Postgres│ │        │ │        │ │
│  │  Static files:              │  │  │  └────────┘ └────────┘ └────────┘ │
│  │  /var/www/dpp/gtin/{gtin}/  │  │  │                                    │
│  │    • index.html             │  │  │  ┌──────────────────────────────┐  │
│  │    • dpp.json               │  │  │  │    S3, Secrets, CloudWatch   │  │
│  │    • qr.svg                 │  │  │  └──────────────────────────────┘  │
│  └──────────────────────────────┘  │  │                                    │
│                                    │  │                                    │
│  Germany/Finland (EU)              │  │  Frankfurt (EU)                    │
│  GDPR Compliant                    │  │  GDPR Compliant                    │
│                                    │  │                                    │
└────────────────────────────────────┘  └────────────────────────────────────┘
                 │                                    │
                 └────────────────┬───────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  DPP Publish Flow       │
                    │  AWS → push → Hetzner   │
                    │  (rsync/scp on issuance)│
                    └─────────────────────────┘
```

---

## AWS Services (Write Path)

### Compute

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **ECS Fargate** | API containers | Auto-scaling 1-10 tasks |
| **ECR** | Container registry | Store Docker images |

### Database

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **RDS PostgreSQL 16** | Primary database | db.t3.medium, Multi-AZ |

### Caching

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **ElastiCache Redis 7** | API cache, sessions | cache.t3.micro cluster |

### Networking

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **VPC** | Network isolation | 10.0.0.0/16 |
| **ALB** | Load balancing | Path-based routing |
| **Route 53** | DNS | api.eurocomply.eu |
| **ACM** | SSL certificates | Auto-renewal |

---

## Hosted OpenEPCIS (EPCIS Event Storage)

EuroComply hosts OpenEPCIS for SMB customers who don't have their own EPCIS repositories.

### Year 1-2 Strategy: PostgreSQL Only

```
┌─────────────────────────────────────────────────────────────────┐
│  HOSTED OPENEPCIS (Multi-tenant)                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Storage: Shared with main RDS PostgreSQL                       │
│  ─────────────────────────────────────────                      │
│                                                                  │
│  epcis_events table:                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ organization_id  │ event_id  │ event_time │ event_json  │   │
│  │ (partition key)  │ (PK)      │ (indexed)  │ (JSONB)     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Why PostgreSQL is enough:                                      │
│  • Large retailer (1M SKUs) = 50M events/year = ~100 GB/year   │
│  • 100 customers at scale = 10 TB (still manageable)            │
│  • PostgreSQL handles 10+ TB comfortably                        │
│  • No additional infrastructure cost (uses main RDS)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Capacity Planning

| Scale | Products | Events/Year | Storage/Year | Notes |
|-------|----------|-------------|--------------|-------|
| Small customer | 1K SKUs | 100K | ~200 MB | Trivial |
| Medium customer | 10K SKUs | 1M | ~2 GB | Trivial |
| Large customer | 100K SKUs | 10M | ~20 GB | Easy |
| Enterprise | 1M SKUs | 100M | ~200 GB | One year |

### Future: Cold Tier (when >500GB total)

When approaching 500GB-1TB of event data:
- Add cold storage tier: Cloudflare R2 + Parquet format
- Events older than 30 days → cold storage
- 7-year retention total (regulatory requirement)
- Estimated cost: ~$0.015/GB/month for cold storage

### Cost Impact

| Tier | Storage Cost | Notes |
|------|--------------|-------|
| Year 1-2 | $0 additional | Included in RDS |
| Year 3+ (hot) | ~$0.10-0.20/GB/month | Keep 30 days hot |
| Year 3+ (cold) | ~$0.015/GB/month | R2/S3 for archive |

---

## Hetzner + Cloudflare (Read Path)

The read path handles all DPP serving (QR code scans) with fixed-cost infrastructure.

### Why Not AWS for Reads?

| Metric | AWS CloudFront | Cloudflare + Hetzner (Current) | Cloudflare + R2 (Future) |
|--------|----------------|--------------------------------|--------------------------|
| 1B scans/day | ~$38,000/month | ~$200/month ✅ | ~$130/month |
| 10B scans/day | ~$250,000/month | ~$200/month ✅ | ~$400/month |
| 50B scans/day | ~$1,250,000/month | ~$200/month ✅ (limit) | ~$1,500/month |
| 100B scans/day | ~$2,500,000/month | ❌ Requires R2 migration | ~$2,500/month |
| 1T scans/day | ~$38,000,000/month | ❌ Requires R2 migration | ~$11,000/month |
| Bandwidth cost | $0.085/GB | Unlimited (Cloudflare) | Unlimited (Cloudflare) |
| Current limit | N/A | ~50B scans/day | Unlimited |

**Note**: The "Cloudflare + Hetzner" column represents our currently deployed infrastructure. R2 migration is planned but not yet deployed. See [SCALABILITY.md](docs/SCALABILITY.md) for migration triggers.

**ESPR requires free DPP access.** We can't pass infrastructure costs to users. Self-hosting the read path solves this.

**Scaling Strategy:**
- Start with Hetzner (~$200/month fixed) up to 50B scans/day
- Migrate to R2 when origin bandwidth exceeds 40TB/month
- At trillion scale, R2 costs ~$11,000/month vs $38M/month on AWS

### Hetzner Origin Servers

| Server | Location | Purpose | Cost |
|--------|----------|---------|------|
| origin1 | Falkenstein, Germany | Primary origin | ~€50/month |
| origin2 | Helsinki, Finland | Failover, geo-redundancy | ~€50/month |
| origin3 | Nuremberg, Germany | Failover | ~€50/month |

**Specifications (AX41):**
- AMD Ryzen 5 3600 (6 cores)
- 64 GB DDR4 RAM
- 2× 512GB NVMe SSD
- 20 TB/month bandwidth included

### Cloudflare CDN

| Feature | Configuration |
|---------|---------------|
| **Plan** | Pro ($20/month) |
| **Bandwidth** | Unlimited |
| **Edge locations** | 300+ worldwide |
| **DDoS protection** | Included |
| **SSL** | Full (strict) |

### DNS Configuration

```
dpp.eurocomply.eu    A    <origin1-ip>    (proxied via Cloudflare)
dpp.eurocomply.eu    A    <origin2-ip>    (proxied via Cloudflare)
dpp.eurocomply.eu    A    <origin3-ip>    (proxied via Cloudflare)

api.eurocomply.eu    → Route 53 → AWS ALB
```

### File Synchronization

Files are pushed from AWS to Hetzner on DPP issuance:

```
AWS ECS (DPP issuance)
        │
        ├─── rsync/scp ───► origin1 (primary)
        │                       │
        │                       ├─── lsyncd ───► origin2
        │                       └─── lsyncd ───► origin3
```

**Sync latency:** <2 seconds from issuance to global availability

### Storage

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **S3** | Assets, backups | Versioning enabled |

### Messaging

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **SQS** | Async job queues | Standard queues |

### Security

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Secrets Manager** | Credentials | Auto-rotation |
| **IAM** | Access control | Least privilege |
| **Security Groups** | Firewall | Deny by default |
| **WAF** | Web firewall | OWASP rules |

### Monitoring

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **CloudWatch Logs** | Application logs | 30-day retention |
| **CloudWatch Metrics** | Performance metrics | Custom dashboards |
| **CloudWatch Alarms** | Alerting | SNS notifications |

---

## Network Architecture

### VPC Design

```
VPC: 10.0.0.0/16
│
├── Public Subnets (ALB, NAT Gateway)
│   ├── eu-central-1a: 10.0.1.0/24
│   ├── eu-central-1b: 10.0.2.0/24
│   └── eu-central-1c: 10.0.3.0/24
│
├── Private Subnets (ECS, RDS, ElastiCache)
│   ├── eu-central-1a: 10.0.10.0/24
│   ├── eu-central-1b: 10.0.11.0/24
│   └── eu-central-1c: 10.0.12.0/24
│
└── Database Subnets (RDS only)
    ├── eu-central-1a: 10.0.20.0/24
    ├── eu-central-1b: 10.0.21.0/24
    └── eu-central-1c: 10.0.22.0/24
```

### Security Groups

| Security Group | Inbound | Outbound |
|----------------|---------|----------|
| **ALB** | 80, 443 from 0.0.0.0/0 | All to VPC |
| **ECS Tasks** | 3000 from ALB only | All (outbound) |
| **RDS** | 5432 from ECS only | None |
| **ElastiCache** | 6379 from ECS only | None |

---

## Environment Configuration

### Required Environment Variables

```env
# ===========================================
# AWS Configuration
# ===========================================
AWS_REGION=eu-central-1
AWS_ACCOUNT_ID=123456789012

# ===========================================
# Application
# ===========================================
NODE_ENV=production
PORT=3000
API_URL=https://api.eurocomply.eu
LOG_LEVEL=info

# ===========================================
# Database (from Secrets Manager)
# ===========================================
DATABASE_URL=postgresql://user:pass@eurocomply-db.xxx.eu-central-1.rds.amazonaws.com:5432/eurocomply?sslmode=require

# ===========================================
# Redis (ElastiCache)
# ===========================================
REDIS_URL=rediss://eurocomply-redis.xxx.cache.amazonaws.com:6379

# ===========================================
# Authentication
# ===========================================
JWT_SECRET=<from-secrets-manager>
JWT_EXPIRES_IN=7d
API_KEY_PREFIX=ec_

# ===========================================
# Shopify (for plugin)
# ===========================================
SHOPIFY_API_KEY=<from-secrets-manager>
SHOPIFY_API_SECRET=<from-secrets-manager>

# ===========================================
# DID Configuration
# ===========================================
DID_METHOD=web
PLATFORM_DID=did:web:api.eurocomply.eu
PLATFORM_DOMAIN=api.eurocomply.eu

# ===========================================
# S3 Storage
# ===========================================
S3_BUCKET=eurocomply-assets-eu
S3_REGION=eu-central-1
```

### Secrets Manager Structure

```
eurocomply/production/
├── database
│   ├── username
│   ├── password
│   └── connection_string
├── jwt
│   └── secret
├── shopify
│   ├── api_key
│   └── api_secret
└── api
    └── master_key
```

---

## Scaling Configuration

### ECS Auto Scaling

```yaml
# Target tracking scaling
Minimum tasks: 1
Maximum tasks: 10
Target CPU utilization: 70%
Target Memory utilization: 80%

# Scale out: Add task when CPU > 70% for 2 minutes
# Scale in: Remove task when CPU < 50% for 5 minutes
```

### RDS Scaling

| Stage | Instance | Storage | Read Replicas |
|-------|----------|---------|---------------|
| **Development** | db.t3.micro | 20 GB | 0 |
| **Production (small)** | db.t3.medium | 100 GB | 1 |
| **Production (large)** | db.r6g.large | 500 GB | 2 |
| **Enterprise** | db.r6g.xlarge | 1 TB | 3 |

### ElastiCache Scaling

| Stage | Node Type | Nodes |
|-------|-----------|-------|
| **Development** | cache.t3.micro | 1 |
| **Production** | cache.t3.medium | 2 (cluster) |
| **Enterprise** | cache.r6g.large | 3 (cluster) |

---

## Cost Estimates

### Total Infrastructure Cost

```
┌─────────────────────────────────────────────────────────────────┐
│  MONTHLY INFRASTRUCTURE COST                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  READ PATH - TIERED SCALING                                     │
│  ─────────────────────────────                                  │
│                                                                  │
│  TIER 1: Startup (up to 50B scans/day) - Hetzner               │
│  ─────────────────────────────────────────────────              │
│  Cloudflare Pro:                    $20/month                   │
│  Hetzner AX41 × 3:                  €150/month (~$165)          │
│  Subtotal:                          ~$185/month (FIXED)         │
│                                                                  │
│  TIER 2: Extreme (100B+ scans/day) - R2                        │
│  ───────────────────────────────────────────                    │
│  Cloudflare Pro:                    $20/month                   │
│  R2 Storage (1.5TB):                ~$25/month                  │
│  R2 Operations:                     ~$2,000-10,000/month        │
│  Subtotal:                          ~$2,500-11,000/month        │
│                                                                  │
│  WRITE PATH (AWS) - SCALES WITH USERS                           │
│  ─────────────────────────────────────                          │
│  Development:                       ~$60/month                  │
│  Production (10K users):            ~$300/month                 │
│  Enterprise (100K users):           ~$800/month                 │
│                                                                  │
│  TOTAL BY SCALE:                                                │
│  • Startup (10B scans):            ~$500/month                 │
│  • Scale (50B scans):              ~$500/month (Hetzner)       │
│  • Extreme (100B scans):           ~$3,000/month (R2)          │
│  • Planetary (1T scans):           ~$12,000/month (R2)         │
│                                                                  │
│  KEY INSIGHT: Start with Hetzner ($200/month fixed).            │
│  Only migrate to R2 when you hit 50B+ scans/day.                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Development/Testing

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| **Write Path (AWS)** | | |
| ECS Fargate | 0.25 vCPU, 0.5 GB, 1 task | ~$10 |
| RDS PostgreSQL | db.t3.micro, 20 GB | ~$15 |
| ElastiCache | cache.t3.micro | ~$12 |
| ALB | Low traffic | ~$20 |
| S3, CloudWatch | Minimal | ~$5 |
| **Read Path (Hetzner)** | | |
| Hetzner VPS | 1x CX21 (dev only) | ~€5 |
| Cloudflare | Free tier | $0 |
| **Total** | | **~$70/month** |

### Production (10K users, any scan volume)

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| **Write Path (AWS)** | | |
| ECS Fargate | 0.5 vCPU, 1 GB, 2-4 tasks | ~$60 |
| RDS PostgreSQL | db.t3.medium, Multi-AZ | ~$80 |
| ElastiCache | cache.t3.medium, 2 nodes | ~$50 |
| ALB | Moderate traffic | ~$30 |
| S3, SQS, Secrets | Moderate | ~$20 |
| **Read Path (Hetzner + Cloudflare)** | | |
| Hetzner AX41 × 3 | Dedicated servers | ~$165 |
| Cloudflare Pro | Unlimited bandwidth | ~$20 |
| **Total** | | **~$425/month** |

*Handles: 10K concurrent users + unlimited DPP scans*

### Enterprise (100K users, any scan volume)

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| **Write Path (AWS)** | | |
| ECS Fargate | 1 vCPU, 2 GB, 4-10 tasks | ~$200 |
| RDS PostgreSQL | db.r6g.large, Multi-AZ | ~$400 |
| ElastiCache | cache.r6g.large, 3 nodes | ~$200 |
| ALB + WAF | High traffic | ~$100 |
| S3, SQS, Secrets | High | ~$50 |
| **Read Path (Hetzner + Cloudflare)** | | |
| Hetzner AX51 × 3 | Larger dedicated servers | ~$250 |
| Cloudflare Pro | Unlimited bandwidth | ~$20 |
| **Total** | | **~$1,220/month** |

*Handles: 100K concurrent users + unlimited DPP scans*

### Cost Comparison: Old vs New Architecture

| Scenario | AWS-Only | Hybrid (Hetzner) | Hybrid (R2) | Best Choice |
|----------|----------|------------------|-------------|-------------|
| 10K users, 1B scans/day | ~$38,500/month | ~$500/month | ~$430/month | Hetzner |
| 10K users, 10B scans/day | ~$250,500/month | ~$500/month | ~$700/month | Hetzner |
| 10K users, 100B scans/day | ~$2,500,500/month | ❌ Exceeds limit | ~$3,000/month | R2 |
| Enterprise, 1T scans/day | ~$38,000,500/month | ❌ Exceeds limit | ~$11,500/month | R2 |

**Notes:**
- Hetzner costs fixed at ~$200/month for read path (60TB/month bandwidth limit)
- R2 costs scale with operations but has zero egress fees
- Switch to R2 when origin bandwidth exceeds 40TB/month consistently
- At trillion scale: R2 saves 99.97% vs AWS CloudFront

---

## Deployment Pipeline

### CI/CD with GitHub Actions

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   GitHub    │────▶│   Build &   │────▶│  Push to    │────▶│  Deploy to  │
│   Push      │     │   Test      │     │  ECR        │     │  ECS        │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Run Tests  │
                    │  (424 tests)│
                    └─────────────┘
```

### Deployment Stages

1. **Development** (dev branch)
   - Auto-deploy on push
   - dev.api.eurocomply.eu

2. **Staging** (staging branch)
   - Auto-deploy on push
   - staging.api.eurocomply.eu

3. **Production** (main branch)
   - Manual approval required
   - api.eurocomply.eu

---

## Security Checklist

### Network Security
- [x] VPC with private subnets for compute/data
- [x] Security groups with least privilege
- [x] NAT Gateway for outbound from private subnets
- [x] No public IPs on ECS tasks or RDS

### Data Security
- [x] RDS encryption at rest (AES-256)
- [x] RDS encryption in transit (SSL required)
- [x] S3 bucket encryption (SSE-S3)
- [x] ElastiCache encryption at rest and in transit

### Access Security
- [x] Secrets in AWS Secrets Manager (not env vars)
- [x] IAM roles for ECS tasks (no access keys)
- [x] MFA required for AWS console
- [x] CloudTrail enabled for audit logging

### Application Security
- [x] WAF with OWASP rules
- [x] Rate limiting via API Gateway or ALB
- [x] SSL/TLS everywhere (ACM certificates)
- [x] Security headers (Helmet.js)

---

## Disaster Recovery

### Backup Strategy

| Component | Backup | Retention | RPO |
|-----------|--------|-----------|-----|
| RDS | Automated daily snapshots | 30 days | 24 hours |
| RDS | Point-in-time recovery | 7 days | 5 minutes |
| S3 | Versioning + cross-region | Indefinite | 0 |
| Secrets | Automatic replication | N/A | 0 |

### Recovery Time Objectives

| Scenario | RTO | Procedure |
|----------|-----|-----------|
| Single AZ failure | 0 (automatic) | Multi-AZ failover |
| ECS task failure | 30 seconds | Auto-restart |
| Region failure | 4 hours | Cross-region restore |

---

## Monitoring & Alerting

### CloudWatch Alarms

| Metric | Threshold | Action |
|--------|-----------|--------|
| ECS CPU > 85% | 5 minutes | Scale out + alert |
| ECS Memory > 90% | 5 minutes | Scale out + alert |
| RDS CPU > 80% | 10 minutes | Alert |
| RDS Storage < 20% | - | Alert |
| ALB 5xx errors > 1% | 5 minutes | Alert |
| ALB latency p99 > 2s | 5 minutes | Alert |

### Log Groups

```
/eurocomply/
├── api/
│   ├── application    (API logs)
│   ├── access         (HTTP access logs)
│   └── error          (Error logs)
├── ecs/
│   └── container      (Container stdout/stderr)
└── alb/
    └── access         (Load balancer access logs)
```

---

## Compliance

### GDPR Compliance

- [x] Data stored in EU (eu-central-1 Frankfurt)
- [x] AWS Data Processing Agreement (DPA) signed
- [x] Encryption at rest and in transit
- [x] Access logging enabled
- [x] Data deletion capabilities
- [x] No data transfer outside EU

### Certifications (AWS)

- SOC 1, SOC 2, SOC 3
- ISO 27001, 27017, 27018
- PCI DSS Level 1
- GDPR compliant
- C5 (Germany)

---

## Getting Started

### Prerequisites

1. AWS Account with admin access
2. AWS CLI installed and configured
3. Terraform installed (v1.5+)
4. Docker installed

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/your-org/EuroComply.git
cd EuroComply

# 2. Navigate to infrastructure
cd infrastructure/terraform

# 3. Initialize Terraform
terraform init

# 4. Review plan
terraform plan

# 5. Apply infrastructure
terraform apply

# 6. Deploy application
./scripts/deploy.sh production
```

See `infrastructure/` directory for Terraform configurations.

---

## Support

- **AWS Support**: Enterprise support recommended for production
- **Documentation**: This file + AWS docs
- **Monitoring**: CloudWatch dashboards
- **Incidents**: PagerDuty/OpsGenie integration recommended

---

**Last Updated**: 2026-01-11
**Version**: 1.2
