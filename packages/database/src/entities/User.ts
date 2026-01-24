import { Entity, Property, Unique, Filter, OneToOne, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import type { OrganizationUser } from './OrganizationUser.js';

@Filter({ name: 'notDeleted', cond: { deletedAt: null }, default: true })
@Entity({ tableName: 'users' })
export class User extends BaseEntity {
  @Property({ type: 'text', name: 'clerk_id' })
  @Unique()
  clerkId!: string;

  @Property({ type: 'text' })
  @Unique()
  email!: string;

  @Property({ type: 'text', nullable: true })
  name?: string;

  @Property({ type: 'text', nullable: true, name: 'avatar_url' })
  avatarUrl?: string;

  @Property({ name: 'last_login_at', nullable: true })
  lastLoginAt?: Date;

  @Property({ type: 'datetime', nullable: true, name: 'deleted_at' })
  deletedAt?: Date;

  @OneToOne('OrganizationUser', 'user')
  membership?: Rel<OrganizationUser>;
}
