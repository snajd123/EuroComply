import { gzipSync, gunzipSync } from 'zlib';

/**
 * Status List 2021 Bitstring Utilities
 *
 * Implements W3C Status List 2021 specification for credential revocation.
 * The bitstring is a fixed-size array where each bit represents the revocation
 * status of a credential at that index.
 *
 * - Bit = 0: Credential is valid (not revoked)
 * - Bit = 1: Credential is revoked
 *
 * The bitstring is GZIP compressed and base64url encoded for transport.
 */

/** Size of the bitstring in bits (16KB = 131072 bits) */
export const BITSTRING_SIZE = 131072;

/** Size of the bitstring in bytes */
export const BITSTRING_BYTES = BITSTRING_SIZE / 8;

/**
 * Create a new empty bitstring with all bits set to 0.
 */
export function createBitstring(): Uint8Array {
  return new Uint8Array(BITSTRING_BYTES);
}

/**
 * Set a bit at the given index to 1 (revoked).
 * @param bitstring The bitstring to modify
 * @param index The credential index to revoke (0 to BITSTRING_SIZE - 1)
 */
export function setBit(bitstring: Uint8Array, index: number): void {
  if (index < 0 || index >= BITSTRING_SIZE) {
    throw new Error(`Index out of bounds: ${index}`);
  }

  const byteIndex = Math.floor(index / 8);
  const bitIndex = 7 - (index % 8); // MSB first per spec
  bitstring[byteIndex] = (bitstring[byteIndex] ?? 0) | (1 << bitIndex);
}

/**
 * Clear a bit at the given index to 0 (unrevoked).
 * Note: Per W3C spec, revocation is typically one-way, but this is provided
 * for completeness.
 * @param bitstring The bitstring to modify
 * @param index The credential index to unrevoke
 */
export function clearBit(bitstring: Uint8Array, index: number): void {
  if (index < 0 || index >= BITSTRING_SIZE) {
    throw new Error(`Index out of bounds: ${index}`);
  }

  const byteIndex = Math.floor(index / 8);
  const bitIndex = 7 - (index % 8);
  bitstring[byteIndex] = (bitstring[byteIndex] ?? 0) & ~(1 << bitIndex);
}

/**
 * Get the value of a bit at the given index.
 * @param bitstring The bitstring to read
 * @param index The credential index to check
 * @returns true if revoked (bit = 1), false if valid (bit = 0)
 */
export function getBit(bitstring: Uint8Array, index: number): boolean {
  if (index < 0 || index >= BITSTRING_SIZE) {
    throw new Error(`Index out of bounds: ${index}`);
  }

  const byteIndex = Math.floor(index / 8);
  const bitIndex = 7 - (index % 8);
  return ((bitstring[byteIndex] ?? 0) & (1 << bitIndex)) !== 0;
}

/**
 * Encode a bitstring to base64url GZIP compressed format.
 * This is the format used in Status List 2021 credentials.
 * @param bitstring The bitstring to encode
 * @returns Base64url encoded GZIP compressed string
 */
export function encodeBitstring(bitstring: Uint8Array): string {
  // GZIP compress
  const compressed = gzipSync(Buffer.from(bitstring));

  // Convert to base64url (no padding)
  return compressed
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode a base64url GZIP compressed string back to a bitstring.
 * @param encoded The encoded string from a Status List 2021 credential
 * @returns The decoded bitstring
 */
export function decodeBitstring(encoded: string): Uint8Array {
  // Convert from base64url to base64
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

  // Decode base64
  const compressed = Buffer.from(padded, 'base64');

  // GZIP decompress
  const decompressed = gunzipSync(compressed);

  return new Uint8Array(decompressed);
}

/**
 * Count the number of revoked credentials in a bitstring.
 * @param bitstring The bitstring to count
 * @returns Number of bits set to 1
 */
export function countRevoked(bitstring: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < bitstring.length; i++) {
    // Count bits using Brian Kernighan's algorithm
    let byte = bitstring[i] ?? 0;
    while (byte) {
      count++;
      byte &= byte - 1;
    }
  }
  return count;
}

/**
 * Get the next available index in the bitstring.
 * This finds the first unset bit (first available credential slot).
 * @param bitstring The bitstring to search
 * @returns The next available index, or -1 if full
 */
export function getNextAvailableIndex(bitstring: Uint8Array): number {
  for (let i = 0; i < BITSTRING_SIZE; i++) {
    if (!getBit(bitstring, i)) {
      return i;
    }
  }
  return -1;
}
