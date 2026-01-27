/**
 * Request ID Middleware Tests
 *
 * Tests for the middleware that generates unique request IDs.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requestIdMiddleware } from './request-id.js';

describe('Request ID Middleware', () => {
  it('generates a request ID and stores in context', async () => {
    const app = new Hono();
    let capturedRequestId: string | undefined;

    app.use('*', requestIdMiddleware());
    app.get('/test', (c) => {
      capturedRequestId = c.get('requestId') as string;
      return c.json({ ok: true });
    });

    await app.request('/test');

    expect(capturedRequestId).toBeDefined();
    expect(capturedRequestId).toMatch(/^req_/);
  });

  it('generates unique IDs for each request', async () => {
    const app = new Hono();
    const requestIds: string[] = [];

    app.use('*', requestIdMiddleware());
    app.get('/test', (c) => {
      requestIds.push(c.get('requestId') as string);
      return c.json({ ok: true });
    });

    await app.request('/test');
    await app.request('/test');
    await app.request('/test');

    expect(new Set(requestIds).size).toBe(3);
  });

  it('adds X-Request-Id response header', async () => {
    const app = new Hono();

    app.use('*', requestIdMiddleware());
    app.get('/test', (c) => {
      return c.json({ ok: true });
    });

    const res = await app.request('/test');

    expect(res.headers.get('X-Request-Id')).toMatch(/^req_/);
  });

  it('uses existing X-Request-Id from incoming request if provided', async () => {
    const app = new Hono();
    let capturedRequestId: string | undefined;

    app.use('*', requestIdMiddleware());
    app.get('/test', (c) => {
      capturedRequestId = c.get('requestId') as string;
      return c.json({ ok: true });
    });

    const res = await app.request('/test', {
      headers: { 'X-Request-Id': 'req_client_provided_123' },
    });

    expect(capturedRequestId).toBe('req_client_provided_123');
    expect(res.headers.get('X-Request-Id')).toBe('req_client_provided_123');
  });

  it('ignores invalid X-Request-Id format and generates new one', async () => {
    const app = new Hono();
    let capturedRequestId: string | undefined;

    app.use('*', requestIdMiddleware());
    app.get('/test', (c) => {
      capturedRequestId = c.get('requestId') as string;
      return c.json({ ok: true });
    });

    // Send invalid request ID (doesn't start with req_)
    await app.request('/test', {
      headers: { 'X-Request-Id': 'invalid_format' },
    });

    expect(capturedRequestId).toMatch(/^req_/);
    expect(capturedRequestId).not.toBe('invalid_format');
  });
});
