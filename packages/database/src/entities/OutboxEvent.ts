import { Entity, Property, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity({ tableName: 'outbox_event' })
export class OutboxEvent extends BaseEntity {
  @Property({ type: 'text', name: 'aggregate_type' })
  @Index()
  aggregateType!: string; // e.g., 'Product', 'ProductVersion'

  @Property({ type: 'text', name: 'aggregate_id' })
  @Index()
  aggregateId!: string;

  @Property({ type: 'text', name: 'event_type' })
  @Index()
  eventType!: string; // e.g., 'ProductCreated', 'VersionPublished'

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;

  @Enum({ items: () => OutboxStatus, default: OutboxStatus.PENDING })
  @Index()
  status: OutboxStatus = OutboxStatus.PENDING;

  @Property({ type: 'int', default: 0, name: 'retry_count' })
  retryCount: number = 0;

  @Property({ nullable: true, name: 'processed_at' })
  processedAt?: Date;

  @Property({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage?: string;
}
