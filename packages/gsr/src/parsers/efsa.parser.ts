// packages/gsr/src/parsers/efsa.parser.ts
import { sanitizeCas } from '../utils/cas-sanitizer.js';

/**
 * Parsed E-number entry from EFSA food additives list.
 */
export interface ParsedENumber {
  /** Original E-number as it appears in source (e.g., "E 211", "E 160a(ii)", "E 210-213") */
  eNumber: string;
  /** Normalized E-number (uppercase, no spaces: "E211", "E160A(II)", "E210-213") */
  eNumberNormalized: string;
  /** Whether this represents a group/range of E-numbers */
  isGroup: boolean;
  /** Substance name */
  name: string;
}

/**
 * Raw row format from OpenFoodTox database.
 */
export interface OpenFoodToxRow {
  'Reference': string;
  'Substance name': string;
  'CAS number': string;
  'EC number': string;
  'Functional class': string;
  'ADI': string;
}

/**
 * Parsed entry from OpenFoodTox assessment data.
 */
export interface ParsedOpenFoodToxEntry {
  /** EFSA reference number */
  efsaRef: string;
  /** Substance name */
  name: string;
  /** CAS number or null if not available */
  casNumber: string | null;
  /** EC number or null if not available */
  ecNumber: string | null;
  /** Functional class (Preservative, Sweetener, Colour, etc.) */
  functionalClass: string;
  /** Acceptable Daily Intake numeric value or null */
  adiValue: number | null;
  /** ADI unit (typically "mg/kg bw/day") or null */
  adiUnit: string | null;
  /** ADI note ("not specified", "not limited", "Group ADI", etc.) or null */
  adiNote: string | null;
}

/**
 * Patterns that indicate non-values (placeholders).
 */
const NO_VALUE_PATTERNS = [
  /^-$/,
  /^$/,
  /^n\/?a$/i,
  /^not\s*(available|applicable)$/i,
];

/**
 * Checks if a value represents "no value" (placeholder).
 */
function isNoValue(value: string | undefined | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  return NO_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Cleans an EC number, returning null if invalid or placeholder.
 */
function cleanEcNumber(value: string | undefined | null): string | null {
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
 * Normalizes an E-number string to canonical format.
 *
 * - Removes spaces between "E" and digits
 * - Converts to uppercase
 * - Normalizes suffixes (e.g., "E 160a(ii)" -> "E160A(II)")
 * - Normalizes ranges (e.g., "E 210 - 213" -> "E210-213")
 *
 * @param raw - Raw E-number string
 * @returns Normalized E-number or empty string if invalid
 */
export function normalizeENumber(raw: string | null | undefined): string {
  if (!raw) return '';

  // Step 1: Remove all spaces, convert to uppercase
  let normalized = raw.trim().toUpperCase();

  // Step 2: Handle range notation (e.g., "E 210 - 213" or "E210-213")
  // First, check if there's a range pattern
  const rangeMatch = normalized.match(/^E\s*(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    return `E${rangeMatch[1]}-${rangeMatch[2]}`;
  }

  // Step 3: Handle suffix notation (e.g., "E 160a(ii)" or "E 160 A (II)")
  // Pattern: E + digits + optional letter suffix + optional parenthesized roman numerals
  const suffixMatch = normalized.match(/^E\s*(\d+)\s*([A-Z])?\s*(\([IVX]+\))?$/i);
  if (suffixMatch) {
    const num = suffixMatch[1];
    const letter = suffixMatch[2] || '';
    const roman = suffixMatch[3] || '';
    return `E${num}${letter}${roman}`;
  }

  // Step 4: Simple E-number (just E + digits)
  const simpleMatch = normalized.match(/^E\s*(\d+)$/);
  if (simpleMatch) {
    return `E${simpleMatch[1]}`;
  }

  // Fallback: just remove all spaces and uppercase
  return normalized.replace(/\s+/g, '');
}

/**
 * Parses a tab-separated E-number line.
 *
 * Expected format: `E-number\tIsGroup\tName`
 * Examples:
 * - "E 211\tNo\tSodium benzoate"
 * - "E 210-213\tYes\tBenzoates"
 *
 * @param line - Tab-separated line
 * @returns Parsed E-number entry or null if line is invalid
 */
export function parseENumberLine(line: string): ParsedENumber | null {
  if (!line || !line.trim()) return null;

  const parts = line.split('\t');

  // Need at least 3 columns: E-number, IsGroup, Name
  if (parts.length < 3) return null;

  const eNumber = parts[0]?.trim();
  const isGroupField = parts[1]?.trim().toLowerCase();
  const name = parts[2]?.trim();

  // E-number is required
  if (!eNumber || !eNumber.match(/^[eE]\s*\d/)) return null;

  // Name is required
  if (!name) return null;

  // Normalize the E-number
  const eNumberNormalized = normalizeENumber(eNumber);

  // Determine if this is a group:
  // 1. If the IsGroup field says "yes"
  // 2. If the E-number contains a range (dash between digits)
  const isGroupFromField = isGroupField === 'yes';
  const isGroupFromRange = /-\d+$/.test(eNumberNormalized);
  const isGroup = isGroupFromField || isGroupFromRange;

  return {
    eNumber,
    eNumberNormalized,
    isGroup,
    name,
  };
}

/**
 * Parses ADI (Acceptable Daily Intake) string.
 *
 * Handles formats:
 * - "5 mg/kg bw/day" -> { value: 5, unit: "mg/kg bw/day", note: null }
 * - "0.5 mg/kg bw/day" -> { value: 0.5, unit: "mg/kg bw/day", note: null }
 * - "0-5 mg/kg bw/day" -> { value: 5, unit: "mg/kg bw/day", note: null } (takes upper bound)
 * - "5 mg/kg bw/day (Group ADI)" -> { value: 5, unit: "mg/kg bw/day", note: "Group ADI" }
 * - "not specified" -> { value: null, unit: null, note: "not specified" }
 * - "not limited" -> { value: null, unit: null, note: "not limited" }
 * - "acceptable" -> { value: null, unit: null, note: "acceptable" }
 *
 * @param raw - Raw ADI string
 * @returns Parsed ADI components
 */
function parseAdi(raw: string | undefined | null): {
  value: number | null;
  unit: string | null;
  note: string | null;
} {
  if (!raw || !raw.trim()) {
    return { value: null, unit: null, note: null };
  }

  const trimmed = raw.trim();

  // Check for special notes (non-numeric ADI values)
  const specialNotes = [
    /^not\s+specified$/i,
    /^not\s+limited$/i,
    /^acceptable$/i,
    /^n\/?a$/i,
  ];

  for (const pattern of specialNotes) {
    if (pattern.test(trimmed)) {
      return { value: null, unit: null, note: trimmed };
    }
  }

  // Try to extract numeric value and unit
  // Pattern for: "5 mg/kg bw/day" or "0.5 mg/kg bw/day" or "50 ug/kg bw/day"
  // Also handles ranges: "0-5 mg/kg bw/day" (takes upper bound)
  // Also handles notes in parentheses: "5 mg/kg bw/day (Group ADI)"

  // First, check for note in parentheses
  let note: string | null = null;
  let valueString = trimmed;
  const noteMatch = trimmed.match(/\(([^)]+)\)/);
  if (noteMatch) {
    note = noteMatch[1] || null;
    valueString = trimmed.replace(/\([^)]+\)/, '').trim();
  }

  // Pattern for numeric value followed by unit
  // Handles: "5 mg/kg bw/day", "0.5 mg/kg bw/day", "0-5 mg/kg bw/day"
  // Also handles micro symbol: "50 \u03bcg/kg bw/day"
  const numericMatch = valueString.match(/^(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*(.+)$/);

  if (numericMatch) {
    let valueStr = numericMatch[1]!;
    const unit = numericMatch[2]!.trim();

    // If it's a range (e.g., "0-5"), take the upper bound
    if (valueStr.includes('-')) {
      const rangeParts = valueStr.split('-');
      valueStr = rangeParts[rangeParts.length - 1]!.trim();
    }

    const value = parseFloat(valueStr);
    if (!isNaN(value)) {
      return { value, unit, note };
    }
  }

  // If we couldn't parse a numeric value but have content, treat as note
  return { value: null, unit: null, note: trimmed };
}

/**
 * Parses an OpenFoodTox row.
 *
 * @param row - Raw row from OpenFoodTox data
 * @returns Parsed entry or null if row is invalid
 */
export function parseOpenFoodToxRow(row: OpenFoodToxRow): ParsedOpenFoodToxEntry | null {
  const efsaRef = row['Reference']?.trim();
  if (!efsaRef) return null;

  const name = row['Substance name']?.trim();
  if (!name) return null;

  const functionalClass = row['Functional class']?.trim();
  if (!functionalClass) return null;

  // Sanitize CAS number (returns null if invalid or N/A)
  const casNumber = sanitizeCas(row['CAS number']);

  // Clean EC number
  const ecNumber = cleanEcNumber(row['EC number']);

  // Parse ADI
  const { value: adiValue, unit: adiUnit, note: adiNote } = parseAdi(row['ADI']);

  return {
    efsaRef,
    name,
    casNumber,
    ecNumber,
    functionalClass,
    adiValue,
    adiUnit,
    adiNote,
  };
}
