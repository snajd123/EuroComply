import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { tenantMiddleware, extractTenantFromJwt, createTenantMiddleware } from './tenant.js';
import type { Env, ApiKeyAuthorities } from '../app.js';
import { WorkspaceAuthority } from '@eurocomply/database';

// Mock @clerk/backend for middleware tests
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

// Mock for ApiKeyService validateKey - hoisted-safe variable
let mockValidateKeyFn = vi.fn();

// Mock @eurocomply/database for ApiKeyService
vi.mock('@eurocomply/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@eurocomply/database')>();

  // Define class inside factory to avoid hoisting issues
  class MockApiKeyServiceClass {
    validateKey(...args: unknown[]) {
      return mockValidateKeyFn(...args);
    }
    createKey = vi.fn();
    listKeys = vi.fn();
    revokeKey = vi.fn();
  }

  return {
    ...original,
    ApiKeyService: MockApiKeyServiceClass,
  };
});

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

  describe('createTenantMiddleware (with API key)', () => {
    it('sets apiKeyAuthorities in context when API key auth succeeds', async () => {
      mockValidateKeyFn.mockResolvedValue({
        valid: true,
        organizationId: 'org_123',
        schemaName: 'tenant_acme',
        apiKeyId: 'apikey_456',
        designAuthority: WorkspaceAuthority.EDITOR,
        operationsAuthority: WorkspaceAuthority.VIEWER,
        marketingAuthority: WorkspaceAuthority.NONE,
        complianceAuthority: WorkspaceAuthority.CONTRIBUTOR,
        isOrgAdmin: false,
      });

      const mockEm = {} as any;
      const middleware = createTenantMiddleware({ em: mockEm });
      const app = new Hono<Env>();
      app.use('*', middleware);
      app.get('/test', (c) => {
        const authorities = c.get('apiKeyAuthorities');
        return c.json({
          schema: c.get('tenantSchema'),
          user: c.get('userId'),
          authorities,
        });
      });

      const res = await app.request('/test', {
        headers: { 'X-API-Key': 'ek_live_test123' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        schema: string;
        user: string;
        authorities: ApiKeyAuthorities;
      };
      expect(data.schema).toBe('tenant_acme');
      expect(data.authorities).toEqual({
        designAuthority: WorkspaceAuthority.EDITOR,
        operationsAuthority: WorkspaceAuthority.VIEWER,
        marketingAuthority: WorkspaceAuthority.NONE,
        complianceAuthority: WorkspaceAuthority.CONTRIBUTOR,
        isOrgAdmin: false,
      });
    });

    it('uses apiKeyId in userId for audit traceability', async () => {
      mockValidateKeyFn.mockResolvedValue({
        valid: true,
        organizationId: 'org_123',
        schemaName: 'tenant_acme',
        apiKeyId: 'apikey_789',
        designAuthority: WorkspaceAuthority.NONE,
        operationsAuthority: WorkspaceAuthority.NONE,
        marketingAuthority: WorkspaceAuthority.NONE,
        complianceAuthority: WorkspaceAuthority.NONE,
        isOrgAdmin: true,
      });

      const mockEm = {} as any;
      const middleware = createTenantMiddleware({ em: mockEm });
      const app = new Hono<Env>();
      app.use('*', middleware);
      app.get('/test', (c) => {
        return c.json({
          userId: c.get('userId'),
        });
      });

      const res = await app.request('/test', {
        headers: { 'X-API-Key': 'ek_live_test456' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { userId: string };
      // Should use apiKeyId, not organizationId
      expect(data.userId).toBe('api-key:apikey_789');
    });

    it('returns 401 when API key validation fails', async () => {
      mockValidateKeyFn.mockResolvedValue({
        valid: false,
        error: 'API key has been revoked',
      });

      const mockEm = {} as any;
      const middleware = createTenantMiddleware({ em: mockEm });
      const app = new Hono<Env>();
      app.use('*', middleware);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { 'X-API-Key': 'ek_live_invalid' },
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string; message: string };
      expect(data.error).toBe('Unauthorized');
      expect(data.message).toBe('API key has been revoked');
    });
  });
});
