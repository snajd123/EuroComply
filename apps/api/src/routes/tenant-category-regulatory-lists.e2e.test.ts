/**
 * Tenant Category Regulatory Lists API E2E Tests
 *
 * Tests the compliance stack routes against a real database with proper
 * tenant isolation and authorization.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createTenantCategoryRegulatoryListsRouter } from './tenant-category-regulatory-lists.js';
import {
  Organization,
  User,
  OrganizationUser,
  TenantProvisioner,
  ProvisioningStatus,
  SubscriptionTier,
  SubscriptionStatus,
  EnforcementMode,
  WorkspaceAuthority,
  TenantCategory,
  CategoryAdoption,
  LinkMode,
  ListRequirement,
  RegulationSource,
  TenantCategoryRegulatoryList,
} from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createId } from '@eurocomply/core';
import type { Env } from '../app.js';

// Response types for type-safe test assertions
interface EffectiveRegulation {
  regulatoryListId: string;
  regulatoryListCode: string;
  source: 'SYSTEM' | 'TENANT';
  requirement: string;
  status: 'ACTIVE' | 'EXEMPTED';
  allowExemption: boolean;
  overrideThreshold?: string;
  exemption?: {
    reason: string;
    legalRef?: string;
    exemptedBy: string;
    exemptedAt: string;
  };
}

interface ComplianceStackResponse {
  data: {
    tenantCategoryId: string;
    tenantCategoryPath: string;
    systemCategoryId?: string;
    linkMode?: string;
    effectiveRegulations: EffectiveRegulation[];
  };
}

interface ExemptionResponse {
  data: {
    id: string;
    regulatoryListId: string;
    isExempted: boolean;
    exemptionReason: string;
    exemptionLegalRef: string | null;
    exemptedBy: string;
    exemptedAt: string;
  };
}

interface ErrorResponse {
  error: { code: string; message: string };
}

describe('Tenant Category Regulatory Lists API E2E', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;

  // Test tenant - use unique suffix to avoid conflicts across test runs
  const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const testSchemaName = `tenant_reglist_test_${uniqueSuffix}`;

  // Test data IDs
  let testOrgId: string;
  let viewerUserId: string;
  let editorUserId: string;
  let noneUserId: string;

  // Test category and regulatory list IDs
  const categoryIds: Record<string, string> = {};
  const regulatoryListIds: Record<string, string> = {};
  let tenantCategoryId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);

    // Create test organization
    const em = orm.em.fork();
    const now = new Date();
    testOrgId = createId();

    const org = em.create(Organization, {
      id: testOrgId,
      name: `RegList Test Org ${uniqueSuffix}`,
      slug: `reglist-test-${uniqueSuffix}`,
      schemaName: testSchemaName,
      clerkOrgId: `org_reglist_test_${uniqueSuffix}`,
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

    // Provision the tenant schema
    const result = await provisioner.provisionTenant(testSchemaName);
    if (!result.success) {
      throw new Error(`Failed to provision test tenant: ${result.error}`);
    }

    // Update org status
    org.provisioningStatus = ProvisioningStatus.READY;
    await em.flush();

    // Create system categories in public schema
    const connection = orm.em.getConnection();
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS public.category (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        path ltree NOT NULL,
        type VARCHAR(10) DEFAULT 'BRANCH',
        target_type VARCHAR(20) DEFAULT 'PRODUCT',
        depth INT DEFAULT 0,
        parent_id TEXT REFERENCES public.category(id),
        default_profile_id TEXT,
        is_active BOOLEAN DEFAULT true,
        version INT DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await connection.execute(`
      CREATE INDEX IF NOT EXISTS category_path_gist_idx ON public.category USING gist(path)
    `);

    // Seed test categories in public schema
    categoryIds['cosmetics'] = createId();

    await connection.execute(`
      INSERT INTO public.category (id, name, description, path, type, target_type, depth, parent_id, is_active, created_at, updated_at)
      VALUES
        ('${categoryIds['cosmetics']}', 'Cosmetics', 'Cosmetic products', 'cosmetics', 'ROOT', 'PRODUCT', 0, NULL, true, '${now.toISOString()}', '${now.toISOString()}')
      ON CONFLICT (id) DO NOTHING
    `);

    // Create regulatory lists in public schema
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS public.regulatory_list (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        version TEXT NOT NULL,
        effective_date TIMESTAMPTZ NOT NULL,
        superseded_date TIMESTAMPTZ,
        is_current_version BOOLEAN DEFAULT true,
        allow_tenant_exemption BOOLEAN DEFAULT true,
        source_url TEXT,
        description TEXT,
        previous_version_id TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    regulatoryListIds['reach_svhc'] = createId();
    regulatoryListIds['cosing_annex2'] = createId();
    regulatoryListIds['extra_list'] = createId();
    regulatoryListIds['no_exemption_list'] = createId();

    await connection.execute(`
      INSERT INTO public.regulatory_list (id, code, name, source, version, effective_date, is_current_version, allow_tenant_exemption, created_at, updated_at)
      VALUES
        ('${regulatoryListIds['reach_svhc']}', 'REACH_SVHC', 'REACH SVHC Candidate List', 'ECHA', '2024-01', '2024-01-01', true, true, '${now.toISOString()}', '${now.toISOString()}'),
        ('${regulatoryListIds['cosing_annex2']}', 'COSING_ANNEX_II', 'CosIng Annex II', 'EU_COSMETICS', '2024-01', '2024-01-01', true, true, '${now.toISOString()}', '${now.toISOString()}'),
        ('${regulatoryListIds['extra_list']}', 'EXTRA_LIST', 'Extra Regulatory List', 'CUSTOM', '2024-01', '2024-01-01', true, true, '${now.toISOString()}', '${now.toISOString()}'),
        ('${regulatoryListIds['no_exemption_list']}', 'NO_EXEMPTION', 'List Without Exemptions', 'CUSTOM', '2024-01', '2024-01-01', true, false, '${now.toISOString()}', '${now.toISOString()}')
      ON CONFLICT (id) DO NOTHING
    `);

    // Create category_regulatory_list linking table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS public.category_regulatory_list (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL REFERENCES public.category(id),
        regulatory_list_id TEXT NOT NULL REFERENCES public.regulatory_list(id),
        requirement TEXT NOT NULL DEFAULT 'MANDATORY',
        priority SMALLINT DEFAULT 0,
        is_exclusion BOOLEAN DEFAULT false,
        compare_value_override DECIMAL(5,4),
        allow_tenant_exemption BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(category_id, regulatory_list_id)
      )
    `);

    // Link regulatory lists to category
    const catRegListId1 = createId();
    const catRegListId2 = createId();
    const catRegListId3 = createId();

    await connection.execute(`
      INSERT INTO public.category_regulatory_list (id, category_id, regulatory_list_id, requirement, allow_tenant_exemption, created_at, updated_at)
      VALUES
        ('${catRegListId1}', '${categoryIds['cosmetics']}', '${regulatoryListIds['reach_svhc']}', 'MANDATORY', true, '${now.toISOString()}', '${now.toISOString()}'),
        ('${catRegListId2}', '${categoryIds['cosmetics']}', '${regulatoryListIds['cosing_annex2']}', 'MANDATORY', true, '${now.toISOString()}', '${now.toISOString()}'),
        ('${catRegListId3}', '${categoryIds['cosmetics']}', '${regulatoryListIds['no_exemption_list']}', 'MANDATORY', false, '${now.toISOString()}', '${now.toISOString()}')
      ON CONFLICT (category_id, regulatory_list_id) DO NOTHING
    `);

    // Create test users and memberships in tenant schema
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

    viewerUserId = createId();
    editorUserId = createId();
    noneUserId = createId();

    // Create users
    const viewerUser = tenantEm.create(User, {
      id: viewerUserId,
      clerkId: `clerk_viewer_${uniqueSuffix}`,
      email: `viewer_${uniqueSuffix}@test.com`,
      name: 'Viewer User',
      createdAt: now,
      updatedAt: now,
    });

    const editorUser = tenantEm.create(User, {
      id: editorUserId,
      clerkId: `clerk_editor_${uniqueSuffix}`,
      email: `editor_${uniqueSuffix}@test.com`,
      name: 'Editor User',
      createdAt: now,
      updatedAt: now,
    });

    const noneUser = tenantEm.create(User, {
      id: noneUserId,
      clerkId: `clerk_none_${uniqueSuffix}`,
      email: `none_${uniqueSuffix}@test.com`,
      name: 'None User',
      createdAt: now,
      updatedAt: now,
    });

    tenantEm.persist([viewerUser, editorUser, noneUser]);

    // Create memberships with different authorities
    // VIEWER for compliance allows viewing compliance stack
    const viewerMembership = tenantEm.create(OrganizationUser, {
      id: createId(),
      user: viewerUser,
      isOrgAdmin: false,
      designAuthority: WorkspaceAuthority.NONE,
      operationsAuthority: WorkspaceAuthority.NONE,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.VIEWER,
      createdAt: now,
      updatedAt: now,
    });

    // EDITOR for compliance allows creating exemptions
    const editorMembership = tenantEm.create(OrganizationUser, {
      id: createId(),
      user: editorUser,
      isOrgAdmin: false,
      designAuthority: WorkspaceAuthority.NONE,
      operationsAuthority: WorkspaceAuthority.NONE,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.EDITOR,
      createdAt: now,
      updatedAt: now,
    });

    // NONE authority
    const noneMembership = tenantEm.create(OrganizationUser, {
      id: createId(),
      user: noneUser,
      isOrgAdmin: false,
      designAuthority: WorkspaceAuthority.NONE,
      operationsAuthority: WorkspaceAuthority.NONE,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.NONE,
      createdAt: now,
      updatedAt: now,
    });

    tenantEm.persist([viewerMembership, editorMembership, noneMembership]);
    await tenantEm.flush();
  });

  afterAll(async () => {
    if (orm) {
      try {
        // Drop test schema
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchemaName}" CASCADE`);

        // Clean up system data
        await orm.em.execute('DELETE FROM public.category_regulatory_list');
        await orm.em.execute('DELETE FROM public.regulatory_list');
        await orm.em.execute('DELETE FROM public.category');

        // Delete test organization
        const em = orm.em.fork();
        const org = await em.findOne(Organization, { id: testOrgId });
        if (org) {
          em.remove(org);
          await em.flush();
        }
      } catch {
        // Ignore cleanup errors
      }
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    // Clean up tenant regulatory list mappings and recreate TenantCategory before each test
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);
    await tenantEm.execute('DELETE FROM tenant_category_regulatory_list');
    await tenantEm.execute('DELETE FROM category_adoption');
    await tenantEm.execute('DELETE FROM tenant_category');

    // Create a TenantCategory linked to the system category
    tenantCategoryId = createId();
    const now = new Date();

    const tenantCategory = tenantEm.create(TenantCategory, {
      id: tenantCategoryId,
      name: 'Cosmetics',
      path: 'system.cosmetics',
      systemCategoryId: categoryIds['cosmetics'],
      linkMode: LinkMode.LIVE,
      createdAt: now,
      updatedAt: now,
    });
    tenantEm.persist(tenantCategory);

    // Create corresponding CategoryAdoption record
    const adoption = tenantEm.create(CategoryAdoption, {
      id: createId(),
      systemCategoryId: categoryIds['cosmetics'],
      mode: LinkMode.LIVE,
      adoptedAt: now,
      adoptedVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
    tenantEm.persist(adoption);

    await tenantEm.flush();
  });

  /**
   * Creates a Hono app with the tenant category regulatory lists router and a middleware
   * that sets the tenant schema and user membership based on the provided user ID.
   */
  function createTestApp(userId: string | null): Hono<Env> {
    const testApp = new Hono<Env>();

    // Middleware to load user and membership from database
    testApp.use('*', async (c, next) => {
      if (userId === null) {
        // No authentication - skip setting user/membership
        c.set('tenantSchema', testSchemaName);
        return next();
      }

      c.set('tenantSchema', testSchemaName);
      c.set('userId', userId);

      // Load membership from database
      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const membership = await tenantEm.findOne(OrganizationUser, { user: userId });
      if (membership) {
        c.set('membership', membership);
      }

      return next();
    });

    testApp.route('/tenant-categories', createTenantCategoryRegulatoryListsRouter({ orm }));
    return testApp;
  }

  // ============================================================================
  // GET /:id/regulatory-lists - Get compliance stack
  // ============================================================================

  describe('GET /tenant-categories/:id/regulatory-lists', () => {
    it('should return system baseline regulations when category is adopted', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request(`/tenant-categories/${tenantCategoryId}/regulatory-lists`);

      expect(res.status).toBe(200);
      const data = (await res.json()) as ComplianceStackResponse;

      expect(data.data.tenantCategoryId).toBe(tenantCategoryId);
      expect(data.data.systemCategoryId).toBe(categoryIds['cosmetics']);
      expect(data.data.linkMode).toBe('LIVE');
      expect(data.data.effectiveRegulations).toBeInstanceOf(Array);
      expect(data.data.effectiveRegulations.length).toBe(3);

      // Verify system baseline includes expected regulations
      const reachReg = data.data.effectiveRegulations.find(r => r.regulatoryListCode === 'REACH_SVHC');
      expect(reachReg).toBeDefined();
      expect(reachReg?.source).toBe('SYSTEM');
      expect(reachReg?.status).toBe('ACTIVE');
      expect(reachReg?.requirement).toBe('MANDATORY');

      const cosingReg = data.data.effectiveRegulations.find(r => r.regulatoryListCode === 'COSING_ANNEX_II');
      expect(cosingReg).toBeDefined();
      expect(cosingReg?.source).toBe('SYSTEM');
      expect(cosingReg?.status).toBe('ACTIVE');
    });

    it('should include tenant added regulations when present', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Add a tenant-specific regulation
      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const tenantCategory = await tenantEm.findOneOrFail(TenantCategory, { id: tenantCategoryId });
      const mapping = tenantEm.create(TenantCategoryRegulatoryList, {
        id: createId(),
        tenantCategory,
        regulatoryListId: regulatoryListIds['extra_list'],
        requirement: ListRequirement.RECOMMENDED,
        source: RegulationSource.TENANT_ADDED,
        isExempted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      tenantEm.persist(mapping);
      await tenantEm.flush();

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request(`/tenant-categories/${tenantCategoryId}/regulatory-lists`);

      expect(res.status).toBe(200);
      const data = (await res.json()) as ComplianceStackResponse;

      // Should include system baseline + tenant added
      expect(data.data.effectiveRegulations.length).toBe(4);

      const extraReg = data.data.effectiveRegulations.find(r => r.regulatoryListCode === 'EXTRA_LIST');
      expect(extraReg).toBeDefined();
      expect(extraReg?.source).toBe('TENANT');
      expect(extraReg?.status).toBe('ACTIVE');
      expect(extraReg?.requirement).toBe('RECOMMENDED');
    });

    it('should mark exempted regulations with EXEMPTED status when exemption exists', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create an exemption for a system baseline regulation
      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const tenantCategory = await tenantEm.findOneOrFail(TenantCategory, { id: tenantCategoryId });
      const exemption = tenantEm.create(TenantCategoryRegulatoryList, {
        id: createId(),
        tenantCategory,
        regulatoryListId: regulatoryListIds['reach_svhc'],
        requirement: ListRequirement.MANDATORY,
        source: RegulationSource.INHERITED,
        isExempted: true,
        exemptionReason: 'Product is not subject to REACH requirements due to exemption clause',
        exemptionLegalRef: 'REACH Article 2(7)(b)',
        exemptedBy: editorUserId,
        exemptedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      tenantEm.persist(exemption);
      await tenantEm.flush();

      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request(`/tenant-categories/${tenantCategoryId}/regulatory-lists`);

      expect(res.status).toBe(200);
      const data = (await res.json()) as ComplianceStackResponse;

      const reachReg = data.data.effectiveRegulations.find(r => r.regulatoryListCode === 'REACH_SVHC');
      expect(reachReg).toBeDefined();
      expect(reachReg?.status).toBe('EXEMPTED');
      expect(reachReg?.exemption).toBeDefined();
      expect(reachReg?.exemption?.reason).toContain('exemption clause');
      expect(reachReg?.exemption?.legalRef).toBe('REACH Article 2(7)(b)');
      expect(reachReg?.exemption?.exemptedBy).toBe(editorUserId);
    });

    it('should return 401 when authentication missing', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create app without user authentication
      const testApp = createTestApp(null);
      const res = await testApp.request(`/tenant-categories/${tenantCategoryId}/regulatory-lists`);

      // Without membership, authorize middleware returns 401
      expect(res.status).toBe(401);
    });

    it('should return 403 when user lacks compliance view permission', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request(`/tenant-categories/${tenantCategoryId}/regulatory-lists`);

      expect(res.status).toBe(403);
    });

    it('should return 404 when tenant category does not exist', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(viewerUserId);
      // Use a valid CUID format that doesn't exist in database
      const res = await testApp.request('/tenant-categories/zzzzzzzzzzzzzzzzzzzzz/regulatory-lists');

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  // ============================================================================
  // POST /:id/regulatory-lists/:listId/exempt - Create exemption
  // ============================================================================

  describe('POST /tenant-categories/:id/regulatory-lists/:listId/exempt', () => {
    it('should create exemption with audit trail when valid justification provided', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request(
        `/tenant-categories/${tenantCategoryId}/regulatory-lists/${regulatoryListIds['reach_svhc']}/exempt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: 'Product is classified as a medical device and is exempt under REACH Article 2(7)(b)',
            legalRef: 'REACH Regulation Article 2(7)(b)',
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as ExemptionResponse;

      expect(data.data.isExempted).toBe(true);
      expect(data.data.regulatoryListId).toBe(regulatoryListIds['reach_svhc']);
      expect(data.data.exemptionReason).toContain('medical device');
      expect(data.data.exemptionLegalRef).toBe('REACH Regulation Article 2(7)(b)');
      expect(data.data.exemptedBy).toBe(editorUserId);
      expect(data.data.exemptedAt).toBeDefined();

      // Verify the exemption is visible in the compliance stack
      const getRes = await testApp.request(`/tenant-categories/${tenantCategoryId}/regulatory-lists`);
      const stackData = (await getRes.json()) as ComplianceStackResponse;

      const reachReg = stackData.data.effectiveRegulations.find(r => r.regulatoryListCode === 'REACH_SVHC');
      expect(reachReg?.status).toBe('EXEMPTED');
    });

    it('should return 403 when regulation has allowTenantExemption false', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request(
        `/tenant-categories/${tenantCategoryId}/regulatory-lists/${regulatoryListIds['no_exemption_list']}/exempt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: 'Trying to exempt a non-exemptable regulation',
          }),
        }
      );

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toContain('does not allow exemptions');
    });

    it('should return 400 when exemption reason is too short', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      const res = await testApp.request(
        `/tenant-categories/${tenantCategoryId}/regulatory-lists/${regulatoryListIds['reach_svhc']}/exempt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: 'Too short', // Less than 10 characters
          }),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should return 404 when regulatory list does not exist', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(editorUserId);
      // Use a valid CUID format that doesn't exist in database
      const res = await testApp.request(
        `/tenant-categories/${tenantCategoryId}/regulatory-lists/zzzzzzzzzzzzzzzzzzzzz/exempt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: 'This regulatory list does not exist so this exemption should fail',
          }),
        }
      );

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  // ============================================================================
  // Multi-tenant isolation
  // ============================================================================

  describe('Multi-tenant isolation', () => {
    it('regulatory list mappings are isolated to their tenant schema', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create an exemption in the test tenant
      const testApp = createTestApp(editorUserId);
      await testApp.request(
        `/tenant-categories/${tenantCategoryId}/regulatory-lists/${regulatoryListIds['reach_svhc']}/exempt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: 'Product is classified as a medical device and is exempt under REACH Article 2(7)(b)',
            legalRef: 'REACH Regulation Article 2(7)(b)',
          }),
        }
      );

      // Verify the exemption exists in the compliance stack
      const res = await testApp.request(`/tenant-categories/${tenantCategoryId}/regulatory-lists`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as ComplianceStackResponse;

      const reachReg = data.data.effectiveRegulations.find(r => r.regulatoryListCode === 'REACH_SVHC');
      expect(reachReg?.status).toBe('EXEMPTED');

      // Verify the tenant_category_regulatory_list table does NOT exist in public schema
      const publicEm = orm.em.fork({ schema: 'public' });
      const publicTables = await publicEm.execute<{ count: string }[]>(
        `SELECT COUNT(*) as count FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'tenant_category_regulatory_list'`
      );
      expect(publicTables[0]?.count).toBe('0');
    });
  });
});
