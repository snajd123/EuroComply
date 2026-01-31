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

/**
 * Raw row format from ECHA EC Inventory CSV export.
 * Note: ECHA exports use tab-separated values with these exact column names.
 */
export interface EchaRawRow {
  'CAS no.': string;
  'Description': string;
  'Molecular Formula': string;
  'EC no.': string;
  'Name': string;
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
    // Validate required fields - use actual ECHA column names
    const ecNumber = row['EC no.']?.trim();
    const ecName = row['Name']?.trim();

    if (!ecNumber || !ecName) {
      return null;
    }

    const rawCas = row['CAS no.'];

    // Check if CAS is a "no value" placeholder
    if (isNoCasValue(rawCas)) {
      // Accept record without CAS number
      return {
        ecNumber,
        primaryName: ecName.toLowerCase(),
        casNumber: undefined,
        molecularFormula: row['Molecular Formula']?.trim() || undefined,
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
      molecularFormula: row['Molecular Formula']?.trim() || undefined,
      description: row['Description']?.trim() || undefined,
    };
  }

  /**
   * Parses CSV content from an ECHA EC Inventory file.
   *
   * Note: ECHA exports have metadata header lines before the actual data.
   * The format uses tab as delimiter and has headers like "CAS no.", "EC no.", "Name".
   *
   * @param csvContent - Raw CSV/TSV string from ECHA export
   * @returns Array of valid parsed records (invalid rows are skipped)
   */
  async parse(csvContent: string): Promise<EchaInventoryRecord[]> {
    // ECHA exports have metadata lines before actual data
    // Find the actual header line (contains "CAS no." and "EC no.")
    const lines = csvContent.split('\n');
    let headerLineIndex = -1;

    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const line = lines[i];
      if (line && line.includes('CAS no.') && line.includes('EC no.')) {
        headerLineIndex = i;
        break;
      }
    }

    if (headerLineIndex === -1) {
      // Fallback: try parsing as-is (may be a cleaned file)
      const rows = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: '\t',
      }) as EchaRawRow[];

      return this.parseRows(rows);
    }

    // Extract content from header line onwards
    const dataContent = lines.slice(headerLineIndex).join('\n');

    const rows = parse(dataContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: '\t',
    }) as EchaRawRow[];

    return this.parseRows(rows);
  }

  /**
   * Parses an array of raw rows into records.
   */
  private parseRows(rows: EchaRawRow[]): EchaInventoryRecord[] {
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
