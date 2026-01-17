# EuroComply DevOps & Infrastructure Design

**Status:** Approved
**Date:** 2026-01-16
**Purpose:** Professional development workflow with staging/production environments

---

## 1. Environment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EUROCOMPLY ENVIRONMENT ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LOCAL DEV              CI/CD                STAGING           PRODUCTION   │
│  ─────────              ─────                ───────           ──────────   │
│                                                                              │
│  Docker Compose    ┌─► GitHub Actions ─┐    AWS SOVEREIGN     AWS SOVEREIGN │
│  • postgres:5432   │   • Lint          │    (eusc-de-east-1)  (eusc-de-east-1)│
│  • redis:6379      │   • Typecheck     │                                    │
│                    │   • Unit tests    │    • ECS Fargate     • ECS Fargate │
│  pnpm dev          │   • Integration   │    • RDS (t4g.micro) • RDS (t4g.sm)│
│                    │   • Build         │    • ElastiCache     • ElastiCache │
│                    │   • Security      │    • R2 + Workers    • R2 + Workers│
│                    └───────────────────┘                                    │
│                                                                              │
│  BOTH ENVIRONMENTS ON AWS EUROPEAN SOVEREIGN CLOUD:                         │
│  • Region: eusc-de-east-1 (Brandenburg, Germany)                           │
│  • Partition: aws-eusc (isolated from global AWS)                          │
│  • Console: https://console.aws.eu                                         │
│  • BSI C5 certified, operated exclusively by EU residents                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Deployment flow:**
- Push to `main` → auto-deploy to staging
- Create release tag (`v1.0.0`) → deploy to production
- Both environments on AWS European Sovereign Cloud, identical Terraform modules

---

## 2. AWS Infrastructure (per environment)

> **Note:** Both staging and production run on AWS European Sovereign Cloud (eusc-de-east-1).
> Terraform modules are identical; only instance sizes differ between environments.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AWS INFRASTRUCTURE                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  VPC (10.0.0.0/16)                                                          │
│  ├── Public Subnets (2 AZs)                                                 │
│  │   └── ALB (Application Load Balancer)                                    │
│  │                                                                          │
│  └── Private Subnets (2 AZs)                                                │
│      ├── ECS Fargate Cluster                                                │
│      │   ├── api-service (2 tasks)         ← Hono API                       │
│      │   ├── worker-service (1 task)       ← Background jobs                │
│      │   └── outbox-service (1 task)       ← Event processing               │
│      │                                                                      │
│      ├── RDS PostgreSQL                                                     │
│      │   ├── Staging: db.t4g.micro                                         │
│      │   └── Production: db.t4g.small Multi-AZ                             │
│      │                                                                      │
│      └── ElastiCache Redis                                                  │
│          └── cache.t4g.micro                                               │
│                                                                              │
│  ECR (Container Registry)                                                   │
│  └── eurocomply-api:latest, :staging, :v1.0.0                              │
│                                                                              │
│  Secrets Manager                                                            │
│  ├── /eurocomply/{env}/database                                            │
│  ├── /eurocomply/{env}/clerk                                               │
│  └── /eurocomply/{env}/redis                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Monthly cost estimate (Sovereign Cloud ~10-20% premium over standard regions):**
- Staging: ~€90-100/mo (smaller instances, single-AZ)
- Production: ~€175-190/mo (larger instances, Multi-AZ)

---

## 3. Cloudflare Infrastructure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE INFRASTRUCTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DNS (eurocomply.eu)                                                        │
│  ├── api.eurocomply.eu        → AWS ALB (proxied)                          │
│  ├── app.eurocomply.eu        → Vercel (frontend)                          │
│  ├── dpp.eurocomply.eu        → Cloudflare Workers                         │
│  └── staging.eurocomply.eu    → AWS ALB (staging)                          │
│                                                                              │
│  R2 Buckets (zero egress)                                                   │
│  ├── eurocomply-dpps-staging                                                │
│  └── eurocomply-dpps-production                                            │
│      └── /{org_id}/{passport_id}/                                          │
│          ├── credential.json   (signed VC)                                 │
│          ├── qr.png            (GS1 Digital Link)                          │
│          └── preview.html      (human-readable)                            │
│                                                                              │
│  Workers                                                                    │
│  └── dpp-serve (content negotiation, edge caching)                         │
│                                                                              │
│  WAF Rules                                                                  │
│  ├── Rate limiting (1000 req/min per IP)                                   │
│  └── Bot protection                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why Cloudflare for DPPs:** ESPR requires free public access. AWS egress at scale = €38k/mo. Cloudflare R2 = €0 egress.

---

## 4. Terraform Structure

```
infrastructure/
└── terraform/
    ├── modules/                    ← Reusable components
    │   ├── vpc/
    │   ├── ecs-cluster/
    │   ├── rds/
    │   ├── elasticache/
    │   ├── alb/
    │   └── secrets/
    │
    ├── environments/               ← Environment configs
    │   ├── staging/
    │   │   ├── main.tf
    │   │   ├── terraform.tfvars
    │   │   └── backend.tf
    │   └── production/
    │       ├── main.tf
    │       ├── terraform.tfvars
    │       └── backend.tf
    │
    └── bootstrap/                  ← One-time setup
        └── main.tf                 (S3 state bucket, IAM)
```

**Environment differences via terraform.tfvars:**

| Variable | Staging | Production |
|----------|---------|------------|
| rds_instance_class | db.t4g.micro | db.t4g.small |
| rds_multi_az | false | true |
| ecs_api_count | 1 | 2 |

---

## 5. CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GITHUB ACTIONS WORKFLOWS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ci.yml (exists)                                                            │
│  ────────────────                                                            │
│  Trigger: push to any branch, all PRs                                       │
│  Jobs: lint → typecheck → unit-tests → integration-tests → build            │
│                                                                              │
│  deploy-staging.yml                                                         │
│  ─────────────────                                                           │
│  Trigger: push to main (after CI passes)                                    │
│  Jobs: build image → push ECR → update ECS → smoke tests                    │
│                                                                              │
│  deploy-production.yml                                                      │
│  ────────────────────                                                        │
│  Trigger: release tag (v*)                                                  │
│  Jobs: build image → push ECR → update ECS → smoke tests                    │
│                                                                              │
│  terraform.yml                                                              │
│  ─────────────                                                               │
│  Trigger: changes to infrastructure/terraform/**                            │
│  Jobs: fmt → plan → apply (manual approval for prod)                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Testing Strategy

```
                          ┌───────────┐
                          │   E2E     │  ← Few, after deploy only
                          │  (Smoke)  │
                         ─┴───────────┴─
                        ┌───────────────┐
                        │  Integration  │  ← API + real database
                        │    Tests      │    in CI
                       ─┴───────────────┴─
                      ┌───────────────────┐
                      │    Unit Tests     │  ← Fast, isolated
                      │   (most tests)    │
                     ─┴───────────────────┴─
```

**Test types:**
- **Unit tests:** Pure functions, no DB (packages/shared)
- **Integration tests:** API endpoints with real PostgreSQL (apps/api)
- **Smoke tests:** Health checks after deployment

**File structure:**
```
apps/api/src/test/
├── setup.ts
├── helpers.ts
├── integration/
│   ├── organizations.test.ts
│   └── auth.test.ts
└── e2e/
    └── smoke.test.ts
```

---

## 7. Implementation Phases

| Phase | Description | Dependencies |
|-------|-------------|--------------|
| **1. Integration Tests** | Test structure, DB helpers, API tests | None - start now |
| **2. Docker & ECR** | Dockerfile, ECR repo, build pipeline | AWS account |
| **3. Staging Infra** | Terraform modules, deploy staging | AWS + DNS |
| **4. Cloudflare** | R2, Workers, WAF | Cloudflare account |
| **5. Production** | Multi-AZ, monitoring, first deploy | Staging stable |

**Phase 1 can start immediately** - only needs existing GitHub Actions with PostgreSQL service.

---

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| IaC Tool | Terraform | Industry standard, modular, great AWS support |
| Environments | 3 (Local, Staging, Prod) | Staging mirrors prod, catches issues early |
| Deploy trigger | GitOps | Auto-staging on merge, tag for production |
| Dev environment | Local (user-managed) | User preference |
| Testing | Pyramid (unit → integration → smoke) | Fast feedback, thorough coverage |
| **All AWS Infrastructure** | AWS European Sovereign Cloud | Maximum EU data sovereignty, marketing differentiator, BSI C5 certified |

---

## 8. AWS European Sovereign Cloud

EuroComply runs entirely on AWS European Sovereign Cloud for maximum EU data sovereignty.

### Overview

| Attribute | Value |
|-----------|-------|
| Partition | `aws-eusc` |
| Region | `eusc-de-east-1` |
| Location | Brandenburg, Germany |
| Console | https://console.aws.eu |
| Status | Generally Available (Jan 15, 2026) |

### Why Sovereign Cloud for EuroComply

- **Complete EU data residency** - All data AND metadata stays in EU
- **EU-only operations** - Only EU-resident staff can access infrastructure
- **EU legal jurisdiction** - German-incorporated subsidiaries under EU law
- **BSI C5 certified** - German government cloud security standard
- **Marketing differentiator** - Only compliance platform on Sovereign Cloud

### Account Creation Steps

AWS European Sovereign Cloud requires a **separate AWS account** - you cannot use existing AWS accounts.

1. Go to https://console.aws.eu
2. Click "Create a new AWS account"
3. Provide:
   - Email address (use dedicated ops email, e.g., aws-sovereign@eurocomply.com)
   - Account name: `eurocomply-sovereign`
   - Payment method (supports EUR billing)
4. Complete identity verification
5. Select support plan

### AWS CLI Setup

```bash
# Configure AWS CLI for Sovereign Cloud
aws configure --profile eurocomply-sovereign

# Set the region
AWS Default region: eusc-de-east-1

# Verify access
aws --profile eurocomply-sovereign sts get-caller-identity
```

### Key Differences from Standard AWS

| Feature | Standard AWS | European Sovereign Cloud |
|---------|-------------|-------------------------|
| Partition | `aws` | `aws-eusc` |
| ARN format | `arn:aws:...` | `arn:aws-eusc:...` |
| Console | console.aws.amazon.com | console.aws.eu |
| IAM | Shared globally | EU-only, separate |
| Billing | USD default | EUR default |
| Data location | Region-specific | EU-only guaranteed |

### Terraform Configuration

```hcl
# Provider configuration for Sovereign Cloud
provider "aws" {
  region = "eusc-de-east-1"

  # Sovereign Cloud endpoints (amazonaws.eu domain)
  endpoints {
    sts            = "https://sts.eusc-de-east-1.amazonaws.eu"
    iam            = "https://iam.eusc-de-east-1.amazonaws.eu"
    s3             = "https://s3.eusc-de-east-1.amazonaws.eu"
    ecr            = "https://ecr.eusc-de-east-1.amazonaws.eu"
    ecs            = "https://ecs.eusc-de-east-1.amazonaws.eu"
    rds            = "https://rds.eusc-de-east-1.amazonaws.eu"
    secretsmanager = "https://secretsmanager.eusc-de-east-1.amazonaws.eu"
  }
}

# Backend configuration
terraform {
  backend "s3" {
    bucket         = "eurocomply-terraform-state"
    key            = "staging/terraform.tfstate"  # or "production/terraform.tfstate"
    region         = "eusc-de-east-1"
    dynamodb_table = "eurocomply-terraform-locks"
    encrypt        = true
    endpoints = {
      s3       = "https://s3.eusc-de-east-1.amazonaws.eu"
      dynamodb = "https://dynamodb.eusc-de-east-1.amazonaws.eu"
    }
  }
}
```

### GitHub Actions OIDC

Create OIDC provider in Sovereign Cloud account:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list <thumbprint>
```

### Available Services

90 services available at launch, including everything EuroComply needs:

- **Compute**: ECS, EKS, Lambda, Fargate
- **Database**: RDS (PostgreSQL), Aurora, DynamoDB
- **Storage**: S3, EBS, EFS
- **Networking**: VPC, ALB, NLB, Route53
- **Security**: KMS, Secrets Manager, IAM, Private CA
- **Monitoring**: CloudWatch, X-Ray

### Compliance Certifications

- ISO/IEC 27001:2013
- SOC 1, SOC 2, SOC 3
- BSI C5 (German government standard)
- Independent third-party audits (2026)

### Cost Considerations

Sovereign Cloud pricing is ~10-20% higher than standard regions due to:
- Dedicated EU-only infrastructure
- Enhanced compliance controls
- Separate operational staff

### References

- [AWS European Sovereign Cloud](https://aws.eu/european-sovereign-cloud/)
- [AWS Sovereign Cloud FAQ](https://aws.eu/faq/)
- [AWS Blog - Opening Announcement](https://aws.amazon.com/blogs/aws/opening-the-aws-european-sovereign-cloud/)
- [Documentation](https://docs.aws.eu/)
