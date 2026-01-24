import { processOutbox } from './commands/process-outbox.js';

const command = process.argv[2];

async function main(): Promise<void> {
  switch (command) {
    case 'outbox':
    case undefined:
      await processOutbox({
        batchSize: parseInt(process.env['WORKER_BATCH_SIZE'] ?? '10', 10),
        pollInterval: parseInt(process.env['WORKER_POLL_INTERVAL'] ?? '5000', 10),
        maxRetries: parseInt(process.env['WORKER_MAX_RETRIES'] ?? '5', 10),
        once: process.argv.includes('--once'),
      });
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Usage: npm run dev [outbox] [--once]');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('[Worker] Fatal error:', error);
  process.exit(1);
});
