import { Entity, Property, ManyToOne, OneToMany, Collection, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';

export enum ProductStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

@Entity({ tableName: 'product' })
export class Product extends BaseEntity {
  @Property({ type: 'text' })
  @Index()
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'text', nullable: true })
  sku?: string;

  @Property({ type: 'text', nullable: true })
  gtin?: string;

  @ManyToOne(() => Category, { name: 'category_id' })
  category!: Category;

  @Enum({ items: () => ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus = ProductStatus.DRAFT;

  @Property({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @OneToMany('ProductVersion', 'product')
  versions = new Collection<import('./ProductVersion.js').ProductVersion>(this);
}
