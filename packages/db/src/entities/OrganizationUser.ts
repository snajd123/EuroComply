import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { User } from './User.js';

@Entity({ tableName: 'organization_users' })
export class OrganizationUser {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  @ManyToOne(() => User, { fieldName: 'user_id' })
  user!: User;

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
