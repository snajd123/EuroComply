/**
 * MerchantTrust Identity Service
 *
 * Handles DID creation and KYB credential issuance for merchants
 * using the shared @eurocomply/identity package.
 */

import { prisma } from '@eurocomply/database';
import {
  getDidService,
  getVcService,
  getKeyService,
  CredentialTypes,
} from '@eurocomply/identity';
import { logger } from '../../../common/utils/logger.js';

export const merchantIdentityService = {
  /**
   * Initialize DID and key pair for a merchant
   *
   * @param merchantId - Merchant record ID
   * @param merchantSlug - Unique slug for the merchant
   * @returns DID and key information
   */
  async initializeMerchantDid(
    merchantId: string,
    merchantSlug: string
  ): Promise<{ did: string; keyId: string; didDocument: object }> {
    const didService = getDidService();

    logger.info('Initializing merchant DID', { merchantId, merchantSlug });

    try {
      // Create DID with key pair
      const { did, keyId, didDocument } = await didService.createDid({
        identifier: merchantSlug,
      });

      // Store in database
      await prisma.merchant.update({
        where: { id: merchantId },
        data: {
          did,
          keyId,
          didDocument,
        },
      });

      logger.info('Merchant DID created successfully', {
        merchantId,
        did,
        keyId,
      });

      return { did, keyId, didDocument };
    } catch (error) {
      logger.error('Failed to create merchant DID', { merchantId, error });
      throw error;
    }
  },

  /**
   * Initialize DID for an organization (issuer identity)
   *
   * @param organizationId - Organization record ID
   * @param orgSlug - Organization slug
   * @returns DID and key information
   */
  async initializeOrganizationDid(
    organizationId: string,
    orgSlug: string
  ): Promise<{ did: string; keyId: string; didDocument: object }> {
    const didService = getDidService();

    logger.info('Initializing organization DID', { organizationId, orgSlug });

    try {
      const { did, keyId, didDocument } = await didService.createDid({
        identifier: orgSlug,
      });

      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          did,
          keyId,
          didDocument,
        },
      });

      logger.info('Organization DID created successfully', {
        organizationId,
        did,
        keyId,
      });

      return { did, keyId, didDocument };
    } catch (error) {
      logger.error('Failed to create organization DID', { organizationId, error });
      throw error;
    }
  },

  /**
   * Issue KYB Verification Credential to a merchant
   *
   * Called when KYB verification completes successfully.
   *
   * @param merchantId - Merchant record ID
   * @returns Issued credential details
   */
  async issueKybCredential(merchantId: string): Promise<{
    credentialId: string;
    jwt: string;
  }> {
    const vcService = getVcService();

    // Get merchant with organization
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        organization: true,
        kybVerifications: {
          where: { status: 'VERIFIED' },
        },
      },
    });

    if (!merchant) {
      throw new Error(`Merchant not found: ${merchantId}`);
    }

    if (!merchant.did || !merchant.keyId) {
      throw new Error(`Merchant DID not initialized: ${merchantId}`);
    }

    // Ensure organization has DID for issuing
    let issuerDid = merchant.organization.did;
    let issuerKeyId = merchant.organization.keyId;

    if (!issuerDid || !issuerKeyId) {
      // Initialize organization DID if not exists
      const result = await this.initializeOrganizationDid(
        merchant.organizationId,
        merchant.organization.slug
      );
      issuerDid = result.did;
      issuerKeyId = result.keyId;
    }

    logger.info('Issuing KYB credential', {
      merchantId,
      merchantDid: merchant.did,
      issuerDid,
    });

    try {
      // Build verification results summary
      const verificationResults: Record<string, boolean> = {};
      for (const v of merchant.kybVerifications) {
        verificationResults[v.type] = true;
      }

      // Issue the KYB credential
      const credential = await vcService.issueKYBCredential(
        issuerDid,
        issuerKeyId,
        merchant.did,
        {
          legalName: merchant.legalName,
          vatNumber: merchant.vatNumber || '',
          vatValidated: verificationResults['VAT_VALIDATION'] ?? false,
          registryVerified: verificationResults['BUSINESS_REGISTRY'] ?? false,
          registrationNumber: merchant.registrationNumber || undefined,
          jurisdiction: merchant.country || undefined,
          verificationDate: new Date(),
        }
      );

      // Store credential in merchant record
      await prisma.merchant.update({
        where: { id: merchantId },
        data: {
          kybCredentialId: credential.id,
          kybCredentialJwt: credential.jwt,
        },
      });

      logger.info('KYB credential issued successfully', {
        merchantId,
        credentialId: credential.id,
      });

      return {
        credentialId: credential.id,
        jwt: credential.jwt,
      };
    } catch (error) {
      logger.error('Failed to issue KYB credential', { merchantId, error });
      throw error;
    }
  },

  /**
   * Issue DSA Trader Verification Credential
   *
   * Called when DSA compliance is achieved.
   *
   * @param merchantId - Merchant record ID
   * @returns Issued credential details
   */
  async issueDsaTraderCredential(merchantId: string): Promise<{
    credentialId: string;
    jwt: string;
  }> {
    const vcService = getVcService();

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { organization: true },
    });

    if (!merchant) {
      throw new Error(`Merchant not found: ${merchantId}`);
    }

    if (!merchant.did) {
      throw new Error(`Merchant DID not initialized: ${merchantId}`);
    }

    // Get or create issuer DID
    let issuerDid = merchant.organization.did;
    let issuerKeyId = merchant.organization.keyId;

    if (!issuerDid || !issuerKeyId) {
      const result = await this.initializeOrganizationDid(
        merchant.organizationId,
        merchant.organization.slug
      );
      issuerDid = result.did;
      issuerKeyId = result.keyId;
    }

    logger.info('Issuing DSA trader credential', {
      merchantId,
      merchantDid: merchant.did,
    });

    const credential = await vcService.issueDSATraderCredential(
      issuerDid,
      issuerKeyId,
      merchant.did,
      {
        traderName: merchant.legalName,
        traderType: 'business',
        contactEmail: merchant.email || '',
        physicalAddress: [
          merchant.addressLine1,
          merchant.addressLine2,
          merchant.city,
          merchant.postalCode,
          merchant.country,
        ]
          .filter(Boolean)
          .join(', '),
        vatNumber: merchant.vatNumber || undefined,
        registrationNumber: merchant.registrationNumber || undefined,
        verificationDate: new Date(),
      }
    );

    logger.info('DSA trader credential issued', {
      merchantId,
      credentialId: credential.id,
    });

    return {
      credentialId: credential.id,
      jwt: credential.jwt,
    };
  },

  /**
   * Get merchant's DID document for hosting
   *
   * @param merchantSlug - Merchant slug
   * @returns DID document or null
   */
  async getMerchantDidDocument(merchantSlug: string): Promise<object | null> {
    const org = await prisma.organization.findUnique({
      where: { slug: merchantSlug },
    });

    if (!org?.didDocument) {
      return null;
    }

    return org.didDocument as object;
  },

  /**
   * Verify a KYB credential
   *
   * @param jwt - Credential JWT to verify
   * @returns Verification result
   */
  async verifyKybCredential(jwt: string): Promise<{
    valid: boolean;
    credential?: object;
    errors?: string[];
  }> {
    const vcService = getVcService();
    return vcService.verifyCredential(jwt);
  },
};

export default merchantIdentityService;
