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

/**
 * Raw row format from ECHA SVHC Candidate List CSV export.
 * Note: ECHA exports use tab-separated values with these exact column names.
 */
export interface EchaSvhcRawRow {
  'Substance name': string;
  'EC No.': string;
  'CAS No.'?: string;
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
 * Parses a date string in various formats.
 * ECHA uses formats like "05-Nov-2025" (DD-Mon-YYYY).
 */
function parseDate(dateStr: string): Date | null {
  const trimmed = dateStr?.trim();
  if (!trimmed) return null;

  // Try standard Date parsing first (handles ISO and many formats)
  let parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Try DD-Mon-YYYY format (e.g., "05-Nov-2025")
  const ddMonYyyy = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (ddMonYyyy && ddMonYyyy[1] && ddMonYyyy[2] && ddMonYyyy[3]) {
    const day = ddMonYyyy[1];
    const monthStr = ddMonYyyy[2];
    const year = ddMonYyyy[3];
    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const monthIndex = months[monthStr];
    if (monthIndex !== undefined) {
      parsed = new Date(parseInt(year), monthIndex, parseInt(day));
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return null;
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
    // Validate required fields - use actual ECHA column names
    const substanceName = row['Substance name']?.trim();
    const ecNumber = row['EC No.']?.trim();
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

    const rawCas = row['CAS No.'];

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
   * Note: ECHA exports have metadata header lines before the actual data.
   * The format uses tab as delimiter and has headers like "Substance name", "EC No.", "CAS No.".
   *
   * @param csvContent - Raw CSV/TSV string from ECHA export
   * @returns Array of valid parsed records (invalid rows are skipped)
   */
  async parse(csvContent: string): Promise<EchaSvhcRecord[]> {
    // ECHA exports have metadata lines before actual data
    // Find the actual header line (contains "Substance name" and "EC No.")
    const lines = csvContent.split('\n');
    let headerLineIndex = -1;

    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const line = lines[i];
      if (line && line.includes('Substance name') && line.includes('EC No.')) {
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
      }) as EchaSvhcRawRow[];

      return this.parseRows(rows);
    }

    // Extract content from header line onwards
    const dataContent = lines.slice(headerLineIndex).join('\n');

    const rows = parse(dataContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: '\t',
    }) as EchaSvhcRawRow[];

    return this.parseRows(rows);
  }

  /**
   * Parses an array of raw rows into records.
   */
  private parseRows(rows: EchaSvhcRawRow[]): EchaSvhcRecord[] {
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
