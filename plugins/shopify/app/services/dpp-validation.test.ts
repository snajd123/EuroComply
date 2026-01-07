/**
 * DPP Validation Engine Tests
 * Tests for EU ESPR compliance validation across product categories
 */

import { describe, it, expect } from 'vitest';
import {
  validateDppData,
  validateTextileDpp,
  validateElectronicsDpp,
  validateFurnitureDpp,
  validateBatteryDpp,
  canIssueVC,
  getValidationSummary,
} from './dpp-validation.server';

// ===========================================
// TEXTILE DPP VALIDATION TESTS
// ===========================================

describe('Textile DPP Validation', () => {
  const validTextileDpp = {
    category: 'textile' as const,
    fiberComposition: [
      { fiberType: 'organic_cotton', percentage: 95, origin: 'organic' as const },
      { fiberType: 'elastane', percentage: 5, origin: 'conventional' as const },
    ],
    countryOfManufacture: 'PT',
    manufacturer: {
      name: 'EcoTextiles Ltd',
      country: 'PT',
      address: '123 Factory St',
    },
    careInstructions: {
      maxWashTemperature: 30,
      bleachAllowed: false,
      tumbleDryAllowed: false,
      ironTemperature: 'low' as const,
      professionalCleaningCode: 'P',
    },
    hazardousSubstances: {
      reachCompliant: true,
      substancesOfConcern: [],
    },
  };

  describe('Valid Textile DPP', () => {
    it('should validate a complete textile DPP', () => {
      const result = validateTextileDpp(validTextileDpp as any);

      expect(result.valid).toBe(true);
      expect(result.category).toBe('textile');
      expect(result.mandatoryFieldsComplete).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should calculate completeness score', () => {
      const result = validateTextileDpp(validTextileDpp as any);

      // Mandatory fields give 60%, recommended give more
      expect(result.completenessScore).toBeGreaterThanOrEqual(60);
    });

    it('should add warnings for missing recommended fields', () => {
      const result = validateTextileDpp(validTextileDpp as any);

      // Should warn about missing carbon footprint, certifications, etc.
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.code === 'CARBON_RECOMMENDED')).toBe(true);
    });
  });

  describe('Fiber Composition Validation', () => {
    it('should reject missing fiber composition', () => {
      const data = { ...validTextileDpp, fiberComposition: undefined };
      const result = validateTextileDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'FIBER_REQUIRED')).toBe(true);
    });

    it('should reject empty fiber composition', () => {
      const data = { ...validTextileDpp, fiberComposition: [] };
      const result = validateTextileDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'FIBER_REQUIRED')).toBe(true);
    });

    it('should reject fiber percentages not summing to 100', () => {
      const data = {
        ...validTextileDpp,
        fiberComposition: [
          { fiberType: 'cotton', percentage: 80, origin: 'conventional' },
          { fiberType: 'polyester', percentage: 10, origin: 'conventional' },
        ],
      };
      const result = validateTextileDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'FIBER_PERCENTAGE_INVALID')).toBe(true);
    });

    it('should accept fiber percentages summing to 100', () => {
      const data = {
        ...validTextileDpp,
        fiberComposition: [
          { fiberType: 'cotton', percentage: 95, origin: 'organic' },
          { fiberType: 'elastane', percentage: 5, origin: 'conventional' },
        ],
      };
      const result = validateTextileDpp(data as any);

      expect(result.errors.some(e => e.code === 'FIBER_PERCENTAGE_INVALID' && e.message.includes('sum to 100'))).toBe(false);
    });

    it('should reject missing fiber origin', () => {
      const data = {
        ...validTextileDpp,
        fiberComposition: [
          { fiberType: 'cotton', percentage: 100 },
        ],
      };
      const result = validateTextileDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'FIBER_ORIGIN_REQUIRED')).toBe(true);
    });
  });

  describe('Country of Manufacture Validation', () => {
    it('should reject missing country', () => {
      const data = { ...validTextileDpp, countryOfManufacture: undefined };
      const result = validateTextileDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'COUNTRY_REQUIRED')).toBe(true);
    });

    it('should reject invalid country code', () => {
      const data = { ...validTextileDpp, countryOfManufacture: 'XX' };
      const result = validateTextileDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'COUNTRY_INVALID')).toBe(true);
    });

    it('should accept valid ISO country codes', () => {
      const validCountries = ['PT', 'DE', 'FR', 'IT', 'ES', 'US', 'CN', 'IN'];

      validCountries.forEach(country => {
        const data = { ...validTextileDpp, countryOfManufacture: country };
        const result = validateTextileDpp(data as any);

        expect(result.errors.some(e => e.code === 'COUNTRY_INVALID')).toBe(false);
      });
    });
  });

  describe('Care Instructions Validation', () => {
    it('should reject missing care instructions', () => {
      const data = { ...validTextileDpp, careInstructions: undefined };
      const result = validateTextileDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'CARE_REQUIRED')).toBe(true);
    });

    it('should reject missing wash temperature', () => {
      const data = {
        ...validTextileDpp,
        careInstructions: {
          ...validTextileDpp.careInstructions,
          maxWashTemperature: undefined,
        },
      };
      const result = validateTextileDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'WASH_TEMP_REQUIRED')).toBe(true);
    });

    it('should reject missing iron temperature', () => {
      const data = {
        ...validTextileDpp,
        careInstructions: {
          ...validTextileDpp.careInstructions,
          ironTemperature: undefined,
        },
      };
      const result = validateTextileDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'IRON_TEMP_REQUIRED')).toBe(true);
    });
  });

  describe('Hazardous Substances Validation', () => {
    it('should reject missing hazardous substances declaration', () => {
      const data = { ...validTextileDpp, hazardousSubstances: undefined };
      const result = validateTextileDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'HAZARDOUS_REQUIRED')).toBe(true);
    });

    it('should reject missing REACH compliance', () => {
      const data = {
        ...validTextileDpp,
        hazardousSubstances: {
          substancesOfConcern: [],
        },
      };
      const result = validateTextileDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'REACH_REQUIRED')).toBe(true);
    });
  });

  describe('Completeness Score', () => {
    it('should increase score with carbon footprint', () => {
      const withoutCarbon = validateTextileDpp(validTextileDpp as any);

      const withCarbon = validateTextileDpp({
        ...validTextileDpp,
        carbonFootprint: {
          value: 3.2,
          unit: 'kgCO2e',
          scope: 'cradle_to_gate',
          methodology: 'PEF',
          dataSource: 'lca_measured',
        },
      } as any);

      expect(withCarbon.completenessScore).toBeGreaterThan(withoutCarbon.completenessScore);
    });

    it('should increase score with certifications', () => {
      const withoutCerts = validateTextileDpp(validTextileDpp as any);

      const withCerts = validateTextileDpp({
        ...validTextileDpp,
        certifications: [
          { type: 'GOTS', issuedBy: 'Control Union', validUntil: '2025-12-31', verified: true },
        ],
      } as any);

      expect(withCerts.completenessScore).toBeGreaterThan(withoutCerts.completenessScore);
    });
  });
});

// ===========================================
// ELECTRONICS DPP VALIDATION TESTS
// ===========================================

describe('Electronics DPP Validation', () => {
  const validElectronicsDpp = {
    category: 'electronics' as const,
    manufacturer: {
      name: 'TechCorp Inc',
      country: 'DE',
    },
    repairability: {
      score: 7,
      spareParts: [
        { partName: 'Battery', availability: '5 years', price: 29.99 },
        { partName: 'Screen', availability: '5 years', price: 89.99 },
      ],
    },
    compliance: {
      rohsCompliant: true,
      weeeRegistrationNumber: 'WEEE/AA1234',
    },
    hazardousSubstances: {
      reachCompliant: true,
      substancesOfConcern: [],
    },
  };

  describe('Valid Electronics DPP', () => {
    it('should validate a complete electronics DPP', () => {
      const result = validateElectronicsDpp(validElectronicsDpp as any);

      expect(result.valid).toBe(true);
      expect(result.category).toBe('electronics');
      expect(result.mandatoryFieldsComplete).toBe(true);
    });
  });

  describe('Repairability Validation', () => {
    it('should reject missing repairability', () => {
      const data = { ...validElectronicsDpp, repairability: undefined };
      const result = validateElectronicsDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'REPAIRABILITY_REQUIRED')).toBe(true);
    });

    it('should reject invalid repairability score', () => {
      const data = {
        ...validElectronicsDpp,
        repairability: { ...validElectronicsDpp.repairability, score: 15 },
      };
      const result = validateElectronicsDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'REPAIR_SCORE_INVALID')).toBe(true);
    });

    it('should reject missing spare parts', () => {
      const data = {
        ...validElectronicsDpp,
        repairability: { score: 7, spareParts: [] },
      };
      const result = validateElectronicsDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'SPARE_PARTS_REQUIRED')).toBe(true);
    });
  });

  describe('Compliance Validation', () => {
    it('should reject missing RoHS compliance', () => {
      const data = {
        ...validElectronicsDpp,
        compliance: { weeeRegistrationNumber: 'WEEE/123' },
      };
      const result = validateElectronicsDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'ROHS_REQUIRED')).toBe(true);
    });

    it('should reject missing WEEE registration', () => {
      const data = {
        ...validElectronicsDpp,
        compliance: { rohsCompliant: true },
      };
      const result = validateElectronicsDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'WEEE_REQUIRED')).toBe(true);
    });
  });
});

// ===========================================
// FURNITURE DPP VALIDATION TESTS
// ===========================================

describe('Furniture DPP Validation', () => {
  const validFurnitureDpp = {
    category: 'furniture' as const,
    manufacturer: {
      name: 'Nordic Furniture AB',
      country: 'SE',
    },
    billOfMaterials: [
      { material: 'Oak wood', percentage: 70, origin: 'SE', recycledContent: 0 },
      { material: 'Steel', percentage: 20, origin: 'DE', recycledContent: 50 },
      { material: 'Fabric', percentage: 10, origin: 'PT', recycledContent: 30 },
    ],
    disassembly: {
      instructionsUrl: 'https://example.com/disassembly-guide',
      toolsRequired: ['Phillips screwdriver', 'Allen key'],
      estimatedTime: 30,
    },
    durability: {
      testResult: 'passed',
      testStandard: 'EN 12520',
      cycles: 50000,
    },
    hazardousSubstances: {
      reachCompliant: true,
      substancesOfConcern: [],
    },
  };

  describe('Valid Furniture DPP', () => {
    it('should validate a complete furniture DPP', () => {
      const result = validateFurnitureDpp(validFurnitureDpp as any);

      expect(result.valid).toBe(true);
      expect(result.category).toBe('furniture');
    });
  });

  describe('Bill of Materials Validation', () => {
    it('should reject missing bill of materials', () => {
      const data = { ...validFurnitureDpp, billOfMaterials: undefined };
      const result = validateFurnitureDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BOM_REQUIRED')).toBe(true);
    });

    it('should reject empty bill of materials', () => {
      const data = { ...validFurnitureDpp, billOfMaterials: [] };
      const result = validateFurnitureDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BOM_REQUIRED')).toBe(true);
    });
  });

  describe('Disassembly Validation', () => {
    it('should reject missing disassembly instructions', () => {
      const data = { ...validFurnitureDpp, disassembly: undefined };
      const result = validateFurnitureDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DISASSEMBLY_REQUIRED')).toBe(true);
    });

    it('should reject missing disassembly URL', () => {
      const data = {
        ...validFurnitureDpp,
        disassembly: { toolsRequired: ['screwdriver'] },
      };
      const result = validateFurnitureDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DISASSEMBLY_URL_REQUIRED')).toBe(true);
    });
  });

  describe('Durability Validation', () => {
    it('should reject missing durability data', () => {
      const data = { ...validFurnitureDpp, durability: undefined };
      const result = validateFurnitureDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DURABILITY_REQUIRED')).toBe(true);
    });
  });
});

// ===========================================
// BATTERY DPP VALIDATION TESTS
// ===========================================

describe('Battery DPP Validation', () => {
  const validBatteryDpp = {
    category: 'battery' as const,
    manufacturer: {
      name: 'PowerCell GmbH',
      country: 'DE',
    },
    batteryIdentification: {
      type: 'industrial' as const,
      chemistry: 'Li-ion',
      nominalVoltage: 48,
      capacity: 100,
    },
    composition: {
      lithium: 2.5,
      cobalt: 5.0,
      nickel: 10.0,
      manganese: 2.0,
    },
    recycledContent: {
      cobalt: 12,
      lithium: 4,
      nickel: 4,
      lead: 0,
    },
    carbonFootprint: {
      value: 65,
      unit: 'kgCO2e/kWh',
      scope: 'cradle_to_gate' as const,
    },
    performance: {
      ratedCapacity: 100,
      expectedLifetime: 8,
      cycleLife: 3000,
    },
    dueDiligence: {
      responsibleSourcing: true,
      conflictFreeMineral: true,
    },
    safetyInfo: {
      hazardClass: '9',
      unNumber: 'UN3481',
      handlingInstructions: 'Handle with care',
    },
    endOfLife: {
      collectionPointUrl: 'https://example.com/collection',
      recyclingInstructions: 'Return to authorized recycler',
    },
  };

  describe('Valid Battery DPP', () => {
    it('should validate a complete battery DPP', () => {
      const result = validateBatteryDpp(validBatteryDpp as any);

      expect(result.valid).toBe(true);
      expect(result.category).toBe('battery');
    });
  });

  describe('Battery-Specific Mandatory Fields', () => {
    it('should reject missing battery identification', () => {
      const data = { ...validBatteryDpp, batteryIdentification: undefined };
      const result = validateBatteryDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BATTERY_ID_REQUIRED')).toBe(true);
    });

    it('should reject missing composition', () => {
      const data = { ...validBatteryDpp, composition: undefined };
      const result = validateBatteryDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'COMPOSITION_REQUIRED')).toBe(true);
    });

    it('should reject missing recycled content', () => {
      const data = { ...validBatteryDpp, recycledContent: undefined };
      const result = validateBatteryDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'RECYCLED_CONTENT_REQUIRED')).toBe(true);
    });

    it('should require carbon footprint for industrial batteries', () => {
      const data = { ...validBatteryDpp, carbonFootprint: undefined };
      const result = validateBatteryDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'CARBON_REQUIRED')).toBe(true);
    });

    it('should reject missing due diligence', () => {
      const data = { ...validBatteryDpp, dueDiligence: undefined };
      const result = validateBatteryDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUE_DILIGENCE_REQUIRED')).toBe(true);
    });

    it('should reject missing safety info', () => {
      const data = { ...validBatteryDpp, safetyInfo: undefined };
      const result = validateBatteryDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'SAFETY_REQUIRED')).toBe(true);
    });

    it('should reject missing end of life instructions', () => {
      const data = { ...validBatteryDpp, endOfLife: undefined };
      const result = validateBatteryDpp(data as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'END_OF_LIFE_REQUIRED')).toBe(true);
    });
  });
});

// ===========================================
// MAIN VALIDATION ENTRY POINT TESTS
// ===========================================

describe('validateDppData', () => {
  it('should route to textile validator for textile category', () => {
    const result = validateDppData({
      category: 'textile',
      fiberComposition: [],
    } as any);

    expect(result.category).toBe('textile');
    expect(result.errors.some(e => e.code === 'FIBER_REQUIRED')).toBe(true);
  });

  it('should route to electronics validator for electronics category', () => {
    const result = validateDppData({
      category: 'electronics',
    } as any);

    expect(result.category).toBe('electronics');
    expect(result.errors.some(e => e.code === 'REPAIRABILITY_REQUIRED')).toBe(true);
  });

  it('should route to furniture validator for furniture category', () => {
    const result = validateDppData({
      category: 'furniture',
    } as any);

    expect(result.category).toBe('furniture');
    expect(result.errors.some(e => e.code === 'BOM_REQUIRED')).toBe(true);
  });

  it('should route to battery validator for battery category', () => {
    const result = validateDppData({
      category: 'battery',
    } as any);

    expect(result.category).toBe('battery');
    expect(result.errors.some(e => e.code === 'BATTERY_ID_REQUIRED')).toBe(true);
  });

  it('should reject unknown category', () => {
    const result = validateDppData({
      category: 'unknown',
    } as any);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'UNKNOWN_CATEGORY')).toBe(true);
  });
});

// ===========================================
// UTILITY FUNCTION TESTS
// ===========================================

describe('canIssueVC', () => {
  it('should return true when validation passes', () => {
    const result = {
      valid: true,
      mandatoryFieldsComplete: true,
      category: 'textile' as const,
      completenessScore: 80,
      errors: [],
      warnings: [],
    };

    expect(canIssueVC(result)).toBe(true);
  });

  it('should return false when validation fails', () => {
    const result = {
      valid: false,
      mandatoryFieldsComplete: false,
      category: 'textile' as const,
      completenessScore: 40,
      errors: [{ field: 'test', code: 'TEST', message: 'Test error' }],
      warnings: [],
    };

    expect(canIssueVC(result)).toBe(false);
  });

  it('should return false when mandatory fields incomplete', () => {
    const result = {
      valid: true,
      mandatoryFieldsComplete: false,
      category: 'textile' as const,
      completenessScore: 50,
      errors: [],
      warnings: [],
    };

    expect(canIssueVC(result)).toBe(false);
  });
});

describe('getValidationSummary', () => {
  it('should return success message for valid DPP', () => {
    const result = {
      valid: true,
      mandatoryFieldsComplete: true,
      category: 'textile' as const,
      completenessScore: 85,
      errors: [],
      warnings: [],
    };

    const summary = getValidationSummary(result);

    expect(summary).toContain('✓');
    expect(summary).toContain('85%');
    expect(summary).toContain('Verifiable Credential');
  });

  it('should return error message for invalid DPP', () => {
    const result = {
      valid: false,
      mandatoryFieldsComplete: false,
      category: 'textile' as const,
      completenessScore: 30,
      errors: [
        { field: 'fiber', code: 'FIBER_REQUIRED', message: 'Missing' },
        { field: 'care', code: 'CARE_REQUIRED', message: 'Missing' },
      ],
      warnings: [
        { field: 'carbon', code: 'CARBON_RECOMMENDED', message: 'Recommended' },
      ],
    };

    const summary = getValidationSummary(result);

    expect(summary).toContain('✗');
    expect(summary).toContain('Cannot issue VC');
    expect(summary).toContain('2 mandatory field');
    expect(summary).toContain('1 recommendation');
  });
});
