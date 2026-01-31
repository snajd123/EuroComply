// packages/gsr/src/services/CryptoService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoService } from './CryptoService.js';

describe('CryptoService', () => {
  let crypto: CryptoService;

  beforeEach(() => {
    // Use test key (32 bytes for AES-256)
    const testKey = 'a'.repeat(64); // 32 bytes in hex
    crypto = new CryptoService(testKey);
  });

  describe('encrypt/decrypt', () => {
    it('should_encrypt_and_decrypt_CAS_number', () => {
      const cas = '1309-60-0';
      const encrypted = crypto.encrypt(cas);

      expect(encrypted).not.toBe(cas);
      expect(encrypted).toContain(':'); // iv:authTag:ciphertext format

      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe(cas);
    });

    it('should_produce_different_ciphertext_for_same_input_when_random_IV_used', () => {
      const cas = '1309-60-0';
      const encrypted1 = crypto.encrypt(cas);
      const encrypted2 = crypto.encrypt(cas);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should_throw_when_ciphertext_is_tampered', () => {
      const cas = '1309-60-0';
      const encrypted = crypto.encrypt(cas);
      const tampered = encrypted.slice(0, -2) + 'XX';

      expect(() => crypto.decrypt(tampered)).toThrow();
    });

    it('should_throw_when_format_is_invalid', () => {
      expect(() => crypto.decrypt('not:valid:format:here')).toThrow();
      expect(() => crypto.decrypt('invalid')).toThrow();
    });
  });

  describe('isEncrypted', () => {
    it('should_return_true_when_string_is_encrypted', () => {
      const encrypted = crypto.encrypt('1309-60-0');
      expect(crypto.isEncrypted(encrypted)).toBe(true);
    });

    it('should_return_false_when_string_is_plaintext', () => {
      expect(crypto.isEncrypted('1309-60-0')).toBe(false);
      expect(crypto.isEncrypted('not-encrypted')).toBe(false);
    });
  });

  describe('constructor', () => {
    it('should_throw_when_key_is_not_64_hex_characters', () => {
      expect(() => new CryptoService('short')).toThrow('Encryption key must be 64 hex characters (32 bytes)');
      expect(() => new CryptoService('a'.repeat(63))).toThrow('Encryption key must be 64 hex characters (32 bytes)');
      expect(() => new CryptoService('a'.repeat(65))).toThrow('Encryption key must be 64 hex characters (32 bytes)');
    });
  });
});
