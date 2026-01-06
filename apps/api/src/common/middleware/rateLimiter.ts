import { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler.js';

// Simple in-memory rate limiter (replace with Redis in production)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

/**
 * Get client identifier for rate limiting
 */
function getClientId(req: Request): string {
  // Use API key if present, otherwise use IP
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  if (apiKey) {
    return `key:${apiKey.substring(0, 20)}`;
  }
  return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
}

/**
 * Rate limiting middleware
 */
export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  // Skip rate limiting for health checks
  if (req.path === '/health' || req.path.startsWith('/health/')) {
    next();
    return;
  }

  const clientId = getClientId(req);
  const now = Date.now();

  let clientData = requestCounts.get(clientId);

  // Reset if window has passed
  if (!clientData || now > clientData.resetTime) {
    clientData = {
      count: 0,
      resetTime: now + WINDOW_MS,
    };
  }

  clientData.count++;
  requestCounts.set(clientId, clientData);

  // Set rate limit headers
  const remaining = Math.max(0, MAX_REQUESTS - clientData.count);
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(clientData.resetTime / 1000));

  // Check if rate limit exceeded
  if (clientData.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((clientData.resetTime - now) / 1000);
    res.setHeader('Retry-After', retryAfter);
    throw ApiError.tooManyRequests(
      `Rate limit exceeded. Try again in ${retryAfter} seconds.`
    );
  }

  next();
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCounts.entries()) {
    if (now > value.resetTime) {
      requestCounts.delete(key);
    }
  }
}, 60000); // Clean up every minute
