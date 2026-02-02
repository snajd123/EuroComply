// packages/gsr/src/utils/scope-mapper.ts
import { ProductScope } from '../enums/ProductScope.js';

/**
 * Mapping from keywords to ProductScope enum values.
 * Keywords are matched case-insensitively against the raw scope text.
 */
const SCOPE_KEYWORDS: Record<string, ProductScope[]> = {
  // Consumer goods - specific categories
  toy: [ProductScope.TOYS],
  childcare: [ProductScope.CHILDCARE_ARTICLES],
  'child care': [ProductScope.CHILDCARE_ARTICLES],
  children: [ProductScope.CHILDCARE_ARTICLES],
  jewel: [ProductScope.JEWELRY],
  'precious metal': [ProductScope.JEWELRY],
  textile: [ProductScope.TEXTILES],
  leather: [ProductScope.TEXTILES],
  clothing: [ProductScope.TEXTILES],
  garment: [ProductScope.TEXTILES],
  fabric: [ProductScope.TEXTILES],
  cosmetic: [ProductScope.COSMETICS],
  'personal care': [ProductScope.COSMETICS],
  'food contact': [ProductScope.FOOD_CONTACT],
  'food-contact': [ProductScope.FOOD_CONTACT],
  'intended to come into contact with food': [ProductScope.FOOD_CONTACT],
  furniture: [ProductScope.FURNITURE],

  // Electronics
  electrical: [ProductScope.EEE],
  electronic: [ProductScope.EEE],
  eee: [ProductScope.EEE],
  battery: [ProductScope.BATTERIES],
  batteries: [ProductScope.BATTERIES],
  cable: [ProductScope.CABLES],
  wire: [ProductScope.CABLES],

  // Automotive
  vehicle: [ProductScope.VEHICLES],
  automotive: [ProductScope.VEHICLES],
  'motor vehicle': [ProductScope.VEHICLES],

  // Construction
  construction: [ProductScope.CONSTRUCTION_PRODUCTS],
  building: [ProductScope.CONSTRUCTION_PRODUCTS],
  paint: [ProductScope.PAINTS_COATINGS],
  coating: [ProductScope.PAINTS_COATINGS],
  varnish: [ProductScope.PAINTS_COATINGS],
  lacquer: [ProductScope.PAINTS_COATINGS],

  // Packaging
  packaging: [ProductScope.PACKAGING],
  package: [ProductScope.PACKAGING],

  // Broader categories
  consumer: [ProductScope.CONSUMER_GOODS],
  industrial: [ProductScope.INDUSTRIAL],
};

/**
 * Maps raw scope text from ECHA to ProductScope enum values.
 *
 * The function searches for keywords in the raw text and returns
 * all matching ProductScope values. If no keywords match, returns
 * [ALL_PRODUCTS] as the default.
 *
 * @param rawScope - Raw scope text from ECHA export (e.g., "toys or childcare articles")
 * @returns Array of matching ProductScope values
 *
 * @example
 * mapScopeText("toys") // [ProductScope.TOYS]
 * mapScopeText("jewellery and childcare articles") // [ProductScope.JEWELRY, ProductScope.CHILDCARE_ARTICLES]
 * mapScopeText(undefined) // [ProductScope.ALL_PRODUCTS]
 */
export function mapScopeText(rawScope: string | undefined): ProductScope[] {
  if (!rawScope || rawScope.trim() === '') {
    return [ProductScope.ALL_PRODUCTS];
  }

  const normalized = rawScope.toLowerCase();
  const matched = new Set<ProductScope>();

  for (const [keyword, scopes] of Object.entries(SCOPE_KEYWORDS)) {
    if (normalized.includes(keyword)) {
      scopes.forEach((s) => matched.add(s));
    }
  }

  return matched.size > 0 ? Array.from(matched) : [ProductScope.ALL_PRODUCTS];
}

/**
 * Extracts all unique scope keywords from the mapping.
 * Useful for documentation or debugging.
 */
export function getScopeKeywords(): string[] {
  return Object.keys(SCOPE_KEYWORDS).sort();
}
