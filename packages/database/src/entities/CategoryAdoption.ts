import { Entity, Property, ManyToOne, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';

export enum AdoptionMode {
  LIVE_LINK = 'LIVE_LINK',
  FORKED = 'FORKED',
}

@Entity({ tableName: 'category_adoption' })
export class CategoryAdoption extends BaseEntity {
  // Soft link to public.categories - NO @ManyToOne for cell scaling
  @Property({ type: 'text', name: 'system_category_id' })
  systemCategoryId!: string;

  // Hard link within same tenant schema - OK to use @ManyToOne
  @ManyToOne(() => Category, { nullable: true, name: 'local_category_id' })
  localCategory?: Category;

  @Enum({ items: () => AdoptionMode })
  mode!: AdoptionMode;

  @Property({ name: 'adopted_at' })
  adoptedAt!: Date;

  @Property({ type: 'int', nullable: true, name: 'forked_version' })
  forkedVersion?: number;

  @Property({ type: 'boolean', default: false, name: 'update_available' })
  updateAvailable: boolean = false;
}
