import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { prisma } from '@eurocomply/database';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import type { AuthContext, ApiKeyScope } from '@eurocomply/shared';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Hash an API key for secure storage/comparison
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Extract API key from Authorization header
 */
function extractApiKey(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  // Support "Bearer <key>" format (like Stripe)
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * Authentication middleware - validates API key
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = extractApiKey(req);

    if (!apiKey) {
      throw ApiError.unauthorized('API key required');
    }

    // Validate key format (ec_live_xxx or ec_test_xxx)
    const keyPrefix = apiKey.substring(0, 12);
    if (!apiKey.startsWith('ec_live_') && !apiKey.startsWith('ec_test_')) {
      throw ApiError.unauthorized('Invalid API key format');
    }

    // Hash the key and look it up
    const keyHash = hashApiKey(apiKey);

    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { organization: true },
    });

    if (!apiKeyRecord) {
      throw ApiError.unauthorized('Invalid API key');
    }

    // Check if key is active
    if (!apiKeyRecord.isActive) {
      throw ApiError.unauthorized('API key is deactivated');
    }

    // Check if key is expired
    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
      throw ApiError.unauthorized('API key has expired');
    }

    // Update last used timestamp (async, don't wait)
    prisma.apiKey
      .update({
        where: { id: apiKeyRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) => logger.error('Failed to update API key lastUsedAt', { err }));

    // Set auth context on request
    req.auth = {
      organizationId: apiKeyRecord.organizationId,
      apiKeyId: apiKeyRecord.id,
      scopes: apiKeyRecord.scopes,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Authorization middleware - checks required scopes
 */
export function requireScopes(...requiredScopes: ApiKeyScope[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw ApiError.unauthorized('Authentication required');
    }

    // Check if user has wildcard scope
    if (req.auth.scopes.includes('*')) {
      next();
      return;
    }

    // Check if user has all required scopes
    const hasAllScopes = requiredScopes.every((scope) =>
      req.auth!.scopes.includes(scope)
    );

    if (!hasAllScopes) {
      throw ApiError.forbidden(
        `Missing required scopes: ${requiredScopes.join(', ')}`
      );
    }

    next();
  };
}

/**
 * Optional authentication - doesn't fail if no key provided
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    next();
    return;
  }

  // If key is provided, validate it
  return authenticate(req, res, next);
}
