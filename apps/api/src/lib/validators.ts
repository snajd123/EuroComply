/**
 * Input validators for security-critical fields.
 *
 * These validators ensure inputs match expected formats before
 * they're used in database queries or other sensitive operations.
 */

/**
 * Organization ID format: org_ followed by 10-30 alphanumeric characters.
 * Matches Clerk organization ID format.
 */
const ORG_ID_PATTERN = /^org_[a-zA-Z0-9]{10,30}$/;

/**
 * Validate organization ID format.
 *
 * Security: Prevents SQL injection and ensures IDs match expected format.
 *
 * @param id - The organization ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidOrgId(id: string): boolean {
  return ORG_ID_PATTERN.test(id);
}

/**
 * Request ID format: alphanumeric with dashes/underscores, max 64 chars.
 */
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9\-_]{1,64}$/;

/**
 * Validate and sanitize request ID.
 *
 * Security: Prevents log injection attacks through malformed request IDs.
 *
 * @param id - The request ID to validate
 * @returns The ID if valid, null otherwise
 */
export function sanitizeRequestId(id: string | undefined): string | null {
  if (!id) return null;
  return REQUEST_ID_PATTERN.test(id) ? id : null;
}

/**
 * User ID format: user_ followed by 20-30 alphanumeric characters.
 * Matches Clerk user ID format.
 */
const USER_ID_PATTERN = /^user_[a-zA-Z0-9]{10,30}$/;

/**
 * Validate user ID format.
 *
 * @param id - The user ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidUserId(id: string): boolean {
  return USER_ID_PATTERN.test(id);
}
