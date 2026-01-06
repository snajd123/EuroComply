/**
 * KYB (Know Your Business) Verification Service
 *
 * Handles business verification workflows including:
 * - VAT validation via VIES
 * - Business registry lookups
 * - Address verification
 * - Risk scoring
 */

import { prisma, KybVerification, KybVerificationType, KybStatus, RiskLevel } from '@eurocomply/database';
import { logger } from '../../../common/utils/logger.js';
import { merchantIdentityService } from './identity.service.js';

export const kybService = {
  /**
   * Process all pending verifications for a merchant
   */
  async processVerifications(
    merchantId: string,
    verifications: KybVerification[]
  ): Promise<void> {
    logger.info('Starting KYB verification process', { merchantId });

    const results: Record<string, boolean> = {};

    for (const verification of verifications) {
      try {
        // Update to in progress
        await prisma.kybVerification.update({
          where: { id: verification.id },
          data: { status: 'IN_PROGRESS' },
        });

        // Process based on type
        let result: { success: boolean; data: Record<string, unknown> };

        switch (verification.type) {
          case 'VAT_VALIDATION':
            result = await this.validateVat(merchantId);
            break;
          case 'BUSINESS_REGISTRY':
            result = await this.checkBusinessRegistry(merchantId);
            break;
          case 'ADDRESS_VERIFICATION':
            result = await this.verifyAddress(merchantId);
            break;
          default:
            result = { success: true, data: {} };
        }

        results[verification.type] = result.success;

        // Update verification result
        await prisma.kybVerification.update({
          where: { id: verification.id },
          data: {
            status: result.success ? 'VERIFIED' : 'FAILED',
            result: result.data,
            verifiedAt: result.success ? new Date() : null,
          },
        });
      } catch (error) {
        logger.error('Verification failed', {
          verificationId: verification.id,
          type: verification.type,
          error,
        });

        await prisma.kybVerification.update({
          where: { id: verification.id },
          data: {
            status: 'FAILED',
            result: { error: 'Verification failed' },
          },
        });

        results[verification.type] = false;
      }
    }

    // Calculate overall KYB status and risk
    const allPassed = Object.values(results).every((r) => r);
    const anyPassed = Object.values(results).some((r) => r);

    let kybStatus: KybStatus;
    if (allPassed) {
      kybStatus = 'VERIFIED';
    } else if (anyPassed) {
      kybStatus = 'REQUIRES_REVIEW';
    } else {
      kybStatus = 'FAILED';
    }

    // Calculate risk score (0-100)
    const riskScore = this.calculateRiskScore(results);
    const riskLevel = this.getRiskLevel(riskScore);

    // Update merchant
    await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        kybStatus,
        kybCompletedAt: new Date(),
        riskScore,
        riskLevel,
      },
    });

    logger.info('KYB verification completed', {
      merchantId,
      kybStatus,
      riskScore,
      riskLevel,
    });

    // If KYB passed, issue Verifiable Credential
    if (kybStatus === 'VERIFIED') {
      try {
        const credential = await merchantIdentityService.issueKybCredential(merchantId);
        logger.info('KYB Verifiable Credential issued', {
          merchantId,
          credentialId: credential.credentialId,
        });
      } catch (error) {
        logger.error('Failed to issue KYB credential', {
          merchantId,
          error,
        });
        // Don't fail the whole process, credential issuance is not critical
      }
    }
  },

  /**
   * Validate VAT number via VIES (EU VAT Information Exchange System)
   */
  async validateVat(merchantId: string): Promise<{ success: boolean; data: Record<string, unknown> }> {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant?.vatNumber) {
      return { success: false, data: { error: 'No VAT number provided' } };
    }

    // Simulate VIES API call
    // In production, use: https://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Extract country code and number
    const countryCode = merchant.vatNumber.substring(0, 2).toUpperCase();
    const vatNumber = merchant.vatNumber.substring(2);

    // Simulated validation
    const isValid = merchant.vatNumber.length >= 8;

    return {
      success: isValid,
      data: {
        countryCode,
        vatNumber,
        valid: isValid,
        name: isValid ? merchant.legalName : null,
        address: isValid ? `${merchant.addressLine1}, ${merchant.city}` : null,
        requestDate: new Date().toISOString(),
      },
    };
  },

  /**
   * Check business registry
   */
  async checkBusinessRegistry(
    merchantId: string
  ): Promise<{ success: boolean; data: Record<string, unknown> }> {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant?.registrationNumber) {
      return { success: false, data: { error: 'No registration number provided' } };
    }

    // Simulate business registry API call
    // In production, integrate with national registries
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Simulated response
    const isRegistered = merchant.registrationNumber.length >= 5;

    return {
      success: isRegistered,
      data: {
        registrationNumber: merchant.registrationNumber,
        country: merchant.country,
        found: isRegistered,
        companyName: isRegistered ? merchant.legalName : null,
        companyStatus: isRegistered ? 'ACTIVE' : null,
        incorporationDate: isRegistered ? '2020-01-15' : null,
        registeredAddress: isRegistered
          ? {
              line1: merchant.addressLine1,
              city: merchant.city,
              postalCode: merchant.postalCode,
              country: merchant.country,
            }
          : null,
        requestDate: new Date().toISOString(),
      },
    };
  },

  /**
   * Verify business address
   */
  async verifyAddress(
    merchantId: string
  ): Promise<{ success: boolean; data: Record<string, unknown> }> {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant?.addressLine1) {
      return { success: false, data: { error: 'No address provided' } };
    }

    // Simulate address verification
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simulated response
    const isValid = merchant.addressLine1.length >= 5 && merchant.city && merchant.postalCode;

    return {
      success: isValid,
      data: {
        inputAddress: {
          line1: merchant.addressLine1,
          line2: merchant.addressLine2,
          city: merchant.city,
          postalCode: merchant.postalCode,
          country: merchant.country,
        },
        verified: isValid,
        confidence: isValid ? 0.95 : 0,
        standardizedAddress: isValid
          ? {
              line1: merchant.addressLine1?.toUpperCase(),
              city: merchant.city?.toUpperCase(),
              postalCode: merchant.postalCode,
              country: merchant.country,
            }
          : null,
        requestDate: new Date().toISOString(),
      },
    };
  },

  /**
   * Calculate risk score based on verification results
   */
  calculateRiskScore(results: Record<string, boolean>): number {
    const weights: Record<string, number> = {
      VAT_VALIDATION: 30,
      BUSINESS_REGISTRY: 40,
      ADDRESS_VERIFICATION: 20,
      IDENTITY_VERIFICATION: 10,
    };

    let totalWeight = 0;
    let earnedWeight = 0;

    for (const [type, passed] of Object.entries(results)) {
      const weight = weights[type] || 10;
      totalWeight += weight;
      if (passed) {
        earnedWeight += weight;
      }
    }

    if (totalWeight === 0) return 100; // No checks = high risk

    // Lower score = lower risk (inverted from typical)
    const passRate = earnedWeight / totalWeight;
    return Math.round((1 - passRate) * 100);
  },

  /**
   * Get risk level from score
   */
  getRiskLevel(score: number): RiskLevel {
    if (score <= 20) return 'LOW';
    if (score <= 50) return 'MEDIUM';
    if (score <= 80) return 'HIGH';
    return 'CRITICAL';
  },
};

export default kybService;
