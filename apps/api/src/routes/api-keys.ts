import { Hono } from 'hono';
import type { Env } from '../app.js';
import { ApiKeyService, Organization, WorkspaceAuthority, type EntityManager } from '@eurocomply/database';
import { requireOrgAdmin } from '../middleware/authorize.js';
import { success, error } from '../utils/response.js';

const VALID_AUTHORITIES = Object.values(WorkspaceAuthority);

function isValidAuthority(value: unknown): value is WorkspaceAuthority {
  return typeof value === 'string' && VALID_AUTHORITIES.includes(value as WorkspaceAuthority);
}

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
   * Request body: {
   *   name: string,
   *   designAuthority?: WorkspaceAuthority,
   *   operationsAuthority?: WorkspaceAuthority,
   *   marketingAuthority?: WorkspaceAuthority,
   *   complianceAuthority?: WorkspaceAuthority,
   *   isOrgAdmin?: boolean
   * }
   * Response: { data: { id, keyPrefix, name, createdAt, authorities }, rawKey: string }
   *
   * IMPORTANT: The rawKey is only returned once at creation time.
   */
  router.post('/', async (c) => {
    const schemaName = c.get('tenantSchema');
    const userId = c.get('userId');

    if (!schemaName || !userId) {
      return error(c, 'UNAUTHORIZED', 'Missing tenant context', 401);
    }

    interface CreateApiKeyBody {
      name?: string;
      designAuthority?: unknown;
      operationsAuthority?: unknown;
      marketingAuthority?: unknown;
      complianceAuthority?: unknown;
      isOrgAdmin?: boolean;
    }

    const body = await c.req.json<CreateApiKeyBody>();
    if (!body.name || typeof body.name !== 'string') {
      return error(c, 'BAD_REQUEST', 'name is required', 400);
    }

    // Validate authorities if provided
    const authorityFields = ['designAuthority', 'operationsAuthority', 'marketingAuthority', 'complianceAuthority'] as const;
    for (const field of authorityFields) {
      const value = body[field];
      if (value !== undefined && !isValidAuthority(value)) {
        return error(c, 'BAD_REQUEST', `Invalid ${field}: must be one of ${VALID_AUTHORITIES.join(', ')}`, 400);
      }
    }

    const em = deps.em.fork();

    // Find organization by schema name
    const org = await em.findOne(Organization, { schemaName });
    if (!org) {
      return error(c, 'NOT_FOUND', 'Organization not found', 404);
    }

    const apiKeyService = new ApiKeyService(em);
    const { apiKey, rawKey } = await apiKeyService.createKey(org.id, {
      name: body.name,
      designAuthority: body.designAuthority as WorkspaceAuthority | undefined,
      operationsAuthority: body.operationsAuthority as WorkspaceAuthority | undefined,
      marketingAuthority: body.marketingAuthority as WorkspaceAuthority | undefined,
      complianceAuthority: body.complianceAuthority as WorkspaceAuthority | undefined,
      isOrgAdmin: body.isOrgAdmin,
    });

    return success(c, {
      id: apiKey.id,
      keyPrefix: apiKey.keyPrefix,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
      designAuthority: apiKey.designAuthority,
      operationsAuthority: apiKey.operationsAuthority,
      marketingAuthority: apiKey.marketingAuthority,
      complianceAuthority: apiKey.complianceAuthority,
      isOrgAdmin: apiKey.isOrgAdmin,
      rawKey,
      message: 'API key created. Save the rawKey - it will not be shown again.',
    }, { status: 201 });
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
      return error(c, 'UNAUTHORIZED', 'Missing tenant context', 401);
    }

    const em = deps.em.fork();

    // Find organization by schema name
    const org = await em.findOne(Organization, { schemaName });
    if (!org) {
      return error(c, 'NOT_FOUND', 'Organization not found', 404);
    }

    const apiKeyService = new ApiKeyService(em);
    const keys = await apiKeyService.listKeys(org.id);

    return success(c, keys.map((key) => ({
      id: key.id,
      keyPrefix: key.keyPrefix,
      name: key.name,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      isActive: key.isActive,
      designAuthority: key.designAuthority,
      operationsAuthority: key.operationsAuthority,
      marketingAuthority: key.marketingAuthority,
      complianceAuthority: key.complianceAuthority,
      isOrgAdmin: key.isOrgAdmin,
    })), { total: keys.length });
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
      return error(c, 'UNAUTHORIZED', 'Missing tenant context', 401);
    }

    const em = deps.em.fork();

    // Find organization by schema name
    const org = await em.findOne(Organization, { schemaName });
    if (!org) {
      return error(c, 'NOT_FOUND', 'Organization not found', 404);
    }

    const apiKeyService = new ApiKeyService(em);
    const revoked = await apiKeyService.revokeKey(keyId, org.id);

    if (!revoked) {
      return error(c, 'NOT_FOUND', 'API key not found', 404);
    }

    return success(c, { message: 'API key revoked' });
  });

  return router;
}
