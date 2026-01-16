import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ok, err } from '@eurocomply/shared';
import { authMiddleware, userAuthMiddleware } from '../middleware/auth.js';
import {
  createOrganization,
  getOrganization,
  listUserOrganizations,
} from '../services/organization.service.js';
import type { AppVariables } from '../types/context.js';

const organizations = new Hono<{ Variables: AppVariables }>();

const createOrgSchema = z.object({
  name: z.string().min(2).max(100),
});

/**
 * POST /api/v1/organizations
 * Create a new organization.
 */
organizations.post(
  '/',
  userAuthMiddleware,
  zValidator('json', createOrgSchema),
  async (c) => {
    const { name } = c.req.valid('json');
    const user = c.get('user');

    const org = await createOrganization({
      name,
      ownerClerkId: user.clerkId,
      ownerEmail: user.email,
      ownerName: user.name ?? undefined,
    });

    return c.json(ok(org), 201);
  }
);

/**
 * GET /api/v1/organizations
 * List organizations for the current user.
 */
organizations.get('/', userAuthMiddleware, async (c) => {
  const user = c.get('user');
  const orgs = await listUserOrganizations(user.id);
  return c.json(ok(orgs));
});

/**
 * GET /api/v1/organizations/:id
 * Get organization details (requires membership).
 */
organizations.get('/:id', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const tenant = c.get('tenant');

  if (tenant.organizationId !== id) {
    return c.json(err('FORBIDDEN', 'Access denied'), 403);
  }

  const org = await getOrganization(id);
  return c.json(ok(org));
});

export { organizations };
