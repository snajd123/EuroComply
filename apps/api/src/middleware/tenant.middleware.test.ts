import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import type { Organization } from '@eurocomply/db';

// Mock @eurocomply/db
vi.mock('@eurocomply/db', () => ({
  Organization: class Organization {
    id!: string;
    schemaName!: string;
  },
}));

// Define variables interface for test apps
interface TestVariables {
  organizationId: string;
  em: EntityManager;
  organization: Organization;
}

describe('tenantMiddleware', () => {
  let mockOrm: MikroORM;
  let mockEm: EntityManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockEm = {
      findOne: vi.fn(),
      fork: vi.fn(),
      clear: vi.fn(),
    } as unknown as EntityManager;

    mockOrm = {
      em: mockEm,
    } as unknown as MikroORM;
  });

  it('returns 400 when organizationId not set', async () => {
    const { tenantMiddleware } = await import('./tenant.middleware.js');

    const app = new Hono<{ Variables: TestVariables }>();
    // Don't set organizationId - simulating missing auth middleware
    app.use('*', tenantMiddleware(mockOrm));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain('Organization ID not set in context');
  });

  it('returns 404 when organization not found', async () => {
    (mockEm.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { tenantMiddleware } = await import('./tenant.middleware.js');

    const app = new Hono<{ Variables: TestVariables }>();
    app.use('*', async (c, next) => {
      c.set('organizationId', 'org_notfound');
      await next();
    });
    app.use('*', tenantMiddleware(mockOrm));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(404);
  });

  it('sets em and organization in context when org exists', async () => {
    const mockOrg = { id: 'org_123', schemaName: 'tenant_acme' };
    const mockTenantEm = { clear: vi.fn() } as unknown as EntityManager;

    (mockEm.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(mockOrg);
    (mockEm.fork as ReturnType<typeof vi.fn>).mockReturnValue(mockTenantEm);

    const { tenantMiddleware } = await import('./tenant.middleware.js');

    let capturedEm: EntityManager | undefined;
    let capturedOrg: Organization | undefined;

    const app = new Hono<{ Variables: TestVariables }>();
    app.use('*', async (c, next) => {
      c.set('organizationId', 'org_123');
      await next();
    });
    app.use('*', tenantMiddleware(mockOrm));
    app.get('/test', (c) => {
      capturedEm = c.get('em');
      capturedOrg = c.get('organization');
      return c.json({ ok: true });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(capturedEm).toBe(mockTenantEm);
    expect(capturedOrg).toEqual(mockOrg);
    expect(mockEm.fork).toHaveBeenCalledWith({ schema: 'tenant_acme' });
  });

  it('clears EntityManager after request', async () => {
    const mockOrg = { id: 'org_123', schemaName: 'tenant_acme' };
    const mockTenantEm = { clear: vi.fn() } as unknown as EntityManager;

    (mockEm.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(mockOrg);
    (mockEm.fork as ReturnType<typeof vi.fn>).mockReturnValue(mockTenantEm);

    const { tenantMiddleware } = await import('./tenant.middleware.js');

    const app = new Hono<{ Variables: TestVariables }>();
    app.use('*', async (c, next) => {
      c.set('organizationId', 'org_123');
      await next();
    });
    app.use('*', tenantMiddleware(mockOrm));
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test');
    expect(mockTenantEm.clear).toHaveBeenCalled();
  });

  it('clears EntityManager even when handler throws error', async () => {
    const mockOrg = { id: 'org_123', schemaName: 'tenant_acme' };
    const mockTenantEm = { clear: vi.fn() } as unknown as EntityManager;

    (mockEm.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(mockOrg);
    (mockEm.fork as ReturnType<typeof vi.fn>).mockReturnValue(mockTenantEm);

    const { tenantMiddleware } = await import('./tenant.middleware.js');

    const app = new Hono<{ Variables: TestVariables }>();
    app.use('*', async (c, next) => {
      c.set('organizationId', 'org_123');
      await next();
    });
    app.use('*', tenantMiddleware(mockOrm));
    app.get('/test', () => {
      throw new Error('Handler error');
    });

    await app.request('/test');
    // EntityManager should still be cleared even though handler threw
    expect(mockTenantEm.clear).toHaveBeenCalled();
  });
});
