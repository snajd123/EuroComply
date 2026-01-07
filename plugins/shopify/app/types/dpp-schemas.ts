/**
 * Digital Product Passport Schemas
 *
 * Category-specific data structures aligned with EU ESPR requirements.
 * These schemas define the mandatory and optional fields for each product category.
 */

// ============================================================================
// COMMON TYPES
// ============================================================================

export type ProductCategory = 'textile' | 'electronics' | 'furniture' | 'battery' | 'other';

export type DataSource =
  | 'manual'           // Entered by merchant
  | 'shopify_sync'     // Pulled from Shopify metafields
  | 'supplier_import'  // Imported from supplier CSV/API
  | 'higg_calculated'  // Calculated from Higg Index
  | 'lca_estimated'    // Estimated from LCA formulas
  | 'third_party_verified'; // Verified by certification body

export type DataConfidence =
  | 'self_declared'    // Merchant self-declaration
  | 'estimated'        // Calculated/estimated
  | 'supplier_declared'// From supplier (not independently verified)
  | 'third_party_verified' // Certified by recognized body
  | 'audited';         // Independently audited

export interface Certification {
  type: string;              // e.g., "GOTS", "OEKO-TEX", "GRS"
  certificateNumber: string;
  issuingBody: string;
  validFrom: string;         // ISO date
  validUntil: string;        // ISO date
  scope?: string;            // What the cert covers
  documentUrl?: string;      // Link to certificate PDF
  verified?: boolean;        // Whether we've verified with issuing body
  verifiedAt?: string;       // When verification was performed
}

export interface ManufacturerInfo {
  name: string;
  country: string;           // ISO 3166-1 alpha-2
  address?: string;
  registrationNumber?: string; // Company/VAT registration
  website?: string;
  did?: string;              // Decentralized Identifier (if available)
}

export interface CarbonFootprint {
  value: number;
  unit: 'kgCO2e';
  methodology: 'PEF' | 'ISO14067' | 'GHG_Protocol' | 'Higg_MSI' | 'other';
  methodologyDetail?: string;
  scope: 'cradle_to_gate' | 'cradle_to_grave' | 'gate_to_gate';
  dataSource: DataSource;
  confidence: DataConfidence;
  calculatedAt?: string;     // When calculation was performed
  thirdPartyVerified?: boolean;
  verificationBody?: string;
}

// ============================================================================
// TEXTILE-SPECIFIC SCHEMA (EU Textiles Regulation 2027)
// ============================================================================

export interface FiberComposition {
  fiberType: FiberType;
  percentage: number;        // % by mass (must sum to 100)
  origin: FiberOrigin;
  certificationId?: string;  // Reference to certification
  supplierName?: string;
  countryOfOrigin?: string;  // ISO 3166-1 alpha-2
}

export type FiberType =
  // Natural fibers
  | 'cotton'
  | 'organic_cotton'
  | 'linen'
  | 'hemp'
  | 'wool'
  | 'silk'
  | 'cashmere'
  | 'bamboo'
  | 'jute'
  // Synthetic fibers
  | 'polyester'
  | 'recycled_polyester'
  | 'nylon'
  | 'recycled_nylon'
  | 'acrylic'
  | 'elastane'
  | 'spandex'
  | 'viscose'
  | 'modal'
  | 'lyocell'
  | 'tencel'
  // Blends and other
  | 'other';

export type FiberOrigin =
  | 'conventional'
  | 'organic'
  | 'recycled_pre_consumer'
  | 'recycled_post_consumer'
  | 'bio_based'
  | 'unknown';

export interface CareInstructions {
  maxWashTemperature: number | null;  // Celsius, null = do not wash
  bleachAllowed: boolean;
  tumbleDryAllowed: boolean;
  ironTemperature: 'none' | 'low' | 'medium' | 'high';
  dryCleanAllowed: boolean;
  dryCleanSolvent?: string;           // e.g., "P" for perchloroethylene
  specialInstructions?: string;

  // Durability test results (EU requirement)
  washingDurability?: {
    testStandard: string;             // e.g., "ISO 6330"
    cyclesCompleted: number;
    result: 'pass' | 'fail';
  };
}

export interface HazardousSubstances {
  reachCompliant: boolean;
  substancesOfConcern: SubstanceOfConcern[];
  scipNotificationId?: string;        // ECHA SCIP database ID
}

export interface SubstanceOfConcern {
  name: string;
  casNumber?: string;                  // CAS Registry Number
  concentration?: number;              // % by weight
  location: string;                    // Where in product (e.g., "dye", "coating")
  safeUseInstructions?: string;
}

export interface Recyclability {
  recyclablePercentage: number;        // 0-100
  recyclableComponents: string[];
  nonRecyclableComponents?: string[];
  endOfLifeInstructions: string;
  takeBackProgram?: {
    available: boolean;
    url?: string;
    provider?: string;
  };
}

export interface SupplyChainEntry {
  tier: 1 | 2 | 3 | 4;
  role: 'manufacturer' | 'fabric_mill' | 'dye_house' | 'spinner' | 'farm' | 'other';
  name: string;
  country: string;
  certifications?: string[];
  did?: string;                        // Supplier's DID for VC verification
}

/**
 * Complete Textile DPP Data Schema
 * Aligned with EU Textiles Regulation (expected 2027)
 */
export interface TextileDppData {
  // ─────────────────────────────────────────────────────────────
  // MANDATORY FIELDS (2027 "Minimal DPP")
  // ─────────────────────────────────────────────────────────────

  /** Product category - always 'textile' for this schema */
  category: 'textile';

  /** Fiber composition by mass percentage - MUST sum to 100% */
  fiberComposition: FiberComposition[];

  /** Country where the product was manufactured */
  countryOfManufacture: string;        // ISO 3166-1 alpha-2

  /** Manufacturer identification */
  manufacturer: ManufacturerInfo;

  /** Care and maintenance instructions */
  careInstructions: CareInstructions;

  /** Hazardous substances declaration */
  hazardousSubstances: HazardousSubstances;

  /** EU size labeling */
  sizeInfo?: {
    sizeSystem: 'EU' | 'UK' | 'US' | 'other';
    sizeValue: string;
  };

  // ─────────────────────────────────────────────────────────────
  // RECOMMENDED FIELDS (Strengthen VC credibility)
  // ─────────────────────────────────────────────────────────────

  /** Carbon footprint of the product */
  carbonFootprint?: CarbonFootprint;

  /** Recyclability information */
  recyclability?: Recyclability;

  /** Third-party certifications */
  certifications?: Certification[];

  /** Product durability information */
  durability?: {
    expectedLifespanYears: number;
    expectedWearCycles?: number;
    warrantyYears?: number;
  };

  /** Water footprint */
  waterFootprint?: {
    value: number;
    unit: 'liters';
    scope: 'production' | 'full_lifecycle';
    dataSource: DataSource;
  };

  // ─────────────────────────────────────────────────────────────
  // ADVANCED FIELDS (2030+ "Full Circular DPP")
  // ─────────────────────────────────────────────────────────────

  /** Supply chain traceability */
  supplyChain?: SupplyChainEntry[];

  /** Social compliance information */
  socialCompliance?: {
    fairTradeCompliant?: boolean;
    livingWageCompliant?: boolean;
    noChildLabor: boolean;
    auditStandard?: string;            // e.g., "SA8000", "BSCI"
    lastAuditDate?: string;
  };

  /** Repair and reuse information */
  circularityInfo?: {
    repairInstructionsUrl?: string;
    resaleRecommendations?: string;
    donationPartners?: string[];
  };
}

// ============================================================================
// ELECTRONICS SCHEMA (EU ESPR 2030)
// ============================================================================

export interface ElectronicsDppData {
  category: 'electronics';

  // MANDATORY
  manufacturer: ManufacturerInfo;

  repairability: {
    score: number;                     // 1-10 (EU standard)
    spareParts: {
      name: string;
      available: boolean;
      availabilityYears: number;
      maxDeliveryDays: number;
      estimatedPrice?: number;
      currency?: string;
    }[];
    repairManualUrl?: string;
    repairDifficulty: 'easy' | 'moderate' | 'difficult' | 'professional_only';
  };

  compliance: {
    rohsCompliant: boolean;
    rohsExemptions?: string[];
    weeeRegistrationNumber: string;
    weeeCategory: string;
  };

  hazardousSubstances: {
    containsSvhc: boolean;
    svhcList?: {
      name: string;
      casNumber: string;
      concentration: number;
      location: string;
    }[];
    reachCompliant: boolean;
  };

  // Battery info (if applicable)
  battery?: {
    type: 'lithium_ion' | 'lithium_polymer' | 'nimh' | 'other';
    capacity: number;
    capacityUnit: 'mAh' | 'Wh';
    removable: boolean;
    replacementAvailable: boolean;
    recycledContent?: number;          // %
  };

  // RECOMMENDED
  carbonFootprint?: CarbonFootprint;

  energyEfficiency?: {
    class: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
    annualConsumption: number;
    consumptionUnit: 'kWh' | 'W';
  };

  softwareSupport?: {
    securityUpdatesYears: number;
    functionalUpdatesYears: number;
    osCompatibility: string[];
    endOfSupportDate?: string;
  };

  durability?: {
    expectedLifespanYears: number;
    warrantyYears: number;
    ipRating?: string;                 // e.g., "IP68"
  };

  certifications?: Certification[];
}

// ============================================================================
// FURNITURE SCHEMA (EU ESPR 2029)
// ============================================================================

export interface FurnitureDppData {
  category: 'furniture';

  // MANDATORY
  manufacturer: ManufacturerInfo;

  billOfMaterials: {
    component: string;
    material: string;
    percentage: number;                // % by weight
    recycledContent?: number;          // %
    certifications?: string[];
  }[];

  disassembly: {
    instructionsUrl: string;
    toolsRequired: string[];
    estimatedTime: number;             // minutes
    difficulty: 'easy' | 'moderate' | 'difficult';
  };

  durability: {
    testStandard: string;              // e.g., "EN 12520" for seating
    testResult: 'pass' | 'fail';
    expectedLifespanYears: number;
    warrantyYears: number;
  };

  hazardousSubstances: {
    formaldehydeEmission?: {
      value: number;
      unit: 'mg/m³';
      class: 'E0' | 'E1' | 'E2' | 'other';
    };
    vocEmission?: {
      value: number;
      unit: 'µg/m³';
    };
    flameRetardants?: {
      used: boolean;
      types?: string[];
    };
    reachCompliant: boolean;
  };

  // RECOMMENDED
  carbonFootprint?: CarbonFootprint;

  repairability?: {
    spareParts: {
      name: string;
      available: boolean;
      estimatedPrice?: number;
      currency?: string;
    }[];
    reupholsteryPossible?: boolean;
    repairGuideUrl?: string;
  };

  recyclability?: {
    recyclablePercentage: number;
    separationEase: 'easy' | 'moderate' | 'difficult';
    specialHandling?: string[];
  };

  certifications?: Certification[];
}

// ============================================================================
// BATTERY SCHEMA (EU Battery Regulation 2027)
// ============================================================================

export interface BatteryDppData {
  category: 'battery';

  // MANDATORY
  manufacturer: ManufacturerInfo;

  batteryIdentification: {
    type: 'portable' | 'industrial' | 'ev' | 'lmt';  // Light Means of Transport
    chemistry: 'lithium_ion' | 'lithium_polymer' | 'lfp' | 'nmc' | 'nca' | 'other';
    chemistryDetail?: string;
    capacity: number;
    capacityUnit: 'Ah' | 'Wh';
    voltage: number;
  };

  composition: {
    cobalt?: number;                   // % by weight
    lithium?: number;
    nickel?: number;
    lead?: number;
    cadmium?: number;
    otherMaterials?: { name: string; percentage: number }[];
  };

  recycledContent: {
    cobalt: number;                    // %
    lithium: number;
    nickel: number;
    lead: number;
    overall: number;
  };

  // MANDATORY for industrial/EV batteries
  carbonFootprint: CarbonFootprint;

  performance: {
    energyDensity: number;             // Wh/kg
    cycleLife: number;                 // Number of charge cycles
    efficiencyPercent: number;
    capacityFade?: {                   // Capacity retention at X cycles
      cycles: number;
      retentionPercent: number;
    }[];
  };

  dueDiligence: {
    supplyChainPolicy: boolean;
    conflictMineralsCompliant: boolean;
    responsibleSourcingStandard?: string;
    thirdPartyAudit?: {
      auditor: string;
      date: string;
      result: 'compliant' | 'non_compliant' | 'conditional';
    };
  };

  safetyInfo: {
    unNumber?: string;                 // UN transport classification
    safetyDataSheetUrl: string;
    handlingInstructions: string;
    storageRequirements: string;
  };

  endOfLife: {
    collectionInstructions: string;
    recyclingEfficiencyTarget: number; // %
    producerResponsibilityOrg?: string;
  };

  certifications?: Certification[];
}

// ============================================================================
// UNION TYPE FOR ALL DPP SCHEMAS
// ============================================================================

export type DppData =
  | TextileDppData
  | ElectronicsDppData
  | FurnitureDppData
  | BatteryDppData;

// ============================================================================
// VALIDATION RESULT TYPE
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  category: ProductCategory;
  completenessScore: number;           // 0-100%
  mandatoryFieldsComplete: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  recommendation?: string;
}
