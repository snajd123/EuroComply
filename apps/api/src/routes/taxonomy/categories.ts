// apps/api/src/routes/taxonomy/categories.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { CategoryType, TargetType } from '@eurocomply/database';
import { success, error } from '../../utils/response.js';

// ============================================================================
// Types
// ============================================================================

export interface CategoryData {
  id: string;
  name: string;
  description?: string;
  path: string;
  type: CategoryType;
  targetType: string;
  depth: number;
  parentId?: string;
  isActive: boolean;
}

export interface CategoriesRepository {
  findAll(filter?: { targetType?: string; depth?: number; active?: boolean }): Promise<CategoryData[]>;
  findById(id: string): Promise<CategoryData | null>;
  findByPath(path: string): Promise<CategoryData | null>;
  findRoots(targetType?: string): Promise<CategoryData[]>;
  findChildren(parentId: string): Promise<CategoryData[]>;
  findAncestors(id: string): Promise<CategoryData[]>;
}

// ============================================================================
// Schemas
// ============================================================================

const listCategoriesQuery = z.object({
  targetType: z.nativeEnum(TargetType).optional(),
  depth: z.string().transform(v => parseInt(v, 10)).refine(v => !isNaN(v) && v >= 0, 'depth must be a non-negative integer').optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

const rootsQuery = z.object({
  targetType: z.nativeEnum(TargetType).optional(),
});

// ============================================================================
// Router
// ============================================================================

export function createCategoriesRouter(repo: CategoriesRepository) {
  const router = new Hono();

  // GET /categories - List all categories with optional filters
  router.get('/', zValidator('query', listCategoriesQuery), async (c) => {
    const query = c.req.valid('query');

    const filter: Parameters<typeof repo.findAll>[0] = {};
    if (query.targetType) filter.targetType = query.targetType;
    if (query.depth !== undefined) filter.depth = query.depth;
    if (query.active !== undefined) filter.active = query.active;

    const categories = await repo.findAll(filter);

    return success(c, categories, { total: categories.length });
  });

  // GET /categories/roots - Get root categories (depth=0)
  // Note: Must be before /:id to avoid matching "roots" as an ID
  router.get('/roots', zValidator('query', rootsQuery), async (c) => {
    const query = c.req.valid('query');
    const categories = await repo.findRoots(query.targetType);

    return success(c, categories, { total: categories.length });
  });

  // GET /categories/:id - Get single category by ID
  router.get('/:id', async (c) => {
    const id = c.req.param('id');
    const category = await repo.findById(id);

    if (!category) {
      return error(c, 'NOT_FOUND', 'Category not found', 404);
    }

    return success(c, category);
  });

  // GET /categories/:id/children - Get direct children of a category
  router.get('/:id/children', async (c) => {
    const id = c.req.param('id');

    // First verify the parent exists
    const parent = await repo.findById(id);
    if (!parent) {
      return error(c, 'NOT_FOUND', 'Category not found', 404);
    }

    const children = await repo.findChildren(id);

    return success(c, children, { total: children.length });
  });

  // GET /categories/:id/ancestors - Get breadcrumb trail (ancestors ordered by depth)
  router.get('/:id/ancestors', async (c) => {
    const id = c.req.param('id');

    // First verify the category exists
    const category = await repo.findById(id);
    if (!category) {
      return error(c, 'NOT_FOUND', 'Category not found', 404);
    }

    const ancestors = await repo.findAncestors(id);

    return success(c, ancestors, { total: ancestors.length });
  });

  return router;
}
