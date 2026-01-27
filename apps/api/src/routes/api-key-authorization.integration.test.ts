/**
 * API Key Authorization Integration Tests
 *
 * Tests that API keys with workspace authorities are properly
 * authorized/denied by the middleware stack.
 *
 * NO MOCKS - tests the full flow with real database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import {
  Organization,
  ApiKey,
  ApiKeyService,
  TenantProvisioner,
  ProvisioningStatus,
  SubscriptionTier,
  SubscriptionStatus,
  EnforcementMode,
  WorkspaceAuthority,
  hashApiKey,
} from '@eurocomply/database';
import type { MikroORM, EntityManager } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createId } from '@eurocomply/core';
import type { Env, ApiKeyAuthorities } from '../app.js';
import { createTenantMiddleware } from '../middleware/tenant.js';
import { authorize, requireOrgAdmin } from '../middleware/authorize.js';

describe('API Key Authorization Integration', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;
  let app: Hono<Env>;

  const uniqueSuffix = Date.now().toString();
  const testSchemaName = `tenant_apikey_auth_${uniqueSuffix.slice(-8)}`;

  let testOrgId: string;
  let editorKeyRaw: string;
  let viewerKeyRaw: string;
  let noneKeyRaw: string;
  let orgAdminKeyRaw: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);

    // Create test organization in public schema
    const em = orm.em.fork();
    const now = new Date();
    testOrgId = createId();

    const org = em.create(Organization, {
      id: testOrgId,
      name: `API Key Auth Test ${uniqueSuffix}`,
      slug: `apikey-auth-${uniqueSuffix}`,
      schemaName: testSchemaName,
      clerkOrgId: `org_apikey_auth_${uniqueSuffix}`,
      cellId: 'cell_1',
      subscriptionTier: SubscriptionTier.STARTER,
      subscriptionStatus: SubscriptionStatus.TRIALING,
      provisioningStatus: ProvisioningStatus.PENDING,
      regulatoryAdvisorEnabled: true,
      enforcementMode: EnforcementMode.SILENT,
      captureComplianceInSilentMode: true,
      createdAt: now,
      updatedAt: now,
    });
    await em.persistAndFlush(org);

    // Provision tenant schema
    const result = await provisioner.provisionTenant(testSchemaName);
    if (!result.success) {
      throw new Error(`Failed to provision test tenant: ${result.error}`);
    }

    org.provisioningStatus = ProvisioningStatus.READY;
    await em.flush();

    // Create API keys with different authorities
    const apiKeyService = new ApiKeyService(orm.em);

    // Key with EDITOR on design (can view and edit products)
    const editorResult = await apiKeyService.createKey(testOrgId, {
      name: 'Editor Key',
      designAuthority: WorkspaceAuthority.EDITOR,
      operationsAuthority: WorkspaceAuthority.NONE,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.NONE,
      isOrgAdmin: false,
    });
    editorKeyRaw = editorResult.rawKey;

    // Key with VIEWER on design (can only view products)
    const viewerResult = await apiKeyService.createKey(testOrgId, {
      name: 'Viewer Key',
      designAuthority: WorkspaceAuthority.VIEWER,
      operationsAuthority: WorkspaceAuthority.NONE,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.NONE,
      isOrgAdmin: false,
    });
    viewerKeyRaw = viewerResult.rawKey;

    // Key with NONE on all workspaces (no access)
    const noneResult = await apiKeyService.createKey(testOrgId, {
      name: 'None Key',
      designAuthority: WorkspaceAuthority.NONE,
      operationsAuthority: WorkspaceAuthority.NONE,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.NONE,
      isOrgAdmin: false,
    });
    noneKeyRaw = noneResult.rawKey;

    // Key with org admin
    const adminResult = await apiKeyService.createKey(testOrgId, {
      name: 'Org Admin Key',
      designAuthority: WorkspaceAuthority.MANAGER,
      operationsAuthority: WorkspaceAuthority.MANAGER,
      marketingAuthority: WorkspaceAuthority.MANAGER,
      complianceAuthority: WorkspaceAuthority.MANAGER,
      isOrgAdmin: true,
    });
    orgAdminKeyRaw = adminResult.rawKey;

    // Create test app with real middleware stack
    app = new Hono<Env>();

    // Tenant middleware with API key support
    app.use('*', createTenantMiddleware({ em: orm.em }));

    // Test routes with authorization
    app.get('/design/view', authorize('design', 'view'), (c) => {
      return c.json({ ok: true, action: 'design:view' });
    });

    app.post('/design/edit', authorize('design', 'edit'), (c) => {
      return c.json({ ok: true, action: 'design:edit' });
    });

    app.get('/compliance/view', authorize('compliance', 'view'), (c) => {
      return c.json({ ok: true, action: 'compliance:view' });
    });

    app.post('/admin/action', requireOrgAdmin(), (c) => {
      return c.json({ ok: true, action: 'admin' });
    });
  });

  afterAll(async () => {
    if (orm) {
      try {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchemaName}" CASCADE`);
      } catch {
        // Ignore
      }
      await teardownTestDb();
    }
  });

  describe('design workspace authorization', () => {
    it('allows EDITOR key to view design workspace', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/design/view', {
        headers: { 'X-API-Key': editorKeyRaw },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { ok: boolean; action: string };
      expect(data.action).toBe('design:view');
    });

    it('allows EDITOR key to edit design workspace', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/design/edit', {
        method: 'POST',
        headers: { 'X-API-Key': editorKeyRaw },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { ok: boolean; action: string };
      expect(data.action).toBe('design:edit');
    });

    it('allows VIEWER key to view design workspace', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/design/view', {
        headers: { 'X-API-Key': viewerKeyRaw },
      });

      expect(res.status).toBe(200);
    });

    it('denies VIEWER key from editing design workspace (403)', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/design/edit', {
        method: 'POST',
        headers: { 'X-API-Key': viewerKeyRaw },
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as { error: { code: string; message: string; details?: { workspace: string; yourAuthority: string } } };
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.details?.workspace).toBe('design');
      expect(data.error.details?.yourAuthority).toBe('VIEWER');
    });

    it('denies NONE key from viewing design workspace (403)', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/design/view', {
        headers: { 'X-API-Key': noneKeyRaw },
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as { error: { code: string; message: string; details?: { yourAuthority: string } } };
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.details?.yourAuthority).toBe('NONE');
    });
  });

  describe('cross-workspace isolation', () => {
    it('denies EDITOR design key from viewing compliance workspace (403)', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // This key has EDITOR on design but NONE on compliance
      const res = await app.request('/compliance/view', {
        headers: { 'X-API-Key': editorKeyRaw },
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as { error: { code: string; message: string; details?: { workspace: string; yourAuthority: string } } };
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.details?.workspace).toBe('compliance');
      expect(data.error.details?.yourAuthority).toBe('NONE');
    });
  });

  describe('org admin authorization', () => {
    it('allows org admin key to access admin routes', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/admin/action', {
        method: 'POST',
        headers: { 'X-API-Key': orgAdminKeyRaw },
      });

      expect(res.status).toBe(200);
    });

    it('denies non-admin key from admin routes even with MANAGER authority (403)', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Editor key has EDITOR authority but isOrgAdmin: false
      const res = await app.request('/admin/action', {
        method: 'POST',
        headers: { 'X-API-Key': editorKeyRaw },
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as { error: { code: string; message: string } };
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toContain('Organization Admin');
    });
  });

  describe('invalid/revoked keys', () => {
    it('returns 401 for invalid API key', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const res = await app.request('/design/view', {
        headers: { 'X-API-Key': 'ek_live_invalid_key_12345678901234567890' },
      });

      expect(res.status).toBe(401);
    });

    it('returns 401 for revoked API key', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create and immediately revoke a key
      const apiKeyService = new ApiKeyService(orm.em);
      const { apiKey, rawKey } = await apiKeyService.createKey(testOrgId, {
        name: 'Revoked Key',
        designAuthority: WorkspaceAuthority.EDITOR,
      });

      // Revoke it
      await apiKeyService.revokeKey(apiKey.id, testOrgId);

      // Try to use it
      const res = await app.request('/design/view', {
        headers: { 'X-API-Key': rawKey },
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: { code: string; message: string } };
      expect(data.error.message).toContain('revoked');
    });
  });
});
