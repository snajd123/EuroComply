import { Entity, PrimaryKey, Property, Index, Unique } from '@mikro-orm/core';

/**
 * StatusListEntry tracks revocation status for credentials and DIDs.
 *
 * Lives in PUBLIC schema since it tracks status across organizations.
 * Used by the StatusList2021Service for W3C Status List 2021 revocation.
 */
@Entity({ tableName: 'status_list_entries', schema: 'public' })
@Unique({ properties: ['organizationId', 'statusIndex'] })
export class StatusListEntry {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 30, fieldName: 'organization_id' })
  @Index()
  organizationId!: string;

  @Property({ type: 'int', fieldName: 'status_index' })
  statusIndex!: number;

  @Property({ type: 'varchar', length: 50, fieldName: 'reference_type', nullable: true })
  referenceType?: string;

  @Property({ type: 'varchar', length: 30, fieldName: 'reference_id', nullable: true })
  referenceId?: string;

  @Property({ type: 'timestamptz', fieldName: 'revoked_at' })
  revokedAt!: Date;

  @Property({ type: 'varchar', length: 500, nullable: true })
  reason?: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();
}
