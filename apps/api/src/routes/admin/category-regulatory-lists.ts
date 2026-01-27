import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { createId } from '@eurocomply/core';
import type { MikroORM } from '@eurocomply/database';
import { Category, RegulatoryList, CategoryRegulatoryList, ListRequirement } from '@eurocomply/database';
import type { Env } from '../../app.js';
import { success, error } from '../../utils/response.js';

// Schemas
const addMappingSchema = z.object({
  regulatoryListId: z.string(),
  requirement: z.nativeEnum(ListRequirement),
  priority: z.number().int().default(0).optional(),
  isExclusion: z.boolean().default(false).optional(),
  compareValueOverride: z.string().nullable().optional(),
  allowTenantExemption: z.boolean().default(true).optional(),
});

export interface CategoryRegulatoryListsRouterOptions {
  orm: MikroORM;
}

export function createCategoryRegulatoryListsRouter(options: CategoryRegulatoryListsRouterOptions) {
  const { orm } = options;
  const router = new Hono<Env>();

  // GET /admin/categories/:categoryId/regulatory-lists
  // List all regulatory lists linked to a system category
  router.get('/:categoryId/regulatory-lists', async (c) => {
    const categoryId = c.req.param('categoryId');
    const em = orm.em.fork();

    const category = await em.findOne(Category, { id: categoryId });
    if (!category) {
      return error(c, 'NOT_FOUND', 'Category not found', 404);
    }

    const mappings = await em.find(CategoryRegulatoryList,
      { category: { id: categoryId } },
      { populate: ['regulatoryList'] }
    );

    return success(c, mappings.map(m => ({
      id: m.id,
      regulatoryListId: m.regulatoryList.id,
      regulatoryListCode: m.regulatoryList.code,
      regulatoryListName: m.regulatoryList.name,
      requirement: m.requirement,
      priority: m.priority,
      isExclusion: m.isExclusion,
      compareValueOverride: m.compareValueOverride ?? null,
      allowTenantExemption: m.allowTenantExemption,
    })), { total: mappings.length });
  });

  // POST /admin/categories/:categoryId/regulatory-lists
  // Add a regulatory list to a system category
  router.post('/:categoryId/regulatory-lists', zValidator('json', addMappingSchema), async (c) => {
    const categoryId = c.req.param('categoryId');
    const body = c.req.valid('json');
    const em = orm.em.fork();

    const category = await em.findOne(Category, { id: categoryId });
    if (!category) {
      return error(c, 'NOT_FOUND', 'Category not found', 404);
    }

    const regulatoryList = await em.findOne(RegulatoryList, { id: body.regulatoryListId });
    if (!regulatoryList) {
      return error(c, 'NOT_FOUND', 'Regulatory list not found', 404);
    }

    // Check for existing mapping
    const existing = await em.findOne(CategoryRegulatoryList, {
      category: { id: categoryId },
      regulatoryList: { id: body.regulatoryListId },
    });
    if (existing) {
      return error(c, 'CONFLICT', 'Regulatory list already linked to this category', 409);
    }

    const now = new Date();
    const mapping = em.create(CategoryRegulatoryList, {
      id: createId(),
      category,
      regulatoryList,
      requirement: body.requirement,
      priority: body.priority ?? 0,
      isExclusion: body.isExclusion ?? false,
      compareValueOverride: body.compareValueOverride ?? undefined,
      allowTenantExemption: body.allowTenantExemption ?? true,
      createdAt: now,
      updatedAt: now,
    });

    await em.persistAndFlush(mapping);

    return success(c, {
      id: mapping.id,
      regulatoryListId: regulatoryList.id,
      regulatoryListCode: regulatoryList.code,
      requirement: mapping.requirement,
      priority: mapping.priority,
      isExclusion: mapping.isExclusion,
      compareValueOverride: mapping.compareValueOverride ?? null,
      allowTenantExemption: mapping.allowTenantExemption,
    }, { status: 201 });
  });

  // DELETE /admin/categories/:categoryId/regulatory-lists/:listId
  // Remove a regulatory list from a system category
  router.delete('/:categoryId/regulatory-lists/:listId', async (c) => {
    const categoryId = c.req.param('categoryId');
    const listId = c.req.param('listId');
    const em = orm.em.fork();

    const mapping = await em.findOne(CategoryRegulatoryList, {
      category: { id: categoryId },
      regulatoryList: { id: listId },
    });

    if (!mapping) {
      return error(c, 'NOT_FOUND', 'Category regulatory list mapping not found', 404);
    }

    await em.removeAndFlush(mapping);

    return success(c, { message: 'Regulatory list removed from category' });
  });

  return router;
}
