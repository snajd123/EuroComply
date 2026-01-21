import { Entity, Property, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  PUBLISH = 'PUBLISH',
  ARCHIVE = 'ARCHIVE',
  STATUS_CHANGE = 'STATUS_CHANGE',
}

@Entity({ tableName: 'audit_log' })
export class AuditLog extends BaseEntity {
  @Property({ type: 'text', name: 'entity_type' })
  @Index()
  entityType!: string;

  @Property({ type: 'text', name: 'entity_id' })
  @Index()
  entityId!: string;

  @Enum({ items: () => AuditAction })
  @Index()
  action!: AuditAction;

  @Property({ type: 'text', name: 'user_id' })
  @Index()
  userId!: string;

  @Property({ type: 'json', nullable: true, name: 'old_values' })
  oldValues?: Record<string, unknown>;

  @Property({ type: 'json', nullable: true, name: 'new_values' })
  newValues?: Record<string, unknown>;

  @Property({ type: 'text', nullable: true, name: 'ip_address' })
  ipAddress?: string;

  @Property({ type: 'text', nullable: true, name: 'user_agent' })
  userAgent?: string;
}
