import { describe, it, expect } from 'vitest';
import { isValidCasNumber, formatCasNumber, parseCasNumber } from './cas-validator.js';

describe('CAS Number Validation', () => {
  describe('isValidCasNumber', () => {
    it('should validate correct CAS numbers', () => {
      // Well-known CAS numbers
      expect(isValidCasNumber('7732-18-5')).toBe(true);   // Water
      expect(isValidCasNumber('64-17-5')).toBe(true);     // Ethanol
      expect(isValidCasNumber('127-19-5')).toBe(true);    // DMAC (SVHC)
      expect(isValidCasNumber('7439-92-1')).toBe(true);   // Lead
      expect(isValidCasNumber('50-00-0')).toBe(true);     // Formaldehyde
      expect(isValidCasNumber('7440-02-0')).toBe(true);   // Nickel
      expect(isValidCasNumber('111-76-2')).toBe(true);    // 2-Butoxyethanol
    });

    it('should reject invalid check digits', () => {
      expect(isValidCasNumber('7732-18-6')).toBe(false);  // Wrong check digit
      expect(isValidCasNumber('64-17-6')).toBe(false);    // Wrong check digit
      expect(isValidCasNumber('127-19-6')).toBe(false);   // Wrong check digit
    });

    it('should reject malformed formats', () => {
      expect(isValidCasNumber('773218-5')).toBe(false);   // Missing hyphen
      expect(isValidCasNumber('7732-185')).toBe(false);   // Missing hyphen
      expect(isValidCasNumber('7732-1-5')).toBe(false);   // Wrong middle section
      expect(isValidCasNumber('7732-18-55')).toBe(false); // Wrong check digit length
      expect(isValidCasNumber('')).toBe(false);           // Empty
      expect(isValidCasNumber('abc-de-f')).toBe(false);   // Non-numeric
    });

    it('should reject numbers outside valid range', () => {
      expect(isValidCasNumber('1-23-4')).toBe(false);     // First section too short
      expect(isValidCasNumber('12345678-90-1')).toBe(false); // First section too long
    });
  });

  describe('formatCasNumber', () => {
    it('should format CAS numbers correctly', () => {
      expect(formatCasNumber('7732185')).toBe('7732-18-5');
      expect(formatCasNumber('64175')).toBe('64-17-5');    // Ethanol
      expect(formatCasNumber('127195')).toBe('127-19-5');
    });

    it('should return null for inputs that produce invalid CAS', () => {
      expect(formatCasNumber('1234567')).toBe(null);  // Invalid checksum
    });

    it('should pass through already formatted numbers', () => {
      expect(formatCasNumber('7732-18-5')).toBe('7732-18-5');
    });

    it('should return null for invalid input', () => {
      expect(formatCasNumber('invalid')).toBe(null);
      expect(formatCasNumber('')).toBe(null);
    });
  });

  describe('parseCasNumber', () => {
    it('should parse CAS number components', () => {
      const parsed = parseCasNumber('7732-18-5');
      expect(parsed).toEqual({
        firstPart: '7732',
        secondPart: '18',
        checkDigit: '5',
      });
    });

    it('should return null for invalid format', () => {
      expect(parseCasNumber('invalid')).toBe(null);
    });
  });
});
