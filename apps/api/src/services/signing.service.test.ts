import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { SigningService } from './signing.service.js';
import type {
  UserForensicContext,
  OrgForensicContext,
  SealedArtifact,
  CredentialStatus,
  TimestampProof,
} from '@eurocomply/shared';
import { ValidationError } from '../lib/errors.js';

describe('SigningService', () => {
  let service: SigningService;

  // Test fixtures
  const testPayload = {
    productId: 'prod_123',
    name: 'Test Product',
    version: '1.0.0',
  };

  const testUserDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
  const testOrgDid = 'did:key:z6MkoHWsmSZnHisAxnVGGCEkAWqPCNMTEjYNvzKmSFUpShHe';

  const testUserForensicContext: UserForensicContext = {
    signerName: 'John Doe',
    signerEmail: 'john@example.com',
    signerRole: 'Product Manager',
    workspaceAuthority: 'DESIGN',
    signedAt: '2026-01-15T10:00:00.000Z',
  };

  const testOrgForensicContext: OrgForensicContext = {
    organizationName: 'Acme Corporation',
    organizationId: 'org_123',
    vatNumber: 'DE123456789',
    certifications: ['ISO9001', 'ISO14001'],
    signedAt: '2026-01-15T10:00:00.000Z',
  };

  beforeEach(() => {
    service = new SigningService();
  });

  describe('signWithUserDid', () => {
    it('should_create_valid_signature_when_payload_and_did_provided', () => {
      const result = service.signWithUserDid(
        testPayload,
        testUserDid,
        testUserForensicContext
      );

      expect(result).toHaveProperty('type', 'Ed25519Signature2020');
      expect(result).toHaveProperty('verificationMethod');
      expect(result).toHaveProperty('signatureValue');
      expect(result).toHaveProperty('created');
      expect(result).toHaveProperty('forensicContext');
      expect(result.forensicContext).toEqual(testUserForensicContext);
    });

    it('should_use_correct_verification_method_format_with_fragment', () => {
      const result = service.signWithUserDid(
        testPayload,
        testUserDid,
        testUserForensicContext
      );

      // Format: did:key:z6MkXXX#z6MkXXX (fragment matches key identifier)
      const keyId = testUserDid.replace('did:key:', '');
      expect(result.verificationMethod).toBe(`${testUserDid}#${keyId}`);
    });

    it('should_produce_deterministic_signature_for_same_inputs', () => {
      const result1 = service.signWithUserDid(
        testPayload,
        testUserDid,
        testUserForensicContext
      );
      const result2 = service.signWithUserDid(
        testPayload,
        testUserDid,
        testUserForensicContext
      );

      expect(result1.signatureValue).toBe(result2.signatureValue);
    });

    it('should_produce_different_signature_for_different_payloads', () => {
      const result1 = service.signWithUserDid(
        testPayload,
        testUserDid,
        testUserForensicContext
      );
      const result2 = service.signWithUserDid(
        { ...testPayload, version: '2.0.0' },
        testUserDid,
        testUserForensicContext
      );

      expect(result1.signatureValue).not.toBe(result2.signatureValue);
    });

    it('should_produce_different_signature_for_different_dids', () => {
      const otherDid = 'did:key:z6MkjX7VzQzzADpUBqkSK1KXHZ4xE7bPyVvhLiN8LMuLf6pR';

      const result1 = service.signWithUserDid(
        testPayload,
        testUserDid,
        testUserForensicContext
      );
      const result2 = service.signWithUserDid(
        testPayload,
        otherDid,
        testUserForensicContext
      );

      expect(result1.signatureValue).not.toBe(result2.signatureValue);
    });

    it('should_include_created_timestamp_from_forensic_context', () => {
      const result = service.signWithUserDid(
        testPayload,
        testUserDid,
        testUserForensicContext
      );

      expect(result.created).toBe(testUserForensicContext.signedAt);
    });

    it('should_throw_validation_error_for_invalid_did_format', () => {
      expect(() =>
        service.signWithUserDid(testPayload, 'invalid-did', testUserForensicContext)
      ).toThrow(ValidationError);

      expect(() =>
        service.signWithUserDid(testPayload, 'did:web:example.com', testUserForensicContext)
      ).toThrow(ValidationError);
    });
  });

  describe('signWithOrgDid', () => {
    it('should_create_valid_signature_when_payload_and_org_did_provided', () => {
      const result = service.signWithOrgDid(
        testPayload,
        testOrgDid,
        testOrgForensicContext
      );

      expect(result).toHaveProperty('type', 'Ed25519Signature2020');
      expect(result).toHaveProperty('verificationMethod');
      expect(result).toHaveProperty('signatureValue');
      expect(result).toHaveProperty('created');
      expect(result).toHaveProperty('forensicContext');
      expect(result.forensicContext).toEqual(testOrgForensicContext);
    });

    it('should_use_correct_verification_method_format_with_fragment', () => {
      const result = service.signWithOrgDid(
        testPayload,
        testOrgDid,
        testOrgForensicContext
      );

      const keyId = testOrgDid.replace('did:key:', '');
      expect(result.verificationMethod).toBe(`${testOrgDid}#${keyId}`);
    });

    it('should_produce_deterministic_signature_for_same_inputs', () => {
      const result1 = service.signWithOrgDid(
        testPayload,
        testOrgDid,
        testOrgForensicContext
      );
      const result2 = service.signWithOrgDid(
        testPayload,
        testOrgDid,
        testOrgForensicContext
      );

      expect(result1.signatureValue).toBe(result2.signatureValue);
    });

    it('should_throw_validation_error_for_invalid_did_format', () => {
      expect(() =>
        service.signWithOrgDid(testPayload, 'not-a-did', testOrgForensicContext)
      ).toThrow(ValidationError);
    });
  });

  describe('createCorporateEnvelope', () => {
    it('should_create_sealed_artifact_with_dual_signatures', () => {
      const result = service.createCorporateEnvelope(
        testPayload,
        { did: testUserDid, forensicContext: testUserForensicContext },
        { did: testOrgDid, forensicContext: testOrgForensicContext }
      );

      expect(result).toHaveProperty('payload');
      expect(result).toHaveProperty('userProof');
      expect(result).toHaveProperty('corporateProof');
      expect(result.payload).toEqual(testPayload);
    });

    it('should_include_valid_user_proof_structure', () => {
      const result = service.createCorporateEnvelope(
        testPayload,
        { did: testUserDid, forensicContext: testUserForensicContext },
        { did: testOrgDid, forensicContext: testOrgForensicContext }
      );

      expect(result.userProof.type).toBe('Ed25519Signature2020');
      expect(result.userProof.verificationMethod).toContain(testUserDid);
      expect(result.userProof.signatureValue).toBeTruthy();
      expect(result.userProof.created).toBe(testUserForensicContext.signedAt);
      expect(result.userProof.forensicContext).toEqual(testUserForensicContext);
    });

    it('should_include_valid_corporate_proof_structure', () => {
      const result = service.createCorporateEnvelope(
        testPayload,
        { did: testUserDid, forensicContext: testUserForensicContext },
        { did: testOrgDid, forensicContext: testOrgForensicContext }
      );

      expect(result.corporateProof.type).toBe('Ed25519Signature2020');
      expect(result.corporateProof.verificationMethod).toContain(testOrgDid);
      expect(result.corporateProof.signatureValue).toBeTruthy();
      expect(result.corporateProof.created).toBe(testOrgForensicContext.signedAt);
      expect(result.corporateProof.forensicContext).toEqual(testOrgForensicContext);
    });

    it('should_have_different_signatures_for_user_and_org', () => {
      const result = service.createCorporateEnvelope(
        testPayload,
        { did: testUserDid, forensicContext: testUserForensicContext },
        { did: testOrgDid, forensicContext: testOrgForensicContext }
      );

      expect(result.userProof.signatureValue).not.toBe(
        result.corporateProof.signatureValue
      );
    });

    it('should_not_include_credential_status_by_default', () => {
      const result = service.createCorporateEnvelope(
        testPayload,
        { did: testUserDid, forensicContext: testUserForensicContext },
        { did: testOrgDid, forensicContext: testOrgForensicContext }
      );

      expect(result.credentialStatus).toBeUndefined();
    });

    it('should_not_include_timestamp_proof_by_default', () => {
      const result = service.createCorporateEnvelope(
        testPayload,
        { did: testUserDid, forensicContext: testUserForensicContext },
        { did: testOrgDid, forensicContext: testOrgForensicContext }
      );

      expect(result.timestampProof).toBeUndefined();
    });

    it('should_include_credential_status_when_provided', () => {
      const credentialStatus: CredentialStatus = {
        type: 'StatusList2021Entry',
        statusPurpose: 'revocation',
        statusListIndex: '42',
        statusListCredential: 'https://example.com/status/1',
      };

      const result = service.createCorporateEnvelope(
        testPayload,
        { did: testUserDid, forensicContext: testUserForensicContext },
        { did: testOrgDid, forensicContext: testOrgForensicContext },
        { credentialStatus }
      );

      expect(result.credentialStatus).toEqual(credentialStatus);
    });

    it('should_include_timestamp_proof_when_provided', () => {
      const timestampProof: TimestampProof = {
        type: 'RFC3161',
        timestamp: '2026-01-15T10:00:00.000Z',
        authority: 'https://timestamp.example.com',
        token: 'base64-encoded-token',
        hashAlgorithm: 'SHA-256',
      };

      const result = service.createCorporateEnvelope(
        testPayload,
        { did: testUserDid, forensicContext: testUserForensicContext },
        { did: testOrgDid, forensicContext: testOrgForensicContext },
        { timestampProof }
      );

      expect(result.timestampProof).toEqual(timestampProof);
    });

    it('should_produce_deterministic_envelope_for_same_inputs', () => {
      const result1 = service.createCorporateEnvelope(
        testPayload,
        { did: testUserDid, forensicContext: testUserForensicContext },
        { did: testOrgDid, forensicContext: testOrgForensicContext }
      );
      const result2 = service.createCorporateEnvelope(
        testPayload,
        { did: testUserDid, forensicContext: testUserForensicContext },
        { did: testOrgDid, forensicContext: testOrgForensicContext }
      );

      expect(result1.userProof.signatureValue).toBe(result2.userProof.signatureValue);
      expect(result1.corporateProof.signatureValue).toBe(result2.corporateProof.signatureValue);
    });

    it('should_throw_validation_error_for_invalid_user_did', () => {
      expect(() =>
        service.createCorporateEnvelope(
          testPayload,
          { did: 'invalid', forensicContext: testUserForensicContext },
          { did: testOrgDid, forensicContext: testOrgForensicContext }
        )
      ).toThrow(ValidationError);
    });

    it('should_throw_validation_error_for_invalid_org_did', () => {
      expect(() =>
        service.createCorporateEnvelope(
          testPayload,
          { did: testUserDid, forensicContext: testUserForensicContext },
          { did: 'invalid', forensicContext: testOrgForensicContext }
        )
      ).toThrow(ValidationError);
    });
  });

  describe('deterministic signature verification', () => {
    it('should_use_sha256_hash_of_canonical_json_plus_did', () => {
      const result = service.signWithUserDid(
        testPayload,
        testUserDid,
        testUserForensicContext
      );

      // Manually compute expected signature
      const canonicalPayload = JSON.stringify(testPayload);
      const expectedHash = createHash('sha256')
        .update(canonicalPayload + testUserDid)
        .digest('hex');

      expect(result.signatureValue).toBe(expectedHash);
    });
  });
});
