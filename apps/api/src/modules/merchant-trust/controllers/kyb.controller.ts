import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, KybStatus, KybVerificationType } from '@eurocomply/database';
import { ApiError } from '../../../common/middleware/errorHandler.js';
import { logger } from '../../../common/utils/logger.js';
import { kybService } from '../services/kyb.service.js';
import { merchantIdentityService } from '../services/identity.service.js';

// Validation schemas
const StartKybSchema = z.object({
  merchantId: z.string().optional(), // Create new merchant if not provided
  legalName: z.string().min(1),
  tradingName: z.string().optional(),
  registrationNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  country: z.string().length(2), // ISO 3166-1 alpha-2
  address: z
    .object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      postalCode: z.string(),
      country: z.string().length(2),
    })
    .optional(),
  contact: z
    .object({
      email: z.string().email(),
      phone: z.string().optional(),
      website: z.string().url().optional(),
    })
    .optional(),
});

export const kybController = {
  /**
   * Start KYB verification for a merchant
   */
  async startVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = StartKybSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      let merchant;

      if (body.merchantId) {
        // Use existing merchant
        merchant = await prisma.merchant.findFirst({
          where: { id: body.merchantId, organizationId },
        });

        if (!merchant) {
          throw ApiError.notFound('Merchant');
        }

        // Update merchant with new info
        merchant = await prisma.merchant.update({
          where: { id: body.merchantId },
          data: {
            legalName: body.legalName,
            tradingName: body.tradingName,
            registrationNumber: body.registrationNumber,
            vatNumber: body.vatNumber,
            country: body.country,
            addressLine1: body.address?.line1,
            addressLine2: body.address?.line2,
            city: body.address?.city,
            postalCode: body.address?.postalCode,
            email: body.contact?.email,
            phone: body.contact?.phone,
            website: body.contact?.website,
            kybStatus: 'IN_PROGRESS',
          },
        });
      } else {
        // Create new merchant
        const org = await prisma.organization.findUnique({
          where: { id: organizationId },
        });

        const merchantSlug = body.legalName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .substring(0, 50);

        merchant = await prisma.merchant.create({
          data: {
            organizationId,
            legalName: body.legalName,
            tradingName: body.tradingName,
            registrationNumber: body.registrationNumber,
            vatNumber: body.vatNumber,
            country: body.country,
            addressLine1: body.address?.line1,
            addressLine2: body.address?.line2,
            city: body.address?.city,
            postalCode: body.address?.postalCode,
            email: body.contact?.email,
            phone: body.contact?.phone,
            website: body.contact?.website,
            kybStatus: 'IN_PROGRESS',
          },
        });

        // Initialize DID with real cryptographic key pair
        const didSlug = `${org?.slug}-${merchantSlug}`;
        try {
          await merchantIdentityService.initializeMerchantDid(merchant.id, didSlug);
          // Refresh merchant to get DID info
          merchant = (await prisma.merchant.findUnique({ where: { id: merchant.id } }))!;
        } catch (error) {
          logger.warn('Failed to initialize merchant DID during KYB', {
            merchantId: merchant.id,
            error,
          });
        }
      }

      // Create verification records for each check type
      const verificationTypes: KybVerificationType[] = [];

      if (body.vatNumber) {
        verificationTypes.push('VAT_VALIDATION');
      }
      if (body.registrationNumber) {
        verificationTypes.push('BUSINESS_REGISTRY');
      }
      if (body.address) {
        verificationTypes.push('ADDRESS_VERIFICATION');
      }

      const verifications = await Promise.all(
        verificationTypes.map((type) =>
          prisma.kybVerification.create({
            data: {
              merchantId: merchant.id,
              type,
              status: 'PENDING',
            },
          })
        )
      );

      // Start async verification process
      kybService.processVerifications(merchant.id, verifications).catch((err) =>
        logger.error('KYB verification processing failed', {
          err,
          merchantId: merchant.id,
        })
      );

      res.status(202).json({
        success: true,
        data: {
          merchantId: merchant.id,
          kybStatus: merchant.kybStatus,
          verifications: verifications.map((v) => ({
            id: v.id,
            type: v.type,
            status: v.status,
          })),
          message: 'KYB verification initiated',
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get KYB verification status
   */
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      const merchant = await prisma.merchant.findFirst({
        where: { id, organizationId },
        include: {
          kybVerifications: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!merchant) {
        throw ApiError.notFound('Merchant');
      }

      res.json({
        success: true,
        data: {
          merchantId: merchant.id,
          legalName: merchant.legalName,
          kybStatus: merchant.kybStatus,
          kybCompletedAt: merchant.kybCompletedAt,
          riskScore: merchant.riskScore,
          riskLevel: merchant.riskLevel,
          verifications: merchant.kybVerifications,
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get full KYB report
   */
  async getReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      const merchant = await prisma.merchant.findFirst({
        where: { id, organizationId },
        include: {
          kybVerifications: true,
          sanctionsChecks: true,
          ubos: true,
          complianceDocuments: true,
        },
      });

      if (!merchant) {
        throw ApiError.notFound('Merchant');
      }

      res.json({
        success: true,
        data: {
          merchant: {
            id: merchant.id,
            legalName: merchant.legalName,
            tradingName: merchant.tradingName,
            registrationNumber: merchant.registrationNumber,
            vatNumber: merchant.vatNumber,
            country: merchant.country,
            did: merchant.did,
          },
          kyb: {
            status: merchant.kybStatus,
            completedAt: merchant.kybCompletedAt,
            verifications: merchant.kybVerifications,
          },
          risk: {
            score: merchant.riskScore,
            level: merchant.riskLevel,
          },
          sanctions: {
            checks: merchant.sanctionsChecks,
            lastChecked: merchant.sanctionsChecks[0]?.checkedAt,
          },
          ubos: merchant.ubos,
          documents: merchant.complianceDocuments,
          dsa: {
            status: merchant.dsaStatus,
            compliant: merchant.dsaStatus === 'COMPLIANT',
            completedAt: merchant.dsaCompletedAt,
          },
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
