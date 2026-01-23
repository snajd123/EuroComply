import { Entity, Property, OneToOne, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { User } from './User.js';
import { WorkspaceAuthority } from './WorkspaceAuthority.js';

@Entity({ tableName: 'organization_users' })
export class OrganizationUser extends BaseEntity {
  @OneToOne(() => User, (user) => user.membership, { name: 'user_id', owner: true })
  user!: User;

  @Property({ type: 'boolean', name: 'is_org_admin', default: false })
  isOrgAdmin: boolean = false;

  @Enum({ items: () => WorkspaceAuthority, name: 'design_authority', default: WorkspaceAuthority.NONE })
  designAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  @Enum({ items: () => WorkspaceAuthority, name: 'operations_authority', default: WorkspaceAuthority.NONE })
  operationsAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  @Enum({ items: () => WorkspaceAuthority, name: 'marketing_authority', default: WorkspaceAuthority.NONE })
  marketingAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  @Enum({ items: () => WorkspaceAuthority, name: 'compliance_authority', default: WorkspaceAuthority.NONE })
  complianceAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;
}
