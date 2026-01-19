import { z } from 'zod';

// ============================================
// EVENT TYPE CONSTANTS
// ============================================

export const EVENT_TYPES = [
  'BATCH_PRODUCED',
  'MATERIAL_CONSUMED',
  'GOODS_RECEIVED',
  'GOODS_SHIPPED',
  'QUALITY_CHECK',
  'INVENTORY_ADJUSTMENT',
  'SUPPLIER_AUDIT',
] as const;

export type EventType = typeof EVENT_TYPES[number];

export const EVENT_STATUSES = ['PENDING_VERIFICATION', 'VERIFIED'] as const;
export type EventStatus = typeof EVENT_STATUSES[number];

// ============================================
// EVENT PAYLOAD SCHEMAS
// ============================================

export const BatchProducedSchema = z.object({
  productId: z.string(),
  designVersionId: z.string(),
  batchNumber: z.string(),
  quantity: z.number().positive(),
  unit: z.enum(['PCS', 'KG', 'M', 'L', 'M2', 'M3']),
  facilityId: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});

export type BatchProducedPayload = z.infer<typeof BatchProducedSchema>;

export const MaterialConsumedSchema = z.object({
  batchId: z.string(),
  materialLotId: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  wasteQuantity: z.number().nonnegative().default(0),
});

export type MaterialConsumedPayload = z.infer<typeof MaterialConsumedSchema>;

export const GoodsReceivedSchema = z.object({
  supplierId: z.string(),
  purchaseOrderId: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
    unit: z.string(),
    lotNumber: z.string().optional(),
  })),
  receivedAt: z.string().datetime(),
  facilityId: z.string(),
});

export type GoodsReceivedPayload = z.infer<typeof GoodsReceivedSchema>;

export const GoodsShippedSchema = z.object({
  destinationId: z.string(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
    unit: z.string(),
    batchNumber: z.string().optional(),
  })),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  shippedAt: z.string().datetime(),
});

export type GoodsShippedPayload = z.infer<typeof GoodsShippedSchema>;

export const QualityCheckSchema = z.object({
  targetId: z.string(),
  targetType: z.enum(['BATCH', 'MATERIAL', 'PRODUCT']),
  checkType: z.string(),
  passed: z.boolean(),
  findings: z.string(),
  attachments: z.array(z.string().url()).optional(),
  checkedAt: z.string().datetime().optional(),
});

export type QualityCheckPayload = z.infer<typeof QualityCheckSchema>;

export const InventoryAdjustmentSchema = z.object({
  materialLotId: z.string(),
  productId: z.string().optional(),
  previousQuantity: z.number(),
  newQuantity: z.number(),
  reasonCode: z.enum(['DAMAGE', 'THEFT', 'DATA_ENTRY_ERROR', 'EXPIRED', 'SAMPLE', 'OTHER']),
  notes: z.string(),
});

export type InventoryAdjustmentPayload = z.infer<typeof InventoryAdjustmentSchema>;

export const SupplierAuditSchema = z.object({
  supplierId: z.string(),
  auditType: z.string(),
  auditDate: z.string().datetime(),
  auditorName: z.string(),
  passed: z.boolean(),
  findings: z.string(),
  nextAuditDate: z.string().datetime().optional(),
  attachments: z.array(z.string().url()).optional(),
});

export type SupplierAuditPayload = z.infer<typeof SupplierAuditSchema>;

// ============================================
// EVENT PAYLOAD VALIDATION
// ============================================

const EventSchemas: Record<EventType, z.ZodSchema> = {
  BATCH_PRODUCED: BatchProducedSchema,
  MATERIAL_CONSUMED: MaterialConsumedSchema,
  GOODS_RECEIVED: GoodsReceivedSchema,
  GOODS_SHIPPED: GoodsShippedSchema,
  QUALITY_CHECK: QualityCheckSchema,
  INVENTORY_ADJUSTMENT: InventoryAdjustmentSchema,
  SUPPLIER_AUDIT: SupplierAuditSchema,
};

/**
 * Result of event payload validation.
 */
export type EventValidationResult<T> =
  | { success: true; payload: T }
  | { success: false; error: z.ZodError };

/**
 * Validates an event payload without throwing.
 * Returns a discriminated union indicating success or failure.
 *
 * @example
 * const result = validateEventPayload({ eventType: 'BATCH_PRODUCED', payload });
 * if (result.success) {
 *   console.log(result.payload); // Typed payload
 * } else {
 *   console.log(result.error.issues); // Zod validation errors
 * }
 */
export function validateEventPayload<T extends EventType>(
  input: { eventType: T; payload: unknown }
): EventValidationResult<z.infer<typeof EventSchemas[T]>>;
export function validateEventPayload(
  input: { eventType: string; payload: unknown }
): EventValidationResult<unknown>;
export function validateEventPayload(
  input: { eventType: string; payload: unknown }
): EventValidationResult<unknown> {
  if (!EVENT_TYPES.includes(input.eventType as EventType)) {
    // Return a synthetic ZodError for unknown event type
    const zodError = new z.ZodError([
      {
        code: 'custom',
        path: ['eventType'],
        message: `Unknown event type: ${input.eventType}`,
      },
    ]);
    return { success: false, error: zodError };
  }

  const schema = EventSchemas[input.eventType as EventType];
  const result = schema.safeParse(input.payload);

  if (result.success) {
    return { success: true, payload: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validates an event payload and throws on failure.
 * Use validateEventPayload for non-throwing validation.
 *
 * @throws Error if event type is unknown
 * @throws z.ZodError if payload validation fails
 */
export function validateEventPayloadOrThrow(input: { eventType: string; payload: unknown }): void {
  if (!EVENT_TYPES.includes(input.eventType as EventType)) {
    throw new Error(`Unknown event type: ${input.eventType}`);
  }

  const schema = EventSchemas[input.eventType as EventType];
  schema.parse(input.payload);
}

export function getEventSchema(eventType: EventType): z.ZodSchema {
  return EventSchemas[eventType];
}
