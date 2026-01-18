import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DidService } from './did.service.js';

interface MockDependencies {
  waltIdClient: {
    createDid: Mock;
  };
  statusListService: {
    allocateIndex: Mock;
  };
  prisma: {
    organization: { update: Mock };
    orgDidHistory: { create: Mock; findFirst: Mock };
    userDidHistory: { create: Mock; findFirst: Mock };
  };
}

const mockDeps: MockDependencies = {
  waltIdClient: {
    createDid: vi.fn(),
  },
  statusListService: {
    allocateIndex: vi.fn(),
  },
  prisma: {
    organization: { update: vi.fn() },
    orgDidHistory: { create: vi.fn(), findFirst: vi.fn() },
    userDidHistory: { create: vi.fn(), findFirst: vi.fn() },
  },
};

describe('DidService', () => {
  let service: DidService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DidService(
      mockDeps.waltIdClient as any,
      mockDeps.statusListService as any,
      mockDeps.prisma as any
    );
  });

  describe('createOrganizationDid', () => {
    it('should create DID and store in organization and history', async () => {
      mockDeps.waltIdClient.createDid.mockResolvedValue({
        did: 'did:key:z6MkOrg123',
        keyId: 'key_org_123',
        didDocument: { id: 'did:key:z6MkOrg123' },
      });
      mockDeps.statusListService.allocateIndex.mockResolvedValue(0);
      mockDeps.prisma.organization.update.mockResolvedValue({});
      mockDeps.prisma.orgDidHistory.create.mockResolvedValue({});

      const result = await service.createOrganizationDid('org_123');

      expect(result.did).toBe('did:key:z6MkOrg123');
      expect(result.keyId).toBe('key_org_123');
      expect(mockDeps.waltIdClient.createDid).toHaveBeenCalledWith({
        method: 'key',
        keyAlgorithm: 'Ed25519',
      });
      expect(mockDeps.prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org_123' },
        data: {
          did: 'did:key:z6MkOrg123',
          waltIdKeyId: 'key_org_123',
        },
      });
      expect(mockDeps.prisma.orgDidHistory.create).toHaveBeenCalled();
    });
  });

  describe('createUserDid', () => {
    it('should create DID for user in organization context', async () => {
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue(null);
      mockDeps.waltIdClient.createDid.mockResolvedValue({
        did: 'did:key:z6MkUser456',
        keyId: 'key_user_456',
        didDocument: { id: 'did:key:z6MkUser456' },
      });
      mockDeps.statusListService.allocateIndex.mockResolvedValue(1);
      mockDeps.prisma.userDidHistory.create.mockResolvedValue({});

      const result = await service.createUserDid('user_456', 'org_123');

      expect(result.did).toBe('did:key:z6MkUser456');
      expect(result.keyId).toBe('key_user_456');
      expect(mockDeps.prisma.userDidHistory.create).toHaveBeenCalled();
    });

    it('should return existing DID if user already has one', async () => {
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkExisting',
        waltIdKeyId: 'key_existing',
      });

      const result = await service.createUserDid('user_456', 'org_123');

      expect(result.did).toBe('did:key:z6MkExisting');
      expect(mockDeps.waltIdClient.createDid).not.toHaveBeenCalled();
    });
  });

  describe('getOrganizationDid', () => {
    it('should return the current valid DID for an organization', async () => {
      mockDeps.prisma.orgDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkOrg789',
        waltIdKeyId: 'key_org_789',
      });

      const result = await service.getOrganizationDid('org_123');

      expect(result).toEqual({
        did: 'did:key:z6MkOrg789',
        keyId: 'key_org_789',
      });
    });

    it('should return null if organization has no DID', async () => {
      mockDeps.prisma.orgDidHistory.findFirst.mockResolvedValue(null);

      const result = await service.getOrganizationDid('org_123');

      expect(result).toBeNull();
    });
  });

  describe('getUserDid', () => {
    it('should return the current valid DID for a user', async () => {
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkUser789',
        waltIdKeyId: 'key_user_789',
      });

      const result = await service.getUserDid('user_456');

      expect(result).toEqual({
        did: 'did:key:z6MkUser789',
        keyId: 'key_user_789',
      });
    });

    it('should return null if user has no DID', async () => {
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue(null);

      const result = await service.getUserDid('user_456');

      expect(result).toBeNull();
    });
  });
});
