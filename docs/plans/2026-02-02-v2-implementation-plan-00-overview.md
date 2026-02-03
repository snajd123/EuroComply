# EuroComply v2 Platform Migration: Implementation Plan Overview

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate EuroComply from schema-per-tenant v1 to row-level tenancy v2 with polyglot persistence (4 databases), plugin architecture, and AI infrastructure.

**Architecture:** Complete platform rebuild using row-level tenancy (`tenant_id` on every row), separate GSR database (read-only chemical registry), Neo4j knowledge graph for compliance traversal, and pgvector for AI embeddings. Rules become data (JSON) executed by handlers (code).

**Tech Stack:** PostgreSQL 15, Neo4j 5.x, pgvector, MikroORM, Hono, TypeScript, Clerk, Cloudflare R2

---

## Migration Strategy: Incremental Conversion

**NOT a complete rewrite.** We preserve what works and migrate incrementally:

### What We KEEP (High-Value Existing Code)

| Component | Location | Status |
|-----------|----------|--------|
| BaseEntity pattern | `packages/database/src/entities/BaseEntity.ts` | Keep as-is |
| GSR persona entities | `packages/gsr/src/entities/Substance*.ts` | Migrate to gsr package |
| Seeder patterns | `packages/gsr/src/seeders/*.seeder.ts` | Keep patterns, add Identity Ladder |
| CLI structure | `packages/gsr/src/cli/index.ts` | Extend with new commands |
| Test utilities | `packages/*/src/test-utils.ts` | Adapt for multi-db |
| Parsers | `packages/gsr/src/parsers/*.parser.ts` | Keep as-is |
| Reference data | `packages/gsr/src/reference-data/` | Keep as-is |

### What We MIGRATE (Structural Changes)

| Component | From | To |
|-----------|------|-----|
| Multi-tenancy | Schema-per-tenant | Row-level with `tenant_id` |
| Substance table | `packages/database` | `packages/gsr` (separate DB) |
| Organization | `packages/database/entities/Organization.ts` | `packages/tenant/entities/Tenant.ts` |
| Products/Materials | Tenant schema entities | Row-level tenant entities |

### What We ADD (New Capabilities)

| Component | Package | Purpose |
|-----------|---------|---------|
| Neo4j sync | `packages/graph` | Compliance knowledge graph |
| Plugin system | `packages/tenant` | Verticals, handlers, rules |
| AI infrastructure | `packages/ai` | Embeddings, RAG, agents |
| Identity Ladder | `packages/gsr/src/services` | Universal substance resolution |

---

## Plan Segments

This implementation is split into **6 segments** to maintain detail and accuracy:

| Segment | Document | Tasks | Duration |
|---------|----------|-------|----------|
| **01** | `2026-02-02-v2-implementation-plan-01-gsr-database.md` | GSR database setup, entity migration, Identity Ladder | ~2 days |
| **02** | `2026-02-02-v2-implementation-plan-02-gsr-seeding.md` | Full GSR seeding pipeline with all personas | ~2 days |
| **03** | `2026-02-02-v2-implementation-plan-03-tenant-database.md` | Tenant database with row-level tenancy, event store | ~2 days |
| **04** | `2026-02-02-v2-implementation-plan-04-neo4j-graph.md` | Neo4j setup, sync services, compliance queries | ~2 days |
| **05** | `2026-02-02-v2-implementation-plan-05-plugin-system.md` | Verticals, handlers, rules engine | ~2 days |
| **06** | `2026-02-02-v2-implementation-plan-06-ai-infrastructure.md` | Embeddings, RAG, AI agents, usage limits | ~2 days |

**Total estimated: 12 working days (flexible based on parallelization)**

---

## Execution Order

```
┌─────────────────────────────────────────────────────────────────┐
│  SEGMENT 01: GSR Database                                       │
│  - Create eurocomply_gsr database                               │
│  - Migrate substance entities from packages/database            │
│  - Build Identity Ladder service                                │
│  - Update test utilities for multi-db                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SEGMENT 02: GSR Seeding                                        │
│  - Adapt existing seeders for new schema                        │
│  - Add GSR version tracking                                     │
│  - Full pipeline: CompTox → Personas → Classifications          │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────────┐
│  SEGMENT 03: Tenant DB      │ │  SEGMENT 04: Neo4j Graph        │
│  (can run in parallel)      │ │  (can run in parallel)          │
└─────────────────────────────┘ └─────────────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SEGMENT 05: Plugin System                                      │
│  - Requires: Tenant DB + Neo4j                                  │
│  - Verticals, handlers, rules                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SEGMENT 06: AI Infrastructure                                  │
│  - Requires: All previous segments                              │
│  - Embeddings, RAG, agents                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

Before starting any segment:

1. **Docker running** with PostgreSQL on port 5432
2. **Neo4j** available (will be added to docker-compose)
3. **Node.js 20+** installed
4. **pnpm** as package manager

---

## Design Documents Reference

| Document | Purpose |
|----------|---------|
| `docs/plans/2026-02-02-v2-platform-architecture-design.md` | Full schema definitions, design rationale |
| `docs/plans/2026-02-02-gsr-golden-record-design.md` | GSR Golden Record with persona pattern |
| `docs/plans/00-business-model.md` | Business context, pricing, scale targets |
| `docs/plans/01-architecture.md` | Original v1 architecture (being replaced) |
| `CLAUDE.md` | Development rules (TDD, no mocks, commit format) |

---

## Quality Gates

Each segment must pass before proceeding:

- [ ] All tests pass (`pnpm test`)
- [ ] No TypeScript errors (`pnpm build`)
- [ ] No linting errors (`pnpm lint`)
- [ ] Documentation updated
- [ ] Git commit with proper message format

---

**Next Step:** Proceed to Segment 01: GSR Database Setup

**File:** `docs/plans/2026-02-02-v2-implementation-plan-01-gsr-database.md`

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-02 | Initial plan overview |
