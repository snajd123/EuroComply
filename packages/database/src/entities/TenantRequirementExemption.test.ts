import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';
import { TenantRequirementExemption } from './TenantRequirementExemption.js';
import { TenantCategory } from './TenantCategory.js';
import { CategoryType } from './Category.js';
import { TargetType } from './enums/index.js';
import { TenantProvisioner } from '../services/tenant-provisioner.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('TenantRequirementExemption entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let dbAvailable = false;
  const TEST_SCHEMA = 'tenant_exemption_test';

  // Helper to create a test tenant category
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
    await em.execute(`SET search_path TO "${TEST_SCHEMA}", public`);
    // Clear tenant tables
    try {
      await em.execute(`TRUNCATE TABLE "${TEST_SCHEMA}"."tenant_requirement_exemption" CASCADE`);
      await em.execute(`TRUNCATE TABLE "${TEST_SCHEMA}"."tenant_category" CASCADE`);
    } catch {
      // Tables might not exist yet
    }
  });

  describe('Creation tests', () => {
    it('should create an exemption with reason and legal reference', async () => {
      const category = createTenantCategory('Electronics', 'electronics');
      em.persist(category);
      await em.flush();

      const exemption = new TenantRequirementExemption();
      exemption.tenantCategory = category;
      exemption.requirementId = 'req_voltage_check_001';
      exemption.reason = 'Product operates on battery power only, not connected to mains voltage';
      exemption.legalReference = 'EU Low Voltage Directive 2014/35/EU, Article 2(2)(a)';
      exemption.exemptedBy = 'user_compliance_officer_001';

      em.persist(exemption);
      await em.flush();
      em.clear();

      const found = await em.findOne(TenantRequirementExemption, { id: exemption.id }, {
        populate: ['tenantCategory'],
      });
      expect(found).toBeDefined();
      expect(found?.tenantCategory.id).toBe(category.id);
      expect(found?.requirementId).toBe('req_voltage_check_001');
      expect(found?.reason).toBe('Product operates on battery power only, not connected to mains voltage');
      expect(found?.legalReference).toBe('EU Low Voltage Directive 2014/35/EU, Article 2(2)(a)');
      expect(found?.exemptedBy).toBe('user_compliance_officer_001');
      expect(found?.exemptedAt).toBeDefined();
      expect(found?.exemptedAt).toBeInstanceOf(Date);
      // Revocation fields should be null by default
      expect(found?.revokedAt).toBeNull();
      expect(found?.revokedBy).toBeNull();
      expect(found?.revocationReason).toBeNull();
    });

    it('should create an exemption without optional legal reference', async () => {
      const category = createTenantCategory('Toys', 'toys');
      em.persist(category);
      await em.flush();

      const exemption = new TenantRequirementExemption();
      exemption.tenantCategory = category;
      exemption.requirementId = 'req_toy_safety_001';
      exemption.reason = 'Product is for adult collectors only, not intended for children';
      exemption.exemptedBy = 'user_admin_001';

      em.persist(exemption);
      await em.flush();
      em.clear();

      const found = await em.findOne(TenantRequirementExemption, { id: exemption.id });
      expect(found).toBeDefined();
      expect(found?.reason).toBe('Product is for adult collectors only, not intended for children');
      expect(found?.legalReference).toBeNull();
    });

    it('should reject duplicate exemption for same category+requirement pair', async () => {
      const category = createTenantCategory('Medical Devices', 'medical');
      em.persist(category);
      await em.flush();

      const exemption1 = new TenantRequirementExemption();
      exemption1.tenantCategory = category;
      exemption1.requirementId = 'req_mdr_class_i_001';
      exemption1.reason = 'Device is for general wellness only';
      exemption1.exemptedBy = 'user_compliance_officer_001';

      em.persist(exemption1);
      await em.flush();

      const exemption2 = new TenantRequirementExemption();
      exemption2.tenantCategory = category;
      exemption2.requirementId = 'req_mdr_class_i_001'; // Same category + requirement
      exemption2.reason = 'Different reason for same exemption';
      exemption2.exemptedBy = 'user_admin_001';

      em.persist(exemption2);
      await expect(em.flush()).rejects.toThrow();
    });

    it('should allow same requirement exempted for different categories', async () => {
      const category1 = createTenantCategory('Electronics', 'electronics');
      const category2 = createTenantCategory('Appliances', 'appliances');
      em.persist(category1);
      em.persist(category2);
      await em.flush();

      const exemption1 = new TenantRequirementExemption();
      exemption1.tenantCategory = category1;
      exemption1.requirementId = 'req_energy_label_001';
      exemption1.reason = 'Battery-powered devices exempt';
      exemption1.exemptedBy = 'user_admin_001';

      const exemption2 = new TenantRequirementExemption();
      exemption2.tenantCategory = category2;
      exemption2.requirementId = 'req_energy_label_001'; // Same requirement, different category
      exemption2.reason = 'Manual appliances exempt';
      exemption2.exemptedBy = 'user_admin_001';

      em.persist(exemption1);
      em.persist(exemption2);
      await em.flush();
      em.clear();

      const exemptions = await em.find(TenantRequirementExemption, { requirementId: 'req_energy_label_001' });
      expect(exemptions).toHaveLength(2);
    });

    it('should allow same category with different requirement exemptions', async () => {
      const category = createTenantCategory('Food Products', 'food');
      em.persist(category);
      await em.flush();

      const exemption1 = new TenantRequirementExemption();
      exemption1.tenantCategory = category;
      exemption1.requirementId = 'req_allergen_label_001';
      exemption1.reason = 'Single-ingredient product';
      exemption1.exemptedBy = 'user_admin_001';

      const exemption2 = new TenantRequirementExemption();
      exemption2.tenantCategory = category;
      exemption2.requirementId = 'req_nutrition_label_001'; // Same category, different requirement
      exemption2.reason = 'Exempt food category';
      exemption2.exemptedBy = 'user_admin_001';

      em.persist(exemption1);
      em.persist(exemption2);
      await em.flush();
      em.clear();

      const exemptions = await em.find(TenantRequirementExemption, { tenantCategory: category.id });
      expect(exemptions).toHaveLength(2);
    });
  });

  describe('Revocation tests', () => {
    it('should allow revoking an exemption with all revocation fields', async () => {
      const category = createTenantCategory('Chemicals', 'chemicals');
      em.persist(category);
      await em.flush();

      // Create initial exemption
      const exemption = new TenantRequirementExemption();
      exemption.tenantCategory = category;
      exemption.requirementId = 'req_reach_svhc_001';
      exemption.reason = 'Substance below threshold in product';
      exemption.exemptedBy = 'user_compliance_officer_001';

      em.persist(exemption);
      await em.flush();

      // Now revoke the exemption
      const revokedAt = new Date('2024-12-15T14:30:00Z');
      exemption.revokedAt = revokedAt;
      exemption.revokedBy = 'user_senior_compliance_001';
      exemption.revocationReason = 'Regulation updated - threshold lowered, exemption no longer applicable';

      await em.flush();
      em.clear();

      const found = await em.findOne(TenantRequirementExemption, { id: exemption.id });
      expect(found).toBeDefined();
      expect(found?.revokedAt).toEqual(revokedAt);
      expect(found?.revokedBy).toBe('user_senior_compliance_001');
      expect(found?.revocationReason).toBe('Regulation updated - threshold lowered, exemption no longer applicable');
      // Original exemption data should still be preserved
      expect(found?.reason).toBe('Substance below threshold in product');
      expect(found?.exemptedBy).toBe('user_compliance_officer_001');
    });

    it('should allow revocation without a reason (reason is optional)', async () => {
      const category = createTenantCategory('Textiles', 'textiles');
      em.persist(category);
      await em.flush();

      const exemption = new TenantRequirementExemption();
      exemption.tenantCategory = category;
      exemption.requirementId = 'req_azo_dyes_001';
      exemption.reason = 'Natural dyes only used';
      exemption.exemptedBy = 'user_admin_001';

      em.persist(exemption);
      await em.flush();

      // Revoke without providing a reason
      exemption.revokedAt = new Date();
      exemption.revokedBy = 'user_admin_002';
      // revocationReason left as null

      await em.flush();
      em.clear();

      const found = await em.findOne(TenantRequirementExemption, { id: exemption.id });
      expect(found).toBeDefined();
      expect(found?.revokedAt).toBeDefined();
      expect(found?.revokedBy).toBe('user_admin_002');
      expect(found?.revocationReason).toBeNull();
    });

    it('should preserve exemptedAt timestamp after revocation', async () => {
      const category = createTenantCategory('Packaging', 'packaging');
      em.persist(category);
      await em.flush();

      const exemptedAt = new Date('2024-01-15T10:00:00Z');
      const exemption = new TenantRequirementExemption();
      exemption.tenantCategory = category;
      exemption.requirementId = 'req_packaging_waste_001';
      exemption.reason = 'Biodegradable packaging';
      exemption.exemptedBy = 'user_admin_001';
      exemption.exemptedAt = exemptedAt;

      em.persist(exemption);
      await em.flush();

      // Revoke after some time
      const revokedAt = new Date('2024-06-15T10:00:00Z');
      exemption.revokedAt = revokedAt;
      exemption.revokedBy = 'user_admin_002';
      exemption.revocationReason = 'Policy change';

      await em.flush();
      em.clear();

      const found = await em.findOne(TenantRequirementExemption, { id: exemption.id });
      expect(found).toBeDefined();
      // exemptedAt should be preserved
      expect(found?.exemptedAt).toEqual(exemptedAt);
      expect(found?.revokedAt).toEqual(revokedAt);
    });
  });
});
