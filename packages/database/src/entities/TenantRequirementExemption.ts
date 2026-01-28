import {
  Entity,
  Property,
  ManyToOne,
  Index,
  Unique,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { TenantCategory } from './TenantCategory.js';

/**
 * Tenant-level exemption for a specific requirement.
 * Lives in tenant schema.
 *
 * Note: We store requirementId as text string instead of FK because
 * the Requirement entity is in public schema. Cross-schema FKs are
 * complex in PostgreSQL with schema-per-tenant architecture.
 */
@Entity({ tableName: 'tenant_requirement_exemption' })
@Unique({ properties: ['tenantCategory', 'requirementId'] })
export class TenantRequirementExemption extends BaseEntity {
  @ManyToOne(() => TenantCategory, { name: 'tenant_category_id' })
  @Index()
  tenantCategory!: TenantCategory;

  @Property({ type: 'text', name: 'requirement_id' })
  @Index()
  requirementId!: string;

  @Property({ type: 'text' })
  reason!: string;

  @Property({ type: 'text', nullable: true, name: 'legal_reference' })
  legalReference?: string;

  @Property({ type: 'text', name: 'exempted_by' })
  exemptedBy!: string;

  @Property({ type: 'timestamptz', name: 'exempted_at' })
  exemptedAt: Date = new Date();

  // Revocation fields
  @Property({ type: 'timestamptz', nullable: true, name: 'revoked_at' })
  revokedAt?: Date;

  @Property({ type: 'text', nullable: true, name: 'revoked_by' })
  revokedBy?: string;

  @Property({ type: 'text', nullable: true, name: 'revocation_reason' })
  revocationReason?: string;
}
