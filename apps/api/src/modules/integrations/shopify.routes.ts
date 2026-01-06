// Shopify App Routes
// OAuth flow, webhooks, and DSA compliance endpoints

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '@eurocomply/database';
import {
  ShopifyOAuth,
  ShopifySyncService,
  ShopifyClient,
  ShopifyConfig,
} from '@eurocomply/integrations';
import { ApiError } from '../../common/middleware/errorHandler.js';
import { logger } from '../../common/utils/logger.js';

const router = Router();

// Shopify configuration from environment
const getShopifyConfig = (): ShopifyConfig => ({
  apiKey: process.env.SHOPIFY_API_KEY || '',
  apiSecret: process.env.SHOPIFY_API_SECRET || '',
  scopes: [
    'read_content',
    'read_themes',
    'read_products',
    'read_orders',
    'read_merchant_managed_fulfillment_orders',
    'read_customers',
  ],
  hostName: process.env.API_HOST || 'api.eurocomply.io',
  apiVersion: '2024-01',
});

// In-memory state store (use Redis in production)
const stateStore = new Map<string, { shop: string; timestamp: number }>();

// ===========================================
// OAuth Flow
// ===========================================

/**
 * Start OAuth flow - redirect to Shopify
 * GET /api/shopify/auth?shop=mystore.myshopify.com
 */
router.get('/auth', (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = getShopifyConfig();
    const shop = ShopifyOAuth.sanitizeShop(req.query.shop as string);

    if (!shop) {
      throw ApiError.badRequest('Invalid shop domain');
    }

    // Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');
    stateStore.set(state, { shop, timestamp: Date.now() });

    // Clean up old states (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of stateStore.entries()) {
      if (value.timestamp < tenMinutesAgo) {
        stateStore.delete(key);
      }
    }

    const authUrl = ShopifyOAuth.getAuthorizationUrl(config, shop, state);

    logger.info('Starting Shopify OAuth', { shop });

    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
});

/**
 * OAuth callback - exchange code for token
 * GET /api/shopify/callback?code=xxx&shop=xxx&hmac=xxx&state=xxx
 */
router.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = getShopifyConfig();
    const { code, shop, hmac, state } = req.query as Record<string, string>;

    // Verify state
    const storedState = stateStore.get(state);
    if (!storedState || storedState.shop !== shop) {
      throw ApiError.badRequest('Invalid state parameter');
    }
    stateStore.delete(state);

    // Verify HMAC
    if (!ShopifyOAuth.verifyHmac(config, req.query as Record<string, string>)) {
      throw ApiError.badRequest('Invalid HMAC signature');
    }

    // Sanitize shop
    const sanitizedShop = ShopifyOAuth.sanitizeShop(shop);
    if (!sanitizedShop) {
      throw ApiError.badRequest('Invalid shop domain');
    }

    // Exchange code for access token
    const { accessToken, scope } = await ShopifyOAuth.getAccessToken(
      config,
      sanitizedShop,
      code
    );

    // Sync merchant data
    const syncService = new ShopifySyncService(config);
    const { organizationId, merchantId } = await syncService.handleInstall(
      sanitizedShop,
      accessToken,
      scope
    );

    logger.info('Shopify app installed', {
      shop: sanitizedShop,
      organizationId,
      merchantId,
    });

    // Redirect to dashboard
    const dashboardUrl = process.env.DASHBOARD_URL || 'https://dashboard.eurocomply.io';
    res.redirect(`${dashboardUrl}/onboarding?source=shopify&org=${organizationId}`);
  } catch (error) {
    next(error);
  }
});

// ===========================================
// Webhooks
// ===========================================

/**
 * Shopify webhook handler
 * POST /api/shopify/webhooks
 */
router.post(
  '/webhooks',
  // Raw body parser for webhook verification
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = getShopifyConfig();
      const hmac = req.headers['x-shopify-hmac-sha256'] as string;
      const topic = req.headers['x-shopify-topic'] as string;
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;

      // Get raw body for HMAC verification
      const rawBody = JSON.stringify(req.body);

      // Verify webhook
      if (!ShopifyOAuth.verifyWebhookHmac(config, rawBody, hmac)) {
        logger.warn('Invalid Shopify webhook HMAC', { topic, shopDomain });
        throw ApiError.unauthorized('Invalid webhook signature');
      }

      const syncService = new ShopifySyncService(config);

      logger.info('Shopify webhook received', { topic, shopDomain });

      switch (topic) {
        case 'app/uninstalled':
          await syncService.handleUninstall(shopDomain);
          break;

        case 'shop/update':
          const client = new ShopifyClient(
            config,
            shopDomain,
            '' // We'd need to get this from DB
          );
          // This would need the access token from DB
          // await syncService.handleShopUpdate(shopDomain, await client.getMerchantData());
          break;

        case 'customers/data_request':
        case 'customers/redact':
        case 'shop/redact':
          // GDPR webhooks - log and acknowledge
          logger.info('GDPR webhook received', { topic, shopDomain });
          break;

        default:
          logger.warn('Unknown webhook topic', { topic });
      }

      res.status(200).send('OK');
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// DSA Compliance Endpoints (for Shopify App)
// ===========================================

/**
 * Get DSA compliance status for a shop
 * GET /api/shopify/compliance/:shop
 */
router.get('/compliance/:shop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = getShopifyConfig();
    const shop = ShopifyOAuth.sanitizeShop(req.params.shop);

    if (!shop) {
      throw ApiError.badRequest('Invalid shop domain');
    }

    const syncService = new ShopifySyncService(config);
    const status = await syncService.getDsaStatus(shop);

    if (!status) {
      throw ApiError.notFound('Shop not found');
    }

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get the DSA self-certification form/text
 * GET /api/shopify/compliance/certification-text
 */
router.get('/compliance/certification-text', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      title: 'DSA Self-Certification',
      version: '1.0',
      text: `
TRADER SELF-CERTIFICATION UNDER DIGITAL SERVICES ACT (EU) 2022/2065

By accepting this certification, I hereby declare that:

1. All products and services offered comply with applicable EU law
2. All information provided is accurate and up-to-date
3. I commit to promptly inform of any changes
4. I acknowledge the obligations under Article 30 of the DSA

This certification is required by EU law for all traders selling on online platforms.
      `.trim(),
    },
  });
});

export default router;
