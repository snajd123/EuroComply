# Category Adoption Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement auto-creation of TenantCategory on adoption, link mode management, and sync logic for system category updates.

**Architecture:** Enhance the existing `/categories/adoption` routes to auto-create TenantCategory with `system.*` prefix paths, add PATCH endpoint for link mode changes, add POST sync endpoint with dry-run support, and create async worker for propagating system category updates.

**Tech Stack:** Hono (routing), MikroORM (ORM), Vitest (testing), PostgreSQL (database)

**Design Doc:** [2026-01-27-category-adoption-sync-design.md](./2026-01-27-category-adoption-sync-design.md)

---

## Task 1: Add slugify Utility Function

**Files:**
- Create: `packages/database/src/utils/slugify.ts`
- Create: `packages/database/src/utils/slugify.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/utils/slugify.test.ts
import { describe, it, expect } from 'vitest';
import { slugify } from './slugify.js';

describe('slugify', () => {
  it('should convert to lowercase with underscores when name has hyphens', () => {
    expect(slugify('T-Shirts')).toBe('t_shirts');
  });

  it('should replace spaces with underscores when name has spaces', () => {
    expect(slugify('Product Category')).toBe('product_category');
  });

  it('should collapse multiple special chars when name has symbols', () => {
    expect(slugify('Apparel & Accessories')).toBe('apparel_accessories');
  });

  it('should trim leading and trailing underscores when present', () => {
    expect(slugify('--Test--')).toBe('test');
  });

  it('should truncate to 50 chars when name exceeds limit', () => {
    const longName = 'A'.repeat(100);
    expect(slugify(longName).length).toBe(50);
  });

  it('should return empty string when input is empty', () => {
    expect(slugify('')).toBe('');
  });

  it('should strip unicode chars when name has non-ASCII', () => {
    expect(slugify('Möbel & Einrichtung')).toBe('m_bel_einrichtung');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/utils/slugify.test.ts`
Expected: FAIL with "Cannot find module './slugify.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/utils/slugify.ts
/**
 * Convert a category name to a tenant-local LTREE-compatible path segment.
 *
 * - Lowercase
 * - Replace non-alphanumeric with underscores
 * - Trim leading/trailing underscores
 * - Limit to 50 characters (LTREE compatibility)
 */
export function slugify(name: string): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50);
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/utils/slugify.test.ts`
Expected: PASS (7 tests)

**Step 5: Export from utils index**

```typescript
// Add to packages/database/src/utils/index.ts (create if doesn't exist)
export { slugify } from './slugify.js';
```

**Step 6: Commit**

```bash
git add packages/database/src/utils/slugify.ts packages/database/src/utils/slugify.test.ts packages/database/src/utils/index.ts
git commit -m "feat(database): add slugify utility for tenant category paths"
```

---

## Task 2: Update CategoryAdoption Entity Export

**Files:**
- Modify: `packages/database/src/entities/CategoryAdoption.ts`

**Step 1: Verify current exports**

The entity already has `adoptedVersion`, `frozenAtVersion`, `updateAvailable`, and `localCategory` fields. Verify they are exported properly.

Run: `cd packages/database && grep -n "adoptedVersion\|frozenAtVersion\|updateAvailable\|localCategory" src/entities/CategoryAdoption.ts`

**Step 2: No changes needed if fields exist**

If all fields exist, skip to next task. Otherwise, add missing fields.

**Step 3: Commit (if changes made)**

```bash
git add packages/database/src/entities/CategoryAdoption.ts
git commit -m "fix(database): ensure CategoryAdoption has all required fields"
```

---

## Task 3: Enhance POST /adoption/:categoryId - Auto-Create TenantCategory

**Files:**
- Modify: `apps/api/src/routes/category-adoption.ts`
- Modify: `apps/api/src/routes/category-adoption.e2e.test.ts`

**Step 1: Write the failing test for TenantCategory auto-creation**

Add this test to `category-adoption.e2e.test.ts`:

```typescript
// Add to describe('POST /category-adoption/:categoryId', () => { ... })

it('should auto-create TenantCategory with system prefix when adopting', async (context) => {
  if (!(await isDatabaseAvailable())) {
    context.skip();
    return;
  }

  const testApp = createTestApp(editorUserId);
  const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
    method: 'POST',
  });

  expect(res.status).toBe(201);
  const data = await res.json() as {
    data: {
      adoption: { id: string; systemCategoryId: string; mode: string; adoptedVersion: number };
      tenantCategory: { id: string; name: string; path: string; systemCategoryId: string; linkMode: string };
    };
  };

  // Verify adoption record
  expect(data.data.adoption.systemCategoryId).toBe(categoryIds['apparel']);
  expect(data.data.adoption.mode).toBe('LIVE');
  expect(data.data.adoption.adoptedVersion).toBe(1);

  // Verify TenantCategory was created
  expect(data.data.tenantCategory.name).toBe('Apparel');
  expect(data.data.tenantCategory.path).toBe('system.apparel');
  expect(data.data.tenantCategory.systemCategoryId).toBe(categoryIds['apparel']);
  expect(data.data.tenantCategory.linkMode).toBe('LIVE');
});

it('should record adoptedVersion when system category has version', async (context) => {
  if (!(await isDatabaseAvailable())) {
    context.skip();
    return;
  }

  // Update system category version first
  const connection = orm.em.getConnection();
  await connection.execute(
    `UPDATE public.category SET version = 5 WHERE id = '${categoryIds['materials']}'`
  );

  const testApp = createTestApp(editorUserId);
  const res = await testApp.request(`/category-adoption/${categoryIds['materials']}`, {
    method: 'POST',
  });

  expect(res.status).toBe(201);
  const data = await res.json() as {
    data: {
      adoption: { adoptedVersion: number };
    };
  };
  expect(data.data.adoption.adoptedVersion).toBe(5);
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/routes/category-adoption.e2e.test.ts`
Expected: FAIL - current response doesn't include tenantCategory

**Step 3: Update the route implementation**

Update `apps/api/src/routes/category-adoption.ts`:

```typescript
// Add import at top
import { TenantCategory, CategoryType } from '@eurocomply/database';

// Add slugify function (inline for now, or import from @eurocomply/database if exported)
function slugify(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50);
}

// Update CategoryRow interface to include version
interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  path: string;
  target_type: string;
  type: string;
  depth: number;
  version: number;
}

// Replace the POST /:categoryId handler
router.post('/:categoryId', authorize('design', 'edit'), async (c) => {
  const schema = c.get('tenantSchema')!;
  const categoryId = c.req.param('categoryId');
  const em = orm.em.fork({ schema });

  const result = await em.transactional(async (txEm) => {
    await txEm.execute(`SET search_path TO "${schema}", public`);

    // First check if category exists in public schema
    const categoryRows = await txEm.execute<CategoryRow[]>(
      'SELECT id, name, description, path, target_type, type, depth, version FROM public.category WHERE id = ?',
      [categoryId]
    );

    if (categoryRows.length === 0) {
      return { error: 'not_found' as const };
    }

    const systemCategory = categoryRows[0]!;

    // Check if already adopted in tenant schema
    const existing = await txEm.findOne(CategoryAdoption, {
      systemCategoryId: categoryId,
    });

    if (existing) {
      return { error: 'conflict' as const, message: `Category ${categoryId} is already adopted by tenant` };
    }

    // Create TenantCategory with system.* prefix
    const tenantCategoryPath = `system.${slugify(systemCategory.name)}`;

    const tenantCategory = new TenantCategory();
    tenantCategory.name = systemCategory.name;
    tenantCategory.description = systemCategory.description ?? undefined;
    tenantCategory.path = tenantCategoryPath;
    tenantCategory.type = systemCategory.type as CategoryType;
    tenantCategory.targetType = systemCategory.target_type as TargetType;
    tenantCategory.depth = 0; // ROOT in tenant hierarchy
    tenantCategory.systemCategoryId = categoryId;
    tenantCategory.linkMode = LinkMode.LIVE;
    tenantCategory.isActive = true;

    txEm.persist(tenantCategory);

    // Create adoption record
    const adoption = new CategoryAdoption();
    adoption.systemCategoryId = categoryId;
    adoption.mode = LinkMode.LIVE;
    adoption.adoptedAt = new Date();
    adoption.adoptedVersion = systemCategory.version;
    adoption.localCategory = tenantCategory;

    txEm.persist(adoption);

    return {
      success: true as const,
      adoption,
      tenantCategory,
      systemCategory,
    };
  });

  if (result.error === 'not_found') {
    return error(c, 'NOT_FOUND', 'Category not found', 404);
  }

  if (result.error === 'conflict') {
    return error(c, 'CONFLICT', result.message, 409);
  }

  return success(c, {
    adoption: {
      id: result.adoption.id,
      systemCategoryId: result.adoption.systemCategoryId,
      mode: result.adoption.mode,
      adoptedAt: result.adoption.adoptedAt.toISOString(),
      adoptedVersion: result.adoption.adoptedVersion,
    },
    tenantCategory: {
      id: result.tenantCategory.id,
      name: result.tenantCategory.name,
      path: result.tenantCategory.path,
      targetType: result.tenantCategory.targetType,
      systemCategoryId: result.tenantCategory.systemCategoryId,
      linkMode: result.tenantCategory.linkMode,
    },
  }, { status: 201 });
});
```

**Step 4: Add missing import for TargetType**

```typescript
// Update imports at top of file
import { CategoryAdoption, LinkMode, TargetType, TenantCategory, CategoryType } from '@eurocomply/database';
```

**Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm test src/routes/category-adoption.e2e.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/routes/category-adoption.ts apps/api/src/routes/category-adoption.e2e.test.ts
git commit -m "feat(api): auto-create TenantCategory on category adoption

- Creates TenantCategory with system.* prefix path
- Records adoptedVersion from system category
- Links CategoryAdoption.localCategory to TenantCategory"
```

---

## Task 4: Add PATCH /adoption/:categoryId for Link Mode Changes

**Files:**
- Modify: `apps/api/src/routes/category-adoption.ts`
- Modify: `apps/api/src/routes/category-adoption.e2e.test.ts`

**Step 1: Write the failing tests**

Add to `category-adoption.e2e.test.ts`:

```typescript
// ============================================================================
// PATCH /:categoryId - Change link mode
// ============================================================================

describe('PATCH /category-adoption/:categoryId', () => {
  it('should capture frozenAtVersion when changing from LIVE to FROZEN', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const testApp = createTestApp(editorUserId);

    // First adopt
    await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'POST',
    });

    // Change to FROZEN
    const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'FROZEN' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as {
      data: { mode: string; frozenAtVersion: number };
    };
    expect(data.data.mode).toBe('FROZEN');
    expect(data.data.frozenAtVersion).toBe(1);
  });

  it('should sync to latest version when changing from FROZEN to LIVE', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const testApp = createTestApp(editorUserId);

    // Adopt and freeze
    await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'POST',
    });
    await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'FROZEN' }),
    });

    // Update system category
    const connection = orm.em.getConnection();
    await connection.execute(
      `UPDATE public.category SET name = 'Apparel Updated', version = 2 WHERE id = '${categoryIds['apparel']}'`
    );

    // Change back to LIVE
    const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'LIVE' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as {
      data: { mode: string; frozenAtVersion: number | null };
    };
    expect(data.data.mode).toBe('LIVE');
    expect(data.data.frozenAtVersion).toBeNull();

    // Verify TenantCategory was synced
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);
    const tenantCat = await tenantEm.findOne(TenantCategory, { systemCategoryId: categoryIds['apparel'] });
    expect(tenantCat?.name).toBe('Apparel Updated');

    // Reset for other tests
    await connection.execute(
      `UPDATE public.category SET name = 'Apparel', version = 1 WHERE id = '${categoryIds['apparel']}'`
    );
  });

  it('should clear systemCategoryId when changing to DETACHED', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const testApp = createTestApp(editorUserId);

    // First adopt
    await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'POST',
    });

    // Change to DETACHED
    const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'DETACHED' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as {
      data: { mode: string };
    };
    expect(data.data.mode).toBe('DETACHED');

    // Verify TenantCategory.systemCategoryId is cleared
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);
    const tenantCat = await tenantEm.findOne(TenantCategory, { path: 'system.apparel' });
    expect(tenantCat?.systemCategoryId).toBeNull();
  });

  it('should return 400 when trying to change from DETACHED', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const testApp = createTestApp(editorUserId);

    // Adopt and detach
    await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'POST',
    });
    await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'DETACHED' }),
    });

    // Try to change back to LIVE
    const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'LIVE' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json() as ErrorResponse;
    expect(data.error.code).toBe('INVALID_TRANSITION');
  });

  it('should return 404 when adoption not found', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const testApp = createTestApp(editorUserId);
    const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'FROZEN' }),
    });

    expect(res.status).toBe(404);
  });

  it('should return 403 when user has VIEWER authority', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    // First adopt as editor
    const editorApp = createTestApp(editorUserId);
    await editorApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'POST',
    });

    // Try to change mode as viewer
    const testApp = createTestApp(viewerUserId);
    const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'FROZEN' }),
    });

    expect(res.status).toBe(403);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/routes/category-adoption.e2e.test.ts`
Expected: FAIL - PATCH route doesn't exist

**Step 3: Add the PATCH route**

Add to `apps/api/src/routes/category-adoption.ts`:

```typescript
// Add schema for PATCH body
const changeModeSchema = z.object({
  mode: z.nativeEnum(LinkMode),
});

// Add PATCH handler after POST handler
router.patch('/:categoryId', authorize('design', 'edit'), zValidator('json', changeModeSchema), async (c) => {
  const schema = c.get('tenantSchema')!;
  const categoryId = c.req.param('categoryId');
  const body = c.req.valid('json');
  const em = orm.em.fork({ schema });

  const result = await em.transactional(async (txEm) => {
    await txEm.execute(`SET search_path TO "${schema}", public`);

    // Find adoption
    const adoption = await txEm.findOne(CategoryAdoption, {
      systemCategoryId: categoryId,
    }, { populate: ['localCategory'] });

    if (!adoption) {
      return { error: 'not_found' as const };
    }

    // Validate transition
    if (adoption.mode === LinkMode.DETACHED) {
      return { error: 'invalid_transition' as const, message: 'Cannot change mode from DETACHED - detachment is permanent' };
    }

    const newMode = body.mode;
    const tenantCategory = adoption.localCategory;

    // Handle mode transitions
    if (newMode === LinkMode.FROZEN) {
      // Capture current version
      const categoryRows = await txEm.execute<Array<{ version: number }>>(
        'SELECT version FROM public.category WHERE id = ?',
        [categoryId]
      );
      adoption.frozenAtVersion = categoryRows[0]?.version ?? 1;
      adoption.updateAvailable = false;
      if (tenantCategory) {
        tenantCategory.linkMode = LinkMode.FROZEN;
        tenantCategory.frozenAtVersion = adoption.frozenAtVersion;
      }
    } else if (newMode === LinkMode.LIVE) {
      // Sync to latest
      const categoryRows = await txEm.execute<CategoryRow[]>(
        'SELECT id, name, description, path, target_type, type, depth, version FROM public.category WHERE id = ?',
        [categoryId]
      );
      const systemCategory = categoryRows[0];
      if (systemCategory && tenantCategory) {
        tenantCategory.name = systemCategory.name;
        tenantCategory.description = systemCategory.description ?? undefined;
        tenantCategory.linkMode = LinkMode.LIVE;
        tenantCategory.frozenAtVersion = undefined;
      }
      adoption.frozenAtVersion = undefined;
      adoption.updateAvailable = false;
      adoption.adoptedVersion = systemCategory?.version ?? adoption.adoptedVersion;
    } else if (newMode === LinkMode.DETACHED) {
      // Clear systemCategoryId on TenantCategory (becomes custom category)
      if (tenantCategory) {
        tenantCategory.systemCategoryId = undefined;
        tenantCategory.linkMode = undefined;
        tenantCategory.frozenAtVersion = undefined;
      }
    }

    adoption.mode = newMode;

    return { success: true as const, adoption };
  });

  if (result.error === 'not_found') {
    return error(c, 'NOT_FOUND', 'Category adoption not found', 404);
  }

  if (result.error === 'invalid_transition') {
    return error(c, 'INVALID_TRANSITION', result.message, 400);
  }

  return success(c, {
    id: result.adoption.id,
    systemCategoryId: result.adoption.systemCategoryId,
    mode: result.adoption.mode,
    frozenAtVersion: result.adoption.frozenAtVersion ?? null,
    updateAvailable: result.adoption.updateAvailable,
  });
});
```

**Step 4: Add import for TenantCategory**

Ensure `TenantCategory` is imported at top of file (should already be there from Task 3).

**Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm test src/routes/category-adoption.e2e.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/routes/category-adoption.ts apps/api/src/routes/category-adoption.e2e.test.ts
git commit -m "feat(api): add PATCH endpoint for category adoption link mode changes

- LIVE → FROZEN: Captures frozenAtVersion
- FROZEN → LIVE: Syncs TenantCategory to latest system version
- * → DETACHED: Clears systemCategoryId (permanent)
- DETACHED → *: Returns 400 (not allowed)"
```

---

## Task 5: Add POST /adoption/:categoryId/sync Endpoint

**Files:**
- Modify: `apps/api/src/routes/category-adoption.ts`
- Modify: `apps/api/src/routes/category-adoption.e2e.test.ts`

**Step 1: Write the failing tests**

Add to `category-adoption.e2e.test.ts`:

```typescript
// ============================================================================
// POST /:categoryId/sync - Manual sync for FROZEN mode
// ============================================================================

describe('POST /category-adoption/:categoryId/sync', () => {
  it('should return diff without applying when dryRun is true', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const testApp = createTestApp(editorUserId);

    // Adopt and freeze
    await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'POST',
    });
    await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'FROZEN' }),
    });

    // Update system category
    const connection = orm.em.getConnection();
    await connection.execute(
      `UPDATE public.category SET name = 'Apparel v2', description = 'Updated description', version = 2 WHERE id = '${categoryIds['apparel']}'`
    );

    // Dry run sync
    const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}/sync?dryRun=true`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const data = await res.json() as {
      data: {
        synced: boolean;
        dryRun: boolean;
        previousVersion: number;
        currentVersion: number;
        changes: Record<string, { from: string | null; to: string | null }>;
      };
    };
    expect(data.data.synced).toBe(false);
    expect(data.data.dryRun).toBe(true);
    expect(data.data.previousVersion).toBe(1);
    expect(data.data.currentVersion).toBe(2);
    expect(data.data.changes.name).toEqual({ from: 'Apparel', to: 'Apparel v2' });
    expect(data.data.changes.description).toEqual({ from: null, to: 'Updated description' });

    // Verify TenantCategory was NOT updated
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);
    const tenantCat = await tenantEm.findOne(TenantCategory, { systemCategoryId: categoryIds['apparel'] });
    expect(tenantCat?.name).toBe('Apparel'); // Still old name

    // Reset for other tests
    await connection.execute(
      `UPDATE public.category SET name = 'Apparel', description = 'Clothing and accessories', version = 1 WHERE id = '${categoryIds['apparel']}'`
    );
  });

  it('should apply changes and return diff when dryRun is false', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const testApp = createTestApp(editorUserId);

    // Adopt and freeze
    await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'POST',
    });
    await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'FROZEN' }),
    });

    // Update system category
    const connection = orm.em.getConnection();
    await connection.execute(
      `UPDATE public.category SET name = 'Apparel Updated', version = 3 WHERE id = '${categoryIds['apparel']}'`
    );

    // Apply sync
    const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}/sync`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const data = await res.json() as {
      data: {
        synced: boolean;
        dryRun: boolean;
        previousVersion: number;
        currentVersion: number;
      };
    };
    expect(data.data.synced).toBe(true);
    expect(data.data.dryRun).toBe(false);
    expect(data.data.currentVersion).toBe(3);

    // Verify TenantCategory WAS updated
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);
    const tenantCat = await tenantEm.findOne(TenantCategory, { systemCategoryId: categoryIds['apparel'] });
    expect(tenantCat?.name).toBe('Apparel Updated');

    // Verify frozenAtVersion updated
    const adoption = await tenantEm.findOne(CategoryAdoption, { systemCategoryId: categoryIds['apparel'] });
    expect(adoption?.frozenAtVersion).toBe(3);
    expect(adoption?.updateAvailable).toBe(false);

    // Reset for other tests
    await connection.execute(
      `UPDATE public.category SET name = 'Apparel', description = 'Clothing and accessories', version = 1 WHERE id = '${categoryIds['apparel']}'`
    );
  });

  it('should return 404 when adoption not found', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const testApp = createTestApp(editorUserId);
    const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}/sync`, {
      method: 'POST',
    });

    expect(res.status).toBe(404);
  });

  it('should return 403 when user has VIEWER authority', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    // First adopt as editor
    const editorApp = createTestApp(editorUserId);
    await editorApp.request(`/category-adoption/${categoryIds['apparel']}`, {
      method: 'POST',
    });

    const testApp = createTestApp(viewerUserId);
    const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}/sync`, {
      method: 'POST',
    });

    expect(res.status).toBe(403);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/routes/category-adoption.e2e.test.ts`
Expected: FAIL - sync route doesn't exist

**Step 3: Add the sync route**

Add to `apps/api/src/routes/category-adoption.ts`:

```typescript
// Add sync query schema
const syncQuerySchema = z.object({
  dryRun: z.string().optional().transform(val => val === 'true'),
});

// Add POST /:categoryId/sync handler
router.post('/:categoryId/sync', authorize('design', 'edit'), zValidator('query', syncQuerySchema), async (c) => {
  const schema = c.get('tenantSchema')!;
  const categoryId = c.req.param('categoryId');
  const { dryRun } = c.req.valid('query');
  const em = orm.em.fork({ schema });

  const result = await em.transactional(async (txEm) => {
    await txEm.execute(`SET search_path TO "${schema}", public`);

    // Find adoption with TenantCategory
    const adoption = await txEm.findOne(CategoryAdoption, {
      systemCategoryId: categoryId,
    }, { populate: ['localCategory'] });

    if (!adoption) {
      return { error: 'not_found' as const };
    }

    const tenantCategory = adoption.localCategory;

    // Get current system category
    const categoryRows = await txEm.execute<CategoryRow[]>(
      'SELECT id, name, description, path, target_type, type, depth, version FROM public.category WHERE id = ?',
      [categoryId]
    );

    if (categoryRows.length === 0) {
      return { error: 'system_not_found' as const };
    }

    const systemCategory = categoryRows[0]!;
    const previousVersion = adoption.frozenAtVersion ?? adoption.adoptedVersion ?? 1;

    // Calculate diff
    const changes: Record<string, { from: string | null; to: string | null }> = {};

    if (tenantCategory) {
      if (tenantCategory.name !== systemCategory.name) {
        changes.name = { from: tenantCategory.name, to: systemCategory.name };
      }
      if ((tenantCategory.description ?? null) !== systemCategory.description) {
        changes.description = { from: tenantCategory.description ?? null, to: systemCategory.description };
      }
    }

    // If dry run, return diff without applying
    if (dryRun) {
      return {
        success: true as const,
        synced: false,
        dryRun: true,
        previousVersion,
        currentVersion: systemCategory.version,
        changes,
      };
    }

    // Apply sync
    if (tenantCategory) {
      tenantCategory.name = systemCategory.name;
      tenantCategory.description = systemCategory.description ?? undefined;
    }

    adoption.frozenAtVersion = systemCategory.version;
    adoption.adoptedVersion = systemCategory.version;
    adoption.updateAvailable = false;

    return {
      success: true as const,
      synced: true,
      dryRun: false,
      previousVersion,
      currentVersion: systemCategory.version,
      changes,
    };
  });

  if (result.error === 'not_found') {
    return error(c, 'NOT_FOUND', 'Category adoption not found', 404);
  }

  if (result.error === 'system_not_found') {
    return error(c, 'NOT_FOUND', 'System category no longer exists', 404);
  }

  return success(c, {
    synced: result.synced,
    dryRun: result.dryRun,
    previousVersion: result.previousVersion,
    currentVersion: result.currentVersion,
    changes: result.changes,
  });
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test src/routes/category-adoption.e2e.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/category-adoption.ts apps/api/src/routes/category-adoption.e2e.test.ts
git commit -m "feat(api): add POST /sync endpoint for manual category sync

- dryRun=true returns diff without applying changes
- dryRun=false (default) applies sync and updates TenantCategory
- Updates frozenAtVersion and clears updateAvailable flag"
```

---

## Task 6: Update Postman Collection

**Files:**
- Modify: `docs/testing/postman/tenant-api.postman_collection.json`

**Step 1: Add new requests to the Category Adoption section**

Add the following requests to the existing "Category Adoption" section:

1. **Change Mode to FROZEN** - PATCH request
2. **Change Mode to LIVE** - PATCH request
3. **Change Mode to DETACHED** - PATCH request
4. **Sync (Dry Run)** - POST with ?dryRun=true
5. **Sync (Apply)** - POST without dryRun

**Step 2: Update the collection JSON**

Read the current collection and add the new requests.

**Step 3: Commit**

```bash
git add docs/testing/postman/tenant-api.postman_collection.json
git commit -m "docs(postman): add link mode and sync endpoints to tenant-api collection"
```

---

## Task 7: Run Full Test Suite

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 2: Fix any failing tests**

If any tests fail, investigate and fix.

**Step 3: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: resolve test failures from category adoption changes"
```

---

## Task 8: Update Documentation

**Files:**
- Modify: `docs/plans/2026-01-27-category-adoption-sync-design.md`

**Step 1: Update design doc status**

Change the status from "Approved" to "Implemented":

```markdown
**Status:** Implemented
```

**Step 2: Add implementation notes**

Add a section at the bottom of the design doc:

```markdown
---

## Implementation Notes

**Completed:** 2026-01-27

**Commits:**
- `feat(database): add slugify utility for tenant category paths`
- `feat(api): auto-create TenantCategory on category adoption`
- `feat(api): add PATCH endpoint for category adoption link mode changes`
- `feat(api): add POST /sync endpoint for manual category sync`
- `docs(postman): add link mode and sync endpoints to tenant-api collection`

**Deferred:**
- Async worker for propagating system category updates (requires event bus infrastructure)
```

**Step 3: Commit**

```bash
git add docs/plans/2026-01-27-category-adoption-sync-design.md
git commit -m "docs: mark category adoption sync design as implemented"
```

---

## Summary

After completing all tasks, you will have:

1. **`slugify()` utility** for generating tenant-local paths
2. **Enhanced POST /adoption/:categoryId** that auto-creates TenantCategory with `system.*` prefix
3. **PATCH /adoption/:categoryId** for changing link modes (LIVE/FROZEN/DETACHED)
4. **POST /adoption/:categoryId/sync** for manual sync with dry-run support
5. **Updated Postman collection** with all new endpoints

The async worker for propagating system category updates will be implemented in a follow-up plan, as it requires additional infrastructure (event bus, background worker setup).
