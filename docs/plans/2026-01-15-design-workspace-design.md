# Design Workspace (PLM) Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** Brainstorming session - Design Workspace

---

## 1. Overview

The Design Workspace is where products are "born" - from concept to release-ready technical specifications. It implements full PLM (Product Lifecycle Management) functionality with compliance-first principles.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Category-First** | Product creation requires category selection to load correct attributes |
| **Version-Locked** | All changes tied to a design version; RELEASED = immutable |
| **Diff-Before-Release** | System generates change summary before any release |
| **Reason-Coded** | Every status transition requires documented reason |
| **Evidence-Linked** | Documents and facilities attached at version level |

### Ownership

| Owns | Description |
|------|-------------|
| Design versions | Version lifecycle (DRAFT → RELEASED) |
| Material library | Reusable materials as product entities |
| BOM relationships | Bill of Materials with facility links |
| Technical specs | Category-driven attributes |
| Technical documents | CAD, drawings, spec sheets |

---

## 2. Authority Model

> **Reference:** See [User Management Design](./2026-01-15-user-management-design.md) for complete authority model.

| Authority | Design Workspace Capabilities |
|-----------|------------------------------|
| **MANAGER** | Full CRUD, direct release, approve, workspace settings |
| **EDITOR** | Direct release, approve contributors' work |
| **CONTRIBUTOR** | Edit drafts, submit for review (needs approval) |
| **VIEWER** | Read-only access |

---

## 3. Module Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DESIGN WORKSPACE (PLM)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CORE MODULES                                                               │
│  ────────────                                                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Product    │  │  Material   │  │    BOM      │  │  Technical  │        │
│  │  Registry   │  │   Library   │  │   Builder   │  │    Specs    │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                   │                                          │
│  INTEGRITY MODULES                ▼                                          │
│  ─────────────────    ┌─────────────────────┐                               │
│  ┌─────────────┐      │   VERSION MANAGER   │                               │
│  │   Version   │      │  (Diff + Release)   │                               │
│  │ Comparison  │◄────►│                     │                               │
│  └─────────────┘      └──────────┬──────────┘                               │
│  ┌─────────────┐                 │                                          │
│  │   Change    │                 │                                          │
│  │  Requests   │◄────────────────┤                                          │
│  └─────────────┘                 │                                          │
│  ┌─────────────┐                 │                                          │
│  │  Document   │                 │                                          │
│  │ Attachments │◄────────────────┤                                          │
│  └─────────────┘                 │                                          │
│  ┌─────────────┐                 │                                          │
│  │  Facility   │                 │                                          │
│  │   Links     │◄────────────────┘                                          │
│  └─────────────┘                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. BOM Builder

### 4.1 User Interface

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BOM BUILDER UI                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────┐  ┌───────────────────────────────┐ │
│  │         BOM LINE EDITOR             │  │      LIVE ROLL-UP SIDEBAR    │ │
│  ├─────────────────────────────────────┤  ├───────────────────────────────┤ │
│  │                                     │  │                               │ │
│  │  [🔍 Search materials/components...] │  │  TOTAL WEIGHT                │ │
│  │                                     │  │  ████████░░░░  2.45 kg        │ │
│  │  ┌─────────────────────────────────┐│  │                               │ │
│  │  │ Material         Qty    Unit    ││  │  RECYCLED CONTENT             │ │
│  │  ├─────────────────────────────────┤│  │  ████████████░  87.3%         │ │
│  │  │ Organic Cotton   0.95   ratio   ││  │                               │ │
│  │  │ Elastane         0.05   ratio   ││  │  HAZARDOUS MATERIALS          │ │
│  │  │ Brass Zipper     1      pcs     ││  │  ⚠️ None detected             │ │
│  │  │ [+ Add component]               ││  │                               │ │
│  │  └─────────────────────────────────┘│  │  COUNTRIES OF ORIGIN          │ │
│  │                                     │  │  🇮🇳 India, 🇨🇳 China          │ │
│  │  PRODUCTION PARAMETERS              │  │                               │ │
│  │  ┌─────────────────────────────────┐│  │  ─────────────────────────── │ │
│  │  │ Scrap Rate:  [ 3.5 ] %          ││  │  Last updated: Just now       │ │
│  │  │ Yield:       [ 96.5 ] %         ││  │  [Refresh calculations]       │ │
│  │  └─────────────────────────────────┘│  │                               │ │
│  │                                     │  └───────────────────────────────┘ │
│  └─────────────────────────────────────┘                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 BOM Data Model

```sql
CREATE TABLE bom_entry (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_product_id   UUID NOT NULL REFERENCES product(id),
    child_product_id    UUID NOT NULL REFERENCES product(id),
    design_version_id   UUID NOT NULL REFERENCES workspace_version(id),

    -- Quantity with unit enforcement
    quantity            DECIMAL NOT NULL,
    unit                VARCHAR(20) NOT NULL,

    -- Production parameters (for accurate EU reporting)
    scrap_rate_pct      DECIMAL DEFAULT 0,
    yield_pct           DECIMAL DEFAULT 100,

    -- Ordering and notes
    position            INT DEFAULT 0,
    notes               TEXT,

    -- Link to Operations (facility-level traceability)
    facility_id         UUID REFERENCES facility(id),

    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE(parent_product_id, child_product_id, design_version_id),
    CHECK(parent_product_id != child_product_id),
    CHECK(scrap_rate_pct >= 0 AND scrap_rate_pct <= 100),
    CHECK(yield_pct > 0 AND yield_pct <= 100)
);

CREATE INDEX idx_bom_parent ON bom_entry (parent_product_id);
CREATE INDEX idx_bom_child ON bom_entry (child_product_id);
CREATE INDEX idx_bom_version ON bom_entry (design_version_id);
CREATE INDEX idx_bom_facility ON bom_entry (facility_id);
```

### 4.3 Roll-up Calculation (Yield-Adjusted)

```typescript
/**
 * Calculate recycled content with scrap/yield adjustment.
 * This ensures accuracy for EU environmental reporting.
 */
async function calculateRecycledContent(
  productId: string,
  versionId: string
): Promise<{ value: number; unit: string }> {
  const bomEntries = await getBomEntries(productId, versionId);

  let totalWeight = 0;
  let recycledWeight = 0;

  for (const entry of bomEntries) {
    const material = await getProduct(entry.child_product_id);
    const materialRecycledPct = await getAttribute(material.id, 'recycled_content_pct');
    const materialWeight = await getAttribute(material.id, 'weight');

    // Adjust for scrap: actual material needed = quantity / yield
    const adjustedQty = entry.quantity / (entry.yield_pct / 100);
    const effectiveWeight = adjustedQty * materialWeight.val;

    totalWeight += effectiveWeight;
    recycledWeight += effectiveWeight * (materialRecycledPct.val / 100);
  }

  return {
    value: totalWeight > 0 ? (recycledWeight / totalWeight) * 100 : 0,
    unit: '%'
  };
}

/**
 * Calculate all roll-ups for live sidebar display.
 */
async function calculateAllRollups(
  productId: string,
  versionId: string
): Promise<RollupSummary> {
  const bomEntries = await getBomEntries(productId, versionId);

  return {
    totalWeight: await calculateRollup(productId, 'weight', 'SUM', versionId),
    recycledContent: await calculateRecycledContent(productId, versionId),
    containsHazardous: await calculateRollup(productId, 'is_hazardous', 'BOOLEAN_OR', versionId),
    countriesOfOrigin: await calculateRollup(productId, 'country_of_origin', 'COLLECTION', versionId)
  };
}
```

---

## 5. Diff Engine (Release Gateway)

### 5.1 Diff Display

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DIFF ENGINE - RELEASE GATEWAY                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  COMPARING: v2.0 (DRAFT) → v1.0 (RELEASED)                                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ⚠️  HIGH-IMPACT CHANGES (Requires acknowledgment)                       ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │  🔴 contains_hazardous: false → TRUE                                    ││
│  │     Impact: Product now requires REACH compliance documentation         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ATTRIBUTE CHANGES                                                        ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ Attribute              │ Old Value      │ New Value      │ Delta        ││
│  │────────────────────────│────────────────│────────────────│──────────────││
│  │ weight                 │ 2.40 kg        │ 2.45 kg        │ +2.1%        ││
│  │ recycled_content_pct   │ 85.0%          │ 87.3%          │ +2.3%        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ BOM CHANGES                                                              ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ 🟢 ADDED:   Recycled Polyester (5%, 0.12 kg)                            ││
│  │ 🔴 REMOVED: Elastane (was 5%)                                            ││
│  │ 🟡 MODIFIED: Organic Cotton (95% → 93%, scrap 3% → 3.5%)                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ DOCUMENT CHANGES                                                         ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ 🟡 REPLACED: Technical_Drawing_v1.pdf → Technical_Drawing_v2.pdf        ││
│  │ 🟢 ADDED:    Lab_Test_REACH_2026.pdf                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Validation Gate

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ❌ BLOCKERS (2 issues must be resolved)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  🔴 Material "Gold Plating" missing "conflict_minerals_status"              │
│     → [Go to Material]                                                      │
│  🔴 Material "Gold Plating" missing "facility_id"                           │
│     → [Go to Material]                                                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚠️  WARNINGS (1 optional issue)                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  🟡 Product missing "care_instructions" (recommended for Marketing)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Release Authorization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ RELEASE AUTHORIZATION                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Change Code: [▼ Select reason ]                                            │
│               ├─ MATERIAL_SUBSTITUTION                                      │
│               ├─ COST_OPTIMIZATION                                          │
│               ├─ REGULATORY_COMPLIANCE                                      │
│               ├─ QUALITY_IMPROVEMENT                                        │
│               └─ SUPPLIER_CHANGE                                            │
│                                                                              │
│  Narrative: [                                                        ]      │
│             [ Replaced Elastane with Recycled Polyester to improve  ]      │
│             [ sustainability score for ESPR compliance.              ]      │
│                                                                              │
│  ☑️ I acknowledge the HIGH-IMPACT changes above                             │
│                                                                              │
│  [Cancel]                              [Sign & Release v2.0]                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Diff Data Model

```sql
-- Change codes (reason taxonomy)
CREATE TYPE change_code AS ENUM (
    'MATERIAL_SUBSTITUTION',
    'COST_OPTIMIZATION',
    'REGULATORY_COMPLIANCE',
    'QUALITY_IMPROVEMENT',
    'SUPPLIER_CHANGE',
    'DESIGN_CORRECTION',
    'CUSTOMER_REQUEST',
    'OTHER'
);

-- High-impact attribute registry
CREATE TABLE high_impact_attribute (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_code  VARCHAR(100) NOT NULL UNIQUE,
    impact_level    VARCHAR(20) NOT NULL,  -- 'CRITICAL', 'HIGH', 'MEDIUM'
    alert_message   TEXT NOT NULL,
    requires_ack    BOOLEAN DEFAULT true
);

-- Seed high-impact attributes
INSERT INTO high_impact_attribute (attribute_code, impact_level, alert_message) VALUES
    ('contains_hazardous', 'CRITICAL', 'Product now requires REACH compliance documentation'),
    ('country_of_origin', 'HIGH', 'Origin change may affect import duties and certifications'),
    ('recycled_content_pct', 'MEDIUM', 'Sustainability claims must be updated'),
    ('conflict_minerals_status', 'CRITICAL', 'Conflict minerals disclosure required');

-- Version release record (governance trail)
CREATE TABLE version_release (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id          UUID NOT NULL REFERENCES workspace_version(id) UNIQUE,

    -- The diff snapshot (immutable record)
    diff_snapshot       JSONB NOT NULL,

    -- Governance fields
    change_code         change_code NOT NULL,
    narrative           TEXT NOT NULL,
    high_impact_ack     BOOLEAN DEFAULT false,

    -- Validation state at release
    blocker_count       INT NOT NULL DEFAULT 0,
    warning_count       INT NOT NULL DEFAULT 0,

    -- Signature
    released_by         UUID NOT NULL REFERENCES users(id),
    released_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    signature_did       VARCHAR(255) NOT NULL,
    signature_jws       TEXT NOT NULL,

    CONSTRAINT release_requires_narrative CHECK (LENGTH(narrative) >= 10),
    CONSTRAINT release_no_blockers CHECK (blocker_count = 0)
);
```

### 5.5 Diff Calculation Service

```typescript
interface VersionDiff {
  attributes: AttributeChange[];
  bom: BomChange[];
  documents: DocumentChange[];
  highImpact: HighImpactAlert[];
  validationErrors: ValidationError[];
  canRelease: boolean;
}

interface ValidationError {
  type: 'MISSING_ATTRIBUTE' | 'INVALID_VALUE' | 'MISSING_DOCUMENT' | 'BOM_INCOMPLETE';
  severity: 'BLOCKER' | 'WARNING';
  entityType: 'product' | 'material' | 'bom_entry';
  entityId: string;
  entityName: string;
  field: string;
  message: string;
}

async function calculateDiff(
  currentVersionId: string,
  previousVersionId: string | null
): Promise<VersionDiff> {
  const current = await getVersionSnapshot(currentVersionId);
  const previous = previousVersionId
    ? await getVersionSnapshot(previousVersionId)
    : null;

  const attributes = previous
    ? diffAttributes(current.attributes, previous.attributes)
    : current.attributes.map(a => ({ ...a, type: 'ADDED' }));

  const bom = previous
    ? diffBom(current.bom, previous.bom)
    : current.bom.map(b => ({ ...b, type: 'ADDED' }));

  const documents = previous
    ? diffDocuments(current.documents, previous.documents)
    : current.documents.map(d => ({ ...d, type: 'ADDED' }));

  const highImpact = await checkHighImpact(current.attributes, previous?.attributes);
  const validationErrors = await validateVersionCompleteness(currentVersionId);

  const blockers = validationErrors.filter(e => e.severity === 'BLOCKER');
  const hasUnackedHighImpact = highImpact.some(h => h.requiresAck);

  return {
    attributes,
    bom,
    documents,
    highImpact,
    validationErrors,
    canRelease: blockers.length === 0
  };
}

async function validateVersionCompleteness(versionId: string): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  const product = await getProductByVersion(versionId);
  const bomEntries = await getBomEntries(product.id, versionId);

  // 1. Check product has all required attributes
  const requiredAttrs = await getRequiredAttributes(product.category_id, 'DESIGN');
  for (const attr of requiredAttrs) {
    const value = await getAttributeValue(product.id, attr.id, versionId);
    if (!value) {
      errors.push({
        type: 'MISSING_ATTRIBUTE',
        severity: attr.validation_severity as 'BLOCKER' | 'WARNING',
        entityType: 'product',
        entityId: product.id,
        entityName: product.name,
        field: attr.code,
        message: `Required attribute "${attr.label}" is missing`
      });
    }
  }

  // 2. Check all BOM materials have required attributes
  for (const entry of bomEntries) {
    const material = await getProduct(entry.child_product_id);
    const materialAttrs = await getRequiredAttributes(material.category_id, 'DESIGN');

    for (const attr of materialAttrs) {
      const value = await getAttributeValue(material.id, attr.id);
      if (!value) {
        errors.push({
          type: 'MISSING_ATTRIBUTE',
          severity: attr.validation_severity as 'BLOCKER' | 'WARNING',
          entityType: 'material',
          entityId: material.id,
          entityName: material.name,
          field: attr.code,
          message: `Material "${material.name}" missing required "${attr.label}"`
        });
      }
    }

    // 3. Check facility links for regulated materials
    await validateFacilityLinks(entry, material, errors);
  }

  // 4. Check required documents
  const requiredDocs = await getRequiredDocuments(product.category_id);
  const attachedDocs = await getVersionDocuments(versionId);
  for (const reqDoc of requiredDocs) {
    const hasDoc = attachedDocs.some(d => d.document_type === reqDoc.document_type);
    if (!hasDoc) {
      errors.push({
        type: 'MISSING_DOCUMENT',
        severity: reqDoc.severity as 'BLOCKER' | 'WARNING',
        entityType: 'product',
        entityId: product.id,
        entityName: product.name,
        field: reqDoc.document_type,
        message: `Required document "${reqDoc.document_type}" is missing`
      });
    }
  }

  return errors;
}
```

---

## 6. Document Attachments

### 6.1 Principles

- **Version-Locked:** Documents attached to v1.0 stay with v1.0 forever
- **Inheritable:** v2.0 can reference v1.0 docs or upload new ones
- **Visibility Tags:** PUBLIC (DPP), INTERNAL (org only), AUDIT (regulators)

### 6.2 Data Model

```sql
CREATE TYPE document_visibility AS ENUM (
    'PUBLIC',     -- Included in DPP, consumer-facing
    'INTERNAL',   -- Organization users only
    'AUDIT'       -- Regulators/auditors on request
);

CREATE TYPE document_type AS ENUM (
    -- Technical (Design workspace)
    'TECHNICAL_DRAWING',
    'CAD_FILE',
    'SPECIFICATION_SHEET',

    -- Compliance (cross-workspace)
    'DECLARATION_OF_CONFORMITY',
    'LAB_TEST_REPORT',
    'CERTIFICATION',
    'REACH_DECLARATION',
    'CONFLICT_MINERALS_REPORT',

    -- Marketing (Marketing workspace)
    'PRODUCT_IMAGE',
    'LIFESTYLE_IMAGE',
    'USER_MANUAL',
    'CARE_INSTRUCTIONS'
);

CREATE TABLE document (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,

    -- File metadata
    filename        VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    size_bytes      BIGINT NOT NULL,
    r2_path         VARCHAR(500) NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,

    -- Classification
    document_type   document_type NOT NULL,
    visibility      document_visibility NOT NULL DEFAULT 'INTERNAL',

    -- Ownership
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Optional: expiration for time-limited certs
    valid_from      DATE,
    valid_until     DATE
);

CREATE TABLE version_document (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id      UUID NOT NULL REFERENCES workspace_version(id),
    document_id     UUID NOT NULL REFERENCES document(id),

    is_inherited    BOOLEAN DEFAULT false,
    replaced_doc_id UUID REFERENCES document(id),

    attached_by     UUID NOT NULL REFERENCES users(id),
    attached_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(version_id, document_id)
);

CREATE TABLE category_required_document (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID NOT NULL REFERENCES category(id),
    document_type   document_type NOT NULL,
    severity        VARCHAR(10) NOT NULL DEFAULT 'BLOCKER',

    UNIQUE(category_id, document_type)
);

CREATE INDEX idx_document_org ON document (organization_id);
CREATE INDEX idx_document_type ON document (document_type);
CREATE INDEX idx_document_expiry ON document (valid_until);
CREATE INDEX idx_version_doc_version ON version_document (version_id);
```

---

## 7. Facility Links (Bridge to Operations)

### 7.1 The Traceability Bridge

BOM entries link to **facilities** (not suppliers) for EU-compliant geographic traceability.

```
  DESIGN WORKSPACE              OPERATIONS WORKSPACE
  ────────────────              ────────────────────
  ┌─────────────┐               ┌─────────────────┐
  │  BOM Entry  │───────────────│    Facility     │
  │ (material)  │  facility_id  │  (physical)     │
  └─────────────┘               └────────┬────────┘
                                         │
                                ┌────────┴────────┐
                                │    Supplier     │
                                │  (legal entity) │
                                └────────┬────────┘
                                         │
                                ┌────────┴────────┐
                                │ Certifications  │
                                │ (facility-level)│
                                └─────────────────┘
```

> **Note:** Full Supplier/Facility data model defined in
> [Operations Workspace Design](./2026-01-15-operations-workspace-design.md)

### 7.2 Facility Validation

```typescript
async function validateFacilityLinks(
  entry: BomEntry,
  material: Product,
  errors: ValidationError[]
): Promise<void> {
  const category = await getCategory(material.category_id);

  // Check if category requires facility-level traceability
  const requiresTraceability =
    category.regulation_refs?.includes('CONFLICT_MINERALS') ||
    category.regulation_refs?.includes('EUDR') ||
    category.regulation_refs?.includes('REACH');

  if (requiresTraceability) {
    if (!entry.facility_id) {
      errors.push({
        type: 'BOM_INCOMPLETE',
        severity: 'BLOCKER',
        entityType: 'bom_entry',
        entityId: entry.id,
        entityName: material.name,
        field: 'facility_id',
        message: `"${material.name}" requires facility-level traceability`
      });
    } else {
      const facility = await getFacility(entry.facility_id);
      const supplier = await getSupplier(facility.supplier_id);

      // Check facility is verified
      if (facility.certification_status !== 'VERIFIED') {
        errors.push({
          type: 'BOM_INCOMPLETE',
          severity: 'WARNING',
          entityType: 'bom_entry',
          entityId: entry.id,
          entityName: material.name,
          field: 'facility_id',
          message: `Facility "${facility.name}" (${supplier.name}) is not verified`
        });
      }

      // Check for expiring facility certifications
      const expiringCerts = await getExpiringFacilityCerts(facility.id, 60);
      for (const cert of expiringCerts) {
        errors.push({
          type: 'BOM_INCOMPLETE',
          severity: 'WARNING',
          entityType: 'bom_entry',
          entityId: entry.id,
          entityName: material.name,
          field: 'facility_certification',
          message: `Facility "${facility.name}" ${cert.cert_type} expires in ${cert.daysRemaining} days`
        });
      }
    }
  }
}
```

---

## 8. API Endpoints

### Products

```
GET    /api/v1/design/products                    # List products
GET    /api/v1/design/products/:id                # Get product with current version
POST   /api/v1/design/products                    # Create product (requires category)
PUT    /api/v1/design/products/:id                # Update product
DELETE /api/v1/design/products/:id                # Archive product
```

### Versions

```
GET    /api/v1/design/products/:id/versions       # List all versions
GET    /api/v1/design/versions/:id                # Get version details
POST   /api/v1/design/products/:id/versions       # Create new draft version
POST   /api/v1/design/versions/:id/checkout       # Checkout version for editing
POST   /api/v1/design/versions/:id/checkin        # Checkin version
```

### BOM

```
GET    /api/v1/design/versions/:id/bom            # Get BOM for version
PUT    /api/v1/design/versions/:id/bom            # Update BOM entries
GET    /api/v1/design/versions/:id/bom/tree       # Get recursive BOM tree
GET    /api/v1/design/versions/:id/rollups        # Calculate all roll-ups
```

### Diff & Release

```
GET    /api/v1/design/versions/:id/diff           # Calculate diff vs previous
GET    /api/v1/design/versions/:id/validate       # Run validation checks
POST   /api/v1/design/versions/:id/release        # Sign and release version
```

### Documents

```
GET    /api/v1/design/versions/:id/documents      # List attached documents
POST   /api/v1/design/versions/:id/documents      # Attach document
DELETE /api/v1/design/versions/:id/documents/:docId  # Detach document
POST   /api/v1/design/documents                   # Upload new document
```

### Materials

```
GET    /api/v1/design/materials                   # List material library
GET    /api/v1/design/materials/:id               # Get material details
POST   /api/v1/design/materials                   # Create material
PUT    /api/v1/design/materials/:id               # Update material
```

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.2 | 2026-01-16 | Added cross-workspace flow diagram and related documents table |
| 0.1 | 2026-01-15 | Initial draft from brainstorming session |

---

## 10. Related Documents

| Document | Relationship |
|----------|--------------|
| [Marketing Workspace Design](./2026-01-15-marketing-workspace-design.md) | Downstream: Marketing enriches RELEASED design versions |
| [Operations Workspace Design](./2026-01-15-operations-workspace-design.md) | Downstream: Operations produces batches from design versions |
| [Compliance Workspace Design](./2026-01-15-compliance-workspace-design.md) | Downstream: Compliance snapshots Design data into DPPs |
| [Taxonomy Engine Design](./2026-01-15-taxonomy-engine-design.md) | Shared data model |
| [User Management Design](./2026-01-15-user-management-design.md) | Authority model |
| [Architecture Design](./2026-01-15-architecture-design.md) | System architecture |
| [Verifiable Credentials Design](./2026-01-15-verifiable-credentials-design.md) | DPP issuance |

### Design Version → DPP Flow

When a Design version is **RELEASED**, it becomes available for:
1. **Marketing** to enrich with consumer content
2. **Operations** to produce batches (with `design_version_id` reference)
3. **Compliance** to snapshot into DPPs (design data frozen at batch RELEASED)
