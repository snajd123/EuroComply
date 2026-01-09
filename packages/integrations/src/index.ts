// EuroComply E-commerce Integrations for ProductTrust
// Sync products from Shopify/WooCommerce to create Digital Product Passports

// Shopify exports
export {
  ShopifyConfig,
  ShopifySession,
  ShopifyProduct,
  ShopifyVariant,
  ShopifyImage,
  ShopifyShop,
  ShopifyConnectionStatus,
  ShopifyWebhookPayload,
  ProductWebhookPayload,
  ProductSyncResult as ShopifyProductSyncResult,
  SyncedProduct as ShopifySyncedProduct,
  SyncError as ShopifySyncError,
} from './shopify/types.js';
export { ShopifyClient } from './shopify/client.js';
export { ShopifySyncService } from './shopify/sync.service.js';

// WooCommerce exports
export {
  WooCommerceConfig,
  WooCommerceCredentials,
  WooCommerceProduct,
  WooCategory,
  WooTag,
  WooImage,
  WooAttribute,
  WooMetaData,
  WooCommerceShop,
  WooCommerceConnectionStatus,
  WooWebhookPayload,
  ProductSyncResult as WooCommerceProductSyncResult,
  SyncedProduct as WooCommerceSyncedProduct,
  SyncError as WooCommerceSyncError,
} from './woocommerce/types.js';
export { WooCommerceClient } from './woocommerce/client.js';
export { WooCommerceSyncService } from './woocommerce/sync.service.js';
