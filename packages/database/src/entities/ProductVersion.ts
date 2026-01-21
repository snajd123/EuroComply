import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Product } from './Product.js';

export enum VersionStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

@Entity({ tableName: 'product_version' })
@Unique({ properties: ['product', 'version'] })
export class ProductVersion extends BaseEntity {
  @ManyToOne(() => Product, { name: 'product_id' })
  @Index()
  product!: Product;

  @Property({ type: 'text' })
  version!: string; // Semantic version: "1.0.0"

  @Enum({ items: () => VersionStatus, default: VersionStatus.DRAFT })
  status: VersionStatus = VersionStatus.DRAFT;

  @Property({ type: 'json', name: 'attribute_values', nullable: true })
  attributeValues?: Record<string, unknown>;

  @Property({ type: 'text', nullable: true, name: 'change_summary' })
  changeSummary?: string;

  @Property({ type: 'text', nullable: true, name: 'created_by' })
  createdBy?: string;

  @Property({ name: 'published_at', nullable: true })
  publishedAt?: Date;

  @Property({ type: 'text', nullable: true, name: 'published_by' })
  publishedBy?: string;
}
