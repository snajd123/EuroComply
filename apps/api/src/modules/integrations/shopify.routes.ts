// Shopify Integration Routes for ProductTrust
// OAuth flow, webhooks, and product sync for Digital Product Passports

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../common/db/client.js';
import { logger } from '../../common/utils/logger.js';
import { authenticate } from '../../common/auth/middleware.js';

const router = Router();

// Configuration
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || '';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';
const API_HOST = process.env.API_HOST || 'api.eurocomply.io';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://dashboard.eurocomply.io';
const SHOPIFY_API_VERSION = '2024-01';

// Scopes needed for product sync
const SHOPIFY_SCOPES = [
  'read_products',
  'write_products',     // For metafields (DPP QR codes)
  'read_inventory',
].join(',');

// ============================================
// OAuth Flow
// ============================================

// Step 1: Initiate OAuth - redirect to Shopify
router.get('/auth', (req: Request, res: Response) => {
  const { shop } = req.query;

  if (!shop || typeof shop !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_SHOP', message: 'Shop parameter is required' },
    });
  }

  // Validate shop domain
  if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_SHOP', message: 'Invalid shop domain' },
    });
  }

  // Generate state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex');

  // Store state in cookie (in production, use secure session)
  res.cookie('shopify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600000, // 10 minutes
  });

  const redirectUri = `https://${API_HOST}/api/shopify/callback`;
  const authUrl = `https://${shop}/admin/oauth/authorize?` +
    `client_id=${SHOPIFY_API_KEY}` +
    `&scope=${SHOPIFY_SCOPES}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  res.redirect(authUrl);
});

// Step 2: OAuth callback - exchange code for token
router.get('/callback', async (req: Request, res: Response) => {
  const { shop, code, state, hmac } = req.query;

  try {
    // Validate parameters
    if (!shop || !code || !state || !hmac) {
      throw new Error('Missing required parameters');
    }

    // Verify state (CSRF protection)
    const storedState = req.cookies?.shopify_oauth_state;
    if (state !== storedState) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    // Verify HMAC
    const queryParams = { ...req.query };
    delete queryParams.hmac;
    const sortedParams = Object.keys(queryParams)
      .sort()
      .map((key) => `${key}=${queryParams[key]}`)
      .join('&');

    const calculatedHmac = crypto
      .createHmac('sha256', SHOPIFY_API_SECRET)
      .update(sortedParams)
      .digest('hex');

    if (hmac !== calculatedHmac) {
      throw new Error('Invalid HMAC signature');
    }

    // Exchange code for access token
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: SHOPIFY_API_KEY,
          client_secret: SHOPIFY_API_SECRET,
          code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const scope = tokenData.scope;

    // Get shop information
    const shopResponse = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
      {
        headers: { 'X-Shopify-Access-Token': accessToken },
      }
    );

    const shopData = await shopResponse.json();
    const shopInfo = shopData.shop;

    // Create or update organization
    const organization = await prisma.organization.upsert({
      where: { domain: shop as string },
      update: {
        settings: {
          shopify: {
            shop,
            accessToken, // In production, encrypt this
            scope,
            installedAt: new Date().toISOString(),
            shopId: shopInfo.id,
          },
          country: shopInfo.country_code,
          currency: shopInfo.currency,
        },
      },
      create: {
        name: shopInfo.name,
        slug: generateSlug(shopInfo.name),
        domain: shop as string,
        settings: {
          shopify: {
            shop,
            accessToken,
            scope,
            installedAt: new Date().toISOString(),
            shopId: shopInfo.id,
          },
          country: shopInfo.country_code,
          currency: shopInfo.currency,
        },
      },
    });

    // Register webhooks
    await registerWebhooks(shop as string, accessToken);

    // Trigger initial product sync (async)
    syncProductsAsync(organization.id, shop as string, accessToken);

    logger.info(`Shopify app installed for shop: ${shop}`);

    // Clear state cookie
    res.clearCookie('shopify_oauth_state');

    // Redirect to dashboard
    res.redirect(`${DASHBOARD_URL}/integrations/shopify/success?org=${organization.id}`);
  } catch (error) {
    logger.error('Shopify OAuth error:', error);
    res.redirect(`${DASHBOARD_URL}/integrations/shopify/error?message=${encodeURIComponent((error as Error).message)}`);
  }
});

// ============================================
// Webhooks
// ============================================

// Webhook handler
router.post('/webhooks/:topic', async (req: Request, res: Response) => {
  const { topic } = req.params;
  const shop = req.headers['x-shopify-shop-domain'] as string;
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;

  // Verify webhook signature
  const rawBody = JSON.stringify(req.body);
  const calculatedHmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');

  if (hmac !== calculatedHmac) {
    logger.warn(`Invalid webhook signature from ${shop}`);
    return res.status(401).send('Invalid signature');
  }

  // Acknowledge webhook immediately
  res.status(200).send('OK');

  // Process webhook asynchronously
  try {
    switch (topic) {
      case 'products-create':
      case 'products-update':
        await handleProductWebhook(shop, req.body);
        break;
      case 'products-delete':
        await handleProductDelete(shop, req.body.id);
        break;
      case 'app-uninstalled':
        await handleAppUninstalled(shop);
        break;
      default:
        logger.info(`Unhandled webhook topic: ${topic}`);
    }
  } catch (error) {
    logger.error(`Error processing webhook ${topic}:`, error);
  }
});

// ============================================
// Product Sync API
// ============================================

// Get sync status
router.get('/status', authenticate, async (req: Request, res: Response) => {
  const organizationId = (req as any).organizationId;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Organization not found' },
    });
  }

  const settings = organization.settings as any;
  const shopifySettings = settings?.shopify || {};

  const productCount = await prisma.product.count({
    where: { organizationId },
  });

  const passportCount = await prisma.passport.count({
    where: { product: { organizationId } },
  });

  res.json({
    success: true,
    data: {
      connected: !!shopifySettings.accessToken,
      shop: shopifySettings.shop || null,
      installedAt: shopifySettings.installedAt || null,
      lastSyncAt: shopifySettings.lastSyncAt || null,
      productCount,
      passportCount,
    },
  });
});

// Manual product sync
router.post('/sync', authenticate, async (req: Request, res: Response) => {
  const organizationId = (req as any).organizationId;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Organization not found' },
    });
  }

  const settings = organization.settings as any;
  const shopifySettings = settings?.shopify;

  if (!shopifySettings?.accessToken) {
    return res.status(400).json({
      success: false,
      error: { code: 'NOT_CONNECTED', message: 'Shopify not connected' },
    });
  }

  // Trigger sync
  const result = await syncProducts(
    organizationId,
    shopifySettings.shop,
    shopifySettings.accessToken
  );

  res.json({
    success: true,
    data: result,
  });
});

// Disconnect Shopify
router.post('/disconnect', authenticate, async (req: Request, res: Response) => {
  const organizationId = (req as any).organizationId;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Organization not found' },
    });
  }

  // Clear Shopify settings but keep products
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settings: {
        ...(organization.settings as object),
        shopify: {
          disconnectedAt: new Date().toISOString(),
        },
      },
    },
  });

  res.json({
    success: true,
    message: 'Shopify disconnected successfully',
  });
});

// ============================================
// Helper Functions
// ============================================

async function registerWebhooks(shop: string, accessToken: string) {
  const webhookUrl = `https://${API_HOST}/api/shopify/webhooks`;
  const topics = [
    'products/create',
    'products/update',
    'products/delete',
    'app/uninstalled',
  ];

  for (const topic of topics) {
    try {
      await fetch(
        `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({
            webhook: {
              topic,
              address: `${webhookUrl}/${topic.replace('/', '-')}`,
              format: 'json',
            },
          }),
        }
      );
    } catch (error) {
      logger.warn(`Failed to register webhook ${topic}:`, error);
    }
  }
}

async function syncProducts(
  organizationId: string,
  shop: string,
  accessToken: string
) {
  let synced = 0;
  let created = 0;
  let updated = 0;
  let pageInfo: string | null = null;

  do {
    let url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=50&status=active`;
    if (pageInfo) {
      url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=50&page_info=${pageInfo}`;
    }

    const response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const data = await response.json();

    for (const product of data.products) {
      const result = await syncSingleProduct(organizationId, product);
      synced++;
      if (result === 'created') created++;
      if (result === 'updated') updated++;
    }

    // Get next page
    const linkHeader = response.headers.get('Link');
    pageInfo = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/page_info=([^>&]+).*?rel="next"/);
      if (nextMatch) pageInfo = nextMatch[1];
    }
  } while (pageInfo);

  // Update last sync time
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settings: {
        path: ['shopify', 'lastSyncAt'],
        value: new Date().toISOString(),
      } as any,
    },
  });

  return { synced, created, updated };
}

async function syncSingleProduct(
  organizationId: string,
  shopifyProduct: any
): Promise<'created' | 'updated' | 'unchanged'> {
  const primaryVariant = shopifyProduct.variants?.[0];
  const sku = primaryVariant?.sku || null;
  const gtin = primaryVariant?.barcode || null;

  // Check if product exists
  const existing = await prisma.product.findFirst({
    where: {
      organizationId,
      attributes: {
        path: ['shopifyId'],
        equals: shopifyProduct.id,
      },
    },
  });

  const productData = {
    name: shopifyProduct.title,
    description: stripHtml(shopifyProduct.body_html),
    sku,
    gtin,
    attributes: {
      shopifyId: shopifyProduct.id,
      shopifyHandle: shopifyProduct.handle,
      vendor: shopifyProduct.vendor,
      productType: shopifyProduct.product_type,
      tags: shopifyProduct.tags?.split(', ').filter(Boolean) || [],
      variants: shopifyProduct.variants?.map((v: any) => ({
        id: v.id,
        sku: v.sku,
        barcode: v.barcode,
        price: v.price,
      })),
      images: shopifyProduct.images?.map((img: any) => ({
        src: img.src,
        alt: img.alt,
      })),
      source: 'shopify',
      lastSyncedAt: new Date().toISOString(),
    },
    status: shopifyProduct.status === 'active' ? 'ACTIVE' as const : 'DRAFT' as const,
  };

  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        ...productData,
        attributes: {
          ...(existing.attributes as object),
          ...productData.attributes,
        },
      },
    });
    return 'updated';
  }

  await prisma.product.create({
    data: {
      organizationId,
      ...productData,
    },
  });
  return 'created';
}

async function syncProductsAsync(
  organizationId: string,
  shop: string,
  accessToken: string
) {
  try {
    await syncProducts(organizationId, shop, accessToken);
    logger.info(`Product sync completed for ${shop}`);
  } catch (error) {
    logger.error(`Product sync failed for ${shop}:`, error);
  }
}

async function handleProductWebhook(shop: string, product: any) {
  const organization = await prisma.organization.findUnique({
    where: { domain: shop },
  });

  if (!organization) {
    logger.warn(`No organization found for shop: ${shop}`);
    return;
  }

  await syncSingleProduct(organization.id, product);
  logger.info(`Product synced from webhook: ${product.title}`);
}

async function handleProductDelete(shop: string, productId: number) {
  const organization = await prisma.organization.findUnique({
    where: { domain: shop },
  });

  if (!organization) return;

  await prisma.product.updateMany({
    where: {
      organizationId: organization.id,
      attributes: {
        path: ['shopifyId'],
        equals: productId,
      },
    },
    data: { status: 'ARCHIVED' },
  });

  logger.info(`Product archived from webhook: ${productId}`);
}

async function handleAppUninstalled(shop: string) {
  const organization = await prisma.organization.findUnique({
    where: { domain: shop },
  });

  if (!organization) return;

  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      settings: {
        ...(organization.settings as object),
        shopify: {
          uninstalledAt: new Date().toISOString(),
        },
      },
    },
  });

  logger.info(`Shopify app uninstalled for shop: ${shop}`);
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  return html.replace(/<[^>]*>/g, '').trim();
}

export default router;
