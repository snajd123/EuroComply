/**
 * URL Parser for Digital Product Passport paths
 *
 * Parses DPP URLs in the format: /{organizationId}/{passportId}[/{file}]
 * - organizationId must match org_[a-zA-Z0-9]{10,30}
 * - passportId must match pass_[a-zA-Z0-9]{10,30}
 * - file must be one of the allowed files (security: prevents path traversal)
 */

export interface DppUrlParams {
  organizationId: string;
  passportId: string;
  file: string | null;
}

/**
 * Whitelist of allowed DPP files.
 * Security: Prevents path traversal attacks by only allowing known files.
 */
const ALLOWED_FILES = new Set(['credential.json', 'preview.html', 'qr.png']);

/**
 * Organization ID format: org_ followed by 10-30 alphanumeric characters.
 * Security: Full pattern validation prevents injection attacks.
 */
const ORG_ID_PATTERN = /^org_[a-zA-Z0-9]{10,30}$/;

/**
 * Passport ID format: pass_ followed by 10-30 alphanumeric characters.
 * Security: Full pattern validation prevents injection attacks.
 */
const PASSPORT_ID_PATTERN = /^pass_[a-zA-Z0-9]{10,30}$/;

/**
 * Parse a DPP URL and extract organization ID, passport ID, and optional file
 *
 * @param url - The URL to parse
 * @returns DppUrlParams if valid, null if invalid
 *
 * @example
 * // Basic path
 * parseDppUrl(new URL('https://dpp.example.com/org_123/pass_456'))
 * // Returns: { organizationId: 'org_123', passportId: 'pass_456', file: null }
 *
 * @example
 * // With file
 * parseDppUrl(new URL('https://dpp.example.com/org_123/pass_456/credential.json'))
 * // Returns: { organizationId: 'org_123', passportId: 'pass_456', file: 'credential.json' }
 */
export function parseDppUrl(url: URL): DppUrlParams | null {
  // Get path and remove leading/trailing slashes
  const path = url.pathname.replace(/^\/+|\/+$/g, '');

  // Split into segments
  const segments = path.split('/').filter((segment) => segment.length > 0);

  // Must have exactly 2 or 3 segments (org, passport, optional file)
  // Security: Reject paths with more segments to prevent traversal
  if (segments.length < 2 || segments.length > 3) {
    return null;
  }

  const organizationId = segments[0];
  const passportId = segments[1];
  const file = segments[2];

  // These are guaranteed to exist due to length check above, but TypeScript needs explicit checks
  if (organizationId === undefined || passportId === undefined) {
    return null;
  }

  // Validate organizationId format (full pattern, not just prefix)
  // Security: Ensures IDs match expected format to prevent injection attacks
  if (!ORG_ID_PATTERN.test(organizationId)) {
    return null;
  }

  // Validate passportId format (full pattern, not just prefix)
  // Security: Ensures IDs match expected format to prevent injection attacks
  if (!PASSPORT_ID_PATTERN.test(passportId)) {
    return null;
  }

  // Validate file if provided
  // Security: Only allow whitelisted files to prevent path traversal attacks
  if (file !== undefined) {
    if (!ALLOWED_FILES.has(file)) {
      return null;
    }
  }

  return {
    organizationId,
    passportId,
    file: file ?? null,
  };
}
