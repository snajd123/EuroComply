/**
 * Tenant Categories API Integration Tests
 *
 * Tests the tenant-categories router against a real database with proper tenant isolation,
 * authorization, and multi-tenant safety.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createTenantCategoriesRouter } from './tenant-categories.js';
import {
  Organization,
  User,
  OrganizationUser,
  TenantCategory,
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

interface CategoryData {
  id: string;
  name: string;
  path: string;
  type: string;
  targetType: string;
  depth?: number;
  parentId?: string;
}

interface CategoryResponse {
  data: CategoryData;
}

interface CategoryListResponse {
  data: CategoryData[];
  meta?: { total?: number };
}

interface ErrorResponse {
  error: { code: string; message: string };
}

describe('Tenant Categories API Integration', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;

  const uniqueSuffix = Date.now().toString();
  const testSchemaName = `tenant_cat_${uniqueSuffix.slice(-8)}`;

  let testOrgId: string;
  let viewerUserId: string;
  let editorUserId: string;
  let managerUserId: string;
  let noneUserId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);

    const em = orm.em.fork();
    const now = new Date();
    testOrgId = createId();

    const org = em.create(Organization, {
      id: testOrgId,
      name: `Categories Test Org ${uniqueSuffix}`,
      slug: `categories-test-${uniqueSuffix}`,
      schemaName: testSchemaName,
      clerkOrgId: `org_categories_test_${uniqueSuffix}`,
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

    const result = await provisioner.provisionTenant(testSchemaName);
    if (!result.success) {
      throw new Error(`Failed to provision test tenant: ${result.error}`);
    }

    org.provisioningStatus = ProvisioningStatus.READY;
    await em.flush();

    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

    viewerUserId = createId();
    editorUserId = createId();
    managerUserId = createId();
    noneUserId = createId();

    const viewerUser = tenantEm.create(User, {
      id: viewerUserId,
      clerkId: `clerk_viewer_cat_${uniqueSuffix}`,
      email: `viewer_cat_${uniqueSuffix}@test.com`,
      name: 'Viewer User',
      createdAt: now,
      updatedAt: now,
    });

    const editorUser = tenantEm.create(User, {
      id: editorUserId,
      clerkId: `clerk_editor_cat_${uniqueSuffix}`,
      email: `editor_cat_${uniqueSuffix}@test.com`,
      name: 'Editor User',
      createdAt: now,
      updatedAt: now,
    });

    const managerUser = tenantEm.create(User, {
      id: managerUserId,
      clerkId: `clerk_manager_cat_${uniqueSuffix}`,
      email: `manager_cat_${uniqueSuffix}@test.com`,
      name: 'Manager User',
      createdAt: now,
      updatedAt: now,
    });

    const noneUser = tenantEm.create(User, {
      id: noneUserId,
      clerkId: `clerk_none_cat_${uniqueSuffix}`,
      email: `none_cat_${uniqueSuffix}@test.com`,
      name: 'None User',
      createdAt: now,
      updatedAt: now,
    });

    tenantEm.persist([viewerUser, editorUser, managerUser, noneUser]);

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

    const managerMembership = tenantEm.create(OrganizationUser, {
      id: createId(),
      user: managerUser,
      isOrgAdmin: false,
      designAuthority: WorkspaceAuthority.MANAGER,
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

    tenantEm.persist([viewerMembership, editorMembership, managerMembership, noneMembership]);
    await tenantEm.flush();
  });

  afterAll(async () => {
    if (orm) {
      try {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchemaName}" CASCADE`);

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

    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);
    await tenantEm.nativeDelete(TenantCategory, {});
  });

  function createTestApp(userId: string): Hono<Env> {
    const testApp = new Hono<Env>();

    testApp.use('*', async (c, next) => {
      c.set('tenantSchema', testSchemaName);
      c.set('userId', userId);

      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const membership = await tenantEm.findOne(OrganizationUser, { user: userId });
      if (membership) {
        c.set('membership', membership);
      }

      return next();
    });

    testApp.route('/tenant-categories', createTenantCategoriesRouter({ orm }));
    return testApp;
  }

  describe('GET /tenant-categories', () => {
    it('allows user with VIEWER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/tenant-categories');

      expect(res.status).toBe(200);
      const data = (await res.json()) as CategoryListResponse;
      expect(data.data).toBeInstanceOf(Array);
      expect(data.meta?.total).toBe(0);
    });

    it('allows user with EDITOR authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request('/tenant-categories');

      expect(res.status).toBe(200);
    });

    it('allows user with MANAGER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request('/tenant-categories');

      expect(res.status).toBe(200);
    });

    it('denies user with NONE authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request('/tenant-categories');

      expect(res.status).toBe(403);
    });

    it('returns categories list', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const category = new TenantCategory();
      category.name = 'Test Category';
      category.path = 'test_category';
      category.type = 'ROOT';
      category.targetType = 'PRODUCT';
      category.depth = 0;
      category.isActive = true;
      await tenantEm.persistAndFlush(category);

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/tenant-categories');

      expect(res.status).toBe(200);
      const data = (await res.json()) as CategoryListResponse;
      expect(data.data.length).toBe(1);
      expect(data.data[0]?.name).toBe('Test Category');
    });
  });

  describe('POST /tenant-categories', () => {
    it('allows user with MANAGER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request('/tenant-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Category',
          type: 'ROOT',
          targetType: 'PRODUCT',
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as CategoryResponse;
      expect(data.data.name).toBe('New Category');
      expect(data.data.type).toBe('ROOT');
      expect(data.data.targetType).toBe('PRODUCT');
    });

    it('denies user with EDITOR authority (requires MANAGER)', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request('/tenant-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Category',
          type: 'ROOT',
          targetType: 'PRODUCT',
        }),
      });

      expect(res.status).toBe(403);
    });

    it('denies user with VIEWER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/tenant-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Category',
          type: 'ROOT',
          targetType: 'PRODUCT',
        }),
      });

      expect(res.status).toBe(403);
    });

    it('requires type field', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request('/tenant-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Missing Type',
          targetType: 'PRODUCT',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('requires targetType field', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request('/tenant-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Missing TargetType',
          type: 'ROOT',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('validates type enum values', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request('/tenant-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Type',
          type: 'INVALID',
          targetType: 'PRODUCT',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('validates targetType enum values', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request('/tenant-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid TargetType',
          type: 'ROOT',
          targetType: 'INVALID',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('creates child category with parent', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create parent first
      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const parent = new TenantCategory();
      parent.name = 'Parent Category';
      parent.path = 'parent_category';
      parent.type = 'ROOT';
      parent.targetType = 'PRODUCT';
      parent.depth = 0;
      parent.isActive = true;
      await tenantEm.persistAndFlush(parent);

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request('/tenant-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Child Category',
          type: 'BRANCH',
          targetType: 'PRODUCT',
          parentId: parent.id,
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as CategoryResponse;
      expect(data.data.name).toBe('Child Category');
      expect(data.data.path).toBe('parent_category.child_category');
      expect(data.data.depth).toBe(1);
    });

    it('returns 404 if parent not found', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request('/tenant-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Orphan Category',
          type: 'BRANCH',
          targetType: 'PRODUCT',
          parentId: 'nonexistent_parent',
        }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 409 on path collision', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const existing = new TenantCategory();
      existing.name = 'Duplicate';
      existing.path = 'duplicate';
      existing.type = 'ROOT';
      existing.targetType = 'PRODUCT';
      existing.depth = 0;
      existing.isActive = true;
      await tenantEm.persistAndFlush(existing);

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request('/tenant-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Duplicate',
          type: 'ROOT',
          targetType: 'PRODUCT',
        }),
      });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /tenant-categories/:id', () => {
    it('allows user with VIEWER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const category = new TenantCategory();
      category.name = 'Get Test Category';
      category.path = 'get_test_category';
      category.type = 'ROOT';
      category.targetType = 'PRODUCT';
      category.depth = 0;
      category.isActive = true;
      await tenantEm.persistAndFlush(category);

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request(`/tenant-categories/${category.id}`);

      expect(res.status).toBe(200);
      const data = (await res.json()) as CategoryResponse;
      expect(data.data.id).toBe(category.id);
      expect(data.data.name).toBe('Get Test Category');
    });

    it('denies user with NONE authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request('/tenant-categories/any_id');

      expect(res.status).toBe(403);
    });

    it('returns 404 if category not found', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/tenant-categories/nonexistent_category');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /tenant-categories/:id', () => {
    it('allows user with MANAGER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const category = new TenantCategory();
      category.name = 'Original Name';
      category.path = 'original_name';
      category.type = 'ROOT';
      category.targetType = 'PRODUCT';
      category.depth = 0;
      category.isActive = true;
      await tenantEm.persistAndFlush(category);

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request(`/tenant-categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Name',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { id: string; name: string; updated: boolean } };
      expect(data.data.name).toBe('Updated Name');
      expect(data.data.updated).toBe(true);
    });

    it('denies user with EDITOR authority (requires MANAGER)', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request('/tenant-categories/any_id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Name',
        }),
      });

      expect(res.status).toBe(403);
    });

    it('returns 404 if category not found', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request('/tenant-categories/nonexistent_id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Name',
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /tenant-categories/:id', () => {
    it('allows user with MANAGER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const category = new TenantCategory();
      category.name = 'Delete Me';
      category.path = 'delete_me';
      category.type = 'ROOT';
      category.targetType = 'PRODUCT';
      category.depth = 0;
      category.isActive = true;
      await tenantEm.persistAndFlush(category);

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request(`/tenant-categories/${category.id}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { deleted: string } };
      expect(data.data.deleted).toBe(category.id);
    });

    it('denies user with EDITOR authority (requires MANAGER)', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request('/tenant-categories/any_id', {
        method: 'DELETE',
      });

      expect(res.status).toBe(403);
    });

    it('returns 404 if category not found', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request('/tenant-categories/nonexistent_id', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });

    it('returns 409 if category has children', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const parent = new TenantCategory();
      parent.name = 'Parent With Children';
      parent.path = 'parent_with_children';
      parent.type = 'ROOT';
      parent.targetType = 'PRODUCT';
      parent.depth = 0;
      parent.isActive = true;
      await tenantEm.persistAndFlush(parent);

      const child = new TenantCategory();
      child.name = 'Child';
      child.path = 'parent_with_children.child';
      child.type = 'LEAF';
      child.targetType = 'PRODUCT';
      child.depth = 1;
      child.parent = parent;
      child.isActive = true;
      await tenantEm.persistAndFlush(child);

      const testApp = createTestApp(managerUserId);
      const res = await testApp.request(`/tenant-categories/${parent.id}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(409);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.code).toBe('CONFLICT');
      expect(data.error.message).toContain('children');
    });
  });

  describe('Multi-tenant isolation', () => {
    it('categories are isolated to their tenant schema', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const category = new TenantCategory();
      category.name = 'Isolated Category';
      category.path = 'isolated_category';
      category.type = 'ROOT';
      category.targetType = 'PRODUCT';
      category.depth = 0;
      category.isActive = true;
      await tenantEm.persistAndFlush(category);

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/tenant-categories');

      expect(res.status).toBe(200);
      const data = (await res.json()) as CategoryListResponse;
      expect(data.data.length).toBe(1);
      expect(data.data[0]?.name).toBe('Isolated Category');

      // Verify tenant_category table does NOT exist in public schema
      const publicEm = orm.em.fork({ schema: 'public' });
      const publicTables = await publicEm.execute(
        `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_category'`
      );
      expect((publicTables[0] as { count: string }).count).toBe('0');
    });
  });
});
