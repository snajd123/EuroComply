/**
 * GS1 Digital Link Service Tests
 * Tests for GTIN validation, Digital Link generation and parsing
 */

import { describe, it, expect } from 'vitest';
import { gs1Service } from './gs1.service.js';

// ===========================================
// GTIN VALIDATION TESTS
// ===========================================

describe('gs1Service.validateGtin', () => {
  describe('Valid GTINs', () => {
    it('should validate a correct GTIN-13 (EAN-13)', () => {
      // Real example: Barilla pasta
      const result = gs1Service.validateGtin('8076800195057');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate a correct GTIN-12 (UPC-A)', () => {
      // 12-digit UPC
      const result = gs1Service.validateGtin('012345678905');
      expect(result.valid).toBe(true);
    });

    it('should validate a correct GTIN-14', () => {
      // 14-digit GTIN (packaging indicator + GTIN-13)
      const result = gs1Service.validateGtin('10614141000415');
      expect(result.valid).toBe(true);
    });

    it('should validate a correct GTIN-8 (EAN-8)', () => {
      // 8-digit short EAN
      const result = gs1Service.validateGtin('96385074');
      expect(result.valid).toBe(true);
    });

    it('should strip non-digit characters and validate', () => {
      // GTIN with dashes/spaces
      const result = gs1Service.validateGtin('807-6800-195057');
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid GTINs', () => {
    it('should reject GTIN with wrong check digit', () => {
      // Last digit should be 7, not 8
      const result = gs1Service.validateGtin('8076800195058');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid check digit');
    });

    it('should reject GTIN with wrong length', () => {
      const result = gs1Service.validateGtin('123456789'); // 9 digits
      expect(result.valid).toBe(false);
      expect(result.error).toBe('GTIN must be 8, 12, 13, or 14 digits');
    });

    it('should reject empty GTIN', () => {
      const result = gs1Service.validateGtin('');
      expect(result.valid).toBe(false);
    });

    it('should reject GTIN that is too short', () => {
      const result = gs1Service.validateGtin('12345');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('GTIN must be 8, 12, 13, or 14 digits');
    });

    it('should reject GTIN that is too long', () => {
      const result = gs1Service.validateGtin('123456789012345'); // 15 digits
      expect(result.valid).toBe(false);
      expect(result.error).toBe('GTIN must be 8, 12, 13, or 14 digits');
    });
  });

  describe('Check Digit Algorithm', () => {
    it('should correctly validate check digit for GTIN-13', () => {
      // The check digit is calculated as: (10 - (sum % 10)) % 10
      // For 807680019505, alternating weights 1,3,1,3...
      const validGtin = '8076800195057';
      const invalidGtin = '8076800195050';

      expect(gs1Service.validateGtin(validGtin).valid).toBe(true);
      expect(gs1Service.validateGtin(invalidGtin).valid).toBe(false);
    });
  });
});

// ===========================================
// DIGITAL LINK GENERATION TESTS
// ===========================================

describe('gs1Service.generateDigitalLink', () => {
  describe('Basic GTIN Links', () => {
    it('should generate a basic Digital Link from GTIN string', () => {
      const url = gs1Service.generateDigitalLink('8076800195057');
      expect(url).toBe('https://id.gs1.org/01/08076800195057');
    });

    it('should pad short GTINs to 14 digits', () => {
      // GTIN-13 should be padded to 14 digits
      const url = gs1Service.generateDigitalLink('8076800195057');
      expect(url).toContain('/01/08076800195057'); // Padded with leading 0
    });

    it('should handle GTIN-8 padding', () => {
      const url = gs1Service.generateDigitalLink('96385074');
      expect(url).toContain('/01/00000096385074'); // Padded to 14 digits
    });
  });

  describe('Extended Digital Links', () => {
    it('should generate link with lot number', () => {
      const url = gs1Service.generateDigitalLink({
        gtin: '8076800195057',
        lotNumber: 'LOT123',
      });
      expect(url).toBe('https://id.gs1.org/01/08076800195057/10/LOT123');
    });

    it('should generate link with serial number', () => {
      const url = gs1Service.generateDigitalLink({
        gtin: '8076800195057',
        serialNumber: 'SN456789',
      });
      expect(url).toBe('https://id.gs1.org/01/08076800195057/21/SN456789');
    });

    it('should generate link with both lot and serial', () => {
      const url = gs1Service.generateDigitalLink({
        gtin: '8076800195057',
        lotNumber: 'LOT123',
        serialNumber: 'SN456',
      });
      expect(url).toBe('https://id.gs1.org/01/08076800195057/10/LOT123/21/SN456');
    });

    it('should URL encode special characters in lot number', () => {
      const url = gs1Service.generateDigitalLink({
        gtin: '8076800195057',
        lotNumber: 'LOT/123&456',
      });
      expect(url).toContain('/10/LOT%2F123%26456');
    });
  });
});

// ===========================================
// DIGITAL LINK PARSING TESTS
// ===========================================

describe('gs1Service.parseDigitalLink', () => {
  describe('Basic Parsing', () => {
    it('should parse GTIN from basic Digital Link', () => {
      const result = gs1Service.parseDigitalLink('https://id.gs1.org/01/08076800195057');
      expect(result.gtin).toBe('08076800195057');
    });

    it('should parse lot number', () => {
      const result = gs1Service.parseDigitalLink('https://id.gs1.org/01/08076800195057/10/LOT123');
      expect(result.gtin).toBe('08076800195057');
      expect(result.lotNumber).toBe('LOT123');
    });

    it('should parse serial number', () => {
      const result = gs1Service.parseDigitalLink('https://id.gs1.org/01/08076800195057/21/SN456');
      expect(result.gtin).toBe('08076800195057');
      expect(result.serialNumber).toBe('SN456');
    });

    it('should parse all components', () => {
      const result = gs1Service.parseDigitalLink(
        'https://id.gs1.org/01/08076800195057/10/LOT123/21/SN456'
      );
      expect(result.gtin).toBe('08076800195057');
      expect(result.lotNumber).toBe('LOT123');
      expect(result.serialNumber).toBe('SN456');
    });
  });

  describe('URL Decoding', () => {
    it('should decode URL-encoded lot number', () => {
      const result = gs1Service.parseDigitalLink(
        'https://id.gs1.org/01/08076800195057/10/LOT%2F123'
      );
      expect(result.lotNumber).toBe('LOT/123');
    });
  });

  describe('Error Handling', () => {
    it('should return empty object for invalid URL', () => {
      const result = gs1Service.parseDigitalLink('not-a-valid-url');
      expect(result).toEqual({});
    });

    it('should handle empty path', () => {
      const result = gs1Service.parseDigitalLink('https://id.gs1.org/');
      expect(result.gtin).toBeUndefined();
    });

    it('should handle URL with no AI codes', () => {
      const result = gs1Service.parseDigitalLink('https://example.com/some/random/path');
      expect(result.gtin).toBeUndefined();
    });
  });

  describe('Round-Trip', () => {
    it('should parse what it generates (basic)', () => {
      const original = '8076800195057';
      const url = gs1Service.generateDigitalLink(original);
      const parsed = gs1Service.parseDigitalLink(url);
      expect(parsed.gtin).toBe('08076800195057');
    });

    it('should parse what it generates (extended)', () => {
      const options = {
        gtin: '8076800195057',
        lotNumber: 'ABC123',
        serialNumber: 'XYZ789',
      };
      const url = gs1Service.generateDigitalLink(options);
      const parsed = gs1Service.parseDigitalLink(url);

      expect(parsed.gtin).toBe('08076800195057');
      expect(parsed.lotNumber).toBe('ABC123');
      expect(parsed.serialNumber).toBe('XYZ789');
    });
  });
});

// ===========================================
// DPP QR PAYLOAD TESTS
// ===========================================

describe('gs1Service.generateDppQrPayload', () => {
  it('should generate verification URL with default base', () => {
    const payload = gs1Service.generateDppQrPayload('pass_abc123');
    expect(payload).toBe('https://api.eurocomply.eu/v1/passports/pass_abc123/verify');
  });

  it('should use custom base URL', () => {
    const payload = gs1Service.generateDppQrPayload('pass_abc123', 'https://custom.example.com');
    expect(payload).toBe('https://custom.example.com/v1/passports/pass_abc123/verify');
  });

  it('should handle various passport ID formats', () => {
    const uuidPayload = gs1Service.generateDppQrPayload('550e8400-e29b-41d4-a716-446655440000');
    expect(uuidPayload).toContain('/550e8400-e29b-41d4-a716-446655440000/verify');

    const prefixedPayload = gs1Service.generateDppQrPayload('dpp_12345');
    expect(prefixedPayload).toContain('/dpp_12345/verify');
  });
});

// ===========================================
// EDGE CASES
// ===========================================

describe('Edge Cases', () => {
  it('should handle GTIN with all zeros (invalid but common error)', () => {
    const result = gs1Service.validateGtin('0000000000000');
    // Check digit for all zeros should be 0
    expect(result.valid).toBe(true);
  });

  it('should handle large GTIN values', () => {
    // Test a large but valid GTIN-14
    // 12345678901234 with correct check digit calculated
    const result = gs1Service.validateGtin('12345678901286');
    expect(result.valid).toBe(true);
  });

  it('should normalize GTIN with leading zeros', () => {
    const url = gs1Service.generateDigitalLink('0012345678905');
    // Should still pad to 14 digits
    expect(url).toContain('/01/00012345678905');
  });
});
