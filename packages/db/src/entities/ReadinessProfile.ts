import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'readiness_profiles' })
export class ReadinessProfile {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 255 })
  name!: string;

  @Property({ type: 'varchar', length: 50 })
  regulation!: string;

  @Property({ type: 'varchar', length: 100, fieldName: 'product_category', nullable: true })
  productCategory?: string;

  @Property({ type: 'jsonb' })
  requirements!: Record<string, unknown>;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
