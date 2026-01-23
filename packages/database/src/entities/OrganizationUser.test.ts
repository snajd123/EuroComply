import { describe, it, expect } from 'vitest';
import { OrganizationUser } from './OrganizationUser.js';
import { User } from './User.js';
import { WorkspaceAuthority } from './WorkspaceAuthority.js';

describe('OrganizationUser Entity', () => {
  it('can be instantiated', () => {
    const orgUser = new OrganizationUser();
    expect(orgUser).toBeInstanceOf(OrganizationUser);
  });

  it('has default authority of NONE for all workspaces', () => {
    const orgUser = new OrganizationUser();

    expect(orgUser.designAuthority).toBe(WorkspaceAuthority.NONE);
    expect(orgUser.operationsAuthority).toBe(WorkspaceAuthority.NONE);
    expect(orgUser.marketingAuthority).toBe(WorkspaceAuthority.NONE);
    expect(orgUser.complianceAuthority).toBe(WorkspaceAuthority.NONE);
  });

  it('has default isOrgAdmin of false', () => {
    const orgUser = new OrganizationUser();
    expect(orgUser.isOrgAdmin).toBe(false);
  });

  it('can set authorities to different levels', () => {
    const orgUser = new OrganizationUser();

    orgUser.designAuthority = WorkspaceAuthority.MANAGER;
    orgUser.operationsAuthority = WorkspaceAuthority.EDITOR;
    orgUser.marketingAuthority = WorkspaceAuthority.CONTRIBUTOR;
    orgUser.complianceAuthority = WorkspaceAuthority.VIEWER;

    expect(orgUser.designAuthority).toBe(WorkspaceAuthority.MANAGER);
    expect(orgUser.operationsAuthority).toBe(WorkspaceAuthority.EDITOR);
    expect(orgUser.marketingAuthority).toBe(WorkspaceAuthority.CONTRIBUTOR);
    expect(orgUser.complianceAuthority).toBe(WorkspaceAuthority.VIEWER);
  });

  it('can link to a User', () => {
    const user = new User();
    user.id = 'usr_123';
    user.clerkId = 'user_clerk456';
    user.email = 'test@example.com';

    const orgUser = new OrganizationUser();
    orgUser.user = user;

    expect(orgUser.user).toBe(user);
    expect(orgUser.user.email).toBe('test@example.com');
  });
});
