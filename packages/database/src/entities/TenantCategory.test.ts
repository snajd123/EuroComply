import { describe, it, expect } from 'vitest';
import { TenantCategory } from './TenantCategory.js';
import { CategoryType } from './Category.js';
import { TargetType } from './enums/index.js';
import { LinkMode } from './CategoryAdoption.js';

describe('TenantCategory', () => {
  it('should create a tenant category with required fields', () => {
    const category = new TenantCategory();
    category.name = 'Custom Apparel';
    category.path = 'custom.apparel';
    category.type = CategoryType.BRANCH;
    category.targetType = TargetType.PRODUCT;

    expect(category.name).toBe('Custom Apparel');
    expect(category.path).toBe('custom.apparel');
    expect(category.type).toBe(CategoryType.BRANCH);
    expect(category.targetType).toBe(TargetType.PRODUCT);
    expect(category.isActive).toBe(true);
    expect(category.depth).toBe(0);
  });

  it('should support self-referencing parent relationship', () => {
    const parent = new TenantCategory();
    parent.name = 'Apparel';
    parent.path = 'apparel';
    parent.type = CategoryType.ROOT;
    parent.depth = 0;

    const child = new TenantCategory();
    child.name = 'T-Shirts';
    child.path = 'apparel.tshirts';
    child.type = CategoryType.LEAF;
    child.parent = parent;
    child.depth = 1;

    expect(child.parent).toBe(parent);
    expect(child.depth).toBe(1);
  });

  it('should support linking to system category with LIVE mode', () => {
    const category = new TenantCategory();
    category.name = 'Apparel';
    category.path = 'apparel';
    category.systemCategoryId = 'sys_cat_123';
    category.linkMode = LinkMode.LIVE;

    expect(category.systemCategoryId).toBe('sys_cat_123');
    expect(category.linkMode).toBe(LinkMode.LIVE);
  });

  it('should support FROZEN link mode with version', () => {
    const category = new TenantCategory();
    category.name = 'Frozen Category';
    category.path = 'frozen';
    category.systemCategoryId = 'sys_cat_456';
    category.linkMode = LinkMode.FROZEN;
    category.frozenAtVersion = 5;

    expect(category.linkMode).toBe(LinkMode.FROZEN);
    expect(category.frozenAtVersion).toBe(5);
  });

  it('should support DETACHED link mode', () => {
    const category = new TenantCategory();
    category.name = 'Detached Category';
    category.path = 'detached';
    category.systemCategoryId = 'sys_cat_789';
    category.linkMode = LinkMode.DETACHED;

    expect(category.linkMode).toBe(LinkMode.DETACHED);
  });

  it('should support optional description and defaultProfileId', () => {
    const category = new TenantCategory();
    category.name = 'Described Category';
    category.path = 'described';
    category.description = 'A category with full details';
    category.defaultProfileId = 'profile_123';

    expect(category.description).toBe('A category with full details');
    expect(category.defaultProfileId).toBe('profile_123');
  });

  it('should support FACILITY targetType', () => {
    const category = new TenantCategory();
    category.name = 'Manufacturing Plants';
    category.path = 'facilities.manufacturing';
    category.type = CategoryType.BRANCH;
    category.targetType = TargetType.FACILITY;

    expect(category.targetType).toBe(TargetType.FACILITY);
  });
});
