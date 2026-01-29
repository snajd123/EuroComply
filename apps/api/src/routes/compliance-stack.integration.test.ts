/**
 * Compliance Stack API Integration Tests
 *
 * Tests the compliance-stack router against a real database with proper tenant isolation,
 * authorization, and multi-tenant safety. The ComplianceStackResolver is used to
 * return the effective compliance regulations for a tenant category.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createComplianceStackRouter } from './compliance-stack.js';
import {
  Organization,
  User,
  OrganizationUser,
  TenantCategory,
  TenantProvisioner,
  ProvisioningStatus,
  SubscriptionTier,
  SubscriptionStatus,
  EnforcementMode,
  WorkspaceAuthority,
} from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createId } from '@eurocomply/core';
import type { Env } from '../app.js';

interface ComplianceStackResponse {
  success: boolean;
  data: {
    tenantCategoryId: string;
    regulations: Array<{
      regulationId: string;
      regulationCode: string;
      source: 'SYSTEM' | 'TENANT';
      requirements: Array<{
        requirementId: string;
        requirementCode: string;
        type: string;
        severity: string;
        status: 'ACTIVE' | 'EXEMPTED';
        exemption?: {
          reason: string;
          legalRef?: string;
          exemptedBy: string;
          exemptedAt: string;
        };
      }>;
    }>;
  };
  meta?: { requestId?: string; timestamp?: string };
}

interface ErrorResponse {
  success: boolean;
  error: { code: string; message: string };
  meta?: { requestId?: string; timestamp?: string };
}

describe('Compliance Stack API Integration', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;

  const uniqueSuffix = Date.now().toString();
  const testSchemaName = `tenant_stack_${uniqueSuffix.slice(-8)}`;

  let testOrgId: string;
  let viewerUserId: string;
  let complianceViewerId: string;
  let noneUserId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);

    const em = orm.em.fork();
    const now = new Date();
    testOrgId = createId();

    const org = em.create(Organization, {
      id: testOrgId,
      name: `Compliance Stack Test Org ${uniqueSuffix}`,
      slug: `compliance-stack-test-${uniqueSuffix}`,
      schemaName: testSchemaName,
      clerkOrgId: `org_compliance_stack_test_${uniqueSuffix}`,
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

    const result = await provisioner.provisionTenant(testSchemaName);
    if (!result.success) {
      throw new Error(`Failed to provision test tenant: ${result.error}`);
    }

    org.provisioningStatus = ProvisioningStatus.READY;
    await em.flush();

    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

    viewerUserId = createId();
    complianceViewerId = createId();
    noneUserId = createId();

    // User with design:VIEWER but compliance:NONE
    const viewerUser = tenantEm.create(User, {
      id: viewerUserId,
      clerkId: `clerk_design_viewer_${uniqueSuffix}`,
      email: `design_viewer_${uniqueSuffix}@test.com`,
      name: 'Design Viewer User',
      createdAt: now,
      updatedAt: now,
    });

    // User with compliance:VIEWER (the permission needed for this endpoint)
    const complianceViewerUser = tenantEm.create(User, {
      id: complianceViewerId,
      clerkId: `clerk_compliance_viewer_${uniqueSuffix}`,
      email: `compliance_viewer_${uniqueSuffix}@test.com`,
      name: 'Compliance Viewer User',
      createdAt: now,
      updatedAt: now,
    });

    // User with NONE authority everywhere
    const noneUser = tenantEm.create(User, {
      id: noneUserId,
      clerkId: `clerk_none_${uniqueSuffix}`,
      email: `none_${uniqueSuffix}@test.com`,
      name: 'None User',
      createdAt: now,
      updatedAt: now,
    });

    tenantEm.persist([viewerUser, complianceViewerUser, noneUser]);

    // Viewer with only design authority
    const viewerMembership = tenantEm.create(OrganizationUser, {
      id: createId(),
      user: viewerUser,
      isOrgAdmin: false,
      designAuthority: WorkspaceAuthority.VIEWER,
      operationsAuthority: WorkspaceAuthority.NONE,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.NONE,
      createdAt: now,
      updatedAt: now,
    });

    // Viewer with compliance authority
    const complianceViewerMembership = tenantEm.create(OrganizationUser, {
      id: createId(),
      user: complianceViewerUser,
      isOrgAdmin: false,
      designAuthority: WorkspaceAuthority.NONE,
      operationsAuthority: WorkspaceAuthority.NONE,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.VIEWER,
      createdAt: now,
      updatedAt: now,
    });

    // User with no authority
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

    tenantEm.persist([viewerMembership, complianceViewerMembership, noneMembership]);
    await tenantEm.flush();
  });

  afterAll(async () => {
    if (orm) {
      try {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchemaName}" CASCADE`);

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

    // Clean up tenant categories before each test
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);
    await tenantEm.execute(`DELETE FROM "${testSchemaName}"."tenant_category"`);

    // Clean up public schema test data using raw SQL (more reliable for cleanup)
    // Wrapped in try-catch since tables may not exist in all test environments
    const publicEm = orm.em.fork();
    try {
      await publicEm.execute('DELETE FROM public.category_regulation');
    } catch { /* Table may not exist */ }
    try {
      await publicEm.execute('DELETE FROM public.requirement');
    } catch { /* Table may not exist */ }
    try {
      await publicEm.execute('DELETE FROM public.regulation');
    } catch { /* Table may not exist */ }
    try {
      await publicEm.execute('DELETE FROM public.category');
    } catch { /* Table may not exist */ }
  });

  function createTestApp(userId: string): Hono<Env> {
    const testApp = new Hono<Env>();

    testApp.use('*', async (c, next) => {
      c.set('tenantSchema', testSchemaName);
      c.set('userId', userId);

      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const membership = await tenantEm.findOne(OrganizationUser, { user: userId });
      if (membership) {
        c.set('membership', membership);
      }

      return next();
    });

    testApp.route('/compliance-stack', createComplianceStackRouter({ orm }));
    return testApp;
  }

  describe('GET /compliance-stack/:tenantCategoryId', () => {
    // TODO: Add test for effective regulations when test DB setup includes public schema tables
    // The test requires: Category, Regulation, Requirement, CategoryRegulation entities
    // These need proper seeding via ManifestLoader or raw SQL in test setup

    it('should_return_empty_regulations_when_no_system_category_linked', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create tenant category without system category link
      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const tenantCategory = new TenantCategory();
      tenantCategory.name = 'Custom Category';
      tenantCategory.path = 'custom_category';
      tenantCategory.type = 'ROOT';
      tenantCategory.targetType = 'PRODUCT';
      tenantCategory.depth = 0;
      tenantCategory.isActive = true;
      // No systemCategoryId set
      await tenantEm.persistAndFlush(tenantCategory);

      const testApp = createTestApp(complianceViewerId);
      const res = await testApp.request(`/compliance-stack/${tenantCategory.id}`);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.data.tenantCategoryId).toBe(tenantCategory.id);
      // Accept either new format (regulations) or legacy format (effectiveRegulations)
      const regulations = data.data.regulations ?? data.data.effectiveRegulations;
      expect(regulations).toEqual([]);
    });

    it('should_return_404_for_unknown_tenant_category', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceViewerId);
      const nonExistentId = createId();
      const res = await testApp.request(`/compliance-stack/${nonExistentId}`);

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('should_return_404_for_invalid_id_format', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceViewerId);
      const res = await testApp.request('/compliance-stack/not-a-valid-id');

      // Since we don't have strict UUID validation, invalid IDs are treated as "not found"
      expect(res.status).toBe(404);
    });

    it('should_deny_user_with_no_compliance_authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create a tenant category
      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const tenantCategory = new TenantCategory();
      tenantCategory.name = 'Some Category';
      tenantCategory.path = 'some_category';
      tenantCategory.type = 'ROOT';
      tenantCategory.targetType = 'PRODUCT';
      tenantCategory.depth = 0;
      tenantCategory.isActive = true;
      await tenantEm.persistAndFlush(tenantCategory);

      // User with NONE compliance authority
      const testApp = createTestApp(noneUserId);
      const res = await testApp.request(`/compliance-stack/${tenantCategory.id}`);

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.code).toBe('FORBIDDEN');
    });

    it('should_deny_user_with_only_design_authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create a tenant category
      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const tenantCategory = new TenantCategory();
      tenantCategory.name = 'Another Category';
      tenantCategory.path = 'another_category';
      tenantCategory.type = 'ROOT';
      tenantCategory.targetType = 'PRODUCT';
      tenantCategory.depth = 0;
      tenantCategory.isActive = true;
      await tenantEm.persistAndFlush(tenantCategory);

      // User with design:VIEWER but compliance:NONE
      const testApp = createTestApp(viewerUserId);
      const res = await testApp.request(`/compliance-stack/${tenantCategory.id}`);

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.code).toBe('FORBIDDEN');
    });

    it('should_allow_user_with_compliance_viewer_authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create a tenant category
      const tenantEm = orm.em.fork({ schema: testSchemaName });
      await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

      const tenantCategory = new TenantCategory();
      tenantCategory.name = 'Compliance Category';
      tenantCategory.path = 'compliance_category';
      tenantCategory.type = 'ROOT';
      tenantCategory.targetType = 'PRODUCT';
      tenantCategory.depth = 0;
      tenantCategory.isActive = true;
      await tenantEm.persistAndFlush(tenantCategory);

      const testApp = createTestApp(complianceViewerId);
      const res = await testApp.request(`/compliance-stack/${tenantCategory.id}`);

      expect(res.status).toBe(200);
    });
  });
});
