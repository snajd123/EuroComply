import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { EntityManager } from '@mikro-orm/postgresql';

// Use vi.hoisted to ensure mock functions are available before imports
const {
  mockRecordEvent,
  mockVerifyEvent,
  mockGetEvent,
  mockListEvents,
  mockVerifyChainIntegrity,
  mockConstructorCalls,
  mockValidateAuthority,
  mockValidateBody,
  mockListEventsQuerySafeParse,
} = vi.hoisted(() => ({
  mockRecordEvent: vi.fn(),
  mockVerifyEvent: vi.fn(),
  mockGetEvent: vi.fn(),
  mockListEvents: vi.fn(),
  mockVerifyChainIntegrity: vi.fn(),
  mockConstructorCalls: [] as unknown[],
  mockValidateAuthority: vi.fn().mockReturnValue('MANAGER'),
  mockValidateBody: vi.fn().mockReturnValue({
    success: true,
    data: { eventType: 'BATCH_PRODUCED', payload: { productId: 'prod_123' } },
  }),
  mockListEventsQuerySafeParse: vi.fn().mockReturnValue({ success: true, data: { limit: 50, offset: 0 } }),
}));

// Mock auth middleware to inject context
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c, next) => {
    // Simulate what auth middleware does - sets em and other context
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

// Mock the OperationsEventService as a class that tracks constructor calls
vi.mock('../services/operations-event.service.js', () => {
  return {
    OperationsEventService: class MockOperationsEventService {
      constructor(public em: unknown) {
        mockConstructorCalls.push(em);
      }
      recordEvent = mockRecordEvent;
      verifyEvent = mockVerifyEvent;
      getEvent = mockGetEvent;
      listEvents = mockListEvents;
      verifyChainIntegrity = mockVerifyChainIntegrity;
    },
  };
});

// Note: We don't mock @eurocomply/shared - use the real implementation
// The real hasAuthority function works correctly with string authority levels

// Mock schemas with .js extension to match the route's import
vi.mock('../lib/schemas.js', () => ({
  ListEventsQuerySchema: {
    safeParse: mockListEventsQuerySafeParse,
  },
  CreateOperationsEventBodySchema: {},
  validateAuthority: mockValidateAuthority,
  validateBody: mockValidateBody,
}));

// Also mock without .js in case resolution differs
vi.mock('../lib/schemas', () => ({
  ListEventsQuerySchema: {
    safeParse: mockListEventsQuerySafeParse,
  },
  CreateOperationsEventBodySchema: {},
  validateAuthority: mockValidateAuthority,
  validateBody: mockValidateBody,
}));

// Import after mocks
import { operationsEvents } from './operations-events.js';

describe('operations-events routes - MikroORM migration', () => {
  let app: Hono;
  let mockEm: EntityManager;
  // Track how many constructor calls existed before each test
  let constructorCallsBeforeTest: number;

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

    // Setup mock responses for service
    mockListEvents.mockResolvedValue([]);
    mockGetEvent.mockResolvedValue({ id: 'evt_123', eventType: 'BATCH_PRODUCED' });
    mockVerifyChainIntegrity.mockResolvedValue({ valid: true, checkedCount: 0 });
    mockRecordEvent.mockResolvedValue({ id: 'evt_new', eventType: 'BATCH_PRODUCED' });
    mockVerifyEvent.mockResolvedValue({ id: 'evt_123', status: 'VERIFIED' });

    // Setup mock responses for schemas (must be after clearAllMocks!)
    mockValidateAuthority.mockReturnValue('MANAGER');
    mockValidateBody.mockReturnValue({
      success: true,
      data: { eventType: 'BATCH_PRODUCED', payload: { productId: 'prod_123' } },
    });
    mockListEventsQuerySafeParse.mockReturnValue({ success: true, data: { limit: 50, offset: 0 } });

    // Create new Hono app with operations-events routes
    app = new Hono();

    // Middleware to inject mock EntityManager into context
    app.use('*', async (c, next) => {
      c.set('_mockEm', mockEm);
      await next();
    });

    app.route('/api/v1/operations/events', operationsEvents);

    // Track constructor calls that happened during module import
    constructorCallsBeforeTest = mockConstructorCalls.length;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('EntityManager from context', () => {
    it('should instantiate OperationsEventService with EntityManager from context on each request', async () => {
      const callsBeforeRequest = mockConstructorCalls.length;

      const res = await app.request('/api/v1/operations/events');

      expect(res.status).toBe(200);

      // A new service should have been instantiated during the request
      const callsDuringRequest = mockConstructorCalls.slice(callsBeforeRequest);
      expect(callsDuringRequest.length).toBeGreaterThan(0);

      // The service should have been instantiated with the mock EntityManager from context
      expect(callsDuringRequest[callsDuringRequest.length - 1]).toBe(mockEm);
    });

    it('should use fresh EntityManager for each request (not static)', async () => {
      const callsBeforeFirstRequest = mockConstructorCalls.length;

      // First request
      await app.request('/api/v1/operations/events');
      const callsAfterFirst = mockConstructorCalls.length;

      // Second request
      await app.request('/api/v1/operations/events');
      const callsAfterSecond = mockConstructorCalls.length;

      // Each request should instantiate a new service with the context's EntityManager
      // So we should have more constructor calls after each request
      expect(callsAfterFirst).toBeGreaterThan(callsBeforeFirstRequest);
      expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
    });

    it('should NOT use static prisma - service must be created per-request with context EM', async () => {
      // The module currently creates a static service at import time with prisma.
      // After migration, no static service should exist - only per-request instantiation.
      // We verify this by checking that each request creates a new service with context EM.

      const callsBeforeRequest = mockConstructorCalls.length;

      await app.request('/api/v1/operations/events');

      // Get the constructor call that happened during the request
      const callsDuringRequest = mockConstructorCalls.slice(callsBeforeRequest);

      // There MUST be at least one constructor call during the request
      // (not just relying on a static module-level instance)
      expect(callsDuringRequest.length).toBeGreaterThan(0);

      // And it must be called with the mock EntityManager (not prisma)
      const lastCallArg = callsDuringRequest[callsDuringRequest.length - 1];
      expect(lastCallArg).toBe(mockEm);
    });
  });

  describe('GET /api/v1/operations/events', () => {
    it('should list events using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/operations/events');

      expect(res.status).toBe(200);
      expect(mockListEvents).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/operations/events/integrity', () => {
    it('should verify chain integrity using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/operations/events/integrity');

      expect(res.status).toBe(200);
      expect(mockVerifyChainIntegrity).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/operations/events/:id', () => {
    it('should get event by ID using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/operations/events/evt_123');

      expect(res.status).toBe(200);
      expect(mockGetEvent).toHaveBeenCalledWith('evt_123');
    });
  });

  describe('POST /api/v1/operations/events', () => {
    it('should record event using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/operations/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'BATCH_PRODUCED',
          payload: { productId: 'prod_123' },
        }),
      });

      expect(res.status).toBe(201);
      expect(mockRecordEvent).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/operations/events/:id/verify', () => {
    it('should verify event using service with context EntityManager', async () => {
      const res = await app.request('/api/v1/operations/events/evt_123/verify', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      expect(mockVerifyEvent).toHaveBeenCalledWith('evt_123', 'user_123');
    });
  });
});
