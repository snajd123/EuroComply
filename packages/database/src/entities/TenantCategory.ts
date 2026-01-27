import { Entity, Property, Index, ManyToOne, OneToMany, Collection, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { CategoryType } from './Category.js';
import { TargetType } from './enums/index.js';
import { LinkMode } from './CategoryAdoption.js';

@Entity({ tableName: 'tenant_category' })
export class TenantCategory extends BaseEntity {
  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Index({ type: 'gist' })
  @Property({ columnType: 'ltree' })
  path!: string;

  @Enum({ items: () => CategoryType, default: CategoryType.BRANCH })
  type: CategoryType = CategoryType.BRANCH;

  @Enum({ items: () => TargetType, name: 'target_type', default: TargetType.PRODUCT })
  targetType: TargetType = TargetType.PRODUCT;

  @Property({ type: 'int', default: 0 })
  depth: number = 0;

  @ManyToOne(() => TenantCategory, { nullable: true, name: 'parent_id' })
  parent?: TenantCategory;

  @OneToMany(() => TenantCategory, (cat) => cat.parent)
  children = new Collection<TenantCategory>(this);

  // Soft reference to public.category (no FK for cell scaling)
  @Property({ type: 'text', nullable: true, name: 'system_category_id' })
  systemCategoryId?: string;

  @Enum({ items: () => LinkMode, nullable: true, name: 'link_mode' })
  linkMode?: LinkMode;

  @Property({ type: 'int', nullable: true, name: 'frozen_at_version' })
  frozenAtVersion?: number;

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;

  @Property({ type: 'text', nullable: true, name: 'default_profile_id' })
  defaultProfileId?: string;
}
