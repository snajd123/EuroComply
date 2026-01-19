import { describe, it, expect } from 'vitest';
import {
  VerifyArtifactBodySchema,
  VerifySignatureBodySchema,
  SealedArtifactSchema,
} from '../../lib/schemas.js';

function createValidArtifact() {
  return {
    payload: { test: 'data' },
    userProof: {
      type: 'Ed25519Signature2020' as const,
      verificationMethod: 'did:key:z6Mktest#z6Mktest',
      signatureValue: 'abc123',
      created: '2024-01-01T00:00:00Z',
      forensicContext: {
        signedAt: '2024-01-01T00:00:00Z',
        signerName: 'Test User',
        signerEmail: 'test@example.com',
      },
    },
    corporateProof: {
      type: 'Ed25519Signature2020' as const,
      verificationMethod: 'did:key:z6Mkorg#z6Mkorg',
      signatureValue: 'def456',
      created: '2024-01-01T00:00:00Z',
      forensicContext: {
        signedAt: '2024-01-01T00:00:00Z',
        organizationName: 'Test Org',
        organizationId: 'org_123',
      },
    },
  };
}

describe('verification schemas', () => {
  describe('SealedArtifactSchema', () => {
    it('should accept valid sealed artifact', () => {
      const result = SealedArtifactSchema.safeParse(createValidArtifact());
      expect(result.success).toBe(true);
    });

    it('should accept artifact with credential status', () => {
      const artifact = {
        ...createValidArtifact(),
        credentialStatus: {
          statusListIndex: '42',
          statusListCredential: 'https://api.example.com/status-list',
        },
      };
      const result = SealedArtifactSchema.safeParse(artifact);
      expect(result.success).toBe(true);
    });

    it('should accept artifact with timestamp proof', () => {
      const artifact = {
        ...createValidArtifact(),
        timestampProof: {
          timestamp: '2024-01-01T00:00:00Z',
          token: 'base64encodedtoken',
          authority: 'FREETSA',
        },
      };
      const result = SealedArtifactSchema.safeParse(artifact);
      expect(result.success).toBe(true);
    });

    it('should reject missing payload', () => {
      const artifact = createValidArtifact();
      // @ts-expect-error - intentionally removing required field
      delete artifact.payload;
      const result = SealedArtifactSchema.safeParse(artifact);
      expect(result.success).toBe(false);
    });

    it('should reject missing userProof', () => {
      const artifact = createValidArtifact();
      // @ts-expect-error - intentionally removing required field
      delete artifact.userProof;
      const result = SealedArtifactSchema.safeParse(artifact);
      expect(result.success).toBe(false);
    });

    it('should reject invalid proof type', () => {
      const artifact = createValidArtifact();
      artifact.userProof.type = 'InvalidType' as any;
      const result = SealedArtifactSchema.safeParse(artifact);
      expect(result.success).toBe(false);
    });

    it('should reject empty signature value', () => {
      const artifact = createValidArtifact();
      artifact.userProof.signatureValue = '';
      const result = SealedArtifactSchema.safeParse(artifact);
      expect(result.success).toBe(false);
    });
  });

  describe('VerifyArtifactBodySchema', () => {
    it('should accept valid request body', () => {
      const body = { artifact: createValidArtifact() };
      const result = VerifyArtifactBodySchema.safeParse(body);
      expect(result.success).toBe(true);
    });

    it('should reject missing artifact', () => {
      const result = VerifyArtifactBodySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept optional checkRevocation', () => {
      const body = {
        artifact: createValidArtifact(),
        checkRevocation: false,
      };
      const result = VerifyArtifactBodySchema.safeParse(body);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.checkRevocation).toBe(false);
      }
    });

    it('should default checkRevocation to true', () => {
      const body = { artifact: createValidArtifact() };
      const result = VerifyArtifactBodySchema.safeParse(body);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.checkRevocation).toBe(true);
      }
    });

    it('should accept valid revocationTime', () => {
      const body = {
        artifact: createValidArtifact(),
        revocationTime: '2024-01-01T00:00:00Z',
      };
      const result = VerifyArtifactBodySchema.safeParse(body);
      expect(result.success).toBe(true);
    });

    it('should reject invalid revocationTime format', () => {
      const body = {
        artifact: createValidArtifact(),
        revocationTime: 'not-a-date',
      };
      const result = VerifyArtifactBodySchema.safeParse(body);
      expect(result.success).toBe(false);
    });
  });

  describe('VerifySignatureBodySchema', () => {
    it('should accept valid request body', () => {
      const body = { artifact: createValidArtifact() };
      const result = VerifySignatureBodySchema.safeParse(body);
      expect(result.success).toBe(true);
    });

    it('should reject missing artifact', () => {
      const result = VerifySignatureBodySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject invalid proof structure', () => {
      const body = {
        artifact: {
          payload: {},
          userProof: { invalid: true },
          corporateProof: { invalid: true },
        },
      };
      const result = VerifySignatureBodySchema.safeParse(body);
      expect(result.success).toBe(false);
    });
  });
});
