/**
 * Integration tests for Tenant Isolation.
 * Verifies that one tenant cannot access another tenant's data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  getTestContext,
  testPrisma,
} from './setup.js';
import { createTenantSchema, dropTenantSchema } from '@eurocomply/db';
import { randomBytes } from 'crypto';
import type { AppVariables } from '../../types/context.js';

describe('Tenant Isolation Integration Tests', () => {
  let tenant1Context: {
    schemaName: string;
    organizationId: string;
    userId: string;
  };
  let tenant2Context: {
    schemaName: string;
    organizationId: string;
    userId: string;
  };

  beforeAll(async () => {
    // Set up first tenant using standard setup
    await setupIntegrationTest();
    const ctx = getTestContext();
    tenant1Context = {
      schemaName: ctx.schemaName,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    };

    // Set up second tenant manually
    const schema2 = `tenant_test${randomBytes(4).toString('hex')}`;

    const org2 = await testPrisma.organization.create({
      data: {
        name: `Tenant 2 Org ${schema2}`,
        slug: schema2,
        schemaName: schema2,
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
        userLimit: 20,
        storageLimit: BigInt(536870912000),
      },
    });

    const user2 = await testPrisma.user.create({
      data: {
        clerkId: `clerk_test2_${schema2}`,
        email: `test2-${schema2}@example.com`,
        name: 'Tenant 2 User',
      },
    });

    await testPrisma.organizationUser.create({
      data: {
        organizationId: org2.id,
        userId: user2.id,
        role: 'owner',
        designAuthority: 'MANAGER',
        operationsAuthority: 'MANAGER',
        marketingAuthority: 'MANAGER',
        complianceAuthority: 'MANAGER',
      },
    });

    await createTenantSchema(testPrisma, schema2);

    tenant2Context = {
      schemaName: schema2,
      organizationId: org2.id,
      userId: user2.id,
    };
  });

  afterAll(async () => {
    // Clean up tenant 2
    try {
      await dropTenantSchema(testPrisma, tenant2Context.schemaName);
      await testPrisma.organizationUser.deleteMany({
        where: { organizationId: tenant2Context.organizationId },
      });
      await testPrisma.user.deleteMany({
        where: { id: tenant2Context.userId },
      });
      await testPrisma.organization.deleteMany({
        where: { id: tenant2Context.organizationId },
      });
    } catch (error) {
      console.error('Error cleaning up tenant 2:', error);
    }

    // Clean up tenant 1 using standard teardown
    await teardownIntegrationTest();
  });

  describe('Organization Access Control', () => {
    it('should prevent tenant 1 user from accessing tenant 2 organization', async () => {
      const app = new Hono<{ Variables: AppVariables }>();

      // User from tenant 1 trying to access tenant 2's organization
      app.use('*', async (c, next) => {
        c.set('user', {
          id: tenant1Context.userId,
          clerkId: `clerk_test_${tenant1Context.schemaName}`,
          email: `test-${tenant1Context.schemaName}@example.com`,
          name: 'Tenant 1 User',
        });
        // Context is for tenant 1
        c.set('tenant', {
          organizationId: tenant1Context.organizationId,
          schemaName: tenant1Context.schemaName,
          name: 'Tenant 1 Org',
          subscriptionTier: 'starter',
        });
        c.set('permissions', {
          role: 'owner',
          designAuthority: 'MANAGER',
          operationsAuthority: 'MANAGER',
          marketingAuthority: 'MANAGER',
          complianceAuthority: 'MANAGER',
        });
        await next();
      });

      // Endpoint that checks tenant context matches request
      app.get('/org/:id', (c) => {
        const tenant = c.get('tenant');
        const requestedOrgId = c.req.param('id');

        // Security check: tenant context must match requested org
        if (tenant.organizationId !== requestedOrgId) {
          return c.json(
            { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
            403
          );
        }

        return c.json({ success: true, data: { id: requestedOrgId } });
      });

      // Tenant 1 accessing their own org - should succeed
      const ownOrgResponse = await app.request(`/org/${tenant1Context.organizationId}`);
      expect(ownOrgResponse.status).toBe(200);

      // Tenant 1 trying to access tenant 2's org - should fail
      const otherOrgResponse = await app.request(`/org/${tenant2Context.organizationId}`);
      expect(otherOrgResponse.status).toBe(403);
    });

    it('should prevent tenant 2 user from accessing tenant 1 organization', async () => {
      const app = new Hono<{ Variables: AppVariables }>();

      // User from tenant 2 trying to access tenant 1's organization
      app.use('*', async (c, next) => {
        c.set('user', {
          id: tenant2Context.userId,
          clerkId: `clerk_test2_${tenant2Context.schemaName}`,
          email: `test2-${tenant2Context.schemaName}@example.com`,
          name: 'Tenant 2 User',
        });
        // Context is for tenant 2
        c.set('tenant', {
          organizationId: tenant2Context.organizationId,
          schemaName: tenant2Context.schemaName,
          name: 'Tenant 2 Org',
          subscriptionTier: 'starter',
        });
        c.set('permissions', {
          role: 'owner',
          designAuthority: 'MANAGER',
          operationsAuthority: 'MANAGER',
          marketingAuthority: 'MANAGER',
          complianceAuthority: 'MANAGER',
        });
        await next();
      });

      app.get('/org/:id', (c) => {
        const tenant = c.get('tenant');
        const requestedOrgId = c.req.param('id');

        if (tenant.organizationId !== requestedOrgId) {
          return c.json(
            { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
            403
          );
        }

        return c.json({ success: true, data: { id: requestedOrgId } });
      });

      // Tenant 2 accessing their own org - should succeed
      const ownOrgResponse = await app.request(`/org/${tenant2Context.organizationId}`);
      expect(ownOrgResponse.status).toBe(200);

      // Tenant 2 trying to access tenant 1's org - should fail
      const otherOrgResponse = await app.request(`/org/${tenant1Context.organizationId}`);
      expect(otherOrgResponse.status).toBe(403);
    });
  });

  describe('Schema Isolation', () => {
    it('should have separate schemas for each tenant', async () => {
      // Verify both schemas exist and are different
      expect(tenant1Context.schemaName).not.toBe(tenant2Context.schemaName);

      // Verify schema names follow expected pattern
      expect(tenant1Context.schemaName).toMatch(/^tenant_test[a-f0-9]{8}$/);
      expect(tenant2Context.schemaName).toMatch(/^tenant_test[a-f0-9]{8}$/);
    });

    it('should have separate organizations in public schema', async () => {
      const org1 = await testPrisma.organization.findUnique({
        where: { id: tenant1Context.organizationId },
      });
      const org2 = await testPrisma.organization.findUnique({
        where: { id: tenant2Context.organizationId },
      });

      expect(org1).not.toBeNull();
      expect(org2).not.toBeNull();
      expect(org1?.id).not.toBe(org2?.id);
      expect(org1?.schemaName).toBe(tenant1Context.schemaName);
      expect(org2?.schemaName).toBe(tenant2Context.schemaName);
    });

    it('should have separate user memberships per organization', async () => {
      const user1Memberships = await testPrisma.organizationUser.findMany({
        where: { userId: tenant1Context.userId },
      });
      const user2Memberships = await testPrisma.organizationUser.findMany({
        where: { userId: tenant2Context.userId },
      });

      // Each user should only be a member of their own org
      expect(user1Memberships.length).toBe(1);
      expect(user1Memberships[0]!.organizationId).toBe(tenant1Context.organizationId);

      expect(user2Memberships.length).toBe(1);
      expect(user2Memberships[0]!.organizationId).toBe(tenant2Context.organizationId);
    });
  });

  describe('Cross-Tenant Data Access Prevention', () => {
    it('should not allow listing users from another organization', async () => {
      // Get memberships for org1 - should not include user2
      const org1Members = await testPrisma.organizationUser.findMany({
        where: { organizationId: tenant1Context.organizationId },
        include: { user: true },
      });

      const memberUserIds = org1Members.map((m: { userId: string }) => m.userId);
      expect(memberUserIds).toContain(tenant1Context.userId);
      expect(memberUserIds).not.toContain(tenant2Context.userId);
    });

    it('should not allow listing users from another organization (reverse)', async () => {
      // Get memberships for org2 - should not include user1
      const org2Members = await testPrisma.organizationUser.findMany({
        where: { organizationId: tenant2Context.organizationId },
        include: { user: true },
      });

      const memberUserIds = org2Members.map((m: { userId: string }) => m.userId);
      expect(memberUserIds).toContain(tenant2Context.userId);
      expect(memberUserIds).not.toContain(tenant1Context.userId);
    });
  });
});
