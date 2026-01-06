import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { ZodError } from 'zod';

// Custom error class for API errors
export class ApiError extends Error {
  public statusCode: number;
  public code: string;
  public details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }

  // Common error factories
  static badRequest(message: string, details?: Record<string, unknown>) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(resource = 'Resource') {
    return new ApiError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string) {
    return new ApiError(409, 'CONFLICT', message);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new ApiError(429, 'TOO_MANY_REQUESTS', message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}

// Global error handler middleware
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          errors: err.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Handle custom API errors
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Handle unknown errors
  const statusCode = 500;
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

  res.status(statusCode).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
    meta: {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
}
