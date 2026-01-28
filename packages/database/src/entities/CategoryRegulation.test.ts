import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { CategoryRegulation } from './CategoryRegulation.js';
import { Category, CategoryType } from './Category.js';
import { Regulation } from './Regulation.js';
import { RegulationStatus } from './enums/RegulationStatus.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('CategoryRegulation entity', () => {
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

  // Helper to create a test regulation
  const createRegulation = (code: string): Regulation => {
    const regulation = new Regulation();
    regulation.code = code;
    regulation.name = `${code} Regulation`;
    regulation.status = RegulationStatus.ACTIVE;
    return regulation;
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

  describe('creation', () => {
    it('should_create_mapping_between_category_and_regulation', async () => {
      const category = createCategory('Electronics', 'electronics');
      const regulation = createRegulation('ROHS');

      em.persist(category);
      em.persist(regulation);
      await em.flush();

      const mapping = new CategoryRegulation();
      mapping.category = category;
      mapping.regulation = regulation;
      mapping.addedBy = 'system';

      em.persist(mapping);
      await em.flush();
      em.clear();

      const found = await em.findOne(CategoryRegulation, { id: mapping.id }, {
        populate: ['category', 'regulation'],
      });
      expect(found).toBeDefined();
      expect(found?.category.id).toBe(category.id);
      expect(found?.regulation.id).toBe(regulation.id);
      expect(found?.addedBy).toBe('system');
      expect(found?.addedAt).toBeDefined();
    });

    it('should_reject_duplicate_category_regulation_pair', async () => {
      const category = createCategory('Toys', 'toys');
      const regulation = createRegulation('TOY_SAFETY');

      em.persist(category);
      em.persist(regulation);
      await em.flush();

      const mapping1 = new CategoryRegulation();
      mapping1.category = category;
      mapping1.regulation = regulation;
      mapping1.addedBy = 'admin';

      em.persist(mapping1);
      await em.flush();

      const mapping2 = new CategoryRegulation();
      mapping2.category = category;
      mapping2.regulation = regulation; // Same category + regulation
      mapping2.addedBy = 'admin';

      em.persist(mapping2);
      await expect(em.flush()).rejects.toThrow();
    });
  });

  describe('relationships', () => {
    it('should_load_regulation_from_mapping', async () => {
      const category = createCategory('Medical Devices', 'medical');
      const regulation = createRegulation('MDR');

      em.persist(category);
      em.persist(regulation);
      await em.flush();

      const mapping = new CategoryRegulation();
      mapping.category = category;
      mapping.regulation = regulation;
      mapping.addedBy = 'compliance_officer';

      em.persist(mapping);
      await em.flush();
      em.clear();

      const found = await em.findOne(CategoryRegulation, { id: mapping.id }, {
        populate: ['regulation'],
      });
      expect(found).toBeDefined();
      expect(found?.regulation).toBeDefined();
      expect(found?.regulation.code).toBe('MDR');
      expect(found?.regulation.name).toBe('MDR Regulation');
    });

    it('should_load_category_from_mapping', async () => {
      const category = createCategory('Cosmetics', 'cosmetics');
      const regulation = createRegulation('CPR');

      em.persist(category);
      em.persist(regulation);
      await em.flush();

      const mapping = new CategoryRegulation();
      mapping.category = category;
      mapping.regulation = regulation;
      mapping.addedBy = 'system';

      em.persist(mapping);
      await em.flush();
      em.clear();

      const found = await em.findOne(CategoryRegulation, { id: mapping.id }, {
        populate: ['category'],
      });
      expect(found).toBeDefined();
      expect(found?.category).toBeDefined();
      expect(found?.category.name).toBe('Cosmetics');
      expect(found?.category.path).toBe('cosmetics');
    });

    it('should_allow_same_regulation_linked_to_different_categories', async () => {
      const category1 = createCategory('Electronics', 'electronics');
      const category2 = createCategory('Appliances', 'appliances');
      const regulation = createRegulation('WEEE');

      em.persist(category1);
      em.persist(category2);
      em.persist(regulation);
      await em.flush();

      const mapping1 = new CategoryRegulation();
      mapping1.category = category1;
      mapping1.regulation = regulation;
      mapping1.addedBy = 'system';

      const mapping2 = new CategoryRegulation();
      mapping2.category = category2;
      mapping2.regulation = regulation; // Same regulation, different category
      mapping2.addedBy = 'system';

      em.persist(mapping1);
      em.persist(mapping2);
      await em.flush();
      em.clear();

      const mappings = await em.find(CategoryRegulation, { regulation: regulation.id });
      expect(mappings).toHaveLength(2);
    });

    it('should_allow_same_category_linked_to_different_regulations', async () => {
      const category = createCategory('Batteries', 'batteries');
      const regulation1 = createRegulation('BATTERY_REG');
      const regulation2 = createRegulation('REACH');

      em.persist(category);
      em.persist(regulation1);
      em.persist(regulation2);
      await em.flush();

      const mapping1 = new CategoryRegulation();
      mapping1.category = category;
      mapping1.regulation = regulation1;
      mapping1.addedBy = 'system';

      const mapping2 = new CategoryRegulation();
      mapping2.category = category; // Same category, different regulation
      mapping2.regulation = regulation2;
      mapping2.addedBy = 'system';

      em.persist(mapping1);
      em.persist(mapping2);
      await em.flush();
      em.clear();

      const mappings = await em.find(CategoryRegulation, { category: category.id });
      expect(mappings).toHaveLength(2);
    });
  });

  describe('audit fields', () => {
    it('should_set_addedAt_automatically', async () => {
      const category = createCategory('Food', 'food');
      const regulation = createRegulation('FOOD_SAFETY');

      em.persist(category);
      em.persist(regulation);
      await em.flush();

      const beforeCreate = new Date();

      const mapping = new CategoryRegulation();
      mapping.category = category;
      mapping.regulation = regulation;
      mapping.addedBy = 'admin';

      em.persist(mapping);
      await em.flush();
      em.clear();

      const found = await em.findOne(CategoryRegulation, { id: mapping.id });
      expect(found).toBeDefined();
      expect(found?.addedAt).toBeDefined();
      expect(found?.addedAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    });

    it('should_require_addedBy_field', async () => {
      const category = createCategory('Chemicals', 'chemicals');
      const regulation = createRegulation('CLP');

      em.persist(category);
      em.persist(regulation);
      await em.flush();

      const mapping = new CategoryRegulation();
      mapping.category = category;
      mapping.regulation = regulation;
      mapping.addedBy = 'compliance_team';

      em.persist(mapping);
      await em.flush();
      em.clear();

      const found = await em.findOne(CategoryRegulation, { id: mapping.id });
      expect(found).toBeDefined();
      expect(found?.addedBy).toBe('compliance_team');
    });
  });
});
