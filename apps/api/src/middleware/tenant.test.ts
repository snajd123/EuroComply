import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../app.js';
import { createTenantMiddleware } from './tenant.js';

vi.mock('../utils/jwt.js', () => ({
  verifyAndExtractTenant: vi.fn(),
  extractTenantFromJwtUnsafe: vi.fn(),
}));

import { verifyAndExtractTenant, extractTenantFromJwtUnsafe } from '../utils/jwt.js';

describe('createTenantMiddleware', () => {
  let app: Hono<Env>;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 401 for missing Authorization header', async () => {
    app = new Hono<Env>();
    app.use('*', createTenantMiddleware());
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');

    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 for invalid Authorization header format', async () => {
    app = new Hono<Env>();
    app.use('*', createTenantMiddleware());
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Basic abc123' },
    });

    expect(res.status).toBe(401);
  });

  it('verifies token with ZITADEL when ZITADEL_INSTANCE_URL is set', async () => {
    process.env['ZITADEL_INSTANCE_URL'] = 'https://test.zitadel.cloud';
    process.env['ZITADEL_CLIENT_ID'] = 'test-client-id';

    vi.mocked(verifyAndExtractTenant).mockResolvedValue({
      schemaName: 'tenant_abc123',
      userId: 'user_123',
    });

    app = new Hono<Env>();
    app.use('*', createTenantMiddleware());
    app.get('/test', (c) => c.json({
      schema: c.get('tenantSchema'),
      user: c.get('userId'),
    }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer valid.jwt.token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { schema: string; user: string };
    expect(body.schema).toBe('tenant_abc123');
    expect(body.user).toBe('user_123');

    expect(verifyAndExtractTenant).toHaveBeenCalledWith('valid.jwt.token', {
      instanceUrl: 'https://test.zitadel.cloud',
      clientId: 'test-client-id',
    });
  });

  it('falls back to unsafe extraction in development without ZITADEL config', async () => {
    delete process.env['ZITADEL_INSTANCE_URL'];
    process.env['NODE_ENV'] = 'development';

    vi.mocked(extractTenantFromJwtUnsafe).mockReturnValue({
      schemaName: 'tenant_dev',
      userId: 'dev_user',
    });

    app = new Hono<Env>();
    app.use('*', createTenantMiddleware());
    app.get('/test', (c) => c.json({
      schema: c.get('tenantSchema'),
    }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer dev.token' },
    });

    expect(res.status).toBe(200);
    expect(extractTenantFromJwtUnsafe).toHaveBeenCalledWith('dev.token');
  });

  it('returns 401 when token verification fails', async () => {
    process.env['ZITADEL_INSTANCE_URL'] = 'https://test.zitadel.cloud';

    vi.mocked(verifyAndExtractTenant).mockResolvedValue(null);

    app = new Hono<Env>();
    app.use('*', createTenantMiddleware());
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer invalid.token' },
    });

    expect(res.status).toBe(401);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('Invalid token or missing tenant context');
  });
});
