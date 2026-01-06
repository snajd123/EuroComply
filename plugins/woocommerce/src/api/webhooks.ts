/**
 * WooCommerce Webhook Handlers
 *
 * Handles incoming webhooks from WooCommerce for product and order events.
 */

import crypto from 'crypto';
import {
  WooCommerceSyncService,
  WooCommerceProduct,
  WooCommerceOrder,
} from '../lib/woocommerce-sync.js';

export interface WebhookPayload {
  topic: string;
  resource: string;
  event: string;
  body: unknown;
}

export interface WebhookHandler {
  handle(payload: WebhookPayload): Promise<void>;
}

export class WooCommerceWebhookHandler implements WebhookHandler {
  private syncService: WooCommerceSyncService;
  private webhookSecret: string;

  constructor(
    eurocomplyApiKey: string,
    manufacturerName: string,
    webhookSecret: string,
    wooConfig: {
      url: string;
      consumerKey: string;
      consumerSecret: string;
    }
  ) {
    this.syncService = new WooCommerceSyncService(
      eurocomplyApiKey,
      manufacturerName,
      wooConfig
    );
    this.webhookSecret = webhookSecret;
  }

  /**
   * Verify WooCommerce webhook signature
   */
  verifySignature(body: string, signature: string): boolean {
    const hash = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body, 'utf8')
      .digest('base64');

    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  }

  /**
   * Handle incoming webhook
   */
  async handle(payload: WebhookPayload): Promise<void> {
    const topic = `${payload.resource}.${payload.event}`;

    switch (topic) {
      case 'product.created':
        await this.handleProductCreate(payload.body as WooCommerceProduct);
        break;

      case 'product.updated':
        await this.handleProductUpdate(payload.body as WooCommerceProduct);
        break;

      case 'product.deleted':
        await this.handleProductDelete(payload.body as { id: number });
        break;

      case 'order.created':
        await this.handleOrderCreate(payload.body as WooCommerceOrder);
        break;

      case 'order.updated':
        await this.handleOrderUpdate(payload.body as WooCommerceOrder);
        break;

      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }
  }

  /**
   * Handle product creation
   */
  private async handleProductCreate(product: WooCommerceProduct): Promise<void> {
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
  private async handleProductUpdate(product: WooCommerceProduct): Promise<void> {
    console.log(`Processing product update: ${product.id}`);
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
    // This would need lookup of eurocomply product ID from woo ID
  }

  /**
   * Handle order creation
   */
  private async handleOrderCreate(order: WooCommerceOrder): Promise<void> {
    console.log(`Processing order create: ${order.id}`);

    // Only process completed orders
    if (order.status !== 'completed' && order.status !== 'processing') {
      return;
    }

    for (const item of order.line_items) {
      try {
        // Look up EuroComply product by WooCommerce product ID
        // For now, we'll use the product_id as identifier
        await this.syncService.logSale(
          item.product_id.toString(), // This would need proper mapping
          item.quantity,
          order.id
        );
      } catch (error) {
        console.error(`Failed to log sale for item ${item.id}:`, error);
      }
    }
  }

  /**
   * Handle order update (status changes)
   */
  private async handleOrderUpdate(order: WooCommerceOrder): Promise<void> {
    console.log(`Processing order update: ${order.id} - Status: ${order.status}`);

    // Handle refunds
    if (order.status === 'refunded') {
      for (const item of order.line_items) {
        try {
          await this.syncService.logReturn(
            item.product_id.toString(),
            item.quantity,
            'Order refunded'
          );
        } catch (error) {
          console.error(`Failed to log return for item ${item.id}:`, error);
        }
      }
    }
  }
}

export default WooCommerceWebhookHandler;
