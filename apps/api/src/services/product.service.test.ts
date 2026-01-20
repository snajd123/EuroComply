import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ProductService } from './product.service.js';
import { CreateProductInput } from '@eurocomply/shared';

// Mock Prisma client type
interface MockPrismaClient {
  product: {
    create: Mock;
    findUnique: Mock;
    findMany: Mock;
    update: Mock;
  };
  productIdentifier: {
    createMany: Mock;
  };
  productVersion: {
    create: Mock;
    findFirst: Mock;
    update: Mock;
  };
  bomEntry: {
    createMany: Mock;
  };
  $transaction: Mock;
}

// Mock Prisma client
const mockPrisma: MockPrismaClient = {
  product: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  productIdentifier: {
    createMany: vi.fn(),
  },
  productVersion: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  bomEntry: {
    createMany: vi.fn(),
  },
  $transaction: vi.fn((fn: (client: MockPrismaClient) => Promise<unknown>) => fn(mockPrisma)),
};

describe('ProductService', () => {
  let service: ProductService;
  const orgId = 'org_test123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProductService(mockPrisma as unknown as ConstructorParameters<typeof ProductService>[0]);
  });

  describe('createProduct', () => {
    it('should create a product with identifiers', async () => {
      const input: CreateProductInput = {
        name: 'Test Product',
        productType: 'FINISHED_GOOD',
        identifiers: [{ type: 'INTERNAL', value: 'PROTO-001' }],
      };

      mockPrisma.product.create.mockResolvedValue({
        id: 'prod_123',
        ...input,
        organizationId: orgId,
      });

      const result = await service.createProduct(orgId, input);

      expect(mockPrisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Test Product',
          productType: 'FINISHED_GOOD',
          organizationId: orgId,
        }),
        include: expect.any(Object),
      });
      expect(result.id).toBe('prod_123');
    });

    it('should reject variant without parentId', async () => {
      const input: CreateProductInput = {
        name: 'Variant without parent',
        productType: 'VARIANT',
      };

      await expect(service.createProduct(orgId, input)).rejects.toThrow(
        'VARIANT products must have a parentId'
      );
    });
  });

  describe('getProduct', () => {
    it('should return product by id within organization', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod_123',
        organizationId: orgId,
        name: 'Test',
      });

      const result = await service.getProduct(orgId, 'prod_123');

      expect(result).toBeDefined();
      expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'prod_123' },
        include: expect.any(Object),
      });
    });

    it('should return null for product in different org', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod_123',
        organizationId: 'other_org',
        name: 'Test',
      });

      const result = await service.getProduct(orgId, 'prod_123');

      expect(result).toBeNull();
    });
  });

  describe('listProducts', () => {
    it('should list products with pagination', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'prod_1', name: 'Product 1' },
        { id: 'prod_2', name: 'Product 2' },
      ]);

      const result = await service.listProducts(orgId, { limit: 10, offset: 0 });

      expect(result).toHaveLength(2);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId, status: 'ACTIVE' },
        include: expect.any(Object),
        take: 10,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by productType', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.listProducts(orgId, { productType: 'RAW_MATERIAL' });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            productType: 'RAW_MATERIAL',
          }),
        })
      );
    });
  });
});
