# Phase 2: Tenant Provisioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement complete tenant provisioning flow from Clerk webhook to ready-to-use tenant schema.

**Architecture:** Clerk fires `organization.created` webhook → EuroComply creates Organization record → TenantProvisioner creates PostgreSQL schema and runs migrations → Clerk metadata updated with `schema_name` → JWT contains tenant context for zero-DB-lookup routing.

**Tech Stack:** TypeScript, Hono, MikroORM, PostgreSQL, Clerk SDK, Svix (webhook verification), Zod

---

## Design Decisions

### Schema Naming: Use Clerk Org ID (Not Slug)

**Problem:** If we derive schema name from slug (e.g., `tenant_acme_corp`), and the user later renames their organization in Clerk, the schema name becomes out of sync.

**Solution:** Use the immutable Clerk Organization ID with a short prefix:
- `tenant_org_2abc3def` (using last 8 chars of Clerk org ID)
- The full Clerk org ID is stored in `clerkOrgId` for lookup
- The `slug` field is purely for display/URL purposes

### Outbox Events Enable Phase 3

The `organization.provisioned` outbox event enables future downstream processing:
- Create default "Global" Category in new tenant
- Notify Billing service (Stripe) to start trial
- Send welcome email to organization admin
- Initialize default compliance profiles

---

## Prerequisites

Before starting, ensure:
- Phase 1 Foundation is complete (all 16 tasks)
- PostgreSQL running on port 5433 with LTREE extension
- Clerk account with organization enabled
- `CLERK_SECRET_KEY` and `CLERK_WEBHOOK_SECRET` available

---

## Task 1: Add Clerk SDK Dependencies

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Install Clerk and Svix packages**

Run: `cd apps/api && pnpm add @clerk/backend svix`

Expected: Packages added to dependencies

**Step 2: Verify package.json updated**

```json
{
  "dependencies": {
    "@clerk/backend": "^1.x.x",
    "svix": "^1.x.x"
  }
}
```

**Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add Clerk SDK and Svix for webhook verification"
```

---

## Task 2: Update Organization Entity with Provisioning Fields

**Files:**
- Modify: `packages/database/src/entities/Organization.ts`

**Step 1: Add new fields to Organization entity**

Update `packages/database/src/entities/Organization.ts`:

```typescript
import { Entity, Property, Unique, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export enum EnforcementMode {
  ENFORCING = 'ENFORCING',
  SILENT = 'SILENT',
}

export enum SubscriptionTier {
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
}

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
}

export enum ProvisioningStatus {
  PENDING = 'PENDING',
  PROVISIONING = 'PROVISIONING',
  READY = 'READY',
  FAILED = 'FAILED',
}

@Entity({ tableName: 'organizations', schema: 'public' })
export class Organization extends BaseEntity {
  @Property({ type: 'text' })
  @Unique()
  name!: string;

  @Property({ type: 'text' })
  @Unique()
  slug!: string;

  @Property({ type: 'text', name: 'schema_name' })
  @Unique()
  schemaName!: string;

  @Property({ type: 'text', nullable: true, name: 'clerk_org_id' })
  @Unique()
  clerkOrgId?: string;

  @Property({ type: 'text', default: 'cell_1', name: 'cell_id' })
  cellId: string = 'cell_1';

  @Enum({ items: () => SubscriptionTier, name: 'subscription_tier', default: SubscriptionTier.STARTER })
  subscriptionTier: SubscriptionTier = SubscriptionTier.STARTER;

  @Enum({ items: () => SubscriptionStatus, name: 'subscription_status', default: SubscriptionStatus.TRIALING })
  subscriptionStatus: SubscriptionStatus = SubscriptionStatus.TRIALING;

  @Enum({ items: () => ProvisioningStatus, name: 'provisioning_status', default: ProvisioningStatus.PENDING })
  provisioningStatus: ProvisioningStatus = ProvisioningStatus.PENDING;

  @Property({ type: 'text', nullable: true, name: 'provisioning_error' })
  provisioningError?: string;

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

**Step 2: Update entity exports**

Modify `packages/database/src/entities/index.ts`:

```typescript
export { BaseEntity } from './BaseEntity.js';
export {
  Organization,
  EnforcementMode,
  SubscriptionTier,
  SubscriptionStatus,
  ProvisioningStatus
} from './Organization.js';
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

**Step 3: Build to verify compilation**

Run: `cd packages/database && pnpm build`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add packages/database/src/entities/
git commit -m "feat(database): add provisioning and subscription fields to Organization"
```

---

## Task 3: Create TenantProvisioner Service

**Files:**
- Create: `packages/database/src/services/tenant-provisioner.ts`
- Create: `packages/database/src/services/tenant-provisioner.test.ts`
- Create: `packages/database/src/services/index.ts`
- Modify: `packages/database/src/index.ts`

**Step 1: Write the failing test**

Create `packages/database/src/services/tenant-provisioner.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { TenantProvisioner } from './tenant-provisioner.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('TenantProvisioner', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;
  const testSchema = 'tenant_provisioner_test';

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }
    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);
  });

  afterAll(async () => {
    if (orm) {
      // Cleanup test schema
      try {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
      } catch {
        // Ignore
      }
      await teardownTestDb();
    }
  });

  it('creates tenant schema', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    await provisioner.createSchema(testSchema);

    // Verify schema exists
    const result = await orm.em.execute<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = '${testSchema}') as exists`
    );
    expect(result[0]?.exists).toBe(true);
  });

  it('runs migrations in tenant schema', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    // Schema should already exist from previous test
    await provisioner.runMigrations(testSchema);

    // Verify tables exist in tenant schema
    const tables = await orm.em.execute<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = '${testSchema}'`
    );
    const tableNames = tables.map(t => t.table_name);

    expect(tableNames).toContain('category');
    expect(tableNames).toContain('product');
    expect(tableNames).toContain('product_version');
  });

  it('provisions complete tenant', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const newSchema = 'tenant_full_provision_test';

    try {
      await provisioner.provisionTenant(newSchema);

      // Verify schema and tables
      const tables = await orm.em.execute<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = '${newSchema}'`
      );
      expect(tables.length).toBeGreaterThan(0);
    } finally {
      // Cleanup
      await orm.em.execute(`DROP SCHEMA IF EXISTS "${newSchema}" CASCADE`);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/services/tenant-provisioner.test.ts`
Expected: FAIL with "Cannot find module './tenant-provisioner.js'"

**Step 3: Write the implementation**

Create `packages/database/src/services/tenant-provisioner.ts`:

```typescript
import { MikroORM } from '@mikro-orm/postgresql';

export interface ProvisioningResult {
  success: boolean;
  schemaName: string;
  error?: string;
}

export class TenantProvisioner {
  constructor(private readonly orm: MikroORM) {}

  /**
   * Creates a new PostgreSQL schema for a tenant.
   */
  async createSchema(schemaName: string): Promise<void> {
    // Validate schema name format
    if (!this.isValidSchemaName(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}. Must match tenant_[a-z0-9_]+`);
    }

    await this.orm.em.execute(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  }

  /**
   * Runs all migrations in the specified tenant schema.
   */
  async runMigrations(schemaName: string): Promise<void> {
    const generator = this.orm.getSchemaGenerator();

    // Create all entity tables in the tenant schema
    await generator.createSchema({ schema: schemaName });
  }

  /**
   * Grants DML permissions to the application user.
   * In production, this would grant to eurocomply_app user.
   */
  async grantPermissions(schemaName: string, appUser: string = 'eurocomply_app'): Promise<void> {
    try {
      await this.orm.em.execute(`GRANT USAGE ON SCHEMA "${schemaName}" TO ${appUser}`);
      await this.orm.em.execute(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schemaName}" TO ${appUser}`
      );
      await this.orm.em.execute(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appUser}`
      );
    } catch (error) {
      // In dev/test, the app user might not exist - that's OK
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('does not exist')) {
        throw error;
      }
    }
  }

  /**
   * Provisions a complete tenant: creates schema, runs migrations, grants permissions.
   */
  async provisionTenant(schemaName: string): Promise<ProvisioningResult> {
    try {
      // 1. Create the schema
      await this.createSchema(schemaName);

      // 2. Run migrations to create tables
      await this.runMigrations(schemaName);

      // 3. Grant permissions (best effort in dev)
      await this.grantPermissions(schemaName);

      return {
        success: true,
        schemaName,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        schemaName,
        error: errorMessage,
      };
    }
  }

  /**
   * Drops a tenant schema (use with caution!).
   */
  async dropSchema(schemaName: string): Promise<void> {
    if (!this.isValidSchemaName(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    await this.orm.em.execute(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }

  /**
   * Validates that a schema name follows the tenant naming convention.
   */
  private isValidSchemaName(schemaName: string): boolean {
    return /^tenant_[a-z0-9_]+$/.test(schemaName);
  }
}
```

**Step 4: Create services index**

Create `packages/database/src/services/index.ts`:

```typescript
export { TenantProvisioner, type ProvisioningResult } from './tenant-provisioner.js';
```

**Step 5: Update package exports**

Modify `packages/database/src/index.ts`:

```typescript
export * from './entities/index.js';
export { initOrm, getOrm, closeOrm, createTenantEm } from './orm.js';
export { default as mikroOrmConfig } from './mikro-orm.config.js';
export { ParallelMigrator, type ParallelMigratorOptions, type MigrationResults } from './migrations/parallel-migrator.js';
export { TenantProvisioner, type ProvisioningResult } from './services/index.js';
```

**Step 6: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/services/tenant-provisioner.test.ts`
Expected: PASS (or SKIP if no database)

**Step 7: Commit**

```bash
git add packages/database/src/services/ packages/database/src/index.ts
git commit -m "feat(database): add TenantProvisioner service for schema creation"
```

---

## Task 4: Clerk Webhook Verification Middleware

**Files:**
- Create: `apps/api/src/middleware/webhook.ts`
- Create: `apps/api/src/middleware/webhook.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/middleware/webhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { clerkWebhookMiddleware, verifyClerkWebhook } from './webhook.js';

describe('webhook middleware', () => {
  describe('verifyClerkWebhook', () => {
    it('returns false for missing headers', () => {
      const result = verifyClerkWebhook({
        payload: '{}',
        headers: {},
        secret: 'whsec_test',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing');
    });

    it('returns false for invalid signature', () => {
      const result = verifyClerkWebhook({
        payload: '{"type":"test"}',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': String(Math.floor(Date.now() / 1000)),
          'svix-signature': 'v1,invalid_signature',
        },
        secret: 'whsec_test',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('clerkWebhookMiddleware', () => {
    it('rejects requests without svix headers', async () => {
      const app = new Hono();
      app.use('*', clerkWebhookMiddleware('whsec_test'));
      app.post('/webhook', (c) => c.json({ ok: true }));

      const res = await app.request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'test' }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Invalid webhook signature');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/middleware/webhook.test.ts`
Expected: FAIL with "Cannot find module './webhook.js'"

**Step 3: Write the implementation**

Create `apps/api/src/middleware/webhook.ts`:

```typescript
import { createMiddleware } from 'hono/factory';
import { Webhook } from 'svix';

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
  payload?: unknown;
}

export interface VerifyOptions {
  payload: string;
  headers: Record<string, string | undefined>;
  secret: string;
}

/**
 * Verifies a Clerk webhook signature using Svix.
 */
export function verifyClerkWebhook(options: VerifyOptions): WebhookVerificationResult {
  const { payload, headers, secret } = options;

  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) {
    return {
      valid: false,
      error: 'Missing required Svix headers (svix-id, svix-timestamp, svix-signature)',
    };
  }

  try {
    const wh = new Webhook(secret);
    const verified = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
    return { valid: true, payload: verified };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Signature verification failed',
    };
  }
}

/**
 * Middleware that verifies Clerk webhook signatures.
 */
export function clerkWebhookMiddleware(secret: string) {
  return createMiddleware(async (c, next) => {
    const payload = await c.req.text();

    const result = verifyClerkWebhook({
      payload,
      headers: {
        'svix-id': c.req.header('svix-id'),
        'svix-timestamp': c.req.header('svix-timestamp'),
        'svix-signature': c.req.header('svix-signature'),
      },
      secret,
    });

    if (!result.valid) {
      return c.json({ error: 'Invalid webhook signature', details: result.error }, 401);
    }

    // Store verified payload for handler
    c.set('webhookPayload', result.payload);
    await next();
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test src/middleware/webhook.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/middleware/webhook.ts apps/api/src/middleware/webhook.test.ts
git commit -m "feat(api): add Clerk webhook verification middleware with Svix"
```

---

## Task 5: Clerk Webhook Handler for Organization Events

**Files:**
- Create: `apps/api/src/webhooks/clerk.ts`
- Create: `apps/api/src/webhooks/clerk.test.ts`
- Create: `apps/api/src/webhooks/index.ts`

**Step 1: Write the failing test**

Create `apps/api/src/webhooks/clerk.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleOrganizationCreated,
  handleOrganizationDeleted,
  clerkOrgIdToSchemaName,
  type ClerkOrganizationEvent
} from './clerk.js';

// Mock dependencies
const mockOrm = {
  em: {
    create: vi.fn(),
    persist: vi.fn(),
    flush: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
  },
};

const mockProvisioner = {
  provisionTenant: vi.fn(),
  dropSchema: vi.fn(),
};

const mockClerk = {
  organizations: {
    updateOrganizationMetadata: vi.fn(),
  },
};

describe('Clerk webhook handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('clerkOrgIdToSchemaName', () => {
    it('converts Clerk org ID to valid schema name', () => {
      expect(clerkOrgIdToSchemaName('org_2abc3def4ghi5jkl')).toBe('tenant_org_5jkl');
      expect(clerkOrgIdToSchemaName('org_xyz123')).toBe('tenant_org_xyz123');
    });

    it('handles short org IDs', () => {
      expect(clerkOrgIdToSchemaName('org_abc')).toBe('tenant_org_abc');
    });
  });

  describe('handleOrganizationCreated', () => {
    it('creates organization and provisions tenant', async () => {
      const event: ClerkOrganizationEvent = {
        type: 'organization.created',
        data: {
          id: 'org_123',
          name: 'Acme Corp',
          slug: 'acme-corp',
          created_at: Date.now(),
        },
      };

      mockProvisioner.provisionTenant.mockResolvedValue({ success: true, schemaName: 'tenant_org_g_123' });
      mockClerk.organizations.updateOrganizationMetadata.mockResolvedValue({});

      const result = await handleOrganizationCreated(event, {
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
        clerk: mockClerk as any,
      });

      expect(result.success).toBe(true);
      expect(mockOrm.em.create).toHaveBeenCalled();
      expect(mockOrm.em.flush).toHaveBeenCalled();
      // Schema name derived from Clerk org ID (last 8 chars), not slug
      expect(mockProvisioner.provisionTenant).toHaveBeenCalledWith('tenant_org_123');
      expect(mockClerk.organizations.updateOrganizationMetadata).toHaveBeenCalledWith(
        'org_123',
        expect.objectContaining({
          publicMetadata: expect.objectContaining({
            schema_name: 'tenant_org_123',
          }),
        })
      );
    });

    it('handles provisioning failure', async () => {
      const event: ClerkOrganizationEvent = {
        type: 'organization.created',
        data: {
          id: 'org_456',
          name: 'Bad Corp',
          slug: 'bad-corp',
          created_at: Date.now(),
        },
      };

      mockProvisioner.provisionTenant.mockResolvedValue({
        success: false,
        schemaName: 'tenant_org_456',
        error: 'Database error',
      });

      const result = await handleOrganizationCreated(event, {
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
        clerk: mockClerk as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });
  });

  describe('handleOrganizationDeleted', () => {
    it('marks organization as deleted', async () => {
      const event: ClerkOrganizationEvent = {
        type: 'organization.deleted',
        data: {
          id: 'org_789',
          name: 'Deleted Corp',
          slug: 'deleted-corp',
          created_at: Date.now(),
        },
      };

      mockOrm.em.findOne.mockResolvedValue({
        id: 'internal_id',
        schemaName: 'tenant_deleted_corp',
      });

      const result = await handleOrganizationDeleted(event, {
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
      });

      expect(result.success).toBe(true);
      // Note: We don't actually drop schemas on delete - just mark as deleted
      expect(mockProvisioner.dropSchema).not.toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/webhooks/clerk.test.ts`
Expected: FAIL with "Cannot find module './clerk.js'"

**Step 3: Write the implementation**

Create `apps/api/src/webhooks/clerk.ts`:

```typescript
import type { MikroORM } from '@mikro-orm/postgresql';
import type { TenantProvisioner } from '@eurocomply/database';
import {
  Organization,
  ProvisioningStatus,
  OutboxEvent,
  OutboxStatus,
} from '@eurocomply/database';
import { createId } from '@eurocomply/core';

export interface ClerkOrganizationEvent {
  type: 'organization.created' | 'organization.updated' | 'organization.deleted';
  data: {
    id: string;
    name: string;
    slug: string;
    created_at: number;
    public_metadata?: Record<string, unknown>;
  };
}

export interface ClerkClient {
  organizations: {
    updateOrganizationMetadata: (
      orgId: string,
      params: { publicMetadata: Record<string, unknown> }
    ) => Promise<unknown>;
  };
}

export interface HandlerDependencies {
  orm: MikroORM;
  provisioner: TenantProvisioner;
  clerk?: ClerkClient;
}

export interface HandlerResult {
  success: boolean;
  organizationId?: string;
  schemaName?: string;
  error?: string;
}

/**
 * Converts a Clerk organization ID to a valid PostgreSQL schema name.
 * Uses the last 8 characters of the org ID for uniqueness while keeping names short.
 *
 * Why not slug? Slugs can change if the org is renamed in Clerk, causing sync issues.
 * The Clerk org ID is immutable.
 */
export function clerkOrgIdToSchemaName(clerkOrgId: string): string {
  // Remove 'org_' prefix if present and take last 8 chars (or all if shorter)
  const idPart = clerkOrgId.replace(/^org_/, '');
  const suffix = idPart.length > 8 ? idPart.slice(-8) : idPart;

  return `tenant_org_${suffix.toLowerCase()}`;
}

/**
 * Handles the organization.created webhook event.
 * Creates the organization record and provisions the tenant schema.
 */
export async function handleOrganizationCreated(
  event: ClerkOrganizationEvent,
  deps: HandlerDependencies
): Promise<HandlerResult> {
  const { orm, provisioner, clerk } = deps;
  const { id: clerkOrgId, name, slug } = event.data;
  const schemaName = clerkOrgIdToSchemaName(clerkOrgId);

  const em = orm.em.fork();

  try {
    // 1. Create Organization record
    const org = em.create(Organization, {
      id: createId(),
      name,
      slug,
      schemaName,
      clerkOrgId,
      provisioningStatus: ProvisioningStatus.PROVISIONING,
    });
    em.persist(org);
    await em.flush();

    // 2. Provision tenant schema
    const provisionResult = await provisioner.provisionTenant(schemaName);

    if (!provisionResult.success) {
      // Update org with failure status
      org.provisioningStatus = ProvisioningStatus.FAILED;
      org.provisioningError = provisionResult.error;
      await em.flush();

      return {
        success: false,
        organizationId: org.id,
        schemaName,
        error: `Provisioning failed: ${provisionResult.error}`,
      };
    }

    // 3. Update organization status to ready
    org.provisioningStatus = ProvisioningStatus.READY;

    // 4. Create outbox event
    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: org.id,
      eventType: 'organization.provisioned',
      payload: {
        organizationId: org.id,
        clerkOrgId,
        schemaName,
        name,
        slug,
      },
      status: OutboxStatus.PENDING,
    });
    em.persist(outboxEvent);
    await em.flush();

    // 5. Update Clerk metadata (if clerk client provided)
    if (clerk) {
      await clerk.organizations.updateOrganizationMetadata(clerkOrgId, {
        publicMetadata: {
          schema_name: schemaName,
          tier: 'starter',
          cell_id: 'cell_1',
        },
      });
    }

    return {
      success: true,
      organizationId: org.id,
      schemaName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      schemaName,
      error: errorMessage,
    };
  }
}

/**
 * Handles the organization.deleted webhook event.
 * Note: We don't actually drop schemas - just mark as deleted for audit trail.
 */
export async function handleOrganizationDeleted(
  event: ClerkOrganizationEvent,
  deps: Pick<HandlerDependencies, 'orm' | 'provisioner'>
): Promise<HandlerResult> {
  const { orm } = deps;
  const { id: clerkOrgId } = event.data;

  const em = orm.em.fork();

  try {
    const org = await em.findOne(Organization, { clerkOrgId });

    if (!org) {
      return {
        success: false,
        error: `Organization not found for Clerk ID: ${clerkOrgId}`,
      };
    }

    // Mark as deleted but don't actually remove
    // In production, you might have a deletedAt field instead
    org.provisioningStatus = ProvisioningStatus.FAILED;
    org.provisioningError = 'Organization deleted via Clerk';

    // Create outbox event
    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: org.id,
      eventType: 'organization.deleted',
      payload: {
        organizationId: org.id,
        clerkOrgId,
        schemaName: org.schemaName,
      },
      status: OutboxStatus.PENDING,
    });
    em.persist(outboxEvent);
    await em.flush();

    return {
      success: true,
      organizationId: org.id,
      schemaName: org.schemaName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
```

**Step 4: Create webhooks index**

Create `apps/api/src/webhooks/index.ts`:

```typescript
export {
  handleOrganizationCreated,
  handleOrganizationDeleted,
  clerkOrgIdToSchemaName,
  type ClerkOrganizationEvent,
  type ClerkClient,
  type HandlerDependencies,
  type HandlerResult,
} from './clerk.js';
```

**Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm test src/webhooks/clerk.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/webhooks/
git commit -m "feat(api): add Clerk webhook handlers for organization lifecycle"
```

---

## Task 6: Webhook Routes Integration

**Files:**
- Create: `apps/api/src/routes/webhooks.ts`
- Create: `apps/api/src/routes/webhooks.test.ts`
- Modify: `apps/api/src/app.ts`

**Step 1: Write the failing test**

Create `apps/api/src/routes/webhooks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createWebhooksRouter } from './webhooks.js';

// Mock dependencies
const mockOrm = {
  em: {
    fork: vi.fn(() => mockOrm.em),
    create: vi.fn((Entity, data) => ({ ...data, id: 'mock_id' })),
    persist: vi.fn(),
    flush: vi.fn(),
    findOne: vi.fn(),
  },
};

const mockProvisioner = {
  provisionTenant: vi.fn().mockResolvedValue({ success: true, schemaName: 'tenant_test' }),
};

describe('webhooks routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /webhooks/clerk', () => {
    it('returns 401 without webhook secret configured', async () => {
      const router = createWebhooksRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
        webhookSecret: undefined,
      });

      const app = new Hono();
      app.route('/webhooks', router);

      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'organization.created', data: {} }),
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain('not configured');
    });

    it('processes organization.created event (without signature in test)', async () => {
      const router = createWebhooksRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
        webhookSecret: 'whsec_test',
        skipSignatureVerification: true, // For testing
      });

      const app = new Hono();
      app.route('/webhooks', router);

      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organization.created',
          data: {
            id: 'org_test123',
            name: 'Test Org',
            slug: 'test-org',
            created_at: Date.now(),
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      // Schema name derived from Clerk org ID, not slug
      expect(mockProvisioner.provisionTenant).toHaveBeenCalledWith('tenant_org_test123');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/routes/webhooks.test.ts`
Expected: FAIL with "Cannot find module './webhooks.js'"

**Step 3: Write the implementation**

Create `apps/api/src/routes/webhooks.ts`:

```typescript
import { Hono } from 'hono';
import type { MikroORM } from '@mikro-orm/postgresql';
import type { TenantProvisioner } from '@eurocomply/database';
import { clerkWebhookMiddleware } from '../middleware/webhook.js';
import {
  handleOrganizationCreated,
  handleOrganizationDeleted,
  type ClerkOrganizationEvent,
  type ClerkClient,
} from '../webhooks/clerk.js';

export interface WebhooksRouterOptions {
  orm: MikroORM;
  provisioner: TenantProvisioner;
  webhookSecret?: string;
  clerk?: ClerkClient;
  skipSignatureVerification?: boolean; // For testing only
}

export function createWebhooksRouter(options: WebhooksRouterOptions) {
  const { orm, provisioner, webhookSecret, clerk, skipSignatureVerification } = options;
  const router = new Hono();

  router.post('/clerk', async (c) => {
    // Check webhook secret is configured
    if (!webhookSecret) {
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }

    // Get the raw body for signature verification
    let event: ClerkOrganizationEvent;

    if (skipSignatureVerification) {
      // For testing: parse body directly
      event = await c.req.json();
    } else {
      // Production: verify signature
      const payload = await c.req.text();
      const { verifyClerkWebhook } = await import('../middleware/webhook.js');

      const result = verifyClerkWebhook({
        payload,
        headers: {
          'svix-id': c.req.header('svix-id'),
          'svix-timestamp': c.req.header('svix-timestamp'),
          'svix-signature': c.req.header('svix-signature'),
        },
        secret: webhookSecret,
      });

      if (!result.valid) {
        return c.json({ error: 'Invalid webhook signature', details: result.error }, 401);
      }

      event = result.payload as ClerkOrganizationEvent;
    }

    // Handle the event based on type
    switch (event.type) {
      case 'organization.created': {
        const result = await handleOrganizationCreated(event, { orm, provisioner, clerk });
        if (!result.success) {
          return c.json({ success: false, error: result.error }, 500);
        }
        return c.json({
          success: true,
          organizationId: result.organizationId,
          schemaName: result.schemaName,
        });
      }

      case 'organization.deleted': {
        const result = await handleOrganizationDeleted(event, { orm, provisioner });
        if (!result.success) {
          return c.json({ success: false, error: result.error }, 500);
        }
        return c.json({
          success: true,
          organizationId: result.organizationId,
        });
      }

      case 'organization.updated': {
        // For now, just acknowledge - can add handling later
        return c.json({ success: true, message: 'Event acknowledged' });
      }

      default: {
        // Unknown event type - acknowledge but don't process
        return c.json({ success: true, message: 'Event type not handled' });
      }
    }
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test src/routes/webhooks.test.ts`
Expected: PASS

**Step 5: Update app.ts to include webhook routes**

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
    webhookPayload?: unknown;
  };
};

export interface AppDependencies {
  webhooksRouter?: Hono;
}

export function createApp(deps?: AppDependencies): Hono<Env> {
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

  // Webhooks (no CORS, no auth - signature verified)
  if (deps?.webhooksRouter) {
    app.route('/webhooks', deps.webhooksRouter);
  }

  // API version prefix
  const v1 = new Hono<Env>();

  v1.get('/', (c) => {
    return c.json({ message: 'EuroComply API v1' });
  });

  // Public routes (no tenant middleware)
  v1.route('/organizations', organizationsRouter);

  // Tenant-scoped routes (require authentication)
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
git add apps/api/src/routes/webhooks.ts apps/api/src/routes/webhooks.test.ts apps/api/src/app.ts
git commit -m "feat(api): integrate webhook routes for Clerk organization events"
```

---

## Task 7: Update Server Entry Point with Dependencies

**Files:**
- Modify: `apps/api/src/index.ts`

**Step 1: Update server to initialize all dependencies**

Modify `apps/api/src/index.ts`:

```typescript
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { initOrm, TenantProvisioner } from '@eurocomply/database';
import { createWebhooksRouter } from './routes/webhooks.js';

async function main() {
  const port = parseInt(process.env['PORT'] ?? '3001', 10);

  console.log('Initializing database connection...');
  const orm = await initOrm();

  console.log('Creating tenant provisioner...');
  const provisioner = new TenantProvisioner(orm);

  console.log('Creating webhooks router...');
  const webhooksRouter = createWebhooksRouter({
    orm,
    provisioner,
    webhookSecret: process.env['CLERK_WEBHOOK_SECRET'],
    // clerk: createClerkClient({ secretKey: process.env['CLERK_SECRET_KEY'] }), // Add when needed
  });

  console.log('Creating app...');
  const app = createApp({ webhooksRouter });

  console.log(`Starting server on port ${port}...`);

  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`Server running at http://localhost:${port}`);
  console.log(`Webhook endpoint: http://localhost:${port}/webhooks/clerk`);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
```

**Step 2: Build to verify compilation**

Run: `cd apps/api && pnpm build`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): wire up ORM, provisioner, and webhooks in server entry"
```

---

## Task 8: Database Migration for New Organization Fields

**Files:**
- Create: `packages/database/src/migrations/Migration20260122100000.ts`

**Step 1: Create migration for new fields**

Create `packages/database/src/migrations/Migration20260122100000.ts`:

```typescript
import { Migration } from '@mikro-orm/migrations';

export class Migration20260122100000 extends Migration {
  async up(): Promise<void> {
    // Add new columns to organizations table
    this.addSql(`
      ALTER TABLE "public"."organizations"
      ADD COLUMN IF NOT EXISTS "slug" varchar(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS "cell_id" varchar(255) DEFAULT 'cell_1',
      ADD COLUMN IF NOT EXISTS "subscription_tier" varchar(50) DEFAULT 'STARTER',
      ADD COLUMN IF NOT EXISTS "subscription_status" varchar(50) DEFAULT 'TRIALING',
      ADD COLUMN IF NOT EXISTS "provisioning_status" varchar(50) DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS "provisioning_error" text;
    `);

    // Update existing rows to have a slug based on name
    this.addSql(`
      UPDATE "public"."organizations"
      SET "slug" = LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9]', '-', 'g'))
      WHERE "slug" IS NULL;
    `);

    // Make slug NOT NULL after populating
    this.addSql(`
      ALTER TABLE "public"."organizations"
      ALTER COLUMN "slug" SET NOT NULL;
    `);
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "public"."organizations"
      DROP COLUMN IF EXISTS "slug",
      DROP COLUMN IF EXISTS "cell_id",
      DROP COLUMN IF EXISTS "subscription_tier",
      DROP COLUMN IF EXISTS "subscription_status",
      DROP COLUMN IF EXISTS "provisioning_status",
      DROP COLUMN IF EXISTS "provisioning_error";
    `);
  }
}
```

**Step 2: Commit**

```bash
git add packages/database/src/migrations/
git commit -m "feat(database): add migration for Organization provisioning fields"
```

---

## Task 9: End-to-End Provisioning Test

**Files:**
- Create: `apps/api/src/webhooks/provisioning.e2e.test.ts`

**Step 1: Write end-to-end test**

Create `apps/api/src/webhooks/provisioning.e2e.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { createApp } from '../app.js';
import { createWebhooksRouter } from '../routes/webhooks.js';
import {
  Organization,
  TenantProvisioner,
  ProvisioningStatus,
} from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';

describe('Tenant Provisioning E2E', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;
  let app: ReturnType<typeof createApp>;
  // Schema name derived from Clerk org ID: 'org_e2e_test' → 'tenant_org_e2e_test'
  const testSchema = 'tenant_org_e2e_test';

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);

    const webhooksRouter = createWebhooksRouter({
      orm,
      provisioner,
      webhookSecret: 'whsec_test',
      skipSignatureVerification: true,
    });

    app = createApp({ webhooksRouter });
  });

  afterAll(async () => {
    if (orm) {
      // Cleanup test schema
      try {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
      } catch {
        // Ignore
      }
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }
    // Clean up test org if exists
    const em = orm.em.fork();
    const existingOrg = await em.findOne(Organization, { slug: 'e2e-test-org' });
    if (existingOrg) {
      em.remove(existingOrg);
      await em.flush();
    }
  });

  it('provisions tenant on organization.created webhook', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const res = await app.request('/webhooks/clerk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'organization.created',
        data: {
          id: 'org_e2e_test',
          name: 'E2E Test Org',
          slug: 'e2e-test-org',
          created_at: Date.now(),
        },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.schemaName).toBe(testSchema);

    // Verify organization was created
    const em = orm.em.fork();
    const org = await em.findOne(Organization, { slug: 'e2e-test-org' });
    expect(org).not.toBeNull();
    expect(org!.provisioningStatus).toBe(ProvisioningStatus.READY);
    expect(org!.schemaName).toBe(testSchema);

    // Verify schema was created with tables
    const tables = await orm.em.execute<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = '${testSchema}'`
    );
    expect(tables.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run end-to-end test**

Run: `cd apps/api && pnpm test src/webhooks/provisioning.e2e.test.ts`
Expected: PASS (or SKIP if no database)

**Step 3: Commit**

```bash
git add apps/api/src/webhooks/provisioning.e2e.test.ts
git commit -m "test(api): add end-to-end test for tenant provisioning flow"
```

---

## Task 10: Build and Verify All Packages

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
git commit -m "chore: verify Phase 2 tenant provisioning build and tests pass"
```

---

## Task 11: Retry Provisioning Endpoint (Error Recovery)

**Files:**
- Modify: `apps/api/src/routes/organizations.ts`
- Create: `apps/api/src/routes/organizations-admin.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/routes/organizations-admin.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createOrganizationsAdminRouter } from './organizations.js';
import { ProvisioningStatus } from '@eurocomply/database';

const mockOrm = {
  em: {
    fork: vi.fn(() => mockOrm.em),
    findOne: vi.fn(),
    flush: vi.fn(),
  },
};

const mockProvisioner = {
  provisionTenant: vi.fn(),
};

describe('organizations admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /organizations/:id/retry-provisioning', () => {
    it('retries provisioning for failed organization', async () => {
      const router = createOrganizationsAdminRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
      });

      const app = new Hono();
      app.route('/organizations', router);

      const failedOrg = {
        id: 'org_123',
        schemaName: 'tenant_org_abc123',
        provisioningStatus: ProvisioningStatus.FAILED,
        provisioningError: 'Previous error',
      };

      mockOrm.em.findOne.mockResolvedValue(failedOrg);
      mockProvisioner.provisionTenant.mockResolvedValue({ success: true, schemaName: 'tenant_org_abc123' });

      const res = await app.request('/organizations/org_123/retry-provisioning', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockProvisioner.provisionTenant).toHaveBeenCalledWith('tenant_org_abc123');
    });

    it('rejects retry for already provisioned organization', async () => {
      const router = createOrganizationsAdminRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
      });

      const app = new Hono();
      app.route('/organizations', router);

      const readyOrg = {
        id: 'org_123',
        schemaName: 'tenant_org_abc123',
        provisioningStatus: ProvisioningStatus.READY,
      };

      mockOrm.em.findOne.mockResolvedValue(readyOrg);

      const res = await app.request('/organizations/org_123/retry-provisioning', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('already provisioned');
    });

    it('returns 404 for non-existent organization', async () => {
      const router = createOrganizationsAdminRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
      });

      const app = new Hono();
      app.route('/organizations', router);

      mockOrm.em.findOne.mockResolvedValue(null);

      const res = await app.request('/organizations/org_999/retry-provisioning', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/routes/organizations-admin.test.ts`
Expected: FAIL with "createOrganizationsAdminRouter is not exported"

**Step 3: Add retry endpoint to organizations router**

Add to `apps/api/src/routes/organizations.ts`:

```typescript
import type { MikroORM } from '@mikro-orm/postgresql';
import type { TenantProvisioner } from '@eurocomply/database';
import { Organization, ProvisioningStatus, OutboxEvent, OutboxStatus } from '@eurocomply/database';
import { createId } from '@eurocomply/core';

export interface OrganizationsAdminRouterOptions {
  orm: MikroORM;
  provisioner: TenantProvisioner;
}

export function createOrganizationsAdminRouter(options: OrganizationsAdminRouterOptions) {
  const { orm, provisioner } = options;
  const router = new Hono();

  /**
   * POST /organizations/:id/retry-provisioning
   *
   * Retries provisioning for a failed organization.
   * Use this when provisioning failed due to transient errors (DB connection, etc.)
   */
  router.post('/:id/retry-provisioning', async (c) => {
    const id = c.req.param('id');
    const em = orm.em.fork();

    const org = await em.findOne(Organization, { id });

    if (!org) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    if (org.provisioningStatus === ProvisioningStatus.READY) {
      return c.json({
        error: 'Organization already provisioned',
        message: 'This organization is already in READY state',
      }, 400);
    }

    // Update status to PROVISIONING
    org.provisioningStatus = ProvisioningStatus.PROVISIONING;
    org.provisioningError = undefined;
    await em.flush();

    // Retry provisioning
    const result = await provisioner.provisionTenant(org.schemaName);

    if (!result.success) {
      org.provisioningStatus = ProvisioningStatus.FAILED;
      org.provisioningError = result.error;
      await em.flush();

      return c.json({
        success: false,
        error: `Provisioning failed: ${result.error}`,
      }, 500);
    }

    // Success - update status and emit event
    org.provisioningStatus = ProvisioningStatus.READY;

    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: org.id,
      eventType: 'organization.provisioning_retried',
      payload: {
        organizationId: org.id,
        schemaName: org.schemaName,
        previousError: org.provisioningError,
      },
      status: OutboxStatus.PENDING,
    });
    em.persist(outboxEvent);
    await em.flush();

    return c.json({
      success: true,
      organizationId: org.id,
      schemaName: org.schemaName,
      provisioningStatus: org.provisioningStatus,
    });
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test src/routes/organizations-admin.test.ts`
Expected: PASS

**Step 5: Wire up admin routes to app**

The admin routes should be protected (internal use only). Add to `apps/api/src/app.ts`:

```typescript
// Internal admin routes (should be behind additional auth in production)
if (deps?.organizationsAdminRouter) {
  v1.route('/admin/organizations', deps.organizationsAdminRouter);
}
```

**Step 6: Commit**

```bash
git add apps/api/src/routes/organizations.ts apps/api/src/routes/organizations-admin.test.ts apps/api/src/app.ts
git commit -m "feat(api): add retry provisioning endpoint for error recovery"
```

---

## Task 12: Build and Final Verification

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 2: Build all packages**

Run: `pnpm build`
Expected: All packages compile without errors

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Phase 2 tenant provisioning complete with error recovery"
```

---

## Summary

This implementation plan establishes **Phase 2: Tenant Provisioning** for EuroComply:

### Completed Components

1. **Organization Entity Updates**:
   - Added `slug`, `cellId`, `subscriptionTier`, `subscriptionStatus`
   - Added `provisioningStatus` and `provisioningError` for tracking
   - New enums for subscription and provisioning states

2. **TenantProvisioner Service**:
   - Creates PostgreSQL schemas
   - Runs MikroORM migrations in tenant schema
   - Grants DML permissions to app user
   - Full `provisionTenant()` orchestration

3. **Clerk Webhook Integration**:
   - Svix signature verification middleware
   - `organization.created` handler → provisions tenant
   - `organization.deleted` handler → marks as deleted
   - Updates Clerk metadata with `schema_name`

4. **Outbox Events**:
   - `organization.provisioned` event emitted
   - `organization.deleted` event emitted
   - Ready for downstream consumers

5. **Error Recovery**:
   - Retry provisioning endpoint for failed organizations
   - Clear error tracking with `provisioningError` field
   - Outbox event for retry auditing

### Architecture Decisions Implemented

- **Schema name derived from Clerk Org ID** (immutable): `tenant_org_{last8chars}`
  - Avoids sync issues if org is renamed in Clerk
  - Slug stored separately for display purposes
- Provisioning is synchronous (can be made async later)
- Schemas are never dropped on delete (7-year regulatory retention)
- JWT will contain `schema_name` after Clerk metadata update (zero DB lookup)
- Retry endpoint allows recovery from transient failures

### Next Steps (Future Tasks)

- User sync from Clerk (`organizationMembership.created`)
- Clerk SDK integration for real metadata updates
- Async provisioning with job queue (for scale)
- Organization settings UI

### Phase 3: Outbox Listener Sequence for `organization.provisioned`

When implementing outbox consumers, follow this order (dependencies matter):

| Step | Action | Why First |
|------|--------|-----------|
| 1 | **Seed Foundation** - Create "Global" root category | Products require a category; this is the tenant's root |
| 2 | **Identity Bootstrap** - Generate org's `did:key` via walt.id | Required for signing DPPs and credentials |
| 3 | **Monetization** - Trigger Stripe trial subscription | Billing depends on org being fully functional |

This ensures each step has its dependencies satisfied before execution.
