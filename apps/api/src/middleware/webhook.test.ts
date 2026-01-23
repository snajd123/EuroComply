import { describe, it, expect } from 'vitest';
import { verifyZitadelWebhook } from './webhook.js';
import { createHmac } from 'crypto';

describe('verifyZitadelWebhook', () => {
  const signingKey = 'test-signing-key-12345';

  function createValidSignature(payload: string, timestamp: number): string {
    const signedPayload = `${timestamp}.${payload}`;
    const hmac = createHmac('sha256', signingKey);
    hmac.update(signedPayload);
    const signature = hmac.digest('hex');
    return `t=${timestamp},v1=${signature}`;
  }

  it('returns valid for correct signature', () => {
    const payload = '{"type":"org.created","data":{"id":"org_123"}}';
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createValidSignature(payload, timestamp);

    const result = verifyZitadelWebhook({
      payload,
      signature,
      signingKey,
    });

    expect(result.valid).toBe(true);
    expect(result.payload).toEqual(JSON.parse(payload));
  });

  it('returns invalid for wrong signature', () => {
    const payload = '{"type":"org.created"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const wrongSignature = `t=${timestamp},v1=wrongsignature`;

    const result = verifyZitadelWebhook({
      payload,
      signature: wrongSignature,
      signingKey,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature');
  });

  it('returns invalid for missing signature header', () => {
    const result = verifyZitadelWebhook({
      payload: '{}',
      signature: undefined,
      signingKey,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Missing');
  });

  it('returns invalid for malformed signature header', () => {
    const result = verifyZitadelWebhook({
      payload: '{}',
      signature: 'malformed-header',
      signingKey,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Malformed');
  });

  it('returns invalid for expired timestamp (>5 min old)', () => {
    const payload = '{"type":"org.created"}';
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
    const signature = createValidSignature(payload, oldTimestamp);

    const result = verifyZitadelWebhook({
      payload,
      signature,
      signingKey,
      timestampToleranceSeconds: 300,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('accepts timestamp within tolerance', () => {
    const payload = '{"type":"org.created"}';
    const recentTimestamp = Math.floor(Date.now() / 1000) - 60;
    const signature = createValidSignature(payload, recentTimestamp);

    const result = verifyZitadelWebhook({
      payload,
      signature,
      signingKey,
      timestampToleranceSeconds: 300,
    });

    expect(result.valid).toBe(true);
  });
});
