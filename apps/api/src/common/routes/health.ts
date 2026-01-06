import { Router } from 'express';
import { prisma } from '@eurocomply/database';

const router = Router();

// Basic health check
router.get('/', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'eurocomply-api',
    timestamp: new Date().toISOString(),
  });
});

// Detailed health check with dependencies
router.get('/ready', async (_req, res) => {
  const checks: Record<string, { status: string; latency?: number }> = {};

  // Check database
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = {
      status: 'healthy',
      latency: Date.now() - dbStart,
    };
  } catch {
    checks.database = { status: 'unhealthy' };
  }

  // TODO: Add Redis check when implemented
  // TODO: Add walt.id check when implemented

  const allHealthy = Object.values(checks).every((c) => c.status === 'healthy');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    service: 'eurocomply-api',
    checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;
