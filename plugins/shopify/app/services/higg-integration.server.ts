/**
 * Higg Index Integration Service
 *
 * Integration with the Higg Materials Sustainability Index (MSI) via Worldly API.
 * Provides life-cycle assessment data for textile materials.
 *
 * Note: Requires Higg/Worldly API credentials. Falls back to embedded
 * industry benchmarks when API is unavailable.
 *
 * Data Sources:
 * - Higg MSI (Materials Sustainability Index) - Primary
 * - Textile Exchange LCA data - Fallback
 * - WRAP UK studies - Fallback
 */

import type { FiberType, FiberOrigin, CarbonFootprint, DataSource, DataConfidence } from '../types/dpp-schemas';

// ============================================================================
// TYPES
// ============================================================================

export interface HiggMaterialImpact {
  materialId: string;
  materialName: string;
  globalWarmingPotential: number;  // kgCO2e per kg of material
  eutrophication: number;          // kg PO4e per kg
  waterScarcity: number;           // m³ per kg
  chemistry: 'conventional' | 'organic' | 'recycled';
  source: string;
  year: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface CarbonCalculationRequest {
  fibers: {
    type: FiberType;
    origin: FiberOrigin;
    percentage: number;
  }[];
  productWeight: number;  // grams
  manufacturingCountry?: string;
  transportDistance?: number;  // km from factory to EU port
}

export interface CarbonCalculationResult {
  totalCarbonFootprint: CarbonFootprint;
  breakdown: {
    materials: number;
    manufacturing: number;
    transport: number;
  };
  materialDetails: {
    fiberType: FiberType;
    percentage: number;
    carbonContribution: number;
    impactSource: string;
  }[];
}

// ============================================================================
// HIGG API CLIENT (Placeholder - would need real API credentials)
// ============================================================================

interface HiggApiConfig {
  apiKey: string;
  baseUrl: string;
}

class HiggApiClient {
  private config: HiggApiConfig;

  constructor(config: HiggApiConfig) {
    this.config = config;
  }

  async getMaterialImpact(materialId: string): Promise<HiggMaterialImpact | null> {
    // In production, this would call the actual Higg/Worldly API
    // For now, return null to trigger fallback to embedded data
    try {
      const response = await fetch(`${this.config.baseUrl}/materials/${materialId}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`Higg API returned ${response.status}, using fallback data`);
        return null;
      }

      return response.json();
    } catch (error) {
      console.warn('Higg API unavailable, using fallback data:', error);
      return null;
    }
  }
}

// ============================================================================
// EMBEDDED MATERIAL IMPACT DATA (Fallback when API unavailable)
// ============================================================================

/**
 * Material impact factors from published LCA studies.
 * Values are in kgCO2e per kg of material (cradle-to-gate).
 *
 * Sources:
 * - Higg MSI 2023 (publicly available summaries)
 * - Textile Exchange Preferred Fiber & Materials Report 2023
 * - WRAP UK Carbon Footprint of Clothing 2023
 * - Various brand EPDs and sustainability reports
 */
const MATERIAL_IMPACT_FACTORS: Record<string, { gwp: number; water: number; source: string }> = {
  // Natural Fibers - Conventional
  'cotton:conventional': {
    gwp: 5.9,
    water: 2700,
    source: 'WRAP UK 2023',
  },
  'linen:conventional': {
    gwp: 1.5,
    water: 400,
    source: 'Textile Exchange 2023',
  },
  'hemp:conventional': {
    gwp: 1.2,
    water: 300,
    source: 'Textile Exchange 2023',
  },
  'wool:conventional': {
    gwp: 17.0,
    water: 170,
    source: 'IWTO 2022',
  },
  'silk:conventional': {
    gwp: 15.0,
    water: 1000,
    source: 'Higg MSI 2023',
  },
  'cashmere:conventional': {
    gwp: 28.0,
    water: 200,
    source: 'Sustainable Fibre Alliance 2022',
  },
  'bamboo:conventional': {
    gwp: 2.5,
    water: 500,
    source: 'Textile Exchange 2023',
  },
  'jute:conventional': {
    gwp: 1.0,
    water: 200,
    source: 'Textile Exchange 2023',
  },

  // Natural Fibers - Organic
  'cotton:organic': {
    gwp: 3.8,
    water: 1800,
    source: 'Textile Exchange 2023',
  },
  'organic_cotton:organic': {
    gwp: 3.8,
    water: 1800,
    source: 'Textile Exchange 2023',
  },
  'linen:organic': {
    gwp: 1.2,
    water: 350,
    source: 'Textile Exchange 2023',
  },
  'wool:organic': {
    gwp: 14.0,
    water: 150,
    source: 'Textile Exchange 2023',
  },

  // Synthetic Fibers - Virgin
  'polyester:conventional': {
    gwp: 9.5,
    water: 60,
    source: 'Higg MSI 2023',
  },
  'nylon:conventional': {
    gwp: 12.0,
    water: 100,
    source: 'Higg MSI 2023',
  },
  'acrylic:conventional': {
    gwp: 8.0,
    water: 80,
    source: 'Higg MSI 2023',
  },
  'elastane:conventional': {
    gwp: 14.0,
    water: 100,
    source: 'Higg MSI 2023',
  },
  'spandex:conventional': {
    gwp: 14.0,
    water: 100,
    source: 'Higg MSI 2023',
  },

  // Regenerated Cellulosics
  'viscose:conventional': {
    gwp: 5.5,
    water: 800,
    source: 'Higg MSI 2023',
  },
  'modal:conventional': {
    gwp: 4.0,
    water: 600,
    source: 'Lenzing 2023 EPD',
  },
  'lyocell:conventional': {
    gwp: 2.8,
    water: 400,
    source: 'Lenzing 2023 EPD',
  },
  'tencel:conventional': {
    gwp: 2.8,
    water: 400,
    source: 'Lenzing 2023 EPD',
  },

  // Recycled Materials
  'polyester:recycled_post_consumer': {
    gwp: 2.1,
    water: 20,
    source: 'Higg MSI 2023 (rPET from bottles)',
  },
  'recycled_polyester:recycled_post_consumer': {
    gwp: 2.1,
    water: 20,
    source: 'Higg MSI 2023',
  },
  'polyester:recycled_pre_consumer': {
    gwp: 3.5,
    water: 30,
    source: 'Higg MSI 2023',
  },
  'nylon:recycled_post_consumer': {
    gwp: 4.0,
    water: 40,
    source: 'Aquafil Econyl EPD 2023',
  },
  'recycled_nylon:recycled_post_consumer': {
    gwp: 4.0,
    water: 40,
    source: 'Aquafil Econyl EPD 2023',
  },
  'cotton:recycled_post_consumer': {
    gwp: 2.5,
    water: 500,
    source: 'Textile Exchange 2023',
  },
  'wool:recycled_post_consumer': {
    gwp: 5.0,
    water: 50,
    source: 'Textile Exchange 2023',
  },

  // Bio-based
  'polyester:bio_based': {
    gwp: 6.0,
    water: 50,
    source: 'Estimated (bio-PET)',
  },
};

/**
 * Manufacturing emission factors by country/region.
 * Values are in kgCO2e per kg of finished textile.
 */
const MANUFACTURING_FACTORS: Record<string, number> = {
  // High renewable energy regions
  'SE': 0.3,  // Sweden
  'NO': 0.3,  // Norway
  'PT': 0.5,  // Portugal
  'IT': 0.6,  // Italy
  'DE': 0.7,  // Germany
  'EU': 0.7,  // EU average
  'FR': 0.4,  // France (nuclear)
  'ES': 0.6,  // Spain

  // Medium
  'TR': 1.2,  // Turkey
  'US': 1.0,  // USA
  'JP': 0.9,  // Japan

  // Coal-heavy grids
  'CN': 1.8,  // China
  'IN': 2.0,  // India
  'BD': 1.9,  // Bangladesh
  'VN': 1.7,  // Vietnam
  'ID': 1.6,  // Indonesia
  'PK': 1.9,  // Pakistan
  'MM': 1.8,  // Myanmar

  // Default
  'DEFAULT': 1.5,
};

/**
 * Transport emission factors.
 */
const TRANSPORT_FACTORS = {
  seaFreight: 0.0001,     // kgCO2e per kg per km
  roadFreight: 0.0001,    // kgCO2e per kg per km (EU average)
  airFreight: 0.001,      // kgCO2e per kg per km
};

// Default distances (factory to EU port + EU distribution)
const DEFAULT_TRANSPORT_DISTANCES: Record<string, number> = {
  'CN': 20000,  // China to EU
  'BD': 15000,  // Bangladesh
  'VN': 18000,  // Vietnam
  'IN': 12000,  // India
  'TR': 3000,   // Turkey
  'PT': 500,    // Portugal (EU)
  'IT': 500,    // Italy (EU)
  'DE': 200,    // Germany (EU)
  'DEFAULT': 10000,
};

// ============================================================================
// CARBON CALCULATION SERVICE
// ============================================================================

/**
 * Calculate carbon footprint for a textile product.
 *
 * Methodology:
 * 1. Material Production: Sum of (fiber weight × material impact factor)
 * 2. Manufacturing: Product weight × country manufacturing factor
 * 3. Transport: Product weight × distance × sea freight factor
 *
 * Scope: Cradle-to-gate (excludes use phase and end-of-life)
 */
export async function calculateCarbonFootprint(
  request: CarbonCalculationRequest
): Promise<CarbonCalculationResult> {
  const { fibers, productWeight, manufacturingCountry, transportDistance } = request;
  const productWeightKg = productWeight / 1000;

  let materialsCO2 = 0;
  const materialDetails: CarbonCalculationResult['materialDetails'] = [];

  // 1. Calculate material production emissions
  for (const fiber of fibers) {
    const impactKey = `${fiber.type}:${fiber.origin}`;
    const altKey = `${fiber.type}:conventional`;

    const impact = MATERIAL_IMPACT_FACTORS[impactKey] || MATERIAL_IMPACT_FACTORS[altKey];

    if (!impact) {
      console.warn(`No impact data for ${impactKey}, using polyester as fallback`);
    }

    const gwp = impact?.gwp ?? 9.5; // Default to polyester if unknown
    const fiberWeightKg = productWeightKg * (fiber.percentage / 100);
    const fiberCO2 = fiberWeightKg * gwp;

    materialsCO2 += fiberCO2;

    materialDetails.push({
      fiberType: fiber.type,
      percentage: fiber.percentage,
      carbonContribution: Math.round(fiberCO2 * 100) / 100,
      impactSource: impact?.source || 'Default estimate',
    });
  }

  // 2. Calculate manufacturing emissions
  const mfgCountry = manufacturingCountry?.toUpperCase() || 'DEFAULT';
  const mfgFactor = MANUFACTURING_FACTORS[mfgCountry] || MANUFACTURING_FACTORS['DEFAULT'];
  const manufacturingCO2 = productWeightKg * mfgFactor;

  // 3. Calculate transport emissions
  const distance = transportDistance || DEFAULT_TRANSPORT_DISTANCES[mfgCountry] || DEFAULT_TRANSPORT_DISTANCES['DEFAULT'];
  const transportCO2 = productWeightKg * distance * TRANSPORT_FACTORS.seaFreight;

  // Total
  const totalCO2 = materialsCO2 + manufacturingCO2 + transportCO2;

  return {
    totalCarbonFootprint: {
      value: Math.round(totalCO2 * 100) / 100,
      unit: 'kgCO2e',
      methodology: 'other',
      methodologyDetail: 'EuroComply LCA Calculation v1 (Higg MSI + WRAP UK data)',
      scope: 'cradle_to_gate',
      dataSource: 'higg_calculated',
      confidence: 'estimated',
      calculatedAt: new Date().toISOString(),
      thirdPartyVerified: false,
    },
    breakdown: {
      materials: Math.round(materialsCO2 * 100) / 100,
      manufacturing: Math.round(manufacturingCO2 * 100) / 100,
      transport: Math.round(transportCO2 * 100) / 100,
    },
    materialDetails,
  };
}

/**
 * Get impact data for a specific material.
 */
export function getMaterialImpact(fiberType: FiberType, origin: FiberOrigin): HiggMaterialImpact | null {
  const impactKey = `${fiberType}:${origin}`;
  const altKey = `${fiberType}:conventional`;

  const impact = MATERIAL_IMPACT_FACTORS[impactKey] || MATERIAL_IMPACT_FACTORS[altKey];

  if (!impact) {
    return null;
  }

  return {
    materialId: impactKey,
    materialName: formatFiberName(fiberType),
    globalWarmingPotential: impact.gwp,
    eutrophication: 0, // Not available in fallback data
    waterScarcity: impact.water,
    chemistry: origin === 'organic' ? 'organic' : origin.includes('recycled') ? 'recycled' : 'conventional',
    source: impact.source,
    year: 2023,
    confidence: 'medium',
  };
}

/**
 * Get manufacturing factor for a country.
 */
export function getManufacturingFactor(countryCode: string): number {
  return MANUFACTURING_FACTORS[countryCode.toUpperCase()] || MANUFACTURING_FACTORS['DEFAULT'];
}

/**
 * Estimate water footprint for a product.
 */
export function calculateWaterFootprint(
  fibers: { type: FiberType; origin: FiberOrigin; percentage: number }[],
  productWeight: number // grams
): number {
  const productWeightKg = productWeight / 1000;
  let totalWater = 0;

  for (const fiber of fibers) {
    const impactKey = `${fiber.type}:${fiber.origin}`;
    const altKey = `${fiber.type}:conventional`;
    const impact = MATERIAL_IMPACT_FACTORS[impactKey] || MATERIAL_IMPACT_FACTORS[altKey];

    if (impact) {
      const fiberWeightKg = productWeightKg * (fiber.percentage / 100);
      totalWater += fiberWeightKg * impact.water;
    }
  }

  return Math.round(totalWater);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatFiberName(fiberType: FiberType): string {
  const names: Record<FiberType, string> = {
    cotton: 'Cotton',
    organic_cotton: 'Organic Cotton',
    linen: 'Linen',
    hemp: 'Hemp',
    wool: 'Wool',
    silk: 'Silk',
    cashmere: 'Cashmere',
    bamboo: 'Bamboo',
    jute: 'Jute',
    polyester: 'Polyester',
    recycled_polyester: 'Recycled Polyester',
    nylon: 'Nylon',
    recycled_nylon: 'Recycled Nylon',
    acrylic: 'Acrylic',
    elastane: 'Elastane',
    spandex: 'Spandex',
    viscose: 'Viscose',
    modal: 'Modal',
    lyocell: 'Lyocell',
    tencel: 'Tencel',
    other: 'Other',
  };
  return names[fiberType] || fiberType;
}

/**
 * Get all available fiber types with their impact data.
 */
export function getAllFiberImpacts(): { fiberType: FiberType; origin: FiberOrigin; gwp: number; water: number; source: string }[] {
  const results: { fiberType: FiberType; origin: FiberOrigin; gwp: number; water: number; source: string }[] = [];

  for (const [key, impact] of Object.entries(MATERIAL_IMPACT_FACTORS)) {
    const [fiberType, origin] = key.split(':') as [FiberType, FiberOrigin];
    results.push({
      fiberType,
      origin,
      gwp: impact.gwp,
      water: impact.water,
      source: impact.source,
    });
  }

  return results;
}

/**
 * Get fiber types sorted by carbon impact (lowest first).
 */
export function getFibersByImpact(origin: FiberOrigin = 'conventional'): FiberType[] {
  const impacts = getAllFiberImpacts()
    .filter(f => f.origin === origin || f.origin === 'conventional')
    .sort((a, b) => a.gwp - b.gwp);

  // Remove duplicates
  const seen = new Set<FiberType>();
  return impacts
    .filter(f => {
      if (seen.has(f.fiberType)) return false;
      seen.add(f.fiberType);
      return true;
    })
    .map(f => f.fiberType);
}
