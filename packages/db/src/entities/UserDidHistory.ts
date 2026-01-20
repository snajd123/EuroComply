import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { User } from './User.js';

@Entity({ tableName: 'user_did_history' })
export class UserDidHistory {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @ManyToOne(() => User, { fieldName: 'user_id' })
  @Index()
  user!: User;

  @Property({ type: 'varchar', length: 255 })
  did!: string;

  @Property({ type: 'varchar', length: 255, fieldName: 'walt_id_key_id' })
  waltIdKeyId!: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'revoked_at', nullable: true })
  revokedAt?: Date;
}
