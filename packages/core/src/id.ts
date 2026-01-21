import { createId as cuid2CreateId, isCuid as cuid2IsCuid } from '@paralleldrive/cuid2';

/**
 * Generates a new CUID2 identifier.
 * CUID2 is collision-resistant and sortable.
 */
export function createId(): string {
  return cuid2CreateId();
}

/**
 * Validates if a string is a valid CUID2.
 * Checks both format (via cuid2) and length (21-24 characters).
 */
export function isCuid(id: string): boolean {
  return cuid2IsCuid(id) && id.length >= 21 && id.length <= 24;
}
