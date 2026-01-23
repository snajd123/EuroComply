// packages/database/src/entities/AttributeTemplate.test.ts
import { describe, it, expect } from 'vitest';
import { AttributeTemplate, AttributeType, RollupMethod, InheritanceRule } from './AttributeTemplate.js';
import { TargetType, UnitSystem } from './enums/index.js';
import { Category, CategoryType } from './Category.js';

describe('AttributeTemplate', () => {
  it('should create an attribute with targetType', () => {
    const category = new Category();
    category.name = 'Apparel';
    category.path = 'apparel';
    category.type = CategoryType.ROOT;
    category.targetType = TargetType.PRODUCT;

    const attr = new AttributeTemplate();
    attr.key = 'weight';
    attr.name = 'Product Weight';
    attr.type = AttributeType.NUMBER_UNIT;
    attr.targetType = TargetType.PRODUCT;
    attr.category = category;
    attr.unitSystem = UnitSystem.MASS;
    attr.rollupMethod = RollupMethod.SUM;

    expect(attr.targetType).toBe(TargetType.PRODUCT);
    expect(attr.unitSystem).toBe(UnitSystem.MASS);
  });

  it('should support weightBasisKey for WEIGHTED_AVG rollup', () => {
    const category = new Category();
    category.name = 'Apparel';
    category.path = 'apparel';
    category.type = CategoryType.ROOT;

    const attr = new AttributeTemplate();
    attr.key = 'recycled_content';
    attr.name = 'Recycled Content';
    attr.type = AttributeType.NUMBER_UNIT;
    attr.targetType = TargetType.PRODUCT;
    attr.category = category;
    attr.unitSystem = UnitSystem.PERCENTAGE;
    attr.rollupMethod = RollupMethod.WEIGHTED_AVG;
    attr.weightBasisKey = 'weight';

    expect(attr.weightBasisKey).toBe('weight');
  });

  it('should have NUMBER_UNIT attribute type', () => {
    const attr = new AttributeTemplate();
    attr.type = AttributeType.NUMBER_UNIT;
    expect(attr.type).toBe('NUMBER_UNIT');
  });
});
