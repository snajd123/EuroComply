import { Entity, PrimaryKey, Property, ManyToOne, Unique, Index, Enum } from '@mikro-orm/core';
import { Product } from './Product.js';
import { ProductVersion } from './ProductVersion.js';

export enum DppStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}

@Entity({ tableName: 'dpp_snapshots' })
@Index({ properties: ['product', 'status'] })
export class DppSnapshot {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @ManyToOne(() => Product, { fieldName: 'product_id' })
  @Index()
  product!: Product;

  @ManyToOne(() => ProductVersion, { fieldName: 'design_version_id' })
  designVersion!: ProductVersion;

  @ManyToOne(() => ProductVersion, { fieldName: 'marketing_version_id', nullable: true })
  marketingVersion?: ProductVersion;

  @Property({ type: 'varchar', length: 64, fieldName: 'credential_hash' })
  @Unique()
  credentialHash!: string;

  @Property({ type: 'varchar', length: 255, fieldName: 'issuer_did' })
  issuerDid!: string;

  @Property({ type: 'timestamptz', fieldName: 'issued_at' })
  issuedAt!: Date;

  @Enum({ items: () => DppStatus, default: DppStatus.ACTIVE })
  @Index()
  status: DppStatus = DppStatus.ACTIVE;

  @Property({ type: 'varchar', length: 500, fieldName: 'r2_path' })
  r2Path!: string;

  @Property({ type: 'varchar', length: 500, fieldName: 'qr_code_url', nullable: true })
  qrCodeUrl?: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();
}
