/**
 * WooCommerce Product Sync Service
 *
 * Handles synchronization between WooCommerce products and EuroComply DPPs.
 */

import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { EuroComplyClient, CreateProductInput, CreatePassportInput } from './eurocomply.js';

export interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  type: string;
  status: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number;
  stock_status: string;
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  categories: { id: number; name: string; slug: string }[];
  images: { id: number; src: string; alt: string }[];
  attributes: WooCommerceAttribute[];
  meta_data: WooCommerceMeta[];
}

export interface WooCommerceAttribute {
  id: number;
  name: string;
  options: string[];
  visible: boolean;
}

export interface WooCommerceMeta {
  id: number;
  key: string;
  value: string;
}

export interface WooCommerceOrder {
  id: number;
  status: string;
  line_items: WooCommerceLineItem[];
  billing: WooCommerceAddress;
  shipping: WooCommerceAddress;
}

export interface WooCommerceLineItem {
  id: number;
  product_id: number;
  variation_id: number;
  quantity: number;
  sku: string;
  name: string;
  price: number;
}

export interface WooCommerceAddress {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

export interface SyncResult {
  wooProductId: number;
  eurocomplyProductId: string;
  passportId?: string;
  qrCodeUrl?: string;
  status: 'created' | 'updated' | 'error';
  error?: string;
}

export class WooCommerceSyncService {
  private eurocomply: EuroComplyClient;
  private woocommerce: WooCommerceRestApi;
  private manufacturerName: string;

  constructor(
    eurocomplyApiKey: string,
    manufacturerName: string,
    wooConfig: {
      url: string;
      consumerKey: string;
      consumerSecret: string;
    }
  ) {
    this.eurocomply = new EuroComplyClient(eurocomplyApiKey);
    this.manufacturerName = manufacturerName;

    this.woocommerce = new WooCommerceRestApi({
      url: wooConfig.url,
      consumerKey: wooConfig.consumerKey,
      consumerSecret: wooConfig.consumerSecret,
      version: 'wc/v3',
    });
  }

  /**
   * Fetch products from WooCommerce
   */
  async fetchProducts(params?: {
    page?: number;
    per_page?: number;
    status?: string;
  }): Promise<WooCommerceProduct[]> {
    const response = await this.woocommerce.get('products', params || {});
    return response.data;
  }

  /**
   * Sync a WooCommerce product to EuroComply
   */
  async syncProduct(product: WooCommerceProduct): Promise<SyncResult> {
    try {
      // Create or update product in EuroComply
      const productInput: CreateProductInput = {
        name: product.name,
        description: this.stripHtml(product.description),
        sku: product.sku || `woo-${product.id}`,
        gtin: this.getMetaValue(product.meta_data, '_gtin') || undefined,
        attributes: {
          wooId: product.id,
          wooSlug: product.slug,
          type: product.type,
          price: product.price,
          weight: product.weight,
          dimensions: product.dimensions,
          categories: product.categories.map((c) => c.name),
          attributes: product.attributes.map((a) => ({
            name: a.name,
            values: a.options,
          })),
        },
      };

      const ecProduct = await this.eurocomply.createProduct(productInput);

      // Create Digital Product Passport
      const passportInput: CreatePassportInput = {
        productId: ecProduct.id,
        data: {
          productId: ecProduct.id,
          productName: product.name,
          manufacturerName: this.manufacturerName,
          gtin: productInput.gtin,
          // Add sustainability data from meta
          ...this.extractSustainabilityData(product.meta_data),
        },
      };

      const passport = await this.eurocomply.createPassport(passportInput);

      // Generate QR code
      const qrResult = await this.eurocomply.generateQrCode(passport.id);

      // Update WooCommerce product with passport info
      await this.updateWooProductMeta(product.id, {
        _eurocomply_passport_id: passport.id,
        _eurocomply_qr_url: qrResult.qrCodeUrl,
        _eurocomply_verification_url: qrResult.verificationUrl,
      });

      return {
        wooProductId: product.id,
        eurocomplyProductId: ecProduct.id,
        passportId: passport.id,
        qrCodeUrl: qrResult.qrCodeUrl,
        status: 'created',
      };
    } catch (error: any) {
      return {
        wooProductId: product.id,
        eurocomplyProductId: '',
        status: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Sync multiple products
   */
  async syncProducts(products: WooCommerceProduct[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const product of products) {
      const result = await this.syncProduct(product);
      results.push(result);
    }

    return results;
  }

  /**
   * Sync all products from WooCommerce
   */
  async syncAllProducts(): Promise<SyncResult[]> {
    const allResults: SyncResult[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const products = await this.fetchProducts({ page, per_page: 100 });

      if (products.length === 0) {
        hasMore = false;
        break;
      }

      const results = await this.syncProducts(products);
      allResults.push(...results);

      page++;
    }

    return allResults;
  }

  /**
   * Log a sale event (for lifecycle tracking)
   */
  async logSale(
    productId: string,
    quantity: number,
    orderId: number
  ): Promise<void> {
    await this.eurocomply.logLifecycleEvent(productId, {
      eventType: 'SOLD',
      quantity,
      data: {
        orderId,
        source: 'woocommerce',
      },
    });
  }

  /**
   * Log a return/refund event
   */
  async logReturn(
    productId: string,
    quantity: number,
    reason: string
  ): Promise<void> {
    await this.eurocomply.logLifecycleEvent(productId, {
      eventType: 'RETURNED',
      quantity,
      reason,
      data: {
        source: 'woocommerce',
      },
    });
  }

  /**
   * Update WooCommerce product meta data
   */
  private async updateWooProductMeta(
    productId: number,
    meta: Record<string, string>
  ): Promise<void> {
    const metaData = Object.entries(meta).map(([key, value]) => ({
      key,
      value,
    }));

    await this.woocommerce.put(`products/${productId}`, {
      meta_data: metaData,
    });
  }

  /**
   * Get meta value from WooCommerce meta data array
   */
  private getMetaValue(meta: WooCommerceMeta[], key: string): string | null {
    const item = meta.find((m) => m.key === key);
    return item?.value || null;
  }

  /**
   * Extract sustainability data from WooCommerce meta
   */
  private extractSustainabilityData(
    meta: WooCommerceMeta[]
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    const carbonValue = this.getMetaValue(meta, '_eurocomply_carbon_footprint');
    if (carbonValue) {
      data.carbonFootprint = {
        value: parseFloat(carbonValue),
        unit: this.getMetaValue(meta, '_eurocomply_carbon_unit') || 'kgCO2e',
      };
    }

    const recyclability = this.getMetaValue(meta, '_eurocomply_recyclability');
    if (recyclability) {
      data.recyclability = {
        percentage: parseFloat(recyclability),
      };
    }

    const durability = this.getMetaValue(meta, '_eurocomply_durability');
    if (durability) {
      data.durability = {
        expectedLifespan: parseInt(durability, 10),
        unit: 'years',
      };
    }

    const repairability = this.getMetaValue(meta, '_eurocomply_repairability');
    if (repairability) {
      data.repairability = {
        score: parseFloat(repairability),
      };
    }

    return data;
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }
}

export default WooCommerceSyncService;
