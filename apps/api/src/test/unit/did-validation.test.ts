import { describe, it, expect } from 'vitest';
import { SigningService } from '../../services/signing.service.js';
import { ValidationError } from '../../lib/errors.js';

describe('DID validation', () => {
  const service = new SigningService({ forceMock: true });
  const validForensicContext = {
    signedAt: new Date().toISOString(),
    signerName: 'Test User',
    signerEmail: 'test@example.com',
    signerRole: 'Tester',
    workspaceAuthority: 'VIEWER' as const,
  };

  describe('valid DIDs', () => {
    it('should accept valid Ed25519 did:key', async () => {
      const validDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

      const result = await service.signWithUserDid(
        { test: true },
        validDid,
        validForensicContext
      );

      expect(result).toBeDefined();
      expect(result.verificationMethod).toContain(validDid);
    });

    it('should accept another valid Ed25519 did:key', async () => {
      const validDid = 'did:key:z6MkoHWsmSZnHisAxnVGGCEkAWqPCNMTEjYNvzKmSFUpShHe';

      const result = await service.signWithUserDid(
        { test: true },
        validDid,
        validForensicContext
      );

      expect(result).toBeDefined();
    });
  });

  describe('invalid DIDs', () => {
    it('should reject did:key with wrong prefix (z6LS is not Ed25519)', async () => {
      const invalidDid = 'did:key:z6LSeu9HkTHSfLLeUs2nnzUSNedgDUevfNQgQjQC23ZCit6F';

      await expect(
        service.signWithUserDid({ test: true }, invalidDid, validForensicContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should reject non-did:key DIDs', async () => {
      const invalidDid = 'did:web:example.com';

      await expect(
        service.signWithUserDid({ test: true }, invalidDid, validForensicContext)
      ).rejects.toThrow('must be did:key format');
    });

    it('should reject did:ethr DIDs', async () => {
      const invalidDid = 'did:ethr:0x1234567890abcdef';

      await expect(
        service.signWithUserDid({ test: true }, invalidDid, validForensicContext)
      ).rejects.toThrow('must be did:key format');
    });

    it('should reject too short key identifier', async () => {
      const invalidDid = 'did:key:z6MkShort';

      await expect(
        service.signWithUserDid({ test: true }, invalidDid, validForensicContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should reject key with invalid base58btc characters', async () => {
      // 'l' and 'I' are not valid base58btc characters
      const invalidDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2dIl';

      await expect(
        service.signWithUserDid({ test: true }, invalidDid, validForensicContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should reject empty string', async () => {
      await expect(
        service.signWithUserDid({ test: true }, '', validForensicContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should reject just the prefix', async () => {
      await expect(
        service.signWithUserDid({ test: true }, 'did:key:z6Mk', validForensicContext)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('error messages', () => {
    it('should provide helpful error for non-did:key', async () => {
      try {
        await service.signWithUserDid(
          { test: true },
          'did:web:example.com',
          validForensicContext
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as Error).message).toContain('must be did:key format');
      }
    });

    it('should provide helpful error for wrong key type', async () => {
      try {
        await service.signWithUserDid(
          { test: true },
          'did:key:z6LSeu9HkTHSfLLeUs2nnzUSNedgDUevfNQgQjQC23ZCit6F',
          validForensicContext
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as Error).message).toContain('Ed25519');
      }
    });
  });
});
