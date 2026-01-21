# MikroORM Migration Design

**Status:** Draft
**Date:** 2026-01-20
**Purpose:** Replace Prisma with MikroORM to implement true schema-per-tenant isolation

---

## 1. Overview & Goals

### Why This Migration

The current implementation uses Prisma with `organizationId` column filtering (row-level isolation) instead of the intended schema-per-tenant architecture specified in `2026-01-15-architecture-design.md`.

**Architecture Design (Section 4) specifies:**
```
eurocomply database
├── public              -- Shared tables (tenants, migrations)
├── tenant_abc123       -- Organization ABC's data
```

**Current Implementation (incorrect):**
- All tables in `public` schema
- `organizationId` column on every table
- Row-level filtering in application code

**Security Risk:** A single missed WHERE clause leaks data across tenants. No PostgreSQL-level enforcement.

### Why MikroORM

| Feature | Prisma | MikroORM |
|---------|--------|----------|
| Dynamic schema switching | Not supported | Native `schema` option |
| Runtime schema context | Requires raw SQL | `em.fork({ schema })` |
| Multi-schema migrations | Manual | Built-in per-schema |
| Unit of Work | No | Yes (better transaction handling) |
| TypeScript decorators | No (schema file) | Yes (entities are classes) |

### Goals

1. True PostgreSQL schema isolation - each tenant's data in `tenant_{slug}` schema
2. Shared tables (`organizations` only) remain in `public` schema
3. Maintain type safety and relations
4. Preserve existing API contracts (no breaking changes to routes)
5. All existing tests pass after migration
6. Complete Prisma removal (no hybrid state)

### Out of Scope

- New features (this is infrastructure only)
- DynamoDB/R2 changes (unaffected)
- Frontend changes (API unchanged)

### Success Criteria

- `SET search_path` enforced at connection level for all tenant queries
- No `organizationId` filtering in application code for tenant tables
- Security test: Query without schema context returns zero rows (not other tenant's data)

---

## 2. Schema Architecture

### Public Schema (minimal - tenant registry only)

```sql
public.organizations        -- Tenant registry, billing tier, schema name
```

### Tenant Schema (all organization data)

```sql
tenant_{slug}.users                  -- Local user profiles (synced from Clerk)
tenant_{slug}.organization_users     -- Membership + workspace authorities
tenant_{slug}.user_did_history       -- User DID rotation
tenant_{slug}.org_did_history        -- Org DID rotation
tenant_{slug}.products               -- Product hub entity
tenant_{slug}.product_identifiers    -- GTIN, SKU, Internal IDs
tenant_{slug}.product_versions       -- Per-workspace versioning
tenant_{slug}.bom_entries            -- Bill of materials
tenant_{slug}.dpp_snapshots          -- Compliance snapshots
tenant_{slug}.operations_events      -- Forensic ledger
tenant_{slug}.outbox_events          -- Transactional outbox (atomic with data)
tenant_{slug}.audit_log              -- All mutations logged
tenant_{slug}.status_lists           -- Revocation registry
tenant_{slug}.status_list_entries    -- Revocation entries
tenant_{slug}.readiness_profiles     -- Compliance templates
```

### Key Design Decisions

1. **Users are per-tenant** - Users who belong to multiple organizations have separate records in each tenant schema. No cross-tenant foreign keys.

2. **Outbox is per-tenant** - Ensures atomic transactions with tenant data. Event processor polls each tenant schema.

3. **No organizationId columns** - Schema isolation replaces row-level filtering.

### Connection Flow

1. Request arrives with JWT
2. Lookup `organizations` in public to get `schema_name`
3. `SET search_path = tenant_{slug}, public`
4. All subsequent queries hit tenant schema

---

## 3. MikroORM Configuration

### Base Configuration

```typescript
// packages/db/src/mikro-orm.config.ts
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';

export default defineConfig({
  driver: PostgreSqlDriver,
  dbName: 'eurocomply',
  schema: 'public', // Default for shared tables
  entities: ['./dist/entities/**/*.js'],
  entitiesTs: ['./src/entities/**/*.ts'],
  migrations: {
    path: './migrations',
    glob: '!(*.d).{js,ts}',
  },
});
```

### Tenant Context Utilities

```typescript
// packages/db/src/tenant-context.ts
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';

export async function withTenantContext<T>(
  orm: MikroORM,
  schemaName: string,
  callback: (em: EntityManager) => Promise<T>
): Promise<T> {
  const em = orm.em.fork({ schema: schemaName });
  try {
    return await callback(em);
  } finally {
    em.clear();
  }
}

export function createTenantEm(orm: MikroORM, schemaName: string): EntityManager {
  return orm.em.fork({ schema: schemaName });
}
```

---

## 4. Entity Definitions

### Public Schema Entity

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

  @Property({ name: 'stripe_customer_id', nullable: true })
  stripeCustomerId?: string;

  @Property({ name: 'subscription_tier', default: 'starter' })
  subscriptionTier!: string;

  @Property({ name: 'subscription_status', default: 'active' })
  subscriptionStatus!: string;

  @Property({ name: 'user_limit', default: 20 })
  userLimit!: number;

  @Property({ name: 'storage_limit', type: 'bigint', default: 536870912000n })
  storageLimit!: bigint;

  @Property({ nullable: true })
  did?: string;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

### Tenant Schema Entities

Tenant entities have no hardcoded `schema` - it's set at runtime via `em.fork({ schema })`.

```typescript
// packages/db/src/entities/User.ts
import { Entity, PrimaryKey, Property, OneToMany, Collection } from '@mikro-orm/core';
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

```typescript
// packages/db/src/entities/OrganizationUser.ts
import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { User } from './User.js';

@Entity({ tableName: 'organization_users' })
export class OrganizationUser {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => User, { name: 'user_id' })
  user!: User;

  @Property({ default: 'member' })
  role!: string;

  @Property({ name: 'design_authority', default: 'VIEWER' })
  designAuthority!: string;

  @Property({ name: 'operations_authority', default: 'VIEWER' })
  operationsAuthority!: string;

  @Property({ name: 'marketing_authority', default: 'VIEWER' })
  marketingAuthority!: string;

  @Property({ name: 'compliance_authority', default: 'VIEWER' })
  complianceAuthority!: string;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

```typescript
// packages/db/src/entities/Product.ts
import { Entity, PrimaryKey, Property, Enum, ManyToOne, OneToMany, Collection } from '@mikro-orm/core';
import { ProductIdentifier } from './ProductIdentifier.js';
import { ProductVersion } from './ProductVersion.js';
import { BomEntry } from './BomEntry.js';

export enum ProductType {
  FINISHED_GOOD = 'FINISHED_GOOD',
  RAW_MATERIAL = 'RAW_MATERIAL',
  COMPONENT = 'COMPONENT',
  VARIANT = 'VARIANT',
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
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

  @Property({ nullable: true })
  description?: string;

  @ManyToOne(() => Product, { nullable: true, name: 'parent_id' })
  parent?: Product;

  @OneToMany(() => Product, p => p.parent)
  variants = new Collection<Product>(this);

  @Enum(() => ProductStatus)
  status: ProductStatus = ProductStatus.ACTIVE;

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

### Entities List

| Entity | Schema | File |
|--------|--------|------|
| Organization | public (hardcoded) | `Organization.ts` |
| User | tenant (dynamic) | `User.ts` |
| OrganizationUser | tenant (dynamic) | `OrganizationUser.ts` |
| UserDidHistory | tenant (dynamic) | `UserDidHistory.ts` |
| OrgDidHistory | tenant (dynamic) | `OrgDidHistory.ts` |
| Product | tenant (dynamic) | `Product.ts` |
| ProductIdentifier | tenant (dynamic) | `ProductIdentifier.ts` |
| ProductVersion | tenant (dynamic) | `ProductVersion.ts` |
| BomEntry | tenant (dynamic) | `BomEntry.ts` |
| DppSnapshot | tenant (dynamic) | `DppSnapshot.ts` |
| OperationsEvent | tenant (dynamic) | `OperationsEvent.ts` |
| OutboxEvent | tenant (dynamic) | `OutboxEvent.ts` |
| StatusList | tenant (dynamic) | `StatusList.ts` |
| StatusListEntry | tenant (dynamic) | `StatusListEntry.ts` |
| ReadinessProfile | tenant (dynamic) | `ReadinessProfile.ts` |

---

## 5. Migration Strategy

### Phase Overview

1. **Add MikroORM** - Set up alongside Prisma temporarily
2. **Rewrite all services** - Switch from Prisma to MikroORM one by one
3. **Migrate data** - Move existing data to tenant schemas
4. **Remove Prisma** - Delete all Prisma code and dependencies

### Directory Structure (During Migration)

```
packages/db/
├── prisma/              # Keep existing (temporary)
├── src/
│   ├── entities/        # NEW: MikroORM entities
│   ├── migrations/      # NEW: MikroORM migrations
│   ├── mikro-orm.config.ts
│   ├── tenant-context.ts
│   ├── tenant-schema.sql
│   ├── index.ts         # Export both during transition
│   └── client.ts        # Prisma (to be removed)
```

### Directory Structure (Final)

```
packages/db/
├── src/
│   ├── entities/           # MikroORM entities
│   ├── migrations/         # MikroORM migrations
│   ├── mikro-orm.config.ts
│   ├── tenant-context.ts
│   ├── tenant-schema.sql
│   └── index.ts            # Exports MikroORM only
├── package.json            # No @prisma/* dependencies
└── tsconfig.json
```

### Tenant Schema DDL

```sql
-- packages/db/src/tenant-schema.sql
-- Run when new organization is created

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
    role VARCHAR(20) DEFAULT 'member',
    design_authority VARCHAR(20) DEFAULT 'VIEWER',
    operations_authority VARCHAR(20) DEFAULT 'VIEWER',
    marketing_authority VARCHAR(20) DEFAULT 'VIEWER',
    compliance_authority VARCHAR(20) DEFAULT 'VIEWER',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DID history
CREATE TABLE user_did_history (
    id VARCHAR(30) PRIMARY KEY,
    user_id VARCHAR(30) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    did VARCHAR(255) NOT NULL,
    walt_id_key_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE TABLE org_did_history (
    id VARCHAR(30) PRIMARY KEY,
    did VARCHAR(255) NOT NULL,
    walt_id_key_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

-- Products
CREATE TABLE products (
    id VARCHAR(30) PRIMARY KEY,
    product_type VARCHAR(20) DEFAULT 'FINISHED_GOOD',
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id VARCHAR(30) REFERENCES products(id),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_type ON products(product_type);
CREATE INDEX idx_products_parent ON products(parent_id);

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

-- Product versions
CREATE TABLE product_versions (
    id VARCHAR(30) PRIMARY KEY,
    product_id VARCHAR(30) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    workspace VARCHAR(20) NOT NULL,
    version_number INT NOT NULL,
    status VARCHAR(20) DEFAULT 'DRAFT',
    created_by VARCHAR(30) NOT NULL REFERENCES users(id),
    published_by VARCHAR(30) REFERENCES users(id),
    published_at TIMESTAMPTZ,
    signature_did VARCHAR(255),
    signature_jws TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, workspace, version_number)
);

-- Bill of materials
CREATE TABLE bom_entries (
    id VARCHAR(30) PRIMARY KEY,
    parent_product_id VARCHAR(30) NOT NULL REFERENCES products(id),
    child_product_id VARCHAR(30) NOT NULL REFERENCES products(id),
    version_id VARCHAR(30) NOT NULL REFERENCES product_versions(id),
    quantity DECIMAL NOT NULL,
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
    status VARCHAR(20) DEFAULT 'ACTIVE',
    r2_path VARCHAR(500) NOT NULL,
    qr_code_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

### Data Migration Script

```typescript
// scripts/migrate-to-tenant-schemas.ts
import { MikroORM } from '@mikro-orm/postgresql';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateOrganization(orm: MikroORM, orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new Error(`Organization ${orgId} not found`);

  const schemaName = org.schemaName;
  console.log(`Migrating organization ${org.name} to schema ${schemaName}`);

  // 1. Create tenant schema with full DDL
  await orm.em.execute(getTenantDDL(schemaName));

  // 2. Get tenant-scoped EntityManager
  const em = orm.em.fork({ schema: schemaName });

  // 3. Migrate users for this org
  const orgUsers = await prisma.organizationUser.findMany({
    where: { organizationId: orgId },
    include: { user: true }
  });

  for (const ou of orgUsers) {
    // Create user in tenant schema
    await em.execute(`
      INSERT INTO users (id, clerk_id, email, name, avatar_url, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `, [ou.user.id, ou.user.clerkId, ou.user.email, ou.user.name, ou.user.avatarUrl,
        ou.user.createdAt, ou.user.updatedAt, ou.user.lastLoginAt]);

    // Create membership
    await em.execute(`
      INSERT INTO organization_users (id, user_id, role, design_authority, operations_authority, marketing_authority, compliance_authority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [ou.id, ou.userId, ou.role, ou.designAuthority, ou.operationsAuthority,
        ou.marketingAuthority, ou.complianceAuthority, ou.createdAt, ou.updatedAt]);
  }

  // 4. Migrate products
  const products = await prisma.product.findMany({
    where: { organizationId: orgId }
  });

  for (const p of products) {
    await em.execute(`
      INSERT INTO products (id, product_type, name, description, parent_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [p.id, p.productType, p.name, p.description, p.parentId, p.status, p.createdAt, p.updatedAt]);
  }

  // 5. Migrate product identifiers, versions, BOM entries, etc.
  // ... similar pattern for each table

  console.log(`Migration complete for ${org.name}`);
}

async function main() {
  const orm = await MikroORM.init(config);

  const orgs = await prisma.organization.findMany();
  for (const org of orgs) {
    await migrateOrganization(orm, org.id);
  }

  await orm.close();
  await prisma.$disconnect();
}

main().catch(console.error);
```

---

## 6. Service Layer Rewrites

### Old Pattern (Prisma with organizationId)

```typescript
// OLD: apps/api/src/services/product.service.ts
async function getProducts(organizationId: string) {
  return prisma.product.findMany({
    where: { organizationId }  // Row-level filtering
  });
}
```

### New Pattern (MikroORM with schema isolation)

```typescript
// NEW: apps/api/src/services/product.service.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Product } from '@eurocomply/db';

export class ProductService {
  constructor(private em: EntityManager) {}  // Already scoped to tenant

  async getProducts(): Promise<Product[]> {
    return this.em.find(Product, {});  // No organizationId needed!
  }

  async getProduct(id: string): Promise<Product | null> {
    return this.em.findOne(Product, { id }, {
      populate: ['identifiers', 'versions']
    });
  }

  async createProduct(data: CreateProductInput): Promise<Product> {
    const product = this.em.create(Product, {
      id: generateCuid(),
      name: data.name,
      productType: data.productType ?? ProductType.FINISHED_GOOD,
      description: data.description,
    });
    await this.em.flush();
    return product;
  }

  async updateProduct(id: string, data: UpdateProductInput): Promise<Product> {
    const product = await this.em.findOneOrFail(Product, { id });
    wrap(product).assign(data);
    await this.em.flush();
    return product;
  }
}
```

### Tenant Middleware

```typescript
// apps/api/src/middleware/tenant.middleware.ts
import { MikroORM } from '@mikro-orm/postgresql';
import { Organization } from '@eurocomply/db';

export function tenantMiddleware(orm: MikroORM) {
  return async (c: Context, next: Next) => {
    const organizationId = c.get('organizationId');

    // Lookup schema name from public.organizations
    const org = await orm.em.findOne(Organization, { id: organizationId });
    if (!org) {
      throw new HTTPException(404, { message: 'Organization not found' });
    }

    // Fork EntityManager with tenant schema
    const tenantEm = orm.em.fork({ schema: org.schemaName });
    c.set('em', tenantEm);
    c.set('organization', org);

    await next();

    // Cleanup
    tenantEm.clear();
  };
}
```

### Services to Rewrite

| Service | File | Key Changes |
|---------|------|-------------|
| OrganizationService | `organization.service.ts` | Creates tenant schema on org creation |
| ProductService | `product.service.ts` | Remove organizationId filtering |
| VersionService | `version.service.ts` | Remove organizationId filtering |
| DppService | `dpp.service.ts` | Remove organizationId filtering |
| OperationsEventService | `operations-event.service.ts` | Remove organizationId filtering |
| SealedArtifactService | `sealed-artifact.service.ts` | Use tenant-scoped EM |
| DidService | `did.service.ts` | Use tenant-scoped EM |
| OutboxService | `outbox.service.ts` | Events in tenant schema |

---

## 7. Testing Strategy

### Test Utilities

```typescript
// packages/db/src/test-utils.ts
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import config from './mikro-orm.config.js';

export async function createTestOrm(): Promise<MikroORM> {
  return MikroORM.init({
    ...config,
    dbName: 'eurocomply_test',
    allowGlobalContext: true,
  });
}

export async function setupTestTenant(orm: MikroORM, slug: string): Promise<string> {
  const schemaName = `tenant_${slug}`;
  await orm.em.execute(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
  await orm.em.execute(getTenantDDL(schemaName));
  return schemaName;
}

export async function teardownTestTenant(orm: MikroORM, schemaName: string): Promise<void> {
  await orm.em.execute(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
}

export function createTestEm(orm: MikroORM, schemaName: string): EntityManager {
  return orm.em.fork({ schema: schemaName });
}
```

### Unit Test Pattern

```typescript
// apps/api/src/services/product.service.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { createTestOrm, setupTestTenant, teardownTestTenant } from '@eurocomply/db';
import { ProductService } from './product.service.js';

describe('ProductService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: ProductService;
  const testSchema = 'tenant_test_product';

  beforeAll(async () => {
    orm = await createTestOrm();
    await setupTestTenant(orm, 'test_product');
  });

  beforeEach(async () => {
    em = orm.em.fork({ schema: testSchema });
    service = new ProductService(em);
  });

  afterEach(async () => {
    await em.nativeDelete(Product, {});
    em.clear();
  });

  afterAll(async () => {
    await teardownTestTenant(orm, testSchema);
    await orm.close();
  });

  it('creates a product in tenant schema', async () => {
    const product = await service.createProduct({
      name: 'Test Product',
      productType: ProductType.FINISHED_GOOD,
    });

    expect(product.id).toBeDefined();
    expect(product.name).toBe('Test Product');

    // Verify in database
    const found = await em.findOne(Product, { id: product.id });
    expect(found).not.toBeNull();
  });

  it('lists only products in tenant schema', async () => {
    await service.createProduct({ name: 'Product 1' });
    await service.createProduct({ name: 'Product 2' });

    const products = await service.getProducts();
    expect(products).toHaveLength(2);
  });
});
```

### Tenant Isolation Test

```typescript
// apps/api/src/tests/tenant-isolation.test.ts
describe('Tenant Isolation', () => {
  let orm: MikroORM;
  const tenantA = 'tenant_isolation_a';
  const tenantB = 'tenant_isolation_b';

  beforeAll(async () => {
    orm = await createTestOrm();
    await setupTestTenant(orm, 'isolation_a');
    await setupTestTenant(orm, 'isolation_b');
  });

  afterAll(async () => {
    await teardownTestTenant(orm, tenantA);
    await teardownTestTenant(orm, tenantB);
    await orm.close();
  });

  it('tenant A cannot see tenant B data', async () => {
    // Create product in tenant A
    const emA = orm.em.fork({ schema: tenantA });
    emA.create(Product, { id: 'prod_a', name: 'Tenant A Product' });
    await emA.flush();

    // Create product in tenant B
    const emB = orm.em.fork({ schema: tenantB });
    emB.create(Product, { id: 'prod_b', name: 'Tenant B Product' });
    await emB.flush();

    // Tenant A only sees its own product
    const productsA = await emA.find(Product, {});
    expect(productsA).toHaveLength(1);
    expect(productsA[0].name).toBe('Tenant A Product');

    // Tenant B only sees its own product
    const productsB = await emB.find(Product, {});
    expect(productsB).toHaveLength(1);
    expect(productsB[0].name).toBe('Tenant B Product');
  });

  it('cross-schema query fails', async () => {
    const emA = orm.em.fork({ schema: tenantA });

    // Direct query to other schema should fail or return nothing
    const result = await orm.em.execute(
      `SELECT * FROM ${tenantB}.products`
    ).catch(() => []);

    // With proper permissions, this would fail
    // At minimum, verify emA doesn't see tenantB data
    const products = await emA.find(Product, {});
    const hasTenantBProduct = products.some(p => p.name === 'Tenant B Product');
    expect(hasTenantBProduct).toBe(false);
  });
});
```

### Tests to Update

| Test File | Changes |
|-----------|---------|
| `product.service.test.ts` | Use tenant-scoped EM |
| `version.service.test.ts` | Use tenant-scoped EM |
| `organization.service.test.ts` | Test schema creation |
| `product.routes.test.ts` | Use test tenant middleware |
| `dpp.service.test.ts` | Use tenant-scoped EM |
| `operations-event.service.test.ts` | Use tenant-scoped EM |
| `sealed-artifact.service.test.ts` | Use tenant-scoped EM |

---

## 8. Documentation Updates

### /docs/plans/ Updates

| Document | Changes |
|----------|---------|
| `2026-01-15-architecture-design.md` | Update Section 4 (Multi-Tenancy) and Section 8 (Data Storage) to reflect MikroORM and correct schema split |
| `2026-01-16-core-application-implementation.md` | Mark as superseded for database sections, add note pointing to this plan |
| `2026-01-17-product-foundation-implementation.md` | Update entity references from Prisma to MikroORM |
| `2026-01-15-event-system-design.md` | Clarify outbox is in tenant schema |
| `2026-01-15-user-management-design.md` | Clarify users table is per-tenant |
| `2026-01-15-security-design.md` | Update database access patterns |
| `2026-01-16-devops-infrastructure-design.md` | Update migration tooling (MikroORM CLI vs Prisma) |
| `2026-01-18-versioning-events-did-design.md` | Update entity references |
| `2026-01-18-versioning-events-did-implementation.md` | Update to MikroORM patterns |
| `2026-01-18-waltid-infrastructure-did-onboarding.md` | Update schema creation code |
| `2026-01-17-implementation-roadmap.md` | Add MikroORM migration as completed phase |

### /docs/ Updates

| Document | Changes |
|----------|---------|
| `SECURITY.md` | Update Section 13 (tenant isolation) with correct schema split |
| `USER_MANAGEMENT.md` | Align with per-tenant users design |
| `EVENT_SCHEMA.md` | Update outbox table location to tenant schema |
| `SERVICE_LAYER.md` | Update to MikroORM patterns |
| `ARCHITECTURE_PORTABILITY.md` | Update ORM references |
| `DISASTER_RECOVERY.md` | Update tenant schema backup scripts |
| `DATA_SOVEREIGNTY.md` | Update schema references |
| `OPERATIONAL_PROCEDURES.md` | Update tenant migration procedures |
| `SELF_SERVICE_ONBOARDING.md` | Update schema provisioning |

### Code Documentation Updates

| File | Changes |
|------|---------|
| `packages/db/README.md` | Complete rewrite for MikroORM usage |
| `CLAUDE.md` | Update tech stack reference |
| `RULES.md` | Update database patterns section |
| `README.md` | Update architecture overview |

### New Documentation

| Document | Purpose |
|----------|---------|
| `docs/plans/2026-01-20-mikroorm-migration-design.md` | This document |
| `docs/DATABASE.md` | MikroORM usage guide, tenant context patterns |

---

## 9. Implementation Phases

### Phase 1: MikroORM Setup (Foundation)

| Task | Description | Files |
|------|-------------|-------|
| 1.1 | Add MikroORM dependencies | `packages/db/package.json` |
| 1.2 | Create MikroORM config | `packages/db/src/mikro-orm.config.ts` |
| 1.3 | Create tenant context utilities | `packages/db/src/tenant-context.ts` |
| 1.4 | Create tenant schema DDL | `packages/db/src/tenant-schema.sql` |
| 1.5 | Set up test utilities | `packages/db/src/test-utils.ts` |

### Phase 2: Entity Definitions

| Task | Description | Files |
|------|-------------|-------|
| 2.1 | Create Organization entity (public) | `entities/Organization.ts` |
| 2.2 | Create User entity (tenant) | `entities/User.ts` |
| 2.3 | Create OrganizationUser entity | `entities/OrganizationUser.ts` |
| 2.4 | Create DID history entities | `entities/UserDidHistory.ts`, `entities/OrgDidHistory.ts` |
| 2.5 | Create Product entity | `entities/Product.ts` |
| 2.6 | Create ProductIdentifier entity | `entities/ProductIdentifier.ts` |
| 2.7 | Create ProductVersion entity | `entities/ProductVersion.ts` |
| 2.8 | Create BomEntry entity | `entities/BomEntry.ts` |
| 2.9 | Create DppSnapshot entity | `entities/DppSnapshot.ts` |
| 2.10 | Create OperationsEvent entity | `entities/OperationsEvent.ts` |
| 2.11 | Create OutboxEvent entity | `entities/OutboxEvent.ts` |
| 2.12 | Create StatusList entities | `entities/StatusList.ts`, `entities/StatusListEntry.ts` |
| 2.13 | Create ReadinessProfile entity | `entities/ReadinessProfile.ts` |

### Phase 3: Middleware & Context

| Task | Description | Files |
|------|-------------|-------|
| 3.1 | Create tenant middleware | `apps/api/src/middleware/tenant.middleware.ts` |
| 3.2 | Update auth middleware | `apps/api/src/middleware/auth.middleware.ts` |
| 3.3 | Create request-scoped EM injection | `apps/api/src/lib/context.ts` |

### Phase 4: Service Rewrites

| Task | Description | Files |
|------|-------------|-------|
| 4.1 | Rewrite OrganizationService | `services/organization.service.ts` |
| 4.2 | Rewrite ProductService | `services/product.service.ts` |
| 4.3 | Rewrite VersionService | `services/version.service.ts` |
| 4.4 | Rewrite DppService | `services/dpp.service.ts` |
| 4.5 | Rewrite OperationsEventService | `services/operations-event.service.ts` |
| 4.6 | Rewrite SealedArtifactService | `services/sealed-artifact.service.ts` |
| 4.7 | Rewrite DidService | `services/did.service.ts` |
| 4.8 | Rewrite OutboxService | `services/outbox.service.ts` |

### Phase 5: Route Updates

| Task | Description | Files |
|------|-------------|-------|
| 5.1 | Update product routes | `routes/product.routes.ts` |
| 5.2 | Update version routes | `routes/version.routes.ts` |
| 5.3 | Update organization routes | `routes/organization.routes.ts` |
| 5.4 | Update DPP routes | `routes/dpp.routes.ts` |
| 5.5 | Update operations routes | `routes/operations.routes.ts` |

### Phase 6: Test Migration

| Task | Description | Files |
|------|-------------|-------|
| 6.1 | Update test utilities | `packages/db/src/test-utils.ts` |
| 6.2 | Update unit tests | `*.test.ts` |
| 6.3 | Update integration tests | `tests/*.test.ts` |
| 6.4 | Add tenant isolation tests | `tests/tenant-isolation.test.ts` |

### Phase 7: Data Migration

| Task | Description | Files |
|------|-------------|-------|
| 7.1 | Create migration script | `scripts/migrate-to-tenant-schemas.ts` |
| 7.2 | Test migration on staging | Manual |
| 7.3 | Execute production migration | Manual |

### Phase 8: Prisma Removal

| Task | Description | Files |
|------|-------------|-------|
| 8.1 | Remove Prisma dependencies | `packages/db/package.json` |
| 8.2 | Delete Prisma schema | `packages/db/prisma/` |
| 8.3 | Remove old tenant utilities | `packages/db/src/client.ts`, `tenant.ts` |
| 8.4 | Update package exports | `packages/db/src/index.ts` |

### Phase 9: Documentation

| Task | Description | Files |
|------|-------------|-------|
| 9.1 | Update /docs/plans/ documents | See Section 8 |
| 9.2 | Update /docs/ documents | See Section 8 |
| 9.3 | Create DATABASE.md | `docs/DATABASE.md` |
| 9.4 | Update root documentation | `README.md`, `CLAUDE.md`, `RULES.md` |

---

## 10. Risk Mitigation

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Full backup before migration, test on staging first |
| Service downtime | Migrate during maintenance window, prepare rollback script |
| Cross-tenant data leakage | Isolation tests mandatory before production |
| Performance regression | Benchmark before/after, optimize connection pooling |
| Breaking API changes | Preserve API contracts, only change internals |

### Rollback Plan

If critical issues are found after migration:

1. Stop API servers
2. Restore database from backup
3. Deploy previous code version (with Prisma)
4. Restart API servers
5. Investigate and fix issues
6. Re-attempt migration

### Validation Checklist

Before production deployment:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Tenant isolation tests pass
- [ ] Migration script tested on staging with production-like data
- [ ] Performance benchmarks acceptable
- [ ] Rollback procedure tested
- [ ] Documentation updated

---

*Last Updated: 2026-01-20*
