// WooCommerce API Client for ProductTrust

import crypto from 'crypto';
import type {
  WooCommerceCredentials,
  WooCommerceProduct,
  WooCommerceShop,
  WooMetaData,
} from './types.js';

export class WooCommerceClient {
  private credentials: WooCommerceCredentials | null = null;

  // Set credentials for API requests
  setCredentials(credentials: WooCommerceCredentials): void {
    this.credentials = credentials;
  }

  // Generate authorization header
  private getAuthHeader(): string {
    if (!this.credentials) {
      throw new Error('No credentials set. Call setCredentials() first.');
    }

    const encoded = Buffer.from(
      `${this.credentials.consumerKey}:${this.credentials.consumerSecret}`
    ).toString('base64');

    return `Basic ${encoded}`;
  }

  // Make authenticated API request
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.credentials) {
      throw new Error('No credentials set. Call setCredentials() first.');
    }

    const baseUrl = this.credentials.siteUrl.replace(/\/$/, '');
    const url = `${baseUrl}/wp-json/wc/v3${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.getAuthHeader(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // Test connection and get shop info
  async testConnection(): Promise<WooCommerceShop> {
    // Use system status endpoint to verify connection
    const data = await this.request<any>('/system_status');

    return {
      name: data.environment?.site_title || 'Unknown',
      description: '',
      url: this.credentials!.siteUrl,
      wc_version: data.environment?.version || 'Unknown',
      currency: data.settings?.currency || 'USD',
      country: data.settings?.store_country || 'US',
    };
  }

  // Get shop settings
  async getSettings(): Promise<any> {
    return this.request('/settings/general');
  }

  // Get all products (paginated)
  async getProducts(
    page = 1,
    perPage = 50
  ): Promise<{
    products: WooCommerceProduct[];
    totalPages: number;
    total: number;
  }> {
    const response = await fetch(
      `${this.credentials!.siteUrl.replace(/\/$/, '')}/wp-json/wc/v3/products?page=${page}&per_page=${perPage}&status=publish`,
      {
        headers: {
          Authorization: this.getAuthHeader(),
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const products = await response.json();
    const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1');
    const total = parseInt(response.headers.get('X-WP-Total') || '0');

    return { products, totalPages, total };
  }

  // Get a single product
  async getProduct(productId: number): Promise<WooCommerceProduct> {
    return this.request(`/products/${productId}`);
  }

  // Get product count
  async getProductCount(): Promise<number> {
    const response = await this.request<any>('/reports/products/totals');
    return response.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
  }

  // Update product meta data (for storing DPP info)
  async updateProductMeta(
    productId: number,
    metaData: WooMetaData[]
  ): Promise<WooCommerceProduct> {
    return this.request(`/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ meta_data: metaData }),
    });
  }

  // Create webhook
  async createWebhook(
    topic: string,
    deliveryUrl: string,
    secret: string
  ): Promise<any> {
    return this.request('/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        name: `EuroComply - ${topic}`,
        topic,
        delivery_url: deliveryUrl,
        secret,
        status: 'active',
      }),
    });
  }

  // Verify webhook signature
  static verifyWebhook(
    body: string,
    signature: string,
    secret: string
  ): boolean {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(signature)
    );
  }
}
