import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { DPPSnapshotService } from './dpp-snapshot.service.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

interface MockPrismaClient {
  dPPSnapshot: {
    create: Mock;
    findFirst: Mock;
    findMany: Mock;
    update: Mock;
  };
  product: {
    findFirst: Mock;
  };
  productVersion: {
    findFirst: Mock;
  };
  readinessProfile: {
    findUnique: Mock;
  };
  $transaction: Mock;
}

const mockPrisma: MockPrismaClient = {
  dPPSnapshot: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  product: {
    findFirst: vi.fn(),
  },
  productVersion: {
    findFirst: vi.fn(),
  },
  readinessProfile: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn((fn: (client: MockPrismaClient) => Promise<unknown>) => fn(mockPrisma)),
};

describe('DPPSnapshotService', () => {
  let service: DPPSnapshotService;
  const orgId = 'org_test123';
  const userId = 'user_123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DPPSnapshotService(mockPrisma as unknown as ConstructorParameters<typeof DPPSnapshotService>[0]);
  });

  describe('createSnapshot', () => {
    it('should create a snapshot with deep-cloned product data', async () => {
      const productData = {
        id: 'prod_123',
        name: 'Test Product',
        organizationId: orgId,
      };
      const designVersion = {
        id: 'ver_design_1',
        workspace: 'DESIGN',
        status: 'RELEASED',
      };

      mockPrisma.product.findFirst.mockResolvedValue(productData);
      mockPrisma.productVersion.findFirst.mockResolvedValue(designVersion);
      mockPrisma.readinessProfile.findUnique.mockResolvedValue({
        id: 'rp_123',
        requiredFields: { design: ['name'] },
      });
      mockPrisma.dPPSnapshot.create.mockResolvedValue({
        id: 'snap_123',
        productId: 'prod_123',
        status: 'PENDING_REVIEW',
        completionScore: 100,
      });

      const result = await service.createSnapshot(orgId, {
        productId: 'prod_123',
        readinessProfileId: 'rp_123',
      });

      expect(result.status).toBe('PENDING_REVIEW');
      expect(mockPrisma.dPPSnapshot.create).toHaveBeenCalled();
    });

    it('should throw NotFoundError for non-existent product', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.createSnapshot(orgId, {
          productId: 'unknown_prod',
          readinessProfileId: 'rp_123',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if no released DESIGN version exists', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod_123',
        name: 'Test Product',
        organizationId: orgId,
      });
      mockPrisma.productVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.createSnapshot(orgId, {
          productId: 'prod_123',
          readinessProfileId: 'rp_123',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent readiness profile', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod_123',
        name: 'Test Product',
        organizationId: orgId,
      });
      mockPrisma.productVersion.findFirst.mockResolvedValue({
        id: 'ver_design_1',
        workspace: 'DESIGN',
        status: 'RELEASED',
      });
      mockPrisma.readinessProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.createSnapshot(orgId, {
          productId: 'prod_123',
          readinessProfileId: 'unknown_rp',
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('verify', () => {
    it('should transition from PENDING_REVIEW to VERIFIED', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue({
        id: 'snap_123',
        status: 'PENDING_REVIEW',
        organizationId: orgId,
      });
      mockPrisma.dPPSnapshot.update.mockResolvedValue({
        id: 'snap_123',
        status: 'VERIFIED',
        verifiedBy: userId,
        verifiedAt: new Date(),
      });

      const result = await service.verify(orgId, 'snap_123', userId);

      expect(result.status).toBe('VERIFIED');
      expect(result.verifiedBy).toBe(userId);
    });

    it('should reject verification of non-PENDING_REVIEW snapshot', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue({
        id: 'snap_123',
        status: 'VERIFIED',
        organizationId: orgId,
      });

      await expect(
        service.verify(orgId, 'snap_123', userId)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent snapshot', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(null);

      await expect(
        service.verify(orgId, 'unknown_snap', userId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('attest', () => {
    it('should transition from VERIFIED to ATTESTED with user signature', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue({
        id: 'snap_123',
        status: 'VERIFIED',
        organizationId: orgId,
      });
      mockPrisma.dPPSnapshot.update.mockResolvedValue({
        id: 'snap_123',
        status: 'ATTESTED',
        attestedBy: userId,
        attestedAt: new Date(),
      });

      const result = await service.attest(orgId, 'snap_123', userId, {
        userSignatureDid: 'did:key:z123',
        userSignatureJws: 'eyJ...',
        userForensicContext: { signerName: 'Test User' },
      });

      expect(result.status).toBe('ATTESTED');
    });

    it('should reject attestation of non-VERIFIED snapshot', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue({
        id: 'snap_123',
        status: 'PENDING_REVIEW',
        organizationId: orgId,
      });

      await expect(
        service.attest(orgId, 'snap_123', userId, {
          userSignatureDid: 'did:key:z123',
          userSignatureJws: 'eyJ...',
          userForensicContext: { signerName: 'Test User' },
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('seal', () => {
    it('should transition from ATTESTED to SEALED with org signature', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue({
        id: 'snap_123',
        status: 'ATTESTED',
        organizationId: orgId,
      });
      mockPrisma.dPPSnapshot.update.mockResolvedValue({
        id: 'snap_123',
        status: 'SEALED',
        sealedAt: new Date(),
      });

      const result = await service.seal(orgId, 'snap_123', {
        orgSignatureDid: 'did:key:zOrg123',
        orgSignatureJws: 'eyJ...',
        orgForensicContext: { organizationName: 'Test Org' },
      });

      expect(result.status).toBe('SEALED');
    });

    it('should reject sealing of non-ATTESTED snapshot', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue({
        id: 'snap_123',
        status: 'VERIFIED',
        organizationId: orgId,
      });

      await expect(
        service.seal(orgId, 'snap_123', {
          orgSignatureDid: 'did:key:zOrg123',
          orgSignatureJws: 'eyJ...',
          orgForensicContext: { organizationName: 'Test Org' },
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('issue', () => {
    it('should transition from SEALED to ISSUED with VC details', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue({
        id: 'snap_123',
        status: 'SEALED',
        organizationId: orgId,
      });
      mockPrisma.dPPSnapshot.update.mockResolvedValue({
        id: 'snap_123',
        status: 'ISSUED',
        issuedAt: new Date(),
        vcId: 'vc_123',
        dppUrl: 'https://dpp.eurocomply.eu/org/prod',
      });

      const result = await service.issue(orgId, 'snap_123', {
        vcId: 'vc_123',
        vcJwt: 'eyJ...',
        dppUrl: 'https://dpp.eurocomply.eu/org/prod',
        qrCodeUrl: 'https://dpp.eurocomply.eu/qr/abc',
      });

      expect(result.status).toBe('ISSUED');
      expect(result.dppUrl).toBe('https://dpp.eurocomply.eu/org/prod');
    });

    it('should reject issuance of non-SEALED snapshot', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue({
        id: 'snap_123',
        status: 'ATTESTED',
        organizationId: orgId,
      });

      await expect(
        service.issue(orgId, 'snap_123', {
          vcId: 'vc_123',
          vcJwt: 'eyJ...',
          dppUrl: 'https://dpp.eurocomply.eu/org/prod',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('revoke', () => {
    it('should transition from ISSUED to REVOKED', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue({
        id: 'snap_123',
        status: 'ISSUED',
        organizationId: orgId,
      });
      mockPrisma.dPPSnapshot.update.mockResolvedValue({
        id: 'snap_123',
        status: 'REVOKED',
      });

      const result = await service.revoke(orgId, 'snap_123');

      expect(result.status).toBe('REVOKED');
    });

    it('should reject revocation of non-ISSUED snapshot', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue({
        id: 'snap_123',
        status: 'SEALED',
        organizationId: orgId,
      });

      await expect(
        service.revoke(orgId, 'snap_123')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getSnapshot', () => {
    it('should return snapshot by ID', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue({
        id: 'snap_123',
        status: 'PENDING_REVIEW',
        organizationId: orgId,
      });

      const result = await service.getSnapshot(orgId, 'snap_123');

      expect(result?.id).toBe('snap_123');
    });

    it('should return null for non-existent snapshot', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(null);

      const result = await service.getSnapshot(orgId, 'unknown_snap');

      expect(result).toBeNull();
    });
  });

  describe('listSnapshots', () => {
    it('should list snapshots for an organization', async () => {
      mockPrisma.dPPSnapshot.findMany.mockResolvedValue([
        { id: 'snap_1', status: 'PENDING_REVIEW' },
        { id: 'snap_2', status: 'ISSUED' },
      ]);

      const result = await service.listSnapshots(orgId);

      expect(result).toHaveLength(2);
    });

    it('should filter by productId', async () => {
      mockPrisma.dPPSnapshot.findMany.mockResolvedValue([
        { id: 'snap_1', productId: 'prod_123', status: 'PENDING_REVIEW' },
      ]);

      await service.listSnapshots(orgId, { productId: 'prod_123' });

      expect(mockPrisma.dPPSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            productId: 'prod_123',
          }),
        })
      );
    });

    it('should filter by status', async () => {
      mockPrisma.dPPSnapshot.findMany.mockResolvedValue([
        { id: 'snap_1', status: 'ISSUED' },
      ]);

      await service.listSnapshots(orgId, { status: 'ISSUED' });

      expect(mockPrisma.dPPSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ISSUED',
          }),
        })
      );
    });
  });
});
