/**
 * Supplier Validators Tests
 */

import { describe, it, expect } from 'vitest';
import {
  registerSupplierSchema,
  loginSupplierSchema,
  updateSupplierProfileSchema,
  createSupplierProductSchema,
  catalogSearchSchema,
  submitVerificationSchema,
  adminReviewVerificationSchema,
} from './validators.js';

// ===========================================
// REGISTRATION VALIDATORS
// ===========================================

describe('registerSupplierSchema', () => {
  it('should accept valid registration data', () => {
    const validData = {
      email: 'supplier@example.com',
      password: 'securepass123',
      companyName: 'ABC Textiles GmbH',
      country: 'DE',
    };

    const result = registerSupplierSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should accept registration with optional fields', () => {
    const validData = {
      email: 'supplier@example.com',
      password: 'securepass123',
      companyName: 'ABC Textiles GmbH',
      country: 'DE',
      website: 'https://abc-textiles.com',
      description: 'Premium organic cotton manufacturer',
    };

    const result = registerSupplierSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const invalidData = {
      email: 'not-an-email',
      password: 'securepass123',
      companyName: 'ABC Textiles',
      country: 'DE',
    };

    const result = registerSupplierSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject short password', () => {
    const invalidData = {
      email: 'supplier@example.com',
      password: 'short',
      companyName: 'ABC Textiles',
      country: 'DE',
    };

    const result = registerSupplierSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject invalid country code', () => {
    const invalidData = {
      email: 'supplier@example.com',
      password: 'securepass123',
      companyName: 'ABC Textiles',
      country: 'DEU', // Should be 2 characters
    };

    const result = registerSupplierSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject invalid website URL', () => {
    const invalidData = {
      email: 'supplier@example.com',
      password: 'securepass123',
      companyName: 'ABC Textiles',
      country: 'DE',
      website: 'not-a-url',
    };

    const result = registerSupplierSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

// ===========================================
// LOGIN VALIDATORS
// ===========================================

describe('loginSupplierSchema', () => {
  it('should accept valid login data', () => {
    const validData = {
      email: 'supplier@example.com',
      password: 'anypassword',
    };

    const result = loginSupplierSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject empty password', () => {
    const invalidData = {
      email: 'supplier@example.com',
      password: '',
    };

    const result = loginSupplierSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

// ===========================================
// PROFILE UPDATE VALIDATORS
// ===========================================

describe('updateSupplierProfileSchema', () => {
  it('should accept partial updates', () => {
    const validData = {
      companyName: 'New Company Name',
    };

    const result = updateSupplierProfileSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should accept null for nullable fields', () => {
    const validData = {
      website: null,
      description: null,
      logoUrl: null,
    };

    const result = updateSupplierProfileSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should validate catalogVisibility enum', () => {
    const validData = { catalogVisibility: 'PUBLIC' };
    expect(updateSupplierProfileSchema.safeParse(validData).success).toBe(true);

    const invalidData = { catalogVisibility: 'INVALID' };
    expect(updateSupplierProfileSchema.safeParse(invalidData).success).toBe(false);
  });
});

// ===========================================
// PRODUCT VALIDATORS
// ===========================================

describe('createSupplierProductSchema', () => {
  const validTextileDppData = {
    category: 'textile' as const,
    fiberComposition: [
      { fiberType: 'organic_cotton', percentage: 100, origin: 'organic' },
    ],
    countryOfManufacture: 'PT',
    manufacturer: {
      name: 'ABC Textiles GmbH',
      country: 'DE',
    },
    careInstructions: {
      maxWashTemperature: 40,
      bleachAllowed: false,
      tumbleDryAllowed: false,
      ironTemperature: 'medium' as const,
      dryCleanAllowed: false,
    },
    hazardousSubstances: {
      reachCompliant: true,
    },
  };

  it('should accept valid product data', () => {
    const validData = {
      name: 'Organic Cotton T-Shirt Base',
      dppData: validTextileDppData,
    };

    const result = createSupplierProductSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should accept product with all optional fields', () => {
    const validData = {
      name: 'Organic Cotton T-Shirt Base',
      description: 'Premium GOTS certified organic cotton',
      category: 'TEXTILE',
      imageUrls: ['https://example.com/image.jpg'],
      dppData: {
        ...validTextileDppData,
        certifications: [{
          type: 'GOTS',
          certificateNumber: 'GOTS-12345',
          issuingBody: 'Control Union',
          validFrom: '2024-01-01',
          validUntil: '2025-12-31',
        }],
        carbonFootprint: {
          value: 3.2,
          unit: 'kgCO2e' as const,
          methodology: 'Higg_MSI',
        },
      },
      visibility: 'PUBLISHED',
    };

    const result = createSupplierProductSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject product without name', () => {
    const invalidData = {
      dppData: validTextileDppData,
    };

    const result = createSupplierProductSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject invalid fiber composition percentages', () => {
    const invalidData = {
      name: 'Test Product',
      dppData: {
        ...validTextileDppData,
        fiberComposition: [
          { fiberType: 'cotton', percentage: 150, origin: 'conventional' }, // Invalid: > 100
        ],
      },
    };

    const result = createSupplierProductSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject empty fiber composition', () => {
    const invalidData = {
      name: 'Test Product',
      dppData: {
        ...validTextileDppData,
        fiberComposition: [],
      },
    };

    const result = createSupplierProductSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject invalid iron temperature', () => {
    const invalidData = {
      name: 'Test Product',
      dppData: {
        ...validTextileDppData,
        careInstructions: {
          ...validTextileDppData.careInstructions,
          ironTemperature: 'very_high', // Invalid
        },
      },
    };

    const result = createSupplierProductSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

// ===========================================
// CATALOG SEARCH VALIDATORS
// ===========================================

describe('catalogSearchSchema', () => {
  it('should accept empty search (returns all)', () => {
    const result = catalogSearchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should coerce string numbers to numbers', () => {
    const data = { page: '2', limit: '50' };
    const result = catalogSearchSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(50);
    }
  });

  it('should apply default pagination', () => {
    const result = catalogSearchSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('should validate category enum', () => {
    const validData = { category: 'TEXTILE' };
    expect(catalogSearchSchema.safeParse(validData).success).toBe(true);

    const invalidData = { category: 'INVALID_CATEGORY' };
    expect(catalogSearchSchema.safeParse(invalidData).success).toBe(false);
  });

  it('should reject limit > 100', () => {
    const invalidData = { limit: 200 };
    const result = catalogSearchSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject page < 1', () => {
    const invalidData = { page: 0 };
    const result = catalogSearchSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

// ===========================================
// VERIFICATION VALIDATORS
// ===========================================

describe('submitVerificationSchema', () => {
  it('should accept valid verification submission', () => {
    const validData = {
      companyRegistration: 'HRB 12345',
      documents: [
        {
          type: 'BUSINESS_REGISTRATION',
          name: 'Handelsregister Auszug',
          url: 'https://storage.example.com/docs/registration.pdf',
        },
      ],
    };

    const result = submitVerificationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should accept multiple document types', () => {
    const validData = {
      companyRegistration: 'HRB 12345',
      documents: [
        {
          type: 'BUSINESS_REGISTRATION',
          name: 'Business Registration',
          url: 'https://storage.example.com/docs/reg.pdf',
        },
        {
          type: 'TAX_CERTIFICATE',
          name: 'VAT Certificate',
          url: 'https://storage.example.com/docs/vat.pdf',
        },
        {
          type: 'CERTIFICATION',
          name: 'GOTS Certificate',
          url: 'https://storage.example.com/docs/gots.pdf',
          mimeType: 'application/pdf',
        },
      ],
      notes: 'Documents are from 2024',
    };

    const result = submitVerificationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject empty company registration', () => {
    const invalidData = {
      companyRegistration: '',
      documents: [
        {
          type: 'BUSINESS_REGISTRATION',
          name: 'Doc',
          url: 'https://example.com/doc.pdf',
        },
      ],
    };

    const result = submitVerificationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject empty documents array', () => {
    const invalidData = {
      companyRegistration: 'HRB 12345',
      documents: [],
    };

    const result = submitVerificationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject invalid document type', () => {
    const invalidData = {
      companyRegistration: 'HRB 12345',
      documents: [
        {
          type: 'INVALID_TYPE',
          name: 'Doc',
          url: 'https://example.com/doc.pdf',
        },
      ],
    };

    const result = submitVerificationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject invalid document URL', () => {
    const invalidData = {
      companyRegistration: 'HRB 12345',
      documents: [
        {
          type: 'BUSINESS_REGISTRATION',
          name: 'Doc',
          url: 'not-a-url',
        },
      ],
    };

    const result = submitVerificationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

describe('adminReviewVerificationSchema', () => {
  it('should accept VERIFIED decision', () => {
    const validData = { decision: 'VERIFIED' };
    const result = adminReviewVerificationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should accept REJECTED decision with notes', () => {
    const validData = {
      decision: 'REJECTED',
      notes: 'Documents are expired',
    };
    const result = adminReviewVerificationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject invalid decision', () => {
    const invalidData = { decision: 'PENDING' };
    const result = adminReviewVerificationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});
