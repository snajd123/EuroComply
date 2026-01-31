import { describe, it, expect } from 'vitest';
import { ProductScope, SCOPE_HIERARCHY, getAllDescendants, isScopeAncestor } from './ProductScope.js';

describe('ProductScope', () => {
  describe('enum values', () => {
    it('should have ALL_PRODUCTS as top-level scope', () => {
      expect(ProductScope.ALL_PRODUCTS).toBe('ALL_PRODUCTS');
    });

    it('should have all consumer goods sub-categories', () => {
      expect(ProductScope.TOYS).toBe('TOYS');
      expect(ProductScope.CHILDCARE_ARTICLES).toBe('CHILDCARE_ARTICLES');
      expect(ProductScope.JEWELRY).toBe('JEWELRY');
      expect(ProductScope.COSMETICS).toBe('COSMETICS');
      expect(ProductScope.FOOD_CONTACT).toBe('FOOD_CONTACT');
      expect(ProductScope.TEXTILES).toBe('TEXTILES');
      expect(ProductScope.FURNITURE).toBe('FURNITURE');
    });

    it('should have electronics categories', () => {
      expect(ProductScope.EEE).toBe('EEE');
      expect(ProductScope.BATTERIES).toBe('BATTERIES');
      expect(ProductScope.CABLES).toBe('CABLES');
    });

    it('should have automotive categories', () => {
      expect(ProductScope.VEHICLES).toBe('VEHICLES');
      expect(ProductScope.VEHICLE_COMPONENTS).toBe('VEHICLE_COMPONENTS');
    });

    it('should have construction and packaging categories', () => {
      expect(ProductScope.CONSTRUCTION_PRODUCTS).toBe('CONSTRUCTION_PRODUCTS');
      expect(ProductScope.PAINTS_COATINGS).toBe('PAINTS_COATINGS');
      expect(ProductScope.PACKAGING).toBe('PACKAGING');
    });
  });

  describe('SCOPE_HIERARCHY', () => {
    it('should define CONSUMER_GOODS children correctly', () => {
      expect(SCOPE_HIERARCHY[ProductScope.CONSUMER_GOODS]).toContain(ProductScope.TOYS);
      expect(SCOPE_HIERARCHY[ProductScope.CONSUMER_GOODS]).toContain(ProductScope.JEWELRY);
      expect(SCOPE_HIERARCHY[ProductScope.CONSUMER_GOODS]).toContain(ProductScope.COSMETICS);
    });

    it('should define EEE children correctly', () => {
      expect(SCOPE_HIERARCHY[ProductScope.EEE]).toContain(ProductScope.BATTERIES);
      expect(SCOPE_HIERARCHY[ProductScope.EEE]).toContain(ProductScope.CABLES);
    });

    it('should have empty arrays for leaf nodes', () => {
      expect(SCOPE_HIERARCHY[ProductScope.JEWELRY]).toEqual([]);
      expect(SCOPE_HIERARCHY[ProductScope.BATTERIES]).toEqual([]);
    });
  });

  describe('getAllDescendants', () => {
    it('should return only self for leaf nodes', () => {
      const result = getAllDescendants(ProductScope.JEWELRY);
      expect(result).toEqual([ProductScope.JEWELRY]);
    });

    it('should return all children for CONSUMER_GOODS', () => {
      const result = getAllDescendants(ProductScope.CONSUMER_GOODS);
      expect(result).toContain(ProductScope.CONSUMER_GOODS);
      expect(result).toContain(ProductScope.TOYS);
      expect(result).toContain(ProductScope.CHILDCARE_ARTICLES);
      expect(result).toContain(ProductScope.JEWELRY);
    });

    it('should return nested children for TOYS including CHILDCARE_ARTICLES', () => {
      const result = getAllDescendants(ProductScope.TOYS);
      expect(result).toContain(ProductScope.TOYS);
      expect(result).toContain(ProductScope.CHILDCARE_ARTICLES);
      expect(result.length).toBe(2);
    });

    it('should return all scopes for ALL_PRODUCTS', () => {
      const result = getAllDescendants(ProductScope.ALL_PRODUCTS);
      expect(result.length).toBeGreaterThan(10);
      expect(result).toContain(ProductScope.ALL_PRODUCTS);
      expect(result).toContain(ProductScope.JEWELRY);
      expect(result).toContain(ProductScope.BATTERIES);
    });
  });

  describe('isScopeAncestor', () => {
    it('should return true when scope equals itself', () => {
      expect(isScopeAncestor(ProductScope.TOYS, ProductScope.TOYS)).toBe(true);
    });

    it('should return true when CONSUMER_GOODS is ancestor of JEWELRY', () => {
      expect(isScopeAncestor(ProductScope.CONSUMER_GOODS, ProductScope.JEWELRY)).toBe(true);
    });

    it('should return true when ALL_PRODUCTS is ancestor of BATTERIES', () => {
      expect(isScopeAncestor(ProductScope.ALL_PRODUCTS, ProductScope.BATTERIES)).toBe(true);
    });

    it('should return false when TOYS is not ancestor of JEWELRY (siblings)', () => {
      expect(isScopeAncestor(ProductScope.TOYS, ProductScope.JEWELRY)).toBe(false);
    });

    it('should return false when JEWELRY is not ancestor of CONSUMER_GOODS (reversed)', () => {
      expect(isScopeAncestor(ProductScope.JEWELRY, ProductScope.CONSUMER_GOODS)).toBe(false);
    });

    it('should return true for nested hierarchy TOYS -> CHILDCARE_ARTICLES', () => {
      expect(isScopeAncestor(ProductScope.TOYS, ProductScope.CHILDCARE_ARTICLES)).toBe(true);
    });
  });
});
