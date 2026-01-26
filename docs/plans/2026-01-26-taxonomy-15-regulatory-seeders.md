# Taxonomy Plan 15: Regulatory Seeders

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Seed initial regulatory lists (REACH SVHC, RoHS, CosIng samples) and category-list mappings for development and testing.

**Architecture:** Create seeders that populate RegulatoryList, RegulatoryListEntry, and CategoryRegulatoryList with representative data. These are development seeds - production data will come via admin import pipeline (Plan 12).

**Tech Stack:** MikroORM, TypeScript

**Prerequisites:**
- Plan 4 (Substance Registry with seeded substances)
- Plan 5 (Category Service with seeded categories)
- Plan 10 (Regulatory List Registry)
- Plan 11 (Category-List Scoping)

**Reference:** See `docs/plans/2026-01-26-regulatory-vertical-system-design.md`

---

## Critical Dependency: Plan 4 Substance Registry Sync

The seeders use `em.findOne(Substance, { casNumber: entry.cas })` to link regulatory list entries to substances. This **only works if Plan 4 has already seeded the global CAS library**.

**Fail-Safe Behavior:** If a substance is missing, the seeder logs a warning and skips the entry (no crash). However, for complete regulatory coverage, ensure the following CAS numbers are included in Plan 4's seed data:

### Required CAS Numbers for Plan 15 Seeders

| CAS Number | Substance Name | Used By |
|------------|----------------|---------|
| 7439-92-1 | Lead | REACH, RoHS, CosIng |
| 7440-43-9 | Cadmium | REACH, RoHS |
| 18540-29-9 | Hexavalent chromium | REACH, RoHS |
| 117-81-7 | DEHP | REACH, RoHS |
| 84-74-2 | DBP | REACH, RoHS |
| 85-68-7 | BBP | REACH, RoHS |
| 25637-99-4 | HBCDD | REACH |
| 79-94-7 | TBBPA | REACH |
| 80-05-7 | Bisphenol A | REACH |
| 127-19-5 | DMAC | REACH |
| 872-50-4 | NMP | REACH |
| 7439-97-6 | Mercury | RoHS, CosIng |
| 1336-36-3 | PBB | RoHS |
| 32534-81-9 | PBDE | RoHS |
| 84-69-5 | DIBP | RoHS |
| 50-00-0 | Formaldehyde | CosIng |
| 123-31-9 | Hydroquinone | CosIng |
| 71-43-2 | Benzene | CosIng |
| 75-56-9 | Propylene oxide | CosIng |
| 106-89-8 | Epichlorohydrin | CosIng |
| 100-97-0 | Methenamine | CosIng |
| 94-13-3 | Propylparaben | CosIng |

**Recommendation:** Add these 22 substances to Plan 4's seed data to ensure full regulatory list coverage during development.

---

## Task 1: Create REACH SVHC Sample Seeder

**Files:**
- Create: `packages/database/src/seeders/regulatory/reach-svhc.seeder.ts`

**Step 1: Create the seeder**

```typescript
// packages/database/src/seeders/regulatory/reach-svhc.seeder.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { RegulatoryList } from '../../entities/RegulatoryList.js';
import { RegulatoryListEntry } from '../../entities/RegulatoryListEntry.js';
import { Substance } from '../../entities/Substance.js';
import { RestrictionType } from '../../entities/enums/index.js';

/**
 * Sample REACH SVHC Candidate List entries.
 * Real list has 200+ substances - this is a representative sample.
 * Source: https://echa.europa.eu/candidate-list-table
 */
const REACH_SVHC_ENTRIES = [
  // Heavy metals and their compounds
  { cas: '7439-92-1', name: 'Lead', threshold: '0.1', reference: 'Article 57(c)' },
  { cas: '7440-43-9', name: 'Cadmium', threshold: '0.1', reference: 'Article 57(a)' },
  { cas: '18540-29-9', name: 'Chromium (VI)', threshold: '0.1', reference: 'Article 57(a)' },

  // Phthalates
  { cas: '117-81-7', name: 'DEHP (Bis(2-ethylhexyl) phthalate)', threshold: '0.1', reference: 'Article 57(c)' },
  { cas: '84-74-2', name: 'DBP (Dibutyl phthalate)', threshold: '0.1', reference: 'Article 57(c)' },
  { cas: '85-68-7', name: 'BBP (Benzyl butyl phthalate)', threshold: '0.1', reference: 'Article 57(c)' },

  // Flame retardants
  { cas: '25637-99-4', name: 'HBCDD (Hexabromocyclododecane)', threshold: '0.1', reference: 'Article 57(d)' },
  { cas: '79-94-7', name: 'TBBPA (Tetrabromobisphenol A)', threshold: '0.1', reference: 'Article 57(d)' },

  // Bisphenols
  { cas: '80-05-7', name: 'Bisphenol A (BPA)', threshold: '0.1', reference: 'Article 57(c)' },

  // Solvents
  { cas: '127-19-5', name: 'N,N-Dimethylacetamide (DMAC)', threshold: '0.1', reference: 'Article 57(c)' },
  { cas: '872-50-4', name: 'N-Methyl-2-pyrrolidone (NMP)', threshold: '0.1', reference: 'Article 57(c)' },
];

export async function seedReachSvhc(em: EntityManager): Promise<void> {
  console.log('Seeding REACH SVHC Candidate List...');

  // Check if already seeded
  const existing = await em.findOne(RegulatoryList, { code: 'REACH_SVHC' });
  if (existing) {
    console.log('  REACH_SVHC already exists, skipping');
    return;
  }

  // Create the list
  const list = em.create(RegulatoryList, {
    code: 'REACH_SVHC',
    name: 'REACH SVHC Candidate List',
    source: 'ECHA',
    version: '2024-01',
    effectiveDate: new Date('2024-01-23'),
    sourceUrl: 'https://echa.europa.eu/candidate-list-table',
    description: 'Substances of Very High Concern for Authorization under REACH Article 33',
  });

  await em.persistAndFlush(list);

  // Create entries
  let added = 0;
  let skipped = 0;

  for (const entry of REACH_SVHC_ENTRIES) {
    const substance = await em.findOne(Substance, { casNumber: entry.cas });

    if (!substance) {
      console.log(`  Skipping ${entry.cas} (${entry.name}) - substance not in registry`);
      skipped++;
      continue;
    }

    em.create(RegulatoryListEntry, {
      list,
      substance,
      casNumberSnapshot: entry.cas,
      substanceNameSnapshot: entry.name,
      restrictionType: RestrictionType.THRESHOLD,
      thresholdPct: entry.threshold,
      legalReference: entry.reference,
      notes: 'SVHC - declaration required above 0.1% w/w',
    });

    added++;
  }

  await em.flush();
  console.log(`  Added ${added} entries, skipped ${skipped}`);
}
```

**Step 2: Commit**

```bash
git add packages/database/src/seeders/regulatory/reach-svhc.seeder.ts
git commit -m "feat(database): add REACH SVHC sample seeder"
```

---

## Task 2: Create RoHS Restricted Substances Seeder

**Files:**
- Create: `packages/database/src/seeders/regulatory/rohs-restricted.seeder.ts`

**Step 1: Create the seeder**

```typescript
// packages/database/src/seeders/regulatory/rohs-restricted.seeder.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { RegulatoryList } from '../../entities/RegulatoryList.js';
import { RegulatoryListEntry } from '../../entities/RegulatoryListEntry.js';
import { Substance } from '../../entities/Substance.js';
import { RestrictionType } from '../../entities/enums/index.js';

/**
 * RoHS Directive 2011/65/EU Annex II - Restricted Substances
 * These apply at HOMOGENEOUS_MATERIAL level, not article level.
 * Source: https://eur-lex.europa.eu/eli/dir/2011/65
 */
const ROHS_RESTRICTED = [
  { cas: '7439-92-1', name: 'Lead', threshold: '0.1', reference: 'Annex II, Entry 1' },
  { cas: '7439-97-6', name: 'Mercury', threshold: '0.1', reference: 'Annex II, Entry 2' },
  { cas: '7440-43-9', name: 'Cadmium', threshold: '0.01', reference: 'Annex II, Entry 3' },  // Stricter!
  { cas: '18540-29-9', name: 'Hexavalent chromium', threshold: '0.1', reference: 'Annex II, Entry 4' },
  { cas: '1336-36-3', name: 'Polybrominated biphenyls (PBB)', threshold: '0.1', reference: 'Annex II, Entry 5' },
  { cas: '32534-81-9', name: 'Polybrominated diphenyl ethers (PBDE)', threshold: '0.1', reference: 'Annex II, Entry 6' },
  // RoHS 3 additions (2015/863)
  { cas: '117-81-7', name: 'DEHP', threshold: '0.1', reference: 'Annex II, Entry 7' },
  { cas: '84-74-2', name: 'DBP', threshold: '0.1', reference: 'Annex II, Entry 8' },
  { cas: '85-68-7', name: 'BBP', threshold: '0.1', reference: 'Annex II, Entry 9' },
  { cas: '84-69-5', name: 'DIBP', threshold: '0.1', reference: 'Annex II, Entry 10' },
];

export async function seedRohsRestricted(em: EntityManager): Promise<void> {
  console.log('Seeding RoHS Restricted Substances List...');

  // Check if already seeded
  const existing = await em.findOne(RegulatoryList, { code: 'ROHS_RESTRICTED' });
  if (existing) {
    console.log('  ROHS_RESTRICTED already exists, skipping');
    return;
  }

  // Create the list
  const list = em.create(RegulatoryList, {
    code: 'ROHS_RESTRICTED',
    name: 'RoHS Directive Restricted Substances',
    source: 'EU_ROHS',
    version: '2024-01',
    effectiveDate: new Date('2019-07-22'),  // RoHS 3 effective date
    sourceUrl: 'https://eur-lex.europa.eu/eli/dir/2011/65',
    description: 'Restriction of Hazardous Substances in EEE - Annex II',
  });

  await em.persistAndFlush(list);

  // Create entries
  let added = 0;
  let skipped = 0;

  for (const entry of ROHS_RESTRICTED) {
    const substance = await em.findOne(Substance, { casNumber: entry.cas });

    if (!substance) {
      console.log(`  Skipping ${entry.cas} (${entry.name}) - substance not in registry`);
      skipped++;
      continue;
    }

    em.create(RegulatoryListEntry, {
      list,
      substance,
      casNumberSnapshot: entry.cas,
      substanceNameSnapshot: entry.name,
      restrictionType: RestrictionType.THRESHOLD,
      thresholdPct: entry.threshold,
      legalReference: entry.reference,
      notes: 'Evaluated at homogeneous material level',
    });

    added++;
  }

  await em.flush();
  console.log(`  Added ${added} entries, skipped ${skipped}`);
}
```

**Step 2: Commit**

```bash
git add packages/database/src/seeders/regulatory/rohs-restricted.seeder.ts
git commit -m "feat(database): add RoHS restricted substances seeder"
```

---

## Task 3: Create CosIng Annex II Sample Seeder

**Files:**
- Create: `packages/database/src/seeders/regulatory/cosing-annex-ii.seeder.ts`

**Step 1: Create the seeder**

```typescript
// packages/database/src/seeders/regulatory/cosing-annex-ii.seeder.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { RegulatoryList } from '../../entities/RegulatoryList.js';
import { RegulatoryListEntry } from '../../entities/RegulatoryListEntry.js';
import { Substance } from '../../entities/Substance.js';
import { RestrictionType } from '../../entities/enums/index.js';

/**
 * Sample CosIng Annex II entries (Prohibited Substances in Cosmetics).
 * Real list has 1600+ entries - this is a representative sample.
 * Source: https://ec.europa.eu/growth/tools-databases/cosing/
 */
const COSING_ANNEX_II_ENTRIES = [
  // Preservatives (banned)
  { cas: '50-00-0', name: 'Formaldehyde', reference: 'Entry 1577' },
  { cas: '123-31-9', name: 'Hydroquinone', reference: 'Entry 383' },

  // Heavy metals
  { cas: '7439-92-1', name: 'Lead compounds', reference: 'Entry 289' },
  { cas: '7439-97-6', name: 'Mercury compounds', reference: 'Entry 221' },

  // Carcinogens
  { cas: '71-43-2', name: 'Benzene', reference: 'Entry 68' },
  { cas: '75-56-9', name: 'Propylene oxide', reference: 'Entry 544' },
  { cas: '106-89-8', name: 'Epichlorohydrin', reference: 'Entry 190' },

  // Other prohibited
  { cas: '100-97-0', name: 'Methenamine', reference: 'Entry 413' },
  { cas: '94-13-3', name: 'Propylparaben (certain uses)', reference: 'Entry 538' },
];

export async function seedCosingAnnexII(em: EntityManager): Promise<void> {
  console.log('Seeding CosIng Annex II (Prohibited Substances)...');

  // Check if already seeded
  const existing = await em.findOne(RegulatoryList, { code: 'COSING_ANNEX_II' });
  if (existing) {
    console.log('  COSING_ANNEX_II already exists, skipping');
    return;
  }

  // Create the list
  const list = em.create(RegulatoryList, {
    code: 'COSING_ANNEX_II',
    name: 'CosIng Annex II - Prohibited Substances in Cosmetics',
    source: 'EU_COSING',
    version: '2024-06',
    effectiveDate: new Date('2024-06-01'),
    sourceUrl: 'https://ec.europa.eu/growth/tools-databases/cosing/reference/annexes/2',
    description: 'Substances prohibited in cosmetic products under Regulation (EC) No 1223/2009',
  });

  await em.persistAndFlush(list);

  // Create entries (all PROHIBITED - no threshold)
  let added = 0;
  let skipped = 0;

  for (const entry of COSING_ANNEX_II_ENTRIES) {
    const substance = await em.findOne(Substance, { casNumber: entry.cas });

    if (!substance) {
      console.log(`  Skipping ${entry.cas} (${entry.name}) - substance not in registry`);
      skipped++;
      continue;
    }

    em.create(RegulatoryListEntry, {
      list,
      substance,
      casNumberSnapshot: entry.cas,
      substanceNameSnapshot: entry.name,
      restrictionType: RestrictionType.PROHIBITED,
      legalReference: entry.reference,
      notes: 'Prohibited in cosmetic products',
    });

    added++;
  }

  await em.flush();
  console.log(`  Added ${added} entries, skipped ${skipped}`);
}
```

**Step 2: Commit**

```bash
git add packages/database/src/seeders/regulatory/cosing-annex-ii.seeder.ts
git commit -m "feat(database): add CosIng Annex II sample seeder"
```

---

## Task 4: Create Category-List Mappings Seeder

**Files:**
- Create: `packages/database/src/seeders/regulatory/category-list-mappings.seeder.ts`

**Step 1: Create the seeder**

```typescript
// packages/database/src/seeders/regulatory/category-list-mappings.seeder.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Category } from '../../entities/Category.js';
import { RegulatoryList } from '../../entities/RegulatoryList.js';
import { CategoryRegulatoryList } from '../../entities/CategoryRegulatoryList.js';
import { ListRequirement } from '../../entities/enums/index.js';

/**
 * Default category-to-list mappings.
 * These define which regulations apply to which product categories.
 */
const CATEGORY_LIST_MAPPINGS = [
  // REACH applies to ALL products (root level)
  { categoryPath: 'products', listCode: 'REACH_SVHC', requirement: ListRequirement.RESTRICTION },

  // RoHS applies to electronics
  { categoryPath: 'products.electronics', listCode: 'ROHS_RESTRICTED', requirement: ListRequirement.RESTRICTION },

  // CosIng applies to cosmetics
  { categoryPath: 'products.cosmetics', listCode: 'COSING_ANNEX_II', requirement: ListRequirement.PROHIBITION },
];

export async function seedCategoryListMappings(em: EntityManager): Promise<void> {
  console.log('Seeding Category-List Mappings...');

  let added = 0;
  let skipped = 0;

  for (const mapping of CATEGORY_LIST_MAPPINGS) {
    // Find category
    const category = await em.findOne(Category, { path: mapping.categoryPath });
    if (!category) {
      console.log(`  Skipping ${mapping.categoryPath} -> ${mapping.listCode} - category not found`);
      skipped++;
      continue;
    }

    // Find list
    const list = await em.findOne(RegulatoryList, { code: mapping.listCode, isCurrentVersion: true });
    if (!list) {
      console.log(`  Skipping ${mapping.categoryPath} -> ${mapping.listCode} - list not found`);
      skipped++;
      continue;
    }

    // Check if mapping exists
    const existing = await em.findOne(CategoryRegulatoryList, {
      category,
      regulatoryList: list,
    });

    if (existing) {
      console.log(`  Mapping ${mapping.categoryPath} -> ${mapping.listCode} already exists`);
      skipped++;
      continue;
    }

    // Create mapping
    em.create(CategoryRegulatoryList, {
      category,
      regulatoryList: list,
      requirement: mapping.requirement,
    });

    console.log(`  Added: ${mapping.categoryPath} -> ${mapping.listCode} (${mapping.requirement})`);
    added++;
  }

  await em.flush();
  console.log(`  Added ${added} mappings, skipped ${skipped}`);
}
```

**Step 2: Commit**

```bash
git add packages/database/src/seeders/regulatory/category-list-mappings.seeder.ts
git commit -m "feat(database): add category-list mappings seeder"
```

---

## Task 5: Create Main Regulatory Seeder Entry Point

**Files:**
- Create: `packages/database/src/seeders/regulatory/index.ts`
- Modify: `packages/database/src/seeders/index.ts`

**Step 1: Create the index file**

```typescript
// packages/database/src/seeders/regulatory/index.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { seedReachSvhc } from './reach-svhc.seeder.js';
import { seedRohsRestricted } from './rohs-restricted.seeder.js';
import { seedCosingAnnexII } from './cosing-annex-ii.seeder.js';
import { seedCategoryListMappings } from './category-list-mappings.seeder.js';

/**
 * Seed all regulatory lists and mappings.
 * Order matters: lists before mappings.
 */
export async function seedRegulatoryData(em: EntityManager): Promise<void> {
  console.log('\n=== Seeding Regulatory Data ===\n');

  // Seed lists first
  await seedReachSvhc(em);
  await seedRohsRestricted(em);
  await seedCosingAnnexII(em);

  // Then seed mappings (requires both categories and lists)
  await seedCategoryListMappings(em);

  console.log('\n=== Regulatory Data Seeding Complete ===\n');
}

// Re-export individual seeders for selective use
export { seedReachSvhc } from './reach-svhc.seeder.js';
export { seedRohsRestricted } from './rohs-restricted.seeder.js';
export { seedCosingAnnexII } from './cosing-annex-ii.seeder.js';
export { seedCategoryListMappings } from './category-list-mappings.seeder.js';
```

**Step 2: Update main seeders index**

```typescript
// packages/database/src/seeders/index.ts
// Add to existing exports:
export * from './regulatory/index.js';
```

**Step 3: Commit**

```bash
git add packages/database/src/seeders/regulatory/index.ts packages/database/src/seeders/index.ts
git commit -m "feat(database): add main regulatory seeder entry point"
```

---

## Task 6: Add Seeder CLI Command

**Files:**
- Modify: `packages/database/src/cli/seed.ts` (or create if doesn't exist)

**Step 1: Update CLI to include regulatory seeder**

```typescript
// packages/database/src/cli/seed.ts
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config.js';
import { seedRegulatoryData } from '../seeders/regulatory/index.js';

async function run() {
  const orm = await MikroORM.init(config);
  const em = orm.em.fork();

  try {
    const command = process.argv[2];

    switch (command) {
      case 'regulatory':
        await seedRegulatoryData(em);
        break;
      case 'all':
        // Add other seeders here
        await seedRegulatoryData(em);
        break;
      default:
        console.log('Usage: pnpm seed <regulatory|all>');
        process.exit(1);
    }

    console.log('Seeding complete!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await orm.close();
  }
}

run();
```

**Step 2: Add npm script**

```json
// packages/database/package.json
{
  "scripts": {
    "seed": "tsx src/cli/seed.ts",
    "seed:regulatory": "tsx src/cli/seed.ts regulatory"
  }
}
```

**Step 3: Test the seeder**

```bash
cd packages/database && pnpm seed:regulatory
```

Expected: Seeding output showing lists and entries created

**Step 4: Commit**

```bash
git add packages/database/src/cli/seed.ts packages/database/package.json
git commit -m "feat(database): add regulatory seeder CLI command"
```

---

## Summary

**Plan 15 delivers:**
- REACH SVHC Candidate List seeder (11 sample substances)
- RoHS Restricted Substances seeder (10 substances)
- CosIng Annex II seeder (9 sample substances)
- Category-List mappings seeder
- Main entry point and CLI command
- Idempotent seeders (safe to run multiple times)

**Seeder Usage:**
```bash
# Seed regulatory data only
pnpm seed:regulatory

# Seed all data
pnpm seed all
```

**Note:** These are development/testing seeds with sample data. Production data should be imported via the admin import pipeline (Plan 12) using official EU source files.

---

## Complete Plan Dependency Chain

```
Plan 1: Seed Infrastructure
    ↓
Plan 4: Substance Registry ─────────────────────┐
    ↓                                           │
Plan 5: Category Service ───────────────────────┤
    ↓                                           │
Plan 10: Regulatory List Registry ──────────────┤
    ↓                                           │
Plan 11: Category-List Scoping ─────────────────┤
    ↓                                           │
Plan 12: Admin Import Pipeline                  │
    ↓                                           │
Plan 14: Vertical Rule Evaluation               │
    ↓                                           │
Plan 15: Regulatory Seeders ◄───────────────────┘
```

---

*Plan created: 2026-01-26*
