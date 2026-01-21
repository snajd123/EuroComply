import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OutboxProcessor } from './outbox-processor.js';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { OutboxStatus } from '@eurocomply/db';

// Mock the db package
vi.mock('@eurocomply/db', async () => {
  const actual = await vi.importActual('@eurocomply/db');
  return {
    ...actual,
    listTenantSchemas: vi.fn(),
    createTenantEm: vi.fn(),
    MikroOrm: {
      OutboxEvent: class OutboxEvent {},
    },
    OutboxStatus: {
      PENDING: 'PENDING',
      PROCESSING: 'PROCESSING',
      DELIVERED: 'DELIVERED',
      FAILED: 'FAILED',
    },
  };
});

// Import mocked functions
import { listTenantSchemas, createTenantEm } from '@eurocomply/db';

const mockListTenantSchemas = listTenantSchemas as ReturnType<typeof vi.fn>;
const mockCreateTenantEm = createTenantEm as ReturnType<typeof vi.fn>;

describe('OutboxProcessor', () => {
  let processor: OutboxProcessor;
  let mockOrm: MikroORM;
  let mockEm: EntityManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    processor = new OutboxProcessor();

    // Create mock EntityManager
    mockEm = {
      find: vi.fn().mockResolvedValue([]),
      flush: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    } as unknown as EntityManager;

    // Create mock ORM
    mockOrm = {
      em: {
        fork: vi.fn().mockReturnValue(mockEm),
      },
    } as unknown as MikroORM;

    // Setup default mocks
    mockListTenantSchemas.mockResolvedValue([]);
    mockCreateTenantEm.mockReturnValue(mockEm);
  });

  afterEach(() => {
    processor.stop();
    vi.useRealTimers();
  });

  describe('handler registration', () => {
    it('should register handlers for specific event types', () => {
      const handler = vi.fn();
      processor.on('USER_CREATED', handler);

      // Handler is registered (internal state)
      expect(() => processor.on('USER_CREATED', vi.fn())).not.toThrow();
    });

    it('should register wildcard handlers with onAll', () => {
      const handler = vi.fn();
      processor.onAll(handler);

      // Handler is registered (internal state)
      expect(() => processor.onAll(vi.fn())).not.toThrow();
    });
  });

  describe('start/stop lifecycle', () => {
    it('should accept MikroORM instance on start', () => {
      // This test verifies the new signature: start(orm: MikroORM)
      expect(() => processor.start(mockOrm)).not.toThrow();
    });

    it('should warn if already running', () => {
      processor.start(mockOrm);
      // Second start should not throw but should be a no-op
      expect(() => processor.start(mockOrm)).not.toThrow();
    });

    it('should stop gracefully', () => {
      processor.start(mockOrm);
      expect(() => processor.stop()).not.toThrow();
    });

    it('should clear ORM reference on stop', () => {
      processor.start(mockOrm);
      processor.stop();
      // Subsequent operations should be no-ops
      expect(() => processor.stop()).not.toThrow();
    });
  });

  describe('tenant schema iteration (Sovereign Relay Pattern)', () => {
    it('should call listTenantSchemas to get all tenant schemas', async () => {
      mockListTenantSchemas.mockResolvedValue(['tenant_acme', 'tenant_globex']);

      processor.start(mockOrm);

      // Advance timer to trigger first poll
      await vi.advanceTimersByTimeAsync(100);

      expect(mockListTenantSchemas).toHaveBeenCalledWith(mockOrm);
    });

    it('should create tenant-scoped EntityManager for each schema', async () => {
      mockListTenantSchemas.mockResolvedValue(['tenant_acme', 'tenant_globex']);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockCreateTenantEm).toHaveBeenCalledWith(mockOrm, 'tenant_acme');
      expect(mockCreateTenantEm).toHaveBeenCalledWith(mockOrm, 'tenant_globex');
    });

    it('should process events from each tenant schema independently', async () => {
      const acmeEm = {
        find: vi.fn().mockResolvedValue([]),
        flush: vi.fn(),
        clear: vi.fn(),
      } as unknown as EntityManager;

      const globexEm = {
        find: vi.fn().mockResolvedValue([]),
        flush: vi.fn(),
        clear: vi.fn(),
      } as unknown as EntityManager;

      mockListTenantSchemas.mockResolvedValue(['tenant_acme', 'tenant_globex']);
      mockCreateTenantEm
        .mockReturnValueOnce(acmeEm)
        .mockReturnValueOnce(globexEm);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      // Each tenant's EM should have been queried
      expect(acmeEm.find).toHaveBeenCalled();
      expect(globexEm.find).toHaveBeenCalled();
    });

    it('should clear EntityManager after processing each tenant', async () => {
      mockListTenantSchemas.mockResolvedValue(['tenant_acme']);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockEm.clear).toHaveBeenCalled();
    });
  });

  describe('event processing', () => {
    it('should fetch PENDING events from tenant outbox', async () => {
      mockListTenantSchemas.mockResolvedValue(['tenant_acme']);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(), // OutboxEvent entity
        expect.objectContaining({
          $or: expect.arrayContaining([
            { status: OutboxStatus.PENDING },
          ]),
        }),
        expect.objectContaining({
          orderBy: { createdAt: 'ASC' },
          limit: expect.any(Number),
        })
      );
    });

    it('should fetch FAILED events eligible for retry', async () => {
      mockListTenantSchemas.mockResolvedValue(['tenant_acme']);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $or: expect.arrayContaining([
            expect.objectContaining({
              status: OutboxStatus.FAILED,
              attempts: { $lt: expect.any(Number) },
            }),
          ]),
        }),
        expect.anything()
      );
    });

    it('should execute registered handlers for event type', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      processor.on('USER_CREATED', handler);

      const mockEvent = {
        id: 'evt_123',
        eventType: 'USER_CREATED',
        status: OutboxStatus.PENDING,
        attempts: 0,
        payload: { userId: 'user_123' },
      };

      mockListTenantSchemas.mockResolvedValue(['tenant_acme']);
      mockEm.find = vi.fn().mockResolvedValue([mockEvent]);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledWith(mockEvent);
    });

    it('should execute wildcard handlers for all events', async () => {
      const wildcardHandler = vi.fn().mockResolvedValue(undefined);
      processor.onAll(wildcardHandler);

      const mockEvent = {
        id: 'evt_123',
        eventType: 'PRODUCT_UPDATED',
        status: OutboxStatus.PENDING,
        attempts: 0,
        payload: {},
      };

      mockListTenantSchemas.mockResolvedValue(['tenant_acme']);
      mockEm.find = vi.fn().mockResolvedValue([mockEvent]);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      expect(wildcardHandler).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe('status transitions', () => {
    it('should transition event to PROCESSING before executing handlers', async () => {
      let statusDuringHandler: string | undefined;
      const handler = vi.fn().mockImplementation(async (event: { status: string }) => {
        // Capture the status when handler runs
        statusDuringHandler = event.status;
      });
      processor.on('TEST_EVENT', handler);

      const mockEvent = {
        id: 'evt_123',
        eventType: 'TEST_EVENT',
        status: OutboxStatus.PENDING,
        attempts: 0,
        payload: {},
      };

      mockListTenantSchemas.mockResolvedValue(['tenant_acme']);
      mockEm.find = vi.fn().mockResolvedValue([mockEvent]);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      // Event should have been PROCESSING when handler was called
      expect(statusDuringHandler).toBe(OutboxStatus.PROCESSING);
      // And flush should have been called to persist that state
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should transition to DELIVERED on successful processing', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      processor.on('TEST_EVENT', handler);

      const mockEvent = {
        id: 'evt_123',
        eventType: 'TEST_EVENT',
        status: OutboxStatus.PENDING,
        attempts: 0,
        payload: {},
        processedAt: undefined as Date | undefined,
      };

      mockListTenantSchemas.mockResolvedValue(['tenant_acme']);
      mockEm.find = vi.fn().mockResolvedValue([mockEvent]);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockEvent.status).toBe(OutboxStatus.DELIVERED);
      expect(mockEvent.processedAt).toBeInstanceOf(Date);
    });

    it('should transition to FAILED on handler error', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler failed'));
      processor.on('TEST_EVENT', handler);

      const mockEvent = {
        id: 'evt_123',
        eventType: 'TEST_EVENT',
        status: OutboxStatus.PENDING,
        attempts: 0,
        payload: {},
        lastError: undefined as string | undefined,
        processedAt: undefined as Date | undefined,
      };

      mockListTenantSchemas.mockResolvedValue(['tenant_acme']);
      mockEm.find = vi.fn().mockResolvedValue([mockEvent]);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockEvent.status).toBe(OutboxStatus.FAILED);
      expect(mockEvent.attempts).toBe(1);
      expect(mockEvent.lastError).toBe('Handler failed');
      expect(mockEvent.processedAt).toBeInstanceOf(Date);
    });
  });

  describe('backoff logic', () => {
    it('should skip FAILED events that are not ready for retry', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      processor.on('TEST_EVENT', handler);

      const recentFailure = {
        id: 'evt_123',
        eventType: 'TEST_EVENT',
        status: OutboxStatus.FAILED,
        attempts: 1,
        payload: {},
        processedAt: new Date(), // Just failed, not ready for retry
      };

      mockListTenantSchemas.mockResolvedValue(['tenant_acme']);
      mockEm.find = vi.fn().mockResolvedValue([recentFailure]);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      // Handler should not be called because event is in backoff
      expect(handler).not.toHaveBeenCalled();
    });

    it('should process FAILED events after backoff period', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      processor.on('TEST_EVENT', handler);

      const oldFailure = {
        id: 'evt_123',
        eventType: 'TEST_EVENT',
        status: OutboxStatus.FAILED,
        attempts: 1,
        payload: {},
        processedAt: new Date(Date.now() - 120000), // Failed 2 minutes ago (past 1s backoff)
      };

      mockListTenantSchemas.mockResolvedValue(['tenant_acme']);
      mockEm.find = vi.fn().mockResolvedValue([oldFailure]);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('error isolation', () => {
    it('should continue processing other tenants if one fails', async () => {
      const acmeEm = {
        find: vi.fn().mockRejectedValue(new Error('Acme DB error')),
        flush: vi.fn(),
        clear: vi.fn(),
      } as unknown as EntityManager;

      const globexEm = {
        find: vi.fn().mockResolvedValue([]),
        flush: vi.fn(),
        clear: vi.fn(),
      } as unknown as EntityManager;

      mockListTenantSchemas.mockResolvedValue(['tenant_acme', 'tenant_globex']);
      mockCreateTenantEm
        .mockReturnValueOnce(acmeEm)
        .mockReturnValueOnce(globexEm);

      processor.start(mockOrm);
      await vi.advanceTimersByTimeAsync(100);

      // Globex should still be processed even though Acme failed
      expect(globexEm.find).toHaveBeenCalled();
    });

    it('should continue polling after batch errors', async () => {
      mockListTenantSchemas.mockRejectedValueOnce(new Error('DB connection lost'));
      mockListTenantSchemas.mockResolvedValue(['tenant_acme']);

      processor.start(mockOrm);

      // First poll fails (immediate on start)
      await vi.advanceTimersByTimeAsync(0);

      // Let first poll complete and schedule next
      await vi.advanceTimersByTimeAsync(100);

      // Second poll should have happened
      expect(mockListTenantSchemas).toHaveBeenCalledTimes(2);
    });
  });
});
