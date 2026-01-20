# MikroORM Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Prisma with MikroORM to implement true schema-per-tenant database isolation.

**Architecture:** MikroORM with dynamic schema switching via `em.fork({ schema })`. Public schema contains only `organizations` table. All tenant data (users, products, versions, events) lives in `tenant_{slug}` schemas. No `organizationId` column filtering - schema isolation enforces security.

**Tech Stack:** TypeScript, MikroORM 6, PostgreSQL, Hono, Vitest

**Design Document:** See `docs/plans/2026-01-20-mikroorm-migration-design.md` for full architecture details.

---

## Phase 1: MikroORM Setup (Foundation)

### Task 1.1: Add MikroORM Dependencies

**Files:**
- Modify: `packages/db/package.json`

**Step 1: Add MikroORM packages**

```bash
cd /root/Documents/EuroComply/.worktrees/mikroorm-migration/packages/db
pnpm add @mikro-orm/core @mikro-orm/postgresql @mikro-orm/migrations @mikro-orm/cli
pnpm add -D @mikro-orm/reflection
```

**Step 2: Verify installation**

Run: `pnpm list @mikro-orm/core`
Expected: Shows @mikro-orm/core version installed

**Step 3: Commit**

```bash
git add packages/db/package.json pnpm-lock.yaml
git commit -m "feat(db): add MikroORM dependencies"
```

---

### Task 1.2: Create MikroORM Configuration

**Files:**
- Create: `packages/db/src/mikro-orm.config.ts`

**Step 1: Create the configuration file**

Create `packages/db/src/mikro-orm.config.ts`:

```typescript
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';

export default defineConfig({
  driver: PostgreSqlDriver,
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  dbName: process.env.DATABASE_NAME || 'eurocomply',
  schema: 'public',
  entities: ['./dist/entities/**/*.js'],
  entitiesTs: ['./src/entities/**/*.ts'],
  metadataProvider: TsMorphMetadataProvider,
  debug: process.env.NODE_ENV === 'development',
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
  },
  // Allow global context for simpler testing
  allowGlobalContext: process.env.NODE_ENV === 'test',
});
```

**Step 2: Commit**

```bash
git add packages/db/src/mikro-orm.config.ts
git commit -m "feat(db): add MikroORM configuration"
```

---

### Task 1.3: Create Tenant Context Utilities

**Files:**
- Create: `packages/db/src/tenant-context.ts`
- Create: `packages/db/src/tenant-context.test.ts`

**Step 1: Write the test file**

Create `packages/db/src/tenant-context.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateSchemaName, formatSchemaName } from './tenant-context.js';

describe('tenant-context', () => {
  describe('validateSchemaName', () => {
    it('accepts valid schema names', () => {
      expect(validateSchemaName('tenant_abc123')).toBe(true);
      expect(validateSchemaName('tenant_my_org')).toBe(true);
      expect(validateSchemaName('tenant_test123')).toBe(true);
    });

    it('rejects invalid schema names', () => {
      expect(validateSchemaName('abc123')).toBe(false); // missing prefix
      expect(validateSchemaName('tenant_')).toBe(false); // empty slug
      expect(validateSchemaName('tenant_ab')).toBe(false); // too short
      expect(validateSchemaName("tenant_abc'; DROP TABLE--")).toBe(false); // injection
      expect(validateSchemaName('tenant_ABC')).toBe(false); // uppercase
      expect(validateSchemaName('public')).toBe(false); // reserved
    });
  });

  describe('formatSchemaName', () => {
    it('formats organization slug to schema name', () => {
      expect(formatSchemaName('myorg')).toBe('tenant_myorg');
      expect(formatSchemaName('my-org-123')).toBe('tenant_my_org_123');
      expect(formatSchemaName('MyOrg')).toBe('tenant_myorg');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/db && pnpm test -- tenant-context.test.ts`
Expected: FAIL with "cannot find module"

**Step 3: Write the implementation**

Create `packages/db/src/tenant-context.ts`:

```typescript
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';

/**
 * Validates a schema name to prevent SQL injection and ensure format.
 * Schema names must be: tenant_{slug} where slug is 3+ lowercase alphanumeric/underscore chars.
 */
export function validateSchemaName(schemaName: string): boolean {
  // Must start with tenant_ prefix
  if (!schemaName.startsWith('tenant_')) {
    return false;
  }

  // Reserved names
  if (['public', 'pg_catalog', 'information_schema'].includes(schemaName)) {
    return false;
  }

  // Extract slug and validate
  const slug = schemaName.slice(7); // Remove 'tenant_'
  if (slug.length < 3) {
    return false;
  }

  // Only lowercase alphanumeric and underscore
  const validPattern = /^[a-z0-9_]+$/;
  return validPattern.test(slug);
}

/**
 * Formats an organization slug into a valid schema name.
 */
export function formatSchemaName(orgSlug: string): string {
  const normalized = orgSlug
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return `tenant_${normalized}`;
}

/**
 * Creates an EntityManager scoped to a specific tenant schema.
 */
export function createTenantEm(orm: MikroORM, schemaName: string): EntityManager {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }
  return orm.em.fork({ schema: schemaName });
}

/**
 * Executes a callback with a tenant-scoped EntityManager.
 * Automatically clears the EntityManager after execution.
 */
export async function withTenantContext<T>(
  orm: MikroORM,
  schemaName: string,
  callback: (em: EntityManager) => Promise<T>
): Promise<T> {
  const em = createTenantEm(orm, schemaName);
  try {
    return await callback(em);
  } finally {
    em.clear();
  }
}

/**
 * Creates a new tenant schema with all required tables.
 */
export async function createTenantSchema(
  orm: MikroORM,
  schemaName: string
): Promise<void> {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }

  // Schema DDL will be loaded from tenant-schema.sql
  const ddl = getTenantSchemaDDL(schemaName);
  await orm.em.execute(ddl);
}

/**
 * Drops a tenant schema. Use with extreme caution!
 */
export async function dropTenantSchema(
  orm: MikroORM,
  schemaName: string
): Promise<void> {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }
  await orm.em.execute(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
}

/**
 * Returns the DDL for creating a tenant schema.
 * This is a placeholder - will be populated in Task 1.4.
 */
export function getTenantSchemaDDL(schemaName: string): string {
  return `
    CREATE SCHEMA IF NOT EXISTS "${schemaName}";
    SET search_path = "${schemaName}";
    -- Tables will be added in Task 1.4
  `;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/db && pnpm test -- tenant-context.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add packages/db/src/tenant-context.ts packages/db/src/tenant-context.test.ts
git commit -m "feat(db): add tenant context utilities with schema validation"
```

---

### Task 1.4: Create Tenant Schema DDL

**Files:**
- Create: `packages/db/src/tenant-schema.sql`
- Modify: `packages/db/src/tenant-context.ts`

**Step 1: Create the DDL file**

Create `packages/db/src/tenant-schema.sql`:

```sql
-- Tenant Schema DDL
-- This file contains the complete DDL for creating a tenant schema.
-- Schema name is substituted at runtime via ${schemaName}.

CREATE SCHEMA IF NOT EXISTS "${schemaName}";
SET search_path = "${schemaName}";

-- Users (synced from Clerk)
CREATE TABLE users (
    id VARCHAR(30) PRIMARY KEY,
    clerk_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- Organization membership and workspace authorities
CREATE TABLE organization_users (
    id VARCHAR(30) PRIMARY KEY,
    user_id VARCHAR(30) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    design_authority VARCHAR(20) NOT NULL DEFAULT 'VIEWER',
    operations_authority VARCHAR(20) NOT NULL DEFAULT 'VIEWER',
    marketing_authority VARCHAR(20) NOT NULL DEFAULT 'VIEWER',
    compliance_authority VARCHAR(20) NOT NULL DEFAULT 'VIEWER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User DID history for key rotation tracking
CREATE TABLE user_did_history (
    id VARCHAR(30) PRIMARY KEY,
    user_id VARCHAR(30) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    did VARCHAR(255) NOT NULL,
    walt_id_key_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_user_did_history_user ON user_did_history(user_id);

-- Organization DID history
CREATE TABLE org_did_history (
    id VARCHAR(30) PRIMARY KEY,
    did VARCHAR(255) NOT NULL,
    walt_id_key_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

-- Products (the hub entity)
CREATE TABLE products (
    id VARCHAR(30) PRIMARY KEY,
    product_type VARCHAR(20) NOT NULL DEFAULT 'FINISHED_GOOD',
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id VARCHAR(30) REFERENCES products(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_type ON products(product_type);
CREATE INDEX idx_products_parent ON products(parent_id);
CREATE INDEX idx_products_status ON products(status);

-- Product identifiers (GTIN, SKU, Internal)
CREATE TABLE product_identifiers (
    id VARCHAR(30) PRIMARY KEY,
    product_id VARCHAR(30) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    value VARCHAR(255) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, type)
);

CREATE INDEX idx_product_identifiers_value ON product_identifiers(value);

-- Product versions (per-workspace versioning)
CREATE TABLE product_versions (
    id VARCHAR(30) PRIMARY KEY,
    product_id VARCHAR(30) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    workspace VARCHAR(20) NOT NULL,
    version_number INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_by VARCHAR(30) NOT NULL REFERENCES users(id),
    published_by VARCHAR(30) REFERENCES users(id),
    published_at TIMESTAMPTZ,
    signature_did VARCHAR(255),
    signature_jws TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, workspace, version_number)
);

CREATE INDEX idx_product_versions_product ON product_versions(product_id);
CREATE INDEX idx_product_versions_status ON product_versions(status);

-- Bill of materials
CREATE TABLE bom_entries (
    id VARCHAR(30) PRIMARY KEY,
    parent_product_id VARCHAR(30) NOT NULL REFERENCES products(id),
    child_product_id VARCHAR(30) NOT NULL REFERENCES products(id),
    version_id VARCHAR(30) NOT NULL REFERENCES product_versions(id),
    quantity DECIMAL NOT NULL,
    unit VARCHAR(20) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(parent_product_id, child_product_id, version_id),
    CHECK(parent_product_id != child_product_id)
);

CREATE INDEX idx_bom_entries_parent ON bom_entries(parent_product_id);
CREATE INDEX idx_bom_entries_version ON bom_entries(version_id);

-- DPP snapshots
CREATE TABLE dpp_snapshots (
    id VARCHAR(30) PRIMARY KEY,
    product_id VARCHAR(30) NOT NULL REFERENCES products(id),
    design_version_id VARCHAR(30) NOT NULL REFERENCES product_versions(id),
    marketing_version_id VARCHAR(30) REFERENCES product_versions(id),
    credential_hash VARCHAR(64) NOT NULL UNIQUE,
    issuer_did VARCHAR(255) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    r2_path VARCHAR(500) NOT NULL,
    qr_code_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dpp_snapshots_product ON dpp_snapshots(product_id);
CREATE INDEX idx_dpp_snapshots_status ON dpp_snapshots(status);

-- Operations events (forensic ledger with hash chain)
CREATE TABLE operations_events (
    id VARCHAR(30) PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    previous_hash VARCHAR(64),
    hash VARCHAR(64) NOT NULL,
    actor_did VARCHAR(255) NOT NULL,
    signature_jws TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operations_events_type ON operations_events(event_type);
CREATE INDEX idx_operations_events_hash ON operations_events(hash);
CREATE INDEX idx_operations_events_created ON operations_events(created_at);

-- Outbox events (transactional outbox pattern)
CREATE TABLE outbox_events (
    id VARCHAR(30) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id VARCHAR(30) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON outbox_events(created_at) WHERE status = 'PENDING';
CREATE INDEX idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);

-- Status lists (revocation registry)
CREATE TABLE status_lists (
    id VARCHAR(30) PRIMARY KEY,
    purpose VARCHAR(20) NOT NULL,
    encoded_list TEXT NOT NULL,
    current_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Status list entries
CREATE TABLE status_list_entries (
    id VARCHAR(30) PRIMARY KEY,
    status_list_id VARCHAR(30) NOT NULL REFERENCES status_lists(id),
    credential_id VARCHAR(30) NOT NULL,
    index INT NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT false,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_list_entries_list ON status_list_entries(status_list_id);
CREATE INDEX idx_status_list_entries_credential ON status_list_entries(credential_id);

-- Readiness profiles (compliance templates)
CREATE TABLE readiness_profiles (
    id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    regulation VARCHAR(50) NOT NULL,
    product_category VARCHAR(100),
    requirements JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
```

**Step 2: Update tenant-context.ts to load the DDL**

Modify `packages/db/src/tenant-context.ts` - replace the `getTenantSchemaDDL` function:

```typescript
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Returns the DDL for creating a tenant schema.
 */
export function getTenantSchemaDDL(schemaName: string): string {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }

  const ddlPath = join(__dirname, 'tenant-schema.sql');
  const ddlTemplate = readFileSync(ddlPath, 'utf-8');

  // Replace all ${schemaName} placeholders
  return ddlTemplate.replace(/\$\{schemaName\}/g, schemaName);
}
```

**Step 3: Add fs imports at the top of tenant-context.ts**

The full updated file should have imports:

```typescript
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ... rest of the file
```

**Step 4: Run existing tests**

Run: `cd packages/db && pnpm test -- tenant-context.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/db/src/tenant-schema.sql packages/db/src/tenant-context.ts
git commit -m "feat(db): add complete tenant schema DDL"
```

---

### Task 1.5: Create Test Utilities

**Files:**
- Create: `packages/db/src/test-utils.ts`
- Create: `packages/db/src/test-utils.test.ts`

**Step 1: Write the test file**

Create `packages/db/src/test-utils.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import {
  createTestOrm,
  setupTestTenant,
  teardownTestTenant,
  generateTestId,
} from './test-utils.js';

describe('test-utils', () => {
  describe('generateTestId', () => {
    it('generates unique IDs with test prefix', () => {
      const id1 = generateTestId();
      const id2 = generateTestId();

      expect(id1).toMatch(/^test_/);
      expect(id2).toMatch(/^test_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createTestOrm', () => {
    it('creates an ORM instance for testing', async () => {
      const orm = await createTestOrm();
      expect(orm).toBeDefined();
      expect(orm.em).toBeDefined();
      await orm.close();
    });
  });

  describe('setupTestTenant / teardownTestTenant', () => {
    let orm: MikroORM;

    beforeAll(async () => {
      orm = await createTestOrm();
    });

    afterAll(async () => {
      await orm.close();
    });

    it('creates and drops a tenant schema', async () => {
      const schemaName = await setupTestTenant(orm, 'testutils');
      expect(schemaName).toBe('tenant_testutils');

      // Verify schema exists
      const result = await orm.em.execute(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name = '${schemaName}'
      `);
      expect(result.length).toBe(1);

      // Cleanup
      await teardownTestTenant(orm, schemaName);

      // Verify schema is gone
      const afterResult = await orm.em.execute(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name = '${schemaName}'
      `);
      expect(afterResult.length).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/db && pnpm test -- test-utils.test.ts`
Expected: FAIL with "cannot find module"

**Step 3: Write the implementation**

Create `packages/db/src/test-utils.ts`:

```typescript
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import config from './mikro-orm.config.js';
import {
  createTenantSchema,
  dropTenantSchema,
  formatSchemaName,
  createTenantEm,
} from './tenant-context.js';

/**
 * Generates a unique test ID with prefix.
 */
export function generateTestId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Creates a MikroORM instance configured for testing.
 */
export async function createTestOrm(): Promise<MikroORM> {
  return MikroORM.init({
    ...config,
    dbName: process.env.TEST_DATABASE_NAME || 'eurocomply_test',
    allowGlobalContext: true,
    // Disable debug logging in tests unless explicitly enabled
    debug: process.env.DEBUG_ORM === 'true',
  });
}

/**
 * Creates a tenant schema for testing.
 * Returns the schema name.
 */
export async function setupTestTenant(
  orm: MikroORM,
  testSlug: string
): Promise<string> {
  const schemaName = formatSchemaName(testSlug);

  // Drop if exists (cleanup from previous failed test)
  await dropTenantSchema(orm, schemaName).catch(() => {});

  // Create fresh schema
  await createTenantSchema(orm, schemaName);

  return schemaName;
}

/**
 * Drops a tenant schema after testing.
 */
export async function teardownTestTenant(
  orm: MikroORM,
  schemaName: string
): Promise<void> {
  await dropTenantSchema(orm, schemaName);
}

/**
 * Creates a tenant-scoped EntityManager for testing.
 */
export function createTestEm(orm: MikroORM, schemaName: string): EntityManager {
  return createTenantEm(orm, schemaName);
}

/**
 * Helper to clean all data from a tenant schema without dropping it.
 */
export async function cleanTenantData(em: EntityManager): Promise<void> {
  // Delete in reverse dependency order
  await em.execute('DELETE FROM audit_log');
  await em.execute('DELETE FROM status_list_entries');
  await em.execute('DELETE FROM status_lists');
  await em.execute('DELETE FROM outbox_events');
  await em.execute('DELETE FROM operations_events');
  await em.execute('DELETE FROM dpp_snapshots');
  await em.execute('DELETE FROM bom_entries');
  await em.execute('DELETE FROM product_versions');
  await em.execute('DELETE FROM product_identifiers');
  await em.execute('DELETE FROM products');
  await em.execute('DELETE FROM org_did_history');
  await em.execute('DELETE FROM user_did_history');
  await em.execute('DELETE FROM organization_users');
  await em.execute('DELETE FROM users');
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/db && pnpm test -- test-utils.test.ts`
Expected: PASS

Note: This test requires a running PostgreSQL database. If tests fail due to connection issues, ensure the test database exists.

**Step 5: Commit**

```bash
git add packages/db/src/test-utils.ts packages/db/src/test-utils.test.ts
git commit -m "feat(db): add test utilities for tenant schema testing"
```

---

## Phase 2: Entity Definitions

### Task 2.1: Create Organization Entity (Public Schema)

**Files:**
- Create: `packages/db/src/entities/Organization.ts`
- Create: `packages/db/src/entities/index.ts`

**Step 1: Create entities directory**

```bash
mkdir -p packages/db/src/entities
```

**Step 2: Create the Organization entity**

Create `packages/db/src/entities/Organization.ts`:

```typescript
import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'organizations', schema: 'public' })
export class Organization {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 255 })
  name!: string;

  @Property({ type: 'varchar', length: 100 })
  @Unique()
  slug!: string;

  @Property({ type: 'varchar', length: 100, fieldName: 'schema_name' })
  @Unique()
  schemaName!: string;

  @Property({ type: 'varchar', length: 255, fieldName: 'stripe_customer_id', nullable: true })
  stripeCustomerId?: string;

  @Property({ type: 'varchar', length: 50, fieldName: 'subscription_tier', default: 'starter' })
  subscriptionTier: string = 'starter';

  @Property({ type: 'varchar', length: 50, fieldName: 'subscription_status', default: 'active' })
  subscriptionStatus: string = 'active';

  @Property({ type: 'int', fieldName: 'user_limit', default: 20 })
  userLimit: number = 20;

  @Property({ type: 'bigint', fieldName: 'storage_limit', default: '536870912000' })
  storageLimit: string = '536870912000'; // 500GB in bytes

  @Property({ type: 'varchar', length: 255, nullable: true })
  did?: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**Step 3: Create the entities index**

Create `packages/db/src/entities/index.ts`:

```typescript
export { Organization } from './Organization.js';
```

**Step 4: Commit**

```bash
git add packages/db/src/entities/
git commit -m "feat(db): add Organization entity for public schema"
```

---

### Task 2.2: Create User Entity (Tenant Schema)

**Files:**
- Create: `packages/db/src/entities/User.ts`
- Modify: `packages/db/src/entities/index.ts`

**Step 1: Create the User entity**

Create `packages/db/src/entities/User.ts`:

```typescript
import { Entity, PrimaryKey, Property, Unique, OneToMany, Collection } from '@mikro-orm/core';
import type { OrganizationUser } from './OrganizationUser.js';

@Entity({ tableName: 'users' })
export class User {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 255, fieldName: 'clerk_id' })
  @Unique()
  clerkId!: string;

  @Property({ type: 'varchar', length: 255 })
  @Unique()
  email!: string;

  @Property({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @Property({ type: 'text', fieldName: 'avatar_url', nullable: true })
  avatarUrl?: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'last_login_at', nullable: true })
  lastLoginAt?: Date;

  @OneToMany('OrganizationUser', 'user')
  memberships = new Collection<OrganizationUser>(this);
}
```

**Step 2: Update entities index**

Modify `packages/db/src/entities/index.ts`:

```typescript
export { Organization } from './Organization.js';
export { User } from './User.js';
```

**Step 3: Commit**

```bash
git add packages/db/src/entities/User.ts packages/db/src/entities/index.ts
git commit -m "feat(db): add User entity for tenant schema"
```

---

### Task 2.3: Create OrganizationUser Entity (Tenant Schema)

**Files:**
- Create: `packages/db/src/entities/OrganizationUser.ts`
- Modify: `packages/db/src/entities/index.ts`

**Step 1: Create the OrganizationUser entity**

Create `packages/db/src/entities/OrganizationUser.ts`:

```typescript
import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { User } from './User.js';

@Entity({ tableName: 'organization_users' })
export class OrganizationUser {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @ManyToOne(() => User, { fieldName: 'user_id' })
  user!: User;

  @Property({ type: 'varchar', length: 20, default: 'member' })
  role: string = 'member';

  @Property({ type: 'varchar', length: 20, fieldName: 'design_authority', default: 'VIEWER' })
  designAuthority: string = 'VIEWER';

  @Property({ type: 'varchar', length: 20, fieldName: 'operations_authority', default: 'VIEWER' })
  operationsAuthority: string = 'VIEWER';

  @Property({ type: 'varchar', length: 20, fieldName: 'marketing_authority', default: 'VIEWER' })
  marketingAuthority: string = 'VIEWER';

  @Property({ type: 'varchar', length: 20, fieldName: 'compliance_authority', default: 'VIEWER' })
  complianceAuthority: string = 'VIEWER';

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**Step 2: Update entities index**

Modify `packages/db/src/entities/index.ts`:

```typescript
export { Organization } from './Organization.js';
export { User } from './User.js';
export { OrganizationUser } from './OrganizationUser.js';
```

**Step 3: Commit**

```bash
git add packages/db/src/entities/OrganizationUser.ts packages/db/src/entities/index.ts
git commit -m "feat(db): add OrganizationUser entity for tenant schema"
```

---

### Task 2.4: Create DID History Entities (Tenant Schema)

**Files:**
- Create: `packages/db/src/entities/UserDidHistory.ts`
- Create: `packages/db/src/entities/OrgDidHistory.ts`
- Modify: `packages/db/src/entities/index.ts`

**Step 1: Create UserDidHistory entity**

Create `packages/db/src/entities/UserDidHistory.ts`:

```typescript
import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { User } from './User.js';

@Entity({ tableName: 'user_did_history' })
export class UserDidHistory {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @ManyToOne(() => User, { fieldName: 'user_id' })
  @Index()
  user!: User;

  @Property({ type: 'varchar', length: 255 })
  did!: string;

  @Property({ type: 'varchar', length: 255, fieldName: 'walt_id_key_id' })
  waltIdKeyId!: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'revoked_at', nullable: true })
  revokedAt?: Date;
}
```

**Step 2: Create OrgDidHistory entity**

Create `packages/db/src/entities/OrgDidHistory.ts`:

```typescript
import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'org_did_history' })
export class OrgDidHistory {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 255 })
  did!: string;

  @Property({ type: 'varchar', length: 255, fieldName: 'walt_id_key_id' })
  waltIdKeyId!: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'revoked_at', nullable: true })
  revokedAt?: Date;
}
```

**Step 3: Update entities index**

Modify `packages/db/src/entities/index.ts`:

```typescript
export { Organization } from './Organization.js';
export { User } from './User.js';
export { OrganizationUser } from './OrganizationUser.js';
export { UserDidHistory } from './UserDidHistory.js';
export { OrgDidHistory } from './OrgDidHistory.js';
```

**Step 4: Commit**

```bash
git add packages/db/src/entities/UserDidHistory.ts packages/db/src/entities/OrgDidHistory.ts packages/db/src/entities/index.ts
git commit -m "feat(db): add DID history entities for tenant schema"
```

---

### Task 2.5: Create Product Entity (Tenant Schema)

**Files:**
- Create: `packages/db/src/entities/Product.ts`
- Modify: `packages/db/src/entities/index.ts`

**Step 1: Create the Product entity**

Create `packages/db/src/entities/Product.ts`:

```typescript
import {
  Entity,
  PrimaryKey,
  Property,
  Enum,
  ManyToOne,
  OneToMany,
  Collection,
  Index,
} from '@mikro-orm/core';

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
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Enum({ items: () => ProductType, fieldName: 'product_type', default: ProductType.FINISHED_GOOD })
  @Index()
  productType: ProductType = ProductType.FINISHED_GOOD;

  @Property({ type: 'varchar', length: 255 })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @ManyToOne(() => Product, { fieldName: 'parent_id', nullable: true })
  @Index()
  parent?: Product;

  @OneToMany(() => Product, (p) => p.parent)
  variants = new Collection<Product>(this);

  @Enum({ items: () => ProductStatus, default: ProductStatus.ACTIVE })
  @Index()
  status: ProductStatus = ProductStatus.ACTIVE;

  @OneToMany('ProductIdentifier', 'product')
  identifiers = new Collection<any>(this);

  @OneToMany('ProductVersion', 'product')
  versions = new Collection<any>(this);

  @OneToMany('BomEntry', 'parentProduct')
  bomEntriesAsParent = new Collection<any>(this);

  @OneToMany('BomEntry', 'childProduct')
  bomEntriesAsChild = new Collection<any>(this);

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**Step 2: Update entities index**

Modify `packages/db/src/entities/index.ts`:

```typescript
export { Organization } from './Organization.js';
export { User } from './User.js';
export { OrganizationUser } from './OrganizationUser.js';
export { UserDidHistory } from './UserDidHistory.js';
export { OrgDidHistory } from './OrgDidHistory.js';
export { Product, ProductType, ProductStatus } from './Product.js';
```

**Step 3: Commit**

```bash
git add packages/db/src/entities/Product.ts packages/db/src/entities/index.ts
git commit -m "feat(db): add Product entity for tenant schema"
```

---

### Task 2.6: Create ProductIdentifier Entity (Tenant Schema)

**Files:**
- Create: `packages/db/src/entities/ProductIdentifier.ts`
- Modify: `packages/db/src/entities/index.ts`

**Step 1: Create the ProductIdentifier entity**

Create `packages/db/src/entities/ProductIdentifier.ts`:

```typescript
import { Entity, PrimaryKey, Property, ManyToOne, Unique, Index, Enum } from '@mikro-orm/core';
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
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @ManyToOne(() => Product, { fieldName: 'product_id' })
  product!: Product;

  @Enum({ items: () => IdentifierType })
  type!: IdentifierType;

  @Property({ type: 'varchar', length: 255 })
  @Index()
  value!: string;

  @Property({ type: 'boolean', fieldName: 'is_primary', default: false })
  isPrimary: boolean = false;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();
}
```

**Step 2: Update entities index**

Modify `packages/db/src/entities/index.ts`:

```typescript
export { Organization } from './Organization.js';
export { User } from './User.js';
export { OrganizationUser } from './OrganizationUser.js';
export { UserDidHistory } from './UserDidHistory.js';
export { OrgDidHistory } from './OrgDidHistory.js';
export { Product, ProductType, ProductStatus } from './Product.js';
export { ProductIdentifier, IdentifierType } from './ProductIdentifier.js';
```

**Step 3: Commit**

```bash
git add packages/db/src/entities/ProductIdentifier.ts packages/db/src/entities/index.ts
git commit -m "feat(db): add ProductIdentifier entity for tenant schema"
```

---

### Task 2.7-2.13: Create Remaining Entities

Due to the length of this plan, the remaining entities follow the same pattern:

**Task 2.7: ProductVersion** - workspace versioning with status enum
**Task 2.8: BomEntry** - bill of materials with parent/child product relations
**Task 2.9: DppSnapshot** - DPP credential snapshots
**Task 2.10: OperationsEvent** - forensic ledger with hash chain
**Task 2.11: OutboxEvent** - transactional outbox
**Task 2.12: StatusList + StatusListEntry** - revocation registry
**Task 2.13: ReadinessProfile** - compliance templates

Each follows the pattern:
1. Create entity file with MikroORM decorators
2. Export from `entities/index.ts`
3. Commit with descriptive message

---

## Phase 3-9: Remaining Phases

The remaining phases are documented in the design document at `docs/plans/2026-01-20-mikroorm-migration-design.md`:

- **Phase 3:** Middleware & Context
- **Phase 4:** Service Rewrites
- **Phase 5:** Route Updates
- **Phase 6:** Test Migration
- **Phase 7:** Data Migration
- **Phase 8:** Prisma Removal
- **Phase 9:** Documentation

Each phase follows the same TDD pattern with:
1. Write failing test
2. Verify test fails
3. Write implementation
4. Verify test passes
5. Commit

---

## Execution Checkpoint

After completing Phase 2, pause for code review before proceeding to Phase 3.

**Review checklist:**
- [ ] All entities compile without TypeScript errors
- [ ] Entity tests pass
- [ ] Database schema matches entity definitions
- [ ] No Prisma imports in new code

---

*Last Updated: 2026-01-20*
