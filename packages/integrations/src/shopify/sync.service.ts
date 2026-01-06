// Shopify Product Sync Service for ProductTrust
// Syncs Shopify products → EuroComply Products → Generate DPPs

import type { PrismaClient } from '@prisma/client';
import { ShopifyClient } from './client.js';
import type {
  ShopifyConfig,
  ShopifySession,
  ShopifyProduct,
  ProductSyncResult,
  SyncedProduct,
  SyncError,
  ShopifyConnectionStatus,
} from './types.js';

export interface SyncServiceConfig {
  shopify: ShopifyConfig;
  prisma: PrismaClient;
  apiHost: string;
  dashboardUrl: string;
}

export class ShopifySyncService {
  private client: ShopifyClient;
  private prisma: PrismaClient;
  private apiHost: string;
  private dashboardUrl: string;

  constructor(config: SyncServiceConfig) {
    this.client = new ShopifyClient(config.shopify);
    this.prisma = config.prisma;
    this.apiHost = config.apiHost;
    this.dashboardUrl = config.dashboardUrl;
  }

  // Handle app installation - create organization and sync products
  async handleInstall(
    shop: string,
    accessToken: string,
    scope: string
  ): Promise<{ organizationId: string; productsSynced: number }> {
    const session: ShopifySession = { shop, accessToken, scope };
    this.client.setSession(session);

    // Get shop details
    const shopData = await this.client.getShop();

    // Create or update organization
    const organization = await this.prisma.organization.upsert({
      where: { domain: shop },
      update: {
        settings: {
          shopify: {
            shop,
            accessToken, // In production, encrypt this
            scope,
            installedAt: new Date().toISOString(),
          },
        },
      },
      create: {
        name: shopData.name,
        slug: this.generateSlug(shopData.name),
        domain: shop,
        settings: {
          shopify: {
            shop,
            accessToken,
            scope,
            installedAt: new Date().toISOString(),
          },
          country: shopData.country_code,
          currency: shopData.currency,
        },
      },
    });

    // Register webhooks
    const webhookUrl = `https://${this.apiHost}/api/shopify/webhooks`;
    await this.client.registerWebhooks(webhookUrl);

    // Initial product sync
    const syncResult = await this.syncProducts(organization.id, session);

    return {
      organizationId: organization.id,
      productsSynced: syncResult.synced,
    };
  }

  // Sync all products from Shopify to EuroComply
  async syncProducts(
    organizationId: string,
    session: ShopifySession
  ): Promise<ProductSyncResult> {
    this.client.setSession(session);

    const result: ProductSyncResult = {
      organizationId,
      synced: 0,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
      products: [],
    };

    let pageInfo: string | null = null;

    do {
      const { products, nextPageInfo } = await this.client.getProducts(50, pageInfo || undefined);
      pageInfo = nextPageInfo;

      for (const shopifyProduct of products) {
        try {
          const syncedProduct = await this.syncSingleProduct(
            organizationId,
            shopifyProduct
          );
          result.products.push(syncedProduct);
          result.synced++;

          if (syncedProduct.status === 'created') {
            result.created++;
          } else if (syncedProduct.status === 'updated') {
            result.updated++;
          }
        } catch (error) {
          result.failed++;
          result.errors.push({
            shopifyId: shopifyProduct.id,
            productName: shopifyProduct.title,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } while (pageInfo);

    // Update last sync time
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: {
          path: ['shopify', 'lastSyncAt'],
          value: new Date().toISOString(),
        } as any,
      },
    });

    return result;
  }

  // Sync a single product
  private async syncSingleProduct(
    organizationId: string,
    shopifyProduct: ShopifyProduct
  ): Promise<SyncedProduct> {
    // Get the primary variant for SKU and barcode
    const primaryVariant = shopifyProduct.variants[0];
    const sku = primaryVariant?.sku || null;
    const gtin = primaryVariant?.barcode || null;

    // Check if product already exists (by Shopify ID stored in attributes)
    const existingProduct = await this.prisma.product.findFirst({
      where: {
        organizationId,
        attributes: {
          path: ['shopifyId'],
          equals: shopifyProduct.id,
        },
      },
    });

    if (existingProduct) {
      // Update existing product
      await this.prisma.product.update({
        where: { id: existingProduct.id },
        data: {
          name: shopifyProduct.title,
          description: this.stripHtml(shopifyProduct.body_html),
          sku,
          gtin,
          attributes: {
            ...(existingProduct.attributes as object),
            shopifyId: shopifyProduct.id,
            shopifyHandle: shopifyProduct.handle,
            vendor: shopifyProduct.vendor,
            productType: shopifyProduct.product_type,
            tags: shopifyProduct.tags.split(', ').filter(Boolean),
            variants: shopifyProduct.variants.map((v) => ({
              id: v.id,
              sku: v.sku,
              barcode: v.barcode,
              price: v.price,
              weight: v.weight,
              weightUnit: v.weight_unit,
            })),
            images: shopifyProduct.images.map((img) => ({
              src: img.src,
              alt: img.alt,
            })),
            lastSyncedAt: new Date().toISOString(),
          },
          status: shopifyProduct.status === 'active' ? 'ACTIVE' : 'DRAFT',
        },
      });

      return {
        shopifyId: shopifyProduct.id,
        eurocomplyId: existingProduct.id,
        name: shopifyProduct.title,
        sku,
        gtin,
        status: 'updated',
      };
    }

    // Create new product
    const newProduct = await this.prisma.product.create({
      data: {
        organizationId,
        name: shopifyProduct.title,
        description: this.stripHtml(shopifyProduct.body_html),
        sku,
        gtin,
        attributes: {
          shopifyId: shopifyProduct.id,
          shopifyHandle: shopifyProduct.handle,
          vendor: shopifyProduct.vendor,
          productType: shopifyProduct.product_type,
          tags: shopifyProduct.tags.split(', ').filter(Boolean),
          variants: shopifyProduct.variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            barcode: v.barcode,
            price: v.price,
            weight: v.weight,
            weightUnit: v.weight_unit,
          })),
          images: shopifyProduct.images.map((img) => ({
            src: img.src,
            alt: img.alt,
          })),
          source: 'shopify',
          lastSyncedAt: new Date().toISOString(),
        },
        status: shopifyProduct.status === 'active' ? 'ACTIVE' : 'DRAFT',
      },
    });

    return {
      shopifyId: shopifyProduct.id,
      eurocomplyId: newProduct.id,
      name: shopifyProduct.title,
      sku,
      gtin,
      status: 'created',
    };
  }

  // Handle product created webhook
  async handleProductCreated(
    shop: string,
    shopifyProduct: ShopifyProduct
  ): Promise<SyncedProduct | null> {
    const organization = await this.getOrganizationByShop(shop);
    if (!organization) return null;

    return this.syncSingleProduct(organization.id, shopifyProduct);
  }

  // Handle product updated webhook
  async handleProductUpdated(
    shop: string,
    shopifyProduct: ShopifyProduct
  ): Promise<SyncedProduct | null> {
    const organization = await this.getOrganizationByShop(shop);
    if (!organization) return null;

    return this.syncSingleProduct(organization.id, shopifyProduct);
  }

  // Handle product deleted webhook
  async handleProductDeleted(shop: string, productId: number): Promise<void> {
    const organization = await this.getOrganizationByShop(shop);
    if (!organization) return;

    // Archive the product (don't delete - keep for audit trail)
    await this.prisma.product.updateMany({
      where: {
        organizationId: organization.id,
        attributes: {
          path: ['shopifyId'],
          equals: productId,
        },
      },
      data: {
        status: 'ARCHIVED',
      },
    });
  }

  // Handle app uninstalled webhook
  async handleUninstall(shop: string): Promise<void> {
    const organization = await this.getOrganizationByShop(shop);
    if (!organization) return;

    // Clear Shopify credentials but keep the organization and products
    await this.prisma.organization.update({
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
  }

  // Get connection status for a shop
  async getConnectionStatus(shop: string): Promise<ShopifyConnectionStatus> {
    const organization = await this.getOrganizationByShop(shop);

    if (!organization) {
      return {
        connected: false,
        shop: null,
        installedAt: null,
        lastSyncAt: null,
        productCount: 0,
        passportCount: 0,
      };
    }

    const settings = organization.settings as any;
    const shopifySettings = settings?.shopify || {};

    const productCount = await this.prisma.product.count({
      where: { organizationId: organization.id },
    });

    const passportCount = await this.prisma.passport.count({
      where: {
        product: { organizationId: organization.id },
      },
    });

    return {
      connected: !!shopifySettings.accessToken,
      shop,
      installedAt: shopifySettings.installedAt || null,
      lastSyncAt: shopifySettings.lastSyncAt || null,
      productCount,
      passportCount,
    };
  }

  // Push DPP QR code URL to Shopify product
  async pushDppToShopify(
    organizationId: string,
    productId: string,
    qrCodeUrl: string,
    verificationUrl: string
  ): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    const attributes = product.attributes as any;
    const shopifyId = attributes?.shopifyId;

    if (!shopifyId) {
      throw new Error('Product not synced from Shopify');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    const settings = organization?.settings as any;
    const session = settings?.shopify;

    if (!session?.accessToken) {
      throw new Error('Shopify not connected');
    }

    this.client.setSession({
      shop: session.shop,
      accessToken: session.accessToken,
      scope: session.scope,
    });

    // Add metafields for DPP
    await this.client.setProductMetafield(
      shopifyId,
      'eurocomply',
      'dpp_qr_url',
      qrCodeUrl,
      'url'
    );

    await this.client.setProductMetafield(
      shopifyId,
      'eurocomply',
      'dpp_verify_url',
      verificationUrl,
      'url'
    );
  }

  // Helper methods
  private async getOrganizationByShop(shop: string) {
    return this.prisma.organization.findUnique({
      where: { domain: shop },
    });
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  private stripHtml(html: string | null): string | null {
    if (!html) return null;
    return html.replace(/<[^>]*>/g, '').trim();
  }
}
