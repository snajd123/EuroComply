import { Entity, PrimaryKey, Property, Enum, Index } from '@mikro-orm/core';

export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}

/**
 * OutboxEvent entity for reliable event delivery.
 *
 * Lives in TENANT schema for tenant data isolation.
 * The processor polls each tenant's outbox for PENDING/FAILED events.
 */
@Entity({ tableName: 'outbox_events' })
@Index({ properties: ['aggregateType', 'aggregateId'] })
export class OutboxEvent {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 30, fieldName: 'organization_id' })
  @Index()
  organizationId!: string;

  @Property({ type: 'varchar', length: 100, fieldName: 'event_type' })
  eventType!: string;

  @Property({ type: 'varchar', length: 50, fieldName: 'aggregate_type' })
  aggregateType!: string;

  @Property({ type: 'varchar', length: 30, fieldName: 'aggregate_id' })
  aggregateId!: string;

  @Property({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Enum({ items: () => OutboxStatus, default: OutboxStatus.PENDING })
  @Index()
  status: OutboxStatus = OutboxStatus.PENDING;

  @Property({ type: 'int', default: 0 })
  attempts: number = 0;

  @Property({ type: 'text', fieldName: 'last_error', nullable: true })
  lastError?: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'processed_at', nullable: true })
  processedAt?: Date;
}
