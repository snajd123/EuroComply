/**
 * DPP Worker - Main Request Handler
 *
 * Serves Digital Product Passports from R2 storage with content negotiation.
 * Supports GET/HEAD/OPTIONS methods and returns appropriate DPP files based on
 * Accept header or explicit file path in the URL.
 */

import { negotiateContentType } from './content-negotiation.js';
import { parseDppUrl } from './url-parser.js';
import { getDppFile } from './storage.js';

export interface Env {
  DPP_BUCKET: R2Bucket;
}

/**
 * Allowed HTTP methods for the DPP Worker
 */
const ALLOWED_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Standard cache control header for DPP responses
 */
const CACHE_CONTROL = 'public, max-age=3600';

/**
 * Creates a 404 Not Found response
 */
function notFoundResponse(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Creates a 405 Method Not Allowed response
 */
function methodNotAllowedResponse(): Response {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      'Content-Type': 'text/plain',
      Allow: ALLOWED_METHODS.join(', '),
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Creates a 204 No Content response for OPTIONS preflight requests
 */
function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', '),
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Creates a successful response with the DPP file content
 */
function createDppResponse(
  body: ReadableStream | null,
  contentType: string,
  etag: string
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': CACHE_CONTROL,
      ETag: etag,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Gets the content type for a specific file based on file extension
 * Falls back to the stored content type from R2
 */
function getContentTypeForFile(
  filename: string,
  storedContentType: string | undefined
): string {
  // Map common DPP file extensions to content types
  const extensionMap: Record<string, string> = {
    'credential.json': 'application/vc+ld+json',
    'preview.html': 'text/html',
    'qr.png': 'image/png',
  };

  // Use explicit mapping if available, otherwise fall back to stored type or octet-stream
  return extensionMap[filename] ?? storedContentType ?? 'application/octet-stream';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const method = request.method.toUpperCase();

    // Handle OPTIONS preflight requests
    if (method === 'OPTIONS') {
      return optionsResponse();
    }

    // Reject non-allowed methods
    if (!ALLOWED_METHODS.includes(method)) {
      return methodNotAllowedResponse();
    }

    // Parse the URL to extract organization ID, passport ID, and optional file
    const url = new URL(request.url);
    const params = parseDppUrl(url);

    // Return 404 for invalid URLs
    if (params === null) {
      return notFoundResponse();
    }

    const { organizationId, passportId, file: requestedFile } = params;

    // Determine which file to serve
    let fileToFetch: string;
    let expectedContentType: string;

    if (requestedFile !== null) {
      // Specific file requested in URL - use it directly
      fileToFetch = requestedFile;
      // Content type will be determined after fetching
      expectedContentType = '';
    } else {
      // No specific file - use content negotiation
      const acceptHeader = request.headers.get('Accept');
      const negotiated = negotiateContentType(acceptHeader);
      fileToFetch = negotiated.file;
      expectedContentType = negotiated.contentType;
    }

    // Fetch the file from R2 storage
    const dppFile = await getDppFile(
      env.DPP_BUCKET,
      organizationId,
      passportId,
      fileToFetch
    );

    // Return 404 if file not found
    if (dppFile === null) {
      return notFoundResponse();
    }

    // Determine final content type
    const finalContentType =
      expectedContentType ||
      getContentTypeForFile(fileToFetch, dppFile.contentType);

    // For HEAD requests, return response without body
    if (method === 'HEAD') {
      return createDppResponse(null, finalContentType, dppFile.etag);
    }

    // Return the DPP file with proper headers
    return createDppResponse(dppFile.body, finalContentType, dppFile.etag);
  },
};
