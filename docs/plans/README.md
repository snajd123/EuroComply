# EuroComply Plans & Designs

> This folder contains design documents and implementation plans for EuroComply.

---

## Document Types

| Type | Naming Convention | Purpose |
|------|-------------------|---------|
| **Design** | `YYYY-MM-DD-*-design.md` | High-level architecture, decisions, specifications |
| **Implementation** | `YYYY-MM-DD-*-implementation.md` | Step-by-step execution plans with code |

### Design Documents

Design documents describe WHAT to build and WHY. They contain:
- Architecture diagrams
- Data models
- API specifications
- Decision logs

**Example:** `2026-01-15-architecture-design.md`

### Implementation Plans

Implementation plans describe HOW to build, step-by-step. They contain:
- Exact file paths
- Complete code snippets
- Test commands with expected output
- Commit messages

**Example:** `2026-01-16-core-application-implementation.md`

---

## Master Roadmap

The two key documents that tie everything together:

| Document | Scope | Status |
|----------|-------|--------|
| [Core Application Implementation](./2026-01-16-core-application-implementation.md) | TypeScript code (API, packages) | ✅ Complete |
| [DevOps Infrastructure Design](./2026-01-16-devops-infrastructure-design.md) | Cloud deployment (AWS, Cloudflare) | 🔄 In Progress |

### Infrastructure Phases (from DevOps Design)

| Phase | Description | Status |
|-------|-------------|--------|
| 1. Integration Tests | Test structure, DB helpers | ✅ Complete |
| 2. Docker & ECR | Container build pipeline | ✅ Complete |
| 3. Staging Infra | AWS Terraform, DNS/HTTPS | ✅ Complete |
| 4. Cloudflare | R2, Workers, WAF | 🔄 In Progress |
| 5. Production | Multi-AZ, monitoring | ⏳ Not Started |

---

## Document Index

### Core Architecture
- `2026-01-15-architecture-design.md` - System overview, workspaces, data model

### Workspaces
- `2026-01-15-design-workspace-design.md` - Product registry, materials, BOMs
- `2026-01-15-operations-workspace-design.md` - Inventory, batches, EPCIS
- `2026-01-15-marketing-workspace-design.md` - PIM, content, syndication
- `2026-01-15-compliance-workspace-design.md` - DPP issuance, attestations

### Infrastructure & DevOps
- `2026-01-16-devops-infrastructure-design.md` - AWS, Cloudflare, CI/CD
- `2026-01-16-core-application-implementation.md` - Backend code scaffold
- `2026-01-17-cloudflare-worker-implementation.md` - DPP serving worker

### Security & Compliance
- `2026-01-15-security-design.md` - Authentication, authorization, audit
- `2026-01-15-data-sovereignty-design.md` - EU data residency, GDPR
- `2026-01-15-verifiable-credentials-design.md` - W3C VCs, did:key

### Integrations
- `2026-01-15-ecommerce-design.md` - Shopify integration
- `2026-01-15-epcis-design.md` - Supply chain events
- `2026-01-15-eudi-wallet-integration-design.md` - EU Digital Identity

---

## Conventions

1. **Date prefix**: All documents start with `YYYY-MM-DD-`
2. **Suffix indicates type**: `-design.md` or `-implementation.md`
3. **Status in header**: Every document has a Status field
4. **Cross-references**: Documents link to related docs

---

*Last Updated: 2026-01-17*
