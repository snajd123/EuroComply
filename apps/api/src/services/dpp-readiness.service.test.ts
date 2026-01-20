import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DPPReadinessService } from './dpp-readiness.service.js';
import { NotFoundError } from '../lib/errors.js';
import { DppSnapshotStatus } from '@eurocomply/db';

/**
 * Creates a mock MikroORM EntityManager for testing DPPReadinessService.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockEntityManager(): any {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
  };
}

describe('DPPReadinessService', () => {
  let service: DPPReadinessService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEm: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEm = createMockEntityManager();
    service = new DPPReadinessService(mockEm);
  });

  describe('checkProductReadiness', () => {
    it('should return 100% score when all requirements are met', async () => {
      const product = {
        id: 'prod_123',
        name: 'Test Product',
        description: 'A test product',
        productType: 'FINISHED_GOOD',
        identifiers: {
          getItems: () => [{ type: 'GTIN', value: '1234567890123' }],
        },
      };
      const profile = {
        id: 'rp_123',
        requirements: {
          requiredFields: { design: ['name'] },
        },
      };
      const designVersion = {
        id: 'ver_design_1',
        workspace: 'DESIGN',
        status: 'RELEASED',
        versionNumber: 1,
      };

      mockEm.findOne
        .mockResolvedValueOnce(product) // Product
        .mockResolvedValueOnce(profile) // Profile
        .mockResolvedValueOnce(designVersion) // Design version
        .mockResolvedValueOnce(null); // Marketing version (optional)

      const result = await service.checkProductReadiness('prod_123', 'rp_123');

      expect(result.score).toBe(100);
      expect(result.isReady).toBe(true);
      expect(result.missingFields).toHaveLength(0);
      expect(result.designVersionId).toBe('ver_design_1');
    });

    it('should return partial score when some requirements are missing', async () => {
      const product = {
        id: 'prod_123',
        name: 'Test Product',
        description: null, // Missing description
        productType: 'FINISHED_GOOD',
        identifiers: {
          getItems: () => [],
        },
      };
      const profile = {
        id: 'rp_123',
        requirements: {
          requiredFields: { design: ['name', 'description'] },
        },
      };
      const designVersion = {
        id: 'ver_design_1',
        workspace: 'DESIGN',
        status: 'RELEASED',
      };

      mockEm.findOne
        .mockResolvedValueOnce(product)
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(designVersion)
        .mockResolvedValueOnce(null);

      const result = await service.checkProductReadiness('prod_123', 'rp_123');

      expect(result.score).toBeLessThan(100);
      expect(result.isReady).toBe(false);
      expect(result.missingFields).toContainEqual({ workspace: 'design', field: 'description' });
    });

    it('should mark as not ready when design version is missing', async () => {
      const product = {
        id: 'prod_123',
        name: 'Test Product',
        description: 'A test product',
        productType: 'FINISHED_GOOD',
        identifiers: {
          getItems: () => [],
        },
      };
      const profile = {
        id: 'rp_123',
        requirements: {
          requiredFields: { design: ['name'] },
        },
      };

      mockEm.findOne
        .mockResolvedValueOnce(product)
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(null) // No design version
        .mockResolvedValueOnce(null);

      const result = await service.checkProductReadiness('prod_123', 'rp_123');

      expect(result.isReady).toBe(false);
      expect(result.missingRequirements).toContain('Released DESIGN version required');
    });

    it('should throw NotFoundError for non-existent product', async () => {
      mockEm.findOne.mockResolvedValueOnce(null);

      await expect(
        service.checkProductReadiness('unknown_prod', 'rp_123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for non-existent profile', async () => {
      const product = {
        id: 'prod_123',
        name: 'Test Product',
        identifiers: { getItems: () => [] },
      };

      mockEm.findOne
        .mockResolvedValueOnce(product)
        .mockResolvedValueOnce(null); // No profile

      await expect(
        service.checkProductReadiness('prod_123', 'unknown_rp')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getReadyProducts', () => {
    it('should return only ready products', async () => {
      const profile = {
        id: 'rp_123',
        requirements: {
          requiredFields: { design: ['name'] },
        },
      };
      const products = [
        {
          id: 'prod_1',
          name: 'Ready Product',
          description: 'Has all requirements',
          productType: 'FINISHED_GOOD',
          status: 'ACTIVE',
          identifiers: { getItems: () => [] },
        },
      ];
      const designVersion = {
        id: 'ver_1',
        workspace: 'DESIGN',
        status: 'RELEASED',
      };

      // Setup mocks
      mockEm.findOne
        .mockResolvedValueOnce(profile) // getReadyProducts profile lookup
        .mockResolvedValueOnce(products[0]) // checkProductReadiness product lookup
        .mockResolvedValueOnce(profile) // checkProductReadiness profile lookup
        .mockResolvedValueOnce(designVersion) // design version
        .mockResolvedValueOnce(null); // marketing version
      mockEm.find.mockResolvedValueOnce(products);

      const results = await service.getReadyProducts('rp_123');

      expect(results).toHaveLength(1);
      expect(results[0].productId).toBe('prod_1');
    });

    it('should throw NotFoundError for non-existent profile', async () => {
      mockEm.findOne.mockResolvedValueOnce(null);

      await expect(service.getReadyProducts('unknown_rp')).rejects.toThrow(NotFoundError);
    });

    it('should return empty array when no products are ready', async () => {
      const profile = {
        id: 'rp_123',
        requirements: {
          requiredFields: { design: ['name', 'description'] },
        },
      };
      const products = [
        {
          id: 'prod_1',
          name: 'Incomplete Product',
          description: null,
          productType: 'FINISHED_GOOD',
          status: 'ACTIVE',
          identifiers: { getItems: () => [] },
        },
      ];

      mockEm.findOne
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(products[0])
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(null) // No design version
        .mockResolvedValueOnce(null);
      mockEm.find.mockResolvedValueOnce(products);

      const results = await service.getReadyProducts('rp_123');

      expect(results).toHaveLength(0);
    });
  });

  describe('hasExistingSnapshot', () => {
    it('should return true when pending snapshot exists', async () => {
      mockEm.findOne.mockResolvedValueOnce({
        id: 'snap_123',
        status: DppSnapshotStatus.PENDING_REVIEW,
      });

      const result = await service.hasExistingSnapshot('prod_123');

      expect(result).toBe(true);
    });

    it('should return true when issued snapshot exists', async () => {
      mockEm.findOne.mockResolvedValueOnce({
        id: 'snap_123',
        status: DppSnapshotStatus.ISSUED,
      });

      const result = await service.hasExistingSnapshot('prod_123');

      expect(result).toBe(true);
    });

    it('should return false when no active snapshot exists', async () => {
      mockEm.findOne.mockResolvedValueOnce(null);

      const result = await service.hasExistingSnapshot('prod_123');

      expect(result).toBe(false);
    });
  });
});
