/**
 * Organizations Admin API Integration Tests
 *
 * Tests the organizations admin router (provisioning, status, delete) against a real database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createOrganizationsAdminRouter } from './organizations.js';
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

describe('Organizations Admin API Integration', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;
  let app: ReturnType<typeof Hono>;

  const uniqueSuffix = Date.now().toString();
  const testOrgIds: string[] = [];
  const testSchemas: string[] = [];

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);

    app = new Hono();
    app.route('/organizations', createOrganizationsAdminRouter({ orm, provisioner }));
  });

  afterAll(async () => {
    if (orm) {
      // Clean up test schemas
      for (const schema of testSchemas) {
        try {
          await orm.em.execute(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } catch {
          // Ignore
        }
      }

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

    // Clean up test schemas before each test
    for (const schema of testSchemas) {
      try {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } catch {
        // Ignore
      }
    }
    testSchemas.length = 0;

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
   */
  async function createTestOrg(overrides: Partial<{
    name: string;
    slug: string;
    provisioningStatus: ProvisioningStatus;
    provisioningError?: string;
  }> = {}): Promise<Organization> {
    const em = orm.em.fork();
    const now = new Date();
    const id = createId();
    const slug = overrides.slug ?? `admin-test-${uniqueSuffix}-${id.slice(0, 8)}`;
    const schemaName = `tenant_${slug.replace(/-/g, '_')}`;

    const org = em.create(Organization, {
      id,
      name: overrides.name ?? `Admin Test Org ${id.slice(0, 8)}`,
      slug,
      schemaName,
      clerkOrgId: `org_clerk_${id}`,
      cellId: 'cell_1',
      subscriptionTier: SubscriptionTier.STARTER,
      subscriptionStatus: SubscriptionStatus.TRIALING,
      provisioningStatus: overrides.provisioningStatus ?? ProvisioningStatus.PENDING,
      provisioningError: overrides.provisioningError,
      regulatoryAdvisorEnabled: true,
      enforcementMode: EnforcementMode.SILENT,
      captureComplianceInSilentMode: true,
      createdAt: now,
      updatedAt: now,
    });

    await em.persistAndFlush(org);
    testOrgIds.push(id);
    testSchemas.push(schemaName);
    return org;
  }

  describe('GET /organizations/:id/status', () => {
    it('returns organization status by internal ID', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const org = await createTestOrg({
        provisioningStatus: ProvisioningStatus.PENDING,
      });

      const res = await app.request(`/organizations/${org.id}/status`);
      expect(res.status).toBe(200);

      const data = await res.json() as {
        id: string;
        provisioningStatus: string;
      };
      expect(data.id).toBe(org.id);
      expect(data.provisioningStatus).toBe('PENDING');
    });

    it('returns organization status by Clerk org ID', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const org = await createTestOrg({
        provisioningStatus: ProvisioningStatus.READY,
      });

      const res = await app.request(`/organizations/${org.clerkOrgId}/status`);
      expect(res.status).toBe(200);

      const data = await res.json() as {
        id: string;
        clerkOrgId: string;
        provisioningStatus: string;
      };
      expect(data.id).toBe(org.id);
      expect(data.clerkOrgId).toBe(org.clerkOrgId);
    });

    it('returns 404 for non-existent organization', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/organizations/nonexistent_org/status');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /organizations/:id/provision', () => {
    it('provisions a pending organization', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const org = await createTestOrg({
        provisioningStatus: ProvisioningStatus.PENDING,
      });

      const res = await app.request(`/organizations/${org.id}/provision`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean; provisioningStatus: string };
      expect(data.success).toBe(true);
      expect(data.provisioningStatus).toBe('READY');

      // Verify the schema was created
      const tables = await orm.em.execute<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = '${org.schemaName}'`
      );
      expect(tables.length).toBeGreaterThan(0);
    });

    it('provisions a failed organization (retry)', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const org = await createTestOrg({
        provisioningStatus: ProvisioningStatus.FAILED,
        provisioningError: 'Previous error',
      });

      const res = await app.request(`/organizations/${org.id}/provision`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean };
      expect(data.success).toBe(true);

      // Verify org status updated
      const em = orm.em.fork();
      const updatedOrg = await em.findOne(Organization, { id: org.id });
      expect(updatedOrg!.provisioningStatus).toBe(ProvisioningStatus.READY);
      // Database returns null for cleared nullable columns
      expect(updatedOrg!.provisioningError).toBeFalsy();
    });

    it('rejects provisioning for already provisioned organization', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // First, create and provision the org
      const org = await createTestOrg({
        provisioningStatus: ProvisioningStatus.PENDING,
      });
      await provisioner.provisionTenant(org.schemaName);

      // Update status to READY
      const em = orm.em.fork();
      const orgToUpdate = await em.findOne(Organization, { id: org.id });
      orgToUpdate!.provisioningStatus = ProvisioningStatus.READY;
      await em.flush();

      // Try to provision again
      const res = await app.request(`/organizations/${org.id}/provision`, {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toContain('already provisioned');
    });

    it('returns 404 for non-existent organization', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/organizations/nonexistent_org/provision', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /organizations/:id', () => {
    it('deletes organization and drops schema', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create and provision org
      const org = await createTestOrg({
        provisioningStatus: ProvisioningStatus.PENDING,
      });
      await provisioner.provisionTenant(org.schemaName);

      // Delete it
      const res = await app.request(`/organizations/${org.id}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean; schemaName: string };
      expect(data.success).toBe(true);
      expect(data.schemaName).toBe(org.schemaName);

      // Verify org is deleted
      const em = orm.em.fork();
      const deletedOrg = await em.findOne(Organization, { id: org.id });
      expect(deletedOrg).toBeNull();

      // Verify schema is dropped
      const schemas = await orm.em.execute<{ schema_name: string }[]>(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = '${org.schemaName}'`
      );
      expect(schemas.length).toBe(0);

      // Remove from tracking since it's already deleted
      const idx = testOrgIds.indexOf(org.id);
      if (idx > -1) testOrgIds.splice(idx, 1);
    });

    it('deletes organization by Clerk org ID', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const org = await createTestOrg({
        provisioningStatus: ProvisioningStatus.PENDING,
      });

      const res = await app.request(`/organizations/${org.clerkOrgId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);

      // Verify org is deleted
      const em = orm.em.fork();
      const deletedOrg = await em.findOne(Organization, { id: org.id });
      expect(deletedOrg).toBeNull();

      // Remove from tracking
      const idx = testOrgIds.indexOf(org.id);
      if (idx > -1) testOrgIds.splice(idx, 1);
    });

    it('returns 404 for non-existent organization', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/organizations/nonexistent_org', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });
});
