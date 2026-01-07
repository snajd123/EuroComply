/**
 * EuroComply API Client for Shopify Integration
 *
 * This module provides a client for interacting with the EuroComply API
 * from a Shopify app context.
 */

import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.EUROCOMPLY_API_URL || 'https://api.eurocomply.eu';

export interface Product {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  gtin?: string;
  status: string;
  createdAt: string;
}

export interface Passport {
  id: string;
  productId: string;
  version: string;
  data: Record<string, unknown>;
  qrCodeUrl?: string;
  verificationUrl?: string;
  anchorStatus: string;
  createdAt: string;
}

export interface CreateProductInput {
  name: string;
  description?: string;
  sku?: string;
  gtin?: string;
  attributes?: Record<string, unknown>;
}

export interface CreatePassportInput {
  productId: string;
  data: {
    productId: string;
    productName: string;
    manufacturerName: string;
    carbonFootprint?: {
      value: number;
      unit: string;
    };
    recyclability?: {
      percentage: number;
    };
    [key: string]: unknown;
  };
}

export class EuroComplyClient {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: `${API_BASE_URL}/v1`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
  }

  // ===========================================
  // Products
  // ===========================================

  async createProduct(data: CreateProductInput): Promise<Product> {
    const response = await this.client.post('/products', data);
    return response.data.data;
  }

  async getProduct(id: string): Promise<Product> {
    const response = await this.client.get(`/products/${id}`);
    return response.data.data;
  }

  async listProducts(params?: { page?: number; pageSize?: number }): Promise<{
    data: Product[];
    pagination: { totalItems: number; hasMore: boolean };
  }> {
    const response = await this.client.get('/products', { params });
    return response.data;
  }

  async updateProduct(id: string, data: Partial<CreateProductInput>): Promise<Product> {
    const response = await this.client.patch(`/products/${id}`, data);
    return response.data.data;
  }

  // ===========================================
  // Passports
  // ===========================================

  async createPassport(data: CreatePassportInput): Promise<Passport> {
    const response = await this.client.post('/passports', data);
    return response.data.data;
  }

  async getPassport(id: string): Promise<Passport> {
    const response = await this.client.get(`/passports/${id}`);
    return response.data.data;
  }

  async generateQrCode(passportId: string): Promise<{ qrCodeUrl: string; verificationUrl: string }> {
    const response = await this.client.post(`/passports/${passportId}/qr`);
    return response.data.data;
  }

  async anchorPassport(passportId: string): Promise<{ anchorStatus: string; anchorTxHash?: string }> {
    const response = await this.client.post(`/passports/${passportId}/anchor`);
    return response.data.data;
  }

  // ===========================================
  // Lifecycle Events
  // ===========================================

  async logLifecycleEvent(
    productId: string,
    event: {
      eventType: string;
      quantity?: number;
      reason?: string;
      data?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.client.post(`/products/${productId}/lifecycle`, event);
  }
}

export default EuroComplyClient;
