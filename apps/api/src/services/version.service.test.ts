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

    it('should increment version number', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: productId,
        organizationId: orgId,
      });
      mockPrisma.productVersion.findFirst.mockResolvedValue({
        versionNumber: 3,
      });
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
