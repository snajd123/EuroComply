/**
 * Supplier Catalog Service
 * Client for browsing and linking supplier DPPs
 */

const EUROCOMPLY_API_URL = process.env.EUROCOMPLY_API_URL || 'http://localhost:3000';

export interface CatalogProduct {
  id: string;
  name: string;
  description?: string;
  category: string;
  supplier: {
    id: string;
    name: string;
    country: string;
    verified: boolean;
    logoUrl?: string;
  };
  dppSummary: {
    fiberComposition?: string;
    certifications?: string[];
    carbonFootprint?: number;
    countryOfManufacture?: string;
    manufacturer?: string;
  };
  vcAnchored: boolean;
  timesUsed: number;
  imageUrl?: string;
}

export interface CatalogProductDetail extends CatalogProduct {
  imageUrls: string[];
  dppData: any;
  vcId?: string;
  publishedAt?: string;
}

export interface CatalogSearchParams {
  category?: string;
  certification?: string;
  search?: string;
  supplierCountry?: string;
  page?: number;
  limit?: number;
}

export interface CatalogSearchResult {
  products: CatalogProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Search supplier catalog
 */
export async function searchSupplierCatalog(
  params: CatalogSearchParams,
  merchantShop: string
): Promise<CatalogSearchResult> {
  const queryParams = new URLSearchParams();

  if (params.category) queryParams.set('category', params.category);
  if (params.certification) queryParams.set('certification', params.certification);
  if (params.search) queryParams.set('search', params.search);
  if (params.supplierCountry) queryParams.set('supplierCountry', params.supplierCountry);
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());

  const response = await fetch(
    `${EUROCOMPLY_API_URL}/api/suppliers/catalog?${queryParams}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-Shop': merchantShop,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to search catalog');
  }

  const result = await response.json();
  return result.data;
}

/**
 * Get supplier product details
 */
export async function getSupplierProductById(
  productId: string,
  merchantShop: string
): Promise<CatalogProductDetail> {
  const response = await fetch(
    `${EUROCOMPLY_API_URL}/api/suppliers/catalog/${productId}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-Shop': merchantShop,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Product not found');
  }

  const result = await response.json();
  return result.data;
}

// ===========================================
// PRICING
// ===========================================

export const LINK_PRICE_MONTHLY = 1.00;  // €1/month for linked DPPs
export const FORK_PRICE_MONTHLY = 1.00;  // €1/month for forked DPPs (same as linked)
export const SUPPLIER_SHARE = 0.80;      // 80% to supplier
export const PLATFORM_SHARE = 0.20;      // 20% to EuroComply
