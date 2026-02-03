# Taxonomy Engine Design

**Status:** Draft
**Created:** 2026-01-23
**Updated:** 2026-01-26
**Author:** Brainstorm Session

---

## 1. Overview

The Taxonomy Engine is the foundational data backbone for EuroComply. It provides structured, typed, unit-aware attribute management across all workspaces and entity types. It also manages **international reference data** including units of measure, product classifications, and regulated substances.

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
| **Standardized Storage** | UNECE Rec 20 units, HS/CN classifications, ECHA substances |
| **Flexible Display** | Convert to user's preferred units on read |
| **Category-Driven** | Attributes defined at category level, inherited by products |
| **Dual-Scope** | System categories (platform-managed) + Tenant categories (org-managed) |
| **Cell-Ready** | Soft links to public schema, no cross-schema FK constraints |
| **Multi-Target** | Same engine powers Products, Facilities, Batches, Materials |
| **Version-Locked Substances** | Substance declarations tied to material versions for audit trail |
| **Regulatory Intelligence** | SVHC, Authorization, Restriction status from ECHA |

### Scope

The Taxonomy Engine applies to multiple entity types:

| Target Type | Workspace | Example Attributes |
|-------------|-----------|-------------------|
| `PRODUCT` | Design | weight, recycled_content, material_composition |
| `MATERIAL` | Design | density, tensile_strength, **substance declarations** |
| `FACILITY` | Operations | capacity, certifications, audit_date |
| `BATCH` | Operations | quantity, production_date, quality_grade |

### Reference Data Registries

The Taxonomy Engine manages three types of international reference data:

| Registry | Source | Records | Schema | Purpose |
|----------|--------|---------|--------|---------|
| **Units** | UNECE Rec 20 | ~1,800 | `public` | Measuring quantities |
| **Classifications** | WCO HS / EU CN | ~20,000 | `public` | Trade/customs categorization |
| **Substances** | ECHA (EU) | ~400 core + 130k CLP | `public` | Chemical compliance (REACH, RoHS) |

---

## 2. Category Model

### 2.1 Dual-Scope Categories

Categories exist in two separate tables across schemas:

```
PUBLIC SCHEMA (System Categories)
├── public.category               ← Platform-managed, read-only for tenants
│   ├── Apparel (path: apparel)
│   │   ├── Tops (path: apparel.tops)
│   │   │   ├── T-Shirts (path: apparel.tops.tshirts)
│   │   │   └── Blouses (path: apparel.tops.blouses)
│   │   └── Bottoms (path: apparel.bottoms)
│   ├── Electronics (path: electronics)
│   └── Furniture (path: furniture)

TENANT SCHEMA (Tenant Categories)
├── tenant_xxx.tenant_category    ← Tenant-owned categories
│   ├── Premium Line (path: premium_line, links to: apparel.tops.tshirts)
│   ├── Eco Collection (path: eco_collection, links to: apparel)
│   └── Internal Prototypes (path: internal_prototypes, no system link)
```

**Key architecture decisions:**
- **Separate tables**: System categories in `public.category`, tenant categories in `tenant_xxx.tenant_category`
- **Tenant-local paths**: Tenant categories have their own LTREE paths, not extending system paths
- **Soft references**: Tenant categories link to system categories via UUID (no FK constraint)
- **No cross-schema FK**: Enables cell architecture and schema isolation

### 2.2 Link Modes

When a tenant creates a category linked to a system category, they choose a link mode:

| Mode | System Updates | Notifications | Use Case |
|------|----------------|---------------|----------|
| **LIVE** | Auto-applied to tenant category | Yes | "Keep me current with regulations" |
| **FROZEN** | Ignored (snapshot at version) | Yes, can review & merge | "I want control over when to update" |
| **DETACHED** | Ignored permanently | No | "I've diverged, don't notify me" |

**Custom categories** (no system link) have `system_category_id = null` and no link mode.

**Version tracking**: System categories have a `version` field (incremented on updates). Frozen tenant categories store `frozen_at_version` to track which version they snapshotted.

**Notification flow**: When platform updates a system category:
1. LIVE tenants: Changes auto-applied
2. FROZEN tenants: See notification "System category updated (v3 → v4) - review changes?"
3. DETACHED tenants: No notification

### 2.3 LTREE Paths

Categories use PostgreSQL LTREE extension for hierarchical queries:

**System categories** (public schema):
- Full hierarchy paths: `apparel.tops.tshirts`
- Supports `@>` (ancestor) and `<@` (descendant) operators

**Tenant categories** (tenant schema):
- Tenant-local paths: `premium_line` (not `apparel.tops.tshirts.premium_line`)
- Hierarchy is within tenant's own categories only
- Link to system category is via `system_category_id` UUID, not path

**Why tenant-local paths?**
- System path changes don't break tenant categories
- Simpler cross-schema queries (no path prefix management)
- Tenant can reorganize their hierarchy without affecting system link

### 2.4 TenantCategory Entity

```typescript
// packages/database/src/entities/TenantCategory.ts
@Entity({ tableName: 'tenant_category' })
export class TenantCategory extends BaseEntity {
  @Property()
  name!: string;

  @Property({ nullable: true })
  description?: string;

  @Index({ type: 'gist' })
  @Property({ columnType: 'ltree' })
  path!: string;                          // Tenant-local path

  @Enum(() => CategoryType)
  type!: CategoryType;                    // ROOT | BRANCH | LEAF

  @Enum(() => TargetType)
  targetType!: TargetType;                // PRODUCT | MATERIAL | FACILITY | BATCH

  @Property({ default: 0 })
  depth!: number;

  @ManyToOne(() => TenantCategory, { nullable: true })
  parent?: TenantCategory;                // FK within tenant schema

  @Property({ nullable: true })
  systemCategoryId?: string;              // Soft ref to public.category (no FK)

  @Enum(() => LinkMode, { nullable: true })
  linkMode?: LinkMode;                    // LIVE | FROZEN | DETACHED

  @Property({ nullable: true })
  frozenAtVersion?: number;               // Version when frozen

  @Property({ default: true })
  isActive!: boolean;
}

export enum LinkMode {
  LIVE = 'LIVE',
  FROZEN = 'FROZEN',
  DETACHED = 'DETACHED',
}
```

### 2.5 System Category Versioning

Add `version` field to existing `public.category`:

```sql
ALTER TABLE public.category ADD COLUMN version INT NOT NULL DEFAULT 1;
```

Increment on any update to name, description, or attributes:
```typescript
category.version += 1;
await em.flush();
```

### 2.6 Permissions

| Action | Required Permission |
|--------|---------------------|
| Browse system categories | Public (no auth) |
| Adopt system category | `design:edit` |
| Create/edit/delete tenant category | `design:manager` |
| View tenant categories | `design:view` |

### 2.7 Deletion Rules

- **Block deletion** if products are assigned to the category
- Error: `Cannot delete "Premium Line": 12 products assigned. Reassign them first.`
- API returns 409 Conflict with product count

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

### 4.4 Bulk Import Strategy

Reference data (units, classifications, substances) is seeded via **deployment pipeline**, not application startup. This prevents race conditions with horizontally-scaled pods.

**Deployment flow:**

```
1. Run migrations         (pnpm db:migrate)
2. Run public seeders     (pnpm db:seed:public)  ← Pre-deployment task
3. Deploy pods            (pods start clean)
```

**Import strategies by dataset size:**

| Dataset | Records | Strategy |
|---------|---------|----------|
| ECHA SVHC/Auth/Restriction | <500 | MikroORM upsert |
| UNECE Rec 20 | ~1,800 | PostgreSQL COPY |
| HS/CN Codes | ~20,000 | PostgreSQL COPY |
| CLP Inventory (optional) | ~130,000 | PostgreSQL COPY |

**Bulk import service:**

```typescript
// packages/database/src/services/bulk-import.service.ts
export class BulkImportService {
  /**
   * Small datasets: ORM-based upsert (safe, simple)
   */
  async upsertSmall<T>(repo: EntityRepository<T>, records: T[]): Promise<number>;

  /**
   * Large datasets: COPY via temp staging table (safe, fast)
   * - Creates temp table matching target schema
   * - COPY from CSV with proper escaping
   * - Upsert from staging to target via INSERT ... ON CONFLICT
   * - Drop staging table (auto-cleaned if import fails)
   */
  async copyLarge(tableName: string, csvPath: string, columns: string[]): Promise<number>;
}
```

**Version tracking:**

```typescript
@Entity({ tableName: 'seed_version', schema: 'public' })
export class SeedVersion extends BaseEntity {
  @Property() @Unique()
  name!: string;        // "unece-rec20", "echa-svhc"

  @Property()
  version!: string;     // "Rev17", "2024-01-15"

  @Property()
  seededAt!: Date;
}
```

### 4.5 Product Classifications (HS/CN Codes)

Product classifications categorize products for trade and customs purposes. Unlike categories (organizational taxonomy), classifications are **international standards** used for regulatory reporting.

**Data sources:**

| System | Source | Codes | Digits | Scope |
|--------|--------|-------|--------|-------|
| **HS** | WCO (World Customs Org) | ~5,300 headings | 6 | International |
| **CN** | EU TARIC | ~15,000 codes | 8 | EU-specific |
| **TARIC** | EU Commission | ~20,000 codes | 10 | EU tariff rates |

**Entity: ProductClassification**

```typescript
@Entity({ tableName: 'product_classification', schema: 'public' })
export class ProductClassification extends BaseEntity {
  @Property({ length: 20 })
  @Unique()
  code!: string;              // "8471.30" (HS) or "8471.30.00" (CN)

  @Enum(() => ClassificationSystem)
  system!: ClassificationSystem;  // HS, CN, TARIC

  @Property()
  description!: string;       // "Portable digital automatic data processing machines"

  @Property({ nullable: true })
  parentCode?: string;        // "8471" for "8471.30"

  @Property({ default: 0 })
  level!: number;             // 0=chapter, 1=heading, 2=subheading

  @Property({ default: true })
  isActive!: boolean;

  @Property({ nullable: true })
  sourceVersion?: string;     // "HS2022", "CN2024"
}

export enum ClassificationSystem {
  HS = 'HS',
  CN = 'CN',
  TARIC = 'TARIC'
}
```

**Relationship to Product:**

```typescript
// On Product entity - soft link to public.product_classification
@Property({ nullable: true, name: 'classification_code' })
classificationCode?: string;  // "8471.30.00"
```

**Use cases:**
- Customs declarations for international trade
- CBAM (Carbon Border Adjustment Mechanism) reporting
- Regulatory scope determination (e.g., "RoHS applies to HS Chapter 85")

### 4.6 Substance Registry (ECHA Data)

The Substance Registry stores chemical substance reference data from ECHA (European Chemicals Agency). This enables compliance checking for REACH, RoHS, and other chemical regulations.

**Data sources (all free, EU-official):**

| Source | Records | Content |
|--------|---------|---------|
| **ECHA SVHC Candidate List** | ~240 | Substances of Very High Concern |
| **ECHA Authorisation List** | ~60 | Annex XIV - requires authorization |
| **ECHA Restriction List** | ~70 | Annex XVII - banned/limited |
| **EU CLP Inventory** | ~130,000 | Full classification database (optional) |

**Entity: Substance**

```typescript
@Entity({ tableName: 'substance', schema: 'public' })
export class Substance extends BaseEntity {
  @Property({ length: 20 })
  @Unique()
  @Index()
  casNumber!: string;           // "127-19-5" (validated with checksum)

  @Property({ length: 20, nullable: true })
  ecNumber?: string;            // "204-826-4" (EU EC/EINECS number)

  @Property()
  primaryName!: string;         // IUPAC or most common name

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  molecularWeight?: string;

  @Property({ length: 500, nullable: true })
  molecularFormula?: string;    // "C4H9NO"

  // Regulatory status from ECHA
  @Property({ default: false })
  isSvhc!: boolean;             // SVHC Candidate List

  @Property({ default: false })
  requiresAuthorization!: boolean;  // Annex XIV

  @Property({ default: false })
  isRestricted!: boolean;       // Annex XVII

  @Property({ type: 'text', nullable: true })
  restrictionConditions?: string;   // "Max 0.1% in consumer products"

  @Property({ type: 'date', nullable: true })
  sunsetDate?: Date;            // Authorization deadline

  @Property({ type: 'date', nullable: true })
  latestApplicationDate?: Date; // Last date to apply for authorization

  // Source tracking
  @Property({ nullable: true })
  echaUrl?: string;             // Link to ECHA substance page

  @Property({ nullable: true })
  sourceVersion?: string;       // "SVHC-2024-01"

  @Property({ default: true })
  isActive!: boolean;

  @OneToMany(() => SubstanceAlias, alias => alias.substance)
  aliases = new Collection<SubstanceAlias>(this);
}
```

**Entity: SubstanceAlias**

Chemicals often have multiple names (IUPAC, common, trade names):

```typescript
@Entity({ tableName: 'substance_alias', schema: 'public' })
@Unique({ properties: ['substance', 'name'] })
export class SubstanceAlias extends BaseEntity {
  @ManyToOne(() => Substance)
  substance!: Substance;

  @Property()
  @Index()
  name!: string;                // Alternative name

  @Enum(() => AliasType)
  type!: AliasType;

  @Property({ nullable: true })
  language?: string;            // "en", "de", "fr"
}

export enum AliasType {
  IUPAC = 'IUPAC',
  COMMON = 'COMMON',
  TRADE = 'TRADE',
  SYNONYM = 'SYNONYM',
  INDEX_NAME = 'INDEX_NAME'     // CLP Index name
}
```

**CAS Number Validation:**

CAS numbers have a checksum digit that must be validated on import:

```typescript
// packages/database/src/utils/cas-validator.ts
export function isValidCasNumber(cas: string): boolean {
  // Format: 2-7 digits, hyphen, 2 digits, hyphen, check digit
  const match = cas.match(/^(\d{2,7})-(\d{2})-(\d)$/);
  if (!match) return false;

  const digits = (match[1] + match[2]).split('').reverse();
  const checkDigit = parseInt(match[3], 10);
  const sum = digits.reduce((acc, d, i) => acc + parseInt(d, 10) * (i + 1), 0);

  return sum % 10 === checkDigit;
}

// Use as @BeforeCreate hook on Substance entity
```

### 4.7 MaterialSubstance (Tenant-Scoped)

The `MaterialSubstance` entity links substances to **material versions** (not products). This is tenant-scoped because concentration data is proprietary.

**Why version-linked:**

In PLM, material formulations change between versions:
- v1.0: Contains DMAC solvent (8%) - SVHC, non-compliant
- v2.0: Reformulated with NMP (3%) - less restricted
- v3.0: Bio-solvent (2%) - fully compliant

Linking to `ProductVersion` preserves this audit trail.

**Entity: MaterialSubstance**

```typescript
@Entity({ tableName: 'material_substance' })
@Unique({ properties: ['materialVersion', 'substance'] })
export class MaterialSubstance extends BaseEntity {
  // Links to ProductVersion (material must have targetType=MATERIAL)
  @ManyToOne(() => ProductVersion, { name: 'material_version_id' })
  @Index()
  materialVersion!: ProductVersion;

  // Links to public.substance (cross-schema FK via soft link)
  @Property({ name: 'substance_id' })
  @Index()
  substanceId!: string;

  // Concentration data (high precision for regulatory thresholds)
  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  concentrationPct?: string;      // % by weight (e.g., "0.050000" for 0.05%)

  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  concentrationMin?: string;      // Range minimum (if variable)

  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  concentrationMax?: string;      // Range maximum (if variable)

  @Enum(() => ConcentrationBasis)
  basis: ConcentrationBasis = ConcentrationBasis.WEIGHT;

  // Verification audit trail
  @ManyToOne(() => User, { name: 'verified_by_id', nullable: true })
  verifiedBy?: User;

  @Property({ nullable: true })
  verifiedAt?: Date;

  @Property({ type: 'text', nullable: true })
  verificationSource?: string;    // "Supplier SDS dated 2024-01-15"

  // Conditional presence
  @Property({ default: false })
  isIntentionallyAdded!: boolean; // vs. impurity/contamination

  @Property({ type: 'text', nullable: true })
  notes?: string;
}

export enum ConcentrationBasis {
  WEIGHT = 'WEIGHT',       // % w/w (most common)
  VOLUME = 'VOLUME',       // % v/v
  MOLAR = 'MOLAR'          // mol%
}
```

**Validation: targetType must be MATERIAL**

```sql
-- Database trigger to enforce material-only constraint
CREATE OR REPLACE FUNCTION check_material_version_target_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM product_version pv
    JOIN product p ON pv.product_id = p.id
    JOIN category c ON p.category_id = c.id
    WHERE pv.id = NEW.material_version_id
    AND c.target_type = 'MATERIAL'
  ) THEN
    RAISE EXCEPTION 'material_substance.material_version_id must reference a MATERIAL product version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_material_substance_validate
  BEFORE INSERT OR UPDATE ON material_substance
  FOR EACH ROW EXECUTE FUNCTION check_material_target_type();
```

**Design Workspace Integration:**

Substances appear in the Design Workspace when working with materials:

1. **Material Detail View** - Designers see/edit substance declarations
2. **BOM Builder** - Shows rolled-up substances with effective concentrations
3. **Add Substance Modal** - Search by name or CAS, see regulatory flags
4. **Compliance Check** - Substances evaluated against REACH/RoHS rules

```
┌─────────────────────────────────────────────────────────────┐
│ Material: Elastane Fiber v2.0                               │
├─────────────────────────────────────────────────────────────┤
│ SUBSTANCE DECLARATIONS                        [+ Add]       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ CAS 127-19-5 | DMAC | 8.0% w/w | ⚠️ SVHC               │ │
│ │ Verified by: John Smith | 2024-01-15 | Supplier SDS     │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

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

### 6.7 Substance Rollup

Substances roll up differently from attributes. Instead of calculating a single value, we **aggregate substances** from all materials in the BOM with their effective concentrations.

**Calculation:**

```
effectiveConcentration = bomSharePct × substanceConcentrationPct
```

**Example:**

```
T-Shirt v1.0 BOM:
├── Organic Cotton v1.0 (95% by weight)
│   └── Substances: None declared
│
└── Elastane Fiber v2.0 (5% by weight)
    └── Substances:
        ├── DMAC (CAS 127-19-5): 8.0% concentration
        └── 2-Butoxyethanol (CAS 111-76-2): 0.5% concentration

Rolled-up Substances:
├── DMAC: 5% × 8.0% = 0.4% effective concentration ⚠️ SVHC > 0.1%
└── 2-Butoxyethanol: 5% × 0.5% = 0.025% effective concentration ✓
```

**Service: SubstanceRollupService**

```typescript
interface RolledUpSubstance {
  substance: Substance;
  effectiveConcentrationPct: string;
  sources: Array<{
    materialVersion: ProductVersion;
    bomQuantityPct: string;
    substanceConcentrationPct: string;
  }>;
  regulatoryFlags: {
    exceedsSvhcThreshold: boolean;    // > 0.1% w/w
    requiresAuthorization: boolean;
    isRestricted: boolean;
  };
}

export class SubstanceRollupService {
  async rollUp(productVersionId: string): Promise<RolledUpSubstance[]> {
    // 1. Get BOM entries for this product version
    // 2. For each material version, get MaterialSubstance records
    // 3. Calculate effective concentration: bomShare% × substanceConc%
    // 4. Aggregate by CAS number (same substance may appear in multiple materials)
    // 5. Apply regulatory flags based on thresholds
    return rolledUpSubstances;
  }
}
```

**Aggregation rules:**

| Scenario | Handling |
|----------|----------|
| Same substance in multiple materials | Sum effective concentrations |
| Substance with concentration range | Use max for compliance check |
| Nested BOM (material contains sub-materials) | Recursive rollup through tree |
| Missing substance data on material | Flag as incomplete, log warning |

**Regulatory thresholds:**

| Regulation | Threshold | Flag |
|------------|-----------|------|
| REACH SVHC | > 0.1% w/w | `exceedsSvhcThreshold` |
| RoHS Lead | > 0.1% w/w | `isRestricted` |
| RoHS Cadmium | > 0.01% w/w | `isRestricted` |
| REACH Authorization | Any presence | `requiresAuthorization` |

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
│   ├── /classifications          ← HS/CN codes (NEW)
│   ├── /substances               ← ECHA substance registry (NEW)
│   ├── /categories               ← System + tenant categories
│   │   └── /:id/attributes       ← Attributes for category
│   └── /attributes               ← Direct attribute management
│
├── /products
│   └── /:id/versions/:versionId
│       ├── /attributes           ← Get/set attribute values
│       └── /substances/rollup    ← Rolled-up substances from BOM (NEW)
│
├── /materials
│   └── /:id/versions/:versionId
│       └── /substances           ← Substance declarations (NEW)
│
└── /admin
    └── /taxonomy                 ← Platform admin only
        ├── /units                ← Manage UNECE units
        ├── /classifications      ← Manage HS/CN codes (NEW)
        ├── /substances           ← Manage ECHA substances (NEW)
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

### 8.3 Classifications (Read-only for tenants)

```
GET  /api/v1/taxonomy/classifications
     Query: ?system=HS|CN&level=0|1|2&parent=8471
     Returns: List of classification codes, filtered

GET  /api/v1/taxonomy/classifications/:code
     Returns: Single classification with description

GET  /api/v1/taxonomy/classifications/:code/children
     Returns: Child classifications under this code
```

### 8.4 Substances (Read-only for tenants)

```
GET  /api/v1/taxonomy/substances
     Query: ?svhc=true&restricted=true&search=acetone
     Returns: List of substances matching filters

GET  /api/v1/taxonomy/substances/:casNumber
     Returns: Single substance with regulatory status and aliases

GET  /api/v1/taxonomy/substances/:casNumber/aliases
     Returns: All names for this substance

GET  /api/v1/taxonomy/substances/regulated
     Returns: All regulated substances (SVHC + Auth + Restricted)
```

**Response example:**

```json
// GET /api/v1/taxonomy/substances/127-19-5
{
  "data": {
    "casNumber": "127-19-5",
    "ecNumber": "204-826-4",
    "primaryName": "N,N-Dimethylacetamide",
    "molecularFormula": "C4H9NO",
    "molecularWeight": "87.1204",
    "isSvhc": true,
    "requiresAuthorization": true,
    "isRestricted": false,
    "sunsetDate": "2025-02-28",
    "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.004.389",
    "aliases": [
      { "name": "DMAC", "type": "COMMON" },
      { "name": "Dimethylacetamide", "type": "SYNONYM" }
    ]
  }
}
```

### 8.5 Material Substances (Tenant-scoped)

```
GET  /api/v1/materials/:id/versions/:versionId/substances
     Returns: Substance declarations for this material version

POST /api/v1/materials/:id/versions/:versionId/substances
     Body: {
       casNumber: "127-19-5",
       concentrationPct: "8.0",
       basis: "WEIGHT",
       isIntentionallyAdded: true,
       verificationSource: "Supplier SDS dated 2024-01-15"
     }
     Creates: MaterialSubstance record with audit trail

PATCH /api/v1/materials/:id/versions/:versionId/substances/:casNumber
      Body: { concentrationPct?, verificationSource?, notes? }
      Updates: Substance declaration

DELETE /api/v1/materials/:id/versions/:versionId/substances/:casNumber
       Removes: Substance declaration from material version
```

### 8.6 Product Substance Rollup

```
GET  /api/v1/products/:id/versions/:versionId/substances/rollup
     Returns: Rolled-up substances from BOM with effective concentrations

     Response: {
       data: [
         {
           substance: { casNumber, primaryName, isSvhc, ... },
           effectiveConcentrationPct: "0.4",
           sources: [
             { materialName, materialVersion, bomSharePct, concentrationPct }
           ],
           regulatoryFlags: {
             exceedsSvhcThreshold: true,
             requiresAuthorization: true,
             isRestricted: false
           }
         }
       ],
       meta: { totalSubstances: 2, flaggedCount: 1 }
     }
```

### 8.7 Categories

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

### 8.8 Attributes

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

### 8.9 Product Attribute Values

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

### 8.10 Admin Routes (Platform only)

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

### 8.11 Response Format Example

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

### 8.12 Authorization Matrix

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

**Goal:** UNECE unit system working, bulk import infrastructure, conversion service operational

**Entities:**
- `UnitDefinition` (public schema) - add `sourceVersion` field
- `SeedVersion` (public schema) - NEW, tracks seeded data versions

**Deliverables:**

| Item | Description |
|------|-------------|
| UNECE data bundle | Download Rec 20 Rev17, convert to `data/unece-rec20.json` (~1,800 units) |
| `BulkImportService` | COPY-based import for large datasets |
| `SeedVersion` entity | Track what's been seeded and when |
| CLI command | `pnpm db:seed:units` (deployment task, not startup) |
| `UnitDefinition` entity | Add `sourceVersion` field |
| `UnitConversionService` | Convert between units in same system |
| Unit API routes | `GET /units`, `GET /units/:code`, `GET /units/convert` |
| Unit tests | Conversion accuracy, bulk import idempotency |

**Acceptance Criteria:**
- [ ] `GET /api/v1/taxonomy/units?system=MASS` returns kg, g, oz, lb, etc.
- [ ] `GET /api/v1/taxonomy/units/convert?from=OZA&to=KGM&value=8` returns 0.2267962
- [ ] Conversion preserves precision to 10 decimal places
- [ ] `pnpm db:seed:units` is idempotent (safe to run multiple times)
- [ ] Full ~1,800 UNECE units available (not just ~200)

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

### Phase 5: Product Classifications

**Goal:** HS/CN code registry for trade/customs categorization

**Entities:**
- `ProductClassification` (public schema)

**Deliverables:**

| Item | Description |
|------|-------------|
| HS/CN data bundles | Download WCO HS2022, EU CN2024 to `data/` |
| `ProductClassification` entity | Code, system, description, parent hierarchy |
| `ClassificationSystem` enum | HS, CN, TARIC |
| CLI command | `pnpm db:seed:classifications` |
| Classification API routes | List, get, children |
| Product.classificationCode | Soft link to classification |
| Tests | Hierarchy traversal, search |

**Acceptance Criteria:**
- [ ] `GET /api/v1/taxonomy/classifications?system=HS&level=1` returns chapter headings
- [ ] `GET /api/v1/taxonomy/classifications/8471.30/children` returns subheadings
- [ ] Products can be assigned a classification code
- [ ] ~20,000 HS/CN codes imported via COPY

---

### Phase 6: Substance Registry

**Goal:** ECHA substance reference data with regulatory status

**Entities:**
- `Substance` (public schema)
- `SubstanceAlias` (public schema)

**Deliverables:**

| Item | Description |
|------|-------------|
| ECHA data bundles | Download SVHC, Authorisation, Restriction lists |
| `Substance` entity | CAS, EC number, regulatory flags, dates |
| `SubstanceAlias` entity | Multiple names per substance |
| `isValidCasNumber()` utility | Checksum validation |
| `@BeforeCreate` hook | Validate CAS on insert |
| CLI commands | `pnpm db:seed:echa-svhc`, etc. |
| Substance API routes | List, get, aliases, regulated |
| Tests | CAS validation, regulatory filtering |

**Acceptance Criteria:**
- [ ] `GET /api/v1/taxonomy/substances?svhc=true` returns SVHC candidates
- [ ] `GET /api/v1/taxonomy/substances/127-19-5` returns DMAC with aliases
- [ ] Invalid CAS numbers rejected with clear error
- [ ] ~370 regulated substances imported (SVHC + Auth + Restriction)

---

### Phase 7: Material-Substance Linking

**Goal:** Connect substances to material versions with audit trail

**Entities:**
- `MaterialSubstance` (tenant schema)

**Deliverables:**

| Item | Description |
|------|-------------|
| `MaterialSubstance` entity | Version-linked, concentration, verification |
| Cross-schema FK | Soft link to `public.substance` |
| Database trigger | Enforce `targetType = MATERIAL` |
| `MaterialSubstanceService` | CRUD with validation |
| Material substances API | List, add, update, remove |
| Verification audit trail | User, timestamp, source |
| Tests | CRUD, validation errors, cross-schema |

**Acceptance Criteria:**
- [ ] Substances can only be added to MATERIAL products
- [ ] `POST` validates CAS checksum before creating
- [ ] Verification audit trail captured (who, when, source)
- [ ] Concentration stored with 6 decimal precision

---

### Phase 8: Substance Rollup & Compliance

**Goal:** Aggregate substances through BOM, integrate with Regulatory Advisor

**Deliverables:**

| Item | Description |
|------|-------------|
| `SubstanceRollupService` | Calculate effective concentrations |
| BOM traversal | Walk hierarchy, aggregate by CAS |
| Substance rule templates | SVHC threshold, RoHS restricted, Auth required |
| PreFlight integration | Evaluate substance rules |
| Rollup API | `GET /products/:id/versions/:vid/substances/rollup` |
| Tests | Rollup calculations, rule evaluation |

**Acceptance Criteria:**
- [ ] Effective concentration calculated correctly (bomShare × substanceConc)
- [ ] Same substance in multiple materials aggregated (summed)
- [ ] SVHC > 0.1% flagged automatically
- [ ] PreFlight includes substance findings

---

### Phase 9: DPP & Reporting

**Goal:** Include substance declarations in Digital Product Passport

**Deliverables:**

| Item | Description |
|------|-------------|
| DPP substance schema | Add substances section to payload |
| DPP issuance update | Include rolled-up substances |
| Compliance statement | Generate based on findings |
| Substance report API | Export CSV/PDF |
| SCIP format support | EU ECHA SCIP database export |
| Tests | DPP validation, report generation |

**Acceptance Criteria:**
- [ ] DPP includes substance declarations with effective concentrations
- [ ] Compliance statement auto-generated based on SVHC presence
- [ ] SCIP-compatible export available

---

### Phase 10: CLP Inventory (Optional)

**Goal:** Import full 130,000 CLP substance inventory for comprehensive search

**Deliverables:**

| Item | Description |
|------|-------------|
| CLP data bundle | Download EU CLP Inventory CSV |
| COPY-based import | Handle 130k records efficiently |
| Extended Substance fields | Hazard classifications |
| Search optimization | Indexes for large dataset |
| Tests | Performance benchmarks |

**Acceptance Criteria:**
- [ ] 130,000 substances imported in < 60 seconds
- [ ] Search returns results in < 100ms
- [ ] Hazard classifications available for labeling

---

### Dependency Graph

```
Phase 1 ─────────────────┐
(Units + Bulk Import)    │
                         ▼
Phase 2 ◄────────────────┤
(Categories/Attributes)  │
                         ├───────────────────────────┐
                         ▼                           ▼
Phase 3 ◄────────────────┤                    Phase 5
(Product Values)         │                    (Classifications)
                         ▼                           │
Phase 4 ◄────────────────┤                           │
(Attribute Rollups)      │                           │
                         │                           │
Phase 6 ◄────────────────┴───────────────────────────┘
(Substance Registry)     ← Uses bulk import from Phase 1
         │
         ▼
Phase 7 ◄────────────────┐
(Material-Substance)     │
         │               │
         ▼               │
Phase 8 ◄────────────────┘
(Substance Rollup)       ← Integrates with Phase 4 rollup patterns
         │
         ▼
Phase 9
(DPP Integration)
         │
         ▼
Phase 10 (Optional)
(CLP Full Import)
```

**Parallelization:** Phases 5 (Classifications) and 6 (Substances) can run in parallel after Phase 1.

---

### Estimated Scope

| Phase | New Entities | API Routes | Services | Tests |
|-------|--------------|------------|----------|-------|
| 1 | 2 | 3 | 2 | ~20 |
| 2 | 3 | 10 | 2 | ~40 |
| 3 | 0 (changes) | 4 | 3 | ~30 |
| 4 | 0 | 2 | 2 | ~25 |
| 5 | 1 | 3 | 1 | ~15 |
| 6 | 2 | 4 | 1 | ~20 |
| 7 | 1 | 4 | 1 | ~25 |
| 8 | 0 | 1 | 2 | ~20 |
| 9 | 0 | 2 | 1 | ~15 |
| 10 | 0 | 0 | 1 | ~10 |
| **Total** | **9** | **33** | **16** | **~220** |

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
| [05-design-workspace.md](./05-design-workspace.md) | Product/BOM usage of taxonomy, **substance declaration UI** |
| [06-operations-workspace.md](./06-operations-workspace.md) | Facility/Batch usage of taxonomy |
| [08-compliance-workspace.md](./08-compliance-workspace.md) | DPP attribute extraction, **substance declarations in DPP** |
| [Compliance Evaluation System](../guides/compliance-evaluation-system.md) | Requirement validation against attributes, **substance compliance rules** |

### Documents Requiring Updates

The following documents need updates to reflect the new Classifications and Substances features:

| Document | Required Updates |
|----------|------------------|
| `02-data-model.md` | Add `ProductClassification`, `Substance`, `SubstanceAlias`, `MaterialSubstance` entity DDL |
| `05-design-workspace.md` | Add substance declaration UI flow in Material Detail View and BOM Builder |
| `compliance-evaluation-system.md` | Substance-specific requirement types implemented via SubstanceScreenHandler |

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-23 | Initial design from brainstorm session |
| 1.1 | 2026-01-26 | Added Product Classifications (HS/CN), Substance Registry (ECHA), MaterialSubstance entity, Substance Rollup, bulk import strategy, expanded implementation phases |
