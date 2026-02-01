// packages/gsr/src/parsers/clp-classification.parser.ts

import type { HazardClassDefinition } from '../reference-data/hazard-classes.js';

/**
 * Parsed CLP classification extracted from Annex VI classification strings.
 */
export interface ParsedClassification {
  /** Standard CLP abbreviation (e.g., "Carc.", "Muta.", "Acute Tox.") */
  hazardClass: string;
  /** Category (e.g., "1A", "1B", "2", "3", "4") - undefined for some classes */
  category?: string;
  /** H-code (e.g., "H350", "H350i", "H360FD") - undefined for some classes */
  hCode?: string;
  /** True if asterisk was present (e.g., "4*") indicating minimum classification */
  isMinimumClassification: boolean;
  /** Any trailing text after the main components */
  additionalInfo?: string;
}

/**
 * Parser for CLP (Classification, Labelling and Packaging) classification strings
 * from ECHA's Annex VI Harmonised List.
 *
 * Validates hazard classes against a whitelist dictionary to filter out
 * garbage data and unknown classifications.
 *
 * @example
 * ```typescript
 * const dictionary = buildHazardClassDictionary();
 * const parser = new ClpClassificationParser(dictionary);
 *
 * const result = parser.parseSingleClassification('Carc. 1B, H350');
 * // { hazardClass: 'Carc.', category: '1B', hCode: 'H350', isMinimumClassification: false }
 * ```
 */
export class ClpClassificationParser {
  private readonly dictionary: Map<string, HazardClassDefinition>;
  private readonly normalizedToCode: Map<string, string>;

  constructor(dictionary: Map<string, HazardClassDefinition>) {
    this.dictionary = dictionary;
    // Build a normalized lookup map for case-insensitive matching
    this.normalizedToCode = new Map();
    for (const code of dictionary.keys()) {
      this.normalizedToCode.set(code.toLowerCase().trim(), code);
    }
  }

  /**
   * Parse a single CLP classification string.
   *
   * @param raw - The raw classification string (e.g., "Carc. 1B, H350")
   * @returns Parsed classification or null if invalid/unknown
   */
  parseSingleClassification(raw: string): ParsedClassification | null {
    // Handle empty/garbage input
    if (!raw || typeof raw !== 'string') {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed || trimmed === '.' || trimmed === '-') {
      return null;
    }

    // Try to match the classification string
    const result = this.parseClassificationString(trimmed);
    if (!result) {
      return null;
    }

    // Validate hazard class against whitelist
    const normalizedClass = result.hazardClass.toLowerCase().trim();
    const canonicalCode = this.normalizedToCode.get(normalizedClass);

    if (!canonicalCode) {
      // Unknown hazard class
      return null;
    }

    return {
      hazardClass: canonicalCode,
      category: result.category,
      hCode: result.hCode,
      isMinimumClassification: result.isMinimumClassification,
      additionalInfo: result.additionalInfo,
    };
  }

  /**
   * Parse a multi-line block of CLP classifications.
   *
   * @param block - The raw block text containing multiple classifications
   * @returns Array of parsed classifications (invalid lines are skipped)
   */
  parseClassificationBlock(block: string): ParsedClassification[] {
    if (!block || typeof block !== 'string') {
      return [];
    }

    const results: ParsedClassification[] = [];
    // Handle both Unix and Windows line endings
    const lines = block.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const parsed = this.parseSingleClassification(trimmed);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  }

  /**
   * Internal method to parse the classification string structure.
   */
  private parseClassificationString(input: string): {
    hazardClass: string;
    category?: string;
    hCode?: string;
    isMinimumClassification: boolean;
    additionalInfo?: string;
  } | null {
    // Known hazard class codes from the dictionary for matching
    // We need to match the longest possible hazard class prefix first
    const knownCodes = Array.from(this.dictionary.keys()).sort(
      (a, b) => b.length - a.length
    );

    let matchedCode: string | null = null;
    let remainder = input;

    // Try to match a known hazard class code at the start (case-insensitive)
    for (const code of knownCodes) {
      const normalizedInput = input.toLowerCase();
      const normalizedCode = code.toLowerCase();
      if (normalizedInput.startsWith(normalizedCode)) {
        matchedCode = code;
        remainder = input.substring(code.length).trim();
        break;
      }
    }

    if (!matchedCode) {
      // No known hazard class matched
      return null;
    }

    // Parse the remainder: [category][*][, H-code][additional info]
    // Category pattern: number optionally followed by letter (e.g., 1, 1A, 1B, 2, 3)
    // Asterisk: indicates minimum classification
    // H-code pattern: H followed by digits and optional letters (e.g., H350, H350i, H360FD)

    let category: string | undefined;
    let isMinimumClassification = false;
    let hCode: string | undefined;
    let additionalInfo: string | undefined;

    // Pattern to extract: category with optional asterisk, then optional comma + H-code
    const remainderPattern = /^(\d[A-Z]?)?(\*)?(?:,?\s*)?(H\d+[A-Za-z]*)?(.*)$/i;
    const match = remainder.match(remainderPattern);

    if (match) {
      category = match[1] || undefined;
      isMinimumClassification = match[2] === '*';
      hCode = match[3] || undefined;
      const trailing = match[4]?.trim();
      if (trailing) {
        additionalInfo = trailing;
      }
    }

    return {
      hazardClass: matchedCode,
      category,
      hCode,
      isMinimumClassification,
      additionalInfo,
    };
  }
}
