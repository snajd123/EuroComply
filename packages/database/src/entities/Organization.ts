import { Entity, Property, Unique, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export enum EnforcementMode {
  ENFORCING = 'ENFORCING',
  SILENT = 'SILENT',
}

@Entity({ tableName: 'organizations', schema: 'public' })
export class Organization extends BaseEntity {
  @Property({ type: 'text' })
  @Unique()
  name!: string;

  @Property({ type: 'text', name: 'schema_name' })
  @Unique()
  schemaName!: string;

  @Property({ type: 'text', nullable: true, name: 'clerk_org_id' })
  @Unique()
  clerkOrgId?: string;

  @Property({ type: 'boolean', name: 'regulatory_advisor_enabled', default: true })
  regulatoryAdvisorEnabled: boolean = true;

  @Enum({ items: () => EnforcementMode, name: 'enforcement_mode', default: EnforcementMode.SILENT })
  enforcementMode: EnforcementMode = EnforcementMode.SILENT;

  @Property({ type: 'boolean', name: 'capture_compliance_in_silent_mode', default: true })
  captureComplianceInSilentMode: boolean = true;

  @Property({ type: 'text', nullable: true, name: 'kms_key_arn' })
  kmsKeyArn?: string;
}
