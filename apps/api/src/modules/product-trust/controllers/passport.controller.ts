import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@eurocomply/database';
import { ApiError } from '../../../common/middleware/errorHandler.js';
import { gs1Service } from '../services/gs1.service.js';
import { qrService } from '../services/qr.service.js';
import { DppDataSchema } from '@eurocomply/shared';

// Validation schemas
const CreatePassportSchema = z.object({
  productId: z.string(),
  data: DppDataSchema,
});

const UpdatePassportSchema = z.object({
  data: DppDataSchema.partial(),
});

const ListQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  pageSize: z.coerce.number().positive().max(100).default(20),
  productId: z.string().optional(),
});

export const passportController = {
  /**
   * Create a new Digital Product Passport
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = CreatePassportSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      // Verify product belongs to organization
      const product = await prisma.product.findFirst({
        where: { id: body.productId, organizationId },
      });

      if (!product) {
        throw ApiError.notFound('Product');
      }

      // Create passport with DPP data
      const passport = await prisma.passport.create({
        data: {
          productId: body.productId,
          data: body.data,
          version: '1.0',
        },
        include: {
          product: {
            select: { name: true, gtin: true, sku: true },
          },
        },
      });

      // Generate verification URL
      const verificationUrl = gs1Service.generateDppQrPayload(passport.id);

      // Update with verification URL
      const updatedPassport = await prisma.passport.update({
        where: { id: passport.id },
        data: { verificationUrl },
        include: {
          product: {
            select: { name: true, gtin: true, sku: true },
          },
        },
      });

      res.status(201).json({
        success: true,
        data: updatedPassport,
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
   * List passports with pagination
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = ListQuerySchema.parse(req.query);
      const organizationId = req.auth!.organizationId;

      // Build where clause - need to filter by organization through product
      const where = {
        product: {
          organizationId,
        },
        ...(query.productId && { productId: query.productId }),
      };

      const [passports, total] = await Promise.all([
        prisma.passport.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            product: {
              select: { name: true, gtin: true, sku: true },
            },
          },
        }),
        prisma.passport.count({ where }),
      ]);

      res.json({
        success: true,
        data: passports,
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
   * Get a single passport
   */
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      const passport = await prisma.passport.findFirst({
        where: {
          id,
          product: { organizationId },
        },
        include: {
          product: true,
        },
      });

      if (!passport) {
        throw ApiError.notFound('Passport');
      }

      res.json({
        success: true,
        data: passport,
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
   * Update a passport
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const body = UpdatePassportSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      // Verify passport exists and belongs to org
      const existing = await prisma.passport.findFirst({
        where: {
          id,
          product: { organizationId },
        },
      });

      if (!existing) {
        throw ApiError.notFound('Passport');
      }

      // Merge existing data with updates
      const mergedData = {
        ...(existing.data as object),
        ...body.data,
      };

      const passport = await prisma.passport.update({
        where: { id },
        data: {
          data: mergedData,
          version: incrementVersion(existing.version),
        },
        include: {
          product: {
            select: { name: true, gtin: true, sku: true },
          },
        },
      });

      res.json({
        success: true,
        data: passport,
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
   * Generate QR code for a passport
   */
  async generateQr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      // Verify passport exists and belongs to org
      const passport = await prisma.passport.findFirst({
        where: {
          id,
          product: { organizationId },
        },
        include: {
          product: true,
        },
      });

      if (!passport) {
        throw ApiError.notFound('Passport');
      }

      // Generate QR code
      const qrPayload = passport.verificationUrl || gs1Service.generateDppQrPayload(id);
      const qrCodeDataUrl = await qrService.generate(qrPayload);

      // Update passport with QR data
      const updated = await prisma.passport.update({
        where: { id },
        data: {
          qrCodeData: qrPayload,
          qrCodeUrl: qrCodeDataUrl,
        },
      });

      res.json({
        success: true,
        data: {
          qrCodeUrl: updated.qrCodeUrl,
          qrCodeData: updated.qrCodeData,
          verificationUrl: passport.verificationUrl,
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
   * Anchor passport to blockchain (creates hash-based anchor)
   */
  async anchor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      // Verify passport exists and belongs to org
      const passport = await prisma.passport.findFirst({
        where: {
          id,
          product: { organizationId },
        },
      });

      if (!passport) {
        throw ApiError.notFound('Passport');
      }

      if (passport.anchorStatus === 'ANCHORED') {
        throw ApiError.conflict('Passport is already anchored');
      }

      // Update status to pending
      await prisma.passport.update({
        where: { id },
        data: { anchorStatus: 'PENDING' },
      });

      // In production, this would call walt.id to create a VC and anchor
      // For now, we simulate the anchoring process
      // TODO: Implement actual walt.id integration

      // Simulate hash-based anchoring
      const dataHash = createHash(JSON.stringify(passport.data));
      const txHash = `0x${dataHash.substring(0, 64)}`; // Simulated tx hash

      const updated = await prisma.passport.update({
        where: { id },
        data: {
          anchorStatus: 'ANCHORED',
          anchorTxHash: txHash,
          anchoredAt: new Date(),
        },
      });

      res.json({
        success: true,
        data: {
          anchorStatus: updated.anchorStatus,
          anchorTxHash: updated.anchorTxHash,
          anchoredAt: updated.anchoredAt,
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
 * Increment version string (e.g., "1.0" -> "1.1")
 */
function incrementVersion(version: string): string {
  const parts = version.split('.');
  const minor = parseInt(parts[1] || '0', 10) + 1;
  return `${parts[0]}.${minor}`;
}

/**
 * Create a simple hash for anchoring
 */
function createHash(data: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
}
