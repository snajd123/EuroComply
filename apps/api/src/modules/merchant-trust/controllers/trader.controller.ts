import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, DsaStatus } from '@eurocomply/database';
import { ApiError } from '../../../common/middleware/errorHandler.js';
import { merchantIdentityService } from '../services/identity.service.js';
import { logger } from '../../../common/utils/logger.js';

// Validation schemas
const CreateTraderSchema = z.object({
  legalName: z.string().min(1),
  tradingName: z.string().optional(),
  registrationNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  country: z.string().length(2),
  address: z
    .object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      postalCode: z.string(),
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

const UpdateTraderSchema = CreateTraderSchema.partial();

const ListQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  pageSize: z.coerce.number().positive().max(100).default(20),
  dsaStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLIANT', 'NON_COMPLIANT']).optional(),
  kybStatus: z.enum(['PENDING', 'IN_PROGRESS', 'VERIFIED', 'FAILED', 'REQUIRES_REVIEW']).optional(),
});

export const traderController = {
  /**
   * Create a new trader (for DSA compliance)
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = CreateTraderSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      const traderSlug = body.legalName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .substring(0, 50);

      // Create merchant record first
      const merchant = await prisma.merchant.create({
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
          dsaStatus: 'IN_PROGRESS',
        },
      });

      // Initialize DID with real cryptographic key pair
      const merchantSlug = `${org?.slug}-trader-${traderSlug}`;
      try {
        await merchantIdentityService.initializeMerchantDid(merchant.id, merchantSlug);
      } catch (error) {
        logger.warn('Failed to initialize merchant DID, continuing without it', {
          merchantId: merchant.id,
          error,
        });
      }

      // Refetch merchant with DID info
      const updatedMerchant = await prisma.merchant.findUnique({
        where: { id: merchant.id },
      });

      res.status(201).json({
        success: true,
        data: formatTraderResponse(updatedMerchant || merchant),
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
   * List traders
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = ListQuerySchema.parse(req.query);
      const organizationId = req.auth!.organizationId;

      const where = {
        organizationId,
        ...(query.dsaStatus && { dsaStatus: query.dsaStatus as DsaStatus }),
        ...(query.kybStatus && { kybStatus: query.kybStatus }),
      };

      const [merchants, total] = await Promise.all([
        prisma.merchant.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.merchant.count({ where }),
      ]);

      res.json({
        success: true,
        data: merchants.map(formatTraderResponse),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems: total,
          totalPages: Math.ceil(total / query.pageSize),
          hasMore: query.page * query.pageSize < total,
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
   * Get a single trader
   */
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      const merchant = await prisma.merchant.findFirst({
        where: { id, organizationId },
      });

      if (!merchant) {
        throw ApiError.notFound('Trader');
      }

      res.json({
        success: true,
        data: formatTraderResponse(merchant),
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
   * Update a trader
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const body = UpdateTraderSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      const existing = await prisma.merchant.findFirst({
        where: { id, organizationId },
      });

      if (!existing) {
        throw ApiError.notFound('Trader');
      }

      const merchant = await prisma.merchant.update({
        where: { id },
        data: {
          ...(body.legalName && { legalName: body.legalName }),
          ...(body.tradingName && { tradingName: body.tradingName }),
          ...(body.registrationNumber && { registrationNumber: body.registrationNumber }),
          ...(body.vatNumber && { vatNumber: body.vatNumber }),
          ...(body.country && { country: body.country }),
          ...(body.address && {
            addressLine1: body.address.line1,
            addressLine2: body.address.line2,
            city: body.address.city,
            postalCode: body.address.postalCode,
          }),
          ...(body.contact && {
            email: body.contact.email,
            phone: body.contact.phone,
            website: body.contact.website,
          }),
        },
      });

      res.json({
        success: true,
        data: formatTraderResponse(merchant),
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
   * Get DSA compliance status for a trader
   */
  async getCompliance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      const merchant = await prisma.merchant.findFirst({
        where: { id, organizationId },
        include: {
          kybVerifications: {
            where: { status: 'VERIFIED' },
          },
          complianceDocuments: {
            where: { status: 'APPROVED' },
          },
        },
      });

      if (!merchant) {
        throw ApiError.notFound('Trader');
      }

      // Calculate DSA compliance checklist
      const checks = {
        identityVerified: merchant.kybStatus === 'VERIFIED',
        vatValidated: merchant.kybVerifications.some((v) => v.type === 'VAT_VALIDATION'),
        addressVerified: merchant.kybVerifications.some((v) => v.type === 'ADDRESS_VERIFICATION'),
        documentsUploaded: merchant.complianceDocuments.length > 0,
        sanctionsCleared: merchant.riskLevel !== 'CRITICAL',
        profilePublic: merchant.traderProfilePublic,
      };

      const completedChecks = Object.values(checks).filter(Boolean).length;
      const totalChecks = Object.keys(checks).length;
      const complianceScore = Math.round((completedChecks / totalChecks) * 100);

      // Update DSA status based on compliance
      let dsaStatus: DsaStatus = 'IN_PROGRESS';
      if (complianceScore === 100) {
        dsaStatus = 'COMPLIANT';
      } else if (complianceScore === 0) {
        dsaStatus = 'NOT_STARTED';
      }

      // Update merchant if status changed
      if (merchant.dsaStatus !== dsaStatus) {
        await prisma.merchant.update({
          where: { id },
          data: {
            dsaStatus,
            dsaCompletedAt: dsaStatus === 'COMPLIANT' ? new Date() : null,
          },
        });
      }

      res.json({
        success: true,
        data: {
          traderId: merchant.id,
          legalName: merchant.legalName,
          dsaStatus,
          complianceScore,
          checks,
          publicProfile: merchant.traderProfilePublic
            ? {
                legalName: merchant.legalName,
                tradingName: merchant.tradingName,
                country: merchant.country,
                vatNumber: merchant.vatNumber,
                registrationNumber: merchant.registrationNumber,
                email: merchant.email,
              }
            : null,
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
 * Format merchant as trader response
 */
function formatTraderResponse(merchant: {
  id: string;
  legalName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  country: string | null;
  did: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  kybStatus: string;
  dsaStatus: string;
  riskScore: number | null;
  riskLevel: string | null;
  createdAt: Date;
}) {
  return {
    id: merchant.id,
    legalName: merchant.legalName,
    tradingName: merchant.tradingName,
    registrationNumber: merchant.registrationNumber,
    vatNumber: merchant.vatNumber,
    country: merchant.country,
    did: merchant.did,
    address: merchant.addressLine1
      ? {
          line1: merchant.addressLine1,
          line2: merchant.addressLine2,
          city: merchant.city,
          postalCode: merchant.postalCode,
        }
      : null,
    contact: {
      email: merchant.email,
      phone: merchant.phone,
      website: merchant.website,
    },
    kybStatus: merchant.kybStatus,
    dsaStatus: merchant.dsaStatus,
    risk: {
      score: merchant.riskScore,
      level: merchant.riskLevel,
    },
    createdAt: merchant.createdAt,
  };
}
