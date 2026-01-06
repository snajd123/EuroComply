// Shopify Integration Types for ProductTrust

export interface ShopifyConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string[];
  hostName: string;
  apiVersion: string;
}

export interface ShopifySession {
  shop: string;
  accessToken: string;
  scope: string;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  handle: string;
  status: 'active' | 'archived' | 'draft';
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  sku: string | null;
  barcode: string | null; // GTIN/EAN/UPC
  price: string;
  weight: number | null;
  weight_unit: string;
  inventory_quantity: number;
}

export interface ShopifyImage {
  id: number;
  product_id: number;
  src: string;
  alt: string | null;
  position: number;
}

export interface ShopifyShop {
  id: number;
  name: string;
  email: string;
  domain: string;
  myshopify_domain: string;
  country_code: string;
  currency: string;
}

// Product sync result
export interface ProductSyncResult {
  organizationId: string;
  synced: number;
  created: number;
  updated: number;
  failed: number;
  errors: SyncError[];
  products: SyncedProduct[];
}

export interface SyncedProduct {
  shopifyId: number;
  eurocomplyId: string;
  name: string;
  sku: string | null;
  gtin: string | null;
  status: 'created' | 'updated' | 'unchanged';
}

export interface SyncError {
  shopifyId: number;
  productName: string;
  error: string;
}

// Webhook payloads
export interface ShopifyWebhookPayload {
  id: number;
  [key: string]: unknown;
}

export interface ProductWebhookPayload extends ShopifyWebhookPayload {
  title: string;
  variants: ShopifyVariant[];
  status: string;
}

// Connection status
export interface ShopifyConnectionStatus {
  connected: boolean;
  shop: string | null;
  installedAt: string | null;
  lastSyncAt: string | null;
  productCount: number;
  passportCount: number;
}
