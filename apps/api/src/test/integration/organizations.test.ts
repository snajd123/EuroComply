/**
 * Integration tests for Organization Service.
 * Tests against a real PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  getTestContext,
  cleanupOutboxEvents,
  testPrisma,
} from './setup.js';
import {
  createOrganization,
  getOrganization,
  listUserOrganizations,
} from '../../services/organization.service.js';

describe('Organization Service Integration Tests', () => {
  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await cleanupOutboxEvents();
  });

  describe('createOrganization', () => {
    it('should create a new organization with owner', async () => {
      const ctx = getTestContext();

      const org = await createOrganization({
        name: 'Integration Test Org',
        ownerClerkId: `clerk_test_${ctx.schemaName}`,
        ownerEmail: `test-${ctx.schemaName}@example.com`,
        ownerName: 'Test User',
      });

      expect(org).toBeDefined();
      expect(org.name).toBe('Integration Test Org');
      expect(org.slug).toMatch(/^integration-test-org/);
      expect(org.schemaName).toMatch(/^tenant_integration_test_org/);
      expect(org.owner.email).toBe(`test-${ctx.schemaName}@example.com`);

      // Verify organization was created in database
      const dbOrg = await testPrisma.organization.findUnique({
        where: { id: org.id },
      });
      expect(dbOrg).not.toBeNull();
      expect(dbOrg?.name).toBe('Integration Test Org');

      // Verify outbox event was published
      const events = await testPrisma.outboxEvent.findMany({
        where: { organizationId: org.id },
      });
      expect(events.length).toBe(1);
      expect(events[0]!.eventType).toBe('organization.created');

      // Cleanup: delete the created org and its schema
      await testPrisma.organizationUser.deleteMany({
        where: { organizationId: org.id },
      });
      await testPrisma.outboxEvent.deleteMany({
        where: { organizationId: org.id },
      });
      await testPrisma.organization.delete({
        where: { id: org.id },
      });
      // Note: tenant schema cleanup would require dropTenantSchema call
    });

    it('should create owner membership with full permissions', async () => {
      const ctx = getTestContext();
      const uniqueSuffix = Date.now();

      const org = await createOrganization({
        name: `Permissions Test Org ${uniqueSuffix}`,
        ownerClerkId: `clerk_test_${ctx.schemaName}`,
        ownerEmail: `test-${ctx.schemaName}@example.com`,
        ownerName: 'Test User',
      });

      // Verify owner membership exists with correct permissions
      const membership = await testPrisma.organizationUser.findFirst({
        where: { organizationId: org.id },
      });

      expect(membership).not.toBeNull();
      expect(membership?.role).toBe('owner');
      expect(membership?.designAuthority).toBe('MANAGER');
      expect(membership?.operationsAuthority).toBe('MANAGER');
      expect(membership?.marketingAuthority).toBe('MANAGER');
      expect(membership?.complianceAuthority).toBe('MANAGER');

      // Cleanup
      await testPrisma.organizationUser.deleteMany({
        where: { organizationId: org.id },
      });
      await testPrisma.outboxEvent.deleteMany({
        where: { organizationId: org.id },
      });
      await testPrisma.organization.delete({
        where: { id: org.id },
      });
    });
  });

  describe('listUserOrganizations', () => {
    it('should list organizations for a user', async () => {
      const ctx = getTestContext();

      const orgs = await listUserOrganizations(ctx.userId);

      expect(Array.isArray(orgs)).toBe(true);
      expect(orgs.length).toBeGreaterThanOrEqual(1);

      // Should include the test organization created in setup
      const testOrg = orgs.find((o) => o.id === ctx.organizationId);
      expect(testOrg).toBeDefined();
      expect(testOrg?.role).toBe('owner');
    });

    it('should return empty array for user with no organizations', async () => {
      // Create a user with no organization memberships
      const lonelyUser = await testPrisma.user.create({
        data: {
          clerkId: `clerk_lonely_${Date.now()}`,
          email: `lonely-${Date.now()}@example.com`,
          name: 'Lonely User',
        },
      });

      const orgs = await listUserOrganizations(lonelyUser.id);

      expect(Array.isArray(orgs)).toBe(true);
      expect(orgs.length).toBe(0);

      // Cleanup
      await testPrisma.user.delete({
        where: { id: lonelyUser.id },
      });
    });
  });

  describe('getOrganization', () => {
    it('should get organization details with owner', async () => {
      const ctx = getTestContext();

      const org = await getOrganization(ctx.organizationId);

      expect(org).toBeDefined();
      expect(org.id).toBe(ctx.organizationId);
      expect(org.schemaName).toBe(ctx.schemaName);
      expect(org.owner).toBeDefined();
      expect(org.owner.id).toBe(ctx.userId);
    });

    it('should throw error for non-existent organization', async () => {
      await expect(getOrganization('non-existent-id')).rejects.toThrow();
    });
  });
});
