import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { CategoriesSeeder } from './categories.seeder.js';
import { SeedService } from '../services/seed.service.js';
import { Category, CategoryType } from '../entities/Category.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import type { MikroORM } from '@mikro-orm/postgresql';

// Check database availability at module level (before test registration)
const dbAvailable = await isDatabaseAvailable();

describe('CategoriesSeeder Integration', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
      // Create category table in public schema for system categories
      // Category uses LTREE which requires the extension (installed by setupTestDb)
      const connection = orm.em.getConnection();
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS public.category (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          path ltree NOT NULL,
          type VARCHAR(10) DEFAULT 'BRANCH',
          target_type VARCHAR(20) DEFAULT 'PRODUCT',
          depth INT DEFAULT 0,
          parent_id TEXT REFERENCES public.category(id),
          default_profile_id TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        )
      `);
      await connection.execute(`
        CREATE INDEX IF NOT EXISTS category_path_gist_idx ON public.category USING gist(path)
      `);
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      // Drop the test category table
      const connection = orm.em.getConnection();
      await connection.execute('DROP TABLE IF EXISTS public.category CASCADE');
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      // Also clear the category table
      const connection = orm.em.getConnection();
      await connection.execute('TRUNCATE TABLE public.category CASCADE');
    }
  });

  it.skipIf(!dbAvailable)('should seed categories from system-categories data bundle', async () => {
    const em = orm.em.fork();
    const seedService = new SeedService(em);
    const seeder = new CategoriesSeeder(em, seedService);

    const result = await seeder.seed();

    expect(result.seeded).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.count).toBeGreaterThan(0);
    expect(result.version).toBe('SystemCategories-v1');
    expect(result.message).toContain('Seeded');
  });

  it.skipIf(!dbAvailable)('should be idempotent - skip if already seeded', async () => {
    const em = orm.em.fork();
    const seedService = new SeedService(em);
    const seeder = new CategoriesSeeder(em, seedService);

    // First seed
    const first = await seeder.seed();
    expect(first.seeded).toBe(true);

    // Second seed should skip (uses SeedService version tracking)
    const second = await seeder.seed();
    expect(second.seeded).toBe(false);
    expect(second.skipped).toBe(true);
    expect(second.message).toContain('already seeded');
  });

  it.skipIf(!dbAvailable)('should seed ROOT categories with depth 0', async () => {
    const em = orm.em.fork();
    const seedService = new SeedService(em);
    const seeder = new CategoriesSeeder(em, seedService);
    await seeder.seed();

    // Query directly since Category entity schema mismatch
    const connection = em.getConnection();
    const roots = await connection.execute<{ path: string; name: string; depth: number; type: string }[]>(
      "SELECT path, name, depth, type FROM public.category WHERE type = 'ROOT'"
    );

    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) {
      expect(root.depth).toBe(0);
      expect(root.path).not.toContain('.');
    }
  });

  it.skipIf(!dbAvailable)('should seed BRANCH categories with correct parent references', async () => {
    const em = orm.em.fork();
    const seedService = new SeedService(em);
    const seeder = new CategoriesSeeder(em, seedService);
    await seeder.seed();

    const connection = em.getConnection();

    // Get 'apparel.tops' which should be a BRANCH with parent 'apparel'
    const branches = await connection.execute<{ path: string; name: string; depth: number; parent_id: string | null }[]>(
      "SELECT path, name, depth, parent_id FROM public.category WHERE path::text = 'apparel.tops'"
    );

    expect(branches.length).toBe(1);
    const tops = branches[0];
    expect(tops.depth).toBe(1);
    expect(tops.parent_id).not.toBeNull();

    // Verify parent is 'apparel'
    const parent = await connection.execute<{ path: string }[]>(
      `SELECT path FROM public.category WHERE id = '${tops.parent_id}'`
    );
    expect(parent[0].path).toBe('apparel');
  });

  it.skipIf(!dbAvailable)('should seed LEAF categories with depth 2', async () => {
    const em = orm.em.fork();
    const seedService = new SeedService(em);
    const seeder = new CategoriesSeeder(em, seedService);
    await seeder.seed();

    const connection = em.getConnection();

    // Get 'apparel.tops.tshirts' which should be a LEAF
    const leaves = await connection.execute<{ path: string; name: string; depth: number; type: string }[]>(
      "SELECT path, name, depth, type FROM public.category WHERE path::text = 'apparel.tops.tshirts'"
    );

    expect(leaves.length).toBe(1);
    expect(leaves[0].depth).toBe(2);
    expect(leaves[0].type).toBe('LEAF');
    expect(leaves[0].name).toBe('T-Shirts');
  });

  it.skipIf(!dbAvailable)('should support multiple target types', async () => {
    const em = orm.em.fork();
    const seedService = new SeedService(em);
    const seeder = new CategoriesSeeder(em, seedService);
    await seeder.seed();

    const connection = em.getConnection();

    // PRODUCT target type
    const products = await connection.execute<{ target_type: string }[]>(
      "SELECT target_type FROM public.category WHERE path::text = 'apparel'"
    );
    expect(products[0].target_type).toBe('PRODUCT');

    // MATERIAL target type
    const materials = await connection.execute<{ target_type: string }[]>(
      "SELECT target_type FROM public.category WHERE path::text = 'materials'"
    );
    expect(materials[0].target_type).toBe('MATERIAL');

    // FACILITY target type
    const facilities = await connection.execute<{ target_type: string }[]>(
      "SELECT target_type FROM public.category WHERE path::text = 'facilities'"
    );
    expect(facilities[0].target_type).toBe('FACILITY');
  });

  it.skipIf(!dbAvailable)('should record seed version after success', async () => {
    const em = orm.em.fork();
    const seedService = new SeedService(em);
    const seeder = new CategoriesSeeder(em, seedService);
    await seeder.seed();

    // Verify SeedVersion record was created
    const seedVersion = await em.findOne(SeedVersion, { name: 'system-categories' });
    expect(seedVersion).not.toBeNull();
    expect(seedVersion!.version).toBe('SystemCategories-v1');
    expect(seedVersion!.recordCount).toBeGreaterThan(0);
    expect(seedVersion!.sourceChecksum).toMatch(/^sha256:/);
  });

  it.skipIf(!dbAvailable)('should seed correct total count from bundle', async () => {
    const em = orm.em.fork();
    const seedService = new SeedService(em);
    const seeder = new CategoriesSeeder(em, seedService);
    const result = await seeder.seed();

    // system-categories.json has totalCategories: 50
    expect(result.count).toBe(50);

    // Verify actual count in database
    const connection = em.getConnection();
    const countResult = await connection.execute<{ count: string }[]>(
      'SELECT COUNT(*) as count FROM public.category'
    );
    expect(parseInt(countResult[0].count)).toBe(50);
  });

  it.skipIf(!dbAvailable)('should maintain hierarchy integrity', async () => {
    const em = orm.em.fork();
    const seedService = new SeedService(em);
    const seeder = new CategoriesSeeder(em, seedService);
    await seeder.seed();

    const connection = em.getConnection();

    // All ROOT categories should have no parent
    const rootsWithParent = await connection.execute<{ count: string }[]>(
      "SELECT COUNT(*) as count FROM public.category WHERE type = 'ROOT' AND parent_id IS NOT NULL"
    );
    expect(parseInt(rootsWithParent[0].count)).toBe(0);

    // All BRANCH and LEAF categories should have a parent
    const nonRootsWithoutParent = await connection.execute<{ count: string }[]>(
      "SELECT COUNT(*) as count FROM public.category WHERE type != 'ROOT' AND parent_id IS NULL"
    );
    expect(parseInt(nonRootsWithoutParent[0].count)).toBe(0);
  });
});
