# Data Model (MikroORM)

**Status:** Active
**Last Updated:** 2026-01-28

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
│   ├── regulation              -- Regulations (REACH, RoHS, CLP, etc.)
│   ├── requirement             -- Compliance requirements per regulation
│   ├── category_regulation     -- Category-to-regulation M:N junction
│   ├── regulatory_import_log   -- Admin import audit trail
│   └── category               -- System category hierarchy (LTREE)
│
└── tenant_{slug}               -- Per-tenant data
    ├── users
    ├── organization_users
    ├── tenant_category         -- Tenant-owned categories (extensions & custom)
    ├── category_adoption       -- Links tenant categories to system categories
    ├── tenant_requirement_exemption -- Tenant exemptions for requirements
    ├── compliance_evidence     -- Evidence records for compliance checks
    ├── products
    ├── product_identifiers
    ├── product_versions
    ├── bom_entries
    ├── material_substance      -- Substance declarations per material version
    ├── dpp_snapshots
    ├── operations_events
    ├── outbox_events
    ├── audit_log
    ├── status_lists
    ├── status_list_entries
    └── template_adoptions      -- Marketplace adoptions
```

### Entity Location

| Entity | Schema | Reason |
|--------|--------|--------|
| Organization | `public` | Tenant registry, routing |
| RegulationDocument | `public` | Shared across all tenants |
| RegulationAnchor | `public` | Shared legal references |
| MarketplaceListing | `public` | Discoverable by all tenants |
| SeedVersion | `public` | Reference data version tracking |
| UnitDefinition | `public` | UNECE Rec 20 units (shared) |
| ProductClassification | `public` | HS/CN codes (shared international standard) |
| Substance | `public` | ECHA substance registry (shared) |
| SubstanceAlias | `public` | Substance names (shared) |
| Regulation | `public` | Regulations with lifecycle states (shared across tenants) |
| Requirement | `public` | Compliance requirements per regulation (shared) |
| CategoryRegulation | `public` | Category-to-regulation M:N junction (shared) |
| RegulatoryImportLog | `public` | Admin import audit trail (shared) |
| Category | `public` | System category hierarchy (seeded, shared) |
| TenantCategory | `tenant_{slug}` | Tenant-owned categories (extensions & custom) |
| CategoryAdoption | `tenant_{slug}` | Links tenant categories to system categories |
| TenantRequirementExemption | `tenant_{slug}` | Tenant exemptions for specific requirements |
| ComplianceEvidence | `tenant_{slug}` | Evidence records for compliance checks |
| MaterialSubstance | `tenant_{slug}` | Concentration data is proprietary |
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
  // COMPLIANCE EVALUATION SETTINGS
  // See: docs/architecture/compliance-architecture.md
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
  TEMPLATE = 'TEMPLATE',
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

### Regulation

Represents regulations such as REACH, RoHS, CLP, etc. Supports lifecycle states and versioning via succession.

> **Reference:** See `docs/guides/compliance-evaluation-system.md` for the compliance architecture.

```typescript
// packages/database/src/entities/Regulation.ts
import { Entity, Property, Enum, ManyToOne, OneToMany, Collection, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { RegulationStatus } from './enums/RegulationStatus.js';
import type { Requirement } from './Requirement.js';

@Entity({ tableName: 'regulation', schema: 'public' })
export class Regulation extends BaseEntity {
  @Property({ type: 'text' })
  @Unique()
  code!: string;              // 'REACH', 'ROHS', 'CLP' - unique identifier

  @Property({ type: 'text' })
  name!: string;              // 'REACH Regulation'

  @Property({ type: 'text', nullable: true })
  description?: string;       // Detailed description

  @Enum({ items: () => RegulationStatus, default: RegulationStatus.DRAFT })
  status: RegulationStatus = RegulationStatus.DRAFT;  // DRAFT, ACTIVE, ARCHIVED

  @Property({ type: 'text', nullable: true })
  version?: string;           // '2024-01'

  @Property({ type: 'date', nullable: true, name: 'effective_date' })
  effectiveDate?: Date;       // When regulation became/becomes effective

  @Property({ type: 'text', nullable: true, name: 'source_url' })
  sourceUrl?: string;         // URL to official source

  @ManyToOne(() => Regulation, { nullable: true, name: 'superseded_by_id' })
  supersededBy?: Regulation;  // Reference to superseding regulation (when archived)

  @Property({ type: 'timestamptz', nullable: true, name: 'archived_at' })
  archivedAt?: Date;          // When archived

  @Property({ type: 'text', nullable: true, name: 'archive_reason' })
  archiveReason?: string;     // Reason for archiving

  @Property({ type: 'jsonb', nullable: true })
  metadata?: {
    jurisdiction?: string;
    type?: string;
    officialJournalRef?: string;
  };

  @OneToMany('Requirement', 'regulation')
  requirements = new Collection<Requirement>(this);
}
```

**DDL:**

```sql
CREATE TABLE public.regulation (
    id VARCHAR(30) PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'DRAFT',  -- DRAFT, ACTIVE, ARCHIVED
    version TEXT,
    effective_date DATE,
    source_url TEXT,
    superseded_by_id VARCHAR(30) REFERENCES public.regulation(id),
    archived_at TIMESTAMPTZ,
    archive_reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regulation_code ON public.regulation(code);
CREATE INDEX idx_regulation_status ON public.regulation(status);
```

### Requirement

Compliance requirements within a regulation. Supports four types: ATTRIBUTE_CHECK, SUBSTANCE_SCREEN, CALCULATED_CHECK, and DECLARATION.

```typescript
// packages/database/src/entities/Requirement.ts
import { Entity, Property, Enum, ManyToOne, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Regulation } from './Regulation.js';
import { RequirementType } from './enums/RequirementType.js';
import { RequirementSeverity } from './enums/RequirementSeverity.js';
import type { ComparisonOperator } from './enums/ComparisonOperator.js';

export interface RequirementHandlerConfig {
  operator?: ComparisonOperator;    // Comparison operator for threshold checks
  threshold?: number;               // Threshold value for numeric comparisons
  unit?: string;                    // Unit of measurement
  pattern?: string;                 // Regex pattern for string matching
  defaultThresholdPct?: number;     // Default threshold for substance screens
  question?: string;                // Question text for DECLARATION
  acceptedAnswers?: string[];       // Accepted answers for DECLARATION
  requiresDocument?: boolean;       // Whether a document is required
  acceptedDocumentTypes?: string[]; // Accepted document types
}

@Entity({ tableName: 'requirement', schema: 'public' })
@Unique({ properties: ['regulation', 'code'] })
export class Requirement extends BaseEntity {
  @ManyToOne(() => Regulation, { name: 'regulation_id' })
  @Index()
  regulation!: Regulation;

  @Property({ type: 'text' })
  code!: string;              // 'VOLTAGE_CHECK', 'LEAD_SCREEN' (unique within regulation)

  @Property({ type: 'text' })
  name!: string;              // 'Voltage Compliance Check'

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Enum({ items: () => RequirementType })
  type!: RequirementType;     // ATTRIBUTE_CHECK, SUBSTANCE_SCREEN, CALCULATED_CHECK, DECLARATION

  @Enum({ items: () => RequirementSeverity, default: RequirementSeverity.WARNING })
  severity: RequirementSeverity = RequirementSeverity.WARNING;  // BLOCKER, WARNING, INFO

  @Property({ type: 'text', nullable: true, name: 'attribute_template_key' })
  attributeTemplateKey?: string | null;   // For ATTRIBUTE_CHECK type

  @Property({ type: 'text', nullable: true, name: 'substance_list_id' })
  substanceListId?: string | null;        // For SUBSTANCE_SCREEN type

  @Property({ type: 'text', nullable: true, name: 'calculation_formula' })
  calculationFormula?: string | null;     // For CALCULATED_CHECK type

  @Property({ type: 'jsonb', nullable: true, name: 'handler_config' })
  handlerConfig?: RequirementHandlerConfig | null;  // Type-specific configuration

  @Property({ type: 'text', nullable: true, name: 'legal_reference' })
  legalReference?: string | null;         // 'Article 33, REACH Regulation'

  @Property({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder: number = 0;

  @Property({ type: 'boolean', default: true, name: 'allow_tenant_exemption' })
  allowTenantExemption: boolean = true;   // Whether tenants can create exemptions
}
```

**DDL:**

```sql
CREATE TABLE public.requirement (
    id VARCHAR(30) PRIMARY KEY,
    regulation_id VARCHAR(30) NOT NULL REFERENCES public.regulation(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    type VARCHAR(30) NOT NULL,           -- ATTRIBUTE_CHECK, SUBSTANCE_SCREEN, CALCULATED_CHECK, DECLARATION
    severity VARCHAR(20) DEFAULT 'WARNING',  -- BLOCKER, WARNING, INFO
    attribute_template_key TEXT,
    substance_list_id TEXT,
    calculation_formula TEXT,
    handler_config JSONB,
    legal_reference TEXT,
    sort_order INT DEFAULT 0,
    allow_tenant_exemption BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(regulation_id, code)
);

CREATE INDEX idx_requirement_regulation ON public.requirement(regulation_id);
CREATE INDEX idx_requirement_type ON public.requirement(type);
```

### CategoryRegulation

Maps Categories to Regulations (M:N junction table). Tracks which regulations apply to which product categories.

```typescript
// packages/database/src/entities/CategoryRegulation.ts
import { Entity, Property, ManyToOne, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';
import { Regulation } from './Regulation.js';

@Entity({ tableName: 'category_regulation', schema: 'public' })
@Unique({ properties: ['category', 'regulation'] })
export class CategoryRegulation extends BaseEntity {
  @ManyToOne(() => Category, { name: 'category_id' })
  @Index()
  category!: Category;

  @ManyToOne(() => Regulation, { name: 'regulation_id' })
  @Index()
  regulation!: Regulation;

  @Property({ type: 'timestamptz', name: 'added_at' })
  addedAt: Date = new Date();

  @Property({ type: 'text', nullable: true, name: 'added_by' })
  addedBy?: string;           // User or system that created this mapping
}
```

**DDL:**

```sql
CREATE TABLE public.category_regulation (
    id VARCHAR(30) PRIMARY KEY,
    category_id VARCHAR(30) NOT NULL REFERENCES public.category(id) ON DELETE CASCADE,
    regulation_id VARCHAR(30) NOT NULL REFERENCES public.regulation(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    added_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_id, regulation_id)
);

CREATE INDEX idx_category_regulation_category ON public.category_regulation(category_id);
CREATE INDEX idx_category_regulation_regulation ON public.category_regulation(regulation_id);
```

### RegulatoryImportLog

Audit trail for admin regulation imports.

```typescript
// packages/database/src/entities/RegulatoryImportLog.ts
import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Regulation } from './Regulation.js';

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
  @ManyToOne(() => Regulation, { nullable: true, name: 'regulation_id' })
  regulation?: Regulation;      // Set after successful apply

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
    regulation_id VARCHAR(30) REFERENCES public.regulation(id),
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

### Category (System)

System-managed category hierarchy using PostgreSQL LTREE for efficient tree queries. Seeded by platform, shared across all tenants.

```typescript
// packages/database/src/entities/Category.ts
import { Entity, Property, Index, ManyToOne, OneToMany, Collection, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { TargetType } from './enums/index.js';

export enum CategoryType {
  ROOT = 'ROOT',     // Top-level category (e.g., "Apparel")
  BRANCH = 'BRANCH', // Intermediate node (e.g., "Apparel > Tops")
  LEAF = 'LEAF',     // Terminal node (e.g., "Apparel > Tops > T-Shirts")
}

@Entity({ tableName: 'category', schema: 'public' })
export class Category extends BaseEntity {
  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Index({ type: 'gist' })
  @Property({ columnType: 'ltree' })
  path!: string;                        // e.g., "apparel.tops.tshirts"

  @Enum({ items: () => CategoryType, default: CategoryType.BRANCH })
  type: CategoryType = CategoryType.BRANCH;

  @Enum({ items: () => TargetType, name: 'target_type', default: TargetType.PRODUCT })
  targetType: TargetType = TargetType.PRODUCT;

  @Property({ type: 'int', default: 0 })
  depth: number = 0;                    // 0 = ROOT, 1+ = descendants

  @ManyToOne(() => Category, { nullable: true, name: 'parent_id' })
  parent?: Category;

  @OneToMany(() => Category, (cat) => cat.parent)
  children = new Collection<Category>(this);

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;

  @Property({ type: 'int', default: 1 })
  version: number = 1;                  // Incremented on updates for FROZEN tracking
}
```

**DDL:**

```sql
CREATE TABLE public.category (
    id VARCHAR(30) PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    path LTREE NOT NULL,
    type VARCHAR(10) DEFAULT 'BRANCH',  -- ROOT, BRANCH, LEAF
    target_type VARCHAR(20) DEFAULT 'PRODUCT',  -- PRODUCT, MATERIAL, FACILITY, BATCH
    depth INT DEFAULT 0,
    parent_id VARCHAR(30) REFERENCES public.category(id),
    is_active BOOLEAN DEFAULT true,
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_category_path ON public.category USING GIST (path);
CREATE INDEX idx_category_target_type ON public.category(target_type);
CREATE INDEX idx_category_parent ON public.category(parent_id);
```

**LTREE Query Examples:**

```sql
-- Find all descendants of 'apparel' (children, grandchildren, etc.)
SELECT * FROM public.category WHERE path <@ 'apparel'::ltree;

-- Find all ancestors of 'apparel.tops.tshirts' (parent, grandparent, etc.)
SELECT * FROM public.category WHERE path @> 'apparel.tops.tshirts'::ltree;

-- Find direct children of 'apparel'
SELECT * FROM public.category WHERE path ~ 'apparel.*{1}'::lquery;

-- Find siblings of 'apparel.tops' (same depth, same parent)
SELECT * FROM public.category
WHERE nlevel(path) = 2 AND path <@ 'apparel'::ltree AND path != 'apparel.tops'::ltree;
```

---

## 3. Tenant Schema Entities

### User

Users are stored **per-tenant**. A user who belongs to multiple organizations has separate records in each tenant schema, linked by `clerkId`.

```typescript
// packages/db/src/entities/User.ts
import { Entity, PrimaryKey, Property, OneToMany, Collection, Unique } from '@mikro-orm/core';
import { OrganizationUser } from './OrganizationUser.js';

@Entity({ tableName: 'users' })
export class User {
  @PrimaryKey()
  id!: string;

  @Property({ name: 'clerk_id' })
  @Unique()
  clerkId!: string;

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
// apps/api/src/webhooks/clerk.ts
// Triggered by Clerk user events

async function syncUserToAllTenants(orm: MikroORM, clerkUser: ClerkUser) {
  // 1. Get all organizations this user belongs to (from Clerk)
  const memberships = await clerk.listUserGrants(clerkUser.id);

  // 2. Update user record in each tenant schema
  for (const membership of memberships.result) {
    const org = await orm.em.findOne(Organization, {
      clerkOrgId: membership.orgId
    });

    if (!org) continue;

    const em = orm.em.fork({ schema: org.schemaName });
    await em.nativeUpdate(
      User,
      { clerkId: clerkUser.id },
      {
        name: clerkUser.human?.profile?.displayName ?? '',
        email: clerkUser.human?.email?.email,
        avatarUrl: clerkUser.human?.profile?.avatarUrl,
        updatedAt: new Date(),
      }
    );
  }
}
```

**Sync Events:**

| Clerk Event | Action |
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

### TenantCategory

Tenant-owned categories for extending or customizing the system category hierarchy. Can be:
- **Extensions**: Linked to a system category (with LIVE/FROZEN/DETACHED modes)
- **Custom**: Fully tenant-owned categories with no system link

```typescript
// packages/database/src/entities/TenantCategory.ts
import { Entity, Property, Index, ManyToOne, OneToMany, Collection, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { CategoryType } from './Category.js';
import { TargetType } from './enums/index.js';

export enum LinkMode {
  LIVE = 'LIVE',         // Auto-sync with system category updates
  FROZEN = 'FROZEN',     // Snapshot at version, notifications available
  DETACHED = 'DETACHED', // Fully independent, no update tracking
}

@Entity({ tableName: 'tenant_category' })
export class TenantCategory extends BaseEntity {
  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Index({ type: 'gist' })
  @Property({ columnType: 'ltree' })
  path!: string;                          // Tenant-local path (not extending system paths)

  @Enum({ items: () => CategoryType, default: CategoryType.BRANCH })
  type: CategoryType = CategoryType.BRANCH;

  @Enum({ items: () => TargetType, name: 'target_type', default: TargetType.PRODUCT })
  targetType: TargetType = TargetType.PRODUCT;

  @Property({ type: 'int', default: 0 })
  depth: number = 0;

  @ManyToOne(() => TenantCategory, { nullable: true, name: 'parent_id' })
  parent?: TenantCategory;                // FK within tenant schema

  @OneToMany(() => TenantCategory, (cat) => cat.parent)
  children = new Collection<TenantCategory>(this);

  // Soft reference to system category (no FK constraint for cell scaling)
  @Property({ type: 'text', nullable: true, name: 'system_category_id' })
  systemCategoryId?: string;              // UUID of public.category (if linked)

  @Enum({ items: () => LinkMode, nullable: true, name: 'link_mode' })
  linkMode?: LinkMode;                    // Only set if systemCategoryId is set

  @Property({ type: 'int', nullable: true, name: 'frozen_at_version' })
  frozenAtVersion?: number;               // System category version when frozen

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;
}
```

**DDL:**

```sql
CREATE TABLE tenant_category (
    id VARCHAR(30) PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    path LTREE NOT NULL,
    type VARCHAR(10) DEFAULT 'BRANCH',        -- ROOT, BRANCH, LEAF
    target_type VARCHAR(20) DEFAULT 'PRODUCT', -- PRODUCT, MATERIAL, FACILITY, BATCH
    depth INT DEFAULT 0,
    parent_id VARCHAR(30) REFERENCES tenant_category(id),
    system_category_id VARCHAR(30),            -- Soft ref to public.category (no FK)
    link_mode VARCHAR(10),                     -- LIVE, FROZEN, DETACHED
    frozen_at_version INT,                     -- Version snapshot for FROZEN mode
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenant_category_path ON tenant_category USING GIST (path);
CREATE INDEX idx_tenant_category_system ON tenant_category(system_category_id);
CREATE INDEX idx_tenant_category_parent ON tenant_category(parent_id);
```

**Link Mode Behavior:**

| Mode | System Updates | Notifications | Use Case |
|------|----------------|---------------|----------|
| **LIVE** | Auto-applied to tenant category | Yes | "Keep me current with regulations" |
| **FROZEN** | Ignored (snapshot at version) | Yes, can review & merge | "I want control over when to update" |
| **DETACHED** | Ignored permanently | No | "I've diverged, don't notify me" |

**Permissions:**
- `design:manager` required to create, edit, or delete tenant categories
- `design:view` sufficient for browsing and assigning to products

**Deletion Rules:**
- Cannot delete a category with assigned products
- Error returns count of affected products
- Must reassign products first

### CategoryAdoption

Links tenant's adopted system categories. Tracks which system categories a tenant uses and their sync preferences.

```typescript
// packages/database/src/entities/CategoryAdoption.ts
import { Entity, Property, ManyToOne, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { TenantCategory } from './TenantCategory.js';
import { LinkMode } from './TenantCategory.js';

@Entity({ tableName: 'category_adoption' })
export class CategoryAdoption extends BaseEntity {
  // Soft link to public.category - NO FK for cell scaling
  @Property({ type: 'text', name: 'system_category_id' })
  systemCategoryId!: string;

  // Optional local category that extends/customizes the system category
  @ManyToOne(() => TenantCategory, { nullable: true, name: 'local_category_id' })
  localCategory?: TenantCategory;

  @Enum({ items: () => LinkMode })
  mode!: LinkMode;

  @Property({ name: 'adopted_at' })
  adoptedAt!: Date;

  @Property({ type: 'int', nullable: true, name: 'adopted_version' })
  adoptedVersion?: number;                // System category version at adoption

  @Property({ type: 'boolean', default: false, name: 'update_available' })
  updateAvailable: boolean = false;       // Set when system category version increases
}
```

**DDL:**

```sql
CREATE TABLE category_adoption (
    id VARCHAR(30) PRIMARY KEY,
    system_category_id VARCHAR(30) NOT NULL,  -- Soft ref to public.category
    local_category_id VARCHAR(30) REFERENCES tenant_category(id),
    mode VARCHAR(10) NOT NULL,                -- LIVE, FROZEN, DETACHED
    adopted_at TIMESTAMPTZ NOT NULL,
    adopted_version INT,
    update_available BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_category_adoption_system ON category_adoption(system_category_id);
CREATE INDEX idx_category_adoption_local ON category_adoption(local_category_id);
CREATE UNIQUE INDEX idx_category_adoption_unique ON category_adoption(system_category_id);
```

### TenantRequirementExemption

Tenant-level exemption for specific requirements. Allows tenants to exempt certain requirements for their categories with documented justification.

> **Note:** Uses `requirementId` as text string instead of FK because the Requirement entity is in public schema. Cross-schema FKs are complex in PostgreSQL with schema-per-tenant architecture.

```typescript
// packages/database/src/entities/TenantRequirementExemption.ts
import { Entity, Property, ManyToOne, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { TenantCategory } from './TenantCategory.js';

@Entity({ tableName: 'tenant_requirement_exemption' })
@Unique({ properties: ['tenantCategory', 'requirementId'] })
export class TenantRequirementExemption extends BaseEntity {
  @ManyToOne(() => TenantCategory, { name: 'tenant_category_id' })
  @Index()
  tenantCategory!: TenantCategory;

  @Property({ type: 'text', name: 'requirement_id' })
  @Index()
  requirementId!: string;     // Soft ref to public.requirement

  @Property({ type: 'text' })
  reason!: string;            // Justification for exemption

  @Property({ type: 'text', nullable: true, name: 'legal_reference' })
  legalReference?: string;    // Supporting legal reference

  @Property({ type: 'text', name: 'exempted_by' })
  exemptedBy!: string;        // User who created the exemption

  @Property({ type: 'timestamptz', name: 'exempted_at' })
  exemptedAt: Date = new Date();

  // Revocation fields
  @Property({ type: 'timestamptz', nullable: true, name: 'revoked_at' })
  revokedAt?: Date;

  @Property({ type: 'text', nullable: true, name: 'revoked_by' })
  revokedBy?: string;

  @Property({ type: 'text', nullable: true, name: 'revocation_reason' })
  revocationReason?: string;
}
```

**DDL:**

```sql
CREATE TABLE tenant_requirement_exemption (
    id VARCHAR(30) PRIMARY KEY,
    tenant_category_id VARCHAR(30) NOT NULL REFERENCES tenant_category(id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL,         -- Soft ref to public.requirement
    reason TEXT NOT NULL,
    legal_reference TEXT,
    exempted_by TEXT NOT NULL,
    exempted_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoked_by TEXT,
    revocation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_category_id, requirement_id)
);

CREATE INDEX idx_tenant_requirement_exemption_category ON tenant_requirement_exemption(tenant_category_id);
CREATE INDEX idx_tenant_requirement_exemption_requirement ON tenant_requirement_exemption(requirement_id);
```

### ComplianceEvidence

Records the result of evaluating a requirement against a product version. Contains a requirement snapshot for historical integrity - even if the requirement is modified or deleted, this evidence record remains self-contained and auditable.

```typescript
// packages/database/src/entities/ComplianceEvidence.ts
import { Entity, Property, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { EvidenceType, EvidenceResult, RequirementType, RequirementSeverity } from './enums/index.js';

export interface RequirementSnapshot {
  code: string;
  name: string;
  type: RequirementType;
  severity: RequirementSeverity;
  regulationCode: string;
  regulationName: string;
  handlerConfig?: Record<string, unknown>;
  legalReference?: string;
  snapshotAt: Date;
}

@Entity({ tableName: 'compliance_evidence' })
export class ComplianceEvidence extends BaseEntity {
  @Property({ type: 'text', name: 'product_version_id' })
  @Index()
  productVersionId!: string;

  @Property({ type: 'text', name: 'requirement_id', nullable: true })
  @Index()
  requirementId?: string;     // May be deleted in future

  /**
   * SNAPSHOT: Captures requirement state at time of evidence recording.
   * Ensures audit report remains readable even if requirement changes/deleted.
   * This is the ONLY way to generate a legally defensible audit trail.
   */
  @Property({ type: 'jsonb', name: 'requirement_snapshot' })
  requirementSnapshot!: RequirementSnapshot;

  @Enum({ items: () => EvidenceType })
  type!: EvidenceType;        // AUTO_CHECK, DECLARATION, DOCUMENT

  @Enum({ items: () => EvidenceResult })
  result!: EvidenceResult;    // PASS, FAIL, NOT_APPLICABLE, PENDING, EXEMPTED

  /**
   * Evidence details vary by type:
   * - AUTO_CHECK: { actualValue, threshold, operator, message }
   * - DECLARATION: { answer, justification }
   * - DOCUMENT: { documentType, fileName }
   */
  @Property({ type: 'jsonb' })
  details!: Record<string, unknown>;

  @Property({ type: 'text', nullable: true, name: 'document_key' })
  documentKey?: string;       // R2/S3 file key for uploaded evidence

  @Property({ type: 'text', name: 'recorded_by' })
  recordedBy!: string;

  @Property({ type: 'timestamptz', name: 'recorded_at' })
  recordedAt: Date = new Date();
}
```

**DDL:**

```sql
CREATE TABLE compliance_evidence (
    id VARCHAR(30) PRIMARY KEY,
    product_version_id TEXT NOT NULL,
    requirement_id TEXT,                  -- Soft ref to public.requirement (may be deleted)
    requirement_snapshot JSONB NOT NULL,  -- Frozen requirement state for audit
    type VARCHAR(20) NOT NULL,            -- AUTO_CHECK, DECLARATION, DOCUMENT
    result VARCHAR(20) NOT NULL,          -- PASS, FAIL, NOT_APPLICABLE, PENDING, EXEMPTED
    details JSONB NOT NULL,
    document_key TEXT,
    recorded_by TEXT NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compliance_evidence_version ON compliance_evidence(product_version_id);
CREATE INDEX idx_compliance_evidence_requirement ON compliance_evidence(requirement_id);
CREATE INDEX idx_compliance_evidence_result ON compliance_evidence(result);
```

**Evidence Types:**

| Type | Description | Details Schema |
|------|-------------|----------------|
| `AUTO_CHECK` | Automated requirement evaluation | `{ actualValue, threshold, operator, message }` |
| `DECLARATION` | User attestation/declaration | `{ answer, justification }` |
| `DOCUMENT` | Uploaded supporting document | `{ documentType, fileName }` |

**Evidence Results:**

| Result | Description |
|--------|-------------|
| `PASS` | Requirement satisfied |
| `FAIL` | Requirement not satisfied |
| `NOT_APPLICABLE` | Requirement does not apply to this product |
| `PENDING` | Evidence not yet recorded |
| `EXEMPTED` | Requirement exempted by tenant policy |

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
// See: docs/guides/compliance-evaluation-system.md
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
  // See: docs/guides/compliance-evaluation-system.md
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
import { Entity, PrimaryKey, Property, ManyToOne, Enum, Unique } from '@mikro-orm/core';
import { Product } from './Product.js';
import { ProductVersion } from './ProductVersion.js';

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

  // Snapshot of data at issuance time
  @Property({ type: 'jsonb', nullable: true })
  snapshot?: Record<string, unknown>;

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
| `clerk.metadata_sync_requested` | Organization | Sync schema metadata back to Clerk |

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

-- Users (synced from Clerk)
CREATE TABLE users (
    id VARCHAR(30) PRIMARY KEY,
    clerk_id VARCHAR(255) UNIQUE NOT NULL,
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

-- Tenant requirement exemptions
CREATE TABLE tenant_requirement_exemption (
    id VARCHAR(30) PRIMARY KEY,
    tenant_category_id VARCHAR(30) NOT NULL REFERENCES tenant_category(id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL,         -- Soft ref to public.requirement
    reason TEXT NOT NULL,
    legal_reference TEXT,
    exempted_by TEXT NOT NULL,
    exempted_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoked_by TEXT,
    revocation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_category_id, requirement_id)
);

CREATE INDEX idx_tenant_requirement_exemption_category ON tenant_requirement_exemption(tenant_category_id);
CREATE INDEX idx_tenant_requirement_exemption_requirement ON tenant_requirement_exemption(requirement_id);

-- Compliance evidence (requirement evaluation results)
CREATE TABLE compliance_evidence (
    id VARCHAR(30) PRIMARY KEY,
    product_version_id TEXT NOT NULL,
    requirement_id TEXT,                  -- Soft ref to public.requirement
    requirement_snapshot JSONB NOT NULL,  -- Frozen requirement state for audit
    type VARCHAR(20) NOT NULL,            -- AUTO_CHECK, DECLARATION, DOCUMENT
    result VARCHAR(20) NOT NULL,          -- PASS, FAIL, NOT_APPLICABLE, PENDING, EXEMPTED
    details JSONB NOT NULL,
    document_key TEXT,
    recorded_by TEXT NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compliance_evidence_version ON compliance_evidence(product_version_id);
CREATE INDEX idx_compliance_evidence_requirement ON compliance_evidence(requirement_id);
CREATE INDEX idx_compliance_evidence_result ON compliance_evidence(result);

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

-- DPP snapshots
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
    snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dpp_snapshots_status ON dpp_snapshots(status);
CREATE INDEX idx_dpp_snapshots_product ON dpp_snapshots(product_id);

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

-- Template adoptions (marketplace)
CREATE TABLE template_adoptions (
    id VARCHAR(30) PRIMARY KEY,
    listing_id VARCHAR(30) NOT NULL, -- Reference to public.marketplace_listings
    adopted_at TIMESTAMPTZ NOT NULL,
    adopted_version VARCHAR(50) NOT NULL,
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
│  COMPLIANCE FRAMEWORK (shared across all tenants)                           │
│  ─────────────────────────────────────────────────                          │
│                                                                              │
│  Regulation                          (REACH, RoHS, CLP, etc.)               │
│       |                                                                      │
│       +── Requirement[] (compliance checks per regulation)                  │
│       |       +── type: ATTRIBUTE_CHECK | SUBSTANCE_SCREEN | ...            │
│       |       +── handlerConfig (evaluation configuration)                  │
│       |       +── (referenced by tenant.ComplianceEvidence.requirementId)   │
│       +── supersededBy → Regulation (version succession)                    │
│                                                                              │
│  Category ◄─────── CategoryRegulation ───────► Regulation                   │
│       (M:N junction - which regulations apply to which categories)          │
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
│  TenantRequirementExemption (tenant exemptions for requirements)            │
│       |                                                                      │
│       +── tenantCategory → TenantCategory                                   │
│       +── requirementId → public.requirement (soft link)                    │
│       +── reason, legalReference (exemption justification)                  │
│       +── revocation fields (revokedAt, revokedBy, revocationReason)        │
│                                                                              │
│  ComplianceEvidence (requirement evaluation results)                        │
│       |                                                                      │
│       +── productVersionId → ProductVersion (soft link)                     │
│       +── requirementId → public.requirement (soft link)                    │
│       +── requirementSnapshot (frozen state for audit)                      │
│       +── type (AUTO_CHECK | DECLARATION | DOCUMENT)                        │
│       +── result (PASS | FAIL | NOT_APPLICABLE | PENDING | EXEMPTED)        │
│                                                                              │
│  DppSnapshot                                                                 │
│       |                                                                      │
│       +── designVersion → ProductVersion                                    │
│       +── marketingVersion → ProductVersion (optional)                      │
│       +── snapshot (data at issuance time)                                  │
│                                                                              │
│  TemplateAdoption                                                           │
│       |                                                                      │
│       +── listingId → public.marketplace_listings                           │
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
| [Compliance Architecture](../architecture/compliance-architecture.md) | ComplianceStackResolver, soft gates, forensic seal |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 3.8 | 2026-01-28 | Removed deprecated entities: RuleTemplate, ReasonCode, ReadinessProfile, ReadinessProfileRule, RuleDeviation, AuditResultSnapshot; simplified DppSnapshot; current compliance model uses Regulation/Requirement/ComplianceEvidence |
| 3.7 | 2026-01-28 | Replaced RegulatoryList/RegulatoryListEntry with Regulation/Requirement; replaced CategoryRegulatoryList with CategoryRegulation; added TenantRequirementExemption and ComplianceEvidence entities |
| 3.6 | 2026-01-24 | Updated OutboxEvent entity to match implementation; added dual-schema pattern documentation, schema placement rules, and event type catalog |
| 3.5 | 2026-01-23 | Updated Clerk references to Clerk for auth provider migration |
| 3.4 | 2026-01-21 | Added public.ingestion_jobs DDL to Public Schema section |
| 2.0 | 2026-01-21 | Complete MikroORM entities, PENDING_DELETION status, DECIMAL(12,4) for BOM, multi-tenant user sync |
