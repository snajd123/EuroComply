/**
 * Webhook Routes
 *
 * Handles incoming webhooks from external services (Clerk, etc.)
 * These endpoints are NOT authenticated - they use signature verification instead.
 */

import { Hono } from 'hono';
import {
  verifyWebhookSignature,
  processWebhookEvent,
} from '../services/clerk-webhook.service.js';

export const webhooks = new Hono();

/**
 * Clerk Webhook Endpoint
 *
 * POST /webhooks/clerk
 *
 * Receives and processes Clerk webhook events for user sync.
 * Verifies the webhook signature using the CLERK_WEBHOOK_SECRET.
 */
webhooks.post('/clerk', async (c) => {
  const webhookSecret = process.env['CLERK_WEBHOOK_SECRET'];

  if (!webhookSecret) {
    console.error('[Webhook] CLERK_WEBHOOK_SECRET not configured');
    return c.json(
      { success: false, error: 'Webhook not configured' },
      500
    );
  }

  // Get the raw body for signature verification
  const payload = await c.req.text();

  // Get Svix headers
  const svixId = c.req.header('svix-id');
  const svixTimestamp = c.req.header('svix-timestamp');
  const svixSignature = c.req.header('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.warn('[Webhook] Missing svix headers');
    return c.json(
      { success: false, error: 'Missing webhook headers' },
      400
    );
  }

  try {
    // Verify the webhook signature
    const event = verifyWebhookSignature(
      payload,
      {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      },
      webhookSecret
    );

    // Process the event
    await processWebhookEvent(event);

    return c.json({ success: true, received: true });
  } catch (error) {
    if (error instanceof Error) {
      console.error('[Webhook] Verification failed:', error.message);

      // Don't expose internal error details
      if (error.message.includes('signature')) {
        return c.json(
          { success: false, error: 'Invalid signature' },
          401
        );
      }
    }

    console.error('[Webhook] Processing failed:', error);
    return c.json(
      { success: false, error: 'Webhook processing failed' },
      500
    );
  }
});
