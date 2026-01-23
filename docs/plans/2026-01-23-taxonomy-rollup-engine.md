# Rollup Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the BOM-based rollup engine for calculating aggregate attribute values (SUM, WEIGHTED_AVG, MAX, MIN, BOOLEAN_AND/OR).

**Architecture:** RollupEngine flattens nested BOM structures to calculate effective quantities, then applies rollup method per attribute. Supports secondary attribute reference (weightBasisKey) for weighted averages. Tracks calculation source and handles partial data gracefully.

**Tech Stack:** MikroORM, PostgreSQL, Hono, Vitest

**Prerequisites:**
- Plan 1 (Units Foundation) - DONE
- Plan 2 (Category & Attribute Schema) - DONE
- Plan 3 (Category Service & API) - DONE
- Plan 4 (Attributes Service & API) - DONE
- Plan 5 (Product Attribute Values) - DONE

---

## Task 6.1: Create BOM Flattener Service

**Files:**
- Create: `packages/database/src/services/bom-flattener.service.ts`
- Create: `packages/database/src/services/bom-flattener.service.test.ts`
- Modify: `packages/database/src/services/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/bom-flattener.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { BomFlattenerService, type BomNode, type FlatBomNode } from './bom-flattener.service.js';
import type { AttributeValue } from '../types/attribute-value.js';
import { AttributeSource } from '../types/attribute-value.js';

describe('BomFlattenerService', () => {
  let service: BomFlattenerService;

  beforeEach(() => {
    service = new BomFlattenerService();
  });

  describe('flatten', () => {
    it('should flatten a simple one-level BOM', () => {
      const bom: BomNode = {
        productVersionId: 'parent_v1',
        quantity: 1,
        attributes: {
          weight: createAttr(100, 'KGM'),
        },
        children: [
          {
            productVersionId: 'child_1_v1',
            quantity: 2,
            attributes: {
              weight: createAttr(10, 'KGM'),
            },
            children: [],
          },
          {
            productVersionId: 'child_2_v1',
            quantity: 3,
            attributes: {
              weight: createAttr(5, 'KGM'),
            },
            children: [],
          },
        ],
      };

      const flat = service.flatten(bom);

      // Should have 2 leaf nodes
      expect(flat).toHaveLength(2);

      // First child: quantity 2
      const child1 = flat.find(n => n.productVersionId === 'child_1_v1');
      expect(child1?.effectiveQuantity).toBe(2);

      // Second child: quantity 3
      const child2 = flat.find(n => n.productVersionId === 'child_2_v1');
      expect(child2?.effectiveQuantity).toBe(3);
    });

    it('should calculate effective quantities through nested levels', () => {
      // Parent > SubAssembly (qty 2) > Component (qty 3)
      // Effective component qty = 2 * 3 = 6
      const bom: BomNode = {
        productVersionId: 'parent_v1',
        quantity: 1,
        attributes: {},
        children: [
          {
            productVersionId: 'subasm_v1',
            quantity: 2,
            attributes: {},
            children: [
              {
                productVersionId: 'component_v1',
                quantity: 3,
                attributes: {
                  weight: createAttr(1, 'KGM'),
                },
                children: [],
              },
            ],
          },
        ],
      };

      const flat = service.flatten(bom);

      expect(flat).toHaveLength(1);
      expect(flat[0].productVersionId).toBe('component_v1');
      expect(flat[0].effectiveQuantity).toBe(6); // 2 * 3
    });

    it('should preserve attributes on leaf nodes', () => {
      const bom: BomNode = {
        productVersionId: 'parent_v1',
        quantity: 1,
        attributes: {},
        children: [
          {
            productVersionId: 'child_v1',
            quantity: 1,
            attributes: {
              weight: createAttr(500, 'GRM'),
              recycled_content: createAttr(80, 'P1'),
            },
            children: [],
          },
        ],
      };

      const flat = service.flatten(bom);

      expect(flat).toHaveLength(1);
      expect(flat[0].attributes.weight).toBeDefined();
      expect(flat[0].attributes.recycled_content).toBeDefined();
    });

    it('should handle empty BOM', () => {
      const bom: BomNode = {
        productVersionId: 'parent_v1',
        quantity: 1,
        attributes: {},
        children: [],
      };

      const flat = service.flatten(bom);

      expect(flat).toHaveLength(0);
    });
  });
});

// Helper to create AttributeValue
function createAttr(val: number, unit: string): AttributeValue {
  return {
    templateId: 'attr_test',
    val,
    unit,
    source: AttributeSource.MANUAL,
    updatedAt: new Date().toISOString(),
  };
}
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/bom-flattener.service.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the service**

```typescript
// packages/database/src/services/bom-flattener.service.ts
import type { AttributeValue } from '../types/attribute-value.js';

/**
 * A node in the BOM tree structure.
 */
export interface BomNode {
  productVersionId: string;
  quantity: number;
  attributes: Record<string, AttributeValue>;
  children: BomNode[];
}

/**
 * A flattened leaf node with effective quantity calculated.
 */
export interface FlatBomNode {
  productVersionId: string;
  effectiveQuantity: number;
  attributes: Record<string, AttributeValue>;
  path: string[]; // Path from root to this node
}

/**
 * Service for flattening nested BOM structures.
 *
 * Calculates effective quantities by multiplying quantities through
 * the tree hierarchy. Only returns leaf nodes (nodes with no children).
 */
export class BomFlattenerService {
  /**
   * Flatten a BOM tree into a list of leaf nodes with effective quantities.
   *
   * Example:
   *   Parent
   *   └── SubAssembly (qty: 2)
   *       └── Component (qty: 3)
   *
   * Result: [{ Component, effectiveQuantity: 6 }]
   */
  flatten(root: BomNode): FlatBomNode[] {
    const result: FlatBomNode[] = [];
    this.flattenRecursive(root, 1, [], result);
    return result;
  }

  private flattenRecursive(
    node: BomNode,
    parentQuantity: number,
    path: string[],
    result: FlatBomNode[],
  ): void {
    const effectiveQuantity = parentQuantity * node.quantity;
    const currentPath = [...path, node.productVersionId];

    // If this is a leaf node (no children), add to result
    if (node.children.length === 0) {
      // Skip the root node itself - only include actual BOM entries
      if (path.length > 0) {
        result.push({
          productVersionId: node.productVersionId,
          effectiveQuantity,
          attributes: node.attributes,
          path: currentPath,
        });
      }
      return;
    }

    // Otherwise, recurse into children
    for (const child of node.children) {
      this.flattenRecursive(child, effectiveQuantity, currentPath, result);
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/services/bom-flattener.service.test.ts
```

Expected: PASS

**Step 5: Export from services index**

Add to `packages/database/src/services/index.ts`:

```typescript
export {
  BomFlattenerService,
  type BomNode,
  type FlatBomNode,
} from './bom-flattener.service.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/services/bom-flattener.service.ts
git add packages/database/src/services/bom-flattener.service.test.ts
git add packages/database/src/services/index.ts
git commit -m "feat(database): add BomFlattenerService

- Flattens nested BOM into leaf nodes
- Calculates effective quantities through hierarchy
- Preserves attributes on leaf nodes"
```

---

## Task 6.2: Create Rollup Calculator Service

**Files:**
- Create: `packages/database/src/services/rollup-calculator.service.ts`
- Create: `packages/database/src/services/rollup-calculator.service.test.ts`
- Modify: `packages/database/src/services/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/rollup-calculator.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { RollupCalculatorService } from './rollup-calculator.service.js';
import { RollupMethod } from '../entities/AttributeTemplate.js';
import type { FlatBomNode } from './bom-flattener.service.js';
import type { AttributeValue } from '../types/attribute-value.js';
import { AttributeSource } from '../types/attribute-value.js';

describe('RollupCalculatorService', () => {
  let service: RollupCalculatorService;

  beforeEach(() => {
    // Mock unit converter
    const mockUnitConverter = {
      convert: async (value: number, fromUnit: string, toUnit: string) => {
        if (fromUnit === 'GRM' && toUnit === 'KGM') {
          return { val: value * 0.001, unit: toUnit };
        }
        return { val: value, unit: toUnit };
      },
      getBaseUnit: async (system: string) => {
        return system === 'MASS' ? 'KGM' : 'P1';
      },
    };

    service = new RollupCalculatorService(mockUnitConverter);
  });

  describe('calculateSum', () => {
    it('should sum attribute values with effective quantities', async () => {
      const nodes: FlatBomNode[] = [
        createNode('child_1', 2, { weight: createAttr(10, 'KGM') }),
        createNode('child_2', 3, { weight: createAttr(5, 'KGM') }),
      ];

      const result = await service.calculateSum(nodes, 'weight', 'KGM');

      // (2 * 10) + (3 * 5) = 20 + 15 = 35
      expect(result.val).toBe(35);
      expect(result.unit).toBe('KGM');
      expect(result.source).toBe(AttributeSource.CALCULATED);
    });

    it('should convert units before summing', async () => {
      const nodes: FlatBomNode[] = [
        createNode('child_1', 1, { weight: createAttr(1000, 'GRM') }), // 1 KGM
        createNode('child_2', 1, { weight: createAttr(2, 'KGM') }),
      ];

      const result = await service.calculateSum(nodes, 'weight', 'KGM');

      expect(result.val).toBeCloseTo(3, 5); // 1 + 2 = 3 KGM
    });

    it('should mark as CANNOT_CALCULATE when all nodes missing attribute', async () => {
      const nodes: FlatBomNode[] = [
        createNode('child_1', 1, {}),
        createNode('child_2', 1, {}),
      ];

      const result = await service.calculateSum(nodes, 'weight', 'KGM');

      expect(result.val).toBeNull();
      expect(result.source).toBe(AttributeSource.CANNOT_CALCULATE);
    });
  });

  describe('calculateWeightedAvg', () => {
    it('should calculate weighted average using weight basis', async () => {
      // Component A: weight 0.4 KGM, recycled 80%
      // Component B: weight 0.1 KGM, recycled 20%
      // Weighted avg = (0.4 * 80 + 0.1 * 20) / (0.4 + 0.1) = 34 / 0.5 = 68%
      const nodes: FlatBomNode[] = [
        createNode('child_a', 1, {
          weight: createAttr(0.4, 'KGM'),
          recycled_content: createAttr(80, 'P1'),
        }),
        createNode('child_b', 1, {
          weight: createAttr(0.1, 'KGM'),
          recycled_content: createAttr(20, 'P1'),
        }),
      ];

      const result = await service.calculateWeightedAvg(
        nodes,
        'recycled_content',
        'weight',
        'P1',
        'KGM',
      );

      expect(result.val).toBeCloseTo(68, 5);
      expect(result.unit).toBe('P1');
    });

    it('should handle missing weight basis gracefully', async () => {
      const nodes: FlatBomNode[] = [
        createNode('child_a', 1, {
          recycled_content: createAttr(80, 'P1'),
          // Missing weight
        }),
      ];

      const result = await service.calculateWeightedAvg(
        nodes,
        'recycled_content',
        'weight',
        'P1',
        'KGM',
      );

      expect(result.val).toBeNull();
      expect(result.source).toBe(AttributeSource.CANNOT_CALCULATE);
    });
  });

  describe('calculateMax', () => {
    it('should find maximum value', async () => {
      const nodes: FlatBomNode[] = [
        createNode('child_1', 1, { temp: createAttr(60, 'CEL') }),
        createNode('child_2', 1, { temp: createAttr(85, 'CEL') }),
        createNode('child_3', 1, { temp: createAttr(45, 'CEL') }),
      ];

      const result = await service.calculateMax(nodes, 'temp', 'CEL');

      expect(result.val).toBe(85);
    });
  });

  describe('calculateMin', () => {
    it('should find minimum value', async () => {
      const nodes: FlatBomNode[] = [
        createNode('child_1', 1, { temp: createAttr(-20, 'CEL') }),
        createNode('child_2', 1, { temp: createAttr(5, 'CEL') }),
        createNode('child_3', 1, { temp: createAttr(-40, 'CEL') }),
      ];

      const result = await service.calculateMin(nodes, 'temp', 'CEL');

      expect(result.val).toBe(-40);
    });
  });

  describe('calculateBooleanAnd', () => {
    it('should return true when all true', async () => {
      const nodes: FlatBomNode[] = [
        createNode('child_1', 1, { recyclable: createBoolAttr(true) }),
        createNode('child_2', 1, { recyclable: createBoolAttr(true) }),
      ];

      const result = await service.calculateBooleanAnd(nodes, 'recyclable');

      expect(result.val).toBe(true);
    });

    it('should return false when any false', async () => {
      const nodes: FlatBomNode[] = [
        createNode('child_1', 1, { recyclable: createBoolAttr(true) }),
        createNode('child_2', 1, { recyclable: createBoolAttr(false) }),
      ];

      const result = await service.calculateBooleanAnd(nodes, 'recyclable');

      expect(result.val).toBe(false);
    });
  });

  describe('calculateBooleanOr', () => {
    it('should return true when any true', async () => {
      const nodes: FlatBomNode[] = [
        createNode('child_1', 1, { hazardous: createBoolAttr(false) }),
        createNode('child_2', 1, { hazardous: createBoolAttr(true) }),
      ];

      const result = await service.calculateBooleanOr(nodes, 'hazardous');

      expect(result.val).toBe(true);
    });

    it('should return false when all false', async () => {
      const nodes: FlatBomNode[] = [
        createNode('child_1', 1, { hazardous: createBoolAttr(false) }),
        createNode('child_2', 1, { hazardous: createBoolAttr(false) }),
      ];

      const result = await service.calculateBooleanOr(nodes, 'hazardous');

      expect(result.val).toBe(false);
    });
  });
});

// Helpers
function createNode(id: string, qty: number, attrs: Record<string, AttributeValue>): FlatBomNode {
  return {
    productVersionId: id,
    effectiveQuantity: qty,
    attributes: attrs,
    path: ['root', id],
  };
}

function createAttr(val: number, unit: string): AttributeValue {
  return {
    templateId: 'test',
    val,
    unit,
    source: AttributeSource.MANUAL,
    updatedAt: new Date().toISOString(),
  };
}

function createBoolAttr(val: boolean): AttributeValue {
  return {
    templateId: 'test',
    val,
    source: AttributeSource.MANUAL,
    updatedAt: new Date().toISOString(),
  };
}
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/rollup-calculator.service.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the service**

```typescript
// packages/database/src/services/rollup-calculator.service.ts
import type { FlatBomNode } from './bom-flattener.service.js';
import type { AttributeValue } from '../types/attribute-value.js';
import { AttributeSource } from '../types/attribute-value.js';
import type { UnitConverter } from './attribute-value.service.js';

/**
 * Result of a rollup calculation.
 */
export interface RollupResult {
  val: number | boolean | null;
  unit?: string;
  source: AttributeSource;
  calculationWarning?: string;
  nodesUsed: number;
  nodesSkipped: number;
}

/**
 * Service for calculating rollup values from flattened BOM.
 */
export class RollupCalculatorService {
  constructor(private readonly unitConverter: UnitConverter) {}

  /**
   * Calculate SUM rollup.
   *
   * Formula: Σ(child.val × effectiveQuantity)
   */
  async calculateSum(
    nodes: FlatBomNode[],
    attributeKey: string,
    targetUnit: string,
  ): Promise<RollupResult> {
    let sum = 0;
    let nodesUsed = 0;
    let nodesSkipped = 0;

    for (const node of nodes) {
      const attr = node.attributes[attributeKey];
      if (!attr || attr.val === null || typeof attr.val !== 'number') {
        nodesSkipped++;
        continue;
      }

      // Convert to target unit if needed
      let value = attr.val;
      if (attr.unit && attr.unit !== targetUnit) {
        const converted = await this.unitConverter.convert(value, attr.unit, targetUnit);
        value = converted.val;
      }

      sum += value * node.effectiveQuantity;
      nodesUsed++;
    }

    if (nodesUsed === 0) {
      return {
        val: null,
        unit: targetUnit,
        source: AttributeSource.CANNOT_CALCULATE,
        calculationWarning: 'No nodes had values for this attribute',
        nodesUsed: 0,
        nodesSkipped,
      };
    }

    return {
      val: sum,
      unit: targetUnit,
      source: nodesSkipped > 0 ? AttributeSource.CALCULATED : AttributeSource.CALCULATED,
      calculationWarning: nodesSkipped > 0 ? `${nodesSkipped} nodes missing attribute` : undefined,
      nodesUsed,
      nodesSkipped,
    };
  }

  /**
   * Calculate WEIGHTED_AVG rollup.
   *
   * Formula: Σ(child.val × child.weightBasis) / Σ(child.weightBasis)
   */
  async calculateWeightedAvg(
    nodes: FlatBomNode[],
    attributeKey: string,
    weightBasisKey: string,
    targetUnit: string,
    weightBasisUnit: string,
  ): Promise<RollupResult> {
    let weightedSum = 0;
    let totalWeight = 0;
    let nodesUsed = 0;
    let nodesSkipped = 0;

    for (const node of nodes) {
      const attr = node.attributes[attributeKey];
      const weightBasis = node.attributes[weightBasisKey];

      if (
        !attr ||
        attr.val === null ||
        typeof attr.val !== 'number' ||
        !weightBasis ||
        weightBasis.val === null ||
        typeof weightBasis.val !== 'number'
      ) {
        nodesSkipped++;
        continue;
      }

      // Convert weight basis to base unit
      let weight = weightBasis.val;
      if (weightBasis.unit && weightBasis.unit !== weightBasisUnit) {
        const converted = await this.unitConverter.convert(weight, weightBasis.unit, weightBasisUnit);
        weight = converted.val;
      }

      // Apply effective quantity to weight
      const effectiveWeight = weight * node.effectiveQuantity;

      if (effectiveWeight === 0) {
        nodesSkipped++;
        continue;
      }

      weightedSum += attr.val * effectiveWeight;
      totalWeight += effectiveWeight;
      nodesUsed++;
    }

    if (totalWeight === 0) {
      return {
        val: null,
        unit: targetUnit,
        source: AttributeSource.CANNOT_CALCULATE,
        calculationWarning: 'Total weight is zero or no valid nodes',
        nodesUsed: 0,
        nodesSkipped,
      };
    }

    return {
      val: weightedSum / totalWeight,
      unit: targetUnit,
      source: AttributeSource.CALCULATED,
      calculationWarning: nodesSkipped > 0 ? `${nodesSkipped} nodes skipped` : undefined,
      nodesUsed,
      nodesSkipped,
    };
  }

  /**
   * Calculate MAX rollup.
   */
  async calculateMax(
    nodes: FlatBomNode[],
    attributeKey: string,
    targetUnit: string,
  ): Promise<RollupResult> {
    let max: number | null = null;
    let nodesUsed = 0;
    let nodesSkipped = 0;

    for (const node of nodes) {
      const attr = node.attributes[attributeKey];
      if (!attr || attr.val === null || typeof attr.val !== 'number') {
        nodesSkipped++;
        continue;
      }

      let value = attr.val;
      if (attr.unit && attr.unit !== targetUnit) {
        const converted = await this.unitConverter.convert(value, attr.unit, targetUnit);
        value = converted.val;
      }

      if (max === null || value > max) {
        max = value;
      }
      nodesUsed++;
    }

    if (max === null) {
      return {
        val: null,
        unit: targetUnit,
        source: AttributeSource.CANNOT_CALCULATE,
        nodesUsed: 0,
        nodesSkipped,
      };
    }

    return {
      val: max,
      unit: targetUnit,
      source: AttributeSource.CALCULATED,
      nodesUsed,
      nodesSkipped,
    };
  }

  /**
   * Calculate MIN rollup.
   */
  async calculateMin(
    nodes: FlatBomNode[],
    attributeKey: string,
    targetUnit: string,
  ): Promise<RollupResult> {
    let min: number | null = null;
    let nodesUsed = 0;
    let nodesSkipped = 0;

    for (const node of nodes) {
      const attr = node.attributes[attributeKey];
      if (!attr || attr.val === null || typeof attr.val !== 'number') {
        nodesSkipped++;
        continue;
      }

      let value = attr.val;
      if (attr.unit && attr.unit !== targetUnit) {
        const converted = await this.unitConverter.convert(value, attr.unit, targetUnit);
        value = converted.val;
      }

      if (min === null || value < min) {
        min = value;
      }
      nodesUsed++;
    }

    if (min === null) {
      return {
        val: null,
        unit: targetUnit,
        source: AttributeSource.CANNOT_CALCULATE,
        nodesUsed: 0,
        nodesSkipped,
      };
    }

    return {
      val: min,
      unit: targetUnit,
      source: AttributeSource.CALCULATED,
      nodesUsed,
      nodesSkipped,
    };
  }

  /**
   * Calculate BOOLEAN_AND rollup.
   *
   * Returns true only if ALL nodes have value true.
   */
  async calculateBooleanAnd(
    nodes: FlatBomNode[],
    attributeKey: string,
  ): Promise<RollupResult> {
    let result = true;
    let nodesUsed = 0;
    let nodesSkipped = 0;

    for (const node of nodes) {
      const attr = node.attributes[attributeKey];
      if (!attr || typeof attr.val !== 'boolean') {
        nodesSkipped++;
        continue;
      }

      result = result && attr.val;
      nodesUsed++;
    }

    if (nodesUsed === 0) {
      return {
        val: null,
        source: AttributeSource.CANNOT_CALCULATE,
        nodesUsed: 0,
        nodesSkipped,
      };
    }

    return {
      val: result,
      source: AttributeSource.CALCULATED,
      nodesUsed,
      nodesSkipped,
    };
  }

  /**
   * Calculate BOOLEAN_OR rollup.
   *
   * Returns true if ANY node has value true.
   */
  async calculateBooleanOr(
    nodes: FlatBomNode[],
    attributeKey: string,
  ): Promise<RollupResult> {
    let result = false;
    let nodesUsed = 0;
    let nodesSkipped = 0;

    for (const node of nodes) {
      const attr = node.attributes[attributeKey];
      if (!attr || typeof attr.val !== 'boolean') {
        nodesSkipped++;
        continue;
      }

      result = result || attr.val;
      nodesUsed++;
    }

    if (nodesUsed === 0) {
      return {
        val: null,
        source: AttributeSource.CANNOT_CALCULATE,
        nodesUsed: 0,
        nodesSkipped,
      };
    }

    return {
      val: result,
      source: AttributeSource.CALCULATED,
      nodesUsed,
      nodesSkipped,
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/services/rollup-calculator.service.test.ts
```

Expected: PASS

**Step 5: Export from services index**

Add to `packages/database/src/services/index.ts`:

```typescript
export {
  RollupCalculatorService,
  type RollupResult,
} from './rollup-calculator.service.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/services/rollup-calculator.service.ts
git add packages/database/src/services/rollup-calculator.service.test.ts
git add packages/database/src/services/index.ts
git commit -m "feat(database): add RollupCalculatorService

- calculateSum() with unit conversion
- calculateWeightedAvg() with weight basis
- calculateMax/Min/BooleanAnd/BooleanOr
- Tracks nodes used/skipped for warnings"
```

---

## Task 6.3: Create RollupEngine Service

**Files:**
- Create: `packages/database/src/services/rollup-engine.service.ts`
- Create: `packages/database/src/services/rollup-engine.service.test.ts`
- Modify: `packages/database/src/services/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/rollup-engine.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { RollupEngineService } from './rollup-engine.service.js';
import { RollupMethod } from '../entities/AttributeTemplate.js';
import type { BomNode } from './bom-flattener.service.js';
import type { AttributeValue } from '../types/attribute-value.js';
import { AttributeSource } from '../types/attribute-value.js';

describe('RollupEngineService', () => {
  let service: RollupEngineService;

  beforeEach(() => {
    // Mock dependencies
    const mockUnitConverter = {
      convert: async (value: number, fromUnit: string, toUnit: string) => {
        if (fromUnit === 'GRM' && toUnit === 'KGM') {
          return { val: value * 0.001, unit: toUnit };
        }
        return { val: value, unit: toUnit };
      },
      getBaseUnit: async (system: string) => {
        return system === 'MASS' ? 'KGM' : 'P1';
      },
    };

    const mockTemplateRepo = {
      findByKey: async (key: string) => {
        const templates: Record<string, unknown> = {
          'weight': {
            id: 'attr_weight',
            key: 'weight',
            type: 'NUMBER_UNIT',
            unitSystem: 'MASS',
            rollupMethod: RollupMethod.SUM,
          },
          'recycled_content': {
            id: 'attr_recycled',
            key: 'recycled_content',
            type: 'NUMBER_UNIT',
            unitSystem: 'PERCENTAGE',
            rollupMethod: RollupMethod.WEIGHTED_AVG,
            weightBasisKey: 'weight',
          },
          'max_temp': {
            id: 'attr_max_temp',
            key: 'max_temp',
            type: 'NUMBER_UNIT',
            unitSystem: 'TEMPERATURE',
            rollupMethod: RollupMethod.MAX,
          },
          'brand': {
            id: 'attr_brand',
            key: 'brand',
            type: 'STRING',
            rollupMethod: RollupMethod.NONE,
          },
        };
        return templates[key] ?? null;
      },
    };

    const mockBomProvider = {
      getBomTree: async (productVersionId: string) => {
        // Return a sample BOM tree
        return {
          productVersionId,
          quantity: 1,
          attributes: {},
          children: [
            {
              productVersionId: 'child_1',
              quantity: 2,
              attributes: {
                weight: createAttr(0.4, 'KGM'),
                recycled_content: createAttr(80, 'P1'),
              },
              children: [],
            },
            {
              productVersionId: 'child_2',
              quantity: 1,
              attributes: {
                weight: createAttr(0.1, 'KGM'),
                recycled_content: createAttr(20, 'P1'),
              },
              children: [],
            },
          ],
        } as BomNode;
      },
    };

    service = new RollupEngineService(mockUnitConverter, mockTemplateRepo, mockBomProvider);
  });

  describe('calculateRollup', () => {
    it('should calculate SUM for weight', async () => {
      const result = await service.calculateRollup('parent_v1', 'weight');

      // child_1: 2 * 0.4 = 0.8 KGM
      // child_2: 1 * 0.1 = 0.1 KGM
      // Total: 0.9 KGM
      expect(result.val).toBeCloseTo(0.9, 5);
      expect(result.unit).toBe('KGM');
      expect(result.source).toBe(AttributeSource.CALCULATED);
    });

    it('should calculate WEIGHTED_AVG for recycled_content', async () => {
      const result = await service.calculateRollup('parent_v1', 'recycled_content');

      // child_1: weight 0.8 KGM (2*0.4), recycled 80%
      // child_2: weight 0.1 KGM, recycled 20%
      // Weighted avg = (0.8 * 80 + 0.1 * 20) / (0.8 + 0.1) = 66 / 0.9 ≈ 73.33%
      expect(result.val).toBeCloseTo(73.33, 1);
      expect(result.unit).toBe('P1');
    });

    it('should skip attributes with NONE rollup method', async () => {
      const result = await service.calculateRollup('parent_v1', 'brand');

      expect(result.val).toBeNull();
      expect(result.source).toBe(AttributeSource.CANNOT_CALCULATE);
      expect(result.calculationWarning).toContain('NONE');
    });

    it('should return null for unknown attribute', async () => {
      const result = await service.calculateRollup('parent_v1', 'unknown_attr');

      expect(result.val).toBeNull();
      expect(result.source).toBe(AttributeSource.CANNOT_CALCULATE);
    });
  });

  describe('calculateAllRollups', () => {
    it('should calculate all applicable rollups', async () => {
      const results = await service.calculateAllRollups('parent_v1', ['weight', 'recycled_content']);

      expect(results.weight).toBeDefined();
      expect(results.weight.val).toBeCloseTo(0.9, 5);

      expect(results.recycled_content).toBeDefined();
      expect(results.recycled_content.val).toBeCloseTo(73.33, 1);
    });
  });
});

function createAttr(val: number, unit: string): AttributeValue {
  return {
    templateId: 'test',
    val,
    unit,
    source: AttributeSource.MANUAL,
    updatedAt: new Date().toISOString(),
  };
}
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/rollup-engine.service.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the service**

```typescript
// packages/database/src/services/rollup-engine.service.ts
import { RollupMethod } from '../entities/AttributeTemplate.js';
import { AttributeSource, type AttributeValue } from '../types/attribute-value.js';
import { BomFlattenerService, type BomNode } from './bom-flattener.service.js';
import { RollupCalculatorService, type RollupResult } from './rollup-calculator.service.js';
import type { UnitConverter } from './attribute-value.service.js';

/**
 * Interface for accessing attribute templates.
 */
export interface RollupTemplateRepository {
  findByKey(key: string): Promise<{
    id: string;
    key: string;
    type: string;
    unitSystem?: string;
    rollupMethod: RollupMethod;
    weightBasisKey?: string;
  } | null>;
}

/**
 * Interface for accessing BOM data.
 */
export interface BomProvider {
  getBomTree(productVersionId: string): Promise<BomNode | null>;
}

/**
 * Main rollup engine service.
 *
 * Orchestrates BOM flattening and rollup calculations based on
 * attribute template configurations.
 */
export class RollupEngineService {
  private bomFlattener: BomFlattenerService;
  private rollupCalculator: RollupCalculatorService;

  constructor(
    private readonly unitConverter: UnitConverter,
    private readonly templateRepo: RollupTemplateRepository,
    private readonly bomProvider: BomProvider,
  ) {
    this.bomFlattener = new BomFlattenerService();
    this.rollupCalculator = new RollupCalculatorService(unitConverter);
  }

  /**
   * Calculate rollup for a single attribute on a product version.
   */
  async calculateRollup(
    productVersionId: string,
    attributeKey: string,
  ): Promise<RollupResult> {
    // Get attribute template
    const template = await this.templateRepo.findByKey(attributeKey);
    if (!template) {
      return {
        val: null,
        source: AttributeSource.CANNOT_CALCULATE,
        calculationWarning: `Attribute template not found: ${attributeKey}`,
        nodesUsed: 0,
        nodesSkipped: 0,
      };
    }

    // Check rollup method
    if (template.rollupMethod === RollupMethod.NONE) {
      return {
        val: null,
        source: AttributeSource.CANNOT_CALCULATE,
        calculationWarning: `Attribute ${attributeKey} has rollup method NONE`,
        nodesUsed: 0,
        nodesSkipped: 0,
      };
    }

    // Get BOM tree
    const bomTree = await this.bomProvider.getBomTree(productVersionId);
    if (!bomTree) {
      return {
        val: null,
        source: AttributeSource.CANNOT_CALCULATE,
        calculationWarning: 'BOM not found',
        nodesUsed: 0,
        nodesSkipped: 0,
      };
    }

    // Flatten BOM
    const flatNodes = this.bomFlattener.flatten(bomTree);
    if (flatNodes.length === 0) {
      return {
        val: null,
        source: AttributeSource.CANNOT_CALCULATE,
        calculationWarning: 'BOM has no components',
        nodesUsed: 0,
        nodesSkipped: 0,
      };
    }

    // Get target unit (base unit of the attribute's unit system)
    const targetUnit = template.unitSystem
      ? await this.unitConverter.getBaseUnit(template.unitSystem)
      : undefined;

    // Calculate based on rollup method
    switch (template.rollupMethod) {
      case RollupMethod.SUM:
        return this.rollupCalculator.calculateSum(flatNodes, attributeKey, targetUnit ?? '');

      case RollupMethod.WEIGHTED_AVG:
        if (!template.weightBasisKey) {
          return {
            val: null,
            source: AttributeSource.CANNOT_CALCULATE,
            calculationWarning: 'WEIGHTED_AVG requires weightBasisKey',
            nodesUsed: 0,
            nodesSkipped: 0,
          };
        }
        // Get weight basis unit
        const weightTemplate = await this.templateRepo.findByKey(template.weightBasisKey);
        const weightUnit = weightTemplate?.unitSystem
          ? await this.unitConverter.getBaseUnit(weightTemplate.unitSystem)
          : 'KGM';
        return this.rollupCalculator.calculateWeightedAvg(
          flatNodes,
          attributeKey,
          template.weightBasisKey,
          targetUnit ?? 'P1',
          weightUnit ?? 'KGM',
        );

      case RollupMethod.MAX:
        return this.rollupCalculator.calculateMax(flatNodes, attributeKey, targetUnit ?? '');

      case RollupMethod.MIN:
        return this.rollupCalculator.calculateMin(flatNodes, attributeKey, targetUnit ?? '');

      case RollupMethod.BOOLEAN_AND:
        return this.rollupCalculator.calculateBooleanAnd(flatNodes, attributeKey);

      case RollupMethod.BOOLEAN_OR:
        return this.rollupCalculator.calculateBooleanOr(flatNodes, attributeKey);

      case RollupMethod.CONCAT:
        // TODO: Implement concat if needed
        return {
          val: null,
          source: AttributeSource.CANNOT_CALCULATE,
          calculationWarning: 'CONCAT rollup not implemented',
          nodesUsed: 0,
          nodesSkipped: 0,
        };

      default:
        return {
          val: null,
          source: AttributeSource.CANNOT_CALCULATE,
          calculationWarning: `Unknown rollup method: ${template.rollupMethod}`,
          nodesUsed: 0,
          nodesSkipped: 0,
        };
    }
  }

  /**
   * Calculate rollups for multiple attributes.
   */
  async calculateAllRollups(
    productVersionId: string,
    attributeKeys: string[],
  ): Promise<Record<string, RollupResult>> {
    const results: Record<string, RollupResult> = {};

    for (const key of attributeKeys) {
      results[key] = await this.calculateRollup(productVersionId, key);
    }

    return results;
  }

  /**
   * Convert rollup results to attribute values for storage.
   */
  resultsToAttributeValues(
    results: Record<string, RollupResult>,
  ): Record<string, AttributeValue> {
    const values: Record<string, AttributeValue> = {};

    for (const [key, result] of Object.entries(results)) {
      if (result.val !== null) {
        values[key] = {
          templateId: '', // Will be set by caller
          val: result.val,
          unit: result.unit,
          source: result.source,
          updatedAt: new Date().toISOString(),
          calculationWarning: result.calculationWarning,
        };
      }
    }

    return values;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/services/rollup-engine.service.test.ts
```

Expected: PASS

**Step 5: Export from services index**

Add to `packages/database/src/services/index.ts`:

```typescript
export {
  RollupEngineService,
  type RollupTemplateRepository,
  type BomProvider,
} from './rollup-engine.service.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/services/rollup-engine.service.ts
git add packages/database/src/services/rollup-engine.service.test.ts
git add packages/database/src/services/index.ts
git commit -m "feat(database): add RollupEngineService

- Orchestrates BOM flattening and calculations
- Supports all rollup methods from templates
- Batch calculation for multiple attributes"
```

---

## Task 6.4: Create Rollup API Routes

**Files:**
- Modify: `apps/api/src/routes/products/attributes.ts`
- Modify: `apps/api/src/routes/products/attributes.test.ts`

**Step 1: Add rollup route tests**

Add to `apps/api/src/routes/products/attributes.test.ts`:

```typescript
  describe('POST /products/:productId/versions/:versionId/attributes/rollup', () => {
    it('triggers rollup calculation', async () => {
      const res = await app.request('/products/prod_1/versions/v_1/attributes/rollup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: ['weight', 'recycled_content'] }),
      });
      expect(res.status).toBe(200);

      const body = await res.json() as { data: Record<string, unknown> };
      expect(body.data.weight).toBeDefined();
      expect(body.data.recycled_content).toBeDefined();
    });

    it('calculates all rollup attributes when no keys specified', async () => {
      const res = await app.request('/products/prod_1/versions/v_1/attributes/rollup', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
    });
  });
```

**Step 2: Update mock repository**

Add to the mock repo in beforeEach:

```typescript
      triggerRollup: async (productId, versionId, keys) => {
        return {
          weight: {
            templateId: 'attr_weight',
            val: 0.9,
            unit: 'KGM',
            source: AttributeSource.CALCULATED,
            updatedAt: new Date().toISOString(),
          },
          recycled_content: {
            templateId: 'attr_recycled',
            val: 73.33,
            unit: 'P1',
            source: AttributeSource.CALCULATED,
            updatedAt: new Date().toISOString(),
          },
        };
      },
```

**Step 3: Add to repository interface and routes**

Update `apps/api/src/routes/products/attributes.ts`:

```typescript
export interface ProductAttributesRepository {
  // ... existing methods

  triggerRollup(
    productId: string,
    versionId: string,
    keys?: string[],
  ): Promise<Record<string, AttributeValue>>;
}

// Add schema
const triggerRollupBody = z.object({
  keys: z.array(z.string()).optional(),
}).optional();

// Add route to router
  // POST /products/:productId/versions/:versionId/attributes/rollup
  router.post('/rollup', zValidator('json', triggerRollupBody), async (c) => {
    const productId = c.req.param('productId');
    const versionId = c.req.param('versionId');
    const body = c.req.valid('json');

    const calculated = await repo.triggerRollup(productId, versionId, body?.keys);

    return c.json({
      data: calculated,
      meta: {
        productId,
        versionId,
        calculated: Object.keys(calculated),
      },
    });
  });
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/routes/products/attributes.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/products/attributes.ts
git add apps/api/src/routes/products/attributes.test.ts
git commit -m "feat(api): add rollup calculation route

- POST /products/:id/versions/:vid/attributes/rollup
- Optional keys filter for specific attributes
- Returns calculated attribute values"
```

---

## Task 6.5: Create MikroORM BOM Provider

**Files:**
- Create: `packages/database/src/services/mikro-orm-bom-provider.ts`
- Create: `packages/database/src/services/mikro-orm-bom-provider.test.ts`
- Modify: `packages/database/src/services/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/mikro-orm-bom-provider.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroOrmBomProvider } from './mikro-orm-bom-provider.js';
import { Product, ProductVersion } from '../entities/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils/index.js';
import type { MikroORM } from '@mikro-orm/postgresql';

describe('MikroOrmBomProvider', () => {
  let orm: MikroORM;
  let provider: MikroOrmBomProvider;
  const testSchema = 'tenant_bom_provider_test';

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();

    // Create test schema
    await orm.em.execute(`CREATE SCHEMA IF NOT EXISTS "${testSchema}"`);

    provider = new MikroOrmBomProvider(orm.em, testSchema);
  });

  afterAll(async () => {
    if (orm) {
      await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
      await teardownTestDb();
    }
  });

  it('should return null for non-existent product version', async () => {
    if (!orm) return;

    const tree = await provider.getBomTree('nonexistent_v1');

    expect(tree).toBeNull();
  });

  // Additional tests would require seeding BOM data
  // which depends on your BOM entity structure
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test src/services/mikro-orm-bom-provider.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the provider**

```typescript
// packages/database/src/services/mikro-orm-bom-provider.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import type { BomNode, BomProvider } from './rollup-engine.service.js';
import { ProductVersion } from '../entities/ProductVersion.js';
import { AttributeSource, type AttributeValue } from '../types/attribute-value.js';

/**
 * MikroORM implementation of BomProvider.
 *
 * Loads BOM tree from ProductVersion and its BOM entries.
 */
export class MikroOrmBomProvider implements BomProvider {
  constructor(
    private readonly em: EntityManager,
    private readonly tenantSchema: string,
  ) {}

  /**
   * Get BOM tree for a product version.
   *
   * Recursively loads all BOM entries and their product versions.
   */
  async getBomTree(productVersionId: string): Promise<BomNode | null> {
    const em = this.em.fork();
    em.schema = this.tenantSchema;

    const version = await em.findOne(ProductVersion, { id: productVersionId });
    if (!version) {
      return null;
    }

    return this.buildNode(version, 1, em);
  }

  private async buildNode(
    version: ProductVersion,
    quantity: number,
    em: EntityManager,
  ): Promise<BomNode> {
    // Extract attributes from version data
    const data = version.data as { attributes?: Record<string, AttributeValue> } | null;
    const attributes = data?.attributes ?? {};

    // Get BOM entries for this version
    // Note: This assumes you have a BomEntry entity or similar
    // For now, we'll use a simplified approach with version.data.bom
    const bomData = version.data as { bom?: Array<{ productVersionId: string; quantity: number }> } | null;
    const bomEntries = bomData?.bom ?? [];

    const children: BomNode[] = [];

    for (const entry of bomEntries) {
      const childVersion = await em.findOne(ProductVersion, { id: entry.productVersionId });
      if (childVersion) {
        const childNode = await this.buildNode(childVersion, entry.quantity, em);
        children.push(childNode);
      }
    }

    return {
      productVersionId: version.id,
      quantity,
      attributes,
      children,
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test src/services/mikro-orm-bom-provider.test.ts
```

Expected: PASS

**Step 5: Export from services index**

Add to `packages/database/src/services/index.ts`:

```typescript
export { MikroOrmBomProvider } from './mikro-orm-bom-provider.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/services/mikro-orm-bom-provider.ts
git add packages/database/src/services/mikro-orm-bom-provider.test.ts
git add packages/database/src/services/index.ts
git commit -m "feat(database): add MikroOrmBomProvider

- Loads BOM tree from ProductVersion
- Recursively resolves child versions
- Extracts attributes from version data"
```

---

## Task 6.6: Update ProductAttributesRepository with Rollup

**Files:**
- Modify: `apps/api/src/routes/products/attributes-repository.ts`

**Step 1: Implement triggerRollup method**

Add to `MikroOrmProductAttributesRepository`:

```typescript
import {
  RollupEngineService,
  MikroOrmBomProvider,
  UnitConversionService,
} from '@eurocomply/database';

  async triggerRollup(
    productId: string,
    versionId: string,
    keys?: string[],
  ): Promise<Record<string, AttributeValue>> {
    const em = this.orm.em.fork();
    em.schema = this.tenantSchema;

    // Create services
    const unitService = new UnitConversionService(em);
    const unitConverter = {
      convert: async (value: number, fromUnit: string, toUnit: string) =>
        unitService.convert(value, fromUnit, toUnit),
      getBaseUnit: async (system: string) =>
        unitService.getBaseUnitCode(system),
    };

    const templateRepo = {
      findByKey: async (key: string) => {
        const template = await em.findOne(AttributeTemplate, { key });
        if (!template) return null;
        return {
          id: template.id,
          key: template.key,
          type: template.type,
          unitSystem: template.unitSystem,
          rollupMethod: template.rollupMethod,
          weightBasisKey: template.weightBasisKey,
        };
      },
    };

    const bomProvider = new MikroOrmBomProvider(em, this.tenantSchema);

    const rollupEngine = new RollupEngineService(unitConverter, templateRepo, bomProvider);

    // Get keys to calculate
    let keysToCalculate = keys;
    if (!keysToCalculate || keysToCalculate.length === 0) {
      // Get all rollup-enabled attributes for the product's category
      const version = await em.findOneOrFail(ProductVersion, { id: versionId, product: { id: productId } });
      const templates = await em.find(AttributeTemplate, {
        rollupMethod: { $ne: RollupMethod.NONE },
      });
      keysToCalculate = templates.map(t => t.key);
    }

    // Calculate rollups
    const results = await rollupEngine.calculateAllRollups(versionId, keysToCalculate);

    // Convert to attribute values
    const calculatedValues: Record<string, AttributeValue> = {};
    for (const [key, result] of Object.entries(results)) {
      if (result.val !== null) {
        const template = await em.findOne(AttributeTemplate, { key });
        calculatedValues[key] = {
          templateId: template?.id ?? '',
          val: result.val,
          unit: result.unit,
          source: result.source,
          updatedAt: new Date().toISOString(),
          calculationWarning: result.calculationWarning,
        };
      }
    }

    // Update product version with calculated values
    const version = await em.findOneOrFail(ProductVersion, { id: versionId, product: { id: productId } });
    const data = (version.data as { attributes?: Record<string, AttributeValue> } | null) ?? {};
    const existingAttrs = data.attributes ?? {};

    // Merge calculated values (only overwrite CALCULATED source or missing)
    for (const [key, value] of Object.entries(calculatedValues)) {
      const existing = existingAttrs[key];
      if (!existing || existing.source === AttributeSource.CALCULATED) {
        existingAttrs[key] = value;
      }
    }

    version.data = { ...data, attributes: existingAttrs };
    await em.flush();

    return calculatedValues;
  }
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/products/attributes-repository.ts
git commit -m "feat(api): implement triggerRollup in repository

- Uses RollupEngineService for calculations
- Merges with existing attributes
- Respects manual overrides"
```

---

## Task 6.7: Create Rollup E2E Integration Test

**Files:**
- Create: `apps/api/src/routes/products/rollup.e2e.test.ts`

**Step 1: Create integration test**

```typescript
// apps/api/src/routes/products/rollup.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import type { MikroORM } from '@eurocomply/database';
import {
  Product,
  ProductVersion,
  Category,
  CategoryType,
  TargetType,
  AttributeTemplate,
  AttributeType,
  RollupMethod,
  InheritanceRule,
  UnitSystem,
  UnitDefinition,
  AttributeSource,
} from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createProductAttributesRouter } from './attributes.js';
import { MikroOrmProductAttributesRepository } from './attributes-repository.js';

describe('Rollup API E2E', () => {
  let orm: MikroORM;
  let app: Hono;
  const testSchema = 'tenant_rollup_e2e_test';
  let parentId: string;
  let parentVersionId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();

    // Create test schema
    await orm.em.execute(`CREATE SCHEMA IF NOT EXISTS "${testSchema}"`);

    // Seed units
    const em = orm.em.fork();
    const kgm = em.create(UnitDefinition, {
      code: 'KGM',
      name: 'Kilogram',
      symbol: 'kg',
      system: UnitSystem.MASS,
      factor: '1',
      isBase: true,
      isActive: true,
    });
    em.persist(kgm);

    const p1 = em.create(UnitDefinition, {
      code: 'P1',
      name: 'Percent',
      symbol: '%',
      system: UnitSystem.PERCENTAGE,
      factor: '1',
      isBase: true,
      isActive: true,
    });
    em.persist(p1);

    // Seed category
    const category = em.create(Category, {
      name: 'Test',
      path: 'test',
      type: CategoryType.LEAF,
      targetType: TargetType.PRODUCT,
      depth: 0,
      isActive: true,
    });
    em.persist(category);
    await em.flush();

    // Seed attribute templates
    const weightAttr = em.create(AttributeTemplate, {
      key: 'weight',
      name: 'Weight',
      type: AttributeType.NUMBER_UNIT,
      category,
      targetType: TargetType.PRODUCT,
      unitSystem: UnitSystem.MASS,
      rollupMethod: RollupMethod.SUM,
      inheritanceRule: InheritanceRule.INHERIT,
      isActive: true,
      sortOrder: 0,
    });
    em.persist(weightAttr);

    const recycledAttr = em.create(AttributeTemplate, {
      key: 'recycled_content',
      name: 'Recycled Content',
      type: AttributeType.NUMBER_UNIT,
      category,
      targetType: TargetType.PRODUCT,
      unitSystem: UnitSystem.PERCENTAGE,
      rollupMethod: RollupMethod.WEIGHTED_AVG,
      weightBasisKey: 'weight',
      inheritanceRule: InheritanceRule.INHERIT,
      isActive: true,
      sortOrder: 1,
    });
    em.persist(recycledAttr);
    await em.flush();

    // Seed products in tenant schema
    const tenantEm = orm.em.fork();
    tenantEm.schema = testSchema;

    // Create child products
    const child1 = tenantEm.create(Product, { name: 'Child 1', status: 'RELEASED' });
    tenantEm.persist(child1);
    const child1Version = tenantEm.create(ProductVersion, {
      product: child1,
      version: 1,
      data: {
        attributes: {
          weight: {
            templateId: weightAttr.id,
            val: 0.4,
            unit: 'KGM',
            source: AttributeSource.MANUAL,
            updatedAt: new Date().toISOString(),
          },
          recycled_content: {
            templateId: recycledAttr.id,
            val: 80,
            unit: 'P1',
            source: AttributeSource.MANUAL,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });
    tenantEm.persist(child1Version);

    const child2 = tenantEm.create(Product, { name: 'Child 2', status: 'RELEASED' });
    tenantEm.persist(child2);
    const child2Version = tenantEm.create(ProductVersion, {
      product: child2,
      version: 1,
      data: {
        attributes: {
          weight: {
            templateId: weightAttr.id,
            val: 0.1,
            unit: 'KGM',
            source: AttributeSource.MANUAL,
            updatedAt: new Date().toISOString(),
          },
          recycled_content: {
            templateId: recycledAttr.id,
            val: 20,
            unit: 'P1',
            source: AttributeSource.MANUAL,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });
    tenantEm.persist(child2Version);

    // Create parent product with BOM
    const parent = tenantEm.create(Product, { name: 'Parent', status: 'DRAFT' });
    tenantEm.persist(parent);
    const parentVersion = tenantEm.create(ProductVersion, {
      product: parent,
      version: 1,
      data: {
        bom: [
          { productVersionId: child1Version.id, quantity: 2 },
          { productVersionId: child2Version.id, quantity: 1 },
        ],
        attributes: {},
      },
    });
    tenantEm.persist(parentVersion);
    await tenantEm.flush();

    parentId = parent.id;
    parentVersionId = parentVersion.id;

    // Create repository and app
    const repo = new MikroOrmProductAttributesRepository(orm, testSchema);
    app = new Hono();
    const router = new Hono();
    router.route('/:productId/versions/:versionId/attributes', createProductAttributesRouter(repo));
    app.route('/products', router);
  });

  afterAll(async () => {
    if (orm) {
      await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
      await orm.em.fork().nativeDelete(AttributeTemplate, {});
      await orm.em.fork().nativeDelete(Category, {});
      await orm.em.fork().nativeDelete(UnitDefinition, {});
      await teardownTestDb();
    }
  });

  it('should calculate weight SUM from BOM', async () => {
    if (!orm) return;

    const res = await app.request(`/products/${parentId}/versions/${parentVersionId}/attributes/rollup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: ['weight'] }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { data: { weight: { val: number; unit: string } } };
    // child1: 2 * 0.4 = 0.8, child2: 1 * 0.1 = 0.1, total = 0.9
    expect(body.data.weight).toBeDefined();
    expect(body.data.weight.val).toBeCloseTo(0.9, 5);
    expect(body.data.weight.unit).toBe('KGM');
  });

  it('should calculate recycled_content WEIGHTED_AVG from BOM', async () => {
    if (!orm) return;

    const res = await app.request(`/products/${parentId}/versions/${parentVersionId}/attributes/rollup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: ['recycled_content'] }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { data: { recycled_content: { val: number; unit: string } } };
    // Weighted avg: (0.8*80 + 0.1*20) / (0.8+0.1) = 66 / 0.9 ≈ 73.33
    expect(body.data.recycled_content).toBeDefined();
    expect(body.data.recycled_content.val).toBeCloseTo(73.33, 1);
  });
});
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/products/rollup.e2e.test.ts
git commit -m "test(api): add rollup API e2e integration test

- Tests SUM rollup for weight
- Tests WEIGHTED_AVG rollup for recycled_content
- Verifies BOM-based calculations"
```

---

## Phase 6 Complete Checkpoint

At this point, Plan 6 is complete. Verify:

```bash
# Run all tests
pnpm test

# Run rollup-specific tests
cd packages/database && pnpm test src/services/bom-flattener
cd packages/database && pnpm test src/services/rollup-calculator
cd packages/database && pnpm test src/services/rollup-engine
cd apps/api && pnpm test src/routes/products/rollup

# Verify build
pnpm build
```

**Plan 6 Deliverables:**
- [x] BomFlattenerService (tree to flat list with effective quantities)
- [x] RollupCalculatorService (SUM, WEIGHTED_AVG, MAX, MIN, BOOLEAN_AND/OR)
- [x] RollupEngineService (orchestrates flattening + calculation)
- [x] MikroOrmBomProvider (loads BOM from database)
- [x] POST /products/:id/versions/:vid/attributes/rollup route
- [x] Integration with ProductAttributesRepository
- [x] E2E integration tests

---

## Taxonomy Engine Complete

All six plans are now complete:

1. **Plan 1: Units Foundation** - DONE
2. **Plan 2: Category & Attribute Schema** - DONE
3. **Plan 3: Category Service & API** - DONE
4. **Plan 4: Attributes Service & API** - DONE
5. **Plan 5: Product Attribute Values** - DONE
6. **Plan 6: Rollup Engine** - DONE

The Taxonomy Engine is now fully implemented with:
- UNECE unit system with conversion
- Dual-scope categories with LTREE hierarchy
- Category adoption (LIVE_LINK/FORKED)
- Inherited attribute templates
- Product attribute values with dual-storage
- Unit preferences middleware
- BOM-based rollup calculations

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-23 | Initial implementation plan |
