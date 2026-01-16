import { Hono } from 'hono';
import { health } from './health.js';

export function registerRoutes(app: Hono): void {
  // Health endpoints (no auth required)
  app.route('/health', health);

  // API v1 routes will be added here
  // app.route('/api/v1/products', products);
  // app.route('/api/v1/organizations', organizations);
}
