import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';
import { TenantCategoryRegulatoryList } from './TenantCategoryRegulatoryList.js';
import { TenantCategory } from './TenantCategory.js';
import { CategoryType } from './Category.js';
import { TargetType, ListRequirement } from './enums/index.js';
import { RegulationSource } from './enums/RegulationSource.js';
import { TenantProvisioner } from '../services/tenant-provisioner.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('TenantCategoryRegulatoryList entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let dbAvailable = false;
  const TEST_SCHEMA = 'tenant_tcrl_test';

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
      await em.execute(`TRUNCATE TABLE "${TEST_SCHEMA}"."tenant_category_regulatory_list" CASCADE`);
      await em.execute(`TRUNCATE TABLE "${TEST_SCHEMA}"."tenant_category" CASCADE`);
    } catch {
      // Tables might not exist yet
    }
  });

  it('should create a tenant-added regulatory list mapping (source: TENANT_ADDED)', async () => {
    const category = createTenantCategory('Custom Electronics', 'custom.electronics');
    em.persist(category);
    await em.flush();

    const mapping = new TenantCategoryRegulatoryList();
    mapping.tenantCategory = category;
    mapping.regulatoryListId = 'rl_custom_list_001';
    mapping.requirement = ListRequirement.MANDATORY;
    mapping.source = RegulationSource.TENANT_ADDED;

    em.persist(mapping);
    await em.flush();
    em.clear();

    const found = await em.findOne(TenantCategoryRegulatoryList, { id: mapping.id }, {
      populate: ['tenantCategory'],
    });
    expect(found).toBeDefined();
    expect(found?.tenantCategory.id).toBe(category.id);
    expect(found?.regulatoryListId).toBe('rl_custom_list_001');
    expect(found?.requirement).toBe(ListRequirement.MANDATORY);
    expect(found?.source).toBe(RegulationSource.TENANT_ADDED);
  });

  it('should create an inherited mapping with exemption (isExempted: true with reason, legalRef, exemptedBy, exemptedAt)', async () => {
    const category = createTenantCategory('Food Supplements', 'food.supplements');
    em.persist(category);
    await em.flush();

    const exemptedAt = new Date('2024-06-15T10:30:00Z');

    const mapping = new TenantCategoryRegulatoryList();
    mapping.tenantCategory = category;
    mapping.regulatoryListId = 'rl_food_additives_001';
    mapping.requirement = ListRequirement.MANDATORY;
    mapping.source = RegulationSource.INHERITED;
    mapping.isExempted = true;
    mapping.exemptionReason = 'Product is sold only in non-EU markets where this regulation does not apply';
    mapping.exemptionLegalRef = 'EU Regulation 2019/123 Article 4.2.b';
    mapping.exemptedBy = 'user_compliance_officer_001';
    mapping.exemptedAt = exemptedAt;

    em.persist(mapping);
    await em.flush();
    em.clear();

    const found = await em.findOne(TenantCategoryRegulatoryList, { id: mapping.id });
    expect(found).toBeDefined();
    expect(found?.isExempted).toBe(true);
    expect(found?.exemptionReason).toBe('Product is sold only in non-EU markets where this regulation does not apply');
    expect(found?.exemptionLegalRef).toBe('EU Regulation 2019/123 Article 4.2.b');
    expect(found?.exemptedBy).toBe('user_compliance_officer_001');
    expect(found?.exemptedAt).toEqual(exemptedAt);
    expect(found?.source).toBe(RegulationSource.INHERITED);
  });

  it('should support override threshold (stricter than law)', async () => {
    const category = createTenantCategory('Baby Products', 'baby.products');
    em.persist(category);
    await em.flush();

    const mapping = new TenantCategoryRegulatoryList();
    mapping.tenantCategory = category;
    mapping.regulatoryListId = 'rl_reach_svhc_001';
    mapping.requirement = ListRequirement.MANDATORY;
    mapping.source = RegulationSource.INHERITED;
    mapping.overrideThreshold = '0.0001'; // Stricter than default 0.1%

    em.persist(mapping);
    await em.flush();
    em.clear();

    const found = await em.findOne(TenantCategoryRegulatoryList, { id: mapping.id });
    expect(found).toBeDefined();
    expect(found?.overrideThreshold).toBe('0.0001');
  });

  it('should enforce unique constraint on tenantCategory + regulatoryListId', async () => {
    const category = createTenantCategory('Toys', 'toys');
    em.persist(category);
    await em.flush();

    const mapping1 = new TenantCategoryRegulatoryList();
    mapping1.tenantCategory = category;
    mapping1.regulatoryListId = 'rl_toy_safety_001';
    mapping1.requirement = ListRequirement.MANDATORY;
    mapping1.source = RegulationSource.INHERITED;

    em.persist(mapping1);
    await em.flush();

    const mapping2 = new TenantCategoryRegulatoryList();
    mapping2.tenantCategory = category;
    mapping2.regulatoryListId = 'rl_toy_safety_001'; // Same category + list
    mapping2.requirement = ListRequirement.RECOMMENDED;
    mapping2.source = RegulationSource.TENANT_ADDED;

    em.persist(mapping2);
    await expect(em.flush()).rejects.toThrow();
  });

  it('should have correct default value: isExempted=false', async () => {
    const category = createTenantCategory('Default Test', 'default.test');
    em.persist(category);
    await em.flush();

    const mapping = new TenantCategoryRegulatoryList();
    mapping.tenantCategory = category;
    mapping.regulatoryListId = 'rl_default_list_001';
    mapping.requirement = ListRequirement.MANDATORY;
    mapping.source = RegulationSource.INHERITED;

    // Check default before persisting
    expect(mapping.isExempted).toBe(false);

    em.persist(mapping);
    await em.flush();
    em.clear();

    // Verify default is persisted correctly
    const found = await em.findOne(TenantCategoryRegulatoryList, { id: mapping.id });
    expect(found).toBeDefined();
    expect(found?.isExempted).toBe(false);
    expect(found?.exemptionReason).toBeNull();
    expect(found?.exemptionLegalRef).toBeNull();
    expect(found?.exemptedBy).toBeNull();
    expect(found?.exemptedAt).toBeNull();
    expect(found?.overrideThreshold).toBeNull();
  });

  it('should allow same category linked to different regulatory lists', async () => {
    const category = createTenantCategory('Medical Devices', 'medical');
    em.persist(category);
    await em.flush();

    const mapping1 = new TenantCategoryRegulatoryList();
    mapping1.tenantCategory = category;
    mapping1.regulatoryListId = 'rl_mdr_class_i';
    mapping1.requirement = ListRequirement.MANDATORY;
    mapping1.source = RegulationSource.INHERITED;

    const mapping2 = new TenantCategoryRegulatoryList();
    mapping2.tenantCategory = category; // Same category, different list
    mapping2.regulatoryListId = 'rl_mdr_class_ii';
    mapping2.requirement = ListRequirement.RECOMMENDED;
    mapping2.source = RegulationSource.TENANT_ADDED;

    em.persist(mapping1);
    em.persist(mapping2);
    await em.flush();
    em.clear();

    const mappings = await em.find(TenantCategoryRegulatoryList, { tenantCategory: category.id });
    expect(mappings).toHaveLength(2);
  });

  it('should allow same regulatory list linked to different categories', async () => {
    const category1 = createTenantCategory('Electronics', 'electronics');
    const category2 = createTenantCategory('Batteries', 'batteries');
    em.persist(category1);
    em.persist(category2);
    await em.flush();

    const mapping1 = new TenantCategoryRegulatoryList();
    mapping1.tenantCategory = category1;
    mapping1.regulatoryListId = 'rl_weee_list';
    mapping1.requirement = ListRequirement.MANDATORY;
    mapping1.source = RegulationSource.INHERITED;

    const mapping2 = new TenantCategoryRegulatoryList();
    mapping2.tenantCategory = category2;
    mapping2.regulatoryListId = 'rl_weee_list'; // Same list, different category
    mapping2.requirement = ListRequirement.MANDATORY;
    mapping2.source = RegulationSource.INHERITED;

    em.persist(mapping1);
    em.persist(mapping2);
    await em.flush();
    em.clear();

    const mappings = await em.find(TenantCategoryRegulatoryList, { regulatoryListId: 'rl_weee_list' });
    expect(mappings).toHaveLength(2);
  });
});
