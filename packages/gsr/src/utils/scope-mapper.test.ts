// packages/gsr/src/utils/scope-mapper.test.ts
import { describe, it, expect } from 'vitest';
import { mapScopeText, getScopeKeywords } from './scope-mapper.js';
import { ProductScope } from '../enums/ProductScope.js';

describe('mapScopeText', () => {
  describe('single keyword matching', () => {
    it('should_return_TOYS_when_input_contains_toy', () => {
      expect(mapScopeText('toys')).toEqual([ProductScope.TOYS]);
      expect(mapScopeText('toy')).toEqual([ProductScope.TOYS]);
      expect(mapScopeText('Toys and games')).toEqual([ProductScope.TOYS]);
    });

    it('should_return_JEWELRY_when_input_contains_jewel', () => {
      expect(mapScopeText('jewellery')).toEqual([ProductScope.JEWELRY]);
      expect(mapScopeText('jewelry')).toEqual([ProductScope.JEWELRY]);
      expect(mapScopeText('precious metal items')).toEqual([ProductScope.JEWELRY]);
    });

    it('should_return_TEXTILES_when_input_contains_textile_keywords', () => {
      expect(mapScopeText('textiles')).toEqual([ProductScope.TEXTILES]);
      expect(mapScopeText('leather goods')).toEqual([ProductScope.TEXTILES]);
      expect(mapScopeText('clothing')).toEqual([ProductScope.TEXTILES]);
      expect(mapScopeText('garments')).toEqual([ProductScope.TEXTILES]);
    });

    it('should_return_EEE_when_input_contains_electrical_or_electronic', () => {
      expect(mapScopeText('electrical equipment')).toEqual([ProductScope.EEE]);
      expect(mapScopeText('electronic devices')).toEqual([ProductScope.EEE]);
      expect(mapScopeText('EEE')).toEqual([ProductScope.EEE]);
    });

    it('should_return_CHILDCARE_ARTICLES_when_input_contains_childcare', () => {
      expect(mapScopeText('childcare articles')).toEqual([ProductScope.CHILDCARE_ARTICLES]);
      expect(mapScopeText('child care products')).toEqual([ProductScope.CHILDCARE_ARTICLES]);
      expect(mapScopeText('articles for children')).toEqual([ProductScope.CHILDCARE_ARTICLES]);
    });

    it('should_return_FOOD_CONTACT_when_input_contains_food_contact', () => {
      expect(mapScopeText('food contact materials')).toEqual([ProductScope.FOOD_CONTACT]);
      expect(mapScopeText('food-contact')).toEqual([ProductScope.FOOD_CONTACT]);
      expect(mapScopeText('intended to come into contact with food')).toEqual([ProductScope.FOOD_CONTACT]);
    });

    it('should_return_VEHICLES_when_input_contains_vehicle_keywords', () => {
      expect(mapScopeText('vehicles')).toEqual([ProductScope.VEHICLES]);
      expect(mapScopeText('automotive parts')).toEqual([ProductScope.VEHICLES]);
      expect(mapScopeText('motor vehicles')).toEqual([ProductScope.VEHICLES]);
    });

    it('should_return_PAINTS_COATINGS_when_input_contains_paint_keywords', () => {
      expect(mapScopeText('paints')).toEqual([ProductScope.PAINTS_COATINGS]);
      expect(mapScopeText('coatings')).toEqual([ProductScope.PAINTS_COATINGS]);
      expect(mapScopeText('varnishes')).toEqual([ProductScope.PAINTS_COATINGS]);
    });
  });

  describe('multiple keyword matching', () => {
    it('should_return_multiple_scopes_when_input_matches_multiple_keywords', () => {
      const result = mapScopeText('toys or childcare articles');
      expect(result).toContain(ProductScope.TOYS);
      expect(result).toContain(ProductScope.CHILDCARE_ARTICLES);
      expect(result).toHaveLength(2);
    });

    it('should_return_multiple_scopes_for_complex_restriction_text', () => {
      const result = mapScopeText('jewellery, textiles and leather goods');
      expect(result).toContain(ProductScope.JEWELRY);
      expect(result).toContain(ProductScope.TEXTILES);
    });

    it('should_handle_mixed_case_and_multiple_matches', () => {
      const result = mapScopeText('TOYS, Clothing, and ELECTRONIC equipment');
      expect(result).toContain(ProductScope.TOYS);
      expect(result).toContain(ProductScope.TEXTILES);
      expect(result).toContain(ProductScope.EEE);
    });
  });

  describe('fallback behavior', () => {
    it('should_return_ALL_PRODUCTS_when_no_keywords_match', () => {
      expect(mapScopeText('general use')).toEqual([ProductScope.ALL_PRODUCTS]);
      expect(mapScopeText('all applications')).toEqual([ProductScope.ALL_PRODUCTS]);
      expect(mapScopeText('miscellaneous')).toEqual([ProductScope.ALL_PRODUCTS]);
    });

    it('should_return_ALL_PRODUCTS_when_input_is_undefined', () => {
      expect(mapScopeText(undefined)).toEqual([ProductScope.ALL_PRODUCTS]);
    });

    it('should_return_ALL_PRODUCTS_when_input_is_empty_string', () => {
      expect(mapScopeText('')).toEqual([ProductScope.ALL_PRODUCTS]);
      expect(mapScopeText('   ')).toEqual([ProductScope.ALL_PRODUCTS]);
    });
  });

  describe('case insensitivity', () => {
    it('should_match_keywords_case_insensitively', () => {
      expect(mapScopeText('TOYS')).toEqual([ProductScope.TOYS]);
      expect(mapScopeText('Toys')).toEqual([ProductScope.TOYS]);
      expect(mapScopeText('ToYs')).toEqual([ProductScope.TOYS]);
    });
  });
});

describe('getScopeKeywords', () => {
  it('should_return_array_of_keywords', () => {
    const keywords = getScopeKeywords();
    expect(Array.isArray(keywords)).toBe(true);
    expect(keywords.length).toBeGreaterThan(0);
  });

  it('should_return_sorted_keywords', () => {
    const keywords = getScopeKeywords();
    const sorted = [...keywords].sort();
    expect(keywords).toEqual(sorted);
  });

  it('should_include_common_keywords', () => {
    const keywords = getScopeKeywords();
    expect(keywords).toContain('toy');
    expect(keywords).toContain('textile');
    expect(keywords).toContain('electrical');
  });
});
