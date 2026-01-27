import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';
import { TenantProvisioner } from './tenant-provisioner.js';
import { CategoryService } from './category.service.js';
import { Category, CategoryType } from '../entities/Category.js';
import { CategoryAdoption, LinkMode } from '../entities/CategoryAdoption.js';
import { TargetType } from '../entities/enums/index.js';

describe('CategoryService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: CategoryService;
  let dbAvailable = false;
  const testSchema = 'tenant_category_test';

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      orm = await setupTestDb();
      // Provision a test tenant schema
      const provisioner = new TenantProvisioner(orm);
      await provisioner.provisionTenant(testSchema);
    }
  });

  afterAll(async () => {
    if (dbAvailable && orm) {
      // Cleanup test schema
      try {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
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
    // Fork em with tenant schema
    em = orm.em.fork();
    await em.execute(`SET search_path TO "${testSchema}", public`);
    service = new CategoryService(em, testSchema);
    // Clear categories and adoptions tables
    await em.execute(`TRUNCATE TABLE "${testSchema}".category_adoption CASCADE`);
    await em.execute(`TRUNCATE TABLE "${testSchema}".category CASCADE`);
  });

  describe('create', () => {
    it('should create a root category with auto-generated path', async () => {
      const category = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      expect(category.id).toBeDefined();
      expect(category.name).toBe('Electronics');
      expect(category.path).toBe('electronics');
      expect(category.type).toBe(CategoryType.ROOT);
      expect(category.targetType).toBe(TargetType.PRODUCT);
      expect(category.depth).toBe(0);
      expect(category.parent).toBeUndefined();
    });

    it('should create a child category with parent path prefix', async () => {
      const parent = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const child = await service.create({
        name: 'Computers',
        type: CategoryType.BRANCH,
        targetType: TargetType.PRODUCT,
        parentId: parent.id,
      });

      expect(child.path).toBe('electronics.computers');
      expect(child.depth).toBe(1);
      expect(child.parent?.id).toBe(parent.id);
    });

    it('should slugify name with special characters', async () => {
      const category = await service.create({
        name: 'High-Tech & Gadgets (2024)',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      expect(category.path).toBe('high_tech_gadgets_2024');
    });

    it('should throw on duplicate path', async () => {
      await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      await expect(
        service.create({
          name: 'Electronics',
          type: CategoryType.ROOT,
          targetType: TargetType.PRODUCT,
        })
      ).rejects.toThrow('already exists');
    });

    it('should throw if name has no alphanumeric characters', async () => {
      await expect(
        service.create({
          name: '!!!',
          type: CategoryType.ROOT,
          targetType: TargetType.PRODUCT,
        })
      ).rejects.toThrow('alphanumeric');
    });

    it('should create category with description and defaultProfileId', async () => {
      const category = await service.create({
        name: 'Materials',
        description: 'Raw materials category',
        type: CategoryType.ROOT,
        targetType: TargetType.MATERIAL,
        defaultProfileId: 'profile_123',
      });

      expect(category.description).toBe('Raw materials category');
      expect(category.defaultProfileId).toBe('profile_123');
    });
  });

  describe('update', () => {
    it('should update category fields', async () => {
      const category = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const updated = await service.update(category.id, {
        name: 'Consumer Electronics',
        description: 'Updated description',
        isActive: false,
      });

      expect(updated.name).toBe('Consumer Electronics');
      expect(updated.description).toBe('Updated description');
      expect(updated.isActive).toBe(false);
      // Path should NOT change (to avoid breaking references)
      expect(updated.path).toBe('electronics');
    });

    it('should throw if category not found', async () => {
      await expect(
        service.update('nonexistent_id', { name: 'New Name' })
      ).rejects.toThrow('not found');
    });
  });

  describe('findByPath', () => {
    it('should find category by exact path', async () => {
      const created = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const found = await service.findByPath('electronics');

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should return null for non-existent path', async () => {
      const found = await service.findByPath('nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('getAncestors', () => {
    it('should return all ancestors using LTREE', async () => {
      const root = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const branch = await service.create({
        name: 'Computers',
        type: CategoryType.BRANCH,
        targetType: TargetType.PRODUCT,
        parentId: root.id,
      });

      const leaf = await service.create({
        name: 'Laptops',
        type: CategoryType.LEAF,
        targetType: TargetType.PRODUCT,
        parentId: branch.id,
      });

      const ancestors = await service.getAncestors(leaf.id);

      // Should include root and branch (not the leaf itself)
      expect(ancestors).toHaveLength(2);
      const paths = ancestors.map(a => a.path);
      expect(paths).toContain('electronics');
      expect(paths).toContain('electronics.computers');
    });

    it('should return empty array for root category', async () => {
      const root = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const ancestors = await service.getAncestors(root.id);

      expect(ancestors).toHaveLength(0);
    });
  });

  describe('getDescendants', () => {
    it('should return all descendants using LTREE', async () => {
      const root = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const branch = await service.create({
        name: 'Computers',
        type: CategoryType.BRANCH,
        targetType: TargetType.PRODUCT,
        parentId: root.id,
      });

      await service.create({
        name: 'Laptops',
        type: CategoryType.LEAF,
        targetType: TargetType.PRODUCT,
        parentId: branch.id,
      });

      await service.create({
        name: 'Desktops',
        type: CategoryType.LEAF,
        targetType: TargetType.PRODUCT,
        parentId: branch.id,
      });

      const descendants = await service.getDescendants(root.id);

      // Should include branch, laptops, desktops (not the root itself)
      expect(descendants).toHaveLength(3);
      const paths = descendants.map(d => d.path);
      expect(paths).toContain('electronics.computers');
      expect(paths).toContain('electronics.computers.laptops');
      expect(paths).toContain('electronics.computers.desktops');
    });

    it('should return empty array for leaf category', async () => {
      const root = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const descendants = await service.getDescendants(root.id);

      expect(descendants).toHaveLength(0);
    });
  });

  describe('getChildren', () => {
    it('should return direct children only', async () => {
      const root = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const branch = await service.create({
        name: 'Computers',
        type: CategoryType.BRANCH,
        targetType: TargetType.PRODUCT,
        parentId: root.id,
      });

      await service.create({
        name: 'Phones',
        type: CategoryType.BRANCH,
        targetType: TargetType.PRODUCT,
        parentId: root.id,
      });

      // Add grandchild
      await service.create({
        name: 'Laptops',
        type: CategoryType.LEAF,
        targetType: TargetType.PRODUCT,
        parentId: branch.id,
      });

      const children = await service.getChildren(root.id);

      // Should only include Computers and Phones, not Laptops
      expect(children).toHaveLength(2);
      const names = children.map(c => c.name);
      expect(names).toContain('Computers');
      expect(names).toContain('Phones');
      expect(names).not.toContain('Laptops');
    });
  });

  describe('getRoots', () => {
    it('should return all root categories', async () => {
      await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      await service.create({
        name: 'Materials',
        type: CategoryType.ROOT,
        targetType: TargetType.MATERIAL,
      });

      const roots = await service.getRoots();

      expect(roots).toHaveLength(2);
    });

    it('should filter by targetType', async () => {
      await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      await service.create({
        name: 'Materials',
        type: CategoryType.ROOT,
        targetType: TargetType.MATERIAL,
      });

      const productRoots = await service.getRoots(TargetType.PRODUCT);

      expect(productRoots).toHaveLength(1);
      expect(productRoots[0]!.name).toBe('Electronics');
    });
  });

  describe('delete', () => {
    it('should delete a leaf category', async () => {
      const root = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      await service.delete(root.id);

      const found = await service.findByPath('electronics');
      expect(found).toBeNull();
    });

    it('should throw if category has children', async () => {
      const root = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      await service.create({
        name: 'Computers',
        type: CategoryType.BRANCH,
        targetType: TargetType.PRODUCT,
        parentId: root.id,
      });

      await expect(service.delete(root.id)).rejects.toThrow('has children');
    });
  });

  describe('adoptCategory', () => {
    it('should create adoption for system category', async () => {
      // Create a "system" category in this schema (simulating public.category)
      const systemCategory = await service.create({
        name: 'System Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const adoption = await service.adoptCategory(testSchema, systemCategory.id);

      expect(adoption.systemCategoryId).toBe(systemCategory.id);
      expect(adoption.mode).toBe(LinkMode.LIVE);
      expect(adoption.adoptedAt).toBeDefined();
    });

    it('should throw if already adopted', async () => {
      const systemCategory = await service.create({
        name: 'System Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      await service.adoptCategory(testSchema, systemCategory.id);

      await expect(
        service.adoptCategory(testSchema, systemCategory.id)
      ).rejects.toThrow('already adopted');
    });
  });

  describe('getAdoptedCategories', () => {
    it('should return adopted categories with their data', async () => {
      const cat1 = await service.create({
        name: 'System Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const cat2 = await service.create({
        name: 'System Materials',
        type: CategoryType.ROOT,
        targetType: TargetType.MATERIAL,
      });

      await service.adoptCategory(testSchema, cat1.id);
      await service.adoptCategory(testSchema, cat2.id);

      const adopted = await service.getAdoptedCategories(testSchema);

      expect(adopted).toHaveLength(2);
      const names = adopted.map(a => a.name);
      expect(names).toContain('System Electronics');
      expect(names).toContain('System Materials');
    });
  });

  describe('unadoptCategory', () => {
    it('should remove adoption', async () => {
      const systemCategory = await service.create({
        name: 'System Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      await service.adoptCategory(testSchema, systemCategory.id);
      await service.unadoptCategory(testSchema, systemCategory.id);

      const adopted = await service.getAdoptedCategories(testSchema);
      expect(adopted).toHaveLength(0);
    });

    it('should throw if not adopted', async () => {
      const systemCategory = await service.create({
        name: 'System Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      await expect(
        service.unadoptCategory(testSchema, systemCategory.id)
      ).rejects.toThrow('not adopted');
    });
  });

  describe('getAvailableForAdoption', () => {
    it('should return categories not yet adopted', async () => {
      const cat1 = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      const cat2 = await service.create({
        name: 'Materials',
        type: CategoryType.ROOT,
        targetType: TargetType.MATERIAL,
      });

      await service.adoptCategory(testSchema, cat1.id);

      const available = await service.getAvailableForAdoption(testSchema);

      expect(available).toHaveLength(1);
      expect(available[0]!.id).toBe(cat2.id);
    });

    it('should filter by targetType', async () => {
      const cat1 = await service.create({
        name: 'Electronics',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      await service.create({
        name: 'Materials',
        type: CategoryType.ROOT,
        targetType: TargetType.MATERIAL,
      });

      const available = await service.getAvailableForAdoption(
        testSchema,
        TargetType.PRODUCT
      );

      expect(available).toHaveLength(1);
      expect(available[0]!.id).toBe(cat1.id);
    });
  });
});
