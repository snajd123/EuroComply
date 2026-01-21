import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { DPPSnapshotService } from './dpp-snapshot.service.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { DppSnapshotStatus } from '@eurocomply/db';

/**
 * Creates a mock MikroORM EntityManager for testing DPPSnapshotService.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockEntityManager(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockEm: any = {
    findOne: vi.fn(),
    find: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: vi.fn((_entity: any, data: any) => ({ ...data })),
    flush: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getReference: vi.fn((_entity: any, id: string) => ({ id })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transactional: vi.fn((fn: any) => fn(mockEm)),
  };
  return mockEm;
}

describe('DPPSnapshotService', () => {
  let service: DPPSnapshotService;
  let mockEm: ReturnType<typeof createMockEntityManager>;
  const userId = 'user_123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockEm = createMockEntityManager();
    service = new DPPSnapshotService(mockEm as unknown as ConstructorParameters<typeof DPPSnapshotService>[0]);
  });

  describe('createSnapshot', () => {
    it('should create a snapshot with deep-cloned product data', async () => {
      const productData = {
        id: 'prod_123',
        name: 'Test Product',
        description: 'A test product',
        productType: 'FINISHED_GOOD',
        identifiers: {
          getItems: () => [{ type: 'GTIN', value: '1234567890123' }],
        },
      };
      const designVersion = {
        id: 'ver_design_1',
        versionNumber: 1,
        workspace: 'DESIGN',
        status: 'RELEASED',
      };
      const profile = {
        id: 'rp_123',
        requiredFields: { design: ['name'] },
      };

      // Setup mock responses
      mockEm.findOne
        .mockResolvedValueOnce(productData) // Product lookup
        .mockResolvedValueOnce(designVersion) // Design version lookup
        .mockResolvedValueOnce(profile); // Readiness profile lookup
      mockEm.find.mockResolvedValueOnce([]); // BOM entries

      const result = await service.createSnapshot({
        productId: 'prod_123',
        readinessProfileId: 'rp_123',
      });

      expect(result.status).toBe(DppSnapshotStatus.PENDING_REVIEW);
      expect(result.completionScore).toBe(100);
      expect(mockEm.create).toHaveBeenCalled();
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should throw NotFoundError for non-existent product', async () => {
      mockEm.findOne.mockResolvedValueOnce(null);

      await expect(
        service.createSnapshot({
          productId: 'unknown_prod',
          readinessProfileId: 'rp_123',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if no released DESIGN version exists', async () => {
      const productData = {
        id: 'prod_123',
        name: 'Test Product',
        identifiers: { getItems: () => [] },
      };

      mockEm.findOne
        .mockResolvedValueOnce(productData) // Product found
        .mockResolvedValueOnce(null); // No design version

      await expect(
        service.createSnapshot({
          productId: 'prod_123',
          readinessProfileId: 'rp_123',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent readiness profile', async () => {
      const productData = {
        id: 'prod_123',
        name: 'Test Product',
        identifiers: { getItems: () => [] },
      };
      const designVersion = {
        id: 'ver_design_1',
        workspace: 'DESIGN',
        status: 'RELEASED',
      };

      mockEm.findOne
        .mockResolvedValueOnce(productData)
        .mockResolvedValueOnce(designVersion)
        .mockResolvedValueOnce(null); // No profile
      mockEm.find.mockResolvedValueOnce([]);

      await expect(
        service.createSnapshot({
          productId: 'prod_123',
          readinessProfileId: 'unknown_rp',
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('verify', () => {
    it('should transition from PENDING_REVIEW to VERIFIED', async () => {
      const snapshot = {
        id: 'snap_123',
        status: DppSnapshotStatus.PENDING_REVIEW,
      };

      mockEm.findOne.mockResolvedValue(snapshot);

      const result = await service.verify('snap_123', userId);

      expect(result.status).toBe('VERIFIED');
      expect(result.verifiedBy).toEqual({ id: userId });
      expect(result.verifiedAt).toBeInstanceOf(Date);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should reject verification of non-PENDING_REVIEW snapshot', async () => {
      const snapshot = {
        id: 'snap_123',
        status: DppSnapshotStatus.VERIFIED,
      };

      mockEm.findOne.mockResolvedValue(snapshot);

      await expect(service.verify('snap_123', userId)).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent snapshot', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(service.verify('unknown_snap', userId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('attest', () => {
    it('should transition from VERIFIED to ATTESTED with user signature', async () => {
      const snapshot = {
        id: 'snap_123',
        status: DppSnapshotStatus.VERIFIED,
      };

      mockEm.findOne.mockResolvedValue(snapshot);

      const result = await service.attest('snap_123', userId, {
        userSignatureDid: 'did:key:z123',
        userSignatureJws: 'eyJ...',
        userForensicContext: { signerName: 'Test User' },
      });

      expect(result.status).toBe('ATTESTED');
      expect(result.attestedBy).toEqual({ id: userId });
      expect(result.userSignatureDid).toBe('did:key:z123');
    });

    it('should reject attestation of non-VERIFIED snapshot', async () => {
      const snapshot = {
        id: 'snap_123',
        status: DppSnapshotStatus.PENDING_REVIEW,
      };

      mockEm.findOne.mockResolvedValue(snapshot);

      await expect(
        service.attest('snap_123', userId, {
          userSignatureDid: 'did:key:z123',
          userSignatureJws: 'eyJ...',
          userForensicContext: { signerName: 'Test User' },
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('seal', () => {
    it('should transition from ATTESTED to SEALED with org signature', async () => {
      const snapshot = {
        id: 'snap_123',
        status: DppSnapshotStatus.ATTESTED,
      };

      mockEm.findOne.mockResolvedValue(snapshot);

      const result = await service.seal('snap_123', {
        orgSignatureDid: 'did:key:zOrg123',
        orgSignatureJws: 'eyJ...',
        orgForensicContext: { organizationName: 'Test Org' },
      });

      expect(result.status).toBe('SEALED');
      expect(result.orgSignatureDid).toBe('did:key:zOrg123');
      expect(result.sealedAt).toBeInstanceOf(Date);
    });

    it('should reject sealing of non-ATTESTED snapshot', async () => {
      const snapshot = {
        id: 'snap_123',
        status: DppSnapshotStatus.VERIFIED,
      };

      mockEm.findOne.mockResolvedValue(snapshot);

      await expect(
        service.seal('snap_123', {
          orgSignatureDid: 'did:key:zOrg123',
          orgSignatureJws: 'eyJ...',
          orgForensicContext: { organizationName: 'Test Org' },
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('issue', () => {
    it('should transition from SEALED to ISSUED with VC details', async () => {
      const snapshot = {
        id: 'snap_123',
        status: DppSnapshotStatus.SEALED,
      };

      mockEm.findOne.mockResolvedValue(snapshot);

      const result = await service.issue('snap_123', {
        vcId: 'vc_123',
        vcJwt: 'eyJ...',
        dppUrl: 'https://dpp.eurocomply.eu/org/prod',
        qrCodeUrl: 'https://dpp.eurocomply.eu/qr/abc',
      });

      expect(result.status).toBe('ISSUED');
      expect(result.vcId).toBe('vc_123');
      expect(result.dppUrl).toBe('https://dpp.eurocomply.eu/org/prod');
      expect(result.issuedAt).toBeInstanceOf(Date);
    });

    it('should reject issuance of non-SEALED snapshot', async () => {
      const snapshot = {
        id: 'snap_123',
        status: DppSnapshotStatus.ATTESTED,
      };

      mockEm.findOne.mockResolvedValue(snapshot);

      await expect(
        service.issue('snap_123', {
          vcId: 'vc_123',
          vcJwt: 'eyJ...',
          dppUrl: 'https://dpp.eurocomply.eu/org/prod',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('revoke', () => {
    it('should transition from ISSUED to REVOKED', async () => {
      const snapshot = {
        id: 'snap_123',
        status: DppSnapshotStatus.ISSUED,
      };

      mockEm.findOne.mockResolvedValue(snapshot);

      const result = await service.revoke('snap_123');

      expect(result.status).toBe('REVOKED');
    });

    it('should reject revocation of non-ISSUED snapshot', async () => {
      const snapshot = {
        id: 'snap_123',
        status: DppSnapshotStatus.SEALED,
      };

      mockEm.findOne.mockResolvedValue(snapshot);

      await expect(service.revoke('snap_123')).rejects.toThrow(ValidationError);
    });
  });

  describe('getSnapshot', () => {
    it('should return snapshot by ID', async () => {
      const snapshot = {
        id: 'snap_123',
        status: DppSnapshotStatus.PENDING_REVIEW,
      };

      mockEm.findOne.mockResolvedValue(snapshot);

      const result = await service.getSnapshot('snap_123');

      expect(result?.id).toBe('snap_123');
      expect(mockEm.findOne).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'snap_123' },
        { populate: ['readinessProfile', 'product'] }
      );
    });

    it('should return null for non-existent snapshot', async () => {
      mockEm.findOne.mockResolvedValue(null);

      const result = await service.getSnapshot('unknown_snap');

      expect(result).toBeNull();
    });
  });

  describe('listSnapshots', () => {
    it('should list snapshots for the tenant', async () => {
      const snapshots = [
        { id: 'snap_1', status: DppSnapshotStatus.PENDING_REVIEW },
        { id: 'snap_2', status: DppSnapshotStatus.ISSUED },
      ];

      mockEm.find.mockResolvedValue(snapshots);

      const result = await service.listSnapshots();

      expect(result).toHaveLength(2);
      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(),
        {},
        expect.objectContaining({
          orderBy: { createdAt: 'DESC' },
          limit: 50,
          offset: 0,
        })
      );
    });

    it('should filter by productId', async () => {
      mockEm.find.mockResolvedValue([]);

      await service.listSnapshots({ productId: 'prod_123' });

      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(),
        { product: 'prod_123' },
        expect.anything()
      );
    });

    it('should filter by status', async () => {
      mockEm.find.mockResolvedValue([]);

      await service.listSnapshots({ status: 'ISSUED' });

      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(),
        { status: 'ISSUED' },
        expect.anything()
      );
    });

    it('should respect pagination options', async () => {
      mockEm.find.mockResolvedValue([]);

      await service.listSnapshots({ limit: 10, offset: 20 });

      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(),
        {},
        expect.objectContaining({
          limit: 10,
          offset: 20,
        })
      );
    });
  });
});
