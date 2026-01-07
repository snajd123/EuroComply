// WooCommerce Integration Routes for ProductTrust
// Connect stores, webhooks, and product sync for Digital Product Passports

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '@eurocomply/database';
import { logger } from '../../common/utils/logger.js';
import { authenticate } from '../../common/auth/middleware.js';

const router = Router();

// Configuration
const WOOCOMMERCE_WEBHOOK_SECRET = process.env.WOOCOMMERCE_WEBHOOK_SECRET || '';
const API_HOST = process.env.API_HOST || 'api.eurocomply.io';

// ============================================
// Store Connection
// ============================================

// Connect a WooCommerce store
router.post('/connect', authenticate, async (req: Request, res: Response) => {
  const organizationId = (req as any).organizationId;
  const { siteUrl, consumerKey, consumerSecret } = req.body;

  // Validate input
  if (!siteUrl || !consumerKey || !consumerSecret) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'siteUrl, consumerKey, and consumerSecret are required',
      },
    });
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(siteUrl);
  } catch {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_URL', message: 'Invalid site URL' },
    });
  }

  try {
    // Test connection by fetching system status
    const authHeader = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const testResponse = await fetch(
      `${siteUrl.replace(/\/$/, '')}/wp-json/wc/v3/system_status`,
      {
        headers: { Authorization: `Basic ${authHeader}` },
      }
    );

    if (!testResponse.ok) {
      throw new Error(`Connection test failed: ${testResponse.status}`);
    }

    const systemStatus = await testResponse.json();

    // Get existing organization or create connection
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Organization not found' },
      });
    }

    // Update organization with WooCommerce settings
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: {
          ...(organization.settings as object),
          woocommerce: {
            siteUrl,
            consumerKey,
            consumerSecret, // In production, encrypt this
            connectedAt: new Date().toISOString(),
            wcVersion: systemStatus.environment?.version,
            phpVersion: systemStatus.environment?.php_version,
          },
        },
      },
    });

    // Register webhooks
    await registerWebhooks(siteUrl, consumerKey, consumerSecret);

    // Trigger initial product sync
    const syncResult = await syncProducts(
      organizationId,
      siteUrl,
      consumerKey,
      consumerSecret
    );

    logger.info(`WooCommerce store connected: ${siteUrl}`);

    res.json({
      success: true,
      data: {
        connected: true,
        siteUrl,
        wcVersion: systemStatus.environment?.version,
        productsSynced: syncResult.synced,
      },
    });
  } catch (error) {
    logger.error('WooCommerce connection error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'CONNECTION_FAILED',
        message: (error as Error).message,
      },
    });
  }
});

// Disconnect WooCommerce store
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

  // Clear WooCommerce settings but keep products
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settings: {
        ...(organization.settings as object),
        woocommerce: {
          disconnectedAt: new Date().toISOString(),
        },
      },
    },
  });

  res.json({
    success: true,
    message: 'WooCommerce disconnected successfully',
  });
});

// Get connection status
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
  const wooSettings = settings?.woocommerce || {};

  const productCount = await prisma.product.count({
    where: { organizationId },
  });

  const passportCount = await prisma.passport.count({
    where: { product: { organizationId } },
  });

  res.json({
    success: true,
    data: {
      connected: !!wooSettings.consumerKey,
      siteUrl: wooSettings.siteUrl || null,
      connectedAt: wooSettings.connectedAt || null,
      lastSyncAt: wooSettings.lastSyncAt || null,
      wcVersion: wooSettings.wcVersion || null,
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
  const wooSettings = settings?.woocommerce;

  if (!wooSettings?.consumerKey) {
    return res.status(400).json({
      success: false,
      error: { code: 'NOT_CONNECTED', message: 'WooCommerce not connected' },
    });
  }

  const result = await syncProducts(
    organizationId,
    wooSettings.siteUrl,
    wooSettings.consumerKey,
    wooSettings.consumerSecret
  );

  res.json({
    success: true,
    data: result,
  });
});

// ============================================
// Webhooks
// ============================================

// Webhook handler
router.post('/webhooks', async (req: Request, res: Response) => {
  const signature = req.headers['x-wc-webhook-signature'] as string;
  const source = req.headers['x-wc-webhook-source'] as string;
  const topic = req.headers['x-wc-webhook-topic'] as string;

  // Verify webhook signature
  if (WOOCOMMERCE_WEBHOOK_SECRET) {
    const rawBody = JSON.stringify(req.body);
    const calculatedSignature = crypto
      .createHmac('sha256', WOOCOMMERCE_WEBHOOK_SECRET)
      .update(rawBody, 'utf8')
      .digest('base64');

    if (signature !== calculatedSignature) {
      logger.warn(`Invalid WooCommerce webhook signature from ${source}`);
      return res.status(401).send('Invalid signature');
    }
  }

  // Acknowledge webhook immediately
  res.status(200).send('OK');

  // Process webhook asynchronously
  try {
    if (!source || !topic) {
      logger.warn('Missing webhook headers');
      return;
    }

    switch (topic) {
      case 'product.created':
      case 'product.updated':
        await handleProductWebhook(source, req.body);
        break;
      case 'product.deleted':
        await handleProductDelete(source, req.body.id);
        break;
      default:
        logger.info(`Unhandled WooCommerce webhook topic: ${topic}`);
    }
  } catch (error) {
    logger.error(`Error processing WooCommerce webhook ${topic}:`, error);
  }
});

// ============================================
// Helper Functions
// ============================================

async function registerWebhooks(
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string
) {
  const authHeader = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const webhookUrl = `https://${API_HOST}/api/woocommerce/webhooks`;

  const topics = ['product.created', 'product.updated', 'product.deleted'];

  for (const topic of topics) {
    try {
      await fetch(`${siteUrl.replace(/\/$/, '')}/wp-json/wc/v3/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${authHeader}`,
        },
        body: JSON.stringify({
          name: `EuroComply - ${topic}`,
          topic,
          delivery_url: webhookUrl,
          secret: WOOCOMMERCE_WEBHOOK_SECRET,
          status: 'active',
        }),
      });
    } catch (error) {
      logger.warn(`Failed to register WooCommerce webhook ${topic}:`, error);
    }
  }
}

async function syncProducts(
  organizationId: string,
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string
) {
  const authHeader = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  let synced = 0;
  let created = 0;
  let updated = 0;
  let page = 1;
  let totalPages = 1;

  do {
    const response = await fetch(
      `${siteUrl.replace(/\/$/, '')}/wp-json/wc/v3/products?page=${page}&per_page=50&status=publish`,
      {
        headers: { Authorization: `Basic ${authHeader}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const products = await response.json();
    totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1');

    for (const product of products) {
      const result = await syncSingleProduct(organizationId, product);
      synced++;
      if (result === 'created') created++;
      if (result === 'updated') updated++;
    }

    page++;
  } while (page <= totalPages);

  // Update last sync time
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settings: {
        path: ['woocommerce', 'lastSyncAt'],
        value: new Date().toISOString(),
      } as any,
    },
  });

  return { synced, created, updated };
}

async function syncSingleProduct(
  organizationId: string,
  wooProduct: any
): Promise<'created' | 'updated' | 'unchanged'> {
  const sku = wooProduct.sku || null;

  // Check if product exists
  const existing = await prisma.product.findFirst({
    where: {
      organizationId,
      attributes: {
        path: ['wooId'],
        equals: wooProduct.id,
      },
    },
  });

  const productData = {
    name: wooProduct.name,
    description: stripHtml(wooProduct.description || wooProduct.short_description),
    sku,
    attributes: {
      wooId: wooProduct.id,
      wooSlug: wooProduct.slug,
      wooPermalink: wooProduct.permalink,
      productType: wooProduct.type,
      price: wooProduct.price,
      regularPrice: wooProduct.regular_price,
      weight: wooProduct.weight,
      dimensions: wooProduct.dimensions,
      categories: wooProduct.categories?.map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
      })),
      tags: wooProduct.tags?.map((t: any) => t.name),
      images: wooProduct.images?.map((img: any) => ({
        src: img.src,
        alt: img.alt,
      })),
      source: 'woocommerce',
      lastSyncedAt: new Date().toISOString(),
    },
    status: wooProduct.status === 'publish' ? 'ACTIVE' as const : 'DRAFT' as const,
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

async function handleProductWebhook(siteUrl: string, product: any) {
  // Find organization by site URL
  const siteHost = new URL(siteUrl).hostname;
  const organizations = await prisma.organization.findMany({
    where: {
      settings: {
        path: ['woocommerce', 'siteUrl'],
        string_contains: siteHost,
      },
    },
  });

  if (organizations.length === 0) {
    logger.warn(`No organization found for WooCommerce site: ${siteUrl}`);
    return;
  }

  for (const org of organizations) {
    await syncSingleProduct(org.id, product);
  }

  logger.info(`WooCommerce product synced from webhook: ${product.name}`);
}

async function handleProductDelete(siteUrl: string, productId: number) {
  const siteHost = new URL(siteUrl).hostname;
  const organizations = await prisma.organization.findMany({
    where: {
      settings: {
        path: ['woocommerce', 'siteUrl'],
        string_contains: siteHost,
      },
    },
  });

  for (const org of organizations) {
    await prisma.product.updateMany({
      where: {
        organizationId: org.id,
        attributes: {
          path: ['wooId'],
          equals: productId,
        },
      },
      data: { status: 'ARCHIVED' },
    });
  }

  logger.info(`WooCommerce product archived from webhook: ${productId}`);
}

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  return html.replace(/<[^>]*>/g, '').trim();
}

export default router;
