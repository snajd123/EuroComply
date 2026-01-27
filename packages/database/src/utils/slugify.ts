/**
 * Convert a category name to a tenant-local LTREE-compatible path segment.
 *
 * - Lowercase
 * - Replace non-alphanumeric with underscores
 * - Trim leading/trailing underscores
 * - Limit to 50 characters (LTREE compatibility)
 */
export function slugify(name: string): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50);
}
