import { describe, it, expect } from 'vitest';
import {
  BatchProducedSchema,
  MaterialConsumedSchema,
  QualityCheckSchema,
  InventoryAdjustmentSchema,
  validateEventPayload,
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
    it('should validate BATCH_PRODUCED event', () => {
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

      expect(() => validateEventPayload(input)).not.toThrow();
    });

    it('should reject unknown event type', () => {
      const input = {
        eventType: 'UNKNOWN_EVENT',
        payload: {},
      };

      expect(() => validateEventPayload(input)).toThrow();
    });
  });
});
