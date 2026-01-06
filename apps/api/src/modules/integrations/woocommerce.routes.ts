// WooCommerce Integration Routes
// Connect, sync, and DSA compliance for WooCommerce stores

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@eurocomply/database';
import {
  WooCommerceSyncService,
  WooCommerceClient,
  WooCommerceConfig,
  verifyWooCommerceWebhook,
} from '@eurocomply/integrations';
import { authenticate, requireScopes } from '../../common/auth/middleware.js';
import { ApiError } from '../../common/middleware/errorHandler.js';
import { logger } from '../../common/utils/logger.js';

const router = Router();

// WooCommerce configuration
const getWooCommerceConfig = (): WooCommerceConfig => ({
  consumerKey: '', // Will be provided per-store
  consumerSecret: '',
  siteUrl: '',
  version: 'wc/v3',
});

// Validation schemas
const ConnectStoreSchema = z.object({
  siteUrl: z.string().url('Invalid site URL'),
  consumerKey: z.string().min(1, 'Consumer key is required'),
  consumerSecret: z.string().min(1, 'Consumer secret is required'),
});

// ===========================================
// Store Connection (Authenticated)
// ===========================================

/**
 * Connect a WooCommerce store
 * POST /api/woocommerce/connect
 */
router.post(
  '/connect',
  authenticate,
  requireScopes('merchants:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = ConnectStoreSchema.parse(req.body);

      // Test connection first
      const client = new WooCommerceClient({
        ...getWooCommerceConfig(),
        siteUrl: body.siteUrl,
        consumerKey: body.consumerKey,
        consumerSecret: body.consumerSecret,
      });

      const connected = await client.testConnection();
      if (!connected) {
        throw ApiError.badRequest(
          'Failed to connect to WooCommerce store. Please check your credentials.'
        );
      }

      // Get merchant data to verify we can read store info
      const merchantData = await client.getMerchantData();

      // Create organization and merchant
      const syncService = new WooCommerceSyncService(getWooCommerceConfig());
      const { organizationId, merchantId } = await syncService.connectStore(
        body.consumerKey,
        body.consumerSecret,
        body.siteUrl
      );

      logger.info('WooCommerce store connected', {
        siteUrl: body.siteUrl,
        organizationId,
        merchantId,
      });

      res.status(201).json({
        success: true,
        data: {
          organizationId,
          merchantId,
          store: {
            name: merchantData.storeName,
            url: merchantData.siteUrl,
            email: merchantData.storeEmail,
            country: merchantData.address.country,
          },
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Disconnect a WooCommerce store
 * POST /api/woocommerce/disconnect
 */
router.post(
  '/disconnect',
  authenticate,
  requireScopes('merchants:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.auth!.organizationId;

      const syncService = new WooCommerceSyncService(getWooCommerceConfig());
      await syncService.disconnectStore(organizationId);

      logger.info('WooCommerce store disconnected', { organizationId });

      res.json({
        success: true,
        message: 'Store disconnected successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Sync store data from WooCommerce
 * POST /api/woocommerce/sync
 */
router.post(
  '/sync',
  authenticate,
  requireScopes('merchants:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.auth!.organizationId;

      const syncService = new WooCommerceSyncService(getWooCommerceConfig());
      await syncService.syncStore(organizationId);

      logger.info('WooCommerce store synced', { organizationId });

      res.json({
        success: true,
        message: 'Store data synced successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// Webhooks (Public)
// ===========================================

/**
 * WooCommerce webhook handler
 * POST /api/woocommerce/webhooks
 */
router.post('/webhooks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['x-wc-webhook-signature'] as string;
    const topic = req.headers['x-wc-webhook-topic'] as string;
    const source = req.headers['x-wc-webhook-source'] as string;

    // Get the webhook secret for this source (store URL)
    // In production, you'd look this up from the database
    const webhookSecret = process.env.WOOCOMMERCE_WEBHOOK_SECRET || '';

    // Verify webhook signature
    const rawBody = JSON.stringify(req.body);
    if (!verifyWooCommerceWebhook(webhookSecret, rawBody, signature)) {
      logger.warn('Invalid WooCommerce webhook signature', { topic, source });
      throw ApiError.unauthorized('Invalid webhook signature');
    }

    logger.info('WooCommerce webhook received', { topic, source });

    switch (topic) {
      case 'store.updated':
      case 'settings.updated':
        // Trigger sync for this store
        // Would need to look up organizationId from source URL
        break;

      default:
        logger.warn('Unknown WooCommerce webhook topic', { topic });
    }

    res.status(200).send('OK');
  } catch (error) {
    next(error);
  }
});

// ===========================================
// DSA Compliance Status
// ===========================================

/**
 * Get DSA compliance status for connected store
 * GET /api/woocommerce/compliance
 */
router.get(
  '/compliance',
  authenticate,
  requireScopes('merchants:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.auth!.organizationId;

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        include: {
          merchants: {
            take: 1,
            include: {
              bankAccounts: true,
              documentAttestations: true,
              kybVerifications: true,
            },
          },
        },
      });

      if (!organization) {
        throw ApiError.notFound('Organization');
      }

      const settings = organization.settings as { source?: string };
      if (settings.source !== 'woocommerce') {
        throw ApiError.badRequest('No WooCommerce store connected');
      }

      if (organization.merchants.length === 0) {
        throw ApiError.notFound('Merchant');
      }

      const merchant = organization.merchants[0];

      // Calculate DSA compliance
      const checks = {
        hasName: !!merchant.legalName,
        hasAddress: !!(merchant.addressLine1 && merchant.city && merchant.country),
        hasEmail: !!merchant.email,
        hasPhone: !!merchant.phone,
        hasIdDocument: merchant.documentAttestations.some(
          (a) => ['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE'].includes(a.documentType)
        ),
        hasBankAccount: merchant.bankAccounts.length > 0,
        hasSelfCertification: merchant.selfCertificationAccepted,
        hasTradeRegister: !!merchant.registrationNumber,
      };

      const completedChecks = Object.values(checks).filter(Boolean).length;
      const totalChecks = Object.keys(checks).length;
      const score = Math.round((completedChecks / totalChecks) * 100);

      res.json({
        success: true,
        data: {
          compliant: score === 100,
          score,
          checks,
          merchant: {
            id: merchant.id,
            legalName: merchant.legalName,
            dsaStatus: merchant.dsaStatus,
          },
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
