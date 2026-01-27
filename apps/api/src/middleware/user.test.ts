import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createUserMiddleware } from './user.js';
import { WorkspaceAuthority } from '@eurocomply/database';
import type { Env } from '../app.js';

describe('userMiddleware', () => {
  const mockOrm = {
    em: {
      fork: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if tenantSchema missing', async () => {
    const app = new Hono<Env>();
    app.use('*', createUserMiddleware({ orm: mockOrm as any }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(401);

    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.message).toContain('tenant context');
  });

  it('skips for API key auth', async () => {
    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_test');
      c.set('userId', 'api-key:org_123');
      return next();
    });
    app.use('*', createUserMiddleware({ orm: mockOrm as any }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(mockOrm.em.fork).not.toHaveBeenCalled();
  });

  it('returns 202 when user not found (race condition)', async () => {
    const mockTxEm = {
      findOne: vi.fn().mockResolvedValue(null),
      execute: vi.fn(),
    };
    const mockEm = {
      transactional: vi.fn(async (cb: any) => cb(mockTxEm)),
    };
    mockOrm.em.fork.mockReturnValue(mockEm);

    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_test');
      c.set('userId', 'user_clerk123');
      return next();
    });
    app.use('*', createUserMiddleware({ orm: mockOrm as any }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(202);
    expect(res.headers.get('Retry-After')).toBe('2');

    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.message).toContain('Setting up your account');
  });

  it('attaches user and membership to context', async () => {
    const mockUser = {
      id: 'usr_123',
      clerkId: 'user_clerk123',
      membership: {
        isOrgAdmin: true,
        designAuthority: WorkspaceAuthority.MANAGER,
      },
    };
    const mockTxEm = {
      findOne: vi.fn().mockResolvedValue(mockUser),
      execute: vi.fn(),
    };
    const mockEm = {
      transactional: vi.fn(async (cb: any) => cb(mockTxEm)),
      nativeUpdate: vi.fn().mockResolvedValue(1),
    };
    mockOrm.em.fork.mockReturnValue(mockEm);

    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_test');
      c.set('userId', 'user_clerk123');
      return next();
    });
    app.use('*', createUserMiddleware({ orm: mockOrm as any }));
    app.get('/test', (c) => {
      return c.json({
        userId: c.get('user')?.id,
        isAdmin: c.get('membership')?.isOrgAdmin,
      });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(200);

    const body = await res.json() as { userId: string; isAdmin: boolean };
    expect(body.userId).toBe('usr_123');
    expect(body.isAdmin).toBe(true);
  });

  it('returns 403 when user has no membership', async () => {
    const mockUser = {
      id: 'usr_123',
      clerkId: 'user_clerk123',
      membership: null,
    };
    const mockTxEm = {
      findOne: vi.fn().mockResolvedValue(mockUser),
      execute: vi.fn(),
    };
    const mockEm = {
      transactional: vi.fn(async (cb: any) => cb(mockTxEm)),
    };
    mockOrm.em.fork.mockReturnValue(mockEm);

    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_test');
      c.set('userId', 'user_clerk123');
      return next();
    });
    app.use('*', createUserMiddleware({ orm: mockOrm as any }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(403);

    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.message).toContain('no longer a member');
  });
});
