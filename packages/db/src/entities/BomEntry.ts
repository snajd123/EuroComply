import { Entity, PrimaryKey, Property, ManyToOne, Unique, Index } from '@mikro-orm/core';
import { Product } from './Product.js';
import { ProductVersion } from './ProductVersion.js';

@Entity({ tableName: 'bom_entries' })
@Unique({ properties: ['parentProduct', 'childProduct', 'version'] })
export class BomEntry {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @ManyToOne(() => Product, { fieldName: 'parent_product_id' })
  @Index()
  parentProduct!: Product;

  @ManyToOne(() => Product, { fieldName: 'child_product_id' })
  childProduct!: Product;

  @ManyToOne(() => ProductVersion, { fieldName: 'version_id' })
  @Index()
  version!: ProductVersion;

  @Property({ type: 'decimal' })
  quantity!: string;

  @Property({ type: 'varchar', length: 20 })
  unit!: string;

  @Property({ type: 'int', default: 0 })
  position: number = 0;

  @Property({ type: 'text', nullable: true })
  notes?: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();
}
