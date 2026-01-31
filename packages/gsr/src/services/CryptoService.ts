// packages/gsr/src/services/CryptoService.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts/decrypts sensitive data using AES-256-GCM.
 * Format: base64(iv):base64(authTag):base64(ciphertext)
 */
export class CryptoService {
  private key: Buffer;

  constructor(hexKey: string) {
    if (hexKey.length !== 64) {
      throw new Error('Encryption key must be 64 hex characters (32 bytes)');
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  /**
   * Encrypt plaintext using AES-256-GCM.
   * Returns format: iv:authTag:ciphertext (all base64)
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypt ciphertext.
   * @throws Error if decryption fails (tampered or invalid)
   */
  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }

    // We've verified length === 3, so these are guaranteed to exist
    const ivB64 = parts[0] as string;
    const authTagB64 = parts[1] as string;
    const ciphertext = parts[2] as string;

    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Invalid IV or auth tag length');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Check if a string appears to be encrypted (matches our format).
   */
  isEncrypted(value: string): boolean {
    const parts = value.split(':');
    if (parts.length !== 3) return false;

    try {
      const iv = Buffer.from(parts[0] as string, 'base64');
      const authTag = Buffer.from(parts[1] as string, 'base64');
      return iv.length === IV_LENGTH && authTag.length === AUTH_TAG_LENGTH;
    } catch {
      return false;
    }
  }
}

/**
 * Factory to create CryptoService from environment variable.
 */
export function createCryptoService(): CryptoService {
  const key = process.env['GSR_ENCRYPTION_KEY'];
  if (!key) {
    throw new Error('GSR_ENCRYPTION_KEY environment variable is required');
  }
  return new CryptoService(key);
}
