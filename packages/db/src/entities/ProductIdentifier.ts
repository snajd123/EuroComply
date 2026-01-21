import { Entity, PrimaryKey, Property, ManyToOne, Unique, Index, Enum } from '@mikro-orm/core';
import { Product } from './Product.js';

export enum IdentifierType {
  INTERNAL = 'INTERNAL',
  SKU = 'SKU',
  GTIN = 'GTIN',
  DPP_URI = 'DPP_URI',
}

@Entity({ tableName: 'product_identifiers' })
@Unique({ properties: ['product', 'type'] })
export class ProductIdentifier {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @ManyToOne(() => Product, { fieldName: 'product_id' })
  product!: Product;

  @Enum({ items: () => IdentifierType })
  type!: IdentifierType;

  @Property({ type: 'varchar', length: 255 })
  @Index()
  value!: string;

  @Property({ type: 'boolean', fieldName: 'is_primary', default: false })
  isPrimary: boolean = false;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();
}
