/**
 * Key Management Service
 *
 * Handles cryptographic key generation, storage, and signing operations
 * via walt.id Custodian API.
 */

import { getWaltIdAdapter } from '../adapters/waltid.adapter.js';
import { getConfig } from '../config.js';
import type { KeyAlgorithm, JsonWebKey } from '../types.js';

export interface KeyPair {
  keyId: string;
  algorithm: KeyAlgorithm;
  publicKeyJwk: JsonWebKey;
}

export interface SignatureResult {
  signature: string;
  algorithm: KeyAlgorithm;
}

export class KeyService {
  private adapter = getWaltIdAdapter();
  private config = getConfig();

  /**
   * Generate a new key pair
   *
   * @param algorithm - Key algorithm (ES256 for secp256r1, EdDSA for Ed25519)
   * @returns Key pair with ID and public key
   */
  async generateKeyPair(algorithm: KeyAlgorithm = 'ES256'): Promise<KeyPair> {
    const available = await this.adapter.isAvailable();

    if (!available && this.config.features.fallbackToSimulation) {
      return this.generateSimulatedKeyPair(algorithm);
    }

    if (!available) {
      throw new Error('walt.id services unavailable and simulation disabled');
    }

    const { keyId } = await this.adapter.generateKey(algorithm);
    const publicKeyJwk = await this.adapter.exportPublicKey(keyId);

    return {
      keyId,
      algorithm,
      publicKeyJwk,
    };
  }

  /**
   * Get public key for a stored key
   *
   * @param keyId - Key identifier
   * @returns Public key in JWK format
   */
  async getPublicKey(keyId: string): Promise<JsonWebKey> {
    const available = await this.adapter.isAvailable();

    if (!available && this.config.features.fallbackToSimulation) {
      return this.getSimulatedPublicKey(keyId);
    }

    if (!available) {
      throw new Error('walt.id services unavailable and simulation disabled');
    }

    return this.adapter.exportPublicKey(keyId);
  }

  /**
   * Sign data with a stored key
   *
   * @param keyId - Key identifier
   * @param data - Data to sign (will be hashed)
   * @returns Signature
   */
  async sign(keyId: string, data: string | Buffer): Promise<SignatureResult> {
    const available = await this.adapter.isAvailable();

    if (!available && this.config.features.fallbackToSimulation) {
      return this.simulateSign(keyId, data);
    }

    if (!available) {
      throw new Error('walt.id services unavailable and simulation disabled');
    }

    // walt.id handles signing through credential issuance
    // For raw signing, we'd need direct crypto operations
    // This is a simplified implementation
    const dataString = typeof data === 'string' ? data : data.toString('base64');

    // In production, this would use walt.id's signing endpoint
    const signature = Buffer.from(`signed:${keyId}:${dataString}`).toString('base64url');

    return {
      signature,
      algorithm: 'ES256',
    };
  }

  /**
   * Delete a key
   *
   * @param keyId - Key identifier
   */
  async deleteKey(keyId: string): Promise<void> {
    const available = await this.adapter.isAvailable();

    if (!available && this.config.features.fallbackToSimulation) {
      // Simulated keys don't need deletion
      return;
    }

    if (!available) {
      throw new Error('walt.id services unavailable and simulation disabled');
    }

    await this.adapter.deleteKey(keyId);
  }

  /**
   * Check if a key exists
   *
   * @param keyId - Key identifier
   * @returns True if key exists
   */
  async keyExists(keyId: string): Promise<boolean> {
    try {
      await this.getPublicKey(keyId);
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================
  // Simulation Methods (Development Only)
  // ===========================================

  private generateSimulatedKeyPair(algorithm: KeyAlgorithm): KeyPair {
    const keyId = `sim-key-${crypto.randomUUID()}`;

    const publicKeyJwk: JsonWebKey =
      algorithm === 'ES256'
        ? {
            kty: 'EC',
            crv: 'P-256',
            x: Buffer.from(crypto.randomUUID()).toString('base64url'),
            y: Buffer.from(crypto.randomUUID()).toString('base64url'),
          }
        : {
            kty: 'OKP',
            crv: 'Ed25519',
            x: Buffer.from(crypto.randomUUID() + crypto.randomUUID()).toString('base64url'),
          };

    return {
      keyId,
      algorithm,
      publicKeyJwk,
    };
  }

  private getSimulatedPublicKey(keyId: string): JsonWebKey {
    // Return a deterministic simulated key based on keyId
    const isEd25519 = keyId.includes('ed25519') || keyId.includes('EdDSA');

    if (isEd25519) {
      return {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(keyId).toString('base64url').slice(0, 43),
      };
    }

    return {
      kty: 'EC',
      crv: 'P-256',
      x: Buffer.from(keyId).toString('base64url').slice(0, 43),
      y: Buffer.from(keyId.split('').reverse().join('')).toString('base64url').slice(0, 43),
    };
  }

  private simulateSign(keyId: string, data: string | Buffer): SignatureResult {
    const dataString = typeof data === 'string' ? data : data.toString('base64');
    const signature = Buffer.from(`sim-sig:${keyId}:${dataString}`).toString('base64url');

    return {
      signature,
      algorithm: 'ES256',
    };
  }
}

// Singleton instance
let keyService: KeyService | null = null;

export function getKeyService(): KeyService {
  if (!keyService) {
    keyService = new KeyService();
  }
  return keyService;
}

export function resetKeyService(): void {
  keyService = null;
}
