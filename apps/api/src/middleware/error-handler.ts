import { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AppError } from '../lib/errors.js';
import { err } from '@eurocomply/shared';
import { logger } from '../lib/logger.js';

// ============================================
// Type Guards for Error Handling
// ============================================

interface PrismaKnownError {
  code: string;
  meta?: { target?: string[] };
}

interface ZodValidationError {
  errors: Array<{ path: (string | number)[]; message: string }>;
}

/**
 * Type guard for Prisma known request errors.
 */
function isPrismaKnownError(error: unknown): error is PrismaKnownError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as PrismaKnownError).code === 'string' &&
    error.constructor?.name === 'PrismaClientKnownRequestError'
  );
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

  // Handle Prisma errors
  if (isPrismaKnownError(error)) {
    if (error.code === 'P2002') {
      // Unique constraint violation
      const fields = error.meta?.target?.join(', ') || 'field';
      return c.json(
        err('DUPLICATE_ENTRY', `A record with this ${fields} already exists`),
        409
      );
    }

    if (error.code === 'P2025') {
      // Record not found
      return c.json(
        err('NOT_FOUND', 'Record not found'),
        404
      );
    }
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
