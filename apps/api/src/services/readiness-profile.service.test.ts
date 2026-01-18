import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ReadinessProfileService } from './readiness-profile.service.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';

interface MockPrismaClient {
  readinessProfile: {
    create: Mock;
    findUnique: Mock;
    findMany: Mock;
    update: Mock;
    delete: Mock;
  };
}

const mockPrisma: MockPrismaClient = {
  readinessProfile: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

describe('ReadinessProfileService', () => {
  let service: ReadinessProfileService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReadinessProfileService(mockPrisma as any);
  });

  describe('create', () => {
    it('should create a readiness profile', async () => {
      const input = {
        name: 'Textile Products',
        category: 'TEXTILES',
        description: 'Requirements for textile DPPs',
        requiredFields: {
          design: ['materials', 'certifications'],
          marketing: ['productDescription', 'images'],
        },
        requiredAttestations: ['GOTS', 'OEKO-TEX'],
      };

      mockPrisma.readinessProfile.create.mockResolvedValue({
        id: 'rp_123',
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(input);

      expect(result.category).toBe('TEXTILES');
      expect(mockPrisma.readinessProfile.create).toHaveBeenCalledWith({
        data: input,
      });
    });
  });

  describe('getByCategory', () => {
    it('should find profile by category', async () => {
      mockPrisma.readinessProfile.findUnique.mockResolvedValue({
        id: 'rp_123',
        name: 'Textile Products',
        category: 'TEXTILES',
      });

      const result = await service.getByCategory('TEXTILES');

      expect(result?.category).toBe('TEXTILES');
    });

    it('should return null for unknown category', async () => {
      mockPrisma.readinessProfile.findUnique.mockResolvedValue(null);

      const result = await service.getByCategory('UNKNOWN');

      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('should list all profiles', async () => {
      mockPrisma.readinessProfile.findMany.mockResolvedValue([
        { id: 'rp_1', category: 'TEXTILES' },
        { id: 'rp_2', category: 'ELECTRONICS' },
      ]);

      const result = await service.list();

      expect(result).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('should update a profile', async () => {
      mockPrisma.readinessProfile.findUnique.mockResolvedValue({
        id: 'rp_123',
        category: 'TEXTILES',
      });
      mockPrisma.readinessProfile.update.mockResolvedValue({
        id: 'rp_123',
        name: 'Updated Textiles',
        category: 'TEXTILES',
      });

      const result = await service.update('rp_123', { name: 'Updated Textiles' });

      expect(result.name).toBe('Updated Textiles');
    });

    it('should throw NotFoundError for unknown profile', async () => {
      mockPrisma.readinessProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.update('unknown_id', { name: 'Test' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete a profile', async () => {
      mockPrisma.readinessProfile.findUnique.mockResolvedValue({
        id: 'rp_123',
        category: 'TEXTILES',
      });
      mockPrisma.readinessProfile.delete.mockResolvedValue({
        id: 'rp_123',
      });

      await service.delete('rp_123');

      expect(mockPrisma.readinessProfile.delete).toHaveBeenCalledWith({
        where: { id: 'rp_123' },
      });
    });
  });
});
