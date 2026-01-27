/**
 * Products API Integration Tests
 *
 * Tests the products router against a real database with proper tenant isolation,
 * authorization, and multi-tenant safety.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createProductsRouter } from './products.js';
import {
  Organization,
  User,
  OrganizationUser,
  TenantCategory,
  Product,
  TenantProvisioner,
  ProvisioningStatus,
  SubscriptionTier,
  SubscriptionStatus,
  EnforcementMode,
  WorkspaceAuthority,
  ProductStatus,
} from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createId } from '@eurocomply/core';
import type { Env } from '../app.js';

// Response types for type-safe test assertions
interface ProductData {
  id: string;
  name: string;
  categoryId: string;
  status?: string;
}

interface ProductResponse {
  data: ProductData;
}

interface ProductListResponse {
  data: ProductData[];
  meta?: { total?: number; count?: number };
}

interface ErrorResponse {
  error: { code: string; message: string };
}

describe('Products API Integration', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;
  let app: Hono<Env>;

  // Test tenant
  const testSchemaName = 'tenant_products_test';
  const uniqueSuffix = Date.now().toString();

  // Test data IDs
  let testOrgId: string;
  let testCategoryId: string;
  let testProductId: string;
  let viewerUserId: string;
  let editorUserId: string;
  let noneUserId: string;

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
      name: `Products Test Org ${uniqueSuffix}`,
      slug: `products-test-${uniqueSuffix}`,
      schemaName: testSchemaName,
      clerkOrgId: `org_products_test_${uniqueSuffix}`,
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

    // Create a test tenant category
    testCategoryId = createId();
    const category = new TenantCategory();
    category.id = testCategoryId;
    category.name = 'Test Category';
    category.path = 'test_category';
    category.createdAt = now;
    category.updatedAt = now;
    tenantEm.persist(category);

    await tenantEm.flush();
  });

  afterAll(async () => {
    if (orm) {
      try {
        // Drop test schema
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchemaName}" CASCADE`);

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

    // Clean up products before each test
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);
    await tenantEm.nativeDelete(Product, {});
  });

  /**
   * Creates a Hono app with the products router and a middleware that sets
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

    testApp.route('/products', createProductsRouter({ orm }));
    return testApp;
  }

  describe('GET /products', () => {
    it('allows user with VIEWER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/products');

      expect(res.status).toBe(200);
      const data = (await res.json()) as ProductListResponse;
      expect(data.data).toBeInstanceOf(Array);
      expect(data.meta?.total).toBe(0);
    });

    it('allows user with EDITOR authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request('/products');

      expect(res.status).toBe(200);
    });

    it('denies user with NONE authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request('/products');

      expect(res.status).toBe(403);
    });

    it('returns products list', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create a test product
      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const category = await tenantEm.findOne(TenantCategory, { id: testCategoryId });
      const product = tenantEm.create(Product, {
        id: createId(),
        name: 'Test Product',
        category: category!,
        status: ProductStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await tenantEm.persistAndFlush(product);

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/products');

      expect(res.status).toBe(200);
      const data = (await res.json()) as ProductListResponse;
      expect(data.data.length).toBe(1);
      expect(data.data[0]?.name).toBe('Test Product');
    });
  });

  describe('POST /products', () => {
    it('allows user with EDITOR authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Product',
          categoryId: testCategoryId,
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as ProductResponse;
      expect(data.data.name).toBe('New Product');
      expect(data.data.categoryId).toBe(testCategoryId);
    });

    it('denies user with VIEWER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Product',
          categoryId: testCategoryId,
        }),
      });

      expect(res.status).toBe(403);
    });

    it('denies user with NONE authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Product',
          categoryId: testCategoryId,
        }),
      });

      expect(res.status).toBe(403);
    });

    it('returns 400 if category not found', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Product',
          categoryId: 'nonexistent_category',
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.message).toBe('Category not found');
    });
  });

  describe('GET /products/:id', () => {
    it('allows user with VIEWER authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create a test product
      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const category = await tenantEm.findOne(TenantCategory, { id: testCategoryId });
      testProductId = createId();
      const product = tenantEm.create(Product, {
        id: testProductId,
        name: 'Get Test Product',
        category: category!,
        status: ProductStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await tenantEm.persistAndFlush(product);

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request(`/products/${testProductId}`);

      expect(res.status).toBe(200);
      const data = (await res.json()) as ProductResponse;
      expect(data.data.id).toBe(testProductId);
      expect(data.data.name).toBe('Get Test Product');
    });

    it('denies user with NONE authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request('/products/any_id');

      expect(res.status).toBe(403);
    });

    it('returns 404 if product not found', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/products/nonexistent_product');

      expect(res.status).toBe(404);
    });
  });

  describe('Multi-tenant isolation', () => {
    it('products are isolated to their tenant schema', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create a product in the test schema
      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const category = await tenantEm.findOne(TenantCategory, { id: testCategoryId });
      const product = tenantEm.create(Product, {
        id: createId(),
        name: 'Isolated Product',
        category: category!,
        status: ProductStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await tenantEm.persistAndFlush(product);

      // Verify the product exists in the test schema
      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request('/products');

      expect(res.status).toBe(200);
      const data = (await res.json()) as ProductListResponse;
      expect(data.data.length).toBe(1);
      expect(data.data[0]?.name).toBe('Isolated Product');

      // Verify the product does NOT exist in the public schema
      const publicEm = orm.em.fork({ schema: 'public' });
      const publicProducts = await publicEm.execute(
        `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product'`
      );
      // Products table should not exist in public schema
      expect((publicProducts[0] as { count: string }).count).toBe('0');
    });
  });
});
