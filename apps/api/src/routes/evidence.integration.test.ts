/**
 * Evidence API Integration Tests
 *
 * Tests the evidence router against a real database with proper tenant isolation,
 * authorization, and the requirement snapshot feature for audit integrity.
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
  Product,
  ProductVersion,
  VersionStatus,
  ProductStatus,
  Regulation,
  RegulationStatus,
  Requirement,
  RequirementType,
  RequirementSeverity,
  Category,
  CategoryRegulation,
  ComplianceEvidence,
} from '@eurocomply/database';
import type { MikroORM, RequirementSnapshot } from '@eurocomply/database';

// Use string literals for EvidenceType and EvidenceResult to avoid import issues
// These match the enum values in @eurocomply/database
const EvidenceType = {
  AUTO_CHECK: 'AUTO_CHECK',
  DECLARATION: 'DECLARATION',
  DOCUMENT: 'DOCUMENT',
} as const;

const EvidenceResult = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  ATTESTED: 'ATTESTED',
  INCOMPLETE: 'INCOMPLETE',
} as const;
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { createId } from '@eurocomply/core';
import type { Env } from '../app.js';

// Will be created in Task 38
import { createEvidenceRouter } from './evidence.js';

interface EvidenceData {
  id: string;
  productVersionId: string;
  requirementId?: string;
  type: EvidenceType;
  result: EvidenceResult;
  details: Record<string, unknown>;
  requirementSnapshot: RequirementSnapshot;
  recordedBy: string;
  recordedAt: string;
}

interface EvidenceResponse {
  success: boolean;
  data: EvidenceData;
  meta?: { requestId?: string; timestamp?: string };
}

interface EvidenceListResponse {
  success: boolean;
  data: EvidenceData[];
  meta?: { requestId?: string; timestamp?: string };
}

interface ErrorResponse {
  success: boolean;
  error: { code: string; message: string };
  meta?: { requestId?: string; timestamp?: string };
}

describe('Evidence API Integration', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;

  const uniqueSuffix = Date.now().toString();
  const testSchemaName = `tenant_evidence_api_${uniqueSuffix.slice(-8)}`;

  let testOrgId: string;
  let complianceEditorId: string;
  let complianceViewerId: string;
  let noneUserId: string;

  // Test data IDs
  let tenantCategoryId: string;
  let productId: string;
  let productVersionId: string;
  let requirementId: string;
  let regulationCode: string;

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
      name: `Evidence Test Org ${uniqueSuffix}`,
      slug: `evidence-test-${uniqueSuffix}`,
      schemaName: testSchemaName,
      clerkOrgId: `org_evidence_test_${uniqueSuffix}`,
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
      name: `Evidence Test Category ${uniqueSuffix}`,
      path: `evidence_test_${uniqueSuffix}`,
    });

    regulationCode = `EVID_REG_${uniqueSuffix}`;
    const regulation = em.create(Regulation, {
      code: regulationCode,
      name: 'Evidence Test Regulation',
      status: RegulationStatus.ACTIVE,
    });

    await em.persistAndFlush([systemCategory, regulation]);

    // Create requirement
    const requirement = em.create(Requirement, {
      regulation,
      code: `RECYCLED_MIN_${uniqueSuffix}`,
      name: 'Minimum Recycled Content',
      type: RequirementType.ATTRIBUTE_CHECK,
      severity: RequirementSeverity.BLOCKER,
      allowTenantExemption: true,
      handlerConfig: {
        attributeCode: 'recycled_content_pct',
        operator: '>=',
        threshold: 25,
      },
    });

    // Create category-regulation mapping
    const mapping = em.create(CategoryRegulation, {
      category: systemCategory,
      regulation,
      addedBy: 'test',
    });

    await em.persistAndFlush([requirement, mapping]);
    requirementId = requirement.id;

    // Create tenant data
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);

    complianceEditorId = createId();
    complianceViewerId = createId();
    noneUserId = createId();

    // User with compliance:EDITOR (can record evidence)
    const editorUser = tenantEm.create(User, {
      id: complianceEditorId,
      clerkId: `clerk_compliance_editor_${uniqueSuffix}`,
      email: `compliance_editor_${uniqueSuffix}@test.com`,
      name: 'Compliance Editor User',
      createdAt: now,
      updatedAt: now,
    });

    // User with compliance:VIEWER (can only view evidence)
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
    tenantCategory.path = `evidence_test_${uniqueSuffix}`;
    tenantCategory.type = 'ROOT';
    tenantCategory.targetType = 'PRODUCT';
    tenantCategory.depth = 0;
    tenantCategory.isActive = true;
    tenantCategory.systemCategoryId = systemCategory.id;
    tenantCategory.linkMode = 'LIVE';

    tenantEm.persist(tenantCategory);
    await tenantEm.flush();

    tenantCategoryId = tenantCategory.id;

    // Create a product and version for testing
    const product = tenantEm.create(Product, {
      id: createId(),
      name: `Test Product ${uniqueSuffix}`,
      category: tenantCategory,
      status: ProductStatus.DRAFT,
    });

    tenantEm.persist(product);
    await tenantEm.flush();

    productId = product.id;

    const productVersion = tenantEm.create(ProductVersion, {
      id: createId(),
      product,
      version: '1.0.0',
      status: VersionStatus.DRAFT,
      attributeValues: {},
      createdBy: complianceEditorId,
    });

    tenantEm.persist(productVersion);
    await tenantEm.flush();

    productVersionId = productVersion.id;
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

    // Clean up evidence before each test
    const tenantEm = orm.em.fork({ schema: testSchemaName });
    await tenantEm.execute(`SET search_path TO "${testSchemaName}", public`);
    await tenantEm.nativeDelete(ComplianceEvidence, {});
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

    testApp.route('/evidence', createEvidenceRouter({ orm }));
    return testApp;
  }

  describe('POST /evidence', () => {
    it('should_record_auto_check_evidence_with_snapshot', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);
      const res = await testApp.request('/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productVersionId,
          requirementId,
          type: EvidenceType.AUTO_CHECK,
          result: EvidenceResult.PASS,
          details: {
            actualValue: 30,
            threshold: 25,
            operator: '>=',
          },
          requirementSnapshot: {
            code: `RECYCLED_MIN_${uniqueSuffix}`,
            name: 'Minimum Recycled Content',
            type: RequirementType.ATTRIBUTE_CHECK,
            severity: RequirementSeverity.BLOCKER,
            regulationCode,
            regulationName: 'Evidence Test Regulation',
            handlerConfig: { operator: '>=', threshold: 25 },
            snapshotAt: new Date().toISOString(),
          },
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as EvidenceResponse;
      expect(data.success).toBe(true);
      expect(data.data.requirementSnapshot.code).toBe(`RECYCLED_MIN_${uniqueSuffix}`);
      expect(data.data.result).toBe(EvidenceResult.PASS);
      expect(data.data.type).toBe(EvidenceType.AUTO_CHECK);
      expect(data.data.productVersionId).toBe(productVersionId);
    });

    it('should_record_declaration_evidence', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);
      const res = await testApp.request('/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productVersionId,
          requirementId,
          type: EvidenceType.DECLARATION,
          result: EvidenceResult.ATTESTED,
          details: {
            answer: 'No',
            justification: 'Product uses alternative testing methods',
          },
          requirementSnapshot: {
            code: 'ANIMAL_TEST_DECL',
            name: 'Animal Testing Declaration',
            type: RequirementType.DECLARATION,
            severity: RequirementSeverity.BLOCKER,
            regulationCode,
            regulationName: 'Evidence Test Regulation',
            handlerConfig: {
              question: 'Has product been tested on animals?',
              acceptedAnswers: ['No', 'N/A'],
            },
            snapshotAt: new Date().toISOString(),
          },
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as EvidenceResponse;
      expect(data.success).toBe(true);
      expect(data.data.type).toBe(EvidenceType.DECLARATION);
      expect(data.data.result).toBe(EvidenceResult.ATTESTED);
      expect(data.data.details.answer).toBe('No');
    });

    it('should_reject_missing_snapshot', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);
      const res = await testApp.request('/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productVersionId,
          requirementId,
          type: EvidenceType.AUTO_CHECK,
          result: EvidenceResult.PASS,
          details: {
            actualValue: 30,
            threshold: 25,
          },
          // Missing requirementSnapshot - should fail
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should_reject_missing_productVersionId', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceEditorId);
      const res = await testApp.request('/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing productVersionId
          requirementId,
          type: EvidenceType.AUTO_CHECK,
          result: EvidenceResult.PASS,
          details: { actualValue: 30 },
          requirementSnapshot: {
            code: 'TEST_REQ',
            name: 'Test',
            type: RequirementType.ATTRIBUTE_CHECK,
            severity: RequirementSeverity.BLOCKER,
            regulationCode,
            regulationName: 'Test',
            snapshotAt: new Date().toISOString(),
          },
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should_deny_user_with_compliance_viewer_authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Viewers can view but not record evidence
      const testApp = createTestApp(complianceViewerId);
      const res = await testApp.request('/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productVersionId,
          requirementId,
          type: EvidenceType.AUTO_CHECK,
          result: EvidenceResult.PASS,
          details: { actualValue: 30 },
          requirementSnapshot: {
            code: 'TEST_REQ',
            name: 'Test',
            type: RequirementType.ATTRIBUTE_CHECK,
            severity: RequirementSeverity.BLOCKER,
            regulationCode,
            regulationName: 'Test',
            snapshotAt: new Date().toISOString(),
          },
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
      const res = await testApp.request('/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productVersionId,
          requirementId,
          type: EvidenceType.AUTO_CHECK,
          result: EvidenceResult.PASS,
          details: { actualValue: 30 },
          requirementSnapshot: {
            code: 'TEST_REQ',
            name: 'Test',
            type: RequirementType.ATTRIBUTE_CHECK,
            severity: RequirementSeverity.BLOCKER,
            regulationCode,
            regulationName: 'Test',
            snapshotAt: new Date().toISOString(),
          },
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /evidence/:productVersionId', () => {
    it('should_return_all_evidence_for_product_version', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // First create some evidence
      const testApp = createTestApp(complianceEditorId);

      // Create first evidence
      await testApp.request('/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productVersionId,
          requirementId,
          type: EvidenceType.AUTO_CHECK,
          result: EvidenceResult.PASS,
          details: { actualValue: 30, threshold: 25 },
          requirementSnapshot: {
            code: 'REQ_1',
            name: 'Requirement 1',
            type: RequirementType.ATTRIBUTE_CHECK,
            severity: RequirementSeverity.BLOCKER,
            regulationCode,
            regulationName: 'Test Regulation',
            snapshotAt: new Date().toISOString(),
          },
        }),
      });

      // Create second evidence
      await testApp.request('/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productVersionId,
          requirementId,
          type: EvidenceType.DECLARATION,
          result: EvidenceResult.ATTESTED,
          details: { answer: 'Yes', justification: 'Confirmed' },
          requirementSnapshot: {
            code: 'REQ_2',
            name: 'Requirement 2',
            type: RequirementType.DECLARATION,
            severity: RequirementSeverity.WARNING,
            regulationCode,
            regulationName: 'Test Regulation',
            snapshotAt: new Date().toISOString(),
          },
        }),
      });

      // Fetch all evidence for the product version (viewer can read)
      const viewerApp = createTestApp(complianceViewerId);
      const res = await viewerApp.request(`/evidence/${productVersionId}`);

      expect(res.status).toBe(200);
      const data = (await res.json()) as EvidenceListResponse;
      expect(data.success).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(2);

      // Verify both evidence records are returned
      const codes = data.data.map((e) => e.requirementSnapshot.code);
      expect(codes).toContain('REQ_1');
      expect(codes).toContain('REQ_2');
    });

    it('should_return_empty_array_for_product_version_with_no_evidence', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(complianceViewerId);
      const res = await testApp.request(`/evidence/${productVersionId}`);

      expect(res.status).toBe(200);
      const data = (await res.json()) as EvidenceListResponse;
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should_deny_user_with_no_compliance_authority', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const testApp = createTestApp(noneUserId);
      const res = await testApp.request(`/evidence/${productVersionId}`);

      expect(res.status).toBe(403);
    });
  });
});
