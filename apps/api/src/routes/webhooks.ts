import { Hono } from 'hono';
import { verifyClerkWebhook } from '../middleware/webhook.js';
import {
  handleOrganizationCreated,
  handleOrganizationDeleted,
  handleMembershipCreated,
  handleMembershipDeleted,
  handleUserUpdated,
  RetryableError,
  type ClerkOrganizationEvent,
  type ClerkOrganizationMembershipEvent,
  type ClerkUserUpdatedEvent,
  type ClerkClient,
  type OrmLike,
  type TenantProvisionerLike,
} from '../webhooks/clerk.js';
import type { MikroORM } from '@eurocomply/database';

export interface WebhooksRouterOptions {
  orm: OrmLike;
  mikroOrm?: MikroORM;  // Full ORM for membership handlers
  provisioner: TenantProvisionerLike;
  webhookSecret?: string;
  clerk?: ClerkClient;
  skipSignatureVerification?: boolean; // For testing only
}

export function createWebhooksRouter(options: WebhooksRouterOptions) {
  const { orm, mikroOrm, provisioner, webhookSecret, clerk, skipSignatureVerification } = options;
  const router = new Hono();

  router.post('/clerk', async (c) => {
    // Check webhook secret is configured
    if (!webhookSecret) {
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }

    // Get the raw body for signature verification
    type ClerkWebhookEvent = ClerkOrganizationEvent | ClerkOrganizationMembershipEvent | ClerkUserUpdatedEvent;
    let event: ClerkWebhookEvent;

    if (skipSignatureVerification) {
      // For testing: parse body directly
      event = await c.req.json();
    } else {
      // Production: verify signature
      const payload = await c.req.text();

      const result = verifyClerkWebhook({
        payload,
        headers: {
          'svix-id': c.req.header('svix-id'),
          'svix-timestamp': c.req.header('svix-timestamp'),
          'svix-signature': c.req.header('svix-signature'),
        },
        secret: webhookSecret,
      });

      if (!result.valid) {
        return c.json({ error: 'Invalid webhook signature', details: result.error }, 401);
      }

      event = result.payload as ClerkWebhookEvent;
    }

    // Handle the event based on type
    switch (event.type) {
      case 'organization.created': {
        const result = await handleOrganizationCreated(event, { orm, provisioner, clerk });
        if (!result.success) {
          return c.json({ success: false, error: result.error }, 500);
        }
        return c.json({
          success: true,
          organizationId: result.organizationId,
          schemaName: result.schemaName,
        });
      }

      case 'organization.deleted': {
        const result = await handleOrganizationDeleted(event, { orm, provisioner });
        if (!result.success) {
          return c.json({ success: false, error: result.error }, 500);
        }
        return c.json({
          success: true,
          organizationId: result.organizationId,
        });
      }

      case 'organization.updated': {
        // For now, just acknowledge - can add handling later
        return c.json({ success: true, message: 'Event acknowledged' });
      }

      case 'organizationMembership.created': {
        if (!mikroOrm) {
          return c.json({ error: 'MikroORM not configured for membership handlers' }, 500);
        }
        try {
          const result = await handleMembershipCreated(mikroOrm, event as unknown as ClerkOrganizationMembershipEvent);
          return c.json(result);
        } catch (error) {
          if (error instanceof RetryableError) {
            return c.json({ error: error.message }, 503);
          }
          throw error;
        }
      }

      case 'organizationMembership.deleted': {
        if (!mikroOrm) {
          return c.json({ error: 'MikroORM not configured for membership handlers' }, 500);
        }
        const result = await handleMembershipDeleted(mikroOrm, event as unknown as ClerkOrganizationMembershipEvent);
        return c.json(result);
      }

      case 'user.updated': {
        if (!mikroOrm) {
          return c.json({ error: 'MikroORM not configured for membership handlers' }, 500);
        }
        const result = await handleUserUpdated(mikroOrm, event as unknown as ClerkUserUpdatedEvent);
        return c.json(result);
      }

      default: {
        // Unknown event type - acknowledge but don't process
        return c.json({ success: true, message: 'Event type not handled' });
      }
    }
  });

  return router;
}
