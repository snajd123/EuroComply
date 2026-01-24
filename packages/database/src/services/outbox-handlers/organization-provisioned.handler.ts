import { z } from 'zod';
import { OutboxHandler, OutboxHandlerContext, validatePayload } from './types.js';
import { OutboxEvent } from '../../entities/OutboxEvent.js';

/**
 * Payload schema for organization.provisioned events.
 * Validated at runtime - no unsafe type assertions.
 */
export const organizationProvisionedPayloadSchema = z.object({
  organizationId: z.string().min(1),
  schemaName: z.string().min(1),
  name: z.string().min(1),
});

export type OrganizationProvisionedPayload = z.infer<typeof organizationProvisionedPayloadSchema>;

/**
 * Handler for organization.provisioned events.
 *
 * Currently a no-op - the organization is already provisioned.
 * Future uses:
 * - Send welcome email
 * - Initialize default data
 * - Notify external systems
 */
export const organizationProvisionedHandler: OutboxHandler<OrganizationProvisionedPayload> = {
  eventType: 'organization.provisioned',
  payloadSchema: organizationProvisionedPayloadSchema,

  async handle(
    event: OutboxEvent,
    payload: OrganizationProvisionedPayload,
    context: OutboxHandlerContext
  ): Promise<void> {
    // Payload is already validated - type-safe access
    const { organizationId, schemaName, name } = payload;

    // Log for now - actual side effects to be added later
    console.log(
      `[OutboxHandler] organization.provisioned: ${name} (${organizationId}) -> ${schemaName}`
    );
  },
};
