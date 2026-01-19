/**
 * Rate Limiting Middleware
 *
 * Implements a distributed sliding window rate limiter using Redis.
 * Falls back to in-memory rate limiting if Redis is unavailable.
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import { RateLimitError } from '../lib/errors.js';
import { checkRateLimit } from '../lib/redis.js';
import { getClientIp } from '../lib/trusted-proxy.js';

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

// Track if we've warned about in-memory fallback (to avoid log spam)
let hasWarnedAboutFallback = false;

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
 * Creates a rate limiting middleware with the specified options.
 * Uses Redis for distributed rate limiting when available, falls back to in-memory.
 */
export function rateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const {
    limit,
    windowMs,
    keyExtractor = getClientIp,
    skip,
  } = options;

  return async (c: Context, next: Next) => {
    // Check if rate limiting should be skipped
    if (skip?.(c)) {
      return next();
    }

    const key = keyExtractor(c);
    const now = Date.now();

    // Try Redis-based rate limiting first
    const redisResult = await checkRateLimit(key, limit, windowMs);

    if (redisResult) {
      // Redis is available - use distributed rate limiting
      c.header('X-RateLimit-Limit', String(limit));
      c.header('X-RateLimit-Remaining', String(redisResult.remaining));
      c.header('X-RateLimit-Reset', String(Math.ceil(redisResult.resetTime / 1000)));

      if (redisResult.exceeded) {
        const retryAfterSeconds = Math.ceil((redisResult.resetTime - now) / 1000);
        c.header('Retry-After', String(retryAfterSeconds));
        throw new RateLimitError(retryAfterSeconds);
      }

      return next();
    }

    // Fallback to in-memory rate limiting
    // Security warning: In multi-instance deployments, in-memory rate limiting
    // can be bypassed by distributing requests across instances
    if (!hasWarnedAboutFallback && process.env['NODE_ENV'] === 'production') {
      console.warn(
        '[RateLimit] WARNING: Redis unavailable, using in-memory fallback. ' +
        'Rate limiting is per-instance only and can be bypassed in multi-instance deployments.'
      );
      hasWarnedAboutFallback = true;
    }

    const windowEnd = now + windowMs;
    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      entry = { count: 1, resetTime: windowEnd };
      rateLimitStore.set(key, entry);
    } else {
      entry.count++;
    }

    const remaining = Math.max(0, limit - entry.count);
    const reset = Math.ceil(entry.resetTime / 1000);

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(reset));

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
