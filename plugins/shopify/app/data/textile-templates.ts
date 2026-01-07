/**
 * Textile DPP Templates
 *
 * Pre-built templates with industry benchmarks for common textile products.
 * Data sourced from:
 * - Higg Materials Sustainability Index (MSI)
 * - WRAP UK textile studies
 * - European Commission PEF studies
 * - Published brand sustainability reports
 */

import type { TextileDppData, FiberComposition, CarbonFootprint, CareInstructions } from '../types/dpp-schemas';

// ============================================================================
// TEMPLATE INTERFACE
// ============================================================================

export interface TextileTemplate {
  id: string;
  name: string;
  description: string;
  productType: string;
  thumbnailIcon: string;  // Emoji for quick identification

  /** Default values (merchant can override) */
  defaults: Partial<TextileDppData>;

  /** Fields the merchant MUST provide (no sensible default) */
  requiredOverrides: (keyof TextileDppData)[];

  /** Industry benchmark data for reference */
  benchmarks: {
    carbonFootprint?: {
      value: number;
      unit: 'kgCO2e';
      source: string;
      note?: string;
    };
    waterFootprint?: {
      value: number;
      unit: 'liters';
      source: string;
    };
    typicalWeight?: {
      value: number;
      unit: 'g';
    };
  };

  /** Common certifications for this product type */
  suggestedCertifications: string[];
}

// ============================================================================
// COMMON DEFAULTS
// ============================================================================

const defaultHazardousSubstances = {
  reachCompliant: true,
  substancesOfConcern: [],
};

const defaultCareInstructionsTShirt: CareInstructions = {
  maxWashTemperature: 40,
  bleachAllowed: false,
  tumbleDryAllowed: true,
  ironTemperature: 'medium',
  dryCleanAllowed: false,
};

const defaultCareInstructionsDelicate: CareInstructions = {
  maxWashTemperature: 30,
  bleachAllowed: false,
  tumbleDryAllowed: false,
  ironTemperature: 'low',
  dryCleanAllowed: true,
};

const defaultCareInstructionsDenim: CareInstructions = {
  maxWashTemperature: 30,
  bleachAllowed: false,
  tumbleDryAllowed: false,
  ironTemperature: 'medium',
  dryCleanAllowed: false,
  specialInstructions: 'Wash inside out to preserve color. Avoid frequent washing to extend life.',
};

// ============================================================================
// T-SHIRT TEMPLATES
// ============================================================================

export const TSHIRT_COTTON: TextileTemplate = {
  id: 'tshirt-cotton',
  name: 'Cotton T-Shirt',
  description: 'Standard cotton t-shirt (conventional cotton)',
  productType: 'T-Shirt',
  thumbnailIcon: '👕',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'cotton', percentage: 100, origin: 'conventional' },
    ],
    careInstructions: defaultCareInstructionsTShirt,
    hazardousSubstances: defaultHazardousSubstances,
    durability: {
      expectedLifespanYears: 2,
      expectedWearCycles: 50,
    },
    recyclability: {
      recyclablePercentage: 95,
      recyclableComponents: ['fabric'],
      endOfLifeInstructions: 'Remove any non-textile components (buttons, zippers). Donate if wearable, or recycle through textile collection points.',
    },
  },

  requiredOverrides: ['countryOfManufacture', 'manufacturer'],

  benchmarks: {
    carbonFootprint: {
      value: 5.5,
      unit: 'kgCO2e',
      source: 'WRAP UK 2023',
      note: 'Cradle-to-gate, including cultivation, processing, manufacturing',
    },
    waterFootprint: {
      value: 2700,
      unit: 'liters',
      source: 'Water Footprint Network',
    },
    typicalWeight: {
      value: 180,
      unit: 'g',
    },
  },

  suggestedCertifications: ['OEKO-TEX Standard 100', 'Better Cotton Initiative (BCI)'],
};

export const TSHIRT_ORGANIC_COTTON: TextileTemplate = {
  id: 'tshirt-organic-cotton',
  name: 'Organic Cotton T-Shirt',
  description: 'T-shirt made from certified organic cotton',
  productType: 'T-Shirt',
  thumbnailIcon: '🌱',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'organic_cotton', percentage: 100, origin: 'organic' },
    ],
    careInstructions: defaultCareInstructionsTShirt,
    hazardousSubstances: defaultHazardousSubstances,
    durability: {
      expectedLifespanYears: 3,
      expectedWearCycles: 75,
    },
    recyclability: {
      recyclablePercentage: 98,
      recyclableComponents: ['fabric'],
      endOfLifeInstructions: 'Fully recyclable. Remove buttons before recycling. Can be composted if 100% organic and untreated.',
    },
  },

  requiredOverrides: ['countryOfManufacture', 'manufacturer'],

  benchmarks: {
    carbonFootprint: {
      value: 3.8,
      unit: 'kgCO2e',
      source: 'Textile Exchange 2023',
      note: 'Lower due to no synthetic fertilizers/pesticides',
    },
    waterFootprint: {
      value: 1800,
      unit: 'liters',
      source: 'Textile Exchange LCA',
    },
    typicalWeight: {
      value: 180,
      unit: 'g',
    },
  },

  suggestedCertifications: ['GOTS (Global Organic Textile Standard)', 'OEKO-TEX Standard 100', 'OCS (Organic Content Standard)'],
};

export const TSHIRT_RECYCLED_POLYESTER: TextileTemplate = {
  id: 'tshirt-recycled-polyester',
  name: 'Recycled Polyester T-Shirt',
  description: 'Performance t-shirt made from recycled PET bottles',
  productType: 'T-Shirt',
  thumbnailIcon: '♻️',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'recycled_polyester', percentage: 100, origin: 'recycled_post_consumer' },
    ],
    careInstructions: {
      maxWashTemperature: 30,
      bleachAllowed: false,
      tumbleDryAllowed: false,
      ironTemperature: 'low',
      dryCleanAllowed: false,
      specialInstructions: 'Use a microfiber-catching wash bag to reduce microplastic release.',
    },
    hazardousSubstances: defaultHazardousSubstances,
    durability: {
      expectedLifespanYears: 3,
      expectedWearCycles: 100,
    },
    recyclability: {
      recyclablePercentage: 100,
      recyclableComponents: ['fabric'],
      endOfLifeInstructions: 'Recyclable through textile-to-textile recycling programs. Do not mix with organic textiles.',
    },
  },

  requiredOverrides: ['countryOfManufacture', 'manufacturer'],

  benchmarks: {
    carbonFootprint: {
      value: 2.1,
      unit: 'kgCO2e',
      source: 'Higg MSI 2023',
      note: '75% lower than virgin polyester',
    },
    waterFootprint: {
      value: 50,
      unit: 'liters',
      source: 'Higg MSI',
    },
    typicalWeight: {
      value: 150,
      unit: 'g',
    },
  },

  suggestedCertifications: ['GRS (Global Recycled Standard)', 'OEKO-TEX Standard 100', 'RCS (Recycled Claim Standard)'],
};

// ============================================================================
// DENIM / JEANS TEMPLATES
// ============================================================================

export const JEANS_DENIM: TextileTemplate = {
  id: 'jeans-denim',
  name: 'Denim Jeans',
  description: 'Classic cotton denim jeans',
  productType: 'Jeans',
  thumbnailIcon: '👖',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'cotton', percentage: 98, origin: 'conventional' },
      { fiberType: 'elastane', percentage: 2, origin: 'conventional' },
    ],
    careInstructions: defaultCareInstructionsDenim,
    hazardousSubstances: defaultHazardousSubstances,
    durability: {
      expectedLifespanYears: 5,
      expectedWearCycles: 200,
    },
    recyclability: {
      recyclablePercentage: 85,
      recyclableComponents: ['denim fabric'],
      nonRecyclableComponents: ['metal rivets', 'zipper', 'leather patch'],
      endOfLifeInstructions: 'Remove metal components before recycling. Denim can be recycled into insulation or new fabric.',
    },
  },

  requiredOverrides: ['countryOfManufacture', 'manufacturer'],

  benchmarks: {
    carbonFootprint: {
      value: 12.5,
      unit: 'kgCO2e',
      source: 'Levi Strauss LCA 2019',
      note: 'Includes dyeing, distressing, and finishing processes',
    },
    waterFootprint: {
      value: 3781,
      unit: 'liters',
      source: 'Levi Strauss Water<Less study',
    },
    typicalWeight: {
      value: 650,
      unit: 'g',
    },
  },

  suggestedCertifications: ['OEKO-TEX Standard 100', 'Better Cotton Initiative (BCI)', 'ZDHC Wastewater'],
};

export const JEANS_ORGANIC: TextileTemplate = {
  id: 'jeans-organic',
  name: 'Organic Denim Jeans',
  description: 'Jeans made from certified organic cotton denim',
  productType: 'Jeans',
  thumbnailIcon: '🌿',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'organic_cotton', percentage: 98, origin: 'organic' },
      { fiberType: 'elastane', percentage: 2, origin: 'conventional' },
    ],
    careInstructions: defaultCareInstructionsDenim,
    hazardousSubstances: defaultHazardousSubstances,
    durability: {
      expectedLifespanYears: 6,
      expectedWearCycles: 250,
    },
    recyclability: {
      recyclablePercentage: 90,
      recyclableComponents: ['denim fabric'],
      nonRecyclableComponents: ['metal rivets', 'zipper'],
      endOfLifeInstructions: 'Remove metal components. The organic denim can be composted if elastane content is minimal.',
    },
  },

  requiredOverrides: ['countryOfManufacture', 'manufacturer'],

  benchmarks: {
    carbonFootprint: {
      value: 8.5,
      unit: 'kgCO2e',
      source: 'Nudie Jeans Transparency Report 2023',
      note: 'Reduced impact from organic farming practices',
    },
    waterFootprint: {
      value: 2500,
      unit: 'liters',
      source: 'Organic Cotton Market Report',
    },
    typicalWeight: {
      value: 650,
      unit: 'g',
    },
  },

  suggestedCertifications: ['GOTS', 'OEKO-TEX Standard 100', 'Fair Trade'],
};

// ============================================================================
// OUTERWEAR TEMPLATES
// ============================================================================

export const JACKET_POLYESTER: TextileTemplate = {
  id: 'jacket-polyester',
  name: 'Polyester Jacket',
  description: 'Lightweight polyester jacket or windbreaker',
  productType: 'Jacket',
  thumbnailIcon: '🧥',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'polyester', percentage: 100, origin: 'conventional' },
    ],
    careInstructions: {
      maxWashTemperature: 30,
      bleachAllowed: false,
      tumbleDryAllowed: false,
      ironTemperature: 'none',
      dryCleanAllowed: true,
      specialInstructions: 'Use a guppyfriend bag when washing to capture microfibers.',
    },
    hazardousSubstances: defaultHazardousSubstances,
    durability: {
      expectedLifespanYears: 5,
      expectedWearCycles: 150,
    },
    recyclability: {
      recyclablePercentage: 80,
      recyclableComponents: ['shell fabric', 'lining'],
      nonRecyclableComponents: ['zipper', 'velcro'],
      endOfLifeInstructions: 'Remove zippers and velcro. Send to textile recycling that accepts synthetics.',
    },
  },

  requiredOverrides: ['countryOfManufacture', 'manufacturer'],

  benchmarks: {
    carbonFootprint: {
      value: 9.5,
      unit: 'kgCO2e',
      source: 'Higg MSI 2023',
    },
    waterFootprint: {
      value: 200,
      unit: 'liters',
      source: 'Higg MSI',
    },
    typicalWeight: {
      value: 400,
      unit: 'g',
    },
  },

  suggestedCertifications: ['bluesign', 'OEKO-TEX Standard 100', 'GRS (if recycled)'],
};

export const HOODIE_COTTON: TextileTemplate = {
  id: 'hoodie-cotton',
  name: 'Cotton Hoodie',
  description: 'Classic cotton fleece hoodie',
  productType: 'Hoodie',
  thumbnailIcon: '🧶',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'cotton', percentage: 80, origin: 'conventional' },
      { fiberType: 'polyester', percentage: 20, origin: 'conventional' },
    ],
    careInstructions: {
      maxWashTemperature: 40,
      bleachAllowed: false,
      tumbleDryAllowed: true,
      ironTemperature: 'medium',
      dryCleanAllowed: false,
    },
    hazardousSubstances: defaultHazardousSubstances,
    durability: {
      expectedLifespanYears: 3,
      expectedWearCycles: 100,
    },
    recyclability: {
      recyclablePercentage: 70,
      recyclableComponents: ['fabric body'],
      nonRecyclableComponents: ['zipper', 'drawstring'],
      endOfLifeInstructions: 'Blended fabrics are harder to recycle. Donate if wearable. Some programs accept blends.',
    },
  },

  requiredOverrides: ['countryOfManufacture', 'manufacturer'],

  benchmarks: {
    carbonFootprint: {
      value: 8.2,
      unit: 'kgCO2e',
      source: 'WRAP UK 2023',
    },
    waterFootprint: {
      value: 3000,
      unit: 'liters',
      source: 'Water Footprint Network',
    },
    typicalWeight: {
      value: 450,
      unit: 'g',
    },
  },

  suggestedCertifications: ['OEKO-TEX Standard 100', 'Better Cotton Initiative (BCI)'],
};

// ============================================================================
// UNDERWEAR / BASICS TEMPLATES
// ============================================================================

export const UNDERWEAR_COTTON: TextileTemplate = {
  id: 'underwear-cotton',
  name: 'Cotton Underwear',
  description: 'Basic cotton underwear/briefs',
  productType: 'Underwear',
  thumbnailIcon: '🩲',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'cotton', percentage: 95, origin: 'conventional' },
      { fiberType: 'elastane', percentage: 5, origin: 'conventional' },
    ],
    careInstructions: {
      maxWashTemperature: 60,
      bleachAllowed: true,
      tumbleDryAllowed: true,
      ironTemperature: 'medium',
      dryCleanAllowed: false,
    },
    hazardousSubstances: defaultHazardousSubstances,
    durability: {
      expectedLifespanYears: 1,
      expectedWearCycles: 50,
    },
    recyclability: {
      recyclablePercentage: 90,
      recyclableComponents: ['fabric'],
      endOfLifeInstructions: 'Textile recycling. Due to hygiene, not suitable for resale.',
    },
  },

  requiredOverrides: ['countryOfManufacture', 'manufacturer'],

  benchmarks: {
    carbonFootprint: {
      value: 1.5,
      unit: 'kgCO2e',
      source: 'Estimated from WRAP data',
    },
    typicalWeight: {
      value: 50,
      unit: 'g',
    },
  },

  suggestedCertifications: ['OEKO-TEX Standard 100'],
};

export const SOCKS_COTTON: TextileTemplate = {
  id: 'socks-cotton',
  name: 'Cotton Socks',
  description: 'Standard cotton socks',
  productType: 'Socks',
  thumbnailIcon: '🧦',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'cotton', percentage: 80, origin: 'conventional' },
      { fiberType: 'polyester', percentage: 15, origin: 'conventional' },
      { fiberType: 'elastane', percentage: 5, origin: 'conventional' },
    ],
    careInstructions: {
      maxWashTemperature: 40,
      bleachAllowed: false,
      tumbleDryAllowed: true,
      ironTemperature: 'none',
      dryCleanAllowed: false,
    },
    hazardousSubstances: defaultHazardousSubstances,
    durability: {
      expectedLifespanYears: 1,
      expectedWearCycles: 30,
    },
    recyclability: {
      recyclablePercentage: 60,
      recyclableComponents: ['fabric'],
      endOfLifeInstructions: 'Blended materials make recycling difficult. Some specialty programs accept socks.',
    },
  },

  requiredOverrides: ['countryOfManufacture', 'manufacturer'],

  benchmarks: {
    carbonFootprint: {
      value: 0.8,
      unit: 'kgCO2e',
      source: 'Estimated from material content',
    },
    typicalWeight: {
      value: 40,
      unit: 'g',
    },
  },

  suggestedCertifications: ['OEKO-TEX Standard 100'],
};

// ============================================================================
// DRESS / FORMAL TEMPLATES
// ============================================================================

export const DRESS_POLYESTER: TextileTemplate = {
  id: 'dress-polyester',
  name: 'Polyester Dress',
  description: 'Standard polyester dress',
  productType: 'Dress',
  thumbnailIcon: '👗',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'polyester', percentage: 100, origin: 'conventional' },
    ],
    careInstructions: defaultCareInstructionsDelicate,
    hazardousSubstances: defaultHazardousSubstances,
    durability: {
      expectedLifespanYears: 3,
      expectedWearCycles: 30,
    },
    recyclability: {
      recyclablePercentage: 90,
      recyclableComponents: ['fabric'],
      nonRecyclableComponents: ['zipper', 'buttons'],
      endOfLifeInstructions: 'Remove non-textile components. Recyclable through synthetic textile programs.',
    },
  },

  requiredOverrides: ['countryOfManufacture', 'manufacturer'],

  benchmarks: {
    carbonFootprint: {
      value: 7.2,
      unit: 'kgCO2e',
      source: 'Higg MSI 2023',
    },
    typicalWeight: {
      value: 300,
      unit: 'g',
    },
  },

  suggestedCertifications: ['OEKO-TEX Standard 100', 'bluesign'],
};

// ============================================================================
// WOOL / PREMIUM TEMPLATES
// ============================================================================

export const SWEATER_WOOL: TextileTemplate = {
  id: 'sweater-wool',
  name: 'Wool Sweater',
  description: 'Classic wool sweater/jumper',
  productType: 'Sweater',
  thumbnailIcon: '🧣',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'wool', percentage: 100, origin: 'conventional' },
    ],
    careInstructions: {
      maxWashTemperature: 30,
      bleachAllowed: false,
      tumbleDryAllowed: false,
      ironTemperature: 'low',
      dryCleanAllowed: true,
      specialInstructions: 'Hand wash recommended. Lay flat to dry to maintain shape.',
    },
    hazardousSubstances: defaultHazardousSubstances,
    durability: {
      expectedLifespanYears: 10,
      expectedWearCycles: 200,
    },
    recyclability: {
      recyclablePercentage: 95,
      recyclableComponents: ['wool fabric'],
      endOfLifeInstructions: 'Wool is highly recyclable and biodegradable. Can be composted or recycled into new wool products.',
    },
  },

  requiredOverrides: ['countryOfManufacture', 'manufacturer'],

  benchmarks: {
    carbonFootprint: {
      value: 17.0,
      unit: 'kgCO2e',
      source: 'IWTO (International Wool Textile Organisation)',
      note: 'Higher emissions offset by exceptional durability (10+ year lifespan)',
    },
    waterFootprint: {
      value: 170,
      unit: 'liters',
      source: 'IWTO',
    },
    typicalWeight: {
      value: 400,
      unit: 'g',
    },
  },

  suggestedCertifications: ['RWS (Responsible Wool Standard)', 'OEKO-TEX Standard 100', 'ZQ Merino'],
};

// ============================================================================
// FOOTWEAR TEMPLATES
// ============================================================================

export const SNEAKERS_MIXED: TextileTemplate = {
  id: 'sneakers-mixed',
  name: 'Canvas Sneakers',
  description: 'Canvas and rubber sneakers',
  productType: 'Footwear',
  thumbnailIcon: '👟',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'cotton', percentage: 60, origin: 'conventional' },
      { fiberType: 'polyester', percentage: 40, origin: 'conventional' },
    ],
    careInstructions: {
      maxWashTemperature: 30,
      bleachAllowed: false,
      tumbleDryAllowed: false,
      ironTemperature: 'none',
      dryCleanAllowed: false,
      specialInstructions: 'Remove laces and insoles before washing. Air dry only.',
    },
    hazardousSubstances: defaultHazardousSubstances,
    durability: {
      expectedLifespanYears: 2,
      expectedWearCycles: 300,
    },
    recyclability: {
      recyclablePercentage: 30,
      recyclableComponents: ['textile upper'],
      nonRecyclableComponents: ['rubber sole', 'foam insole', 'adhesives'],
      endOfLifeInstructions: 'Footwear recycling is limited. Some brands offer take-back programs. Otherwise, textile donation bins.',
    },
  },

  requiredOverrides: ['countryOfManufacture', 'manufacturer'],

  benchmarks: {
    carbonFootprint: {
      value: 14.0,
      unit: 'kgCO2e',
      source: 'MIT Sloan Footwear LCA',
      note: 'Includes rubber sole production',
    },
    typicalWeight: {
      value: 350,
      unit: 'g',
    },
  },

  suggestedCertifications: ['OEKO-TEX Standard 100', 'Leather Working Group (if leather)'],
};

// ============================================================================
// TEMPLATE REGISTRY
// ============================================================================

export const TEXTILE_TEMPLATES: Record<string, TextileTemplate> = {
  // T-Shirts
  'tshirt-cotton': TSHIRT_COTTON,
  'tshirt-organic-cotton': TSHIRT_ORGANIC_COTTON,
  'tshirt-recycled-polyester': TSHIRT_RECYCLED_POLYESTER,

  // Jeans
  'jeans-denim': JEANS_DENIM,
  'jeans-organic': JEANS_ORGANIC,

  // Outerwear
  'jacket-polyester': JACKET_POLYESTER,
  'hoodie-cotton': HOODIE_COTTON,

  // Basics
  'underwear-cotton': UNDERWEAR_COTTON,
  'socks-cotton': SOCKS_COTTON,

  // Dresses
  'dress-polyester': DRESS_POLYESTER,

  // Premium
  'sweater-wool': SWEATER_WOOL,

  // Footwear
  'sneakers-mixed': SNEAKERS_MIXED,
};

export const TEMPLATE_CATEGORIES = [
  { id: 'tops', name: 'Tops & T-Shirts', templates: ['tshirt-cotton', 'tshirt-organic-cotton', 'tshirt-recycled-polyester', 'hoodie-cotton'] },
  { id: 'bottoms', name: 'Pants & Jeans', templates: ['jeans-denim', 'jeans-organic'] },
  { id: 'outerwear', name: 'Jackets & Outerwear', templates: ['jacket-polyester'] },
  { id: 'dresses', name: 'Dresses & Skirts', templates: ['dress-polyester'] },
  { id: 'basics', name: 'Underwear & Basics', templates: ['underwear-cotton', 'socks-cotton'] },
  { id: 'knitwear', name: 'Sweaters & Knitwear', templates: ['sweater-wool'] },
  { id: 'footwear', name: 'Footwear', templates: ['sneakers-mixed'] },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getTemplateById(id: string): TextileTemplate | undefined {
  return TEXTILE_TEMPLATES[id];
}

export function getAllTemplates(): TextileTemplate[] {
  return Object.values(TEXTILE_TEMPLATES);
}

export function getTextileTemplates(): TextileTemplate[] {
  return Object.values(TEXTILE_TEMPLATES);
}

export function getTemplatesByCategory(categoryId: string): TextileTemplate[] {
  const category = TEMPLATE_CATEGORIES.find(c => c.id === categoryId);
  if (!category) return [];
  return category.templates.map(id => TEXTILE_TEMPLATES[id]).filter(Boolean);
}

/**
 * Apply a template to create initial DPP data.
 * Merges template defaults with merchant overrides.
 */
export function applyTemplate(
  templateId: string,
  overrides: Partial<TextileDppData>
): TextileDppData {
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  // Start with template defaults
  const baseData = { ...template.defaults } as TextileDppData;

  // Apply merchant overrides
  return {
    ...baseData,
    ...overrides,
    // Deep merge nested objects
    manufacturer: {
      ...baseData.manufacturer,
      ...overrides.manufacturer,
    },
    careInstructions: {
      ...baseData.careInstructions,
      ...overrides.careInstructions,
    },
    hazardousSubstances: {
      ...baseData.hazardousSubstances,
      ...overrides.hazardousSubstances,
    },
  } as TextileDppData;
}

/**
 * Get carbon footprint from template benchmark.
 * Returns a properly structured CarbonFootprint object.
 */
export function getCarbonFromBenchmark(templateId: string, productWeight?: number): CarbonFootprint | undefined {
  const template = getTemplateById(templateId);
  if (!template?.benchmarks.carbonFootprint) return undefined;

  const benchmark = template.benchmarks.carbonFootprint;

  // If product weight provided and differs from typical, scale the value
  let value = benchmark.value;
  if (productWeight && template.benchmarks.typicalWeight) {
    const ratio = productWeight / template.benchmarks.typicalWeight.value;
    value = Math.round(benchmark.value * ratio * 100) / 100;
  }

  return {
    value,
    unit: 'kgCO2e',
    methodology: 'other',
    methodologyDetail: benchmark.source,
    scope: 'cradle_to_gate',
    dataSource: 'lca_estimated',
    confidence: 'estimated',
    calculatedAt: new Date().toISOString(),
    thirdPartyVerified: false,
  };
}
