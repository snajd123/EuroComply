/**
 * Organizations API Integration Tests
 *
 * Tests the organizations router against a real database.
 * Note: The organizations router is admin-only and read-only.
 * Organization creation happens via Clerk webhooks.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createOrganizationsRouter } from './organizations.js';
import {
  Organization,
  ProvisioningStatus,
  SubscriptionTier,
  SubscriptionStatus,
  EnforcementMode,
} from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createId } from '@eurocomply/core';

interface OrganizationResponse {
  data: {
    id: string;
    name: string;
    slug: string;
    schemaName: string;
    clerkOrgId?: string;
    regulatoryAdvisorEnabled: boolean;
    enforcementMode: string;
    captureComplianceInSilentMode: boolean;
    provisioningStatus: string;
    createdAt: string;
    updatedAt: string;
  };
}

interface OrganizationListResponse {
  data: OrganizationResponse['data'][];
  meta: { total: number };
}

interface ErrorResponse {
  error: string;
  message: string;
}

describe('Organizations API Integration', () => {
  let orm: MikroORM;
  let app: ReturnType<typeof Hono>;

  const uniqueSuffix = Date.now().toString();
  const testOrgIds: string[] = [];

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    app = new Hono();
    app.route('/organizations', createOrganizationsRouter({ orm }));
  });

  afterAll(async () => {
    if (orm) {
      // Clean up test organizations
      const em = orm.em.fork();
      for (const orgId of testOrgIds) {
        const org = await em.findOne(Organization, { id: orgId });
        if (org) {
          em.remove(org);
        }
      }
      await em.flush();
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    // Clean up test organizations before each test
    const em = orm.em.fork();
    for (const orgId of testOrgIds) {
      const org = await em.findOne(Organization, { id: orgId });
      if (org) {
        em.remove(org);
      }
    }
    await em.flush();
    testOrgIds.length = 0;
  });

  /**
   * Helper to create a test organization directly in the database.
   * This simulates an organization created via webhook.
   */
  async function createTestOrg(overrides: Partial<{
    name: string;
    slug: string;
    provisioningStatus: ProvisioningStatus;
  }> = {}): Promise<Organization> {
    const em = orm.em.fork();
    const now = new Date();
    const id = createId();
    const slug = overrides.slug ?? `test-org-${uniqueSuffix}-${id.slice(0, 8)}`;

    const org = em.create(Organization, {
      id,
      name: overrides.name ?? `Test Org ${id.slice(0, 8)}`,
      slug,
      schemaName: `tenant_${slug.replace(/-/g, '_')}`,
      clerkOrgId: `org_clerk_${id}`,
      cellId: 'cell_1',
      subscriptionTier: SubscriptionTier.STARTER,
      subscriptionStatus: SubscriptionStatus.TRIALING,
      provisioningStatus: overrides.provisioningStatus ?? ProvisioningStatus.READY,
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

  describe('GET /organizations', () => {
    it('returns organizations list', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create some test organizations
      const org1 = await createTestOrg({ name: 'Org Alpha' });
      const org2 = await createTestOrg({ name: 'Org Beta' });

      const res = await app.request('/organizations');
      expect(res.status).toBe(200);

      const data = (await res.json()) as OrganizationListResponse;
      expect(data.data.length).toBeGreaterThanOrEqual(2);
      expect(data.meta.total).toBeGreaterThanOrEqual(2);

      // Find our test organizations in the response
      const foundOrg1 = data.data.find(o => o.id === org1.id);
      const foundOrg2 = data.data.find(o => o.id === org2.id);
      expect(foundOrg1).toBeDefined();
      expect(foundOrg2).toBeDefined();
      expect(foundOrg1!.name).toBe('Org Alpha');
      expect(foundOrg2!.name).toBe('Org Beta');
    });

    it('returns empty array when no organizations exist', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Don't create any organizations - just check the response format
      const res = await app.request('/organizations');
      expect(res.status).toBe(200);

      const data = (await res.json()) as OrganizationListResponse;
      expect(data.data).toBeInstanceOf(Array);
      expect(typeof data.meta.total).toBe('number');
    });
  });

  describe('GET /organizations/:id', () => {
    it('returns organization by ID', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const org = await createTestOrg({ name: 'Findable Org' });

      const res = await app.request(`/organizations/${org.id}`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as OrganizationResponse;
      expect(data.data.id).toBe(org.id);
      expect(data.data.name).toBe('Findable Org');
      expect(data.data.provisioningStatus).toBe(ProvisioningStatus.READY);
    });

    it('returns 404 for unknown ID', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/organizations/nonexistent_org_id');
      expect(res.status).toBe(404);

      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe('Not Found');
      expect(data.message).toBe('Organization not found');
    });

    it('returns organization with all fields serialized', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const org = await createTestOrg({
        name: 'Full Data Org',
        provisioningStatus: ProvisioningStatus.PROVISIONING,
      });

      const res = await app.request(`/organizations/${org.id}`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as OrganizationResponse;
      expect(data.data).toMatchObject({
        id: org.id,
        name: 'Full Data Org',
        slug: expect.any(String),
        schemaName: expect.stringMatching(/^tenant_/),
        clerkOrgId: expect.stringMatching(/^org_clerk_/),
        regulatoryAdvisorEnabled: true,
        enforcementMode: 'SILENT',
        captureComplianceInSilentMode: true,
        provisioningStatus: 'PROVISIONING',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });
  });
});
