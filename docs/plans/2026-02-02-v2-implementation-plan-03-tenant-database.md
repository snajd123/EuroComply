# Segment 03: Tenant Database with Row-Level Tenancy

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace schema-per-tenant architecture with row-level tenancy using `tenant_id` on every row, implement Row Level Security (RLS), create event store for audit trails, and migrate tenant entities.

**Architecture:** Single `eurocomply` database with `tenant_id` column on every tenant-scoped table. PostgreSQL Row Level Security enforces isolation. Event sourcing provides immutable audit trail for compliance. Products/Materials are projections from events.

**Tech Stack:** PostgreSQL 15, MikroORM, RLS policies, Event Sourcing, CQRS

---

## Prerequisites

- Segment 01 completed (GSR database separate)
- Docker postgres running
- Understanding of current schema-per-tenant entities in `packages/database`

---

## Task 1: Create Tenant Entity (Replaces Organization)

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Tenant.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Tenant.test.ts`

**Step 1: Write failing test for Tenant entity**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Tenant, TenantTier, TenantStatus, EnforcementMode } from './Tenant.js';

describe('Tenant Entity', () => {
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
    // Clear tenants table
    await em.nativeDelete(Tenant, {});
  });

  describe('creation', () => {
    it('should_create_tenant_with_required_fields_when_valid', async () => {
      const tenant = em.create(Tenant, {
        externalId: 'org_clerk123',
        name: 'Test Company',
        slug: 'test-company',
      });

      await em.persistAndFlush(tenant);

      expect(tenant.id).toBeDefined();
      expect(tenant.tier).toBe(TenantTier.STARTER);
      expect(tenant.status).toBe(TenantStatus.ACTIVE);
    });

    it('should_enforce_unique_external_id_constraint', async () => {
      const tenant1 = em.create(Tenant, {
        externalId: 'org_clerk123',
        name: 'Company 1',
        slug: 'company-1',
      });
      await em.persistAndFlush(tenant1);

      const tenant2 = em.create(Tenant, {
        externalId: 'org_clerk123', // Duplicate
        name: 'Company 2',
        slug: 'company-2',
      });

      await expect(em.persistAndFlush(tenant2)).rejects.toThrow(/unique|duplicate/i);
    });

    it('should_enforce_unique_slug_constraint', async () => {
      const tenant1 = em.create(Tenant, {
        externalId: 'org_clerk111',
        name: 'Company 1',
        slug: 'same-slug',
      });
      await em.persistAndFlush(tenant1);

      const tenant2 = em.create(Tenant, {
        externalId: 'org_clerk222',
        name: 'Company 2',
        slug: 'same-slug', // Duplicate
      });

      await expect(em.persistAndFlush(tenant2)).rejects.toThrow(/unique|duplicate/i);
    });
  });

  describe('tier limits', () => {
    it('should_set_default_limits_based_on_starter_tier', async () => {
      const tenant = em.create(Tenant, {
        externalId: 'org_test',
        name: 'Test',
        slug: 'test',
        tier: TenantTier.STARTER,
      });

      await em.persistAndFlush(tenant);

      expect(tenant.userLimit).toBe(20);
      expect(tenant.storageLimitBytes).toBe(536870912000n); // 500 GB
      expect(tenant.apiRateLimit).toBe(100);
    });

    it('should_allow_custom_limits_to_override_defaults', async () => {
      const tenant = em.create(Tenant, {
        externalId: 'org_enterprise',
        name: 'Enterprise',
        slug: 'enterprise',
        tier: TenantTier.ENTERPRISE,
        userLimit: 500,
        apiRateLimit: 20000,
      });

      await em.persistAndFlush(tenant);

      expect(tenant.userLimit).toBe(500);
      expect(tenant.apiRateLimit).toBe(20000);
    });
  });

  describe('enforcement mode', () => {
    it('should_default_to_silent_enforcement_for_new_tenants', async () => {
      const tenant = em.create(Tenant, {
        externalId: 'org_new',
        name: 'New Tenant',
        slug: 'new-tenant',
      });

      await em.persistAndFlush(tenant);

      expect(tenant.enforcementMode).toBe(EnforcementMode.SILENT);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/Tenant.test.ts`
Expected: FAIL with "Cannot find module './Tenant.js'"

**Step 3: Create Tenant entity**

```typescript
import {
  Entity,
  Property,
  Enum,
  Unique,
  Index,
  BeforeCreate,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export enum TenantTier {
  STARTER = 'starter',
  GROWTH = 'growth',
  SCALE = 'scale',
  ENTERPRISE = 'enterprise',
  PLATFORM = 'platform',
}

export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
}

export enum EnforcementMode {
  SILENT = 'SILENT',       // Log violations, don't block
  WARN = 'WARN',           // Show warnings, allow proceed
  STRICT = 'STRICT',       // Block non-compliant actions
}

/**
 * Default limits per tier (from business model doc).
 */
const TIER_DEFAULTS: Record<TenantTier, { users: number; storageGb: number; apiRate: number }> = {
  [TenantTier.STARTER]: { users: 20, storageGb: 500, apiRate: 100 },
  [TenantTier.GROWTH]: { users: 50, storageGb: 1000, apiRate: 500 },
  [TenantTier.SCALE]: { users: 100, storageGb: 2000, apiRate: 2000 },
  [TenantTier.ENTERPRISE]: { users: 200, storageGb: 5000, apiRate: 10000 },
  [TenantTier.PLATFORM]: { users: 1000, storageGb: 10000, apiRate: 50000 },
};

/**
 * Tenant: The root entity for multi-tenancy.
 *
 * Replaces the v1 "Organization" entity.
 * All tenant-scoped tables have a `tenant_id` FK to this table.
 */
@Entity({ tableName: 'tenants' })
export class Tenant extends BaseEntity {
  /**
   * External ID from Clerk (org_xxx).
   * Used for webhook correlation.
   */
  @Property({ type: 'varchar', length: 50 })
  @Unique({ name: 'uq_tenant_external_id' })
  @Index({ name: 'idx_tenant_external_id' })
  externalId!: string;

  /**
   * Display name of the organization.
   */
  @Property({ type: 'text' })
  name!: string;

  /**
   * URL-safe slug for tenant identification.
   */
  @Property({ type: 'varchar', length: 100 })
  @Unique({ name: 'uq_tenant_slug' })
  slug!: string;

  /**
   * Subscription tier (determines limits and features).
   */
  @Enum(() => TenantTier)
  @Index({ name: 'idx_tenant_tier' })
  tier: TenantTier = TenantTier.STARTER;

  /**
   * Account status.
   */
  @Enum(() => TenantStatus)
  @Index({ name: 'idx_tenant_status' })
  status: TenantStatus = TenantStatus.ACTIVE;

  // ═══════════════════════════════════════════════════════════════════════════
  // LIMITS (can be overridden from tier defaults)
  // ═══════════════════════════════════════════════════════════════════════════

  @Property({ type: 'integer' })
  userLimit: number = 20;

  @Property({ type: 'bigint' })
  storageLimitBytes: bigint = 536870912000n; // 500 GB

  @Property({ type: 'integer' })
  apiRateLimit: number = 100;

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLIANCE SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * How strictly compliance rules are enforced.
   * SILENT = log only, WARN = show warnings, STRICT = block actions
   */
  @Enum(() => EnforcementMode)
  enforcementMode: EnforcementMode = EnforcementMode.SILENT;

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTERNAL REFERENCES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Stripe customer ID for billing.
   */
  @Property({ type: 'varchar', length: 100, nullable: true })
  stripeCustomerId?: string | null;

  /**
   * Decentralized Identifier for DPP signing.
   */
  @Property({ type: 'varchar', length: 255, nullable: true })
  did?: string | null;

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  @BeforeCreate()
  setDefaultLimits(): void {
    const defaults = TIER_DEFAULTS[this.tier];
    // Only set if not explicitly provided (checking for default values)
    if (this.userLimit === 20 && this.tier !== TenantTier.STARTER) {
      this.userLimit = defaults.users;
    }
    if (this.storageLimitBytes === 536870912000n && this.tier !== TenantTier.STARTER) {
      this.storageLimitBytes = BigInt(defaults.storageGb) * 1073741824n; // GB to bytes
    }
    if (this.apiRateLimit === 100 && this.tier !== TenantTier.STARTER) {
      this.apiRateLimit = defaults.apiRate;
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/Tenant.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/Tenant.ts packages/database/src/entities/Tenant.test.ts
git commit -m "feat(database): add Tenant entity for row-level multi-tenancy

Tenant replaces Organization with v2 architecture:
- externalId links to Clerk org_xxx
- Tier-based limits (users, storage, API rate)
- Enforcement mode for compliance strictness
- Slug for URL-safe identification

All tenant-scoped tables will have tenant_id FK to this table.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create User Entity with Tenant Scope

**Files:**
- Modify: `/root/Documents/EuroComply/packages/database/src/entities/User.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/User.test.ts`

**Step 1: Write failing test for User entity**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Tenant } from './Tenant.js';
import { User } from './User.js';

describe('User Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testTenant: Tenant;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(User, {});
    await em.nativeDelete(Tenant, {});

    // Create test tenant
    testTenant = em.create(Tenant, {
      externalId: 'org_test123',
      name: 'Test Company',
      slug: 'test-company',
    });
    await em.persistAndFlush(testTenant);
    em.clear();
    testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });
  });

  describe('creation', () => {
    it('should_require_tenant_id_when_creating_user', async () => {
      const user = em.create(User, {
        tenant: testTenant,
        externalId: 'user_clerk456',
        email: 'test@example.com',
        name: 'Test User',
      });

      await em.persistAndFlush(user);

      expect(user.id).toBeDefined();
      expect(user.tenant.id).toBe(testTenant.id);
    });

    it('should_enforce_unique_external_id_within_tenant', async () => {
      const user1 = em.create(User, {
        tenant: testTenant,
        externalId: 'user_same',
        email: 'user1@example.com',
      });
      await em.persistAndFlush(user1);

      const user2 = em.create(User, {
        tenant: testTenant,
        externalId: 'user_same', // Same external ID
        email: 'user2@example.com',
      });

      await expect(em.persistAndFlush(user2)).rejects.toThrow(/unique|duplicate/i);
    });

    it('should_allow_same_external_id_in_different_tenants', async () => {
      // Create second tenant
      const tenant2 = em.create(Tenant, {
        externalId: 'org_other',
        name: 'Other Company',
        slug: 'other-company',
      });
      await em.persistAndFlush(tenant2);

      const user1 = em.create(User, {
        tenant: testTenant,
        externalId: 'user_shared',
        email: 'user@tenant1.com',
      });
      await em.persistAndFlush(user1);

      const user2 = em.create(User, {
        tenant: tenant2,
        externalId: 'user_shared', // Same external ID, different tenant
        email: 'user@tenant2.com',
      });
      await em.persistAndFlush(user2);

      expect(user1.id).not.toBe(user2.id);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/User.test.ts`
Expected: FAIL

**Step 3: Create/Update User entity**

```typescript
import {
  Entity,
  Property,
  ManyToOne,
  Index,
  Unique,
  type Rel,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Tenant } from './Tenant.js';

/**
 * User: A human user within a tenant.
 *
 * Scoped to tenant - same person can exist in multiple tenants.
 * externalId is the Clerk user_xxx ID.
 */
@Entity({ tableName: 'users' })
@Unique({ properties: ['tenant', 'externalId'], name: 'uq_user_tenant_external' })
export class User extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'cascade' })
  @Index({ name: 'idx_user_tenant' })
  tenant!: Rel<Tenant>;

  /**
   * Clerk user ID (user_xxx).
   */
  @Property({ type: 'varchar', length: 50 })
  externalId!: string;

  @Property({ type: 'text' })
  email!: string;

  @Property({ type: 'text', nullable: true })
  name?: string | null;

  @Property({ type: 'text', nullable: true })
  avatarUrl?: string | null;

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true;

  @Property({ type: 'timestamptz', nullable: true })
  lastLoginAt?: Date | null;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/User.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/User.ts packages/database/src/entities/User.test.ts
git commit -m "feat(database): add User entity with tenant scope

User is scoped to tenant:
- tenant_id FK to tenants table
- Unique (tenant_id, external_id) constraint
- Same Clerk user can exist in multiple tenants

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Event Store Entities

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Event.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Snapshot.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Event.test.ts`

**Step 1: Write failing test for Event entity**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Tenant } from './Tenant.js';
import { Event } from './Event.js';
import { createId } from '@eurocomply/core';

describe('Event Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testTenant: Tenant;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(Event, {});
    await em.nativeDelete(Tenant, {});

    testTenant = em.create(Tenant, {
      externalId: 'org_test',
      name: 'Test',
      slug: 'test',
    });
    await em.persistAndFlush(testTenant);
    em.clear();
    testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });
  });

  describe('event sourcing', () => {
    it('should_create_event_with_stream_and_version_when_valid', async () => {
      const streamId = createId();
      const event = em.create(Event, {
        tenantId: testTenant.id,
        streamType: 'Product',
        streamId,
        eventType: 'ProductCreated',
        eventData: { name: 'Test Product', sku: 'TEST-001' },
        version: 1,
      });

      await em.persistAndFlush(event);

      expect(event.id).toBeDefined();
      expect(event.globalPosition).toBeDefined();
    });

    it('should_enforce_unique_stream_version_constraint', async () => {
      const streamId = createId();

      const event1 = em.create(Event, {
        tenantId: testTenant.id,
        streamType: 'Product',
        streamId,
        eventType: 'ProductCreated',
        eventData: {},
        version: 1,
      });
      await em.persistAndFlush(event1);

      const event2 = em.create(Event, {
        tenantId: testTenant.id,
        streamType: 'Product',
        streamId,
        eventType: 'ProductUpdated',
        eventData: {},
        version: 1, // Same version!
      });

      await expect(em.persistAndFlush(event2)).rejects.toThrow(/unique|duplicate/i);
    });

    it('should_allow_same_version_for_different_streams', async () => {
      const stream1 = createId();
      const stream2 = createId();

      const event1 = em.create(Event, {
        tenantId: testTenant.id,
        streamType: 'Product',
        streamId: stream1,
        eventType: 'ProductCreated',
        eventData: {},
        version: 1,
      });

      const event2 = em.create(Event, {
        tenantId: testTenant.id,
        streamType: 'Product',
        streamId: stream2,
        eventType: 'ProductCreated',
        eventData: {},
        version: 1,
      });

      await em.persistAndFlush([event1, event2]);

      expect(event1.id).toBeDefined();
      expect(event2.id).toBeDefined();
    });

    it('should_store_event_metadata_when_provided', async () => {
      const event = em.create(Event, {
        tenantId: testTenant.id,
        streamType: 'Product',
        streamId: createId(),
        eventType: 'ProductCreated',
        eventData: { name: 'Test' },
        metadata: {
          userId: 'user_123',
          correlationId: 'corr_456',
          causationId: 'cause_789',
        },
        version: 1,
      });

      await em.persistAndFlush(event);

      const loaded = await em.findOneOrFail(Event, { id: event.id });
      expect(loaded.metadata?.userId).toBe('user_123');
    });
  });

  describe('global ordering', () => {
    it('should_assign_monotonically_increasing_global_position', async () => {
      const events: Event[] = [];

      for (let i = 0; i < 5; i++) {
        const event = em.create(Event, {
          tenantId: testTenant.id,
          streamType: 'Product',
          streamId: createId(),
          eventType: 'ProductCreated',
          eventData: {},
          version: 1,
        });
        await em.persistAndFlush(event);
        events.push(event);
        em.clear();
      }

      // Verify global positions are increasing
      for (let i = 1; i < events.length; i++) {
        expect(events[i].globalPosition).toBeGreaterThan(events[i - 1].globalPosition!);
      }
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/Event.test.ts`
Expected: FAIL

**Step 3: Create Event entity**

```typescript
import {
  Entity,
  Property,
  Index,
  Unique,
  PrimaryKey,
} from '@mikro-orm/core';

/**
 * Event: Immutable event record for event sourcing.
 *
 * Events are append-only. Once created, they cannot be modified or deleted.
 * This provides a complete audit trail for compliance ("Legal Time Machine").
 *
 * Each event belongs to a stream (identified by streamType + streamId).
 * Within a stream, versions must be sequential (optimistic concurrency).
 */
@Entity({ tableName: 'events' })
@Unique({ properties: ['streamId', 'version'], name: 'uq_stream_version' })
export class Event {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  /**
   * Tenant this event belongs to.
   * Note: Direct UUID reference (not FK) for performance.
   */
  @Property({ type: 'uuid' })
  @Index({ name: 'idx_event_tenant' })
  tenantId!: string;

  /**
   * Type of aggregate (e.g., 'Product', 'Material', 'Order').
   */
  @Property({ type: 'varchar', length: 50 })
  streamType!: string;

  /**
   * ID of the aggregate instance.
   */
  @Property({ type: 'uuid' })
  @Index({ name: 'idx_event_stream' })
  streamId!: string;

  /**
   * Event type (e.g., 'ProductCreated', 'MaterialAdded').
   */
  @Property({ type: 'varchar', length: 100 })
  eventType!: string;

  /**
   * Event payload - the actual data.
   */
  @Property({ type: 'jsonb' })
  eventData!: Record<string, unknown>;

  /**
   * Optional metadata (userId, correlationId, etc.).
   */
  @Property({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  /**
   * Stream version for optimistic concurrency.
   * Must be sequential within a stream (1, 2, 3, ...).
   */
  @Property({ type: 'bigint' })
  version!: number;

  /**
   * Global position across all streams.
   * Auto-incrementing, used for projections and subscriptions.
   */
  @Property({ type: 'bigint', defaultRaw: "nextval('events_global_position_seq')" })
  @Index({ name: 'idx_event_global' })
  globalPosition?: number;

  /**
   * When the event was created.
   */
  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();
}
```

**Step 4: Create Snapshot entity**

```typescript
import {
  Entity,
  Property,
  Index,
  Unique,
  PrimaryKey,
} from '@mikro-orm/core';

/**
 * Snapshot: Periodic state snapshot for performance.
 *
 * Loading an aggregate from events requires replaying all events.
 * Snapshots cache the state at a point in time to speed up loading.
 *
 * Strategy: Snapshot every N events (e.g., every 100).
 */
@Entity({ tableName: 'snapshots' })
@Unique({ properties: ['streamId', 'version'], name: 'uq_snapshot_stream_version' })
export class Snapshot {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'uuid' })
  tenantId!: string;

  @Property({ type: 'varchar', length: 50 })
  streamType!: string;

  @Property({ type: 'uuid' })
  @Index({ name: 'idx_snapshot_stream' })
  streamId!: string;

  /**
   * The event version this snapshot was taken at.
   */
  @Property({ type: 'bigint' })
  version!: number;

  /**
   * The serialized aggregate state.
   */
  @Property({ type: 'jsonb' })
  state!: Record<string, unknown>;

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/Event.test.ts`
Expected: PASS (may need to create sequence first)

**Step 6: Commit**

```bash
git add packages/database/src/entities/Event.ts packages/database/src/entities/Snapshot.ts packages/database/src/entities/Event.test.ts
git commit -m "feat(database): add Event and Snapshot entities for event sourcing

Event sourcing provides immutable audit trail ('Legal Time Machine'):
- Events are append-only, never modified
- Stream version enforces optimistic concurrency
- Global position enables projections and subscriptions
- Metadata tracks userId, correlationId for tracing

Snapshots cache aggregate state for performance.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create Product Projection Entity

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Product.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Product.test.ts`

**Step 1: Write failing test for Product entity**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Tenant } from './Tenant.js';
import { Product, ProductStatus, ProductType } from './Product.js';

describe('Product Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testTenant: Tenant;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(Product, {});
    await em.nativeDelete(Tenant, {});

    testTenant = em.create(Tenant, {
      externalId: 'org_test',
      name: 'Test',
      slug: 'test',
    });
    await em.persistAndFlush(testTenant);
    em.clear();
    testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });
  });

  describe('creation', () => {
    it('should_create_product_with_tenant_id_when_valid', async () => {
      const product = em.create(Product, {
        tenant: testTenant,
        name: 'Test Product',
        productType: ProductType.FINISHED_GOOD,
      });

      await em.persistAndFlush(product);

      expect(product.id).toBeDefined();
      expect(product.status).toBe(ProductStatus.DRAFT);
      expect(product.streamVersion).toBe(0);
    });

    it('should_allow_optional_sku_and_gtin', async () => {
      const product = em.create(Product, {
        tenant: testTenant,
        name: 'Product with identifiers',
        productType: ProductType.FINISHED_GOOD,
        sku: 'SKU-001',
        gtin: '12345678901234',
      });

      await em.persistAndFlush(product);

      expect(product.sku).toBe('SKU-001');
      expect(product.gtin).toBe('12345678901234');
    });

    it('should_enforce_unique_sku_within_tenant', async () => {
      const product1 = em.create(Product, {
        tenant: testTenant,
        name: 'Product 1',
        productType: ProductType.FINISHED_GOOD,
        sku: 'SAME-SKU',
      });
      await em.persistAndFlush(product1);

      const product2 = em.create(Product, {
        tenant: testTenant,
        name: 'Product 2',
        productType: ProductType.FINISHED_GOOD,
        sku: 'SAME-SKU',
      });

      await expect(em.persistAndFlush(product2)).rejects.toThrow(/unique|duplicate/i);
    });
  });

  describe('stream version', () => {
    it('should_track_stream_version_for_event_sourcing', async () => {
      const product = em.create(Product, {
        tenant: testTenant,
        name: 'Versioned Product',
        productType: ProductType.FINISHED_GOOD,
        streamVersion: 5, // Set by event handler
      });

      await em.persistAndFlush(product);

      expect(product.streamVersion).toBe(5);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/Product.test.ts`
Expected: FAIL

**Step 3: Create Product entity**

```typescript
import {
  Entity,
  Property,
  ManyToOne,
  Enum,
  Index,
  Unique,
  type Rel,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Tenant } from './Tenant.js';

export enum ProductStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  RECALLED = 'RECALLED',
}

export enum ProductType {
  FINISHED_GOOD = 'FINISHED_GOOD',
  RAW_MATERIAL = 'RAW_MATERIAL',
  COMPONENT = 'COMPONENT',
  PACKAGING = 'PACKAGING',
}

/**
 * Product: A projection of product aggregate state.
 *
 * This is a read model, updated by event handlers when product events occur.
 * The source of truth is the event store - this is a denormalized view.
 *
 * streamVersion tracks the last event version processed, enabling:
 * - Optimistic concurrency on updates
 * - Detection of stale projections
 */
@Entity({ tableName: 'products' })
@Unique({ properties: ['tenant', 'sku'], name: 'uq_product_sku' })
@Unique({ properties: ['tenant', 'gtin'], name: 'uq_product_gtin' })
export class Product extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'cascade' })
  @Index({ name: 'idx_product_tenant' })
  tenant!: Rel<Tenant>;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'varchar', length: 100, nullable: true })
  internalId?: string | null;

  @Property({ type: 'varchar', length: 100, nullable: true })
  @Index({ name: 'idx_product_sku' })
  sku?: string | null;

  @Property({ type: 'varchar', length: 14, nullable: true })
  @Index({ name: 'idx_product_gtin' })
  gtin?: string | null;

  @Property({ type: 'uuid', nullable: true })
  categoryId?: string | null;

  @Enum(() => ProductType)
  productType!: ProductType;

  @Enum(() => ProductStatus)
  @Index({ name: 'idx_product_status' })
  status: ProductStatus = ProductStatus.DRAFT;

  /**
   * Current version ID (for workspace versioning).
   */
  @Property({ type: 'uuid', nullable: true })
  currentVersionId?: string | null;

  /**
   * Last event version processed for this product.
   * Used for optimistic concurrency in projections.
   */
  @Property({ type: 'bigint', default: 0 })
  streamVersion: number = 0;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/Product.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/Product.ts packages/database/src/entities/Product.test.ts
git commit -m "feat(database): add Product entity as event-sourced projection

Product is a read model (projection) updated by event handlers:
- tenant_id scopes to tenant
- streamVersion tracks event replay position
- SKU and GTIN unique within tenant
- Status lifecycle: DRAFT → ACTIVE → ARCHIVED | RECALLED

Source of truth is events table, not this table.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create Material and MaterialSubstance Entities

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Material.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/MaterialSubstance.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/MaterialSubstance.test.ts`

**Step 1: Write failing test for MaterialSubstance (GSR linkage)**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Tenant } from './Tenant.js';
import { Product, ProductType } from './Product.js';
import { Material, MaterialType } from './Material.js';
import { MaterialSubstance, ConcentrationType } from './MaterialSubstance.js';

describe('MaterialSubstance Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testTenant: Tenant;
  let testProduct: Product;
  let testMaterial: Material;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(MaterialSubstance, {});
    await em.nativeDelete(Material, {});
    await em.nativeDelete(Product, {});
    await em.nativeDelete(Tenant, {});

    testTenant = em.create(Tenant, {
      externalId: 'org_test',
      name: 'Test',
      slug: 'test',
    });
    await em.persistAndFlush(testTenant);

    testProduct = em.create(Product, {
      tenant: testTenant,
      name: 'Test Product',
      productType: ProductType.FINISHED_GOOD,
    });
    await em.persistAndFlush(testProduct);

    testMaterial = em.create(Material, {
      tenant: testTenant,
      name: 'Test Material',
      materialType: MaterialType.CHEMICAL,
      product: testProduct,
    });
    await em.persistAndFlush(testMaterial);

    em.clear();
  });

  describe('GSR linkage', () => {
    it('should_link_to_gsr_substance_with_denormalized_fields', async () => {
      testMaterial = await em.findOneOrFail(Material, { id: testMaterial.id });

      const materialSubstance = em.create(MaterialSubstance, {
        tenant: testTenant,
        material: testMaterial,
        // GSR linkage - cross-database reference
        substanceId: '550e8400-e29b-41d4-a716-446655440000', // UUID from GSR
        inchiKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N',
        substanceName: 'Ethanol',
        casNumber: '64-17-5',
        // Concentration data
        concentration: 5.0,
        concentrationType: ConcentrationType.EXACT,
        // Version pinning
        gsrVersion: '2026.02.03',
      });

      await em.persistAndFlush(materialSubstance);

      expect(materialSubstance.id).toBeDefined();
      expect(materialSubstance.substanceId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(materialSubstance.gsrVersion).toBe('2026.02.03');
    });

    it('should_require_gsr_version_for_compliance_pinning', async () => {
      testMaterial = await em.findOneOrFail(Material, { id: testMaterial.id });

      const materialSubstance = em.create(MaterialSubstance, {
        tenant: testTenant,
        material: testMaterial,
        substanceId: '550e8400-e29b-41d4-a716-446655440000',
        substanceName: 'Test Substance',
        gsrVersion: '2026.02.03', // Required
      });

      await em.persistAndFlush(materialSubstance);

      expect(materialSubstance.gsrVersion).toBeDefined();
    });

    it('should_support_concentration_range_type', async () => {
      testMaterial = await em.findOneOrFail(Material, { id: testMaterial.id });

      const materialSubstance = em.create(MaterialSubstance, {
        tenant: testTenant,
        material: testMaterial,
        substanceId: '550e8400-e29b-41d4-a716-446655440000',
        substanceName: 'Variable Substance',
        concentrationType: ConcentrationType.RANGE,
        concentrationMin: 1.0,
        concentrationMax: 5.0,
        gsrVersion: '2026.02.03',
      });

      await em.persistAndFlush(materialSubstance);

      expect(materialSubstance.concentrationMin).toBe(1.0);
      expect(materialSubstance.concentrationMax).toBe(5.0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/MaterialSubstance.test.ts`
Expected: FAIL

**Step 3: Create Material entity**

```typescript
import {
  Entity,
  Property,
  ManyToOne,
  Enum,
  Index,
  OneToMany,
  Collection,
  type Rel,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Tenant } from './Tenant.js';
import { Product } from './Product.js';
import { MaterialSubstance } from './MaterialSubstance.js';

export enum MaterialType {
  CHEMICAL = 'CHEMICAL',
  POLYMER = 'POLYMER',
  METAL = 'METAL',
  NATURAL = 'NATURAL',
  COMPOSITE = 'COMPOSITE',
  OTHER = 'OTHER',
}

/**
 * Material: A component or ingredient of a product.
 *
 * Materials contain substances (MaterialSubstance).
 * The material → substance relationship enables compliance checking.
 */
@Entity({ tableName: 'materials' })
export class Material extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'cascade' })
  @Index({ name: 'idx_material_tenant' })
  tenant!: Rel<Tenant>;

  @Property({ type: 'text' })
  name!: string;

  @Enum(() => MaterialType)
  materialType!: MaterialType;

  @ManyToOne(() => Product, { nullable: true })
  @Index({ name: 'idx_material_product' })
  product?: Rel<Product> | null;

  @OneToMany(() => MaterialSubstance, (ms) => ms.material)
  substances = new Collection<MaterialSubstance>(this);

  @Property({ type: 'bigint', default: 0 })
  streamVersion: number = 0;
}
```

**Step 4: Create MaterialSubstance entity**

```typescript
import {
  Entity,
  Property,
  ManyToOne,
  Enum,
  Index,
  type Rel,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Tenant } from './Tenant.js';
import { Material } from './Material.js';

export enum ConcentrationType {
  EXACT = 'EXACT',
  RANGE = 'RANGE',
  MAX = 'MAX',
  TRACE = 'TRACE',
}

export enum ConcentrationUnit {
  PERCENT = 'PERCENT',
  PPM = 'PPM',
  MG_KG = 'MG_KG',
  MG_L = 'MG_L',
}

/**
 * MaterialSubstance: Links a material to a GSR substance.
 *
 * This is the critical cross-database linkage:
 * - substanceId references gsr.substance.id
 * - Denormalized fields (inchiKey, substanceName, casNumber) for display/validation
 * - gsrVersion pins the link to a specific GSR snapshot
 *
 * When evaluating compliance, the gsrVersion ensures we use the
 * chemical data that was current at the time of declaration.
 */
@Entity({ tableName: 'material_substances' })
export class MaterialSubstance extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'cascade' })
  @Index({ name: 'idx_mat_sub_tenant' })
  tenant!: Rel<Tenant>;

  @ManyToOne(() => Material, { onDelete: 'cascade' })
  @Index({ name: 'idx_mat_sub_material' })
  material!: Rel<Material>;

  // ═══════════════════════════════════════════════════════════════════════════
  // GSR LINKAGE (Cross-database reference)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * References gsr.substance.id (UUID).
   * This is a cross-database reference - no FK constraint.
   */
  @Property({ type: 'uuid' })
  @Index({ name: 'idx_mat_sub_substance' })
  substanceId!: string;

  /**
   * Denormalized for validation without GSR query.
   */
  @Property({ type: 'varchar', length: 27, nullable: true })
  inchiKey?: string | null;

  /**
   * Denormalized for display.
   */
  @Property({ type: 'text' })
  substanceName!: string;

  /**
   * Denormalized for display.
   */
  @Property({ type: 'varchar', length: 20, nullable: true })
  casNumber?: string | null;

  // ═══════════════════════════════════════════════════════════════════════════
  // CONCENTRATION DATA
  // ═══════════════════════════════════════════════════════════════════════════

  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  concentration?: number | null;

  @Enum(() => ConcentrationUnit)
  concentrationUnit: ConcentrationUnit = ConcentrationUnit.PERCENT;

  @Enum(() => ConcentrationType)
  concentrationType: ConcentrationType = ConcentrationType.EXACT;

  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  concentrationMin?: number | null;

  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  concentrationMax?: number | null;

  @Property({ type: 'boolean', default: false })
  isConfidential: boolean = false;

  // ═══════════════════════════════════════════════════════════════════════════
  // GSR VERSION PINNING (Critical for Compliance)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GSR version when this declaration was made.
   * Enables compliance time-travel: "At declaration time, the GSR said..."
   */
  @Property({ type: 'varchar', length: 20 })
  gsrVersion!: string;
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/MaterialSubstance.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/entities/Material.ts packages/database/src/entities/MaterialSubstance.ts packages/database/src/entities/MaterialSubstance.test.ts
git commit -m "feat(database): add Material and MaterialSubstance for GSR linkage

MaterialSubstance links tenant products to GSR substances:
- substanceId is cross-database reference to gsr.substance
- Denormalized fields (inchiKey, substanceName) for performance
- gsrVersion pins to GSR snapshot for compliance time-travel
- Concentration with type (exact, range, max, trace)

This enables the compliance flow:
Product → Material → MaterialSubstance → GSR.Substance → Rules

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Compliance Evidence Entity

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/ComplianceEvidence.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/ComplianceEvidence.test.ts`

**Step 1: Write failing test for ComplianceEvidence**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Tenant } from './Tenant.js';
import { Product, ProductType } from './Product.js';
import { ComplianceEvidence, EvaluationType, EvidenceStatus } from './ComplianceEvidence.js';
import { createHash } from 'crypto';

describe('ComplianceEvidence Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testTenant: Tenant;
  let testProduct: Product;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(ComplianceEvidence, {});
    await em.nativeDelete(Product, {});
    await em.nativeDelete(Tenant, {});

    testTenant = em.create(Tenant, {
      externalId: 'org_test',
      name: 'Test',
      slug: 'test',
    });
    await em.persistAndFlush(testTenant);

    testProduct = em.create(Product, {
      tenant: testTenant,
      name: 'Test Product',
      productType: ProductType.FINISHED_GOOD,
    });
    await em.persistAndFlush(testProduct);
    em.clear();
  });

  describe('compliance evidence creation', () => {
    it('should_capture_gsr_version_snapshot_when_evaluating', async () => {
      testProduct = await em.findOneOrFail(Product, { id: testProduct.id });

      const evidence = em.create(ComplianceEvidence, {
        tenant: testTenant,
        product: testProduct,
        evaluationType: EvaluationType.FULL,
        status: EvidenceStatus.COMPLIANT,
        gsrVersion: '2026.02.03',
        requirementSnapshot: {
          rules: [
            { code: 'COSING-ANNEX-II', severity: 'BLOCKER' },
          ],
        },
        evaluationResult: {
          passed: true,
          violations: [],
        },
        evaluationHash: createHash('sha256').update('test').digest('hex'),
      });

      await em.persistAndFlush(evidence);

      expect(evidence.id).toBeDefined();
      expect(evidence.gsrVersion).toBe('2026.02.03');
    });

    it('should_store_substance_snapshot_for_audit', async () => {
      testProduct = await em.findOneOrFail(Product, { id: testProduct.id });

      const evidence = em.create(ComplianceEvidence, {
        tenant: testTenant,
        product: testProduct,
        evaluationType: EvaluationType.FULL,
        status: EvidenceStatus.COMPLIANT,
        gsrVersion: '2026.02.03',
        requirementSnapshot: {},
        substanceSnapshot: {
          substances: [
            {
              substanceId: '550e8400-e29b-41d4-a716-446655440000',
              canonicalName: 'Ethanol',
              casNumber: '64-17-5',
              concentration: 5.0,
            },
          ],
        },
        evaluationResult: { passed: true },
        evaluationHash: createHash('sha256').update('test2').digest('hex'),
      });

      await em.persistAndFlush(evidence);

      const loaded = await em.findOneOrFail(ComplianceEvidence, { id: evidence.id });
      expect(loaded.substanceSnapshot?.substances).toHaveLength(1);
    });

    it('should_support_vertical_specific_evaluations', async () => {
      testProduct = await em.findOneOrFail(Product, { id: testProduct.id });

      const evidence = em.create(ComplianceEvidence, {
        tenant: testTenant,
        product: testProduct,
        evaluationType: EvaluationType.VERTICAL,
        verticalId: 'cosmetics',
        status: EvidenceStatus.NON_COMPLIANT,
        gsrVersion: '2026.02.03',
        requirementSnapshot: {},
        evaluationResult: {
          passed: false,
          violations: [
            { ruleCode: 'COSING-ANNEX-II-001', substance: 'Ethanol' },
          ],
        },
        evaluationHash: createHash('sha256').update('test3').digest('hex'),
      });

      await em.persistAndFlush(evidence);

      expect(evidence.verticalId).toBe('cosmetics');
      expect(evidence.status).toBe(EvidenceStatus.NON_COMPLIANT);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/ComplianceEvidence.test.ts`
Expected: FAIL

**Step 3: Create ComplianceEvidence entity**

```typescript
import {
  Entity,
  Property,
  ManyToOne,
  Enum,
  Index,
  type Rel,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Tenant } from './Tenant.js';
import { Product } from './Product.js';
import { User } from './User.js';

export enum EvaluationType {
  FULL = 'FULL',           // All applicable rules
  VERTICAL = 'VERTICAL',   // Single vertical
  RULE = 'RULE',           // Single rule
  SPOT = 'SPOT',           // Quick check
}

export enum EvidenceStatus {
  COMPLIANT = 'COMPLIANT',
  NON_COMPLIANT = 'NON_COMPLIANT',
  PARTIAL = 'PARTIAL',
  ERROR = 'ERROR',
}

/**
 * ComplianceEvidence: Immutable record of a compliance evaluation.
 *
 * This is the "Legal Time Machine" - captures everything needed to
 * reproduce the evaluation at a future date:
 * - GSR version (chemical data as it was)
 * - Requirement snapshot (rules as they were)
 * - Substance snapshot (declared substances as they were)
 * - Evaluation result (the actual decision)
 *
 * The evaluationHash enables integrity verification.
 */
@Entity({ tableName: 'compliance_evidence' })
export class ComplianceEvidence extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'cascade' })
  @Index({ name: 'idx_evidence_tenant' })
  tenant!: Rel<Tenant>;

  @ManyToOne(() => Product)
  @Index({ name: 'idx_evidence_product' })
  product!: Rel<Product>;

  @Property({ type: 'uuid', nullable: true })
  productVersionId?: string | null;

  @Enum(() => EvaluationType)
  evaluationType!: EvaluationType;

  @Property({ type: 'varchar', length: 50, nullable: true })
  verticalId?: string | null;

  @Enum(() => EvidenceStatus)
  @Index({ name: 'idx_evidence_status' })
  status!: EvidenceStatus;

  // ═══════════════════════════════════════════════════════════════════════════
  // SNAPSHOTS (for reproducibility)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rules and requirements as they were at evaluation time.
   */
  @Property({ type: 'jsonb' })
  requirementSnapshot!: Record<string, unknown>;

  /**
   * GSR version used for this evaluation.
   */
  @Property({ type: 'varchar', length: 20 })
  gsrVersion!: string;

  /**
   * Substance declarations as they were at evaluation time.
   */
  @Property({ type: 'jsonb', nullable: true })
  substanceSnapshot?: Record<string, unknown> | null;

  /**
   * The actual evaluation results.
   */
  @Property({ type: 'jsonb' })
  evaluationResult!: Record<string, unknown>;

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT TRAIL
  // ═══════════════════════════════════════════════════════════════════════════

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  @Index({ name: 'idx_evidence_date' })
  evaluatedAt: Date = new Date();

  @ManyToOne(() => User, { nullable: true })
  evaluatedBy?: Rel<User> | null;

  /**
   * SHA256 hash of inputs for integrity verification.
   */
  @Property({ type: 'varchar', length: 64 })
  evaluationHash!: string;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/ComplianceEvidence.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/ComplianceEvidence.ts packages/database/src/entities/ComplianceEvidence.test.ts
git commit -m "feat(database): add ComplianceEvidence for audit trail

ComplianceEvidence is the 'Legal Time Machine':
- gsrVersion pins chemical data snapshot
- requirementSnapshot captures rules at evaluation time
- substanceSnapshot records declared substances
- evaluationHash enables integrity verification

This enables reproducing any compliance decision at a future date
for audits, legal proceedings, or regulatory inquiries.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create Database Migration for Tenant Schema

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/migrations/Migration20260202000000_TenantSchema.ts`

**Step 1: Create migration with all tenant tables**

The migration should create:
- `tenants` (root)
- `users` (tenant-scoped)
- `user_workspace_roles`
- `api_keys`
- `events` (with partitioning)
- `snapshots`
- `products`
- `materials`
- `material_substances`
- `compliance_evidence`

Plus:
- RLS policies on all tenant-scoped tables
- Sequence for events global_position
- Indexes as defined in entities

**Step 2: Create sequence for events**

```sql
CREATE SEQUENCE events_global_position_seq;
```

**Step 3: Create RLS policies**

```sql
-- Enable RLS on tenant-scoped tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_substances ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_evidence ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY tenant_isolation_products ON products
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_materials ON materials
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_mat_sub ON material_substances
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_evidence ON compliance_evidence
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
```

**Step 4: Generate migration from entities**

Run: `cd packages/database && pnpm mikro-orm migration:create`

**Step 5: Verify migration**

Run: `cd packages/database && pnpm mikro-orm migration:up`

**Step 6: Commit**

```bash
git add packages/database/src/migrations/
git commit -m "feat(database): add tenant schema migration with RLS

Creates all tenant-scoped tables:
- tenants (root entity)
- users, user_workspace_roles, api_keys (auth)
- events, snapshots (event sourcing)
- products, materials, material_substances (business)
- compliance_evidence (audit trail)

Row Level Security enforces tenant isolation:
SET app.tenant_id = 'uuid' before queries.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Update Entity Index and Exports

**Files:**
- Modify: `/root/Documents/EuroComply/packages/database/src/entities/index.ts`

**Step 1: Update entities index**

```typescript
// Base
export { BaseEntity } from './BaseEntity.js';

// Tenant root
export { Tenant, TenantTier, TenantStatus, EnforcementMode } from './Tenant.js';

// Auth
export { User } from './User.js';
// export { UserWorkspaceRole } from './UserWorkspaceRole.js';
// export { ApiKey } from './ApiKey.js';

// Event Sourcing
export { Event } from './Event.js';
export { Snapshot } from './Snapshot.js';

// Business Entities (Projections)
export { Product, ProductStatus, ProductType } from './Product.js';
export { Material, MaterialType } from './Material.js';
export { MaterialSubstance, ConcentrationType, ConcentrationUnit } from './MaterialSubstance.js';

// Compliance
export { ComplianceEvidence, EvaluationType, EvidenceStatus } from './ComplianceEvidence.js';

// Entity array for ORM registration
export const tenantEntities = [
  Tenant,
  User,
  Event,
  Snapshot,
  Product,
  Material,
  MaterialSubstance,
  ComplianceEvidence,
];
```

**Step 2: Commit**

```bash
git add packages/database/src/entities/index.ts
git commit -m "chore(database): update entity exports for v2 architecture

Exports all tenant-scoped entities:
- Tenant, User (auth)
- Event, Snapshot (event sourcing)
- Product, Material, MaterialSubstance (business)
- ComplianceEvidence (audit)

tenantEntities array for ORM registration.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Segment 03 Completion Checklist

- [ ] Tenant entity replaces Organization
- [ ] User entity with tenant scope
- [ ] Event and Snapshot entities for event sourcing
- [ ] Product entity as projection
- [ ] Material and MaterialSubstance with GSR linkage
- [ ] ComplianceEvidence for audit trail
- [ ] Database migration with RLS policies
- [ ] Entity index updated
- [ ] All tests pass
- [ ] All commits follow CLAUDE.md format

---

## Next Segment

Proceed to **Segment 04: Neo4j Knowledge Graph**

File: `docs/plans/2026-02-02-v2-implementation-plan-04-neo4j-graph.md`
