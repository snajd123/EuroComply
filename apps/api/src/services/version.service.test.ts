import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { VersionService } from './version.service.js';
import { ValidationError, ConflictError } from '../lib/errors.js';
import type { UserForensicContext, OrgForensicContext, SealedArtifact } from '@eurocomply/shared';

// Mock EntityManager type
interface MockEntityManager {
  findOne: Mock;
  find: Mock;
  create: Mock;
  flush: Mock;
  getReference: Mock;
  transactional: Mock;
}

// Create mock EntityManager
const createMockEm = (): MockEntityManager => ({
  findOne: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  flush: vi.fn(),
  getReference: vi.fn((entity, id) => ({ id })),
  transactional: vi.fn((fn: (em: MockEntityManager) => Promise<unknown>) => fn(mockEm)),
});

let mockEm: MockEntityManager;

describe('VersionService', () => {
  let service: VersionService;
  const productId = 'prod_123';
  const userId = 'user_123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockEm = createMockEm();
    // Re-bind transactional to use the new mockEm
    mockEm.transactional = vi.fn((fn: (em: MockEntityManager) => Promise<unknown>) => fn(mockEm));
    service = new VersionService(mockEm as unknown as ConstructorParameters<typeof VersionService>[0]);
  });

  describe('createVersion', () => {
    it('should create first version as v1', async () => {
      const mockProduct = {
        id: productId,
        name: 'Test Product',
      };

      const mockVersion = {
        id: 'ver_123',
        product: { id: productId },
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'DRAFT',
      };

      // First call: find product
      mockEm.findOne.mockResolvedValueOnce(mockProduct);
      // Second call: check for in-progress versions (none)
      mockEm.findOne.mockResolvedValueOnce(null);
      // Third call: get latest version number (none)
      mockEm.findOne.mockResolvedValueOnce(null);
      mockEm.create.mockReturnValue(mockVersion);
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.createVersion({
        productId,
        workspace: 'DESIGN',
        createdBy: userId,
      });

      expect(result.versionNumber).toBe(1);
      expect(result.status).toBe('DRAFT');
      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          versionNumber: 1,
          status: 'DRAFT',
        })
      );
    });

    it('should increment version number when previous is RELEASED', async () => {
      const mockProduct = {
        id: productId,
        name: 'Test Product',
      };

      const mockVersion = {
        id: 'ver_124',
        product: { id: productId },
        workspace: 'DESIGN',
        versionNumber: 4,
        status: 'DRAFT',
      };

      // First call: find product
      mockEm.findOne.mockResolvedValueOnce(mockProduct);
      // Second call: check for in-progress versions (none)
      mockEm.findOne.mockResolvedValueOnce(null);
      // Third call: get latest version number (v3 RELEASED)
      mockEm.findOne.mockResolvedValueOnce({ versionNumber: 3, status: 'RELEASED' });
      mockEm.create.mockReturnValue(mockVersion);
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.createVersion({
        productId,
        workspace: 'DESIGN',
        createdBy: userId,
      });

      expect(result.versionNumber).toBe(4);
    });

    it('should reject if DRAFT version already exists in workspace', async () => {
      const mockProduct = {
        id: productId,
        name: 'Test Product',
      };

      // First call: find product
      mockEm.findOne.mockResolvedValueOnce(mockProduct);
      // Second call: check for in-progress versions (found one)
      mockEm.findOne.mockResolvedValueOnce({
        id: 'ver_existing',
        versionNumber: 2,
        status: 'DRAFT',
      });

      await expect(
        service.createVersion({
          productId,
          workspace: 'DESIGN',
          createdBy: userId,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should reject if IN_REVIEW version exists in workspace', async () => {
      const mockProduct = {
        id: productId,
        name: 'Test Product',
      };

      // First call: find product
      mockEm.findOne.mockResolvedValueOnce(mockProduct);
      // Second call: check for in-progress versions (found one)
      mockEm.findOne.mockResolvedValueOnce({
        id: 'ver_existing',
        versionNumber: 1,
        status: 'IN_REVIEW',
      });

      await expect(
        service.createVersion({
          productId,
          workspace: 'DESIGN',
          createdBy: userId,
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('submitForReview', () => {
    it('should transition DRAFT to PENDING_REVIEW', async () => {
      const mockVersion = {
        id: 'ver_123',
        status: 'DRAFT',
        product: { id: productId },
      };

      mockEm.findOne.mockResolvedValue(mockVersion);
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.submitForReview('ver_123');

      expect(result.status).toBe('PENDING_REVIEW');
    });

    it('should reject transition from RELEASED', async () => {
      const mockVersion = {
        id: 'ver_123',
        status: 'RELEASED',
        product: { id: productId },
      };

      mockEm.findOne.mockResolvedValue(mockVersion);

      await expect(service.submitForReview('ver_123')).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('releaseVersion', () => {
    it('should transition IN_REVIEW to RELEASED', async () => {
      const mockVersion = {
        id: 'ver_123',
        status: 'IN_REVIEW',
        product: { id: productId },
      };

      mockEm.findOne.mockResolvedValue(mockVersion);
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.releaseVersion('ver_123', userId);

      expect(result.status).toBe('RELEASED');
      expect(result.publishedAt).toBeDefined();
    });

    it('should release without signing when no signing context provided (backward compatibility)', async () => {
      const mockVersion = {
        id: 'ver_123',
        status: 'IN_REVIEW',
        product: { id: productId },
        signatureDid: undefined,
        signatureJws: undefined,
      };

      mockEm.findOne.mockResolvedValue(mockVersion);
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.releaseVersion('ver_123', userId);

      expect(result.status).toBe('RELEASED');
      expect(result.signatureDid).toBeUndefined();
      expect(result.signatureJws).toBeUndefined();
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
      organizationId: 'org_test123',
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
      const mockVersion = {
        id: 'ver_123',
        product: { id: productId },
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'IN_REVIEW',
      };

      mockEm.findOne.mockResolvedValue(mockVersion);
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.releaseVersion(
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
      const mockVersion = {
        id: 'ver_123',
        product: { id: productId },
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'IN_REVIEW',
      };

      mockEm.findOne.mockResolvedValue(mockVersion);
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.releaseVersion(
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
      const mockVersion = {
        id: 'ver_123',
        product: { id: productId },
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'IN_REVIEW',
      };

      mockEm.findOne.mockResolvedValue(mockVersion);
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.releaseVersion(
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
      const mockVersion = {
        id: 'ver_123',
        product: { id: productId },
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'IN_REVIEW',
      };

      mockEm.findOne.mockResolvedValue(mockVersion);

      const invalidSigningContext = {
        ...signingContext,
        userDid: 'invalid-did',
      };

      await expect(
        service.releaseVersion('ver_123', userId, invalidSigningContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid org DID in signing context', async () => {
      const mockVersion = {
        id: 'ver_123',
        product: { id: productId },
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'IN_REVIEW',
      };

      mockEm.findOne.mockResolvedValue(mockVersion);

      const invalidSigningContext = {
        ...signingContext,
        orgDid: 'invalid-org-did',
      };

      await expect(
        service.releaseVersion('ver_123', userId, invalidSigningContext)
      ).rejects.toThrow(ValidationError);
    });
  });
});
