/**
 * Shopify Webhook Handlers
 *
 * Handles incoming webhooks from Shopify for product and order events.
 */

import { ShopifySyncService, ShopifyProduct } from '../lib/shopify-sync.js';
import crypto from 'crypto';

export interface WebhookPayload {
  topic: string;
  domain: string;
  body: unknown;
}

export interface WebhookHandler {
  handle(payload: WebhookPayload): Promise<void>;
}

export class ShopifyWebhookHandler implements WebhookHandler {
  private syncService: ShopifySyncService;
  private webhookSecret: string;

  constructor(
    eurocomplyApiKey: string,
    manufacturerName: string,
    webhookSecret: string
  ) {
    this.syncService = new ShopifySyncService(eurocomplyApiKey, manufacturerName);
    this.webhookSecret = webhookSecret;
  }

  /**
   * Verify Shopify webhook signature
   */
  verifySignature(body: string, signature: string): boolean {
    const hash = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body, 'utf8')
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(signature)
    );
  }

  /**
   * Handle incoming webhook
   */
  async handle(payload: WebhookPayload): Promise<void> {
    switch (payload.topic) {
      case 'products/create':
        await this.handleProductCreate(payload.body as ShopifyProduct);
        break;

      case 'products/update':
        await this.handleProductUpdate(payload.body as ShopifyProduct);
        break;

      case 'products/delete':
        await this.handleProductDelete(payload.body as { id: number });
        break;

      case 'orders/create':
        await this.handleOrderCreate(payload.body as ShopifyOrder);
        break;

      case 'orders/cancelled':
        await this.handleOrderCancelled(payload.body as ShopifyOrder);
        break;

      case 'refunds/create':
        await this.handleRefundCreate(payload.body as ShopifyRefund);
        break;

      default:
        console.log(`Unhandled webhook topic: ${payload.topic}`);
    }
  }

  /**
   * Handle product creation
   */
  private async handleProductCreate(product: ShopifyProduct): Promise<void> {
    console.log(`Processing product create: ${product.id}`);
    const result = await this.syncService.syncProduct(product);

    if (result.status === 'error') {
      console.error(`Failed to sync product ${product.id}: ${result.error}`);
    } else {
      console.log(
        `Product ${product.id} synced. Passport: ${result.passportId}`
      );
    }
  }

  /**
   * Handle product update
   */
  private async handleProductUpdate(product: ShopifyProduct): Promise<void> {
    console.log(`Processing product update: ${product.id}`);
    // For updates, we re-sync the product
    const result = await this.syncService.syncProduct(product);

    if (result.status === 'error') {
      console.error(`Failed to sync product ${product.id}: ${result.error}`);
    }
  }

  /**
   * Handle product deletion
   */
  private async handleProductDelete(data: { id: number }): Promise<void> {
    console.log(`Processing product delete: ${data.id}`);
    // Mark product as archived in EuroComply
    // This would need lookup of eurocomply product ID from shopify ID
  }

  /**
   * Handle order creation (log sales)
   */
  private async handleOrderCreate(order: ShopifyOrder): Promise<void> {
    console.log(`Processing order create: ${order.id}`);

    for (const item of order.line_items) {
      try {
        // Look up EuroComply product by Shopify product ID
        // For now, we'll use the SKU as identifier
        await this.syncService.logSale(
          item.product_id.toString(), // This would need proper mapping
          item.quantity,
          order.id.toString()
        );
      } catch (error) {
        console.error(`Failed to log sale for item ${item.id}:`, error);
      }
    }
  }

  /**
   * Handle order cancellation
   */
  private async handleOrderCancelled(order: ShopifyOrder): Promise<void> {
    console.log(`Processing order cancellation: ${order.id}`);
    // Log return/cancellation events
  }

  /**
   * Handle refund creation
   */
  private async handleRefundCreate(refund: ShopifyRefund): Promise<void> {
    console.log(`Processing refund: ${refund.id}`);

    for (const item of refund.refund_line_items) {
      try {
        await this.syncService.logReturn(
          item.line_item.product_id.toString(),
          item.quantity,
          'Customer refund'
        );
      } catch (error) {
        console.error(`Failed to log return for item ${item.id}:`, error);
      }
    }
  }
}

// Shopify Types
interface ShopifyOrder {
  id: number;
  order_number: number;
  line_items: ShopifyLineItem[];
  created_at: string;
}

interface ShopifyLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  quantity: number;
  sku?: string;
  title: string;
  price: string;
}

interface ShopifyRefund {
  id: number;
  order_id: number;
  refund_line_items: ShopifyRefundLineItem[];
}

interface ShopifyRefundLineItem {
  id: number;
  line_item_id: number;
  line_item: ShopifyLineItem;
  quantity: number;
}

export default ShopifyWebhookHandler;
