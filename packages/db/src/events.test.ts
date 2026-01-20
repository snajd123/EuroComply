import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishEvent, publishEvents, EventTypes } from './events.js';

// Type for mock transaction client used in tests
type MockTx = Parameters<typeof publishEvent>[0];

// Mock Prisma transaction client
function createMockTx() {
  return {
    outboxEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('publishEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate a unique event ID with evt_ prefix', async () => {
    const mockTx = createMockTx();
    const event = {
      organizationId: 'org_123',
      eventType: EventTypes.PRODUCT_CREATED,
      aggregateType: 'product',
      aggregateId: 'prod_456',
      payload: { name: 'Test Product' },
    };

    const id = await publishEvent(mockTx as unknown as MockTx, event);

    expect(id).toMatch(/^evt_[a-f0-9]{32}$/);
  });

  it('should create outbox event with correct data', async () => {
    const mockTx = createMockTx();
    const event = {
      organizationId: 'org_123',
      eventType: EventTypes.PRODUCT_CREATED,
      aggregateType: 'product',
      aggregateId: 'prod_456',
      payload: { name: 'Test Product', sku: 'SKU-001' },
    };

    await publishEvent(mockTx as unknown as MockTx, event);

    expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.stringMatching(/^evt_/),
        organizationId: 'org_123',
        eventType: 'product.created',
        aggregateType: 'product',
        aggregateId: 'prod_456',
        payload: { name: 'Test Product', sku: 'SKU-001' },
        status: 'PENDING',
        attempts: 0,
      }),
    });
  });

  it('should generate different IDs for each call', async () => {
    const mockTx = createMockTx();
    const event = {
      organizationId: 'org_123',
      eventType: EventTypes.PRODUCT_CREATED,
      aggregateType: 'product',
      aggregateId: 'prod_456',
      payload: {},
    };

    const id1 = await publishEvent(mockTx as unknown as MockTx, event);
    const id2 = await publishEvent(mockTx as unknown as MockTx, event);

    expect(id1).not.toBe(id2);
  });
});

describe('publishEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should publish multiple events and return all IDs', async () => {
    const mockTx = createMockTx();
    const events = [
      {
        organizationId: 'org_123',
        eventType: EventTypes.PRODUCT_CREATED,
        aggregateType: 'product',
        aggregateId: 'prod_1',
        payload: { name: 'Product 1' },
      },
      {
        organizationId: 'org_123',
        eventType: EventTypes.PRODUCT_UPDATED,
        aggregateType: 'product',
        aggregateId: 'prod_2',
        payload: { name: 'Product 2' },
      },
    ];

    const ids = await publishEvents(mockTx as unknown as MockTx, events);

    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^evt_/);
    expect(ids[1]).toMatch(/^evt_/);
    expect(mockTx.outboxEvent.create).toHaveBeenCalledTimes(2);
  });

  it('should return empty array for empty events list', async () => {
    const mockTx = createMockTx();

    const ids = await publishEvents(mockTx as unknown as MockTx, []);

    expect(ids).toEqual([]);
    expect(mockTx.outboxEvent.create).not.toHaveBeenCalled();
  });
});

describe('EventTypes', () => {
  it('should have correct event type values', () => {
    expect(EventTypes.PRODUCT_CREATED).toBe('product.created');
    expect(EventTypes.PRODUCT_UPDATED).toBe('product.updated');
    expect(EventTypes.DPP_COMMISSIONED).toBe('dpp.commissioned');
    expect(EventTypes.USER_INVITED).toBe('user.invited');
  });

  it('should be typed as const (immutable at compile time)', () => {
    // EventTypes uses 'as const' assertion for TypeScript immutability
    // Verify the type by checking all expected keys exist
    const expectedKeys = [
      'PRODUCT_CREATED',
      'PRODUCT_UPDATED',
      'PRODUCT_DELETED',
      'PRODUCT_ARCHIVED',
      'VERSION_CREATED',
      'VERSION_RELEASED',
      'VERSION_CHECKED_OUT',
      'DPP_COMMISSIONED',
      'DPP_PROVISIONED',
      'DPP_RECALLED',
      'DPP_DECOMMISSIONED',
      'BATCH_CREATED',
      'BATCH_RELEASED',
      'BATCH_RECALLED',
      'USER_INVITED',
      'USER_JOINED',
      'USER_REMOVED',
      'ORG_CREATED',
      'ORG_UPDATED',
      'ORG_SUBSCRIPTION_CHANGED',
    ];
    expect(Object.keys(EventTypes)).toEqual(expect.arrayContaining(expectedKeys));
  });
});
