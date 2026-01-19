import { Hono } from 'hono';
import { prisma } from '@eurocomply/db';
import { healthRateLimiter } from '../middleware/rate-limit.js';

const health = new Hono();

// Rate limit health endpoints to prevent monitoring abuse
health.use('/*', healthRateLimiter);

/**
 * Basic health check endpoint.
 * Returns 200 if the service is running.
 * Security: Minimal info, no version disclosure.
 */
health.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Deep health check endpoint.
 * Verifies database connectivity.
 */
health.get('/ready', async (c) => {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

  // Check database
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks['database'] = { status: 'ok', latency: Date.now() - dbStart };
  } catch (error) {
    // Security: Only expose detailed error messages in development
    // Production errors are logged server-side but not exposed to clients
    const errorMessage = process.env['NODE_ENV'] === 'production'
      ? 'Database connection failed'
      : (error instanceof Error ? error.message : 'Unknown error');
    checks['database'] = {
      status: 'error',
      latency: Date.now() - dbStart,
      error: errorMessage,
    };
  }

  const allHealthy = Object.values(checks).every((check) => check.status === 'ok');

  return c.json(
    {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    allHealthy ? 200 : 503
  );
});

export { health };
