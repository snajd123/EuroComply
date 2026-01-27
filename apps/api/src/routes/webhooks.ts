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
} from '../webhooks/clerk.js';
import type { MikroORM } from '@eurocomply/database';
import type { TenantProvisioner } from '@eurocomply/database';
import { success, error } from '../utils/response.js';

export interface WebhooksRouterOptions {
  orm: MikroORM;
  provisioner: TenantProvisioner;
  webhookSecret?: string;
  clerk?: ClerkClient;
  skipSignatureVerification?: boolean; // For testing only
}

export function createWebhooksRouter(options: WebhooksRouterOptions) {
  const { orm, provisioner, webhookSecret, clerk, skipSignatureVerification } = options;
  const router = new Hono();

  router.post('/clerk', async (c) => {
    // Check webhook secret is configured
    if (!webhookSecret) {
      return error(c, 'CONFIG_ERROR', 'Webhook secret not configured', 500);
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
        return error(c, 'INVALID_SIGNATURE', 'Invalid webhook signature', 401, { details: result.error });
      }

      event = result.payload as ClerkWebhookEvent;
    }

    // Handle the event based on type
    switch (event.type) {
      case 'organization.created': {
        const result = await handleOrganizationCreated(event, { orm, provisioner, clerk });
        if (!result.success) {
          return error(c, 'WEBHOOK_HANDLER_ERROR', result.error ?? 'Unknown error', 500);
        }
        return success(c, {
          organizationId: result.organizationId,
          schemaName: result.schemaName,
        });
      }

      case 'organization.deleted': {
        const result = await handleOrganizationDeleted(event, { orm, provisioner });
        if (!result.success) {
          return error(c, 'WEBHOOK_HANDLER_ERROR', result.error ?? 'Unknown error', 500);
        }
        return success(c, {
          organizationId: result.organizationId,
        });
      }

      case 'organization.updated': {
        // For now, just acknowledge - can add handling later
        return success(c, { message: 'Event acknowledged' });
      }

      case 'organizationMembership.created': {
        if (!orm) {
          return error(c, 'CONFIG_ERROR', 'MikroORM not configured for membership handlers', 500);
        }
        try {
          const result = await handleMembershipCreated(orm, event as unknown as ClerkOrganizationMembershipEvent);
          return success(c, result);
        } catch (err) {
          if (err instanceof RetryableError) {
            return error(c, 'RETRYABLE_ERROR', err.message, 503);
          }
          throw err;
        }
      }

      case 'organizationMembership.deleted': {
        if (!orm) {
          return error(c, 'CONFIG_ERROR', 'MikroORM not configured for membership handlers', 500);
        }
        const result = await handleMembershipDeleted(orm, event as unknown as ClerkOrganizationMembershipEvent);
        return success(c, result);
      }

      case 'user.updated': {
        if (!orm) {
          return error(c, 'CONFIG_ERROR', 'MikroORM not configured for membership handlers', 500);
        }
        const result = await handleUserUpdated(orm, event as unknown as ClerkUserUpdatedEvent);
        return success(c, result);
      }

      default: {
        // Unknown event type - acknowledge but don't process
        return success(c, { message: 'Event type not handled' });
      }
    }
  });

  return router;
}
