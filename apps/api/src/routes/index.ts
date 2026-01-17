import { Hono } from 'hono';
import { health } from './health.js';
import { organizations } from './organizations.js';
import { products } from './products.js';

export function registerRoutes(app: Hono): void {
  // Health endpoints (no auth required)
  app.route('/health', health);

  // API v1 routes
  app.route('/api/v1/organizations', organizations);
  app.route('/api/v1/products', products);
}
