export interface CasParts {
  firstPart: string;   // 2-7 digits
  secondPart: string;  // 2 digits
  checkDigit: string;  // 1 digit
}

/**
 * Validate a CAS Registry Number.
 *
 * CAS numbers have the format: XXXX-XX-X
 * - First part: 2-7 digits
 * - Second part: 2 digits
 * - Third part: 1 check digit
 *
 * The check digit is calculated as:
 * Sum of (each digit × its position from right, starting at 1) mod 10
 *
 * @param cas CAS number to validate (e.g., "7732-18-5")
 * @returns true if valid, false otherwise
 */
export function isValidCasNumber(cas: string): boolean {
  if (!cas || typeof cas !== 'string') {
    return false;
  }

  // Format: XXXXXXX-XX-X (2-7 digits, hyphen, 2 digits, hyphen, 1 digit)
  const match = cas.match(/^(\d{2,7})-(\d{2})-(\d)$/);
  if (!match) {
    return false;
  }

  const [, firstPart, secondPart, checkDigitStr] = match;

  // Concatenate first two parts and calculate checksum
  const digits = (firstPart + secondPart).split('').reverse();
  const checkDigit = parseInt(checkDigitStr, 10);

  // Calculate: sum of (digit × position) where position starts at 1
  const sum = digits.reduce((acc, digit, index) => {
    return acc + parseInt(digit, 10) * (index + 1);
  }, 0);

  return sum % 10 === checkDigit;
}

/**
 * Parse a CAS number into its components.
 *
 * @param cas CAS number to parse
 * @returns Parsed components or null if invalid format
 */
export function parseCasNumber(cas: string): CasParts | null {
  const match = cas?.match(/^(\d{2,7})-(\d{2})-(\d)$/);
  if (!match) {
    return null;
  }

  return {
    firstPart: match[1],
    secondPart: match[2],
    checkDigit: match[3],
  };
}

/**
 * Format a CAS number string into standard format.
 * Handles both already-formatted and unformatted inputs.
 *
 * @param input Raw CAS number (e.g., "7732185" or "7732-18-5")
 * @returns Formatted CAS number or null if invalid
 */
export function formatCasNumber(input: string): string | null {
  if (!input) {
    return null;
  }

  // Already formatted?
  if (isValidCasNumber(input)) {
    return input;
  }

  // Remove any non-digits
  const digitsOnly = input.replace(/\D/g, '');

  // Need at least 5 digits (2+2+1)
  if (digitsOnly.length < 5 || digitsOnly.length > 10) {
    return null;
  }

  // Try to format: last digit is check, previous 2 are second part, rest is first part
  const checkDigit = digitsOnly.slice(-1);
  const secondPart = digitsOnly.slice(-3, -1);
  const firstPart = digitsOnly.slice(0, -3);

  const formatted = `${firstPart}-${secondPart}-${checkDigit}`;

  // Validate the result
  return isValidCasNumber(formatted) ? formatted : null;
}
