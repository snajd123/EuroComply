import { createMiddleware } from 'hono/factory';
import { timingSafeEqual } from 'crypto';
import { error } from '../utils/response.js';

/**
 * Admin authentication middleware.
 * Validates the X-Admin-Key header against ADMIN_API_KEY environment variable.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function adminAuthMiddleware(apiKey?: string) {
  const key = apiKey ?? process.env['ADMIN_API_KEY'];

  return createMiddleware(async (c, next) => {
    // Check if API key is configured
    if (!key) {
      console.error('ADMIN_API_KEY not configured');
      return error(c, 'CONFIG_ERROR', 'Admin API not configured', 500);
    }

    // Get the key from header
    const providedKey = c.req.header('X-Admin-Key');

    if (!providedKey) {
      return error(c, 'UNAUTHORIZED', 'Missing X-Admin-Key header', 401);
    }

    // Timing-safe comparison to prevent timing attacks
    const keyBuffer = Buffer.from(key);
    const providedBuffer = Buffer.from(providedKey);

    // Keys must be same length for timingSafeEqual
    if (keyBuffer.length !== providedBuffer.length) {
      return error(c, 'UNAUTHORIZED', 'Invalid API key', 401);
    }

    if (!timingSafeEqual(keyBuffer, providedBuffer)) {
      return error(c, 'UNAUTHORIZED', 'Invalid API key', 401);
    }

    // Key is valid, proceed
    await next();
  });
}

/**
 * Generates a secure random API key.
 * Use this to generate a new ADMIN_API_KEY.
 *
 * Run: npx tsx -e "import { generateAdminApiKey } from './src/middleware/admin-auth.js'; console.log(generateAdminApiKey())"
 */
export function generateAdminApiKey(): string {
  const { randomBytes } = require('crypto');
  return randomBytes(32).toString('base64url');
}
