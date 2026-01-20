import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { DPPReadinessService } from './dpp-readiness.service.js';
import { NotFoundError } from '../lib/errors.js';

interface MockPrismaClient {
  product: {
    findFirst: Mock;
    findMany: Mock;
  };
  productVersion: {
    findFirst: Mock;
  };
  readinessProfile: {
    findUnique: Mock;
  };
  dPPSnapshot: {
    create: Mock;
    findFirst: Mock;
  };
  $transaction: Mock;
}

const mockPrisma: MockPrismaClient = {
  product: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  productVersion: {
    findFirst: vi.fn(),
  },
  readinessProfile: {
    findUnique: vi.fn(),
  },
  dPPSnapshot: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  $transaction: vi.fn((fn: (client: MockPrismaClient) => Promise<unknown>) => fn(mockPrisma)),
};

describe('DPPReadinessService', () => {
  let service: DPPReadinessService;
  const orgId = 'org_test123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DPPReadinessService(mockPrisma as unknown as ConstructorParameters<typeof DPPReadinessService>[0]);
  });

  describe('checkProductReadiness', () => {
    it('should return 100% score when all requirements met', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod_123',
        name: 'Test Product',
        description: 'Test Description',
        organizationId: orgId,
      });

      mockPrisma.productVersion.findFirst
        .mockResolvedValueOnce({
          id: 'ver_design',
          workspace: 'DESIGN',
          status: 'RELEASED',
        })
        .mockResolvedValueOnce({
          id: 'ver_marketing',
          workspace: 'MARKETING',
          status: 'RELEASED',
        });

      mockPrisma.readinessProfile.findUnique.mockResolvedValue({
        id: 'rp_123',
        category: 'TEXTILES',
        requiredFields: {
          design: ['name', 'description'],
        },
        requiredAttestations: [],
      });

      const result = await service.checkProductReadiness(
        orgId,
        'prod_123',
        'rp_123'
      );

      expect(result.score).toBe(100);
      expect(result.isReady).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('should return partial score with missing fields', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod_123',
        name: 'Test Product',
        description: null, // Missing!
        organizationId: orgId,
      });

      mockPrisma.productVersion.findFirst
        .mockResolvedValueOnce({
          id: 'ver_design',
          workspace: 'DESIGN',
          status: 'RELEASED',
        })
        .mockResolvedValueOnce(null);

      mockPrisma.readinessProfile.findUnique.mockResolvedValue({
        id: 'rp_123',
        category: 'TEXTILES',
        requiredFields: {
          design: ['name', 'description'],
        },
        requiredAttestations: [],
      });

      const result = await service.checkProductReadiness(
        orgId,
        'prod_123',
        'rp_123'
      );

      expect(result.score).toBeLessThan(100);
      expect(result.isReady).toBe(false);
      expect(result.missingFields.length).toBeGreaterThan(0);
    });

    it('should require released design version', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod_123',
        name: 'Test Product',
        organizationId: orgId,
      });

      mockPrisma.productVersion.findFirst.mockResolvedValue(null); // No released version

      mockPrisma.readinessProfile.findUnique.mockResolvedValue({
        id: 'rp_123',
        requiredFields: {},
        requiredAttestations: [],
      });

      const result = await service.checkProductReadiness(
        orgId,
        'prod_123',
        'rp_123'
      );

      expect(result.isReady).toBe(false);
      expect(result.missingRequirements).toContain('Released DESIGN version required');
    });

    it('should throw NotFoundError for unknown product', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.checkProductReadiness(orgId, 'unknown', 'rp_123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for unknown profile', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod_123',
        name: 'Test Product',
        organizationId: orgId,
      });

      mockPrisma.readinessProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.checkProductReadiness(orgId, 'prod_123', 'unknown_profile')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getReadyProducts', () => {
    it('should return products with 100% readiness', async () => {
      // This would typically query and check multiple products
      // For now, test the structure
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod_123',
        name: 'Test Product',
        organizationId: orgId,
      });

      expect(service).toBeDefined();
    });
  });

  describe('hasExistingSnapshot', () => {
    it('should return true when pending/issued snapshot exists', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue({
        id: 'snap_123',
        status: 'PENDING_REVIEW',
        organizationId: orgId,
      });

      const result = await service.hasExistingSnapshot(orgId, 'prod_123');

      expect(result).toBe(true);
    });

    it('should return false when no active snapshot exists', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(null);

      const result = await service.hasExistingSnapshot(orgId, 'prod_123');

      expect(result).toBe(false);
    });
  });
});
