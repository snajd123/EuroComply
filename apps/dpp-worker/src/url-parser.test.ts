import { describe, it, expect } from 'vitest';
import { DppUrlParams, parseDppUrl } from './url-parser';

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
