// WooCommerce Product Sync Service for ProductTrust
// Syncs WooCommerce products → EuroComply Products → Generate DPPs

import type { PrismaClient } from '@prisma/client';
import { WooCommerceClient } from './client.js';
import type {
  WooCommerceConfig,
  WooCommerceCredentials,
  WooCommerceProduct,
  ProductSyncResult,
  SyncedProduct,
  WooCommerceConnectionStatus,
} from './types.js';

export interface SyncServiceConfig {
  woocommerce: WooCommerceConfig;
  prisma: PrismaClient;
  apiHost: string;
}

export class WooCommerceSyncService {
  private client: WooCommerceClient;
  private prisma: PrismaClient;
  private config: WooCommerceConfig;
  private apiHost: string;

  constructor(config: SyncServiceConfig) {
    this.client = new WooCommerceClient();
    this.prisma = config.prisma;
    this.config = config.woocommerce;
    this.apiHost = config.apiHost;
  }

  // Connect a WooCommerce store
  async connectStore(
    credentials: WooCommerceCredentials
  ): Promise<{ organizationId: string; productsSynced: number }> {
    this.client.setCredentials(credentials);

    // Test connection and get shop info
    const shopInfo = await this.client.testConnection();

    // Create or update organization
    const siteHost = new URL(credentials.siteUrl).hostname;

    const organization = await this.prisma.organization.upsert({
      where: { domain: siteHost },
      update: {
        settings: {
          woocommerce: {
            siteUrl: credentials.siteUrl,
            consumerKey: credentials.consumerKey,
            consumerSecret: credentials.consumerSecret, // In production, encrypt this
            connectedAt: new Date().toISOString(),
          },
        },
      },
      create: {
        name: shopInfo.name || siteHost,
        slug: this.generateSlug(shopInfo.name || siteHost),
        domain: siteHost,
        settings: {
          woocommerce: {
            siteUrl: credentials.siteUrl,
            consumerKey: credentials.consumerKey,
            consumerSecret: credentials.consumerSecret,
            connectedAt: new Date().toISOString(),
          },
          country: shopInfo.country,
          currency: shopInfo.currency,
          wcVersion: shopInfo.wc_version,
        },
      },
    });

    // Register webhooks
    await this.registerWebhooks(credentials);

    // Initial product sync
    const syncResult = await this.syncProducts(organization.id, credentials);

    return {
      organizationId: organization.id,
      productsSynced: syncResult.synced,
    };
  }

  // Disconnect a WooCommerce store
  async disconnectStore(organizationId: string): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Clear WooCommerce credentials but keep the organization and products
    await this.prisma.organization.update({
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
  }

  // Sync all products from WooCommerce to EuroComply
  async syncProducts(
    organizationId: string,
    credentials: WooCommerceCredentials
  ): Promise<ProductSyncResult> {
    this.client.setCredentials(credentials);

    const result: ProductSyncResult = {
      organizationId,
      synced: 0,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
      products: [],
    };

    let page = 1;
    let totalPages = 1;

    do {
      const { products, totalPages: pages } = await this.client.getProducts(
        page,
        50
      );
      totalPages = pages;

      for (const wooProduct of products) {
        try {
          const syncedProduct = await this.syncSingleProduct(
            organizationId,
            wooProduct
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
            wooId: wooProduct.id,
            productName: wooProduct.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      page++;
    } while (page <= totalPages);

    // Update last sync time
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: {
          path: ['woocommerce', 'lastSyncAt'],
          value: new Date().toISOString(),
        } as any,
      },
    });

    return result;
  }

  // Sync a single product
  private async syncSingleProduct(
    organizationId: string,
    wooProduct: WooCommerceProduct
  ): Promise<SyncedProduct> {
    const sku = wooProduct.sku || null;

    // Check if product already exists (by WooCommerce ID stored in attributes)
    const existingProduct = await this.prisma.product.findFirst({
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
      description: this.stripHtml(wooProduct.description || wooProduct.short_description),
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
        categories: wooProduct.categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
        })),
        tags: wooProduct.tags.map((t) => t.name),
        images: wooProduct.images.map((img) => ({
          src: img.src,
          alt: img.alt,
        })),
        wooAttributes: wooProduct.attributes.map((attr) => ({
          name: attr.name,
          options: attr.options,
        })),
        source: 'woocommerce',
        lastSyncedAt: new Date().toISOString(),
      },
      status: wooProduct.status === 'publish' ? 'ACTIVE' as const : 'DRAFT' as const,
    };

    if (existingProduct) {
      // Update existing product
      await this.prisma.product.update({
        where: { id: existingProduct.id },
        data: {
          ...productData,
          attributes: {
            ...(existingProduct.attributes as object),
            ...productData.attributes,
          },
        },
      });

      return {
        wooId: wooProduct.id,
        eurocomplyId: existingProduct.id,
        name: wooProduct.name,
        sku,
        status: 'updated',
      };
    }

    // Create new product
    const newProduct = await this.prisma.product.create({
      data: {
        organizationId,
        ...productData,
      },
    });

    return {
      wooId: wooProduct.id,
      eurocomplyId: newProduct.id,
      name: wooProduct.name,
      sku,
      status: 'created',
    };
  }

  // Handle product created webhook
  async handleProductCreated(
    siteUrl: string,
    wooProduct: WooCommerceProduct
  ): Promise<SyncedProduct | null> {
    const organization = await this.getOrganizationBySiteUrl(siteUrl);
    if (!organization) return null;

    return this.syncSingleProduct(organization.id, wooProduct);
  }

  // Handle product updated webhook
  async handleProductUpdated(
    siteUrl: string,
    wooProduct: WooCommerceProduct
  ): Promise<SyncedProduct | null> {
    const organization = await this.getOrganizationBySiteUrl(siteUrl);
    if (!organization) return null;

    return this.syncSingleProduct(organization.id, wooProduct);
  }

  // Handle product deleted webhook
  async handleProductDeleted(siteUrl: string, productId: number): Promise<void> {
    const organization = await this.getOrganizationBySiteUrl(siteUrl);
    if (!organization) return;

    // Archive the product (don't delete - keep for audit trail)
    await this.prisma.product.updateMany({
      where: {
        organizationId: organization.id,
        attributes: {
          path: ['wooId'],
          equals: productId,
        },
      },
      data: {
        status: 'ARCHIVED',
      },
    });
  }

  // Get connection status
  async getConnectionStatus(
    organizationId: string
  ): Promise<WooCommerceConnectionStatus> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      return {
        connected: false,
        siteUrl: null,
        connectedAt: null,
        lastSyncAt: null,
        productCount: 0,
        passportCount: 0,
      };
    }

    const settings = organization.settings as any;
    const wooSettings = settings?.woocommerce || {};

    const productCount = await this.prisma.product.count({
      where: { organizationId: organization.id },
    });

    const passportCount = await this.prisma.passport.count({
      where: {
        product: { organizationId: organization.id },
      },
    });

    return {
      connected: !!wooSettings.consumerKey,
      siteUrl: wooSettings.siteUrl || null,
      connectedAt: wooSettings.connectedAt || null,
      lastSyncAt: wooSettings.lastSyncAt || null,
      productCount,
      passportCount,
    };
  }

  // Push DPP info to WooCommerce product
  async pushDppToWooCommerce(
    organizationId: string,
    productId: string,
    qrCodeUrl: string,
    verificationUrl: string
  ): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    const settings = organization.settings as any;
    const wooSettings = settings?.woocommerce;

    if (!wooSettings?.consumerKey) {
      throw new Error('WooCommerce not connected');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    const attributes = product.attributes as any;
    const wooId = attributes?.wooId;

    if (!wooId) {
      throw new Error('Product not synced from WooCommerce');
    }

    this.client.setCredentials({
      siteUrl: wooSettings.siteUrl,
      consumerKey: wooSettings.consumerKey,
      consumerSecret: wooSettings.consumerSecret,
    });

    // Update product meta
    await this.client.updateProductMeta(wooId, [
      { id: 0, key: '_eurocomply_dpp_qr_url', value: qrCodeUrl },
      { id: 0, key: '_eurocomply_dpp_verify_url', value: verificationUrl },
    ]);
  }

  // Register webhooks for product updates
  private async registerWebhooks(
    credentials: WooCommerceCredentials
  ): Promise<void> {
    const webhookUrl = `https://${this.apiHost}/api/woocommerce/webhooks`;

    const topics = [
      'product.created',
      'product.updated',
      'product.deleted',
    ];

    for (const topic of topics) {
      try {
        await this.client.createWebhook(
          topic,
          webhookUrl,
          this.config.webhookSecret
        );
      } catch (error) {
        // Webhook may already exist
        console.warn(`Failed to register webhook ${topic}:`, error);
      }
    }
  }

  // Helper methods
  private async getOrganizationBySiteUrl(siteUrl: string) {
    const siteHost = new URL(siteUrl).hostname;
    return this.prisma.organization.findUnique({
      where: { domain: siteHost },
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
