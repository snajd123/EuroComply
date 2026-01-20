/**
 * Centralized logging using Pino.
 *
 * Features:
 * - Structured JSON output in production
 * - Pretty-printed output in development
 * - Child loggers with context
 * - Consistent log levels
 */
import pino from 'pino';

const isDevelopment = process.env['NODE_ENV'] === 'development';
const isTest = process.env['NODE_ENV'] === 'test';

/**
 * Base Pino logger configuration.
 */
export const logger = pino({
  level: process.env['LOG_LEVEL'] || (isDevelopment ? 'debug' : 'info'),
  // Silence logs during tests unless DEBUG is set
  ...(isTest && !process.env['DEBUG'] && { level: 'silent' }),
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'eurocomply-api',
  },
});

/**
 * Create a child logger with additional context.
 *
 * @example
 * const log = createLogger({ module: 'auth' });
 * log.info({ userId }, 'User authenticated');
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Pre-configured loggers for common modules.
 */
export const loggers = {
  auth: createLogger({ module: 'auth' }),
  webhook: createLogger({ module: 'webhook' }),
  security: createLogger({ module: 'security' }),
  redis: createLogger({ module: 'redis' }),
  verification: createLogger({ module: 'verification' }),
  organization: createLogger({ module: 'organization' }),
  outbox: createLogger({ module: 'outbox' }),
};

export default logger;
