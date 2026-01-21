import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { EntityManager } from '@mikro-orm/postgresql';

// Use vi.hoisted to ensure mock functions are available before imports
const {
  mockCreateVersion,
  mockListVersions,
  mockVersionConstructorCalls,
} = vi.hoisted(() => ({
  mockCreateVersion: vi.fn(),
  mockListVersions: vi.fn(),
  mockVersionConstructorCalls: [] as unknown[],
}));

// Mock auth middleware to inject context
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c, next) => {
    c.set('em', c.get('_mockEm'));
    c.set('user', { id: 'user_123', clerkId: 'clerk_123', email: 'test@example.com', name: 'Test User' });
    c.set('tenant', { organizationId: 'org_123', schemaName: 'tenant_test', name: 'Test Org', subscriptionTier: 'starter' });
    c.set('permissions', {
      role: 'owner',
      designAuthority: 'MANAGER',
      operationsAuthority: 'MANAGER',
      marketingAuthority: 'MANAGER',
      complianceAuthority: 'MANAGER',
    });
    await next();
  }),
}));

// Mock ProductService (already migrated, just needs to return results)
vi.mock('../services/product.service.js', () => ({
  ProductService: class MockProductService {
    constructor() {}
    listProducts = vi.fn().mockResolvedValue([]);
    createProduct = vi.fn().mockResolvedValue({ id: 'product_123', name: 'Test Product' });
    getProduct = vi.fn().mockResolvedValue({ id: 'product_123', name: 'Test Product' });
    updateProduct = vi.fn().mockResolvedValue({ id: 'product_123', name: 'Updated Product' });
    archiveProduct = vi.fn().mockResolvedValue({ id: 'product_123' });
  },
}));

// Mock VersionService as a class that tracks constructor calls
vi.mock('../services/version.service.js', () => {
  return {
    VersionService: class MockVersionService {
      constructor(public em: unknown) {
        mockVersionConstructorCalls.push(em);
      }
      createVersion = mockCreateVersion;
      listVersions = mockListVersions;
    },
  };
});

// Import after mocks
import { products } from './products.js';

describe('products routes - VersionService MikroORM migration', () => {
  let app: Hono;
  let mockEm: EntityManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear constructor calls tracking
    mockVersionConstructorCalls.length = 0;

    // Create mock EntityManager
    mockEm = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      flush: vi.fn(),
      fork: vi.fn().mockReturnThis(),
      getReference: vi.fn(),
      transactional: vi.fn((fn) => fn(mockEm)),
    } as unknown as EntityManager;

    // Setup mock responses for VersionService (must be after clearAllMocks!)
    mockCreateVersion.mockResolvedValue({ id: 'version_123', status: 'DRAFT', workspace: 'DESIGN' });
    mockListVersions.mockResolvedValue([{ id: 'version_123', status: 'DRAFT', workspace: 'DESIGN' }]);

    // Create new Hono app with products routes
    app = new Hono();

    // Middleware to inject mock EntityManager into context
    app.use('*', async (c, next) => {
      c.set('_mockEm', mockEm);
      await next();
    });

    app.route('/api/v1/products', products);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('VersionService EntityManager from context', () => {
    it('should instantiate VersionService with EntityManager from context on POST /:id/versions', async () => {
      const callsBeforeRequest = mockVersionConstructorCalls.length;

      const res = await app.request('/api/v1/products/product_123/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'DESIGN' }),
      });

      expect(res.status).toBe(201);

      // A new VersionService should have been instantiated during the request
      const callsDuringRequest = mockVersionConstructorCalls.slice(callsBeforeRequest);
      expect(callsDuringRequest.length).toBeGreaterThan(0);

      // The service should have been instantiated with the mock EntityManager from context
      expect(callsDuringRequest[callsDuringRequest.length - 1]).toBe(mockEm);
    });

    it('should instantiate VersionService with EntityManager from context on GET /:id/versions', async () => {
      const callsBeforeRequest = mockVersionConstructorCalls.length;

      const res = await app.request('/api/v1/products/product_123/versions');

      expect(res.status).toBe(200);

      // A new VersionService should have been instantiated during the request
      const callsDuringRequest = mockVersionConstructorCalls.slice(callsBeforeRequest);
      expect(callsDuringRequest.length).toBeGreaterThan(0);

      // The service should have been instantiated with the mock EntityManager from context
      expect(callsDuringRequest[callsDuringRequest.length - 1]).toBe(mockEm);
    });

    it('should use fresh VersionService for each request (not static)', async () => {
      const callsBeforeFirstRequest = mockVersionConstructorCalls.length;

      // First request
      await app.request('/api/v1/products/product_123/versions');
      const callsAfterFirst = mockVersionConstructorCalls.length;

      // Second request
      await app.request('/api/v1/products/product_456/versions');
      const callsAfterSecond = mockVersionConstructorCalls.length;

      // Each request should instantiate a new service
      expect(callsAfterFirst).toBeGreaterThan(callsBeforeFirstRequest);
      expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
    });

    it('should NOT use static prisma - VersionService must be created per-request with context EM', async () => {
      const callsBeforeRequest = mockVersionConstructorCalls.length;

      await app.request('/api/v1/products/product_123/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'DESIGN' }),
      });

      // Get the constructor call that happened during the request
      const callsDuringRequest = mockVersionConstructorCalls.slice(callsBeforeRequest);

      // There MUST be at least one constructor call during the request
      expect(callsDuringRequest.length).toBeGreaterThan(0);

      // And it must be called with the mock EntityManager (not prisma)
      const lastCallArg = callsDuringRequest[callsDuringRequest.length - 1];
      expect(lastCallArg).toBe(mockEm);
    });
  });

  describe('POST /api/v1/products/:id/versions', () => {
    it('should create version using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/products/product_123/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'DESIGN' }),
      });

      expect(res.status).toBe(201);
      // Service method should be called without organizationId (EntityManager is tenant-scoped)
      expect(mockCreateVersion).toHaveBeenCalledWith({
        productId: 'product_123',
        workspace: 'DESIGN',
        createdBy: 'user_123',
      });
    });
  });

  describe('GET /api/v1/products/:id/versions', () => {
    it('should list versions using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/products/product_123/versions');

      expect(res.status).toBe(200);
      // Service method should be called without organizationId (EntityManager is tenant-scoped)
      expect(mockListVersions).toHaveBeenCalledWith('product_123', undefined);
    });

    it('should pass workspace filter when provided', async () => {
      const res = await app.request('/api/v1/products/product_123/versions?workspace=DESIGN');

      expect(res.status).toBe(200);
      expect(mockListVersions).toHaveBeenCalledWith('product_123', 'DESIGN');
    });
  });
});
