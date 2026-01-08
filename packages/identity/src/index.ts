/**
 * @eurocomply/identity
 *
 * Shared identity infrastructure for EuroComply platform.
 * Provides DID management, Verifiable Credential issuance/verification,
 * and key management via walt.id Community Stack.
 *
 * @example
 * ```typescript
 * import { getDidService, getVcService, getKeyService } from '@eurocomply/identity';
 *
 * // Create a DID for a merchant
 * const didService = getDidService();
 * const { did, keyId, didDocument } = await didService.createDid({
 *   identifier: 'acme-corp',
 * });
 *
 * // Issue a Verifiable Credential
 * const vcService = getVcService();
 * const credential = await vcService.issueDPP(did, keyId, {
 *   gtin: '01234567890123',
 *   productName: 'Eco Widget',
 *   manufacturerName: 'ACME Corp',
 *   carbonFootprint: { value: 2.5, unit: 'kgCO2e' },
 * });
 * ```
 */

// Services
export { DidService, getDidService, resetDidService } from './services/did.service.js';
export type { CreateDidOptions, DidCreationResult } from './services/did.service.js';

export { VcService, getVcService, resetVcService } from './services/vc.service.js';
export type { IssueCredentialOptions, IssuedCredential, RevocationEntry } from './services/vc.service.js';

export { KeyService, getKeyService, resetKeyService } from './services/key.service.js';
export type { KeyPair, SignatureResult } from './services/key.service.js';

// Data Sovereignty Services (Phase 3.5)
export { DidKeyService, getDidKeyService, resetDidKeyService } from './services/did-key.service.js';
export type { DidKeyCreationOptions, DidKeyCreationResult } from './services/did-key.service.js';

export { VcExportService, getVcExportService, resetVcExportService } from './services/vc-export.service.js';
export type {
  EmbeddedImage,
  CreateSelfContainedVCOptions,
  ExportPackageOptions,
  ExportPackage,
  ExportPackageFile,
  OfflineVerificationResult,
} from './services/vc-export.service.js';

// Adapter (for advanced use cases)
export {
  WaltIdAdapter,
  getWaltIdAdapter,
  resetWaltIdAdapter,
} from './adapters/waltid.adapter.js';

// Configuration
export {
  getConfig,
  setConfig,
  resetConfig,
  defaultConfig,
} from './config.js';
export type { IdentityConfig, WaltIdConfig, DidConfig, FeatureFlags } from './config.js';

// Types
export type {
  DidDocument,
  DidMethod,
  VerificationMethod,
  ServiceEndpoint,
  VerifiableCredential,
  CredentialSubject,
  CredentialProof,
  VerificationResult,
  JsonWebKey,
  KeyAlgorithm,
  CredentialType,
} from './types.js';

export { CredentialTypes } from './types.js';

// Convenience function to reset all services (useful for testing)
export function resetAllServices(): void {
  const { resetDidService } = require('./services/did.service.js');
  const { resetVcService } = require('./services/vc.service.js');
  const { resetKeyService } = require('./services/key.service.js');
  const { resetWaltIdAdapter } = require('./adapters/waltid.adapter.js');
  const { resetConfig } = require('./config.js');

  resetDidService();
  resetVcService();
  resetKeyService();
  resetWaltIdAdapter();
  resetConfig();
}

// Version
export const VERSION = '0.1.0';
