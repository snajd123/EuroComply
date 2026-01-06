// WooCommerce Integration Types for ProductTrust

export interface WooCommerceConfig {
  webhookSecret: string;
}

export interface WooCommerceCredentials {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  type: 'simple' | 'variable' | 'grouped' | 'external';
  status: 'draft' | 'pending' | 'private' | 'publish';
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  categories: WooCategory[];
  tags: WooTag[];
  images: WooImage[];
  attributes: WooAttribute[];
  variations: number[];
  meta_data: WooMetaData[];
  date_created: string;
  date_modified: string;
}

export interface WooCategory {
  id: number;
  name: string;
  slug: string;
}

export interface WooTag {
  id: number;
  name: string;
  slug: string;
}

export interface WooImage {
  id: number;
  src: string;
  name: string;
  alt: string;
}

export interface WooAttribute {
  id: number;
  name: string;
  position: number;
  visible: boolean;
  variation: boolean;
  options: string[];
}

export interface WooMetaData {
  id: number;
  key: string;
  value: string;
}

export interface WooCommerceShop {
  name: string;
  description: string;
  url: string;
  wc_version: string;
  currency: string;
  country: string;
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
  wooId: number;
  eurocomplyId: string;
  name: string;
  sku: string | null;
  status: 'created' | 'updated' | 'unchanged';
}

export interface SyncError {
  wooId: number;
  productName: string;
  error: string;
}

// Connection status
export interface WooCommerceConnectionStatus {
  connected: boolean;
  siteUrl: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  productCount: number;
  passportCount: number;
}

// Webhook payloads
export interface WooWebhookPayload {
  id: number;
  [key: string]: unknown;
}
