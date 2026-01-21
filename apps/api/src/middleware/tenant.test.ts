import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { tenantMiddleware, extractTenantFromJwt } from './tenant.js';
import type { Env } from '../app.js';

describe('tenant middleware', () => {
  describe('extractTenantFromJwt', () => {
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

  describe('tenantMiddleware', () => {
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
    });
  });
});
