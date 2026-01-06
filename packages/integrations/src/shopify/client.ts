// Shopify API Client

import crypto from 'crypto';
import {
  ShopifyConfig,
  ShopifyShop,
  ShopifyAccessToken,
  ShopifyMerchantData,
  SHOPIFY_WEBHOOK_TOPICS,
} from './types.js';

export class ShopifyClient {
  private config: ShopifyConfig;
  private shopDomain: string;
  private accessToken: string;

  constructor(config: ShopifyConfig, shopDomain: string, accessToken: string) {
    this.config = config;
    this.shopDomain = shopDomain;
    this.accessToken = accessToken;
  }

  /**
   * Make authenticated request to Shopify Admin API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `https://${this.shopDomain}/admin/api/${this.config.apiVersion}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.accessToken,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get shop information
   */
  async getShop(): Promise<ShopifyShop> {
    const data = await this.request<{ shop: ShopifyShop }>('/shop.json');
    return data.shop;
  }

  /**
   * Extract merchant data for DSA compliance
   */
  async getMerchantData(): Promise<ShopifyMerchantData> {
    const shop = await this.getShop();

    return {
      shopDomain: shop.myshopifyDomain,
      shopName: shop.name,
      ownerName: shop.shopOwner,
      email: shop.email,
      phone: shop.phone || null,
      address: {
        line1: shop.address1,
        line2: shop.address2,
        city: shop.city,
        province: shop.province,
        country: shop.country,
        countryCode: shop.countryCode,
        zip: shop.zip,
      },
      currency: shop.currency,
      timezone: shop.timezone,
    };
  }

  /**
   * Register webhooks for the app
   */
  async registerWebhooks(callbackUrl: string): Promise<void> {
    for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
      try {
        await this.request('/webhooks.json', {
          method: 'POST',
          body: JSON.stringify({
            webhook: {
              topic,
              address: `${callbackUrl}/shopify/webhooks`,
              format: 'json',
            },
          }),
        });
      } catch (error) {
        // Webhook might already exist, that's fine
        console.warn(`Failed to register webhook ${topic}:`, error);
      }
    }
  }

  /**
   * Delete all webhooks (for uninstall cleanup)
   */
  async deleteAllWebhooks(): Promise<void> {
    const data = await this.request<{ webhooks: { id: number }[] }>('/webhooks.json');

    for (const webhook of data.webhooks) {
      try {
        await this.request(`/webhooks/${webhook.id}.json`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.warn(`Failed to delete webhook ${webhook.id}:`, error);
      }
    }
  }
}

/**
 * Shopify OAuth helper functions
 */
export const ShopifyOAuth = {
  /**
   * Generate the OAuth authorization URL
   */
  getAuthorizationUrl(config: ShopifyConfig, shop: string, state: string): string {
    const redirectUri = `https://${config.hostName}/api/shopify/callback`;
    const scopes = config.scopes.join(',');

    return `https://${shop}/admin/oauth/authorize?` +
      `client_id=${config.apiKey}&` +
      `scope=${scopes}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}`;
  },

  /**
   * Exchange authorization code for access token
   */
  async getAccessToken(
    config: ShopifyConfig,
    shop: string,
    code: string
  ): Promise<ShopifyAccessToken> {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.apiKey,
        client_secret: config.apiSecret,
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get access token: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      scope: data.scope,
    };
  },

  /**
   * Verify HMAC signature from Shopify
   */
  verifyHmac(config: ShopifyConfig, query: Record<string, string>): boolean {
    const { hmac, ...params } = query;

    // Sort and encode parameters
    const message = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    const generatedHmac = crypto
      .createHmac('sha256', config.apiSecret)
      .update(message)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(hmac),
      Buffer.from(generatedHmac)
    );
  },

  /**
   * Verify webhook HMAC signature
   */
  verifyWebhookHmac(config: ShopifyConfig, body: string, hmacHeader: string): boolean {
    const generatedHmac = crypto
      .createHmac('sha256', config.apiSecret)
      .update(body, 'utf8')
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(hmacHeader),
      Buffer.from(generatedHmac)
    );
  },

  /**
   * Sanitize shop domain
   */
  sanitizeShop(shop: string): string | null {
    // Must be a valid myshopify.com domain
    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
    const sanitized = shop.toLowerCase().trim();

    if (!shopRegex.test(sanitized)) {
      return null;
    }

    return sanitized;
  },
};
