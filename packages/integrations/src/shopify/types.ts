// Shopify Integration Types

export interface ShopifyConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string[];
  hostName: string; // Your app's hostname
  apiVersion: string; // e.g., '2024-01'
}

export interface ShopifyShop {
  id: number;
  name: string;
  email: string;
  domain: string;
  myshopifyDomain: string;
  shopOwner: string;
  phone: string;
  address1: string;
  address2: string | null;
  city: string;
  province: string;
  provinceCode: string;
  country: string;
  countryCode: string;
  zip: string;
  currency: string;
  timezone: string;
  planName: string;
  planDisplayName: string;
  createdAt: string;
  updatedAt: string;
  taxShipping: boolean;
  taxesIncluded: boolean;
  hasStorefront: boolean;
  eligibleForPayments: boolean;
}

export interface ShopifyAccessToken {
  accessToken: string;
  scope: string;
}

export interface ShopifyWebhookPayload {
  id: number;
  admin_graphql_api_id: string;
  [key: string]: unknown;
}

export interface ShopifyOAuthParams {
  shop: string;
  code: string;
  hmac: string;
  timestamp: string;
  state: string;
}

// DSA-specific Shopify data
export interface ShopifyMerchantData {
  shopDomain: string;
  shopName: string;
  ownerName: string;
  email: string;
  phone: string | null;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    province: string;
    country: string;
    countryCode: string;
    zip: string;
  };
  currency: string;
  timezone: string;
  // Business details (if available)
  taxId?: string;
  vatNumber?: string;
}

// Webhook topics we subscribe to
export const SHOPIFY_WEBHOOK_TOPICS = [
  'shop/update',
  'app/uninstalled',
  'customers/data_request',  // GDPR
  'customers/redact',        // GDPR
  'shop/redact',             // GDPR
] as const;

export type ShopifyWebhookTopic = typeof SHOPIFY_WEBHOOK_TOPICS[number];
