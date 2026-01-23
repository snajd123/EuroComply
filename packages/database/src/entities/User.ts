import { Entity, Property, Unique, Filter, OneToOne } from '@mikro-orm/core';
import { OrganizationUser } from './OrganizationUser.js';
import { BaseEntity } from './BaseEntity.js';

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

  @OneToOne(() => OrganizationUser, (ou) => ou.user)
  membership?: OrganizationUser;
}
