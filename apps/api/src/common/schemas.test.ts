/**
 * Shared Package Schema Tests
 * Tests for DppDataSchema, CredentialRequestSchema, KybRequestSchema
 */

import { describe, it, expect } from 'vitest';
import {
  DppDataSchema,
  CredentialRequestSchema,
  KybRequestSchema,
  ApiKeyScopes,
  SUPPORTED_COUNTRIES,
  SANCTIONS_LISTS,
} from '@eurocomply/shared';

// ===========================================
// DPP DATA SCHEMA TESTS
// ===========================================

describe('DppDataSchema', () => {
  describe('Core Fields', () => {
    it('should accept minimal valid DPP data', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept full DPP data', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        productModel: 'WP-2024',
        gtin: '8076800195057',
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject missing productId', () => {
      const data = {
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject missing manufacturerName', () => {
      const data = {
        productId: 'prod_123',
        productName: 'Widget Pro',
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject missing productName', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('Carbon Footprint', () => {
    it('should accept valid carbon footprint', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        carbonFootprint: {
          value: 5.5,
          unit: 'kgCO2e',
        },
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept carbon footprint with methodology', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        carbonFootprint: {
          value: 5.5,
          unit: 'kgCO2e',
          methodology: 'ISO 14067',
        },
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject carbon footprint without value', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        carbonFootprint: {
          unit: 'kgCO2e',
        },
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('Recyclability', () => {
    it('should accept valid recyclability data', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        recyclability: {
          percentage: 85,
          materials: [
            { name: 'Aluminum', percentage: 60, recyclable: true },
            { name: 'Plastic', percentage: 40, recyclable: false },
          ],
        },
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject recyclability percentage > 100', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        recyclability: {
          percentage: 150,
          materials: [],
        },
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject recyclability percentage < 0', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        recyclability: {
          percentage: -10,
          materials: [],
        },
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('Durability', () => {
    it('should accept valid durability data', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        durability: {
          expectedLifespan: 10,
          unit: 'years',
        },
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('Repairability', () => {
    it('should accept valid repairability data', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        repairability: {
          score: 8.5,
        },
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept repairability with spare parts', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        repairability: {
          score: 8.5,
          repairInstructions: 'See manual page 42',
          spareParts: [
            { name: 'Battery', partNumber: 'BAT-001', availabilityYears: 7 },
            { name: 'Screen', partNumber: 'SCR-002' },
          ],
        },
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject repairability score > 10', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        repairability: {
          score: 15,
        },
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject repairability score < 0', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        repairability: {
          score: -1,
        },
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('Certifications', () => {
    it('should accept valid certifications', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        certifications: [
          {
            name: 'ISO 14001',
            issuer: 'TÜV',
            validUntil: '2025-12-31',
          },
          {
            name: 'CE Mark',
            issuer: 'European Commission',
            documentUrl: 'https://example.com/cert.pdf',
          },
        ],
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid document URL', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        certifications: [
          {
            name: 'ISO 14001',
            issuer: 'TÜV',
            documentUrl: 'not-a-url',
          },
        ],
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('Hazardous Substances', () => {
    it('should accept valid hazardous substances data', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        hazardousSubstances: [
          {
            name: 'Lead',
            casNumber: '7439-92-1',
            concentration: 0.001,
            unit: '%',
          },
        ],
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('Custom Attributes', () => {
    it('should accept custom attributes', () => {
      const data = {
        productId: 'prod_123',
        manufacturerName: 'ACME Corp',
        productName: 'Widget Pro',
        customAttributes: {
          color: 'blue',
          weight: 250,
          dimensions: { width: 10, height: 20, depth: 5 },
        },
      };

      const result = DppDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });
});

// ===========================================
// CREDENTIAL REQUEST SCHEMA TESTS
// ===========================================

describe('CredentialRequestSchema', () => {
  it('should accept valid credential request', () => {
    const data = {
      schemaId: 'employee-badge',
      subjectName: 'John Doe',
      claims: {
        department: 'Engineering',
        role: 'Developer',
      },
    };

    const result = CredentialRequestSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should accept request with all optional fields', () => {
    const data = {
      schemaId: 'employee-badge',
      subjectName: 'John Doe',
      subjectEmail: 'john@example.com',
      subjectDid: 'did:web:example.com:users:john',
      claims: { department: 'Engineering' },
      expiresIn: 365,
    };

    const result = CredentialRequestSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const data = {
      schemaId: 'employee-badge',
      subjectName: 'John Doe',
      subjectEmail: 'not-an-email',
      claims: {},
    };

    const result = CredentialRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject negative expiresIn', () => {
    const data = {
      schemaId: 'employee-badge',
      subjectName: 'John Doe',
      claims: {},
      expiresIn: -30,
    };

    const result = CredentialRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject zero expiresIn', () => {
    const data = {
      schemaId: 'employee-badge',
      subjectName: 'John Doe',
      claims: {},
      expiresIn: 0,
    };

    const result = CredentialRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ===========================================
// KYB REQUEST SCHEMA TESTS
// ===========================================

describe('KybRequestSchema', () => {
  it('should accept minimal valid KYB request', () => {
    const data = {
      legalName: 'ACME Corporation GmbH',
      country: 'DE',
    };

    const result = KybRequestSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should accept full KYB request', () => {
    const data = {
      legalName: 'ACME Corporation GmbH',
      tradingName: 'ACME',
      registrationNumber: 'HRB 12345',
      vatNumber: 'DE123456789',
      country: 'DE',
      address: {
        line1: 'Hauptstraße 123',
        line2: 'Building B',
        city: 'Berlin',
        postalCode: '10115',
        country: 'DE',
      },
      contact: {
        email: 'contact@acme.de',
        phone: '+49 30 12345678',
        website: 'https://acme.de',
      },
    };

    const result = KybRequestSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject empty legal name', () => {
    const data = {
      legalName: '',
      country: 'DE',
    };

    const result = KybRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid country code length', () => {
    const data = {
      legalName: 'ACME Corp',
      country: 'DEU', // Should be 2 characters
    };

    const result = KybRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject single character country code', () => {
    const data = {
      legalName: 'ACME Corp',
      country: 'D',
    };

    const result = KybRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid contact email', () => {
    const data = {
      legalName: 'ACME Corp',
      country: 'DE',
      contact: {
        email: 'not-valid-email',
      },
    };

    const result = KybRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid contact website', () => {
    const data = {
      legalName: 'ACME Corp',
      country: 'DE',
      contact: {
        email: 'contact@acme.de',
        website: 'not-a-url',
      },
    };

    const result = KybRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should validate address country code', () => {
    const data = {
      legalName: 'ACME Corp',
      country: 'DE',
      address: {
        line1: 'Street 123',
        city: 'Berlin',
        postalCode: '10115',
        country: 'GERMANY', // Invalid - should be 2 chars
      },
    };

    const result = KybRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ===========================================
// CONSTANTS TESTS
// ===========================================

describe('Constants', () => {
  describe('ApiKeyScopes', () => {
    it('should have wildcard scope', () => {
      expect(ApiKeyScopes.ALL).toBe('*');
    });

    it('should have product scopes', () => {
      expect(ApiKeyScopes.PRODUCTS_READ).toBe('products:read');
      expect(ApiKeyScopes.PRODUCTS_WRITE).toBe('products:write');
    });

    it('should have passport scopes', () => {
      expect(ApiKeyScopes.PASSPORTS_READ).toBe('passports:read');
      expect(ApiKeyScopes.PASSPORTS_WRITE).toBe('passports:write');
    });

    it('should have credential scopes', () => {
      expect(ApiKeyScopes.CREDENTIALS_READ).toBe('credentials:read');
      expect(ApiKeyScopes.CREDENTIALS_WRITE).toBe('credentials:write');
    });

    it('should have merchant scopes', () => {
      expect(ApiKeyScopes.MERCHANTS_READ).toBe('merchants:read');
      expect(ApiKeyScopes.MERCHANTS_WRITE).toBe('merchants:write');
    });

    it('should have KYB scopes', () => {
      expect(ApiKeyScopes.KYB_READ).toBe('kyb:read');
      expect(ApiKeyScopes.KYB_WRITE).toBe('kyb:write');
    });

    it('should have webhook scopes', () => {
      expect(ApiKeyScopes.WEBHOOKS_READ).toBe('webhooks:read');
      expect(ApiKeyScopes.WEBHOOKS_WRITE).toBe('webhooks:write');
    });

    it('should follow naming convention (resource:action)', () => {
      const scopeValues = Object.values(ApiKeyScopes).filter(v => v !== '*');
      const pattern = /^[a-z]+:[a-z]+$/;

      scopeValues.forEach(scope => {
        expect(scope).toMatch(pattern);
      });
    });
  });

  describe('SUPPORTED_COUNTRIES', () => {
    it('should contain all 27 EU member states', () => {
      expect(SUPPORTED_COUNTRIES).toHaveLength(27);
    });

    it('should contain Germany', () => {
      expect(SUPPORTED_COUNTRIES).toContain('DE');
    });

    it('should contain France', () => {
      expect(SUPPORTED_COUNTRIES).toContain('FR');
    });

    it('should contain all major EU countries', () => {
      const majorCountries = ['DE', 'FR', 'IT', 'ES', 'NL', 'PL'];
      majorCountries.forEach(country => {
        expect(SUPPORTED_COUNTRIES).toContain(country);
      });
    });

    it('should use ISO 3166-1 alpha-2 codes', () => {
      SUPPORTED_COUNTRIES.forEach(code => {
        expect(code).toHaveLength(2);
        expect(code).toMatch(/^[A-Z]{2}$/);
      });
    });

    it('should not contain UK (post-Brexit)', () => {
      expect(SUPPORTED_COUNTRIES).not.toContain('GB');
      expect(SUPPORTED_COUNTRIES).not.toContain('UK');
    });
  });

  describe('SANCTIONS_LISTS', () => {
    it('should contain EU sanctions', () => {
      expect(SANCTIONS_LISTS).toContain('EU_SANCTIONS');
    });

    it('should contain UN sanctions', () => {
      expect(SANCTIONS_LISTS).toContain('UN_SANCTIONS');
    });

    it('should contain OFAC SDN list', () => {
      expect(SANCTIONS_LISTS).toContain('OFAC_SDN');
    });

    it('should contain UK sanctions', () => {
      expect(SANCTIONS_LISTS).toContain('UK_SANCTIONS');
    });

    it('should have 4 sanctions lists', () => {
      expect(SANCTIONS_LISTS).toHaveLength(4);
    });
  });
});
