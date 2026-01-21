import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

export type Env = {
  Variables: {
    tenantSchema?: string;
    userId?: string;
  };
};

export function createApp(): Hono<Env> {
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

  // API version prefix
  const v1 = new Hono<Env>();

  // Placeholder for routes
  v1.get('/', (c) => {
    return c.json({ message: 'EuroComply API v1' });
  });

  app.route('/api/v1', v1);

  return app;
}
