/**
 * Response Utility Tests
 *
 * Tests for standardized API response helpers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { success, error, type ApiResponse, type ApiError } from './response.js';

describe('Response Utilities', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    // Mock Date.now for consistent timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-27T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('success()', () => {
    it('returns success response with data and meta', async () => {
      app.get('/test', (c) => {
        // Set requestId in context (normally set by middleware)
        c.set('requestId', 'req_abc123');
        return success(c, { id: '1', name: 'Test' });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(200);

      const body = (await res.json()) as ApiResponse<{ id: string; name: string }>;
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: '1', name: 'Test' });
      expect(body.meta.requestId).toBe('req_abc123');
      expect(body.meta.timestamp).toBe('2026-01-27T12:00:00.000Z');
    });

    it('includes total in meta when provided', async () => {
      app.get('/test', (c) => {
        c.set('requestId', 'req_abc123');
        return success(c, [{ id: '1' }, { id: '2' }], { total: 100 });
      });

      const res = await app.request('/test');
      const body = (await res.json()) as ApiResponse<{ id: string }[]>;

      expect(body.meta.total).toBe(100);
    });

    it('uses custom status code when provided', async () => {
      app.post('/test', (c) => {
        c.set('requestId', 'req_abc123');
        return success(c, { id: '1' }, { status: 201 });
      });

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(201);
    });

    it('generates requestId if not set in context', async () => {
      app.get('/test', (c) => {
        // Don't set requestId - should generate one
        return success(c, { value: 'test' });
      });

      const res = await app.request('/test');
      const body = (await res.json()) as ApiResponse<{ value: string }>;

      expect(body.meta.requestId).toMatch(/^req_/);
    });

    it('sets X-Request-Id header', async () => {
      app.get('/test', (c) => {
        c.set('requestId', 'req_header123');
        return success(c, { value: 'test' });
      });

      const res = await app.request('/test');
      expect(res.headers.get('X-Request-Id')).toBe('req_header123');
    });
  });

  describe('error()', () => {
    it('returns error response with code, message, and meta', async () => {
      app.get('/test', (c) => {
        c.set('requestId', 'req_error123');
        return error(c, 'NOT_FOUND', 'Resource not found', 404);
      });

      const res = await app.request('/test');
      expect(res.status).toBe(404);

      const body = (await res.json()) as ApiError;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Resource not found');
      expect(body.meta.requestId).toBe('req_error123');
      expect(body.meta.timestamp).toBe('2026-01-27T12:00:00.000Z');
    });

    it('includes details when provided', async () => {
      app.get('/test', (c) => {
        c.set('requestId', 'req_error123');
        return error(c, 'VALIDATION_ERROR', 'Invalid input', 400, {
          field: 'email',
          reason: 'Invalid format',
        });
      });

      const res = await app.request('/test');
      const body = (await res.json()) as ApiError;

      expect(body.error.details).toEqual({
        field: 'email',
        reason: 'Invalid format',
      });
    });

    it('generates requestId if not set in context', async () => {
      app.get('/test', (c) => {
        return error(c, 'SERVER_ERROR', 'Internal error', 500);
      });

      const res = await app.request('/test');
      const body = (await res.json()) as ApiError;

      expect(body.meta.requestId).toMatch(/^req_/);
    });

    it('sets X-Request-Id header', async () => {
      app.get('/test', (c) => {
        c.set('requestId', 'req_error_header');
        return error(c, 'BAD_REQUEST', 'Bad request', 400);
      });

      const res = await app.request('/test');
      expect(res.headers.get('X-Request-Id')).toBe('req_error_header');
    });
  });
});
