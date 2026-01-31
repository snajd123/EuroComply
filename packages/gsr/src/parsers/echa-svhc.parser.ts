// packages/gsr/src/parsers/echa-svhc.parser.ts
import { parse } from 'csv-parse/sync';
import { sanitizeCas } from '../utils/cas-sanitizer.js';

export interface EchaSvhcRecord {
  substanceName: string;
  ecNumber: string;
  casNumber?: string;
  dateOfInclusion: Date;
  reasonForInclusion: string;
}

export interface EchaSvhcRawRow {
  'Substance Name': string;
  'EC Number': string;
  'CAS Number'?: string;
  'Date of inclusion': string;
  'Reason for inclusion': string;
}

/**
 * Patterns that indicate no CAS number is available (not an error)
 */
const NO_CAS_PATTERNS = [/^-$/, /^$/, /^n\/?a$/i, /^not\s*(available|applicable)$/i];

/**
 * Checks if a CAS value indicates "no CAS number" (as opposed to an invalid CAS)
 */
function isNoCasValue(cas: string | undefined): boolean {
  if (!cas) return true;
  const trimmed = cas.trim();
  return NO_CAS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Parses a date string in YYYY-MM-DD format.
 */
function parseDate(dateStr: string): Date | null {
  const trimmed = dateStr?.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

/**
 * Parser for ECHA SVHC (Substances of Very High Concern) Candidate List CSV files.
 *
 * The SVHC Candidate List contains substances identified under REACH Article 57
 * that may be subject to authorization requirements.
 */
export class EchaSvhcParser {
  /**
   * Parses a single row from the ECHA SVHC list.
   *
   * @param row - Raw CSV row with ECHA SVHC column names
   * @returns Parsed record or null if row is invalid
   */
  parseRow(row: EchaSvhcRawRow): EchaSvhcRecord | null {
    // Validate required fields
    const substanceName = row['Substance Name']?.trim();
    const ecNumber = row['EC Number']?.trim();
    const dateOfInclusionStr = row['Date of inclusion']?.trim();
    const reasonForInclusion = row['Reason for inclusion']?.trim();

    if (!substanceName || !ecNumber || !dateOfInclusionStr || !reasonForInclusion) {
      return null;
    }

    // Parse date
    const dateOfInclusion = parseDate(dateOfInclusionStr);
    if (!dateOfInclusion) {
      return null;
    }

    const rawCas = row['CAS Number'];

    // Check if CAS is a "no value" placeholder
    if (isNoCasValue(rawCas)) {
      return {
        substanceName,
        ecNumber,
        casNumber: undefined,
        dateOfInclusion,
        reasonForInclusion,
      };
    }

    // CAS is present - validate it
    const sanitizedCas = sanitizeCas(rawCas);

    if (sanitizedCas === null) {
      // CAS was provided but is invalid - still accept record without CAS
      // SVHC list entries are valid even with invalid CAS numbers
      return {
        substanceName,
        ecNumber,
        casNumber: undefined,
        dateOfInclusion,
        reasonForInclusion,
      };
    }

    return {
      substanceName,
      ecNumber,
      casNumber: sanitizedCas,
      dateOfInclusion,
      reasonForInclusion,
    };
  }

  /**
   * Parses CSV content from an ECHA SVHC Candidate List file.
   *
   * @param csvContent - Raw CSV string with headers
   * @returns Array of valid parsed records (invalid rows are skipped)
   */
  async parse(csvContent: string): Promise<EchaSvhcRecord[]> {
    const rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as EchaSvhcRawRow[];

    const results: EchaSvhcRecord[] = [];

    for (const row of rows) {
      const record = this.parseRow(row);
      if (record !== null) {
        results.push(record);
      }
    }

    return results;
  }
}
