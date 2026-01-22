import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import {
  organizationsRouter,
  createOrganizationsRouter,
  type OrmLike,
} from './routes/organizations.js';
import { productsRouter, createProductsRouter } from './routes/products.js';
import { tenantMiddleware } from './middleware/tenant.js';

export type Env = {
  Variables: {
    tenantSchema?: string;
    userId?: string;
    webhookPayload?: unknown;
  };
};

export interface AppDependencies {
  /** MikroORM instance for database-backed routes */
  orm?: OrmLike;
  webhooksRouter?: Hono;
  organizationsAdminRouter?: Hono;
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

  // Public routes (no tenant middleware)
  // Use database-backed router if ORM is provided, otherwise fallback to in-memory
  if (deps?.orm) {
    v1.route('/organizations', createOrganizationsRouter({ orm: deps.orm }));
  } else {
    v1.route('/organizations', organizationsRouter);
  }

  // Internal admin routes (should be behind additional auth in production)
  // Must be registered BEFORE tenant routes to avoid middleware conflict
  if (deps?.organizationsAdminRouter) {
    v1.route('/admin/organizations', deps.organizationsAdminRouter);
  }

  // Tenant-scoped routes (require authentication)
  // Apply tenant middleware explicitly to each protected route
  // This avoids catch-all patterns that would interfere with admin routes
  v1.use('/products/*', tenantMiddleware);
  if (deps?.orm) {
    v1.route('/products', createProductsRouter({ orm: deps.orm }));
  } else {
    v1.route('/products', productsRouter);
  }

  app.route('/api/v1', v1);

  return app;
}
