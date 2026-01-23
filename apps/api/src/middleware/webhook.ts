import { createMiddleware } from 'hono/factory';
import { createHmac, timingSafeEqual } from 'crypto';

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
  payload?: unknown;
}

export interface VerifyZitadelOptions {
  payload: string;
  signature: string | undefined;
  signingKey: string;
  timestampToleranceSeconds?: number;
}

export function verifyZitadelWebhook(options: VerifyZitadelOptions): WebhookVerificationResult {
  const { payload, signature, signingKey, timestampToleranceSeconds = 300 } = options;

  if (!signature) {
    return {
      valid: false,
      error: 'Missing zitadel-signature header',
    };
  }

  const parts = signature.split(',');
  const timestampPart = parts.find(p => p.startsWith('t='));
  const signaturePart = parts.find(p => p.startsWith('v1='));

  if (!timestampPart || !signaturePart) {
    return {
      valid: false,
      error: 'Malformed zitadel-signature header',
    };
  }

  const timestamp = parseInt(timestampPart.slice(2), 10);
  const receivedSignature = signaturePart.slice(3);

  if (isNaN(timestamp)) {
    return {
      valid: false,
      error: 'Malformed timestamp in signature header',
    };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > timestampToleranceSeconds) {
    return {
      valid: false,
      error: `Webhook timestamp expired (received: ${timestamp}, now: ${now})`,
    };
  }

  const signedPayload = `${timestamp}.${payload}`;
  const hmac = createHmac('sha256', signingKey);
  hmac.update(signedPayload);
  const expectedSignature = hmac.digest('hex');

  try {
    const receivedBuffer = Buffer.from(receivedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return {
        valid: false,
        error: 'Invalid signature length',
      };
    }

    if (!timingSafeEqual(receivedBuffer, expectedBuffer)) {
      return {
        valid: false,
        error: 'Invalid webhook signature',
      };
    }
  } catch {
    return {
      valid: false,
      error: 'Invalid signature format',
    };
  }

  try {
    return {
      valid: true,
      payload: JSON.parse(payload),
    };
  } catch {
    return {
      valid: false,
      error: 'Invalid JSON payload',
    };
  }
}

export function zitadelWebhookMiddleware(signingKey: string) {
  return createMiddleware(async (c, next) => {
    const payload = await c.req.text();
    const signature = c.req.header('zitadel-signature');

    const result = verifyZitadelWebhook({
      payload,
      signature,
      signingKey,
    });

    if (!result.valid) {
      return c.json({ error: 'Invalid webhook signature', details: result.error }, 401);
    }

    c.set('webhookPayload', result.payload);
    await next();
  });
}
