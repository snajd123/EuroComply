import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ReadinessProfileService } from './readiness-profile.service.js';
import { NotFoundError } from '../lib/errors.js';
import { EntityManager } from '@mikro-orm/postgresql';
import { MikroOrm } from '@eurocomply/db';

const { ReadinessProfile } = MikroOrm;

const createMockEm = (): EntityManager => {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    persist: vi.fn(),
    flush: vi.fn(),
    remove: vi.fn(),
  } as unknown as EntityManager;
};

describe('ReadinessProfileService', () => {
  let service: ReadinessProfileService;
  let mockEm: EntityManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEm = createMockEm();
    service = new ReadinessProfileService(mockEm);
  });

  describe('constructor', () => {
    it('should accept EntityManager instead of PrismaClient', () => {
      expect(service).toBeInstanceOf(ReadinessProfileService);
    });
  });

  describe('create', () => {
    const validInput = {
      name: 'Textile Products',
      category: 'TEXTILES',
      description: 'Requirements for textile DPPs',
      requiredFields: {
        design: ['materials', 'certifications'],
        marketing: ['productDescription', 'images'],
      },
      requiredAttestations: ['GOTS', 'OEKO-TEX'],
    };

    it('should use em.create and em.persist to create a new profile', async () => {
      const newProfile = {
        id: 'rp_123',
        ...validInput,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (mockEm.create as Mock).mockReturnValue(newProfile);

      const result = await service.create(validInput);

      expect(mockEm.create).toHaveBeenCalledWith(
        ReadinessProfile,
        expect.objectContaining({
          name: 'Textile Products',
          category: 'TEXTILES',
          description: 'Requirements for textile DPPs',
          requiredFields: validInput.requiredFields,
          requiredAttestations: validInput.requiredAttestations,
        })
      );
      expect(mockEm.persist).toHaveBeenCalledWith(newProfile);
      expect(result.category).toBe('TEXTILES');
    });

    it('should call em.flush after creating profile', async () => {
      const newProfile = { id: 'rp_123', ...validInput };
      (mockEm.create as Mock).mockReturnValue(newProfile);

      await service.create(validInput);

      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should generate a prefixed ID for the profile', async () => {
      const newProfile = { id: 'rp_123', ...validInput };
      (mockEm.create as Mock).mockReturnValue(newProfile);

      await service.create(validInput);

      expect(mockEm.create).toHaveBeenCalledWith(
        ReadinessProfile,
        expect.objectContaining({
          id: expect.stringMatching(/^rp_/),
        })
      );
    });
  });

  describe('getById', () => {
    it('should use em.findOne to find profile by id', async () => {
      const existingProfile = {
        id: 'rp_123',
        name: 'Textile Products',
        category: 'TEXTILES',
      };
      (mockEm.findOne as Mock).mockResolvedValue(existingProfile);

      const result = await service.getById('rp_123');

      expect(mockEm.findOne).toHaveBeenCalledWith(ReadinessProfile, { id: 'rp_123' });
      expect(result?.id).toBe('rp_123');
    });

    it('should return null when profile not found', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);

      const result = await service.getById('rp_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getByCategory', () => {
    it('should use em.findOne to find profile by category', async () => {
      const existingProfile = {
        id: 'rp_123',
        name: 'Textile Products',
        category: 'TEXTILES',
      };
      (mockEm.findOne as Mock).mockResolvedValue(existingProfile);

      const result = await service.getByCategory('TEXTILES');

      expect(mockEm.findOne).toHaveBeenCalledWith(ReadinessProfile, { category: 'TEXTILES' });
      expect(result?.category).toBe('TEXTILES');
    });

    it('should return null for unknown category', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);

      const result = await service.getByCategory('UNKNOWN');

      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('should use em.find to list all profiles', async () => {
      const profiles = [
        { id: 'rp_1', name: 'Electronics', category: 'ELECTRONICS' },
        { id: 'rp_2', name: 'Textiles', category: 'TEXTILES' },
      ];
      (mockEm.find as Mock).mockResolvedValue(profiles);

      const result = await service.list();

      expect(mockEm.find).toHaveBeenCalledWith(
        ReadinessProfile,
        {},
        { orderBy: { name: 'asc' } }
      );
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no profiles exist', async () => {
      (mockEm.find as Mock).mockResolvedValue([]);

      const result = await service.list();

      expect(result).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should use em.findOne to find profile before update', async () => {
      const existingProfile = {
        id: 'rp_123',
        name: 'Old Name',
        category: 'TEXTILES',
        description: null as string | null,
      };
      (mockEm.findOne as Mock).mockResolvedValue(existingProfile);

      await service.update('rp_123', { name: 'Updated Textiles' });

      expect(mockEm.findOne).toHaveBeenCalledWith(ReadinessProfile, { id: 'rp_123' });
    });

    it('should update properties directly on the entity', async () => {
      const existingProfile = {
        id: 'rp_123',
        name: 'Old Name',
        category: 'TEXTILES',
        description: null as string | null,
        requiredFields: {} as Record<string, string[]>,
        requiredAttestations: undefined as string[] | undefined,
      };
      (mockEm.findOne as Mock).mockResolvedValue(existingProfile);

      await service.update('rp_123', { name: 'Updated Textiles', description: 'New desc' });

      expect(existingProfile.name).toBe('Updated Textiles');
      expect(existingProfile.description).toBe('New desc');
    });

    it('should call em.flush after updating profile', async () => {
      const existingProfile = {
        id: 'rp_123',
        name: 'Old Name',
        category: 'TEXTILES',
      };
      (mockEm.findOne as Mock).mockResolvedValue(existingProfile);

      await service.update('rp_123', { name: 'Updated Textiles' });

      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should throw NotFoundError when profile does not exist', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);

      await expect(
        service.update('rp_nonexistent', { name: 'Test' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should return the updated profile', async () => {
      const existingProfile = {
        id: 'rp_123',
        name: 'Old Name',
        category: 'TEXTILES',
      };
      (mockEm.findOne as Mock).mockResolvedValue(existingProfile);

      const result = await service.update('rp_123', { name: 'Updated Textiles' });

      expect(result.id).toBe('rp_123');
      expect(result.name).toBe('Updated Textiles');
    });
  });

  describe('delete', () => {
    it('should use em.findOne to find profile before delete', async () => {
      const existingProfile = {
        id: 'rp_123',
        category: 'TEXTILES',
      };
      (mockEm.findOne as Mock).mockResolvedValue(existingProfile);

      await service.delete('rp_123');

      expect(mockEm.findOne).toHaveBeenCalledWith(ReadinessProfile, { id: 'rp_123' });
    });

    it('should use em.remove to delete the profile', async () => {
      const existingProfile = {
        id: 'rp_123',
        category: 'TEXTILES',
      };
      (mockEm.findOne as Mock).mockResolvedValue(existingProfile);

      await service.delete('rp_123');

      expect(mockEm.remove).toHaveBeenCalledWith(existingProfile);
    });

    it('should call em.flush after removing profile', async () => {
      const existingProfile = {
        id: 'rp_123',
        category: 'TEXTILES',
      };
      (mockEm.findOne as Mock).mockResolvedValue(existingProfile);

      await service.delete('rp_123');

      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should throw NotFoundError when profile does not exist', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);

      await expect(service.delete('rp_nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('checkReadiness', () => {
    const createProfile = (overrides = {}) => ({
      id: 'rp_123',
      name: 'Textile Products',
      category: 'TEXTILES',
      requiredFields: {
        design: ['materials', 'certifications'],
        marketing: ['productDescription'],
      },
      requiredAttestations: ['GOTS', 'OEKO-TEX'],
      ...overrides,
    });

    it('should use em.findOne to get profile (via getById)', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(createProfile());

      await service.checkReadiness('rp_123', {
        design: { materials: 'cotton' },
        marketing: {},
      });

      expect(mockEm.findOne).toHaveBeenCalledWith(ReadinessProfile, { id: 'rp_123' });
    });

    it('should throw NotFoundError when profile does not exist', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);

      await expect(
        service.checkReadiness('rp_nonexistent', {})
      ).rejects.toThrow(NotFoundError);
    });

    it('should return 100% score when all requirements are met', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(createProfile());

      const result = await service.checkReadiness('rp_123', {
        design: { materials: 'cotton', certifications: ['ISO-9001'] },
        marketing: { productDescription: 'A great product' },
        attestations: ['GOTS', 'OEKO-TEX'],
      });

      expect(result.score).toBe(100);
      expect(result.missingFields).toHaveLength(0);
      expect(result.missingAttestations).toHaveLength(0);
    });

    it('should return correct score and missing fields when requirements partially met', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(createProfile());

      const result = await service.checkReadiness('rp_123', {
        design: { materials: 'cotton' }, // missing certifications
        marketing: {}, // missing productDescription
        attestations: ['GOTS'], // missing OEKO-TEX
      });

      // 5 total required (2 design + 1 marketing + 2 attestations), 2 present
      expect(result.score).toBe(40); // 2/5 = 40%
      expect(result.missingFields).toEqual(
        expect.arrayContaining([
          { workspace: 'design', field: 'certifications' },
          { workspace: 'marketing', field: 'productDescription' },
        ])
      );
      expect(result.missingAttestations).toContain('OEKO-TEX');
    });

    it('should return 0% score when no requirements are met', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(createProfile());

      const result = await service.checkReadiness('rp_123', {});

      expect(result.score).toBe(0);
      expect(result.missingFields).toHaveLength(3); // materials, certifications, productDescription
      expect(result.missingAttestations).toHaveLength(2); // GOTS, OEKO-TEX
    });

    it('should return 100% score when profile has no requirements', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(
        createProfile({
          requiredFields: {},
          requiredAttestations: [],
        })
      );

      const result = await service.checkReadiness('rp_123', {});

      expect(result.score).toBe(100);
      expect(result.missingFields).toHaveLength(0);
      expect(result.missingAttestations).toHaveLength(0);
    });

    it('should handle null values as missing', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(createProfile());

      const result = await service.checkReadiness('rp_123', {
        design: { materials: null, certifications: 'ISO' },
        marketing: { productDescription: 'test' },
        attestations: ['GOTS', 'OEKO-TEX'],
      });

      expect(result.missingFields).toEqual([{ workspace: 'design', field: 'materials' }]);
      expect(result.score).toBe(80); // 4/5
    });
  });
});
