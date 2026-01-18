import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MembershipService } from './membership.service.js';

interface MockDependencies {
  didService: {
    createUserDid: Mock;
    getUserDid: Mock;
  };
  prisma: {
    user: { findUnique: Mock; create: Mock };
    organizationUser: { findFirst: Mock; create: Mock };
    organization: { findUnique: Mock };
    $transaction: Mock;
  };
}

const createMockPrisma = (): MockDependencies['prisma'] => {
  const prisma = {
    user: { findUnique: vi.fn(), create: vi.fn() },
    organizationUser: { findFirst: vi.fn(), create: vi.fn() },
    organization: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  // Make $transaction pass through the callback with the prisma itself
  prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
  return prisma;
};

describe('MembershipService', () => {
  let service: MembershipService;
  let mockDeps: MockDependencies;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeps = {
      didService: {
        createUserDid: vi.fn(),
        getUserDid: vi.fn(),
      },
      prisma: createMockPrisma(),
    };
    service = new MembershipService(
      mockDeps.didService as any,
      mockDeps.prisma as any
    );
  });

  describe('addUserToOrganization', () => {
    it('should add existing user to organization and create DID if needed', async () => {
      mockDeps.prisma.organization.findUnique.mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
      });
      mockDeps.prisma.user.findUnique.mockResolvedValue({
        id: 'user_456',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
      });
      mockDeps.prisma.organizationUser.findFirst.mockResolvedValue(null);
      mockDeps.prisma.organizationUser.create.mockResolvedValue({
        id: 'membership_1',
        userId: 'user_456',
        organizationId: 'org_123',
        role: 'member',
      });
      mockDeps.didService.getUserDid.mockResolvedValue(null);
      mockDeps.didService.createUserDid.mockResolvedValue({
        did: 'did:key:z6MkUser456',
        keyId: 'key_user_456',
      });

      const result = await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
        role: 'member',
      });

      expect(result.userId).toBe('user_456');
      expect(result.role).toBe('member');
      expect(mockDeps.didService.createUserDid).toHaveBeenCalledWith('user_456', 'org_123');
    });

    it('should create new user if not exists', async () => {
      mockDeps.prisma.organization.findUnique.mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
      });
      mockDeps.prisma.user.findUnique.mockResolvedValue(null);
      mockDeps.prisma.user.create.mockResolvedValue({
        id: 'user_new',
        clerkId: 'clerk_new',
        email: 'new@example.com',
      });
      mockDeps.prisma.organizationUser.findFirst.mockResolvedValue(null);
      mockDeps.prisma.organizationUser.create.mockResolvedValue({
        id: 'membership_2',
        userId: 'user_new',
        organizationId: 'org_123',
        role: 'member',
      });
      mockDeps.didService.getUserDid.mockResolvedValue(null);
      mockDeps.didService.createUserDid.mockResolvedValue({
        did: 'did:key:z6MkUserNew',
        keyId: 'key_user_new',
      });

      const result = await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_new',
        email: 'new@example.com',
        role: 'member',
      });

      expect(result.userId).toBe('user_new');
      expect(mockDeps.prisma.user.create).toHaveBeenCalled();
    });

    it('should not create DID if user already has one', async () => {
      mockDeps.prisma.organization.findUnique.mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
      });
      mockDeps.prisma.user.findUnique.mockResolvedValue({
        id: 'user_456',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
      });
      mockDeps.prisma.organizationUser.findFirst.mockResolvedValue(null);
      mockDeps.prisma.organizationUser.create.mockResolvedValue({
        id: 'membership_1',
        userId: 'user_456',
        organizationId: 'org_123',
        role: 'member',
      });
      mockDeps.didService.getUserDid.mockResolvedValue({
        did: 'did:key:z6MkExisting',
        keyId: 'key_existing',
      });

      await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
        role: 'member',
      });

      expect(mockDeps.didService.createUserDid).not.toHaveBeenCalled();
    });

    it('should throw if user is already a member', async () => {
      mockDeps.prisma.organization.findUnique.mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
      });
      mockDeps.prisma.user.findUnique.mockResolvedValue({
        id: 'user_456',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
      });
      mockDeps.prisma.organizationUser.findFirst.mockResolvedValue({
        id: 'existing_membership',
      });

      await expect(
        service.addUserToOrganization({
          organizationId: 'org_123',
          clerkId: 'clerk_abc',
          email: 'test@example.com',
          role: 'member',
        })
      ).rejects.toThrow('User is already a member');
    });
  });
});
