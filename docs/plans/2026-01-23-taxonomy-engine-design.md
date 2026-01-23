# Taxonomy Engine Design

**Status:** Draft
**Created:** 2026-01-23
**Author:** Brainstorm Session

---

## 1. Overview

The Taxonomy Engine is the foundational data backbone for EuroComply. It provides structured, typed, unit-aware attribute management across all workspaces and entity types.

### Why This Matters

The current implementation stores product attributes as unstructured JSON (`metadata: Record<string, unknown>`), which fails to support:
- Type validation (weight stored as "500g" string)
- Unit conversions (no standardization)
- BOM rollups (can't calculate total weight from components)
- Regulatory export (DPP requires structured data)
- Cross-product queries (can't find "all products > 1kg")

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Standardized Storage** | UNECE Rec 20 units, audit-ready by default |
| **Flexible Display** | Convert to user's preferred units on read |
| **Category-Driven** | Attributes defined at category level, inherited by products |
| **Dual-Scope** | System categories (platform-managed) + Tenant categories (org-managed) |
| **Cell-Ready** | Soft links to public schema, no cross-schema FK constraints |
| **Multi-Target** | Same engine powers Products, Facilities, Batches, Materials |

### Scope

The Taxonomy Engine applies to multiple entity types:

| Target Type | Workspace | Example Attributes |
|-------------|-----------|-------------------|
| `PRODUCT` | Design | weight, recycled_content, material_composition |
| `MATERIAL` | Design | density, tensile_strength, origin_country |
| `FACILITY` | Operations | capacity, certifications, audit_date |
| `BATCH` | Operations | quantity, production_date, quality_grade |

---

## 2. Category Model

### 2.1 Dual-Scope Categories

Categories exist in two scopes:

```
PUBLIC SCHEMA (System Categories)
├── categories                    ← Platform-managed, read-only for tenants
│   ├── Apparel
│   │   ├── Tops
│   │   │   ├── T-Shirts
│   │   │   └── Blouses
│   │   └── Bottoms
│   ├── Electronics
│   │   ├── Batteries
│   │   └── Displays
│   └── Furniture
│       └── Seating

TENANT SCHEMA (Organization Categories)
├── categories                    ← Tenant can extend OR create custom
│   ├── [extends: Apparel.Tops.T-Shirts]
│   │   └── Premium T-Shirts      ← Tenant extension
│   └── Internal Prototypes       ← Tenant-only category (no parent)
```

### 2.2 Adoption Modes

When a tenant uses a system category, they choose an adoption mode:

| Mode | Attributes | Platform Updates | Use Case |
|------|------------|------------------|----------|
| **LIVE_LINK** | Inherited from system + tenant extensions | Auto-applied | "Keep me current with regulations" |
| **FORKED** | Copied at adoption, tenant-owned | Ignored (notified only) | "I need full control" |
| **CUSTOM** | Tenant-defined only | N/A | "We have unique products" |

**Fork notifications:** When platform updates a system category, forked tenants see: *"System category updated - review changes?"* They can manually merge or ignore.

### 2.3 LTREE Paths

Categories use PostgreSQL LTREE extension for fast hierarchical queries:

- System: `apparel.tops.tshirts`
- Tenant extension: `apparel.tops.tshirts.premium` (stored in tenant schema)
- Tenant custom: `custom.prototypes` (no system prefix)

---

## 3. Attribute Templates

### 3.1 Template Structure

Attribute Templates define the "shape" of data - not the values themselves:

```typescript
{
  key: "weight",
  name: "Product Weight",
  type: AttributeType.NUMBER_UNIT,
  unitSystem: UnitSystem.MASS,
  defaultUnitId: "KGM",
  validationRules: { min: 0, max: 10000 },
  rollupMethod: RollupMethod.SUM,
  inheritanceRule: InheritanceRule.INHERIT,
  category: "apparel.tops"  // Applies to this + all children
}
```

### 3.2 Attribute Types

| Type | Example | Storage Format |
|------|---------|----------------|
| `TEXT` | Brand name | `{ val: "Acme" }` |
| `NUMBER` | Thread count | `{ val: 180 }` |
| `NUMBER_UNIT` | Weight | `{ val: 250, unit: "GRM" }` |
| `SELECT_SINGLE` | Material type | `{ val: "organic_cotton" }` |
| `SELECT_MULTI` | Certifications | `{ val: ["GOTS", "OEKO-TEX"] }` |
| `BOOLEAN` | Recyclable | `{ val: true }` |
| `COMPOSITE_PCT` | Material composition | `{ val: [{ material: "cotton", pct: 95 }, { material: "elastane", pct: 5 }] }` |
| `RANGE` | Temperature range | `{ val: { min: -20, max: 60 }, unit: "CEL" }` |
| `DATE` | Certification expiry | `{ val: "2027-06-15" }` |
| `RICH_TEXT` | Care instructions | `{ val: "<p>Machine wash...</p>" }` |
| `FILE` | Test report | `{ val: { r2Path: "...", filename: "report.pdf" } }` |
| `REFERENCE` | Supplier | `{ val: "facility_abc123" }` |
| `EXTERNAL_URI` | Certification link | `{ val: "https://certifier.com/cert/123" }` |

### 3.3 Dual-Scope Attributes

| Scope | Stored In | Who Manages | Example |
|-------|-----------|-------------|---------|
| **SYSTEM** | `public.attribute_templates` | Platform | `weight`, `recycled_content` (regulatory) |
| **ORGANIZATION** | `tenant.attribute_templates` | Tenant | `internal_cost_code`, `designer_notes` |

### 3.4 Inheritance Through Category Hierarchy

```
Apparel (weight, recycled_content)
  └── Tops (inherits weight, recycled_content)
        └── T-Shirts (inherits all + adds sleeve_length)
              └── Premium T-Shirts [tenant] (inherits all + adds premium_grade)
```

---

## 4. Unit Definitions

### 4.1 UNECE Recommendation 20

Rather than maintaining units manually, we adopt the UN standard:

| Benefit | Detail |
|---------|--------|
| ~1800 units pre-defined | Mass, length, volume, energy, etc. |
| Maintained by UN | We don't own the maintenance burden |
| EU regulatory alignment | Same codes used in ESPR/DPP context |
| GS1 compatible | Consistent with our EPCIS events |

**Example UNECE codes:**

| Code | Name | Symbol | System |
|------|------|--------|--------|
| `KGM` | Kilogram | kg | MASS |
| `GRM` | Gram | g | MASS |
| `OZA` | Ounce | oz | MASS |
| `MTR` | Metre | m | LENGTH |
| `CMT` | Centimetre | cm | LENGTH |
| `LTR` | Litre | L | VOLUME |
| `CEL` | Degree Celsius | °C | TEMPERATURE |
| `P1` | Percent | % | PERCENTAGE |

### 4.2 Conversion Logic

```typescript
// Convert 500g to kg
const grams = { val: 500, unit: 'GRM' };
const inKg = convert(grams, 'KGM');
// → { val: 0.5, unit: 'KGM' }

// How it works:
// 1. Look up source unit factor: GRM = 0.001
// 2. Look up target unit factor: KGM = 1
// 3. Calculate: 500 * 0.001 / 1 = 0.5
```

### 4.3 Display Unit Preferences

**Principle: Store standardized, display localized**

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  USER INPUT     │      │    DATABASE     │      │   API OUTPUT    │
│  "8 oz"         │ ──▶  │  0.227 KGM      │ ──▶  │  "227g" (EU)    │
│  (US designer)  │      │  (UNECE base)   │      │  "8oz" (US)     │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

**Preference hierarchy:**

| Level | Field | Wins |
|-------|-------|------|
| **Request Header** | `X-Unit-Preferences: MASS=OZA` | 1st |
| **User** | `OrganizationUser.unitPreferences` | 2nd |
| **Organization** | `Organization.unitPreferences` | 3rd |
| **System default** | Per unit system | 4th |

---

## 5. Attribute Value Storage

### 5.1 Storage Location

Values live on `ProductVersion.data` (or equivalent versioned entity), not on the base entity. This ensures attribute changes are version-tracked.

### 5.2 Dual Storage for Precision

To prevent rounding drift (8 oz → 0.226796 kg → 7.9999 oz), we store both:

```typescript
// ProductVersion.data.attributes structure
{
  "weight": {
    "templateId": "attr_xyz",

    // What user entered (preserved exactly)
    "inputVal": 8,
    "inputUnit": "OZA",

    // Normalized for math & regulatory export
    "val": 0.2267962,        // Full precision
    "unit": "KGM",           // UNECE base unit

    "source": "MANUAL",
    "updatedAt": "2026-01-23T10:30:00Z"
  }
}
```

| Field | Purpose |
|-------|---------|
| `inputVal` + `inputUnit` | Display to user, prevent frustration |
| `val` + `unit` | Rollup calculations, regulatory export, DPP generation |

### 5.3 Source Tracking

| Source | Meaning |
|--------|---------|
| `MANUAL` | User entered this value |
| `INHERITED` | Copied from parent product (variant) |
| `CALCULATED` | Computed by rollup engine from BOM |
| `IMPORTED` | Came from external system (API/CSV) |
| `CANNOT_CALCULATE` | Rollup failed (missing data) |

### 5.4 Audit-Ready by Default

Storing in UNECE codes means regulatory export requires no transformation:

```sql
-- DPP / Level 3 Disclosure Request
SELECT data->'attributes' FROM product_versions WHERE ...
-- → Already in UNECE codes, no migration needed
```

---

## 6. Rollup Engine

### 6.1 Rollup Methods

| Method | Use Case | Formula |
|--------|----------|---------|
| `SUM` | Total weight | Σ(child.val × quantity) |
| `WEIGHTED_AVG` | Recycled content % | Σ(child.val × child.weight) / Σ(child.weight) |
| `MAX` | Max operating temp | max(child.val) |
| `MIN` | Min operating temp | min(child.val) |
| `BOOLEAN_AND` | All components recyclable? | child₁ ∧ child₂ ∧ ... |
| `BOOLEAN_OR` | Any hazardous materials? | child₁ ∨ child₂ ∨ ... |
| `CONCAT` | Combined certifications | join(child.val) |
| `NONE` | Brand name | Don't calculate, manual only |

### 6.2 Secondary Attribute Reference (weightBasisKey)

For `WEIGHTED_AVG`, the engine needs to know what attribute provides the weighting factor:

```typescript
// AttributeTemplate for recycled_content
{
  key: "recycled_content",
  type: AttributeType.NUMBER_UNIT,
  unitSystem: UnitSystem.PERCENTAGE,
  rollupMethod: RollupMethod.WEIGHTED_AVG,
  weightBasisKey: "weight",  // ← Use this attribute as the weighting factor
}
```

### 6.3 Calculation Flow

```
WEIGHTED_AVG Rollup for "recycled_content"
─────────────────────────────────────────

1. Get weightBasisKey → "weight"

2. For each BOM leaf node:
   ├── Get recycled_content.val → 80%
   ├── Get weight.val → 400g
   └── Convert weight to base unit → 0.4 kg

3. Calculate:
   ┌────────────────────────────────────────────┐
   │ Component A: 0.4 kg × 80% = 0.32           │
   │ Component B: 0.1 kg × 20% = 0.02           │
   │                                            │
   │ Σ(weight × pct) = 0.34                     │
   │ Σ(weight)       = 0.5                      │
   │                                            │
   │ Result: 0.34 / 0.5 = 68%                   │
   └────────────────────────────────────────────┘

4. Store: { val: 68, unit: "P1", source: "CALCULATED" }
```

### 6.4 BOM Flattening

For nested structures, effective quantities are calculated:

```
T-Shirt (parent)
├── Fabric Panel [2.0 m²]
│   └── Cotton Yarn [0.3 kg/m²]    ← Effective: 2.0 × 0.3 = 0.6 kg
│       └── Raw Cotton [1.1 kg/kg] ← Effective: 0.6 × 1.1 = 0.66 kg
└── Buttons [5 pcs]
    └── Recycled Plastic [2g/pc]   ← Effective: 5 × 0.002 = 0.01 kg

Total weight = 0.66 + 0.01 = 0.67 kg
```

### 6.5 Rollup Triggers

| Event | Action |
|-------|--------|
| BOM entry added/removed | Recalculate affected attributes |
| Child product version released | Recalculate parents using that child |
| Manual override on parent | Mark as `MANUAL`, skip future rollups |
| User requests recalc | Force recalculate, overwrite even `MANUAL` |

### 6.6 Edge Cases

| Case | Handling |
|------|----------|
| Child missing weight attribute | Skip child, log warning, mark result as `PARTIAL` |
| Child missing target attribute | Skip child in calculation |
| All children missing | Result = `null`, source = `CANNOT_CALCULATE` |
| Weight is zero | Skip that child (avoid division issues) |

---

## 7. Entity Definitions

### 7.1 Cross-Schema Soft Links

To preserve cell-based scaling, references from tenant schema to public schema use soft links (string IDs) rather than hard FK constraints:

| From | To | Link Type | Reason |
|------|----|-----------|--------|
| Tenant → Public | `systemCategoryId` | **Soft (string)** | Cell migration |
| Tenant → Public | `defaultUnitId` | **Soft (string)** | Cell migration |
| Tenant → Tenant | `category` | **Hard (@ManyToOne)** | Same schema, OK |
| Public → Public | Any | **Hard (@ManyToOne)** | Same schema, OK |

### 7.2 Target Type Enum

All taxonomy entities support multiple target types:

```typescript
export enum TargetType {
  PRODUCT = 'PRODUCT',
  MATERIAL = 'MATERIAL',
  FACILITY = 'FACILITY',
  BATCH = 'BATCH',
}
```

### 7.3 UnitDefinition (public schema)

```typescript
@Entity({ tableName: 'unit_definitions', schema: 'public' })
export class UnitDefinition {
  @PrimaryKey()
  id!: string;

  @Property({ length: 10 })
  @Unique()
  code!: string;                    // UNECE code: "KGM", "GRM", "OZA"

  @Property()
  name!: string;                    // "Kilogram"

  @Property({ length: 10 })
  symbol!: string;                  // "kg"

  @Enum(() => UnitSystem)
  system!: UnitSystem;              // MASS, LENGTH, VOLUME, etc.

  @Property({ type: 'decimal', precision: 20, scale: 10 })
  factor!: string;                  // Conversion factor to base unit

  @Property({ default: false, name: 'is_base' })
  isBase!: boolean;                 // Is this the base unit for its system?

  @Property({ default: true, name: 'is_active' })
  isActive!: boolean;               // Show in UI dropdowns?

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

### 7.4 Category (dual schema)

```typescript
@Entity({ tableName: 'categories' })
export class Category extends BaseEntity {
  @Property()
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Index({ type: 'gist' })
  @Property({ columnType: 'ltree' })
  path!: string;                    // "apparel.tops.tshirts"

  @Enum(() => CategoryType)
  type!: CategoryType;              // ROOT, BRANCH, LEAF

  @Enum(() => TargetType)
  @Property({ name: 'target_type' })
  targetType!: TargetType;          // PRODUCT, FACILITY, BATCH, MATERIAL

  @Property({ type: 'int', default: 0 })
  depth!: number;

  @ManyToOne(() => Category, { nullable: true, name: 'parent_id' })
  parent?: Category;

  @Property({ nullable: true, name: 'default_profile_id' })
  defaultProfileId?: string;        // Default compliance profile (soft link)

  @Property({ default: true, name: 'is_active' })
  isActive!: boolean;

  // Relations (within same schema)
  @OneToMany(() => Category, cat => cat.parent)
  children = new Collection<Category>(this);

  @OneToMany(() => AttributeTemplate, attr => attr.category)
  attributes = new Collection<AttributeTemplate>(this);
}
```

### 7.5 CategoryAdoption (tenant schema)

```typescript
@Entity({ tableName: 'category_adoptions' })
export class CategoryAdoption extends BaseEntity {
  // Soft link to public.categories - NO @ManyToOne
  @Property({ name: 'system_category_id' })
  systemCategoryId!: string;

  // Hard link within same tenant schema - OK
  @ManyToOne(() => Category, { nullable: true, name: 'local_category_id' })
  localCategory?: Category;

  @Enum(() => AdoptionMode)
  mode!: AdoptionMode;              // LIVE_LINK, FORKED

  @Property({ name: 'adopted_at' })
  adoptedAt!: Date;

  @Property({ nullable: true, name: 'forked_version' })
  forkedVersion?: number;           // System category version when forked

  @Property({ type: 'boolean', default: false, name: 'update_available' })
  updateAvailable!: boolean;        // Flag when system category updated
}

export enum AdoptionMode {
  LIVE_LINK = 'LIVE_LINK',
  FORKED = 'FORKED',
}
```

### 7.6 AttributeTemplate (dual schema)

```typescript
@Entity({ tableName: 'attribute_templates' })
export class AttributeTemplate extends BaseEntity {
  @Property({ length: 100 })
  @Index()
  key!: string;                     // "weight", "recycled_content"

  @Property()
  name!: string;                    // "Product Weight"

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Enum(() => AttributeType)
  type!: AttributeType;             // NUMBER_UNIT, TEXT, SELECT_SINGLE, etc.

  @Enum(() => TargetType)
  @Property({ name: 'target_type' })
  targetType!: TargetType;          // PRODUCT, FACILITY, BATCH, MATERIAL

  // Hard link within same schema
  @ManyToOne(() => Category, { name: 'category_id' })
  category!: Category;

  // Soft link to public.unit_definitions
  @Property({ nullable: true, name: 'default_unit_id' })
  defaultUnitId?: string;

  @Enum(() => UnitSystem, { nullable: true })
  @Property({ nullable: true, name: 'unit_system' })
  unitSystem?: UnitSystem;          // MASS, LENGTH (for NUMBER_UNIT types)

  // Rollup configuration
  @Enum(() => RollupMethod)
  @Property({ name: 'rollup_method' })
  rollupMethod!: RollupMethod;      // SUM, WEIGHTED_AVG, NONE, etc.

  @Property({ nullable: true, name: 'weight_basis_key' })
  weightBasisKey?: string;          // For WEIGHTED_AVG: attribute to weight by

  // Inheritance
  @Enum(() => InheritanceRule)
  @Property({ name: 'inheritance_rule' })
  inheritanceRule!: InheritanceRule; // INHERIT, OVERRIDE, ADDITIVE

  // Validation
  @Property({ type: 'json', nullable: true, name: 'validation_rules' })
  validationRules?: {
    min?: number;
    max?: number;
    pattern?: string;               // Regex for TEXT
    required?: boolean;
  };

  @Property({ type: 'json', nullable: true, name: 'enum_values' })
  enumValues?: string[];            // For SELECT_SINGLE/MULTI

  @Property({ type: 'json', nullable: true, name: 'default_value' })
  defaultValue?: unknown;

  @Property({ default: true, name: 'is_active' })
  isActive!: boolean;

  @Property({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder!: number;               // Display order in UI
}
```

### 7.7 Enums

```typescript
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
  TEMPERATURE = 'TEMPERATURE',
  PERCENTAGE = 'PERCENTAGE',
  COUNT = 'COUNT',
  TIME = 'TIME',
  ENERGY = 'ENERGY',
  CURRENCY = 'CURRENCY',
}

export enum RollupMethod {
  SUM = 'SUM',
  WEIGHTED_AVG = 'WEIGHTED_AVG',
  MAX = 'MAX',
  MIN = 'MIN',
  BOOLEAN_AND = 'BOOLEAN_AND',
  BOOLEAN_OR = 'BOOLEAN_OR',
  CONCAT = 'CONCAT',
  NONE = 'NONE',
}

export enum InheritanceRule {
  INHERIT = 'INHERIT',
  OVERRIDE = 'OVERRIDE',
  ADDITIVE = 'ADDITIVE',
}

export enum CategoryType {
  ROOT = 'ROOT',
  BRANCH = 'BRANCH',
  LEAF = 'LEAF',
}

export enum TargetType {
  PRODUCT = 'PRODUCT',
  MATERIAL = 'MATERIAL',
  FACILITY = 'FACILITY',
  BATCH = 'BATCH',
}
```

### 7.8 Organization Unit Preferences

Add to existing `Organization` entity:

```typescript
// On Organization
@Property({ type: 'json', nullable: true, name: 'unit_preferences' })
unitPreferences?: Record<UnitSystem, string>;  // { "MASS": "KGM", "LENGTH": "CMT" }
```

Add to existing `OrganizationUser` entity:

```typescript
// On OrganizationUser (overrides org)
@Property({ type: 'json', nullable: true, name: 'unit_preferences' })
unitPreferences?: Record<UnitSystem, string>;  // { "MASS": "OZA" }
```

### 7.9 Entity Relationship Diagram

```
PUBLIC SCHEMA
─────────────────────────────────────────────────────────────────

  unit_definitions                  categories (SYSTEM)
  ┌─────────────────┐               ┌─────────────────┐
  │ KGM, GRM, OZA   │               │ Apparel         │
  │ MTR, CMT, INH   │◄──────────────│ Electronics     │
  │ LTR, CEL, P1... │  defaultUnit  │ Furniture       │
  └─────────────────┘   (soft)      │ targetType:     │
         ▲                          │   PRODUCT       │
         │                          └────────┬────────┘
         │                                   │
         │            ┌──────────────────────┘
         │            ▼
         │     attribute_templates (SYSTEM)
         │     ┌─────────────────────────────┐
         └─────│ weight                      │
               │ recycled_content            │
               │ material_composition        │
               │ targetType: PRODUCT         │
               └─────────────────────────────┘


TENANT SCHEMA
─────────────────────────────────────────────────────────────────

  category_adoptions          categories (TENANT)
  ┌─────────────────┐         ┌─────────────────────┐
  │ systemCatId ────┼─ soft ─▶│ Premium T-Shirts    │
  │ mode: FORKED    │         │ (extends system)    │
  └─────────────────┘         └──────────┬──────────┘
                                         │
                                         ▼
                              attribute_templates (TENANT)
                              ┌─────────────────────┐
                              │ premium_grade       │
                              │ internal_code       │
                              │ targetType: PRODUCT │
                              └──────────┬──────────┘
                                         │
                                         ▼
                              product_versions
                              ┌─────────────────────────────────────┐
                              │ data: {                             │
                              │   attributes: {                     │
                              │     weight: {                       │
                              │       templateId: "attr_xyz",       │
                              │       inputVal: 8,                  │
                              │       inputUnit: "OZA",             │
                              │       val: 0.2267962,               │
                              │       unit: "KGM",                  │
                              │       source: "MANUAL"              │
                              │     }                               │
                              │   }                                 │
                              │ }                                   │
                              └─────────────────────────────────────┘
```

---

## 8. API Routes

### 8.1 Route Structure

```
/api/v1
├── /taxonomy
│   ├── /units                    ← Read-only, UNECE definitions
│   ├── /categories               ← System + tenant categories
│   │   └── /:id/attributes       ← Attributes for category
│   └── /attributes               ← Direct attribute management
│
├── /products
│   └── /:id/versions/:versionId
│       └── /attributes           ← Get/set attribute values
│
└── /admin
    └── /taxonomy                 ← Platform admin only
        ├── /units                ← Manage UNECE units
        └── /categories           ← Manage system categories
```

### 8.2 Units (Read-only for tenants)

```
GET  /api/v1/taxonomy/units
     Query: ?system=MASS&active=true
     Returns: List of UNECE units, filtered by system

GET  /api/v1/taxonomy/units/:code
     Returns: Single unit definition (e.g., KGM)

GET  /api/v1/taxonomy/units/convert
     Query: ?from=OZA&to=KGM&value=8
     Returns: { from: { val: 8, unit: "OZA" }, to: { val: 0.227, unit: "KGM" } }
```

### 8.3 Categories

```
GET  /api/v1/taxonomy/categories
     Query: ?scope=SYSTEM|TENANT|ALL&parent=:id&depth=2&targetType=PRODUCT
     Returns: Category tree with adoption status for tenant

GET  /api/v1/taxonomy/categories/:id
     Returns: Single category with inherited attributes

POST /api/v1/taxonomy/categories
     Body: { name, parentId?, systemCategoryId?, adoptionMode?, targetType }
     Creates: Tenant category (custom or adopted from system)

PATCH /api/v1/taxonomy/categories/:id
      Body: { name?, description?, isActive?, defaultProfileId? }
      Updates: Tenant-owned category only

DELETE /api/v1/taxonomy/categories/:id
       Deletes: Tenant category (fails if products attached)

POST /api/v1/taxonomy/categories/:systemId/adopt
     Body: { mode: "LIVE_LINK" | "FORKED" }
     Creates: CategoryAdoption record, optionally forks to local copy

POST /api/v1/taxonomy/categories/:id/sync
     Syncs: FORKED category with latest system version (manual merge)
```

### 8.4 Attributes

```
GET  /api/v1/taxonomy/categories/:categoryId/attributes
     Query: ?inherited=true (include parent category attrs)
     Returns: All attribute templates for category

GET  /api/v1/taxonomy/attributes/:id
     Returns: Single attribute template

POST /api/v1/taxonomy/attributes
     Body: { key, name, type, categoryId, targetType, unitSystem?, rollupMethod, ... }
     Creates: Tenant attribute template

PATCH /api/v1/taxonomy/attributes/:id
      Body: { name?, validationRules?, isActive?, ... }
      Updates: Tenant-owned attribute only

DELETE /api/v1/taxonomy/attributes/:id
       Deletes: Tenant attribute (fails if values exist)
```

### 8.5 Product Attribute Values

```
GET  /api/v1/products/:productId/versions/:versionId/attributes
     Query: ?keys=weight,recycled_content (filter specific attrs)
     Headers: X-Unit-Preferences: MASS=OZA
     Returns: Attribute values with display conversion

PATCH /api/v1/products/:productId/versions/:versionId/attributes
      Body: {
        "weight": { "val": 8, "unit": "OZA" },
        "recycled_content": { "val": 45, "unit": "P1" }
      }
      Updates: Multiple attributes, validates against templates

POST /api/v1/products/:productId/versions/:versionId/attributes/rollup
     Query: ?keys=weight,recycled_content (specific attrs, or all)
     Triggers: Recalculate rollup values from BOM
     Returns: Updated calculated values
```

### 8.6 Admin Routes (Platform only)

```
POST   /api/admin/taxonomy/units
       Body: UNECE import payload
       Seeds: Unit definitions from UNECE Rec 20

POST   /api/admin/taxonomy/categories
       Body: { name, path, parentId?, targetType, ... }
       Creates: System category

PATCH  /api/admin/taxonomy/categories/:id
       Updates: System category (notifies FORKED tenants)

POST   /api/admin/taxonomy/attributes
       Creates: System attribute template
```

### 8.7 Response Format Example

```typescript
// GET /api/v1/products/:id/versions/:versionId/attributes
// With header: X-Unit-Preferences: MASS=OZA

{
  "data": {
    "weight": {
      "templateId": "attr_weight_123",
      "templateKey": "weight",
      "name": "Product Weight",
      "type": "NUMBER_UNIT",

      // Display values (converted per preference)
      "val": 8,
      "unit": "OZA",
      "displayLabel": "8 oz",

      // Original input (preserved)
      "inputVal": 8,
      "inputUnit": "OZA",

      // Stored base (for transparency)
      "_stored": {
        "val": 0.2267962,
        "unit": "KGM"
      },

      "source": "MANUAL",
      "updatedAt": "2026-01-23T10:30:00Z"
    },
    "recycled_content": {
      "templateId": "attr_recycled_456",
      "templateKey": "recycled_content",
      "name": "Recycled Content",
      "type": "NUMBER_UNIT",
      "val": 68,
      "unit": "P1",
      "displayLabel": "68%",
      "source": "CALCULATED",
      "updatedAt": "2026-01-23T10:35:00Z"
    }
  },
  "meta": {
    "categoryId": "cat_tshirts",
    "categoryPath": "apparel.tops.tshirts",
    "unitPreferencesApplied": { "MASS": "OZA" }
  }
}
```

### 8.8 Authorization Matrix

| Route | VIEWER | CONTRIBUTOR | EDITOR | MANAGER |
|-------|--------|-------------|--------|---------|
| GET categories/attributes | ✓ | ✓ | ✓ | ✓ |
| POST tenant category | ✗ | ✗ | ✓ | ✓ |
| POST tenant attribute | ✗ | ✗ | ✓ | ✓ |
| PATCH product attributes | ✗ | ✓ | ✓ | ✓ |
| DELETE category/attribute | ✗ | ✗ | ✗ | ✓ |
| Adopt system category | ✗ | ✗ | ✓ | ✓ |

---

## 9. Services

### 9.1 UnitConversionService

```typescript
export class UnitConversionService {
  constructor(private unitRepo: EntityRepository<UnitDefinition>) {}

  /**
   * Convert a value from one unit to another within the same system.
   */
  async convert(
    value: number,
    fromUnit: string,
    toUnit: string
  ): Promise<{ val: number; unit: string }> {
    const from = await this.unitRepo.findOneOrFail({ code: fromUnit });
    const to = await this.unitRepo.findOneOrFail({ code: toUnit });

    if (from.system !== to.system) {
      throw new ValidationError(`Cannot convert between ${from.system} and ${to.system}`);
    }

    const baseValue = value * parseFloat(from.factor);
    const converted = baseValue / parseFloat(to.factor);

    return { val: converted, unit: toUnit };
  }

  /**
   * Convert to base unit of the system.
   */
  async toBase(value: number, fromUnit: string): Promise<{ val: number; unit: string }> {
    const from = await this.unitRepo.findOneOrFail({ code: fromUnit });
    const base = await this.unitRepo.findOneOrFail({ system: from.system, isBase: true });
    return this.convert(value, fromUnit, base.code);
  }
}
```

### 9.2 CrossSchemaValidator

```typescript
export class CrossSchemaValidator {
  constructor(private publicEm: EntityManager) {}

  async validateSystemCategoryRef(categoryId: string): Promise<void> {
    const exists = await this.publicEm.findOne(Category, { id: categoryId }, {
      schema: 'public'
    });
    if (!exists) {
      throw new ValidationError(`System category ${categoryId} not found`);
    }
  }

  async validateUnitRef(unitId: string): Promise<void> {
    const exists = await this.publicEm.findOne(UnitDefinition, { id: unitId }, {
      schema: 'public'
    });
    if (!exists) {
      throw new ValidationError(`Unit ${unitId} not found`);
    }
  }

  async resolveSystemCategory(categoryId: string): Promise<Category | null> {
    return this.publicEm.findOne(Category, { id: categoryId }, {
      schema: 'public'
    });
  }
}
```

### 9.3 TaxonomyService

```typescript
export class TaxonomyService {
  constructor(
    private unitConversion: UnitConversionService,
    private categoryRepo: EntityRepository<Category>,
    private attributeRepo: EntityRepository<AttributeTemplate>
  ) {}

  /**
   * Resolve all attributes for a category, including inherited.
   */
  async getAttributesForCategory(
    categoryId: string,
    includeInherited: boolean = true
  ): Promise<AttributeTemplate[]> {
    const category = await this.categoryRepo.findOneOrFail({ id: categoryId });

    if (!includeInherited) {
      return this.attributeRepo.find({ category: categoryId });
    }

    // Walk up the tree and collect attributes
    const pathParts = category.path.split('.');
    const attributes: AttributeTemplate[] = [];

    for (let i = 1; i <= pathParts.length; i++) {
      const ancestorPath = pathParts.slice(0, i).join('.');
      const ancestorAttrs = await this.attributeRepo.find({
        category: { path: ancestorPath }
      });
      attributes.push(...ancestorAttrs);
    }

    return attributes;
  }

  /**
   * Validate attribute value against template.
   */
  async validateAttributeValue(
    templateId: string,
    value: { val: unknown; unit?: string }
  ): Promise<void> {
    const template = await this.attributeRepo.findOneOrFail({ id: templateId });

    // Type check
    if (template.type === AttributeType.NUMBER_UNIT) {
      if (typeof value.val !== 'number') {
        throw new ValidationError(`Expected number for ${template.key}`);
      }
      if (!value.unit) {
        throw new ValidationError(`Unit required for ${template.key}`);
      }
      // Validate unit is in correct system
      // ... unit system check
    }

    // Validation rules
    if (template.validationRules) {
      const rules = template.validationRules;
      if (rules.min !== undefined && value.val < rules.min) {
        throw new ValidationError(`${template.key} must be >= ${rules.min}`);
      }
      if (rules.max !== undefined && value.val > rules.max) {
        throw new ValidationError(`${template.key} must be <= ${rules.max}`);
      }
    }
  }

  /**
   * Transform response for display, converting units per preferences.
   */
  async transformResponse(
    data: ProductVersionData,
    preferences: Record<UnitSystem, string>
  ): Promise<TransformedProductVersionData> {
    const transformed = { ...data };

    for (const [key, attr] of Object.entries(data.attributes)) {
      if (attr.unit) {
        const template = await this.attributeRepo.findOne({ id: attr.templateId });
        if (template?.unitSystem && preferences[template.unitSystem]) {
          const targetUnit = preferences[template.unitSystem];
          const converted = await this.unitConversion.convert(
            attr.val,
            attr.unit,
            targetUnit
          );
          transformed.attributes[key] = {
            ...attr,
            val: converted.val,
            unit: converted.unit,
            displayLabel: `${converted.val} ${converted.unit}`,
            _stored: { val: attr.val, unit: attr.unit }
          };
        }
      }
    }

    return transformed;
  }
}
```

### 9.4 RollupEngine

```typescript
export class RollupEngine {
  constructor(
    private taxonomyService: TaxonomyService,
    private unitConversion: UnitConversionService
  ) {}

  /**
   * Calculate rollup for a specific attribute on a product version.
   */
  async calculateRollup(
    productVersion: ProductVersion,
    attributeKey: string
  ): Promise<AttributeValue | null> {
    const template = await this.getTemplateForAttribute(productVersion, attributeKey);
    if (!template || template.rollupMethod === RollupMethod.NONE) {
      return null;
    }

    const flatBom = await this.flattenBom(productVersion);

    switch (template.rollupMethod) {
      case RollupMethod.SUM:
        return this.calculateSum(flatBom, attributeKey, template);
      case RollupMethod.WEIGHTED_AVG:
        return this.calculateWeightedAvg(flatBom, attributeKey, template);
      case RollupMethod.MAX:
        return this.calculateMax(flatBom, attributeKey, template);
      case RollupMethod.MIN:
        return this.calculateMin(flatBom, attributeKey, template);
      case RollupMethod.BOOLEAN_AND:
        return this.calculateBooleanAnd(flatBom, attributeKey);
      case RollupMethod.BOOLEAN_OR:
        return this.calculateBooleanOr(flatBom, attributeKey);
      default:
        return null;
    }
  }

  private async calculateWeightedAvg(
    flatBom: FlatBomNode[],
    attributeKey: string,
    template: AttributeTemplate
  ): Promise<AttributeValue> {
    if (!template.weightBasisKey) {
      throw new ValidationError(
        `WEIGHTED_AVG requires weightBasisKey for ${attributeKey}`
      );
    }

    let weightedSum = 0;
    let totalWeight = 0;
    let partial = false;

    for (const node of flatBom) {
      const attrValue = node.attributes[attributeKey];
      const weightValue = node.attributes[template.weightBasisKey];

      if (!attrValue || !weightValue) {
        partial = true;
        continue;
      }

      // Convert weight to base unit
      const weightInBase = await this.unitConversion.toBase(
        weightValue.val * node.effectiveQuantity,
        weightValue.unit
      );

      weightedSum += attrValue.val * weightInBase.val;
      totalWeight += weightInBase.val;
    }

    if (totalWeight === 0) {
      return {
        val: null,
        unit: template.unitSystem === UnitSystem.PERCENTAGE ? 'P1' : undefined,
        source: 'CANNOT_CALCULATE'
      };
    }

    return {
      val: weightedSum / totalWeight,
      unit: 'P1',
      source: partial ? 'CALCULATED_PARTIAL' : 'CALCULATED'
    };
  }

  private async flattenBom(productVersion: ProductVersion): Promise<FlatBomNode[]> {
    // Recursively walk BOM, calculating effective quantities
    // Returns flat list of leaf nodes with their effective quantities
    // ...implementation
  }
}
```

---

## 10. Implementation Phases

### Phase 1: Foundation & Units

**Goal:** UNECE unit system working, conversion service operational

**Entities:**
- `UnitDefinition` (public schema)

**Deliverables:**

| Item | Description |
|------|-------------|
| UNECE seed script | Import ~200 common units from Rec 20 XML |
| `UnitDefinition` entity | MikroORM entity in public schema |
| `UnitConversionService` | Convert between units in same system |
| Unit API routes | `GET /units`, `GET /units/:code`, `GET /units/convert` |
| Unit tests | Conversion accuracy, edge cases |

**Acceptance Criteria:**
- [ ] `GET /api/v1/taxonomy/units?system=MASS` returns kg, g, oz, lb, etc.
- [ ] `GET /api/v1/taxonomy/units/convert?from=OZA&to=KGM&value=8` returns 0.2267962
- [ ] Conversion preserves precision to 10 decimal places

---

### Phase 2: Categories & Attributes

**Goal:** Category hierarchy with attribute templates, adoption model working

**Entities:**
- `Category` (public + tenant schemas)
- `CategoryAdoption` (tenant schema)
- `AttributeTemplate` (public + tenant schemas)

**Deliverables:**

| Item | Description |
|------|-------------|
| `Category` entity | Dual-schema with LTREE path, targetType |
| `CategoryAdoption` entity | LIVE_LINK / FORKED tracking |
| `AttributeTemplate` entity | All types, validation rules, rollup config |
| `CrossSchemaValidator` | Soft link validation service |
| Category API routes | CRUD + adopt + sync |
| Attribute API routes | CRUD with category binding |
| Inheritance resolver | Walk category tree, collect attributes |
| System category seed | Initial Apparel, Electronics, Furniture trees |

**Acceptance Criteria:**
- [ ] System categories visible to all tenants
- [ ] Tenant can adopt system category as LIVE_LINK or FORKED
- [ ] Tenant can create custom categories
- [ ] Attributes inherit through category hierarchy
- [ ] FORKED categories show "update available" when system changes
- [ ] targetType filters categories correctly

---

### Phase 3: Products & Values

**Goal:** Products store typed attribute values, unit preferences work

**Changes:**
- `ProductVersion.data` schema enforcement
- `Organization.unitPreferences`
- `OrganizationUser.unitPreferences`

**Deliverables:**

| Item | Description |
|------|-------------|
| `AttributeValueSchema` | Zod schema for data.attributes structure |
| `AttributeValidationService` | Validate values against templates |
| `TaxonomyService.transformResponse` | Convert units for display |
| Unit preference middleware | Resolve Header > User > Org > System |
| Product attributes API | `GET/PATCH /products/:id/versions/:vid/attributes` |
| Input preservation | Store `inputVal`/`inputUnit` alongside base |
| Migration script | Migrate existing `metadata` to structured `attributes` |

**Acceptance Criteria:**
- [ ] `PATCH` attribute validates against template (type, unit system, min/max)
- [ ] Invalid unit rejected with clear error
- [ ] Response converts to user's preferred units
- [ ] `inputVal`/`inputUnit` preserved exactly as entered
- [ ] Existing products migrated without data loss

---

### Phase 4: Rollups & Polish

**Goal:** BOM-based calculations, production-ready polish

**Deliverables:**

| Item | Description |
|------|-------------|
| `RollupEngine` | SUM, WEIGHTED_AVG, MAX, MIN, BOOLEAN_* |
| BOM flattener | Recursive tree walk with effective quantities |
| `weightBasisKey` resolution | Secondary attribute lookup for weighted avg |
| Rollup trigger hooks | On BOM change, on child version release |
| Manual recalc API | `POST /products/:id/versions/:vid/attributes/rollup` |
| Source tracking | `MANUAL`, `CALCULATED`, `INHERITED`, `IMPORTED` |
| Partial calculation warnings | Handle missing attributes gracefully |
| Bulk import API | CSV/JSON import with validation |
| Admin UI components | Category tree editor, attribute template builder |
| Fork drift notifications | Alert tenants when system categories update |

**Acceptance Criteria:**
- [ ] Weight SUM calculated correctly through nested BOM
- [ ] Recycled content WEIGHTED_AVG uses weight as basis
- [ ] Manual override stops future auto-calculation for that attr
- [ ] Changing child triggers parent recalculation
- [ ] Missing attributes logged, calculation marked `PARTIAL`

---

### Dependency Graph

```
Phase 1 ─────────────────┐
(Units)                  │
                         ▼
Phase 2 ◄────────────────┤
(Categories/Attributes)  │
                         ▼
Phase 3 ◄────────────────┤
(Product Values)         │
                         ▼
Phase 4 ◄────────────────┘
(Rollups)
```

---

### Estimated Scope

| Phase | New Entities | API Routes | Services | Tests |
|-------|--------------|------------|----------|-------|
| 1 | 1 | 3 | 1 | ~15 |
| 2 | 3 | 10 | 2 | ~40 |
| 3 | 0 (changes) | 4 | 3 | ~30 |
| 4 | 0 | 2 | 2 | ~25 |
| **Total** | **4** | **19** | **8** | **~110** |

---

## 11. Migration Strategy

### 11.1 Existing Data

Current products have unstructured `metadata`:

```typescript
// Current (to be migrated)
{
  metadata: {
    "weight": "500g",
    "color": "blue"
  }
}
```

### 11.2 Migration Script

```typescript
async function migrateProductMetadata(em: EntityManager) {
  const products = await em.find(ProductVersion, {
    data: { $ne: null }
  });

  for (const version of products) {
    const oldData = version.data as { metadata?: Record<string, unknown> };
    if (!oldData?.metadata) continue;

    const newAttributes: Record<string, AttributeValue> = {};

    for (const [key, value] of Object.entries(oldData.metadata)) {
      // Attempt to parse structured values
      const parsed = parseMetadataValue(key, value);
      if (parsed) {
        newAttributes[key] = {
          templateId: null, // Will be linked when template exists
          inputVal: parsed.inputVal,
          inputUnit: parsed.inputUnit,
          val: parsed.val,
          unit: parsed.unit,
          source: 'IMPORTED',
          updatedAt: new Date().toISOString()
        };
      }
    }

    version.data = {
      ...oldData,
      attributes: newAttributes
    };
  }

  await em.flush();
}

function parseMetadataValue(key: string, value: unknown): ParsedValue | null {
  // Handle "500g" → { inputVal: 500, inputUnit: "GRM", val: 0.5, unit: "KGM" }
  if (typeof value === 'string') {
    const match = value.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
    if (match) {
      const numVal = parseFloat(match[1]);
      const unitStr = match[2].toLowerCase();
      // Map common unit strings to UNECE codes
      const unitMap: Record<string, string> = {
        'g': 'GRM', 'kg': 'KGM', 'oz': 'OZA', 'lb': 'LBR',
        'm': 'MTR', 'cm': 'CMT', 'mm': 'MMT'
      };
      const unitCode = unitMap[unitStr];
      if (unitCode) {
        return {
          inputVal: numVal,
          inputUnit: unitCode,
          val: numVal, // Will be converted to base by service
          unit: unitCode
        };
      }
    }
  }
  return null;
}
```

---

## 12. Related Documents

| Document | Relationship |
|----------|--------------|
| [02-data-model.md](./02-data-model.md) | Entity definitions, schema design |
| [05-design-workspace.md](./05-design-workspace.md) | Product/BOM usage of taxonomy |
| [06-operations-workspace.md](./06-operations-workspace.md) | Facility/Batch usage of taxonomy |
| [08-compliance-workspace.md](./08-compliance-workspace.md) | DPP attribute extraction |
| [13-regulatory-advisor.md](./13-regulatory-advisor.md) | Rule validation against attributes |

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-23 | Initial design from brainstorm session |
