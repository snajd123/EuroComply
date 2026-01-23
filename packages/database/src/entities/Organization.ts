import { Entity, Property, Unique, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export enum EnforcementMode {
  ENFORCING = 'ENFORCING',
  SILENT = 'SILENT',
}

export enum SubscriptionTier {
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
}

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
}

export enum ProvisioningStatus {
  PENDING = 'PENDING',
  PROVISIONING = 'PROVISIONING',
  READY = 'READY',
  FAILED = 'FAILED',
}

@Entity({ tableName: 'organizations', schema: 'public' })
export class Organization extends BaseEntity {
  @Property({ type: 'text' })
  @Unique()
  name!: string;

  @Property({ type: 'text' })
  @Unique()
  slug!: string;

  @Property({ type: 'text', name: 'schema_name' })
  @Unique()
  schemaName!: string;

  @Property({ type: 'text', nullable: true, name: 'clerk_org_id' })
  @Unique()
  clerkOrgId?: string;

  @Property({ type: 'text', default: 'cell_1', name: 'cell_id' })
  cellId: string = 'cell_1';

  @Enum({ items: () => SubscriptionTier, name: 'subscription_tier', default: SubscriptionTier.STARTER })
  subscriptionTier: SubscriptionTier = SubscriptionTier.STARTER;

  @Enum({ items: () => SubscriptionStatus, name: 'subscription_status', default: SubscriptionStatus.TRIALING })
  subscriptionStatus: SubscriptionStatus = SubscriptionStatus.TRIALING;

  @Enum({ items: () => ProvisioningStatus, name: 'provisioning_status', default: ProvisioningStatus.PENDING })
  provisioningStatus: ProvisioningStatus = ProvisioningStatus.PENDING;

  @Property({ type: 'text', nullable: true, name: 'provisioning_error' })
  provisioningError?: string;

  @Property({ type: 'boolean', name: 'regulatory_advisor_enabled', default: true })
  regulatoryAdvisorEnabled: boolean = true;

  @Enum({ items: () => EnforcementMode, name: 'enforcement_mode', default: EnforcementMode.SILENT })
  enforcementMode: EnforcementMode = EnforcementMode.SILENT;

  @Property({ type: 'boolean', name: 'capture_compliance_in_silent_mode', default: true })
  captureComplianceInSilentMode: boolean = true;

  @Property({ type: 'text', nullable: true, name: 'kms_key_arn' })
  kmsKeyArn?: string;
}
