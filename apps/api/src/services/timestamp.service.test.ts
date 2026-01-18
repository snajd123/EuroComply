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

  describe('createTimestampRequest (via createTimestamp)', () => {
    it('should reject invalid hash format', async () => {
      await expect(
        service.createTimestamp('not-a-valid-hash')
      ).rejects.toThrow();
    });

    it('should handle TSA HTTP error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      });

      const hash = createHash('sha256').update('test').digest('hex');
      await expect(service.createTimestamp(hash)).rejects.toThrow('TSA request failed');
    });

    it('should send proper request to TSA', async () => {
      // Mock a response that will fail parsing (but we verify the request was made correctly)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0),
      });

      const hash = createHash('sha256').update('test data').digest('hex');

      // Will throw due to empty response, but we can verify fetch was called correctly
      await expect(service.createTimestamp(hash)).rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://freetsa.org/tsr',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/timestamp-query',
          }),
        })
      );
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

    it('should produce same hash regardless of key order', () => {
      const hash1 = TimestampService.hashPayload({ b: 2, a: 1 });
      const hash2 = TimestampService.hashPayload({ a: 1, b: 2 });

      expect(hash1).toBe(hash2);
    });

    it('should sort nested object keys recursively', () => {
      const hash1 = TimestampService.hashPayload({ outer: { z: 1, a: 2 } });
      const hash2 = TimestampService.hashPayload({ outer: { a: 2, z: 1 } });

      expect(hash1).toBe(hash2);
    });

    it('should handle arrays within objects', () => {
      const hash1 = TimestampService.hashPayload({ arr: [1, 2, 3], b: 'test' });
      const hash2 = TimestampService.hashPayload({ b: 'test', arr: [1, 2, 3] });

      expect(hash1).toBe(hash2);
    });

    it('should throw for null payload', () => {
      expect(() => TimestampService.hashPayload(null as unknown as Record<string, unknown>))
        .toThrow('Cannot hash null or undefined payload');
    });

    it('should throw for undefined payload', () => {
      expect(() => TimestampService.hashPayload(undefined as unknown as Record<string, unknown>))
        .toThrow('Cannot hash null or undefined payload');
    });

    it('should throw for array payload', () => {
      expect(() => TimestampService.hashPayload([1, 2, 3] as unknown as Record<string, unknown>))
        .toThrow('Payload must be a plain object');
    });
  });

  describe('verifyTimestamp', () => {
    it('should return invalid for malformed base64 token', async () => {
      const result = await service.verifyTimestamp('!!!invalid-base64!!!', 'somehash');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return invalid for empty token', async () => {
      const emptyToken = Buffer.from([]).toString('base64');
      const result = await service.verifyTimestamp(emptyToken, 'somehash');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return invalid for non-ASN1 data', async () => {
      const randomData = Buffer.from('not valid asn1 data').toString('base64');
      const result = await service.verifyTimestamp(randomData, 'somehash');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('forProvider', () => {
    it('should create service for FREETSA', () => {
      const tsa = TimestampService.forProvider('FREETSA');
      expect(tsa).toBeInstanceOf(TimestampService);
    });

    it('should create service for DIGICERT', () => {
      const tsa = TimestampService.forProvider('DIGICERT');
      expect(tsa).toBeInstanceOf(TimestampService);
    });

    it('should create service for SECTIGO', () => {
      const tsa = TimestampService.forProvider('SECTIGO');
      expect(tsa).toBeInstanceOf(TimestampService);
    });
  });
});
