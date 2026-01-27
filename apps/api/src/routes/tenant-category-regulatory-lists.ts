import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@eurocomply/database';
import { TenantCategory, TenantCategoryRegulatoryList, ComplianceStackResolver, ListRequirement, RegulationSource, assertValidSchemaName } from '@eurocomply/database';
import { isCuid } from '@eurocomply/core';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';
import { success, error } from '../utils/response.js';

/**
 * Validates that an ID parameter is a valid CUID format.
 * Returns 400 error if invalid.
 */
function validateIdParam(id: string, paramName: string): string | null {
  if (!id || !isCuid(id)) {
    return `Invalid ${paramName} format`;
  }
  return null;
}

const addTenantRegulationSchema = z.object({
  regulatoryListId: z.string(),
  requirement: z.nativeEnum(ListRequirement),
  overrideThreshold: z.string().optional(),
});

const createExemptionSchema = z.object({
  reason: z.string().min(10, 'Exemption reason must be at least 10 characters'),
  legalRef: z.string().optional(),
});

export interface TenantCategoryRegulatoryListsRouterOptions {
  orm: MikroORM;
}

export function createTenantCategoryRegulatoryListsRouter(options: TenantCategoryRegulatoryListsRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  // GET /:id/regulatory-lists - Get compliance stack
  router.get('/:id/regulatory-lists', authorize('compliance', 'view'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const tenantCategoryId = c.req.param('id');

    // Defense-in-depth: validate schema name even though middleware should have validated
    try {
      assertValidSchemaName(schema);
    } catch {
      return error(c, 'BAD_REQUEST', 'Invalid tenant schema', 400);
    }

    // Validate ID parameter format
    const idError = validateIdParam(tenantCategoryId, 'tenant category ID');
    if (idError) {
      return error(c, 'BAD_REQUEST', idError, 400);
    }

    const em = orm.em.fork({ schema });

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      const tenantCategory = await txEm.findOne(TenantCategory, { id: tenantCategoryId });
      if (!tenantCategory) {
        return { error: 'not_found' as const };
      }

      const resolver = new ComplianceStackResolver(txEm);
      return { success: true as const, data: await resolver.resolve(tenantCategoryId) };
    });

    if (result.error === 'not_found') {
      return error(c, 'NOT_FOUND', 'Tenant category not found', 404);
    }

    return success(c, result.data);
  });

  // POST /:id/regulatory-lists - Add tenant-specific regulation
  router.post('/:id/regulatory-lists', authorize('compliance', 'edit'), zValidator('json', addTenantRegulationSchema), async (c) => {
    const schema = c.get('tenantSchema')!;
    const tenantCategoryId = c.req.param('id');
    const body = c.req.valid('json');

    // Defense-in-depth: validate schema name
    try {
      assertValidSchemaName(schema);
    } catch {
      return error(c, 'BAD_REQUEST', 'Invalid tenant schema', 400);
    }

    // Validate ID parameter format
    const idError = validateIdParam(tenantCategoryId, 'tenant category ID');
    if (idError) {
      return error(c, 'BAD_REQUEST', idError, 400);
    }

    // Validate regulatory list ID format
    const listIdError = validateIdParam(body.regulatoryListId, 'regulatory list ID');
    if (listIdError) {
      return error(c, 'BAD_REQUEST', listIdError, 400);
    }

    const em = orm.em.fork({ schema });

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      const tenantCategory = await txEm.findOne(TenantCategory, { id: tenantCategoryId });
      if (!tenantCategory) {
        return { error: 'not_found' as const, message: 'Tenant category not found' };
      }

      const [listCheck] = await txEm.execute<Array<{ id: string }>>(`
        SELECT id FROM public.regulatory_list WHERE id = ? AND is_current_version = true
      `, [body.regulatoryListId]);
      if (!listCheck) {
        return { error: 'not_found' as const, message: 'Regulatory list not found' };
      }

      const existing = await txEm.findOne(TenantCategoryRegulatoryList, {
        tenantCategory: { id: tenantCategoryId },
        regulatoryListId: body.regulatoryListId,
      });
      if (existing) {
        return { error: 'conflict' as const, message: 'Regulatory list already linked to this category' };
      }

      const mapping = new TenantCategoryRegulatoryList();
      mapping.tenantCategory = tenantCategory;
      mapping.regulatoryListId = body.regulatoryListId;
      mapping.requirement = body.requirement;
      mapping.source = RegulationSource.TENANT_ADDED;
      mapping.isExempted = false;
      if (body.overrideThreshold) {
        mapping.overrideThreshold = body.overrideThreshold;
      }

      txEm.persist(mapping);
      return { success: true as const, mapping };
    });

    if (result.error === 'not_found') {
      return error(c, 'NOT_FOUND', result.message, 404);
    }
    if (result.error === 'conflict') {
      return error(c, 'CONFLICT', result.message, 409);
    }

    return success(c, {
      id: result.mapping.id,
      regulatoryListId: result.mapping.regulatoryListId,
      requirement: result.mapping.requirement,
      source: result.mapping.source,
      overrideThreshold: result.mapping.overrideThreshold ?? null,
    }, { status: 201 });
  });

  // POST /:id/regulatory-lists/:listId/exempt - Create exemption
  router.post('/:id/regulatory-lists/:listId/exempt', authorize('compliance', 'edit'), zValidator('json', createExemptionSchema), async (c) => {
    const schema = c.get('tenantSchema')!;
    const tenantCategoryId = c.req.param('id');
    const listId = c.req.param('listId');
    const body = c.req.valid('json');
    const userId = c.get('userId');

    // Defense-in-depth: validate schema name
    try {
      assertValidSchemaName(schema);
    } catch {
      return error(c, 'BAD_REQUEST', 'Invalid tenant schema', 400);
    }

    // Validate ID parameters format
    const idError = validateIdParam(tenantCategoryId, 'tenant category ID');
    if (idError) {
      return error(c, 'BAD_REQUEST', idError, 400);
    }
    const listIdError = validateIdParam(listId, 'regulatory list ID');
    if (listIdError) {
      return error(c, 'BAD_REQUEST', listIdError, 400);
    }

    const em = orm.em.fork({ schema });

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      const tenantCategory = await txEm.findOne(TenantCategory, { id: tenantCategoryId });
      if (!tenantCategory) {
        return { error: 'not_found' as const, message: 'Tenant category not found' };
      }

      // Verify the regulatory list exists
      const [listCheck] = await txEm.execute<Array<{ id: string }>>(`
        SELECT id FROM public.regulatory_list WHERE id = ? AND is_current_version = true
      `, [listId]);
      if (!listCheck) {
        return { error: 'not_found' as const, message: 'Regulatory list not found' };
      }

      const [systemMapping] = await txEm.execute<Array<{ allow_tenant_exemption: boolean }>>(`
        SELECT crl.allow_tenant_exemption
        FROM public.category_regulatory_list crl
        WHERE crl.category_id = ? AND crl.regulatory_list_id = ?
      `, [tenantCategory.systemCategoryId, listId]);

      if (systemMapping && !systemMapping.allow_tenant_exemption) {
        return { error: 'forbidden' as const, message: 'This regulatory list does not allow exemptions' };
      }

      let mapping = await txEm.findOne(TenantCategoryRegulatoryList, {
        tenantCategory: { id: tenantCategoryId },
        regulatoryListId: listId,
      });

      if (mapping && mapping.source === RegulationSource.TENANT_ADDED) {
        return { error: 'invalid' as const, message: 'Cannot exempt tenant-added regulations - delete instead' };
      }

      if (!mapping) {
        const [sysReq] = await txEm.execute<Array<{ requirement: string }>>(`
          SELECT crl.requirement
          FROM public.category_regulatory_list crl
          WHERE crl.category_id = ? AND crl.regulatory_list_id = ?
        `, [tenantCategory.systemCategoryId, listId]);

        mapping = new TenantCategoryRegulatoryList();
        mapping.tenantCategory = tenantCategory;
        mapping.regulatoryListId = listId;
        mapping.requirement = (sysReq?.requirement as ListRequirement) ?? ListRequirement.MANDATORY;
        mapping.source = RegulationSource.INHERITED;
        txEm.persist(mapping);
      }

      mapping.isExempted = true;
      mapping.exemptionReason = body.reason;
      mapping.exemptionLegalRef = body.legalRef;
      mapping.exemptedBy = userId;
      mapping.exemptedAt = new Date();

      return { success: true as const, mapping };
    });

    if (result.error === 'not_found') {
      return error(c, 'NOT_FOUND', result.message, 404);
    }
    if (result.error === 'forbidden') {
      return error(c, 'FORBIDDEN', result.message, 403);
    }
    if (result.error === 'invalid') {
      return error(c, 'BAD_REQUEST', result.message, 400);
    }

    return success(c, {
      id: result.mapping.id,
      regulatoryListId: result.mapping.regulatoryListId,
      isExempted: true,
      exemptionReason: result.mapping.exemptionReason ?? null,
      exemptionLegalRef: result.mapping.exemptionLegalRef ?? null,
      exemptedBy: result.mapping.exemptedBy ?? null,
      exemptedAt: result.mapping.exemptedAt?.toISOString() ?? null,
    });
  });

  // DELETE /:id/regulatory-lists/:listId/exempt - Remove exemption
  router.delete('/:id/regulatory-lists/:listId/exempt', authorize('compliance', 'edit'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const tenantCategoryId = c.req.param('id');
    const listId = c.req.param('listId');

    // Defense-in-depth: validate schema name
    try {
      assertValidSchemaName(schema);
    } catch {
      return error(c, 'BAD_REQUEST', 'Invalid tenant schema', 400);
    }

    // Validate ID parameters format
    const idError = validateIdParam(tenantCategoryId, 'tenant category ID');
    if (idError) {
      return error(c, 'BAD_REQUEST', idError, 400);
    }
    const listIdError = validateIdParam(listId, 'regulatory list ID');
    if (listIdError) {
      return error(c, 'BAD_REQUEST', listIdError, 400);
    }

    const em = orm.em.fork({ schema });

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      const mapping = await txEm.findOne(TenantCategoryRegulatoryList, {
        tenantCategory: { id: tenantCategoryId },
        regulatoryListId: listId,
      });

      if (!mapping || !mapping.isExempted) {
        return { error: 'not_found' as const };
      }

      mapping.isExempted = false;
      mapping.exemptionReason = undefined;
      mapping.exemptionLegalRef = undefined;
      mapping.exemptedBy = undefined;
      mapping.exemptedAt = undefined;

      if (mapping.source === RegulationSource.INHERITED) {
        txEm.remove(mapping);
      }

      return { success: true as const };
    });

    if (result.error === 'not_found') {
      return error(c, 'NOT_FOUND', 'Exemption not found', 404);
    }

    return success(c, { message: 'Exemption removed' });
  });

  // DELETE /:id/regulatory-lists/:listId - Remove tenant-added regulation
  router.delete('/:id/regulatory-lists/:listId', authorize('compliance', 'edit'), async (c) => {
    const schema = c.get('tenantSchema')!;
    const tenantCategoryId = c.req.param('id');
    const listId = c.req.param('listId');

    // Defense-in-depth: validate schema name
    try {
      assertValidSchemaName(schema);
    } catch {
      return error(c, 'BAD_REQUEST', 'Invalid tenant schema', 400);
    }

    // Validate ID parameters format
    const idError = validateIdParam(tenantCategoryId, 'tenant category ID');
    if (idError) {
      return error(c, 'BAD_REQUEST', idError, 400);
    }
    const listIdError = validateIdParam(listId, 'regulatory list ID');
    if (listIdError) {
      return error(c, 'BAD_REQUEST', listIdError, 400);
    }

    const em = orm.em.fork({ schema });

    const result = await em.transactional(async (txEm) => {
      await txEm.execute(`SET search_path TO "${schema}", public`);

      const mapping = await txEm.findOne(TenantCategoryRegulatoryList, {
        tenantCategory: { id: tenantCategoryId },
        regulatoryListId: listId,
      });

      if (!mapping) {
        return { error: 'not_found' as const };
      }

      if (mapping.source !== RegulationSource.TENANT_ADDED) {
        return { error: 'invalid' as const };
      }

      txEm.remove(mapping);
      return { success: true as const };
    });

    if (result.error === 'not_found') {
      return error(c, 'NOT_FOUND', 'Tenant regulatory list mapping not found', 404);
    }
    if (result.error === 'invalid') {
      return error(c, 'BAD_REQUEST', 'Cannot delete inherited regulations - use exemption instead', 400);
    }

    return success(c, { message: 'Tenant regulation removed' });
  });

  return router;
}
