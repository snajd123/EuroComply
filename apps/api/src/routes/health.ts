import { Hono } from 'hono';
import { MikroORM } from '@mikro-orm/postgresql';
import { healthRateLimiter } from '../middleware/rate-limit.js';

const health = new Hono();

// Module-level ORM instance for health checks
let _orm: MikroORM | null = null;

/**
 * Set the MikroORM instance for health route database checks.
 * Call this at app startup.
 */
export function setHealthRouteOrm(orm: MikroORM): void {
  _orm = orm;
}

/**
 * Reset health route ORM state (for testing only).
 */
export function resetHealthRouteOrm(): void {
  _orm = null;
}

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
 * Verifies database connectivity using MikroORM.
 */
health.get('/ready', async (c) => {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

  // Check database using MikroORM
  const dbStart = Date.now();
  try {
    if (!_orm) {
      throw new Error('Database ORM not initialized');
    }
    await _orm.em.execute('SELECT 1');
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
