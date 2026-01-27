/**
 * Standardized API Response Utilities
 *
 * Provides consistent response format across all API endpoints:
 * - Success responses: { success: true, data: T, meta: { requestId, timestamp, total? } }
 * - Error responses: { success: false, error: { code, message, details? }, meta: { requestId, timestamp } }
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { createId } from '@eurocomply/core';

/**
 * Standard success response format
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
    total?: number;
  };
}

/**
 * Standard error response format
 */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}

/**
 * Options for success responses
 */
export interface SuccessOptions {
  /** Total count for paginated results */
  total?: number;
  /** HTTP status code (default: 200) */
  status?: number;
}

/**
 * Gets or generates a request ID from context
 */
function getRequestId(c: Context): string {
  const existingId = c.get('requestId') as string | undefined;
  if (existingId) {
    return existingId;
  }
  return `req_${createId()}`;
}

/**
 * Creates a standardized success response
 *
 * @param c - Hono context
 * @param data - Response data payload
 * @param opts - Optional configuration (total, status)
 * @returns JSON response with standard format
 */
export function success<T>(c: Context, data: T, opts?: SuccessOptions): Response {
  const requestId = getRequestId(c);
  const timestamp = new Date().toISOString();

  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      requestId,
      timestamp,
      ...(opts?.total !== undefined && { total: opts.total }),
    },
  };

  c.header('X-Request-Id', requestId);
  return c.json(response, (opts?.status ?? 200) as ContentfulStatusCode);
}

/**
 * Creates a standardized error response
 *
 * @param c - Hono context
 * @param code - Error code (e.g., 'NOT_FOUND', 'VALIDATION_ERROR')
 * @param message - Human-readable error message
 * @param status - HTTP status code
 * @param details - Optional additional error details
 * @returns JSON response with standard error format
 */
export function error(
  c: Context,
  code: string,
  message: string,
  status: number,
  details?: unknown
): Response {
  const requestId = getRequestId(c);
  const timestamp = new Date().toISOString();

  const response: ApiError = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
    meta: {
      requestId,
      timestamp,
    },
  };

  c.header('X-Request-Id', requestId);
  return c.json(response, status as ContentfulStatusCode);
}
