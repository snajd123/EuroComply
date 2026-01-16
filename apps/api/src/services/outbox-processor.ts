import { prisma, type OutboxEvent } from '@eurocomply/db';

export interface EventHandler {
  (event: OutboxEvent): Promise<void>;
}

/**
 * Outbox processor that polls for pending events and delivers them.
 * Uses at-least-once delivery with exponential backoff.
 */
export class OutboxProcessor {
  private handlers: Map<string, EventHandler[]> = new Map();
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;

  private readonly POLL_INTERVAL_MS = 100; // 100ms polling
  private readonly BATCH_SIZE = 100;
  private readonly MAX_ATTEMPTS = 10;
  private readonly BACKOFF_BASE_MS = 1000; // 1 second

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
   */
  start(): void {
    if (this.isRunning) {
      console.warn('Outbox processor already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting outbox processor...');
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
    console.log('Outbox processor stopped');
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.processBatch();
    } catch (error) {
      console.error('Outbox processor error:', error);
    }

    // Schedule next poll
    this.pollInterval = setTimeout(() => this.poll(), this.POLL_INTERVAL_MS);
  }

  private async processBatch(): Promise<void> {
    // Fetch pending events that are ready for retry
    const events = await prisma.outboxEvent.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          {
            status: 'FAILED',
            attempts: { lt: this.MAX_ATTEMPTS },
            // Simple backoff: wait longer after each failure
            processedAt: {
              lt: new Date(Date.now() - this.calculateBackoff(1)), // Will be refined per-event
            },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: this.BATCH_SIZE,
    });

    for (const event of events) {
      // Check backoff for failed events
      if (event.status === 'FAILED' && event.processedAt) {
        const backoffMs = this.calculateBackoff(event.attempts);
        const retryAfter = new Date(event.processedAt.getTime() + backoffMs);
        if (new Date() < retryAfter) {
          continue; // Not ready for retry yet
        }
      }

      await this.processEvent(event);
    }
  }

  private async processEvent(event: OutboxEvent): Promise<void> {
    // Mark as processing
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSING' },
    });

    try {
      // Get handlers for this event type
      const typeHandlers = this.handlers.get(event.eventType) || [];
      const wildcardHandlers = this.handlers.get('*') || [];
      const allHandlers = [...typeHandlers, ...wildcardHandlers];

      if (allHandlers.length === 0) {
        console.warn(`No handlers for event type: ${event.eventType}`);
      }

      // Execute all handlers
      await Promise.all(allHandlers.map((handler) => handler(event)));

      // Mark as delivered
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'DELIVERED',
          processedAt: new Date(),
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as failed
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          attempts: event.attempts + 1,
          lastError: errorMessage,
          processedAt: new Date(),
        },
      });

      console.error(`Event ${event.id} failed (attempt ${event.attempts + 1}):`, errorMessage);
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
