// packages/gsr/src/utils/cas-sanitizer.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeCas, isValidCasChecksum, formatCasNumber } from './cas-sanitizer.js';

describe('cas-sanitizer', () => {
  describe('isValidCasChecksum', () => {
    it('should return true for valid CAS numbers', () => {
      expect(isValidCasChecksum('1309-60-0')).toBe(true);  // Lead dioxide
      expect(isValidCasChecksum('50-00-0')).toBe(true);    // Formaldehyde
      expect(isValidCasChecksum('7440-43-9')).toBe(true);  // Cadmium
      expect(isValidCasChecksum('7732-18-5')).toBe(true);  // Water
      expect(isValidCasChecksum('127-19-5')).toBe(true);   // DMAC
    });

    it('should return false for invalid checksums', () => {
      expect(isValidCasChecksum('1309-60-1')).toBe(false); // Wrong check digit
      expect(isValidCasChecksum('7732-18-6')).toBe(false); // Wrong check digit
      expect(isValidCasChecksum('12345-67-8')).toBe(false); // Invalid
    });

    it('should return false for invalid format', () => {
      expect(isValidCasChecksum('')).toBe(false);
      expect(isValidCasChecksum('invalid')).toBe(false);
      expect(isValidCasChecksum('123456789012')).toBe(false); // Too long
      expect(isValidCasChecksum('12-3-4')).toBe(false); // Segments too short
    });

    it('should return false for null/undefined', () => {
      expect(isValidCasChecksum(null as unknown as string)).toBe(false);
      expect(isValidCasChecksum(undefined as unknown as string)).toBe(false);
    });
  });

  describe('formatCasNumber', () => {
    it('should format unformatted CAS numbers', () => {
      expect(formatCasNumber('1309600')).toBe('1309-60-0');
      expect(formatCasNumber('50000')).toBe('50-00-0');
      expect(formatCasNumber('7440439')).toBe('7440-43-9');
    });

    it('should return already formatted CAS numbers', () => {
      expect(formatCasNumber('1309-60-0')).toBe('1309-60-0');
    });

    it('should return null for invalid length', () => {
      expect(formatCasNumber('1234')).toBeNull();  // Too short
      expect(formatCasNumber('12345678901')).toBeNull(); // Too long
    });

    it('should return null for non-numeric input', () => {
      expect(formatCasNumber('abc')).toBeNull();
    });
  });

  describe('sanitizeCas', () => {
    it('should clean and validate CAS with spaces', () => {
      expect(sanitizeCas('1309- 60 -0')).toBe('1309-60-0');
      expect(sanitizeCas('  1309-60-0  ')).toBe('1309-60-0');
    });

    it('should clean CAS with prefix', () => {
      expect(sanitizeCas('CAS: 1309-60-0')).toBe('1309-60-0');
      expect(sanitizeCas('CAS 1309-60-0')).toBe('1309-60-0');
      expect(sanitizeCas('CAS#1309-60-0')).toBe('1309-60-0');
    });

    it('should format unformatted CAS and validate', () => {
      expect(sanitizeCas('1309600')).toBe('1309-60-0');
    });

    it('should return null for N/A values', () => {
      expect(sanitizeCas('N/A')).toBeNull();
      expect(sanitizeCas('n/a')).toBeNull();
      expect(sanitizeCas('-')).toBeNull();
      expect(sanitizeCas('not available')).toBeNull();
      expect(sanitizeCas('')).toBeNull();
    });

    it('should return null for invalid checksum after cleaning', () => {
      expect(sanitizeCas('1309-60-1')).toBeNull(); // Invalid checksum
    });

    it('should handle proprietary markers', () => {
      expect(sanitizeCas('Proprietary')).toBeNull();
      expect(sanitizeCas('PROPRIETARY')).toBeNull();
      expect(sanitizeCas('Trade Secret')).toBeNull();
    });
  });
});
