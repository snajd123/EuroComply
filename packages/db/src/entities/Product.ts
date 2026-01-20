import {
  Entity,
  PrimaryKey,
  Property,
  Enum,
  ManyToOne,
  OneToMany,
  Collection,
  Index,
} from '@mikro-orm/core';
import type { ProductIdentifier } from './ProductIdentifier.js';

export enum ProductType {
  FINISHED_GOOD = 'FINISHED_GOOD',
  RAW_MATERIAL = 'RAW_MATERIAL',
  COMPONENT = 'COMPONENT',
  VARIANT = 'VARIANT',
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

@Entity({ tableName: 'products' })
export class Product {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Enum({ items: () => ProductType, fieldName: 'product_type', default: ProductType.FINISHED_GOOD })
  @Index()
  productType: ProductType = ProductType.FINISHED_GOOD;

  @Property({ type: 'varchar', length: 255 })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @ManyToOne(() => Product, { fieldName: 'parent_id', nullable: true })
  @Index()
  parent?: Product;

  @OneToMany(() => Product, (p) => p.parent)
  variants = new Collection<Product>(this);

  @Enum({ items: () => ProductStatus, default: ProductStatus.ACTIVE })
  @Index()
  status: ProductStatus = ProductStatus.ACTIVE;

  @OneToMany('ProductIdentifier', 'product')
  identifiers = new Collection<ProductIdentifier>(this);

  @OneToMany('ProductVersion', 'product')
  versions = new Collection<any>(this);

  @OneToMany('BomEntry', 'parentProduct')
  bomEntriesAsParent = new Collection<any>(this);

  @OneToMany('BomEntry', 'childProduct')
  bomEntriesAsChild = new Collection<any>(this);

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
