import { MikroORM, LockMode } from '@mikro-orm/postgresql';
import { OutboxEvent, OutboxStatus } from '../entities/OutboxEvent.js';
import { Organization, ProvisioningStatus } from '../entities/Organization.js';
import { getHandler } from './outbox-handlers/index.js';

export interface ProcessEventResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

export class OutboxProcessorService {
  constructor(private orm: MikroORM) {}

  /**
   * Claim the next pending event from a schema.
   * Uses SELECT FOR UPDATE SKIP LOCKED for safe concurrent access.
   */
  async claimNextEvent(schema: string): Promise<OutboxEvent | null> {
    const em = this.orm.em.fork({ schema });

    return await em.transactional(async (txEm) => {
      const event = await txEm.findOne(
        OutboxEvent,
        { status: OutboxStatus.PENDING },
        {
          orderBy: { createdAt: 'ASC' },
          lockMode: LockMode.PESSIMISTIC_WRITE_OR_FAIL,
        }
      );

      if (!event) return null;

      event.status = OutboxStatus.PROCESSING;
      event.updatedAt = new Date();
      await txEm.flush();

      return event;
    });
  }

  /**
   * Mark an event as successfully completed.
   */
  async markCompleted(schema: string, eventId: string): Promise<void> {
    const em = this.orm.em.fork({ schema });
    const event = await em.findOneOrFail(OutboxEvent, eventId);
    event.status = OutboxStatus.COMPLETED;
    event.processedAt = new Date();
    event.updatedAt = new Date();
    await em.flush();
  }

  /**
   * Mark an event as failed with retry logic.
   * If retryCount < maxRetries, returns to PENDING for retry.
   * If retryCount >= maxRetries, marks as FAILED permanently.
   */
  async markFailed(schema: string, eventId: string, errorMessage: string, maxRetries: number): Promise<void> {
    const em = this.orm.em.fork({ schema });
    const event = await em.findOneOrFail(OutboxEvent, eventId);

    event.retryCount += 1;
    event.errorMessage = errorMessage;
    event.updatedAt = new Date();

    if (event.retryCount >= maxRetries) {
      event.status = OutboxStatus.FAILED;
    } else {
      event.status = OutboxStatus.PENDING;
    }

    await em.flush();
  }

  /**
   * Get all active tenant schemas that need processing.
   */
  async getActiveSchemas(): Promise<string[]> {
    const em = this.orm.em.fork({ schema: 'public' });
    const orgs = await em.find(Organization, { provisioningStatus: ProvisioningStatus.READY });
    return orgs.map((org) => org.schemaName);
  }

  /**
   * Process a single event by ID.
   * Claims the event, runs the handler, and updates status.
   */
  async processEvent(
    schema: string,
    eventId: string,
    maxRetries: number = 5
  ): Promise<ProcessEventResult> {
    const em = this.orm.em.fork({ schema });
    const event = await em.findOneOrFail(OutboxEvent, eventId);

    // Mark as processing
    event.status = OutboxStatus.PROCESSING;
    event.updatedAt = new Date();
    await em.flush();

    // Find handler
    const handler = getHandler(event.eventType);
    if (!handler) {
      // No handler registered - skip but mark as completed
      console.log(`[OutboxProcessor] No handler for ${event.eventType}, skipping`);
      await this.markCompleted(schema, eventId);
      return { success: true, skipped: true };
    }

    try {
      await handler.handle(event, { orm: this.orm, schema });
      await this.markCompleted(schema, eventId);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.markFailed(schema, eventId, errorMessage, maxRetries);
      return { success: false, error: errorMessage };
    }
  }
}
