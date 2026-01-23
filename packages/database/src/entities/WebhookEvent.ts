import { Entity, Property, Unique, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export enum WebhookStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity({ tableName: 'webhook_events', schema: 'public' })
export class WebhookEvent extends BaseEntity {
  @Property({ type: 'text', name: 'svix_id' })
  @Unique()
  svixId!: string;

  @Property({ type: 'text', name: 'event_type' })
  eventType!: string;

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;

  @Enum({ items: () => WebhookStatus, default: WebhookStatus.PROCESSING })
  status: WebhookStatus = WebhookStatus.PROCESSING;

  @Property({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage?: string;

  @Property({ nullable: true, name: 'completed_at' })
  completedAt?: Date;
}
