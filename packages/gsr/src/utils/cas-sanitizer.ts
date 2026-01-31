// packages/gsr/src/utils/cas-sanitizer.ts

/**
 * CAS Registry Number format: XXXXXXX-XX-X
 * - First segment: 2-7 digits
 * - Second segment: 2 digits
 * - Third segment: 1 digit (checksum)
 */
const CAS_PATTERN = /^(\d{2,7})-(\d{2})-(\d)$/;

/**
 * Patterns that indicate non-CAS values
 */
const INVALID_PATTERNS = [
  /^n\/?a$/i,
  /^not\s*(available|applicable)$/i,
  /^proprietary$/i,
  /^trade\s*secret$/i,
  /^confidential$/i,
  /^-$/,
  /^$/,
];

/**
 * Validates CAS Registry Number format and checksum.
 *
 * Algorithm:
 * 1. Remove hyphens, read digits right-to-left (excluding checksum)
 * 2. Multiply each digit by its position (1, 2, 3, ...)
 * 3. Sum all products
 * 4. Checksum = sum mod 10
 */
export function isValidCasChecksum(cas: string | null | undefined): boolean {
  if (!cas) return false;

  const match = cas.match(CAS_PATTERN);
  if (!match) return false;

  // Capture groups are guaranteed to exist since CAS_PATTERN matched
  const first = match[1]!;
  const second = match[2]!;
  const checkDigit = match[3]!;

  const digits = (first + second).split('').reverse();

  const sum = digits.reduce((acc, digit, index) => {
    return acc + parseInt(digit, 10) * (index + 1);
  }, 0);

  return (sum % 10) === parseInt(checkDigit, 10);
}

/**
 * Formats a raw CAS string into canonical format.
 * Handles missing hyphens, extra spaces, etc.
 *
 * @returns Formatted CAS or null if invalid length
 */
export function formatCasNumber(raw: string): string | null {
  // Extract only digits
  const digits = raw.replace(/\D/g, '');

  // CAS numbers have 5-10 digits total
  if (digits.length < 5 || digits.length > 10) return null;

  // Split: last digit is check, previous 2 are middle, rest is first
  const check = digits.slice(-1);
  const middle = digits.slice(-3, -1);
  const first = digits.slice(0, -3);

  return `${first}-${middle}-${check}`;
}

/**
 * Sanitizes raw CAS input: cleans, formats, and validates.
 *
 * @returns Valid CAS number or null if invalid/N/A
 */
export function sanitizeCas(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();

  // Check for known invalid patterns
  for (const pattern of INVALID_PATTERNS) {
    if (pattern.test(trimmed)) return null;
  }

  // Remove common prefixes and clean
  const cleaned = trimmed
    .replace(/^CAS[:#\s]*/i, '')
    .replace(/\s+/g, '')
    .replace(/-+/g, '-')
    .trim();

  // Try to format if not already formatted
  const formatted = CAS_PATTERN.test(cleaned)
    ? cleaned
    : formatCasNumber(cleaned);

  if (!formatted) return null;

  // Validate checksum
  return isValidCasChecksum(formatted) ? formatted : null;
}
