/**
 * Shopify Product Sync Service
 *
 * Handles synchronization between Shopify products and EuroComply DPPs.
 */

import { EuroComplyClient, CreateProductInput, CreatePassportInput } from './eurocomply.js';

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  handle: string;
  status: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  metafields?: ShopifyMetafield[];
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  sku?: string;
  barcode?: string; // GTIN/EAN/UPC
  price: string;
  inventory_quantity?: number;
}

export interface ShopifyImage {
  id: number;
  src: string;
  alt?: string;
}

export interface ShopifyMetafield {
  id: number;
  namespace: string;
  key: string;
  value: string;
  type: string;
}

export interface SyncResult {
  shopifyProductId: number;
  eurocomplyProductId: string;
  passportId?: string;
  qrCodeUrl?: string;
  status: 'created' | 'updated' | 'error';
  error?: string;
}

export class ShopifySyncService {
  private eurocomply: EuroComplyClient;
  private manufacturerName: string;

  constructor(eurocomplyApiKey: string, manufacturerName: string) {
    this.eurocomply = new EuroComplyClient(eurocomplyApiKey);
    this.manufacturerName = manufacturerName;
  }

  /**
   * Sync a Shopify product to EuroComply
   */
  async syncProduct(shopifyProduct: ShopifyProduct): Promise<SyncResult> {
    try {
      // Get the first variant for SKU/barcode
      const variant = shopifyProduct.variants[0];

      // Create or update product in EuroComply
      const productInput: CreateProductInput = {
        name: shopifyProduct.title,
        description: this.stripHtml(shopifyProduct.body_html || ''),
        sku: variant?.sku || `shopify-${shopifyProduct.id}`,
        gtin: variant?.barcode || undefined,
        attributes: {
          shopifyId: shopifyProduct.id,
          shopifyHandle: shopifyProduct.handle,
          vendor: shopifyProduct.vendor,
          productType: shopifyProduct.product_type,
          variants: shopifyProduct.variants.map((v) => ({
            id: v.id,
            title: v.title,
            sku: v.sku,
            barcode: v.barcode,
            price: v.price,
          })),
        },
      };

      const product = await this.eurocomply.createProduct(productInput);

      // Create Digital Product Passport
      const passportInput: CreatePassportInput = {
        productId: product.id,
        data: {
          productId: product.id,
          productName: shopifyProduct.title,
          manufacturerName: this.manufacturerName,
          gtin: variant?.barcode,
          // Add sustainability data if available in metafields
          ...this.extractSustainabilityData(shopifyProduct.metafields),
        },
      };

      const passport = await this.eurocomply.createPassport(passportInput);

      // Generate QR code
      const qrResult = await this.eurocomply.generateQrCode(passport.id);

      return {
        shopifyProductId: shopifyProduct.id,
        eurocomplyProductId: product.id,
        passportId: passport.id,
        qrCodeUrl: qrResult.qrCodeUrl,
        status: 'created',
      };
    } catch (error: any) {
      return {
        shopifyProductId: shopifyProduct.id,
        eurocomplyProductId: '',
        status: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Sync multiple products
   */
  async syncProducts(products: ShopifyProduct[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const product of products) {
      const result = await this.syncProduct(product);
      results.push(result);
    }

    return results;
  }

  /**
   * Log a sale event (for lifecycle tracking)
   */
  async logSale(
    productId: string,
    quantity: number,
    orderId: string
  ): Promise<void> {
    await this.eurocomply.logLifecycleEvent(productId, {
      eventType: 'SOLD',
      quantity,
      data: {
        orderId,
        source: 'shopify',
      },
    });
  }

  /**
   * Log a return event
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
        source: 'shopify',
      },
    });
  }

  /**
   * Extract sustainability data from Shopify metafields
   */
  private extractSustainabilityData(
    metafields?: ShopifyMetafield[]
  ): Record<string, unknown> {
    if (!metafields) return {};

    const data: Record<string, unknown> = {};

    for (const field of metafields) {
      // Look for EuroComply namespace metafields
      if (field.namespace === 'eurocomply') {
        switch (field.key) {
          case 'carbon_footprint_value':
            data.carbonFootprint = {
              ...((data.carbonFootprint as object) || {}),
              value: parseFloat(field.value),
            };
            break;
          case 'carbon_footprint_unit':
            data.carbonFootprint = {
              ...((data.carbonFootprint as object) || {}),
              unit: field.value,
            };
            break;
          case 'recyclability_percentage':
            data.recyclability = {
              percentage: parseFloat(field.value),
            };
            break;
          case 'durability_years':
            data.durability = {
              expectedLifespan: parseInt(field.value, 10),
              unit: 'years',
            };
            break;
          case 'repairability_score':
            data.repairability = {
              score: parseFloat(field.value),
            };
            break;
        }
      }
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

export default ShopifySyncService;
