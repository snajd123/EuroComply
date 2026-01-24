import { OutboxHandler } from './types.js';
import { organizationProvisionedHandler } from './organization-provisioned.handler.js';

export * from './types.js';
export { organizationProvisionedPayloadSchema } from './organization-provisioned.handler.js';

/**
 * Registry of all outbox event handlers.
 * Add new handlers here as they are implemented.
 *
 * We use OutboxHandler<unknown> for the registry since handlers have
 * different payload types. Type safety is enforced at validation time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: OutboxHandler<any>[] = [
  organizationProvisionedHandler,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlerMap = new Map<string, OutboxHandler<any>>(
  handlers.map((h) => [h.eventType, h])
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getHandler(eventType: string): OutboxHandler<any> | undefined {
  return handlerMap.get(eventType);
}

export function getRegisteredEventTypes(): string[] {
  return Array.from(handlerMap.keys());
}
