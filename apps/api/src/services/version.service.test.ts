import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { VersionService } from './version.service.js';
import { ValidationError, ConflictError } from '../lib/errors.js';
import type { UserForensicContext, OrgForensicContext, SealedArtifact } from '@eurocomply/shared';

// Mock Prisma client type
interface MockPrismaClient {
  productVersion: {
    create: Mock;
    findFirst: Mock;
    findMany: Mock;
    update: Mock;
  };
  product: {
    findUnique: Mock;
  };
  $transaction: Mock;
}

const mockPrisma: MockPrismaClient = {
  productVersion: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  product: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn((fn: (client: MockPrismaClient) => Promise<unknown>) => fn(mockPrisma)),
};

describe('VersionService', () => {
  let service: VersionService;
  const orgId = 'org_test123';
  const productId = 'prod_123';
  const userId = 'user_123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VersionService(mockPrisma as any);
  });

  describe('createVersion', () => {
    it('should create first version as v1', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: productId,
        organizationId: orgId,
      });
      // First call: check for in-progress versions (none)
      // Second call: get latest version number (none)
      mockPrisma.productVersion.findFirst.mockResolvedValue(null);
      mockPrisma.productVersion.create.mockResolvedValue({
        id: 'ver_123',
        productId,
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'DRAFT',
      });

      const result = await service.createVersion(orgId, {
        productId,
        workspace: 'DESIGN',
        createdBy: userId,
      });

      expect(result.versionNumber).toBe(1);
      expect(result.status).toBe('DRAFT');
    });

    it('should increment version number when previous is RELEASED', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: productId,
        organizationId: orgId,
      });
      // First call: check for in-progress versions (none)
      // Second call: get latest version number (v3 RELEASED)
      mockPrisma.productVersion.findFirst
        .mockResolvedValueOnce(null) // No in-progress version
        .mockResolvedValueOnce({ versionNumber: 3, status: 'RELEASED' }); // Latest version
      mockPrisma.productVersion.create.mockResolvedValue({
        id: 'ver_124',
        versionNumber: 4,
        status: 'DRAFT',
      });

      const result = await service.createVersion(orgId, {
        productId,
        workspace: 'DESIGN',
        createdBy: userId,
      });

      expect(result.versionNumber).toBe(4);
    });

    it('should reject if DRAFT version already exists in workspace', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: productId,
        organizationId: orgId,
      });
      // In-progress version exists
      mockPrisma.productVersion.findFirst.mockResolvedValueOnce({
        id: 'ver_existing',
        versionNumber: 2,
        status: 'DRAFT',
      });

      await expect(
        service.createVersion(orgId, {
          productId,
          workspace: 'DESIGN',
          createdBy: userId,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should reject if IN_REVIEW version exists in workspace', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: productId,
        organizationId: orgId,
      });
      mockPrisma.productVersion.findFirst.mockResolvedValueOnce({
        id: 'ver_existing',
        versionNumber: 1,
        status: 'IN_REVIEW',
      });

      await expect(
        service.createVersion(orgId, {
          productId,
          workspace: 'DESIGN',
          createdBy: userId,
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('submitForReview', () => {
    it('should transition DRAFT to PENDING_REVIEW', async () => {
      mockPrisma.productVersion.findFirst.mockResolvedValue({
        id: 'ver_123',
        status: 'DRAFT',
        product: { organizationId: orgId },
      });
      mockPrisma.productVersion.update.mockResolvedValue({
        id: 'ver_123',
        status: 'PENDING_REVIEW',
      });

      const result = await service.submitForReview(orgId, 'ver_123');

      expect(result.status).toBe('PENDING_REVIEW');
    });

    it('should reject transition from RELEASED', async () => {
      mockPrisma.productVersion.findFirst.mockResolvedValue({
        id: 'ver_123',
        status: 'RELEASED',
        product: { organizationId: orgId },
      });

      await expect(service.submitForReview(orgId, 'ver_123')).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('releaseVersion', () => {
    it('should transition IN_REVIEW to RELEASED', async () => {
      mockPrisma.productVersion.findFirst.mockResolvedValue({
        id: 'ver_123',
        status: 'IN_REVIEW',
        product: { organizationId: orgId },
      });
      mockPrisma.productVersion.update.mockResolvedValue({
        id: 'ver_123',
        status: 'RELEASED',
        publishedAt: new Date(),
        publishedBy: userId,
      });

      const result = await service.releaseVersion(orgId, 'ver_123', userId);

      expect(result.status).toBe('RELEASED');
      expect(result.publishedBy).toBe(userId);
    });

    it('should release without signing when no signing context provided (backward compatibility)', async () => {
      mockPrisma.productVersion.findFirst.mockResolvedValue({
        id: 'ver_123',
        status: 'IN_REVIEW',
        product: { organizationId: orgId },
      });
      mockPrisma.productVersion.update.mockResolvedValue({
        id: 'ver_123',
        status: 'RELEASED',
        publishedAt: new Date(),
        publishedBy: userId,
        signatureDid: null,
        signatureJws: null,
      });

      const result = await service.releaseVersion(orgId, 'ver_123', userId);

      expect(result.status).toBe('RELEASED');
      expect(result.signatureDid).toBeNull();
      expect(result.signatureJws).toBeNull();
    });
  });

  describe('releaseVersion with signing', () => {
    const testUserDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
    const testOrgDid = 'did:key:z6MkoHWsmSZnHisAxnVGGCEkAWqPCNMTEjYNvzKmSFUpShHe';

    const testUserForensicContext: UserForensicContext = {
      signerName: 'John Doe',
      signerEmail: 'john@example.com',
      signerRole: 'Product Manager',
      workspaceAuthority: 'DESIGN',
      signedAt: '2026-01-15T10:00:00.000Z',
    };

    const testOrgForensicContext: OrgForensicContext = {
      organizationName: 'Acme Corporation',
      organizationId: orgId,
      vatNumber: 'DE123456789',
      certifications: ['ISO9001'],
      signedAt: '2026-01-15T10:00:00.000Z',
    };

    const signingContext = {
      userDid: testUserDid,
      userForensicContext: testUserForensicContext,
      orgDid: testOrgDid,
      orgForensicContext: testOrgForensicContext,
    };

    it('should create SealedArtifact when signing context is provided', async () => {
      const versionData = {
        id: 'ver_123',
        productId: productId,
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'IN_REVIEW',
        product: { organizationId: orgId },
      };

      mockPrisma.productVersion.findFirst.mockResolvedValue(versionData);
      mockPrisma.productVersion.update.mockImplementation(async ({ data }) => ({
        id: 'ver_123',
        productId: productId,
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'RELEASED',
        publishedAt: data.publishedAt,
        publishedBy: data.publishedBy,
        signatureDid: data.signatureDid,
        signatureJws: data.signatureJws,
      }));

      const result = await service.releaseVersion(
        orgId,
        'ver_123',
        userId,
        signingContext
      );

      expect(result.status).toBe('RELEASED');
      expect(result.signatureDid).toBe(testOrgDid);
      expect(result.signatureJws).toBeTruthy();

      // Verify the stored artifact is valid JSON
      const storedArtifact = JSON.parse(result.signatureJws as string) as SealedArtifact;
      expect(storedArtifact).toHaveProperty('payload');
      expect(storedArtifact).toHaveProperty('userProof');
      expect(storedArtifact).toHaveProperty('corporateProof');
    });

    it('should include correct payload data in SealedArtifact', async () => {
      const publishedAt = new Date('2026-01-15T10:00:00.000Z');
      const versionData = {
        id: 'ver_123',
        productId: productId,
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'IN_REVIEW',
        product: { organizationId: orgId },
      };

      mockPrisma.productVersion.findFirst.mockResolvedValue(versionData);
      mockPrisma.productVersion.update.mockImplementation(async ({ data }) => ({
        ...versionData,
        status: 'RELEASED',
        publishedAt,
        publishedBy: data.publishedBy,
        signatureDid: data.signatureDid,
        signatureJws: data.signatureJws,
      }));

      const result = await service.releaseVersion(
        orgId,
        'ver_123',
        userId,
        signingContext
      );

      const storedArtifact = JSON.parse(result.signatureJws as string) as SealedArtifact;

      // Verify payload contains expected version data
      expect(storedArtifact.payload).toMatchObject({
        id: 'ver_123',
        productId: productId,
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'RELEASED',
        publishedBy: userId,
      });
    });

    it('should store user and corporate proofs in SealedArtifact', async () => {
      const versionData = {
        id: 'ver_123',
        productId: productId,
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'IN_REVIEW',
        product: { organizationId: orgId },
      };

      mockPrisma.productVersion.findFirst.mockResolvedValue(versionData);
      mockPrisma.productVersion.update.mockImplementation(async ({ data }) => ({
        ...versionData,
        status: 'RELEASED',
        publishedAt: new Date(),
        publishedBy: data.publishedBy,
        signatureDid: data.signatureDid,
        signatureJws: data.signatureJws,
      }));

      const result = await service.releaseVersion(
        orgId,
        'ver_123',
        userId,
        signingContext
      );

      const storedArtifact = JSON.parse(result.signatureJws as string) as SealedArtifact;

      // Verify user proof
      expect(storedArtifact.userProof.type).toBe('Ed25519Signature2020');
      expect(storedArtifact.userProof.verificationMethod).toContain(testUserDid);
      expect(storedArtifact.userProof.forensicContext).toEqual(testUserForensicContext);

      // Verify corporate proof
      expect(storedArtifact.corporateProof.type).toBe('Ed25519Signature2020');
      expect(storedArtifact.corporateProof.verificationMethod).toContain(testOrgDid);
      expect(storedArtifact.corporateProof.forensicContext).toEqual(testOrgForensicContext);
    });

    it('should throw ValidationError for invalid user DID in signing context', async () => {
      const versionData = {
        id: 'ver_123',
        productId: productId,
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'IN_REVIEW',
        product: { organizationId: orgId },
      };

      mockPrisma.productVersion.findFirst.mockResolvedValue(versionData);

      const invalidSigningContext = {
        ...signingContext,
        userDid: 'invalid-did',
      };

      await expect(
        service.releaseVersion(orgId, 'ver_123', userId, invalidSigningContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid org DID in signing context', async () => {
      const versionData = {
        id: 'ver_123',
        productId: productId,
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'IN_REVIEW',
        product: { organizationId: orgId },
      };

      mockPrisma.productVersion.findFirst.mockResolvedValue(versionData);

      const invalidSigningContext = {
        ...signingContext,
        orgDid: 'invalid-org-did',
      };

      await expect(
        service.releaseVersion(orgId, 'ver_123', userId, invalidSigningContext)
      ).rejects.toThrow(ValidationError);
    });
  });
});
