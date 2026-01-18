/**
 * Zod schemas for API query parameter validation.
 * Provides type-safe validation instead of `as any` casts.
 */
import { z } from 'zod';

// ===========================================
// DPP SNAPSHOT QUERY PARAMETERS
// ===========================================

export const DPP_SNAPSHOT_STATUSES = [
  'PENDING_REVIEW',
  'VERIFIED',
  'ATTESTED',
  'SEALED',
  'ISSUED',
  'REVOKED',
] as const;

export const DppSnapshotStatusSchema = z.enum(DPP_SNAPSHOT_STATUSES);
export type DppSnapshotStatus = z.infer<typeof DppSnapshotStatusSchema>;

export const ListSnapshotsQuerySchema = z.object({
  productId: z.string().optional(),
  status: DppSnapshotStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type ListSnapshotsQuery = z.infer<typeof ListSnapshotsQuerySchema>;

// ===========================================
// OPERATIONS EVENTS QUERY PARAMETERS
// ===========================================

export const OPERATIONS_EVENT_TYPES = [
  'BATCH_PRODUCED',
  'MATERIAL_CONSUMED',
  'GOODS_RECEIVED',
  'GOODS_SHIPPED',
  'QUALITY_CHECK',
  'INVENTORY_ADJUSTMENT',
  'SUPPLIER_AUDIT',
] as const;

export const OPERATIONS_EVENT_STATUSES = [
  'PENDING_VERIFICATION',
  'VERIFIED',
] as const;

export const OperationsEventTypeSchema = z.enum(OPERATIONS_EVENT_TYPES);
export const OperationsEventStatusSchema = z.enum(OPERATIONS_EVENT_STATUSES);

export type OperationsEventType = z.infer<typeof OperationsEventTypeSchema>;
export type OperationsEventStatus = z.infer<typeof OperationsEventStatusSchema>;

export const ListEventsQuerySchema = z.object({
  eventType: OperationsEventTypeSchema.optional(),
  status: OperationsEventStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>;

// ===========================================
// AUTHORITY VALIDATION
// ===========================================

export const AUTHORITY_LEVELS = [
  'VIEWER',
  'CONTRIBUTOR',
  'EDITOR',
  'MANAGER',
] as const;

export const AuthorityLevelSchema = z.enum(AUTHORITY_LEVELS);
export type ValidatedAuthorityLevel = z.infer<typeof AuthorityLevelSchema>;

/**
 * Validates an authority level from the permissions object.
 * Returns the validated level or undefined if invalid.
 */
export function validateAuthority(
  value: unknown
): ValidatedAuthorityLevel | undefined {
  const result = AuthorityLevelSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

// ===========================================
// PAGINATION HELPERS
// ===========================================

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

/**
 * Parses and validates query parameters with safe defaults.
 * Returns validated data or throws ValidationError for invalid input.
 */
export function parseQueryParams<T extends z.ZodSchema>(
  schema: T,
  query: Record<string, string | undefined>
): z.infer<T> {
  // Filter out undefined values
  const cleanQuery: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      cleanQuery[key] = value;
    }
  }

  const result = schema.safeParse(cleanQuery);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid query parameters: ${errors}`);
  }
  return result.data;
}
