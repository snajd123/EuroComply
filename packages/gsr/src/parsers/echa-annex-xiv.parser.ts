// packages/gsr/src/parsers/echa-annex-xiv.parser.ts
import { EchaBaseParser } from './echa-base.parser.js';
import { readXlsxFile } from '../utils/xlsx-reader.js';

/**
 * Parsed record from ECHA Annex XIV (Authorization List).
 */
export interface EchaAnnexXivRecord {
  substanceName: string;
  casNumber?: string;
  ecNumber?: string;
  intrinsicProperties: string; // Reason for inclusion (Article 57 criteria)
  sunsetDate: Date | null;
  latestApplicationDate: Date | null;
  exemptedUses?: string;
}

/**
 * Entry from the entries/full file (has regulatory data).
 */
export interface AnnexXivEntry {
  entryName: string;
  entryNumber?: string;
  latestApplicationDate: Date | null;
  sunsetDate: Date | null;
  reasonForInclusion: string;
  exemptedUses?: string;
  description?: string;
}

/**
 * Substance from the expanded substances file.
 */
export interface AnnexXivSubstance {
  substanceName: string;
  casNumber?: string;
  ecNumber?: string;
  regulatoryGroup?: string; // Links to entry name
  description?: string;
}

/**
 * Combined parsed data from both files.
 */
export interface AnnexXivParsedData {
  entries: AnnexXivEntry[];
  substances: AnnexXivSubstance[];
  groupToEntryMap: Map<string, string>; // regulatory group -> entry name
}

/**
 * Raw row format from ECHA Annex XIV entries/full XLSX export.
 */
export interface AnnexXivEntriesRawRow {
  'Substance name': string;
  'Description'?: string;
  'EC number'?: string;
  'CAS number'?: string;
  'Entry number'?: string;
  'Latest application date'?: string;
  'Latest application date remarks'?: string;
  'Sunset date'?: string;
  'Sunset date remarks'?: string;
  'Reason for inclusion'?: string;
  'Exempted (categories of) uses'?: string;
  'Review periods'?: string;
  'Regulatory outcome'?: string;
  'Regulatory outcome date'?: string;
}

/**
 * Raw row format from ECHA Annex XIV substances/expanded XLSX export.
 */
export interface AnnexXivSubstancesRawRow {
  'Substance name': string;
  'Description'?: string;
  'EC number'?: string;
  'CAS number'?: string;
  'Regulatory group'?: string;
  'Group relationship'?: string;
}

/**
 * Raw row format from ECHA Annex XIV CSV/TSV export (legacy format).
 */
export interface EchaAnnexXivRawRow extends Record<string, string> {
  'Substance Name': string;
  'EC No.': string;
  'CAS No.': string;
  'Intrinsic property(ies) referred to in Article 57': string;
  'Sunset Date': string;
  'Latest application date': string;
  'Exempted (categories of) uses': string;
}

/**
 * Required columns for header detection in ECHA Annex XIV exports.
 */
const REQUIRED_COLUMNS = ['Substance Name', 'Intrinsic property'];

/**
 * Parser for ECHA REACH Annex XIV (Authorization List) CSV files.
 *
 * The Annex XIV contains substances requiring authorization under REACH.
 * These are Substances of Very High Concern (SVHC) that have been prioritized
 * for inclusion in the Authorization List.
 *
 * Key differences from other lists:
 * - Has sunset date (after which substance cannot be used without authorization)
 * - Has latest application date (deadline for applying for authorization)
 * - Status is AUTHORIZED (requires authorization to use)
 */
export class EchaAnnexXivParser extends EchaBaseParser<EchaAnnexXivRawRow, EchaAnnexXivRecord> {
  /**
   * Parses a single row from the ECHA Annex XIV export.
   *
   * @param row - Raw CSV row with ECHA column names
   * @returns Parsed record or null if row is invalid
   */
  parseRow(row: EchaAnnexXivRawRow): EchaAnnexXivRecord | null {
    const substanceName = row['Substance Name']?.trim();

    // Validate required field
    if (!substanceName) {
      return null;
    }

    // Parse EC number
    const ecNumber = row['EC No.']?.trim() || undefined;

    // Parse CAS number
    const casNumber = this.sanitizeCasNumber(row['CAS No.']);

    // Get intrinsic properties (reason for inclusion)
    const intrinsicProperties = row['Intrinsic property(ies) referred to in Article 57']?.trim() || '';

    // Parse dates
    const sunsetDate = this.parseDate(row['Sunset Date']);
    const latestApplicationDate = this.parseDate(row['Latest application date']);

    // Parse exempted uses
    const exemptedUsesRaw = row['Exempted (categories of) uses']?.trim();
    const exemptedUses = exemptedUsesRaw || undefined;

    return {
      substanceName,
      casNumber,
      ecNumber,
      intrinsicProperties,
      sunsetDate,
      latestApplicationDate,
      exemptedUses,
    };
  }

  /**
   * Parses CSV content from an ECHA Annex XIV export file.
   *
   * Note: ECHA exports have metadata header lines before the actual data.
   * The format uses tab as delimiter.
   *
   * @param csvContent - Raw CSV/TSV string from ECHA export
   * @returns Array of valid parsed records (invalid rows are skipped)
   */
  async parse(csvContent: string): Promise<EchaAnnexXivRecord[]> {
    const lines = csvContent.split('\n');

    // Find header line
    const headerIndex = this.findHeaderLine(lines, REQUIRED_COLUMNS);

    // Parse rows
    let rows: EchaAnnexXivRawRow[];
    if (headerIndex === -1) {
      // Fallback: try parsing from the beginning
      rows = this.parseTabSeparated(csvContent, 0);
    } else {
      rows = this.parseTabSeparated(csvContent, headerIndex);
    }

    // Convert raw rows to parsed records
    const results: EchaAnnexXivRecord[] = [];
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
  async parseBothFiles(entriesFilePath: string, substancesFilePath: string): Promise<AnnexXivParsedData> {
    const entries = await this.parseEntriesFile(entriesFilePath);
    const substances = await this.parseSubstancesFile(substancesFilePath);

    // Build map from regulatory group name to entry name
    // In Annex XIV, the regulatory group IS the entry name
    const groupToEntryMap = new Map<string, string>();
    for (const entry of entries) {
      groupToEntryMap.set(entry.entryName, entry.entryName);
    }

    return { entries, substances, groupToEntryMap };
  }

  /**
   * Parses the entries/full XLSX file (contains regulatory data).
   */
  async parseEntriesFile(filePath: string): Promise<AnnexXivEntry[]> {
    const rows = readXlsxFile<AnnexXivEntriesRawRow>(filePath);
    const entries: AnnexXivEntry[] = [];

    for (const row of rows) {
      const entryName = row['Substance name']?.trim();
      if (!entryName) continue;

      entries.push({
        entryName,
        entryNumber: row['Entry number']?.trim() || undefined,
        latestApplicationDate: this.parseDate(row['Latest application date']),
        sunsetDate: this.parseDate(row['Sunset date']),
        reasonForInclusion: row['Reason for inclusion']?.trim() || '',
        exemptedUses: row['Exempted (categories of) uses']?.trim() || undefined,
        description: row['Description']?.trim() || undefined,
      });
    }

    return entries;
  }

  /**
   * Parses the substances/expanded XLSX file (contains all individual substances).
   */
  async parseSubstancesFile(filePath: string): Promise<AnnexXivSubstance[]> {
    const rows = readXlsxFile<AnnexXivSubstancesRawRow>(filePath);
    const substances: AnnexXivSubstance[] = [];

    for (const row of rows) {
      const substanceName = row['Substance name']?.trim();
      if (!substanceName) continue;

      const regulatoryGroup = row['Regulatory group']?.trim();

      substances.push({
        substanceName,
        casNumber: this.sanitizeCasNumber(row['CAS number']),
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
  findEntryForSubstance(substance: AnnexXivSubstance, parsedData: AnnexXivParsedData): string | undefined {
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
