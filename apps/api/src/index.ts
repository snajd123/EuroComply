import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { initializeDatabase } from '@eurocomply/db';

import { errorHandler } from './middleware/error-handler.js';
import { devLoggerMiddleware, loggerMiddleware } from './middleware/logger.js';
import { registerRoutes } from './routes/index.js';
import { logger } from './lib/logger.js';

const app = new Hono();

// Global middleware
app.use('*', process.env['NODE_ENV'] === 'development' ? devLoggerMiddleware : loggerMiddleware);

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',
  xContentTypeOptions: 'nosniff',
  xFrameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
}));

// Body size limit: 1MB max for JSON payloads
app.use('*', bodyLimit({
  maxSize: 1024 * 1024, // 1MB
  onError: (c) => {
    return c.json(
      {
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body exceeds maximum size of 1MB',
        },
      },
      413
    );
  },
}));

app.use('*', cors({
  origin: process.env['CORS_ORIGINS']?.split(',').map((o) => o.trim()) || ['http://localhost:3000'],
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Organization-ID', 'X-Request-ID'],
  exposeHeaders: ['X-Request-ID'],
}));

// Error handler
app.onError(errorHandler);

// Register routes
registerRoutes(app);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
    },
    404
  );
});

// Start server
const port = parseInt(process.env['PORT'] || '3000', 10);

async function startServer() {
  // Start HTTP server immediately so health checks pass during startup
  serve({
    fetch: app.fetch,
    port,
  });

  logger.info({ port }, 'Server listening - initializing database...');

  // Initialize database (handles IAM auth if enabled)
  // This happens after server starts so basic health checks pass
  await initializeDatabase();

  logger.info({
    environment: process.env['NODE_ENV'] || 'development',
    port,
    healthEndpoint: `http://localhost:${port}/health`,
  }, 'EuroComply API ready');
}

startServer().catch((error) => {
  logger.fatal({ error }, 'Failed to start server');
  process.exit(1);
});

export { app };
