import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { Category, CategoryType } from '../entities/Category.js';
import { Regulation } from '../entities/Regulation.js';
import { Requirement } from '../entities/Requirement.js';
import { CategoryRegulation } from '../entities/CategoryRegulation.js';
import { TenantCategory } from '../entities/TenantCategory.js';
import { ComplianceStackResolver } from './ComplianceStackResolver.js';
import { RegulationStatus } from '../entities/enums/RegulationStatus.js';
import { RequirementType } from '../entities/enums/RequirementType.js';
import { RequirementSeverity } from '../entities/enums/RequirementSeverity.js';
import { TargetType } from '../entities/enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable, clearTestDb } from '../test-utils.js';
import { TenantProvisioner } from './tenant-provisioner.js';

/**
 * Expected result interface for the revised ComplianceStackResolver.
 *
 * The revised resolver uses the new CategoryRegulation junction table
 * and returns regulations with their requirements.
 */
export interface ComplianceStackResultRevised {
  tenantCategoryId: string;
  regulations: Array<{
    regulationId: string;
    regulationCode: string;
    source: 'SYSTEM' | 'TENANT';
    requirements: Array<{
      requirementId: string;
      requirementCode: string;
      type: RequirementType;
      severity: RequirementSeverity;
      status: 'ACTIVE' | 'EXEMPTED';
    }>;
  }>;
}

describe('ComplianceStackResolver (Revised)', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let dbAvailable = false;
  const TEST_SCHEMA = 'tenant_csr_revised_test';

  // Helper to create a system category
  const createSystemCategory = (
    name: string,
    path: string,
    options?: { parent?: Category; type?: CategoryType }
  ): Category => {
    const category = new Category();
    category.name = name;
    category.path = path;
    category.type = options?.type ?? CategoryType.LEAF;
    category.targetType = TargetType.PRODUCT;
    if (options?.parent) {
      category.parent = options.parent;
      category.depth = options.parent.depth + 1;
    }
    return category;
  };

  // Helper to create a regulation
  const createRegulation = (
    code: string,
    options?: { status?: RegulationStatus; name?: string }
  ): Regulation => {
    const regulation = new Regulation();
    regulation.code = code;
    regulation.name = options?.name ?? `${code} Regulation`;
    regulation.status = options?.status ?? RegulationStatus.ACTIVE;
    return regulation;
  };

  // Helper to create a requirement
  const createRequirement = (
    regulation: Regulation,
    code: string,
    options?: {
      type?: RequirementType;
      severity?: RequirementSeverity;
      name?: string;
    }
  ): Requirement => {
    const requirement = new Requirement();
    requirement.code = code;
    requirement.name = options?.name ?? `${code} Requirement`;
    requirement.type = options?.type ?? RequirementType.DECLARATION;
    requirement.severity = options?.severity ?? RequirementSeverity.WARNING;
    requirement.regulation = regulation;
    requirement.handlerConfig = { question: `${code}?` };
    return requirement;
  };

  // Helper to create a tenant category
  const createTenantCategory = (
    name: string,
    path: string,
    systemCategoryId?: string
  ): TenantCategory => {
    const category = new TenantCategory();
    category.name = name;
    category.path = path;
    category.type = CategoryType.LEAF;
    category.targetType = TargetType.PRODUCT;
    if (systemCategoryId) {
      category.systemCategoryId = systemCategoryId;
    }
    return category;
  };

  // Helper to create category-regulation mapping
  const createCategoryRegulation = (
    category: Category,
    regulation: Regulation,
    addedBy?: string
  ): CategoryRegulation => {
    const mapping = new CategoryRegulation();
    mapping.category = category;
    mapping.regulation = regulation;
    mapping.addedBy = addedBy ?? 'system';
    return mapping;
  };

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      orm = await setupTestDb();
      const provisioner = new TenantProvisioner(orm);
      await provisioner.provisionTenant(TEST_SCHEMA);
    }
  });

  afterAll(async () => {
    if (dbAvailable && orm) {
      try {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
      } catch {
        // Ignore
      }
      await teardownTestDb();
    }
  });

  beforeEach(async (context) => {
    if (!dbAvailable) {
      context.skip();
      return;
    }
    em = orm.em.fork();

    // Reset search_path to public before each test
    await em.execute(`SET search_path TO public`);

    await clearTestDb(em);

    // Clear tenant tables using fully qualified names
    try {
      await em.execute(`TRUNCATE TABLE "${TEST_SCHEMA}"."tenant_category_regulatory_list" CASCADE`);
      await em.execute(`TRUNCATE TABLE "${TEST_SCHEMA}"."tenant_category" CASCADE`);
    } catch {
      // Tables might not exist yet
    }
  });

  // Helper to set up tenant context
  const setTenantContext = async () => {
    await em.execute(`SET search_path TO "${TEST_SCHEMA}", public`);
  };

  describe('resolve via CategoryRegulation junction', () => {
    it('should_return_system_baseline_regulations', async () => {
      // Create system category
      const systemCategory = createSystemCategory('Electronics', 'electronics');
      em.persist(systemCategory);

      // Create ACTIVE regulations
      const regulation1 = createRegulation('ROHS', { status: RegulationStatus.ACTIVE });
      const regulation2 = createRegulation('REACH', { status: RegulationStatus.ACTIVE });
      em.persist(regulation1);
      em.persist(regulation2);
      await em.flush();

      // Create requirements for regulations
      const req1 = createRequirement(regulation1, 'ROHS_VOLTAGE', {
        type: RequirementType.ATTRIBUTE_CHECK,
        severity: RequirementSeverity.BLOCKER,
      });
      const req2 = createRequirement(regulation1, 'ROHS_LEAD', {
        type: RequirementType.SUBSTANCE_SCREEN,
        severity: RequirementSeverity.BLOCKER,
      });
      const req3 = createRequirement(regulation2, 'REACH_SVHC', {
        type: RequirementType.SUBSTANCE_SCREEN,
        severity: RequirementSeverity.WARNING,
      });
      em.persist([req1, req2, req3]);
      await em.flush();

      // Create CategoryRegulation mappings
      const catReg1 = createCategoryRegulation(systemCategory, regulation1);
      const catReg2 = createCategoryRegulation(systemCategory, regulation2);
      em.persist([catReg1, catReg2]);
      await em.flush();

      // Set tenant context
      await setTenantContext();

      // Create tenant category linked to system category
      const tenantCategory = createTenantCategory(
        'My Electronics',
        'my.electronics',
        systemCategory.id
      );
      em.persist(tenantCategory);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      // Assert the result contains regulations from CategoryRegulation junction
      expect(result.tenantCategoryId).toBe(tenantCategory.id);

      // The revised resolver should return regulations with requirements
      // This test will fail until the resolver is updated to use CategoryRegulation
      const resultAsRevised = result as unknown as ComplianceStackResultRevised;
      expect(resultAsRevised.regulations).toBeDefined();
      expect(resultAsRevised.regulations).toHaveLength(2);

      // Find ROHS regulation
      const rohsReg = resultAsRevised.regulations.find(r => r.regulationCode === 'ROHS');
      expect(rohsReg).toBeDefined();
      expect(rohsReg?.source).toBe('SYSTEM');
      expect(rohsReg?.requirements).toHaveLength(2);
      expect(rohsReg?.requirements.some(r => r.requirementCode === 'ROHS_VOLTAGE')).toBe(true);
      expect(rohsReg?.requirements.some(r => r.requirementCode === 'ROHS_LEAD')).toBe(true);

      // Find REACH regulation
      const reachReg = resultAsRevised.regulations.find(r => r.regulationCode === 'REACH');
      expect(reachReg).toBeDefined();
      expect(reachReg?.source).toBe('SYSTEM');
      expect(reachReg?.requirements).toHaveLength(1);
      expect(reachReg?.requirements[0]?.requirementCode).toBe('REACH_SVHC');
    });

    it('should_not_include_draft_regulations', async () => {
      // Create system category
      const systemCategory = createSystemCategory('Toys', 'toys');
      em.persist(systemCategory);

      // Create ACTIVE and DRAFT regulations
      const activeRegulation = createRegulation('TOY_SAFETY', {
        status: RegulationStatus.ACTIVE,
      });
      const draftRegulation = createRegulation('TOY_CHEMICAL', {
        status: RegulationStatus.DRAFT,
      });
      const archivedRegulation = createRegulation('OLD_TOY_REG', {
        status: RegulationStatus.ARCHIVED,
      });
      em.persist([activeRegulation, draftRegulation, archivedRegulation]);
      await em.flush();

      // Create requirements
      const activeReq = createRequirement(activeRegulation, 'SAFETY_CHECK', {
        severity: RequirementSeverity.BLOCKER,
      });
      const draftReq = createRequirement(draftRegulation, 'CHEMICAL_CHECK', {
        severity: RequirementSeverity.WARNING,
      });
      const archivedReq = createRequirement(archivedRegulation, 'OLD_CHECK', {
        severity: RequirementSeverity.INFO,
      });
      em.persist([activeReq, draftReq, archivedReq]);
      await em.flush();

      // Link ALL regulations to category (including draft and archived)
      const catReg1 = createCategoryRegulation(systemCategory, activeRegulation);
      const catReg2 = createCategoryRegulation(systemCategory, draftRegulation);
      const catReg3 = createCategoryRegulation(systemCategory, archivedRegulation);
      em.persist([catReg1, catReg2, catReg3]);
      await em.flush();

      // Set tenant context
      await setTenantContext();

      // Create tenant category
      const tenantCategory = createTenantCategory('My Toys', 'my.toys', systemCategory.id);
      em.persist(tenantCategory);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      // The revised resolver should only include ACTIVE regulations
      const resultAsRevised = result as unknown as ComplianceStackResultRevised;
      expect(resultAsRevised.regulations).toBeDefined();
      expect(resultAsRevised.regulations).toHaveLength(1);
      expect(resultAsRevised.regulations[0]?.regulationCode).toBe('TOY_SAFETY');

      // DRAFT and ARCHIVED regulations should NOT be included
      expect(
        resultAsRevised.regulations.some(r => r.regulationCode === 'TOY_CHEMICAL')
      ).toBe(false);
      expect(
        resultAsRevised.regulations.some(r => r.regulationCode === 'OLD_TOY_REG')
      ).toBe(false);
    });

    it('should_return_empty_when_no_system_category', async () => {
      // Set tenant context
      await setTenantContext();

      // Create tenant category WITHOUT systemCategoryId (custom category)
      const tenantCategory = createTenantCategory('Custom Category', 'custom.category');
      // Note: systemCategoryId is not set
      em.persist(tenantCategory);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      // The revised resolver should return empty regulations array
      const resultAsRevised = result as unknown as ComplianceStackResultRevised;
      expect(resultAsRevised.regulations).toBeDefined();
      expect(resultAsRevised.regulations).toHaveLength(0);
    });

    it('should_inherit_regulations_from_parent_categories_via_ltree', async () => {
      // Create category hierarchy using LTREE paths:
      // - electronics (root)
      //   - electronics.consumer (branch)
      //     - electronics.consumer.phones (leaf)

      const rootCategory = createSystemCategory('Electronics', 'electronics', {
        type: CategoryType.ROOT,
      });
      rootCategory.depth = 0;
      em.persist(rootCategory);
      await em.flush();

      const branchCategory = createSystemCategory('Consumer Electronics', 'electronics.consumer', {
        parent: rootCategory,
        type: CategoryType.BRANCH,
      });
      em.persist(branchCategory);
      await em.flush();

      const leafCategory = createSystemCategory('Phones', 'electronics.consumer.phones', {
        parent: branchCategory,
        type: CategoryType.LEAF,
      });
      em.persist(leafCategory);
      await em.flush();

      // Create regulations at different levels
      const rootRegulation = createRegulation('WEEE', { status: RegulationStatus.ACTIVE });
      const branchRegulation = createRegulation('ROHS', { status: RegulationStatus.ACTIVE });
      const leafRegulation = createRegulation('BATTERY_REG', { status: RegulationStatus.ACTIVE });
      em.persist([rootRegulation, branchRegulation, leafRegulation]);
      await em.flush();

      // Create requirements
      const weeeReq = createRequirement(rootRegulation, 'WEEE_DISPOSAL', {
        type: RequirementType.DECLARATION,
        severity: RequirementSeverity.WARNING,
      });
      const rohsReq = createRequirement(branchRegulation, 'ROHS_SUBSTANCES', {
        type: RequirementType.SUBSTANCE_SCREEN,
        severity: RequirementSeverity.BLOCKER,
      });
      const batteryReq = createRequirement(leafRegulation, 'BATTERY_CAPACITY', {
        type: RequirementType.ATTRIBUTE_CHECK,
        severity: RequirementSeverity.INFO,
      });
      em.persist([weeeReq, rohsReq, batteryReq]);
      await em.flush();

      // Link regulations to categories at different levels
      const catReg1 = createCategoryRegulation(rootCategory, rootRegulation);
      const catReg2 = createCategoryRegulation(branchCategory, branchRegulation);
      const catReg3 = createCategoryRegulation(leafCategory, leafRegulation);
      em.persist([catReg1, catReg2, catReg3]);
      await em.flush();

      // Set tenant context
      await setTenantContext();

      // Create tenant category linked to the LEAF system category
      const tenantCategory = createTenantCategory(
        'My Phones',
        'my.phones',
        leafCategory.id
      );
      em.persist(tenantCategory);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      // The revised resolver should inherit regulations from ALL ancestor categories
      // via LTREE path matching (electronics <@ electronics.consumer.phones)
      const resultAsRevised = result as unknown as ComplianceStackResultRevised;
      expect(resultAsRevised.regulations).toBeDefined();

      // Should have 3 regulations: WEEE (root), ROHS (branch), BATTERY_REG (leaf)
      expect(resultAsRevised.regulations).toHaveLength(3);

      // Verify all three regulations are present
      const regulationCodes = resultAsRevised.regulations.map(r => r.regulationCode);
      expect(regulationCodes).toContain('WEEE');
      expect(regulationCodes).toContain('ROHS');
      expect(regulationCodes).toContain('BATTERY_REG');

      // Verify WEEE (from root) has its requirement
      const weeeReg = resultAsRevised.regulations.find(r => r.regulationCode === 'WEEE');
      expect(weeeReg?.requirements).toHaveLength(1);
      expect(weeeReg?.requirements[0]?.requirementCode).toBe('WEEE_DISPOSAL');

      // Verify ROHS (from branch) has its requirement
      const rohsReg = resultAsRevised.regulations.find(r => r.regulationCode === 'ROHS');
      expect(rohsReg?.requirements).toHaveLength(1);
      expect(rohsReg?.requirements[0]?.requirementCode).toBe('ROHS_SUBSTANCES');

      // Verify BATTERY_REG (from leaf) has its requirement
      const batteryReg = resultAsRevised.regulations.find(r => r.regulationCode === 'BATTERY_REG');
      expect(batteryReg?.requirements).toHaveLength(1);
      expect(batteryReg?.requirements[0]?.requirementCode).toBe('BATTERY_CAPACITY');
    });

    it('should_not_duplicate_regulations_when_linked_at_multiple_levels', async () => {
      // Create category hierarchy
      const rootCategory = createSystemCategory('Devices', 'devices', {
        type: CategoryType.ROOT,
      });
      rootCategory.depth = 0;
      em.persist(rootCategory);
      await em.flush();

      const leafCategory = createSystemCategory('Smart Devices', 'devices.smart', {
        parent: rootCategory,
        type: CategoryType.LEAF,
      });
      em.persist(leafCategory);
      await em.flush();

      // Create a regulation
      const regulation = createRegulation('COMMON_REG', { status: RegulationStatus.ACTIVE });
      em.persist(regulation);
      await em.flush();

      // Create requirements
      const req = createRequirement(regulation, 'COMMON_CHECK', {
        severity: RequirementSeverity.WARNING,
      });
      em.persist(req);
      await em.flush();

      // Link SAME regulation to BOTH root and leaf categories
      const catReg1 = createCategoryRegulation(rootCategory, regulation);
      const catReg2 = createCategoryRegulation(leafCategory, regulation);
      em.persist([catReg1, catReg2]);
      await em.flush();

      // Set tenant context
      await setTenantContext();

      // Create tenant category linked to leaf
      const tenantCategory = createTenantCategory(
        'My Smart Devices',
        'my.smart.devices',
        leafCategory.id
      );
      em.persist(tenantCategory);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      // The regulation should appear only ONCE (no duplicates)
      const resultAsRevised = result as unknown as ComplianceStackResultRevised;
      expect(resultAsRevised.regulations).toBeDefined();
      expect(resultAsRevised.regulations).toHaveLength(1);
      expect(resultAsRevised.regulations[0]?.regulationCode).toBe('COMMON_REG');
    });
  });

  describe('requirement status handling', () => {
    it('should_default_requirement_status_to_active', async () => {
      // Create system category
      const systemCategory = createSystemCategory('Appliances', 'appliances');
      em.persist(systemCategory);

      // Create regulation and requirement
      const regulation = createRegulation('ENERGY_LABEL', { status: RegulationStatus.ACTIVE });
      em.persist(regulation);
      await em.flush();

      const req = createRequirement(regulation, 'ENERGY_CLASS', {
        type: RequirementType.ATTRIBUTE_CHECK,
        severity: RequirementSeverity.BLOCKER,
      });
      em.persist(req);
      await em.flush();

      // Link regulation to category
      const catReg = createCategoryRegulation(systemCategory, regulation);
      em.persist(catReg);
      await em.flush();

      // Set tenant context
      await setTenantContext();

      // Create tenant category
      const tenantCategory = createTenantCategory(
        'My Appliances',
        'my.appliances',
        systemCategory.id
      );
      em.persist(tenantCategory);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      const resultAsRevised = result as unknown as ComplianceStackResultRevised;
      expect(resultAsRevised.regulations).toHaveLength(1);

      const energyReg = resultAsRevised.regulations[0];
      expect(energyReg?.requirements).toHaveLength(1);
      expect(energyReg?.requirements[0]?.status).toBe('ACTIVE');
    });
  });
});
