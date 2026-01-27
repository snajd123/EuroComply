import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';
import { TenantProvisioner } from './tenant-provisioner.js';
import { CategoryService } from './category.service.js';
import { Category, CategoryType } from '../entities/Category.js';
import { TargetType } from '../entities/enums/index.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..', '..');

interface CategoryData {
  path: string;
  name: string;
  description?: string;
  type: string;
  targetType: string;
}

interface CategoryBundle {
  version: string;
  generatedAt: string;
  totalCategories: number;
  categories: CategoryData[];
}

/**
 * Seeds categories directly into a tenant schema using raw SQL.
 * This bypasses the CategoriesSeeder which is designed for the public schema.
 */
async function seedCategoriesInSchema(
  em: EntityManager,
  schema: string
): Promise<number> {
  const bundlePath = join(PACKAGE_ROOT, 'data', 'system-categories.json');
  const raw = readFileSync(bundlePath, 'utf-8');
  const bundle: CategoryBundle = JSON.parse(raw);

  // Sort categories by path to ensure parents created before children
  const sortedCategories = [...bundle.categories].sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  // Build path -> id map for parent references
  const pathToId = new Map<string, string>();

  const now = new Date().toISOString();

  for (const c of sortedCategories) {
    const depth = (c.path.match(/\./g) || []).length;
    const lastDotIndex = c.path.lastIndexOf('.');
    const parentPath = lastDotIndex > 0 ? c.path.substring(0, lastDotIndex) : null;
    const parentId = parentPath ? pathToId.get(parentPath) : null;

    // Generate UUID for the category
    // MikroORM execute uses ? for positional parameters
    const result = await em.execute<{ id: string }[]>(
      `INSERT INTO "${schema}".category
       (id, name, description, path, type, target_type, depth, parent_id, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), ?, ?, ?::ltree, ?, ?, ?, ?, true, ?, ?)
       RETURNING id`,
      [c.name, c.description || null, c.path, c.type, c.targetType, depth, parentId, now, now]
    );

    pathToId.set(c.path, result[0]!.id);
  }

  return sortedCategories.length;
}

/**
 * Integration tests for CategoryService with seeded system categories.
 *
 * These tests use real database with categories seeded from system-categories.json.
 * They verify:
 * - Hierarchy navigation (findByPath, getAncestors, getDescendants, getChildren)
 * - Root category filtering by target type
 * - LTREE path validation
 * - Tenant category creation under system categories
 */
describe('Category Service Integration', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: CategoryService;
  let dbAvailable = false;
  const testSchema = 'tenant_cat_integration';

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      orm = await setupTestDb();

      // Provision test tenant schema
      const provisioner = new TenantProvisioner(orm);
      await provisioner.provisionTenant(testSchema);

      // Seed categories directly into tenant schema
      const seedEm = orm.em.fork();
      await seedCategoriesInSchema(seedEm, testSchema);
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
    em = orm.em.fork();
    await em.execute(`SET search_path TO "${testSchema}", public`);
    service = new CategoryService(em, testSchema);
  });

  describe('Hierarchy Navigation', () => {
    it('should find category by path (e.g., apparel.tops.tshirts)', async () => {
      const category = await service.findByPath('apparel.tops.tshirts');

      expect(category).not.toBeNull();
      expect(category!.name).toBe('T-Shirts');
      expect(category!.type).toBe(CategoryType.LEAF);
      expect(category!.targetType).toBe(TargetType.PRODUCT);
      expect(category!.depth).toBe(2);
    });

    it('should find root category by path', async () => {
      const category = await service.findByPath('apparel');

      expect(category).not.toBeNull();
      expect(category!.name).toBe('Apparel');
      expect(category!.type).toBe(CategoryType.ROOT);
      expect(category!.depth).toBe(0);
    });

    it('should return null for non-existent path', async () => {
      const category = await service.findByPath('nonexistent.path.here');

      expect(category).toBeNull();
    });

    it('should get ancestors of leaf category (2 ancestors for depth-2 leaf)', async () => {
      const leaf = await service.findByPath('apparel.tops.tshirts');
      expect(leaf).not.toBeNull();

      const ancestors = await service.getAncestors(leaf!.id);

      // apparel.tops.tshirts has ancestors: apparel (root), apparel.tops (branch)
      expect(ancestors).toHaveLength(2);

      // Should be ordered from root to immediate parent
      expect(ancestors[0]!.path).toBe('apparel');
      expect(ancestors[0]!.depth).toBe(0);
      expect(ancestors[1]!.path).toBe('apparel.tops');
      expect(ancestors[1]!.depth).toBe(1);
    });

    it('should return empty ancestors for root category', async () => {
      const root = await service.findByPath('apparel');
      expect(root).not.toBeNull();

      const ancestors = await service.getAncestors(root!.id);

      expect(ancestors).toHaveLength(0);
    });

    it('should get descendants of root category', async () => {
      const root = await service.findByPath('apparel');
      expect(root).not.toBeNull();

      const descendants = await service.getDescendants(root!.id);

      // apparel has: tops, bottoms, outerwear (branches) + their leaves
      // tops: tshirts, blouses, sweaters
      // bottoms: pants, shorts, skirts
      // outerwear: jackets, coats
      // Total: 3 branches + 8 leaves = 11 descendants
      expect(descendants.length).toBeGreaterThanOrEqual(11);

      // Verify some expected descendants
      const paths = descendants.map(d => d.path);
      expect(paths).toContain('apparel.tops');
      expect(paths).toContain('apparel.tops.tshirts');
      expect(paths).toContain('apparel.bottoms');
      expect(paths).toContain('apparel.outerwear.jackets');

      // Should not include the root itself
      expect(paths).not.toContain('apparel');

      // Should be ordered by depth
      for (let i = 1; i < descendants.length; i++) {
        expect(descendants[i]!.depth).toBeGreaterThanOrEqual(descendants[i - 1]!.depth);
      }
    });

    it('should get direct children only', async () => {
      const root = await service.findByPath('apparel');
      expect(root).not.toBeNull();

      const children = await service.getChildren(root!.id);

      // apparel has 3 direct children: tops, bottoms, outerwear
      expect(children).toHaveLength(3);

      const names = children.map(c => c.name);
      expect(names).toContain('Tops');
      expect(names).toContain('Bottoms');
      expect(names).toContain('Outerwear');

      // Should NOT include grandchildren
      expect(names).not.toContain('T-Shirts');
      expect(names).not.toContain('Pants');

      // All children should have depth 1
      for (const child of children) {
        expect(child.depth).toBe(1);
      }
    });

    it('should return empty children for leaf category', async () => {
      const leaf = await service.findByPath('apparel.tops.tshirts');
      expect(leaf).not.toBeNull();

      const children = await service.getChildren(leaf!.id);

      expect(children).toHaveLength(0);
    });
  });

  describe('Root Categories', () => {
    it('should get all root categories', async () => {
      const roots = await service.getRoots();

      // From seed data: apparel, electronics, furniture, toys, materials, facilities
      expect(roots.length).toBeGreaterThanOrEqual(6);

      // All should have depth 0
      for (const root of roots) {
        expect(root.depth).toBe(0);
      }

      const names = roots.map(r => r.name);
      expect(names).toContain('Apparel');
      expect(names).toContain('Electronics');
      expect(names).toContain('Materials');
      expect(names).toContain('Facilities');
    });

    it('should filter roots by target type PRODUCT', async () => {
      const productRoots = await service.getRoots(TargetType.PRODUCT);

      // Product roots: apparel, electronics, furniture, toys
      expect(productRoots.length).toBeGreaterThanOrEqual(4);

      for (const root of productRoots) {
        expect(root.targetType).toBe(TargetType.PRODUCT);
        expect(root.depth).toBe(0);
      }

      const names = productRoots.map(r => r.name);
      expect(names).toContain('Apparel');
      expect(names).toContain('Electronics');
      expect(names).not.toContain('Materials'); // MATERIAL type
      expect(names).not.toContain('Facilities'); // FACILITY type
    });

    it('should filter roots by target type MATERIAL', async () => {
      const materialRoots = await service.getRoots(TargetType.MATERIAL);

      // Material roots: materials
      expect(materialRoots.length).toBeGreaterThanOrEqual(1);

      for (const root of materialRoots) {
        expect(root.targetType).toBe(TargetType.MATERIAL);
        expect(root.depth).toBe(0);
      }

      const names = materialRoots.map(r => r.name);
      expect(names).toContain('Materials');
    });

    it('should filter roots by target type FACILITY', async () => {
      const facilityRoots = await service.getRoots(TargetType.FACILITY);

      // Facility roots: facilities
      expect(facilityRoots.length).toBeGreaterThanOrEqual(1);

      for (const root of facilityRoots) {
        expect(root.targetType).toBe(TargetType.FACILITY);
        expect(root.depth).toBe(0);
      }

      const names = facilityRoots.map(r => r.name);
      expect(names).toContain('Facilities');
    });
  });

  describe('LTREE Operations', () => {
    it('should have valid LTREE path patterns', async () => {
      // LTREE paths must match: lowercase alphanumeric and underscore, dot-separated
      const ltreePattern = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;

      // Get all categories
      const allCategories = await em.find(Category, {});

      expect(allCategories.length).toBeGreaterThan(0);

      for (const category of allCategories) {
        expect(category.path).toMatch(ltreePattern);
      }
    });

    it('should have correct parent references', async () => {
      // For non-root categories, parent should exist
      const nonRootCategories = await em.find(Category, { depth: { $gt: 0 } });

      for (const category of nonRootCategories) {
        // Parent reference should be set
        expect(category.parent).toBeDefined();

        // Parent's path should be a prefix of this category's path
        const expectedParentPath = category.path.substring(
          0,
          category.path.lastIndexOf('.')
        );

        // Load parent to verify
        await em.populate(category, ['parent']);
        expect(category.parent!.path).toBe(expectedParentPath);
      }
    });

    it('should have depth matching path segments', async () => {
      const allCategories = await em.find(Category, {});

      for (const category of allCategories) {
        // Depth should equal number of dots in path
        const expectedDepth = (category.path.match(/\./g) || []).length;
        expect(category.depth).toBe(expectedDepth);
      }
    });

    it('should query ancestors correctly with LTREE @> operator', async () => {
      // Test a deeply nested category
      const leaf = await service.findByPath('electronics.computing.laptops');
      expect(leaf).not.toBeNull();

      const ancestors = await service.getAncestors(leaf!.id);

      // Should have 2 ancestors: electronics, electronics.computing
      expect(ancestors).toHaveLength(2);
      expect(ancestors[0]!.path).toBe('electronics');
      expect(ancestors[1]!.path).toBe('electronics.computing');
    });

    it('should query descendants correctly with LTREE <@ operator', async () => {
      // Test materials hierarchy
      const materials = await service.findByPath('materials');
      expect(materials).not.toBeNull();

      const descendants = await service.getDescendants(materials!.id);

      // Materials has: textiles, metals, plastics (branches)
      // textiles: cotton, polyester, elastane
      // metals: steel, aluminum
      // plastics: abs, pla
      // Total: 3 branches + 7 leaves = 10 descendants
      expect(descendants.length).toBeGreaterThanOrEqual(10);

      const paths = descendants.map(d => d.path);
      expect(paths).toContain('materials.textiles');
      expect(paths).toContain('materials.textiles.cotton');
      expect(paths).toContain('materials.metals.steel');
      expect(paths).toContain('materials.plastics.abs');
    });
  });

  describe('Category Creation', () => {
    it('should create tenant category under system category', async () => {
      // Find a system category to use as parent
      const systemParent = await service.findByPath('apparel.tops');
      expect(systemParent).not.toBeNull();

      // Create a tenant-specific category
      const tenantCategory = await service.create({
        name: 'Custom Polo Shirts',
        description: 'Tenant-specific polo shirt category',
        type: CategoryType.LEAF,
        targetType: TargetType.PRODUCT,
        parentId: systemParent!.id,
      });

      try {
        expect(tenantCategory.id).toBeDefined();
        expect(tenantCategory.name).toBe('Custom Polo Shirts');
        expect(tenantCategory.path).toBe('apparel.tops.custom_polo_shirts');
        expect(tenantCategory.depth).toBe(2);
        expect(tenantCategory.parent?.id).toBe(systemParent!.id);
        expect(tenantCategory.targetType).toBe(TargetType.PRODUCT);
      } finally {
        // Clean up: delete the created category
        await service.delete(tenantCategory.id);
      }
    });

    it('should verify path and depth are correct for new category', async () => {
      const root = await service.findByPath('electronics');
      expect(root).not.toBeNull();

      const newCategory = await service.create({
        name: 'Audio Equipment',
        type: CategoryType.BRANCH,
        targetType: TargetType.PRODUCT,
        parentId: root!.id,
      });

      try {
        // Path should be parent.slugified_name
        expect(newCategory.path).toBe('electronics.audio_equipment');

        // Depth should be parent depth + 1
        expect(newCategory.depth).toBe(root!.depth + 1);
        expect(newCategory.depth).toBe(1);

        // Verify via LTREE query
        const ancestors = await service.getAncestors(newCategory.id);
        expect(ancestors).toHaveLength(1);
        expect(ancestors[0]!.id).toBe(root!.id);
      } finally {
        // Clean up
        await service.delete(newCategory.id);
      }
    });

    it('should create root category at depth 0', async () => {
      const newRoot = await service.create({
        name: 'Custom Root Category',
        type: CategoryType.ROOT,
        targetType: TargetType.PRODUCT,
      });

      try {
        expect(newRoot.path).toBe('custom_root_category');
        expect(newRoot.depth).toBe(0);
        expect(newRoot.parent).toBeUndefined();

        const ancestors = await service.getAncestors(newRoot.id);
        expect(ancestors).toHaveLength(0);
      } finally {
        // Clean up
        await service.delete(newRoot.id);
      }
    });

    it('should slugify names correctly for LTREE compatibility', async () => {
      const parent = await service.findByPath('materials');
      expect(parent).not.toBeNull();

      const newCategory = await service.create({
        name: 'High-Tech Polymer (Grade A)',
        type: CategoryType.LEAF,
        targetType: TargetType.MATERIAL,
        parentId: parent!.id,
      });

      try {
        // Should be slugified: lowercase, special chars to underscore
        expect(newCategory.path).toBe('materials.high_tech_polymer_grade_a');

        // Verify LTREE pattern is valid
        expect(newCategory.path).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/);
      } finally {
        // Clean up
        await service.delete(newCategory.id);
      }
    });
  });

  describe('Data Integrity', () => {
    it('should have seeded the expected number of categories', async () => {
      const allCategories = await em.find(Category, {});

      // From system-categories.json: totalCategories: 50
      expect(allCategories.length).toBeGreaterThanOrEqual(50);
    });

    it('should have categories with all required fields', async () => {
      const allCategories = await em.find(Category, {});

      for (const category of allCategories) {
        expect(category.id).toBeDefined();
        expect(category.name).toBeDefined();
        expect(category.name.length).toBeGreaterThan(0);
        expect(category.path).toBeDefined();
        expect(category.path.length).toBeGreaterThan(0);
        expect(category.type).toBeDefined();
        expect(Object.values(CategoryType)).toContain(category.type);
        expect(category.targetType).toBeDefined();
        expect(Object.values(TargetType)).toContain(category.targetType);
        expect(category.depth).toBeDefined();
        expect(category.depth).toBeGreaterThanOrEqual(0);
        expect(category.isActive).toBe(true);
      }
    });

    it('should have consistent category types by depth', async () => {
      const allCategories = await em.find(Category, {});

      for (const category of allCategories) {
        if (category.depth === 0) {
          // Root categories should be ROOT type
          expect(category.type).toBe(CategoryType.ROOT);
        }
        // Note: BRANCH and LEAF types can be at various depths
      }
    });
  });
});
