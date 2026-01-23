import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createWebhooksRouter } from './webhooks.js';

// Mock dependencies
const mockOrm = {
  em: {
    fork: vi.fn(() => mockOrm.em),
    create: vi.fn((Entity: unknown, data: Record<string, unknown>) => ({ ...data, id: 'mock_id' })),
    persist: vi.fn(),
    flush: vi.fn(),
    findOne: vi.fn().mockResolvedValue(null), // Default: no existing webhook/org
  },
};

const mockProvisioner = {
  provisionTenant: vi.fn().mockResolvedValue({ success: true, schemaName: 'tenant_test' }),
};

describe('webhooks routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /webhooks/zitadel', () => {
    it('returns 500 without webhook signing key configured', async () => {
      const router = createWebhooksRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
        webhookSigningKey: undefined,
      });

      const app = new Hono();
      app.route('/webhooks', router);

      const res = await app.request('/webhooks/zitadel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'org.created', data: {} }),
      });

      expect(res.status).toBe(500);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('not configured');
    });

    it('processes org.created event (without signature in test)', async () => {
      const router = createWebhooksRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
        webhookSigningKey: 'test-signing-key',
        skipSignatureVerification: true, // For testing
      });

      const app = new Hono();
      app.route('/webhooks', router);

      const res = await app.request('/webhooks/zitadel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': 'req_test_123',
        },
        body: JSON.stringify({
          type: 'org.created',
          data: {
            orgId: '123456789012345678',
            name: 'Test Org',
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean };
      expect(data.success).toBe(true);
      // Schema name derived from ZITADEL org ID (last 8 chars)
      expect(mockProvisioner.provisionTenant).toHaveBeenCalledWith('tenant_org_12345678');
    });
  });
});
