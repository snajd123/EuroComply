# User Auth Plan B: Middleware

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create userMiddleware and authorization middleware (authorize, requireOrgAdmin, authorizeAnyWorkspace).

**Architecture:** Add two new middleware files to apps/api/src/middleware. userMiddleware looks up User from database and attaches to context. authorize() checks workspace authority levels.

**Tech Stack:** Hono, MikroORM, TypeScript

**Prerequisites:** Plan A complete (User, OrganizationUser entities exist).

**Reference:** See `docs/plans/2026-01-23-user-auth-authorization-design.md` Section 4.

---

## Task 1: Update Env Types

**Files:**
- Modify: `apps/api/src/app.ts`

**Step 1: Read current Env type**

Run: `grep -A 10 "export type Env" apps/api/src/app.ts`

**Step 2: Add user and membership to Variables**

Update the Env type to include:

```typescript
export type Env = {
  Variables: {
    tenantSchema?: string;
    userId?: string;
    webhookPayload?: unknown;
    // Add these:
    user?: User;
    membership?: OrganizationUser;
  };
};
```

Add imports at top of file:
```typescript
import { User, OrganizationUser } from '@eurocomply/database';
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm --filter @eurocomply/api typecheck`
Expected: No errors (may have warnings about unused imports until middleware uses them)

**Step 4: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat(api): add user and membership to Env Variables type"
```

---

## Task 2: Create authorize() Middleware - Tests

**Files:**
- Create: `apps/api/src/middleware/authorize.test.ts`

**Step 1: Write comprehensive tests**

```typescript
// apps/api/src/middleware/authorize.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { WorkspaceAuthority } from '@eurocomply/database';
import { authorize, requireOrgAdmin, authorizeAnyWorkspace } from './authorize.js';
import type { Env } from '../app.js';

describe('authorize middleware', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = new Hono<Env>();
  });

  describe('workspace authority checks', () => {
    it('allows VIEWER to view', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.VIEWER,
        } as any);
        return next();
      });
      app.get('/test', authorize('design', 'view'), (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(200);
    });

    it('denies VIEWER from editing', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.VIEWER,
        } as any);
        return next();
      });
      app.post('/test', authorize('design', 'edit'), (c) => c.json({ ok: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.yourAuthority).toBe('VIEWER');
      expect(body.requiredAuthority).toBe('CONTRIBUTOR');
    });

    it('denies NONE from viewing', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.NONE,
        } as any);
        return next();
      });
      app.get('/test', authorize('design', 'view'), (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(403);
    });

    it('allows CONTRIBUTOR to edit', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.CONTRIBUTOR,
        } as any);
        return next();
      });
      app.post('/test', authorize('design', 'edit'), (c) => c.json({ ok: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('allows EDITOR to approve', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.EDITOR,
        } as any);
        return next();
      });
      app.post('/test', authorize('design', 'approve'), (c) => c.json({ ok: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('allows MANAGER to manage', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.MANAGER,
        } as any);
        return next();
      });
      app.post('/test', authorize('design', 'manage'), (c) => c.json({ ok: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('checks correct workspace - denies cross-workspace', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.MANAGER,
          complianceAuthority: WorkspaceAuthority.NONE,
        } as any);
        return next();
      });
      app.get('/test', authorize('compliance', 'view'), (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(403);
    });
  });

  describe('API key bypass', () => {
    it('allows API key to skip authority check', async () => {
      app.use('*', (c, next) => {
        c.set('userId', 'api-key:org_123');
        c.set('membership', undefined);
        return next();
      });
      app.post('/test', authorize('design', 'manage'), (c) => c.json({ ok: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });
  });

  describe('missing membership', () => {
    it('returns 401 when membership is missing', async () => {
      app.use('*', (c, next) => {
        c.set('userId', 'user_123');
        c.set('membership', undefined);
        return next();
      });
      app.get('/test', authorize('design', 'view'), (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(401);
    });
  });
});

describe('requireOrgAdmin middleware', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = new Hono<Env>();
  });

  it('allows org admin', async () => {
    app.use('*', (c, next) => {
      c.set('membership', { isOrgAdmin: true } as any);
      return next();
    });
    app.get('/test', requireOrgAdmin(), (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  it('denies non-admin', async () => {
    app.use('*', (c, next) => {
      c.set('membership', { isOrgAdmin: false } as any);
      return next();
    });
    app.get('/test', requireOrgAdmin(), (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.message).toContain('Organization Admin');
  });

  it('allows API key to bypass', async () => {
    app.use('*', (c, next) => {
      c.set('userId', 'api-key:org_123');
      c.set('membership', undefined);
      return next();
    });
    app.get('/test', requireOrgAdmin(), (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });
});

describe('authorizeAnyWorkspace middleware', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = new Hono<Env>();
  });

  it('allows if user has access to any workspace', async () => {
    app.use('*', (c, next) => {
      c.set('membership', {
        designAuthority: WorkspaceAuthority.NONE,
        operationsAuthority: WorkspaceAuthority.NONE,
        marketingAuthority: WorkspaceAuthority.VIEWER,
        complianceAuthority: WorkspaceAuthority.NONE,
      } as any);
      return next();
    });
    app.get('/test', authorizeAnyWorkspace('view'), (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  it('denies if user has NONE in all workspaces', async () => {
    app.use('*', (c, next) => {
      c.set('membership', {
        designAuthority: WorkspaceAuthority.NONE,
        operationsAuthority: WorkspaceAuthority.NONE,
        marketingAuthority: WorkspaceAuthority.NONE,
        complianceAuthority: WorkspaceAuthority.NONE,
      } as any);
      return next();
    });
    app.get('/test', authorizeAnyWorkspace('view'), (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(403);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @eurocomply/api test authorize`
Expected: FAIL with "Cannot find module"

**Step 3: Commit test file**

```bash
git add apps/api/src/middleware/authorize.test.ts
git commit -m "test(api): add authorize middleware tests"
```

---

## Task 3: Create authorize() Middleware - Implementation

**Files:**
- Create: `apps/api/src/middleware/authorize.ts`

**Step 1: Write the implementation**

```typescript
// apps/api/src/middleware/authorize.ts
import { createMiddleware } from 'hono/factory';
import type { Env } from '../app.js';
import { WorkspaceAuthority } from '@eurocomply/database';

export type Workspace = 'design' | 'operations' | 'marketing' | 'compliance';
export type Action = 'view' | 'edit' | 'approve' | 'manage';

const AUTHORITY_LEVELS: Record<WorkspaceAuthority, number> = {
  [WorkspaceAuthority.NONE]: 0,
  [WorkspaceAuthority.VIEWER]: 1,
  [WorkspaceAuthority.CONTRIBUTOR]: 2,
  [WorkspaceAuthority.EDITOR]: 3,
  [WorkspaceAuthority.MANAGER]: 4,
};

const ACTION_REQUIREMENTS: Record<Action, number> = {
  view: 1,      // VIEWER+
  edit: 2,      // CONTRIBUTOR+
  approve: 3,   // EDITOR+
  manage: 4,    // MANAGER only
};

export function authorize(workspace: Workspace, action: Action) {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const membership = c.get('membership');

    // API key auth: allow org-level access
    if (userId?.startsWith('api-key:')) {
      await next();
      return;
    }

    if (!membership) {
      return c.json(
        { error: 'Unauthorized', message: 'User context not found' },
        401
      );
    }

    // Get user's authority for this workspace
    const authorityKey = `${workspace}Authority` as keyof typeof membership;
    const userAuthority = membership[authorityKey] as WorkspaceAuthority;
    const userLevel = AUTHORITY_LEVELS[userAuthority];
    const requiredLevel = ACTION_REQUIREMENTS[action];

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

export function requireOrgAdmin() {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const membership = c.get('membership');

    // API key auth: allow (API keys are org-level credentials)
    if (userId?.startsWith('api-key:')) {
      await next();
      return;
    }

    if (!membership) {
      return c.json(
        { error: 'Unauthorized', message: 'User context not found' },
        401
      );
    }

    if (!membership.isOrgAdmin) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'This action requires Organization Admin privileges',
        },
        403
      );
    }

    await next();
  });
}

export function authorizeAnyWorkspace(action: Action) {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const membership = c.get('membership');

    if (userId?.startsWith('api-key:')) {
      await next();
      return;
    }

    if (!membership) {
      return c.json({ error: 'Unauthorized', message: 'User context not found' }, 401);
    }

    const requiredLevel = ACTION_REQUIREMENTS[action];

    // Check if user has required level in ANY workspace
    const hasAccess = (
      AUTHORITY_LEVELS[membership.designAuthority] >= requiredLevel ||
      AUTHORITY_LEVELS[membership.operationsAuthority] >= requiredLevel ||
      AUTHORITY_LEVELS[membership.marketingAuthority] >= requiredLevel ||
      AUTHORITY_LEVELS[membership.complianceAuthority] >= requiredLevel
    );

    if (!hasAccess) {
      return c.json({
        error: 'Forbidden',
        message: `Requires ${action} access to at least one workspace`,
      }, 403);
    }

    await next();
  });
}
```

**Step 2: Run tests to verify they pass**

Run: `pnpm --filter @eurocomply/api test authorize`
Expected: All PASS

**Step 3: Commit**

```bash
git add apps/api/src/middleware/authorize.ts
git commit -m "feat(api): add authorize, requireOrgAdmin, authorizeAnyWorkspace middleware"
```

---

## Task 4: Create userMiddleware - Tests

**Files:**
- Create: `apps/api/src/middleware/user.test.ts`

**Step 1: Write tests**

```typescript
// apps/api/src/middleware/user.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createUserMiddleware } from './user.js';
import { WorkspaceAuthority } from '@eurocomply/database';
import type { Env } from '../app.js';

describe('userMiddleware', () => {
  const mockOrm = {
    em: {
      fork: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if tenantSchema missing', async () => {
    const app = new Hono<Env>();
    app.use('*', createUserMiddleware({ orm: mockOrm as any }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.message).toContain('tenant context');
  });

  it('skips for API key auth', async () => {
    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_test');
      c.set('userId', 'api-key:org_123');
      return next();
    });
    app.use('*', createUserMiddleware({ orm: mockOrm as any }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(mockOrm.em.fork).not.toHaveBeenCalled();
  });

  it('returns 202 when user not found (race condition)', async () => {
    const mockEm = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    mockOrm.em.fork.mockReturnValue(mockEm);

    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_test');
      c.set('userId', 'user_clerk123');
      return next();
    });
    app.use('*', createUserMiddleware({ orm: mockOrm as any }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(202);
    expect(res.headers.get('Retry-After')).toBe('2');

    const body = await res.json();
    expect(body.message).toContain('Setting up your account');
  });

  it('attaches user and membership to context', async () => {
    const mockUser = {
      id: 'usr_123',
      clerkId: 'user_clerk123',
      membership: {
        isOrgAdmin: true,
        designAuthority: WorkspaceAuthority.MANAGER,
      },
    };
    const mockEm = {
      findOne: vi.fn().mockResolvedValue(mockUser),
      nativeUpdate: vi.fn().mockResolvedValue(1),
    };
    mockOrm.em.fork.mockReturnValue(mockEm);

    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_test');
      c.set('userId', 'user_clerk123');
      return next();
    });
    app.use('*', createUserMiddleware({ orm: mockOrm as any }));
    app.get('/test', (c) => {
      return c.json({
        userId: c.get('user')?.id,
        isAdmin: c.get('membership')?.isOrgAdmin,
      });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.userId).toBe('usr_123');
    expect(body.isAdmin).toBe(true);
  });

  it('returns 403 when user has no membership', async () => {
    const mockUser = {
      id: 'usr_123',
      clerkId: 'user_clerk123',
      membership: null,
    };
    const mockEm = {
      findOne: vi.fn().mockResolvedValue(mockUser),
    };
    mockOrm.em.fork.mockReturnValue(mockEm);

    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_test');
      c.set('userId', 'user_clerk123');
      return next();
    });
    app.use('*', createUserMiddleware({ orm: mockOrm as any }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.message).toContain('no longer a member');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @eurocomply/api test user.test`
Expected: FAIL with "Cannot find module"

**Step 3: Commit test file**

```bash
git add apps/api/src/middleware/user.test.ts
git commit -m "test(api): add userMiddleware tests"
```

---

## Task 5: Create userMiddleware - Implementation

**Files:**
- Create: `apps/api/src/middleware/user.ts`

**Step 1: Write the implementation**

```typescript
// apps/api/src/middleware/user.ts
import { createMiddleware } from 'hono/factory';
import type { MikroORM } from '@mikro-orm/postgresql';
import type { Env } from '../app.js';
import { User } from '@eurocomply/database';

export interface UserMiddlewareOptions {
  orm: MikroORM;
}

export function createUserMiddleware(options: UserMiddlewareOptions) {
  const { orm } = options;

  return createMiddleware<Env>(async (c, next) => {
    const tenantSchema = c.get('tenantSchema');
    const clerkUserId = c.get('userId');

    // Guard: tenantMiddleware must run first
    if (!tenantSchema) {
      return c.json(
        { error: 'Unauthorized', message: 'Missing tenant context' },
        401
      );
    }

    // Skip for API key auth (already has org-level access)
    if (!clerkUserId || clerkUserId.startsWith('api-key:')) {
      await next();
      return;
    }

    // Look up user in tenant schema
    const em = orm.em.fork({ schema: tenantSchema });

    const user = await em.findOne(
      User,
      { clerkId: clerkUserId, deletedAt: null },
      { populate: ['membership'] }
    );

    // Race condition: user has valid JWT but webhook hasn't synced yet
    if (!user) {
      return c.json(
        {
          error: 'Provisioning',
          message: 'Setting up your account. Please retry in a moment.',
          retryAfter: 2,
        },
        202,
        { 'Retry-After': '2' }
      );
    }

    // User was soft-deleted or has no membership
    if (!user.membership) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'You are no longer a member of this organization',
        },
        403
      );
    }

    // Attach to context
    c.set('user', user);
    c.set('membership', user.membership);

    // Update last login (fire and forget, don't block request)
    em.nativeUpdate(User, { id: user.id }, { lastLoginAt: new Date() })
      .catch(() => {}); // Ignore errors

    await next();
  });
}
```

**Step 2: Run tests to verify they pass**

Run: `pnpm --filter @eurocomply/api test user.test`
Expected: All PASS

**Step 3: Commit**

```bash
git add apps/api/src/middleware/user.ts
git commit -m "feat(api): add userMiddleware for user lookup and context"
```

---

## Task 6: Run All Middleware Tests

**Step 1: Run full test suite**

Run: `pnpm --filter @eurocomply/api test middleware`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `pnpm --filter @eurocomply/api typecheck`
Expected: No errors

**Step 3: Final commit if any cleanup needed**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore(api): cleanup after middleware additions"
```

---

## Verification Checklist

- [ ] Env type updated with user and membership Variables
- [ ] authorize() checks workspace authority levels correctly
- [ ] authorize() allows API key bypass
- [ ] authorize() returns 403 with clear error message including yourAuthority/requiredAuthority
- [ ] requireOrgAdmin() checks isOrgAdmin flag
- [ ] requireOrgAdmin() allows API key bypass
- [ ] authorizeAnyWorkspace() checks if user has access to at least one workspace
- [ ] userMiddleware skips for API key auth
- [ ] userMiddleware returns 202 for race condition (user not found)
- [ ] userMiddleware returns 403 for soft-deleted user
- [ ] userMiddleware attaches user and membership to context
- [ ] userMiddleware updates lastLoginAt (fire and forget)
- [ ] All tests pass
- [ ] TypeScript compiles without errors
