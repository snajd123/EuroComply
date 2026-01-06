/**
 * EuroComply Shopify Plugin
 *
 * This plugin enables Shopify merchants to:
 * - Automatically create Digital Product Passports for products
 * - Generate QR codes for product pages
 * - Track product lifecycle events (sales, returns)
 * - Sync product data with EuroComply
 */

export { EuroComplyClient } from './lib/eurocomply.js';
export { ShopifySyncService } from './lib/shopify-sync.js';
export { ShopifyWebhookHandler } from './api/webhooks.js';

// Re-export types
export type {
  Product,
  Passport,
  CreateProductInput,
  CreatePassportInput,
} from './lib/eurocomply.js';

export type {
  ShopifyProduct,
  ShopifyVariant,
  ShopifyImage,
  ShopifyMetafield,
  SyncResult,
} from './lib/shopify-sync.js';

/**
 * Initialize the EuroComply Shopify plugin
 */
export function initializePlugin(config: {
  eurocomplyApiKey: string;
  manufacturerName: string;
  shopifyWebhookSecret: string;
}) {
  const { ShopifyWebhookHandler } = require('./api/webhooks.js');

  return {
    webhookHandler: new ShopifyWebhookHandler(
      config.eurocomplyApiKey,
      config.manufacturerName,
      config.shopifyWebhookSecret
    ),
    syncService: new (require('./lib/shopify-sync.js').ShopifySyncService)(
      config.eurocomplyApiKey,
      config.manufacturerName
    ),
  };
}

/**
 * Shopify App Configuration
 *
 * Required scopes:
 * - read_products: Access product data
 * - write_products: Update products with DPP metafields
 * - read_orders: Track sales for lifecycle events
 * - read_inventory: Inventory tracking
 *
 * Required webhooks:
 * - products/create
 * - products/update
 * - products/delete
 * - orders/create
 * - orders/cancelled
 * - refunds/create
 */
export const REQUIRED_SCOPES = [
  'read_products',
  'write_products',
  'read_orders',
  'read_inventory',
];

export const REQUIRED_WEBHOOKS = [
  'products/create',
  'products/update',
  'products/delete',
  'orders/create',
  'orders/cancelled',
  'refunds/create',
];

/**
 * Metafield definitions for EuroComply data
 */
export const METAFIELD_DEFINITIONS = [
  {
    namespace: 'eurocomply',
    key: 'passport_id',
    type: 'single_line_text_field',
    description: 'EuroComply Digital Product Passport ID',
  },
  {
    namespace: 'eurocomply',
    key: 'passport_qr',
    type: 'url',
    description: 'QR Code URL for Digital Product Passport',
  },
  {
    namespace: 'eurocomply',
    key: 'verification_url',
    type: 'url',
    description: 'Passport verification URL',
  },
  {
    namespace: 'eurocomply',
    key: 'carbon_footprint_value',
    type: 'number_decimal',
    description: 'Product carbon footprint value',
  },
  {
    namespace: 'eurocomply',
    key: 'carbon_footprint_unit',
    type: 'single_line_text_field',
    description: 'Carbon footprint unit (e.g., kgCO2e)',
  },
  {
    namespace: 'eurocomply',
    key: 'recyclability_percentage',
    type: 'number_decimal',
    description: 'Product recyclability percentage',
  },
  {
    namespace: 'eurocomply',
    key: 'durability_years',
    type: 'number_integer',
    description: 'Expected product lifespan in years',
  },
  {
    namespace: 'eurocomply',
    key: 'repairability_score',
    type: 'number_decimal',
    description: 'Product repairability score (0-10)',
  },
];
