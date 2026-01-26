# Taxonomy Plan 8: Substance Rollup & Compliance

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aggregate substances through BOM hierarchy, calculate effective concentrations, and evaluate regulatory rules for PreFlight integration.

**Architecture:** Create `SubstanceRollupService` that traverses BOM entries, calculates effective concentrations (bomSharePct × substanceConcentrationPct), aggregates by CAS number, and applies regulatory flags. Create `SubstanceRuleEvaluator` for PreFlight integration that checks SVHC thresholds, restricted substances, and authorization requirements.

**Tech Stack:** MikroORM, PostgreSQL, Hono

**Prerequisites:** Plan 7 (Material Substances) completed. BomEntry entity assumed (created in separate BOM phase).

**Reference:** See `docs/plans/2026-01-23-taxonomy-engine-design.md` Section 6.7 and `docs/plans/13-regulatory-advisor.md` Section 4.5

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
        primaryName: 'N,N-Dimethylacetamide (DMAC)',
        isSvhc: true,
      });
      await em.persistAndFlush(substance);

      // Setup: BOM entry - Elastane is 5% of product
      const bomEntry = em.create(BomEntry, {
        parentVersionId: 'pv_product',
        childVersionId: 'pv_elastane',
        quantity: '5.0',
        quantityUnit: 'P1',
      });
      await em.persistAndFlush(bomEntry);

      // Setup: MaterialSubstance - DMAC is 8% of Elastane
      const matSub = em.create(MaterialSubstance, {
        materialVersionId: 'pv_elastane',
        substanceId: substance.id,
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
        primaryName: '2-Butoxyethanol',
        isSvhc: false,
      });
      await em.persistAndFlush(substance);

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

      // Substance in both: 2% in A, 3% in B
      const msA = em.create(MaterialSubstance, {
        materialVersionId: 'pv_mat_a',
        substanceId: substance.id,
        concentrationPct: '2.0',
        basis: ConcentrationBasis.WEIGHT,
      });
      const msB = em.create(MaterialSubstance, {
        materialVersionId: 'pv_mat_b',
        substanceId: substance.id,
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
        primaryName: 'Acrylamide',
        isSvhc: true,
      });
      await em.persistAndFlush(substance);

      const bom = em.create(BomEntry, {
        parentVersionId: 'pv_svhc_test',
        childVersionId: 'pv_svhc_mat',
        quantity: '10.0',
        quantityUnit: 'P1',
      });
      await em.persistAndFlush(bom);

      // 10% material × 2% concentration = 0.2% effective (above 0.1% threshold)
      const ms = em.create(MaterialSubstance, {
        materialVersionId: 'pv_svhc_mat',
        substanceId: substance.id,
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
        primaryName: 'Acrylamide',
        isSvhc: true,
      });
      await em.persistAndFlush(substance);

      const bom = em.create(BomEntry, {
        parentVersionId: 'pv_svhc_low',
        childVersionId: 'pv_svhc_mat_low',
        quantity: '1.0',
        quantityUnit: 'P1',
      });
      await em.persistAndFlush(bom);

      // 1% material × 5% concentration = 0.05% effective (below 0.1%)
      const ms = em.create(MaterialSubstance, {
        materialVersionId: 'pv_svhc_mat_low',
        substanceId: substance.id,
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
        primaryName: 'DEHP',
        isSvhc: true,
        requiresAuthorization: true,
      });
      await em.persistAndFlush(substance);

      const bom = em.create(BomEntry, {
        parentVersionId: 'pv_auth_test',
        childVersionId: 'pv_auth_mat',
        quantity: '5.0',
        quantityUnit: 'P1',
      });
      await em.persistAndFlush(bom);

      const ms = em.create(MaterialSubstance, {
        materialVersionId: 'pv_auth_mat',
        substanceId: substance.id,
        concentrationPct: '0.001', // Any presence triggers
        basis: ConcentrationBasis.WEIGHT,
      });
      await em.persistAndFlush(ms);

      const result = await service.rollUp('pv_auth_test');

      expect(result.substances[0].regulatoryFlags.requiresAuthorization).toBe(true);
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
    const materialVersionIds = flatBom.map(node => node.materialVersionId);
    const materialSubstances = await this.em.find(MaterialSubstance, {
      materialVersionId: { $in: materialVersionIds },
    });

    // 3. Get all referenced substances from public schema
    const substanceIds = [...new Set(materialSubstances.map(ms => ms.substanceId))];
    const substances = substanceIds.length > 0
      ? await this.em.find(Substance, { id: { $in: substanceIds } }, { schema: 'public' })
      : [];
    const substanceMap = new Map(substances.map(s => [s.id, s]));

    // 4. Create lookup for BOM shares
    const bomShareMap = new Map(flatBom.map(node => [
      node.materialVersionId,
      { sharePct: node.effectiveSharePct, name: node.materialName },
    ]));

    // 5. Aggregate by CAS number
    const aggregated = new Map<string, {
      substance: Substance;
      sources: SubstanceSource[];
      totalConcentration: Decimal;
    }>();

    for (const ms of materialSubstances) {
      const substance = substanceMap.get(ms.substanceId);
      if (!substance) {
        warnings.push(`Substance ${ms.substanceId} not found in registry`);
        continue;
      }

      const bomInfo = bomShareMap.get(ms.materialVersionId);
      if (!bomInfo) {
        warnings.push(`Material ${ms.materialVersionId} not in BOM`);
        continue;
      }

      const bomSharePct = new Decimal(bomInfo.sharePct);
      const concentrationPct = new Decimal(ms.concentrationPct || ms.concentrationMax || '0');
      const contributionPct = bomSharePct.mul(concentrationPct).div(100);

      const source: SubstanceSource = {
        materialVersionId: ms.materialVersionId,
        materialName: bomInfo.name,
        bomSharePct: bomInfo.sharePct,
        substanceConcentrationPct: concentrationPct.toString(),
        contributionPct: contributionPct.toString(),
      };

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
   * Currently supports single-level BOM; nested BOM requires recursive traversal.
   */
  private async flattenBom(
    productVersionId: string,
    warnings: string[]
  ): Promise<FlatBomNode[]> {
    // Get direct BOM entries
    const bomEntries = await this.em.find(BomEntry, {
      parentVersionId: productVersionId,
    });

    const nodes: FlatBomNode[] = [];
    for (const entry of bomEntries) {
      // For now, assume quantity in P1 (percent) unit
      // TODO: Support nested BOM with recursive traversal
      nodes.push({
        materialVersionId: entry.childVersionId,
        materialName: entry.childVersionId, // TODO: Resolve actual name from ProductVersion
        effectiveSharePct: entry.quantity,
        depth: 1,
      });
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
- Create: `apps/api/src/routes/products/substance-rollup.ts`
- Test: `apps/api/src/routes/products/substance-rollup.e2e.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/api/src/routes/products/substance-rollup.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testClient, setupTestApp, cleanupTestApp } from '../../test-utils/index.js';

describe('GET /api/v1/products/:id/versions/:versionId/substances/rollup', () => {
  beforeAll(async () => {
    await setupTestApp();
  });

  afterAll(async () => {
    await cleanupTestApp();
  });

  it('should return 401 without auth', async () => {
    const res = await testClient.products.$get(
      '/prod_123/versions/pv_123/substances/rollup'
    );
    expect(res.status).toBe(401);
  });

  it('should return rolled-up substances for product version', async () => {
    // This test requires setup fixtures for:
    // - Product with version
    // - BOM entries linking to materials
    // - MaterialSubstance declarations on materials
    // - Substances in public registry

    const res = await testClient.products.$get(
      '/prod_test/versions/pv_test/substances/rollup',
      {
        headers: { Authorization: 'Bearer test-token' },
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('substances');
    expect(data).toHaveProperty('calculatedAt');
    expect(data).toHaveProperty('isComplete');
  });
});
```

**Step 2: Create the route**

```typescript
// apps/api/src/routes/products/substance-rollup.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { SubstanceRollupService } from '@eurocomply/database/services/substance-rollup.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { getRequestContext } from '../../middleware/context.js';

const substanceRollupRoutes = new Hono();

/**
 * GET /products/:productId/versions/:versionId/substances/rollup
 *
 * Calculate and return rolled-up substance concentrations from the BOM.
 */
substanceRollupRoutes.get(
  '/:productId/versions/:versionId/substances/rollup',
  requireAuth(),
  zValidator(
    'param',
    z.object({
      productId: z.string().startsWith('prod_'),
      versionId: z.string().startsWith('pv_'),
    })
  ),
  async (c) => {
    const { versionId } = c.req.valid('param');
    const { em } = getRequestContext(c);

    const service = new SubstanceRollupService(em);
    const result = await service.rollUp(versionId);

    return c.json({
      success: true,
      data: {
        productVersionId: result.productVersionId,
        calculatedAt: result.calculatedAt.toISOString(),
        isComplete: result.isComplete,
        warnings: result.warnings,
        substances: result.substances.map(s => ({
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
    });
  }
);

export { substanceRollupRoutes };
```

**Step 3: Register routes in product router**

Add to the main products router:

```typescript
// In apps/api/src/routes/products/index.ts
import { substanceRollupRoutes } from './substance-rollup.js';

// Register substance rollup routes
productRoutes.route('/', substanceRollupRoutes);
```

**Step 4: Run tests and commit**

```bash
cd apps/api && pnpm test substance-rollup.e2e.test.ts
git add apps/api/src/routes/products/substance-rollup.ts apps/api/src/routes/products/substance-rollup.e2e.test.ts apps/api/src/routes/products/index.ts
git commit -m "feat(api): add substance rollup endpoint for products"
```

---

## Task 7: Create System Substance Rule Templates Seed

**Files:**
- Create: `packages/database/src/seeds/data/substance-rule-templates.json`
- Modify: `packages/database/src/seeds/system-rule-templates.ts` (or create if not exists)

**Step 1: Create the data bundle**

```json
// packages/database/src/seeds/data/substance-rule-templates.json
{
  "version": "2026-01-26",
  "rules": [
    {
      "code": "REACH_SVHC_DECLARATION",
      "name": "SVHC Declaration Requirement",
      "description": "Products containing SVHC above 0.1% w/w require declaration per REACH Article 33",
      "scope": "SYSTEM",
      "type": "PROCESS",
      "ruleCategory": "COMPLIANCE",
      "severity": "WARNING",
      "validationLogic": {
        "type": "substance_threshold",
        "config": {
          "filter": { "isSvhc": true },
          "thresholdPct": 0.1,
          "message": "Product contains SVHC above 0.1% - declaration required per REACH Article 33"
        }
      },
      "activeFrom": "2007-06-01"
    },
    {
      "code": "REACH_AUTHORIZATION_REQUIRED",
      "name": "Authorization Required Substance",
      "description": "Products containing Annex XIV substances require REACH authorization",
      "scope": "SYSTEM",
      "type": "PROCESS",
      "ruleCategory": "DESIGN",
      "severity": "BLOCKER",
      "validationLogic": {
        "type": "substance_authorization",
        "config": {
          "message": "Product contains substance requiring REACH authorization (Annex XIV)"
        }
      },
      "activeFrom": "2007-06-01"
    },
    {
      "code": "ROHS_RESTRICTED_SUBSTANCES",
      "name": "RoHS Restricted Substance Check",
      "description": "Electronics must not exceed RoHS substance limits",
      "scope": "SYSTEM",
      "type": "PROCESS",
      "ruleCategory": "DESIGN",
      "severity": "BLOCKER",
      "validationLogic": {
        "type": "substance_presence",
        "config": {
          "forbiddenCasNumbers": [
            "7439-92-1",
            "7440-43-9",
            "7439-97-6",
            "18540-29-9",
            "1336-36-3",
            "32534-81-9"
          ],
          "thresholds": {
            "default": 0.1,
            "7440-43-9": 0.01
          },
          "message": "Product contains RoHS restricted substance"
        }
      },
      "activeFrom": "2006-07-01"
    },
    {
      "code": "REACH_RESTRICTED_SUBSTANCES",
      "name": "REACH Annex XVII Restriction Check",
      "description": "Products must comply with REACH Annex XVII restrictions",
      "scope": "SYSTEM",
      "type": "PROCESS",
      "ruleCategory": "DESIGN",
      "severity": "BLOCKER",
      "validationLogic": {
        "type": "substance_threshold",
        "config": {
          "filter": { "isRestricted": true },
          "thresholdPct": 0,
          "message": "Product contains REACH Annex XVII restricted substance"
        }
      },
      "activeFrom": "2007-06-01"
    }
  ]
}
```

**Step 2: Create the seeder function**

```typescript
// packages/database/src/seeds/substance-rule-templates.ts
import { EntityManager } from '@mikro-orm/core';
import substanceRuleData from './data/substance-rule-templates.json' assert { type: 'json' };
import { generateId } from '../utils/id-generator.js';

interface RuleTemplateInput {
  code: string;
  name: string;
  description: string;
  scope: string;
  type: string;
  ruleCategory: string;
  severity: string;
  validationLogic: object;
  activeFrom: string;
}

/**
 * Seed system substance rule templates.
 * These rules are platform-managed and visible to all tenants.
 */
export async function seedSubstanceRuleTemplates(em: EntityManager): Promise<number> {
  const rules = substanceRuleData.rules as RuleTemplateInput[];
  let created = 0;

  for (const rule of rules) {
    // Check if rule already exists
    const existing = await em.findOne('RuleTemplate', {
      code: rule.code,
      organization: null, // System rules have no organization
    });

    if (existing) {
      // Update existing rule
      Object.assign(existing, {
        name: rule.name,
        description: rule.description,
        validationLogic: rule.validationLogic,
      });
    } else {
      // Create new rule
      const entity = em.create('RuleTemplate', {
        id: generateId('rule'),
        code: rule.code,
        name: rule.name,
        description: rule.description,
        scope: rule.scope,
        type: rule.type,
        ruleCategory: rule.ruleCategory,
        severity: rule.severity,
        validationLogic: rule.validationLogic,
        activeFrom: new Date(rule.activeFrom),
        organization: null,
      });
      em.persist(entity);
      created++;
    }
  }

  await em.flush();
  return created;
}
```

**Step 3: Commit**

```bash
git add packages/database/src/seeds/data/substance-rule-templates.json packages/database/src/seeds/substance-rule-templates.ts
git commit -m "feat(database): add system substance rule templates seed"
```

---

## Task 8: Export Services and Update Index

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
- System substance rule templates seed
- Regulatory threshold constants

**API Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/products/:id/versions/:versionId/substances/rollup` | Calculate rolled-up substances |

**Regulatory Rules Seeded:**
- `REACH_SVHC_DECLARATION` - SVHC > 0.1% warning
- `REACH_AUTHORIZATION_REQUIRED` - Annex XIV blocker
- `ROHS_RESTRICTED_SUBSTANCES` - RoHS substance limits
- `REACH_RESTRICTED_SUBSTANCES` - Annex XVII restrictions

**Next Plan:** Plan 9 (DPP & Reporting) includes substance declarations in Digital Product Passport.
