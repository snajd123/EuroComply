import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { clerkWebhookMiddleware, verifyClerkWebhook } from './webhook.js';

describe('webhook middleware', () => {
  describe('verifyClerkWebhook', () => {
    it('returns false for missing headers', () => {
      const result = verifyClerkWebhook({
        payload: '{}',
        headers: {},
        secret: 'whsec_test',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing');
    });

    it('returns false for invalid signature', () => {
      const result = verifyClerkWebhook({
        payload: '{"type":"test"}',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': String(Math.floor(Date.now() / 1000)),
          'svix-signature': 'v1,invalid_signature',
        },
        secret: 'whsec_test',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('clerkWebhookMiddleware', () => {
    it('rejects requests without svix headers', async () => {
      const app = new Hono();
      app.use('*', clerkWebhookMiddleware('whsec_test'));
      app.post('/webhook', (c) => c.json({ ok: true }));

      const res = await app.request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'test' }),
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Invalid webhook signature');
    });
  });
});
