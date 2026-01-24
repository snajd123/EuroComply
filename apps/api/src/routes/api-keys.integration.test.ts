/**
 * API Keys Management Integration Tests
 *
 * Tests the API keys router against a real database.
 * API key management requires org admin privileges.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createApiKeysRouter } from './api-keys.js';
import {
  Organization,
  User,
  OrganizationUser,
  ApiKey,
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

describe('API Keys Management Integration', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;

  const uniqueSuffix = Date.now().toString();
  const testSchemaName = `tenant_apikeys_test_${uniqueSuffix.slice(-8)}`;

  let testOrgId: string;
  let adminUserId: string;
  let regularUserId: string;

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
      name: `API Keys Test Org ${uniqueSuffix}`,
      slug: `apikeys-test-${uniqueSuffix}`,
      schemaName: testSchemaName,
      clerkOrgId: `org_apikeys_${uniqueSuffix}`,
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

    // Provision tenant schema
    const result = await provisioner.provisionTenant(testSchemaName);
    if (!result.success) {
      throw new Error(`Failed to provision test tenant: ${result.error}`);
    }

    org.provisioningStatus = ProvisioningStatus.READY;
    await em.flush();

    // Create users and memberships in tenant schema
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

    adminUserId = createId();
    regularUserId = createId();

    const adminUser = tenantEm.create(User, {
      id: adminUserId,
      clerkId: `clerk_admin_${uniqueSuffix}`,
      email: `admin_${uniqueSuffix}@test.com`,
      name: 'Admin User',
      createdAt: now,
      updatedAt: now,
    });

    const regularUser = tenantEm.create(User, {
      id: regularUserId,
      clerkId: `clerk_regular_${uniqueSuffix}`,
      email: `regular_${uniqueSuffix}@test.com`,
      name: 'Regular User',
      createdAt: now,
      updatedAt: now,
    });

    tenantEm.persist([adminUser, regularUser]);

    const adminMembership = tenantEm.create(OrganizationUser, {
      id: createId(),
      user: adminUser,
      clerkMembershipId: `mem_admin_${uniqueSuffix}`,
      isOrgAdmin: true,
      designAuthority: WorkspaceAuthority.MANAGER,
      operationsAuthority: WorkspaceAuthority.MANAGER,
      createdAt: now,
      updatedAt: now,
    });

    const regularMembership = tenantEm.create(OrganizationUser, {
      id: createId(),
      user: regularUser,
      clerkMembershipId: `mem_regular_${uniqueSuffix}`,
      isOrgAdmin: false,
      designAuthority: WorkspaceAuthority.VIEWER,
      operationsAuthority: WorkspaceAuthority.NONE,
      createdAt: now,
      updatedAt: now,
    });

    tenantEm.persist([adminMembership, regularMembership]);
    await tenantEm.flush();
  });

  afterAll(async () => {
    if (orm) {
      try {
        // Clean up API keys
        const em = orm.em.fork();
        await em.nativeDelete(ApiKey, { organization: testOrgId });

        // Drop test schema
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchemaName}" CASCADE`);

        // Delete test organization
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

    // Clean up API keys before each test
    const em = orm.em.fork();
    await em.nativeDelete(ApiKey, { organization: testOrgId });
  });

  /**
   * Creates a test app with middleware that sets up the user context
   */
  function createTestApp(userId: string, isAdmin: boolean): Hono<Env> {
    const app = new Hono<Env>();

    app.use('*', async (c, next) => {
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

    app.route('/api-keys', createApiKeysRouter({ em: orm.em as any }));
    return app;
  }

  describe('GET /api-keys', () => {
    it('allows org admin to list keys', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const app = createTestApp(adminUserId, true);
      const res = await app.request('/api-keys');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toBeInstanceOf(Array);
    });

    it('denies non-admin from listing keys', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const app = createTestApp(regularUserId, false);
      const res = await app.request('/api-keys');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api-keys', () => {
    it('allows org admin to create keys', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const app = createTestApp(adminUserId, true);
      const res = await app.request('/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Key' }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.name).toBe('Test Key');
      expect(data.rawKey).toBeDefined();
      expect(data.rawKey).toMatch(/^ek_/); // API key prefix
    });

    it('denies non-admin from creating keys', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const app = createTestApp(regularUserId, false);
      const res = await app.request('/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Key' }),
      });

      expect(res.status).toBe(403);
    });

    it('validates required name field', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const app = createTestApp(adminUserId, true);
      const res = await app.request('/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('name');
    });
  });

  describe('DELETE /api-keys/:id', () => {
    it('allows org admin to revoke keys', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // First create a key
      const app = createTestApp(adminUserId, true);
      const createRes = await app.request('/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Key to Revoke' }),
      });

      const createData = await createRes.json();
      const keyId = createData.data.id;

      // Then revoke it
      const revokeRes = await app.request(`/api-keys/${keyId}`, {
        method: 'DELETE',
      });

      expect(revokeRes.status).toBe(200);
      const revokeData = await revokeRes.json();
      expect(revokeData.success).toBe(true);
    });

    it('denies non-admin from revoking keys', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const app = createTestApp(regularUserId, false);
      const res = await app.request('/api-keys/any_key_id', {
        method: 'DELETE',
      });

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent key', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const app = createTestApp(adminUserId, true);
      const res = await app.request('/api-keys/nonexistent_key', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });
});
