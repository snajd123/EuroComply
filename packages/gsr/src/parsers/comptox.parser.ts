// packages/gsr/src/parsers/comptox.parser.ts
import { sanitizeCas } from '../utils/cas-sanitizer.js';

/**
 * Raw row format from CompTox CSV export (DSSToxCCDdump.csv from EPA).
 */
export interface ComptoxRow {
  DTXSID: string;
  PREFERRED_NAME: string;
  CASRN: string;
  INCHIKEY: string;
  IUPAC_NAME: string;
  SMILES: string;
  MOLECULAR_FORMULA: string;
  AVERAGE_MASS: string;
  DTXCID?: string;
  QSAR_READY_SMILES?: string;
  MS_READY_SMILES?: string;
  IDENTIFIER?: string;
}

/**
 * Parsed substance data from CompTox row.
 */
export interface ParsedComptoxSubstance {
  dtxsid: string;
  canonicalName: string;
  casNumber: string | null;
  inchiKey: string | null;
  iupacName: string | null;
  smiles: string | null;
  molecularFormula: string | null;
  molecularWeight: number | null;
  qcLevel: number | null;
}

/**
 * Converts an empty string to null, otherwise trims the value.
 */
function emptyToNull(value: string | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Parses a molecular weight string to a number, or null if invalid.
 */
function parseMolecularWeight(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'n/a' || trimmed.toLowerCase() === 'unknown') {
    return null;
  }

  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parses a single row from the CompTox CSV.
 *
 * @param row - Raw CSV row data
 * @returns Parsed substance data with cleaned fields
 */
export function parseComptoxRow(row: ComptoxRow): ParsedComptoxSubstance {
  const dtxsid = row.DTXSID.trim();
  const canonicalName = row.PREFERRED_NAME.trim();

  // Sanitize CAS number - returns null for invalid/placeholder values
  const casNumber = sanitizeCas(row.CASRN);

  // Handle optional string fields
  const inchiKey = emptyToNull(row.INCHIKEY);
  const iupacName = emptyToNull(row.IUPAC_NAME);
  const smiles = emptyToNull(row.SMILES);
  const molecularFormula = emptyToNull(row.MOLECULAR_FORMULA);

  // Parse molecular weight
  const molecularWeight = parseMolecularWeight(row.AVERAGE_MASS);

  // qcLevel is not available in the basic CSV export
  const qcLevel: number | null = null;

  return {
    dtxsid,
    canonicalName,
    casNumber,
    inchiKey,
    iupacName,
    smiles,
    molecularFormula,
    molecularWeight,
    qcLevel,
  };
}
