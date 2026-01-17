import { Hono } from 'hono';
import { prisma } from '@eurocomply/db';

const health = new Hono();

/**
 * Basic health check endpoint.
 * Returns 200 if the service is running.
 */
health.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env['npm_package_version'] || '0.0.1',
    build: 'infra-test-001',
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
    checks['database'] = {
      status: 'error',
      latency: Date.now() - dbStart,
      error: error instanceof Error ? error.message : 'Unknown error',
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
