/**
 * EuroComply WooCommerce Plugin
 *
 * This plugin enables WooCommerce merchants to:
 * - Automatically create Digital Product Passports for products
 * - Generate QR codes for product pages
 * - Track product lifecycle events (sales, returns)
 * - Sync product data with EuroComply
 */

export { EuroComplyClient } from './lib/eurocomply.js';
export { WooCommerceSyncService } from './lib/woocommerce-sync.js';
export { WooCommerceWebhookHandler } from './api/webhooks.js';

// Re-export types
export type {
  Product,
  Passport,
  CreateProductInput,
  CreatePassportInput,
} from './lib/eurocomply.js';

export type {
  WooCommerceProduct,
  WooCommerceAttribute,
  WooCommerceMeta,
  WooCommerceOrder,
  WooCommerceLineItem,
  SyncResult,
} from './lib/woocommerce-sync.js';

/**
 * Initialize the EuroComply WooCommerce plugin
 */
export function initializePlugin(config: {
  eurocomplyApiKey: string;
  manufacturerName: string;
  woocommerce: {
    url: string;
    consumerKey: string;
    consumerSecret: string;
  };
  webhookSecret: string;
}) {
  const { WooCommerceWebhookHandler } = require('./api/webhooks.js');
  const { WooCommerceSyncService } = require('./lib/woocommerce-sync.js');

  return {
    webhookHandler: new WooCommerceWebhookHandler(
      config.eurocomplyApiKey,
      config.manufacturerName,
      config.webhookSecret,
      config.woocommerce
    ),
    syncService: new WooCommerceSyncService(
      config.eurocomplyApiKey,
      config.manufacturerName,
      config.woocommerce
    ),
  };
}

/**
 * WooCommerce Plugin Configuration
 *
 * Required WooCommerce REST API permissions:
 * - Read products
 * - Write products (to add DPP metadata)
 * - Read orders
 *
 * Required webhooks:
 * - product.created
 * - product.updated
 * - product.deleted
 * - order.created
 * - order.updated
 */
export const REQUIRED_WEBHOOKS = [
  'product.created',
  'product.updated',
  'product.deleted',
  'order.created',
  'order.updated',
];

/**
 * Custom meta fields for EuroComply data
 *
 * These fields can be added to WooCommerce products to store
 * sustainability data and DPP information.
 */
export const META_FIELD_KEYS = {
  // EuroComply DPP fields (read-only, set by sync)
  PASSPORT_ID: '_eurocomply_passport_id',
  QR_URL: '_eurocomply_qr_url',
  VERIFICATION_URL: '_eurocomply_verification_url',

  // Sustainability fields (editable by merchant)
  CARBON_FOOTPRINT: '_eurocomply_carbon_footprint',
  CARBON_UNIT: '_eurocomply_carbon_unit',
  RECYCLABILITY: '_eurocomply_recyclability',
  DURABILITY: '_eurocomply_durability',
  REPAIRABILITY: '_eurocomply_repairability',

  // Product identification
  GTIN: '_gtin',
  EAN: '_ean',
};

/**
 * Example shortcode for displaying DPP QR code
 *
 * Usage in WordPress: [eurocomply_passport]
 *
 * This would be implemented in PHP:
 * ```php
 * function eurocomply_passport_shortcode($atts) {
 *   global $product;
 *   $qr_url = get_post_meta($product->get_id(), '_eurocomply_qr_url', true);
 *   $verification_url = get_post_meta($product->get_id(), '_eurocomply_verification_url', true);
 *
 *   if (!$qr_url) return '';
 *
 *   return sprintf(
 *     '<div class="eurocomply-passport">
 *       <img src="%s" alt="Digital Product Passport" />
 *       <a href="%s" target="_blank">Verify Product</a>
 *     </div>',
 *     esc_url($qr_url),
 *     esc_url($verification_url)
 *   );
 * }
 * add_shortcode('eurocomply_passport', 'eurocomply_passport_shortcode');
 * ```
 */
export const SHORTCODE_EXAMPLE = `
[eurocomply_passport]
`;

/**
 * PHP hooks for WooCommerce integration
 *
 * These hooks would be implemented in the WordPress plugin:
 *
 * 1. Display QR code on product page:
 *    add_action('woocommerce_single_product_summary', 'display_eurocomply_qr', 25);
 *
 * 2. Add sustainability tab to product page:
 *    add_filter('woocommerce_product_tabs', 'add_eurocomply_tab');
 *
 * 3. Add custom fields to product edit page:
 *    add_action('woocommerce_product_options_general_product_data', 'eurocomply_fields');
 *
 * 4. Save custom fields:
 *    add_action('woocommerce_process_product_meta', 'save_eurocomply_fields');
 */
