import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, SanctionsStatus } from '@eurocomply/database';
import { ApiError } from '../../../common/middleware/errorHandler.js';
import { logger } from '../../../common/utils/logger.js';

// Validation schemas
const SanctionsCheckSchema = z.object({
  merchantId: z.string().optional(),
  entityName: z.string().min(1),
  entityType: z.enum(['BUSINESS', 'INDIVIDUAL']).default('BUSINESS'),
  country: z.string().length(2).optional(),
  additionalData: z.record(z.unknown()).optional(),
});

const UboLookupSchema = z.object({
  merchantId: z.string(),
  registrationNumber: z.string().optional(),
  country: z.string().length(2),
});

// Sanctions lists to check
const SANCTIONS_LISTS = ['EU_SANCTIONS', 'UN_SANCTIONS', 'OFAC_SDN', 'UK_SANCTIONS'] as const;

export const sanctionsController = {
  /**
   * Perform sanctions screening check
   */
  async check(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = SanctionsCheckSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      // Verify merchant belongs to org if merchantId provided
      if (body.merchantId) {
        const merchant = await prisma.merchant.findFirst({
          where: { id: body.merchantId, organizationId },
        });
        if (!merchant) {
          throw ApiError.notFound('Merchant');
        }
      }

      // Create sanctions check record
      const check = await prisma.sanctionsCheck.create({
        data: {
          merchantId: body.merchantId || '', // Standalone check if no merchantId
          entityName: body.entityName,
          entityType: body.entityType,
          status: 'PENDING',
          listsChecked: [...SANCTIONS_LISTS],
        },
      });

      // Perform screening (simulated)
      const result = await performSanctionsScreening(body.entityName, body.entityType);

      // Update check with results
      const updatedCheck = await prisma.sanctionsCheck.update({
        where: { id: check.id },
        data: {
          status: result.matchFound ? 'POTENTIAL_MATCH' : 'CLEAR',
          matchFound: result.matchFound,
          matches: result.matches,
          checkedAt: new Date(),
        },
      });

      // Update merchant risk if matches found
      if (body.merchantId && result.matchFound) {
        await prisma.merchant.update({
          where: { id: body.merchantId },
          data: {
            riskLevel: 'CRITICAL',
            riskScore: 100,
          },
        });

        logger.warn('Sanctions match found for merchant', {
          merchantId: body.merchantId,
          entityName: body.entityName,
          matches: result.matches.length,
        });
      }

      res.json({
        success: true,
        data: {
          id: updatedCheck.id,
          entityName: updatedCheck.entityName,
          entityType: updatedCheck.entityType,
          status: updatedCheck.status,
          matchFound: updatedCheck.matchFound,
          matches: updatedCheck.matches,
          listsChecked: updatedCheck.listsChecked,
          checkedAt: updatedCheck.checkedAt,
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
   * Look up Ultimate Beneficial Owners (UBO) from registry
   */
  async uboLookup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = UboLookupSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      // Verify merchant belongs to org
      const merchant = await prisma.merchant.findFirst({
        where: { id: body.merchantId, organizationId },
      });

      if (!merchant) {
        throw ApiError.notFound('Merchant');
      }

      // Simulate UBO registry lookup
      // In production, integrate with national UBO registries
      const ubos = await simulateUboLookup(
        body.registrationNumber || merchant.registrationNumber || '',
        body.country
      );

      // Store UBOs
      for (const ubo of ubos) {
        await prisma.ubo.upsert({
          where: {
            id: `${body.merchantId}-${ubo.firstName}-${ubo.lastName}`.replace(/\s/g, '-'),
          },
          create: {
            id: `${body.merchantId}-${ubo.firstName}-${ubo.lastName}`.replace(/\s/g, '-'),
            merchantId: body.merchantId,
            firstName: ubo.firstName,
            lastName: ubo.lastName,
            nationality: ubo.nationality,
            ownershipPercentage: ubo.ownershipPercentage,
            controlType: ubo.controlType,
            isPep: ubo.isPep,
            pepDetails: ubo.pepDetails,
          },
          update: {
            ownershipPercentage: ubo.ownershipPercentage,
            controlType: ubo.controlType,
            isPep: ubo.isPep,
            pepDetails: ubo.pepDetails,
          },
        });

        // Screen UBO against sanctions
        if (ubo.isPep) {
          await prisma.sanctionsCheck.create({
            data: {
              merchantId: body.merchantId,
              entityName: `${ubo.firstName} ${ubo.lastName}`,
              entityType: 'INDIVIDUAL',
              status: 'POTENTIAL_MATCH',
              matchFound: true,
              matches: [{ type: 'PEP', details: ubo.pepDetails }],
              listsChecked: ['PEP_DATABASE'],
              checkedAt: new Date(),
            },
          });
        }
      }

      // Get all UBOs for merchant
      const allUbos = await prisma.ubo.findMany({
        where: { merchantId: body.merchantId },
      });

      res.json({
        success: true,
        data: {
          merchantId: body.merchantId,
          registrationNumber: body.registrationNumber || merchant.registrationNumber,
          country: body.country,
          ubos: allUbos.map((u) => ({
            id: u.id,
            name: `${u.firstName} ${u.lastName}`,
            nationality: u.nationality,
            ownershipPercentage: u.ownershipPercentage,
            controlType: u.controlType,
            isPep: u.isPep,
            verified: u.verified,
          })),
          pepWarning: allUbos.some((u) => u.isPep),
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

/**
 * Simulate sanctions screening
 */
async function performSanctionsScreening(
  entityName: string,
  entityType: string
): Promise<{
  matchFound: boolean;
  matches: Array<{ list: string; matchScore: number; name: string; details?: unknown }>;
}> {
  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Simulated screening - in production, integrate with:
  // - EU Consolidated Financial Sanctions List
  // - UN Security Council Sanctions List
  // - OFAC SDN List
  // - UK Sanctions List

  // For demo, only flag if name contains "sanctioned" (obviously fake)
  const isSanctioned = entityName.toLowerCase().includes('sanctioned');

  if (isSanctioned) {
    return {
      matchFound: true,
      matches: [
        {
          list: 'EU_SANCTIONS',
          matchScore: 0.95,
          name: entityName,
          details: {
            reason: 'Demo sanctions match',
            listedSince: '2023-01-01',
          },
        },
      ],
    };
  }

  return {
    matchFound: false,
    matches: [],
  };
}

/**
 * Simulate UBO registry lookup
 */
async function simulateUboLookup(
  registrationNumber: string,
  country: string
): Promise<
  Array<{
    firstName: string;
    lastName: string;
    nationality: string;
    ownershipPercentage: number;
    controlType: string;
    isPep: boolean;
    pepDetails?: unknown;
  }>
> {
  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Simulated UBO data
  // In production, integrate with national UBO registries
  return [
    {
      firstName: 'John',
      lastName: 'Smith',
      nationality: country,
      ownershipPercentage: 60,
      controlType: 'DIRECT',
      isPep: false,
    },
    {
      firstName: 'Jane',
      lastName: 'Doe',
      nationality: country,
      ownershipPercentage: 40,
      controlType: 'DIRECT',
      isPep: false,
    },
  ];
}
