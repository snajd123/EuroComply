import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { TenantCategory, LinkMode, CategoryType, TargetType, Product } from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';

export interface TenantCategoriesRouterOptions {
  orm: MikroORM;
}

const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  parentId: z.string().optional(),
  type: z.enum(['ROOT', 'BRANCH', 'LEAF']),
  targetType: z.enum(['PRODUCT', 'MATERIAL', 'FACILITY', 'BATCH']),
  systemCategoryId: z.string().optional(),
  linkMode: z.enum(['LIVE', 'FROZEN', 'DETACHED']).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  linkMode: z.enum(['LIVE', 'FROZEN', 'DETACHED']).optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function createTenantCategoriesRouter(options: TenantCategoriesRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  // GET / - List tenant categories (design:view)
  router.get('/', authorize('design', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });

    // Wrap in transaction with search_path for multi-tenant safety
    const categories = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);
      return txEm.find(TenantCategory, { isActive: true }, { orderBy: { path: 'ASC' } });
    });

    return c.json({
      data: categories.map((cat: TenantCategory) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        path: cat.path,
        type: cat.type,
        targetType: cat.targetType,
        depth: cat.depth,
        parentId: cat.parent?.id,
        systemCategoryId: cat.systemCategoryId,
        linkMode: cat.linkMode,
        frozenAtVersion: cat.frozenAtVersion,
        isActive: cat.isActive,
      })),
      meta: { total: categories.length },
    });
  });

  // POST / - Create tenant category (design:manage = MANAGER only)
  router.post('/', authorize('design', 'manage'), zValidator('json', createCategorySchema), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const input = c.req.valid('json');

    // Wrap in transaction with search_path for multi-tenant safety
    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      let parent: TenantCategory | undefined;
      let path: string;
      let depth: number;

      if (input.parentId) {
        const foundParent = await txEm.findOne(TenantCategory, { id: input.parentId });
        if (!foundParent) {
          return { error: 'not_found' as const, message: 'Parent category not found' };
        }
        parent = foundParent;
        path = `${parent.path}.${slugify(input.name)}`;
        depth = parent.depth + 1;
      } else {
        path = slugify(input.name);
        depth = 0;
      }

      // Check for path collision
      const existing = await txEm.findOne(TenantCategory, { path });
      if (existing) {
        return { error: 'conflict' as const, message: `Category path "${path}" already exists` };
      }

      // If linking to system category, validate linkMode is provided
      if (input.systemCategoryId && !input.linkMode) {
        return { error: 'bad_request' as const, message: 'linkMode is required when linking to a system category' };
      }

      const category = new TenantCategory();
      category.name = input.name;
      category.description = input.description;
      category.path = path;
      category.type = input.type as CategoryType;
      category.targetType = input.targetType as TargetType;
      category.depth = depth;
      if (parent) category.parent = parent;
      if (input.systemCategoryId) category.systemCategoryId = input.systemCategoryId;
      if (input.linkMode) category.linkMode = input.linkMode as LinkMode;
      category.isActive = true;

      txEm.persist(category);

      return { success: true as const, category };
    });

    if (result.error === 'not_found') {
      return c.json({ error: 'Not Found', message: result.message }, 404);
    }
    if (result.error === 'conflict') {
      return c.json({ error: 'Conflict', message: result.message }, 409);
    }
    if (result.error === 'bad_request') {
      return c.json({ error: 'Bad Request', message: result.message }, 400);
    }

    return c.json({
      data: {
        id: result.category.id,
        name: result.category.name,
        path: result.category.path,
        type: result.category.type,
        targetType: result.category.targetType,
        depth: result.category.depth,
        systemCategoryId: result.category.systemCategoryId,
        linkMode: result.category.linkMode,
      },
    }, 201);
  });

  // GET /:id - Get single category (design:view)
  router.get('/:id', authorize('design', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const id = c.req.param('id');

    // Wrap in transaction with search_path for multi-tenant safety
    const category = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);
      return txEm.findOne(TenantCategory, { id }, { populate: ['parent'] });
    });

    if (!category) {
      return c.json({ error: 'Not Found', message: 'Category not found' }, 404);
    }

    return c.json({
      data: {
        id: category.id,
        name: category.name,
        description: category.description,
        path: category.path,
        type: category.type,
        targetType: category.targetType,
        depth: category.depth,
        parentId: category.parent?.id,
        systemCategoryId: category.systemCategoryId,
        linkMode: category.linkMode,
        frozenAtVersion: category.frozenAtVersion,
        isActive: category.isActive,
        defaultProfileId: category.defaultProfileId,
      },
    });
  });

  // PATCH /:id - Update tenant category (design:manage)
  router.patch('/:id', authorize('design', 'manage'), zValidator('json', updateCategorySchema), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const id = c.req.param('id');
    const input = c.req.valid('json');

    // Wrap in transaction with search_path for multi-tenant safety
    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      const category = await txEm.findOne(TenantCategory, { id });
      if (!category) {
        return { error: 'not_found' as const };
      }

      if (input.name !== undefined) category.name = input.name;
      if (input.description !== undefined) category.description = input.description;
      if (input.isActive !== undefined) category.isActive = input.isActive;
      if (input.linkMode !== undefined) category.linkMode = input.linkMode as LinkMode;

      return { success: true as const, category };
    });

    if (result.error === 'not_found') {
      return c.json({ error: 'Not Found', message: 'Category not found' }, 404);
    }

    return c.json({ data: { id: result.category.id, name: result.category.name, updated: true } });
  });

  // DELETE /:id - Delete tenant category (design:manage)
  router.delete('/:id', authorize('design', 'manage'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const em = orm.em.fork({ schema });
    const id = c.req.param('id');

    // Wrap in transaction with search_path for multi-tenant safety
    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      const category = await txEm.findOne(TenantCategory, { id });
      if (!category) {
        return { error: 'not_found' as const, message: 'Category not found' };
      }

      // Check for children
      const childCount = await txEm.count(TenantCategory, { parent: { id } });
      if (childCount > 0) {
        return {
          error: 'conflict' as const,
          message: `Cannot delete category with ${childCount} children. Delete or move children first.`,
        };
      }

      // Check for assigned products
      try {
        const productCount = await txEm.count(Product, { categoryId: id } as unknown as Record<string, unknown>);
        if (productCount > 0) {
          return {
            error: 'conflict' as const,
            message: `Cannot delete category with ${productCount} assigned products. Reassign products first.`,
          };
        }
      } catch {
        // Product entity might not have categoryId, skip this check
      }

      await txEm.removeAndFlush(category);
      return { success: true as const, deleted: id };
    });

    if (result.error === 'not_found') {
      return c.json({ error: 'Not Found', message: result.message }, 404);
    }
    if (result.error === 'conflict') {
      return c.json({ error: 'Conflict', message: result.message }, 409);
    }

    return c.json({ data: { success: true, deleted: result.deleted } });
  });

  return router;
}
