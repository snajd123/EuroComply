/**
 * DPP Validation Engine
 *
 * Strict validation of DPP data against EU ESPR requirements.
 * Blocks VC issuance if mandatory fields are missing or invalid.
 */

import type {
  DppData,
  TextileDppData,
  ElectronicsDppData,
  FurnitureDppData,
  BatteryDppData,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ProductCategory,
  FiberComposition,
  CarbonFootprint,
  Certification,
} from '../types/dpp-schemas';

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

export function validateDppData(data: DppData): ValidationResult {
  switch (data.category) {
    case 'textile':
      return validateTextileDpp(data as TextileDppData);
    case 'electronics':
      return validateElectronicsDpp(data as ElectronicsDppData);
    case 'furniture':
      return validateFurnitureDpp(data as FurnitureDppData);
    case 'battery':
      return validateBatteryDpp(data as BatteryDppData);
    default:
      return {
        valid: false,
        category: 'other',
        completenessScore: 0,
        mandatoryFieldsComplete: false,
        errors: [{ field: 'category', code: 'UNKNOWN_CATEGORY', message: 'Unknown product category' }],
        warnings: [],
      };
  }
}

// ============================================================================
// TEXTILE VALIDATION
// ============================================================================

export function validateTextileDpp(data: TextileDppData): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // ─────────────────────────────────────────────────────────────
  // MANDATORY FIELD VALIDATION (blocks VC issuance if missing)
  // ─────────────────────────────────────────────────────────────

  // 1. Fiber Composition
  if (!data.fiberComposition || data.fiberComposition.length === 0) {
    errors.push({
      field: 'fiberComposition',
      code: 'FIBER_REQUIRED',
      message: 'Fiber composition is required for textile DPPs',
    });
  } else {
    // Validate fiber percentages sum to 100
    const totalPercentage = data.fiberComposition.reduce((sum, f) => sum + f.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.1) {
      errors.push({
        field: 'fiberComposition',
        code: 'FIBER_PERCENTAGE_INVALID',
        message: `Fiber percentages must sum to 100% (currently ${totalPercentage}%)`,
      });
    }

    // Validate each fiber entry
    data.fiberComposition.forEach((fiber, index) => {
      if (!fiber.fiberType) {
        errors.push({
          field: `fiberComposition[${index}].fiberType`,
          code: 'FIBER_TYPE_REQUIRED',
          message: `Fiber type is required for entry ${index + 1}`,
        });
      }
      if (fiber.percentage <= 0 || fiber.percentage > 100) {
        errors.push({
          field: `fiberComposition[${index}].percentage`,
          code: 'FIBER_PERCENTAGE_INVALID',
          message: `Fiber percentage must be between 0 and 100 for entry ${index + 1}`,
        });
      }
      if (!fiber.origin) {
        errors.push({
          field: `fiberComposition[${index}].origin`,
          code: 'FIBER_ORIGIN_REQUIRED',
          message: `Fiber origin (conventional/organic/recycled) is required for entry ${index + 1}`,
        });
      }
    });
  }

  // 2. Country of Manufacture
  if (!data.countryOfManufacture) {
    errors.push({
      field: 'countryOfManufacture',
      code: 'COUNTRY_REQUIRED',
      message: 'Country of manufacture is required',
    });
  } else if (!isValidCountryCode(data.countryOfManufacture)) {
    errors.push({
      field: 'countryOfManufacture',
      code: 'COUNTRY_INVALID',
      message: 'Country must be a valid ISO 3166-1 alpha-2 code',
    });
  }

  // 3. Manufacturer Information
  if (!data.manufacturer) {
    errors.push({
      field: 'manufacturer',
      code: 'MANUFACTURER_REQUIRED',
      message: 'Manufacturer information is required',
    });
  } else {
    if (!data.manufacturer.name) {
      errors.push({
        field: 'manufacturer.name',
        code: 'MANUFACTURER_NAME_REQUIRED',
        message: 'Manufacturer name is required',
      });
    }
    if (!data.manufacturer.country) {
      errors.push({
        field: 'manufacturer.country',
        code: 'MANUFACTURER_COUNTRY_REQUIRED',
        message: 'Manufacturer country is required',
      });
    }
  }

  // 4. Care Instructions
  if (!data.careInstructions) {
    errors.push({
      field: 'careInstructions',
      code: 'CARE_REQUIRED',
      message: 'Care instructions are required for textile DPPs',
    });
  } else {
    if (data.careInstructions.maxWashTemperature === undefined) {
      errors.push({
        field: 'careInstructions.maxWashTemperature',
        code: 'WASH_TEMP_REQUIRED',
        message: 'Maximum wash temperature must be specified (use null for "do not wash")',
      });
    }
    if (data.careInstructions.bleachAllowed === undefined) {
      errors.push({
        field: 'careInstructions.bleachAllowed',
        code: 'BLEACH_REQUIRED',
        message: 'Bleach allowance must be specified',
      });
    }
    if (data.careInstructions.tumbleDryAllowed === undefined) {
      errors.push({
        field: 'careInstructions.tumbleDryAllowed',
        code: 'TUMBLE_DRY_REQUIRED',
        message: 'Tumble dry allowance must be specified',
      });
    }
    if (!data.careInstructions.ironTemperature) {
      errors.push({
        field: 'careInstructions.ironTemperature',
        code: 'IRON_TEMP_REQUIRED',
        message: 'Iron temperature setting is required',
      });
    }
  }

  // 5. Hazardous Substances Declaration
  if (!data.hazardousSubstances) {
    errors.push({
      field: 'hazardousSubstances',
      code: 'HAZARDOUS_REQUIRED',
      message: 'Hazardous substances declaration is required',
    });
  } else {
    if (data.hazardousSubstances.reachCompliant === undefined) {
      errors.push({
        field: 'hazardousSubstances.reachCompliant',
        code: 'REACH_REQUIRED',
        message: 'REACH compliance status must be declared',
      });
    }
    if (!data.hazardousSubstances.substancesOfConcern) {
      errors.push({
        field: 'hazardousSubstances.substancesOfConcern',
        code: 'SOC_REQUIRED',
        message: 'Substances of concern list is required (can be empty array if none)',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // RECOMMENDED FIELD WARNINGS (doesn't block, but encourages)
  // ─────────────────────────────────────────────────────────────

  // Carbon Footprint
  if (!data.carbonFootprint) {
    warnings.push({
      field: 'carbonFootprint',
      code: 'CARBON_RECOMMENDED',
      message: 'Carbon footprint is recommended for consumer trust',
      recommendation: 'Use the Higg Index calculator or provide measured data',
    });
  } else {
    validateCarbonFootprint(data.carbonFootprint, warnings);
  }

  // Certifications
  if (!data.certifications || data.certifications.length === 0) {
    warnings.push({
      field: 'certifications',
      code: 'CERTS_RECOMMENDED',
      message: 'Third-party certifications strengthen credibility',
      recommendation: 'Add GOTS, OEKO-TEX, or other relevant certifications',
    });
  } else {
    data.certifications.forEach((cert, index) => {
      validateCertification(cert, index, warnings);
    });
  }

  // Recyclability
  if (!data.recyclability) {
    warnings.push({
      field: 'recyclability',
      code: 'RECYCLABILITY_RECOMMENDED',
      message: 'Recyclability information helps consumers make circular choices',
    });
  }

  // Durability
  if (!data.durability) {
    warnings.push({
      field: 'durability',
      code: 'DURABILITY_RECOMMENDED',
      message: 'Product durability information increases consumer confidence',
    });
  }

  // Supply Chain (advanced, will be mandatory 2030+)
  if (!data.supplyChain || data.supplyChain.length === 0) {
    warnings.push({
      field: 'supplyChain',
      code: 'SUPPLY_CHAIN_FUTURE',
      message: 'Supply chain traceability will be mandatory from 2030',
      recommendation: 'Start collecting supplier information now',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // CALCULATE COMPLETENESS SCORE
  // ─────────────────────────────────────────────────────────────

  const completenessScore = calculateTextileCompleteness(data);

  return {
    valid: errors.length === 0,
    category: 'textile',
    completenessScore,
    mandatoryFieldsComplete: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// ELECTRONICS VALIDATION
// ============================================================================

export function validateElectronicsDpp(data: ElectronicsDppData): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Manufacturer
  if (!data.manufacturer?.name) {
    errors.push({
      field: 'manufacturer.name',
      code: 'MANUFACTURER_REQUIRED',
      message: 'Manufacturer name is required',
    });
  }

  // Repairability (mandatory for electronics)
  if (!data.repairability) {
    errors.push({
      field: 'repairability',
      code: 'REPAIRABILITY_REQUIRED',
      message: 'Repairability information is mandatory for electronics',
    });
  } else {
    if (data.repairability.score < 1 || data.repairability.score > 10) {
      errors.push({
        field: 'repairability.score',
        code: 'REPAIR_SCORE_INVALID',
        message: 'Repairability score must be between 1 and 10',
      });
    }
    if (!data.repairability.spareParts || data.repairability.spareParts.length === 0) {
      errors.push({
        field: 'repairability.spareParts',
        code: 'SPARE_PARTS_REQUIRED',
        message: 'Spare parts information is required',
      });
    }
  }

  // Compliance
  if (!data.compliance) {
    errors.push({
      field: 'compliance',
      code: 'COMPLIANCE_REQUIRED',
      message: 'Compliance information is required',
    });
  } else {
    if (data.compliance.rohsCompliant === undefined) {
      errors.push({
        field: 'compliance.rohsCompliant',
        code: 'ROHS_REQUIRED',
        message: 'RoHS compliance status must be declared',
      });
    }
    if (!data.compliance.weeeRegistrationNumber) {
      errors.push({
        field: 'compliance.weeeRegistrationNumber',
        code: 'WEEE_REQUIRED',
        message: 'WEEE registration number is required',
      });
    }
  }

  // Hazardous substances
  if (!data.hazardousSubstances) {
    errors.push({
      field: 'hazardousSubstances',
      code: 'HAZARDOUS_REQUIRED',
      message: 'Hazardous substances declaration is required',
    });
  }

  // Warnings for recommended fields
  if (!data.carbonFootprint) {
    warnings.push({
      field: 'carbonFootprint',
      code: 'CARBON_RECOMMENDED',
      message: 'Carbon footprint disclosure improves transparency',
    });
  }

  if (!data.softwareSupport) {
    warnings.push({
      field: 'softwareSupport',
      code: 'SOFTWARE_RECOMMENDED',
      message: 'Software support duration is important for consumers',
    });
  }

  const completenessScore = calculateElectronicsCompleteness(data);

  return {
    valid: errors.length === 0,
    category: 'electronics',
    completenessScore,
    mandatoryFieldsComplete: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// FURNITURE VALIDATION
// ============================================================================

export function validateFurnitureDpp(data: FurnitureDppData): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Manufacturer
  if (!data.manufacturer?.name) {
    errors.push({
      field: 'manufacturer.name',
      code: 'MANUFACTURER_REQUIRED',
      message: 'Manufacturer name is required',
    });
  }

  // Bill of Materials
  if (!data.billOfMaterials || data.billOfMaterials.length === 0) {
    errors.push({
      field: 'billOfMaterials',
      code: 'BOM_REQUIRED',
      message: 'Bill of materials is required for furniture DPPs',
    });
  }

  // Disassembly
  if (!data.disassembly) {
    errors.push({
      field: 'disassembly',
      code: 'DISASSEMBLY_REQUIRED',
      message: 'Disassembly instructions are required',
    });
  } else if (!data.disassembly.instructionsUrl) {
    errors.push({
      field: 'disassembly.instructionsUrl',
      code: 'DISASSEMBLY_URL_REQUIRED',
      message: 'URL to disassembly instructions is required',
    });
  }

  // Durability
  if (!data.durability) {
    errors.push({
      field: 'durability',
      code: 'DURABILITY_REQUIRED',
      message: 'Durability test results are required',
    });
  }

  // Hazardous substances
  if (!data.hazardousSubstances) {
    errors.push({
      field: 'hazardousSubstances',
      code: 'HAZARDOUS_REQUIRED',
      message: 'Hazardous substances declaration is required',
    });
  }

  // Warnings
  if (!data.carbonFootprint) {
    warnings.push({
      field: 'carbonFootprint',
      code: 'CARBON_RECOMMENDED',
      message: 'Carbon footprint disclosure is recommended',
    });
  }

  if (!data.repairability) {
    warnings.push({
      field: 'repairability',
      code: 'REPAIR_RECOMMENDED',
      message: 'Repair information helps extend product life',
    });
  }

  const completenessScore = calculateFurnitureCompleteness(data);

  return {
    valid: errors.length === 0,
    category: 'furniture',
    completenessScore,
    mandatoryFieldsComplete: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// BATTERY VALIDATION
// ============================================================================

export function validateBatteryDpp(data: BatteryDppData): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Manufacturer
  if (!data.manufacturer?.name) {
    errors.push({
      field: 'manufacturer.name',
      code: 'MANUFACTURER_REQUIRED',
      message: 'Manufacturer name is required',
    });
  }

  // Battery Identification
  if (!data.batteryIdentification) {
    errors.push({
      field: 'batteryIdentification',
      code: 'BATTERY_ID_REQUIRED',
      message: 'Battery identification is required',
    });
  }

  // Composition
  if (!data.composition) {
    errors.push({
      field: 'composition',
      code: 'COMPOSITION_REQUIRED',
      message: 'Battery composition data is required',
    });
  }

  // Recycled Content
  if (!data.recycledContent) {
    errors.push({
      field: 'recycledContent',
      code: 'RECYCLED_CONTENT_REQUIRED',
      message: 'Recycled content declaration is required for batteries',
    });
  }

  // Carbon Footprint (mandatory for industrial/EV batteries)
  if (!data.carbonFootprint) {
    if (data.batteryIdentification?.type === 'industrial' || data.batteryIdentification?.type === 'ev') {
      errors.push({
        field: 'carbonFootprint',
        code: 'CARBON_REQUIRED',
        message: 'Carbon footprint is mandatory for industrial and EV batteries',
      });
    } else {
      warnings.push({
        field: 'carbonFootprint',
        code: 'CARBON_RECOMMENDED',
        message: 'Carbon footprint disclosure is recommended',
      });
    }
  }

  // Performance
  if (!data.performance) {
    errors.push({
      field: 'performance',
      code: 'PERFORMANCE_REQUIRED',
      message: 'Battery performance data is required',
    });
  }

  // Due Diligence
  if (!data.dueDiligence) {
    errors.push({
      field: 'dueDiligence',
      code: 'DUE_DILIGENCE_REQUIRED',
      message: 'Supply chain due diligence declaration is required',
    });
  }

  // Safety Info
  if (!data.safetyInfo) {
    errors.push({
      field: 'safetyInfo',
      code: 'SAFETY_REQUIRED',
      message: 'Safety information is required',
    });
  }

  // End of Life
  if (!data.endOfLife) {
    errors.push({
      field: 'endOfLife',
      code: 'END_OF_LIFE_REQUIRED',
      message: 'End of life instructions are required',
    });
  }

  const completenessScore = calculateBatteryCompleteness(data);

  return {
    valid: errors.length === 0,
    category: 'battery',
    completenessScore,
    mandatoryFieldsComplete: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function validateCarbonFootprint(cf: CarbonFootprint, warnings: ValidationWarning[]) {
  if (cf.value <= 0) {
    warnings.push({
      field: 'carbonFootprint.value',
      code: 'CARBON_VALUE_SUSPICIOUS',
      message: 'Carbon footprint value seems too low. Please verify.',
    });
  }
  if (!cf.methodology) {
    warnings.push({
      field: 'carbonFootprint.methodology',
      code: 'CARBON_METHODOLOGY_MISSING',
      message: 'Carbon footprint methodology should be specified',
    });
  }
  if (cf.dataSource === 'lca_estimated' && !cf.thirdPartyVerified) {
    warnings.push({
      field: 'carbonFootprint',
      code: 'CARBON_NOT_VERIFIED',
      message: 'Estimated carbon footprint. Consider third-party verification.',
    });
  }
}

function validateCertification(cert: Certification, index: number, warnings: ValidationWarning[]) {
  const now = new Date();
  const validUntil = new Date(cert.validUntil);

  if (validUntil < now) {
    warnings.push({
      field: `certifications[${index}]`,
      code: 'CERT_EXPIRED',
      message: `Certification "${cert.type}" has expired`,
      recommendation: 'Renew certification or remove from DPP',
    });
  }

  if (!cert.verified) {
    warnings.push({
      field: `certifications[${index}]`,
      code: 'CERT_NOT_VERIFIED',
      message: `Certification "${cert.type}" has not been verified with issuing body`,
      recommendation: 'Verify certificate authenticity for stronger credibility',
    });
  }
}

function isValidCountryCode(code: string): boolean {
  // ISO 3166-1 alpha-2 codes (abbreviated list - expand as needed)
  const validCodes = [
    'AF', 'AL', 'DZ', 'AD', 'AO', 'AR', 'AM', 'AU', 'AT', 'AZ',
    'BD', 'BY', 'BE', 'BZ', 'BJ', 'BT', 'BO', 'BA', 'BW', 'BR', 'BG',
    'CA', 'CL', 'CN', 'CO', 'CR', 'HR', 'CU', 'CY', 'CZ',
    'DK', 'DO', 'EC', 'EG', 'SV', 'EE', 'ET', 'FI', 'FR',
    'DE', 'GH', 'GR', 'GT', 'HN', 'HK', 'HU',
    'IS', 'IN', 'ID', 'IR', 'IQ', 'IE', 'IL', 'IT',
    'JM', 'JP', 'JO', 'KZ', 'KE', 'KR', 'KW',
    'LV', 'LB', 'LT', 'LU', 'MY', 'MX', 'MA', 'MM', 'NL', 'NZ', 'NG', 'NO',
    'PK', 'PA', 'PY', 'PE', 'PH', 'PL', 'PT', 'QA', 'RO', 'RU',
    'SA', 'RS', 'SG', 'SK', 'SI', 'ZA', 'ES', 'LK', 'SE', 'CH',
    'TW', 'TH', 'TR', 'UA', 'AE', 'GB', 'US', 'UY', 'VE', 'VN', 'ZW',
  ];
  return validCodes.includes(code.toUpperCase());
}

// ============================================================================
// COMPLETENESS SCORE CALCULATIONS
// ============================================================================

function calculateTextileCompleteness(data: TextileDppData): number {
  let score = 0;
  const weights = {
    // Mandatory (60% total)
    fiberComposition: 15,
    countryOfManufacture: 10,
    manufacturer: 10,
    careInstructions: 15,
    hazardousSubstances: 10,
    // Recommended (40% total)
    carbonFootprint: 15,
    certifications: 10,
    recyclability: 8,
    durability: 7,
  };

  if (data.fiberComposition?.length > 0) score += weights.fiberComposition;
  if (data.countryOfManufacture) score += weights.countryOfManufacture;
  if (data.manufacturer?.name && data.manufacturer?.country) score += weights.manufacturer;
  if (data.careInstructions) score += weights.careInstructions;
  if (data.hazardousSubstances) score += weights.hazardousSubstances;
  if (data.carbonFootprint) score += weights.carbonFootprint;
  if (data.certifications?.length > 0) score += weights.certifications;
  if (data.recyclability) score += weights.recyclability;
  if (data.durability) score += weights.durability;

  return Math.min(100, score);
}

function calculateElectronicsCompleteness(data: ElectronicsDppData): number {
  let score = 0;
  if (data.manufacturer?.name) score += 10;
  if (data.repairability?.score) score += 20;
  if (data.repairability?.spareParts?.length) score += 15;
  if (data.compliance?.rohsCompliant !== undefined) score += 10;
  if (data.compliance?.weeeRegistrationNumber) score += 10;
  if (data.hazardousSubstances) score += 10;
  if (data.carbonFootprint) score += 10;
  if (data.softwareSupport) score += 8;
  if (data.energyEfficiency) score += 7;
  return Math.min(100, score);
}

function calculateFurnitureCompleteness(data: FurnitureDppData): number {
  let score = 0;
  if (data.manufacturer?.name) score += 10;
  if (data.billOfMaterials?.length > 0) score += 20;
  if (data.disassembly?.instructionsUrl) score += 15;
  if (data.durability?.testResult) score += 15;
  if (data.hazardousSubstances) score += 15;
  if (data.carbonFootprint) score += 10;
  if (data.repairability) score += 8;
  if (data.recyclability) score += 7;
  return Math.min(100, score);
}

function calculateBatteryCompleteness(data: BatteryDppData): number {
  let score = 0;
  if (data.manufacturer?.name) score += 8;
  if (data.batteryIdentification) score += 12;
  if (data.composition) score += 15;
  if (data.recycledContent) score += 15;
  if (data.carbonFootprint) score += 15;
  if (data.performance) score += 12;
  if (data.dueDiligence) score += 10;
  if (data.safetyInfo) score += 8;
  if (data.endOfLife) score += 5;
  return Math.min(100, score);
}

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

export function canIssueVC(validationResult: ValidationResult): boolean {
  return validationResult.valid && validationResult.mandatoryFieldsComplete;
}

export function getValidationSummary(result: ValidationResult): string {
  if (result.valid) {
    return `✓ DPP data is complete (${result.completenessScore}% completeness). Ready to issue Verifiable Credential.`;
  }
  return `✗ Cannot issue VC: ${result.errors.length} mandatory field(s) missing. ${result.warnings.length} recommendation(s).`;
}
