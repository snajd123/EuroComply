# Phase 1: Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the agnostic core foundation with multi-tenancy, taxonomy skeleton, and a vertical slice through Organization → Product → ProductVersion.

**Architecture:** Schema-per-tenant PostgreSQL with MikroORM. Public schema holds organizations and global config; tenant schemas (`tenant_{slug}`) hold all business data. JWT-based tenant context extraction with no DB lookup per request. LTREE for hierarchical categories with additive inheritance.

**Tech Stack:** TypeScript, Hono (API), MikroORM, PostgreSQL (LTREE extension), Vitest, CUID2, Zod, AWS KMS

---

## Prerequisites

Before starting, ensure:
- Node.js 20+ installed
- PostgreSQL 15+ with LTREE extension available
- pnpm installed globally (`npm install -g pnpm`)
- AWS credentials configured (for KMS in later tasks)

---

## Task 1: Initialize Monorepo Structure

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`

**Step 1: Create root package.json**

```json
{
  "name": "eurocomply",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "dev": "turbo run dev"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
```

**Step 5: Create apps/api/package.json**

```json
{
  "name": "@eurocomply/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@eurocomply/core": "workspace:*",
    "@eurocomply/database": "workspace:*",
    "@hono/node-server": "^1.13.0",
    "hono": "^4.6.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**Step 6: Create apps/api/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 7: Create packages/core/package.json**

```json
{
  "name": "@eurocomply/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@paralleldrive/cuid2": "^2.2.2",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**Step 8: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 9: Create packages/database/package.json**

```json
{
  "name": "@eurocomply/database",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./entities": {
      "import": "./dist/entities/index.js",
      "types": "./dist/entities/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@eurocomply/core": "workspace:*",
    "@mikro-orm/core": "^6.4.0",
    "@mikro-orm/postgresql": "^6.4.0",
    "@mikro-orm/migrations": "^6.4.0"
  },
  "devDependencies": {
    "@mikro-orm/cli": "^6.4.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**Step 10: Create packages/database/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 11: Install dependencies**

Run: `pnpm install`
Expected: Dependencies installed, lockfile created

**Step 12: Commit**

```bash
git add -A
git commit -m "chore: initialize monorepo structure with turbo, pnpm workspaces"
```

---

## Task 2: CUID2 ID Generator

**Files:**
- Create: `packages/core/src/id.ts`
- Create: `packages/core/src/id.test.ts`
- Create: `packages/core/src/index.ts`

**Step 1: Write the failing test**

Create `packages/core/src/id.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createId, isCuid } from './id.js';

describe('id', () => {
  describe('createId', () => {
    it('generates a valid CUID2', () => {
      const id = createId();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThanOrEqual(21);
      expect(id.length).toBeLessThanOrEqual(24);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(createId());
      }
      expect(ids.size).toBe(1000);
    });
  });

  describe('isCuid', () => {
    it('returns true for valid CUID2', () => {
      const id = createId();
      expect(isCuid(id)).toBe(true);
    });

    it('returns false for invalid strings', () => {
      expect(isCuid('')).toBe(false);
      expect(isCuid('123')).toBe(false);
      expect(isCuid('not-a-cuid')).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test`
Expected: FAIL with "Cannot find module './id.js'"

**Step 3: Write minimal implementation**

Create `packages/core/src/id.ts`:

```typescript
import { createId as cuid2CreateId, isCuid as cuid2IsCuid } from '@paralleldrive/cuid2';

/**
 * Generates a new CUID2 identifier.
 * CUID2 is collision-resistant and sortable.
 */
export function createId(): string {
  return cuid2CreateId();
}

/**
 * Validates if a string is a valid CUID2.
 */
export function isCuid(id: string): boolean {
  return cuid2IsCuid(id);
}
```

Create `packages/core/src/index.ts`:

```typescript
export { createId, isCuid } from './id.js';
```

**Step 4: Create vitest config**

Create `packages/core/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

**Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/core/
git commit -m "feat(core): add CUID2 ID generator"
```

---

## Task 3: Organization Entity (Public Schema)

**Files:**
- Create: `packages/database/src/entities/Organization.ts`
- Create: `packages/database/src/entities/index.ts`
- Create: `packages/database/src/entities/BaseEntity.ts`
- Create: `packages/database/src/index.ts`

**Step 1: Create BaseEntity**

Create `packages/database/src/entities/BaseEntity.ts`:

```typescript
import { PrimaryKey, Property } from '@mikro-orm/core';
import { createId } from '@eurocomply/core';

export abstract class BaseEntity {
  @PrimaryKey({ type: 'text' })
  id: string = createId();

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();

  @Property({ name: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**Step 2: Create Organization entity**

Create `packages/database/src/entities/Organization.ts`:

```typescript
import { Entity, Property, Unique, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export enum EnforcementMode {
  ENFORCING = 'ENFORCING',
  SILENT = 'SILENT',
}

@Entity({ tableName: 'organizations', schema: 'public' })
export class Organization extends BaseEntity {
  @Property({ type: 'text' })
  @Unique()
  name!: string;

  @Property({ type: 'text', name: 'schema_name' })
  @Unique()
  schemaName!: string;

  @Property({ type: 'text', nullable: true, name: 'clerk_org_id' })
  @Unique()
  clerkOrgId?: string;

  @Property({ type: 'boolean', name: 'regulatory_advisor_enabled', default: true })
  regulatoryAdvisorEnabled: boolean = true;

  @Enum({ items: () => EnforcementMode, name: 'enforcement_mode', default: EnforcementMode.SILENT })
  enforcementMode: EnforcementMode = EnforcementMode.SILENT;

  @Property({ type: 'boolean', name: 'capture_compliance_in_silent_mode', default: true })
  captureComplianceInSilentMode: boolean = true;

  @Property({ type: 'text', nullable: true, name: 'kms_key_arn' })
  kmsKeyArn?: string;
}
```

**Step 3: Create entity index**

Create `packages/database/src/entities/index.ts`:

```typescript
export { BaseEntity } from './BaseEntity.js';
export { Organization, EnforcementMode } from './Organization.js';
```

**Step 4: Create package index**

Create `packages/database/src/index.ts`:

```typescript
export * from './entities/index.js';
```

**Step 5: Build to verify compilation**

Run: `cd packages/database && pnpm build`
Expected: Compiles without errors

**Step 6: Commit**

```bash
git add packages/database/
git commit -m "feat(database): add Organization entity with Regulatory Advisor settings"
```

---

## Task 4: MikroORM Configuration

**Files:**
- Create: `packages/database/src/mikro-orm.config.ts`
- Create: `packages/database/src/orm.ts`
- Modify: `packages/database/src/index.ts`

**Step 1: Create MikroORM config**

Create `packages/database/src/mikro-orm.config.ts`:

```typescript
import { defineConfig } from '@mikro-orm/postgresql';
import { Organization } from './entities/index.js';

export default defineConfig({
  entities: [Organization],
  dbName: process.env['DATABASE_NAME'] ?? 'eurocomply',
  host: process.env['DATABASE_HOST'] ?? 'localhost',
  port: parseInt(process.env['DATABASE_PORT'] ?? '5432', 10),
  user: process.env['DATABASE_USER'] ?? 'eurocomply',
  password: process.env['DATABASE_PASSWORD'] ?? 'eurocomply',
  schema: 'public',
  debug: process.env['NODE_ENV'] !== 'production',
  migrations: {
    path: './src/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    allOrNothing: true,
  },
});
```

**Step 2: Create ORM initialization utility**

Create `packages/database/src/orm.ts`:

```typescript
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import config from './mikro-orm.config.js';

let orm: MikroORM | null = null;

export async function initOrm(): Promise<MikroORM> {
  if (orm) {
    return orm;
  }
  orm = await MikroORM.init(config);
  return orm;
}

export async function getOrm(): Promise<MikroORM> {
  if (!orm) {
    throw new Error('ORM not initialized. Call initOrm() first.');
  }
  return orm;
}

export async function closeOrm(): Promise<void> {
  if (orm) {
    await orm.close();
    orm = null;
  }
}

/**
 * Creates a tenant-scoped EntityManager.
 * This is the core multi-tenancy mechanism.
 */
export function createTenantEm(em: EntityManager, schemaName: string): EntityManager {
  return em.fork({ schema: schemaName });
}
```

**Step 3: Update package index**

Modify `packages/database/src/index.ts`:

```typescript
export * from './entities/index.js';
export { initOrm, getOrm, closeOrm, createTenantEm } from './orm.js';
export { default as mikroOrmConfig } from './mikro-orm.config.js';
```

**Step 4: Build to verify compilation**

Run: `cd packages/database && pnpm build`
Expected: Compiles without errors

**Step 5: Commit**

```bash
git add packages/database/
git commit -m "feat(database): add MikroORM configuration with multi-tenant support"
```

---

## Task 5: Tenant Entities (Category with LTREE)

**Files:**
- Create: `packages/database/src/entities/Category.ts`
- Create: `packages/database/src/entities/AttributeTemplate.ts`
- Create: `packages/database/src/entities/UnitDefinition.ts`
- Modify: `packages/database/src/entities/index.ts`

**Step 1: Create Category entity with LTREE**

Create `packages/database/src/entities/Category.ts`:

```typescript
import { Entity, Property, Index, ManyToOne, OneToMany, Collection, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export enum CategoryType {
  ROOT = 'ROOT',
  BRANCH = 'BRANCH',
  LEAF = 'LEAF',
}

@Entity({ tableName: 'category' })
export class Category extends BaseEntity {
  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Index({ type: 'gist' })
  @Property({ columnType: 'ltree' })
  path!: string;

  @Enum({ items: () => CategoryType, default: CategoryType.BRANCH })
  type: CategoryType = CategoryType.BRANCH;

  @Property({ type: 'int', default: 0 })
  depth: number = 0;

  @ManyToOne(() => Category, { nullable: true, name: 'parent_id' })
  parent?: Category;

  @OneToMany(() => Category, (cat) => cat.parent)
  children = new Collection<Category>(this);

  @Property({ type: 'text', nullable: true, name: 'default_profile_id' })
  defaultProfileId?: string;

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;
}
```

**Step 2: Create UnitDefinition entity**

Create `packages/database/src/entities/UnitDefinition.ts`:

```typescript
import { Entity, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

@Entity({ tableName: 'unit_definition' })
export class UnitDefinition extends BaseEntity {
  @Property({ type: 'text' })
  @Unique()
  symbol!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', name: 'unit_system' })
  unitSystem!: string; // e.g., 'SI', 'IMPERIAL', 'CUSTOM'

  @Property({ type: 'text', nullable: true, name: 'base_unit' })
  baseUnit?: string;

  @Property({ type: 'float', nullable: true, name: 'conversion_factor' })
  conversionFactor?: number;

  @Property({ type: 'text', nullable: true })
  description?: string;
}
```

**Step 3: Create AttributeTemplate entity**

Create `packages/database/src/entities/AttributeTemplate.ts`:

```typescript
import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';
import { UnitDefinition } from './UnitDefinition.js';

export enum AttributeType {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  DATE = 'DATE',
  ENUM = 'ENUM',
  URL = 'URL',
  JSON = 'JSON',
}

export enum RollupMethod {
  SUM = 'SUM',
  WEIGHTED_AVG = 'WEIGHTED_AVG',
  MAX = 'MAX',
  MIN = 'MIN',
  BOOLEAN_OR = 'BOOLEAN_OR',
  BOOLEAN_AND = 'BOOLEAN_AND',
  CONCAT = 'CONCAT',
  NONE = 'NONE',
}

export enum InheritanceRule {
  INHERIT = 'INHERIT',
  OVERRIDE = 'OVERRIDE',
  ADDITIVE = 'ADDITIVE',
}

@Entity({ tableName: 'attribute_template' })
export class AttributeTemplate extends BaseEntity {
  @Property({ type: 'text' })
  @Index()
  key!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Enum({ items: () => AttributeType })
  type!: AttributeType;

  @ManyToOne(() => Category, { name: 'category_id' })
  category!: Category;

  @ManyToOne(() => UnitDefinition, { nullable: true, name: 'unit_id' })
  unit?: UnitDefinition;

  @Enum({ items: () => RollupMethod, name: 'rollup_method', default: RollupMethod.NONE })
  rollupMethod: RollupMethod = RollupMethod.NONE;

  @Enum({ items: () => InheritanceRule, name: 'inheritance_rule', default: InheritanceRule.INHERIT })
  inheritanceRule: InheritanceRule = InheritanceRule.INHERIT;

  @Property({ type: 'json', nullable: true, name: 'validation_rules' })
  validationRules?: Record<string, unknown>;

  @Property({ type: 'json', nullable: true, name: 'enum_values' })
  enumValues?: string[];

  @Property({ type: 'json', nullable: true, name: 'default_value' })
  defaultValue?: unknown;

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;

  @Property({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder: number = 0;
}
```

**Step 4: Update entity index**

Modify `packages/database/src/entities/index.ts`:

```typescript
export { BaseEntity } from './BaseEntity.js';
export { Organization, EnforcementMode } from './Organization.js';
export { Category, CategoryType } from './Category.js';
export { UnitDefinition } from './UnitDefinition.js';
export {
  AttributeTemplate,
  AttributeType,
  RollupMethod,
  InheritanceRule,
} from './AttributeTemplate.js';
```

**Step 5: Build to verify compilation**

Run: `cd packages/database && pnpm build`
Expected: Compiles without errors

**Step 6: Commit**

```bash
git add packages/database/
git commit -m "feat(database): add Category (LTREE), AttributeTemplate, UnitDefinition entities"
```

---

## Task 6: Product and ProductVersion Entities

**Files:**
- Create: `packages/database/src/entities/Product.ts`
- Create: `packages/database/src/entities/ProductVersion.ts`
- Modify: `packages/database/src/entities/index.ts`

**Step 1: Create Product entity**

Create `packages/database/src/entities/Product.ts`:

```typescript
import { Entity, Property, ManyToOne, OneToMany, Collection, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';

export enum ProductStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

@Entity({ tableName: 'product' })
export class Product extends BaseEntity {
  @Property({ type: 'text' })
  @Index()
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'text', nullable: true })
  sku?: string;

  @Property({ type: 'text', nullable: true })
  gtin?: string;

  @ManyToOne(() => Category, { name: 'category_id' })
  category!: Category;

  @Enum({ items: () => ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus = ProductStatus.DRAFT;

  @Property({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @OneToMany('ProductVersion', 'product')
  versions = new Collection<import('./ProductVersion.js').ProductVersion>(this);
}
```

**Step 2: Create ProductVersion entity**

Create `packages/database/src/entities/ProductVersion.ts`:

```typescript
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Product } from './Product.js';

export enum VersionStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

@Entity({ tableName: 'product_version' })
@Unique({ properties: ['product', 'version'] })
export class ProductVersion extends BaseEntity {
  @ManyToOne(() => Product, { name: 'product_id' })
  @Index()
  product!: Product;

  @Property({ type: 'text' })
  version!: string; // Semantic version: "1.0.0"

  @Enum({ items: () => VersionStatus, default: VersionStatus.DRAFT })
  status: VersionStatus = VersionStatus.DRAFT;

  @Property({ type: 'json', name: 'attribute_values', nullable: true })
  attributeValues?: Record<string, unknown>;

  @Property({ type: 'text', nullable: true, name: 'change_summary' })
  changeSummary?: string;

  @Property({ type: 'text', nullable: true, name: 'created_by' })
  createdBy?: string;

  @Property({ name: 'published_at', nullable: true })
  publishedAt?: Date;

  @Property({ type: 'text', nullable: true, name: 'published_by' })
  publishedBy?: string;
}
```

**Step 3: Update entity index**

Modify `packages/database/src/entities/index.ts`:

```typescript
export { BaseEntity } from './BaseEntity.js';
export { Organization, EnforcementMode } from './Organization.js';
export { Category, CategoryType } from './Category.js';
export { UnitDefinition } from './UnitDefinition.js';
export {
  AttributeTemplate,
  AttributeType,
  RollupMethod,
  InheritanceRule,
} from './AttributeTemplate.js';
export { Product, ProductStatus } from './Product.js';
export { ProductVersion, VersionStatus } from './ProductVersion.js';
```

**Step 4: Update MikroORM config with new entities**

Modify `packages/database/src/mikro-orm.config.ts`:

```typescript
import { defineConfig } from '@mikro-orm/postgresql';
import {
  Organization,
  Category,
  UnitDefinition,
  AttributeTemplate,
  Product,
  ProductVersion,
} from './entities/index.js';

export default defineConfig({
  entities: [
    Organization,
    Category,
    UnitDefinition,
    AttributeTemplate,
    Product,
    ProductVersion,
  ],
  dbName: process.env['DATABASE_NAME'] ?? 'eurocomply',
  host: process.env['DATABASE_HOST'] ?? 'localhost',
  port: parseInt(process.env['DATABASE_PORT'] ?? '5432', 10),
  user: process.env['DATABASE_USER'] ?? 'eurocomply',
  password: process.env['DATABASE_PASSWORD'] ?? 'eurocomply',
  schema: 'public',
  debug: process.env['NODE_ENV'] !== 'production',
  migrations: {
    path: './src/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    allOrNothing: true,
  },
});
```

**Step 5: Build to verify compilation**

Run: `cd packages/database && pnpm build`
Expected: Compiles without errors

**Step 6: Commit**

```bash
git add packages/database/
git commit -m "feat(database): add Product and ProductVersion entities"
```

---

## Task 7: Reliability Layer - OutboxEvent and AuditLog

**Files:**
- Create: `packages/database/src/entities/OutboxEvent.ts`
- Create: `packages/database/src/entities/AuditLog.ts`
- Modify: `packages/database/src/entities/index.ts`
- Modify: `packages/database/src/mikro-orm.config.ts`

**Step 1: Create OutboxEvent entity**

Create `packages/database/src/entities/OutboxEvent.ts`:

```typescript
import { Entity, Property, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

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
  aggregateType!: string; // e.g., 'Product', 'ProductVersion'

  @Property({ type: 'text', name: 'aggregate_id' })
  @Index()
  aggregateId!: string;

  @Property({ type: 'text', name: 'event_type' })
  @Index()
  eventType!: string; // e.g., 'ProductCreated', 'VersionPublished'

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;

  @Enum({ items: () => OutboxStatus, default: OutboxStatus.PENDING })
  @Index()
  status: OutboxStatus = OutboxStatus.PENDING;

  @Property({ type: 'int', default: 0, name: 'retry_count' })
  retryCount: number = 0;

  @Property({ nullable: true, name: 'processed_at' })
  processedAt?: Date;

  @Property({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage?: string;
}
```

**Step 2: Create AuditLog entity**

Create `packages/database/src/entities/AuditLog.ts`:

```typescript
import { Entity, Property, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  PUBLISH = 'PUBLISH',
  ARCHIVE = 'ARCHIVE',
  STATUS_CHANGE = 'STATUS_CHANGE',
}

@Entity({ tableName: 'audit_log' })
export class AuditLog extends BaseEntity {
  @Property({ type: 'text', name: 'entity_type' })
  @Index()
  entityType!: string;

  @Property({ type: 'text', name: 'entity_id' })
  @Index()
  entityId!: string;

  @Enum({ items: () => AuditAction })
  @Index()
  action!: AuditAction;

  @Property({ type: 'text', name: 'user_id' })
  @Index()
  userId!: string;

  @Property({ type: 'json', nullable: true, name: 'old_values' })
  oldValues?: Record<string, unknown>;

  @Property({ type: 'json', nullable: true, name: 'new_values' })
  newValues?: Record<string, unknown>;

  @Property({ type: 'text', nullable: true, name: 'ip_address' })
  ipAddress?: string;

  @Property({ type: 'text', nullable: true, name: 'user_agent' })
  userAgent?: string;
}
```

**Step 3: Update entity index**

Modify `packages/database/src/entities/index.ts`:

```typescript
export { BaseEntity } from './BaseEntity.js';
export { Organization, EnforcementMode } from './Organization.js';
export { Category, CategoryType } from './Category.js';
export { UnitDefinition } from './UnitDefinition.js';
export {
  AttributeTemplate,
  AttributeType,
  RollupMethod,
  InheritanceRule,
} from './AttributeTemplate.js';
export { Product, ProductStatus } from './Product.js';
export { ProductVersion, VersionStatus } from './ProductVersion.js';
export { OutboxEvent, OutboxStatus } from './OutboxEvent.js';
export { AuditLog, AuditAction } from './AuditLog.js';
```

**Step 4: Update MikroORM config**

Modify `packages/database/src/mikro-orm.config.ts`:

```typescript
import { defineConfig } from '@mikro-orm/postgresql';
import {
  Organization,
  Category,
  UnitDefinition,
  AttributeTemplate,
  Product,
  ProductVersion,
  OutboxEvent,
  AuditLog,
} from './entities/index.js';

export default defineConfig({
  entities: [
    Organization,
    Category,
    UnitDefinition,
    AttributeTemplate,
    Product,
    ProductVersion,
    OutboxEvent,
    AuditLog,
  ],
  dbName: process.env['DATABASE_NAME'] ?? 'eurocomply',
  host: process.env['DATABASE_HOST'] ?? 'localhost',
  port: parseInt(process.env['DATABASE_PORT'] ?? '5432', 10),
  user: process.env['DATABASE_USER'] ?? 'eurocomply',
  password: process.env['DATABASE_PASSWORD'] ?? 'eurocomply',
  schema: 'public',
  debug: process.env['NODE_ENV'] !== 'production',
  migrations: {
    path: './src/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    allOrNothing: true,
  },
});
```

**Step 5: Build to verify compilation**

Run: `cd packages/database && pnpm build`
Expected: Compiles without errors

**Step 6: Commit**

```bash
git add packages/database/
git commit -m "feat(database): add OutboxEvent and AuditLog entities for reliability"
```

---

## Task 8: Hono API Server Setup

**Files:**
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/vitest.config.ts`

**Step 1: Create the Hono app**

Create `apps/api/src/app.ts`:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

export type Env = {
  Variables: {
    tenantSchema?: string;
    userId?: string;
  };
};

export function createApp(): Hono<Env> {
  const app = new Hono<Env>();

  // Global middleware
  app.use('*', logger());
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
      credentials: true,
    })
  );

  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // API version prefix
  const v1 = new Hono<Env>();

  // Placeholder for routes
  v1.get('/', (c) => {
    return c.json({ message: 'EuroComply API v1' });
  });

  app.route('/api/v1', v1);

  return app;
}
```

**Step 2: Create the server entry point**

Create `apps/api/src/index.ts`:

```typescript
import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const app = createApp();
const port = parseInt(process.env['PORT'] ?? '3001', 10);

console.log(`Starting server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);
```

**Step 3: Create vitest config**

Create `apps/api/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

**Step 4: Test the server starts**

Run: `cd apps/api && pnpm dev`
Expected: Server starts on port 3001

Run: `curl http://localhost:3001/health`
Expected: `{"status":"healthy","timestamp":"..."}`

Stop the server with Ctrl+C.

**Step 5: Commit**

```bash
git add apps/api/
git commit -m "feat(api): initialize Hono server with health check"
```

---

## Task 9: Tenant Context Middleware

**Files:**
- Create: `apps/api/src/middleware/tenant.ts`
- Create: `apps/api/src/middleware/tenant.test.ts`
- Modify: `apps/api/src/app.ts`

**Step 1: Write the failing test**

Create `apps/api/src/middleware/tenant.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { tenantMiddleware, extractTenantFromJwt } from './tenant.js';

describe('tenant middleware', () => {
  describe('extractTenantFromJwt', () => {
    it('extracts schema_name from JWT payload', () => {
      // Base64 encoded payload: {"schema_name":"tenant_acme","sub":"user123"}
      const payload = btoa(JSON.stringify({ schema_name: 'tenant_acme', sub: 'user123' }));
      const token = `header.${payload}.signature`;

      const result = extractTenantFromJwt(token);
      expect(result).toEqual({ schemaName: 'tenant_acme', userId: 'user123' });
    });

    it('returns null for invalid token', () => {
      expect(extractTenantFromJwt('')).toBeNull();
      expect(extractTenantFromJwt('invalid')).toBeNull();
      expect(extractTenantFromJwt('a.b')).toBeNull();
    });

    it('returns null if schema_name missing', () => {
      const payload = btoa(JSON.stringify({ sub: 'user123' }));
      const token = `header.${payload}.signature`;
      expect(extractTenantFromJwt(token)).toBeNull();
    });
  });

  describe('tenantMiddleware', () => {
    it('sets tenant context from Authorization header', async () => {
      const app = new Hono();
      app.use('*', tenantMiddleware);
      app.get('/test', (c) => {
        return c.json({
          schema: c.get('tenantSchema'),
          user: c.get('userId'),
        });
      });

      const payload = btoa(JSON.stringify({ schema_name: 'tenant_acme', sub: 'user123' }));
      const token = `header.${payload}.signature`;

      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.schema).toBe('tenant_acme');
      expect(data.user).toBe('user123');
    });

    it('returns 401 without Authorization header', async () => {
      const app = new Hono();
      app.use('*', tenantMiddleware);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(401);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test`
Expected: FAIL with "Cannot find module './tenant.js'"

**Step 3: Write the implementation**

Create `apps/api/src/middleware/tenant.ts`:

```typescript
import { createMiddleware } from 'hono/factory';
import type { Env } from '../app.js';

export interface TenantContext {
  schemaName: string;
  userId: string;
}

/**
 * Extracts tenant context from a JWT token.
 * In production, this should validate the signature via Clerk/JWKS.
 * For now, we just decode the payload (development only).
 */
export function extractTenantFromJwt(token: string): TenantContext | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(atob(parts[1]!));
    const schemaName = payload.schema_name;
    const userId = payload.sub;

    if (!schemaName || typeof schemaName !== 'string') {
      return null;
    }

    return { schemaName, userId: userId ?? 'anonymous' };
  } catch {
    return null;
  }
}

/**
 * Middleware that extracts tenant context from the Authorization header.
 * Sets tenantSchema and userId in the Hono context.
 */
export const tenantMiddleware = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const tenant = extractTenantFromJwt(token);

  if (!tenant) {
    return c.json({ error: 'Unauthorized', message: 'Invalid token or missing tenant context' }, 401);
  }

  c.set('tenantSchema', tenant.schemaName);
  c.set('userId', tenant.userId);

  await next();
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/middleware/
git commit -m "feat(api): add tenant context middleware with JWT extraction"
```

---

## Task 10: Organization API Routes

**Files:**
- Create: `apps/api/src/routes/organizations.ts`
- Create: `apps/api/src/routes/organizations.test.ts`
- Modify: `apps/api/src/app.ts`

**Step 1: Write the failing test**

Create `apps/api/src/routes/organizations.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { organizationsRouter } from './organizations.js';

describe('organizations routes', () => {
  const app = new Hono();
  app.route('/organizations', organizationsRouter);

  describe('GET /organizations', () => {
    it('returns empty array initially', async () => {
      const res = await app.request('/organizations');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ data: [], meta: { total: 0 } });
    });
  });

  describe('POST /organizations', () => {
    it('validates required fields', async () => {
      const res = await app.request('/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('accepts valid organization data', async () => {
      const res = await app.request('/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Acme Corp',
          schemaName: 'tenant_acme',
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.name).toBe('Acme Corp');
      expect(data.data.schemaName).toBe('tenant_acme');
      expect(data.data.id).toBeDefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test`
Expected: FAIL with "Cannot find module './organizations.js'"

**Step 3: Write the implementation**

Create `apps/api/src/routes/organizations.ts`:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createId } from '@eurocomply/core';

// In-memory store for testing (will be replaced with MikroORM)
const organizations: Map<string, Organization> = new Map();

interface Organization {
  id: string;
  name: string;
  schemaName: string;
  clerkOrgId?: string;
  regulatoryAdvisorEnabled: boolean;
  enforcementMode: 'ENFORCING' | 'SILENT';
  captureComplianceInSilentMode: boolean;
  kmsKeyArn?: string;
  createdAt: string;
  updatedAt: string;
}

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  schemaName: z.string().min(1).max(63).regex(/^tenant_[a-z0-9_]+$/),
  clerkOrgId: z.string().optional(),
  regulatoryAdvisorEnabled: z.boolean().default(true),
  enforcementMode: z.enum(['ENFORCING', 'SILENT']).default('SILENT'),
  captureComplianceInSilentMode: z.boolean().default(true),
});

export const organizationsRouter = new Hono();

// List organizations
organizationsRouter.get('/', (c) => {
  const orgs = Array.from(organizations.values());
  return c.json({
    data: orgs,
    meta: { total: orgs.length },
  });
});

// Create organization
organizationsRouter.post(
  '/',
  zValidator('json', createOrganizationSchema),
  (c) => {
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const org: Organization = {
      id: createId(),
      name: body.name,
      schemaName: body.schemaName,
      clerkOrgId: body.clerkOrgId,
      regulatoryAdvisorEnabled: body.regulatoryAdvisorEnabled,
      enforcementMode: body.enforcementMode,
      captureComplianceInSilentMode: body.captureComplianceInSilentMode,
      createdAt: now,
      updatedAt: now,
    };

    organizations.set(org.id, org);

    return c.json({ data: org }, 201);
  }
);

// Get organization by ID
organizationsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const org = organizations.get(id);

  if (!org) {
    return c.json({ error: 'Not Found', message: 'Organization not found' }, 404);
  }

  return c.json({ data: org });
});
```

**Step 4: Add zod-validator dependency**

Run: `cd apps/api && pnpm add @hono/zod-validator`

**Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm test`
Expected: PASS

**Step 6: Wire up routes to app**

Modify `apps/api/src/app.ts`:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { organizationsRouter } from './routes/organizations.js';

export type Env = {
  Variables: {
    tenantSchema?: string;
    userId?: string;
  };
};

export function createApp(): Hono<Env> {
  const app = new Hono<Env>();

  // Global middleware
  app.use('*', logger());
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
      credentials: true,
    })
  );

  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // API version prefix
  const v1 = new Hono<Env>();

  v1.get('/', (c) => {
    return c.json({ message: 'EuroComply API v1' });
  });

  // Mount routes
  v1.route('/organizations', organizationsRouter);

  app.route('/api/v1', v1);

  return app;
}
```

**Step 7: Run all tests**

Run: `cd apps/api && pnpm test`
Expected: All PASS

**Step 8: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add Organization CRUD routes with Zod validation"
```

---

## Task 11: Product Routes (Tenant-Scoped)

**Files:**
- Create: `apps/api/src/routes/products.ts`
- Create: `apps/api/src/routes/products.test.ts`
- Modify: `apps/api/src/app.ts`

**Step 1: Write the failing test**

Create `apps/api/src/routes/products.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { productsRouter, clearProductsStore } from './products.js';
import { tenantMiddleware } from '../middleware/tenant.js';

function createTestToken(schemaName: string, userId: string): string {
  const payload = btoa(JSON.stringify({ schema_name: schemaName, sub: userId }));
  return `header.${payload}.signature`;
}

describe('products routes', () => {
  const app = new Hono();
  app.use('*', tenantMiddleware);
  app.route('/products', productsRouter);

  beforeEach(() => {
    clearProductsStore();
  });

  describe('GET /products', () => {
    it('requires authentication', async () => {
      const res = await app.request('/products');
      expect(res.status).toBe(401);
    });

    it('returns empty array for tenant', async () => {
      const res = await app.request('/products', {
        headers: { Authorization: `Bearer ${createTestToken('tenant_acme', 'user1')}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toEqual([]);
    });
  });

  describe('POST /products', () => {
    it('creates product in tenant scope', async () => {
      const res = await app.request('/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${createTestToken('tenant_acme', 'user1')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Widget A',
          categoryId: 'cat123',
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.name).toBe('Widget A');
      expect(data.data.tenantSchema).toBe('tenant_acme');
    });

    it('isolates products by tenant', async () => {
      // Create product in tenant_acme
      await app.request('/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${createTestToken('tenant_acme', 'user1')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Acme Widget', categoryId: 'cat1' }),
      });

      // Create product in tenant_other
      await app.request('/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${createTestToken('tenant_other', 'user2')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Other Widget', categoryId: 'cat2' }),
      });

      // List tenant_acme products
      const acmeRes = await app.request('/products', {
        headers: { Authorization: `Bearer ${createTestToken('tenant_acme', 'user1')}` },
      });
      const acmeData = await acmeRes.json();
      expect(acmeData.data.length).toBe(1);
      expect(acmeData.data[0].name).toBe('Acme Widget');

      // List tenant_other products
      const otherRes = await app.request('/products', {
        headers: { Authorization: `Bearer ${createTestToken('tenant_other', 'user2')}` },
      });
      const otherData = await otherRes.json();
      expect(otherData.data.length).toBe(1);
      expect(otherData.data[0].name).toBe('Other Widget');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test`
Expected: FAIL with "Cannot find module './products.js'"

**Step 3: Write the implementation**

Create `apps/api/src/routes/products.ts`:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createId } from '@eurocomply/core';
import type { Env } from '../app.js';

// In-memory store keyed by tenant schema (will be replaced with MikroORM)
const productsByTenant: Map<string, Map<string, Product>> = new Map();

interface Product {
  id: string;
  tenantSchema: string;
  name: string;
  description?: string;
  sku?: string;
  gtin?: string;
  categoryId: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  sku: z.string().max(100).optional(),
  gtin: z.string().max(14).optional(),
  categoryId: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export function clearProductsStore(): void {
  productsByTenant.clear();
}

function getTenantProducts(schema: string): Map<string, Product> {
  let products = productsByTenant.get(schema);
  if (!products) {
    products = new Map();
    productsByTenant.set(schema, products);
  }
  return products;
}

export const productsRouter = new Hono<Env>();

// List products for tenant
productsRouter.get('/', (c) => {
  const schema = c.get('tenantSchema')!;
  const products = getTenantProducts(schema);
  const data = Array.from(products.values());

  return c.json({
    data,
    meta: { total: data.length },
  });
});

// Create product
productsRouter.post(
  '/',
  zValidator('json', createProductSchema),
  (c) => {
    const schema = c.get('tenantSchema')!;
    const userId = c.get('userId')!;
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const product: Product = {
      id: createId(),
      tenantSchema: schema,
      name: body.name,
      description: body.description,
      sku: body.sku,
      gtin: body.gtin,
      categoryId: body.categoryId,
      status: 'DRAFT',
      metadata: body.metadata,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    };

    const products = getTenantProducts(schema);
    products.set(product.id, product);

    return c.json({ data: product }, 201);
  }
);

// Get product by ID
productsRouter.get('/:id', (c) => {
  const schema = c.get('tenantSchema')!;
  const id = c.req.param('id');
  const products = getTenantProducts(schema);
  const product = products.get(id);

  if (!product) {
    return c.json({ error: 'Not Found', message: 'Product not found' }, 404);
  }

  return c.json({ data: product });
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test`
Expected: PASS

**Step 5: Wire up routes to app**

Modify `apps/api/src/app.ts`:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { organizationsRouter } from './routes/organizations.js';
import { productsRouter } from './routes/products.js';
import { tenantMiddleware } from './middleware/tenant.js';

export type Env = {
  Variables: {
    tenantSchema?: string;
    userId?: string;
  };
};

export function createApp(): Hono<Env> {
  const app = new Hono<Env>();

  // Global middleware
  app.use('*', logger());
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
      credentials: true,
    })
  );

  // Health check (no auth required)
  app.get('/health', (c) => {
    return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // API version prefix
  const v1 = new Hono<Env>();

  v1.get('/', (c) => {
    return c.json({ message: 'EuroComply API v1' });
  });

  // Public routes (no tenant context)
  v1.route('/organizations', organizationsRouter);

  // Tenant-scoped routes (require auth)
  const tenantRoutes = new Hono<Env>();
  tenantRoutes.use('*', tenantMiddleware);
  tenantRoutes.route('/products', productsRouter);

  v1.route('/', tenantRoutes);

  app.route('/api/v1', v1);

  return app;
}
```

**Step 6: Run all tests**

Run: `cd apps/api && pnpm test`
Expected: All PASS

**Step 7: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add tenant-scoped Product routes with isolation"
```

---

## Task 12: Database Integration Test Setup

**Files:**
- Create: `packages/database/src/test-utils.ts`
- Create: `packages/database/vitest.config.ts`
- Create: `packages/database/src/entities/Organization.test.ts`

**Step 1: Create test utilities**

Create `packages/database/src/test-utils.ts`:

```typescript
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import config from './mikro-orm.config.js';

let testOrm: MikroORM | null = null;

export async function setupTestDb(): Promise<MikroORM> {
  if (testOrm) {
    return testOrm;
  }

  testOrm = await MikroORM.init({
    ...config,
    dbName: process.env['TEST_DATABASE_NAME'] ?? 'eurocomply_test',
    allowGlobalContext: true,
  });

  // Ensure schema exists
  const generator = testOrm.getSchemaGenerator();
  await generator.ensureDatabase();
  await generator.updateSchema();

  return testOrm;
}

export async function teardownTestDb(): Promise<void> {
  if (testOrm) {
    await testOrm.close();
    testOrm = null;
  }
}

export async function clearTestDb(em: EntityManager): Promise<void> {
  const connection = em.getConnection();
  const tables = ['audit_log', 'outbox_event', 'product_version', 'product', 'attribute_template', 'unit_definition', 'category', 'organizations'];

  for (const table of tables) {
    try {
      await connection.execute(`TRUNCATE TABLE "${table}" CASCADE`);
    } catch {
      // Table might not exist yet
    }
  }
}
```

**Step 2: Create vitest config**

Create `packages/database/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

**Step 3: Write integration test**

Create `packages/database/src/entities/Organization.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb } from '../test-utils.js';
import { Organization, EnforcementMode } from './Organization.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('Organization entity', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await clearTestDb(em);
  });

  it('creates an organization with defaults', async () => {
    const org = new Organization();
    org.name = 'Test Corp';
    org.schemaName = 'tenant_test';

    em.persist(org);
    await em.flush();

    expect(org.id).toBeDefined();
    expect(org.regulatoryAdvisorEnabled).toBe(true);
    expect(org.enforcementMode).toBe(EnforcementMode.SILENT);
    expect(org.captureComplianceInSilentMode).toBe(true);
    expect(org.createdAt).toBeInstanceOf(Date);
  });

  it('enforces unique schema names', async () => {
    const org1 = new Organization();
    org1.name = 'Corp 1';
    org1.schemaName = 'tenant_unique';

    const org2 = new Organization();
    org2.name = 'Corp 2';
    org2.schemaName = 'tenant_unique';

    em.persist(org1);
    await em.flush();

    em.persist(org2);
    await expect(em.flush()).rejects.toThrow();
  });

  it('retrieves organization by schema name', async () => {
    const org = new Organization();
    org.name = 'Find Me Corp';
    org.schemaName = 'tenant_findme';

    em.persist(org);
    await em.flush();
    em.clear();

    const found = await em.findOne(Organization, { schemaName: 'tenant_findme' });
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Find Me Corp');
  });
});
```

**Step 4: Run integration tests**

Run: `cd packages/database && pnpm test`
Expected: Tests may SKIP if no database available, or PASS if PostgreSQL is running

**Step 5: Commit**

```bash
git add packages/database/
git commit -m "test(database): add integration test setup and Organization tests"
```

---

## Task 13: Initial Migration Generation

**Files:**
- Create: `packages/database/src/migrations/`

**Step 1: Generate initial migration**

Ensure PostgreSQL is running with the `ltree` extension:

```bash
psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS ltree;"
```

**Step 2: Generate migration**

Run: `cd packages/database && pnpm mikro-orm migration:create --initial`
Expected: Creates migration file in `src/migrations/`

**Step 3: Review the generated migration**

Open the generated file and verify it includes:
- `organizations` table in `public` schema
- `category` table with `ltree` column
- `attribute_template` table
- `unit_definition` table
- `product` table
- `product_version` table
- `outbox_event` table
- `audit_log` table

**Step 4: Commit**

```bash
git add packages/database/src/migrations/
git commit -m "feat(database): add initial migration with all entities"
```

---

## Task 14: Parallel Migration Engine

**Files:**
- Create: `packages/database/src/migrations/parallel-migrator.ts`
- Create: `packages/database/src/migrations/parallel-migrator.test.ts`

**Step 1: Write the failing test**

Create `packages/database/src/migrations/parallel-migrator.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ParallelMigrator } from './parallel-migrator.js';

describe('ParallelMigrator', () => {
  it('runs migrations in parallel batches', async () => {
    const migrateFn = vi.fn().mockResolvedValue(undefined);
    const schemas = ['tenant_a', 'tenant_b', 'tenant_c', 'tenant_d', 'tenant_e'];

    const migrator = new ParallelMigrator({
      schemas,
      concurrency: 2,
      migrateFn,
    });

    const results = await migrator.run();

    expect(migrateFn).toHaveBeenCalledTimes(5);
    expect(results.successful).toEqual(schemas);
    expect(results.failed).toEqual([]);
  });

  it('handles failures gracefully', async () => {
    const migrateFn = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Migration failed'))
      .mockResolvedValueOnce(undefined);

    const schemas = ['tenant_a', 'tenant_b', 'tenant_c'];

    const migrator = new ParallelMigrator({
      schemas,
      concurrency: 1,
      migrateFn,
    });

    const results = await migrator.run();

    expect(results.successful).toContain('tenant_a');
    expect(results.successful).toContain('tenant_c');
    expect(results.failed).toContain('tenant_b');
  });

  it('respects concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const migrateFn = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 50));
      concurrent--;
    });

    const schemas = ['a', 'b', 'c', 'd', 'e', 'f'];

    const migrator = new ParallelMigrator({
      schemas,
      concurrency: 3,
      migrateFn,
    });

    await migrator.run();

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test`
Expected: FAIL with "Cannot find module './parallel-migrator.js'"

**Step 3: Write the implementation**

Create `packages/database/src/migrations/parallel-migrator.ts`:

```typescript
export interface ParallelMigratorOptions {
  schemas: string[];
  concurrency: number;
  migrateFn: (schema: string) => Promise<void>;
}

export interface MigrationResults {
  successful: string[];
  failed: string[];
  errors: Map<string, Error>;
}

export class ParallelMigrator {
  private schemas: string[];
  private concurrency: number;
  private migrateFn: (schema: string) => Promise<void>;

  constructor(options: ParallelMigratorOptions) {
    this.schemas = options.schemas;
    this.concurrency = options.concurrency;
    this.migrateFn = options.migrateFn;
  }

  async run(): Promise<MigrationResults> {
    const results: MigrationResults = {
      successful: [],
      failed: [],
      errors: new Map(),
    };

    // Process schemas in batches
    const batches = this.chunk(this.schemas, this.concurrency);

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(async (schema) => {
          await this.migrateFn(schema);
          return schema;
        })
      );

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i]!;
        const schema = batch[i]!;

        if (result.status === 'fulfilled') {
          results.successful.push(schema);
        } else {
          results.failed.push(schema);
          results.errors.set(schema, result.reason);
        }
      }
    }

    return results;
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test`
Expected: PASS

**Step 5: Export from package**

Add to `packages/database/src/index.ts`:

```typescript
export * from './entities/index.js';
export { initOrm, getOrm, closeOrm, createTenantEm } from './orm.js';
export { default as mikroOrmConfig } from './mikro-orm.config.js';
export { ParallelMigrator, type ParallelMigratorOptions, type MigrationResults } from './migrations/parallel-migrator.js';
```

**Step 6: Commit**

```bash
git add packages/database/
git commit -m "feat(database): add parallel migration engine for multi-tenant schemas"
```

---

## Task 15: End-to-End API Test

**Files:**
- Create: `apps/api/src/app.e2e.test.ts`

**Step 1: Write end-to-end test**

Create `apps/api/src/app.e2e.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from './app.js';
import { clearProductsStore } from './routes/products.js';

function createTestToken(schemaName: string, userId: string): string {
  const payload = btoa(JSON.stringify({ schema_name: schemaName, sub: userId }));
  return `header.${payload}.signature`;
}

describe('EuroComply API E2E', () => {
  const app = createApp();

  beforeEach(() => {
    clearProductsStore();
  });

  describe('Health Check', () => {
    it('GET /health returns healthy status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('healthy');
    });
  });

  describe('API Info', () => {
    it('GET /api/v1 returns API info', async () => {
      const res = await app.request('/api/v1');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe('EuroComply API v1');
    });
  });

  describe('Organization Flow', () => {
    it('creates and retrieves organization', async () => {
      // Create
      const createRes = await app.request('/api/v1/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'E2E Test Corp',
          schemaName: 'tenant_e2e',
        }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      const orgId = created.data.id;

      // Retrieve
      const getRes = await app.request(`/api/v1/organizations/${orgId}`);
      expect(getRes.status).toBe(200);
      const retrieved = await getRes.json();
      expect(retrieved.data.name).toBe('E2E Test Corp');
    });
  });

  describe('Product Flow (Tenant-Scoped)', () => {
    it('creates products isolated by tenant', async () => {
      const token1 = createTestToken('tenant_corp1', 'user1');
      const token2 = createTestToken('tenant_corp2', 'user2');

      // Create product in tenant 1
      const create1 = await app.request('/api/v1/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token1}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Corp1 Product',
          categoryId: 'cat1',
        }),
      });
      expect(create1.status).toBe(201);

      // Create product in tenant 2
      const create2 = await app.request('/api/v1/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token2}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Corp2 Product',
          categoryId: 'cat2',
        }),
      });
      expect(create2.status).toBe(201);

      // List tenant 1 - should only see their product
      const list1 = await app.request('/api/v1/products', {
        headers: { Authorization: `Bearer ${token1}` },
      });
      const data1 = await list1.json();
      expect(data1.data.length).toBe(1);
      expect(data1.data[0].name).toBe('Corp1 Product');

      // List tenant 2 - should only see their product
      const list2 = await app.request('/api/v1/products', {
        headers: { Authorization: `Bearer ${token2}` },
      });
      const data2 = await list2.json();
      expect(data2.data.length).toBe(1);
      expect(data2.data[0].name).toBe('Corp2 Product');
    });
  });
});
```

**Step 2: Run end-to-end tests**

Run: `cd apps/api && pnpm test`
Expected: All PASS

**Step 3: Commit**

```bash
git add apps/api/
git commit -m "test(api): add end-to-end API tests for Organization and Product flows"
```

---

## Task 16: Build and Verify All Packages

**Step 1: Install all dependencies**

Run: `pnpm install`
Expected: All dependencies installed

**Step 2: Build all packages**

Run: `pnpm build`
Expected: All packages compile without errors

**Step 3: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify full build and test suite passes"
```

---

## Summary

This implementation plan establishes the **Phase 1 Foundation** for EuroComply:

### Completed Components

1. **Monorepo Structure**: Turbo + pnpm workspaces with `@eurocomply/api`, `@eurocomply/core`, `@eurocomply/database`

2. **Core Package**:
   - CUID2 ID generation with validation

3. **Database Package**:
   - MikroORM configuration with PostgreSQL
   - **Public Schema Entities**: Organization (with Regulatory Advisor settings)
   - **Tenant Schema Entities**: Category (LTREE), AttributeTemplate, UnitDefinition, Product, ProductVersion
   - **Reliability Entities**: OutboxEvent, AuditLog
   - Multi-tenant EntityManager forking
   - Parallel migration engine

4. **API Package**:
   - Hono server with security middleware
   - JWT-based tenant context extraction
   - Organization CRUD routes (public)
   - Product routes (tenant-scoped with isolation)

### Architecture Decisions Implemented

- Schema-per-tenant PostgreSQL multi-tenancy
- JWT claims contain `schema_name` (no DB lookup per request)
- LTREE for hierarchical categories
- Transactional outbox pattern ready
- Audit logging foundation

### Next Steps (Future Tasks)

- Clerk authentication integration (real JWT validation)
- AWS KMS integration for per-tenant DEKs
- Category CRUD with LTREE operations
- AttributeTemplate management
- ProductVersion lifecycle and publishing
- Inheritance Engine for attribute resolution
- BOM (Bill of Materials) support
