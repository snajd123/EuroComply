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
    findOne: vi.fn(),
  },
};

const mockProvisioner = {
  provisionTenant: vi.fn().mockResolvedValue({ success: true, schemaName: 'tenant_test' }),
};

describe('webhooks routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /webhooks/clerk', () => {
    it('returns 500 without webhook secret configured', async () => {
      const router = createWebhooksRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
        webhookSecret: undefined,
      });

      const app = new Hono();
      app.route('/webhooks', router);

      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'organization.created', data: {} }),
      });

      expect(res.status).toBe(500);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('not configured');
    });

    it('processes organization.created event (without signature in test)', async () => {
      const router = createWebhooksRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
        webhookSecret: 'whsec_test',
        skipSignatureVerification: true, // For testing
      });

      const app = new Hono();
      app.route('/webhooks', router);

      const res = await app.request('/webhooks/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organization.created',
          data: {
            id: 'org_test123',
            name: 'Test Org',
            slug: 'test-org',
            created_at: Date.now(),
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean };
      expect(data.success).toBe(true);
      // Schema name derived from Clerk org ID, not slug
      expect(mockProvisioner.provisionTenant).toHaveBeenCalledWith('tenant_org_test123');
    });
  });
});
