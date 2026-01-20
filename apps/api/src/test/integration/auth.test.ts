/**
 * Integration tests for Authentication middleware.
 * Tests authorization helpers and tenant context loading.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  getTestContext,
} from './setup.js';
import { requireAuthority, requireOrgAdmin, requireOrgOwner } from '../../middleware/authorize.js';
import { ok } from '@eurocomply/shared';
import { Authority, Workspace } from '@eurocomply/shared';
import type { AppVariables } from '../../types/context.js';

describe('Authorization Middleware Integration Tests', () => {
  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  describe('requireAuthority', () => {
    it('should allow access when user has sufficient authority', async () => {
      const ctx = getTestContext();

      const app = new Hono<{ Variables: AppVariables }>();

      // Set up context with MANAGER authority
      app.use('*', async (c, next) => {
        c.set('user', {
          id: ctx.userId,
          clerkId: `clerk_test_${ctx.schemaName}`,
          email: 'test@example.com',
          name: 'Test User',
        });
        c.set('tenant', {
          organizationId: ctx.organizationId,
          schemaName: ctx.schemaName,
          name: 'Test Org',
          subscriptionTier: 'starter',
        });
        c.set('permissions', {
          role: 'admin',
          designAuthority: 'MANAGER',
          operationsAuthority: 'MANAGER',
          marketingAuthority: 'MANAGER',
          complianceAuthority: 'MANAGER',
        });
        await next();
      });

      // Require EDITOR authority for design workspace
      app.get('/test', requireAuthority(Workspace.DESIGN, Authority.EDITOR), (c) => {
        return c.json(ok({ message: 'access granted' }));
      });

      const response = await app.request('/test');
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.message).toBe('access granted');
    });

    it('should deny access when user has insufficient authority', async () => {
      const ctx = getTestContext();

      const app = new Hono<{ Variables: AppVariables }>();

      // Set up context with VIEWER authority
      app.use('*', async (c, next) => {
        c.set('user', {
          id: ctx.userId,
          clerkId: `clerk_test_${ctx.schemaName}`,
          email: 'test@example.com',
          name: 'Test User',
        });
        c.set('tenant', {
          organizationId: ctx.organizationId,
          schemaName: ctx.schemaName,
          name: 'Test Org',
          subscriptionTier: 'starter',
        });
        c.set('permissions', {
          role: 'member',
          designAuthority: 'VIEWER',
          operationsAuthority: 'VIEWER',
          marketingAuthority: 'VIEWER',
          complianceAuthority: 'VIEWER',
        });
        await next();
      });

      // Require MANAGER authority - should fail
      app.get('/test', requireAuthority(Workspace.DESIGN, Authority.MANAGER), (c) => {
        return c.json(ok({ message: 'access granted' }));
      });

      const response = await app.request('/test');
      expect(response.status).toBe(403);
    });

    it('should check correct workspace authority', async () => {
      const ctx = getTestContext();

      const app = new Hono<{ Variables: AppVariables }>();

      // High authority in design, low in operations
      app.use('*', async (c, next) => {
        c.set('user', {
          id: ctx.userId,
          clerkId: `clerk_test_${ctx.schemaName}`,
          email: 'test@example.com',
          name: 'Test User',
        });
        c.set('tenant', {
          organizationId: ctx.organizationId,
          schemaName: ctx.schemaName,
          name: 'Test Org',
          subscriptionTier: 'starter',
        });
        c.set('permissions', {
          role: 'member',
          designAuthority: 'MANAGER',
          operationsAuthority: 'VIEWER',
          marketingAuthority: 'EDITOR',
          complianceAuthority: 'CONTRIBUTOR',
        });
        await next();
      });

      // Design endpoint - should pass (MANAGER >= EDITOR)
      app.get('/design', requireAuthority(Workspace.DESIGN, Authority.EDITOR), (c) => {
        return c.json(ok({ workspace: 'design' }));
      });

      // Operations endpoint - should fail (VIEWER < EDITOR)
      app.get('/operations', requireAuthority(Workspace.OPERATIONS, Authority.EDITOR), (c) => {
        return c.json(ok({ workspace: 'operations' }));
      });

      const designResponse = await app.request('/design');
      expect(designResponse.status).toBe(200);

      const opsResponse = await app.request('/operations');
      expect(opsResponse.status).toBe(403);
    });
  });

  describe('requireOrgAdmin', () => {
    it('should allow admin role', async () => {
      const ctx = getTestContext();

      const app = new Hono<{ Variables: AppVariables }>();

      app.use('*', async (c, next) => {
        c.set('user', {
          id: ctx.userId,
          clerkId: `clerk_test_${ctx.schemaName}`,
          email: 'test@example.com',
          name: 'Test User',
        });
        c.set('tenant', {
          organizationId: ctx.organizationId,
          schemaName: ctx.schemaName,
          name: 'Test Org',
          subscriptionTier: 'starter',
        });
        c.set('permissions', {
          role: 'admin',
          designAuthority: 'MANAGER',
          operationsAuthority: 'MANAGER',
          marketingAuthority: 'MANAGER',
          complianceAuthority: 'MANAGER',
        });
        await next();
      });

      app.get('/admin', requireOrgAdmin, (c) => {
        return c.json(ok({ role: 'admin' }));
      });

      const response = await app.request('/admin');
      expect(response.status).toBe(200);
    });

    it('should deny member role', async () => {
      const ctx = getTestContext();

      const app = new Hono<{ Variables: AppVariables }>();

      app.use('*', async (c, next) => {
        c.set('user', {
          id: ctx.userId,
          clerkId: `clerk_test_${ctx.schemaName}`,
          email: 'test@example.com',
          name: 'Test User',
        });
        c.set('tenant', {
          organizationId: ctx.organizationId,
          schemaName: ctx.schemaName,
          name: 'Test Org',
          subscriptionTier: 'starter',
        });
        c.set('permissions', {
          role: 'member',
          designAuthority: 'VIEWER',
          operationsAuthority: 'VIEWER',
          marketingAuthority: 'VIEWER',
          complianceAuthority: 'VIEWER',
        });
        await next();
      });

      app.get('/admin', requireOrgAdmin, (c) => {
        return c.json(ok({ role: 'admin' }));
      });

      const response = await app.request('/admin');
      expect(response.status).toBe(403);
    });
  });

  describe('requireOrgOwner', () => {
    it('should allow owner role', async () => {
      const ctx = getTestContext();

      const app = new Hono<{ Variables: AppVariables }>();

      app.use('*', async (c, next) => {
        c.set('user', {
          id: ctx.userId,
          clerkId: `clerk_test_${ctx.schemaName}`,
          email: 'test@example.com',
          name: 'Test User',
        });
        c.set('tenant', {
          organizationId: ctx.organizationId,
          schemaName: ctx.schemaName,
          name: 'Test Org',
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

      app.get('/owner', requireOrgOwner, (c) => {
        return c.json(ok({ role: 'owner' }));
      });

      const response = await app.request('/owner');
      expect(response.status).toBe(200);
    });

    it('should deny admin role for owner-only endpoint', async () => {
      const ctx = getTestContext();

      const app = new Hono<{ Variables: AppVariables }>();

      app.use('*', async (c, next) => {
        c.set('user', {
          id: ctx.userId,
          clerkId: `clerk_test_${ctx.schemaName}`,
          email: 'test@example.com',
          name: 'Test User',
        });
        c.set('tenant', {
          organizationId: ctx.organizationId,
          schemaName: ctx.schemaName,
          name: 'Test Org',
          subscriptionTier: 'starter',
        });
        c.set('permissions', {
          role: 'admin',
          designAuthority: 'MANAGER',
          operationsAuthority: 'MANAGER',
          marketingAuthority: 'MANAGER',
          complianceAuthority: 'MANAGER',
        });
        await next();
      });

      app.get('/owner', requireOrgOwner, (c) => {
        return c.json(ok({ role: 'owner' }));
      });

      const response = await app.request('/owner');
      expect(response.status).toBe(403);
    });
  });
});
