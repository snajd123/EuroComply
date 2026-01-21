import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { UniqueConstraintViolationException, ConstraintViolationException } from '@mikro-orm/postgresql';
import { errorHandler } from './error-handler.js';

describe('error-handler middleware - MikroORM migration', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.onError(errorHandler);
  });

  describe('MikroORM UniqueConstraintViolationException', () => {
    it('should return 409 for UniqueConstraintViolationException', async () => {
      app.get('/test', () => {
        // Simulate MikroORM unique constraint violation
        const error = new UniqueConstraintViolationException(new Error('duplicate key value'));
        throw error;
      });

      const res = await app.request('/test');

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('DUPLICATE_ENTRY');
    });
  });

  describe('MikroORM ConstraintViolationException', () => {
    it('should return 400 for generic ConstraintViolationException', async () => {
      app.get('/test', () => {
        // Simulate MikroORM constraint violation (foreign key, check constraint, etc.)
        const error = new ConstraintViolationException(new Error('constraint violation'));
        throw error;
      });

      const res = await app.request('/test');

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CONSTRAINT_VIOLATION');
    });
  });

  describe('Prisma errors should no longer be handled specially', () => {
    it('should treat Prisma-like errors as unknown errors (500)', async () => {
      app.get('/test', () => {
        // Simulate a Prisma-like error object (should NOT be handled specially anymore)
        const error = new Error('Prisma error') as Error & { code: string };
        error.code = 'P2002';
        // Manually set constructor name to simulate PrismaClientKnownRequestError
        Object.defineProperty(error, 'constructor', {
          value: { name: 'PrismaClientKnownRequestError' },
        });
        throw error;
      });

      const res = await app.request('/test');

      // Should return 500 (not 409) because Prisma handling is removed
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
