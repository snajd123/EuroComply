/**
 * Rate Limiting Middleware
 *
 * Implements a simple in-memory sliding window rate limiter.
 * For production at scale, consider using Redis-based rate limiting.
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import { RateLimitError } from '../lib/errors.js';

interface RateLimitOptions {
  /** Maximum requests per window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Custom key extractor (defaults to IP address) */
  keyExtractor?: (c: Context) => string;
  /** Whether to skip rate limiting based on request */
  skip?: (c: Context) => boolean;
  /** Custom message for rate limit exceeded */
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limit tracking
// For production, use Redis or similar distributed cache
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically (every minute)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

/**
 * Extract client IP from request headers or connection.
 */
function getClientIp(c: Context): string {
  // Check common proxy headers first
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    // Get first IP in chain (client IP)
    const firstIp = forwardedFor.split(',')[0];
    return firstIp ? firstIp.trim() : 'unknown';
  }

  const realIp = c.req.header('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to connection info (may not be available in all environments)
  return 'unknown';
}

/**
 * Creates a rate limiting middleware with the specified options.
 */
export function rateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const {
    limit,
    windowMs,
    keyExtractor = getClientIp,
    skip,
    message = 'Too many requests, please try again later',
  } = options;

  return async (c: Context, next: Next) => {
    // Check if rate limiting should be skipped
    if (skip?.(c)) {
      return next();
    }

    const key = keyExtractor(c);
    const now = Date.now();
    const windowEnd = now + windowMs;

    // Get or create entry
    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      // Create new entry or reset expired one
      entry = { count: 1, resetTime: windowEnd };
      rateLimitStore.set(key, entry);
    } else {
      // Increment count
      entry.count++;
    }

    // Set rate limit headers
    const remaining = Math.max(0, limit - entry.count);
    const reset = Math.ceil(entry.resetTime / 1000);

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(reset));

    // Check if rate limit exceeded
    if (entry.count > limit) {
      const retryAfterSeconds = Math.ceil((entry.resetTime - now) / 1000);
      c.header('Retry-After', String(retryAfterSeconds));
      throw new RateLimitError(retryAfterSeconds);
    }

    return next();
  };
}

/**
 * Rate limiter preset for public verification endpoints.
 * Allows 100 requests per minute per IP.
 */
export const verificationRateLimiter = rateLimiter({
  limit: 100,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many verification requests. Please try again later.',
});

/**
 * Rate limiter preset for status list endpoints.
 * Allows 300 requests per minute per IP (higher as it's cacheable).
 */
export const statusListRateLimiter = rateLimiter({
  limit: 300,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many status list requests. Please try again later.',
});

/**
 * Strict rate limiter for sensitive operations.
 * Allows 10 requests per minute per IP.
 */
export const strictRateLimiter = rateLimiter({
  limit: 10,
  windowMs: 60 * 1000, // 1 minute
  message: 'Rate limit exceeded for this operation. Please try again later.',
});
