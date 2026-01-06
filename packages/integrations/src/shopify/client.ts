// Shopify API Client for ProductTrust

import crypto from 'crypto';
import type {
  ShopifyConfig,
  ShopifySession,
  ShopifyProduct,
  ShopifyShop,
} from './types.js';

export class ShopifyClient {
  private config: ShopifyConfig;
  private session: ShopifySession | null = null;

  constructor(config: ShopifyConfig) {
    this.config = config;
  }

  // Set the session for authenticated requests
  setSession(session: ShopifySession): void {
    this.session = session;
  }

  // Generate OAuth authorization URL
  getAuthUrl(shop: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.apiKey,
      scope: this.config.scopes.join(','),
      redirect_uri: redirectUri,
      state,
    });

    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(
    shop: string,
    code: string
  ): Promise<{ accessToken: string; scope: string }> {
    const response = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.config.apiKey,
          client_secret: this.config.apiSecret,
          code,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to exchange code: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      scope: data.scope,
    };
  }

  // Verify webhook HMAC signature
  verifyWebhook(body: string, hmacHeader: string): boolean {
    const hash = crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(body, 'utf8')
      .digest('base64');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
  }

  // Make authenticated API request
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.session) {
      throw new Error('No session set. Call setSession() first.');
    }

    const url = `https://${this.session.shop}/admin/api/${this.config.apiVersion}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.session.accessToken,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // Get shop information
  async getShop(): Promise<ShopifyShop> {
    const data = await this.request<{ shop: ShopifyShop }>('/shop.json');
    return data.shop;
  }

  // Get all products (paginated)
  async getProducts(limit = 50, pageInfo?: string): Promise<{
    products: ShopifyProduct[];
    nextPageInfo: string | null;
  }> {
    let endpoint = `/products.json?limit=${limit}&status=active`;
    if (pageInfo) {
      endpoint = `/products.json?limit=${limit}&page_info=${pageInfo}`;
    }

    const response = await fetch(
      `https://${this.session!.shop}/admin/api/${this.config.apiVersion}${endpoint}`,
      {
        headers: {
          'X-Shopify-Access-Token': this.session!.accessToken,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const data = await response.json();

    // Extract next page info from Link header
    const linkHeader = response.headers.get('Link');
    let nextPageInfo: string | null = null;

    if (linkHeader) {
      const nextMatch = linkHeader.match(/page_info=([^>&]+).*?rel="next"/);
      if (nextMatch) {
        nextPageInfo = nextMatch[1];
      }
    }

    return {
      products: data.products,
      nextPageInfo,
    };
  }

  // Get a single product
  async getProduct(productId: number): Promise<ShopifyProduct> {
    const data = await this.request<{ product: ShopifyProduct }>(
      `/products/${productId}.json`
    );
    return data.product;
  }

  // Get product count
  async getProductCount(): Promise<number> {
    const data = await this.request<{ count: number }>('/products/count.json');
    return data.count;
  }

  // Update product metafields (for storing DPP QR code URL)
  async setProductMetafield(
    productId: number,
    namespace: string,
    key: string,
    value: string,
    type: string = 'single_line_text_field'
  ): Promise<void> {
    await this.request(`/products/${productId}/metafields.json`, {
      method: 'POST',
      body: JSON.stringify({
        metafield: {
          namespace,
          key,
          value,
          type,
        },
      }),
    });
  }

  // Register webhooks for product updates
  async registerWebhooks(callbackUrl: string): Promise<void> {
    const webhooks = [
      { topic: 'products/create', address: `${callbackUrl}/products/create` },
      { topic: 'products/update', address: `${callbackUrl}/products/update` },
      { topic: 'products/delete', address: `${callbackUrl}/products/delete` },
      { topic: 'app/uninstalled', address: `${callbackUrl}/app/uninstalled` },
    ];

    for (const webhook of webhooks) {
      try {
        await this.request('/webhooks.json', {
          method: 'POST',
          body: JSON.stringify({ webhook }),
        });
      } catch (error) {
        // Webhook may already exist
        console.warn(`Failed to register webhook ${webhook.topic}:`, error);
      }
    }
  }
}
