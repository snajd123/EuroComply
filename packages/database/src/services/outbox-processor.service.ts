import { MikroORM } from '@mikro-orm/postgresql';
import { OutboxEvent, OutboxStatus } from '../entities/OutboxEvent.js';
import { Organization, ProvisioningStatus } from '../entities/Organization.js';
import { getHandler, validatePayload } from './outbox-handlers/index.js';

export interface ProcessEventResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

export interface BatchResult {
  processed: number;
  failed: number;
  skipped: number;
}

export interface AllSchemasResult {
  public: BatchResult;
  tenants: Map<string, BatchResult>;
  totalProcessed: number;
  totalFailed: number;
}

export class OutboxProcessorService {
  constructor(private orm: MikroORM) {}

  /**
   * Claim the next pending event from a schema.
   * Uses SELECT FOR UPDATE SKIP LOCKED for safe concurrent access.
   *
   * SKIP LOCKED ensures multiple workers can process events concurrently
   * without blocking each other - if a row is locked, it's skipped and
   * the next available row is claimed instead.
   */
  async claimNextEvent(schema: string): Promise<OutboxEvent | null> {
    const em = this.orm.em.fork({ schema });

    // Use raw SQL with SKIP LOCKED for proper concurrent worker safety
    // MikroORM's PESSIMISTIC_WRITE_OR_FAIL uses NOWAIT which throws errors
    const result = await em.transactional(async (txEm) => {
      // Claim and update in one atomic operation
      const rows = await txEm.execute<OutboxEvent[]>(`
        UPDATE "${schema}".outbox_event
        SET status = '${OutboxStatus.PROCESSING}', updated_at = NOW()
        WHERE id = (
          SELECT id FROM "${schema}".outbox_event
          WHERE status = '${OutboxStatus.PENDING}'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);

      if (!rows || rows.length === 0) return null;

      // Map raw result to entity (column names are snake_case)
      const row = rows[0]!;
      const event = new OutboxEvent();
      event.id = row.id;
      event.aggregateType = (row as Record<string, unknown>).aggregate_type as string;
      event.aggregateId = (row as Record<string, unknown>).aggregate_id as string;
      event.eventType = (row as Record<string, unknown>).event_type as string;
      event.payload = row.payload;
      event.status = row.status;
      event.retryCount = (row as Record<string, unknown>).retry_count as number;
      event.processedAt = (row as Record<string, unknown>).processed_at as Date | undefined;
      event.errorMessage = (row as Record<string, unknown>).error_message as string | undefined;
      event.createdAt = (row as Record<string, unknown>).created_at as Date;
      event.updatedAt = (row as Record<string, unknown>).updated_at as Date;

      return event;
    });

    return result;
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
      // Validate payload against handler's schema (throws if invalid)
      const validatedPayload = validatePayload(handler, event.payload);
      await handler.handle(event, validatedPayload, { orm: this.orm, schema });
      await this.markCompleted(schema, eventId);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.markFailed(schema, eventId, errorMessage, maxRetries);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Process a batch of pending events from a schema.
   * Returns counts of processed, failed, and skipped events.
   */
  async processBatch(schema: string, batchSize: number): Promise<BatchResult> {
    const em = this.orm.em.fork({ schema });
    const events = await em.find(
      OutboxEvent,
      { status: OutboxStatus.PENDING },
      { orderBy: { createdAt: 'ASC' }, limit: batchSize }
    );

    const result: BatchResult = { processed: 0, failed: 0, skipped: 0 };

    for (const event of events) {
      const processResult = await this.processEvent(schema, event.id);
      if (processResult.success) {
        result.processed++;
        if (processResult.skipped) {
          result.skipped++;
        }
      } else {
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Process events from all schemas (public + active tenants).
   * Returns detailed results per schema and totals.
   */
  async processAllSchemas(batchSize: number): Promise<AllSchemasResult> {
    const result: AllSchemasResult = {
      public: { processed: 0, failed: 0, skipped: 0 },
      tenants: new Map(),
      totalProcessed: 0,
      totalFailed: 0,
    };

    // 1. Process public schema (system events)
    result.public = await this.processBatch('public', batchSize);
    result.totalProcessed += result.public.processed;
    result.totalFailed += result.public.failed;

    // 2. Process all tenant schemas
    const schemas = await this.getActiveSchemas();
    for (const schema of schemas) {
      try {
        const tenantResult = await this.processBatch(schema, batchSize);
        result.tenants.set(schema, tenantResult);
        result.totalProcessed += tenantResult.processed;
        result.totalFailed += tenantResult.failed;
      } catch (error) {
        console.error(`[OutboxProcessor] Error processing schema ${schema}:`, error);
        result.tenants.set(schema, { processed: 0, failed: 1, skipped: 0 });
        result.totalFailed++;
      }
    }

    return result;
  }
}
