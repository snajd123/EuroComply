import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { Env } from './index.js';

/**
 * Creates a mock R2Bucket for testing
 */
function createMockBucket(getResult: unknown = null) {
  return {
    get: vi.fn().mockResolvedValue(getResult),
  } as unknown as R2Bucket;
}

/**
 * Creates a mock R2Object with the given content
 */
function createMockR2Object(content: string, contentType: string, etag = '"test-etag"') {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(content));
        controller.close();
      },
    }),
    httpMetadata: { contentType },
    etag,
    size: content.length,
  };
}

/**
 * Creates a mock environment with the given bucket
 */
function createMockEnv(bucket: R2Bucket): Env {
  return { DPP_BUCKET: bucket };
}

describe('DPP Worker Main Handler', () => {
  describe('HTTP Method Handling', () => {
    it('returns 405 for POST requests', async () => {
      const mockBucket = createMockBucket();
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456', {
        method: 'POST',
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, HEAD, OPTIONS');
    });

    it('returns 405 for PUT requests', async () => {
      const mockBucket = createMockBucket();
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456', {
        method: 'PUT',
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(405);
    });

    it('returns 405 for DELETE requests', async () => {
      const mockBucket = createMockBucket();
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456', {
        method: 'DELETE',
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(405);
    });

    it('handles HEAD requests same as GET but without body', async () => {
      const mockR2Object = createMockR2Object('<html></html>', 'text/html');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456', {
        method: 'HEAD',
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html');
    });

    it('handles OPTIONS requests for CORS preflight', async () => {
      const mockBucket = createMockBucket();
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456', {
        method: 'OPTIONS',
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD, OPTIONS');
    });
  });

  describe('URL Parsing and 404s', () => {
    it('returns 404 for root path', async () => {
      const mockBucket = createMockBucket();
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(404);
    });

    it('returns 404 for invalid path (missing passport)', async () => {
      const mockBucket = createMockBucket();
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(404);
    });

    it('returns 404 for invalid path (wrong prefix)', async () => {
      const mockBucket = createMockBucket();
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/invalid_123/pass_456');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(404);
    });

    it('returns 404 when DPP not found in storage', async () => {
      const mockBucket = createMockBucket(null); // R2 returns null for missing files
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(404);
      expect(mockBucket.get).toHaveBeenCalled();
    });
  });

  describe('Content Negotiation', () => {
    it('returns credential.json for vc+ld+json Accept header', async () => {
      const credentialContent = '{"@context": [], "type": "VerifiableCredential"}';
      const mockR2Object = createMockR2Object(credentialContent, 'application/vc+ld+json');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456', {
        headers: { Accept: 'application/vc+ld+json' },
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/vc+ld+json');
      expect(mockBucket.get).toHaveBeenCalledWith('org_123/pass_456/credential.json');
    });

    it('returns credential.json for application/json Accept header', async () => {
      const credentialContent = '{"@context": [], "type": "VerifiableCredential"}';
      const mockR2Object = createMockR2Object(credentialContent, 'application/vc+ld+json');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456', {
        headers: { Accept: 'application/json' },
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/vc+ld+json');
      expect(mockBucket.get).toHaveBeenCalledWith('org_123/pass_456/credential.json');
    });

    it('returns preview.html for browser request (text/html)', async () => {
      const htmlContent = '<html><body>Preview</body></html>';
      const mockR2Object = createMockR2Object(htmlContent, 'text/html');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456', {
        headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html');
      expect(mockBucket.get).toHaveBeenCalledWith('org_123/pass_456/preview.html');
    });

    it('returns preview.html for wildcard Accept header', async () => {
      const htmlContent = '<html><body>Preview</body></html>';
      const mockR2Object = createMockR2Object(htmlContent, 'text/html');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456', {
        headers: { Accept: '*/*' },
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html');
      expect(mockBucket.get).toHaveBeenCalledWith('org_123/pass_456/preview.html');
    });

    it('returns preview.html when no Accept header is provided', async () => {
      const htmlContent = '<html><body>Preview</body></html>';
      const mockR2Object = createMockR2Object(htmlContent, 'text/html');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html');
      expect(mockBucket.get).toHaveBeenCalledWith('org_123/pass_456/preview.html');
    });
  });

  describe('Specific File Requests', () => {
    it('handles specific file requests for qr.png', async () => {
      const pngContent = 'PNG binary data';
      const mockR2Object = createMockR2Object(pngContent, 'image/png');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_x/pass_y/qr.png');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/png');
      expect(mockBucket.get).toHaveBeenCalledWith('org_x/pass_y/qr.png');
    });

    it('handles specific file requests for credential.json', async () => {
      const credentialContent = '{"@context": []}';
      const mockR2Object = createMockR2Object(credentialContent, 'application/vc+ld+json');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456/credential.json');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/vc+ld+json');
      expect(mockBucket.get).toHaveBeenCalledWith('org_123/pass_456/credential.json');
    });

    it('handles specific file requests for preview.html', async () => {
      const htmlContent = '<html></html>';
      const mockR2Object = createMockR2Object(htmlContent, 'text/html');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456/preview.html');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html');
      expect(mockBucket.get).toHaveBeenCalledWith('org_123/pass_456/preview.html');
    });

    it('returns 404 for whitelisted file that does not exist in R2', async () => {
      const mockBucket = createMockBucket(null);
      const env = createMockEnv(mockBucket);
      // credential.json is whitelisted but not in R2
      const request = new Request('https://dpp.example.com/org_123/pass_456/credential.json');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(404);
      expect(mockBucket.get).toHaveBeenCalledWith('org_123/pass_456/credential.json');
    });

    it('returns 404 for non-whitelisted file without calling R2 (security)', async () => {
      const mockBucket = createMockBucket(null);
      const env = createMockEnv(mockBucket);
      // nonexistent.txt is not whitelisted - should be rejected at URL parsing
      const request = new Request('https://dpp.example.com/org_123/pass_456/nonexistent.txt');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(404);
      // R2 should NOT be called for non-whitelisted files (security measure)
      expect(mockBucket.get).not.toHaveBeenCalled();
    });

    it('ignores Accept header when specific file is requested', async () => {
      const htmlContent = '<html></html>';
      const mockR2Object = createMockR2Object(htmlContent, 'text/html');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      // Request preview.html but with JSON Accept header
      const request = new Request('https://dpp.example.com/org_123/pass_456/preview.html', {
        headers: { Accept: 'application/json' },
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html');
      expect(mockBucket.get).toHaveBeenCalledWith('org_123/pass_456/preview.html');
    });
  });

  describe('Response Headers', () => {
    it('includes Cache-Control header', async () => {
      const htmlContent = '<html></html>';
      const mockR2Object = createMockR2Object(htmlContent, 'text/html');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    });

    it('includes ETag header', async () => {
      const htmlContent = '<html></html>';
      const mockR2Object = createMockR2Object(htmlContent, 'text/html', '"abc123etag"');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('ETag')).toBe('"abc123etag"');
    });

    it('includes CORS Access-Control-Allow-Origin header', async () => {
      const htmlContent = '<html></html>';
      const mockR2Object = createMockR2Object(htmlContent, 'text/html');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('includes all required headers together', async () => {
      const credentialContent = '{"@context": []}';
      const mockR2Object = createMockR2Object(credentialContent, 'application/vc+ld+json', '"full-test-etag"');
      const mockBucket = createMockBucket(mockR2Object);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456', {
        headers: { Accept: 'application/vc+ld+json' },
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/vc+ld+json');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
      expect(response.headers.get('ETag')).toBe('"full-test-etag"');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Error Response Format', () => {
    it('404 responses include proper error body', async () => {
      const mockBucket = createMockBucket(null);
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456');

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(404);
      const body = await response.text();
      expect(body).toContain('Not Found');
    });

    it('405 responses include proper error body', async () => {
      const mockBucket = createMockBucket();
      const env = createMockEnv(mockBucket);
      const request = new Request('https://dpp.example.com/org_123/pass_456', {
        method: 'POST',
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(405);
      const body = await response.text();
      expect(body).toContain('Method Not Allowed');
    });
  });
});
