/**
 * Integration tests for Organization API endpoints.
 * Tests against a real PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  getTestContext,
  cleanupOutboxEvents,
  testPrisma,
} from './setup.js';
import { organizations } from '../../routes/organizations.js';
import { ok, err } from '@eurocomply/shared';
import type { AppVariables, UserOnlyVariables } from '../../types/context.js';

describe('Organization API Integration Tests', () => {
  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await cleanupOutboxEvents();
  });

  describe('POST /organizations', () => {
    it('should create a new organization', async () => {
      const ctx = getTestContext();

      // Create app with mock user auth (simulates userAuthMiddleware)
      const app = new Hono<{ Variables: UserOnlyVariables }>();
      app.use('*', async (c, next) => {
        c.set('user', {
          id: ctx.userId,
          clerkId: `clerk_test_${ctx.schemaName}`,
          email: `test-${ctx.schemaName}@example.com`,
          name: 'Test User',
        });
        await next();
      });
      app.route('/', organizations);

      const response = await app.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Test Organization' }),
      });

      expect(response.status).toBe(201);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('New Test Organization');
      expect(json.data.slug).toMatch(/^new-test-organization/);
      expect(json.data.schemaName).toMatch(/^tenant_new_test_organization/);
      expect(json.data.owner.email).toBe(`test-${ctx.schemaName}@example.com`);

      // Verify organization was created in database
      const org = await testPrisma.organization.findUnique({
        where: { id: json.data.id },
      });
      expect(org).not.toBeNull();
      expect(org?.name).toBe('New Test Organization');

      // Verify outbox event was published
      const events = await testPrisma.outboxEvent.findMany({
        where: { organizationId: json.data.id },
      });
      expect(events.length).toBe(1);
      expect(events[0]!.eventType).toBe('organization.created');

      // Cleanup: delete the created org
      await testPrisma.organizationUser.deleteMany({
        where: { organizationId: json.data.id },
      });
      await testPrisma.organization.delete({
        where: { id: json.data.id },
      });
    });

    it('should reject invalid organization name', async () => {
      const ctx = getTestContext();

      const app = new Hono<{ Variables: UserOnlyVariables }>();
      app.use('*', async (c, next) => {
        c.set('user', {
          id: ctx.userId,
          clerkId: `clerk_test_${ctx.schemaName}`,
          email: `test-${ctx.schemaName}@example.com`,
          name: 'Test User',
        });
        await next();
      });
      app.route('/', organizations);

      // Name too short
      const response = await app.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'A' }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /organizations', () => {
    it('should list user organizations', async () => {
      const ctx = getTestContext();

      const app = new Hono<{ Variables: UserOnlyVariables }>();
      app.use('*', async (c, next) => {
        c.set('user', {
          id: ctx.userId,
          clerkId: `clerk_test_${ctx.schemaName}`,
          email: `test-${ctx.schemaName}@example.com`,
          name: 'Test User',
        });
        await next();
      });
      app.route('/', organizations);

      const response = await app.request('/', {
        method: 'GET',
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      // User should have at least the test organization
      expect(json.data.length).toBeGreaterThanOrEqual(1);
      expect(json.data[0]).toHaveProperty('id');
      expect(json.data[0]).toHaveProperty('name');
      expect(json.data[0]).toHaveProperty('slug');
      expect(json.data[0]).toHaveProperty('role');
    });
  });

  describe('GET /organizations/:id', () => {
    it('should get organization details when user has access', async () => {
      const ctx = getTestContext();

      // This endpoint requires full auth context (authMiddleware)
      const app = new Hono<{ Variables: AppVariables }>();
      app.use('*', async (c, next) => {
        c.set('user', {
          id: ctx.userId,
          clerkId: `clerk_test_${ctx.schemaName}`,
          email: `test-${ctx.schemaName}@example.com`,
          name: 'Test User',
        });
        c.set('tenant', {
          organizationId: ctx.organizationId,
          schemaName: ctx.schemaName,
          name: `Test Org ${ctx.schemaName}`,
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
      app.route('/', organizations);

      const response = await app.request(`/${ctx.organizationId}`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(ctx.organizationId);
      expect(json.data.schemaName).toBe(ctx.schemaName);
      expect(json.data.owner).toBeDefined();
    });

    it('should return 403 when accessing another organization', async () => {
      const ctx = getTestContext();

      const app = new Hono<{ Variables: AppVariables }>();
      app.use('*', async (c, next) => {
        c.set('user', {
          id: ctx.userId,
          clerkId: `clerk_test_${ctx.schemaName}`,
          email: `test-${ctx.schemaName}@example.com`,
          name: 'Test User',
        });
        // Tenant context is for a DIFFERENT org than requested
        c.set('tenant', {
          organizationId: ctx.organizationId,
          schemaName: ctx.schemaName,
          name: `Test Org ${ctx.schemaName}`,
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
      app.route('/', organizations);

      // Request a different org ID than the tenant context
      const response = await app.request('/different-org-id', {
        method: 'GET',
      });

      expect(response.status).toBe(403);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
    });
  });
});
