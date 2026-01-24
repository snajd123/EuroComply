import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { User, OrganizationUser } from '@eurocomply/database';
import type { MikroORM } from '@eurocomply/database';
import {
  organizationsRouter,
  createOrganizationsRouter,
} from './routes/organizations.js';
import { productsRouter, createProductsRouter } from './routes/products.js';
import { createApiKeysRouter } from './routes/api-keys.js';
import { createUnitsRouter, type UnitsRepository } from './routes/taxonomy/index.js';
import { tenantMiddleware, createTenantMiddlewareWithApiKeys } from './middleware/tenant.js';
import { adminAuthMiddleware } from './middleware/admin-auth.js';
import { createUserMiddleware } from './middleware/user.js';

export type Env = {
  Variables: {
    tenantSchema?: string;
    userId?: string;
    webhookPayload?: unknown;
    user?: User;
    membership?: OrganizationUser;
  };
};

export interface AppDependencies {
  /** MikroORM instance for database-backed routes */
  orm?: MikroORM;
  webhooksRouter?: Hono;
  organizationsAdminRouter?: Hono;
  unitsRepository?: UnitsRepository;
}

export function createApp(deps?: AppDependencies): Hono<Env> {
  const app = new Hono<Env>();

  // Global middleware
  app.use('*', logger());
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
      credentials: true,
    })
  );

  // Create user middleware if orm is available
  const userMiddleware = deps?.orm
    ? createUserMiddleware({ orm: deps.orm as any })
    : undefined;

  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Webhooks (no CORS, no auth - signature verified)
  if (deps?.webhooksRouter) {
    app.route('/webhooks', deps.webhooksRouter);
  }

  // API version prefix
  const v1 = new Hono<Env>();

  v1.get('/', (c) => {
    return c.json({ message: 'EuroComply API v1' });
  });

  // Admin routes (protected by API key)
  // All organization management requires admin authentication
  v1.use('/admin/*', adminAuthMiddleware());

  if (deps?.orm) {
    // Organizations list/get - admin only
    v1.route('/admin/organizations', createOrganizationsRouter({ orm: deps.orm }));
  } else {
    v1.route('/admin/organizations', organizationsRouter);
  }

  // Additional admin operations (status, provision, delete)
  if (deps?.organizationsAdminRouter) {
    v1.route('/admin/organizations', deps.organizationsAdminRouter);
  }

  // API key management routes (JWT-only authentication)
  // These routes allow tenants to create, list, and revoke their API keys
  if (deps?.orm) {
    v1.use('/api-keys/*', tenantMiddleware); // JWT only for key management
    if (userMiddleware) {
      v1.use('/api-keys/*', userMiddleware);
    }
    v1.route('/api-keys', createApiKeysRouter({ em: deps.orm.em as any }));
  }

  // Taxonomy routes (public, no auth required)
  const taxonomy = new Hono<Env>();
  if (deps?.unitsRepository) {
    taxonomy.route('/units', createUnitsRouter(deps.unitsRepository));
  }
  v1.route('/taxonomy', taxonomy);

  // Tenant-scoped routes (require authentication via JWT or API key)
  // Apply tenant middleware explicitly to each protected route
  // This avoids catch-all patterns that would interfere with admin routes
  if (deps?.orm) {
    // Products: Apply tenant + user middleware
    v1.use('/products/*', createTenantMiddlewareWithApiKeys(deps.orm.em as any));
    if (userMiddleware) {
      v1.use('/products/*', userMiddleware);
    }
    v1.route('/products', createProductsRouter({ orm: deps.orm }));
  } else {
    // Without ORM: JWT-only authentication (for testing)
    v1.use('/products/*', tenantMiddleware);
    v1.route('/products', productsRouter);
  }

  app.route('/api/v1', v1);

  return app;
}
