import { OutboxHandler, OutboxHandlerContext } from './types.js';
import { OutboxEvent } from '../../entities/OutboxEvent.js';

/**
 * Handler for organization.provisioned events.
 *
 * Currently a no-op - the organization is already provisioned.
 * Future uses:
 * - Send welcome email
 * - Initialize default data
 * - Notify external systems
 */
export const organizationProvisionedHandler: OutboxHandler = {
  eventType: 'organization.provisioned',

  async handle(event: OutboxEvent, context: OutboxHandlerContext): Promise<void> {
    const { organizationId, schemaName, name } = event.payload as {
      organizationId: string;
      schemaName: string;
      name: string;
    };

    // Log for now - actual side effects to be added later
    console.log(
      `[OutboxHandler] organization.provisioned: ${name} (${organizationId}) -> ${schemaName}`
    );
  },
};
