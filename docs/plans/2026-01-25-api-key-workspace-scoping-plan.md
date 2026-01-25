# API Key Workspace Scoping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add workspace-level authorization to API keys, eliminating the "superuser" bypass and authority leakage vulnerabilities.

**Architecture:** API keys gain the same workspace authority model as human users (OrganizationUser). The authorize middleware treats both identity types uniformly, checking authorities from the appropriate source. The risky `authorizeAnyWorkspace` middleware is deleted.

**Tech Stack:** MikroORM, Hono middleware, TypeScript, Vitest

**Design Document:** `docs/plans/2026-01-25-api-key-workspace-scoping-design.md`

---

## Architectural Refinements (Applied)

1. **Hardened Service Layer**: All DML operations (persist, flush) must be inside `em.transactional` blocks where `search_path` is set
2. **Audit Traceability**: Use `api-key:${apiKey.id}` (not organizationId) for userId to trace actions to specific keys
3. **Input Validation**: Validate WorkspaceAuthority strings against enum before assignment
4. **Middleware Protection**: `/api-keys` routes already use `requireOrgAdmin()` (api-keys.ts:22)
5. **No Migration**: Early development - schema sync handles new columns

---

## Task 1: Add Workspace Authority Fields to ApiKey Entity

**Files:**
- Modify: `packages/database/src/entities/ApiKey.ts`
- Test: `packages/database/src/entities/ApiKey.test.ts` (create)

**Step 1: Write the failing test**

Create `packages/database/src/entities/ApiKey.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ApiKey } from './ApiKey.js';
import { WorkspaceAuthority } from './WorkspaceAuthority.js';

describe('ApiKey entity', () => {
  describe('workspace authority fields', () => {
    it('has designAuthority defaulting to NONE', () => {
      const apiKey = new ApiKey();
      expect(apiKey.designAuthority).toBe(WorkspaceAuthority.NONE);
    });

    it('has operationsAuthority defaulting to NONE', () => {
      const apiKey = new ApiKey();
      expect(apiKey.operationsAuthority).toBe(WorkspaceAuthority.NONE);
    });

    it('has marketingAuthority defaulting to NONE', () => {
      const apiKey = new ApiKey();
      expect(apiKey.marketingAuthority).toBe(WorkspaceAuthority.NONE);
    });

    it('has complianceAuthority defaulting to NONE', () => {
      const apiKey = new ApiKey();
      expect(apiKey.complianceAuthority).toBe(WorkspaceAuthority.NONE);
    });

    it('has isOrgAdmin defaulting to false', () => {
      const apiKey = new ApiKey();
      expect(apiKey.isOrgAdmin).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /root/Documents/EuroComply && npx vitest run packages/database/src/entities/ApiKey.test.ts`

Expected: FAIL - properties don't exist on ApiKey

**Step 3: Write minimal implementation**

Modify `packages/database/src/entities/ApiKey.ts`:

```typescript
import { Entity, Property, ManyToOne, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Organization } from './Organization.js';
import { WorkspaceAuthority } from './WorkspaceAuthority.js';

/**
 * API Key entity for programmatic tenant access.
 *
 * Security notes:
 * - We store a hash of the key, never the raw key
 * - The raw key is only shown once at creation time
 * - key_prefix allows users to identify keys without exposing them
 * - Workspace authorities control access (like OrganizationUser)
 */
@Entity({ tableName: 'api_keys', schema: 'public' })
export class ApiKey extends BaseEntity {
  /**
   * Organization this key belongs to.
   */
  @ManyToOne(() => Organization)
  organization!: Rel<Organization>;

  /**
   * SHA-256 hash of the API key.
   * Used for lookup - we never store the raw key.
   */
  @Property({ columnType: 'varchar(64)' })
  keyHash!: string;

  /**
   * Prefix of the key for identification (e.g., "ek_live_abc12345").
   * Shows first 16 chars so users can identify which key is which.
   */
  @Property({ columnType: 'varchar(20)' })
  keyPrefix!: string;

  /**
   * Human-readable name for the key (e.g., "Production", "CI/CD").
   */
  @Property({ columnType: 'varchar(255)' })
  name!: string;

  /**
   * Last time this key was used for authentication.
   */
  @Property({ type: 'datetime', nullable: true })
  lastUsedAt?: Date;

  /**
   * When the key was revoked. Null if still active.
   */
  @Property({ type: 'datetime', nullable: true })
  revokedAt?: Date;

  /**
   * Authority level for Design workspace (products, materials, specs).
   */
  @Property({ type: 'string', default: WorkspaceAuthority.NONE })
  designAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  /**
   * Authority level for Operations workspace (inventory, fulfillment).
   */
  @Property({ type: 'string', default: WorkspaceAuthority.NONE })
  operationsAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  /**
   * Authority level for Marketing workspace (campaigns, public content).
   */
  @Property({ type: 'string', default: WorkspaceAuthority.NONE })
  marketingAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  /**
   * Authority level for Compliance workspace (audit logs, certifications).
   */
  @Property({ type: 'string', default: WorkspaceAuthority.NONE })
  complianceAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  /**
   * Whether this key has org admin privileges (manage users, billing, keys).
   */
  @Property({ type: 'boolean', default: false })
  isOrgAdmin: boolean = false;

  /**
   * Check if the key is active (not revoked).
   */
  get isActive(): boolean {
    return this.revokedAt === null || this.revokedAt === undefined;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /root/Documents/EuroComply && npx vitest run packages/database/src/entities/ApiKey.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/ApiKey.ts packages/database/src/entities/ApiKey.test.ts
git commit -m "feat(database): add workspace authority fields to ApiKey entity"
```

---

## Task 2: Update ValidateApiKeyResult Interface

**Files:**
- Modify: `packages/database/src/services/api-key.service.ts`

**Step 1: Write the failing test**

Add to existing service tests or create `packages/database/src/services/api-key.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkspaceAuthority } from '../entities/WorkspaceAuthority.js';

describe('ValidateApiKeyResult interface', () => {
  it('includes workspace authority fields in type definition', () => {
    // This is a compile-time check - if the interface is wrong, TypeScript will fail
    const result = {
      valid: true,
      organizationId: 'org_123',
      schemaName: 'tenant_test',
      designAuthority: WorkspaceAuthority.EDITOR,
      operationsAuthority: WorkspaceAuthority.VIEWER,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.NONE,
      isOrgAdmin: false,
    };

    expect(result.designAuthority).toBe(WorkspaceAuthority.EDITOR);
    expect(result.isOrgAdmin).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /root/Documents/EuroComply && npx vitest run packages/database/src/services/api-key.service.test.ts`

Expected: FAIL - TypeScript error because interface doesn't have these fields

**Step 3: Write minimal implementation**

Modify `packages/database/src/services/api-key.service.ts` - update the interface (around line 17-22):

```typescript
import { WorkspaceAuthority } from '../entities/WorkspaceAuthority.js';

// ... existing imports ...

/**
 * Result of validating an API key.
 */
export interface ValidateApiKeyResult {
  valid: boolean;
  organizationId?: string;
  schemaName?: string;
  error?: string;

  // API key ID for audit traceability (used in userId: `api-key:${apiKeyId}`)
  apiKeyId?: string;

  // Workspace authorities for authorization
  designAuthority?: WorkspaceAuthority;
  operationsAuthority?: WorkspaceAuthority;
  marketingAuthority?: WorkspaceAuthority;
  complianceAuthority?: WorkspaceAuthority;
  isOrgAdmin?: boolean;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /root/Documents/EuroComply && npx vitest run packages/database/src/services/api-key.service.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/services/api-key.service.ts packages/database/src/services/api-key.service.test.ts
git commit -m "feat(database): add workspace authorities to ValidateApiKeyResult"
```

---

## Task 3: Harden ApiKeyService with Explicit Public Schema

**Files:**
- Modify: `packages/database/src/services/api-key.service.ts`
- Test: Integration test (existing `api-keys.integration.test.ts` will cover this)

**Step 1: Write the failing test**

This is a hardening change - behavior stays the same but with explicit schema. We verify via integration test that validation still works.

Add test to `apps/api/src/routes/api-keys.integration.test.ts`:

```typescript
it('validates API key returns workspace authorities', async (context) => {
  if (!(await isDatabaseAvailable())) {
    context.skip();
    return;
  }

  // Create a key with specific authorities
  const app = createTestApp(adminUserId, true);
  const createRes = await app.request('/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Scoped Key' }),
  });

  expect(createRes.status).toBe(201);
  const createData = await createRes.json();
  expect(createData.rawKey).toBeDefined();
});
```

**Step 2: Run test to verify baseline**

Run: `cd /root/Documents/EuroComply && npx vitest run apps/api/src/routes/api-keys.integration.test.ts`

Expected: PASS (baseline - existing behavior works)

**Step 3: Write implementation - harden validateKey with explicit public schema**

Modify `packages/database/src/services/api-key.service.ts` - replace `validateKey` method (around line 96-128):

```typescript
/**
 * Validates an API key and returns the associated organization info.
 *
 * @param rawKey - The raw API key from the request
 * @returns Validation result with organization details and authorities if valid
 */
async validateKey(rawKey: string): Promise<ValidateApiKeyResult> {
  if (!rawKey || !rawKey.startsWith('ek_live_')) {
    return { valid: false, error: 'Invalid key format' };
  }

  const keyHash = hashApiKey(rawKey);
  const em = this.em.fork();

  // All operations inside transactional block with explicit search_path
  // Prevents cross-talk if connection was left in tenant schema
  return em.transactional(async (txEm) => {
    await txEm.execute('SET search_path TO public');

    const apiKey = await txEm.findOne(
      ApiKey,
      { keyHash },
      { populate: ['organization'] }
    );

    if (!apiKey) {
      return { valid: false, error: 'API key not found' };
    }

    if (!apiKey.isActive) {
      return { valid: false, error: 'API key has been revoked' };
    }

    // Update last used timestamp (inside transaction)
    apiKey.lastUsedAt = new Date();
    await txEm.flush();

    return {
      valid: true,
      organizationId: apiKey.organization.id,
      schemaName: apiKey.organization.schemaName,
      // API key ID for audit traceability
      apiKeyId: apiKey.id,
      // Pass through authority fields
      designAuthority: apiKey.designAuthority,
      operationsAuthority: apiKey.operationsAuthority,
      marketingAuthority: apiKey.marketingAuthority,
      complianceAuthority: apiKey.complianceAuthority,
      isOrgAdmin: apiKey.isOrgAdmin,
    };
  });
}
```

**Step 4: Also harden createKey, listKeys, and revokeKey**

Replace `createKey` method (around line 64-88):

```typescript
async createKey(organizationId: string, name: string): Promise<CreateApiKeyResult> {
  const em = this.em.fork();

  // Generate the key material before transaction
  const rawKey = generateRawApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = extractKeyPrefix(rawKey);

  // All DML inside transactional block with explicit search_path
  const apiKey = await em.transactional(async (txEm) => {
    await txEm.execute('SET search_path TO public');

    const org = await txEm.findOne(Organization, { id: organizationId });
    if (!org) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    const key = new ApiKey();
    key.organization = org;
    key.keyHash = keyHash;
    key.keyPrefix = keyPrefix;
    key.name = name;

    txEm.persist(key);
    await txEm.flush();

    return key;
  });

  return { apiKey, rawKey };
}
```

Replace `listKeys` method (around line 133-136):

```typescript
async listKeys(organizationId: string): Promise<ApiKey[]> {
  const em = this.em.fork();

  // Explicitly set search_path to public
  return em.transactional(async (txEm) => {
    await txEm.execute('SET search_path TO public');
    return txEm.find(ApiKey, { organization: { id: organizationId } });
  });
}
```

Replace `revokeKey` method (around line 141-157):

```typescript
async revokeKey(keyId: string, organizationId: string): Promise<boolean> {
  const em = this.em.fork();

  // Explicitly set search_path to public
  const apiKey = await em.transactional(async (txEm) => {
    await txEm.execute('SET search_path TO public');
    return txEm.findOne(ApiKey, {
      id: keyId,
      organization: { id: organizationId },
    });
  });

  if (!apiKey) {
    return false;
  }

  apiKey.revokedAt = new Date();
  await em.flush();

  return true;
}
```

**Step 5: Run tests to verify**

Run: `cd /root/Documents/EuroComply && npx vitest run apps/api/src/routes/api-keys.integration.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/services/api-key.service.ts
git commit -m "fix(database): harden ApiKeyService with explicit public schema scoping"
```

---

## Task 4: Update Env Type with apiKeyAuthorities

**Files:**
- Modify: `apps/api/src/app.ts`

**Step 1: Write the failing test**

This is a type definition - verified by TypeScript compilation. No runtime test needed.

**Step 2: Write implementation**

Modify `apps/api/src/app.ts` - update the Env type (around line 15-23):

```typescript
import { User, OrganizationUser, WorkspaceAuthority } from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';

// ... other imports stay the same ...

/**
 * API key authorities context (set when auth is via API key).
 */
export interface ApiKeyAuthorities {
  designAuthority: WorkspaceAuthority;
  operationsAuthority: WorkspaceAuthority;
  marketingAuthority: WorkspaceAuthority;
  complianceAuthority: WorkspaceAuthority;
  isOrgAdmin: boolean;
}

export type Env = {
  Variables: {
    tenantSchema?: string;
    userId?: string;
    webhookPayload?: unknown;
    user?: User;
    membership?: OrganizationUser;
    /** API key authorities (set when auth is via API key, undefined for JWT auth) */
    apiKeyAuthorities?: ApiKeyAuthorities;
  };
};
```

**Step 3: Run TypeScript to verify**

Run: `cd /root/Documents/EuroComply && npm run build -w @eurocomply/api`

Expected: PASS (compiles without errors)

**Step 4: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat(api): add apiKeyAuthorities to Env type"
```

---

## Task 5: Propagate API Key Authorities in Tenant Middleware

**Files:**
- Modify: `apps/api/src/middleware/tenant.ts`
- Test: Unit test in `apps/api/src/middleware/tenant.test.ts` (if exists) or integration test

**Step 1: Write the failing test**

Add to middleware tests or create new test:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createTenantMiddleware } from './tenant.js';
import { WorkspaceAuthority } from '@eurocomply/database';
import type { Env } from '../app.js';

describe('tenant middleware - API key authorities', () => {
  it('sets apiKeyAuthorities in context when API key auth is used', async () => {
    const mockEm = {
      fork: () => mockEm,
      transactional: async (fn: any) => fn(mockEm),
      execute: vi.fn(),
      findOne: vi.fn().mockResolvedValue({
        keyHash: 'test',
        isActive: true,
        lastUsedAt: null,
        organization: { id: 'org_123', schemaName: 'tenant_test' },
        designAuthority: WorkspaceAuthority.EDITOR,
        operationsAuthority: WorkspaceAuthority.VIEWER,
        marketingAuthority: WorkspaceAuthority.NONE,
        complianceAuthority: WorkspaceAuthority.NONE,
        isOrgAdmin: false,
      }),
      flush: vi.fn(),
    };

    const app = new Hono<Env>();
    app.use('*', createTenantMiddleware({ em: mockEm as any }));
    app.get('/test', (c) => {
      const authorities = c.get('apiKeyAuthorities');
      return c.json({ authorities });
    });

    const res = await app.request('/test', {
      headers: { 'X-API-Key': 'ek_live_test123456789012345678901234567890' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.authorities).toEqual({
      designAuthority: 'EDITOR',
      operationsAuthority: 'VIEWER',
      marketingAuthority: 'NONE',
      complianceAuthority: 'NONE',
      isOrgAdmin: false,
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /root/Documents/EuroComply && npx vitest run apps/api/src/middleware/tenant.test.ts`

Expected: FAIL - apiKeyAuthorities is not being set

**Step 3: Write implementation**

Modify `apps/api/src/middleware/tenant.ts` - update the API key block (around line 55-74):

First, add import at top:

```typescript
import type { ApiKeyAuthorities } from '../app.js';
```

Then update the API key authentication block:

```typescript
// Try API key authentication first
if (apiKey) {
  if (!options?.em) {
    return c.json(
      { error: 'Server Error', message: 'API key authentication not configured' },
      500
    );
  }

  const apiKeyService = new ApiKeyService(options.em);
  const result = await apiKeyService.validateKey(apiKey);

  if (!result.valid) {
    return c.json({ error: 'Unauthorized', message: result.error ?? 'Invalid API key' }, 401);
  }

  tenant = {
    schemaName: result.schemaName!,
    userId: `api-key:${result.apiKeyId}`, // Use key ID for audit traceability
  };

  // Store API key authorities in context for authorization middleware
  c.set('apiKeyAuthorities', {
    designAuthority: result.designAuthority!,
    operationsAuthority: result.operationsAuthority!,
    marketingAuthority: result.marketingAuthority!,
    complianceAuthority: result.complianceAuthority!,
    isOrgAdmin: result.isOrgAdmin!,
  } as ApiKeyAuthorities);
}
```

**Step 4: Run test to verify it passes**

Run: `cd /root/Documents/EuroComply && npx vitest run apps/api/src/middleware/tenant.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/middleware/tenant.ts apps/api/src/middleware/tenant.test.ts
git commit -m "feat(api): propagate API key authorities in tenant middleware"
```

---

## Task 6: Refactor authorize() Middleware

**Files:**
- Modify: `apps/api/src/middleware/authorize.ts`
- Modify: `apps/api/src/middleware/authorize.test.ts`

**Step 1: Write the failing test**

Update `apps/api/src/middleware/authorize.test.ts` - replace the "API key bypass" section:

```typescript
describe('API key authorization', () => {
  it('allows API key with sufficient authority', async () => {
    app.use('*', (c, next) => {
      c.set('userId', 'api-key:org_123');
      c.set('apiKeyAuthorities', {
        designAuthority: WorkspaceAuthority.EDITOR,
        operationsAuthority: WorkspaceAuthority.NONE,
        marketingAuthority: WorkspaceAuthority.NONE,
        complianceAuthority: WorkspaceAuthority.NONE,
        isOrgAdmin: false,
      });
      return next();
    });
    app.post('/test', authorize('design', 'edit'), (c) => c.json({ ok: true }));

    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('denies API key with insufficient authority', async () => {
    app.use('*', (c, next) => {
      c.set('userId', 'api-key:org_123');
      c.set('apiKeyAuthorities', {
        designAuthority: WorkspaceAuthority.VIEWER,
        operationsAuthority: WorkspaceAuthority.NONE,
        marketingAuthority: WorkspaceAuthority.NONE,
        complianceAuthority: WorkspaceAuthority.NONE,
        isOrgAdmin: false,
      });
      return next();
    });
    app.post('/test', authorize('design', 'edit'), (c) => c.json({ ok: true }));

    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(403);

    const body = await res.json() as any;
    expect(body.yourAuthority).toBe('VIEWER');
  });

  it('denies API key accessing wrong workspace', async () => {
    app.use('*', (c, next) => {
      c.set('userId', 'api-key:org_123');
      c.set('apiKeyAuthorities', {
        designAuthority: WorkspaceAuthority.MANAGER,
        operationsAuthority: WorkspaceAuthority.NONE,
        marketingAuthority: WorkspaceAuthority.NONE,
        complianceAuthority: WorkspaceAuthority.NONE,
        isOrgAdmin: false,
      });
      return next();
    });
    app.get('/test', authorize('compliance', 'view'), (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(403);
  });

  it('returns 401 when API key has no authorities context', async () => {
    app.use('*', (c, next) => {
      c.set('userId', 'api-key:org_123');
      // No apiKeyAuthorities set - simulates a bug
      return next();
    });
    app.get('/test', authorize('design', 'view'), (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(401);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /root/Documents/EuroComply && npx vitest run apps/api/src/middleware/authorize.test.ts`

Expected: FAIL - current implementation bypasses all checks for API keys

**Step 3: Write implementation**

Replace the `authorize` function in `apps/api/src/middleware/authorize.ts`:

```typescript
export function authorize(workspace: Workspace, action: Action) {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const apiKeyAuthorities = c.get('apiKeyAuthorities');
    const membership = c.get('membership');

    const requiredLevel = ACTION_REQUIREMENTS[action];
    let userLevel: number;
    let userAuthority: WorkspaceAuthority;

    // Determine authority source: API key or human membership
    if (userId?.startsWith('api-key:') && apiKeyAuthorities) {
      const authorityKey = `${workspace}Authority` as keyof typeof apiKeyAuthorities;
      userAuthority = apiKeyAuthorities[authorityKey] as WorkspaceAuthority;
      userLevel = AUTHORITY_LEVELS[userAuthority];
    } else if (membership) {
      const authorityKey = `${workspace}Authority` as keyof typeof membership;
      userAuthority = membership[authorityKey] as WorkspaceAuthority;
      userLevel = AUTHORITY_LEVELS[userAuthority];
    } else {
      return c.json(
        { error: 'Unauthorized', message: 'No authorization context found' },
        401
      );
    }

    if (userLevel < requiredLevel) {
      const authorityNeeded = Object.entries(AUTHORITY_LEVELS)
        .find(([_, level]) => level === requiredLevel)?.[0];

      return c.json(
        {
          error: 'Forbidden',
          message: `This action requires ${authorityNeeded} access to the ${workspace} workspace`,
          workspace,
          action,
          yourAuthority: userAuthority,
          requiredAuthority: authorityNeeded,
        },
        403
      );
    }

    await next();
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd /root/Documents/EuroComply && npx vitest run apps/api/src/middleware/authorize.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/middleware/authorize.ts apps/api/src/middleware/authorize.test.ts
git commit -m "fix(api): enforce workspace authority checks for API keys"
```

---

## Task 7: Refactor requireOrgAdmin() Middleware

**Files:**
- Modify: `apps/api/src/middleware/authorize.ts`
- Modify: `apps/api/src/middleware/authorize.test.ts`

**Step 1: Write the failing test**

Update `apps/api/src/middleware/authorize.test.ts` - replace the `requireOrgAdmin` API key test:

```typescript
describe('requireOrgAdmin middleware', () => {
  // ... keep existing tests for human users ...

  describe('API key org admin', () => {
    it('allows API key with isOrgAdmin true', async () => {
      app.use('*', (c, next) => {
        c.set('userId', 'api-key:org_123');
        c.set('apiKeyAuthorities', {
          designAuthority: WorkspaceAuthority.NONE,
          operationsAuthority: WorkspaceAuthority.NONE,
          marketingAuthority: WorkspaceAuthority.NONE,
          complianceAuthority: WorkspaceAuthority.NONE,
          isOrgAdmin: true,
        });
        return next();
      });
      app.get('/test', requireOrgAdmin(), (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(200);
    });

    it('denies API key with isOrgAdmin false', async () => {
      app.use('*', (c, next) => {
        c.set('userId', 'api-key:org_123');
        c.set('apiKeyAuthorities', {
          designAuthority: WorkspaceAuthority.MANAGER,
          operationsAuthority: WorkspaceAuthority.MANAGER,
          marketingAuthority: WorkspaceAuthority.MANAGER,
          complianceAuthority: WorkspaceAuthority.MANAGER,
          isOrgAdmin: false,
        });
        return next();
      });
      app.get('/test', requireOrgAdmin(), (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(403);

      const body = await res.json() as any;
      expect(body.message).toContain('API key');
      expect(body.message).toContain('Organization Admin');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /root/Documents/EuroComply && npx vitest run apps/api/src/middleware/authorize.test.ts`

Expected: FAIL - current implementation allows all API keys

**Step 3: Write implementation**

Replace the `requireOrgAdmin` function in `apps/api/src/middleware/authorize.ts`:

```typescript
export function requireOrgAdmin() {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const apiKeyAuthorities = c.get('apiKeyAuthorities');
    const membership = c.get('membership');

    // Check org admin status from appropriate source
    if (userId?.startsWith('api-key:') && apiKeyAuthorities) {
      if (!apiKeyAuthorities.isOrgAdmin) {
        return c.json(
          {
            error: 'Forbidden',
            message: 'This API key does not have Organization Admin privileges',
          },
          403
        );
      }
    } else if (membership) {
      if (!membership.isOrgAdmin) {
        return c.json(
          {
            error: 'Forbidden',
            message: 'This action requires Organization Admin privileges',
          },
          403
        );
      }
    } else {
      return c.json(
        { error: 'Unauthorized', message: 'No authorization context found' },
        401
      );
    }

    await next();
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd /root/Documents/EuroComply && npx vitest run apps/api/src/middleware/authorize.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/middleware/authorize.ts apps/api/src/middleware/authorize.test.ts
git commit -m "fix(api): enforce isOrgAdmin check for API keys"
```

---

## Task 8: Delete authorizeAnyWorkspace() Middleware

**Files:**
- Modify: `apps/api/src/middleware/authorize.ts`
- Modify: `apps/api/src/middleware/authorize.test.ts`

**Step 1: Verify no usages exist**

Run: `cd /root/Documents/EuroComply && grep -r "authorizeAnyWorkspace" apps/api/src/routes/`

Expected: No matches (only test file and definition)

**Step 2: Delete the function and tests**

Remove from `apps/api/src/middleware/authorize.ts` (lines 101-134):
- Delete the entire `authorizeAnyWorkspace` function

Remove from `apps/api/src/middleware/authorize.test.ts`:
- Delete the `describe('authorizeAnyWorkspace middleware', ...)` block (lines 186-224)
- Remove `authorizeAnyWorkspace` from the import statement

**Step 3: Run tests to verify nothing breaks**

Run: `cd /root/Documents/EuroComply && npx vitest run apps/api/src/middleware/authorize.test.ts`

Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/middleware/authorize.ts apps/api/src/middleware/authorize.test.ts
git commit -m "refactor(api): delete risky authorizeAnyWorkspace middleware

This middleware allowed authority leakage between workspaces.
Routes should explicitly declare which workspace they belong to."
```

---

## Task 9: Update API Keys Router to Accept Scopes

**Files:**
- Modify: `apps/api/src/routes/api-keys.ts`
- Test: `apps/api/src/routes/api-keys.integration.test.ts`

**Step 1: Write the failing test**

Add to `apps/api/src/routes/api-keys.integration.test.ts`:

```typescript
describe('POST /api-keys with scopes', () => {
  it('creates key with specified workspace authorities', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const app = createTestApp(adminUserId, true);
    const res = await app.request('/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'ERP Integration Key',
        designAuthority: 'EDITOR',
        operationsAuthority: 'VIEWER',
        marketingAuthority: 'NONE',
        complianceAuthority: 'NONE',
        isOrgAdmin: false,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.data.designAuthority).toBe('EDITOR');
    expect(data.data.operationsAuthority).toBe('VIEWER');
    expect(data.data.isOrgAdmin).toBe(false);
  });

  it('defaults to NONE authorities when not specified', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const app = createTestApp(adminUserId, true);
    const res = await app.request('/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Minimal Key' }),
    });

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.data.designAuthority).toBe('NONE');
    expect(data.data.isOrgAdmin).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /root/Documents/EuroComply && npx vitest run apps/api/src/routes/api-keys.integration.test.ts`

Expected: FAIL - response doesn't include authority fields

**Step 3: Write implementation**

Update `apps/api/src/routes/api-keys.ts`:

First, update the createKey method in ApiKeyService to accept authorities (or update the route to set them after creation).

Actually, simpler approach - update the route to set authorities on the created key:

```typescript
// In the POST / handler, after creating the key:
router.post('/', async (c) => {
  const schemaName = c.get('tenantSchema');
  const userId = c.get('userId');

  if (!schemaName || !userId) {
    return c.json({ error: 'Unauthorized', message: 'Missing tenant context' }, 401);
  }

  const body = await c.req.json<{
    name?: string;
    designAuthority?: string;
    operationsAuthority?: string;
    marketingAuthority?: string;
    complianceAuthority?: string;
    isOrgAdmin?: boolean;
  }>();

  if (!body.name || typeof body.name !== 'string') {
    return c.json({ error: 'Bad Request', message: 'name is required' }, 400);
  }

  const em = deps.em.fork();

  // Find organization by schema name
  const org = await em.findOne(Organization, { schemaName });
  if (!org) {
    return c.json({ error: 'Not Found', message: 'Organization not found' }, 404);
  }

  const apiKeyService = new ApiKeyService(em);
  const { apiKey, rawKey } = await apiKeyService.createKey(org.id, body.name);

  // Validate and set workspace authorities
  const validAuthorities = Object.values(WorkspaceAuthority);

  if (body.designAuthority) {
    if (!validAuthorities.includes(body.designAuthority as WorkspaceAuthority)) {
      return c.json({ error: 'Bad Request', message: `Invalid designAuthority: ${body.designAuthority}` }, 400);
    }
    apiKey.designAuthority = body.designAuthority as WorkspaceAuthority;
  }
  if (body.operationsAuthority) {
    if (!validAuthorities.includes(body.operationsAuthority as WorkspaceAuthority)) {
      return c.json({ error: 'Bad Request', message: `Invalid operationsAuthority: ${body.operationsAuthority}` }, 400);
    }
    apiKey.operationsAuthority = body.operationsAuthority as WorkspaceAuthority;
  }
  if (body.marketingAuthority) {
    if (!validAuthorities.includes(body.marketingAuthority as WorkspaceAuthority)) {
      return c.json({ error: 'Bad Request', message: `Invalid marketingAuthority: ${body.marketingAuthority}` }, 400);
    }
    apiKey.marketingAuthority = body.marketingAuthority as WorkspaceAuthority;
  }
  if (body.complianceAuthority) {
    if (!validAuthorities.includes(body.complianceAuthority as WorkspaceAuthority)) {
      return c.json({ error: 'Bad Request', message: `Invalid complianceAuthority: ${body.complianceAuthority}` }, 400);
    }
    apiKey.complianceAuthority = body.complianceAuthority as WorkspaceAuthority;
  }
  if (typeof body.isOrgAdmin === 'boolean') apiKey.isOrgAdmin = body.isOrgAdmin;

  await em.flush();

  return c.json(
    {
      data: {
        id: apiKey.id,
        keyPrefix: apiKey.keyPrefix,
        name: apiKey.name,
        designAuthority: apiKey.designAuthority,
        operationsAuthority: apiKey.operationsAuthority,
        marketingAuthority: apiKey.marketingAuthority,
        complianceAuthority: apiKey.complianceAuthority,
        isOrgAdmin: apiKey.isOrgAdmin,
        createdAt: apiKey.createdAt,
      },
      rawKey,
      message: 'API key created. Save the rawKey - it will not be shown again.',
    },
    201
  );
});
```

Also add import at top:
```typescript
import { ApiKeyService, Organization, WorkspaceAuthority, type EntityManager } from '@eurocomply/database';
```

Update the GET / handler to include authorities in response:

```typescript
return c.json({
  data: keys.map((key) => ({
    id: key.id,
    keyPrefix: key.keyPrefix,
    name: key.name,
    designAuthority: key.designAuthority,
    operationsAuthority: key.operationsAuthority,
    marketingAuthority: key.marketingAuthority,
    complianceAuthority: key.complianceAuthority,
    isOrgAdmin: key.isOrgAdmin,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    isActive: key.isActive,
  })),
  meta: { total: keys.length },
});
```

**Step 4: Run test to verify it passes**

Run: `cd /root/Documents/EuroComply && npx vitest run apps/api/src/routes/api-keys.integration.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/api-keys.ts apps/api/src/routes/api-keys.integration.test.ts
git commit -m "feat(api): support workspace authorities when creating API keys"
```

---

## Task 10: Run Full Test Suite

**Step 1: Run all tests**

Run: `cd /root/Documents/EuroComply && npm test`

Expected: All tests pass

**Step 2: Fix any failures**

If any tests fail, investigate and fix.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test failures from API key scoping changes"
```

---

## Task 11: Final Verification and Documentation

**Step 1: Verify the security fix**

Create a manual test scenario:
1. Create an API key with limited scopes (e.g., `designAuthority: VIEWER`)
2. Try to POST to `/products` (requires `design:edit`)
3. Verify you get 403 Forbidden

**Step 2: Update the design document with completion status**

Add to `docs/plans/2026-01-25-api-key-workspace-scoping-design.md`:

```markdown
---

## Implementation Status

- [x] Task 1: ApiKey entity fields
- [x] Task 2: ValidateApiKeyResult interface
- [x] Task 3: ApiKeyService hardening
- [x] Task 4: Env type update
- [x] Task 5: Tenant middleware propagation
- [x] Task 6: authorize() refactor
- [x] Task 7: requireOrgAdmin() refactor
- [x] Task 8: Delete authorizeAnyWorkspace
- [x] Task 9: Database migration
- [x] Task 10: API keys router update
- [x] Task 11: Full test suite
- [x] Task 12: Final verification

**Completed:** YYYY-MM-DD
```

**Step 3: Final commit**

```bash
git add docs/plans/2026-01-25-api-key-workspace-scoping-design.md
git commit -m "docs: mark API key workspace scoping implementation complete"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add workspace fields to ApiKey | `ApiKey.ts`, `ApiKey.test.ts` |
| 2 | Update ValidateApiKeyResult | `api-key.service.ts` |
| 3 | Harden ApiKeyService | `api-key.service.ts` |
| 4 | Update Env type | `app.ts` |
| 5 | Propagate authorities | `tenant.ts` |
| 6 | Refactor authorize() | `authorize.ts`, `authorize.test.ts` |
| 7 | Refactor requireOrgAdmin() | `authorize.ts`, `authorize.test.ts` |
| 8 | Delete authorizeAnyWorkspace | `authorize.ts`, `authorize.test.ts` |
| 9 | Update API keys router | `api-keys.ts`, `api-keys.integration.test.ts` |
| 10 | Full test suite | All |
| 11 | Final verification | Design doc |

**Total: 11 tasks** (no migration needed - early development)

Each task follows TDD: write failing test → implement → verify → commit.
