import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, isDatabaseAvailable, clearTestDb } from '../test-utils.js';
import { TenantProvisioner } from './tenant-provisioner.js';
import { Regulation } from '../entities/Regulation.js';
import { Requirement } from '../entities/Requirement.js';
import { TenantCategory } from '../entities/TenantCategory.js';
import { CategoryType } from '../entities/Category.js';
import { TargetType, RequirementType, RegulationStatus } from '../entities/enums/index.js';
import { ExemptionService } from './ExemptionService.js';

describe('ExemptionService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let dbAvailable = false;
  const TEST_SCHEMA = 'tenant_exemption_service_test';

  // Helper to create a regulation
  const createRegulation = (code: string, name: string): Regulation => {
    const regulation = new Regulation();
    regulation.code = code;
    regulation.name = name;
    regulation.status = RegulationStatus.ACTIVE;
    return regulation;
  };

  // Helper to create a requirement
  const createRequirement = (
    regulation: Regulation,
    code: string,
    name: string,
    allowTenantExemption: boolean = true
  ): Requirement => {
    const requirement = new Requirement();
    requirement.regulation = regulation;
    requirement.code = code;
    requirement.name = name;
    requirement.type = RequirementType.ATTRIBUTE_CHECK;
    requirement.allowTenantExemption = allowTenantExemption;
    return requirement;
  };

  // Helper to create a tenant category
  const createTenantCategory = (name: string, path: string): TenantCategory => {
    const category = new TenantCategory();
    category.name = name;
    category.path = path;
    category.type = CategoryType.LEAF;
    category.targetType = TargetType.PRODUCT;
    return category;
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
      await em.execute(`TRUNCATE TABLE "${TEST_SCHEMA}"."tenant_requirement_exemption" CASCADE`);
      await em.execute(`TRUNCATE TABLE "${TEST_SCHEMA}"."tenant_category" CASCADE`);
    } catch {
      // Tables might not exist yet
    }
  });

  // Helper to set up tenant context
  const setTenantContext = async () => {
    await em.execute(`SET search_path TO "${TEST_SCHEMA}", public`);
  };

  describe('createExemption', () => {
    it('should reject exemption when allowTenantExemption is false', async () => {
      // Create regulation and non-exemptable requirement in public schema
      const regulation = createRegulation('ROHS', 'RoHS Directive');
      em.persist(regulation);
      await em.flush();

      const requirement = createRequirement(
        regulation,
        'LEAD_THRESHOLD',
        'Lead Content Threshold',
        false // Non-exemptable requirement
      );
      em.persist(requirement);
      await em.flush();

      // Set tenant context before creating tenant entities
      await setTenantContext();

      // Create tenant category
      const tenantCategory = createTenantCategory('Electronics', 'electronics');
      em.persist(tenantCategory);
      await em.flush();

      // Create ExemptionService with tenant EntityManager
      const exemptionService = new ExemptionService(em);

      // Attempt to create exemption for non-exemptable requirement
      await expect(
        exemptionService.createExemption({
          tenantCategoryId: tenantCategory.id,
          requirementId: requirement.id,
          reason: 'Attempting to exempt a critical requirement',
          exemptedBy: 'user_test_001',
        })
      ).rejects.toThrow('cannot be exempted');
    });

    it('should allow exemption when allowTenantExemption is true', async () => {
      // Create regulation and exemptable requirement in public schema
      const regulation = createRegulation('REACH', 'REACH Regulation');
      em.persist(regulation);
      await em.flush();

      const requirement = createRequirement(
        regulation,
        'SVHC_DISCLOSURE',
        'SVHC Disclosure Requirement',
        true // Exemptable requirement
      );
      em.persist(requirement);
      await em.flush();

      // Set tenant context before creating tenant entities
      await setTenantContext();

      // Create tenant category
      const tenantCategory = createTenantCategory('Chemicals', 'chemicals');
      em.persist(tenantCategory);
      await em.flush();

      // Create ExemptionService with tenant EntityManager
      const exemptionService = new ExemptionService(em);

      // Create exemption for exemptable requirement
      const exemption = await exemptionService.createExemption({
        tenantCategoryId: tenantCategory.id,
        requirementId: requirement.id,
        reason: 'Product sold only in non-EU markets',
        exemptedBy: 'user_compliance_officer_001',
      });

      // Verify exemption was created
      expect(exemption).toBeDefined();
      expect(exemption.tenantCategory.id).toBe(tenantCategory.id);
      expect(exemption.requirementId).toBe(requirement.id);
      expect(exemption.reason).toBe('Product sold only in non-EU markets');
      expect(exemption.exemptedBy).toBe('user_compliance_officer_001');
      expect(exemption.exemptedAt).toBeInstanceOf(Date);
    });
  });
});
