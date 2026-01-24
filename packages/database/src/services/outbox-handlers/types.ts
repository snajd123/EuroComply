import { OutboxEvent } from '../../entities/OutboxEvent.js';
import { MikroORM } from '@mikro-orm/postgresql';
import { z } from 'zod';

export interface OutboxHandlerContext {
  orm: MikroORM;
  schema: string;
}

export interface OutboxHandler<TPayload = unknown> {
  eventType: string;
  payloadSchema: z.ZodSchema<TPayload>;
  handle(event: OutboxEvent, payload: TPayload, context: OutboxHandlerContext): Promise<void>;
}

/**
 * Validates an outbox event payload against its handler's schema.
 * Throws a descriptive error if validation fails.
 */
export function validatePayload<T>(
  handler: OutboxHandler<T>,
  payload: Record<string, unknown>
): T {
  const result = handler.payloadSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      `Invalid payload for ${handler.eventType}: ${result.error.message}`
    );
  }
  return result.data;
}
