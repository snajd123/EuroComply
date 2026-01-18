/**
 * API Configuration
 * Configurable values with sensible defaults.
 * Override via environment variables.
 */

// Pagination defaults
export const PAGINATION = {
  /** Default number of items per page */
  DEFAULT_LIMIT: parseInt(process.env['API_DEFAULT_LIMIT'] ?? '20', 10),
  /** Maximum allowed items per page */
  MAX_LIMIT: parseInt(process.env['API_MAX_LIMIT'] ?? '100', 10),
  /** Default offset */
  DEFAULT_OFFSET: 0,
} as const;
