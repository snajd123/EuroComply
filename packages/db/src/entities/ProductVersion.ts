import { Entity, PrimaryKey, Property, ManyToOne, Unique, Index, Enum } from '@mikro-orm/core';
import { Product } from './Product.js';
import type { User } from './User.js';

export enum VersionStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum Workspace {
  DESIGN = 'DESIGN',
  OPERATIONS = 'OPERATIONS',
  MARKETING = 'MARKETING',
  COMPLIANCE = 'COMPLIANCE',
}

@Entity({ tableName: 'product_versions' })
@Unique({ properties: ['product', 'workspace', 'versionNumber'] })
export class ProductVersion {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @ManyToOne(() => Product, { fieldName: 'product_id' })
  @Index()
  product!: Product;

  @Enum({ items: () => Workspace })
  workspace!: Workspace;

  @Property({ type: 'int', fieldName: 'version_number' })
  versionNumber!: number;

  @Enum({ items: () => VersionStatus, default: VersionStatus.DRAFT })
  @Index()
  status: VersionStatus = VersionStatus.DRAFT;

  @ManyToOne('User', { fieldName: 'created_by' })
  createdBy!: User;

  @ManyToOne('User', { fieldName: 'published_by', nullable: true })
  publishedBy?: User;

  @Property({ type: 'timestamptz', fieldName: 'published_at', nullable: true })
  publishedAt?: Date;

  @Property({ type: 'varchar', length: 255, fieldName: 'signature_did', nullable: true })
  signatureDid?: string;

  @Property({ type: 'text', fieldName: 'signature_jws', nullable: true })
  signatureJws?: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
