import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { User } from './User.js';

@Entity({ tableName: 'user_did_history' })
export class UserDidHistory {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 30, fieldName: 'user_id' })
  @Index()
  userId!: string;

  @ManyToOne(() => User, { fieldName: 'user_id', persist: false })
  user!: User;

  @Property({ type: 'varchar', length: 255 })
  @Index()
  did!: string;

  @Property({ type: 'varchar', length: 255, fieldName: 'walt_id_key_id' })
  waltIdKeyId!: string;

  @Property({ type: 'timestamptz', fieldName: 'valid_from' })
  validFrom!: Date;

  @Property({ type: 'timestamptz', fieldName: 'valid_to', nullable: true })
  validTo?: Date;

  @Property({ type: 'timestamptz', fieldName: 'revoked_at', nullable: true })
  revokedAt?: Date;

  @Property({ type: 'varchar', length: 500, fieldName: 'revocation_reason', nullable: true })
  revocationReason?: string;

  @Property({ type: 'int', fieldName: 'status_list_index' })
  statusListIndex!: number;
}
