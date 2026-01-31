// packages/gsr/src/utils/name-normalizer.ts

/**
 * Patterns to remove from substance names during sanitization
 */
const SANITIZE_PATTERNS = [
  /\bCAS[:#\s]*[\d-]+/gi,           // CAS 1309-60-0
  /\(CAS[:#\s]*[\d-]+\)/gi,         // (CAS: 1309-60-0)
  /\[EC\s*[\d-]+\]/gi,              // [EC 215-174-5]
  /\bEC[:#\s]*[\d-]+/gi,            // EC:215-174-5
  /[≥<>]=?\s*\d+\.?\d*\s*%/g,       // ≥99%, <0.1%
  /,\s*\d+\.?\d*\s*%/g,             // , 99.9%
  /\s*\(\s*\)/g,                    // Empty parentheses left over
];

/**
 * Normalizes a substance name for consistent storage and matching.
 *
 * - Lowercases
 * - Collapses whitespace
 * - Removes special characters (keeps hyphens, numbers, Greek letters)
 *
 * Used for the `nameNormalized` field in SubstanceAlias.
 */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';

  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')                    // Collapse whitespace
    .replace(/[^\p{L}\p{N}\s-]/gu, '')       // Remove non-letter, non-number, non-space, non-hyphen
    .trim();
}

/**
 * Sanitizes a substance name by removing common annotations,
 * then normalizes it.
 *
 * Removes:
 * - CAS number annotations
 * - EC number annotations
 * - Purity percentages
 */
export function sanitizeName(raw: string | null | undefined): string {
  if (!raw) return '';

  let cleaned = raw;

  for (const pattern of SANITIZE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  return normalizeName(cleaned);
}
