import { initOrm, closeOrm } from '@eurocomply/database';
import { OutboxProcessorService } from '@eurocomply/database';

export interface ProcessOutboxOptions {
  batchSize: number;
  pollInterval: number; // ms
  maxRetries: number;
  once: boolean; // Run once and exit vs continuous polling
}

const defaultOptions: ProcessOutboxOptions = {
  batchSize: 10,
  pollInterval: 5000,
  maxRetries: 5,
  once: false,
};

export async function processOutbox(options: Partial<ProcessOutboxOptions> = {}): Promise<void> {
  const opts = { ...defaultOptions, ...options };
  console.log('[Worker] Starting outbox processor with options:', opts);

  const orm = await initOrm();
  const processor = new OutboxProcessorService(orm);

  let running = true;

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('[Worker] Shutting down...');
    running = false;
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    while (running) {
      const results = await processor.processAllSchemas(opts.batchSize, opts.maxRetries);

      if (results.totalProcessed > 0 || results.totalFailed > 0) {
        console.log(
          `[Worker] Processed: ${results.totalProcessed}, Failed: ${results.totalFailed}`
        );
      }

      if (opts.once) {
        break;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, opts.pollInterval));
    }
  } finally {
    await closeOrm();
    console.log('[Worker] Shutdown complete');
  }
}
