import { describe, it, expect } from 'vitest';
import { CategoryAdoption, LinkMode } from './CategoryAdoption.js';
import { Category, CategoryType } from './Category.js';

describe('CategoryAdoption', () => {
  it('should create a LIVE adoption', () => {
    const adoption = new CategoryAdoption();
    adoption.systemCategoryId = 'sys_cat_123';
    adoption.mode = LinkMode.LIVE;
    adoption.adoptedAt = new Date();

    expect(adoption.mode).toBe(LinkMode.LIVE);
    expect(adoption.systemCategoryId).toBe('sys_cat_123');
  });

  it('should create a FROZEN adoption with version', () => {
    const localCategory = new Category();
    localCategory.name = 'Premium T-Shirts';
    localCategory.path = 'apparel.tops.tshirts.premium';
    localCategory.type = CategoryType.LEAF;

    const adoption = new CategoryAdoption();
    adoption.systemCategoryId = 'sys_cat_123';
    adoption.mode = LinkMode.FROZEN;
    adoption.localCategory = localCategory;
    adoption.frozenAtVersion = 3;
    adoption.adoptedAt = new Date();

    expect(adoption.mode).toBe(LinkMode.FROZEN);
    expect(adoption.frozenAtVersion).toBe(3);
    expect(adoption.localCategory).toBe(localCategory);
  });

  it('should track update availability', () => {
    const adoption = new CategoryAdoption();
    adoption.systemCategoryId = 'sys_cat_123';
    adoption.mode = LinkMode.FROZEN;
    adoption.adoptedAt = new Date();
    adoption.updateAvailable = true;

    expect(adoption.updateAvailable).toBe(true);
  });
});
