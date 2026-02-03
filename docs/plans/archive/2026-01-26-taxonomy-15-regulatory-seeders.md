# Taxonomy Plan 15: Migration Manifest System

> **Status:** IMPLEMENTED

**Goal:** Load initial regulations (REACH, ESPR, CosIng) and category-regulation mappings for development and testing using a declarative JSON manifest approach.

**Architecture:** The ManifestLoader service loads regulatory content from JSON manifest files. This keeps the loading engine agnostic - the code knows HOW to load, the manifest JSON defines WHAT to load.

**Tech Stack:** MikroORM, TypeScript, JSON Schema

**Location:** `packages/database/src/seed/`

---

## Overview

The migration manifest system provides a declarative way to seed regulatory data:

```
┌─────────────────────────────────────────────────────────────────┐
│                   Migration Manifest System                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  manifests/                                                     │
│    └── eu-regulations-2026.json    ← Declarative content        │
│                                                                 │
│  ManifestLoader.ts                 ← Loading engine             │
│                                                                 │
│  types.ts                          ← TypeScript interfaces      │
│                                                                 │
│  migration-manifest.schema.json    ← JSON Schema validation     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key Principles:**
- **Declarative:** Regulatory content defined in JSON, not code
- **Idempotent:** Safe to run multiple times (skips existing records)
- **Agnostic:** Engine doesn't know about specific regulations

---

## Manifest Structure

### Top-Level Schema

```typescript
interface MigrationManifest {
  version: string;                          // Schema version
  source?: string;                          // Content source URL
  regulations: ManifestRegulation[];        // Regulation definitions
  categoryMappings?: ManifestCategoryMapping[];  // Category links
}
```

### Regulation Definition

```typescript
interface ManifestRegulation {
  code: string;                // Unique identifier (e.g., "REACH")
  name: string;                // Display name
  description?: string;        // Long description
  status: RegulationStatus;    // DRAFT | ACTIVE | ARCHIVED
  version?: string;            // Regulation version
  effectiveDate?: string;      // ISO date string
  metadata?: {
    jurisdiction?: string;     // e.g., "EU"
    type?: string;             // e.g., "REGULATION", "DIRECTIVE"
    officialJournalRef?: string;
  };
  requirements: ManifestRequirement[];  // Nested requirements
}
```

### Requirement Definition

```typescript
interface ManifestRequirement {
  code: string;                    // Unique within regulation
  name: string;                    // Display name
  description?: string;            // Long description
  type: RequirementType;           // ATTRIBUTE_CHECK | SUBSTANCE_SCREEN | CALCULATED_CHECK | DECLARATION
  severity: RequirementSeverity;   // BLOCKER | WARNING | INFO
  attributeTemplateKey?: string;   // For ATTRIBUTE_CHECK
  substanceListCode?: string;      // For SUBSTANCE_SCREEN (resolved to UUID)
  calculationFormula?: string;     // For CALCULATED_CHECK
  handlerConfig?: Record<string, unknown>;  // Handler-specific config
  legalReference?: string;         // Article/Annex reference
  allowTenantExemption?: boolean;  // Default: true
}
```

### Category Mapping

```typescript
interface ManifestCategoryMapping {
  categoryPath: string;     // e.g., "textiles.apparel"
  regulationCode: string;   // Must match a regulation code
}
```

---

## Sample Manifest

Reference: `packages/database/src/seed/manifests/eu-regulations-2026.json`

```json
{
  "$schema": "../migration-manifest.schema.json",
  "version": "1.0",
  "source": "https://eurocomply.io/regulatory-content/eu-2026",
  "regulations": [
    {
      "code": "REACH",
      "name": "Registration, Evaluation, Authorisation and Restriction of Chemicals",
      "description": "EU regulation on chemical substances and their safe use",
      "status": "ACTIVE",
      "version": "2024.1",
      "metadata": {
        "jurisdiction": "EU",
        "type": "REGULATION",
        "officialJournalRef": "Regulation (EC) No 1907/2006"
      },
      "requirements": [
        {
          "code": "SVHC_SCREEN",
          "name": "SVHC Substance Screen",
          "description": "Screen for Substances of Very High Concern",
          "type": "SUBSTANCE_SCREEN",
          "severity": "BLOCKER",
          "substanceListCode": "REACH_SVHC",
          "handlerConfig": {
            "defaultThresholdPct": 0.1
          },
          "legalReference": "Article 33",
          "allowTenantExemption": false
        }
      ]
    },
    {
      "code": "ESPR",
      "name": "Ecodesign for Sustainable Products Regulation",
      "status": "ACTIVE",
      "requirements": [
        {
          "code": "RECYCLED_CONTENT_MIN",
          "name": "Minimum Recycled Content",
          "type": "ATTRIBUTE_CHECK",
          "severity": "BLOCKER",
          "attributeTemplateKey": "recycled_content_pct",
          "handlerConfig": {
            "operator": ">=",
            "threshold": 25,
            "unit": "%"
          }
        }
      ]
    }
  ],
  "categoryMappings": [
    { "categoryPath": "textiles", "regulationCode": "REACH" },
    { "categoryPath": "textiles.apparel", "regulationCode": "ESPR" },
    { "categoryPath": "cosmetics", "regulationCode": "COSING" }
  ]
}
```

---

## ManifestLoader Service

### Location

`packages/database/src/seed/ManifestLoader.ts`

### Interface

```typescript
import { ManifestLoader, LoadResult } from '@eurocomply/database/seed';

const loader = new ManifestLoader(em);
const result: LoadResult = await loader.loadManifest(manifest);

console.log(result);
// {
//   regulationsCreated: 3,
//   regulationsSkipped: 0,
//   requirementsCreated: 7,
//   mappingsCreated: 5
// }
```

### LoadResult

```typescript
interface LoadResult {
  regulationsCreated: number;   // New regulations added
  regulationsSkipped: number;   // Existing regulations (idempotent skip)
  requirementsCreated: number;  // Requirements added
  mappingsCreated: number;      // Category mappings added
}
```

### Idempotent Behavior

The loader is designed for safe repeated execution:

1. **Regulations:** Skipped if `code` already exists
2. **Requirements:** Created only with new regulations
3. **Category Mappings:** Skipped if mapping already exists

```typescript
// First run
const result1 = await loader.loadManifest(manifest);
// { regulationsCreated: 3, regulationsSkipped: 0, ... }

// Second run (safe)
const result2 = await loader.loadManifest(manifest);
// { regulationsCreated: 0, regulationsSkipped: 3, ... }
```

---

## Usage

### Programmatic Loading

```typescript
import { MikroORM } from '@mikro-orm/postgresql';
import { ManifestLoader } from '@eurocomply/database/seed/ManifestLoader';
import manifest from './manifests/eu-regulations-2026.json';

const orm = await MikroORM.init(config);
const em = orm.em.fork();

const loader = new ManifestLoader(em);
const result = await loader.loadManifest(manifest);

console.log(`Created ${result.regulationsCreated} regulations`);
console.log(`Created ${result.requirementsCreated} requirements`);
console.log(`Created ${result.mappingsCreated} category mappings`);

await orm.close();
```

### Loading from File

```typescript
import { readFileSync } from 'fs';
import type { MigrationManifest } from '@eurocomply/database/seed/types';

const json = readFileSync('./manifests/eu-regulations-2026.json', 'utf-8');
const manifest: MigrationManifest = JSON.parse(json);

const loader = new ManifestLoader(em);
await loader.loadManifest(manifest);
```

---

## JSON Schema Validation

The manifest schema is defined in `migration-manifest.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Migration Manifest",
  "description": "Defines regulatory content for database seeding",
  "type": "object",
  "required": ["version", "regulations"],
  "properties": {
    "version": { "type": "string" },
    "source": { "type": "string" },
    "regulations": {
      "type": "array",
      "items": { "$ref": "#/$defs/regulation" }
    },
    "categoryMappings": {
      "type": "array",
      "items": { "$ref": "#/$defs/categoryMapping" }
    }
  }
}
```

Use the schema in manifest files for IDE validation:

```json
{
  "$schema": "../migration-manifest.schema.json",
  "version": "1.0",
  ...
}
```

---

## Requirement Types

The manifest supports four requirement types:

| Type | Purpose | Required Fields |
|------|---------|-----------------|
| `ATTRIBUTE_CHECK` | Validate product attributes | `attributeTemplateKey`, `handlerConfig` |
| `SUBSTANCE_SCREEN` | Screen against substance lists | `substanceListCode`, `handlerConfig` |
| `CALCULATED_CHECK` | Formula-based evaluation | `calculationFormula` |
| `DECLARATION` | Yes/No declarations | `handlerConfig` (question, acceptedAnswers) |

### Handler Config Examples

**ATTRIBUTE_CHECK:**
```json
{
  "operator": ">=",
  "threshold": 25,
  "unit": "%"
}
```

**SUBSTANCE_SCREEN:**
```json
{
  "defaultThresholdPct": 0.1
}
```

**DECLARATION:**
```json
{
  "question": "Has durability testing been performed?",
  "acceptedAnswers": ["Yes", "Not Applicable"],
  "requiresDocument": true,
  "acceptedDocumentTypes": ["application/pdf"]
}
```

---

## File Structure

```
packages/database/src/seed/
├── ManifestLoader.ts              # Loading engine
├── types.ts                       # TypeScript interfaces
├── migration-manifest.schema.json # JSON Schema
├── manifests/
│   └── eu-regulations-2026.json   # Sample EU regulations
└── __tests__/
    └── ManifestLoader.test.ts     # Unit tests
```

---

## Creating New Manifests

To add new regulatory content:

1. **Create JSON file** in `manifests/` directory
2. **Reference schema** for validation: `"$schema": "../migration-manifest.schema.json"`
3. **Define regulations** with requirements
4. **Add category mappings** to link categories
5. **Load via ManifestLoader** in your seeding script

### Example: Adding a New Regulation

```json
{
  "$schema": "../migration-manifest.schema.json",
  "version": "1.0",
  "regulations": [
    {
      "code": "ROHS",
      "name": "Restriction of Hazardous Substances",
      "status": "ACTIVE",
      "metadata": {
        "jurisdiction": "EU",
        "officialJournalRef": "Directive 2011/65/EU"
      },
      "requirements": [
        {
          "code": "ROHS_RESTRICTED",
          "name": "RoHS Restricted Substances",
          "type": "SUBSTANCE_SCREEN",
          "severity": "BLOCKER",
          "substanceListCode": "ROHS_RESTRICTED",
          "handlerConfig": { "defaultThresholdPct": 0.1 },
          "legalReference": "Annex II",
          "allowTenantExemption": false
        }
      ]
    }
  ],
  "categoryMappings": [
    { "categoryPath": "electronics", "regulationCode": "ROHS" }
  ]
}
```

---

## Summary

The Migration Manifest System provides:

- **Declarative JSON manifests** for regulatory content
- **ManifestLoader service** for idempotent database loading
- **JSON Schema validation** for manifest files
- **Support for all requirement types** (attribute, substance, calculated, declaration)
- **Category-regulation mappings** for scoping

**Key Files:**
- `ManifestLoader.ts` - Loading engine
- `types.ts` - TypeScript interfaces
- `migration-manifest.schema.json` - JSON Schema
- `manifests/eu-regulations-2026.json` - Sample EU regulations

---

*Plan created: 2026-01-26*
*Implemented: 2026-01-28*
