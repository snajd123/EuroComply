import { z } from 'zod';

/**
 * Schema Naming Convention
 *
 * All tenant schemas MUST follow this pattern to prevent SQL injection
 * and ensure consistent naming across the system.
 *
 * Format: tenant_[a-z0-9_]+
 *
 * Valid examples:
 *   - tenant_acme
 *   - tenant_org_123
 *   - tenant_my_company_2024
 *
 * Invalid examples:
 *   - acme (missing tenant_ prefix)
 *   - tenant_ACME (uppercase not allowed)
 *   - tenant_acme-corp (hyphens not allowed)
 *   - tenant_ (must have at least one character after prefix)
 *   - public (reserved schema)
 */

/**
 * Regular expression for validating tenant schema names.
 *
 * SECURITY: This pattern is critical for SQL injection prevention.
 * The schema name is used in dynamic SQL queries like:
 *   - CREATE SCHEMA IF NOT EXISTS "${schemaName}"
 *   - SET search_path TO "${schemaName}", public
 *   - GRANT USAGE ON SCHEMA "${schemaName}" TO ...
 *
 * By restricting to lowercase alphanumeric and underscores with a
 * required prefix, we prevent:
 *   - SQL injection via special characters
 *   - Schema name collisions with system schemas
 *   - Case-sensitivity issues across systems
 */
export const SCHEMA_NAME_PATTERN = /^tenant_[a-z0-9_]+$/;

/**
 * Maximum length for PostgreSQL schema names.
 * PostgreSQL identifiers are limited to 63 bytes.
 */
export const SCHEMA_NAME_MAX_LENGTH = 63;

/**
 * Minimum length for schema names (tenant_ prefix + at least 1 char).
 */
export const SCHEMA_NAME_MIN_LENGTH = 8; // "tenant_" (7) + at least 1 char

/**
 * Validates that a schema name follows the tenant naming convention.
 *
 * @param schemaName - The schema name to validate
 * @returns true if valid, false otherwise
 *
 * @example
 * isValidSchemaName('tenant_acme');        // true
 * isValidSchemaName('tenant_org_123');     // true
 * isValidSchemaName('public');             // false
 * isValidSchemaName('tenant_ACME');        // false (uppercase)
 * isValidSchemaName('tenant_');            // false (nothing after prefix)
 */
export function isValidSchemaName(schemaName: string): boolean {
  if (!schemaName || typeof schemaName !== 'string') {
    return false;
  }

  if (schemaName.length > SCHEMA_NAME_MAX_LENGTH) {
    return false;
  }

  return SCHEMA_NAME_PATTERN.test(schemaName);
}

/**
 * Validates a schema name and throws a descriptive error if invalid.
 *
 * @param schemaName - The schema name to validate
 * @throws Error if the schema name is invalid
 *
 * @example
 * assertValidSchemaName('tenant_acme');  // passes
 * assertValidSchemaName('invalid');      // throws Error
 */
export function assertValidSchemaName(schemaName: string): void {
  if (!schemaName || typeof schemaName !== 'string') {
    throw new Error('Schema name must be a non-empty string');
  }

  if (schemaName.length > SCHEMA_NAME_MAX_LENGTH) {
    throw new Error(
      `Schema name exceeds maximum length of ${SCHEMA_NAME_MAX_LENGTH} characters`
    );
  }

  if (!SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new Error(
      `Invalid schema name: "${schemaName}". ` +
        `Must match pattern: tenant_[a-z0-9_]+ (lowercase letters, numbers, and underscores only)`
    );
  }
}

/**
 * Generates a valid schema name from an organization slug or identifier.
 *
 * @param identifier - The organization slug or identifier
 * @returns A valid schema name
 * @throws Error if a valid schema name cannot be generated
 *
 * @example
 * generateSchemaName('acme');           // 'tenant_acme'
 * generateSchemaName('Acme Corp');      // 'tenant_acme_corp'
 * generateSchemaName('org-123');        // 'tenant_org_123'
 */
export function generateSchemaName(identifier: string): string {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Identifier must be a non-empty string');
  }

  // Convert to lowercase and replace invalid characters with underscores
  const sanitized = identifier
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_') // Replace invalid chars with underscore
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Trim leading/trailing underscores

  if (!sanitized) {
    throw new Error(`Cannot generate schema name from identifier: "${identifier}"`);
  }

  const schemaName = `tenant_${sanitized}`;

  // Truncate if too long (leaving room for tenant_ prefix)
  const truncated =
    schemaName.length > SCHEMA_NAME_MAX_LENGTH
      ? schemaName.slice(0, SCHEMA_NAME_MAX_LENGTH)
      : schemaName;

  // Validate the final result
  assertValidSchemaName(truncated);

  return truncated;
}

/**
 * Zod schema for validating schema names in API requests.
 *
 * Use this in route validators to ensure consistent validation
 * across all API endpoints that accept schema names.
 *
 * @example
 * const createOrgSchema = z.object({
 *   name: z.string(),
 *   schemaName: schemaNameSchema,
 * });
 */
export const schemaNameSchema = z
  .string()
  .min(SCHEMA_NAME_MIN_LENGTH, {
    message: `Schema name must be at least ${SCHEMA_NAME_MIN_LENGTH} characters`,
  })
  .max(SCHEMA_NAME_MAX_LENGTH, {
    message: `Schema name must not exceed ${SCHEMA_NAME_MAX_LENGTH} characters`,
  })
  .regex(SCHEMA_NAME_PATTERN, {
    message:
      'Schema name must match pattern: tenant_[a-z0-9_]+ (lowercase letters, numbers, and underscores only)',
  });
