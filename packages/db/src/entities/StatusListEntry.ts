import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { StatusList } from './StatusList.js';

@Entity({ tableName: 'status_list_entries' })
export class StatusListEntry {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @ManyToOne(() => StatusList, { fieldName: 'status_list_id' })
  @Index()
  statusList!: StatusList;

  @Property({ type: 'varchar', length: 30, fieldName: 'credential_id' })
  @Index()
  credentialId!: string;

  @Property({ type: 'int' })
  index!: number;

  @Property({ type: 'boolean', default: false })
  revoked: boolean = false;

  @Property({ type: 'timestamptz', fieldName: 'revoked_at', nullable: true })
  revokedAt?: Date;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();
}
