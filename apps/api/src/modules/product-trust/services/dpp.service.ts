/**
 * Digital Product Passport (DPP) Identity Service
 *
 * Handles issuance of DPPs as W3C Verifiable Credentials
 * using the shared @eurocomply/identity package.
 */

import { prisma } from '@eurocomply/database';
import {
  getDidService,
  getVcService,
  CredentialTypes,
} from '@eurocomply/identity';
import { logger } from '../../../common/utils/logger.js';

export interface DppData {
  productId: string;
  productName: string;
  manufacturerName: string;
  gtin?: string;
  carbonFootprint?: { value: number; unit: string };
  recyclability?: { percentage: number };
  durability?: { expectedLifespan: number; unit: string };
  repairability?: { score: number };
  [key: string]: unknown;
}

export const dppService = {
  /**
   * Issue a DPP as a Verifiable Credential
   *
   * @param passportId - Passport record ID
   * @param data - DPP data to include in the credential
   * @returns Issued credential details
   */
  async issueDppCredential(
    passportId: string,
    data: DppData
  ): Promise<{ credentialId: string; jwt: string }> {
    const vcService = getVcService();

    // Get passport with product and organization
    const passport = await prisma.passport.findUnique({
      where: { id: passportId },
      include: {
        product: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!passport) {
      throw new Error(`Passport not found: ${passportId}`);
    }

    const { organization } = passport.product;

    // Ensure organization has DID for issuing
    let issuerDid = organization.did;
    let issuerKeyId = organization.keyId;

    if (!issuerDid || !issuerKeyId) {
      // Initialize organization DID
      const didService = getDidService();
      const result = await didService.createDid({
        identifier: organization.slug,
      });

      await prisma.organization.update({
        where: { id: organization.id },
        data: {
          did: result.did,
          keyId: result.keyId,
          didDocument: result.didDocument as any,
        },
      });

      issuerDid = result.did;
      issuerKeyId = result.keyId;
    }

    logger.info('Issuing DPP credential', {
      passportId,
      productId: passport.productId,
      issuerDid,
    });

    try {
      // Issue the DPP credential
      const credential = await vcService.issueDPP(
        issuerDid,
        issuerKeyId,
        {
          gtin: data.gtin || passport.product.gtin || `product:${passport.productId}`,
          productName: data.productName || passport.product.name,
          manufacturerName: data.manufacturerName || organization.name,
          carbonFootprint: data.carbonFootprint,
          recyclability: data.recyclability,
          durability: data.durability,
          repairability: data.repairability,
          // Include full passport data
          passportId: passport.id,
          passportVersion: passport.version,
          ...(passport.data as object),
        }
      );

      // Update passport with credential info
      await prisma.passport.update({
        where: { id: passportId },
        data: {
          credentialId: credential.id,
          vcJwt: credential.jwt,
          credential: credential.credential as any,
        },
      });

      logger.info('DPP credential issued successfully', {
        passportId,
        credentialId: credential.id,
      });

      return {
        credentialId: credential.id,
        jwt: credential.jwt,
      };
    } catch (error) {
      logger.error('Failed to issue DPP credential', { passportId, error });
      throw error;
    }
  },

  /**
   * Verify a DPP credential
   *
   * @param passportId - Passport record ID
   * @returns Verification result
   */
  async verifyDppCredential(passportId: string): Promise<{
    valid: boolean;
    checks: { signature: boolean; expiration: boolean; revocation: boolean };
    errors?: string[];
  }> {
    const vcService = getVcService();

    const passport = await prisma.passport.findUnique({
      where: { id: passportId },
    });

    if (!passport) {
      throw new Error(`Passport not found: ${passportId}`);
    }

    if (!passport.vcJwt) {
      return {
        valid: false,
        checks: { signature: false, expiration: false, revocation: false },
        errors: ['No credential has been issued for this passport'],
      };
    }

    return vcService.verifyCredential(passport.vcJwt);
  },

  /**
   * Anchor a DPP (issue VC if not already done, then mark as anchored)
   *
   * @param passportId - Passport record ID
   * @returns Anchor result
   */
  async anchorDpp(passportId: string): Promise<{
    credentialId: string;
    anchorTxHash: string;
    anchoredAt: Date;
  }> {
    const passport = await prisma.passport.findUnique({
      where: { id: passportId },
      include: {
        product: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!passport) {
      throw new Error(`Passport not found: ${passportId}`);
    }

    let credentialId = passport.credentialId;

    // Issue credential if not already done
    if (!passport.vcJwt) {
      const dppData = passport.data as DppData;
      const result = await this.issueDppCredential(passportId, {
        productId: passport.productId,
        productName: passport.product.name,
        manufacturerName: passport.product.organization.name,
        gtin: passport.product.gtin || undefined,
        ...dppData,
      });
      credentialId = result.credentialId;
    }

    // Create anchor hash from credential
    const crypto = require('crypto');
    const anchorData = credentialId || passportId;
    const anchorTxHash = `0x${crypto.createHash('sha256').update(anchorData).digest('hex')}`;
    const anchoredAt = new Date();

    // Update passport
    await prisma.passport.update({
      where: { id: passportId },
      data: {
        anchorStatus: 'ANCHORED',
        anchorTxHash,
        anchoredAt,
      },
    });

    logger.info('DPP anchored successfully', {
      passportId,
      credentialId,
      anchorTxHash,
    });

    return {
      credentialId: credentialId!,
      anchorTxHash,
      anchoredAt,
    };
  },

  /**
   * Get or create organization DID
   *
   * @param organizationId - Organization ID
   * @returns DID and key ID
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
        didDocument: result.didDocument as any,
      },
    });

    return { did: result.did, keyId: result.keyId };
  },
};

export default dppService;
