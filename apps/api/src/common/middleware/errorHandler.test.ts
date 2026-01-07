/**
 * Error Handler Middleware Tests
 * Tests for ApiError class and error handling utilities
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from './errorHandler.js';

// ===========================================
// API ERROR CLASS TESTS
// ===========================================

describe('ApiError', () => {
  describe('Constructor', () => {
    it('should create error with all properties', () => {
      const error = new ApiError(400, 'TEST_ERROR', 'Test message', { field: 'value' });

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test message');
      expect(error.details).toEqual({ field: 'value' });
      expect(error.name).toBe('ApiError');
    });

    it('should create error without details', () => {
      const error = new ApiError(500, 'INTERNAL', 'Something went wrong');

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL');
      expect(error.message).toBe('Something went wrong');
      expect(error.details).toBeUndefined();
    });

    it('should be an instance of Error', () => {
      const error = new ApiError(400, 'TEST', 'Test');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof ApiError).toBe(true);
    });

    it('should have a stack trace', () => {
      const error = new ApiError(400, 'TEST', 'Test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ApiError');
    });
  });

  describe('Factory Methods', () => {
    describe('badRequest', () => {
      it('should create 400 error', () => {
        const error = ApiError.badRequest('Invalid input');

        expect(error.statusCode).toBe(400);
        expect(error.code).toBe('BAD_REQUEST');
        expect(error.message).toBe('Invalid input');
      });

      it('should accept details', () => {
        const error = ApiError.badRequest('Invalid input', {
          field: 'email',
          reason: 'Invalid format'
        });

        expect(error.details).toEqual({
          field: 'email',
          reason: 'Invalid format',
        });
      });
    });

    describe('unauthorized', () => {
      it('should create 401 error with default message', () => {
        const error = ApiError.unauthorized();

        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('UNAUTHORIZED');
        expect(error.message).toBe('Unauthorized');
      });

      it('should create 401 error with custom message', () => {
        const error = ApiError.unauthorized('Invalid API key');

        expect(error.message).toBe('Invalid API key');
      });
    });

    describe('forbidden', () => {
      it('should create 403 error with default message', () => {
        const error = ApiError.forbidden();

        expect(error.statusCode).toBe(403);
        expect(error.code).toBe('FORBIDDEN');
        expect(error.message).toBe('Forbidden');
      });

      it('should create 403 error with custom message', () => {
        const error = ApiError.forbidden('Insufficient permissions');

        expect(error.message).toBe('Insufficient permissions');
      });
    });

    describe('notFound', () => {
      it('should create 404 error with default message', () => {
        const error = ApiError.notFound();

        expect(error.statusCode).toBe(404);
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toBe('Resource not found');
      });

      it('should create 404 error with custom resource', () => {
        const error = ApiError.notFound('Product');

        expect(error.message).toBe('Product not found');
      });

      it('should handle various resource names', () => {
        expect(ApiError.notFound('User').message).toBe('User not found');
        expect(ApiError.notFound('Passport').message).toBe('Passport not found');
        expect(ApiError.notFound('API Key').message).toBe('API Key not found');
      });
    });

    describe('conflict', () => {
      it('should create 409 error', () => {
        const error = ApiError.conflict('Email already exists');

        expect(error.statusCode).toBe(409);
        expect(error.code).toBe('CONFLICT');
        expect(error.message).toBe('Email already exists');
      });
    });

    describe('tooManyRequests', () => {
      it('should create 429 error with default message', () => {
        const error = ApiError.tooManyRequests();

        expect(error.statusCode).toBe(429);
        expect(error.code).toBe('TOO_MANY_REQUESTS');
        expect(error.message).toBe('Too many requests');
      });

      it('should create 429 error with custom message', () => {
        const error = ApiError.tooManyRequests('Rate limit exceeded. Try again in 60 seconds.');

        expect(error.message).toBe('Rate limit exceeded. Try again in 60 seconds.');
      });
    });

    describe('internal', () => {
      it('should create 500 error with default message', () => {
        const error = ApiError.internal();

        expect(error.statusCode).toBe(500);
        expect(error.code).toBe('INTERNAL_ERROR');
        expect(error.message).toBe('Internal server error');
      });

      it('should create 500 error with custom message', () => {
        const error = ApiError.internal('Database connection failed');

        expect(error.message).toBe('Database connection failed');
      });
    });
  });

  describe('Error Properties', () => {
    it('should have correct HTTP status codes', () => {
      expect(ApiError.badRequest('').statusCode).toBe(400);
      expect(ApiError.unauthorized().statusCode).toBe(401);
      expect(ApiError.forbidden().statusCode).toBe(403);
      expect(ApiError.notFound().statusCode).toBe(404);
      expect(ApiError.conflict('').statusCode).toBe(409);
      expect(ApiError.tooManyRequests().statusCode).toBe(429);
      expect(ApiError.internal().statusCode).toBe(500);
    });

    it('should have unique error codes', () => {
      const codes = [
        ApiError.badRequest('').code,
        ApiError.unauthorized().code,
        ApiError.forbidden().code,
        ApiError.notFound().code,
        ApiError.conflict('').code,
        ApiError.tooManyRequests().code,
        ApiError.internal().code,
      ];

      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  describe('Serialization', () => {
    it('should be JSON serializable', () => {
      const error = ApiError.badRequest('Test error', { field: 'test' });

      const json = JSON.stringify({
        code: error.code,
        message: error.message,
        details: error.details,
      });

      const parsed = JSON.parse(json);
      expect(parsed.code).toBe('BAD_REQUEST');
      expect(parsed.message).toBe('Test error');
      expect(parsed.details).toEqual({ field: 'test' });
    });
  });

  describe('Type Checking', () => {
    it('should be throwable', () => {
      expect(() => {
        throw ApiError.badRequest('Test');
      }).toThrow(ApiError);
    });

    it('should be catchable as Error', () => {
      try {
        throw ApiError.unauthorized();
      } catch (e) {
        expect(e instanceof Error).toBe(true);
        expect((e as ApiError).statusCode).toBe(401);
      }
    });
  });
});

// ===========================================
// ERROR CODES COVERAGE
// ===========================================

describe('Error Code Standards', () => {
  it('should use SCREAMING_SNAKE_CASE for error codes', () => {
    const errors = [
      ApiError.badRequest(''),
      ApiError.unauthorized(),
      ApiError.forbidden(),
      ApiError.notFound(),
      ApiError.conflict(''),
      ApiError.tooManyRequests(),
      ApiError.internal(),
    ];

    const pattern = /^[A-Z][A-Z0-9_]*$/;

    errors.forEach(error => {
      expect(error.code).toMatch(pattern);
    });
  });

  it('should have meaningful error codes', () => {
    const error = ApiError.badRequest('Invalid email format');
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.code).not.toBe('ERROR');
    expect(error.code).not.toBe('400');
  });
});
