/**
 * EuroComply API Client for Shopify Plugin
 *
 * Handles communication with the EuroComply backend to:
 * - Create products from Shopify data
 * - Issue Digital Product Passports with Verifiable Credentials
 * - Retrieve DPP status and verification results
 */

import type {
  TextileDppData,
  ElectronicsDppData,
  FurnitureDppData,
  BatteryDppData,
  DppData as FullDppData,
  ProductCategory,
} from '../types/dpp-schemas';

interface EuroComplyConfig {
  apiUrl: string;
  apiKey: string;
  orgId: string;
}

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  vendor?: string;
  productType?: string;
  description?: string;
  variants: Array<{
    sku?: string;
    barcode?: string;
    weight?: number;
    weightUnit?: string;
  }>;
  tags?: string[];
}

interface EuroComplyProduct {
  id: string;
  name: string;
  sku?: string;
  gtin?: string;
  description?: string;
  attributes?: Record<string, unknown>;
}

interface DppData {
  manufacturerName: string;
  manufacturerCountry?: string;
  productName: string;
  carbonFootprint?: {
    value: number;
    unit: string;
    methodology?: string;
  };
  recyclability?: {
    percentage: number;
    materials?: string[];
    instructions?: string;
  };
  durability?: {
    expectedLifespan: number;
    unit: string;
  };
  repairability?: {
    score: number;
    repairInstructions?: string;
    spareParts?: Array<{ name: string; available: boolean }>;
  };
  certifications?: Array<{
    name: string;
    issuedBy: string;
    validUntil?: string;
  }>;
  customAttributes?: Record<string, unknown>;
}

/**
 * Full DPP creation request with category-specific data
 */
interface FullDppRequest {
  productName: string;
  category: ProductCategory;
  data: FullDppData;
  shopifyProductId?: string;
}

interface DppResponse {
  id: string;
  productId: string;
  version: string;
  data: DppData;
  credentialId?: string;
  vcJwt?: string;
  anchorStatus: 'NONE' | 'PENDING' | 'ANCHORED' | 'FAILED';
  qrCodeUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface VerificationResult {
  valid: boolean;
  checks: {
    signature: boolean;
    expiration: boolean;
    revocation: boolean;
  };
  passport: DppResponse;
  credential?: Record<string, unknown>;
  issuer?: {
    name: string;
    did: string;
  };
}

export class EuroComplyClient {
  private config: EuroComplyConfig;

  constructor(config: EuroComplyConfig) {
    this.config = config;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.apiUrl}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'X-Organization-Id': this.config.orgId,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`EuroComply API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * Create a product in EuroComply from Shopify product data
   */
  async createProduct(shopifyProduct: ShopifyProduct): Promise<EuroComplyProduct> {
    const firstVariant = shopifyProduct.variants[0];

    return this.request<EuroComplyProduct>('POST', '/v1/products', {
      name: shopifyProduct.title,
      sku: firstVariant?.sku || shopifyProduct.handle,
      gtin: firstVariant?.barcode || undefined,
      description: shopifyProduct.description,
      attributes: {
        shopifyId: shopifyProduct.id,
        shopifyHandle: shopifyProduct.handle,
        vendor: shopifyProduct.vendor,
        productType: shopifyProduct.productType,
        tags: shopifyProduct.tags,
        weight: firstVariant?.weight,
        weightUnit: firstVariant?.weightUnit,
      },
    });
  }

  /**
   * Get or create a product by Shopify ID
   */
  async getOrCreateProduct(shopifyProduct: ShopifyProduct): Promise<EuroComplyProduct> {
    // Try to find existing product by Shopify ID
    try {
      const products = await this.request<{ data: EuroComplyProduct[] }>(
        'GET',
        `/v1/products?shopifyId=${shopifyProduct.id}`
      );

      if (products.data && products.data.length > 0) {
        return products.data[0];
      }
    } catch (e) {
      // Product not found, create it
    }

    return this.createProduct(shopifyProduct);
  }

  /**
   * Create a Digital Product Passport with Verifiable Credential
   */
  async createDpp(
    productId: string,
    dppData: DppData
  ): Promise<DppResponse> {
    return this.request<DppResponse>('POST', '/v1/passports', {
      productId,
      data: dppData,
    });
  }

  /**
   * Create DPP and immediately anchor it (issue VC)
   */
  async createAndAnchorDpp(
    productId: string,
    dppData: DppData
  ): Promise<DppResponse> {
    // Create the passport
    const passport = await this.createDpp(productId, dppData);

    // Anchor it (triggers VC issuance via walt.id)
    return this.anchorDpp(passport.id);
  }

  /**
   * Anchor a DPP - triggers Verifiable Credential issuance via walt.id
   */
  async anchorDpp(passportId: string): Promise<DppResponse> {
    return this.request<DppResponse>('POST', `/v1/passports/${passportId}/anchor`, {});
  }

  /**
   * Get a DPP by ID
   */
  async getDpp(passportId: string): Promise<DppResponse> {
    return this.request<DppResponse>('GET', `/v1/passports/${passportId}`);
  }

  /**
   * List DPPs for a product
   */
  async listDpps(productId?: string): Promise<{ data: DppResponse[] }> {
    const query = productId ? `?productId=${productId}` : '';
    return this.request<{ data: DppResponse[] }>('GET', `/v1/passports${query}`);
  }

  /**
   * Generate QR code for a DPP
   */
  async generateQrCode(passportId: string): Promise<{ url: string; dataUrl: string }> {
    return this.request<{ url: string; dataUrl: string }>(
      'POST',
      `/v1/passports/${passportId}/qr`,
      {}
    );
  }

  /**
   * Verify a DPP (public endpoint, no auth needed)
   * This verifies the Verifiable Credential signature
   */
  async verifyDpp(passportId: string): Promise<VerificationResult> {
    // This is a public endpoint, use fetch directly without auth
    const url = `${this.config.apiUrl}/v1/passports/${passportId}/verify`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Verification failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Full sync: Create product + DPP + Anchor (issue VC) in one call
   */
  async syncShopifyProduct(
    shopifyProduct: ShopifyProduct,
    sustainabilityData?: Partial<DppData>
  ): Promise<{ product: EuroComplyProduct; dpp: DppResponse }> {
    // Step 1: Get or create product
    const product = await this.getOrCreateProduct(shopifyProduct);

    // Step 2: Build DPP data from Shopify product + sustainability data
    const dppData: DppData = {
      manufacturerName: shopifyProduct.vendor || 'Unknown Manufacturer',
      productName: shopifyProduct.title,
      ...sustainabilityData,
    };

    // Step 3: Create and anchor DPP (issues Verifiable Credential)
    const dpp = await this.createAndAnchorDpp(product.id, dppData);

    return { product, dpp };
  }

  /**
   * Create a full DPP with category-specific data and issue Verifiable Credential
   * This is the main method for creating complete, ESPR-compliant DPPs
   */
  async createFullDpp(request: FullDppRequest): Promise<{ product: EuroComplyProduct; dpp: DppResponse }> {
    // Step 1: Create or get product
    const product = await this.request<EuroComplyProduct>('POST', '/v1/products', {
      name: request.productName,
      attributes: {
        category: request.category,
        shopifyProductId: request.shopifyProductId,
      },
    });

    // Step 2: Transform category-specific data to API format
    const dppPayload = this.transformDppDataForApi(request);

    // Step 3: Create the passport with full data
    const passport = await this.request<DppResponse>('POST', '/v1/passports', {
      productId: product.id,
      category: request.category,
      data: dppPayload,
    });

    // Step 4: Anchor (issue Verifiable Credential)
    const dpp = await this.anchorDpp(passport.id);

    return { product, dpp };
  }

  /**
   * Transform category-specific DPP data to API format
   */
  private transformDppDataForApi(request: FullDppRequest): Record<string, unknown> {
    const { data, productName, category } = request;

    // Base fields present in all DPPs
    const basePayload: Record<string, unknown> = {
      productName,
      category,
    };

    if (category === 'textile') {
      const textileData = data as TextileDppData;
      return {
        ...basePayload,
        manufacturerName: textileData.manufacturer.name,
        manufacturerCountry: textileData.manufacturer.country,
        manufacturerAddress: textileData.manufacturer.address,
        manufacturerRegistration: textileData.manufacturer.registrationNumber,
        manufacturerWebsite: textileData.manufacturer.website,
        countryOfManufacture: textileData.countryOfManufacture,
        fiberComposition: textileData.fiberComposition.map(fiber => ({
          fiberType: fiber.fiberType,
          percentage: fiber.percentage,
          origin: fiber.origin,
          countryOfOrigin: fiber.countryOfOrigin,
          supplierName: fiber.supplierName,
          certificationId: fiber.certificationId,
        })),
        careInstructions: {
          maxWashTemperature: textileData.careInstructions.maxWashTemperature,
          bleachAllowed: textileData.careInstructions.bleachAllowed,
          tumbleDryAllowed: textileData.careInstructions.tumbleDryAllowed,
          ironTemperature: textileData.careInstructions.ironTemperature,
          dryCleanAllowed: textileData.careInstructions.dryCleanAllowed,
          specialInstructions: textileData.careInstructions.specialInstructions,
        },
        hazardousSubstances: {
          reachCompliant: textileData.hazardousSubstances.reachCompliant,
          substancesOfConcern: textileData.hazardousSubstances.substancesOfConcern,
          scipNotificationId: textileData.hazardousSubstances.scipNotificationId,
        },
        carbonFootprint: textileData.carbonFootprint ? {
          value: textileData.carbonFootprint.value,
          unit: textileData.carbonFootprint.unit,
          methodology: textileData.carbonFootprint.methodology,
          scope: textileData.carbonFootprint.scope,
          dataSource: textileData.carbonFootprint.dataSource,
          confidence: textileData.carbonFootprint.confidence,
        } : undefined,
        certifications: textileData.certifications?.map(cert => ({
          type: cert.type,
          certificateNumber: cert.certificateNumber,
          issuingBody: cert.issuingBody,
          validFrom: cert.validFrom,
          validUntil: cert.validUntil,
          scope: cert.scope,
          documentUrl: cert.documentUrl,
        })),
        recyclability: textileData.recyclability ? {
          percentage: textileData.recyclability.recyclablePercentage,
          components: textileData.recyclability.recyclableComponents,
          endOfLifeInstructions: textileData.recyclability.endOfLifeInstructions,
          takeBackProgram: textileData.recyclability.takeBackProgram,
        } : undefined,
        durability: textileData.durability ? {
          expectedLifespan: textileData.durability.expectedLifespanYears,
          unit: 'years',
          warrantyYears: textileData.durability.warrantyYears,
        } : undefined,
        waterFootprint: textileData.waterFootprint,
        supplyChain: textileData.supplyChain,
        socialCompliance: textileData.socialCompliance,
      };
    }

    // For other categories, pass through the data
    // (Electronics, Furniture, Battery schemas to be implemented)
    return {
      ...basePayload,
      ...data,
    };
  }

  /**
   * Update an existing DPP with new data
   */
  async updateDpp(passportId: string, data: Partial<Record<string, unknown>>): Promise<DppResponse> {
    return this.request<DppResponse>('PATCH', `/v1/passports/${passportId}`, {
      data,
    });
  }

  /**
   * Revoke a DPP's Verifiable Credential
   * Used when a product is deleted or DPP data is found to be inaccurate
   */
  async revokeDpp(passportId: string, reason: string): Promise<DppResponse> {
    return this.request<DppResponse>('POST', `/v1/passports/${passportId}/revoke`, {
      reason,
    });
  }
}

/**
 * Create a EuroComply client from shop settings
 */
export function createEuroComplyClient(settings: {
  eurocomplyApiKey: string;
  eurocomplyOrgId: string;
}): EuroComplyClient | null {
  if (!settings.eurocomplyApiKey || !settings.eurocomplyOrgId) {
    return null;
  }

  return new EuroComplyClient({
    apiUrl: process.env.EUROCOMPLY_API_URL || 'http://localhost:3000',
    apiKey: settings.eurocomplyApiKey,
    orgId: settings.eurocomplyOrgId,
  });
}
