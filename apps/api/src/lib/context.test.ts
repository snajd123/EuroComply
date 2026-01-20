import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { Organization } from '@eurocomply/db';
import type { AppVariables } from '../types/context.js';
import {
  getEntityManager,
  getOrganization,
  getUser,
  getTenant,
  getPermissions,
  getAuthContext,
} from './context.js';

describe('context helpers', () => {
  describe('getEntityManager', () => {
    it('returns EntityManager when set', async () => {
      const mockEm = { find: vi.fn() } as unknown as EntityManager;

      const app = new Hono<{ Variables: AppVariables }>();
      app.get('/test', (c) => {
        c.set('em', mockEm);
        const em = getEntityManager(c);
        return c.json({ hasEm: em === mockEm });
      });

      const res = await app.request('/test');
      const body = await res.json();
      expect(body.hasEm).toBe(true);
    });

    it('throws 500 when not set', async () => {
      const app = new Hono<{ Variables: AppVariables }>();
      app.get('/test', (c) => {
        getEntityManager(c);
        return c.json({ ok: true });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(500);
    });
  });

  describe('getOrganization', () => {
    it('returns organization when set', async () => {
      const mockOrg = { id: 'org_123', schemaName: 'tenant_acme' } as Organization;

      const app = new Hono<{ Variables: AppVariables }>();
      app.get('/test', (c) => {
        c.set('organization', mockOrg);
        const org = getOrganization(c);
        return c.json({ orgId: org.id });
      });

      const res = await app.request('/test');
      const body = await res.json();
      expect(body.orgId).toBe('org_123');
    });

    it('throws 500 when not set', async () => {
      const app = new Hono<{ Variables: AppVariables }>();
      app.get('/test', (c) => {
        getOrganization(c);
        return c.json({ ok: true });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(500);
    });
  });

  describe('getUser', () => {
    it('returns user when set', async () => {
      const mockUser = { id: 'user_1', clerkId: 'clerk_1', email: 'test@test.com', name: 'Test' };

      const app = new Hono<{ Variables: AppVariables }>();
      app.get('/test', (c) => {
        c.set('user', mockUser);
        const user = getUser(c);
        return c.json({ userId: user.id });
      });

      const res = await app.request('/test');
      const body = await res.json();
      expect(body.userId).toBe('user_1');
    });

    it('throws 500 when not set', async () => {
      const app = new Hono<{ Variables: AppVariables }>();
      app.get('/test', (c) => {
        getUser(c);
        return c.json({ ok: true });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(500);
    });
  });

  describe('getTenant', () => {
    it('returns tenant when set', async () => {
      const mockTenant = { organizationId: 'org_123', schemaName: 'tenant_acme', name: 'Acme', subscriptionTier: 'pro' };

      const app = new Hono<{ Variables: AppVariables }>();
      app.get('/test', (c) => {
        c.set('tenant', mockTenant);
        const tenant = getTenant(c);
        return c.json({ tenantName: tenant.name });
      });

      const res = await app.request('/test');
      const body = await res.json();
      expect(body.tenantName).toBe('Acme');
    });

    it('throws 500 when not set', async () => {
      const app = new Hono<{ Variables: AppVariables }>();
      app.get('/test', (c) => {
        getTenant(c);
        return c.json({ ok: true });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(500);
    });
  });

  describe('getPermissions', () => {
    it('returns permissions when set', async () => {
      const mockPermissions = { role: 'admin', designAuthority: 'EDITOR', operationsAuthority: 'VIEWER', marketingAuthority: 'NONE', complianceAuthority: 'ADMIN' };

      const app = new Hono<{ Variables: AppVariables }>();
      app.get('/test', (c) => {
        c.set('permissions', mockPermissions);
        const permissions = getPermissions(c);
        return c.json({ role: permissions.role });
      });

      const res = await app.request('/test');
      const body = await res.json();
      expect(body.role).toBe('admin');
    });

    it('throws 500 when not set', async () => {
      const app = new Hono<{ Variables: AppVariables }>();
      app.get('/test', (c) => {
        getPermissions(c);
        return c.json({ ok: true });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(500);
    });
  });

  describe('getAuthContext', () => {
    it('returns all context values', async () => {
      const mockEm = { find: vi.fn() } as unknown as EntityManager;
      const mockOrg = { id: 'org_123' } as Organization;
      const mockUser = { id: 'user_1', clerkId: 'clerk_1', email: 'test@test.com', name: 'Test' };
      const mockTenant = { organizationId: 'org_123', schemaName: 'tenant_acme', name: 'Acme', subscriptionTier: 'pro' };
      const mockPermissions = { role: 'admin', designAuthority: 'EDITOR', operationsAuthority: 'VIEWER', marketingAuthority: 'NONE', complianceAuthority: 'ADMIN' };

      const app = new Hono<{ Variables: AppVariables }>();
      app.get('/test', (c) => {
        c.set('em', mockEm);
        c.set('organization', mockOrg);
        c.set('user', mockUser);
        c.set('tenant', mockTenant);
        c.set('permissions', mockPermissions);

        const ctx = getAuthContext(c);
        return c.json({
          hasEm: !!ctx.em,
          orgId: ctx.organization.id,
          userId: ctx.user.id,
          tenantName: ctx.tenant.name,
          role: ctx.permissions.role,
        });
      });

      const res = await app.request('/test');
      const body = await res.json();
      expect(body.hasEm).toBe(true);
      expect(body.orgId).toBe('org_123');
      expect(body.userId).toBe('user_1');
      expect(body.tenantName).toBe('Acme');
      expect(body.role).toBe('admin');
    });
  });
});
