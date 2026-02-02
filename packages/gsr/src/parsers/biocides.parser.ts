// packages/gsr/src/parsers/biocides.parser.ts

/**
 * Raw row format from ECHA Biocides Article 95 list XLSX export.
 *
 * The Article 95 list contains active biocidal substances approved for
 * specific product types (PT1-22) under the Biocidal Products Regulation (EU) 528/2012.
 *
 * @see https://echa.europa.eu/information-on-chemicals/active-substance-suppliers
 */
export interface BiocidesRow {
  /** Active biocidal substance name */
  'Active Substance Name': string;
  /** EC (EINECS/ELINCS) number, may be "Not allocated" */
  'EC no.': string;
  /** CAS Registry Number, may be empty or "Not allocated" */
  'CAS no.': string;
  /** Product Type (1-22) - biocide category */
  'PT': number | string;
  /** Supplier/Entity name */
  'Entity Name': string;
  /** Country of the supplier */
  'Country': string;
  /** Supplier type (Substance Supplier, Product Supplier, Substance & Product Supplier) */
  'Supplier Type': string;
  /** Reason for inclusion (Art. 95 Submission, RP Participant) */
  'Inclusion Reason': string;
  /** Inclusion date for active substance-product type (Excel serial date, optional) */
  'Inclusion Date AS-PT'?: number;
  /** Inclusion date for supplier (Excel serial date, optional) */
  'Inclusion Date Supplier'?: number;
}

/**
 * Parsed and normalized Biocides Article 95 entry.
 */
export interface ParsedBiocidesEntry {
  /** Active biocidal substance name */
  substanceName: string;
  /** EC number or null if "Not allocated" or empty */
  ecNumber: string | null;
  /** CAS number or null if "Not allocated" or empty */
  casNumber: string | null;
  /** Product type (1-22) as integer */
  productType: number;
  /** Supplier/Entity name */
  entityName: string;
  /** Country of the supplier */
  country: string;
  /** Supplier type */
  supplierType: string;
  /** Reason for inclusion in Article 95 list */
  inclusionReason: string;
}

/**
 * Patterns for values that indicate "no value" (not an error).
 */
const NO_VALUE_PATTERNS = [/^-$/, /^$/, /^not\s*allocated$/i];

/**
 * Checks if a value represents "no value" (placeholder or empty).
 *
 * @param value - The raw string value to check
 * @returns true if the value should be treated as null
 */
function isNoValue(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  return NO_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Cleans a chemical identifier (EC or CAS number), returning null if invalid or placeholder.
 *
 * @param value - Raw identifier value
 * @returns Trimmed identifier or null if it's a placeholder
 */
function cleanIdentifier(value: string | undefined): string | null {
  if (isNoValue(value)) return null;
  return value!.trim();
}

/**
 * Parses the product type field to ensure it's a number.
 *
 * @param pt - Product type field (may be number or string)
 * @returns Product type as integer
 */
function parseProductType(pt: number | string): number {
  if (typeof pt === 'number') {
    return pt;
  }
  return parseInt(pt, 10);
}

/**
 * Parses a single row from the ECHA Biocides Article 95 list XLSX.
 *
 * @param row - Raw row data from the XLSX file
 * @returns Parsed Biocides entry with normalized fields
 *
 * @example
 * ```typescript
 * const row: BiocidesRow = {
 *   'Active Substance Name': 'alpha-Cypermethrin',
 *   'EC no.': '214-619-0',
 *   'CAS no.': '67375-30-8',
 *   'PT': 18,
 *   'Entity Name': 'Test Company',
 *   'Country': 'Spain',
 *   'Supplier Type': 'Substance & Product Supplier',
 *   'Inclusion Reason': 'Art. 95 Submission',
 * };
 *
 * const parsed = parseBiocidesRow(row);
 * // {
 * //   substanceName: 'alpha-Cypermethrin',
 * //   ecNumber: '214-619-0',
 * //   casNumber: '67375-30-8',
 * //   productType: 18,
 * //   entityName: 'Test Company',
 * //   country: 'Spain',
 * //   supplierType: 'Substance & Product Supplier',
 * //   inclusionReason: 'Art. 95 Submission'
 * // }
 * ```
 */
export function parseBiocidesRow(row: BiocidesRow): ParsedBiocidesEntry {
  return {
    substanceName: row['Active Substance Name']?.trim() || '',
    ecNumber: cleanIdentifier(row['EC no.']),
    casNumber: cleanIdentifier(row['CAS no.']),
    productType: parseProductType(row['PT']),
    entityName: row['Entity Name']?.trim() || '',
    country: row['Country']?.trim() || '',
    supplierType: row['Supplier Type']?.trim() || '',
    inclusionReason: row['Inclusion Reason']?.trim() || '',
  };
}
