import { Entity, PrimaryKey, Property, OneToMany, Collection } from '@mikro-orm/core';
import type { StatusListEntry } from './StatusListEntry.js';

@Entity({ tableName: 'status_lists' })
export class StatusList {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 20 })
  purpose!: string;

  @Property({ type: 'text', fieldName: 'encoded_list' })
  encodedList!: string;

  @Property({ type: 'int', fieldName: 'current_index', default: 0 })
  currentIndex: number = 0;

  @OneToMany('StatusListEntry', 'statusList')
  entries = new Collection<StatusListEntry>(this);

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
