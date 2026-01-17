import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { VersionService } from './version.service.js';

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
      ).rejects.toThrow('Cannot create new version: DESIGN workspace already has a DRAFT version (v2)');
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
      ).rejects.toThrow('Cannot create new version: DESIGN workspace already has a IN_REVIEW version (v1)');
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
        'Cannot transition from RELEASED to PENDING_REVIEW'
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
  });
});
