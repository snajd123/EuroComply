import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

export interface EventPayload {
  [key: string]: unknown;
}

export interface OutboxEventInput {
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: EventPayload;
}

/**
 * Publishes an event to the outbox within a transaction.
 * The event will be picked up by a separate processor for delivery.
 *
 * @example
 * ```typescript
 * await prisma.$transaction(async (tx) => {
 *   // Your business logic
 *   await tx.product.create({ ... });
 *
 *   // Publish event atomically
 *   await publishEvent(tx, {
 *     organizationId: 'org_123',
 *     eventType: 'product.created',
 *     aggregateType: 'product',
 *     aggregateId: 'prod_456',
 *     payload: { name: 'New Product', sku: 'SKU-001' },
 *   });
 * });
 * ```
 */
export async function publishEvent(
  tx: Prisma.TransactionClient,
  event: OutboxEventInput
): Promise<string> {
  const id = `evt_${randomUUID().replace(/-/g, '')}`;

  await tx.outboxEvent.create({
    data: {
      id,
      organizationId: event.organizationId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as Prisma.JsonObject,
      status: 'PENDING',
      attempts: 0,
    },
  });

  return id;
}

/**
 * Batch publish multiple events within a transaction.
 */
export async function publishEvents(
  tx: Prisma.TransactionClient,
  events: OutboxEventInput[]
): Promise<string[]> {
  const ids: string[] = [];

  for (const event of events) {
    const id = await publishEvent(tx, event);
    ids.push(id);
  }

  return ids;
}

/**
 * Event type constants for type safety.
 */
export const EventTypes = {
  // Product events
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
  PRODUCT_ARCHIVED: 'product.archived',

  // Version events
  VERSION_CREATED: 'version.created',
  VERSION_RELEASED: 'version.released',
  VERSION_CHECKED_OUT: 'version.checked_out',

  // DPP events
  DPP_COMMISSIONED: 'dpp.commissioned',
  DPP_PROVISIONED: 'dpp.provisioned',
  DPP_RECALLED: 'dpp.recalled',
  DPP_DECOMMISSIONED: 'dpp.decommissioned',

  // Batch events
  BATCH_CREATED: 'batch.created',
  BATCH_RELEASED: 'batch.released',
  BATCH_RECALLED: 'batch.recalled',

  // User events
  USER_INVITED: 'user.invited',
  USER_JOINED: 'user.joined',
  USER_REMOVED: 'user.removed',

  // Organization events
  ORG_CREATED: 'organization.created',
  ORG_UPDATED: 'organization.updated',
  ORG_SUBSCRIPTION_CHANGED: 'organization.subscription_changed',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];
