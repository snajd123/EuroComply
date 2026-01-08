/**
 * did:key Service Tests
 * TDD: Tests written FIRST before implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DidKeyService, getDidKeyService, resetDidKeyService } from './did-key.service.js';

describe('DidKeyService', () => {
  beforeEach(() => {
    resetDidKeyService();
  });

  describe('createDidKey', () => {
    it('should_create_valid_did_key_when_called_with_defaults', async () => {
      // Arrange
      const service = getDidKeyService();

      // Act
      const result = await service.createDidKey();

      // Assert
      expect(result.did).toMatch(/^did:key:z[a-zA-Z0-9]+$/);
      expect(result.keyId).toBeTruthy();
      expect(result.didDocument).toBeDefined();
      expect(result.didDocument.id).toBe(result.did);
    });

    it('should_create_did_key_with_Ed25519_when_algorithm_is_EdDSA', async () => {
      // Arrange
      const service = getDidKeyService();

      // Act
      const result = await service.createDidKey({ algorithm: 'EdDSA' });

      // Assert
      expect(result.did).toMatch(/^did:key:z6Mk/); // Ed25519 multicodec prefix
      expect(result.didDocument.verificationMethod?.[0]?.publicKeyJwk?.crv).toBe('Ed25519');
    });

    it('should_create_did_key_with_P256_when_algorithm_is_ES256', async () => {
      // Arrange
      const service = getDidKeyService();

      // Act
      const result = await service.createDidKey({ algorithm: 'ES256' });

      // Assert
      expect(result.did).toMatch(/^did:key:zDn/); // P-256 multicodec prefix
      expect(result.didDocument.verificationMethod?.[0]?.publicKeyJwk?.crv).toBe('P-256');
    });

    it('should_include_verification_methods_in_did_document', async () => {
      // Arrange
      const service = getDidKeyService();

      // Act
      const result = await service.createDidKey();

      // Assert
      expect(result.didDocument.verificationMethod).toHaveLength(1);
      expect(result.didDocument.authentication).toContain(`${result.did}#key-1`);
      expect(result.didDocument.assertionMethod).toContain(`${result.did}#key-1`);
    });
  });

  describe('resolveDidKey', () => {
    it('should_resolve_did_key_to_document_when_valid_did_provided', async () => {
      // Arrange
      const service = getDidKeyService();
      const { did } = await service.createDidKey();

      // Act
      const document = await service.resolveDidKey(did);

      // Assert
      expect(document).toBeDefined();
      expect(document?.id).toBe(did);
      expect(document?.verificationMethod).toHaveLength(1);
    });

    it('should_return_null_when_invalid_did_key_provided', async () => {
      // Arrange
      const service = getDidKeyService();

      // Act
      const document = await service.resolveDidKey('did:key:invalid');

      // Assert
      expect(document).toBeNull();
    });

    it('should_return_null_when_non_did_key_provided', async () => {
      // Arrange
      const service = getDidKeyService();

      // Act
      const document = await service.resolveDidKey('did:web:example.com');

      // Assert
      expect(document).toBeNull();
    });
  });

  describe('extractPublicKey', () => {
    it('should_extract_public_key_jwk_from_did_key', async () => {
      // Arrange
      const service = getDidKeyService();
      const { did } = await service.createDidKey({ algorithm: 'EdDSA' });

      // Act
      const publicKey = await service.extractPublicKey(did);

      // Assert
      expect(publicKey).toBeDefined();
      expect(publicKey?.kty).toBe('OKP');
      expect(publicKey?.crv).toBe('Ed25519');
      expect(publicKey?.x).toBeTruthy();
    });

    it('should_return_null_for_invalid_did_key', async () => {
      // Arrange
      const service = getDidKeyService();

      // Act
      const publicKey = await service.extractPublicKey('did:key:invalid');

      // Assert
      expect(publicKey).toBeNull();
    });
  });

  describe('verifySignature', () => {
    it('should_verify_valid_signature_when_signed_with_did_key', async () => {
      // Arrange
      const service = getDidKeyService();
      const { did, keyId } = await service.createDidKey();
      const data = 'test message to sign';

      // Act
      const signature = await service.sign(keyId, data);
      const isValid = await service.verifySignature(did, data, signature);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should_reject_invalid_signature', async () => {
      // Arrange
      const service = getDidKeyService();
      const { did } = await service.createDidKey();
      const data = 'test message';
      const fakeSignature = 'invalid_signature_base64';

      // Act
      const isValid = await service.verifySignature(did, data, fakeSignature);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should_reject_signature_from_different_key', async () => {
      // Arrange
      const service = getDidKeyService();
      const { keyId: keyId1 } = await service.createDidKey();
      const { did: did2 } = await service.createDidKey();
      const data = 'test message';

      // Act
      const signature = await service.sign(keyId1, data);
      const isValid = await service.verifySignature(did2, data, signature);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('portability', () => {
    it('should_verify_signature_offline_without_network_call', async () => {
      // Arrange
      const service = getDidKeyService();
      const { did, keyId } = await service.createDidKey();
      const data = 'offline verification test';
      const signature = await service.sign(keyId, data);

      // Simulate exporting the DID (just the string)
      const exportedDid = did;

      // Create a NEW service instance (simulating different machine)
      resetDidKeyService();
      const newService = getDidKeyService();

      // Act - verify using ONLY the did:key string (no network, no DB)
      const isValid = await newService.verifySignatureOffline(exportedDid, data, signature);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should_resolve_public_key_from_did_string_without_network', async () => {
      // Arrange
      const service = getDidKeyService();
      const { did } = await service.createDidKey();

      // Create a NEW service instance
      resetDidKeyService();
      const newService = getDidKeyService();

      // Act - extract public key from did:key string alone
      const publicKey = await newService.extractPublicKey(did);

      // Assert
      expect(publicKey).toBeDefined();
      expect(publicKey?.kty).toBeTruthy();
    });
  });

  describe('exportKey', () => {
    it('should_export_private_key_for_portability', async () => {
      // Arrange
      const service = getDidKeyService();
      const { keyId } = await service.createDidKey();

      // Act
      const exportedKey = await service.exportPrivateKey(keyId);

      // Assert
      expect(exportedKey).toBeDefined();
      expect(exportedKey?.kty).toBeTruthy();
      expect(exportedKey?.d).toBeTruthy(); // Private key component
    });

    it('should_allow_signing_with_imported_private_key', async () => {
      // Arrange
      const service = getDidKeyService();
      const { did, keyId } = await service.createDidKey();
      const exportedKey = await service.exportPrivateKey(keyId);

      // Create new service instance
      resetDidKeyService();
      const newService = getDidKeyService();

      // Import the key
      const importedKeyId = await newService.importPrivateKey(exportedKey!);

      // Act - sign with imported key
      const data = 'signed with imported key';
      const signature = await newService.sign(importedKeyId, data);

      // Verify with original DID
      const isValid = await newService.verifySignatureOffline(did, data, signature);

      // Assert
      expect(isValid).toBe(true);
    });
  });
});
