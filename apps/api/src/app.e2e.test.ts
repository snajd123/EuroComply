/**
 * EuroComply API E2E Tests
 *
 * Tests the full application stack with real database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from './app.js';
import { createOrganizationsAdminRouter } from './routes/organizations.js';
import {
  Organization,
  TenantProvisioner,
  ProvisioningStatus,
  SubscriptionTier,
  SubscriptionStatus,
  EnforcementMode,
} from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createId } from '@eurocomply/core';

// Type definitions for API responses
interface ApiMeta {
  requestId: string;
  timestamp: string;
  total?: number;
}

interface HealthResponse {
  success: true;
  data: { status: string };
  meta: ApiMeta;
}

interface ApiInfoResponse {
  success: true;
  data: { message: string };
  meta: ApiMeta;
}

interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  provisioningStatus: string;
}

interface OrganizationResponse {
  success: true;
  data: OrganizationData;
  meta: ApiMeta;
}

interface OrganizationListResponse {
  success: true;
  data: OrganizationData[];
  meta: ApiMeta;
}

const TEST_ADMIN_KEY = 'test-admin-key-12345';

describe('EuroComply API E2E', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;
  let app: ReturnType<typeof createApp>;

  const uniqueSuffix = Date.now().toString();
  const testOrgIds: string[] = [];

  beforeAll(async () => {
    // Set admin key for testing
    process.env['ADMIN_API_KEY'] = TEST_ADMIN_KEY;

    if (!(await isDatabaseAvailable())) {
      // Create minimal app without database for health/info tests
      app = createApp();
      return;
    }

    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);

    // Create full app with database
    const organizationsAdminRouter = createOrganizationsAdminRouter({ orm, provisioner });
    app = createApp({
      orm,
      organizationsAdminRouter,
    });
  });

  afterAll(async () => {
    if (orm) {
      // Clean up test organizations
      const em = orm.em.fork();
      for (const orgId of testOrgIds) {
        const org = await em.findOne(Organization, { id: orgId });
        if (org) {
          // Drop schema if exists
          try {
            await orm.em.execute(`DROP SCHEMA IF EXISTS "${org.schemaName}" CASCADE`);
          } catch {
            // Ignore
          }
          em.remove(org);
        }
      }
      await em.flush();
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (!orm) return;

    // Clean up test organizations before each test
    const em = orm.em.fork();
    for (const orgId of testOrgIds) {
      const org = await em.findOne(Organization, { id: orgId });
      if (org) {
        try {
          await orm.em.execute(`DROP SCHEMA IF EXISTS "${org.schemaName}" CASCADE`);
        } catch {
          // Ignore
        }
        em.remove(org);
      }
    }
    await em.flush();
    testOrgIds.length = 0;
  });

  /**
   * Helper to create a test organization directly in database.
   */
  async function createTestOrg(overrides: Partial<{
    name: string;
    slug: string;
  }> = {}): Promise<Organization> {
    const em = orm.em.fork();
    const now = new Date();
    const id = createId();
    const slug = overrides.slug ?? `e2e-test-${uniqueSuffix}-${id.slice(0, 8)}`;

    const org = em.create(Organization, {
      id,
      name: overrides.name ?? `E2E Test Org ${id.slice(0, 8)}`,
      slug,
      schemaName: `tenant_${slug.replace(/-/g, '_')}`,
      clerkOrgId: `org_clerk_${id}`,
      cellId: 'cell_1',
      subscriptionTier: SubscriptionTier.STARTER,
      subscriptionStatus: SubscriptionStatus.TRIALING,
      provisioningStatus: ProvisioningStatus.READY,
      regulatoryAdvisorEnabled: true,
      enforcementMode: EnforcementMode.SILENT,
      captureComplianceInSilentMode: true,
      createdAt: now,
      updatedAt: now,
    });

    await em.persistAndFlush(org);
    testOrgIds.push(id);
    return org;
  }

  describe('Health Check', () => {
    it('GET /health returns healthy status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const body = (await res.json()) as HealthResponse;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('healthy');
      expect(body.meta.timestamp).toBeDefined();
      expect(body.meta.requestId).toMatch(/^req_/);
    });
  });

  describe('API Info', () => {
    it('GET /api/v1 returns API info', async () => {
      const res = await app.request('/api/v1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as ApiInfoResponse;
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('EuroComply API v1');
    });
  });

  describe('Admin Authentication', () => {
    it('rejects requests without admin key', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/api/v1/admin/organizations');
      expect(res.status).toBe(401);
    });

    it('rejects requests with invalid admin key', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/api/v1/admin/organizations', {
        headers: { 'X-Admin-Key': 'invalid-key' },
      });
      expect(res.status).toBe(401);
    });

    it('accepts requests with valid admin key', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/api/v1/admin/organizations', {
        headers: { 'X-Admin-Key': TEST_ADMIN_KEY },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('Organization Management (Admin)', () => {
    it('lists organizations', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create test orgs
      const org1 = await createTestOrg({ name: 'Test Org Alpha' });
      const org2 = await createTestOrg({ name: 'Test Org Beta' });

      const res = await app.request('/api/v1/admin/organizations', {
        headers: { 'X-Admin-Key': TEST_ADMIN_KEY },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as OrganizationListResponse;
      expect(data.data.length).toBeGreaterThanOrEqual(2);

      const foundOrg1 = data.data.find((o) => o.id === org1.id);
      const foundOrg2 = data.data.find((o) => o.id === org2.id);
      expect(foundOrg1).toBeDefined();
      expect(foundOrg2).toBeDefined();
    });

    it('retrieves organization by ID', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const org = await createTestOrg({ name: 'Retrieve Test Org' });

      const res = await app.request(`/api/v1/admin/organizations/${org.id}`, {
        headers: { 'X-Admin-Key': TEST_ADMIN_KEY },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as OrganizationResponse;
      expect(data.data.id).toBe(org.id);
      expect(data.data.name).toBe('Retrieve Test Org');
    });

    it('returns 404 for non-existent organization', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/api/v1/admin/organizations/nonexistent_id', {
        headers: { 'X-Admin-Key': TEST_ADMIN_KEY },
      });

      expect(res.status).toBe(404);
    });
  });
});
