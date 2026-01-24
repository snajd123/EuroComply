// apps/api/src/webhooks/clerk-membership.integration.test.ts
// Integration tests for membership webhooks using real database
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createWebhooksRouter } from '../routes/webhooks.js';
import {
  Organization,
  User,
  OrganizationUser,
  OutboxEvent,
  TenantProvisioner,
  ProvisioningStatus,
  SubscriptionTier,
  SubscriptionStatus,
  EnforcementMode,
  WorkspaceAuthority,
  OutboxStatus,
} from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';

describe('Membership Webhooks Integration', () => {
  let orm: Awaited<ReturnType<typeof setupTestDb>>;
  let provisioner: TenantProvisioner;
  let app: ReturnType<typeof createApp>;

  // Test organization created via organization.created webhook
  const testClerkOrgId = 'org_membership_test';
  const testSchemaName = 'tenant_org_hip_test'; // Last 8 chars of 'membership_test'

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);

    const webhooksRouter = createWebhooksRouter({
      orm,
      provisioner,
      webhookSecret: 'whsec_test',
      skipSignatureVerification: true,
    });

    app = createApp({ webhooksRouter });
  });

  afterAll(async () => {
    if (orm) {
      // Cleanup test schema and organization
      try {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchemaName}" CASCADE`);
        const em = orm.em.fork();
        const org = await em.findOne(Organization, { clerkOrgId: testClerkOrgId });
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
    // Clean up any existing test data
    const em = orm.em.fork();

    // Clean up users in tenant schema if it exists
    try {
      await em.execute(`DELETE FROM "${testSchemaName}".users WHERE clerk_id LIKE 'user_test%'`);
      await em.execute(`DELETE FROM "${testSchemaName}".outbox_event WHERE aggregate_type = 'User'`);
    } catch {
      // Schema may not exist yet
    }
  });

  /**
   * Helper to provision a test organization
   */
  async function ensureTestOrganization(): Promise<Organization> {
    const em = orm.em.fork();
    let org = await em.findOne(Organization, { clerkOrgId: testClerkOrgId });

    if (!org) {
      // Create via webhook
      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organization.created',
          data: {
            id: testClerkOrgId,
            name: 'Membership Test Org',
            slug: 'membership-test-org',
            created_at: Date.now(),
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean };
      expect(data.success).toBe(true);

      // Refetch the org
      org = await em.findOne(Organization, { clerkOrgId: testClerkOrgId });
    }

    expect(org).not.toBeNull();
    expect(org!.provisioningStatus).toBe(ProvisioningStatus.READY);
    return org!;
  }

  describe('organizationMembership.created', () => {
    it('creates user and membership for first user with MANAGER authorities', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      await ensureTestOrganization();

      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organizationMembership.created',
          data: {
            id: 'mem_first_user',
            organization: { id: testClerkOrgId },
            public_user_data: {
              user_id: 'user_test_first',
              identifier: 'first@example.com',
              first_name: 'First',
              last_name: 'User',
              image_url: 'https://example.com/avatar1.png',
            },
            role: 'org:member',
            created_at: Date.now(),
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { status: string; userId: string };
      expect(data.status).toBe('created');
      expect(data.userId).toBeDefined();

      // Verify user was created in tenant schema
      const em = orm.em.fork({ schema: testSchemaName });
      await em.execute(`SET search_path TO "${testSchemaName}", public`);

      const user = await em.findOne(User, { clerkId: 'user_test_first' });
      expect(user).not.toBeNull();
      expect(user!.email).toBe('first@example.com');
      expect(user!.name).toBe('First User');

      // Verify membership was created with MANAGER (first user)
      const membership = await em.findOne(OrganizationUser, { user: user!.id });
      expect(membership).not.toBeNull();
      expect(membership!.isOrgAdmin).toBe(true);
      expect(membership!.designAuthority).toBe(WorkspaceAuthority.MANAGER);
      expect(membership!.operationsAuthority).toBe(WorkspaceAuthority.MANAGER);

      // Verify outbox event was created
      const outboxEvent = await em.findOne(OutboxEvent, {
        aggregateType: 'User',
        eventType: 'user.joined_organization',
      });
      expect(outboxEvent).not.toBeNull();
      expect(outboxEvent!.status).toBe(OutboxStatus.PENDING);
    });

    it('creates subsequent user with NONE authorities', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      await ensureTestOrganization();

      // Ensure first user exists
      const em = orm.em.fork({ schema: testSchemaName });
      const existingUser = await em.findOne(User, { clerkId: 'user_test_first' });
      if (!existingUser) {
        // Create first user if not exists
        await app.request('/webhooks/clerk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'organizationMembership.created',
            data: {
              id: 'mem_first_user',
              organization: { id: testClerkOrgId },
              public_user_data: {
                user_id: 'user_test_first',
                identifier: 'first@example.com',
              },
              role: 'org:member',
              created_at: Date.now(),
            },
          }),
        });
      }

      // Now create second user
      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organizationMembership.created',
          data: {
            id: 'mem_second_user',
            organization: { id: testClerkOrgId },
            public_user_data: {
              user_id: 'user_test_second',
              identifier: 'second@example.com',
              first_name: 'Second',
              last_name: 'User',
            },
            role: 'org:member',
            created_at: Date.now(),
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { status: string };
      expect(data.status).toBe('created');

      // Verify membership was created with NONE (not first user)
      const em2 = orm.em.fork({ schema: testSchemaName });
      await em2.execute(`SET search_path TO "${testSchemaName}", public`);

      const user = await em2.findOne(User, { clerkId: 'user_test_second' });
      expect(user).not.toBeNull();

      const membership = await em2.findOne(OrganizationUser, { user: user!.id });
      expect(membership).not.toBeNull();
      expect(membership!.isOrgAdmin).toBe(false);
      expect(membership!.designAuthority).toBe(WorkspaceAuthority.NONE);
    });

    it('grants isOrgAdmin to Clerk org:admin role', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      await ensureTestOrganization();

      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organizationMembership.created',
          data: {
            id: 'mem_admin_user',
            organization: { id: testClerkOrgId },
            public_user_data: {
              user_id: 'user_test_admin',
              identifier: 'admin@example.com',
            },
            role: 'org:admin',
            created_at: Date.now(),
          },
        }),
      });

      expect(res.status).toBe(200);

      // Verify isOrgAdmin is true
      const em = orm.em.fork({ schema: testSchemaName });
      await em.execute(`SET search_path TO "${testSchemaName}", public`);

      const user = await em.findOne(User, { clerkId: 'user_test_admin' });
      expect(user).not.toBeNull();

      const membership = await em.findOne(OrganizationUser, { user: user!.id });
      expect(membership).not.toBeNull();
      expect(membership!.isOrgAdmin).toBe(true);
    });

    it('returns already_exists for duplicate user', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      await ensureTestOrganization();

      // Create user first
      await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organizationMembership.created',
          data: {
            id: 'mem_dup_user',
            organization: { id: testClerkOrgId },
            public_user_data: {
              user_id: 'user_test_duplicate',
              identifier: 'duplicate@example.com',
            },
            role: 'org:member',
            created_at: Date.now(),
          },
        }),
      });

      // Try to create same user again (idempotency)
      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organizationMembership.created',
          data: {
            id: 'mem_dup_user_2',
            organization: { id: testClerkOrgId },
            public_user_data: {
              user_id: 'user_test_duplicate',
              identifier: 'duplicate@example.com',
            },
            role: 'org:member',
            created_at: Date.now(),
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { status: string };
      expect(data.status).toBe('already_exists');
    });

    it('returns 503 for org not yet provisioned', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create org in PROVISIONING state manually
      const em = orm.em.fork();
      const now = new Date();
      const pendingOrg = em.create(Organization, {
        id: 'org_pending_test',
        name: 'Pending Org',
        slug: 'pending-org',
        schemaName: 'tenant_pending',
        clerkOrgId: 'org_clerk_pending',
        cellId: 'cell_1',
        subscriptionTier: SubscriptionTier.STARTER,
        subscriptionStatus: SubscriptionStatus.TRIALING,
        provisioningStatus: ProvisioningStatus.PROVISIONING,
        regulatoryAdvisorEnabled: true,
        enforcementMode: EnforcementMode.SILENT,
        captureComplianceInSilentMode: true,
        createdAt: now,
        updatedAt: now,
      });
      await em.persistAndFlush(pendingOrg);

      try {
        const res = await app.request('/webhooks/clerk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'organizationMembership.created',
            data: {
              id: 'mem_pending',
              organization: { id: 'org_clerk_pending' },
              public_user_data: {
                user_id: 'user_pending',
                identifier: 'pending@example.com',
              },
              role: 'org:member',
              created_at: Date.now(),
            },
          }),
        });

        expect(res.status).toBe(503);
      } finally {
        // Cleanup
        em.remove(pendingOrg);
        await em.flush();
      }
    });
  });

  describe('organizationMembership.deleted', () => {
    it('soft deletes user and creates outbox event', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      await ensureTestOrganization();

      // First create a user to delete
      await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organizationMembership.created',
          data: {
            id: 'mem_to_delete',
            organization: { id: testClerkOrgId },
            public_user_data: {
              user_id: 'user_test_to_delete',
              identifier: 'todelete@example.com',
            },
            role: 'org:member',
            created_at: Date.now(),
          },
        }),
      });

      // Clear outbox events from creation
      const em = orm.em.fork({ schema: testSchemaName });
      await em.execute(`DELETE FROM "${testSchemaName}".outbox_event WHERE event_type = 'user.joined_organization'`);

      // Now delete the user
      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organizationMembership.deleted',
          data: {
            id: 'mem_to_delete',
            organization: { id: testClerkOrgId },
            public_user_data: {
              user_id: 'user_test_to_delete',
              identifier: 'todelete@example.com',
            },
            role: 'org:member',
            created_at: Date.now(),
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { status: string };
      expect(data.status).toBe('soft_deleted');

      // Verify user was soft deleted (deletedAt set)
      const em2 = orm.em.fork({ schema: testSchemaName });
      // Disable the notDeleted filter to find soft-deleted users
      const user = await em2.execute<{ deleted_at: Date | null }[]>(
        `SELECT deleted_at FROM "${testSchemaName}".users WHERE clerk_id = 'user_test_to_delete'`
      );
      expect(user.length).toBe(1);
      expect(user[0]!.deleted_at).not.toBeNull();

      // Verify outbox event was created
      const outboxEvent = await em2.findOne(OutboxEvent, {
        aggregateType: 'User',
        eventType: 'user.left_organization',
      });
      expect(outboxEvent).not.toBeNull();
      expect(outboxEvent!.status).toBe(OutboxStatus.PENDING);
    });

    it('returns user_not_found for non-existent user', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      await ensureTestOrganization();

      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organizationMembership.deleted',
          data: {
            id: 'mem_nonexistent',
            organization: { id: testClerkOrgId },
            public_user_data: {
              user_id: 'user_nonexistent',
              identifier: 'nonexistent@example.com',
            },
            role: 'org:member',
            created_at: Date.now(),
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { status: string };
      expect(data.status).toBe('user_not_found');
    });

    it('returns org_not_found for non-existent organization', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organizationMembership.deleted',
          data: {
            id: 'mem_bad_org',
            organization: { id: 'org_does_not_exist' },
            public_user_data: {
              user_id: 'user_any',
              identifier: 'any@example.com',
            },
            role: 'org:member',
            created_at: Date.now(),
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { status: string };
      expect(data.status).toBe('org_not_found');
    });
  });

  describe('user.updated', () => {
    it('creates outbox events for each organization membership', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const org = await ensureTestOrganization();

      // Clear any existing outbox events
      const em = orm.em.fork({ schema: testSchemaName });
      await em.execute(`DELETE FROM "${testSchemaName}".outbox_event WHERE event_type = 'user.profile_sync_requested'`);

      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'user.updated',
          data: {
            id: 'user_updated_test',
            email_addresses: [
              { id: 'email_1', email_address: 'old@example.com' },
              { id: 'email_2', email_address: 'new@example.com' },
            ],
            primary_email_address_id: 'email_2',
            first_name: 'Updated',
            last_name: 'User',
            image_url: 'https://example.com/avatar.png',
            organization_memberships: [
              { organization: { id: testClerkOrgId } },
            ],
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { status: string; count: number };
      expect(data.status).toBe('queued');
      expect(data.count).toBe(1);

      // Verify outbox event was created in tenant schema
      const em2 = orm.em.fork({ schema: testSchemaName });
      await em2.execute(`SET search_path TO "${testSchemaName}", public`);

      const outboxEvent = await em2.findOne(OutboxEvent, {
        aggregateType: 'User',
        eventType: 'user.profile_sync_requested',
      });
      expect(outboxEvent).not.toBeNull();
      expect(outboxEvent!.aggregateId).toBe('user_updated_test');

      const payload = outboxEvent!.payload as {
        clerkUserId: string;
        clerkOrgId: string;
        email: string;
        name: string;
      };
      expect(payload.clerkUserId).toBe('user_updated_test');
      expect(payload.clerkOrgId).toBe(testClerkOrgId);
      expect(payload.email).toBe('new@example.com'); // Primary email
      expect(payload.name).toBe('Updated User');
    });

    it('returns count 0 when user has no organization memberships', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'user.updated',
          data: {
            id: 'user_no_orgs',
            email_addresses: [{ id: 'email_1', email_address: 'noorg@example.com' }],
            primary_email_address_id: 'email_1',
            organization_memberships: [],
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { status: string; count: number };
      expect(data.status).toBe('queued');
      expect(data.count).toBe(0);
    });

    it('skips organizations that are not yet provisioned', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create org in PROVISIONING state
      const em = orm.em.fork();
      const now = new Date();
      const pendingOrg = em.create(Organization, {
        id: 'org_pending_update',
        name: 'Pending Update Org',
        slug: 'pending-update-org',
        schemaName: 'tenant_pending_update',
        clerkOrgId: 'org_clerk_pending_update',
        cellId: 'cell_1',
        subscriptionTier: SubscriptionTier.STARTER,
        subscriptionStatus: SubscriptionStatus.TRIALING,
        provisioningStatus: ProvisioningStatus.PROVISIONING,
        regulatoryAdvisorEnabled: true,
        enforcementMode: EnforcementMode.SILENT,
        captureComplianceInSilentMode: true,
        createdAt: now,
        updatedAt: now,
      });
      await em.persistAndFlush(pendingOrg);

      try {
        const res = await app.request('/webhooks/clerk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'user.updated',
            data: {
              id: 'user_pending_update',
              email_addresses: [{ id: 'email_1', email_address: 'pending@example.com' }],
              primary_email_address_id: 'email_1',
              organization_memberships: [
                { organization: { id: 'org_clerk_pending_update' } },
              ],
            },
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json() as { status: string; count: number };
        expect(data.status).toBe('queued');
        expect(data.count).toBe(0); // Skipped because not READY
      } finally {
        em.remove(pendingOrg);
        await em.flush();
      }
    });
  });
});
