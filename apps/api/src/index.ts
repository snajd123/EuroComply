import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { initializeDatabase } from '@eurocomply/db';

import { errorHandler } from './middleware/error-handler.js';
import { devLoggerMiddleware, loggerMiddleware } from './middleware/logger.js';
import { registerRoutes } from './routes/index.js';

const app = new Hono();

// Global middleware
app.use('*', process.env['NODE_ENV'] === 'development' ? devLoggerMiddleware : loggerMiddleware);

app.use('*', secureHeaders());

app.use('*', cors({
  origin: process.env['CORS_ORIGINS']?.split(',') || ['http://localhost:3000'],
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
  // Initialize database (handles IAM auth if enabled)
  await initializeDatabase();

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    EuroComply API                          ║
╠═══════════════════════════════════════════════════════════╣
║  Environment: ${(process.env['NODE_ENV'] || 'development').padEnd(40)} ║
║  Port:        ${String(port).padEnd(40)} ║
║  Health:      http://localhost:${port}/health${' '.repeat(24 - String(port).length)}║
╚═══════════════════════════════════════════════════════════╝
`);

  serve({
    fetch: app.fetch,
    port,
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export { app };
