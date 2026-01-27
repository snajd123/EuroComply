/**
 * Category Adoption Router
 *
 * Tenant-scoped routes for adopting system categories.
 * All routes require authentication and authorization.
 *
 * IMPORTANT: Categories are stored in public schema, adoptions in tenant schema.
 * We use raw SQL queries to explicitly reference public.category for cross-schema operations.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@eurocomply/database';
import { CategoryAdoption, LinkMode, TargetType } from '@eurocomply/database';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';

// ============================================================================
// Types
// ============================================================================

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  path: string;
  target_type: string;
  depth: number;
}

// ============================================================================
// Schemas
// ============================================================================

const availableQuery = z.object({
  targetType: z.nativeEnum(TargetType).optional(),
});

// ============================================================================
// Router
// ============================================================================

export interface CategoryAdoptionRouterOptions {
  orm: MikroORM;
}

/**
 * Creates the category adoption router with database backing and tenant isolation.
 *
 * MULTI-TENANT SAFETY: All queries are wrapped in transactions with SET search_path
 * to ensure proper tenant isolation.
 */
export function createCategoryAdoptionRouter(options: CategoryAdoptionRouterOptions) {
  const { orm } = options;
  const router = new Hono<Env>();

  // GET / - List adopted categories for current tenant
  router.get('/', authorize('design', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      // Get all adoptions from tenant schema
      const adoptions = await txEm.find(CategoryAdoption, {});

      if (adoptions.length === 0) {
        return [];
      }

      // Get category details from public schema using raw SQL
      const categoryIds = adoptions.map(a => a.systemCategoryId);
      const placeholders = categoryIds.map(() => '?').join(', ');
      const categories = await txEm.execute<CategoryRow[]>(
        `SELECT id, name, description, path, target_type, depth
         FROM public.category
         WHERE id IN (${placeholders})`,
        categoryIds
      );

      return categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        path: cat.path,
        targetType: cat.target_type,
        depth: cat.depth,
      }));
    });

    return c.json({
      data: result,
      meta: { total: result.length },
    });
  });

  // GET /available - List categories available for adoption
  router.get('/available', authorize('design', 'view'), zValidator('query', availableQuery), async (c) => {
    const schema = c.get('tenantSchema')!;
    const query = c.req.valid('query');
    const em = orm.em.fork({ schema });

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      // Get all adoptions from tenant schema
      const adoptions = await txEm.find(CategoryAdoption, {});
      const adoptedIds = new Set(adoptions.map(a => a.systemCategoryId));

      // Get all categories from public schema, optionally filtered by targetType
      let sql = 'SELECT id, name, description, path, target_type, depth FROM public.category WHERE is_active = true';
      const params: unknown[] = [];

      if (query.targetType) {
        sql += ' AND target_type = ?';
        params.push(query.targetType);
      }

      sql += ' ORDER BY path';

      const allCategories = await txEm.execute<CategoryRow[]>(sql, params);

      // Filter out already adopted categories
      return allCategories
        .filter(cat => !adoptedIds.has(cat.id))
        .map((cat) => ({
          id: cat.id,
          name: cat.name,
          description: cat.description,
          path: cat.path,
          targetType: cat.target_type,
          depth: cat.depth,
        }));
    });

    return c.json({
      data: result,
      meta: { total: result.length },
    });
  });

  // POST /:categoryId - Adopt a system category
  router.post('/:categoryId', authorize('design', 'edit'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const categoryId = c.req.param('categoryId');
    const em = orm.em.fork({ schema });

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      // First check if category exists in public schema
      const categoryRows = await txEm.execute<Array<{ id: string; name: string }>>(
        'SELECT id, name FROM public.category WHERE id = ?',
        [categoryId]
      );

      if (categoryRows.length === 0) {
        return { error: 'not_found' as const };
      }

      const categoryName = categoryRows[0]!.name;

      // Check if already adopted in tenant schema
      const existing = await txEm.findOne(CategoryAdoption, {
        systemCategoryId: categoryId,
      });

      if (existing) {
        return { error: 'conflict' as const, message: `Category ${categoryId} is already adopted by tenant` };
      }

      // Create adoption record
      const adoption = new CategoryAdoption();
      adoption.systemCategoryId = categoryId;
      adoption.mode = LinkMode.LIVE;
      adoption.adoptedAt = new Date();

      txEm.persist(adoption);

      return {
        success: true as const,
        adoption,
        categoryName,
      };
    });

    if (result.error === 'not_found') {
      return c.json(
        { error: 'Not Found', message: 'Category not found' },
        404
      );
    }

    if (result.error === 'conflict') {
      return c.json(
        { error: 'Conflict', message: result.message },
        409
      );
    }

    return c.json(
      {
        data: {
          id: result.adoption.id,
          categoryId: result.adoption.systemCategoryId,
          categoryName: result.categoryName,
          adoptedAt: result.adoption.adoptedAt.toISOString(),
        },
      },
      201
    );
  });

  // DELETE /:categoryId - Remove category adoption
  router.delete('/:categoryId', authorize('design', 'edit'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const categoryId = c.req.param('categoryId');
    const em = orm.em.fork({ schema });

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      // Find adoption in tenant schema
      const adoption = await txEm.findOne(CategoryAdoption, {
        systemCategoryId: categoryId,
      });

      if (!adoption) {
        return { error: 'not_found' as const, message: `Category ${categoryId} is not adopted by tenant` };
      }

      await txEm.removeAndFlush(adoption);
      return { success: true as const };
    });

    if (result.error === 'not_found') {
      return c.json(
        { error: 'Not Found', message: result.message },
        404
      );
    }

    return c.json({
      message: 'Category adoption removed successfully',
    });
  });

  return router;
}
