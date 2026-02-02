// packages/gsr/src/parsers/echa-pop.parser.ts
import { EchaBaseParser } from './echa-base.parser.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { readXlsxFile } from '../utils/xlsx-reader.js';

/**
 * Parsed record from ECHA POP Regulation export.
 */
export interface EchaPopRecord {
  substanceName: string;
  casNumber?: string;
  ecNumber?: string;
  annexes: string[];       // ["I"], ["I", "IV"], ["II"], etc.
  exemptions?: string;     // Specific exemptions or conditions
  listingStatus: ListingStatus;  // Derived: BANNED for Annex I, RESTRICTED for Annex II
}

/**
 * Entry from the entries/full file (has regulatory data).
 */
export interface PopEntry {
  entryName: string;
  ecNumber?: string;
  casNumber?: string;
  dateOfInclusion: Date | null;
  annexes: string[];
  regulatoryOutcome?: string;
  description?: string;
  listingStatus: ListingStatus;
}

/**
 * Substance from the expanded substances file.
 */
export interface PopSubstance {
  substanceName: string;
  casNumber?: string;
  ecNumber?: string;
  regulatoryGroup?: string;
  description?: string;
}

/**
 * Combined parsed data from both files.
 */
export interface PopParsedData {
  entries: PopEntry[];
  substances: PopSubstance[];
  groupToEntryMap: Map<string, string>;
}

/**
 * Raw row format from ECHA POP entries/full XLSX export.
 */
export interface PopEntriesRawRow {
  'Substance name': string;
  'Description'?: string;
  'EC number'?: string;
  'CAS number'?: string;
  'Date of inclusion'?: string;
  'POPs Regulation Annex'?: string;
  'Regulatory outcome'?: string;
  'Regulatory outcome date'?: string;
}

/**
 * Raw row format from ECHA POP substances/expanded XLSX export.
 */
export interface PopSubstancesRawRow {
  'Substance name': string;
  'Description'?: string;
  'EC number'?: string;
  'CAS number'?: string;
  'Regulatory group'?: string;
  'Group relationship'?: string;
}

/**
 * Raw row format from ECHA POP Regulation CSV/TSV export.
 */
export interface EchaPopRawRow extends Record<string, string> {
  'Substance Name': string;
  'EC No.': string;
  'CAS No.': string;
  'Annex': string;
  'Specific exemptions or conditions': string;
}

/**
 * Required columns for header detection in ECHA POP exports.
 */
const REQUIRED_COLUMNS = ['Substance Name', 'Annex'];

/**
 * Derives the listing status from POP Regulation annexes.
 *
 * - Annex I (Prohibited): BANNED - substances that are banned from manufacturing,
 *   placing on the market, and use
 * - Annex II (Restricted): RESTRICTED - substances that are restricted with specific conditions
 * - Annex III/IV: LISTED - other categories (monitoring, waste provisions)
 *
 * Annex I takes precedence if present (substances can be in multiple annexes).
 *
 * @param annexes - Array of annex identifiers (e.g., ["I", "IV"])
 * @returns The derived listing status
 */
export function deriveListingStatus(annexes: string[]): ListingStatus {
  if (annexes.includes('I')) {
    return ListingStatus.BANNED;  // Annex I = prohibited
  }
  if (annexes.includes('II')) {
    return ListingStatus.RESTRICTED;  // Annex II = restricted
  }
  return ListingStatus.LISTED;  // Other annexes (III, IV) = just listed
}

/**
 * Parser for ECHA POP (Persistent Organic Pollutants) Regulation CSV files.
 *
 * The EU POP Regulation (EU 2019/1021) regulates persistent organic pollutants with:
 * - Annex I: Prohibited substances (banned from manufacturing, placing on market, use)
 * - Annex II: Restricted substances (with specific conditions)
 * - Annex III: Release reduction provisions
 * - Annex IV: Waste management provisions
 *
 * Key differences from other ECHA lists:
 * - Annex-based status mapping (I=BANNED, II=RESTRICTED)
 * - Multiple annexes possible for same substance
 * - Exemptions/conditions stored in dedicated column
 */
export class EchaPopParser extends EchaBaseParser<EchaPopRawRow, EchaPopRecord> {
  /**
   * Parses the Annex column into an array of annex identifiers.
   * Handles comma-separated values with possible whitespace.
   *
   * @param annexStr - Raw annex string (e.g., "I, IV" or "I")
   * @returns Array of trimmed annex identifiers
   */
  private parseAnnexes(annexStr: string | undefined): string[] {
    if (!annexStr?.trim()) return [];

    return annexStr
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
  }

  /**
   * Parses a single row from the ECHA POP Regulation export.
   *
   * @param row - Raw CSV row with ECHA column names
   * @returns Parsed record or null if row is invalid
   */
  parseRow(row: EchaPopRawRow): EchaPopRecord | null {
    const substanceName = row['Substance Name']?.trim();

    // Validate required field
    if (!substanceName) {
      return null;
    }

    // Parse annexes (required)
    const annexes = this.parseAnnexes(row['Annex']);
    if (annexes.length === 0) {
      return null;
    }

    // Parse EC number
    const ecNumber = row['EC No.']?.trim() || undefined;

    // Parse CAS number
    const casNumber = this.sanitizeCasNumber(row['CAS No.']);

    // Parse exemptions
    const exemptionsRaw = row['Specific exemptions or conditions']?.trim();
    const exemptions = exemptionsRaw || undefined;

    // Derive listing status from annexes
    const listingStatus = deriveListingStatus(annexes);

    return {
      substanceName,
      casNumber,
      ecNumber,
      annexes,
      exemptions,
      listingStatus,
    };
  }

  /**
   * Parses CSV content from an ECHA POP Regulation export file.
   *
   * Note: ECHA exports have metadata header lines before the actual data.
   * The format uses tab as delimiter.
   *
   * @param csvContent - Raw CSV/TSV string from ECHA export
   * @returns Array of valid parsed records (invalid rows are skipped)
   */
  async parse(csvContent: string): Promise<EchaPopRecord[]> {
    const lines = csvContent.split('\n');

    // Find header line
    const headerIndex = this.findHeaderLine(lines, REQUIRED_COLUMNS);

    // Parse rows
    let rows: EchaPopRawRow[];
    if (headerIndex === -1) {
      // Fallback: try parsing from the beginning
      rows = this.parseTabSeparated(csvContent, 0);
    } else {
      rows = this.parseTabSeparated(csvContent, headerIndex);
    }

    // Convert raw rows to parsed records
    const results: EchaPopRecord[] = [];
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
  async parseBothFiles(entriesFilePath: string, substancesFilePath: string): Promise<PopParsedData> {
    const entries = await this.parseEntriesFile(entriesFilePath);
    const substances = await this.parseSubstancesFile(substancesFilePath);

    // Build map from regulatory group name to entry name
    const groupToEntryMap = new Map<string, string>();
    for (const entry of entries) {
      groupToEntryMap.set(entry.entryName, entry.entryName);
    }

    return { entries, substances, groupToEntryMap };
  }

  /**
   * Parses the entries/full XLSX file (contains regulatory data).
   */
  async parseEntriesFile(filePath: string): Promise<PopEntry[]> {
    const rows = readXlsxFile<PopEntriesRawRow>(filePath);
    const entries: PopEntry[] = [];

    for (const row of rows) {
      const entryName = row['Substance name']?.trim();
      if (!entryName) continue;

      const rawCas = row['CAS number'];
      const casNumber = this.isNoCasValue(rawCas) ? undefined : this.sanitizeCasNumber(rawCas) || undefined;

      // Parse annexes from "POPs Regulation Annex" column
      // Format: "Annex I, part A" or "Annex I, part A\nAnnex IV"
      const annexes = this.parseAnnexesFromColumn(row['POPs Regulation Annex']);
      const listingStatus = deriveListingStatus(annexes);

      entries.push({
        entryName,
        ecNumber: row['EC number']?.trim() || undefined,
        casNumber,
        dateOfInclusion: this.parseDate(row['Date of inclusion'] || ''),
        annexes,
        regulatoryOutcome: row['Regulatory outcome']?.trim() || undefined,
        description: row['Description']?.trim() || undefined,
        listingStatus,
      });
    }

    return entries;
  }

  /**
   * Parses the substances/expanded XLSX file (contains all individual substances).
   */
  async parseSubstancesFile(filePath: string): Promise<PopSubstance[]> {
    const rows = readXlsxFile<PopSubstancesRawRow>(filePath);
    const substances: PopSubstance[] = [];

    for (const row of rows) {
      const substanceName = row['Substance name']?.trim();
      if (!substanceName) continue;

      const rawCas = row['CAS number'];
      const casNumber = this.isNoCasValue(rawCas) ? undefined : this.sanitizeCasNumber(rawCas) || undefined;

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
  findEntryForSubstance(substance: PopSubstance, parsedData: PopParsedData): string | undefined {
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

  /**
   * Parses the POPs Regulation Annex column from the entries file.
   * Format: "Annex I, part A" or "Annex I, part A\nAnnex IV"
   *
   * @param annexStr - Raw annex string from column
   * @returns Array of annex identifiers (e.g., ["I", "IV"])
   */
  private parseAnnexesFromColumn(annexStr: string | undefined): string[] {
    if (!annexStr?.trim()) return [];

    const annexes: string[] = [];

    // Split by newline first (multiple annexes can be on different lines)
    const lines = annexStr.split('\n');

    for (const line of lines) {
      // Match patterns like "Annex I", "Annex II", "Annex IV"
      const match = line.match(/Annex\s+([IVX]+)/i);
      if (match && match[1]) {
        const annex = match[1].toUpperCase();
        if (!annexes.includes(annex)) {
          annexes.push(annex);
        }
      }
    }

    return annexes;
  }

}
