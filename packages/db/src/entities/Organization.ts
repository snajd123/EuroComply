import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'organizations', schema: 'public' })
export class Organization {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 255 })
  name!: string;

  @Property({ type: 'varchar', length: 100 })
  @Unique()
  slug!: string;

  @Property({ type: 'varchar', length: 100, fieldName: 'schema_name' })
  @Unique()
  schemaName!: string;

  // DID and Walt.id Integration
  @Property({ type: 'varchar', length: 255, nullable: true })
  @Unique()
  did?: string;

  @Property({ type: 'varchar', length: 255, fieldName: 'walt_id_key_id', nullable: true })
  waltIdKeyId?: string;

  // Hash chain head pointer (for Operations events)
  @Property({ type: 'varchar', length: 255, fieldName: 'last_event_hash', nullable: true })
  lastEventHash?: string;

  @Property({ type: 'int', fieldName: 'event_sequence', default: 0 })
  eventSequence: number = 0;

  // Status list counter (for revocation)
  @Property({ type: 'int', fieldName: 'status_list_index', default: 0 })
  statusListIndex: number = 0;

  // Billing
  @Property({ type: 'varchar', length: 255, fieldName: 'stripe_customer_id', nullable: true })
  stripeCustomerId?: string;

  @Property({ type: 'varchar', length: 50, fieldName: 'subscription_tier', default: 'starter' })
  subscriptionTier: string = 'starter';

  @Property({ type: 'varchar', length: 50, fieldName: 'subscription_status', default: 'active' })
  subscriptionStatus: string = 'active';

  // Limits
  @Property({ type: 'int', fieldName: 'user_limit', default: 20 })
  userLimit: number = 20;

  @Property({ type: 'bigint', fieldName: 'storage_limit', default: '536870912000' })
  storageLimit: string = '536870912000'; // 500GB in bytes

  // Timestamps
  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
