import { Router } from 'express';
import { randomBytes } from 'crypto';
import { prisma } from '@eurocomply/database';
import { hashApiKey, authenticate, requireScopes } from './middleware.js';
import { ApiError } from '../middleware/errorHandler.js';
import { z } from 'zod';

const router = Router();

// ===========================================
// Organization Management
// ===========================================

const CreateOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  domain: z.string().optional(),
});

// Create organization (initial signup - no auth required)
router.post('/organizations', async (req, res, next) => {
  try {
    const data = CreateOrgSchema.parse(req.body);

    // Check if slug already exists
    const existing = await prisma.organization.findUnique({
      where: { slug: data.slug },
    });

    if (existing) {
      throw ApiError.conflict('Organization slug already exists');
    }

    // Create organization with initial API key
    const apiKeyPlain = generateApiKey('live');
    const apiKeyHash = hashApiKey(apiKeyPlain);

    const org = await prisma.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        domain: data.domain,
        did: `did:web:eurocomply.io:m:${data.slug}`,
        apiKeys: {
          create: {
            name: 'Default API Key',
            keyHash: apiKeyHash,
            keyPrefix: apiKeyPlain.substring(0, 12),
            scopes: ['*'],
          },
        },
      },
      include: {
        apiKeys: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            createdAt: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: {
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          did: org.did,
          plan: org.plan,
        },
        apiKey: {
          // Only return full key once on creation
          key: apiKeyPlain,
          prefix: apiKeyPlain.substring(0, 12),
          name: 'Default API Key',
        },
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get current organization
router.get('/organizations/me', authenticate, async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.auth!.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        did: true,
        plan: true,
        settings: true,
        createdAt: true,
      },
    });

    if (!org) {
      throw ApiError.notFound('Organization');
    }

    res.json({
      success: true,
      data: org,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ===========================================
// API Key Management
// ===========================================

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expiresIn: z.number().positive().optional(), // Days
});

// List API keys
router.get('/api-keys', authenticate, async (req, res, next) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { organizationId: req.auth!.organizationId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: keys,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create API key
router.post('/api-keys', authenticate, async (req, res, next) => {
  try {
    const data = CreateApiKeySchema.parse(req.body);

    const apiKeyPlain = generateApiKey('live');
    const apiKeyHash = hashApiKey(apiKeyPlain);

    const expiresAt = data.expiresIn
      ? new Date(Date.now() + data.expiresIn * 24 * 60 * 60 * 1000)
      : null;

    const key = await prisma.apiKey.create({
      data: {
        organizationId: req.auth!.organizationId,
        name: data.name,
        keyHash: apiKeyHash,
        keyPrefix: apiKeyPlain.substring(0, 12),
        scopes: data.scopes || ['*'],
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        ...key,
        // Only return full key once on creation
        key: apiKeyPlain,
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Revoke API key
router.delete('/api-keys/:keyId', authenticate, async (req, res, next) => {
  try {
    const { keyId } = req.params;

    const key = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        organizationId: req.auth!.organizationId,
      },
    });

    if (!key) {
      throw ApiError.notFound('API key');
    }

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    res.json({
      success: true,
      data: { message: 'API key revoked' },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ===========================================
// Helpers
// ===========================================

/**
 * Generate a new API key in Stripe-like format
 * Format: ec_{mode}_{random} (e.g., ec_live_abc123...)
 */
function generateApiKey(mode: 'live' | 'test'): string {
  const randomPart = randomBytes(24).toString('base64url');
  return `ec_${mode}_${randomPart}`;
}

export default router;
