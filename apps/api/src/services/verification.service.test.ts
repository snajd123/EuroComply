import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  VerificationService,
  type VerificationResult,
} from './verification.service.js';

interface MockDependencies {
  waltIdClient: {
    verify: Mock;
  };
  statusListService: {
    isRevoked: Mock;
  };
  timestampService: {
    verifyTimestamp: Mock;
  };
}

const mockDeps: MockDependencies = {
  waltIdClient: {
    verify: vi.fn(),
  },
  statusListService: {
    isRevoked: vi.fn(),
  },
  timestampService: {
    verifyTimestamp: vi.fn(),
  },
};

describe('VerificationService', () => {
  let service: VerificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VerificationService(
      mockDeps.waltIdClient as any,
      mockDeps.statusListService as any,
      mockDeps.timestampService as any
    );
  });

  describe('verifySealedArtifact', () => {
    const validArtifact = {
      payload: { type: 'Test', data: {} },
      userProof: {
        type: 'Ed25519Signature2020' as const,
        verificationMethod: 'did:key:z6MkUser#z6MkUser',
        signatureValue: 'user-jws',
        created: '2026-01-18T10:00:00Z',
        forensicContext: {
          signerName: 'Test User',
          signerEmail: 'test@test.com',
          signerRole: 'EDITOR',
          workspaceAuthority: 'DESIGN:EDITOR',
          signedAt: '2026-01-18T10:00:00Z',
        },
      },
      corporateProof: {
        type: 'Ed25519Signature2020' as const,
        verificationMethod: 'did:key:z6MkOrg#z6MkOrg',
        signatureValue: 'org-jws',
        created: '2026-01-18T10:00:01Z',
        forensicContext: {
          organizationName: 'Test Org',
          organizationId: 'org_123',
          signedAt: '2026-01-18T10:00:01Z',
        },
      },
      credentialStatus: {
        type: 'StatusList2021Entry' as const,
        statusPurpose: 'revocation' as const,
        statusListIndex: '42',
        statusListCredential:
          'https://api.eurocomply.eu/organizations/org_123/status-list',
      },
    };

    it('should return valid for properly signed, non-revoked artifact', async () => {
      mockDeps.waltIdClient.verify.mockResolvedValue({
        valid: true,
        checks: { signature: true },
        errors: [],
      });
      mockDeps.statusListService.isRevoked.mockResolvedValue(false);

      const result = await service.verifySealedArtifact(validArtifact);

      expect(result.valid).toBe(true);
      expect(result.checks.userSignature).toBe(true);
      expect(result.checks.orgSignature).toBe(true);
      expect(result.checks.revocationStatus).toBe(true);
    });

    it('should return invalid for bad user signature', async () => {
      mockDeps.waltIdClient.verify
        .mockResolvedValueOnce({
          valid: false,
          checks: { signature: false },
          errors: ['Invalid signature'],
        })
        .mockResolvedValueOnce({
          valid: true,
          checks: { signature: true },
          errors: [],
        });
      mockDeps.statusListService.isRevoked.mockResolvedValue(false);

      const result = await service.verifySealedArtifact(validArtifact);

      expect(result.valid).toBe(false);
      expect(result.checks.userSignature).toBe(false);
      expect(result.errors).toContain('User signature verification failed');
    });

    it('should return invalid for bad org signature', async () => {
      mockDeps.waltIdClient.verify
        .mockResolvedValueOnce({
          valid: true,
          checks: { signature: true },
          errors: [],
        })
        .mockResolvedValueOnce({
          valid: false,
          checks: { signature: false },
          errors: ['Invalid signature'],
        });
      mockDeps.statusListService.isRevoked.mockResolvedValue(false);

      const result = await service.verifySealedArtifact(validArtifact);

      expect(result.valid).toBe(false);
      expect(result.checks.orgSignature).toBe(false);
      expect(result.errors).toContain(
        'Organization signature verification failed'
      );
    });

    it('should return revoked for revoked credential', async () => {
      mockDeps.waltIdClient.verify.mockResolvedValue({
        valid: true,
        checks: { signature: true },
        errors: [],
      });
      mockDeps.statusListService.isRevoked.mockResolvedValue(true);

      const result = await service.verifySealedArtifact(validArtifact);

      expect(result.valid).toBe(false);
      expect(result.checks.revocationStatus).toBe(false);
      expect(result.errors).toContain('Credential has been revoked');
    });

    it('should accept revoked credential if signed before revocation', async () => {
      const artifactWithTimestamp = {
        ...validArtifact,
        timestampProof: {
          type: 'RFC3161' as const,
          timestamp: '2026-01-18T10:00:05Z',
          authority: 'https://freetsa.org/tsr',
          token: 'base64-token',
          hashAlgorithm: 'SHA-256' as const,
        },
      };

      mockDeps.waltIdClient.verify.mockResolvedValue({
        valid: true,
        checks: { signature: true },
        errors: [],
      });
      mockDeps.statusListService.isRevoked.mockResolvedValue(true);
      mockDeps.timestampService.verifyTimestamp.mockResolvedValue({
        valid: true,
        timestamp: '2026-01-18T10:00:05Z',
      });

      // Revocation happened AFTER timestamp (11:00 vs 10:00)
      const result = await service.verifySealedArtifact(artifactWithTimestamp, {
        revocationTime: new Date('2026-01-18T11:00:00Z'),
      });

      expect(result.valid).toBe(true);
      expect(result.checks.timestampBeforeRevocation).toBe(true);
    });

    it('should reject revoked credential if signed after revocation', async () => {
      const artifactWithTimestamp = {
        ...validArtifact,
        timestampProof: {
          type: 'RFC3161' as const,
          timestamp: '2026-01-18T12:00:00Z', // After revocation
          authority: 'https://freetsa.org/tsr',
          token: 'base64-token',
          hashAlgorithm: 'SHA-256' as const,
        },
      };

      mockDeps.waltIdClient.verify.mockResolvedValue({
        valid: true,
        checks: { signature: true },
        errors: [],
      });
      mockDeps.statusListService.isRevoked.mockResolvedValue(true);
      mockDeps.timestampService.verifyTimestamp.mockResolvedValue({
        valid: true,
        timestamp: '2026-01-18T12:00:00Z',
      });

      // Revocation happened BEFORE timestamp (11:00 vs 12:00)
      const result = await service.verifySealedArtifact(artifactWithTimestamp, {
        revocationTime: new Date('2026-01-18T11:00:00Z'),
      });

      expect(result.valid).toBe(false);
      expect(result.checks.timestampBeforeRevocation).toBe(false);
      expect(result.errors).toContain('Credential has been revoked');
    });

    it('should include forensic context in result', async () => {
      mockDeps.waltIdClient.verify.mockResolvedValue({
        valid: true,
        checks: { signature: true },
        errors: [],
      });
      mockDeps.statusListService.isRevoked.mockResolvedValue(false);

      const result = await service.verifySealedArtifact(validArtifact);

      expect(result.forensicContext).toEqual({
        userSigner: 'Test User',
        organization: 'Test Org',
        signedAt: '2026-01-18T10:00:00Z',
      });
    });

    it('should verify timestamp if present', async () => {
      const artifactWithTimestamp = {
        ...validArtifact,
        timestampProof: {
          type: 'RFC3161' as const,
          timestamp: '2026-01-18T10:00:05Z',
          authority: 'https://freetsa.org/tsr',
          token: 'base64-token',
          hashAlgorithm: 'SHA-256' as const,
        },
      };

      mockDeps.waltIdClient.verify.mockResolvedValue({
        valid: true,
        checks: { signature: true },
        errors: [],
      });
      mockDeps.statusListService.isRevoked.mockResolvedValue(false);
      mockDeps.timestampService.verifyTimestamp.mockResolvedValue({
        valid: true,
        timestamp: '2026-01-18T10:00:05Z',
      });

      const result = await service.verifySealedArtifact(artifactWithTimestamp);

      expect(result.checks.timestampValid).toBe(true);
    });
  });

  describe('verifySignaturesOnly', () => {
    const artifact = {
      payload: { type: 'Test' },
      userProof: {
        type: 'Ed25519Signature2020' as const,
        verificationMethod: 'did:key:z6MkUser#z6MkUser',
        signatureValue: 'user-jws',
        created: '2026-01-18T10:00:00Z',
        forensicContext: {
          signerName: 'Test User',
          signerEmail: 'test@test.com',
          signerRole: 'EDITOR',
          workspaceAuthority: 'DESIGN:EDITOR',
          signedAt: '2026-01-18T10:00:00Z',
        },
      },
      corporateProof: {
        type: 'Ed25519Signature2020' as const,
        verificationMethod: 'did:key:z6MkOrg#z6MkOrg',
        signatureValue: 'org-jws',
        created: '2026-01-18T10:00:01Z',
        forensicContext: {
          organizationName: 'Test Org',
          organizationId: 'org_123',
          signedAt: '2026-01-18T10:00:01Z',
        },
      },
    };

    it('should verify signatures without checking revocation', async () => {
      mockDeps.waltIdClient.verify.mockResolvedValue({
        valid: true,
        checks: { signature: true },
        errors: [],
      });

      const result = await service.verifySignaturesOnly(artifact);

      expect(result.valid).toBe(true);
      expect(result.userSignature).toBe(true);
      expect(result.orgSignature).toBe(true);
      // Should not call isRevoked
      expect(mockDeps.statusListService.isRevoked).not.toHaveBeenCalled();
    });
  });
});
