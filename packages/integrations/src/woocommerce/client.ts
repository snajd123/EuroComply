// WooCommerce REST API Client

import crypto from 'crypto';
import { WooCommerceConfig, WooCommerceStore, WooCommerceMerchantData } from './types.js';

export class WooCommerceClient {
  private config: WooCommerceConfig;

  constructor(config: WooCommerceConfig) {
    this.config = config;
  }

  /**
   * Make authenticated request to WooCommerce REST API
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = new URL(`${this.config.siteUrl}/wp-json/${this.config.version}${endpoint}`);

    // Add OAuth 1.0a authentication
    const authHeader = this.generateOAuthHeader(
      options.method || 'GET',
      url.toString()
    );

    const response = await fetch(url.toString(), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Generate OAuth 1.0a header for WooCommerce
   */
  private generateOAuthHeader(method: string, url: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.config.consumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA256',
      oauth_timestamp: timestamp,
      oauth_version: '1.0',
    };

    // Create signature base string
    const paramString = Object.keys(oauthParams)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
      .join('&');

    const signatureBaseString = [
      method.toUpperCase(),
      encodeURIComponent(url.split('?')[0]),
      encodeURIComponent(paramString),
    ].join('&');

    // Generate signature
    const signingKey = `${encodeURIComponent(this.config.consumerSecret)}&`;
    const signature = crypto
      .createHmac('sha256', signingKey)
      .update(signatureBaseString)
      .digest('base64');

    oauthParams['oauth_signature'] = signature;

    // Build header
    const headerParams = Object.keys(oauthParams)
      .sort()
      .map((key) => `${key}="${encodeURIComponent(oauthParams[key])}"`)
      .join(', ');

    return `OAuth ${headerParams}`;
  }

  /**
   * Get store settings
   */
  async getStoreSettings(): Promise<WooCommerceStore> {
    const settings = await this.request<{ name: string; value: unknown }[]>(
      '/settings/general'
    );

    // Parse settings into store object
    const getValue = (id: string): string => {
      const setting = settings.find((s) => s.name === id);
      return (setting?.value as string) || '';
    };

    return {
      name: getValue('woocommerce_store_name') || getValue('blogname'),
      description: getValue('blogdescription'),
      url: this.config.siteUrl,
      email: getValue('woocommerce_email_from_address') || getValue('admin_email'),
      timezone: getValue('timezone_string'),
      currency: getValue('woocommerce_currency'),
      address: {
        address_1: getValue('woocommerce_store_address'),
        address_2: getValue('woocommerce_store_address_2'),
        city: getValue('woocommerce_store_city'),
        state: getValue('woocommerce_default_country')?.split(':')?.[1] || '',
        postcode: getValue('woocommerce_store_postcode'),
        country: getValue('woocommerce_default_country')?.split(':')?.[0] || '',
      },
    };
  }

  /**
   * Extract merchant data for DSA compliance
   */
  async getMerchantData(): Promise<WooCommerceMerchantData> {
    const store = await this.getStoreSettings();

    return {
      siteUrl: this.config.siteUrl,
      storeName: store.name,
      storeEmail: store.email,
      address: {
        line1: store.address.address_1,
        line2: store.address.address_2 || null,
        city: store.address.city,
        state: store.address.state,
        country: store.address.country,
        zip: store.address.postcode,
      },
      currency: store.currency,
      timezone: store.timezone,
    };
  }

  /**
   * Test connection to WooCommerce
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/system_status');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Verify WooCommerce webhook signature
 */
export function verifyWooCommerceWebhook(
  secret: string,
  payload: string,
  signature: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
