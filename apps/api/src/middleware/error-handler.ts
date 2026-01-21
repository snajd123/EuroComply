import { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { UniqueConstraintViolationException, ConstraintViolationException } from '@mikro-orm/postgresql';
import { AppError } from '../lib/errors.js';
import { err } from '@eurocomply/shared';
import { logger } from '../lib/logger.js';

// ============================================
// Type Guards for Error Handling
// ============================================

interface ZodValidationError {
  errors: Array<{ path: (string | number)[]; message: string }>;
}

/**
 * Type guard for Zod validation errors.
 */
function isZodError(error: unknown): error is ZodValidationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as Error).name === 'ZodError' &&
    'errors' in error &&
    Array.isArray((error as ZodValidationError).errors)
  );
}

/**
 * Global error handler middleware.
 * Converts all errors to consistent API response format.
 */
export const errorHandler: ErrorHandler = (error, c) => {
  // Log error with context
  logger.error({
    method: c.req.method,
    path: c.req.path,
    error: error.message,
    // Only include stack trace in development to prevent information leakage
    ...(process.env['NODE_ENV'] === 'development' && { stack: error.stack }),
  }, 'Request error');

  // Handle our custom errors
  if (error instanceof AppError) {
    return c.json(
      err(error.code, error.message, error.details),
      error.statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500
    );
  }

  // Handle Hono HTTP exceptions
  if (error instanceof HTTPException) {
    return c.json(
      err('HTTP_ERROR', error.message),
      error.status
    );
  }

  // Handle MikroORM errors
  if (error instanceof UniqueConstraintViolationException) {
    return c.json(
      err('DUPLICATE_ENTRY', 'A record with this value already exists'),
      409
    );
  }

  if (error instanceof ConstraintViolationException) {
    return c.json(
      err('CONSTRAINT_VIOLATION', 'Database constraint violated'),
      400
    );
  }

  // Handle validation errors (e.g., from Zod)
  if (isZodError(error)) {
    return c.json(
      err('VALIDATION_ERROR', 'Invalid request data', {
        errors: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      }),
      400
    );
  }

  // Unknown error - don't leak details in production
  const message = process.env['NODE_ENV'] === 'development'
    ? error.message
    : 'An unexpected error occurred';

  return c.json(err('INTERNAL_ERROR', message), 500);
};
