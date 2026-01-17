/**
 * URL Parser for Digital Product Passport paths
 *
 * Parses DPP URLs in the format: /{organizationId}/{passportId}[/{file}]
 * - organizationId must start with "org_"
 * - passportId must start with "pass_"
 */

export interface DppUrlParams {
  organizationId: string;
  passportId: string;
  file: string | null;
}

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

  // Must have at least 2 segments (org and passport)
  if (segments.length < 2) {
    return null;
  }

  const organizationId = segments[0];
  const passportId = segments[1];
  const file = segments[2];

  // These are guaranteed to exist due to length check above, but TypeScript needs explicit checks
  if (organizationId === undefined || passportId === undefined) {
    return null;
  }

  // Validate organizationId prefix
  if (!organizationId.startsWith('org_')) {
    return null;
  }

  // Validate passportId prefix
  if (!passportId.startsWith('pass_')) {
    return null;
  }

  return {
    organizationId,
    passportId,
    file: file ?? null,
  };
}
