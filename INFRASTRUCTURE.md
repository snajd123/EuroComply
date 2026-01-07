# EuroComply Infrastructure

AWS-based infrastructure for EU/GDPR-compliant Digital Product Passport platform.

---

## Overview

| Aspect | Choice |
|--------|--------|
| **Cloud Provider** | AWS (Amazon Web Services) |
| **Primary Region** | eu-central-1 (Frankfurt, Germany) |
| **Compliance** | GDPR, EU Data Residency |
| **Architecture** | Serverless containers (ECS Fargate) |
| **Database** | Managed PostgreSQL (RDS) |
| **Cache** | Managed Redis (ElastiCache) |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AWS eu-central-1 (Frankfurt)                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                           Route 53 (DNS)                               │  │
│  │                     api.eurocomply.eu → ALB                            │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
│  ┌───────────────────────────────▼───────────────────────────────────────┐  │
│  │                      CloudFront (CDN)                                  │  │
│  │            QR codes, static assets, global edge caching               │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
│  ┌───────────────────────────────▼───────────────────────────────────────┐  │
│  │              Application Load Balancer (ALB)                           │  │
│  │                    SSL termination (ACM)                               │  │
│  │                    Path-based routing                                  │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
│         ┌────────────────────────┼────────────────────────┐                 │
│         │                        │                        │                 │
│         ▼                        ▼                        ▼                 │
│  ┌─────────────┐          ┌─────────────┐          ┌─────────────┐         │
│  │ ECS Fargate │          │ ECS Fargate │          │ ECS Fargate │         │
│  │   API (1)   │          │   API (2)   │          │   API (N)   │         │
│  │             │          │             │          │             │         │
│  │ Port 3000   │          │ Port 3000   │          │ Port 3000   │         │
│  └──────┬──────┘          └──────┬──────┘          └──────┬──────┘         │
│         │                        │                        │                 │
│         └────────────────────────┼────────────────────────┘                 │
│                                  │                                           │
│    ┌─────────────────────────────┼─────────────────────────────────┐        │
│    │                             │                                 │        │
│    ▼                             ▼                                 ▼        │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐     │
│  │ RDS PostgreSQL  │    │   ElastiCache   │    │        SQS          │     │
│  │                 │    │     Redis       │    │                     │     │
│  │ Primary + RR    │    │    Cluster      │    │   vc-issuance-queue │     │
│  │ Multi-AZ        │    │                 │    │   webhook-queue     │     │
│  │                 │    │                 │    │                     │     │
│  │ Port 5432       │    │   Port 6379     │    │                     │     │
│  └────────┬────────┘    └─────────────────┘    └─────────────────────┘     │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │  Read Replica   │  ← High-traffic reads (QR verification)                │
│  └─────────────────┘                                                        │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Supporting Services                            │  │
│  │                                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │  │
│  │  │ S3 Buckets   │  │   Secrets    │  │  CloudWatch  │  │    ACM    │  │  │
│  │  │              │  │   Manager    │  │              │  │           │  │  │
│  │  │ - assets     │  │              │  │ - Logs       │  │ SSL Certs │  │  │
│  │  │ - backups    │  │ - DB creds   │  │ - Metrics    │  │           │  │  │
│  │  │ - documents  │  │ - API keys   │  │ - Alarms     │  │           │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └───────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## AWS Services

### Compute

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **ECS Fargate** | API containers | Auto-scaling 1-10 tasks |
| **ECR** | Container registry | Store Docker images |

### Database

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **RDS PostgreSQL 16** | Primary database | db.t3.medium, Multi-AZ |
| **RDS Read Replica** | Read scaling | For verification queries |

### Caching

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **ElastiCache Redis 7** | API cache, sessions | cache.t3.micro cluster |

### Networking

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **VPC** | Network isolation | 10.0.0.0/16 |
| **ALB** | Load balancing | Path-based routing |
| **CloudFront** | CDN | Global edge locations |
| **Route 53** | DNS | Hosted zone |
| **ACM** | SSL certificates | Auto-renewal |

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

## Cost Estimates (eu-central-1)

### Development/Testing

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| ECS Fargate | 0.25 vCPU, 0.5 GB, 1 task | ~$10 |
| RDS PostgreSQL | db.t3.micro, 20 GB | ~$15 |
| ElastiCache | cache.t3.micro | ~$12 |
| ALB | Low traffic | ~$20 |
| S3, CloudWatch, etc. | Minimal | ~$5 |
| **Total** | | **~$62/month** |

### Production (10K users)

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| ECS Fargate | 0.5 vCPU, 1 GB, 2-4 tasks | ~$60 |
| RDS PostgreSQL | db.t3.medium, Multi-AZ, 100 GB | ~$80 |
| RDS Read Replica | db.t3.medium | ~$35 |
| ElastiCache | cache.t3.medium, 2 nodes | ~$50 |
| ALB | Moderate traffic | ~$30 |
| CloudFront | 100 GB transfer | ~$15 |
| S3, SQS, Secrets | Moderate | ~$20 |
| **Total** | | **~$290/month** |

### Production (100K users)

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| ECS Fargate | 1 vCPU, 2 GB, 4-10 tasks | ~$300 |
| RDS PostgreSQL | db.r6g.large, Multi-AZ, 500 GB | ~$400 |
| RDS Read Replicas | 2x db.r6g.large | ~$300 |
| ElastiCache | cache.r6g.large, 3 nodes | ~$350 |
| ALB | High traffic | ~$100 |
| CloudFront | 1 TB transfer | ~$100 |
| S3, SQS, Secrets | High | ~$100 |
| WAF | Standard rules | ~$50 |
| **Total** | | **~$1,700/month** |

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

**Last Updated**: 2026-01-07
**Version**: 1.0
