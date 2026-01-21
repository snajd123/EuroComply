import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { Organization } from './Organization.js';

@Entity({ tableName: 'org_did_history' })
export class OrgDidHistory {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 30, fieldName: 'organization_id' })
  @Index()
  organizationId!: string;

  @ManyToOne(() => Organization, { fieldName: 'organization_id', persist: false })
  organization!: Organization;

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
