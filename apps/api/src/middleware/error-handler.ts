import { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AppError } from '../lib/errors.js';
import { err } from '@eurocomply/shared';

/**
 * Global error handler middleware.
 * Converts all errors to consistent API response format.
 */
export const errorHandler: ErrorHandler = (error, c) => {
  // Sanitize log output - only include stack traces in development
  const logData: Record<string, unknown> = {
    method: c.req.method,
    path: c.req.path,
    error: error.message,
  };

  // Only include stack trace in development to prevent information leakage
  if (process.env['NODE_ENV'] === 'development') {
    logData['stack'] = error.stack;
  }

  console.error('Request error:', logData);

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
  if (error.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as unknown as { code: string; meta?: { target?: string[] } };

    if (prismaError.code === 'P2002') {
      // Unique constraint violation
      const fields = prismaError.meta?.target?.join(', ') || 'field';
      return c.json(
        err('DUPLICATE_ENTRY', `A record with this ${fields} already exists`),
        409
      );
    }

    if (prismaError.code === 'P2025') {
      // Record not found
      return c.json(
        err('NOT_FOUND', 'Record not found'),
        404
      );
    }
  }

  // Handle validation errors (e.g., from Zod)
  if (error.name === 'ZodError') {
    const zodError = error as unknown as { errors: Array<{ path: string[]; message: string }> };
    return c.json(
      err('VALIDATION_ERROR', 'Invalid request data', {
        errors: zodError.errors.map((e) => ({
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
