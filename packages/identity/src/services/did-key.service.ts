/**
 * did:key Service
 *
 * Implements the did:key method for self-contained, portable DIDs.
 * Key features:
 * - No network resolution needed (public key embedded in DID)
 * - Offline verification support
 * - Key export/import for data sovereignty
 *
 * Supported algorithms:
 * - EdDSA (Ed25519): did:key:z6Mk...
 * - ES256 (P-256): did:key:zDn...
 */

import { webcrypto } from 'crypto';
import type { DidDocument, JsonWebKey, KeyAlgorithm } from '../types.js';

const crypto = webcrypto as unknown as Crypto;

// Multicodec prefixes for did:key encoding (as unsigned varints)
// See: https://github.com/multiformats/multicodec/blob/master/table.csv
// Varint encoding: values >= 128 need multi-byte encoding
const MULTICODEC = {
  ED25519_PUB: new Uint8Array([0xed, 0x01]), // ed25519-pub: 0xed (237) as varint
  P256_PUB: new Uint8Array([0x80, 0x24]), // p256-pub: 0x1200 (4608) as varint - produces 'zDn' prefix
} as const;

// Base58btc alphabet
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export interface DidKeyCreationOptions {
  algorithm?: 'EdDSA' | 'ES256';
}

export interface DidKeyCreationResult {
  did: string;
  keyId: string;
  didDocument: DidDocument;
}

interface StoredKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
  algorithm: 'EdDSA' | 'ES256';
  did: string;
}

export class DidKeyService {
  private keyStore: Map<string, StoredKeyPair> = new Map();

  /**
   * Create a new did:key
   */
  async createDidKey(options: DidKeyCreationOptions = {}): Promise<DidKeyCreationResult> {
    const algorithm = options.algorithm || 'EdDSA';

    const keyPair = await this.generateKeyPair(algorithm);
    const publicKeyBytes = await this.exportPublicKeyRaw(keyPair.publicKey, algorithm);
    const did = this.encodeDid(publicKeyBytes, algorithm);
    const keyId = `${did}#key-1`;

    const publicKeyJwk = await this.exportPublicKeyJwk(keyPair.publicKey, algorithm);

    // Store the key pair
    this.keyStore.set(keyId, {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      publicKeyJwk,
      algorithm,
      did,
    });

    const didDocument = this.buildDidDocument(did, publicKeyJwk);

    return {
      did,
      keyId,
      didDocument,
    };
  }

  /**
   * Resolve a did:key to its DID document
   * Works offline - public key is extracted from the DID string
   */
  async resolveDidKey(did: string): Promise<DidDocument | null> {
    if (!did.startsWith('did:key:z')) {
      return null;
    }

    try {
      const publicKeyJwk = await this.extractPublicKey(did);
      if (!publicKeyJwk) {
        return null;
      }

      return this.buildDidDocument(did, publicKeyJwk);
    } catch {
      return null;
    }
  }

  /**
   * Extract public key from did:key string
   * This is the key portability feature - works offline!
   */
  async extractPublicKey(did: string): Promise<JsonWebKey | null> {
    if (!did.startsWith('did:key:z')) {
      return null;
    }

    try {
      const multibaseValue = did.slice('did:key:'.length);
      const bytes = this.base58Decode(multibaseValue.slice(1)); // Remove 'z' prefix

      // Check multicodec prefix to determine algorithm
      if (bytes[0] === 0xed && bytes[1] === 0x01) {
        // Ed25519
        const publicKeyBytes = bytes.slice(2);
        return {
          kty: 'OKP',
          crv: 'Ed25519',
          x: this.base64UrlEncode(publicKeyBytes),
        };
      } else if (bytes[0] === 0x80 && bytes[1] === 0x24) {
        // P-256 (multicodec 0x1200 as varint [0x80, 0x24])
        const publicKeyBytes = bytes.slice(2);

        // Handle compressed point format (33 bytes: 0x02/0x03 + x)
        if ((publicKeyBytes[0] === 0x02 || publicKeyBytes[0] === 0x03) && publicKeyBytes.length === 33) {
          const x = publicKeyBytes.slice(1, 33);
          // Decompress the point to get y coordinate
          const y = await this.decompressP256Point(x, publicKeyBytes[0] === 0x03);
          return {
            kty: 'EC',
            crv: 'P-256',
            x: this.base64UrlEncode(x),
            y: this.base64UrlEncode(y),
          };
        }

        // Handle uncompressed point format (65 bytes: 0x04 + x + y)
        if (publicKeyBytes[0] === 0x04 && publicKeyBytes.length === 65) {
          return {
            kty: 'EC',
            crv: 'P-256',
            x: this.base64UrlEncode(publicKeyBytes.slice(1, 33)),
            y: this.base64UrlEncode(publicKeyBytes.slice(33, 65)),
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Sign data with a stored key
   */
  async sign(keyId: string, data: string): Promise<string> {
    const storedKey = this.keyStore.get(keyId);
    if (!storedKey) {
      throw new Error(`Key not found: ${keyId}`);
    }

    const dataBytes = new TextEncoder().encode(data);

    let signature: ArrayBuffer;
    if (storedKey.algorithm === 'EdDSA') {
      signature = await crypto.subtle.sign('Ed25519', storedKey.privateKey, dataBytes);
    } else {
      signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        storedKey.privateKey,
        dataBytes
      );
    }

    return this.base64UrlEncode(new Uint8Array(signature));
  }

  /**
   * Verify signature with a stored key (requires key to be in store)
   */
  async verifySignature(did: string, data: string, signature: string): Promise<boolean> {
    try {
      const publicKeyJwk = await this.extractPublicKey(did);
      if (!publicKeyJwk) {
        return false;
      }

      return this.verifyWithPublicKey(publicKeyJwk, data, signature);
    } catch {
      return false;
    }
  }

  /**
   * Verify signature offline using only the did:key string
   * This is the key sovereignty feature!
   */
  async verifySignatureOffline(did: string, data: string, signature: string): Promise<boolean> {
    return this.verifySignature(did, data, signature);
  }

  /**
   * Export private key for portability
   */
  async exportPrivateKey(keyId: string): Promise<JsonWebKey | null> {
    const storedKey = this.keyStore.get(keyId);
    if (!storedKey) {
      return null;
    }

    const jwk = await crypto.subtle.exportKey('jwk', storedKey.privateKey);
    return jwk as JsonWebKey;
  }

  /**
   * Import a private key
   */
  async importPrivateKey(jwk: JsonWebKey): Promise<string> {
    const algorithm = jwk.crv === 'Ed25519' ? 'EdDSA' : 'ES256';

    let privateKey: CryptoKey;
    let publicKey: CryptoKey;

    // Create public JWK from private (remove 'd' component)
    const publicJwk: JsonWebKey = {
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
    };

    if (algorithm === 'EdDSA') {
      // Import private key for signing
      privateKey = await crypto.subtle.importKey(
        'jwk',
        jwk as JsonWebKeyInput,
        { name: 'Ed25519' },
        true,
        ['sign']
      );

      // Import public key separately for verification
      publicKey = await crypto.subtle.importKey(
        'jwk',
        publicJwk as JsonWebKeyInput,
        { name: 'Ed25519' },
        true,
        ['verify']
      );
    } else {
      // Import private key for signing
      privateKey = await crypto.subtle.importKey(
        'jwk',
        jwk as JsonWebKeyInput,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign']
      );

      // Import public key separately for verification
      publicKey = await crypto.subtle.importKey(
        'jwk',
        publicJwk as JsonWebKeyInput,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['verify']
      );
    }

    const publicKeyBytes = await this.exportPublicKeyRaw(publicKey, algorithm);
    const did = this.encodeDid(publicKeyBytes, algorithm);
    const keyId = `${did}#key-1`;

    this.keyStore.set(keyId, {
      privateKey,
      publicKey,
      publicKeyJwk: publicJwk,
      algorithm,
      did,
    });

    return keyId;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  private async generateKeyPair(
    algorithm: 'EdDSA' | 'ES256'
  ): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }> {
    if (algorithm === 'EdDSA') {
      const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
      return keyPair as { privateKey: CryptoKey; publicKey: CryptoKey };
    } else {
      const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );
      return keyPair as { privateKey: CryptoKey; publicKey: CryptoKey };
    }
  }

  private async exportPublicKeyRaw(
    publicKey: CryptoKey,
    algorithm: 'EdDSA' | 'ES256'
  ): Promise<Uint8Array> {
    if (algorithm === 'EdDSA') {
      const rawKey = await crypto.subtle.exportKey('raw', publicKey);
      return new Uint8Array(rawKey);
    } else {
      // P-256 exports as uncompressed point (65 bytes: 0x04 + x + y)
      // did:key spec uses compressed format (33 bytes: 0x02/0x03 + x)
      const rawKey = await crypto.subtle.exportKey('raw', publicKey);
      const uncompressed = new Uint8Array(rawKey);

      // Compress the point: prefix is 0x02 if y is even, 0x03 if y is odd
      const x = uncompressed.slice(1, 33);
      const y = uncompressed.slice(33, 65);
      const prefix = (y[31] & 1) === 0 ? 0x02 : 0x03;

      const compressed = new Uint8Array(33);
      compressed[0] = prefix;
      compressed.set(x, 1);

      return compressed;
    }
  }

  private async exportPublicKeyJwk(
    publicKey: CryptoKey,
    algorithm: 'EdDSA' | 'ES256'
  ): Promise<JsonWebKey> {
    const jwk = await crypto.subtle.exportKey('jwk', publicKey);
    return jwk as JsonWebKey;
  }

  private encodeDid(publicKeyBytes: Uint8Array, algorithm: 'EdDSA' | 'ES256'): string {
    const prefix = algorithm === 'EdDSA' ? MULTICODEC.ED25519_PUB : MULTICODEC.P256_PUB;

    // Combine prefix and public key
    const combined = new Uint8Array(prefix.length + publicKeyBytes.length);
    combined.set(prefix);
    combined.set(publicKeyBytes, prefix.length);

    // Encode as base58btc with 'z' prefix
    const encoded = this.base58Encode(combined);
    return `did:key:z${encoded}`;
  }

  private buildDidDocument(did: string, publicKeyJwk: JsonWebKey): DidDocument {
    return {
      '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
      id: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk,
        },
      ],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
    };
  }

  private async verifyWithPublicKey(
    publicKeyJwk: JsonWebKey,
    data: string,
    signatureB64: string
  ): Promise<boolean> {
    try {
      const dataBytes = new TextEncoder().encode(data);
      const signatureBytes = this.base64UrlDecode(signatureB64);

      let publicKey: CryptoKey;
      let algorithm: AlgorithmIdentifier | EcdsaParams;

      if (publicKeyJwk.crv === 'Ed25519') {
        publicKey = await crypto.subtle.importKey(
          'jwk',
          publicKeyJwk as JsonWebKeyInput,
          { name: 'Ed25519' },
          false,
          ['verify']
        );
        algorithm = 'Ed25519';
      } else if (publicKeyJwk.crv === 'P-256') {
        publicKey = await crypto.subtle.importKey(
          'jwk',
          publicKeyJwk as JsonWebKeyInput,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['verify']
        );
        algorithm = { name: 'ECDSA', hash: 'SHA-256' };
      } else {
        return false;
      }

      // Cast to ArrayBuffer to satisfy TypeScript's strict BufferSource types
      // TextEncoder and base64UrlDecode always create regular ArrayBuffers, not SharedArrayBuffers
      return await crypto.subtle.verify(
        algorithm,
        publicKey,
        signatureBytes.buffer.slice(signatureBytes.byteOffset, signatureBytes.byteOffset + signatureBytes.byteLength) as ArrayBuffer,
        dataBytes.buffer.slice(dataBytes.byteOffset, dataBytes.byteOffset + dataBytes.byteLength) as ArrayBuffer
      );
    } catch {
      return false;
    }
  }

  // Base58 encoding/decoding
  private base58Encode(bytes: Uint8Array): string {
    const digits = [0];

    for (const byte of bytes) {
      let carry = byte;
      for (let j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }

    let result = '';

    // Handle leading zeros
    for (const byte of bytes) {
      if (byte === 0) {
        result += BASE58_ALPHABET[0];
      } else {
        break;
      }
    }

    // Convert digits to characters (reverse order)
    for (let i = digits.length - 1; i >= 0; i--) {
      result += BASE58_ALPHABET[digits[i]];
    }

    return result;
  }

  private base58Decode(str: string): Uint8Array {
    const bytes = [0];

    for (const char of str) {
      const value = BASE58_ALPHABET.indexOf(char);
      if (value < 0) {
        throw new Error(`Invalid base58 character: ${char}`);
      }

      let carry = value;
      for (let j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }

    // Handle leading '1's (zeros)
    const leadingZeros = str.match(/^1*/)?.[0].length || 0;
    const result = new Uint8Array(leadingZeros + bytes.length);
    result.set(bytes.reverse(), leadingZeros);

    return result;
  }

  private base64UrlEncode(bytes: Uint8Array): string {
    const base64 = Buffer.from(bytes).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private base64UrlDecode(str: string): Uint8Array {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }

  /**
   * Decompress a P-256 point from x coordinate
   * Uses the curve equation: y² = x³ - 3x + b (mod p)
   */
  private async decompressP256Point(x: Uint8Array, isOdd: boolean): Promise<Uint8Array> {
    // P-256 curve parameters
    const p = BigInt('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF');
    const b = BigInt('0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B');
    const three = BigInt(3);

    // Convert x to BigInt
    const xBigInt = this.bytesToBigInt(x);

    // Calculate right side of curve equation: x³ - 3x + b (mod p)
    const x3 = this.modPow(xBigInt, BigInt(3), p);
    const threeX = (three * xBigInt) % p;
    let rhs = (x3 - threeX + b) % p;
    if (rhs < BigInt(0)) rhs += p;

    // Calculate y = sqrt(rhs) mod p
    // For P-256, p ≡ 3 (mod 4), so y = rhs^((p+1)/4) mod p
    const exp = (p + BigInt(1)) / BigInt(4);
    let y = this.modPow(rhs, exp, p);

    // Check if we need the other root
    const yIsOdd = (y & BigInt(1)) === BigInt(1);
    if (yIsOdd !== isOdd) {
      y = p - y;
    }

    return this.bigIntToBytes(y, 32);
  }

  private bytesToBigInt(bytes: Uint8Array): bigint {
    let result = BigInt(0);
    for (const byte of bytes) {
      result = (result << BigInt(8)) + BigInt(byte);
    }
    return result;
  }

  private bigIntToBytes(n: bigint, length: number): Uint8Array {
    const result = new Uint8Array(length);
    let remaining = n;
    for (let i = length - 1; i >= 0; i--) {
      result[i] = Number(remaining & BigInt(0xff));
      remaining >>= BigInt(8);
    }
    return result;
  }

  private modPow(base: bigint, exp: bigint, mod: bigint): bigint {
    let result = BigInt(1);
    base = base % mod;
    while (exp > BigInt(0)) {
      if ((exp & BigInt(1)) === BigInt(1)) {
        result = (result * base) % mod;
      }
      exp >>= BigInt(1);
      base = (base * base) % mod;
    }
    return result;
  }
}

// Type for Web Crypto JWK input
type JsonWebKeyInput = globalThis.JsonWebKey;

// Singleton instance
let didKeyService: DidKeyService | null = null;

export function getDidKeyService(): DidKeyService {
  if (!didKeyService) {
    didKeyService = new DidKeyService();
  }
  return didKeyService;
}

export function resetDidKeyService(): void {
  didKeyService = null;
}
