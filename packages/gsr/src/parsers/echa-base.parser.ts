// packages/gsr/src/parsers/echa-base.parser.ts
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { sanitizeCas } from '../utils/cas-sanitizer.js';
import { readXlsxFile, detectFileFormat } from '../utils/xlsx-reader.js';

/**
 * Patterns that indicate no CAS number is available (not an error).
 */
const NO_CAS_PATTERNS = [/^-$/, /^$/, /^n\/?a$/i, /^not\s*(available|applicable)$/i];

/**
 * Month name to index mapping for date parsing.
 */
const MONTH_MAP: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/**
 * Base parser for ECHA CSV exports.
 *
 * Provides shared utilities for parsing ECHA data files:
 * - Header line detection (ECHA exports have metadata before actual data)
 * - Date parsing (supports DD-Mon-YYYY format used by ECHA)
 * - Tab-separated value parsing
 * - CAS number validation and sanitization
 *
 * @template TRaw - Type of raw CSV row (column names as keys)
 * @template TParsed - Type of parsed record
 */
export abstract class EchaBaseParser<TRaw extends Record<string, string>, TParsed> {
  /**
   * Find the header line index by searching for required columns.
   * ECHA exports often have metadata lines before the actual data header.
   *
   * @param lines - Array of lines from the CSV content
   * @param requiredColumns - Column names that must be present in the header
   * @returns Index of the header line, or -1 if not found
   */
  protected findHeaderLine(lines: string[], requiredColumns: string[]): number {
    // Search first 20 lines for the header
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const line = lines[i];
      if (line && requiredColumns.every((col) => line.includes(col))) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Parse a date string in various formats.
   * ECHA commonly uses DD-Mon-YYYY format (e.g., "05-Nov-2025").
   *
   * @param dateStr - Date string to parse
   * @returns Parsed Date object, or null if invalid
   */
  protected parseDate(dateStr: string | undefined): Date | null {
    if (!dateStr?.trim()) return null;
    const trimmed = dateStr.trim();

    // Try standard Date parsing first (handles ISO and many formats)
    let parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    // Try DD-Mon-YYYY format (e.g., "05-Nov-2025")
    const ddMonYyyy = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (ddMonYyyy && ddMonYyyy[1] && ddMonYyyy[2] && ddMonYyyy[3]) {
      const day = parseInt(ddMonYyyy[1], 10);
      const monthStr = ddMonYyyy[2];
      const year = parseInt(ddMonYyyy[3], 10);
      const monthIndex = MONTH_MAP[monthStr];
      if (monthIndex !== undefined) {
        parsed = new Date(year, monthIndex, day);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    return null;
  }

  /**
   * Parse tab-separated content starting from a given header index.
   *
   * @param content - Full CSV/TSV content
   * @param headerIndex - Index of the header line (or 0 if no metadata)
   * @returns Array of parsed rows
   */
  protected parseTabSeparated(content: string, headerIndex: number): TRaw[] {
    const lines = content.split('\n');
    const dataContent = lines.slice(headerIndex).join('\n');

    return parse(dataContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: '\t',
    }) as TRaw[];
  }

  /**
   * Check if a CAS value indicates "no CAS number" (as opposed to an invalid CAS).
   *
   * @param cas - CAS value from CSV
   * @returns true if the value indicates no CAS is available
   */
  protected isNoCasValue(cas: string | undefined): boolean {
    if (!cas) return true;
    const trimmed = cas.trim();
    return NO_CAS_PATTERNS.some((pattern) => pattern.test(trimmed));
  }

  /**
   * Sanitize and validate a CAS number.
   *
   * @param raw - Raw CAS value from CSV
   * @returns Sanitized CAS number, or undefined if invalid/missing
   */
  protected sanitizeCasNumber(raw: string | undefined): string | undefined {
    if (this.isNoCasValue(raw)) return undefined;
    return sanitizeCas(raw) ?? undefined;
  }

  /**
   * Parse rows from an XLSX file.
   *
   * @param filePath - Path to the XLSX file
   * @returns Array of valid parsed records
   */
  protected parseXlsxRows(filePath: string): TParsed[] {
    const rows = readXlsxFile<TRaw>(filePath);
    const results: TParsed[] = [];

    for (const row of rows) {
      const record = this.parseRow(row);
      if (record !== null) {
        results.push(record);
      }
    }

    return results;
  }

  /**
   * Parse a file (CSV or XLSX format).
   *
   * @param filePath - Path to the file
   * @returns Array of valid parsed records
   */
  async parseFile(filePath: string): Promise<TParsed[]> {
    const format = detectFileFormat(filePath);

    if (format === 'xlsx') {
      return this.parseXlsxRows(filePath);
    }

    // CSV format
    const content = readFileSync(filePath, 'utf-8');
    return this.parse(content);
  }

  /**
   * Parse a single row from the CSV.
   * Implementations should validate required fields and return null for invalid rows.
   *
   * @param row - Raw CSV row
   * @returns Parsed record, or null if row is invalid
   */
  abstract parseRow(row: TRaw): TParsed | null;

  /**
   * Parse full CSV content.
   * Implementations should handle header detection and row iteration.
   *
   * @param csvContent - Raw CSV/TSV string
   * @returns Array of valid parsed records
   */
  abstract parse(csvContent: string): Promise<TParsed[]>;
}
