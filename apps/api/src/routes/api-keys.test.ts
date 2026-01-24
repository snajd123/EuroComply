import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createApiKeysRouter } from './api-keys.js';
import type { Env } from '../app.js';

describe('API Keys Authorization', () => {
  const mockEm = {
    fork: vi.fn().mockReturnThis(),
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    persistAndFlush: vi.fn(),
    nativeDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEm.find.mockResolvedValue([]);
  });

  it('allows org admin to list keys', async () => {
    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_test');
      c.set('userId', 'user_123');
      c.set('membership', { isOrgAdmin: true } as any);
      return next();
    });
    app.route('/api-keys', createApiKeysRouter({ em: mockEm as any }));

    mockEm.findOne.mockResolvedValue({ id: 'org_123', schemaName: 'tenant_test' });

    const res = await app.request('/api-keys');
    expect(res.status).not.toBe(403);
  });

  it('denies non-admin from listing keys', async () => {
    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_test');
      c.set('userId', 'user_123');
      c.set('membership', { isOrgAdmin: false } as any);
      return next();
    });
    app.route('/api-keys', createApiKeysRouter({ em: mockEm as any }));

    const res = await app.request('/api-keys');
    expect(res.status).toBe(403);
  });

  it('denies non-admin from creating keys', async () => {
    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_test');
      c.set('userId', 'user_123');
      c.set('membership', { isOrgAdmin: false } as any);
      return next();
    });
    app.route('/api-keys', createApiKeysRouter({ em: mockEm as any }));

    const res = await app.request('/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Key' }),
    });
    expect(res.status).toBe(403);
  });

  it('allows API key bypass (org-level credential)', async () => {
    const app = new Hono<Env>();
    app.use('*', (c, next) => {
      c.set('tenantSchema', 'tenant_test');
      c.set('userId', 'api-key:org_123');
      c.set('membership', undefined);
      return next();
    });
    app.route('/api-keys', createApiKeysRouter({ em: mockEm as any }));

    mockEm.findOne.mockResolvedValue({ id: 'org_123', schemaName: 'tenant_test' });

    const res = await app.request('/api-keys');
    expect(res.status).not.toBe(403);
  });
});
