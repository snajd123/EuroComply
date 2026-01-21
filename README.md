# EuroComply

**Unified Product Lifecycle & Compliance Platform for EU Regulations**

EuroComply combines PLM, ERP-lite, PIM, and Digital Product Passport (DPP) capabilities into a single platform. Built for brands, manufacturers, and distributors who need to manage product data and comply with EU ESPR regulations.

---

## Platform Overview

### Four Workspaces, One Product

| Workspace | Persona | Focus |
|-----------|---------|-------|
| **Design** | Product Designers, R&D | BOMs, materials, technical specs |
| **Operations** | Supply Chain, Procurement | Batches, inventory, EPCIS events |
| **Marketing** | Brand Managers, E-commerce | Product content, images, syndication |
| **Compliance** | Compliance Officers | DPP issuance, attestations, audit |

All workspaces share a central product registry ("The Hub") with workspace-specific versioned data.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         WORKSPACES                               │
├───────────────┬───────────────┬───────────────┬─────────────────┤
│    Design     │  Operations   │   Marketing   │   Compliance    │
│   (PLM-lite)  │  (ERP-lite)   │   (PIM-lite)  │   (DPP-core)    │
└───────┬───────┴───────┬───────┴───────┬───────┴────────┬────────┘
        └───────────────┴───────────────┴────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │       THE HUB         │
                    │  (Product Registry)   │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│  PostgreSQL   │       │   DynamoDB    │       │ Cloudflare R2 │
│  (Products,   │       │   (Items,     │       │   (DPPs,      │
│   Versions)   │       │    Events)    │       │    Images)    │
└───────────────┘       └───────────────┘       └───────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **API** | Hono | REST API framework |
| **ORM** | MikroORM | Schema-per-tenant PostgreSQL |
| **Database** | PostgreSQL 15 | Products, versions, tenant data |
| **Item Store** | DynamoDB | High-scale serialized items |
| **Storage** | Cloudflare R2 | Zero-egress DPP hosting |
| **CDN** | Cloudflare | Edge caching, DDoS protection |
| **Auth** | Clerk | Authentication, SSO |
| **Signing** | walt.id | DID/VC infrastructure |

### Multi-Tenancy

Schema-per-tenant isolation for all customers:

```
eurocomply database
├── public              -- Tenant registry only
├── tenant_abc123       -- Organization ABC's data
├── tenant_def456       -- Organization DEF's data
└── tenant_ghi789       -- Organization GHI's data
```

---

## Infrastructure

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Compute** | AWS ECS Fargate | Containerized API |
| **Database** | AWS RDS PostgreSQL | Multi-AZ, encrypted |
| **Cache** | AWS ElastiCache | Redis for sessions/queue |
| **Secrets** | AWS Secrets Manager | Credentials |
| **DPP Hosting** | Cloudflare R2 + CDN | Zero egress, global edge |
| **Frontend** | Vercel | Next.js dashboard |

**Region:** AWS European Sovereign Cloud (`eusc-de-east-1`) for maximum EU data sovereignty.

---

## Pricing

| Tier | Base Fee | Users | Storage | DPP Price |
|------|----------|-------|---------|-----------|
| **Starter** | EUR 149/mo | 20 | 500 GB | EUR 0.10/DPP |
| **Growth** | EUR 299/mo | 50 | 1 TB | EUR 0.05/DPP |
| **Scale** | EUR 749/mo | 100 | 2 TB | EUR 0.02/DPP |
| **Enterprise** | EUR 1,999/mo | 200 | 5 TB | EUR 0.008/DPP |

All tiers include: Full platform access, unlimited products/SKUs, API access, 10-year DPP hosting.

---

## Project Structure

```
EuroComply/
├── apps/
│   ├── api/                 # Hono API server
│   └── worker/              # Outbox event processor
├── packages/
│   ├── db/                  # MikroORM entities, migrations
│   └── shared/              # Shared types, constants
├── infrastructure/
│   ├── terraform/           # AWS infrastructure
│   ├── lambda/              # Lambda functions
│   └── scripts/             # Deployment scripts
├── docs/
│   └── plans/               # Architecture & design docs
└── .github/
    └── workflows/           # CI/CD pipelines
```

---

## Development

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- pnpm 10+
- Docker

### Local Setup

```bash
# Clone repository
git clone https://github.com/your-org/EuroComply.git
cd EuroComply

# Install dependencies
pnpm install

# Start infrastructure
docker-compose up -d

# Run development server
pnpm dev
```

### Environment Variables

See `.env.example` for configuration. Key variables:

```env
# Database (MikroORM)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=eurocomply
DB_USER=postgres
DB_PASSWORD=postgres

# Authentication
CLERK_SECRET_KEY=sk_test_xxxxx

# walt.id
WALTID_CORE_URL=http://localhost:7000
```

---

## Documentation

All architecture and design documentation lives in `docs/plans/`:

| Document | Description |
|----------|-------------|
| [00-business-model.md](./docs/plans/00-business-model.md) | Pricing, onboarding, unit economics |
| [01-architecture.md](./docs/plans/01-architecture.md) | System architecture, multi-tenancy |
| [02-data-model.md](./docs/plans/02-data-model.md) | MikroORM entities, schema design |
| [03-security.md](./docs/plans/03-security.md) | Auth, RBAC, encryption |
| [05-design-workspace.md](./docs/plans/05-design-workspace.md) | PLM features, BOMs, materials |
| [06-operations-workspace.md](./docs/plans/06-operations-workspace.md) | ERP-lite, batches, EPCIS |
| [07-marketing-workspace.md](./docs/plans/07-marketing-workspace.md) | PIM, content, syndication |
| [08-compliance-workspace.md](./docs/plans/08-compliance-workspace.md) | DPP issuance, attestations |
| [09-verifiable-credentials.md](./docs/plans/09-verifiable-credentials.md) | DID/VC architecture |
| [10-integrations.md](./docs/plans/10-integrations.md) | Shopify, EPCIS, EU Registry |
| [11-infrastructure.md](./docs/plans/11-infrastructure.md) | AWS, Terraform, CI/CD |
| [12-billing.md](./docs/plans/12-billing.md) | Stripe integration, MAU tracking |

---

## Compliance

### EU Regulations

- **ESPR** (Ecodesign for Sustainable Products Regulation): DPP generation
- **GDPR**: EU data residency on AWS Sovereign Cloud

### Standards

- **W3C Verifiable Credentials**: Tamper-evident DPPs
- **W3C DIDs**: did:key for portable identity
- **GS1 Digital Link**: QR code standards
- **GS1 EPCIS 2.0**: Supply chain events

---

## License

Proprietary - All rights reserved

---

## Support

- Documentation: https://docs.eurocomply.eu
- API Status: https://status.eurocomply.eu
- Contact: support@eurocomply.eu
