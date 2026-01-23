import { Hono } from 'hono';
import { WebhookEvent, WebhookStatus } from '@eurocomply/database';
import { createId } from '@eurocomply/core';
import { verifyZitadelWebhook } from '../middleware/webhook.js';
import {
  handleOrganizationCreated,
  handleOrganizationDeleted,
  type ZitadelOrganizationEvent,
  type OrmLike,
  type TenantProvisionerLike,
} from '../webhooks/zitadel.js';

export interface WebhooksRouterOptions {
  orm: OrmLike;
  provisioner: TenantProvisionerLike;
  webhookSigningKey?: string;
  skipSignatureVerification?: boolean; // For testing only
}

export function createWebhooksRouter(options: WebhooksRouterOptions) {
  const { orm, provisioner, webhookSigningKey, skipSignatureVerification } = options;
  const router = new Hono();

  router.post('/zitadel', async (c) => {
    // Check webhook signing key is configured
    if (!webhookSigningKey && !skipSignatureVerification) {
      return c.json({ error: 'Webhook signing key not configured' }, 500);
    }

    // Get request ID for idempotency (ZITADEL uses x-request-id or we generate one)
    const requestId = c.req.header('x-request-id') ?? createId();

    const em = orm.em.fork();

    // Check for existing webhook (idempotency)
    const existingWebhook = await em.findOne(WebhookEvent, { svixId: requestId });
    if (existingWebhook) {
      if (existingWebhook.status === WebhookStatus.COMPLETED) {
        return c.json({ success: true, idempotent: true, message: 'Webhook already processed' });
      }
      if (existingWebhook.status === WebhookStatus.PROCESSING) {
        return c.json({ error: 'Webhook already processing' }, 409);
      }
      // FAILED status - allow retry by continuing
    }

    // Get the raw body for signature verification
    let event: ZitadelOrganizationEvent;

    if (skipSignatureVerification) {
      // For testing: parse body directly
      event = await c.req.json();
    } else {
      // Production: verify signature
      const payload = await c.req.text();
      const signature = c.req.header('zitadel-signature');

      const result = verifyZitadelWebhook({
        payload,
        signature,
        signingKey: webhookSigningKey!,
      });

      if (!result.valid) {
        return c.json({ error: 'Invalid webhook signature', details: result.error }, 401);
      }

      event = result.payload as ZitadelOrganizationEvent;
    }

    // Create or update webhook event record
    let webhookEvent: WebhookEvent;
    if (existingWebhook) {
      // Retry of failed webhook
      webhookEvent = existingWebhook;
      webhookEvent.status = WebhookStatus.PROCESSING;
      webhookEvent.errorMessage = undefined;
    } else {
      // New webhook
      webhookEvent = em.create(WebhookEvent, {
        id: createId(),
        svixId: requestId, // Reusing field for request ID
        eventType: event.type,
        payload: event.data as Record<string, unknown>,
        status: WebhookStatus.PROCESSING,
      });
      em.persist(webhookEvent);
    }
    await em.flush();

    // Handle the event based on type
    switch (event.type) {
      case 'org.created': {
        const result = await handleOrganizationCreated(event, { orm, provisioner });
        if (!result.success) {
          webhookEvent.status = WebhookStatus.FAILED;
          webhookEvent.errorMessage = result.error;
          await em.flush();
          return c.json({ success: false, error: result.error }, 500);
        }
        webhookEvent.status = WebhookStatus.COMPLETED;
        webhookEvent.completedAt = new Date();
        await em.flush();
        return c.json({
          success: true,
          organizationId: result.organizationId,
          schemaName: result.schemaName,
        });
      }

      case 'org.removed': {
        const result = await handleOrganizationDeleted(event, { orm, provisioner });
        if (!result.success) {
          // Treat "already deleted" as success for idempotency
          if (result.error === 'Already deleted') {
            webhookEvent.status = WebhookStatus.COMPLETED;
            webhookEvent.completedAt = new Date();
            await em.flush();
            return c.json({ success: true, message: 'Already deleted' });
          }
          webhookEvent.status = WebhookStatus.FAILED;
          webhookEvent.errorMessage = result.error;
          await em.flush();
          return c.json({ success: false, error: result.error }, 500);
        }
        webhookEvent.status = WebhookStatus.COMPLETED;
        webhookEvent.completedAt = new Date();
        await em.flush();
        return c.json({
          success: true,
          organizationId: result.organizationId,
          schemaName: result.schemaName,
          message: 'Organization and tenant schema deleted',
        });
      }

      case 'org.updated': {
        // For now, just acknowledge - can add handling later
        webhookEvent.status = WebhookStatus.COMPLETED;
        webhookEvent.completedAt = new Date();
        await em.flush();
        return c.json({ success: true, message: 'Event acknowledged' });
      }

      default: {
        // Unknown event type - acknowledge but don't process
        webhookEvent.status = WebhookStatus.COMPLETED;
        webhookEvent.completedAt = new Date();
        await em.flush();
        return c.json({ success: true, message: 'Event type not handled' });
      }
    }
  });

  return router;
}
