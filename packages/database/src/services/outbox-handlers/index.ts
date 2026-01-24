import { OutboxHandler } from './types.js';
import { organizationProvisionedHandler } from './organization-provisioned.handler.js';

export * from './types.js';

/**
 * Registry of all outbox event handlers.
 * Add new handlers here as they are implemented.
 */
const handlers: OutboxHandler[] = [
  organizationProvisionedHandler,
];

const handlerMap = new Map<string, OutboxHandler>(
  handlers.map((h) => [h.eventType, h])
);

export function getHandler(eventType: string): OutboxHandler | undefined {
  return handlerMap.get(eventType);
}

export function getRegisteredEventTypes(): string[] {
  return Array.from(handlerMap.keys());
}
