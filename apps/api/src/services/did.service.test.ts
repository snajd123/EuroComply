import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DidService } from './did.service.js';

// Mock EntityManager
interface MockEntityManager {
  findOne: Mock;
  create: Mock;
  flush: Mock;
}

interface MockDependencies {
  waltIdClient: {
    createDid: Mock;
  };
  statusListService: {
    allocateIndex: Mock;
  };
  em: MockEntityManager;
}

const mockDeps: MockDependencies = {
  waltIdClient: {
    createDid: vi.fn(),
  },
  statusListService: {
    allocateIndex: vi.fn(),
  },
  em: {
    findOne: vi.fn(),
    create: vi.fn(),
    flush: vi.fn(),
  },
};

describe('DidService', () => {
  let service: DidService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DidService(
      mockDeps.waltIdClient as unknown as ConstructorParameters<typeof DidService>[0],
      mockDeps.statusListService as unknown as ConstructorParameters<typeof DidService>[1],
      mockDeps.em as unknown as ConstructorParameters<typeof DidService>[2]
    );
  });

  /**
   * Helper to setup mock responses for em.findOne based on entity type
   */
  function setupFindOneMock(responses: {
    organization?: { id: string; did?: string; waltIdKeyId?: string } | null;
    orgDidHistory?: { did: string; waltIdKeyId: string } | null;
    userDidHistory?: { did: string; waltIdKeyId: string } | null;
  }) {
    mockDeps.em.findOne.mockImplementation((Entity: unknown) => {
      const entityName = (Entity as { name?: string })?.name;
      if (entityName === 'Organization') {
        return Promise.resolve(responses.organization);
      }
      if (entityName === 'OrgDidHistory') {
        return Promise.resolve(responses.orgDidHistory);
      }
      if (entityName === 'UserDidHistory') {
        return Promise.resolve(responses.userDidHistory);
      }
      return Promise.resolve(null);
    });
  }

  describe('createOrganizationDid', () => {
    it('should create DID and store in organization and history', async () => {
      const mockOrg = { id: 'org_123', did: undefined, waltIdKeyId: undefined };
      setupFindOneMock({
        organization: mockOrg,
      });
      mockDeps.waltIdClient.createDid.mockResolvedValue({
        did: 'did:key:z6MkOrg123',
        keyId: 'key_org_123',
        didDocument: { id: 'did:key:z6MkOrg123' },
      });
      mockDeps.statusListService.allocateIndex.mockResolvedValue(0);
      mockDeps.em.create.mockImplementation((_, data) => data);
      mockDeps.em.flush.mockResolvedValue(undefined);

      const result = await service.createOrganizationDid('org_123');

      expect(result.did).toBe('did:key:z6MkOrg123');
      expect(result.keyId).toBe('key_org_123');
      expect(mockDeps.waltIdClient.createDid).toHaveBeenCalledWith({
        method: 'key',
        keyAlgorithm: 'Ed25519',
      });
      // Organization should be updated
      expect(mockOrg.did).toBe('did:key:z6MkOrg123');
      expect(mockOrg.waltIdKeyId).toBe('key_org_123');
      // OrgDidHistory should be created
      expect(mockDeps.em.create).toHaveBeenCalled();
      expect(mockDeps.em.flush).toHaveBeenCalled();
    });
  });

  describe('createUserDid', () => {
    it('should create DID for user in organization context', async () => {
      setupFindOneMock({
        userDidHistory: null,
      });
      mockDeps.waltIdClient.createDid.mockResolvedValue({
        did: 'did:key:z6MkUser456',
        keyId: 'key_user_456',
        didDocument: { id: 'did:key:z6MkUser456' },
      });
      mockDeps.statusListService.allocateIndex.mockResolvedValue(1);
      mockDeps.em.create.mockImplementation((_, data) => data);
      mockDeps.em.flush.mockResolvedValue(undefined);

      const result = await service.createUserDid('user_456', 'org_123');

      expect(result.did).toBe('did:key:z6MkUser456');
      expect(result.keyId).toBe('key_user_456');
      expect(mockDeps.em.create).toHaveBeenCalled();
      expect(mockDeps.em.flush).toHaveBeenCalled();
    });

    it('should return existing DID if user already has one', async () => {
      setupFindOneMock({
        userDidHistory: {
          did: 'did:key:z6MkExisting',
          waltIdKeyId: 'key_existing',
        },
      });

      const result = await service.createUserDid('user_456', 'org_123');

      expect(result.did).toBe('did:key:z6MkExisting');
      expect(mockDeps.waltIdClient.createDid).not.toHaveBeenCalled();
    });
  });

  describe('getOrganizationDid', () => {
    it('should return the current valid DID for an organization', async () => {
      setupFindOneMock({
        orgDidHistory: {
          did: 'did:key:z6MkOrg789',
          waltIdKeyId: 'key_org_789',
        },
      });

      const result = await service.getOrganizationDid('org_123');

      expect(result).toEqual({
        did: 'did:key:z6MkOrg789',
        keyId: 'key_org_789',
      });
    });

    it('should return null if organization has no DID', async () => {
      setupFindOneMock({
        orgDidHistory: null,
      });

      const result = await service.getOrganizationDid('org_123');

      expect(result).toBeNull();
    });
  });

  describe('getUserDid', () => {
    it('should return the current valid DID for a user', async () => {
      setupFindOneMock({
        userDidHistory: {
          did: 'did:key:z6MkUser789',
          waltIdKeyId: 'key_user_789',
        },
      });

      const result = await service.getUserDid('user_456');

      expect(result).toEqual({
        did: 'did:key:z6MkUser789',
        keyId: 'key_user_789',
      });
    });

    it('should return null if user has no DID', async () => {
      setupFindOneMock({
        userDidHistory: null,
      });

      const result = await service.getUserDid('user_456');

      expect(result).toBeNull();
    });
  });
});
