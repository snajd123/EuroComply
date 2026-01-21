import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';

/**
 * ReadinessProfile - defines requirements for DPP readiness by category.
 *
 * Each profile specifies required fields per workspace (design, marketing, etc.)
 * and required attestations for compliance.
 */
@Entity({ tableName: 'readiness_profiles' })
export class ReadinessProfile {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 255 })
  name!: string;

  @Property({ type: 'varchar', length: 100 })
  @Unique()
  category!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'jsonb', fieldName: 'required_fields' })
  requiredFields!: Record<string, string[]>;

  @Property({ type: 'jsonb', fieldName: 'required_attestations', nullable: true })
  requiredAttestations?: string[];

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
