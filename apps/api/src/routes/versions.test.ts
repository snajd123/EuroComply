import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { EntityManager } from '@mikro-orm/postgresql';

// Use vi.hoisted to ensure mock functions are available before imports
const {
  mockGetVersion,
  mockSubmitForReview,
  mockStartReview,
  mockReleaseVersion,
  mockRejectVersion,
  mockConstructorCalls,
} = vi.hoisted(() => ({
  mockGetVersion: vi.fn(),
  mockSubmitForReview: vi.fn(),
  mockStartReview: vi.fn(),
  mockReleaseVersion: vi.fn(),
  mockRejectVersion: vi.fn(),
  mockConstructorCalls: [] as unknown[],
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

// Mock VersionService as a class that tracks constructor calls
vi.mock('../services/version.service.js', () => {
  return {
    VersionService: class MockVersionService {
      constructor(public em: unknown) {
        mockConstructorCalls.push(em);
      }
      getVersion = mockGetVersion;
      submitForReview = mockSubmitForReview;
      startReview = mockStartReview;
      releaseVersion = mockReleaseVersion;
      rejectVersion = mockRejectVersion;
    },
  };
});

// Import after mocks
import { versions } from './versions.js';

describe('versions routes - MikroORM migration', () => {
  let app: Hono;
  let mockEm: EntityManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear constructor calls tracking
    mockConstructorCalls.length = 0;

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

    // Setup mock responses for service (must be after clearAllMocks!)
    mockGetVersion.mockResolvedValue({ id: 'version_123', workspace: 'DESIGN', status: 'DRAFT' });
    mockSubmitForReview.mockResolvedValue({ id: 'version_123', status: 'PENDING_REVIEW' });
    mockStartReview.mockResolvedValue({ id: 'version_123', status: 'IN_REVIEW' });
    mockReleaseVersion.mockResolvedValue({ id: 'version_123', status: 'RELEASED' });
    mockRejectVersion.mockResolvedValue({ id: 'version_123', status: 'REJECTED' });

    // Create new Hono app with versions routes
    app = new Hono();

    // Middleware to inject mock EntityManager into context
    app.use('*', async (c, next) => {
      c.set('_mockEm', mockEm);
      await next();
    });

    app.route('/api/v1/versions', versions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('EntityManager from context', () => {
    it('should instantiate VersionService with EntityManager from context on each request', async () => {
      const callsBeforeRequest = mockConstructorCalls.length;

      const res = await app.request('/api/v1/versions/version_123');

      expect(res.status).toBe(200);

      // A new service should have been instantiated during the request
      const callsDuringRequest = mockConstructorCalls.slice(callsBeforeRequest);
      expect(callsDuringRequest.length).toBeGreaterThan(0);

      // The service should have been instantiated with the mock EntityManager from context
      expect(callsDuringRequest[callsDuringRequest.length - 1]).toBe(mockEm);
    });

    it('should use fresh VersionService for each request (not static)', async () => {
      const callsBeforeFirstRequest = mockConstructorCalls.length;

      // First request
      await app.request('/api/v1/versions/version_123');
      const callsAfterFirst = mockConstructorCalls.length;

      // Second request
      await app.request('/api/v1/versions/version_123');
      const callsAfterSecond = mockConstructorCalls.length;

      // Each request should instantiate a new service
      expect(callsAfterFirst).toBeGreaterThan(callsBeforeFirstRequest);
      expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
    });

    it('should NOT use static prisma - service must be created per-request with context EM', async () => {
      const callsBeforeRequest = mockConstructorCalls.length;

      await app.request('/api/v1/versions/version_123');

      // Get the constructor call that happened during the request
      const callsDuringRequest = mockConstructorCalls.slice(callsBeforeRequest);

      // There MUST be at least one constructor call during the request
      expect(callsDuringRequest.length).toBeGreaterThan(0);

      // And it must be called with the mock EntityManager (not prisma)
      const lastCallArg = callsDuringRequest[callsDuringRequest.length - 1];
      expect(lastCallArg).toBe(mockEm);
    });
  });

  describe('GET /api/v1/versions/:id', () => {
    it('should get version using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/versions/version_123');

      expect(res.status).toBe(200);
      expect(mockGetVersion).toHaveBeenCalledWith('version_123');
    });
  });

  describe('POST /api/v1/versions/:id/submit', () => {
    it('should submit version for review using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/versions/version_123/submit', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      expect(mockSubmitForReview).toHaveBeenCalledWith('version_123');
    });
  });

  describe('POST /api/v1/versions/:id/review', () => {
    it('should start review using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/versions/version_123/review', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      expect(mockStartReview).toHaveBeenCalledWith('version_123');
    });
  });

  describe('POST /api/v1/versions/:id/release', () => {
    it('should release version using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/versions/version_123/release', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      // Verify called with versionId and userId (publishedBy for audit trail)
      expect(mockReleaseVersion).toHaveBeenCalledWith('version_123', 'user_123');
    });
  });

  describe('POST /api/v1/versions/:id/reject', () => {
    it('should reject version using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/versions/version_123/reject', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      expect(mockRejectVersion).toHaveBeenCalledWith('version_123');
    });
  });
});
