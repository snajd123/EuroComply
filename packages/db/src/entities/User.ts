import { Entity, PrimaryKey, Property, Unique, OneToMany, Collection } from '@mikro-orm/core';
import { OrganizationUser } from './OrganizationUser.js';

@Entity({ tableName: 'users' })
export class User {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 255, fieldName: 'clerk_id' })
  @Unique()
  clerkId!: string;

  @Property({ type: 'varchar', length: 255 })
  @Unique()
  email!: string;

  @Property({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @Property({ type: 'text', fieldName: 'avatar_url', nullable: true })
  avatarUrl?: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'last_login_at', nullable: true })
  lastLoginAt?: Date;

  @OneToMany('OrganizationUser', 'user')
  memberships = new Collection<OrganizationUser>(this);
}
