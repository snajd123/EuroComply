/**
 * Category Adoption API E2E Tests
 *
 * Tests the category adoption router against a real database with proper
 * tenant isolation and authorization.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createCategoryAdoptionRouter } from './category-adoption.js';
import {
  Organization,
  User,
  OrganizationUser,
  TenantProvisioner,
  ProvisioningStatus,
  SubscriptionTier,
  SubscriptionStatus,
  EnforcementMode,
  WorkspaceAuthority,
} from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createId } from '@eurocomply/core';
import type { Env } from '../app.js';

// Response types for type-safe test assertions
interface AdoptionData {
  adoption: {
    id: string;
    systemCategoryId: string;
    mode: string;
    adoptedAt: string;
    adoptedVersion: number;
  };
  tenantCategory: {
    id: string;
    name: string;
    path: string;
    systemCategoryId: string;
    linkMode: string;
  };
}

interface CategoryData {
  id: string;
  name: string;
  path: string;
  targetType: string;
}

interface AdoptionResponse {
  data: AdoptionData;
}

interface AdoptionListResponse {
  data: CategoryData[];
  meta?: { total: number };
}

interface AvailableListResponse {
  data: CategoryData[];
  meta?: { total: number };
}

interface ErrorResponse {
  error: { code: string; message: string };
}

describe('Category Adoption API E2E', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;
  let app: Hono<Env>;

  // Test tenant - use unique suffix to avoid conflicts across test runs
  const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const testSchemaName = `tenant_adoption_test_${uniqueSuffix}`;

  // Test data IDs
  let testOrgId: string;
  let viewerUserId: string;
  let editorUserId: string;
  let noneUserId: string;

  // Test category IDs
  const categoryIds: Record<string, string> = {};

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);

    // Create test organization
    const em = orm.em.fork();
    const now = new Date();
    testOrgId = createId();

    const org = em.create(Organization, {
      id: testOrgId,
      name: `Adoption Test Org ${uniqueSuffix}`,
      slug: `adoption-test-${uniqueSuffix}`,
      schemaName: testSchemaName,
      clerkOrgId: `org_adoption_test_${uniqueSuffix}`,
      cellId: 'cell_1',
      subscriptionTier: SubscriptionTier.STARTER,
      subscriptionStatus: SubscriptionStatus.TRIALING,
      provisioningStatus: ProvisioningStatus.PENDING,
      regulatoryAdvisorEnabled: true,
      enforcementMode: EnforcementMode.SILENT,
      captureComplianceInSilentMode: true,
      createdAt: now,
      updatedAt: now,
    });
    await em.persistAndFlush(org);

    // Provision the tenant schema
    const result = await provisioner.provisionTenant(testSchemaName);
    if (!result.success) {
      throw new Error(`Failed to provision test tenant: ${result.error}`);
    }

    // Update org status
    org.provisioningStatus = ProvisioningStatus.READY;
    await em.flush();

    // Create system categories in public schema
    const connection = orm.em.getConnection();
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS public.category (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        path ltree NOT NULL,
        type VARCHAR(10) DEFAULT 'BRANCH',
        target_type VARCHAR(20) DEFAULT 'PRODUCT',
        depth INT DEFAULT 0,
        parent_id TEXT REFERENCES public.category(id),
        default_profile_id TEXT,
        is_active BOOLEAN DEFAULT true,
        version INT DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await connection.execute(`
      CREATE INDEX IF NOT EXISTS category_path_gist_idx ON public.category USING gist(path)
    `);

    // Seed test categories in public schema
    categoryIds['apparel'] = createId();
    categoryIds['materials'] = createId();
    categoryIds['facilities'] = createId();

    await connection.execute(`
      INSERT INTO public.category (id, name, description, path, type, target_type, depth, parent_id, is_active, created_at, updated_at)
      VALUES
        ('${categoryIds['apparel']}', 'Apparel', 'Clothing and accessories', 'apparel', 'ROOT', 'PRODUCT', 0, NULL, true, '${now.toISOString()}', '${now.toISOString()}'),
        ('${categoryIds['materials']}', 'Materials', 'Raw materials', 'materials', 'ROOT', 'MATERIAL', 0, NULL, true, '${now.toISOString()}', '${now.toISOString()}'),
        ('${categoryIds['facilities']}', 'Facilities', 'Manufacturing facilities', 'facilities', 'ROOT', 'FACILITY', 0, NULL, true, '${now.toISOString()}', '${now.toISOString()}')
    `);

    // Create test users and memberships in tenant schema
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

    viewerUserId = createId();
    editorUserId = createId();
    noneUserId = createId();

    // Create users
    const viewerUser = tenantEm.create(User, {
      id: viewerUserId,
      clerkId: `clerk_viewer_${uniqueSuffix}`,
      email: `viewer_${uniqueSuffix}@test.com`,
      name: 'Viewer User',
      createdAt: now,
      updatedAt: now,
    });

    const editorUser = tenantEm.create(User, {
      id: editorUserId,
      clerkId: `clerk_editor_${uniqueSuffix}`,
      email: `editor_${uniqueSuffix}@test.com`,
      name: 'Editor User',
      createdAt: now,
      updatedAt: now,
    });

    const noneUser = tenantEm.create(User, {
      id: noneUserId,
      clerkId: `clerk_none_${uniqueSuffix}`,
      email: `none_${uniqueSuffix}@test.com`,
      name: 'None User',
      createdAt: now,
      updatedAt: now,
    });

    tenantEm.persist([viewerUser, editorUser, noneUser]);

    // Create memberships with different authorities
    const viewerMembership = tenantEm.create(OrganizationUser, {
      id: createId(),
      user: viewerUser,
      isOrgAdmin: false,
      designAuthority: WorkspaceAuthority.VIEWER,
      operationsAuthority: WorkspaceAuthority.NONE,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.NONE,
      createdAt: now,
      updatedAt: now,
    });

    const editorMembership = tenantEm.create(OrganizationUser, {
      id: createId(),
      user: editorUser,
      isOrgAdmin: false,
      designAuthority: WorkspaceAuthority.EDITOR,
      operationsAuthority: WorkspaceAuthority.NONE,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.NONE,
      createdAt: now,
      updatedAt: now,
    });

    const noneMembership = tenantEm.create(OrganizationUser, {
      id: createId(),
      user: noneUser,
      isOrgAdmin: false,
      designAuthority: WorkspaceAuthority.NONE,
      operationsAuthority: WorkspaceAuthority.NONE,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.NONE,
      createdAt: now,
      updatedAt: now,
    });

    tenantEm.persist([viewerMembership, editorMembership, noneMembership]);

    await tenantEm.flush();
  });

  afterAll(async () => {
    if (orm) {
      try {
        // Drop test schema
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchemaName}" CASCADE`);

        // Clean up system categories
        await orm.em.execute('DELETE FROM public.category');

        // Delete test organization
        const em = orm.em.fork();
        const org = await em.findOne(Organization, { id: testOrgId });
        if (org) {
          em.remove(org);
          await em.flush();
        }
      } catch {
        // Ignore cleanup errors
      }
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    // Clean up category adoptions and tenant categories before each test
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);
    await tenantEm.execute('DELETE FROM category_adoption');
    await tenantEm.execute('DELETE FROM tenant_category');
  });

  /**
   * Creates a Hono app with the category adoption router and a middleware that sets
   * the tenant schema and user membership based on the provided user ID.
   */
  function createTestApp(userId: string): Hono<Env> {
    const testApp = new Hono<Env>();

    // Middleware to load user and membership from database
    testApp.use('*', async (c, next) => {
      c.set('tenantSchema', testSchemaName);
      c.set('userId', userId);

      // Load membership from database
      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const membership = await tenantEm.findOne(OrganizationUser, { user: userId });
      if (membership) {
        c.set('membership', membership);
      }

      return next();
    });

    testApp.route('/category-adoption', createCategoryAdoptionRouter({ orm }));
    return testApp;
  }

  // ============================================================================
  // GET / - List adopted categories
  // ============================================================================

  describe('GET /category-adoption', () => {
    it('allows user with VIEWER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/category-adoption');

      expect(res.status).toBe(200);
      const data = (await res.json()) as AdoptionListResponse;
      expect(data.data).toBeInstanceOf(Array);
      expect(data.meta?.total).toBe(0);
    });

    it('denies user with NONE authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request('/category-adoption');

      expect(res.status).toBe(403);
    });

    it('returns adopted categories with category details', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // First adopt a category
      const editorApp = createTestApp(editorUserId);
      await editorApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'POST',
      });

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/category-adoption');

      expect(res.status).toBe(200);
      const data = (await res.json()) as AdoptionListResponse;
      expect(data.data.length).toBe(1);
      expect(data.data[0]?.name).toBe('Apparel');
      expect(data.meta?.total).toBe(1);
    });
  });

  // ============================================================================
  // GET /available - List available categories for adoption
  // ============================================================================

  describe('GET /category-adoption/available', () => {
    it('allows user with VIEWER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/category-adoption/available');

      expect(res.status).toBe(200);
      const data = (await res.json()) as AvailableListResponse;
      expect(data.data).toBeInstanceOf(Array);
      expect(data.data.length).toBe(3); // All 3 test categories
    });

    it('denies user with NONE authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request('/category-adoption/available');

      expect(res.status).toBe(403);
    });

    it('excludes already adopted categories', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // First adopt a category
      const editorApp = createTestApp(editorUserId);
      await editorApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'POST',
      });

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/category-adoption/available');

      expect(res.status).toBe(200);
      const data = (await res.json()) as AvailableListResponse;
      expect(data.data.length).toBe(2); // 2 remaining categories
      expect(data.data.find(c => c.name === 'Apparel')).toBeUndefined();
    });

    it('filters by targetType', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/category-adoption/available?targetType=PRODUCT');

      expect(res.status).toBe(200);
      const data = (await res.json()) as AvailableListResponse;
      expect(data.data.length).toBe(1);
      expect(data.data[0]?.targetType).toBe('PRODUCT');
    });
  });

  // ============================================================================
  // POST /:categoryId - Adopt a category
  // ============================================================================

  describe('POST /category-adoption/:categoryId', () => {
    it('allows user with EDITOR authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'POST',
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as AdoptionResponse;
      expect(data.data.adoption.systemCategoryId).toBe(categoryIds['apparel']);
      expect(data.data.tenantCategory.name).toBe('Apparel');
      expect(data.data.adoption.adoptedAt).toBeDefined();
    });

    it('denies user with VIEWER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'POST',
      });

      expect(res.status).toBe(403);
    });

    it('denies user with NONE authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'POST',
      });

      expect(res.status).toBe(403);
    });

    it('returns 409 Conflict if already adopted', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);

      // First adoption
      await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'POST',
      });

      // Second adoption should fail
      const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'POST',
      });

      expect(res.status).toBe(409);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.code).toBe('CONFLICT');
      expect(data.error.message).toContain('already adopted');
    });

    it('returns 404 if category does not exist', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request('/category-adoption/nonexistent-category-id', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.code).toBe('NOT_FOUND');
      expect(data.error.message).toContain('Category not found');
    });

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
  });

  // ============================================================================
  // DELETE /:categoryId - Remove category adoption
  // ============================================================================

  describe('DELETE /category-adoption/:categoryId', () => {
    it('allows user with EDITOR authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);

      // First adopt the category
      await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'POST',
      });

      // Then unadopt
      const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { message: string } };
      expect(data.data.message).toContain('removed');
    });

    it('denies user with VIEWER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // First adopt as editor
      const editorApp = createTestApp(editorUserId);
      await editorApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'POST',
      });

      // Try to unadopt as viewer
      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(403);
    });

    it('denies user with NONE authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(403);
    });

    it('returns 404 if category not adopted', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.code).toBe('NOT_FOUND');
      expect(data.error.message).toContain('not adopted');
    });
  });

  // ============================================================================
  // Multi-tenant isolation
  // ============================================================================

  describe('Multi-tenant isolation', () => {
    it('category adoptions are isolated to their tenant schema', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Adopt a category in the test tenant
      const testApp = createTestApp(editorUserId);
      await testApp.request(`/category-adoption/${categoryIds['apparel']}`, {
        method: 'POST',
      });

      // Verify the adoption exists in the test tenant
      const res = await testApp.request('/category-adoption');
      expect(res.status).toBe(200);
      const data = (await res.json()) as AdoptionListResponse;
      expect(data.data.length).toBe(1);

      // Verify the adoption table does NOT exist in public schema
      const publicEm = orm.em.fork({ schema: 'public' });
      const publicTables = await publicEm.execute<{ count: string }[]>(
        `SELECT COUNT(*) as count FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'category_adoption'`
      );
      expect(publicTables[0]?.count).toBe('0');
    });
  });
});
