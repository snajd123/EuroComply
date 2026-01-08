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
  // Free access per ESPR Article 31 - no pricing
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
  timesLinked: number;  // How many retailers have linked this DPP
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
  retailerShop: string
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
        'X-Retailer-Shop': retailerShop,
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
  retailerShop: string
): Promise<CatalogProductDetail> {
  const response = await fetch(
    `${EUROCOMPLY_API_URL}/api/suppliers/catalog/${productId}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Retailer-Shop': retailerShop,
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
// NOTE: DPP access is FREE for retailers
// Per ESPR Article 31, retailers cannot be charged
// Suppliers pay SaaS subscription directly to EuroComply
// ===========================================
