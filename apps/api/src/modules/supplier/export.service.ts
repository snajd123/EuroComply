/**
 * Export Service
 *
 * Provides data sovereignty features for suppliers:
 * - did:key management per supplier
 * - Self-contained VC export
 * - Portable package generation
 * - Key export for ownership transfer
 */

import {
  getDidKeyService,
  getVcExportService,
  type ExportPackage,
  type JsonWebKey,
} from '@eurocomply/identity';
import { logger } from '../../common/utils/logger.js';

// In-memory store for supplier DIDs (in production, use database)
const supplierDidStore = new Map<string, { did: string; keyId: string }>();

export interface SupplierDidResult {
  did: string;
  keyId: string;
  isNew: boolean;
}

export interface ExportOptions {
  includePrivateKey?: boolean;
  includeImages?: boolean;
}

export interface KeyExportResult {
  did: string;
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
  warning: string;
}

/**
 * Get or create a did:key for a supplier
 */
export async function getOrCreateSupplierDid(supplierId: string): Promise<SupplierDidResult> {
  // Check if supplier already has a DID
  const existing = supplierDidStore.get(supplierId);
  if (existing) {
    return {
      ...existing,
      isNew: false,
    };
  }

  // Create new did:key for supplier
  const didKeyService = getDidKeyService();
  const { did, keyId } = await didKeyService.createDidKey({ algorithm: 'EdDSA' });

  // Store mapping
  supplierDidStore.set(supplierId, { did, keyId });

  logger.info(`Created new did:key for supplier ${supplierId}: ${did}`);

  return {
    did,
    keyId,
    isNew: true,
  };
}

/**
 * Export a product's DPP as a portable package
 */
export async function exportProductDpp(
  supplierId: string,
  productId: string,
  dppData: Record<string, unknown>,
  options: ExportOptions = {}
): Promise<ExportPackage> {
  // Get or create supplier DID
  const { did, keyId } = await getOrCreateSupplierDid(supplierId);

  // Build subject ID from GTIN if available
  const gtin = dppData['gtin'] as string | undefined;
  const subjectId = gtin ? `urn:gtin:${gtin}` : `urn:product:${productId}`;

  // Export using vc-export service
  const vcExportService = getVcExportService();
  const packageData = await vcExportService.exportPortablePackage({
    issuerDid: did,
    issuerKeyId: keyId,
    subjectId,
    dppData,
    includePrivateKey: options.includePrivateKey,
  });

  logger.info(`Exported DPP package for product ${productId}, supplier ${supplierId}`);

  return packageData;
}

/**
 * Export supplier's signing keys (for ownership transfer)
 */
export async function exportSupplierKeys(supplierId: string): Promise<KeyExportResult> {
  // Get or create supplier DID
  const { did, keyId } = await getOrCreateSupplierDid(supplierId);

  // Export keys
  const didKeyService = getDidKeyService();
  const privateKey = await didKeyService.exportPrivateKey(keyId);
  const publicKey = await didKeyService.extractPublicKey(did);

  if (!privateKey || !publicKey) {
    throw new Error('Failed to export keys');
  }

  logger.warn(`Private key exported for supplier ${supplierId} - ensure secure handling`);

  return {
    did,
    privateKey,
    publicKey,
    warning:
      'SECURITY WARNING: This private key grants signing authority. ' +
      'Store it in a secure location. Anyone with this key can sign credentials as this identity.',
  };
}

/**
 * Generate an offline HTML viewer for a product
 */
export async function generateProductViewer(
  supplierId: string,
  productId: string,
  dppData: Record<string, unknown>
): Promise<string> {
  // Get or create supplier DID
  const { did, keyId } = await getOrCreateSupplierDid(supplierId);

  // Build subject ID
  const gtin = dppData['gtin'] as string | undefined;
  const subjectId = gtin ? `urn:gtin:${gtin}` : `urn:product:${productId}`;

  // Create self-contained VC
  const vcExportService = getVcExportService();
  const vc = await vcExportService.createSelfContainedVC({
    issuerDid: did,
    issuerKeyId: keyId,
    subjectId,
    dppData,
  });

  // Generate HTML viewer
  return vcExportService.generateOfflineViewer(vc);
}

/**
 * Get supplier's current DID (without creating if doesn't exist)
 */
export function getSupplierDid(supplierId: string): { did: string; keyId: string } | null {
  return supplierDidStore.get(supplierId) || null;
}

/**
 * Reset the store (for testing)
 */
export function resetExportService(): void {
  supplierDidStore.clear();
}
