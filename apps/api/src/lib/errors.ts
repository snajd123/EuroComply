/**
 * Base application error class.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Resource not found error.
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      'NOT_FOUND',
      id ? `${resource} with ID '${id}' not found` : `${resource} not found`,
      404
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error for invalid input.
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Conflict error (e.g., duplicate entry).
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
    this.name = 'ConflictError';
  }
}

/**
 * Rate limit exceeded error.
 */
export class RateLimitError extends AppError {
  constructor(retryAfterSeconds?: number) {
    super('RATE_LIMIT_EXCEEDED', 'Too many requests', 429, {
      retryAfter: retryAfterSeconds,
    });
    this.name = 'RateLimitError';
  }
}

/**
 * Subscription/quota limit error.
 */
export class QuotaExceededError extends AppError {
  constructor(resource: string, limit: number) {
    super('QUOTA_EXCEEDED', `${resource} limit (${limit}) exceeded`, 402, {
      resource,
      limit,
    });
    this.name = 'QuotaExceededError';
  }
}
