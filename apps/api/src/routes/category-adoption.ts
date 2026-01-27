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
import { CategoryAdoption, LinkMode, TargetType, TenantCategory, CategoryType, slugify, ComplianceStackResolver } from '@eurocomply/database';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';
import { success, error } from '../utils/response.js';

// ============================================================================
// Types
// ============================================================================

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  path: string;
  type: string;
  target_type: string;
  depth: number;
  version: number;
}


// ============================================================================
// Schemas
// ============================================================================

const availableQuery = z.object({
  targetType: z.nativeEnum(TargetType).optional(),
});

const changeModeSchema = z.object({
  mode: z.nativeEnum(LinkMode),
});

const syncQuerySchema = z.object({
  dryRun: z.string().optional().transform(val => val === 'true'),
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

    return success(c, result, { total: result.length });
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

    return success(c, result, { total: result.length });
  });

  // POST /:categoryId - Adopt a system category
  router.post('/:categoryId', authorize('design', 'edit'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const categoryId = c.req.param('categoryId');
    const em = orm.em.fork({ schema });

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      // First check if category exists in public schema with all needed fields
      const categoryRows = await txEm.execute<Array<{
        id: string;
        name: string;
        description: string | null;
        path: string;
        type: string;
        target_type: string;
        depth: number;
        version: number;
      }>>(
        'SELECT id, name, description, path, type, target_type, depth, version FROM public.category WHERE id = ?',
        [categoryId]
      );

      if (categoryRows.length === 0) {
        return { error: 'not_found' as const };
      }

      const systemCategory = categoryRows[0]!;

      // Check if already adopted in tenant schema
      const existing = await txEm.findOne(CategoryAdoption, {
        systemCategoryId: categoryId,
      });

      if (existing) {
        return { error: 'conflict' as const, message: `Category ${categoryId} is already adopted by tenant` };
      }

      // Create TenantCategory with system.* prefix path
      const tenantCategory = new TenantCategory();
      tenantCategory.name = systemCategory.name;
      tenantCategory.description = systemCategory.description ?? undefined;
      tenantCategory.path = `system.${slugify(systemCategory.name)}`;
      tenantCategory.type = systemCategory.type as CategoryType;
      tenantCategory.targetType = systemCategory.target_type as TargetType;
      tenantCategory.depth = 0; // Root in tenant hierarchy
      tenantCategory.systemCategoryId = categoryId;
      tenantCategory.linkMode = LinkMode.LIVE;
      tenantCategory.isActive = true;

      txEm.persist(tenantCategory);

      // Create adoption record linked to the TenantCategory
      const adoption = new CategoryAdoption();
      adoption.systemCategoryId = categoryId;
      adoption.mode = LinkMode.LIVE;
      adoption.adoptedAt = new Date();
      adoption.adoptedVersion = systemCategory.version;
      adoption.localCategory = tenantCategory;

      txEm.persist(adoption);

      return {
        success: true as const,
        adoption,
        tenantCategory,
      };
    });

    if (result.error === 'not_found') {
      return error(c, 'NOT_FOUND', 'Category not found', 404);
    }

    if (result.error === 'conflict') {
      return error(c, 'CONFLICT', result.message, 409);
    }

    return success(c, {
      adoption: {
        id: result.adoption.id,
        systemCategoryId: result.adoption.systemCategoryId,
        mode: result.adoption.mode,
        adoptedAt: result.adoption.adoptedAt.toISOString(),
        adoptedVersion: result.adoption.adoptedVersion,
      },
      tenantCategory: {
        id: result.tenantCategory.id,
        name: result.tenantCategory.name,
        path: result.tenantCategory.path,
        systemCategoryId: result.tenantCategory.systemCategoryId,
        linkMode: result.tenantCategory.linkMode,
      },
    }, { status: 201 });
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
      return error(c, 'NOT_FOUND', result.message, 404);
    }

    return success(c, { message: 'Category adoption removed successfully' });
  });

  // PATCH /:categoryId - Change link mode of an adopted category
  router.patch('/:categoryId', authorize('design', 'edit'), zValidator('json', changeModeSchema), async (c) => {
    const schema = c.get('tenantSchema')!;
    const categoryId = c.req.param('categoryId');
    const body = c.req.valid('json');
    const em = orm.em.fork({ schema });

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      // Find adoption
      const adoption = await txEm.findOne(CategoryAdoption, {
        systemCategoryId: categoryId,
      }, { populate: ['localCategory'] });

      if (!adoption) {
        return { error: 'not_found' as const };
      }

      // Validate transition
      if (adoption.mode === LinkMode.DETACHED) {
        return { error: 'invalid_transition' as const, message: 'Cannot change mode from DETACHED - detachment is permanent' };
      }

      const newMode = body.mode;
      const tenantCategory = adoption.localCategory;

      // Handle mode transitions
      if (newMode === LinkMode.FROZEN) {
        // Capture current version
        const categoryRows = await txEm.execute<Array<{ version: number }>>(
          'SELECT version FROM public.category WHERE id = ?',
          [categoryId]
        );
        adoption.frozenAtVersion = categoryRows[0]?.version ?? 1;
        adoption.updateAvailable = false;
        if (tenantCategory) {
          tenantCategory.linkMode = LinkMode.FROZEN;
          tenantCategory.frozenAtVersion = adoption.frozenAtVersion;

          // Capture pinnedRegulatoryListIds from current compliance stack
          const resolver = new ComplianceStackResolver(txEm);
          const stackResult = await resolver.resolve(tenantCategory.id);
          const regulatoryListIds = stackResult.effectiveRegulations
            .filter(reg => reg.status === 'ACTIVE')
            .map(reg => reg.regulatoryListId);
          adoption.pinnedRegulatoryListIds = regulatoryListIds.length > 0 ? regulatoryListIds : undefined;
        }
      } else if (newMode === LinkMode.LIVE) {
        // Sync to latest - need CategoryRow interface
        const categoryRows = await txEm.execute<Array<{ id: string; name: string; description: string | null; version: number }>>(
          'SELECT id, name, description, version FROM public.category WHERE id = ?',
          [categoryId]
        );
        const systemCategory = categoryRows[0];
        if (systemCategory && tenantCategory) {
          tenantCategory.name = systemCategory.name;
          tenantCategory.description = systemCategory.description ?? undefined;
          tenantCategory.linkMode = LinkMode.LIVE;
          tenantCategory.frozenAtVersion = undefined;
        }
        adoption.frozenAtVersion = undefined;
        adoption.updateAvailable = false;
        adoption.adoptedVersion = systemCategory?.version ?? adoption.adoptedVersion;
        // Clear pinnedRegulatoryListIds when going back to LIVE
        adoption.pinnedRegulatoryListIds = undefined;
      } else if (newMode === LinkMode.DETACHED) {
        // Clear systemCategoryId on TenantCategory (becomes custom category)
        if (tenantCategory) {
          tenantCategory.systemCategoryId = undefined;
          tenantCategory.linkMode = undefined;
          tenantCategory.frozenAtVersion = undefined;
        }
      }

      adoption.mode = newMode;

      return { success: true as const, adoption };
    });

    if (result.error === 'not_found') {
      return error(c, 'NOT_FOUND', 'Category adoption not found', 404);
    }

    if (result.error === 'invalid_transition') {
      return error(c, 'INVALID_TRANSITION', result.message, 400);
    }

    return success(c, {
      id: result.adoption.id,
      systemCategoryId: result.adoption.systemCategoryId,
      mode: result.adoption.mode,
      frozenAtVersion: result.adoption.frozenAtVersion ?? null,
      updateAvailable: result.adoption.updateAvailable,
      pinnedRegulatoryListIds: result.adoption.pinnedRegulatoryListIds ?? null,
    });
  });

  // POST /:categoryId/sync - Manual sync for FROZEN mode
  router.post('/:categoryId/sync', authorize('design', 'edit'), zValidator('query', syncQuerySchema), async (c) => {
    const schema = c.get('tenantSchema')!;
    const categoryId = c.req.param('categoryId');
    const { dryRun } = c.req.valid('query');
    const em = orm.em.fork({ schema });

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      // Find adoption with TenantCategory
      const adoption = await txEm.findOne(CategoryAdoption, {
        systemCategoryId: categoryId,
      }, { populate: ['localCategory'] });

      if (!adoption) {
        return { error: 'not_found' as const };
      }

      const tenantCategory = adoption.localCategory;

      // Get current system category
      const categoryRows = await txEm.execute<CategoryRow[]>(
        'SELECT id, name, description, path, target_type, type, depth, version FROM public.category WHERE id = ?',
        [categoryId]
      );

      if (categoryRows.length === 0) {
        return { error: 'system_not_found' as const };
      }

      const systemCategory = categoryRows[0]!;
      const previousVersion = adoption.frozenAtVersion ?? adoption.adoptedVersion ?? 1;

      // Calculate diff
      const changes: Record<string, { from: string | null; to: string | null }> = {};

      if (tenantCategory) {
        if (tenantCategory.name !== systemCategory.name) {
          changes['name'] = { from: tenantCategory.name, to: systemCategory.name };
        }
        if ((tenantCategory.description ?? null) !== systemCategory.description) {
          changes['description'] = { from: tenantCategory.description ?? null, to: systemCategory.description };
        }
      }

      // If dry run, return diff without applying
      if (dryRun) {
        return {
          success: true as const,
          synced: false,
          dryRun: true,
          previousVersion,
          currentVersion: systemCategory.version,
          changes,
        };
      }

      // Apply sync
      if (tenantCategory) {
        tenantCategory.name = systemCategory.name;
        tenantCategory.description = systemCategory.description ?? undefined;
      }

      adoption.frozenAtVersion = systemCategory.version;
      adoption.adoptedVersion = systemCategory.version;
      adoption.updateAvailable = false;

      return {
        success: true as const,
        synced: true,
        dryRun: false,
        previousVersion,
        currentVersion: systemCategory.version,
        changes,
      };
    });

    if (result.error === 'not_found') {
      return error(c, 'NOT_FOUND', 'Category adoption not found', 404);
    }

    if (result.error === 'system_not_found') {
      return error(c, 'NOT_FOUND', 'System category no longer exists', 404);
    }

    return success(c, {
      synced: result.synced,
      dryRun: result.dryRun,
      previousVersion: result.previousVersion,
      currentVersion: result.currentVersion,
      changes: result.changes,
    });
  });

  return router;
}
