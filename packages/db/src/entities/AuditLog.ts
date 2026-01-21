import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { User } from './User.js';

@Entity({ tableName: 'audit_log' })
@Index({ properties: ['resourceType', 'resourceId'] })
export class AuditLog {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @ManyToOne(() => User, { fieldName: 'user_id', nullable: true })
  @Index()
  user?: User;

  @Property({ type: 'varchar', length: 100 })
  action!: string;

  @Property({ type: 'varchar', length: 50, fieldName: 'resource_type' })
  resourceType!: string;

  @Property({ type: 'varchar', length: 30, fieldName: 'resource_id', nullable: true })
  resourceId?: string;

  @Property({ type: 'jsonb', nullable: true })
  changes?: Record<string, unknown>;

  @Property({ type: 'varchar', length: 45, fieldName: 'ip_address', nullable: true })
  ipAddress?: string;

  @Property({ type: 'text', fieldName: 'user_agent', nullable: true })
  userAgent?: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  @Index()
  createdAt: Date = new Date();
}
