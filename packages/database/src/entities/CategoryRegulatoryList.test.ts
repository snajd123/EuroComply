import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { CategoryRegulatoryList } from './CategoryRegulatoryList.js';
import { Category, CategoryType } from './Category.js';
import { RegulatoryList } from './RegulatoryList.js';
import { ListRequirement } from './enums/index.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('CategoryRegulatoryList entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let dbAvailable = false;

  // Helper to create a test category
  const createCategory = (name: string, path: string): Category => {
    const category = new Category();
    category.name = name;
    category.path = path;
    category.type = CategoryType.LEAF;
    return category;
  };

  // Helper to create a test regulatory list
  const createRegulatoryList = (code: string): RegulatoryList => {
    const list = new RegulatoryList();
    list.code = code;
    list.name = `${code} List`;
    list.source = 'TEST';
    list.version = 'v1';
    list.effectiveDate = new Date('2024-01-01');
    return list;
  };

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async (context) => {
    if (!dbAvailable) {
      context.skip();
      return;
    }
    em = orm.em.fork();
    await clearTestDb(em);
  });

  it('should create a category-list mapping with required fields', async () => {
    const category = createCategory('Electronics', 'electronics');
    const list = createRegulatoryList('ROHS_RESTRICTED');

    em.persist(category);
    em.persist(list);
    await em.flush();

    const mapping = new CategoryRegulatoryList();
    mapping.category = category;
    mapping.regulatoryList = list;
    mapping.requirement = ListRequirement.MANDATORY;

    em.persist(mapping);
    await em.flush();
    em.clear();

    const found = await em.findOne(CategoryRegulatoryList, { id: mapping.id }, {
      populate: ['category', 'regulatoryList'],
    });
    expect(found).toBeDefined();
    expect(found?.category.id).toBe(category.id);
    expect(found?.regulatoryList.id).toBe(list.id);
    expect(found?.requirement).toBe(ListRequirement.MANDATORY);
  });

  it('should support priority for same-depth ordering', async () => {
    const category = createCategory('Cosmetics', 'cosmetics');
    const list1 = createRegulatoryList('COSING_ANNEX_II');
    const list2 = createRegulatoryList('COSING_ANNEX_III');

    em.persist(category);
    em.persist(list1);
    em.persist(list2);
    await em.flush();

    const mapping1 = new CategoryRegulatoryList();
    mapping1.category = category;
    mapping1.regulatoryList = list1;
    mapping1.requirement = ListRequirement.MANDATORY;
    mapping1.priority = 10; // Higher priority

    const mapping2 = new CategoryRegulatoryList();
    mapping2.category = category;
    mapping2.regulatoryList = list2;
    mapping2.requirement = ListRequirement.RECOMMENDED;
    mapping2.priority = 5; // Lower priority

    em.persist(mapping1);
    em.persist(mapping2);
    await em.flush();
    em.clear();

    const mappings = await em.find(CategoryRegulatoryList, { category: category.id }, {
      orderBy: { priority: 'DESC' },
    });

    expect(mappings).toHaveLength(2);
    expect(mappings[0]!.priority).toBe(10);
    expect(mappings[1]!.priority).toBe(5);
  });

  it('should support exclusion flag (isExclusion: true)', async () => {
    const category = createCategory('Food Supplements', 'food.supplements');
    const list = createRegulatoryList('FOOD_ADDITIVES');

    em.persist(category);
    em.persist(list);
    await em.flush();

    const mapping = new CategoryRegulatoryList();
    mapping.category = category;
    mapping.regulatoryList = list;
    mapping.requirement = ListRequirement.INFORMATIONAL;
    mapping.isExclusion = true; // Exclude this list from the category

    em.persist(mapping);
    await em.flush();
    em.clear();

    const found = await em.findOne(CategoryRegulatoryList, { id: mapping.id });
    expect(found).toBeDefined();
    expect(found?.isExclusion).toBe(true);
  });

  it('should support compareValue override (stricter thresholds)', async () => {
    const category = createCategory('Baby Products', 'baby');
    const list = createRegulatoryList('REACH_SVHC');

    em.persist(category);
    em.persist(list);
    await em.flush();

    const mapping = new CategoryRegulatoryList();
    mapping.category = category;
    mapping.regulatoryList = list;
    mapping.requirement = ListRequirement.MANDATORY;
    mapping.compareValueOverride = '0.0001'; // Stricter than default 0.1%

    em.persist(mapping);
    await em.flush();
    em.clear();

    const found = await em.findOne(CategoryRegulatoryList, { id: mapping.id });
    expect(found).toBeDefined();
    expect(found?.compareValueOverride).toBe('0.0001');
  });

  it('should enforce unique constraint on category + list', async () => {
    const category = createCategory('Toys', 'toys');
    const list = createRegulatoryList('TOY_SAFETY');

    em.persist(category);
    em.persist(list);
    await em.flush();

    const mapping1 = new CategoryRegulatoryList();
    mapping1.category = category;
    mapping1.regulatoryList = list;
    mapping1.requirement = ListRequirement.MANDATORY;

    em.persist(mapping1);
    await em.flush();

    const mapping2 = new CategoryRegulatoryList();
    mapping2.category = category;
    mapping2.regulatoryList = list; // Same category + list
    mapping2.requirement = ListRequirement.RECOMMENDED;

    em.persist(mapping2);
    await expect(em.flush()).rejects.toThrow();
  });

  it('should have correct default values: priority=0, isExclusion=false, allowTenantExemption=true', async () => {
    const category = createCategory('Default Test', 'default');
    const list = createRegulatoryList('DEFAULT_LIST');

    em.persist(category);
    em.persist(list);
    await em.flush();

    const mapping = new CategoryRegulatoryList();
    mapping.category = category;
    mapping.regulatoryList = list;
    mapping.requirement = ListRequirement.MANDATORY;

    // Check defaults before persisting
    expect(mapping.priority).toBe(0);
    expect(mapping.isExclusion).toBe(false);
    expect(mapping.allowTenantExemption).toBe(true);

    em.persist(mapping);
    await em.flush();
    em.clear();

    // Verify defaults are persisted correctly
    const found = await em.findOne(CategoryRegulatoryList, { id: mapping.id });
    expect(found).toBeDefined();
    expect(found?.priority).toBe(0);
    expect(found?.isExclusion).toBe(false);
    expect(found?.allowTenantExemption).toBe(true);
  });

  it('should allow same list linked to different categories', async () => {
    const category1 = createCategory('Electronics', 'electronics');
    const category2 = createCategory('Batteries', 'batteries');
    const list = createRegulatoryList('WEEE');

    em.persist(category1);
    em.persist(category2);
    em.persist(list);
    await em.flush();

    const mapping1 = new CategoryRegulatoryList();
    mapping1.category = category1;
    mapping1.regulatoryList = list;
    mapping1.requirement = ListRequirement.MANDATORY;

    const mapping2 = new CategoryRegulatoryList();
    mapping2.category = category2;
    mapping2.regulatoryList = list; // Same list, different category
    mapping2.requirement = ListRequirement.MANDATORY;

    em.persist(mapping1);
    em.persist(mapping2);
    await em.flush();
    em.clear();

    const mappings = await em.find(CategoryRegulatoryList, { regulatoryList: list.id });
    expect(mappings).toHaveLength(2);
  });

  it('should allow same category linked to different lists', async () => {
    const category = createCategory('Medical Devices', 'medical');
    const list1 = createRegulatoryList('MDR_CLASS_I');
    const list2 = createRegulatoryList('MDR_CLASS_II');

    em.persist(category);
    em.persist(list1);
    em.persist(list2);
    await em.flush();

    const mapping1 = new CategoryRegulatoryList();
    mapping1.category = category;
    mapping1.regulatoryList = list1;
    mapping1.requirement = ListRequirement.MANDATORY;

    const mapping2 = new CategoryRegulatoryList();
    mapping2.category = category; // Same category, different list
    mapping2.regulatoryList = list2;
    mapping2.requirement = ListRequirement.RECOMMENDED;

    em.persist(mapping1);
    em.persist(mapping2);
    await em.flush();
    em.clear();

    const mappings = await em.find(CategoryRegulatoryList, { category: category.id });
    expect(mappings).toHaveLength(2);
  });

  it('should support disabling tenant exemptions per mapping', async () => {
    const category = createCategory('Absolute Ban Category', 'banned');
    const list = createRegulatoryList('ABSOLUTE_BAN_LIST');

    em.persist(category);
    em.persist(list);
    await em.flush();

    const mapping = new CategoryRegulatoryList();
    mapping.category = category;
    mapping.regulatoryList = list;
    mapping.requirement = ListRequirement.MANDATORY;
    mapping.allowTenantExemption = false; // No exemptions allowed

    em.persist(mapping);
    await em.flush();
    em.clear();

    const found = await em.findOne(CategoryRegulatoryList, { id: mapping.id });
    expect(found).toBeDefined();
    expect(found?.allowTenantExemption).toBe(false);
  });
});
