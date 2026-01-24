import { Hono } from 'hono';
import type { Env } from '../app.js';
import { ApiKeyService, Organization, type EntityManager } from '@eurocomply/database';
import { requireOrgAdmin } from '../middleware/authorize.js';

export interface ApiKeysRouterDeps {
  /** EntityManager for database operations */
  em: EntityManager;
}

/**
 * API Key management routes.
 *
 * These routes allow tenants to manage their API keys programmatically.
 * All routes require JWT authentication (not API key auth) since you need
 * to be authenticated via Clerk to manage keys.
 */
export function createApiKeysRouter(deps: ApiKeysRouterDeps) {
  const router = new Hono<Env>();

  // All API key operations require Org Admin
  router.use('/*', requireOrgAdmin());

  /**
   * POST /api/v1/api-keys
   * Create a new API key for the tenant.
   *
   * Request body: { name: string }
   * Response: { data: { id, keyPrefix, name, createdAt }, rawKey: string }
   *
   * IMPORTANT: The rawKey is only returned once at creation time.
   */
  router.post('/', async (c) => {
    const schemaName = c.get('tenantSchema');
    const userId = c.get('userId');

    if (!schemaName || !userId) {
      return c.json({ error: 'Unauthorized', message: 'Missing tenant context' }, 401);
    }

    const body = await c.req.json<{ name?: string }>();
    if (!body.name || typeof body.name !== 'string') {
      return c.json({ error: 'Bad Request', message: 'name is required' }, 400);
    }

    const em = deps.em.fork();

    // Find organization by schema name
    const org = await em.findOne(Organization, { schemaName });
    if (!org) {
      return c.json({ error: 'Not Found', message: 'Organization not found' }, 404);
    }

    const apiKeyService = new ApiKeyService(em);
    const { apiKey, rawKey } = await apiKeyService.createKey(org.id, body.name);

    return c.json(
      {
        data: {
          id: apiKey.id,
          keyPrefix: apiKey.keyPrefix,
          name: apiKey.name,
          createdAt: apiKey.createdAt,
        },
        rawKey,
        message: 'API key created. Save the rawKey - it will not be shown again.',
      },
      201
    );
  });

  /**
   * GET /api/v1/api-keys
   * List all API keys for the tenant.
   *
   * Response: { data: [{ id, keyPrefix, name, createdAt, lastUsedAt, isActive }] }
   */
  router.get('/', async (c) => {
    const schemaName = c.get('tenantSchema');
    const userId = c.get('userId');

    if (!schemaName || !userId) {
      return c.json({ error: 'Unauthorized', message: 'Missing tenant context' }, 401);
    }

    const em = deps.em.fork();

    // Find organization by schema name
    const org = await em.findOne(Organization, { schemaName });
    if (!org) {
      return c.json({ error: 'Not Found', message: 'Organization not found' }, 404);
    }

    const apiKeyService = new ApiKeyService(em);
    const keys = await apiKeyService.listKeys(org.id);

    return c.json({
      data: keys.map((key) => ({
        id: key.id,
        keyPrefix: key.keyPrefix,
        name: key.name,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        isActive: key.isActive,
      })),
      meta: { total: keys.length },
    });
  });

  /**
   * DELETE /api/v1/api-keys/:id
   * Revoke an API key.
   *
   * Response: { success: true, message: string }
   */
  router.delete('/:id', async (c) => {
    const schemaName = c.get('tenantSchema');
    const userId = c.get('userId');
    const keyId = c.req.param('id');

    if (!schemaName || !userId) {
      return c.json({ error: 'Unauthorized', message: 'Missing tenant context' }, 401);
    }

    const em = deps.em.fork();

    // Find organization by schema name
    const org = await em.findOne(Organization, { schemaName });
    if (!org) {
      return c.json({ error: 'Not Found', message: 'Organization not found' }, 404);
    }

    const apiKeyService = new ApiKeyService(em);
    const revoked = await apiKeyService.revokeKey(keyId, org.id);

    if (!revoked) {
      return c.json({ error: 'Not Found', message: 'API key not found' }, 404);
    }

    return c.json({ success: true, message: 'API key revoked' });
  });

  return router;
}
