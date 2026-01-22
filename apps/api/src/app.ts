import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { organizationsRouter } from './routes/organizations.js';
import { productsRouter } from './routes/products.js';
import { tenantMiddleware } from './middleware/tenant.js';

export type Env = {
  Variables: {
    tenantSchema?: string;
    userId?: string;
    webhookPayload?: unknown;
  };
};

export interface AppDependencies {
  webhooksRouter?: Hono;
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
  v1.route('/organizations', organizationsRouter);

  // Tenant-scoped routes (require authentication)
  const tenantRoutes = new Hono<Env>();
  tenantRoutes.use('*', tenantMiddleware);
  tenantRoutes.route('/products', productsRouter);

  v1.route('/', tenantRoutes);

  app.route('/api/v1', v1);

  return app;
}
