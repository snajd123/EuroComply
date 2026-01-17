/**
 * R2 Storage Handler for Digital Product Passports
 *
 * Provides functions to build storage keys and fetch DPP files from R2 buckets.
 */

/**
 * Result returned when fetching a DPP file from R2
 */
export interface DppFileResult {
  body: ReadableStream;
  contentType: string | undefined;
  etag: string;
  size: number;
}

/**
 * Builds the R2 storage key for a DPP file
 *
 * @param organizationId - The organization ID (e.g., "org_123")
 * @param passportId - The passport ID (e.g., "pass_456")
 * @param file - The file name (e.g., "credential.json", "preview.html", "qr.png")
 * @returns The R2 key in format: {organizationId}/{passportId}/{file}
 */
export function buildStorageKey(
  organizationId: string,
  passportId: string,
  file: string
): string {
  return `${organizationId}/${passportId}/${file}`;
}

/**
 * Fetches a DPP file from the R2 bucket
 *
 * @param bucket - The R2 bucket to fetch from
 * @param organizationId - The organization ID
 * @param passportId - The passport ID
 * @param file - The file name to fetch
 * @returns DppFileResult if file found, null otherwise
 */
export async function getDppFile(
  bucket: R2Bucket,
  organizationId: string,
  passportId: string,
  file: string
): Promise<DppFileResult | null> {
  const key = buildStorageKey(organizationId, passportId, file);
  const object = await bucket.get(key);

  if (object === null) {
    return null;
  }

  return {
    body: object.body,
    contentType: object.httpMetadata?.contentType,
    etag: object.etag,
    size: object.size,
  };
}
