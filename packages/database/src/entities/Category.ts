import { Entity, Property, Index, ManyToOne, OneToMany, Collection, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export enum CategoryType {
  ROOT = 'ROOT',
  BRANCH = 'BRANCH',
  LEAF = 'LEAF',
}

@Entity({ tableName: 'category' })
export class Category extends BaseEntity {
  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Index({ type: 'gist' })
  @Property({ columnType: 'ltree' })
  path!: string;

  @Enum({ items: () => CategoryType, default: CategoryType.BRANCH })
  type: CategoryType = CategoryType.BRANCH;

  @Property({ type: 'int', default: 0 })
  depth: number = 0;

  @ManyToOne(() => Category, { nullable: true, name: 'parent_id' })
  parent?: Category;

  @OneToMany(() => Category, (cat) => cat.parent)
  children = new Collection<Category>(this);

  @Property({ type: 'text', nullable: true, name: 'default_profile_id' })
  defaultProfileId?: string;

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;
}
