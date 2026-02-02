// packages/gsr/src/parsers/echa-inventory.parser.ts
import { parse } from 'csv-parse/sync';
import { createReadStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Extract } from 'unzipper';
import { XMLParser } from 'fast-xml-parser';
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
 * Parser for ECHA EC Inventory files.
 *
 * Supports two formats:
 * - CSV/TSV: Tab-separated export from ECHA website
 * - i6z: IUCLID format (ZIP containing XML files)
 */
export class EchaInventoryParser {
  /**
   * Parses a single row from the ECHA CSV inventory.
   */
  parseRow(row: EchaRawRow): EchaInventoryRecord | null {
    const ecNumber = row['EC no.']?.trim();
    const ecName = row['Name']?.trim();

    if (!ecNumber || !ecName) {
      return null;
    }

    const rawCas = row['CAS no.'];

    if (isNoCasValue(rawCas)) {
      return {
        ecNumber,
        primaryName: ecName.toLowerCase(),
        casNumber: undefined,
        molecularFormula: row['Molecular Formula']?.trim() || undefined,
        description: row['Description']?.trim() || undefined,
      };
    }

    const sanitizedCas = sanitizeCas(rawCas);

    if (sanitizedCas === null) {
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
   */
  async parse(csvContent: string): Promise<EchaInventoryRecord[]> {
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
      const rows = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: '\t',
      }) as EchaRawRow[];

      return this.parseRows(rows);
    }

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
   * Parses an i6z file (IUCLID EC Inventory format).
   *
   * The EC Inventory i6z format is a ZIP archive containing:
   * - A single large .i6i XML file with all inventory entries
   * - A manifest.xml file
   *
   * Structure of the .i6i file:
   * <Inventory>
   *   <inventoryEntries>
   *     <inventoryEntry>
   *       <inventoryNumber>200-579-1</inventoryNumber>
   *       <inventoryNames><inventoryName>formic acid</inventoryName></inventoryNames>
   *       <casNumber>64-18-6</casNumber>
   *       <molecularFormula>CH2O2</molecularFormula>
   *     </inventoryEntry>
   *     ...
   *   </inventoryEntries>
   * </Inventory>
   *
   * @param i6zPath - Path to the i6z file
   * @param onProgress - Optional callback for progress updates
   * @returns Array of parsed records
   */
  async parseI6z(
    i6zPath: string,
    onProgress?: (processed: number, found: number) => void
  ): Promise<EchaInventoryRecord[]> {
    // Create temp directory for extraction
    const tempDir = await mkdtemp(join(tmpdir(), 'i6z-'));

    try {
      // Extract the i6z (ZIP) file
      await this.extractZip(i6zPath, tempDir);

      // Find the .i6i file (the main data file)
      const i6iFile = await this.findI6iFile(tempDir);
      if (!i6iFile) {
        return [];
      }

      // Read the large XML file
      const xmlContent = await readFile(i6iFile, 'utf-8');

      // Parse the XML
      const xmlParser = new XMLParser({
        ignoreAttributes: true,
        textNodeName: '_text',
        isArray: (name) => name === 'inventoryEntry' || name === 'inventoryName',
      });

      const doc = xmlParser.parse(xmlContent);

      // Extract inventory entries
      const inventory = doc?.Inventory;
      if (!inventory) {
        return [];
      }

      const entries = inventory.inventoryEntries?.inventoryEntry;
      if (!entries || !Array.isArray(entries)) {
        return [];
      }

      const records: EchaInventoryRecord[] = [];
      let processed = 0;

      for (const entry of entries) {
        processed++;

        if (onProgress && processed % 10000 === 0) {
          onProgress(processed, records.length);
        }

        const record = this.parseInventoryEntry(entry);
        if (record) {
          records.push(record);
        }
      }

      if (onProgress) {
        onProgress(processed, records.length);
      }

      return records;
    } finally {
      // Cleanup temp directory
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Parses a single inventory entry from the EC Inventory XML.
   */
  private parseInventoryEntry(entry: Record<string, unknown>): EchaInventoryRecord | null {
    try {
      // EC Number (inventoryNumber)
      const ecNumber = String(entry['inventoryNumber'] || '').trim();

      // Name (first inventoryName)
      const names = entry['inventoryNames'] as { inventoryName?: string | string[] } | undefined;
      let primaryName = '';
      if (names?.inventoryName) {
        if (Array.isArray(names.inventoryName)) {
          primaryName = String(names.inventoryName[0] || '').trim();
        } else {
          primaryName = String(names.inventoryName || '').trim();
        }
      }

      // Must have EC number and name
      if (!ecNumber || !primaryName) {
        return null;
      }

      // CAS Number (optional)
      const rawCas = String(entry['casNumber'] || '').trim();
      let casNumber: string | undefined;

      if (rawCas && !isNoCasValue(rawCas)) {
        const sanitized = sanitizeCas(rawCas);
        if (sanitized) {
          casNumber = sanitized;
        }
      }

      // Molecular Formula (optional)
      const molecularFormula = String(entry['molecularFormula'] || '').trim() || undefined;

      return {
        ecNumber,
        primaryName: primaryName.toLowerCase(),
        casNumber,
        molecularFormula,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extracts a ZIP file to a directory.
   */
  private async extractZip(zipPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      createReadStream(zipPath)
        .pipe(Extract({ path: outputDir }))
        .on('close', resolve)
        .on('error', reject);
    });
  }

  /**
   * Finds the .i6i file in the extracted directory.
   */
  private async findI6iFile(dir: string): Promise<string | null> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.i6i')) {
        return join(dir, entry.name);
      }
    }
    return null;
  }

  /**
   * Parses an array of raw CSV rows into records.
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
