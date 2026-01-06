/**
 * WorkforceTrust Identity Service
 *
 * Wrapper around @eurocomply/identity for WorkforceTrust-specific operations.
 * Handles employee credentials, diplomas, professional licenses, etc.
 */

import { prisma } from '@eurocomply/database';
import {
  getDidService,
  getVcService,
  getKeyService,
  CredentialTypes,
  type IssueCredentialOptions,
  type VerificationResult,
} from '@eurocomply/identity';
import { logger } from '../../../common/utils/logger.js';

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

export const workforceIdentityService = {
  /**
   * Check if identity services are available
   */
  async healthCheck(): Promise<{ available: boolean; services: Record<string, boolean> }> {
    const { getWaltIdAdapter } = await import('@eurocomply/identity');
    const adapter = getWaltIdAdapter();
    const available = await adapter.isAvailable();

    return {
      available,
      services: {
        core: available,
        signatory: available,
        custodian: available,
        auditor: available,
      },
    };
  },

  /**
   * Ensure organization has DID for issuing credentials
   */
  async ensureOrganizationDid(organizationId: string): Promise<{
    did: string;
    keyId: string;
  }> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    if (org.did && org.keyId) {
      return { did: org.did, keyId: org.keyId };
    }

    const didService = getDidService();
    const result = await didService.createDid({
      identifier: org.slug,
    });

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        did: result.did,
        keyId: result.keyId,
        didDocument: result.didDocument,
      },
    });

    logger.info('Organization DID created', {
      organizationId,
      did: result.did,
    });

    return { did: result.did, keyId: result.keyId };
  },

  /**
   * Issue a Verifiable Credential
   */
  async issueCredential(
    issuerDid: string,
    issuerKeyId: string,
    credentialData: CredentialData
  ): Promise<IssuedCredential> {
    const vcService = getVcService();

    logger.info('Issuing workforce credential', {
      issuerDid,
      type: credentialData.type,
    });

    try {
      const result = await vcService.issueCredential({
        issuerDid,
        issuerKeyId,
        subjectDid: credentialData.credentialSubject.id as string || `urn:uuid:${crypto.randomUUID()}`,
        type: credentialData.type.filter(t => t !== 'VerifiableCredential'),
        claims: credentialData.credentialSubject,
        expirationDate: credentialData.expirationDate ? new Date(credentialData.expirationDate) : undefined,
      });

      return {
        id: result.id,
        vcJwt: result.jwt,
        vcJson: result.credential as Record<string, unknown>,
      };
    } catch (error) {
      logger.error('Failed to issue credential', { error, issuerDid });
      throw error;
    }
  },

  /**
   * Verify a Verifiable Credential
   */
  async verifyCredential(vcJwt: string): Promise<VerificationResult & { schema?: boolean }> {
    const vcService = getVcService();
    const result = await vcService.verifyCredential(vcJwt);

    return {
      ...result,
      checks: {
        ...result.checks,
      },
    };
  },

  /**
   * Issue an Employee ID credential
   */
  async issueEmployeeCredential(
    organizationId: string,
    employeeData: {
      employeeId: string;
      fullName: string;
      email?: string;
      department?: string;
      position?: string;
      startDate: Date;
    }
  ): Promise<IssuedCredential> {
    const { did: issuerDid, keyId: issuerKeyId } = await this.ensureOrganizationDid(organizationId);

    const vcService = getVcService();
    const result = await vcService.issueEmployeeCredential(
      issuerDid,
      issuerKeyId,
      `urn:employee:${employeeData.employeeId}`,
      employeeData
    );

    return {
      id: result.id,
      vcJwt: result.jwt,
      vcJson: result.credential as Record<string, unknown>,
    };
  },

  /**
   * Issue a Diploma credential
   */
  async issueDiplomaCredential(
    organizationId: string,
    holderDid: string,
    diplomaData: {
      degree: string;
      fieldOfStudy: string;
      institution: string;
      graduationDate: Date;
      grade?: string;
    }
  ): Promise<IssuedCredential> {
    const { did: issuerDid, keyId: issuerKeyId } = await this.ensureOrganizationDid(organizationId);

    const vcService = getVcService();
    const result = await vcService.issueDiplomaCredential(
      issuerDid,
      issuerKeyId,
      holderDid,
      diplomaData
    );

    return {
      id: result.id,
      vcJwt: result.jwt,
      vcJson: result.credential as Record<string, unknown>,
    };
  },

  /**
   * Revoke a credential
   */
  async revokeCredential(credentialId: string, reason?: string): Promise<void> {
    const vcService = getVcService();
    await vcService.revokeCredential(credentialId, reason);

    logger.info('Credential revoked', { credentialId, reason });
  },

  /**
   * Generate OID4VCI offer URL for wallet issuance
   */
  async generateOid4vciOffer(
    credentialId: string,
    credentialType: string
  ): Promise<{ offerUrl: string; pin?: string }> {
    const baseUrl = process.env.API_URL || 'https://api.eurocomply.io';
    const offerUrl = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(
      `${baseUrl}/v1/credentials/${credentialId}/offer`
    )}`;

    return { offerUrl };
  },
};

// Re-export for backwards compatibility
export const waltIdService = workforceIdentityService;
export default workforceIdentityService;
