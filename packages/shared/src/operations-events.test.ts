import { describe, it, expect } from 'vitest';
import {
  BatchProducedSchema,
  MaterialConsumedSchema,
  QualityCheckSchema,
  InventoryAdjustmentSchema,
  validateEventPayload,
  validateEventPayloadOrThrow,
} from './operations-events.js';

describe('Operations Event Schemas', () => {
  describe('BatchProducedSchema', () => {
    it('should validate a valid batch produced payload', () => {
      const payload = {
        productId: 'prod_123',
        designVersionId: 'ver_456',
        batchNumber: 'BATCH-2026-001',
        quantity: 1000,
        unit: 'PCS',
        facilityId: 'fac_789',
        startedAt: '2026-01-18T08:00:00Z',
        completedAt: '2026-01-18T16:00:00Z',
      };

      const result = BatchProducedSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject negative quantity', () => {
      const payload = {
        productId: 'prod_123',
        designVersionId: 'ver_456',
        batchNumber: 'BATCH-2026-001',
        quantity: -100,
        unit: 'PCS',
        facilityId: 'fac_789',
        startedAt: '2026-01-18T08:00:00Z',
        completedAt: '2026-01-18T16:00:00Z',
      };

      const result = BatchProducedSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('validateEventPayload', () => {
    it('should return success for valid BATCH_PRODUCED event', () => {
      const input = {
        eventType: 'BATCH_PRODUCED' as const,
        payload: {
          productId: 'prod_123',
          designVersionId: 'ver_456',
          batchNumber: 'BATCH-2026-001',
          quantity: 1000,
          unit: 'PCS',
          facilityId: 'fac_789',
          startedAt: '2026-01-18T08:00:00Z',
          completedAt: '2026-01-18T16:00:00Z',
        },
      };

      const result = validateEventPayload(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.productId).toBe('prod_123');
      }
    });

    it('should return failure for unknown event type', () => {
      const input = {
        eventType: 'UNKNOWN_EVENT',
        payload: {},
      };

      const result = validateEventPayload(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        expect(firstIssue?.message).toContain('Unknown event type');
      }
    });

    it('should return failure for invalid payload', () => {
      const input = {
        eventType: 'BATCH_PRODUCED' as const,
        payload: {
          productId: 'prod_123',
          // Missing required fields
        },
      };

      const result = validateEventPayload(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validateEventPayloadOrThrow', () => {
    it('should not throw for valid event', () => {
      const input = {
        eventType: 'BATCH_PRODUCED',
        payload: {
          productId: 'prod_123',
          designVersionId: 'ver_456',
          batchNumber: 'BATCH-2026-001',
          quantity: 1000,
          unit: 'PCS',
          facilityId: 'fac_789',
          startedAt: '2026-01-18T08:00:00Z',
          completedAt: '2026-01-18T16:00:00Z',
        },
      };

      expect(() => validateEventPayloadOrThrow(input)).not.toThrow();
    });

    it('should throw for unknown event type', () => {
      const input = {
        eventType: 'UNKNOWN_EVENT',
        payload: {},
      };

      expect(() => validateEventPayloadOrThrow(input)).toThrow('Unknown event type');
    });
  });
});
