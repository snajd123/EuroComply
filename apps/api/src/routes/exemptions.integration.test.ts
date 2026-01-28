/**
 * Exemptions API Integration Tests
 *
 * Tests the exemptions router against a real database with proper tenant isolation,
 * authorization, and the guardrail that prevents exempting non-exemptable requirements.
 *
 * These tests are written BEFORE the route implementation (TDD).
 * They should fail with 404 errors until the route is implemented.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
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
  Category,
  Regulation,
  RegulationStatus,
  Requirement,
  RequirementType,
  RequirementSeverity,
  CategoryRegulation,
  TenantRequirementExemption,
} from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createId } from '@eurocomply/core';
import type { Env } from '../app.js';

import { createExemptionRouter } from './exemptions.js';

interface ExemptionData {
  id: string;
  tenantCategoryId: string;
  requirementId: string;
  reason: string;
  legalReference?: string;
  exemptedBy: string;
  exemptedAt: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
}

interface ExemptionResponse {
  success: boolean;
  data: ExemptionData;
  meta?: { requestId?: string; timestamp?: string };
}

interface ErrorResponse {
  success: boolean;
  error: { code: string; message: string };
  meta?: { requestId?: string; timestamp?: string };
}

describe('Exemptions API Integration', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;

  const uniqueSuffix = Date.now().toString();
  const testSchemaName = `tenant_exemptions_${uniqueSuffix.slice(-8)}`;

  let testOrgId: string;
  let complianceEditorId: string;
  let complianceViewerId: string;
  let noneUserId: string;

  // Test data IDs
  let tenantCategoryId: string;
  let exemptableRequirementId: string;
  let nonExemptableRequirementId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);

    const em = orm.em.fork();
    const now = new Date();
    testOrgId = createId();

    // Create organization
    const org = em.create(Organization, {
      id: testOrgId,
      name: `Exemptions Test Org ${uniqueSuffix}`,
      slug: `exemptions-test-${uniqueSuffix}`,
      schemaName: testSchemaName,
      clerkOrgId: `org_exemptions_test_${uniqueSuffix}`,
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

    // Create test data in public schema
    const systemCategory = em.create(Category, {
      name: `Exemption Test Category ${uniqueSuffix}`,
      path: `exemption_test_${uniqueSuffix}`,
    });

    const regulation = em.create(Regulation, {
      code: `EXEMPT_REG_${uniqueSuffix}`,
      name: 'Exemption Test Regulation',
      status: RegulationStatus.ACTIVE,
    });

    await em.persistAndFlush([systemCategory, regulation]);

    // Create exemptable requirement
    const exemptableReq = em.create(Requirement, {
      regulation,
      code: `EXEMPTABLE_${uniqueSuffix}`,
      name: 'Exemptable Requirement',
      type: RequirementType.ATTRIBUTE_CHECK,
      severity: RequirementSeverity.WARNING,
      allowTenantExemption: true,
      handlerConfig: { attributeCode: 'test_attr' },
    });

    // Create non-exemptable requirement
    const nonExemptableReq = em.create(Requirement, {
      regulation,
      code: `NON_EXEMPTABLE_${uniqueSuffix}`,
      name: 'Non-Exemptable Requirement',
      type: RequirementType.SUBSTANCE_SCREEN,
      severity: RequirementSeverity.BLOCKER,
      allowTenantExemption: false,
      handlerConfig: { listCode: 'test_list' },
    });

    // Create category-regulation mapping
    const mapping = em.create(CategoryRegulation, {
      category: systemCategory,
      regulation,
      addedBy: 'test',
    });

    await em.persistAndFlush([exemptableReq, nonExemptableReq, mapping]);

    exemptableRequirementId = exemptableReq.id;
    nonExemptableRequirementId = nonExemptableReq.id;

    // Create tenant data
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

    complianceEditorId = createId();
    complianceViewerId = createId();
    noneUserId = createId();

    // User with compliance:EDITOR (can create/revoke exemptions)
    const editorUser = tenantEm.create(User, {
      id: complianceEditorId,
      clerkId: `clerk_compliance_editor_${uniqueSuffix}`,
      email: `compliance_editor_${uniqueSuffix}@test.com`,
      name: 'Compliance Editor User',
      createdAt: now,
      updatedAt: now,
    });

    // User with compliance:VIEWER (can only view exemptions)
    const viewerUser = tenantEm.create(User, {
      id: complianceViewerId,
      clerkId: `clerk_compliance_viewer_${uniqueSuffix}`,
      email: `compliance_viewer_${uniqueSuffix}@test.com`,
      name: 'Compliance Viewer User',
      createdAt: now,
      updatedAt: now,
    });

    // User with NONE authority
    const noneUser = tenantEm.create(User, {
      id: noneUserId,
      clerkId: `clerk_none_${uniqueSuffix}`,
      email: `none_${uniqueSuffix}@test.com`,
      name: 'None User',
      createdAt: now,
      updatedAt: now,
    });

    tenantEm.persist([editorUser, viewerUser, noneUser]);

    // Editor with compliance authority
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

    // Viewer with compliance authority
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

    tenantEm.persist([editorMembership, viewerMembership, noneMembership]);

    // Create tenant category linked to system category
    const tenantCategory = new TenantCategory();
    tenantCategory.name = 'My Test Category';
    tenantCategory.path = `exemption_test_${uniqueSuffix}`;
    tenantCategory.type = 'ROOT';
    tenantCategory.targetType = 'PRODUCT';
    tenantCategory.depth = 0;
    tenantCategory.isActive = true;
    tenantCategory.systemCategoryId = systemCategory.id;
    tenantCategory.linkMode = 'LIVE';

    tenantEm.persist(tenantCategory);
    await tenantEm.flush();

    tenantCategoryId = tenantCategory.id;
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

    // Clean up exemptions before each test
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);
    await tenantEm.nativeDelete(TenantRequirementExemption, {});
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

    testApp.route('/exemptions', createExemptionRouter({ orm }));
    return testApp;
  }

  describe('POST /exemptions', () => {
    it('should_create_exemption_for_exemptable_requirement', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);
      const res = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          reason: 'Product exempt under Article 5.2',
          legalReference: 'Article 5.2 exemption clause',
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as ExemptionResponse;
      expect(data.success).toBe(true);
      expect(data.data.reason).toBe('Product exempt under Article 5.2');
      expect(data.data.legalReference).toBe('Article 5.2 exemption clause');
      expect(data.data.tenantCategoryId).toBe(tenantCategoryId);
      expect(data.data.requirementId).toBe(exemptableRequirementId);
    });

    it('should_reject_exemption_for_non_exemptable_requirement', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);
      const res = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          requirementId: nonExemptableRequirementId,
          reason: 'Trying to exempt non-exemptable',
        }),
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toContain('cannot be exempted');
    });

    it('should_reject_missing_reason', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);
      const res = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          // Missing reason
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should_reject_missing_tenantCategoryId', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);
      const res = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: exemptableRequirementId,
          reason: 'Test reason',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should_reject_missing_requirementId', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);
      const res = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          reason: 'Test reason',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should_return_404_for_unknown_requirement', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);
      const res = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          requirementId: 'nonexistent_requirement_id',
          reason: 'Test reason',
        }),
      });

      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('should_return_404_for_unknown_tenant_category', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);
      const res = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId: createId(),
          requirementId: exemptableRequirementId,
          reason: 'Test reason',
        }),
      });

      expect(res.status).toBe(404);
    });

    it('should_deny_user_with_compliance_viewer_authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Viewers can view but not create exemptions
      const testApp = createTestApp(complianceViewerId);
      const res = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          reason: 'Test reason',
        }),
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.code).toBe('FORBIDDEN');
    });

    it('should_deny_user_with_no_compliance_authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          reason: 'Test reason',
        }),
      });

      expect(res.status).toBe(403);
    });

    it('should_prevent_duplicate_exemption', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);

      // Create first exemption
      const res1 = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          reason: 'First exemption',
        }),
      });

      expect(res1.status).toBe(201);

      // Try to create duplicate
      const res2 = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          reason: 'Duplicate exemption',
        }),
      });

      expect(res2.status).toBe(409);
      const data = (await res2.json()) as ErrorResponse;
      expect(data.error.code).toBe('CONFLICT');
    });
  });

  describe('GET /exemptions/:id', () => {
    it('should_return_exemption_by_id', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // First create an exemption
      const testApp = createTestApp(complianceEditorId);
      const createRes = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          reason: 'Test exemption',
        }),
      });

      const created = (await createRes.json()) as ExemptionResponse;
      const exemptionId = created.data.id;

      // Then fetch it
      const viewerApp = createTestApp(complianceViewerId);
      const res = await viewerApp.request(`/exemptions/${exemptionId}`);

      expect(res.status).toBe(200);
      const data = (await res.json()) as ExemptionResponse;
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(exemptionId);
      expect(data.data.reason).toBe('Test exemption');
    });

    it('should_return_404_for_unknown_exemption', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceViewerId);
      const res = await testApp.request(`/exemptions/${createId()}`);

      expect(res.status).toBe(404);
    });

    it('should_deny_user_with_no_compliance_authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request(`/exemptions/${createId()}`);

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /exemptions/:id', () => {
    it('should_revoke_exemption', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // First create an exemption
      const testApp = createTestApp(complianceEditorId);
      const createRes = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          reason: 'Exemption to be revoked',
        }),
      });

      const created = (await createRes.json()) as ExemptionResponse;
      const exemptionId = created.data.id;

      // Then revoke it
      const revokeRes = await testApp.request(`/exemptions/${exemptionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revocationReason: 'Exemption no longer valid',
        }),
      });

      expect(revokeRes.status).toBe(200);
      const data = (await revokeRes.json()) as ExemptionResponse;
      expect(data.data.revokedAt).toBeDefined();
      expect(data.data.revocationReason).toBe('Exemption no longer valid');
    });

    it('should_require_revocation_reason', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // First create an exemption
      const testApp = createTestApp(complianceEditorId);
      const createRes = await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          reason: 'Test exemption',
        }),
      });

      const created = (await createRes.json()) as ExemptionResponse;
      const exemptionId = created.data.id;

      // Try to revoke without reason
      const revokeRes = await testApp.request(`/exemptions/${exemptionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(revokeRes.status).toBe(400);
    });

    it('should_return_404_for_unknown_exemption', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);
      const res = await testApp.request(`/exemptions/${createId()}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revocationReason: 'Test',
        }),
      });

      expect(res.status).toBe(404);
    });

    it('should_deny_user_with_compliance_viewer_authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Viewers cannot revoke exemptions
      const testApp = createTestApp(complianceViewerId);
      const res = await testApp.request(`/exemptions/${createId()}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revocationReason: 'Test',
        }),
      });

      expect(res.status).toBe(403);
    });

    it('should_deny_user_with_no_compliance_authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request(`/exemptions/${createId()}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revocationReason: 'Test',
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /exemptions', () => {
    it('should_list_exemptions_for_tenant_category', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Create an exemption first
      const testApp = createTestApp(complianceEditorId);
      await testApp.request('/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCategoryId,
          requirementId: exemptableRequirementId,
          reason: 'Test exemption',
        }),
      });

      // List exemptions
      const viewerApp = createTestApp(complianceViewerId);
      const res = await viewerApp.request(`/exemptions?tenantCategoryId=${tenantCategoryId}`);

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean; data: ExemptionData[] };
      expect(data.success).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should_deny_user_with_no_compliance_authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request(`/exemptions?tenantCategoryId=${tenantCategoryId}`);

      expect(res.status).toBe(403);
    });
  });
});
