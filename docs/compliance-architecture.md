# Compliance Architecture

> **For Claude:** This document describes the compliance evaluation system architecture.

## Overview

The compliance system uses a **regulation-agnostic engine** that separates:
- **HOW** to evaluate (code: handler plugins)
- **WHAT** to evaluate (data: regulations, requirements, manifests)

## Core Concepts

### Regulations and Requirements

```
Regulation (e.g., PPWR, REACH)
  └── Requirement (e.g., minimum recycled content check)
        ├── type: ATTRIBUTE_CHECK | SUBSTANCE_SCREEN | CALCULATED_CHECK | DECLARATION
        ├── severity: BLOCKER | WARNING | INFO
        ├── attributeTemplateKey: string (for ATTRIBUTE_CHECK)
        ├── substanceListId: string (for SUBSTANCE_SCREEN)
        ├── handlerConfig: { operator, threshold, ... }
        └── allowTenantExemption: boolean (guardrail)
```

### Category Inheritance (LTREE)

Categories use PostgreSQL LTREE for hierarchical inheritance:

```
packaging
├── packaging.plastic          ← inherits packaging regulations
│   └── packaging.plastic.pet  ← inherits packaging.plastic regulations
└── packaging.paper
```

### Tenant Layer

Tenants can:
1. **Adopt** system categories via `CategoryAdoption`
2. **Create exemptions** (if `allowTenantExemption: true`)
3. **Add tenant-specific** regulations (beyond system baseline)

### Category Adoption (LIVE/FROZEN/DETACHED)

When a tenant adopts a system category, they choose a **link mode**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CATEGORY ADOPTION MODES                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  LIVE (default)                                                         │
│  ─────────────────                                                      │
│  • Tenant always sees current system baseline                           │
│  • Automatic updates when system category changes                       │
│  • Best for: Tenants who want latest compliance requirements            │
│                                                                         │
│  FROZEN                                                                 │
│  ─────────────────                                                      │
│  • Tenant locked to a specific version                                  │
│  • pinnedRegulationIds captures point-in-time snapshot                  │
│  • System updates don't affect tenant until they explicitly sync        │
│  • Best for: Predictable compliance during certification periods        │
│                                                                         │
│  DETACHED                                                               │
│  ─────────────────                                                      │
│  • Tenant category becomes fully independent (custom)                   │
│  • No longer linked to system category                                  │
│  • Permanent: Cannot be re-linked to system                             │
│  • Best for: Highly customized compliance requirements                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Entity: `CategoryAdoption`** (tenant schema)

| Field | Type | Description |
|-------|------|-------------|
| `systemCategoryId` | text | Links to public.category |
| `localCategory` | FK | Links to TenantCategory |
| `mode` | enum | LIVE, FROZEN, DETACHED |
| `adoptedAt` | timestamp | When adoption occurred |
| `adoptedVersion` | int | Version at adoption time |
| `frozenAtVersion` | int | Version when frozen (FROZEN mode) |
| `updateAvailable` | boolean | True if system has newer version |
| `pinnedRegulationIds` | text[] | Captured regulation IDs (FROZEN mode) |

**API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/category-adoption` | GET | List adopted categories |
| `/api/v1/category-adoption/available` | GET | List available for adoption |
| `/api/v1/category-adoption/:categoryId` | POST | Adopt a system category |
| `/api/v1/category-adoption/:categoryId` | PATCH | Change link mode |
| `/api/v1/category-adoption/:categoryId` | DELETE | Remove adoption |
| `/api/v1/category-adoption/:categoryId/sync` | POST | Manual sync (FROZEN mode) |

### Exemption Guardrail

```typescript
// Requirements can be marked non-exemptable
allowTenantExemption: false  // Critical safety requirements
```

Attempting to exempt a non-exemptable requirement returns HTTP 403.

## Handler Plugins

Each `RequirementType` has a dedicated handler:

| Type | Handler | Entity Fields | Handler Config |
|------|---------|---------------|----------------|
| `ATTRIBUTE_CHECK` | `AttributeCheckHandler` | `attributeTemplateKey` | `{ operator, threshold }` |
| `SUBSTANCE_SCREEN` | `SubstanceScreenHandler` | `substanceListId` | `{ defaultThresholdPct }` |
| `CALCULATED_CHECK` | *(not yet implemented)* | `calculationFormula` | `{ formula, variables, threshold }` |
| `DECLARATION` | `DeclarationHandler` | — | `{ question, acceptedAnswers[], requiresDocument }` |

### Adding New Handlers

1. Implement `RequirementHandler` interface
2. Register in `RequirementEvaluatorEngine`
3. No code changes needed for new regulations using existing handlers

## Evidence and Audit Trail

Evidence records include a **requirement snapshot** to preserve:
- Requirement definition at time of evaluation
- Regulation context
- Handler configuration

This ensures audit integrity even when requirements change.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/compliance-stack/:tenantCategoryId` | GET | Get effective regulations |
| `/api/v1/exemptions` | GET | List exemptions for tenant |
| `/api/v1/exemptions/:id` | GET | Get exemption details |
| `/api/v1/exemptions` | POST | Create exemption |
| `/api/v1/exemptions/:id` | DELETE | Revoke exemption |
| `/api/v1/evidence` | POST | Record evidence |
| `/api/v1/evidence/:productVersionId` | GET | Get evidence for product |

## Migration Manifests

Regulatory content is defined in JSON manifests:

```
packages/database/src/data/manifests/
├── eu-regulations.manifest.json
├── us-regulations.manifest.json
└── manifest.schema.json
```

The `ManifestLoader` service loads these idempotently.

## Related Documentation

- [RULES.md](../RULES.md) - Development standards
- [Multi-Tenant Safety](./multi-tenant-safety.md) - Database isolation patterns
