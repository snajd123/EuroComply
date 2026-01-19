/**
 * Database utility functions for validation and security.
 */

// =============================================================================
// URL Masking
// =============================================================================

/**
 * Masks sensitive data in a database URL for safe logging.
 * Replaces password portion with asterisks.
 *
 * @param url - The database URL to mask
 * @returns URL with password masked
 */
export function maskDatabaseUrl(url: string): string {
  // Match postgresql://user:password@host pattern
  return url.replace(
    /^(postgresql:\/\/[^:]+:)([^@]+)(@.*)$/,
    '$1****$3'
  );
}

/**
 * Masks the password in an error message that might contain a database URL.
 *
 * @param error - The error to sanitize
 * @returns Error with masked credentials
 */
export function sanitizeErrorForLogging(error: unknown): string {
  if (error instanceof Error) {
    return maskDatabaseUrl(error.message);
  }
  if (typeof error === 'string') {
    return maskDatabaseUrl(error);
  }
  return String(error);
}

// =============================================================================
// Schema Name Validation
// =============================================================================

/**
 * Schema name validation utilities to prevent SQL injection.
 *
 * All tenant schema names MUST:
 * 1. Start with 'tenant_' prefix
 * 2. Contain only lowercase letters, numbers, and underscores after prefix
 * 3. Be between 8 and 63 characters total (PostgreSQL identifier limit)
 */

/**
 * Strict regex pattern for tenant schema names.
 * - Must start with 'tenant_'
 * - Followed by lowercase letters, numbers, or underscores
 * - Total length 8-63 characters
 */
const TENANT_SCHEMA_PATTERN = /^tenant_[a-z][a-z0-9_]{0,53}$/;

/**
 * Maximum allowed schema name length (PostgreSQL limit is 63)
 */
const MAX_SCHEMA_LENGTH = 63;

/**
 * Validates a schema name against the strict allowlist pattern.
 * Throws an error if validation fails.
 *
 * @param schemaName - The schema name to validate
 * @throws Error if schema name is invalid
 */
export function validateSchemaName(schemaName: string): void {
  if (!schemaName || typeof schemaName !== 'string') {
    throw new Error('Schema name is required and must be a string');
  }

  if (schemaName.length > MAX_SCHEMA_LENGTH) {
    throw new Error(
      `Schema name exceeds maximum length of ${MAX_SCHEMA_LENGTH} characters`
    );
  }

  if (!TENANT_SCHEMA_PATTERN.test(schemaName)) {
    throw new Error(
      `Invalid schema name: "${schemaName}". Must start with 'tenant_' followed by lowercase letters, numbers, or underscores`
    );
  }
}

/**
 * Checks if a schema name is valid without throwing.
 *
 * @param schemaName - The schema name to validate
 * @returns true if valid, false otherwise
 */
export function isValidSchemaName(schemaName: string): boolean {
  if (!schemaName || typeof schemaName !== 'string') {
    return false;
  }

  if (schemaName.length > MAX_SCHEMA_LENGTH) {
    return false;
  }

  return TENANT_SCHEMA_PATTERN.test(schemaName);
}

/**
 * Result of schema name generation with sanitization details.
 */
export interface SchemaNameResult {
  /** The generated schema name */
  schemaName: string;
  /** Whether the input was sanitized (modified from original) */
  sanitized: boolean;
  /** The original input before sanitization */
  originalInput: string;
  /** Whether the name was truncated to fit max length */
  truncated: boolean;
}

/**
 * Generates a valid tenant schema name from an organization slug.
 *
 * @param orgSlug - The organization slug (will be sanitized)
 * @returns Result object with schema name and sanitization details
 * @throws Error if the resulting schema name would be invalid
 *
 * @example
 * const result = generateSchemaName('Acme-Corp');
 * // result = { schemaName: 'tenant_acme_corp', sanitized: true, originalInput: 'Acme-Corp', truncated: false }
 */
export function generateSchemaName(orgSlug: string): SchemaNameResult {
  if (!orgSlug || typeof orgSlug !== 'string') {
    throw new Error('Organization slug is required');
  }

  const originalInput = orgSlug;

  // Sanitize: lowercase, replace non-alphanumeric with underscore, collapse multiple underscores
  const sanitized = orgSlug
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (!sanitized || !/^[a-z]/.test(sanitized)) {
    throw new Error(
      'Organization slug must contain at least one letter and start with a letter after sanitization'
    );
  }

  const schemaName = `tenant_${sanitized}`;

  // Truncate if too long
  const truncated = schemaName.length > MAX_SCHEMA_LENGTH;
  const finalName = truncated
    ? schemaName.substring(0, MAX_SCHEMA_LENGTH)
    : schemaName;

  // Final validation
  validateSchemaName(finalName);

  return {
    schemaName: finalName,
    sanitized: originalInput !== sanitized,
    originalInput,
    truncated,
  };
}
