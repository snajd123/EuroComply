import { describe, it, expect } from 'vitest';
import { DppUrlParams, parseDppUrl } from './url-parser.js';

describe('parseDppUrl', () => {
  it('parses org and passport from path', () => {
    const url = new URL('https://dpp.example.com/org_123/pass_456');
    const result = parseDppUrl(url);
    expect(result).toEqual({
      organizationId: 'org_123',
      passportId: 'pass_456',
      file: null,
    });
  });

  it('parses org, passport, and specific file', () => {
    const url = new URL('https://dpp.example.com/org_abc/pass_xyz/preview.html');
    const result = parseDppUrl(url);
    expect(result).toEqual({
      organizationId: 'org_abc',
      passportId: 'pass_xyz',
      file: 'preview.html',
    });
  });

  it('parses credential.json file request', () => {
    const url = new URL('https://dpp.example.com/org_test/pass_demo/credential.json');
    const result = parseDppUrl(url);
    expect(result).toEqual({
      organizationId: 'org_test',
      passportId: 'pass_demo',
      file: 'credential.json',
    });
  });

  it('returns null for root path', () => {
    const url = new URL('https://dpp.example.com/');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('returns null for single segment path', () => {
    const url = new URL('https://dpp.example.com/org_123');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('handles trailing slash', () => {
    const url = new URL('https://dpp.example.com/org_123/pass_456/');
    const result = parseDppUrl(url);
    expect(result).toEqual({
      organizationId: 'org_123',
      passportId: 'pass_456',
      file: null,
    });
  });

  it('validates org prefix', () => {
    const url = new URL('https://dpp.example.com/invalid_123/pass_456');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('validates passport prefix', () => {
    const url = new URL('https://dpp.example.com/org_123/invalid_456');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });
});

describe('file validation (security)', () => {
  it('allows whitelisted files: credential.json', () => {
    const url = new URL('https://dpp.example.com/org_123/pass_456/credential.json');
    const result = parseDppUrl(url);
    expect(result?.file).toBe('credential.json');
  });

  it('allows whitelisted files: preview.html', () => {
    const url = new URL('https://dpp.example.com/org_123/pass_456/preview.html');
    const result = parseDppUrl(url);
    expect(result?.file).toBe('preview.html');
  });

  it('allows whitelisted files: qr.png', () => {
    const url = new URL('https://dpp.example.com/org_123/pass_456/qr.png');
    const result = parseDppUrl(url);
    expect(result?.file).toBe('qr.png');
  });

  it('rejects non-whitelisted files', () => {
    const url = new URL('https://dpp.example.com/org_123/pass_456/malicious.js');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('rejects .env files', () => {
    const url = new URL('https://dpp.example.com/org_123/pass_456/.env');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('rejects path traversal attempts with ..', () => {
    const url = new URL('https://dpp.example.com/org_123/pass_456/../../../etc/passwd');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('rejects nested paths', () => {
    const url = new URL('https://dpp.example.com/org_123/pass_456/foo/bar.json');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('rejects paths with more than 3 segments', () => {
    const url = new URL('https://dpp.example.com/org_123/pass_456/credential.json/extra');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('allows no file (for content negotiation)', () => {
    const url = new URL('https://dpp.example.com/org_123/pass_456');
    const result = parseDppUrl(url);
    expect(result?.file).toBeNull();
  });
});

describe('DppUrlParams interface', () => {
  it('has correct shape', () => {
    const params: DppUrlParams = {
      organizationId: 'org_test',
      passportId: 'pass_test',
      file: null,
    };
    expect(params.organizationId).toBe('org_test');
    expect(params.passportId).toBe('pass_test');
    expect(params.file).toBeNull();
  });

  it('allows string file value', () => {
    const params: DppUrlParams = {
      organizationId: 'org_test',
      passportId: 'pass_test',
      file: 'credential.json',
    };
    expect(params.file).toBe('credential.json');
  });
});
