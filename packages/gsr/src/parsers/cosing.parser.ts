// packages/gsr/src/parsers/cosing.parser.ts
import { sanitizeCas } from '../utils/cas-sanitizer.js';
import { normalizeName } from '../utils/name-normalizer.js';
import { CosmeticRestrictionType } from '../entities/SubstanceCosing.js';

/**
 * Raw row format from CosIng Annex II (Prohibited substances).
 */
export interface CosingAnnexIIRow {
  'Reference Number': string;
  'Chemical name / INN': string;
  'CAS Number': string;
  'EC Number': string;
  'Regulation': string;
  'CMR': string;
  'SCCS opinions': string;
  'Identified INGREDIENTS': string;
}

/**
 * Raw row format from CosIng Annex III (Restricted substances).
 */
export interface CosingAnnexIIIRow {
  'Reference Number': string;
  'Chemical name / INN': string;
  'Name of Common Ingredients Glossary': string;
  'CAS Number': string;
  'EC Number': string;
  'Product Type, body parts': string;
  'Maximum concentration in ready for use preparation': string;
  'Wording of conditions of use and warnings': string;
}

/**
 * Raw row format from CosIng Annex IV (Permitted colorants).
 */
export interface CosingAnnexIVRow {
  'Reference Number': string;
  'Chemical name / INN': string;
  'Name of Common Ingredients Glossary': string;
  'CAS Number': string;
  'EC Number': string;
  'Colour': string;
  'Product Type, body parts': string;
  'Maximum concentration in ready for use preparation': string;
  'Wording of conditions of use and warnings': string;
}

/**
 * Raw row format from CosIng Annex V (Permitted preservatives).
 */
export interface CosingAnnexVRow {
  'Reference Number': string;
  'Chemical name / INN': string;
  'Name of Common Ingredients Glossary': string;
  'CAS Number': string;
  'EC Number': string;
  'Product Type, body parts': string;
  'Maximum concentration in ready for use preparation': string;
  'Wording of conditions of use and warnings': string;
}

/**
 * Raw row format from CosIng Annex VI (Permitted UV filters).
 */
export interface CosingAnnexVIRow {
  'Reference Number': string;
  'Chemical name / INN': string;
  'Name of Common Ingredients Glossary': string;
  'CAS Number': string;
  'EC Number': string;
  'Product Type, body parts': string;
  'Maximum concentration in ready for use preparation': string;
  'Wording of conditions of use and warnings': string;
}

/**
 * Parsed entry from any CosIng annex.
 */
export interface ParsedCosingEntry {
  /** Reference in format "{annex}-{refNumber}" e.g., "II-1", "III-15" */
  cosingRef: string;
  /** INCI name (UPPERCASE) */
  inciName: string;
  /** Normalized INCI name (lowercase) for search */
  inciNameNormalized: string;
  /** CAS number or null if not available */
  casNumber: string | null;
  /** EC number or null if not available */
  ecNumber: string | null;
  /** Type of cosmetic restriction (which annex) */
  restrictionType: CosmeticRestrictionType;
  /** Human-readable restriction text */
  restrictionText: string | null;
  /** Maximum allowed concentration */
  maxConcentration: number | null;
  /** Unit for concentration (%, ppm, mg/kg) */
  concentrationUnit: string | null;
  /** Whether substance is classified as CMR (carcinogenic, mutagenic, reprotoxic) */
  isCmr: boolean;
  /** SCCS opinions if available */
  sccsOpinions: string[] | null;
}

/**
 * Patterns for values that indicate "no value" (not an error).
 */
const NO_VALUE_PATTERNS = [/^-$/, /^$/, /^n\/?a$/i, /^not\s*(available|applicable)$/i];

/**
 * Checks if a value represents "no value" (placeholder).
 */
function isNoValue(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  return NO_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Cleans an EC number, returning null if invalid or placeholder.
 */
function cleanEcNumber(value: string | undefined): string | null {
  if (isNoValue(value)) return null;
  const trimmed = value!.trim();
  // EC numbers should match pattern like 200-001-8
  if (!/^\d{3}-\d{3}-\d$/i.test(trimmed)) {
    // Return as-is if doesn't match exact pattern but isn't a placeholder
    return trimmed;
  }
  return trimmed;
}

/**
 * Extracts the first INCI name from a semicolon-separated list.
 */
function extractFirstInciName(value: string | undefined): string | null {
  if (isNoValue(value)) return null;
  const trimmed = value!.trim();
  // Split on semicolon and take first
  const parts = trimmed.split(';');
  return parts[0]?.trim() || null;
}

/**
 * Parses concentration strings like "0.5%", "5 %", "500 ppm", "100 mg/kg".
 * Returns { value, unit } or { value: null, unit: null } if not parseable.
 */
function parseConcentration(value: string | undefined): { value: number | null; unit: string | null } {
  if (isNoValue(value)) return { value: null, unit: null };

  const trimmed = value!.trim();

  // Pattern: number followed by optional space and unit (%, ppm, mg/kg, etc.)
  const match = trimmed.match(/^([\d.]+)\s*(%)$/i);
  if (match) {
    const num = parseFloat(match[1]!);
    if (!isNaN(num)) {
      return { value: num, unit: '%' };
    }
  }

  // Pattern: number ppm
  const ppmMatch = trimmed.match(/^([\d.]+)\s*ppm$/i);
  if (ppmMatch) {
    const num = parseFloat(ppmMatch[1]!);
    if (!isNaN(num)) {
      return { value: num, unit: 'ppm' };
    }
  }

  // Pattern: number mg/kg
  const mgkgMatch = trimmed.match(/^([\d.]+)\s*mg\/kg$/i);
  if (mgkgMatch) {
    const num = parseFloat(mgkgMatch[1]!);
    if (!isNaN(num)) {
      return { value: num, unit: 'mg/kg' };
    }
  }

  return { value: null, unit: null };
}

/**
 * Parses SCCS opinions from a semicolon-separated string.
 */
function parseSccsOpinions(value: string | undefined): string[] | null {
  if (isNoValue(value)) return null;

  const trimmed = value!.trim();
  const opinions = trimmed.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
  return opinions.length > 0 ? opinions : null;
}

/**
 * Parses a CosIng Annex II row (Prohibited substances).
 *
 * @param row - Raw row from Annex II
 * @returns Parsed entry or null if row is invalid
 */
export function parseCosingAnnexII(row: CosingAnnexIIRow): ParsedCosingEntry | null {
  const refNumber = row['Reference Number']?.trim();
  if (!refNumber) return null;

  // Get INCI name: prefer 'Identified INGREDIENTS', fallback to 'Chemical name / INN'
  let inciName = extractFirstInciName(row['Identified INGREDIENTS']);
  if (!inciName) {
    const chemName = row['Chemical name / INN']?.trim();
    if (chemName) {
      inciName = chemName.toUpperCase();
    }
  }
  if (!inciName) return null;

  const inciNameNormalized = normalizeName(inciName);

  // CAS number
  const casNumber = sanitizeCas(row['CAS Number']);

  // EC number
  const ecNumber = cleanEcNumber(row['EC Number']);

  // CMR status
  const isCmr = row['CMR']?.trim().toUpperCase() === 'CMR';

  // SCCS opinions
  const sccsOpinions = parseSccsOpinions(row['SCCS opinions']);

  return {
    cosingRef: `II-${refNumber}`,
    inciName,
    inciNameNormalized,
    casNumber,
    ecNumber,
    restrictionType: CosmeticRestrictionType.ANNEX_II,
    restrictionText: null, // Annex II = prohibited, no conditional text
    maxConcentration: null,
    concentrationUnit: null,
    isCmr,
    sccsOpinions,
  };
}

/**
 * Parses a CosIng Annex III row (Restricted substances).
 *
 * @param row - Raw row from Annex III
 * @returns Parsed entry or null if row is invalid
 */
export function parseCosingAnnexIII(row: CosingAnnexIIIRow): ParsedCosingEntry | null {
  const refNumber = row['Reference Number']?.trim();
  if (!refNumber) return null;

  // Get INCI name from glossary, fallback to chemical name
  let inciName = extractFirstInciName(row['Name of Common Ingredients Glossary']);
  if (!inciName) {
    const chemName = row['Chemical name / INN']?.trim();
    if (chemName) {
      inciName = chemName.toUpperCase();
    }
  }
  if (!inciName) return null;

  const inciNameNormalized = normalizeName(inciName);

  // CAS number
  const casNumber = sanitizeCas(row['CAS Number']);

  // EC number
  const ecNumber = cleanEcNumber(row['EC Number']);

  // Concentration
  const concentration = parseConcentration(row['Maximum concentration in ready for use preparation']);

  // Restriction text (warnings + conditions)
  const warningsText = row['Wording of conditions of use and warnings']?.trim() || null;

  // If concentration couldn't be parsed but there's text, use the concentration field as restriction text
  let restrictionText = warningsText;
  if (concentration.value === null && row['Maximum concentration in ready for use preparation']?.trim()) {
    restrictionText = row['Maximum concentration in ready for use preparation'].trim();
  }

  return {
    cosingRef: `III-${refNumber}`,
    inciName,
    inciNameNormalized,
    casNumber,
    ecNumber,
    restrictionType: CosmeticRestrictionType.ANNEX_III,
    restrictionText,
    maxConcentration: concentration.value,
    concentrationUnit: concentration.unit,
    isCmr: false, // Annex III doesn't have CMR field
    sccsOpinions: null,
  };
}

/**
 * Parses a CosIng Annex IV row (Permitted colorants).
 *
 * @param row - Raw row from Annex IV
 * @returns Parsed entry or null if row is invalid
 */
export function parseCosingAnnexIV(row: CosingAnnexIVRow): ParsedCosingEntry | null {
  const refNumber = row['Reference Number']?.trim();
  if (!refNumber) return null;

  // Get INCI name from glossary, fallback to chemical name
  let inciName = extractFirstInciName(row['Name of Common Ingredients Glossary']);
  if (!inciName) {
    const chemName = row['Chemical name / INN']?.trim();
    if (chemName) {
      inciName = chemName.toUpperCase();
    }
  }
  if (!inciName) return null;

  const inciNameNormalized = normalizeName(inciName);

  // CAS number
  const casNumber = sanitizeCas(row['CAS Number']);

  // EC number
  const ecNumber = cleanEcNumber(row['EC Number']);

  // Concentration
  const concentration = parseConcentration(row['Maximum concentration in ready for use preparation']);

  // Restriction text (warnings)
  const restrictionText = row['Wording of conditions of use and warnings']?.trim() || null;

  return {
    cosingRef: `IV-${refNumber}`,
    inciName,
    inciNameNormalized,
    casNumber,
    ecNumber,
    restrictionType: CosmeticRestrictionType.ANNEX_IV,
    restrictionText,
    maxConcentration: concentration.value,
    concentrationUnit: concentration.unit,
    isCmr: false,
    sccsOpinions: null,
  };
}

/**
 * Parses a CosIng Annex V row (Permitted preservatives).
 *
 * @param row - Raw row from Annex V
 * @returns Parsed entry or null if row is invalid
 */
export function parseCosingAnnexV(row: CosingAnnexVRow): ParsedCosingEntry | null {
  const refNumber = row['Reference Number']?.trim();
  if (!refNumber) return null;

  // Get INCI name from glossary, fallback to chemical name
  let inciName = extractFirstInciName(row['Name of Common Ingredients Glossary']);
  if (!inciName) {
    const chemName = row['Chemical name / INN']?.trim();
    if (chemName) {
      inciName = chemName.toUpperCase();
    }
  }
  if (!inciName) return null;

  const inciNameNormalized = normalizeName(inciName);

  // CAS number
  const casNumber = sanitizeCas(row['CAS Number']);

  // EC number
  const ecNumber = cleanEcNumber(row['EC Number']);

  // Concentration
  const concentration = parseConcentration(row['Maximum concentration in ready for use preparation']);

  // Restriction text (warnings)
  const restrictionText = row['Wording of conditions of use and warnings']?.trim() || null;

  return {
    cosingRef: `V-${refNumber}`,
    inciName,
    inciNameNormalized,
    casNumber,
    ecNumber,
    restrictionType: CosmeticRestrictionType.ANNEX_V,
    restrictionText,
    maxConcentration: concentration.value,
    concentrationUnit: concentration.unit,
    isCmr: false,
    sccsOpinions: null,
  };
}

/**
 * Parses a CosIng Annex VI row (Permitted UV filters).
 *
 * @param row - Raw row from Annex VI
 * @returns Parsed entry or null if row is invalid
 */
export function parseCosingAnnexVI(row: CosingAnnexVIRow): ParsedCosingEntry | null {
  const refNumber = row['Reference Number']?.trim();
  if (!refNumber) return null;

  // Get INCI name from glossary, fallback to chemical name
  let inciName = extractFirstInciName(row['Name of Common Ingredients Glossary']);
  if (!inciName) {
    const chemName = row['Chemical name / INN']?.trim();
    if (chemName) {
      inciName = chemName.toUpperCase();
    }
  }
  if (!inciName) return null;

  const inciNameNormalized = normalizeName(inciName);

  // CAS number
  const casNumber = sanitizeCas(row['CAS Number']);

  // EC number
  const ecNumber = cleanEcNumber(row['EC Number']);

  // Concentration
  const concentration = parseConcentration(row['Maximum concentration in ready for use preparation']);

  // Restriction text (warnings)
  const restrictionText = row['Wording of conditions of use and warnings']?.trim() || null;

  return {
    cosingRef: `VI-${refNumber}`,
    inciName,
    inciNameNormalized,
    casNumber,
    ecNumber,
    restrictionType: CosmeticRestrictionType.ANNEX_VI,
    restrictionText,
    maxConcentration: concentration.value,
    concentrationUnit: concentration.unit,
    isCmr: false,
    sccsOpinions: null,
  };
}
