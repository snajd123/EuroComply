# Data Model (MikroORM)

**Status:** Active
**Last Updated:** 2026-01-26

---

## 1. Overview

EuroComply uses MikroORM with PostgreSQL for relational data. This document defines all entities and their relationships.

### Schema Architecture

```
eurocomply database
├── public                      -- Shared tables (platform-managed)
│   ├── organizations           -- Tenant registry
│   ├── regulation_documents    -- Official regulation PDFs
│   ├── regulation_anchors      -- Highlighted text coordinates
│   ├── marketplace_listings    -- Published templates
│   ├── ingestion_jobs          -- PDF processing jobs
│   ├── seed_version            -- Reference data version tracking
│   ├── unit_definition         -- UNECE Rec 20 units
│   ├── product_classification  -- HS/CN codes
│   ├── substance               -- ECHA substance registry
│   ├── substance_alias         -- Substance alternative names
│   ├── regulatory_list         -- Versioned regulatory lists (COSING, RoHS, etc.)
│   ├── regulatory_list_entry   -- Substances in regulatory lists
│   ├── category_regulatory_list -- Category-to-list LTREE mapping
│   └── regulatory_import_log   -- Admin import audit trail
│
└── tenant_{slug}               -- Per-tenant data
    ├── users
    ├── organization_users
    ├── products
    ├── product_identifiers
    ├── product_versions
    ├── bom_entries
    ├── material_substance      -- Substance declarations per material version (NEW)
    ├── dpp_snapshots
    ├── operations_events
    ├── outbox_events
    ├── audit_log
    ├── status_lists
    ├── status_list_entries
    ├── rule_templates          -- Compliance rules (org-specific)
    ├── reason_codes            -- Deviation justifications
    ├── readiness_profiles      -- Rule collections
    ├── readiness_profile_rules -- Profile-rule join with overrides
    ├── rule_deviations         -- Acknowledged gaps per DPP
    └── template_adoptions      -- Marketplace adoptions
```

### Entity Location

| Entity | Schema | Reason |
|--------|--------|--------|
| Organization | `public` | Tenant registry, routing |
| RegulationDocument | `public` | Shared across all tenants |
| RegulationAnchor | `public` | Shared legal references |
| MarketplaceListing | `public` | Discoverable by all tenants |
| RuleTemplate (SYSTEM) | `public` | Platform-managed rules |
| ReasonCode (SYSTEM) | `public` | Platform-managed codes |
| SeedVersion | `public` | Reference data version tracking |
| UnitDefinition | `public` | UNECE Rec 20 units (shared) |
| ProductClassification | `public` | HS/CN codes (shared international standard) |
| Substance | `public` | ECHA substance registry (shared) |
| SubstanceAlias | `public` | Substance names (shared) |
| RegulatoryList | `public` | Versioned regulatory lists (shared across tenants) |
| RegulatoryListEntry | `public` | Substance restrictions per list (shared) |
| CategoryRegulatoryList | `public` | Category-to-list LTREE mapping (shared) |
| RegulatoryImportLog | `public` | Admin import audit trail (shared) |
| MaterialSubstance | `tenant_{slug}` | Concentration data is proprietary |
| RuleTemplate (ORG) | `tenant_{slug}` | Tenant-specific rules |
| All others | `tenant_{slug}` | Tenant isolation |

---

## 2. Public Schema Entity

### Organization

```typescript
// packages/db/src/entities/Organization.ts
import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'organizations', schema: 'public' })
export class Organization {
  @PrimaryKey()
  id!: string;

  @Property()
  name!: string;

  @Property()
  @Unique()
  slug!: string;

  @Property({ name: 'schema_name' })
  @Unique()
  schemaName!: string;

  @Property({ name: 'cell_id', default: 'cell_1' })
  cellId!: string;

  @Property({ name: 'stripe_customer_id', nullable: true })
  stripeCustomerId?: string;

  @Property({ name: 'subscription_tier', default: 'starter' })
  subscriptionTier!: string;

  @Property({ name: 'subscription_status', default: 'active' })
  subscriptionStatus!: string;

  @Property({ name: 'user_limit', default: 20 })
  userLimit!: number;

  @Property({ name: 'storage_limit_bytes', type: 'bigint', default: 536870912000n })
  storageLimitBytes!: bigint;  // 500GB default

  @Property({ nullable: true })
  did?: string;

  // ─────────────────────────────────────────────────────────────
  // REGULATORY ADVISOR SETTINGS
  // See: docs/plans/13-regulatory-advisor.md Section 3
  // ─────────────────────────────────────────────────────────────

  @Property({ name: 'regulatory_advisor_enabled', default: true })
  regulatoryAdvisorEnabled!: boolean;

  @Property({ name: 'enforcement_mode', default: 'SILENT' })
  enforcementMode!: 'ENFORCING' | 'SILENT';

  @Property({ name: 'capture_compliance_in_silent_mode', default: true })
  captureComplianceInSilentMode!: boolean;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**DDL:**

```sql
CREATE TABLE public.organizations (
    id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    schema_name VARCHAR(100) UNIQUE NOT NULL,
    cell_id VARCHAR(50) DEFAULT 'cell_1',
    stripe_customer_id VARCHAR(255),
    subscription_tier VARCHAR(20) DEFAULT 'starter',
    subscription_status VARCHAR(20) DEFAULT 'active',
    user_limit INT DEFAULT 20,
    storage_limit_bytes BIGINT DEFAULT 536870912000,
    did VARCHAR(255),
    -- Regulatory Advisor settings (Opt-In Gentle defaults)
    regulatory_advisor_enabled BOOLEAN DEFAULT true,
    enforcement_mode VARCHAR(20) DEFAULT 'SILENT',  -- ENFORCING | SILENT
    capture_compliance_in_silent_mode BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_cell ON public.organizations(cell_id);
CREATE INDEX idx_organizations_tier ON public.organizations(subscription_tier);
```

### RegulationDocument

Official regulation PDFs stored in R2, shared across all tenants.

```typescript
// packages/db/src/entities/RegulationDocument.ts
import { Entity, PrimaryKey, Property, OneToMany, Collection, Index } from '@mikro-orm/core';

@Entity({ tableName: 'regulation_documents', schema: 'public' })
@Index({ properties: ['version'] })
export class RegulationDocument {
  @PrimaryKey()
  id!: string;

  @Property()
  title!: string; // "ESPR - Ecodesign for Sustainable Products Regulation"

  @Property()
  version!: string; // "EU 2024/1781"

  @Property({ name: 'r2_path' })
  r2Path!: string; // Path to immutable PDF in R2

  @Property({ name: 'content_hash', length: 64 })
  contentHash!: string; // SHA-256 hash for version pinning

  @Property({ name: 'effective_date' })
  effectiveDate!: Date;

  @Property({ name: 'sunset_date', nullable: true })
  sunsetDate?: Date;

  @Property({ name: 'total_pages' })
  totalPages!: number;

  @Property({ type: 'jsonb', nullable: true })
  metadata?: {
    jurisdiction: string;
    regulationType: string;
    officialJournalRef?: string;
  };

  @Property({ name: 'is_active', default: true })
  isActive!: boolean;

  @OneToMany(() => RegulationAnchor, anchor => anchor.document)
  anchors = new Collection<RegulationAnchor>(this);

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

### RegulationAnchor

Links specific text passages to coordinates in regulation PDFs.

```typescript
// packages/db/src/entities/RegulationAnchor.ts
import { Entity, PrimaryKey, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { RegulationDocument } from './RegulationDocument.js';

export enum AnchorStatus {
  DRAFT = 'DRAFT',
  VERIFIED = 'VERIFIED',
  TENANT = 'TENANT',
}

@Entity({ tableName: 'regulation_anchors', schema: 'public' })
@Unique({ properties: ['document', 'legalReference'] }) // Prevent duplicate anchors per document
@Index({ properties: ['document', 'legalReference'] })
export class RegulationAnchor {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => RegulationDocument, { name: 'document_id' })
  document!: RegulationDocument;

  @Property({ name: 'legal_reference', length: 100 })
  legalReference!: string; // "Article 7, Paragraph 2(a)"

  @Property({ name: 'text_snippet', type: 'text' })
  textSnippet!: string;

  @Property({ type: 'jsonb' })
  coordinates!: {
    page: number;
    x: number;      // Percentage (0-100)
    y: number;      // Percentage (0-100)
    width: number;
    height: number;
  };

  @Enum(() => AnchorStatus)
  status!: AnchorStatus;

  @Property({ name: 'verified_by', nullable: true })
  verifiedBy?: string;

  @Property({ name: 'verified_at', nullable: true })
  verifiedAt?: Date;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();
}
```

### MarketplaceListing

Published templates available for adoption by tenants.

```typescript
// packages/db/src/entities/MarketplaceListing.ts
import { Entity, PrimaryKey, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { Organization } from './Organization.js';

export enum ListingType {
  READINESS_PROFILE = 'READINESS_PROFILE',
  RULE_TEMPLATE = 'RULE_TEMPLATE',
  REASON_CODE_SET = 'REASON_CODE_SET',
}

export enum ListingStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  PUBLISHED = 'PUBLISHED',
  DEPRECATED = 'DEPRECATED',
}

@Entity({ tableName: 'marketplace_listings', schema: 'public' })
@Index({ properties: ['status', 'type'] })
export class MarketplaceListing {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => Organization, { name: 'publisher_id' })
  publisher!: Organization;

  @Enum(() => ListingType)
  type!: ListingType;

  @Property()
  title!: string;

  @Property({ type: 'text' })
  description!: string;

  @Property({ type: 'jsonb' })
  metadata!: {
    industry: string[];
    regulations: string[];
    version: string;
  };

  @Property({ name: 'linked_entity_type', length: 50 })
  linkedEntityType!: string;

  @Property({ name: 'linked_entity_id', length: 30 })
  linkedEntityId!: string;

  @Enum(() => ListingStatus)
  status!: ListingStatus;

  @Property({ nullable: true })
  price?: number; // EUR cents, NULL = free

  @Property({ name: 'adoption_count', default: 0 })
  adoptionCount!: number;

  @Property({ name: 'published_at', nullable: true })
  publishedAt?: Date;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**Public Schema DDL:**

```sql
-- Regulation documents (official PDFs)
CREATE TABLE public.regulation_documents (
    id VARCHAR(30) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    r2_path VARCHAR(500) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    effective_date DATE NOT NULL,
    sunset_date DATE,
    total_pages INT NOT NULL,
    metadata JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regulation_documents_version ON public.regulation_documents(version);
CREATE INDEX idx_regulation_documents_active ON public.regulation_documents(is_active);

-- Regulation anchors (highlighted text coordinates)
CREATE TABLE public.regulation_anchors (
    id VARCHAR(30) PRIMARY KEY,
    document_id VARCHAR(30) NOT NULL REFERENCES public.regulation_documents(id),
    legal_reference VARCHAR(100) NOT NULL,
    text_snippet TEXT NOT NULL,
    coordinates JSONB NOT NULL,
    status VARCHAR(20) NOT NULL,
    verified_by VARCHAR(30),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, legal_reference) -- Prevent duplicate anchors from AI ingestion
);

CREATE INDEX idx_regulation_anchors_document ON public.regulation_anchors(document_id);
CREATE INDEX idx_regulation_anchors_status ON public.regulation_anchors(status);

-- Marketplace listings
CREATE TABLE public.marketplace_listings (
    id VARCHAR(30) PRIMARY KEY,
    publisher_id VARCHAR(30) NOT NULL REFERENCES public.organizations(id),
    type VARCHAR(30) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB NOT NULL,
    linked_entity_type VARCHAR(50) NOT NULL,
    linked_entity_id VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL,
    price INT,
    adoption_count INT DEFAULT 0,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_marketplace_listings_status ON public.marketplace_listings(status, type);
CREATE INDEX idx_marketplace_listings_publisher ON public.marketplace_listings(publisher_id);

-- System rule templates (platform-managed compliance rules)
-- Note: organization_id = NULL indicates SYSTEM scope
CREATE TABLE public.rule_templates (
    id VARCHAR(30) PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    scope VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
    type VARCHAR(20) NOT NULL,
    rule_category VARCHAR(20) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    legal_anchor_id VARCHAR(30) REFERENCES public.regulation_anchors(id),
    active_from DATE NOT NULL,
    active_until DATE,
    validation_logic JSONB,
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_public_rule_templates_category ON public.rule_templates(rule_category);
CREATE INDEX idx_public_rule_templates_active ON public.rule_templates(active_from, active_until);

-- System reason codes (platform-managed deviation justifications)
CREATE TABLE public.reason_codes (
    id VARCHAR(30) PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    scope VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
    regulation_id VARCHAR(30) REFERENCES public.regulation_documents(id),
    requires_narrative BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_public_reason_codes_active ON public.reason_codes(is_active);

-- Ingestion jobs (AI-assisted regulation parsing)
CREATE TABLE public.ingestion_jobs (
    id VARCHAR(30) PRIMARY KEY,
    document_id VARCHAR(30) NOT NULL REFERENCES public.regulation_documents(id),
    status VARCHAR(20) NOT NULL,       -- PENDING, PROCESSING, REVIEW_READY, COMPLETED, FAILED
    phase VARCHAR(20) NOT NULL,        -- OCR, EXTRACTION, MAPPING, COMPLETE
    percent_complete INT DEFAULT 0,
    results JSONB,                     -- { extractedArticles, suggestedAnchors, unmappedSections }
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ingestion_jobs_document ON public.ingestion_jobs(document_id);
CREATE INDEX idx_ingestion_jobs_status ON public.ingestion_jobs(status);

-- Adoption count update function (called from application layer)
-- Note: Cross-schema triggers are complex; use application-level atomic updates:
-- BEGIN;
--   INSERT INTO tenant_{slug}.template_adoptions (...);
--   UPDATE public.marketplace_listings SET adoption_count = adoption_count + 1 WHERE id = $listing_id;
-- COMMIT;
```

### SeedVersion

Tracks seeded reference data versions to enable idempotent deployment seeds.

```typescript
// packages/database/src/entities/SeedVersion.ts
import { Entity, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

@Entity({ tableName: 'seed_version', schema: 'public' })
export class SeedVersion extends BaseEntity {
  @Property()
  @Unique()
  name!: string;        // "unece-rec20", "echa-svhc", "hs-codes"

  @Property()
  version!: string;     // "Rev17", "2024-01-15", "HS2022"

  @Property({ name: 'seeded_at' })
  seededAt!: Date;

  @Property({ type: 'int', default: 0, name: 'record_count' })
  recordCount!: number;
}
```

**DDL:**

```sql
CREATE TABLE public.seed_version (
    id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    version VARCHAR(50) NOT NULL,
    seeded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    record_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_seed_version_name ON public.seed_version(name);
```

### ProductClassification

HS/CN codes for product trade classification.

```typescript
// packages/database/src/entities/ProductClassification.ts
import { Entity, Property, Enum, Unique, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export enum ClassificationSystem {
  HS = 'HS',       // International (6 digits)
  CN = 'CN',       // EU Combined Nomenclature (8 digits)
  TARIC = 'TARIC'  // EU Tariff (10 digits)
}

@Entity({ tableName: 'product_classification', schema: 'public' })
@Index({ properties: ['system', 'level'] })
export class ProductClassification extends BaseEntity {
  @Property({ length: 20 })
  @Unique()
  code!: string;              // "8471.30" (HS) or "8471.30.00" (CN)

  @Enum(() => ClassificationSystem)
  system!: ClassificationSystem;

  @Property({ type: 'text' })
  description!: string;       // "Portable digital automatic data processing machines"

  @Property({ nullable: true, name: 'parent_code' })
  parentCode?: string;        // "8471" for "8471.30"

  @Property({ type: 'int', default: 0 })
  level!: number;             // 0=chapter, 1=heading, 2=subheading

  @Property({ default: true, name: 'is_active' })
  isActive!: boolean;

  @Property({ nullable: true, name: 'source_version' })
  sourceVersion?: string;     // "HS2022", "CN2024"
}
```

**DDL:**

```sql
CREATE TABLE public.product_classification (
    id VARCHAR(30) PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    system VARCHAR(10) NOT NULL,      -- HS, CN, TARIC
    description TEXT NOT NULL,
    parent_code VARCHAR(20),
    level INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    source_version VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_product_classification_system_level ON public.product_classification(system, level);
CREATE INDEX idx_product_classification_parent ON public.product_classification(parent_code);
```

### Substance

Chemical substance registry sourced from ECHA.

```typescript
// packages/database/src/entities/Substance.ts
import { Entity, Property, Unique, Index, OneToMany, Collection, BeforeCreate } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { SubstanceAlias } from './SubstanceAlias.js';
import { isValidCasNumber } from '../utils/cas-validator.js';

@Entity({ tableName: 'substance', schema: 'public' })
@Index({ properties: ['isSvhc', 'requiresAuthorization', 'isRestricted'] })
export class Substance extends BaseEntity {
  @Property({ length: 20 })
  @Unique()
  @Index()
  casNumber!: string;           // "127-19-5" (validated with checksum)

  @Property({ length: 20, nullable: true, name: 'ec_number' })
  ecNumber?: string;            // "204-826-4" (EU EC/EINECS number)

  @Property({ name: 'primary_name' })
  primaryName!: string;         // IUPAC or most common name

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'decimal', precision: 12, scale: 4, nullable: true, name: 'molecular_weight' })
  molecularWeight?: string;

  @Property({ length: 500, nullable: true, name: 'molecular_formula' })
  molecularFormula?: string;    // "C4H9NO"

  // Regulatory status from ECHA
  @Property({ default: false, name: 'is_svhc' })
  isSvhc!: boolean;             // SVHC Candidate List

  @Property({ default: false, name: 'requires_authorization' })
  requiresAuthorization!: boolean;  // Annex XIV

  @Property({ default: false, name: 'is_restricted' })
  isRestricted!: boolean;       // Annex XVII

  @Property({ type: 'text', nullable: true, name: 'restriction_conditions' })
  restrictionConditions?: string;   // "Max 0.1% in consumer products"

  @Property({ type: 'date', nullable: true, name: 'sunset_date' })
  sunsetDate?: Date;            // Authorization deadline

  @Property({ type: 'date', nullable: true, name: 'latest_application_date' })
  latestApplicationDate?: Date; // Last date to apply for authorization

  // Source tracking
  @Property({ nullable: true, name: 'echa_url' })
  echaUrl?: string;             // Link to ECHA substance page

  @Property({ nullable: true, name: 'source_version' })
  sourceVersion?: string;       // "SVHC-2024-01"

  @Property({ default: true, name: 'is_active' })
  isActive!: boolean;

  @OneToMany(() => SubstanceAlias, alias => alias.substance)
  aliases = new Collection<SubstanceAlias>(this);

  @BeforeCreate()
  validateCasNumber() {
    if (!isValidCasNumber(this.casNumber)) {
      throw new Error(`Invalid CAS number checksum: ${this.casNumber}`);
    }
  }
}
```

**DDL:**

```sql
CREATE TABLE public.substance (
    id VARCHAR(30) PRIMARY KEY,
    cas_number VARCHAR(20) NOT NULL UNIQUE,
    ec_number VARCHAR(20),
    primary_name VARCHAR(255) NOT NULL,
    description TEXT,
    molecular_weight DECIMAL(12, 4),
    molecular_formula VARCHAR(500),
    is_svhc BOOLEAN DEFAULT FALSE,
    requires_authorization BOOLEAN DEFAULT FALSE,
    is_restricted BOOLEAN DEFAULT FALSE,
    restriction_conditions TEXT,
    sunset_date DATE,
    latest_application_date DATE,
    echa_url VARCHAR(500),
    source_version VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_substance_cas ON public.substance(cas_number);
CREATE INDEX idx_substance_regulatory ON public.substance(is_svhc, requires_authorization, is_restricted);
CREATE INDEX idx_substance_name ON public.substance(primary_name);
```

### SubstanceAlias

Multiple names for a single substance.

```typescript
// packages/database/src/entities/SubstanceAlias.ts
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Substance } from './Substance.js';

export enum AliasType {
  IUPAC = 'IUPAC',
  COMMON = 'COMMON',
  TRADE = 'TRADE',
  SYNONYM = 'SYNONYM',
  INDEX_NAME = 'INDEX_NAME'     // CLP Index name
}

@Entity({ tableName: 'substance_alias', schema: 'public' })
@Unique({ properties: ['substance', 'name'] })
export class SubstanceAlias extends BaseEntity {
  @ManyToOne(() => Substance, { name: 'substance_id' })
  substance!: Substance;

  @Property()
  @Index()
  name!: string;                // Alternative name

  @Enum(() => AliasType)
  type!: AliasType;

  @Property({ length: 10, nullable: true })
  language?: string;            // "en", "de", "fr"
}
```

**DDL:**

```sql
CREATE TABLE public.substance_alias (
    id VARCHAR(30) PRIMARY KEY,
    substance_id VARCHAR(30) NOT NULL REFERENCES public.substance(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    type VARCHAR(20) NOT NULL,     -- IUPAC, COMMON, TRADE, SYNONYM, INDEX_NAME
    language VARCHAR(10),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(substance_id, name)
);

CREATE INDEX idx_substance_alias_name ON public.substance_alias(name);
CREATE INDEX idx_substance_alias_substance ON public.substance_alias(substance_id);
```

### RegulatoryList

Versioned regulatory lists (COSING, RoHS, REACH SVHC, etc.) for data-driven compliance checking.

> **Reference:** See `docs/plans/2026-01-26-regulatory-vertical-system-design.md` for full design.

```typescript
// packages/database/src/entities/RegulatoryList.ts
import { Entity, Property, ManyToOne, OneToMany, Collection, Unique, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

@Entity({ tableName: 'regulatory_list', schema: 'public' })
@Unique({ properties: ['code', 'version'] })
@Index({ properties: ['source', 'isCurrentVersion'] })
export class RegulatoryList extends BaseEntity {
  @Property({ length: 100 })
  code!: string;              // 'COSING_ANNEX_II' - stable identifier

  @Property({ length: 255 })
  name!: string;              // 'CosIng Annex II - Prohibited Substances'

  @Property({ length: 50 })
  source!: string;            // 'EU_COSING', 'ECHA', 'EU_ROHS'

  @Property({ length: 50 })
  version!: string;           // '2024-06', '2026-01'

  @Property({ name: 'effective_date' })
  effectiveDate!: Date;       // When this version became law

  @Property({ name: 'superseded_date', nullable: true })
  supersededDate?: Date;      // When next version replaced it

  @Property({ name: 'is_current_version', default: true })
  isCurrentVersion!: boolean; // Fast lookup for latest

  @Property({ name: 'source_url', nullable: true, length: 500 })
  sourceUrl?: string;         // Deep link to official EU source

  @ManyToOne(() => RegulatoryList, { nullable: true, name: 'previous_version_id' })
  previousVersion?: RegulatoryList;  // Chain for history traversal

  @OneToMany(() => RegulatoryListEntry, e => e.list)
  entries = new Collection<RegulatoryListEntry>(this);
}
```

**DDL:**

```sql
CREATE TABLE public.regulatory_list (
    id VARCHAR(30) PRIMARY KEY,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL,
    version VARCHAR(50) NOT NULL,
    effective_date DATE NOT NULL,
    superseded_date DATE,
    is_current_version BOOLEAN DEFAULT TRUE,
    source_url VARCHAR(500),
    previous_version_id VARCHAR(30) REFERENCES public.regulatory_list(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(code, version)
);

CREATE INDEX idx_regulatory_list_source ON public.regulatory_list(source, is_current_version);
CREATE INDEX idx_regulatory_list_code ON public.regulatory_list(code);
```

### RegulatoryListEntry

Substances within a regulatory list, with restriction type and thresholds.

```typescript
// packages/database/src/entities/RegulatoryListEntry.ts
import { Entity, Property, ManyToOne, Enum, Unique, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { RegulatoryList } from './RegulatoryList.js';
import { Substance } from './Substance.js';

export enum RestrictionType {
  PROHIBITED = 'PROHIBITED',                         // Substance banned entirely
  THRESHOLD = 'THRESHOLD',                           // Allowed below threshold
  RESTRICTED_WITH_CONDITIONS = 'RESTRICTED_WITH_CONDITIONS',  // Conditional use
}

@Entity({ tableName: 'regulatory_list_entry', schema: 'public' })
@Unique({ properties: ['list', 'substance'] })
@Index({ properties: ['list'] })
@Index({ properties: ['substance'] })
export class RegulatoryListEntry extends BaseEntity {
  @ManyToOne(() => RegulatoryList, { name: 'list_id' })
  list!: RegulatoryList;

  // Live reference (for joins)
  @ManyToOne(() => Substance, { name: 'substance_id' })
  substance!: Substance;

  // Forensic snapshots (immutable at import time)
  @Property({ name: 'cas_number_snapshot', length: 20 })
  casNumberSnapshot!: string;

  @Property({ name: 'substance_name_snapshot', length: 500 })
  substanceNameSnapshot!: string;

  @Enum(() => RestrictionType)
  @Property({ name: 'restriction_type' })
  restrictionType!: RestrictionType;

  @Property({ type: 'decimal', precision: 7, scale: 4, nullable: true, name: 'threshold_pct' })
  thresholdPct?: string;      // e.g., "0.1000" for 0.1%

  @Property({ type: 'decimal', precision: 5, scale: 4, nullable: true, name: 'stoichiometric_factor' })
  stoichiometricFactor?: string;  // For element-based regs (e.g., Cobalt in CoSO₄ = 0.38)

  @Property({ type: 'jsonb', nullable: true })
  conditions?: Record<string, string>;  // { application_area: 'spray products' }

  @Property({ name: 'legal_reference', nullable: true, length: 100 })
  legalReference?: string;    // 'Entry 1577'

  @Property({ type: 'text', nullable: true })
  notes?: string;
}
```

**DDL:**

```sql
CREATE TABLE public.regulatory_list_entry (
    id VARCHAR(30) PRIMARY KEY,
    list_id VARCHAR(30) NOT NULL REFERENCES public.regulatory_list(id) ON DELETE CASCADE,
    substance_id VARCHAR(30) NOT NULL REFERENCES public.substance(id),
    cas_number_snapshot VARCHAR(20) NOT NULL,
    substance_name_snapshot VARCHAR(500) NOT NULL,
    restriction_type VARCHAR(30) NOT NULL,  -- PROHIBITED, THRESHOLD, RESTRICTED_WITH_CONDITIONS
    threshold_pct DECIMAL(7, 4),
    stoichiometric_factor DECIMAL(5, 4),    -- For element-based regs (e.g., Cobalt in CoSO₄)
    conditions JSONB,
    legal_reference VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(list_id, substance_id)
);

CREATE INDEX idx_regulatory_list_entry_list ON public.regulatory_list_entry(list_id);
CREATE INDEX idx_regulatory_list_entry_substance ON public.regulatory_list_entry(substance_id);
CREATE INDEX idx_regulatory_list_entry_cas ON public.regulatory_list_entry(cas_number_snapshot);
```

### CategoryRegulatoryList

Links category LTREE paths to regulatory lists. Enables automatic list inheritance based on product category.

```typescript
// packages/database/src/entities/CategoryRegulatoryList.ts
import { Entity, Property, ManyToOne, Unique, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { RegulatoryList } from './RegulatoryList.js';

@Entity({ tableName: 'category_regulatory_list', schema: 'public' })
@Unique({ properties: ['categoryPath', 'list'] })
@Index({ type: 'gist', properties: ['categoryPath'] })  // LTREE GiST index
export class CategoryRegulatoryList extends BaseEntity {
  // LTREE path pattern (e.g., 'products.cosmetics', 'products.electronics')
  // Uses PostgreSQL LTREE @> operator for inheritance queries
  @Property({ name: 'category_path', columnType: 'ltree' })
  categoryPath!: string;

  @ManyToOne(() => RegulatoryList, { name: 'list_id' })
  list!: RegulatoryList;

  @Property({ type: 'int', default: 0 })
  priority!: number;          // Higher priority = checked first

  @Property({ default: false, name: 'is_excluded' })
  isExcluded!: boolean;       // True = explicitly exclude this list from category

  @Property({ type: 'text', nullable: true })
  notes?: string;             // Admin notes for audit trail
}
```

**DDL:**

```sql
-- Requires LTREE extension
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE public.category_regulatory_list (
    id VARCHAR(30) PRIMARY KEY,
    category_path LTREE NOT NULL,
    list_id VARCHAR(30) NOT NULL REFERENCES public.regulatory_list(id) ON DELETE CASCADE,
    priority INT DEFAULT 0,
    is_excluded BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_path, list_id)
);

CREATE INDEX idx_category_regulatory_list_path ON public.category_regulatory_list USING GIST (category_path);
CREATE INDEX idx_category_regulatory_list_list ON public.category_regulatory_list(list_id);
```

**LTREE Query Examples:**

```sql
-- Find all regulatory lists applicable to a product in category 'products.cosmetics.skincare'
SELECT DISTINCT rl.*
FROM public.category_regulatory_list crl
JOIN public.regulatory_list rl ON crl.list_id = rl.id
WHERE crl.category_path @> 'products.cosmetics.skincare'::ltree
  AND crl.is_excluded = FALSE
  AND rl.is_current_version = TRUE
ORDER BY crl.priority DESC;

-- This matches:
--   'products' (ancestor)
--   'products.cosmetics' (ancestor)
--   'products.cosmetics.skincare' (exact)
```

### RegulatoryImportLog

Audit trail for admin regulatory list imports.

```typescript
// packages/database/src/entities/RegulatoryImportLog.ts
import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { RegulatoryList } from './RegulatoryList.js';

export enum ImportStatus {
  PENDING = 'PENDING',
  PREVIEW = 'PREVIEW',
  APPLIED = 'APPLIED',
  FAILED = 'FAILED',
  ROLLED_BACK = 'ROLLED_BACK',
}

@Entity({ tableName: 'regulatory_import_log', schema: 'public' })
@Index({ properties: ['status', 'createdAt'] })
export class RegulatoryImportLog extends BaseEntity {
  @ManyToOne(() => RegulatoryList, { nullable: true, name: 'list_id' })
  list?: RegulatoryList;      // Set after successful apply

  @Property({ name: 'file_name', length: 255 })
  fileName!: string;

  @Property({ name: 'file_hash', length: 64 })
  fileHash!: string;          // SHA-256 for deduplication

  @Enum(() => ImportStatus)
  status!: ImportStatus;

  @Property({ name: 'admin_user_id', length: 30 })
  adminUserId!: string;       // Who initiated the import

  @Property({ type: 'jsonb', nullable: true, name: 'preview_summary' })
  previewSummary?: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    newSubstances: number;
    updatedEntries: number;
  };

  @Property({ type: 'jsonb', nullable: true, name: 'validation_errors' })
  validationErrors?: Array<{
    row: number;
    field: string;
    message: string;
  }>;

  @Property({ name: 'applied_at', nullable: true })
  appliedAt?: Date;

  @Property({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage?: string;
}
```

**DDL:**

```sql
CREATE TABLE public.regulatory_import_log (
    id VARCHAR(30) PRIMARY KEY,
    list_id VARCHAR(30) REFERENCES public.regulatory_list(id),
    file_name VARCHAR(255) NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,  -- PENDING, PREVIEW, APPLIED, FAILED, ROLLED_BACK
    admin_user_id VARCHAR(30) NOT NULL,
    preview_summary JSONB,
    validation_errors JSONB,
    applied_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regulatory_import_log_status ON public.regulatory_import_log(status, created_at);
CREATE INDEX idx_regulatory_import_log_hash ON public.regulatory_import_log(file_hash);
```

---

## 3. Tenant Schema Entities

### User

Users are stored **per-tenant**. A user who belongs to multiple organizations has separate records in each tenant schema, linked by `zitadelId`.

```typescript
// packages/db/src/entities/User.ts
import { Entity, PrimaryKey, Property, OneToMany, Collection, Unique } from '@mikro-orm/core';
import { OrganizationUser } from './OrganizationUser.js';

@Entity({ tableName: 'users' })
export class User {
  @PrimaryKey()
  id!: string;

  @Property({ name: 'zitadel_id' })
  @Unique()
  zitadelId!: string;

  @Property()
  @Unique()
  email!: string;

  @Property({ nullable: true })
  name?: string;

  @Property({ name: 'avatar_url', nullable: true })
  avatarUrl?: string;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @Property({ name: 'last_login_at', nullable: true })
  lastLoginAt?: Date;

  @OneToMany(() => OrganizationUser, ou => ou.user)
  memberships = new Collection<OrganizationUser>(this);
}
```

### Multi-Tenant User Sync

Since users exist in multiple tenant schemas, profile changes must propagate to all:

```typescript
// apps/api/src/webhooks/zitadel.ts
// Triggered by ZITADEL user events

async function syncUserToAllTenants(orm: MikroORM, zitadelUser: ZitadelUser) {
  // 1. Get all organizations this user belongs to (from ZITADEL)
  const memberships = await zitadel.listUserGrants(zitadelUser.id);

  // 2. Update user record in each tenant schema
  for (const membership of memberships.result) {
    const org = await orm.em.findOne(Organization, {
      zitadelOrgId: membership.orgId
    });

    if (!org) continue;

    const em = orm.em.fork({ schema: org.schemaName });
    await em.nativeUpdate(
      User,
      { zitadelId: zitadelUser.id },
      {
        name: zitadelUser.human?.profile?.displayName ?? '',
        email: zitadelUser.human?.email?.email,
        avatarUrl: zitadelUser.human?.profile?.avatarUrl,
        updatedAt: new Date(),
      }
    );
  }
}
```

**Sync Events:**

| ZITADEL Event | Action |
|---------------|--------|
| `user.human.added` | Create user in tenant schema (on org membership) |
| `user.human.profile.changed` | Update name/email/avatar in ALL tenant schemas |
| `user.removed` | Remove from ALL tenant schemas |
| `org.member.added` | Create user record in that tenant |
| `org.member.removed` | Delete user record from that tenant |

### OrganizationUser

```typescript
// packages/db/src/entities/OrganizationUser.ts
import { Entity, PrimaryKey, Property, ManyToOne, Enum } from '@mikro-orm/core';
import { User } from './User.js';

export enum WorkspaceAuthority {
  VIEWER = 'VIEWER',
  CONTRIBUTOR = 'CONTRIBUTOR',
  EDITOR = 'EDITOR',
  MANAGER = 'MANAGER',
}

@Entity({ tableName: 'organization_users' })
export class OrganizationUser {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => User, { name: 'user_id' })
  user!: User;

  @Property({ name: 'is_org_admin', default: false })
  isOrgAdmin!: boolean;

  @Enum(() => WorkspaceAuthority)
  @Property({ name: 'design_authority', default: WorkspaceAuthority.VIEWER })
  designAuthority!: WorkspaceAuthority;

  @Enum(() => WorkspaceAuthority)
  @Property({ name: 'operations_authority', default: WorkspaceAuthority.VIEWER })
  operationsAuthority!: WorkspaceAuthority;

  @Enum(() => WorkspaceAuthority)
  @Property({ name: 'marketing_authority', default: WorkspaceAuthority.VIEWER })
  marketingAuthority!: WorkspaceAuthority;

  @Enum(() => WorkspaceAuthority)
  @Property({ name: 'compliance_authority', default: WorkspaceAuthority.VIEWER })
  complianceAuthority!: WorkspaceAuthority;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

### Product

```typescript
// packages/db/src/entities/Product.ts
import { Entity, PrimaryKey, Property, Enum, ManyToOne, OneToMany, Collection } from '@mikro-orm/core';
import { ProductIdentifier } from './ProductIdentifier.js';
import { ProductVersion } from './ProductVersion.js';
import { BomEntry } from './BomEntry.js';
import { User } from './User.js';

export enum ProductType {
  FINISHED_GOOD = 'FINISHED_GOOD',
  RAW_MATERIAL = 'RAW_MATERIAL',
  COMPONENT = 'COMPONENT',
  VARIANT = 'VARIANT',
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  PENDING_DELETION = 'PENDING_DELETION',
}

@Entity({ tableName: 'products' })
export class Product {
  @PrimaryKey()
  id!: string;

  @Enum(() => ProductType)
  @Property({ name: 'product_type' })
  productType: ProductType = ProductType.FINISHED_GOOD;

  @Property()
  name!: string;

  @Property({ nullable: true, type: 'text' })
  description?: string;

  @ManyToOne(() => Product, { nullable: true, name: 'parent_id' })
  parent?: Product;

  @OneToMany(() => Product, p => p.parent)
  variants = new Collection<Product>(this);

  @Enum(() => ProductStatus)
  status: ProductStatus = ProductStatus.ACTIVE;

  // Checkout locks (per-workspace)
  @ManyToOne(() => User, { nullable: true, name: 'design_checked_out_by' })
  designCheckedOutBy?: User;

  @Property({ name: 'design_checked_out_at', nullable: true })
  designCheckedOutAt?: Date;

  @ManyToOne(() => User, { nullable: true, name: 'marketing_checked_out_by' })
  marketingCheckedOutBy?: User;

  @Property({ name: 'marketing_checked_out_at', nullable: true })
  marketingCheckedOutAt?: Date;

  // Relations
  @OneToMany(() => ProductIdentifier, pi => pi.product)
  identifiers = new Collection<ProductIdentifier>(this);

  @OneToMany(() => ProductVersion, pv => pv.product)
  versions = new Collection<ProductVersion>(this);

  @OneToMany(() => BomEntry, be => be.parentProduct)
  bomEntriesAsParent = new Collection<BomEntry>(this);

  @OneToMany(() => BomEntry, be => be.childProduct)
  bomEntriesAsChild = new Collection<BomEntry>(this);

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

### Product Deletion Flow

Products with DynamoDB items (serialized products) require coordinated cleanup:

```
User requests delete
        |
        v
+------------------+
| PENDING_DELETION |  <- Immediate state change
+--------+---------+
         |
         | Background worker starts
         v
+------------------+
| DynamoDB Cleanup |  <- Delete items by product_id (may take hours)
+--------+---------+
         |
         | All items deleted?
         |
    +----+----+
    |         |
   YES        NO (failure)
    |         |
    v         v
+--------+  +----------+
| DELETE |  | ARCHIVED |  <- Revert + alert admin
| (hard) |  +----------+
+--------+
```

```typescript
// apps/worker/src/jobs/product-deletion.ts
async function processProductDeletion(em: EntityManager, productId: string) {
  const product = await em.findOne(Product, { id: productId });
  if (product?.status !== ProductStatus.PENDING_DELETION) return;

  try {
    // 1. Delete all DynamoDB items for this product
    const gtin = await em.findOne(ProductIdentifier, {
      product: productId,
      type: IdentifierType.GTIN,
    });

    if (gtin) {
      await deleteDynamoDBItems(`PRODUCT#${gtin.value}`);
    }

    // 2. Hard delete from PostgreSQL (cascades to versions, BOM, etc.)
    await em.removeAndFlush(product);

  } catch (error) {
    // Revert to ARCHIVED on failure
    product.status = ProductStatus.ARCHIVED;
    await em.flush();
    await notifyAdmin('Product deletion failed', { productId, error });
  }
}
```

### ProductIdentifier

```typescript
// packages/db/src/entities/ProductIdentifier.ts
import { Entity, PrimaryKey, Property, ManyToOne, Enum, Unique } from '@mikro-orm/core';
import { Product } from './Product.js';

export enum IdentifierType {
  INTERNAL = 'INTERNAL',
  SKU = 'SKU',
  GTIN = 'GTIN',
  DPP_URI = 'DPP_URI',
}

@Entity({ tableName: 'product_identifiers' })
@Unique({ properties: ['product', 'type'] })
export class ProductIdentifier {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => Product, { name: 'product_id' })
  product!: Product;

  @Enum(() => IdentifierType)
  type!: IdentifierType;

  @Property()
  value!: string;

  @Property({ name: 'is_primary', default: false })
  isPrimary!: boolean;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();
}
```

### ProductVersion

```typescript
// packages/db/src/entities/ProductVersion.ts
import { Entity, PrimaryKey, Property, ManyToOne, Enum, OneToMany, Collection } from '@mikro-orm/core';
import { Product } from './Product.js';
import { User } from './User.js';
import { BomEntry } from './BomEntry.js';

export enum Workspace {
  DESIGN = 'DESIGN',
  MARKETING = 'MARKETING',
  OPERATIONS = 'OPERATIONS',
  COMPLIANCE = 'COMPLIANCE',
}

export enum VersionStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  IN_REVIEW = 'IN_REVIEW',
  REJECTED = 'REJECTED',
  RELEASED = 'RELEASED',
}

// ─────────────────────────────────────────────────────────────
// COMPLIANCE STATUS (Approval Gate Workflow)
// Tracks compliance review state for design versions
// See: docs/plans/13-regulatory-advisor.md
// ─────────────────────────────────────────────────────────────
export enum ComplianceStatus {
  NOT_STARTED = 'NOT_STARTED',     // Default for new draft versions
  AUTO_PASSED = 'AUTO_PASSED',     // PreFlight returns PASS, auto-released
  PENDING_REVIEW = 'PENDING_REVIEW', // PreFlight returns PASS_WITH_DEVIATIONS, awaits Compliance Manager
  AUTHORIZED = 'AUTHORIZED',       // Compliance Manager approved, version released
}

@Entity({ tableName: 'product_versions' })
export class ProductVersion {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => Product, { name: 'product_id' })
  product!: Product;

  @Enum(() => Workspace)
  workspace!: Workspace;

  @Property({ name: 'version_number' })
  versionNumber!: number;

  @Enum(() => VersionStatus)
  status: VersionStatus = VersionStatus.DRAFT;

  // Workflow
  @ManyToOne(() => User, { name: 'created_by' })
  createdBy!: User;

  @ManyToOne(() => User, { nullable: true, name: 'reviewer_id' })
  reviewer?: User;

  @ManyToOne(() => User, { nullable: true, name: 'published_by' })
  publishedBy?: User;

  @Property({ name: 'published_at', nullable: true })
  publishedAt?: Date;

  // Signature (for released versions)
  @Property({ name: 'signature_did', nullable: true })
  signatureDid?: string;

  @Property({ name: 'signature_jws', nullable: true, type: 'text' })
  signatureJws?: string;

  // Data payload (workspace-specific)
  @Property({ type: 'jsonb', nullable: true })
  data?: Record<string, unknown>;

  // Relations
  @OneToMany(() => BomEntry, be => be.version)
  bomEntries = new Collection<BomEntry>(this);

  // ─────────────────────────────────────────────────────────────
  // COMPLIANCE STATUS (Approval Gate Workflow)
  // Tracks compliance review state for design versions
  // See: docs/plans/13-regulatory-advisor.md
  // ─────────────────────────────────────────────────────────────
  @Enum(() => ComplianceStatus)
  @Property({ name: 'compliance_status', default: ComplianceStatus.NOT_STARTED })
  complianceStatus: ComplianceStatus = ComplianceStatus.NOT_STARTED;

  @Property({ name: 'last_audit_result_id', nullable: true })
  lastAuditResultId?: string;

  @Property({ name: 'submitted_at', nullable: true })
  submittedAt?: Date;

  @ManyToOne(() => User, { nullable: true, name: 'submitted_by' })
  submittedBy?: User;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

### BomEntry

```typescript
// packages/db/src/entities/BomEntry.ts
import { Entity, PrimaryKey, Property, ManyToOne, Unique, Check } from '@mikro-orm/core';
import { Product } from './Product.js';
import { ProductVersion } from './ProductVersion.js';

@Entity({ tableName: 'bom_entries' })
@Unique({ properties: ['parentProduct', 'childProduct', 'version'] })
@Check({ expression: 'parent_product_id != child_product_id' })
export class BomEntry {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => Product, { name: 'parent_product_id' })
  parentProduct!: Product;

  @ManyToOne(() => Product, { name: 'child_product_id' })
  childProduct!: Product;

  @ManyToOne(() => ProductVersion, { name: 'version_id' })
  version!: ProductVersion;

  // DECIMAL(12, 4) supports:
  // - Large quantities: up to 99,999,999.9999
  // - Precise measurements: 0.0001 kg (0.1 gram)
  @Property({ type: 'decimal', precision: 12, scale: 4 })
  quantity!: string;  // Decimal as string for precision

  @Property()
  unit!: string;  // 'kg', 'g', 'pcs', 'm', 'ml', etc.

  @Property({ default: 0 })
  position!: number;

  @Property({ nullable: true, type: 'text' })
  notes?: string;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();
}
```

**BOM Quantity Precision:**

| Use Case | Example | Covered by DECIMAL(12,4) |
|----------|---------|--------------------------|
| Large batch | 1,000,000 units | Yes (8 digits) |
| Precise weight | 0.0001 kg (0.1 gram) | Yes (4 decimal places) |
| Chemical trace | 0.00005 kg | No - use grams: 0.05 g |
| High volume + precision | 99,999,999.9999 | Yes (max value) |

**Unit recommendations:**
- For trace chemicals, use smaller units (grams instead of kilograms)
- Store the unit alongside quantity for clarity
- Consider a `unit_conversion` table if cross-unit calculations are common

### MaterialSubstance

Links substances (from public registry) to material product versions. Tenant-scoped because concentration data is proprietary.

```typescript
// packages/database/src/entities/MaterialSubstance.ts
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { ProductVersion } from './ProductVersion.js';
import { User } from './User.js';

export enum ConcentrationBasis {
  WEIGHT = 'WEIGHT',       // % w/w (most common)
  VOLUME = 'VOLUME',       // % v/v
  MOLAR = 'MOLAR'          // mol%
}

@Entity({ tableName: 'material_substance' })
@Unique({ properties: ['materialVersion', 'substanceId'] })
export class MaterialSubstance extends BaseEntity {
  // Links to ProductVersion (material must have targetType=MATERIAL)
  @ManyToOne(() => ProductVersion, { name: 'material_version_id' })
  @Index()
  materialVersion!: ProductVersion;

  // Soft link to public.substance (cross-schema)
  @Property({ name: 'substance_id' })
  @Index()
  substanceId!: string;

  // Concentration data (high precision for regulatory thresholds like 0.1%)
  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true, name: 'concentration_pct' })
  concentrationPct?: string;      // % by weight (e.g., "0.050000" for 0.05%)

  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true, name: 'concentration_min' })
  concentrationMin?: string;      // Range minimum (if variable)

  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true, name: 'concentration_max' })
  concentrationMax?: string;      // Range maximum (if variable)

  @Enum(() => ConcentrationBasis)
  basis: ConcentrationBasis = ConcentrationBasis.WEIGHT;

  // Verification audit trail
  @ManyToOne(() => User, { name: 'verified_by_id', nullable: true })
  verifiedBy?: User;

  @Property({ nullable: true, name: 'verified_at' })
  verifiedAt?: Date;

  @Property({ type: 'text', nullable: true, name: 'verification_source' })
  verificationSource?: string;    // "Supplier SDS dated 2024-01-15"

  // Conditional presence
  @Property({ default: true, name: 'is_intentionally_added' })
  isIntentionallyAdded!: boolean; // vs. impurity/contamination

  @Property({ type: 'text', nullable: true })
  notes?: string;
}
```

**DDL:**

```sql
CREATE TABLE material_substance (
    id VARCHAR(30) PRIMARY KEY,
    material_version_id VARCHAR(30) NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
    substance_id VARCHAR(30) NOT NULL,  -- Soft link to public.substance
    concentration_pct DECIMAL(10, 6),
    concentration_min DECIMAL(10, 6),
    concentration_max DECIMAL(10, 6),
    basis VARCHAR(10) DEFAULT 'WEIGHT',  -- WEIGHT, VOLUME, MOLAR
    verified_by_id VARCHAR(30) REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    verification_source TEXT,
    is_intentionally_added BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(material_version_id, substance_id)
);

CREATE INDEX idx_material_substance_version ON material_substance(material_version_id);
CREATE INDEX idx_material_substance_substance ON material_substance(substance_id);

-- Trigger to enforce targetType = MATERIAL constraint
CREATE OR REPLACE FUNCTION check_material_version_target_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM product_versions pv
    JOIN products p ON pv.product_id = p.id
    JOIN categories c ON p.category_id = c.id
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
  FOR EACH ROW EXECUTE FUNCTION check_material_version_target_type();
```

**Concentration Precision:**

| Use Case | Example | Covered by DECIMAL(10,6) |
|----------|---------|--------------------------|
| SVHC threshold | 0.1% = 0.100000 | Yes |
| Trace impurity | 0.001% = 0.001000 | Yes |
| PPM level | 10 ppm = 0.001000% | Yes |
| High concentration | 95.5% = 95.500000 | Yes |

### DppSnapshot

```typescript
// packages/db/src/entities/DppSnapshot.ts
import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection, Enum, Unique } from '@mikro-orm/core';
import { Product } from './Product.js';
import { ProductVersion } from './ProductVersion.js';
import { ReadinessProfile } from './ReadinessProfile.js';
import { RuleDeviation } from './RuleDeviation.js';

export enum DppStatus {
  COMMISSIONED = 'COMMISSIONED',   // Serial assigned, not yet provisioned
  PROVISIONED = 'PROVISIONED',     // DPP active, VC issued
  SUPERSEDED = 'SUPERSEDED',       // Replaced by newer version
  REVOKED = 'REVOKED',             // Recalled/invalidated
}

@Entity({ tableName: 'dpp_snapshots' })
export class DppSnapshot {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => Product, { name: 'product_id' })
  product!: Product;

  @ManyToOne(() => ProductVersion, { name: 'design_version_id' })
  designVersion!: ProductVersion;

  @ManyToOne(() => ProductVersion, { nullable: true, name: 'marketing_version_id' })
  marketingVersion?: ProductVersion;

  @Property({ name: 'credential_hash' })
  @Unique()
  credentialHash!: string;

  @Property({ name: 'issuer_did' })
  issuerDid!: string;

  @Property({ name: 'issued_at' })
  issuedAt!: Date;

  @Enum(() => DppStatus)
  status: DppStatus = DppStatus.COMMISSIONED;

  @Property({ name: 'r2_path' })
  r2Path!: string;

  @Property({ name: 'qr_code_url', nullable: true })
  qrCodeUrl?: string;

  // --- Compliance Profile (frozen at mint time) ---
  @ManyToOne(() => ReadinessProfile, { nullable: true, name: 'profile_id' })
  profile?: ReadinessProfile;

  @Property({ name: 'profile_version', nullable: true })
  profileVersion?: number; // Frozen version number

  @Property({ name: 'profile_audit_label', nullable: true })
  profileAuditLabel?: string; // "Acme Corp v2.0 (Based on ESPR v2025.1)"

  // Acknowledged deviations at mint time
  @OneToMany(() => RuleDeviation, d => d.dpp)
  deviations = new Collection<RuleDeviation>(this);

  // Snapshot of data at issuance time
  @Property({ type: 'jsonb', nullable: true })
  snapshot?: Record<string, unknown>;

  // Frozen compliance summary for Forensic Seal
  @Property({ type: 'jsonb', nullable: true })
  complianceSummary?: {
    totalRules: number;
    passed: number;
    deviations: number;
    evaluatedAt: Date;
  };

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();
}
```

### OperationsEvent (Forensic Ledger)

```typescript
// packages/db/src/entities/OperationsEvent.ts
import { Entity, PrimaryKey, Property, Index } from '@mikro-orm/core';

@Entity({ tableName: 'operations_events' })
export class OperationsEvent {
  @PrimaryKey()
  id!: string;

  @Property({ name: 'event_type' })
  @Index()
  eventType!: string;  // 'batch.committed', 'item.manufactured', etc.

  @Property({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Property({ name: 'previous_hash', nullable: true })
  previousHash?: string;

  @Property()
  @Index()
  hash!: string;

  @Property({ name: 'actor_did' })
  actorDid!: string;

  @Property({ name: 'signature_jws', type: 'text' })
  signatureJws!: string;

  @Property({ name: 'created_at' })
  @Index()
  createdAt: Date = new Date();
}
```

### OutboxEvent

EuroComply uses a **dual-schema outbox pattern**. This entity exists in both the public schema (for system events) and tenant schemas (for domain events). See [Architecture - Event System](./01-architecture.md#7-event-system) for the full design.

#### Schema Placement Rules

When adding new outbox events, use these rules to determine the correct schema:

**Use PUBLIC schema when:**
- The event occurs before a tenant schema exists (e.g., provisioning)
- The event affects the organization entity itself (create, delete, suspend)
- The event is for external system integration that spans tenants
- No tenant context is available in the request

**Use TENANT schema when:**
- The event occurs within a tenant transaction
- The event describes a domain entity change (product, user, batch, DPP)
- The event should be isolated from other tenants' event queues
- Transactional consistency with domain data is required

**Code pattern for public schema:**
```typescript
const em = orm.em.fork(); // No schema = public
em.create(OutboxEvent, { ... });
```

**Code pattern for tenant schema:**
```typescript
const em = orm.em.fork({ schema: org.schemaName });
em.create(OutboxEvent, { ... });
```

#### Entity Definition

```typescript
// packages/db/src/entities/OutboxEvent.ts
import { Entity, PrimaryKey, Property, Enum, Index } from '@mikro-orm/core';

export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity({ tableName: 'outbox_event' })
export class OutboxEvent extends BaseEntity {
  @Property({ type: 'text', name: 'aggregate_type' })
  @Index()
  aggregateType!: string;        // e.g., 'Organization', 'Product', 'User'

  @Property({ type: 'text', name: 'aggregate_id' })
  @Index()
  aggregateId!: string;          // ID of the entity this event describes

  @Property({ type: 'text', name: 'event_type' })
  @Index()
  eventType!: string;            // e.g., 'organization.provisioned'

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;  // Event-specific data

  @Enum({ items: () => OutboxStatus, default: OutboxStatus.PENDING })
  @Index()
  status: OutboxStatus = OutboxStatus.PENDING;

  @Property({ type: 'int', default: 0, name: 'retry_count' })
  retryCount: number = 0;        // Number of failed processing attempts

  @Property({ nullable: true, name: 'processed_at' })
  processedAt?: Date;            // When status changed to COMPLETED

  @Property({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage?: string;         // Last error if FAILED
}
```

#### Event Types

**Public Schema Events** (system-level):

| Event Type | Aggregate | Description |
|------------|-----------|-------------|
| `organization.provisioned` | Organization | Tenant schema created and ready |
| `organization.deleted` | Organization | Tenant schema dropped |
| `organization.provisioning_retried` | Organization | Manual retry of failed provisioning |
| `clerk.metadata_sync_requested` | Organization | Sync schema metadata back to ZITADEL |

**Tenant Schema Events** (domain-level):

| Event Type | Aggregate | Description |
|------------|-----------|-------------|
| `user.joined_organization` | User | User added to organization |
| `user.left_organization` | User | User removed from organization |
| `user.profile_sync_requested` | User | Profile update needs syncing |
| `product.created` | Product | New product registered |
| `product.updated` | Product | Product metadata changed |
| `product.archived` | Product | Product soft-deleted |
| `dpp.issued` | DigitalProductPassport | DPP credential generated |
| `dpp.revoked` | DigitalProductPassport | DPP credential invalidated |
| `batch.committed` | Batch | Batch finalized for production |
| `attestation.requested` | Attestation | Compliance attestation initiated |

*Note: Domain events (product, dpp, batch, attestation) are designed but not yet implemented.*
```

### StatusList

```typescript
// packages/db/src/entities/StatusList.ts
import { Entity, PrimaryKey, Property, OneToMany, Collection } from '@mikro-orm/core';
import { StatusListEntry } from './StatusListEntry.js';

@Entity({ tableName: 'status_lists' })
export class StatusList {
  @PrimaryKey()
  id!: string;

  @Property()
  purpose!: string;  // 'revocation' or 'suspension'

  @Property({ name: 'encoded_list', type: 'text' })
  encodedList!: string;

  @Property({ name: 'current_index', default: 0 })
  currentIndex!: number;

  @OneToMany(() => StatusListEntry, e => e.statusList)
  entries = new Collection<StatusListEntry>(this);

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

### StatusListEntry

```typescript
// packages/db/src/entities/StatusListEntry.ts
import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { StatusList } from './StatusList.js';

@Entity({ tableName: 'status_list_entries' })
export class StatusListEntry {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => StatusList, { name: 'status_list_id' })
  statusList!: StatusList;

  @Property({ name: 'credential_id' })
  credentialId!: string;

  @Property()
  index!: number;

  @Property({ default: false })
  revoked!: boolean;

  @Property({ name: 'revoked_at', nullable: true })
  revokedAt?: Date;

  @Property({ name: 'revocation_reason', nullable: true })
  revocationReason?: string;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();
}
```

### RuleTemplate

Compliance rules with legal anchoring and temporal activation. See [Regulatory Advisor](./13-regulatory-advisor.md) for full design.

```typescript
// packages/db/src/entities/RuleTemplate.ts
import { Entity, PrimaryKey, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { Organization } from './Organization.js';

export enum RuleSeverity {
  BLOCKER = 'BLOCKER',
  WARNING = 'WARNING',
  INFO = 'INFO',
}

export enum RuleScope {
  SYSTEM = 'SYSTEM',
  MARKETPLACE = 'MARKETPLACE',
  ORGANIZATION = 'ORGANIZATION',
}

export enum RuleType {
  ATTRIBUTE = 'ATTRIBUTE',
  PROCESS = 'PROCESS',
}

export enum RuleCategory {
  DESIGN = 'DESIGN',
  OPERATIONS = 'OPERATIONS',
  MARKETING = 'MARKETING',
  COMPLIANCE = 'COMPLIANCE',
}

@Entity({ tableName: 'rule_templates' })
@Unique({ properties: ['organization', 'code'] })
@Index({ properties: ['scope', 'ruleCategory'] })
@Index({ properties: ['activeFrom', 'activeUntil'] })
export class RuleTemplate {
  @PrimaryKey()
  id!: string;

  // Ownership: NULL = System Rule (public schema), SET = Org Rule (tenant schema)
  @ManyToOne(() => Organization, { nullable: true, name: 'organization_id' })
  organization?: Organization;

  @Property({ length: 100 })
  code!: string;

  @Property()
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Enum(() => RuleScope)
  scope!: RuleScope;

  @Enum(() => RuleType)
  type!: RuleType;

  @Enum(() => RuleCategory)
  @Property({ name: 'rule_category' })
  ruleCategory!: RuleCategory;

  @Enum(() => RuleSeverity)
  severity!: RuleSeverity;

  // Reference to public.regulation_anchors (cross-schema)
  @Property({ name: 'legal_anchor_id', nullable: true })
  legalAnchorId?: string;

  // For ATTRIBUTE rules: reference to attribute_template
  @Property({ name: 'attribute_template_id', nullable: true })
  attributeTemplateId?: string;

  // For PROCESS rules: reference to category
  @Property({ name: 'category_id', nullable: true })
  categoryId?: string;

  // Inheritance
  @Property({ name: 'inherited_from_id', nullable: true })
  inheritedFromId?: string;

  @Property({ name: 'inherited_from_version', nullable: true })
  inheritedFromVersion?: number;

  // Temporal activation
  @Property({ name: 'active_from' })
  activeFrom!: Date;

  @Property({ name: 'active_until', nullable: true })
  activeUntil?: Date;

  @Property({ type: 'jsonb', nullable: true })
  validationLogic?: Record<string, unknown>;

  @Property({ version: true })
  version!: number;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

### ReasonCode

Predefined justifications for rule deviations, scoped by category and regulation.

```typescript
// packages/db/src/entities/ReasonCode.ts
import { Entity, PrimaryKey, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { Organization } from './Organization.js';

export enum ReasonCodeScope {
  SYSTEM = 'SYSTEM',
  MARKETPLACE = 'MARKETPLACE',
  ORGANIZATION = 'ORGANIZATION',
}

@Entity({ tableName: 'reason_codes' })
@Unique({ properties: ['organization', 'code'] })
@Index({ properties: ['scope', 'categoryId'] })
export class ReasonCode {
  @PrimaryKey()
  id!: string;

  // Ownership: NULL = System Code, SET = Org Code
  @ManyToOne(() => Organization, { nullable: true, name: 'organization_id' })
  organization?: Organization;

  @Property({ length: 50 })
  code!: string;

  @Property({ length: 100 })
  label!: string;

  @Property({ type: 'text' })
  description!: string;

  @Enum(() => ReasonCodeScope)
  scope!: ReasonCodeScope;

  // Scoping
  @Property({ name: 'category_id', nullable: true })
  categoryId?: string; // NULL = all categories

  @Property({ name: 'regulation_id', nullable: true })
  regulationId?: string; // Reference to public.regulation_documents

  @Property({ name: 'requires_narrative', default: false })
  requiresNarrative!: boolean;

  @Property({ name: 'is_active', default: true })
  isActive!: boolean;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

### ReadinessProfile

Collections of rules for specific compliance targets. Replaces static JSON requirements with relational rule references.

```typescript
// packages/db/src/entities/ReadinessProfile.ts
import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection, Enum, Index, Unique } from '@mikro-orm/core';
import { Organization } from './Organization.js';
import { ReadinessProfileRule } from './ReadinessProfileRule.js';

export enum ProfileScope {
  SYSTEM = 'SYSTEM',
  MARKETPLACE = 'MARKETPLACE',
  ORGANIZATION = 'ORGANIZATION',
}

@Entity({ tableName: 'readiness_profiles' })
@Unique({ properties: ['organization', 'name'] })
@Index({ properties: ['scope', 'categoryId'] })
export class ReadinessProfile {
  @PrimaryKey()
  id!: string;

  // Ownership: NULL = System Profile, SET = Org Profile
  @ManyToOne(() => Organization, { nullable: true, name: 'organization_id' })
  organization?: Organization;

  @Property()
  name!: string;

  @Property({ name: 'version_label', length: 50 })
  versionLabel!: string; // "Standard v2025.1" - human-readable for Forensic Seal

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Enum(() => ProfileScope)
  scope!: ProfileScope;

  @Property({ name: 'category_id' })
  categoryId!: string;

  // Reference to public.regulation_documents
  @Property({ name: 'primary_regulation_id', nullable: true })
  primaryRegulationId?: string;

  // Inheritance (for Live Link model)
  @Property({ name: 'inherited_from_id', nullable: true })
  inheritedFromId?: string;

  @Property({ name: 'inherited_from_version', nullable: true })
  inheritedFromVersion?: number;

  @OneToMany(() => ReadinessProfileRule, rule => rule.profile)
  rules = new Collection<ReadinessProfileRule>(this);

  @Property({ version: true })
  version!: number;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  /**
   * Generate human-readable label for Forensic Seal display.
   */
  getAuditLabel(inheritedFromName?: string, inheritedFromVersion?: string): string {
    if (inheritedFromName) {
      return `${this.name} ${this.versionLabel} (Based on ${inheritedFromName} ${inheritedFromVersion})`;
    }
    return `${this.name} ${this.versionLabel}`;
  }
}
```

### ReadinessProfileRule

Join table linking profiles to rules with **per-rule override capability**.

> **Governance:** Only **Compliance Workspace MANAGER** can edit `overrideMode` and `severityOverride`.
> Other workspace users can view rules but cannot change enforcement logic.

```typescript
// packages/db/src/entities/ReadinessProfileRule.ts
import { Entity, PrimaryKey, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { ReadinessProfile } from './ReadinessProfile.js';
import { RuleTemplate, RuleSeverity } from './RuleTemplate.js';

export enum RuleOverrideMode {
  ENFORCING = 'ENFORCING',   // Full soft gate - blockers must be acknowledged
  SILENT = 'SILENT',         // Rule evaluates but findings are advisory only
  DISABLED = 'DISABLED',     // Rule skipped entirely - no evaluation
}

@Entity({ tableName: 'readiness_profile_rules' })
@Unique({ properties: ['profile', 'rule'] })
@Index({ properties: ['profile'] })
export class ReadinessProfileRule {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => ReadinessProfile, { name: 'profile_id' })
  profile!: ReadinessProfile;

  @ManyToOne(() => RuleTemplate, { name: 'rule_id' })
  rule!: RuleTemplate;

  // ─────────────────────────────────────────────────────────────
  // PER-RULE OVERRIDE (null = inherit from Organization settings)
  // Resolution: overrideMode → Organization.enforcementMode → skip
  // ─────────────────────────────────────────────────────────────

  @Enum({ items: () => RuleOverrideMode, nullable: true })
  @Property({ name: 'override_mode', nullable: true })
  overrideMode?: RuleOverrideMode;

  @Enum({ items: () => RuleSeverity, nullable: true })
  @Property({ name: 'severity_override', nullable: true })
  severityOverride?: RuleSeverity;

  @Property({ name: 'active_from_override', nullable: true })
  activeFromOverride?: Date;

  // Audit trail for override changes
  @ManyToOne(() => User, { nullable: true, name: 'override_set_by' })
  overrideSetBy?: User;

  @Property({ name: 'override_set_at', nullable: true })
  overrideSetAt?: Date;

  @Property({ name: 'override_reason', nullable: true, type: 'text' })
  overrideReason?: string;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();
}
```

**Resolution Hierarchy:**

```
Effective Rule Mode =
  1. ReadinessProfileRule.overrideMode (if set)
  2. ELSE Organization.enforcementMode (if regulatoryAdvisorEnabled = true)
  3. ELSE skip entirely (if regulatoryAdvisorEnabled = false)
```

**Forensic Seal Integration:**

When capturing `ComplianceProfileSnapshot`, the mode is recorded for each rule:

| Mode | Evaluation | Findings | canProceed Impact | Forensic Display |
|------|------------|----------|-------------------|------------------|
| `ENFORCING` | Full evaluation | BLOCKER/WARNING/INFO | Blockers must be deviated | "PASS" or "DEVIATED" |
| `SILENT` | Full evaluation | All shown as INFO | Never blocks | "ADVISORY" |
| `DISABLED` | Skipped | None generated | Never blocks | "DISABLED BY POLICY" |

### RuleDeviation

Captures acknowledged gaps when users proceed despite soft gate warnings.

**Dual-Link Model:**
- **Design-time:** `productVersionId` is set, `dppSnapshotId` is null
- **DPP mint:** System clones design deviations → new records with `dppSnapshotId` set
- **Forensic audit:** DPP shows all deviations with full traceability back to design

```typescript
// packages/db/src/entities/RuleDeviation.ts
import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { DppSnapshot } from './DppSnapshot.js';
import { ProductVersion } from './ProductVersion.js';
import { RuleTemplate } from './RuleTemplate.js';
import { ReasonCode } from './ReasonCode.js';
import { User } from './User.js';

@Entity({ tableName: 'rule_deviations' })
@Index({ properties: ['dpp'] })
@Index({ properties: ['productVersion'] })
@Index({ properties: ['rule'] })
export class RuleDeviation {
  @PrimaryKey()
  id!: string;

  // ─────────────────────────────────────────────────────────────
  // DUAL-LINK MODEL: Design-time vs Runtime deviations
  // Either productVersion OR dpp must be set (not both, not neither)
  // ─────────────────────────────────────────────────────────────

  // Design-time deviations (created during design, before DPP minting)
  @ManyToOne(() => ProductVersion, { nullable: true, name: 'product_version_id' })
  productVersion?: ProductVersion;

  // Runtime deviations (cloned from design-time at DPP mint, or created at runtime)
  @ManyToOne(() => DppSnapshot, { nullable: true, name: 'dpp_id' })
  dpp?: DppSnapshot;

  @ManyToOne(() => RuleTemplate, { name: 'rule_id' })
  rule!: RuleTemplate;

  @Property({ name: 'rule_version' })
  ruleVersion!: number; // Frozen at time of deviation

  @ManyToOne(() => ReasonCode, { name: 'reason_code_id' })
  reasonCode!: ReasonCode;

  @Property({ type: 'text', nullable: true })
  narrative?: string;

  @ManyToOne(() => User, { name: 'acknowledged_by' })
  acknowledgedBy!: User;

  @Property({ name: 'acknowledged_at' })
  acknowledgedAt!: Date;

  // ─────────────────────────────────────────────────────────────
  // AUTHORIZATION (Compliance Manager approval for PENDING_REVIEW)
  // Set when Compliance Manager authorizes a version with deviations
  // ─────────────────────────────────────────────────────────────
  @ManyToOne(() => User, { nullable: true, name: 'authorizing_user_id' })
  authorizingUser?: User;

  @Property({ name: 'authorized_at', nullable: true })
  authorizedAt?: Date;

  // AI sanity check
  @Property({ type: 'jsonb', nullable: true })
  aiSanityCheck?: {
    flagged: boolean;
    warning?: string;
    reviewedByLegal?: boolean;
    reviewedAt?: Date;
  };

  // Legal anchor snapshot (frozen at time of deviation)
  @Property({ type: 'jsonb', nullable: true })
  legalAnchorSnapshot?: {
    reference: string;
    documentTitle: string;
    documentVersion: string;
    textSnippet: string;
  };

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();
}
```

### AuditResultSnapshot

Stores frozen PreFlight results at submission time. Critical for forensic audit - proves what rules were active when the design was approved.

```typescript
// packages/db/src/entities/AuditResultSnapshot.ts
import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { ProductVersion } from './ProductVersion.js';

@Entity({ tableName: 'audit_result_snapshots' })
@Index({ properties: ['productVersion'] })
@Index({ properties: ['resultStatus'] })
export class AuditResultSnapshot {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => ProductVersion, { name: 'product_version_id' })
  productVersion!: ProductVersion;

  @Property({ name: 'evaluated_at' })
  evaluatedAt!: Date;

  @Property({ name: 'profile_id' })
  profileId!: string;

  @Property({ name: 'profile_audit_label', length: 500 })
  profileAuditLabel!: string; // "ESPR Apparel v2025.1"

  @Property({ type: 'jsonb' })
  summary!: {
    total: number;
    passed: number;
    deviations: number;
    blockerCount: number;
    warningCount: number;
  };

  // CRITICAL: Frozen findings with rule versions and legal anchors
  @Property({ type: 'jsonb' })
  findings!: Array<{
    ruleId: string;
    ruleName: string;
    ruleVersion: number;           // Frozen rule version at evaluation time
    ruleCategory: string;
    severity: string;
    status: string;
    effectiveMode: string;
    hasDeviation: boolean;
    deviationId?: string;
    // Frozen legal anchor (proves regulatory basis)
    legalAnchorSnapshot?: {
      anchorId: string;
      reference: string;           // "ESPR Art. 5(2)"
      documentId: string;
      documentTitle: string;
      documentVersion: string;     // "ESPR 2025.1"
      textSnippet: string;         // Highlighted text at evaluation time
    };
  }>;

  @Property({ name: 'can_proceed' })
  canProceed!: boolean;

  @Property({ name: 'result_status', length: 30 })
  resultStatus!: 'PASS' | 'PASS_WITH_DEVIATIONS' | 'BLOCKED';

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();
}
```

**Forensic Value:** An auditor can verify: "On Jan 21st 2026, this design was evaluated against ESPR v2025.1 rules, and the system found these specific issues which were authorized by Compliance Manager X."

### TemplateAdoption

Records when tenants adopt marketplace templates.

```typescript
// packages/db/src/entities/TemplateAdoption.ts
import { Entity, PrimaryKey, Property, Enum, Index, Unique } from '@mikro-orm/core';

export enum AdoptionMode {
  LIVE_LINK = 'LIVE_LINK',
  FORKED = 'FORKED',
}

@Entity({ tableName: 'template_adoptions' })
@Unique({ properties: ['listingId'] }) // One adoption per listing per tenant
@Index({ properties: ['adoptedAt'] })
export class TemplateAdoption {
  @PrimaryKey()
  id!: string;

  // Reference to public.marketplace_listings
  @Property({ name: 'listing_id' })
  listingId!: string;

  @Property({ name: 'adopted_at' })
  adoptedAt!: Date;

  @Property({ name: 'adopted_version', length: 50 })
  adoptedVersion!: string;

  @Property({ name: 'forked_to_profile_id', nullable: true })
  forkedToProfileId?: string;

  @Enum(() => AdoptionMode)
  mode!: AdoptionMode;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();
}
```

### AuditLog

```typescript
// packages/db/src/entities/AuditLog.ts
import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { User } from './User.js';

@Entity({ tableName: 'audit_log' })
export class AuditLog {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => User, { nullable: true, name: 'user_id' })
  user?: User;

  @Property()
  action!: string;  // 'product.create', 'version.release', etc.

  @Property({ name: 'resource_type' })
  @Index()
  resourceType!: string;

  @Property({ name: 'resource_id', nullable: true })
  resourceId?: string;

  @Property({ type: 'jsonb', nullable: true })
  changes?: Record<string, unknown>;

  @Property({ name: 'ip_address', nullable: true })
  ipAddress?: string;

  @Property({ name: 'user_agent', nullable: true, type: 'text' })
  userAgent?: string;

  @Property({ name: 'created_at' })
  @Index()
  createdAt: Date = new Date();
}
```

---

## 4. Tenant Schema DDL

Complete SQL for creating a new tenant schema:

```sql
-- Run when new organization is created
-- Replace ${schemaName} with actual schema name (e.g., tenant_abc123)

CREATE SCHEMA IF NOT EXISTS ${schemaName};
SET search_path = ${schemaName};

-- Users (synced from ZITADEL)
CREATE TABLE users (
    id VARCHAR(30) PRIMARY KEY,
    zitadel_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- Organization membership
CREATE TABLE organization_users (
    id VARCHAR(30) PRIMARY KEY,
    user_id VARCHAR(30) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_org_admin BOOLEAN DEFAULT false,
    design_authority VARCHAR(20) DEFAULT 'VIEWER',
    operations_authority VARCHAR(20) DEFAULT 'VIEWER',
    marketing_authority VARCHAR(20) DEFAULT 'VIEWER',
    compliance_authority VARCHAR(20) DEFAULT 'VIEWER',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE products (
    id VARCHAR(30) PRIMARY KEY,
    product_type VARCHAR(20) DEFAULT 'FINISHED_GOOD',
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id VARCHAR(30) REFERENCES products(id),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    design_checked_out_by VARCHAR(30) REFERENCES users(id),
    design_checked_out_at TIMESTAMPTZ,
    marketing_checked_out_by VARCHAR(30) REFERENCES users(id),
    marketing_checked_out_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_type ON products(product_type);
CREATE INDEX idx_products_parent ON products(parent_id);
CREATE INDEX idx_products_status ON products(status);

-- Product identifiers
CREATE TABLE product_identifiers (
    id VARCHAR(30) PRIMARY KEY,
    product_id VARCHAR(30) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    value VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, type)
);

CREATE INDEX idx_product_identifiers_value ON product_identifiers(type, value);

-- Product versions
CREATE TABLE product_versions (
    id VARCHAR(30) PRIMARY KEY,
    product_id VARCHAR(30) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    workspace VARCHAR(20) NOT NULL,
    version_number INT NOT NULL,
    status VARCHAR(20) DEFAULT 'DRAFT',
    created_by VARCHAR(30) NOT NULL REFERENCES users(id),
    reviewer_id VARCHAR(30) REFERENCES users(id),
    published_by VARCHAR(30) REFERENCES users(id),
    published_at TIMESTAMPTZ,
    signature_did VARCHAR(255),
    signature_jws TEXT,
    data JSONB,
    -- Compliance status fields (Approval Gate Workflow)
    compliance_status VARCHAR(20) DEFAULT 'NOT_STARTED',
    last_audit_result_id VARCHAR(30),
    submitted_at TIMESTAMPTZ,
    submitted_by VARCHAR(30) REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, workspace, version_number)
);

CREATE INDEX idx_product_versions_status ON product_versions(status);
CREATE INDEX idx_product_versions_compliance ON product_versions(compliance_status);

-- Bill of materials
-- DECIMAL(12, 4) supports up to 99,999,999.9999
CREATE TABLE bom_entries (
    id VARCHAR(30) PRIMARY KEY,
    parent_product_id VARCHAR(30) NOT NULL REFERENCES products(id),
    child_product_id VARCHAR(30) NOT NULL REFERENCES products(id),
    version_id VARCHAR(30) NOT NULL REFERENCES product_versions(id),
    quantity DECIMAL(12, 4) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    position INT DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parent_product_id, child_product_id, version_id),
    CHECK(parent_product_id != child_product_id)
);

-- DPP snapshots (with compliance profile reference)
CREATE TABLE dpp_snapshots (
    id VARCHAR(30) PRIMARY KEY,
    product_id VARCHAR(30) NOT NULL REFERENCES products(id),
    design_version_id VARCHAR(30) NOT NULL REFERENCES product_versions(id),
    marketing_version_id VARCHAR(30) REFERENCES product_versions(id),
    credential_hash VARCHAR(64) NOT NULL UNIQUE,
    issuer_did VARCHAR(255) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'COMMISSIONED',
    r2_path VARCHAR(500) NOT NULL,
    qr_code_url VARCHAR(500),
    -- Compliance profile (frozen at mint time)
    profile_id VARCHAR(30) REFERENCES readiness_profiles(id),
    profile_version INT,
    profile_audit_label VARCHAR(500), -- "Acme Corp v2.0 (Based on ESPR v2025.1)"
    -- Data snapshots
    snapshot JSONB,
    compliance_summary JSONB, -- { totalRules, passed, deviations, evaluatedAt }
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dpp_snapshots_status ON dpp_snapshots(status);
CREATE INDEX idx_dpp_snapshots_product ON dpp_snapshots(product_id);
CREATE INDEX idx_dpp_snapshots_profile ON dpp_snapshots(profile_id);

-- Operations events (forensic ledger)
CREATE TABLE operations_events (
    id VARCHAR(30) PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    previous_hash VARCHAR(64),
    hash VARCHAR(64) NOT NULL,
    actor_did VARCHAR(255) NOT NULL,
    signature_jws TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_operations_events_type ON operations_events(event_type);
CREATE INDEX idx_operations_events_hash ON operations_events(hash);
CREATE INDEX idx_operations_events_created ON operations_events(created_at);

-- Outbox events
CREATE TABLE outbox_events (
    id VARCHAR(30) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id VARCHAR(30) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    attempts INT DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON outbox_events(created_at) WHERE status = 'PENDING';

-- Status lists (revocation)
CREATE TABLE status_lists (
    id VARCHAR(30) PRIMARY KEY,
    purpose VARCHAR(20) NOT NULL,
    encoded_list TEXT NOT NULL,
    current_index INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE status_list_entries (
    id VARCHAR(30) PRIMARY KEY,
    status_list_id VARCHAR(30) NOT NULL REFERENCES status_lists(id),
    credential_id VARCHAR(30) NOT NULL,
    index INT NOT NULL,
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMPTZ,
    revocation_reason VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rule templates (compliance rules with legal anchoring)
CREATE TABLE rule_templates (
    id VARCHAR(30) PRIMARY KEY,
    organization_id VARCHAR(30), -- NULL = System rule
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    scope VARCHAR(20) NOT NULL, -- SYSTEM, MARKETPLACE, ORGANIZATION
    type VARCHAR(20) NOT NULL, -- ATTRIBUTE, PROCESS
    rule_category VARCHAR(20) NOT NULL, -- DESIGN, OPERATIONS, MARKETING, COMPLIANCE
    severity VARCHAR(20) NOT NULL, -- BLOCKER, WARNING, INFO
    legal_anchor_id VARCHAR(30), -- Reference to public.regulation_anchors
    attribute_template_id VARCHAR(30),
    category_id VARCHAR(30),
    inherited_from_id VARCHAR(30),
    inherited_from_version INT,
    active_from DATE NOT NULL,
    active_until DATE,
    validation_logic JSONB,
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, code)
);

CREATE INDEX idx_rule_templates_scope ON rule_templates(scope, rule_category);
CREATE INDEX idx_rule_templates_active ON rule_templates(active_from, active_until);

-- Reason codes (deviation justifications)
CREATE TABLE reason_codes (
    id VARCHAR(30) PRIMARY KEY,
    organization_id VARCHAR(30), -- NULL = System code
    code VARCHAR(50) NOT NULL,
    label VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    scope VARCHAR(20) NOT NULL,
    category_id VARCHAR(30),
    regulation_id VARCHAR(30), -- Reference to public.regulation_documents
    requires_narrative BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, code)
);

CREATE INDEX idx_reason_codes_scope ON reason_codes(scope, category_id);

-- Readiness profiles (rule collections)
CREATE TABLE readiness_profiles (
    id VARCHAR(30) PRIMARY KEY,
    organization_id VARCHAR(30), -- NULL = System profile
    name VARCHAR(255) NOT NULL,
    version_label VARCHAR(50) NOT NULL,
    description TEXT,
    scope VARCHAR(20) NOT NULL,
    category_id VARCHAR(30) NOT NULL,
    primary_regulation_id VARCHAR(30), -- Reference to public.regulation_documents
    inherited_from_id VARCHAR(30),
    inherited_from_version INT,
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE INDEX idx_readiness_profiles_scope ON readiness_profiles(scope, category_id);

-- Readiness profile rules (join table with overrides)
CREATE TABLE readiness_profile_rules (
    id VARCHAR(30) PRIMARY KEY,
    profile_id VARCHAR(30) NOT NULL REFERENCES readiness_profiles(id) ON DELETE CASCADE,
    rule_id VARCHAR(30) NOT NULL REFERENCES rule_templates(id),
    -- Per-rule override (NULL = inherit from Organization.enforcementMode)
    override_mode VARCHAR(20),  -- ENFORCING | SILENT | DISABLED
    severity_override VARCHAR(20),
    active_from_override DATE,
    -- Audit trail for override changes (Compliance MANAGER only)
    override_set_by VARCHAR(30) REFERENCES users(id),
    override_set_at TIMESTAMPTZ,
    override_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id, rule_id)
);

CREATE INDEX idx_readiness_profile_rules_profile ON readiness_profile_rules(profile_id);
CREATE INDEX idx_readiness_profile_rules_override ON readiness_profile_rules(override_mode) WHERE override_mode IS NOT NULL;

-- Rule deviations (acknowledged gaps per DPP or ProductVersion)
-- Either product_version_id OR dpp_id must be set (design-time vs runtime)
CREATE TABLE rule_deviations (
    id VARCHAR(30) PRIMARY KEY,
    -- Design-time deviations (created during design, before DPP minting)
    product_version_id VARCHAR(30) REFERENCES product_versions(id),
    -- Runtime deviations (cloned from design-time at DPP mint)
    dpp_id VARCHAR(30) REFERENCES dpp_snapshots(id) ON DELETE CASCADE,
    rule_id VARCHAR(30) NOT NULL REFERENCES rule_templates(id),
    rule_version INT NOT NULL,
    reason_code_id VARCHAR(30) NOT NULL REFERENCES reason_codes(id),
    narrative TEXT,
    acknowledged_by VARCHAR(30) NOT NULL REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ NOT NULL,
    -- Authorization fields (Compliance Manager approval)
    authorizing_user_id VARCHAR(30) REFERENCES users(id),
    authorized_at TIMESTAMPTZ,
    ai_sanity_check JSONB,
    legal_anchor_snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Ensure either product_version_id OR dpp_id is set
    CHECK (
        (product_version_id IS NOT NULL AND dpp_id IS NULL) OR
        (product_version_id IS NULL AND dpp_id IS NOT NULL)
    )
);

CREATE INDEX idx_rule_deviations_dpp ON rule_deviations(dpp_id) WHERE dpp_id IS NOT NULL;
CREATE INDEX idx_rule_deviations_version ON rule_deviations(product_version_id) WHERE product_version_id IS NOT NULL;
CREATE INDEX idx_rule_deviations_rule ON rule_deviations(rule_id);

-- Audit result snapshots (frozen PreFlight results for forensic audit)
CREATE TABLE audit_result_snapshots (
    id VARCHAR(30) PRIMARY KEY,
    product_version_id VARCHAR(30) NOT NULL REFERENCES product_versions(id),
    evaluated_at TIMESTAMPTZ NOT NULL,
    profile_id VARCHAR(30) NOT NULL,
    profile_audit_label VARCHAR(500) NOT NULL,
    summary JSONB NOT NULL,
    findings JSONB NOT NULL,  -- Includes rule_version, legal_anchor_snapshot
    can_proceed BOOLEAN NOT NULL,
    result_status VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_result_snapshots_version ON audit_result_snapshots(product_version_id);
CREATE INDEX idx_audit_result_snapshots_status ON audit_result_snapshots(result_status);

-- Template adoptions (marketplace)
CREATE TABLE template_adoptions (
    id VARCHAR(30) PRIMARY KEY,
    listing_id VARCHAR(30) NOT NULL, -- Reference to public.marketplace_listings
    adopted_at TIMESTAMPTZ NOT NULL,
    adopted_version VARCHAR(50) NOT NULL,
    forked_to_profile_id VARCHAR(30),
    mode VARCHAR(20) NOT NULL, -- LIVE_LINK, FORKED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(listing_id)
);

CREATE INDEX idx_template_adoptions_adopted ON template_adoptions(adopted_at);

-- Audit log
CREATE TABLE audit_log (
    id VARCHAR(30) PRIMARY KEY,
    user_id VARCHAR(30) REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(30),
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
```

---

## 5. Entity Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PUBLIC SCHEMA                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Organization ─────────────────────┬──────────────────────────────────────  │
│       |                            |                                         │
│       +── MarketplaceListing[]     +── (routing to tenant schemas)          │
│                                                                              │
│  RegulationDocument                                                          │
│       |                                                                      │
│       +── RegulationAnchor[]                                                │
│              |                                                               │
│              +── (referenced by RuleTemplate.legalAnchorId)                 │
│                                                                              │
│  TAXONOMY REFERENCE DATA (shared across all tenants)                        │
│  ─────────────────────────────────────────────────────                      │
│                                                                              │
│  SeedVersion                       (tracks seeded data versions)            │
│                                                                              │
│  UnitDefinition                    (UNECE Rec 20 units)                     │
│       +── (referenced by AttributeTemplate.defaultUnitId)                   │
│                                                                              │
│  ProductClassification             (HS/CN codes)                            │
│       +── parentCode → ProductClassification (hierarchy)                    │
│       +── (referenced by Product.classificationCode)                        │
│                                                                              │
│  Substance                         (ECHA registry)                          │
│       |                                                                      │
│       +── SubstanceAlias[] (IUPAC, common, trade names)                     │
│       +── (referenced by tenant.MaterialSubstance.substanceId)              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          TENANT SCHEMA                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User                                                                        │
│       |                                                                      │
│       +── OrganizationUser (membership + authorities)                       │
│       +── ProductVersion.createdBy / reviewer / publishedBy                 │
│       +── RuleDeviation.acknowledgedBy                                      │
│       +── MaterialSubstance.verifiedBy                                      │
│       +── AuditLog.user                                                     │
│                                                                              │
│  Product                                                                     │
│       |                                                                      │
│       +── ProductIdentifier[] (GTIN, SKU, etc.)                             │
│       +── ProductVersion[] (per-workspace versions)                         │
│       |       +── BomEntry[]                                                │
│       |       +── MaterialSubstance[] (for MATERIAL targetType only)        │
│       |       +── DppSnapshot.designVersion / marketingVersion              │
│       +── Product[] (variants via parent_id)                                │
│       +── DppSnapshot[]                                                     │
│       +── classificationCode → public.ProductClassification (soft link)    │
│                                                                              │
│  MaterialSubstance (links material versions to public.substance)            │
│       |                                                                      │
│       +── materialVersion → ProductVersion (MATERIAL only)                  │
│       +── substanceId → public.substance (soft link, cross-schema)          │
│       +── verifiedBy → User                                                 │
│       +── concentrationPct, basis (WEIGHT/VOLUME/MOLAR)                     │
│                                                                              │
│  RuleTemplate ◄─────── ReadinessProfileRule ───────► ReadinessProfile       │
│       |                     (overrides)                    |                 │
│       +── legalAnchorId → public.regulation_anchors        +── DppSnapshot  │
│       +── attributeTemplateId → attribute_template                          │
│       +── inheritedFromId (Live Link)                                       │
│       +── validationLogic.type: substance_threshold/presence/authorization                                       │
│                                                                              │
│  ReasonCode                                                                  │
│       |                                                                      │
│       +── RuleDeviation.reasonCode                                          │
│                                                                              │
│  DppSnapshot                                                                 │
│       |                                                                      │
│       +── RuleDeviation[] (acknowledged gaps)                               │
│       +── profile → ReadinessProfile (frozen at mint)                       │
│       +── complianceSummary (frozen audit result)                           │
│                                                                              │
│  TemplateAdoption                                                           │
│       |                                                                      │
│       +── listingId → public.marketplace_listings                           │
│       +── forkedToProfileId → ReadinessProfile                              │
│                                                                              │
│  StatusList                                                                  │
│       +── StatusListEntry[] (credential revocations)                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. ID Generation

All IDs use CUID2 format (collision-resistant, sortable):

```typescript
import { createId } from '@paralleldrive/cuid2';

// Generate ID: clh3am4800000edud5mhqb8kv
const id = createId();
```

| Property | Value |
|----------|-------|
| Length | 25-30 characters |
| Charset | Lowercase alphanumeric |
| Collision-resistant | Yes (128-bit entropy) |
| Sortable | Yes (roughly time-ordered) |

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [Architecture](./01-architecture.md) | Multi-tenancy, schema design |
| [Security](./03-security.md) | Data encryption, access control |
| [Design Workspace](./05-design-workspace.md) | Product, BOM entities in context |
| [Compliance Workspace](./08-compliance-workspace.md) | DPP, StatusList entities in context |
| [Regulatory Advisor](./13-regulatory-advisor.md) | Template engine, soft gates, forensic seal |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 3.6 | 2026-01-24 | Updated OutboxEvent entity to match implementation; added dual-schema pattern documentation, schema placement rules, and event type catalog |
| 3.5 | 2026-01-23 | Updated Clerk references to ZITADEL for auth provider migration |
| 3.4 | 2026-01-21 | Added public.ingestion_jobs DDL to Public Schema section |
| 3.3 | 2026-01-21 | Added Approval Gate Workflow: ComplianceStatus enum, ProductVersion compliance fields, RuleDeviation dual-link model (design-time + authorization), AuditResultSnapshot entity for frozen PreFlight results |
| 3.2 | 2026-01-21 | Added per-rule overrideMode to ReadinessProfileRule (ENFORCING/SILENT/DISABLED); audit trail fields; Compliance MANAGER governance note |
| 3.1 | 2026-01-21 | Added Regulatory Advisor feature toggles to Organization: regulatoryAdvisorEnabled, enforcementMode, captureComplianceInSilentMode |
| 3.0 | 2026-01-21 | Added Regulatory Advisor entities: RegulationDocument, RegulationAnchor, RuleTemplate, ReasonCode, ReadinessProfile (relational), RuleDeviation, MarketplaceListing, TemplateAdoption; Updated DppSnapshot with compliance profile; Public schema expansion |
| 2.0 | 2026-01-21 | Complete MikroORM entities, PENDING_DELETION status, DECIMAL(12,4) for BOM, multi-tenant user sync |
