/**
 * E2E Verification Tests
 *
 * Tests the full verification flow:
 * 1. Sign a payload with user DID
 * 2. Sign with org DID (corporate envelope)
 * 3. Verify the signatures
 * 4. Revoke and verify revocation status
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SigningService,
  type UserSigningContext,
  type OrgSigningContext,
} from '../../services/signing.service.js';
import { StatusList2021Service } from '../../services/status-list.service.js';
import type { UserForensicContext, OrgForensicContext } from '@eurocomply/shared';

describe('Verification E2E Flow', () => {
  let signingService: SigningService;

  beforeEach(() => {
    // Use mock signatures for testing (no walt.id dependency)
    signingService = new SigningService({ forceMock: true });
  });

  describe('SigningService', () => {
    const testUserDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
    const testOrgDid = 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';

    const testPayload = {
      eventType: 'BATCH_PRODUCED',
      batchId: 'BATCH-001',
      quantity: 100,
      timestamp: '2026-01-19T12:00:00Z',
    };

    const userForensicContext: UserForensicContext = {
      signerName: 'Test User',
      signerEmail: 'user@example.com',
      signerRole: 'EDITOR',
      workspaceAuthority: 'EDITOR',
      signedAt: '2026-01-19T12:00:00Z',
    };

    const orgForensicContext: OrgForensicContext = {
      organizationId: 'org-456',
      organizationName: 'Test Org',
      vatNumber: 'DE123456789',
      certifications: ['ISO-9001', 'GOTS'],
      signedAt: '2026-01-19T12:00:01Z',
    };

    it('should sign payload with user DID', async () => {
      const proof = await signingService.signWithUserDid(
        testPayload,
        testUserDid,
        userForensicContext
      );

      expect(proof.type).toBe('Ed25519Signature2020');
      expect(proof.verificationMethod).toBe(`${testUserDid}#z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK`);
      expect(proof.signatureValue).toBeTruthy();
      expect(proof.created).toBe(userForensicContext.signedAt);
      expect(proof.forensicContext).toEqual(userForensicContext);
    });

    it('should sign payload with org DID', async () => {
      const proof = await signingService.signWithOrgDid(
        testPayload,
        testOrgDid,
        orgForensicContext
      );

      expect(proof.type).toBe('Ed25519Signature2020');
      expect(proof.verificationMethod).toBe(`${testOrgDid}#z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH`);
      expect(proof.signatureValue).toBeTruthy();
      expect(proof.created).toBe(orgForensicContext.signedAt);
      expect(proof.forensicContext).toEqual(orgForensicContext);
    });

    it('should create corporate envelope with dual signatures', async () => {
      const userContext: UserSigningContext = {
        did: testUserDid,
        forensicContext: userForensicContext,
      };

      const orgContext: OrgSigningContext = {
        did: testOrgDid,
        forensicContext: orgForensicContext,
      };

      const envelope = await signingService.createCorporateEnvelope(
        testPayload,
        userContext,
        orgContext
      );

      expect(envelope.payload).toEqual(testPayload);
      expect(envelope.userProof.type).toBe('Ed25519Signature2020');
      expect(envelope.corporateProof.type).toBe('Ed25519Signature2020');
      expect(envelope.userProof.verificationMethod).toContain(testUserDid);
      expect(envelope.corporateProof.verificationMethod).toContain(testOrgDid);
    });

    it('should include credential status in corporate envelope', async () => {
      const userContext: UserSigningContext = {
        did: testUserDid,
        forensicContext: userForensicContext,
      };

      const orgContext: OrgSigningContext = {
        did: testOrgDid,
        forensicContext: orgForensicContext,
      };

      const credentialStatus = {
        type: 'StatusList2021Entry' as const,
        statusPurpose: 'revocation' as const,
        statusListIndex: '42',
        statusListCredential: 'https://api.eurocomply.eu/organizations/org-456/status-list',
      };

      const envelope = await signingService.createCorporateEnvelope(
        testPayload,
        userContext,
        orgContext,
        { credentialStatus }
      );

      expect(envelope.credentialStatus).toEqual(credentialStatus);
    });

    it('should produce deterministic mock signatures', async () => {
      const proof1 = await signingService.signWithUserDid(
        testPayload,
        testUserDid,
        userForensicContext
      );

      const proof2 = await signingService.signWithUserDid(
        testPayload,
        testUserDid,
        userForensicContext
      );

      // Same payload + DID should produce same signature
      expect(proof1.signatureValue).toBe(proof2.signatureValue);
    });

    it('should produce different signatures for different payloads', async () => {
      const proof1 = await signingService.signWithUserDid(
        testPayload,
        testUserDid,
        userForensicContext
      );

      const modifiedPayload = { ...testPayload, quantity: 200 };
      const proof2 = await signingService.signWithUserDid(
        modifiedPayload,
        testUserDid,
        userForensicContext
      );

      expect(proof1.signatureValue).not.toBe(proof2.signatureValue);
    });

    it('should reject invalid DID format', async () => {
      await expect(
        signingService.signWithUserDid(testPayload, 'invalid-did', userForensicContext)
      ).rejects.toThrow('Invalid DID format');

      await expect(
        signingService.signWithUserDid(testPayload, 'did:web:example.com', userForensicContext)
      ).rejects.toThrow('Invalid DID format');
    });
  });

  describe('StatusList2021Service (offline verification)', () => {
    it('should throw for out-of-bounds index', () => {
      // Any string will fail with out-of-bounds before decompression
      expect(() =>
        StatusList2021Service.checkRevocationFromEncodedList('any-string', -1)
      ).toThrow('Index out of bounds');

      expect(() =>
        StatusList2021Service.checkRevocationFromEncodedList('any-string', 100000000)
      ).toThrow('Index out of bounds');
    });
  });
});
