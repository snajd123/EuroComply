// apps/api/src/webhooks/clerk-membership.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleMembershipCreated,
  handleMembershipDeleted,
  handleUserUpdated,
  ClerkOrganizationMembershipEvent,
  ClerkUserUpdatedEvent,
} from './clerk.js';
import { ProvisioningStatus, WorkspaceAuthority } from '@eurocomply/database';

describe('handleMembershipCreated', () => {
  // Mock for shared schema lookup (first fork without options)
  const mockSharedEm = {
    findOne: vi.fn(),
  };

  // Mock for tenant schema with transaction support
  const mockTenantEm = {
    findOne: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    persist: vi.fn(),
    transactional: vi.fn(),
  };

  const mockOrm = {
    em: {
      fork: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // First fork() call (no options) returns sharedEm for org lookup
    // Second fork() call (with schema option) returns tenantEm for user creation
    mockOrm.em.fork.mockImplementation((options?: { schema?: string }) => {
      if (options?.schema) {
        return mockTenantEm;
      }
      return mockSharedEm;
    });
    // Default: transactional executes the callback with the same em
    mockTenantEm.transactional.mockImplementation(async (callback: any) => {
      return callback(mockTenantEm);
    });
  });

  const createEvent = (overrides = {}): ClerkOrganizationMembershipEvent => ({
    type: 'organizationMembership.created',
    data: {
      id: 'mem_123',
      organization: { id: 'org_clerk456' },
      public_user_data: {
        user_id: 'user_clerk789',
        identifier: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        image_url: 'https://example.com/avatar.png',
      },
      role: 'org:member',
      created_at: Date.now(),
      ...overrides,
    },
  });

  it('throws error when organization not found', async () => {
    mockSharedEm.findOne.mockResolvedValue(null);

    const event = createEvent();

    await expect(handleMembershipCreated(mockOrm as any, event))
      .rejects.toThrow('Organization not found');
  });

  it('throws RetryableError when org not yet provisioned', async () => {
    mockSharedEm.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
      provisioningStatus: ProvisioningStatus.PROVISIONING,
    });

    const event = createEvent();

    await expect(handleMembershipCreated(mockOrm as any, event))
      .rejects.toThrow('not yet provisioned');
  });

  it('returns already_exists when user exists', async () => {
    mockSharedEm.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
      provisioningStatus: ProvisioningStatus.READY,
    });
    mockTenantEm.findOne.mockResolvedValue({ id: 'existing_user' });

    const event = createEvent();
    const result = await handleMembershipCreated(mockOrm as any, event);

    expect(result.status).toBe('already_exists');
  });

  it('creates first user with MANAGER + isOrgAdmin', async () => {
    mockSharedEm.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
      provisioningStatus: ProvisioningStatus.READY,
    });
    mockTenantEm.findOne.mockResolvedValue(null);
    mockTenantEm.count.mockResolvedValue(0); // First user
    mockTenantEm.create.mockImplementation((_, data) => data);

    const event = createEvent();
    const result = await handleMembershipCreated(mockOrm as any, event);

    expect(result.status).toBe('created');
    expect(mockTenantEm.create).toHaveBeenCalledTimes(3); // User + OrganizationUser + OutboxEvent

    // Check OrganizationUser was created with MANAGER
    const orgUserCall = mockTenantEm.create.mock.calls.find(
      (call: any) => call[1]?.designAuthority !== undefined
    );
    expect(orgUserCall[1].isOrgAdmin).toBe(true);
    expect(orgUserCall[1].designAuthority).toBe(WorkspaceAuthority.MANAGER);
  });

  it('creates subsequent user with NONE + not admin', async () => {
    mockSharedEm.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
      provisioningStatus: ProvisioningStatus.READY,
    });
    mockTenantEm.findOne.mockResolvedValue(null);
    mockTenantEm.count.mockResolvedValue(5); // Not first user
    mockTenantEm.create.mockImplementation((_, data) => data);

    const event = createEvent();
    const result = await handleMembershipCreated(mockOrm as any, event);

    expect(result.status).toBe('created');

    // Check OrganizationUser was created with NONE
    const orgUserCall = mockTenantEm.create.mock.calls.find(
      (call: any) => call[1]?.designAuthority !== undefined
    );
    expect(orgUserCall[1].isOrgAdmin).toBe(false);
    expect(orgUserCall[1].designAuthority).toBe(WorkspaceAuthority.NONE);
  });

  it('grants isOrgAdmin to Clerk org:admin role', async () => {
    mockSharedEm.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
      provisioningStatus: ProvisioningStatus.READY,
    });
    mockTenantEm.findOne.mockResolvedValue(null);
    mockTenantEm.count.mockResolvedValue(5); // Not first user
    mockTenantEm.create.mockImplementation((_, data) => data);

    const event = createEvent();
    event.data.role = 'org:admin';

    const result = await handleMembershipCreated(mockOrm as any, event);

    expect(result.status).toBe('created');

    // Check isOrgAdmin is true for org:admin role
    const orgUserCall = mockTenantEm.create.mock.calls.find(
      (call: any) => call[1]?.isOrgAdmin !== undefined
    );
    expect(orgUserCall[1].isOrgAdmin).toBe(true);
  });
});

describe('handleMembershipDeleted', () => {
  // Mock for shared schema lookup (first fork without options)
  const mockSharedEm = {
    findOne: vi.fn(),
  };

  const mockTenantEm = {
    nativeUpdate: vi.fn(),
    create: vi.fn(),
    persist: vi.fn(),
    transactional: vi.fn(),
  };

  const mockOrm = {
    em: {
      fork: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrm.em.fork.mockImplementation((options?: { schema?: string }) => {
      if (options?.schema) {
        return mockTenantEm;
      }
      return mockSharedEm;
    });
    // Default: transactional executes the callback with the same em
    mockTenantEm.transactional.mockImplementation(async (callback: any) => {
      return callback(mockTenantEm);
    });
  });

  const createDeleteEvent = (): ClerkOrganizationMembershipEvent => ({
    type: 'organizationMembership.deleted',
    data: {
      id: 'mem_123',
      organization: { id: 'org_clerk456' },
      public_user_data: {
        user_id: 'user_clerk789',
        identifier: 'test@example.com',
      },
      role: 'org:member',
      created_at: Date.now(),
    },
  });

  it('returns org_not_found when organization not found', async () => {
    mockSharedEm.findOne.mockResolvedValue(null);

    const event = createDeleteEvent();
    const result = await handleMembershipDeleted(mockOrm as any, event);

    expect(result.status).toBe('org_not_found');
  });

  it('returns user_not_found when user not found', async () => {
    mockSharedEm.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
    });
    mockTenantEm.nativeUpdate.mockResolvedValue(0);

    const event = createDeleteEvent();
    const result = await handleMembershipDeleted(mockOrm as any, event);

    expect(result.status).toBe('user_not_found');
  });

  it('soft deletes user by setting deletedAt and creates outbox event', async () => {
    mockSharedEm.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
    });
    mockTenantEm.nativeUpdate.mockResolvedValue(1);
    mockTenantEm.create.mockImplementation((_, data) => data);

    const event = createDeleteEvent();
    const result = await handleMembershipDeleted(mockOrm as any, event);

    expect(result.status).toBe('soft_deleted');
    expect(mockTenantEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { clerkId: 'user_clerk789', deletedAt: null },
      expect.objectContaining({ deletedAt: expect.any(Date) })
    );

    // Verify outbox event was created
    expect(mockTenantEm.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        aggregateType: 'User',
        aggregateId: 'user_clerk789',
        eventType: 'user.left_organization',
        payload: expect.objectContaining({
          clerkUserId: 'user_clerk789',
          organizationId: 'org_123',
          clerkOrgId: 'org_clerk456',
        }),
      })
    );
    expect(mockTenantEm.persist).toHaveBeenCalled();
  });
});

describe('handleUserUpdated', () => {
  const mockEm = {
    create: vi.fn(),
    persist: vi.fn(),
    flush: vi.fn(),
  };

  const mockOrm = {
    em: {
      fork: vi.fn(() => mockEm),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEm.create.mockImplementation((_, data) => data);
    mockEm.flush.mockResolvedValue(undefined);
  });

  const createUserUpdatedEvent = (
    orgMemberships: Array<{ organization: { id: string } }> = []
  ): ClerkUserUpdatedEvent => ({
    type: 'user.updated',
    data: {
      id: 'user_clerk123',
      email_addresses: [
        { id: 'email_1', email_address: 'old@example.com' },
        { id: 'email_2', email_address: 'new@example.com' },
      ],
      primary_email_address_id: 'email_2',
      first_name: 'Updated',
      last_name: 'Name',
      image_url: 'https://example.com/new-avatar.png',
      organization_memberships: orgMemberships,
    },
  });

  it('returns count 0 when user has no organization memberships', async () => {
    const event = createUserUpdatedEvent([]);

    const result = await handleUserUpdated(mockOrm as any, event);

    expect(result.status).toBe('queued');
    expect(result.count).toBe(0);
    expect(mockEm.create).not.toHaveBeenCalled();
    expect(mockEm.flush).toHaveBeenCalled();
  });

  it('creates one outbox event per organization membership', async () => {
    const event = createUserUpdatedEvent([
      { organization: { id: 'org_1' } },
      { organization: { id: 'org_2' } },
      { organization: { id: 'org_3' } },
    ]);

    const result = await handleUserUpdated(mockOrm as any, event);

    expect(result.status).toBe('queued');
    expect(result.count).toBe(3);
    expect(mockEm.create).toHaveBeenCalledTimes(3);
    expect(mockEm.persist).toHaveBeenCalledTimes(3);
  });

  it('uses primary email address from email_addresses array', async () => {
    const event = createUserUpdatedEvent([{ organization: { id: 'org_1' } }]);

    await handleUserUpdated(mockOrm as any, event);

    expect(mockEm.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({
          email: 'new@example.com', // email_2 is primary
        }),
      })
    );
  });

  it('includes correct payload fields in outbox event', async () => {
    const event = createUserUpdatedEvent([{ organization: { id: 'org_abc' } }]);

    await handleUserUpdated(mockOrm as any, event);

    expect(mockEm.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        aggregateType: 'User',
        aggregateId: 'user_clerk123',
        eventType: 'user.profile_sync_requested',
        payload: {
          clerkUserId: 'user_clerk123',
          clerkOrgId: 'org_abc',
          email: 'new@example.com',
          name: 'Updated Name',
          avatarUrl: 'https://example.com/new-avatar.png',
        },
        status: 'PENDING',
      })
    );
  });

  it('handles missing name fields gracefully', async () => {
    const event: ClerkUserUpdatedEvent = {
      type: 'user.updated',
      data: {
        id: 'user_clerk123',
        email_addresses: [{ id: 'email_1', email_address: 'test@example.com' }],
        primary_email_address_id: 'email_1',
        first_name: undefined,
        last_name: undefined,
        image_url: undefined,
        organization_memberships: [{ organization: { id: 'org_1' } }],
      },
    };

    await handleUserUpdated(mockOrm as any, event);

    expect(mockEm.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({
          name: undefined,
          avatarUrl: undefined,
        }),
      })
    );
  });
});
