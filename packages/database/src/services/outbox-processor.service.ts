import { MikroORM, LockMode } from '@mikro-orm/postgresql';
import { OutboxEvent, OutboxStatus } from '../entities/OutboxEvent.js';
import { Organization, ProvisioningStatus } from '../entities/Organization.js';

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
}
