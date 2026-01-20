import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { SealedArtifactService } from './sealed-artifact.service.js';

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
  prisma: {
    organization: { findUnique: Mock };
    userDidHistory: { findFirst: Mock };
    orgDidHistory: { findFirst: Mock };
  };
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
  prisma: {
    organization: { findUnique: vi.fn() },
    userDidHistory: { findFirst: vi.fn() },
    orgDidHistory: { findFirst: vi.fn() },
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
      mockDeps.prisma as unknown as ConstructorParameters<typeof SealedArtifactService>[3]
    );
  });

  describe('createSealedArtifact', () => {
    it('should create complete sealed artifact with all proofs', async () => {
      // Setup mocks
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkUser123',
        waltIdKeyId: 'key_user_123',
      });
      mockDeps.prisma.orgDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkOrg456',
        waltIdKeyId: 'key_org_456',
      });
      mockDeps.prisma.organization.findUnique.mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
        did: 'did:key:z6MkOrg456',
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
    });

    it('should create artifact without timestamp if TSA fails and not required', async () => {
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkUser123',
        waltIdKeyId: 'key_user_123',
      });
      mockDeps.prisma.orgDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkOrg456',
        waltIdKeyId: 'key_org_456',
      });
      mockDeps.prisma.organization.findUnique.mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
        did: 'did:key:z6MkOrg456',
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
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkUser123',
        waltIdKeyId: 'key_user_123',
      });
      mockDeps.prisma.orgDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkOrg456',
        waltIdKeyId: 'key_org_456',
      });
      mockDeps.prisma.organization.findUnique.mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
        did: 'did:key:z6MkOrg456',
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
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue(null);

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
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkUser123',
        waltIdKeyId: 'key_user_123',
      });
      mockDeps.prisma.orgDidHistory.findFirst.mockResolvedValue(null);

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
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkUser123',
        waltIdKeyId: 'key_user_123',
      });
      mockDeps.prisma.orgDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkOrg456',
        waltIdKeyId: 'key_org_456',
      });
      mockDeps.prisma.organization.findUnique.mockResolvedValue(null);

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
