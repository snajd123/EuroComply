import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { MikroORM } from '@mikro-orm/postgresql';

// Must mock before importing the module
vi.mock('../middleware/rate-limit.js', () => ({
  healthRateLimiter: vi.fn(async (_c, next) => next()),
}));

// Import after mock is set up (static import)
import { health, setHealthRouteOrm, resetHealthRouteOrm } from './health.js';

describe('health routes', () => {
  let app: Hono;
  let mockOrm: MikroORM;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset ORM state before each test
    resetHealthRouteOrm();

    // Create new Hono app with fresh health routes
    app = new Hono();
    app.route('/health', health);

    // Create mock ORM with em.execute for raw queries
    mockOrm = {
      em: {
        execute: vi.fn(),
        fork: vi.fn().mockReturnThis(),
      },
    } as unknown as MikroORM;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /health', () => {
    it('should return ok status without database check', async () => {
      const res = await app.request('/health');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });

    it('should not require ORM for basic health check', async () => {
      // Don't set ORM - should still work
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /health/ready', () => {
    it('should use MikroORM em.execute for database health check', async () => {
      setHealthRouteOrm(mockOrm);
      (mockOrm.em.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ '?column?': 1 }]);

      const res = await app.request('/health/ready');
      const body = await res.json();

      expect(mockOrm.em.execute).toHaveBeenCalledWith('SELECT 1');
      expect(res.status).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.checks.database.status).toBe('ok');
      expect(body.checks.database.latency).toBeDefined();
    });

    it('should return degraded status when database check fails', async () => {
      setHealthRouteOrm(mockOrm);
      (mockOrm.em.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection refused')
      );

      const res = await app.request('/health/ready');
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.status).toBe('degraded');
      expect(body.checks.database.status).toBe('error');
    });

    it('should return degraded status when ORM not initialized', async () => {
      // Don't call setHealthRouteOrm - ORM should be null

      const res = await app.request('/health/ready');
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.status).toBe('degraded');
      expect(body.checks.database.status).toBe('error');
      expect(body.checks.database.error).toContain('not initialized');
    });

    it('should include latency measurement for database check', async () => {
      setHealthRouteOrm(mockOrm);
      (mockOrm.em.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        // Simulate some latency
        await new Promise((resolve) => setTimeout(resolve, 5));
        return [{ '?column?': 1 }];
      });

      const res = await app.request('/health/ready');
      const body = await res.json();

      expect(body.checks.database.latency).toBeGreaterThanOrEqual(0);
    });

    it('should hide detailed error messages in production', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      setHealthRouteOrm(mockOrm);
      (mockOrm.em.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('FATAL: password authentication failed for user "postgres"')
      );

      const res = await app.request('/health/ready');
      const body = await res.json();

      expect(body.checks.database.error).toBe('Database connection failed');
      expect(body.checks.database.error).not.toContain('password');

      process.env['NODE_ENV'] = originalEnv;
    });

    it('should show detailed error messages in development', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'development';

      setHealthRouteOrm(mockOrm);
      (mockOrm.em.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection refused')
      );

      const res = await app.request('/health/ready');
      const body = await res.json();

      expect(body.checks.database.error).toBe('Connection refused');

      process.env['NODE_ENV'] = originalEnv;
    });
  });
});
