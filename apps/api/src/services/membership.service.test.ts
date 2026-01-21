import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MembershipService } from './membership.service.js';
import { EntityManager } from '@mikro-orm/postgresql';
import { MikroOrm } from '@eurocomply/db';

const { User, Organization, OrganizationUser } = MikroOrm;

interface MockDependencies {
  didService: {
    createUserDid: Mock;
    getUserDid: Mock;
  };
  em: EntityManager;
}

const createMockEm = (): EntityManager => {
  const em = {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    persist: vi.fn(),
    flush: vi.fn(),
    transactional: vi.fn(),
  } as unknown as EntityManager;

  // Make transactional pass through the callback with the same em
  (em.transactional as Mock).mockImplementation(async (cb: (em: EntityManager) => Promise<unknown>) => cb(em));

  return em;
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
      em: createMockEm(),
    };
    service = new MembershipService(
      mockDeps.didService as unknown as ConstructorParameters<typeof MembershipService>[0],
      mockDeps.em
    );
  });

  describe('constructor', () => {
    it('should accept EntityManager instead of PrismaClient', () => {
      expect(service).toBeInstanceOf(MembershipService);
    });
  });

  describe('addUserToOrganization', () => {
    it('should use em.findOne for organization lookup', async () => {
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({
        id: 'org_123',
        name: 'Test Org',
      });
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({
        id: 'user_456',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
      });
      (mockDeps.em.find as Mock).mockResolvedValue([]);
      mockDeps.didService.getUserDid.mockResolvedValue(null);
      mockDeps.didService.createUserDid.mockResolvedValue({
        did: 'did:key:z6MkUser456',
        keyId: 'key_user_456',
      });

      await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
        role: 'member',
      });

      // First findOne should be for Organization
      expect(mockDeps.em.findOne).toHaveBeenCalledWith(
        Organization,
        { id: 'org_123' }
      );
    });

    it('should use em.findOne for user lookup by clerkId', async () => {
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'org_123' });
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({
        id: 'user_456',
        clerkId: 'clerk_abc',
      });
      (mockDeps.em.find as Mock).mockResolvedValue([]);
      mockDeps.didService.getUserDid.mockResolvedValue({ did: 'did:key:existing' });

      await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
        role: 'member',
      });

      // Second findOne should be for User
      expect(mockDeps.em.findOne).toHaveBeenCalledWith(
        User,
        { clerkId: 'clerk_abc' }
      );
    });

    it('should use em.find for checking existing membership', async () => {
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'org_123' });
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'user_456' });
      (mockDeps.em.find as Mock).mockResolvedValue([]);
      mockDeps.didService.getUserDid.mockResolvedValue({ did: 'did:key:existing' });

      await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
        role: 'member',
      });

      expect(mockDeps.em.find).toHaveBeenCalledWith(
        OrganizationUser,
        { userId: 'user_456', organizationId: 'org_123' },
        { limit: 1 }
      );
    });

    it('should use em.create and em.persist for new user', async () => {
      const newUser = { id: 'user_new', clerkId: 'clerk_new', email: 'new@example.com' };

      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'org_123' });
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce(null); // User not found
      (mockDeps.em.create as Mock).mockReturnValueOnce(newUser);
      (mockDeps.em.find as Mock).mockResolvedValue([]);
      mockDeps.didService.getUserDid.mockResolvedValue(null);
      mockDeps.didService.createUserDid.mockResolvedValue({ did: 'did:key:new' });

      await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_new',
        email: 'new@example.com',
        role: 'member',
      });

      expect(mockDeps.em.create).toHaveBeenCalledWith(
        User,
        expect.objectContaining({
          clerkId: 'clerk_new',
          email: 'new@example.com',
        })
      );
      expect(mockDeps.em.persist).toHaveBeenCalled();
    });

    it('should use em.create for organization membership', async () => {
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'org_123' });
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'user_456' });
      (mockDeps.em.find as Mock).mockResolvedValue([]);
      mockDeps.didService.getUserDid.mockResolvedValue({ did: 'did:key:existing' });

      await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
        role: 'admin',
      });

      expect(mockDeps.em.create).toHaveBeenCalledWith(
        OrganizationUser,
        expect.objectContaining({
          userId: 'user_456',
          organizationId: 'org_123',
          role: 'admin',
          designAuthority: 'VIEWER',
          operationsAuthority: 'VIEWER',
          marketingAuthority: 'VIEWER',
          complianceAuthority: 'VIEWER',
        })
      );
    });

    it('should use em.transactional for atomic operations', async () => {
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'org_123' });
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'user_456' });
      (mockDeps.em.find as Mock).mockResolvedValue([]);
      mockDeps.didService.getUserDid.mockResolvedValue({ did: 'did:key:existing' });

      await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
        role: 'member',
      });

      expect(mockDeps.em.transactional).toHaveBeenCalled();
    });

    it('should call em.flush after creating membership', async () => {
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'org_123' });
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'user_456' });
      (mockDeps.em.find as Mock).mockResolvedValue([]);
      mockDeps.didService.getUserDid.mockResolvedValue({ did: 'did:key:existing' });

      await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
        role: 'member',
      });

      expect(mockDeps.em.flush).toHaveBeenCalled();
    });

    it('should throw NotFoundError if organization does not exist', async () => {
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce(null);

      await expect(
        service.addUserToOrganization({
          organizationId: 'org_nonexistent',
          clerkId: 'clerk_abc',
          email: 'test@example.com',
          role: 'member',
        })
      ).rejects.toThrow('Organization');
    });

    it('should throw ConflictError if user is already a member', async () => {
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'org_123' });
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'user_456' });
      (mockDeps.em.find as Mock).mockResolvedValue([{ id: 'existing_membership' }]);

      await expect(
        service.addUserToOrganization({
          organizationId: 'org_123',
          clerkId: 'clerk_abc',
          email: 'test@example.com',
          role: 'member',
        })
      ).rejects.toThrow('already a member');
    });

    it('should create DID if user does not have one', async () => {
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'org_123' });
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'user_456' });
      (mockDeps.em.find as Mock).mockResolvedValue([]);
      mockDeps.didService.getUserDid.mockResolvedValue(null);
      mockDeps.didService.createUserDid.mockResolvedValue({
        did: 'did:key:z6MkNew',
        keyId: 'key_new',
      });

      const result = await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
        role: 'member',
      });

      expect(mockDeps.didService.createUserDid).toHaveBeenCalledWith('user_456', 'org_123');
      expect(result.did).toBe('did:key:z6MkNew');
    });

    it('should not create DID if user already has one', async () => {
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'org_123' });
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'user_456' });
      (mockDeps.em.find as Mock).mockResolvedValue([]);
      mockDeps.didService.getUserDid.mockResolvedValue({
        did: 'did:key:z6MkExisting',
        keyId: 'key_existing',
      });

      const result = await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
        role: 'member',
      });

      expect(mockDeps.didService.createUserDid).not.toHaveBeenCalled();
      expect(result.did).toBe('did:key:z6MkExisting');
    });

    it('should return membership result with userId, role, and did', async () => {
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'org_123' });
      (mockDeps.em.findOne as Mock).mockResolvedValueOnce({ id: 'user_456' });
      (mockDeps.em.find as Mock).mockResolvedValue([]);
      mockDeps.didService.getUserDid.mockResolvedValue({ did: 'did:key:z6MkExisting' });

      const result = await service.addUserToOrganization({
        organizationId: 'org_123',
        clerkId: 'clerk_abc',
        email: 'test@example.com',
        role: 'admin',
      });

      expect(result).toEqual({
        userId: 'user_456',
        organizationId: 'org_123',
        role: 'admin',
        did: 'did:key:z6MkExisting',
      });
    });
  });
});
