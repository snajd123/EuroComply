/**
 * Redis Client Utility
 *
 * Provides a Redis client for distributed caching and rate limiting.
 * Falls back to null in development if Redis is not available.
 */
import { createClient, type RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;
let connectionPromise: Promise<RedisClientType | null> | null = null;

/**
 * Get the Redis client instance.
 * Returns null if Redis is not configured or connection fails.
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  // Return cached client if already connected
  if (redisClient?.isOpen) {
    return redisClient;
  }

  // Return pending connection if in progress
  if (connectionPromise) {
    return connectionPromise;
  }

  // Check for Redis configuration
  const redisHost = process.env['REDIS_HOST'];
  const redisPort = process.env['REDIS_PORT'] || '6379';
  const redisTls = process.env['REDIS_TLS'] === 'true';
  const redisAuthToken = process.env['REDIS_AUTH_TOKEN'];

  if (!redisHost) {
    // Redis not configured - fall back to in-memory
    if (process.env['NODE_ENV'] !== 'test') {
      console.warn('[Redis] REDIS_HOST not configured, using in-memory fallback');
    }
    return null;
  }

  // Create connection promise to avoid multiple connections
  connectionPromise = (async () => {
    try {
      const url = redisTls
        ? `rediss://${redisHost}:${redisPort}`
        : `redis://${redisHost}:${redisPort}`;

      redisClient = createClient({
        url,
        password: redisAuthToken,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries: number) => {
            if (retries > 3) {
              console.error('[Redis] Max reconnection attempts reached');
              return false;
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      redisClient.on('error', (err: Error) => {
        console.error('[Redis] Client error:', err.message);
      });

      redisClient.on('connect', () => {
        console.log('[Redis] Connected successfully');
      });

      await redisClient.connect();
      return redisClient;
    } catch (error) {
      console.error('[Redis] Connection failed:', error instanceof Error ? error.message : error);
      redisClient = null;
      return null;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

/**
 * Close the Redis connection (for graceful shutdown).
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient?.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Redis-based sliding window rate limiter.
 * Uses MULTI/EXEC for atomic operations.
 *
 * @param key - The rate limit key (e.g., "ratelimit:ip:192.168.1.1")
 * @param limit - Maximum requests allowed in the window
 * @param windowMs - Window size in milliseconds
 * @returns Object with count, remaining, and resetTime
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ count: number; remaining: number; resetTime: number; exceeded: boolean } | null> {
  const client = await getRedisClient();
  if (!client) {
    return null; // Fall back to in-memory
  }

  const now = Date.now();
  const windowStart = now - windowMs;
  const windowKey = `ratelimit:${key}`;

  try {
    // Use sorted set for sliding window
    // Score = timestamp, Member = unique request ID
    const requestId = `${now}:${Math.random().toString(36).substring(2, 9)}`;

    // Atomic operations using MULTI
    const multi = client.multi();

    // Remove expired entries
    multi.zRemRangeByScore(windowKey, 0, windowStart);

    // Add current request
    multi.zAdd(windowKey, { score: now, value: requestId });

    // Count requests in window
    multi.zCard(windowKey);

    // Set expiry on the key
    multi.pExpire(windowKey, windowMs);

    const results = await multi.exec();

    // Count is the third result (index 2) - zCard returns the count
    const count = (results?.[2] as unknown as number) || 0;
    const remaining = Math.max(0, limit - count);
    const resetTime = now + windowMs;
    const exceeded = count > limit;

    return { count, remaining, resetTime, exceeded };
  } catch (error) {
    console.error('[Redis] Rate limit check failed:', error instanceof Error ? error.message : error);
    return null; // Fall back to in-memory
  }
}
