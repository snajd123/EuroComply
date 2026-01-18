import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { OperationsEventService } from './operations-event.service.js';
import { ValidationError } from '../lib/errors.js';

interface MockPrismaClient {
  operationsEvent: {
    create: Mock;
    findFirst: Mock;
    findMany: Mock;
    update: Mock;
  };
  organization: {
    findUnique: Mock;
    update: Mock;
  };
  $transaction: Mock;
}

const mockPrisma: MockPrismaClient = {
  operationsEvent: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn((fn) => fn(mockPrisma)),
};

describe('OperationsEventService', () => {
  let service: OperationsEventService;
  const orgId = 'org_test123';
  const userId = 'user_123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OperationsEventService(mockPrisma as any);
  });

  describe('recordEvent', () => {
    it('should create first event with sequence 1 and GENESIS hash', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        lastEventHash: null,
        eventSequence: 0,
      });
      mockPrisma.operationsEvent.create.mockResolvedValue({
        id: 'evt_123',
        eventType: 'BATCH_PRODUCED',
        sequenceNumber: 1,
        eventHash: 'abc123',
        previousEventHash: 'GENESIS',
      });
      mockPrisma.organization.update.mockResolvedValue({});

      const result = await service.recordEvent(orgId, userId, {
        eventType: 'BATCH_PRODUCED',
        payload: {
          productId: 'prod_123',
          designVersionId: 'ver_456',
          batchNumber: 'BATCH-001',
          quantity: 100,
          unit: 'PCS',
          facilityId: 'fac_789',
          startedAt: '2026-01-18T08:00:00Z',
          completedAt: '2026-01-18T16:00:00Z',
        },
      });

      expect(result.sequenceNumber).toBe(1);
      expect(result.previousEventHash).toBe('GENESIS');
    });

    it('should chain events with previous hash', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        lastEventHash: 'previous_hash_abc',
        eventSequence: 5,
      });
      mockPrisma.operationsEvent.create.mockResolvedValue({
        id: 'evt_124',
        eventType: 'MATERIAL_CONSUMED',
        sequenceNumber: 6,
        eventHash: 'new_hash_xyz',
        previousEventHash: 'previous_hash_abc',
      });
      mockPrisma.organization.update.mockResolvedValue({});

      const result = await service.recordEvent(orgId, userId, {
        eventType: 'MATERIAL_CONSUMED',
        payload: {
          batchId: 'batch_123',
          materialLotId: 'lot_456',
          quantity: 50,
          unit: 'KG',
          wasteQuantity: 2,
        },
      });

      expect(result.sequenceNumber).toBe(6);
      expect(result.previousEventHash).toBe('previous_hash_abc');
    });

    it('should reject invalid payload', async () => {
      await expect(
        service.recordEvent(orgId, userId, {
          eventType: 'BATCH_PRODUCED',
          payload: { invalid: 'data' },
        })
      ).rejects.toThrow();
    });
  });

  describe('verifyEvent', () => {
    it('should seal event with EDITOR signature', async () => {
      mockPrisma.operationsEvent.findFirst.mockResolvedValue({
        id: 'evt_123',
        status: 'PENDING_VERIFICATION',
        organizationId: orgId,
      });
      mockPrisma.operationsEvent.update.mockResolvedValue({
        id: 'evt_123',
        status: 'VERIFIED',
        verifiedBy: userId,
        verifiedAt: new Date(),
      });

      const result = await service.verifyEvent(orgId, 'evt_123', userId);

      expect(result.status).toBe('VERIFIED');
      expect(result.verifiedBy).toBe(userId);
    });

    it('should reject already verified event', async () => {
      mockPrisma.operationsEvent.findFirst.mockResolvedValue({
        id: 'evt_123',
        status: 'VERIFIED',
        organizationId: orgId,
      });

      await expect(
        service.verifyEvent(orgId, 'evt_123', userId)
      ).rejects.toThrow(ValidationError);
    });
  });
});
