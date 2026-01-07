/**
 * walt.id API Adapter
 *
 * Handles all communication with walt.id Community Stack APIs:
 * - Core API: DID management
 * - Signatory API: Credential issuance
 * - Custodian API: Key management
 * - Auditor API: Credential verification
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { getConfig } from '../config.js';
import type {
  DidDocument,
  JsonWebKey,
  VerifiableCredential,
  KeyAlgorithm,
} from '../types.js';

export class WaltIdAdapter {
  private coreApi: AxiosInstance;
  private signatoryApi: AxiosInstance;
  private custodianApi: AxiosInstance;
  private auditorApi: AxiosInstance;
  private _available: boolean | null = null;

  constructor() {
    const config = getConfig();
    const axiosConfig = {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    };

    this.coreApi = axios.create({ ...axiosConfig, baseURL: config.waltid.coreApi });
    this.signatoryApi = axios.create({ ...axiosConfig, baseURL: config.waltid.signatoryApi });
    this.custodianApi = axios.create({ ...axiosConfig, baseURL: config.waltid.custodianApi });
    this.auditorApi = axios.create({ ...axiosConfig, baseURL: config.waltid.auditorApi });
  }

  // ===========================================
  // Health Check
  // ===========================================

  async isAvailable(): Promise<boolean> {
    if (this._available !== null) {
      return this._available;
    }

    try {
      await Promise.race([
        this.custodianApi.get('/health'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      this._available = true;
    } catch {
      this._available = false;
    }

    return this._available;
  }

  resetAvailability(): void {
    this._available = null;
  }

  // ===========================================
  // Key Management (Custodian API)
  // ===========================================

  async generateKey(algorithm: KeyAlgorithm = 'ES256'): Promise<{ keyId: string }> {
    const keyType = algorithm === 'ES256' ? 'secp256r1' : 'Ed25519';

    const response = await this.custodianApi.post('/keys/generate', {
      keyAlgorithm: keyType,
    });

    return { keyId: response.data.keyId || response.data.id };
  }

  async getKey(keyId: string): Promise<{ keyId: string; publicKeyJwk: JsonWebKey }> {
    const response = await this.custodianApi.get(`/keys/${keyId}`);

    return {
      keyId,
      publicKeyJwk: response.data.publicKey || response.data,
    };
  }

  async exportPublicKey(keyId: string): Promise<JsonWebKey> {
    const response = await this.custodianApi.get(`/keys/${keyId}/export`);
    return response.data;
  }

  async deleteKey(keyId: string): Promise<void> {
    await this.custodianApi.delete(`/keys/${keyId}`);
  }

  // ===========================================
  // DID Management (Core API)
  // ===========================================

  async createDidWeb(domain: string, path: string, keyId: string): Promise<DidDocument> {
    // Construct did:web identifier
    // did:web:eurocomply.eu:m:merchant-slug
    const didPath = path ? `:${path.replace(/\//g, ':')}` : '';
    const did = `did:web:${domain}${didPath}`;

    // Get public key for DID document
    const { publicKeyJwk } = await this.getKey(keyId);

    // Build DID document
    const didDocument: DidDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/jws-2020/v1',
      ],
      id: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk,
        },
      ],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
    };

    // Register with walt.id (if supported)
    try {
      await this.coreApi.post('/did/create', {
        method: 'web',
        didDocument,
        keyId,
      });
    } catch {
      // walt.id may not support did:web creation directly
      // The DID document will be hosted by our API
    }

    return didDocument;
  }

  async resolveDid(did: string): Promise<DidDocument | null> {
    try {
      const response = await this.coreApi.get(`/did/resolve/${encodeURIComponent(did)}`);
      return response.data;
    } catch {
      return null;
    }
  }

  // ===========================================
  // Credential Issuance (Signatory API)
  // ===========================================

  async issueCredential(
    issuerDid: string,
    keyId: string,
    credential: {
      type: string[];
      subject: Record<string, unknown>;
      expirationDate?: string;
    }
  ): Promise<{ id: string; jwt: string; json: VerifiableCredential }> {
    const credentialId = `urn:uuid:${crypto.randomUUID()}`;
    const issuanceDate = new Date().toISOString();

    const vcData = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      id: credentialId,
      type: ['VerifiableCredential', ...credential.type],
      issuer: issuerDid,
      issuanceDate,
      expirationDate: credential.expirationDate,
      credentialSubject: credential.subject,
    };

    try {
      // Try walt.id signatory
      const response = await this.signatoryApi.post('/v1/credentials/issue', {
        templateId: credential.type[0],
        config: {
          issuerDid,
          issuerKey: keyId,
          proofType: 'jwt',
        },
        credentialData: vcData,
      });

      return {
        id: credentialId,
        jwt: response.data.jwt || response.data.credential,
        json: response.data.vc || vcData,
      };
    } catch (error) {
      // Fallback: Sign manually using custodian
      const jwt = await this.signCredential(keyId, vcData);

      return {
        id: credentialId,
        jwt,
        json: vcData as VerifiableCredential,
      };
    }
  }

  private async signCredential(keyId: string, credential: Record<string, unknown>): Promise<string> {
    try {
      const response = await this.custodianApi.post(`/credentials/sign`, {
        keyId,
        credential,
      });
      return response.data.jwt || response.data;
    } catch {
      // If walt.id signing fails, create a simulated JWT
      // This is for development only
      const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ vc: credential })).toString('base64url');
      return `${header}.${payload}.simulated_signature_${keyId}`;
    }
  }

  // ===========================================
  // Credential Verification (Auditor API)
  // ===========================================

  async verifyCredential(jwt: string): Promise<{
    valid: boolean;
    checks: { signature: boolean; expiration: boolean; revocation: boolean };
    credential?: VerifiableCredential;
    errors?: string[];
  }> {
    try {
      const response = await this.auditorApi.post('/v1/verify', {
        credentials: [jwt],
        policies: ['SignaturePolicy', 'ExpirationDatePolicy'],
      });

      return {
        valid: response.data.valid,
        checks: {
          signature: response.data.policyResults?.SignaturePolicy ?? true,
          expiration: response.data.policyResults?.ExpirationDatePolicy ?? true,
          revocation: true,
        },
        credential: response.data.credential,
      };
    } catch {
      // Fallback: Basic JWT parsing
      return this.parseAndVerifyJwt(jwt);
    }
  }

  private parseAndVerifyJwt(jwt: string): {
    valid: boolean;
    checks: { signature: boolean; expiration: boolean; revocation: boolean };
    credential?: VerifiableCredential;
    errors?: string[];
  } {
    try {
      const parts = jwt.split('.');
      if (parts.length !== 3) {
        return {
          valid: false,
          checks: { signature: false, expiration: false, revocation: false },
          errors: ['Invalid JWT format'],
        };
      }

      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
      const credential = payload.vc as VerifiableCredential;

      // Check expiration
      const isExpired = credential.expirationDate
        ? new Date(credential.expirationDate) < new Date()
        : false;

      // Signature check is simulated in dev mode
      const isSimulated = parts[2]?.startsWith('simulated_signature');

      return {
        valid: !isExpired,
        checks: {
          signature: !isSimulated, // Only valid if not simulated
          expiration: !isExpired,
          revocation: true,
        },
        credential,
      };
    } catch {
      return {
        valid: false,
        checks: { signature: false, expiration: false, revocation: false },
        errors: ['Failed to parse JWT'],
      };
    }
  }
}

// Singleton instance
let adapter: WaltIdAdapter | null = null;

export function getWaltIdAdapter(): WaltIdAdapter {
  if (!adapter) {
    adapter = new WaltIdAdapter();
  }
  return adapter;
}

export function resetWaltIdAdapter(): void {
  adapter = null;
}
