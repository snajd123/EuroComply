import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import 'dotenv/config';

import { errorHandler } from './common/middleware/errorHandler.js';
import { requestId } from './common/middleware/requestId.js';
import { rateLimiter } from './common/middleware/rateLimiter.js';
import { logger } from './common/utils/logger.js';

// Import routes
import healthRoutes from './common/routes/health.js';
import didRoutes from './common/routes/did.js';
import authRoutes from './common/auth/routes.js';
import productTrustRoutes from './modules/product-trust/routes.js';
import workforceTrustRoutes from './modules/workforce-trust/routes.js';
import merchantTrustRoutes from './modules/merchant-trust/routes.js';
import integrationsRoutes from './modules/integrations/index.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Compression
app.use(compression());

// Request ID tracking
app.use(requestId);

// Logging
app.use(morgan('combined', {
  stream: { write: (message: string) => logger.http(message.trim()) },
}));

// Rate limiting
app.use(rateLimiter);

// Health check (no auth required)
app.use('/health', healthRoutes);

// DID document hosting (public, no auth)
// did:web resolution requires these to be at root level
app.use(didRoutes);

// API routes
app.use('/v1/auth', authRoutes);
app.use('/v1', productTrustRoutes);
app.use('/v1', workforceTrustRoutes);
app.use('/v1', merchantTrustRoutes);

// E-commerce integrations (Shopify, WooCommerce)
app.use('/api', integrationsRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
    },
  });
});

// Global error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 EuroComply API server running on port ${PORT}`);
  logger.info(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
