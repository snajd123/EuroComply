// packages/gsr/src/parsers/tsca.parser.ts
import { TscaInventoryStatus } from '../entities/SubstanceTsca.js';

/**
 * Raw row format from EPA TSCA Inventory CSV export.
 *
 * The TSCA (Toxic Substances Control Act) Inventory contains chemicals
 * manufactured or processed in the United States.
 *
 * @see https://www.epa.gov/tsca-inventory
 */
export interface TscaRow {
  /** Row identifier in the CSV */
  ID: string;
  /** CAS Registry Number (primary) */
  CASRN: string;
  /** Alternative CAS Registry Number field (some exports use this) */
  casregno?: string;
  /** Unique identifier */
  UID?: string;
  /** Exempt flag */
  EXP?: string;
  /** Chemical name */
  ChemName: string;
  /** Definition/description */
  DEF?: string;
  /** UVCB flag (Unknown or Variable composition, Complex reaction products, Biological materials) */
  UVCB?: string;
  /**
   * Regulatory flags (comma-separated):
   * - S: Subject to significant new use rule (SNUR)
   * - P: Production/import restrictions
   * - XU: Exempt under specific conditions
   */
  FLAG?: string;
  /** Inventory status: ACTIVE or INACTIVE */
  ACTIVITY: string;
}

/**
 * Parsed and normalized TSCA inventory entry.
 */
export interface ParsedTscaEntry {
  /** TSCA-specific CAS number (cleaned) */
  tscaCas: string;
  /** Chemical name */
  chemName: string;
  /** Inventory status (ACTIVE or INACTIVE) */
  inventoryStatus: TscaInventoryStatus;
  /** Whether the substance is a UVCB (Unknown or Variable composition, Complex reaction products, Biological) */
  isUvcb: boolean;
  /** Whether the substance has regulatory restrictions (FLAG contains 'S') */
  hasRestrictions: boolean;
  /** Array of regulatory flags */
  flags: string[];
}

/**
 * Parses the ACTIVITY field to determine inventory status.
 *
 * @param activity - Raw ACTIVITY field value
 * @returns TscaInventoryStatus.ACTIVE if 'ACTIVE', otherwise INACTIVE
 */
function parseActivityStatus(activity: string): TscaInventoryStatus {
  const normalized = activity.trim().toUpperCase();
  return normalized === 'ACTIVE'
    ? TscaInventoryStatus.ACTIVE
    : TscaInventoryStatus.INACTIVE;
}

/**
 * Parses the FLAG field into an array of flags.
 *
 * The FLAG field may contain comma-separated values like 'S', 'P', 'XU'.
 *
 * @param flag - Raw FLAG field value (may be undefined or empty)
 * @returns Array of trimmed flag strings
 */
function parseFlags(flag: string | undefined): string[] {
  if (!flag || flag.trim() === '') {
    return [];
  }

  return flag
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/**
 * Determines if a substance has restrictions based on flags.
 *
 * A substance has restrictions if the FLAG field contains 'S' (SNUR).
 *
 * @param flags - Array of parsed flags
 * @returns true if 'S' flag is present
 */
function hasRestrictionFlag(flags: string[]): boolean {
  return flags.includes('S');
}

/**
 * Parses the UVCB field to determine if substance is a UVCB.
 *
 * UVCB = Unknown or Variable composition, Complex reaction products,
 * or Biological materials.
 *
 * @param uvcb - Raw UVCB field value
 * @returns true if UVCB flag is present
 */
function parseUvcbFlag(uvcb: string | undefined): boolean {
  if (!uvcb) return false;
  return uvcb.trim().toUpperCase() === 'UVCB';
}

/**
 * Gets the CAS number from the row, preferring CASRN over casregno.
 *
 * @param row - Raw TSCA row
 * @returns Trimmed CAS number string
 */
function getCasNumber(row: TscaRow): string {
  const casrn = row.CASRN?.trim() || '';
  if (casrn) return casrn;

  return row.casregno?.trim() || '';
}

/**
 * Parses a single row from the EPA TSCA Inventory CSV.
 *
 * @param row - Raw CSV row data
 * @returns Parsed TSCA entry with normalized fields
 *
 * @example
 * ```typescript
 * const row: TscaRow = {
 *   ID: '1',
 *   CASRN: '71-43-2',
 *   ChemName: 'Benzene',
 *   ACTIVITY: 'ACTIVE',
 *   FLAG: 'S',
 *   UVCB: '',
 * };
 *
 * const parsed = parseTscaRow(row);
 * // {
 * //   tscaCas: '71-43-2',
 * //   chemName: 'Benzene',
 * //   inventoryStatus: TscaInventoryStatus.ACTIVE,
 * //   isUvcb: false,
 * //   hasRestrictions: true,
 * //   flags: ['S']
 * // }
 * ```
 */
export function parseTscaRow(row: TscaRow): ParsedTscaEntry {
  const tscaCas = getCasNumber(row);
  const chemName = row.ChemName?.trim() || '';
  const inventoryStatus = parseActivityStatus(row.ACTIVITY);
  const isUvcb = parseUvcbFlag(row.UVCB);
  const flags = parseFlags(row.FLAG);
  const hasRestrictions = hasRestrictionFlag(flags);

  return {
    tscaCas,
    chemName,
    inventoryStatus,
    isUvcb,
    hasRestrictions,
    flags,
  };
}
