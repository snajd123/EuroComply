/**
 * Verifiable Credential Service
 *
 * Handles VC issuance, verification, and revocation
 * for all credential types across ProductTrust, WorkforceTrust, and MerchantTrust.
 */

import { getWaltIdAdapter } from '../adapters/waltid.adapter.js';
import { getConfig } from '../config.js';
import type {
  VerifiableCredential,
  CredentialSubject,
  CredentialType,
  VerificationResult,
} from '../types.js';
import { CredentialTypes } from '../types.js';

export interface IssueCredentialOptions {
  /** Issuer DID */
  issuerDid: string;
  /** Issuer's key ID for signing */
  issuerKeyId: string;
  /** Subject DID (recipient) */
  subjectDid: string;
  /** Credential type(s) */
  type: CredentialType | CredentialType[];
  /** Credential claims */
  claims: Record<string, unknown>;
  /** Expiration date (optional) */
  expirationDate?: Date;
  /** Additional contexts (optional) */
  additionalContexts?: string[];
}

export interface IssuedCredential {
  id: string;
  jwt: string;
  credential: VerifiableCredential;
}

export interface RevocationEntry {
  credentialId: string;
  revokedAt: Date;
  reason?: string;
}

export class VcService {
  private adapter = getWaltIdAdapter();
  private config = getConfig();

  // In-memory revocation registry (should be database in production)
  private revocationRegistry = new Map<string, RevocationEntry>();

  /**
   * Issue a Verifiable Credential
   *
   * @param options - Credential issuance options
   * @returns Issued credential with JWT
   */
  async issueCredential(options: IssueCredentialOptions): Promise<IssuedCredential> {
    const types = Array.isArray(options.type) ? options.type : [options.type];

    const available = await this.adapter.isAvailable();

    if (available) {
      const result = await this.adapter.issueCredential(options.issuerDid, options.issuerKeyId, {
        type: types,
        subject: {
          id: options.subjectDid,
          ...options.claims,
        },
        expirationDate: options.expirationDate?.toISOString(),
      });

      return {
        id: result.id,
        jwt: result.jwt,
        credential: result.json,
      };
    }

    if (this.config.features.fallbackToSimulation) {
      return this.issueSimulatedCredential(options, types);
    }

    throw new Error('walt.id services unavailable and simulation disabled');
  }

  /**
   * Verify a Verifiable Credential
   *
   * @param jwt - Credential JWT to verify
   * @returns Verification result
   */
  async verifyCredential(jwt: string): Promise<VerificationResult> {
    const available = await this.adapter.isAvailable();

    let result: VerificationResult;

    if (available) {
      result = await this.adapter.verifyCredential(jwt);
    } else if (this.config.features.fallbackToSimulation) {
      result = this.verifySimulatedCredential(jwt);
    } else {
      throw new Error('walt.id services unavailable and simulation disabled');
    }

    // Check revocation registry
    if (result.credential?.id) {
      const isRevoked = this.revocationRegistry.has(result.credential.id);
      if (isRevoked) {
        result.valid = false;
        result.checks.revocation = false;
        result.errors = result.errors || [];
        result.errors.push('Credential has been revoked');
      }
    }

    return result;
  }

  /**
   * Revoke a credential
   *
   * @param credentialId - Credential ID to revoke
   * @param reason - Reason for revocation
   */
  async revokeCredential(credentialId: string, reason?: string): Promise<void> {
    this.revocationRegistry.set(credentialId, {
      credentialId,
      revokedAt: new Date(),
      reason,
    });

    // In production, this would:
    // 1. Update database revocation list
    // 2. Publish to status list (if using StatusList2021)
    // 3. Notify relevant parties
  }

  /**
   * Check if a credential is revoked
   *
   * @param credentialId - Credential ID to check
   * @returns True if revoked
   */
  isRevoked(credentialId: string): boolean {
    return this.revocationRegistry.has(credentialId);
  }

  // ===========================================
  // Credential Type Helpers
  // ===========================================

  /**
   * Issue a Digital Product Passport credential
   */
  async issueDPP(
    issuerDid: string,
    issuerKeyId: string,
    productData: {
      gtin: string;
      productName: string;
      manufacturerName: string;
      carbonFootprint?: { value: number; unit: string };
      recyclability?: { percentage: number };
      durability?: { expectedLifespan: number; unit: string };
      repairability?: { score: number };
      [key: string]: unknown;
    }
  ): Promise<IssuedCredential> {
    const subjectId = `urn:gtin:${productData.gtin}`;

    return this.issueCredential({
      issuerDid,
      issuerKeyId,
      subjectDid: subjectId,
      type: CredentialTypes.DIGITAL_PRODUCT_PASSPORT,
      claims: productData,
      additionalContexts: ['https://eurocomply.eu/contexts/dpp/v1'],
    });
  }

  /**
   * Issue a KYB Verification credential
   */
  async issueKYBCredential(
    issuerDid: string,
    issuerKeyId: string,
    merchantDid: string,
    kybData: {
      legalName: string;
      vatNumber: string;
      vatValidated: boolean;
      registryVerified: boolean;
      registrationNumber?: string;
      jurisdiction?: string;
      verificationDate: Date;
    }
  ): Promise<IssuedCredential> {
    return this.issueCredential({
      issuerDid,
      issuerKeyId,
      subjectDid: merchantDid,
      type: CredentialTypes.KYB_VERIFICATION,
      claims: {
        ...kybData,
        verificationDate: kybData.verificationDate.toISOString(),
      },
      expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    });
  }

  /**
   * Issue an Employee ID credential
   */
  async issueEmployeeCredential(
    issuerDid: string,
    issuerKeyId: string,
    employeeDid: string,
    employeeData: {
      employeeId: string;
      fullName: string;
      department?: string;
      position?: string;
      startDate: Date;
    }
  ): Promise<IssuedCredential> {
    return this.issueCredential({
      issuerDid,
      issuerKeyId,
      subjectDid: employeeDid,
      type: CredentialTypes.EMPLOYEE_ID,
      claims: {
        ...employeeData,
        startDate: employeeData.startDate.toISOString(),
      },
    });
  }

  /**
   * Issue a Diploma credential
   */
  async issueDiplomaCredential(
    issuerDid: string,
    issuerKeyId: string,
    holderDid: string,
    diplomaData: {
      degree: string;
      fieldOfStudy: string;
      institution: string;
      graduationDate: Date;
      grade?: string;
    }
  ): Promise<IssuedCredential> {
    return this.issueCredential({
      issuerDid,
      issuerKeyId,
      subjectDid: holderDid,
      type: CredentialTypes.DIPLOMA,
      claims: {
        ...diplomaData,
        graduationDate: diplomaData.graduationDate.toISOString(),
      },
    });
  }

  /**
   * Issue a DSA Trader Verification credential
   */
  async issueDSATraderCredential(
    issuerDid: string,
    issuerKeyId: string,
    traderDid: string,
    traderData: {
      traderName: string;
      traderType: 'business' | 'individual';
      contactEmail: string;
      physicalAddress: string;
      vatNumber?: string;
      registrationNumber?: string;
      verificationDate: Date;
    }
  ): Promise<IssuedCredential> {
    return this.issueCredential({
      issuerDid,
      issuerKeyId,
      subjectDid: traderDid,
      type: CredentialTypes.DSA_TRADER_VERIFICATION,
      claims: {
        ...traderData,
        verificationDate: traderData.verificationDate.toISOString(),
      },
      expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    });
  }

  // ===========================================
  // Simulation Methods (Development Only)
  // ===========================================

  private issueSimulatedCredential(
    options: IssueCredentialOptions,
    types: CredentialType[]
  ): IssuedCredential {
    const credentialId = `urn:uuid:${crypto.randomUUID()}`;
    const issuanceDate = new Date().toISOString();

    const credential: VerifiableCredential = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        ...(options.additionalContexts || []),
      ],
      id: credentialId,
      type: ['VerifiableCredential', ...types],
      issuer: options.issuerDid,
      issuanceDate,
      expirationDate: options.expirationDate?.toISOString(),
      credentialSubject: {
        id: options.subjectDid,
        ...options.claims,
      } as CredentialSubject,
    };

    // Create simulated JWT
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ vc: credential })).toString('base64url');
    const jwt = `${header}.${payload}.simulated_signature_${options.issuerKeyId}`;

    return {
      id: credentialId,
      jwt,
      credential,
    };
  }

  private verifySimulatedCredential(jwt: string): VerificationResult {
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

      // Check if simulated
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
let vcService: VcService | null = null;

export function getVcService(): VcService {
  if (!vcService) {
    vcService = new VcService();
  }
  return vcService;
}

export function resetVcService(): void {
  vcService = null;
}
