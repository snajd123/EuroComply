# EuroComply Implementation Roadmap

**Date:** 2026-01-17
**Status:** Active
**Purpose:** Prioritized implementation plan based on all design documentation

---

## Current State

### What's Complete

| Component | Status | Verified |
|-----------|--------|----------|
| **Monorepo & Build** | ✅ Done | pnpm, TypeScript, Vitest |
| **Database Layer** | ✅ Done | Prisma, schema-per-tenant, migrations |
| **Auth Middleware** | ✅ Done | Clerk integration, RBAC |
| **Event System** | ✅ Done | Outbox pattern, processor |
| **Organization CRUD** | ✅ Done | Create org, invite users |
| **Authority System** | ✅ Done | VIEWER/CONTRIBUTOR/EDITOR/MANAGER |
| **DPP Worker** | ✅ Done | Content negotiation, R2 serving |
| **Staging Infra** | ✅ Done | ECS, RDS, Redis, Cloudflare |
| **CI/CD Pipeline** | ✅ Done | GitHub Actions, auto-deploy |
| **Infra Tests** | ✅ Done | All connectivity verified |

### What's NOT Built

| Component | Design Status | Priority |
|-----------|---------------|----------|
| Product Model | ✅ Designed | HIGH |
| BOM Builder | ✅ Designed | HIGH |
| Version Control | ✅ Designed | HIGH |
| Supplier Registry | ✅ Designed | MEDIUM |
| Certificate Ledger | ✅ Designed | MEDIUM |
| Marketing/PIM | ✅ Designed | MEDIUM |
| DPP Snapshot Engine | ✅ Designed | HIGH |
| VC Signing (walt.id) | ✅ Designed | HIGH |
| Shopify Integration | ✅ Designed | LOW |
| Production Infra | ✅ Designed | WHEN NEEDED |

---

## Recommended Implementation Order

### Phase 1: Product Foundation (Next)
**Goal:** Core product model that all workspaces depend on

```
Product Registry → Version Control → BOM Builder
     ↓                   ↓               ↓
(all workspaces    (DRAFT→RELEASED)  (materials +
 reference this)                      components)
```

**Tasks:**
1. Product model (FINISHED_GOOD, RAW_MATERIAL, COMPONENT, VARIANT)
2. Product identifiers (GTIN, SKU, Internal ID)
3. Category/taxonomy system
4. Version control state machine (DRAFT → PENDING_REVIEW → RELEASED)
5. Checkout locks (per-workspace, 72-hour timeout)
6. BOM entries (quantity, unit, scrap rate, yield)
7. Material library (reusable material definitions)

**Why First:** Everything else (operations, marketing, compliance) references products. Can't build DPPs without products.

---

### Phase 2: Design Workspace
**Goal:** PLM functionality - technical specs, BOM, approval workflow

**Tasks:**
1. Design version management
2. BOM builder API (add/remove materials, components)
3. BOM calculations (total weight, recycled content %)
4. Technical specs (category-driven attributes)
5. Document attachments (CAD, spec sheets)
6. Approval workflow (submit → review → approve/reject)

**Why Second:** Design data is required input for DPPs. Marketing enriches Design. Operations references Design versions.

---

### Phase 3: Minimal DPP Issuance
**Goal:** Issue real DPPs with just Design data (skip Marketing/Operations for MVP)

**Tasks:**
1. DPP snapshot engine (Design version → frozen snapshot)
2. walt.id SDK integration (Ed25519 key generation)
3. VC signing (JWS with org's did:key)
4. R2 upload (credential.json, preview.html, qr.png)
5. Status list management (revocation registry)
6. DPP lifecycle (COMMISSIONED → PROVISIONED → ACTIVE)

**Why Third:** This proves the core value proposition. A brand can issue real, verifiable DPPs. Marketing and Operations enrich later.

---

### Phase 4: Operations Workspace
**Goal:** Supply chain transparency, certifications, batch management

**Tasks:**
1. Supplier registry (legal entities, risk scoring)
2. Facility registry (locations, geo-coordinates)
3. Certificate ledger (upload, validity tracking, expiry alerts)
4. Batch management (batch numbers, quantities, status)
5. Item tracking (DynamoDB for billions of items)
6. EPCIS events (manufactured, shipped, received)

**Why Fourth:** Adds supply chain data to DPPs. Not required for basic DPP, but required for full ESPR compliance.

---

### Phase 5: Marketing Workspace
**Goal:** PIM functionality, multi-language content, channel publishing

**Tasks:**
1. Content manager (product descriptions, multi-language)
2. Media assets (images, resizing, DAM)
3. Translation management (locale support)
4. Marketing versions (tied to specific Design versions)
5. Channel publisher framework
6. Shopify syndication (OAuth, metafield sync)

**Why Fifth:** Enhances DPP with consumer-facing content. Not blocking for compliance, but important for brand value.

---

### Phase 6: Full Compliance Workspace
**Goal:** Complete DPP lifecycle with all data sources

**Tasks:**
1. Enhanced snapshot engine (Design + Marketing + Operations)
2. Transparency funnel (Level 1/2/3 detail views)
3. GS1 Digital Link compliance
4. Recall management (batch-level revocation)
5. Audit trail & compliance reporting
6. CSDDD risk assessment integration

---

### Phase 7: Production & Scale
**Goal:** Production-ready infrastructure

**Tasks:**
1. Production Terraform (Multi-AZ RDS)
2. Monitoring & alerting (CloudWatch dashboards)
3. Auto-scaling configuration
4. Security hardening (WAF rules, penetration testing)
5. Load testing
6. Disaster recovery verification

---

## Implementation Timeline

```
Week 1-2:  Phase 1 - Product Foundation
Week 3-4:  Phase 2 - Design Workspace
Week 5-6:  Phase 3 - Minimal DPP Issuance ← MVP HERE
Week 7-8:  Phase 4 - Operations Workspace
Week 9-10: Phase 5 - Marketing Workspace
Week 11+:  Phase 6-7 - Full Compliance + Production
```

**MVP Milestone (Week 6):** Brand can create products, add materials, release versions, and issue verifiable DPPs.

---

## Critical Path

```
Product Model → Design Version → DPP Snapshot → VC Signing → R2 Upload
     ↓              ↓                ↓              ↓           ↓
  (Week 1)      (Week 3)         (Week 5)      (Week 5)     (Week 6)
```

Everything on the critical path must be done in order. Marketing/Operations can be parallelized after Phase 1.

---

## Dependencies

| Feature | Depends On |
|---------|------------|
| Design Version | Product Model |
| BOM Builder | Product Model, Material Library |
| Marketing Version | Design Version (must reference) |
| DPP Snapshot | Design Version (minimum), Marketing/Ops optional |
| VC Signing | walt.id SDK integration |
| Supplier Registry | (independent, can start anytime) |
| Shopify Sync | Marketing Version, Shopify OAuth |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| walt.id integration complexity | Spike in Phase 1 to validate SDK |
| DynamoDB schema for items | Design GSI patterns before implementing |
| BOM calculation performance | Keep calculations simple, no deep recursion |
| Multi-tenant isolation bugs | Extensive integration tests (already have) |

---

## Recommended Next Steps

1. **Start Phase 1** - Create Product model and version control
2. **Spike walt.id** - Validate SDK works before Phase 3
3. **Skip production infra** - Stay on staging until paying customers
4. **Document as we go** - Update designs if implementation differs

---

## Files to Create (Phase 1)

```
packages/db/prisma/schema.prisma  (add Product, ProductVersion, BomEntry, Material)
apps/api/src/routes/products.ts
apps/api/src/routes/materials.ts
apps/api/src/services/product.service.ts
apps/api/src/services/version.service.ts
apps/api/src/test/integration/products.test.ts
```

---

## Success Criteria

| Milestone | Criteria |
|-----------|----------|
| Phase 1 Complete | Can create products, add to BOM, release versions |
| Phase 2 Complete | Full Design workspace workflow functional |
| MVP (Phase 3) | Can issue verifiable DPP, scan QR, verify signature |
| Full Platform | All 4 workspaces functional, Shopify integration |

---

*This roadmap is based on analysis of 30+ design documents. Update as implementation progresses.*
