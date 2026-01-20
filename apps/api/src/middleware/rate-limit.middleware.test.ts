import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock redis before importing rate-limit
vi.mock('../lib/redis.js', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('../lib/trusted-proxy.js', () => ({
  getClientIp: vi.fn(() => '192.168.1.1'),
}));

import { checkRateLimit } from '../lib/redis.js';
import { getClientIp } from '../lib/trusted-proxy.js';
import { rateLimiter, clearRateLimitCleanup } from './rate-limit.js';

const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;
const mockGetClientIp = getClientIp as ReturnType<typeof vi.fn>;

// Counter to generate unique IPs for each test to avoid state sharing
let ipCounter = 0;

describe('rate-limit middleware', () => {
  let app: Hono;
  let testIp: string;

  beforeEach(() => {
    vi.clearAllMocks();
    // Use unique IP for each test to avoid shared state issues
    ipCounter++;
    testIp = `192.168.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`;
    mockGetClientIp.mockReturnValue(testIp);
  });

  afterEach(() => {
    clearRateLimitCleanup();
  });

  describe('rateLimiter factory', () => {
    it('should create middleware with specified options', async () => {
      mockCheckRateLimit.mockResolvedValue({
        count: 1,
        remaining: 99,
        resetTime: Date.now() + 60000,
        exceeded: false,
      });

      app = new Hono();
      app.use('/api/*', rateLimiter({ limit: 100, windowMs: 60000 }));
      app.get('/api/test', (c) => c.json({ success: true }));

      const res = await app.request('/api/test');

      expect(res.status).toBe(200);
      // Check it was called with correct limit and window, ignoring the IP (which is unique per test)
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        100,
        60000
      );
    });
  });

  describe('Redis-based rate limiting', () => {
    beforeEach(() => {
      app = new Hono();
      app.use('/api/*', rateLimiter({ limit: 10, windowMs: 60000 }));
      app.get('/api/test', (c) => c.json({ success: true }));

      // Add error handler to properly return 429
      app.onError((err, c) => {
        if ('statusCode' in err && typeof err.statusCode === 'number') {
          return c.json({ error: err.message }, err.statusCode as 429);
        }
        return c.json({ error: 'Internal Server Error' }, 500);
      });
    });

    it('should allow request when under limit', async () => {
      mockCheckRateLimit.mockResolvedValue({
        count: 5,
        remaining: 5,
        resetTime: Date.now() + 60000,
        exceeded: false,
      });

      const res = await app.request('/api/test');

      expect(res.status).toBe(200);
    });

    it('should set rate limit headers', async () => {
      const resetTime = Date.now() + 60000;
      mockCheckRateLimit.mockResolvedValue({
        count: 3,
        remaining: 7,
        resetTime,
        exceeded: false,
      });

      const res = await app.request('/api/test');

      expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('7');
      expect(res.headers.get('X-RateLimit-Reset')).toBe(
        String(Math.ceil(resetTime / 1000))
      );
    });

    it('should return 429 when rate limit exceeded', async () => {
      const now = Date.now();
      const resetTime = now + 30000;
      mockCheckRateLimit.mockResolvedValue({
        count: 11,
        remaining: 0,
        resetTime,
        exceeded: true,
      });

      const res = await app.request('/api/test');

      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBeTruthy();
    });

    it('should include Retry-After header when exceeded', async () => {
      const now = Date.now();
      const resetTime = now + 45000; // 45 seconds from now
      mockCheckRateLimit.mockResolvedValue({
        count: 15,
        remaining: 0,
        resetTime,
        exceeded: true,
      });

      const res = await app.request('/api/test');

      const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10);
      // Should be approximately 45 seconds
      expect(retryAfter).toBeGreaterThan(40);
      expect(retryAfter).toBeLessThanOrEqual(45);
    });
  });

  describe('in-memory fallback', () => {
    beforeEach(() => {
      // Return null to simulate Redis unavailable
      mockCheckRateLimit.mockResolvedValue(null);

      app = new Hono();
      app.use('/api/*', rateLimiter({ limit: 3, windowMs: 60000 }));
      app.get('/api/test', (c) => c.json({ success: true }));

      // Add error handler to properly return 429
      app.onError((err, c) => {
        if ('statusCode' in err && typeof err.statusCode === 'number') {
          return c.json({ error: err.message }, err.statusCode as 429);
        }
        return c.json({ error: 'Internal Server Error' }, 500);
      });
    });

    it('should fall back to in-memory when Redis unavailable', async () => {
      const res = await app.request('/api/test');

      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
    });

    it('should track requests in-memory', async () => {
      // First request
      let res = await app.request('/api/test');
      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('2');

      // Second request
      res = await app.request('/api/test');
      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('1');

      // Third request
      res = await app.request('/api/test');
      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');

      // Fourth request - should be rate limited
      res = await app.request('/api/test');
      expect(res.status).toBe(429);
    });

    it('should track different IPs separately', async () => {
      // Use unique IPs for this test
      const ip1 = `10.0.${ipCounter}.1`;
      const ip2 = `10.0.${ipCounter}.2`;

      // First IP - first request
      mockGetClientIp.mockReturnValue(ip1);
      let res = await app.request('/api/test');
      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('2');

      // Different IP should have fresh limit
      mockGetClientIp.mockReturnValue(ip2);
      res = await app.request('/api/test');
      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('2');
    });
  });

  describe('skip option', () => {
    it('should skip rate limiting when skip returns true', async () => {
      mockCheckRateLimit.mockResolvedValue({
        count: 100,
        remaining: 0,
        resetTime: Date.now(),
        exceeded: true,
      });

      app = new Hono();
      app.use(
        '/api/*',
        rateLimiter({
          limit: 10,
          windowMs: 60000,
          skip: (c) => c.req.header('X-Skip-RateLimit') === 'true',
        })
      );
      app.get('/api/test', (c) => c.json({ success: true }));

      // Add error handler to properly return 429
      app.onError((err, c) => {
        if ('statusCode' in err && typeof err.statusCode === 'number') {
          return c.json({ error: err.message }, err.statusCode as 429);
        }
        return c.json({ error: 'Internal Server Error' }, 500);
      });

      // Without skip header - should be rate limited
      let res = await app.request('/api/test');
      expect(res.status).toBe(429);

      // With skip header - should bypass
      res = await app.request('/api/test', {
        headers: { 'X-Skip-RateLimit': 'true' },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('custom key extractor', () => {
    it('should use custom key extractor', async () => {
      mockCheckRateLimit.mockResolvedValue({
        count: 1,
        remaining: 9,
        resetTime: Date.now() + 60000,
        exceeded: false,
      });

      app = new Hono();
      app.use(
        '/api/*',
        rateLimiter({
          limit: 10,
          windowMs: 60000,
          keyExtractor: (c) => c.req.header('X-API-Key') || 'anonymous',
        })
      );
      app.get('/api/test', (c) => c.json({ success: true }));

      await app.request('/api/test', {
        headers: { 'X-API-Key': 'key123' },
      });

      expect(mockCheckRateLimit).toHaveBeenCalledWith('key123', 10, 60000);
    });
  });

  describe('presets', () => {
    it('should export verificationRateLimiter preset', async () => {
      const { verificationRateLimiter } = await import('./rate-limit.js');
      expect(verificationRateLimiter).toBeDefined();
    });

    it('should export statusListRateLimiter preset', async () => {
      const { statusListRateLimiter } = await import('./rate-limit.js');
      expect(statusListRateLimiter).toBeDefined();
    });

    it('should export strictRateLimiter preset', async () => {
      const { strictRateLimiter } = await import('./rate-limit.js');
      expect(strictRateLimiter).toBeDefined();
    });

    it('should export healthRateLimiter preset', async () => {
      const { healthRateLimiter } = await import('./rate-limit.js');
      expect(healthRateLimiter).toBeDefined();
    });

    it('should export authenticatedRateLimiter preset', async () => {
      const { authenticatedRateLimiter } = await import('./rate-limit.js');
      expect(authenticatedRateLimiter).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should return proper error body on rate limit', async () => {
      mockCheckRateLimit.mockResolvedValue({
        count: 100,
        remaining: 0,
        resetTime: Date.now() + 60000,
        exceeded: true,
      });

      app = new Hono();
      app.use('/api/*', rateLimiter({ limit: 10, windowMs: 60000 }));
      app.get('/api/test', (c) => c.json({ success: true }));

      // Add error handler to return JSON
      app.onError((err, c) => {
        if ('statusCode' in err && err.statusCode === 429) {
          return c.json({ error: 'Too many requests' }, 429);
        }
        throw err;
      });

      const res = await app.request('/api/test');

      expect(res.status).toBe(429);
    });
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent requests', async () => {
      let callCount = 0;
      mockCheckRateLimit.mockImplementation(async () => {
        callCount++;
        return {
          count: callCount,
          remaining: Math.max(0, 10 - callCount),
          resetTime: Date.now() + 60000,
          exceeded: callCount > 10,
        };
      });

      app = new Hono();
      app.use('/api/*', rateLimiter({ limit: 10, windowMs: 60000 }));
      app.get('/api/test', (c) => c.json({ success: true }));

      // Send 5 concurrent requests
      const requests = Array(5)
        .fill(null)
        .map(() => app.request('/api/test'));

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach((res) => {
        expect(res.status).toBe(200);
      });
    });
  });

  describe('window reset', () => {
    it('should reset count after window expires (in-memory)', async () => {
      vi.useFakeTimers();
      mockCheckRateLimit.mockResolvedValue(null); // Use in-memory

      // Use unique IP for this test
      const uniqueIp = `172.16.${ipCounter}.1`;
      mockGetClientIp.mockReturnValue(uniqueIp);

      app = new Hono();
      app.use('/api/*', rateLimiter({ limit: 2, windowMs: 1000 })); // 1 second window
      app.get('/api/test', (c) => c.json({ success: true }));

      // Add error handler to properly return 429
      app.onError((err, c) => {
        if ('statusCode' in err && typeof err.statusCode === 'number') {
          return c.json({ error: err.message }, err.statusCode as 429);
        }
        return c.json({ error: 'Internal Server Error' }, 500);
      });

      // Use up the limit
      await app.request('/api/test');
      await app.request('/api/test');

      // Should be rate limited
      let res = await app.request('/api/test');
      expect(res.status).toBe(429);

      // Advance time past window
      vi.advanceTimersByTime(1100);

      // Should be allowed again
      res = await app.request('/api/test');
      expect(res.status).toBe(200);

      vi.useRealTimers();
    });
  });
});
