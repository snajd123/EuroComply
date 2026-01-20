import { Entity, PrimaryKey, Property, Index } from '@mikro-orm/core';

@Entity({ tableName: 'operations_events' })
export class OperationsEvent {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 50, fieldName: 'event_type' })
  @Index()
  eventType!: string;

  @Property({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Property({ type: 'varchar', length: 64, fieldName: 'previous_hash', nullable: true })
  previousHash?: string;

  @Property({ type: 'varchar', length: 64 })
  @Index()
  hash!: string;

  @Property({ type: 'varchar', length: 255, fieldName: 'actor_did' })
  actorDid!: string;

  @Property({ type: 'text', fieldName: 'signature_jws' })
  signatureJws!: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  @Index()
  createdAt: Date = new Date();
}
