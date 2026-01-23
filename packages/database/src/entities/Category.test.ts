import { describe, it, expect } from 'vitest';
import { Category, CategoryType } from './Category.js';
import { TargetType } from './enums/index.js';

describe('Category', () => {
  it('should create a category with targetType', () => {
    const category = new Category();
    category.name = 'Apparel';
    category.path = 'apparel';
    category.type = CategoryType.ROOT;
    category.targetType = TargetType.PRODUCT;

    expect(category.name).toBe('Apparel');
    expect(category.targetType).toBe(TargetType.PRODUCT);
  });

  it('should support FACILITY targetType', () => {
    const category = new Category();
    category.name = 'Manufacturing Plants';
    category.path = 'facilities.manufacturing';
    category.type = CategoryType.BRANCH;
    category.targetType = TargetType.FACILITY;

    expect(category.targetType).toBe(TargetType.FACILITY);
  });
});
