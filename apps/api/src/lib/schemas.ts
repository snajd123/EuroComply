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

// ===========================================
// READINESS PROFILE BODY SCHEMAS
// ===========================================

/**
 * Schema for required fields per workspace in readiness profiles.
 * Maps workspace name to an array of required field names.
 */
export const RequiredFieldsSchema = z.record(
  z.string(),
  z.array(z.string().min(1))
);

/**
 * Schema for creating a new readiness profile.
 */
export const CreateReadinessProfileBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  category: z.string().min(1, 'Category is required').max(100),
  description: z.string().max(1000).optional(),
  requiredFields: RequiredFieldsSchema,
  requiredAttestations: z.array(z.string().min(1)).optional(),
});

export type CreateReadinessProfileBody = z.infer<typeof CreateReadinessProfileBodySchema>;

/**
 * Schema for updating an existing readiness profile.
 * All fields are optional for partial updates.
 * Matches ReadinessProfileService.UpdateReadinessProfileInput
 */
export const UpdateReadinessProfileBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  requiredFields: RequiredFieldsSchema.optional(),
  requiredAttestations: z.array(z.string().min(1)).optional(),
});

export type UpdateReadinessProfileBody = z.infer<typeof UpdateReadinessProfileBodySchema>;

// ===========================================
// DPP SNAPSHOT BODY SCHEMAS
// ===========================================

/**
 * Schema for creating a new DPP snapshot.
 */
export const CreateSnapshotBodySchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  readinessProfileId: z.string().min(1, 'Readiness profile ID is required'),
  designVersionId: z.string().min(1, 'Design version ID is required'),
  marketingVersionId: z.string().optional(),
});

export type CreateSnapshotBody = z.infer<typeof CreateSnapshotBodySchema>;

/**
 * Schema for attesting a snapshot.
 * Matches DPPSnapshotService.AttestInput
 */
export const AttestSnapshotBodySchema = z.object({
  userSignatureDid: z.string().min(1, 'User signature DID is required'),
  userSignatureJws: z.string().min(1, 'User signature JWS is required'),
  userForensicContext: z.record(z.unknown()),
});

export type AttestSnapshotBody = z.infer<typeof AttestSnapshotBodySchema>;

/**
 * Schema for sealing a snapshot.
 * Matches DPPSnapshotService.SealInput
 */
export const SealSnapshotBodySchema = z.object({
  orgSignatureDid: z.string().min(1, 'Organization signature DID is required'),
  orgSignatureJws: z.string().min(1, 'Organization signature JWS is required'),
  orgForensicContext: z.record(z.unknown()),
});

export type SealSnapshotBody = z.infer<typeof SealSnapshotBodySchema>;

/**
 * Schema for issuing a snapshot.
 * Matches DPPSnapshotService.IssueInput
 */
export const IssueSnapshotBodySchema = z.object({
  vcId: z.string().min(1, 'VC ID is required'),
  vcJwt: z.string().min(1, 'VC JWT is required'),
  dppUrl: z.string().url('DPP URL must be valid'),
  qrCodeUrl: z.string().url().optional(),
  credentialStatusIndex: z.number().int().nonnegative().optional(),
  timestampProof: z.record(z.unknown()).optional(),
});

export type IssueSnapshotBody = z.infer<typeof IssueSnapshotBodySchema>;

// ===========================================
// VALIDATION HELPERS
// ===========================================

/**
 * Validates a request body against a Zod schema.
 * Returns a formatted error message if validation fails.
 */
export function validateBody<T extends z.ZodSchema>(
  schema: T,
  body: unknown
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join('.') || 'body'}: ${e.message}`)
      .join(', ');
    return { success: false, error: errors };
  }
  return { success: true, data: result.data };
}
