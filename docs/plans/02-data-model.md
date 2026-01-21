# Data Model (MikroORM)

**Status:** Active
**Last Updated:** 2026-01-21

---

## 1. Overview

EuroComply uses MikroORM with PostgreSQL for relational data. This document defines all entities and their relationships.

### Schema Architecture

```
eurocomply database
├── public                      -- Shared tables
│   └── organizations           -- Tenant registry only
│
└── tenant_{slug}               -- Per-tenant data
    ├── users
    ├── organization_users
    ├── products
    ├── product_identifiers
    ├── product_versions
    ├── bom_entries
    ├── dpp_snapshots
    ├── operations_events
    ├── outbox_events
    ├── audit_log
    ├── status_lists
    ├── status_list_entries
    └── readiness_profiles
```

### Entity Location

| Entity | Schema | Reason |
|--------|--------|--------|
| Organization | `public` (hardcoded) | Tenant registry, routing |
| All others | `tenant_{slug}` (dynamic) | Tenant isolation |

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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_cell ON public.organizations(cell_id);
CREATE INDEX idx_organizations_tier ON public.organizations(subscription_tier);
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
// Triggered by Clerk user.updated webhook

async function syncUserToAllTenants(orm: MikroORM, clerkUser: ClerkUser) {
  // 1. Get all organizations this user belongs to (from Clerk)
  const memberships = await clerk.users.getOrganizationMemberships(clerkUser.id);

  // 2. Update user record in each tenant schema
  for (const membership of memberships.data) {
    const org = await orm.em.findOne(Organization, {
      id: membership.organization.id
    });

    if (!org) continue;

    const em = orm.em.fork({ schema: org.schemaName });
    await em.nativeUpdate(
      User,
      { clerkId: clerkUser.id },
      {
        name: `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim(),
        email: clerkUser.emailAddresses[0]?.emailAddress,
        avatarUrl: clerkUser.imageUrl,
        updatedAt: new Date(),
      }
    );
  }
}
```

**Sync Events:**

| Clerk Event | Action |
|-------------|--------|
| `user.created` | Create user in tenant schema (on org membership) |
| `user.updated` | Update name/email/avatar in ALL tenant schemas |
| `user.deleted` | Remove from ALL tenant schemas |
| `organizationMembership.created` | Create user record in that tenant |
| `organizationMembership.deleted` | Delete user record from that tenant |

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

```typescript
// packages/db/src/entities/OutboxEvent.ts
import { Entity, PrimaryKey, Property, Enum, Index } from '@mikro-orm/core';

export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity({ tableName: 'outbox_events' })
export class OutboxEvent {
  @PrimaryKey()
  id!: string;

  @Property({ name: 'event_type' })
  eventType!: string;

  @Property({ name: 'aggregate_type' })
  aggregateType!: string;

  @Property({ name: 'aggregate_id' })
  aggregateId!: string;

  @Property({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Enum(() => OutboxStatus)
  status: OutboxStatus = OutboxStatus.PENDING;

  @Property({ default: 0 })
  attempts!: number;

  @Property({ name: 'last_error', nullable: true, type: 'text' })
  lastError?: string;

  @Property({ name: 'created_at' })
  @Index()
  createdAt: Date = new Date();

  @Property({ name: 'processed_at', nullable: true })
  processedAt?: Date;
}
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

### ReadinessProfile

```typescript
// packages/db/src/entities/ReadinessProfile.ts
import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'readiness_profiles' })
export class ReadinessProfile {
  @PrimaryKey()
  id!: string;

  @Property()
  name!: string;

  @Property()
  regulation!: string;  // 'ESPR', 'BATTERY_REG', etc.

  @Property({ name: 'product_category', nullable: true })
  productCategory?: string;

  @Property({ type: 'jsonb' })
  requirements!: Record<string, unknown>;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, workspace, version_number)
);

CREATE INDEX idx_product_versions_status ON product_versions(status);

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

-- Readiness profiles
CREATE TABLE readiness_profiles (
    id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    regulation VARCHAR(50) NOT NULL,
    product_category VARCHAR(100),
    requirements JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
Organization (public)
    |
    +-- (routing only, no FK)
    |
    v
User (tenant)
    |
    +-- OrganizationUser (membership + authorities)
    |
    +-- ProductVersion.createdBy
    +-- ProductVersion.reviewer
    +-- ProductVersion.publishedBy
    +-- Product.designCheckedOutBy
    +-- Product.marketingCheckedOutBy
    +-- AuditLog.user

Product (tenant)
    |
    +-- ProductIdentifier[] (GTIN, SKU, etc.)
    |
    +-- ProductVersion[] (per-workspace versions)
    |       |
    |       +-- BomEntry[] (materials/components)
    |       +-- DppSnapshot.designVersion
    |       +-- DppSnapshot.marketingVersion
    |
    +-- Product[] (variants via parent_id)
    |
    +-- BomEntry[] (as parent or child)
    |
    +-- DppSnapshot[]

StatusList (tenant)
    |
    +-- StatusListEntry[] (credential revocations)
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

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-21 | Complete MikroORM entities, PENDING_DELETION status, DECIMAL(12,4) for BOM, multi-tenant user sync |
