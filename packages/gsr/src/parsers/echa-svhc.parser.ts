// packages/gsr/src/parsers/echa-svhc.parser.ts
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { sanitizeCas } from '../utils/cas-sanitizer.js';
import { readXlsxFile, detectFileFormat } from '../utils/xlsx-reader.js';

export interface EchaSvhcRecord {
  substanceName: string;
  ecNumber: string;
  casNumber?: string;
  dateOfInclusion: Date;
  reasonForInclusion: string;
}

/**
 * Entry from the entries/full file (has regulatory data).
 */
export interface SvhcEntry {
  entryName: string;
  ecNumber?: string;
  casNumber?: string;
  dateOfInclusion: Date | null;
  reasonForInclusion: string;
  decisionUrl?: string;
  description?: string;
}

/**
 * Substance from the expanded substances file.
 */
export interface SvhcSubstance {
  substanceName: string;
  casNumber?: string;
  ecNumber?: string;
  regulatoryGroup?: string; // Links to entry name
  description?: string;
}

/**
 * Combined parsed data from both files.
 */
export interface SvhcParsedData {
  entries: SvhcEntry[];
  substances: SvhcSubstance[];
  groupToEntryMap: Map<string, string>; // regulatory group -> entry name
}

/**
 * Raw row format from ECHA SVHC entries/full XLSX export.
 */
export interface SvhcEntriesRawRow {
  'Substance name': string;
  'Description'?: string;
  'EC number'?: string;
  'CAS number'?: string;
  'Date of inclusion'?: string;
  'Reason for inclusion'?: string;
  'Decision'?: string;
  'Regulatory outcome'?: string;
  'Regulatory outcome date'?: string;
}

/**
 * Raw row format from ECHA SVHC substances/expanded XLSX export.
 */
export interface SvhcSubstancesRawRow {
  'Substance name': string;
  'Description'?: string;
  'EC number'?: string;
  'CAS number'?: string;
  'Regulatory group'?: string;
  'Group relationship'?: string;
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
   * Parses an ECHA SVHC file (CSV or XLSX format).
   *
   * @param filePath - Path to the file
   * @returns Array of valid parsed records
   */
  async parseFile(filePath: string): Promise<EchaSvhcRecord[]> {
    const format = detectFileFormat(filePath);

    if (format === 'xlsx') {
      const rows = readXlsxFile<EchaSvhcRawRow>(filePath);
      return this.parseRows(rows);
    }

    // CSV format
    const content = readFileSync(filePath, 'utf-8');
    return this.parse(content);
  }

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

  /**
   * Parses both entries and substances files and links them together.
   *
   * @param entriesFilePath - Path to the entries/full file (has regulatory data)
   * @param substancesFilePath - Path to the substances/expanded file (has all individual substances)
   * @returns Combined parsed data with entries, substances, and linking map
   */
  async parseBothFiles(entriesFilePath: string, substancesFilePath: string): Promise<SvhcParsedData> {
    const entries = await this.parseEntriesFile(entriesFilePath);
    const substances = await this.parseSubstancesFile(substancesFilePath);

    // Build map from regulatory group name to entry name
    // In SVHC, the regulatory group IS the entry name
    const groupToEntryMap = new Map<string, string>();
    for (const entry of entries) {
      groupToEntryMap.set(entry.entryName, entry.entryName);
    }

    return { entries, substances, groupToEntryMap };
  }

  /**
   * Parses the entries/full XLSX file (contains regulatory data).
   */
  async parseEntriesFile(filePath: string): Promise<SvhcEntry[]> {
    const rows = readXlsxFile<SvhcEntriesRawRow>(filePath);
    const entries: SvhcEntry[] = [];

    for (const row of rows) {
      const entryName = row['Substance name']?.trim();
      if (!entryName) continue;

      const rawCas = row['CAS number'];
      const casNumber = isNoCasValue(rawCas) ? undefined : sanitizeCas(rawCas) || undefined;

      entries.push({
        entryName,
        ecNumber: row['EC number']?.trim() || undefined,
        casNumber,
        dateOfInclusion: parseDate(row['Date of inclusion'] || ''),
        reasonForInclusion: row['Reason for inclusion']?.trim() || '',
        decisionUrl: row['Decision']?.trim() || undefined,
        description: row['Description']?.trim() || undefined,
      });
    }

    return entries;
  }

  /**
   * Parses the substances/expanded XLSX file (contains all individual substances).
   */
  async parseSubstancesFile(filePath: string): Promise<SvhcSubstance[]> {
    const rows = readXlsxFile<SvhcSubstancesRawRow>(filePath);
    const substances: SvhcSubstance[] = [];

    for (const row of rows) {
      const substanceName = row['Substance name']?.trim();
      if (!substanceName) continue;

      const rawCas = row['CAS number'];
      const casNumber = isNoCasValue(rawCas) ? undefined : sanitizeCas(rawCas) || undefined;

      const regulatoryGroup = row['Regulatory group']?.trim();

      substances.push({
        substanceName,
        casNumber,
        ecNumber: row['EC number']?.trim() || undefined,
        regulatoryGroup: regulatoryGroup && regulatoryGroup !== '-' ? regulatoryGroup : undefined,
        description: row['Description']?.trim() || undefined,
      });
    }

    return substances;
  }

  /**
   * Finds the entry name for a substance based on its regulatory group.
   * For standalone substances (no group), matches by substance name.
   *
   * @param substance - Substance to find entry for
   * @param parsedData - Parsed data with entries and map
   * @returns Entry name or undefined if not found
   */
  findEntryForSubstance(substance: SvhcSubstance, parsedData: SvhcParsedData): string | undefined {
    // If substance has a regulatory group, use it to find the entry
    if (substance.regulatoryGroup) {
      if (parsedData.groupToEntryMap.has(substance.regulatoryGroup)) {
        return substance.regulatoryGroup;
      }
    }

    // For standalone substances, find by substance name matching entry name
    for (const entry of parsedData.entries) {
      if (entry.entryName === substance.substanceName) {
        return entry.entryName;
      }
    }

    return undefined;
  }
}
