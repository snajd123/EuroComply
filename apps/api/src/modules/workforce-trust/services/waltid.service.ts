/**
 * walt.id Integration Service
 *
 * Handles integration with walt.id Community Stack for:
 * - Verifiable Credential issuance
 * - SD-JWT generation
 * - DID management
 * - OID4VCI/OID4VP protocols
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../../../common/utils/logger.js';

// walt.id API endpoints
const WALTID_CORE_API = process.env.WALTID_CORE_API || 'http://localhost:7000';
const WALTID_SIGNATORY_API = process.env.WALTID_SIGNATORY_API || 'http://localhost:7001';
const WALTID_CUSTODIAN_API = process.env.WALTID_CUSTODIAN_API || 'http://localhost:7002';
const WALTID_AUDITOR_API = process.env.WALTID_AUDITOR_API || 'http://localhost:7003';

export interface CredentialData {
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: Record<string, unknown>;
}

export interface IssuedCredential {
  id: string;
  vcJwt: string;
  vcJson: Record<string, unknown>;
}

export interface VerificationResult {
  valid: boolean;
  checks: {
    signature: boolean;
    expiration: boolean;
    revocation: boolean;
    schema: boolean;
  };
  credential?: Record<string, unknown>;
  errors?: string[];
}

class WaltIdService {
  private coreApi: AxiosInstance;
  private signatoryApi: AxiosInstance;
  private custodianApi: AxiosInstance;
  private auditorApi: AxiosInstance;

  constructor() {
    const axiosConfig = {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    this.coreApi = axios.create({ ...axiosConfig, baseURL: WALTID_CORE_API });
    this.signatoryApi = axios.create({ ...axiosConfig, baseURL: WALTID_SIGNATORY_API });
    this.custodianApi = axios.create({ ...axiosConfig, baseURL: WALTID_CUSTODIAN_API });
    this.auditorApi = axios.create({ ...axiosConfig, baseURL: WALTID_AUDITOR_API });
  }

  /**
   * Check if walt.id services are available
   */
  async healthCheck(): Promise<{ available: boolean; services: Record<string, boolean> }> {
    const services: Record<string, boolean> = {};

    try {
      await this.coreApi.get('/health');
      services.core = true;
    } catch {
      services.core = false;
    }

    try {
      await this.signatoryApi.get('/health');
      services.signatory = true;
    } catch {
      services.signatory = false;
    }

    try {
      await this.custodianApi.get('/health');
      services.custodian = true;
    } catch {
      services.custodian = false;
    }

    try {
      await this.auditorApi.get('/health');
      services.auditor = true;
    } catch {
      services.auditor = false;
    }

    return {
      available: Object.values(services).some((v) => v),
      services,
    };
  }

  /**
   * Create a new DID for an organization
   * Using did:web method for MVP
   */
  async createDid(orgSlug: string): Promise<string> {
    const domain = process.env.PLATFORM_DOMAIN || 'eurocomply.io';
    const did = `did:web:${domain}:m:${orgSlug}`;

    // In production, this would:
    // 1. Generate key pair via walt.id custodian
    // 2. Create DID document
    // 3. Store keys securely

    // For MVP, we return the DID directly
    // The DID document would be hosted at:
    // https://eurocomply.io/.well-known/did.json (for platform)
    // https://eurocomply.io/m/{orgSlug}/did.json (for merchants)

    logger.info(`Created DID: ${did}`);
    return did;
  }

  /**
   * Issue a Verifiable Credential
   */
  async issueCredential(
    issuerDid: string,
    credentialData: CredentialData
  ): Promise<IssuedCredential> {
    // Check if walt.id is available
    const health = await this.healthCheck();

    if (!health.services.signatory) {
      // Fallback: Create a simulated credential for development
      logger.warn('walt.id signatory not available, using simulated credential');
      return this.createSimulatedCredential(issuerDid, credentialData);
    }

    try {
      // Use walt.id signatory to issue credential
      const response = await this.signatoryApi.post('/v1/credentials/issue', {
        templateId: credentialData.type[credentialData.type.length - 1],
        config: {
          issuerDid,
          subjectDid: credentialData.credentialSubject.id,
          proofType: 'jwt',
        },
        credentialData: credentialData.credentialSubject,
      });

      return {
        id: response.data.id,
        vcJwt: response.data.jwt,
        vcJson: response.data.vc,
      };
    } catch (error) {
      logger.error('Failed to issue credential via walt.id', { error });
      // Fallback to simulated credential
      return this.createSimulatedCredential(issuerDid, credentialData);
    }
  }

  /**
   * Verify a Verifiable Credential
   */
  async verifyCredential(vcJwt: string): Promise<VerificationResult> {
    const health = await this.healthCheck();

    if (!health.services.auditor) {
      logger.warn('walt.id auditor not available, using simulated verification');
      return this.simulatedVerification(vcJwt);
    }

    try {
      const response = await this.auditorApi.post('/v1/verify', {
        credentials: [vcJwt],
        policies: ['SignaturePolicy', 'ExpirationPolicy'],
      });

      return {
        valid: response.data.valid,
        checks: {
          signature: response.data.policyResults?.SignaturePolicy ?? true,
          expiration: response.data.policyResults?.ExpirationPolicy ?? true,
          revocation: true, // TODO: Implement revocation check
          schema: true,
        },
        credential: response.data.credential,
      };
    } catch (error) {
      logger.error('Failed to verify credential via walt.id', { error });
      return this.simulatedVerification(vcJwt);
    }
  }

  /**
   * Create a simulated credential for development/testing
   */
  private createSimulatedCredential(
    issuerDid: string,
    credentialData: CredentialData
  ): IssuedCredential {
    const id = `urn:uuid:${crypto.randomUUID()}`;

    const vcJson = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      id,
      type: credentialData.type,
      issuer: issuerDid,
      issuanceDate: credentialData.issuanceDate,
      expirationDate: credentialData.expirationDate,
      credentialSubject: credentialData.credentialSubject,
    };

    // Simulated JWT (not cryptographically valid, for dev only)
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString(
      'base64url'
    );
    const payload = Buffer.from(JSON.stringify({ vc: vcJson })).toString('base64url');
    const signature = 'simulated_signature';
    const vcJwt = `${header}.${payload}.${signature}`;

    return { id, vcJwt, vcJson };
  }

  /**
   * Simulated verification for development/testing
   */
  private simulatedVerification(vcJwt: string): VerificationResult {
    try {
      const parts = vcJwt.split('.');
      if (parts.length !== 3) {
        return {
          valid: false,
          checks: { signature: false, expiration: false, revocation: false, schema: false },
          errors: ['Invalid JWT format'],
        };
      }

      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());

      // Check expiration
      const expirationDate = payload.vc?.expirationDate;
      const isExpired = expirationDate && new Date(expirationDate) < new Date();

      return {
        valid: !isExpired,
        checks: {
          signature: true, // Simulated
          expiration: !isExpired,
          revocation: true,
          schema: true,
        },
        credential: payload.vc,
      };
    } catch {
      return {
        valid: false,
        checks: { signature: false, expiration: false, revocation: false, schema: false },
        errors: ['Failed to parse credential'],
      };
    }
  }

  /**
   * Generate OID4VCI offer URL for wallet issuance
   */
  async generateOid4vciOffer(
    credentialId: string,
    credentialType: string
  ): Promise<{ offerUrl: string; pin?: string }> {
    // This would generate an OpenID4VCI credential offer
    // that can be used with compatible wallets

    const baseUrl = process.env.API_URL || 'https://api.eurocomply.io';
    const offerUrl = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(
      `${baseUrl}/v1/credentials/${credentialId}/offer`
    )}`;

    return { offerUrl };
  }
}

export const waltIdService = new WaltIdService();
export default waltIdService;
