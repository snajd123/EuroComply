import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'org_did_history' })
export class OrgDidHistory {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 255 })
  did!: string;

  @Property({ type: 'varchar', length: 255, fieldName: 'walt_id_key_id' })
  waltIdKeyId!: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'revoked_at', nullable: true })
  revokedAt?: Date;
}
