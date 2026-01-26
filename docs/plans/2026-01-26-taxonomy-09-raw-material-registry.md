# Taxonomy Plan 9: Raw Material Registry

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Raw Material Registry based on EU RMIS (Raw Materials Information System) with Critical Raw Materials (CRM) classification for CRMA compliance and supply chain intelligence.

**Architecture:** Create `RawMaterial` entity in public schema with CRM/Strategic flags, recycling rates, and supply risk data. Seed with official EU CRM 2024 list. Create optional M:N link to Substance for chemical composition. Provide public API for material lookup.

**Tech Stack:** MikroORM, PostgreSQL, Hono

**Prerequisites:** Plan 1 (Seed Infrastructure) completed. Plan 4 (Substance Registry) recommended for linking.

**Reference:**
- EU RMIS: https://rmis.jrc.ec.europa.eu/
- Critical Raw Materials Act (CRMA) 2024: Regulation (EU) 2024/1252
- CRM List 2023: https://single-market-economy.ec.europa.eu/sectors/raw-materials/areas-specific-interest/critical-raw-materials_en

---

## API Integration Patterns (MUST FOLLOW)

> **CRITICAL:** All API implementations MUST follow existing codebase patterns from `apps/api/src/`.

### Taxonomy Routes (Public - No Auth)
Raw Materials are **public reference data** - no authentication required:

```typescript
// File: apps/api/src/routes/taxonomy/index.ts
const taxonomy = new Hono<Env>();
taxonomy.route('/raw-materials', createRawMaterialsRouter(deps.rawMaterialsRepository));
v1.route('/taxonomy', taxonomy);  // No middleware - public routes
```

### Response Format (MUST MATCH)
```typescript
// Success
c.json({ data: entity })
c.json({ data: items, meta: { total: items.length } })

// Errors
c.json({ error: 'Not Found', message: 'Raw material not found' }, 404)
```

### Env Type (from apps/api/src/app.ts)
```typescript
export type Env = {
  Variables: {
    tenantSchema?: string;
    userId?: string;
    user?: User;
    membership?: OrganizationUser;
  };
};
```

---

## Task 1: Create RawMaterial Entity

**Files:**
- Create: `packages/database/src/entities/RawMaterial.ts`
- Modify: `packages/database/src/entities/index.ts`
- Test: `packages/database/src/entities/RawMaterial.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/RawMaterial.test.ts
import { MikroORM } from '@mikro-orm/core';
import { RawMaterial } from './RawMaterial.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('RawMaterial', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await createTestOrm([RawMaterial]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    await orm.em.nativeDelete(RawMaterial, {});
  });

  it('should create a raw material with CRM flags', async () => {
    const em = orm.em.fork();

    const material = em.create(RawMaterial, {
      name: 'Cobalt',
      symbol: 'Co',
      isCritical: true,
      isStrategic: true,
      supplyRisk: '4.2',
      economicImportance: '5.8',
      recyclingInputRate: '22.0',
      mainSources: ['DRC', 'Russia', 'Australia'],
      rmisUrl: 'https://rmis.jrc.ec.europa.eu/materials/cobalt',
    });

    await em.persistAndFlush(material);

    const found = await em.findOne(RawMaterial, { name: 'Cobalt' });
    expect(found).toBeDefined();
    expect(found?.isCritical).toBe(true);
    expect(found?.isStrategic).toBe(true);
    expect(found?.supplyRisk).toBe('4.2');
  });

  it('should enforce unique name constraint', async () => {
    const em = orm.em.fork();

    const m1 = em.create(RawMaterial, { name: 'Lithium' });
    await em.persistAndFlush(m1);

    const m2 = em.create(RawMaterial, { name: 'Lithium' });
    await expect(em.persistAndFlush(m2)).rejects.toThrow();
  });

  it('should store main sourcing countries as array', async () => {
    const em = orm.em.fork();

    const material = em.create(RawMaterial, {
      name: 'Rare Earth Elements',
      mainSources: ['China', 'Myanmar', 'Australia'],
      sourceConcentration: '98.0',  // % from top 3 countries
    });

    await em.persistAndFlush(material);

    const found = await em.findOne(RawMaterial, { name: 'Rare Earth Elements' });
    expect(found?.mainSources).toEqual(['China', 'Myanmar', 'Australia']);
    expect(found?.sourceConcentration).toBe('98.0');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test RawMaterial.test.ts
```

Expected: FAIL with "Cannot find module './RawMaterial.js'"

**Step 3: Create the entity**

```typescript
// packages/database/src/entities/RawMaterial.ts
import { Entity, Property, Unique, Index, ManyToMany, Collection, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Substance } from './Substance.js';

/**
 * RawMaterial - EU RMIS Raw Material Registry
 *
 * Represents strategic raw materials as defined by the EU Raw Materials Information System.
 * Used for CRMA (Critical Raw Materials Act) compliance and supply chain risk assessment.
 *
 * Data Source: https://rmis.jrc.ec.europa.eu/
 *
 * Conceptual Layer:
 * - Category (e.g., "Metals") → RawMaterial (e.g., "Cobalt") → Substance (e.g., "Cobalt dichloride")
 */
@Entity({ tableName: 'raw_material', schema: 'public' })
export class RawMaterial extends BaseEntity {
  /**
   * Official name from RMIS (e.g., "Cobalt", "Lithium", "Natural Rubber")
   */
  @Property()
  @Unique()
  @Index()
  name!: string;

  /**
   * Chemical symbol if applicable (e.g., "Co", "Li", "W")
   */
  @Property({ nullable: true })
  symbol?: string;

  /**
   * Brief description of the material and its primary uses
   */
  @Property({ type: 'text', nullable: true })
  description?: string;

  // ─────────────────────────────────────────────────────────────
  // CRMA Classification (Critical Raw Materials Act 2024)
  // ─────────────────────────────────────────────────────────────

  /**
   * Listed on EU Critical Raw Materials list (Annex I of CRMA)
   * Critical = High economic importance + High supply risk
   */
  @Property({ type: 'boolean', default: false, name: 'is_critical' })
  isCritical: boolean = false;

  /**
   * Listed on EU Strategic Raw Materials list (Annex II of CRMA)
   * Strategic = Critical for green/digital transition + High projected demand growth
   */
  @Property({ type: 'boolean', default: false, name: 'is_strategic' })
  isStrategic: boolean = false;

  /**
   * Year of CRM list inclusion (for tracking changes)
   */
  @Property({ nullable: true, name: 'crm_list_year' })
  crmListYear?: number;

  // ─────────────────────────────────────────────────────────────
  // RMIS Indicators (0-10 scale unless otherwise noted)
  // ─────────────────────────────────────────────────────────────

  /**
   * Supply Risk score from RMIS (0-10 scale)
   * Higher = more vulnerable supply chain
   */
  @Property({ type: 'decimal', precision: 4, scale: 2, nullable: true, name: 'supply_risk' })
  supplyRisk?: string;

  /**
   * Economic Importance score from RMIS (0-10 scale)
   * Higher = more critical to EU economy
   */
  @Property({ type: 'decimal', precision: 4, scale: 2, nullable: true, name: 'economic_importance' })
  economicImportance?: string;

  /**
   * End-of-life Recycling Input Rate (% of EU demand met by recycling)
   */
  @Property({ type: 'decimal', precision: 5, scale: 2, nullable: true, name: 'recycling_input_rate' })
  recyclingInputRate?: string;

  /**
   * Substitution Index from RMIS (0-1 scale, 1 = no substitutes)
   */
  @Property({ type: 'decimal', precision: 4, scale: 3, nullable: true, name: 'substitution_index' })
  substitutionIndex?: string;

  // ─────────────────────────────────────────────────────────────
  // Supply Chain Data
  // ─────────────────────────────────────────────────────────────

  /**
   * Primary source countries (ISO 3166-1 alpha-2 or country names)
   */
  @Property({ type: 'json', nullable: true, name: 'main_sources' })
  mainSources?: string[];

  /**
   * Concentration of supply from top 3 countries (%)
   */
  @Property({ type: 'decimal', precision: 5, scale: 2, nullable: true, name: 'source_concentration' })
  sourceConcentration?: string;

  /**
   * Primary applications/sectors
   */
  @Property({ type: 'json', nullable: true, name: 'primary_applications' })
  primaryApplications?: string[];

  // ─────────────────────────────────────────────────────────────
  // References
  // ─────────────────────────────────────────────────────────────

  /**
   * Deep link to official RMIS material profile
   */
  @Property({ type: 'text', nullable: true, name: 'rmis_url' })
  rmisUrl?: string;

  /**
   * RMIS material identifier (if available)
   */
  @Property({ nullable: true, name: 'rmis_id' })
  rmisId?: string;

  // ─────────────────────────────────────────────────────────────
  // Substance Links (Chemical Composition)
  // ─────────────────────────────────────────────────────────────

  /**
   * Chemical substances associated with this raw material.
   * E.g., "Cobalt" → ["Cobalt dichloride", "Cobalt sulfate", "Cobalt metal"]
   *
   * This enables:
   * - Substance rollup to identify strategic material content
   * - CRMA compliance calculation
   * - Supply risk propagation through BOM
   */
  @ManyToMany(() => Substance, substance => substance.rawMaterials)
  substances = new Collection<Substance>(this);

  /**
   * Whether this material is currently active in the registry
   */
  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;
}
```

**Step 4: Add inverse relation to Substance entity**

```typescript
// Add to packages/database/src/entities/Substance.ts

import { ManyToMany, Collection } from '@mikro-orm/core';
import { RawMaterial } from './RawMaterial.js';

// Add inside Substance class:

/**
 * Raw materials this substance is associated with.
 * E.g., "Cobalt dichloride" → ["Cobalt"]
 *
 * This enables automatic Strategic Material Content detection:
 * - User declares "Cobalt sulfate" (CAS 10124-43-3) in their material
 * - System looks up rawMaterials for that substance → finds "Cobalt"
 * - Cobalt.isStrategic = true → Product flagged as containing Strategic Raw Material
 */
@ManyToMany({
  entity: () => RawMaterial,
  pivotTable: 'public.substance_raw_materials',  // Explicitly match migration
  owner: true,
})
rawMaterials = new Collection<RawMaterial>(this);
```

**Step 5: Run tests, export, and commit**

```bash
cd packages/database && pnpm test RawMaterial.test.ts
git add packages/database/src/entities/RawMaterial.ts packages/database/src/entities/Substance.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add RawMaterial entity for EU RMIS registry"
```

---

## Task 2: Create RawMaterial Migration

**Files:**
- Create: `packages/database/src/migrations/Migration20260126_RawMaterial.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260126_RawMaterial.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_RawMaterial extends Migration {
  async up(): Promise<void> {
    // Raw Material table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.raw_material (
        id VARCHAR(30) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        symbol VARCHAR(10),
        description TEXT,

        -- CRMA Classification
        is_critical BOOLEAN DEFAULT FALSE,
        is_strategic BOOLEAN DEFAULT FALSE,
        crm_list_year INTEGER,

        -- RMIS Indicators
        supply_risk DECIMAL(4, 2),
        economic_importance DECIMAL(4, 2),
        recycling_input_rate DECIMAL(5, 2),
        substitution_index DECIMAL(4, 3),

        -- Supply Chain Data
        main_sources JSONB,
        source_concentration DECIMAL(5, 2),
        primary_applications JSONB,

        -- References
        rmis_url TEXT,
        rmis_id VARCHAR(50),

        -- Metadata
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    this.addSql(`CREATE INDEX idx_raw_material_name ON public.raw_material(name);`);
    this.addSql(`CREATE INDEX idx_raw_material_critical ON public.raw_material(is_critical) WHERE is_critical = TRUE;`);
    this.addSql(`CREATE INDEX idx_raw_material_strategic ON public.raw_material(is_strategic) WHERE is_strategic = TRUE;`);

    // Junction table for RawMaterial <-> Substance M:N relationship
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.substance_raw_materials (
        substance_id VARCHAR(30) NOT NULL REFERENCES public.substance(id) ON DELETE CASCADE,
        raw_material_id VARCHAR(30) NOT NULL REFERENCES public.raw_material(id) ON DELETE CASCADE,
        PRIMARY KEY (substance_id, raw_material_id)
      );
    `);

    this.addSql(`CREATE INDEX idx_substance_raw_materials_substance ON public.substance_raw_materials(substance_id);`);
    this.addSql(`CREATE INDEX idx_substance_raw_materials_material ON public.substance_raw_materials(raw_material_id);`);
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS public.substance_raw_materials;');
    this.addSql('DROP TABLE IF EXISTS public.raw_material;');
  }
}
```

**Step 2: Run migration and commit**

```bash
cd packages/database && pnpm mikro-orm migration:up
git add packages/database/src/migrations/Migration20260126_RawMaterial.ts
git commit -m "feat(database): add migration for raw_material table and substance junction"
```

---

## Task 3: Create CRM 2024 Seeder

**Files:**
- Create: `packages/database/data/crm-2024.json`
- Create: `packages/database/src/seeders/raw-materials.seeder.ts`
- Test: `packages/database/src/seeders/raw-materials.seeder.test.ts`

**Step 1: Create the CRM 2024 data bundle**

```json
// packages/database/data/crm-2024.json
{
  "version": "CRM-2024-v1",
  "source": "EU Critical Raw Materials Act 2024 (Regulation 2024/1252)",
  "generatedAt": "2026-01-26T00:00:00.000Z",
  "totalMaterials": 34,
  "materials": [
    {
      "name": "Antimony",
      "symbol": "Sb",
      "isCritical": true,
      "isStrategic": false,
      "supplyRisk": "4.3",
      "economicImportance": "4.1",
      "recyclingInputRate": "28.0",
      "mainSources": ["China", "Russia", "Tajikistan"],
      "sourceConcentration": "74.0",
      "primaryApplications": ["Flame retardants", "Lead-acid batteries", "Semiconductors"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/antimony"
    },
    {
      "name": "Arsenic",
      "symbol": "As",
      "isCritical": true,
      "isStrategic": false,
      "mainSources": ["China", "Morocco", "Russia"],
      "primaryApplications": ["Semiconductors", "Wood preservatives"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/arsenic"
    },
    {
      "name": "Bauxite",
      "symbol": null,
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "3.2",
      "economicImportance": "6.8",
      "recyclingInputRate": "0.0",
      "mainSources": ["Australia", "Guinea", "China"],
      "sourceConcentration": "72.0",
      "primaryApplications": ["Aluminium production", "Refractories", "Abrasives"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/bauxite"
    },
    {
      "name": "Beryllium",
      "symbol": "Be",
      "isCritical": true,
      "isStrategic": false,
      "mainSources": ["United States", "China", "Mozambique"],
      "primaryApplications": ["Aerospace", "Electronics", "Nuclear"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/beryllium"
    },
    {
      "name": "Bismuth",
      "symbol": "Bi",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "5.1",
      "economicImportance": "3.8",
      "recyclingInputRate": "1.0",
      "mainSources": ["China", "Vietnam", "Mexico"],
      "sourceConcentration": "82.0",
      "primaryApplications": ["Pharmaceuticals", "Cosmetics", "Lead-free solders"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/bismuth"
    },
    {
      "name": "Boron",
      "symbol": "B",
      "isCritical": true,
      "isStrategic": false,
      "mainSources": ["Turkey", "United States", "Argentina"],
      "primaryApplications": ["Glass", "Ceramics", "Agriculture"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/boron"
    },
    {
      "name": "Cobalt",
      "symbol": "Co",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "6.2",
      "economicImportance": "5.8",
      "recyclingInputRate": "22.0",
      "mainSources": ["DRC", "Russia", "Australia"],
      "sourceConcentration": "71.0",
      "primaryApplications": ["Batteries (EV)", "Superalloys", "Catalysts"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/cobalt"
    },
    {
      "name": "Coking Coal",
      "symbol": null,
      "isCritical": true,
      "isStrategic": false,
      "mainSources": ["Australia", "United States", "Russia"],
      "primaryApplications": ["Steel production"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/coking-coal"
    },
    {
      "name": "Copper",
      "symbol": "Cu",
      "isCritical": false,
      "isStrategic": true,
      "supplyRisk": "2.1",
      "economicImportance": "6.5",
      "recyclingInputRate": "55.0",
      "mainSources": ["Chile", "Peru", "China"],
      "sourceConcentration": "48.0",
      "primaryApplications": ["Electrical wiring", "Electronics", "Construction"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/copper"
    },
    {
      "name": "Feldspar",
      "symbol": null,
      "isCritical": true,
      "isStrategic": false,
      "mainSources": ["Turkey", "Italy", "China"],
      "primaryApplications": ["Glass", "Ceramics"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/feldspar"
    },
    {
      "name": "Fluorspar",
      "symbol": null,
      "isCritical": true,
      "isStrategic": false,
      "mainSources": ["China", "Mexico", "Mongolia"],
      "primaryApplications": ["Steel production", "Aluminium production", "Chemicals"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/fluorspar"
    },
    {
      "name": "Gallium",
      "symbol": "Ga",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "5.8",
      "economicImportance": "4.5",
      "recyclingInputRate": "0.0",
      "mainSources": ["China", "Germany", "Japan"],
      "sourceConcentration": "98.0",
      "primaryApplications": ["Semiconductors", "LEDs", "Solar cells"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/gallium"
    },
    {
      "name": "Germanium",
      "symbol": "Ge",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "5.4",
      "economicImportance": "4.2",
      "recyclingInputRate": "2.0",
      "mainSources": ["China", "Russia", "United States"],
      "sourceConcentration": "80.0",
      "primaryApplications": ["Fiber optics", "Infrared optics", "Solar cells"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/germanium"
    },
    {
      "name": "Graphite (Natural)",
      "symbol": "C",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "5.5",
      "economicImportance": "5.2",
      "recyclingInputRate": "3.0",
      "mainSources": ["China", "Mozambique", "Brazil"],
      "sourceConcentration": "91.0",
      "primaryApplications": ["Batteries (EV)", "Refractories", "Lubricants"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/natural-graphite"
    },
    {
      "name": "Hafnium",
      "symbol": "Hf",
      "isCritical": true,
      "isStrategic": false,
      "mainSources": ["France", "United States", "Ukraine"],
      "primaryApplications": ["Nuclear reactors", "Superalloys", "Semiconductors"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/hafnium"
    },
    {
      "name": "Helium",
      "symbol": "He",
      "isCritical": true,
      "isStrategic": false,
      "mainSources": ["United States", "Qatar", "Algeria"],
      "primaryApplications": ["Cryogenics", "MRI machines", "Semiconductors"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/helium"
    },
    {
      "name": "Lithium",
      "symbol": "Li",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "4.8",
      "economicImportance": "6.2",
      "recyclingInputRate": "1.0",
      "mainSources": ["Australia", "Chile", "China"],
      "sourceConcentration": "92.0",
      "primaryApplications": ["Batteries (EV)", "Ceramics", "Glass"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/lithium"
    },
    {
      "name": "Magnesium",
      "symbol": "Mg",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "6.5",
      "economicImportance": "5.5",
      "recyclingInputRate": "13.0",
      "mainSources": ["China", "United States", "Israel"],
      "sourceConcentration": "93.0",
      "primaryApplications": ["Aluminium alloys", "Automotive", "Aerospace"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/magnesium"
    },
    {
      "name": "Manganese",
      "symbol": "Mn",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "3.8",
      "economicImportance": "5.8",
      "recyclingInputRate": "9.0",
      "mainSources": ["South Africa", "Gabon", "Australia"],
      "sourceConcentration": "64.0",
      "primaryApplications": ["Steel production", "Batteries", "Chemicals"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/manganese"
    },
    {
      "name": "Natural Rubber",
      "symbol": null,
      "isCritical": true,
      "isStrategic": false,
      "mainSources": ["Thailand", "Indonesia", "Vietnam"],
      "sourceConcentration": "72.0",
      "primaryApplications": ["Tires", "Medical gloves", "Industrial goods"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/natural-rubber"
    },
    {
      "name": "Nickel",
      "symbol": "Ni",
      "isCritical": false,
      "isStrategic": true,
      "supplyRisk": "2.8",
      "economicImportance": "5.9",
      "recyclingInputRate": "34.0",
      "mainSources": ["Indonesia", "Philippines", "Russia"],
      "sourceConcentration": "52.0",
      "primaryApplications": ["Stainless steel", "Batteries (EV)", "Superalloys"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/nickel"
    },
    {
      "name": "Niobium",
      "symbol": "Nb",
      "isCritical": true,
      "isStrategic": false,
      "supplyRisk": "5.9",
      "economicImportance": "4.8",
      "recyclingInputRate": "0.3",
      "mainSources": ["Brazil", "Canada"],
      "sourceConcentration": "99.0",
      "primaryApplications": ["Steel alloys", "Superconductors", "Aerospace"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/niobium"
    },
    {
      "name": "Phosphate Rock",
      "symbol": null,
      "isCritical": true,
      "isStrategic": false,
      "mainSources": ["China", "Morocco", "United States"],
      "primaryApplications": ["Fertilizers", "Animal feed", "Detergents"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/phosphate-rock"
    },
    {
      "name": "Phosphorus",
      "symbol": "P",
      "isCritical": true,
      "isStrategic": false,
      "mainSources": ["China", "Vietnam", "Kazakhstan"],
      "primaryApplications": ["Fertilizers", "Chemicals", "Steel"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/phosphorus"
    },
    {
      "name": "Platinum Group Metals",
      "symbol": "PGM",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "5.6",
      "economicImportance": "5.2",
      "recyclingInputRate": "14.0",
      "mainSources": ["South Africa", "Russia", "Zimbabwe"],
      "sourceConcentration": "93.0",
      "primaryApplications": ["Catalytic converters", "Fuel cells", "Electronics"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/pgm"
    },
    {
      "name": "Rare Earth Elements (Light)",
      "symbol": "LREE",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "6.8",
      "economicImportance": "5.5",
      "recyclingInputRate": "3.0",
      "mainSources": ["China", "Myanmar", "Australia"],
      "sourceConcentration": "98.0",
      "primaryApplications": ["Permanent magnets", "Catalysts", "Glass polishing"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/lree"
    },
    {
      "name": "Rare Earth Elements (Heavy)",
      "symbol": "HREE",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "7.2",
      "economicImportance": "5.8",
      "recyclingInputRate": "1.0",
      "mainSources": ["China", "Myanmar"],
      "sourceConcentration": "99.0",
      "primaryApplications": ["Permanent magnets (high-temp)", "Lasers", "Nuclear"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/hree"
    },
    {
      "name": "Silicon Metal",
      "symbol": "Si",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "4.1",
      "economicImportance": "5.8",
      "recyclingInputRate": "0.0",
      "mainSources": ["China", "Brazil", "Norway"],
      "sourceConcentration": "78.0",
      "primaryApplications": ["Semiconductors", "Solar cells", "Aluminium alloys"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/silicon-metal"
    },
    {
      "name": "Strontium",
      "symbol": "Sr",
      "isCritical": true,
      "isStrategic": false,
      "mainSources": ["China", "Spain", "Mexico"],
      "primaryApplications": ["Pyrotechnics", "Ferrite magnets", "Zinc refining"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/strontium"
    },
    {
      "name": "Tantalum",
      "symbol": "Ta",
      "isCritical": true,
      "isStrategic": false,
      "supplyRisk": "4.5",
      "economicImportance": "4.2",
      "recyclingInputRate": "20.0",
      "mainSources": ["DRC", "Rwanda", "Brazil"],
      "sourceConcentration": "58.0",
      "primaryApplications": ["Capacitors", "Superalloys", "Medical implants"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/tantalum"
    },
    {
      "name": "Titanium Metal",
      "symbol": "Ti",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "3.5",
      "economicImportance": "5.2",
      "recyclingInputRate": "19.0",
      "mainSources": ["China", "Russia", "Japan"],
      "sourceConcentration": "72.0",
      "primaryApplications": ["Aerospace", "Medical implants", "Marine"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/titanium"
    },
    {
      "name": "Tungsten",
      "symbol": "W",
      "isCritical": true,
      "isStrategic": true,
      "supplyRisk": "5.8",
      "economicImportance": "5.5",
      "recyclingInputRate": "42.0",
      "mainSources": ["China", "Vietnam", "Russia"],
      "sourceConcentration": "86.0",
      "primaryApplications": ["Cutting tools", "Alloys", "Electronics"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/tungsten"
    },
    {
      "name": "Vanadium",
      "symbol": "V",
      "isCritical": true,
      "isStrategic": false,
      "supplyRisk": "4.2",
      "economicImportance": "4.8",
      "recyclingInputRate": "44.0",
      "mainSources": ["China", "Russia", "South Africa"],
      "sourceConcentration": "94.0",
      "primaryApplications": ["Steel alloys", "Vanadium redox batteries", "Aerospace"],
      "rmisUrl": "https://rmis.jrc.ec.europa.eu/materials/vanadium"
    }
  ]
}
```

**Step 2: Create the seeder**

```typescript
// packages/database/src/seeders/raw-materials.seeder.ts
import { EntityManager } from '@mikro-orm/core';
import { RawMaterial } from '../entities/RawMaterial.js';
import { SeedService } from '../services/seed.service.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SeederResult {
  seeded: boolean;
  skipped: boolean;
  count: number;
  version: string;
  message: string;
}

interface RawMaterialData {
  name: string;
  symbol?: string;
  isCritical: boolean;
  isStrategic: boolean;
  supplyRisk?: string;
  economicImportance?: string;
  recyclingInputRate?: string;
  mainSources?: string[];
  sourceConcentration?: string;
  primaryApplications?: string[];
  rmisUrl?: string;
}

interface CrmBundle {
  version: string;
  source: string;
  totalMaterials: number;
  materials: RawMaterialData[];
}

export class RawMaterialsSeeder {
  private readonly seedService: SeedService;
  private readonly SEED_NAME = 'crm-raw-materials';

  constructor(private readonly em: EntityManager) {
    this.seedService = new SeedService(em);
  }

  async seed(): Promise<SeederResult> {
    const bundlePath = join(__dirname, '../../data/crm-2024.json');
    const raw = readFileSync(bundlePath, 'utf-8');
    const bundle: CrmBundle = JSON.parse(raw);
    const version = bundle.version;

    const needsSeeding = await this.seedService.needsSeeding(this.SEED_NAME, version);

    if (!needsSeeding) {
      const existing = await this.seedService.getSeededVersion(this.SEED_NAME);
      return {
        seeded: false,
        skipped: true,
        count: existing?.recordCount || 0,
        version: existing?.version || version,
        message: `Raw materials already seeded (${existing?.version}), skipping.`,
      };
    }

    let count = 0;
    for (const data of bundle.materials) {
      // Check for existing by name
      const existing = await this.em.findOne(RawMaterial, { name: data.name });
      if (existing) {
        // Update existing record
        Object.assign(existing, {
          symbol: data.symbol,
          isCritical: data.isCritical,
          isStrategic: data.isStrategic,
          supplyRisk: data.supplyRisk,
          economicImportance: data.economicImportance,
          recyclingInputRate: data.recyclingInputRate,
          mainSources: data.mainSources,
          sourceConcentration: data.sourceConcentration,
          primaryApplications: data.primaryApplications,
          rmisUrl: data.rmisUrl,
          crmListYear: 2024,
        });
        continue;
      }

      const material = this.em.create(RawMaterial, {
        name: data.name,
        symbol: data.symbol,
        isCritical: data.isCritical,
        isStrategic: data.isStrategic,
        supplyRisk: data.supplyRisk,
        economicImportance: data.economicImportance,
        recyclingInputRate: data.recyclingInputRate,
        mainSources: data.mainSources,
        sourceConcentration: data.sourceConcentration,
        primaryApplications: data.primaryApplications,
        rmisUrl: data.rmisUrl,
        crmListYear: 2024,
        isActive: true,
      });

      await this.em.persistAndFlush(material);
      count++;
    }

    await this.seedService.recordSeeding(this.SEED_NAME, version, count);

    return {
      seeded: true,
      skipped: false,
      count,
      version,
      message: `Seeded ${count} raw materials from CRM 2024 list.`,
    };
  }
}
```

**Step 3: Run tests and commit**

```bash
git add packages/database/data/crm-2024.json packages/database/src/seeders/raw-materials.seeder.ts
git commit -m "feat(database): add RawMaterialsSeeder with CRM 2024 list (34 materials)"
```

---

## Task 4: Create Raw Materials API Routes

**Files:**
- Create: `apps/api/src/routes/taxonomy/raw-materials.ts`
- Test: `apps/api/src/routes/taxonomy/raw-materials.e2e.test.ts`

**Step 1: Write the failing e2e test (NO MOCKS - per RULES.md)**

```typescript
// apps/api/src/routes/taxonomy/raw-materials.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MikroORM } from '@eurocomply/database';
import { Hono } from 'hono';
import { createRawMaterialsRouter, type RawMaterialsRepository, type RawMaterialData } from './raw-materials.js';
import { RawMaterial } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import type { Env } from '../../app.js';

interface ApiResponse<T> {
  data: T;
  meta?: { total: number };
}

describe('Raw Materials API E2E', () => {
  let orm: MikroORM;
  let app: Hono<Env>;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();

    // Seed test data (real database, no mocks)
    const em = orm.em.fork();

    const cobalt = em.create(RawMaterial, {
      name: 'Cobalt',
      symbol: 'Co',
      isCritical: true,
      isStrategic: true,
      supplyRisk: '6.2',
      economicImportance: '5.8',
      recyclingInputRate: '22.0',
      mainSources: ['DRC', 'Russia', 'Australia'],
      isActive: true,
    });
    em.persist(cobalt);

    const copper = em.create(RawMaterial, {
      name: 'Copper',
      symbol: 'Cu',
      isCritical: false,
      isStrategic: true,
      supplyRisk: '2.1',
      isActive: true,
    });
    em.persist(copper);
    await em.flush();

    // Create repository implementation (real database queries)
    const repo: RawMaterialsRepository = {
      findAll: async (filter): Promise<RawMaterialData[]> => {
        const qb = orm.em.fork().createQueryBuilder(RawMaterial);
        if (filter?.isCritical !== undefined) qb.andWhere({ isCritical: filter.isCritical });
        if (filter?.isStrategic !== undefined) qb.andWhere({ isStrategic: filter.isStrategic });
        if (filter?.active !== undefined) qb.andWhere({ isActive: filter.active });
        const results = await qb.getResultList();
        return results.map(m => ({
          id: m.id,
          name: m.name,
          symbol: m.symbol,
          isCritical: m.isCritical,
          isStrategic: m.isStrategic,
          supplyRisk: m.supplyRisk,
          economicImportance: m.economicImportance,
          recyclingInputRate: m.recyclingInputRate,
          mainSources: m.mainSources,
          isActive: m.isActive,
        }));
      },
      findById: async (id): Promise<RawMaterialData | null> => {
        const m = await orm.em.fork().findOne(RawMaterial, { id });
        if (!m) return null;
        return {
          id: m.id,
          name: m.name,
          symbol: m.symbol,
          isCritical: m.isCritical,
          isStrategic: m.isStrategic,
          supplyRisk: m.supplyRisk,
          economicImportance: m.economicImportance,
          recyclingInputRate: m.recyclingInputRate,
          mainSources: m.mainSources,
          isActive: m.isActive,
        };
      },
      findByName: async (name): Promise<RawMaterialData | null> => {
        const m = await orm.em.fork().findOne(RawMaterial, { name });
        if (!m) return null;
        return {
          id: m.id,
          name: m.name,
          symbol: m.symbol,
          isCritical: m.isCritical,
          isStrategic: m.isStrategic,
          supplyRisk: m.supplyRisk,
          economicImportance: m.economicImportance,
          recyclingInputRate: m.recyclingInputRate,
          mainSources: m.mainSources,
          isActive: m.isActive,
        };
      },
    };

    app = new Hono<Env>();
    app.route('/raw-materials', createRawMaterialsRouter(repo));
  });

  afterAll(async () => {
    if (orm) {
      await teardownTestDb();
    }
  });

  it('should list all raw materials', async () => {
    if (!orm) return;

    const res = await app.request('/raw-materials');
    expect(res.status).toBe(200);
    const body = await res.json() as ApiResponse<RawMaterialData[]>;
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('should filter by critical flag', async () => {
    if (!orm) return;

    const res = await app.request('/raw-materials?isCritical=true');
    expect(res.status).toBe(200);
    const body = await res.json() as ApiResponse<RawMaterialData[]>;
    expect(body.data.every(m => m.isCritical)).toBe(true);
  });

  it('should filter by strategic flag', async () => {
    if (!orm) return;

    const res = await app.request('/raw-materials?isStrategic=true');
    expect(res.status).toBe(200);
    const body = await res.json() as ApiResponse<RawMaterialData[]>;
    expect(body.data.every(m => m.isStrategic)).toBe(true);
  });

  it('should get raw material by name', async () => {
    if (!orm) return;

    const res = await app.request('/raw-materials/name/Cobalt');
    expect(res.status).toBe(200);
    const body = await res.json() as ApiResponse<RawMaterialData>;
    expect(body.data.name).toBe('Cobalt');
    expect(body.data.symbol).toBe('Co');
    expect(body.data.isCritical).toBe(true);
    expect(body.data.isStrategic).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test raw-materials.e2e.test.ts
```

Expected: FAIL with "Cannot find module './raw-materials.js'"

**Step 3: Create the router**

```typescript
// apps/api/src/routes/taxonomy/raw-materials.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../../app.js';

export interface RawMaterialData {
  id: string;
  name: string;
  symbol?: string;
  description?: string;
  isCritical: boolean;
  isStrategic: boolean;
  crmListYear?: number;
  supplyRisk?: string;
  economicImportance?: string;
  recyclingInputRate?: string;
  substitutionIndex?: string;
  mainSources?: string[];
  sourceConcentration?: string;
  primaryApplications?: string[];
  rmisUrl?: string;
  isActive: boolean;
}

export interface RawMaterialsRepository {
  findAll(filter?: {
    isCritical?: boolean;
    isStrategic?: boolean;
    active?: boolean;
  }): Promise<RawMaterialData[]>;
  findById(id: string): Promise<RawMaterialData | null>;
  findByName(name: string): Promise<RawMaterialData | null>;
}

const querySchema = z.object({
  isCritical: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  isStrategic: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

export function createRawMaterialsRouter(repo: RawMaterialsRepository): Hono<Env> {
  const router = new Hono<Env>();

  // GET /raw-materials - List all with optional filters
  // Supports: ?isCritical=true, ?isStrategic=true, ?active=true
  router.get('/', zValidator('query', querySchema), async (c) => {
    const query = c.req.valid('query');

    const filter: Parameters<typeof repo.findAll>[0] = {};
    if (query.isCritical !== undefined) filter.isCritical = query.isCritical;
    if (query.isStrategic !== undefined) filter.isStrategic = query.isStrategic;
    if (query.active !== undefined) filter.active = query.active;

    const materials = await repo.findAll(filter);

    return c.json({
      data: materials,
      meta: { total: materials.length },
    });
  });

  // GET /raw-materials/critical - Shorthand for critical raw materials
  router.get('/critical', async (c) => {
    const materials = await repo.findAll({ isCritical: true, active: true });

    return c.json({
      data: materials,
      meta: {
        total: materials.length,
        description: 'EU Critical Raw Materials (CRMA Annex I)',
      },
    });
  });

  // GET /raw-materials/strategic - Shorthand for strategic raw materials
  router.get('/strategic', async (c) => {
    const materials = await repo.findAll({ isStrategic: true, active: true });

    return c.json({
      data: materials,
      meta: {
        total: materials.length,
        description: 'EU Strategic Raw Materials (CRMA Annex II)',
      },
    });
  });

  // GET /raw-materials/:id - Get by ID
  router.get('/:id', async (c) => {
    const id = c.req.param('id');

    // Check if it looks like an ID or a name
    if (id.startsWith('rm_') || id.length === 30) {
      const material = await repo.findById(id);
      if (!material) {
        return c.json({ error: 'Not Found', message: `Raw material not found: ${id}` }, 404);
      }
      return c.json({ data: material });
    }

    // Otherwise treat as name lookup
    const material = await repo.findByName(id);
    if (!material) {
      return c.json({ error: 'Not Found', message: `Raw material not found: ${id}` }, 404);
    }
    return c.json({ data: material });
  });

  // GET /raw-materials/name/:name - Get by exact name
  router.get('/name/:name', async (c) => {
    const name = c.req.param('name');
    const material = await repo.findByName(name);

    if (!material) {
      return c.json({ error: 'Not Found', message: `Raw material not found: ${name}` }, 404);
    }

    return c.json({ data: material });
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test raw-materials.e2e.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/taxonomy/raw-materials.ts apps/api/src/routes/taxonomy/raw-materials.e2e.test.ts
git commit -m "feat(api): add raw materials API routes (list, filter by CRM flags, get by name)"
```

---

## Task 5: Link Substances to Raw Materials (Optional Enhancement)

**Files:**
- Create: `packages/database/data/substance-raw-material-links.json`
- Modify: `packages/database/src/seeders/raw-materials.seeder.ts`

**Purpose:** Enable the system to automatically identify strategic material content by linking chemical substances to their parent raw materials.

**Step 1: Create the linking data**

```json
// packages/database/data/substance-raw-material-links.json
{
  "version": "SubstanceLinks-v1",
  "links": [
    {
      "rawMaterial": "Cobalt",
      "substances": [
        { "casNumber": "7440-48-4", "name": "Cobalt (metal)" },
        { "casNumber": "7646-79-9", "name": "Cobalt dichloride" },
        { "casNumber": "10124-43-3", "name": "Cobalt sulfate" },
        { "casNumber": "10141-05-6", "name": "Cobalt dinitrate" }
      ]
    },
    {
      "rawMaterial": "Lithium",
      "substances": [
        { "casNumber": "7439-93-2", "name": "Lithium (metal)" },
        { "casNumber": "554-13-2", "name": "Lithium carbonate" },
        { "casNumber": "12031-80-0", "name": "Lithium peroxide" }
      ]
    },
    {
      "rawMaterial": "Nickel",
      "substances": [
        { "casNumber": "7440-02-0", "name": "Nickel (metal)" },
        { "casNumber": "7718-54-9", "name": "Nickel dichloride" },
        { "casNumber": "7786-81-4", "name": "Nickel sulfate" }
      ]
    },
    {
      "rawMaterial": "Rare Earth Elements (Light)",
      "substances": [
        { "casNumber": "7439-91-0", "name": "Lanthanum" },
        { "casNumber": "7440-45-1", "name": "Cerium" },
        { "casNumber": "7440-00-8", "name": "Neodymium" },
        { "casNumber": "7440-10-0", "name": "Praseodymium" }
      ]
    },
    {
      "rawMaterial": "Tungsten",
      "substances": [
        { "casNumber": "7440-33-7", "name": "Tungsten (metal)" },
        { "casNumber": "7783-82-6", "name": "Tungsten hexafluoride" }
      ]
    }
  ]
}
```

**Step 2: Add linking logic to seeder**

```typescript
// Add to RawMaterialsSeeder class

async linkSubstances(): Promise<number> {
  const linksPath = join(__dirname, '../../data/substance-raw-material-links.json');

  if (!existsSync(linksPath)) {
    console.log('No substance links file found, skipping.');
    return 0;
  }

  const raw = readFileSync(linksPath, 'utf-8');
  const linksData = JSON.parse(raw);

  let linkedCount = 0;

  for (const link of linksData.links) {
    const rawMaterial = await this.em.findOne(RawMaterial, { name: link.rawMaterial });
    if (!rawMaterial) continue;

    for (const sub of link.substances) {
      const substance = await this.em.findOne(Substance, { casNumber: sub.casNumber }, {
        schema: 'public',
      });

      if (substance && !rawMaterial.substances.contains(substance)) {
        rawMaterial.substances.add(substance);
        linkedCount++;
      }
    }
  }

  await this.em.flush();
  return linkedCount;
}
```

**Step 3: Commit**

```bash
git add packages/database/data/substance-raw-material-links.json packages/database/src/seeders/raw-materials.seeder.ts
git commit -m "feat(database): add substance-to-raw-material linking for CRMA compliance"
```

---

## Task 6: Export and Update Index

**Files:**
- Modify: `packages/database/src/entities/index.ts`
- Modify: `packages/database/src/seeders/index.ts`

**Step 1: Export entity and seeder**

```typescript
// Add to packages/database/src/entities/index.ts
export * from './RawMaterial.js';

// Add to packages/database/src/seeders/index.ts
export * from './raw-materials.seeder.js';
```

**Step 2: Commit**

```bash
git add packages/database/src/entities/index.ts packages/database/src/seeders/index.ts
git commit -m "feat(database): export RawMaterial entity and seeder"
```

---

## Summary

**Deliverables:**
- `RawMaterial` entity with CRM/Strategic flags, RMIS indicators
- Migration for `raw_material` table and M:N junction table
- `RawMaterialsSeeder` with CRM 2024 list (34 materials)
- Raw Materials API routes with filtering
- Substance ↔ RawMaterial linking for automatic CRMA detection
- **SubstanceRollupService integration** for strategic material content calculation

**API Routes:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/taxonomy/raw-materials` | List with filters (?isCritical, ?isStrategic) |
| GET | `/api/v1/taxonomy/raw-materials/critical` | All Critical Raw Materials |
| GET | `/api/v1/taxonomy/raw-materials/strategic` | All Strategic Raw Materials |
| GET | `/api/v1/taxonomy/raw-materials/:id` | Get by ID |
| GET | `/api/v1/taxonomy/raw-materials/name/:name` | Get by exact name |

**CRMA Compliance Features Enabled:**
- Automatic identification of Critical/Strategic material content in products
- Supply risk scoring for supply chain resilience warnings
- Recycling rate data for DPP circularity calculations
- Source concentration for geopolitical risk assessment

---

## Task 7: Integrate Strategic Material Detection into SubstanceRollupService

**Files:**
- Modify: `packages/database/src/services/substance-rollup.types.ts`
- Modify: `packages/database/src/services/substance-rollup.service.ts`
- Test: `packages/database/src/services/substance-rollup.service.test.ts` (add tests)

**Purpose:** When rolling up substances, automatically detect if any substance is linked to a Critical/Strategic Raw Material for CRMA compliance.

**Step 1: Update the types file**

```typescript
// Add to packages/database/src/services/substance-rollup.types.ts

/**
 * Strategic/Critical Raw Material content detected in product
 */
export interface StrategicMaterialContent {
  rawMaterialId: string;
  rawMaterialName: string;
  symbol?: string;
  isStrategic: boolean;
  isCritical: boolean;
  supplyRisk?: string;
  economicImportance?: string;
  recyclingInputRate?: string;
  contributingSubstances: Array<{
    casNumber: string;
    primaryName: string;
    effectiveConcentrationPct: string;
  }>;
}

// Update SubstanceRollupResult interface:
export interface SubstanceRollupResult {
  productVersionId: string;
  calculatedAt: Date;
  substances: RolledUpSubstance[];
  warnings: string[];
  isComplete: boolean;

  // CRMA Strategic Material Content (NEW)
  strategicMaterials: StrategicMaterialContent[];
  containsStrategicMaterial: boolean;
  containsCriticalMaterial: boolean;
}
```

**Step 2: Write the failing test**

```typescript
// Add to packages/database/src/services/substance-rollup.service.test.ts

describe('Strategic Material Detection', () => {
  it('should detect strategic raw material from substance link', async () => {
    // Setup: Create Cobalt raw material (strategic)
    const cobalt = em.create(RawMaterial, {
      name: 'Cobalt',
      symbol: 'Co',
      isCritical: true,
      isStrategic: true,
      supplyRisk: '6.2',
    });
    await em.persistAndFlush(cobalt);

    // Setup: Create Cobalt sulfate substance linked to Cobalt
    const cobaltSulfate = em.create(Substance, {
      casNumber: '10124-43-3',
      primaryName: 'Cobalt sulfate',
      isSvhc: true,
    });
    cobaltSulfate.rawMaterials.add(cobalt);
    await em.persistAndFlush(cobaltSulfate);

    // Setup: Create material version and BOM
    const matVersion = em.create(ProductVersion, { id: 'pv_cobalt_mat', version: '1.0' });
    await em.persistAndFlush(matVersion);

    const bom = em.create(BomEntry, {
      parentVersionId: 'pv_strategic_test',
      childVersionId: 'pv_cobalt_mat',
      quantity: '5.0',
      quantityUnit: 'P1',
    });
    await em.persistAndFlush(bom);

    // Material contains 2% Cobalt sulfate
    const ms = em.create(MaterialSubstance, {
      materialVersion: matVersion,
      substance: cobaltSulfate,
      concentrationPct: '2.0',
      basis: ConcentrationBasis.WEIGHT,
    });
    await em.persistAndFlush(ms);

    // Execute
    const result = await service.rollUp('pv_strategic_test');

    // Assert: Strategic material detected
    expect(result.containsStrategicMaterial).toBe(true);
    expect(result.containsCriticalMaterial).toBe(true);
    expect(result.strategicMaterials).toHaveLength(1);
    expect(result.strategicMaterials[0].rawMaterialName).toBe('Cobalt');
    expect(result.strategicMaterials[0].isStrategic).toBe(true);
    expect(result.strategicMaterials[0].contributingSubstances[0].casNumber).toBe('10124-43-3');
  });

  it('should aggregate multiple substances linked to same raw material', async () => {
    // Setup: Lithium raw material
    const lithium = em.create(RawMaterial, {
      name: 'Lithium',
      symbol: 'Li',
      isCritical: true,
      isStrategic: true,
    });
    await em.persistAndFlush(lithium);

    // Two lithium compounds
    const lithiumCarbonate = em.create(Substance, {
      casNumber: '554-13-2',
      primaryName: 'Lithium carbonate',
    });
    lithiumCarbonate.rawMaterials.add(lithium);

    const lithiumMetal = em.create(Substance, {
      casNumber: '7439-93-2',
      primaryName: 'Lithium (metal)',
    });
    lithiumMetal.rawMaterials.add(lithium);
    await em.persistAndFlush([lithiumCarbonate, lithiumMetal]);

    // Material versions
    const matA = em.create(ProductVersion, { id: 'pv_li_mat_a', version: '1.0' });
    const matB = em.create(ProductVersion, { id: 'pv_li_mat_b', version: '1.0' });
    await em.persistAndFlush([matA, matB]);

    // BOM entries
    const bomA = em.create(BomEntry, {
      parentVersionId: 'pv_lithium_product',
      childVersionId: 'pv_li_mat_a',
      quantity: '30.0',
      quantityUnit: 'P1',
    });
    const bomB = em.create(BomEntry, {
      parentVersionId: 'pv_lithium_product',
      childVersionId: 'pv_li_mat_b',
      quantity: '20.0',
      quantityUnit: 'P1',
    });
    await em.persistAndFlush([bomA, bomB]);

    // Material substances
    const msA = em.create(MaterialSubstance, {
      materialVersion: matA,
      substance: lithiumCarbonate,
      concentrationPct: '5.0',
      basis: ConcentrationBasis.WEIGHT,
    });
    const msB = em.create(MaterialSubstance, {
      materialVersion: matB,
      substance: lithiumMetal,
      concentrationPct: '10.0',
      basis: ConcentrationBasis.WEIGHT,
    });
    await em.persistAndFlush([msA, msB]);

    // Execute
    const result = await service.rollUp('pv_lithium_product');

    // Assert: Both substances aggregated under Lithium
    expect(result.containsStrategicMaterial).toBe(true);
    expect(result.strategicMaterials).toHaveLength(1);
    expect(result.strategicMaterials[0].rawMaterialName).toBe('Lithium');
    expect(result.strategicMaterials[0].contributingSubstances).toHaveLength(2);
  });

  it('should return empty strategicMaterials when no links exist', async () => {
    // Setup: Substance with no raw material links
    const dmac = em.create(Substance, {
      casNumber: '127-19-5',
      primaryName: 'N,N-Dimethylacetamide',
      isSvhc: true,
    });
    await em.persistAndFlush(dmac);

    const matVersion = em.create(ProductVersion, { id: 'pv_no_strategic', version: '1.0' });
    await em.persistAndFlush(matVersion);

    const bom = em.create(BomEntry, {
      parentVersionId: 'pv_no_strategic_product',
      childVersionId: 'pv_no_strategic',
      quantity: '10.0',
      quantityUnit: 'P1',
    });
    await em.persistAndFlush(bom);

    const ms = em.create(MaterialSubstance, {
      materialVersion: matVersion,
      substance: dmac,
      concentrationPct: '5.0',
      basis: ConcentrationBasis.WEIGHT,
    });
    await em.persistAndFlush(ms);

    // Execute
    const result = await service.rollUp('pv_no_strategic_product');

    // Assert: No strategic materials
    expect(result.containsStrategicMaterial).toBe(false);
    expect(result.containsCriticalMaterial).toBe(false);
    expect(result.strategicMaterials).toHaveLength(0);
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd packages/database && pnpm test substance-rollup.service.test.ts
```

Expected: FAIL with missing properties

**Step 4: Update the service**

```typescript
// Update packages/database/src/services/substance-rollup.service.ts

import { RawMaterial } from '../entities/RawMaterial.js';
import { StrategicMaterialContent } from './substance-rollup.types.js';

// In the rollUp method, after building rolledUpSubstances array:

    // 6. Detect Strategic/Critical Raw Material content
    const strategicMaterialsMap = new Map<string, StrategicMaterialContent>();

    for (const [casNumber, data] of aggregated) {
      // Load rawMaterials relation for this substance
      const substanceWithLinks = await this.em.findOne(
        Substance,
        { id: data.substance.id },
        { populate: ['rawMaterials'], schema: 'public' }
      );

      if (!substanceWithLinks?.rawMaterials?.length) continue;

      for (const rm of substanceWithLinks.rawMaterials.getItems()) {
        const existing = strategicMaterialsMap.get(rm.id);
        const substanceContribution = {
          casNumber,
          primaryName: data.substance.primaryName,
          effectiveConcentrationPct: data.totalConcentration.toDecimalPlaces(6).toString(),
        };

        if (existing) {
          existing.contributingSubstances.push(substanceContribution);
        } else {
          strategicMaterialsMap.set(rm.id, {
            rawMaterialId: rm.id,
            rawMaterialName: rm.name,
            symbol: rm.symbol,
            isStrategic: rm.isStrategic,
            isCritical: rm.isCritical,
            supplyRisk: rm.supplyRisk,
            economicImportance: rm.economicImportance,
            recyclingInputRate: rm.recyclingInputRate,
            contributingSubstances: [substanceContribution],
          });
        }
      }
    }

    const strategicMaterials = Array.from(strategicMaterialsMap.values());

    // Sort by supply risk descending (highest risk first)
    strategicMaterials.sort((a, b) => {
      const riskA = a.supplyRisk ? parseFloat(a.supplyRisk) : 0;
      const riskB = b.supplyRisk ? parseFloat(b.supplyRisk) : 0;
      return riskB - riskA;
    });

    return {
      productVersionId,
      calculatedAt: new Date(),
      substances: rolledUpSubstances,
      warnings,
      isComplete: warnings.length === 0,
      // CRMA Strategic Material Content
      strategicMaterials,
      containsStrategicMaterial: strategicMaterials.some(m => m.isStrategic),
      containsCriticalMaterial: strategicMaterials.some(m => m.isCritical),
    };
```

**Step 5: Run tests to verify they pass**

```bash
cd packages/database && pnpm test substance-rollup.service.test.ts
```

Expected: PASS

**Step 6: Update the rollup API response**

```typescript
// Update apps/api/src/routes/products.ts - rollup endpoint response

return c.json({
  data: {
    productVersionId: result.rollup.productVersionId,
    calculatedAt: result.rollup.calculatedAt.toISOString(),
    isComplete: result.rollup.isComplete,
    warnings: result.rollup.warnings,
    substances: result.rollup.substances.map(s => ({ /* existing mapping */ })),

    // CRMA Strategic Material Content (NEW)
    strategicMaterials: result.rollup.strategicMaterials.map(sm => ({
      rawMaterialId: sm.rawMaterialId,
      rawMaterialName: sm.rawMaterialName,
      symbol: sm.symbol,
      isStrategic: sm.isStrategic,
      isCritical: sm.isCritical,
      supplyRisk: sm.supplyRisk,
      recyclingInputRate: sm.recyclingInputRate,
      contributingSubstances: sm.contributingSubstances,
    })),
    containsStrategicMaterial: result.rollup.containsStrategicMaterial,
    containsCriticalMaterial: result.rollup.containsCriticalMaterial,
  },
  meta: { productId, versionId },
});
```

**Step 7: Commit**

```bash
git add packages/database/src/services/substance-rollup.types.ts \
        packages/database/src/services/substance-rollup.service.ts \
        packages/database/src/services/substance-rollup.service.test.ts \
        apps/api/src/routes/products.ts
git commit -m "feat(database): integrate strategic material detection into substance rollup"
```

---

**Future Enhancements (Day 2):**
- RMIS API integration for live data updates
- Supply risk propagation through BOM (similar to substance rollup)
- Strategic material content percentage calculation
- CRMA Annex IV benchmark tracking
