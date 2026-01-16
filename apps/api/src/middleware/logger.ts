import { createMiddleware } from 'hono/factory';

interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  organizationId?: string;
  userId?: string;
  userAgent?: string;
  ip?: string;
  error?: string;
}

/**
 * Request logging middleware.
 * Logs all requests with timing, user context, and response status.
 */
export const loggerMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  // Add request ID to response headers
  c.header('X-Request-ID', requestId);

  let error: string | undefined;

  try {
    await next();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const duration = Date.now() - start;

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
      userAgent: c.req.header('User-Agent'),
      ip: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
    };

    // Add user context if available
    try {
      const user = c.get('user' as never);
      const tenant = c.get('tenant' as never);
      if (user) logEntry.userId = (user as { id: string }).id;
      if (tenant) logEntry.organizationId = (tenant as { organizationId: string }).organizationId;
    } catch {
      // Context not available, skip
    }

    if (error) {
      logEntry.error = error;
    }

    // Log format: JSON for structured logging
    const logLevel = c.res.status >= 500 ? 'error' : c.res.status >= 400 ? 'warn' : 'info';
    const logFn = logLevel === 'error' ? console.error : logLevel === 'warn' ? console.warn : console.log;

    logFn(JSON.stringify(logEntry));
  }
});

/**
 * Development-friendly request logger.
 * Uses colored, human-readable output.
 */
export const devLoggerMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  // Color codes
  const statusColor = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
  const reset = '\x1b[0m';
  const dim = '\x1b[2m';

  console.log(
    `${dim}${new Date().toISOString()}${reset} ${c.req.method.padEnd(7)} ${c.req.path} ${statusColor}${status}${reset} ${dim}${duration}ms${reset}`
  );
});
