// packages/gsr/src/parsers/echa-annex-xvii.parser.ts
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { sanitizeCas } from '../utils/cas-sanitizer.js';
import { mapScopeText } from '../utils/scope-mapper.js';
import { readXlsxFile, detectFileFormat } from '../utils/xlsx-reader.js';
import { ProductScope } from '../enums/ProductScope.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';

/**
 * Patterns that indicate no CAS number is available (not an error).
 */
const NO_CAS_PATTERNS = [/^-$/, /^$/, /^n\/?a$/i, /^not\s*(available|applicable)$/i];

/**
 * Patterns for group/compound substance names.
 * These indicate the entry covers multiple substances.
 */
const GROUP_PATTERNS = [
  /and (its|their) compounds/i,
  /and (its|their) salts/i,
  /derivatives/i,
  /family/i,
  /group/i,
  /\bPFAS\b/i,
];

export interface EchaAnnexXviiRecord {
  entryNumber: string;
  substanceName: string;
  casNumber?: string;
  ecNumber?: string;
  restrictionConditions: string;
  scopes: ProductScope[];
  threshold?: number;
  thresholdUnit?: ThresholdUnit;
  isGroupEntry: boolean;
}

/**
 * Entry definition from the grouped/entries file.
 * Contains Entry number, name, and EUR-Lex URL.
 */
export interface AnnexXviiEntry {
  entryNumber: string;
  entryName: string;
  eurLexUrl?: string;
  description?: string;
}

/**
 * Substance from the expanded/substances file.
 * Contains individual substance with link to regulatory group.
 */
export interface AnnexXviiSubstance {
  substanceName: string;
  casNumber?: string;
  ecNumber?: string;
  regulatoryGroup?: string;
  description?: string;
}

/**
 * Combined result from parsing both files.
 */
export interface AnnexXviiParsedData {
  entries: AnnexXviiEntry[];
  substances: AnnexXviiSubstance[];
  /** Map from regulatory group name (lowercase) to entry number */
  groupToEntryMap: Map<string, string>;
}

/**
 * Raw row format from the entries/grouped XLSX file.
 */
export interface AnnexXviiEntriesRawRow {
  'Substance name': string;
  'Description'?: string;
  'EC number'?: string;
  'CAS number'?: string;
  'Entry number': string;
  'Conditions'?: string;
  'Regulatory outcome'?: string;
  'Regulatory outcome date'?: string;
}

/**
 * Raw row format from the substances/expanded XLSX file.
 */
export interface AnnexXviiSubstancesRawRow {
  'Substance name': string;
  'Description'?: string;
  'EC number'?: string;
  'CAS number'?: string;
  'Regulatory group'?: string;
  'Group relationship'?: string;
}

/**
 * Raw row format from ECHA Annex XVII CSV export.
 * Note: ECHA exports use tab-separated values with these column names.
 */
export interface EchaAnnexXviiRawRow {
  'Entry No.': string;
  'Substance Name': string;
  'EC No.'?: string;
  'CAS No.'?: string;
  'Restriction Conditions': string;
}

export interface ThresholdResult {
  value: number;
  unit: ThresholdUnit;
}

/**
 * Extracts threshold value and unit from restriction text.
 *
 * Handles common patterns found in Annex XVII:
 * - "0.1% by weight"
 * - "0.05 %"
 * - "1 mg/kg"
 * - "100 ppm"
 * - "1000 ppb"
 * - "0.5 mg/cm2"
 *
 * @param text - Restriction conditions text
 * @returns Threshold value and unit, or null if not found
 */
export function extractThreshold(text: string): ThresholdResult | null {
  if (!text) return null;

  // Pattern for percentage (with or without "by weight")
  // Matches: "0.1%", "0.1 %", "0.1% by weight"
  const percentPattern = /(\d+(?:\.\d+)?)\s*%(?:\s*by\s*weight)?/i;
  const percentMatch = text.match(percentPattern);
  if (percentMatch && percentMatch[1]) {
    return {
      value: parseFloat(percentMatch[1]),
      unit: ThresholdUnit.PERCENT_BY_WEIGHT,
    };
  }

  // Pattern for mg/kg (also matches "mg kg")
  const mgKgPattern = /(\d+(?:\.\d+)?)\s*mg\s*[/]?\s*kg/i;
  const mgKgMatch = text.match(mgKgPattern);
  if (mgKgMatch && mgKgMatch[1]) {
    return {
      value: parseFloat(mgKgMatch[1]),
      unit: ThresholdUnit.MG_PER_KG,
    };
  }

  // Pattern for ppm
  const ppmPattern = /(\d+(?:\.\d+)?)\s*ppm/i;
  const ppmMatch = text.match(ppmPattern);
  if (ppmMatch && ppmMatch[1]) {
    return {
      value: parseFloat(ppmMatch[1]),
      unit: ThresholdUnit.PPM,
    };
  }

  // Pattern for ppb
  const ppbPattern = /(\d+(?:\.\d+)?)\s*ppb/i;
  const ppbMatch = text.match(ppbPattern);
  if (ppbMatch && ppbMatch[1]) {
    return {
      value: parseFloat(ppbMatch[1]),
      unit: ThresholdUnit.PPB,
    };
  }

  // Pattern for mg/cm2 (surface concentration)
  const mgCm2Pattern = /(\d+(?:\.\d+)?)\s*mg\s*[/]?\s*cm2/i;
  const mgCm2Match = text.match(mgCm2Pattern);
  if (mgCm2Match && mgCm2Match[1]) {
    return {
      value: parseFloat(mgCm2Match[1]),
      unit: ThresholdUnit.MG_PER_CM2,
    };
  }

  return null;
}

/**
 * Checks if a CAS value indicates "no CAS number" (as opposed to an invalid CAS).
 */
function isNoCasValue(cas: string | undefined): boolean {
  if (!cas) return true;
  const trimmed = cas.trim();
  return NO_CAS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Checks if a substance name indicates a group entry (multiple substances).
 */
function isGroupName(name: string): boolean {
  return GROUP_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Parser for ECHA REACH Annex XVII (Restrictions) CSV files.
 *
 * The Annex XVII contains restrictions on the manufacture, placing on the market,
 * and use of certain dangerous substances, mixtures, and articles.
 */
export class EchaAnnexXviiParser {
  /**
   * Parses an ECHA Annex XVII file (CSV or XLSX format).
   *
   * @param filePath - Path to the file
   * @returns Array of valid parsed records
   */
  async parseFile(filePath: string): Promise<EchaAnnexXviiRecord[]> {
    const format = detectFileFormat(filePath);

    if (format === 'xlsx') {
      const rows = readXlsxFile<EchaAnnexXviiRawRow>(filePath);
      return this.parseRows(rows);
    }

    // CSV format
    const content = readFileSync(filePath, 'utf-8');
    return this.parse(content);
  }

  /**
   * Parses a single row from the ECHA Annex XVII export.
   *
   * @param row - Raw CSV row with ECHA column names
   * @returns Parsed record or null if row is invalid
   */
  parseRow(row: EchaAnnexXviiRawRow): EchaAnnexXviiRecord | null {
    const entryNumber = row['Entry No.']?.trim();
    const substanceName = row['Substance Name']?.trim();
    const restrictionConditions = row['Restriction Conditions']?.trim();

    // Validate required fields
    if (!entryNumber || !substanceName) {
      return null;
    }

    // Parse EC number
    const ecNumber = row['EC No.']?.trim() || undefined;

    // Parse CAS number
    const rawCas = row['CAS No.'];
    let casNumber: string | undefined;

    if (!isNoCasValue(rawCas)) {
      const sanitized = sanitizeCas(rawCas);
      casNumber = sanitized ?? undefined;
    }

    // Extract threshold from restriction conditions
    const thresholdResult = extractThreshold(restrictionConditions || '');

    // Extract scopes from restriction conditions
    const scopes = mapScopeText(restrictionConditions);

    // Detect if this is a group entry
    const isGroupEntry = isGroupName(substanceName);

    return {
      entryNumber,
      substanceName,
      casNumber,
      ecNumber,
      restrictionConditions: restrictionConditions || '',
      scopes,
      threshold: thresholdResult?.value,
      thresholdUnit: thresholdResult?.unit,
      isGroupEntry,
    };
  }

  /**
   * Parses CSV content from an ECHA Annex XVII export file.
   *
   * Note: ECHA exports have metadata header lines before the actual data.
   * The format uses tab as delimiter.
   *
   * @param csvContent - Raw CSV/TSV string from ECHA export
   * @returns Array of valid parsed records (invalid rows are skipped)
   */
  async parse(csvContent: string): Promise<EchaAnnexXviiRecord[]> {
    // ECHA exports have metadata lines before actual data
    // Find the actual header line (contains "Entry No." and "Substance Name")
    const lines = csvContent.split('\n');
    let headerLineIndex = -1;

    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const line = lines[i];
      if (line && line.includes('Entry No.') && line.includes('Substance Name')) {
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
      }) as EchaAnnexXviiRawRow[];

      return this.parseRows(rows);
    }

    // Extract content from header line onwards
    const dataContent = lines.slice(headerLineIndex).join('\n');

    const rows = parse(dataContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: '\t',
    }) as EchaAnnexXviiRawRow[];

    return this.parseRows(rows);
  }

  /**
   * Groups parsed records by entry number.
   * Useful for identifying entries with multiple substances (group entries).
   *
   * @param records - Array of parsed records
   * @returns Map of entry number to records
   */
  groupByEntry(records: EchaAnnexXviiRecord[]): Record<string, EchaAnnexXviiRecord[]> {
    const grouped: Record<string, EchaAnnexXviiRecord[]> = {};

    for (const record of records) {
      const entryNumber = record.entryNumber;
      if (!grouped[entryNumber]) {
        grouped[entryNumber] = [];
      }
      grouped[entryNumber]!.push(record);
    }

    return grouped;
  }

  /**
   * Parses an array of raw rows into records.
   */
  private parseRows(rows: EchaAnnexXviiRawRow[]): EchaAnnexXviiRecord[] {
    const results: EchaAnnexXviiRecord[] = [];

    for (const row of rows) {
      const record = this.parseRow(row);
      if (record !== null) {
        results.push(record);
      }
    }

    return results;
  }

  /**
   * Parses both the entries file (with EUR-Lex URLs) and substances file (with all substances).
   * This is the recommended method for complete Annex XVII data.
   *
   * @param entriesFilePath - Path to the entries/grouped file (has Entry numbers and EUR-Lex URLs)
   * @param substancesFilePath - Path to the substances/expanded file (has all individual substances)
   * @returns Combined parsed data with entries, substances, and linking map
   */
  async parseBothFiles(entriesFilePath: string, substancesFilePath: string): Promise<AnnexXviiParsedData> {
    const entries = await this.parseEntriesFile(entriesFilePath);
    const substances = await this.parseSubstancesFile(substancesFilePath);

    // Build map from entry name (lowercase) to entry number
    const groupToEntryMap = new Map<string, string>();
    for (const entry of entries) {
      groupToEntryMap.set(entry.entryName.toLowerCase().trim(), entry.entryNumber);
    }

    return { entries, substances, groupToEntryMap };
  }

  /**
   * Parses the entries/grouped file containing Entry definitions with EUR-Lex URLs.
   *
   * @param filePath - Path to the entries XLSX file
   * @returns Array of entry definitions
   */
  async parseEntriesFile(filePath: string): Promise<AnnexXviiEntry[]> {
    const rows = readXlsxFile<AnnexXviiEntriesRawRow>(filePath);
    const entries: AnnexXviiEntry[] = [];
    const seenEntries = new Set<string>();

    for (const row of rows) {
      const entryNumber = row['Entry number']?.toString().trim();
      const entryName = row['Substance name']?.trim();

      if (!entryNumber || !entryName) continue;

      // Only take the first occurrence of each entry number
      // (file may have multiple rows per entry with different dates)
      if (seenEntries.has(entryNumber)) continue;
      seenEntries.add(entryNumber);

      entries.push({
        entryNumber,
        entryName,
        eurLexUrl: row['Conditions']?.trim() || undefined,
        description: row['Description']?.trim() || undefined,
      });
    }

    return entries;
  }

  /**
   * Parses the substances/expanded file containing all individual substances.
   *
   * @param filePath - Path to the substances XLSX file
   * @returns Array of substances with their regulatory group links
   */
  async parseSubstancesFile(filePath: string): Promise<AnnexXviiSubstance[]> {
    const rows = readXlsxFile<AnnexXviiSubstancesRawRow>(filePath);
    const substances: AnnexXviiSubstance[] = [];

    for (const row of rows) {
      const substanceName = row['Substance name']?.trim();
      if (!substanceName) continue;

      const rawCas = row['CAS number']?.trim();
      let casNumber: string | undefined;
      if (rawCas && !isNoCasValue(rawCas)) {
        const sanitized = sanitizeCas(rawCas);
        casNumber = sanitized ?? undefined;
      }

      const rawEc = row['EC number']?.trim();
      const ecNumber = (rawEc && rawEc !== '-') ? rawEc : undefined;

      const regulatoryGroup = row['Regulatory group']?.trim();

      substances.push({
        substanceName,
        casNumber,
        ecNumber,
        regulatoryGroup: (regulatoryGroup && regulatoryGroup !== '-') ? regulatoryGroup : undefined,
        description: row['Description']?.trim() || undefined,
      });
    }

    return substances;
  }

  /**
   * Links a substance to its Entry number using the regulatory group or name matching.
   *
   * @param substance - Substance to find Entry for
   * @param data - Parsed data with entries and group map
   * @returns Entry number or undefined if no match found
   */
  findEntryForSubstance(substance: AnnexXviiSubstance, data: AnnexXviiParsedData): string | undefined {
    // Try to match by regulatory group
    if (substance.regulatoryGroup) {
      const entryNum = data.groupToEntryMap.get(substance.regulatoryGroup.toLowerCase().trim());
      if (entryNum) return entryNum;
    }

    // Try to match by substance name to entry name
    const entryNum = data.groupToEntryMap.get(substance.substanceName.toLowerCase().trim());
    if (entryNum) return entryNum;

    return undefined;
  }
}
