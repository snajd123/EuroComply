/**
 * GS1 Digital Link Service
 *
 * Handles generation and parsing of GS1 Digital Links for product identification.
 * GS1 Digital Links are the standard way to encode product identifiers (GTINs) in URLs.
 *
 * Format: https://id.gs1.org/01/{gtin}
 * Extended: https://id.gs1.org/01/{gtin}/10/{lot}/21/{serial}
 */

const GS1_RESOLVER_BASE = process.env.GS1_RESOLVER_BASE || 'https://id.gs1.org';

// Application Identifiers (AIs)
const AI = {
  GTIN: '01',
  LOT_NUMBER: '10',
  SERIAL_NUMBER: '21',
  PRODUCTION_DATE: '11',
  EXPIRATION_DATE: '17',
} as const;

export interface Gs1LinkOptions {
  gtin: string;
  lotNumber?: string;
  serialNumber?: string;
  productionDate?: string; // YYMMDD format
  expirationDate?: string; // YYMMDD format
}

export interface ParsedGs1Link {
  gtin?: string;
  lotNumber?: string;
  serialNumber?: string;
  productionDate?: string;
  expirationDate?: string;
}

export const gs1Service = {
  /**
   * Generate a GS1 Digital Link URL
   */
  generateDigitalLink(gtinOrOptions: string | Gs1LinkOptions): string {
    if (typeof gtinOrOptions === 'string') {
      const gtin = normalizeGtin(gtinOrOptions);
      return `${GS1_RESOLVER_BASE}/${AI.GTIN}/${gtin}`;
    }

    const options = gtinOrOptions;
    const gtin = normalizeGtin(options.gtin);
    let url = `${GS1_RESOLVER_BASE}/${AI.GTIN}/${gtin}`;

    if (options.lotNumber) {
      url += `/${AI.LOT_NUMBER}/${encodeURIComponent(options.lotNumber)}`;
    }

    if (options.serialNumber) {
      url += `/${AI.SERIAL_NUMBER}/${encodeURIComponent(options.serialNumber)}`;
    }

    return url;
  },

  /**
   * Parse a GS1 Digital Link URL
   */
  parseDigitalLink(url: string): ParsedGs1Link {
    const result: ParsedGs1Link = {};

    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      for (let i = 0; i < pathParts.length - 1; i += 2) {
        const ai = pathParts[i];
        const value = decodeURIComponent(pathParts[i + 1] || '');

        switch (ai) {
          case AI.GTIN:
            result.gtin = value;
            break;
          case AI.LOT_NUMBER:
            result.lotNumber = value;
            break;
          case AI.SERIAL_NUMBER:
            result.serialNumber = value;
            break;
          case AI.PRODUCTION_DATE:
            result.productionDate = value;
            break;
          case AI.EXPIRATION_DATE:
            result.expirationDate = value;
            break;
        }
      }
    } catch {
      // Invalid URL, return empty result
    }

    return result;
  },

  /**
   * Validate a GTIN (EAN-13/14 or UPC-A)
   */
  validateGtin(gtin: string): { valid: boolean; error?: string } {
    const normalized = gtin.replace(/\D/g, '');

    if (![8, 12, 13, 14].includes(normalized.length)) {
      return {
        valid: false,
        error: 'GTIN must be 8, 12, 13, or 14 digits',
      };
    }

    // Validate check digit
    if (!validateCheckDigit(normalized)) {
      return {
        valid: false,
        error: 'Invalid check digit',
      };
    }

    return { valid: true };
  },

  /**
   * Generate a QR code payload for a DPP
   * This creates a URL that resolves to the product passport
   */
  generateDppQrPayload(passportId: string, baseUrl?: string): string {
    const base = baseUrl || process.env.API_URL || 'https://api.eurocomply.io';
    return `${base}/v1/passports/${passportId}/verify`;
  },
};

/**
 * Normalize GTIN to 14 digits (GTIN-14)
 */
function normalizeGtin(gtin: string): string {
  const digits = gtin.replace(/\D/g, '');
  return digits.padStart(14, '0');
}

/**
 * Validate GTIN check digit using GS1 algorithm
 */
function validateCheckDigit(gtin: string): boolean {
  const digits = gtin.split('').map(Number);
  const checkDigit = digits.pop();

  if (checkDigit === undefined) return false;

  // Calculate check digit
  let sum = 0;
  const multipliers = digits.length % 2 === 0 ? [1, 3] : [3, 1];

  for (let i = 0; i < digits.length; i++) {
    sum += (digits[i] ?? 0) * (multipliers[i % 2] ?? 1);
  }

  const calculatedCheck = (10 - (sum % 10)) % 10;
  return calculatedCheck === checkDigit;
}

export default gs1Service;
