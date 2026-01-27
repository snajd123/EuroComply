import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { Category, CategoryType } from '../entities/Category.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { CategoryRegulatoryList } from '../entities/CategoryRegulatoryList.js';
import { TenantCategory } from '../entities/TenantCategory.js';
import { TenantCategoryRegulatoryList } from '../entities/TenantCategoryRegulatoryList.js';
import { ComplianceStackResolver } from './ComplianceStackResolver.js';
import { ListRequirement, RegulationSource, TargetType } from '../entities/enums/index.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable, clearTestDb } from '../test-utils.js';
import { TenantProvisioner } from './tenant-provisioner.js';

describe('ComplianceStackResolver', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let dbAvailable = false;
  const TEST_SCHEMA = 'tenant_csr_test';

  // Helper to create a system category
  const createSystemCategory = (name: string, path: string): Category => {
    const category = new Category();
    category.name = name;
    category.path = path;
    category.type = CategoryType.LEAF;
    category.targetType = TargetType.PRODUCT;
    return category;
  };

  // Helper to create a regulatory list
  const createRegulatoryList = (
    code: string,
    options?: { isCurrentVersion?: boolean; allowTenantExemption?: boolean }
  ): RegulatoryList => {
    const list = new RegulatoryList();
    list.code = code;
    list.name = `${code} List`;
    list.source = 'TEST';
    list.version = '2024-01';
    list.effectiveDate = new Date('2024-01-01');
    list.isCurrentVersion = options?.isCurrentVersion ?? true;
    list.allowTenantExemption = options?.allowTenantExemption ?? true;
    return list;
  };

  // Helper to create a tenant category
  const createTenantCategory = (
    name: string,
    path: string,
    systemCategoryId?: string,
    linkMode?: string
  ): TenantCategory => {
    const category = new TenantCategory();
    category.name = name;
    category.path = path;
    category.type = CategoryType.LEAF;
    category.targetType = TargetType.PRODUCT;
    if (systemCategoryId) {
      category.systemCategoryId = systemCategoryId;
    }
    if (linkMode) {
      category.linkMode = linkMode as any;
    }
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

  describe('resolve', () => {
    it('should resolve system baseline for adopted category', async () => {
      // Create system category
      const systemCategory = createSystemCategory('Electronics', 'electronics');
      em.persist(systemCategory);

      // Create regulatory lists
      const regulatoryList1 = createRegulatoryList('REACH_SVHC', { allowTenantExemption: true });
      const regulatoryList2 = createRegulatoryList('ROHS_RESTRICTED', { allowTenantExemption: false });
      em.persist(regulatoryList1);
      em.persist(regulatoryList2);
      await em.flush();

      // Create category-regulatory-list mappings
      const crl1 = new CategoryRegulatoryList();
      crl1.category = systemCategory;
      crl1.regulatoryList = regulatoryList1;
      crl1.requirement = ListRequirement.MANDATORY;
      crl1.allowTenantExemption = true;
      em.persist(crl1);

      const crl2 = new CategoryRegulatoryList();
      crl2.category = systemCategory;
      crl2.regulatoryList = regulatoryList2;
      crl2.requirement = ListRequirement.RECOMMENDED;
      crl2.allowTenantExemption = false;
      em.persist(crl2);
      await em.flush();

      // Set tenant context before creating tenant entities
      await setTenantContext();

      // Create tenant category linked to system category
      const tenantCategory = createTenantCategory('My Electronics', 'my.electronics', systemCategory.id, 'LIVE');
      em.persist(tenantCategory);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      expect(result.tenantCategoryId).toBe(tenantCategory.id);
      expect(result.tenantCategoryPath).toBe('my.electronics');
      expect(result.systemCategoryId).toBe(systemCategory.id);
      expect(result.linkMode).toBe('LIVE');
      expect(result.effectiveRegulations).toHaveLength(2);

      // Find REACH_SVHC regulation
      const reachReg = result.effectiveRegulations.find(r => r.regulatoryListCode === 'REACH_SVHC');
      expect(reachReg).toBeDefined();
      expect(reachReg?.source).toBe('SYSTEM');
      expect(reachReg?.requirement).toBe(ListRequirement.MANDATORY);
      expect(reachReg?.status).toBe('ACTIVE');
      expect(reachReg?.allowExemption).toBe(true);

      // Find ROHS regulation
      const rohsReg = result.effectiveRegulations.find(r => r.regulatoryListCode === 'ROHS_RESTRICTED');
      expect(rohsReg).toBeDefined();
      expect(rohsReg?.source).toBe('SYSTEM');
      expect(rohsReg?.requirement).toBe(ListRequirement.RECOMMENDED);
      expect(rohsReg?.status).toBe('ACTIVE');
      expect(rohsReg?.allowExemption).toBe(false);
    });

    it('should include tenant-added regulations', async () => {
      // Create system category
      const systemCategory = createSystemCategory('Electronics', 'electronics');
      em.persist(systemCategory);

      // Create regulatory lists
      const regulatoryList1 = createRegulatoryList('REACH_SVHC');
      const regulatoryList3 = createRegulatoryList('CUSTOM_INTERNAL');
      em.persist(regulatoryList1);
      em.persist(regulatoryList3);
      await em.flush();

      // Create system baseline
      const crl = new CategoryRegulatoryList();
      crl.category = systemCategory;
      crl.regulatoryList = regulatoryList1;
      crl.requirement = ListRequirement.MANDATORY;
      crl.allowTenantExemption = true;
      em.persist(crl);
      await em.flush();

      // Set tenant context before creating tenant entities
      await setTenantContext();

      // Create tenant category
      const tenantCategory = createTenantCategory('My Electronics', 'my.electronics', systemCategory.id, 'LIVE');
      em.persist(tenantCategory);
      await em.flush();

      // Add tenant-added regulation
      const tenantReg = new TenantCategoryRegulatoryList();
      tenantReg.tenantCategory = tenantCategory;
      tenantReg.regulatoryListId = regulatoryList3.id;
      tenantReg.requirement = ListRequirement.MANDATORY;
      tenantReg.source = RegulationSource.TENANT_ADDED;
      em.persist(tenantReg);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      expect(result.effectiveRegulations).toHaveLength(2);

      // Find system regulation
      const systemReg = result.effectiveRegulations.find(r => r.regulatoryListCode === 'REACH_SVHC');
      expect(systemReg?.source).toBe('SYSTEM');

      // Find tenant-added regulation
      const tenantAddedReg = result.effectiveRegulations.find(r => r.regulatoryListCode === 'CUSTOM_INTERNAL');
      expect(tenantAddedReg).toBeDefined();
      expect(tenantAddedReg?.source).toBe('TENANT');
      expect(tenantAddedReg?.requirement).toBe(ListRequirement.MANDATORY);
      expect(tenantAddedReg?.status).toBe('ACTIVE');
      expect(tenantAddedReg?.allowExemption).toBe(true);
    });

    it('should mark exempted regulations with status EXEMPTED', async () => {
      // Create system category
      const systemCategory = createSystemCategory('Electronics', 'electronics');
      em.persist(systemCategory);

      // Create regulatory list
      const regulatoryList1 = createRegulatoryList('REACH_SVHC');
      em.persist(regulatoryList1);
      await em.flush();

      // Create system baseline
      const crl = new CategoryRegulatoryList();
      crl.category = systemCategory;
      crl.regulatoryList = regulatoryList1;
      crl.requirement = ListRequirement.MANDATORY;
      crl.allowTenantExemption = true;
      em.persist(crl);
      await em.flush();

      // Set tenant context before creating tenant entities
      await setTenantContext();

      // Create tenant category
      const tenantCategory = createTenantCategory('My Electronics', 'my.electronics', systemCategory.id, 'LIVE');
      em.persist(tenantCategory);
      await em.flush();

      // Create exemption for system baseline regulation
      const exemptedAt = new Date('2024-06-15T10:30:00Z');
      const exemption = new TenantCategoryRegulatoryList();
      exemption.tenantCategory = tenantCategory;
      exemption.regulatoryListId = regulatoryList1.id;
      exemption.requirement = ListRequirement.MANDATORY;
      exemption.source = RegulationSource.INHERITED;
      exemption.isExempted = true;
      exemption.exemptionReason = 'Product only sold in non-EU markets';
      exemption.exemptionLegalRef = 'EU Regulation 2019/123 Article 4.2.b';
      exemption.exemptedBy = 'user_compliance_officer_001';
      exemption.exemptedAt = exemptedAt;
      em.persist(exemption);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      expect(result.effectiveRegulations).toHaveLength(1);

      const reg = result.effectiveRegulations[0];
      expect(reg?.regulatoryListCode).toBe('REACH_SVHC');
      expect(reg?.status).toBe('EXEMPTED');
      expect(reg?.exemption).toBeDefined();
      expect(reg?.exemption?.reason).toBe('Product only sold in non-EU markets');
      expect(reg?.exemption?.legalRef).toBe('EU Regulation 2019/123 Article 4.2.b');
      expect(reg?.exemption?.exemptedBy).toBe('user_compliance_officer_001');
      expect(reg?.exemption?.exemptedAt).toEqual(exemptedAt);
    });

    it('should return empty regulations for custom category (no systemCategoryId)', async () => {
      // Set tenant context before creating tenant entities
      await setTenantContext();

      // Create tenant category without system category link (custom category)
      const tenantCategory = createTenantCategory('Custom Category', 'custom.category');
      em.persist(tenantCategory);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      expect(result.tenantCategoryId).toBe(tenantCategory.id);
      expect(result.tenantCategoryPath).toBe('custom.category');
      expect(result.systemCategoryId).toBeUndefined();
      expect(result.linkMode).toBeUndefined();
      expect(result.effectiveRegulations).toHaveLength(0);
    });

    it('should handle pure system baseline (no tenant overrides)', async () => {
      // Create system category
      const systemCategory = createSystemCategory('Electronics', 'electronics');
      em.persist(systemCategory);

      // Create regulatory lists
      const regulatoryList1 = createRegulatoryList('REACH_SVHC');
      const regulatoryList2 = createRegulatoryList('ROHS_RESTRICTED');
      em.persist(regulatoryList1);
      em.persist(regulatoryList2);
      await em.flush();

      // Create multiple system baseline mappings
      const crl1 = new CategoryRegulatoryList();
      crl1.category = systemCategory;
      crl1.regulatoryList = regulatoryList1;
      crl1.requirement = ListRequirement.MANDATORY;
      crl1.allowTenantExemption = true;
      crl1.compareValueOverride = '0.0001';
      em.persist(crl1);

      const crl2 = new CategoryRegulatoryList();
      crl2.category = systemCategory;
      crl2.regulatoryList = regulatoryList2;
      crl2.requirement = ListRequirement.INFORMATIONAL;
      crl2.allowTenantExemption = false;
      em.persist(crl2);
      await em.flush();

      // Set tenant context before creating tenant entities
      await setTenantContext();

      // Create tenant category linked to system category (no tenant records)
      const tenantCategory = createTenantCategory('My Electronics', 'my.electronics', systemCategory.id, 'LIVE');
      em.persist(tenantCategory);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      expect(result.effectiveRegulations).toHaveLength(2);

      // All should be from SYSTEM source with ACTIVE status
      for (const reg of result.effectiveRegulations) {
        expect(reg.source).toBe('SYSTEM');
        expect(reg.status).toBe('ACTIVE');
      }

      // Verify override threshold is included
      const reachReg = result.effectiveRegulations.find(r => r.regulatoryListCode === 'REACH_SVHC');
      expect(reachReg?.overrideThreshold).toBe('0.0001');
    });

    it('should handle tenant-added regulation with override threshold', async () => {
      // Create regulatory list
      const regulatoryList3 = createRegulatoryList('CUSTOM_INTERNAL');
      em.persist(regulatoryList3);
      await em.flush();

      // Set tenant context before creating tenant entities
      await setTenantContext();

      // Create tenant category without system link
      const tenantCategory = createTenantCategory('Custom Category', 'custom.category');
      em.persist(tenantCategory);
      await em.flush();

      // Add tenant-added regulation with override threshold
      const tenantReg = new TenantCategoryRegulatoryList();
      tenantReg.tenantCategory = tenantCategory;
      tenantReg.regulatoryListId = regulatoryList3.id;
      tenantReg.requirement = ListRequirement.MANDATORY;
      tenantReg.source = RegulationSource.TENANT_ADDED;
      tenantReg.overrideThreshold = '0.0005';
      em.persist(tenantReg);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      expect(result.effectiveRegulations).toHaveLength(1);
      const reg = result.effectiveRegulations[0];
      expect(reg?.source).toBe('TENANT');
      expect(reg?.overrideThreshold).toBe('0.0005');
    });

    it('should not include system baseline for excluded mappings (isExclusion: true)', async () => {
      // Create system category
      const systemCategory = createSystemCategory('Electronics', 'electronics');

      // Create regulatory lists
      const regulatoryList1 = createRegulatoryList('REACH_SVHC');
      const regulatoryList2 = createRegulatoryList('ROHS_RESTRICTED');

      // Create system baseline with an excluded mapping
      const crl1 = new CategoryRegulatoryList();
      crl1.category = systemCategory;
      crl1.regulatoryList = regulatoryList1;
      crl1.requirement = ListRequirement.MANDATORY;
      crl1.allowTenantExemption = true;
      crl1.isExclusion = false;

      const crl2 = new CategoryRegulatoryList();
      crl2.category = systemCategory;
      crl2.regulatoryList = regulatoryList2;
      crl2.requirement = ListRequirement.MANDATORY;
      crl2.allowTenantExemption = true;
      crl2.isExclusion = true; // This should be excluded

      em.persist([systemCategory, regulatoryList1, regulatoryList2, crl1, crl2]);
      await em.flush();

      // Set tenant context before creating tenant entities
      await setTenantContext();

      // Create tenant category linked to system category
      const tenantCategory = createTenantCategory('My Electronics', 'my.electronics', systemCategory.id, 'LIVE');
      em.persist(tenantCategory);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      // Should only include the non-excluded regulation
      expect(result.effectiveRegulations).toHaveLength(1);
      expect(result.effectiveRegulations[0]?.regulatoryListCode).toBe('REACH_SVHC');
    });

    it('should only include current version regulatory lists in system baseline', async () => {
      // Create system category
      const systemCategory = createSystemCategory('Electronics', 'electronics');

      // Create current and old version lists
      const currentList = createRegulatoryList('REACH_SVHC', { isCurrentVersion: true });
      const oldList = createRegulatoryList('OLD_LIST', { isCurrentVersion: false });

      // Link both current and old list to system category
      const crl1 = new CategoryRegulatoryList();
      crl1.category = systemCategory;
      crl1.regulatoryList = currentList;
      crl1.requirement = ListRequirement.MANDATORY;
      crl1.allowTenantExemption = true;

      const crl2 = new CategoryRegulatoryList();
      crl2.category = systemCategory;
      crl2.regulatoryList = oldList;
      crl2.requirement = ListRequirement.MANDATORY;
      crl2.allowTenantExemption = true;

      em.persist([systemCategory, currentList, oldList, crl1, crl2]);
      await em.flush();

      // Set tenant context before creating tenant entities
      await setTenantContext();

      // Create tenant category
      const tenantCategory = createTenantCategory('My Electronics', 'my.electronics', systemCategory.id, 'LIVE');
      em.persist(tenantCategory);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);
      const result = await resolver.resolve(tenantCategory.id);

      // Should only include current version
      expect(result.effectiveRegulations).toHaveLength(1);
      expect(result.effectiveRegulations[0]?.regulatoryListCode).toBe('REACH_SVHC');
    });

    it('should include pinned regulatory lists in FROZEN mode (ignoring isCurrentVersion)', async () => {
      // Create system category
      const systemCategory = createSystemCategory('Electronics', 'electronics');

      // Create current and old version lists
      const currentList = createRegulatoryList('REACH_SVHC_V2', { isCurrentVersion: true });
      const pinnedOldList = createRegulatoryList('REACH_SVHC_V1', { isCurrentVersion: false });
      const anotherCurrentList = createRegulatoryList('ROHS_V1', { isCurrentVersion: true });

      // Link all lists to system category
      const crl1 = new CategoryRegulatoryList();
      crl1.category = systemCategory;
      crl1.regulatoryList = currentList;
      crl1.requirement = ListRequirement.MANDATORY;
      crl1.allowTenantExemption = true;

      const crl2 = new CategoryRegulatoryList();
      crl2.category = systemCategory;
      crl2.regulatoryList = pinnedOldList;
      crl2.requirement = ListRequirement.MANDATORY;
      crl2.allowTenantExemption = true;

      const crl3 = new CategoryRegulatoryList();
      crl3.category = systemCategory;
      crl3.regulatoryList = anotherCurrentList;
      crl3.requirement = ListRequirement.RECOMMENDED;
      crl3.allowTenantExemption = true;

      em.persist([systemCategory, currentList, pinnedOldList, anotherCurrentList, crl1, crl2, crl3]);
      await em.flush();

      // Set tenant context before creating tenant entities
      await setTenantContext();

      // Create tenant category in FROZEN mode
      const tenantCategory = createTenantCategory('My Electronics', 'my.electronics', systemCategory.id, 'FROZEN');
      em.persist(tenantCategory);
      await em.flush();

      const resolver = new ComplianceStackResolver(em);

      // Resolve with pinned IDs (the old version + another current list)
      const result = await resolver.resolve(tenantCategory.id, {
        pinnedRegulatoryListIds: [pinnedOldList.id, anotherCurrentList.id],
      });

      // Should include only the pinned lists (old version included, current V2 excluded)
      expect(result.effectiveRegulations).toHaveLength(2);

      const pinnedReg = result.effectiveRegulations.find(r => r.regulatoryListCode === 'REACH_SVHC_V1');
      expect(pinnedReg).toBeDefined();
      expect(pinnedReg?.source).toBe('SYSTEM');

      const rohsReg = result.effectiveRegulations.find(r => r.regulatoryListCode === 'ROHS_V1');
      expect(rohsReg).toBeDefined();
      expect(rohsReg?.source).toBe('SYSTEM');

      // V2 should NOT be included because it's not in pinned list
      const v2Reg = result.effectiveRegulations.find(r => r.regulatoryListCode === 'REACH_SVHC_V2');
      expect(v2Reg).toBeUndefined();
    });
  });
});
