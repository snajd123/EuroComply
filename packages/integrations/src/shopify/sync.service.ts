// Shopify Merchant Sync Service
// Syncs Shopify store data to EuroComply Merchant model for DSA compliance

import { prisma } from '@eurocomply/database';
import { ShopifyClient } from './client.js';
import { ShopifyConfig, ShopifyMerchantData } from './types.js';

export interface ShopifyInstallation {
  id: string;
  organizationId: string;
  shopDomain: string;
  accessToken: string;
  scope: string;
  merchantId: string | null;
  installedAt: Date;
  uninstalledAt: Date | null;
}

export class ShopifySyncService {
  private config: ShopifyConfig;

  constructor(config: ShopifyConfig) {
    this.config = config;
  }

  /**
   * Handle new Shopify app installation
   * Creates organization, merchant, and syncs initial data
   */
  async handleInstall(
    shopDomain: string,
    accessToken: string,
    scope: string
  ): Promise<{ organizationId: string; merchantId: string }> {
    const client = new ShopifyClient(this.config, shopDomain, accessToken);

    // Get shop data from Shopify
    const merchantData = await client.getMerchantData();

    // Create or get organization
    const orgSlug = shopDomain.replace('.myshopify.com', '');
    let organization = await prisma.organization.findFirst({
      where: { slug: orgSlug },
    });

    if (!organization) {
      organization = await prisma.organization.create({
        data: {
          name: merchantData.shopName,
          slug: orgSlug,
          domain: shopDomain,
          plan: 'STARTER',
          settings: {
            source: 'shopify',
            shopifyDomain: shopDomain,
            shopifyScope: scope,
            shopifyAccessToken: accessToken, // Encrypted in production!
          },
        },
      });
    } else {
      // Update existing organization with Shopify data
      await prisma.organization.update({
        where: { id: organization.id },
        data: {
          settings: {
            ...(organization.settings as object),
            source: 'shopify',
            shopifyDomain: shopDomain,
            shopifyScope: scope,
            shopifyAccessToken: accessToken,
          },
        },
      });
    }

    // Create or update merchant for DSA compliance
    let merchant = await prisma.merchant.findFirst({
      where: {
        organizationId: organization.id,
        // Match by shop domain stored in a way we can query
      },
    });

    if (!merchant) {
      merchant = await prisma.merchant.create({
        data: {
          organizationId: organization.id,
          legalName: merchantData.shopName,
          tradingName: merchantData.shopName,
          country: merchantData.address.countryCode,
          addressLine1: merchantData.address.line1,
          addressLine2: merchantData.address.line2,
          city: merchantData.address.city,
          postalCode: merchantData.address.zip,
          email: merchantData.email,
          phone: merchantData.phone,
          dsaStatus: 'IN_PROGRESS',
        },
      });
    } else {
      // Sync updated data from Shopify
      merchant = await prisma.merchant.update({
        where: { id: merchant.id },
        data: {
          legalName: merchantData.shopName,
          tradingName: merchantData.shopName,
          country: merchantData.address.countryCode,
          addressLine1: merchantData.address.line1,
          addressLine2: merchantData.address.line2,
          city: merchantData.address.city,
          postalCode: merchantData.address.zip,
          email: merchantData.email,
          phone: merchantData.phone,
        },
      });
    }

    // Register webhooks
    const callbackUrl = `https://${this.config.hostName}/api`;
    await client.registerWebhooks(callbackUrl);

    // Log the installation
    await prisma.auditLog.create({
      data: {
        organizationId: organization.id,
        actorType: 'SYSTEM',
        action: 'SHOPIFY_APP_INSTALLED',
        resourceType: 'Organization',
        resourceId: organization.id,
        details: {
          shopDomain,
          merchantId: merchant.id,
          scope,
        },
      },
    });

    return {
      organizationId: organization.id,
      merchantId: merchant.id,
    };
  }

  /**
   * Handle app uninstall webhook
   */
  async handleUninstall(shopDomain: string): Promise<void> {
    const orgSlug = shopDomain.replace('.myshopify.com', '');

    const organization = await prisma.organization.findFirst({
      where: { slug: orgSlug },
    });

    if (organization) {
      // Update organization settings to mark as uninstalled
      await prisma.organization.update({
        where: { id: organization.id },
        data: {
          settings: {
            ...(organization.settings as object),
            shopifyUninstalledAt: new Date().toISOString(),
            shopifyAccessToken: null, // Clear access token
          },
        },
      });

      // Log the uninstall
      await prisma.auditLog.create({
        data: {
          organizationId: organization.id,
          actorType: 'SYSTEM',
          action: 'SHOPIFY_APP_UNINSTALLED',
          resourceType: 'Organization',
          resourceId: organization.id,
          details: { shopDomain },
        },
      });
    }
  }

  /**
   * Handle shop/update webhook - sync updated shop data
   */
  async handleShopUpdate(shopDomain: string, shopData: ShopifyMerchantData): Promise<void> {
    const orgSlug = shopDomain.replace('.myshopify.com', '');

    const organization = await prisma.organization.findFirst({
      where: { slug: orgSlug },
      include: { merchants: { take: 1 } },
    });

    if (!organization || organization.merchants.length === 0) {
      return;
    }

    const merchant = organization.merchants[0];

    // Update merchant with latest shop data
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        legalName: shopData.shopName,
        tradingName: shopData.shopName,
        country: shopData.address.countryCode,
        addressLine1: shopData.address.line1,
        addressLine2: shopData.address.line2,
        city: shopData.address.city,
        postalCode: shopData.address.zip,
        email: shopData.email,
        phone: shopData.phone,
      },
    });
  }

  /**
   * Get DSA compliance status for a Shopify store
   */
  async getDsaStatus(shopDomain: string): Promise<{
    compliant: boolean;
    score: number;
    missingItems: string[];
    merchant: unknown;
  } | null> {
    const orgSlug = shopDomain.replace('.myshopify.com', '');

    const organization = await prisma.organization.findFirst({
      where: { slug: orgSlug },
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

    if (!organization || organization.merchants.length === 0) {
      return null;
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

    const missingItems: string[] = [];
    if (!checks.hasName) missingItems.push('Legal name');
    if (!checks.hasAddress) missingItems.push('Business address');
    if (!checks.hasEmail) missingItems.push('Email');
    if (!checks.hasPhone) missingItems.push('Phone number');
    if (!checks.hasIdDocument) missingItems.push('ID document attestation');
    if (!checks.hasBankAccount) missingItems.push('Bank account');
    if (!checks.hasSelfCertification) missingItems.push('DSA self-certification');
    if (!checks.hasTradeRegister) missingItems.push('Trade register number');

    const completedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    const score = Math.round((completedChecks / totalChecks) * 100);

    return {
      compliant: score === 100,
      score,
      missingItems,
      merchant: {
        id: merchant.id,
        legalName: merchant.legalName,
        dsaStatus: merchant.dsaStatus,
        country: merchant.country,
      },
    };
  }
}
