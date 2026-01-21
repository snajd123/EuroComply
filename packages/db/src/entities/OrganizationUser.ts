import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { User } from './User.js';

/**
 * OrganizationUser - links users to organizations (membership).
 *
 * Lives in TENANT schema. Each tenant has their own membership records.
 * References User (public.users) via userId.
 */
@Entity({ tableName: 'organization_users' })
@Index({ properties: ['userId', 'organizationId'] })
export class OrganizationUser {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @Property({ type: 'varchar', length: 30, fieldName: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { fieldName: 'user_id', persist: false })
  user!: User;

  @Property({ type: 'varchar', length: 30, fieldName: 'organization_id' })
  @Index()
  organizationId!: string;

  @Property({ type: 'varchar', length: 20, default: 'member' })
  role: string = 'member';

  @Property({ type: 'varchar', length: 20, fieldName: 'design_authority', default: 'VIEWER' })
  designAuthority: string = 'VIEWER';

  @Property({ type: 'varchar', length: 20, fieldName: 'operations_authority', default: 'VIEWER' })
  operationsAuthority: string = 'VIEWER';

  @Property({ type: 'varchar', length: 20, fieldName: 'marketing_authority', default: 'VIEWER' })
  marketingAuthority: string = 'VIEWER';

  @Property({ type: 'varchar', length: 20, fieldName: 'compliance_authority', default: 'VIEWER' })
  complianceAuthority: string = 'VIEWER';

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
