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
│  Docker Compose    ┌─► GitHub Actions ─┐    AWS eu-west-1     AWS eu-west-1 │
│  • postgres:5432   │   • Lint          │    (identical to     (full scale)  │
│  • redis:6379      │   • Typecheck     │     production)                    │
│                    │   • Unit tests    │                                    │
│  pnpm dev          │   • Integration   │    • ECS Fargate     • ECS Fargate │
│                    │   • Build         │    • RDS (t4g.micro) • RDS (t4g.sm)│
│                    │   • Security      │    • ElastiCache     • ElastiCache │
│                    └───────────────────┘    • R2 + Workers    • R2 + Workers│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Deployment flow:**
- Push to `main` → auto-deploy to staging
- Create release tag (`v1.0.0`) → deploy to production
- Both environments use identical Terraform modules, different instance sizes

---

## 2. AWS Infrastructure (per environment)

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

**Monthly cost estimate:**
- Staging: ~€80/mo (smaller instances, single-AZ)
- Production: ~€158/mo (as per architecture doc)

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
