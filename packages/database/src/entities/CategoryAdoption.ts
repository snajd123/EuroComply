import { Entity, Property, ManyToOne, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';

export enum LinkMode {
  LIVE = 'LIVE',
  FROZEN = 'FROZEN',
  DETACHED = 'DETACHED',
}

@Entity({ tableName: 'category_adoption' })
export class CategoryAdoption extends BaseEntity {
  // Soft link to public.categories - NO @ManyToOne for cell scaling
  @Property({ type: 'text', name: 'system_category_id' })
  systemCategoryId!: string;

  // Hard link within same tenant schema - OK to use @ManyToOne
  @ManyToOne(() => Category, { nullable: true, name: 'local_category_id' })
  localCategory?: Category;

  @Enum({ items: () => LinkMode })
  mode!: LinkMode;

  @Property({ name: 'adopted_at' })
  adoptedAt!: Date;

  @Property({ type: 'int', nullable: true, name: 'frozen_at_version' })
  frozenAtVersion?: number;

  @Property({ type: 'int', nullable: true, name: 'adopted_version' })
  adoptedVersion?: number;

  @Property({ type: 'boolean', default: false, name: 'update_available' })
  updateAvailable: boolean = false;
}
