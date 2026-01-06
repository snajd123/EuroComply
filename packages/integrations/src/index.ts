// EuroComply E-commerce Integrations
// Shopify & WooCommerce support for DSA Compliance

export * as shopify from './shopify/index.js';
export * as woocommerce from './woocommerce/index.js';

// Re-export commonly used items
export {
  ShopifyClient,
  ShopifyOAuth,
  ShopifySyncService,
  type ShopifyConfig,
  type ShopifyMerchantData,
} from './shopify/index.js';

export {
  WooCommerceClient,
  WooCommerceSyncService,
  type WooCommerceConfig,
  type WooCommerceMerchantData,
} from './woocommerce/index.js';
