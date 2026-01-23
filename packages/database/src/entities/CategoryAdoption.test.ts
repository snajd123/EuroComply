import { describe, it, expect } from 'vitest';
import { CategoryAdoption, AdoptionMode } from './CategoryAdoption.js';
import { Category, CategoryType } from './Category.js';

describe('CategoryAdoption', () => {
  it('should create a LIVE_LINK adoption', () => {
    const adoption = new CategoryAdoption();
    adoption.systemCategoryId = 'sys_cat_123';
    adoption.mode = AdoptionMode.LIVE_LINK;
    adoption.adoptedAt = new Date();

    expect(adoption.mode).toBe(AdoptionMode.LIVE_LINK);
    expect(adoption.systemCategoryId).toBe('sys_cat_123');
  });

  it('should create a FORKED adoption with version', () => {
    const localCategory = new Category();
    localCategory.name = 'Premium T-Shirts';
    localCategory.path = 'apparel.tops.tshirts.premium';
    localCategory.type = CategoryType.LEAF;

    const adoption = new CategoryAdoption();
    adoption.systemCategoryId = 'sys_cat_123';
    adoption.mode = AdoptionMode.FORKED;
    adoption.localCategory = localCategory;
    adoption.forkedVersion = 3;
    adoption.adoptedAt = new Date();

    expect(adoption.mode).toBe(AdoptionMode.FORKED);
    expect(adoption.forkedVersion).toBe(3);
    expect(adoption.localCategory).toBe(localCategory);
  });

  it('should track update availability', () => {
    const adoption = new CategoryAdoption();
    adoption.systemCategoryId = 'sys_cat_123';
    adoption.mode = AdoptionMode.FORKED;
    adoption.adoptedAt = new Date();
    adoption.updateAvailable = true;

    expect(adoption.updateAvailable).toBe(true);
  });
});
