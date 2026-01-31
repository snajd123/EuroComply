export enum ProductScope {
  // Top-level
  ALL_PRODUCTS = 'ALL_PRODUCTS',
  CONSUMER_GOODS = 'CONSUMER_GOODS',
  INDUSTRIAL = 'INDUSTRIAL',

  // Consumer sub-categories
  TOYS = 'TOYS',
  CHILDCARE_ARTICLES = 'CHILDCARE_ARTICLES',
  JEWELRY = 'JEWELRY',
  COSMETICS = 'COSMETICS',
  FOOD_CONTACT = 'FOOD_CONTACT',
  TEXTILES = 'TEXTILES',
  FURNITURE = 'FURNITURE',

  // Electronics
  EEE = 'EEE',
  BATTERIES = 'BATTERIES',
  CABLES = 'CABLES',

  // Automotive
  VEHICLES = 'VEHICLES',
  VEHICLE_COMPONENTS = 'VEHICLE_COMPONENTS',

  // Construction
  CONSTRUCTION_PRODUCTS = 'CONSTRUCTION_PRODUCTS',
  PAINTS_COATINGS = 'PAINTS_COATINGS',

  // Packaging
  PACKAGING = 'PACKAGING',
}

/**
 * Hierarchy for scope inheritance.
 * Parent scope rules apply to all children.
 */
export const SCOPE_HIERARCHY: Record<ProductScope, ProductScope[]> = {
  [ProductScope.ALL_PRODUCTS]: [ProductScope.CONSUMER_GOODS, ProductScope.INDUSTRIAL, ProductScope.EEE, ProductScope.VEHICLES, ProductScope.CONSTRUCTION_PRODUCTS, ProductScope.PACKAGING],
  [ProductScope.CONSUMER_GOODS]: [
    ProductScope.TOYS,
    ProductScope.CHILDCARE_ARTICLES,
    ProductScope.JEWELRY,
    ProductScope.COSMETICS,
    ProductScope.FOOD_CONTACT,
    ProductScope.TEXTILES,
    ProductScope.FURNITURE,
  ],
  [ProductScope.TOYS]: [ProductScope.CHILDCARE_ARTICLES],
  [ProductScope.EEE]: [ProductScope.BATTERIES, ProductScope.CABLES],
  [ProductScope.VEHICLES]: [ProductScope.VEHICLE_COMPONENTS],
  // Leaf nodes have no children
  [ProductScope.INDUSTRIAL]: [],
  [ProductScope.CHILDCARE_ARTICLES]: [],
  [ProductScope.JEWELRY]: [],
  [ProductScope.COSMETICS]: [],
  [ProductScope.FOOD_CONTACT]: [],
  [ProductScope.TEXTILES]: [],
  [ProductScope.FURNITURE]: [],
  [ProductScope.BATTERIES]: [],
  [ProductScope.CABLES]: [],
  [ProductScope.VEHICLE_COMPONENTS]: [],
  [ProductScope.CONSTRUCTION_PRODUCTS]: [],
  [ProductScope.PAINTS_COATINGS]: [],
  [ProductScope.PACKAGING]: [],
};

/**
 * Get all descendant scopes (including self).
 * Used for expanding rules: a rule on CONSUMER_GOODS applies to TOYS, JEWELRY, etc.
 */
export function getAllDescendants(scope: ProductScope): ProductScope[] {
  const result: ProductScope[] = [scope];
  const children = SCOPE_HIERARCHY[scope] || [];

  for (const child of children) {
    result.push(...getAllDescendants(child));
  }

  return result;
}

/**
 * Check if ancestor is an ancestor of descendant (or equal).
 * Used for conflict detection: rule on parent conflicts with rule on child.
 */
export function isScopeAncestor(ancestor: ProductScope, descendant: ProductScope): boolean {
  if (ancestor === descendant) return true;
  return getAllDescendants(ancestor).includes(descendant);
}
