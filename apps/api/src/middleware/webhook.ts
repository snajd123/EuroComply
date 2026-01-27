import { createMiddleware } from 'hono/factory';
import { Webhook } from 'svix';
import { error } from '../utils/response.js';

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
  payload?: unknown;
}

export interface VerifyOptions {
  payload: string;
  headers: Record<string, string | undefined>;
  secret: string;
}

/**
 * Verifies a Clerk webhook signature using Svix.
 */
export function verifyClerkWebhook(options: VerifyOptions): WebhookVerificationResult {
  const { payload, headers, secret } = options;

  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) {
    return {
      valid: false,
      error: 'Missing required Svix headers (svix-id, svix-timestamp, svix-signature)',
    };
  }

  try {
    const wh = new Webhook(secret);
    const verified = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
    return { valid: true, payload: verified };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Signature verification failed',
    };
  }
}

/**
 * Middleware that verifies Clerk webhook signatures.
 */
export function clerkWebhookMiddleware(secret: string) {
  return createMiddleware(async (c, next) => {
    const payload = await c.req.text();

    const result = verifyClerkWebhook({
      payload,
      headers: {
        'svix-id': c.req.header('svix-id'),
        'svix-timestamp': c.req.header('svix-timestamp'),
        'svix-signature': c.req.header('svix-signature'),
      },
      secret,
    });

    if (!result.valid) {
      return error(c, 'INVALID_SIGNATURE', 'Invalid webhook signature', 401, { details: result.error });
    }

    // Store verified payload for handler
    c.set('webhookPayload', result.payload);
    await next();
  });
}
