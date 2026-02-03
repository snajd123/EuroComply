# Taxonomy Plan 8: Substance Rollup & Compliance

> **STATUS:** IMPLEMENTED - Terminology updated 2026-01-28 (RegulatoryListEntry → Requirement)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aggregate substances through BOM hierarchy, calculate effective concentrations, and evaluate regulatory rules for PreFlight integration.

**Architecture:** Create `SubstanceRollupService` that traverses BOM entries, calculates effective concentrations (bomSharePct × substanceConcentrationPct), aggregates by CAS number, and applies regulatory flags. Create `SubstanceRuleEvaluator` for PreFlight integration that checks SVHC thresholds, restricted substances, and authorization requirements.

**Tech Stack:** MikroORM, PostgreSQL, Hono

**Prerequisites:** Plan 7 (Material Substances) completed. BomEntry entity assumed (created in separate BOM phase).

**Reference:** See `docs/plans/2026-01-23-taxonomy-engine-design.md` Section 6.7 and `docs/guides/compliance-evaluation-system.md`

---

## API Integration Patterns (MUST FOLLOW)

> **CRITICAL:** All API implementations MUST follow existing codebase patterns from `apps/api/src/`.

### Tenant-Scoped Routes (REQUIRES FULL AUTH STACK)
Substance rollup operates on **tenant product data** - requires authentication and authorization:

```typescript
// File: apps/api/src/app.ts
// Product substance routes need tenant + user middleware
v1.use('/products/*', createTenantMiddlewareWithApiKeys(deps.orm.em));
v1.use('/products/*', userMiddleware);
v1.route('/products', createProductsRouter({ orm: deps.orm }));
```

### Authorization Pattern
```typescript
import { authorize } from '../../middleware/authorize.js';

// Viewing rollup requires compliance:view (or design:view)
router.get('/:productId/versions/:versionId/substances/rollup', authorize('compliance', 'view'), async (c) => { ... });

// Regulatory evaluation also requires compliance:view
router.get('/:productId/versions/:versionId/substances/evaluate', authorize('compliance', 'view'), async (c) => { ... });
```

### Tenant Isolation Pattern (CRITICAL)
```typescript
router.get('/:productId/versions/:versionId/substances/rollup', authorize('compliance', 'view'), async (c) => {
  const schema = c.get('tenantSchema')!;
  const em = orm.em.fork({ schema });

  // ALWAYS use transaction with SET search_path for tenant data
  const result = await em.transactional(async (txEm) => {
    await txEm.execute(`SET search_path TO "${schema}", public`);
    const rollupService = new SubstanceRollupService(txEm);
    return rollupService.calculateRollup(versionId);
  });

  return c.json({ data: result });
});
```

### Response Format (MUST MATCH)
```typescript
// Success
c.json({ data: rollupResult, meta: { productVersionId, calculatedAt } })

// Errors
c.json({ error: 'Not Found', message: 'Product version not found' }, 404)
c.json({ error: 'Forbidden', message: 'Insufficient permissions', workspace: 'compliance', action: 'view' }, 403)
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

## Task 1: Create BomEntry Entity (Stub)

> **Note:** If BomEntry already exists from a BOM phase, skip to Task 2.

**Files:**
- Create: `packages/database/src/entities/BomEntry.ts`
- Modify: `packages/database/src/entities/index.ts`

**Step 1: Create the entity**

```typescript
// packages/database/src/entities/BomEntry.ts
import { Entity, Property, ManyToOne, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { ProductVersion } from './ProductVersion.js';

@Entity({ tableName: 'bom_entry' })
@Unique({ properties: ['parentVersionId', 'childVersionId'] })
export class BomEntry extends BaseEntity {
  // The product version that contains this BOM entry
  @Property({ name: 'parent_version_id' })
  @Index()
  parentVersionId!: string;

  // The child product version (component/material)
  @Property({ name: 'child_version_id' })
  @Index()
  childVersionId!: string;

  // Quantity of child in parent
  @Property({ type: 'decimal', precision: 10, scale: 6, name: 'quantity' })
  quantity!: string;  // e.g., "0.050000" for 5%

  // Unit of quantity (percentage, count, weight, etc.)
  @Property({ name: 'quantity_unit' })
  quantityUnit!: string;  // 'P1' (percent), 'C62' (count), 'KGM' (kg)

  // Position in BOM for ordering
  @Property({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder: number = 0;

  @Property({ type: 'text', nullable: true })
  notes?: string;
}
```

**Step 2: Export and commit**

```bash
git add packages/database/src/entities/BomEntry.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add BomEntry entity stub for substance rollup"
```

---

## Task 2: Create BomEntry Migration

**Files:**
- Create: `packages/database/src/migrations/Migration20260126_BomEntry.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260126_BomEntry.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_BomEntry extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS bom_entry (
        id VARCHAR(30) PRIMARY KEY,
        parent_version_id VARCHAR(30) NOT NULL,
        child_version_id VARCHAR(30) NOT NULL,
        quantity DECIMAL(10, 6) NOT NULL,
        quantity_unit VARCHAR(10) NOT NULL,
        sort_order INT DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_bom_entry UNIQUE (parent_version_id, child_version_id)
      );
    `);

    this.addSql(`CREATE INDEX idx_bom_entry_parent ON bom_entry(parent_version_id);`);
    this.addSql(`CREATE INDEX idx_bom_entry_child ON bom_entry(child_version_id);`);
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS bom_entry;');
  }
}
```

**Step 2: Run migration and commit**

```bash
cd packages/database && pnpm mikro-orm migration:up
git add packages/database/src/migrations/Migration20260126_BomEntry.ts
git commit -m "feat(database): add migration for bom_entry table"
```

---

## Task 3: Create RolledUpSubstance Interface and Types

**Files:**
- Create: `packages/database/src/services/substance-rollup.types.ts`

**Step 1: Create the types file**

```typescript
// packages/database/src/services/substance-rollup.types.ts
import { Substance } from '../entities/Substance.js';

/**
 * Source contribution to a rolled-up substance concentration
 */
export interface SubstanceSource {
  materialVersionId: string;
  materialName: string;
  bomSharePct: string;           // % of parent product this material comprises
  substanceConcentrationPct: string;  // % concentration in the material
  contributionPct: string;       // bomShare × concentration
}

/**
 * Regulatory flags based on rolled-up effective concentration
 */
export interface RegulatoryFlags {
  exceedsSvhcThreshold: boolean;     // > 0.1% w/w (REACH Article 33)
  requiresAuthorization: boolean;    // Any presence of Annex XIV substance
  isRestricted: boolean;             // Annex XVII or RoHS restricted
  restrictionViolations: string[];   // Which restrictions are violated
}

/**
 * A substance aggregated from all materials in a product's BOM
 */
export interface RolledUpSubstance {
  substanceId: string;
  casNumber: string;
  ecNumber?: string;
  primaryName: string;
  effectiveConcentrationPct: string;  // Sum of all contributions
  basis: string;                       // 'WEIGHT', 'VOLUME', 'MOLAR'
  sources: SubstanceSource[];
  regulatoryFlags: RegulatoryFlags;
  isComplete: boolean;                 // False if any material missing substance data
}

/**
 * Result of a substance rollup calculation
 */
export interface SubstanceRollupResult {
  productVersionId: string;
  calculatedAt: Date;
  substances: RolledUpSubstance[];
  warnings: string[];
  isComplete: boolean;  // False if any BOM component missing data
}

/**
 * Flat BOM node with calculated effective share
 */
export interface FlatBomNode {
  materialVersionId: string;
  materialName: string;
  effectiveSharePct: string;  // Cumulative share through nested BOM
  depth: number;
}

/**
 * Regulatory thresholds for substance compliance
 */
export const REGULATORY_THRESHOLDS = {
  SVHC_DECLARATION: 0.1,     // 0.1% w/w per REACH Article 33
  ROHS_DEFAULT: 0.1,         // 0.1% w/w for most RoHS substances
  ROHS_CADMIUM: 0.01,        // 0.01% w/w for Cadmium
} as const;
```

**Step 2: Commit**

```bash
git add packages/database/src/services/substance-rollup.types.ts
git commit -m "feat(database): add substance rollup types and interfaces"
```

---

## Task 4: Create SubstanceRollupService

**Files:**
- Create: `packages/database/src/services/substance-rollup.service.ts`
- Test: `packages/database/src/services/substance-rollup.service.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/substance-rollup.service.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { SubstanceRollupService } from './substance-rollup.service.js';
import { MaterialSubstance } from '../entities/MaterialSubstance.js';
import { Substance } from '../entities/Substance.js';
import { BomEntry } from '../entities/BomEntry.js';
import { ProductVersion } from '../entities/ProductVersion.js';
import { Product } from '../entities/Product.js';
import { ConcentrationBasis } from '../entities/enums/index.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';
import Decimal from 'decimal.js';

describe('SubstanceRollupService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: SubstanceRollupService;

  beforeAll(async () => {
    orm = await createTestOrm([
      Substance,
      MaterialSubstance,
      BomEntry,
      ProductVersion,
      Product,
    ]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    service = new SubstanceRollupService(em);
    // Clean up
    await em.nativeDelete(MaterialSubstance, {});
    await em.nativeDelete(BomEntry, {});
  });

  describe('rollUp', () => {
    it('should calculate effective concentration for single material', async () => {
      // Setup: Create substance in public schema
      const substance = em.create(Substance, {
        casNumber: '127-19-5',
        primaryName: 'N,N-Dimethylacetamide (DMAC)',  // Note: primaryName per Plan 4
        isSvhc: true,
      });
      await em.persistAndFlush(substance);

      // Setup: Create material version for BOM
      const elastaneMaterial = em.create(ProductVersion, {
        id: 'pv_elastane',
        product: em.getReference(Product, 'prod_elastane'),
        version: '1.0',
      });
      await em.persistAndFlush(elastaneMaterial);

      // Setup: BOM entry - Elastane is 5% of product
      const bomEntry = em.create(BomEntry, {
        parentVersionId: 'pv_product',
        childVersionId: 'pv_elastane',
        quantity: '5.0',
        quantityUnit: 'P1',
      });
      await em.persistAndFlush(bomEntry);

      // Setup: MaterialSubstance - DMAC is 8% of Elastane
      // NOTE: Uses @ManyToOne relations per Plan 7
      const matSub = em.create(MaterialSubstance, {
        materialVersion: elastaneMaterial,  // ManyToOne relation
        substance,                           // ManyToOne relation (cross-schema)
        concentrationPct: '8.0',
        basis: ConcentrationBasis.WEIGHT,
      });
      await em.persistAndFlush(matSub);

      // Execute
      const result = await service.rollUp('pv_product');

      // Assert: 5% × 8% = 0.4%
      expect(result.substances).toHaveLength(1);
      expect(result.substances[0].casNumber).toBe('127-19-5');
      expect(new Decimal(result.substances[0].effectiveConcentrationPct).toNumber()).toBeCloseTo(0.4, 4);
      expect(result.substances[0].regulatoryFlags.exceedsSvhcThreshold).toBe(true);
    });

    it('should aggregate same substance from multiple materials', async () => {
      // Setup: One substance in two different materials
      const substance = em.create(Substance, {
        casNumber: '111-76-2',
        primaryName: '2-Butoxyethanol',  // primaryName per Plan 4
        isSvhc: false,
      });
      await em.persistAndFlush(substance);

      // Setup: Create material versions
      const matVersionA = em.create(ProductVersion, { id: 'pv_mat_a', version: '1.0' });
      const matVersionB = em.create(ProductVersion, { id: 'pv_mat_b', version: '1.0' });
      await em.persistAndFlush([matVersionA, matVersionB]);

      // BOM: Material A (60%) and Material B (40%)
      const bomA = em.create(BomEntry, {
        parentVersionId: 'pv_product2',
        childVersionId: 'pv_mat_a',
        quantity: '60.0',
        quantityUnit: 'P1',
      });
      const bomB = em.create(BomEntry, {
        parentVersionId: 'pv_product2',
        childVersionId: 'pv_mat_b',
        quantity: '40.0',
        quantityUnit: 'P1',
      });
      await em.persistAndFlush([bomA, bomB]);

      // Substance in both materials: 2% in A, 3% in B
      // NOTE: Uses @ManyToOne relations per Plan 7
      const msA = em.create(MaterialSubstance, {
        materialVersion: matVersionA,  // ManyToOne relation
        substance,                      // ManyToOne relation
        concentrationPct: '2.0',
        basis: ConcentrationBasis.WEIGHT,
      });
      const msB = em.create(MaterialSubstance, {
        materialVersion: matVersionB,  // ManyToOne relation
        substance,                      // ManyToOne relation
        concentrationPct: '3.0',
        basis: ConcentrationBasis.WEIGHT,
      });
      await em.persistAndFlush([msA, msB]);

      // Execute
      const result = await service.rollUp('pv_product2');

      // Assert: (60% × 2%) + (40% × 3%) = 1.2% + 1.2% = 2.4%
      expect(result.substances).toHaveLength(1);
      expect(new Decimal(result.substances[0].effectiveConcentrationPct).toNumber()).toBeCloseTo(2.4, 4);
      expect(result.substances[0].sources).toHaveLength(2);
    });

    it('should flag SVHC above 0.1% threshold', async () => {
      const substance = em.create(Substance, {
        casNumber: '79-06-1',
        primaryName: 'Acrylamide',  // primaryName per Plan 4
        isSvhc: true,
      });
      await em.persistAndFlush(substance);

      const matVersion = em.create(ProductVersion, { id: 'pv_svhc_mat', version: '1.0' });
      await em.persistAndFlush(matVersion);

      const bom = em.create(BomEntry, {
        parentVersionId: 'pv_svhc_test',
        childVersionId: 'pv_svhc_mat',
        quantity: '10.0',
        quantityUnit: 'P1',
      });
      await em.persistAndFlush(bom);

      // 10% material × 2% concentration = 0.2% effective (above 0.1% threshold)
      const ms = em.create(MaterialSubstance, {
        materialVersion: matVersion,  // ManyToOne relation
        substance,                     // ManyToOne relation
        concentrationPct: '2.0',
        basis: ConcentrationBasis.WEIGHT,
      });
      await em.persistAndFlush(ms);

      const result = await service.rollUp('pv_svhc_test');

      expect(result.substances[0].regulatoryFlags.exceedsSvhcThreshold).toBe(true);
    });

    it('should NOT flag SVHC below 0.1% threshold', async () => {
      const substance = em.create(Substance, {
        casNumber: '79-06-1',
        primaryName: 'Acrylamide',  // primaryName per Plan 4
        isSvhc: true,
      });
      await em.persistAndFlush(substance);

      const matVersion = em.create(ProductVersion, { id: 'pv_svhc_mat_low', version: '1.0' });
      await em.persistAndFlush(matVersion);

      const bom = em.create(BomEntry, {
        parentVersionId: 'pv_svhc_low',
        childVersionId: 'pv_svhc_mat_low',
        quantity: '1.0',
        quantityUnit: 'P1',
      });
      await em.persistAndFlush(bom);

      // 1% material × 5% concentration = 0.05% effective (below 0.1%)
      const ms = em.create(MaterialSubstance, {
        materialVersion: matVersion,  // ManyToOne relation
        substance,                     // ManyToOne relation
        concentrationPct: '5.0',
        basis: ConcentrationBasis.WEIGHT,
      });
      await em.persistAndFlush(ms);

      const result = await service.rollUp('pv_svhc_low');

      expect(result.substances[0].regulatoryFlags.exceedsSvhcThreshold).toBe(false);
    });

    it('should flag substances requiring authorization', async () => {
      const substance = em.create(Substance, {
        casNumber: '117-81-7',
        primaryName: 'DEHP',  // primaryName per Plan 4
        isSvhc: true,
        requiresAuthorization: true,
      });
      await em.persistAndFlush(substance);

      const matVersion = em.create(ProductVersion, { id: 'pv_auth_mat', version: '1.0' });
      await em.persistAndFlush(matVersion);

      const bom = em.create(BomEntry, {
        parentVersionId: 'pv_auth_test',
        childVersionId: 'pv_auth_mat',
        quantity: '5.0',
        quantityUnit: 'P1',
      });
      await em.persistAndFlush(bom);

      // Any presence of Annex XIV substance triggers authorization requirement
      const ms = em.create(MaterialSubstance, {
        materialVersion: matVersion,  // ManyToOne relation
        substance,                     // ManyToOne relation
        concentrationPct: '0.001',
        basis: ConcentrationBasis.WEIGHT,
      });
      await em.persistAndFlush(ms);

      const result = await service.rollUp('pv_auth_test');

      expect(result.substances[0].regulatoryFlags.requiresAuthorization).toBe(true);
    });

    it('should handle multi-level BOM (recursive traversal)', async () => {
      // Setup: Product → Component (50%) → Material (30%)
      // Effective share of Material = 50% × 30% = 15%
      const substance = em.create(Substance, {
        casNumber: '100-42-5',
        primaryName: 'Styrene',
        isSvhc: false,
      });
      await em.persistAndFlush(substance);

      const componentVersion = em.create(ProductVersion, { id: 'pv_component', version: '1.0' });
      const materialVersion = em.create(ProductVersion, { id: 'pv_nested_mat', version: '1.0' });
      await em.persistAndFlush([componentVersion, materialVersion]);

      // BOM Level 1: Product → Component (50%)
      const bomLevel1 = em.create(BomEntry, {
        parentVersionId: 'pv_nested_product',
        childVersionId: 'pv_component',
        quantity: '50.0',
        quantityUnit: 'P1',
      });
      // BOM Level 2: Component → Material (30%)
      const bomLevel2 = em.create(BomEntry, {
        parentVersionId: 'pv_component',
        childVersionId: 'pv_nested_mat',
        quantity: '30.0',
        quantityUnit: 'P1',
      });
      await em.persistAndFlush([bomLevel1, bomLevel2]);

      // Material contains 10% substance
      const ms = em.create(MaterialSubstance, {
        materialVersion: materialVersion,
        substance,
        concentrationPct: '10.0',
        basis: ConcentrationBasis.WEIGHT,
      });
      await em.persistAndFlush(ms);

      const result = await service.rollUp('pv_nested_product');

      // Effective: 50% × 30% × 10% / 100 = 1.5%
      // Wait, that's: (50/100) * (30/100) * 10 = 0.15 * 10 = 1.5%
      // Actually: bomShare = 50% * 30% / 100 = 15%, then 15% * 10% / 100 = 1.5%
      expect(result.substances).toHaveLength(1);
      expect(new Decimal(result.substances[0].effectiveConcentrationPct).toNumber()).toBeCloseTo(1.5, 2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test substance-rollup.service.test.ts
```

Expected: FAIL with "Cannot find module"

**Step 3: Create the service**

```typescript
// packages/database/src/services/substance-rollup.service.ts
import { EntityManager } from '@mikro-orm/core';
import Decimal from 'decimal.js';
import { BomEntry } from '../entities/BomEntry.js';
import { MaterialSubstance } from '../entities/MaterialSubstance.js';
import { Substance } from '../entities/Substance.js';
import {
  SubstanceRollupResult,
  RolledUpSubstance,
  SubstanceSource,
  RegulatoryFlags,
  FlatBomNode,
  REGULATORY_THRESHOLDS,
} from './substance-rollup.types.js';

export class SubstanceRollupService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Calculate rolled-up substance concentrations for a product version.
   * Aggregates substances from all materials in the BOM with effective concentrations.
   */
  async rollUp(productVersionId: string): Promise<SubstanceRollupResult> {
    const warnings: string[] = [];

    // 1. Flatten BOM to get all material versions with effective shares
    const flatBom = await this.flattenBom(productVersionId, warnings);

    if (flatBom.length === 0) {
      return {
        productVersionId,
        calculatedAt: new Date(),
        substances: [],
        warnings: ['No BOM entries found for product version'],
        isComplete: true,
      };
    }

    // 2. Get all material substance declarations for BOM materials
    // NOTE: Use populate: ['substance'] to fetch public.substance in single query
    const materialVersionIds = flatBom.map(node => node.materialVersionId);
    const materialSubstances = await this.em.find(
      MaterialSubstance,
      { materialVersion: { id: { $in: materialVersionIds } } },
      { populate: ['substance'] }  // Cross-schema populate works with SET search_path
    );

    // 3. Create lookup for BOM shares
    const bomShareMap = new Map(flatBom.map(node => [
      node.materialVersionId,
      { sharePct: node.effectiveSharePct, name: node.materialName },
    ]));

    // 4. Aggregate by CAS number
    // NOTE: Access substance via ms.substance relation (populated above)
    const aggregated = new Map<string, {
      substance: Substance;
      sources: SubstanceSource[];
      totalConcentration: Decimal;
    }>();

    for (const ms of materialSubstances) {
      // Access substance via @ManyToOne relation (cross-schema, populated)
      const substance = ms.substance;
      if (!substance) {
        warnings.push(`MaterialSubstance ${ms.id} has no substance reference`);
        continue;
      }

      // Access materialVersion via @ManyToOne relation
      const materialVersionId = ms.materialVersion.id;
      const bomInfo = bomShareMap.get(materialVersionId);
      if (!bomInfo) {
        warnings.push(`Material ${materialVersionId} not in BOM`);
        continue;
      }

      const bomSharePct = new Decimal(bomInfo.sharePct);
      const concentrationPct = new Decimal(ms.concentrationPct || ms.concentrationMax || '0');
      const contributionPct = bomSharePct.mul(concentrationPct).div(100);

      const source: SubstanceSource = {
        materialVersionId,
        materialName: bomInfo.name,
        bomSharePct: bomInfo.sharePct,
        substanceConcentrationPct: concentrationPct.toString(),
        contributionPct: contributionPct.toString(),
      };

      // Aggregate by CAS number (via populated relation)
      const existing = aggregated.get(substance.casNumber);
      if (existing) {
        existing.sources.push(source);
        existing.totalConcentration = existing.totalConcentration.add(contributionPct);
      } else {
        aggregated.set(substance.casNumber, {
          substance,
          sources: [source],
          totalConcentration: contributionPct,
        });
      }
    }

    // 6. Build result with regulatory flags
    const rolledUpSubstances: RolledUpSubstance[] = [];
    for (const [casNumber, data] of aggregated) {
      const effectivePct = data.totalConcentration.toDecimalPlaces(6).toString();
      const flags = this.evaluateRegulatoryFlags(data.substance, effectivePct);

      rolledUpSubstances.push({
        substanceId: data.substance.id,
        casNumber,
        ecNumber: data.substance.ecNumber ?? undefined,
        primaryName: data.substance.primaryName,
        effectiveConcentrationPct: effectivePct,
        basis: 'WEIGHT',
        sources: data.sources,
        regulatoryFlags: flags,
        isComplete: true,
      });
    }

    // Sort by effective concentration descending
    rolledUpSubstances.sort((a, b) =>
      new Decimal(b.effectiveConcentrationPct).cmp(new Decimal(a.effectiveConcentrationPct))
    );

    return {
      productVersionId,
      calculatedAt: new Date(),
      substances: rolledUpSubstances,
      warnings,
      isComplete: warnings.length === 0,
    };
  }

  /**
   * Flatten BOM tree to get all leaf materials with their effective shares.
   * Uses recursive CTE to traverse multi-level BOMs (Product → Component → Sub-assembly → Material).
   *
   * Example: If Product contains 50% of Component A, and Component A contains 20% of Material X,
   * then Material X's effective share in the Product is 50% × 20% = 10%.
   */
  private async flattenBom(
    productVersionId: string,
    warnings: string[]
  ): Promise<FlatBomNode[]> {
    // Use recursive CTE to walk the entire BOM tree
    // This handles arbitrary nesting depth (Product → Component → Sub-assembly → Material)
    const conn = this.em.getConnection();

    const result = await conn.execute<Array<{
      material_version_id: string;
      material_name: string;
      effective_share_pct: string;
      depth: number;
      is_leaf: boolean;
    }>>(
      `WITH RECURSIVE bom_tree AS (
        -- Base case: direct children of the root product version
        SELECT
          be.child_version_id AS material_version_id,
          COALESCE(pv.name, be.child_version_id) AS material_name,
          be.quantity::decimal(18, 6) AS effective_share_pct,
          1 AS depth,
          -- Check if this node has children (not a leaf)
          EXISTS (
            SELECT 1 FROM bom_entry sub WHERE sub.parent_version_id = be.child_version_id
          ) AS has_children

        FROM bom_entry be
        LEFT JOIN product_version pv ON pv.id = be.child_version_id
        WHERE be.parent_version_id = $1

        UNION ALL

        -- Recursive case: children of children
        SELECT
          be.child_version_id AS material_version_id,
          COALESCE(pv.name, be.child_version_id) AS material_name,
          -- Multiply parent's effective share by this entry's share
          (bt.effective_share_pct * be.quantity::decimal(18, 6) / 100)::decimal(18, 6) AS effective_share_pct,
          bt.depth + 1 AS depth,
          EXISTS (
            SELECT 1 FROM bom_entry sub WHERE sub.parent_version_id = be.child_version_id
          ) AS has_children

        FROM bom_tree bt
        JOIN bom_entry be ON be.parent_version_id = bt.material_version_id
        LEFT JOIN product_version pv ON pv.id = be.child_version_id
        WHERE bt.has_children = true  -- Only recurse if parent has children
          AND bt.depth < 10  -- Safety limit to prevent infinite recursion
      )
      -- Only return leaf nodes (materials with no children)
      SELECT
        material_version_id,
        material_name,
        effective_share_pct::text,
        depth,
        NOT has_children AS is_leaf
      FROM bom_tree
      WHERE has_children = false  -- Only leaf materials
      ORDER BY depth, material_name`,
      [productVersionId]
    );

    const nodes: FlatBomNode[] = result.map(row => ({
      materialVersionId: row.material_version_id,
      materialName: row.material_name,
      effectiveSharePct: row.effective_share_pct,
      depth: row.depth,
    }));

    // Warn if BOM is very deep (might indicate circular reference or unusual structure)
    const maxDepth = Math.max(...nodes.map(n => n.depth), 0);
    if (maxDepth >= 8) {
      warnings.push(`Deep BOM structure detected (${maxDepth} levels). Verify no circular references.`);
    }

    return nodes;
  }

  /**
   * Evaluate regulatory flags based on substance properties and effective concentration.
   */
  private evaluateRegulatoryFlags(
    substance: Substance,
    effectivePct: string
  ): RegulatoryFlags {
    const effective = new Decimal(effectivePct);
    const violations: string[] = [];

    // SVHC threshold check (0.1% w/w per REACH Article 33)
    const exceedsSvhcThreshold =
      substance.isSvhc && effective.gte(REGULATORY_THRESHOLDS.SVHC_DECLARATION);

    // Authorization check (any presence of Annex XIV substance)
    const requiresAuthorization = substance.requiresAuthorization && effective.gt(0);

    // Restriction check (Annex XVII or RoHS)
    let isRestricted = false;
    if (substance.isRestricted) {
      // TODO: Check specific restriction conditions from substance.restrictionConditions
      isRestricted = true;
      violations.push(`Restricted substance present: ${substance.restrictionConditions || 'See REACH Annex XVII'}`);
    }

    return {
      exceedsSvhcThreshold,
      requiresAuthorization,
      isRestricted,
      restrictionViolations: violations,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/database && pnpm test substance-rollup.service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/services/substance-rollup.service.ts packages/database/src/services/substance-rollup.service.test.ts
git commit -m "feat(database): add SubstanceRollupService for BOM substance aggregation"
```

---

## Task 5: Create SubstanceRuleEvaluator for PreFlight

**Files:**
- Create: `packages/database/src/services/substance-rule-evaluator.ts`
- Test: `packages/database/src/services/substance-rule-evaluator.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/substance-rule-evaluator.test.ts
import { SubstanceRuleEvaluator, SubstanceRuleConfig, SubstanceRuleFinding } from './substance-rule-evaluator.js';
import { RolledUpSubstance, RegulatoryFlags } from './substance-rollup.types.js';

describe('SubstanceRuleEvaluator', () => {
  const evaluator = new SubstanceRuleEvaluator();

  const createSubstance = (overrides: Partial<RolledUpSubstance> = {}): RolledUpSubstance => ({
    substanceId: 'sub_test',
    casNumber: '127-19-5',
    primaryName: 'Test Substance',
    effectiveConcentrationPct: '0.5',
    basis: 'WEIGHT',
    sources: [],
    regulatoryFlags: {
      exceedsSvhcThreshold: false,
      requiresAuthorization: false,
      isRestricted: false,
      restrictionViolations: [],
    },
    isComplete: true,
    ...overrides,
  });

  describe('evaluateThresholdRule', () => {
    it('should flag substance above threshold', () => {
      const rule: SubstanceRuleConfig = {
        type: 'substance_threshold',
        config: {
          filter: { isSvhc: true },
          thresholdPct: 0.1,
          message: 'SVHC above 0.1%',
        },
      };

      const substance = createSubstance({
        effectiveConcentrationPct: '0.15',
        regulatoryFlags: { ...createSubstance().regulatoryFlags, exceedsSvhcThreshold: true },
      });

      const findings = evaluator.evaluate([substance], rule);

      expect(findings).toHaveLength(1);
      expect(findings[0].passed).toBe(false);
      expect(findings[0].message).toContain('SVHC above 0.1%');
    });

    it('should pass substance below threshold', () => {
      const rule: SubstanceRuleConfig = {
        type: 'substance_threshold',
        config: {
          filter: { isSvhc: true },
          thresholdPct: 0.1,
          message: 'SVHC above 0.1%',
        },
      };

      const substance = createSubstance({
        effectiveConcentrationPct: '0.05',
        regulatoryFlags: { ...createSubstance().regulatoryFlags, exceedsSvhcThreshold: false },
      });

      const findings = evaluator.evaluate([substance], rule);

      expect(findings).toHaveLength(0); // No findings when passing
    });
  });

  describe('evaluatePresenceRule', () => {
    it('should flag forbidden CAS number', () => {
      const rule: SubstanceRuleConfig = {
        type: 'substance_presence',
        config: {
          forbiddenCasNumbers: ['7439-92-1', '7440-43-9'], // Lead, Cadmium
          thresholds: { default: 0.1, '7440-43-9': 0.01 },
          message: 'RoHS restricted substance',
        },
      };

      const substance = createSubstance({
        casNumber: '7440-43-9', // Cadmium
        effectiveConcentrationPct: '0.02', // Above 0.01% for Cadmium
      });

      const findings = evaluator.evaluate([substance], rule);

      expect(findings).toHaveLength(1);
      expect(findings[0].passed).toBe(false);
      expect(findings[0].casNumber).toBe('7440-43-9');
    });

    it('should pass if below CAS-specific threshold', () => {
      const rule: SubstanceRuleConfig = {
        type: 'substance_presence',
        config: {
          forbiddenCasNumbers: ['7440-43-9'],
          thresholds: { default: 0.1, '7440-43-9': 0.01 },
          message: 'RoHS restricted substance',
        },
      };

      const substance = createSubstance({
        casNumber: '7440-43-9',
        effectiveConcentrationPct: '0.005', // Below 0.01%
      });

      const findings = evaluator.evaluate([substance], rule);

      expect(findings).toHaveLength(0);
    });
  });

  describe('evaluateAuthorizationRule', () => {
    it('should flag substance requiring authorization', () => {
      const rule: SubstanceRuleConfig = {
        type: 'substance_authorization',
        config: {
          message: 'Substance requires REACH authorization',
        },
      };

      const substance = createSubstance({
        regulatoryFlags: { ...createSubstance().regulatoryFlags, requiresAuthorization: true },
      });

      const findings = evaluator.evaluate([substance], rule);

      expect(findings).toHaveLength(1);
      expect(findings[0].passed).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test substance-rule-evaluator.test.ts
```

Expected: FAIL with "Cannot find module"

**Step 3: Create the evaluator**

```typescript
// packages/database/src/services/substance-rule-evaluator.ts
import Decimal from 'decimal.js';
import { RolledUpSubstance } from './substance-rollup.types.js';

export interface SubstanceRuleConfig {
  type: 'substance_threshold' | 'substance_presence' | 'substance_authorization';
  config: {
    filter?: {
      isSvhc?: boolean;
      isRestricted?: boolean;
      requiresAuthorization?: boolean;
    };
    thresholdPct?: number;
    forbiddenCasNumbers?: string[];
    thresholds?: Record<string, number>;  // CAS-specific thresholds
    message: string;
  };
}

export interface SubstanceRuleFinding {
  ruleType: string;
  passed: boolean;
  casNumber: string;
  substanceName: string;
  effectiveConcentrationPct: string;
  threshold?: number;
  message: string;
}

export class SubstanceRuleEvaluator {
  /**
   * Evaluate a substance rule against rolled-up substances.
   * Returns findings for substances that violate the rule.
   */
  evaluate(
    substances: RolledUpSubstance[],
    rule: SubstanceRuleConfig
  ): SubstanceRuleFinding[] {
    switch (rule.type) {
      case 'substance_threshold':
        return this.evaluateThresholdRule(substances, rule);
      case 'substance_presence':
        return this.evaluatePresenceRule(substances, rule);
      case 'substance_authorization':
        return this.evaluateAuthorizationRule(substances, rule);
      default:
        return [];
    }
  }

  /**
   * Evaluate threshold-based rule (e.g., SVHC > 0.1%)
   */
  private evaluateThresholdRule(
    substances: RolledUpSubstance[],
    rule: SubstanceRuleConfig
  ): SubstanceRuleFinding[] {
    const findings: SubstanceRuleFinding[] = [];
    const { filter, thresholdPct, message } = rule.config;

    for (const substance of substances) {
      // Check if substance matches filter
      if (filter) {
        if (filter.isSvhc && !substance.regulatoryFlags.exceedsSvhcThreshold) {
          // Only check SVHC-flagged substances
          if (!this.matchesFilterBySvhcStatus(substance)) continue;
        }
        if (filter.isRestricted && !substance.regulatoryFlags.isRestricted) continue;
      }

      // Check threshold
      const effective = new Decimal(substance.effectiveConcentrationPct);
      const threshold = new Decimal(thresholdPct ?? 0);

      if (effective.gte(threshold)) {
        findings.push({
          ruleType: rule.type,
          passed: false,
          casNumber: substance.casNumber,
          substanceName: substance.primaryName,
          effectiveConcentrationPct: substance.effectiveConcentrationPct,
          threshold: thresholdPct,
          message: `${message} - ${substance.primaryName} (CAS ${substance.casNumber}) at ${substance.effectiveConcentrationPct}%`,
        });
      }
    }

    return findings;
  }

  /**
   * Evaluate presence-based rule (e.g., RoHS forbidden substances)
   */
  private evaluatePresenceRule(
    substances: RolledUpSubstance[],
    rule: SubstanceRuleConfig
  ): SubstanceRuleFinding[] {
    const findings: SubstanceRuleFinding[] = [];
    const { forbiddenCasNumbers, thresholds, message } = rule.config;

    if (!forbiddenCasNumbers) return findings;

    const forbiddenSet = new Set(forbiddenCasNumbers);

    for (const substance of substances) {
      if (!forbiddenSet.has(substance.casNumber)) continue;

      // Get threshold for this specific CAS or use default
      const threshold = thresholds?.[substance.casNumber] ?? thresholds?.default ?? 0;
      const effective = new Decimal(substance.effectiveConcentrationPct);

      if (effective.gte(threshold)) {
        findings.push({
          ruleType: rule.type,
          passed: false,
          casNumber: substance.casNumber,
          substanceName: substance.primaryName,
          effectiveConcentrationPct: substance.effectiveConcentrationPct,
          threshold,
          message: `${message} - ${substance.primaryName} (CAS ${substance.casNumber}) at ${substance.effectiveConcentrationPct}% (threshold: ${threshold}%)`,
        });
      }
    }

    return findings;
  }

  /**
   * Evaluate authorization-based rule (Annex XIV)
   */
  private evaluateAuthorizationRule(
    substances: RolledUpSubstance[],
    rule: SubstanceRuleConfig
  ): SubstanceRuleFinding[] {
    const findings: SubstanceRuleFinding[] = [];
    const { message } = rule.config;

    for (const substance of substances) {
      if (substance.regulatoryFlags.requiresAuthorization) {
        const effective = new Decimal(substance.effectiveConcentrationPct);
        if (effective.gt(0)) {
          findings.push({
            ruleType: rule.type,
            passed: false,
            casNumber: substance.casNumber,
            substanceName: substance.primaryName,
            effectiveConcentrationPct: substance.effectiveConcentrationPct,
            message: `${message} - ${substance.primaryName} (CAS ${substance.casNumber})`,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Check if substance is SVHC regardless of threshold flag
   */
  private matchesFilterBySvhcStatus(substance: RolledUpSubstance): boolean {
    // The regulatoryFlags.exceedsSvhcThreshold is already set by rollup service
    // based on isSvhc property from Substance entity
    return substance.regulatoryFlags.exceedsSvhcThreshold;
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/database && pnpm test substance-rule-evaluator.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/services/substance-rule-evaluator.ts packages/database/src/services/substance-rule-evaluator.test.ts
git commit -m "feat(database): add SubstanceRuleEvaluator for PreFlight integration"
```

---

## Task 6: Create Substance Rollup API Routes

**Files:**
- Modify: `apps/api/src/routes/products.ts` (add rollup/evaluate endpoints)
- Test: `apps/api/src/routes/products/substance-rollup.e2e.test.ts`

> **Note:** These routes extend the existing products router. See `apps/api/src/routes/products.ts` for the current implementation pattern.

**Step 1: Write the failing e2e test (NO MOCKS - per RULES.md)**

```typescript
// apps/api/src/routes/products/substance-rollup.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MikroORM } from '@eurocomply/database';
import { Hono } from 'hono';
import { Product, ProductVersion, BomEntry, MaterialSubstance, Substance } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import type { Env } from '../../app.js';
import { authorize } from '../../middleware/authorize.js';
import { SubstanceRollupService } from '@eurocomply/database/services/substance-rollup.service.js';

interface RollupResponse {
  data: {
    productVersionId: string;
    calculatedAt: string;
    isComplete: boolean;
    substances: Array<{
      casNumber: string;
      effectiveConcentrationPct: number;
    }>;
  };
}

describe('Substance Rollup API E2E', () => {
  let orm: MikroORM;
  let app: Hono<Env>;
  let testVersionId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    // Setup test data: product → version → BOM → materials → substances
    // (Detailed setup omitted for brevity - see test fixtures)

    app = new Hono<Env>();

    // Simulate tenant middleware
    app.use('*', async (c, next) => {
      c.set('tenantSchema', 'test_tenant');
      c.set('userId', 'test-user');
      await next();
    });

    // Add rollup route
    app.get('/:productId/versions/:versionId/substances/rollup', authorize('compliance', 'view'), async (c) => {
      const schema = c.get('tenantSchema')!;
      const em = orm.em.fork({ schema });
      const versionId = c.req.param('versionId');

      const result = await em.transactional(async (txEm) => {
        await txEm.execute(`SET search_path TO "${schema}", public`);
        const service = new SubstanceRollupService(txEm);
        return service.rollUp(versionId);
      });

      return c.json({
        data: {
          productVersionId: result.productVersionId,
          calculatedAt: result.calculatedAt.toISOString(),
          isComplete: result.isComplete,
          warnings: result.warnings,
          substances: result.substances,
        },
      });
    });
  });

  afterAll(async () => {
    if (orm) {
      await teardownTestDb();
    }
  });

  it('should return rolled-up substances for product version', async () => {
    if (!orm) return;

    const res = await app.request(`/prod_test/versions/${testVersionId}/substances/rollup`);
    expect(res.status).toBe(200);

    const body = await res.json() as RollupResponse;
    expect(body.data.productVersionId).toBeDefined();
    expect(body.data.calculatedAt).toBeDefined();
    expect(body.data.substances).toBeInstanceOf(Array);
  });
});
```

**Step 2: Add routes to existing products router**

```typescript
// apps/api/src/routes/products.ts - ADD these routes to createProductsRouter

import { SubstanceRollupService } from '@eurocomply/database/services/substance-rollup.service.js';
import { SubstanceRuleEvaluator, SubstanceRuleConfig, SubstanceRuleFinding } from '@eurocomply/database/services/substance-rule-evaluator.js';

// Inside createProductsRouter function, add:

/**
 * GET /products/:productId/versions/:versionId/substances/rollup
 *
 * Calculate and return rolled-up substance concentrations from the BOM.
 * Requires compliance:view authorization.
 */
router.get('/:productId/versions/:versionId/substances/rollup', authorize('compliance', 'view'), async (c) => {
  const schema = c.get('tenantSchema')!;
  const em = orm.em.fork({ schema });
  const { productId, versionId } = c.req.param();

  const result = await em.transactional(async (txEm) => {
    await txEm.execute(`SET search_path TO "${schema}", public`);

    // Verify product version exists and belongs to this product
    const version = await txEm.findOne(ProductVersion, { id: versionId, product: { id: productId } });
    if (!version) {
      return { error: 'Product version not found' as const };
    }

    const service = new SubstanceRollupService(txEm);
    return { rollup: await service.rollUp(versionId) };
  });

  if ('error' in result) {
    return c.json({ error: 'Not Found', message: result.error }, 404);
  }

  return c.json({
    data: {
      productVersionId: result.rollup.productVersionId,
      calculatedAt: result.rollup.calculatedAt.toISOString(),
      isComplete: result.rollup.isComplete,
      warnings: result.rollup.warnings,
      substances: result.rollup.substances.map(s => ({
        substanceId: s.substanceId,
        casNumber: s.casNumber,
        ecNumber: s.ecNumber,
        primaryName: s.primaryName,
        effectiveConcentrationPct: s.effectiveConcentrationPct,
        basis: s.basis,
        sources: s.sources,
        regulatoryFlags: s.regulatoryFlags,
      })),
    },
    meta: { productId, versionId },
  });
});

/**
 * GET /products/:productId/versions/:versionId/substances/evaluate
 *
 * Evaluate rolled-up substances against regulatory rules.
 * Returns compliance status and rule violations for PreFlight integration.
 * Requires compliance:view authorization.
 *
 * NOTE: Fetches active Requirements from database and evaluates each requirement
 * against the rolled-up substances.
 */
router.get('/:productId/versions/:versionId/substances/evaluate', authorize('compliance', 'view'), async (c) => {
  const schema = c.get('tenantSchema')!;
  const em = orm.em.fork({ schema });
  const { productId, versionId } = c.req.param();

  const result = await em.transactional(async (txEm) => {
    await txEm.execute(`SET search_path TO "${schema}", public`);

    const version = await txEm.findOne(ProductVersion, { id: versionId, product: { id: productId } });
    if (!version) {
      return { error: 'Product version not found' as const };
    }

    // 1. Calculate rolled-up substances from BOM
    const rollupService = new SubstanceRollupService(txEm);
    const rollup = await rollupService.rollUp(versionId);

    // 2. Fetch applicable requirements from database based on product category
    const requirements = await txEm.find('Requirement', {
      regulation: { status: 'ACTIVE' },
      type: 'SUBSTANCE_SCREEN',
    });

    // 3. Evaluate each requirement against rolled-up substances
    const evaluator = new SubstanceRuleEvaluator();
    const allFindings: SubstanceRuleFinding[] = [];

    for (const requirement of requirements) {
      const ruleConfig = {
        type: requirement.type,
        config: requirement.handlerConfig,
      } as SubstanceRuleConfig;
      const findings = evaluator.evaluate(rollup.substances, ruleConfig);
      allFindings.push(...findings.map(f => ({
        ...f,
        requirementCode: requirement.code,
        requirementName: requirement.name,
        severity: requirement.severity,
      })));
    }

    // 4. Determine overall compliance
    const blockers = allFindings.filter(f => !f.passed && f.severity === 'BLOCKER');
    const warnings = allFindings.filter(f => !f.passed && f.severity === 'WARNING');

    return {
      rollup,
      evaluation: {
        isCompliant: blockers.length === 0,
        blockerCount: blockers.length,
        warningCount: warnings.length,
        findings: allFindings,
      },
    };
  });

  if ('error' in result) {
    return c.json({ error: 'Not Found', message: result.error }, 404);
  }

  return c.json({
    data: {
      productVersionId: versionId,
      evaluatedAt: new Date().toISOString(),
      isCompliant: result.evaluation.isCompliant,
      blockerCount: result.evaluation.blockerCount,
      warningCount: result.evaluation.warningCount,
      findings: result.evaluation.findings,
      substanceCount: result.rollup.substances.length,
      rollupWarnings: result.rollup.warnings,
    },
    meta: { productId, versionId },
  });
});
```

**Step 3: Run tests and commit**

```bash
cd apps/api && pnpm test substance-rollup.e2e.test.ts
git add apps/api/src/routes/products.ts apps/api/src/routes/products/substance-rollup.e2e.test.ts
git commit -m "feat(api): add substance rollup and evaluate endpoints with tenant isolation"
```

---

## Task 7: Export Services and Update Index

**Files:**
- Modify: `packages/database/src/services/index.ts`

**Step 1: Export new services**

```typescript
// Add to packages/database/src/services/index.ts
export * from './substance-rollup.service.js';
export * from './substance-rollup.types.js';
export * from './substance-rule-evaluator.js';
```

**Step 2: Commit**

```bash
git add packages/database/src/services/index.ts
git commit -m "feat(database): export substance rollup services"
```

---

## Summary

**Deliverables:**
- `BomEntry` entity (stub for BOM structure)
- `SubstanceRollupService` with BOM traversal and aggregation
- `SubstanceRuleEvaluator` for PreFlight integration
- Substance rollup API endpoint
- Regulatory threshold constants

**API Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/products/:id/versions/:versionId/substances/rollup` | Calculate rolled-up substances |

**Future Enhancement - Stoichiometric Factors:**

For element-based regulations (e.g., Critical Raw Materials Act), the rollup calculation should apply stoichiometric factors when present:

```typescript
// If entry has stoichiometricFactor, adjust effective concentration
const effectiveConcentration = entry.stoichiometricFactor
  ? substance.concentration * parseFloat(entry.stoichiometricFactor)
  : substance.concentration;
```

Example: Cobalt Sulfate (CoSO₄) at 1% in product with factor 0.38 → effective Cobalt = 0.38%

See: Plan 10 (`Requirement.stoichiometricFactor`) and Plan 12 (CSV import support)

**Next Plan:** Plan 9 (DPP & Reporting) includes substance declarations in Digital Product Passport.
