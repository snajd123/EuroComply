import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { tenantMiddleware, extractTenantFromJwt, createTenantMiddleware } from './tenant.js';
import type { Env } from '../app.js';

// Mock @clerk/backend for middleware tests
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

import { verifyToken } from '@clerk/backend';

const mockVerifyToken = vi.mocked(verifyToken);

describe('tenant middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractTenantFromJwt (deprecated)', () => {
    it('extracts schema_name from JWT payload', () => {
      // Base64 encoded payload: {"schema_name":"tenant_acme","sub":"user123"}
      const payload = btoa(JSON.stringify({ schema_name: 'tenant_acme', sub: 'user123' }));
      const token = `header.${payload}.signature`;

      const result = extractTenantFromJwt(token);
      expect(result).toEqual({ schemaName: 'tenant_acme', userId: 'user123' });
    });

    it('returns null for invalid token', () => {
      expect(extractTenantFromJwt('')).toBeNull();
      expect(extractTenantFromJwt('invalid')).toBeNull();
      expect(extractTenantFromJwt('a.b')).toBeNull();
    });

    it('returns null if schema_name missing', () => {
      const payload = btoa(JSON.stringify({ sub: 'user123' }));
      const token = `header.${payload}.signature`;
      expect(extractTenantFromJwt(token)).toBeNull();
    });
  });

  describe('tenantMiddleware (without CLERK_SECRET_KEY)', () => {
    // These tests run without CLERK_SECRET_KEY, so they use unsafe extraction

    it('sets tenant context from Authorization header', async () => {
      const app = new Hono<Env>();
      app.use('*', tenantMiddleware);
      app.get('/test', (c) => {
        return c.json({
          schema: c.get('tenantSchema'),
          user: c.get('userId'),
        });
      });

      const payload = btoa(JSON.stringify({ schema_name: 'tenant_acme', sub: 'user123' }));
      const token = `header.${payload}.signature`;

      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { schema: string; user: string };
      expect(data.schema).toBe('tenant_acme');
      expect(data.user).toBe('user123');
    });

    it('returns 401 without Authorization header', async () => {
      const app = new Hono<Env>();
      app.use('*', tenantMiddleware);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(401);

      const data = (await res.json()) as { error: string; message: string };
      expect(data.error).toBe('Unauthorized');
      expect(data.message).toBe('Missing X-API-Key or Authorization header');
    });

    it('returns 401 for invalid token format', async () => {
      const app = new Hono<Env>();
      app.use('*', tenantMiddleware);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);

      const data = (await res.json()) as { error: string; message: string };
      expect(data.message).toBe('Invalid token or missing tenant context');
    });

    it('returns 401 when Authorization header is not Bearer', async () => {
      const app = new Hono<Env>();
      app.use('*', tenantMiddleware);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('createTenantMiddleware (with secretKey)', () => {
    it('verifies JWT signature when secretKey is provided', async () => {
      mockVerifyToken.mockResolvedValue({
        data: {
          sub: 'user_verified',
          org_metadata: { schema_name: 'tenant_secure' },
        },
        errors: undefined,
      } as any);

      const middleware = createTenantMiddleware({ secretKey: 'sk_test_xxxxx' });
      const app = new Hono<Env>();
      app.use('*', middleware);
      app.get('/test', (c) => {
        return c.json({
          schema: c.get('tenantSchema'),
          user: c.get('userId'),
        });
      });

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer real.jwt.token' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { schema: string; user: string };
      expect(data.schema).toBe('tenant_secure');
      expect(data.user).toBe('user_verified');
      expect(mockVerifyToken).toHaveBeenCalledWith('real.jwt.token', expect.any(Object));
    });

    it('returns 401 when JWT verification fails', async () => {
      mockVerifyToken.mockResolvedValue({
        data: undefined,
        errors: [new Error('Invalid signature')],
      } as any);

      const middleware = createTenantMiddleware({ secretKey: 'sk_test_xxxxx' });
      const app = new Hono<Env>();
      app.use('*', middleware);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer invalid.signature.token' },
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string; message: string };
      expect(data.message).toBe('Invalid token or missing tenant context');
    });

    it('returns 401 when verified token has no schema_name', async () => {
      mockVerifyToken.mockResolvedValue({
        data: {
          sub: 'user_no_schema',
          org_id: 'org_123',
          // Missing org_metadata.schema_name
        },
        errors: undefined,
      } as any);

      const middleware = createTenantMiddleware({ secretKey: 'sk_test_xxxxx' });
      const app = new Hono<Env>();
      app.use('*', middleware);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer no.schema.token' },
      });

      expect(res.status).toBe(401);
    });

    it('passes authorizedParties to verifyToken', async () => {
      mockVerifyToken.mockResolvedValue({
        data: {
          sub: 'user_test',
          org_metadata: { schema_name: 'tenant_test' },
        },
        errors: undefined,
      } as any);

      const middleware = createTenantMiddleware({
        secretKey: 'sk_test_xxxxx',
        authorizedParties: ['https://app.example.com', 'https://admin.example.com'],
      });

      const app = new Hono<Env>();
      app.use('*', middleware);
      app.get('/test', (c) => c.json({ ok: true }));

      await app.request('/test', {
        headers: { Authorization: 'Bearer test.token' },
      });

      expect(mockVerifyToken).toHaveBeenCalledWith('test.token', {
        secretKey: 'sk_test_xxxxx',
        jwtKey: undefined,
        authorizedParties: ['https://app.example.com', 'https://admin.example.com'],
      });
    });
  });
});
