// WooCommerce Integration Types

export interface WooCommerceConfig {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  version: string; // e.g., 'wc/v3'
}

export interface WooCommerceStore {
  name: string;
  description: string;
  url: string;
  email: string;
  timezone: string;
  currency: string;
  address: {
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
}

export interface WooCommerceMerchantData {
  siteUrl: string;
  storeName: string;
  storeEmail: string;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    country: string;
    zip: string;
  };
  currency: string;
  timezone: string;
}

// Webhook topics we listen for
export const WOOCOMMERCE_WEBHOOK_TOPICS = [
  'store.updated',
  'settings.updated',
] as const;

export type WooCommerceWebhookTopic = typeof WOOCOMMERCE_WEBHOOK_TOPICS[number];
