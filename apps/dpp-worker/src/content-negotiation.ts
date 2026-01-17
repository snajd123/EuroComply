/**
 * Content type configuration for DPP files
 */
export interface ContentTypeConfig {
  file: string;
  contentType: string;
}

/**
 * Content types supported by the DPP Worker
 */
export const DPP_CONTENT_TYPES = {
  credential: {
    file: 'credential.json',
    contentType: 'application/vc+ld+json',
  },
  preview: {
    file: 'preview.html',
    contentType: 'text/html',
  },
  qr: {
    file: 'qr.png',
    contentType: 'image/png',
  },
} as const;

/**
 * Mapping of Accept header media types to DPP content types
 */
const ACCEPT_MAPPINGS: Array<{
  accepts: string[];
  config: ContentTypeConfig;
}> = [
  {
    accepts: ['application/vc+ld+json', 'application/json'],
    config: DPP_CONTENT_TYPES.credential,
  },
  {
    accepts: ['text/html', 'application/xhtml+xml'],
    config: DPP_CONTENT_TYPES.preview,
  },
  {
    accepts: ['image/png'],
    config: DPP_CONTENT_TYPES.qr,
  },
];

/**
 * Parse a single media type entry from an Accept header
 * Returns the media type and its quality value
 */
function parseMediaType(entry: string): { type: string; quality: number } {
  const parts = entry.split(';').map((p) => p.trim());
  const type = (parts[0] ?? '').toLowerCase();

  // Find quality value (q=X.X)
  let quality = 1.0; // Default quality is 1.0
  for (const part of parts.slice(1)) {
    const match = part.match(/^q\s*=\s*([0-9.]+)$/i);
    if (match && match[1]) {
      quality = parseFloat(match[1]);
      if (isNaN(quality)) {
        quality = 1.0;
      }
      break;
    }
  }

  return { type, quality };
}

/**
 * Parse Accept header into sorted list of media types by quality
 */
function parseAcceptHeader(
  acceptHeader: string
): Array<{ type: string; quality: number }> {
  if (!acceptHeader.trim()) {
    return [];
  }

  const entries = acceptHeader.split(',').map((e) => e.trim());
  const parsed = entries.map(parseMediaType);

  // Sort by quality value descending (highest first)
  return parsed.sort((a, b) => b.quality - a.quality);
}

/**
 * Find the matching content type config for a media type
 */
function findMatchingConfig(mediaType: string): ContentTypeConfig | null {
  for (const mapping of ACCEPT_MAPPINGS) {
    if (mapping.accepts.includes(mediaType)) {
      return mapping.config;
    }
  }
  return null;
}

/**
 * Negotiate the content type based on the Accept header
 * Returns the file to serve and its content type
 *
 * Content negotiation rules:
 * - application/vc+ld+json or application/json -> credential.json
 * - text/html or application/xhtml+xml -> preview.html
 * - image/png -> qr.png
 * - wildcard or empty/undefined -> default to preview.html
 */
export function negotiateContentType(
  acceptHeader: string | undefined | null
): ContentTypeConfig {
  // Default to preview.html for missing or empty Accept header
  if (!acceptHeader || !acceptHeader.trim()) {
    return DPP_CONTENT_TYPES.preview;
  }

  const mediaTypes = parseAcceptHeader(acceptHeader);

  // Try each media type in order of quality
  for (const { type } of mediaTypes) {
    // Check for exact matches first
    const config = findMatchingConfig(type);
    if (config) {
      return config;
    }

    // Handle wildcard
    if (type === '*/*') {
      return DPP_CONTENT_TYPES.preview;
    }
  }

  // Default to preview.html if no match found
  return DPP_CONTENT_TYPES.preview;
}
