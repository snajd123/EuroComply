import { Hono } from 'hono';
import { health } from './health.js';
import { organizations } from './organizations.js';
import { products } from './products.js';
import { versions } from './versions.js';
import { operationsEvents } from './operations-events.js';
import { compliance } from './compliance.js';
import { verification } from './verification.js';
import { authenticatedRateLimiter } from '../middleware/rate-limit.js';

export function registerRoutes(app: Hono): void {
  // Health endpoints (no auth required)
  app.route('/health', health);

  // Verification endpoints (public, no auth required)
  app.route('/api/v1/verify', verification);

  // Apply rate limiting to authenticated API routes
  app.use('/api/v1/organizations/*', authenticatedRateLimiter);
  app.use('/api/v1/products/*', authenticatedRateLimiter);
  app.use('/api/v1/versions/*', authenticatedRateLimiter);
  app.use('/api/v1/operations/*', authenticatedRateLimiter);
  app.use('/api/v1/compliance/*', authenticatedRateLimiter);

  // API v1 routes
  app.route('/api/v1/organizations', organizations);
  app.route('/api/v1/products', products);
  app.route('/api/v1/versions', versions);
  app.route('/api/v1/operations/events', operationsEvents);
  app.route('/api/v1/compliance', compliance);
}
