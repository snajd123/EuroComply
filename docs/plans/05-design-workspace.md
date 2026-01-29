# Design Workspace & Taxonomy Engine

**Status:** Active
**Last Updated:** 2026-01-26

---

## 1. Overview

The Design Workspace is where products are "born" - from concept to release-ready technical specifications. It implements full PLM (Product Lifecycle Management) functionality with compliance-first principles, powered by the Taxonomy Engine for industry-agnostic attribute management.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Category-First** | Product creation requires category selection to load correct attributes |
| **Version-Locked** | All changes tied to a design version; RELEASED = immutable |
| **Diff-Before-Release** | System generates change summary before any release |
| **Reason-Coded** | Every status transition requires documented reason |
| **Evidence-Linked** | Documents and facilities attached at version level |
| **Additive Inheritance** | Children can strengthen rules, never weaken |

### Ownership

| Owns | Description |
|------|-------------|
| Categories | Hierarchical product classification with attribute inheritance |
| Attribute templates | Reusable attribute definitions per workspace |
| Design versions | Version lifecycle (DRAFT -> RELEASED) |
| Material library | Reusable materials as product entities |
| BOM relationships | Bill of Materials with facility links |
| Technical documents | CAD, drawings, spec sheets |

---

## 2. Authority Model

| Authority | Design Workspace Capabilities |
|-----------|------------------------------|
| **MANAGER** | Full CRUD, direct release, approve, workspace settings |
| **EDITOR** | Direct release, approve contributors' work |
| **CONTRIBUTOR** | Edit drafts, submit for review (needs approval) |
| **VIEWER** | Read-only access |

---

## 3. Module Architecture

```
+-----------------------------------------------------------------------------+
|                         DESIGN WORKSPACE (PLM)                               |
+-----------------------------------------------------------------------------+
|                                                                              |
|  TAXONOMY ENGINE                                                             |
|  ---------------                                                             |
|  +-------------+  +-------------+  +-------------+                          |
|  | Categories  |  | Attributes  |  |   Units     |                          |
|  |   (LTREE)   |  | (Templates) |  |  (Systems)  |                          |
|  +------+------+  +------+------+  +------+------+                          |
|         |                |                |                                  |
|         +----------------+----------------+                                  |
|                          |                                                   |
|  CORE MODULES            v                                                   |
|  ------------    +---------------+                                           |
|  +-------------+ |   Products    | +-------------+  +-------------+         |
|  |  Material   | |  (Unified)    | |    BOM      |  |  Technical  |         |
|  |   Library   | +-------+-------+ |   Builder   |  |    Specs    |         |
|  +------+------+         |         +------+------+  +------+------+         |
|         |                |                |                |                 |
|         +----------------+----------------+----------------+                 |
|                          |                                                   |
|  INTEGRITY MODULES       v                                                   |
|  -----------------   +---------------------+                                 |
|  +-------------+     |   VERSION MANAGER   |                                 |
|  |   Version   |<--->|  (Diff + Release)   |                                 |
|  | Comparison  |     +----------+----------+                                 |
|  +-------------+                |                                            |
|  +-------------+                |                                            |
|  |   Change    |<---------------+                                            |
|  |  Requests   |                |                                            |
|  +-------------+                |                                            |
|  +-------------+                |                                            |
|  |  Document   |<---------------+                                            |
|  | Attachments |                |                                            |
|  +-------------+                |                                            |
|  +-------------+                |                                            |
|  |  Facility   |<---------------+                                            |
|  |   Links     |                                                             |
|  +-------------+                                                             |
|                                                                              |
+-----------------------------------------------------------------------------+
```

---

## 4. Taxonomy Engine

### 4.1 Product Identity Model

Products evolve through lifecycle stages, each adding identifiers:

| Identifier Type | Requirement | Stage | Purpose |
|-----------------|-------------|-------|---------|
| **System UUID** | Auto | Creation | Internal database relations |
| **Internal ID** | Required | R&D | Human-readable name (e.g., `PROTO-V1-2026`) |
| **SKU** | Optional | Manufacturing | ERP/warehouse sync |
| **GTIN / EAN** | Required for DPP | Commercialization | Retail and compliance |
| **DPP URI** | Generated | DPP Issuance | Permanent web address |

### 4.2 Category Hierarchy (LTREE)

Categories use PostgreSQL LTREE extension for fast hierarchical queries.

```typescript
// src/modules/taxonomy/entities/category.entity.ts
import { Entity, Property, ManyToOne, OneToMany, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';

@Entity({ tableName: 'category' })
@Unique({ properties: ['organization', 'code'] })
export class Category extends BaseEntity {
  @ManyToOne(() => Organization, { nullable: true })
  organization?: Organization; // NULL = system/global category

  @ManyToOne(() => Category, { nullable: true })
  parent?: Category;

  @Property({ length: 50 })
  code!: string; // "APPAREL.TOPS.TSHIRTS"

  @Property({ length: 255 })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ length: 50, nullable: true })
  icon?: string;

  @Property({ type: 'int', default: 0 })
  depth!: number;

  @Index({ type: 'gist' })
  @Property({ columnType: 'ltree' })
  path!: string; // "products.apparel.tops"



  @Property({ default: true })
  isActive!: boolean;

  @OneToMany(() => AttributeTemplate, (attr) => attr.category)
  attributes!: Collection<AttributeTemplate>;
}
```

### 4.3 Attribute Templates

```typescript
// src/modules/taxonomy/entities/attribute-template.entity.ts
import { Entity, Property, ManyToOne, OneToMany, Collection, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';

export enum AttributeType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  NUMBER_UNIT = 'NUMBER_UNIT',
  SELECT_SINGLE = 'SELECT_SINGLE',
  SELECT_MULTI = 'SELECT_MULTI',
  BOOLEAN = 'BOOLEAN',
  DATE = 'DATE',
  RANGE = 'RANGE',
  RICH_TEXT = 'RICH_TEXT',
  FILE = 'FILE',
  COMPOSITE_PCT = 'COMPOSITE_PCT',
  REFERENCE = 'REFERENCE',
  EXTERNAL_URI = 'EXTERNAL_URI',
}

export enum UnitSystem {
  MASS = 'MASS',
  LENGTH = 'LENGTH',
  AREA = 'AREA',
  VOLUME = 'VOLUME',
  ENERGY = 'ENERGY',
  TEMPERATURE = 'TEMPERATURE',
  PERCENTAGE = 'PERCENTAGE',
  COUNT = 'COUNT',
  TIME = 'TIME',
  CURRENCY = 'CURRENCY',
}

export enum RollupMethod {
  NONE = 'NONE',
  SUM = 'SUM',
  WEIGHTED_AVG = 'WEIGHTED_AVG',
  BOOLEAN_OR = 'BOOLEAN_OR',
  BOOLEAN_AND = 'BOOLEAN_AND',
  COLLECTION = 'COLLECTION',
  MIN = 'MIN',
  MAX = 'MAX',
}

export enum WorkspaceType {
  DESIGN = 'DESIGN',
  OPERATIONS = 'OPERATIONS',
  MARKETING = 'MARKETING',
  COMPLIANCE = 'COMPLIANCE',
}

@Entity({ tableName: 'attribute_template' })
@Unique({ properties: ['category', 'code'] })
export class AttributeTemplate extends BaseEntity {
  @ManyToOne(() => Category)
  category!: Category;

  @Property({ length: 100 })
  code!: string;

  @Property({ length: 255 })
  label!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Enum(() => AttributeType)
  type!: AttributeType;

  @Enum({ items: () => UnitSystem, nullable: true })
  unitSystem?: UnitSystem;

  @Property({ default: false })
  isRequired!: boolean;

  @Property({ default: true })
  isInherited!: boolean;

  @Property({ default: true })
  isVisible!: boolean;

  @Enum(() => WorkspaceType)
  @Index()
  workspace!: WorkspaceType;

  @Property({ type: 'jsonb', nullable: true })
  constraints?: Record<string, unknown>;

  @Property({ type: 'int', default: 0 })
  displayOrder!: number;

  @Enum({ items: () => RollupMethod, default: RollupMethod.NONE })
  rollupMethod!: RollupMethod;

  @Property({ length: 100, nullable: true })
  rollupSource?: string;
}
```

### 4.4 Unit Definitions

```typescript
// src/modules/taxonomy/entities/unit-definition.entity.ts
import { Entity, Property, Enum, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { UnitSystem } from './attribute-template.entity';

@Entity({ tableName: 'unit_definition' })
@Unique({ properties: ['system', 'code'] })
export class UnitDefinition extends BaseEntity {
  @Enum(() => UnitSystem)
  system!: UnitSystem;

  @Property({ length: 20 })
  code!: string; // "kg", "lb"

  @Property({ length: 50 })
  name!: string; // "Kilogram", "Pound"

  @Property({ length: 10 })
  symbol!: string; // "kg", "lb"

  @Property({ type: 'decimal', precision: 20, scale: 10 })
  toBase!: string; // Conversion factor to base unit

  @Property({ default: false })
  isBase!: boolean;
}
```

### 4.5 Attribute Inheritance Rules

| Constraint | Parent -> Child Rule |
|------------|---------------------|
| `isRequired` | Can upgrade (false->true), never downgrade |
| `type` | Locked forever |
| `constraints` | Can strengthen, never weaken |
| `isVisible` | Child can hide in UI, but data persists |

```typescript
// src/modules/taxonomy/services/attribute-inheritance.service.ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { AttributeTemplate, Category } from '../entities';

@Injectable()
export class AttributeInheritanceService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Get all attributes for a category including inherited ones.
   * Children cannot weaken parent constraints.
   */
  async getEffectiveAttributes(categoryId: string): Promise<AttributeTemplate[]> {
    const category = await this.em.findOneOrFail(Category, categoryId, {
      populate: ['parent'],
    });

    // Get all ancestor categories using path
    const ancestors = await this.em.find(
      Category,
      { path: { $contained: category.path.split('.').slice(0, -1).join('.') } },
      { orderBy: { depth: 'ASC' } }
    );

    const attributeMap = new Map<string, AttributeTemplate>();

    // Process from root to leaf (ancestors first)
    for (const cat of [...ancestors, category]) {
      const attrs = await this.em.find(AttributeTemplate, {
        category: cat.id,
        isInherited: true,
      });

      for (const attr of attrs) {
        const existing = attributeMap.get(attr.code);
        if (existing) {
          // Apply additive inheritance: can only strengthen
          attributeMap.set(attr.code, this.mergeAttribute(existing, attr));
        } else {
          attributeMap.set(attr.code, attr);
        }
      }
    }

    // Add non-inherited attributes from this category only
    const localAttrs = await this.em.find(AttributeTemplate, {
      category: category.id,
      isInherited: false,
    });
    for (const attr of localAttrs) {
      attributeMap.set(attr.code, attr);
    }

    return Array.from(attributeMap.values()).sort(
      (a, b) => a.displayOrder - b.displayOrder
    );
  }

  private mergeAttribute(
    parent: AttributeTemplate,
    child: AttributeTemplate
  ): AttributeTemplate {
    return {
      ...child,
      // Additive: can only become required, not optional
      isRequired: parent.isRequired || child.isRequired,
      // Constraints merge (child strengthens)
      constraints: { ...parent.constraints, ...child.constraints },
    } as AttributeTemplate;
  }
}
```

---

## 5. BOM Builder

### 5.1 User Interface

```
+-----------------------------------------------------------------------------+
|                           BOM BUILDER UI                                     |
+-----------------------------------------------------------------------------+
|                                                                              |
|  +-------------------------------------+  +-------------------------------+  |
|  |         BOM LINE EDITOR             |  |      LIVE ROLL-UP SIDEBAR    |  |
|  +-------------------------------------+  +-------------------------------+  |
|  |                                     |  |                               |  |
|  |  [Search materials/components...]   |  |  TOTAL WEIGHT                |  |
|  |                                     |  |  ########....  2.45 kg        |  |
|  |  +-------------------------------+  |  |                               |  |
|  |  | Material         Qty    Unit  |  |  |  RECYCLED CONTENT             |  |
|  |  +-------------------------------+  |  |  ############.  87.3%         |  |
|  |  | Organic Cotton   0.95   ratio |  |  |                               |  |
|  |  | Elastane         0.05   ratio |  |  |  HAZARDOUS MATERIALS          |  |
|  |  | Brass Zipper     1      pcs   |  |  |  ! None detected              |  |
|  |  | [+ Add component]             |  |  |                               |  |
|  |  +-------------------------------+  |  |  COUNTRIES OF ORIGIN          |  |
|  |                                     |  |  India, China                  |  |
|  |  PRODUCTION PARAMETERS              |  |                               |  |
|  |  +-------------------------------+  |  |  ---------------------------  |  |
|  |  | Scrap Rate:  [ 3.5 ] %        |  |  |  Last updated: Just now       |  |
|  |  | Yield:       [ 96.5 ] %       |  |  |  [Refresh calculations]       |  |
|  |  +-------------------------------+  |  |                               |  |
|  |                                     |  +-------------------------------+  |
|  +-------------------------------------+                                     |
|                                                                              |
+-----------------------------------------------------------------------------+
```

### 5.2 BOM Entry Entity

```typescript
// src/modules/design/entities/bom-entry.entity.ts
import { Entity, Property, ManyToOne, Unique, Index, Check } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Product } from './product.entity';
import { WorkspaceVersion } from './workspace-version.entity';
import { Facility } from '../../operations/entities/facility.entity';

@Entity({ tableName: 'bom_entry' })
@Unique({ properties: ['parentProduct', 'childProduct', 'designVersion'] })
@Check({ expression: 'parent_product_id != child_product_id' })
@Check({ expression: 'scrap_rate_pct >= 0 AND scrap_rate_pct <= 100' })
@Check({ expression: 'yield_pct > 0 AND yield_pct <= 100' })
export class BomEntry extends BaseEntity {
  @ManyToOne(() => Product)
  @Index()
  parentProduct!: Product;

  @ManyToOne(() => Product)
  @Index()
  childProduct!: Product;

  @ManyToOne(() => WorkspaceVersion)
  @Index()
  designVersion!: WorkspaceVersion;

  @Property({ type: 'decimal', precision: 12, scale: 4 })
  quantity!: string;

  @Property({ length: 20 })
  unit!: string;

  @Property({ type: 'decimal', precision: 5, scale: 2, default: '0' })
  scrapRatePct!: string;

  @Property({ type: 'decimal', precision: 5, scale: 2, default: '100' })
  yieldPct!: string;

  @Property({ type: 'int', default: 0 })
  position!: number;

  @Property({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => Facility, { nullable: true })
  @Index()
  facility?: Facility;
}
```

### 5.3 Roll-up Calculation Service (Optimized)

```typescript
// src/modules/design/services/rollup-calculation.service.ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { BomEntry } from '../entities/bom-entry.entity';
import { Product, ProductType } from '../entities/product.entity';
import { ProductAttributeValue } from '../entities/product-attribute-value.entity';
import { AttributeTemplate, RollupMethod } from '../../taxonomy/entities';
import Decimal from 'decimal.js';

export interface RollupResult {
  value: number | boolean | string[];
  unit?: string;
}

export interface RollupSummary {
  totalWeight: RollupResult;
  recycledContent: RollupResult;
  containsHazardous: RollupResult;
  countriesOfOrigin: RollupResult;
}

interface FlattenedBomNode {
  productId: string;
  productName: string;
  productType: ProductType;
  effectiveQuantity: string; // Cumulative quantity through the tree
  yieldPct: string;
  depth: number;
}

@Injectable()
export class RollupCalculationService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Calculate all roll-ups for live sidebar display.
   * Uses bulk fetching and recursive BOM traversal.
   */
  async calculateAllRollups(
    productId: string,
    versionId: string
  ): Promise<RollupSummary> {
    // 1. Flatten the entire BOM tree (handles multi-level)
    const flatBom = await this.flattenBomTree(productId, versionId);

    // 2. Collect all product IDs from the flattened BOM
    const productIds = flatBom.map((node) => node.productId);

    // 3. Bulk fetch ALL attribute values for ALL products in ONE query
    const attributeMap = await this.bulkFetchAttributes(productIds);

    // 4. Calculate roll-ups using the pre-fetched data
    return {
      totalWeight: this.calculateWeightRollup(flatBom, attributeMap),
      recycledContent: this.calculateRecycledContentRollup(flatBom, attributeMap),
      containsHazardous: this.calculateBooleanOrRollup(flatBom, attributeMap, 'is_hazardous'),
      countriesOfOrigin: this.calculateCollectionRollup(flatBom, attributeMap, 'country_of_origin'),
    };
  }

  /**
   * Flatten a multi-level BOM tree into a list with effective quantities.
   * Handles components that have their own BOMs (recursive).
   *
   * Example: Finished Good -> Component (qty: 2) -> Material (qty: 0.5)
   * Effective quantity of Material = 2 * 0.5 = 1.0
   */
  private async flattenBomTree(
    productId: string,
    versionId: string,
    parentQuantity: string = '1',
    depth: number = 0,
    visited: Set<string> = new Set()
  ): Promise<FlattenedBomNode[]> {
    // Prevent circular references
    if (visited.has(productId)) {
      return [];
    }
    visited.add(productId);

    const bomEntries = await this.em.find(
      BomEntry,
      { parentProduct: productId, designVersion: versionId },
      { populate: ['childProduct'] }
    );

    const flatNodes: FlattenedBomNode[] = [];

    for (const entry of bomEntries) {
      const child = entry.childProduct;

      // Calculate effective quantity: parent qty * this entry qty / yield
      const yieldFactor = new Decimal(entry.yieldPct).div(100);
      const effectiveQty = new Decimal(parentQuantity)
        .mul(entry.quantity)
        .div(yieldFactor);

      flatNodes.push({
        productId: child.id,
        productName: child.name,
        productType: child.productType,
        effectiveQuantity: effectiveQty.toString(),
        yieldPct: entry.yieldPct,
        depth,
      });

      // If this child is a COMPONENT, recursively process its BOM
      if (child.productType === ProductType.COMPONENT) {
        // Find the child's current design version
        const childVersion = await this.em.findOne(WorkspaceVersion, {
          product: child.id,
          workspace: 'DESIGN',
          status: 'RELEASED',
        }, { orderBy: { versionNumber: 'DESC' } });

        if (childVersion) {
          const childNodes = await this.flattenBomTree(
            child.id,
            childVersion.id,
            effectiveQty.toString(),
            depth + 1,
            visited
          );
          flatNodes.push(...childNodes);
        }
      }
    }

    return flatNodes;
  }

  /**
   * Bulk fetch all attribute values for a list of products.
   * Returns a Map: productId -> { attributeCode -> value }
   *
   * ONE database query instead of N queries.
   */
  private async bulkFetchAttributes(
    productIds: string[]
  ): Promise<Map<string, Map<string, { val: unknown; unit?: string }>>> {
    if (productIds.length === 0) {
      return new Map();
    }

    // Single query to fetch all attribute values for all products
    const allValues = await this.em.find(
      ProductAttributeValue,
      { product: { $in: productIds } },
      { populate: ['template', 'product'] }
    );

    // Build nested map: productId -> attributeCode -> value
    const result = new Map<string, Map<string, { val: unknown; unit?: string }>>();

    for (const av of allValues) {
      const productId = av.product.id;
      if (!result.has(productId)) {
        result.set(productId, new Map());
      }
      result.get(productId)!.set(av.template.code, av.value as { val: unknown; unit?: string });
    }

    return result;
  }

  /**
   * Calculate total weight using flattened BOM.
   * SUM of (effectiveQuantity * material weight)
   */
  private calculateWeightRollup(
    flatBom: FlattenedBomNode[],
    attributeMap: Map<string, Map<string, { val: unknown; unit?: string }>>
  ): RollupResult {
    let totalWeight = new Decimal(0);

    // Only count RAW_MATERIALs (leaf nodes) to avoid double-counting
    const materials = flatBom.filter((n) => n.productType === ProductType.RAW_MATERIAL);

    for (const node of materials) {
      const attrs = attributeMap.get(node.productId);
      const weightAttr = attrs?.get('weight');

      if (weightAttr?.val && typeof weightAttr.val === 'number') {
        const effectiveWeight = new Decimal(node.effectiveQuantity).mul(weightAttr.val);
        totalWeight = totalWeight.plus(effectiveWeight);
      }
    }

    return { value: totalWeight.toNumber(), unit: 'kg' };
  }

  /**
   * Calculate recycled content percentage using flattened BOM.
   * Weighted average: SUM(weight * recycled%) / SUM(weight)
   */
  private calculateRecycledContentRollup(
    flatBom: FlattenedBomNode[],
    attributeMap: Map<string, Map<string, { val: unknown; unit?: string }>>
  ): RollupResult {
    let totalWeight = new Decimal(0);
    let recycledWeight = new Decimal(0);

    const materials = flatBom.filter((n) => n.productType === ProductType.RAW_MATERIAL);

    for (const node of materials) {
      const attrs = attributeMap.get(node.productId);
      const weightAttr = attrs?.get('weight');
      const recycledAttr = attrs?.get('recycled_content_pct');

      if (weightAttr?.val && typeof weightAttr.val === 'number') {
        const effectiveWeight = new Decimal(node.effectiveQuantity).mul(weightAttr.val);
        totalWeight = totalWeight.plus(effectiveWeight);

        if (recycledAttr?.val && typeof recycledAttr.val === 'number') {
          recycledWeight = recycledWeight.plus(
            effectiveWeight.mul(new Decimal(recycledAttr.val).div(100))
          );
        }
      }
    }

    return {
      value: totalWeight.greaterThan(0)
        ? recycledWeight.div(totalWeight).mul(100).toNumber()
        : 0,
      unit: '%',
    };
  }

  /**
   * Calculate BOOLEAN_OR: true if ANY material has the flag set.
   */
  private calculateBooleanOrRollup(
    flatBom: FlattenedBomNode[],
    attributeMap: Map<string, Map<string, { val: unknown; unit?: string }>>,
    attributeCode: string
  ): RollupResult {
    for (const node of flatBom) {
      const attrs = attributeMap.get(node.productId);
      const attr = attrs?.get(attributeCode);
      if (attr?.val === true) {
        return { value: true };
      }
    }
    return { value: false };
  }

  /**
   * Calculate COLLECTION: unique values from all materials.
   */
  private calculateCollectionRollup(
    flatBom: FlattenedBomNode[],
    attributeMap: Map<string, Map<string, { val: unknown; unit?: string }>>,
    attributeCode: string
  ): RollupResult {
    const values = new Set<string>();

    for (const node of flatBom) {
      const attrs = attributeMap.get(node.productId);
      const attr = attrs?.get(attributeCode);
      if (attr?.val) {
        if (Array.isArray(attr.val)) {
          attr.val.forEach((v) => values.add(String(v)));
        } else {
          values.add(String(attr.val));
        }
      }
    }

    return { value: Array.from(values) };
  }

  /**
   * Generic roll-up calculation with configurable method.
   * Uses bulk-fetched data and flattened BOM.
   */
  async calculateRollup(
    productId: string,
    attributeCode: string,
    method: RollupMethod,
    versionId: string
  ): Promise<RollupResult> {
    if (method === RollupMethod.NONE) {
      const template = await this.em.findOne(AttributeTemplate, { code: attributeCode });
      if (!template) return { value: 0 };

      const value = await this.em.findOne(ProductAttributeValue, {
        product: productId,
        template: template.id,
        version: versionId,
      });
      const val = value?.value as { val: unknown; unit?: string } | undefined;
      return { value: (val?.val as number) ?? 0, unit: val?.unit };
    }

    // Flatten BOM and bulk fetch
    const flatBom = await this.flattenBomTree(productId, versionId);
    const productIds = flatBom.map((n) => n.productId);
    const attributeMap = await this.bulkFetchAttributes(productIds);

    switch (method) {
      case RollupMethod.SUM:
        return this.calculateSumRollup(flatBom, attributeMap, attributeCode);
      case RollupMethod.WEIGHTED_AVG:
        return this.calculateWeightedAvgRollup(flatBom, attributeMap, attributeCode);
      case RollupMethod.BOOLEAN_OR:
        return this.calculateBooleanOrRollup(flatBom, attributeMap, attributeCode);
      case RollupMethod.BOOLEAN_AND:
        return this.calculateBooleanAndRollup(flatBom, attributeMap, attributeCode);
      case RollupMethod.COLLECTION:
        return this.calculateCollectionRollup(flatBom, attributeMap, attributeCode);
      case RollupMethod.MIN:
        return this.calculateMinRollup(flatBom, attributeMap, attributeCode);
      case RollupMethod.MAX:
        return this.calculateMaxRollup(flatBom, attributeMap, attributeCode);
      default:
        return { value: 0 };
    }
  }

  private calculateSumRollup(
    flatBom: FlattenedBomNode[],
    attributeMap: Map<string, Map<string, { val: unknown; unit?: string }>>,
    attributeCode: string
  ): RollupResult {
    let sum = new Decimal(0);
    const materials = flatBom.filter((n) => n.productType === ProductType.RAW_MATERIAL);

    for (const node of materials) {
      const attrs = attributeMap.get(node.productId);
      const attr = attrs?.get(attributeCode);
      if (attr?.val && typeof attr.val === 'number') {
        sum = sum.plus(new Decimal(node.effectiveQuantity).mul(attr.val));
      }
    }

    return { value: sum.toNumber() };
  }

  private calculateWeightedAvgRollup(
    flatBom: FlattenedBomNode[],
    attributeMap: Map<string, Map<string, { val: unknown; unit?: string }>>,
    attributeCode: string
  ): RollupResult {
    let totalQty = new Decimal(0);
    let weightedSum = new Decimal(0);
    const materials = flatBom.filter((n) => n.productType === ProductType.RAW_MATERIAL);

    for (const node of materials) {
      const qty = new Decimal(node.effectiveQuantity);
      totalQty = totalQty.plus(qty);

      const attrs = attributeMap.get(node.productId);
      const attr = attrs?.get(attributeCode);
      if (attr?.val && typeof attr.val === 'number') {
        weightedSum = weightedSum.plus(qty.mul(attr.val));
      }
    }

    return {
      value: totalQty.greaterThan(0) ? weightedSum.div(totalQty).toNumber() : 0,
      unit: '%',
    };
  }

  private calculateBooleanAndRollup(
    flatBom: FlattenedBomNode[],
    attributeMap: Map<string, Map<string, { val: unknown; unit?: string }>>,
    attributeCode: string
  ): RollupResult {
    if (flatBom.length === 0) return { value: false };

    for (const node of flatBom) {
      const attrs = attributeMap.get(node.productId);
      const attr = attrs?.get(attributeCode);
      if (attr?.val !== true) {
        return { value: false };
      }
    }
    return { value: true };
  }

  private calculateMinRollup(
    flatBom: FlattenedBomNode[],
    attributeMap: Map<string, Map<string, { val: unknown; unit?: string }>>,
    attributeCode: string
  ): RollupResult {
    let min = Infinity;

    for (const node of flatBom) {
      const attrs = attributeMap.get(node.productId);
      const attr = attrs?.get(attributeCode);
      if (attr?.val && typeof attr.val === 'number' && attr.val < min) {
        min = attr.val;
      }
    }

    return { value: min === Infinity ? 0 : min };
  }

  private calculateMaxRollup(
    flatBom: FlattenedBomNode[],
    attributeMap: Map<string, Map<string, { val: unknown; unit?: string }>>,
    attributeCode: string
  ): RollupResult {
    let max = -Infinity;

    for (const node of flatBom) {
      const attrs = attributeMap.get(node.productId);
      const attr = attrs?.get(attributeCode);
      if (attr?.val && typeof attr.val === 'number' && attr.val > max) {
        max = attr.val;
      }
    }

    return { value: max === -Infinity ? 0 : max };
  }
}
```

### 5.7 Substance Declarations & Rollup

Materials (products with `targetType: MATERIAL`) can have **substance declarations** that track chemical composition for regulatory compliance (REACH, RoHS).

#### Substance Declaration UI (Material Detail View)

```
+-----------------------------------------------------------------------------+
|                    MATERIAL: Elastane Fiber v2.0                             |
+-----------------------------------------------------------------------------+
|                                                                              |
|  ATTRIBUTES                           SUBSTANCE DECLARATIONS    [+ Add]     |
|  +-------------------------------+    +----------------------------------+  |
|  | Weight: 50g/m²                |    | CAS 127-19-5 | DMAC | 8.0% w/w  |  |
|  | Tensile Strength: 450 MPa     |    | ⚠️ SVHC | ⚠️ Auth Required        |  |
|  | Origin: Germany               |    | Verified: J.Smith | 2024-01-15  |  |
|  +-------------------------------+    |                    [Edit][Remove]|  |
|                                       +----------------------------------+  |
|                                       | CAS 111-76-2 | 2-Butoxyethanol  |  |
|                                       | 0.5% w/w | ✓ Not regulated       |  |
|                                       | Verified: J.Doe | 2024-01-10     |  |
|                                       |                    [Edit][Remove]|  |
|                                       +----------------------------------+  |
+-----------------------------------------------------------------------------+
```

#### Add Substance Modal

```
+-----------------------------------------------------------------------------+
|                       ADD SUBSTANCE DECLARATION                              |
+-----------------------------------------------------------------------------+
|                                                                              |
|  Search: [dimethyl                         ] 🔍                              |
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  | CAS 127-19-5 | N,N-Dimethylacetamide (DMAC)                           |  |
|  | ⚠️ SVHC Candidate | ⚠️ Authorization Required | Sunset: 2025-02-28    |  |
|  |                                                            [Select]   |  |
|  +-----------------------------------------------------------------------+  |
|  | CAS 68-12-2 | N,N-Dimethylformamide (DMF)                             |  |
|  | ⚠️ SVHC Candidate                                                      |  |
|  |                                                            [Select]   |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  Selected: CAS 127-19-5 (DMAC)                                              |
|                                                                              |
|  Concentration: [ 8.0    ] % w/w                                            |
|  ☑ Intentionally added (vs. impurity)                                       |
|                                                                              |
|  Verification Source:                                                        |
|  [ Supplier SDS dated 2024-01-15, Rev 3.2                              ]    |
|                                                                              |
|                                      [Cancel]  [Add Declaration]            |
+-----------------------------------------------------------------------------+
```

#### BOM Builder - Substance Rollup

When building a product BOM, substances from all materials roll up with calculated effective concentrations:

```
+-----------------------------------------------------------------------------+
|                           BOM BUILDER - SUBSTANCES                           |
+-----------------------------------------------------------------------------+
|                                                                              |
|  BILL OF MATERIALS                    |  ROLLED-UP SUBSTANCES               |
|  +-------------------------------+    |  +-------------------------------+  |
|  | Organic Cotton v1.0    95%    |    |  | ⚠️ 1 FLAGGED SUBSTANCE         |  |
|  | └── Substances: None ✓        |    |  +-------------------------------+  |
|  +-------------------------------+    |  | DMAC (CAS 127-19-5)           |  |
|  | Elastane Fiber v2.0    5%     |    |  | Effective: 0.4% w/w           |  |
|  | └── Substances: 2 declared    |    |  | ⚠️ SVHC > 0.1% threshold       |  |
|  |     ├── DMAC: 8.0%            |    |  | Source: Elastane (5% × 8%)    |  |
|  |     └── 2-Butoxyethanol: 0.5% |    |  +-------------------------------+  |
|  +-------------------------------+    |  | 2-Butoxyethanol               |  |
|                                       |  | Effective: 0.025% w/w         |  |
|                                       |  | ✓ Below thresholds            |  |
|                                       |  +-------------------------------+  |
|                                       |                                     |
|                                       |  [View Full Substance Report]       |
+-----------------------------------------------------------------------------+
```

#### Calculation Formula

```
effectiveConcentration = bomSharePct × substanceConcentrationPct

Example:
- Elastane is 5% of product by weight
- DMAC is 8% of Elastane
- Effective DMAC in product = 5% × 8% = 0.4%
- SVHC threshold is 0.1%
- 0.4% > 0.1% → Declaration required per REACH Article 33
```

#### Integration with Regulatory Advisor

When substance rollup detects issues, findings appear in PreFlight:

```
PreFlight Check: Summer T-Shirt v1.0
─────────────────────────────────────
⚠️ WARNING: SVHC Declaration Required
   Substance: N,N-Dimethylacetamide (DMAC)
   CAS: 127-19-5
   Effective Concentration: 0.4% w/w
   Threshold: 0.1% w/w (REACH Article 33)

   Required Action: Include SVHC declaration in product documentation
   Legal Reference: REACH Article 33 - Duty to communicate

   [Acknowledge & Continue] [View Substance Details]
```

---

## 6. Diff Engine (Release Gateway)

### 6.1 Diff Display

```
+-----------------------------------------------------------------------------+
|                    DIFF ENGINE - RELEASE GATEWAY                             |
+-----------------------------------------------------------------------------+
|                                                                              |
|  COMPARING: v2.0 (DRAFT) -> v1.0 (RELEASED)                                  |
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  | !! HIGH-IMPACT CHANGES (Requires acknowledgment)                      |  |
|  +-----------------------------------------------------------------------+  |
|  |  X contains_hazardous: false -> TRUE                                  |  |
|  |    Impact: Product now requires REACH compliance documentation        |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  | ATTRIBUTE CHANGES                                                      |  |
|  +-----------------------------------------------------------------------+  |
|  | Attribute              | Old Value      | New Value      | Delta      |  |
|  |------------------------+----------------+----------------+------------|  |
|  | weight                 | 2.40 kg        | 2.45 kg        | +2.1%      |  |
|  | recycled_content_pct   | 85.0%          | 87.3%          | +2.3%      |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  | BOM CHANGES                                                            |  |
|  +-----------------------------------------------------------------------+  |
|  | + ADDED:   Recycled Polyester (5%, 0.12 kg)                           |  |
|  | - REMOVED: Elastane (was 5%)                                           |  |
|  | ~ MODIFIED: Organic Cotton (95% -> 93%, scrap 3% -> 3.5%)             |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
+-----------------------------------------------------------------------------+
```

### 6.2 High-Impact Attribute Entity

```typescript
// src/modules/design/entities/high-impact-attribute.entity.ts
import { Entity, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';

export enum ImpactLevel {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
}

@Entity({ tableName: 'high_impact_attribute' })
@Unique({ properties: ['attributeCode'] })
export class HighImpactAttribute extends BaseEntity {
  @Property({ length: 100 })
  attributeCode!: string;

  @Property({ length: 20 })
  impactLevel!: ImpactLevel;

  @Property({ type: 'text' })
  alertMessage!: string;

  @Property({ default: true })
  requiresAck!: boolean;
}
```

### 6.3 Version Release Entity

```typescript
// src/modules/design/entities/version-release.entity.ts
import { Entity, Property, ManyToOne, Unique, Check } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { WorkspaceVersion } from './workspace-version.entity';
import { User } from '../../auth/entities/user.entity';

export enum ChangeCode {
  MATERIAL_SUBSTITUTION = 'MATERIAL_SUBSTITUTION',
  COST_OPTIMIZATION = 'COST_OPTIMIZATION',
  REGULATORY_COMPLIANCE = 'REGULATORY_COMPLIANCE',
  QUALITY_IMPROVEMENT = 'QUALITY_IMPROVEMENT',
  SUPPLIER_CHANGE = 'SUPPLIER_CHANGE',
  DESIGN_CORRECTION = 'DESIGN_CORRECTION',
  CUSTOMER_REQUEST = 'CUSTOMER_REQUEST',
  OTHER = 'OTHER',
}

@Entity({ tableName: 'version_release' })
@Unique({ properties: ['version'] })
@Check({ name: 'release_requires_narrative', expression: 'LENGTH(narrative) >= 10' })
@Check({ name: 'release_no_blockers', expression: 'blocker_count = 0' })
export class VersionRelease extends BaseEntity {
  @ManyToOne(() => WorkspaceVersion)
  version!: WorkspaceVersion;

  @Property({ type: 'jsonb' })
  diffSnapshot!: Record<string, unknown>;

  @Property({ length: 50 })
  changeCode!: ChangeCode;

  @Property({ type: 'text' })
  narrative!: string;

  @Property({ default: false })
  highImpactAck!: boolean;

  @Property({ type: 'int', default: 0 })
  blockerCount!: number;

  @Property({ type: 'int', default: 0 })
  warningCount!: number;

  @ManyToOne(() => User)
  releasedBy!: User;

  @Property()
  releasedAt!: Date;

  @Property({ length: 255 })
  signatureDid!: string;

  @Property({ type: 'text' })
  signatureJws!: string;
}
```

### 6.4 Diff Calculation Service (Optimized)

```typescript
// src/modules/design/services/diff-calculation.service.ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { WorkspaceVersion } from '../entities/workspace-version.entity';
import { BomEntry } from '../entities/bom-entry.entity';
import { ProductAttributeValue } from '../entities/product-attribute-value.entity';
import { HighImpactAttribute, ImpactLevel } from '../entities/high-impact-attribute.entity';
import { AttributeTemplate } from '../../taxonomy/entities';
import { Product } from '../entities/product.entity';

export interface AttributeChange {
  code: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
  delta?: string;
  type: 'ADDED' | 'REMOVED' | 'MODIFIED';
}

export interface BomChange {
  materialId: string;
  materialName: string;
  oldQuantity?: string;
  newQuantity?: string;
  oldUnit?: string;
  newUnit?: string;
  type: 'ADDED' | 'REMOVED' | 'MODIFIED';
}

export interface HighImpactAlert {
  attributeCode: string;
  impactLevel: ImpactLevel;
  alertMessage: string;
  requiresAck: boolean;
  oldValue: unknown;
  newValue: unknown;
}

export interface ValidationError {
  type: 'MISSING_ATTRIBUTE' | 'INVALID_VALUE' | 'MISSING_DOCUMENT' | 'BOM_INCOMPLETE';
  severity: 'BLOCKER' | 'WARNING';
  entityType: 'product' | 'material' | 'bom_entry';
  entityId: string;
  entityName: string;
  field: string;
  message: string;
}

export interface VersionDiff {
  attributes: AttributeChange[];
  bom: BomChange[];
  documents: unknown[];
  highImpact: HighImpactAlert[];
  validationErrors: ValidationError[];
  canRelease: boolean;
}

@Injectable()
export class DiffCalculationService {
  constructor(private readonly em: EntityManager) {}

  async calculateDiff(
    currentVersionId: string,
    previousVersionId: string | null
  ): Promise<VersionDiff> {
    const current = await this.getVersionSnapshot(currentVersionId);
    const previous = previousVersionId
      ? await this.getVersionSnapshot(previousVersionId)
      : null;

    const attributes = previous
      ? this.diffAttributes(current.attributes, previous.attributes)
      : current.attributes.map((a) => ({ ...a, type: 'ADDED' as const }));

    const bom = previous
      ? this.diffBom(current.bom, previous.bom)
      : current.bom.map((b) => ({ ...b, type: 'ADDED' as const }));

    const documents = previous
      ? this.diffDocuments(current.documents, previous.documents)
      : current.documents.map((d) => ({ ...d, type: 'ADDED' }));

    const highImpact = await this.checkHighImpact(
      current.attributes,
      previous?.attributes
    );
    const validationErrors = await this.validateVersionCompleteness(currentVersionId);

    const blockers = validationErrors.filter((e) => e.severity === 'BLOCKER');

    return {
      attributes,
      bom,
      documents,
      highImpact,
      validationErrors,
      canRelease: blockers.length === 0,
    };
  }

  /**
   * Validate version completeness with bulk queries to avoid N+1.
   */
  async validateVersionCompleteness(versionId: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    const version = await this.em.findOneOrFail(WorkspaceVersion, versionId, {
      populate: ['product', 'product.category'],
    });
    const product = version.product;

    // 1. Get all BOM entries and their materials in one query
    const bomEntries = await this.em.find(
      BomEntry,
      { parentProduct: product.id, designVersion: versionId },
      { populate: ['childProduct', 'childProduct.category', 'facility'] }
    );

    // 2. Collect all product IDs (main product + all BOM materials)
    const allProductIds = [product.id, ...bomEntries.map((e) => e.childProduct.id)];

    // 3. Collect all category IDs
    const categoryIds = new Set<string>();
    categoryIds.add(product.category.id);
    bomEntries.forEach((e) => categoryIds.add(e.childProduct.category.id));

    // 4. Bulk fetch all required attribute templates for these categories
    const requiredTemplates = await this.em.find(AttributeTemplate, {
      category: { $in: Array.from(categoryIds) },
      workspace: 'DESIGN',
      isRequired: true,
    });

    // 5. Bulk fetch all attribute values for all products in ONE query
    const allValues = await this.em.find(ProductAttributeValue, {
      product: { $in: allProductIds },
      version: versionId,
    }, { populate: ['template', 'product'] });

    // Build lookup: productId -> Set of template codes that have values
    const valuesByProduct = new Map<string, Set<string>>();
    for (const val of allValues) {
      const prodId = val.product.id;
      if (!valuesByProduct.has(prodId)) {
        valuesByProduct.set(prodId, new Set());
      }
      valuesByProduct.get(prodId)!.add(val.template.code);
    }

    // Build lookup: categoryId -> required template codes
    const requiredByCategory = new Map<string, AttributeTemplate[]>();
    for (const tmpl of requiredTemplates) {
      const catId = tmpl.category.id;
      if (!requiredByCategory.has(catId)) {
        requiredByCategory.set(catId, []);
      }
      requiredByCategory.get(catId)!.push(tmpl);
    }

    // 6. Check main product has all required attributes
    const productRequired = requiredByCategory.get(product.category.id) || [];
    const productValues = valuesByProduct.get(product.id) || new Set();

    for (const attr of productRequired) {
      if (!productValues.has(attr.code)) {
        errors.push({
          type: 'MISSING_ATTRIBUTE',
          severity: 'WARNING',
          entityType: 'product',
          entityId: product.id,
          entityName: product.name,
          field: attr.code,
          message: `Required attribute "${attr.label}" is missing`,
        });
      }
    }

    // 7. Check all BOM materials have required attributes
    for (const entry of bomEntries) {
      const material = entry.childProduct;
      const materialRequired = requiredByCategory.get(material.category.id) || [];
      const materialValues = valuesByProduct.get(material.id) || new Set();

      for (const attr of materialRequired) {
        if (!materialValues.has(attr.code)) {
          errors.push({
            type: 'MISSING_ATTRIBUTE',
            severity: 'WARNING',
            entityType: 'material',
            entityId: material.id,
            entityName: material.name,
            field: attr.code,
            message: `Material "${material.name}" missing required "${attr.label}"`,
          });
        }
      }

      // 8. Check facility links for regulated materials
      await this.validateFacilityLinks(entry, material, errors);
    }

    return errors;
  }

  private async validateFacilityLinks(
    entry: BomEntry,
    material: Product,
    errors: ValidationError[]
  ): Promise<void> {
    // Check if category has regulations requiring traceability via CategoryRegulation
    const categoryRegulations = await this.em.find(
      CategoryRegulation,
      { category: { path: { $ancestor: material.category.path } } },
      { populate: ['regulation'] }
    );

    const requiresTraceability = categoryRegulations.some(cr =>
      ['CONFLICT_MINERALS', 'EUDR', 'REACH'].includes(cr.regulation.code)
    );

    if (requiresTraceability && !entry.facility) {
      errors.push({
        type: 'BOM_INCOMPLETE',
        severity: 'BLOCKER',
        entityType: 'bom_entry',
        entityId: entry.id,
        entityName: material.name,
        field: 'facility_id',
        message: `"${material.name}" requires facility-level traceability`,
      });
    }
  }

  private async checkHighImpact(
    current: AttributeChange[],
    previous?: AttributeChange[]
  ): Promise<HighImpactAlert[]> {
    const alerts: HighImpactAlert[] = [];
    const highImpactAttrs = await this.em.find(HighImpactAttribute, {});

    for (const attr of highImpactAttrs) {
      const currentAttr = current.find((a) => a.code === attr.attributeCode);
      const previousAttr = previous?.find((a) => a.code === attr.attributeCode);

      if (currentAttr && JSON.stringify(currentAttr.newValue) !== JSON.stringify(previousAttr?.newValue)) {
        alerts.push({
          attributeCode: attr.attributeCode,
          impactLevel: attr.impactLevel as ImpactLevel,
          alertMessage: attr.alertMessage,
          requiresAck: attr.requiresAck,
          oldValue: previousAttr?.newValue,
          newValue: currentAttr.newValue,
        });
      }
    }

    return alerts;
  }

  private async getVersionSnapshot(versionId: string): Promise<{
    attributes: AttributeChange[];
    bom: BomChange[];
    documents: unknown[];
  }> {
    const version = await this.em.findOneOrFail(WorkspaceVersion, versionId, {
      populate: ['product'],
    });

    const attributeValues = await this.em.find(ProductAttributeValue, {
      product: version.product.id,
      version: versionId,
    }, { populate: ['template'] });

    const bomEntries = await this.em.find(BomEntry, {
      parentProduct: version.product.id,
      designVersion: versionId,
    }, { populate: ['childProduct'] });

    return {
      attributes: attributeValues.map((av) => ({
        code: av.template.code,
        label: av.template.label,
        oldValue: null,
        newValue: av.value,
        type: 'ADDED' as const,
      })),
      bom: bomEntries.map((be) => ({
        materialId: be.childProduct.id,
        materialName: be.childProduct.name,
        newQuantity: be.quantity,
        newUnit: be.unit,
        type: 'ADDED' as const,
      })),
      documents: [],
    };
  }

  private diffAttributes(
    current: AttributeChange[],
    previous: AttributeChange[]
  ): AttributeChange[] {
    const changes: AttributeChange[] = [];
    const previousMap = new Map(previous.map((p) => [p.code, p]));

    for (const curr of current) {
      const prev = previousMap.get(curr.code);
      if (!prev) {
        changes.push({ ...curr, type: 'ADDED' });
      } else if (JSON.stringify(curr.newValue) !== JSON.stringify(prev.newValue)) {
        changes.push({
          ...curr,
          oldValue: prev.newValue,
          type: 'MODIFIED',
          delta: this.calculateDelta(prev.newValue, curr.newValue),
        });
        previousMap.delete(curr.code);
      } else {
        previousMap.delete(curr.code);
      }
    }

    for (const [, removed] of previousMap) {
      changes.push({ ...removed, type: 'REMOVED' });
    }

    return changes;
  }

  private diffBom(current: BomChange[], previous: BomChange[]): BomChange[] {
    const changes: BomChange[] = [];
    const previousMap = new Map(previous.map((p) => [p.materialId, p]));

    for (const curr of current) {
      const prev = previousMap.get(curr.materialId);
      if (!prev) {
        changes.push({ ...curr, type: 'ADDED' });
      } else if (curr.newQuantity !== prev.newQuantity || curr.newUnit !== prev.newUnit) {
        changes.push({
          ...curr,
          oldQuantity: prev.newQuantity,
          oldUnit: prev.newUnit,
          type: 'MODIFIED',
        });
        previousMap.delete(curr.materialId);
      } else {
        previousMap.delete(curr.materialId);
      }
    }

    for (const [, removed] of previousMap) {
      changes.push({ ...removed, type: 'REMOVED' });
    }

    return changes;
  }

  private diffDocuments(current: unknown[], previous: unknown[]): unknown[] {
    return [];
  }

  private calculateDelta(oldVal: unknown, newVal: unknown): string | undefined {
    if (typeof oldVal === 'number' && typeof newVal === 'number' && oldVal !== 0) {
      const pct = ((newVal - oldVal) / oldVal) * 100;
      return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
    }
    return undefined;
  }
}
```

---

## 7. Document Attachments

### 7.1 Principles

| Principle | Implementation |
|-----------|----------------|
| **Version-Locked** | Documents attached to v1.0 stay with v1.0 forever |
| **Inheritable** | v2.0 can reference v1.0 docs or upload new ones |
| **Visibility Tags** | PUBLIC (DPP), INTERNAL (org only), AUDIT (regulators) |

### 7.2 Document Entities

```typescript
// src/modules/design/entities/document.entity.ts
import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { User } from '../../auth/entities/user.entity';

export enum DocumentVisibility {
  PUBLIC = 'PUBLIC',     // Included in DPP
  INTERNAL = 'INTERNAL', // Organization only
  AUDIT = 'AUDIT',       // Regulators on request
}

export enum DocumentType {
  // Technical (Design workspace)
  TECHNICAL_DRAWING = 'TECHNICAL_DRAWING',
  CAD_FILE = 'CAD_FILE',
  SPECIFICATION_SHEET = 'SPECIFICATION_SHEET',
  // Compliance (cross-workspace)
  DECLARATION_OF_CONFORMITY = 'DECLARATION_OF_CONFORMITY',
  LAB_TEST_REPORT = 'LAB_TEST_REPORT',
  CERTIFICATION = 'CERTIFICATION',
  REACH_DECLARATION = 'REACH_DECLARATION',
  CONFLICT_MINERALS_REPORT = 'CONFLICT_MINERALS_REPORT',
  // Marketing
  PRODUCT_IMAGE = 'PRODUCT_IMAGE',
  LIFESTYLE_IMAGE = 'LIFESTYLE_IMAGE',
  USER_MANUAL = 'USER_MANUAL',
  CARE_INSTRUCTIONS = 'CARE_INSTRUCTIONS',
}

@Entity({ tableName: 'document' })
export class Document extends BaseEntity {
  @ManyToOne(() => Organization)
  @Index()
  organization!: Organization;

  @Property({ length: 255 })
  filename!: string;

  @Property({ length: 100 })
  mimeType!: string;

  @Property({ type: 'bigint' })
  sizeBytes!: string;

  @Property({ length: 500 })
  r2Path!: string;

  @Property({ length: 64 })
  checksumSha256!: string;

  @Enum(() => DocumentType)
  @Index()
  documentType!: DocumentType;

  @Enum({ items: () => DocumentVisibility, default: DocumentVisibility.INTERNAL })
  visibility!: DocumentVisibility;

  @ManyToOne(() => User)
  uploadedBy!: User;

  @Property()
  uploadedAt!: Date;

  @Property({ type: 'date', nullable: true })
  validFrom?: Date;

  @Property({ type: 'date', nullable: true })
  @Index()
  validUntil?: Date;
}
```

```typescript
// src/modules/design/entities/version-document.entity.ts
import { Entity, Property, ManyToOne, Unique, Index } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { WorkspaceVersion } from './workspace-version.entity';
import { Document } from './document.entity';
import { User } from '../../auth/entities/user.entity';

@Entity({ tableName: 'version_document' })
@Unique({ properties: ['version', 'document'] })
export class VersionDocument extends BaseEntity {
  @ManyToOne(() => WorkspaceVersion)
  @Index()
  version!: WorkspaceVersion;

  @ManyToOne(() => Document)
  document!: Document;

  @Property({ default: false })
  isInherited!: boolean;

  @ManyToOne(() => Document, { nullable: true })
  replacedDoc?: Document;

  @ManyToOne(() => User)
  attachedBy!: User;

  @Property()
  attachedAt!: Date;
}
```

---

## 8. Facility Links (Bridge to Operations)

### 8.1 The Traceability Bridge

BOM entries link to **facilities** (not suppliers) for EU-compliant geographic traceability.

```
  DESIGN WORKSPACE              OPERATIONS WORKSPACE
  ----------------              --------------------
  +-------------+               +-----------------+
  |  BOM Entry  |---------------|    Facility     |
  | (material)  |  facility_id  |  (physical)     |
  +-------------+               +--------+--------+
                                         |
                                +--------+--------+
                                |    Supplier     |
                                |  (legal entity) |
                                +--------+--------+
                                         |
                                +--------+--------+
                                | Certifications  |
                                | (facility-level)|
                                +-----------------+
```

---

## 9. API Endpoints

### Categories

```
GET    /api/v1/categories                    # List all (with tree structure)
GET    /api/v1/categories/:id                # Get category with inherited attributes
POST   /api/v1/categories                    # Create category (org-specific)
PUT    /api/v1/categories/:id                # Update category
DELETE /api/v1/categories/:id                # Soft delete
```

### Attribute Templates

```
GET    /api/v1/categories/:id/attributes     # Get all attributes (including inherited)
POST   /api/v1/categories/:id/attributes     # Add attribute to category
PUT    /api/v1/attributes/:id                # Update attribute
DELETE /api/v1/attributes/:id                # Remove attribute
```

### Products

```
GET    /api/v1/design/products               # List products
GET    /api/v1/design/products/:id           # Get product with current version
POST   /api/v1/design/products               # Create product (requires category)
PUT    /api/v1/design/products/:id           # Update product
DELETE /api/v1/design/products/:id           # Archive product
```

### Versions

```
GET    /api/v1/design/products/:id/versions  # List all versions
GET    /api/v1/design/versions/:id           # Get version details
POST   /api/v1/design/products/:id/versions  # Create new draft version
POST   /api/v1/design/versions/:id/checkout  # Checkout version for editing
POST   /api/v1/design/versions/:id/checkin   # Checkin version
```

### BOM

```
GET    /api/v1/design/versions/:id/bom       # Get BOM for version
PUT    /api/v1/design/versions/:id/bom       # Update BOM entries
GET    /api/v1/design/versions/:id/bom/tree  # Get recursive BOM tree
GET    /api/v1/design/versions/:id/rollups   # Calculate all roll-ups
```

### Diff & Release

```
GET    /api/v1/design/versions/:id/diff      # Calculate diff vs previous
GET    /api/v1/design/versions/:id/validate  # Run validation checks
POST   /api/v1/design/versions/:id/release   # Sign and release version
```

### Documents

```
GET    /api/v1/design/versions/:id/documents      # List attached documents
POST   /api/v1/design/versions/:id/documents      # Attach document
DELETE /api/v1/design/versions/:id/documents/:docId # Detach document
POST   /api/v1/design/documents                   # Upload new document
```

### Materials

```
GET    /api/v1/design/materials              # List material library
GET    /api/v1/design/materials/:id          # Get material details
POST   /api/v1/design/materials              # Create material
PUT    /api/v1/design/materials/:id          # Update material
```

---

## 10. Regulatory Advisor Integration

The Design Workspace integrates with the Regulatory Advisor system to provide real-time compliance guidance during product design. This transforms the workspace from a pure data-entry tool into an intelligent design assistant.

> **Full Design:** See [Compliance Evaluation System](../guides/compliance-evaluation-system.md) and [Compliance Architecture](../architecture/compliance-architecture.md) for complete system specification.

> **Feature Toggles:** This integration respects the organization's Regulatory Advisor settings:
> - If `regulatoryAdvisorEnabled = false`: All features in this section are hidden
> - If `enforcementMode = 'SILENT'`: PreFlight runs but shows advisory info only (no gates)
> - If `enforcementMode = 'ENFORCING'`: Full soft gate experience with acknowledgment workflow

### 10.1 Requirement-Based Compliance

The compliance system evaluates products against Requirements linked to Regulations:

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  AttributeTemplate  │────▶│   Requirement    │────▶│   Regulation    │
│  (what to collect)  │     │  (how to check)  │     │ (legal source)  │
└─────────────────────┘     └──────────────────┘     └─────────────────┘
         │                          │                        │
         │                          │                        │
         ▼                          ▼                        ▼
   "Recycled %"              "Min 25%"                "ESPR Art. 5(2)"
                           severity: BLOCKER         PDF highlight link
```

### 10.2 Real-Time Advisory Mode

During editing, the PreFlight service runs in **advisory mode** - providing real-time, non-blocking feedback as designers work. This transforms the experience from "Bouncer" (blocked at gate) to "Advisor" (guided as you work).

**Advisory Characteristics:**
- **Debounced evaluation:** Runs after 500ms of inactivity, not on every keystroke
- **Non-blocking:** Warnings appear inline but don't prevent saving
- **Color-coded fields:** Input fields bordered based on severity

| Severity | Indicator | Field Border | Behavior |
|----------|-----------|--------------|----------|
| BLOCKER | 🔴 Red | Red border | Cannot submit without acknowledging |
| WARNING | 🟠 Amber | Amber border | Can submit, captured in audit trail |
| INFO | 🔵 Blue | Blue border | Informational only, no action required |

When designers save or validate a product version, the PreFlight service evaluates all applicable rules:

```typescript
interface DesignValidationResult {
  versionId: string;
  overallStatus: 'PASS' | 'PASS_WITH_WARNINGS' | 'BLOCKED';

  // Grouped by category for design workspace display
  categoryResults: {
    categoryId: string;
    categoryName: string;
    findings: PreFlightFinding[];
  }[];

  // Summary counts
  blockerCount: number;
  warningCount: number;
  infoCount: number;
}
```

**UI Integration Points:**

1. **Attribute Editor Panel** - Shows rule indicators next to each field
2. **Category Header** - Displays aggregate compliance status
3. **Validation Sidebar** - Lists all findings with deep-links to regulations
4. **Version Release Gate** - Soft gate requiring acknowledgment of blockers

### 10.3 Soft Gate Workflow

When a designer attempts to release a version with compliance issues:

```
┌────────────────────────────────────────────────────────────────────┐
│                     RELEASE GATE - 3 Blockers Found               │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ⛔ BLOCKER: Recycled content below ESPR minimum                   │
│     Current: 18%  Required: ≥25%                                   │
│     📖 View: ESPR Article 5(2)                                     │
│     ┌─────────────────────────────────────────────────────────┐    │
│     │ Reason: [Select or explain why proceeding...]           │    │
│     └─────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ⛔ BLOCKER: Missing hazardous substance declaration               │
│     📖 View: REACH Annex XVII                                      │
│     ┌─────────────────────────────────────────────────────────┐    │
│     │ Reason: [Select or explain why proceeding...]           │    │
│     └─────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ⚠️ WARNING: Carbon footprint exceeds industry benchmark           │
│     Current: 12.5 kg CO₂e  Benchmark: 10.0 kg CO₂e                 │
│     📖 View: PEF Category Rules                                    │
│                                                                     │
├────────────────────────────────────────────────────────────────────┤
│  [ ] I acknowledge these issues and accept responsibility          │
│                                                                     │
│  [Cancel]                              [Proceed with Documentation]│
└────────────────────────────────────────────────────────────────────┘
```

### 10.4 Regulation Viewer Integration

Clicking "📖 View" opens the regulation viewer with the relevant text highlighted:

```typescript
// Launch regulation viewer from design workspace
function openRegulationContext(anchorId: string): void {
  const viewer = new RegulationViewer({
    anchorId,
    mode: 'sidebar',  // Opens as side panel, not full screen
    highlightStyle: 'yellow-background',
    onClose: () => { /* Return focus to attribute editor */ }
  });

  viewer.open();
  viewer.scrollIntoView();  // Smooth scroll to anchored text
}
```

### 10.5 Compliance Status (Read-Only)

The Design Workspace displays compliance status but **does not control rule configuration**.
Profile assignment and rule governance are managed exclusively in the **Compliance Workspace**.

> **Governance:** Only Compliance MANAGER can assign profiles and configure rules.
> Designers see the results but cannot change which rules apply.
> See [Compliance Workspace](./08-compliance-workspace.md) for profile management.

**What Designers See:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Product: Summer T-Shirt v2.1                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Assigned Profile: "ESPR Apparel Pack" (managed by Compliance)              │
│  Profile Version: v2.3                                                      │
│  Last Evaluated: 2026-01-21 14:30                                           │
│                                                                              │
│  Status: ⚠️ PASS_WITH_WARNINGS (45 rules, 2 findings)                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ Finding                        │ Severity │ Status                 │    │
│  ├────────────────────────────────────────────────────────────────────┤    │
│  │ Recycled content: 18%          │ BLOCKER  │ ⚠️ Deviated            │    │
│  │ Carbon footprint: 12.5 kg      │ WARNING  │ ℹ️ Advisory (Silent)   │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  [View All Findings]  [View Regulation]                                     │
│                                                                              │
│  ⓘ To change the assigned profile, contact your Compliance Manager          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**What Designers CAN Do:**
- View compliance status and findings
- Click through to regulation viewer (PDF highlights)
- Acknowledge deviations with reason codes (if rule is ENFORCING)

**What Designers CANNOT Do:**
- Change which profile is assigned to a product
- Change rule enforcement modes (ENFORCING/SILENT/DISABLED)
- Adopt templates from marketplace

### 10.6 Submission Workflow (Approval Gate)

When a designer clicks "Submit for Compliance Review", the system triggers the **Approval Gate** - a decision point that determines whether the version can be auto-released or requires Compliance Manager authorization.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUBMIT FOR COMPLIANCE REVIEW                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Product: Summer T-Shirt                                                     │
│  Version: 2.1 (DRAFT)                                                        │
│                                                                              │
│  PreFlight Status: ⚠️ PASS_WITH_DEVIATIONS                                  │
│  ─────────────────────────────────────────────────────────────               │
│  • 45 rules evaluated                                                        │
│  • 43 passed ✓                                                               │
│  • 2 blockers acknowledged ⚠️                                                │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ Acknowledged Deviations                                              │    │
│  ├────────────────────────────────────────────────────────────────────┤    │
│  │ 🔴 Recycled content: 18% (min 25%)                                  │    │
│  │    Reason: SMALL_VOLUME_EXEMPTION                                   │    │
│  │    "Limited edition run of 500 units for brand anniversary"         │    │
│  │                                                                      │    │
│  │ 🔴 Missing REACH declaration                                        │    │
│  │    Reason: PENDING_SUPPLIER_DATA                                    │    │
│  │    "Waiting on supplier lab results, ETA: 2026-01-25"               │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  [ Cancel ]                                          [ Submit for Review ]   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Submission Outcomes:**

| PreFlight Result | complianceStatus | Version Status | Next Step |
|------------------|------------------|----------------|-----------|
| **PASS** | `AUTO_PASSED` | `RELEASED` | Ready for production |
| **PASS_WITH_DEVIATIONS** | `PENDING_REVIEW` | `DRAFT` | Queued for Compliance Manager |
| **BLOCKED** | N/A (error) | `DRAFT` | Must acknowledge blockers first |

**State Machine:**

```
         NOT_STARTED
              │
              │ Designer submits
              │ PreFlight evaluates
              ▼
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
AUTO_PASSED      PENDING_REVIEW
(RELEASED)            │
                      │ Compliance Manager
                      │ authorizes
                      ▼
                 AUTHORIZED
                 (RELEASED)
```

### 10.7 Legal Context API

Provides legal context for individual attributes, enabling the UI to show linked rules and regulation references inline.

```typescript
interface AttributeLegalContext {
  attributeCode: string;
  attributeLabel: string;
  linkedRequirements: {
    requirementId: string;
    requirementName: string;
    severity: 'BLOCKER' | 'WARNING' | 'INFO';
    legalReference?: {
      reference: string;      // "ESPR Art. 5(2)"
      documentTitle: string;  // "ESPR - Ecodesign for Sustainable Products"
      viewerUrl: string;      // "/regulations/xyz?page=12&anchor=abc"
    };
    handlerConfig?: {
      operator: string;       // ">=", "<=", "contains", "matches"
      threshold?: number;     // e.g., 25 for "≥25%"
      pattern?: string;       // e.g., regex for format validation
    };
  }[];
}
```

**UI Usage:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Recycled Content Percentage                                   🔴 BLOCKER   │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ 18                                                             %      │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Below minimum: requires >=25% per ESPR Art. 5(2)                           │
│     View regulation text                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.8 API Extensions

```
# PreFlight validation for design versions
POST   /api/v1/design/versions/:id/preflight           # Run PreFlight check (blocking)
POST   /api/v1/design/versions/:id/preflight/advisory  # Real-time advisory (non-blocking, debounced)
GET    /api/v1/design/versions/:id/preflight/status    # Get cached status
GET    /api/v1/design/versions/:id/preflight/findings  # List all findings

# Submission workflow (Approval Gate)
POST   /api/v1/design/versions/:id/submit              # Trigger approval gate
GET    /api/v1/design/versions/:id/submission-status   # Get current compliance status

# Legal context for attributes
GET    /api/v1/design/attributes/:code/legal-context   # Get requirements linked to attribute

# Regulation viewer
GET    /api/v1/regulations/anchors/:id/context         # Get anchor with PDF URL
GET    /api/v1/regulations/documents/:id/viewer-url    # Get signed viewer URL
```

---

## 11. Related Documents

| Document | Relationship |
|----------|--------------|
| [Data Model](./02-data-model.md) | Core entities including MaterialSubstance |
| [Security](./03-security.md) | RBAC model |
| [Operations Workspace](./06-operations-workspace.md) | Facilities, suppliers |
| [Marketing Workspace](./07-marketing-workspace.md) | Content enrichment |
| [Compliance Workspace](./08-compliance-workspace.md) | DPP issuance |
| [Verifiable Credentials](./09-verifiable-credentials.md) | Signing |
| [Compliance Evaluation System](../guides/compliance-evaluation-system.md) | Requirement handlers, PreFlight validation |
| [Taxonomy Plan 5 - Category Service](./2026-01-26-taxonomy-05-category-service.md) | Category LTREE hierarchy |
| [Taxonomy Plan 6 - Attribute Service](./2026-01-26-taxonomy-06-attribute-service.md) | AttributeTemplate inheritance |
| [Taxonomy Plan 7 - Material Substances](./2026-01-26-taxonomy-07-material-substances.md) | Substance declarations on materials |
| [Taxonomy Plan 8 - Substance Rollup](./2026-01-26-taxonomy-08-substance-rollup.md) | BOM substance aggregation |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 2.6 | 2026-01-28 | Removed old terminology; updated to Requirement-based architecture |
| 2.5 | 2026-01-21 | Added AttributeTemplate.isRequired field |
| 2.4 | 2026-01-21 | Added Approval Gate workflow: real-time advisory mode (Section 10.2), submission workflow (Section 10.6), legal context API (Section 10.7) |
| 2.3 | 2026-01-21 | Made compliance view read-only |
| 2.2 | 2026-01-21 | Added feature toggle conditional behavior note to Regulatory Advisor section |
| 2.1 | 2026-01-21 | Added Regulatory Advisor integration (Section 10); PreFlight validation; soft gates |
| 2.0 | 2026-01-21 | Consolidated from design-workspace-design, taxonomy-engine-design; MikroORM entities; optimized N+1 queries; recursive BOM traversal |
