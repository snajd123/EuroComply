import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { MikroOrm, OutboxStatus, listTenantSchemas, createTenantEm } from '@eurocomply/db';
import { loggers } from '../lib/logger.js';

const { OutboxEvent } = MikroOrm;
const log = loggers.outbox;

export interface EventHandler {
  (event: MikroOrm.OutboxEvent): Promise<void>;
}

/**
 * Outbox processor that polls for pending events and delivers them.
 * Uses at-least-once delivery with exponential backoff.
 *
 * Implements the "Sovereign Relay" pattern: iterates over all tenant schemas
 * and processes each tenant's outbox independently for data sovereignty.
 */
export class OutboxProcessor {
  private handlers: Map<string, EventHandler[]> = new Map();
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private orm: MikroORM | null = null;

  private readonly POLL_INTERVAL_MS = 100; // 100ms polling
  private readonly BATCH_SIZE = 100;
  private readonly MAX_ATTEMPTS = 10;

  /**
   * Register a handler for an event type.
   * Multiple handlers can be registered for the same event type.
   */
  on(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }

  /**
   * Register a handler for all events (wildcard).
   */
  onAll(handler: EventHandler): void {
    this.on('*', handler);
  }

  /**
   * Start the processor.
   *
   * @param orm - MikroORM instance for database access
   */
  start(orm: MikroORM): void {
    if (this.isRunning) {
      log.warn('Outbox processor already running');
      return;
    }

    this.orm = orm;
    this.isRunning = true;
    log.info('Starting outbox processor');
    this.poll();
  }

  /**
   * Stop the processor gracefully.
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
    this.orm = null;
    log.info('Outbox processor stopped');
  }

  private async poll(): Promise<void> {
    if (!this.isRunning || !this.orm) return;

    try {
      await this.processBatch();
    } catch (error) {
      log.error({ error }, 'Outbox processor error');
    }

    // Schedule next poll
    this.pollInterval = setTimeout(() => this.poll(), this.POLL_INTERVAL_MS);
  }

  private async processBatch(): Promise<void> {
    if (!this.orm) return;

    // Get all tenant schemas and process each (Sovereign Relay pattern)
    const schemas = await listTenantSchemas(this.orm);

    for (const schemaName of schemas) {
      try {
        await this.processTenantBatch(schemaName);
      } catch (error) {
        // Log but continue with other tenants
        log.error({ schemaName, error }, 'Error processing tenant batch');
      }
    }
  }

  private async processTenantBatch(schemaName: string): Promise<void> {
    if (!this.orm) return;

    // Create a tenant-scoped EntityManager
    const em = createTenantEm(this.orm, schemaName);

    try {
      // Fetch pending events that are ready for retry
      const events = await em.find(
        OutboxEvent,
        {
          $or: [
            { status: OutboxStatus.PENDING },
            {
              status: OutboxStatus.FAILED,
              attempts: { $lt: this.MAX_ATTEMPTS },
              // Events older than minimum backoff (will filter further per-event)
              processedAt: { $lt: new Date(Date.now() - this.calculateBackoff(1)) },
            },
          ],
        },
        {
          orderBy: { createdAt: 'ASC' },
          limit: this.BATCH_SIZE,
        }
      );

      for (const event of events) {
        // Check backoff for failed events
        if (event.status === OutboxStatus.FAILED && event.processedAt) {
          const backoffMs = this.calculateBackoff(event.attempts);
          const retryAfter = new Date(event.processedAt.getTime() + backoffMs);
          if (new Date() < retryAfter) {
            continue; // Not ready for retry yet
          }
        }

        await this.processEvent(em, event);
      }
    } finally {
      // Clear the forked EntityManager
      em.clear();
    }
  }

  private async processEvent(em: EntityManager, event: MikroOrm.OutboxEvent): Promise<void> {
    // Mark as processing
    event.status = OutboxStatus.PROCESSING;
    await em.flush();

    try {
      // Get handlers for this event type
      const typeHandlers = this.handlers.get(event.eventType) || [];
      const wildcardHandlers = this.handlers.get('*') || [];
      const allHandlers = [...typeHandlers, ...wildcardHandlers];

      if (allHandlers.length === 0) {
        log.warn({ eventType: event.eventType }, 'No handlers for event type');
      }

      // Execute all handlers
      await Promise.all(allHandlers.map((handler) => handler(event)));

      // Mark as delivered
      event.status = OutboxStatus.DELIVERED;
      event.processedAt = new Date();
      await em.flush();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as failed
      event.status = OutboxStatus.FAILED;
      event.attempts = event.attempts + 1;
      event.lastError = errorMessage;
      event.processedAt = new Date();
      await em.flush();

      log.error({ eventId: event.id, attempt: event.attempts, error: errorMessage }, 'Event processing failed');
    }
  }

  private calculateBackoff(attempts: number): number {
    // Exponential backoff: 1s, 1min, 5min, 15min, 30min, 1h (capped)
    const backoffs = [1000, 60000, 300000, 900000, 1800000, 3600000];
    return backoffs[Math.min(attempts, backoffs.length - 1)] || 3600000;
  }
}

// Singleton instance
export const outboxProcessor = new OutboxProcessor();
