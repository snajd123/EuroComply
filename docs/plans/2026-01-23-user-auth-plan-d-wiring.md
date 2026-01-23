# User Auth Plan D: Route Authorization Wiring

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire userMiddleware into the app and add authorization checks to existing routes.

**Architecture:** Update app.ts to include userMiddleware in the request chain. Update products routes to use authorize('design', ...) and api-keys routes to use requireOrgAdmin().

**Tech Stack:** Hono, MikroORM, TypeScript

**Prerequisites:** Plans A, B, C complete (entities, middleware, webhooks all exist).

**Reference:** See `docs/plans/2026-01-23-user-auth-authorization-design.md` Sections 4-5.

---

## Task 1: Wire userMiddleware into app.ts

**Files:**
- Modify: `apps/api/src/app.ts`

**Step 1: Read current app.ts**

Run: `cat apps/api/src/app.ts`

**Step 2: Add import for userMiddleware**

Add this import:

```typescript
import { createUserMiddleware } from './middleware/user.js';
```

**Step 3: Update AppDependencies interface**

The orm is already in deps, so no change needed. Just verify it exists:

```typescript
export interface AppDependencies {
  orm?: OrmLike;
  // ... other deps
}
```

**Step 4: Add userMiddleware to protected routes**

Find where tenant middleware is applied to routes and add userMiddleware after it:

```typescript
// Create user middleware if orm is available
const userMiddleware = deps?.orm
  ? createUserMiddleware({ orm: deps.orm as any })
  : undefined;

// Tenant-scoped routes with user context
if (deps?.orm) {
  // Products: Apply tenant + user middleware
  v1.use('/products/*', createTenantMiddlewareWithApiKeys(deps.orm.em as any));
  if (userMiddleware) {
    v1.use('/products/*', userMiddleware);
  }
  v1.route('/products', createProductsRouter({ orm: deps.orm }));

  // API keys: Apply tenant + user middleware
  v1.use('/api-keys/*', tenantMiddleware);
  if (userMiddleware) {
    v1.use('/api-keys/*', userMiddleware);
  }
  v1.route('/api-keys', createApiKeysRouter({ em: deps.orm.em as any }));
}
```

**Step 5: Verify TypeScript compiles**

Run: `pnpm --filter @eurocomply/api typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat(api): wire userMiddleware into protected routes"
```

---

## Task 2: Add Authorization to Products Routes - Tests

**Files:**
- Modify: `apps/api/src/routes/products.test.ts`

**Step 1: Read current tests**

Run: `cat apps/api/src/routes/products.test.ts`

**Step 2: Add authorization tests**

Add these test cases to the existing test file:

```typescript
import { WorkspaceAuthority } from '@eurocomply/database';

describe('Products Authorization', () => {
  describe('GET /products', () => {
    it('allows Design VIEWER', async () => {
      // Setup app with mocked user context
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', {
          designAuthority: WorkspaceAuthority.VIEWER,
        } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm }));

      const res = await app.request('/products');
      expect(res.status).toBe(200);
    });

    it('denies user with NONE authority', async () => {
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', {
          designAuthority: WorkspaceAuthority.NONE,
        } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm }));

      const res = await app.request('/products');
      expect(res.status).toBe(403);
    });
  });

  describe('POST /products', () => {
    it('allows Design CONTRIBUTOR', async () => {
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', {
          designAuthority: WorkspaceAuthority.CONTRIBUTOR,
        } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm }));

      const res = await app.request('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Product',
          categoryId: 'cat_123',
        }),
      });
      // May fail for other reasons (category not found), but not 403
      expect(res.status).not.toBe(403);
    });

    it('denies Design VIEWER', async () => {
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('membership', {
          designAuthority: WorkspaceAuthority.VIEWER,
        } as any);
        return next();
      });
      app.route('/products', createProductsRouter({ orm: mockOrm }));

      const res = await app.request('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Product',
          categoryId: 'cat_123',
        }),
      });
      expect(res.status).toBe(403);
    });
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `pnpm --filter @eurocomply/api test products`
Expected: Authorization tests FAIL (no authorization checks yet)

**Step 4: Commit tests**

```bash
git add apps/api/src/routes/products.test.ts
git commit -m "test(api): add products route authorization tests"
```

---

## Task 3: Add Authorization to Products Routes - Implementation

**Files:**
- Modify: `apps/api/src/routes/products.ts`

**Step 1: Add import**

```typescript
import { authorize } from '../middleware/authorize.js';
```

**Step 2: Add authorize() to each route**

Update the routes:

```typescript
export function createProductsRouter(options: ProductsRouterOptions) {
  const { orm } = options;
  const router = new Hono<Env>();

  // List products - requires Design VIEWER+
  router.get('/', authorize('design', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const products = await em.find(Product, {});

    return c.json({
      data: products.map(serializeProduct),
      meta: { total: products.length },
    });
  });

  // Create product - requires Design CONTRIBUTOR+ (edit action)
  router.post(
    '/',
    authorize('design', 'edit'),
    zValidator('json', createProductSchema),
    async (c) => {
      const schema = c.get('tenantSchema')!;
      const em = orm.em.fork({ schema });
      const body = c.req.valid('json');

      // ... rest unchanged
    }
  );

  // Get product by ID - requires Design VIEWER+
  router.get('/:id', authorize('design', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const id = c.req.param('id');
    const product = await em.findOne(Product, { id });

    if (!product) {
      return c.json({ error: 'Not Found', message: 'Product not found' }, 404);
    }

    return c.json({ data: serializeProduct(product) });
  });

  return router;
}
```

**Step 3: Run tests to verify they pass**

Run: `pnpm --filter @eurocomply/api test products`
Expected: All PASS

**Step 4: Commit**

```bash
git add apps/api/src/routes/products.ts
git commit -m "feat(api): add authorization to products routes"
```

---

## Task 4: Add Authorization to API Keys Routes - Tests

**Files:**
- Create or modify: `apps/api/src/routes/api-keys.test.ts`

**Step 1: Add authorization tests**

```typescript
// apps/api/src/routes/api-keys.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createApiKeysRouter } from './api-keys.js';
import type { Env } from '../app.js';

describe('API Keys Authorization', () => {
  const mockEm = {
    fork: vi.fn().mockReturnThis(),
    findOne: vi.fn(),
  };

  describe('requireOrgAdmin', () => {
    it('allows org admin to list keys', async () => {
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('userId', 'user_123');
        c.set('membership', { isOrgAdmin: true } as any);
        return next();
      });
      app.route('/api-keys', createApiKeysRouter({ em: mockEm as any }));

      mockEm.findOne.mockResolvedValue({ id: 'org_123', schemaName: 'tenant_test' });

      const res = await app.request('/api-keys');
      // May fail for other reasons, but not 403
      expect(res.status).not.toBe(403);
    });

    it('denies non-admin from listing keys', async () => {
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('userId', 'user_123');
        c.set('membership', { isOrgAdmin: false } as any);
        return next();
      });
      app.route('/api-keys', createApiKeysRouter({ em: mockEm as any }));

      const res = await app.request('/api-keys');
      expect(res.status).toBe(403);
    });

    it('denies non-admin from creating keys', async () => {
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('userId', 'user_123');
        c.set('membership', { isOrgAdmin: false } as any);
        return next();
      });
      app.route('/api-keys', createApiKeysRouter({ em: mockEm as any }));

      const res = await app.request('/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Key' }),
      });
      expect(res.status).toBe(403);
    });

    it('denies non-admin from revoking keys', async () => {
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('userId', 'user_123');
        c.set('membership', { isOrgAdmin: false } as any);
        return next();
      });
      app.route('/api-keys', createApiKeysRouter({ em: mockEm as any }));

      const res = await app.request('/api-keys/key_123', {
        method: 'DELETE',
      });
      expect(res.status).toBe(403);
    });

    it('allows API key to access (org-level credential)', async () => {
      const app = new Hono<Env>();
      app.use('*', (c, next) => {
        c.set('tenantSchema', 'tenant_test');
        c.set('userId', 'api-key:org_123');
        c.set('membership', undefined);
        return next();
      });
      app.route('/api-keys', createApiKeysRouter({ em: mockEm as any }));

      mockEm.findOne.mockResolvedValue({ id: 'org_123', schemaName: 'tenant_test' });

      const res = await app.request('/api-keys');
      expect(res.status).not.toBe(403);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @eurocomply/api test api-keys`
Expected: Authorization tests FAIL (no authorization checks yet)

**Step 3: Commit tests**

```bash
git add apps/api/src/routes/api-keys.test.ts
git commit -m "test(api): add api-keys route authorization tests"
```

---

## Task 5: Add Authorization to API Keys Routes - Implementation

**Files:**
- Modify: `apps/api/src/routes/api-keys.ts`

**Step 1: Add import**

```typescript
import { requireOrgAdmin } from '../middleware/authorize.js';
```

**Step 2: Add requireOrgAdmin() to the router**

Update the router to apply requireOrgAdmin to all routes:

```typescript
export function createApiKeysRouter(deps: ApiKeysRouterDeps) {
  const router = new Hono<Env>();

  // All API key operations require Org Admin
  router.use('/*', requireOrgAdmin());

  // POST /api/v1/api-keys - Create a new API key
  router.post('/', async (c) => {
    const schemaName = c.get('tenantSchema');
    const userId = c.get('userId');

    if (!schemaName || !userId) {
      return c.json({ error: 'Unauthorized', message: 'Missing tenant context' }, 401);
    }

    // Remove the manual API key check - middleware handles it now
    // The old check: if (userId.startsWith('api-key:')) { ... }
    // is now handled by requireOrgAdmin() which allows API keys

    const body = await c.req.json<{ name?: string }>();
    // ... rest unchanged
  });

  // GET and DELETE routes - same pattern, remove manual checks
  router.get('/', async (c) => {
    // ... remove manual api-key check, rest unchanged
  });

  router.delete('/:id', async (c) => {
    // ... remove manual api-key check, rest unchanged
  });

  return router;
}
```

**Step 3: Run tests to verify they pass**

Run: `pnpm --filter @eurocomply/api test api-keys`
Expected: All PASS

**Step 4: Commit**

```bash
git add apps/api/src/routes/api-keys.ts
git commit -m "feat(api): add requireOrgAdmin to api-keys routes"
```

---

## Task 6: Update In-Memory Fallback Router (if needed)

**Files:**
- Modify: `apps/api/src/routes/products.ts` (in-memory fallback section)

**Step 1: Check if in-memory fallback is still used**

The deprecated `productsRouter` (in-memory version) may also need authorization if it's still used in tests.

**Step 2: Add authorization or mark as truly deprecated**

Either add authorize() calls to the in-memory router or add a comment that it's test-only and bypasses authorization intentionally.

```typescript
/**
 * @deprecated Use createProductsRouter with ORM injection instead.
 * This in-memory fallback is kept for backwards compatibility with tests.
 * NOTE: Does not include authorization checks - for testing only.
 */
export const productsRouter = new Hono<Env>();
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/products.ts
git commit -m "docs(api): clarify deprecated in-memory router lacks authorization"
```

---

## Task 7: Run Full Test Suite

**Step 1: Run all API tests**

Run: `pnpm --filter @eurocomply/api test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `pnpm --filter @eurocomply/api typecheck`
Expected: No errors

**Step 3: Run full monorepo tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 4: Final commit if any cleanup needed**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore(api): cleanup after authorization wiring"
```

---

## Task 8: Database Reset and Manual Verification

**Step 1: Reset database**

Run: `pnpm db:reset` (or `docker-compose down -v && docker-compose up -d && pnpm db:migrate`)

**Step 2: Start the API**

Run: `pnpm --filter @eurocomply/api dev`

**Step 3: Create test organization in Clerk**

- Go to Clerk Dashboard
- Create a new organization
- Verify webhook fires and org is provisioned

**Step 4: Add yourself to the organization**

- Verify you're added as first user
- Verify you have MANAGER + isOrgAdmin

**Step 5: Test API calls**

```bash
# Get JWT from Clerk and test
curl -H "Authorization: Bearer $JWT" http://localhost:3000/api/v1/products
# Expected: 200 (you have MANAGER)

# Add a second user in Clerk, get their JWT
curl -H "Authorization: Bearer $SECOND_USER_JWT" http://localhost:3000/api/v1/products
# Expected: 403 (they have NONE)
```

---

## Verification Checklist

- [ ] userMiddleware wired into app.ts for products and api-keys routes
- [ ] Products GET requires Design VIEWER
- [ ] Products POST requires Design CONTRIBUTOR (edit action)
- [ ] Products GET /:id requires Design VIEWER
- [ ] API Keys all routes require Org Admin
- [ ] API Keys allow API key bypass (org-level credential)
- [ ] Manual API key checks removed from api-keys.ts (middleware handles it)
- [ ] All tests pass
- [ ] TypeScript compiles without errors
- [ ] Database reset works
- [ ] Manual verification with Clerk complete

## Summary

After completing all 4 plans (A, B, C, D), you will have:

1. **Database entities**: User, OrganizationUser, WorkspaceAuthority
2. **Middleware**: userMiddleware, authorize(), requireOrgAdmin(), authorizeAnyWorkspace()
3. **Webhooks**: handleMembershipCreated, handleMembershipDeleted, handleUserUpdated
4. **Protected routes**: Products (Design workspace), API Keys (Org Admin)

Users joining via Clerk will be synced automatically. The first user gets full MANAGER access. Others start with NONE and must be granted access by an admin.
