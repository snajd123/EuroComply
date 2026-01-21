import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { SealedArtifactService } from './sealed-artifact.service.js';

// Mock EntityManager
interface MockEntityManager {
  findOne: Mock;
}

interface MockDependencies {
  waltIdClient: {
    sign: Mock;
  };
  timestampService: {
    createTimestamp: Mock;
  };
  statusListService: {
    allocateIndex: Mock;
    getCredentialStatus: Mock;
  };
  em: MockEntityManager;
}

const mockDeps: MockDependencies = {
  waltIdClient: {
    sign: vi.fn(),
  },
  timestampService: {
    createTimestamp: vi.fn(),
  },
  statusListService: {
    allocateIndex: vi.fn(),
    getCredentialStatus: vi.fn(),
  },
  em: {
    findOne: vi.fn(),
  },
};

describe('SealedArtifactService', () => {
  let service: SealedArtifactService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SealedArtifactService(
      mockDeps.waltIdClient as unknown as ConstructorParameters<typeof SealedArtifactService>[0],
      mockDeps.timestampService as unknown as ConstructorParameters<typeof SealedArtifactService>[1],
      mockDeps.statusListService as unknown as ConstructorParameters<typeof SealedArtifactService>[2],
      mockDeps.em as unknown as ConstructorParameters<typeof SealedArtifactService>[3]
    );
  });

  /**
   * Helper to setup mock responses for em.findOne based on entity type
   */
  function setupFindOneMock(responses: {
    userDid?: { did: string; waltIdKeyId: string } | null;
    orgDid?: { did: string; waltIdKeyId: string } | null;
    organization?: { id: string; name: string; did: string } | null;
  }) {
    mockDeps.em.findOne.mockImplementation((Entity: unknown, filter: unknown) => {
      const entityName = (Entity as { name?: string })?.name;
      if (entityName === 'UserDidHistory') {
        return Promise.resolve(responses.userDid);
      }
      if (entityName === 'OrgDidHistory') {
        return Promise.resolve(responses.orgDid);
      }
      if (entityName === 'Organization') {
        return Promise.resolve(responses.organization);
      }
      return Promise.resolve(null);
    });
  }

  describe('createSealedArtifact', () => {
    it('should create complete sealed artifact with all proofs', async () => {
      // Setup mocks
      setupFindOneMock({
        userDid: {
          did: 'did:key:z6MkUser123',
          waltIdKeyId: 'key_user_123',
        },
        orgDid: {
          did: 'did:key:z6MkOrg456',
          waltIdKeyId: 'key_org_456',
        },
        organization: {
          id: 'org_123',
          name: 'Test Org',
          did: 'did:key:z6MkOrg456',
        },
      });

      mockDeps.waltIdClient.sign
        .mockResolvedValueOnce({
          jws: 'user-signature-jws',
          verificationMethod: 'did:key:z6MkUser123#z6MkUser123',
          created: '2026-01-18T10:00:00Z',
        })
        .mockResolvedValueOnce({
          jws: 'org-signature-jws',
          verificationMethod: 'did:key:z6MkOrg456#z6MkOrg456',
          created: '2026-01-18T10:00:01Z',
        });
      mockDeps.statusListService.allocateIndex.mockResolvedValue(42);
      mockDeps.statusListService.getCredentialStatus.mockResolvedValue({
        type: 'StatusList2021Entry',
        statusPurpose: 'revocation',
        statusListIndex: '42',
        statusListCredential: 'https://api.eurocomply.eu/organizations/org_123/status-list',
      });
      mockDeps.timestampService.createTimestamp.mockResolvedValue({
        type: 'RFC3161',
        timestamp: '2026-01-18T10:00:05Z',
        authority: 'https://freetsa.org/tsr',
        token: 'base64-timestamp-token',
        hashAlgorithm: 'SHA-256',
      });

      const result = await service.createSealedArtifact({
        organizationId: 'org_123',
        userId: 'user_456',
        payload: {
          type: 'ProductVersionRelease',
          productId: 'prod_789',
          data: { name: 'Test Product' },
        },
        userContext: {
          name: 'Maria Santos',
          email: 'maria@test.com',
          role: 'EDITOR',
          workspaceAuthority: 'DESIGN:EDITOR',
        },
      });

      // Verify structure
      expect(result.payload['type']).toBe('ProductVersionRelease');
      expect(result.userProof.type).toBe('Ed25519Signature2020');
      expect(result.userProof.signatureValue).toBe('user-signature-jws');
      expect(result.userProof.forensicContext.signerName).toBe('Maria Santos');
      expect(result.corporateProof.type).toBe('Ed25519Signature2020');
      expect(result.corporateProof.signatureValue).toBe('org-signature-jws');
      expect(result.credentialStatus?.statusListIndex).toBe('42');
      expect(result.timestampProof?.type).toBe('RFC3161');

      // Verify em.findOne was called correctly
      expect(mockDeps.em.findOne).toHaveBeenCalledTimes(3);
    });

    it('should create artifact without timestamp if TSA fails and not required', async () => {
      setupFindOneMock({
        userDid: {
          did: 'did:key:z6MkUser123',
          waltIdKeyId: 'key_user_123',
        },
        orgDid: {
          did: 'did:key:z6MkOrg456',
          waltIdKeyId: 'key_org_456',
        },
        organization: {
          id: 'org_123',
          name: 'Test Org',
          did: 'did:key:z6MkOrg456',
        },
      });

      mockDeps.waltIdClient.sign
        .mockResolvedValueOnce({
          jws: 'user-jws',
          verificationMethod: 'did:key:z6MkUser123#z6MkUser123',
          created: '2026-01-18T10:00:00Z',
        })
        .mockResolvedValueOnce({
          jws: 'org-jws',
          verificationMethod: 'did:key:z6MkOrg456#z6MkOrg456',
          created: '2026-01-18T10:00:01Z',
        });
      mockDeps.statusListService.allocateIndex.mockResolvedValue(1);
      mockDeps.statusListService.getCredentialStatus.mockResolvedValue({
        type: 'StatusList2021Entry',
        statusPurpose: 'revocation',
        statusListIndex: '1',
        statusListCredential: 'https://example.com/status',
      });
      mockDeps.timestampService.createTimestamp.mockRejectedValue(
        new Error('TSA unavailable')
      );

      const result = await service.createSealedArtifact({
        organizationId: 'org_123',
        userId: 'user_456',
        payload: { type: 'Test' },
        userContext: {
          name: 'Test User',
          email: 'test@test.com',
          role: 'EDITOR',
          workspaceAuthority: 'DESIGN:EDITOR',
        },
        requireTimestamp: false,
      });

      expect(result.userProof).toBeDefined();
      expect(result.corporateProof).toBeDefined();
      expect(result.timestampProof).toBeUndefined();
    });

    it('should throw if timestamp required but TSA fails', async () => {
      setupFindOneMock({
        userDid: {
          did: 'did:key:z6MkUser123',
          waltIdKeyId: 'key_user_123',
        },
        orgDid: {
          did: 'did:key:z6MkOrg456',
          waltIdKeyId: 'key_org_456',
        },
        organization: {
          id: 'org_123',
          name: 'Test Org',
          did: 'did:key:z6MkOrg456',
        },
      });

      mockDeps.waltIdClient.sign
        .mockResolvedValueOnce({
          jws: 'user-jws',
          verificationMethod: 'did:key:z6MkUser123#z6MkUser123',
          created: '2026-01-18T10:00:00Z',
        })
        .mockResolvedValueOnce({
          jws: 'org-jws',
          verificationMethod: 'did:key:z6MkOrg456#z6MkOrg456',
          created: '2026-01-18T10:00:01Z',
        });
      mockDeps.statusListService.allocateIndex.mockResolvedValue(1);
      mockDeps.statusListService.getCredentialStatus.mockResolvedValue({
        type: 'StatusList2021Entry',
        statusPurpose: 'revocation',
        statusListIndex: '1',
        statusListCredential: 'https://example.com/status',
      });
      mockDeps.timestampService.createTimestamp.mockRejectedValue(
        new Error('TSA unavailable')
      );

      await expect(
        service.createSealedArtifact({
          organizationId: 'org_123',
          userId: 'user_456',
          payload: { type: 'Test' },
          userContext: {
            name: 'Test User',
            email: 'test@test.com',
            role: 'EDITOR',
            workspaceAuthority: 'DESIGN:EDITOR',
          },
          requireTimestamp: true,
        })
      ).rejects.toThrow('TSA unavailable');
    });

    it('should throw NotFoundError if user DID not found', async () => {
      setupFindOneMock({
        userDid: null,
        orgDid: null,
        organization: null,
      });

      await expect(
        service.createSealedArtifact({
          organizationId: 'org_123',
          userId: 'user_456',
          payload: { type: 'Test' },
          userContext: {
            name: 'Test User',
            email: 'test@test.com',
            role: 'EDITOR',
            workspaceAuthority: 'DESIGN:EDITOR',
          },
        })
      ).rejects.toThrow('User DID');
    });

    it('should throw NotFoundError if org DID not found', async () => {
      setupFindOneMock({
        userDid: {
          did: 'did:key:z6MkUser123',
          waltIdKeyId: 'key_user_123',
        },
        orgDid: null,
        organization: null,
      });

      await expect(
        service.createSealedArtifact({
          organizationId: 'org_123',
          userId: 'user_456',
          payload: { type: 'Test' },
          userContext: {
            name: 'Test User',
            email: 'test@test.com',
            role: 'EDITOR',
            workspaceAuthority: 'DESIGN:EDITOR',
          },
        })
      ).rejects.toThrow('Organization DID');
    });

    it('should throw NotFoundError if organization not found', async () => {
      setupFindOneMock({
        userDid: {
          did: 'did:key:z6MkUser123',
          waltIdKeyId: 'key_user_123',
        },
        orgDid: {
          did: 'did:key:z6MkOrg456',
          waltIdKeyId: 'key_org_456',
        },
        organization: null,
      });

      await expect(
        service.createSealedArtifact({
          organizationId: 'org_123',
          userId: 'user_456',
          payload: { type: 'Test' },
          userContext: {
            name: 'Test User',
            email: 'test@test.com',
            role: 'EDITOR',
            workspaceAuthority: 'DESIGN:EDITOR',
          },
        })
      ).rejects.toThrow('Organization');
    });
  });
});
