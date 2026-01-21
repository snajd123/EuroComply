# Taxonomy Engine Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** Brainstorming session - Shared Core Data Model

---

## 1. Overview

The Taxonomy Engine is the foundation of EuroComply's industry-agnostic architecture. It defines how categories, attributes, materials, and products relate to each other, enabling compliance-first data management across any industry vertical.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Industry-Agnostic** | Hierarchical categories with attribute inheritance |
| **Compliance-First** | Additive-only inheritance (children can't weaken parent rules) |
| **ESPR-Ready** | Roll-up calculations for material compliance |
| **Fast UX** | Workspace-scoped attributes, visibility controls |

---

## 2. Key Decisions

### 2.1 Product Identity Model

Products evolve through lifecycle stages, each adding identifiers:

| Identifier Type | Requirement | Stage | Purpose |
|-----------------|-------------|-------|---------|
| **System UUID** | Mandatory (Auto) | Creation | Internal database relations |
| **Internal ID** | Mandatory (User) | R&D | Human-readable name (e.g., `PROTO-V1-2026`) |
| **SKU** | Optional | Manufacturing | ERP/warehouse sync |
| **GTIN / EAN** | Required for DPP | Commercialization | Retail and compliance |
| **DPP URI** | Generated | DPP Issuance | Permanent web address |

**Decision:** Multi-identifier collection, not single GTIN column.

### 2.2 Category Structure

**Decision:** Hierarchical tree (Option B) with LTREE for fast queries.

Why:
- Inheritance for speed (define once at root, inherit down)
- Regulatory alignment (EU laws written hierarchically)
- Avoids faceted conflicts (multi-parent creates rule ambiguity)

### 2.3 Attribute Inheritance

**Decision:** Additive-only (Option B) - children can strengthen, never weaken.

| Constraint | Parent → Child Rule |
|------------|---------------------|
| `is_required` | Can upgrade (false→true), never downgrade |
| `data_type` | Locked forever |
| `validation_rules` | Can strengthen, never weaken |
| `is_visible` | Child can hide in UI, but data persists |

### 2.4 Materials Model

**Decision:** Materials as first-class entities (Option B).

- Materials are Products with `product_type: RAW_MATERIAL`
- Use same Taxonomy Engine (categories, attributes, compliance)
- Enables supplier links, certifications, recycled content tracking
- BOM entries link materials to finished goods with quantities

### 2.5 Versioning

**Decision:** Per-workspace versions (Option A) + audit trail (Option C).

- Each workspace owns its versions independently
- RELEASED versions are immutable
- Full attribute-level audit log for EU compliance
- DPP snapshots freeze specific version references

---

## 3. Data Model

### 3.1 Category Hierarchy

```sql
CREATE TABLE category (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,                    -- NULL = system/global category
  parent_id       UUID REFERENCES category(id),
  code            VARCHAR(50) NOT NULL,    -- "APPAREL.TOPS.TSHIRTS"
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  icon            VARCHAR(50),
  depth           INT NOT NULL DEFAULT 0,
  path            LTREE NOT NULL,          -- PostgreSQL tree extension
  regulation_refs JSONB,                   -- ["ESPR", "WEEE", "RoHS"]
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT category_code_unique UNIQUE (organization_id, code)
);

-- Indexes for fast tree queries
CREATE INDEX idx_category_path ON category USING GIST (path);
CREATE INDEX idx_category_parent ON category (parent_id);
CREATE INDEX idx_category_org ON category (organization_id);
```

### 3.2 Unit Systems

```sql
CREATE TYPE unit_system AS ENUM (
  'MASS',        -- kg, g, mg, lb, oz
  'LENGTH',      -- m, cm, mm, in, ft
  'AREA',        -- m², ft²
  'VOLUME',      -- L, mL, gal, fl oz
  'ENERGY',      -- kWh, J, BTU
  'TEMPERATURE', -- °C, °F, K
  'PERCENTAGE',  -- %
  'COUNT',       -- pcs, units
  'TIME',        -- years, months, days, hours
  'CURRENCY'     -- EUR, USD, GBP
);

CREATE TABLE unit_definition (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system       unit_system NOT NULL,
  code         VARCHAR(20) NOT NULL,      -- "kg", "lb"
  name         VARCHAR(50) NOT NULL,      -- "Kilogram", "Pound"
  symbol       VARCHAR(10) NOT NULL,      -- "kg", "lb"
  to_base      DECIMAL NOT NULL,          -- Conversion factor to base unit
  is_base      BOOLEAN DEFAULT false,     -- kg is base for MASS

  CONSTRAINT unit_code_unique UNIQUE (system, code)
);

-- Example unit definitions
INSERT INTO unit_definition (system, code, name, symbol, to_base, is_base) VALUES
  ('MASS', 'kg', 'Kilogram', 'kg', 1, true),
  ('MASS', 'g', 'Gram', 'g', 0.001, false),
  ('MASS', 'lb', 'Pound', 'lb', 0.453592, false),
  ('LENGTH', 'm', 'Meter', 'm', 1, true),
  ('LENGTH', 'cm', 'Centimeter', 'cm', 0.01, false);
```

### 3.3 Attribute Types

```sql
CREATE TYPE attribute_type AS ENUM (
  'TEXT',              -- Simple text
  'NUMBER',            -- Numeric without unit
  'NUMBER_UNIT',       -- Numeric with unit (enforced system)
  'SELECT_SINGLE',     -- Single choice from list
  'SELECT_MULTI',      -- Multiple choices from list
  'BOOLEAN',           -- True/false toggle
  'DATE',              -- Date picker
  'RANGE',             -- Min/max with optional unit
  'RICH_TEXT',         -- HTML/markdown content
  'FILE',              -- Reference to uploaded file
  'COMPOSITE_PCT',     -- Material breakdown (must sum to 100%)
  'REFERENCE',         -- Link to another entity
  'EXTERNAL_URI'       -- Validated URL (e.g., certification link)
);

CREATE TYPE rollup_method AS ENUM (
  'NONE',              -- No roll-up (manual entry only)
  'SUM',               -- Add all child values
  'WEIGHTED_AVG',      -- (Child × Quantity) / Total
  'BOOLEAN_OR',        -- True if ANY child is true
  'BOOLEAN_AND',       -- True if ALL children are true
  'COLLECTION',        -- List unique values from children
  'MIN',               -- Minimum across children
  'MAX'                -- Maximum across children
);

CREATE TYPE workspace_type AS ENUM (
  'DESIGN',
  'OPERATIONS',
  'MARKETING',
  'COMPLIANCE'
);
```

### 3.4 Attribute Templates

```sql
CREATE TABLE attribute_template (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID NOT NULL REFERENCES category(id),
  code            VARCHAR(100) NOT NULL,
  label           VARCHAR(255) NOT NULL,
  description     TEXT,
  type            attribute_type NOT NULL,
  unit_system     unit_system,             -- Required for NUMBER_UNIT, RANGE
  is_required     BOOLEAN DEFAULT false,
  is_inherited    BOOLEAN DEFAULT true,
  is_visible      BOOLEAN DEFAULT true,
  workspace       workspace_type NOT NULL,
  constraints     JSONB,                   -- Validation rules
  display_order   INT DEFAULT 0,
  rollup_method   rollup_method DEFAULT 'NONE',
  rollup_source   VARCHAR(100),            -- Code of child attribute to roll up
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT attr_template_unique UNIQUE (category_id, code)
);

CREATE INDEX idx_attr_template_category ON attribute_template (category_id);
CREATE INDEX idx_attr_template_workspace ON attribute_template (workspace);
```

**Constraints JSONB Examples:**

```jsonc
// Number with range
{ "min": 0, "max": 100 }

// Select options
{ "options": ["lithium-ion", "nickel-metal-hydride", "lead-acid"] }

// Composite % (materials must sum to 100)
{ "sum_to": 100, "material_category": "RAW_MATERIALS" }

// Reference (entity type)
{ "entity_type": "supplier", "workspace": "OPERATIONS" }

// External URI (validation pattern)
{ "pattern": "^https://", "fetch_metadata": true }
```

### 3.5 Product (Unified Entity)

```sql
CREATE TYPE product_type AS ENUM (
  'FINISHED_GOOD',   -- End product sold to consumers
  'RAW_MATERIAL',    -- Base materials (cotton, steel, etc.)
  'COMPONENT',       -- Assembled parts (zippers, buttons, etc.)
  'VARIANT'          -- Size/color variant of parent product
);

CREATE TYPE product_status AS ENUM (
  'ACTIVE',
  'ARCHIVED'
);

CREATE TABLE product (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL,
  category_id        UUID NOT NULL REFERENCES category(id),
  parent_id          UUID REFERENCES product(id),  -- For variants
  product_type       product_type NOT NULL DEFAULT 'FINISHED_GOOD',
  name               VARCHAR(255) NOT NULL,
  status             product_status NOT NULL DEFAULT 'ACTIVE',

  -- Current versions per workspace
  current_design_version_id      UUID,
  current_marketing_version_id   UUID,
  current_operations_version_id  UUID,

  -- Checkout locks
  design_checked_out_by     UUID,
  design_checked_out_at     TIMESTAMPTZ,
  marketing_checked_out_by  UUID,
  marketing_checked_out_at  TIMESTAMPTZ,

  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_product_org ON product (organization_id);
CREATE INDEX idx_product_category ON product (category_id);
CREATE INDEX idx_product_parent ON product (parent_id);
CREATE INDEX idx_product_type ON product (product_type);
```

### 3.6 Product Identifiers

```sql
CREATE TYPE identifier_type AS ENUM (
  'INTERNAL',    -- Internal project code
  'SKU',         -- Stock keeping unit
  'GTIN',        -- Global Trade Item Number (barcode)
  'DPP_URI'      -- Digital Product Passport URI
);

CREATE TABLE product_identifier (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  type         identifier_type NOT NULL,
  value        VARCHAR(255) NOT NULL,
  is_primary   BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT identifier_product_type_unique UNIQUE (product_id, type)
);

-- Prevent duplicate identifiers within organization
CREATE UNIQUE INDEX idx_identifier_org_unique
  ON product_identifier (type, value)
  WHERE type IN ('GTIN', 'SKU');

CREATE INDEX idx_identifier_product ON product_identifier (product_id);
CREATE INDEX idx_identifier_lookup ON product_identifier (type, value);
```

### 3.7 Bill of Materials (BOM)

```sql
CREATE TABLE bom_entry (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_product_id   UUID NOT NULL REFERENCES product(id),
  child_product_id    UUID NOT NULL REFERENCES product(id),
  design_version_id   UUID NOT NULL,  -- Links to specific design version
  quantity            DECIMAL NOT NULL,
  unit                VARCHAR(20) NOT NULL,  -- "kg", "pcs", "m"
  position            INT DEFAULT 0,         -- Order in BOM
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT bom_entry_unique UNIQUE (parent_product_id, child_product_id, design_version_id),
  CONSTRAINT bom_no_self_reference CHECK (parent_product_id != child_product_id)
);

CREATE INDEX idx_bom_parent ON bom_entry (parent_product_id);
CREATE INDEX idx_bom_child ON bom_entry (child_product_id);
CREATE INDEX idx_bom_version ON bom_entry (design_version_id);
```

### 3.8 Workspace Versions

```sql
CREATE TYPE version_status AS ENUM (
  'DRAFT',
  'PENDING_REVIEW',
  'IN_REVIEW',
  'REJECTED',
  'RELEASED'
);

CREATE TABLE workspace_version (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES product(id),
  workspace       workspace_type NOT NULL,
  version_number  INT NOT NULL,
  status          version_status NOT NULL DEFAULT 'DRAFT',
  created_by      UUID NOT NULL,
  published_by    UUID,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT version_unique UNIQUE (product_id, workspace, version_number)
);

CREATE INDEX idx_version_product ON workspace_version (product_id);
CREATE INDEX idx_version_status ON workspace_version (status);
```

### 3.9 Product Attribute Values

```sql
CREATE TABLE product_attribute_value (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES product(id),
  template_id  UUID NOT NULL REFERENCES attribute_template(id),
  version_id   UUID NOT NULL REFERENCES workspace_version(id),
  value        JSONB NOT NULL,
  created_by   UUID NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT attr_value_unique UNIQUE (product_id, template_id, version_id)
);

CREATE INDEX idx_attr_value_product ON product_attribute_value (product_id);
CREATE INDEX idx_attr_value_template ON product_attribute_value (template_id);
CREATE INDEX idx_attr_value_version ON product_attribute_value (version_id);
CREATE INDEX idx_attr_value_jsonb ON product_attribute_value USING GIN (value);
```

**Value JSONB Examples:**

```jsonc
// Text
{ "val": "Premium Organic T-Shirt" }

// Number + Unit
{ "val": 250, "unit": "g" }

// Select Multi
{ "val": ["CE", "RoHS", "REACH"] }

// Composite % (Fiber Composition)
{
  "parts": [
    { "material_id": "uuid-cotton", "pct": 95 },
    { "material_id": "uuid-elastane", "pct": 5 }
  ]
}

// Reference (Supplier)
{ "entity": "supplier", "id": "uuid-supplier-123" }

// Range
{ "min": -20, "max": 60, "unit": "°C" }

// External URI
{ "url": "https://cert.example.com/doc/123", "verified": true, "verified_at": "2026-01-15T10:00:00Z" }
```

### 3.10 Audit Trail

```sql
CREATE TABLE attribute_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES product(id),
  template_id  UUID NOT NULL REFERENCES attribute_template(id),
  version_id   UUID REFERENCES workspace_version(id),
  old_value    JSONB,
  new_value    JSONB,
  changed_by   UUID NOT NULL,
  change_reason TEXT,
  changed_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_product ON attribute_audit_log (product_id);
CREATE INDEX idx_audit_template ON attribute_audit_log (template_id);
CREATE INDEX idx_audit_time ON attribute_audit_log (changed_at);
CREATE INDEX idx_audit_product_time ON attribute_audit_log (product_id, changed_at);
```

### 3.11 DPP Snapshot

```sql
CREATE TYPE dpp_status AS ENUM (
  'ACTIVE',
  'SUPERSEDED',
  'REVOKED'
);

CREATE TABLE dpp_snapshot (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES product(id),
  dpp_uri               VARCHAR(255) NOT NULL UNIQUE,
  design_version_id     UUID NOT NULL REFERENCES workspace_version(id),
  marketing_version_id  UUID REFERENCES workspace_version(id),
  operations_version_id UUID REFERENCES workspace_version(id),
  issued_by             UUID NOT NULL,
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  vc_credential         JSONB NOT NULL,       -- The signed Verifiable Credential
  credential_hash       VARCHAR(64) NOT NULL UNIQUE,
  issuer_did            VARCHAR(255) NOT NULL,
  status                dpp_status NOT NULL DEFAULT 'ACTIVE',
  r2_path               VARCHAR(500) NOT NULL,
  qr_code_url           VARCHAR(500) NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dpp_product ON dpp_snapshot (product_id);
CREATE INDEX idx_dpp_status ON dpp_snapshot (status);
CREATE INDEX idx_dpp_issued ON dpp_snapshot (issued_at);
```

---

## 4. Roll-up Calculation Logic

When a finished good needs compliance metrics calculated from its BOM:

```typescript
async function calculateRollup(
  productId: string,
  attributeCode: string,
  designVersionId: string
): Promise<RollupResult> {
  // 1. Get attribute template
  const template = await getAttributeTemplate(productId, attributeCode);

  if (template.rollup_method === 'NONE') {
    // Return direct value, no calculation
    return getDirectValue(productId, attributeCode, designVersionId);
  }

  // 2. Get BOM entries for this version
  const bomEntries = await getBomEntries(productId, designVersionId);

  // 3. Get child values
  const childValues = await Promise.all(
    bomEntries.map(entry => ({
      value: getAttributeValue(entry.child_product_id, template.rollup_source),
      quantity: entry.quantity,
      unit: entry.unit
    }))
  );

  // 4. Apply rollup method
  switch (template.rollup_method) {
    case 'SUM':
      return { val: sum(childValues.map(c => c.value)), unit: template.unit };

    case 'WEIGHTED_AVG':
      const totalQty = sum(childValues.map(c => c.quantity));
      const weightedSum = sum(childValues.map(c => c.value * c.quantity));
      return { val: weightedSum / totalQty, unit: '%' };

    case 'BOOLEAN_OR':
      return { val: childValues.some(c => c.value === true) };

    case 'BOOLEAN_AND':
      return { val: childValues.every(c => c.value === true) };

    case 'COLLECTION':
      return { val: [...new Set(childValues.flatMap(c => c.value))] };

    case 'MIN':
      return { val: Math.min(...childValues.map(c => c.value)), unit: template.unit };

    case 'MAX':
      return { val: Math.max(...childValues.map(c => c.value)), unit: template.unit };
  }
}
```

---

## 5. Example: T-Shirt with Materials

### Category Setup

```sql
-- Root categories (system-level, org_id = NULL)
INSERT INTO category (id, code, name, path, regulation_refs) VALUES
  ('cat-products', 'PRODUCTS', 'Products', 'products', NULL),
  ('cat-materials', 'MATERIALS', 'Raw Materials', 'materials', NULL);

-- Product categories
INSERT INTO category (id, parent_id, code, name, path, regulation_refs) VALUES
  ('cat-apparel', 'cat-products', 'APPAREL', 'Apparel', 'products.apparel', '["ESPR-TEXTILE"]'),
  ('cat-tops', 'cat-apparel', 'TOPS', 'Tops', 'products.apparel.tops', '["ESPR-TEXTILE"]');

-- Material categories
INSERT INTO category (id, parent_id, code, name, path) VALUES
  ('cat-fibers', 'cat-materials', 'FIBERS', 'Textile Fibers', 'materials.fibers');
```

### Attribute Templates

```sql
-- Global attributes (on root PRODUCTS category)
INSERT INTO attribute_template (category_id, code, label, type, workspace, is_required, is_inherited) VALUES
  ('cat-products', 'weight', 'Weight', 'NUMBER_UNIT', 'DESIGN', true, true),
  ('cat-products', 'country_of_origin', 'Country of Origin', 'SELECT_SINGLE', 'OPERATIONS', true, true);

-- Apparel-specific (inherited by TOPS)
INSERT INTO attribute_template (category_id, code, label, type, workspace, rollup_method, rollup_source) VALUES
  ('cat-apparel', 'recycled_content_pct', 'Recycled Content', 'NUMBER_UNIT', 'DESIGN', 'WEIGHTED_AVG', 'recycled_content_pct'),
  ('cat-apparel', 'fiber_composition', 'Fiber Composition', 'COMPOSITE_PCT', 'DESIGN', 'NONE', NULL);

-- Material attributes
INSERT INTO attribute_template (category_id, code, label, type, workspace, is_required) VALUES
  ('cat-fibers', 'recycled_content_pct', 'Recycled Content %', 'NUMBER_UNIT', 'DESIGN', true),
  ('cat-fibers', 'certification', 'Certification', 'SELECT_MULTI', 'COMPLIANCE', false);
```

### Products and BOM

```sql
-- Materials
INSERT INTO product (id, category_id, product_type, name) VALUES
  ('mat-cotton', 'cat-fibers', 'RAW_MATERIAL', 'Organic Cotton'),
  ('mat-elastane', 'cat-fibers', 'RAW_MATERIAL', 'Elastane');

-- Finished good
INSERT INTO product (id, category_id, product_type, name) VALUES
  ('prod-tshirt', 'cat-tops', 'FINISHED_GOOD', 'Premium T-Shirt');

-- BOM entries
INSERT INTO bom_entry (parent_product_id, child_product_id, design_version_id, quantity, unit) VALUES
  ('prod-tshirt', 'mat-cotton', 'ver-design-1', 0.95, 'ratio'),
  ('prod-tshirt', 'mat-elastane', 'ver-design-1', 0.05, 'ratio');
```

---

## 6. API Endpoints

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
GET    /api/v1/products                      # List products (filterable)
GET    /api/v1/products/:id                  # Get product with current versions
POST   /api/v1/products                      # Create product
PUT    /api/v1/products/:id                  # Update product
DELETE /api/v1/products/:id                  # Archive product
```

### Product Attributes

```
GET    /api/v1/products/:id/attributes       # Get all attribute values
PUT    /api/v1/products/:id/attributes       # Bulk update attributes
GET    /api/v1/products/:id/attributes/rollup # Calculate roll-ups from BOM
```

### BOM

```
GET    /api/v1/products/:id/bom              # Get BOM for product
PUT    /api/v1/products/:id/bom              # Update BOM (creates new design version)
GET    /api/v1/products/:id/bom/tree         # Get full BOM tree (recursive)
```

---

## 7. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from brainstorming session |

---

## 8. Related Documents

- [Architecture Design](./2026-01-15-architecture-design.md) - System architecture
- [User Management Design](./2026-01-15-user-management-design.md) - Workspace authorities
- [Verifiable Credentials Design](./2026-01-15-verifiable-credentials-design.md) - DPP issuance
- [EPCIS Design](./2026-01-15-epcis-design.md) - Supply chain events
