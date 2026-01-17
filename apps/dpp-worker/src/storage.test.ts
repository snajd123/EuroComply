import { describe, it, expect, vi } from 'vitest';
import {
  DppFileResult,
  buildStorageKey,
  getDppFile,
} from './storage';

describe('buildStorageKey', () => {
  it('builds correct storage key', () => {
    const result = buildStorageKey('org_123', 'pass_456', 'credential.json');
    expect(result).toBe('org_123/pass_456/credential.json');
  });

  it('handles different files', () => {
    expect(buildStorageKey('org_abc', 'pass_xyz', 'preview.html')).toBe(
      'org_abc/pass_xyz/preview.html'
    );
    expect(buildStorageKey('org_abc', 'pass_xyz', 'qr.png')).toBe(
      'org_abc/pass_xyz/qr.png'
    );
  });
});

describe('getDppFile', () => {
  it('returns file when found', async () => {
    const mockStream = new ReadableStream();
    const mockR2Object = {
      body: mockStream,
      httpMetadata: { contentType: 'application/json' },
      etag: '"abc123"',
      size: 1024,
    };

    const mockBucket = {
      get: vi.fn().mockResolvedValue(mockR2Object),
    } as unknown as R2Bucket;

    const result = await getDppFile(
      mockBucket,
      'org_123',
      'pass_456',
      'credential.json'
    );

    expect(mockBucket.get).toHaveBeenCalledWith('org_123/pass_456/credential.json');
    expect(result).not.toBeNull();
    expect(result).toEqual({
      body: mockStream,
      contentType: 'application/json',
      etag: '"abc123"',
      size: 1024,
    });
  });

  it('returns null when file not found', async () => {
    const mockBucket = {
      get: vi.fn().mockResolvedValue(null),
    } as unknown as R2Bucket;

    const result = await getDppFile(
      mockBucket,
      'org_123',
      'pass_456',
      'nonexistent.json'
    );

    expect(mockBucket.get).toHaveBeenCalledWith('org_123/pass_456/nonexistent.json');
    expect(result).toBeNull();
  });
});

describe('DppFileResult interface', () => {
  it('has correct shape', () => {
    const mockStream = new ReadableStream();
    const result: DppFileResult = {
      body: mockStream,
      contentType: 'application/json',
      etag: '"test123"',
      size: 512,
    };

    expect(result.body).toBe(mockStream);
    expect(result.contentType).toBe('application/json');
    expect(result.etag).toBe('"test123"');
    expect(result.size).toBe(512);
  });

  it('allows undefined contentType', () => {
    const mockStream = new ReadableStream();
    const result: DppFileResult = {
      body: mockStream,
      contentType: undefined,
      etag: '"test456"',
      size: 256,
    };

    expect(result.contentType).toBeUndefined();
  });
});
