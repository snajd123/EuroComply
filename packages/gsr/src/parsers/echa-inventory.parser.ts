// packages/gsr/src/parsers/echa-inventory.parser.ts
import { parse } from 'csv-parse/sync';
import { sanitizeCas } from '../utils/cas-sanitizer.js';

export interface EchaInventoryRecord {
  ecNumber: string;
  primaryName: string;
  casNumber?: string;
  molecularFormula?: string;
  description?: string;
}

export interface EchaRawRow {
  'EC Number': string;
  'EC Name': string;
  'CAS Number'?: string;
  'Molecular formula'?: string;
  'Description'?: string;
}

/**
 * Patterns that indicate no CAS number is available (not an error)
 */
const NO_CAS_PATTERNS = [
  /^-$/,
  /^$/,
  /^n\/?a$/i,
  /^not\s*(available|applicable)$/i,
];

/**
 * Checks if a CAS value indicates "no CAS number" (as opposed to an invalid CAS)
 */
function isNoCasValue(cas: string | undefined): boolean {
  if (!cas) return true;
  const trimmed = cas.trim();
  return NO_CAS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Parser for ECHA EC Inventory CSV files.
 *
 * The EC Inventory contains substance identifiers from the European Chemicals Agency.
 * Each record contains an EC number (EINECS/ELINCS/NLP), primary name, optional CAS number,
 * molecular formula, and description.
 */
export class EchaInventoryParser {
  /**
   * Parses a single row from the ECHA inventory.
   *
   * @param row - Raw CSV row with ECHA column names
   * @returns Parsed record or null if row is invalid (missing required fields or invalid CAS)
   */
  parseRow(row: EchaRawRow): EchaInventoryRecord | null {
    // Validate required fields
    const ecNumber = row['EC Number']?.trim();
    const ecName = row['EC Name']?.trim();

    if (!ecNumber || !ecName) {
      return null;
    }

    const rawCas = row['CAS Number'];

    // Check if CAS is a "no value" placeholder
    if (isNoCasValue(rawCas)) {
      // Accept record without CAS number
      return {
        ecNumber,
        primaryName: ecName.toLowerCase(),
        casNumber: undefined,
        molecularFormula: row['Molecular formula']?.trim() || undefined,
        description: row['Description']?.trim() || undefined,
      };
    }

    // CAS is present - validate it
    const sanitizedCas = sanitizeCas(rawCas);

    if (sanitizedCas === null) {
      // CAS was provided but is invalid (bad format or checksum)
      return null;
    }

    return {
      ecNumber,
      primaryName: ecName.toLowerCase(),
      casNumber: sanitizedCas,
      molecularFormula: row['Molecular formula']?.trim() || undefined,
      description: row['Description']?.trim() || undefined,
    };
  }

  /**
   * Parses CSV content from an ECHA EC Inventory file.
   *
   * @param csvContent - Raw CSV string with headers
   * @returns Array of valid parsed records (invalid rows are skipped)
   */
  async parse(csvContent: string): Promise<EchaInventoryRecord[]> {
    const rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as EchaRawRow[];

    const results: EchaInventoryRecord[] = [];

    for (const row of rows) {
      const record = this.parseRow(row);
      if (record !== null) {
        results.push(record);
      }
    }

    return results;
  }
}
