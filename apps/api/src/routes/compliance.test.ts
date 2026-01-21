import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { EntityManager } from '@mikro-orm/postgresql';

// Use vi.hoisted to ensure mock functions are available before imports
const {
  // ReadinessProfileService mocks
  mockProfileList,
  mockProfileGetById,
  mockProfileCreate,
  mockProfileUpdate,
  mockProfileDelete,
  mockProfileConstructorCalls,
  // DPPSnapshotService mocks
  mockCreateSnapshot,
  mockListSnapshots,
  mockGetSnapshot,
  mockVerify,
  mockAttest,
  mockSeal,
  mockIssue,
  mockRevoke,
  mockSnapshotConstructorCalls,
  // DPPReadinessService mocks
  mockCheckProductReadiness,
  mockGetReadyProducts,
  mockReadinessConstructorCalls,
  // Schema mocks
  mockValidateAuthority,
  mockValidateBody,
  mockListSnapshotsQuerySafeParse,
} = vi.hoisted(() => ({
  // ReadinessProfileService mocks
  mockProfileList: vi.fn(),
  mockProfileGetById: vi.fn(),
  mockProfileCreate: vi.fn(),
  mockProfileUpdate: vi.fn(),
  mockProfileDelete: vi.fn(),
  mockProfileConstructorCalls: [] as unknown[],
  // DPPSnapshotService mocks
  mockCreateSnapshot: vi.fn(),
  mockListSnapshots: vi.fn(),
  mockGetSnapshot: vi.fn(),
  mockVerify: vi.fn(),
  mockAttest: vi.fn(),
  mockSeal: vi.fn(),
  mockIssue: vi.fn(),
  mockRevoke: vi.fn(),
  mockSnapshotConstructorCalls: [] as unknown[],
  // DPPReadinessService mocks
  mockCheckProductReadiness: vi.fn(),
  mockGetReadyProducts: vi.fn(),
  mockReadinessConstructorCalls: [] as unknown[],
  // Schema mocks
  mockValidateAuthority: vi.fn(),
  mockValidateBody: vi.fn(),
  mockListSnapshotsQuerySafeParse: vi.fn(),
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

// Mock ReadinessProfileService as a class that tracks constructor calls
vi.mock('../services/readiness-profile.service.js', () => {
  return {
    ReadinessProfileService: class MockReadinessProfileService {
      constructor(public em: unknown) {
        mockProfileConstructorCalls.push(em);
      }
      list = mockProfileList;
      getById = mockProfileGetById;
      create = mockProfileCreate;
      update = mockProfileUpdate;
      delete = mockProfileDelete;
    },
  };
});

// Mock DPPSnapshotService as a class that tracks constructor calls
vi.mock('../services/dpp-snapshot.service.js', () => {
  return {
    DPPSnapshotService: class MockDPPSnapshotService {
      constructor(public em: unknown) {
        mockSnapshotConstructorCalls.push(em);
      }
      createSnapshot = mockCreateSnapshot;
      listSnapshots = mockListSnapshots;
      getSnapshot = mockGetSnapshot;
      verify = mockVerify;
      attest = mockAttest;
      seal = mockSeal;
      issue = mockIssue;
      revoke = mockRevoke;
    },
  };
});

// Mock DPPReadinessService as a class that tracks constructor calls
vi.mock('../services/dpp-readiness.service.js', () => {
  return {
    DPPReadinessService: class MockDPPReadinessService {
      constructor(public em: unknown) {
        mockReadinessConstructorCalls.push(em);
      }
      checkProductReadiness = mockCheckProductReadiness;
      getReadyProducts = mockGetReadyProducts;
    },
  };
});

// Mock schemas with .js extension
vi.mock('../lib/schemas.js', () => ({
  ListSnapshotsQuerySchema: {
    safeParse: mockListSnapshotsQuerySafeParse,
  },
  CreateReadinessProfileBodySchema: {},
  UpdateReadinessProfileBodySchema: {},
  CreateSnapshotBodySchema: {},
  AttestSnapshotBodySchema: {},
  SealSnapshotBodySchema: {},
  IssueSnapshotBodySchema: {},
  validateAuthority: mockValidateAuthority,
  validateBody: mockValidateBody,
}));

// Also mock without .js in case resolution differs
vi.mock('../lib/schemas', () => ({
  ListSnapshotsQuerySchema: {
    safeParse: mockListSnapshotsQuerySafeParse,
  },
  CreateReadinessProfileBodySchema: {},
  UpdateReadinessProfileBodySchema: {},
  CreateSnapshotBodySchema: {},
  AttestSnapshotBodySchema: {},
  SealSnapshotBodySchema: {},
  IssueSnapshotBodySchema: {},
  validateAuthority: mockValidateAuthority,
  validateBody: mockValidateBody,
}));

// Import after mocks
import { compliance } from './compliance.js';

describe('compliance routes - MikroORM migration', () => {
  let app: Hono;
  let mockEm: EntityManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear constructor calls tracking
    mockProfileConstructorCalls.length = 0;
    mockSnapshotConstructorCalls.length = 0;
    mockReadinessConstructorCalls.length = 0;

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

    // Setup mock responses for services (must be after clearAllMocks!)
    mockProfileList.mockResolvedValue([]);
    mockProfileGetById.mockResolvedValue({ id: 'profile_123', name: 'Test Profile' });
    mockProfileCreate.mockResolvedValue({ id: 'profile_new', name: 'New Profile' });
    mockProfileUpdate.mockResolvedValue({ id: 'profile_123', name: 'Updated Profile' });
    mockProfileDelete.mockResolvedValue(undefined);

    mockCreateSnapshot.mockResolvedValue({ id: 'snapshot_new', status: 'DRAFT' });
    mockListSnapshots.mockResolvedValue([]);
    mockGetSnapshot.mockResolvedValue({ id: 'snapshot_123', status: 'DRAFT' });
    mockVerify.mockResolvedValue({ id: 'snapshot_123', status: 'VERIFIED' });
    mockAttest.mockResolvedValue({ id: 'snapshot_123', status: 'ATTESTED' });
    mockSeal.mockResolvedValue({ id: 'snapshot_123', status: 'SEALED' });
    mockIssue.mockResolvedValue({ id: 'snapshot_123', status: 'ISSUED' });
    mockRevoke.mockResolvedValue({ id: 'snapshot_123', status: 'REVOKED' });

    mockCheckProductReadiness.mockResolvedValue({ ready: true, missingFields: [] });
    mockGetReadyProducts.mockResolvedValue([]);

    // Setup mock responses for schemas
    mockValidateAuthority.mockReturnValue('MANAGER');
    mockValidateBody.mockReturnValue({
      success: true,
      data: { name: 'Test', productId: 'prod_123' },
    });
    mockListSnapshotsQuerySafeParse.mockReturnValue({ success: true, data: { limit: 50, offset: 0 } });

    // Create new Hono app with compliance routes
    app = new Hono();

    // Middleware to inject mock EntityManager into context
    app.use('*', async (c, next) => {
      c.set('_mockEm', mockEm);
      await next();
    });

    app.route('/api/v1/compliance', compliance);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('EntityManager from context - ReadinessProfileService', () => {
    it('should instantiate ReadinessProfileService with EntityManager from context on each request', async () => {
      const callsBeforeRequest = mockProfileConstructorCalls.length;

      const res = await app.request('/api/v1/compliance/profiles');

      expect(res.status).toBe(200);

      // A new service should have been instantiated during the request
      const callsDuringRequest = mockProfileConstructorCalls.slice(callsBeforeRequest);
      expect(callsDuringRequest.length).toBeGreaterThan(0);

      // The service should have been instantiated with the mock EntityManager from context
      expect(callsDuringRequest[callsDuringRequest.length - 1]).toBe(mockEm);
    });

    it('should use fresh ReadinessProfileService for each request (not static)', async () => {
      const callsBeforeFirstRequest = mockProfileConstructorCalls.length;

      // First request
      await app.request('/api/v1/compliance/profiles');
      const callsAfterFirst = mockProfileConstructorCalls.length;

      // Second request
      await app.request('/api/v1/compliance/profiles');
      const callsAfterSecond = mockProfileConstructorCalls.length;

      // Each request should instantiate a new service
      expect(callsAfterFirst).toBeGreaterThan(callsBeforeFirstRequest);
      expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
    });
  });

  describe('EntityManager from context - DPPSnapshotService', () => {
    it('should instantiate DPPSnapshotService with EntityManager from context on each request', async () => {
      const callsBeforeRequest = mockSnapshotConstructorCalls.length;

      const res = await app.request('/api/v1/compliance/snapshots');

      expect(res.status).toBe(200);

      // A new service should have been instantiated during the request
      const callsDuringRequest = mockSnapshotConstructorCalls.slice(callsBeforeRequest);
      expect(callsDuringRequest.length).toBeGreaterThan(0);

      // The service should have been instantiated with the mock EntityManager from context
      expect(callsDuringRequest[callsDuringRequest.length - 1]).toBe(mockEm);
    });

    it('should use fresh DPPSnapshotService for each request (not static)', async () => {
      const callsBeforeFirstRequest = mockSnapshotConstructorCalls.length;

      // First request
      await app.request('/api/v1/compliance/snapshots');
      const callsAfterFirst = mockSnapshotConstructorCalls.length;

      // Second request
      await app.request('/api/v1/compliance/snapshots');
      const callsAfterSecond = mockSnapshotConstructorCalls.length;

      // Each request should instantiate a new service
      expect(callsAfterFirst).toBeGreaterThan(callsBeforeFirstRequest);
      expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
    });
  });

  describe('EntityManager from context - DPPReadinessService', () => {
    it('should instantiate DPPReadinessService with EntityManager from context on each request', async () => {
      const callsBeforeRequest = mockReadinessConstructorCalls.length;

      const res = await app.request('/api/v1/compliance/readiness?profileId=profile_123');

      expect(res.status).toBe(200);

      // A new service should have been instantiated during the request
      const callsDuringRequest = mockReadinessConstructorCalls.slice(callsBeforeRequest);
      expect(callsDuringRequest.length).toBeGreaterThan(0);

      // The service should have been instantiated with the mock EntityManager from context
      expect(callsDuringRequest[callsDuringRequest.length - 1]).toBe(mockEm);
    });

    it('should use fresh DPPReadinessService for each request (not static)', async () => {
      const callsBeforeFirstRequest = mockReadinessConstructorCalls.length;

      // First request
      await app.request('/api/v1/compliance/readiness?profileId=profile_123');
      const callsAfterFirst = mockReadinessConstructorCalls.length;

      // Second request
      await app.request('/api/v1/compliance/readiness?profileId=profile_123');
      const callsAfterSecond = mockReadinessConstructorCalls.length;

      // Each request should instantiate a new service
      expect(callsAfterFirst).toBeGreaterThan(callsBeforeFirstRequest);
      expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
    });
  });

  describe('GET /api/v1/compliance/profiles', () => {
    it('should list profiles using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/compliance/profiles');

      expect(res.status).toBe(200);
      expect(mockProfileList).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/compliance/profiles/:id', () => {
    it('should get profile by ID using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/compliance/profiles/profile_123');

      expect(res.status).toBe(200);
      expect(mockProfileGetById).toHaveBeenCalledWith('profile_123');
    });
  });

  describe('POST /api/v1/compliance/profiles', () => {
    it('should create profile using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/compliance/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Profile' }),
      });

      expect(res.status).toBe(201);
      expect(mockProfileCreate).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/compliance/snapshots', () => {
    it('should list snapshots using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/compliance/snapshots');

      expect(res.status).toBe(200);
      expect(mockListSnapshots).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/compliance/snapshots', () => {
    it('should create snapshot using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/compliance/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 'prod_123' }),
      });

      expect(res.status).toBe(201);
      expect(mockCreateSnapshot).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/compliance/readiness', () => {
    it('should get ready products using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/compliance/readiness?profileId=profile_123');

      expect(res.status).toBe(200);
      expect(mockGetReadyProducts).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/compliance/snapshots/:id/verify', () => {
    it('should verify snapshot using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/compliance/snapshots/snapshot_123/verify', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      expect(mockVerify).toHaveBeenCalled();
    });
  });
});
