import { describe, it, expect } from 'vitest';
import {
  createBitstring,
  setBit,
  getBit,
  encodeBitstring,
  decodeBitstring,
  BITSTRING_SIZE,
} from './status-list-bitstring.js';

describe('Status List 2021 Bitstring', () => {
  describe('createBitstring', () => {
    it('should create a bitstring of correct size', () => {
      const bitstring = createBitstring();
      // 16KB = 16384 bytes = 131072 bits
      expect(bitstring.length).toBe(BITSTRING_SIZE / 8);
    });

    it('should initialize all bits to 0', () => {
      const bitstring = createBitstring();
      for (let i = 0; i < bitstring.length; i++) {
        expect(bitstring[i]).toBe(0);
      }
    });
  });

  describe('setBit', () => {
    it('should set a bit at index 0', () => {
      const bitstring = createBitstring();
      setBit(bitstring, 0);
      expect(getBit(bitstring, 0)).toBe(true);
    });

    it('should set a bit at arbitrary index', () => {
      const bitstring = createBitstring();
      setBit(bitstring, 1000);
      expect(getBit(bitstring, 1000)).toBe(true);
      expect(getBit(bitstring, 999)).toBe(false);
      expect(getBit(bitstring, 1001)).toBe(false);
    });

    it('should set multiple bits', () => {
      const bitstring = createBitstring();
      setBit(bitstring, 0);
      setBit(bitstring, 7);
      setBit(bitstring, 8);
      setBit(bitstring, 100);

      expect(getBit(bitstring, 0)).toBe(true);
      expect(getBit(bitstring, 7)).toBe(true);
      expect(getBit(bitstring, 8)).toBe(true);
      expect(getBit(bitstring, 100)).toBe(true);
      expect(getBit(bitstring, 1)).toBe(false);
    });

    it('should throw for negative index', () => {
      const bitstring = createBitstring();
      expect(() => setBit(bitstring, -1)).toThrow('Index out of bounds');
    });

    it('should throw for index exceeding size', () => {
      const bitstring = createBitstring();
      expect(() => setBit(bitstring, BITSTRING_SIZE)).toThrow('Index out of bounds');
    });
  });

  describe('getBit', () => {
    it('should return false for unset bits', () => {
      const bitstring = createBitstring();
      expect(getBit(bitstring, 0)).toBe(false);
      expect(getBit(bitstring, 50000)).toBe(false);
    });

    it('should throw for out of bounds index', () => {
      const bitstring = createBitstring();
      expect(() => getBit(bitstring, BITSTRING_SIZE)).toThrow('Index out of bounds');
    });
  });

  describe('encodeBitstring', () => {
    it('should encode to base64url GZIP compressed string', () => {
      const bitstring = createBitstring();
      const encoded = encodeBitstring(bitstring);

      // Should be a valid base64url string (no +, /, or = padding in middle)
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should produce shorter output due to compression', () => {
      const bitstring = createBitstring();
      const encoded = encodeBitstring(bitstring);

      // Original 16KB should compress well (all zeros)
      // Base64 of uncompressed would be ~22KB, compressed should be much smaller
      expect(encoded.length).toBeLessThan(1000);
    });
  });

  describe('decodeBitstring', () => {
    it('should decode back to original bitstring', () => {
      const original = createBitstring();
      setBit(original, 0);
      setBit(original, 100);
      setBit(original, 50000);

      const encoded = encodeBitstring(original);
      const decoded = decodeBitstring(encoded);

      expect(decoded.length).toBe(original.length);
      expect(getBit(decoded, 0)).toBe(true);
      expect(getBit(decoded, 100)).toBe(true);
      expect(getBit(decoded, 50000)).toBe(true);
      expect(getBit(decoded, 1)).toBe(false);
    });

    it('should throw for invalid base64url', () => {
      expect(() => decodeBitstring('!!!invalid!!!')).toThrow();
    });
  });

  describe('round-trip encoding', () => {
    it('should preserve all set bits through encode/decode', () => {
      const original = createBitstring();
      const indices = [0, 1, 7, 8, 255, 1000, 10000, 100000, 131071];

      for (const idx of indices) {
        setBit(original, idx);
      }

      const encoded = encodeBitstring(original);
      const decoded = decodeBitstring(encoded);

      for (const idx of indices) {
        expect(getBit(decoded, idx)).toBe(true);
      }

      // Verify some unset bits
      expect(getBit(decoded, 2)).toBe(false);
      expect(getBit(decoded, 50000)).toBe(false);
    });
  });
});
