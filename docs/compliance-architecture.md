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
        ├── severity: BLOCKER | WARNING | INFORMATIONAL
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
1. **Adopt** system categories via `TenantCategory.systemCategoryId`
2. **Create exemptions** (if `allowTenantExemption: true`)
3. **Add tenant-specific** regulations (beyond system baseline)

### Exemption Guardrail

```typescript
// Requirements can be marked non-exemptable
allowTenantExemption: false  // Critical safety requirements
```

Attempting to exempt a non-exemptable requirement returns HTTP 403.

## Handler Plugins

Each `RequirementType` has a dedicated handler:

| Type | Handler | Config |
|------|---------|--------|
| `ATTRIBUTE_CHECK` | `AttributeCheckHandler` | `{ operator, threshold, attributeCode }` |
| `SUBSTANCE_SCREEN` | `SubstanceScreenHandler` | `{ substanceListCode, maxConcentration }` |
| `CALCULATED_CHECK` | `CalculatedCheckHandler` | `{ formula, variables, threshold }` |
| `DECLARATION` | `DeclarationHandler` | `{ question, expectedAnswer }` |

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
