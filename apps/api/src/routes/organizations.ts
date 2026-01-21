import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createId } from '@eurocomply/core';

// In-memory store for testing (will be replaced with MikroORM)
const organizations: Map<string, Organization> = new Map();

interface Organization {
  id: string;
  name: string;
  schemaName: string;
  clerkOrgId?: string;
  regulatoryAdvisorEnabled: boolean;
  enforcementMode: 'ENFORCING' | 'SILENT';
  captureComplianceInSilentMode: boolean;
  kmsKeyArn?: string;
  createdAt: string;
  updatedAt: string;
}

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  schemaName: z.string().min(1).max(63).regex(/^tenant_[a-z0-9_]+$/),
  clerkOrgId: z.string().optional(),
  regulatoryAdvisorEnabled: z.boolean().default(true),
  enforcementMode: z.enum(['ENFORCING', 'SILENT']).default('SILENT'),
  captureComplianceInSilentMode: z.boolean().default(true),
});

export const organizationsRouter = new Hono();

// List organizations
organizationsRouter.get('/', (c) => {
  const orgs = Array.from(organizations.values());
  return c.json({
    data: orgs,
    meta: { total: orgs.length },
  });
});

// Create organization
organizationsRouter.post(
  '/',
  zValidator('json', createOrganizationSchema),
  (c) => {
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const org: Organization = {
      id: createId(),
      name: body.name,
      schemaName: body.schemaName,
      clerkOrgId: body.clerkOrgId,
      regulatoryAdvisorEnabled: body.regulatoryAdvisorEnabled,
      enforcementMode: body.enforcementMode,
      captureComplianceInSilentMode: body.captureComplianceInSilentMode,
      createdAt: now,
      updatedAt: now,
    };

    organizations.set(org.id, org);

    return c.json({ data: org }, 201);
  }
);

// Get organization by ID
organizationsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const org = organizations.get(id);

  if (!org) {
    return c.json({ error: 'Not Found', message: 'Organization not found' }, 404);
  }

  return c.json({ data: org });
});
