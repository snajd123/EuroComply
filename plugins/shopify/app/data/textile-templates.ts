/**
 * Textile DPP Template
 *
 * Single template with sensible defaults for all textile products.
 * Merchants customize fiber composition, manufacturer, etc.
 *
 * Carbon footprint is calculated dynamically from fiber data
 * via the Higg integration - no need for product-specific benchmarks.
 */

import type { TextileDppData, CareInstructions } from '../types/dpp-schemas';

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_CARE_INSTRUCTIONS: CareInstructions = {
  maxWashTemperature: 40,
  bleachAllowed: false,
  tumbleDryAllowed: false,
  ironTemperature: 'medium',
  dryCleanAllowed: false,
};

export const DEFAULT_HAZARDOUS_SUBSTANCES = {
  reachCompliant: true,
  substancesOfConcern: [],
};

export const DEFAULT_RECYCLABILITY = {
  recyclablePercentage: 80,
  recyclableComponents: ['fabric'],
  endOfLifeInstructions: 'Check local textile recycling guidelines. Remove non-textile components before recycling.',
};

// ============================================================================
// TEXTILE TEMPLATE
// ============================================================================

export interface TextileTemplate {
  id: string;
  name: string;
  description: string;
  defaults: Partial<TextileDppData>;
  requiredFields: (keyof TextileDppData)[];
}

export const TEXTILE_TEMPLATE: TextileTemplate = {
  id: 'textile-default',
  name: 'Textile Product',
  description: 'Standard template for all textile/apparel products',

  defaults: {
    category: 'textile',
    fiberComposition: [
      { fiberType: 'cotton', percentage: 100, origin: 'conventional' },
    ],
    careInstructions: DEFAULT_CARE_INSTRUCTIONS,
    hazardousSubstances: DEFAULT_HAZARDOUS_SUBSTANCES,
    recyclability: DEFAULT_RECYCLABILITY,
    durability: {
      expectedLifespanYears: 2,
    },
  },

  requiredFields: [
    'fiberComposition',
    'countryOfManufacture',
    'manufacturer',
    'careInstructions',
    'hazardousSubstances',
  ],
};

// ============================================================================
// COMMON CERTIFICATIONS (for dropdown/autocomplete)
// ============================================================================

export const COMMON_CERTIFICATIONS = [
  { value: 'GOTS', label: 'GOTS (Global Organic Textile Standard)' },
  { value: 'OEKO-TEX Standard 100', label: 'OEKO-TEX Standard 100' },
  { value: 'OEKO-TEX Made in Green', label: 'OEKO-TEX Made in Green' },
  { value: 'GRS', label: 'GRS (Global Recycled Standard)' },
  { value: 'OCS', label: 'OCS (Organic Content Standard)' },
  { value: 'Bluesign', label: 'Bluesign' },
  { value: 'Fair Trade', label: 'Fair Trade Certified' },
  { value: 'EU Ecolabel', label: 'EU Ecolabel' },
  { value: 'BCI', label: 'Better Cotton Initiative' },
];

// ============================================================================
// CARE INSTRUCTION PRESETS (quick selection)
// ============================================================================

export const CARE_PRESETS = {
  standard: {
    label: 'Standard (40°C, no bleach)',
    value: DEFAULT_CARE_INSTRUCTIONS,
  },
  delicate: {
    label: 'Delicate (30°C, dry clean OK)',
    value: {
      maxWashTemperature: 30,
      bleachAllowed: false,
      tumbleDryAllowed: false,
      ironTemperature: 'low' as const,
      dryCleanAllowed: true,
    },
  },
  wool: {
    label: 'Wool/Cashmere (hand wash)',
    value: {
      maxWashTemperature: 30,
      bleachAllowed: false,
      tumbleDryAllowed: false,
      ironTemperature: 'low' as const,
      dryCleanAllowed: true,
      specialInstructions: 'Hand wash recommended. Lay flat to dry.',
    },
  },
  synthetic: {
    label: 'Synthetic (30°C, low heat)',
    value: {
      maxWashTemperature: 30,
      bleachAllowed: false,
      tumbleDryAllowed: false,
      ironTemperature: 'low' as const,
      dryCleanAllowed: false,
      specialInstructions: 'Use microfiber wash bag to reduce microplastic release.',
    },
  },
  durable: {
    label: 'Durable (60°C, tumble dry OK)',
    value: {
      maxWashTemperature: 60,
      bleachAllowed: false,
      tumbleDryAllowed: true,
      ironTemperature: 'high' as const,
      dryCleanAllowed: false,
    },
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getTextileTemplate(): TextileTemplate {
  return TEXTILE_TEMPLATE;
}

export function getTextileTemplates(): TextileTemplate[] {
  return [TEXTILE_TEMPLATE];
}

export function applyTemplate(overrides: Partial<TextileDppData>): TextileDppData {
  const defaults = TEXTILE_TEMPLATE.defaults;

  return {
    category: 'textile',
    fiberComposition: overrides.fiberComposition || defaults.fiberComposition!,
    countryOfManufacture: overrides.countryOfManufacture || '',
    manufacturer: overrides.manufacturer || { name: '', country: '' },
    careInstructions: {
      ...DEFAULT_CARE_INSTRUCTIONS,
      ...overrides.careInstructions,
    },
    hazardousSubstances: {
      ...DEFAULT_HAZARDOUS_SUBSTANCES,
      ...overrides.hazardousSubstances,
    },
    recyclability: overrides.recyclability || defaults.recyclability,
    durability: overrides.durability || defaults.durability,
    carbonFootprint: overrides.carbonFootprint,
    certifications: overrides.certifications,
  } as TextileDppData;
}
