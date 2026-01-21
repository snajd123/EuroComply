import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ProductService } from './product.service.js';
import { CreateProductInput } from '@eurocomply/shared';

// Mock EntityManager type
interface MockEntityManager {
  findOne: Mock;
  find: Mock;
  create: Mock;
  flush: Mock;
  getReference: Mock;
  populate: Mock;
  transactional: Mock;
}

// Create mock EntityManager
const createMockEm = (): MockEntityManager => ({
  findOne: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  flush: vi.fn(),
  getReference: vi.fn((entity, id) => ({ id })),
  populate: vi.fn(),
  transactional: vi.fn((fn: (em: MockEntityManager) => Promise<unknown>) => fn(mockEm)),
});

let mockEm: MockEntityManager;

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEm = createMockEm();
    // Re-bind transactional to use the new mockEm
    mockEm.transactional = vi.fn((fn: (em: MockEntityManager) => Promise<unknown>) => fn(mockEm));
    service = new ProductService(mockEm as unknown as ConstructorParameters<typeof ProductService>[0]);
  });

  describe('createProduct', () => {
    it('should create a product with identifiers', async () => {
      const input: CreateProductInput = {
        name: 'Test Product',
        productType: 'FINISHED_GOOD',
        identifiers: [{ type: 'INTERNAL', value: 'PROTO-001' }],
      };

      const mockProduct = {
        id: 'prd_123',
        name: input.name,
        productType: input.productType,
        status: 'ACTIVE',
      };

      mockEm.create.mockReturnValue(mockProduct);
      mockEm.flush.mockResolvedValue(undefined);
      mockEm.populate.mockResolvedValue(mockProduct);

      const result = await service.createProduct(input);

      // Verify product was created
      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(), // Product entity class
        expect.objectContaining({
          name: 'Test Product',
          productType: 'FINISHED_GOOD',
        })
      );

      // Verify identifiers were created
      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(), // ProductIdentifier entity class
        expect.objectContaining({
          type: 'INTERNAL',
          value: 'PROTO-001',
        })
      );

      expect(mockEm.flush).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should reject variant without parentId', async () => {
      const input: CreateProductInput = {
        name: 'Variant without parent',
        productType: 'VARIANT',
      };

      await expect(service.createProduct(input)).rejects.toThrow(
        'VARIANT products must have a parentId'
      );
    });

    it('should reject non-variant with parentId', async () => {
      const input: CreateProductInput = {
        name: 'Non-variant with parent',
        productType: 'FINISHED_GOOD',
        parentId: 'prd_parent',
      };

      await expect(service.createProduct(input)).rejects.toThrow(
        'Only VARIANT products can have a parentId'
      );
    });

    it('should reject variant with non-existent parent', async () => {
      const input: CreateProductInput = {
        name: 'Variant with missing parent',
        productType: 'VARIANT',
        parentId: 'prd_nonexistent',
      };

      mockEm.findOne.mockResolvedValue(null);

      await expect(service.createProduct(input)).rejects.toThrow(
        "Parent product with ID 'prd_nonexistent' not found"
      );
    });
  });

  describe('getProduct', () => {
    it('should return product by id', async () => {
      const mockProduct = {
        id: 'prd_123',
        name: 'Test',
        status: 'ACTIVE',
      };

      mockEm.findOne.mockResolvedValue(mockProduct);

      const result = await service.getProduct('prd_123');

      expect(result).toBeDefined();
      expect(mockEm.findOne).toHaveBeenCalledWith(
        expect.anything(), // Product entity class
        { id: 'prd_123' },
        expect.objectContaining({
          populate: expect.arrayContaining(['identifiers', 'versions', 'parent', 'variants']),
        })
      );
    });

    it('should return null for non-existent product', async () => {
      mockEm.findOne.mockResolvedValue(null);

      const result = await service.getProduct('prd_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listProducts', () => {
    it('should list products with pagination', async () => {
      const mockProducts = [
        { id: 'prd_1', name: 'Product 1' },
        { id: 'prd_2', name: 'Product 2' },
      ];

      mockEm.find.mockResolvedValue(mockProducts);

      const result = await service.listProducts({ limit: 10, offset: 0 });

      expect(result).toHaveLength(2);
      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(), // Product entity class
        { status: 'ACTIVE' },
        expect.objectContaining({
          limit: 10,
          offset: 0,
          orderBy: { createdAt: 'DESC' },
        })
      );
    });

    it('should filter by productType', async () => {
      mockEm.find.mockResolvedValue([]);

      await service.listProducts({ productType: 'RAW_MATERIAL' });

      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          productType: 'RAW_MATERIAL',
        }),
        expect.any(Object)
      );
    });

    it('should filter by parentId', async () => {
      mockEm.find.mockResolvedValue([]);

      await service.listProducts({ parentId: 'prd_parent' });

      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          parent: 'prd_parent',
        }),
        expect.any(Object)
      );
    });
  });

  describe('updateProduct', () => {
    it('should update a product', async () => {
      const mockProduct = {
        id: 'prd_123',
        name: 'Old Name',
        description: 'Old desc',
        status: 'ACTIVE',
      };

      mockEm.findOne.mockResolvedValue(mockProduct);
      mockEm.flush.mockResolvedValue(undefined);
      mockEm.populate.mockResolvedValue(mockProduct);

      const result = await service.updateProduct('prd_123', { name: 'New Name' });

      expect(result).toBeDefined();
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should return null for non-existent product', async () => {
      mockEm.findOne.mockResolvedValue(null);

      const result = await service.updateProduct('prd_nonexistent', { name: 'New Name' });

      expect(result).toBeNull();
    });
  });

  describe('archiveProduct', () => {
    it('should archive a product', async () => {
      const mockProduct = {
        id: 'prd_123',
        name: 'Test',
        status: 'ACTIVE',
      };

      mockEm.findOne.mockResolvedValue(mockProduct);
      mockEm.flush.mockResolvedValue(undefined);
      mockEm.populate.mockResolvedValue({ ...mockProduct, status: 'ARCHIVED' });

      const result = await service.archiveProduct('prd_123');

      expect(result).toBeDefined();
      expect(mockEm.flush).toHaveBeenCalled();
    });
  });
});
