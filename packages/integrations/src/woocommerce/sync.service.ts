// WooCommerce Merchant Sync Service
// Syncs WooCommerce store data to EuroComply Merchant model for DSA compliance

import { prisma } from '@eurocomply/database';
import { WooCommerceClient } from './client.js';
import { WooCommerceConfig, WooCommerceMerchantData } from './types.js';

export class WooCommerceSyncService {
  private config: WooCommerceConfig;

  constructor(config: WooCommerceConfig) {
    this.config = config;
  }

  /**
   * Connect a WooCommerce store to EuroComply
   */
  async connectStore(
    consumerKey: string,
    consumerSecret: string,
    siteUrl: string
  ): Promise<{ organizationId: string; merchantId: string }> {
    const client = new WooCommerceClient({
      ...this.config,
      consumerKey,
      consumerSecret,
      siteUrl,
    });

    // Test connection first
    const connected = await client.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to WooCommerce store');
    }

    // Get store data
    const merchantData = await client.getMerchantData();

    // Create slug from site URL
    const orgSlug = new URL(siteUrl).hostname
      .replace(/\./g, '-')
      .replace(/[^a-z0-9-]/g, '');

    // Create or get organization
    let organization = await prisma.organization.findFirst({
      where: { slug: orgSlug },
    });

    if (!organization) {
      organization = await prisma.organization.create({
        data: {
          name: merchantData.storeName,
          slug: orgSlug,
          domain: new URL(siteUrl).hostname,
          plan: 'STARTER',
          settings: {
            source: 'woocommerce',
            woocommerceSiteUrl: siteUrl,
            // In production, encrypt these!
            woocommerceConsumerKey: consumerKey,
            woocommerceConsumerSecret: consumerSecret,
          },
        },
      });
    } else {
      await prisma.organization.update({
        where: { id: organization.id },
        data: {
          settings: {
            ...(organization.settings as object),
            source: 'woocommerce',
            woocommerceSiteUrl: siteUrl,
            woocommerceConsumerKey: consumerKey,
            woocommerceConsumerSecret: consumerSecret,
          },
        },
      });
    }

    // Create or update merchant
    let merchant = await prisma.merchant.findFirst({
      where: { organizationId: organization.id },
    });

    if (!merchant) {
      merchant = await prisma.merchant.create({
        data: {
          organizationId: organization.id,
          legalName: merchantData.storeName,
          tradingName: merchantData.storeName,
          country: merchantData.address.country,
          addressLine1: merchantData.address.line1,
          addressLine2: merchantData.address.line2,
          city: merchantData.address.city,
          postalCode: merchantData.address.zip,
          email: merchantData.storeEmail,
          dsaStatus: 'IN_PROGRESS',
        },
      });
    } else {
      merchant = await prisma.merchant.update({
        where: { id: merchant.id },
        data: {
          legalName: merchantData.storeName,
          tradingName: merchantData.storeName,
          country: merchantData.address.country,
          addressLine1: merchantData.address.line1,
          addressLine2: merchantData.address.line2,
          city: merchantData.address.city,
          postalCode: merchantData.address.zip,
          email: merchantData.storeEmail,
        },
      });
    }

    // Log connection
    await prisma.auditLog.create({
      data: {
        organizationId: organization.id,
        actorType: 'SYSTEM',
        action: 'WOOCOMMERCE_STORE_CONNECTED',
        resourceType: 'Organization',
        resourceId: organization.id,
        details: {
          siteUrl,
          merchantId: merchant.id,
        },
      },
    });

    return {
      organizationId: organization.id,
      merchantId: merchant.id,
    };
  }

  /**
   * Sync store data from WooCommerce
   */
  async syncStore(organizationId: string): Promise<void> {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { merchants: { take: 1 } },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    const settings = organization.settings as {
      woocommerceSiteUrl?: string;
      woocommerceConsumerKey?: string;
      woocommerceConsumerSecret?: string;
    };

    if (!settings.woocommerceSiteUrl || !settings.woocommerceConsumerKey) {
      throw new Error('WooCommerce not connected');
    }

    const client = new WooCommerceClient({
      ...this.config,
      siteUrl: settings.woocommerceSiteUrl,
      consumerKey: settings.woocommerceConsumerKey,
      consumerSecret: settings.woocommerceConsumerSecret || '',
    });

    const merchantData = await client.getMerchantData();
    const merchant = organization.merchants[0];

    if (merchant) {
      await prisma.merchant.update({
        where: { id: merchant.id },
        data: {
          legalName: merchantData.storeName,
          tradingName: merchantData.storeName,
          country: merchantData.address.country,
          addressLine1: merchantData.address.line1,
          addressLine2: merchantData.address.line2,
          city: merchantData.address.city,
          postalCode: merchantData.address.zip,
          email: merchantData.storeEmail,
        },
      });
    }
  }

  /**
   * Disconnect WooCommerce store
   */
  async disconnectStore(organizationId: string): Promise<void> {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: {
          ...(organization.settings as object),
          woocommerceDisconnectedAt: new Date().toISOString(),
          woocommerceConsumerKey: null,
          woocommerceConsumerSecret: null,
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        actorType: 'SYSTEM',
        action: 'WOOCOMMERCE_STORE_DISCONNECTED',
        resourceType: 'Organization',
        resourceId: organizationId,
        details: {},
      },
    });
  }
}
