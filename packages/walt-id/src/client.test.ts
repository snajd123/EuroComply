import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaltIdClient } from './client.js';
import type { WaltIdConfig } from './types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WaltIdClient', () => {
  const config: WaltIdConfig = {
    coreApiUrl: 'http://localhost:7000',
    signatoryUrl: 'http://localhost:7001',
    custodianUrl: 'http://localhost:7002',
    auditorUrl: 'http://localhost:7003',
    timeout: 5000,
  };

  let client: WaltIdClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new WaltIdClient(config);
  });

  describe('createDid', () => {
    it('should create a did:key with Ed25519', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          did: 'did:key:z6MkTest123',
          keyId: 'key_abc123',
          didDocument: {
            id: 'did:key:z6MkTest123',
            verificationMethod: [{
              id: 'did:key:z6MkTest123#z6MkTest123',
              type: 'Ed25519VerificationKey2020',
              controller: 'did:key:z6MkTest123',
              publicKeyMultibase: 'z6MkTest123',
            }],
          },
        }),
      });

      const result = await client.createDid({
        method: 'key',
        keyAlgorithm: 'Ed25519',
      });

      expect(result.did).toBe('did:key:z6MkTest123');
      expect(result.keyId).toBe('key_abc123');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7000/v1/did/create',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('sign', () => {
    it('should sign payload with Ed25519', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jws: 'eyJhbGciOiJFZERTQSJ9.eyJwYXlsb2FkIjp7fX0.signature',
          verificationMethod: 'did:key:z6MkTest123#z6MkTest123',
          created: '2026-01-18T10:00:00Z',
        }),
      });

      const result = await client.sign({
        keyId: 'key_abc123',
        payload: { test: 'data' },
        proofType: 'Ed25519Signature2020',
      });

      expect(result.jws).toContain('eyJ');
      expect(result.verificationMethod).toContain('did:key:');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7001/v1/credentials/sign',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('verify', () => {
    it('should verify a valid credential', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: true,
          checks: { signature: true },
          errors: [],
        }),
      });

      const result = await client.verify({
        vcJwt: 'eyJhbGciOiJFZERTQSJ9.payload.signature',
        policies: ['signature'],
      });

      expect(result.valid).toBe(true);
      expect(result.checks.signature).toBe(true);
    });

    it('should return invalid for bad signature', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: false,
          checks: { signature: false },
          errors: ['Invalid signature'],
        }),
      });

      const result = await client.verify({
        vcJwt: 'invalid.jwt.here',
        policies: ['signature'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid signature');
    });
  });

  describe('issueVc', () => {
    it('should issue a Verifiable Credential', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          vcJwt: 'eyJhbGciOiJFZERTQSJ9.vc-payload.signature',
          vcId: 'vc_xyz789',
          issuanceDate: '2026-01-18T10:00:00Z',
        }),
      });

      const result = await client.issueVc({
        issuerDid: 'did:key:z6MkOrg123',
        issuerKeyId: 'key_org_123',
        credentialType: ['VerifiableCredential', 'DigitalProductPassport'],
        credentialSubject: {
          productId: 'prod_123',
          name: 'Test Product',
        },
      });

      expect(result.vcJwt).toContain('eyJ');
      expect(result.vcId).toBe('vc_xyz789');
    });
  });
});
