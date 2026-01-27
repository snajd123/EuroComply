import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { TenantCategory } from './TenantCategory.js';
import { ListRequirement } from './enums/index.js';
import { RegulationSource } from './enums/RegulationSource.js';

@Entity({ tableName: 'tenant_category_regulatory_list' })
@Unique({ properties: ['tenantCategory', 'regulatoryListId'] })
export class TenantCategoryRegulatoryList extends BaseEntity {
  @ManyToOne(() => TenantCategory, { name: 'tenant_category_id' })
  @Index()
  tenantCategory!: TenantCategory;

  // Soft link to public.regulatory_list (text ID, not FK)
  @Property({ type: 'text', name: 'regulatory_list_id' })
  @Index()
  regulatoryListId!: string;

  @Enum({ items: () => ListRequirement })
  requirement!: ListRequirement;

  @Enum({ items: () => RegulationSource })
  source!: RegulationSource;

  // Exemption fields
  @Property({ type: 'boolean', default: false, name: 'is_exempted' })
  isExempted: boolean = false;

  @Property({ type: 'text', nullable: true, name: 'exemption_reason' })
  exemptionReason?: string;

  @Property({ type: 'text', nullable: true, name: 'exemption_legal_ref' })
  exemptionLegalRef?: string;

  @Property({ type: 'text', nullable: true, name: 'exempted_by' })
  exemptedBy?: string;

  @Property({ type: 'timestamptz', nullable: true, name: 'exempted_at' })
  exemptedAt?: Date;

  // Override fields
  @Property({ type: 'decimal', precision: 5, scale: 4, nullable: true, name: 'override_threshold' })
  overrideThreshold?: string;
}
