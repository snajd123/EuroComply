import { describe, it, expect } from 'vitest';
import { DppUrlParams, parseDppUrl } from './url-parser.js';

// Valid test IDs matching the pattern: prefix + 10-30 alphanumeric characters
const VALID_ORG_ID = 'org_1234567890abcdef';
const VALID_PASS_ID = 'pass_1234567890abcdef';
const VALID_ORG_ID_2 = 'org_abcdefghij1234567890';
const VALID_PASS_ID_2 = 'pass_xyzabc1234567890';

describe('parseDppUrl', () => {
  it('parses org and passport from path', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/${VALID_PASS_ID}`);
    const result = parseDppUrl(url);
    expect(result).toEqual({
      organizationId: VALID_ORG_ID,
      passportId: VALID_PASS_ID,
      file: null,
    });
  });

  it('parses org, passport, and specific file', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID_2}/${VALID_PASS_ID_2}/preview.html`);
    const result = parseDppUrl(url);
    expect(result).toEqual({
      organizationId: VALID_ORG_ID_2,
      passportId: VALID_PASS_ID_2,
      file: 'preview.html',
    });
  });

  it('parses credential.json file request', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/${VALID_PASS_ID}/credential.json`);
    const result = parseDppUrl(url);
    expect(result).toEqual({
      organizationId: VALID_ORG_ID,
      passportId: VALID_PASS_ID,
      file: 'credential.json',
    });
  });

  it('returns null for root path', () => {
    const url = new URL('https://dpp.example.com/');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('returns null for single segment path', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}`);
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('handles trailing slash', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/${VALID_PASS_ID}/`);
    const result = parseDppUrl(url);
    expect(result).toEqual({
      organizationId: VALID_ORG_ID,
      passportId: VALID_PASS_ID,
      file: null,
    });
  });

  it('validates org prefix', () => {
    const url = new URL(`https://dpp.example.com/invalid_1234567890abcdef/${VALID_PASS_ID}`);
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('validates passport prefix', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/invalid_1234567890abcdef`);
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('rejects org ID that is too short', () => {
    const url = new URL(`https://dpp.example.com/org_123/${VALID_PASS_ID}`);
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('rejects passport ID that is too short', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/pass_123`);
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('rejects org ID with invalid characters', () => {
    const url = new URL(`https://dpp.example.com/org_1234567890-abc!/${VALID_PASS_ID}`);
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });
});

describe('file validation (security)', () => {
  it('allows whitelisted files: credential.json', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/${VALID_PASS_ID}/credential.json`);
    const result = parseDppUrl(url);
    expect(result?.file).toBe('credential.json');
  });

  it('allows whitelisted files: preview.html', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/${VALID_PASS_ID}/preview.html`);
    const result = parseDppUrl(url);
    expect(result?.file).toBe('preview.html');
  });

  it('allows whitelisted files: qr.png', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/${VALID_PASS_ID}/qr.png`);
    const result = parseDppUrl(url);
    expect(result?.file).toBe('qr.png');
  });

  it('rejects non-whitelisted files', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/${VALID_PASS_ID}/malicious.js`);
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('rejects .env files', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/${VALID_PASS_ID}/.env`);
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('rejects path traversal attempts with ..', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/${VALID_PASS_ID}/../../../etc/passwd`);
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('rejects nested paths', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/${VALID_PASS_ID}/foo/bar.json`);
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('rejects paths with more than 3 segments', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/${VALID_PASS_ID}/credential.json/extra`);
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('allows no file (for content negotiation)', () => {
    const url = new URL(`https://dpp.example.com/${VALID_ORG_ID}/${VALID_PASS_ID}`);
    const result = parseDppUrl(url);
    expect(result?.file).toBeNull();
  });
});

describe('DppUrlParams interface', () => {
  it('has correct shape', () => {
    const params: DppUrlParams = {
      organizationId: VALID_ORG_ID,
      passportId: VALID_PASS_ID,
      file: null,
    };
    expect(params.organizationId).toBe(VALID_ORG_ID);
    expect(params.passportId).toBe(VALID_PASS_ID);
    expect(params.file).toBeNull();
  });

  it('allows string file value', () => {
    const params: DppUrlParams = {
      organizationId: VALID_ORG_ID,
      passportId: VALID_PASS_ID,
      file: 'credential.json',
    };
    expect(params.file).toBe('credential.json');
  });
});
