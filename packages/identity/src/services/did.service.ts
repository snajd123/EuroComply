/**
 * DID (Decentralized Identifier) Service
 *
 * Handles DID creation, resolution, and document management.
 * Supports did:web (immediate) and did:ebsi (future).
 */

import { getWaltIdAdapter } from '../adapters/waltid.adapter.js';
import { getConfig } from '../config.js';
import { getKeyService } from './key.service.js';
import type { DidDocument, DidMethod, KeyAlgorithm } from '../types.js';

export interface CreateDidOptions {
  /** DID method to use */
  method?: DidMethod;
  /** Identifier path (e.g., merchant slug) */
  identifier: string;
  /** Key algorithm for the DID */
  algorithm?: KeyAlgorithm;
  /** Existing key ID to use (if already generated) */
  existingKeyId?: string;
}

export interface DidCreationResult {
  did: string;
  keyId: string;
  didDocument: DidDocument;
}

export class DidService {
  private adapter = getWaltIdAdapter();
  private config = getConfig();
  private keyService = getKeyService();

  /**
   * Create a new DID for an entity
   *
   * @param options - DID creation options
   * @returns DID, key ID, and DID document
   */
  async createDid(options: CreateDidOptions): Promise<DidCreationResult> {
    const method = options.method || this.config.did.method;
    const algorithm = options.algorithm || 'ES256';

    // Generate or use existing key
    let keyId = options.existingKeyId;
    if (!keyId) {
      const keyPair = await this.keyService.generateKeyPair(algorithm);
      keyId = keyPair.keyId;
    }

    if (method === 'web') {
      return this.createDidWeb(options.identifier, keyId);
    } else if (method === 'ebsi') {
      return this.createDidEbsi(options.identifier, keyId);
    }

    throw new Error(`Unsupported DID method: ${method}`);
  }

  /**
   * Create a did:web identifier
   *
   * Format: did:web:eurocomply.io:m:{merchant-slug}
   */
  private async createDidWeb(identifier: string, keyId: string): Promise<DidCreationResult> {
    const domain = this.config.did.domain;
    const path = `m/${identifier}`;

    const available = await this.adapter.isAvailable();

    let didDocument: DidDocument;

    if (available) {
      didDocument = await this.adapter.createDidWeb(domain, path, keyId);
    } else if (this.config.features.fallbackToSimulation) {
      didDocument = await this.createSimulatedDidWeb(domain, path, keyId);
    } else {
      throw new Error('walt.id services unavailable and simulation disabled');
    }

    return {
      did: didDocument.id,
      keyId,
      didDocument,
    };
  }

  /**
   * Create a did:ebsi identifier
   *
   * Note: EBSI registration requires additional steps and fees.
   * This is a placeholder for future implementation.
   */
  private async createDidEbsi(identifier: string, keyId: string): Promise<DidCreationResult> {
    // EBSI DIDs require:
    // 1. Onboarding to EBSI network
    // 2. Registration transaction on EBSI ledger
    // 3. This costs ~€10-50 per DID

    // For now, fall back to did:web with a note
    console.warn(
      'did:ebsi not yet implemented, falling back to did:web. ' +
        'EBSI integration requires network onboarding.'
    );

    return this.createDidWeb(identifier, keyId);
  }

  /**
   * Resolve a DID to its DID document
   *
   * @param did - DID to resolve
   * @returns DID document or null if not found
   */
  async resolveDid(did: string): Promise<DidDocument | null> {
    // Try walt.id resolver first
    const available = await this.adapter.isAvailable();

    if (available) {
      const document = await this.adapter.resolveDid(did);
      if (document) return document;
    }

    // For did:web, we can resolve directly via HTTP
    if (did.startsWith('did:web:')) {
      return this.resolveDidWeb(did);
    }

    return null;
  }

  /**
   * Resolve did:web via HTTP
   */
  private async resolveDidWeb(did: string): Promise<DidDocument | null> {
    try {
      // Parse did:web
      // did:web:eurocomply.io:m:acme-corp -> https://eurocomply.io/m/acme-corp/did.json
      const parts = did.replace('did:web:', '').split(':');
      const domain = parts[0];
      const path = parts.slice(1).join('/');

      const url = path
        ? `https://${domain}/${path}/did.json`
        : `https://${domain}/.well-known/did.json`;

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) return null;

      return (await response.json()) as DidDocument;
    } catch {
      return null;
    }
  }

  /**
   * Get DID document for hosting
   *
   * This returns the DID document that should be hosted at:
   * - /.well-known/did.json (for platform DID)
   * - /m/{slug}/did.json (for merchant DIDs)
   *
   * @param did - DID to get document for
   * @param keyId - Key ID for the DID
   * @returns DID document for hosting
   */
  async getDidDocument(did: string, keyId: string): Promise<DidDocument> {
    const publicKey = await this.keyService.getPublicKey(keyId);

    return {
      '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
      id: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: publicKey,
        },
      ],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
    };
  }

  /**
   * Update a DID document
   *
   * @param did - DID to update
   * @param updates - Fields to update
   * @returns Updated DID document
   */
  async updateDidDocument(
    did: string,
    keyId: string,
    updates: Partial<Pick<DidDocument, 'service' | 'alsoKnownAs'>>
  ): Promise<DidDocument> {
    const document = await this.getDidDocument(did, keyId);

    if (updates.service) {
      document.service = updates.service;
    }

    if (updates.alsoKnownAs) {
      document.alsoKnownAs = updates.alsoKnownAs;
    }

    return document;
  }

  /**
   * Create platform DID (did:web:eurocomply.io)
   */
  async createPlatformDid(keyId?: string): Promise<DidCreationResult> {
    const domain = this.config.did.domain;

    let actualKeyId = keyId;
    if (!actualKeyId) {
      const keyPair = await this.keyService.generateKeyPair('ES256');
      actualKeyId = keyPair.keyId;
    }

    const did = `did:web:${domain}`;
    const didDocument = await this.getDidDocument(did, actualKeyId);

    return {
      did,
      keyId: actualKeyId,
      didDocument,
    };
  }

  /**
   * Build DID string for a merchant
   */
  buildMerchantDid(merchantSlug: string): string {
    return `did:web:${this.config.did.domain}:m:${merchantSlug}`;
  }

  /**
   * Build DID string for a product (as URN)
   */
  buildProductUrn(gtin: string): string {
    return `urn:gtin:${gtin}`;
  }

  // ===========================================
  // Simulation Methods (Development Only)
  // ===========================================

  private async createSimulatedDidWeb(
    domain: string,
    path: string,
    keyId: string
  ): Promise<DidDocument> {
    const didPath = path ? `:${path.replace(/\//g, ':')}` : '';
    const did = `did:web:${domain}${didPath}`;

    const publicKey = await this.keyService.getPublicKey(keyId);

    return {
      '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
      id: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: publicKey,
        },
      ],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
    };
  }
}

// Singleton instance
let didService: DidService | null = null;

export function getDidService(): DidService {
  if (!didService) {
    didService = new DidService();
  }
  return didService;
}

export function resetDidService(): void {
  didService = null;
}
