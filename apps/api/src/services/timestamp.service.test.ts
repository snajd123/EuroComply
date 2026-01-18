import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimestampService } from './timestamp.service.js';
import { createHash } from 'crypto';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TimestampService', () => {
  let service: TimestampService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TimestampService({
      url: 'https://freetsa.org/tsr',
      name: 'FreeTSA',
      timeout: 5000,
    });
  });

  describe('createTimestamp', () => {
    it('should create timestamp for SHA-256 hash', async () => {
      const mockToken = Buffer.from('mock-tsa-response').toString('base64');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from(mockToken, 'base64'),
      });

      const hash = createHash('sha256').update('test data').digest('hex');
      const result = await service.createTimestamp(hash);

      expect(result.type).toBe('RFC3161');
      expect(result.hashAlgorithm).toBe('SHA-256');
      expect(result.authority).toBe('https://freetsa.org/tsr');
      expect(result.token).toBeDefined();
    });

    it('should reject invalid hash format', async () => {
      await expect(
        service.createTimestamp('not-a-valid-hash')
      ).rejects.toThrow();
    });
  });

  describe('hashPayload', () => {
    it('should create deterministic hash of JSON payload', () => {
      const payload = { foo: 'bar', nested: { a: 1 } };
      const hash1 = TimestampService.hashPayload(payload);
      const hash2 = TimestampService.hashPayload(payload);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hash for different payloads', () => {
      const hash1 = TimestampService.hashPayload({ a: 1 });
      const hash2 = TimestampService.hashPayload({ a: 2 });

      expect(hash1).not.toBe(hash2);
    });
  });
});
